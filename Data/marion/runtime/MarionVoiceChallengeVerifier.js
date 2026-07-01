"use strict";

/**
 * MarionVoiceChallengeVerifier
 * Phase 6 voice spoof resistance / challenge verification boundary.
 *
 * A recognized speaker profile is still evidence only. Challenge success proves
 * recent liveness for the current protected session, but it never grants owner,
 * admin, command, escalation, or registry authority by itself.
 *
 * Privacy hardlock:
 * - rawAudioStored: false
 * - voiceprintStored: false
 * - biometricTemplateStored: false
 * - transcriptOnly: true
 */

const crypto = require("crypto");

const VERSION = "marion.voiceChallengeVerifier/1.1-phase7-continuity-aware-boundary";

const DEFAULT_TTL_MS = clampNumber(process.env.SB_MARION_VOICE_CHALLENGE_TTL_MS, 90 * 1000, 15 * 1000, 5 * 60 * 1000);
const MAX_CHALLENGES = clampNumber(process.env.SB_MARION_VOICE_CHALLENGE_MAX, 50, 1, 500);

const CHALLENGE_STATES = Object.freeze({
  UNKNOWN: "unknown",
  ISSUED: "issued",
  VERIFIED: "verified",
  FAILED: "failed",
  EXPIRED: "expired",
  REVOKED: "revoked",
  USED: "used",
  BLOCKED: "blocked"
});

const challengeStore = new Map();
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

