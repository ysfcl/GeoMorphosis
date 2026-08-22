"use client";

import { useEffect, useRef, useState } from 'react';
import mockHeatmapData from './mockHeatmapData';

// Maksimum seçilebilir alan sınırı (m² cinsinden)
// Örnek: 25 km² = 25,000,000 m²
const MAX_AREA_SQ_METERS = 25 * 1000 * 1000;

export default function Map({ onRegionSelect, isDarkMode }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef({});

  const [baseMap, setBaseMap] = useState('normal');
  const [activeOverlays, setActiveOverlays] = useState({
    pollution: false,
    vegetation: true,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      await import('leaflet.heat');

      await import('leaflet-draw/dist/leaflet.draw.css');
      await import('leaflet-draw');

      if (mapInstanceRef.current) return;

      // --- ALAN HESAPLAMA & SINIRLANDIRMA FONKSİYONLARI ---
      const calculateGeodesicArea = (latLngs) => {
        return L.GeometryUtil
          ? L.GeometryUtil.geodesicArea(latLngs)
          : computeApproxArea(latLngs);
      };

      // Basit geodesic alan hesabı
      const computeApproxArea = (coords) => {
        const RADIUS = 6378137;
        let area = 0;
        const len = coords.length;

        if (len < 3) return 0;

        for (let i = 0; i < len; i++) {
          const p1 = coords[i];
          const p2 = coords[(i + 1) % len];

          area +=
            ((p2.lng - p1.lng) * (Math.PI / 180)) *
            (
              2 +
              Math.sin(p1.lat * (Math.PI / 180)) +
              Math.sin(p2.lat * (Math.PI / 180))
            );
        }

        return Math.abs(
          (area * RADIUS * RADIUS) / 2.0
        );
      };

      // Dikdörtgen çizilirken sınır aşımında farenin gidebileceği maksimum noktayı hesaplar
      const clampRectangleLatLng = (
        startLatLng,
        currentLatLng,
        maxArea
      ) => {
        const south = Math.min(
          startLatLng.lat,
          currentLatLng.lat
        );

        const north = Math.max(
          startLatLng.lat,
          currentLatLng.lat
        );

        const west = Math.min(
          startLatLng.lng,
          currentLatLng.lng
        );

        const east = Math.max(
          startLatLng.lng,
          currentLatLng.lng
        );

        const corners = [
          L.latLng(south, west),
          L.latLng(north, west),
          L.latLng(north, east),
          L.latLng(south, east)
        ];

        const currentArea =
          computeApproxArea(corners);

        if (currentArea > maxArea) {
          const scale = Math.sqrt(
            maxArea / currentArea
          );

          const latDiff =
            (currentLatLng.lat -
              startLatLng.lat) *
            scale;

          const lngDiff =
            (currentLatLng.lng -
              startLatLng.lng) *
            scale;

          return L.latLng(
            startLatLng.lat + latDiff,
            startLatLng.lng + lngDiff
          );
        }

        return currentLatLng;
      };

      // Leaflet.Draw Dikdörtgen Sürükleme Davranışını Genişletme
      if (L.Draw && L.Draw.Rectangle) {
        L.Draw.Rectangle.prototype._onMouseMove =
          function (e) {
            const latlng = e.latlng;

            this._tooltip.updatePosition(
              latlng
            );

            if (this._isDrawing) {
              const clampedLatLng =
                clampRectangleLatLng(
                  this._startLatLng,
                  latlng,
                  MAX_AREA_SQ_METERS
                );

              this._drawShape(
                clampedLatLng
              );
            }
          };
      }

      // ----------------------------------------------------

      const map = L.map(mapRef.current, {
        zoomControl: false
      }).setView([39.0, 35.0], 6);

      L.control
        .zoom({
          position: 'bottomleft'
        })
        .addTo(map);

      // ====================================================
      // NORMAL HARİTA
      // ====================================================

      const normalMap = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 19,
        }
      );

      // ====================================================
      // DARK HARİTA
      // ====================================================

      const darkMap = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          attribution:
            '&copy; <a href="https://carto.com/attributions">CARTO</a>',
          maxZoom: 19,
          className: 'custom-dark-tiles',
        }
      );

      // ====================================================
      // UYDU HARİTASI
      // ====================================================

      const satelliteMap = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles © Esri',
          maxZoom: 19,
        }
      );

      if (isDarkMode) {
        darkMap.addTo(map);
      } else {
        normalMap.addTo(map);
      }

      // ====================================================
      // ISI HARİTASI KATMANLARI
      // ====================================================

      const pollutionHeatData =
        mockHeatmapData.map((p) => [
          p.lat,
          p.lng,
          p.intensity
        ]);

      const vegetationHeatData =
        mockHeatmapData.map((p) => [
          p.lat,
          p.lng,
          p.intensity
        ]);

      // ====================================================
      // KİRLİLİK HEATMAP
      // SADECE GÖRÜNTÜ KOYULAŞTIRILDI
      // ====================================================

      const pollutionLayer =
        L.heatLayer(
          pollutionHeatData,
          {
            radius: 35,
            blur: 18,
            maxZoom: 12,

            gradient: {
              0.2: '#93c5fd',
              0.4: '#3b82f6',
              0.6: '#1d4ed8',
              0.8: '#1e40af',
              1.0: '#172554',
            },
          }
        );

      // ====================================================
      // NDVI / BİTKİ ÖRTÜSÜ HEATMAP
      // SADECE GÖRÜNTÜ KOYULAŞTIRILDI
      // ====================================================

      const vegetationLayer =
        L.heatLayer(
          vegetationHeatData,
          {
            radius: 35,
            blur: 18,
            maxZoom: 12,

            gradient: {
              0.2: '#86efac',
              0.4: '#22c55e',
              0.6: '#16a34a',
              0.8: '#15803d',
              1.0: '#14532d',
            },
          }
        );

      // ====================================================
      // AKTİF KATMANLAR
      // ====================================================

      if (activeOverlays.pollution) {
        pollutionLayer.addTo(map);
      }

      if (activeOverlays.vegetation) {
        vegetationLayer.addTo(map);
      }

      // ====================================================
      // DRAWN ITEMS
      // ====================================================

      const drawnItems =
        new L.FeatureGroup();

      map.addLayer(drawnItems);

      // ====================================================
      // DRAW CONTROL
      // ====================================================

      const drawControl =
        new L.Control.Draw({
          position: 'bottomright',

          edit: {
            featureGroup:
              drawnItems,
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

      // ====================================================
      // ALAN SEÇİLDİĞİNDE
      // ====================================================

      map.on(
        L.Draw.Event.CREATED,
        (e) => {
          drawnItems.clearLayers();

          const layer = e.layer;

          let latLngs =
            layer.getLatLngs();

          if (
            Array.isArray(latLngs[0])
          ) {
            latLngs = latLngs[0];
          }

          const drawnArea =
            computeApproxArea(
              latLngs
            );

          // ==================================================
          // MAKSİMUM ALAN KONTROLÜ
          // ==================================================

          if (
            drawnArea >
            MAX_AREA_SQ_METERS
          ) {
            alert(
              `Seçilen alan maksimum sınırı (${(
                MAX_AREA_SQ_METERS /
                1000000
              ).toFixed(
                0
              )} km²) aşıyor! Lütfen daha küçük bir alan seçin.`
            );

            return;
          }

          // ==================================================
          // SEÇİLEN ALANI EKLE
          // ==================================================

          drawnItems.addLayer(layer);

          // ==================================================
          // GEOJSON
          // ==================================================

          const geoJsonData =
            layer.toGeoJSON();

          console.log(
            'Üretilen GeoJSON Verisi:',
            geoJsonData
          );

          // ==================================================
          // MERKEZ
          // ==================================================

          const center =
            layer
              .getBounds()
              .getCenter();

          // ==================================================
          // PARENT COMPONENT'E GÖNDER
          // ==================================================

          onRegionSelect?.({
            geoJson:
              geoJsonData,

            lat: center.lat,

            lng: center.lng,

            radius: 1000,
          });
        }
      );

      // ====================================================
      // MAP INSTANCE
      // ====================================================

      mapInstanceRef.current =
        map;

      layersRef.current = {
        normalMap,
        darkMap,
        satelliteMap,
        pollutionLayer,
        vegetationLayer,
      };
    };

    initMap();

    // ======================================================
    // CLEANUP
    // ======================================================

    return () => {
      if (
        mapInstanceRef.current
      ) {
        mapInstanceRef.current.remove();

        mapInstanceRef.current =
          null;
      }
    };
  }, [
    onRegionSelect,
    isDarkMode
  ]);

  // ========================================================
  // DARK / NORMAL MAP
  // ========================================================

  useEffect(() => {
    const map =
      mapInstanceRef.current;

    if (
      !map ||
      !layersRef.current.normalMap ||
      !layersRef.current.darkMap
    ) {
      return;
    }

    if (baseMap === 'normal') {
      if (isDarkMode) {
        map.removeLayer(
          layersRef.current.normalMap
        );

        layersRef.current.darkMap.addTo(
          map
        );
      } else {
        map.removeLayer(
          layersRef.current.darkMap
        );

        layersRef.current.normalMap.addTo(
          map
        );
      }
    }
  }, [
    isDarkMode,
    baseMap
  ]);

  // ========================================================
  // BASE MAP DEĞİŞTİRME
  // ========================================================

  const handleBaseMapChange = (
    type
  ) => {
    const map =
      mapInstanceRef.current;

    const {
      normalMap,
      darkMap,
      satelliteMap
    } = layersRef.current;

    if (
      !map ||
      type === baseMap
    ) {
      return;
    }

    if (
      type === 'satellite'
    ) {
      map.removeLayer(
        normalMap
      );

      if (darkMap) {
        map.removeLayer(
          darkMap
        );
      }

      satelliteMap.addTo(
        map
      );
    } else {
      map.removeLayer(
        satelliteMap
      );

      if (isDarkMode) {
        darkMap.addTo(
          map
        );
      } else {
        normalMap.addTo(
          map
        );
      }
    }

    setBaseMap(type);
  };

  // ========================================================
  // OVERLAY TOGGLE
  // ========================================================

  const handleOverlayToggle = (
    key
  ) => {
    const map =
      mapInstanceRef.current;

    const layerMap = {
      pollution:
        layersRef.current
          .pollutionLayer,

      vegetation:
        layersRef.current
          .vegetationLayer,
    };

    const layer =
      layerMap[key];

    if (
      !map ||
      !layer
    ) {
      return;
    }

    setActiveOverlays(
      (prev) => {
        const next = {
          ...prev,
          [key]:
            !prev[key],
        };

        if (
          next[key]
        ) {
          layer.addTo(
            map
          );
        } else {
          map.removeLayer(
            layer
          );
        }

        return next;
      }
    );
  };

  // ========================================================
  // OVERLAY OPTIONS
  // ========================================================

  const overlayOptions = [
    {
      key: 'pollution',
      label: 'Kirlilik Katmanı',
      color: 'bg-blue-500'
    },

    {
      key: 'vegetation',
      label: 'NDVI (Bitki Örtüsü)',
      color: 'bg-green-500'
    }
  ];

  // ========================================================
  // UI
  // ========================================================

  return (
    <div className="relative w-full h-full">

      <div
        ref={mapRef}
        id="map"
        className="w-full h-full"
      />

      {/* Sol Harita Görünümü Paneli */}

      <div className="absolute top-24 left-4 z-[1000] bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-2xl shadow-xl p-4 w-64 border border-transparent dark:border-gray-700 transition-colors duration-300">

        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 transition-colors duration-300">
          Harita Görünümü
        </h3>

        <div className="flex bg-gray-100 dark:bg-gray-900 rounded-xl p-1 mb-4 transition-colors duration-300">

          {/* NORMAL */}

          <button
            onClick={() =>
              handleBaseMapChange(
                'normal'
              )
            }
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors duration-300 ${
              baseMap ===
              'normal'
                ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Normal
          </button>

          {/* UYDU */}

          <button
            onClick={() =>
              handleBaseMapChange(
                'satellite'
              )
            }
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors duration-300 ${
              baseMap ===
              'satellite'
                ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Uydu
          </button>

        </div>

        {/* KATMANLAR */}

        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 transition-colors duration-300">
          Katmanlar
        </h3>

        <div className="space-y-2">

          {overlayOptions.map(
            (option) => (
              <button
                key={
                  option.key
                }
                onClick={() =>
                  handleOverlayToggle(
                    option.key
                  )
                }
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-300 ${
                  activeOverlays[
                    option.key
                  ]
                    ? 'bg-gray-900 dark:bg-gray-600 text-white'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >

                <span
                  className={`w-3 h-3 rounded-full ${option.color}`}
                />

                {option.label}

              </button>
            )
          )}

        </div>

        {/* YOĞUNLUK */}

        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">

          <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
            Yoğunluk
          </p>

          <div className="flex items-center gap-1">

            <span
              className="w-3 h-3 rounded-full"
              style={{
                background:
                  '#93c5fd'
              }}
            />

            <span className="text-[11px] text-gray-500 mr-2">
              Düşük
            </span>

            <span
              className="w-4 h-4 rounded-full"
              style={{
                background:
                  '#172554'
              }}
            />

            <span className="text-[11px] text-gray-500">
              Yüksek
            </span>

          </div>

        </div>

      </div>

    </div>
  );
}