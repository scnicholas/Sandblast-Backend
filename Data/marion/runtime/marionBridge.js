"use strict";

const VERSION = "marionBridge v7.6.3 OUTER-SCHEDULER-BYPASS-COMPAT + TECHNICAL-TARGET-LOCK + FALLBACK-KNOWLEDGE-DOMAIN-ROUTE-FIX + FINAL-RUNTIME-TELEMETRY + FIVE-TURN-CONTINUITY-PARITY-BRIDGE + FINAL-AUTHORITY-STATE-CREATIVE-COMPAT-HARDENED";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";
const WARM_NYX_GREETING = "Hi. I’m Nyx. It’s good to see you. What would you like to work on?";
const WARM_NYX_STATUS_REPLY = "I’m doing well, thank you. I’m ready to help. What would you like to work on today?";
const WARM_NYX_CAPABILITY_REPLY = "I can help with chat, media, radio, News Canada, Roku, avatar controls, and backend diagnostics. Tell me where you’d like to start.";
const FINAL_ENVELOPE_CONTRACT = "nyx.marion.final/1.0";
const FINAL_SIGNATURE = "MARION_FINAL_AUTHORITY";
const MARION_FINAL_SIGNATURE_PREFIX = "MARION::FINAL::";
const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const REQUIRED_CHAT_ENGINE_SIGNATURE = "CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24";
const PIPELINE_FORENSIC_NORMALIZATION_VERSION = "pipeline.forensicNormalization/1.0";
const FINAL_RUNTIME_TELEMETRY_VERSION = "nyx.marion.finalRuntimeTelemetry/1.0";

const fs = require("fs");
const path = require("path");

function tryRequireMany(paths){for(const p of Array.isArray(paths)?paths:[]){try{const resolved=require.resolve(p);const mod=require(resolved);if(mod)return{mod,resolvedPath:resolved,requested:p,ok:true};}catch(err){}}return{mod:null,resolvedPath:"",requested:"",ok:false};}
function dependencyStatus(name,loaded){const item=loaded&&typeof loaded==="object"?loaded:{};return{name,ok:!!item.mod,requested:item.requested||"",resolvedPath:item.resolvedPath||"",exists:item.resolvedPath?fs.existsSync(item.resolvedPath):false};}

const COMPOSER_REQUIRE_CANDIDATES = Object.freeze([
  path.join(__dirname,"composeMarionResponse.js"),
  path.join(__dirname,"Data","marion","runtime","composeMarionResponse.js"),
  path.join(process.cwd(),"Data","marion","runtime","composeMarionResponse.js"),
  "./composeMarionResponse.js",
  "./composeMarionResponse",
  "./Data/marion/runtime/composeMarionResponse.js",
  "./Data/marion/runtime/composeMarionResponse",
  "./Data/marion/composeMarionResponse.js",
  "./Data/marion/composeMarionResponse"
]);
const finalEnvelopeLoaded=tryRequireMany(["./marionFinalEnvelope.js","./marionFinalEnvelope","./Data/marion/runtime/marionFinalEnvelope.js","./Data/marion/runtime/marionFinalEnvelope","./utils/marionFinalEnvelope.js","./utils/marionFinalEnvelope"]);
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
  composerPreferred: path.resolve(__dirname,"composeMarionResponse.js"),
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

function buildBridgeRuntimeTelemetry({source="marionBridge",normalized={},routed={},contract={},reply="",finalEnvelopeTrusted=false,canEmit=true,error="",loopGuardResult={},resolvedEmotionPacket={}}={}){
  const n=safeObj(normalized), route=safeObj(safeObj(routed).routing), c=safeObj(contract), meta=safeObj(c.meta), diag=safeObj(c.diagnostics);
  return {
    version: FINAL_RUNTIME_TELEMETRY_VERSION,
    source,
    stage: canEmit ? "final" : "awaiting_marion",
    endpoint: CANONICAL_ENDPOINT,
    finalAuthority: "marionFinalEnvelope",
    replyAuthority: canEmit ? "marionBridge" : "none",
    semanticAuthority: "composeMarionResponse",
    canEmit: !!canEmit,
    error: safeStr(error),
    turnId: safeStr(n.turnId||c.turnId||meta.turnId),
    sessionId: safeStr(n.sessionId||c.sessionId),
    inputSource: canonicalInputSource(n),
    intent: firstText(route.intent,c.intent,"simple_chat"),
    domain: firstText(route.domain,c.domain,n.domain,"general"),
    replySignature: reply ? hashText(reply) : firstText(c.replySignature,safeObj(c.memoryPatch).replySignature,""),
    composerVersion: firstText(c.version,c.composerVersion,meta.composerVersion,diag.composerVersion,""),
    bridgeVersion: VERSION,
    dependencies: DEPENDENCY_STATUS,
    loopGuard: { called: !!loopGuardMod, forceRecovery: !!safeObj(loopGuardResult).forceRecovery, loopDetected: !!safeObj(loopGuardResult).loopDetected },
    emotionRuntime: { called: !!Object.keys(safeObj(resolvedEmotionPacket)).length, ok: safeObj(resolvedEmotionPacket).ok !== false },
    finalEnvelopeTrusted: !!finalEnvelopeTrusted,
    hardlockCompatible: !!canEmit,
    updatedAt: Date.now()
  };
}


function canonicalInputSource(input={}){const src=safeObj(input),payload=safeObj(src.payload),body=safeObj(src.body),session=safeObj(src.session),ui=safeObj(src.ui),client=safeObj(src.client);const raw=lower(firstText(src.inputSource,src.source,src.triggerSource,src.modality,payload.inputSource,payload.source,body.inputSource,body.source,session.inputSource,session.source,ui.inputSource,ui.source,client.inputSource,client.source,"text"));return /^(voice|mic|microphone|speech|spoken|audio)$/.test(raw)?"voice":"text";}
function normalizeParityText(value=""){return safeStr(value).replace(/\b(nick\.?s|nickster|nick|nix|mix|mike)\b/gi,"Nyx").replace(/\bapi\b/gi,"API").replace(/\bui\b/gi,"UI").replace(/\burl\b/gi,"URL").replace(/\s+/g," ").trim();}
function buildContinuityTurnKey(text,sessionId,turnId){return hashText([normalizeParityText(text),safeStr(sessionId),safeStr(turnId)].join("|"));}

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


