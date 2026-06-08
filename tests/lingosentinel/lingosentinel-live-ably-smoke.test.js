'use strict';

/**
 * lingosentinel-live-ably-smoke.test.js
 *
 * VERSION_MARKER: LINGOSENTINEL_CONTROLLED_LIVE_ABLY_SMOKE_V1
 *
 * Controlled Live Ably Smoke Layer.
 *
 * Purpose:
 * - Prove the backend/runtime can publish to real Ably when explicitly enabled.
 * - Prove the same runtime can subscribe and receive the expected event.
 * - Prove Marion governance remains attached.
 * - Prove active LingoSentinel realtime lanes are correct.
 * - Prove no Ably/API key material leaks into results or payloads.
 *
 * This test is intentionally gated.
 * It will SKIP unless:
 *
 *   LINGOSENTINEL_LIVE_ABLY_SMOKE=1
 *
 * Required env:
 *
 *   ABLY_API_KEY
 *
 * Optional env:
 *
 *   LINGOSENTINEL_LIVE_SMOKE_PREFIX
 *
 * Active adaptive contract:
 * - group_room      → ls:room:{roomId}      → lingosentinel.message.group
 * - one_to_one      → ls:direct:{roomId}    → lingosentinel.message.direct
 * - live_translate  → ls:live:{sessionId}   → lingosentinel.message.live
 * - delivered       → ls:receipt:{threadId} → lingosentinel.message.delivered
 *
 * IMPORTANT:
 * - This test touches real Ably only when explicitly enabled.
 * - Use a sandbox/test Ably app/key first.
 * - Never expose this key to Webflow/frontend code.
 */

const assert = require('assert');

const Engine = require('../../Data/marion/runtime/LingoSentinel/LingoSentinelEngine');

const ACTIVE_EVENTS = Object.freeze({
  group_room: 'lingosentinel.message.group',
  one_to_one: 'lingosentinel.message.direct',
  live_translate: 'lingosentinel.message.live',
  delivered: 'lingosentinel.message.delivered'
});

const LIVE_ENABLED = process.env.LINGOSENTINEL_LIVE_ABLY_SMOKE === '1';
const ABLY_API_KEY = process.env.ABLY_API_KEY || process.env.ABLY_ROOT_API_KEY || '';
const PREFIX = process.env.LINGOSENTINEL_LIVE_SMOKE_PREFIX || 'smoke';

function activeChannel(lane, id) {
  return `ls:${lane}:${id}`;
}

