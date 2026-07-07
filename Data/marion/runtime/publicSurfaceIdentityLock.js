"use strict";
/**
 * publicSurfaceIdentityLock.js
 * Phase 1+2B Public Surface Identity + Loop/Fallback Surface Purge.
 *
 * Purpose:
 * - Nyx owns every public Sandblast.channel response.
 * - Marion remains hidden on public surfaces.
 * - Private/operator Marion surfaces are left untouched only when Phase 2 verifies
 *   an authenticated operator/admin context. Body claims alone do not bypass this lock.
 * - Public presence/check-in prompts are answered from a clean Nyx template.
 * - Runtime/testing/loop/fallback language is never allowed to render publicly.
 */
const VERSION = "nyx.publicSurfaceIdentityLock/1.2-phase2b-public-loop-fallback-purge";
let privateLock = null;
try { privateLock = require("./privateOperatorBoundaryLock.js"); } catch (_) { privateLock = null; }

const REPLY_KEYS = new Set([
  "reply", "text", "answer", "response", "message", "output", "spokenText", "speechText",
  "displayReply", "publicReply", "visibleReply", "finalReply", "authoritativeReply",
  "adminReply", "marionReply", "privateReply"
]);
const BLOCKED_IDENTITY_KEYS = /marionAdmin|directMarion|authenticatedOperator|operatorName|operatorPersonalization|allowPersonalName|privateAdmin|adminConversationAllowed|marionAdminConversationAllowed|publicUsersCanAddressMarion|publicUsersMayAddressMarion/i;
const PUBLIC_PRESENCE_PROMPT_RE = /^(?:hi\s+nyx\s*)?(?:are\s+you\s+(?:with\s+me|there|here|online|working|ready)|can\s+you\s+(?:hear\s+me|see\s+this|respond)|do\s+you\s+hear\s+me|you\s+there|still\s+there|hello\??|hi\??|hey\??)\??$/i;
const PUBLIC_WHO_PROMPT_RE = /\b(?:who\s+am\s+i\s+talking\s+to|who\s+are\s+you|is\s+marion\s+connected|am\s+i\s+talking\s+to\s+marion)\b/i;
const INTERNAL_PUBLIC_LEAK_RE = new RegExp([
  "\\bwith\\s+the\\s+thread\\b",
  "\\bkeep\\s+the\\s+(?:answer|reply)\\s+(?:human,?\\s*)?protective\\b",
  "\\bhuman,?\\s*protective,?\\s*and\\s*clean\\b",
  "\\bgreeting\\s+lane\\b",
  "\\btesting\\s+the\\s+greeting\\s+lane\\b",
  "\\bkeep\\s+testing\\b",
  "\\bresponse\\s+pass\\b",
  "\\blane\\s+test\\b",
  "\\bpublic\\s+test\\b",
  "\\boperator\\s+test\\b",
  "\\bruntime\\b",
  "\\bfallback\\b",
  "\\bloop(?:ing|ed)?\\b",
  "\\bstate\\s+spine\\b",
  "\\bsession\\s+patch\\b",
  "\\breply\\s+authority\\b",
  "\\bdiagnostic(?:s| packet)?\\b",
  "\\bfinal\\s+envelope\\b",
  "\\brouteKind\\s*[:=]",
  "\\bspeechHints\\s*[:=]",
  "\\bpresenceProfile\\s*[:=]",
  "\\bmarionFinal\\b",
  "\\btransportSafe\\b",
  "\\bnyxStateHint\\b",
  "\\bcurrent\\s+(?:turn|request|prompt)\\b",
  "\\brecovery\\s+path\\b",
  "\\bmeta[-\\s]?recovery\\b",
  "\\bvalidation\\s+harness\\b",
  "\\bregression\\s+harness\\b",
  "\\bsmoke\\s+test\\b",
  "\\bnode\\s+--check\\b",
  "\\bpassed\\s+or\\s+failed\\b",
  "\\bmark\\s+(?:as\\s+)?(?:passed|failed)\\b"
].join("|"), "i");

