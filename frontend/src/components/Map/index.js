"use client";

import { useEffect, useRef, useState } from 'react';
import mockHeatmapData from './mockHeatmapData';
import { Layers, X } from 'lucide-react';
import {
  MAX_SELECTION_AREA_M2,
  MAX_SELECTION_AREA_KM2,
  deriveRadiusFromArea,
} from '@/lib/mapLimits';
import MapSearch from '@/components/MapSearch';

const MAX_AREA_SQ_METERS = MAX_SELECTION_AREA_M2;

export default function Map({ onRegionSelect, isDarkMode }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef({});
  // Leaflet dinamik olarak (initMap icinde) yukleniyor; arama sonucunda
  // isaretci cizebilmek icin modul referansini sakliyoruz.
  const leafletRef = useRef(null);
  const searchMarkerRef = useRef(null);

  const [baseMap, setBaseMap] = useState('normal');
  const [activeOverlays, setActiveOverlays] = useState({
    pollution: false,
    vegetation: true,
  });
  // Mobilde harita ayarlari paneli; Analizi Baslat kucultulmus sekmesi
  // artik sol alt kose (bottom-24 left-3) oldugu icin cakisma yok. sm: ve
  // ustunde bu state'e bakilmaksizin panel her zaman gorunur.
  const [showLayersPanel, setShowLayersPanel] = useState(false);

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
          p.lon,
          p.intensity
        ]);

      const vegetationHeatData =
        mockHeatmapData.map((p) => [
          p.lat,
          p.lon,
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

            lon: center.lng,

            // Cizimin alanindan turetilir; boylece AI motoru 4 km2'lik sabit
            // pencere yerine cizime denk gelen pencereyi isler.
            radius: deriveRadiusFromArea(drawnArea),

            // Cizilen poligonun jeodezik alani (m2) ve izinli ust sinir;
            // ana sayfa paneli "Secilen Alan" satirini buradan gosterir.
            area_sq_meters: Math.round(drawnArea),
            max_area_sq_meters: MAX_AREA_SQ_METERS,
          });
        }
      );

      // ====================================================
      // MAP INSTANCE
      // ====================================================

      mapInstanceRef.current =
        map;

      // Arama sonucu isaretcisi bu referans uzerinden ciziliyor.
      leafletRef.current = L;

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

        // Harita ile birlikte isaretci de gitti; olu referansi tutmayalim.
        searchMarkerRef.current = null;
        leafletRef.current = null;
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
  // KONUM ARAMA SONUCU -> HARITAYI TASI
  // ========================================================

  const handleSearchSelect = (result) => {
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L || !result) return;

    if (result.bbox) {
      const { south, north, west, east } = result.bbox;
      map.fitBounds(
        [
          [south, west],
          [north, east],
        ],
        { maxZoom: 15, animate: false }
      );
    } else {
      map.setView([result.lat, result.lon], 14, { animate: false });
    }

    if (searchMarkerRef.current) {
      map.removeLayer(searchMarkerRef.current);
      searchMarkerRef.current = null;
    }

    searchMarkerRef.current = L.circleMarker([result.lat, result.lon], {
      radius: 8,
      color: '#2563eb',
      weight: 3,
      fillColor: '#3b82f6',
      fillOpacity: 0.4,
    })
      .addTo(map)
      .bindTooltip(result.name, { direction: 'top', offset: [0, -10] });
  };

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

      {/* Konum arama kutusu.
          Masaustunde ortada duruyor: solda katman paneli (w-64), sagda
          Analizi Baslat paneli (w-96) var, ortadaki serit bos.
          Mobilde tam genislik; bu yuzden sol paneller asagi kaydirildi.
          z-[1100] cunku sonuc listesi diger panellerin (z-[1000]) ustunde
          kalmali. */}
      <div className="absolute top-24 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[26rem] z-[1100]">
        <MapSearch onSelect={handleSearchSelect} />
      </div>

      {/* Mobilde Harita Gorunumu panelini acan/kapatan dugme.
          sm: ve ustunde gorunmez, cunku panel zaten daima acik. */}
      <button
        onClick={() => setShowLayersPanel((prev) => !prev)}
        className="sm:hidden absolute top-[10rem] left-4 z-[1000] bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-xl shadow-lg p-3 border border-transparent dark:border-gray-700 transition-colors duration-300"
        title="Harita Katmanlari"
      >
        <Layers size={20} className="text-gray-700 dark:text-gray-200" />
      </button>

      {/* Sol Harita Gorunumu Paneli.
          Mobilde varsayilan gizli (Analizi Baslat paneliyle cakismasin diye),
          yukaridaki dugmeyle acilir/kapanir. sm: ve ustunde daima gorunur. */}

      <div
        className={`${showLayersPanel ? 'block' : 'hidden'} sm:block absolute top-[10rem] sm:top-24 left-4 z-[1000] bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-2xl shadow-xl p-4 w-64 max-w-[calc(100vw-2rem)] border border-transparent dark:border-gray-700 transition-colors duration-300`}
      >

        {/* Mobilde panel icinde kapatma dugmesi; sm: ve ustunde gerek yok. */}
        <div className="flex items-center justify-between mb-2 sm:hidden">
          <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
            Harita Ayarlari
          </span>
          <button onClick={() => setShowLayersPanel(false)}>
            <X size={18} className="text-gray-500 dark:text-gray-300" />
          </button>
        </div>

        <h3 className="hidden sm:block text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 transition-colors duration-300">
          Harita Görünümü
        </h3>

        <div className="flex flex-col gap-1 bg-gray-100 dark:bg-gray-900 rounded-xl p-1 mb-0 sm:mb-4 transition-colors duration-300">

          {/* NORMAL */}

          <button
            onClick={() =>
              handleBaseMapChange(
                'normal'
              )
            }
            className={`flex-1 text-xs sm:text-sm font-medium py-1.5 sm:py-2 rounded-lg transition-colors duration-300 ${
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
            className={`flex-1 text-xs sm:text-sm font-medium py-1.5 sm:py-2 rounded-lg transition-colors duration-300 ${
              baseMap ===
              'satellite'
                ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Uydu
          </button>

        </div>

        {/* KATMANLAR — mobilde gizli, sadece Normal/Uydu kalsin */}

        <div className="hidden sm:block">

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

        {/* /hidden sm:block (Katmanlar + Yogunluk) */}

        </div>

      </div>

    </div>
  );
}