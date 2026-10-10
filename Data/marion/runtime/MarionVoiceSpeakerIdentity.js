'use strict';

/**
 * Marion speaker identity is evidence only. Server session/RBAC is the
 * authority; speaker labels, registry rows, challenge proofs, and continuity
 * windows never grant a role or permission.
 */
const VERSION = 'marion.voiceSpeakerIdentity/2.0-phase4-fail-closed';
const SPEAKER_CONFIDENCE = Object.freeze({ STRONG: 0.90, WEAK: 0.70 });
const ROLE_BINDINGS = Object.freeze({ OWNER: 'owner', REMOTE_TRUSTED_USER: 'remote_trusted_user', BLOCKED: 'blocked' });

const speakerRegistryMod = safeRequire('./MarionVoiceSpeakerRegistry');
const challengeVerifierMod = safeRequire('./MarionVoiceChallengeVerifier');
const continuityWindowMod = safeRequire('./MarionVoiceContinuityWindow');

function safeRequire(name) { try { return require(name); } catch (_) { return null; } }
function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function own(obj, key) {
  if (!isObject(obj)) return undefined;
  try { const d = Object.getOwnPropertyDescriptor(obj, key); return d && Object.prototype.hasOwnProperty.call(d, 'value') ? d.value : undefined; }
  catch (_) { return undefined; }
}
function firstOwn(objects, keys) {
  for (const obj of objects) for (const key of keys) { const value = own(obj, key); if (value !== undefined && value !== null && value !== '') return value; }
  return undefined;
}
function safeText(value, maxLength = 160) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return '';
  const max = Math.max(1, Math.min(Number(maxLength) || 160, 500));
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function normalizeSpeakerLabel(value) {
  return safeText(value, 160).toLowerCase().replace(/[^a-z0-9\s.@:/_-]/g, '').replace(/\s+/g, ' ').trim();
}
function clampSpeakerConfidence(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : (typeof value === 'string' ? Number(value) : NaN);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
}
function confidenceBand(value) {
  const n = clampSpeakerConfidence(value);
  if (n == null) return 'unknown';
  if (n >= SPEAKER_CONFIDENCE.STRONG) return 'strong';
  if (n >= SPEAKER_CONFIDENCE.WEAK) return 'weak';
  return 'low';
}
function normalizeVoiceMatchStatus(value, confidence) {
  const raw = safeText(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (['strong_match', 'weak_match', 'no_match', 'unknown', 'not_enrolled'].includes(raw)) return raw;
  const band = confidenceBand(confidence);
  return band === 'strong' ? 'strong_match' : band === 'weak' ? 'weak_match' : band === 'low' ? 'no_match' : 'unknown';
}

function trustedContext(options) {
  const opts = isObject(options) ? options : {};
  const auth = own(opts, 'authorization');
  const nested = isObject(auth) ? auth : {};
  const sources = [opts, nested];
  const role = safeText(firstOwn(sources, ['role', 'sessionRole', 'adminRole']), 80).toLowerCase();
  const sessionId = safeText(firstOwn(sources, ['sessionId', 'adminSessionId']), 160);
  const sessionVerified = firstOwn(sources, ['sessionVerified']) === true && !!sessionId;
  const adminMarker = ['adminVerified', 'adminVoiceVerified', 'adminVoiceTokenVerified', 'serverSideAdminVoiceAuth'].some(k => firstOwn(sources, [k]) === true);
  const remoteMarker = ['remoteTrustedUserVerified', 'remoteTrustedUserTokenVerified', 'serverSideRemoteTrustedUserAuth'].some(k => firstOwn(sources, [k]) === true);
  const adminVerified = adminMarker && ['owner', 'admin', 'administrator'].includes(role);
  const remoteTrustedUserVerified = remoteMarker && ['remote_trusted_user', 'trusted_remote_user', 'remote_user'].includes(role);
  return { opts, auth: nested, role, sessionId, sessionVerified, adminVerified, remoteTrustedUserVerified };
}

function hasAdminProof(_envelope, options) { return trustedContext(options).adminVerified; }
function hasRemoteTrustedProof(_envelope, options) { return trustedContext(options).remoteTrustedUserVerified; }
function resolveRoleBinding(_envelope, options) {
  const ctx = trustedContext(options);
  if (ctx.adminVerified) return ROLE_BINDINGS.OWNER;
  if (ctx.remoteTrustedUserVerified) return ROLE_BINDINGS.REMOTE_TRUSTED_USER;
  return ROLE_BINDINGS.BLOCKED;
}

function speakerRegistryEvidenceForIdentity(envelope, options) {
  const env = isObject(envelope) ? envelope : {};
  const opts = trustedContext(options).opts;
  const speakerId = normalizeSpeakerLabel(firstOwn([env, opts], ['detectedSpeakerId', 'speakerId']));
  if (!speakerRegistryMod || typeof speakerRegistryMod.checkSpeaker !== 'function') {
    return { available: false, matched: false, enrollmentStatus: 'unknown', roleBinding: 'blocked', blocked: false, version: '' };
  }
  if (!speakerId) return { available: true, matched: false, enrollmentStatus: 'unknown', roleBinding: 'blocked', blocked: false, version: speakerRegistryMod.VERSION || '' };
  try {
    const result = speakerRegistryMod.checkSpeaker({ speakerId });
    if (!result || result.matched !== true) return { available: true, matched: false, enrollmentStatus: 'unknown', roleBinding: 'blocked', blocked: false, version: speakerRegistryMod.VERSION || '' };
    const status = safeText(result.enrollmentStatus || (result.speaker && result.speaker.enrollmentStatus) || 'unknown', 64).toLowerCase();
    const blocked = result.blocked === true || status === 'revoked' || status === 'blocked';
    return {
      available: true, matched: !blocked, speakerId: safeText(result.speakerId || speakerId, 120),
      enrollmentStatus: status, roleBinding: blocked ? 'blocked' : safeText(result.roleBinding || (result.speaker && result.speaker.roleBinding) || 'blocked', 80),
      blocked, profileMetadataOnly: true, rawAudioStored: false, voiceprintStored: false,
      version: safeText(speakerRegistryMod.VERSION || '', 120)
    };
  } catch (_) {
    return { available: true, matched: false, enrollmentStatus: 'unknown', roleBinding: 'blocked', blocked: true, version: safeText(speakerRegistryMod.VERSION || '', 120) };
  }
}

function challengeProofFrom(env, opts) {
  const nested = firstOwn([env, opts], ['voiceChallenge']);
  const challenge = isObject(nested) ? nested : {};
  return safeText(firstOwn([env, opts, challenge], ['challengeProof', 'voiceChallengeProof']), 1200);
}
function continuityDataFrom(env, opts) {
  const nested = firstOwn([env, opts], ['voiceContinuity']);
  const continuity = isObject(nested) ? nested : {};
  return {
    continuityWindowId: safeText(firstOwn([env, opts, continuity], ['continuityWindowId', 'windowId']), 160),
    continuityToken: safeText(firstOwn([env, opts, continuity], ['continuityToken', 'voiceContinuityToken', 'windowToken']), 300),
    speakerId: safeText(firstOwn([env, opts], ['detectedSpeakerId', 'speakerId']), 120)
  };
}
function verifiedModuleContext(options) {
  const ctx = trustedContext(options);
  return {
    role: ctx.role, sessionId: ctx.sessionId, sessionVerified: ctx.sessionVerified,
    adminVerified: ctx.adminVerified, ownerVerified: ctx.adminVerified,
    remoteTrustedUserVerified: ctx.remoteTrustedUserVerified,
    trustedServerAuth: ctx.adminVerified || ctx.remoteTrustedUserVerified,
    speechCaptureAttestation: own(ctx.opts, 'speechCaptureAttestation')
  };
}

function challengeEvidenceForIdentity(envelope, options, speakerRegistry, voiceMatchStatus) {
  const env = isObject(envelope) ? envelope : {};
  const opts = trustedContext(options).opts;
  const required = own(env, 'liveChallengeRequired') === true || own(opts, 'liveChallengeRequired') === true ||
    speakerRegistry.matched === true || voiceMatchStatus === 'weak_match';
  const base = {
    version: challengeVerifierMod && challengeVerifierMod.VERSION || '', liveChallengeRequired: required,
    liveChallengeProvided: false, liveChallengeVerified: false, challengeStatus: 'missing',
    challengePreventsReplay: true, challengeIsAuthority: false, identityIsAuthority: false,
    authorityStillRequiresRBAC: true, rawAudioStored: false, audioStored: false, voiceprintStored: false, transcriptOnly: true
  };
  if (!challengeVerifierMod || typeof challengeVerifierMod.evaluateChallengeEvidence !== 'function') return base;
  const proof = challengeProofFrom(env, opts);
  try {
    const result = challengeVerifierMod.evaluateChallengeEvidence({
      challengeId: safeText(firstOwn([env, opts], ['challengeId', 'voiceChallengeId']), 160),
      speakerId: safeText(firstOwn([env, opts], ['detectedSpeakerId', 'speakerId']), 120),
      challengeProof: proof,
      liveChallengeRequired: required
    }, verifiedModuleContext(opts));
    if (!result || result.ok === false) return Object.assign(base, { liveChallengeProvided: !!proof, challengeStatus: 'unverified' });
    return Object.assign(base, result, {
      version: challengeVerifierMod.VERSION || '', liveChallengeRequired: required,
      liveChallengeVerified: result.liveChallengeVerified === true,
      challengeStatus: safeText(result.challengeStatus || 'unverified', 64),
      challengeIsAuthority: false, identityIsAuthority: false, authorityStillRequiresRBAC: true,
      challengeVersion: challengeVerifierMod.VERSION || ''
    });
  } catch (_) { return Object.assign(base, { liveChallengeProvided: !!proof, challengeStatus: 'verification_error' }); }
}

function continuityEvidenceForIdentity(envelope, options) {
  const env = isObject(envelope) ? envelope : {};
  const opts = trustedContext(options).opts;
  const data = continuityDataFrom(env, opts);
  const base = {
    version: continuityWindowMod && continuityWindowMod.VERSION || '',
    continuityWindowRequired: false, continuityWindowProvided: !!(data.continuityWindowId || data.continuityToken),
    trustedVoiceWindowActive: false, continuityWindowVerified: false, continuityStatus: 'missing',
    continuityPreventsSessionDrift: true, continuityIsAuthority: false, challengeIsAuthority: false,
    identityIsAuthority: false, authorityStillRequiresRBAC: true, rawAudioStored: false, audioStored: false,
    voiceprintStored: false, transcriptOnly: true
  };
  if (!continuityWindowMod || typeof continuityWindowMod.evaluateContinuityEvidence !== 'function') return base;
  try {
    const result = continuityWindowMod.evaluateContinuityEvidence({ ...data }, verifiedModuleContext(opts));
    if (!result || result.ok === false) return Object.assign(base, { continuityStatus: 'unverified' });
    const active = result.trustedVoiceWindowActive === true && result.continuityWindowVerified === true;
    return Object.assign(base, result, {
      version: continuityWindowMod.VERSION || '', trustedVoiceWindowActive: active,
      continuityWindowVerified: active, continuityStatus: safeText(result.continuityStatus || 'unverified', 64),
      continuityIsAuthority: false, challengeIsAuthority: false, identityIsAuthority: false,
      authorityStillRequiresRBAC: true, continuityWindowVersion: continuityWindowMod.VERSION || ''
    });
  } catch (_) { return Object.assign(base, { continuityStatus: 'verification_error' }); }
}

function resolveVoiceSpeakerIdentity(envelope, options) {
  const env = isObject(envelope) ? envelope : {};
  const ctx = trustedContext(options);
  const opts = ctx.opts;
  const rawSpeakerHint = safeText(firstOwn([env, opts], ['speakerHint']), 160);
  const claimedSpeaker = safeText(firstOwn([env, opts], ['claimedSpeaker']), 160);
  const detectedSpeakerId = safeText(firstOwn([env, opts], ['detectedSpeakerId', 'speakerId']), 120);
  const speakerConfidence = clampSpeakerConfidence(firstOwn([env, opts], ['speakerConfidence', 'confidence']));
  const band = confidenceBand(speakerConfidence);
  const voiceMatchStatus = normalizeVoiceMatchStatus(firstOwn([env, opts], ['voiceMatchStatus']), speakerConfidence);
  const adminVerified = ctx.adminVerified;
  const remoteTrustedUserVerified = ctx.remoteTrustedUserVerified;
  const speakerRegistry = speakerRegistryEvidenceForIdentity(env, opts);
  const speakerRegistryBlocked = speakerRegistry.blocked === true;
  const challengeEvidence = challengeEvidenceForIdentity(env, opts, speakerRegistry, voiceMatchStatus);
  const continuityEvidence = continuityEvidenceForIdentity(env, opts);
  const liveChallengeRequired = challengeEvidence.liveChallengeRequired === true;
  const liveChallengeVerified = challengeEvidence.liveChallengeVerified === true;
  const trustedVoiceWindowActive = continuityEvidence.trustedVoiceWindowActive === true;
  const continuityWindowVerified = trustedVoiceWindowActive && continuityEvidence.continuityWindowVerified === true;
  const challengeBlocked = liveChallengeRequired && !liveChallengeVerified && !continuityWindowVerified;
  let roleBinding = adminVerified ? ROLE_BINDINGS.OWNER : (remoteTrustedUserVerified ? ROLE_BINDINGS.REMOTE_TRUSTED_USER : ROLE_BINDINGS.BLOCKED);
  if (challengeBlocked || speakerRegistryBlocked) roleBinding = ROLE_BINDINGS.BLOCKED;
  const speakerHintTrusted = Boolean(rawSpeakerHint && (adminVerified || remoteTrustedUserVerified));
  const speakerClaimTrusted = Boolean(claimedSpeaker && (adminVerified || remoteTrustedUserVerified));
  const reason = speakerRegistryBlocked ? 'SPEAKER_REGISTRY_BLOCKED' : challengeBlocked ? 'FRESH_CHALLENGE_OR_VALID_CONTINUITY_REQUIRED' : adminVerified ? 'SERVER_ADMIN_SESSION_BOUND_IDENTITY_EVIDENCE' : remoteTrustedUserVerified ? 'SERVER_REMOTE_SESSION_BOUND_IDENTITY_EVIDENCE' : 'SPEAKER_IDENTITY_UNTRUSTED';
  return {
    version: VERSION, phase: 'phase4_fail_closed_voice_identity', speakerHint: rawSpeakerHint, claimedSpeaker,
    detectedSpeakerId, speakerConfidence, speakerConfidenceBand: band, voiceMatchStatus,
    voiceProfileEnrolled: speakerRegistry.matched === true, speakerRegistry,
    speakerRegistryAvailable: speakerRegistry.available === true, speakerRegistryMatched: speakerRegistry.matched === true,
    speakerRegistryStatus: speakerRegistry.enrollmentStatus || 'unknown', speakerRegistryRoleBinding: speakerRegistry.roleBinding || 'blocked',
    speakerRegistryBlocked, speakerRegistryVersion: speakerRegistry.version || '', profileMetadataOnly: true,
    voiceprintStored: false, voiceChallenge: challengeEvidence, voiceChallengeVersion: challengeEvidence.challengeVersion || '',
    voiceContinuity: continuityEvidence, voiceContinuityVersion: continuityEvidence.continuityWindowVersion || '',
    trustedVoiceWindowActive, continuityWindowVerified, continuityStatus: continuityEvidence.continuityStatus || 'unknown',
    continuityPreventsSessionDrift: true, continuityIsAuthority: false, liveChallengeRequired,
    liveChallengeVerified, challengeBlocked, challengeStatus: challengeEvidence.challengeStatus || 'unknown',
    challengePreventsReplay: true, challengeIsAuthority: false, speakerHintTrusted, speakerClaimTrusted,
    adminVerified, remoteTrustedUserVerified, sessionVerified: ctx.sessionVerified,
    sessionRole: ctx.role || 'blocked', roleBinding, voiceIdentityBoundary: true, identityIsAuthority: false,
    authorityStillRequiresRBAC: true, dangerousActionRequiresEscalation: true,
    rawAudioStored: false, audioStored: false, voiceStored: false, transcriptOnly: true, reason
  };
}

function sanitizeEnvelope(value, depth = 0, seen = new WeakSet()) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return safeText(value, 4000);
  if (typeof value !== 'object' || depth > 5 || seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < Math.min(value.length, 40); i += 1) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (d && Object.prototype.hasOwnProperty.call(d, 'value')) { const x = sanitizeEnvelope(d.value, depth + 1, seen); if (x !== undefined) out.push(x); }
    }
    return out;
  }
  const out = {};
  let descriptors;
  try { descriptors = Object.getOwnPropertyDescriptors(value); } catch (_) { return out; }
  for (const key of Object.keys(descriptors).slice(0, 80)) {
    if (/^(?:rawaudio|audio|audioBlob|blob|buffer|voiceprint|biometric|authorization|token|secret|password|cookie|api[_-]?key)$/i.test(key) || /(?:raw.?audio|voiceprint|biometric|credential|password|cookie|api[_-]?key)/i.test(key)) continue;
    const d = descriptors[key];
    if (!d || !Object.prototype.hasOwnProperty.call(d, 'value')) continue;
    const x = sanitizeEnvelope(d.value, depth + 1, seen);
    if (x !== undefined) out[key] = x;
  }
  return out;
}
function applyVoiceSpeakerIdentityEnvelope(envelope, options) {
  const env = isObject(envelope) ? envelope : {};
  const out = sanitizeEnvelope(env) || {};
  const identity = resolveVoiceSpeakerIdentity(env, options);
  return Object.assign(out, {
    speakerIdentity: identity, voiceIdentity: identity, speakerIdentityVersion: VERSION,
    voiceIdentityBoundary: true, identityIsAuthority: false, authorityStillRequiresRBAC: true,
    claimedSpeaker: identity.claimedSpeaker, detectedSpeakerId: identity.detectedSpeakerId,
    speakerConfidence: identity.speakerConfidence, speakerConfidenceBand: identity.speakerConfidenceBand,
    voiceMatchStatus: identity.voiceMatchStatus, speakerRegistry: identity.speakerRegistry,
    speakerRegistryAvailable: identity.speakerRegistryAvailable, speakerRegistryMatched: identity.speakerRegistryMatched,
    speakerRegistryStatus: identity.speakerRegistryStatus, speakerRegistryRoleBinding: identity.speakerRegistryRoleBinding,
    speakerRegistryBlocked: identity.speakerRegistryBlocked, profileMetadataOnly: true, voiceprintStored: false,
    voiceChallenge: identity.voiceChallenge, voiceChallengeVersion: identity.voiceChallengeVersion,
    voiceContinuity: identity.voiceContinuity, voiceContinuityVersion: identity.voiceContinuityVersion,
    trustedVoiceWindowActive: identity.trustedVoiceWindowActive, continuityWindowVerified: identity.continuityWindowVerified,
    continuityStatus: identity.continuityStatus, continuityPreventsSessionDrift: true, continuityIsAuthority: false,
    liveChallengeRequired: identity.liveChallengeRequired, liveChallengeVerified: identity.liveChallengeVerified,
    challengeBlocked: identity.challengeBlocked, challengeStatus: identity.challengeStatus,
    challengePreventsReplay: true, challengeIsAuthority: false, speakerHintTrusted: identity.speakerHintTrusted,
    speakerRoleBinding: identity.roleBinding, rawAudioStored: false, audioStored: false, voiceStored: false, transcriptOnly: true
  });
}
function isVoiceSpeakerIdentityTrusted(identity) {
  const item = isObject(identity) ? identity : {};
  return (item.adminVerified === true || item.remoteTrustedUserVerified === true) && item.sessionVerified === true && item.challengeBlocked !== true && item.speakerRegistryBlocked !== true;
}

module.exports = {
  VERSION, SPEAKER_CONFIDENCE, ROLE_BINDINGS, normalizeSpeakerLabel, clampSpeakerConfidence,
  confidenceBand, normalizeVoiceMatchStatus, resolveVoiceSpeakerIdentity, applyVoiceSpeakerIdentityEnvelope,
  isVoiceSpeakerIdentityTrusted, hasAdminProof, hasRemoteTrustedProof, speakerRegistryEvidenceForIdentity,
  challengeEvidenceForIdentity, continuityEvidenceForIdentity, continuityWindowMod
};
