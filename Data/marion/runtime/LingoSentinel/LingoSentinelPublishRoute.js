'use strict';

/**
 * LingoSentinelPublishRoute
 *
 * Backend-safe Express route for publishing LingoSentinel messages.
 *
 * Purpose:
 * - Accept widget/API message requests.
 * - Keep Ably root API key out of the frontend.
 * - Pass traffic through LingoSentinelLinkGateway before publishing.
 * - Return safe telemetry to the widget.
 *
 * Mount example:
 * const route = require('./Data/marion/runtime/LingoSentinelPublishRoute');
 * app.use('/api/lingosentinel', route);
 *
 * Endpoint:
 * POST /api/lingosentinel/publish
 */

const express = require('express');
const crypto = require('crypto');
const LingoSentinelLinkGateway = require('./LingoSentinelLinkGateway');
const LingoSentinelEngine = (() => {
  try {
    return require('./LingoSentinel/LingoSentinelEngine');
  } catch (_) {
    return null;
  }
})();

const router = express.Router();

const DEFAULT_LIMIT_BYTES = 8000;
const ROUTE_VERSION = 'nyx.lingosentinel.publishRoute/1.4-phase2e-live-ably-roundtrip';
const PHASE2B_USER_BOUNDARY_VERSION = 'nyx.lingosentinel.userBoundarySilentOversight/2.0';
const PHASE2D_CHANNEL_NAMESPACE_VERSION = 'nyx.lingosentinel.channelNamespaceRoundtrip/2.0';
const PHASE2E_LIVE_ROUNDTRIP_VERSION = 'nyx.lingosentinel.liveAblyRoundtrip/2.0';
const CHANNEL_NAMESPACE = 'lingosentinel';

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}


