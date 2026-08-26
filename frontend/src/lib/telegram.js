import { summarizeAnalysis } from '@/lib/reportPayload';
import { buildAnalysisReportPdf } from '@/lib/pdfReport';

const TELEGRAM_API = 'https://api.telegram.org';

/**
 * Prisma istemcisini yalnizca gercekten veritabanina gidilecegi zaman yukler.
 * Statik import, prisma'ya hic ihtiyaci olmayan cagri yollarini da (ornegin
 * /api/analyze) @prisma/adapter-better-sqlite3'e ve DATABASE_URL'e bagimli
 * hale getiriyordu; `next build` bu yuzden kiriliyordu.
 */
async function subscriptions() {
  return import('@/lib/telegram-subscriptions');
}

async function postMessage(token, chatId, message, title) {
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `<b>${title}</b>\n\n${message}`,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      // Telegram hata sebebini govdede aciklikla soyluyor ("chat not found",
      // "bot was blocked by the user" gibi). Yutulursa "gonderilmedi" ile
      // "abone yok" birbirinden ayirt edilemiyor.
      const detail = await response.json().catch(() => ({}));
      console.error(
        `Telegram gönderimi başarısız (HTTP ${response.status}): ${detail.description ?? 'sebep bilinmiyor'}`
      );
    }

    return response.ok;
  } catch (error) {
    console.error('Telegram bildirim hatası:', error);
    return false;
  }
}

/** Belirli bir sohbete bildirim gonderir. */
export async function sendTelegramNotification(chatId, message, title = 'Sistem Bildirimi') {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || !chatId || token.includes('your_')) {
    console.warn('Telegram konfigürasyonu eksik, bildirim atlanıyor.');
    return false;
  }

  return postMessage(token, chatId, message, title);
}

/** Ortak .env sohbetine sistem bildirimi gonderir (alici parametresi gerekmez). */
export async function sendSystemTelegramNotification(message, title = 'Sistem Bildirimi') {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId || token.includes('your_')) {
    console.warn('Telegram konfigürasyonu eksik, bildirim atlanıyor.');
    return false;
  }

  return postMessage(token, chatId, message, title);
}

/**
 * Kullanici kimliginden chat id'yi cozup bildirim gonderir.
 * Kayit e-posta ile ayni tabloda (notification_channels) tutuluyor.
 */
export async function sendTelegramNotificationToUser(userId, message, title = 'Sistem Bildirimi') {
  try {
    const { getActiveTelegramSubscription } = await subscriptions();
    const channel = await getActiveTelegramSubscription(userId);

    if (channel?.destination) {
      return sendTelegramNotification(channel.destination, message, title);
    }

    console.warn('Kullanicinin Telegram hesabi eslestirilmemis, bildirim atlanıyor.');
    return false;
  } catch (error) {
    console.error('Telegram bildirim gönderme hatası:', error);
    return false;
  }
}

export async function linkTelegramAccount(userId, chatId) {
  try {
    const { saveTelegramSubscription } = await subscriptions();
    const channel = await saveTelegramSubscription(userId, chatId);

    console.log('Telegram hesabı eşleştirildi:', channel);
    return channel;
  } catch (error) {
    console.error('Telegram hesabı eşleştirme hatası:', error);
    return null;
  }
}

