import { NextResponse } from 'next/server';

/**
 * Konum arama (ileri yonlu geocoding) proxy'si.
 *
 * Tarayici Nominatim'e DOGRUDAN gitmiyor, bu rota uzerinden gidiyor. Uc sebep:
 *
 *  1. Nominatim kimlik belirten bir User-Agent sart kosuyor; tarayici bu
 *     basligi ayarlamaya izin vermez (forbidden header).
 *  2. Ayni sorgu tekrar arandiginda Nominatim'e ikinci istek gitmesin diye
 *     sunucuda onbellek tutuyoruz.
 *  3. Saniyede 1 istek siniri tek yerden uygulanabiliyor.
 *
 * NOT: Nominatim'in kullanim politikasi, her tus vurusunda istek atan otomatik
 * tamamlamayi yasakliyor. Bu yuzden istemci tarafinda arama "Enter'a basinca"
 * tetikleniyor, yazarken degil. Yazarken oneri istenirse NOMINATIM_URL yerine
 * Photon (photon.komoot.io) konabilir; yanit alanlari farkli oldugu icin
 * yalnizca bu dosyadaki donusum degisir.
 */

const NOMINATIM_URL =
  process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';

// Nominatim'in istedigi tanimlayici baslik. Kendi kurulumunuza gecerseniz
// buradaki iletisim adresini guncelleyin.
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  'GeoMorphosis/1.0 (cevresel izleme platformu; https://github.com/ysfcl/GeoMorphosis)';

// Turkiye'yi kapsayan kutu: sol, ust, sag, alt (lon/lat).
// bounded=1 GONDERILMIYOR - bu bir tercih, kisit degil. Turkiye sonuclari one
// cikar ama yurt disi aramalari da calisir; uydu verisi global.
const TURKEY_VIEWBOX = '25.5,42.2,45.0,35.7';

// Nominatim'in viewbox onceligi tek basina fazla agir basiyor: "paris"
// aramasinda Siirt'teki bir koy (importance 0.31) gercek Paris'in (0.90)
// onune geciyordu. Bu yuzden sonuclari kendimiz siraliyoruz:
//
//     skor = importance + (Turkiye'deyse TURKEY_RANK_BONUS)
//
// Bonus, benzer onemdeki iki yerden Turkiye'dekini one alacak kadar buyuk;
// ama arada belirgin onem farki varsa (koy vs. baskent) onu ezmeyecek kadar
// kucuk secildi. Ust sinir bu ornekte: 0.897 - 0.314 = 0.58.
const TURKEY_RANK_BONUS = 0.25;

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;
const RESULT_LIMIT = 5;

// Yer koordinatlari degismez; uzun TTL guvenli.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

// Nominatim politikasi: saniyede en fazla 1 istek. Payi biraz genis tutuyoruz.
const MIN_REQUEST_INTERVAL_MS = 1100;
const UPSTREAM_TIMEOUT_MS = 8000;

const cache = new Map();

// Giden istekleri siraya diziyoruz. Es zamanli iki arama gelirse ikincisi
// birincinin bitmesini ve aradaki sureyi bekler; boylece hiz siniri sadece
// "son istek ne zamandi" kontroluyle degil, gercekten seri sekilde uygulanir.
let requestChain = Promise.resolve();
let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeQuery(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.results;
}

function writeCache(key, results) {
  // Map ekleme sirasini korudugu icin en eski anahtar ilk sirada; basit FIFO
  // tahliye yeterli, LRU'ya gerek yok.
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }

  cache.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Nominatim'e hiz sinirina uyarak tek bir istek atar. */
function fetchFromNominatim(query) {
  const run = requestChain.then(async () => {
    const waitMs = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (waitMs > 0) await sleep(waitMs);

    lastRequestAt = Date.now();

    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: String(RESULT_LIMIT),
      addressdetails: '1',
      'accept-language': 'tr',
      viewbox: TURKEY_VIEWBOX,
    });

    const response = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Nominatim HTTP ${response.status}`);
    }

    return response.json();
  });

  // Zincir kirilmasin: bu istek hata verse bile sonraki aramalar calismali.
  requestChain = run.then(
    () => undefined,
    () => undefined
  );

  return run;
}

/**
 * Nominatim kaydini sadelestirir. Ham yanit disari verilmiyor; hem gereksiz
 * buyuk hem de saglayiciya bagimli.
 */
function toResult(item) {
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const displayName = String(item?.display_name ?? '');
  const name = item?.name || displayName.split(',')[0] || 'Bilinmeyen konum';

  // Nominatim boundingbox sirasi: [guney, kuzey, bati, dogu] (metin olarak).
  // Sirayi cagiran tarafin hatirlamasini beklemek yerine adlandirilmis alan
  // olarak donduruyoruz.
  let bbox = null;
  const raw = item?.boundingbox;
  if (Array.isArray(raw) && raw.length === 4) {
    const [south, north, west, east] = raw.map(Number);
    if ([south, north, west, east].every(Number.isFinite)) {
      bbox = { south, north, west, east };
    }
  }

  const importance = Number(item?.importance);
  const inTurkey =
    String(item?.address?.country_code ?? '').toLowerCase() === 'tr';

  return {
    id: `${item?.osm_type ?? 'x'}-${item?.osm_id ?? `${lat},${lon}`}`,
    name,
    detail: displayName,
    category: item?.addresstype || item?.type || null,
    lat,
    lon,
    bbox,
    // Yalnizca siralama icin; istemciye gonderilmeden once ayikleniyor.
    _score:
      (Number.isFinite(importance) ? importance : 0) +
      (inTurkey ? TURKEY_RANK_BONUS : 0),
  };
}

/** Skora gore siralar ve dahili _score alanini yanittan cikarir. */
function rankResults(items) {
  return items
    .slice()
    .sort((a, b) => b._score - a._score)
    .map(({ _score, ...result }) => result);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = normalizeQuery(searchParams.get('q'));

  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json(
      { error: `Arama en az ${MIN_QUERY_LENGTH} karakter olmali.` },
      { status: 400 }
    );
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: 'Arama metni cok uzun.' }, { status: 400 });
  }


  const cacheKey = query.toLowerCase();
  const cached = readCache(cacheKey);
  if (cached) {
    return NextResponse.json({ results: cached, cached: true });
  }

  try {
    const payload = await fetchFromNominatim(query);
    const results = rankResults(
      (Array.isArray(payload) ? payload : []).map(toResult).filter(Boolean)
    );

    writeCache(cacheKey, results);

    return NextResponse.json({ results, cached: false });
  } catch (error) {
    console.error('Konum arama hatasi:', error.message);
    return NextResponse.json(
      { error: 'Arama servisine ulasilamadi.' },
      { status: 502 }
    );
  }
}