function normalizeResponse(value) {
  return safeText(value, 300)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function newChallengeId() {
  return "mvc_" + base64Url(crypto.randomBytes(24));
}

function newNonce() {
  return base64Url(crypto.randomBytes(10));
}

function challengePhrase(nonce) {
  const clean = safeText(nonce, 80).slice(0, 12).toUpperCase();
  return `Marion live check ${clean}`;
}

function publicChallenge(entry, options) {
  if (!entry) return null;
  const opts = options && typeof options === "object" ? options : {};
  return {
    challengeId: entry.challengeId,
    speakerId: entry.speakerId,
    state: entry.state,
    issuedAt: entry.issuedAt,
    expiresAt: entry.expiresAt,
    expiresInMs: Math.max(0, Number(entry.expiresAt || 0) - now()),
    sessionBound: !!entry.sessionId,
    sessionIdPresent: !!entry.sessionId,
    phrase: opts.includePhrase === true ? entry.phrase : undefined,
    liveChallengeRequired: true,
    liveChallengeVerified: entry.state === CHALLENGE_STATES.VERIFIED,
    challengeIsAuthority: false,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    biometricTemplateStored: false,
    transcriptOnly: true,
    continuityWindowEligible: entry.state === CHALLENGE_STATES.VERIFIED
  };
}

function contextRole(context) {
  const ctx = context && typeof context === "object" ? context : {};
  return safeText(ctx.role || ctx.sessionRole || ctx.adminRole || "", 80).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function hasVerifiedSession(context) {
  return !!(context && context.sessionVerified === true && safeText(context.sessionId || "", 160));
}

function isOwnerContext(context) {
  const role = contextRole(context);
  return role === "owner" || role === "admin" || role === "administrator" || (context && context.ownerVerified === true);
}

function isAuthorizedCheckContext(context) {
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

function firstSpeakerCandidate(input) {
  const src = input && typeof input === "object" ? input : {};
  const candidates = [src.speakerId, src.detectedSpeakerId, src.claimedSpeaker, src.speakerHint, src.displayName, src.user];
  for (const item of candidates) {
    const normalized = normalizeSpeakerId(item);
    if (normalized) return normalized;
  }
  return "";
}

function firstChallengeResponse(input) {
  const src = input && typeof input === "object" ? input : {};
  return normalizeResponse(src.challengeResponse || src.responseTranscript || src.response || src.answer || src.transcript || src.text || "");
}

function challengeIdFrom(input) {
  const src = input && typeof input === "object" ? input : {};
  return safeText(src.challengeId || src.voiceChallengeId || src.id || "", 160);
}

function sweep(force) {
  const t = now();
  if (!force && t - lastSweepAt < 30000) return;
  lastSweepAt = t;
  for (const [id, entry] of challengeStore.entries()) {
    if (!entry || entry.state === CHALLENGE_STATES.REVOKED || entry.state === CHALLENGE_STATES.USED || Number(entry.expiresAt || 0) <= t) {
      challengeStore.delete(id);
    }
  }
  if (challengeStore.size > MAX_CHALLENGES) {
    const entries = Array.from(challengeStore.entries()).sort((a, b) => Number(a[1].issuedAtMs || 0) - Number(b[1].issuedAtMs || 0));
    while (challengeStore.size > MAX_CHALLENGES && entries.length) {
      const [id] = entries.shift();
      challengeStore.delete(id);
    }
  }
}

function health() {
  sweep(false);
  return {
    ok: true,
    service: "marion-voice-challenge-verifier",
    version: VERSION,
    phase: "phase6_voice_spoof_resistance",
    routeMounted: true,
    challengeTtlMs: DEFAULT_TTL_MS,
    liveChallengeRequired: true,
    challengePreventsReplay: true,
    singleUse: true,
    sessionBound: true,
    challengeIsAuthority: false,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    biometricTemplateStored: false,
    transcriptOnly: true,
    supportedStates: Object.values(CHALLENGE_STATES),
    counts: { activeChallenges: challengeStore.size }
  };
}

function issueChallenge(input, context) {
  sweep(false);
  if (!isOwnerContext(context) || !hasVerifiedSession(context)) {
    return {
      ok: false,
      statusCode: 403,
      stage: "voice_challenge_issue_owner_session_required",
      reason: "owner_short_lived_session_required_for_voice_challenge_issue",
      challengeIsAuthority: false,
      identityIsAuthority: false,
      health: health()
    };
  }
  const speakerId = firstSpeakerCandidate(input);
  if (!speakerId) {
    return { ok: false, statusCode: 400, stage: "voice_challenge_speaker_required", reason: "speaker_id_required", health: health() };
  }
  const t = now();
  const nonce = newNonce();
  const phrase = challengePhrase(nonce);
  const challengeId = newChallengeId();
  const ttlMs = clampNumber(input && input.ttlMs, DEFAULT_TTL_MS, 5000, 5 * 60 * 1000);
  const entry = {
    challengeId,
    speakerId,
    nonce,
    phrase,
    expectedHash: sha256(normalizeResponse(phrase)),
    issuedAtMs: t,
    issuedAt: iso(t),
    expiresAtMs: t + ttlMs,
    expiresAt: iso(t + ttlMs),
    sessionId: safeText(context && context.sessionId || "", 160),
    issuedByRole: contextRole(context),
    state: CHALLENGE_STATES.ISSUED,
    attempts: 0,
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    biometricTemplateStored: false,
    transcriptOnly: true
  };
  challengeStore.set(challengeId, entry);
  return {
    ok: true,
    statusCode: 200,
    stage: "voice_challenge_issued",
    challengeIssued: true,
    challenge: publicChallenge(entry, { includePhrase: true }),
    expectedResponse: phrase,
    nonce,
    liveChallengeRequired: true,
    challengeIsAuthority: false,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    biometricTemplateStored: false,
    transcriptOnly: true,
    continuityWindowEligible: true,
    continuityWindowMayOpen: true,
    health: health()
  };
}

function checkChallenge(input, context) {
  sweep(false);
  if (!isAuthorizedCheckContext(context)) {
    return {
      ok: false,
      statusCode: 403,
      stage: "voice_challenge_check_session_required",
      reason: "verified_session_required_for_voice_challenge_check",
      liveChallengeVerified: false,
      challengeIsAuthority: false,
      identityIsAuthority: false,
      health: health()
    };
  }
  const challengeId = challengeIdFrom(input);
  const speakerId = firstSpeakerCandidate(input);
  const response = firstChallengeResponse(input);
  if (!challengeId || !speakerId || !response) {
    return { ok: false, statusCode: 400, stage: "voice_challenge_check_missing_fields", reason: "challenge_id_speaker_id_and_response_required", liveChallengeVerified: false, health: health() };
  }
  const entry = challengeStore.get(challengeId);
  if (!entry) {
    return { ok: false, statusCode: 404, stage: "voice_challenge_not_found", reason: "challenge_not_found_or_expired", liveChallengeVerified: false, health: health() };
  }
  const t = now();
  if (entry.state === CHALLENGE_STATES.USED || entry.state === CHALLENGE_STATES.VERIFIED) {
    challengeStore.delete(challengeId);
    return { ok: false, statusCode: 409, stage: "voice_challenge_replay_blocked", reason: "challenge_already_used", liveChallengeVerified: false, challengePreventsReplay: true, health: health() };
  }
  if (entry.state === CHALLENGE_STATES.REVOKED) {
    challengeStore.delete(challengeId);
    return { ok: false, statusCode: 410, stage: "voice_challenge_revoked", reason: "challenge_revoked", liveChallengeVerified: false, health: health() };
  }
  if (Number(entry.expiresAtMs || 0) <= t) {
    challengeStore.delete(challengeId);
    return { ok: false, statusCode: 410, stage: "voice_challenge_expired", reason: "challenge_expired", liveChallengeVerified: false, health: health() };
  }
  if (entry.speakerId !== speakerId) {
    entry.attempts += 1;
    challengeStore.set(challengeId, entry);
    return { ok: false, statusCode: 403, stage: "voice_challenge_speaker_mismatch", reason: "challenge_speaker_mismatch", liveChallengeVerified: false, health: health() };
  }
  const ctxSessionId = safeText(context && context.sessionId || "", 160);
  if (entry.sessionId && ctxSessionId && entry.sessionId !== ctxSessionId) {
    challengeStore.delete(challengeId);
    return { ok: false, statusCode: 403, stage: "voice_challenge_session_mismatch", reason: "challenge_session_binding_mismatch", liveChallengeVerified: false, staleSessionReuseBlocked: true, health: health() };
  }
  const match = sha256(response) === entry.expectedHash;
  if (!match) {
    entry.attempts += 1;
    if (entry.attempts >= 3) {
      entry.state = CHALLENGE_STATES.BLOCKED;
      challengeStore.delete(challengeId);
      return { ok: false, statusCode: 403, stage: "voice_challenge_attempts_blocked", reason: "challenge_response_failed_too_many_times", liveChallengeVerified: false, health: health() };
    }
    challengeStore.set(challengeId, entry);
    return { ok: false, statusCode: 403, stage: "voice_challenge_response_mismatch", reason: "challenge_response_mismatch", liveChallengeVerified: false, attempts: entry.attempts, health: health() };
  }
  entry.state = CHALLENGE_STATES.USED;
  entry.verifiedAt = iso(t);
  challengeStore.set(challengeId, entry);
  const publicEntry = publicChallenge(Object.assign({}, entry, { state: CHALLENGE_STATES.VERIFIED }), { includePhrase: false });
  return {
    ok: true,
    statusCode: 200,
    stage: "voice_challenge_verified",
    challenge: publicEntry,
    speakerId,
    liveChallengeVerified: true,
    voiceChallengeVerified: true,
    challengePreventsReplay: true,
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

function revokeChallenge(input, context) {
  sweep(false);
  if (!isOwnerContext(context) || !hasVerifiedSession(context)) {
    return { ok: false, statusCode: 403, stage: "voice_challenge_revoke_owner_session_required", reason: "owner_short_lived_session_required_for_voice_challenge_revoke", health: health() };
  }
  const challengeId = challengeIdFrom(input);
  if (!challengeId) return { ok: false, statusCode: 400, stage: "voice_challenge_revoke_missing_id", reason: "challenge_id_required", health: health() };
  const entry = challengeStore.get(challengeId);
  if (!entry) return { ok: false, statusCode: 404, stage: "voice_challenge_not_found", reason: "challenge_not_found_or_expired", health: health() };
  entry.state = CHALLENGE_STATES.REVOKED;
  entry.revokedAt = iso(now());
  challengeStore.delete(challengeId);
  return { ok: true, statusCode: 200, stage: "voice_challenge_revoked", challenge: publicChallenge(entry), liveChallengeVerified: false, health: health() };
}

function evaluateChallengeEvidence(input, context) {
  const src = input && typeof input === "object" ? input : {};
  const ctx = context && typeof context === "object" ? context : {};
  const trustedServerContext = ctx.trustedServerAuth === true || ctx.serverSideAdminVoiceAuth === true || ctx.serverSideRemoteTrustedUserAuth === true || ctx.sessionVerified === true;
  const providedVerified = src.liveChallengeVerified === true || src.voiceChallengeVerified === true || (src.voiceChallenge && src.voiceChallenge.liveChallengeVerified === true);
  return {
    version: VERSION,
    liveChallengeRequired: src.liveChallengeRequired === true || src.requireLiveChallenge === true,
    liveChallengeProvided: !!(src.challengeId || src.voiceChallengeId || src.challengeResponse || src.responseTranscript || src.voiceChallenge),
    liveChallengeVerified: providedVerified && trustedServerContext,
    challengeStatus: providedVerified && trustedServerContext ? "verified" : (providedVerified ? "untrusted_claim" : "missing"),
    challengeClaimTrusted: providedVerified && trustedServerContext,
    challengePreventsReplay: true,
    challengeIsAuthority: false,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    biometricTemplateStored: false,
    transcriptOnly: true,
    continuityWindowEligible: providedVerified && trustedServerContext,
    continuityWindowMayOpen: providedVerified && trustedServerContext
  };
}

function clearChallengesForTests() {
  challengeStore.clear();
  return health();
}

module.exports = {
  VERSION,
  CHALLENGE_STATES,
  health,
  issueChallenge,
  checkChallenge,
  revokeChallenge,
  evaluateChallengeEvidence,
  normalizeResponse,
  normalizeSpeakerId,
  clearChallengesForTests
};

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
