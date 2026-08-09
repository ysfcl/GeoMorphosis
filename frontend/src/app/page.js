'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Map from '@/components/Map';

export default function Home() {
  const router = useRouter();

  const [selectedRegion, setSelectedRegion] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const handleAnalyze = async () => {
    if (!selectedRegion) return;

    setLoading(true);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: selectedRegion }),
      });

      const data = await res.json();
      setAnalysisResult(data);
    } catch (err) {
      console.error('Analiz hatası:', err);
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
    <main className="fixed inset-0 overflow-hidden bg-[#F4F5F7]">

      {/* Harita */}

      <div className="absolute inset-0 z-0">
        <Map onRegionSelect={setSelectedRegion} />
      </div>

      {/* Üst Menü */}

      <nav className="absolute top-0 left-0 right-0 z-[1000] h-16 bg-white border-b border-[#E2E4E8]">
        <div className="h-full px-6 flex items-center justify-between">

          <div className="flex items-center gap-3">

            <div className="w-9 h-9 rounded-md bg-[#2F6F52] flex items-center justify-center">
              <span className="text-white text-sm font-bold">
                G
              </span>
            </div>

            <div>
              <p className="text-sm font-semibold tracking-wide text-[#1C2128] leading-tight">
                GEOMORPHOSIS
              </p>

              <p className="text-[10px] tracking-[0.1em] uppercase text-[#6B7280]">
                Çevresel İzleme Platformu
              </p>
            </div>

          </div>

          <div className="flex items-center gap-4">

            <p className="text-[11px] tracking-[0.1em] uppercase text-[#6B7280] hidden md:block">
              Uydu Analiz Sistemi
            </p>

            <button
              onClick={() => setPanelOpen((prev) => !prev)}
              className="border border-[#D3D6DC] rounded-md px-3 py-1.5 text-[11px] tracking-[0.08em] uppercase font-medium text-[#1C2128] hover:bg-[#F4F5F7] transition"
            >
              {panelOpen ? 'Paneli Gizle' : 'Paneli Göster'}
            </button>

          </div>

        </div>
      </nav>

      {/* Sağ panel */}

      {panelOpen && (
        <div className="absolute top-20 right-4 z-[1000] w-80 max-h-[calc(100vh-6rem)] overflow-y-auto">

          <div className="bg-white border border-[#E2E4E8] rounded-lg shadow-sm">

            <div className="p-5 border-b border-[#E2E4E8]">
              <p className="text-[11px] tracking-[0.12em] uppercase text-[#6B7280] mb-1">
                Bölge Analizi
              </p>

              <h2 className="text-base font-semibold text-[#1C2128]">
                Analizi Başlat
              </h2>
            </div>

            <div className="p-5 space-y-5">

              {selectedRegion ? (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2 border-b border-[#F0F1F3]">
                      <span className="text-xs text-[#6B7280]">Enlem</span>
                      <span className="text-sm font-medium text-[#1C2128]">
                        {selectedRegion.lat.toFixed(4)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <span className="text-xs text-[#6B7280]">Boylam</span>
                      <span className="text-sm font-medium text-[#1C2128]">
                        {(selectedRegion.lng || selectedRegion.lon).toFixed(4)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleAnalyze}
                    disabled={loading}
                    className="w-full bg-[#2F6F52] text-white rounded-md py-2.5 text-xs tracking-[0.08em] uppercase font-semibold hover:bg-[#255A42] transition disabled:opacity-50"
                  >
                    {loading ? 'Analiz Yapılıyor...' : 'AI Analizini Başlat'}
                  </button>
                </>
              ) : (
                <div className="bg-[#F4F5F7] rounded-md p-4 text-xs text-[#6B7280]">
                  Harita üzerinden bir bölge seçin.
                </div>
              )}

              {analysisResult && (
                <div className="space-y-3">
                  <div className="border border-[#2F6F52]/25 bg-[#EAF4EF] rounded-md p-4">
                    <p className="text-xs font-semibold text-[#2F6F52] uppercase tracking-wide mb-1">
                      Analiz Tamamlandı
                    </p>

                    <p className="text-xs text-[#4B5563]">
                      Detaylı grafikler ve raporlar analiz ekranında görüntülenecektir.
                    </p>
                  </div>

                  <button
                    onClick={handleDetail}
                    className="w-full border border-[#1C2128] text-[#1C2128] rounded-md py-2.5 text-xs tracking-[0.08em] uppercase font-semibold hover:bg-[#1C2128] hover:text-white transition"
                  >
                    Detaylı Analizi Aç
                  </button>
                </div>
              )}

              <div className="bg-[#F4F5F7] rounded-md p-4">
                <p className="text-[11px] font-semibold text-[#1C2128] uppercase tracking-wide mb-1">
                  Bilgi
                </p>

                <p className="text-xs text-[#6B7280]">
                  Analiz sonuçları ayrı bir sayfada gösterilecektir.
                </p>
              </div>

            </div>

          </div>

        </div>
      )}

    </main>
  );
}