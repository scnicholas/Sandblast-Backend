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
      reply: 'Voice input was received, but MarionBridge is not available in the runtime folder.',
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
      reply: 'Voice input was received, but MarionBridge does not expose a compatible handler.',
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

function buildVoiceReplyPromotionFallback(voiceEnvelope, response) {
  const env = voiceEnvelope && typeof voiceEnvelope === 'object' ? voiceEnvelope : {};
  const hint = safeText(env.userIntentHint).toLowerCase();
  const commandPhrase = safeText(env.commandPhrase).toLowerCase();
  const authorizationState = safeText(env.authorizationState);

  if (hint === 'status' || commandPhrase === 'status') {
    return 'Voice lane status: Nyx is the public route, Marion remains the authority, Mac voice authorization is accepted, and raw audio is not being stored. The remaining issue was final reply promotion, so I surfaced this safe visible status instead of returning silence.';
  }

  if (response && response.ok === false) {
    return firstReplyText(response) || 'I heard you, but Marion could not complete that voice turn cleanly. I kept the public response safe and did not store raw audio.';
  }

  if (authorizationState === 'authorized') {
    return 'I heard you and authorization passed, but the bridge did not return a visible final reply. I surfaced this safe fallback instead of returning silence.';
  }

  return 'I heard you, but that voice turn did not produce a clean final answer. Please try the same request again.';
}

function makeNyxBoundaryResponse(response, voiceEnvelope, telemetry, outputPolicy) {
  const base = response && typeof response === 'object'
    ? response
    : { reply: String(response || '') };
  const originalReply = firstReplyText(base);
  const fallbackReply = originalReply ? '' : buildVoiceReplyPromotionFallback(voiceEnvelope, base);
  const cleanReply = originalReply || fallbackReply;
  const fallbackUsed = !originalReply && Boolean(cleanReply);
  const policy = outputPolicy && typeof outputPolicy === 'object' ? outputPolicy : {};
  const policyReason = safeText(policy.reason);
  const fallbackCanSpeak = fallbackUsed && (!policyReason || policyReason === 'EMPTY_RESPONSE');
  const spokenText = firstReplyText(policy) || (policy.speakAllowed === true || fallbackCanSpeak ? cleanReply : '');

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
    voice: Object.assign({}, base.voice || {}, policy, {
      speakAllowed: policy.speakAllowed === true || fallbackCanSpeak,
      voiceMode: safeText(policy.voiceMode) || 'full',
      reason: fallbackUsed ? 'VOICE_REPLY_PROMOTION_FALLBACK' : (policyReason || 'SPEAKABLE_RESPONSE'),
      spokenText,
      audioStored: false,
      replyPromotionFallback: fallbackUsed
    }),
    voiceEnvelope: {
      source: voiceEnvelope.source,
      inputChannel: voiceEnvelope.inputChannel,
      locale: voiceEnvelope.locale,
      confidence: voiceEnvelope.confidence,
      authorizationState: voiceEnvelope.authorizationState,
      userIntentHint: voiceEnvelope.userIntentHint,
      commandPhrase: voiceEnvelope.commandPhrase || null,
      wakeWord: voiceEnvelope.wakeWord || null,
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

  let envelope = createVoiceInputEnvelope(input);
  telemetryEvents.push(createVoiceTelemetryEvent('voice.envelope.created', envelope));

  const authResult = applyVoiceAuthorization(envelope, opts.authorization || opts);
  envelope = authResult.envelope;
  telemetryEvents.push(createVoiceTelemetryEvent('voice.authorization.checked', envelope, authResult.authorization));

  if (!authResult.authorization.allowed) {
    const blockedResponse = {
      ok: false,
      reply: 'I heard you, but that voice request needs authorization before I can continue.',
      reason: authResult.authorization.reason
    };

    const withPolicy = applyVoiceOutputPolicy(blockedResponse, opts.output || opts);
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
    voice: {
      envelope,
      wakeWord: envelope.wakeWord || null,
      commandPhrase: envelope.commandPhrase || null,
      source: 'voice',
      inputChannel: 'voice',
      audioStored: false
    }
  };

  const bridgeContext = Object.assign({}, opts.context || {}, {
    inputChannel: 'voice',
    source: 'voice',
    publicAgent: 'Nyx',
    authority: 'Marion',
    sessionId: envelope.sessionId,
    requestId: envelope.requestId
  });

  let bridgeResponse;

  try {
    bridgeResponse = await callBridge(bridge, bridgePayload, bridgeContext);
    telemetryEvents.push(createVoiceTelemetryEvent('voice.marion.bridge.completed', envelope));
  } catch (error) {
    bridgeResponse = {
      ok: false,
      reply: 'Voice input reached the Marion bridge, but the bridge failed during processing.',
      error: error && error.message ? error.message : 'MARION_BRIDGE_ERROR'
    };

    telemetryEvents.push(createVoiceTelemetryEvent('voice.marion.bridge.failed', envelope, {
      error: bridgeResponse.error
    }));
  }

  const withPolicy = applyVoiceOutputPolicy(bridgeResponse, opts.output || opts);
  const outputPolicy = withPolicy.voice;

  telemetryEvents.push(createVoiceTelemetryEvent('voice.output.policy.checked', envelope, outputPolicy));

  return makeNyxBoundaryResponse(withPolicy, envelope, telemetryEvents, outputPolicy);
}

module.exports = {
  handleVoiceTranscript,
  makeNyxBoundaryResponse,
  firstReplyText,
  loadMarionBridge
};
