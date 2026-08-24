/**
 * Telegram guncelleme dinleyicisi (long polling).
 *
 * Webhook'un calismasi icin Telegram'in sunucuya ulasabilecegi genel bir HTTPS
 * adresi gerekiyor. Gelistirme ortaminda bu yok; ngrok gibi tuneller ise her
 * yeniden baslatmada adres degistirdigi icin kayit akisi sessizce kiriliyor
 * (Telegram olu adrese teslim etmeye calisir, kullanici bota yazar ama hesabi
 * hicbir zaman eslesmez).
 *
 * Bu modul tersini yapiyor: Telegram'a "yeni mesaj var mi" diye soruyor.
 * Disaridan erisim gerekmiyor.
 *
 * Gelen guncelleme, frontend'in MEVCUT webhook rotasina iletiliyor; boylece
 * eslestirme mantigi tek yerde kaliyor ve iki tasima yolu (webhook / polling)
 * ayni kodu kullaniyor.
 *
 * ONEMLI: Telegram bir bot anahtari icin ayni anda YALNIZCA TEK getUpdates
 * tuketicisine izin verir. Ekipten birden fazla kisi ayni anahtarla worker
 * calistirirsa her yeni istek oncekini sonlandirir ve hepsi 409 Conflict
 * dongusune girer. Redis kilidi bunu cozmez; herkesin kendi Redis'i var.
 * Bu yuzden dinleyici VARSAYILAN OLARAK KAPALI.
 *
 * Kurallar:
 *  - TELEGRAM_WEBHOOK_URL tanimliysa uretim modu: webhook kaydedilir, polling
 *    calismaz. Uretimde tek dagitim oldugu icin catisma da olmaz.
 *  - TELEGRAM_POLLING=true ise polling calisir (gelistirme).
 *  - Ikisi de yoksa dinleyici baslamaz, nedeni loglanir.
 */

const TELEGRAM_API = 'https://api.telegram.org';

// Telegram baglantiyi bu sure boyunca acik tutup mesaj bekler; bos donmeler
// icin surekli istek atmamis oluyoruz.
const LONG_POLL_SECONDS = 30;
const REQUEST_TIMEOUT_MS = (LONG_POLL_SECONDS + 15) * 1000;
const RETRY_DELAY_MS = 5000;

// Baska bir dinleyici anahtari tutuyorsa devralmayi bu kadar deneriz.
// Yeni getUpdates istegi eskisini sonlandirdigi icin karsi taraf olu bir
// konteynerse ilk denemede devralinir; canli bir esse birbirimizi surekli
// dusurmemek icin sinirli tutuyoruz.
const TAKEOVER_ATTEMPTS = 3;
const TAKEOVER_DELAY_MS = 3000;

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

function isConflict(error) {
  return String(error.message).includes('Conflict');
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
 * mesgul ediyor. Ayni istemciden get/set cagirirsak istekler brPop arkasina
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

async function readOffset(store) {
  if (!store) return 0;

  try {
    const stored = await store.get(OFFSET_KEY);
    return stored ? Number(stored) : 0;
  } catch {
    return 0;
  }
}

async function writeOffset(store, offset) {
  if (!store) return;

  try {
    await store.set(OFFSET_KEY, String(offset));
  } catch {
    // Offset yazilamazsa en kotu ihtimalle bir mesaj tekrar islenir;
    // eslestirme upsert oldugu icin zararsiz.
  }
}

/**
 * Baslangicta bot baglantisini sifirlar: varsa eski webhook kaydini siler.
 * Olu bir ngrok adresi ya da onceki oturumdan kalan kayit boylece temizlenir
 * ve guncellemeler yeniden bu worker uzerinden akmaya baslar.
 */
async function resetBotConnection(token, logger) {
  try {
    await callTelegram(token, 'deleteWebhook', { drop_pending_updates: false });
    logger.log('[TELEGRAM] Bot baglantisi sifirlandi (eski webhook kaydi temizlendi).');
  } catch (error) {
    logger.warn('[TELEGRAM] Bot baglantisi sifirlanamadi:', error.message);
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
  const pollingEnabled = String(process.env.TELEGRAM_POLLING).toLowerCase() === 'true';

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

  if (!pollingEnabled) {
    logger.log(
      '[TELEGRAM] Dinleyici kapali. Hesap eslestirmeyi test edecekseniz .env dosyaniza ' +
        'TELEGRAM_POLLING=true ekleyin. Ayni bot anahtari icin bunu ekipte YALNIZCA BIR ' +
        'kisi acmali; aksi halde Telegram 409 Conflict doner.'
    );
    return;
  }

  // Her aciliste bot baglantisi sifirlanir; onceki oturumdan kalan webhook
  // kaydi varsa temizlenir ve guncellemeler bu worker'a akar.
  await resetBotConnection(token, logger);

  const offsetStore = await openOffsetStore(redisClient, logger);
  let offset = await readOffset(offsetStore);
  logger.log(`[TELEGRAM] Dinleyici basladi (long polling, offset ${offset}).`);

  let takeoverTries = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const updates = await callTelegram(token, 'getUpdates', {
        offset,
        timeout: LONG_POLL_SECONDS,
        allowed_updates: ['message'],
      });

      takeoverTries = 0;

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
      if (isConflict(error)) {
        takeoverTries += 1;

        // Yeni getUpdates istegi eskisini sonlandirdigi icin karsi taraf olu
        // bir konteynerse birkac denemede devralinir.
        if (takeoverTries <= TAKEOVER_ATTEMPTS) {
          logger.warn(
            '[TELEGRAM] Bot anahtarini baska bir dinleyici tutuyor, devralinmaya calisiliyor ' +
              `(${takeoverTries}/${TAKEOVER_ATTEMPTS}).`
          );
          await resetBotConnection(token, logger);
          await sleep(TAKEOVER_DELAY_MS);
          continue;
        }

        // Karsi taraf canli ve o da deniyor olabilir; birbirimizi surekli
        // dusurmemek icin duruyoruz.
        logger.error(
          '[TELEGRAM] Devralinamadi, dinleyici durduruldu. Ayni bot anahtari icin ayni anda ' +
            'tek dinleyici calisabilir. Sizde calismasi gerekiyorsa once digerini kapatin; ' +
            'gerekmiyorsa .env dosyanizdan TELEGRAM_POLLING satirini kaldirin.'
        );
        return;
      }

      // Ag kopmasi, Telegram tarafinda gecici hata vb. Dongu olmemeli.
      logger.error('[TELEGRAM] Dinleyici hatasi:', error.message);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

module.exports = { startTelegramPolling };
