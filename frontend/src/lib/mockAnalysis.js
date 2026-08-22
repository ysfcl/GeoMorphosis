// AI Engine ve Worker servisleri olmadan detaylı analiz sayfalarını
// gösterebilmek için kullanılan demo veri üreticisi.
// Gerçek backend'e ulaşılamadığında (502/404) bu veri döndürülür.

const REGIONS = {
  bursa: { name: 'Bursa', ndvi: 0.68, deforestation: 'dusuk', pollution: 'orta' },
  istanbul: { name: 'İstanbul', ndvi: 0.42, deforestation: 'orta', pollution: 'yuksek' },
  marmaris: { name: 'Marmaris', ndvi: 0.71, deforestation: 'dusuk', pollution: 'yok' },
  ankara: { name: 'Ankara', ndvi: 0.35, deforestation: 'dusuk', pollution: 'orta' },
  default: { name: 'Bölge', ndvi: 0.55, deforestation: 'dusuk', pollution: 'orta' },
};

function pickRegion(lat, lon) {
  if (lat > 39.5 && lat < 40.5 && lon > 28 && lon < 30) return REGIONS.bursa;
  if (lat > 40.5 && lat < 41.5 && lon > 28 && lon < 30) return REGIONS.istanbul;
  if (lat > 36 && lat < 37.2 && lon > 28 && lon < 29) return REGIONS.marmaris;
  if (lat > 39 && lat < 40.5 && lon > 32 && lon < 33.5) return REGIONS.ankara;
  return REGIONS.default;
}

export function buildMockAnalysis({ taskId, lat, lon, regionName }) {
  const region = pickRegion(lat, lon);

  return {
    status: 'completed',
    task_id: taskId,
    demo: true,
    message: 'Demo veri: AI Engine ve Worker servisleri olmadan örnek analiz sonucu.',
    result: {
      region_name: regionName || region.name,
      ndvi_score: region.ndvi,
      deforestation_risk: region.deforestation,
      pollution_level: region.pollution,
      status: 'completed',
      timestamp: new Date().toISOString(),
      generated_path: [
        { lat: lat + 0.003, lon: lon + 0.002 },
        { lat: lat - 0.002, lon: lon + 0.004 },
        { lat: lat + 0.001, lon: lon - 0.003 },
        { lat: lat - 0.004, lon: lon - 0.001 },
        { lat: lat + 0.005, lon: lon + 0.001 },
      ],
    },
  };
}
