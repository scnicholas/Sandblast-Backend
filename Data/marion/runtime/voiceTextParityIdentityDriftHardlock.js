"use strict";
/**
 * voiceTextParityIdentityDriftHardlock.js
 * Phase 3D — Voice/Text Parity + Public Identity Drift Hardlock.
 *
 * Purpose:
 * - Typed and spoken public identity questions resolve to the same public-safe answer class.
 * - Public microphone turns cannot escalate into Marion/operator context by transcript claim.
 * - Private Marion voice remains available only through verified server/admin context.
 * - Visible reply and spokenText/speechText are sanitized by the same boundary.
 */
const crypto = require("crypto");
let identityRefinement = null;
let privateLock = null;
try { identityRefinement = require("./publicIdentityQuestionRefinement.js"); } catch (_) { identityRefinement = null; }
try { privateLock = require("./privateOperatorBoundaryLock.js"); } catch (_) { privateLock = null; }

const VERSION = "nyx.marion.phase3d.voiceTextParityIdentityDriftHardlock/1.0";
const PUBLIC_AGENT = "Nyx";
const PRIVATE_AGENT = "Marion";
const OPERATOR_NAME = "Mac";
const REPLY_KEYS = ["reply","text","answer","response","message","output","displayReply","publicReply","visibleReply","finalReply","authoritativeReply","spokenText","speechText"];
const SPOKEN_KEYS = new Set(["spokenText","speechText"]);
const PUBLIC_SOURCE_RE = /(?:sandblast_channel_widget|cosmos-widget|nyx-widget|public_interface|webflow|sandblast\.channel)/i;
const ADMIN_ROUTE_RE = /(?:\/api\/marion\/admin\/conversation|\/api\/marion\/admin\/voice|\/marion\/admin\/conversation|\/marion\/admin\/voice)/i;
const ADMIN_SOURCE_RE = /(?:marion_admin_conversation|marion_admin_voice|admin_text|admin_voice|protected admin route|marion-admin-interface)/i;
const VOICE_SOURCE_RE = /^(?:voice|mic|microphone|speech|spoken|audio)$/i;
const PRESENCE_RE = /^(?:hi\s+nyx\s*)?(?:are\s+you\s+(?:with\s+me|there|here|online|working|ready)|can\s+you\s+(?:hear\s+me|see\s+this|respond)|do\s+you\s+hear\s+me|you\s+there|still\s+there|hello\??|hi\??|hey\??)\??$/i;
const IDENTITY_RE = /\b(?:do\s+you\s+know\s+(?:mac|sean|the\s+operator|the\s+owner)|are\s+you\s+talking\s+to\s+(?:mac|sean|the\s+operator|the\s+owner)|who\s+is\s+(?:mac|sean|the\s+operator|the\s+owner)|i\s+am\s+(?:mac|sean|the\s+operator|the\s+owner)|this\s+is\s+(?:mac|sean|the\s+operator|the\s+owner)|operator\s+command|admin\s+command|open\s+operator\s+mode|use\s+private\s+memory|switch\s+to\s+marion|marion\s*,?\s*respond|are\s+you\s+marion|is\s+marion\s+connected|am\s+i\s+talking\s+to\s+marion|who\s+am\s+i\s+talking\s+to|who\s+are\s+you|what\s+are\s+you)\b/i;
const PRIVATE_SPOOF_RE = /\b(?:i\s+am\s+(?:mac|sean|the\s+operator|the\s+owner)|this\s+is\s+(?:mac|sean|the\s+operator|the\s+owner)|operator\s+command|admin\s+command|marion\s*,?\s*respond|switch\s+to\s+marion|use\s+private\s+memory|open\s+operator\s+mode|authenticatedOperator|operatorPersonalization|allowPersonalName|private\s+memory)\b/i;
const INTERNAL_LEAK_RE = /\b(?:state spine|session patch|reply authority|final envelope|runtimeTelemetry|finalRenderTelemetry|diagnostic packet|greeting lane|testing the greeting lane|loop detected|fallback|operator personalization|admin route|private operator|serverSideAdminAuth|trustedServerAuth|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE)\b/i;

