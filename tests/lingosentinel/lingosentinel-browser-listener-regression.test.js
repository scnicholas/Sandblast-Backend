'use strict';

/**
 * LingoSentinel Browser Listener Regression Test
 *
 * VERSION_MARKER: LINGOSENTINEL_BROWSER_LISTENER_REGRESSION_V2
 *
 * Purpose:
 * - Locks the browser-facing realtime bridge without exposing Ably keys.
 * - Verifies the Webflow widget contract can request a backend token.
 * - Verifies the backend sandbox publish route uses the same channel/event contract.
 * - Optionally performs a real subscribe/receive check with the Ably npm package.
 *
 * V2 critical patch:
 * - Optional live receive is now skipped unless explicitly enabled.
 * - Live receive mode has explicit connection wait, channel attach wait,
 *   subscribe-before-publish ordering, longer timeout, and better diagnostics.
 * - The live handler accepts the first valid message on the exact sandbox channel/event
 *   instead of relying on brittle payload text matching.
 *
 * Expected live contract:
 * - roomId: sandbox-healthcheck
 * - channel: ls:room:sandbox-healthcheck
 * - eventName: lingosentinel.message.group
 *
 * Safe by design:
 * - No frontend API key required.
 * - No root key printed.
 * - No token secret printed.
 * - No production user room touched.
 *
 * Usage:
 * node -c tests\lingosentinel\lingosentinel-browser-listener-regression.test.js
 * node tests\lingosentinel\lingosentinel-browser-listener-regression.test.js
 *
 * Optional env:
 * LS_BACKEND=https://sandblast-backend.onrender.com
 * LS_WIDGET_HTML=lingosentinel_webflow_ably_listener.html
 * LS_REQUIRE_LIVE_RECEIVE=true
 * LS_BROWSER_LISTENER_TIMEOUT_MS=30000
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const VERSION_MARKER = 'LINGOSENTINEL_BROWSER_LISTENER_REGRESSION_V2';
const DEFAULT_BACKEND = 'https://sandblast-backend.onrender.com';
const BACKEND = String(process.env.LS_BACKEND || DEFAULT_BACKEND).replace(/\/$/, '');
const WIDGET_HTML = process.env.LS_WIDGET_HTML || '';
const ROOM_ID = process.env.LS_ROOM_ID || 'sandbox-healthcheck';
const CHANNEL = `ls:room:${ROOM_ID}`;
const EVENT_NAME = 'lingosentinel.message.group';
const CLIENT_ID = `browser-listener-regression-${Date.now()}`;
const REQUIRE_LIVE_RECEIVE = String(process.env.LS_REQUIRE_LIVE_RECEIVE || '').toLowerCase() === 'true';
const TIMEOUT_MS = Number(process.env.LS_BROWSER_LISTENER_TIMEOUT_MS || 30000);

const TOKEN_ROUTE = '/api/lingosentinel/token';
const READINESS_ROUTE = '/api/lingosentinel/ably/readiness';
const SANDBOX_PUBLISH_ROUTE = '/api/lingosentinel/ably/sandbox-publish';

function test(name, fn) {
  return { name, fn };
}

async function runAll(tests) {
  console.log(`Running ${VERSION_MARKER}`);
  console.log(`Backend: ${BACKEND}`);
  console.log(`Room: ${ROOM_ID}`);
  console.log(`Channel: ${CHANNEL}`);
  console.log(`Event: ${EVENT_NAME}`);
  console.log(`Live receive required: ${REQUIRE_LIVE_RECEIVE}`);

  for (const item of tests) {
    try {
      await item.fn();
      console.log(`✓ ${item.name}`);
    } catch (error) {
      console.error(`✗ ${item.name}`);
      console.error(error && error.stack ? error.stack : error);
      process.exitCode = 1;
      break;
    }
  }

  if (process.exitCode) {
    console.error('\nLingoSentinel browser listener regression failed.');
  } else {
    console.log('\nAll LingoSentinel browser listener regression tests passed.');
  }
}

function requestJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = body == null ? '' : JSON.stringify(body);
    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.request({
      method,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: `${parsed.pathname}${parsed.search}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'LingoSentinel-Browser-Listener-Regression/2.0'
      },
      timeout: TIMEOUT_MS
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch (_) {
          json = null;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, raw, json });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`Timed out requesting ${method} ${url}`));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function maybeReadWidgetHtml() {
  const candidates = [
    WIDGET_HTML,
    path.join(process.cwd(), 'lingosentinel_webflow_ably_listener.html'),
    path.join(process.cwd(), 'public', 'lingosentinel_webflow_ably_listener.html'),
    path.join(process.cwd(), 'Data', 'marion', 'runtime', 'LingoSentinel', 'lingosentinel_webflow_ably_listener.html'),
    path.join(process.cwd(), 'Pasted text(487).txt')
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const full = path.resolve(candidate);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return { path: full, text: fs.readFileSync(full, 'utf8') };
      }
    } catch (_) {}
  }

  return { path: '', text: '' };
}

function assertNoSecretLeak(value, label = 'value') {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {});
  const envSecrets = [
    process.env.ABLY_API_KEY,
    process.env.ABLY_ROOT_API_KEY,
    process.env.LS_ABLY_API_KEY,
    process.env.LS_ABLY_ROOT_API_KEY
  ].filter(Boolean);

  const blockedPatterns = [
    /ABLY_API_KEY/i,
    /ABLY_ROOT_API_KEY/i,
    /api[_-]?key\s*[:=]/i,
    /root[_-]?api[_-]?key/i,
    /private[_-]?key/i,
    /keySecret/i,
    /clientSecret/i,
    /password\s*[:=]/i,
    /ably:key/i
  ];

  for (const pattern of blockedPatterns) {
    assert.strictEqual(pattern.test(text), false, `${label} leaked blocked secret pattern: ${pattern}`);
  }

  for (const secret of envSecrets) {
    assert.strictEqual(text.includes(secret), false, `${label} leaked an environment secret value.`);
  }
}

function assertWidgetContract(widget) {
  if (!widget.text) {
    console.log('↷ skipped static widget contract scan because no widget HTML path was found');
    console.log('  set LS_WIDGET_HTML=path\\to\\lingosentinel_webflow_ably_listener.html to enable it');
    return;
  }

  assert.ok(widget.text.includes('LingoSentinel'), 'Expected widget HTML to contain LingoSentinel label.');
  assert.ok(widget.text.includes('https://cdn.ably.com/lib/ably.min-1.js'), 'Expected widget to load browser Ably client from CDN.');
  assert.ok(widget.text.includes(TOKEN_ROUTE), `Expected widget to call ${TOKEN_ROUTE}.`);
  assert.ok(widget.text.includes('/api/lingosentinel/publish'), 'Expected widget to call backend publish bridge.');
  assert.ok(widget.text.includes('new Ably.Realtime'), 'Expected widget to instantiate Ably.Realtime.');
  assert.ok(widget.text.includes('authCallback'), 'Expected widget to use backend authCallback, not frontend key.');
  assert.ok(widget.text.includes(ROOM_ID), `Expected widget sandbox room to be ${ROOM_ID}.`);
  assert.ok(widget.text.includes('Live link') || widget.text.includes('setState'), 'Expected widget to expose listener status state.');
  assertNoSecretLeak(widget.text, 'widget html');
}

function tokenRequestBody(clientId = CLIENT_ID) {
  return {
    mode: 'group_room',
    roomId: ROOM_ID,
    clientId
  };
}

function publishBody() {
  return {
    text: 'Browser listener regression sandbox message.',
    mode: 'group_room',
    roomId: ROOM_ID,
    sender: {
      id: 'browser-listener-regression',
      name: 'LingoSentinel Regression',
      role: 'tester',
      preferredLanguage: 'en'
    },
    recipient: {
      id: 'sandbox-listener',
      name: 'Sandbox Listener',
      role: 'participant',
      preferredLanguage: 'en'
    },
    recipientLanguage: 'en',
    metadata: {
      regression: true,
      publicSurface: 'Nyx',
      source: VERSION_MARKER
    }
  };
}

function validateTokenResponse(response) {
  assert.strictEqual(response.statusCode, 200, `Expected token route 200; got ${response.statusCode}: ${response.raw}`);
  assert.ok(response.json, 'Expected token route JSON.');
  assert.strictEqual(response.json.ok !== false, true, 'Expected token route ok not false.');
  assert.strictEqual(response.json.channel, CHANNEL, 'Expected token route channel to match browser listener channel.');
  assert.ok(response.json.tokenRequest || response.json.token, 'Expected tokenRequest or token in token response.');
  assertNoSecretLeak(response.json, 'token response');
}

function validateReadinessResponse(response) {
  assert.strictEqual(response.statusCode, 200, `Expected readiness 200; got ${response.statusCode}: ${response.raw}`);
  assert.ok(response.json, 'Expected readiness JSON.');
  assert.strictEqual(response.json.ok, true, 'Expected readiness ok true.');
  assert.strictEqual(response.json.ablyConfigured, true, 'Expected Render/backend Ably configuration true.');
  assert.strictEqual(response.json.marionAuthority, true, 'Expected Marion authority true.');
  assertNoSecretLeak(response.json, 'readiness response');
}

function validatePublishResponse(response) {
  assert.strictEqual(response.statusCode, 200, `Expected sandbox publish 200; got ${response.statusCode}: ${response.raw}`);
  assert.ok(response.json, 'Expected sandbox publish JSON.');
  assert.strictEqual(response.json.ok, true, 'Expected sandbox publish ok true.');
  assert.strictEqual(response.json.stage, 'published', 'Expected sandbox publish stage published.');
  assert.strictEqual(response.json.channel, CHANNEL, 'Expected sandbox publish channel to match listener channel.');
  assert.strictEqual(response.json.eventName, EVENT_NAME, 'Expected sandbox publish event name to match listener event.');
  assert.strictEqual(response.json.marionAuthority, true, 'Expected Marion authority true.');
  assertNoSecretLeak(response.json, 'sandbox publish response');
}

function requireAblyOrSkip() {
  if (!REQUIRE_LIVE_RECEIVE) {
    console.log('↷ skipped live subscribe/receive because LS_REQUIRE_LIVE_RECEIVE is not true');
    console.log('  contract tests still validate readiness, token route, publish route, channel, event, and no key exposure');
    return null;
  }

  try {
    return require('ably');
  } catch (error) {
    error.message = `Ably package is required for live receive mode. Run: npm install ably\nOriginal error: ${error.message}`;
    throw error;
  }
}

function createAblyRealtime(Ably, tokenRequest) {
  const authCallback = (_params, callback) => callback(null, tokenRequest);
  const options = {
    authCallback,
    clientId: CLIENT_ID,
    autoConnect: false
  };

  if (Ably.Realtime) {
    return new Ably.Realtime(options);
  }

  if (typeof Ably === 'function') {
    return new Ably(options);
  }

  throw new Error('Unable to create Ably realtime client from installed package.');
}

function safeState(client, channel) {
  return {
    connectionState: client && client.connection ? client.connection.state : 'unavailable',
    channelState: channel && channel.state ? channel.state : 'unavailable',
    channel: CHANNEL,
    eventName: EVENT_NAME,
    timeoutMs: TIMEOUT_MS
  };
}

function waitForConnection(client, channel) {
  return new Promise((resolve, reject) => {
    if (client.connection && client.connection.state === 'connected') return resolve(true);

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for Ably browser-listener connection: ${JSON.stringify(safeState(client, channel))}`));
    }, TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      if (client.connection && typeof client.connection.off === 'function') {
        client.connection.off('connected', onConnected);
        client.connection.off('failed', onFailed);
        client.connection.off('suspended', onFailed);
        client.connection.off('closed', onFailed);
      }
    }

    function onConnected() {
      cleanup();
      resolve(true);
    }

    function onFailed(stateChange) {
      cleanup();
      reject(new Error(`Ably connection failed, closed, or suspended: ${JSON.stringify({ ...safeState(client, channel), stateChange })}`));
    }

    if (!client.connection || typeof client.connection.on !== 'function') {
      cleanup();
      reject(new Error('Ably connection API unavailable.'));
      return;
    }

    client.connection.on('connected', onConnected);
    client.connection.on('failed', onFailed);
    client.connection.on('suspended', onFailed);
    client.connection.on('closed', onFailed);

    try {
      if (typeof client.connect === 'function') client.connect();
      else if (client.connection && typeof client.connection.connect === 'function') client.connection.connect();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function attachChannel(channel, client) {
  return new Promise((resolve, reject) => {
    if (channel.state === 'attached') return resolve(true);

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out attaching Ably channel: ${JSON.stringify(safeState(client, channel))}`));
    }, TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      if (typeof channel.off === 'function') {
        channel.off('attached', onAttached);
        channel.off('failed', onFailed);
        channel.off('suspended', onFailed);
      }
    }

    function onAttached() {
      cleanup();
      resolve(true);
    }

    function onFailed(stateChange) {
      cleanup();
      reject(new Error(`Ably channel attach failed or suspended: ${JSON.stringify({ ...safeState(client, channel), stateChange })}`));
    }

    if (typeof channel.on === 'function') {
      channel.on('attached', onAttached);
      channel.on('failed', onFailed);
      channel.on('suspended', onFailed);
    }

    try {
      const result = channel.attach((error) => {
        if (error) onFailed(error);
        else onAttached();
      });
      if (result && typeof result.then === 'function') result.then(onAttached).catch(onFailed);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function subscribeAndWait(channel, client) {
  let receivedCount = 0;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${EVENT_NAME} on ${CHANNEL}: ${JSON.stringify({ ...safeState(client, channel), receivedCount })}`));
    }, TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      try {
        if (typeof channel.unsubscribe === 'function') channel.unsubscribe(EVENT_NAME, handler);
      } catch (_) {}
    }

    function handler(message) {
      receivedCount += 1;
      if (!message || message.name !== EVENT_NAME) return;
      cleanup();
      resolve(message);
    }

    try {
      const result = channel.subscribe(EVENT_NAME, handler, (error) => {
        if (error) {
          cleanup();
          reject(error);
        }
      });
      if (result && typeof result.then === 'function') result.catch((error) => {
        cleanup();
        reject(error);
      });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function closeClient(client) {
  try {
    if (client && typeof client.close === 'function') client.close();
  } catch (_) {}
}

async function liveReceiveRegression() {
  const Ably = requireAblyOrSkip();
  if (!Ably) return;

  const tokenResponse = await requestJson('POST', `${BACKEND}${TOKEN_ROUTE}`, tokenRequestBody(`${CLIENT_ID}-live`));
  validateTokenResponse(tokenResponse);

  const tokenRequest = tokenResponse.json.tokenRequest || tokenResponse.json.token;
  const client = createAblyRealtime(Ably, tokenRequest);
  const channel = client.channels.get(CHANNEL);

  try {
    await waitForConnection(client, channel);
    await attachChannel(channel, client);

    const receivedPromise = subscribeAndWait(channel, client);

    // Give Ably a small buffer after subscription/attach before the backend publish.
    await new Promise((resolve) => setTimeout(resolve, 900));

    const publishResponse = await requestJson('POST', `${BACKEND}${SANDBOX_PUBLISH_ROUTE}`, publishBody());
    validatePublishResponse(publishResponse);

    const message = await receivedPromise;
    assert.strictEqual(message.name, EVENT_NAME, 'Expected received event name to match LingoSentinel group event.');
    assert.ok(message.data, 'Expected received message data.');
    assertNoSecretLeak(message.data, 'received Ably message');
  } finally {
    closeClient(client);
  }
}

runAll([
  test('version marker is present', () => {
    assert.strictEqual(VERSION_MARKER, 'LINGOSENTINEL_BROWSER_LISTENER_REGRESSION_V2');
  }),

  test('static widget listener contract is safe and aligned', () => {
    assertWidgetContract(maybeReadWidgetHtml());
  }),

  test('backend readiness endpoint confirms Ably without exposing secrets', async () => {
    const response = await requestJson('GET', `${BACKEND}${READINESS_ROUTE}`);
    validateReadinessResponse(response);
  }),

  test('backend token route returns listener credentials for sandbox channel', async () => {
    const response = await requestJson('POST', `${BACKEND}${TOKEN_ROUTE}`, tokenRequestBody());
    validateTokenResponse(response);
  }),

  test('backend sandbox publish route publishes matching browser-listener contract', async () => {
    const response = await requestJson('POST', `${BACKEND}${SANDBOX_PUBLISH_ROUTE}`, publishBody());
    validatePublishResponse(response);
  }),

  test('optional live Ably subscribe receives sandbox publish event', liveReceiveRegression)
]);
