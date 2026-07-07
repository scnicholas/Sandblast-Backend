"use strict";

const crypto = require("crypto");
let cleanText = null;
try { ({ cleanText } = require("./MarionVoiceIntentClasses.js")); } catch (_err) { cleanText = function(value){ return value == null ? "" : String(value).replace(/\s+/g," ").trim(); }; }

const VERSION = "marion.adminVoiceIdentityGate/1.0-adminOnlyDelivery";

function envList(name, fallback) {
  const raw = cleanText(process.env[name] || "");
  const src = raw ? raw.split(",") : fallback;
  return src.map((v) => cleanText(v).toLowerCase()).filter(Boolean);
}

function normalizeSpeaker(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (!aa.length || !bb.length || aa.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(aa, bb); } catch (_) { return false; }
}

function headerValue(headers, key) {
  const h = headers && typeof headers === "object" ? headers : {};
  return h[key] || h[key.toLowerCase()] || h[key.toUpperCase()] || "";
}

function evaluateAdminVoiceIdentity(input = {}, options = {}) {
  const adminSpeakers = Array.isArray(options.adminSpeakers) && options.adminSpeakers.length
    ? options.adminSpeakers.map(normalizeSpeaker).filter(Boolean)
    : envList("SB_MARION_ADMIN_SPEAKERS", ["mac", "sean", "sean nicholas", "sandblast admin"]);

  const speakerCandidates = [
    input.speakerHint,
    input.speaker,
    input.user,
    input.adminName,
    input.profileName,
    options.speakerHint
  ].map(normalizeSpeaker).filter(Boolean);

  const speakerAccepted = speakerCandidates.some((speaker) => adminSpeakers.includes(speaker));
  const requiredToken = cleanText(options.requiredAdminToken || process.env.SB_MARION_ADMIN_VOICE_TOKEN || "");
  const providedToken = cleanText(
    input.adminToken ||
    input.token ||
    headerValue(input.headers, "x-sb-marion-admin-token") ||
    headerValue(input.headers, "x-sb-admin-voice-token") ||
    ""
  );
  const requireToken = options.requireAdminToken === true || /^(?:1|true|yes|on)$/i.test(cleanText(process.env.SB_MARION_ADMIN_VOICE_REQUIRE_TOKEN || ""));
  const tokenConfigured = !!requiredToken;
  const tokenAccepted = tokenConfigured ? safeEqual(providedToken, requiredToken) : false;
  const authorized = speakerAccepted && (!requireToken || tokenAccepted);

  return {
    ok: true,
    version: VERSION,
    authorized,
    adminVoiceAllowed: authorized,
    speakerAccepted,
    tokenConfigured,
    tokenRequired: requireToken,
    tokenAccepted,
    reason: authorized
      ? "ADMIN_VOICE_IDENTITY_ACCEPTED"
      : !speakerAccepted
        ? "ADMIN_SPEAKER_NOT_ACCEPTED"
        : "ADMIN_TOKEN_REQUIRED_OR_INVALID",
    identityMode: requireToken ? "speaker_plus_token" : "speaker_hint_development_lock",
    audioStored: false,
    noRawAudioStored: true
  };
}

module.exports = {
  VERSION,
  evaluateAdminVoiceIdentity,
  normalizeSpeaker
};


/* LIVE_CONVERSATION_PARTITION_VALIDATION_PHASE3_START */
(function(){
  "use strict";
  const V="nyx.marion.phase3.liveConversationPartition.runtimeWrapper/1.0";
  let part=null;try{part=require("./liveConversationPartitionValidator.js");}catch(_err){try{part=require("../Data/marion/runtime/liveConversationPartitionValidator.js");}catch(_err2){part=null;}}
  if(!part||!part.projectResult||typeof module==="undefined"||!module.exports)return;
  function ctx(value,args){args=Array.prototype.slice.call(args||[]);return{payload:value,body:args[0],auth:args[1],meta:args[2],headers:(args[0]&&args[0].headers)||(args[1]&&args[1].headers)||{},route:(value&&value.route)||(args[0]&&args[0].route)||(args[0]&&args[0].path)||""};}
  function project(value,args){try{return part.projectResult(value,ctx(value,args));}catch(_err){return value;}}
  function wrapFn(fn,name){if(typeof fn!=="function"||fn.__nyxPhase3Partition)return fn;const wrapped=function(){const args=arguments;const res=fn.apply(this,args);if(res&&typeof res.then==="function")return res.then(function(v){return project(v,args);});return project(res,args);};try{Object.keys(fn).forEach(function(k){wrapped[k]=fn[k];});}catch(_err){}try{Object.defineProperty(wrapped,"name",{value:fn.name||name||"phase3PartitionWrapped"});}catch(_err){}wrapped.__nyxPhase3Partition=true;return wrapped;}
  try{if(typeof module.exports==="function")module.exports=wrapFn(module.exports,"default");}catch(_err){}
  try{const obj=module.exports&&typeof module.exports==="object"?module.exports:null;if(obj){["processWithMarion","route","maybeResolve","ask","handle","handleVoiceTranscript","handleVoiceInput","default","composeMarionResponse","compose","buildReply","run","handler","createMarionFinalEnvelope","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","normalizeCommand","handleMarionAdminConversation","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","process","safeResponse","buildResponse","createResponse","finalizeTurn","updateState","advanceState","mergeState","inspectLoop","checkLoop","evaluateLoop","guardReply","matchPacket","selectPacket","resolvePacket","applyPacket"].forEach(function(n){if(typeof obj[n]==="function")obj[n]=wrapFn(obj[n],n);});obj.LIVE_CONVERSATION_PARTITION_VALIDATION_PHASE3_VERSION=V;obj.liveConversationPartitionProject=part.projectResult;obj.liveConversationPartitionPatch=part.buildPartitionPatch;obj.liveConversationPartitionValidate=part.validateNoCrossPartitionLeak;}}catch(_err){}
})();
/* LIVE_CONVERSATION_PARTITION_VALIDATION_PHASE3_END */
