/**
 * PDF raporu icin varlik yukleyicileri.
 *
 * Font ve goruntuler bilerek ana bundle'a gomulmedi; ikisi de yalnizca
 * kullanici raporu indirdiginde aginden iniyor.
 */

const FONT_FAMILY = 'Roboto';

const FONT_FILES = [
  { file: 'Roboto-Regular.ttf', style: 'normal' },
  { file: 'Roboto-Bold.ttf', style: 'bold' },
];

/** ArrayBuffer'i jsPDF'in bekledigi base64 metnine cevirir. */
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Tek seferde apply etmek buyuk dosyalarda cagri yigini tasmasina yol aciyor
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Turkce destekli fontu PDF'e gomer.
 *
 * jsPDF'in varsayilan fontlari WinAnsi kodlamasi kullaniyor; bu kodlama
 * ı, ğ, ş karakterlerini icermiyor ve rapor "Bolge", "Ormansizlasma" gibi
 * bozuk metinlerle uretiliyordu.
 *
 * @returns {Promise<boolean>} font yuklendiyse true
 */
export async function embedTurkishFont(doc) {
  try {
    const loaded = await Promise.all(
      FONT_FILES.map(async ({ file, style }) => {
        const response = await fetch(`/fonts/${file}`);
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
    // Font inmezse rapor yine uretilsin; yalnizca Turkce karakterler bozulur.
    console.warn('PDF fontu yüklenemedi, varsayılan fonta düşülüyor:', error);
    return false;
  }
}

/** Bir goruntuyu yukler; basarisiz olursa null doner (rapor yine uretilir). */
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function toCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// Uydu karolari fotograf oldugu icin JPEG kullaniyoruz: PNG ile uretilen rapor
// 3 MB'a cikiyordu, JPEG'de gorsel fark edilmeden bunun cok altina iniyor.
const JPEG_QUALITY = 0.85;

/** Tek bir uydu karosunu JPEG data URL'ine cevirir. */
export async function fetchTileDataUrl(src) {
  const img = await loadImage(src);
  if (!img) return null;

  const canvas = toCanvas(img.naturalWidth || 512, img.naturalHeight || 512);
  const ctx = canvas.getContext('2d');
  // JPEG saydamlik tasimadigi icin once beyaz zemin
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

/**
 * Degisim haritasini uydu goruntusunun uzerine bindirip tek bir goruntu uretir.
 *
 * Arayuzde bu bindirme CSS opaklikla yapiliyor; PDF'te katman/opaklik
 * kavrami olmadigi icin iki goruntu burada canvas'ta birlestiriliyor.
 */
export async function composeChangeMapDataUrl(baseSrc, overlaySrc, opacity = 0.75) {
  const [base, overlay] = await Promise.all([loadImage(baseSrc), loadImage(overlaySrc)]);
  if (!base) return null;

  const canvas = toCanvas(base.naturalWidth || 512, base.naturalHeight || 512);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(base, 0, 0, canvas.width, canvas.height);

  if (overlay) {
    ctx.globalAlpha = opacity;
    ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

/** FastAPI /images endpointi icin URL kurar (RegionImagery ile ayni desen). */
export function analysisImageUrl({ lat, lon, year, kind }) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), kind });
  if (year != null) params.set('year', String(year));
  return `/api/ai/images?${params.toString()}`;
}
