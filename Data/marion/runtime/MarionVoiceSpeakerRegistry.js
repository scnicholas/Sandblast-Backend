'use strict';

/** Metadata-only registry. Enrollment is administrative evidence, never authority. */
const crypto = require('crypto');
const VERSION = 'marion.voiceSpeakerRegistry/2.0-phase4-session-bound';
const REGISTRY_STATES = Object.freeze({ UNKNOWN:'unknown', PENDING_ENROLLMENT:'pending_enrollment', TRUSTED_METADATA_ONLY:'trusted_metadata_only', REMOTE_TRUSTED_USER:'remote_trusted_user', OWNER_VERIFIED:'owner_verified', REVOKED:'revoked', BLOCKED:'blocked' });
const ROLE_BINDINGS = Object.freeze({ OWNER:'owner', REMOTE_TRUSTED_USER:'remote_trusted_user', OBSERVER:'observer', BLOCKED:'blocked' });
const MAX_PROFILES = boundedEnv('SB_MARION_VOICE_REGISTRY_MAX_PROFILES', 500, 1, 5000);
const MAX_REQUESTS = boundedEnv('SB_MARION_VOICE_REGISTRY_MAX_REQUESTS', 500, 1, 5000);
const profiles = new Map();
const requests = new Map();
const SECRET_KEY = /(?:token|secret|password|cookie|authorization|api[_-]?key|bearer|raw.?audio|audio|blob|buffer|voiceprint|biometric|credential|private[_-]?key)/i;
const SECRET_TEXT = /(?:bearer\s+[a-z0-9._~+/-]+=*|(?:token|secret|password|api[_-]?key|session[_-]?token|authorization)\s*[:=]\s*)[^\s,"'}]+/gi;

function boundedEnv(name, fallback, min, max) { const n = Number(process.env[name]); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback; }
function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function own(o, k) { if (!isObject(o)) return undefined; try { const d = Object.getOwnPropertyDescriptor(o, k); return d && Object.prototype.hasOwnProperty.call(d, 'value') ? d.value : undefined; } catch (_) { return undefined; } }
function safeText(v, max = 160) {
  if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return '';
  return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(SECRET_TEXT, '[redacted]').replace(/\s+/g, ' ').trim().slice(0, Math.max(1, Math.min(Number(max) || 160, 500)));
}
function now() { return Date.now(); }
function iso(ts) { const n = Number(ts); return new Date(Number.isFinite(n) ? n : now()).toISOString(); }
function normalizeSpeakerId(v) { return safeText(v, 160).toLowerCase().replace(/[^a-z0-9._:@/-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120); }
function newSpeakerId() { return 'spk_' + crypto.randomBytes(18).toString('hex'); }
function registryId(prefix) { return String(prefix || 'reg') + '_' + crypto.randomBytes(12).toString('hex'); }
function normalizeRoleBinding(v) {
  const s = safeText(v, 80).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (['owner','admin','administrator'].includes(s)) return ROLE_BINDINGS.OWNER;
  if (['remote_trusted_user','remote_user','trusted_remote_user'].includes(s)) return ROLE_BINDINGS.REMOTE_TRUSTED_USER;
  if (['observer','viewer','read_only'].includes(s)) return ROLE_BINDINGS.OBSERVER;
  return ROLE_BINDINGS.BLOCKED;
}
function normalizeState(v) { const s = safeText(v, 80).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); return Object.values(REGISTRY_STATES).includes(s) ? s : REGISTRY_STATES.UNKNOWN; }
function stateForRole(role) { const r = normalizeRoleBinding(role); return r === ROLE_BINDINGS.OWNER ? REGISTRY_STATES.OWNER_VERIFIED : r === ROLE_BINDINGS.REMOTE_TRUSTED_USER ? REGISTRY_STATES.REMOTE_TRUSTED_USER : r === ROLE_BINDINGS.OBSERVER ? REGISTRY_STATES.TRUSTED_METADATA_ONLY : REGISTRY_STATES.BLOCKED; }
function contextRole(ctx) { return normalizeRoleBinding(own(ctx, 'role') || own(ctx, 'sessionRole') || own(ctx, 'adminRole')); }
function hasVerifiedOwnerSession(ctx) {
  return isObject(ctx) && contextRole(ctx) === ROLE_BINDINGS.OWNER && own(ctx, 'adminVerified') === true && own(ctx, 'sessionVerified') === true && !!safeText(own(ctx, 'sessionId'), 160);
}
function sanitizeMetadata(value, depth = 0, seen = new WeakSet()) {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return safeText(value, 240);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object' || depth >= 4 || seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < Math.min(value.length, 20); i += 1) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (d && 'value' in d) { const x = sanitizeMetadata(d.value, depth + 1, seen); if (x !== undefined) out.push(x); } }
    return out;
  }
  const out = {};
  let ds; try { ds = Object.getOwnPropertyDescriptors(value); } catch (_) { return out; }
  for (const key of Object.keys(ds).slice(0, 32)) {
    if (SECRET_KEY.test(key)) continue;
    const d = ds[key]; if (!d || !Object.prototype.hasOwnProperty.call(d, 'value')) continue;
    const x = sanitizeMetadata(d.value, depth + 1, seen); if (x !== undefined) out[key.slice(0, 80)] = x;
  }
  return out;
}
function speakerIdFrom(input, allowLabel = false) {
  const keys = allowLabel ? ['speakerId','detectedSpeakerId','claimedSpeaker','speakerHint','displayName','name'] : ['speakerId','detectedSpeakerId'];
  for (const k of keys) { const id = normalizeSpeakerId(own(input, k)); if (id) return id; }
  return '';
}
function capabilitiesForRole(role) { const r = normalizeRoleBinding(role); return r === ROLE_BINDINGS.OWNER ? ['voice.private.submit','voice.private.receive','speaker.registry.owner'] : r === ROLE_BINDINGS.REMOTE_TRUSTED_USER ? ['voice.private.submit','voice.private.receive'] : r === ROLE_BINDINGS.OBSERVER ? ['status.read'] : []; }
function channelsForRole(role) { const r = normalizeRoleBinding(role); return r === ROLE_BINDINGS.OWNER ? ['marion_admin_voice','lingosentinel_private_voice'] : r === ROLE_BINDINGS.REMOTE_TRUSTED_USER ? ['remote_trusted_voice','lingosentinel_remote_trusted_voice'] : r === ROLE_BINDINGS.OBSERVER ? ['observer_status'] : []; }
function publicProfile(p) {
  if (!p) return null;
  return {
    speakerId:p.speakerId, displayName:p.displayName, roleBinding:p.roleBinding, enrollmentStatus:p.enrollmentStatus,
    voiceProfileStatus:p.voiceProfileStatus, allowedChannels:p.allowedChannels.slice(0,12), allowedCapabilities:p.allowedCapabilities.slice(0,24),
    createdAt:p.createdAt, updatedAt:p.updatedAt, lastVerifiedAt:p.lastVerifiedAt || null, revokedAt:p.revokedAt || null,
    riskFlags:p.riskFlags.slice(0,12), rawAudioStored:false, audioStored:false, voiceprintStored:false,
    profileMetadataOnly:true, identityIsAuthority:false, authorityStillRequiresRBAC:true,
    liveChallengeRequired:true, challengeVerificationRequired:true, challengePreventsReplay:true, challengeIsAuthority:false
  };
}
function publicRequest(r) {
  if (!r) return null;
  return { requestId:r.requestId, speakerId:r.speakerId, displayName:r.displayName, requestedRoleBinding:r.requestedRoleBinding,
    enrollmentStatus:r.enrollmentStatus, createdAt:r.createdAt, updatedAt:r.updatedAt, decidedAt:r.decidedAt || null,
    decidedByRole:r.decidedByRole || '', reason:r.reason || '', rawAudioStored:false, audioStored:false, voiceprintStored:false,
    profileMetadataOnly:true, identityIsAuthority:false, authorityStillRequiresRBAC:true,
    liveChallengeRequired:true, challengeVerificationRequired:true, challengePreventsReplay:true, challengeIsAuthority:false };
}
function health() {
  return { ok:true, service:'marion-voice-speaker-registry', version:VERSION, routeMounted:true, metadataOnly:true,
    storageMode:'process_memory', persistent:false, rawAudioStored:false, audioStored:false, voiceprintStored:false,
    identityIsAuthority:false, authorityStillRequiresRBAC:true, liveChallengeRequired:true, challengeVerificationRequired:true,
    challengePreventsReplay:true, challengeIsAuthority:false, supportedStates:Object.values(REGISTRY_STATES),
    supportedRoles:Object.values(ROLE_BINDINGS), limits:{ profiles:MAX_PROFILES, requests:MAX_REQUESTS },
    counts:{ profiles:profiles.size, pendingRequests:Array.from(requests.values()).filter(x => x.enrollmentStatus === REGISTRY_STATES.PENDING_ENROLLMENT).length, requests:requests.size } };
}
function requestEnrollment(input, context) {
  if (!hasVerifiedOwnerSession(context)) return { ok:false,statusCode:403,stage:'speaker_registry_enrollment_owner_required',reason:'verified_owner_session_required',registry:health() };
  const src = isObject(input) ? input : {};
  const displayName = safeText(own(src,'displayName') || own(src,'name') || own(src,'claimedSpeaker') || '', 120);
  const speakerId = speakerIdFrom(src, true) || newSpeakerId();
  const role = normalizeRoleBinding(own(src,'roleBinding') || own(src,'requestedRoleBinding') || own(src,'role') || ROLE_BINDINGS.OBSERVER);
  if (role === ROLE_BINDINGS.BLOCKED) return { ok:false,statusCode:400,stage:'speaker_registry_invalid_role',reason:'speaker_role_binding_required',registry:health() };
  const old = profiles.get(speakerId);
  if (old && ![REGISTRY_STATES.REVOKED,REGISTRY_STATES.BLOCKED].includes(old.enrollmentStatus)) return { ok:false,statusCode:409,stage:'speaker_registry_profile_exists',reason:'speaker_already_registered',speaker:publicProfile(old),registry:health() };
  if (requests.size >= MAX_REQUESTS) return { ok:false,statusCode:429,stage:'speaker_registry_capacity_reached',reason:'enrollment_request_capacity_reached',registry:health() };
  const t = now();
  const req = { requestId:registryId('ser'),speakerId,displayName,requestedRoleBinding:role,enrollmentStatus:REGISTRY_STATES.PENDING_ENROLLMENT,
    createdAt:iso(t),updatedAt:iso(t),requestedByRole:contextRole(context),reason:safeText(own(src,'reason') || own(src,'note') || '',200),
    metadata:sanitizeMetadata(own(src,'metadata') || own(src,'profile') || {}),rawAudioStored:false,audioStored:false,voiceprintStored:false,profileMetadataOnly:true };
  requests.set(req.requestId, req);
  return { ok:true,statusCode:201,stage:'speaker_registry_enrollment_requested',request:publicRequest(req),registry:health() };
}
function approveEnrollment(input, context) {
  if (!hasVerifiedOwnerSession(context)) return { ok:false,statusCode:403,stage:'speaker_registry_approval_owner_required',reason:'verified_owner_session_required',registry:health() };
  const id = safeText(own(input,'requestId') || own(input,'enrollmentRequestId') || '',120);
  const req = requests.get(id);
  if (!req || req.enrollmentStatus !== REGISTRY_STATES.PENDING_ENROLLMENT) return { ok:false,statusCode:404,stage:'speaker_registry_request_not_found',reason:'pending_enrollment_request_not_found',registry:health() };
  const role = normalizeRoleBinding(own(input,'roleBinding') || own(input,'approvedRoleBinding') || req.requestedRoleBinding);
  if (role === ROLE_BINDINGS.BLOCKED) return { ok:false,statusCode:400,stage:'speaker_registry_invalid_approval_role',reason:'approved_role_binding_required',request:publicRequest(req),registry:health() };
  if (!profiles.has(req.speakerId) && profiles.size >= MAX_PROFILES) return { ok:false,statusCode:429,stage:'speaker_registry_capacity_reached',reason:'speaker_profile_capacity_reached',registry:health() };
  const t = now();
  const p = { speakerId:req.speakerId,displayName:safeText(own(input,'displayName') || req.displayName || req.speakerId,120),roleBinding:role,
    enrollmentStatus:stateForRole(role),voiceProfileStatus:'metadata_only',allowedChannels:channelsForRole(role),allowedCapabilities:capabilitiesForRole(role),
    createdAt:req.createdAt,updatedAt:iso(t),lastVerifiedAt:iso(t),revokedAt:null,riskFlags:[],metadata:sanitizeMetadata(req.metadata),
    rawAudioStored:false,audioStored:false,voiceprintStored:false,profileMetadataOnly:true };
  req.enrollmentStatus='approved'; req.decidedAt=iso(t); req.updatedAt=iso(t); req.decidedByRole=contextRole(context);
  profiles.set(p.speakerId,p); requests.set(req.requestId,req);
  return { ok:true,statusCode:200,stage:'speaker_registry_enrollment_approved',request:publicRequest(req),speaker:publicProfile(p),registry:health() };
}
function updateRequestDecision(input, context, decision) {
  if (!hasVerifiedOwnerSession(context)) return { ok:false,statusCode:403,stage:`speaker_registry_${decision}_owner_required`,reason:'verified_owner_session_required',registry:health() };
  const id = safeText(own(input,'requestId') || own(input,'enrollmentRequestId') || '',120);
  const req = requests.get(id);
  if (!req || req.enrollmentStatus !== REGISTRY_STATES.PENDING_ENROLLMENT) return { ok:false,statusCode:404,stage:'speaker_registry_request_not_found',reason:'pending_enrollment_request_not_found',registry:health() };
  const t=now(); req.enrollmentStatus=decision === 'denied' ? 'denied' : 'cancelled'; req.decidedAt=iso(t); req.updatedAt=iso(t); req.decidedByRole=contextRole(context);
  req.reason=safeText(own(input,'reason') || req.reason || decision,200); requests.set(req.requestId,req);
  return { ok:true,statusCode:200,stage:`speaker_registry_enrollment_${decision}`,request:publicRequest(req),registry:health() };
}
function denyEnrollment(input, context) { return updateRequestDecision(input,context,'denied'); }
function revokeSpeaker(input, context) {
  if (!hasVerifiedOwnerSession(context)) return { ok:false,statusCode:403,stage:'speaker_registry_revoke_owner_required',reason:'verified_owner_session_required',registry:health() };
  const speakerId=speakerIdFrom(input,false), p=profiles.get(speakerId);
  if (!p) return { ok:false,statusCode:404,stage:'speaker_registry_speaker_not_found',reason:'speaker_profile_not_found',registry:health() };
  const t=now(); p.enrollmentStatus=REGISTRY_STATES.REVOKED; p.voiceProfileStatus='revoked'; p.revokedAt=iso(t); p.updatedAt=iso(t); p.riskFlags=Array.from(new Set([...p.riskFlags,'revoked']));
  return { ok:true,statusCode:200,stage:'speaker_registry_speaker_revoked',speaker:publicProfile(p),registry:health() };
}
function checkSpeaker(input) {
  const id=speakerIdFrom(input,false);
  if (!id) return { ok:true,statusCode:200,stage:'speaker_registry_unknown',matched:false,enrollmentStatus:REGISTRY_STATES.UNKNOWN,speaker:null,registry:health() };
  const p=profiles.get(id);
  if (!p) return { ok:true,statusCode:200,stage:'speaker_registry_unknown',matched:false,speakerId:id,enrollmentStatus:REGISTRY_STATES.UNKNOWN,speaker:null,registry:health() };
  const blocked=[REGISTRY_STATES.REVOKED,REGISTRY_STATES.BLOCKED].includes(p.enrollmentStatus);
  return { ok:true,statusCode:200,stage:blocked?'speaker_registry_blocked':'speaker_registry_matched',matched:!blocked,speakerId:p.speakerId,
    enrollmentStatus:p.enrollmentStatus,roleBinding:p.roleBinding,blocked,liveChallengeRequired:true,challengeVerificationRequired:true,
    challengePreventsReplay:true,challengeIsAuthority:false,speaker:publicProfile(p),registry:health() };
}
function clearRegistryForTests() { profiles.clear(); requests.clear(); return health(); }

module.exports = { VERSION,REGISTRY_STATES,ROLE_BINDINGS,health,requestEnrollment,approveEnrollment,denyEnrollment,revokeSpeaker,checkSpeaker,
  publicProfile,publicRequest,normalizeSpeakerId,normalizeRoleBinding,normalizeState,sanitizeMetadata,clearRegistryForTests };
