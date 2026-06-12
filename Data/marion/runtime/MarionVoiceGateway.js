'use strict';

/**
 * MarionVoiceGateway
 * Central coordinator for the voice lane.
 *
 * Flow:
 * voice transcript
 * → VoiceInputEnvelope
 * → VoiceAuthorizationGate
 * → VoiceTranscriptNormalizer
 * → MarionBridge
 * → VoiceOutputPolicy
 * → Nyx-facing final envelope
 *
 * Admin-only delivery hardlock:
 * - Public/browser speaker hints cannot authorize Marion voice.
 * - Marion voice audio is allowed only when the server marks the request
 *   as admin-verified before it reaches this gateway.
 */

const {
  createVoiceInputEnvelope
} = require('./MarionVoiceInputEnvelope');

const {
  applyVoiceAuthorization
} = require('./MarionVoiceAuthorizationGate');

const {
  applyTranscriptNormalization
} = require('./MarionVoiceTranscriptNormalizer');

const {
  applyVoiceOutputPolicy
} = require('./MarionVoiceOutputPolicy');

const {
  createVoiceTelemetryEvent
} = require('./MarionVoiceTelemetry');

const VERSION = 'marion.voiceGateway/2.0-admin-only-delivery';

function safeRequire(path) {
  try {
    return require(path);
  } catch (_) {
    return null;
  }
}

function loadMarionBridge() {
  return (
    safeRequire('./MarionBridge') ||
    safeRequire('./marionBridge') ||
    safeRequire('./MarionBridge.js') ||
    safeRequire('./marionBridge.js') ||
    safeRequire('./MarionDualTrackGateway') ||
    safeRequire('./MarionDualTrackGateway.js')
  );
}

async function callBridge(bridge, payload, context) {
  if (!bridge) {
    return {
      ok: false,
      reply: 'Voice input was received, but the protected voice bridge is not available yet.',
      error: 'MARION_BRIDGE_NOT_FOUND'
    };
  }

  const candidates = [
    bridge.handleVoiceTranscript,
    bridge.handleVoiceInput,
    bridge.handleMessage,
    bridge.handle,
    bridge.route,
    bridge.process,
    bridge.compose,
    bridge.default
  ].filter((fn) => typeof fn === 'function');

  if (candidates.length === 0) {
    return {
      ok: false,
      reply: 'Voice input was received, but the protected voice bridge does not expose a compatible handler.',
      error: 'MARION_BRIDGE_HANDLER_NOT_FOUND'
    };
  }

  return candidates[0](payload, context);
}

function safeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function directReplyText(response) {
  if (!response) return '';
  if (typeof response === 'string') return safeText(response);
  return safeText(
    response.displayReply ||
      response.reply ||
      response.text ||
      response.message ||
      response.answer ||
      response.output ||
      response.response ||
      response.spokenText ||
      response.finalReply ||
      response.publicReply ||
      response.visibleReply ||
      ''
  );
}

function firstReplyText(response, depth, seen) {
  if (!response) return '';
  if (typeof response === 'string') return safeText(response);
  if (typeof response !== 'object') return '';

  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 6) return '';

  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(response)) return '';
  visited.add(response);

  const direct = directReplyText(response);
  if (direct) return direct;

  const priorityKeys = [
    'finalEnvelope',
    'payload',
    'data',
    'result',
    'packet',
    'marionFinal',
    'final',
    'envelope',
    'response',
    'output',
    'message',
    'reply',
    'text',
    'voice',
    'speech',
    'meta'
  ];

  for (const key of priorityKeys) {
    const nested = response[key];
    if (nested && typeof nested === 'object') {
      const found = firstReplyText(nested, level + 1, visited);
      if (found) return found;
    }
  }

  for (const key of Object.keys(response)) {
    if (priorityKeys.includes(key)) continue;
    const nested = response[key];
    if (nested && typeof nested === 'object') {
      const found = firstReplyText(nested, level + 1, visited);
      if (found) return found;
    }
  }

  return '';
}

function isAdminVoiceDeliveryAllowed(voiceEnvelope, outputPolicy) {
  const env = voiceEnvelope && typeof voiceEnvelope === 'object' ? voiceEnvelope : {};
  const policy = outputPolicy && typeof outputPolicy === 'object' ? outputPolicy : {};
  return policy.adminVoiceDeliveryAllowed === true ||
    env.adminVoiceDeliveryAllowed === true ||
    (env.authorizationState === 'authorized' && env.adminVoiceVerified === true);
}

