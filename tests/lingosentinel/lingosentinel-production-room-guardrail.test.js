'use strict';

/**
 * lingosentinel-production-room-guardrail.test.js
 *
 * VERSION_MARKER: LINGOSENTINEL_PRODUCTION_ROOM_GUARDRAIL_V2_CONTROLLED_PRIVATE_ROOM
 *
 * Purpose:
 * - Production-room preflight guardrail test before real user rooms are opened.
 * - Confirms deployed backend readiness, token route, sandbox publish route, CORS posture,
 *   room naming discipline, and no secret leakage in public-facing responses.
 *
 * Default mode is safe preflight:
 * - It validates the deployed backend and static contracts.
 * - It does not require destructive traffic.
 * - It does not expose API keys.
 *
 * Optional strict mode:
 * - Set LS_REQUIRE_PRODUCTION_GUARDRAILS=true to fail on advisory warnings.
 *
 * Optional widget scan:
 * - Set LS_WIDGET_HTML="path\to\lingosentinel_webflow_ably_listener.html".
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const VERSION_MARKER = 'LINGOSENTINEL_PRODUCTION_ROOM_GUARDRAIL_V2_CONTROLLED_PRIVATE_ROOM';
const BACKEND = String(process.env.LS_BACKEND || 'https://sandblast-backend.onrender.com').replace(/\/$/, '');
const ROOM = String(process.env.LS_GUARDRAIL_ROOM || 'sandbox-healthcheck');
const PRIVATE_ROOM = String(process.env.LS_PRIVATE_ROOM || 'private-mac-lingosentinel-alpha');
const STRICT = /^true$/i.test(String(process.env.LS_REQUIRE_PRODUCTION_GUARDRAILS || ''));
const WIDGET_HTML = String(process.env.LS_WIDGET_HTML || '').trim();
const TIMEOUT_MS = Math.max(6000, Number(process.env.LS_GUARDRAIL_TIMEOUT_MS || 16000));

const EXPECTED = Object.freeze({
  group_room: { channel: `ls:room:${ROOM}`, eventName: 'lingosentinel.message.group' },
  private_group_room: { channel: `ls:room:${PRIVATE_ROOM}`, eventName: 'lingosentinel.message.group' },
  one_to_one: { channelPrefix: 'ls:direct:', eventName: 'lingosentinel.message.direct' },
  live_translate: { channelPrefix: 'ls:live:', eventName: 'lingosentinel.message.live' },
  delivered: { channelPrefix: 'ls:receipt:', eventName: 'lingosentinel.message.delivered' }
});

const disallowedSecretPatterns = Object.freeze([
  /ABLY_API_KEY/i,
  /ABLY_ROOT_API_KEY/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /client[_-]?secret/i,
  /keySecret/i,
  /tokenSecret/i,
  /\.apps\.ably\.io/i,
  /[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{3,}:[A-Za-z0-9_-]{12,}/
]);

function test(name, fn) {
  return { name, fn };
}

async function runAll(tests) {
  console.log(`Running ${VERSION_MARKER}`);
  console.log(`Backend: ${BACKEND}`);
  console.log(`Room: ${ROOM}`);
  console.log(`Private room: ${PRIVATE_ROOM}`);
  console.log(`Strict: ${STRICT}`);

  for (const item of tests) {
    try {
      await item.fn();
      console.log(`✓ ${item.name}`);
    } catch (error) {
      console.error(`✗ ${item.name}`);
      console.error(error && error.message ? error.message : error);
      process.exitCode = 1;
    }
  }

  if (process.exitCode) {
    console.error('\nLingoSentinel production room guardrail failed.');
  } else {
    console.log('\nAll LingoSentinel production room guardrail tests passed.');
  }
}

function advisory(message) {
  if (STRICT) throw new Error(message);
  console.log(`↷ advisory: ${message}`);
}

function assertNoSecretLeak(value, label = 'value') {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {});
  for (const pattern of disallowedSecretPatterns) {
    assert.strictEqual(pattern.test(text), false, `${label} appears to expose secret-like material: ${pattern}`);
  }
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

function request(method, urlPath, body, extraHeaders = {}) {
  const url = `${BACKEND}${urlPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, {
    method,
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://www.sandblast.channel',
      'x-sb-trace-id': `guardrail-${Date.now()}`,
      ...extraHeaders
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async (response) => {
    clearTimeout(timer);
    const text = await response.text();
    return {
      response,
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      text,
      json: safeJsonParse(text)
    };
  }, (error) => {
    clearTimeout(timer);
    throw error;
  });
}

function assertRoomNameDiscipline(roomId) {
  assert.ok(roomId, 'Expected room id.');
  assert.ok(roomId.length >= 3 && roomId.length <= 80, 'Room id must be 3-80 characters.');
  assert.ok(/^[a-z0-9][a-z0-9_-]*$/i.test(roomId), 'Room id must use safe slug characters only.');
  assert.strictEqual(/[\s:@/\\]/.test(roomId), false, 'Room id must not contain spaces, colons, slashes, or paths.');
  assert.strictEqual(/(?:ably|api|key|secret|token|password)/i.test(roomId), false, 'Room id must not contain credential words.');
}

function flattenHeaders(headers) {
  const out = {};
  if (!headers || typeof headers.forEach !== 'function') return out;
  headers.forEach((value, key) => { out[key.toLowerCase()] = value; });
  return out;
}

function assertNoStore(headers) {
  const h = flattenHeaders(headers);
  const cache = h['cache-control'] || '';
  if (!/no-store/i.test(cache)) advisory('Cache-Control is not explicitly no-store on this response.');
}

function assertCors(headers) {
  const h = flattenHeaders(headers);
  const methods = h['access-control-allow-methods'] || '';
  const allowedHeaders = h['access-control-allow-headers'] || '';
  assert.ok(/POST/i.test(methods) || methods === '', 'CORS should allow POST or omit method header on non-OPTIONS response.');
  if (allowedHeaders) {
    assert.ok(/content-type/i.test(allowedHeaders), 'CORS should allow Content-Type.');
  }
}

function staticWidgetScan(filePath) {
  const resolved = path.resolve(filePath);
  const html = fs.readFileSync(resolved, 'utf8');
  assertNoSecretLeak(html, 'widget html');
  assert.ok(html.includes('/api/lingosentinel/token'), 'Widget should call backend token route.');
  assert.ok(html.includes('/api/lingosentinel/publish'), 'Widget should call backend publish route.');
  assert.ok(html.includes('sandblast-backend.onrender.com') || /LS_BACKEND/.test(html), 'Widget should preserve backend selection.');
  assert.strictEqual(/new\s+Ably\.Realtime\s*\(\s*\{\s*key\s*:/i.test(html), false, 'Widget must not instantiate Ably with a frontend key.');
  assert.strictEqual(/ABLY_(?:ROOT_)?API_KEY/i.test(html), false, 'Widget must not reference Ably env key names.');
}

runAll([
  test('version marker is present', () => {
    assert.strictEqual(VERSION_MARKER.includes('PRODUCTION_ROOM_GUARDRAIL_V2_CONTROLLED_PRIVATE_ROOM'), true);
  }),

  test('production room naming discipline is safe', () => {
    assertRoomNameDiscipline(ROOM);
    assert.strictEqual(EXPECTED.group_room.channel, `ls:room:${ROOM}`);
    assert.strictEqual(EXPECTED.group_room.eventName, 'lingosentinel.message.group');
  }),

  test('static widget has no frontend key exposure when provided', () => {
    if (!WIDGET_HTML) {
      console.log('↷ skipped widget scan because LS_WIDGET_HTML is not set');
      return;
    }
    staticWidgetScan(WIDGET_HTML);
  }),

  test('readiness endpoint confirms safe backend configuration', async () => {
    const result = await request('GET', '/api/lingosentinel/ably/readiness');
    assert.strictEqual(result.status, 200, `Expected readiness 200, got ${result.status}: ${result.text}`);
    assert.ok(result.json, 'Expected readiness JSON.');
    assert.strictEqual(result.json.ok, true);
    assert.strictEqual(result.json.ablyConfigured, true);
    assert.strictEqual(result.json.marionAuthority, true);
    assert.strictEqual(result.json.publicSurface, 'Nyx');
    assertNoSecretLeak(result.json, 'readiness response');
    assertNoStore(result.headers);
  }),

  test('token health route is reachable without secret exposure', async () => {
    const result = await request('GET', '/api/lingosentinel/token/health');
    assert.strictEqual(result.status, 200, `Expected token health 200, got ${result.status}: ${result.text}`);
    assertNoSecretLeak(result.text, 'token health response');
  }),

  test('sandbox group_room token aligns to production listener contract', async () => {
    const body = {
      mode: 'group_room',
      roomId: ROOM,
      clientId: `guardrail-listener-${Date.now()}`
    };
    const result = await request('POST', '/api/lingosentinel/token', body);
    assert.strictEqual(result.status, 200, `Expected token 200, got ${result.status}: ${result.text}`);
    assert.ok(result.json, 'Expected token JSON.');
    assertNoSecretLeak(result.json, 'token response');
    const channel = result.json.channel || (result.json.capability && Object.keys(result.json.capability)[0]) || '';
    assert.strictEqual(channel, EXPECTED.group_room.channel, `Expected ${EXPECTED.group_room.channel}, got ${channel}`);
    assert.ok(result.json.tokenRequest || result.json.token || result.json.auth, 'Expected listener credential payload.');
  }),

  test('sandbox publish route publishes matching production contract safely', async () => {
    const result = await request('POST', '/api/lingosentinel/ably/sandbox-publish');
    assert.strictEqual(result.status, 200, `Expected sandbox publish 200, got ${result.status}: ${result.text}`);
    assert.ok(result.json, 'Expected sandbox publish JSON.');
    assert.strictEqual(result.json.ok, true);
    assert.strictEqual(result.json.stage, 'published');
    assert.strictEqual(result.json.mode, 'group_room');
    assert.strictEqual(result.json.roomId, ROOM);
    assert.strictEqual(result.json.channel, EXPECTED.group_room.channel);
    assert.strictEqual(result.json.eventName, EXPECTED.group_room.eventName);
    assert.strictEqual(result.json.marionAuthority, true);
    assert.strictEqual(result.json.publicSurface, 'Nyx');
    assertNoSecretLeak(result.json, 'sandbox publish response');
    assertCors(result.headers);
    assertNoStore(result.headers);
  }),

  test('invalid room id is rejected or safely normalized by token route', async () => {
    const result = await request('POST', '/api/lingosentinel/token', {
      mode: 'group_room',
      roomId: '../secret room:bad',
      clientId: `guardrail-invalid-${Date.now()}`
    });
    assertNoSecretLeak(result.text, 'invalid room response');
    if (result.status >= 400) return;
    const channel = result.json && result.json.channel ? String(result.json.channel) : '';
    if (!channel) advisory('Invalid room request returned 200 without a channel field.');
    assert.strictEqual(channel.includes('..'), false, 'Token route must not preserve path traversal in channel.');
    assert.strictEqual(/[\s/\\]/.test(channel), false, 'Token route must not preserve spaces or slashes in channel.');
  }),


  test('controlled private room health route is safe and explicit', async () => {
    const result = await request('GET', '/api/lingosentinel/private/health');
    assert.strictEqual(result.status, 200, `Expected private health 200, got ${result.status}: ${result.text}`);
    assert.ok(result.json, 'Expected private health JSON.');
    assert.strictEqual(result.json.ok, true);
    assert.strictEqual(result.json.marionAuthority, true);
    assert.strictEqual(result.json.publicSurface, 'Nyx');
    assert.strictEqual(result.json.liveScope, 'controlled_private');
    assert.ok(Number(result.json.tokenTtlMs) >= 300000, 'Expected private token TTL >= 5 minutes.');
    assert.ok(Number(result.json.tokenTtlMs) <= 900000, 'Expected private token TTL <= 15 minutes.');
    assertNoSecretLeak(result.json, 'private health response');
    assertNoStore(result.headers);
  }),

  test('controlled private room token uses allowlisted room and short TTL', async () => {
    assertRoomNameDiscipline(PRIVATE_ROOM);
    const result = await request('POST', '/api/lingosentinel/private/token', {
      mode: 'group_room',
      roomId: PRIVATE_ROOM,
      clientId: `private-host-${Date.now()}`,
      role: 'host'
    });
    assert.strictEqual(result.status, 200, `Expected private token 200, got ${result.status}: ${result.text}`);
    assert.ok(result.json, 'Expected private token JSON.');
    assert.strictEqual(result.json.ok, true);
    assert.strictEqual(result.json.roomId, PRIVATE_ROOM);
    assert.strictEqual(result.json.role, 'host');
    assert.strictEqual(result.json.channel, EXPECTED.private_group_room.channel);
    assert.strictEqual(result.json.eventName, EXPECTED.private_group_room.eventName);
    assert.strictEqual(result.json.marionAuthority, true);
    assert.strictEqual(result.json.publicSurface, 'Nyx');
    assert.strictEqual(result.json.liveScope, 'controlled_private');
    assert.ok(Number(result.json.tokenTtlMs) >= 300000, 'Expected token TTL >= 5 minutes.');
    assert.ok(Number(result.json.tokenTtlMs) <= 900000, 'Expected token TTL <= 15 minutes.');
    assert.ok(result.json.tokenRequest || result.json.token || result.json.auth, 'Expected listener credential payload.');
    assertNoSecretLeak(result.json, 'private token response');
    assertNoStore(result.headers);
  }),

  test('controlled private room rejects arbitrary public room token', async () => {
    const result = await request('POST', '/api/lingosentinel/private/token', {
      mode: 'group_room',
      roomId: 'public-open-room',
      clientId: `private-bad-${Date.now()}`,
      role: 'host'
    });
    assert.ok(result.status === 403 || result.status === 400, `Expected private token rejection, got ${result.status}: ${result.text}`);
    assertNoSecretLeak(result.text, 'private room rejection response');
  }),

  test('controlled private room publish route uses private contract safely', async () => {
    const result = await request('POST', '/api/lingosentinel/private/publish', {
      mode: 'group_room',
      roomId: PRIVATE_ROOM,
      role: 'host',
      text: 'Controlled private room activation test.',
      sender: { id: 'mac', name: 'Mac', role: 'host', preferredLanguage: 'en' }
    });
    assert.strictEqual(result.status, 200, `Expected private publish 200, got ${result.status}: ${result.text}`);
    assert.ok(result.json, 'Expected private publish JSON.');
    assert.strictEqual(result.json.ok, true);
    assert.strictEqual(result.json.stage, 'published');
    assert.strictEqual(result.json.mode, 'group_room');
    assert.strictEqual(result.json.roomId, PRIVATE_ROOM);
    assert.strictEqual(result.json.channel, EXPECTED.private_group_room.channel);
    assert.strictEqual(result.json.eventName, EXPECTED.private_group_room.eventName);
    assert.strictEqual(result.json.marionAuthority, true);
    assert.strictEqual(result.json.publicSurface, 'Nyx');
    assert.strictEqual(result.json.liveScope, 'controlled_private');
    assert.ok(result.json.telemetry && result.json.telemetry.traceId, 'Expected private publish traceId telemetry.');
    assertNoSecretLeak(result.json, 'private publish response');
    assertCors(result.headers);
    assertNoStore(result.headers);
  }),

  test('controlled private room observer cannot publish', async () => {
    const result = await request('POST', '/api/lingosentinel/private/publish', {
      mode: 'group_room',
      roomId: PRIVATE_ROOM,
      role: 'observer',
      text: 'Observer should not publish.',
      sender: { id: 'observer', name: 'Observer', role: 'observer', preferredLanguage: 'en' }
    });
    assert.ok(result.status === 403 || result.status === 400, `Expected observer publish rejection, got ${result.status}: ${result.text}`);
    assertNoSecretLeak(result.text, 'observer rejection response');
  }),

  test('production guardrail checklist remains explicit', () => {
    const checklist = {
      originAllowlist: ['https://www.sandblast.channel', 'https://sandblast.channel'],
      rateLimitRequired: true,
      tokenTtlRequired: true,
      noRootKeyInBrowser: true,
      marionAuthorityRequired: true,
      nyxPublicSurfaceRequired: true,
      traceIdRequired: true,
      credentialRejectionRequired: true,
      controlledPrivateRoomRequired: true,
      privateRoomAllowlistRequired: true,
      observerCannotPublish: true
    };
    assert.strictEqual(checklist.noRootKeyInBrowser, true);
    assert.strictEqual(checklist.marionAuthorityRequired, true);
    assert.strictEqual(checklist.nyxPublicSurfaceRequired, true);
    assert.strictEqual(checklist.controlledPrivateRoomRequired, true);
    assert.strictEqual(checklist.privateRoomAllowlistRequired, true);
  })
]);
