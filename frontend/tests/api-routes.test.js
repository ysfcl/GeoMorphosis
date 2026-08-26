import test from 'node:test';
import assert from 'node:assert/strict';

import { POST as analyzePOST, GET as analyzeGET } from '../src/app/api/analyze/route.js';
import { POST as subscribePOST } from '../src/app/api/subscribe/route.js';
import { POST as verifyEmailPOST } from '../src/app/api/notify/email/verify/route.js';
import { POST as notifyEmailPOST } from '../src/app/api/notify/email/route.js';
import { POST as notifyTelegramPOST } from '../src/app/api/notify/route.js';
import { GET as geocodeGET } from '../src/app/api/geocode/route.js';

function createJsonRequest(body, url = 'http://localhost/api') {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

test('subscribe route accepts a valid subscription payload', async () => {
  // Abonelik artik Prisma uzerinden yaziliyor; testlerde @/lib/prisma
  // tests/stubs/prisma.js ile karsilanir, gercek veritabanina dokunulmaz.
  //
  // SMTP ayarlari BILEREK bosaltiliyor. Aksi halde test ortam degiskenlerine
  // bagimli hale geliyor: .env'de gercek SMTP varsa route kodu devCode olarak
  // dondurmek yerine gercekten e-posta gondermeye calisiyor, test hem kiriliyor
  // hem de sahte adrese posta atmaya ugrasiyor.
  const smtpKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  const savedSmtp = Object.fromEntries(smtpKeys.map((key) => [key, process.env[key]]));
  smtpKeys.forEach((key) => delete process.env[key]);

  try {
    const response = await subscribePOST(
      createJsonRequest({
        email: 'qa@example.com',
        user_id: 'qa-user-42',
        notification_type: 'email',
      })
    );

    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.deepEqual(payload.subscription, {
      email: 'qa@example.com',
      notification_type: 'email',
    });
    // SMTP yapilandirilmadigindan dogrulama kodu devCode olarak doner.
    assert.match(payload.devCode, /^\d{6}$/);
  } finally {
    smtpKeys.forEach((key) => {
      if (savedSmtp[key] === undefined) delete process.env[key];
      else process.env[key] = savedSmtp[key];
    });
  }
});

test('email verify route confirms the matching code', async () => {
  const response = await verifyEmailPOST(
    createJsonRequest({ userId: 'qa-user-42', code: '123456' })
  );

  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.success, true);
});

test('email verify route rejects a wrong code', async () => {
  const response = await verifyEmailPOST(
    createJsonRequest({ userId: 'qa-user-42', code: '000000' })
  );

  assert.equal(response.status, 400);

  const payload = await response.json();
  assert.equal(payload.success, false);
});

test('notify email route blocks incomplete payloads before external delivery', async () => {
  const response = await notifyEmailPOST(createJsonRequest({ message: 'Only message' }));

  assert.equal(response.status, 400);

  const payload = await response.json();
  assert.match(payload.error, /Alıcı email adresi/i);
});

test('notify telegram route blocks incomplete payloads before external delivery', async () => {
  const response = await notifyTelegramPOST(createJsonRequest({ message: 'Only message' }));

  assert.equal(response.status, 400);

  const payload = await response.json();
  assert.match(payload.error, /Alıcı \(chatId\)/i);
});

