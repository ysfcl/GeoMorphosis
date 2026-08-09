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
  const [viewInfo, setViewInfo] = useState({ zoom: 6, lat: 39.0, lon: 35.0 });

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

      L.control.zoom({ position: 'bottomleft' }).addTo(map);

      const normalMap = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { attribution: '&copy; OpenStreetMap', maxZoom: 19 }
      );

      const satelliteMap = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri', maxZoom: 19 }
      );

      normalMap.addTo(map);

      const firePoints = mockHeatmapData.map((p) => [p.lat, p.lng, p.intensity]);
      const pollutionPoints = mockHeatmapData.map((p) => [p.lat + 0.2, p.lng, 0.5]);
      const vegetationPoints = mockHeatmapData.map((p) => [p.lat - 0.2, p.lng, 0.75]);

      const fireLayer = L.heatLayer(firePoints, {
        radius: 38, blur: 28, maxZoom: 9, minOpacity: 0.35,
        gradient: { 0.2: '#22c55e', 0.5: '#f59e0b', 0.8: '#ef4444' },
      });

      const pollutionLayer = L.heatLayer(pollutionPoints, {
        radius: 38, blur: 28, maxZoom: 9, minOpacity: 0.35,
        gradient: { 0.3: '#93c5fd', 0.6: '#3b82f6', 1.0: '#1e40af' },
      });

      const vegetationLayer = L.heatLayer(vegetationPoints, {
        radius: 38, blur: 28, maxZoom: 9, minOpacity: 0.35,
        gradient: { 0.3: '#bbf7d0', 0.6: '#4ade80', 1.0: '#15803d' },
      });

      fireLayer.addTo(map);

      // --- BÖLGE ÇİZİM ARAÇLARI (leaflet-draw) ---

      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);

      const drawControl = new L.Control.Draw({
        position: 'bottomright',
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
        },
      });

      map.addControl(drawControl);

      map.on(L.Draw.Event.CREATED, (e) => {
        // Tek seferde tek bir bölge seçili kalsın diye öncekini temizle
        drawnItems.clearLayers();

        const layer = e.layer;
        drawnItems.addLayer(layer);

        const geoJsonData = layer.toGeoJSON();
        const center = layer.getBounds().getCenter();

        onRegionSelect?.({
          geoJson: geoJsonData,
          lat: center.lat,
          lng: center.lng,
          radius: 1000,
        });
      });

      const updateViewInfo = () => {
        const center = map.getCenter();
        setViewInfo({
          zoom: map.getZoom(),
          lat: center.lat,
          lon: center.lng,
        });
      };

      map.on('moveend zoomend', updateViewInfo);
      updateViewInfo();

      mapInstanceRef.current = map;
      layersRef.current = { normalMap, satelliteMap, fireLayer, pollutionLayer, vegetationLayer };
    };

    initMap();

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
      if (next[key]) layer.addTo(map);
      else map.removeLayer(layer);
      return next;
    });
  };

  const overlayOptions = [
    { key: 'fire', label: 'Yangın Katmanı', color: '#ef4444' },
    { key: 'pollution', label: 'Kirlilik Katmanı', color: '#3b82f6' },
    { key: 'vegetation', label: 'NDVI (Bitki Örtüsü)', color: '#22c55e' },
  ];

  return (
    <div className="relative w-full h-full">

      <div ref={mapRef} id="map" className="w-full h-full" />

      {/* Kontrol paneli */}

      <div className="absolute top-20 left-4 z-[1000] w-64 bg-white border border-[#E2E4E8] rounded-lg shadow-sm">

        <div className="p-4 border-b border-[#E2E4E8]">
          <p className="text-[11px] tracking-[0.12em] uppercase text-[#6B7280] mb-3">
            Harita Görünümü
          </p>

          <div className="flex gap-1 bg-[#F4F5F7] rounded-md p-1">
            <button
              onClick={() => handleBaseMapChange('normal')}
              className={`flex-1 text-xs font-medium py-1.5 rounded transition ${
                baseMap === 'normal'
                  ? 'bg-white text-[#1C2128] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#1C2128]'
              }`}
            >
              Normal
            </button>

            <button
              onClick={() => handleBaseMapChange('satellite')}
              className={`flex-1 text-xs font-medium py-1.5 rounded transition ${
                baseMap === 'satellite'
                  ? 'bg-white text-[#1C2128] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#1C2128]'
              }`}
            >
              Uydu
            </button>
          </div>
        </div>

        <div className="p-4">
          <p className="text-[11px] tracking-[0.12em] uppercase text-[#6B7280] mb-3">
            Katmanlar
          </p>

          <div className="space-y-1">
            {overlayOptions.map((option) => {
              const active = activeOverlays[option.key];

              return (
                <div
                  key={option.key}
                  onClick={() => handleOverlayToggle(option.key)}
                  className="flex items-center justify-between py-2 px-1 rounded hover:bg-[#F4F5F7] cursor-pointer transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: option.color }}
                    />
                    <span className="text-xs text-[#1C2128]">
                      {option.label}
                    </span>
                  </div>

                  <div
                    className="relative w-8 h-[18px] rounded-full transition-colors shrink-0"
                    style={{ backgroundColor: active ? option.color : '#D3D6DC' }}
                  >
                    <span
                      className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full transition-all ${
                        active ? 'left-[16px]' : 'left-[2px]'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Canlı koordinat / zoom okuması */}

      <div className="absolute bottom-4 right-4 z-[1000] bg-white border border-[#E2E4E8] rounded-md px-3 py-1.5 shadow-sm">
        <p className="text-[11px] text-[#6B7280] tabular-nums">
          zoom: {viewInfo.zoom.toFixed(2)} &nbsp;·&nbsp; lat, lon: {viewInfo.lat.toFixed(2)}, {viewInfo.lon.toFixed(2)}
        </p>
      </div>

    </div>
  );
}