// Rapor artik HAM analiz sonucu (statusData.result ile ayni sekil); alanlar
// burada turetilir. E-posta tarafindaki ozetle ayni kaynak kullanilir.
function formatAnalysisReport(result) {
  const riskMap = {
    normal: { emoji: '🟢', label: 'NORMAL' },
    dusuk: { emoji: '🟡', label: 'DÜŞÜK' },
    orta: { emoji: '🟠', label: 'ORTA' },
    yuksek: { emoji: '🔴', label: 'YÜKSEK' },
  };
  const coords = result?.coordinates || {};
  const risk = riskMap[result?.deforestation_risk] || riskMap.normal;

  const ai = result?.ai_results ?? {};
  const deforestation = ai.change_detection?.deforestation ?? {};
  const detections = ai.yolo_detections ?? [];

  const ndviScore = result?.ndvi_score;
  const ndviText = ndviScore != null ? `${Number(ndviScore).toFixed(3)}` : 'Hesaplanmadı';

  const pollutionAod = result?.pollution_aod;
  const aodText = pollutionAod != null ? `${Number(pollutionAod).toFixed(2)}` : 'Veri yok';

  const lossPercent = Number.isFinite(deforestation.loss_percentage)
    ? `%${deforestation.loss_percentage}`
    : '-';

  const detectionCount = detections.length;

  const dateStr = new Date(result?.timestamp || Date.now()).toLocaleString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return [
    '📊 <b>GEOMORPHOSIS SAHA ANALİZ RAPORU</b>',
    '━━━━━━━━━━━━━━━━━━━',
    '',
    `📍 <b>Konum:</b> ${coords.lat ?? '-'}, ${coords.lon ?? '-'}`,
    `🗓️ <b>Tarih:</b> ${dateStr}`,
    '',
    `${risk.emoji} <b>ORMANSIZLAŞMA RİSKİ:</b> ${risk.label}`,
    `   🌳 Kayıp Oranı: ${lossPercent}`,
    '',
    `🏭 <b>KİRLİLİK SEVİYESİ:</b> ${(result?.pollution_level ?? 'bilinmiyor').toUpperCase()}`,
    `   💨 AOD Değeri: ${aodText}`,
    '',
    `🌿 <b>NDVI SKORU:</b> ${ndviText}`,
    '',
    `🤖 <b>YOLO TESPİTLERİ:</b> ${detectionCount > 0 ? `${detectionCount} nesne tespit edildi` : 'Tespit yok'}`,
    '',
    '━━━━━━━━━━━━━━━━━━━',
    `📝 <b>Özet:</b> ${summarizeAnalysis(result)}`,
  ].join('\n');
}

export async function sendAnalysisReportToUser(userId, reportData) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token.includes('your_')) {
    console.warn('Telegram konfigürasyonu eksik, rapor gönderilmiyor.');
    return false;
  }

  try {
    const { getActiveTelegramSubscription } = await subscriptions();
    const channel = await getActiveTelegramSubscription(userId);

    if (!channel?.destination) {
      console.warn(`Kullanıcının (${userId}) Telegram hesabı bağlı değil, rapor atlanıyor.`);
      return false;
    }

    const chatId = channel.destination;
    const text = formatAnalysisReport(reportData);
    const panelUrl = `${process.env.NEXT_PUBLIC_APP_URL}/region?lat=${reportData.coordinates?.lat ?? reportData.lat}&lon=${reportData.coordinates?.lon ?? reportData.lon}`;

    // Once metin raporu gonder (inline keyboard ile)
    const textResponse = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🌐 Web Panelinde Detaylı İncele', url: panelUrl }]],
        },
      }),
    });

    if (!textResponse.ok) {
      const detail = await textResponse.json().catch(() => ({}));
      console.error(
        `Telegram metin raporu gönderilemedi (HTTP ${textResponse.status}): ${detail.description ?? 'sebep bilinmiyor'}`
      );
    }

    // PDF uret ve gonder
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
      const doc = await buildAnalysisReportPdf(reportData, baseUrl);
      const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

      const regionSlug = String(reportData?.region_name || 'bolge')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const filename = `geomorphosis-${regionSlug || 'rapor'}.pdf`;

      // FormData ile PDF yukle
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('document', new Blob([pdfBuffer], { type: 'application/pdf' }), filename);
      formData.append('caption', '📄 Detaylı PDF Rapor');

      const pdfResponse = await fetch(`${TELEGRAM_API}/bot${token}/sendDocument`, {
        method: 'POST',
        body: formData,
      });

      if (!pdfResponse.ok) {
        const detail = await pdfResponse.json().catch(() => ({}));
        console.error(
          `Telegram PDF raporu gönderilemedi (HTTP ${pdfResponse.status}): ${detail.description ?? 'sebep bilinmiyor'}`
        );
      }

      return textResponse.ok && pdfResponse.ok;
    } catch (pdfError) {
      console.error('PDF oluşturulamadı, sadece metin rapor gönderildi:', pdfError);
      return textResponse.ok;
    }
  } catch (error) {
    console.error('Analiz raporu gönderme hatası:', error);
    return false;
  }
}
