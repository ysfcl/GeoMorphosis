"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sun, Moon, Send, Info, Bell, Mail, Monitor, X } from 'lucide-react';
import Map from '@/components/Map';
import Toast from '@/components/Toast';
import { getUserId } from '@/lib/userId';
import { MAX_SELECTION_AREA_KM2 } from '@/lib/mapLimits';

const POLL_INTERVAL_MS = 3000;

function resolveCoordinates(region) {
  if (!region) return null;

  if (typeof region.lat === 'number') {
    // Standart anahtar lon; eski payload'lar icin lng/longitude toleransı korunur.
    const lon = region.lon ?? region.lng;
    if (typeof lon === 'number') return { lat: region.lat, lon };
  }

  const coords = region.geoJson?.geometry?.coordinates?.[0]?.[0]
    ?? region.geometry?.coordinates?.[0]?.[0];

  if (Array.isArray(coords) && coords.length >= 2) {
    return { lat: coords[1], lon: coords[0] };
  }

  return null;
}

const RISK_LABELS = {
  yok: 'Yok',
  dusuk: 'Düşük',
  orta: 'Orta',
  yuksek: 'Yüksek',
};

export default function Home() {
  const router = useRouter();

  const [selectedRegion, setSelectedRegion] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [toast, setToast] = useState(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // --- BİLDİRİM FORMU STATELERİ ---
  const [isNotifModalOpen, setIsNotifModalOpen] = useState(false);
  const [notifEmail, setNotifEmail] = useState('');
  const [webPushStatus, setWebPushStatus] = useState(false);

  const pollRef = useRef(null);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollInFlightRef.current = false;
  };

  const startPolling = (id, coordinates) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      // Bir durum isteği henüz tamamlanmadıysa paralel bir istek açmayalım.
      // Aksi halde biten görev için Telegram raporu birden fazla kez tetiklenebilir.
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;

      try {
        const res = await fetch(`/api/analyze?task_id=${id}&user_id=${getUserId()}&lat=${coordinates.lat}&lon=${coordinates.lon}`);
        const statusData = await res.json();

        if (statusData.status === 'completed') {
          stopPolling();
          setAnalysisResult(statusData.result || statusData);
          setLoading(false);
          setToast({ type: 'success', title: 'Analiz Tamamlandı', message: 'Bölge analizi başarıyla sonuçlandı.' });
        } else if (statusData.status === 'failed') {
          stopPolling();
          setLoading(false);
          setToast({ type: 'danger', title: 'Analiz Hatası', message: statusData.error || 'Analiz tamamlanamadı.' });
        }
      } catch (err) {
        console.error('Durum sorgulama hatası:', err);
        stopPolling();
      } finally {
        pollInFlightRef.current = false;
      }
    }, POLL_INTERVAL_MS);
  };

  const handleAnalyze = async () => {
    if (!selectedRegion || loading) return;
    const coordinates = resolveCoordinates(selectedRegion);
    if (!coordinates) {
      setToast({ type: 'danger', title: 'Geçersiz Bölge', message: 'Seçilen bölgeden koordinat okunamadı.' });
      return;
    }

    setLoading(true);
    setAnalysisResult(null);
    setTaskId(null);
    setToast({ type: 'info', title: 'Analiz Başlatıldı', message: 'Seçilen bölge için uydu verileri işleniyor...' });

    try {
      const payload = {
        start_points: [coordinates],
        end_points: [],
        buffer_meters: selectedRegion.radius || 1000,
        user_id: getUserId(),
        // DÜZELTME: Haritadan gelen bbox verisini api'ye taşıyoruz
        bbox: selectedRegion.bbox || null,
      };

      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP hatası! Durum: ${res.status}`);
      const data = await res.json();
      if (!data.task_id) throw new Error('Görev numarası (task_id) alınamadı');
      setTaskId(data.task_id);
      startPolling(data.task_id, coordinates);
    } catch (err) {
      console.error('Analiz hatası:', err);
      setLoading(false);
      setToast({ type: 'danger', title: 'Analiz Hatası', message: 'Veriler işlenirken bir sorun oluştu.' });
    }
  };

  const handleDetail = () => {
    const coordinates = resolveCoordinates(selectedRegion);
    if (!coordinates) return;
    const params = new URLSearchParams({ lat: String(coordinates.lat), lon: String(coordinates.lon) });
    if (taskId) params.set('task_id', taskId);
    router.push(`/region?${params.toString()}`);
  };

  // --- YENİ EKLENEN: E-POSTAYI ARKA PLANA (API'YE) GÖNDERME FONKSİYONU ---
  const handleEmailSave = async () => {
    if (!notifEmail || !notifEmail.includes('@')) {
      setToast({ type: 'warning', title: 'Eksik Bilgi', message: 'Lütfen geçerli bir e-posta adresi girin.' });
      return;
    }

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: notifEmail, 
          user_id: getUserId(),
          notification_type: 'email' 
        }),
      });

      if (res.ok) {
        setToast({ type: 'success', title: 'Bağlantı Başarılı', message: 'E-posta adresiniz sisteme başarıyla kaydedildi.' });
      } else {
        setToast({ type: 'danger', title: 'Hata', message: 'Sisteme kaydedilirken bir sorun oluştu.' });
      }
    } catch (err) {
      console.error('E-posta kayıt hatası:', err);
      setToast({ type: 'danger', title: 'Bağlantı Hatası', message: 'Sunucuya ulaşılamadı.' });
    }
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-gray-100 dark:bg-gray-900 transition-colors duration-300">
      <div className="absolute inset-0 z-0">
        <Map onRegionSelect={setSelectedRegion} isDarkMode={isDarkMode} />
      </div>

      <nav className="absolute top-0 left-0 right-0 z-[1000] h-20 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-sm border-b border-gray-200 dark:border-gray-800 transition-colors duration-300">
        <div className="h-full px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-md">{/*<span className="text-white text-2xl font-bold">G</span>*/}<img src="logo.png" alt="Logo" className="w-full h-full object-contain" /></div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">GeoMorphosis</h1>
              <p className="text-lg text-gray-500 dark:text-gray-400 hidden sm:block">Çevresel İzleme Platformu</p>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            <p className="text-xl text-gray-500 dark:text-gray-400 hidden lg:block pr-4">Uydu Analiz Sistemi</p>

            <button
              onClick={() => setIsAboutOpen(true)}
              className="flex items-center gap-2 p-2.5 rounded-full md:rounded-xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-800/50 transition shadow-sm border border-purple-100 dark:border-purple-800"
              title="Hakkımızda"
            >
              <Info size={20} />
              <span className="hidden md:block text-sm font-bold pr-1">Hakkımızda</span>
            </button>

            <button
              onClick={() => setIsNotifModalOpen(true)}
              className="flex items-center gap-2 p-2.5 rounded-full md:rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-800/50 transition shadow-sm border border-blue-100 dark:border-blue-800"
              title="İletişim Tercihleri"
            >
              <Bell size={20} />
              <span className="hidden md:block text-sm font-bold pr-1">Bildirimler</span>
            </button>

            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-yellow-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition shadow-sm"
              title={isDarkMode ? 'Gündüz Moduna Geç' : 'Gece Moduna Geç'}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <button
              onClick={() => setPanelOpen((prev) => !prev)}
              className="bg-gray-900 dark:bg-gray-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-black dark:hover:bg-gray-600 transition"
            >
              {panelOpen ? 'Gizle' : 'Göster'}
            </button>
          </div>
        </div>
      </nav>

      {panelOpen && (
        <div className="absolute top-28 right-4 z-[1000] w-full max-w-sm max-h-[calc(100vh-8rem)] overflow-y-auto">
          <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-3xl shadow-2xl p-8 flex flex-col gap-6 transition-colors duration-300">
            <h2 className="text-3xl font-bold dark:text-white">Analizi Başlat</h2>

            {selectedRegion ? (
              <>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6">
                  <h3 className="text-xl font-semibold mb-4 dark:text-white">Seçilen Alan / Koordinatlar</h3>
                  
                  {/* Yeni şık koordinat görünümü */}
                  {resolveCoordinates(selectedRegion) && (
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                        <span className="text-gray-500 dark:text-gray-400 font-medium text-sm">Enlem (Lat)</span>
                        <span className="font-bold text-gray-800 dark:text-gray-100 font-mono text-sm">
                          {resolveCoordinates(selectedRegion).lat.toFixed(6)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                        <span className="text-gray-500 dark:text-gray-400 font-medium text-sm">Boylam (Lon)</span>
                        <span className="font-bold text-gray-800 dark:text-gray-100 font-mono text-sm">
                          {resolveCoordinates(selectedRegion).lon.toFixed(6)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Secilen alani ve izinli maksimum siniri goster */}
                  {typeof selectedRegion.area_sq_meters === 'number' && (
                    <div className="mt-3 bg-white dark:bg-gray-800 p-3 rounded-xl border border-blue-100 dark:border-blue-900 shadow-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500 dark:text-gray-400 font-medium text-sm">Seçilen Alan</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400 font-mono text-sm">
                          {(selectedRegion.area_sq_meters / 1000000).toFixed(2)} km²
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-gray-400 dark:text-gray-500 text-xs">Maksimum</span>
                        <span className="text-gray-400 dark:text-gray-500 font-mono text-xs">
                          {MAX_SELECTION_AREA_KM2} km²
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min(100, (selectedRegion.area_sq_meters / (selectedRegion.max_area_sq_meters || 25000000)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button onClick={handleAnalyze} disabled={loading} className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 transition">Analiz Başlat</button>
                  <button onClick={handleDetail} className="flex-1 bg-gray-200 dark:bg-gray-700 dark:text-white rounded-xl py-3 font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition">Detay</button>
                </div>
              </>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">Harita üzerinde bir bölge seçin veya çizin.</p>
            )}
          </div>
        </div>
      )}

      {isNotifModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700">
            
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <Bell className="text-blue-600 dark:text-blue-400" size={24} />
                İletişim Tercihlerinizi Belirleyin
              </h3>
              <button onClick={() => setIsNotifModalOpen(false)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2 mb-4">
                Bölgenizdeki çevresel analizlerden ve erken uyarılardan anında haberdar olmak için bildirim kanallarınızı seçin.
              </p>

              {/* 1. E-Posta Formu (API'ye bağlandı) */}
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
                  <Mail size={16} /> E-Posta Bildirimleri
                </label>
                <div className="flex gap-2">
                  <input 
                    type="email" 
                    value={notifEmail} 
                    onChange={e => setNotifEmail(e.target.value)} 
                    placeholder="ornek@email.com" 
                    className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500 dark:text-white transition" 
                  />
                  <button 
                    onClick={handleEmailSave} 
                    className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition"
                  >
                    Kaydet
                  </button>
                </div>
              </div>

              {/* 2. Telegram Formu */}
              <div className="border-t border-gray-100 dark:border-gray-700 pt-6">
                 <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
                   <Send size={16} /> Telegram Entegrasyonu
                 </label>
                 <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                   Bölgenizdeki risk durumlarını anlık Telegram mesajı olarak almak için botu başlatın.
                 </p>
                 <button 
                   onClick={() => {
                     const userId = getUserId();
                     window.open(`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}?start=${userId}`, '_blank');
                   }} 
                   className="w-full bg-[#0088cc] text-white py-3 rounded-xl text-sm font-bold hover:bg-[#0077b3] transition flex items-center justify-center gap-2 shadow-md"
                 >
                   <Send size={18} /> Telegram Botuna Bağlan
                 </button>
              </div>

              {/* 3. WebPush Formu */}
              <div className="border-t border-gray-100 dark:border-gray-700 pt-6 flex items-center justify-between">
                 <div>
                   <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200">
                     <Monitor size={16} /> Tarayıcı (WebPush)
                   </label>
                   <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Platform açıkken ekranda anlık uyarı alın.</p>
                 </div>
                 <button 
                   onClick={() => {
                     setWebPushStatus(!webPushStatus);
                     setToast({type:'info', title:'WebPush', message: !webPushStatus ? 'Tarayıcı bildirimleri açıldı.' : 'Tarayıcı bildirimleri kapatıldı.'});
                   }} 
                   className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${webPushStatus ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                 >
                   <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${webPushStatus ? 'translate-x-6' : 'translate-x-1'}`} />
                 </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {loading && taskId && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[1000] w-full max-w-md">
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-5">
            <p className="text-blue-700 dark:text-blue-400 font-semibold animate-pulse">Yapay zekâ bölgeyi işliyor...</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-2 break-all">Fiş No: {taskId}</p>
          </div>
        </div>
      )}

      {analysisResult && (
        <div className="absolute bottom-8 right-4 z-[1000] w-full max-w-sm">
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-2xl p-5">
            <h3 className="font-bold text-green-700 dark:text-green-400 text-lg">✓ Analiz tamamlandı</h3>
            <div className="mt-3 space-y-2 text-gray-700 dark:text-gray-200">
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">NDVI skoru</span><span className="font-semibold">{analysisResult.ndvi_score}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Ormansızlaşma</span><span className="font-semibold">{RISK_LABELS[analysisResult.deforestation_risk] ?? '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Kirlilik</span><span className="font-semibold">{RISK_LABELS[analysisResult.pollution_level] ?? '-'}</span></div>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </main>
  );
}