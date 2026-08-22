'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import Analytics from '@/components/Analytics';
import Report from '@/components/Report';
import { Mail, Send } from 'lucide-react';
import { getUserId } from '@/lib/userId';

function RegionContent() {
  const searchParams = useSearchParams();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const aiLayerGroupRef = useRef(null); // Çakışmaları önlemek için yeni katman referansı
  // Aynı bölge için ikinci kez iş emri vermemek üzere son istenen anahtar.
  // React StrictMode geliştirme modunda effect'i iki kez çalıştırıyor ve her
  // çalıştırma bir uydu indirme + YOLO turu maliyetinde.
  const requestedKeyRef = useRef(null);

  const [regionData, setRegionData] = useState(null);
  const [activeTab, setActiveTab] = useState('map');
  const [analysisStatus, setAnalysisStatus] = useState('loading'); // 'loading' | 'processing' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);

  // --- Bildirim kanallari (Faz 2-3) ---
  // mail akisi: form -> kod dogrulama -> tamamlandi
  const [mailFormOpen, setMailFormOpen] = useState(false);
  const [notifStage, setNotifStage] = useState('idle'); // idle | code | verified
  const [notifEmail, setNotifEmail] = useState('');
  const [notifCode, setNotifCode] = useState('');
  const [notifDevCode, setNotifDevCode] = useState(null);
  const [notifMessage, setNotifMessage] = useState('');
  const [notifBusy, setNotifBusy] = useState(false);

  const lat = parseFloat(searchParams.get('lat')) || 0;
  const lon = parseFloat(searchParams.get('lon')) || 0;
  // Ana sayfa analizi zaten başlattıysa fişi bize taşır; aynı bölgeyi
  // (uydu indirme + YOLO) ikinci kez analiz etmemek için bunu kullanıyoruz.
  const existingTaskId = searchParams.get('task_id');

  // --- VEZNE-MUTFAK (POLLING) MANTIĞI BURADA ---
  useEffect(() => {
    if (!lat || !lon) return;

    const pollRef = { current: null };
    let cancelled = false;

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    // Mutfaktan (Redis) yemeğin durumunu kontrol et (Polling)
    const startPolling = (taskId) => {
      setAnalysisStatus('processing');

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/analyze?task_id=${taskId}&user_id=${getUserId()}&lat=${lat}&lon=${lon}`);
          const statusData = await statusRes.json();

          if (cancelled) return;

          if (statusData.status === 'completed') {
            stopPolling(); // İş bitti, sormayı bırak
            setRegionData(statusData.result); // Analytics.js'i besleyecek veriyi state'e yaz
            setAnalysisStatus('success');
          } else if (statusData.status === 'failed') {
            stopPolling();
            setErrorMessage(statusData.error || null);
            setAnalysisStatus('error');
          }
        } catch (err) {
          console.error('Durum sorgulanamadı:', err);
          stopPolling();
          setAnalysisStatus('error');
        }
      }, 3000); // Her 3 saniyede bir kontrol et
    };

    // Vezneye (FastAPI) iş emrini ver (POST)
    // Backend'in beklediği start_points listesine haritadaki lat/lon'u gönderiyoruz
    const requestAnalysis = async () => {
      const postRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_points: [{ lat, lon }],
          end_points: [], // Eğer bitiş noktası yoksa boş liste
          buffer_meters: 1000
        })
      });

      const postData = await postRes.json();
      return postData.task_id;
    };

    const fetchRegion = async () => {
      try {
        setAnalysisStatus('loading');

        // Hazır bir fiş varsa yeni iş emri verme, doğrudan sorgulamaya geç
        if (existingTaskId) {
          startPolling(existingTaskId);
          return;
        }

        // Aynı bölge için tek bir iş emri. StrictMode effect'i iki kez
        // çalıştırdığında ikinci çağrı yeni POST atmak yerine ilkinin
        // promise'ini bekleyip aynı fişle sorgulamaya başlıyor.
        const requestKey = `${lat},${lon}`;

        if (requestedKeyRef.current?.key !== requestKey) {
          requestedKeyRef.current = { key: requestKey, promise: requestAnalysis() };
        }

        const taskId = await requestedKeyRef.current.promise;

        if (!taskId) throw new Error('Task ID alınamadı');
        if (cancelled) return;

        startPolling(taskId);
      } catch (err) {
        console.error('Veri yüklenemedi:', err);
        setAnalysisStatus('error');
      }
    };

    fetchRegion();

    // Component kapandığında interval'i temizle (Memory Leak önlemi)
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [lat, lon, existingTaskId]);

  // --- BILDIRIM KANALI AKISI (Faz 2-3) ---
  const handleSubscribeEmail = async () => {
    setNotifBusy(true);
    setNotifMessage('');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: notifEmail, user_id: getUserId() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Kayıt başarısız oldu.');
      }
      setNotifDevCode(data.devCode || null);
      setNotifStage('code');
      setNotifMessage(data.message);
    } catch (err) {
      setNotifMessage(err.message);
    } finally {
      setNotifBusy(false);
    }
  };

  const handleVerifyEmail = async () => {
    setNotifBusy(true);
    setNotifMessage('');
    try {
      const res = await fetch('/api/notify/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: getUserId(), code: notifCode }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Doğrulama başarısız oldu.');
      }
      setNotifStage('verified');
      setNotifMessage(data.message);
    } catch (err) {
      setNotifMessage(err.message);
    } finally {
      setNotifBusy(false);
    }
  };

  // Telegram eslestirmesi deep-link ile: kullanici bota ?start=<userId> ile
  // baslar, webhook chat_id'yi regions_analysis tablosuna yazar.
  const handleConnectTelegram = () => {
    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
    if (!botUsername || botUsername.includes('your_bot')) return;
    window.open(
      `https://t.me/${botUsername}?start=${getUserId()}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const telegramConfigured =
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME &&
    !process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME.includes('your_bot');


  // --- HARİTA VE OVERLAP DÜZELTMESİ ---
  const initMap = useCallback(async () => {
    if (!mapRef.current || mapInstanceRef.current) return;
    if (!lat || !lon || isNaN(lat) || isNaN(lon)) return;

    const L = (await import('leaflet')).default;
    await import('leaflet/dist/leaflet.css');

    delete L.Icon.Default.prototype._getIconUrl;

    L.Icon.Default.mergeOptions({
      iconUrl: '/marker-icon.png',
      iconRetinaUrl: '/marker-icon-2x.png',
      shadowUrl: '/marker-shadow.png',
    });

    const map = L.map(mapRef.current, {
      center: [lat, lon],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Esri World Imagery',
        maxZoom: 18,
      }
    ).addTo(map);

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '&copy; OpenStreetMap',
        opacity: 0.3,
      }
    ).addTo(map);

    L.circle([lat, lon], {
      radius: 1000,
      color: '#22c55e',
      fillColor: '#22c55e',
      fillOpacity: 0.15,
      weight: 2,
    }).addTo(map);

    L.marker([lat, lon])
      .addTo(map)
      .bindPopup(`Enlem: ${lat}<br>Boylam: ${lon}`)
      .openPopup();

    // YENİ: AI noktalarını tutacak boş bir katman grubu oluştur
    aiLayerGroupRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
  }, [lat, lon]);

  // Yeni yapay zeka verisi geldiğinde haritayı güncelleme mantığı
  useEffect(() => {
    if (regionData && mapInstanceRef.current && aiLayerGroupRef.current) {
      const L = window.L; // Leaflet yüklenmiş kabul ediyoruz
      
      // ÖNEMLİ: Çakışmayı (Overlap) önlemek için eski AI noktalarını temizle
      aiLayerGroupRef.current.clearLayers();

      // Örnek: regionData içinden gelen yeni noktaları haritaya basma
      // (Eğer backend 'generated_path' veya benzeri bir dizi döndürüyorsa)
      if (regionData.generated_path) {
        regionData.generated_path.forEach(point => {
           L.circleMarker([point.lat, point.lon ?? point.lng], {
             color: 'red',
             radius: 5
           }).addTo(aiLayerGroupRef.current);
        });
      }
    }
  }, [regionData]);

  // Sekme değiştirildiğinde haritayı initialize et
  useEffect(() => {
    if (activeTab !== 'map') return;

    const timer = setTimeout(() => {
      initMap();
    }, 200);

    return () => {
      clearTimeout(timer);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        aiLayerGroupRef.current = null; // Katman referansını da sıfırla
      }
    };
  }, [activeTab, initMap]);


  // --- TASARIM (JSX) KISMI BİREBİR AYNI ---
  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <a
            href="/"
            className="text-primary-600 hover:underline text-sm"
          >
            ← Ana Sayfaya Don
          </a>

          <h1 className="text-xl font-bold text-gray-800 mt-1">
            Bolge Detay
          </h1>

          <p className="text-sm text-gray-500">
            Enlem: {lat} | Boylam: {lon}
          </p>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('map')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'map'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            Uydu Goruntusu
          </button>

          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'analysis'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            Analiz Sonuclari
          </button>
        </div>

        {activeTab === 'map' && (
          <div className="card p-0 overflow-hidden">
            <div
              ref={mapRef}
              style={{
                height: '600px',
                width: '100%',
              }}
            />
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="card">
            {analysisStatus === 'loading' && (
              <p className="text-gray-500">FastAPI&apos;ye bağlanılıyor...</p>
            )}
            {analysisStatus === 'processing' && (
              <p className="text-blue-500 font-semibold animate-pulse">Yapay zeka verileri işliyor, lütfen bekleyin...</p>
            )}
            {analysisStatus === 'error' && (
              <p className="text-red-500">
                {errorMessage
                  ? `Analiz sırasında bir hata oluştu: ${errorMessage}`
                  : 'Analiz sırasında bir hata oluştu.'}
              </p>
            )}
            {analysisStatus === 'success' && regionData && (
              <>
                <Analytics data={regionData} />
                <div className="mt-6">
                  <Report data={regionData} />
                </div>

                {/* Bildirim kanallari (Faz 2-3): e-posta dogrulamali abonelik,
                    Telegram bot eslestirmesi. */}
                <div className="mt-6 border border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold">Bildirim Kanalları</h3>
                    {notifStage === 'verified' && (
                      <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                        E-posta doğrulandı
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                    Analiz tamamlandığında sonucu e-posta veya Telegram ile alın.
                  </p>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setMailFormOpen((open) => !open)}
                      disabled={notifStage === 'verified'}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Mail size={16} />
                      {mailFormOpen ? 'E-posta Formunu Kapat' : 'E-posta ile Gönder'}
                    </button>
                    <button
                      type="button"
                      onClick={handleConnectTelegram}
                      title={
                        telegramConfigured
                          ? 'Telegram botu ile hesabınızı eşleştirin'
                          : '.env dosyasına NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ekleyin'
                      }
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!telegramConfigured}
                    >
                      <Send size={16} />
                      Telegram ile Gönder
                    </button>
                  </div>

                  {mailFormOpen && notifStage !== 'verified' && (
                    <div className="mt-4 border border-gray-200 rounded-md p-4 bg-gray-50 space-y-3">
                      {notifStage === 'idle' && (
                        <>
                          <label className="block text-xs font-medium text-gray-600" htmlFor="notif-email">
                            Raporların gönderileceği e-posta adresi
                          </label>
                          <input
                            id="notif-email"
                            type="email"
                            value={notifEmail}
                            onChange={(e) => setNotifEmail(e.target.value)}
                            placeholder="ornek@eposta.com"
                            className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={handleSubscribeEmail}
                            disabled={notifBusy || !notifEmail}
                            className="block px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                          >
                            {notifBusy ? 'Kaydediliyor...' : 'Doğrulama Kodu Gönder'}
                          </button>
                        </>
                      )}

                      {notifStage === 'code' && (
                        <>
                          <p className="text-xs text-gray-600">
                            <strong>{notifEmail}</strong> adresine gönderilen 6 haneli kodu girin.
                          </p>
                          {notifDevCode && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 w-fit">
                              SMTP yapılandırılmadığı için kod burada gösteriliyor:{' '}
                              <strong>{notifDevCode}</strong>
                            </p>
                          )}
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={notifCode}
                            onChange={(e) => setNotifCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="______"
                            className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyEmail}
                            disabled={notifBusy || notifCode.length !== 6}
                            className="block px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                          >
                            {notifBusy ? 'Doğrulanıyor...' : 'Kodu Doğrula'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {notifMessage && (
                    <p className="text-xs text-gray-500 mt-3">{notifMessage}</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className="card">
          <h3 className="font-semibold mb-3">
            Bolge Bilgileri
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Enlem</p>
              <p className="font-medium">{lat}</p>
            </div>

            <div>
              <p className="text-gray-500">Boylam</p>
              <p className="font-medium">{lon}</p>
            </div>

            <div>
              <p className="text-gray-500">Tampon Alan</p>
              <p className="font-medium">1 km</p>
            </div>

            <div>
              <p className="text-gray-500">
                Harita Kaynagi
              </p>
              <p className="font-medium">
                Esri World Imagery
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function RegionDetail() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <div className="text-gray-500">
            Yukleniyor...
          </div>
        </main>
      }
    >
      <RegionContent />
    </Suspense>
  );
}