function isObj(v){ return !!v && typeof v === "object" && !Array.isArray(v); }
function safeObj(v){ return isObj(v) ? v : {}; }
function safeStr(v){ return v == null ? "" : String(v).replace(/\s+/g," ").trim(); }
function lower(v){ return safeStr(v).toLowerCase(); }
function headerValue(headers,name){ const h=safeObj(headers); return safeStr(h[name] || h[name.toLowerCase()] || h[name.toUpperCase()] || ""); }
function isPrivateOperatorContext(input={}){
  try { return !!(privateLock && privateLock.isVerifiedOperatorContext && privateLock.isVerifiedOperatorContext(input)); } catch (_) { return false; }
}
function isPublicSurfaceContext(input={}){
  const src=safeObj(input), body=safeObj(src.body), headers=safeObj(src.headers||body.headers), ui=safeObj(src.ui||body.ui), client=safeObj(src.client||body.client), payload=safeObj(src.payload||body.payload), req=safeObj(src.req||src.request);
  if(isPrivateOperatorContext(src)||isPrivateOperatorContext(body)||isPrivateOperatorContext({body,headers,req,payload})) return false;
  const source=lower(src.source||body.source||payload.source||headerValue(headers,"x-sb-source"));
  const audience=lower(src.audience||body.audience||payload.audience||ui.audience||headerValue(headers,"x-sb-audience"));
  const surface=lower(src.surfaceAgent||body.surfaceAgent||payload.surfaceAgent||ui.surfaceAgent||headerValue(headers,"x-sb-public-surface"));
  const site=lower(client.site||safeObj(payload.client).site||"");
  return src.publicSurfaceOnly===true||body.publicSurfaceOnly===true||payload.publicSurfaceOnly===true||ui.publicSurfaceOnly===true||src.publicIdentityLock===true||body.publicIdentityLock===true||payload.publicIdentityLock===true||audience==="public"||surface==="nyx"||source.indexOf("sandblast_channel_widget")!==-1||source.indexOf("nyx-widget")!==-1||site.indexOf("sandblast.channel")!==-1||!!headerValue(headers,"x-nyx-client-version");
}
function cleanPublicPresenceReply(){ return "I’m here. You can ask about Sandblast, radio, TV, media, AI, or business tools."; }
function cleanPublicWhoReply(){ return "You’re speaking with Nyx, the Sandblast guide for media, radio, TV, discovery, and business tools."; }
function isInternalPublicLeak(value=""){ return INTERNAL_PUBLIC_LEAK_RE.test(safeStr(value)); }
function extractPrompt(context={}){
  const src=safeObj(context), body=safeObj(src.body), payload=safeObj(src.payload), turn=safeObj(src.turn||body.turn||payload.turn);
  return safeStr(src.prompt||src.message||src.text||src.query||body.prompt||body.message||body.text||body.query||payload.prompt||payload.message||payload.text||payload.query||turn.prompt||turn.message||turn.text||"");
}
function isPublicPresencePrompt(value=""){ return PUBLIC_PRESENCE_PROMPT_RE.test(safeStr(value)); }
function isPublicWhoPrompt(value=""){ return PUBLIC_WHO_PROMPT_RE.test(safeStr(value)); }
function sanitizePublicReply(value=""){
  let t=safeStr(value);
  if(!t) return "";
  if(isInternalPublicLeak(t)) return cleanPublicPresenceReply();
  t=t.replace(/\b(I[’']?m with you|I am with you),?\s*Mac\b/gi,"$1");
  t=t.replace(/^(Hi|Hello|Hey|Good morning|Good afternoon|Good evening),?\s+Mac[.!]?\s*/i,"$1. ");
  t=t.replace(/^Mac[,—-]\s*/i,"");
  t=t.replace(/,\s*Mac(?=[.!?]|$)/gi,"");
  t=t.replace(/\bfor you,\s*Mac\b/gi,"for you");
  t=t.replace(/\byou,\s*Mac\b/gi,"you");
  t=t.replace(/\bMarion is connected behind the response path\b/gi,"Nyx is ready");
  t=t.replace(/\bMarion carries the deeper guidance after your first real question\b/gi,"I can help guide your next step");
  t=t.replace(/\bcommunicating with Marion\b/gi,"speaking with Nyx");
  t=t.replace(/\bYou(?: are|'re|’re) speaking with Marion\b/gi,"You’re speaking with Nyx");
  t=t.replace(/\bMarion\b/g,"Nyx");
  t=t.replace(/\boperator\s+personalization\b/gi,"personalization");
  t=t.replace(/\bprivate\s+admin\s+conversation\b/gi,"private support route");
  t=t.replace(/\btesting\s+(?:lane|pass|route)\b/gi,"checking the connection");
  t=t.replace(/\s+/g," ").replace(/\s+([.!?,])/g,"$1").trim();
  if(!t || isInternalPublicLeak(t)) return cleanPublicPresenceReply();
  return t;
}
function extractReply(value,depth=0){
  if(depth>6) return "";
  if(typeof value==="string") return value;
  if(!isObj(value)) return "";
  for(const k of ["publicReply","visibleReply","displayReply","finalReply","reply","answer","text","response","message","output","spokenText","speechText","authoritativeReply"]){ const v=value[k]; if(safeStr(v)) return safeStr(v); }
  for(const k of ["payload","data","result","finalEnvelope","packet","synthesis","marionFinal","final"]){ const r=extractReply(value[k],depth+1); if(r) return r; }
  return "";
}
function projectPublicReplyFields(value,context={},depth=0){
  if(isPrivateOperatorContext(context)||isPrivateOperatorContext(value)) return value;
  if(depth>8) return value;
  if(typeof value==="string") return sanitizePublicReply(value);
  if(Array.isArray(value)) return value.map(v=>projectPublicReplyFields(v,context,depth+1));
  if(!isObj(value)) return value;
  const out={};
  for(const [key,child] of Object.entries(value)){
    if(/^operatorName$/i.test(key)) continue;
    if(/^audience$/i.test(key)){ out[key]="public"; continue; }
    if(/^surfaceAgent$/i.test(key)||/^publicAgent$/i.test(key)||/^userFacingAgent$/i.test(key)){ out[key]="Nyx"; continue; }
    if(/^authority$/i.test(key)&&safeStr(child)==="Marion"){ out[key]="Nyx"; continue; }
    if(BLOCKED_IDENTITY_KEYS.test(key)){ out[key]=false; continue; }
    if(REPLY_KEYS.has(key)){ out[key]=sanitizePublicReply(child); continue; }
    out[key]=projectPublicReplyFields(child,context,depth+1);
  }
  out.publicSurfaceIdentityLock=true;
  out.publicLoopFallbackSurfacePurge=true;
  out.publicSurfaceOnly=true;
  out.surfaceAgent="nyx";
  out.publicAgent="Nyx";
  out.userFacingAgent="Nyx";
  out.audience="public";
  out.operatorPersonalization=false;
  out.allowPersonalName=false;
  out.authenticatedOperator=false;
  out.publicUsersCanAddressMarion=false;
  return out;
}
function projectPublicPayload(payload={},context={}){
  if(isPrivateOperatorContext(context)||isPrivateOperatorContext(payload)) return payload;
  const prompt=extractPrompt(context)||extractPrompt(payload);
  const base=projectPublicReplyFields(payload,context);
  let reply=sanitizePublicReply(extractReply(base));
  if(isPublicWhoPrompt(prompt)) reply=cleanPublicWhoReply();
  else if(isPublicPresencePrompt(prompt)) reply=cleanPublicPresenceReply();
  else if(!reply || isInternalPublicLeak(reply)) reply=cleanPublicPresenceReply();
  return {
    ok:safeObj(payload).ok!==false,
    handled:true,
    final:true,
    reply,
    text:reply,
    answer:reply,
    response:reply,
    message:reply,
    output:reply,
    spokenText:reply,
    displayReply:reply,
    publicReply:reply,
    visibleReply:reply,
    finalReply:reply,
    publicAgent:"Nyx",
    surfaceAgent:"nyx",
    userFacingAgent:"Nyx",
    audience:"public",
    publicSurfaceOnly:true,
    publicSurfaceIdentityLock:true,
    publicLoopFallbackSurfacePurge:true,
    operatorPersonalization:false,
    allowPersonalName:false,
    authenticatedOperator:false,
    revealBackendAgent:false,
    payload:{reply,text:reply,message:reply,spokenText:reply,publicAgent:"Nyx",surfaceAgent:"nyx",audience:"public",publicSurfaceOnly:true,publicSurfaceIdentityLock:true,publicLoopFallbackSurfacePurge:true},
    ui:{renderReady:true,connectionState:"ready",publicSurfaceOnly:true,surfaceAgent:"nyx"},
    meta:{publicSurfaceIdentityLock:true,publicLoopFallbackSurfacePurge:true,publicProjection:"Nyx",privateOperatorContext:false,version:VERSION}
  };
}
module.exports={VERSION,isPublicSurfaceContext,isPrivateOperatorContext,isInternalPublicLeak,isPublicPresencePrompt,isPublicWhoPrompt,cleanPublicPresenceReply,cleanPublicWhoReply,sanitizePublicReply,extractPrompt,extractReply,projectPublicReplyFields,projectPublicPayload};


/* PHASE3D_VOICE_TEXT_PARITY_IDENTITY_DRIFT_HARDLOCK_START */
(function(){try{
  const V="nyx.marion.phase3d.voiceTextParityIdentityDrift.runtimeWrapper/1.0";
  let lock=null;try{lock=require("./voiceTextParityIdentityDriftHardlock.js");}catch(_e){try{lock=require("../Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js");}catch(_e2){lock=null;}}
  if(!lock||!lock.projectResult||typeof module==="undefined"||!module.exports)return;
  function ctx(value,args){args=Array.prototype.slice.call(args||[]);return Object.assign({},(args[0]&&typeof args[0]==="object"?args[0]:{}),{payload:value,body:args[0],options:args[1],headers:(args[0]&&args[0].headers)||(args[1]&&args[1].headers)||{},route:(args[0]&&args[0].route)||(args[0]&&args[0].path)||""});}
  function project(value,args){try{return lock.projectResult(value,ctx(value,args));}catch(_e){return value;}}
  function wrap(fn,name){if(typeof fn!=="function"||fn.__phase3dVoiceTextParity)return fn;const w=function(){const args=arguments;const r=fn.apply(this,args);if(r&&typeof r.then==="function")return r.then(v=>project(v,args));return project(r,args);};try{Object.keys(fn).forEach(k=>{w[k]=fn[k];});}catch(_e){}try{Object.defineProperty(w,"name",{value:fn.name||name||"phase3dVoiceTextParityWrapped"});}catch(_e){}w.__phase3dVoiceTextParity=true;return w;}
  if(typeof module.exports==="function")module.exports=wrap(module.exports,"default");
  const obj=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(obj){["processWithMarion","route","maybeResolve","ask","handle","handleMessage","handleVoiceTranscript","handleVoiceInput","default","composeMarionResponse","compose","buildReply","run","handler","createMarionFinalEnvelope","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminConversation","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","safeResponse","buildResponse","createResponse","finalizeTurn"].forEach(n=>{if(typeof obj[n]==="function")obj[n]=wrap(obj[n],n);});obj.PHASE3D_VOICE_TEXT_PARITY_IDENTITY_DRIFT_HARDLOCK_VERSION=V;obj.phase3dVoiceTextParityProject=lock.projectResult;obj.phase3dVoiceTextParityCompare=lock.compareVoiceTextParity;}
}catch(_){}})();
/* PHASE3D_VOICE_TEXT_PARITY_IDENTITY_DRIFT_HARDLOCK_END */
