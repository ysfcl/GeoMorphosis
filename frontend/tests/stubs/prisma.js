// Test ortaminda @/lib/prisma yerine gecer. Gercek Prisma istemcisi
// DATABASE_URL + generate edilmis client gerektirdigi icin unit testlerde
// sahte cevaplar dondurur.
const prisma = {
  regions_analysis: {
    findUnique: async () => ({ telegram_chat_id: 'chat-test-1' }),
    upsert: async ({ create }) => ({ id: 1, ...create }),
  },
  notification_channels: {
    upsert: async ({ create }) => ({
      id: 1,
      ...create,
      verification_code: '123456',
      verified_at: null,
      destination: create?.destination ?? 'qa@example.com',
    }),
    findFirst: async () => null,
    findUnique: async () => ({ id: 1, user_id: 'qa-user-42', channel: 'email', verification_code: '123456' }),
    update: async ({ data }) => ({ id: 1, ...data }),
  },
};

export default prisma;
