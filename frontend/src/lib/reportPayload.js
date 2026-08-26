// Son tamamlanan analizi HAM haliyle saklar/yukler. E-posta ve Telegram
// bildirim yollari da ayni ham sonucu bekler; PDF uretiminin kendisi
// lib/pdfReport.js > buildAnalysisReportPdf icinde yapilir.
//
// Anasayfa/bolge polling'i saveLastReport ile localStorage'a yazar;
// /api/verify dogrulama sonrasi "ilk raporu hemen gonder" icin
// loadLastReport ile ayni ham veriyi tasir.

export function saveLastReport(result) {
  if (typeof window === 'undefined') return;
  try {
    if (result) {
      window.localStorage.setItem('gm_last_report', JSON.stringify(result));
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

/** Bildirim metinlerinde kullanilan kisa ozet (e-posta + Telegram ortak). */
export function summarizeAnalysis(result) {
  const deforestation = result?.ai_results?.change_detection?.deforestation ?? {};
  const lossPercent = Number.isFinite(deforestation.loss_percentage)
    ? ` (%${deforestation.loss_percentage})`
    : '';
  return (
    `Ormansızlaşma riski ${result?.deforestation_risk ?? 'bilinmiyor'}${lossPercent}, ` +
    `kirlilik seviyesi ${result?.pollution_level ?? 'bilinmiyor'} olarak hesaplandı.`
  );
}
