'use strict';

/**
 * LingoSentinelSubscribeTokenRoute
 * ------------------------------------------------------------
 * Backend-only Ably token issuer for public LingoSentinel clients.
 * Token validation and capability authority live in LingoSentinelTokenPolicy.
 */

const express = require('express');
const TokenPolicy = require('./LingoSentinelTokenPolicy');
const RoomRegistry = require('./LingoSentinelRoomRegistry');

const router = express.Router();
const ROUTE_VERSION = 'nyx.lingosentinel.subscribeTokenRoute/3.0-room-membership-authority';
const PHASE2B_USER_BOUNDARY_VERSION = 'nyx.lingosentinel.userBoundarySilentOversight/2.0';
const PHASE2D_CHANNEL_NAMESPACE_VERSION = 'nyx.lingosentinel.channelNamespaceRoundtrip/2.0';
const PHASE2E_LIVE_ROUNDTRIP_VERSION = 'nyx.lingosentinel.subscribeTokenRoute.liveAblyRoundtrip/2.0';

function safeString(value, fallback = '') {
  return TokenPolicy.safeString(value, fallback);
}

function nowIso() {
  return new Date().toISOString();
}

function hardenNoStore(res) {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  } catch (_) {}
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
  const channelAlignment = TokenPolicy.buildChannelAlignment(mode, roomId);
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

function ablyPackageAvailable() {
  try {
    require.resolve('ably');
    return true;
  } catch (_) {
    return false;
  }
}

async function createTokenRequest(input = {}) {
  const key = getAblyKey();
  if (!key) {
    const error = new Error('Missing Ably API key. Set ABLY_ROOT_API_KEY in the backend runtime environment.');
    error.code = 'ABLY_KEY_MISSING';
    throw error;
  }

  const Ably = loadAblyPackage();
  const channel = TokenPolicy.channelForMode(input.mode, input.roomId);
  const capability = TokenPolicy.buildCapability(channel);
  const channelAlignment = TokenPolicy.buildChannelAlignment(input.mode, input.roomId);
  const RestCtor = Ably.Rest || (Ably.default && Ably.default.Rest);
  if (typeof RestCtor !== 'function') {
    const error = new Error('The installed Ably package does not expose Rest.');
    error.code = 'ABLY_PACKAGE_INCOMPATIBLE';
    throw error;
  }

  const rest = new RestCtor({ key });
  const tokenRequest = await rest.auth.createTokenRequest({
    clientId: input.clientId,
    ttl: input.ttl,
    capability: JSON.stringify(capability)
  });

  return { tokenRequest, channel, capability, channelAlignment };
}

function safeErrorResponse(error, stage = 'token_failed') {
  const code = safeString(error && error.code, 'LINGOSENTINEL_TOKEN_FAILED');
  const publicError =
    code === 'ABLY_KEY_MISSING' ? 'ably_not_configured' :
    code === 'ABLY_PACKAGE_MISSING' || code === 'ABLY_PACKAGE_INCOMPATIBLE' ? 'ably_unavailable' :
    code === 'LINGOSENTINEL_CAPABILITY_CHANNEL_INVALID' ? 'capability_rejected' :
    'token_request_failed';

  return {
    ok: false,
    stage,
    errors: [publicError],
    diagnosticsRedacted: true,
    boundary: phase2bBoundary(),
    telemetry: { failedAt: nowIso(), code }
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
    const sanitized = TokenPolicy.sanitizeTokenInput(req.body || {}, req.query || {});
    const validation = TokenPolicy.validateTokenInput(sanitized);

    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        stage: 'token_validation',
        errors: validation.errors,
        diagnosticsRedacted: true,
        boundary: phase2bBoundary(),
        policyVersion: TokenPolicy.POLICY_VERSION,
        telemetry: { requestedAt }
      });
    }

    const input = validation.normalized;
    let roomAuthorization = RoomRegistry.authorize(input.roomId, input, 'subscribe');
    if (!roomAuthorization.ok && input.autoJoin === true) {
      const joined = RoomRegistry.join(input.roomId, input, { invited: req.body && req.body.invited === true });
      if (joined.ok) roomAuthorization = RoomRegistry.authorize(input.roomId, input, 'subscribe');
    }
    if (!roomAuthorization.ok) {
      return res.status(403).json({
        ok: false,
        stage: 'token_room_authorization',
        errors: ['room_membership_required'],
        diagnosticsRedacted: true,
        policyVersion: TokenPolicy.POLICY_VERSION,
        boundary: phase2bBoundary(),
        telemetry: { requestedAt }
      });
    }
    const result = await createTokenRequest(input);
    const identity = TokenPolicy.buildIdentityEnvelope(input);

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
      channelNamespace: TokenPolicy.CHANNEL_NAMESPACE,
      phase2dChannelNamespaceVersion: PHASE2D_CHANNEL_NAMESPACE_VERSION,
      phase2eLiveRoundtripVersion: PHASE2E_LIVE_ROUNDTRIP_VERSION,
      mode: input.mode,
      roomId: input.roomId,
      clientId: input.clientId,
      identity,
      roomAuthorization: { ok: true, action: 'subscribe', roomId: input.roomId },
      identitySource: input.identitySource,
      ttlMs: input.ttl,
      policyVersion: TokenPolicy.POLICY_VERSION,
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
      error && (error.code === 'ABLY_KEY_MISSING' || error.code === 'ABLY_PACKAGE_MISSING' || error.code === 'ABLY_PACKAGE_INCOMPATIBLE')
        ? 500
        : 502;
    return res.status(status).json(safeErrorResponse(error));
  }
});

