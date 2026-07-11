
'use strict';

/**
 * NyxSpeechSyncEnvelope
 * Phase 2 speech-sync envelope.
 *
 * Adds avatar-ready timing and viseme metadata after Marion has approved the
 * final spoken text. It never stores raw audio and does not decide authority.
 */

const crypto = require('crypto');

const visemeMapperMod = (() => {
  try {
    return require('./NyxVisemeMapper');
  } catch (_) {
    return null;
  }
})();

const { buildSpeechTiming } = require('./NyxSpeechTimingAdapter');

const avatarSpeechStateMod = (() => {
  try {
    return require('./NyxAvatarSpeechState');
  } catch (_) {
    return null;
  }
})();

function fallbackMapTextToVisemes(text, options) {
  const value = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const totalDurationMs = Math.max(0, Number(options && options.totalDurationMs) || 0);
  const words = value ? value.split(/\s+/).slice(0, 120) : [];
  const frameMs = words.length ? Math.max(80, Math.round(totalDurationMs / Math.max(1, words.length))) : 0;
  let cursor = 0;
  const visemes = words.map((word, index) => {
    const end = index === words.length - 1 ? totalDurationMs : Math.min(totalDurationMs, cursor + frameMs);
    const item = {
      index,
      token: word.slice(0, 48),
      viseme: /[bmp]/i.test(word) ? 'closed' : /[aeiou]/i.test(word) ? 'open' : 'neutral',
      startMs: cursor,
      endMs: end,
      durationMs: Math.max(0, end - cursor)
    };
    cursor = end;
    return item;
  });
  return {
    source: 'NyxSpeechSyncEnvelope.fallbackVisemeMapper',
    visemes,
    count: visemes.length,
    frameMs,
    timingAligned: true,
    noRawAudioStored: true
  };
}

function fallbackBuildAvatarSpeechState(input) {
  const src = input && typeof input === 'object' ? input : {};
  const speakAllowed = src.speakAllowed === true;
  const duration = Math.max(0, Number(src.estimatedDurationMs) || 0);
  return {
    source: 'NyxSpeechSyncEnvelope.fallbackAvatarSpeechState',
    speakAllowed,
    speechState: speakAllowed ? 'speaking' : 'silent',
    mouthState: speakAllowed ? 'active' : 'closed',
    avatarState: speakAllowed ? 'speech_ready' : 'speech_disabled',
    estimatedDurationMs: duration,
    visemeCount: Math.max(0, Number(src.visemeCount) || 0),
    reducedMotion: src.reducedMotion === true,
    noRawAudioStored: true
  };
}

const mapTextToVisemes = visemeMapperMod && typeof visemeMapperMod.mapTextToVisemes === 'function'
  ? visemeMapperMod.mapTextToVisemes
  : fallbackMapTextToVisemes;

const buildAvatarSpeechState = avatarSpeechStateMod && typeof avatarSpeechStateMod.buildAvatarSpeechState === 'function'
  ? avatarSpeechStateMod.buildAvatarSpeechState
  : fallbackBuildAvatarSpeechState;

const expressionController = (() => {
  try {
    return require('./NyxAvatarExpressionController');
  } catch (_) {
    return null;
  }
})();

const emotionMotionBridge = (() => {
  try {
    return require('./NyxEmotionMotionBridge');
  } catch (_) {
    return null;
  }
})();

const animationEngineAdapter = (() => {
  try {
    return require('./NyxAnimationEngineAdapter');
  } catch (_) {
    return null;
  }
})();

const motionTelemetryMod = (() => {
  try {
    return require('./NyxAvatarMotionTelemetry');
  } catch (_) {
    return null;
  }
})();

const VERSION = 'nyx.speechSyncEnvelope/1.4-admin-private-voice-receive';
const SPEECH_SYNC_CONTRACT = 'nyx.avatar.speechSync/1.0';

function safeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function safeObj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hashText(value) {
  const text = safeText(value);
  if (!text) return '';
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 24);
}

function normalizeVoiceMode(value, speakAllowed, spokenText) {
  if (speakAllowed !== true || !safeText(spokenText)) return 'silent';
  return safeText(value).toLowerCase() === 'brief' ? 'brief' : 'full';
}

function hasRawAudioInput(src) {
  const source = safeObj(src);
  return source.rawAudio != null || source.audio != null || source.audioBlob != null || source.blob != null || source.buffer != null;
}

function disabledSpeechSync(reason) {
  const disabledAvatar = buildAvatarSpeechState({ speakAllowed: false });
  return {
    version: VERSION,
    contract: SPEECH_SYNC_CONTRACT,
    enabled: false,
    frontendReady: false,
    reason: safeText(reason || 'SPEECH_SYNC_DISABLED'),
    audioStored: false,
    noRawAudioStored: true,
    transcriptOnly: true,
    visemes: [],
    visemeCount: 0,
    timing: null,
    mouthTimeline: [],
    avatar: disabledAvatar,
    expression: null,
    motion: null,
    animation: null,
    avatarAnimation: null,
    avatarExpression: '',
    avatarMotionTelemetry: null,
    avatarAnimationEnabled: false,
    phase3AnimationMetadataBridge: false,
    dependencyFallback: visemeMapperMod == null || avatarSpeechStateMod == null,
    speakerIdentityBoundary: true,
    voiceIdentityIsAuthority: false,
    speakerRoleBinding: 'blocked',
    voiceMatchStatus: 'unknown'
  };
}

function buildPhase3AvatarMetadata(input) {
  const src = safeObj(input);
  const spokenText = safeText(src.spokenText);
  const timing = safeObj(src.timing);
  const avatar = safeObj(src.avatar);
  const visemes = Array.isArray(src.visemes) ? src.visemes : [];
  const reducedMotion = src.reducedMotion === true || avatar.reducedMotion === true;

  const expression = expressionController && typeof expressionController.buildNyxAvatarExpression === 'function'
    ? expressionController.buildNyxAvatarExpression({
      spokenText,
      speakAllowed: src.speakAllowed === true,
      finalApproved: src.finalApproved === true,
      adminVoiceDeliveryAllowed: src.adminVoiceDeliveryAllowed === true,
      expressionHint: src.expressionHint,
      intentHint: src.intentHint,
      userIntentHint: src.userIntentHint,
      commandPhrase: src.commandPhrase,
      intensity: src.intensity,
      reducedMotion
    })
    : null;

  const motion = emotionMotionBridge && typeof emotionMotionBridge.buildNyxEmotionMotion === 'function'
    ? emotionMotionBridge.buildNyxEmotionMotion({
      enabled: src.speakAllowed === true,
      expression,
      timing,
      visemes,
      avatar,
      intensity: src.intensity,
      reducedMotion
    })
    : null;

  const animation = animationEngineAdapter && typeof animationEngineAdapter.buildNyxAnimationEnginePacket === 'function'
    ? animationEngineAdapter.buildNyxAnimationEnginePacket({
      enabled: src.speakAllowed === true,
      engine: src.animationEngine || 'custom_dom',
      expression,
      motion,
      timing,
      avatar,
      visemes
    })
    : null;

  const avatarMotionTelemetry = motionTelemetryMod && typeof motionTelemetryMod.createNyxAvatarMotionTelemetry === 'function'
    ? motionTelemetryMod.createNyxAvatarMotionTelemetry({
      enabled: src.speakAllowed === true,
      spokenText,
      expression,
      motion,
      animation,
      timing,
      visemeCount: visemes.length
    })
    : null;

  const phase3Ready = Boolean(expression && motion && animation && expression.frontendReady === true && motion.frontendReady === true && animation.frontendReady === true);
  const avatarV3 = Object.assign({}, avatar, {
    phase: 'phase3b_animation_metadata_bridge',
    animationEnabled: phase3Ready,
    engine: animation ? safeText(animation.engine || 'custom_dom') : 'custom_dom',
    expression: expression ? safeText(expression.expression || '') : '',
    expressionState: expression ? safeText(expression.expressionState || expression.expression || '') : '',
    motionProfile: motion ? motion.motionProfile : null,
    animation: animation || null,
    motion: motion || null,
    reducedMotionSafe: true
  });

  return {
    expression,
    motion,
    animation,
    avatarMotionTelemetry,
    avatar: avatarV3,
    phase3Ready
  };
}


