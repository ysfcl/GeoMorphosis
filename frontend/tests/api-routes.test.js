import test from 'node:test';
import assert from 'node:assert/strict';

import { POST as analyzePOST, GET as analyzeGET } from '../src/app/api/analyze/route.js';
import { POST as subscribePOST } from '../src/app/api/subscribe/route.js';
import { POST as notifyEmailPOST } from '../src/app/api/notify/email/route.js';
import { POST as notifyTelegramPOST } from '../src/app/api/notify/route.js';

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
  const response = await subscribePOST(
    createJsonRequest({
      email: 'qa@example.com',
      region_id: 42,
      notification_type: 'email',
    })
  );

  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.deepEqual(payload.subscription, {
    email: 'qa@example.com',
    region_id: 42,
    notification_type: 'email',
  });
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

test('analyze polling route returns the final task status and notifies on completion', async () => {
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
        JSON.stringify({ status: 'completed', result: { fire_risk: 'orta', pollution_level: 'düşük' } }),
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
    assert.equal(payload.result.fire_risk, 'orta');
    assert.equal(calls.filter((entry) => entry.includes('/api/status/task-456')).length, 1);
    assert.equal(calls.filter((entry) => entry.includes('api.telegram.org')).length, 1);
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
