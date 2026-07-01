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

const VERSION = 'marion.voiceSpeakerIdentity/1.3-phase7-continuity-window';

const SPEAKER_CONFIDENCE = Object.freeze({
  STRONG: 0.90,
  WEAK: 0.70
});

const ROLE_BINDINGS = Object.freeze({
  OWNER: 'owner',
  REMOTE_TRUSTED_USER: 'remote_trusted_user',
  BLOCKED: 'blocked'
});


const speakerRegistryMod = (() => {
  try {
    return require('./MarionVoiceSpeakerRegistry');
  } catch (_) {
    return null;
  }
})();

const challengeVerifierMod = (() => {
  try {
    return require('./MarionVoiceChallengeVerifier');
  } catch (_) {
    return null;
  }
})();

const continuityWindowMod = (() => {
  try {
    return require('./MarionVoiceContinuityWindow');
  } catch (_) {
    return null;
  }
})();

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


function speakerRegistryEvidenceForIdentity(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const opts = options && typeof options === 'object' ? options : {};
  if (!speakerRegistryMod || typeof speakerRegistryMod.checkSpeaker !== 'function') {
    return {
      available: false,
      matched: false,
      enrollmentStatus: 'unknown',
      roleBinding: 'blocked',
      blocked: false,
      version: ''
    };
  }
  const candidates = [
    opts.speakerId,
    opts.detectedSpeakerId,
    env.detectedSpeakerId,
    env.speakerId,
    opts.claimedSpeaker,
    env.claimedSpeaker,
    opts.speakerHint,
    env.speakerHint
  ].map((item) => normalizeSpeakerLabel(item)).filter(Boolean);
  for (const candidate of candidates) {
    try {
      const result = speakerRegistryMod.checkSpeaker({ speakerId: candidate, detectedSpeakerId: candidate, claimedSpeaker: candidate });
      if (result && result.matched === true) {
        return {
          available: true,
          matched: true,
          speakerId: result.speakerId || candidate,
          enrollmentStatus: result.enrollmentStatus || (result.speaker && result.speaker.enrollmentStatus) || 'unknown',
          roleBinding: result.roleBinding || (result.speaker && result.speaker.roleBinding) || 'blocked',
          blocked: result.blocked === true,
          profileMetadataOnly: true,
          rawAudioStored: false,
          voiceprintStored: false,
          version: speakerRegistryMod.VERSION || ''
        };
      }
    } catch (_) {}
  }
  return {
    available: true,
    matched: false,
    enrollmentStatus: 'unknown',
    roleBinding: 'blocked',
    blocked: false,
    profileMetadataOnly: true,
    rawAudioStored: false,
    voiceprintStored: false,
    version: speakerRegistryMod.VERSION || ''
  };
}

function challengeEvidenceForIdentity(envelope, options, speakerRegistry, voiceMatchStatus) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const opts = options && typeof options === 'object' ? options : {};
  const registeredSpeaker = speakerRegistry && speakerRegistry.matched === true && speakerRegistry.blocked !== true;
  const weakMatch = voiceMatchStatus === 'weak_match';
  const required = env.liveChallengeRequired === true || opts.liveChallengeRequired === true || opts.requireLiveChallenge === true || registeredSpeaker || weakMatch;
  let evidence = {
    version: '',
    liveChallengeRequired: required,
    liveChallengeProvided: false,
    liveChallengeVerified: false,
    challengeStatus: required ? 'missing' : 'not_required',
    challengePreventsReplay: true,
    challengeIsAuthority: false,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    transcriptOnly: true
  };
  if (challengeVerifierMod && typeof challengeVerifierMod.evaluateChallengeEvidence === 'function') {
    evidence = Object.assign(evidence, challengeVerifierMod.evaluateChallengeEvidence(Object.assign({}, env, {
      liveChallengeRequired: required,
      voiceChallenge: env.voiceChallenge || opts.voiceChallenge || opts.challengeResult || null,
      liveChallengeVerified: env.liveChallengeVerified === true || opts.liveChallengeVerified === true,
      voiceChallengeVerified: env.voiceChallengeVerified === true || opts.voiceChallengeVerified === true,
      challengeId: env.challengeId || opts.challengeId || env.voiceChallengeId || opts.voiceChallengeId || '',
      challengeResponse: env.challengeResponse || opts.challengeResponse || ''
    }), Object.assign({}, opts, {
      sessionVerified: opts.sessionVerified === true || env.sessionVerified === true,
      trustedServerAuth: opts.trustedServerAuth === true || opts.serverSideAdminVoiceAuth === true || opts.serverSideRemoteTrustedUserAuth === true
    })));
    evidence.liveChallengeRequired = required;
  }
  evidence.challengeBlocked = required && evidence.liveChallengeVerified !== true;
  evidence.challengeVersion = challengeVerifierMod && challengeVerifierMod.VERSION || '';
  return evidence;
}