function uniqueId(label) {
  return `${PREFIX}-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function test(name, fn) {
  return { name, fn };
}

async function runAll(tests) {
  if (!LIVE_ENABLED) {
    console.log('SKIP: Controlled Live Ably Smoke Layer is disabled.');
    console.log('Set LINGOSENTINEL_LIVE_ABLY_SMOKE=1 to enable.');
    console.log('No live Ably connection was attempted.');
    return;
  }

  if (!ABLY_API_KEY) {
    console.error('FAIL: ABLY_API_KEY or ABLY_ROOT_API_KEY is required for live Ably smoke.');
    process.exitCode = 1;
    return;
  }

  for (const item of tests) {
    try {
      await item.fn();
      console.log(`✓ ${item.name}`);
    } catch (error) {
      console.error(`✗ ${item.name}`);
      console.error(error);
      process.exitCode = 1;
    }
  }

  if (process.exitCode) {
    console.error('\nLingoSentinel controlled live Ably smoke tests failed.');
  } else {
    console.log('\nAll LingoSentinel controlled live Ably smoke tests passed.');
  }
}

function baseSender(overrides = {}) {
  return {
    id: 'mac-live-smoke-user',
    name: 'Mac',
    role: 'owner',
    preferredLanguage: 'en',
    ...overrides
  };
}

function baseRecipient(overrides = {}) {
  return {
    id: 'guest-live-smoke-user',
    name: 'Guest',
    role: 'recipient',
    preferredLanguage: 'fr',
    ...overrides
  };
}

function assertNoSecretLeak(value) {
  const text = JSON.stringify(value);

  assert.strictEqual(text.includes(ABLY_API_KEY), false);
  assert.strictEqual(text.includes('ABLY_ROOT_API_KEY'), false);
  assert.strictEqual(text.includes('ABLY_API_KEY'), false);
  assert.strictEqual(text.includes('api_key:'), false);
  assert.strictEqual(text.includes('password:'), false);
  assert.strictEqual(text.includes('private_key'), false);
  assert.strictEqual(text.includes('Bearer '), false);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createLiveAblyClient() {
  let Ably;

  try {
    Ably = require('ably');
  } catch (error) {
    throw new Error('Missing dependency: install Ably first with `npm install ably`.');
  }

  const client = new Ably.Realtime({
    key: ABLY_API_KEY,
    clientId: 'lingosentinel-live-smoke'
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out connecting to Ably.'));
    }, 10000);

    client.connection.once('connected', () => {
      clearTimeout(timeout);
      resolve();
    });

    client.connection.once('failed', stateChange => {
      clearTimeout(timeout);
      reject(new Error(`Ably connection failed: ${stateChange && stateChange.reason ? stateChange.reason.message : 'unknown'}`));
    });
  });

  return client;
}

async function subscribeOnce(client, channelName, eventName, timeoutMs = 10000) {
  const channel = client.channels.get(channelName);

  return new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      channel.unsubscribe(eventName, handler);
      reject(new Error(`Timed out waiting for ${eventName} on ${channelName}.`));
    }, timeoutMs);

    function handler(message) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      channel.unsubscribe(eventName, handler);
      resolve(message);
    }

    channel.subscribe(eventName, handler);
  });
}

async function closeClient(client) {
  if (!client) return;

  try {
    client.close();
    await wait(250);
  } catch (_) {
    // Best-effort cleanup only.
  }
}

function assertPublishedResult(result, expected) {
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.stage, 'published');
  assert.strictEqual(result.mode, expected.mode);
  assert.strictEqual(result.channel, expected.channel);
  assert.strictEqual(result.eventName, expected.eventName);

  assert.ok(result.governance, 'Expected governance object.');
  assert.strictEqual(result.governance.marionAuthority, true);

  assert.ok(result.telemetry, 'Expected telemetry object.');
  assert.strictEqual(result.telemetry.payloadShape, 'lingosentinel.signal');

  assertNoSecretLeak(result);
}

function assertReceivedMessage(message, expected) {
  assert.ok(message, 'Expected Ably message.');
  assert.strictEqual(message.name, expected.eventName);
  assert.ok(message.data && typeof message.data === 'object', 'Expected object payload.');

  assertNoSecretLeak(message);
}

runAll([
  test('controlled live smoke marker is present', () => {
    assert.strictEqual(
      'LINGOSENTINEL_CONTROLLED_LIVE_ABLY_SMOKE_V1'.includes('V1'),
      true
    );
  }),

  test('group_room publishes and receives through real Ably controlled channel', async () => {
    const client = await createLiveAblyClient();

    try {
      const roomId = uniqueId('region-canada');
      const channelName = activeChannel('room', roomId);
      const eventName = ACTIVE_EVENTS.group_room;

      const receivePromise = subscribeOnce(client, channelName, eventName);

      const result = await Engine.publishGroupMessage(
        {
          mode: 'group_room',
          roomId,
          text: 'Controlled live smoke: group room.',
          sender: baseSender(),
          sourceLanguage: 'en',
          targetLanguage: 'multi',
          metadata: {
            smoke: true,
            interactionSource: 'controlled_live_ably_smoke',
            region: 'Canada',
            city: 'Toronto'
          }
        },
        {
          client,
          clientId: 'lingosentinel-live-smoke'
        }
      );

      assertPublishedResult(result, {
        mode: 'group_room',
        channel: channelName,
        eventName
      });

      const message = await receivePromise;

      assertReceivedMessage(message, {
        eventName
      });
    } finally {
      await closeClient(client);
    }
  }),

  test('live_translate publishes and receives through real Ably controlled channel', async () => {
    const client = await createLiveAblyClient();

    try {
      const sessionId = uniqueId('translation-session');
      const channelName = activeChannel('live', sessionId);
      const eventName = ACTIVE_EVENTS.live_translate;

      const receivePromise = subscribeOnce(client, channelName, eventName);

      const result = await Engine.publishLiveTranslateMessage(
        {
          mode: 'live_translate',
          roomId: sessionId,
          sessionId,
          text: 'Controlled live smoke: live translate.',
          sender: baseSender(),
          sourceLanguage: 'en',
          targetLanguage: 'es',
          metadata: {
            smoke: true,
            interactionSource: 'controlled_live_ably_smoke',
            sessionId,
            languagePair: {
              source: 'en',
              target: 'es'
            }
          }
        },
        {
          client,
          clientId: 'lingosentinel-live-smoke'
        }
      );

      assertPublishedResult(result, {
        mode: 'live_translate',
        channel: channelName,
        eventName
      });

      const message = await receivePromise;

      assertReceivedMessage(message, {
        eventName
      });
    } finally {
      await closeClient(client);
    }
  }),

  test('delivered receipt publishes and receives through real Ably controlled channel', async () => {
    const client = await createLiveAblyClient();

    try {
      const threadId = uniqueId('delivery-thread');
      const channelName = activeChannel('receipt', threadId);
      const eventName = ACTIVE_EVENTS.delivered;

      const receivePromise = subscribeOnce(client, channelName, eventName);

      const result = await Engine.publishDeliveredReceipt(
        {
          mode: 'delivered',
          roomId: threadId,
          text: 'Controlled live smoke: delivered receipt.',
          sender: baseSender(),
          recipient: baseRecipient({ preferredLanguage: 'es' }),
          sourceLanguage: 'en',
          recipientLanguage: 'es',
          metadata: {
            smoke: true,
            interactionSource: 'controlled_live_ably_smoke',
            threadId
          }
        },
        {
          client,
          clientId: 'lingosentinel-live-smoke'
        }
      );

      assertPublishedResult(result, {
        mode: 'delivered',
        channel: channelName,
        eventName
      });

      const message = await receivePromise;

      assertReceivedMessage(message, {
        eventName
      });
    } finally {
      await closeClient(client);
    }
  }),

  test('direct message publishes and receives through real Ably controlled channel', async () => {
    const client = await createLiveAblyClient();

    try {
      const threadId = uniqueId('direct-thread');
      const channelName = activeChannel('direct', threadId);
      const eventName = ACTIVE_EVENTS.one_to_one;

      const receivePromise = subscribeOnce(client, channelName, eventName);

      const result = await Engine.publishDirectMessage(
        {
          mode: 'one_to_one',
          roomId: threadId,
          text: 'Controlled live smoke: direct message.',
          sender: baseSender(),
          recipient: baseRecipient(),
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          metadata: {
            smoke: true,
            interactionSource: 'controlled_live_ably_smoke',
            threadId
          }
        },
        {
          client,
          clientId: 'lingosentinel-live-smoke'
        }
      );

      assertPublishedResult(result, {
        mode: 'one_to_one',
        channel: channelName,
        eventName
      });

      const message = await receivePromise;

      assertReceivedMessage(message, {
        eventName
      });
    } finally {
      await closeClient(client);
    }
  }),

  test('credential-like content is rejected before real Ably publish', async () => {
    const client = await createLiveAblyClient();

    try {
      const roomId = uniqueId('security');
      const channelName = activeChannel('room', roomId);
      const eventName = ACTIVE_EVENTS.group_room;

      let received = false;

      const channel = client.channels.get(channelName);
      await channel.subscribe(eventName, () => {
        received = true;
      });

      const result = await Engine.publishGroupMessage(
        {
          mode: 'group_room',
          roomId,
          text: 'Here is my api_key: super-secret',
          sender: baseSender(),
          sourceLanguage: 'en',
          targetLanguage: 'multi',
          metadata: {
            smoke: true,
            interactionSource: 'controlled_live_ably_smoke'
          }
        },
        {
          client,
          clientId: 'lingosentinel-live-smoke'
        }
      );

      assert.strictEqual(result.ok, false);
      assert.ok(result.governance, 'Expected governance object.');
      assert.strictEqual(result.governance.marionAuthority, true);
      assert.strictEqual(result.governance.decision, 'reject');

      await wait(1000);

      assert.strictEqual(received, false);
      assertNoSecretLeak(result);

      await channel.unsubscribe(eventName);
    } finally {
      await closeClient(client);
    }
  })
]);
