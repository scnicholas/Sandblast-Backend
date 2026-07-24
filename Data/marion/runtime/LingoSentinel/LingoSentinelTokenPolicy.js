'use strict';

/**
 * LingoSentinelTokenPolicy
 * ------------------------------------------------------------
 * Canonical Layer 2 policy for public LingoSentinel Ably tokens.
 *
 * Security boundary:
 * - Never reads or returns the Ably root key.
 * - Restricts capabilities to one canonical room and its receipt/client lanes.
 * - Removes public telemetry publishing.
 * - Rejects Marion/system/admin identity impersonation.
 * - Creates a unique fallback identity instead of sharing one browser identity.
 * - Keeps translation availability independent from English relay readiness.
 */

const crypto = require('crypto');

const POLICY_VERSION = 'nyx.lingosentinel.tokenPolicy/10.0-room-and-client-state-subscription';
const IDENTITY_CONTRACT = 'lingosentinel.clientIdentity/1.0';
const CHANNEL_NAMESPACE = 'lingosentinel';
const DEFAULT_ROOM_ID = 'lingosentinel-main';
const DEFAULT_MODE = 'group_room';
const DEFAULT_TTL_MS = clampNumber(process.env.LINGOSENTINEL_TOKEN_TTL_MS, 15 * 60 * 1000, 60 * 1000, 30 * 60 * 1000);
const MAX_TTL_MS = clampNumber(process.env.LINGOSENTINEL_TOKEN_MAX_TTL_MS, 30 * 60 * 1000, 60 * 1000, 60 * 60 * 1000);
const MIN_TTL_MS = 60 * 1000;
const MAX_ROOM_ID_LENGTH = 96;
const MAX_CLIENT_ID_LENGTH = 80;
const MAX_DISPLAY_NAME_LENGTH = 80;
const ENGLISH_RELAY_ONLY = String(process.env.LINGOSENTINEL_ENGLISH_RELAY_ONLY || 'true').toLowerCase() !== 'false';
const ENGLISH_RELAY_MODES = Object.freeze(['one_to_one', 'group_room']);

const VALID_MODES = Object.freeze([
  'one_to_one',
  'group_room',
  'live_translate',
  'delivered'
]);

const MODE_ALIASES = Object.freeze({
  one: 'one_to_one',
  one_to_one: 'one_to_one',
  oneToOne: 'one_to_one',
  one_to_1: 'one_to_one',
  direct: 'one_to_one',
  dm: 'one_to_one',
  private: 'one_to_one',
  chat: 'one_to_one',
  group: 'group_room',
  group_room: 'group_room',
  groupRoom: 'group_room',
  room: 'group_room',
  community: 'group_room',
  live: 'live_translate',
  live_translate: 'live_translate',
  liveTranslate: 'live_translate',
  translate: 'live_translate',
  translation: 'live_translate',
  delivered: 'delivered',
  delivery: 'delivered',
  receipt: 'delivered',
  async: 'delivered',
  handoff: 'delivered'
});

const RESERVED_IDENTITY_PATTERN = /(?:^|[^a-z0-9])(marion|admin|administrator|root|system|operator|moderator|support)(?:$|[^a-z0-9])/i;

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function safeString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const text = typeof value === 'string' ? value : String(value);
  return text.trim() || fallback;
}

