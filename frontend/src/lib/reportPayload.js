// Son tamamlanan analizi, e-posta raporunun bekledigi sekle cevirir.
// Anasayfa/bolge polling'i bunu localStorage'a yazar; /api/verify dogrulama
// sonrasi "ilk raporu hemen gonder" icin ayni sekli kullanir.

export function buildReportPayload(result) {
  if (!result) return null;

  const deforestation = result?.ai_results?.change_detection?.deforestation ?? {};
  const coordinates = result?.coordinates ?? {};

  return {
    lat: coordinates.lat,
    lng: coordinates.lon,
    regionName: result?.region_name || null,
    taskId: result?.task_id || null,
    riskLevel: result?.deforestation_risk || 'normal',
    pollutionLevel: result?.pollution_level || null,
    aod: typeof result?.pollution_aod === 'number' ? result.pollution_aod : NaN,
    lossPercent: Number.isFinite(deforestation.loss_percentage)
      ? deforestation.loss_percentage
      : typeof result?.deforestation_loss_percent === 'number'
        ? result.deforestation_loss_percent
        : NaN,
    ndviScore: typeof result?.ndvi_score === 'number' ? result.ndvi_score : NaN,
    detectionCount: Array.isArray(result?.ai_results?.yolo_detections)
      ? result.ai_results.yolo_detections.length
      : 0,
    demoMode: Boolean(result?.demo_mode),
    summary:
      `Ormansızlaşma riski ${result?.deforestation_risk ?? 'bilinmiyor'}, ` +
      `kirlilik seviyesi ${result?.pollution_level ?? 'bilinmiyor'} olarak hesaplandı.`,
  };
}

export function saveLastReport(result) {
  if (typeof window === 'undefined') return;
  try {
    const payload = buildReportPayload(result);
    if (payload) {
      window.localStorage.setItem('gm_last_report', JSON.stringify(payload));
    }
  } catch {
    // localStorage dolu/kapali olabilir; rapor saklama kritik degil.
  }
}

export function loadLastReport() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem('gm_last_report') || 'null');
  } catch {
    return null;
  }
}

// jsPDF standart fontlari (WinAnsi) su Turkce karakterleri bilmez:
// g, i, s, I -> PDF'e yazmadan once guvenli karsiliklarina cevrilir.
function trSafe(text) {
  return String(text ?? '-')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ı/g, 'i').replace(/İ/g, 'I');
}

// Analiz raporunu tek sayfalik PDF'e doker; Buffer dondurur (nodemailer eki).
export function buildAnalysisPdf(report) {
  const { jsPDF } = require('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  const num = (v, suffix = '') =>
    Number.isFinite(v) ? `${v}${suffix}` : 'Olculemedi';
  const levelTr = { dusuk: 'Dusuk', orta: 'Orta', yuksek: 'Yuksek', yok: 'Yok' };

  // Baslik bandi
  doc.setFillColor(16, 94, 62);
  doc.rect(0, 0, W, 90, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold').setFontSize(22);
  doc.text(trSafe('GeoMorphosis Analiz Raporu'), 40, 42);
  doc.setFont('helvetica', 'normal').setFontSize(11);
  doc.text(
    trSafe(`Uretim tarihi: ${new Date().toLocaleString('tr-TR')}`),
    40,
    66
  );

  // Ozet kartlari
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold').setFontSize(14);
  doc.text(trSafe('Bolge Bilgisi'), 40, 130);

  const rows = [
    ['Bolge adi', trSafe(report.regionName || 'Isimsiz bolge')],
    ['Konum', `${num(report.lat)}, ${num(report.lng)}`],
    ['Risk seviyesi', trSafe(levelTr[report.riskLevel] || report.riskLevel || '-')],
    ['NDVI skoru', num(report.ndviScore)],
    ['Ormansizlasma kaybi', num(report.lossPercent, '%')],
    ['Kirlilik seviyesi', trSafe(levelTr[report.pollutionLevel] || report.pollutionLevel || '-')],
    ['MODIS AOD', num(report.aod)],
    ['AI tespit sayisi', String(report.detectionCount ?? 0)],
    ['Veri modu', report.demoMode ? 'Demo (uydu verisi alinamadi)' : 'Gercek uydu verisi'],
  ];

  doc.setFont('helvetica', 'normal').setFontSize(12);
  let y = 158;
  rows.forEach(([label, value]) => {
    doc.setTextColor(110, 110, 110);
    doc.text(label, 40, y);
    doc.setTextColor(20, 20, 20);
    doc.text(String(value), 220, y);
    y += 24;
  });

  // Ozet paragrafi
  doc.setDrawColor(210, 210, 210);
  doc.line(40, y + 6, W - 40, y + 6);
  doc.setFontSize(11);
  doc.setTextColor(70, 70, 70);
  doc.text(doc.splitTextToSize(trSafe(report.summary || ''), W - 80), 40, y + 28);

  doc.setFontSize(9).setTextColor(150, 150, 150);
  doc.text(
    trSafe('Bu rapor GeoMorphosis tarafindan otomatik olusturulmustur · geomorphosis.com.tr'),
    40,
    800
  );

  return Buffer.from(doc.output('arraybuffer'));
}
