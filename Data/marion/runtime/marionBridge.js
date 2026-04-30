"use strict";

const VERSION = "marionBridge v7.4.4 STRICT-NO-PLACEHOLDER-FINALS-NO-UI-FALLBACK-SURFACE";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";

const fs = require("fs");
const path = require("path");

function tryRequireMany(paths){for(const p of Array.isArray(paths)?paths:[]){try{const resolved=require.resolve(p);const mod=require(resolved);if(mod)return{mod,resolvedPath:resolved,requested:p,ok:true};}catch(err){}}return{mod:null,resolvedPath:"",requested:"",ok:false};}
function dependencyStatus(name,loaded){const item=loaded&&typeof loaded==="object"?loaded:{};return{name,ok:!!item.mod,requested:item.requested||"",resolvedPath:item.resolvedPath||"",exists:item.resolvedPath?fs.existsSync(item.resolvedPath):false};}

const COMPOSER_REQUIRE_CANDIDATES = Object.freeze([
  "./Data/marion/runtime/composeMarionResponse.js",
  "./Data/marion/runtime/composeMarionResponse",
  "./Data/marion/composeMarionResponse.js",
  "./Data/marion/composeMarionResponse",
  "./composeMarionResponse.js",
  "./composeMarionResponse"
]);
const finalEnvelopeLoaded=tryRequireMany(["./Data/marion/runtime/marionFinalEnvelope.js","./Data/marion/runtime/marionFinalEnvelope","./marionFinalEnvelope.js","./marionFinalEnvelope","./utils/marionFinalEnvelope.js","./utils/marionFinalEnvelope"]);
const intentRouterLoaded=tryRequireMany(["./Data/marion/runtime/marionIntentRouter.js","./Data/marion/runtime/marionIntentRouter","./marionIntentRouter.js","./marionIntentRouter"]);
const composerLoaded=tryRequireMany(COMPOSER_REQUIRE_CANDIDATES);
const commandNormalizerLoaded=tryRequireMany(["./Data/marion/runtime/marionCommandNormalizer.js","./Data/marion/runtime/marionCommandNormalizer","./marionCommandNormalizer.js","./marionCommandNormalizer","./utils/marionCommandNormalizer.js","./utils/marionCommandNormalizer"]);
const loopGuardLoaded=tryRequireMany(["./Data/marion/runtime/marionLoopGuard.js","./Data/marion/runtime/marionLoopGuard","./marionLoopGuard.js","./marionLoopGuard","./utils/marionLoopGuard.js","./utils/marionLoopGuard"]);
const emotionRuntimeLoaded=tryRequireMany(["./Data/marion/runtime/emotion/emotionRuntime.js","./Data/marion/runtime/emotion/emotionRuntime","./marion/runtime/emotion/emotionRuntime.js","./marion/runtime/emotion/emotionRuntime"]);
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
  composerPreferred: path.resolve(__dirname,"Data/marion/runtime/composeMarionResponse.js"),
  composer: dependencyStatus("composeMarionResponse", composerLoaded),
  finalEnvelope: dependencyStatus("marionFinalEnvelope", finalEnvelopeLoaded),
  intentRouter: dependencyStatus("marionIntentRouter", intentRouterLoaded),
  commandNormalizer: dependencyStatus("marionCommandNormalizer", commandNormalizerLoaded),
  loopGuard: dependencyStatus("marionLoopGuard", loopGuardLoaded),
  emotionRuntime: dependencyStatus("emotionRuntime", emotionRuntimeLoaded)
});

function safeStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function lower(value){return safeStr(value).toLowerCase();}
function isObj(value){return !!value&&typeof value==="object"&&!Array.isArray(value);}
function safeObj(value){return isObj(value)?value:{};}
function safeArray(value){return Array.isArray(value)?value:[];}
function firstText(){for(let i=0;i<arguments.length;i+=1){const value=safeStr(arguments[i]);if(value)return value;}return "";}
function hashText(value){const source=lower(value).replace(/[^a-z0-9]+/g," ").trim();let hash=0;for(let i=0;i<source.length;i+=1){hash=((hash<<5)-hash)+source.charCodeAt(i);hash|=0;}return String(hash>>>0);}
function jsonSafe(value, depth = 0, seen = new WeakSet()) {
  if (value == null) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (t === "bigint") return String(value);
  if (t === "function" || t === "symbol" || t === "undefined") return undefined;
  if (depth > 8) return "[MaxDepth]";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => jsonSafe(item, depth + 1, seen)).filter((item) => item !== undefined);
  if (isObj(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const out = {};
    for (const key of Object.keys(value)) {
      if (/^(socket|res|req|next|stream|connection|client|server)$/i.test(key)) continue;
      const v = jsonSafe(value[key], depth + 1, seen);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return String(value); }
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
      stability: Number(drift.stability || 0) || 0,
      volatility: Number(drift.volatility || 0) || 0,
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
  out.final = out.final === true;
  out.marionFinal = out.marionFinal === true;
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
    final: true,
    marionFinal: true,
    handled: true,
    contractVersion: safeStr(safeObj(out.finalEnvelope).contractVersion || "nyx.marion.final/1.0")
  };
  out.meta = { ...safeObj(out.meta), transportSafe: true, socketReconnect: false, emitOrder: "finalEnvelope:beforeSessionPatch", finalDeliveryTiming: "single_terminal_packet" };
  out.diagnostics = { ...safeObj(out.diagnostics), transportSafe: true, jsonSanitized: true, finalDeliveryTiming: "single_terminal_packet" };
  return out;
}

function transportSafeError(packet = {}) {
  const out = jsonSafe(packet);
  if (isObj(out)) {
    const hasReply = !!safeStr(out.reply || out.text || out.message || safeObj(out.payload).reply);
    if (!hasReply) {
      out.final = false;
      out.marionFinal = false;
      out.terminal = false;
      out.awaitingMarion = true;
      out.suppressUserFacingReply = true;
      out.emit = false;
      out.blocked = true;
      out.payload = { ...safeObj(out.payload), final: false, marionFinal: false, awaitingMarion: true, suppressUserFacingReply: true, emit: false, blocked: true };
    }
    out.transportSafe = true;
    out.socketReconnect = false;
    out.meta = { ...safeObj(out.meta), transportSafe: true, socketReconnect: false, suppressUserFacingReply: !hasReply, emit: hasReply, blocked: !hasReply };
    out.diagnostics = { ...safeObj(out.diagnostics), transportSafe: true, jsonSanitized: true, suppressedUserFacingReply: !hasReply };
  }
  return out;
}

