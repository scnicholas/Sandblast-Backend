"use strict";

/**
 * MarionVoiceContinuityWindow
 * Phase 7 voice session continuity / trusted conversation window boundary.
 *
 * A verified challenge may open a short trusted voice window for the same
 * speaker + protected session. The window is evidence only; it never grants
 * owner, admin, command, escalation, registry, or RBAC authority by itself.
 *
 * Privacy hardlock:
 * - rawAudioStored: false
 * - voiceprintStored: false
 * - biometricTemplateStored: false
 * - transcriptOnly: true
 */

const crypto = require("crypto");

const VERSION = "marion.voiceContinuityWindow/1.0-phase7-trusted-window-boundary";

const challengeVerifierMod = (() => {
  try {
    return require("./MarionVoiceChallengeVerifier");
  } catch (_) {
    return null;
  }
})();

const DEFAULT_TTL_MS = clampNumber(process.env.SB_MARION_VOICE_CONTINUITY_TTL_MS, 3 * 60 * 1000, 30 * 1000, 15 * 60 * 1000);
const DEFAULT_IDLE_MS = clampNumber(process.env.SB_MARION_VOICE_CONTINUITY_IDLE_MS, 75 * 1000, 15 * 1000, 5 * 60 * 1000);
const MAX_WINDOWS = clampNumber(process.env.SB_MARION_VOICE_CONTINUITY_MAX, 50, 1, 500);

const WINDOW_STATES = Object.freeze({
  UNKNOWN: "unknown",
  OPEN: "open",
  ACTIVE: "active",
  EXPIRED: "expired",
  REVOKED: "revoked",
  BLOCKED: "blocked"
});

