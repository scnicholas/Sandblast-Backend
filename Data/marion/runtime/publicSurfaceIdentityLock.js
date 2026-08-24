"use strict";
/**
 * publicSurfaceIdentityLock.js
 * Phase 1+2B Public Surface Identity + Loop/Fallback Surface Purge.
 *
 * Purpose:
 * - Nyx owns every public Sandblast.channel response identity.
 * - Marion may remain the hidden semantic authority behind a verified final.
 * - Private/operator Marion surfaces are left untouched only when Phase 2 verifies
 *   an authenticated operator/admin context. Body claims alone do not bypass this lock.
 * - Public presence/check-in and identity prompts are answered from clean Nyx templates.
 * - Runtime/testing/loop/fallback contract language is never allowed to render publicly.
 * - Public identity projection must never replace a valid Marion semantic answer.
 */
const VERSION = "nyx.publicSurfaceIdentityLock/1.3-semantic-authority-preserve";
const FINAL_AUTHORITY_VERSION = "nyx.publicSurfaceIdentityLock.finalAuthority/1.0";

let privateLock = null;
try { privateLock = require("./privateOperatorBoundaryLock.js"); } catch (_) { privateLock = null; }

const REPLY_KEYS = new Set([
  "reply", "text", "answer", "response", "message", "output", "spokenText", "speechText",
  "displayReply", "publicReply", "visibleReply", "finalReply", "authoritativeReply",
  "directReply", "adminReply", "marionReply", "privateReply"
]);

const BLOCKED_IDENTITY_KEYS =
  /marionAdmin|directMarion|authenticatedOperator|operatorName|operatorPersonalization|allowPersonalName|privateAdmin|adminConversationAllowed|marionAdminConversationAllowed|publicUsersCanAddressMarion|publicUsersMayAddressMarion/i;

const PUBLIC_PRESENCE_PROMPT_RE =
  /^(?:hi\s+nyx\s*)?(?:are\s+you\s+(?:with\s+me|there|here|online|working|ready)|can\s+you\s+(?:hear\s+me|see\s+this|respond)|do\s+you\s+hear\s+me|you\s+there|still\s+there|hello\??|hi\??|hey\??)\??$/i;

const PUBLIC_WHO_PROMPT_RE =
  /\b(?:who\s+am\s+i\s+talking\s+to|who\s+are\s+you|what\s+are\s+you|what\s+is\s+your\s+name|is\s+marion\s+connected|am\s+i\s+talking\s+to\s+marion|are\s+you\s+marion|is\s+this\s+marion)\b/i;

/*
 * Keep leak detection specific to internal contracts. Earlier revisions blocked
 * ordinary words such as "runtime", "fallback", and "loop", which could destroy
 * legitimate AI/cyber/programming answers. The lock now blocks internal phrases
 * and schema markers rather than normal technical vocabulary.
 */
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
  "\\bstate\\s+spine\\b",
  "\\bsession\\s+patch\\b",
  "\\breply\\s+authority\\b",
  "\\bdiagnostic(?:s| packet)?\\s*[:=]",
  "\\bfinal\\s+envelope\\b",
  "\\brouteKind\\s*[:=]",
  "\\bspeechHints\\s*[:=]",
  "\\bpresenceProfile\\s*[:=]",
  "\\bmarionFinal\\s*[:=]",
  "\\btransportSafe\\s*[:=]",
  "\\bnyxStateHint\\s*[:=]",
  "\\brecovery\\s+path\\b",
  "\\bmeta[-\\s]?recovery\\b",
  "\\bvalidation\\s+harness\\b",
  "\\bregression\\s+harness\\b",
  "\\bsmoke\\s+test\\b",
  "\\bnode\\s+--check\\b",
  "\\bpassed\\s+or\\s+failed\\b",
  "\\bmark\\s+(?:as\\s+)?(?:passed|failed)\\b",
  "\\bMARION::FINAL::",
  "\\bCHATENGINE_COORDINATOR_ONLY_ACTIVE_\\d+\\b"
].join("|"), "i");