function normalizeBoundaryText(value) {
  return safeString(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isReservedMarionIdentity(value) {
  const text = normalizeBoundaryText(value);
  return !!text && (/^(?:marion|marion ai|marion authority|marion admin|marion overseer|marion system)$/.test(text) || /\bmarion\b/.test(text));
}

function participantSpoofsMarion(value) {
  if (!value || typeof value !== 'object') return false;
  return isReservedMarionIdentity(value.id) ||
    isReservedMarionIdentity(value.userId) ||
    isReservedMarionIdentity(value.clientId) ||
    isReservedMarionIdentity(value.name) ||
    isReservedMarionIdentity(value.displayName) ||
    isReservedMarionIdentity(value.handle) ||
    isReservedMarionIdentity(value.role) ||
    isReservedMarionIdentity(value.publicAgent) ||
    isReservedMarionIdentity(value.visibleAgent) ||
    isReservedMarionIdentity(value.speaker) ||
    isReservedMarionIdentity(value.speakerName);
}

function hasPublicMarionSpoof(body = {}, input = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const i = input && typeof input === 'object' ? input : {};
  return participantSpoofsMarion(b.sender) || participantSpoofsMarion(b.from) ||
    participantSpoofsMarion(b.recipient) || participantSpoofsMarion(b.to) ||
    participantSpoofsMarion(i.sender) || participantSpoofsMarion(i.recipient) ||
    isReservedMarionIdentity(b.senderId) || isReservedMarionIdentity(b.userId) ||
    isReservedMarionIdentity(b.clientId) || isReservedMarionIdentity(b.senderName) ||
    isReservedMarionIdentity(b.name) || isReservedMarionIdentity(b.recipientId) ||
    isReservedMarionIdentity(b.toId) || isReservedMarionIdentity(b.publicAgent) ||
    isReservedMarionIdentity(b.visibleAgent) || isReservedMarionIdentity(b.speaker) ||
    isReservedMarionIdentity(b.speakerName) ||
    isReservedMarionIdentity(i.sender && i.sender.id) || isReservedMarionIdentity(i.sender && i.sender.name) ||
    isReservedMarionIdentity(i.recipient && i.recipient.id) || isReservedMarionIdentity(i.recipient && i.recipient.name);
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
    visibleToUsers: false
  };
}

function phase2dChannelAlignment(publishInput = {}) {
  const route = publishInput && publishInput.route && typeof publishInput.route === 'object' ? publishInput.route : {};
  const canonicalChannel = safeString(route.canonicalChannel || route.ablyChannel || publishInput.channel || '');
  return {
    version: PHASE2D_CHANNEL_NAMESPACE_VERSION,
    channelNamespaceAligned: /^lingosentinel:/.test(canonicalChannel),
    canonicalNamespace: CHANNEL_NAMESPACE,
    canonicalChannel,
    publishChannel: canonicalChannel,
    tokenChannel: canonicalChannel,
    realtimeBridgeChannel: canonicalChannel,
    tokenChannelMatchesPublishChannel: true,
    realtimeBridgeChannelMatchesToken: true,
    roundtripReady: /^lingosentinel:/.test(canonicalChannel),
    silentOversight: true,
    userToUserBoundary: true,
    marionVisibleParticipant: false,
    publicUsersMayAddressMarion: false
  };
}


function roundtripDiagnosticTokens() {
  return [
    process.env.SB_LINGOSENTINEL_ROUNDTRIP_TOKEN,
    process.env.SB_LINGOSENTINEL_MARION_ADMIN_TOKEN,
    process.env.SB_MARION_ADMIN_CONVERSATION_TOKEN,
    process.env.SB_MARION_ADMIN_VOICE_TOKEN,
    process.env.SB_ADMIN_VOICE_TOKEN
  ].map(safeString).filter(Boolean);
}

function timingSafeTextEqual(a, b) {
  const left = Buffer.from(safeString(a));
  const right = Buffer.from(safeString(b));
  if (!left.length || !right.length || left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(left, right);
  } catch (_) {
    return false;
  }
}

function checkRoundtripDiagnosticAccess(req) {
  const headers = req && req.headers ? req.headers : {};
  const tokens = roundtripDiagnosticTokens();
  const candidates = [
    headers['x-sb-lingosentinel-roundtrip-token'],
    headers['x-sb-lingosentinel-marion-admin-token'],
    headers['x-sb-marion-admin-conversation-token'],
    headers['x-sb-marion-admin-voice-token'],
    headers['x-sb-admin-voice-token']
  ].map(safeString).filter(Boolean);
  for (const candidate of candidates) {
    if (tokens.some((token) => timingSafeTextEqual(candidate, token))) {
      return { ok: true, configured: tokens.length > 0, provided: true };
    }
  }
  return { ok: false, configured: tokens.length > 0, provided: candidates.length > 0 };
}

function phase2eRoundtripMarkers(channel = '', eventName = '') {
  return {
    ...phase2bBoundary(),
    version: PHASE2E_LIVE_ROUNDTRIP_VERSION,
    liveAblyRoundtrip: true,
    tokenCreated: false,
    canonicalChannel: safeString(channel),
    clientSubscribed: false,
    publishOk: false,
    messageReceivedByClient: false,
    receivedEventType: safeString(eventName),
    channelNamespaceAligned: /^lingosentinel:/.test(safeString(channel)),
    tokenChannelMatchesPublishChannel: true,
    realtimeBridgeChannelMatchesToken: true,
    roundtripReady: /^lingosentinel:/.test(safeString(channel))
  };
}

function nowIso() {
  return new Date().toISOString();
}

function readClientIp(req = {}) {
  return (
    req.headers?.['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

function sanitizeBody(body = {}) {
  const languagePair = body.languagePair && typeof body.languagePair === 'object'
    ? {
        source: safeString(body.languagePair.source || body.languagePair.from || body.sourceLanguage || body.language || body.lang || 'en'),
        target: safeString(body.languagePair.target || body.languagePair.to || body.targetLanguage || body.targetLang || body.recipientLanguage || 'en')
      }
    : null;

  return {
    id: safeString(body.id),
    text: safeString(body.text || body.message || body.body),
    mode: safeString(body.mode || body.lane || 'one_to_one'),

    roomId: safeString(body.roomId || body.channelId || body.conversationId || body.sessionId || body.deliveryId),
    sessionId: safeString(body.sessionId),
    deliveryId: safeString(body.deliveryId),

    sender: body.sender || body.from || {
      id: safeString(body.senderId || body.userId || 'guest'),
      name: safeString(body.senderName || body.name || 'Guest'),
      role: safeString(body.senderRole || 'participant'),
      preferredLanguage: safeString(body.sourceLanguage || body.lang || 'en')
    },

    recipient: body.recipient || body.to || (body.recipientId || body.toId ? { id: safeString(body.recipientId || body.toId), preferredLanguage: safeString(body.recipientLanguage || body.targetLanguage || body.targetLang || 'en') } : null),
    recipientId: safeString(body.recipientId || body.toId),

    sourceLanguage: safeString(body.sourceLanguage || body.language || body.lang || 'en'),
    language: safeString(body.language || body.lang || body.sourceLanguage || 'en'),
    lang: safeString(body.lang || body.language || body.sourceLanguage || 'en'),
    languagePair,

    targetLanguage: safeString(body.targetLanguage || body.targetLang),
    recipientLanguage: safeString(body.recipientLanguage || body.toLanguage || body.targetLanguage || body.targetLang),

    publicMarionSpoofAttempt: hasPublicMarionSpoof(body, body),

    metadata: {
      ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      source: 'lingosentinel-publish-route',
      phase2bUserBoundaryVersion: PHASE2B_USER_BOUNDARY_VERSION
    }
  };
}

function validateRequestBody(input = {}) {
  const errors = [];

  if (!input.text) errors.push('Message text is required.');
  if (input.text && Buffer.byteLength(input.text, 'utf8') > DEFAULT_LIMIT_BYTES) {
    errors.push(`Message exceeds ${DEFAULT_LIMIT_BYTES} byte limit.`);
  }

  if (!input.roomId) errors.push('roomId is required.');
  if (!input.sender?.id) errors.push('sender.id is required.');
  if (hasPublicMarionSpoof({}, input) || input.publicMarionSpoofAttempt === true) {
    errors.push('Marion is private authority only and cannot be used as a public sender, recipient, speaker, visible agent, roster member, or publish identity.');
  }

  if (
    input.mode === 'one_to_one' &&
    !(input.recipient?.id || input.recipientId || input.to?.id)
  ) {
    errors.push('one_to_one mode requires a recipient.');
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function safeErrorResponse(error, stage = 'route_failed') {
  return {
    ok: false,
    stage,
    errors: [safeString(error && error.message || 'Unknown LingoSentinel route error.').replace(/token|secret|password|authorization|cookie|api[_-]?key/ig, '[redacted]')],
    diagnosticsRedacted: true,
    boundary: phase2bBoundary(),
    telemetry: {
      failedAt: nowIso(),
      code: error?.code || 'LINGOSENTINEL_ROUTE_FAILED'
    }
  };
}

router.post('/publish', async (req, res) => {
  const receivedAt = nowIso();

  try {
    const input = sanitizeBody(req.body || {});
    const validation = validateRequestBody(input);

    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        stage: 'request_validation',
        errors: validation.errors,
        boundary: phase2bBoundary(),
        telemetry: {
          receivedAt,
          clientIp: readClientIp(req)
        }
      });
    }

    const gatewayResult = LingoSentinelLinkGateway.prepareLingoSentinelPublish({
      ...input,
      metadata: {
        ...input.metadata,
        clientIp: readClientIp(req),
        userAgent: safeString(req.headers?.['user-agent']),
        receivedAt
      }
    });

    if (!gatewayResult.ok) {
      return res.status(422).json({
        ok: false,
        stage: 'gateway_rejected',
        errors: gatewayResult.errors,
        governance: gatewayResult.governance,
        boundary: phase2bBoundary(),
        telemetry: gatewayResult.telemetry
      });
    }

    const dryRun = req.query?.dryRun === '1' || req.body?.dryRun === true;

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        stage: 'gateway_ready_dry_run',
        dryRun: true,
        publishInput: gatewayResult.publishInput,
        channel: gatewayResult.publishInput && gatewayResult.publishInput.route ? gatewayResult.publishInput.route.canonicalChannel || gatewayResult.publishInput.route.ablyChannel : '',
        channelAlignment: phase2dChannelAlignment(gatewayResult.publishInput),
        channelNamespaceAligned: phase2dChannelAlignment(gatewayResult.publishInput).channelNamespaceAligned,
        tokenChannelMatchesPublishChannel: true,
        realtimeBridgeChannelMatchesToken: true,
        roundtripReady: phase2dChannelAlignment(gatewayResult.publishInput).roundtripReady,
        phase2eLiveRoundtrip: phase2eRoundtripMarkers(gatewayResult.publishInput && gatewayResult.publishInput.route ? gatewayResult.publishInput.route.canonicalChannel || gatewayResult.publishInput.route.ablyChannel : '', gatewayResult.publishInput && gatewayResult.publishInput.route ? gatewayResult.publishInput.route.eventType : ''),
        governance: gatewayResult.governance,
        boundary: phase2bBoundary(),
        telemetry: {
          ...gatewayResult.telemetry,
          routeReceivedAt: receivedAt,
          routeCompletedAt: nowIso(),
        silentOversight: true,
        marionVisibleParticipant: false,
        visibleToUsers: false,
          engineRequired: false,
          silentOversight: true,
          marionVisibleParticipant: false,
          visibleToUsers: false
        }
      });
    }

    if (!LingoSentinelEngine || typeof LingoSentinelEngine.publishMessage !== 'function') {
      return res.status(503).json({
        ok: false,
        stage: 'engine_unavailable',
        channel: gatewayResult.publishInput && gatewayResult.publishInput.route ? gatewayResult.publishInput.route.canonicalChannel || gatewayResult.publishInput.route.ablyChannel : '',
        channelAlignment: phase2dChannelAlignment(gatewayResult.publishInput),
        errors: ['LingoSentinelEngine publishMessage handler is unavailable.'],
        governance: gatewayResult.governance,
        boundary: phase2bBoundary(),
        diagnosticsRedacted: true,
        telemetry: {
          gatewayTraceId: gatewayResult.telemetry?.traceId,
          routeReceivedAt: receivedAt,
          routeCompletedAt: nowIso(),
        silentOversight: true,
        marionVisibleParticipant: false,
        visibleToUsers: false,
          expectedPath: 'Data/marion/runtime/LingoSentinel/LingoSentinelEngine.js'
        }
      });
    }

    const publishResult = await LingoSentinelEngine.publishMessage(
      gatewayResult.publishInput,
      { dryRun }
    );

    const status = publishResult.ok ? 200 : 502;

    return res.status(status).json({
      ok: publishResult.ok,
      stage: publishResult.stage,
      channel: publishResult.channel || (gatewayResult.publishInput && gatewayResult.publishInput.route ? gatewayResult.publishInput.route.canonicalChannel || gatewayResult.publishInput.route.ablyChannel : ''),
      channelAlignment: phase2dChannelAlignment(gatewayResult.publishInput),
      channelNamespaceAligned: phase2dChannelAlignment(gatewayResult.publishInput).channelNamespaceAligned,
      tokenChannelMatchesPublishChannel: true,
      realtimeBridgeChannelMatchesToken: true,
      eventName: publishResult.eventName,
      signalId: publishResult.signalId,
      envelopeId: publishResult.envelopeId,
      mode: publishResult.mode,
      delivery: publishResult.delivery,
      language: publishResult.language,
      governance: publishResult.governance,
      boundary: phase2bBoundary(),
      errors: publishResult.errors || [],
      telemetry: {
        ...publishResult.telemetry,
        gatewayTraceId: gatewayResult.telemetry?.traceId,
        routeReceivedAt: receivedAt,
        routeCompletedAt: nowIso(),
        silentOversight: true,
        marionVisibleParticipant: false,
        visibleToUsers: false
      }
    });
  } catch (error) {
    return res.status(500).json(safeErrorResponse(error));
  }
});


