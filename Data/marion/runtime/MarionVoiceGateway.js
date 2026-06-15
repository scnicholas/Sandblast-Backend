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

const voiceDeliveryStabilizer = (() => {
  try {
    return require('./NyxVoiceDeliveryStabilizer');
  } catch (_) {
    return null;
  }
})();

const speechSyncEnvelopeMod = (() => {
  try {
    return require('./NyxSpeechSyncEnvelope');
  } catch (_) {
    return null;
  }
})();

function projectVoiceMode(rawMode, speakAllowed, spokenText) {
  if (speakAllowed !== true || !safeText(spokenText)) return 'silent';
  const mode = safeText(rawMode || '').toLowerCase();
  return mode === 'brief' ? 'brief' : 'full';
}

const VERSION = 'marion.voiceGateway/2.7-marion-admin-interface-bridge';

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


function isDirectMarionAdminInterface(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const opts = options && typeof options === 'object' ? options : {};
  const voice = env.voice && typeof env.voice === 'object' ? env.voice : {};
  const channel = safeText(opts.deliveryChannel || env.deliveryChannel || voice.deliveryChannel).toLowerCase();
  const scope = safeText(opts.adminInterfaceScope || env.adminInterfaceScope || voice.adminInterfaceScope).toLowerCase();
  return env.directMarionAdminInterface === true ||
    env.marionAdminConversation === true ||
    voice.directMarionAdminInterface === true ||
    voice.marionAdminConversation === true ||
    opts.directMarionAdminInterface === true ||
    opts.allowMarionAdminConversation === true ||
    scope === 'marion_admin_conversation' ||
    channel === 'marion_admin_interface';
}

function resolveVoicePublicAgent(envelope, adminVoiceDeliveryAllowed, options) {
  return adminVoiceDeliveryAllowed === true && isDirectMarionAdminInterface(envelope, options) ? 'Marion' : 'Nyx';
}

function resolveVoiceSource(envelope, options) {
  return isDirectMarionAdminInterface(envelope, options) ? 'marion-admin-interface' : 'voice';
}

function marionAdminInterfaceMeta(envelope, allowed, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const direct = isDirectMarionAdminInterface(env, options || {});
  return {
    directMarionAdminInterface: direct,
    marionAdminConversationAllowed: allowed === true && direct,
    adminInterfaceScope: safeText(env.adminInterfaceScope || (direct ? 'marion_admin_conversation' : '')),
    publicUsersCanAddressMarion: false,
    publicUserFacing: false,
    adminOnly: true
  };
}

function hasOptionAdminVoiceProof(options) {
  const opts = options && typeof options === 'object' ? options : {};
  return opts.adminVoiceVerified === true ||
    opts.adminVoiceTokenVerified === true ||
    opts.adminVoiceDeliveryAllowed === true ||
    opts.adminVerified === true ||
    opts.serverSideAdminVoiceAuth === true ||
    opts.trustedServerAuth === true;
}

function safeErrorCode(error, fallback = 'MARION_BRIDGE_ERROR') {
  const raw = safeText(error && (error.code || error.name || error.message) || fallback)
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!raw || /TOKEN|SECRET|PASSWORD|COOKIE|AUTHORIZATION|X_SB/.test(raw)) return fallback;
  return raw.slice(0, 80) || fallback;
}

function voiceDeliveryMetaFromEnvelope(env, base) {
  const envelope = env && typeof env === 'object' ? env : {};
  const response = base && typeof base === 'object' ? base : {};
  const privateDelivery = envelope.privateDelivery === true || response.privateDelivery === true || response.privateVoiceDelivery === true;
  return {
    privateDelivery,
    privateVoiceDelivery: privateDelivery,
    deliveryChannel: envelope.deliveryChannel || response.deliveryChannel || (privateDelivery ? 'lingosentinel_private_voice' : ''),
    transcriptOnly: true,
    noRawAudioStored: true,
    audioStored: false
  };
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
  const opts = options && typeof options === 'object' ? options : {};
  return policy.adminVoiceDeliveryAllowed === true ||
    env.adminVoiceDeliveryAllowed === true ||
    (env.authorizationState === 'authorized' && env.adminVoiceVerified === true);
}