function canonicalTechnicalTargetFromText(text=""){
  const t=safeStr(text);
  const mk=(targetKey,targetName,targetFile,targetPath,layer,validation)=>({version:"nyx.marion.technicalTargetLock/1.0",targetKey,targetName,targetFile,targetPath,layer,validation,explicit:true,source:"current_user_text",locked:true});
  const checks=[
    [/\b(chat\s*engine|chatengine)\b/i,()=>mk("chatengine","ChatEngine","chatEngine.js","Utils/chatEngine.js","coordinator/final-trust gate","node --check Utils/chatEngine.js")],
    [/\b(compose\s*marion\s*response|composemarionresponse|composer)\b/i,()=>mk("composeMarionResponse","ComposeMarionResponse","composeMarionResponse.js","Data/marion/runtime/composeMarionResponse.js","composer/reply shaping","node --check Data/marion/runtime/composeMarionResponse.js")],
    [/\b(marion\s*bridge|marionbridge)\b/i,()=>mk("marionBridge","MarionBridge","marionBridge.js","Data/marion/runtime/marionBridge.js","bridge/handoff authority","node --check Data/marion/runtime/marionBridge.js")],
    [/\b(state\s*spine|statespine|state-spine)\b/i,()=>mk("stateSpine","StateSpine","stateSpine.js","Utils/stateSpine.js","continuity/state carry","node --check Utils/stateSpine.js")],
    [/\b(marion\s*intent\s*router|intent\s*router|marionintentrouter)\b/i,()=>mk("marionIntentRouter","MarionIntentRouter","marionIntentRouter.js","Data/marion/runtime/marionIntentRouter.js","intent routing","node --check Data/marion/runtime/marionIntentRouter.js")],
    [/\b(command\s*normalizer|marion\s*command\s*normalizer|marioncommandnormalizer)\b/i,()=>mk("marionCommandNormalizer","MarionCommandNormalizer","marionCommandNormalizer.js","Data/marion/runtime/marionCommandNormalizer.js","normalizer/packet stability","node --check Data/marion/runtime/marionCommandNormalizer.js")],
    [/\b(domain\s*router|domainrouter)\b/i,()=>mk("domainRouter","DomainRouter","domainRouter.js","Utils/domainRouter.js","knowledge-domain routing","node --check Utils/domainRouter.js")],
    [/\b(marion\s*domain\s*registry|domain\s*registry|mariondomainregistry)\b/i,()=>mk("marionDomainRegistry","MarionDomainRegistry","marionDomainRegistry.js","Data/marion/runtime/marionDomainRegistry.js","domain registry","node --check Data/marion/runtime/marionDomainRegistry.js")],
    [/\b(index\.js|index\s*js|server\s*route|api\/chat|\/api\/chat)\b/i,()=>mk("index","index.js","index.js","index.js","outer transport/API route","node --check index.js")]
  ];
  for(const [rx,build] of checks){if(rx.test(t))return build();}
  return null;
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

function compactCreativeCognitiveCarry(value = {}) {
  const source = safeObj(value);
  if (!Object.keys(source).length) return {};
  const active = !!(source.active || source.enabled || source.present || source.carryActive);
  const suggestions = safeArray(source.suggestions || source.suggestionQueue || source.items)
    .map((item) => isObj(item) ? {
      type: safeStr(item.type || item.kind || "suggestion"),
      label: safeStr(item.label || item.title || item.name || ""),
      text: safeStr(item.text || item.suggestion || item.value || "").slice(0, 360),
      confidence: Number.isFinite(Number(item.confidence)) ? Math.max(0, Math.min(1, Number(item.confidence))) : undefined
    } : { type: "suggestion", label: "", text: safeStr(item).slice(0, 360) })
    .filter((item) => item.text || item.label)
    .slice(0, 4);
  return {
    active,
    mode: safeStr(source.mode || source.layerMode || source.profile || "controlled"),
    carryDepth: Math.max(0, Math.min(12, Number(source.carryDepth || source.depth || 0) || 0)),
    lastIntent: safeStr(source.lastIntent || source.intent || ""),
    lastTopic: safeStr(source.lastTopic || source.topic || "").slice(0, 180),
    suppression: !!(source.suppression || source.suppressed || source.suppress),
    suggestions
  };
}

function compactPatchForTransport(patch = {}) {
  const out = jsonSafe(safeObj(patch)) || {};
  const technicalTargetLock = safeObj(out.technicalTargetLock || safeObj(out.stateBridge).technicalTargetLock);
  const emotion = compactResolvedEmotion(out.resolvedEmotion || out.emotionState || out.lastEmotionState);
  if (Object.keys(emotion).length) {
    out.resolvedEmotion = emotion;
    out.emotionState = emotion;
    out.lastEmotionState = emotion;
  }
  const creativeCarry = compactCreativeCognitiveCarry(out.creativeCognitiveCarry || out.creativeSuggestionState || out.cognitiveCarry || out.creativeCarry);
  if (Object.keys(creativeCarry).length) {
    out.creativeCognitiveCarry = creativeCarry;
    delete out.creativeSuggestionState;
    delete out.cognitiveCarry;
    delete out.creativeCarry;
  }
  const stateBridge = safeObj(out.stateBridge);
  if (Object.keys(stateBridge).length) {
    out.stateBridge = {
      schema: safeStr(stateBridge.schema || stateBridge.stateSpineSchema || STATE_SPINE_SCHEMA),
      shouldAdvanceState: !!stateBridge.shouldAdvanceState,
      composedOnce: !!stateBridge.composedOnce,
      finalEnvelopeTrusted: !!stateBridge.finalEnvelopeTrusted,
      stateStage: safeStr(stateBridge.stateStage || stateBridge.stage || ""),
      carryDepth: Math.max(0, Math.min(12, Number(stateBridge.carryDepth || 0) || 0)),
      technicalTargetLock
    };
  }
  return out;
}

function signatureLooksTrusted(signature) {
  const sig = safeStr(signature);
  if (!sig) return false;
  if (sig === FINAL_SIGNATURE) return true;
  return !!(
    sig.indexOf(MARION_FINAL_SIGNATURE_PREFIX) === 0 &&
    sig.indexOf(REQUIRED_CHAT_ENGINE_SIGNATURE) !== -1 &&
    (sig.indexOf(STATE_SPINE_SCHEMA) !== -1 || sig.indexOf(STATE_SPINE_SCHEMA_COMPAT) !== -1 || /nyx\.marion\.stateSpine\/[0-9.]+/i.test(sig))
  );
}

function hasTrustedBridgeFinalPacket(packet = {}) {
  const p = safeObj(packet);
  const envelope = safeObj(p.finalEnvelope);
  const payload = safeObj(p.payload);
  const meta = safeObj(p.meta);
  const signature = firstText(p.marionFinalSignature, p.finalSignature, p.signature, envelope.marionFinalSignature, envelope.finalSignature, envelope.signature, meta.marionFinalSignature, meta.finalSignature, meta.signature);
  const contractOk = firstText(envelope.contractVersion, p.contractVersion, payload.contractVersion) === FINAL_ENVELOPE_CONTRACT;
  const finalOk = !!(p.final === true || p.marionFinal === true || envelope.final === true || envelope.marionFinal === true || payload.final === true || payload.marionFinal === true);
  const authority = lower(envelope.authority || envelope.replyAuthority || meta.replyAuthority || p.replyAuthority || "");
  const source = lower(envelope.source || meta.source || p.source || "");
  const authorityOk = authority === "marionfinalenvelope" || source === "marion" || source === "composemarionresponse" || source === "marionbridge";
  const trustFlag = !!(p.trustedTransport || p.hardlockCompatible || p.singleFinalAuthority || meta.trustedTransport || meta.hardlockCompatible || meta.singleFinalAuthority || envelope.trustedTransport || envelope.singleFinalAuthority);
  return !!(finalOk && !hasFinalFailureShape(p) && (signatureLooksTrusted(signature) || (contractOk && authorityOk) || trustFlag));
}

function hasFinalFailureShape(value, depth = 0) {
  if (depth > 8 || value == null) return false;
  if (Array.isArray(value)) return value.some((item) => hasFinalFailureShape(item, depth + 1));
  if (!isObj(value)) return false;
  const status = lower(value.reason || value.error || value.code || value.status || "");
  const completion = safeObj(value.completionStatus);
  if (value.requiresRetry === true || value.recoverySuggested === true || value.error === true) return true;
  if (completion.requiresRetry === true || completion.recoverySuggested === true || completion.complete === false) return true;
  if (/composer_invalid|composer_reply_missing|final_envelope_missing|final_envelope_invalid|bridge_error|not_final|missing_reply|requires_retry/.test(status)) return true;
  return Object.keys(value).some((key) => hasFinalFailureShape(value[key], depth + 1));
}

function transportSafePacket(packet = {}) {
  const out = jsonSafe(packet);
  if (!isObj(out)) return out;
  const reply = extractReply(out) || safeStr(safeObj(out.finalEnvelope).reply);
  const trustedFinal = hasTrustedBridgeFinalPacket(out);
  const hasReply = !!reply && trustedFinal && !isThinPlaceholderText(reply) && !isDiagnosticText(reply);
  if (hasReply) {
    out.reply = reply; out.text = reply; out.answer = reply; out.output = reply; out.response = reply; out.message = reply; out.spokenText = safeStr(out.spokenText || reply);
    out.payload = { ...safeObj(out.payload), reply, text: reply, message: reply, answer: reply, output: reply, response: reply, final: true, marionFinal: true, awaitingMarion: false, suppressUserFacingReply: false, emit: true, blocked: false };
  } else {
    out.reply = ""; out.text = ""; out.answer = ""; out.output = ""; out.response = ""; out.message = "";
    out.payload = { ...safeObj(out.payload), reply: "", text: "", message: "", answer: "", output: "", response: "", final: false, marionFinal: false, awaitingMarion: true, suppressUserFacingReply: true, emit: false, blocked: true };
  }
  out.ok = hasReply && out.ok !== false; out.final = !!hasReply; out.marionFinal = !!hasReply; out.handled = true; out.awaitingMarion = !hasReply; out.terminal = hasReply ? out.terminal : false; out.suppressUserFacingReply = !hasReply; out.emit = hasReply; out.blocked = !hasReply; out.transportSafe = true; out.socketReconnect = false;
  if (out.memoryPatch) out.memoryPatch = compactPatchForTransport(out.memoryPatch); if (out.sessionPatch) out.sessionPatch = compactPatchForTransport(out.sessionPatch); if (out.payload && out.payload.memoryPatch) out.payload.memoryPatch = compactPatchForTransport(out.payload.memoryPatch); if (out.payload && out.payload.sessionPatch) out.payload.sessionPatch = compactPatchForTransport(out.payload.sessionPatch);
  out.finalEnvelope = { ...safeObj(out.finalEnvelope), reply: hasReply ? reply : "", spokenText: hasReply ? safeStr(safeObj(out.finalEnvelope).spokenText || out.spokenText || reply) : "", final: hasReply, marionFinal: hasReply, handled: true, contractVersion: safeStr(safeObj(out.finalEnvelope).contractVersion || FINAL_ENVELOPE_CONTRACT), qualityPass: hasReply, responseDepthShaped: hasReply };
  out.meta = { ...safeObj(out.meta), transportSafe: true, socketReconnect: false, emitOrder: "finalEnvelope:beforeSessionPatch", finalDeliveryTiming: "single_terminal_packet", conversationQualityGate: true, responseDepthShaped: hasReply, trustedFinalEnvelope: trustedFinal, suppressUserFacingReply: !hasReply, emit: hasReply, blocked: !hasReply };
  out.diagnostics = { ...safeObj(out.diagnostics), transportSafe: true, jsonSanitized: true, finalDeliveryTiming: "single_terminal_packet", trustedFinalEnvelope: trustedFinal, suppressedUserFacingReply: !hasReply };
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
function isRogueFallbackText(value){const t=lower(value);if(!t)return false;return /\b(i['’]?m here and tracking the turn|i am here and tracking the turn|nyx is live and tracking the turn|give me the next clear target|send a specific command|press reset|ready\.\s*send|i blocked a repeated fallback|i['’]?m here\.?\s*what[’']?s next|i am here\.?\s*what[’']?s next|i['’]?m online\.?\s*what[’']?s next|i am online\.?\s*what[’']?s next|i['’]?m here,?\s*fully online\.?\s*what are we working on|hi\s*[—-]\s*i['’]?m here|fully online.*what are we working on|i['’]?m holding the thread\.\s*tell me what continuity point|technical path confirmed\.\s*i['’]?ll inspect the route output, composer reply, final envelope, bridge return shape, and state spine mutation|ready for the next test|online\. send next test|still connected\. send the next test)\b/i.test(t);}
function isThinPlaceholderText(value){const t=lower(value);if(!t)return true;if(isDiagnosticText(t)||isRogueFallbackText(t))return true;if(t.length<18)return /^(ready|done|working|ok|okay|yes|no|next|continue|what next|i['’]?m here)$/i.test(t);return /^(i['’]?m here|i am here|i['’]?m online|i am online|still connected|online|ready)\b.*\b(next|test|continue|working on)\b/i.test(t)||/\b(i['’]?ll inspect|i will inspect|i['’]?m holding|i am holding)\b/i.test(t);}
function neutralInterruptedReply(){return "";}
function identityAnchorReply(){return "";}
function hotFallbackReply(_reason,_input={}){return "";}
function createLocalFinalEnvelope({normalized={},routed={},contract={},reason="local_final_fallback",loopGuardResult={}}={}){const routing=safeObj(routed.routing),intent=firstText(routing.intent,contract.intent,"simple_chat"),domain=firstText(routing.domain,contract.domain,normalized.domain,"general");let reply=firstText(extractReply(contract));if(!reply||isThinPlaceholderText(reply)||isDiagnosticText(reply))return buildErrorResult(reason||"local_final_reply_missing",{issues:["local_final_reply_missing"],loopGuard:safeObj(loopGuardResult)},normalized);const memoryPatch=safeObj(contract.memoryPatch);const runtimeTelemetry=buildBridgeRuntimeTelemetry({source:"marionBridge.createLocalFinalEnvelope",normalized,routed,contract,reply,finalEnvelopeTrusted:true,canEmit:true,error:reason,loopGuardResult});return{ok:true,final:true,handled:true,marionFinal:true,awaitingMarion:false,suppressUserFacingReply:false,emit:true,blocked:false,finalEnvelope:{reply,spokenText:firstText(contract.spokenText,reply),intent,domain,turnId:firstText(normalized.turnId),sessionId:firstText(normalized.sessionId),stateStage:firstText(memoryPatch.stateStage,contract.stateStage,"final"),replySignature:firstText(contract.replySignature,memoryPatch.replySignature,hashText(reply)),source:"marionBridge",authority:"marionFinalEnvelope",contractVersion:FINAL_ENVELOPE_CONTRACT,signature:FINAL_SIGNATURE,source:"marionBridge",singleFinalAuthority:true,final:true,marionFinal:true,runtimeTelemetry,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION},reply,text:reply,answer:reply,output:reply,response:reply,message:reply,spokenText:reply,payload:{reply,text:reply,message:reply,answer:reply,output:reply,response:reply,final:true,marionFinal:true,awaitingMarion:false,suppressUserFacingReply:false,emit:true,blocked:false},speech:{enabled:safeObj(contract.speech).enabled!==false,silent:false,silentAudio:false,textDisplay:reply,textSpeak:firstText(safeObj(contract.speech).textSpeak,reply),presenceProfile:firstText(safeObj(contract.speech).presenceProfile,"receptive"),nyxStateHint:firstText(safeObj(contract.speech).nyxStateHint,"receptive")},memoryPatch,bridge:{version:VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,singleContract:true,localFinalFallback:true},routed,diagnostics:{bridgeVersion:VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,routerCalled:true,composerCalled:!!Object.keys(safeObj(contract)).length,composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,dependencies:DEPENDENCY_STATUS,loopGuardCalled:!!loopGuardMod,loopGuard:safeObj(loopGuardResult),singleContract:true,zeroLoopSurface:true,localFinalFallback:true,reason},meta:{version:VERSION,bridgeVersion:VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,endpoint:CANONICAL_ENDPOINT,usedBridge:true,replyAuthority:"marionFinalEnvelope",semanticAuthority:"composeMarionResponse",composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopePresent:true,zeroLoopSurface:true,localFinalFallback:true,reason}};}
function extractUserText(input={}){const src=safeObj(input),body=safeObj(src.body),payload=safeObj(src.payload),packet=safeObj(src.packet),synthesis=safeObj(packet.synthesis);return firstText(src.userQuery,src.text,src.query,src.message,body.userQuery,body.text,body.query,body.message,payload.userQuery,payload.text,payload.query,payload.message,synthesis.userQuery,synthesis.text);}
function extractLane(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return firstText(src.lane,src.sessionLane,body.lane,body.sessionLane,session.lane,meta.lane,"general")||"general";}
function extractTurnId(input={}){const src=safeObj(input),body=safeObj(src.body),meta=safeObj(src.meta||body.meta);return firstText(src.turnId,src.requestId,src.traceId,src.id,body.turnId,body.requestId,body.traceId,meta.turnId,meta.requestId,meta.traceId);}
function extractPreviousMemory(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return safeObj(src.previousMemory||src.turnMemory||src.memory||body.previousMemory||body.turnMemory||body.memory||session.previousMemory||session.turnMemory||session.memory||meta.previousMemory||{});}
function extractMarionIntentPacket(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return safeObj(src.marionIntent||src.intentPacket||body.marionIntent||body.intentPacket||session.marionIntent||meta.marionIntent||{});}
function extractRequestedDomain(input={}){const src=safeObj(input),body=safeObj(src.body),meta=safeObj(src.meta||body.meta),packet=safeObj(src.packet),routing=safeObj(packet.routing);return firstText(src.requestedDomain,src.domain,body.requestedDomain,body.domain,meta.requestedDomain,meta.domain,meta.preferredDomain,routing.domain,"general")||"general";}
function normalizeInbound(input={}){let source=safeObj(input),commandPacket={};if(commandNormalizerMod&&typeof commandNormalizerMod.normalizeCommand==="function"){try{commandPacket=safeObj(commandNormalizerMod.normalizeCommand(source));if(commandPacket.userText||commandPacket.text){source={...source,text:firstText(commandPacket.userText,commandPacket.text,source.text,source.userQuery),userQuery:firstText(commandPacket.userText,commandPacket.text,source.userQuery,source.text),query:firstText(commandPacket.userText,commandPacket.text,source.query,source.text),sessionId:firstText(commandPacket.sessionId,source.sessionId),state:safeObj(commandPacket.state||source.state),commandPacket};}}catch(err){commandPacket={ok:false,error:safeStr(err&&(err.message||err)||"command_normalizer_failed")};}}const inputSource=canonicalInputSource(source),rawUserQuery=extractUserText(source),userQuery=normalizeParityText(rawUserQuery),technicalTargetLock=canonicalTechnicalTargetFromText(userQuery||rawUserQuery),issues=[];if(!userQuery)issues.push("user_query_missing");const turnId=extractTurnId(source)||`marion_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,sessionId=firstText(source.sessionId,source.body&&source.body.sessionId,source.meta&&source.meta.sessionId,"public")||"public";return{ok:issues.length===0,issues,original:source,commandPacket,userQuery,text:userQuery,query:userQuery,rawUserQuery,inputSource,source:inputSource,voiceTextParity:{active:inputSource==="voice"||rawUserQuery!==userQuery,source:inputSource,normalizedText:userQuery,rawHash:hashText(rawUserQuery),normalizedHash:hashText(userQuery),parityLock:true},technicalTargetLock,targetFile:firstText(safeObj(technicalTargetLock).targetFile,""),targetPath:firstText(safeObj(technicalTargetLock).targetPath,""),targetName:firstText(safeObj(technicalTargetLock).targetName,""),continuityTurnKey:buildContinuityTurnKey(userQuery,sessionId,turnId),lane:extractLane(source),requestedDomain:extractRequestedDomain(source),domain:extractRequestedDomain(source),previousMemory:extractPreviousMemory(source),marionIntent:extractMarionIntentPacket(source),turnId,sessionId};}
function fallbackRoute(normalized){const text=lower(normalized.userQuery),technicalTargetLock=safeObj(normalized.technicalTargetLock||canonicalTechnicalTargetFromText(normalized.userQuery));let intent="simple_chat",knowledgeDomain="";if(/who are you|what are you|how.*marion.*think|how.*you.*think|marion helps you think|identity|consciousness/i.test(text))intent="identity_query";else if(/bug|error|route|endpoint|index|diag|autopsy|line[- ]?by[- ]?line|loop|widget|frontend|backend|fix|script|file|state spine|chatengine|marionbridge|composemarionresponse|final envelope/i.test(text))intent="technical_debug";else if(/sad|stress|overwhelm|depress|anx|hurt|alone|frustr|panic|grief/i.test(text)){intent="emotional_support";knowledgeDomain="psychology";}else if(/rewrite|polish|proofread|grammar|tone|copyedit|wording|professional clarity|business english/i.test(text)){intent="domain_question";knowledgeDomain="english";}else if(/least privilege|mfa|multi[-\s]?factor|iam|identity access|zero trust|incident response|threat model|phishing|ransomware|prompt injection|cyber|cybersecurity|endpoint security|cloud security|network security|data protection|privacy minimization/i.test(text)){intent="domain_question";knowledgeDomain="cyber";}else if(/unit economics|cash flow|runway|margin|ltv|cac|pricing|finance|financial|capital markets|risk model/i.test(text)){intent="domain_question";knowledgeDomain="finance";}else if(/contract consideration|canadian law|legal information|legal advice|case law|statute|jurisdiction|tort|criminal law|charter/i.test(text)){intent="domain_question";knowledgeDomain="law";}else if(/cognitive distortion|emotional regulation|attachment|trauma|psychology|bias|fallacy/i.test(text)){intent="domain_question";knowledgeDomain="psychology";}else if(/rag|llm|embedding|tool routing|ai agent|machine learning|artificial intelligence|orchestration/i.test(text)){intent="domain_question";knowledgeDomain="ai";}else if(/price|sponsor|media|monet|pitch|fund|invest|sales|proposal/i.test(text))intent="business_strategy";else if(/top 10|song|artist|album|chart|music|radio|playlist/i.test(text))intent="music_query";else if(/news|story|headline|article|rss|newscanada/i.test(text))intent="news_query";else if(/roku|tv app|channel|linear tv|stream/i.test(text))intent="roku_query";else if(/remember|last time|continue|state spine|memory/i.test(text))intent="identity_or_memory";const domainMap={simple_chat:"general",technical_debug:"technical",emotional_support:"emotional",business_strategy:"business",music_query:"music",news_query:"news",roku_query:"roku",identity_query:"identity",identity_or_memory:"memory",domain_question:"general_reasoning"};const domain=knowledgeDomain||domainMap[intent]||"general";return{ok:true,marionIntent:{activate:intent!=="simple_chat",intent,confidence:intent==="simple_chat"?0.4:0.82,source:"bridge_fallback_router",technicalTargetLock,knowledgeDomain,knowledgeDomainExplicit:!!knowledgeDomain,knowledgeDomainReason:knowledgeDomain?"bridge_fallback_knowledge_terms":""},routing:{domain,intent,knowledgeDomain,technicalTargetLock,lane:normalized.lane,endpoint:CANONICAL_ENDPOINT,mode:knowledgeDomain?"knowledge_domain":"balanced",depth:knowledgeDomain==="cyber"||knowledgeDomain==="ai"?"forensic":"balanced",domainConfidence:{version:"nyx.marion.domainConfidence/1.1",confidence:knowledgeDomain?0.88:(intent==="simple_chat"?0.4:0.7),band:knowledgeDomain?"medium":"low",routeLocked:!!knowledgeDomain,primaryDomain:domain,knowledgeDomain,reason:knowledgeDomain?"bridge_fallback_knowledge_terms":"bridge_fallback_router"}},routerVersion:"bridge_fallback_router/1.1"};}
function validateRouterResult(result={}){const src=safeObj(result),routing=safeObj(src.routing),marionIntent=safeObj(src.marionIntent),issues=[];if(src.ok===false)issues.push("router_not_ok");if(!safeStr(routing.intent||marionIntent.intent))issues.push("intent_missing");if(!safeStr(routing.domain))issues.push("domain_missing");return{ok:issues.length===0,issues};}
function extractReply(contract={}){const src=safeObj(contract),finalEnvelope=safeObj(src.finalEnvelope),payload=safeObj(src.payload),synthesis=safeObj(src.synthesis),packet=safeObj(src.packet),packetSynthesis=safeObj(packet.synthesis);const reply=firstText(finalEnvelope.reply,finalEnvelope.text,finalEnvelope.spokenText,src.reply,src.text,src.answer,src.output,src.response,src.message,src.spokenText,payload.reply,payload.text,payload.answer,payload.output,payload.message,synthesis.reply,synthesis.text,synthesis.answer,synthesis.output,synthesis.spokenText,packetSynthesis.reply,packetSynthesis.text,packetSynthesis.answer,packetSynthesis.output,packetSynthesis.spokenText);return isThinPlaceholderText(reply)?"":reply;}
function validateComposeResult(contract={}){const issues=[],src=safeObj(contract),rawReply=firstText(safeObj(src.finalEnvelope).reply,src.reply,src.text,src.answer,src.output,src.response,src.message,src.spokenText,safeObj(src.payload).reply,safeObj(src.synthesis).reply,safeObj(safeObj(src.packet).synthesis).reply);if(!Object.keys(src).length)issues.push("compose_contract_missing");if(src.ok===false)issues.push("compose_not_ok");if(!extractReply(src))issues.push(isThinPlaceholderText(rawReply)?"compose_placeholder_reply":"compose_reply_missing");return{ok:issues.length===0,issues};}
function buildErrorResult(reason,detail={},input={}){const normalized=safeObj(input);const runtimeTelemetry=buildBridgeRuntimeTelemetry({source:"marionBridge.buildErrorResult",normalized,reply:"",finalEnvelopeTrusted:false,canEmit:false,error:reason});return{ok:false,final:false,handled:true,marionFinal:false,awaitingMarion:true,terminal:false,suppressUserFacingReply:true,emit:false,blocked:true,error:safeStr(reason||"bridge_error")||"bridge_error",reason:safeStr(reason||"bridge_error")||"bridge_error",detail:safeObj(detail),reply:"",text:"",output:"",response:"",message:"",payload:{reply:"",text:"",message:"",final:false,awaitingMarion:true,error:true,suppressUserFacingReply:true,emit:false,blocked:true},diagnostics:{bridgeVersion:VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,bridgeError:true,noUserFacingBridgeError:true,suppressUserFacingReply:true,emit:false,blocked:true,reason:safeStr(reason||"bridge_error"),detail:safeObj(detail)},meta:{version:VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,endpoint:CANONICAL_ENDPOINT,turnId:safeStr(normalized.turnId||""),final:false,marionFinal:false,awaitingMarion:true,suppressUserFacingReply:true,emit:false,blocked:true,replyAuthority:"none",reason:safeStr(reason||"bridge_error")}};}
function isGreetingOnly(text){const t=lower(text).replace(/[.!?]+$/g,"").trim();return /^(hi|hello|hey|yo|hiya|good morning|good afternoon|good evening)(\s+(nyx|nix|vera))?$/.test(t);}
function isHowAreYouTurn(text){const t=lower(text).replace(/[.!?]+$/g,"").trim();return /^(how are you|how are you today|how are you doing|how are you feeling|you good|are you okay|are you ok)(\s+(nyx|nix|vera))?$/.test(t);}
function isCapabilityQuestion(text){const t=lower(text);return /\b(what can you help with|what do you help with|what areas can you help with|what can you do|help me with|what are your lanes|what domains)\b/i.test(t);}
function isIdentityQuestion(text){const t=lower(text);return /\b(who are you|what are you|what is nyx|who is nyx|what is marion|who is marion|how do you work|how does marion help|how marion helps|marion helps you think)\b/i.test(t);}
function bridgeRecoveryReply(normalized={},routed={},reason="bridge_recovery"){
  const text=safeStr(normalized.userQuery||normalized.text||normalized.query||"");
  const routing=safeObj(routed.routing);
  const intent=safeStr(routing.intent||safeObj(routed.marionIntent).intent||safeObj(normalized.marionIntent).intent||"simple_chat");
  if(isGreetingOnly(text))return WARM_NYX_GREETING;
  if(isHowAreYouTurn(text))return WARM_NYX_STATUS_REPLY;
  if(isCapabilityQuestion(text))return WARM_NYX_CAPABILITY_REPLY;
  if(intent==="identity_query"||isIdentityQuestion(text))return "I’m Nyx — the live Sandblast interface. Marion is the reasoning layer behind me: it helps with intent, context, memory, and final response shaping while I handle the conversation you see here.";
  if(intent==="technical_debug"||/\b(loop|looping|debug|test|fallback|technical|route|bridge|composer|chat engine|state spine|api|backend|frontend|final envelope)\b/i.test(text))return "Technical read: MarionBridge should route once, compose once, wrap one trusted finalEnvelope.reply, and pass that packet forward without placeholder text, duplicate emission, or reply override.";
  if(intent==="emotional_support"||/\b(sad|stress|overwhelm|anxious|panic|hurt|alone|grief)\b/i.test(text))return "I’m with you. Let’s keep this small and specific: what is the one pressure point that needs attention first?";
  return "I’ve got you. Tell me what you want to work on, and I’ll keep the response clear and specific.";
}
function buildBridgeRecoveryFinal(normalized={},routed={},reason="bridge_recovery",detail={},loopGuardResult={}){
  const reply=bridgeRecoveryReply(normalized,routed,reason);
  const routing=safeObj(routed.routing);
  const contract={ok:true,reply,text:reply,answer:reply,output:reply,response:reply,message:reply,spokenText:reply,intent:safeStr(routing.intent||safeObj(routed.marionIntent).intent||"simple_chat"),domain:safeStr(routing.domain||normalized.domain||"general"),memoryPatch:{stateStage:"bridge_recovered_final",recoveryRequired:false,bridgeRecoveryReason:safeStr(reason),replySignature:hashText(reply)},sessionPatch:{stateStage:"bridge_recovered_final",recoveryRequired:false,bridgeRecoveryReason:safeStr(reason)},speech:{enabled:true,silent:false,silentAudio:false,textDisplay:reply,textSpeak:reply,presenceProfile:"receptive",nyxStateHint:"receptive"},meta:{bridgeRecovery:true,bridgeRecoverySurface:"user_safe",reason:safeStr(reason),detail:safeObj(detail)},diagnostics:{bridgeRecovery:true,bridgeRecoverySurface:"user_safe",technicalLanguageSuppressed:!/(technical_debug)/i.test(safeStr(routing.intent||"")),reason:safeStr(reason),detail:safeObj(detail)}};
  return createLocalFinalEnvelope({normalized,routed,contract,reason,loopGuardResult});
}


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
function normalizeComposeInput(normalized,routed,resolvedEmotionPacket={}){const routing=safeObj(routed.routing),marionIntent=safeObj(routed.marionIntent);return{userQuery:normalized.userQuery,text:normalized.userQuery,query:normalized.userQuery,rawUserQuery:normalized.rawUserQuery,inputSource:normalized.inputSource,source:normalized.inputSource,voiceTextParity:safeObj(normalized.voiceTextParity),continuityTurnKey:normalized.continuityTurnKey,domain:safeStr(routing.domain||normalized.domain||"general")||"general",requestedDomain:safeStr(routing.domain||normalized.requestedDomain||"general")||"general",intent:safeStr(routing.intent||marionIntent.intent||"simple_chat")||"simple_chat",marionIntent,routing,previousMemory:normalized.previousMemory,conversationState:safeObj(normalized.previousMemory.stateSpine||normalized.previousMemory.conversationState||normalized.commandPacket.state),lane:normalized.lane,sessionId:normalized.sessionId,turnId:normalized.turnId,sourceTurnId:normalized.turnId,resolvedEmotion:safeObj(resolvedEmotionPacket.state),emotionRuntime:safeObj(resolvedEmotionPacket),emotionRuntimeOk:resolvedEmotionPacket.ok!==false};}
function wrapFinal({normalized,routed,contract,loopGuardResult,resolvedEmotionPacket={}}){const reply=extractReply(contract);if(!reply)return createLocalFinalEnvelope({normalized,routed,contract,reason:"composer_reply_missing",loopGuardResult});if(!finalEnvelopeMod||typeof finalEnvelopeMod.createMarionFinalEnvelope!=="function")return createLocalFinalEnvelope({normalized,routed,contract:{...safeObj(contract),reply,text:reply,spokenText:firstText(contract.spokenText,reply)},reason:"final_envelope_unavailable",loopGuardResult});const routing=safeObj(routed.routing),memoryPatch=safeObj(contract.memoryPatch);const envelope=finalEnvelopeMod.createMarionFinalEnvelope({reply,spokenText:safeStr(contract.spokenText||reply),intent:safeStr(routing.intent||contract.intent||"simple_chat"),domain:safeStr(routing.domain||contract.domain||normalized.domain||"general"),routing:{...routing,endpoint:safeStr(routing.endpoint||CANONICAL_ENDPOINT)||CANONICAL_ENDPOINT},stateStage:safeStr(memoryPatch.stateStage||contract.stateStage||(loopGuardResult.forceRecovery?"recover":"final")),turnId:normalized.turnId,sessionId:normalized.sessionId,memoryPatch,resolvedEmotion:safeObj(resolvedEmotionPacket.state||contract.resolvedEmotion),emotionSummary:emotionSummary(resolvedEmotionPacket.state?resolvedEmotionPacket:safeObj(contract.emotionRuntime)),speech:safeObj(contract.speech),replySignature:safeStr(contract.replySignature||memoryPatch.replySignature||hashText(reply)),composerVersion:safeStr(contract.version||contract.composerVersion||""),bridgeVersion:VERSION,meta:{...safeObj(contract.meta),bridgeVersion:VERSION,composerVersion:safeStr(contract.version||contract.composerVersion||""),loopGuardVersion:safeStr(loopGuardMod&&loopGuardMod.VERSION||""),routerVersion:safeStr(routed.routerVersion||routed.VERSION||""),normalizerVersion:safeStr(commandNormalizerMod&&commandNormalizerMod.VERSION||""),turnId:normalized.turnId},diagnostics:{...safeObj(contract.diagnostics),bridgeVersion:VERSION,routerCalled:true,composerCalled:true,loopGuardCalled:!!loopGuardMod,loopGuard:safeObj(loopGuardResult),singleContract:true,finalAuthority:"marionFinalEnvelope"}});const runtimeTelemetry=buildBridgeRuntimeTelemetry({source:"marionBridge.wrapFinal",normalized,routed,contract,reply,finalEnvelopeTrusted:true,canEmit:true,loopGuardResult,resolvedEmotionPacket});if(!safeStr(safeObj(envelope.finalEnvelope).reply||envelope.reply)||isDiagnosticText(safeObj(envelope.finalEnvelope).reply||envelope.reply)||isThinPlaceholderText(safeObj(envelope.finalEnvelope).reply||envelope.reply))return createLocalFinalEnvelope({normalized,routed,contract:{...safeObj(contract),reply,text:reply,spokenText:firstText(contract.spokenText,reply)},reason:"final_envelope_invalid",loopGuardResult});return{...envelope,ok:true,final:true,marionFinal:true,handled:true,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,hardlockCompatible:true,trustedTransport:true,singleFinalAuthority:true,marionFinalSignature:firstText(safeObj(envelope.meta).marionFinalSignature,safeObj(envelope.finalEnvelope).marionFinalSignature,safeObj(envelope.finalEnvelope).signature,FINAL_SIGNATURE),bridge:{version:VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,singleContract:true},routed,diagnostics:{...safeObj(envelope.diagnostics),bridgeVersion:VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,routerVersion:safeStr(routed.routerVersion||routed.VERSION||""),composerVersion:safeStr(contract.version||contract.composerVersion||""),composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopeVersion:safeStr(finalEnvelopeMod.VERSION||""),dependencies:DEPENDENCY_STATUS,loopGuard:safeObj(loopGuardResult),singleContract:true,zeroLoopSurface:true,emotionRuntimeCalled:!!Object.keys(safeObj(resolvedEmotionPacket)).length,emotionRuntimeOk:resolvedEmotionPacket.ok!==false,emotionSummary:emotionSummary(resolvedEmotionPacket)},meta:{...safeObj(envelope.meta),version:VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,bridgeVersion:VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,replyAuthority:"marionFinalEnvelope",semanticAuthority:"composeMarionResponse",composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopePresent:true,zeroLoopSurface:true,trustedTransport:true,singleFinalAuthority:true,hardlockCompatible:true,emotionRuntimeCalled:!!Object.keys(safeObj(resolvedEmotionPacket)).length,emotionRuntimeOk:resolvedEmotionPacket.ok!==false,emotionPrimary:emotionSummary(resolvedEmotionPacket).primary,emotionSecondary:emotionSummary(resolvedEmotionPacket).secondary}};}
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

function bridgeForensicNormalizationStatus(){
  return {
    version: PIPELINE_FORENSIC_NORMALIZATION_VERSION,
    bridgeVersion: VERSION,
    canonicalEndpoint: CANONICAL_ENDPOINT,
    composerResolvedPath: DEPENDENCY_STATUS.composer.resolvedPath,
    composerExists: !!DEPENDENCY_STATUS.composer.exists,
    routerResolvedPath: DEPENDENCY_STATUS.intentRouter.resolvedPath,
    routerExists: !!DEPENDENCY_STATUS.intentRouter.exists,
    finalEnvelopeResolvedPath: DEPENDENCY_STATUS.finalEnvelope.resolvedPath,
    finalEnvelopeExists: !!DEPENDENCY_STATUS.finalEnvelope.exists,
    authority: "bridge.wrapFinal -> marionFinalEnvelope",
    stateSchema: STATE_SPINE_SCHEMA,
    stateSchemaCompat: STATE_SPINE_SCHEMA_COMPAT
  };
}

module.exports={VERSION,CANONICAL_ENDPOINT,DEPENDENCY_STATUS,PIPELINE_FORENSIC_NORMALIZATION_VERSION,FINAL_RUNTIME_TELEMETRY_VERSION,bridgeForensicNormalizationStatus,retrieveLayer2Signals,processWithMarion,createMarionBridge,route,maybeResolve,ask,handle,default:processWithMarion,_internal:{normalizeInbound,canonicalTechnicalTargetFromText,fallbackRoute,validateRouterResult,extractReply,validateComposeResult,wrapFinal,buildErrorResult,buildBridgeRecoveryFinal,bridgeRecoveryReply,createLocalFinalEnvelope,hotFallbackReply,identityAnchorReply,isDiagnosticText,isThinPlaceholderText,DEPENDENCY_STATUS,COMPOSER_REQUIRE_CANDIDATES,resolveEmotionForTurn,emotionSummary,mergeEmotionIntoContract,jsonSafe,canonicalInputSource,normalizeParityText,buildContinuityTurnKey,transportSafePacket,transportSafeError,compactPatchForTransport,compactResolvedEmotion,compactCreativeCognitiveCarry,signatureLooksTrusted,hasTrustedBridgeFinalPacket,hasFinalFailureShape,bridgeForensicNormalizationStatus,buildBridgeRuntimeTelemetry}};
