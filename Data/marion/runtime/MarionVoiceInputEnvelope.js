'use strict';

/**
 * MarionVoiceInputEnvelope
 * Creates a strict voice-input contract before any spoken transcript reaches Marion.
 * No raw audio is stored here. Transcript-only envelope.
 */

const VERSION = 'marion.voiceInputEnvelope/2.5-phase7-continuity-window';
const VOICE_SOURCE = 'voice';
const DEFAULT_LOCALE = 'en-CA';
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;

const speakerIdentityMod = (() => {
  try {
    return require('./MarionVoiceSpeakerIdentity');
  } catch (_) {
    return null;
  }
})();

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < MIN_CONFIDENCE) return MIN_CONFIDENCE;
  if (n > MAX_CONFIDENCE) return MAX_CONFIDENCE;
  return n;
}

function cleanTranscript(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPublicHint(value, maxLength = 120) {
  const max = Number.isFinite(Number(maxLength)) ? Math.max(8, Math.min(Number(maxLength), 500)) : 120;
  return String(value || '')
    .replace(/[^\w\s.@:/_-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function firstTranscript(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return cleanTranscript(
    p.transcript ||
      p.text ||
      p.message ||
      p.query ||
      p.input ||
      p.userQuery ||
      ''
  );
}

function hasTrustedServerAdminVoiceProof(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const trusted =
    p.serverSideAdminVoiceAuth === true ||
    p.trustedServerAuth === true ||
    p.adminVoiceProofTrusted === true ||
    p.trustedAdminVoiceProof === true;

  if (!trusted) return false;

  return p.adminVoiceVerified === true ||
    p.adminVoiceTokenVerified === true ||
    p.adminVoiceDeliveryAllowed === true ||
    p.adminVerified === true;
}

function detectIntentHint(transcript) {
  const text = String(transcript || '').toLowerCase();

  if (!text) return 'empty';
  if (/\b(stop|cancel|nevermind|never mind|abort)\b/.test(text)) return 'cancel';
  if (/\b(open|launch|start|run|execute|deploy|delete|remove|send|publish)\b/.test(text)) return 'command';
  if (/\b(status|where are we|update|report|summary|diagnose|autopsy)\b/.test(text)) return 'status';
  if (/\b(create|build|generate|write|draft|make)\b/.test(text)) return 'creation';
  if (/\bexplain|what is|why|how\b/.test(text)) return 'inquiry';

  return 'conversation';
}

function createVoiceInputEnvelope(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const transcript = firstTranscript(payload);
  const confidence = clampConfidence(payload.confidence);
  const adminVoiceVerified = hasTrustedServerAdminVoiceProof(payload);
  const privateDelivery = payload.privateDelivery === true || payload.privateVoiceDelivery === true;

  const envelope = {
    ok: transcript.length > 0,
    version: VERSION,
    source: VOICE_SOURCE,
    inputChannel: VOICE_SOURCE,
    transcript,
    confidence,
    locale: cleanPublicHint(payload.locale || payload.language || DEFAULT_LOCALE, 40) || DEFAULT_LOCALE,
    receivedAt: payload.receivedAt || new Date().toISOString(),
    userIntentHint: payload.userIntentHint || detectIntentHint(transcript),
    authorizationState: payload.authorizationState || 'unchecked',
    speakerHint: cleanPublicHint(payload.speakerHint || payload.speaker || ''),
    sessionId: cleanPublicHint(payload.sessionId || '', 160) || null,
    requestId: cleanPublicHint(payload.requestId || '', 160) || null,
    adminOnlyVoiceDelivery: payload.adminOnlyVoiceDelivery !== false,
    adminVoiceVerified,
    adminVoiceAuthSource: adminVoiceVerified ? cleanPublicHint(payload.adminVoiceAuthSource || '', 80) : '',
    adminVoiceDeliveryAllowed: adminVoiceVerified,
    privateDelivery,
    privateVoiceDelivery: privateDelivery,
    claimedSpeaker: cleanPublicHint(payload.claimedSpeaker || payload.speaker || payload.user || '', 160),
    detectedSpeakerId: cleanPublicHint(payload.detectedSpeakerId || payload.speakerId || '', 160),
    speakerConfidence: clampConfidence(payload.speakerConfidence != null ? payload.speakerConfidence : payload.voiceConfidence),
    voiceMatchStatus: cleanPublicHint(payload.voiceMatchStatus || '', 80),
    voiceProfileEnrolled: payload.voiceProfileEnrolled === true,
    challengeId: cleanPublicHint(payload.challengeId || payload.voiceChallengeId || '', 160),
    challengeResponse: cleanTranscript(payload.challengeResponse || payload.responseTranscript || payload.challengeAnswer || ''),
    liveChallengeRequired: payload.liveChallengeRequired === true || payload.requireLiveChallenge === true,
    liveChallengeVerified: payload.liveChallengeVerified === true && payload.trustedServerAuth === true,
    voiceChallengeVerified: payload.voiceChallengeVerified === true && payload.trustedServerAuth === true,
    challengePreventsReplay: true,
    challengeIsAuthority: false,
    continuityWindowId: cleanPublicHint(payload.continuityWindowId || payload.windowId || payload.voiceWindowId || '', 160),
    continuityWindowTokenPresent: !!(payload.continuityToken || payload.voiceContinuityToken || payload.windowToken),
    trustedVoiceWindowActive: payload.trustedVoiceWindowActive === true && payload.trustedServerAuth === true,
    continuityWindowVerified: payload.continuityWindowVerified === true && payload.trustedServerAuth === true,
    voiceContinuityRequired: payload.voiceContinuityRequired === true || payload.requireContinuityWindow === true,
    continuityPreventsSessionDrift: true,
    continuityIsAuthority: false,
    speakerRegistryStatus: cleanPublicHint(payload.speakerRegistryStatus || '', 80),
    speakerRegistryMatched: payload.speakerRegistryMatched === true,
    profileMetadataOnly: true,
    voiceprintStored: false,
    sessionRole: cleanPublicHint(payload.sessionRole || payload.role || '', 80),
    remoteTrustedUserVerified: payload.remoteTrustedUserVerified === true || payload.remoteTrustedUserTokenVerified === true,
    remoteTrustedUserTokenVerified: payload.remoteTrustedUserTokenVerified === true,
    trustedRemoteUserAuth: payload.trustedRemoteUserAuth === true,
    rawAudioStored: false,
    audioStored: false,
    voiceStored: false,
    transcriptOnly: true,
    deliveryChannel: cleanPublicHint(payload.deliveryChannel || (privateDelivery ? 'lingosentinel_private_voice' : ''), 80),
    rawMeta: {
      provider: cleanPublicHint(payload.provider || 'browser-native', 80),
      client: cleanPublicHint(payload.client || '', 80) || null,
      userAgent: cleanPublicHint(payload.userAgent || '', 220) || null,
      interim: Boolean(payload.interim),
      final: payload.final !== false,
      audioStored: false,
      rawAudioAccepted: false,
      transcriptOnly: true
    },
    warnings: transcript.length > 0 ? [] : ['EMPTY_TRANSCRIPT']
  };

  if (speakerIdentityMod && typeof speakerIdentityMod.applyVoiceSpeakerIdentityEnvelope === 'function') {
    return speakerIdentityMod.applyVoiceSpeakerIdentityEnvelope(envelope, {
      adminVoiceVerified,
      adminVoiceTokenVerified: adminVoiceVerified,
      adminVoiceDeliveryAllowed: adminVoiceVerified,
      remoteTrustedUserVerified: envelope.remoteTrustedUserVerified === true,
      remoteTrustedUserTokenVerified: envelope.remoteTrustedUserTokenVerified === true,
      role: envelope.sessionRole || '',
      trustSpeakerHint: payload.trustSpeakerHint === true || payload.requestTrustedSpeakerHint === true,
      speakerConfidence: envelope.speakerConfidence,
      voiceMatchStatus: envelope.voiceMatchStatus,
      challengeId: envelope.challengeId,
      challengeResponse: envelope.challengeResponse,
      liveChallengeRequired: envelope.liveChallengeRequired,
      liveChallengeVerified: envelope.liveChallengeVerified,
      voiceChallengeVerified: envelope.voiceChallengeVerified,
      sessionVerified: payload.sessionVerified === true,
      detectedSpeakerId: envelope.detectedSpeakerId,
      claimedSpeaker: envelope.claimedSpeaker
    });
  }

  return envelope;
}

function isVoiceInputEnvelope(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.source === VOICE_SOURCE &&
    value.inputChannel === VOICE_SOURCE &&
    typeof value.transcript === 'string' &&
    typeof value.receivedAt === 'string'
  );
}

module.exports = {
  VERSION,
  VOICE_SOURCE,
  DEFAULT_LOCALE,
  createVoiceInputEnvelope,
  isVoiceInputEnvelope,
  detectIntentHint,
  cleanTranscript,
  cleanPublicHint,
  firstTranscript,
  hasTrustedServerAdminVoiceProof,
  clampConfidence
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


/* PHASE3D_VOICE_INPUT_PARITY_HARDLOCK_START */
(function(){try{
  const V="nyx.marion.phase3d.voiceInputParityWrapper/1.0";let lock=null;try{lock=require("./voiceTextParityIdentityDriftHardlock.js");}catch(_){lock=null;}
  if(!lock||!lock.projectVoiceInputEnvelope||typeof module==="undefined"||!module.exports)return;
  const orig=module.exports.createVoiceInputEnvelope;
  if(typeof orig==="function"&&!orig.__phase3dVoiceInputParity){
    module.exports.createVoiceInputEnvelope=function(){const args=arguments;const r=orig.apply(this,args);const project=v=>lock.projectVoiceInputEnvelope(v,{body:args[0],options:args[1],inputChannel:"voice",voice:true});return r&&typeof r.then==="function"?r.then(project):project(r);};
    module.exports.createVoiceInputEnvelope.__phase3dVoiceInputParity=true;
  }
  module.exports.PHASE3D_VOICE_INPUT_PARITY_HARDLOCK_VERSION=V;
}catch(_){}})();
/* PHASE3D_VOICE_INPUT_PARITY_HARDLOCK_END */