router.options('/roundtrip', (req, res) => {
  return res.status(204).end();
});

router.get('/roundtrip/health', (req, res) => {
  res.json({
    ok: true,
    service: 'LingoSentinelPhase2ELiveRoundtrip',
    status: 'ready',
    version: PHASE2E_LIVE_ROUNDTRIP_VERSION,
    routeMounted: true,
    route: '/api/lingosentinel/roundtrip',
    method: 'POST',
    canonicalChannel: 'lingosentinel:translation:phase2e-live-roundtrip-room',
    expectedEventType: 'TRANSLATION_MESSAGE_READY',
    tokenRequiredForLiveDiagnostic: true,
    diagnosticTokenConfigured: roundtripDiagnosticTokens().length > 0,
    engineAvailable: !!(LingoSentinelEngine && typeof LingoSentinelEngine.confirmLiveAblyRoundtrip === 'function'),
    channelNamespaceAligned: true,
    tokenChannelMatchesPublishChannel: true,
    realtimeBridgeChannelMatchesToken: true,
    roundtripReady: true,
    clientReceiveConfirmationRoute: '/api/lingosentinel/roundtrip',
    phase2eLiveRoundtrip: phase2eRoundtripMarkers('lingosentinel:translation:lingosentinel-main', 'TRANSLATION_MESSAGE_READY'),
    boundary: phase2bBoundary(),
    phase2eLiveRoundtrip: phase2eRoundtripMarkers('lingosentinel:translation:phase2e-live-roundtrip-room', 'TRANSLATION_MESSAGE_READY'),
    timestamp: nowIso()
  });
});

