/**
 * Telegram guncelleme dinleyicisi (long polling).
 *
 * Webhook'un calismasi icin Telegram'in sunucuya ulasabilecegi genel bir HTTPS
 * adresi gerekiyor. Gelistirme ortaminda ve genel adresi olmayan kurulumlarda
 * bu yok; ngrok gibi tuneller ise her yeniden baslatmada adres degistirdigi
 * icin kayit akisi sessizce kiriliyor (Telegram olu adrese teslim etmeye
 * calisir, kullanici bota yazar ama hesabi hicbir zaman eslesmez).
 *
 * Bu modul tersini yapiyor: Telegram'a "yeni mesaj var mi" diye soruyor.
 * Disaridan erisim gerekmiyor.
 *
 * Gelen guncelleme, frontend'in MEVCUT webhook rotasina iletiliyor; boylece
 * eslestirme mantigi tek yerde kaliyor ve iki tasima yolu (webhook / polling)
 * ayni kodu kullaniyor.
 *
 * Kurallar:
 *  - TELEGRAM_WEBHOOK_URL tanimliysa uretim modu kabul edilir: webhook
 *    kaydedilir, polling calismaz.
 *  - Tanimli degilse polling calisir. Telegram ayni anda ikisine izin vermedigi
 *    icin (getUpdates 409 doner) once eski webhook kaydi silinir.
 */

const TELEGRAM_API = 'https://api.telegram.org';

// Telegram baglantiyi bu sure boyunca acik tutup mesaj bekler; bos donmeler
// icin surekli istek atmamis oluyoruz.
const LONG_POLL_SECONDS = 30;
const REQUEST_TIMEOUT_MS = (LONG_POLL_SECONDS + 15) * 1000;
const RETRY_DELAY_MS = 5000;

// Islenen son guncellemenin kimligi Redis'te tutulur; worker yeniden
// baslatildiginda ayni mesajlar tekrar islenmesin.
const OFFSET_KEY = 'telegram:updateOffset';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callTelegram(token, method, body) {
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(`${method}: ${payload.description ?? 'bilinmeyen hata'}`);
  }

  return payload.result;
}

/** Guncellemeyi frontend'in webhook rotasina iletir (tek eslestirme yolu). */
async function forwardUpdate(update, { frontendUrl, webhookSecret }) {
  const response = await fetch(`${frontendUrl}/api/notify/telegram/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Rota bu basligi bekliyor; Telegram gercek webhook'ta ayni basligi gonderir.
      ...(webhookSecret ? { 'x-telegram-bot-api-secret-token': webhookSecret } : {}),
    },
    body: JSON.stringify(update),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`webhook rotasi HTTP ${response.status}`);
  }
}

/**
 * Offset icin AYRI bir Redis baglantisi acar.
 *
 * Kuyruk tuketicisi brPop kullaniyor; bu bloklayici bir komut ve tek baglantiyi
 * mesgul ediyor. Ayni istemciden get/set cagirirsak istekler brPop'un arkasina
 * kuyruklaniyor ve bir gorev gelene kadar hic donmuyor - dinleyici daha ilk
 * adimda sessizce takiliyordu.
 */
async function openOffsetStore(redisClient, logger) {
  if (typeof redisClient?.duplicate !== 'function') return redisClient;

  try {
    const store = redisClient.duplicate();
    store.on('error', (error) => logger.warn('[TELEGRAM] Offset baglantisi hatasi:', error.message));
    await store.connect();
    return store;
  } catch (error) {
    logger.warn('[TELEGRAM] Ayri Redis baglantisi acilamadi, offset bellekte tutulacak:', error.message);
    return null;
  }
}

async function readOffset(redisClient) {
  if (!redisClient) return 0;
  try {
    const stored = await redisClient.get(OFFSET_KEY);
    return stored ? Number(stored) : 0;
  } catch {
    return 0;
  }
}

async function writeOffset(redisClient, offset) {
  if (!redisClient) return;

  try {
    await redisClient.set(OFFSET_KEY, String(offset));
  } catch {
    // Offset yazilamazsa en kotu ihtimalle bir mesaj tekrar islenir;
    // eslestirme upsert oldugu icin zararsiz.
  }
}

/**
 * Dinleyiciyi baslatir. Sonsuz dongu oldugu icin await EDILMEMELI;
 * kuyruk tuketicisiyle birlikte calisir.
 */
async function startTelegramPolling({ redisClient, logger = console }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (!token || token.includes('your_')) {
    logger.warn('[TELEGRAM] Bot anahtari yok, dinleyici baslatilmadi.');
    return;
  }

  // Uretim: genel adres verilmisse webhook kullanilir, polling calismaz.
  if (webhookUrl) {
    try {
      await callTelegram(token, 'setWebhook', {
        url: webhookUrl,
        ...(webhookSecret ? { secret_token: webhookSecret } : {}),
      });
      logger.log(`[TELEGRAM] Webhook kaydedildi: ${webhookUrl} (polling kapali)`);
    } catch (error) {
      logger.error('[TELEGRAM] Webhook kaydedilemedi:', error.message);
    }
    return;
  }

  // Telegram webhook ve getUpdates'e ayni anda izin vermiyor; eski kayit
  // (ornegin olu bir ngrok adresi) duruyorsa temizlenmeli.
  try {
    await callTelegram(token, 'deleteWebhook', { drop_pending_updates: false });
  } catch (error) {
    logger.warn('[TELEGRAM] Eski webhook silinemedi:', error.message);
  }

  const offsetStore = await openOffsetStore(redisClient, logger);
  let offset = await readOffset(offsetStore);
  logger.log(`[TELEGRAM] Dinleyici basladi (long polling, offset ${offset}).`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const updates = await callTelegram(token, 'getUpdates', {
        offset,
        timeout: LONG_POLL_SECONDS,
        allowed_updates: ['message'],
      });

      for (const update of updates) {
        try {
          await forwardUpdate(update, { frontendUrl, webhookSecret });
          const text = update.message?.text ?? '';
          if (text.startsWith('/start')) {
            logger.log(`[TELEGRAM] /start islendi (chat ${update.message?.chat?.id}).`);
          }
        } catch (error) {
          logger.error('[TELEGRAM] Guncelleme iletilemedi:', error.message);
        }

        offset = update.update_id + 1;
        await writeOffset(offsetStore, offset);
      }
    } catch (error) {
      // Ag kopmasi, Telegram tarafinda gecici hata vb. Dongu olmemeli.
      logger.error('[TELEGRAM] Dinleyici hatasi:', error.message);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

module.exports = { startTelegramPolling };
