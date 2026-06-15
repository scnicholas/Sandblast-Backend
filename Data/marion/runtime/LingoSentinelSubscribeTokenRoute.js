'use strict';

/**
 * LingoSentinelSubscribeTokenRoute
 *
 * Backend-safe Ably token route for LingoSentinel subscribers.
 *
 * Purpose:
 * - Keep ABLY_ROOT_API_KEY backend-only.
 * - Give widget/client a short-lived Ably token request.
 * - Restrict access to expected LingoSentinel channels.
 * - Support 1:1 Chat, Group Room, Live Translate, and Delivered lanes.
 *
 * Mount example in root index.js:
 *
 * const LingoSentinelSubscribeTokenRoute = require('./Data/marion/runtime/LingoSentinelSubscribeTokenRoute');
 * app.use('/api/lingosentinel', LingoSentinelSubscribeTokenRoute);
 *
 * Endpoint:
 * POST /api/lingosentinel/token
 */

const express = require('express');

const router = express.Router();

const DEFAULT_CLIENT_ID = 'lingosentinel-widget';
const DEFAULT_ROOM_ID = 'lingosentinel-main';
const CHANNEL_NAMESPACE = 'lingosentinel';
const ROUTE_VERSION = 'nyx.lingosentinel.subscribeTokenRoute/1.4-phase2e-live-ably-roundtrip';
const DEFAULT_TTL_MS = 1000 * 60 * 30; // 30 minutes
const PHASE2B_USER_BOUNDARY_VERSION = 'nyx.lingosentinel.userBoundarySilentOversight/2.0';
const PHASE2D_CHANNEL_NAMESPACE_VERSION = 'nyx.lingosentinel.channelNamespaceRoundtrip/2.0';
const PHASE2E_LIVE_ROUNDTRIP_VERSION = 'nyx.lingosentinel.subscribeTokenRoute.liveAblyRoundtrip/2.0';

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

  group: 'group_room',
  group_room: 'group_room',
  groupRoom: 'group_room',
  room: 'group_room',

  live: 'live_translate',
  live_translate: 'live_translate',
  liveTranslate: 'live_translate',
  translate: 'live_translate',
  translation: 'live_translate',

  delivered: 'delivered',
  delivery: 'delivered',
  receipt: 'delivered'
});