test('analyze route forwards the regional payload to the AI engine and returns the task id', async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;
  const originalAiEngineUrl = process.env.NEXT_PUBLIC_AI_ENGINE_URL;

  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = 'telegram-chat-1';
  process.env.NEXT_PUBLIC_AI_ENGINE_URL = 'http://mock-ai-engine.local';

  const calls = [];

  await withMockedFetch(async (url, options = {}) => {
    const requestUrl = String(url);
    calls.push({
      url: requestUrl,
      method: options.method || 'GET',
      body: options.body ? JSON.parse(options.body) : null,
    });

    if (requestUrl.includes('/api/analyze')) {
      return new Response(JSON.stringify({ task_id: 'task-123', message: 'queued' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (requestUrl.includes('api.telegram.org')) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'unexpected request' }), { status: 500 });
  }, async () => {
    const response = await analyzePOST(
      createJsonRequest({
        start_points: [{ lat: 36.853, lng: 28.2715 }],
        end_points: [{ lat: 36.862, lng: 28.2815 }],
        buffer_meters: 750,
        region_name: 'Test region',
      })
    );

    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.task_id, 'task-123');
    assert.equal(calls.filter((entry) => entry.url.includes('/api/analyze')).length, 1);
    assert.equal(calls.filter((entry) => entry.url.includes('api.telegram.org')).length, 1);
    assert.deepEqual(calls[0].body, {
      start_points: [{ lat: 36.853, lng: 28.2715 }],
      end_points: [{ lat: 36.862, lng: 28.2815 }],
      buffer_meters: 750,
      region_name: 'Test region',
      user_id: null,
      bbox: null,
    });
  });

  if (originalAiEngineUrl === undefined) {
    delete process.env.NEXT_PUBLIC_AI_ENGINE_URL;
  } else {
    process.env.NEXT_PUBLIC_AI_ENGINE_URL = originalAiEngineUrl;
  }

  if (originalToken === undefined) {
    delete process.env.TELEGRAM_BOT_TOKEN;
  } else {
    process.env.TELEGRAM_BOT_TOKEN = originalToken;
  }

  if (originalChatId === undefined) {
    delete process.env.TELEGRAM_CHAT_ID;
  } else {
    process.env.TELEGRAM_CHAT_ID = originalChatId;
  }
});

test('analyze polling route returns the final task status without notifying', async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;
  const originalAiEngineUrl = process.env.NEXT_PUBLIC_AI_ENGINE_URL;

  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = 'telegram-chat-1';
  process.env.NEXT_PUBLIC_AI_ENGINE_URL = 'http://mock-ai-engine.local';

  const calls = [];

  await withMockedFetch(async (url) => {
    const requestUrl = String(url);
    calls.push(requestUrl);

    if (requestUrl.includes('/api/status/task-456')) {
      return new Response(
        JSON.stringify({ status: 'completed', result: { deforestation_risk: 'orta', pollution_level: 'düşük' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (requestUrl.includes('api.telegram.org')) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'unexpected request' }), { status: 500 });
  }, async () => {
    const request = new Request('http://localhost/api/analyze?task_id=task-456');
    const response = await analyzeGET(request);

    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.status, 'completed');
    assert.equal(payload.result.deforestation_risk, 'orta');
    assert.equal(calls.filter((entry) => entry.includes('/api/status/task-456')).length, 1);
    // Abone bildirimi artik polling'den degil worker'dan gidiyor: 'completed'
    // durumu birden fazla kez sorgulanabildigi icin buradan gonderim mukerrer
    // mesaj uretiyordu. Ayrintili testler tests/notification-routing.test.js'te.
    assert.equal(calls.filter((entry) => entry.includes('api.telegram.org')).length, 0);
  });

  if (originalAiEngineUrl === undefined) {
    delete process.env.NEXT_PUBLIC_AI_ENGINE_URL;
  } else {
    process.env.NEXT_PUBLIC_AI_ENGINE_URL = originalAiEngineUrl;
  }

  if (originalToken === undefined) {
    delete process.env.TELEGRAM_BOT_TOKEN;
  } else {
    process.env.TELEGRAM_BOT_TOKEN = originalToken;
  }

  if (originalChatId === undefined) {
    delete process.env.TELEGRAM_CHAT_ID;
  } else {
    process.env.TELEGRAM_CHAT_ID = originalChatId;
  }
});


// ============================================================================
// KONUM ARAMA (/api/geocode)
// ============================================================================

function createGeocodeRequest(query) {
  return new Request('http://localhost/api/geocode?q=' + encodeURIComponent(query));
}

// Nominatim jsonv2 formatinda tek kayit.
function nominatimItem(overrides = {}) {
  return {
    osm_type: 'node',
    osm_id: 456,
    name: 'Muratbey',
    display_name: 'Muratbey, Bartin Merkez, Bartin, 74100, Turkiye',
    addresstype: 'village',
    lat: '41.6344',
    lon: '32.3375',
    boundingbox: ['41.6244', '41.6444', '32.3275', '32.3475'],
    ...overrides,
  };
}

test('geocode route rejects a query that is too short', async () => {
  const response = await geocodeGET(createGeocodeRequest('b'));

  assert.equal(response.status, 400);
  // Cok kisa sorgu Nominatim'e hic gitmemeli; hiz siniri bosa harcanmasin.
  const payload = await response.json();
  assert.match(payload.error, /en az/i);
});

