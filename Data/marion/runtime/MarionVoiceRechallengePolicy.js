'use strict';

/**
 * MarionVoiceRechallengePolicy
 * Phase 8 voice authority expiration / re-challenge policy.
 *
 * Mission:
 * - A trusted voice continuity window must expire safely.
 * - Expired/stale voice continuity must downgrade to re-challenge required.
 * - Re-challenge policy is evidence/control flow only; it is never authority.
 *
 * Hardlocks:
 * - rawAudioStored: false
 * - voiceprintStored: false
 * - biometricTemplateStored: false
 * - transcriptOnly: true
 * - identityIsAuthority: false
 * - challengeIsAuthority: false
 * - continuityIsAuthority: false
 * - rechallengeIsAuthority: false
 * - authorityStillRequiresRBAC: true
 */

const VERSION = 'marion.voiceRechallengePolicy/1.0-phase8-authority-expiration-boundary';

const DEFAULT_OWNER_CONTINUITY_TTL_MS = clampNumber(
  process.env.SB_MARION_OWNER_VOICE_CONTINUITY_TTL_MS,
  5 * 60 * 1000,
  30 * 1000,
  15 * 60 * 1000
);

const DEFAULT_REMOTE_CONTINUITY_TTL_MS = clampNumber(
  process.env.SB_MARION_REMOTE_VOICE_CONTINUITY_TTL_MS,
  2 * 60 * 1000,
  15 * 1000,
  10 * 60 * 1000
);

const DEFAULT_OBSERVER_CONTINUITY_TTL_MS = clampNumber(
  process.env.SB_MARION_OBSERVER_VOICE_CONTINUITY_TTL_MS,
  60 * 1000,
  10 * 1000,
  5 * 60 * 1000
);

const DEFAULT_SENSITIVE_ACTION_TTL_MS = clampNumber(
  process.env.SB_MARION_SENSITIVE_VOICE_ACTION_TTL_MS,
  45 * 1000,
  10 * 1000,
  5 * 60 * 1000
);

const DEFAULT_CHALLENGE_FRESHNESS_MS = clampNumber(
  process.env.SB_MARION_VOICE_CHALLENGE_FRESHNESS_MS,
  90 * 1000,
  10 * 1000,
  5 * 60 * 1000
);

const DECISIONS = Object.freeze({
  ALLOW: 'allow',
  REQUIRE_RECHALLENGE: 'require_rechallenge',
  BLOCK: 'block'
});

const REASONS = Object.freeze({
  ACTIVE: 'trusted_voice_window_active',
  NO_WINDOW: 'trusted_voice_window_missing',
  EXPIRED: 'trusted_voice_window_expired',
  REVOKED: 'trusted_voice_window_revoked',
  STALE: 'trusted_voice_window_stale',
  SESSION_MISMATCH: 'trusted_voice_window_session_mismatch',
  SPEAKER_MISMATCH: 'trusted_voice_window_speaker_mismatch',
  CHALLENGE_MISSING: 'live_challenge_missing',
  CHALLENGE_STALE: 'live_challenge_stale',
  CHALLENGE_NOT_VERIFIED: 'live_challenge_not_verified',
  SENSITIVE_ACTION_STALE: 'sensitive_voice_action_requires_fresh_challenge',
  ROLE_BLOCKED: 'role_blocked',
  UNKNOWN: 'unknown'
});

const ROLE_BINDINGS = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  REMOTE_TRUSTED_USER: 'remote_trusted_user',
  OBSERVER: 'observer',
  BLOCKED: 'blocked'
});

const SENSITIVE_CAPABILITY_RX = /command|approve|deny|emergency|escalation|registry|enroll|revoke|delete|deploy|publish|send|transfer|payment|admin|owner|roles?/i;

function now() {
  return Date.now();
}

