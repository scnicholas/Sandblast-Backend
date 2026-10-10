'use strict';

/** Short-lived continuity is a bearer capability bound to a verified session
 * and speaker ID. It requires a challenge with trusted speech-capture proof. */
const crypto=require('crypto');
const challengeVerifierMod=safeRequire('./MarionVoiceChallengeVerifier');
const VERSION='marion.voiceContinuityWindow/2.0-phase4-token-verified';
const DEFAULT_TTL_MS=clampEnv('SB_MARION_VOICE_CONTINUITY_TTL_MS',180000,30000,900000);
const DEFAULT_IDLE_MS=clampEnv('SB_MARION_VOICE_CONTINUITY_IDLE_MS',75000,15000,300000);
const MAX_WINDOWS=clampEnv('SB_MARION_VOICE_CONTINUITY_MAX',50,1,500);
const windows=new Map();
const STATES=Object.freeze({UNKNOWN:'unknown',OPEN:'open',ACTIVE:'active',EXPIRED:'expired',REVOKED:'revoked',BLOCKED:'blocked'});
let lastSweep=0;

function safeRequire(name){try{return require(name);}catch(_){return null;}}
function clampEnv(name,fallback,min,max){const n=Number(process.env[name]);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):fallback;}
function isObject(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
function own(o,k){if(!isObject(o))return undefined;try{const d=Object.getOwnPropertyDescriptor(o,k);return d&&Object.prototype.hasOwnProperty.call(d,'value')?d.value:undefined;}catch(_){return undefined;}}
function safeText(v,max=160){if(typeof v!=='string'&&typeof v!=='number'&&typeof v!=='boolean')return '';return String(v).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,Math.max(1,Math.min(Number(max)||160,500)));}
function now(){return Date.now();}
function iso(t){return new Date(Number.isFinite(Number(t))?Number(t):now()).toISOString();}
function normalizeSpeakerId(v){return safeText(v,160).toLowerCase().replace(/[^a-z0-9._:@/-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,120);}
function normalizeRole(v){const s=safeText(v,80).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');if(['owner','admin','administrator'].includes(s))return 'owner';if(['admin_operator','operator'].includes(s))return 'admin_operator';if(['remote_trusted_user','trusted_remote_user','remote_user'].includes(s))return 'remote_trusted_user';if(s==='voice_user')return 'voice_user';return 'blocked';}
function role(ctx){return normalizeRole(own(ctx,'role')||own(ctx,'sessionRole')||own(ctx,'adminRole'));}
function sessionId(ctx){return safeText(own(ctx,'sessionId'),160);}
function allowed(ctx){if(!isObject(ctx)||own(ctx,'sessionVerified')!==true||!sessionId(ctx))return false;const r=role(ctx);const admin=own(ctx,'adminVerified')===true&&['owner','admin','administrator','admin_operator'].includes(r);const remote=own(ctx,'remoteTrustedUserVerified')===true&&['remote_trusted_user','voice_user'].includes(r);return admin||remote;}
function speakerId(input){return normalizeSpeakerId(own(input,'speakerId')||own(input,'detectedSpeakerId'));}
function windowId(input){return safeText(own(input,'windowId')||own(input,'continuityWindowId')||own(input,'voiceWindowId')||'',160);}
function token(input){return safeText(own(input,'continuityToken')||own(input,'voiceContinuityToken')||own(input,'windowToken')||'',300);}
function sha256(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex');}
function safeEqualHex(a,b){try{const x=Buffer.from(String(a),'hex'),y=Buffer.from(String(b),'hex');return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y);}catch(_){return false;}}
function newId(){return 'mvcw_'+crypto.randomBytes(18).toString('base64url');}
function newToken(){return 'mvcwt_'+crypto.randomBytes(32).toString('base64url');}
function sweep(force=false){const t=now();if(!force&&t-lastSweep<30000)return;lastSweep=t;for(const [id,e]of windows)if(!e||e.state===STATES.REVOKED||e.expiresAtMs<=t||e.idleExpiresAtMs<=t)windows.delete(id);}
function publicWindow(e){return e?{windowId:e.windowId,speakerId:e.speakerId,state:e.state,roleBinding:e.roleBinding,openedAt:e.openedAt,lastSeenAt:e.lastSeenAt,
  expiresAt:e.expiresAt,idleExpiresAt:e.idleExpiresAt,expiresInMs:Math.max(0,e.expiresAtMs-now()),idleExpiresInMs:Math.max(0,e.idleExpiresAtMs-now()),
  sessionBound:true,sessionIdPresent:true,challengeIdPresent:!!e.challengeId,trustedVoiceWindowActive:e.state===STATES.OPEN||e.state===STATES.ACTIVE,
  continuityWindowVerified:e.state===STATES.OPEN||e.state===STATES.ACTIVE,continuityIsAuthority:false,challengeIsAuthority:false,
  identityIsAuthority:false,authorityStillRequiresRBAC:true,rawAudioStored:false,audioStored:false,voiceprintStored:false,transcriptOnly:true}:null;}
function health(){sweep();return{ok:true,service:'marion-voice-continuity-window',version:VERSION,storageMode:'process_memory',persistent:false,
  windowsActive:windows.size,ttlMs:DEFAULT_TTL_MS,idleMs:DEFAULT_IDLE_MS,maxWindows:MAX_WINDOWS,challengeRequiredToOpen:true,
  speechCaptureAttestationRequired:true,sessionBound:true,speakerBound:true,singleSessionWindow:true,continuityIsAuthority:false,
  challengeIsAuthority:false,identityIsAuthority:false,authorityStillRequiresRBAC:true,rawAudioStored:false,audioStored:false,
  voiceprintStored:false,transcriptOnly:true,challengeVerifierAvailable:!!challengeVerifierMod,counts:{active:windows.size}};}
function sessionInputMatches(input,ctx){const supplied=safeText(own(input,'sessionId')||own(input,'adminSessionId'),160);return !supplied||supplied===sessionId(ctx);}
function openContinuityWindow(input,context){
  sweep();const src=isObject(input)?input:{};const ctx=isObject(context)?context:{};
  if(!allowed(ctx))return{ok:false,statusCode:403,stage:'voice_continuity_session_required',reason:'verified_session_required',health:health()};
  if(!challengeVerifierMod||typeof challengeVerifierMod.verifyChallengeProof!=='function')return{ok:false,statusCode:503,stage:'voice_continuity_challenge_verifier_unavailable',reason:'attested_challenge_verifier_required',health:health()};
  if(!sessionInputMatches(src,ctx))return{ok:false,statusCode:403,stage:'voice_continuity_session_mismatch',reason:'body_session_must_match_verified_session',health:health()};
  const sid=sessionId(ctx),spk=speakerId(src);if(!spk)return{ok:false,statusCode:400,stage:'voice_continuity_speaker_required',reason:'speaker_id_required',health:health()};
  let proof=own(src,'challengeProof')||own(src,'voiceChallengeProof');
  let verified=proof&&challengeVerifierMod.verifyChallengeProof(proof,ctx,{speakerId:spk});
  if((!verified||verified.ok!==true)&&typeof challengeVerifierMod.checkChallenge==='function'&&own(src,'challengeResponse')){
    const checked=challengeVerifierMod.checkChallenge({challengeId:own(src,'challengeId'),speakerId:spk,challengeResponse:own(src,'challengeResponse')},ctx);
    proof=checked&&checked.challengeProof;verified=proof&&challengeVerifierMod.verifyChallengeProof(proof,ctx,{speakerId:spk});
  }
  if(!verified||verified.ok!==true||verified.liveChallengeVerified!==true)return{ok:false,statusCode:403,stage:'voice_continuity_attested_challenge_required',reason:'fresh_challenge_and_trusted_speech_capture_attestation_required',challenge:verified||null,trustedVoiceWindowActive:false,continuityWindowVerified:false,health:health()};
  for(const e of windows.values())if(e.sessionId===sid&&e.speakerId===spk)return{ok:false,statusCode:409,stage:'voice_continuity_window_exists',reason:'active_window_already_exists_for_session_and_speaker',health:health()};
  if(windows.size>=MAX_WINDOWS)return{ok:false,statusCode:429,stage:'voice_continuity_capacity_reached',reason:'active_window_capacity_reached',health:health()};
  const t=now(),id=newId(),plain=newToken(),ttlRaw=Number(own(src,'ttlMs')),ttl=Number.isFinite(ttlRaw)?Math.max(30000,Math.min(900000,ttlRaw)):DEFAULT_TTL_MS;
  const e={windowId:id,tokenHash:sha256(plain),speakerId:spk,sessionId:sid,roleBinding:role(ctx),challengeId:verified.challengeId||'',state:STATES.OPEN,
    openedAt:iso(t),lastSeenAt:iso(t),expiresAtMs:t+ttl,idleExpiresAtMs:t+Math.min(DEFAULT_IDLE_MS,ttl)};
  e.expiresAt=iso(e.expiresAtMs);e.idleExpiresAt=iso(e.idleExpiresAtMs);windows.set(id,e);
  return{ok:true,statusCode:200,stage:'voice_continuity_window_opened',continuityWindow:publicWindow(e),windowId:id,continuityToken:plain,
    speakerId:spk,sessionIdPresent:true,trustedVoiceWindowActive:true,continuityWindowVerified:true,
    continuityRequiresFreshChallenge:true,continuityIsAuthority:false,challengeIsAuthority:false,identityIsAuthority:false,
    authorityStillRequiresRBAC:true,rawAudioStored:false,audioStored:false,voiceprintStored:false,transcriptOnly:true,health:health()};
}
function checkContinuityWindow(input,context){
  sweep();const src=isObject(input)?input:{};const ctx=isObject(context)?context:{};
  if(!allowed(ctx))return{ok:false,statusCode:403,stage:'voice_continuity_session_required',reason:'verified_session_required',trustedVoiceWindowActive:false,health:health()};
  if(!sessionInputMatches(src,ctx))return{ok:false,statusCode:403,stage:'voice_continuity_session_mismatch',reason:'body_session_must_match_verified_session',trustedVoiceWindowActive:false,health:health()};
  const id=windowId(src),bearer=token(src),spk=speakerId(src);
  if(!id||!bearer||!spk)return{ok:false,statusCode:401,stage:'voice_continuity_token_required',reason:'window_id_token_and_speaker_id_required',trustedVoiceWindowActive:false,health:health()};
  const e=windows.get(id),t=now();if(!e)return{ok:false,statusCode:404,stage:'voice_continuity_not_found',reason:'continuity_window_not_found_or_expired',trustedVoiceWindowActive:false,health:health()};
  if(!safeEqualHex(sha256(bearer),e.tokenHash))return{ok:false,statusCode:403,stage:'voice_continuity_token_mismatch',reason:'continuity_token_mismatch',trustedVoiceWindowActive:false,health:health()};
  if(e.expiresAtMs<=t||e.idleExpiresAtMs<=t){windows.delete(id);return{ok:false,statusCode:403,stage:'voice_continuity_expired',reason:'continuity_window_expired_rechallenge_required',trustedVoiceWindowActive:false,health:health()};}
  if(e.sessionId!==sessionId(ctx)||e.speakerId!==spk)return{ok:false,statusCode:403,stage:'voice_continuity_binding_mismatch',reason:'session_or_speaker_binding_mismatch',trustedVoiceWindowActive:false,health:health()};
  e.state=STATES.ACTIVE;e.lastSeenAt=iso(t);e.idleExpiresAtMs=Math.min(e.expiresAtMs,t+DEFAULT_IDLE_MS);e.idleExpiresAt=iso(e.idleExpiresAtMs);
  return{ok:true,statusCode:200,stage:'voice_continuity_window_verified',continuityWindow:publicWindow(e),windowId:id,speakerId:e.speakerId,
    sessionIdPresent:true,trustedVoiceWindowActive:true,continuityWindowVerified:true,continuityRequiresFreshChallenge:false,
    continuityIsAuthority:false,challengeIsAuthority:false,identityIsAuthority:false,authorityStillRequiresRBAC:true,
    rawAudioStored:false,audioStored:false,voiceprintStored:false,transcriptOnly:true,health:health()};
}
function revokeContinuityWindow(input,context){
  sweep();const ctx=isObject(context)?context:{};if(!allowed(ctx))return{ok:false,statusCode:403,stage:'voice_continuity_session_required',reason:'verified_session_required',health:health()};
  const id=windowId(input),e=windows.get(id);if(!id||!e)return{ok:false,statusCode:404,stage:'voice_continuity_not_found',reason:'continuity_window_not_found_or_expired',health:health()};
  if(e.sessionId!==sessionId(ctx))return{ok:false,statusCode:403,stage:'voice_continuity_session_mismatch',reason:'window_owned_by_another_session',health:health()};
  windows.delete(id);return{ok:true,statusCode:200,stage:'voice_continuity_window_revoked',trustedVoiceWindowActive:false,continuityWindowVerified:false,health:health()};
}
function evaluateContinuityEvidence(input,context){
  const src=isObject(input)?input:{};const ctx=isObject(context)?context:{};const required=own(src,'continuityWindowRequired')===true||own(src,'voiceContinuityRequired')===true||own(src,'requireContinuityWindow')===true;
  const provided=!!(windowId(src)&&token(src));const checked=provided?checkContinuityWindow(src,ctx):null;const active=!!(checked&&checked.ok===true&&checked.trustedVoiceWindowActive===true);
  return{version:VERSION,continuityWindowRequired:required,continuityWindowProvided:provided,trustedVoiceWindowActive:active,continuityWindowVerified:active,
    continuityStatus:checked?checked.stage:'missing',continuityClaimTrusted:active,continuityRequiresFreshChallenge:!active,
    continuityPreventsSessionDrift:true,continuityIsAuthority:false,challengeIsAuthority:false,identityIsAuthority:false,
    authorityStillRequiresRBAC:true,rawAudioStored:false,audioStored:false,voiceprintStored:false,transcriptOnly:true,check:checked};
}
function clearContinuityWindowsForTests(){windows.clear();return health();}

module.exports={VERSION,WINDOW_STATES:STATES,health,openContinuityWindow,checkContinuityWindow,revokeContinuityWindow,
  evaluateContinuityEvidence,normalizeSpeakerId,clearContinuityWindowsForTests};
