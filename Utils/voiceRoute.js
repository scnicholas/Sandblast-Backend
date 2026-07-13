"use strict";

/**
 * Routes/voiceRoute.js
 *
 * voiceRoute v1.4.0 NYX-VOICE-REINTEGRATION-R1
 * ------------------------------------------------------------
 * PURPOSE
 * - Resolve TTS delegate compatibility across service and Express handler exports
 * - Preserve audio-first behavior while supporting explicit JSON/base64 clients
 * - Normalize Buffer, URL, base64, nested audio, and Response-like provider shapes
 * - Keep TTS failure handling loop-safe without suppressing the textual Nyx reply
 * - Expose health/status helpers without leaking credentials or voice identifiers
 */

let ttsMod = null;
let ttsLoadError = "";
try { ttsMod = require("./tts"); } catch (err) { ttsLoadError = safeStr(err && (err.message || err)); }
let chatEngine = null;
try { chatEngine = require("./chatEngine"); } catch (_e) { chatEngine = null; }

const VOICE_ROUTE_VERSION = "voiceRoute v1.5.0 LIVE-CERTIFICATION-CORS + AUDIO-CONTENT";
const MAX_RETRY_ATTEMPTS = Math.max(0, Number(process.env.SB_VOICE_ROUTE_MAX_RETRY || 1));
const DEFAULT_PROVIDER = safeStr(process.env.SB_TTS_PROVIDER || "resemble") || "resemble";
const DEFAULT_VOICE_UUID = safeStr(process.env.RESEMBLE_VOICE_UUID || process.env.RESEMBLE_VOICE_ID || process.env.SB_RESEMBLE_VOICE_UUID || process.env.SB_RESEMBLE_VOICE_ID || process.env.SB_TTS_VOICE_UUID || "");

