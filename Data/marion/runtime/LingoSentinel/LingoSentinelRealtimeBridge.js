'use strict';

/**
 * LingoSentinelRealtimeBridge
 * ------------------------------------------------------------
 * Backend-only Layer 4 Ably boundary.
 * Gateway prepares governed publish instructions; this bridge performs provider I/O.
 */

const TokenPolicy = require('./LingoSentinelTokenPolicy');
const RoomRegistry = require('./LingoSentinelRoomRegistry');

const VERSION = 'nyx.lingosentinel.realtimeBridge/4.0-provider-boundary';
let restClient = null;

function safeString(value, fallback = '') { return TokenPolicy.safeString(value, fallback); }
function getAblyKey() { return safeString(process.env.ABLY_ROOT_API_KEY || process.env.ABLY_API_KEY); }
function loadAbly() {
  try { return require('ably'); }
  catch (error) { const err = new Error('Ably package is unavailable.'); err.code = 'ABLY_PACKAGE_MISSING'; err.cause = error; throw err; }
}
function packageReady() { try { require.resolve('ably'); return true; } catch (_) { return false; } }
function getRestClient() {
  if (restClient) return restClient;
  const key = getAblyKey();
  if (!key) { const err = new Error('Ably key is unavailable.'); err.code = 'ABLY_KEY_MISSING'; throw err; }
  const Ably = loadAbly();
  const Rest = Ably.Rest || (Ably.default && Ably.default.Rest);
  if (typeof Rest !== 'function') { const err = new Error('Ably Rest constructor is unavailable.'); err.code = 'ABLY_PACKAGE_INCOMPATIBLE'; throw err; }
  restClient = new Rest({ key });
  return restClient;
}
function sanitizeEventName(value) {
  const name = safeString(value || 'LINGOSENTINEL_EVENT').replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 96);
  return name || 'LINGOSENTINEL_EVENT';
}
function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { value: safeString(payload).slice(0, 4000) };
  const blocked = /token|secret|password|authorization|cookie|api[_-]?key|private/i;
  const clean = {};
  Object.keys(payload).slice(0, 32).forEach((key) => {
    if (blocked.test(key)) return;
    const value = payload[key];
    if (typeof value === 'string') clean[key] = value.slice(0, 4000);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) clean[key] = value;
  });
  return clean;
}
async function publish(input = {}) {
  const roomId = TokenPolicy.sanitizeRoomId(input.roomId);
  const clientId = TokenPolicy.sanitizeClientId(input.clientId);
  const sessionId = TokenPolicy.sanitizeIdentifier(input.sessionId, '', 96);
  const mode = TokenPolicy.normalizeMode(input.mode, TokenPolicy.DEFAULT_MODE);
  const authorization = RoomRegistry.authorize(roomId, { clientId, sessionId }, 'publish');
  if (!authorization.ok) {
    const error = new Error('Active room membership is required to publish.');
    error.code = 'ROOM_MEMBERSHIP_REQUIRED';
    throw error;
  }
  const channelName = TokenPolicy.channelForMode(mode, roomId);
  const client = getRestClient();
  const channel = client.channels.get(channelName);
  const eventName = sanitizeEventName(input.eventName || input.name);
  const payload = sanitizePayload(input.payload || input.data || {});
  await channel.publish(eventName, payload);
  return { ok: true, channel: channelName, eventName, roomId, mode, publishedAt: new Date().toISOString(), diagnosticsRedacted: true };
}
function close() {
  try { if (restClient && typeof restClient.close === 'function') restClient.close(); } catch (_) {}
  restClient = null;
  return true;
}
function getHealth() {
  const configured = !!getAblyKey();
  const sdkReady = packageReady();
  return { ok: configured && sdkReady, service: 'LingoSentinelRealtimeBridge', version: VERSION, status: configured && sdkReady ? 'ready' : 'degraded', ablyConfigured: configured, ablyPackageReady: sdkReady, rootKeyExposed: false, membershipRequiredForPublish: true, canonicalNamespace: TokenPolicy.CHANNEL_NAMESPACE };
}
module.exports = Object.freeze({ VERSION, getAblyKey, packageReady, sanitizeEventName, sanitizePayload, publish, close, getHealth });