const continuityWindows = new Map();
let lastSweepAt = 0;

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
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeSpeakerId(value) {
  return safeText(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9._:@/-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function normalizeRole(value) {
  const raw = safeText(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (raw === "owner" || raw === "admin" || raw === "administrator") return "owner";
  if (raw === "admin_operator" || raw === "operator") return "admin_operator";
  if (raw === "remote_trusted_user" || raw === "trusted_remote_user" || raw === "remote_user") return "remote_trusted_user";
  if (raw === "voice_user") return "voice_user";
  if (raw === "observer") return "observer";
  return "blocked";
}

function contextRole(context) {
  const ctx = context && typeof context === "object" ? context : {};
  return normalizeRole(ctx.role || ctx.sessionRole || ctx.adminRole || "");
}

function hasVerifiedSession(context) {
  return !!(context && context.sessionVerified === true && safeText(context.sessionId || "", 160));
}

function isContinuityContextAllowed(context) {
  const role = contextRole(context);
  return hasVerifiedSession(context) && (
    role === "owner" ||
    role === "admin_operator" ||
    role === "remote_trusted_user" ||
    role === "voice_user" ||
    (context && context.adminVerified === true) ||
    (context && context.remoteTrustedUserVerified === true)
  );
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function newWindowId() {
  return "mvcw_" + base64Url(crypto.randomBytes(18));
}

function newContinuityToken() {
  return "mvcwt_" + base64Url(crypto.randomBytes(32));
}

function windowIdFrom(input) {
  const src = input && typeof input === "object" ? input : {};
  return safeText(src.windowId || src.continuityWindowId || src.voiceWindowId || src.id || "", 160);
}

function continuityTokenFrom(input) {
  const src = input && typeof input === "object" ? input : {};
  return safeText(src.continuityToken || src.voiceContinuityToken || src.windowToken || src.token || "", 300);
}

function sessionIdFrom(input, context) {
  const src = input && typeof input === "object" ? input : {};
  const ctx = context && typeof context === "object" ? context : {};
  return safeText(src.sessionId || src.adminSessionId || ctx.sessionId || "", 160);
}

function speakerIdFrom(input) {
  const src = input && typeof input === "object" ? input : {};
  return normalizeSpeakerId(src.speakerId || src.detectedSpeakerId || src.claimedSpeaker || src.speakerHint || src.displayName || src.user || "");
}

function publicWindow(entry, options) {
  if (!entry) return null;
  const opts = options && typeof options === "object" ? options : {};
  const t = now();
  return {
    windowId: entry.windowId,
    speakerId: entry.speakerId,
    state: entry.state,
    roleBinding: entry.roleBinding,
    openedAt: entry.openedAt,
    lastSeenAt: entry.lastSeenAt,
    expiresAt: entry.expiresAt,
    idleExpiresAt: entry.idleExpiresAt,
    expiresInMs: Math.max(0, Number(entry.expiresAt || 0) - t),
    idleExpiresInMs: Math.max(0, Number(entry.idleExpiresAt || 0) - t),
    sessionBound: !!entry.sessionId,
    sessionIdPresent: !!entry.sessionId,
    challengeIdPresent: !!entry.challengeId,
    continuityToken: opts.includeToken === true ? entry.plainToken : undefined,
    trustedVoiceWindowActive: entry.state === WINDOW_STATES.OPEN || entry.state === WINDOW_STATES.ACTIVE,
    continuityWindowVerified: entry.state === WINDOW_STATES.OPEN || entry.state === WINDOW_STATES.ACTIVE,
    continuityIsAuthority: false,
    challengeIsAuthority: false,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    biometricTemplateStored: false,
    transcriptOnly: true
  };
}

function health() {
  sweep(false);
  return {
    ok: true,
    version: VERSION,
    phase: "phase7_voice_session_continuity_window",
    windowsActive: continuityWindows.size,
    ttlMs: DEFAULT_TTL_MS,
    idleMs: DEFAULT_IDLE_MS,
    maxWindows: MAX_WINDOWS,
    challengeRequiredToOpen: true,
    sessionBound: true,
    speakerBound: true,
    singleSessionWindow: true,
    continuityIsAuthority: false,
    challengeIsAuthority: false,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    biometricTemplateStored: false,
    transcriptOnly: true,
    challengeVerifierAvailable: !!challengeVerifierMod
  };
}

function sweep(force) {
  const t = now();
  if (!force && t - lastSweepAt < 30000) return;
  lastSweepAt = t;
  for (const [id, entry] of continuityWindows.entries()) {
    if (!entry || entry.state === WINDOW_STATES.REVOKED || Number(entry.expiresAt || 0) <= t || Number(entry.idleExpiresAt || 0) <= t) {
      continuityWindows.delete(id);
    }
  }
  if (continuityWindows.size > MAX_WINDOWS) {
    const entries = Array.from(continuityWindows.entries()).sort((a, b) => Number(a[1].lastSeenAt || 0) - Number(b[1].lastSeenAt || 0));
    while (continuityWindows.size > MAX_WINDOWS && entries.length) {
      const [id] = entries.shift();
      continuityWindows.delete(id);
    }
  }
}

function openContinuityWindow(input, context) {
  sweep(false);
  const src = input && typeof input === "object" ? input : {};
  const ctx = context && typeof context === "object" ? context : {};
  if (!isContinuityContextAllowed(ctx)) {
    return { ok: false, statusCode: 403, stage: "voice_continuity_session_required", reason: "short_lived_session_required_for_voice_continuity_window", health: health() };
  }
  if (!challengeVerifierMod || typeof challengeVerifierMod.checkChallenge !== "function") {
    return { ok: false, statusCode: 503, stage: "voice_continuity_challenge_verifier_unavailable", reason: "challenge_verifier_required_to_open_continuity_window", health: health() };
  }
  const speakerId = speakerIdFrom(src);
  const sessionId = sessionIdFrom(src, ctx);
  if (!speakerId) return { ok: false, statusCode: 400, stage: "voice_continuity_speaker_required", reason: "speaker_id_required", health: health() };
  if (!sessionId) return { ok: false, statusCode: 400, stage: "voice_continuity_session_required", reason: "session_id_required", health: health() };
  const challengeResult = challengeVerifierMod.checkChallenge(Object.assign({}, src, {
    speakerId,
    sessionId,
    challengeResponse: src.challengeResponse || src.responsePhrase || src.responseTranscript || src.response || src.answer || src.transcript || src.text || ""
  }), ctx);
  if (!challengeResult || challengeResult.ok === false || challengeResult.liveChallengeVerified !== true) {
    return {
      ok: false,
      statusCode: Number(challengeResult && challengeResult.statusCode || 403),
      stage: "voice_continuity_challenge_required",
      reason: safeText(challengeResult && (challengeResult.reason || challengeResult.stage) || "valid_live_challenge_required_to_open_continuity_window", 160),
      challenge: challengeResult || null,
      trustedVoiceWindowActive: false,
      continuityWindowVerified: false,
      health: health()
    };
  }
  const t = now();
  const windowId = newWindowId();
  const plainToken = newContinuityToken();
  const entry = {
    windowId,
    tokenHash: sha256(plainToken),
    plainToken,
    speakerId,
    sessionId,
    roleBinding: normalizeRole(src.roleBinding || src.requestedRole || ctx.role || ctx.sessionRole || ""),
    challengeId: safeText(src.challengeId || src.voiceChallengeId || "", 160),
    state: WINDOW_STATES.OPEN,
    openedAt: iso(t),
    lastSeenAt: iso(t),
    expiresAt: t + DEFAULT_TTL_MS,
    idleExpiresAt: t + DEFAULT_IDLE_MS,
    traceId: safeText(ctx.traceId || src.traceId || "", 160)
  };
  continuityWindows.set(windowId, entry);
  return {
    ok: true,
    statusCode: 200,
    stage: "voice_continuity_window_opened",
    continuityWindow: publicWindow(entry, { includeToken: true }),
    windowId,
    continuityToken: plainToken,
    speakerId,
    sessionIdPresent: true,
    trustedVoiceWindowActive: true,
    continuityWindowVerified: true,
    continuityRequiresFreshChallenge: true,
    continuityIsAuthority: false,
    challengeIsAuthority: false,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    biometricTemplateStored: false,
    transcriptOnly: true,
    health: health()
  };
}

function checkContinuityWindow(input, context) {
  sweep(false);
  const src = input && typeof input === "object" ? input : {};
  const ctx = context && typeof context === "object" ? context : {};
  if (!isContinuityContextAllowed(ctx)) {
    return { ok: false, statusCode: 403, stage: "voice_continuity_session_required", reason: "short_lived_session_required_for_voice_continuity_check", trustedVoiceWindowActive: false, health: health() };
  }
  const windowId = windowIdFrom(src);
  const token = continuityTokenFrom(src);
  if (!windowId || !token) return { ok: false, statusCode: 401, stage: "voice_continuity_token_required", reason: "continuity_window_id_and_token_required", trustedVoiceWindowActive: false, health: health() };
  const entry = continuityWindows.get(windowId);
  const t = now();
  if (!entry) return { ok: false, statusCode: 404, stage: "voice_continuity_not_found", reason: "continuity_window_not_found_or_expired", trustedVoiceWindowActive: false, health: health() };
  if (entry.tokenHash !== sha256(token)) return { ok: false, statusCode: 403, stage: "voice_continuity_token_mismatch", reason: "continuity_token_mismatch", trustedVoiceWindowActive: false, health: health() };
  if (Number(entry.expiresAt || 0) <= t || Number(entry.idleExpiresAt || 0) <= t) {
    continuityWindows.delete(windowId);
    return { ok: false, statusCode: 403, stage: "voice_continuity_expired", reason: "continuity_window_expired_rechallenge_required", trustedVoiceWindowActive: false, health: health() };
  }
  const sessionId = sessionIdFrom(src, ctx);
  if (entry.sessionId && sessionId && entry.sessionId !== sessionId) {
    return { ok: false, statusCode: 403, stage: "voice_continuity_session_mismatch", reason: "continuity_window_session_mismatch_rechallenge_required", trustedVoiceWindowActive: false, health: health() };
  }
  const speakerId = speakerIdFrom(src);
  if (entry.speakerId && speakerId && entry.speakerId !== speakerId) {
    return { ok: false, statusCode: 403, stage: "voice_continuity_speaker_mismatch", reason: "continuity_window_speaker_mismatch_rechallenge_required", trustedVoiceWindowActive: false, health: health() };
  }
  entry.state = WINDOW_STATES.ACTIVE;
  entry.lastSeenAt = iso(t);
  entry.idleExpiresAt = t + DEFAULT_IDLE_MS;
  continuityWindows.set(windowId, entry);
  return {
    ok: true,
    statusCode: 200,
    stage: "voice_continuity_window_verified",
    continuityWindow: publicWindow(entry),
    windowId,
    speakerId: entry.speakerId,
    sessionIdPresent: true,
    trustedVoiceWindowActive: true,
    continuityWindowVerified: true,
    continuityRequiresFreshChallenge: false,
    continuityIsAuthority: false,
    challengeIsAuthority: false,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    biometricTemplateStored: false,
    transcriptOnly: true,
    health: health()
  };
}

function revokeContinuityWindow(input, context) {
  sweep(false);
  const ctx = context && typeof context === "object" ? context : {};
  if (!isContinuityContextAllowed(ctx)) {
    return { ok: false, statusCode: 403, stage: "voice_continuity_session_required", reason: "short_lived_session_required_for_voice_continuity_revoke", health: health() };
  }
  const windowId = windowIdFrom(input);
  if (!windowId) return { ok: false, statusCode: 400, stage: "voice_continuity_revoke_missing_id", reason: "continuity_window_id_required", health: health() };
  const entry = continuityWindows.get(windowId);
  if (!entry) return { ok: false, statusCode: 404, stage: "voice_continuity_not_found", reason: "continuity_window_not_found_or_expired", health: health() };
  entry.state = WINDOW_STATES.REVOKED;
  entry.revokedAt = iso(now());
  continuityWindows.delete(windowId);
  return {
    ok: true,
    statusCode: 200,
    stage: "voice_continuity_window_revoked",
    continuityWindow: publicWindow(entry),
    trustedVoiceWindowActive: false,
    continuityWindowVerified: false,
    health: health()
  };
}

function evaluateContinuityEvidence(input, context) {
  const src = input && typeof input === "object" ? input : {};
  const ctx = context && typeof context === "object" ? context : {};
  const trustedServerContext = ctx.trustedServerAuth === true || ctx.serverSideAdminVoiceAuth === true || ctx.serverSideRemoteTrustedUserAuth === true || ctx.sessionVerified === true;
  const providedVerified = src.trustedVoiceWindowActive === true || src.continuityWindowVerified === true || src.voiceContinuityVerified === true || (src.voiceContinuity && src.voiceContinuity.trustedVoiceWindowActive === true);
  let checked = null;
  if (src.continuityToken || src.voiceContinuityToken || src.windowToken) {
    checked = checkContinuityWindow(src, ctx);
  }
  const active = checked ? checked.ok === true && checked.trustedVoiceWindowActive === true : (providedVerified && trustedServerContext);
  return {
    version: VERSION,
    continuityWindowRequired: src.continuityWindowRequired === true || src.voiceContinuityRequired === true || src.requireContinuityWindow === true,
    continuityWindowProvided: !!(src.continuityWindowId || src.windowId || src.continuityToken || src.voiceContinuity || providedVerified),
    trustedVoiceWindowActive: active,
    continuityWindowVerified: active,
    continuityStatus: checked ? (checked.stage || "checked") : (active ? "active" : (providedVerified ? "untrusted_claim" : "missing")),
    continuityClaimTrusted: providedVerified && trustedServerContext,
    continuityRequiresFreshChallenge: !active,
    continuityPreventsSessionDrift: true,
    continuityIsAuthority: false,
    challengeIsAuthority: false,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    biometricTemplateStored: false,
    transcriptOnly: true,
    check: checked || null
  };
}

function clearContinuityWindowsForTests() {
  continuityWindows.clear();
  return health();
}

module.exports = {
  VERSION,
  WINDOW_STATES,
  health,
  openContinuityWindow,
  checkContinuityWindow,
  revokeContinuityWindow,
  evaluateContinuityEvidence,
  normalizeSpeakerId,
  clearContinuityWindowsForTests
};
