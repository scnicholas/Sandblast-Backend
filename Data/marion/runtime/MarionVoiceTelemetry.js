'use strict';

/**
 * MarionVoiceTelemetry
 * Metadata-only voice telemetry. Transcript, reply, credentials, identifiers,
 * audio and arbitrary detail strings are deliberately excluded.
 */

const VERSION = 'marion.voiceTelemetry/2.7-metadata-only';

const DETAIL_STRING_KEYS = new Set([
  'reason', 'authorizationState', 'commandPhrase', 'speakerRoleBinding',
  'speakerRegistryStatus', 'challengeStatus', 'speakerConfidenceBand',
  'continuityStatus', 'voiceMode', 'speechSyncVersion', 'error', 'version', 'source'
]);
const DETAIL_BOOLEAN_KEYS = new Set([
  'allowed', 'speakAllowed', 'speechSyncEnabled', 'audioStored', 'rawAudioStored',
  'noRawAudioStored', 'transcriptOnly', 'liveChallengeRequired', 'liveChallengeVerified',
  'challengeBlocked', 'challengePreventsReplay', 'challengeIsAuthority', 'speakerRegistryAvailable',
  'speakerRegistryMatched', 'speakerRegistryBlocked', 'voiceIdentityBoundary',
  'identityIsAuthority', 'privateAdminConversation', 'adminConversationAllowed',
  'directMarionConversation', 'lingoSentinelSilentOversight', 'userToUserBoundary',
  'marionVisibleParticipant', 'finalEnvelopeVerified', 'finalApproved', 'blocked', 'failed'
]);
const DETAIL_NUMBER_KEYS = new Set([
  'estimatedDurationMs', 'visemeCount', 'transcriptLength', 'originalTranscriptLength',
  'maxNormalizedTranscript', 'confidence', 'speakerConfidence', 'latencyMs'
]);
const CODE_RX = /^[A-Z][A-Z0-9_.-]{0,79}$/;
const ENUM_RX = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/;

function ownValue(object, key) {
  if (!object || typeof object !== 'object') return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
  } catch (_) {
    return undefined;
  }
}

function safeLength(value) {
  if (typeof value !== 'string') return 0;
  return Math.min(value.length, 4000);
}

function safeEnum(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  if (!text || text.length > 80 || /token|secret|password|cookie|authorization|api[_-]?key|x-sb-/i.test(text)) return fallback;
  return ENUM_RX.test(text) ? text : fallback;
}

function safeCode(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return CODE_RX.test(text) && !/TOKEN|SECRET|PASSWORD|COOKIE|AUTHORIZATION|X_SB/i.test(text) ? text : '';
}

function boundedNumber(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, value));
}

