// Telegram bildirim kanali kayitlari. E-posta ile AYNI tabloyu kullanir
// (notification_channels), yalnizca channel alani farklidir.
//
// Onceden chat id'ler regions_analysis.telegram_chat_id sutununa yaziliyordu.
// Orasi ai-engine'in her analizde satir ekledigi analiz sonuclari tablosu;
// bildirim kaydini oraya koymak iki ayri kavrami ayni satirda tutuyordu ve
// user_id uzerindeki @unique kisiti analiz tablosuna anlamsiz bir sinir
// getiriyordu. Kayit artik e-posta ile ayni yerde duruyor.
//
// E-postadan tek farki: dogrulama kodu yok. Kullanici bota deep-link ile
// (?start=<userId>) kendi yazdigi icin sahiplik zaten kanitlanmis oluyor,
// bu yuzden verified_at baglanma aninda doldurulur.

const CHANNEL = 'telegram';

async function getPrisma() {
  const mod = await import('@/lib/prisma');
  return mod.default;
}

/** Deep-link ile gelen chat id'yi kullaniciya baglar ve dogrulanmis sayar. */
export async function saveTelegramSubscription(userId, chatId) {
  const prisma = await getPrisma();
  const destination = String(chatId);

  return prisma.notification_channels.upsert({
    where: { user_id_channel: { user_id: userId, channel: CHANNEL } },
    update: {
      destination,
      is_active: true,
      verified_at: new Date(),
    },
    create: {
      user_id: userId,
      channel: CHANNEL,
      destination,
      verified_at: new Date(),
    },
  });
}

/** Rapor gonderiminde kullanilir; yalnizca aktif ve dogrulanmis kanal doner. */
export async function getActiveTelegramSubscription(userId) {
  if (!userId) return null;

  const prisma = await getPrisma();
  return prisma.notification_channels.findFirst({
    where: {
      user_id: userId,
      channel: CHANNEL,
      is_active: true,
      verified_at: { not: null },
    },
  });
}
