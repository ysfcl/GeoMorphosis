"use client";

import { useEffect, useRef, useState } from 'react';
import { Layers, X } from 'lucide-react';
import { MAX_SELECTION_AREA_M2, MAX_SELECTION_AREA_KM2 } from '@/lib/mapLimits';

const MAX_AREA_SQ_METERS = MAX_SELECTION_AREA_M2;

// Backend'in dondurdugu kategori -> yuzde eslemesi (Analytics/index.js ile
// ayni sabitler). pollution_score sayisal olarak gelmediginde fallback icin.
const RISK_PERCENT = { yok: 0, dusuk: 0.28, orta: 0.58, yuksek: 0.9 };

function normalizeRisk(value) {
  if (!value) return 'yok';
  return String(value).toLowerCase();
}

const METERS_PER_DEG_LAT = 111320;

// Secilen bolgenin merkezi etrafinda, verilen yogunluga (0-1) sahip rastgele
// dagilmis isi noktalari uretir. Backend tek bir skaler deger dondurdugu icin
// (piksel piksel harita yok), gercek veriyi gorsel bir isi bulutuna
// donusturmenin en basit yolu bu: merkeze yakin noktalar daha yogun,
// disa dogru hafif dogal bir dagilim.
function generateHeatPoints(centerLat, centerLon, radiusMeters, intensity, count = 18) {
  if (!intensity || intensity <= 0) return [];

  const points = [];
  const latDegPerMeter = 1 / METERS_PER_DEG_LAT;
  const lonDegPerMeter =
    1 / (METERS_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180) || 1);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    // sqrt(random) ile noktalari merkeze dogru yogunlastiriyoruz
    const distance = Math.sqrt(Math.random()) * radiusMeters;

    const dLat = distance * Math.sin(angle) * latDegPerMeter;
    const dLon = distance * Math.cos(angle) * lonDegPerMeter;

    const jitter = (Math.random() - 0.5) * 0.15;
    const pointIntensity = Math.min(1, Math.max(0, intensity + jitter));

    points.push([centerLat + dLat, centerLon + dLon, pointIntensity]);
  }

  // Merkeze guclu bir nokta ekleyerek odagin net gorunmesini sagliyoruz.
  points.push([centerLat, centerLon, Math.min(1, intensity)]);

  return points;
}