router.get('/token/health', (req, res) => {
  hardenNoStore(res);
  const ablyConfigured = !!getAblyKey();
  const packageReady = ablyPackageAvailable();
  const ready = ablyConfigured && packageReady;

  return res.status(200).json({
    ok: ready,
    service: 'LingoSentinelSubscribeTokenRoute',
    status: ready ? 'ready' : 'degraded',
    diagnosticsRedacted: true,
    routeMounted: true,
    ablyConfigured,
    ablyPackageReady: packageReady,
    channelNamespace: TokenPolicy.CHANNEL_NAMESPACE,
    phase2dChannelNamespaceVersion: PHASE2D_CHANNEL_NAMESPACE_VERSION,
    phase2eLiveRoundtripVersion: PHASE2E_LIVE_ROUNDTRIP_VERSION,
    version: ROUTE_VERSION,
    policy: TokenPolicy.getPolicyHealth(),
    roomRegistry: RoomRegistry.getHealth(),
    supportedModes: TokenPolicy.VALID_MODES,
    boundary: phase2bBoundary(),
    publicUsersMayAddressMarion: false,
    marionVisibleParticipant: false,
    marionCanAppearInUserRoster: false,
    marionPublicChannelAllowed: false,
    channelAlignment: TokenPolicy.buildChannelAlignment('group_room', TokenPolicy.DEFAULT_ROOM_ID),
    phase2eLiveRoundtrip: buildPhase2ETokenReadiness('group_room', TokenPolicy.DEFAULT_ROOM_ID),
    channelExamples: {
      one_to_one: TokenPolicy.channelForMode('one_to_one', TokenPolicy.DEFAULT_ROOM_ID),
      group_room: TokenPolicy.channelForMode('group_room', TokenPolicy.DEFAULT_ROOM_ID),
      live_translate: TokenPolicy.channelForMode('live_translate', TokenPolicy.DEFAULT_ROOM_ID),
      delivered: TokenPolicy.channelForMode('delivered', TokenPolicy.DEFAULT_ROOM_ID)
    },
    timestamp: nowIso()
  });
});

router.VERSION = ROUTE_VERSION;
router.POLICY_VERSION = TokenPolicy.POLICY_VERSION;
router.channelForMode = TokenPolicy.channelForMode;
router.buildCapability = TokenPolicy.buildCapability;
router.buildChannelAlignment = TokenPolicy.buildChannelAlignment;
router.buildPhase2ETokenReadiness = buildPhase2ETokenReadiness;
router.legacyChannelAliasesForMode = TokenPolicy.legacyChannelAliasesForMode;
router.sanitizeTokenInput = TokenPolicy.sanitizeTokenInput;
router.validateTokenInput = TokenPolicy.validateTokenInput;
router.phase2bBoundary = phase2bBoundary;
router.isReservedMarionIdentity = TokenPolicy.isReservedIdentity;
router.createTokenRequest = createTokenRequest;
module.exports = router;
