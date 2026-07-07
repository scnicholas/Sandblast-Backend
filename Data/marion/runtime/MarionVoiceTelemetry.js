'use strict';

/**
 * MarionVoiceTelemetry
 * Lightweight telemetry for the Marion voice lane.
 * Does not store raw audio or admin tokens.
 */

const VERSION = 'marion.voiceTelemetry/2.6-phase6-challenge-verification';

function safeLength(value) {
  return String(value || '').length;
}

function createVoiceTelemetryEvent(type, envelope, detail) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const meta = env.rawMeta && typeof env.rawMeta === 'object' ? env.rawMeta : {};
  const speakerIdentity = env.speakerIdentity && typeof env.speakerIdentity === 'object' ? env.speakerIdentity : {};

  return {
    type: type || 'voice.event',
    at: new Date().toISOString(),
    version: VERSION,
    inputChannel: 'voice',
    source: 'voice',
    authority: 'Marion',
    publicAgent: 'Nyx',
    sessionId: env.sessionId || null,
    requestId: env.requestId || null,
    locale: env.locale || null,
    confidence: typeof env.confidence === 'number' ? env.confidence : null,
    authorizationState: env.authorizationState || 'unknown',
    adminOnlyVoiceDelivery: env.adminOnlyVoiceDelivery !== false,
    adminVoiceVerified: env.adminVoiceVerified === true,
    adminVoiceDeliveryAllowed: env.adminVoiceDeliveryAllowed === true,
    remoteTrustedUserVerified: env.remoteTrustedUserVerified === true || speakerIdentity.remoteTrustedUserVerified === true,
    remoteTrustedVoiceDeliveryAllowed: env.remoteTrustedVoiceDeliveryAllowed === true,
    speakerIdentityBoundary: env.voiceIdentityBoundary === true || speakerIdentity.voiceIdentityBoundary === true,
    voiceIdentityIsAuthority: false,
    speakerHintPresent: !!env.speakerHint,
    claimedSpeakerPresent: !!(env.claimedSpeaker || speakerIdentity.claimedSpeaker),
    detectedSpeakerIdPresent: !!(env.detectedSpeakerId || speakerIdentity.detectedSpeakerId),
    speakerConfidence: typeof speakerIdentity.speakerConfidence === 'number' ? speakerIdentity.speakerConfidence : (typeof env.speakerConfidence === 'number' ? env.speakerConfidence : null),
    speakerConfidenceBand: speakerIdentity.speakerConfidenceBand || env.speakerConfidenceBand || 'unknown',
    voiceMatchStatus: speakerIdentity.voiceMatchStatus || env.voiceMatchStatus || 'unknown',
    speakerRoleBinding: speakerIdentity.roleBinding || env.speakerRoleBinding || 'blocked',
    speakerRegistryAvailable: speakerIdentity.speakerRegistryAvailable === true || env.speakerRegistryAvailable === true,
    speakerRegistryMatched: speakerIdentity.speakerRegistryMatched === true || env.speakerRegistryMatched === true,
    speakerRegistryStatus: speakerIdentity.speakerRegistryStatus || env.speakerRegistryStatus || 'unknown',
    speakerRegistryBlocked: speakerIdentity.speakerRegistryBlocked === true || env.speakerRegistryBlocked === true,
    profileMetadataOnly: true,
    voiceprintStored: false,
    liveChallengeRequired: speakerIdentity.liveChallengeRequired === true || env.liveChallengeRequired === true,
    liveChallengeVerified: speakerIdentity.liveChallengeVerified === true || env.liveChallengeVerified === true,
    challengeStatus: speakerIdentity.challengeStatus || env.challengeStatus || 'unknown',
    challengeBlocked: speakerIdentity.challengeBlocked === true || env.challengeBlocked === true,
    challengePreventsReplay: true,
    challengeIsAuthority: false,
    privateAdminConversation: env.privateAdminConversation === true || env.adminConversation === true,
    adminConversationAllowed: env.adminConversationAllowed === true || env.privateAdminConversation === true,
    directMarionConversation: env.directMarionConversation === true || env.privateAdminConversation === true,
    lingoSentinelSilentOversight: env.lingoSentinelSilentOversight === true || env.silentOversight === true,
    userToUserBoundary: env.userToUserBoundary === true,
    marionVisibleParticipant: env.marionVisibleParticipant === false ? false : null,
    userIntentHint: env.userIntentHint || null,
    transcriptLength: safeLength(env.transcript),
    originalTranscriptLength: safeLength(env.originalTranscript || env.transcript),
    provider: meta.provider || 'browser-native',
    audioStored: false,
    speechSyncEnabled: detail && typeof detail === 'object' && detail.speechSyncEnabled === true,
    speechSyncVersion: detail && typeof detail === 'object' ? sanitizeSensitiveString(detail.speechSyncVersion || '') : '',
    detail: sanitizeTelemetryDetail(detail)
  };
}