function isObj(v){ return !!v && typeof v === "object" && !Array.isArray(v); }
function safeObj(v){ return isObj(v) ? v : {}; }
function cleanText(v){ return v == null ? "" : String(v).replace(/[\u0000-\u001f\u007f]+/g," ").replace(/\s+/g," ").trim(); }
function lower(v){ return cleanText(v).toLowerCase(); }
function headerValue(headers,key){ const h=safeObj(headers); return cleanText(h[key]||h[key.toLowerCase()]||h[key.toUpperCase()]||""); }
function firstText(){ for(let i=0;i<arguments.length;i+=1){ const t=cleanText(arguments[i]); if(t) return t; } return ""; }
function hashText(value){ const t=cleanText(value); return t ? crypto.createHash("sha256").update(t).digest("hex").slice(0,24) : ""; }
function scrubId(value){ return cleanText(value||"anonymous").replace(/[^a-zA-Z0-9_.:-]+/g,"_").slice(0,96) || "anonymous"; }
function clip(value,max){ const t=cleanText(value); const n=Math.max(64,Math.min(Number(max)||1600,4000)); return t.length>n ? t.slice(0,n-1).trim()+"…" : t; }

function collectContext(input){
  const src=safeObj(input), req=safeObj(src.req||src.request), body=safeObj(src.body||req.body), payload=safeObj(src.payload||src.response||src.result||src.packet||src.data), meta=safeObj(src.meta||body.meta||payload.meta), ui=safeObj(src.ui||body.ui||payload.ui), client=safeObj(src.client||body.client||payload.client), headers=safeObj(src.headers||body.headers||req.headers);
  const route=firstText(src.route,body.route,payload.route,req.path,req.originalUrl,req.url,headerValue(headers,"x-sb-route"));
  const source=firstText(src.source,body.source,payload.source,src.inputChannel,body.inputChannel,payload.inputChannel,meta.source,headerValue(headers,"x-sb-source"));
  const audience=firstText(src.audience,body.audience,payload.audience,ui.audience,meta.audience,headerValue(headers,"x-sb-audience"));
  const surfaceAgent=firstText(src.surfaceAgent,body.surfaceAgent,payload.surfaceAgent,ui.surfaceAgent,meta.surfaceAgent,payload.publicAgent,headerValue(headers,"x-sb-public-surface"));
  const inputChannel=firstText(src.inputChannel,body.inputChannel,payload.inputChannel,meta.inputChannel,src.source,body.source,payload.source);
  const site=firstText(client.site,safeObj(body.client).site,safeObj(payload.client).site);
  const sessionId=firstText(src.sessionId,body.sessionId,payload.sessionId,meta.sessionId,headerValue(headers,"x-sb-session-id"),headerValue(headers,"x-nyx-session-id"));
  const prompt=firstText(src.prompt,src.message,src.text,src.query,src.transcript,body.prompt,body.message,body.text,body.query,body.transcript,payload.prompt,payload.message,payload.text,payload.query,payload.transcript,safeObj(src.turn).text,safeObj(body.turn).text,safeObj(payload.turn).text);
  return {src,req,body,payload,meta,ui,client,headers,route,source,audience,surfaceAgent,inputChannel,site,sessionId,prompt};
}
function isVerifiedOperatorContext(input){
  try { if(privateLock && privateLock.isVerifiedOperatorContext && privateLock.isVerifiedOperatorContext(input)) return true; } catch (_) {}
  const c=collectContext(input);
  const serverVerified = c.src.serverSideAdminAuth===true || c.body.serverSideAdminAuth===true || c.payload.serverSideAdminAuth===true || c.src.trustedServerAuth===true || c.body.trustedServerAuth===true || c.payload.trustedServerAuth===true || c.src.adminVerified===true || c.body.adminVerified===true || c.payload.adminVerified===true || c.src.adminVoiceVerified===true || c.body.adminVoiceVerified===true || c.payload.adminVoiceVerified===true || c.src.adminVoiceDeliveryAllowed===true || c.body.adminVoiceDeliveryAllowed===true || c.payload.adminVoiceDeliveryAllowed===true;
  return !!(serverVerified && (ADMIN_ROUTE_RE.test(c.route)||ADMIN_SOURCE_RE.test(c.source)||lower(c.audience)==="operator"||lower(c.surfaceAgent)==="marion"));
}
function isVoiceContext(input){ const c=collectContext(input); return VOICE_SOURCE_RE.test(c.inputChannel)||VOICE_SOURCE_RE.test(c.source)||c.src.voice===true||c.body.voice===true||c.payload.voice===true||!!(c.src.transcript||c.body.transcript||c.payload.transcript); }
function isPublicContext(input){
  const c=collectContext(input); if(isVerifiedOperatorContext(input)) return false;
  return c.src.publicSurfaceOnly===true||c.body.publicSurfaceOnly===true||c.payload.publicSurfaceOnly===true||c.src.publicIdentityLock===true||c.body.publicIdentityLock===true||c.payload.publicIdentityLock===true||lower(c.audience)==="public"||lower(c.surfaceAgent)==="nyx"||PUBLIC_SOURCE_RE.test(c.source)||PUBLIC_SOURCE_RE.test(c.site)||!!headerValue(c.headers,"x-nyx-client-version")||!ADMIN_ROUTE_RE.test(c.route);
}
function answerClassForPrompt(prompt){ const t=cleanText(prompt); if(!t) return "public_general"; if(PRESENCE_RE.test(t)) return "public_presence_check"; if(IDENTITY_RE.test(t)) return "public_identity_sensitive"; return "public_general"; }
function publicReplyForClass(answerClass,prompt){
  if(answerClass==="public_presence_check") return "I’m here. You can ask about Sandblast, radio, TV, media, AI, or business tools.";
  if(identityRefinement && identityRefinement.cleanPublicIdentityReply && answerClass==="public_identity_sensitive"){
    try { const r=identityRefinement.cleanPublicIdentityReply(prompt); if(r) return r; } catch (_) {}
  }
  if(answerClass==="public_identity_sensitive") return "I’m Nyx, the public Sandblast assistant. I don’t confirm private identity on this public surface, but I can help you explore Sandblast, radio, TV, media, AI, or business tools.";
  return "I’m Nyx, the public Sandblast assistant. I can help you explore Sandblast, radio, TV, media, AI, or business tools.";
}
function sanitizePublicText(value,prompt){
  let out=cleanText(value);
  const cls=answerClassForPrompt(prompt || out);
  if(!out || INTERNAL_LEAK_RE.test(out) || PRIVATE_SPOOF_RE.test(out) || /\bMac\b/.test(out) || /\bMarion\b/.test(out)) return publicReplyForClass(cls,prompt||out);
  out=out.replace(/\bMarion\b/g,PUBLIC_AGENT).replace(/\bMac\b/g,"").replace(/\boperator\s+(?:session|memory|context)\b/gi,"public session").replace(/\bprivate\s+(?:operator|admin|memory)\b/gi,"public").replace(/\s+/g," ").trim();
  if(!out) return publicReplyForClass(cls,prompt||out);
  return out;
}
function classifyTurn(input){
  const c=collectContext(input); const prompt=clip(c.prompt,1600); const voice=isVoiceContext(input); const operator=isVerifiedOperatorContext(input); const scope=operator?"operator":"public";
  const answerClass=scope==="operator"?"operator_private":answerClassForPrompt(prompt);
  const privateSpoof=scope==="public" && PRIVATE_SPOOF_RE.test(prompt);
  return {version:VERSION,scope,audience:scope==="operator"?"operator":"public",surfaceAgent:scope==="operator"?PRIVATE_AGENT:PUBLIC_AGENT,inputChannel:voice?"voice":"text",voice,answerClass,prompt,normalizedText:prompt,privateSpoof,publicIdentityQuestion:scope==="public"&&answerClass==="public_identity_sensitive",publicPresenceCheck:scope==="public"&&answerClass==="public_presence_check",partitionKey:`${scope}:${scrubId(c.sessionId)}`,transcriptHash:voice?hashText(prompt):"",allowOperatorMemory:scope==="operator",allowPersonalName:scope==="operator",operatorPersonalization:scope==="operator",publicSurfaceOnly:scope==="public",adminVoiceDeliveryAllowed:scope==="operator",voiceTextParityHardlock:true};
}
function setReplyFields(out,reply){ REPLY_KEYS.forEach(k=>{ if(Object.prototype.hasOwnProperty.call(out,k) || k==="reply" || k==="displayReply" || k==="visibleReply" || SPOKEN_KEYS.has(k)){ out[k]=reply; } }); return out; }
function projectResult(value,context){
  const ctx=Object.assign({},safeObj(context), isObj(value)?{payload:value}:{}); const cls=classifyTurn(ctx); if(!isObj(value)) return value;
  const out=Array.isArray(value)?value.slice():Object.assign({},value);
  if(cls.scope==="public"){
    const reply = cls.answerClass==="public_identity_sensitive"||cls.answerClass==="public_presence_check" ? publicReplyForClass(cls.answerClass,cls.prompt) : sanitizePublicText(firstText(out.reply,out.text,out.answer,out.response,out.message,out.output,out.displayReply,out.visibleReply,out.finalReply,out.spokenText,out.speechText),cls.prompt);
    setReplyFields(out,reply);
    out.publicAgent=PUBLIC_AGENT; out.surfaceAgent=PUBLIC_AGENT; out.audience="public"; out.publicSurfaceOnly=true; out.operatorPersonalization=false; out.allowPersonalName=false; out.allowOperatorMemory=false; out.authenticatedOperator=false; out.adminVoiceDeliveryAllowed=false; out.operatorName=undefined;
  }
  out.meta=Object.assign({},safeObj(out.meta),{phase3dVoiceTextParityHardlock:true,voiceTextParityHardlockVersion:VERSION,inputChannel:cls.inputChannel,answerClass:cls.answerClass,scope:cls.scope,partitionKey:cls.partitionKey,publicIdentityQuestion:cls.publicIdentityQuestion,privateSpoofBlocked:cls.privateSpoof});
  out.voiceTextParity=Object.assign({},safeObj(out.voiceTextParity),{active:true,phase3d:true,source:cls.inputChannel,answerClass:cls.answerClass,scope:cls.scope,driftBlocked:cls.scope==="public",partitionKey:cls.partitionKey});
  out.memoryPartition=cls.partitionKey; out.partitionKey=cls.partitionKey;
  return out;
}
function projectVoiceInputEnvelope(envelope,context){
  if(!isObj(envelope)) return envelope; const cls=classifyTurn(Object.assign({},safeObj(context),envelope)); const out=Object.assign({},envelope);
  out.voiceTextParityHardlock=true; out.voiceTextAnswerClass=cls.answerClass; out.partitionKey=cls.partitionKey; out.memoryPartition=cls.partitionKey; out.scope=cls.scope; out.audience=cls.audience; out.surfaceAgent=cls.surfaceAgent;
  if(cls.scope==="public"){ out.publicSurfaceOnly=true; out.adminVoiceVerified=false; out.adminVoiceDeliveryAllowed=false; out.adminOnlyVoiceDelivery=false; out.allowOperatorMemory=false; out.allowPersonalName=false; out.operatorPersonalization=false; out.authorizationState="public_nyx_voice_only"; out.publicIdentityQuestion=cls.publicIdentityQuestion; out.blockedOperatorClaim=cls.privateSpoof; }
  out.meta=Object.assign({},safeObj(out.meta),{phase3dVoiceTextParityHardlock:true,answerClass:cls.answerClass,partitionKey:cls.partitionKey,noRawAudioStored:true});
  return out;
}
function projectAuthorizationResult(result,context){
  if(!isObj(result)) return result; const cls=classifyTurn(context||result); const out=Object.assign({},result);
  out.voiceTextParityHardlock=true; out.answerClass=cls.answerClass; out.partitionKey=cls.partitionKey; out.memoryPartition=cls.partitionKey;
  if(cls.scope==="public"){
    out.authorized=false; out.adminVoiceAllowed=false; out.marionVoiceAllowed=false; out.adminVoiceDeliveryAllowed=false; out.publicVoiceAllowed=true; out.authorizationState="public_nyx_voice_only"; out.reason=cls.privateSpoof?"PUBLIC_VOICE_OPERATOR_SPOOF_BLOCKED":"PUBLIC_VOICE_NYX_ONLY"; out.allowOperatorMemory=false; out.allowPersonalName=false;
  }
  return out;
}
function projectSpeechSyncEnvelope(envelope,context){
  if(!isObj(envelope)) return envelope; const out=projectResult(envelope,context); out.spokenText=sanitizePublicText(out.spokenText||out.reply||out.displayReply, collectContext(context||envelope).prompt); out.speechText=out.spokenText; out.noRawAudio=true; out.audioStored=false; return out;
}
function compareVoiceTextParity(textInput,voiceInput,context){
  const typed=classifyTurn(Object.assign({},safeObj(context),{text:textInput,inputChannel:"text"}));
  const voice=classifyTurn(Object.assign({},safeObj(context),{transcript:voiceInput,inputChannel:"voice",voice:true}));
  return {version:VERSION,typed,voice,sameAnswerClass:typed.answerClass===voice.answerClass,sameScope:typed.scope===voice.scope,drift:typed.answerClass!==voice.answerClass||typed.scope!==voice.scope,driftBlocked:true};
}
module.exports={VERSION,PUBLIC_AGENT,PRIVATE_AGENT,OPERATOR_NAME,cleanText,collectContext,isVerifiedOperatorContext,isVoiceContext,isPublicContext,answerClassForPrompt,publicReplyForClass,sanitizePublicText,classifyTurn,projectResult,projectVoiceInputEnvelope,projectAuthorizationResult,projectSpeechSyncEnvelope,compareVoiceTextParity};
