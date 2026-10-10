'use strict';

/** Fresh challenge responses are not voice biometrics. A protected, server-side
 * speech-capture attestation is required before evidence can claim liveness. */
const crypto = require('crypto');
const VERSION = 'marion.voiceChallengeVerifier/2.0-phase4-attested';
const DEFAULT_TTL_MS = clampEnv('SB_MARION_VOICE_CHALLENGE_TTL_MS', 90000, 15000, 300000);
const MAX_CHALLENGES = clampEnv('SB_MARION_VOICE_CHALLENGE_MAX', 50, 1, 500);
const MAX_ATTEMPTS = 3;
const PROOF_TTL_MS = 30000;
const STATES = Object.freeze({ UNKNOWN:'unknown', ISSUED:'issued', VERIFIED:'verified', FAILED:'failed', EXPIRED:'expired', REVOKED:'revoked', USED:'used', BLOCKED:'blocked' });
const store = new Map();
const proofSecret = crypto.randomBytes(32);
let lastSweep = 0;

function clampEnv(name, fallback, min, max) { const n=Number(process.env[name]); return Number.isFinite(n) ? Math.max(min,Math.min(max,Math.floor(n))) : fallback; }
function isObject(v) { return !!v && typeof v==='object' && !Array.isArray(v); }
function own(o,k) { if(!isObject(o)) return undefined; try { const d=Object.getOwnPropertyDescriptor(o,k); return d&&Object.prototype.hasOwnProperty.call(d,'value')?d.value:undefined; } catch(_) { return undefined; } }
function safeText(v,max=160) { if(typeof v!=='string'&&typeof v!=='number'&&typeof v!=='boolean') return ''; return String(v).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,Math.max(1,Math.min(Number(max)||160,500))); }
function now() { return Date.now(); }
function iso(t) { return new Date(Number.isFinite(Number(t))?Number(t):now()).toISOString(); }
function normalizeSpeakerId(v) { return safeText(v,160).toLowerCase().replace(/[^a-z0-9._:@/-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,120); }
function normalizeResponse(v) { return safeText(v,300).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }
function sha256(v) { return crypto.createHash('sha256').update(String(v||'')).digest('hex'); }
function b64u(v) { return Buffer.from(v).toString('base64url'); }
function timingSafeEqualText(a,b) { try { const x=Buffer.from(String(a),'hex'), y=Buffer.from(String(b),'hex'); return x.length===y.length && x.length>0 && crypto.timingSafeEqual(x,y); } catch(_) { return false; } }
function newId(prefix,bytes=24) { return prefix+'_'+crypto.randomBytes(bytes).toString('base64url'); }
function challengePhrase(nonce) { return `Marion live check ${safeText(nonce,16).toUpperCase()}`; }
function contextRole(ctx) { return safeText(own(ctx,'role')||own(ctx,'sessionRole')||own(ctx,'adminRole')||'',80).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''); }
function sessionId(ctx) { return safeText(own(ctx,'sessionId'),160); }
function hasVerifiedSession(ctx) { return isObject(ctx)&&own(ctx,'sessionVerified')===true&&!!sessionId(ctx); }
function isOwnerContext(ctx) { return hasVerifiedSession(ctx)&&own(ctx,'adminVerified')===true&&['owner','admin','administrator'].includes(contextRole(ctx)); }
function isAuthorizedCheckContext(ctx) {
  if (!hasVerifiedSession(ctx)) return false;
  const role=contextRole(ctx);
  const admin=own(ctx,'adminVerified')===true&&['owner','admin','administrator','admin_operator'].includes(role);
  const remote=own(ctx,'remoteTrustedUserVerified')===true&&['remote_trusted_user','trusted_remote_user','remote_user','voice_user'].includes(role);
  return admin||remote;
}
function firstSpeaker(input) { for (const k of ['speakerId','detectedSpeakerId']) { const id=normalizeSpeakerId(own(input,k)); if(id) return id; } return ''; }
function responseFrom(input) { for (const k of ['challengeResponse','responseTranscript','response','answer','transcript','text']) { const v=own(input,k); if(typeof v==='string'&&v.trim()) return normalizeResponse(v); } return ''; }
function challengeIdFrom(input) { return safeText(own(input,'challengeId')||own(input,'voiceChallengeId')||own(input,'id')||'',160); }
function signedProof(entry) {
  const payload={ v:1,id:entry.challengeId,speakerId:entry.speakerId,sessionId:entry.sessionId,iat:now(),exp:Math.min(entry.expiresAtMs,now()+PROOF_TTL_MS),nonce:crypto.randomBytes(16).toString('base64url') };
  const encoded=b64u(JSON.stringify(payload));
  const mac=crypto.createHmac('sha256',proofSecret).update(encoded).digest('base64url');
  return encoded+'.'+mac;
}
function sweep(force=false) {
  const t=now(); if(!force&&t-lastSweep<30000) return; lastSweep=t;
  for(const [id,e] of store) if(!e||e.expiresAtMs<=t||e.state===STATES.REVOKED||e.state===STATES.USED) store.delete(id);
}
function publicChallenge(entry,includePhrase=false) {
  return entry?{ challengeId:entry.challengeId,speakerId:entry.speakerId,state:entry.state,issuedAt:entry.issuedAt,expiresAt:entry.expiresAt,
    expiresInMs:Math.max(0,entry.expiresAtMs-now()),sessionBound:true,phrase:includePhrase?entry.phrase:undefined,
    challengeResponseVerified:entry.state===STATES.VERIFIED,liveChallengeVerified:false,requiresSpeechCaptureAttestation:true,
    challengeIsAuthority:false,identityIsAuthority:false,authorityStillRequiresRBAC:true,rawAudioStored:false,audioStored:false,
    voiceprintStored:false,biometricTemplateStored:false,transcriptOnly:true }:null;
}
function health() {
  sweep(); return { ok:true,service:'marion-voice-challenge-verifier',version:VERSION,storageMode:'process_memory',persistent:false,
    challengeTtlMs:DEFAULT_TTL_MS,proofTtlMs:PROOF_TTL_MS,maxChallenges:MAX_CHALLENGES,maxAttempts:MAX_ATTEMPTS,
    liveChallengeRequired:true,challengePreventsReplay:true,singleUse:true,sessionBound:true,
    requiresTrustedSpeechCaptureAttestation:true,speechCaptureAttestationReady:false,challengeIsAuthority:false,identityIsAuthority:false,
    authorityStillRequiresRBAC:true,rawAudioStored:false,audioStored:false,voiceprintStored:false,transcriptOnly:true,
    supportedStates:Object.values(STATES),counts:{activeChallenges:store.size} };
}
function issueChallenge(input,context) {
  sweep();
  if(!isOwnerContext(context)) return {ok:false,statusCode:403,stage:'voice_challenge_issue_owner_session_required',reason:'verified_owner_session_required',challengeIsAuthority:false,health:health()};
  const speakerId=firstSpeaker(input);
  if(!speakerId) return {ok:false,statusCode:400,stage:'voice_challenge_speaker_required',reason:'speaker_id_required',health:health()};
  if(store.size>=MAX_CHALLENGES) return {ok:false,statusCode:429,stage:'voice_challenge_capacity_reached',reason:'active_challenge_capacity_reached',health:health()};
  const t=now(), nonce=crypto.randomBytes(12).toString('base64url'), phrase=challengePhrase(nonce);
  const rawTtl=own(input,'ttlMs'); const ttl=Number(rawTtl); const ttlMs=Number.isFinite(ttl)?Math.max(5000,Math.min(300000,ttl)):DEFAULT_TTL_MS;
  const entry={ challengeId:newId('mvc',24),speakerId,sessionId:sessionId(context),phrase,expectedHash:sha256(normalizeResponse(phrase)),
    issuedAtMs:t,issuedAt:iso(t),expiresAtMs:t+ttlMs,expiresAt:iso(t+ttlMs),state:STATES.ISSUED,attempts:0,proofHash:'',
    rawAudioStored:false,audioStored:false,voiceprintStored:false,transcriptOnly:true };
  store.set(entry.challengeId,entry);
  return {ok:true,statusCode:200,stage:'voice_challenge_issued',challengeIssued:true,challenge:publicChallenge(entry,true),
    expectedResponse:phrase,liveChallengeRequired:true,challengeResponseVerified:false,liveChallengeVerified:false,
    requiresSpeechCaptureAttestation:true,challengeIsAuthority:false,identityIsAuthority:false,authorityStillRequiresRBAC:true,
    rawAudioStored:false,audioStored:false,voiceprintStored:false,transcriptOnly:true,health:health()};
}
function failAttempt(entry,stage,reason,statusCode=403) {
  entry.attempts+=1;
  if(entry.attempts>=MAX_ATTEMPTS) { entry.state=STATES.BLOCKED; store.delete(entry.challengeId); }
  else store.set(entry.challengeId,entry);
  return {ok:false,statusCode,stage,reason,attempts:Math.min(entry.attempts,MAX_ATTEMPTS),liveChallengeVerified:false,challengePreventsReplay:true,health:health()};
}
function checkChallenge(input,context) {
  sweep();
  if(!isAuthorizedCheckContext(context)) return {ok:false,statusCode:403,stage:'voice_challenge_check_session_required',reason:'verified_session_required',liveChallengeVerified:false,health:health()};
  const id=challengeIdFrom(input), speaker=firstSpeaker(input), response=responseFrom(input);
  if(!id||!speaker||!response) return {ok:false,statusCode:400,stage:'voice_challenge_check_missing_fields',reason:'challenge_id_speaker_id_and_response_required',liveChallengeVerified:false,health:health()};
  const entry=store.get(id); if(!entry) return {ok:false,statusCode:404,stage:'voice_challenge_not_found',reason:'challenge_not_found_or_expired',liveChallengeVerified:false,health:health()};
  if(entry.state!==STATES.ISSUED) return {ok:false,statusCode:409,stage:'voice_challenge_replay_blocked',reason:'challenge_already_used_or_blocked',liveChallengeVerified:false,health:health()};
  if(entry.expiresAtMs<=now()) { store.delete(id); return {ok:false,statusCode:410,stage:'voice_challenge_expired',reason:'challenge_expired',liveChallengeVerified:false,health:health()}; }
  if(entry.sessionId!==sessionId(context)) return failAttempt(entry,'voice_challenge_session_mismatch','challenge_session_binding_mismatch');
  if(entry.speakerId!==speaker) return failAttempt(entry,'voice_challenge_speaker_mismatch','challenge_speaker_mismatch');
  if(!timingSafeEqualText(sha256(response),entry.expectedHash)) return failAttempt(entry,'voice_challenge_response_mismatch','challenge_response_mismatch');
  entry.state=STATES.VERIFIED; entry.verifiedAt=iso(now());
  const proof=signedProof(entry); entry.proofHash=sha256(proof); entry.proofExpiresAtMs=Math.min(entry.expiresAtMs,now()+PROOF_TTL_MS);
  store.set(entry.challengeId,entry);
  const capture=trustedCaptureAttestation(context,entry);
  return {ok:true,statusCode:200,stage:capture?'voice_challenge_verified':'voice_challenge_response_verified',challenge:publicChallenge(entry,false),
    speakerId:speaker,challengeResponseVerified:true,liveChallengeVerified:capture,requiresSpeechCaptureAttestation:!capture,
    challengeStatus:capture?'verified':'response_verified_unattested',challengeProof:proof,challengePreventsReplay:true,
    challengeIsAuthority:false,identityIsAuthority:false,authorityStillRequiresRBAC:true,rawAudioStored:false,audioStored:false,
    voiceprintStored:false,transcriptOnly:true,health:health()};
}
function trustedCaptureAttestation(context,entry) {
  const a=own(context,'speechCaptureAttestation');
  return isObject(a)&&own(a,'verified')===true&&safeText(own(a,'source'),80)==='trusted_voice_capture'&&
    safeText(own(a,'sessionId'),160)===entry.sessionId&&safeText(own(a,'speakerId'),120)===entry.speakerId&&!!safeText(own(a,'attestationId'),160);
}
function verifyChallengeProof(proof,context,expected={}) {
  if(!isAuthorizedCheckContext(context)||typeof proof!=='string'||proof.length>1200) return {ok:false,challengeResponseVerified:false,liveChallengeVerified:false,status:'untrusted_context_or_proof'};
  const parts=proof.split('.'); if(parts.length!==2) return {ok:false,challengeResponseVerified:false,liveChallengeVerified:false,status:'malformed_proof'};
  let payload; try { payload=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')); } catch(_) { return {ok:false,challengeResponseVerified:false,liveChallengeVerified:false,status:'malformed_proof'}; }
  const expectedMac=crypto.createHmac('sha256',proofSecret).update(parts[0]).digest();
  let actualMac; try { actualMac=Buffer.from(parts[1],'base64url'); } catch(_) { return {ok:false,challengeResponseVerified:false,liveChallengeVerified:false,status:'malformed_proof'}; }
  if(actualMac.length!==expectedMac.length||!crypto.timingSafeEqual(actualMac,expectedMac)) return {ok:false,challengeResponseVerified:false,liveChallengeVerified:false,status:'bad_signature'};
  const id=safeText(payload.id,160), speaker=normalizeSpeakerId(payload.speakerId), sid=safeText(payload.sessionId,160), exp=Number(payload.exp);
  const entry=store.get(id), t=now();
  if(!entry||entry.state!==STATES.VERIFIED||entry.proofHash!==sha256(proof)||entry.proofExpiresAtMs<=t||!Number.isFinite(exp)||exp<=t||exp>entry.expiresAtMs||
    sid!==sessionId(context)||sid!==entry.sessionId||speaker!==entry.speakerId||
    (own(expected,'speakerId')&&normalizeSpeakerId(own(expected,'speakerId'))!==speaker)) return {ok:false,challengeResponseVerified:false,liveChallengeVerified:false,status:'expired_replayed_or_mismatched'};
  const capture=trustedCaptureAttestation(context,entry);
  return {ok:true,challengeId:id,speakerId:speaker,sessionId:sid,challengeResponseVerified:true,liveChallengeVerified:capture,
    requiresSpeechCaptureAttestation:!capture,status:capture?'verified':'response_verified_unattested',expiresAt:iso(exp),challengeIsAuthority:false,identityIsAuthority:false};
}
function evaluateChallengeEvidence(input,context) {
  const src=isObject(input)?input:{};
  const proof=own(src,'challengeProof')||own(src,'voiceChallengeProof')||own(own(src,'voiceChallenge'),'challengeProof');
  const verified=verifyChallengeProof(proof,context,{speakerId:own(src,'speakerId')||own(src,'detectedSpeakerId')});
  const required=own(src,'liveChallengeRequired')===true||own(src,'requireLiveChallenge')===true;
  return {version:VERSION,liveChallengeRequired:required,liveChallengeProvided:!!proof,
    challengeResponseVerified:verified.challengeResponseVerified===true,liveChallengeVerified:verified.liveChallengeVerified===true,
    challengeStatus:verified.status||'missing',challengeClaimTrusted:verified.liveChallengeVerified===true,
    requiresSpeechCaptureAttestation:verified.requiresSpeechCaptureAttestation===true,challengePreventsReplay:true,
    challengeIsAuthority:false,identityIsAuthority:false,authorityStillRequiresRBAC:true,rawAudioStored:false,audioStored:false,
    voiceprintStored:false,biometricTemplateStored:false,transcriptOnly:true,continuityWindowEligible:verified.liveChallengeVerified===true,
    continuityWindowMayOpen:verified.liveChallengeVerified===true};
}
function revokeChallenge(input,context) {
  sweep(); if(!isOwnerContext(context)) return {ok:false,statusCode:403,stage:'voice_challenge_revoke_owner_session_required',reason:'verified_owner_session_required',health:health()};
  const id=challengeIdFrom(input), entry=store.get(id); if(!entry) return {ok:false,statusCode:404,stage:'voice_challenge_not_found',reason:'challenge_not_found_or_expired',health:health()};
  store.delete(id); return {ok:true,statusCode:200,stage:'voice_challenge_revoked',liveChallengeVerified:false,challengePreventsReplay:true,health:health()};
}
function clearChallengesForTests() { store.clear(); return health(); }

module.exports={VERSION,STATES,CHALLENGE_STATES:STATES,health,issueChallenge,checkChallenge,revokeChallenge,evaluateChallengeEvidence,
  verifyChallengeProof,normalizeResponse,normalizeSpeakerId,clearChallengesForTests};
