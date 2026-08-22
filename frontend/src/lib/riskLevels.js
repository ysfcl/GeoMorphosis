// Risk seviyesi etiketleri ve yuzde karsiliklari icin tek adres.
// Analytics, Report ve sayfa kartlari bu sabitleri paylasir; ayri tanimlar
// zamanla kayar (ornegin "yok" icin farkli yuzdeler).

export const RISK_LABELS = { yok: 'Yok', dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' };

// "yok" gercekten 0'dir; diger seviyeler gorsel olcegin dilimleri.
export const RISK_PERCENT = { yok: 0, dusuk: 28, orta: 58, yuksek: 90 };

export function normalizeRisk(value) {
  const normalized = String(value ?? '').toLowerCase().trim();
  // Eksik/bos deger "tespit yok" anlamina gelir.
  return normalized || 'yok';
}

/**
 * Pay metni: "Yok" YALNIZCA deger gercekten %0 iken soylenir; diger
 * durumlarda yuzde dondurulur ("%58"). Ustteki kart ile alttaki grafik
 * arasindaki tutarsizligi (kart "Yok" derken pastada dilim gorunmesi)
 * yapisal olarak engeller.
 */
export function formatRiskShare(level) {
  const percent = RISK_PERCENT[normalizeRisk(level)] ?? 0;
  return percent === 0 ? 'Yok' : `%${percent}`;
}