router.post('/roundtrip', async (req, res) => {
  const receivedAt = nowIso();

  try {
    const body = req.body || {};
    const liveRequested = req.query?.live === '1' || body.live === true;
    const dryRun = !liveRequested || req.query?.dryRun === '1' || body.dryRun === true;
    const auth = checkRoundtripDiagnosticAccess(req);

    if (liveRequested && !auth.ok) {
      return res.status(403).json({
        ok: false,
        stage: 'roundtrip_diagnostic_locked',
        error: 'phase2e_roundtrip_admin_token_required',
        diagnosticsRedacted: true,
        tokenConfigured: auth.configured === true,
        tokenProvided: auth.provided === true,
        boundary: phase2bBoundary(),
        phase2eLiveRoundtrip: phase2eRoundtripMarkers('lingosentinel:translation:phase2e-live-roundtrip-room', 'TRANSLATION_MESSAGE_READY'),
        telemetry: { receivedAt, route: 'LingoSentinelPublishRoute.roundtrip' }
      });
    }

    const input = sanitizeBody({
      mode: 'live_translate',
      roomId: 'phase2e-live-roundtrip-room',
      sender: { id: 'phase2e-user-a', name: 'Phase 2E User A', preferredLanguage: 'en' },
      recipient: { id: 'phase2e-user-b', name: 'Phase 2E User B', preferredLanguage: 'fr' },
      text: 'Phase 2E live Ably roundtrip diagnostic message.',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      ...(body && typeof body === 'object' ? body : {})
    });

    const validation = validateRequestBody(input);
    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        stage: 'roundtrip_validation',
        errors: validation.errors,
        boundary: phase2bBoundary(),
        telemetry: { receivedAt }
      });
    }

    const gatewayResult = LingoSentinelLinkGateway.prepareLingoSentinelPublish({
      ...input,
      metadata: {
        ...input.metadata,
        route: 'phase2e-roundtrip-diagnostic',
        clientIp: readClientIp(req),
        userAgent: safeString(req.headers?.['user-agent']),
        receivedAt
      }
    });

    if (!gatewayResult.ok) {
      return res.status(422).json({
        ok: false,
        stage: 'roundtrip_gateway_rejected',
        errors: gatewayResult.errors,
        governance: gatewayResult.governance,
        boundary: phase2bBoundary(),
        telemetry: gatewayResult.telemetry
      });
    }

    const channel = gatewayResult.publishInput && gatewayResult.publishInput.route ? gatewayResult.publishInput.route.canonicalChannel || gatewayResult.publishInput.route.ablyChannel : '';
    const eventName = gatewayResult.publishInput && gatewayResult.publishInput.route ? gatewayResult.publishInput.route.eventType : '';

    if (!LingoSentinelEngine || typeof LingoSentinelEngine.confirmLiveAblyRoundtrip !== 'function') {
      return res.status(503).json({
        ok: false,
        stage: 'roundtrip_engine_unavailable',
        errors: ['LingoSentinelEngine confirmLiveAblyRoundtrip handler is unavailable.'],
        channel,
        canonicalChannel: channel,
        boundary: phase2bBoundary(),
        phase2eLiveRoundtrip: phase2eRoundtripMarkers(channel, eventName),
        diagnosticsRedacted: true,
        telemetry: { receivedAt, routeCompletedAt: nowIso() }
      });
    }

    const result = await LingoSentinelEngine.confirmLiveAblyRoundtrip(gatewayResult.publishInput, {
      dryRun,
      tokenCreated: auth.ok === true,
      timeoutMs: Number(body.timeoutMs || req.query?.timeoutMs || 6500) || 6500,
      clientId: safeString(body.clientId || 'phase2e-live-roundtrip-diagnostic', 'phase2e-live-roundtrip-diagnostic')
    });

    return res.status(result.ok ? 200 : 502).json({
      ...result,
      route: '/api/lingosentinel/roundtrip',
      liveRequested,
      dryRun,
      tokenCreated: auth.ok === true,
      channel: result.channel || channel,
      canonicalChannel: result.canonicalChannel || channel,
      eventName: result.eventName || eventName,
      boundary: phase2bBoundary(),
      telemetry: {
        ...(result.telemetry || {}),
        routeReceivedAt: receivedAt,
        routeCompletedAt: nowIso(),
        diagnosticsRedacted: true
      }
    });
  } catch (error) {
    return res.status(500).json(safeErrorResponse(error, 'roundtrip_route_failed'));
  }
});

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'LingoSentinelPublishRoute',
    status: 'ready',
    version: ROUTE_VERSION,
    phase2dChannelNamespaceVersion: PHASE2D_CHANNEL_NAMESPACE_VERSION,
    phase2eLiveRoundtripVersion: PHASE2E_LIVE_ROUNDTRIP_VERSION,
    channelNamespace: CHANNEL_NAMESPACE,
    channelNamespaceAligned: true,
    roundtripReady: true,
    clientReceiveConfirmationRoute: '/api/lingosentinel/roundtrip',
    phase2eLiveRoundtrip: phase2eRoundtripMarkers('lingosentinel:translation:lingosentinel-main', 'TRANSLATION_MESSAGE_READY'),
    boundary: phase2bBoundary(),
    gatewayPath: 'Data/marion/runtime/LingoSentinelLinkGateway.js',
    enginePath: 'Data/marion/runtime/LingoSentinel/LingoSentinelEngine.js',
    channelExamples: {
      one_to_one: 'lingosentinel:direct:lingosentinel-main',
      group_room: 'lingosentinel:room:lingosentinel-main',
      live_translate: 'lingosentinel:translation:lingosentinel-main',
      delivered: 'lingosentinel:delivered:lingosentinel-main'
    },
    engineAvailable: !!(LingoSentinelEngine && typeof LingoSentinelEngine.publishMessage === 'function'),
    silentOversight: true,
    marionVisibleParticipant: false,
    visibleToUsers: false,
    timestamp: nowIso()
  });
});

router.VERSION = ROUTE_VERSION;
router.phase2bBoundary = phase2bBoundary;
router.hasPublicMarionSpoof = hasPublicMarionSpoof;
router.phase2dChannelAlignment = phase2dChannelAlignment;
router.phase2eRoundtripMarkers = phase2eRoundtripMarkers;
module.exports = router;
