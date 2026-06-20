'use strict';

/**
 * MarionVoiceInputEnvelope
 * Creates a strict voice-input contract before any spoken transcript reaches Marion.
 * No raw audio is stored here. Transcript-only envelope.
 */

const VERSION = 'marion.voiceInputEnvelope/2.5-phase7-continuity-window';
const VOICE_SOURCE = 'voice';
const DEFAULT_LOCALE = 'en-CA';
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;

const speakerIdentityMod = (() => {
  try {
    return require('./MarionVoiceSpeakerIdentity');
  } catch (_) {
    return null;
  }
})();

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < MIN_CONFIDENCE) return MIN_CONFIDENCE;
  if (n > MAX_CONFIDENCE) return MAX_CONFIDENCE;
  return n;
}

function cleanTranscript(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPublicHint(value, maxLength = 120) {
  const max = Number.isFinite(Number(maxLength)) ? Math.max(8, Math.min(Number(maxLength), 500)) : 120;
  return String(value || '')
    .replace(/[^\w\s.@:/_-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function firstTranscript(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return cleanTranscript(
    p.transcript ||
      p.text ||
      p.message ||
      p.query ||
      p.input ||
      p.userQuery ||
      ''
  );
}

function hasTrustedServerAdminVoiceProof(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const trusted =
    p.serverSideAdminVoiceAuth === true ||
    p.trustedServerAuth === true ||
    p.adminVoiceProofTrusted === true ||
    p.trustedAdminVoiceProof === true;

  if (!trusted) return false;

  return p.adminVoiceVerified === true ||
    p.adminVoiceTokenVerified === true ||
    p.adminVoiceDeliveryAllowed === true ||
    p.adminVerified === true;
}

function detectIntentHint(transcript) {
  const text = String(transcript || '').toLowerCase();

  if (!text) return 'empty';
  if (/\b(stop|cancel|nevermind|never mind|abort)\b/.test(text)) return 'cancel';
  if (/\b(open|launch|start|run|execute|deploy|delete|remove|send|publish)\b/.test(text)) return 'command';
  if (/\b(status|where are we|update|report|summary|diagnose|autopsy)\b/.test(text)) return 'status';
  if (/\b(create|build|generate|write|draft|make)\b/.test(text)) return 'creation';
  if (/\bexplain|what is|why|how\b/.test(text)) return 'inquiry';

  return 'conversation';
}

function createVoiceInputEnvelope(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const transcript = firstTranscript(payload);
  const confidence = clampConfidence(payload.confidence);
  const adminVoiceVerified = hasTrustedServerAdminVoiceProof(payload);
  const privateDelivery = payload.privateDelivery === true || payload.privateVoiceDelivery === true;

  const envelope = {
    ok: transcript.length > 0,
    version: VERSION,
    source: VOICE_SOURCE,
    inputChannel: VOICE_SOURCE,
    transcript,
    confidence,
    locale: cleanPublicHint(payload.locale || payload.language || DEFAULT_LOCALE, 40) || DEFAULT_LOCALE,
    receivedAt: payload.receivedAt || new Date().toISOString(),
    userIntentHint: payload.userIntentHint || detectIntentHint(transcript),
    authorizationState: payload.authorizationState || 'unchecked',
    speakerHint: cleanPublicHint(payload.speakerHint || payload.speaker || ''),
    sessionId: cleanPublicHint(payload.sessionId || '', 160) || null,
    requestId: cleanPublicHint(payload.requestId || '', 160) || null,
    adminOnlyVoiceDelivery: payload.adminOnlyVoiceDelivery !== false,
    adminVoiceVerified,
    adminVoiceAuthSource: adminVoiceVerified ? cleanPublicHint(payload.adminVoiceAuthSource || '', 80) : '',
    adminVoiceDeliveryAllowed: adminVoiceVerified,
    privateDelivery,
    privateVoiceDelivery: privateDelivery,
    claimedSpeaker: cleanPublicHint(payload.claimedSpeaker || payload.speaker || payload.user || '', 160),
    detectedSpeakerId: cleanPublicHint(payload.detectedSpeakerId || payload.speakerId || '', 160),
    speakerConfidence: clampConfidence(payload.speakerConfidence != null ? payload.speakerConfidence : payload.voiceConfidence),
    voiceMatchStatus: cleanPublicHint(payload.voiceMatchStatus || '', 80),
    voiceProfileEnrolled: payload.voiceProfileEnrolled === true,
    challengeId: cleanPublicHint(payload.challengeId || payload.voiceChallengeId || '', 160),
    challengeResponse: cleanTranscript(payload.challengeResponse || payload.responseTranscript || payload.challengeAnswer || ''),
    liveChallengeRequired: payload.liveChallengeRequired === true || payload.requireLiveChallenge === true,
    liveChallengeVerified: payload.liveChallengeVerified === true && payload.trustedServerAuth === true,
    voiceChallengeVerified: payload.voiceChallengeVerified === true && payload.trustedServerAuth === true,
    challengePreventsReplay: true,
    challengeIsAuthority: false,
    continuityWindowId: cleanPublicHint(payload.continuityWindowId || payload.windowId || payload.voiceWindowId || '', 160),
    continuityWindowTokenPresent: !!(payload.continuityToken || payload.voiceContinuityToken || payload.windowToken),
    trustedVoiceWindowActive: payload.trustedVoiceWindowActive === true && payload.trustedServerAuth === true,
    continuityWindowVerified: payload.continuityWindowVerified === true && payload.trustedServerAuth === true,
    voiceContinuityRequired: payload.voiceContinuityRequired === true || payload.requireContinuityWindow === true,
    continuityPreventsSessionDrift: true,
    continuityIsAuthority: false,
    speakerRegistryStatus: cleanPublicHint(payload.speakerRegistryStatus || '', 80),
    speakerRegistryMatched: payload.speakerRegistryMatched === true,
    profileMetadataOnly: true,
    voiceprintStored: false,
    sessionRole: cleanPublicHint(payload.sessionRole || payload.role || '', 80),
    remoteTrustedUserVerified: payload.remoteTrustedUserVerified === true || payload.remoteTrustedUserTokenVerified === true,
    remoteTrustedUserTokenVerified: payload.remoteTrustedUserTokenVerified === true,
    trustedRemoteUserAuth: payload.trustedRemoteUserAuth === true,
    rawAudioStored: false,
    audioStored: false,
    voiceStored: false,
    transcriptOnly: true,
    deliveryChannel: cleanPublicHint(payload.deliveryChannel || (privateDelivery ? 'lingosentinel_private_voice' : ''), 80),
    rawMeta: {
      provider: cleanPublicHint(payload.provider || 'browser-native', 80),
      client: cleanPublicHint(payload.client || '', 80) || null,
      userAgent: cleanPublicHint(payload.userAgent || '', 220) || null,
      interim: Boolean(payload.interim),
      final: payload.final !== false,
      audioStored: false,
      rawAudioAccepted: false,
      transcriptOnly: true
    },
    warnings: transcript.length > 0 ? [] : ['EMPTY_TRANSCRIPT']
  };

  if (speakerIdentityMod && typeof speakerIdentityMod.applyVoiceSpeakerIdentityEnvelope === 'function') {
    return speakerIdentityMod.applyVoiceSpeakerIdentityEnvelope(envelope, {
      adminVoiceVerified,
      adminVoiceTokenVerified: adminVoiceVerified,
      adminVoiceDeliveryAllowed: adminVoiceVerified,
      remoteTrustedUserVerified: envelope.remoteTrustedUserVerified === true,
      remoteTrustedUserTokenVerified: envelope.remoteTrustedUserTokenVerified === true,
      role: envelope.sessionRole || '',
      trustSpeakerHint: payload.trustSpeakerHint === true || payload.requestTrustedSpeakerHint === true,
      speakerConfidence: envelope.speakerConfidence,
      voiceMatchStatus: envelope.voiceMatchStatus,
      challengeId: envelope.challengeId,
      challengeResponse: envelope.challengeResponse,
      liveChallengeRequired: envelope.liveChallengeRequired,
      liveChallengeVerified: envelope.liveChallengeVerified,
      voiceChallengeVerified: envelope.voiceChallengeVerified,
      sessionVerified: payload.sessionVerified === true,
      detectedSpeakerId: envelope.detectedSpeakerId,
      claimedSpeaker: envelope.claimedSpeaker
    });
  }

  return envelope;
}

function isVoiceInputEnvelope(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.source === VOICE_SOURCE &&
    value.inputChannel === VOICE_SOURCE &&
    typeof value.transcript === 'string' &&
    typeof value.receivedAt === 'string'
  );
}

module.exports = {
  VERSION,
  VOICE_SOURCE,
  DEFAULT_LOCALE,
  createVoiceInputEnvelope,
  isVoiceInputEnvelope,
  detectIntentHint,
  cleanTranscript,
  cleanPublicHint,
  firstTranscript,
  hasTrustedServerAdminVoiceProof,
  clampConfidence
};
