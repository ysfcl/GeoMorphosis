/**
 * Ortak PDF rapor uretici.
 *
 * Hem tarayici (Report bileşenindeki "PDF Indir") hem de sunucu tarafi
 * (/api/verify karsilama raporu ve worker tetikli abone bildirimi e-posta
 * eki) AYNI fonksiyonu kullanir; boylece e-postaya giden rapor
 * arayuzden indirilenle birebir ayni olur.
 *
 * Sunucu tarafinda Image/canvas bulunmadigi icin goruntuler dogrudan
 * fetch edilip jsPDF'e gomulur; degisim haritasi bindirmesi canvas yerine
 * jsPDF GState opakligi ile yapilir (arayüzdeki %75 opaklik katmaninin
 * PDF karsiligi).
 */

import { jsPDF } from 'jspdf';

const RISK_LABELS = { yok: 'Yok', dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' };
const SEVERITY_LABELS = { CRITICAL: 'Kritik', HIGH: 'Yüksek', LOW: 'Düşük' };

// A4: 210 x 297 mm
const PAGE = { width: 210, height: 297, margin: 20 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

const FONT_FAMILY = 'Roboto';

const FONT_FILES = [
  { file: 'Roboto-Regular.ttf', style: 'normal' },
  { file: 'Roboto-Bold.ttf', style: 'bold' },
];

function riskLabel(value) {
  if (!value) return 'Bilinmiyor';
  return RISK_LABELS[String(value).toLowerCase()] ?? value;
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

/** Rapordaki tum degerleri tek yerden turetiyoruz; ekranla ayni kaynak. */
export function readAnalysis(data) {
  const ai = data?.ai_results ?? {};
  const deforestation = ai.change_detection?.deforestation ?? {};
  const metrics = ai.environmental_metrics ?? {};
  const detections = ai.yolo_detections ?? [];

  return {
    regionName: data?.region_name || 'Bilinmeyen Bölge',
    coordinates: data?.coordinates ?? null,
    ndvi: data?.ndvi_score ?? 0,
    ndviChange: metrics.ndvi_change ?? 0,
    // Sozlesme (feature/ML): risk seviyeleri duz alanlardan okunur.
    deforestationRisk: riskLabel(data?.deforestation_risk),
    pollutionLevel: riskLabel(data?.pollution_level),
    pollutionAod:
      typeof data?.pollution_aod === 'number' ? data.pollution_aod : null,
    deforestationSeverity: SEVERITY_LABELS[deforestation.severity] ?? 'Bilinmiyor',
    deforestationPercent: clampPercent(
      data?.deforestation_loss_percent ??
        (deforestation.detected ? deforestation.loss_percentage : 0)
    ),
    deforestationDetections: Number(data?.deforestation_detections) || 0,
    detectionCount: detections.length,
    demoMode: Boolean(data?.demo_mode),
    modelLoaded: data?.model_loaded !== false,
    images: data?.images ?? null,
    timestamp: data?.timestamp,
  };
}

/** Uint8Array/ArrayBuffer -> jsPDF'in bekledigi base64 (Node + tarayici). */
function toBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  // Tek seferde apply etmek buyuk dosyalarda cagri yigini tasmasina yol aciyor
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  // btoa Node 16+'da globaldir; sunucu tarafinda da calisir.
  return btoa(binary);
}

function resolveUrl(src, baseUrl) {
  return /^https?:\/\//.test(src) ? src : `${baseUrl || ''}${src}`;
}

/** FastAPI /images endpointi icin URL kurar (RegionImagery ile ayni desen). */
export function analysisImageUrl({ lat, lon, year, kind }, baseUrl = '') {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), kind });
  if (year != null) params.set('year', String(year));
  return resolveUrl(`/api/ai/images?${params.toString()}`, baseUrl);
}

/**
 * Bir goruntuyu indirip { base64, format } dondurur; basarisiz olursa null
 * (rapor gorselsiz de uretilmeye devam eder).
 */
async function fetchImage(src) {
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    // ai-engine karolari PNG servis ediyor; JPEG'ler de gelebilecek diye
    // imza baytindan format tespiti yapiyoruz.
    const isPng =
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    return { base64: toBase64(bytes), format: isPng ? 'PNG' : 'JPEG' };
  } catch {
    return null;
  }
}