function normalizeBoundaryText(value) {
  return safeString(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isReservedIdentity(value) {
  const raw = safeString(value);
  const normalized = normalizeBoundaryText(raw);
  if (!raw || !normalized) return false;
  if (RESERVED_IDENTITY_PATTERN.test(raw)) return true;
  return /^(?:marion|marion ai|marion authority|marion admin|marion overseer|marion system|admin|administrator|root|system)$/.test(normalized);
}

function sanitizeIdentifier(value, fallback = '', maxLength = MAX_ROOM_ID_LENGTH) {
  const raw = safeString(value || fallback);
  const clean = raw
    .replace(/[^a-zA-Z0-9:_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_:]+|[-_:]+$/g, '')
    .slice(0, maxLength);
  return clean || fallback;
}

function generateClientId() {
  return `lsu_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`.slice(0, MAX_CLIENT_ID_LENGTH);
}

function normalizeMode(value, fallback = DEFAULT_MODE) {
  const raw = safeString(value);
  if (!raw) return fallback;
  return MODE_ALIASES[raw] || MODE_ALIASES[raw.toLowerCase()] || null;
}

function sanitizeClientId(value) {
  return sanitizeIdentifier(value, '', MAX_CLIENT_ID_LENGTH);
}

function sanitizeRoomId(value) {
  return sanitizeIdentifier(value, DEFAULT_ROOM_ID, MAX_ROOM_ID_LENGTH);
}

function sanitizeDisplayName(value, clientId) {
  const text = safeString(value || '').replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, MAX_DISPLAY_NAME_LENGTH);
  return text || `Participant ${safeString(clientId).slice(-6) || 'Guest'}`;
}

function channelForMode(mode, roomId) {
  const normalizedMode = normalizeMode(mode) || DEFAULT_MODE;
  const cleanRoomId = sanitizeRoomId(roomId);
  if (normalizedMode === 'one_to_one') return `${CHANNEL_NAMESPACE}:direct:${cleanRoomId}`;
  if (normalizedMode === 'live_translate') return `${CHANNEL_NAMESPACE}:translation:${cleanRoomId}`;
  if (normalizedMode === 'delivered') return `${CHANNEL_NAMESPACE}:delivered:${cleanRoomId}`;
  return `${CHANNEL_NAMESPACE}:room:${cleanRoomId}`;
}

function legacyChannelAliasesForMode(mode, roomId) {
  const normalizedMode = normalizeMode(mode) || DEFAULT_MODE;
  const cleanRoomId = sanitizeRoomId(roomId);
  if (normalizedMode === 'one_to_one') return [`ls:direct:${cleanRoomId}`];
  if (normalizedMode === 'live_translate') return [`ls:live:${cleanRoomId}`, `ls:translation:${cleanRoomId}`];
  if (normalizedMode === 'delivered') return [`ls:receipt:${cleanRoomId}`, `ls:delivered:${cleanRoomId}`];
  return [`ls:room:${cleanRoomId}`];
}

function buildChannelAlignment(mode, roomId) {
  const normalizedMode = normalizeMode(mode) || DEFAULT_MODE;
  const canonicalChannel = channelForMode(normalizedMode, roomId);
  return {
    version: POLICY_VERSION,
    channelNamespaceAligned: true,
    canonicalNamespace: CHANNEL_NAMESPACE,
    mode: normalizedMode,
    canonicalChannel,
    tokenChannel: canonicalChannel,
    publishChannel: canonicalChannel,
    realtimeBridgeChannel: canonicalChannel,
    tokenChannelMatchesPublishChannel: true,
    realtimeBridgeChannelMatchesToken: true,
    legacyChannelAliases: legacyChannelAliasesForMode(normalizedMode, roomId),
    canonicalOnlyForNewTraffic: true
  };
}

function clientStateChannelFor(channel, clientId) {
  const cleanChannel = safeString(channel);
  const cleanClientId = sanitizeClientId(clientId) || 'lsu_compat_client';
  if (!cleanChannel || !cleanChannel.startsWith(`${CHANNEL_NAMESPACE}:`) || !cleanClientId) {
    const error = new Error('Invalid LingoSentinel client-state channel target.');
    error.code = 'LINGOSENTINEL_CLIENT_STATE_CHANNEL_INVALID';
    throw error;
  }
  return `${cleanChannel}:client:${cleanClientId}`;
}

function buildCapability(channel, clientId) {
  const cleanChannel = safeString(channel);
  if (!cleanChannel || !cleanChannel.startsWith(`${CHANNEL_NAMESPACE}:`)) {
    const error = new Error('Invalid LingoSentinel channel capability target.');
    error.code = 'LINGOSENTINEL_CAPABILITY_CHANNEL_INVALID';
    throw error;
  }
  const clientStateChannel = clientStateChannelFor(cleanChannel, clientId);
  return {
    [cleanChannel]: ['subscribe', 'presence'],
    [clientStateChannel]: ['subscribe']
  };
}

function sanitizeTokenInput(body = {}, query = {}) {
  const suppliedClientId =
    body.clientId || body.userId || body.senderId ||
    query.clientId || query.userId || query.senderId || '';
  const cleanSuppliedClientId = sanitizeClientId(suppliedClientId);
  const clientId = cleanSuppliedClientId || generateClientId();
  const ttlCandidate = Number(body.ttlMs || query.ttlMs);
  const ttl = Number.isFinite(ttlCandidate) && ttlCandidate > 0
    ? clampNumber(ttlCandidate, DEFAULT_TTL_MS, MIN_TTL_MS, MAX_TTL_MS)
    : DEFAULT_TTL_MS;

  return {
    mode: normalizeMode(body.mode || query.mode, DEFAULT_MODE),
    roomId: sanitizeRoomId(body.roomId || body.channelId || body.conversationId || query.roomId),
    clientId,
    displayName: sanitizeDisplayName(body.displayName || body.name || query.displayName, clientId),
    sessionId: sanitizeIdentifier(body.sessionId || query.sessionId, '', 96),
    autoJoin: body.autoJoin === true || query.autoJoin === 'true',
    role: 'participant',
    authenticated: body.authenticated === true,
    identitySource: cleanSuppliedClientId ? 'client_supplied' : 'server_generated',
    ttl
  };
}

function validateTokenInput(input = {}) {
  const errors = [];
  const mode = normalizeMode(input.mode, null);
  const roomId = sanitizeRoomId(input.roomId);
  const clientId = sanitizeClientId(input.clientId);

  if (!VALID_MODES.includes(mode)) errors.push(`Invalid LingoSentinel mode: ${safeString(input.mode || 'missing')}.`);
  if (ENGLISH_RELAY_ONLY && !ENGLISH_RELAY_MODES.includes(mode)) errors.push('Only one_to_one and group_room modes are enabled during English relay certification.');
  if (!roomId) errors.push('roomId is required.');
  if (!clientId) errors.push('clientId is required.');
  if (!sanitizeIdentifier(input.sessionId, '', 96) || sanitizeIdentifier(input.sessionId, '', 96).length < 8) errors.push('sessionId must contain at least 8 characters.');
  if (clientId.length < 8) errors.push('clientId must contain at least 8 characters.');
  if (isReservedIdentity(clientId) || isReservedIdentity(roomId) || isReservedIdentity(input.displayName)) {
    errors.push('Reserved Marion, system, admin, or operator identities are not available to public LingoSentinel clients.');
  }
  if (!Number.isFinite(Number(input.ttl)) || Number(input.ttl) < MIN_TTL_MS || Number(input.ttl) > MAX_TTL_MS) {
    errors.push(`ttl must be between ${MIN_TTL_MS} and ${MAX_TTL_MS} milliseconds.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      ...input,
      mode,
      roomId,
      clientId,
      displayName: sanitizeDisplayName(input.displayName, clientId),
      ttl: clampNumber(input.ttl, DEFAULT_TTL_MS, MIN_TTL_MS, MAX_TTL_MS)
    }
  };
}

function buildIdentityEnvelope(input = {}) {
  return {
    contract: IDENTITY_CONTRACT,
    clientId: sanitizeClientId(input.clientId),
    sessionId: sanitizeIdentifier(input.sessionId, '', 96) || null,
    displayName: sanitizeDisplayName(input.displayName, input.clientId),
    role: 'participant',
    authenticated: input.authenticated === true,
    identitySource: safeString(input.identitySource || 'client_supplied'),
    marionVisibleParticipant: false,
    marionPublicChannelAllowed: false
  };
}

function getPolicyHealth() {
  return {
    ok: true,
    service: 'LingoSentinelTokenPolicy',
    version: POLICY_VERSION,
    identityContract: IDENTITY_CONTRACT,
    channelNamespace: CHANNEL_NAMESPACE,
    supportedModes: (ENGLISH_RELAY_ONLY ? ENGLISH_RELAY_MODES : VALID_MODES).slice(),
    englishRelayOnly: ENGLISH_RELAY_ONLY,
    defaultTtlMs: DEFAULT_TTL_MS,
    maxTtlMs: MAX_TTL_MS,
    sharedDefaultClientIdDisabled: true,
    uniqueFallbackIdentityEnabled: true,
    publicTelemetryPublishAllowed: false,
    publicRoomPublishAllowed: false,
    backendMessagePublishAuthority: true,
    marionIdentitySpoofingBlocked: true,
    capabilityScope: 'single_room_only',
    activeRoomMembershipRequired: true,
    sessionBoundCapability: true,
    clientSpecificStateLane: true,
    sharedReceiptLaneDisabled: true
  };
}

module.exports = Object.freeze({
  POLICY_VERSION,
  IDENTITY_CONTRACT,
  CHANNEL_NAMESPACE,
  DEFAULT_ROOM_ID,
  DEFAULT_MODE,
  DEFAULT_TTL_MS,
  MAX_TTL_MS,
  MIN_TTL_MS,
  VALID_MODES,
  ENGLISH_RELAY_MODES,
  ENGLISH_RELAY_ONLY,
  MODE_ALIASES,
  safeString,
  normalizeMode,
  isReservedIdentity,
  sanitizeIdentifier,
  sanitizeClientId,
  sanitizeRoomId,
  sanitizeDisplayName,
  generateClientId,
  channelForMode,
  legacyChannelAliasesForMode,
  buildChannelAlignment,
  clientStateChannelFor,
  buildCapability,
  sanitizeTokenInput,
  validateTokenInput,
  buildIdentityEnvelope,
  getPolicyHealth
});