function sanitizeSensitiveString(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  if (/token|secret|password|cookie|authorization|api[_-]?key|x-sb-|transcript|spoken|reply|prompt|audio|blob|buffer/i.test(text)) return '[redacted]';
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function sanitizeTelemetryDetail(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const out = Object.create(null);
  let count = 0;
  let keys;
  try { keys = Object.keys(detail).slice(0, 64); } catch (_) { return out; }
  for (const key of keys) {
    if (count >= 32) break;
    if (DETAIL_STRING_KEYS.has(key)) {
      const value = ownValue(detail, key);
      const sanitized = key === 'error' || key === 'reason' ? safeCode(value) : safeEnum(value, '');
      if (sanitized) { out[key] = sanitized; count += 1; }
      continue;
    }
    if (DETAIL_BOOLEAN_KEYS.has(key)) {
      const value = ownValue(detail, key);
      if (typeof value === 'boolean') { out[key] = value; count += 1; }
      continue;
    }
    if (DETAIL_NUMBER_KEYS.has(key)) {
      const value = ownValue(detail, key);
      const safe = boundedNumber(value, 0, key === 'confidence' || key === 'speakerConfidence' ? 1 : 10000000);
      if (safe !== null) { out[key] = safe; count += 1; }
    }
  }
  return out;
}

function normalizedStatus(value, allowed) {
  const candidate = safeEnum(value, 'unknown').toLowerCase();
  return allowed.has(candidate) ? candidate : 'other';
}

function createVoiceTelemetryEvent(type, envelope, detail) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const meta = ownValue(env, 'rawMeta') && typeof ownValue(env, 'rawMeta') === 'object' ? ownValue(env, 'rawMeta') : {};
  const speakerIdentity = ownValue(env, 'speakerIdentity') && typeof ownValue(env, 'speakerIdentity') === 'object' ? ownValue(env, 'speakerIdentity') : {};
  const eventType = safeEnum(type, 'voice.event');
  const confidence = boundedNumber(ownValue(env, 'confidence'), 0, 1);
  const identityConfidence = boundedNumber(ownValue(speakerIdentity, 'speakerConfidence'), 0, 1);
  const directConfidence = boundedNumber(ownValue(env, 'speakerConfidence'), 0, 1);
  const providerCandidate = safeEnum(ownValue(meta, 'provider'), 'browser-native');
  const provider = new Set(['browser-native', 'marion-admin-interface', 'webrtc', 'webspeech']).has(providerCandidate)
    ? providerCandidate
    : 'other';

  return {
    type: eventType,
    at: new Date().toISOString(),
    version: VERSION,
    inputChannel: 'voice',
    source: 'voice',
    authority: 'Marion',
    publicAgent: 'Nyx',
    sessionPresent: !!safeEnum(ownValue(env, 'sessionId'), ''),
    requestPresent: !!safeEnum(ownValue(env, 'requestId'), ''),
    locale: safeEnum(ownValue(env, 'locale'), 'unknown'),
    confidence,
    authorizationState: normalizedStatus(ownValue(env, 'authorizationState'), new Set(['unknown', 'blocked', 'authorized', 'limited'])),
    adminOnlyVoiceDelivery: true,
    adminVoiceVerified: ownValue(env, 'adminVoiceVerified') === true,
    adminVoiceDeliveryAllowed: ownValue(env, 'adminVoiceDeliveryAllowed') === true,
    remoteTrustedUserVerified: ownValue(env, 'remoteTrustedUserVerified') === true || ownValue(speakerIdentity, 'remoteTrustedUserVerified') === true,
    remoteTrustedVoiceDeliveryAllowed: ownValue(env, 'remoteTrustedVoiceDeliveryAllowed') === true,
    speakerIdentityBoundary: ownValue(env, 'voiceIdentityBoundary') === true || ownValue(speakerIdentity, 'voiceIdentityBoundary') === true,
    voiceIdentityIsAuthority: false,
    speakerHintPresent: !!ownValue(env, 'speakerHint'),
    claimedSpeakerPresent: !!(ownValue(env, 'claimedSpeaker') || ownValue(speakerIdentity, 'claimedSpeaker')),
    detectedSpeakerIdPresent: !!(ownValue(env, 'detectedSpeakerId') || ownValue(speakerIdentity, 'detectedSpeakerId')),
    speakerConfidence: identityConfidence === null ? directConfidence : identityConfidence,
    speakerConfidenceBand: safeEnum(ownValue(speakerIdentity, 'speakerConfidenceBand') || ownValue(env, 'speakerConfidenceBand'), 'unknown'),
    voiceMatchStatus: normalizedStatus(ownValue(speakerIdentity, 'voiceMatchStatus') || ownValue(env, 'voiceMatchStatus'), new Set(['unknown', 'matched', 'verified', 'unmatched', 'blocked', 'failed', 'pending', 'not_enrolled'])),
    speakerRoleBinding: normalizedStatus(ownValue(speakerIdentity, 'roleBinding') || ownValue(env, 'speakerRoleBinding'), new Set(['blocked', 'owner', 'admin', 'remote_trusted_user', 'public', 'unknown'])),
    speakerRegistryAvailable: ownValue(speakerIdentity, 'speakerRegistryAvailable') === true || ownValue(env, 'speakerRegistryAvailable') === true,
    speakerRegistryMatched: ownValue(speakerIdentity, 'speakerRegistryMatched') === true || ownValue(env, 'speakerRegistryMatched') === true,
    speakerRegistryStatus: safeEnum(ownValue(speakerIdentity, 'speakerRegistryStatus') || ownValue(env, 'speakerRegistryStatus'), 'unknown'),
    speakerRegistryBlocked: ownValue(speakerIdentity, 'speakerRegistryBlocked') === true || ownValue(env, 'speakerRegistryBlocked') === true,
    profileMetadataOnly: true,
    voiceprintStored: false,
    liveChallengeRequired: ownValue(speakerIdentity, 'liveChallengeRequired') === true || ownValue(env, 'liveChallengeRequired') === true,
    liveChallengeVerified: ownValue(speakerIdentity, 'liveChallengeVerified') === true || ownValue(env, 'liveChallengeVerified') === true,
    challengeStatus: safeEnum(ownValue(speakerIdentity, 'challengeStatus') || ownValue(env, 'challengeStatus'), 'unknown'),
    challengeBlocked: ownValue(speakerIdentity, 'challengeBlocked') === true || ownValue(env, 'challengeBlocked') === true,
    challengePreventsReplay: true,
    challengeIsAuthority: false,
    privateAdminConversation: ownValue(env, 'privateAdminConversation') === true || ownValue(env, 'adminConversation') === true,
    adminConversationAllowed: ownValue(env, 'adminConversationAllowed') === true || ownValue(env, 'privateAdminConversation') === true,
    directMarionConversation: ownValue(env, 'directMarionConversation') === true || ownValue(env, 'privateAdminConversation') === true,
    lingoSentinelSilentOversight: ownValue(env, 'lingoSentinelSilentOversight') === true || ownValue(env, 'silentOversight') === true,
    userToUserBoundary: ownValue(env, 'userToUserBoundary') === true,
    marionVisibleParticipant: ownValue(env, 'marionVisibleParticipant') === false ? false : null,
    userIntentHint: normalizedStatus(ownValue(env, 'userIntentHint'), new Set(['command', 'status', 'conversation', 'simple_chat', 'general', 'private_admin', 'next_steps'])),
    transcriptLength: safeLength(ownValue(env, 'transcript')),
    originalTranscriptLength: safeLength(ownValue(env, 'originalTranscript') || ownValue(env, 'transcript')),
    provider,
    audioStored: false,
    speechSyncEnabled: ownValue(detail, 'speechSyncEnabled') === true,
    speechSyncVersion: sanitizeSensitiveString(ownValue(detail, 'speechSyncVersion') || ''),
    detail: sanitizeTelemetryDetail(detail)
  };
}

