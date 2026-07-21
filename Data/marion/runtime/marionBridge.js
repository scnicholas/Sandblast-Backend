"use strict";



/* MARION_NON_THROWING_PRIMITIVE_V2_START */
function marionNonThrowingText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const type = typeof value;
  if (type === "string") return value;
  if (type === "number" || type === "boolean" || type === "bigint") {
    try { return String(value); } catch (_) { return fallback; }
  }
  if (value instanceof Error) {
    try { return value.message || value.name || fallback; } catch (_) { return fallback; }
  }
  try {
    const converted = String(value);
    return typeof converted === "string" ? converted : fallback;
  } catch (_) {}
  try {
    const seen = new WeakSet();
    const json = JSON.stringify(value, function(_key, item) {
      if (typeof item === "bigint") return String(item);
      if (typeof item === "function" || typeof item === "symbol" || typeof item === "undefined") return undefined;
      if (item && typeof item === "object") {
        if (seen.has(item)) return "[circular]";
        seen.add(item);
      }
      return item;
    });
    return typeof json === "string" ? json : fallback;
  } catch (_) {}
  return fallback;
}
function marionNonThrowingClean(value, fallback = "") {
  return marionNonThrowingText(value, fallback)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function marionPrivateReplyText(result) {
  if (typeof result === "string") return marionNonThrowingClean(result);
  if (!result || typeof result !== "object") return "";
  const payload = result.payload && typeof result.payload === "object" ? result.payload : {};
  const nested = result.result && typeof result.result === "object" ? result.result : {};
  const envelope =
    result.finalEnvelope && typeof result.finalEnvelope === "object" ? result.finalEnvelope :
    payload.finalEnvelope && typeof payload.finalEnvelope === "object" ? payload.finalEnvelope :
    nested.finalEnvelope && typeof nested.finalEnvelope === "object" ? nested.finalEnvelope : {};
  const candidates = [
    result.directReply, result.visibleReply, result.displayReply, result.finalReply,
    result.reply, result.answer, result.response, result.text, result.message,
    envelope.finalReply, envelope.reply, envelope.answer, envelope.text,
    payload.directReply, payload.reply, payload.text, payload.message,
    nested.directReply, nested.reply, nested.text, nested.message
  ];
  for (const candidate of candidates) {
    const text = marionNonThrowingClean(candidate);
    if (text) return text;
  }
  return "";
}
/* MARION_NON_THROWING_PRIMITIVE_V2_END */

const VERSION = "marionBridge v7.5.0 CANONICAL-TRANSPORT-AUTHORITY-HARDENED";
const BRIDGE_CONTRACT_VERSION = "nyx.marion.bridge/7.5";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";

const fs = require("fs");
const path = require("path");

function tryRequireMany(paths){
  let lastError = null;
  for(const p of Array.isArray(paths)?paths:[]){
    try{
      const resolved=require.resolve(p);
      const mod=require(resolved);
      if(mod)return{mod,resolvedPath:resolved,requested:p,ok:true,error:""};
      lastError=new Error(`module_empty:${p}`);
    }catch(err){lastError=err;}
  }
  return{mod:null,resolvedPath:"",requested:"",ok:false,error:marionNonThrowingClean(lastError&&(lastError.code||lastError.message||lastError.name),"module_unavailable")};
}
function dependencyStatus(name,loaded){
  const item=loaded&&typeof loaded==="object"?loaded:{};
  let exists=false;
  try{exists=!!(item.resolvedPath&&fs.existsSync(item.resolvedPath));}catch(_){exists=false;}
  return{name,ok:!!item.mod,requested:item.requested||"",resolvedPath:item.resolvedPath||"",exists,error:item.error||""};
}

const PROJECT_ROOT = path.resolve(__dirname,"..","..","..");
const COMPOSER_REQUIRE_CANDIDATES = Object.freeze([
  path.join(__dirname,"composeMarionResponse.js"),
  path.join(PROJECT_ROOT,"Data","marion","runtime","composeMarionResponse.js"),
  "./Data/marion/runtime/composeMarionResponse.js",
  "./Data/marion/runtime/composeMarionResponse",
  "./Data/marion/composeMarionResponse.js",
  "./Data/marion/composeMarionResponse",
  "./composeMarionResponse.js",
  "./composeMarionResponse"
]);
const finalEnvelopeLoaded=tryRequireMany([path.join(__dirname,"marionFinalEnvelope.js"),path.join(PROJECT_ROOT,"Data","marion","runtime","marionFinalEnvelope.js"),"./Data/marion/runtime/marionFinalEnvelope.js","./Data/marion/runtime/marionFinalEnvelope","./marionFinalEnvelope.js","./marionFinalEnvelope","./utils/marionFinalEnvelope.js","./utils/marionFinalEnvelope"]);
const intentRouterLoaded=tryRequireMany([path.join(__dirname,"marionIntentRouter.js"),path.join(PROJECT_ROOT,"Data","marion","runtime","marionIntentRouter.js"),"./Data/marion/runtime/marionIntentRouter.js","./Data/marion/runtime/marionIntentRouter","./marionIntentRouter.js","./marionIntentRouter"]);
const composerLoaded=tryRequireMany(COMPOSER_REQUIRE_CANDIDATES);
const commandNormalizerLoaded=tryRequireMany([path.join(__dirname,"marionCommandNormalizer.js"),path.join(PROJECT_ROOT,"Data","marion","runtime","marionCommandNormalizer.js"),"./Data/marion/runtime/marionCommandNormalizer.js","./Data/marion/runtime/marionCommandNormalizer","./marionCommandNormalizer.js","./marionCommandNormalizer","./utils/marionCommandNormalizer.js","./utils/marionCommandNormalizer"]);
const loopGuardLoaded=tryRequireMany([path.join(__dirname,"marionLoopGuard.js"),path.join(PROJECT_ROOT,"Data","marion","runtime","marionLoopGuard.js"),"./Data/marion/runtime/marionLoopGuard.js","./Data/marion/runtime/marionLoopGuard","./marionLoopGuard.js","./marionLoopGuard","./utils/marionLoopGuard.js","./utils/marionLoopGuard"]);
const emotionRuntimeLoaded=tryRequireMany([path.join(__dirname,"emotion","emotionRuntime.js"),path.join(PROJECT_ROOT,"Data","marion","runtime","emotion","emotionRuntime.js"),"./emotion/emotionRuntime.js","./emotion/emotionRuntime","./Data/marion/runtime/emotion/emotionRuntime.js","./Data/marion/runtime/emotion/emotionRuntime","./marion/runtime/emotion/emotionRuntime.js","./marion/runtime/emotion/emotionRuntime"]);
const finalEnvelopeMod=finalEnvelopeLoaded.mod;
const intentRouterMod=intentRouterLoaded.mod;
const composerMod=composerLoaded.mod;
const commandNormalizerMod=commandNormalizerLoaded.mod;
const loopGuardMod=loopGuardLoaded.mod;
const emotionRuntimeMod=emotionRuntimeLoaded.mod;
const routeMarionIntent=intentRouterMod&&typeof intentRouterMod.routeMarionIntent==="function"?intentRouterMod.routeMarionIntent:null;
const composeMarionResponse=composerMod&&typeof composerMod.composeMarionResponse==="function"?composerMod.composeMarionResponse:(composerMod&&typeof composerMod.run==="function"?composerMod.run:(composerMod&&typeof composerMod.default==="function"?composerMod.default:null));
const DEPENDENCY_STATUS = Object.freeze({
  bridgeFile: __filename,
  composerPreferred: path.join(__dirname,"composeMarionResponse.js"),
  composer: dependencyStatus("composeMarionResponse", composerLoaded),
  finalEnvelope: dependencyStatus("marionFinalEnvelope", finalEnvelopeLoaded),
  intentRouter: dependencyStatus("marionIntentRouter", intentRouterLoaded),
  commandNormalizer: dependencyStatus("marionCommandNormalizer", commandNormalizerLoaded),
  loopGuard: dependencyStatus("marionLoopGuard", loopGuardLoaded),
  emotionRuntime: dependencyStatus("emotionRuntime", emotionRuntimeLoaded)
});

function safeStr(value){return marionNonThrowingClean(value);}
function lower(value){return safeStr(value).toLowerCase();}
function isObj(value){return !!value&&typeof value==="object"&&!Array.isArray(value);}
function safeObj(value){return isObj(value)?value:{};}
function safeArray(value){try{return Array.isArray(value)?value:[];}catch(_){return [];}}
function safeNumber(value,fallback=0){try{const n=Number(value);return Number.isFinite(n)?n:fallback;}catch(_){return fallback;}}
function safeKeys(value,limit=200){try{return Object.keys(value).slice(0,Math.max(0,limit));}catch(_){return [];}}
function firstText(){for(let i=0;i<arguments.length;i+=1){const value=safeStr(arguments[i]);if(value)return value;}return "";}
function hashText(value){const source=lower(value).replace(/[^a-z0-9]+/g," ").trim();let hash=0;for(let i=0;i<source.length;i+=1){hash=((hash<<5)-hash)+source.charCodeAt(i);hash|=0;}return String(hash>>>0);}
function jsonSafe(value, depth = 0, seen = new WeakSet()) {
  if (value == null) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (t === "bigint") { try { return String(value); } catch (_) { return "0"; } }
  if (t === "function" || t === "symbol" || t === "undefined") return undefined;
  if (depth > 8) return "[MaxDepth]";
  try { if (value instanceof Date) return value.toISOString(); } catch (_) {}
  try {
    if (Buffer.isBuffer(value)) return { type: "Buffer", bytes: value.length };
  } catch (_) {}
  if (safeArray(value) === value) {
    const out = [];
    let length = 0;
    try { length = Math.min(value.length >>> 0, 80); } catch (_) { length = 0; }
    for (let i = 0; i < length; i += 1) {
      let item;
      try { item = value[i]; } catch (_) { item = "[unreadable]"; }
      const safeItem = jsonSafe(item, depth + 1, seen);
      if (safeItem !== undefined) out.push(safeItem);
    }
    return out;
  }
  if (isObj(value)) {
    try { if (seen.has(value)) return "[Circular]"; seen.add(value); } catch (_) { return "[unserializable]"; }
    const out = {};
    for (const key of safeKeys(value, 200)) {
      if (/^(socket|res|req|next|stream|connection|client|server)$/i.test(key)) continue;
      let raw;
      try { raw = value[key]; } catch (_) { raw = "[unreadable]"; }
      const v = jsonSafe(raw, depth + 1, seen);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return marionNonThrowingText(value, "[unserializable]"); }
}

function compactResolvedEmotion(state = {}) {
  const e = safeObj(state);
  if (!Object.keys(e).length) return {};
  const drift = safeObj(e.state_drift);
  return {
    schema_version: safeStr(e.schema_version || "marion-resolved-emotion-state.v1.0"),
    emotion: safeObj(e.emotion),
    nuance: safeObj(e.nuance),
    support: safeObj(e.support),
    guard: safeObj(e.guard),
    state_drift: {
      trend: safeStr(drift.trend || ""),
      stability: safeNumber(drift.stability, 0),
      volatility: safeNumber(drift.volatility, 0),
      dominant_pattern: safeStr(drift.dominant_pattern || "")
    },
    runtime_meta: { source: safeStr(safeObj(e.runtime_meta).source || "emotionRuntime.resolveEmotionState") }
  };
}

function compactPatchForTransport(patch = {}) {
  const out = jsonSafe(safeObj(patch));
  const emotion = compactResolvedEmotion(out.resolvedEmotion || out.emotionState || out.lastEmotionState);
  if (Object.keys(emotion).length) {
    out.resolvedEmotion = emotion;
    out.emotionState = emotion;
    out.lastEmotionState = emotion;
  }
  return out;
}

function transportSafePacket(packet = {}) {
  const out = jsonSafe(packet);
  if (!isObj(out)) return out;
  const reply = extractReply(out) || safeStr(out.reply || safeObj(out.finalEnvelope).reply);
  if (reply) {
    out.reply = reply;
    out.text = reply;
    out.answer = reply;
    out.output = reply;
    out.response = reply;
    out.message = reply;
    out.spokenText = safeStr(out.spokenText || reply);
    out.payload = { ...safeObj(out.payload), reply, text: reply, message: reply, final: true, marionFinal: true };
  }
  out.ok = out.ok !== false;
  const hasFinalReply = !!reply;
  out.final = hasFinalReply || out.final === true;
  out.marionFinal = hasFinalReply || out.marionFinal === true;
  out.handled = true;
  out.awaitingMarion = false;
  out.transportSafe = true;
  out.socketReconnect = false;
  if (out.memoryPatch) out.memoryPatch = compactPatchForTransport(out.memoryPatch);
  if (out.sessionPatch) out.sessionPatch = compactPatchForTransport(out.sessionPatch);
  if (out.payload && out.payload.memoryPatch) out.payload.memoryPatch = compactPatchForTransport(out.payload.memoryPatch);
  if (out.payload && out.payload.sessionPatch) out.payload.sessionPatch = compactPatchForTransport(out.payload.sessionPatch);
  out.finalEnvelope = {
    ...safeObj(out.finalEnvelope),
    reply: reply || safeStr(safeObj(out.finalEnvelope).reply),
    spokenText: safeStr(safeObj(out.finalEnvelope).spokenText || out.spokenText || reply),
    final: out.final === true,
    marionFinal: out.marionFinal === true,
    handled: true,
    contractVersion: safeStr(safeObj(out.finalEnvelope).contractVersion || "nyx.marion.final/1.0")
  };
  out.meta = { ...safeObj(out.meta), bridgeVersion: VERSION, bridgeContractVersion: BRIDGE_CONTRACT_VERSION, transportSafe: true, socketReconnect: false, emitOrder: "finalEnvelope:beforeSessionPatch", finalDeliveryTiming: "single_terminal_packet" };
  out.diagnostics = { ...safeObj(out.diagnostics), transportSafe: true, jsonSanitized: true, finalDeliveryTiming: "single_terminal_packet" };
  return out;
}

function transportSafeError(packet = {}) {
  const out = jsonSafe(packet);
  if (isObj(out)) {
    out.transportSafe = true;
    out.socketReconnect = false;
    out.meta = { ...safeObj(out.meta), transportSafe: true, socketReconnect: false };
    out.diagnostics = { ...safeObj(out.diagnostics), transportSafe: true, jsonSanitized: true };
  }
  return out;
}

function isDiagnosticText(value){const t=lower(value);return /marion[_ -]?final[_ -]?envelope[_ -]?missing|final envelope missing|diagnostic packet|non-final|no_final|composer_invalid|composer_reply_missing|final_envelope_unavailable|bridge_error|packet_invalid|contract_invalid/.test(t);} 
function isRogueFallbackText(value){const t=lower(value);if(!t)return false;return /\b(i['’]?m here and tracking the turn|i am here and tracking the turn|nyx is live and tracking the turn|give me the next clear target|send a specific command|press reset|ready\.\s*send|i blocked a repeated fallback)\b/i.test(t);}
function neutralInterruptedReply(){return "The response path was interrupted before Marion completed the final reply. I’m holding this as a routing fault, not a user-facing emotional answer.";}
function identityAnchorReply(){return "I’m Nyx — the interface you speak with. Marion is the deeper cognitive layer behind me: it reads the intent, tracks context, weighs the domain, and shapes the response I deliver. When you talk to me, you’re interacting with Nyx on the surface and Marion underneath the reasoning.";}
function hotFallbackReply(reason,input={}){const text=lower(extractUserText(input));if(/who are you|what are you|how.*marion.*think|how.*you.*think|marion helps you think|identity|consciousness/.test(text))return identityAnchorReply();return "I couldn’t complete that response because the response engine is temporarily unavailable.";}
function createLocalFinalEnvelope({normalized={},routed={},contract={},reason="local_final_fallback",loopGuardResult={}}={}){const routing=safeObj(routed.routing),intent=firstText(routing.intent,contract.intent,"simple_chat"),domain=firstText(routing.domain,contract.domain,normalized.domain,"general");let reply=firstText(extractReply(contract));if(!reply){reply=neutralInterruptedReply();}const memoryPatch=safeObj(contract.memoryPatch),speechInput=safeObj(contract.speech),speechEnabled=speechInput.enabled===true&&speechInput.silent!==true&&speechInput.silentAudio!==true,speechSilent=!speechEnabled;return{ok:true,final:true,handled:true,marionFinal:true,degraded:true,finalEnvelope:{reply,spokenText:firstText(contract.spokenText,reply),intent,domain,turnId:firstText(normalized.turnId),sessionId:firstText(normalized.sessionId),stateStage:firstText(memoryPatch.stateStage,contract.stateStage,"final"),replySignature:firstText(contract.replySignature,memoryPatch.replySignature,hashText(reply)),source:"marionBridge",authority:"marionFinalEnvelope",contractVersion:"nyx.marion.final/1.0",final:true,marionFinal:true},reply,text:reply,answer:reply,output:reply,response:reply,message:reply,spokenText:reply,payload:{reply,text:reply,message:reply,final:true,marionFinal:true,degraded:true},speech:{enabled:speechEnabled,silent:speechSilent,silentAudio:speechSilent,textDisplay:reply,textSpeak:firstText(speechInput.textSpeak,reply),presenceProfile:firstText(speechInput.presenceProfile,"receptive"),nyxStateHint:firstText(speechInput.nyxStateHint,"receptive")},memoryPatch,bridge:{version:VERSION,contractVersion:BRIDGE_CONTRACT_VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,singleContract:true,localFinalFallback:true},routed,diagnostics:{bridgeVersion:VERSION,bridgeContractVersion:BRIDGE_CONTRACT_VERSION,routerCalled:true,composerCalled:safeKeys(safeObj(contract),1).length>0,composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,dependencies:DEPENDENCY_STATUS,loopGuardCalled:!!loopGuardMod,loopGuard:safeObj(loopGuardResult),singleContract:true,zeroLoopSurface:true,localFinalFallback:true,reason},meta:{version:VERSION,bridgeVersion:VERSION,bridgeContractVersion:BRIDGE_CONTRACT_VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,replyAuthority:"marionFinalEnvelope",semanticAuthority:"composeMarionResponse",composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopePresent:true,zeroLoopSurface:true,localFinalFallback:true,degraded:true,reason}};}
function extractUserText(input={}){const src=safeObj(input),body=safeObj(src.body),payload=safeObj(src.payload),packet=safeObj(src.packet),synthesis=safeObj(packet.synthesis);return firstText(src.userQuery,src.text,src.query,src.message,body.userQuery,body.text,body.query,body.message,payload.userQuery,payload.text,payload.query,payload.message,synthesis.userQuery,synthesis.text);}
function extractLane(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return firstText(src.lane,src.sessionLane,body.lane,body.sessionLane,session.lane,meta.lane,"general")||"general";}
function extractTurnId(input={}){const src=safeObj(input),body=safeObj(src.body),meta=safeObj(src.meta||body.meta);return firstText(src.turnId,src.requestId,src.traceId,src.id,body.turnId,body.requestId,body.traceId,meta.turnId,meta.requestId,meta.traceId);}
function extractPreviousMemory(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return safeObj(src.previousMemory||src.turnMemory||src.memory||body.previousMemory||body.turnMemory||body.memory||session.previousMemory||session.turnMemory||session.memory||meta.previousMemory||{});}
function extractMarionIntentPacket(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return safeObj(src.marionIntent||src.intentPacket||body.marionIntent||body.intentPacket||session.marionIntent||meta.marionIntent||{});}
function extractRequestedDomain(input={}){const src=safeObj(input),body=safeObj(src.body),meta=safeObj(src.meta||body.meta),packet=safeObj(src.packet),routing=safeObj(packet.routing);return firstText(src.requestedDomain,src.domain,body.requestedDomain,body.domain,meta.requestedDomain,meta.domain,meta.preferredDomain,routing.domain,"general")||"general";}
function normalizeInbound(input={}){let source=safeObj(input),commandPacket={};if(commandNormalizerMod&&typeof commandNormalizerMod.normalizeCommand==="function"){try{commandPacket=safeObj(commandNormalizerMod.normalizeCommand(source));if(commandPacket.userText||commandPacket.text){source={...source,text:firstText(commandPacket.userText,commandPacket.text,source.text,source.userQuery),userQuery:firstText(commandPacket.userText,commandPacket.text,source.userQuery,source.text),query:firstText(commandPacket.userText,commandPacket.text,source.query,source.text),sessionId:firstText(commandPacket.sessionId,source.sessionId),state:safeObj(commandPacket.state||source.state),commandPacket};}}catch(err){commandPacket={ok:false,error:safeStr(err&&(err.message||err)||"command_normalizer_failed")};}}const userQuery=extractUserText(source),issues=[];if(!userQuery)issues.push("user_query_missing");return{ok:issues.length===0,issues,original:source,commandPacket,userQuery,text:userQuery,query:userQuery,lane:extractLane(source),requestedDomain:extractRequestedDomain(source),domain:extractRequestedDomain(source),previousMemory:extractPreviousMemory(source),marionIntent:extractMarionIntentPacket(source),turnId:extractTurnId(source)||`marion_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,sessionId:firstText(source.sessionId,source.body&&source.body.sessionId,source.meta&&source.meta.sessionId,"public")||"public"};}
function fallbackRoute(normalized){const text=lower(normalized.userQuery);let intent="simple_chat";if(/who are you|what are you|how.*marion.*think|how.*you.*think|marion helps you think|identity|consciousness/i.test(text))intent="identity_query";else if(/bug|error|route|endpoint|index|diag|autopsy|line|loop|widget|frontend|backend|fix|script|file/i.test(text))intent="technical_debug";else if(/sad|stress|overwhelm|depress|anx|hurt|alone|frustr|panic|grief/i.test(text))intent="emotional_support";else if(/price|sponsor|media|monet|pitch|fund|invest|sales|proposal/i.test(text))intent="business_strategy";else if(/top 10|song|artist|album|chart|music|radio|playlist/i.test(text))intent="music_query";else if(/news|story|headline|article|rss|newscanada/i.test(text))intent="news_query";else if(/roku|tv app|channel|linear tv|stream/i.test(text))intent="roku_query";else if(/remember|last time|continue|state spine|memory/i.test(text))intent="identity_or_memory";const domainMap={simple_chat:"general",technical_debug:"technical",emotional_support:"emotional",business_strategy:"business",music_query:"music",news_query:"news",roku_query:"roku",identity_query:"identity",identity_or_memory:"memory"};return{ok:true,marionIntent:{activate:intent!=="simple_chat",intent,confidence:intent==="simple_chat"?0.4:0.7,source:"bridge_fallback_router"},routing:{domain:domainMap[intent]||"general",intent,lane:normalized.lane,endpoint:CANONICAL_ENDPOINT,mode:"balanced",depth:"balanced"},routerVersion:"bridge_fallback_router/1.0"};}
function validateRouterResult(result={}){const src=safeObj(result),routing=safeObj(src.routing),marionIntent=safeObj(src.marionIntent),issues=[];if(src.ok===false)issues.push("router_not_ok");if(!safeStr(routing.intent||marionIntent.intent))issues.push("intent_missing");if(!safeStr(routing.domain))issues.push("domain_missing");return{ok:issues.length===0,issues};}
function extractReply(contract={}){const src=safeObj(contract),finalEnvelope=safeObj(src.finalEnvelope),payload=safeObj(src.payload),synthesis=safeObj(src.synthesis),packet=safeObj(src.packet),packetSynthesis=safeObj(packet.synthesis);const reply=firstText(finalEnvelope.reply,finalEnvelope.text,finalEnvelope.spokenText,src.reply,src.text,src.answer,src.output,src.response,src.message,src.spokenText,payload.reply,payload.text,payload.answer,payload.output,payload.message,synthesis.reply,synthesis.text,synthesis.answer,synthesis.output,synthesis.spokenText,packetSynthesis.reply,packetSynthesis.text,packetSynthesis.answer,packetSynthesis.output,packetSynthesis.spokenText);return (isDiagnosticText(reply)||isRogueFallbackText(reply))?"":reply;}
function validateComposeResult(contract={}){const issues=[],src=safeObj(contract);if(!Object.keys(src).length)issues.push("compose_contract_missing");if(src.ok===false)issues.push("compose_not_ok");if(!extractReply(src))issues.push("compose_reply_missing");return{ok:issues.length===0,issues};}
function buildErrorResult(reason,detail={},input={}){const normalized=safeObj(input);return{ok:false,final:false,handled:true,marionFinal:false,awaitingMarion:true,terminal:false,error:safeStr(reason||"bridge_error")||"bridge_error",reason:safeStr(reason||"bridge_error")||"bridge_error",detail:safeObj(detail),reply:"",text:"",output:"",response:"",message:"",payload:{reply:"",text:"",message:"",final:false,awaitingMarion:true,error:true},diagnostics:{bridgeVersion:VERSION,bridgeError:true,noUserFacingBridgeError:true,reason:safeStr(reason||"bridge_error"),detail:safeObj(detail)},meta:{version:VERSION,endpoint:CANONICAL_ENDPOINT,turnId:safeStr(normalized.turnId||""),final:false,marionFinal:false,awaitingMarion:true,replyAuthority:"none",reason:safeStr(reason||"bridge_error")}};}

function resolveEmotionForTurn(normalized={}){
  if(!emotionRuntimeMod||typeof emotionRuntimeMod.resolveEmotionState!=="function"){
    return {ok:false,mode:"resolved_state_only",error:"emotion_runtime_unavailable",state:null,diagnostics:{dependency:DEPENDENCY_STATUS.emotionRuntime}};
  }
  try{
    const prev=safeObj(normalized.previousMemory);
    const previousEmotionState=safeObj(
      prev.resolvedEmotion||
      prev.emotionState||
      prev.lastEmotionState||
      prev.emotionalState||
      safeObj(prev.stateSpine).resolvedEmotion||
      safeObj(prev.conversationState).resolvedEmotion
    );
    const recentReplies=safeArray(prev.recentReplies||prev.assistantReplies||prev.replyHistory).slice(-6);
    const result=safeObj(emotionRuntimeMod.resolveEmotionState(normalized.userQuery,{
      previousEmotionState,
      recentReplies,
      sessionId:normalized.sessionId,
      turnId:normalized.turnId
    }));
    return {ok:result.ok!==false,mode:result.mode||"resolved_state_only",state:safeObj(result.state),error:result.error||"",detail:result.detail||"",diagnostics:{dependency:DEPENDENCY_STATUS.emotionRuntime}};
  }catch(err){
    return {ok:false,mode:"resolved_state_only",error:"emotion_runtime_exception",detail:safeStr(err&&(err.message||err)||""),state:null,diagnostics:{dependency:DEPENDENCY_STATUS.emotionRuntime}};
  }
}
function emotionSummary(packet={}){
  const state=safeObj(packet.state), emotion=safeObj(state.emotion), nuance=safeObj(state.nuance), drift=safeObj(state.state_drift), guard=safeObj(state.guard), support=safeObj(state.support);
  return {
    ok: packet.ok!==false,
    mode: packet.mode||"resolved_state_only",
    primary: safeStr(emotion.primary||"neutral"),
    secondary: safeStr(emotion.secondary||nuance.subtype||"unclear"),
    confidence: safeNumber(emotion.confidence,0),
    intensity: safeNumber(emotion.intensity,0),
    suppression_signal: safeStr(nuance.suppression_signal||""),
    risk_flags: safeArray(nuance.risk_flags||guard.detected_flags).slice(0,10),
    action_mode: safeStr(guard.action_mode||"supportive_monitoring"),
    care_mode: safeStr(safeObj(state.psychology).care_mode||""),
    timing_profile: safeObj(support.timing_profile),
    state_drift: {
      trend: safeStr(drift.trend||""),
      stability: safeNumber(drift.stability,0),
      volatility: safeNumber(drift.volatility,0),
      dominant_pattern: safeStr(drift.dominant_pattern||"")
    },
    source: safeStr(safeObj(state.runtime_meta).source||"emotionRuntime.resolveEmotionState")
  };
}
function mergeEmotionIntoContract(contract={},resolvedEmotionPacket={}){
  const c=safeObj(contract), state=safeObj(resolvedEmotionPacket.state), summary=emotionSummary(resolvedEmotionPacket);
  if(!Object.keys(state).length) return c;
  const memoryPatch={
    ...safeObj(c.memoryPatch),
    resolvedEmotion:state,
    emotionState:state,
    lastEmotionState:state,
    emotionalContinuity:{
      active:true,
      primary:summary.primary,
      secondary:summary.secondary,
      confidence:summary.confidence,
      intensity:summary.intensity,
      stability:summary.state_drift.stability,
      volatility:summary.state_drift.volatility,
      trend:summary.state_drift.trend,
      updatedAt:Date.now(),
      source:"marionBridge"
    }
  };
  const sessionPatch={...safeObj(c.sessionPatch),...memoryPatch};
  return {
    ...c,
    memoryPatch,
    sessionPatch,
    resolvedEmotion:state,
    emotionRuntime:safeObj(resolvedEmotionPacket),
    emotionSummary:summary,
    meta:{
      ...safeObj(c.meta),
      emotionRuntimeCalled:true,
      emotionRuntimeOk:resolvedEmotionPacket.ok!==false,
      emotionMode:resolvedEmotionPacket.mode||"resolved_state_only",
      emotionPrimary:summary.primary,
      emotionSecondary:summary.secondary,
      emotionIntensity:summary.intensity
    },
    diagnostics:{
      ...safeObj(c.diagnostics),
      emotionRuntimeCalled:true,
      emotionRuntimeOk:resolvedEmotionPacket.ok!==false,
      emotionSummary:summary
    }
  };
}
function normalizeComposeInput(normalized,routed,resolvedEmotionPacket={}){const routing=safeObj(routed.routing),marionIntent=safeObj(routed.marionIntent);return{userQuery:normalized.userQuery,text:normalized.userQuery,query:normalized.userQuery,domain:safeStr(routing.domain||normalized.domain||"general")||"general",requestedDomain:safeStr(routing.domain||normalized.requestedDomain||"general")||"general",intent:safeStr(routing.intent||marionIntent.intent||"simple_chat")||"simple_chat",marionIntent,routing,previousMemory:normalized.previousMemory,conversationState:safeObj(normalized.previousMemory.stateSpine||normalized.previousMemory.conversationState||normalized.commandPacket.state),lane:normalized.lane,sessionId:normalized.sessionId,turnId:normalized.turnId,sourceTurnId:normalized.turnId,resolvedEmotion:safeObj(resolvedEmotionPacket.state),emotionRuntime:safeObj(resolvedEmotionPacket),emotionRuntimeOk:resolvedEmotionPacket.ok!==false};}
function wrapFinal({normalized,routed,contract,loopGuardResult,resolvedEmotionPacket={}}){const reply=extractReply(contract);if(!reply)return createLocalFinalEnvelope({normalized,routed,contract,reason:"composer_reply_missing",loopGuardResult});if(!finalEnvelopeMod||typeof finalEnvelopeMod.createMarionFinalEnvelope!=="function")return createLocalFinalEnvelope({normalized,routed,contract:{...safeObj(contract),reply,text:reply,spokenText:firstText(contract.spokenText,reply)},reason:"final_envelope_unavailable",loopGuardResult});const routing=safeObj(routed.routing),memoryPatch=safeObj(contract.memoryPatch);const envelope=finalEnvelopeMod.createMarionFinalEnvelope({reply,spokenText:safeStr(contract.spokenText||reply),intent:safeStr(routing.intent||contract.intent||"simple_chat"),domain:safeStr(routing.domain||contract.domain||normalized.domain||"general"),routing:{...routing,endpoint:safeStr(routing.endpoint||CANONICAL_ENDPOINT)||CANONICAL_ENDPOINT},stateStage:safeStr(memoryPatch.stateStage||contract.stateStage||(loopGuardResult.forceRecovery?"recover":"final")),turnId:normalized.turnId,sessionId:normalized.sessionId,memoryPatch,resolvedEmotion:safeObj(resolvedEmotionPacket.state||contract.resolvedEmotion),emotionSummary:emotionSummary(resolvedEmotionPacket.state?resolvedEmotionPacket:safeObj(contract.emotionRuntime)),speech:safeObj(contract.speech),replySignature:safeStr(contract.replySignature||memoryPatch.replySignature||hashText(reply)),composerVersion:safeStr(contract.version||contract.composerVersion||""),bridgeVersion:VERSION,meta:{...safeObj(contract.meta),bridgeVersion:VERSION,composerVersion:safeStr(contract.version||contract.composerVersion||""),loopGuardVersion:safeStr(loopGuardMod&&loopGuardMod.VERSION||""),routerVersion:safeStr(routed.routerVersion||routed.VERSION||""),normalizerVersion:safeStr(commandNormalizerMod&&commandNormalizerMod.VERSION||""),turnId:normalized.turnId},diagnostics:{...safeObj(contract.diagnostics),bridgeVersion:VERSION,routerCalled:true,composerCalled:true,loopGuardCalled:!!loopGuardMod,loopGuard:safeObj(loopGuardResult),singleContract:true,finalAuthority:"marionFinalEnvelope"}});if(!safeStr(safeObj(envelope.finalEnvelope).reply||envelope.reply)||isDiagnosticText(safeObj(envelope.finalEnvelope).reply||envelope.reply))return createLocalFinalEnvelope({normalized,routed,contract:{...safeObj(contract),reply,text:reply,spokenText:firstText(contract.spokenText,reply)},reason:"final_envelope_invalid",loopGuardResult});return{...envelope,ok:true,final:true,marionFinal:true,handled:true,hardlockCompatible:true,trustedTransport:true,singleFinalAuthority:true,bridge:{version:VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,singleContract:true},routed,diagnostics:{...safeObj(envelope.diagnostics),bridgeVersion:VERSION,routerVersion:safeStr(routed.routerVersion||routed.VERSION||""),composerVersion:safeStr(contract.version||contract.composerVersion||""),composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopeVersion:safeStr(finalEnvelopeMod.VERSION||""),dependencies:DEPENDENCY_STATUS,loopGuard:safeObj(loopGuardResult),singleContract:true,zeroLoopSurface:true,emotionRuntimeCalled:!!Object.keys(safeObj(resolvedEmotionPacket)).length,emotionRuntimeOk:resolvedEmotionPacket.ok!==false,emotionSummary:emotionSummary(resolvedEmotionPacket)},meta:{...safeObj(envelope.meta),version:VERSION,bridgeVersion:VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,replyAuthority:"marionFinalEnvelope",semanticAuthority:"composeMarionResponse",composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopePresent:true,zeroLoopSurface:true,trustedTransport:true,singleFinalAuthority:true,hardlockCompatible:true,emotionRuntimeCalled:!!Object.keys(safeObj(resolvedEmotionPacket)).length,emotionRuntimeOk:resolvedEmotionPacket.ok!==false,emotionPrimary:emotionSummary(resolvedEmotionPacket).primary,emotionSecondary:emotionSummary(resolvedEmotionPacket).secondary}};}
async function processWithMarionUnsafe(input={}){const normalized=normalizeInbound(input);if(!normalized.ok)return buildErrorResult("input_invalid",{issues:normalized.issues},normalized);if(typeof composeMarionResponse!=="function")return createLocalFinalEnvelope({normalized,routed:fallbackRoute(normalized),contract:{reply:hotFallbackReply("composer_unavailable",normalized),speech:{enabled:false,silent:true,silentAudio:true}},reason:"composer_unavailable",loopGuardResult:{ok:false,reasons:["composer_unavailable"],dependencyStatus:DEPENDENCY_STATUS.composer}});const resolvedEmotionPacket=resolveEmotionForTurn(normalized);
let routed=null;if(typeof routeMarionIntent==="function"){try{routed=await Promise.resolve(routeMarionIntent({text:normalized.userQuery,query:normalized.userQuery,userQuery:normalized.userQuery,lane:normalized.lane,requestedDomain:normalized.requestedDomain,domain:normalized.domain,marionIntent:normalized.marionIntent,previousMemory:normalized.previousMemory,session:{lane:normalized.lane,previousMemory:normalized.previousMemory,marionIntent:normalized.marionIntent},turnId:normalized.turnId,resolvedEmotion:safeObj(resolvedEmotionPacket.state),emotionRuntime:safeObj(resolvedEmotionPacket)}));}catch(_){routed=null;}}if(!validateRouterResult(routed).ok)routed=fallbackRoute(normalized);const composeInput=normalizeComposeInput(normalized,routed,resolvedEmotionPacket);let contract=await Promise.resolve(composeMarionResponse({...safeObj(routed),primaryDomain:safeStr(safeObj(routed.routing).domain||composeInput.domain),domain:safeStr(safeObj(routed.routing).domain||composeInput.domain),intent:safeStr(safeObj(routed.routing).intent||composeInput.intent),routing:safeObj(routed.routing),marionIntent:safeObj(routed.marionIntent)},composeInput));let composeValidation=validateComposeResult(contract);if(!composeValidation.ok){const fallbackReply=hotFallbackReply("composer_invalid",normalized);contract={ok:true,reply:fallbackReply,text:fallbackReply,answer:fallbackReply,output:fallbackReply,response:fallbackReply,message:fallbackReply,spokenText:fallbackReply,intent:composeInput.intent,domain:composeInput.domain,speech:{enabled:false,silent:true,silentAudio:true,textDisplay:fallbackReply,textSpeak:fallbackReply,presenceProfile:"receptive",nyxStateHint:"receptive"},diagnostics:{composerRecoveredByBridge:true,issues:composeValidation.issues,bridgeVersion:VERSION}};composeValidation=validateComposeResult(contract);}contract=mergeEmotionIntoContract(contract,resolvedEmotionPacket);let reply=extractReply(contract),loopGuardResult={ok:true,loopDetected:false,allowReply:true,forceRecovery:false,reasons:[]};if(loopGuardMod&&typeof loopGuardMod.applyLoopGuard==="function"){try{loopGuardResult=safeObj(loopGuardMod.applyLoopGuard({...composeInput,state:{...safeObj(composeInput.conversationState),...safeObj(normalized.commandPacket&&normalized.commandPacket.state),lastAssistantReply:safeStr(safeObj(composeInput.conversationState).lastAssistantReply||safeObj(normalized.commandPacket&&normalized.commandPacket.state).lastAssistantReply),loopCount:safeNumber(safeObj(composeInput.conversationState).loopCount||safeObj(normalized.commandPacket&&normalized.commandPacket.state).loopCount,0)}},reply));if(loopGuardResult.forceRecovery){const recoveryContract=await Promise.resolve(composeMarionResponse({...safeObj(routed),forceRecovery:true,recoveryRequired:true,loopGuard:loopGuardResult,lastLoopReasons:safeArray(loopGuardResult.reasons)},{...composeInput,forceRecovery:true,recoveryRequired:true,loopGuard:loopGuardResult,lastLoopReasons:safeArray(loopGuardResult.reasons),state:{...safeObj(composeInput.conversationState),stateStage:"recover",recoveryRequired:true,loopCount:safeNumber(safeObj(composeInput.conversationState).loopCount,0)+1,lastLoopReasons:safeArray(loopGuardResult.reasons)}}));if(validateComposeResult(recoveryContract).ok){contract=mergeEmotionIntoContract(recoveryContract,resolvedEmotionPacket);reply=extractReply(contract);}}}catch(err){loopGuardResult={ok:false,loopDetected:false,allowReply:true,forceRecovery:false,reasons:["loop_guard_error"],detail:safeStr(err&&(err.message||err)||"")};}}return wrapFinal({normalized,routed,contract,loopGuardResult,resolvedEmotionPacket});}

async function processWithMarion(input = {}) {
  try {
    const packet = await processWithMarionUnsafe(input);
    return packet && packet.ok === false ? transportSafeError(packet) : transportSafePacket(packet);
  } catch (err) {
    return transportSafeError(buildErrorResult("bridge_transport_exception", { message: marionNonThrowingClean(err && (err.message || err.code || err.name), "bridge_transport_exception") }, normalizeInbound(input)));
  }
}
async function maybeResolve(input={}){return processWithMarion(input);}
async function ask(input={}){return processWithMarion(input);}
async function handle(input={}){return processWithMarion(input);}
async function route(input={}){return processWithMarion(input);}
async function retrieveLayer2Signals(input={}){const normalized=normalizeInbound(input);if(!normalized.ok)return{ok:false,issues:normalized.issues,userQuery:normalized.userQuery,diagnostics:{bridgeVersion:VERSION}};const routed=fallbackRoute(normalized);return{ok:true,userQuery:normalized.userQuery,routed,diagnostics:{bridgeVersion:VERSION,noLegacyRetrievers:true}};}
function createMarionBridge(){return{maybeResolve,ask,handle,route,processWithMarion,retrieveLayer2Signals};}
module.exports={VERSION,BRIDGE_CONTRACT_VERSION,CANONICAL_ENDPOINT,DEPENDENCY_STATUS,retrieveLayer2Signals,processWithMarion,createMarionBridge,route,maybeResolve,ask,handle,default:processWithMarion,_internal:{normalizeInbound,fallbackRoute,validateRouterResult,extractReply,validateComposeResult,wrapFinal,buildErrorResult,createLocalFinalEnvelope,hotFallbackReply,identityAnchorReply,isDiagnosticText,DEPENDENCY_STATUS,COMPOSER_REQUIRE_CANDIDATES,resolveEmotionForTurn,emotionSummary,mergeEmotionIntoContract,jsonSafe,transportSafePacket,transportSafeError,compactPatchForTransport,compactResolvedEmotion}};

/* MARION_CURRENT_TURN_AUTHORITY_R1_START */
(function(){"use strict";let guard=null;try{guard=require("./marionCurrentTurnAuthority.js");}catch(_){guard=null;}if(!guard||typeof module==="undefined"||!module.exports)return;function wrap(fn){if(typeof fn!=="function"||fn.__marionCurrentTurnAuthorityR1)return fn;const w=function(){const p=guard.prepareArgumentList(arguments),r=fn.apply(this,p.args),x=v=>guard.enforceResult(v,p.input);return r&&typeof r.then==="function"?r.then(x):x(r);};try{Object.keys(fn).forEach(k=>{w[k]=fn[k];});}catch(_){}w.__marionCurrentTurnAuthorityR1=true;return w;}const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api)return;const canonical=wrap(api.processWithMarion);if(canonical){api.processWithMarion=canonical;["route","maybeResolve","ask","handle","default"].forEach(n=>{api[n]=canonical;});api.createMarionBridge=function(){return{version:"marionBridge v7.6.0 CURRENT-TURN-AUTHORITY",endpoint:api.CANONICAL_ENDPOINT||"marion://routeMarion.primary",processWithMarion:canonical,route:canonical,maybeResolve:canonical,ask:canonical,handle:canonical};};}api.VERSION="marionBridge v7.6.0 CURRENT-TURN-AUTHORITY";api.BRIDGE_CONTRACT_VERSION="nyx.marion.bridge/7.6";api.MARION_CURRENT_TURN_AUTHORITY_VERSION=guard.VERSION;api.currentTurnAuthority=guard;})();
/* MARION_CURRENT_TURN_AUTHORITY_R1_END */

