import prisma from '@/lib/prisma'

export async function sendTelegramNotification(chatId, message, title = 'Sistem Bildirimi') {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || !chatId || token.includes('your_')) {
    console.warn('Telegram konfigürasyonu eksik, bildirim atlanıyor.');
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
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

export async function linkTelegramAccount(userId, chatId) {
  try {
    const updatedUser = await prisma.regions_analysis.update({
      where: {
        user_id: userId,
      },
      data: {
        telegram_chat_id: String(chatId),
      },
    });

    console.log("Telegram hesabı eşleştirildi:", updatedUser);
    return updatedUser;
  } catch (error) {
    console.error("Telegram hesabı eşleştirme hatası:", error);
    return null;
  }
}

export async function sendSystemTelegramNotification(message, title = 'Sistem Bildirimi') {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId || token.includes('your_')) {
    console.warn('Telegram konfigürasyonu eksik, bildirim atlanıyor.');
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
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
    console.error('Sistem Telegram bildirim hatası:', error);
    return false;
  }
}