function buildSpeechSyncEnvelope(input) {
  const src = safeObj(input);
  const speakerIdentity = safeObj(src.speakerIdentity || src.voiceIdentity || (safeObj(src.voice).speakerIdentity));
  const voice = safeObj(src.voice);
  const voiceEnvelope = safeObj(src.voiceEnvelope);
  const spokenText = safeText(src.spokenText || voice.spokenText || src.text || '');
  const speakAllowed = src.speakAllowed === true || voice.speakAllowed === true;
  const finalApproved = src.finalApproved === true || voice.finalApproved === true || voice.finalEnvelopeOnly === true;
  const adminVoiceDeliveryAllowed = src.adminVoiceDeliveryAllowed === true || voice.adminVoiceDeliveryAllowed === true || voiceEnvelope.adminVoiceDeliveryAllowed === true;
  const expressionHint = safeText(src.expressionHint || voice.expressionHint || voiceEnvelope.expressionHint || '');
  const intentHint = safeText(src.intentHint || voice.intentHint || voiceEnvelope.userIntentHint || '');
  const commandPhrase = safeText(src.commandPhrase || voice.commandPhrase || voiceEnvelope.commandPhrase || '');

  if (hasRawAudioInput(src) || hasRawAudioInput(voice) || hasRawAudioInput(voiceEnvelope)) return disabledSpeechSync('RAW_AUDIO_INPUT_REJECTED');
  if (!speakAllowed) return disabledSpeechSync('SPEAK_NOT_ALLOWED');
  if (!spokenText) return disabledSpeechSync('SPOKEN_TEXT_EMPTY');
  if (!adminVoiceDeliveryAllowed) return disabledSpeechSync('ADMIN_VOICE_REQUIRED');
  if (!finalApproved) return disabledSpeechSync('MARION_FINAL_REQUIRED');

  const timing = buildSpeechTiming(spokenText, src.timing || {});
  const mapped = mapTextToVisemes(spokenText, Object.assign({}, src.viseme || {}, {
    totalDurationMs: timing.estimatedDurationMs
  }));
  const avatar = buildAvatarSpeechState({
    speakAllowed: true,
    spokenText,
    estimatedDurationMs: timing.estimatedDurationMs,
    visemeCount: mapped.count,
    intensity: src.intensity,
    reducedMotion: src.reducedMotion === true
  });
  const voiceMode = normalizeVoiceMode(src.voiceMode || voice.voiceMode || 'full', true, spokenText);
  const phase3 = buildPhase3AvatarMetadata({
    spokenText,
    speakAllowed: true,
    finalApproved: true,
    adminVoiceDeliveryAllowed,
    timing,
    visemes: mapped.visemes,
    avatar,
    expressionHint,
    intentHint,
    commandPhrase,
    intensity: src.intensity,
    reducedMotion: src.reducedMotion === true,
    animationEngine: src.animationEngine || voice.animationEngine || 'custom_dom'
  });

  return {
    version: VERSION,
    contract: SPEECH_SYNC_CONTRACT,
    enabled: true,
    frontendReady: true,
    source: 'NyxSpeechSyncEnvelope',
    dependencyFallback: visemeMapperMod == null || avatarSpeechStateMod == null,
    authority: 'Marion',
    publicAgent: adminVoiceDeliveryAllowed ? 'Marion' : 'Nyx',
    finalApproved: true,
    speakAllowed: true,
    privateVoiceReceiveReady: adminVoiceDeliveryAllowed === true,
    privateVoiceDelivery: adminVoiceDeliveryAllowed === true,
    adminOnlyVoiceDelivery: adminVoiceDeliveryAllowed === true,
    adminVoiceDeliveryAllowed: adminVoiceDeliveryAllowed === true,
    deliveryChannel: adminVoiceDeliveryAllowed ? 'marion_admin_private_voice' : '',
    capability: adminVoiceDeliveryAllowed ? 'voice.private.receive' : '',
    voiceMode,
    text: spokenText,
    textHash: hashText(spokenText),
    locale: safeText(voiceEnvelope.locale || src.locale || 'en-CA'),
    estimatedDurationMs: timing.estimatedDurationMs,
    totalAnimationWindowMs: timing.totalAnimationWindowMs,
    animationClock: {
      leadInMs: timing.leadInMs,
      speechStartMs: timing.leadInMs,
      speechEndMs: timing.leadInMs + timing.estimatedDurationMs,
      settleEndMs: timing.totalAnimationWindowMs
    },
    timing,
    visemes: mapped.visemes,
    mouthTimeline: mapped.visemes,
    visemeCount: mapped.count,
    visemeFrameMs: mapped.frameMs,
    timingAligned: mapped.timingAligned === true,
    mouthState: phase3.avatar.mouthState,
    speechState: phase3.avatar.speechState,
    avatarSpeechState: phase3.avatar.avatarState,
    avatar: phase3.avatar,
    expression: phase3.expression,
    motion: phase3.motion,
    animation: phase3.animation,
    avatarAnimation: phase3.animation,
    avatarExpression: phase3.expression ? safeText(phase3.expression.expression || '') : '',
    avatarMotionTelemetry: phase3.avatarMotionTelemetry,
    avatarAnimationEnabled: phase3.phase3Ready,
    phase3AnimationMetadataBridge: phase3.phase3Ready,
    phase2SpeechSyncCompatible: true,
    transcriptOnly: true,
    noRawAudioStored: true,
    audioStored: false,
    rawAudioStored: false,
    diagnosticsRedacted: true,
    privateControlPlane: adminVoiceDeliveryAllowed === true,
    audioStored: false,
    phase: 'phase3b_animation_metadata_bridge'
  };
}

