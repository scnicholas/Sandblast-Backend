'use strict';

/**
 * MarionVoiceSpeakerRegistry
 * Phase 5 speaker enrollment / registry control.
 *
 * This registry is metadata-only by design. It never accepts or stores raw audio,
 * voiceprints, tokens, cookies, authorization headers, or biometric payloads.
 * Speaker enrollment is evidence for the voice lane; it is not authority and it
 * never bypasses RBAC/session/escalation controls.
 */

const crypto = require('crypto');

const VERSION = 'marion.voiceSpeakerRegistry/1.1-phase6-challenge-aware-registry';

const REGISTRY_STATES = Object.freeze({
  UNKNOWN: 'unknown',
  PENDING_ENROLLMENT: 'pending_enrollment',
  TRUSTED_METADATA_ONLY: 'trusted_metadata_only',
  REMOTE_TRUSTED_USER: 'remote_trusted_user',
  OWNER_VERIFIED: 'owner_verified',
  REVOKED: 'revoked',
  BLOCKED: 'blocked'
});

const ROLE_BINDINGS = Object.freeze({
  OWNER: 'owner',
  REMOTE_TRUSTED_USER: 'remote_trusted_user',
  OBSERVER: 'observer',
  BLOCKED: 'blocked'
});

const RAW_AUDIO_KEYS = Object.freeze([
  'rawAudio', 'audio', 'audioBlob', 'blob', 'buffer', 'voiceprint',
  'voicePrint', 'biometricTemplate', 'biometric', 'sample', 'samples'
]);

const SENSITIVE_KEY_RX = /token|secret|password|cookie|authorization|api[_-]?key|bearer|x-sb-|rawaudio|audio|blob|buffer|voiceprint|biometric/i;

const speakerProfiles = new Map();
const enrollmentRequests = new Map();

function now() {
  return Date.now();
}

function iso(ts) {
  const n = Number(ts || now());
  return new Date(Number.isFinite(n) ? n : now()).toISOString();
}