/**
 * Turkce destekli fontu PDF'e gomer. Font inmezse helvetica'ya duser ve
 * false doner (cagiran taraf yine rapor uretebilmeli).
 *
 * @returns {Promise<boolean>} font yuklendiyse true
 */
async function embedTurkishFont(doc, baseUrl) {
  try {
    const loaded = await Promise.all(
      FONT_FILES.map(async ({ file, style }) => {
        const response = await fetch(`${baseUrl}/fonts/${file}`);
        if (!response.ok) throw new Error(`${file}: ${response.status}`);
        return { file, style, base64: toBase64(await response.arrayBuffer()) };
      })
    );

    loaded.forEach(({ file, style, base64 }) => {
      doc.addFileToVFS(file, base64);
      doc.addFont(file, FONT_FAMILY, style);
    });

    doc.setFont(FONT_FAMILY, 'normal');
    return true;
  } catch (error) {
    console.warn('PDF fontu yüklenemedi, varsayılan fonta düşülüyor:', error);
    return false;
  }
}

/** Uydu goruntulerini ve degisim haritasini ikinci sayfaya ekler. */
async function appendImagery(doc, font, analysis, baseUrl) {
  const images = analysis.images;
  const coords = analysis.coordinates;

  if (
    !images?.available ||
    !coords ||
    !Array.isArray(images.years) ||
    images.years.length === 0
  ) {
    return;
  }

  const url = (year, kind) =>
    analysisImageUrl({ lat: coords.lat, lon: coords.lon, year, kind }, baseUrl);

  const firstYear = images.years[0];
  const lastYear = images.years[images.years.length - 1];

  const [beforeTile, afterTile, changeOverlay] = await Promise.all([
    fetchImage(url(firstYear, 'rgb')),
    fetchImage(url(lastYear, 'rgb')),
    images.change_map ? fetchImage(url(null, 'diff')) : Promise.resolve(null),
  ]);

  if (!beforeTile && !afterTile && !changeOverlay) return;

  doc.addPage();
  doc.setFont(font, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(28, 33, 40);
  doc.text('Uydu Görüntüsü Karşılaştırması', PAGE.margin, 28);

  // Yan yana yerlesim: arayuzdeki kaydiracin PDF karsiligi
  const gap = 6;
  const tileSize = (CONTENT_WIDTH - gap) / 2;
  let y = 36;

  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text(String(firstYear), PAGE.margin, y);
  doc.text(String(lastYear), PAGE.margin + tileSize + gap, y);
  y += 3;

  if (beforeTile) {
    doc.addImage(beforeTile.base64, beforeTile.format, PAGE.margin, y, tileSize, tileSize);
  }
  if (afterTile) {
    doc.addImage(afterTile.base64, afterTile.format, PAGE.margin + tileSize + gap, y, tileSize, tileSize);
  }
  y += tileSize + 12;

  if (changeOverlay && afterTile) {
    doc.setFont(font, 'bold');
    doc.setFontSize(14);
    doc.setTextColor(28, 33, 40);
    doc.text('Değişim Haritası', PAGE.margin, y);
    y += 6;

    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(
      `${images.change_map.from_year}-${images.change_map.to_year} arası NDVI farkı · ` +
        'kırmızı: bitki kaybı, yeşil: artış',
      PAGE.margin,
      y
    );
    y += 4;

    const mapSize = Math.min(tileSize * 1.4, PAGE.height - y - 25);

    // Arayüzdeki gibi: uydu goruntusunun uzerine %75 opak diff katmani.
    // Canvas birlestirmesi sunucuda mumkun olmadigindan jsPDF GState
    // opakligi kullaniliyor; gorsel sonuc ayni.
    doc.addImage(afterTile.base64, afterTile.format, PAGE.margin, y, mapSize, mapSize);
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.75 }));
    doc.addImage(changeOverlay.base64, changeOverlay.format, PAGE.margin, y, mapSize, mapSize);
    doc.restoreGraphicsState();
  }
}

function addFooter(doc, font) {
  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text(
      'Bu rapor GeoMorphosis AI Engine tarafından otomatik üretilmiştir.',
      PAGE.margin,
      PAGE.height - 12
    );
    doc.text(`${page} / ${pageCount}`, PAGE.width - PAGE.margin, PAGE.height - 12, {
      align: 'right',
    });
  }
}