function safeStr(x) { return x === null || x === undefined ? "" : String(x); }
function clampInt(v, def, min, max) { const n=Number(v); if(!Number.isFinite(n))return def; const t=Math.trunc(n); return Math.max(min,Math.min(max,t)); }
function boolish(v,dflt=false){ if(v===true||v===false)return v; const s=safeStr(v).trim().toLowerCase(); if(!s)return dflt; if(["1","true","yes","on"].includes(s))return true; if(["0","false","no","off"].includes(s))return false; return dflt; }
function pickFirst(){ for(let i=0;i<arguments.length;i+=1){const v=arguments[i]; if(v!==undefined&&v!==null&&String(v)!=="")return v;} return ""; }
function setHeaderSafe(res,key,value){ try{if(res&&!res.headersSent)res.setHeader(key,value);}catch(_e){} }
function wantsJson(req){ const q=req&&req.query&&typeof req.query==="object"?req.query:{}; const b=req&&req.body&&typeof req.body==="object"?req.body:{}; return boolish(pickFirst(q.returnJson,b.returnJson,q.json,b.json),false); }
function clientWantsJson(req){
  if(wantsJson(req))return true;
  const headers=req&&req.headers&&typeof req.headers==="object"?req.headers:{};
  const accept=safeStr(headers.accept||"").toLowerCase();
  const mode=safeStr(headers["x-sb-response-mode"]||headers["x-response-mode"]||headers["x-tts-mode"]||"").toLowerCase();
  if(["audio","binary","stream","audio-first"].includes(mode))return false;
  if(["json","json-audio","audio-json","base64-audio"].includes(mode))return true;
  if(!accept||accept.includes("audio/")||accept.includes("application/octet-stream")||accept.includes("*/*"))return false;
  return accept.includes("application/json")||accept.includes("text/json");
}
function extractAudioUrl(result){ return safeStr(pickFirst(result&&result.audioUrl,result&&result.url,result&&result.audio_url,result&&result.publicUrl,result&&result.signedUrl,result&&result.streamUrl,result&&result.audio&&result.audio.url,result&&result.audio&&result.audio.audioUrl,result&&result.payload&&result.payload.audioUrl,result&&result.payload&&result.payload.url)); }
function extractMime(result){ return safeStr(pickFirst(result&&result.mime,result&&result.mimeType,result&&result.contentType,result&&result.headers&&result.headers["content-type"],result&&result.audio&&result.audio.mime,result&&result.audio&&result.audio.mimeType,"audio/mpeg"))||"audio/mpeg"; }
function extractFormat(result,mime){ const f=safeStr(pickFirst(result&&result.format,result&&result.audio&&result.audio.format)).toLowerCase(); if(f)return f; const m=safeStr(mime).toLowerCase(); if(m.includes("wav"))return"wav"; if(m.includes("ogg"))return"ogg"; if(m.includes("webm"))return"webm"; return"mp3"; }
function extractAudioBuffer(result){
  const candidates=[result&&result.buffer,result&&result.audioBuffer,result&&result.binary,result&&result.body,result&&result.data,result&&result.audio_content,result&&result.audio,result&&result.payload&&result.payload.buffer,result&&result.payload&&result.payload.audioBuffer,result&&result.payload&&result.payload.binary,result&&result.payload&&result.payload.audio_content,result&&result.payload&&result.payload.audio];
  for(const c of candidates){ if(Buffer.isBuffer(c))return c; if(c instanceof Uint8Array)return Buffer.from(c); if(typeof c==="string"&&c.length>32&&/^[A-Za-z0-9+/=\s]+$/.test(c)){try{const b=Buffer.from(c.replace(/\s+/g,""),"base64");if(b.length)return b;}catch(_e){}} if(c&&c.type==="Buffer"&&Array.isArray(c.data)){try{return Buffer.from(c.data);}catch(_e){}} }
  return null;
}
function extractAudioBase64(result){ const direct=pickFirst(result&&result.audioBase64,result&&result.base64,result&&result.audio_content,result&&result.audio&&result.audio.base64,result&&result.audio&&result.audio.audioBase64,result&&result.audio&&result.audio.audio_content,result&&result.payload&&result.payload.audioBase64,result&&result.payload&&result.payload.base64,result&&result.payload&&result.payload.audio_content); if(typeof direct==="string"&&direct.trim())return direct.trim().replace(/^data:audio\/[^;]+;base64,/i,"").replace(/\s+/g,""); const b=extractAudioBuffer(result); return b&&b.length?b.toString("base64"):""; }
function normalizeInput(req){
  const body=req&&req.body&&typeof req.body==="object"?req.body:{}; const query=req&&req.query&&typeof req.query==="object"?req.query:{}; const headers=req&&req.headers&&typeof req.headers==="object"?req.headers:{};
  return {
    text:safeStr(pickFirst(body.text,body.spokenText,body.textSpeak,body.message,body.prompt,query.text,query.spokenText,query.message,query.prompt)).trim(),
    textDisplay:safeStr(pickFirst(body.textDisplay,body.displayText,query.textDisplay,query.displayText)).trim(),
    requestId:safeStr(pickFirst(body.requestId,query.requestId,headers["x-sb-request-id"])).slice(0,80),
    turnId:safeStr(pickFirst(body.turnId,query.turnId,headers["x-sb-turn-id"])).slice(0,80),
    sessionId:safeStr(pickFirst(body.sessionId,body.sid,query.sessionId,query.sid,headers["x-sb-session-id"])).slice(0,120),
    provider:safeStr(pickFirst(body.provider,query.provider,DEFAULT_PROVIDER))||DEFAULT_PROVIDER,
    routeKind:safeStr(pickFirst(body.routeKind,query.routeKind,body.mode,query.mode,"main"))||"main",
    voiceUuid:safeStr(pickFirst(body.voiceUuid,body.voice_uuid,query.voiceUuid,query.voice_uuid,headers["x-sb-voice"],DEFAULT_VOICE_UUID)),
    title:safeStr(pickFirst(body.title,query.title,"voice_route")),
    wantJson:clientWantsJson(req)
  };
}
function buildPlayableAudioEnvelope(input,result){
  const mimeType=extractMime(result),format=extractFormat(result,mimeType),audioUrl=extractAudioUrl(result),audioBase64=extractAudioBase64(result),audioBuffer=extractAudioBuffer(result);
  const text=safeStr(pickFirst(result&&result.text,result&&result.textSpeak,result&&result.spokenText,input.textDisplay,input.text));
  const playable=!!(audioUrl||audioBase64||(audioBuffer&&audioBuffer.length));
  return {ok:!!(result&&result.ok),version:VOICE_ROUTE_VERSION,requestId:safeStr(pickFirst(result&&result.requestId,input.requestId)),turnId:safeStr(pickFirst(result&&result.turnId,input.turnId)),sessionId:safeStr(pickFirst(result&&result.sessionId,input.sessionId)),provider:safeStr(pickFirst(result&&result.provider,input.provider,DEFAULT_PROVIDER))||DEFAULT_PROVIDER,providerStatus:clampInt(pickFirst(result&&result.providerStatus,result&&result.status,200),200,0,999999),routeKind:safeStr(pickFirst(result&&result.routeKind,input.routeKind,"main"))||"main",mimeType,mime:mimeType,format,text,textSpeak:text,spokenText:text,audioUrl,url:audioUrl,audioBase64,byteLength:audioBuffer&&audioBuffer.length?audioBuffer.length:0,chars:clampInt(text.length,0,0,999999),playable,autoPlay:true,audio:{url:audioUrl,audioUrl,audioBase64,byteLength:audioBuffer&&audioBuffer.length?audioBuffer.length:0,mimeType,mime:mimeType,format,playable,autoPlay:true,chars:clampInt(text.length,0,0,999999)},playback:{ready:playable,autoPlay:true,route:"/api/tts",compatibilityRoute:"/tts",mimeType,format},speechLifecycle:{prestart:"nyx:voice:prestart",start:"nyx:voice:start",amplitude:"nyx:voice:amplitude",end:"nyx:voice:end",error:"nyx:voice:error"}};
}
function normalizeDelegateResult(value,input){
  if(Buffer.isBuffer(value)||value instanceof Uint8Array)return {ok:true,buffer:Buffer.from(value),provider:input.provider,text:input.text,requestId:input.requestId,turnId:input.turnId,sessionId:input.sessionId};
  if(typeof value==="string"){
    if(/^https?:\/\//i.test(value.trim()))return {ok:true,audioUrl:value.trim(),provider:input.provider,text:input.text};
    const compact=value.trim().replace(/^data:audio\/[^;]+;base64,/i,"").replace(/\s+/g,"");
    if(compact&&/^[A-Za-z0-9+/]+=*$/.test(compact)&&compact.length>32)return {ok:true,audioBase64:compact,provider:input.provider,text:input.text};
  }
  if(value&&typeof value==="object"){
    const out={...value};
    if(out.ok===undefined)out.ok=!!(extractAudioBuffer(out)||extractAudioUrl(out)||extractAudioBase64(out));
    return out;
  }
  return {ok:false,retryable:false,reason:"tts_delegate_empty_result",message:"TTS delegate returned no result.",providerStatus:502};
}
function createCaptureResponse(){
  let statusCode=200,body=null; const headers={}; let settled=false; let resolveDone;
  const done=new Promise(r=>{resolveDone=r;});
  const finish=(value)=>{if(!settled){settled=true;body=value;resolveDone({statusCode,headers,body});} return api;};
  const api={headersSent:false,status(code){statusCode=clampInt(code,200,100,999);return api;},setHeader(k,v){headers[String(k).toLowerCase()]=v;return api;},getHeader(k){return headers[String(k).toLowerCase()];},json(value){api.headersSent=true;return finish(value);},send(value){api.headersSent=true;return finish(value);},end(value){api.headersSent=true;return finish(value);},write(value){body=body?Buffer.concat([Buffer.from(body),Buffer.from(value)]):Buffer.from(value);return true;},_done:done,_snapshot(){return{statusCode,headers,body};}};
  return api;
}
function routeWrapper(fn){
  return async function(payload,originalReq){
    const req={...(originalReq||{}),body:payload,query:(originalReq&&originalReq.query)||{},headers:(originalReq&&originalReq.headers)||{}};
    const res=createCaptureResponse();
    let returned;
    try{returned=await Promise.resolve(fn(req,res,()=>{}));}catch(err){throw err;}
    if(returned!==undefined&&returned!==res)return returned;
    const snap=res._snapshot();
    if(res.headersSent)return {...(snap.body&&typeof snap.body==="object"&&!Buffer.isBuffer(snap.body)?snap.body:{}),ok:snap.statusCode>=200&&snap.statusCode<300,status:snap.statusCode,providerStatus:snap.statusCode,headers:snap.headers,...(Buffer.isBuffer(snap.body)?{buffer:snap.body}:{})};
    return {ok:false,retryable:false,reason:"tts_handler_no_response",message:"TTS handler completed without a response.",providerStatus:502};
  };
}
function resolveTtsDelegate(mod){
  if(!mod)return null;
  const direct=["delegateTts","synthesize","generateSpeech","generate","speak","run","tts"];
  for(const name of direct)if(typeof mod[name]==="function")return mod[name].bind(mod);
  const routeNames=["handleTts","ttsHandler","handle","handler"];
  for(const name of routeNames)if(typeof mod[name]==="function")return routeWrapper(mod[name].bind(mod));
  if(typeof mod.default==="function")return process.env.SB_TTS_DELEGATE_MODE==="express"?routeWrapper(mod.default.bind(mod)):mod.default.bind(mod);
  if(typeof mod==="function")return process.env.SB_TTS_DELEGATE_MODE==="express"?routeWrapper(mod):mod;
  return null;
}
function resolveTtsHealth(mod){if(!mod)return null; if(typeof mod.health==="function")return mod.health.bind(mod); if(typeof mod.getHealth==="function")return mod.getHealth.bind(mod); if(typeof mod.status==="function")return mod.status.bind(mod); return null;}
const delegateTts=resolveTtsDelegate(ttsMod),ttsHealth=resolveTtsHealth(ttsMod);
function classifyFailure(result,attempt){const status=clampInt(result&&(result.providerStatus||result.status),0,0,999999),retryable=!!(result&&result.retryable),reason=safeStr(result&&(result.reason||"tts_unavailable")).toLowerCase(); if(["missing_text","missing_voice","private_network_url_blocked"].includes(reason))return{action:"stop",terminal:true,retryable:false,reason}; if(retryable&&attempt<MAX_RETRY_ATTEMPTS&&(status===429||status===503||status===504||/timeout|network|circuit|concurrency/.test(reason)))return{action:"retry",terminal:false,retryable:true,reason}; if(retryable&&(status>=500||status===429||/timeout|network|circuit|concurrency/.test(reason)))return{action:"downgrade",terminal:false,retryable:true,reason}; if(!retryable&&status>=400&&status<500)return{action:"stop",terminal:true,retryable:false,reason}; return{action:"downgrade",terminal:false,retryable,reason};}
function buildFailureEnvelope(input,result,decision){return{ok:false,version:VOICE_ROUTE_VERSION,provider:safeStr((result&&result.provider)||input.provider||DEFAULT_PROVIDER),action:safeStr((decision&&decision.action)||"downgrade"),terminal:!!(decision&&decision.terminal),retryable:!!(decision&&decision.retryable),reason:safeStr((decision&&decision.reason)||(result&&result.reason)||"tts_unavailable"),message:safeStr((result&&result.message)||"TTS unavailable."),providerStatus:clampInt(result&&(result.providerStatus||result.status),0,0,999999),requestId:safeStr((result&&result.requestId)||input.requestId||""),turnId:safeStr((result&&result.turnId)||input.turnId||""),sessionId:safeStr((result&&result.sessionId)||input.sessionId||""),traceId:safeStr((result&&result.traceId)||""),text:safeStr((result&&result.text)||input.textDisplay||input.text||""),ttsFailure:{ok:false,action:safeStr((decision&&decision.action)||"downgrade"),shouldTerminate:!!(decision&&decision.terminal),audioOnly:true,preserveTextReply:true,retryable:!!(decision&&decision.retryable),reason:safeStr((decision&&decision.reason)||(result&&result.reason)||"tts_unavailable"),message:safeStr((result&&result.message)||"TTS unavailable."),providerStatus:clampInt(result&&(result.providerStatus||result.status),0,0,999999)}};}
async function maybeBuildDowngradedText(input,envelope){
  if(!chatEngine||typeof chatEngine.handleChat!=="function"||!input.text)return{ok:true,degraded:true,reply:envelope.text||input.text||"Audio is unavailable right now.",payload:{reply:envelope.text||input.text||"Audio is unavailable right now."},directives:[{type:"tts_failure",...envelope.ttsFailure}]};
  // Do not feed a raw TTS request back through the coordinator as a new user turn.
  // Preserve the already-rendered textual reply and expose only an audio failure directive.
  return{ok:true,degraded:true,reply:envelope.text||input.text||"Audio is unavailable right now.",payload:{reply:envelope.text||input.text||"Audio is unavailable right now."},directives:[{type:"tts_failure",...envelope.ttsFailure}]};
}
async function callDelegate(req,input,attempt){
  const body=req&&req.body&&typeof req.body==="object"?req.body:{};
  const payload={...body,text:input.text,textDisplay:input.textDisplay||input.text,requestId:input.requestId,turnId:input.turnId,sessionId:input.sessionId,provider:input.provider,routeKind:input.routeKind,title:input.title,__voiceRouteAttempt:attempt};
  if(input.voiceUuid){payload.voiceUuid=input.voiceUuid;payload.voice_uuid=input.voiceUuid;}
  if(!input.text)return{ok:false,retryable:false,reason:"missing_text",message:"Text is required for speech synthesis.",providerStatus:400,requestId:input.requestId,turnId:input.turnId,sessionId:input.sessionId};
  if(!delegateTts)return{ok:false,retryable:false,reason:"tts_delegate_unavailable",message:ttsLoadError||"Resolved TTS delegate is unavailable",providerStatus:503,requestId:input.requestId,turnId:input.turnId,sessionId:input.sessionId};
  try{return normalizeDelegateResult(await Promise.resolve(delegateTts(payload,req)),input);}catch(err){const message=safeStr(err&&(err.message||err)||"tts_delegate_failed");return{ok:false,retryable:/timeout|network|fetch|socket|429|503|504/i.test(message),reason:/timeout/i.test(message)?"tts_timeout":"tts_delegate_exception",message,providerStatus:/429/.test(message)?429:/503/.test(message)?503:/504/.test(message)?504:502,requestId:input.requestId,turnId:input.turnId,sessionId:input.sessionId};}
}
async function health(){try{const info=ttsHealth?await Promise.resolve(ttsHealth()):null;return{ok:!!delegateTts,enabled:!!delegateTts,version:VOICE_ROUTE_VERSION,ttsModuleLoaded:!!ttsMod,ttsDelegateBound:!!delegateTts,ttsHealthBound:!!ttsHealth,voiceConfigured:!!DEFAULT_VOICE_UUID,provider:DEFAULT_PROVIDER,loadError:ttsLoadError||undefined,tts:info&&typeof info==="object"?info:null};}catch(err){return{ok:false,enabled:!!delegateTts,version:VOICE_ROUTE_VERSION,ttsModuleLoaded:!!ttsMod,ttsDelegateBound:!!delegateTts,ttsHealthBound:!!ttsHealth,voiceConfigured:!!DEFAULT_VOICE_UUID,provider:DEFAULT_PROVIDER,error:safeStr(err&&(err.message||err)||"tts_health_failed")};}}
async function voiceRoute(req,res){
  const origin=safeStr(req&&req.headers&&req.headers.origin),allowed=safeStr(process.env.SB_TTS_ALLOWED_ORIGINS||"https://sandblast.channel,https://www.sandblast.channel").split(",").map(x=>x.trim());if(origin&&(allowed.includes(origin)||allowed.includes("*")))setHeaderSafe(res,"Access-Control-Allow-Origin",allowed.includes("*")?"*":origin);setHeaderSafe(res,"Access-Control-Allow-Methods","POST,GET,OPTIONS");setHeaderSafe(res,"Access-Control-Allow-Headers","Content-Type,Accept,X-SB-Response-Mode,X-SB-State-Contract,X-SB-Surface-Profile,X-SB-Widget-Token,X-SB-Session-ID,X-SB-Turn-ID,X-SB-Trace-ID,X-SB-Request-ID,X-SB-Voice");if(req&&safeStr(req.method).toUpperCase()==="OPTIONS")return res.status(204).end();
  const input=normalizeInput(req); setHeaderSafe(res,"X-SB-Voice-Route-Version",VOICE_ROUTE_VERSION); setHeaderSafe(res,"Cache-Control","no-store, no-cache, must-revalidate, max-age=0"); setHeaderSafe(res,"Vary","Origin, Accept"); setHeaderSafe(res,"X-SB-Audio-Contract","audio-first-v3");
  let attempt=0,result=null,decision=null;
  while(attempt<=MAX_RETRY_ATTEMPTS){result=await callDelegate(req,input,attempt); if(result&&result.ok)break; decision=classifyFailure(result||{},attempt); if(decision.action!=="retry")break; attempt+=1;}
  if(result&&result.ok){
    const playable=buildPlayableAudioEnvelope(input,result); const audioBuffer=extractAudioBuffer(result)||(playable.audioBase64?Buffer.from(playable.audioBase64,"base64"):null);
    setHeaderSafe(res,"X-SB-TTS-Action",playable.playable?"success":"empty-audio"); setHeaderSafe(res,"X-SB-TTS-Provider",safeStr(playable.provider||DEFAULT_PROVIDER)); setHeaderSafe(res,"X-SB-TTS-Upstream-Status",String(clampInt(playable.providerStatus||200,200,0,999999))); setHeaderSafe(res,"X-SB-TTS-Playable",playable.playable?"1":"0");
    if(!playable.playable){result={...result,ok:false,retryable:true,reason:"tts_empty_audio",message:"TTS reported success without a playable audio payload.",providerStatus:502};decision=classifyFailure(result,attempt);}
    else if(input.wantJson){setHeaderSafe(res,"X-SB-Response-Mode","json-audio");return res.status(200).json(playable);}
    else if(audioBuffer&&audioBuffer.length){setHeaderSafe(res,"X-SB-Response-Mode","audio");setHeaderSafe(res,"Content-Type",safeStr(playable.mimeType||"audio/mpeg"));setHeaderSafe(res,"Content-Length",String(audioBuffer.length));setHeaderSafe(res,"Accept-Ranges","none");return res.status(200).send(audioBuffer);}
    else{setHeaderSafe(res,"X-SB-Response-Mode","json-url");return res.status(200).json(playable);}
  }
  decision=decision||classifyFailure(result||{},attempt); const envelope=buildFailureEnvelope(input,result||{},decision); setHeaderSafe(res,"X-SB-TTS-Action",safeStr(envelope.action)); setHeaderSafe(res,"X-SB-TTS-Reason",safeStr(envelope.reason)); setHeaderSafe(res,"X-SB-TTS-Upstream-Status",String(clampInt(envelope.providerStatus,0,0,999999)));
  if(envelope.action==="stop"){const status=envelope.providerStatus===0?409:Math.max(400,Math.min(503,envelope.providerStatus));return res.status(status).json(envelope);}
  const downgraded=await maybeBuildDowngradedText(input,envelope); return res.status(200).json({ok:true,degraded:true,version:VOICE_ROUTE_VERSION,action:envelope.action,terminal:false,ttsFailure:envelope.ttsFailure,reply:safeStr((downgraded||{}).reply||envelope.text||input.text||"Audio unavailable."),payload:(downgraded||{}).payload||{reply:safeStr((downgraded||{}).reply||envelope.text||input.text||"Audio unavailable.")},directives:(downgraded||{}).directives||[Object.assign({type:"tts_failure"},envelope.ttsFailure)],audio:{url:"",audioUrl:"",audioBase64:"",mimeType:"audio/mpeg",mime:"audio/mpeg",format:"mp3",playable:false,autoPlay:false,chars:0},playback:{ready:false,autoPlay:false,route:"/api/tts",compatibilityRoute:"/tts",mimeType:"audio/mpeg",format:"mp3"},speechLifecycle:{error:"nyx:voice:error",end:"nyx:voice:end"}});
}
module.exports=voiceRoute; module.exports.voiceRoute=voiceRoute; module.exports.route=voiceRoute; module.exports.run=voiceRoute; module.exports.speak=voiceRoute; module.exports.default=voiceRoute; module.exports.health=health; module.exports.getHealth=health; module.exports.status=health; module.exports.resolveTtsDelegate=resolveTtsDelegate; module.exports.resolveTtsHealth=resolveTtsHealth; module.exports.normalizeDelegateResult=normalizeDelegateResult; module.exports.VOICE_ROUTE_VERSION=VOICE_ROUTE_VERSION;
