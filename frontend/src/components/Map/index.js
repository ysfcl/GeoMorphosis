'use client';

import { useEffect, useRef, useState } from 'react';
import mockHeatmapData from './mockHeatmapData';

export default function Map({ onRegionSelect }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef({});

  const [baseMap, setBaseMap] = useState('normal');
  const [activeOverlays, setActiveOverlays] = useState({
    fire: true,
    pollution: false,
    vegetation: false,
  });

 // src/components/Map/index.js (Sadece değişen/eklenen kısımlar)

// src/components/Map/index.js (Sadece değişen/eklenen kısımlar)

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      await import('leaflet.heat');
      
      // Çizim eklentisi ve CSS'ini dinamik olarak yüklüyoruz
      await import('leaflet-draw/dist/leaflet.draw.css');
      await import('leaflet-draw');

      if (mapInstanceRef.current) return;

      const map = L.map(mapRef.current, {
        zoomControl: false,
      }).setView([39.0, 35.0], 6);

      L.control.zoom({
        position: 'bottomleft',
      }).addTo(map);

      // --- Katman tanımlamaları aynı kalacak (normalMap, satelliteMap, heatmap'ler) ---
      const normalMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      });

      const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri',
        maxZoom: 19,
      });

      normalMap.addTo(map);

      // Heatmap kodları burada aynen kalsın...
      // ...

      // --- YENİ EKLENEN ÇİZİM MANTIĞI ---
      
      // Çizilen şekilleri tutacağımız bir katman grubu oluşturuyoruz
      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);

      // Çizim aracının (toolbar) ayarları
      const drawControl = new L.Control.Draw({
        position: 'bottomright', // YENİ EKLENDİ: Araç çubuğunu sağ alta taşıyoruz
        edit: {
          featureGroup: drawnItems, 
        },
        draw: {
          polygon: true,
          rectangle: true,
          circle: false, 
          circlemarker: false,
          marker: false,
          polyline: false,
        }
      });
      map.addControl(drawControl);

      // Çizim tamamlandığında tetiklenecek olay
      map.on(L.Draw.Event.CREATED, (e) => {
        // Eğer her seferinde sadece tek bir alan seçilmesini istiyorsak, 
        // yeni çizim yapıldığında öncekileri temizleyebiliriz:
        drawnItems.clearLayers(); 

        const layer = e.layer;
        drawnItems.addLayer(layer);

        // Şekli GeoJSON formatına dönüştürüyoruz (FR-1 görevinin kalbi)
        const geoJsonData = layer.toGeoJSON();
        console.log("Üretilen GeoJSON Verisi:", geoJsonData);

        // Üst bileşene (page.js) bu veriyi gönderiyoruz
        // Analiz API'miz şimdilik merkez noktası (lat, lng) bekliyor olabilir, 
        // uyumluluğu bozmamak için merkezi de hesaplayıp gönderiyoruz.
        const center = layer.getBounds().getCenter();
        onRegionSelect?.({
          geoJson: geoJsonData,
          lat: center.lat,
          lng: center.lng,
          radius: 1000 // İleride poligonun alanına göre dinamikleştirilebilir
        });
      });

      // Eski `map.on('click')` ile çember çizen kodu silebilirsin.

      // ----------------------------------

      mapInstanceRef.current = map;
      layersRef.current = {
        normalMap,
        satelliteMap,
        // heatmap katmanları...
      };
    };

    initMap();
    // ...
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [onRegionSelect]);

  const handleBaseMapChange = (type) => {
    const map = mapInstanceRef.current;
    const { normalMap, satelliteMap } = layersRef.current;

    if (!map || type === baseMap) return;

    if (type === 'satellite') {
      map.removeLayer(normalMap);
      satelliteMap.addTo(map);
    } else {
      map.removeLayer(satelliteMap);
      normalMap.addTo(map);
    }

    setBaseMap(type);
  };

  const handleOverlayToggle = (key) => {
    const map = mapInstanceRef.current;
    const layerMap = {
      fire: layersRef.current.fireLayer,
      pollution: layersRef.current.pollutionLayer,
      vegetation: layersRef.current.vegetationLayer,
    };
    const layer = layerMap[key];

    if (!map || !layer) return;

    setActiveOverlays((prev) => {
      const next = { ...prev, [key]: !prev[key] };

      if (next[key]) {
        layer.addTo(map);
      } else {
        map.removeLayer(layer);
      }

      return next;
    });
  };

  const overlayOptions = [
    { key: 'fire', label: 'Yangın Katmanı', color: 'bg-red-500' },
    { key: 'pollution', label: 'Kirlilik Katmanı', color: 'bg-blue-500' },
    { key: 'vegetation', label: 'NDVI (Bitki Örtüsü)', color: 'bg-green-500' },
  ];

  return (
    <div className="relative w-full h-full">

      <div ref={mapRef} id="map" className="w-full h-full" />

      {/* Katman kontrol paneli */}

      <div className="absolute top-24 left-4 z-[1000] bg-white/95 backdrop-blur-md rounded-2xl shadow-xl p-4 w-64">

        <h3 className="text-sm font-bold text-gray-700 mb-3">
          Harita Görünümü
        </h3>

        <div className="flex bg-gray-100 rounded-xl p-1 mb-4">

          <button
            onClick={() => handleBaseMapChange('normal')}
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition ${
              baseMap === 'normal'
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-500'
            }`}
          >
            Normal
          </button>

          <button
            onClick={() => handleBaseMapChange('satellite')}
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition ${
              baseMap === 'satellite'
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-500'
            }`}
          >
            Uydu
          </button>

        </div>

        <h3 className="text-sm font-bold text-gray-700 mb-3">
          Katmanlar
        </h3>

        <div className="space-y-2">

          {overlayOptions.map((option) => (
            <button
              key={option.key}
              onClick={() => handleOverlayToggle(option.key)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition ${
                activeOverlays[option.key]
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className={`w-3 h-3 rounded-full ${option.color}`} />
              {option.label}
            </button>
          ))}

        </div>

      </div>

    </div>
  );
}