function createVoiceSpeechSyncTelemetryEvent(speechSync, envelope) {
  const sync = speechSync && typeof speechSync === 'object' ? speechSync : {};
  return createVoiceTelemetryEvent('voice.speech_sync.prepared', envelope || {}, {
    speechSyncEnabled: ownValue(sync, 'enabled') === true,
    speechSyncVersion: ownValue(sync, 'version') || '',
    estimatedDurationMs: Number(ownValue(sync, 'estimatedDurationMs') || 0) || 0,
    visemeCount: Number(ownValue(sync, 'visemeCount') || (Array.isArray(ownValue(sync, 'visemes')) ? ownValue(sync, 'visemes').length : 0)) || 0,
    avatarSpeechState: ownValue(sync, 'avatarSpeechState') || ownValue(sync, 'speechState') || '',
    audioStored: false
  });
}

function createMarionAdminConversationTelemetryEvent(envelope, detail) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  return createVoiceTelemetryEvent('voice.marion_admin_conversation', Object.assign({}, env, {
    privateAdminConversation: true,
    adminConversation: true,
    adminConversationAllowed: ownValue(env, 'adminConversationAllowed') !== false,
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
  const list = Array.isArray(events) ? events.slice(0, 1000) : [];
  const eventType = (event) => safeEnum(ownValue(event, 'type'), '');
  return {
    count: list.length,
    version: VERSION,
    inputChannel: 'voice',
    authority: 'Marion',
    publicAgent: 'Nyx',
    audioStored: false,
    adminOnlyVoiceDelivery: true,
    adminVoiceDeliveryAllowed: list.some((event) => ownValue(event, 'adminVoiceDeliveryAllowed') === true),
    lastEvent: list.length ? eventType(list[list.length - 1]) || null : null,
    blocked: list.some((event) => eventType(event) === 'voice.blocked'),
    failed: list.some((event) => eventType(event).includes('failed')),
    privateAdminConversationObserved: list.some((event) => ownValue(event, 'privateAdminConversation') === true),
    lingoSentinelSilentOversightObserved: list.some((event) => ownValue(event, 'lingoSentinelSilentOversight') === true),
    userToUserBoundaryObserved: list.some((event) => ownValue(event, 'userToUserBoundary') === true),
    speakerRegistryObserved: list.some((event) => ownValue(event, 'speakerRegistryAvailable') === true || ownValue(event, 'speakerRegistryMatched') === true),
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
