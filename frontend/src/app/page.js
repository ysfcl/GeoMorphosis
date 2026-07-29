'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Map from '@/components/Map';
import ReportPreview from '@/components/Report/ReportPreview';
import Analytics from '@/components/Analytics';

export default function Home() {
  const router = useRouter();
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);

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
      console.error('Analiz hatasi:', err);
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
    <main className="min-h-screen">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">G</span>
            </div>
            <h1 className="text-xl font-bold text-gray-800">GeoMorphosis</h1>
          </div>
          <span className="text-sm text-gray-500">Cevresel Monitoring Platformu</span>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Harita Uzerinden Bolge Sec</h2>
              <Map onRegionSelect={setSelectedRegion} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Analiz Baslat</h2>
              {selectedRegion ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Secilen koordinatlar hazir.
                  </p>
                  <button onClick={handleAnalyze} disabled={loading} className="btn-primary w-full">
                    {loading ? 'Analiz yapiliyor...' : 'AI Analiz Baslat'}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Harita uzerinden bir bolge secin.</p>
              )}
            </div>

            {analysisResult && (
              <div className="card space-y-3">
                <Analytics data={analysisResult} />
                <button onClick={handleDetail} className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-900 transition-colors duration-200 font-medium text-sm">
                  Detayli Incele
                </button>
              </div>
            )}
          </div>
        </div>

        {/* YENİ EKLENEN KISIM: PDF RAPOR ÖNİZLEME BİLEŞENİ */}
        <div className="mt-12 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Raporlama ve Çıktı</h2>
          <ReportPreview />
        </div>

      </div>
    </main>
  );
}