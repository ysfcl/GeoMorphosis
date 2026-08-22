const TELEGRAM_API = 'https://api.telegram.org';

/**
 * Prisma istemcisini yalnizca gercekten veritabanina gidilecegi zaman yukler.
 * Statik import, prisma'ya hic ihtiyaci olmayan cagri yollarini da (ornegin
 * /api/analyze) @prisma/adapter-better-sqlite3'e ve DATABASE_URL'e bagimli
 * hale getiriyordu; `next build` bu yuzden kiriliyordu.
 */
async function getPrisma() {
  const mod = await import('@/lib/prisma');
  return mod.default;
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
 * Kullanici kimliginden (regions_analysis.user_id) chat id'yi cozup bildirim gonderir.
 * Telegram webhook'u /start ile eslestirdigi chat id'yi bu tabloya yaziyor.
 */
export async function sendTelegramNotificationToUser(userId, message, title = 'Sistem Bildirimi') {
  try {
    const prisma = await getPrisma();
    const user = await prisma.regions_analysis.findUnique({
      where: { user_id: userId },
      select: { telegram_chat_id: true },
    });

    if (user?.telegram_chat_id) {
      return sendTelegramNotification(user.telegram_chat_id, message, title);
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
    const prisma = await getPrisma();
    const updatedUser = await prisma.regions_analysis.upsert({
      where: {
        user_id: userId,
      },
      update: {
        telegram_chat_id: String(chatId),
      },
      create: {
        user_id: userId,
        telegram_chat_id: String(chatId),
      },
    });

    console.log('Telegram hesabı eşleştirildi:', updatedUser);
    return updatedUser;
  } catch (error) {
    console.error('Telegram hesabı eşleştirme hatası:', error);
    return null;
  }
}

function formatAnalysisReport({ lat, lon, riskLevel, summary, timestamp }) {
  const riskMap = {
    normal: { emoji: '🟢', label: 'NORMAL' },
    dusuk: { emoji: '🟡', label: 'DÜŞÜK' },
    orta: { emoji: '🟠', label: 'ORTA' },
    yuksek: { emoji: '🔴', label: 'YÜKSEK' },
  };
  const risk = riskMap[riskLevel] || riskMap.normal;

  const dateStr = new Date(timestamp).toLocaleString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return [
    '📊 <b>GEOMORPHOSIS SAHA ANALİZ RAPORU</b>',
    '━━━━━━━━━━━━━━━━━━━',
    `📍 Konum: ${lat}, ${lon}`,
    `${risk.emoji} RİSK SEVİYESİ: ${risk.label}`,
    '',
    '📝 Özet Değerlendirme:',
    summary,
    '━━━━━━━━━━━━━━━━━━━',
    `🗓️ Tarih: ${dateStr}`,
  ].join('\n');
}

export async function sendAnalysisReportToUser(userId, reportData) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token.includes('your_')) {
    console.warn('Telegram konfigürasyonu eksik, rapor gönderilmiyor.');
    return false;
  }

  try {
    const prisma = await getPrisma();
    const user = await prisma.regions_analysis.findUnique({
      where: { user_id: userId },
      select: { telegram_chat_id: true },
    });

    if (!user?.telegram_chat_id) {
      console.warn(`Kullanıcının (${userId}) Telegram hesabı bağlı değil, rapor atlanıyor.`);
      return false;
    }

    const text = formatAnalysisReport(reportData);
    const panelUrl = `${process.env.NEXT_PUBLIC_APP_URL}/region?lat=${reportData.lat}&lon=${reportData.lon}`;

    const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.telegram_chat_id,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🌐 Web Panelinde Detaylı İncele', url: panelUrl }]],
        },
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Analiz raporu gönderme hatası:', error);
    return false;
  }
}