function safeText(value, maxLength) {
  const max = Number.isFinite(Number(maxLength)) ? Math.max(1, Math.min(Number(maxLength), 500)) : 160;
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeSpeakerId(value) {
  return safeText(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9._:@/-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

function generatedSpeakerId(seed) {
  const base = safeText(seed || 'speaker', 160) || 'speaker';
  return 'spk_' + crypto.createHash('sha256').update(base + '|' + now() + '|' + crypto.randomBytes(8).toString('hex')).digest('hex').slice(0, 24);
}

function registryId(prefix) {
  return String(prefix || 'reg') + '_' + crypto.randomBytes(12).toString('hex');
}

function normalizeRoleBinding(value) {
  const raw = safeText(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (raw === 'owner' || raw === 'admin' || raw === 'administrator') return ROLE_BINDINGS.OWNER;
  if (raw === 'remote_trusted_user' || raw === 'remote_user' || raw === 'trusted_remote_user') return ROLE_BINDINGS.REMOTE_TRUSTED_USER;
  if (raw === 'observer' || raw === 'viewer' || raw === 'read_only') return ROLE_BINDINGS.OBSERVER;
  return ROLE_BINDINGS.BLOCKED;
}

function stateForRole(role) {
  const binding = normalizeRoleBinding(role);
  if (binding === ROLE_BINDINGS.OWNER) return REGISTRY_STATES.OWNER_VERIFIED;
  if (binding === ROLE_BINDINGS.REMOTE_TRUSTED_USER) return REGISTRY_STATES.REMOTE_TRUSTED_USER;
  if (binding === ROLE_BINDINGS.OBSERVER) return REGISTRY_STATES.TRUSTED_METADATA_ONLY;
  return REGISTRY_STATES.BLOCKED;
}

function normalizeState(value) {
  const raw = safeText(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return Object.values(REGISTRY_STATES).includes(raw) ? raw : REGISTRY_STATES.UNKNOWN;
}

function contextRole(context) {
  const ctx = context && typeof context === 'object' ? context : {};
  return normalizeRoleBinding(ctx.role || ctx.sessionRole || ctx.adminRole || '');
}

function isOwnerContext(context) {
  return contextRole(context) === ROLE_BINDINGS.OWNER || (context && context.ownerVerified === true) || (context && context.adminVerified === true && context.role === 'owner');
}

function isAdminLikeContext(context) {
  return isOwnerContext(context) || (context && context.adminVerified === true && contextRole(context) !== ROLE_BINDINGS.BLOCKED);
}

function sanitizeMetadata(value, depth) {
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 3) return '[max_depth]';
  if (value == null) return value;
  if (typeof value === 'string') return SENSITIVE_KEY_RX.test(value) ? '[redacted]' : safeText(value, 300);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => sanitizeMetadata(item, level + 1));
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).slice(0, 24).forEach((key) => {
      if (SENSITIVE_KEY_RX.test(key) || RAW_AUDIO_KEYS.includes(key)) return;
      out[key] = sanitizeMetadata(value[key], level + 1);
    });
    return out;
  }
  return String(value);
}

function firstSpeakerCandidate(input) {
  const src = input && typeof input === 'object' ? input : {};
  return normalizeSpeakerId(src.speakerId || src.detectedSpeakerId || src.claimedSpeaker || src.speakerHint || src.displayName || src.name || '');
}

function publicProfile(profile) {
  if (!profile) return null;
  return {
    speakerId: profile.speakerId,
    displayName: profile.displayName,
    roleBinding: profile.roleBinding,
    enrollmentStatus: profile.enrollmentStatus,
    voiceProfileStatus: profile.voiceProfileStatus,
    allowedChannels: Array.isArray(profile.allowedChannels) ? profile.allowedChannels.slice(0, 12) : [],
    allowedCapabilities: Array.isArray(profile.allowedCapabilities) ? profile.allowedCapabilities.slice(0, 24) : [],
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    lastVerifiedAt: profile.lastVerifiedAt || null,
    revokedAt: profile.revokedAt || null,
    riskFlags: Array.isArray(profile.riskFlags) ? profile.riskFlags.slice(0, 12) : [],
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    profileMetadataOnly: true,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    liveChallengeRequired: true,
    challengeVerificationRequired: true,
    challengePreventsReplay: true,
    challengeIsAuthority: false,
    spoofResistanceBoundary: true
  };
}

function publicRequest(request) {
  if (!request) return null;
  return {
    requestId: request.requestId,
    speakerId: request.speakerId,
    displayName: request.displayName,
    requestedRoleBinding: request.requestedRoleBinding,
    enrollmentStatus: request.enrollmentStatus,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    decidedAt: request.decidedAt || null,
    decidedByRole: request.decidedByRole || '',
    reason: request.reason || '',
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    profileMetadataOnly: true,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    liveChallengeRequired: true,
    challengeVerificationRequired: true,
    challengePreventsReplay: true,
    challengeIsAuthority: false,
    spoofResistanceBoundary: true
  };
}

function capabilitiesForRole(role) {
  const binding = normalizeRoleBinding(role);
  if (binding === ROLE_BINDINGS.OWNER) return ['voice.private.submit', 'voice.private.receive', 'speaker.registry.owner'];
  if (binding === ROLE_BINDINGS.REMOTE_TRUSTED_USER) return ['voice.private.submit', 'voice.private.receive'];
  if (binding === ROLE_BINDINGS.OBSERVER) return ['status.read'];
  return [];
}

function channelsForRole(role) {
  const binding = normalizeRoleBinding(role);
  if (binding === ROLE_BINDINGS.OWNER) return ['marion_admin_voice', 'lingosentinel_private_voice'];
  if (binding === ROLE_BINDINGS.REMOTE_TRUSTED_USER) return ['remote_trusted_voice', 'lingosentinel_remote_trusted_voice'];
  if (binding === ROLE_BINDINGS.OBSERVER) return ['observer_status'];
  return [];
}

function health() {
  return {
    ok: true,
    service: 'marion-voice-speaker-registry',
    version: VERSION,
    phase: 'phase6_challenge_aware_speaker_registry',
    routeMounted: true,
    metadataOnly: true,
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    liveChallengeRequired: true,
    challengeVerificationRequired: true,
    challengePreventsReplay: true,
    challengeIsAuthority: false,
    supportedStates: Object.values(REGISTRY_STATES),
    supportedRoles: Object.values(ROLE_BINDINGS),
    counts: {
      profiles: speakerProfiles.size,
      pendingRequests: Array.from(enrollmentRequests.values()).filter((item) => item.enrollmentStatus === REGISTRY_STATES.PENDING_ENROLLMENT).length,
      requests: enrollmentRequests.size
    }
  };
}

function requestEnrollment(input, context) {
  if (!isOwnerContext(context)) {
    return { ok: false, statusCode: 403, stage: 'speaker_registry_enrollment_owner_required', reason: 'owner_session_required_for_enrollment_request', registry: health() };
  }
  const src = input && typeof input === 'object' ? input : {};
  const displayName = safeText(src.displayName || src.name || src.claimedSpeaker || src.speakerHint || '', 160);
  const speakerId = firstSpeakerCandidate(src) || generatedSpeakerId(displayName || 'speaker');
  const requestedRoleBinding = normalizeRoleBinding(src.roleBinding || src.requestedRoleBinding || src.role || ROLE_BINDINGS.OBSERVER);
  if (requestedRoleBinding === ROLE_BINDINGS.BLOCKED) {
    return { ok: false, statusCode: 400, stage: 'speaker_registry_invalid_role', reason: 'speaker_role_binding_required', speakerId, registry: health() };
  }
  const existing = speakerProfiles.get(speakerId);
  if (existing && existing.enrollmentStatus !== REGISTRY_STATES.REVOKED && existing.enrollmentStatus !== REGISTRY_STATES.BLOCKED) {
    return { ok: false, statusCode: 409, stage: 'speaker_registry_profile_exists', reason: 'speaker_already_registered', speaker: publicProfile(existing), registry: health() };
  }
  const t = now();
  const request = {
    requestId: registryId('ser'),
    speakerId,
    displayName,
    requestedRoleBinding,
    enrollmentStatus: REGISTRY_STATES.PENDING_ENROLLMENT,
    createdAt: iso(t),
    updatedAt: iso(t),
    requestedByRole: contextRole(context),
    reason: safeText(src.reason || src.note || '', 240),
    metadata: sanitizeMetadata(src.metadata || src.profile || {}),
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    profileMetadataOnly: true,
    liveChallengeRequired: true,
    challengeVerificationRequired: true,
    challengePreventsReplay: true,
    challengeIsAuthority: false
  };
  enrollmentRequests.set(request.requestId, request);
  return { ok: true, statusCode: 201, stage: 'speaker_registry_enrollment_requested', request: publicRequest(request), registry: health() };
}

function approveEnrollment(input, context) {
  if (!isOwnerContext(context)) {
    return { ok: false, statusCode: 403, stage: 'speaker_registry_approval_owner_required', reason: 'owner_session_required_for_enrollment_approval', registry: health() };
  }
  const src = input && typeof input === 'object' ? input : {};
  const requestId = safeText(src.requestId || src.enrollmentRequestId || '', 120);
  const request = enrollmentRequests.get(requestId);
  if (!request || request.enrollmentStatus !== REGISTRY_STATES.PENDING_ENROLLMENT) {
    return { ok: false, statusCode: 404, stage: 'speaker_registry_request_not_found', reason: 'pending_enrollment_request_not_found', requestId, registry: health() };
  }
  const roleBinding = normalizeRoleBinding(src.roleBinding || src.approvedRoleBinding || request.requestedRoleBinding);
  if (roleBinding === ROLE_BINDINGS.BLOCKED) {
    return { ok: false, statusCode: 400, stage: 'speaker_registry_invalid_approval_role', reason: 'approved_role_binding_required', request: publicRequest(request), registry: health() };
  }
  const t = now();
  const profile = {
    speakerId: request.speakerId,
    displayName: safeText(src.displayName || request.displayName || request.speakerId, 160),
    roleBinding,
    enrollmentStatus: stateForRole(roleBinding),
    voiceProfileStatus: 'metadata_only',
    allowedChannels: channelsForRole(roleBinding),
    allowedCapabilities: capabilitiesForRole(roleBinding),
    createdAt: request.createdAt,
    updatedAt: iso(t),
    lastVerifiedAt: iso(t),
    revokedAt: null,
    riskFlags: [],
    metadata: sanitizeMetadata(request.metadata || {}),
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    profileMetadataOnly: true,
    liveChallengeRequired: true,
    challengeVerificationRequired: true,
    challengePreventsReplay: true,
    challengeIsAuthority: false
  };
  request.enrollmentStatus = 'approved';
  request.decidedAt = iso(t);
  request.updatedAt = iso(t);
  request.decidedByRole = contextRole(context);
  speakerProfiles.set(profile.speakerId, profile);
  enrollmentRequests.set(request.requestId, request);
  return { ok: true, statusCode: 200, stage: 'speaker_registry_enrollment_approved', request: publicRequest(request), speaker: publicProfile(profile), registry: health() };
}

function denyEnrollment(input, context) {
  if (!isOwnerContext(context)) {
    return { ok: false, statusCode: 403, stage: 'speaker_registry_denial_owner_required', reason: 'owner_session_required_for_enrollment_denial', registry: health() };
  }
  const src = input && typeof input === 'object' ? input : {};
  const requestId = safeText(src.requestId || src.enrollmentRequestId || '', 120);
  const request = enrollmentRequests.get(requestId);
  if (!request || request.enrollmentStatus !== REGISTRY_STATES.PENDING_ENROLLMENT) {
    return { ok: false, statusCode: 404, stage: 'speaker_registry_request_not_found', reason: 'pending_enrollment_request_not_found', requestId, registry: health() };
  }
  const t = now();
  request.enrollmentStatus = 'denied';
  request.decidedAt = iso(t);
  request.updatedAt = iso(t);
  request.decidedByRole = contextRole(context);
  request.reason = safeText(src.reason || request.reason || 'denied_by_owner', 240);
  enrollmentRequests.set(request.requestId, request);
  return { ok: true, statusCode: 200, stage: 'speaker_registry_enrollment_denied', request: publicRequest(request), registry: health() };
}

function revokeSpeaker(input, context) {
  if (!isOwnerContext(context)) {
    return { ok: false, statusCode: 403, stage: 'speaker_registry_revoke_owner_required', reason: 'owner_session_required_for_speaker_revoke', registry: health() };
  }
  const src = input && typeof input === 'object' ? input : {};
  const speakerId = firstSpeakerCandidate(src);
  const profile = speakerProfiles.get(speakerId);
  if (!profile) {
    return { ok: false, statusCode: 404, stage: 'speaker_registry_speaker_not_found', reason: 'speaker_profile_not_found', speakerId, registry: health() };
  }
  const t = now();
  profile.enrollmentStatus = REGISTRY_STATES.REVOKED;
  profile.voiceProfileStatus = 'revoked';
  profile.revokedAt = iso(t);
  profile.updatedAt = iso(t);
  profile.riskFlags = Array.from(new Set([...(Array.isArray(profile.riskFlags) ? profile.riskFlags : []), 'revoked']));
  speakerProfiles.set(profile.speakerId, profile);
  return { ok: true, statusCode: 200, stage: 'speaker_registry_speaker_revoked', speaker: publicProfile(profile), registry: health() };
}

function checkSpeaker(input) {
  const speakerId = firstSpeakerCandidate(input);
  if (!speakerId) {
    return { ok: true, statusCode: 200, stage: 'speaker_registry_unknown', matched: false, enrollmentStatus: REGISTRY_STATES.UNKNOWN, speaker: null, registry: health() };
  }
  const profile = speakerProfiles.get(speakerId) || null;
  if (!profile) {
    return { ok: true, statusCode: 200, stage: 'speaker_registry_unknown', matched: false, speakerId, enrollmentStatus: REGISTRY_STATES.UNKNOWN, speaker: null, registry: health() };
  }
  const blocked = profile.enrollmentStatus === REGISTRY_STATES.REVOKED || profile.enrollmentStatus === REGISTRY_STATES.BLOCKED;
  return {
    ok: true,
    statusCode: 200,
    stage: blocked ? 'speaker_registry_blocked' : 'speaker_registry_matched',
    matched: true,
    speakerId: profile.speakerId,
    enrollmentStatus: profile.enrollmentStatus,
    roleBinding: profile.roleBinding,
    blocked,
    liveChallengeRequired: !blocked,
    challengeVerificationRequired: !blocked,
    challengePreventsReplay: true,
    challengeIsAuthority: false,
    speaker: publicProfile(profile),
    registry: health()
  };
}

function clearRegistryForTests() {
  speakerProfiles.clear();
  enrollmentRequests.clear();
  return health();
}

module.exports = {
  VERSION,
  REGISTRY_STATES,
  ROLE_BINDINGS,
  health,
  requestEnrollment,
  approveEnrollment,
  denyEnrollment,
  revokeSpeaker,
  checkSpeaker,
  publicProfile,
  publicRequest,
  normalizeSpeakerId,
  normalizeRoleBinding,
  normalizeState,
  sanitizeMetadata,
  clearRegistryForTests
};
