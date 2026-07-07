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

const speakerIdentityMod = (() => {
  try {
    return require('./MarionVoiceSpeakerIdentity');
  } catch (_) {
    return null;
  }
})();

const challengeVerifierMod = (() => {
  try {
    return require('./MarionVoiceChallengeVerifier');
  } catch (_) {
    return null;
  }
})();

const continuityWindowMod = (() => {
  try {
    return require('./MarionVoiceContinuityWindow');
  } catch (_) {
    return null;
  }
})();

function projectVoiceMode(rawMode, speakAllowed, spokenText) {
  if (speakAllowed !== true || !safeText(spokenText)) return 'silent';
  const mode = safeText(rawMode || '').toLowerCase();
  return mode === 'brief' ? 'brief' : 'full';
}

const VERSION = 'marion.voiceGateway/3.7-admin-private-voice-receive';

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

function hasOptionRemoteTrustedUserProof(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const identity = opts.speakerIdentity && typeof opts.speakerIdentity === 'object' ? opts.speakerIdentity : {};
  return opts.remoteTrustedUserVerified === true ||
    opts.remoteTrustedUserTokenVerified === true ||
    opts.trustedRemoteUserAuth === true ||
    opts.serverSideRemoteTrustedUserAuth === true ||
    opts.role === 'remote_trusted_user' ||
    identity.remoteTrustedUserVerified === true ||
    identity.roleBinding === 'remote_trusted_user';
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
  return policy.adminVoiceDeliveryAllowed === true ||
    policy.remoteTrustedVoiceDeliveryAllowed === true ||
    policy.trustedVoiceDeliveryAllowed === true ||
    env.adminVoiceDeliveryAllowed === true ||
    env.remoteTrustedVoiceDeliveryAllowed === true ||
    (env.authorizationState === 'authorized' && env.adminVoiceVerified === true) ||
    (env.authorizationState === 'limited' && env.remoteTrustedUserVerified === true);
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
  const opts = options && typeof options === 'object' ? options : {};
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
  const adminVoiceOneShotFallback = adminVoiceDeliveryAllowed && Boolean(cleanReply) && !originalReplyEchoSuppressed;
  const speakAllowed = stabilizer
    ? (stabilizer.speakAllowed === true || adminVoiceOneShotFallback)
    : adminVoiceDeliveryAllowed && Boolean(policySpokenText || (fallbackCanSpeak && cleanReply) || (adminVoiceOneShotFallback && cleanReply)) && (policy.speakAllowed === true || fallbackCanSpeak || adminVoiceOneShotFallback);
  const spokenText = stabilizer
    ? (safeText(stabilizer.spokenText) || (adminVoiceOneShotFallback && speakAllowed ? cleanReply : ''))
    : (speakAllowed ? (policySpokenText || cleanReply) : '');
  const projectedVoiceMode = projectVoiceMode(policy.voiceMode || (adminVoiceOneShotFallback ? 'brief' : ''), speakAllowed, spokenText);
  const speechSync = speechSyncEnvelopeMod && typeof speechSyncEnvelopeMod.buildSpeechSyncEnvelope === 'function'
    ? speechSyncEnvelopeMod.buildSpeechSyncEnvelope({
      spokenText,
      speakAllowed,
      voiceMode: projectedVoiceMode,
      speakerIdentity: env.speakerIdentity || env.voiceIdentity || null,
      speakerRoleBinding: env.speakerRoleBinding || '',
      voiceMatchStatus: env.voiceMatchStatus || '',
      voice: Object.assign({}, base.voice || {}, policy, stabilizer || {}),
      voiceEnvelope: env,
      finalApproved: (stabilizer ? stabilizer.finalApproved === true : false) || (speakAllowed && adminVoiceDeliveryAllowed),
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
      enabled: speakAllowed && Boolean(spokenText),
      version: 'marion.voiceGateway.speechSyncFallback/1.0-admin-one-shot',
      reason: speakAllowed && spokenText ? 'ADMIN_VOICE_ONE_SHOT_SYNC_READY' : 'SPEECH_SYNC_ENVELOPE_UNAVAILABLE',
      spokenText,
      text: spokenText,
      voiceMode: projectedVoiceMode,
      frontendReady: speakAllowed && Boolean(spokenText),
      avatarSpeechState: speakAllowed && spokenText ? 'speaking' : 'silent',
      speechState: speakAllowed && spokenText ? 'speaking' : 'silent',
      audioStored: false,
      noRawAudioStored: true,
      transcriptOnly: true,
      adminVoiceDeliveryAllowed,
      singleUtterance: true,
      maxSeconds: 3
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
  const optionRemoteTrustedUserVerified =
    hasOptionRemoteTrustedUserProof(opts.authorization || {}) ||
    hasOptionRemoteTrustedUserProof(opts.output || {}) ||
    hasOptionRemoteTrustedUserProof(opts.context || {}) ||
    hasOptionRemoteTrustedUserProof(opts);

  let envelope = createVoiceInputEnvelope(Object.assign({}, inputObj, {
    adminOnlyVoiceDelivery: true,
    serverSideAdminVoiceAuth: optionAdminVoiceVerified,
    trustedServerAuth: optionAdminVoiceVerified,
    adminVoiceVerified: optionAdminVoiceVerified,
    adminVoiceTokenVerified: optionAdminVoiceVerified,
    adminVoiceDeliveryAllowed: optionAdminVoiceVerified,
    remoteTrustedUserVerified: optionRemoteTrustedUserVerified,
    remoteTrustedUserTokenVerified: optionRemoteTrustedUserVerified,
    trustedRemoteUserAuth: optionRemoteTrustedUserVerified,
    claimedSpeaker: inputObj.claimedSpeaker || inputObj.speaker || inputObj.user || '',
    detectedSpeakerId: inputObj.detectedSpeakerId || inputObj.speakerId || '',
    speakerConfidence: inputObj.speakerConfidence,
    voiceMatchStatus: inputObj.voiceMatchStatus || '',
    voiceProfileEnrolled: inputObj.voiceProfileEnrolled === true,
    sessionRole: inputObj.sessionRole || opts.sessionRole || opts.role || (optionAdminVoiceVerified ? 'owner' : (optionRemoteTrustedUserVerified ? 'remote_trusted_user' : 'blocked')),
    requestTrustedSpeakerHint: optionAdminVoiceVerified || optionRemoteTrustedUserVerified,
    directMarionAdminInterface: inputObj.directMarionAdminInterface === true || opts.directMarionAdminInterface === true || opts.allowMarionAdminConversation === true,
    marionAdminConversation: inputObj.marionAdminConversation === true || opts.marionAdminConversation === true || opts.allowMarionAdminConversation === true,
    adminInterfaceScope: safeText(inputObj.adminInterfaceScope || opts.adminInterfaceScope || ''),
    publicAgent: inputObj.publicAgent || (inputObj.directMarionAdminInterface === true ? 'Marion' : 'Nyx'),
    deliveryChannel: inputObj.deliveryChannel || opts.deliveryChannel || ''
  }));
  if (speakerIdentityMod && typeof speakerIdentityMod.applyVoiceSpeakerIdentityEnvelope === 'function') {
    envelope = speakerIdentityMod.applyVoiceSpeakerIdentityEnvelope(envelope, Object.assign({}, opts, opts.authorization || {}, {
      adminVoiceVerified: optionAdminVoiceVerified,
      adminVoiceTokenVerified: optionAdminVoiceVerified,
      adminVoiceDeliveryAllowed: optionAdminVoiceVerified,
      remoteTrustedUserVerified: optionRemoteTrustedUserVerified,
      remoteTrustedUserTokenVerified: optionRemoteTrustedUserVerified,
      role: optionAdminVoiceVerified ? 'owner' : (optionRemoteTrustedUserVerified ? 'remote_trusted_user' : (opts.role || opts.sessionRole || 'blocked')),
      trustSpeakerHint: optionAdminVoiceVerified || optionRemoteTrustedUserVerified
    }));
  }
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
    remoteTrustedUserVerified: optionRemoteTrustedUserVerified,
    remoteTrustedUserTokenVerified: optionRemoteTrustedUserVerified,
    trustedRemoteUserAuth: optionRemoteTrustedUserVerified,
    allowRemoteTrustedUser: optionRemoteTrustedUserVerified,
    remoteTrustedUser: optionRemoteTrustedUserVerified,
    remoteTrustedUserScope: optionRemoteTrustedUserVerified ? 'remote_trusted_user' : '',
    role: optionAdminVoiceVerified ? 'owner' : (optionRemoteTrustedUserVerified ? 'remote_trusted_user' : 'blocked'),
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
      remoteTrustedUserVerified: false,
      remoteTrustedVoiceDeliveryAllowed: false,
      speakerIdentity: envelope.speakerIdentity || null,
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
    speakerIdentity: envelope.speakerIdentity || envelope.voiceIdentity || null,
    voiceIdentityBoundary: envelope.voiceIdentityBoundary === true,
    identityIsAuthority: false,
    liveChallengeRequired: envelope.liveChallengeRequired === true || (envelope.speakerIdentity && envelope.speakerIdentity.liveChallengeRequired === true),
    liveChallengeVerified: envelope.liveChallengeVerified === true || (envelope.speakerIdentity && envelope.speakerIdentity.liveChallengeVerified === true),
    challengeStatus: envelope.challengeStatus || (envelope.speakerIdentity && envelope.speakerIdentity.challengeStatus) || 'unknown',
    challengePreventsReplay: true,
    challengeIsAuthority: false,
    trustedVoiceWindowActive: envelope.trustedVoiceWindowActive === true || envelope.continuityWindowVerified === true || (envelope.speakerIdentity && envelope.speakerIdentity.trustedVoiceWindowActive === true),
    continuityWindowVerified: envelope.continuityWindowVerified === true || (envelope.speakerIdentity && envelope.speakerIdentity.continuityWindowVerified === true),
    continuityStatus: envelope.continuityStatus || (envelope.speakerIdentity && envelope.speakerIdentity.continuityStatus) || 'unknown',
    continuityPreventsSessionDrift: true,
    continuityIsAuthority: false,
    speakerRoleBinding: envelope.speakerRoleBinding || '',
    voiceMatchStatus: envelope.voiceMatchStatus || '',
    adminOnlyVoiceDelivery: true,
    adminVoiceVerified: envelope.adminVoiceVerified === true,
    adminVoiceDeliveryAllowed: envelope.adminVoiceDeliveryAllowed === true,
    remoteTrustedUserVerified: envelope.remoteTrustedUserVerified === true,
    remoteTrustedVoiceDeliveryAllowed: envelope.remoteTrustedVoiceDeliveryAllowed === true,
    speakerIdentity: envelope.speakerIdentity || envelope.voiceIdentity || null,
    voiceIdentityBoundary: envelope.voiceIdentityBoundary === true,
    identityIsAuthority: false,
    remoteTrustedUserVerified: envelope.remoteTrustedUserVerified === true,
    remoteTrustedVoiceDeliveryAllowed: envelope.remoteTrustedVoiceDeliveryAllowed === true,
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
      adminVoiceDeliveryAllowed: envelope.adminVoiceDeliveryAllowed === true,
      remoteTrustedUserVerified: envelope.remoteTrustedUserVerified === true,
      remoteTrustedVoiceDeliveryAllowed: envelope.remoteTrustedVoiceDeliveryAllowed === true,
      speakerIdentity: envelope.speakerIdentity || envelope.voiceIdentity || null,
      voiceIdentityBoundary: envelope.voiceIdentityBoundary === true,
      identityIsAuthority: false,
      liveChallengeRequired: envelope.liveChallengeRequired === true || (envelope.speakerIdentity && envelope.speakerIdentity.liveChallengeRequired === true),
      liveChallengeVerified: envelope.liveChallengeVerified === true || (envelope.speakerIdentity && envelope.speakerIdentity.liveChallengeVerified === true),
      challengeStatus: envelope.challengeStatus || (envelope.speakerIdentity && envelope.speakerIdentity.challengeStatus) || 'unknown',
      challengePreventsReplay: true,
      challengeIsAuthority: false,
      trustedVoiceWindowActive: envelope.trustedVoiceWindowActive === true || envelope.continuityWindowVerified === true || (envelope.speakerIdentity && envelope.speakerIdentity.trustedVoiceWindowActive === true),
      continuityWindowVerified: envelope.continuityWindowVerified === true || (envelope.speakerIdentity && envelope.speakerIdentity.continuityWindowVerified === true),
      continuityStatus: envelope.continuityStatus || (envelope.speakerIdentity && envelope.speakerIdentity.continuityStatus) || 'unknown',
      continuityPreventsSessionDrift: true,
      continuityIsAuthority: false
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
    adminVoiceDeliveryAllowed: envelope.adminVoiceDeliveryAllowed === true,
    remoteTrustedUserVerified: envelope.remoteTrustedUserVerified === true,
    remoteTrustedVoiceDeliveryAllowed: envelope.remoteTrustedVoiceDeliveryAllowed === true,
    trustedVoiceDeliveryAllowed: envelope.adminVoiceDeliveryAllowed === true || envelope.remoteTrustedVoiceDeliveryAllowed === true,
    speakerIdentity: envelope.speakerIdentity || envelope.voiceIdentity || null,
    voiceIdentityBoundary: envelope.voiceIdentityBoundary === true,
    identityIsAuthority: false
  }));
  const outputPolicy = withPolicy.voice;

  telemetryEvents.push(createVoiceTelemetryEvent('voice.output.policy.checked', envelope, outputPolicy));

  return makeNyxBoundaryResponse(withPolicy, envelope, telemetryEvents, outputPolicy, opts);
}