function normalizeBoundaryText(value) {
  return safeString(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isReservedMarionIdentity(value) {
  const text = normalizeBoundaryText(value);
  return !!text && (/^(?:marion|marion ai|marion authority|marion admin|marion overseer|marion system)$/.test(text) || /\bmarion\b/.test(text));
}

function phase2bBoundary() {
  return {
    version: PHASE2B_USER_BOUNDARY_VERSION,
    userToUserBoundary: true,
    silentOversight: true,
    advisoryOnly: true,
    finalAuthority: 'Marion',
    publicFacingAgent: 'LingoSentinel/Nyx',
    publicUsersMayAddressMarion: false,
    publicUsersSpeakThrough: 'LingoSentinel/Nyx',
    marionVisibleParticipant: false,
    marionRenderedAsSpeaker: false,
    marionCanPublishToRoom: false,
    marionCanAppearInUserRoster: false,
    marionPublicChannelAllowed: false,
    visibleToUsers: false
  };
}


function buildPhase2ETokenReadiness(mode, roomId) {
  const channelAlignment = buildChannelAlignment(mode, roomId);
  return {
    ...phase2bBoundary(),
    version: PHASE2E_LIVE_ROUNDTRIP_VERSION,
    tokenCreated: false,
    canonicalChannel: channelAlignment.canonicalChannel,
    clientSubscribeReady: true,
    clientSubscribed: false,
    publishOk: false,
    messageReceivedByClient: false,
    receivedEventType: channelAlignment.mode === 'live_translate' ? 'TRANSLATION_MESSAGE_READY' : '',
    channelNamespaceAligned: true,
    tokenChannelMatchesPublishChannel: true,
    realtimeBridgeChannelMatchesToken: true,
    roundtripReady: true
  };
}

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function hardenNoStore(res) {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } catch (_) {}
}

function normalizeMode(mode) {
  const raw = safeString(mode || 'one_to_one');
  return MODE_ALIASES[raw] || 'one_to_one';
}

function sanitizeChannelPart(value, fallback = DEFAULT_ROOM_ID) {
  const clean = safeString(value || fallback)
    .replace(/[^a-zA-Z0-9:_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);

  return clean || fallback;
}

function getAblyKey() {
  return safeString(process.env.ABLY_ROOT_API_KEY || process.env.ABLY_API_KEY);
}

function loadAblyPackage() {
  try {
    return require('ably');
  } catch (error) {
    const missing = new Error('Ably package is not installed. Run: npm install ably');
    missing.code = 'ABLY_PACKAGE_MISSING';
    missing.cause = error;
    throw missing;
  }
}

function channelForMode(mode, roomId) {
  const cleanRoomId = sanitizeChannelPart(roomId);

  if (mode === 'one_to_one') return `${CHANNEL_NAMESPACE}:direct:${cleanRoomId}`;
  if (mode === 'live_translate') return `${CHANNEL_NAMESPACE}:translation:${cleanRoomId}`;
  if (mode === 'delivered') return `${CHANNEL_NAMESPACE}:delivered:${cleanRoomId}`;

  return `${CHANNEL_NAMESPACE}:room:${cleanRoomId}`;
}

function legacyChannelAliasesForMode(mode, roomId) {
  const cleanRoomId = sanitizeChannelPart(roomId);
  const normalizedMode = normalizeMode(mode);
  if (normalizedMode === 'one_to_one') return [`ls:direct:${cleanRoomId}`];
  if (normalizedMode === 'live_translate') return [`ls:live:${cleanRoomId}`, `ls:translation:${cleanRoomId}`];
  if (normalizedMode === 'delivered') return [`ls:receipt:${cleanRoomId}`, `ls:delivered:${cleanRoomId}`];
  return [`ls:room:${cleanRoomId}`];
}

function buildChannelAlignment(mode, roomId) {
  const normalizedMode = normalizeMode(mode);
  const canonicalChannel = channelForMode(normalizedMode, roomId);
  return {
    version: PHASE2D_CHANNEL_NAMESPACE_VERSION,
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
    canonicalOnlyForNewTraffic: true,
    roundtripReady: true,
    silentOversight: true,
    userToUserBoundary: true,
    marionVisibleParticipant: false,
    publicUsersMayAddressMarion: false
  };
}

function buildCapability(channel) {
  return {
    [channel]: ['subscribe', 'presence'],
    [`${channel}:receipt`]: ['publish', 'subscribe'],
    [`${channel}:client`]: ['publish', 'subscribe'],
    [`${CHANNEL_NAMESPACE}:presence`]: ['subscribe', 'presence'],
    [`${CHANNEL_NAMESPACE}:telemetry`]: ['publish']
  };
}

function sanitizeTokenInput(body = {}, query = {}) {
  const mode = normalizeMode(body.mode || query.mode);
  const roomId = sanitizeChannelPart(
    body.roomId || body.channelId || body.conversationId || query.roomId
  );

  const clientId = sanitizeChannelPart(
    body.clientId ||
      body.userId ||
      body.senderId ||
      query.clientId ||
      DEFAULT_CLIENT_ID,
    DEFAULT_CLIENT_ID
  );

  const ttl =
    Number(body.ttlMs || query.ttlMs) > 0
      ? Math.min(Number(body.ttlMs || query.ttlMs), DEFAULT_TTL_MS)
      : DEFAULT_TTL_MS;

  return {
    mode,
    roomId,
    clientId,
    ttl
  };
}

function validateTokenInput(input = {}) {
  const errors = [];

  if (!VALID_MODES.includes(input.mode)) {
    errors.push(`Invalid LingoSentinel mode: ${input.mode}.`);
  }

  if (!input.roomId) {
    errors.push('roomId is required.');
  }

  if (!input.clientId) {
    errors.push('clientId is required.');
  }

  if (isReservedMarionIdentity(input.clientId) || isReservedMarionIdentity(input.roomId)) {
    errors.push('Public LingoSentinel tokens cannot be minted for Marion identities, Marion rooms, Marion clients, or Marion-visible channels.');
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

async function createTokenRequest(input = {}) {
  const key = getAblyKey();

  if (!key) {
    const error = new Error(
      'Missing Ably API key. Set ABLY_ROOT_API_KEY in the backend/runtime environment.'
    );
    error.code = 'ABLY_KEY_MISSING';
    throw error;
  }

  const Ably = loadAblyPackage();
  const rest = new Ably.Rest({ key });

  const channel = channelForMode(input.mode, input.roomId);
  const capability = buildCapability(channel);
  const channelAlignment = buildChannelAlignment(input.mode, input.roomId);

  const tokenRequest = await rest.auth.createTokenRequest({
    clientId: input.clientId,
    ttl: input.ttl,
    capability: JSON.stringify(capability)
  });

  return {
    tokenRequest,
    channel,
    capability,
    channelAlignment
  };
}

function safeErrorResponse(error, stage = 'token_failed') {
  const code = error?.code || 'LINGOSENTINEL_TOKEN_FAILED';
  const publicError =
    code === 'ABLY_KEY_MISSING' ? 'ably_not_configured' :
    code === 'ABLY_PACKAGE_MISSING' ? 'ably_unavailable' :
    'token_request_failed';
  return {
    ok: false,
    stage,
    errors: [publicError],
    diagnosticsRedacted: true,
    boundary: phase2bBoundary(),
    telemetry: {
      failedAt: nowIso(),
      code
    }
  };
}

router.options('/token', (req, res) => {
  hardenNoStore(res);
  return res.status(204).end();
});

router.post('/token', async (req, res) => {
  hardenNoStore(res);
  const requestedAt = nowIso();

  try {
    const input = sanitizeTokenInput(req.body || {}, req.query || {});
    const validation = validateTokenInput(input);

    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        stage: 'token_validation',
        errors: validation.errors,
        boundary: phase2bBoundary(),
        telemetry: {
          requestedAt
        }
      });
    }

    const result = await createTokenRequest(input);

    return res.status(200).json({
      ok: true,
      stage: 'token_created',
      tokenRequest: result.tokenRequest,
      channel: result.channel,
      canonicalChannel: result.channel,
      channelAlignment: result.channelAlignment,
      channelNamespaceAligned: true,
      tokenChannelMatchesPublishChannel: true,
      realtimeBridgeChannelMatchesToken: true,
      roundtripReady: true,
      phase2eLiveRoundtrip: { ...buildPhase2ETokenReadiness(input.mode, input.roomId), tokenCreated: true },
      clientSubscribeReady: true,
      capability: result.capability,
      channelNamespace: CHANNEL_NAMESPACE,
      phase2dChannelNamespaceVersion: PHASE2D_CHANNEL_NAMESPACE_VERSION,
      phase2eLiveRoundtripVersion: PHASE2E_LIVE_ROUNDTRIP_VERSION,
      mode: input.mode,
      roomId: input.roomId,
      clientId: input.clientId,
      ttlMs: input.ttl,
      boundary: phase2bBoundary(),
      telemetry: {
        requestedAt,
        issuedAt: nowIso(),
        route: 'LingoSentinelSubscribeTokenRoute',
        routeVersion: ROUTE_VERSION
      }
    });
  } catch (error) {
    const status =
      error?.code === 'ABLY_KEY_MISSING' || error?.code === 'ABLY_PACKAGE_MISSING'
        ? 500
        : 502;

    return res.status(status).json(safeErrorResponse(error));
  }
});

router.get('/token/health', (req, res) => {
  hardenNoStore(res);
  res.json({
    ok: true,
    service: 'LingoSentinelSubscribeTokenRoute',
    status: 'ready',
    diagnosticsRedacted: true,
    routeMounted: true,
    channelNamespace: CHANNEL_NAMESPACE,
      phase2dChannelNamespaceVersion: PHASE2D_CHANNEL_NAMESPACE_VERSION,
      phase2eLiveRoundtripVersion: PHASE2E_LIVE_ROUNDTRIP_VERSION,
    version: ROUTE_VERSION,
    supportedModes: VALID_MODES,
    boundary: phase2bBoundary(),
    publicUsersMayAddressMarion: false,
    marionVisibleParticipant: false,
    marionCanAppearInUserRoster: false,
    marionPublicChannelAllowed: false,
    channelAlignment: buildChannelAlignment('live_translate', DEFAULT_ROOM_ID),
    phase2eLiveRoundtrip: buildPhase2ETokenReadiness('live_translate', DEFAULT_ROOM_ID),
    channelExamples: {
      one_to_one: channelForMode('one_to_one', DEFAULT_ROOM_ID),
      group_room: channelForMode('group_room', DEFAULT_ROOM_ID),
      live_translate: channelForMode('live_translate', DEFAULT_ROOM_ID),
      delivered: channelForMode('delivered', DEFAULT_ROOM_ID)
    },
    timestamp: nowIso()
  });
});

router.VERSION = ROUTE_VERSION;
router.channelForMode = channelForMode;
router.buildCapability = buildCapability;
router.buildChannelAlignment = buildChannelAlignment;
router.buildPhase2ETokenReadiness = buildPhase2ETokenReadiness;
router.legacyChannelAliasesForMode = legacyChannelAliasesForMode;
router.sanitizeTokenInput = sanitizeTokenInput;
router.phase2bBoundary = phase2bBoundary;
router.isReservedMarionIdentity = isReservedMarionIdentity;
module.exports = router;
