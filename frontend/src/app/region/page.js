'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import Analytics from '@/components/Analytics';

function RegionContent() {
  const searchParams = useSearchParams();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const aiLayerGroupRef = useRef(null); // Çakışmaları önlemek için yeni katman referansı

  const [regionData, setRegionData] = useState(null);
  const [activeTab, setActiveTab] = useState('map');
  const [analysisStatus, setAnalysisStatus] = useState('loading'); // 'loading' | 'processing' | 'success' | 'error'

  const lat = parseFloat(searchParams.get('lat')) || 0;
  const lon = parseFloat(searchParams.get('lon')) || 0;

  // --- VEZNE-MUTFAK (POLLING) MANTIĞI BURADA ---
  useEffect(() => {
    if (!lat || !lon) return;

    let pollInterval;

    const fetchRegion = async () => {
      try {
        setAnalysisStatus('loading');

        // 1. Vezneye (FastAPI) iş emrini ver (POST)
        // Backend'in beklediği start_points listesine haritadaki lat/lon'u gönderiyoruz
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
        const taskId = postData.task_id;

        if (!taskId) throw new Error('Task ID alınamadı');

        setAnalysisStatus('processing');

        // 2. Mutfaktan (Redis) yemeğin durumunu kontrol et (Polling)
        pollInterval = setInterval(async () => {
          const statusRes = await fetch(`/api/analyze/?task_id=${taskId}`);
          const statusData = await statusRes.json();

          if (statusData.status === 'completed') {
            clearInterval(pollInterval); // İş bitti, sormayı bırak
            setRegionData(statusData.result); // Analytics.js'i besleyecek veriyi state'e yaz
            setAnalysisStatus('success');
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            setAnalysisStatus('error');
          }
        }, 3000); // Her 3 saniyede bir kontrol et

      } catch (err) {
        console.error('Veri yüklenemedi:', err);
        setAnalysisStatus('error');
      }
    };
    fetchRegion();

    // Component kapandığında interval'i temizle (Memory Leak önlemi)
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [lat, lon]);


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

    L.marker([lat, lon]).addTo(map)
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
           L.circleMarker([point.lat, point.lng], {
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


  // --- TASARIM (JSX) KISMI ---
  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <a href="/" className="text-primary-600 hover:underline text-sm">&#8592; Ana Sayfaya Don</a>
          <h1 className="text-xl font-bold text-gray-800 mt-1">Bolge Detay</h1>
          <p className="text-sm text-gray-500">Enlem: {lat} | Boylam: {lon}</p>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('map')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'map' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            Uydu Goruntusu
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'analysis' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            Analiz Sonuclari
          </button>
        </div>

        {activeTab === 'map' && (
          <div className="card p-0 overflow-hidden">
            <div ref={mapRef} style={{ height: '600px', width: '100%' }} />
          </div>
        )}

        {activeTab === 'analysis' && (
          <div>
            {analysisStatus === 'loading' && (
              <p className="text-gray-500">FastAPI&apos;ye bağlanılıyor...</p>
            )}
            {analysisStatus === 'processing' && (
              <p className="text-blue-500 font-semibold animate-pulse">Yapay zeka verileri işliyor, lütfen bekleyin...</p>
            )}
            {analysisStatus === 'error' && (
              <p className="text-red-500">Analiz sırasında bir hata oluştu.</p>
            )}
            {analysisStatus === 'success' && regionData && (
              <Analytics data={regionData} />
            )}
          </div>
        )}

        <div className="card">
          <h3 className="font-semibold mb-3">Bolge Bilgileri</h3>
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
              <p className="text-gray-500">Harita Kaynagi</p>
              <p className="font-medium">Esri World Imagery</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function RegionDetail() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Yukleniyor...</div>
      </main>
    }>
      <RegionContent />
    </Suspense>
  );
}