function iso(ts) {
  const n = Number(ts || now());
  return new Date(Number.isFinite(n) ? n : now()).toISOString();
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function safeText(value, maxLength) {
  const max = Number.isFinite(Number(maxLength)) ? Math.max(1, Math.min(Number(maxLength), 500)) : 160;
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeKey(value, maxLength) {
  return safeText(value, maxLength || 160)
    .toLowerCase()
    .replace(/[^a-z0-9._:@/-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeRole(value) {
  const raw = normalizeKey(value, 80);
  if (raw === 'owner' || raw === 'admin_owner') return ROLE_BINDINGS.OWNER;
  if (raw === 'admin' || raw === 'administrator' || raw === 'admin_operator') return ROLE_BINDINGS.ADMIN;
  if (raw === 'remote_trusted_user' || raw === 'trusted_remote_user' || raw === 'remote_user') return ROLE_BINDINGS.REMOTE_TRUSTED_USER;
  if (raw === 'observer' || raw === 'viewer' || raw === 'read_only') return ROLE_BINDINGS.OBSERVER;
  return ROLE_BINDINGS.BLOCKED;
}

function firstNonEmpty() {
  for (const item of Array.from(arguments)) {
    const text = safeText(item, 220);
    if (text) return text;
  }
  return '';
}

function firstNumber() {
  for (const item of Array.from(arguments)) {
    const n = Number(item);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function isSensitiveVoiceAction(input, context) {
  const src = input && typeof input === 'object' ? input : {};
  const ctx = context && typeof context === 'object' ? context : {};
  const capability = firstNonEmpty(
    src.capability,
    src.requiredCapability,
    src.action,
    src.intent,
    src.command,
    ctx.capability,
    ctx.requiredCapability,
    ctx.action,
    ctx.intent
  );

  if (!capability) return false;
  return SENSITIVE_CAPABILITY_RX.test(capability);
}

function maxContinuityTtlForRole(role, sensitive) {
  const normalized = normalizeRole(role);
  if (sensitive) return DEFAULT_SENSITIVE_ACTION_TTL_MS;
  if (normalized === ROLE_BINDINGS.OWNER || normalized === ROLE_BINDINGS.ADMIN) return DEFAULT_OWNER_CONTINUITY_TTL_MS;
  if (normalized === ROLE_BINDINGS.REMOTE_TRUSTED_USER) return DEFAULT_REMOTE_CONTINUITY_TTL_MS;
  if (normalized === ROLE_BINDINGS.OBSERVER) return DEFAULT_OBSERVER_CONTINUITY_TTL_MS;
  return 0;
}

function publicPolicy(decision, reason, detail) {
  const src = detail && typeof detail === 'object' ? detail : {};
  const t = now();

  return {
    ok: decision === DECISIONS.ALLOW,
    decision,
    reason: reason || REASONS.UNKNOWN,
    at: iso(t),
    version: VERSION,

    phase: 8,
    voiceAuthorityExpirationBoundary: true,
    rechallengePolicyActive: true,

    trustedVoiceWindowActive: decision === DECISIONS.ALLOW,
    rechallengeRequired: decision !== DECISIONS.ALLOW,
    reChallengeRequired: decision !== DECISIONS.ALLOW,
    requiresFreshChallenge: decision !== DECISIONS.ALLOW,

    roleBinding: normalizeRole(src.roleBinding || src.role || ''),
    speakerId: safeText(src.speakerId || '', 160) || null,
    sessionIdPresent: !!safeText(src.sessionId || '', 160),
    windowId: safeText(src.windowId || src.continuityWindowId || '', 160) || null,

    openedAt: src.openedAt || null,
    expiresAt: src.expiresAt || null,
    ageMs: Number.isFinite(Number(src.ageMs)) ? Number(src.ageMs) : null,
    maxTtlMs: Number.isFinite(Number(src.maxTtlMs)) ? Number(src.maxTtlMs) : null,
    remainingMs: Number.isFinite(Number(src.remainingMs)) ? Math.max(0, Number(src.remainingMs)) : null,

    sessionMatched: src.sessionMatched === true,
    speakerMatched: src.speakerMatched === true,
    sensitiveVoiceAction: src.sensitiveVoiceAction === true,

    liveChallengeVerified: src.liveChallengeVerified === true && decision === DECISIONS.ALLOW,
    challengeFresh: src.challengeFresh === true && decision === DECISIONS.ALLOW,
    challengeIsAuthority: false,
    continuityIsAuthority: false,
    rechallengeIsAuthority: false,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,

    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    biometricTemplateStored: false,
    transcriptOnly: true
  };
}

function normalizeContinuityWindow(input) {
  const src = input && typeof input === 'object' ? input : {};
  const window = src.window && typeof src.window === 'object' ? src.window : {};
  const continuity = src.continuity && typeof src.continuity === 'object' ? src.continuity : {};
  const data = src.data && typeof src.data === 'object' ? src.data : {};

  const merged = Object.assign({}, data, continuity, window, src);

  const openedAt = firstNumber(merged.openedAtMs, merged.openedAt, merged.createdAtMs, merged.createdAt);
  const expiresAt = firstNumber(merged.expiresAtMs, merged.expiresAt);
  const revokedAt = firstNumber(merged.revokedAtMs, merged.revokedAt);
  const checkedAt = now();

  return {
    windowId: firstNonEmpty(
      merged.windowId,
      merged.continuityWindowId,
      merged.id,
      merged.trustedVoiceWindowId
    ),
    speakerId: normalizeKey(firstNonEmpty(
      merged.speakerId,
      merged.detectedSpeakerId,
      merged.claimedSpeaker,
      merged.speakerHint
    ), 160),
    sessionId: safeText(firstNonEmpty(
      merged.sessionId,
      merged.adminSessionId,
      merged.voiceSessionId
    ), 160),
    roleBinding: normalizeRole(firstNonEmpty(
      merged.roleBinding,
      merged.role,
      merged.sessionRole
    )),
    state: normalizeKey(firstNonEmpty(
      merged.state,
      merged.status,
      merged.windowState
    ), 80),
    openedAt,
    expiresAt,
    revokedAt,
    checkedAt,
    trustedVoiceWindowActive:
      merged.trustedVoiceWindowActive === true ||
      merged.active === true ||
      merged.ok === true,
    liveChallengeVerified:
      merged.liveChallengeVerified === true ||
      merged.voiceChallengeVerified === true ||
      merged.challengeVerified === true,
    challengeId: safeText(firstNonEmpty(
      merged.challengeId,
      merged.voiceChallengeId
    ), 160)
  };
}

function normalizeChallengeEvidence(input) {
  const src = input && typeof input === 'object' ? input : {};
  const challenge = src.challenge && typeof src.challenge === 'object' ? src.challenge : {};
  const data = src.data && typeof src.data === 'object' ? src.data : {};
  const merged = Object.assign({}, data, challenge, src);

  const verifiedAt = firstNumber(merged.verifiedAtMs, merged.verifiedAt, merged.checkedAtMs, merged.checkedAt);
  const expiresAt = firstNumber(merged.challengeExpiresAtMs, merged.challengeExpiresAt, merged.expiresAtMs, merged.expiresAt);
  const t = now();

  const verified =
    merged.liveChallengeVerified === true ||
    merged.voiceChallengeVerified === true ||
    merged.challengeVerified === true ||
    merged.state === 'verified';

  const freshByVerifiedAt = verifiedAt > 0 ? (t - verifiedAt <= DEFAULT_CHALLENGE_FRESHNESS_MS) : false;
  const freshByExpiresAt = expiresAt > 0 ? (expiresAt > t) : false;

  return {
    challengeId: safeText(firstNonEmpty(merged.challengeId, merged.voiceChallengeId, merged.id), 160),
    verified,
    verifiedAt,
    expiresAt,
    fresh: verified === true && (freshByVerifiedAt || freshByExpiresAt),
    ageMs: verifiedAt > 0 ? Math.max(0, t - verifiedAt) : null
  };
}

function evaluateRechallengePolicy(input, context, options) {
  const src = input && typeof input === 'object' ? input : {};
  const ctx = context && typeof context === 'object' ? context : {};
  const opts = options && typeof options === 'object' ? options : {};

  const continuity = normalizeContinuityWindow(src.continuity || src.window || src);
  const challenge = normalizeChallengeEvidence(src.challenge || src);

  const t = now();

  const requestedSpeakerId = normalizeKey(firstNonEmpty(
    src.speakerId,
    src.detectedSpeakerId,
    src.claimedSpeaker,
    ctx.speakerId,
    ctx.detectedSpeakerId,
    ctx.claimedSpeaker
  ), 160);

  const requestedSessionId = safeText(firstNonEmpty(
    src.sessionId,
    ctx.sessionId,
    src.adminSessionId,
    ctx.adminSessionId
  ), 160);

  const roleBinding = normalizeRole(firstNonEmpty(
    src.roleBinding,
    ctx.roleBinding,
    continuity.roleBinding,
    src.role,
    ctx.role,
    ctx.sessionRole
  ));

  const sensitiveVoiceAction = isSensitiveVoiceAction(src, ctx);
  const maxTtlMs = clampNumber(
    opts.maxTtlMs,
    maxContinuityTtlForRole(roleBinding, sensitiveVoiceAction),
    0,
    24 * 60 * 60 * 1000
  );

  const openedAt = Number(continuity.openedAt || 0);
  const expiresAt = Number(continuity.expiresAt || 0);
  const ageMs = openedAt > 0 ? Math.max(0, t - openedAt) : null;
  const remainingMs = expiresAt > 0 ? Math.max(0, expiresAt - t) : null;

  const detail = {
    roleBinding,
    speakerId: continuity.speakerId || requestedSpeakerId,
    sessionId: continuity.sessionId || requestedSessionId,
    windowId: continuity.windowId,
    openedAt: openedAt ? iso(openedAt) : null,
    expiresAt: expiresAt ? iso(expiresAt) : null,
    ageMs,
    maxTtlMs,
    remainingMs,
    sensitiveVoiceAction,
    liveChallengeVerified: challenge.verified,
    challengeFresh: challenge.fresh,
    sessionMatched: !!continuity.sessionId && !!requestedSessionId && continuity.sessionId === requestedSessionId,
    speakerMatched: !!continuity.speakerId && !!requestedSpeakerId && continuity.speakerId === requestedSpeakerId
  };

  if (roleBinding === ROLE_BINDINGS.BLOCKED) {
    return publicPolicy(DECISIONS.BLOCK, REASONS.ROLE_BLOCKED, detail);
  }

  if (!continuity.windowId || continuity.trustedVoiceWindowActive !== true) {
    return publicPolicy(DECISIONS.REQUIRE_RECHALLENGE, REASONS.NO_WINDOW, detail);
  }

  if (continuity.revokedAt > 0 || continuity.state === 'revoked') {
    return publicPolicy(DECISIONS.REQUIRE_RECHALLENGE, REASONS.REVOKED, detail);
  }

  if (!continuity.sessionId || !requestedSessionId || continuity.sessionId !== requestedSessionId) {
    detail.sessionMatched = false;
    return publicPolicy(DECISIONS.BLOCK, REASONS.SESSION_MISMATCH, detail);
  }

  if (!continuity.speakerId || !requestedSpeakerId || continuity.speakerId !== requestedSpeakerId) {
    detail.speakerMatched = false;
    return publicPolicy(DECISIONS.BLOCK, REASONS.SPEAKER_MISMATCH, detail);
  }

  if (expiresAt > 0 && expiresAt <= t) {
    return publicPolicy(DECISIONS.REQUIRE_RECHALLENGE, REASONS.EXPIRED, detail);
  }

  if (openedAt <= 0) {
    return publicPolicy(DECISIONS.REQUIRE_RECHALLENGE, REASONS.STALE, detail);
  }

  if (maxTtlMs <= 0 || (ageMs != null && ageMs > maxTtlMs)) {
    return publicPolicy(
      DECISIONS.REQUIRE_RECHALLENGE,
      sensitiveVoiceAction ? REASONS.SENSITIVE_ACTION_STALE : REASONS.STALE,
      detail
    );
  }

  return publicPolicy(DECISIONS.ALLOW, REASONS.ACTIVE, detail);
}

function requireFreshChallengeForOpen(input, context, options) {
  const challenge = normalizeChallengeEvidence(input && (input.challenge || input));
  const ctx = context && typeof context === 'object' ? context : {};
  const sessionVerified = ctx.sessionVerified === true;

  if (!sessionVerified) {
    return publicPolicy(DECISIONS.BLOCK, 'session_required_before_continuity_open', {
      roleBinding: normalizeRole(ctx.role || ctx.sessionRole || ''),
      liveChallengeVerified: false,
      challengeFresh: false
    });
  }

  if (!challenge.challengeId) {
    return publicPolicy(DECISIONS.REQUIRE_RECHALLENGE, REASONS.CHALLENGE_MISSING, {
      roleBinding: normalizeRole(ctx.role || ctx.sessionRole || ''),
      liveChallengeVerified: false,
      challengeFresh: false
    });
  }

  if (challenge.verified !== true) {
    return publicPolicy(DECISIONS.REQUIRE_RECHALLENGE, REASONS.CHALLENGE_NOT_VERIFIED, {
      roleBinding: normalizeRole(ctx.role || ctx.sessionRole || ''),
      liveChallengeVerified: false,
      challengeFresh: false
    });
  }

  if (challenge.fresh !== true) {
    return publicPolicy(DECISIONS.REQUIRE_RECHALLENGE, REASONS.CHALLENGE_STALE, {
      roleBinding: normalizeRole(ctx.role || ctx.sessionRole || ''),
      liveChallengeVerified: true,
      challengeFresh: false
    });
  }

  return publicPolicy(DECISIONS.ALLOW, 'fresh_challenge_verified_for_continuity_open', {
    roleBinding: normalizeRole(ctx.role || ctx.sessionRole || ''),
    liveChallengeVerified: true,
    challengeFresh: true
  });
}

function policyHealth() {
  return {
    ok: true,
    version: VERSION,
    phase: 8,
    service: 'marion-voice-rechallenge-policy',
    marker: 'MARION-VOICE-RECHALLENGE-POLICY-V1',
    rechallengePolicyActive: true,
    ownerContinuityTtlMs: DEFAULT_OWNER_CONTINUITY_TTL_MS,
    remoteTrustedContinuityTtlMs: DEFAULT_REMOTE_CONTINUITY_TTL_MS,
    observerContinuityTtlMs: DEFAULT_OBSERVER_CONTINUITY_TTL_MS,
    sensitiveActionTtlMs: DEFAULT_SENSITIVE_ACTION_TTL_MS,
    challengeFreshnessMs: DEFAULT_CHALLENGE_FRESHNESS_MS,
    identityIsAuthority: false,
    challengeIsAuthority: false,
    continuityIsAuthority: false,
    rechallengeIsAuthority: false,
    authorityStillRequiresRBAC: true,
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    biometricTemplateStored: false,
    transcriptOnly: true
  };
}

module.exports = {
  VERSION,
  DECISIONS,
  REASONS,
  ROLE_BINDINGS,
  DEFAULT_OWNER_CONTINUITY_TTL_MS,
  DEFAULT_REMOTE_CONTINUITY_TTL_MS,
  DEFAULT_OBSERVER_CONTINUITY_TTL_MS,
  DEFAULT_SENSITIVE_ACTION_TTL_MS,
  DEFAULT_CHALLENGE_FRESHNESS_MS,
  policyHealth,
  evaluateRechallengePolicy,
  requireFreshChallengeForOpen,
  normalizeContinuityWindow,
  normalizeChallengeEvidence,
  isSensitiveVoiceAction
};