/**
 * Ham analiz sonucundan rapor PDF'ini uretir.
 *
 * @param {object} data  Analiz sonucu (statusData.result ile ayni sekil).
 * @param {string} [baseUrl]  Sunucu tarafinda mutlak adres gerekli
 *   (ornek: http://localhost:3000). Tarayicide bos birakilir.
 * @returns {Promise<jsPDF>} Hazir dokuman; cagiran save() ya da output() yapar.
 */
export async function buildAnalysisReportPdf(data, baseUrl = '') {
  const analysis = readAnalysis(data);

  const doc = new jsPDF();
  const hasFont = await embedTurkishFont(doc, baseUrl);
  const font = hasFont ? 'Roboto' : 'helvetica';

  // --- Sayfa 1: ozet ---
  doc.setFont(font, 'bold');
  doc.setFontSize(20);
  doc.setTextColor(22, 163, 74);
  doc.text('GeoMorphosis Analiz Raporu', PAGE.margin, 28);

  doc.setDrawColor(229, 231, 235);
  doc.line(PAGE.margin, 33, PAGE.width - PAGE.margin, 33);

  doc.setFont(font, 'normal');
  doc.setFontSize(11);
  doc.setTextColor(107, 114, 128);

  const generatedAt = analysis.timestamp
    ? new Date(analysis.timestamp).toLocaleString('tr-TR')
    : new Date().toLocaleString('tr-TR');

  doc.text(`Bölge: ${analysis.regionName}`, PAGE.margin, 42);
  doc.text(`Rapor tarihi: ${generatedAt}`, PAGE.margin, 48);

  if (analysis.coordinates) {
    const { lat, lon, buffer_meters: buffer } = analysis.coordinates;
    const coordText =
      typeof lat === 'number' && typeof lon === 'number'
        ? `Koordinat: ${lat.toFixed(4)}, ${lon.toFixed(4)} · Tampon: ${buffer} m`
        : `Tampon: ${buffer} m`;
    doc.text(coordText, PAGE.margin, 54);
  }

  // Olcum tablosu
  const deforestationValue =
    analysis.deforestationRisk +
    ` (%${analysis.deforestationPercent})` +
    (analysis.deforestationPercent === 0 && analysis.deforestationDetections > 0
      ? ` · ${analysis.deforestationDetections} tespit`
      : '');
  const pollutionValue =
    analysis.pollutionLevel +
    (analysis.pollutionAod != null
      ? ` (AOD ${analysis.pollutionAod.toFixed(2)})`
      : '');

  const rows = [
    ['NDVI skoru', String(analysis.ndvi)],
    ['NDVI değişimi', `${analysis.ndviChange > 0 ? '+' : ''}${analysis.ndviChange}`],
    ['Ormansızlaşma', deforestationValue],
    ['Kirlilik', pollutionValue],
    ['Model tespiti', `${analysis.detectionCount} adet`],
  ];

  let y = 66;
  doc.setFontSize(12);
  doc.setFont(font, 'bold');
  doc.setTextColor(28, 33, 40);
  doc.text('Model Sonuçları', PAGE.margin, y);
  y += 8;

  doc.setFontSize(11);
  rows.forEach(([label, value]) => {
    doc.setFont(font, 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(label, PAGE.margin, y);
    doc.setFont(font, 'bold');
    doc.setTextColor(28, 33, 40);
    doc.text(value, PAGE.margin + 70, y);
    doc.setDrawColor(240, 241, 243);
    doc.line(PAGE.margin, y + 2.5, PAGE.width - PAGE.margin, y + 2.5);
    y += 10;
  });

  // Verinin nereden geldigi konusunda seffaf ol
  y += 4;
  doc.setFont(font, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(156, 163, 175);

  if (analysis.demoMode) {
    doc.text(
      'Uyarı: Uydu verisi alınamadığı için değerler demo modunda üretilmiştir.',
      PAGE.margin,
      y
    );
    y += 5;
  }
  if (!analysis.modelLoaded) {
    doc.text(
      'Uyarı: Nesne tespit modeli yüklenemedi; risk değerleri yalnızca NDVI değişimine dayanıyor.',
      PAGE.margin,
      y
    );
  }

  // --- Sayfa 2: uydu goruntuleri ---
  await appendImagery(doc, font, analysis, baseUrl);

  addFooter(doc, font);
  return doc;
}