module.exports = {
  VERSION,
  SPEECH_SYNC_CONTRACT,
  buildSpeechSyncEnvelope,
  buildPhase3AvatarMetadata,
  disabledSpeechSync,
  normalizeVoiceMode
};


/* PHASE3D_SPOKENTEXT_PARITY_HARDLOCK_START */
(function(){try{
  const V="nyx.marion.phase3d.spokenTextParityWrapper/1.0";let lock=null;try{lock=require("./voiceTextParityIdentityDriftHardlock.js");}catch(_){lock=null;}
  if(!lock||!lock.projectSpeechSyncEnvelope||typeof module==="undefined"||!module.exports)return;
  const orig=module.exports.buildSpeechSyncEnvelope;
  if(typeof orig==="function"&&!orig.__phase3dSpokenTextParity){
    module.exports.buildSpeechSyncEnvelope=function(){const args=arguments;const r=orig.apply(this,args);const project=v=>lock.projectSpeechSyncEnvelope(v,{body:args[0],options:args[1],inputChannel:"voice",voice:true});return r&&typeof r.then==="function"?r.then(project):project(r);};
    module.exports.buildSpeechSyncEnvelope.__phase3dSpokenTextParity=true;
  }
  module.exports.PHASE3D_SPOKENTEXT_PARITY_HARDLOCK_VERSION=V;
}catch(_){}})();
/* PHASE3D_SPOKENTEXT_PARITY_HARDLOCK_END */