function sanitizeSensitiveString(value) {
  const text = String(value || '');
  if (!text) return text;
  if (/token|secret|password|cookie|authorization|api[_-]?key|x-sb-/i.test(text)) {
    return '[redacted]';
  }
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

function sanitizeTelemetryDetail(detail) {
  if (!detail || typeof detail !== 'object') {
    return typeof detail === 'string' ? sanitizeSensitiveString(detail) : (detail || null);
  }

  const blockedKeys = new Set([
    'rawAudio',
    'audio',
    'blob',
    'buffer',
    'password',
    'secret',
    'token',
    'apiKey',
    'api_key',
    'adminVoiceToken',
    'admin_voice_token',
    'authorization',
    'cookie'
  ]);

  const out = {};

  Object.keys(detail).forEach((key) => {
    const normalizedKey = String(key || '').replace(/[^a-z0-9_]+/gi, '').toLowerCase();
    if (blockedKeys.has(key) || blockedKeys.has(normalizedKey)) return;
    if (/token|secret|password|cookie|authorization|api[_-]?key|rawaudio|buffer|blob/i.test(key)) return;

    const value = detail[key];

    if (typeof value === 'string') {
      out[key] = sanitizeSensitiveString(value);
      return;
    }

    if (value && typeof value === 'object') {
      const nested = {};
      Object.keys(value).slice(0, 12).forEach((nestedKey) => {
        if (/token|secret|password|cookie|authorization|api[_-]?key|rawaudio|audio|buffer|blob/i.test(nestedKey)) return;
        const nestedValue = value[nestedKey];
        if (typeof nestedValue === 'string') nested[nestedKey] = sanitizeSensitiveString(nestedValue);
        else if (typeof nestedValue === 'number' || typeof nestedValue === 'boolean' || nestedValue == null) nested[nestedKey] = nestedValue;
        else nested[nestedKey] = '[object]';
      });
      out[key] = nested;
      return;
    }

    out[key] = value;
  });

  return out;
}


function createVoiceSpeechSyncTelemetryEvent(speechSync, envelope) {
  const sync = speechSync && typeof speechSync === 'object' ? speechSync : {};
  return createVoiceTelemetryEvent('voice.speech_sync.prepared', envelope || {}, {
    speechSyncEnabled: sync.enabled === true,
    speechSyncVersion: sync.version || '',
    estimatedDurationMs: Number(sync.estimatedDurationMs || 0) || 0,
    visemeCount: Number(sync.visemeCount || (Array.isArray(sync.visemes) ? sync.visemes.length : 0)) || 0,
    avatarSpeechState: sync.avatarSpeechState || sync.speechState || '',
    audioStored: false
  });
}


function createMarionAdminConversationTelemetryEvent(envelope, detail) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  return createVoiceTelemetryEvent('voice.marion_admin_conversation', Object.assign({}, env, {
    privateAdminConversation: true,
    adminConversation: true,
    adminConversationAllowed: env.adminConversationAllowed !== false,
    directMarionConversation: true,
    publicAgent: 'Marion'
  }), Object.assign({
    privateAdminConversation: true,
    adminConversationAllowed: true,
    publicUsersMayAddressMarion: false,
    publicUsersSpeakThrough: 'Nyx',
    noRawAudioStored: true,
    audioStored: false
  }, detail && typeof detail === 'object' ? detail : {}));
}

function createLingoSentinelSilentOversightTelemetryEvent(envelope, detail) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  return createVoiceTelemetryEvent('voice.lingosentinel_silent_oversight', Object.assign({}, env, {
    lingoSentinelSilentOversight: true,
    silentOversight: true,
    userToUserBoundary: true,
    marionVisibleParticipant: false,
    publicAgent: 'LingoSentinel'
  }), Object.assign({
    silentOversight: true,
    userToUserBoundary: true,
    marionVisibleParticipant: false,
    visibleToUsers: false,
    noUserFacingDiagnostics: true,
    noRawAudioStored: true,
    audioStored: false
  }, detail && typeof detail === 'object' ? detail : {}));
}


function createVoiceTelemetrySummary(events) {
  const list = Array.isArray(events) ? events : [];

  return {
    count: list.length,
    version: VERSION,
    inputChannel: 'voice',
    authority: 'Marion',
    publicAgent: 'Nyx',
    audioStored: false,
    adminOnlyVoiceDelivery: true,
    adminVoiceDeliveryAllowed: list.some((event) => event.adminVoiceDeliveryAllowed === true),
    lastEvent: list.length ? list[list.length - 1].type : null,
    blocked: list.some((event) => event.type === 'voice.blocked'),
    failed: list.some((event) => String(event.type || '').includes('failed')),
    privateAdminConversationObserved: list.some((event) => event.privateAdminConversation === true),
    lingoSentinelSilentOversightObserved: list.some((event) => event.lingoSentinelSilentOversight === true),
    userToUserBoundaryObserved: list.some((event) => event.userToUserBoundary === true),
    speakerRegistryObserved: list.some((event) => event.speakerRegistryAvailable === true || event.speakerRegistryMatched === true),
    voiceprintStored: false
  };
}

module.exports = {
  VERSION,
  createVoiceTelemetryEvent,
  createVoiceTelemetrySummary,
  createVoiceSpeechSyncTelemetryEvent,
  createMarionAdminConversationTelemetryEvent,
  createLingoSentinelSilentOversightTelemetryEvent,
  sanitizeTelemetryDetail,
  sanitizeSensitiveString
};


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
