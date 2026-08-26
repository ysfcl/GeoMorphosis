"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sun, Moon, Send, Info, Bell, Mail, Monitor, X, Satellite, Zap, BarChart3, FileText, MapPin, BrainCircuit, BellRing } from 'lucide-react';
import Map from '@/components/Map';
import Toast from '@/components/Toast';
import { getUserId } from '@/lib/userId';
import { MAX_SELECTION_AREA_KM2 } from '@/lib/mapLimits';
import { saveLastReport, loadLastReport } from '@/lib/reportPayload';

const POLL_INTERVAL_MS = 3000;

// Analiz ozet kartindaki risk seviyeleri icin Turkce etiketler
const RISK_LABELS = {
  yok: 'Yok',
  normal: 'Normal',
  dusuk: 'Düşük',
  orta: 'Orta',
  yuksek: 'Yüksek',
};

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
  // Dogrulama akisi: kayit sonrasi 6 haneli kod girme adimi
  const [pendingVerify, setPendingVerify] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');

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
  // Dogrulama sonrasi "ilk raporu hemen gonder" icin son sonucu sakla
  saveLastReport(statusData.result || statusData);
  setToast({ type: 'success', title: 'Analiz Tamamlandı', message: 'Bölge analizi başarıyla sonuçlandı.' });

  // Analiz tamamlanınca otomatik olarak detay sayfasına yönlendir
  const params = new URLSearchParams({ lat: String(coordinates.lat), lon: String(coordinates.lon) });
  params.set('task_id', id);
  router.push(`/region?${params.toString()}`);
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

  // useCallback ile sabitliyoruz: aksi halde her render'da yeni bir
  // fonksiyon referansi olusur, Map component'indeki harita baslatma
  // useEffect'i buna bagimli oldugu icin harita surekli silinip yeniden
  // kurulur (cizilen sekil ve isi haritasi katmanlari kaybolur).
  const handleRegionSelect = useCallback((region) => {
    setSelectedRegion(region);
    // Yeni bir bolge cizildiginde onceki analiz sonucu artik gecersiz;
    // isi haritasinin eski bolgenin verisini gostermeye devam etmemesi
    // icin temizliyoruz.
    setAnalysisResult(null);
    setTaskId(null);
  }, []);

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

  // E-postayi /api/subscribe'a gonderir; SMTP calismiyorsa devCode ile
  // dogrulama adimina gecer, calisiyorsa kodun mailde oldugunu soyler.
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

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        if (data.devCode) {
          // Mail gitmediyse kodu ekranda gosterip dogrulama adimina gec
          setVerifyCode(String(data.devCode));
          setPendingVerify(true);
          setToast({ type: 'info', title: 'Doğrulama Gerekli', message: `SMTP ayarlanmadı; doğrulama kodun: ${data.devCode}` });
        } else {
          setPendingVerify(true);
          setVerifyCode('');
          setToast({ type: 'success', title: 'Kod Gönderildi', message: 'E-postana 6 haneli doğrulama kodu gönderildi.' });
        }
      } else {
        setToast({ type: 'danger', title: 'Hata', message: data.error || 'Sisteme kaydedilirken bir sorun oluştu.' });
      }
    } catch (err) {
      console.error('E-posta kayıt hatası:', err);
      setToast({ type: 'danger', title: 'Bağlantı Hatası', message: 'Sunucuya ulaşılamadı.' });
    }
  };

  // Dogrulama adimi: 6 haneli kod /api/verify'a gonderilir; yaninda son
  // analiz raporu da tasinir, boylece dogrulama bitince PDF hemen gider.
  const handleVerifyCode = async () => {
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: getUserId(), code: verifyCode, report: loadLastReport() }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setPendingVerify(false);
        setVerifyCode('');
        setNotifEmail('');
        setIsNotifModalOpen(false);
        setToast({
          type: data.emailSent ? 'success' : 'info',
          title: 'Doğrulandı ✓',
          message: data.message || 'Analiz raporları e-postanıza gönderilecek.',
        });
      } else {
        setToast({ type: 'danger', title: 'Hatalı Kod', message: data.error || 'Doğrulama kodu geçersiz.' });
      }
    } catch (err) {
      console.error('Dogrulama hatasi:', err);
      setToast({ type: 'danger', title: 'Bağlantı Hatası', message: 'Sunucuya ulaşılamadı.' });
    }
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-gray-100 dark:bg-gray-900 transition-colors duration-300">
      <div className="absolute inset-0 z-0">
        <Map
          onRegionSelect={handleRegionSelect}
          isDarkMode={isDarkMode}
          selectedRegion={selectedRegion}
          analysisResult={analysisResult}
        />
      </div>

      <nav className="absolute top-0 left-0 right-0 z-[1000] h-20 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-sm border-b border-gray-200 dark:border-gray-800 transition-colors duration-300">
        <div className="h-full px-3 sm:px-6 md:px-8 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 sm:gap-3 md:gap-4 group cursor-pointer decoration-transparent">
            <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3 group-active:scale-95">
              <img src="world.jpg" alt="Logo" className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white transition-colors duration-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">GeoMorphosis</h1>
              <p className="text-lg text-gray-500 dark:text-gray-400 hidden sm:block">Çevresel İzleme Platformu</p>
            </div>
          </a>

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
              className="bg-gray-900 dark:bg-gray-700 text-white px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold hover:bg-black dark:hover:bg-gray-600 transition"
            >
              {panelOpen ? 'Gizle' : 'Göster'}
            </button>
          </div>
        </div>
      </nav>

      {panelOpen && (
        <div className="absolute top-[4.5rem] left-3 right-3 sm:top-28 sm:right-4 sm:left-auto z-[1000] w-full sm:w-96 max-h-[calc(100vh-8rem)] overflow-y-auto">
          <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-3xl shadow-2xl p-5 sm:p-8 flex flex-col gap-4 sm:gap-6 transition-colors duration-300">
            <h2 className="text-xl sm:text-3xl font-bold dark:text-white">Analizi Başlat</h2>

            {selectedRegion ? (
              <>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-4 sm:p-6">
                  <h3 className="text-base sm:text-xl font-semibold mb-3 sm:mb-4 dark:text-white">Seçilen Alan / Koordinatlar</h3>
                  
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

                <div className="flex gap-2 sm:gap-3">
                  <button onClick={handleAnalyze} disabled={loading} className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm sm:py-3 sm:text-base font-semibold hover:bg-blue-700 transition">Analiz Başlat</button>
                  <button onClick={handleDetail} className="flex-1 bg-gray-200 dark:bg-gray-700 dark:text-white rounded-xl py-2.5 text-sm sm:py-3 sm:text-base font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition">Detay</button>
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
                {pendingVerify ? (
                  /* 2. ADIM: dogrulama kodu girisi */
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      <strong>{notifEmail}</strong> adresine gönderilen 6 haneli kodu gir.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={verifyCode}
                        onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="______"
                        className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-lg font-mono tracking-[0.4em] text-center outline-none focus:border-blue-500 dark:text-white transition"
                      />
                      <button
                        onClick={handleVerifyCode}
                        disabled={!verifyCode || verifyCode.length < 6}
                        className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-700 transition disabled:opacity-40"
                      >
                        Doğrula
                      </button>
                      <button
                        onClick={() => setPendingVerify(false)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-2 text-sm transition"
                      >
                        Geri
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 1. ADIM: e-posta kaydi */
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
                )}
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
        <div className="absolute bottom-8 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-md z-[1000]">
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-5">
            <p className="text-blue-700 dark:text-blue-400 font-semibold animate-pulse">Yapay zekâ bölgeyi işliyor...</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-2 break-all">Fiş No: {taskId}</p>
          </div>
        </div>
      )}

      {isAboutOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200" onClick={() => setIsAboutOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>

            {/* HERO */}
            <div className="relative bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-6 sm:p-10 text-white overflow-hidden">
              <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/10 rounded-full blur-2xl" />
              <button onClick={() => setIsAboutOpen(false)} className="absolute top-4 right-4 p-2 rounded-full bg-white/15 hover:bg-white/25 transition">
                <X size={18} />
              </button>
              <span className="inline-block px-3 py-1 rounded-full bg-white/20 text-[11px] font-bold tracking-widest uppercase mb-4">
                Girişim · v1.0
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold leading-tight">
                GeoMorphosis
              </h2>
              <p className="mt-3 text-base sm:text-xl font-medium text-emerald-50">
                Uydular bizim gözümüz, yapay zekâ bizim beynimiz.
              </p>
              <p className="mt-2 text-sm text-emerald-100/90 max-w-lg">
                Türkiye'nin yeşil alanlarını uzaydan izleyen, ormansızlaşmayı ve hava kirliliğini yapay zekâyle tespit edip anında haber veren çevresel izleme platformu.
              </p>
            </div>

            <div className="p-5 sm:p-8 space-y-8">

              {/* DEGERLER */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {[
                  { icon: Satellite, title: 'Uzaydan İzleme', desc: 'Sentinel-2 & Landsat arşiviyle her noktayı 3 farklı yılda karşılaştırıyoruz.', color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-900/30' },
                  { icon: BrainCircuit, title: 'Yapay Zekâ Analizi', desc: 'YOLOv8 modeli uydu görüntülerindeki ormansızlaşma izlerini tespit ediyor.', color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/30' },
                  { icon: BellRing, title: 'Anlık Erken Uyarı', desc: 'Risk anında e-posta ve Telegram üzerinden saniyeler içinde bildiriyoruz.', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/30' },
                  { icon: FileText, title: 'PDF Raporlama', desc: 'Her analiz, ekinde otomatik üretilmiş şık bir PDF raporuyla geliyor.', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
                ].map(({ icon: Icon, title, desc, color, bg }) => (
                  <div key={title} className={`${bg} rounded-2xl p-4 flex gap-3`}>
                    <Icon size={22} className={`${color} shrink-0 mt-0.5`} />
                    <div>
                      <h3 className="font-bold text-gray-800 dark:text-white text-sm">{title}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-300 mt-1 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* NASIL CALISIR */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">Nasıl Çalışır?</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { step: '1', icon: MapPin, label: 'Bölge seç' },
                    { step: '2', icon: Satellite, label: 'Veri iner' },
                    { step: '3', icon: Zap, label: 'AI analiz eder' },
                    { step: '4', icon: BarChart3, label: 'Rapor al' },
                  ].map(({ step, icon: Icon, label }) => (
                    <div key={step} className="flex flex-col items-center text-center gap-2 bg-gray-50 dark:bg-gray-900 rounded-2xl p-4">
                      <span className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">{step}</span>
                      <Icon size={20} className="text-gray-400" />
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ALTYAPI */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3">Altyapı</h3>
                <div className="flex flex-wrap gap-2">
                  {['Next.js', 'FastAPI', 'YOLOv8', 'Google Earth Engine', 'MODIS AOD', 'Redis', 'Prisma'].map(t => (
                    <span key={t} className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-200">{t}</span>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 dark:border-gray-700 text-center text-xs text-gray-400">
                MIT Lisansı ile açık kaynak · geomorphosis.com.tr
              </div>
            </div>
          </div>
        </div>
      )}

      {analysisResult && (
        <div className="absolute bottom-8 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[1000]">
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