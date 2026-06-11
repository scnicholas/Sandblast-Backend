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

function makeNyxBoundaryResponse(response, voiceEnvelope, telemetry, outputPolicy) {
  const base = response && typeof response === 'object'
    ? response
    : { reply: String(response || '') };

  return Object.assign({}, base, {
    ok: base.ok !== false,
    publicAgent: 'Nyx',
    authority: 'Marion',
    inputChannel: 'voice',
    source: 'voice',
    voice: Object.assign({}, base.voice || {}, outputPolicy || {}),
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
      commandPhrase: envelope.commandPhrase || null
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
  loadMarionBridge
};
