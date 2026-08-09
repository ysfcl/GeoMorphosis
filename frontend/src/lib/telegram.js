export async function sendTelegramNotification(chatId,message, title = 'Sistem Bildirimi') {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || !chatId || token.includes('your_')) {
    console.warn('Telegram konfigürasyonu eksik, bildirim atlanıyor.');
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

export async function sendTelegramNotification(userId, message, title = 'Sistem Bildirimi') {
  try {
    const user = await prisma.regions_analysis.findUnique({
      where: { user_id: userId },
      select: { telegram_chat_id: true },
    });

    return user;
  } catch (error) {
    console.error("Telegram bildirim gönderme hatası:", error);
    return null;
  }
}