function buildVoiceReplyPromotionFallback(voiceEnvelope, response) {
  const env = voiceEnvelope && typeof voiceEnvelope === 'object' ? voiceEnvelope : {};
  const hint = safeText(env.userIntentHint).toLowerCase();
  const commandPhrase = safeText(env.commandPhrase).toLowerCase();
  const authorizationState = safeText(env.authorizationState);
  const adminVoiceDeliveryAllowed = env.adminVoiceDeliveryAllowed === true;

  if (hint === 'status' || commandPhrase === 'status') {
    return adminVoiceDeliveryAllowed
      ? 'Protected voice lane status: admin authorization is verified, transcript-only processing is live, and raw audio is not being stored.'
      : 'Protected voice lane status: admin voice delivery is locked. Transcript-only processing is live, and raw audio is not being stored.';
  }

  if (response && response.ok === false) {
    return firstReplyText(response) || 'I heard you, but that protected voice turn could not complete cleanly. The response stayed safe and raw audio was not stored.';
  }

  if (authorizationState === 'authorized' && adminVoiceDeliveryAllowed) {
    return 'I heard you and admin authorization passed, but the bridge did not return a visible final reply.';
  }

  return 'I heard you, but protected voice delivery needs admin authorization before I can continue.';
}

function makeNyxBoundaryResponse(response, voiceEnvelope, telemetry, outputPolicy) {
  const base = response && typeof response === 'object'
    ? response
    : { reply: String(response || '') };
  const env = voiceEnvelope && typeof voiceEnvelope === 'object' ? voiceEnvelope : {};
  const originalReply = firstReplyText(base);
  const fallbackReply = originalReply ? '' : buildVoiceReplyPromotionFallback(env, base);
  const cleanReply = originalReply || fallbackReply;
  const fallbackUsed = !originalReply && Boolean(cleanReply);
  const policy = outputPolicy && typeof outputPolicy === 'object' ? outputPolicy : {};
  const policyReason = safeText(policy.reason);
  const adminVoiceDeliveryAllowed = isAdminVoiceDeliveryAllowed(env, policy);
  const fallbackCanSpeak = adminVoiceDeliveryAllowed && fallbackUsed && (!policyReason || policyReason === 'EMPTY_RESPONSE');
  const policySpokenText = firstReplyText(policy);
  const speakAllowed = adminVoiceDeliveryAllowed && Boolean(policySpokenText || (fallbackCanSpeak && cleanReply)) && (policy.speakAllowed === true || fallbackCanSpeak);
  const spokenText = speakAllowed ? (policySpokenText || cleanReply) : '';

  return Object.assign({}, base, {
    ok: base.ok !== false && Boolean(cleanReply),
    reply: cleanReply,
    text: cleanReply,
    message: cleanReply,
    displayReply: cleanReply,
    publicAgent: 'Nyx',
    authority: 'Marion',
    inputChannel: 'voice',
    source: 'voice',
    adminOnlyVoiceDelivery: true,
    voice: Object.assign({}, base.voice || {}, policy, {
      speakAllowed,
      voiceMode: speakAllowed ? (safeText(policy.voiceMode) || 'full') : 'silent',
      reason: speakAllowed ? (fallbackUsed ? 'VOICE_REPLY_PROMOTION_FALLBACK' : (policyReason || 'SPEAKABLE_RESPONSE')) : (policyReason || 'ADMIN_ONLY_VOICE_DELIVERY_REQUIRED'),
      spokenText,
      audioStored: false,
      adminOnlyVoiceDelivery: true,
      adminVoiceDeliveryAllowed,
      replyPromotionFallback: fallbackUsed
    }),
    voiceEnvelope: {
      source: env.source,
      inputChannel: env.inputChannel,
      locale: env.locale,
      confidence: env.confidence,
      authorizationState: env.authorizationState,
      adminOnlyVoiceDelivery: true,
      adminVoiceVerified: env.adminVoiceVerified === true,
      adminVoiceDeliveryAllowed,
      userIntentHint: env.userIntentHint,
      commandPhrase: env.commandPhrase || null,
      wakeWord: env.wakeWord || null,
      audioStored: false
    },
    voiceReplyPromotion: {
      applied: fallbackUsed,
      source: originalReply ? 'bridge_or_composer' : 'gateway_safe_fallback',
      originalReplyPresent: Boolean(originalReply)
    },
    telemetry
  });
}