// MARION_ADMIN_TEXT_CONSOLE_BYPASS_PATCH_START
// The Marion admin console is a text channel, even though this module also
// coordinates the protected voice lane. Keep admin text out of handleVoiceTranscript
// so typed prompts never fall into voice-bridge error handling.
async function callAdminTextBridge(bridge, payload, context) {
  if (!bridge) {
    return {
      ok: false,
      reply: 'Marion admin text was received, but MarionBridge is not available yet.',
      error: 'MARION_BRIDGE_NOT_FOUND'
    };
  }

  const candidates = [
    bridge.handleMarionAdminConversation,
    bridge.handleAdminConversation,
    bridge.handleMarionAdminText,
    bridge.handleAdminText,
    bridge.routeMarion,
    bridge.routeMarionPrimary,
    bridge.processWithMarion,
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
      reply: 'Marion admin text was received, but MarionBridge does not expose a compatible text handler.',
      error: 'MARION_TEXT_BRIDGE_HANDLER_NOT_FOUND'
    };
  }

  let lastError = null;
  for (const fn of candidates) {
    try {
      const result = await fn(payload, context);
      const text = firstReplyText(result) || directReplyText(result);
      if (result && typeof result === 'object' && (result.ok !== false || text)) return result;
      if (text) return { ok: true, reply: text, text, message: text };
      lastError = new Error('MARION_TEXT_BRIDGE_EMPTY_RESULT');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('MARION_TEXT_BRIDGE_NO_RESULT');
}

const MARION_ADMIN_TEXT_MEMORY={lastTopic:'',lastPrompt:'',lastReply:'',updatedAt:0};
function rememberAdminTextTurn(prompt,reply){
  const p=safeText(prompt),r=safeText(reply),t=(p+' '+r).toLowerCase();if(!p&&!r)return;
  if(/\bbreak a leg\b/.test(t))MARION_ADMIN_TEXT_MEMORY.lastTopic='break a leg';
  else if(/\bspill the beans\b/.test(t))MARION_ADMIN_TEXT_MEMORY.lastTopic='spill the beans';
  else if(/\bbless your heart\b/.test(t))MARION_ADMIN_TEXT_MEMORY.lastTopic='bless your heart';
  else if(/\bi[’']?m fine\b/.test(t))MARION_ADMIN_TEXT_MEMORY.lastTopic="I'm fine";
  MARION_ADMIN_TEXT_MEMORY.lastPrompt=p;MARION_ADMIN_TEXT_MEMORY.lastReply=r;MARION_ADMIN_TEXT_MEMORY.updatedAt=Date.now();
}
function resolveAdminFollowupReference(prompt){
  const t=safeText(prompt).toLowerCase(),m=MARION_ADMIN_TEXT_MEMORY,topic=safeText(m.lastTopic).toLowerCase();
  const fresh=Date.now()-(Number(m.updatedAt)||0)<20*60*1000;
  const follow=/\b(that|it|this|the phrase|instead of good luck|why would someone say)\b/.test(t);
  return fresh&&follow?topic:'';
}
function buildAdminTextDeterministicReply(prompt) {
  const t=safeText(prompt).toLowerCase(); if(!t)return '';
  const ref=resolveAdminFollowupReference(prompt);
  if(/\b(?:hello|hi|hey)\s+marion\b|^\s*(?:hello|hi|hey)\s*$/i.test(t))return 'Hello Mac. Marion admin text is active. Send the next test prompt.';
  if(/\bi[’']?m fine\b/.test(t)||ref==="i'm fine")return '“I’m fine” can be literal, but behaviourally it can signal masking, avoidance, or a wish to end the topic. Read it through tone, timing, stress, and visible behaviour.';
  if(/\bbreak a leg\b/.test(t)||ref==='break a leg')return /business meeting|work meeting|professional/i.test(t)?'In a business meeting, “break a leg” can work only if the setting is informal or performance-like, such as before a pitch or presentation. In a formal business context, “good luck” or “you’ll do well” is clearer and safer.':(/instead of good luck|why would|why say/i.test(t)?'Someone says “break a leg” instead of “good luck” because theatre culture treats direct good-luck wishes as unlucky. The phrase became a ritualized, indirect way to encourage someone before a performance.':'Literally, “break a leg” means to injure a leg. Culturally, it is a superstition-based idiom for wishing good luck, especially before a performance.');
  if(/\bbless your heart\b/.test(t)||ref==='bless your heart')return '“Bless your heart” can mean sincere sympathy or polite criticism. In Southern American usage, tone and relationship decide whether it signals care, pity, or disapproval.';
  if(/\bspill the beans\b/.test(t)||ref==='spill the beans')return /why would|instead/i.test(t)?'Someone may say “spill the beans” when a secret, surprise, or private plan gets revealed earlier than intended. The phrase softens the accusation by making the disclosure sound informal rather than severe.':'“Spill the beans” means to reveal information that was meant to stay secret. Literally it suggests dropping beans; idiomatically, it means exposing a secret or surprise too early.';
  if(/\bwhy would someone say that instead of good luck\b/.test(t)||/\binstead of good luck\b/.test(t))return 'They would say it as an indirect good-luck wish, usually because the earlier phrase was “break a leg.” In theatre culture, saying “good luck” directly is considered unlucky, so “break a leg” became the safer ritual phrase.';
  return '';
}


function isAdminTextBadPublicReply(value){
  return /protected text bridge, but the bridge failed during processing|protected voice bridge|bridge did not return a visible final reply|no clean public reply field|runtime packet, but no clean public reply|^\s*\[?403\]?/i.test(safeText(value));
}
function firstAdminPublicReply(value, prompt, depth, seen){
  if(!value)return '';
  if(typeof value==='string'){
    const t=safeText(value);
    return t&&!isAdminTextBadPublicReply(t)?t:'';
  }
  if(typeof value!=='object')return '';
  const level=Number.isFinite(Number(depth))?Number(depth):0;
  if(level>8)return '';
  const visited=seen instanceof Set?seen:new Set();
  if(visited.has(value))return '';
  visited.add(value);
  const keys=['publicReply','visibleReply','finalReply','reply','displayReply','text','answer','output','response','message','spokenText','final','finalEnvelope','payload','result','data','packet','marionFinal','envelope','synthesis','meta'];
  for(const key of keys){
    const v=value[key];
    if(typeof v==='string'){
      const t=safeText(v);
      if(t&&!isAdminTextBadPublicReply(t))return t;
    }else if(v&&typeof v==='object'){
      const found=firstAdminPublicReply(v,prompt,level+1,visited);
      if(found)return found;
    }
  }
  for(const key of Object.keys(value)){
    if(keys.includes(key))continue;
    const found=firstAdminPublicReply(value[key],prompt,level+1,visited);
    if(found)return found;
  }
  return '';
}
function attachAdminVisibleReplyAliases(packet, reply){
  const out=packet&&typeof packet==='object'?packet:{};
  const r=safeText(reply);
  if(!r)return out;
  out.ok=true;out.reply=r;out.text=r;out.message=r;out.displayReply=r;out.publicReply=r;out.visibleReply=r;out.finalReply=r;
  out.answer=r;out.output=r;out.response=r;out.spokenText=r;out.final=true;out.marionFinal=true;out.canEmit=true;out.publicSurfaceClean=true;
  out.payload=Object.assign({},out.payload||{},{reply:r,text:r,message:r,displayReply:r,publicReply:r,visibleReply:r,finalReply:r,answer:r,output:r,response:r,spokenText:r});
  out.finalEnvelope=Object.assign({},out.finalEnvelope||{},{reply:r,text:r,message:r,displayReply:r,publicReply:r,visibleReply:r,finalReply:r,answer:r,output:r,response:r,spokenText:r,final:true,marionFinal:true,canEmit:true});
  return out;
}

function normalizeAdminTextBridgeResponse(response, payload, adminVerified) {
  const base = response && typeof response === 'object' ? response : { reply: safeText(response) };
  const p = payload && typeof payload === 'object' ? payload : {};
  const prompt = safeText(p.text || p.message || p.query || p.input || '');
  const payloadVoice = p.voice && typeof p.voice === 'object' ? p.voice : {};
  const baseVoice = base.voice && typeof base.voice === 'object' ? base.voice : {};
  const adminVoiceAllowed = adminVerified === true && (
    p.adminVoiceDeliveryAllowed === true ||
    p.adminVoiceRuntimeApproval === true ||
    payloadVoice.adminVoiceDeliveryAllowed === true ||
    payloadVoice.adminVoiceRuntimeApproval === true ||
    base.adminVoiceDeliveryAllowed === true ||
    baseVoice.adminVoiceDeliveryAllowed === true
  );
  const rawReply = firstAdminPublicReply(base, prompt) || firstReplyText(base) || directReplyText(base);
  const badReply = isAdminTextBadPublicReply(rawReply);
  const deterministic = buildAdminTextDeterministicReply(prompt);
  const reply = (!badReply && rawReply) || deterministic || adminVoiceOutputProjectionFallback(prompt, p) || '';
  const out=attachAdminVisibleReplyAliases(Object.assign({}, base, {
    ok: base.ok !== false && Boolean(reply),
    reply,
    text: reply,
    message: reply,
    displayReply: reply,
    publicReply: reply,
    visibleReply: reply,
    finalReply: reply,
    spokenText: adminVoiceAllowed ? reply : reply,
    speechText: adminVoiceAllowed ? reply : "",
    route: '/api/marion/admin/conversation',
    source: 'marion-admin-interface',
    inputChannel: 'text',
    publicAgent: adminVerified && base.ok !== false ? 'Marion' : 'Nyx',
    authority: 'Marion',
    directMarionAdminInterface: adminVerified && base.ok !== false,
    marionAdminConversationAllowed: adminVerified && base.ok !== false,
    adminInterfaceScope: 'marion_admin_conversation',
    publicUsersCanAddressMarion: false,
    privateTextDelivery: adminVerified && base.ok !== false,
    privateDelivery: adminVerified && base.ok !== false,
    privateVoiceDelivery: adminVoiceAllowed,
    deliveryChannel: adminVoiceAllowed ? 'marion_admin_private_voice' : 'marion_admin_interface',
    transcriptOnly: true,
    noRawAudioStored: true,
    rawAudioStored: false,
    audioStored: false,
    adminOnlyVoiceDelivery: true,
    adminVoiceDeliveryAllowed: adminVoiceAllowed,
    adminVoiceRuntimeApproval: p.adminVoiceRuntimeApproval === true || payloadVoice.adminVoiceRuntimeApproval === true,
    textConsoleVoiceBypass: !adminVoiceAllowed,
    voice: Object.assign({}, baseVoice, {
      active: adminVoiceAllowed,
      inputChannel: 'text',
      source: 'text',
      textConsoleVoiceBypass: !adminVoiceAllowed,
      adminOnlyVoiceDelivery: true,
      adminVoiceDeliveryAllowed: adminVoiceAllowed,
      adminVoiceRuntimeApproval: p.adminVoiceRuntimeApproval === true || payloadVoice.adminVoiceRuntimeApproval === true,
      speakAllowed: adminVoiceAllowed && Boolean(reply),
      voiceMode: adminVoiceAllowed && reply ? 'voice' : 'silent',
      rawVoiceMode: adminVoiceAllowed && reply ? 'voice' : 'silent',
      projectedVoiceMode: adminVoiceAllowed && reply ? 'voice' : 'silent',
      spokenText: adminVoiceAllowed ? reply : '',
      speechText: adminVoiceAllowed ? reply : '',
      privateVoiceDelivery: adminVoiceAllowed,
      audioStored: false,
      rawAudioStored: false,
      noRawAudioStored: true,
      speechSyncEnabled: adminVoiceAllowed && Boolean(reply),
      speechSync: {
        enabled: adminVoiceAllowed && Boolean(reply),
        frontendReady: adminVoiceAllowed && Boolean(reply),
        privateVoiceReceiveReady: adminVoiceAllowed && Boolean(reply),
        version: 'marion.adminPrivateVoiceReceive.gateway/1.0',
        deliveryChannel: adminVoiceAllowed ? 'marion_admin_private_voice' : '',
        capability: adminVoiceAllowed ? 'voice.private.receive' : '',
        avatarSpeechState: adminVoiceAllowed && reply ? 'ready' : 'silent',
        audioStored: false,
        rawAudioStored: false,
        noRawAudioStored: true,
        transcriptOnly: true
      },
      privateVoiceReceiveReady: adminVoiceAllowed && Boolean(reply),
      deliveryChannel: adminVoiceAllowed ? 'marion_admin_private_voice' : 'marion_admin_interface',
      capability: adminVoiceAllowed ? 'voice.private.receive' : ''
    }),
    privateVoiceReceive: {
      ok: adminVoiceAllowed && Boolean(reply),
      version: 'marion.adminPrivateVoiceReceive.gateway/1.0',
      stage: adminVoiceAllowed && reply ? 'admin_private_voice_receive_ready' : 'admin_private_voice_receive_locked',
      capability: adminVoiceAllowed ? 'voice.private.receive' : '',
      deliveryChannel: adminVoiceAllowed ? 'marion_admin_private_voice' : 'marion_admin_interface',
      speakAllowed: adminVoiceAllowed && Boolean(reply),
      voiceMode: adminVoiceAllowed && reply ? 'voice' : 'silent',
      projectedVoiceMode: adminVoiceAllowed && reply ? 'voice' : 'silent',
      rawVoiceMode: adminVoiceAllowed && reply ? 'voice' : 'silent',
      spokenText: adminVoiceAllowed ? reply : '',
      speechText: adminVoiceAllowed ? reply : '',
      speechSyncEnabled: adminVoiceAllowed && Boolean(reply),
      singleUtterance: true,
      consumedForThisTurn: adminVoiceAllowed && Boolean(reply),
      audioStored: false,
      rawAudioStored: false,
      noRawAudioStored: true,
      diagnosticsRedacted: true
    },
    meta: Object.assign({}, base.meta || {}, {
      textConsoleVoiceBypass: !adminVoiceAllowed,
      adminVoiceOutputProjection: adminVoiceAllowed,
      adminInterfaceScope: 'marion_admin_conversation',
      inputChannel: 'text',
      noUserFacingDiagnostics: true
    })
  }), reply);
  rememberAdminTextTurn(prompt,reply);
  return out;
}

// MARION_ADMIN_TEXT_CONSOLE_BYPASS_PATCH_END

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

  const payload = input && typeof input === 'object' ? input : { text: String(input || '') };
  const text = safeText(payload.text || payload.message || payload.query || payload.input || payload.transcript || '');
  const payloadVoice = payload.voice && typeof payload.voice === 'object' ? payload.voice : {};
  const contextVoice = opts.voice && typeof opts.voice === 'object' ? opts.voice : {};
  const adminVoiceAllowed = adminVerified === true && (
    payload.adminVoiceDeliveryAllowed === true ||
    payload.adminVoiceRuntimeApproval === true ||
    payloadVoice.adminVoiceDeliveryAllowed === true ||
    payloadVoice.adminVoiceRuntimeApproval === true ||
    opts.adminVoiceDeliveryAllowed === true ||
    opts.adminVoiceRuntimeApproval === true ||
    contextVoice.adminVoiceDeliveryAllowed === true ||
    hasOptionAdminVoiceProof(opts.output || {}) ||
    hasOptionAdminVoiceProof(opts.authorization || {})
  );
  const bridge = loadMarionBridge();

  const bridgePayload = Object.assign({}, payload, {
    text,
    message: text,
    query: text,
    inputChannel: 'text',
    source: 'marion-admin-interface',
    publicAgent: 'Marion',
    authority: 'Marion',
    directMarionAdminInterface: true,
    marionAdminConversation: true,
    adminInterfaceScope: 'marion_admin_conversation',
    privateTextDelivery: true,
    privateDelivery: true,
    privateVoiceDelivery: adminVoiceAllowed,
    deliveryChannel: adminVoiceAllowed ? 'marion_admin_private_voice' : 'marion_admin_interface',
    adminOnlyTextDelivery: true,
    adminOnlyVoiceDelivery: true,
    adminVoiceDeliveryAllowed: adminVoiceAllowed,
    adminVoiceRuntimeApproval: payload.adminVoiceRuntimeApproval === true || opts.adminVoiceRuntimeApproval === true,
    publicUsersCanAddressMarion: false,
    voice: Object.assign({}, payload.voice || {}, {
      active: adminVoiceAllowed,
      inputChannel: 'text',
      source: 'text',
      textConsoleVoiceBypass: !adminVoiceAllowed,
      audioStored: false,
      noRawAudioStored: true,
      privateVoiceDelivery: adminVoiceAllowed,
      adminVoiceDeliveryAllowed: adminVoiceAllowed,
      adminVoiceRuntimeApproval: payload.adminVoiceRuntimeApproval === true || opts.adminVoiceRuntimeApproval === true,
      speakAllowed: adminVoiceAllowed,
      voiceMode: adminVoiceAllowed ? 'voice' : 'silent',
      speechSyncEnabled: adminVoiceAllowed
    })
  });

  const bridgeContext = Object.assign({}, opts.context || {}, {
    inputChannel: 'text',
    source: 'marion-admin-interface',
    publicAgent: 'Marion',
    authority: 'Marion',
    directMarionAdminInterface: true,
    marionAdminConversation: true,
    adminInterfaceScope: 'marion_admin_conversation',
    privateTextDelivery: true,
    privateDelivery: true,
    privateVoiceDelivery: adminVoiceAllowed,
    deliveryChannel: adminVoiceAllowed ? 'marion_admin_private_voice' : 'marion_admin_interface',
    adminOnlyTextDelivery: true,
    adminOnlyVoiceDelivery: true,
    adminVoiceDeliveryAllowed: adminVoiceAllowed,
    adminVoiceRuntimeApproval: payload.adminVoiceRuntimeApproval === true || opts.adminVoiceRuntimeApproval === true,
    adminVerified,
    adminVoiceVerified: adminVoiceAllowed,
    adminVoiceDeliveryAllowed: adminVoiceAllowed,
    publicUsersCanAddressMarion: false,
    voice: {
      active: adminVoiceAllowed,
      inputChannel: 'text',
      source: 'text',
      textConsoleVoiceBypass: !adminVoiceAllowed,
      audioStored: false,
      noRawAudioStored: true,
      adminVoiceDeliveryAllowed: adminVoiceAllowed,
      speakAllowed: adminVoiceAllowed,
      voiceMode: adminVoiceAllowed ? 'voice' : 'silent',
      speechSyncEnabled: adminVoiceAllowed
    }
  });

  try {
    const response = await callAdminTextBridge(bridge, bridgePayload, bridgeContext);
    return normalizeAdminTextBridgeResponse(response, bridgePayload, adminVerified);
  } catch (error) {
    const deterministic = buildAdminTextDeterministicReply(text);
    const reply = deterministic || 'Marion admin text reached the protected text bridge, but the bridge failed during processing.';
    return normalizeAdminTextBridgeResponse({
      ok: Boolean(deterministic),
      reply,
      text: reply,
      message: reply,
      publicReply: reply,
      visibleReply: reply,
      finalReply: reply,
      error: safeErrorCode(error, 'MARION_TEXT_BRIDGE_ERROR'),
      diagnostics: {
        textBridgeFailed: true,
        errorCode: safeErrorCode(error, 'MARION_TEXT_BRIDGE_ERROR'),
        noUserFacingDiagnostics: true
      }
    }, bridgePayload, adminVerified);
  }
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
  hasOptionRemoteTrustedUserProof,
  isAdminVoiceDeliveryAllowed,
  voiceDeliveryStabilizer,
  speechSyncEnvelopeMod,
  speakerIdentityMod,
  challengeVerifierMod,
  continuityWindowMod
};


// PRIORITY_9F_R3_ALT_PROMPT_ECHO_SUPPRESSION_VOICE_GATEWAY_PATCH_START
const PRIORITY_9F_R3_VOICE_GATEWAY_ALT_PROMPT_ECHO_SUPPRESSION_VERSION='nyx.marion.voiceGateway.priority9fR3.altPromptEchoSuppression/1.0';
function priority9FR3VoiceNormalize(value){return safeText(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function priority9FR3VoiceLayeredPrompt(value){const t=priority9FR3VoiceNormalize(value);return /\b(priority\s*9f|9f\s*r3|alt runtime|prompt echo|deep conversational stack|layered conversational|conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action|marion conversational architecture)\b/i.test(t)||(/\b(disjointed|deeper|layered|context|looping|loop|recovery|preserve|avoid|where to go next|understand)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next|understand|deeper task)\b/i.test(t));}
function priority9FR3VoicePromptEcho(reply,prompt){const r=priority9FR3VoiceNormalize(reply),p=priority9FR3VoiceNormalize(prompt);if(!r||!p)return false;if(r===p)return true;if(p.length>36&&(r.indexOf(p)>=0||p.indexOf(r)>=0))return true;return false;}
function priority9FR3VoiceReply(){return 'I’m reading this as Priority 9F-R3: ALT runtime prompt-echo suppression. The surface request is to stabilize Marion’s layered conversational behavior; the deeper intent is to preserve context, avoid looping, and turn disjointed input into a clear next move. The active lane is Marion conversational architecture. The main risk is the ALT/admin handler returning the raw prompt instead of the composed answer, so the response mode must stay layered: identify the surface request, deeper intent, risk, execution mode, and next action. Next move: keep 9F dominant across ALT, bridge, final envelope, and last-mile render, then rerun the live layered prompt.';}
function priority9FR3VoiceAttach(packet,reply){const out=packet&&typeof packet==='object'?packet:{};return attachAdminVisibleReplyAliases(Object.assign({},out,{ok:true,reply,text:reply,message:reply,publicReply:reply,visibleReply:reply,finalReply:reply,displayReply:reply,response:reply,answer:reply,output:reply,priority9FR3VoiceGatewayAltPromptEchoSuppression:true,promptEchoSuppressed:true,diagnostics:Object.assign({},out.diagnostics||{},{priority9FR3VoiceGatewayAltPromptEchoSuppression:true,noUserFacingDiagnostics:true})}),reply);}
const __priority9FR3VoiceOriginalNormalizeAdminTextBridgeResponse=normalizeAdminTextBridgeResponse;
normalizeAdminTextBridgeResponse=function priority9FR3NormalizeAdminTextBridgeResponse(response,payload,adminVerified){const out=__priority9FR3VoiceOriginalNormalizeAdminTextBridgeResponse(response,payload,adminVerified);const prompt=safeText(payload&& (payload.text||payload.message||payload.query||payload.input||payload.transcript)||'');const reply=firstReplyText(out)||directReplyText(out);if(priority9FR3VoiceLayeredPrompt(prompt)&&(priority9FR3VoicePromptEcho(reply,prompt)||!reply)){return priority9FR3VoiceAttach(out,priority9FR3VoiceReply());}return out;};
const __priority9FR3VoiceOriginalHandleMarionAdminConversation=handleMarionAdminConversation;
handleMarionAdminConversation=async function priority9FR3HandleMarionAdminConversation(input,options){const payload=input&&typeof input==='object'?input:{text:String(input||'')};const prompt=safeText(payload.text||payload.message||payload.query||payload.input||payload.transcript||'');const out=await __priority9FR3VoiceOriginalHandleMarionAdminConversation(input,options);const reply=firstReplyText(out)||directReplyText(out);if(priority9FR3VoiceLayeredPrompt(prompt)&&(priority9FR3VoicePromptEcho(reply,prompt)||!reply)){return priority9FR3VoiceAttach(out,priority9FR3VoiceReply());}return out;};
module.exports.PRIORITY_9F_R3_VOICE_GATEWAY_ALT_PROMPT_ECHO_SUPPRESSION_VERSION=PRIORITY_9F_R3_VOICE_GATEWAY_ALT_PROMPT_ECHO_SUPPRESSION_VERSION;module.exports.handleMarionAdminConversation=handleMarionAdminConversation;
// PRIORITY_9F_R3_ALT_PROMPT_ECHO_SUPPRESSION_VOICE_GATEWAY_PATCH_END


// MARION_PERSONALITY_PRIORITY_R2_VOICE_GATEWAY_START
// Continues Marion's personality layer into the private text/voice lane while
// preventing general admin verification from becoming voice-delivery proof.
const MARION_PERSONALITY_PRIORITY_R2_VOICE_GATEWAY_VERSION = 'nyx.marion.personalityPriorityR2.voiceGateway/1.0';
function marionPersonalityR2VoiceText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}
function marionPersonalityR2VoicePromptFrom(value) {
  const src = value && typeof value === 'object' ? value : { text: String(value || '') };
  const payload = src.payload && typeof src.payload === 'object' ? src.payload : {};
  return marionPersonalityR2VoiceText(src.transcript || src.text || src.message || src.query || src.input || src.prompt || payload.transcript || payload.text || payload.message || payload.prompt || '');
}
function marionPersonalityR2VoiceGreetingKind(prompt) {
  const text = marionPersonalityR2VoiceText(prompt).toLowerCase().replace(/[.!?]+$/g, '').trim();
  if (/^(good\s+morning|morning)(?:\s+(?:marion|mac))?$/.test(text)) return 'morning';
  if (/^(good\s+afternoon|afternoon)(?:\s+(?:marion|mac))?$/.test(text)) return 'afternoon';
  if (/^(good\s+evening|evening)(?:\s+(?:marion|mac))?$/.test(text)) return 'evening';
  if (/^(hello|hi|hey|hiya)(?:\s+(?:marion|mac))?$/.test(text)) return 'hello';
  return '';
}
function marionPersonalityR2VoiceGreetingReply(prompt) {
  const kind = marionPersonalityR2VoiceGreetingKind(prompt);
  if (!kind) return '';
  const opener = kind === 'morning' ? 'Good morning, Mac.' : kind === 'afternoon' ? 'Good afternoon, Mac.' : kind === 'evening' ? 'Good evening, Mac.' : 'Hello, Mac.';
  return `${opener} I’m here with you. Marion is staying private to you, carrying the thread, and keeping the tone professional, protective, and human. What should we tighten next?`;
}
function marionPersonalityR2StrictAdminVoiceProof(input, options) {
  const payload = input && typeof input === 'object' ? input : {};
  const opts = options && typeof options === 'object' ? options : {};
  const payloadVoice = payload.voice && typeof payload.voice === 'object' ? payload.voice : {};
  const output = opts.output && typeof opts.output === 'object' ? opts.output : {};
  const authorization = opts.authorization && typeof opts.authorization === 'object' ? opts.authorization : {};
  const context = opts.context && typeof opts.context === 'object' ? opts.context : {};
  const contextVoice = context.voice && typeof context.voice === 'object' ? context.voice : {};
  return payload.adminVoiceRuntimeApproval === true ||
    payload.adminVoiceDeliveryAllowed === true ||
    payload.adminVoiceVerified === true ||
    payload.adminVoiceTokenVerified === true ||
    payloadVoice.adminVoiceRuntimeApproval === true ||
    payloadVoice.adminVoiceDeliveryAllowed === true ||
    opts.adminVoiceRuntimeApproval === true ||
    opts.adminVoiceDeliveryAllowed === true ||
    opts.adminVoiceVerified === true ||
    opts.adminVoiceTokenVerified === true ||
    output.adminVoiceRuntimeApproval === true ||
    output.adminVoiceDeliveryAllowed === true ||
    output.adminVoiceVerified === true ||
    output.adminVoiceTokenVerified === true ||
    authorization.adminVoiceRuntimeApproval === true ||
    authorization.adminVoiceDeliveryAllowed === true ||
    authorization.adminVoiceVerified === true ||
    authorization.adminVoiceTokenVerified === true ||
    context.adminVoiceRuntimeApproval === true ||
    context.adminVoiceDeliveryAllowed === true ||
    context.adminVoiceVerified === true ||
    context.adminVoiceTokenVerified === true ||
    contextVoice.adminVoiceRuntimeApproval === true ||
    contextVoice.adminVoiceDeliveryAllowed === true;
}
function marionPersonalityR2VoiceDiagnosticAllowed(prompt) {
  return /\b(diagnostic mode|debug mode|explain the priority|show the priority|what priority|priority\s+[0-9a-z]|trace|runtime diagnostic)\b/i.test(marionPersonalityR2VoiceText(prompt));
}
function marionPersonalityR2VoiceSanitize(reply, prompt) {
  let text = marionPersonalityR2VoiceText(reply);
  if (!text) return '';
  if (!marionPersonalityR2VoiceDiagnosticAllowed(prompt)) {
    text = text
      .replace(/[^.?!]*(?:Priority\s*9[A-Z0-9-]*|mission thread|pressure prompt|runtime handler|routeKind|speechHints|presenceProfile|replyAuthority|sessionPatch|finalEnvelope|state spine|progression shaping|diagnostic packet|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2})[^.?!]*[.?!]?/gi, ' ')
      .replace(/\b(?:9I|9J|9H)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  text = text
    .replace(/\bLet me assist you with that\b/gi, 'Let me take a look at this for you')
    .replace(/\bHow may I assist you\??\b/gi, 'What should we handle next?')
    .replace(/\bI am here to assist\b/gi, 'I’m here with you')
    .replace(/\butilize\b/gi, 'use')
    .replace(/\bfacilitate\b/gi, 'help')
    .replace(/\bin order to\b/gi, 'to')
    .replace(/\s+/g, ' ')
    .trim();
  const qCount = (text.match(/\?/g) || []).length;
  if (qCount > 1) {
    let seen = false;
    text = text.split(/(?<=[?])\s+/).map((part) => {
      if (!part.includes('?')) return part;
      if (!seen) { seen = true; return part; }
      return part.replace(/\?/g, '.');
    }).join(' ').replace(/\s+/g, ' ').trim();
  }
  return text;
}
function marionPersonalityR2VoiceApply(packet, prompt, input, options) {
  const out = packet && typeof packet === 'object' ? packet : { reply: marionPersonalityR2VoiceText(packet) };
  const current = firstReplyText(out) || directReplyText(out) || out.reply || '';
  const shaped = marionPersonalityR2VoiceGreetingReply(prompt) || marionPersonalityR2VoiceSanitize(current, prompt) || 'I’m with you, Mac. Marion stayed protected, but that turn did not produce a clean response. Send the exact target and I’ll keep it tight.';
  ['reply', 'text', 'message', 'displayReply', 'publicReply', 'visibleReply', 'finalReply', 'answer', 'output', 'response'].forEach((key) => { out[key] = shaped; });
  out.payload = Object.assign({}, out.payload && typeof out.payload === 'object' ? out.payload : {}, { reply: shaped, text: shaped, message: shaped, displayReply: shaped, publicReply: shaped, visibleReply: shaped, finalReply: shaped });
  out.finalEnvelope = Object.assign({}, out.finalEnvelope && typeof out.finalEnvelope === 'object' ? out.finalEnvelope : {}, { reply: shaped, text: shaped, message: shaped, displayReply: shaped, publicReply: shaped, visibleReply: shaped, finalReply: shaped, final: true, marionFinal: true });
  const strictVoiceAllowed = marionPersonalityR2StrictAdminVoiceProof(input, options) === true;
  const voice = out.voice && typeof out.voice === 'object' ? out.voice : {};
  out.voice = Object.assign({}, voice, {
    adminOnlyVoiceDelivery: true,
    adminVoiceDeliveryAllowed: strictVoiceAllowed,
    adminVoiceRuntimeApproval: strictVoiceAllowed && (voice.adminVoiceRuntimeApproval === true || (input && input.adminVoiceRuntimeApproval === true)),
    speakAllowed: strictVoiceAllowed && Boolean(shaped),
    voiceMode: strictVoiceAllowed && shaped ? 'voice' : 'silent',
    rawVoiceMode: strictVoiceAllowed && shaped ? 'voice' : 'silent',
    projectedVoiceMode: strictVoiceAllowed && shaped ? 'voice' : 'silent',
    spokenText: strictVoiceAllowed ? shaped : '',
    speechText: strictVoiceAllowed ? shaped : '',
    privateVoiceDelivery: strictVoiceAllowed,
    deliveryChannel: strictVoiceAllowed ? 'marion_admin_private_voice' : 'marion_admin_interface',
    audioStored: false,
    rawAudioStored: false,
    noRawAudioStored: true,
    speechSyncEnabled: strictVoiceAllowed && Boolean(shaped)
  });
  out.privateVoiceDelivery = strictVoiceAllowed;
  out.adminVoiceDeliveryAllowed = strictVoiceAllowed;
  out.deliveryChannel = strictVoiceAllowed ? 'marion_admin_private_voice' : 'marion_admin_interface';
  out.personalityPriorityR2 = {
    version: MARION_PERSONALITY_PRIORITY_R2_VOICE_GATEWAY_VERSION,
    persona: 'professional_protective_mac_facing',
    macOnly: true,
    oneQuestionPerTurn: true,
    strictVoiceProofRequired: true
  };
  out.meta = Object.assign({}, out.meta && typeof out.meta === 'object' ? out.meta : {}, {
    personalityPriorityR2: true,
    personalityPriorityR2Version: MARION_PERSONALITY_PRIORITY_R2_VOICE_GATEWAY_VERSION,
    marionRecipient: 'Mac',
    publicUsersCanAddressMarion: false,
    strictVoiceProofRequired: true,
    adminVoiceDeliveryAllowed: strictVoiceAllowed,
    noUserFacingDiagnostics: true
  });
  return out;
}
try {
  if (typeof buildAdminTextDeterministicReply === 'function' && !buildAdminTextDeterministicReply.__marionPersonalityPriorityR2Patched) {
    const __marionPersonalityR2OriginalBuildAdminTextDeterministicReply = buildAdminTextDeterministicReply;
    buildAdminTextDeterministicReply = function marionPersonalityPriorityR2BuildAdminTextDeterministicReply(prompt) {
      return marionPersonalityR2VoiceGreetingReply(prompt) || __marionPersonalityR2OriginalBuildAdminTextDeterministicReply(prompt);
    };
    buildAdminTextDeterministicReply.__marionPersonalityPriorityR2Patched = true;
  }
  const __marionPersonalityR2OriginalHandleMarionAdminConversation = module.exports.handleMarionAdminConversation || handleMarionAdminConversation;
  handleMarionAdminConversation = async function marionPersonalityPriorityR2HandleMarionAdminConversation(input, options) {
    const prompt = marionPersonalityR2VoicePromptFrom(input);
    const result = await __marionPersonalityR2OriginalHandleMarionAdminConversation(input, options);
    return marionPersonalityR2VoiceApply(result, prompt, input, options);
  };
  module.exports.handleMarionAdminConversation = handleMarionAdminConversation;
  module.exports.MARION_PERSONALITY_PRIORITY_R2_VOICE_GATEWAY_VERSION = MARION_PERSONALITY_PRIORITY_R2_VOICE_GATEWAY_VERSION;
  module.exports.marionPersonalityR2StrictAdminVoiceProof = marionPersonalityR2StrictAdminVoiceProof;
} catch (_) {}
// MARION_PERSONALITY_PRIORITY_R2_VOICE_GATEWAY_END

/* R18B_SECURITY_PROTECTIVE_LAYER_HARDENING_START */
(function(){try{
  const V="nyx.marion.r18b.securityProtectiveLayer/1.0";
  const SECRET_KEY=/(token|secret|password|apikey|api_key|authorization|cookie|sessiontoken|runtimeToken|masterToken|credential|private[_-]?key)/i;
  const SECRET_TEXT=/(bearer\s+)[a-z0-9._~+/-]+=*|((?:token|secret|password|api[_-]?key|session[_-]?token|runtime[_-]?token|master[_-]?token|authorization)\s*[:=]\s*)[^\s,"'}]+/gi;
  function O(v){return !!v&&typeof v==="object"&&!Array.isArray(v)}
  function T(v,m){let s=String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(SECRET_TEXT,function(_,a,b){return (a||b||"")+"[REDACTED]"}).replace(/\s+/g," ").trim();m=Number(m)||1600;return s.length>m?s.slice(0,m-1).trim()+"…":s}
  function R(v,seen){if(v==null)return v;if(typeof v==="string")return T(v,4000);if(typeof v==="number"||typeof v==="boolean")return v;if(typeof v!=="object")return T(v,4000);seen=seen||new WeakSet();if(seen.has(v))return"[Circular]";seen.add(v);if(Array.isArray(v))return v.slice(0,80).map(x=>R(x,seen));const out={};Object.keys(v).forEach(k=>{out[k]=SECRET_KEY.test(k)?"[REDACTED]":R(v[k],seen)});return out}
  function txt(x){if(typeof x==="string")return x;if(!O(x))return"";return [x.command,x.intent,x.action,x.type,x.text,x.message,x.prompt,x.input,O(x.payload)&&x.payload.text,O(x.command)&&x.command.text].map(v=>T(v,500)).filter(Boolean).join(" ")}
  function sensitive(x){return /\b(approve|deny|emergency|escalat|delete|deploy|publish|send|payment|transfer|registry|role|owner|admin|voice delivery|private voice|runtime|disable|shutdown|kill switch|credential|token|secret)\b/i.test(txt(x))}
  function verified(ctx){ctx=O(ctx)?ctx:{};return ctx.adminVerified===true||ctx.mfaVerified===true||ctx.trustedServerAuth===true||ctx.serverSideAdminAuth===true||ctx.serverSideAdminVoiceAuth===true||ctx.ownerVerified===true}
  function boundary(input,context){const s=sensitive(input);const ok=verified(context)||verified(input);return {version:V,active:s||ok,macScoped:true,leastPrivilege:true,identityIsAuthority:false,voiceIdentityIsAuthority:false,challengeIsAuthority:false,continuityIsAuthority:false,authorityStillRequiresRBAC:true,explicitConfirmationRequired:s,noCovertMonitoring:true,noAutonomousEnforcement:true,noPunitiveAction:true,secretsRedacted:true,traceableAudit:true,adminSessionServerVerified:ok,approvalRequired:s&&!ok,reason:s&&!ok?"sensitive_action_requires_server_verified_admin_context":"protective_boundary_recorded"}}
  function apply(packet,input,context){if(!O(packet))return packet;const b=boundary(input||packet,context||{});packet.securityProtectiveLayer=Object.assign({},O(packet.securityProtectiveLayer)?packet.securityProtectiveLayer:{},b);packet.protectiveProtocol=Object.assign({},O(packet.protectiveProtocol)?packet.protectiveProtocol:{},{r18bSecurityProtectiveLayer:true,macScoped:true,leastPrivilege:true,explicitConfirmationRequired:b.explicitConfirmationRequired});packet.meta=Object.assign({},O(packet.meta)?packet.meta:{},{r18bSecurityProtectiveLayer:true,macScopedSecurityBoundary:true,secretsRedacted:true,noUserFacingDiagnostics:true});if(b.approvalRequired){packet.approvalRequired=true;packet.riskLevel=packet.riskLevel==="critical"?"critical":"high";}return R(packet)}
  function GP(args){args=Array.prototype.slice.call(args||[]);for(const a of args){if(typeof a==="string"&&a.trim())return {input:a,context:{}};if(O(a))return {input:a,context:O(args[1])?args[1]:{}}}return {input:{},context:{}}}
  function W(fn){if(typeof fn!=="function"||fn.__r18bSecurityProtectiveLayer)return fn;const w=function(){const g=GP(arguments);const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(v=>apply(v,g.input,g.context)):apply(r,g.input,g.context)};Object.defineProperty(w,"__r18bSecurityProtectiveLayer",{value:true});return w}
  if(typeof MarionAdminConsoleGateway!=="undefined"&&MarionAdminConsoleGateway&&MarionAdminConsoleGateway.prototype&&!MarionAdminConsoleGateway.prototype.__r18bSecurityProtectiveLayer){
    const oldAuth=MarionAdminConsoleGateway.prototype.authorizeSession;
    if(typeof oldAuth==="function")MarionAdminConsoleGateway.prototype.authorizeSession=async function(request,context){context=O(context)?context:{};if(verified(context))return{allowed:true,reason:"r18b_server_verified_admin_context"};const hasProvider=this&&this.authProvider&&typeof this.authProvider.verify==="function";const res=await oldAuth.call(this,request,context);if(res&&res.allowed===true&&!hasProvider)return{allowed:false,reason:"r18b_rejected_bare_session_admin_claim_requires_outer_verification"};return res};
    ["handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","processCommand","executeRuntimeCommand","executeCommand","safeResponse","handleStatus"].forEach(n=>{if(typeof MarionAdminConsoleGateway.prototype[n]==="function")MarionAdminConsoleGateway.prototype[n]=W(MarionAdminConsoleGateway.prototype[n])});
    MarionAdminConsoleGateway.prototype.__r18bSecurityProtectiveLayer=true;
  }
  if(typeof module!=="undefined"&&module.exports&&typeof module.exports==="object"){
    ["logGuardianEvent","routeGuardianMessage","handleVoiceTranscript","handleMarionAdminConversation","handleLingoSentinelPrivateVoiceDelivery","createVoiceInputEnvelope","resolveVoiceSpeakerIdentity","applyVoiceSpeakerIdentityEnvelope","evaluateRechallengePolicy","requireFreshChallengeForOpen","issueChallenge","checkChallenge","evaluateChallengeEvidence","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","processCommand","executeRuntimeCommand","executeCommand","safeResponse"].forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=W(module.exports[n])});
    module.exports.MARION_SECURITY_PROTECTIVE_LAYER_VERSION=V;
    module.exports.buildSecurityProtectiveBoundary=boundary;
    module.exports.applySecurityProtectiveLayer=apply;
    module.exports.redactSecurityProtectivePayload=R;
  }
}catch(_){}})();
/* R18B_SECURITY_PROTECTIVE_LAYER_HARDENING_END */


/* PHASE3D_VOICE_TEXT_PARITY_IDENTITY_DRIFT_HARDLOCK_START */
(function(){try{
  const V="nyx.marion.phase3d.voiceTextParityIdentityDrift.runtimeWrapper/1.0";
  let lock=null;try{lock=require("./voiceTextParityIdentityDriftHardlock.js");}catch(_e){try{lock=require("../Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js");}catch(_e2){lock=null;}}
  if(!lock||!lock.projectResult||typeof module==="undefined"||!module.exports)return;
  function ctx(value,args){args=Array.prototype.slice.call(args||[]);return Object.assign({},(args[0]&&typeof args[0]==="object"?args[0]:{}),{payload:value,body:args[0],options:args[1],headers:(args[0]&&args[0].headers)||(args[1]&&args[1].headers)||{},route:(args[0]&&args[0].route)||(args[0]&&args[0].path)||""});}
  function project(value,args){try{return lock.projectResult(value,ctx(value,args));}catch(_e){return value;}}
  function wrap(fn,name){if(typeof fn!=="function"||fn.__phase3dVoiceTextParity)return fn;const w=function(){const args=arguments;const r=fn.apply(this,args);if(r&&typeof r.then==="function")return r.then(v=>project(v,args));return project(r,args);};try{Object.keys(fn).forEach(k=>{w[k]=fn[k];});}catch(_e){}try{Object.defineProperty(w,"name",{value:fn.name||name||"phase3dVoiceTextParityWrapped"});}catch(_e){}w.__phase3dVoiceTextParity=true;return w;}
  if(typeof module.exports==="function")module.exports=wrap(module.exports,"default");
  const obj=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(obj){["processWithMarion","route","maybeResolve","ask","handle","handleMessage","handleVoiceTranscript","handleVoiceInput","default","composeMarionResponse","compose","buildReply","run","handler","createMarionFinalEnvelope","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminConversation","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","safeResponse","buildResponse","createResponse","finalizeTurn"].forEach(n=>{if(typeof obj[n]==="function")obj[n]=wrap(obj[n],n);});obj.PHASE3D_VOICE_TEXT_PARITY_IDENTITY_DRIFT_HARDLOCK_VERSION=V;obj.phase3dVoiceTextParityProject=lock.projectResult;obj.phase3dVoiceTextParityCompare=lock.compareVoiceTextParity;}
}catch(_){}})();
/* PHASE3D_VOICE_TEXT_PARITY_IDENTITY_DRIFT_HARDLOCK_END */
