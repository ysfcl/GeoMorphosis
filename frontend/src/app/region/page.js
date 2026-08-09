'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import Analytics from '@/components/Analytics';

function RegionContent() {
  const searchParams = useSearchParams();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [regionData, setRegionData] = useState(null);
  const [activeTab, setActiveTab] = useState('map');

  const lat = parseFloat(searchParams.get('lat')) || 0;
  const lon = parseFloat(searchParams.get('lon')) || 0;

  useEffect(() => {
    if (!lat || !lon) return;

    const fetchRegion = async () => {
      try {
        const res = await fetch(`/api/analyze?lat=${lat}&lon=${lon}`);
        const data = await res.json();
        setRegionData(data);
      } catch (err) {
        console.error('Veri yuklenemedi:', err);
      }
    };
    fetchRegion();
  }, [lat, lon]);

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

    mapInstanceRef.current = map;
  }, [lat, lon]);

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
      }
    };
  }, [activeTab, initMap]);

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
    {regionData ? (
      <Analytics data={regionData} />
    ) : (
      <p className="text-gray-500">Analiz verisi yukleniyor...</p>
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