function normalizeEchoText(value) {
  return safeText(value)
    .toLowerCase()
    .replace(/^\s*(?:vera|nyx|marion)\s*[,:\-]?\s*/i, '')
    .replace(/[“”"'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEchoReplyToEnvelope(reply, voiceEnvelope, response) {
  const candidate = normalizeEchoText(reply);
  if (!candidate) return false;
  const env = voiceEnvelope && typeof voiceEnvelope === 'object' ? voiceEnvelope : {};
  const res = response && typeof response === 'object' ? response : {};
  const voice = res.voice && typeof res.voice === 'object' ? res.voice : {};
  const normalization = env.normalization && typeof env.normalization === 'object' ? env.normalization : {};
  const echoes = [
    env.transcript,
    env.originalTranscript,
    env.normalizedTranscript,
    normalization.transcript,
    normalization.originalTranscript,
    normalization.normalizedTranscript,
    res.transcript,
    res.originalTranscript,
    res.normalizedTranscript,
    voice.transcript,
    voice.originalTranscript,
    voice.normalizedTranscript
  ].map(normalizeEchoText).filter(Boolean);
  return echoes.some((echo) => candidate === echo || (candidate.length >= 12 && echo.length >= 12 && (candidate.includes(echo) || echo.includes(candidate))));
}

function isProtectedVoiceStatusIntent(voiceEnvelope) {
  const env = voiceEnvelope && typeof voiceEnvelope === 'object' ? voiceEnvelope : {};
  const text = safeText([
    env.userIntentHint,
    env.commandPhrase,
    env.wakeWord,
    env.transcript,
    env.originalTranscript,
    env.normalizedTranscript
  ].map(safeText).filter(Boolean).join(' ')).toLowerCase();
  if (!text) return false;
  return /\bstatus\b/.test(text) ||
    /\bconnected\s+through\s+marion\b/.test(text) ||
    /\bconnected\s+to\s+marion\b/.test(text) ||
    /\bmarion\b.*\bconnected\b/.test(text) ||
    /\bvoice\s+lane\b.*\bstatus\b/.test(text) ||
    /\bprotected\s+voice\b.*\bsummary\b/.test(text);
}

function buildProtectedVoiceStatusReply(voiceEnvelope) {
  const env = voiceEnvelope && typeof voiceEnvelope === 'object' ? voiceEnvelope : {};
  const adminVoiceDeliveryAllowed = env.adminVoiceDeliveryAllowed === true || env.adminVoiceVerified === true || env.authorizationState === 'authorized';
  if (adminVoiceDeliveryAllowed) {
    if (isDirectMarionAdminInterface(env, {})) {
      return 'Marion admin interface is active. Marion is responding through the protected admin channel, public users cannot address Marion directly, and raw audio is not being stored.';
    }
    return 'Nyx is connected through Marion. Marion remains the final response authority, admin voice delivery is authorized, and raw audio is not being stored.';
  }
  return 'Protected voice lane status: admin voice delivery is locked, transcript-only processing is live, and raw audio is not being stored.';
}

function buildVoiceReplyPromotionFallback(voiceEnvelope, response) {
  const env = voiceEnvelope && typeof voiceEnvelope === 'object' ? voiceEnvelope : {};
  const hint = safeText(env.userIntentHint).toLowerCase();
  const commandPhrase = safeText(env.commandPhrase).toLowerCase();
  const authorizationState = safeText(env.authorizationState);
  const adminVoiceDeliveryAllowed = env.adminVoiceDeliveryAllowed === true;

  if (hint === 'status' || commandPhrase === 'status' || isProtectedVoiceStatusIntent(env)) {
    return buildProtectedVoiceStatusReply(env);
  }

  if (response && response.ok === false) {
    return firstReplyText(response) || 'I heard you, but that protected voice turn could not complete cleanly. The response stayed safe and raw audio was not stored.';
  }

  if (authorizationState === 'authorized' && adminVoiceDeliveryAllowed) {
    return 'I heard you and admin authorization passed, but the bridge did not return a visible final reply.';
  }

  return 'I heard you, but protected voice delivery needs admin authorization before I can continue.';
}

function makeNyxBoundaryResponse(response, voiceEnvelope, telemetry, outputPolicy, options) {
  const base = response && typeof response === 'object'
    ? response
    : { reply: String(response || '') };
  const env = voiceEnvelope && typeof voiceEnvelope === 'object' ? voiceEnvelope : {};
  const deliveryMeta = voiceDeliveryMetaFromEnvelope(env, base);
  const rawOriginalReply = firstReplyText(base);
  const originalReplyEchoSuppressed = Boolean(rawOriginalReply && isEchoReplyToEnvelope(rawOriginalReply, env, base));
  const originalReply = originalReplyEchoSuppressed ? '' : rawOriginalReply;
  const fallbackReply = originalReply ? '' : buildVoiceReplyPromotionFallback(env, base);
  const policy = outputPolicy && typeof outputPolicy === 'object' ? outputPolicy : {};
  const policyReason = safeText(policy.reason);
  const stabilizer = voiceDeliveryStabilizer && typeof voiceDeliveryStabilizer.stabilizeNyxVoiceDelivery === 'function'
    ? voiceDeliveryStabilizer.stabilizeNyxVoiceDelivery({
      response: base,
      voiceEnvelope: env,
      outputPolicy: policy,
      candidateReply: originalReply || fallbackReply,
      allowCandidateAsFinal: Boolean(!originalReply && fallbackReply && isProtectedVoiceStatusIntent(env)),
      candidateFinalSource: 'gateway_protected_voice_status',
      upstreamEchoSuppressed: originalReplyEchoSuppressed
    })
    : null;
  const cleanReply = safeText(stabilizer && stabilizer.displayReply) || originalReply || fallbackReply;
  const fallbackUsed = (!originalReply && Boolean(cleanReply)) || originalReplyEchoSuppressed;
  const adminVoiceDeliveryAllowed = stabilizer ? stabilizer.adminVoiceDeliveryAllowed === true : isAdminVoiceDeliveryAllowed(env, policy);
  const resolverOptions = Object.assign({}, opts, policy);
  const resolvedPublicAgent = resolveVoicePublicAgent(env, adminVoiceDeliveryAllowed, resolverOptions);
  const resolvedSource = resolveVoiceSource(env, resolverOptions);
  const adminInterface = marionAdminInterfaceMeta(env, adminVoiceDeliveryAllowed, resolverOptions);
  const fallbackCanSpeak = adminVoiceDeliveryAllowed && fallbackUsed && (!policyReason || policyReason === 'EMPTY_RESPONSE');
  const policySpokenText = firstReplyText(policy);
  const speakAllowed = stabilizer
    ? stabilizer.speakAllowed === true
    : adminVoiceDeliveryAllowed && Boolean(policySpokenText || (fallbackCanSpeak && cleanReply)) && (policy.speakAllowed === true || fallbackCanSpeak);
  const spokenText = stabilizer ? safeText(stabilizer.spokenText) : (speakAllowed ? (policySpokenText || cleanReply) : '');
  const projectedVoiceMode = projectVoiceMode(policy.voiceMode, speakAllowed, spokenText);
  const speechSync = speechSyncEnvelopeMod && typeof speechSyncEnvelopeMod.buildSpeechSyncEnvelope === 'function'
    ? speechSyncEnvelopeMod.buildSpeechSyncEnvelope({
      spokenText,
      speakAllowed,
      voiceMode: projectedVoiceMode,
      voice: Object.assign({}, base.voice || {}, policy, stabilizer || {}),
      voiceEnvelope: env,
      finalApproved: stabilizer ? stabilizer.finalApproved === true : false,
      adminVoiceDeliveryAllowed,
      sessionId: env.sessionId,
      requestId: env.requestId,
      locale: env.locale,
      source: 'MarionVoiceGateway',
      timing: base.speechTiming || (base.voice && base.voice.speechTiming) || {},
      viseme: base.viseme || (base.voice && base.voice.viseme) || {},
      intensity: base.intensity || (base.voice && base.voice.intensity),
      reducedMotion: base.reducedMotion === true || (base.voice && base.voice.reducedMotion === true)
    })
    : {
      enabled: false,
      reason: 'SPEECH_SYNC_ENVELOPE_UNAVAILABLE',
      audioStored: false,
      transcriptOnly: true
    };
  const voiceReason = stabilizer ? safeText(stabilizer.reason) : '';

  return Object.assign({}, base, {
    ok: base.ok !== false && Boolean(cleanReply),
    reply: cleanReply,
    text: cleanReply,
    message: cleanReply,
    displayReply: cleanReply,
    publicAgent: resolvedPublicAgent,
    authority: 'Marion',
    inputChannel: 'voice',
    source: resolvedSource,
    adminInterface,
    adminOnlyVoiceDelivery: true,
    privateDelivery: deliveryMeta.privateDelivery,
    privateVoiceDelivery: deliveryMeta.privateVoiceDelivery,
    deliveryChannel: deliveryMeta.deliveryChannel,
    transcriptOnly: true,
    noRawAudioStored: true,
    audioStored: false,
    speechSync,
    speechSyncEnabled: speechSync && speechSync.enabled === true,
    avatar: speechSync && typeof speechSync === 'object' ? speechSync.avatar : null,
    avatarSpeechState: safeText(speechSync && (speechSync.avatarSpeechState || speechSync.speechState || '')),
    avatarExpression: safeText(speechSync && speechSync.avatarExpression),
    avatarMotion: speechSync && typeof speechSync === 'object' ? speechSync.motion : null,
    avatarAnimation: speechSync && typeof speechSync === 'object' ? (speechSync.avatarAnimation || speechSync.animation) : null,
    avatarMotionTelemetry: speechSync && typeof speechSync === 'object' ? speechSync.avatarMotionTelemetry : null,
    avatarAnimationEnabled: speechSync && speechSync.avatarAnimationEnabled === true,
    phase2SpeechSyncPrepared: speechSync && speechSync.enabled === true,
    phase3AnimationMetadataBridge: speechSync && speechSync.phase3AnimationMetadataBridge === true,
    voice: Object.assign({}, base.voice || {}, policy, {
      speakAllowed,
      voiceMode: projectedVoiceMode,
      reason: voiceReason || (speakAllowed ? (fallbackUsed ? 'VOICE_REPLY_PROMOTION_FALLBACK' : (policyReason || 'SPEAKABLE_RESPONSE')) : (policyReason || 'ADMIN_ONLY_VOICE_DELIVERY_REQUIRED')),
      spokenText,
      audioStored: false,
      noRawAudioStored: true,
      transcriptOnly: true,
      privateVoiceDelivery: deliveryMeta.privateVoiceDelivery,
      adminOnlyVoiceDelivery: true,
      adminVoiceDeliveryAllowed,
      directMarionAdminInterface: adminInterface.directMarionAdminInterface,
      marionAdminConversationAllowed: adminInterface.marionAdminConversationAllowed,
      adminInterfaceScope: adminInterface.adminInterfaceScope,
      publicUsersCanAddressMarion: false,
      replyPromotionFallback: fallbackUsed,
      upstreamEchoSuppressed: originalReplyEchoSuppressed,
      protectedStatusIntent: isProtectedVoiceStatusIntent(env),
      finalEnvelopeOnly: stabilizer ? stabilizer.finalEnvelopeOnly === true : false,
      finalApproved: stabilizer ? stabilizer.finalApproved === true : false,
      finalReplySource: stabilizer ? safeText(stabilizer.finalReplySource) : '',
      duplicateSuppressed: stabilizer ? stabilizer.duplicateSuppressed === true : false,
      echoSuppressed: stabilizer ? stabilizer.echoSuppressed === true : false,
      replyHash: stabilizer ? safeText(stabilizer.replyHash) : '',
      ttsFallbackSafe: stabilizer ? stabilizer.ttsFallbackSafe === true : true,
      textFallbackAvailable: stabilizer ? stabilizer.textFallbackAvailable === true : Boolean(cleanReply),
      stabilizerVersion: voiceDeliveryStabilizer && voiceDeliveryStabilizer.VERSION ? voiceDeliveryStabilizer.VERSION : '',
      speechSync,
      speechSyncEnabled: speechSync && speechSync.enabled === true,
      speechSyncVersion: safeText(speechSync && speechSync.version),
      avatarSpeechState: safeText(speechSync && (speechSync.avatarSpeechState || speechSync.speechState || '')),
      avatarExpression: safeText(speechSync && speechSync.avatarExpression),
      avatarMotion: speechSync && typeof speechSync === 'object' ? speechSync.motion : null,
      avatarAnimation: speechSync && typeof speechSync === 'object' ? (speechSync.avatarAnimation || speechSync.animation) : null,
      avatarMotionTelemetry: speechSync && typeof speechSync === 'object' ? speechSync.avatarMotionTelemetry : null,
      avatarAnimationEnabled: speechSync && speechSync.avatarAnimationEnabled === true,
      phase2SpeechSyncPrepared: speechSync && speechSync.enabled === true,
      phase3AnimationMetadataBridge: speechSync && speechSync.phase3AnimationMetadataBridge === true,
      speechSyncFrontendReady: speechSync && speechSync.frontendReady === true,
      speechSyncContract: safeText(speechSync && speechSync.contract),
      visemeCount: Number(speechSync && speechSync.visemeCount || 0) || 0,
      estimatedSpeechDurationMs: Number(speechSync && speechSync.estimatedDurationMs || 0) || 0
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
      directMarionAdminInterface: adminInterface.directMarionAdminInterface,
      marionAdminConversationAllowed: adminInterface.marionAdminConversationAllowed,
      adminInterfaceScope: adminInterface.adminInterfaceScope,
      publicUsersCanAddressMarion: false,
      userIntentHint: env.userIntentHint,
      commandPhrase: env.commandPhrase || null,
      wakeWord: env.wakeWord || null,
      audioStored: false,
      noRawAudioStored: true,
      transcriptOnly: true,
      privateVoiceDelivery: deliveryMeta.privateVoiceDelivery,
      deliveryChannel: deliveryMeta.deliveryChannel
    },
    voiceReplyPromotion: {
      applied: fallbackUsed,
      source: originalReply ? 'bridge_or_composer' : 'gateway_safe_fallback',
      originalReplyPresent: Boolean(originalReply),
      rawOriginalReplyEchoSuppressed: originalReplyEchoSuppressed,
      protectedStatusIntent: isProtectedVoiceStatusIntent(env),
      finalEnvelopeOnly: stabilizer ? stabilizer.finalEnvelopeOnly === true : false,
      finalApproved: stabilizer ? stabilizer.finalApproved === true : false,
      duplicateSuppressed: stabilizer ? stabilizer.duplicateSuppressed === true : false,
      echoSuppressed: stabilizer ? stabilizer.echoSuppressed === true : false,
      stabilizerVersion: voiceDeliveryStabilizer && voiceDeliveryStabilizer.VERSION ? voiceDeliveryStabilizer.VERSION : '',
      speechSyncEnabled: speechSync && speechSync.enabled === true,
      speechSyncVersion: safeText(speechSync && speechSync.version),
      avatarAnimationEnabled: speechSync && speechSync.avatarAnimationEnabled === true,
      phase3AnimationMetadataBridge: speechSync && speechSync.phase3AnimationMetadataBridge === true
    },
    telemetry
  });
}

async function handleVoiceTranscript(input, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const telemetryEvents = [];
  const inputObj = input && typeof input === 'object' ? input : {};
  const optionAdminVoiceVerified =
    hasOptionAdminVoiceProof(opts.authorization || {}) ||
    hasOptionAdminVoiceProof(opts.output || {}) ||
    hasOptionAdminVoiceProof(opts);

  let envelope = createVoiceInputEnvelope(Object.assign({}, inputObj, {
    adminOnlyVoiceDelivery: true,
    serverSideAdminVoiceAuth: optionAdminVoiceVerified,
    trustedServerAuth: optionAdminVoiceVerified,
    adminVoiceVerified: optionAdminVoiceVerified,
    adminVoiceTokenVerified: optionAdminVoiceVerified,
    adminVoiceDeliveryAllowed: optionAdminVoiceVerified,
    directMarionAdminInterface: inputObj.directMarionAdminInterface === true || opts.directMarionAdminInterface === true || opts.allowMarionAdminConversation === true,
    marionAdminConversation: inputObj.marionAdminConversation === true || opts.marionAdminConversation === true || opts.allowMarionAdminConversation === true,
    adminInterfaceScope: safeText(inputObj.adminInterfaceScope || opts.adminInterfaceScope || ''),
    publicAgent: inputObj.publicAgent || (inputObj.directMarionAdminInterface === true ? 'Marion' : 'Nyx'),
    deliveryChannel: inputObj.deliveryChannel || opts.deliveryChannel || ''
  }));
  telemetryEvents.push(createVoiceTelemetryEvent('voice.envelope.created', envelope));

  const authOptions = Object.assign({
    adminOnlyVoiceDelivery: true,
    allowConversationalWhenUnknown: false,
    trustSpeakerHint: false,
    serverSideAdminVoiceAuth: optionAdminVoiceVerified,
    trustedServerAuth: optionAdminVoiceVerified,
    adminVoiceVerified: optionAdminVoiceVerified,
    adminVoiceTokenVerified: optionAdminVoiceVerified,
    adminVoiceDeliveryAllowed: optionAdminVoiceVerified,
    directMarionAdminInterface: inputObj.directMarionAdminInterface === true || opts.directMarionAdminInterface === true || opts.allowMarionAdminConversation === true,
    allowMarionAdminConversation: opts.allowMarionAdminConversation === true,
    adminInterfaceScope: safeText(inputObj.adminInterfaceScope || opts.adminInterfaceScope || ''),
    deliveryChannel: safeText(inputObj.deliveryChannel || opts.deliveryChannel || '')
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

    return makeNyxBoundaryResponse(withPolicy, envelope, telemetryEvents, outputPolicy, opts);
  }

  const normalizationResult = applyTranscriptNormalization(envelope, opts.normalization || opts);
  envelope = normalizationResult.envelope;
  telemetryEvents.push(createVoiceTelemetryEvent('voice.transcript.normalized', envelope, normalizationResult.normalization));

  const bridge = opts.bridge || loadMarionBridge();

  const deliveryMeta = voiceDeliveryMetaFromEnvelope(envelope, {});

  const directAdminInterface = isDirectMarionAdminInterface(envelope, opts);
  const bridgePublicAgent = resolveVoicePublicAgent(envelope, envelope.adminVoiceDeliveryAllowed === true, opts);
  const bridgeSource = resolveVoiceSource(envelope, opts);

  const bridgePayload = {
    input: envelope.transcript,
    text: envelope.transcript,
    userQuery: envelope.transcript,
    query: envelope.transcript,
    message: envelope.transcript,
    transcript: envelope.transcript,
    originalTranscript: envelope.originalTranscript || envelope.transcript,
    inputChannel: 'voice',
    source: bridgeSource,
    publicAgent: bridgePublicAgent,
    authority: 'Marion',
    directMarionAdminInterface: directAdminInterface,
    marionAdminConversation: directAdminInterface,
    adminInterfaceScope: directAdminInterface ? 'marion_admin_conversation' : '',
    publicUsersCanAddressMarion: false,
    locale: envelope.locale,
    confidence: envelope.confidence,
    authorizationState: envelope.authorizationState,
    adminOnlyVoiceDelivery: true,
    adminVoiceVerified: envelope.adminVoiceVerified === true,
    adminVoiceDeliveryAllowed: envelope.adminVoiceDeliveryAllowed === true,
    privateDelivery: envelope.privateDelivery === true,
    privateVoiceDelivery: envelope.privateVoiceDelivery === true,
    deliveryChannel: envelope.deliveryChannel || '',
    transcriptOnly: true,
    noRawAudioStored: true,
    voice: {
      envelope,
      wakeWord: envelope.wakeWord || null,
      commandPhrase: envelope.commandPhrase || null,
      source: bridgeSource,
      inputChannel: 'voice',
      publicAgent: bridgePublicAgent,
      directMarionAdminInterface: directAdminInterface,
      marionAdminConversation: directAdminInterface,
      adminInterfaceScope: directAdminInterface ? 'marion_admin_conversation' : '',
      publicUsersCanAddressMarion: false,
      audioStored: false,
      noRawAudioStored: true,
      transcriptOnly: true,
      privateVoiceDelivery: deliveryMeta.privateVoiceDelivery,
      adminOnlyVoiceDelivery: true,
      adminVoiceDeliveryAllowed: envelope.adminVoiceDeliveryAllowed === true
    }
  };

  const bridgeContext = Object.assign({}, opts.context || {}, {
    inputChannel: 'voice',
    source: bridgeSource,
    publicAgent: bridgePublicAgent,
    authority: 'Marion',
    directMarionAdminInterface: directAdminInterface,
    marionAdminConversation: directAdminInterface,
    adminInterfaceScope: directAdminInterface ? 'marion_admin_conversation' : '',
    publicUsersCanAddressMarion: false,
    sessionId: envelope.sessionId,
    requestId: envelope.requestId,
    adminOnlyVoiceDelivery: true,
    adminVoiceVerified: envelope.adminVoiceVerified === true,
    adminVoiceDeliveryAllowed: envelope.adminVoiceDeliveryAllowed === true,
    privateDelivery: envelope.privateDelivery === true,
    privateVoiceDelivery: envelope.privateVoiceDelivery === true,
    deliveryChannel: envelope.deliveryChannel || '',
    transcriptOnly: true,
    noRawAudioStored: true
  });

  let bridgeResponse;

  try {
    bridgeResponse = await callBridge(bridge, bridgePayload, bridgeContext);
    telemetryEvents.push(createVoiceTelemetryEvent('voice.marion.bridge.completed', envelope));
  } catch (error) {
    bridgeResponse = {
      ok: false,
      reply: 'Voice input reached the protected voice bridge, but the bridge failed during processing.',
      error: safeErrorCode(error)
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

  return makeNyxBoundaryResponse(withPolicy, envelope, telemetryEvents, outputPolicy, opts);
}


async function handleMarionAdminConversation(input, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const adminVerified =
    opts.adminVerified === true ||
    opts.adminVoiceVerified === true ||
    opts.adminVoiceTokenVerified === true ||
    opts.adminVoiceDeliveryAllowed === true ||
    opts.serverSideAdminVoiceAuth === true ||
    opts.trustedServerAuth === true ||
    hasOptionAdminVoiceProof(opts.authorization || {}) ||
    hasOptionAdminVoiceProof(opts.output || {});

  const payload = input && typeof input === 'object' ? input : { transcript: String(input || '') };
  const transcript = payload.transcript || payload.text || payload.message || payload.query || payload.input || '';

  const result = await handleVoiceTranscript(Object.assign({}, payload, {
    transcript,
    inputChannel: 'voice',
    source: 'marion-admin-interface',
    publicAgent: 'Marion',
    authority: 'Marion',
    directMarionAdminInterface: true,
    marionAdminConversation: true,
    adminInterfaceScope: 'marion_admin_conversation',
    privateDelivery: true,
    privateVoiceDelivery: true,
    deliveryChannel: 'marion_admin_interface',
    adminOnlyVoiceDelivery: true,
    publicUsersCanAddressMarion: false
  }), Object.assign({}, opts, {
    directMarionAdminInterface: true,
    allowMarionAdminConversation: true,
    adminInterfaceScope: 'marion_admin_conversation',
    deliveryChannel: 'marion_admin_interface',
    serverSideAdminVoiceAuth: adminVerified,
    trustedServerAuth: adminVerified,
    authorization: Object.assign({}, opts.authorization || {}, {
      adminOnlyVoiceDelivery: true,
      allowConversationalWhenUnknown: false,
      trustSpeakerHint: adminVerified,
      allowMarionAdminConversation: true,
      directMarionAdminInterface: true,
      adminInterfaceScope: 'marion_admin_conversation',
      deliveryChannel: 'marion_admin_interface',
      serverSideAdminVoiceAuth: adminVerified,
      trustedServerAuth: adminVerified,
      adminVoiceVerified: adminVerified,
      adminVoiceTokenVerified: adminVerified,
      adminVoiceDeliveryAllowed: adminVerified
    }),
    output: Object.assign({}, opts.output || {}, {
      adminOnlyVoiceDelivery: true,
      adminVoiceVerified: adminVerified,
      adminVoiceTokenVerified: adminVerified,
      adminVoiceDeliveryAllowed: adminVerified,
      directMarionAdminInterface: true,
      marionAdminConversation: true,
      adminInterfaceScope: 'marion_admin_conversation',
      deliveryChannel: 'marion_admin_interface',
      forceSilent: !adminVerified
    }),
    context: Object.assign({}, opts.context || {}, {
      inputChannel: 'voice',
      source: 'marion-admin-interface',
      publicAgent: 'Marion',
      authority: 'Marion',
      directMarionAdminInterface: true,
      marionAdminConversation: true,
      adminInterfaceScope: 'marion_admin_conversation',
      privateDelivery: true,
      privateVoiceDelivery: true,
      deliveryChannel: 'marion_admin_interface',
      adminOnlyVoiceDelivery: true,
      adminVoiceVerified: adminVerified,
      adminVoiceDeliveryAllowed: adminVerified,
      publicUsersCanAddressMarion: false
    })
  }));

  return Object.assign({}, result, {
    route: '/api/marion/admin/conversation',
    source: 'marion-admin-interface',
    publicAgent: adminVerified && result.ok !== false ? 'Marion' : 'Nyx',
    authority: 'Marion',
    directMarionAdminInterface: adminVerified && result.ok !== false,
    marionAdminConversationAllowed: adminVerified && result.ok !== false,
    adminInterfaceScope: 'marion_admin_conversation',
    publicUsersCanAddressMarion: false,
    privateDelivery: adminVerified && result.ok !== false,
    privateVoiceDelivery: true,
    deliveryChannel: 'marion_admin_interface',
    transcriptOnly: true,
    noRawAudioStored: true,
    audioStored: false,
    adminVoiceDeliveryAllowed: adminVerified && result.voice && result.voice.adminVoiceDeliveryAllowed === true
  });
}


async function handleLingoSentinelPrivateVoiceDelivery(input, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const adminVerified =
    opts.adminVerified === true ||
    opts.adminVoiceVerified === true ||
    opts.adminVoiceTokenVerified === true ||
    opts.adminVoiceDeliveryAllowed === true ||
    hasOptionAdminVoiceProof(opts.authorization || {}) ||
    hasOptionAdminVoiceProof(opts.output || {});

  const payload = input && typeof input === 'object' ? input : { transcript: String(input || '') };
  const transcript = payload.transcript || payload.text || payload.message || payload.query || payload.input || '';

  const result = await handleVoiceTranscript(Object.assign({}, payload, {
    transcript,
    inputChannel: 'voice',
    source: 'lingosentinel-private-admin-voice',
    publicAgent: 'Nyx',
    authority: 'Marion',
    privateDelivery: true,
    privateVoiceDelivery: true,
    deliveryChannel: 'lingosentinel_private_voice',
    adminOnlyVoiceDelivery: true
  }), Object.assign({}, opts, {
    serverSideAdminVoiceAuth: adminVerified,
    trustedServerAuth: adminVerified,
    authorization: Object.assign({}, opts.authorization || {}, {
      adminOnlyVoiceDelivery: true,
      allowConversationalWhenUnknown: false,
      trustSpeakerHint: adminVerified,
      serverSideAdminVoiceAuth: adminVerified,
      trustedServerAuth: adminVerified,
      adminVoiceVerified: adminVerified,
      adminVoiceTokenVerified: adminVerified,
      adminVoiceDeliveryAllowed: adminVerified
    }),
    output: Object.assign({}, opts.output || {}, {
      adminOnlyVoiceDelivery: true,
      adminVoiceVerified: adminVerified,
      adminVoiceTokenVerified: adminVerified,
      adminVoiceDeliveryAllowed: adminVerified,
      forceSilent: !adminVerified
    }),
    context: Object.assign({}, opts.context || {}, {
      inputChannel: 'voice',
      source: 'lingosentinel-private-admin-voice',
      publicAgent: 'Nyx',
      authority: 'Marion',
      privateDelivery: true,
      privateVoiceDelivery: true,
      deliveryChannel: 'lingosentinel_private_voice',
      adminOnlyVoiceDelivery: true,
      adminVoiceVerified: adminVerified,
      adminVoiceDeliveryAllowed: adminVerified
    })
  }));

  return Object.assign({}, result, {
    route: '/api/lingosentinel/private/marion/voice',
    source: 'lingosentinel-private-admin-voice',
    publicAgent: 'Nyx',
    authority: 'Marion',
    privateDelivery: adminVerified && result.ok !== false,
    privateVoiceDelivery: true,
    deliveryChannel: 'lingosentinel_private_voice',
    transcriptOnly: true,
    noRawAudioStored: true,
    audioStored: false,
    adminVoiceDeliveryAllowed: adminVerified && result.voice && result.voice.adminVoiceDeliveryAllowed === true
  });
}

module.exports = {
  VERSION,
  handleVoiceTranscript,
  handleMarionAdminConversation,
  handleLingoSentinelPrivateVoiceDelivery,
  makeNyxBoundaryResponse,
  isProtectedVoiceStatusIntent,
  isDirectMarionAdminInterface,
  resolveVoicePublicAgent,
  buildProtectedVoiceStatusReply,
  firstReplyText,
  loadMarionBridge,
  hasOptionAdminVoiceProof,
  isAdminVoiceDeliveryAllowed,
  voiceDeliveryStabilizer,
  speechSyncEnvelopeMod
};
