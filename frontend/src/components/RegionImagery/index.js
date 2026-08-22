'use client';

import { useState } from 'react';
import ImageCompare from '@/components/ImageCompare';
import DetectionOverlay from '@/components/DetectionOverlay';

// FastAPI /images endpoint'ine next.config.js'teki /api/ai/:path* rewrite'i
// uzerinden gidiyoruz; boylece CORS ve ek port acma ihtiyaci yok.
function imageUrl({ lat, lon, year, kind }) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), kind });
  if (year != null) params.set('year', String(year));
  return `/api/ai/images?${params.toString()}`;
}

function Placeholder({ children }) {
  return (
    <div className="w-full aspect-square rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center p-8">
      <p className="text-center text-gray-500 dark:text-gray-400">{children}</p>
    </div>
  );
}

export default function RegionImagery({ data }) {
  const [tab, setTab] = useState('satellite');
  const [overlayOpacity, setOverlayOpacity] = useState(75);
  const [failed, setFailed] = useState(false);

  const images = data?.images;
  const coordinates = data?.coordinates;
  const detections = data?.ai_results?.yolo_detections ?? [];

  const years = images?.years ?? [];
  const size = images?.size ?? 512;
  const changeMap = images?.change_map ?? null;
  const hasCoordinates =
    typeof coordinates?.lat === 'number' && typeof coordinates?.lon === 'number';

  const canShowImages = Boolean(images?.available) && years.length > 0 && hasCoordinates;

  const firstYear = years[0];
  const lastYear = years[years.length - 1];
  const build = (year, kind) =>
    imageUrl({ lat: coordinates.lat, lon: coordinates.lon, year, kind });

  const renderSatellite = () => {
    if (failed) {
      return <Placeholder>Uydu görüntüsü yüklenemedi. Analizi yeniden çalıştırmayı deneyin.</Placeholder>;
    }

    // Karsilastirma icin en az iki yil gerekiyor
    if (years.length < 2) {
      return (
        <div className="relative w-full aspect-square overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-700">
          <img
            src={build(lastYear, 'rgb')}
            alt={`${lastYear} yılı uydu görüntüsü`}
            onError={() => setFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <DetectionOverlay detections={detections} size={size} />
          <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/60 text-white text-sm font-semibold">
            {lastYear}
          </span>
        </div>
      );
    }

    return (
      <ImageCompare
        beforeSrc={build(firstYear, 'rgb')}
        afterSrc={build(lastYear, 'rgb')}
        beforeLabel={String(firstYear)}
        afterLabel={String(lastYear)}
        onError={() => setFailed(true)}
      >
        {/* Tespitler son yilin goruntusu uzerinde calisti */}
        <DetectionOverlay detections={detections} size={size} />
      </ImageCompare>
    );
  };

  const renderChangeMap = () => (
    <>
      <div className="relative w-full aspect-square overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-700">
        <img
          src={build(lastYear, 'rgb')}
          alt="Uydu görüntüsü"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <img
          src={build(null, 'diff')}
          alt="NDVI değişim haritası"
          style={{ opacity: overlayOpacity / 100 }}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <label className="flex items-center gap-3 flex-1">
          <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
            Katman opaklığı
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={overlayOpacity}
            onChange={(e) => setOverlayOpacity(Number(e.target.value))}
            className="flex-1 accent-blue-600"
          />
        </label>

        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
            <span className="w-3 h-3 rounded-full bg-red-500" /> Bitki kaybı
          </span>
          <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
            <span className="w-3 h-3 rounded-full bg-green-500" /> Artış
          </span>
        </div>
      </div>

      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
        {changeMap.from_year} ve {changeMap.to_year} yılları arasındaki NDVI farkı.
        Kırmızı alanlar panelde yazan bitki örtüsü kaybının nerede gerçekleştiğini gösteriyor.
      </p>
    </>
  );

  const tabClass = (name) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      tab === name
        ? 'bg-blue-600 text-white'
        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
    }`;

  return (
    // bg-white yerine bg-white/95: Bootstrap'in .bg-white kurali !important
    // tasidigi icin Tailwind'in dark:bg-gray-800'unu eziyor ve gece modunda
    // kart beyaz kaliyor. Opaklik ekli sinif Bootstrap seciciyle eslesmiyor.
    <div className="bg-white/95 dark:bg-gray-800 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 p-8 transition-colors duration-300">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <h3 className="text-2xl font-bold text-gray-800 dark:text-white">
          🛰️ Bölge Görünümü
        </h3>

        {canShowImages && changeMap && (
          <div className="flex gap-2">
            <button onClick={() => setTab('satellite')} className={tabClass('satellite')}>
              Uydu Görüntüsü
            </button>
            <button onClick={() => setTab('change')} className={tabClass('change')}>
              Değişim Haritası
            </button>
          </div>
        )}
      </div>

      {!canShowImages ? (
        <Placeholder>
          {data?.demo_mode
            ? 'Uydu verisi alınamadığı için görüntü gösterilemiyor. Google Earth Engine erişimi sağlandığında bu alan dolacak.'
            : 'Bu analiz için uydu görüntüsü bulunamadı.'}
        </Placeholder>
      ) : tab === 'change' && changeMap ? (
        renderChangeMap()
      ) : (
        renderSatellite()
      )}

      {canShowImages && tab === 'satellite' && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          {years.length >= 2
            ? 'Ortadaki tutamağı sürükleyerek iki yılı karşılaştırın.'
            : 'Karşılaştırma için en az iki yıla ait görüntü gerekiyor.'}
          {detections.length > 0 && ` Kutular modelin ${lastYear} görüntüsünde tespit ettiği alanları gösteriyor.`}
        </p>
      )}
    </div>
  );
}
