'use strict';

/**
 * lingosentinel-ably-live-sandbox-smoke.test.js
 *
 * VERSION_MARKER: LINGOSENTINEL_ABLY_LIVE_SANDBOX_SMOKE_V1
 *
 * Controlled live Ably sandbox smoke for:
 * LingoSentinelEngine → real Ably sandbox channel → live subscribe receipt
 *
 * Purpose:
 * - Prove the backend can publish one governed LingoSentinel signal through Ably.
 * - Prove a controlled subscriber receives the signal.
 * - Prove Marion governance remains attached.
 * - Prove no Ably/API key material leaks into payloads or result objects.
 *
 * Safety:
 * - This test only runs when ABLY_API_KEY or ABLY_ROOT_API_KEY is present.
 * - If no key exists, it skips cleanly.
 * - It publishes only to a sandbox room.
 * - It does not touch Webflow, production rooms, or real user sessions.
 *
 * Active adaptive contract:
 * - group_room → ls:room:{roomId} → lingosentinel.message.group
 *
 * Required dependency:
 * npm install ably
 */

const assert = require('assert');

const Engine = require('../../Data/marion/runtime/LingoSentinel/LingoSentinelEngine');

const VERSION_MARKER = 'LINGOSENTINEL_ABLY_LIVE_SANDBOX_SMOKE_V1';

const SANDBOX_ROOM_ID = `sandbox-healthcheck-${Date.now()}`;
const SANDBOX_CHANNEL = `ls:room:${SANDBOX_ROOM_ID}`;
const SANDBOX_EVENT = 'lingosentinel.message.group';

function test(name, fn) {
  return { name, fn };
}

async function runAll(tests) {
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
    console.error('\nLingoSentinel Ably live sandbox smoke tests failed.');
  } else {
    console.log('\nAll LingoSentinel Ably live sandbox smoke tests passed.');
  }
}

function getAblyKey() {
  return process.env.ABLY_API_KEY || process.env.ABLY_ROOT_API_KEY || '';
}

function shouldSkipLiveSmoke() {
  return !getAblyKey();
}

function assertNoSecretLeak(value) {
  const text = JSON.stringify(value);
  const key = getAblyKey();

  assert.strictEqual(text.includes('ABLY_ROOT_API_KEY'), false);
  assert.strictEqual(text.includes('ABLY_API_KEY'), false);
  assert.strictEqual(text.includes('ably:key'), false);
  assert.strictEqual(text.includes('api_key:'), false);
  assert.strictEqual(text.includes('password:'), false);
  assert.strictEqual(text.includes('private_key'), false);
  assert.strictEqual(text.includes('super-secret'), false);

  if (key) {
    assert.strictEqual(text.includes(key), false);
  }
}

function buildSandboxGroupInput() {
  return {
    mode: 'group_room',
    roomId: SANDBOX_ROOM_ID,
    text: 'LingoSentinel controlled live sandbox smoke.',
    sender: {
      id: 'mac-live-sandbox-user',
      name: 'Mac',
      role: 'owner',
      preferredLanguage: 'en'
    },
    sourceLanguage: 'en',
    targetLanguage: 'multi',
    metadata: {
      testType: 'controlled_live_sandbox_smoke',
      interactionSource: 'live_sandbox_test',
      widgetSurface: 'backend_smoke',
      sandbox: true
    }
  };
}

async function requireAbly() {
  try {
    return require('ably');
  } catch (error) {
    error.message =
      'Ably package is not installed. Run: npm install ably\nOriginal error: ' +
      error.message;
    throw error;
  }
}

function createAblyRealtimeClient(Ably, key) {
  if (Ably.Realtime) {
    return new Ably.Realtime({
      key,
      clientId: 'lingosentinel-live-sandbox-smoke'
    });
  }

  if (typeof Ably === 'function') {
    return new Ably({
      key,
      clientId: 'lingosentinel-live-sandbox-smoke'
    });
  }

  throw new Error('Unable to create Ably realtime client from installed ably package.');
}

function waitForConnection(client, timeoutMs = 8000) {
  if (client.connection && client.connection.state === 'connected') {
    return Promise.resolve(true);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for Ably connection.'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);

      if (client.connection && typeof client.connection.off === 'function') {
        client.connection.off('connected', onConnected);
        client.connection.off('failed', onFailed);
        client.connection.off('suspended', onFailed);
      }
    }

    function onConnected() {
      cleanup();
      resolve(true);
    }

    function onFailed(stateChange) {
      cleanup();
      reject(new Error(`Ably connection failed or suspended: ${JSON.stringify(stateChange)}`));
    }

    if (!client.connection || typeof client.connection.on !== 'function') {
      cleanup();
      reject(new Error('Ably client connection API is unavailable.'));
      return;
    }

    client.connection.on('connected', onConnected);
    client.connection.on('failed', onFailed);
    client.connection.on('suspended', onFailed);
  });
}