export default function Map({ onRegionSelect, isDarkMode, selectedRegion, analysisResult }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef({});

  const [baseMap, setBaseMap] = useState('normal');
  const [activeOverlays, setActiveOverlays] = useState({
    pollution: false,
    vegetation: true,
  });
  // Mobilde harita ayarlari paneli varsayilan olarak kapali; Analizi Baslat
  // paneliyle cakismamasi icin bir dugmeyle acilip kapaniyor. sm: ve
  // ustunde bu state'e bakilmaksizin panel her zaman gorunur.
  const [showLayersPanel, setShowLayersPanel] = useState(false);

  // NOT: onRegionSelect kasitli olarak bagimlilik listesinde degil.
  // Bu bir callback prop'u; degismesi haritanin tamamen yeniden
  // kurulmasini (ve cizilen sekillerin/isi haritasinin kaybolmasini)
  // gerektirmez. Guncel referansa bir ref uzerinden erisiyoruz.
  const onRegionSelectRef = useRef(onRegionSelect);
  useEffect(() => {
    onRegionSelectRef.current = onRegionSelect;
  }, [onRegionSelect]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      await import('leaflet.heat');

      await import('leaflet-draw/dist/leaflet.draw.css');
      await import('leaflet-draw');

      if (mapInstanceRef.current) return;

      // --- ALAN HESAPLAMA & SINIRLANDIRMA FONKSIYONLARI ---
      const calculateGeodesicArea = (latLngs) => {
        return L.GeometryUtil
          ? L.GeometryUtil.geodesicArea(latLngs)
          : computeApproxArea(latLngs);
      };

      // Basit geodesic alan hesabi
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

      // Dikdortgen cizilirken sinir asiminda farenin gidebilecegi maksimum noktayi hesaplar
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

      // Leaflet.Draw Dikdortgen Surukleme Davranisini Genisletme
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
      // NORMAL HARITA
      // ====================================================

      const normalMap = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 19,
        }
      );

      // ====================================================
      // DARK HARITA
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
      // UYDU HARITASI
      // ====================================================

      const satelliteMap = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles (c) Esri',
          maxZoom: 19,
        }
      );

      if (isDarkMode) {
        darkMap.addTo(map);
      } else {
        normalMap.addTo(map);
      }

      // ====================================================
      // ISI HARITASI KATMANLARI
      // Baslangicta bos: sabit/mock veri yerine yalnizca gercek bir bolge
      // secilip analiz tamamlandiginda dolduruluyor (asagidaki ayri effect).
      // ====================================================

      const pollutionLayer =
        L.heatLayer(
          [],
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

      const vegetationLayer =
        L.heatLayer(
          [],
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
      // AKTIF KATMANLAR
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
      // ALAN SECILDIGINDE
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
          // MAKSIMUM ALAN KONTROLU
          // ==================================================

          if (
            drawnArea >
            MAX_AREA_SQ_METERS
          ) {
            alert(
              `Secilen alan maksimum siniri (${(
                MAX_AREA_SQ_METERS /
                1000000
              ).toFixed(
                0
              )} km2) asiyor! Lutfen daha kucuk bir alan secin.`
            );

            return;
          }

          // ==================================================
          // SECILEN ALANI EKLE
          // ==================================================

          drawnItems.addLayer(layer);

          // ==================================================
          // GEOJSON
          // ==================================================

          const geoJsonData =
            layer.toGeoJSON();

          console.log(
            'Uretilen GeoJSON Verisi:',
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
          // PARENT COMPONENT'E GONDER
          // ==================================================

          onRegionSelectRef.current?.({
            geoJson:
              geoJsonData,

            lat: center.lat,

            lon: center.lng,

            radius: 1000,

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
    isDarkMode
  ]);

  // ========================================================
  // ISI HARITASI VERISINI GERCEK ANALIZE GORE GUNCELLE
  // Secilen bolge veya analiz sonucu degistiginde, heatLayer'lari
  // (mock veri yerine) gercek NDVI / kirlilik degerlerinden uretilen
  // noktalarla yeniden dolduruyoruz.
  // ========================================================
  useEffect(() => {
    const map = mapInstanceRef.current;
    const { pollutionLayer, vegetationLayer } = layersRef.current;

    if (!map || !pollutionLayer || !vegetationLayer) return;

    // Henuz bolge secilmediyse veya analiz sonucu yoksa katmanlari bosalt;
    // eski/baska bir bolgenin isi haritasi ekranda kalmasin.
    if (
      !selectedRegion ||
      typeof selectedRegion.lat !== 'number' ||
      typeof selectedRegion.lon !== 'number' ||
      !analysisResult
    ) {
      pollutionLayer.setLatLngs([]);
      vegetationLayer.setLatLngs([]);
      return;
    }

    const radiusMeters = selectedRegion.area_sq_meters
      ? Math.sqrt(selectedRegion.area_sq_meters / Math.PI)
      : selectedRegion.radius || 900;

    // NDVI 0-1 araliginda bir deger; dogrudan yogunluk olarak kullanilabilir.
    const ndviIntensity =
      typeof analysisResult.ndvi_score === 'number'
        ? Math.min(1, Math.max(0, analysisResult.ndvi_score))
        : 0;

    // Kirlilik icin backend gercek sayisal skor (pollution_score, 0-100)
    // dondurdugunde onu kullaniyoruz; dondurmuyorsa kategori tabanli sabit
    // orana geri donuyoruz (Analytics/index.js ile ayni mantik).
    const pollutionIntensity =
      typeof analysisResult.pollution_score === 'number'
        ? Math.min(1, Math.max(0, analysisResult.pollution_score / 100))
        : RISK_PERCENT[normalizeRisk(analysisResult.pollution_level)] ?? 0;

    vegetationLayer.setLatLngs(
      generateHeatPoints(
        selectedRegion.lat,
        selectedRegion.lon,
        radiusMeters,
        ndviIntensity
      )
    );

    pollutionLayer.setLatLngs(
      generateHeatPoints(
        selectedRegion.lat,
        selectedRegion.lon,
        radiusMeters,
        pollutionIntensity
      )
    );
  }, [selectedRegion, analysisResult]);

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
  // BASE MAP DEGISTIRME
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
      label: 'Kirlilik Katmani',
      color: 'bg-blue-500'
    },

    {
      key: 'vegetation',
      label: 'NDVI (Bitki Ortusu)',
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

      {/* Mobilde Harita Gorunumu panelini acan/kapatan dugme.
          sm: ve ustunde gorunmez, cunku panel zaten daima acik. */}
      <button
        onClick={() => setShowLayersPanel((prev) => !prev)}
        className="sm:hidden absolute top-24 left-4 z-[1000] bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-xl shadow-lg p-3 border border-transparent dark:border-gray-700 transition-colors duration-300"
        title="Harita Katmanlari"
      >
        <Layers size={20} className="text-gray-700 dark:text-gray-200" />
      </button>

      {/* Sol Harita Gorunumu Paneli.
          Mobilde varsayilan gizli (Analizi Baslat paneliyle cakismasin diye),
          yukaridaki dugmeyle acilir/kapanir. sm: ve ustunde daima gorunur. */}

      <div
        className={`${showLayersPanel ? 'block' : 'hidden'} sm:block absolute top-24 left-4 z-[1000] bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-2xl shadow-xl p-4 w-64 max-w-[calc(100vw-2rem)] border border-transparent dark:border-gray-700 transition-colors duration-300`}
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

        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 transition-colors duration-300">
          Harita Gorunumu
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

        {/* YOGUNLUK */}

        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">

          <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
            Yogunluk
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
              Dusuk
            </span>

            <span
              className="w-4 h-4 rounded-full"
              style={{
                background:
                  '#172554'
              }}
            />

            <span className="text-[11px] text-gray-500">
              Yuksek
            </span>

          </div>

        </div>

      </div>

    </div>
  );
}