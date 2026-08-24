import test from 'node:test';
import assert from 'node:assert/strict';

import { GET as analyzeGET } from '../src/app/api/analyze/route.js';
import { POST as telegramSubscriberPOST } from '../src/app/api/notify/telegram/subscriber/route.js';
import { linkTelegramAccount } from '../src/lib/telegram.js';
import { calls, responses } from './stubs/prisma.js';

function jsonRequest(body, headers = {}) {
  return new Request('http://localhost/api/notify/telegram/subscriber', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function withMockedFetch(mockImplementation, callback) {
  const originalFetch = global.fetch;
  global.fetch = mockImplementation;

  return Promise.resolve()
    .then(callback)
    .finally(() => {
      global.fetch = originalFetch;
    });
}

function resetStub() {
  calls.upsert.length = 0;
  calls.findFirst.length = 0;
  responses.findFirst = null;
}

// --- Kayit katmani: iki kanal ayni tabloda ---

test('Telegram baglantisi notification_channels tablosuna yaziliyor', async () => {
  resetStub();

  await linkTelegramAccount('qa-user-42', 987654321);

  assert.equal(calls.upsert.length, 1);
  const { create, where } = calls.upsert[0];

  assert.equal(create.channel, 'telegram');
  assert.equal(create.user_id, 'qa-user-42');
  assert.equal(create.destination, '987654321', 'chat id metne cevrilmeli');
  assert.deepEqual(where, {
    user_id_channel: { user_id: 'qa-user-42', channel: 'telegram' },
  });
});

test('Deep-link ile baglanan kullanici dogrulanmis sayiliyor', async () => {
  resetStub();

  await linkTelegramAccount('qa-user-42', 987654321);

  // Kullanici bota kendisi yazdigi icin sahiplik kanitlanmis oluyor;
  // e-postadaki gibi ayrica kod dogrulamasi istenmiyor.
  assert.ok(calls.upsert[0].create.verified_at instanceof Date);
  assert.ok(calls.upsert[0].update.verified_at instanceof Date);
});

// --- Gonderim yolu: worker'dan, tarayicidan degil ---

test('Durum sorgulama artik bildirim gondermiyor', async () => {
  resetStub();

  const requested = [];
  await withMockedFetch(
    async (url) => {
      requested.push(String(url));
      return new Response(
        JSON.stringify({ status: 'completed', result: { fire_risk: 'orta' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    },
    async () => {
      const request = new Request(
        'http://localhost/api/analyze?task_id=abc&user_id=qa-user-42&lat=36.85&lon=28.27'
      );
      const response = await analyzeGET(request);
      assert.equal(response.status, 200);
    }
  );

  // Polling her uc saniyede bir calisiyor ve 'completed' birden fazla kez
  // sorgulanabiliyor. Buradan mesaj gitseydi kullanici ayni raporu defalarca alirdi.
  const telegramCalls = requested.filter((url) => url.includes('api.telegram.org'));
  assert.deepEqual(telegramCalls, [], 'durum sorgusu Telegram API cagirmamali');
  assert.equal(requested.length, 1, 'yalnizca AI Engine durum sorgusu yapilmali');
});

test('Abone rotasi yetkisiz istegi reddediyor', async () => {
  const original = process.env.NOTIFICATION_INTERNAL_SECRET;
  process.env.NOTIFICATION_INTERNAL_SECRET = 'gizli';

  try {
    const response = await telegramSubscriberPOST(
      jsonRequest({ userId: 'qa-user-42', report: {} }, { 'x-notification-internal-secret': 'yanlis' })
    );

    assert.equal(response.status, 401);
  } finally {
    process.env.NOTIFICATION_INTERNAL_SECRET = original;
  }
});

test('Abone rotasi eksik alanlari reddediyor', async () => {
  const original = process.env.NOTIFICATION_INTERNAL_SECRET;
  delete process.env.NOTIFICATION_INTERNAL_SECRET;

  try {
    const response = await telegramSubscriberPOST(jsonRequest({ userId: 'qa-user-42' }));

    assert.equal(response.status, 400);
  } finally {
    if (original !== undefined) process.env.NOTIFICATION_INTERNAL_SECRET = original;
  }
});

test('Telegram hesabi bagli olmayan kullaniciya rapor gonderilmiyor', async () => {
  resetStub();
  responses.findFirst = null; // kayitli kanal yok

  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalSecret = process.env.NOTIFICATION_INTERNAL_SECRET;
  process.env.TELEGRAM_BOT_TOKEN = '123:gecerli-token';
  delete process.env.NOTIFICATION_INTERNAL_SECRET;

  try {
    const response = await telegramSubscriberPOST(
      jsonRequest({ userId: 'bagli-olmayan', report: { lat: 1, lon: 2 } })
    );

    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, false);

    // Yalnizca aktif ve dogrulanmis kanal sorgulanmali
    assert.equal(calls.findFirst.length, 1);
    assert.equal(calls.findFirst[0].where.channel, 'telegram');
    assert.equal(calls.findFirst[0].where.is_active, true);
    assert.deepEqual(calls.findFirst[0].where.verified_at, { not: null });
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalSecret !== undefined) process.env.NOTIFICATION_INTERNAL_SECRET = originalSecret;
  }
});

test('Bagli kullaniciya rapor Telegram API uzerinden gidiyor', async () => {
  resetStub();
  responses.findFirst = {
    id: 1,
    user_id: 'qa-user-42',
    channel: 'telegram',
    destination: '987654321',
    is_active: true,
    verified_at: new Date(),
  };

  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalSecret = process.env.NOTIFICATION_INTERNAL_SECRET;
  process.env.TELEGRAM_BOT_TOKEN = '123:gecerli-token';
  delete process.env.NOTIFICATION_INTERNAL_SECRET;

  const sent = [];
  try {
    await withMockedFetch(
      async (url, options) => {
        sent.push({ url: String(url), body: JSON.parse(options.body) });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
      async () => {
        const response = await telegramSubscriberPOST(
          jsonRequest({
            userId: 'qa-user-42',
            report: { lat: 36.85, lon: 28.27, riskLevel: 'orta', summary: 'test', timestamp: new Date().toISOString() },
          })
        );

        assert.equal((await response.json()).success, true);
      }
    );

    assert.equal(sent.length, 1);
    assert.ok(sent[0].url.includes('api.telegram.org'));
    assert.equal(sent[0].body.chat_id, '987654321', 'chat id kanal kaydindan gelmeli');
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalSecret !== undefined) process.env.NOTIFICATION_INTERNAL_SECRET = originalSecret;
  }
});
