"use strict";
/**
 * publicSurfaceIdentityLock.js
 * Phase 1+2 Public Surface Identity Lock.
 *
 * Purpose:
 * - Nyx owns every public Sandblast.channel response.
 * - Marion remains hidden on public surfaces.
 * - Private/operator Marion surfaces are left untouched only when Phase 2 verifies
 *   an authenticated operator/admin context. Body claims alone do not bypass this lock.
 */
const VERSION = "nyx.publicSurfaceIdentityLock/1.1-phase2-strict-private-gate";
let privateLock = null;
try { privateLock = require("./privateOperatorBoundaryLock.js"); } catch (_) { privateLock = null; }
const REPLY_KEYS = new Set(["reply","text","answer","response","message","output","spokenText","speechText","displayReply","publicReply","visibleReply","finalReply","authoritativeReply","adminReply","marionReply","privateReply"]);
const BLOCKED_IDENTITY_KEYS = /marionAdmin|directMarion|authenticatedOperator|operatorName|operatorPersonalization|allowPersonalName|privateAdmin|adminConversationAllowed|marionAdminConversationAllowed|publicUsersCanAddressMarion|publicUsersMayAddressMarion/i;
function isObj(v){return !!v && typeof v === "object" && !Array.isArray(v);}
function safeObj(v){return isObj(v)?v:{};}
function safeStr(v){return v==null?"":String(v).replace(/\s+/g," ").trim();}
function lower(v){return safeStr(v).toLowerCase();}
function headerValue(headers,name){const h=safeObj(headers);return safeStr(h[name]||h[name.toLowerCase()]||h[name.toUpperCase()]||"");}
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
function sanitizePublicReply(value=""){
  let t=safeStr(value);
  if(!t) return "";
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
  return t.replace(/\s+/g," ").replace(/\s+([.!?,])/g,"$1").trim();
}
function extractReply(value,depth=0){
  if(depth>5) return "";
  if(typeof value==="string") return value;
  if(!isObj(value)) return "";
  for(const k of ["publicReply","visibleReply","displayReply","finalReply","reply","answer","text","response","message","output","spokenText","speechText","authoritativeReply"]){const v=value[k]; if(safeStr(v)) return safeStr(v);}
  for(const k of ["payload","data","result","finalEnvelope","packet","synthesis","marionFinal"]){const r=extractReply(value[k],depth+1); if(r) return r;}
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
    if(/^audience$/i.test(key)){out[key]="public";continue;}
    if(/^surfaceAgent$/i.test(key)||/^publicAgent$/i.test(key)||/^userFacingAgent$/i.test(key)){out[key]="Nyx";continue;}
    if(/^authority$/i.test(key)&&safeStr(child)==="Marion"){out[key]="Nyx";continue;}
    if(BLOCKED_IDENTITY_KEYS.test(key)){out[key]=false;continue;}
    if(REPLY_KEYS.has(key)){out[key]=sanitizePublicReply(child);continue;}
    out[key]=projectPublicReplyFields(child,context,depth+1);
  }
  out.publicSurfaceIdentityLock=true;
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
  const base=projectPublicReplyFields(payload,context);
  const reply=sanitizePublicReply(extractReply(base)||"I’m here. You can ask about Sandblast, radio, TV, media, AI, or business tools.");
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
    operatorPersonalization:false,
    allowPersonalName:false,
    authenticatedOperator:false,
    revealBackendAgent:false,
    payload:{reply,text:reply,message:reply,spokenText:reply,publicAgent:"Nyx",surfaceAgent:"nyx",audience:"public",publicSurfaceOnly:true,publicSurfaceIdentityLock:true},
    ui:{renderReady:true,connectionState:"ready",publicSurfaceOnly:true,surfaceAgent:"nyx"},
    meta:{publicSurfaceIdentityLock:true,publicProjection:"Nyx",privateOperatorContext:false,version:VERSION}
  };
}
module.exports={VERSION,isPublicSurfaceContext,isPrivateOperatorContext,sanitizePublicReply,extractReply,projectPublicReplyFields,projectPublicPayload};
