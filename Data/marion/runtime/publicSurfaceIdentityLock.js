"use strict";
/**
 * publicSurfaceIdentityLock.js
 * Phase 1 Public Surface Identity Lock.
 *
 * Purpose:
 * - Nyx owns every public-facing Sandblast.channel response.
 * - Marion may remain the private/backend intelligence path, but her name,
 *   Mac/operator personalization, and admin/private identity markers cannot
 *   leak through the public widget payload.
 * - Private/admin Marion surfaces are left untouched when authenticatedOperator
 *   or admin/private route markers are present.
 */
const VERSION = "nyx.publicSurfaceIdentityLock/1.0";
const REPLY_KEYS = new Set(["reply","text","answer","response","message","output","spokenText","displayReply","publicReply","visibleReply","finalReply","authoritativeReply"]);
const BLOCKED_IDENTITY_KEYS = /marionAdmin|directMarion|authenticatedOperator|operatorName|operatorPersonalization|allowPersonalName|privateAdmin|adminConversationAllowed|marionAdminConversationAllowed|publicUsersCanAddressMarion|publicUsersMayAddressMarion/i;
function isObj(v){return !!v && typeof v === "object" && !Array.isArray(v);}
function safeObj(v){return isObj(v)?v:{};}
function safeStr(v){return v==null?"":String(v).replace(/\s+/g," ").trim();}
function lower(v){return safeStr(v).toLowerCase();}
function headerValue(headers,name){const h=safeObj(headers);return safeStr(h[name]||h[name.toLowerCase()]||h[name.toUpperCase()]||"");}
function isPrivateOperatorContext(input={}){
  const src=safeObj(input), body=safeObj(src.body), ui=safeObj(src.ui||body.ui), meta=safeObj(src.meta||body.meta), client=safeObj(src.client||body.client);
  const scope=lower(src.routeScope||body.routeScope||src.scope||body.scope||meta.routeScope||client.scope||"");
  return src.authenticatedOperator===true||body.authenticatedOperator===true||src.privateAdminConversation===true||body.privateAdminConversation===true||src.operatorPersonalization===true||body.operatorPersonalization===true||ui.privateSurface===true||scope==="admin_private"||scope==="operator";
}
function isPublicSurfaceContext(input={}){
  const src=safeObj(input), body=safeObj(src.body), headers=safeObj(src.headers||body.headers), ui=safeObj(src.ui||body.ui), client=safeObj(src.client||body.client), payload=safeObj(src.payload||body.payload);
  if(isPrivateOperatorContext(src)||isPrivateOperatorContext(body)) return false;
  const source=lower(src.source||body.source||payload.source||headerValue(headers,"x-sb-source"));
  const audience=lower(src.audience||body.audience||payload.audience||ui.audience||headerValue(headers,"x-sb-audience"));
  const surface=lower(src.surfaceAgent||body.surfaceAgent||payload.surfaceAgent||ui.surfaceAgent||headerValue(headers,"x-sb-public-surface"));
  const site=lower(client.site||safeObj(payload.client).site||"");
  return src.publicSurfaceOnly===true||body.publicSurfaceOnly===true||payload.publicSurfaceOnly===true||ui.publicSurfaceOnly===true||src.publicIdentityLock===true||body.publicIdentityLock===true||audience==="public"||surface==="nyx"||source.indexOf("sandblast_channel_widget")!==-1||site.indexOf("sandblast.channel")!==-1||!!headerValue(headers,"x-nyx-client-version");
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
  t=t.replace(/\bYou(?: are|'re) speaking with Marion\b/gi,"You’re speaking with Nyx");
  t=t.replace(/\bMarion\b/g,"Nyx");
  t=t.replace(/\boperator\s+personalization\b/gi,"personalization");
  return t.replace(/\s+/g," ").replace(/\s+([.!?,])/g,"$1").trim();
}
function extractReply(value,depth=0){
  if(depth>5) return "";
  if(typeof value==="string") return value;
  if(!isObj(value)) return "";
  for(const k of ["publicReply","visibleReply","displayReply","finalReply","reply","answer","text","response","message","output","spokenText","authoritativeReply"]){const v=value[k]; if(safeStr(v)) return safeStr(v);}
  for(const k of ["payload","data","result","finalEnvelope","packet","synthesis"]){const r=extractReply(value[k],depth+1); if(r) return r;}
  return "";
}
function projectPublicReplyFields(value,context={},depth=0){
  if(depth>8) return value;
  if(typeof value==="string") return sanitizePublicReply(value);
  if(Array.isArray(value)) return value.map(v=>projectPublicReplyFields(v,context,depth+1));
  if(!isObj(value)) return value;
  const out={};
  for(const [key,child] of Object.entries(value)){
    if(/^operatorName$/i.test(key)) continue;
    if(/^audience$/i.test(key)){out[key]="public";continue;}
    if(/^surfaceAgent$/i.test(key)||/^publicAgent$/i.test(key)){out[key]="Nyx";continue;}
    if(/^authority$/i.test(key)&&safeStr(child)==="Marion"){out[key]="Nyx";continue;}
    if(BLOCKED_IDENTITY_KEYS.test(key)){out[key]=false;continue;}
    if(REPLY_KEYS.has(key)){out[key]=sanitizePublicReply(child);continue;}
    out[key]=projectPublicReplyFields(child,context,depth+1);
  }
  out.publicSurfaceIdentityLock=true;
  out.publicSurfaceOnly=true;
  out.surfaceAgent=out.surfaceAgent||"nyx";
  out.publicAgent=out.publicAgent||"Nyx";
  out.audience=out.audience||"public";
  out.operatorPersonalization=false;
  out.allowPersonalName=false;
  out.publicUsersCanAddressMarion=false;
  return out;
}
function projectPublicPayload(payload={},context={}){
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
    audience:"public",
    publicSurfaceOnly:true,
    publicSurfaceIdentityLock:true,
    operatorPersonalization:false,
    allowPersonalName:false,
    revealBackendAgent:false,
    payload:{reply,text:reply,message:reply,spokenText:reply,publicAgent:"Nyx",surfaceAgent:"nyx",audience:"public",publicSurfaceOnly:true,publicSurfaceIdentityLock:true},
    ui:{renderReady:true,connectionState:"ready",publicSurfaceOnly:true,surfaceAgent:"nyx"},
    meta:{publicSurfaceIdentityLock:true,publicProjection:"Nyx",privateOperatorContext:false}
  };
}
module.exports={VERSION,isPublicSurfaceContext,isPrivateOperatorContext,sanitizePublicReply,extractReply,projectPublicReplyFields,projectPublicPayload};