async function handleVoiceTranscript(input, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const telemetryEvents = [];

  let envelope = createVoiceInputEnvelope(Object.assign({}, input || {}, {
    adminOnlyVoiceDelivery: true
  }));
  telemetryEvents.push(createVoiceTelemetryEvent('voice.envelope.created', envelope));

  const authOptions = Object.assign({
    adminOnlyVoiceDelivery: true,
    allowConversationalWhenUnknown: false,
    trustSpeakerHint: false
  }, opts.authorization || opts);

  const authResult = applyVoiceAuthorization(envelope, authOptions);
  envelope = authResult.envelope;
  telemetryEvents.push(createVoiceTelemetryEvent('voice.authorization.checked', envelope, authResult.authorization));

  if (!authResult.authorization.allowed) {
    const blockedResponse = {
      ok: false,
      reply: 'I heard you, but protected voice delivery needs admin authorization before I can continue.',
      reason: authResult.authorization.reason
    };

    const withPolicy = applyVoiceOutputPolicy(blockedResponse, Object.assign({}, opts.output || opts, {
      adminOnlyVoiceDelivery: true,
      adminVoiceVerified: false,
      adminVoiceDeliveryAllowed: false,
      forceSilent: true
    }));
    const outputPolicy = withPolicy.voice;

    telemetryEvents.push(createVoiceTelemetryEvent('voice.blocked', envelope, authResult.authorization));

    return makeNyxBoundaryResponse(withPolicy, envelope, telemetryEvents, outputPolicy);
  }

  const normalizationResult = applyTranscriptNormalization(envelope, opts.normalization || opts);
  envelope = normalizationResult.envelope;
  telemetryEvents.push(createVoiceTelemetryEvent('voice.transcript.normalized', envelope, normalizationResult.normalization));

  const bridge = opts.bridge || loadMarionBridge();

  const bridgePayload = {
    input: envelope.transcript,
    text: envelope.transcript,
    userQuery: envelope.transcript,
    query: envelope.transcript,
    message: envelope.transcript,
    transcript: envelope.transcript,
    originalTranscript: envelope.originalTranscript || envelope.transcript,
    inputChannel: 'voice',
    source: 'voice',
    publicAgent: 'Nyx',
    authority: 'Marion',
    locale: envelope.locale,
    confidence: envelope.confidence,
    authorizationState: envelope.authorizationState,
    adminOnlyVoiceDelivery: true,
    adminVoiceVerified: envelope.adminVoiceVerified === true,
    adminVoiceDeliveryAllowed: envelope.adminVoiceDeliveryAllowed === true,
    voice: {
      envelope,
      wakeWord: envelope.wakeWord || null,
      commandPhrase: envelope.commandPhrase || null,
      source: 'voice',
      inputChannel: 'voice',
      audioStored: false,
      adminOnlyVoiceDelivery: true,
      adminVoiceDeliveryAllowed: envelope.adminVoiceDeliveryAllowed === true
    }
  };

  const bridgeContext = Object.assign({}, opts.context || {}, {
    inputChannel: 'voice',
    source: 'voice',
    publicAgent: 'Nyx',
    authority: 'Marion',
    sessionId: envelope.sessionId,
    requestId: envelope.requestId,
    adminOnlyVoiceDelivery: true,
    adminVoiceVerified: envelope.adminVoiceVerified === true,
    adminVoiceDeliveryAllowed: envelope.adminVoiceDeliveryAllowed === true
  });

  let bridgeResponse;

  try {
    bridgeResponse = await callBridge(bridge, bridgePayload, bridgeContext);
    telemetryEvents.push(createVoiceTelemetryEvent('voice.marion.bridge.completed', envelope));
  } catch (error) {
    bridgeResponse = {
      ok: false,
      reply: 'Voice input reached the protected voice bridge, but the bridge failed during processing.',
      error: error && error.message ? error.message : 'MARION_BRIDGE_ERROR'
    };

    telemetryEvents.push(createVoiceTelemetryEvent('voice.marion.bridge.failed', envelope, {
      error: bridgeResponse.error
    }));
  }

  const withPolicy = applyVoiceOutputPolicy(bridgeResponse, Object.assign({}, opts.output || opts, {
    adminOnlyVoiceDelivery: true,
    adminVoiceVerified: envelope.adminVoiceVerified === true,
    adminVoiceDeliveryAllowed: envelope.adminVoiceDeliveryAllowed === true
  }));
  const outputPolicy = withPolicy.voice;

  telemetryEvents.push(createVoiceTelemetryEvent('voice.output.policy.checked', envelope, outputPolicy));

  return makeNyxBoundaryResponse(withPolicy, envelope, telemetryEvents, outputPolicy);
}

module.exports = {
  VERSION,
  handleVoiceTranscript,
  makeNyxBoundaryResponse,
  firstReplyText,
  loadMarionBridge,
  isAdminVoiceDeliveryAllowed
};
