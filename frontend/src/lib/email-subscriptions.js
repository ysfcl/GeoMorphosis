// Bildirim kanali kayitlari Prisma uzerinden yonetilir (notification_channels).
// Eski better-sqlite3 erisimi kaldirildi: ayni DATABASE_URL'i paylasan tek
// veri katmani birakildi; "directory does not exist" hatalarinin kaynagi buydu.
//
// Dogrulama akisi (Faz 3):
//   saveEmailSubscription  -> 6 haneli kod uretir, verified_at temizlenir
//   verifyEmailSubscription-> kod eslesirse verified_at yazilir
//   getActiveEmailSubscription -> yalnizca dogrulanmis + aktif kanal doner

async function getPrisma() {
  const mod = await import('@/lib/prisma');
  return mod.default;
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function saveEmailSubscription(userId, email) {
  const prisma = await getPrisma();
  const destination = String(email).trim().toLowerCase();
  const verificationCode = generateVerificationCode();

  return prisma.notification_channels.upsert({
    where: { user_id_channel: { user_id: userId, channel: 'email' } },
    update: {
      destination,
      is_active: true,
      verification_code: verificationCode,
      verified_at: null,
    },
    create: {
      user_id: userId,
      channel: 'email',
      destination,
      verification_code: verificationCode,
    },
  });
}

/** Kod eslesirse kanali dogrular, aksi halde null doner. */
export async function verifyEmailSubscription(userId, code) {
  const prisma = await getPrisma();
  const channel = await prisma.notification_channels.findUnique({
    where: { user_id_channel: { user_id: userId, channel: 'email' } },
  });

  if (!channel || !channel.verification_code) return null;
  if (String(code).trim() !== channel.verification_code) return null;

  return prisma.notification_channels.update({
    where: { id: channel.id },
    data: { verified_at: new Date(), verification_code: null },
  });
}

/** Rapor gonderiminde kullanilir; yalnizca dogrulanmis aboneler gecerli sayilir. */
export async function getActiveEmailSubscription(userId) {
  if (!userId) return null;

  const prisma = await getPrisma();
  return prisma.notification_channels.findFirst({
    where: {
      user_id: userId,
      channel: 'email',
      is_active: true,
      verified_at: { not: null },
    },
  });
}