function isDiagnosticText(value){const t=lower(value);return /marion[_ -]?final[_ -]?envelope[_ -]?missing|final envelope missing|diagnostic packet|non-final|no_final|composer_invalid|composer_reply_missing|final_envelope_unavailable|bridge_error|packet_invalid|contract_invalid/.test(t);} 
function isRogueFallbackText(value){const t=lower(value);if(!t)return false;return /\b(i['’]?m here and tracking the turn|i am here and tracking the turn|nyx is live and tracking the turn|give me the next clear target|send a specific command|press reset|ready\.\s*send|i blocked a repeated fallback|i['’]?m here\.? what's next|i['’]?m here\.? what[’']?s next|i am here\.? what's next|i am here\.? what[’']?s next|holding the thread|tell me what continuity point|technical path confirmed|i['’]?ll inspect the route output|composer reply|final envelope|bridge return shape|state spine mutation|ready for the next test|online\. send next test|still connected\. send the next test)\b/i.test(t);}
function isThinPlaceholderText(value){const t=lower(value);if(!t)return true;if(isDiagnosticText(t)||isRogueFallbackText(t))return true;if(t.length<18)return /^(ready|done|working|ok|okay|yes|no|next|continue|what next|i['’]?m here)$/i.test(t);return /^(i['’]?m here|i am here|still connected|online|ready)\b.*\b(next|test|continue|working on)\b/i.test(t)||/\b(i['’]?ll inspect|i will inspect|i['’]?m holding|i am holding)\b/i.test(t);}
function neutralInterruptedReply(){return "The response path was interrupted before Marion completed the final reply. I’m holding this as a routing fault, not a user-facing emotional answer.";}
function identityAnchorReply(){return "I’m Nyx — the interface you speak with. Marion is the deeper cognitive layer behind me: it reads the intent, tracks context, weighs the domain, and shapes the response I deliver. When you talk to me, you’re interacting with Nyx on the surface and Marion underneath the reasoning.";}
function hotFallbackReply(reason,input={}){const text=lower(extractUserText(input));if(/who are you|what are you|how.*marion.*think|how.*you.*think|marion helps you think|identity|consciousness/.test(text))return identityAnchorReply();if(/bug|error|route|endpoint|index|diag|autopsy|line|loop|widget|frontend|backend|fix|script|file|final envelope|bridge/.test(text))return "I’m tracking the system path. The next move is to verify the normalized input, routed intent, composer output, final envelope creation, and State Spine mutation for this exact turn.";if(/sad|stress|overwhelm|depress|anx|hurt|alone|frustr|panic|grief/.test(text))return "I’m still with you. Let’s stay with the specific pressure instead of circling a generic response. What part of this is pressing hardest right now?";return "The response path was interrupted before Marion completed the final reply. I’m keeping the turn non-emotional and routing it back through the final-envelope path.";}
function createLocalFinalEnvelope({normalized={},routed={},contract={},reason="local_final_fallback",loopGuardResult={}}={}){const routing=safeObj(routed.routing),intent=firstText(routing.intent,contract.intent,"simple_chat"),domain=firstText(routing.domain,contract.domain,normalized.domain,"general");let reply=firstText(extractReply(contract));if(!reply)return buildErrorResult(reason||"local_final_reply_missing",{issues:["local_final_reply_missing"],loopGuard:safeObj(loopGuardResult)},normalized);const memoryPatch=safeObj(contract.memoryPatch);return{ok:true,final:true,handled:true,marionFinal:true,finalEnvelope:{reply,spokenText:firstText(contract.spokenText,reply),intent,domain,turnId:firstText(normalized.turnId),sessionId:firstText(normalized.sessionId),stateStage:firstText(memoryPatch.stateStage,contract.stateStage,"final"),replySignature:firstText(contract.replySignature,memoryPatch.replySignature,hashText(reply)),source:"marionBridge",authority:"marionFinalEnvelope",contractVersion:"nyx.marion.final/1.0",final:true,marionFinal:true},reply,text:reply,answer:reply,output:reply,response:reply,message:reply,spokenText:reply,payload:{reply,text:reply,message:reply,final:true,marionFinal:true},speech:{enabled:safeObj(contract.speech).enabled!==false,silent:false,silentAudio:false,textDisplay:reply,textSpeak:firstText(safeObj(contract.speech).textSpeak,reply),presenceProfile:firstText(safeObj(contract.speech).presenceProfile,"receptive"),nyxStateHint:firstText(safeObj(contract.speech).nyxStateHint,"receptive")},memoryPatch,bridge:{version:VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,singleContract:true,localFinalFallback:true},routed,diagnostics:{bridgeVersion:VERSION,routerCalled:true,composerCalled:!!Object.keys(safeObj(contract)).length,composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,dependencies:DEPENDENCY_STATUS,loopGuardCalled:!!loopGuardMod,loopGuard:safeObj(loopGuardResult),singleContract:true,zeroLoopSurface:true,localFinalFallback:true,reason},meta:{version:VERSION,bridgeVersion:VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,replyAuthority:"marionFinalEnvelope",semanticAuthority:"composeMarionResponse",composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopePresent:true,zeroLoopSurface:true,localFinalFallback:true,reason}};}
function extractUserText(input={}){const src=safeObj(input),body=safeObj(src.body),payload=safeObj(src.payload),packet=safeObj(src.packet),synthesis=safeObj(packet.synthesis);return firstText(src.userQuery,src.text,src.query,src.message,body.userQuery,body.text,body.query,body.message,payload.userQuery,payload.text,payload.query,payload.message,synthesis.userQuery,synthesis.text);}
function extractLane(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return firstText(src.lane,src.sessionLane,body.lane,body.sessionLane,session.lane,meta.lane,"general")||"general";}
function extractTurnId(input={}){const src=safeObj(input),body=safeObj(src.body),meta=safeObj(src.meta||body.meta);return firstText(src.turnId,src.requestId,src.traceId,src.id,body.turnId,body.requestId,body.traceId,meta.turnId,meta.requestId,meta.traceId);}
function extractPreviousMemory(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return safeObj(src.previousMemory||src.turnMemory||src.memory||body.previousMemory||body.turnMemory||body.memory||session.previousMemory||session.turnMemory||session.memory||meta.previousMemory||{});}
function extractMarionIntentPacket(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return safeObj(src.marionIntent||src.intentPacket||body.marionIntent||body.intentPacket||session.marionIntent||meta.marionIntent||{});}
function extractRequestedDomain(input={}){const src=safeObj(input),body=safeObj(src.body),meta=safeObj(src.meta||body.meta),packet=safeObj(src.packet),routing=safeObj(packet.routing);return firstText(src.requestedDomain,src.domain,body.requestedDomain,body.domain,meta.requestedDomain,meta.domain,meta.preferredDomain,routing.domain,"general")||"general";}
function normalizeInbound(input={}){let source=safeObj(input),commandPacket={};if(commandNormalizerMod&&typeof commandNormalizerMod.normalizeCommand==="function"){try{commandPacket=safeObj(commandNormalizerMod.normalizeCommand(source));if(commandPacket.userText||commandPacket.text){source={...source,text:firstText(commandPacket.userText,commandPacket.text,source.text,source.userQuery),userQuery:firstText(commandPacket.userText,commandPacket.text,source.userQuery,source.text),query:firstText(commandPacket.userText,commandPacket.text,source.query,source.text),sessionId:firstText(commandPacket.sessionId,source.sessionId),state:safeObj(commandPacket.state||source.state),commandPacket};}}catch(err){commandPacket={ok:false,error:safeStr(err&&(err.message||err)||"command_normalizer_failed")};}}const userQuery=extractUserText(source),issues=[];if(!userQuery)issues.push("user_query_missing");return{ok:issues.length===0,issues,original:source,commandPacket,userQuery,text:userQuery,query:userQuery,lane:extractLane(source),requestedDomain:extractRequestedDomain(source),domain:extractRequestedDomain(source),previousMemory:extractPreviousMemory(source),marionIntent:extractMarionIntentPacket(source),turnId:extractTurnId(source)||`marion_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,sessionId:firstText(source.sessionId,source.body&&source.body.sessionId,source.meta&&source.meta.sessionId,"public")||"public"};}
function fallbackRoute(normalized){const text=lower(normalized.userQuery);let intent="simple_chat";if(/who are you|what are you|how.*marion.*think|how.*you.*think|marion helps you think|identity|consciousness/i.test(text))intent="identity_query";else if(/bug|error|route|endpoint|index|diag|autopsy|line|loop|widget|frontend|backend|fix|script|file/i.test(text))intent="technical_debug";else if(/sad|stress|overwhelm|depress|anx|hurt|alone|frustr|panic|grief/i.test(text))intent="emotional_support";else if(/price|sponsor|media|monet|pitch|fund|invest|sales|proposal/i.test(text))intent="business_strategy";else if(/top 10|song|artist|album|chart|music|radio|playlist/i.test(text))intent="music_query";else if(/news|story|headline|article|rss|newscanada/i.test(text))intent="news_query";else if(/roku|tv app|channel|linear tv|stream/i.test(text))intent="roku_query";else if(/remember|last time|continue|state spine|memory/i.test(text))intent="identity_or_memory";const domainMap={simple_chat:"general",technical_debug:"technical",emotional_support:"emotional",business_strategy:"business",music_query:"music",news_query:"news",roku_query:"roku",identity_query:"identity",identity_or_memory:"memory"};return{ok:true,marionIntent:{activate:intent!=="simple_chat",intent,confidence:intent==="simple_chat"?0.4:0.7,source:"bridge_fallback_router"},routing:{domain:domainMap[intent]||"general",intent,lane:normalized.lane,endpoint:CANONICAL_ENDPOINT,mode:"balanced",depth:"balanced"},routerVersion:"bridge_fallback_router/1.0"};}
function validateRouterResult(result={}){const src=safeObj(result),routing=safeObj(src.routing),marionIntent=safeObj(src.marionIntent),issues=[];if(src.ok===false)issues.push("router_not_ok");if(!safeStr(routing.intent||marionIntent.intent))issues.push("intent_missing");if(!safeStr(routing.domain))issues.push("domain_missing");return{ok:issues.length===0,issues};}
function extractReply(contract={}){const src=safeObj(contract),finalEnvelope=safeObj(src.finalEnvelope),payload=safeObj(src.payload),synthesis=safeObj(src.synthesis),packet=safeObj(src.packet),packetSynthesis=safeObj(packet.synthesis);const reply=firstText(finalEnvelope.reply,finalEnvelope.text,finalEnvelope.spokenText,src.reply,src.text,src.answer,src.output,src.response,src.message,src.spokenText,payload.reply,payload.text,payload.answer,payload.output,payload.message,synthesis.reply,synthesis.text,synthesis.answer,synthesis.output,synthesis.spokenText,packetSynthesis.reply,packetSynthesis.text,packetSynthesis.answer,packetSynthesis.output,packetSynthesis.spokenText);return isThinPlaceholderText(reply)?"":reply;}
function validateComposeResult(contract={}){const issues=[],src=safeObj(contract),rawReply=firstText(safeObj(src.finalEnvelope).reply,src.reply,src.text,src.answer,src.output,src.response,src.message,src.spokenText,safeObj(src.payload).reply,safeObj(src.synthesis).reply,safeObj(safeObj(src.packet).synthesis).reply);if(!Object.keys(src).length)issues.push("compose_contract_missing");if(src.ok===false)issues.push("compose_not_ok");if(!extractReply(src))issues.push(isThinPlaceholderText(rawReply)?"compose_placeholder_reply":"compose_reply_missing");return{ok:issues.length===0,issues};}
function buildErrorResult(reason,detail={},input={}){const normalized=safeObj(input);return{ok:false,final:false,handled:true,marionFinal:false,awaitingMarion:true,terminal:false,suppressUserFacingReply:true,emit:false,blocked:true,error:safeStr(reason||"bridge_error")||"bridge_error",reason:safeStr(reason||"bridge_error")||"bridge_error",detail:safeObj(detail),reply:"",text:"",output:"",response:"",message:"",payload:{reply:"",text:"",message:"",final:false,awaitingMarion:true,error:true,suppressUserFacingReply:true,emit:false,blocked:true},diagnostics:{bridgeVersion:VERSION,bridgeError:true,noUserFacingBridgeError:true,suppressUserFacingReply:true,emit:false,blocked:true,reason:safeStr(reason||"bridge_error"),detail:safeObj(detail)},meta:{version:VERSION,endpoint:CANONICAL_ENDPOINT,turnId:safeStr(normalized.turnId||""),final:false,marionFinal:false,awaitingMarion:true,suppressUserFacingReply:true,emit:false,blocked:true,replyAuthority:"none",reason:safeStr(reason||"bridge_error")}};}

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
    confidence: Number.isFinite(Number(emotion.confidence))?Number(emotion.confidence):0,
    intensity: Number.isFinite(Number(emotion.intensity))?Number(emotion.intensity):0,
    suppression_signal: safeStr(nuance.suppression_signal||""),
    risk_flags: safeArray(nuance.risk_flags||guard.detected_flags).slice(0,10),
    action_mode: safeStr(guard.action_mode||"supportive_monitoring"),
    care_mode: safeStr(safeObj(state.psychology).care_mode||""),
    timing_profile: safeObj(support.timing_profile),
    state_drift: {
      trend: safeStr(drift.trend||""),
      stability: Number.isFinite(Number(drift.stability))?Number(drift.stability):0,
      volatility: Number.isFinite(Number(drift.volatility))?Number(drift.volatility):0,
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
async function processWithMarionUnsafe(input={}){
  const normalized=normalizeInbound(input);
  if(!normalized.ok)return buildErrorResult("input_invalid",{issues:normalized.issues},normalized);
  if(typeof composeMarionResponse!=="function")return buildErrorResult("composer_unavailable",{dependencyStatus:DEPENDENCY_STATUS.composer,hardFailure:true},normalized);
  const resolvedEmotionPacket=resolveEmotionForTurn(normalized);
  let routed=null;
  if(typeof routeMarionIntent==="function"){try{routed=await Promise.resolve(routeMarionIntent({text:normalized.userQuery,query:normalized.userQuery,userQuery:normalized.userQuery,lane:normalized.lane,requestedDomain:normalized.requestedDomain,domain:normalized.domain,marionIntent:normalized.marionIntent,previousMemory:normalized.previousMemory,session:{lane:normalized.lane,previousMemory:normalized.previousMemory,marionIntent:normalized.marionIntent},turnId:normalized.turnId,resolvedEmotion:safeObj(resolvedEmotionPacket.state),emotionRuntime:safeObj(resolvedEmotionPacket)}));}catch(_){routed=null;}}
  if(!validateRouterResult(routed).ok)routed=fallbackRoute(normalized);
  const composeInput=normalizeComposeInput(normalized,routed,resolvedEmotionPacket);
  let contract={};
  try{contract=await Promise.resolve(composeMarionResponse({...safeObj(routed),primaryDomain:safeStr(safeObj(routed.routing).domain||composeInput.domain),domain:safeStr(safeObj(routed.routing).domain||composeInput.domain),intent:safeStr(safeObj(routed.routing).intent||composeInput.intent),routing:safeObj(routed.routing),marionIntent:safeObj(routed.marionIntent)},composeInput));}
  catch(err){return buildErrorResult("composer_exception",{message:safeStr(err&&(err.message||err)||""),routed:safeObj(routed)},normalized);}
  let composeValidation=validateComposeResult(contract);
  if(!composeValidation.ok)return buildErrorResult("composer_invalid",{issues:composeValidation.issues,composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,rawPreview:safeStr(firstText(safeObj(contract).reply,safeObj(contract).text,safeObj(contract).message)).slice(0,180)},normalized);
  contract=mergeEmotionIntoContract(contract,resolvedEmotionPacket);
  let reply=extractReply(contract),loopGuardResult={ok:true,loopDetected:false,allowReply:true,forceRecovery:false,reasons:[]};
  if(loopGuardMod&&typeof loopGuardMod.applyLoopGuard==="function"){try{loopGuardResult=safeObj(loopGuardMod.applyLoopGuard({...composeInput,state:{...safeObj(composeInput.conversationState),...safeObj(normalized.commandPacket&&normalized.commandPacket.state),lastAssistantReply:safeStr(safeObj(composeInput.conversationState).lastAssistantReply||safeObj(normalized.commandPacket&&normalized.commandPacket.state).lastAssistantReply),loopCount:Number(safeObj(composeInput.conversationState).loopCount||safeObj(normalized.commandPacket&&normalized.commandPacket.state).loopCount||0)}},reply));if(loopGuardResult.forceRecovery){const recoveryContract=await Promise.resolve(composeMarionResponse({...safeObj(routed),forceRecovery:true,recoveryRequired:true,loopGuard:loopGuardResult,lastLoopReasons:safeArray(loopGuardResult.reasons)},{...composeInput,forceRecovery:true,recoveryRequired:true,loopGuard:loopGuardResult,lastLoopReasons:safeArray(loopGuardResult.reasons),state:{...safeObj(composeInput.conversationState),stateStage:"recover",recoveryRequired:true,loopCount:Number(safeObj(composeInput.conversationState).loopCount||0)+1,lastLoopReasons:safeArray(loopGuardResult.reasons)}}));const rv=validateComposeResult(recoveryContract);if(!rv.ok)return buildErrorResult("loop_recovery_invalid",{issues:rv.issues,loopGuard:loopGuardResult},normalized);contract=mergeEmotionIntoContract(recoveryContract,resolvedEmotionPacket);reply=extractReply(contract);}}catch(err){loopGuardResult={ok:false,loopDetected:false,allowReply:true,forceRecovery:false,reasons:["loop_guard_error"],detail:safeStr(err&&(err.message||err)||"")};}}
  if(!reply||isThinPlaceholderText(reply))return buildErrorResult("final_reply_rejected",{reason:"thin_or_placeholder_reply",loopGuard:loopGuardResult},normalized);
  return wrapFinal({normalized,routed,contract,loopGuardResult,resolvedEmotionPacket});
}
async function processWithMarion(input = {}) {
  try {
    const packet = await processWithMarionUnsafe(input);
    return packet && packet.ok === false ? transportSafeError(packet) : transportSafePacket(packet);
  } catch (err) {
    return transportSafeError(buildErrorResult("bridge_transport_exception", { message: safeStr(err && (err.message || err) || "") }, normalizeInbound(input)));
  }
}
async function maybeResolve(input={}){return processWithMarion(input);}
async function ask(input={}){return processWithMarion(input);}
async function handle(input={}){return processWithMarion(input);}
async function route(input={}){return processWithMarion(input);}
async function retrieveLayer2Signals(input={}){const normalized=normalizeInbound(input);if(!normalized.ok)return{ok:false,issues:normalized.issues,userQuery:normalized.userQuery,diagnostics:{bridgeVersion:VERSION}};const routed=fallbackRoute(normalized);return{ok:true,userQuery:normalized.userQuery,routed,diagnostics:{bridgeVersion:VERSION,noLegacyRetrievers:true}};}
function createMarionBridge(){return{maybeResolve,ask,handle,route,processWithMarion,retrieveLayer2Signals};}
module.exports={VERSION,CANONICAL_ENDPOINT,DEPENDENCY_STATUS,retrieveLayer2Signals,processWithMarion,createMarionBridge,route,maybeResolve,ask,handle,default:processWithMarion,_internal:{normalizeInbound,fallbackRoute,validateRouterResult,extractReply,validateComposeResult,wrapFinal,buildErrorResult,createLocalFinalEnvelope,hotFallbackReply,identityAnchorReply,isDiagnosticText,isThinPlaceholderText,DEPENDENCY_STATUS,COMPOSER_REQUIRE_CANDIDATES,resolveEmotionForTurn,emotionSummary,mergeEmotionIntoContract,jsonSafe,transportSafePacket,transportSafeError,compactPatchForTransport,compactResolvedEmotion}};