test('geocode route simplifies Nominatim results and names the bbox edges', async () => {
  await withMockedFetch(
    async () => new Response(JSON.stringify([nominatimItem()]), { status: 200 }),
    async () => {
      const response = await geocodeGET(createGeocodeRequest('bartin muratbey'));

      assert.equal(response.status, 200);

      const payload = await response.json();
      assert.equal(payload.results.length, 1);

      const [result] = payload.results;
      assert.equal(result.name, 'Muratbey');
      assert.equal(result.category, 'village');
      assert.equal(result.lat, 41.6344);
      assert.equal(result.lon, 32.3375);

      // Nominatim boundingbox sirasi [guney, kuzey, bati, dogu]. Sirayi
      // yanlis okumak haritayi bambaska bir yere goturur; adlandirilmis
      // alanlara dogru eslendigini burada sabitliyoruz.
      assert.deepEqual(result.bbox, {
        south: 41.6244,
        north: 41.6444,
        west: 32.3275,
        east: 32.3475,
      });
    }
  );
});

test('geocode route keeps a far more important foreign place above a Turkish one', async () => {
  // Nominatim'in viewbox onceligi tek basina "paris" aramasinda Siirt'teki bir
  // koyu gercek Paris'in onune koyuyordu. Turkiye bonusu benzer onemdeki
  // yerlerde one almali, bu kadar buyuk farki ezmemeli.
  const uzumluk = nominatimItem({
    osm_id: 1,
    name: 'Uzumluk',
    display_name: 'Uzumluk, Eruh, Siirt, Turkiye',
    importance: 0.3135,
    address: { country_code: 'tr' },
  });
  const paris = nominatimItem({
    osm_id: 2,
    name: 'Paris',
    display_name: 'Paris, Ile-de-France, Fransa',
    importance: 0.8971,
    address: { country_code: 'fr' },
  });

  await withMockedFetch(
    // Nominatim'in kendi sirasi: Turk koyu once.
    async () => new Response(JSON.stringify([uzumluk, paris]), { status: 200 }),
    async () => {
      const response = await geocodeGET(createGeocodeRequest('paris sehri'));
      const payload = await response.json();

      assert.deepEqual(
        payload.results.map((result) => result.name),
        ['Paris', 'Uzumluk']
      );
      // Dahili siralama alani disari sizmamali.
      assert.equal('_score' in payload.results[0], false);
    }
  );
});

test('geocode route lifts a Turkish place above a comparable foreign one', async () => {
  const turkish = nominatimItem({
    osm_id: 3,
    name: 'Muratbey',
    display_name: 'Muratbey, Bartin, Turkiye',
    importance: 0.21,
    address: { country_code: 'tr' },
  });
  const foreign = nominatimItem({
    osm_id: 4,
    name: 'Muratbey',
    display_name: 'Muratbey, Bulgaristan',
    importance: 0.29,
    address: { country_code: 'bg' },
  });

  await withMockedFetch(
    // Yabanci kayit ham importance'ta onde; bonus sirayi cevirmeli.
    async () => new Response(JSON.stringify([foreign, turkish]), { status: 200 }),
    async () => {
      const response = await geocodeGET(createGeocodeRequest('muratbey koyu'));
      const payload = await response.json();

      assert.match(payload.results[0].detail, /Turkiye/);
    }
  );
});

test('geocode route serves a repeated query from cache', async () => {
  let upstreamCalls = 0;

  await withMockedFetch(
    async () => {
      upstreamCalls += 1;
      return new Response(JSON.stringify([nominatimItem({ name: 'Kozcagiz' })]), {
        status: 200,
      });
    },
    async () => {
      const first = await geocodeGET(createGeocodeRequest('kozcagiz'));
      const firstPayload = await first.json();
      assert.equal(firstPayload.cached, false);

      // Ayni sorgu, farkli buyuk/kucuk harf: yine onbellekten karsilanmali.
      const second = await geocodeGET(createGeocodeRequest('KOZCAGIZ'));
      const secondPayload = await second.json();

      assert.equal(secondPayload.cached, true);
      assert.deepEqual(secondPayload.results, firstPayload.results);
      assert.equal(upstreamCalls, 1);
    }
  );
});

test('geocode route reports an upstream failure as 502', async () => {
  await withMockedFetch(
    async () => new Response('rate limited', { status: 429 }),
    async () => {
      const response = await geocodeGET(createGeocodeRequest('amasra'));

      assert.equal(response.status, 502);
      const payload = await response.json();
      assert.match(payload.error, /ulasilamadi/i);
    }
  );
});