function continuityEvidenceForIdentity(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const opts = options && typeof options === 'object' ? options : {};
  let evidence = {
    version: continuityWindowMod && continuityWindowMod.VERSION || '',
    continuityWindowRequired: env.voiceContinuityRequired === true || opts.voiceContinuityRequired === true || env.continuityWindowRequired === true || opts.continuityWindowRequired === true,
    continuityWindowProvided: !!(env.continuityWindowId || opts.continuityWindowId || env.trustedVoiceWindowActive || opts.trustedVoiceWindowActive),
    trustedVoiceWindowActive: false,
    continuityWindowVerified: false,
    continuityStatus: 'missing',
    continuityPreventsSessionDrift: true,
    continuityIsAuthority: false,
    challengeIsAuthority: false,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    rawAudioStored: false,
    audioStored: false,
    voiceprintStored: false,
    transcriptOnly: true
  };
  if (continuityWindowMod && typeof continuityWindowMod.evaluateContinuityEvidence === 'function') {
    evidence = Object.assign(evidence, continuityWindowMod.evaluateContinuityEvidence(Object.assign({}, env, {
      continuityWindowRequired: evidence.continuityWindowRequired,
      continuityWindowId: env.continuityWindowId || opts.continuityWindowId || env.windowId || opts.windowId || '',
      trustedVoiceWindowActive: env.trustedVoiceWindowActive === true || opts.trustedVoiceWindowActive === true,
      continuityWindowVerified: env.continuityWindowVerified === true || opts.continuityWindowVerified === true,
      voiceContinuity: env.voiceContinuity || opts.voiceContinuity || null
    }), Object.assign({}, opts, {
      sessionVerified: opts.sessionVerified === true || env.sessionVerified === true,
      trustedServerAuth: opts.trustedServerAuth === true || opts.serverSideAdminVoiceAuth === true || opts.serverSideRemoteTrustedUserAuth === true
    })));
  }
  evidence.continuityWindowBlocked = evidence.continuityWindowRequired === true && evidence.trustedVoiceWindowActive !== true;
  evidence.continuityWindowVersion = continuityWindowMod && continuityWindowMod.VERSION || '';
  return evidence;
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
  let roleBinding = resolveRoleBinding(env, opts);
  const speakerRegistry = speakerRegistryEvidenceForIdentity(env, opts);
  const speakerRegistryBlocked = speakerRegistry.blocked === true || speakerRegistry.enrollmentStatus === 'revoked' || speakerRegistry.enrollmentStatus === 'blocked';
  const challengeEvidence = challengeEvidenceForIdentity(env, opts, speakerRegistry, voiceMatchStatus);
  const continuityEvidence = continuityEvidenceForIdentity(env, opts);
  const liveChallengeRequired = challengeEvidence.liveChallengeRequired === true;
  const liveChallengeVerified = challengeEvidence.liveChallengeVerified === true;
  const trustedVoiceWindowActive = continuityEvidence.trustedVoiceWindowActive === true;
  const continuityWindowVerified = continuityEvidence.continuityWindowVerified === true || trustedVoiceWindowActive;
  const challengeBlocked = challengeEvidence.challengeBlocked === true && !continuityWindowVerified && !adminVerified && !remoteTrustedUserVerified;
  if (!adminVerified && !remoteTrustedUserVerified && (speakerRegistryBlocked || challengeBlocked)) roleBinding = ROLE_BINDINGS.BLOCKED;

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
    phase: 'phase7_voice_continuity_window',
    speakerHint: rawSpeakerHint,
    claimedSpeaker,
    detectedSpeakerId,
    speakerConfidence,
    speakerConfidenceBand: band,
    voiceMatchStatus,
    voiceProfileEnrolled,
    speakerRegistry,
    speakerRegistryAvailable: speakerRegistry.available === true,
    speakerRegistryMatched: speakerRegistry.matched === true,
    speakerRegistryStatus: speakerRegistry.enrollmentStatus || 'unknown',
    speakerRegistryRoleBinding: speakerRegistry.roleBinding || 'blocked',
    speakerRegistryBlocked,
    speakerRegistryVersion: speakerRegistry.version || '',
    profileMetadataOnly: true,
    voiceprintStored: false,
    voiceChallenge: challengeEvidence,
    voiceChallengeVersion: challengeEvidence.challengeVersion || '',
    voiceContinuity: continuityEvidence,
    voiceContinuityVersion: continuityEvidence.continuityWindowVersion || '',
    trustedVoiceWindowActive,
    continuityWindowVerified,
    continuityStatus: continuityEvidence.continuityStatus || 'unknown',
    continuityPreventsSessionDrift: true,
    continuityIsAuthority: false,
    liveChallengeRequired,
    liveChallengeVerified,
    challengeBlocked,
    challengeStatus: challengeEvidence.challengeStatus || 'unknown',
    challengePreventsReplay: true,
    challengeIsAuthority: false,
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
    reason: challengeBlocked ? 'LIVE_CHALLENGE_REQUIRED_FOR_SPEAKER_IDENTITY' : reason
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
    speakerRegistry: identity.speakerRegistry,
    speakerRegistryAvailable: identity.speakerRegistryAvailable === true,
    speakerRegistryMatched: identity.speakerRegistryMatched === true,
    speakerRegistryStatus: identity.speakerRegistryStatus || 'unknown',
    speakerRegistryRoleBinding: identity.speakerRegistryRoleBinding || 'blocked',
    speakerRegistryBlocked: identity.speakerRegistryBlocked === true,
    profileMetadataOnly: true,
    voiceprintStored: false,
    voiceChallenge: identity.voiceChallenge,
    voiceChallengeVersion: identity.voiceChallengeVersion || '',
    voiceContinuity: identity.voiceContinuity,
    voiceContinuityVersion: identity.voiceContinuityVersion || '',
    trustedVoiceWindowActive: identity.trustedVoiceWindowActive === true,
    continuityWindowVerified: identity.continuityWindowVerified === true,
    continuityStatus: identity.continuityStatus || 'unknown',
    continuityPreventsSessionDrift: true,
    continuityIsAuthority: false,
    liveChallengeRequired: identity.liveChallengeRequired === true,
    liveChallengeVerified: identity.liveChallengeVerified === true,
    challengeBlocked: identity.challengeBlocked === true,
    challengeStatus: identity.challengeStatus || 'unknown',
    challengePreventsReplay: true,
    challengeIsAuthority: false,
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
  hasRemoteTrustedProof,
  speakerRegistryEvidenceForIdentity,
  challengeEvidenceForIdentity,
  continuityEvidenceForIdentity,
  continuityWindowMod
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
