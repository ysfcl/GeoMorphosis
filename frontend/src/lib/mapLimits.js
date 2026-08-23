// Harita uzerinde secilebilecek maksimum alan siniri.
// Hem Map bileseni (cizim sinirlama) hem de ana sayfa paneli (bilgi gosterimi)
// bu sabiti kullanir; limit tek yerden yonetilir.
export const MAX_SELECTION_AREA_KM2 = 25;
export const MAX_SELECTION_AREA_M2 = MAX_SELECTION_AREA_KM2 * 1000 * 1000;

// Analiz buffer yariçapi sinirlari. AI motoru yarıçapı kare pencereye
// cevirdiginden (point.buffer(r).bounds()) islenen alan (2r)^2 olur.
export const MIN_ANALYSIS_RADIUS_M = 1000;
export const MAX_ANALYSIS_RADIUS_M = 5000;

// Cizilen alani (m2) analiz buffer yarıçapina (metre) cevirir.
// Alan eşdeğer dairenin yarıçapı kullanilir: r = sqrt(A / pi).
// Küçük çizimler eski davranista ayni kaliyor (taban 1000m); buyuk
// cizimler GEE kotasi ve onbellek boyutu korunarak 5000m ile sinirli.
export function deriveRadiusFromArea(areaSqMeters) {
  if (!Number.isFinite(areaSqMeters) || areaSqMeters <= 0) {
    return MIN_ANALYSIS_RADIUS_M;
  }
  const radius = Math.round(Math.sqrt(areaSqMeters / Math.PI));
  return Math.min(MAX_ANALYSIS_RADIUS_M, Math.max(MIN_ANALYSIS_RADIUS_M, radius));
}
