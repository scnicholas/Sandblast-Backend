'use strict';

/**
 * MarionVoiceSpeakerIdentity
 * Phase 4 speaker differentiation boundary.
 *
 * Voice identity is treated as evidence, not authority. RBAC/session/token
 * proof remains the control plane for command, escalation, and owner access.
 * This module never stores raw audio and never elevates a caller by speaker
 * label alone.
 */

const VERSION = 'marion.voiceSpeakerIdentity/1.0-phase4-speaker-differentiation-boundary';

const SPEAKER_CONFIDENCE = Object.freeze({
  STRONG: 0.90,
  WEAK: 0.70
});

const ROLE_BINDINGS = Object.freeze({
  OWNER: 'owner',
  REMOTE_TRUSTED_USER: 'remote_trusted_user',
  BLOCKED: 'blocked'
});

function safeText(value, maxLength) {
  const max = Number.isFinite(Number(maxLength)) ? Math.max(1, Math.min(Number(maxLength), 500)) : 160;
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeSpeakerLabel(value) {
  return safeText(value, 160)
    .toLowerCase()
    .replace(/[^\w\s.@:/_-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampSpeakerConfidence(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function confidenceBand(value) {
  const confidence = clampSpeakerConfidence(value);
  if (confidence == null) return 'unknown';
  if (confidence >= SPEAKER_CONFIDENCE.STRONG) return 'strong';
  if (confidence >= SPEAKER_CONFIDENCE.WEAK) return 'weak';
  return 'low';
}

function normalizeVoiceMatchStatus(value, confidence) {
  const raw = safeText(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (raw === 'strong_match' || raw === 'weak_match' || raw === 'no_match' || raw === 'unknown' || raw === 'not_enrolled') return raw;
  const band = confidenceBand(confidence);
  if (band === 'strong') return 'strong_match';
  if (band === 'weak') return 'weak_match';
  if (band === 'low') return 'no_match';
  return 'unknown';
}

function roleFromOptions(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const opts = options && typeof options === 'object' ? options : {};
  const auth = env.authorization && typeof env.authorization === 'object' ? env.authorization : {};
  const context = opts.context && typeof opts.context === 'object' ? opts.context : {};
  const role = safeText(
    opts.role ||
    opts.sessionRole ||
    context.role ||
    context.sessionRole ||
    env.role ||
    env.sessionRole ||
    auth.role ||
    '',
    80
  ).toLowerCase();

  if (role === 'owner' || role === 'admin' || role === 'administrator') return ROLE_BINDINGS.OWNER;
  if (role === 'remote_trusted_user' || role === 'trusted_remote_user' || role === 'remote_user') return ROLE_BINDINGS.REMOTE_TRUSTED_USER;
  return ROLE_BINDINGS.BLOCKED;
}

function hasAdminProof(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const opts = options && typeof options === 'object' ? options : {};
  const auth = env.authorization && typeof env.authorization === 'object' ? env.authorization : {};
  return opts.adminVerified === true ||
    opts.adminVoiceVerified === true ||
    opts.adminVoiceTokenVerified === true ||
    opts.adminVoiceDeliveryAllowed === true ||
    opts.serverSideAdminVoiceAuth === true ||
    opts.trustedServerAuth === true ||
    env.adminVoiceVerified === true ||
    env.adminVoiceTokenVerified === true ||
    env.adminVoiceDeliveryAllowed === true ||
    auth.adminVoiceVerified === true ||
    auth.adminVoiceTokenVerified === true ||
    auth.adminVoiceDeliveryAllowed === true ||
    auth.role === 'owner';
}

function hasRemoteTrustedProof(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const opts = options && typeof options === 'object' ? options : {};
  const auth = env.authorization && typeof env.authorization === 'object' ? env.authorization : {};
  return opts.remoteTrustedUserVerified === true ||
    opts.remoteTrustedUserTokenVerified === true ||
    opts.trustedRemoteUserAuth === true ||
    opts.serverSideRemoteTrustedUserAuth === true ||
    opts.role === 'remote_trusted_user' ||
    env.remoteTrustedUserVerified === true ||
    env.remoteTrustedUserTokenVerified === true ||
    env.trustedRemoteUserAuth === true ||
    auth.remoteTrustedUserVerified === true ||
    auth.remoteTrustedUserTokenVerified === true ||
    auth.role === 'remote_trusted_user';
}

function resolveRoleBinding(envelope, options) {
  const role = roleFromOptions(envelope, options);
  if (hasAdminProof(envelope, options)) return ROLE_BINDINGS.OWNER;
  if (hasRemoteTrustedProof(envelope, options)) return ROLE_BINDINGS.REMOTE_TRUSTED_USER;
  return role;
}

function resolveVoiceSpeakerIdentity(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const opts = options && typeof options === 'object' ? options : {};
  const rawSpeakerHint = safeText(env.speakerHint || opts.speakerHint || '', 160);
  const claimedSpeaker = safeText(env.claimedSpeaker || opts.claimedSpeaker || rawSpeakerHint || '', 160);
  const detectedSpeakerId = safeText(env.detectedSpeakerId || opts.detectedSpeakerId || env.speakerId || opts.speakerId || '', 160);
  const speakerConfidence = clampSpeakerConfidence(
    env.speakerConfidence != null ? env.speakerConfidence :
      (opts.speakerConfidence != null ? opts.speakerConfidence : env.confidence)
  );
  const band = confidenceBand(speakerConfidence);
  const voiceMatchStatus = normalizeVoiceMatchStatus(env.voiceMatchStatus || opts.voiceMatchStatus || '', speakerConfidence);
  const adminVerified = hasAdminProof(env, opts);
  const remoteTrustedUserVerified = hasRemoteTrustedProof(env, opts);
  const roleBinding = resolveRoleBinding(env, opts);

  const explicitTrustedHint =
    opts.trustSpeakerHint === true ||
    opts.trustedSpeakerHint === true ||
    opts.allowSpeakerHintAuthorization === true ||
    env.trustedSpeakerHint === true;

  const speakerHintTrusted = Boolean(rawSpeakerHint && explicitTrustedHint && (adminVerified || remoteTrustedUserVerified));
  const speakerClaimTrusted = Boolean(claimedSpeaker && (adminVerified || remoteTrustedUserVerified));
  const voiceProfileEnrolled = env.voiceProfileEnrolled === true || opts.voiceProfileEnrolled === true || !!detectedSpeakerId;

  let reason = 'SPEAKER_IDENTITY_UNTRUSTED';
  if (adminVerified) reason = 'ADMIN_PROOF_BOUND_SPEAKER_IDENTITY';
  else if (remoteTrustedUserVerified) reason = 'REMOTE_TRUSTED_PROOF_BOUND_SPEAKER_IDENTITY';
  else if (voiceMatchStatus === 'strong_match') reason = 'VOICE_MATCH_WITHOUT_AUTHORITY';
  else if (rawSpeakerHint) reason = 'SPEAKER_HINT_UNTRUSTED_WITHOUT_PROOF';

  return {
    version: VERSION,
    phase: 'phase4_speaker_differentiation_boundary',
    speakerHint: rawSpeakerHint,
    claimedSpeaker,
    detectedSpeakerId,
    speakerConfidence,
    speakerConfidenceBand: band,
    voiceMatchStatus,
    voiceProfileEnrolled,
    speakerHintTrusted,
    speakerClaimTrusted,
    adminVerified,
    remoteTrustedUserVerified,
    sessionRole: roleFromOptions(env, opts),
    roleBinding,
    voiceIdentityBoundary: true,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    dangerousActionRequiresEscalation: true,
    rawAudioStored: false,
    audioStored: false,
    voiceStored: false,
    transcriptOnly: true,
    reason
  };
}

function applyVoiceSpeakerIdentityEnvelope(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const identity = resolveVoiceSpeakerIdentity(env, options);
  return Object.assign({}, env, {
    speakerIdentity: identity,
    voiceIdentity: identity,
    speakerIdentityVersion: VERSION,
    voiceIdentityBoundary: true,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    dangerousActionRequiresEscalation: true,
    claimedSpeaker: identity.claimedSpeaker,
    detectedSpeakerId: identity.detectedSpeakerId,
    speakerConfidence: identity.speakerConfidence,
    speakerConfidenceBand: identity.speakerConfidenceBand,
    voiceMatchStatus: identity.voiceMatchStatus,
    speakerHintTrusted: identity.speakerHintTrusted,
    speakerRoleBinding: identity.roleBinding,
    rawAudioStored: false,
    audioStored: false,
    voiceStored: false,
    transcriptOnly: true
  });
}

function isVoiceSpeakerIdentityTrusted(identity) {
  const item = identity && typeof identity === 'object' ? identity : {};
  return item.adminVerified === true || item.remoteTrustedUserVerified === true || item.speakerHintTrusted === true;
}

module.exports = {
  VERSION,
  SPEAKER_CONFIDENCE,
  ROLE_BINDINGS,
  normalizeSpeakerLabel,
  clampSpeakerConfidence,
  confidenceBand,
  normalizeVoiceMatchStatus,
  resolveVoiceSpeakerIdentity,
  applyVoiceSpeakerIdentityEnvelope,
  isVoiceSpeakerIdentityTrusted,
  hasAdminProof,
  hasRemoteTrustedProof
};