function waitForMessage(channel, eventName, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for Ably event: ${eventName}`));
    }, timeoutMs);

    async function cleanup() {
      clearTimeout(timer);

      try {
        if (typeof channel.unsubscribe === 'function') {
          await channel.unsubscribe(eventName, onMessage);
        }
      } catch (_) {
        // Best-effort cleanup only.
      }
    }

    async function onMessage(message) {
      await cleanup();
      resolve(message);
    }

    channel.subscribe(eventName, onMessage).catch(error => {
      cleanup();
      reject(error);
    });
  });
}

async function closeAbly(client) {
  if (!client) return;

  try {
    if (typeof client.close === 'function') {
      client.close();
    }
  } catch (_) {
    // Best-effort cleanup only.
  }
}

runAll([
  test('loaded controlled live sandbox marker is present', () => {
    assert.strictEqual(VERSION_MARKER.includes('V1'), true);
  }),

  test('live sandbox skips cleanly when Ably key is not configured', () => {
    if (getAblyKey()) {
      assert.strictEqual(shouldSkipLiveSmoke(), false);
      return;
    }

    assert.strictEqual(shouldSkipLiveSmoke(), true);
    console.log('↷ skipped live Ably smoke because ABLY_API_KEY / ABLY_ROOT_API_KEY is not configured');
  }),

  test('controlled group_room signal publishes and is received through live Ably sandbox', async () => {
    if (shouldSkipLiveSmoke()) {
      console.log('↷ skipped controlled live publish/subscribe because Ably key is not configured');
      return;
    }

    const key = getAblyKey();
    const Ably = await requireAbly();

    let subscriberClient;
    let publisherClient;

    try {
      subscriberClient = createAblyRealtimeClient(Ably, key);
      publisherClient = createAblyRealtimeClient(Ably, key);

      await waitForConnection(subscriberClient);
      await waitForConnection(publisherClient);

      const subscriberChannel = subscriberClient.channels.get(SANDBOX_CHANNEL);

      const receivedPromise = waitForMessage(subscriberChannel, SANDBOX_EVENT);

      const input = buildSandboxGroupInput();

      const result = await Engine.publishGroupMessage(input, {
        client: publisherClient,
        clientId: 'lingosentinel-live-sandbox-publisher'
      });

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.stage, 'published');
      assert.strictEqual(result.mode, 'group_room');
      assert.strictEqual(result.channel, SANDBOX_CHANNEL);
      assert.strictEqual(result.eventName, SANDBOX_EVENT);

      assert.ok(result.governance, 'Expected governance object.');
      assert.strictEqual(result.governance.marionAuthority, true);

      assert.ok(result.telemetry, 'Expected telemetry object.');
      assert.strictEqual(result.telemetry.payloadShape, 'lingosentinel.signal');

      assertNoSecretLeak(result);

      const received = await receivedPromise;

      assert.strictEqual(received.name, SANDBOX_EVENT);
      assert.ok(received.data, 'Expected received Ably message data.');

      const payloadText = JSON.stringify(received.data);
      assert.ok(
        payloadText.includes('LingoSentinelEngine') || payloadText.includes('lingosentinel'),
        'Expected received payload to look like a LingoSentinel signal.'
      );

      assert.strictEqual(payloadText.includes(key), false);
      assertNoSecretLeak(received.data);
    } finally {
      await closeAbly(publisherClient);
      await closeAbly(subscriberClient);
    }
  }),

  test('private credential text is rejected before live Ably publish', async () => {
    if (shouldSkipLiveSmoke()) {
      console.log('↷ skipped live rejection check because Ably key is not configured');
      return;
    }

    const key = getAblyKey();
    const Ably = await requireAbly();

    let publisherClient;

    try {
      publisherClient = createAblyRealtimeClient(Ably, key);
      await waitForConnection(publisherClient);

      const input = buildSandboxGroupInput();
      input.text = 'Here is my api_key: super-secret';

      const result = await Engine.publishGroupMessage(input, {
        client: publisherClient,
        clientId: 'lingosentinel-live-sandbox-publisher'
      });

      assert.strictEqual(result.ok, false);
      assert.ok(result.governance, 'Expected governance object.');
      assert.strictEqual(result.governance.marionAuthority, true);
      assert.strictEqual(result.governance.decision, 'reject');

      assertNoSecretLeak(result);
    } finally {
      await closeAbly(publisherClient);
    }
  })
]);
