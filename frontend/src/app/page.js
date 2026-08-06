'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Map from '@/components/Map';
import Toast from '@/components/Toast';

export default function Home() {
  const router = useRouter();

  const [selectedRegion, setSelectedRegion] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [toast, setToast] = useState(null);

  const handleAnalyze = async () => {
    if (!selectedRegion) return;

    setLoading(true);
    // Analiz başladığında bilgi bildirimi gösteriyoruz
    setToast({
      type: 'info',
      title: 'Analiz Başlatıldı',
      message: 'Seçilen bölge için uydu verileri işleniyor, lütfen bekleyin...'
    });

    try {
      // GeoJSON poligonundan ilk noktayı (merkez veya başlangıç) alalım
      // GeoJSON formatı: { geometry: { coordinates: [[[lng, lat], ...]] } }
      let lat, lng;
      
      if (selectedRegion.type === 'Feature') {
        const coords = selectedRegion.geometry.coordinates[0][0]; // İlk noktanın koordinatları
        lng = coords[0];
        lat = coords[1];
      } else {
        // Fallback (Eğer direkt obje gelirse diye)
        lat = selectedRegion.lat;
        lng = selectedRegion.lng || selectedRegion.lon;
      }

      // API'nin beklediği yeni "Vezne" payload formatı
      const payload = {
        start_points: [{ lat, lng }],
        end_points: [], // Şimdilik boş
        buffer_meters: 1000,
      };

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload), // Artık 'coordinates' değil 'payload' gönderiyoruz
      });

      if (!res.ok) {
        throw new Error(`HTTP hatası! Durum: ${res.status}`);
      }

      const data = await res.json();
      setAnalysisResult(data);
      
      // Analiz başarıyla bittiğinde başarı bildirimi gösteriyoruz
      setToast({
        type: 'success',
        title: 'Analiz Tamamlandı',
        message: 'Bölge analizi başarıyla sonuçlandı. Detayları inceleyebilirsiniz.'
      });
    } catch (err) {
      console.error('Analiz hatası:', err);
      // Hata durumunda hata bildirimi gösteriyoruz
      setToast({
        type: 'danger',
        title: 'Analiz Hatası',
        message: 'Veriler işlenirken bir sorun oluştu. Lütfen tekrar deneyin.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDetail = () => {
    if (!selectedRegion) return;

    const lat = selectedRegion.lat;
    const lon = selectedRegion.lng || selectedRegion.lon;

    router.push(`/region?lat=${lat}&lon=${lon}`);
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-gray-100">

      {/* Harita - Tam ekran */}

      <div className="absolute inset-0 z-0">
        <Map onRegionSelect={setSelectedRegion} />
      </div>

      {/* Üst Menü - Haritanın üzerinde yüzen bar */}

      <nav className="absolute top-0 left-0 right-0 z-[1000] h-20 bg-white/90 backdrop-blur-md shadow-sm border-b border-gray-200">
        <div className="h-full px-8 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-md">
              <span className="text-white text-2xl font-bold">
                G
              </span>
            </div>

            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                GeoMorphosis
              </h1>

              <p className="text-lg text-gray-500">
                Çevresel İzleme Platformu
              </p>
            </div>

          </div>

          <div className="flex items-center gap-6">

            <p className="text-xl text-gray-500 hidden md:block">
              Uydu Analiz Sistemi
            </p>

            <button
              onClick={() => setPanelOpen((prev) => !prev)}
              className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm font-semibold hover:bg-black transition"
            >
              {panelOpen ? 'Paneli Gizle' : 'Paneli Göster'}
            </button>

          </div>

        </div>
      </nav>

      {/* Sağ panel - Haritanın üzerinde yüzen kart */}

      {panelOpen && (
        <div className="absolute top-28 right-4 z-[1000] w-full max-w-sm max-h-[calc(100vh-8rem)] overflow-y-auto">

          <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-8 flex flex-col gap-6">

            <h2 className="text-3xl font-bold">
              Analizi Başlat
            </h2>

            {selectedRegion ? (
              <>
                <div className="bg-gray-50 rounded-2xl p-6">

                  <h3 className="text-xl font-semibold mb-4">
                    Seçilen koordinatlar
                  </h3>

                  <div className="space-y-4">

                    <div>
                      <p className="text-gray-500">
                        Enlem
                      </p>

                      <p className="text-2xl font-bold">
                        {selectedRegion.lat.toFixed(4)}
                      </p>
                    </div>

                    <div>
                      <p className="text-gray-500">
                        Boylam
                      </p>

                      <p className="text-2xl font-bold">
                        {(
                          selectedRegion.lng ||
                          selectedRegion.lon
                        ).toFixed(4)}
                      </p>
                    </div>

                  </div>

                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-5 rounded-2xl text-xl font-semibold hover:bg-blue-700 transition disabled:opacity-60"
                >
                  {loading
                    ? 'Analiz yapılıyor...'
                    : 'AI Analizini Başlat'}
                </button>
              </>
            ) : (
              <div className="bg-gray-50 rounded-2xl p-6 text-gray-500">
                Harita üzerinden bir bölge seçin.
              </div>
            )}

            {analysisResult && (
              <div>

                <div className="bg-green-50 border border-green-200 rounded-2xl p-5">

                  <h3 className="font-bold text-green-700 text-lg">
                    ✓ Analiz tamamlandı
                  </h3>

                  <p className="text-gray-600 mt-2">
                    Detaylı grafikler ve raporlar
                    analiz ekranında görüntülenecektir.
                  </p>

                </div>

                <button
                  onClick={handleDetail}
                  className="w-full mt-4 bg-gray-900 text-white py-5 rounded-2xl text-lg font-semibold hover:bg-black transition"
                >
                  Detaylı Analizi Aç
                </button>

              </div>
            )}

            <div className="bg-blue-50 rounded-2xl p-6">

              <h3 className="font-bold text-blue-700 text-lg">
                Bilgi
              </h3>

              <p className="text-gray-600 mt-3">
                Analiz sonuçları ayrı bir sayfada
                gösterilecektir.
              </p>

            </div>

          </div>

        </div>
      )}

      {/* Toast Bildirim Alanı */}
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

    </main>
  );
}