const GENERIC_NYX_IDENTITY_REPLY_RE =
  /^(?:hi[,. ]+|hello[,. ]+|hey[,. ]+)?i['’]?m nyx\b.{0,160}\bpublic sandblast (?:assistant|guide)\b/i;

function isObj(v){ return !!v && typeof v === "object" && !Array.isArray(v); }
function safeObj(v){ return isObj(v) ? v : {}; }
function safeStr(v){ return v == null ? "" : String(v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim(); }
function lower(v){ return safeStr(v).toLowerCase(); }
function headerValue(headers,name){
  const h=safeObj(headers);
  return safeStr(h[name] || h[name.toLowerCase()] || h[name.toUpperCase()] || "");
}

function isPrivateOperatorContext(input={}){
  try {
    return !!(privateLock && privateLock.isVerifiedOperatorContext &&
      privateLock.isVerifiedOperatorContext(input));
  } catch (_) {
    return false;
  }
}

function isPublicSurfaceContext(input={}){
  const src=safeObj(input);
  const body=safeObj(src.body);
  const headers=safeObj(src.headers||body.headers);
  const ui=safeObj(src.ui||body.ui);
  const client=safeObj(src.client||body.client);
  const payload=safeObj(src.payload||body.payload);
  const req=safeObj(src.req||src.request);

  if (
    isPrivateOperatorContext(src) ||
    isPrivateOperatorContext(body) ||
    isPrivateOperatorContext({body,headers,req,payload})
  ) return false;

  const source=lower(src.source||body.source||payload.source||headerValue(headers,"x-sb-source"));
  const audience=lower(src.audience||body.audience||payload.audience||ui.audience||headerValue(headers,"x-sb-audience"));
  const surface=lower(src.surfaceAgent||body.surfaceAgent||payload.surfaceAgent||ui.surfaceAgent||headerValue(headers,"x-sb-public-surface"));
  const site=lower(client.site||safeObj(payload.client).site||"");

  return src.publicSurfaceOnly===true ||
    body.publicSurfaceOnly===true ||
    payload.publicSurfaceOnly===true ||
    ui.publicSurfaceOnly===true ||
    src.publicIdentityLock===true ||
    body.publicIdentityLock===true ||
    payload.publicIdentityLock===true ||
    audience==="public" ||
    surface==="nyx" ||
    source.indexOf("sandblast_channel_widget")!==-1 ||
    source.indexOf("nyx-widget")!==-1 ||
    site.indexOf("sandblast.channel")!==-1 ||
    !!headerValue(headers,"x-nyx-client-version");
}

function cleanPublicPresenceReply(){
  return "I’m here. You can ask about Sandblast, radio, TV, media, AI, or business tools.";
}
function cleanPublicWhoReply(){
  return "You’re speaking with Nyx, the Sandblast guide for media, radio, TV, discovery, and business tools.";
}
function isInternalPublicLeak(value=""){
  return INTERNAL_PUBLIC_LEAK_RE.test(safeStr(value));
}
function isGenericNyxIdentityReply(value=""){
  return GENERIC_NYX_IDENTITY_REPLY_RE.test(safeStr(value));
}

function extractPrompt(context={}){
  const src=safeObj(context);
  const body=safeObj(src.body);
  const payload=safeObj(src.payload||body.payload);
  const turn=safeObj(src.turn||body.turn||payload.turn);
  return safeStr(
    src.rawUserText||src.userText||src.prompt||src.message||src.text||src.query||
    body.rawUserText||body.userText||body.prompt||body.message||body.text||body.query||
    payload.rawUserText||payload.userText||payload.prompt||payload.message||payload.text||payload.query||
    turn.rawUserText||turn.userText||turn.prompt||turn.message||turn.text||""
  );
}

function isPublicPresencePrompt(value=""){
  return PUBLIC_PRESENCE_PROMPT_RE.test(safeStr(value));
}
function isPublicWhoPrompt(value=""){
  return PUBLIC_WHO_PROMPT_RE.test(safeStr(value));
}

function isTrustedMarionFinal(value={}){
  const src=safeObj(value);
  const payload=safeObj(src.payload);
  const finalEnvelope=safeObj(src.finalEnvelope);
  const result=safeObj(src.result);
  const resultEnvelope=safeObj(result.finalEnvelope);
  const meta=safeObj(src.meta);
  const attestation=safeObj(src.marionAttestation);

  const semantic=lower(
    src.semanticAuthority ||
    meta.semanticAuthority ||
    finalEnvelope.semanticAuthority ||
    result.semanticAuthority ||
    safeObj(result.meta).semanticAuthority
  );

  const finalEvidence =
    src.marionFinal===true ||
    payload.marionFinal===true ||
    finalEnvelope.marionFinal===true ||
    result.marionFinal===true ||
    resultEnvelope.marionFinal===true ||
    attestation.final===true;

  const routeEvidence =
    lower(src.marionRoute)==="marion-primary" ||
    attestation.routed===true ||
    semantic==="marion";

  return !!(finalEvidence && routeEvidence);
}

function sanitizePublicReply(value=""){
  let t=safeStr(value);
  if(!t) return "";
  if(isInternalPublicLeak(t)) return "";

  t=t.replace(/\b(I[’']?m with you|I am with you),?\s*Mac\b/gi,"$1");
  t=t.replace(/^(Hi|Hello|Hey|Good morning|Good afternoon|Good evening),?\s+Mac[.!]?\s*/i,"$1. ");
  t=t.replace(/^Mac[,—-]\s*/i,"");
  t=t.replace(/,\s*Mac(?=[.!?]|$)/gi,"");
  t=t.replace(/\bfor you,\s*Mac\b/gi,"for you");
  t=t.replace(/\byou,\s*Mac\b/gi,"you");

  /* Public identity redaction is phrased narrowly; do not rewrite arbitrary
   * semantic content merely because it contains an ordinary technical word.
   */
  t=t.replace(/\bMarion is connected behind the response path\b/gi,"Nyx is ready");
  t=t.replace(/\bMarion carries the deeper guidance after your first real question\b/gi,"I can help guide your next step");
  t=t.replace(/\bcommunicating with Marion\b/gi,"speaking with Nyx");
  t=t.replace(/\bYou(?: are|'re|’re) speaking with Marion\b/gi,"You’re speaking with Nyx");
  t=t.replace(/\bMarion\b/g,"Nyx");
  t=t.replace(/\boperator\s+personalization\b/gi,"personalization");
  t=t.replace(/\bprivate\s+admin\s+conversation\b/gi,"private support route");
  t=t.replace(/\btesting\s+(?:lane|pass|route)\b/gi,"checking the connection");

  t=t.replace(/\s+/g," ").replace(/\s+([.!?,])/g,"$1").trim();
  if(!t || isInternalPublicLeak(t)) return "";
  return t;
}

function collectReplyCandidates(value={}, authoritativeFirst=false){
  const src=safeObj(value);
  const payload=safeObj(src.payload);
  const finalEnvelope=safeObj(src.finalEnvelope);
  const result=safeObj(src.result);
  const resultPayload=safeObj(result.payload);
  const resultEnvelope=safeObj(result.finalEnvelope);

  const authority=[
    src.authoritativeReply,
    finalEnvelope.authoritativeReply,
    payload.authoritativeReply,
    result.authoritativeReply,
    resultEnvelope.authoritativeReply,
    resultPayload.authoritativeReply
  ];

  const publicAliases=[
    src.publicReply,src.visibleReply,src.displayReply,src.finalReply,src.directReply,src.reply,src.answer,src.text,src.response,src.message,src.output,src.spokenText,src.speechText,
    payload.publicReply,payload.visibleReply,payload.displayReply,payload.finalReply,payload.directReply,payload.reply,payload.answer,payload.text,payload.response,payload.message,payload.output,payload.spokenText,payload.speechText,
    finalEnvelope.publicReply,finalEnvelope.visibleReply,finalEnvelope.displayReply,finalEnvelope.finalReply,finalEnvelope.directReply,finalEnvelope.reply,finalEnvelope.answer,finalEnvelope.text,finalEnvelope.response,finalEnvelope.message,finalEnvelope.output,finalEnvelope.spokenText,
    resultEnvelope.publicReply,resultEnvelope.visibleReply,resultEnvelope.displayReply,resultEnvelope.finalReply,resultEnvelope.directReply,resultEnvelope.reply,resultEnvelope.answer,resultEnvelope.text,
    resultPayload.publicReply,resultPayload.visibleReply,resultPayload.finalReply,resultPayload.reply,resultPayload.answer,resultPayload.text,
    result.publicReply,result.visibleReply,result.finalReply,result.reply,result.answer,result.text
  ];

  return authoritativeFirst ? authority.concat(publicAliases) : publicAliases.concat(authority);
}

function firstUsableReply(value={}, options={}){
  const allowGeneric=options.allowGeneric===true;
  const candidates=collectReplyCandidates(value, options.authoritativeFirst===true);
  for(const candidate of candidates){
    const t=sanitizePublicReply(candidate);
    if(!t) continue;
    if(!allowGeneric && isGenericNyxIdentityReply(t)) continue;
    return t;
  }
  return "";
}

function extractReply(value,depth=0){
  if(depth>6) return "";
  if(typeof value==="string") return value;
  if(!isObj(value)) return "";

  const trusted=isTrustedMarionFinal(value);
  const direct=firstUsableReply(value,{authoritativeFirst:trusted,allowGeneric:true});
  if(direct) return direct;

  for(const k of ["payload","data","result","finalEnvelope","packet","synthesis"]){
    const r=extractReply(value[k],depth+1);
    if(r) return r;
  }
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
    if(/^surfaceAgent$/i.test(key)||/^publicAgent$/i.test(key)||/^userFacingAgent$/i.test(key)||/^displayAuthority$/i.test(key)){
      out[key]=/^surfaceAgent$/i.test(key)?"nyx":"Nyx";
      continue;
    }
    if(BLOCKED_IDENTITY_KEYS.test(key)){ out[key]=false; continue; }

    /* Preserve semantic authority metadata. Public identity and semantic authority
     * are deliberately separate concepts.
     */
    if(/^semanticAuthority$/i.test(key)){
      out[key]=child;
      continue;
    }

    if(REPLY_KEYS.has(key)){
      out[key]=sanitizePublicReply(child);
      continue;
    }

    out[key]=projectPublicReplyFields(child,context,depth+1);
  }

  out.publicSurfaceIdentityLock=true;
  out.publicLoopFallbackSurfacePurge=true;
  out.publicSurfaceOnly=true;
  out.surfaceAgent="nyx";
  out.publicAgent="Nyx";
  out.userFacingAgent="Nyx";
  out.displayAuthority="Nyx";
  out.audience="public";
  out.operatorPersonalization=false;
  out.allowPersonalName=false;
  out.authenticatedOperator=false;
  out.publicUsersCanAddressMarion=false;
  return out;
}

function stampReplyAliases(target,reply,authoritative){
  const out=safeObj(target);
  const keys=["reply","text","answer","response","message","output","spokenText","speechText","displayReply","publicReply","visibleReply","finalReply","directReply"];
  for(const key of keys) out[key]=reply;
  if(authoritative) out.authoritativeReply=reply;
  return out;
}

function projectPublicPayload(payload={},context={}){
  if(isPrivateOperatorContext(context)||isPrivateOperatorContext(payload)) return payload;

  const source=safeObj(payload);
  const prompt=extractPrompt(context)||extractPrompt(source);
  const base=projectPublicReplyFields(source,context);
  const trusted=isTrustedMarionFinal(source)||isTrustedMarionFinal(base);

  let reply="";
  let explicitIdentity=false;

  if(isPublicWhoPrompt(prompt)){
    reply=cleanPublicWhoReply();
    explicitIdentity=true;
  } else if(isPublicPresencePrompt(prompt)){
    reply=cleanPublicPresenceReply();
    explicitIdentity=true;
  } else {
    /* For ordinary questions, verified Marion authority outranks all surface
     * aliases. Generic Nyx identity text is not a valid semantic answer.
     */
    reply=firstUsableReply(base,{
      authoritativeFirst:trusted,
      allowGeneric:false
    });
  }

  const out={...base};
  out.publicAgent="Nyx";
  out.surfaceAgent="nyx";
  out.userFacingAgent="Nyx";
  out.displayAuthority="Nyx";
  out.audience="public";
  out.publicSurfaceOnly=true;
  out.publicSurfaceIdentityLock=true;
  out.publicLoopFallbackSurfacePurge=true;
  out.operatorPersonalization=false;
  out.allowPersonalName=false;
  out.authenticatedOperator=false;
  out.revealBackendAgent=false;

  out.meta={
    ...safeObj(base.meta),
    publicSurfaceIdentityLock:true,
    publicLoopFallbackSurfacePurge:true,
    publicProjection:"Nyx",
    privateOperatorContext:false,
    semanticAuthorityPreserved:trusted,
    finalAuthorityVersion:FINAL_AUTHORITY_VERSION,
    version:VERSION
  };

  out.ui={
    ...safeObj(base.ui),
    renderReady:!!reply,
    connectionState:reply?"ready":"awaiting_answer",
    publicSurfaceOnly:true,
    surfaceAgent:"nyx"
  };

  if(reply){
    const authoritative=trusted&&!explicitIdentity;
    stampReplyAliases(out,reply,authoritative);

    out.payload=stampReplyAliases(
      {
        ...safeObj(base.payload),
        publicAgent:"Nyx",
        surfaceAgent:"nyx",
        audience:"public",
        publicSurfaceOnly:true,
        publicSurfaceIdentityLock:true,
        publicLoopFallbackSurfacePurge:true
      },
      reply,
      authoritative
    );

    out.finalEnvelope=stampReplyAliases(
      {
        ...safeObj(base.finalEnvelope),
        publicAgent:"Nyx",
        surfaceAgent:"nyx",
        audience:"public",
        publicSurfaceOnly:true,
        publicSurfaceIdentityLock:true,
        publicLoopFallbackSurfacePurge:true,
        displayAuthority:"Nyx"
      },
      reply,
      authoritative
    );

    if(trusted&&!explicitIdentity){
      out.ok=source.ok!==false;
      out.handled=true;
      out.final=true;
      out.marionFinal=true;
      out.awaitingMarion=false;
      out.emit=true;
      out.blocked=false;
      out.suppressUserFacingReply=false;

      out.payload.final=true;
      out.payload.marionFinal=true;
      out.payload.handled=true;

      out.finalEnvelope.final=true;
      out.finalEnvelope.marionFinal=true;
      out.finalEnvelope.handled=true;
      out.finalEnvelope.canEmit=true;
      out.finalEnvelope.currentTurnBound=true;
      out.finalEnvelope.semanticAuthority=
        safeStr(safeObj(source.finalEnvelope).semanticAuthority||source.semanticAuthority||"marion")||"marion";
    } else {
      out.ok=source.ok!==false;
      out.handled=true;
      out.final=true;
    }

    return out;
  }

  /*
   * Critical no-fabrication rule:
   * A non-identity public question with no safe semantic reply must not be
   * converted into a generic Nyx presence sentence and marked final.
   */
  const blankKeys=["authoritativeReply","reply","text","answer","response","message","output","spokenText","speechText","displayReply","publicReply","visibleReply","finalReply","directReply"];
  for(const key of blankKeys) out[key]="";

  out.ok=source.ok!==false;
  out.handled=false;
  out.final=false;
  out.marionFinal=false;
  out.awaitingMarion=true;
  out.emit=false;
  out.blocked=true;
  out.suppressUserFacingReply=true;
  out.requiresRetry=true;
  out.failureSignature=source.failureSignature||"PUBLIC_SEMANTIC_REPLY_MISSING";

  out.payload={
    ...safeObj(base.payload),
    reply:"",
    text:"",
    displayReply:"",
    publicReply:"",
    visibleReply:"",
    finalReply:"",
    authoritativeReply:"",
    final:false,
    marionFinal:false,
    handled:false,
    publicAgent:"Nyx",
    surfaceAgent:"nyx",
    audience:"public",
    publicSurfaceOnly:true,
    publicSurfaceIdentityLock:true,
    publicLoopFallbackSurfacePurge:true
  };

  out.finalEnvelope={
    ...safeObj(base.finalEnvelope),
    reply:"",
    text:"",
    displayReply:"",
    publicReply:"",
    visibleReply:"",
    finalReply:"",
    authoritativeReply:"",
    final:false,
    marionFinal:false,
    handled:false,
    canEmit:false,
    publicAgent:"Nyx",
    surfaceAgent:"nyx",
    audience:"public",
    publicSurfaceOnly:true,
    publicSurfaceIdentityLock:true,
    publicLoopFallbackSurfacePurge:true
  };

  return out;
}

module.exports={
  VERSION,
  FINAL_AUTHORITY_VERSION,
  isPublicSurfaceContext,
  isPrivateOperatorContext,
  isInternalPublicLeak,
  isGenericNyxIdentityReply,
  isPublicPresencePrompt,
  isPublicWhoPrompt,
  isTrustedMarionFinal,
  cleanPublicPresenceReply,
  cleanPublicWhoReply,
  sanitizePublicReply,
  extractPrompt,
  extractReply,
  projectPublicReplyFields,
  projectPublicPayload
};

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
