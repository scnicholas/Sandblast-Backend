"use strict";

const VERSION = "marionBridge v7.9.11 SIX-DOMAIN-PRIMITIVE-RECOVERY + CURRENT-USER-PROGRESSION-GATE + SILENT-SUPPRESSION-HARDLOCK + PROGRESSION-SOURCE-KILL-HARDLOCK + LOOP-SUPPRESSION-FUTURE-HARDLOCK + PUBLIC-SURFACE-LEAK-HARDLOCK + NYX-MARION-LOOP-GOVERNOR-CAPACITY-SEPARATION + MARION-LINGOSENTINEL-GATEWAY-LIVE-PATH + RESPONSE-SHAPING-EXPANSION-HARDLOCK + PROGRESSION-CONTEXT-PROTECTION-HARDLOCK + FOUR-PHASE-PROGRESSION-ANCHOR-HARDLOCK + PROGRESSION-SHAPING-ANCHOR-HARDLOCK + DOMAIN-CONFIDENCE-SCORING-HARDLOCK + DOMAIN-CONFIDENCE-NEXT-PHASE-CARRY + PRIMITIVE-PUBLIC-REPLY-HARDLOCK + LANGUAGE-CA-SPOKEN-ALIAS-RECOVERY + MIC-TEXT-SPOKEN-ALIAS-PHASE-ANCHOR-HARDENING + DIRECT-TRANSLATION-TARGET-EN-CARRY + DIRECT-TRANSLATION-COMMAND-CARRY + LINGOSENTINEL-MULTILINGUAL-FALSE-SUPPRESSION + LINGOSENTINEL-GREETING-PRECEDENCE-BRIDGE-LOCK + PUBLIC-CONTROL-PHRASE-HARDLOCK + PUBLIC-REPLY-HYGIENE-HARDLOCK + NYX-PUBLIC-AGENT-ALIAS-LOCK + RENDER-DEPLOY-HARDENED + LANGUAGESPHERE-SURFACE-PASSTHROUGH + CONFIDENCE-AWARE-SHAPING-CARRY + DOMAIN-CONCIERGE-RUNTIME-ORCHESTRATION + SHORT-CONCEPT-FOLLOWUP-BRIDGE-CARRY + BARE-DOMAIN-ACTIVATION-BRIDGE-LOCK + LOOP-FALLBACK-FINAL-REJECTION + SIX-DOMAIN-DEFINITION-ROUTING-AUTHORITY-LOCK + IDENTITY-RESET-GENERIC-FALLBACK-LOOP-LOCK + OUTER-SCHEDULER-BYPASS-COMPAT + TECHNICAL-TARGET-LOCK + FALLBACK-KNOWLEDGE-DOMAIN-ROUTE-FIX + FINAL-RUNTIME-TELEMETRY + FIVE-TURN-CONTINUITY-PARITY-BRIDGE + FINAL-AUTHORITY-STATE-CREATIVE-COMPAT-HARDENED + TELEMETRY-VISIBILITY-FAILURE-SIGNATURE-AUDIT + FINAL-RENDER-TELEMETRY-HARDLOCK + PHASE5-BENCHMARK-OBSERVATION-HOOK-PASSIVE + LINGOSENTINEL-ASTER-GATEWAY + ASTER-PASSIVE-OBSERVATION-BRIDGE + ASTER-AUTHORITY-GUARD + LINGOSENTINEL-GATEWAY-ORCHESTRATION-BRIDGE + LINGOSENTINEL-ALERT-SCANNER-BRIDGE-CARRY + PARALLEL-LANE-COORDINATION-BRIDGE + PARALLEL-LANE-RECENCY-MAINTENANCE + STALE-CARRY-SUPPRESSION-HARDLOCK + LIVE-MULTITURN-PARALLEL-LANE-HARDLOCK + PRODUCTION-DEPLOYMENT-LOCK + PRODUCTION-MONITORING-SHIELD + RELEASE-READINESS-ROLLBACK-SAFETY + INVALID-PUBLIC-REPLY-LAST-MILE-RECOVERY + DETERMINISTIC-ORIGINAL-PROMPT-RECOVERY";
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
const FINAL_RENDER_TELEMETRY_VERSION = "nyx.marion.finalRenderTelemetry/1.0";
const PROGRESSION_SHAPING_REFINEMENT_VERSION = "nyx.marion.progressionShapingRefinement/1.0";
const DOMAIN_CONCIERGE_VERSION = "nyx.marion.domainConcierge/1.0";
const CONFIDENCE_AWARE_RESPONSE_SHAPING_VERSION = "nyx.marion.confidenceAwareResponseShaping/1.0";
const LANGUAGE_SPHERE_BRIDGE_VERSION = "nyx.marion.languageSphereBridge/1.0";
const LINGOSENTINEL_GATEWAY_BRIDGE_VERSION = "nyx.marion.lingosentinelGatewayBridge/0.2";
const ASTER_BRIDGE_VERSION = "nyx.marion.asterBridge/0.1";
const MARION_BRIDGE_DEPLOY_HARDENING_VERSION = "nyx.marion.bridgeDeployHardening/1.0";
const BENCHMARK_OBSERVATION_HOOK_VERSION = "nyx.marion.benchmarkObservationHook/1.0";

const fs = require("fs");
const path = require("path");
const progressionShapeMod = (() => { try { return require(path.join(__dirname, "progressionShape.js")); } catch (_) { return null; } })();
const progressionMemoryMod = (() => { try { return require(path.join(__dirname, "progressionMemory.js")); } catch (_) { return null; } })();
const progressionResponsePolicyMod = (() => { try { return require(path.join(__dirname, "progressionResponsePolicy.js")); } catch (_) { return null; } })();
const progressionTelemetryMod = (() => { try { return require(path.join(__dirname, "progressionTelemetry.js")); } catch (_) { return null; } })();
const domainConfidenceMod = (() => { try { return require(path.join(__dirname, "domainConfidence.js")); } catch (_) { return null; } })();
const finalRenderTelemetryMod = (() => { try { return require(path.join(__dirname, "finalRenderTelemetry.js")); } catch (_) { return null; } })();

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
const DOMAIN_CONCIERGE_REQUIRE_CANDIDATES = Object.freeze([
  path.join(__dirname,"DomainConcierge.js"),
  path.join(__dirname,"Data","marion","runtime","DomainConcierge.js"),
  path.join(process.cwd(),"Data","marion","runtime","DomainConcierge.js"),
  "./DomainConcierge.js",
  "./DomainConcierge",
  "./Data/marion/runtime/DomainConcierge.js",
  "./Data/marion/runtime/DomainConcierge"
]);
const finalEnvelopeLoaded=tryRequireMany(["./marionFinalEnvelope.js","./marionFinalEnvelope","./Data/marion/runtime/marionFinalEnvelope.js","./Data/marion/runtime/marionFinalEnvelope","./utils/marionFinalEnvelope.js","./utils/marionFinalEnvelope"]);
const intentRouterLoaded=tryRequireMany(["./Data/marion/runtime/marionIntentRouter.js","./Data/marion/runtime/marionIntentRouter","./marionIntentRouter.js","./marionIntentRouter"]);
const composerLoaded=tryRequireMany(COMPOSER_REQUIRE_CANDIDATES);
const domainConciergeLoaded=tryRequireMany(DOMAIN_CONCIERGE_REQUIRE_CANDIDATES);
const commandNormalizerLoaded=tryRequireMany(["./Data/marion/runtime/marionCommandNormalizer.js","./Data/marion/runtime/marionCommandNormalizer","./marionCommandNormalizer.js","./marionCommandNormalizer","./utils/marionCommandNormalizer.js","./utils/marionCommandNormalizer"]);
const loopGuardLoaded=tryRequireMany(["./Data/marion/runtime/marionLoopGuard.js","./Data/marion/runtime/marionLoopGuard","./marionLoopGuard.js","./marionLoopGuard","./utils/marionLoopGuard.js","./utils/marionLoopGuard"]);
const emotionRuntimeLoaded=tryRequireMany(["./Data/marion/runtime/emotion/emotionRuntime.js","./Data/marion/runtime/emotion/emotionRuntime","./marion/runtime/emotion/emotionRuntime.js","./marion/runtime/emotion/emotionRuntime"]);

const universalTranslatorLoaded=tryRequireMany([
  path.join(__dirname,"UniversalTranslatorAdapter.js"),
  path.join(process.cwd(),"Data","marion","runtime","UniversalTranslatorAdapter.js"),
  "./UniversalTranslatorAdapter.js",
  "./UniversalTranslatorAdapter",
  "./Data/marion/runtime/UniversalTranslatorAdapter.js",
  "./Data/marion/runtime/UniversalTranslatorAdapter",
  path.join(__dirname,"languagesphere","UniversalTranslatorAdapter.js"),
  "./Data/marion/runtime/languagesphere/UniversalTranslatorAdapter.js"
]);
const multilingualFinalEnvelopeLoaded=tryRequireMany([
  path.join(__dirname,"languagesphere","MultilingualFinalEnvelope.js"),
  path.join(process.cwd(),"Data","marion","runtime","languagesphere","MultilingualFinalEnvelope.js"),
  "./Data/marion/runtime/languagesphere/MultilingualFinalEnvelope.js",
  "./Data/marion/runtime/languagesphere/MultilingualFinalEnvelope",
  "./MultilingualFinalEnvelope.js",
  "./MultilingualFinalEnvelope"
]);
const contextPassportEventsLoaded=tryRequireMany([
  path.join(__dirname,"languagesphere","ContextPassportEvents.js"),
  path.join(process.cwd(),"Data","marion","runtime","languagesphere","ContextPassportEvents.js"),
  "./Data/marion/runtime/languagesphere/ContextPassportEvents.js",
  "./Data/marion/runtime/languagesphere/ContextPassportEvents",
  "./ContextPassportEvents.js",
  "./ContextPassportEvents"
]);
const languageSphereTelemetryLoaded=tryRequireMany([
  path.join(__dirname,"languagesphere","LanguageSphereTelemetry.js"),
  path.join(process.cwd(),"Data","marion","runtime","languagesphere","LanguageSphereTelemetry.js"),
  "./Data/marion/runtime/languagesphere/LanguageSphereTelemetry.js",
  "./Data/marion/runtime/languagesphere/LanguageSphereTelemetry",
  "./LanguageSphereTelemetry.js",
  "./LanguageSphereTelemetry"
]);
const lingoSentinelGatewayLoaded=tryRequireMany([
  path.join(__dirname,"MarionLingoSentinelGateway.js"),
  path.join(process.cwd(),"Data","marion","runtime","MarionLingoSentinelGateway.js"),
  "./Data/marion/runtime/MarionLingoSentinelGateway.js",
  "./Data/marion/runtime/MarionLingoSentinelGateway",
  "./MarionLingoSentinelGateway.js",
  "./MarionLingoSentinelGateway",
  path.join(__dirname,"LingoSentinelGateway.js"),
  path.join(__dirname,"LingoSentinel","LingoSentinelGateway.js"),
  path.join(process.cwd(),"Data","marion","runtime","LingoSentinelGateway.js"),
  path.join(process.cwd(),"Data","marion","runtime","LingoSentinel","LingoSentinelGateway.js"),
  "./Data/marion/runtime/LingoSentinelGateway.js",
  "./Data/marion/runtime/LingoSentinel/LingoSentinelGateway.js",
  "./Data/marion/runtime/LingoSentinelGateway",
  "./Data/marion/runtime/LingoSentinel/LingoSentinelGateway",
  "./LingoSentinelGateway.js",
  "./LingoSentinel/LingoSentinelGateway.js",
  "./LingoSentinelGateway",
  "./LingoSentinel/LingoSentinelGateway"
]);
const marionRuntimeObservationLoaded=tryRequireMany([
  path.join(__dirname,"benchmarking","marionRuntimeObservationHook.js"),
  path.join(process.cwd(),"Data","marion","runtime","benchmarking","marionRuntimeObservationHook.js"),
  "./Data/marion/runtime/benchmarking/marionRuntimeObservationHook.js",
  "./Data/marion/runtime/benchmarking/marionRuntimeObservationHook",
  "./benchmarking/marionRuntimeObservationHook.js",
  "./benchmarking/marionRuntimeObservationHook"
]);

const asterEnvironmentAdapterLoaded=tryRequireMany([
  path.join(__dirname,"aster","AsterEnvironmentAdapter.js"),
  path.join(process.cwd(),"Data","marion","runtime","aster","AsterEnvironmentAdapter.js"),
  "./Data/marion/runtime/aster/AsterEnvironmentAdapter.js",
  "./Data/marion/runtime/aster/AsterEnvironmentAdapter",
  path.join(__dirname,"AsterEnvironmentAdapter.js"),
  "./AsterEnvironmentAdapter.js",
  "./AsterEnvironmentAdapter"
]);


const marionDualTrackGatewayLoaded=tryRequireMany([
  path.join(__dirname,"MarionDualTrackGateway.js"),
  path.join(process.cwd(),"Data","marion","runtime","MarionDualTrackGateway.js"),
  "./Data/marion/runtime/MarionDualTrackGateway.js",
  "./Data/marion/runtime/MarionDualTrackGateway",
  "./MarionDualTrackGateway.js",
  "./MarionDualTrackGateway"
]);
const marionCoordinationTelemetryLoaded=tryRequireMany([
  path.join(__dirname,"MarionCoordinationTelemetry.js"),
  path.join(process.cwd(),"Data","marion","runtime","MarionCoordinationTelemetry.js"),
  "./Data/marion/runtime/MarionCoordinationTelemetry.js",
  "./Data/marion/runtime/MarionCoordinationTelemetry",
  "./MarionCoordinationTelemetry.js",
  "./MarionCoordinationTelemetry"
]);
const marionEthicalGatekeeperLoaded=tryRequireMany([
  path.join(__dirname,"MarionEthicalGatekeeper.js"),
  path.join(process.cwd(),"Data","marion","runtime","MarionEthicalGatekeeper.js"),
  "./Data/marion/runtime/MarionEthicalGatekeeper.js",
  "./Data/marion/runtime/MarionEthicalGatekeeper",
  "./MarionEthicalGatekeeper.js",
  "./MarionEthicalGatekeeper"
]);
const marionRealWorldRiskClassifierLoaded=tryRequireMany([
  path.join(__dirname,"MarionRealWorldRiskClassifier.js"),
  path.join(process.cwd(),"Data","marion","runtime","MarionRealWorldRiskClassifier.js"),
  "./Data/marion/runtime/MarionRealWorldRiskClassifier.js",
  "./Data/marion/runtime/MarionRealWorldRiskClassifier",
  "./MarionRealWorldRiskClassifier.js",
  "./MarionRealWorldRiskClassifier"
]);


const marionDualTrackGatewayMod=marionDualTrackGatewayLoaded.mod;
const buildMarionDualTrackPacket=marionDualTrackGatewayMod&&typeof marionDualTrackGatewayMod.buildMarionDualTrackPacket==="function"?marionDualTrackGatewayMod.buildMarionDualTrackPacket:null;
const summarizeDualTrackPacket=marionDualTrackGatewayMod&&typeof marionDualTrackGatewayMod.summarizeDualTrackPacket==="function"?marionDualTrackGatewayMod.summarizeDualTrackPacket:null;
const marionCoordinationTelemetryMod=marionCoordinationTelemetryLoaded.mod;
const buildMarionCoordinationTelemetry=marionCoordinationTelemetryMod&&typeof marionCoordinationTelemetryMod.buildMarionCoordinationTelemetry==="function"?marionCoordinationTelemetryMod.buildMarionCoordinationTelemetry:null;
const summarizeCoordinationTelemetry=marionCoordinationTelemetryMod&&typeof marionCoordinationTelemetryMod.summarizeCoordinationTelemetry==="function"?marionCoordinationTelemetryMod.summarizeCoordinationTelemetry:null;
const marionEthicalGatekeeperMod=marionEthicalGatekeeperLoaded.mod;
const evaluateEthicalGate=marionEthicalGatekeeperMod&&typeof marionEthicalGatekeeperMod.evaluateEthicalGate==="function"?marionEthicalGatekeeperMod.evaluateEthicalGate:null;
const marionRealWorldRiskClassifierMod=marionRealWorldRiskClassifierLoaded.mod;
const classifyRiskLevel=marionRealWorldRiskClassifierMod&&typeof marionRealWorldRiskClassifierMod.classifyRiskLevel==="function"?marionRealWorldRiskClassifierMod.classifyRiskLevel:null;
const finalEnvelopeMod=finalEnvelopeLoaded.mod;
const intentRouterMod=intentRouterLoaded.mod;
const composerMod=composerLoaded.mod;
const domainConciergeMod=domainConciergeLoaded.mod;
const commandNormalizerMod=commandNormalizerLoaded.mod;
const loopGuardMod=loopGuardLoaded.mod;
const emotionRuntimeMod=emotionRuntimeLoaded.mod;
const universalTranslatorMod=universalTranslatorLoaded.mod;
const multilingualFinalEnvelopeMod=multilingualFinalEnvelopeLoaded.mod;
const contextPassportEventsMod=contextPassportEventsLoaded.mod;
const languageSphereTelemetryMod=languageSphereTelemetryLoaded.mod;
const lingoSentinelGatewayMod=lingoSentinelGatewayLoaded.mod;
const runLingoSentinelGateway=lingoSentinelGatewayMod&&typeof lingoSentinelGatewayMod.runMarionLingoSentinelGateway==="function"?lingoSentinelGatewayMod.runMarionLingoSentinelGateway:(lingoSentinelGatewayMod&&typeof lingoSentinelGatewayMod.runLingoSentinelGateway==="function"?lingoSentinelGatewayMod.runLingoSentinelGateway:null);
const buildLingoSentinelMarionBridgePayload=lingoSentinelGatewayMod&&typeof lingoSentinelGatewayMod.buildMarionBridgePayload==="function"?lingoSentinelGatewayMod.buildMarionBridgePayload:null;
const marionRuntimeObservationMod=marionRuntimeObservationLoaded.mod;
const asterEnvironmentAdapterMod=asterEnvironmentAdapterLoaded.mod;
const runAsterEnvironmentAdapter=asterEnvironmentAdapterMod&&typeof asterEnvironmentAdapterMod.runAsterEnvironmentAdapter==="function"?asterEnvironmentAdapterMod.runAsterEnvironmentAdapter:(asterEnvironmentAdapterMod&&typeof asterEnvironmentAdapterMod.run==="function"?asterEnvironmentAdapterMod.run:(asterEnvironmentAdapterMod&&typeof asterEnvironmentAdapterMod.default==="function"?asterEnvironmentAdapterMod.default:null));
const routeMarionIntent=intentRouterMod&&typeof intentRouterMod.routeMarionIntent==="function"?intentRouterMod.routeMarionIntent:null;
const runDomainConcierge=domainConciergeMod&&typeof domainConciergeMod.runDomainConcierge==="function"?domainConciergeMod.runDomainConcierge:null;
const composeMarionResponse=composerMod&&typeof composerMod.composeMarionResponse==="function"?composerMod.composeMarionResponse:(composerMod&&typeof composerMod.run==="function"?composerMod.run:(composerMod&&typeof composerMod.default==="function"?composerMod.default:null));
const DEPENDENCY_STATUS = Object.freeze({
  bridgeFile: __filename,
  composerPreferred: path.resolve(__dirname,"composeMarionResponse.js"),
  composer: dependencyStatus("composeMarionResponse", composerLoaded),
  domainConcierge: dependencyStatus("DomainConcierge", domainConciergeLoaded),
  finalEnvelope: dependencyStatus("marionFinalEnvelope", finalEnvelopeLoaded),
  intentRouter: dependencyStatus("marionIntentRouter", intentRouterLoaded),
  commandNormalizer: dependencyStatus("marionCommandNormalizer", commandNormalizerLoaded),
  loopGuard: dependencyStatus("marionLoopGuard", loopGuardLoaded),
  emotionRuntime: dependencyStatus("emotionRuntime", emotionRuntimeLoaded),
  universalTranslator: dependencyStatus("UniversalTranslatorAdapter", universalTranslatorLoaded),
  multilingualFinalEnvelope: dependencyStatus("MultilingualFinalEnvelope", multilingualFinalEnvelopeLoaded),
  contextPassportEvents: dependencyStatus("ContextPassportEvents", contextPassportEventsLoaded),
  languageSphereTelemetry: dependencyStatus("LanguageSphereTelemetry", languageSphereTelemetryLoaded),
  lingoSentinelGateway: dependencyStatus("LingoSentinelGateway", lingoSentinelGatewayLoaded),
  marionRuntimeObservationHook: dependencyStatus("marionRuntimeObservationHook", marionRuntimeObservationLoaded),
  asterEnvironmentAdapter: dependencyStatus("AsterEnvironmentAdapter", asterEnvironmentAdapterLoaded),
  marionDualTrackGateway: dependencyStatus("MarionDualTrackGateway", marionDualTrackGatewayLoaded),
  marionCoordinationTelemetry: dependencyStatus("MarionCoordinationTelemetry", marionCoordinationTelemetryLoaded),
  marionEthicalGatekeeper: dependencyStatus("MarionEthicalGatekeeper", marionEthicalGatekeeperLoaded),
  marionRealWorldRiskClassifier: dependencyStatus("MarionRealWorldRiskClassifier", marionRealWorldRiskClassifierLoaded)
});

function safeStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}

function stripPublicReplyScaffold(value){
  let t=safeStr(value);
  if(!t)return "";
  t=t.replace(/\s+/g," ").trim();
  for(let i=0;i<10;i+=1){
    const next=t
      .replace(/^(?:that makes sense|polished version|i[’']?ve got you|let[’']?s keep it clean|clean version|here[’']?s the clean version)\s*[:\-–—]\s*/i,"")
      .replace(/^(?:bonjour|hola|hello|hi|hey)\s+nyx\s*,?\s*(?:please\s*)?/i,"");
    if(next===t)break;
    t=next.trim();
  }
  const chunks=t.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if(chunks&&chunks.length>1){
    const seen=new Set(), out=[];
    for(const c of chunks){
      const s=safeStr(c);
      const k=s.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
      if(!k)continue;
      if(seen.has(k))continue;
      seen.add(k);
      out.push(s);
    }
    t=out.join(" ").trim();
  }
  return t.replace(/\s+([,.!?;:])/g,"$1").replace(/\s{2,}/g," ").trim();
}

function lower(value){return safeStr(value).toLowerCase();}
function isObj(value){return !!value&&typeof value==="object"&&!Array.isArray(value);}
function safeObj(value){return isObj(value)?value:{};}
function safeArray(value){return Array.isArray(value)?value:[];}
function firstText(){for(let i=0;i<arguments.length;i+=1){const value=safeStr(arguments[i]);if(value)return value;}return "";}
function hashText(value){const source=lower(value).replace(/[^a-z0-9]+/g," ").trim();let hash=0;for(let i=0;i<source.length;i+=1){hash=((hash<<5)-hash)+source.charCodeAt(i);hash|=0;}return String(hash>>>0);}

function benchmarkObservationTelemetryEnabled(){
  return typeof process !== "undefined" && process && process.env && process.env.SB_BENCHMARK_OBSERVE === "true";
}
function observeBridgeRuntimeSafely(runtimeOutput={},context={}){
  if(!marionRuntimeObservationMod||typeof marionRuntimeObservationMod.observeAndReturnRuntimeOutput!=="function")return runtimeOutput;
  try{
    const ctx=safeObj(context);
    const out=safeObj(runtimeOutput);
    const normalized=safeObj(ctx.normalized);
    return marionRuntimeObservationMod.observeAndReturnRuntimeOutput(runtimeOutput,{
      scenarioId:firstText(ctx.turnId,normalized.turnId,out.turnId,out.requestId,out.scenarioId,"marion-bridge-final"),
      phase:firstText(ctx.phase,"phase5-bridge-passive-observation"),
      telemetryEnabled:benchmarkObservationTelemetryEnabled(),
      telemetryOptions:safeObj(ctx.telemetryOptions)
    });
  }catch(_){
    return runtimeOutput;
  }
}

function normalizeBridgeDomainConfidence(value={},fallback={}) {
  const v=safeObj(value), f=safeObj(fallback);
  if(domainConfidenceMod&&typeof domainConfidenceMod.normalizeDomainConfidenceProfile==="function"){
    try{return domainConfidenceMod.normalizeDomainConfidenceProfile(v,{...f,candidates:safeArray(v.candidates||f.candidates),confidence:v.confidence||f.confidence});}catch(_){}
  }
  const c=Math.max(0,Math.min(1,Number(v.confidence||f.confidence)||0));
  const band=firstText(v.confidenceBand,v.band,c>=0.82?"high":c>=0.62?"medium":c>=0.48?"low":"weak");
  return {...v,version:firstText(v.version,"nyx.marion.domainConfidence/1.2"),confidence:c,confidenceScore:c,band,confidenceBand:band,primaryDomain:firstText(v.primaryDomain,v.selectedDomain,f.domain,"general_reasoning"),selectedDomain:firstText(v.selectedDomain,v.primaryDomain,f.domain,"general_reasoning"),secondaryDomains:safeArray(v.secondaryDomains||f.secondaryDomains).slice(0,4),needsClarifier:!!v.needsClarifier,answerMode:firstText(v.answerMode,c>=0.82?"direct":c>=0.62?"grounded":"clarify"),fallbackReason:firstText(v.fallbackReason,""),noCrossDomainBleed:true,noUserFacingDiagnostics:true};
}


function isWarmNyxGreetingOnly(value=""){
  const t=lower(value).replace(/[.!?]+$/g,"").trim();
  return /^(?:hi|hello|hey|yo|hiya|good morning|good afternoon|good evening)(?:\s+nyx)?$/.test(t)||/^(?:hi|hello|hey)\s+nyx$/.test(t);
}
function isExplicitProjectProgressionText(value=""){
  const t=lower(value);
  if(!t||isWarmNyxGreetingOnly(t))return false;
  return /\b(progression shaping|progression refinement|progression_shaping_refinement|domain confidence scoring|response[-\s]?expansion validation|5[-\s]?7 turn|5 turn|continuity depth|depth governor|mic[-\s]?to[-\s]?text parity|phase anchor|phase\s*[1-9]|validation harness|regression harness|mark passed|mark failed|passed|failed)\b/i.test(t)||
    (/\b(continue|next|next steps?|what now|what'?s next|carry on|keep going|after this test passes|run next validation)\b/i.test(t)&&/\b(test|validation|phase|progression|parity|continuity|domain confidence|passed|failed)\b/i.test(t));
}
function isPublicWorkflowStateLeak(value=""){
  const t=safeStr(value);
  if(!t)return false;
  return /\bprogression active\b/i.test(t)||
    /\brun next validation\b/i.test(t)||
    /\bmark passed or failed\b/i.test(t)||
    /\bmark\s+(?:as\s+)?(?:passed|failed)\b/i.test(t)||
    /\bvalidation harness\b/i.test(t)||
    /\bregression harness\b/i.test(t)||
    /\btest\s+(?:next steps|passed|failed|continue|what now|update it)\b/i.test(t)||
    /\bexpected result:\s*marion\b/i.test(t)||
    /\bphase anchor\b/i.test(t)||
    /\bstate spine\b/i.test(t)||
    /\bprogression shaping guard\b/i.test(t)||
    /\bfinal render telemetry\b/i.test(t)||
    /\bproduction monitoring shield\b/i.test(t)||
    /\bsmoke test\b/i.test(t)||
    /\bnode --check\b/i.test(t)||
    /\bpassed or failed\b/i.test(t);
}
function suppressPublicReplyPacket(packet={},flags={}){
  const out=isObj(packet)?packet:{};
  out.reply="";out.text="";out.answer="";out.output="";out.response="";out.message="";out.displayReply="";out.spokenText="";out.textSpeak="";out.textDisplay="";
  out.ok=true;out.final=false;out.marionFinal=false;out.handled=true;out.awaitingMarion=true;out.terminal=false;out.suppressUserFacingReply=true;out.emit=false;out.blocked=true;out.transportSafe=true;out.socketReconnect=false;
  out.payload={...safeObj(out.payload),reply:"",text:"",answer:"",output:"",response:"",message:"",displayReply:"",spokenText:"",textSpeak:"",textDisplay:"",final:false,marionFinal:false,awaitingMarion:true,suppressUserFacingReply:true,emit:false,blocked:true};
  out.finalEnvelope={...safeObj(out.finalEnvelope),reply:"",text:"",displayReply:"",spokenText:"",final:false,marionFinal:false,handled:true,qualityPass:false};
  out.speech={...safeObj(out.speech),text:"",textDisplay:"",textSpeak:"",silent:true,silentAudio:true};
  out.meta={...safeObj(out.meta),...safeObj(flags),noUserFacingDiagnostics:true,transportSafe:true,emit:false,blocked:true,suppressUserFacingReply:true,awaitingMarion:true};
  out.diagnostics={...safeObj(out.diagnostics),...safeObj(flags),publicReplyHardlock:true,noUserFacingDiagnostics:true,suppressedUserFacingReply:true,emit:false,blocked:true};
  return out;
}

function isPublicControlPolicyLeak(value){
  const text=lower(value).replace(/[.!?]+$/g,"").trim();
  if(!text)return false;
  return /\bsame prompt,?\s*new requirement\b/i.test(text)||
    /\banswer with one new fact,?\s*one action,?\s*or one test\b/i.test(text)||
    /\bif voice and text return different answers\b/i.test(text)||
    /\bpreserve intent and regenerate\b/i.test(text)||
    /\bsame normalized text\b/i.test(text)||
    /\bregenerate from the same normalized text\b/i.test(text)||
    /\bthe direct answer needs one usable example\b/i.test(text)||
    /\bin practical terms, define the concept\b/i.test(text)||
    /\bone concrete use case so the user can apply it immediately\b/i.test(text);
}
function isPrimitivePublicReply(value){
  const text=safeStr(value).replace(/[.!?]+$/g,"").trim().toLowerCase();
  return !text||/^(?:false|true|null|undefined|none|nan|\[object object\])$/.test(text);
}
function isLingoSentinelExplanationPrompt(value=""){
  const text=safeStr(value);
  if(!text)return false;
  const hasName=/\b(?:lingosentinel|lingosentinel|language sphere|languagesphere)\b/i.test(text);
  const hasIntent=/\b(?:explain|what|does|do|clear sentence|one sentence|multilingual|language|translation|translate|understand|explica|explicame|expl[ií]came|qu[eé]\\s+hace|frase\\s+clara|idioma|idiomas|lenguaje|lenguajes|multiling[uü]e|traducci[oó]n|traducir|comprender|entender|explique|que\\s+fait|qu[e’']?est[-\\s]*ce\\s+que|phrase\\s+claire|langue|langues|multilingue|traduction|traduire|comprendre)\\b/i.test(text);
  return !!(hasName&&hasIntent);
}
function isGenericGreetingStatusFallback(value=""){
  const text=lower(value).replace(/[.!?]+$/g,"").trim();
  if(!text)return false;
  return /^(?:hello|hi|hey)\.?\s*i[’']?m ready when you are\.?\s*what do you need$/i.test(text)||
    /^i[’']?m ready when you are\.?\s*what do you need$/i.test(text)||
    /^hi\.?\s*i[’']?m nyx\.?\s*it[’']?s good to see you\.?\s*what would you like to work on$/i.test(text)||
    /^i[’']?m doing well,? thank you\.?\s*i[’']?m ready to help\.?\s*what would you like to work on today$/i.test(text)||
    /^i[’']?ve got you\.?\s*tell me what you want to work on,? and i[’']?ll keep the response clear and specific$/i.test(text)||
    /^hi\s*[—-]\s*i[’']?m here,?\s*fully online\.?\s*what are we working on\??$/i.test(text)||
    /^what are we working on\??$/i.test(text);
}
function buildLingoSentinelPublicAnswerFromPacket(packet={},ctx={}){
  const p=safeObj(packet), payload=safeObj(p.payload), c=safeObj(ctx), n=safeObj(c.normalized), original=safeObj(n.original), body=safeObj(original.body);
  const source=[p.userText,p.message,p.text,p.query,p.input,payload.userText,payload.message,payload.text,n.userText,n.message,n.text,n.query,n.userQuery,n.rawUserQuery,n.publicUserQuery,original.text,original.userText,original.message,body.text,body.userText,body.message].map(safeStr).join(" ");
  if(isLingoSentinelExplanationPrompt(source)){
    return "LingoSentinel helps Nyx understand different languages while Marion preserves meaning, tone, and final response quality.";
  }
  return "";
}
function isAsterExplanationPrompt(value=""){
  const text=safeStr(value);
  if(!text)return false;
  const hasName=/\b(?:aster|environmental pathway|environmental gateway)\b/i.test(text);
  const hasIntent=/\b(?:explain|what|does|do|clear sentence|one sentence|environmental|climate|weather|signal|pathway|gateway|risk|regional)\b/i.test(text);
  return !!(hasName&&hasIntent);
}
function buildAsterPublicAnswerFromPacket(packet={},ctx={}){
  const p=safeObj(packet), payload=safeObj(p.payload), c=safeObj(ctx), n=safeObj(c.normalized), original=safeObj(n.original), body=safeObj(original.body);
  const source=[p.userText,p.message,p.text,p.query,p.input,payload.userText,payload.message,payload.text,n.userText,n.message,n.text,n.query,n.userQuery,n.rawUserQuery,n.publicUserQuery,original.text,original.userText,original.message,body.text,body.userText,body.message].map(safeStr).join(" ");
  if(isAsterExplanationPrompt(source)){
    return "Aster is the staged environmental pathway for Sandblast: it will read environmental signals, preserve regional context, and hand clean context forward without weakening Marion’s final authority.";
  }
  return "";
}
function buildProjectGatewayPublicAnswerFromPacket(packet={},ctx={}){
  return buildAsterPublicAnswerFromPacket(packet,ctx)||buildLingoSentinelPublicAnswerFromPacket(packet,ctx)||"";
}

function bridgeAsterCandidateSource(input={},normalized={}){
  const i=safeObj(input), n=safeObj(normalized), original=safeObj(n.original), body=safeObj(original.body);
  return firstObj(
    i.aster,
    i.asterObservation,
    i.environmentObservation,
    i.environment,
    i.sensorObservation,
    n.aster,
    n.asterObservation,
    n.environmentObservation,
    original.aster,
    original.asterObservation,
    body.aster,
    body.asterObservation
  );
}
function bridgeAsterTextCandidate(input={},normalized={}){
  const i=safeObj(input), n=safeObj(normalized), original=safeObj(n.original), body=safeObj(original.body);
  return [i.text,i.userText,i.userQuery,i.query,i.message,n.userQuery,n.rawUserQuery,n.text,n.query,original.text,original.userText,original.message,body.text,body.userText,body.message].map(safeStr).join(" ");
}
function bridgeAsterShouldObserve(input={},normalized={}){
  const candidate=bridgeAsterCandidateSource(input,normalized);
  if(Object.keys(candidate).length)return true;
  const text=bridgeAsterTextCandidate(input,normalized);
  if(!text)return false;
  return /\baster\b/i.test(text)&&/\b(sensor|environment|weather|climate|air\s*quality|aqi|humidity|temperature|wind|observation|risk|regional|pathway|gateway)\b/i.test(text);
}
function bridgeAsterBuildInput(input={},normalized={}){
  const i=safeObj(input), n=safeObj(normalized), candidate=bridgeAsterCandidateSource(i,n), original=safeObj(n.original), body=safeObj(original.body);
  const readings=firstObj(candidate.readings,candidate.normalized,candidate.raw,i.readings,i.normalized,n.readings,n.normalized,body.readings,body.normalized);
  const metadata=firstObj(candidate.metadata,i.metadata,n.metadata,body.metadata);
  return {
    source:firstText(candidate.source,i.source,n.inputSource,"marionBridge.asterPassiveObservation"),
    sensorType:firstText(candidate.sensorType,i.sensorType,n.sensorType,metadata.sensorType,"unknown"),
    readings,
    normalized:firstObj(candidate.normalized,i.normalized,n.normalized),
    timestamp:firstText(candidate.timestamp,i.timestamp,n.timestamp),
    location:firstText(candidate.location,i.location,n.location),
    metadata:{...metadata,bridgeVersion:VERSION,asterBridgeVersion:ASTER_BRIDGE_VERSION,passive:true,linkedGateway:"LingoSentinel",project:"Sandblast"},
    context:firstObj(candidate.context,i.context,n.context)
  };
}
function compactAsterObservationForBridge(value={}){
  const src=safeObj(value);
  if(!Object.keys(src).length)return {};
  const observation=firstObj(src.observation,src.envelope,safeObj(src.payload).observation);
  const risk=firstObj(src.risk,safeObj(observation).risk);
  const classification=firstObj(src.classification,safeObj(observation).classification);
  return {
    version:ASTER_BRIDGE_VERSION,
    gateway:"Aster",
    stage:"passive_observation",
    active:src.active===true||!!Object.keys(observation).length,
    available:src.available!==false,
    ok:src.ok!==false,
    observational:true,
    finalAnswerAuthorized:false,
    marionAuthorityRequired:true,
    publicAgent:"nyx",
    displayAuthority:"nyx",
    noUserFacingDiagnostics:true,
    context:firstText(src.context,safeObj(classification).context,safeObj(observation).context,"environment.unknown"),
    riskLevel:firstText(src.riskLevel,safeObj(risk).level,"unknown"),
    sensorType:firstText(src.sensorType,safeObj(observation).sensorType,"unknown"),
    warnings:safeArray(src.warnings||safeObj(observation).warnings).slice(0,12),
    observation:Object.keys(observation).length?observation:undefined,
    risk:Object.keys(risk).length?risk:undefined,
    classification:Object.keys(classification).length?classification:undefined,
    pipeline:safeObj(src.pipeline),
    updatedAt:Date.now()
  };
}
function runAsterPassiveObservationSafe(normalized={},input={}){
  const startedAt=Date.now();
  const shouldObserve=bridgeAsterShouldObserve(input,normalized);
  if(!shouldObserve){
    return {
      version:ASTER_BRIDGE_VERSION,
      gateway:"Aster",
      stage:"passive_observation",
      active:false,
      available:!!runAsterEnvironmentAdapter,
      observational:true,
      finalAnswerAuthorized:false,
      marionAuthorityRequired:true,
      publicAgent:"nyx",
      displayAuthority:"nyx",
      noUserFacingDiagnostics:true,
      skipped:true,
      reason:"no-aster-observation-signal",
      durationMs:Date.now()-startedAt
    };
  }
  if(typeof runAsterEnvironmentAdapter!=="function"){
    return {
      version:ASTER_BRIDGE_VERSION,
      gateway:"Aster",
      stage:"passive_observation",
      active:false,
      available:false,
      observational:true,
      finalAnswerAuthorized:false,
      marionAuthorityRequired:true,
      publicAgent:"nyx",
      displayAuthority:"nyx",
      noUserFacingDiagnostics:true,
      skipped:true,
      reason:"aster-environment-adapter-unavailable",
      durationMs:Date.now()-startedAt
    };
  }
  try{
    const asterInput=bridgeAsterBuildInput(input,normalized);
    const result=safeObj(runAsterEnvironmentAdapter(asterInput,{source:"marionBridge",mode:"passive",marionAuthorityRequired:true}));
    const compact=compactAsterObservationForBridge({...result,active:true,available:true});
    return {...compact,input:asterInput,durationMs:Date.now()-startedAt};
  }catch(err){
    return {
      version:ASTER_BRIDGE_VERSION,
      gateway:"Aster",
      stage:"passive_observation",
      active:false,
      available:true,
      ok:false,
      observational:true,
      finalAnswerAuthorized:false,
      marionAuthorityRequired:true,
      publicAgent:"nyx",
      displayAuthority:"nyx",
      noUserFacingDiagnostics:true,
      warnings:["aster-passive-observation-failed"],
      error:safeStr(err&&(err.message||err)||"aster-passive-observation-failed"),
      durationMs:Date.now()-startedAt
    };
  }
}

function finiteTimestampForBridge(value){
  if(value===null||value===undefined||value==="")return 0;
  if(value instanceof Date){const t=value.getTime();return Number.isFinite(t)?t:0;}
  const n=Number(value);
  if(Number.isFinite(n)&&n>0)return n;
  const parsed=Date.parse(safeStr(value));
  return Number.isFinite(parsed)?parsed:0;
}
function newestTimestampForBridge(){let newest=0;for(let i=0;i<arguments.length;i+=1){const t=finiteTimestampForBridge(arguments[i]);if(t>newest)newest=t;}return newest;}
function bridgeLaneRecencySummary(coordination={}){
  const c=safeObj(coordination), telemetry=safeObj(c.coordinationTelemetry), dualTrack=safeObj(c.dualTrack), dualTrackMeta=safeObj(safeObj(c.dualTrack).coordinationMeta);
  const recency=firstObj(safeObj(telemetry.laneRecency),safeObj(dualTrack.laneRecency),safeObj(dualTrackMeta.laneRecency));
  const staleLanes=safeArray(telemetry.staleLanes||recency.staleLanes||recency.staleTracks||dualTrackMeta.staleTracks||dualTrackMeta.staleLanes);
  return {
    active:!!Object.keys(recency).length||staleLanes.length>0,
    staleCarrySuppressed:staleLanes.length>0||safeObj(recency).staleCarrySuppressed===true||dualTrackMeta.staleCarrySuppressed===true,
    staleLanes,
    currentTracks:safeArray(recency.currentTracks||dualTrackMeta.activeTracks),
    previousTracks:safeArray(recency.previousTracks),
    laneRecency:recency,
    noUserFacingDiagnostics:true,
    publicReplyVisible:false,
    userFacing:false,
    source:"marionBridge"
  };
}

function buildParallelCoordinationSafe(normalized={},input={}){
  const startedAt=Date.now();
  const payload={
    ...safeObj(input),
    text:firstText(normalized.userQuery,safeObj(input).text,safeObj(input).message),
    message:firstText(normalized.userQuery,safeObj(input).message,safeObj(input).text),
    languageMeta:safeObj(normalized.languageMeta),
    lingoInput:safeObj(normalized.lingoInput),
    translationMeta:safeObj(normalized.translationMeta),
    glossaryMeta:safeObj(normalized.glossaryMeta),
    unknownLanguageAlert:safeObj(normalized.unknownLanguageAlert),
    scannerHeartbeat:safeObj(normalized.scannerHeartbeat),
    dormantScanner:safeObj(normalized.dormantScanner),
    gatewayMeta:firstObj(normalized.lingoSentinelGatewayMeta,normalized.gatewayMeta),
    realWorldObservation:firstObj(normalized.asterObservation,normalized.asterPassiveObservation,safeObj(input).realWorldObservation,safeObj(input).observation,safeObj(input).environment),
    realWorldTrack:safeObj(normalized.asterPassiveObservation),
    strategicReview:firstObj(safeObj(input).strategicReview,safeObj(input).thalon,safeObj(input).thalonReview),
    thalon:firstObj(safeObj(input).thalon,safeObj(input).thalonReview,safeObj(input).strategicReview),
    updatedAt:newestTimestampForBridge(safeObj(input).updatedAt,normalized.updatedAt,Date.now()),
    laneUpdatedAt:firstObj(safeObj(input).laneUpdatedAt,safeObj(normalized).laneUpdatedAt)
  };
  let dualTrack={version:"nyx.marion.dualTrackGateway/unavailable",enabled:false,coordinationMeta:{activeTracks:[],reason:"dual_track_gateway_unavailable",source:"marionBridge"},authority:{finalAuthority:"Marion",neverOverrideMarion:true},marionAuthority:true,finalAuthority:"Marion",source:"marionBridge"};
  try{if(typeof buildMarionDualTrackPacket==="function")dualTrack=safeObj(buildMarionDualTrackPacket(payload,{source:"marionBridge",config:{enabled:true}}));}catch(err){dualTrack={...dualTrack,ok:false,error:safeStr(err&&(err.message||err)||"dual_track_gateway_failed")};}
  let riskClassification={};
  try{if(typeof classifyRiskLevel==="function")riskClassification=safeObj(classifyRiskLevel({realWorldTrack:safeObj(dualTrack.realWorldTrack),realWorldEnvelope:safeObj(safeObj(dualTrack.realWorldTrack).envelope),observationSummary:firstText(safeObj(safeObj(dualTrack.realWorldTrack).envelope).observationSummary,safeObj(payload.realWorldObservation).summary,payload.text)},{source:"marionBridge"}));}catch(err){riskClassification={ok:false,error:safeStr(err&&(err.message||err)||"risk_classifier_failed"),source:"marionBridge"};}
  let ethicalGate={};
  try{if(typeof evaluateEthicalGate==="function")ethicalGate=safeObj(evaluateEthicalGate({realWorldTrack:safeObj(dualTrack.realWorldTrack),realWorldEnvelope:safeObj(safeObj(dualTrack.realWorldTrack).envelope),riskClassification,observationSummary:firstText(safeObj(safeObj(dualTrack.realWorldTrack).envelope).observationSummary,safeObj(payload.realWorldObservation).summary,payload.text)},{source:"marionBridge"}));}catch(err){ethicalGate={ok:false,error:safeStr(err&&(err.message||err)||"ethical_gatekeeper_failed"),source:"marionBridge"};}
  const telemetryPayload={...payload,...safeObj(dualTrack),riskClassification,ethicalGate,ethicalGatekeeper:ethicalGate};
  let coordinationTelemetry={};
  try{if(typeof buildMarionCoordinationTelemetry==="function")coordinationTelemetry=safeObj(buildMarionCoordinationTelemetry(telemetryPayload,{source:"marionBridge",config:{enabled:true}}));}catch(err){coordinationTelemetry={ok:false,error:safeStr(err&&(err.message||err)||"coordination_telemetry_failed"),source:"marionBridge"};}
  const recencyMaintenance=bridgeLaneRecencySummary({dualTrack,coordinationTelemetry});
  return {
    version:"nyx.marion.parallelLaneCoordination/0.2",
    active:true,
    dualTrack,
    dualTrackSummary:typeof summarizeDualTrackPacket==="function"?safeObj(summarizeDualTrackPacket(dualTrack)):safeObj(dualTrack.coordinationMeta),
    riskClassification,
    ethicalGate,
    coordinationTelemetry,
    recencyMaintenance,
    staleLaneCarrySuppressed:recencyMaintenance.staleCarrySuppressed===true,
    staleLanes:recencyMaintenance.staleLanes,
    coordinationSummary:typeof summarizeCoordinationTelemetry==="function"?safeObj(summarizeCoordinationTelemetry(coordinationTelemetry)):safeObj(coordinationTelemetry),
    marionAuthority:true,
    finalAuthority:"Marion",
    advisoryOnly:true,
    publicReplyVisible:false,
    userFacing:false,
    durationMs:Date.now()-startedAt,
    source:"marionBridge"
  };
}

function applyLingoSentinelReplyOverride(packet={},ctx={}){
  const answer=buildProjectGatewayPublicAnswerFromPacket(packet,ctx);
  if(!answer)return safeObj(packet);
  const out=safeObj(packet);
  const current=firstText(out.reply,out.text,out.answer,out.output,out.response,out.message,out.displayReply,safeObj(out.payload).reply,safeObj(out.finalEnvelope).reply);
  if(current&&!isPrimitivePublicReply(current)&&!isGenericGreetingStatusFallback(current)&&!isPublicControlPolicyLeak(current)&&!isThinPlaceholderText(current))return out;
  out.reply=answer;out.text=answer;out.answer=answer;out.output=answer;out.response=answer;out.message=answer;out.displayReply=answer;out.spokenText=answer;out.textSpeak=answer;out.textDisplay=answer;
  out.payload={...safeObj(out.payload),reply:answer,text:answer,message:answer,answer,output:answer,response:answer,displayReply:answer,spokenText:answer,textSpeak:answer,textDisplay:answer};
  out.finalEnvelope={...safeObj(out.finalEnvelope),reply:answer,text:answer,displayReply:answer,spokenText:answer};
  if(isObj(out.speech))out.speech={...out.speech,text:answer,textDisplay:answer,textSpeak:answer};
  out.meta={...safeObj(out.meta),lingoSentinelGreetingPrecedence:true,noUserFacingDiagnostics:true};
  return out;
}

function normalizePublicNyxAddress(value){
  let text=safeStr(value);
  if(!text)return "";
  text=text
    .replace(/^(\s*(?:hi|hello|hey|yo|hiya|bonjour|salut|hola|buenos\s+d[ií]as|good\s+morning|good\s+afternoon|good\s+evening)\s+)(marion)(\b|[,:\-])/i,(m,a,_name,b)=>`${a}Nyx${b||""}`)
    .replace(/^\s*marion\s*[,:\-]\s*/i,"Nyx, ");
  return text.replace(/\s+/g," ").trim();
}
function buildNyxPublicContextPassport(surface={}){
  const s=safeObj(surface);
  const source=firstText(s.sourceLanguage,s.detectedLanguage,"unknown").toLowerCase();
  const target=firstText(s.targetLanguage,s.responseLanguage,"en").toLowerCase();
  const domain=firstText(s.activeDomain,s.domain,"general");
  const confidenceBand=firstText(s.confidenceBand,"unknown");
  const handoffStatus=firstText(s.handoffStatus,"available");
  const fallbackUsed=!!s.fallbackUsed;
  const langLabel=(v)=>({en:"EN",es:"ES",fr:"FR",unknown:"Language"}[String(v||"").toLowerCase()]||String(v||"Language").toUpperCase());
  const domainLabel=(v)=>({general:"General",ai:"AI",psychology:"Psychology",english:"English",finance:"Finance",law:"Law",cyber:"Cyber",business:"Business"}[String(v||"").toLowerCase()]||firstText(v,"General"));
  const label=fallbackUsed?`${langLabel(target)} fallback · Nyx ✓`:(source&&source!=="unknown"&&source!==target?`${langLabel(source)} → ${langLabel(target)} · ${domainLabel(domain)} · Nyx ✓`:`${langLabel(target)} · ${domainLabel(domain)} · Nyx ✓`);
  return {visible:true,authority:"marion",displayAuthority:"nyx",publicAgent:"nyx",userFacingAgent:"Nyx",sourceLanguage:source,targetLanguage:target,activeLanguage:source,responseLanguage:target,activeDomain:domain,confidenceBand,toneMode:firstText(s.toneMode,"clear_direct"),handoffStatus,fallbackUsed,label,shortLabel:label.length>52?`${label.slice(0,49).trim()}…`:label};
}

function languageSphereSafeCall(fn,fallback){
  try{return typeof fn==="function"?fn():fallback;}catch(_){return fallback;}
}
function safeHasOwn(obj,key){
  return Object.prototype.hasOwnProperty.call(safeObj(obj),key);
}
function safeClonePlain(value){
  return safeObj(jsonSafe(value));
}
function isMarionAuthorityValue(value){
  const v=safeStr(value).toLowerCase().replace(/[\s:_-]+/g,"").replace(/\.+/g,".");
  return v==="marion"||v==="marionfinal"||v==="marionfinalenvelope"||v==="finalauthority"||v.startsWith("marion.")||v.startsWith("compose.finaluserfacingreply")||v.startsWith("compose.final-user-facing-reply");
}
function normalizeLanguageSphereSurface(value={}){
  const src=safeObj(value);
  return {
    version:firstText(src.version,LANGUAGE_SPHERE_BRIDGE_VERSION),
    authority:isMarionAuthorityValue(src.authority)?safeStr(src.authority):"marion",
    sourceLanguage:firstText(src.sourceLanguage,src.detectedLanguage,"en").toLowerCase(),
    targetLanguage:firstText(src.targetLanguage,src.responseLanguage,"en").toLowerCase(),
    confidence:Number.isFinite(Number(src.confidence))?Math.max(0,Math.min(1,Number(src.confidence))):null,
    confidenceBand:firstText(src.confidenceBand,"unknown"),
    activeDomain:firstText(src.activeDomain,src.domain,"general"),
    routeFamily:firstText(src.routeFamily,"marion_bridge_final"),
    toneMode:firstText(src.toneMode,"clear_direct"),
    fallbackUsed:!!src.fallbackUsed,
    handoffStatus:firstText(src.handoffStatus,"available"),
    visibleToUser:src.visibleToUser!==false,
    projectGateway:firstText(src.projectGateway,src.gateway,"lingosentinel"),
    environmentalPathway:safeClonePlain(src.environmentalPathway),
    publicAgent:"nyx",
    userFacingAgent:"Nyx",
    displayAuthority:"nyx",
    contextPassport:safeClonePlain(src.contextPassport),
    events:safeArray(src.events).map((event)=>safeClonePlain(event)).slice(0,20),
    telemetry:safeClonePlain(src.telemetry)
  };
}
function normalizeBridgeLanguageCode(value, fallback=""){
  const raw=safeStr(value).toLowerCase().trim();
  const compact=raw.replace(/[^a-z]/g,"");
  if(!raw)return fallback;
  if(raw==="auto")return"auto";
  if(raw.startsWith("en")||compact==="english"||compact==="anglais"||compact==="ingles")return"en";
  if(raw.startsWith("fr")||compact==="french"||compact==="francais"||compact==="français"||compact==="frances")return"fr";
  if(raw.startsWith("es")||compact==="spanish"||compact==="espanol"||compact==="español"||compact==="espagnol")return"es";
  return fallback;
}
function extractBridgeDirectTranslationCommand(value=""){
  const original=safeStr(value);
  const patterns=[
    /^(?:please\s+)?translate\s+(?:only\s+)?(?:this\s+)?(?:sentence|text|phrase|line|copy|message)?\s*(?:into|to)\s+([a-zA-ZÀ-ÿ\-]+)\s*[:\-–—]\s*(.+)$/i,
    /^(?:please\s+)?translate\s+(?:only\s+)?(.+?)\s+(?:into|to)\s+([a-zA-ZÀ-ÿ\-]+)\s*$/i,
    /^(?:please\s+)?(?:put|render|convert)\s+(?:this\s+)?(?:sentence|text|phrase|line|copy|message)?\s*(?:into|to|in)\s+([a-zA-ZÀ-ÿ\-]+)\s*[:\-–—]\s*(.+)$/i
  ];
  for(const rx of patterns){
    const m=original.match(rx);if(!m)continue;
    let sourceText="",targetLanguage="";
    if(rx.source.includes("(.+?)\\s+(?:into|to)")){sourceText=safeStr(m[1]);targetLanguage=normalizeBridgeLanguageCode(m[2],"");}
    else{targetLanguage=normalizeBridgeLanguageCode(m[1],"");sourceText=safeStr(m[2]);}
    sourceText=sourceText.replace(/^["'“”‘’]+|["'“”‘’]+$/g,"").trim();
    if(sourceText&&["en","fr","es"].includes(targetLanguage))return{matched:true,sourceText,targetLanguage,sourceLanguage:"auto",originalCommandText:original,directTranslationCommand:true};
  }
  return{matched:false,sourceText:"",targetLanguage:"",sourceLanguage:"auto",originalCommandText:original};
}
function normalizeBridgeTranslationKey(value=""){
  return lower(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function buildBridgeDirectTranslationFallback(sourceText="",targetLanguage=""){
  const src=safeStr(sourceText);
  const target=normalizeBridgeLanguageCode(targetLanguage,"");
  const key=normalizeBridgeTranslationKey(src);
  if(!src||!["en","fr","es"].includes(target))return"";
  const phraseMap={
    en:{
      "commencer la lecture":"Start Reading",
      "comenzar a leer":"Start Reading",
      "comenzar la lectura":"Start Reading",
      "sandblast offre aux createurs une scene mondiale":"Sandblast gives creators a global stage",
      "sandblast offre aux createurs une scene ouverte sur le monde":"Sandblast gives creators a global stage",
      "sandblast ofrece a los creadores un escenario global":"Sandblast gives creators a global stage"
    },
    fr:{
      "start reading":"Commencer la lecture",
      "sandblast gives creators a global stage":"Sandblast offre aux créateurs une scène mondiale"
    },
    es:{
      "start reading":"Comenzar a leer",
      "sandblast gives creators a global stage":"Sandblast ofrece a los creadores un escenario global"
    }
  };
  return phraseMap[target]&&phraseMap[target][key]?phraseMap[target][key]:"";
}
function isBridgeDirectTranslationClarifier(value=""){
  const text=safeStr(value);
  return /are you asking about translation,? captions,? or language routing inside the interface\??/i.test(text) ||
    /translation,? captions,? or language routing/i.test(text);
}
function languageSphereText(input={}){
  const o=safeObj(input),ls=safeObj(o.languageSphere),cmd=extractBridgeDirectTranslationCommand(firstText(ls.originalCommandText,o.rawUserQuery,o.userQuery,o.text,o.query,o.userText,o.message));
  return firstText(ls.sourceText,cmd.sourceText,o.userQuery,o.text,o.query,o.rawUserQuery,o.userText,o.message);
}
function languageSphereTargetLanguage(input={}){
  const o=safeObj(input), original=safeObj(o.original), body=safeObj(original.body), meta=safeObj(original.meta), ls=safeObj(o.languageSphere), cmd=extractBridgeDirectTranslationCommand(firstText(ls.originalCommandText,o.rawUserQuery,o.userQuery,o.text,o.query,o.userText,o.message));
  return normalizeBridgeLanguageCode(firstText(ls.targetLanguage,cmd.targetLanguage,o.targetLanguage,o.responseLanguage,original.targetLanguage,body.targetLanguage,meta.targetLanguage,"en"),"en");
}
async function normalizeLanguageSphereInboundSafe(normalized={}){
  if(!universalTranslatorMod||typeof universalTranslatorMod.normalizeInputForMarion!=="function"){
    return {ok:false,unavailable:true,normalizedPatch:{languageSphere:{version:LANGUAGE_SPHERE_BRIDGE_VERSION,available:false,stage:"input",authority:"marion"}}};
  }
  const startedAt=Date.now();
  try{
    const domain=firstText(normalized.knowledgeDomain,normalized.domain,normalized.requestedDomain,"general");
    const targetLanguage=languageSphereTargetLanguage(normalized);
    const originalText=languageSphereText(normalized);
    const result=safeObj(await Promise.resolve(universalTranslatorMod.normalizeInputForMarion(originalText,{targetLanguage:"en",domain,context:"marion-routing"})));
    const normalizedText=firstText(result.normalizedText,originalText);
    const translatedForRouting=result.translatedForRouting===true&&normalizedText&&normalizedText!==originalText;
    return {
      ok:true,
      normalizedPatch:{
        ...(translatedForRouting?{userQuery:normalizedText,text:normalizedText,query:normalizedText}:{}),
        languageSphere:{
          version:LANGUAGE_SPHERE_BRIDGE_VERSION,
          available:true,
          stage:"input",
          authority:"marion",
          originalText,
          normalizedText,
          detectedLanguage:firstText(result.detectedLanguage,"unknown"),
          sourceLanguage:firstText(result.detectedLanguage,"unknown"),
          targetLanguage,
          routingLanguage:"en",
          detectionConfidence:Number.isFinite(Number(result.detectionConfidence))?Number(result.detectionConfidence):null,
          translatedForRouting,
          fallbackUsed:result.translatedForRouting!==true,
          translationMeta:safeObj(result.translationMeta),
          durationMs:Date.now()-startedAt
        }
      }
    };
  }catch(err){
    return {ok:false,error:"language_sphere_input_exception",message:safeStr(err&&(err.message||err)||""),normalizedPatch:{languageSphere:{version:LANGUAGE_SPHERE_BRIDGE_VERSION,available:false,stage:"input",authority:"marion",fallbackUsed:true,error:"input-normalization-failed",durationMs:Date.now()-startedAt}}};
  }
}
function normalizeLingoSentinelGatewaySurfaceForBridge(value={}){
  const src=safeObj(value);
  const response=safeObj(src.lingoSentinelResponse);
  const authorityReview=safeObj(src.authorityReview);
  const languageMeta=safeObj(src.languageMeta);
  const translationMeta=safeObj(src.translationMeta);
  const glossaryMeta=firstObj(src.glossaryMeta,response.glossaryMeta);
  const gatewayMeta=safeObj(src.gatewayMeta||src.lingoSentinelGatewayMeta);
  const unknownLanguageAlert=safeObj(src.unknownLanguageAlert);
  const scannerHeartbeat=safeObj(src.scannerHeartbeat);
  const dormantScanner=safeObj(src.dormantScanner);
  const route=firstText(src.route,gatewayMeta.route,"MARION_ONLY");
  const sourceLanguage=firstText(src.sourceLanguage,response.sourceLanguage,response.detectedLanguage,languageMeta.detectedLanguage,translationMeta.sourceLanguage,"unknown");
  const targetLanguage=firstText(src.targetLanguage,response.targetLanguage,translationMeta.targetLanguage,"en");
  const confidence=Number.isFinite(Number(src.confidence))?Number(src.confidence):(Number.isFinite(Number(response.confidence))?Number(response.confidence):(Number.isFinite(Number(languageMeta.confidence))?Number(languageMeta.confidence):null));
  const inputHash=firstText(src.inputHash,gatewayMeta.inputHash,gatewayMeta.stableHash,src.requestId,"");
  const gatewayHash=firstText(src.gatewayHash,gatewayMeta.gatewayHash,gatewayMeta.stableHash,src.requestId,"");
  const stableHash=firstText(src.stableHash,gatewayMeta.stableHash,gatewayHash,inputHash,src.requestId,"");
  const correlationId=firstText(src.correlationId,gatewayMeta.correlationId,src.requestId,gatewayHash,stableHash,"");
  const traceId=firstText(src.traceId,gatewayMeta.traceId,src.requestId,correlationId,"");
  const routed=src.routed===true||route.indexOf("LINGOSENTINEL_")===0;
  const fallbackTriggered=src.ok===false||response.fallbackUsed===true||languageMeta.fallbackTriggered===true||translationMeta.fallbackTriggered===true||gatewayMeta.fallbackTriggered===true;
  const finalText=firstText(src.finalText,authorityReview.finalText,response.finalText,response.adaptedText,response.translatedText,translationMeta.advisoryText,translationMeta.translatedText,translationMeta.renderText,translationMeta.publicText,translationMeta.text,"");
  return {
    version: LINGOSENTINEL_GATEWAY_BRIDGE_VERSION,
    available: !!runLingoSentinelGateway,
    active: src.ok !== false && routed,
    routed,
    route,
    requestId:firstText(src.requestId,gatewayMeta.requestId,""),
    stage: "bridge-input",
    authority: "marion",
    advisoryOnly: true,
    marionFinalAuthority: src.marionFinalAuthority !== false,
    approvedByMarion: authorityReview.approved !== false && src.ok !== false,
    detectedLanguage: sourceLanguage,
    sourceLanguage,
    targetLanguage,
    confidence,
    supported: languageMeta.supported !== false,
    requiresTranslation: routed,
    translated: !!(routed && finalText && src.ok !== false),
    fallbackTriggered,
    alertTriggered: !!(unknownLanguageAlert.alertTriggered || gatewayMeta.alertTriggered || safeObj(dormantScanner.unknownLanguageAlert).alertTriggered),
    notificationReady: !!(unknownLanguageAlert.notificationReady || gatewayMeta.notificationReady || dormantScanner.notificationReady),
    scannerReady: firstText(scannerHeartbeat.status,"")==="ready" || safeObj(dormantScanner.telemetry).scannerReady === true,
    originalText: firstText(src.originalText,src.originalInput,safeObj(src.lingoInput).originalText),
    normalizedText: firstText(src.normalizedText,src.input,src.message,safeObj(src.lingoInput).normalizedText),
    advisoryText: finalText,
    glossaryIntact: safeObj(src.glossaryIntegrity).intact !== false,
    restoredTerms: safeArray(glossaryMeta.restoredTerms),
    gatewayMeta,
    unknownLanguageAlert,
    scannerHeartbeat,
    dormantScanner,
    authorityReview,
    telemetry: safeObj(src.telemetry),
    inputHash,
    gatewayHash,
    stableHash,
    correlationId,
    traceId,
    noUserFacingDiagnostics: true,
    source: "MarionLingoSentinelGateway"
  };
}
function buildLingoSentinelBridgePatch(result={},originalText=""){
  const src=safeObj(result);
  const response=safeObj(src.lingoSentinelResponse);
  const authorityReview=safeObj(src.authorityReview);
  const route=firstText(src.route,"MARION_ONLY");
  const sourceLanguage=firstText(src.sourceLanguage,response.sourceLanguage,response.detectedLanguage,"unknown");
  const targetLanguage=firstText(src.targetLanguage,response.targetLanguage,"en");
  const finalText=firstText(src.finalText,authorityReview.finalText,response.finalText,response.adaptedText,response.translatedText,"");
  const confidence=Number.isFinite(Number(src.confidence))?Number(src.confidence):(Number.isFinite(Number(response.confidence))?Number(response.confidence):null);
  const routed=src.routed===true||route.indexOf("LINGOSENTINEL_")===0;
  const gatewayMeta={
    version:LINGOSENTINEL_GATEWAY_BRIDGE_VERSION,
    source:"MarionLingoSentinelGateway",
    requestId:firstText(src.requestId,""),
    ok:src.ok!==false,
    routed,
    route,
    marionFinalAuthority:src.marionFinalAuthority!==false,
    approvedByMarion:authorityReview.approved!==false&&src.ok!==false,
    fallbackTriggered:src.ok===false||response.fallbackUsed===true,
    reason:firstText(src.reason,authorityReview.reason,""),
    latencyMs:Number.isFinite(Number(safeObj(safeArray(safeObj(src.telemetry).events).slice(-1)[0]).latencyMs))?Number(safeObj(safeArray(safeObj(src.telemetry).events).slice(-1)[0]).latencyMs):null
  };
  const languageMeta=safeObj(src.languageMeta);
  const translationMeta=safeObj(src.translationMeta);
  const patch={
    lingoSentinel:normalizeLingoSentinelGatewaySurfaceForBridge({...src,gatewayMeta}),
    languageMeta:Object.keys(languageMeta).length?languageMeta:{detectedLanguage:sourceLanguage,sourceLanguage,targetLanguage,confidence,supported:true,requiresTranslation:routed,fallbackTriggered:src.ok===false||response.fallbackUsed===true,route},
    lingoInput:safeObj(src.lingoInput),
    translationMeta:Object.keys(translationMeta).length?translationMeta:{sourceLanguage,targetLanguage,translated:!!(routed&&finalText&&src.ok!==false),translatedText:finalText,advisoryText:finalText,finalText,confidence,route,fallbackTriggered:src.ok===false||response.fallbackUsed===true},
    glossaryMeta:safeObj(src.glossaryMeta||response.glossaryMeta),
    glossaryIntegrity:safeObj(src.glossaryIntegrity),
    unknownLanguageAlert:safeObj(src.unknownLanguageAlert),
    scannerHeartbeat:safeObj(src.scannerHeartbeat),
    dormantScanner:safeObj(src.dormantScanner),
    lingoSentinelGatewayMeta:gatewayMeta,
    lingoSentinelTelemetry:safeObj(src.telemetry),
    lingoSentinelResponse:response,
    lingoSentinelAuthorityReview:authorityReview,
    inputHash:firstText(src.inputHash,gatewayMeta.requestId),
    gatewayHash:firstText(src.gatewayHash,gatewayMeta.requestId),
    stableHash:firstText(src.stableHash,gatewayMeta.requestId),
    correlationId:firstText(src.correlationId,gatewayMeta.requestId),
    traceId:firstText(src.traceId,gatewayMeta.requestId),
    notificationReady:!!(gatewayMeta.notificationReady||safeObj(src.unknownLanguageAlert).notificationReady||safeObj(src.dormantScanner).notificationReady),
    marionAuthority:true,
    finalAuthority:"Marion"
  };
  if(!Object.keys(patch.lingoInput).length){patch.lingoInput={originalText:firstText(src.originalText,originalText),normalizedText:firstText(src.originalText,originalText),route};}
  return patch;
}
async function runLingoSentinelGatewayForBridgeSafe(normalized={},rawInput={}){
  const originalText=firstText(normalized.rawUserQuery, normalized.originalText, normalized.userQuery, normalized.text, normalized.query, safeObj(rawInput).message, safeObj(rawInput).text);
  if(typeof runLingoSentinelGateway!=="function"){
    return {ok:false,unavailable:true,normalizedPatch:{lingoSentinel:{version:LINGOSENTINEL_GATEWAY_BRIDGE_VERSION,available:false,active:false,authority:"marion",advisoryOnly:true,stage:"bridge-input",reason:"lingosentinel_gateway_unavailable",noUserFacingDiagnostics:true}}};
  }
  try{
    const result=safeObj(await Promise.resolve(runLingoSentinelGateway({
      requestId:firstText(normalized.turnId,safeObj(rawInput).turnId,safeObj(rawInput).requestId),
      text:firstText(normalized.userQuery, normalized.text, originalText),
      message: originalText,
      originalInput: originalText,
      sourceLanguage:firstText(safeObj(normalized.languageSphere).sourceLanguage,safeObj(normalized.languageMeta).sourceLanguage,"auto"),
      targetLanguage:firstText(safeObj(normalized.languageSphere).targetLanguage,safeObj(normalized.languageMeta).targetLanguage,"en"),
      domain:firstText(normalized.knowledgeDomain,normalized.domain,"general"),
      languageSphere: safeObj(normalized.languageSphere),
      payload: safeObj(normalized.payload),
      meta: safeObj(normalized.meta)
    },{
      defaultTargetLanguage:"en",
      domain:firstText(normalized.knowledgeDomain,normalized.domain,"general"),
      safetyContext:safeObj(normalized.safetyContext)
    })));
    const patch=buildLingoSentinelBridgePatch(result,originalText);
    return {ok:true,normalizedPatch:patch,lingoSentinelGateway:result};
  }catch(err){
    return {ok:false,error:"lingosentinel_gateway_exception",message:safeStr(err&&(err.message||err)||""),normalizedPatch:{lingoSentinel:{version:LINGOSENTINEL_GATEWAY_BRIDGE_VERSION,available:false,active:false,authority:"marion",advisoryOnly:true,stage:"bridge-input",fallbackTriggered:true,error:"gateway-failed-safe",noUserFacingDiagnostics:true}}};
  }
}
function languageSpherePayload({normalized={},routed={},contract={},reply="",runtimeTelemetry={}}={}){
  const routing=safeObj(routed.routing);
  const inputSphere=safeObj(normalized.languageSphere);
  return {
    requestId:firstText(normalized.turnId,safeObj(contract.meta).turnId,"languagesphere-bridge"),
    finalAnswer:firstText(reply,contract.finalAnswer,contract.final,contract.reply,contract.text),
    sourceLanguage:firstText(inputSphere.sourceLanguage,inputSphere.detectedLanguage,contract.sourceLanguage,safeObj(contract.translationMeta).sourceLanguage,"en"),
    targetLanguage:firstText(inputSphere.targetLanguage,contract.targetLanguage,safeObj(contract.translationMeta).targetLanguage,"en"),
    detectedLanguage:firstText(inputSphere.detectedLanguage,inputSphere.sourceLanguage,"en"),
    confidence:Number.isFinite(Number(inputSphere.detectionConfidence))?Number(inputSphere.detectionConfidence):null,
    confidenceBand:firstText(inputSphere.confidenceBand,safeObj(contract.languageSphere).confidenceBand,"unknown"),
    activeDomain:firstText(routing.knowledgeDomain,routing.domain,contract.domain,normalized.knowledgeDomain,normalized.domain,"general"),
    domain:firstText(routing.domain,contract.domain,normalized.domain,"general"),
    routeFamily:firstText(routing.routeFamily,routing.answerMode,contract.routeFamily,"marion_bridge_final"),
    toneMode:firstText(safeObj(contract.languageSphere).toneMode,safeObj(contract.translationMeta).toneMode,"clear_direct"),
    fallbackUsed:!!(inputSphere.fallbackUsed||safeObj(contract.translationMeta).fallbackUsed),
    handoffStatus:firstText(safeObj(contract.languageSphere).handoffStatus,inputSphere.translatedForRouting?"complete":"available","available"),
    language_detect_ms:Number(inputSphere.durationMs||0),
    final_envelope_ms:Number(safeObj(runtimeTelemetry).durationMs||0),
    total_pipeline_ms:Number(safeObj(runtimeTelemetry).durationMs||0),
    metadata:{bridgeVersion:VERSION,languageSphereBridgeVersion:LANGUAGE_SPHERE_BRIDGE_VERSION}
  };
}

function applyPublicReplyHygieneToPacket(packet={}){
  const out=safeObj(packet);
  let reply=stripPublicReplyScaffold(firstText(out.reply,out.text,out.displayReply,out.response,safeObj(out.finalEnvelope).reply,safeObj(out.payload).reply));
  reply=stripTelemetryLeakFromReply(reply);
  const fallback=buildLingoSentinelPublicAnswerFromPacket(out,{});
  if(fallback&&(isPrimitivePublicReply(reply)||!reply||isGenericGreetingStatusFallback(reply)||isPublicControlPolicyLeak(reply)||isThinPlaceholderText(reply)))reply=fallback;
  if(isPrimitivePublicReply(reply))reply="";
  if(!reply)return out;
  out.reply=reply;out.text=reply;out.answer=reply;out.output=reply;out.response=reply;out.message=reply;out.displayReply=reply;out.spokenText=stripTelemetryLeakFromReply(stripPublicReplyScaffold(firstText(out.spokenText,reply)))||reply;out.textSpeak=stripTelemetryLeakFromReply(stripPublicReplyScaffold(firstText(out.textSpeak,out.spokenText,reply)))||reply;out.textDisplay=reply;
  out.payload={...safeObj(out.payload),reply,text:reply,message:reply,answer:reply,output:reply,response:reply,displayReply:reply,spokenText:stripTelemetryLeakFromReply(stripPublicReplyScaffold(firstText(safeObj(out.payload).spokenText,reply)))||reply,textSpeak:stripTelemetryLeakFromReply(stripPublicReplyScaffold(firstText(safeObj(out.payload).textSpeak,reply)))||reply,textDisplay:reply};
  out.finalEnvelope={...safeObj(out.finalEnvelope),reply,text:reply,displayReply:reply,spokenText:stripTelemetryLeakFromReply(stripPublicReplyScaffold(firstText(safeObj(out.finalEnvelope).spokenText,reply)))||reply};
  if(isObj(out.speech))out.speech={...out.speech,text:reply,textDisplay:reply,textSpeak:stripTelemetryLeakFromReply(stripPublicReplyScaffold(firstText(out.speech.textSpeak,reply)))||reply};
  return out;
}

function attachLanguageSphereFinalMetadata(packet={},ctx={}){
  const context=safeObj(ctx);
  const normalized=safeObj(context.normalized);
  const ls=safeObj(normalized.languageSphere);
  const cmd=extractBridgeDirectTranslationCommand(firstText(ls.originalCommandText,normalized.rawUserQuery,normalized.userQuery,normalized.text,normalized.query,normalized.userText,normalized.message));
  const fallback=buildBridgeDirectTranslationFallback(firstText(ls.sourceText,cmd.sourceText),firstText(ls.targetLanguage,cmd.targetLanguage));
  let packetForHygiene=safeObj(packet);
  const currentReply=firstText(packetForHygiene.reply,packetForHygiene.text,packetForHygiene.displayReply,safeObj(packetForHygiene.payload).reply,safeObj(packetForHygiene.finalEnvelope).reply);
  if(fallback&&(cmd.matched===true||ls.directTranslationCommand===true)&&(!currentReply||currentReply===firstText(ls.sourceText,cmd.sourceText)||isBridgeDirectTranslationClarifier(currentReply))){
    packetForHygiene={...packetForHygiene,reply:fallback,text:fallback,answer:fallback,output:fallback,response:fallback,displayReply:fallback,spokenText:fallback,textSpeak:fallback,textDisplay:fallback,payload:{...safeObj(packetForHygiene.payload),reply:fallback,text:fallback,message:fallback,answer:fallback,output:fallback,response:fallback,displayReply:fallback,spokenText:fallback,textSpeak:fallback,textDisplay:fallback,bridgeDirectTranslationFallbackApplied:true},finalEnvelope:{...safeObj(packetForHygiene.finalEnvelope),reply:fallback,text:fallback,displayReply:fallback,spokenText:fallback,bridgeDirectTranslationFallbackApplied:true}};
  }
  const out=applyProjectRecoveryReplyOverride(applyLingoSentinelReplyOverride(applyPublicReplyHygieneToPacket(packetForHygiene),ctx),ctx);
  const payload=languageSpherePayload(ctx);
  const finalBuilder=multilingualFinalEnvelopeMod&&typeof multilingualFinalEnvelopeMod.buildMultilingualFinalEnvelope==="function"?multilingualFinalEnvelopeMod.buildMultilingualFinalEnvelope:null;
  const passportEmitter=contextPassportEventsMod&&typeof contextPassportEventsMod.emitContextPassportEvents==="function"?contextPassportEventsMod.emitContextPassportEvents:null;
  const telemetryBuilder=languageSphereTelemetryMod&&typeof languageSphereTelemetryMod.buildTelemetryRecord==="function"?languageSphereTelemetryMod.buildTelemetryRecord:null;
  const multilingual=languageSphereSafeCall(()=>finalBuilder?finalBuilder(payload):{}, {});
  const passport=languageSphereSafeCall(()=>passportEmitter?passportEmitter(payload):{}, {});
  const telemetry=languageSphereSafeCall(()=>telemetryBuilder?telemetryBuilder(payload):{}, {});
  const languageSphere=normalizeLanguageSphereSurface({
    version:LANGUAGE_SPHERE_BRIDGE_VERSION,
    authority:"marion",
    sourceLanguage:firstText(safeObj(multilingual.languageSphere).sourceLanguage,payload.sourceLanguage),
    targetLanguage:firstText(safeObj(multilingual.languageSphere).targetLanguage,payload.targetLanguage),
    confidence:safeObj(multilingual.languageSphere).confidence,
    confidenceBand:firstText(safeObj(multilingual.languageSphere).confidenceBand,payload.confidenceBand),
    activeDomain:firstText(safeObj(multilingual.languageSphere).activeDomain,payload.activeDomain),
    routeFamily:firstText(safeObj(multilingual.languageSphere).routeFamily,payload.routeFamily),
    toneMode:firstText(safeObj(multilingual.languageSphere).toneMode,payload.toneMode),
    fallbackUsed:!!safeObj(multilingual.languageSphere).fallbackUsed||!!payload.fallbackUsed,
    handoffStatus:firstText(safeObj(multilingual.languageSphere).handoffStatus,payload.handoffStatus),
    visibleToUser:true,
    projectGateway:"lingosentinel",
    environmentalPathway:Object.keys(safeObj(normalized.asterPassiveObservation||normalized.aster)).length?{...safeObj(normalized.asterPassiveObservation||normalized.aster),telemetry:undefined,noUserFacingDiagnostics:true}:{name:"Aster",stage:"staged",authority:"marion",active:false,noUserFacingDiagnostics:true},
    contextPassport:safeObj(passport.contextPassport),
    events:safeArray(passport.events),
    telemetry:safeObj(telemetry)
  });
  const contextPassport=Object.keys(safeObj(languageSphere.contextPassport)).length?languageSphere.contextPassport:buildNyxPublicContextPassport(languageSphere);
  languageSphere.contextPassport=contextPassport;
  const languageSphereTelemetry=safeClonePlain(languageSphere.telemetry);
  const publicLanguageSphere={...languageSphere,telemetry:undefined,events:undefined};
  delete publicLanguageSphere.telemetry;
  delete publicLanguageSphere.events;
  const languageSphereEvents=languageSphere.events;
  const multilingualFinalEnvelope=safeObj(multilingual.finalEnvelope);
  const asterSurface=safeObj(normalized.asterPassiveObservation||normalized.aster);
  const lingoSentinelSurface=safeObj(normalized.lingoSentinel);
  const finalEnvelope={...safeObj(out.finalEnvelope),languageSphere:publicLanguageSphere,lingoSentinel:Object.keys(lingoSentinelSurface).length?lingoSentinelSurface:undefined,languageMeta:Object.keys(safeObj(normalized.languageMeta)).length?safeObj(normalized.languageMeta):undefined,translationMeta:Object.keys(safeObj(normalized.translationMeta)).length?safeObj(normalized.translationMeta):undefined,glossaryMeta:Object.keys(safeObj(normalized.glossaryMeta)).length?safeObj(normalized.glossaryMeta):undefined,contextPassport,languageSphereEvents,aster:Object.keys(asterSurface).length?asterSurface:undefined,environmentalPathway:Object.keys(asterSurface).length?asterSurface:undefined};
  return {
    ...out,
    languageSphere:publicLanguageSphere,
    lingoSentinel:Object.keys(safeObj(normalized.lingoSentinel)).length?safeObj(normalized.lingoSentinel):undefined,
    languageMeta:Object.keys(safeObj(normalized.languageMeta)).length?safeObj(normalized.languageMeta):undefined,
    translationMeta:Object.keys(safeObj(normalized.translationMeta)).length?safeObj(normalized.translationMeta):undefined,
    glossaryMeta:Object.keys(safeObj(normalized.glossaryMeta)).length?safeObj(normalized.glossaryMeta):undefined,
    contextPassport,
    languageSphereEvents,
    events:languageSphereEvents,
    languageSphereTelemetry,
    telemetry:undefined,
    multilingualFinalEnvelope:undefined,
    finalEnvelope,
    payload:{...safeObj(out.payload),languageSphere:publicLanguageSphere,lingoSentinel:Object.keys(safeObj(normalized.lingoSentinel)).length?safeObj(normalized.lingoSentinel):undefined,languageMeta:Object.keys(safeObj(normalized.languageMeta)).length?safeObj(normalized.languageMeta):undefined,translationMeta:Object.keys(safeObj(normalized.translationMeta)).length?safeObj(normalized.translationMeta):undefined,glossaryMeta:Object.keys(safeObj(normalized.glossaryMeta)).length?safeObj(normalized.glossaryMeta):undefined,contextPassport,languageSphereEvents,events:languageSphereEvents,aster:Object.keys(asterSurface).length?asterSurface:undefined,environmentalPathway:Object.keys(asterSurface).length?asterSurface:undefined},
    meta:{...safeObj(out.meta),languageSphereBridgeVersion:LANGUAGE_SPHERE_BRIDGE_VERSION,lingoSentinelGatewayBridgeVersion:LINGOSENTINEL_GATEWAY_BRIDGE_VERSION,contextPassport,languageSpherePublic:publicLanguageSphere,lingoSentinel:Object.keys(safeObj(normalized.lingoSentinel)).length?safeObj(normalized.lingoSentinel):undefined,asterBridgeVersion:ASTER_BRIDGE_VERSION,aster:Object.keys(asterSurface).length?asterSurface:undefined,noUserFacingDiagnostics:true},
    diagnostics:{...safeObj(out.diagnostics),lingoSentinelGatewayBridge:{version:LINGOSENTINEL_GATEWAY_BRIDGE_VERSION,available:!!runLingoSentinelGateway,active:!!safeObj(normalized.lingoSentinel).active,advisoryOnly:true,noUserFacingDiagnostics:true},asterBridge:{version:ASTER_BRIDGE_VERSION,adapter:!!runAsterEnvironmentAdapter,passive:true,active:!!safeObj(asterSurface).active,noUserFacingDiagnostics:true},languageSphereBridge:{version:LANGUAGE_SPHERE_BRIDGE_VERSION,universalTranslator:!!universalTranslatorMod,multilingualFinalEnvelope:!!multilingualFinalEnvelopeMod,contextPassportEvents:!!contextPassportEventsMod,telemetry:!!languageSphereTelemetryMod,telemetryAttached:false,noUserFacingDiagnostics:true}}
  };
}


function firstObj(){for(let i=0;i<arguments.length;i+=1){const o=safeObj(arguments[i]);if(Object.keys(o).length)return o;}return {};}
function compactDomainConciergeForBridge(value={}){
  const src=safeObj(value);
  if(!Object.keys(src).length)return {};
  const dc=safeObj(src.domainConfidence);
  const questionShape=safeObj(src.questionShape);
  return {
    version:firstText(src.contract,src.version,DOMAIN_CONCIERGE_VERSION),
    source:firstText(src.source,"DomainConcierge"),
    action:firstText(src.action,"route"),
    route:firstText(src.route,src.domain,dc.primaryDomain,"general"),
    intent:firstText(src.intent,"simple_chat"),
    knowledgeDomain:firstText(src.knowledgeDomain,dc.knowledgeDomain),
    confidence:Number.isFinite(Number(src.confidence))?Math.max(0,Math.min(1,Number(src.confidence))):(Number.isFinite(Number(dc.confidence))?Math.max(0,Math.min(1,Number(dc.confidence))):0),
    confidenceBand:firstText(src.confidenceBand,dc.band),
    needsClarifier:!!src.needsClarifier,
    clarifier:src.needsClarifier?safeStr(src.clarifier):"",
    reason:firstText(src.reason,dc.reason),
    failClosed:!!(src.failClosed||dc.failClosed),
    routeLocked:!!(src.routeLocked||dc.routeLocked),
    noUserFacingDiagnostics:src.noUserFacingDiagnostics!==false,
    confidenceAwareResponseShaping:Object.keys(safeObj(src.confidenceAwareResponseShaping)).length?safeObj(src.confidenceAwareResponseShaping):{},
    questionShape:Object.keys(questionShape).length?{
      version:firstText(questionShape.version,"nyx.marion.questionShapeNormalization/1.0"),
      questionShape:firstText(questionShape.questionShape,"direct_or_unknown"),
      changed:!!questionShape.changed,
      reason:firstText(questionShape.reason)
    }:undefined,
    turnHash:firstText(src.turnHash),
    bridgeCompatible:src.bridgeCompatible!==false,
    composerCompatible:src.composerCompatible!==false,
    stateSpineCompatible:src.stateSpineCompatible!==false
  };
}
function runDomainConciergeSafe(normalized={},routed={},resolvedEmotionPacket={}){
  if(typeof runDomainConcierge!=="function")return {ok:false,unavailable:true,reason:"domain_concierge_unavailable"};
  try{
    const routeResult=safeObj(routed);
    return safeObj(runDomainConcierge({
      text:normalized.userQuery,
      userText:normalized.userQuery,
      rawUserText:normalized.rawUserQuery,
      normalizedUserIntent:normalized.userQuery,
      inputSource:normalized.inputSource,
      lane:normalized.lane,
      requestedDomain:normalized.requestedDomain,
      domain:normalized.domain,
      knowledgeDomain:normalized.knowledgeDomain,
      activeKnowledgeDomain:normalized.activeKnowledgeDomain,
      lastActivatedKnowledgeDomain:normalized.lastActivatedKnowledgeDomain,
      marionIntent:normalized.marionIntent,
      previousMemory:normalized.previousMemory,
      session:{lane:normalized.lane,previousMemory:normalized.previousMemory,marionIntent:normalized.marionIntent,inputSource:normalized.inputSource},
      turnId:normalized.turnId,
      sessionId:normalized.sessionId,
      routeResult,
      routed:routeResult,
      routing:safeObj(routeResult.routing),
      questionShape:safeObj(routeResult.questionShape),
      resolvedEmotion:safeObj(resolvedEmotionPacket.state),
      emotionRuntime:safeObj(resolvedEmotionPacket),
      aster:safeObj(normalized.aster),
      asterObservation:safeObj(normalized.asterObservation),
      asterPassiveObservation:safeObj(normalized.asterPassiveObservation),
      environmentalPathway:safeObj(normalized.environmentalPathway)
    }));
  }catch(err){return {ok:false,error:"domain_concierge_exception",message:safeStr(err&&(err.message||err)||"")};}
}
function mergeDomainConciergeIntoRoute(routed={},concierge={}){
  const base=safeObj(routed), dc=compactDomainConciergeForBridge(concierge);
  if(!Object.keys(dc).length)return base;
  const routing=safeObj(base.routing);
  const rawDc=safeObj(concierge.domainConfidence);
  const nextRouting={
    ...routing,
    domain:firstText(dc.route,routing.domain,"general"),
    intent:firstText(dc.intent,routing.intent,"simple_chat"),
    knowledgeDomain:firstText(dc.knowledgeDomain,routing.knowledgeDomain),
    domainConfidence:normalizeBridgeDomainConfidence(Object.keys(rawDc).length?rawDc:safeObj(routing.domainConfidence),{domain:firstText(dc.route,routing.domain),intent:firstText(dc.intent,routing.intent),secondaryDomains:safeArray(routing.secondaryDomains)}),
    domainConcierge:dc
  };
  return {...base,routing:nextRouting,domainConcierge:dc,confidenceAwareResponseShaping:safeObj(dc.confidenceAwareResponseShaping),domainConfidence:nextRouting.domainConfidence};
}

function buildBridgeRuntimeTelemetry({source="marionBridge",normalized={},routed={},contract={},reply="",finalEnvelopeTrusted=false,canEmit=true,error="",loopGuardResult={},resolvedEmotionPacket={}}={}){
  const n=safeObj(normalized), route=safeObj(safeObj(routed).routing), c=safeObj(contract), meta=safeObj(c.meta), diag=safeObj(c.diagnostics), domainConcierge=compactDomainConciergeForBridge(firstObj(n.domainConcierge,route.domainConcierge,c.domainConcierge,safeObj(c.meta).domainConcierge,safeObj(c.memoryPatch).domainConcierge));
  const finalRenderTelemetry = finalRenderTelemetryMod && typeof finalRenderTelemetryMod.buildFinalRenderTelemetry === "function" ? safeObj(finalRenderTelemetryMod.buildFinalRenderTelemetry({source,stage:canEmit ? "final" : "awaiting_marion",reply,canEmit,finalEnvelopeTrusted,runtimeTelemetry:{intent:firstText(route.intent,c.intent,"simple_chat"),domain:firstText(route.domain,c.domain,n.domain,"general")},domainConfidence:firstObj(route.domainConfidence,c.domainConfidence,n.domainConfidence),error})) : {};
  return {
    version: FINAL_RUNTIME_TELEMETRY_VERSION,
    telemetryVisibilityVersion: TELEMETRY_VISIBILITY_VERSION,
    failureSignature: classifyFailureSignature({source,error,reply,canEmit,stage:canEmit ? "final" : "awaiting_marion",intent:firstText(route.intent,c.intent,"simple_chat"),domain:firstText(route.domain,c.domain,n.domain,"general"),finalEnvelopeTrusted,loopGuardResult}),
    failureSignatureAudit: buildFailureSignatureAudit({source,error,reply,canEmit,stage:canEmit ? "final" : "awaiting_marion",intent:firstText(route.intent,c.intent,"simple_chat"),domain:firstText(route.domain,c.domain,n.domain,"general"),primaryDomain:firstText(route.knowledgeDomain,route.domain,c.domain,n.domain,"general"),secondaryDomains:safeArray(route.secondaryDomains),answerMode:firstText(route.answerMode,c.answerMode),finalEnvelopeTrusted,loopGuardResult}),
    source,
    stage: canEmit ? "final" : "awaiting_marion",
    endpoint: CANONICAL_ENDPOINT,
    finalAuthority: "marionFinalEnvelope",
    replyAuthority: canEmit ? "marionBridge" : "none",
    semanticAuthority: "composeMarionResponse",
    domainConcierge,
    confidenceAwareResponseShaping:safeObj(domainConcierge.confidenceAwareResponseShaping),
    confidenceAwareResponseShapingVersion:CONFIDENCE_AWARE_RESPONSE_SHAPING_VERSION,
    domainConciergeObserved: !!Object.keys(domainConcierge).length,
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
    aster:safeObj(n.asterPassiveObservation||n.aster),
    parallelLaneCoordination:safeObj(n.parallelLaneCoordination),
    parallelLaneRecencyMaintenance:safeObj(safeObj(n.parallelLaneCoordination).recencyMaintenance),
    staleLaneCarrySuppressed:safeObj(safeObj(n.parallelLaneCoordination).recencyMaintenance).staleCarrySuppressed===true,
    dualTrack:safeObj(n.dualTrack),
    coordinationTelemetry:safeObj(n.coordinationTelemetry),
    ethicalGate:safeObj(n.ethicalGate),
    riskClassification:safeObj(n.riskClassification),
    asterBridgeVersion:ASTER_BRIDGE_VERSION,
    finalEnvelopeTrusted: !!finalEnvelopeTrusted,
    finalRenderTelemetry,
    finalRenderTelemetryActive: !!Object.keys(finalRenderTelemetry).length,
    publicSurfaceClean: safeObj(finalRenderTelemetry).publicSurfaceClean !== false,
    hardlockCompatible: !!canEmit,
    updatedAt: Date.now()
  };
}

const TELEMETRY_VISIBILITY_VERSION = "nyx.marion.telemetryVisibility/1.0";
const FAILURE_SIGNATURE_AUDIT_VERSION = "nyx.marion.failureSignatureAudit/1.0";
const KNOWN_FAILURE_SIGNATURES = Object.freeze([
  "none",
  "ROUTE_DOMAIN_MISMATCH",
  "FINAL_ENVELOPE_MISSING",
  "WEAK_FINAL_REJECTED",
  "LOOP_GUARD_SUPPRESSED",
  "PACKET_HIJACK_ATTEMPT",
  "SCHEDULE_PRE_ROUTER_INTERCEPT",
  "TECHNICAL_TARGET_STALE_CARRY",
  "DOMAIN_CONFIDENCE_LOW",
  "VOICE_TEXT_PARITY_DRIFT",
  "COMPOSER_EMPTY_REPLY",
  "BRIDGE_HANDOFF_INVALID",
  "CHATENGINE_COORDINATOR_FAULT",
  "DEBUG_LEAK_BLOCKED"
]);
function telemetryAuditText(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function telemetryAuditObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function classifyFailureSignature(fields={}){
  const f=telemetryAuditObj(fields);
  const text=telemetryAuditText([f.error,f.reply,f.message,f.reason,f.stage,f.source,Array.isArray(f.reasons)?f.reasons.join(" "):""].join(" ")).toLowerCase();
  const loop=telemetryAuditObj(f.loopGuardResult||f.loopGuard);
  if(loop.forceRecovery===true||loop.loopDetected===true||loop.allowReply===false)return"LOOP_GUARD_SUPPRESSED";
  if(/\breply held\b/.test(text))return"LOOP_GUARD_SUPPRESSED";
  if(/\bschedule depends on where you are|city\/timezone|which city\b/.test(text))return"SCHEDULE_PRE_ROUTER_INTERCEPT";
  if(/\bfinal envelope missing|final_envelope_missing|non-final|nonfinal|marion did not return\b/.test(text))return"FINAL_ENVELOPE_MISSING";
  if(/\bweak final|weak_final|rejected final|not trusted|trusted final.*false\b/.test(text))return"WEAK_FINAL_REJECTED";
  if(/\bcomposer.*empty|empty reply|compose_reply_missing|reply missing\b/.test(text))return"COMPOSER_EMPTY_REPLY";
  if(/\bbridge.*invalid|handoff invalid|bridge handoff|contract_invalid|packet_invalid\b/.test(text))return"BRIDGE_HANDOFF_INVALID";
  if(/\bchat_engine_coordinator_fault|coordinator fault|runtimeTelemetry is not defined\b/.test(text))return"CHATENGINE_COORDINATOR_FAULT";
  if(/\bdomain confidence low|low confidence|route ambiguous|ambiguous route\b/.test(text)||f.routeAmbiguous===true)return"DOMAIN_CONFIDENCE_LOW";
  if(/\bvoice.*parity.*drift|mic.*text.*drift|inputsource.*mismatch\b/.test(text)||f.voiceTextParityDrift===true)return"VOICE_TEXT_PARITY_DRIFT";
  if(/\bstale.*target|target.*stale|wrong target\b/.test(text))return"TECHNICAL_TARGET_STALE_CARRY";
  if(/\bpacket hijack|pre-router intercept|packet.*intercept\b/.test(text))return"PACKET_HIJACK_ATTEMPT";
  if(/\broutekind=|finalenvelope|sessionpatch|diagnostic packet|replyauthority=|speechhints=|presenceprofile=|nyxstatehint=\b/i.test(telemetryAuditText(f.reply||"")))return"DEBUG_LEAK_BLOCKED";
  if(f.canEmit===false&&f.finalEnvelopeTrusted===false)return"FINAL_ENVELOPE_MISSING";
  return"none";
}
function buildFailureSignatureAudit(fields={}){
  const f=telemetryAuditObj(fields);
  const signature=classifyFailureSignature(f);
  const primary=telemetryAuditText(f.primaryDomain||f.domain||f.knowledgeDomain||"");
  const secondary=Array.isArray(f.secondaryDomains)?f.secondaryDomains.map(telemetryAuditText).filter(Boolean).slice(0,4):[];
  return {
    version: FAILURE_SIGNATURE_AUDIT_VERSION,
    telemetryVisibilityVersion: TELEMETRY_VISIBILITY_VERSION,
    failureSignature: signature,
    ok: signature==="none",
    severity: signature==="none"?"none":(signature==="DEBUG_LEAK_BLOCKED"?"high":"medium"),
    userVisible: false,
    debugLeakBlocked: true,
    visibleReplyMustRemainClean: true,
    source: telemetryAuditText(f.source||""),
    stage: telemetryAuditText(f.stage||""),
    intent: telemetryAuditText(f.intent||""),
    domain: primary,
    knowledgeDomain: telemetryAuditText(f.knowledgeDomain||""),
    primaryDomain: primary,
    secondaryDomains: secondary,
    answerMode: telemetryAuditText(f.answerMode||""),
    canEmit: f.canEmit!==false,
    finalEnvelopeTrusted: f.finalEnvelopeTrusted!==false && f.trustedFinalEnvelope!==false
  };
}
function isTelemetryLeakText(value=""){
  return /\b(routeKind=|speechHints=|presenceProfile=|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority=|nyxStateHint=|diagnostic packet|final envelope missing|non-final|languageSphereTelemetry|languageSphereFallback|runtimeTelemetry|loggingSpine|packetPrediction|transportOnly|marionTransportOnly|audioContract|compatibilityRoute|compatibilityHealth|stack trace|TypeError|ReferenceError|SyntaxError|bridge blocked an invalid public reply|exposing a runtime value|answer from the active lane|i stopped a repeated response before it could render again|current turn is preserved|fresh Marion final|replaying the same fallback|Index\.js transport[- ]only|loop is being contained at the bridge layer|MarionBridge should accept only one clean Marion final)\b/i.test(telemetryAuditText(value));
}
function stripTelemetryLeakFromReply(value=""){
  const text=telemetryAuditText(value);
  if(!text||isPrimitivePublicReply(text))return"";
  if(isPublicControlPolicyLeak(text))return"";
  if(/^\s*[\[{]/.test(text)&&isTelemetryLeakText(text))return"";
  if(isTelemetryLeakText(text))return text
    .replace(/\b(routeKind|speechHints|presenceProfile|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority|nyxStateHint|languageSphereTelemetry|languageSphereFallback|runtimeTelemetry|loggingSpine|packetPrediction|transportOnly|marionTransportOnly|audioContract|compatibilityRoute|compatibilityHealth)\s*[:=]\s*[^.;,\n}\]]+[.;,]?\s*/gi,"")
    .replace(/\b(diagnostic packet|final envelope missing|non-final|stack trace|TypeError|ReferenceError|SyntaxError)\b/ig,"")
    .replace(/\s+/g," ").trim();
  return text;
}


const SPOKEN_PROJECT_ALIAS_RULES = Object.freeze([
  { canonical: "LanguageSphere", aliases: ["language sphere", "the language sphere", "languagesphere", "language fair", "language fare", "language fear", "language share", "language sheer", "language there", "language layer", "lingua sphere", "language ca", "the language ca", "language c a", "the language c a", "language k", "the language k", "language see a", "the language see a", "language sea", "the language sea", "language sphare", "language spare", "language sphear", "language spear"] },
  { canonical: "LingoSentinel", aliases: ["lingosentinel", "lingosentinel", "lingo-link", "link o link", "lingu link", "language link", "lingosentineledin"] },
  { canonical: "Nyx", aliases: ["nyx", "nix", "nicks", "nick's", "nyx live", "nix live"] },
  { canonical: "Marion", aliases: ["marion", "mary in", "merry in", "merion", "marian", "marion bridge", "mary and bridge"] },
  { canonical: "Sandblast", aliases: ["sandblast", "sand blast", "sam blast", "sound blast", "sun blast", "sandblast channel", "sand blast channel"] },
  { canonical: "mic-to-text parity", aliases: ["mic to text parity", "mic-text parity", "mike to text parity", "mike text parity", "microphone text parity", "voice text parity", "voice-to-text parity", "speech text parity", "after party", "after parity"] },
  { canonical: "progression shaping", aliases: ["progression shaping", "progression shaping refinement", "progression refinement", "regression shaping", "progression shipping", "progression shaving", "five turn progression", "5 turn progression", "5:10 progression", "5:10 regression", "five ten progression", "five ten regression"] },
  { canonical: "domain confidence scoring", aliases: ["domain confidence", "domain confidence scoring", "domain scoring", "confidence scoring", "confidence score", "domain confident scoring", "domain competence", "domain competency"] }
]);
const MIC_TEXT_PARITY_PHASES = Object.freeze({
  phase1:{label:"Phase 1: Mic input capture and normalization",summary:"Normalize spoken input so mic transcripts enter the same Marion/Nyx route as typed text."},
  phase2:{label:"Phase 2: Typed/mic parity regression harness",summary:"Run paired typed and mic prompts, then compare intent, domain, language route, clarification behavior, and Marion authority path."},
  phase3:{label:"Phase 3: Clarification and loop guard",summary:"Prevent vague mic input from triggering broad clarification when active project context is already known."},
  phase4:{label:"Phase 4: Live mic smoke test",summary:"Test the real browser mic path from microphone capture through Marion/Nyx response."}
});
const LANGUAGE_SPHERE_PHASES = Object.freeze({
  phase1:{label:"Phase 1: Detection and normalization",summary:"Detect the input language, normalize the user text, and prepare clean handoff into the Marion authority pipeline."},
  phase2:{label:"Phase 2: Translation and cultural adaptation",summary:"Translate accurately while preserving tone, intent, domain terminology, and cultural context."},
  phase3:{label:"Phase 3: Glossary and terminology control",summary:"Protect project-specific, business-specific, and domain-specific terms from translation drift."},
  phase4:{label:"Phase 4: Memory and reusable language intelligence",summary:"Use translation memory and prior successful mappings to improve consistency over time."}
});
const PROGRESSION_SHAPING_PHASES = Object.freeze({
  phase1:{label:"Phase 1: Progression signal detection",summary:"Classify next steps, continuation, execution, testing, pass/fail, clarification, and recovery signals without broad clarification."},
  phase2:{label:"Phase 2: Progression memory and continuity",summary:"Carry activePhase, currentStep, lastUserIntent, lastSystemAction, and pendingAction across follow-up turns."},
  phase3:{label:"Phase 3: Response shaping rules",summary:"Switch replies into build, debug, test, strategy, recovery, or summary mode according to the user’s current workflow state."},
  phase4:{label:"Phase 4: Regression tests and telemetry",summary:"Validate progression behavior across text and mic input while keeping telemetry internal and public replies clean."}
});
const DOMAIN_CONFIDENCE_PHASES = Object.freeze({
  phase1:{label:"Phase 1: Domain signal extraction",summary:"Extract explicit and implicit domain signals from user text, active lane, memory carry, and routed intent."},
  phase2:{label:"Phase 2: Confidence scoring and thresholds",summary:"Assign confidence bands, then decide whether Marion should answer, clarify, fail closed, or preserve the current lane."},
  phase3:{label:"Phase 3: Cross-domain isolation and secondary-lane handling",summary:"Prevent domain bleed while allowing a supporting secondary lane only when it does not take authority away from the primary lane."},
  phase4:{label:"Phase 4: Telemetry-visible validation",summary:"Expose confidence metadata internally while keeping the user-facing reply direct and free of diagnostics."}
});
function escapeBridgeRegExp(value){return String(value||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function normalizeSpokenProjectAliases(input=""){
  let output=safeStr(input);
  const hits=[];
  if(!output)return {text:"",hits,changed:false};
  for(const rule of SPOKEN_PROJECT_ALIAS_RULES){
    const orderedAliases=safeArray(rule.aliases).slice().sort((a,b)=>safeStr(b).length-safeStr(a).length);
    for(const alias of orderedAliases){
      const rx=new RegExp(`\\b${escapeBridgeRegExp(alias)}\\b`,"gi");
      if(rx.test(output)){
        hits.push({canonical:rule.canonical,alias});
        output=output.replace(rx,rule.canonical);
      }
    }
  }
  output=output.replace(/\s+/g," ").trim();
  return {text:output,hits:hits.slice(0,8),changed:hits.length>0&&output!==safeStr(input)};
}
function detectSpokenProjectAliasHit(input=""){
  const normalized=safeStr(input).toLowerCase();
  for(const rule of SPOKEN_PROJECT_ALIAS_RULES){
    for(const alias of rule.aliases){
      const rx=new RegExp(`\\b${escapeBridgeRegExp(alias.toLowerCase())}\\b`,"i");
      if(rx.test(normalized))return {hit:true,canonical:rule.canonical,alias};
    }
  }
  return {hit:false,canonical:"",alias:""};
}
function normalizePhaseAnchorText(input=""){
  return lower(input)
    .replace(/\bphase one\b/g,"phase 1")
    .replace(/\bphase two\b/g,"phase 2")
    .replace(/\bphase three\b/g,"phase 3")
    .replace(/\bphase four\b/g,"phase 4")
    .replace(/\b5\s*[:\-]\s*10\b/g,"5 turn")
    .replace(/\bfive[-\s]?turn\b/g,"5 turn")
    .replace(/\bafter party\b/g,"after parity")
    .replace(/\bregression shaping\b/g,"progression shaping")
    .replace(/\bregression test\b/g,"progression test")
    .replace(/\s+/g," ").trim();
}
function extractPhaseAnchorKey(input=""){
  const text=normalizePhaseAnchorText(input);
  if(/\bphase 1\b/.test(text))return "phase1";
  if(/\bphase 2\b/.test(text))return "phase2";
  if(/\bphase 3\b/.test(text))return "phase3";
  if(/\bphase 4\b/.test(text))return "phase4";
  return "";
}
function isBridgeContinuationRequest(input=""){
  const text=normalizePhaseAnchorText(input);
  return /\b(continue|next steps?|after that|what happens after|move on|go ahead|phase|carry on|keep going|progression|depth|confidence|scoring|5 turn|parity)\b/i.test(text);
}
function activeProjectTextFromMemory(memory={}){
  const m=safeObj(memory),sb=safeObj(m.stateBridge),cv=safeObj(m.conversationVector),st=safeObj(m.stateSpine||m.conversationState),mc=safeObj(m.marionCohesion);
  return [m.activeLane,m.currentLane,m.activeProject,m.topic,m.lastTopic,sb.activeLane,sb.currentLane,sb.activeProject,sb.topic,sb.lastTopic,cv.activeLane,cv.activeProject,cv.topic,st.activeLane,st.activeProject,st.topic,mc.activeLane,mc.activeProject,mc.lastTopic].map(safeStr).filter(Boolean).join(" ");
}
function resolvePhaseAnchor(input="",context={}){
  const text=normalizePhaseAnchorText(input), ctx=lower([safeObj(context).activeLane,safeObj(context).currentLane,safeObj(context).activeProject,safeObj(context).topic,safeObj(context).memoryText,input].map(safeStr).join(" ")).replace(/[_-]+/g," ");
  const phaseKey=extractPhaseAnchorKey(text);
  const continuation=isBridgeContinuationRequest(text);
  const explicitProjectIntent=isExplicitProjectProgressionText(input);
  if(isWarmNyxGreetingOnly(input))return {resolved:false,phaseKey:"",lane:"",label:"",summary:""};
  if(!phaseKey&&(!continuation||!explicitProjectIntent))return {resolved:false,phaseKey:"",lane:"",label:"",summary:""};
  if(continuation&&!explicitProjectIntent)return {resolved:false,phaseKey:phaseKey||"",lane:"",label:"",summary:""};
  let phaseMap=null,lane="";
  if(/\b(progression shaping|progression refinement|progression|depth governor|continuity depth|5 turn|five turn)\b/i.test(ctx)){phaseMap=PROGRESSION_SHAPING_PHASES;lane="progression_shaping_refinement";}
  if(!phaseMap&&/\b(domain confidence|confidence scoring|domain scoring|confidence threshold|confidence band)\b/i.test(ctx)){phaseMap=DOMAIN_CONFIDENCE_PHASES;lane="domain_confidence_scoring";}
  if(!phaseMap&&/\b(mic|microphone|voice|speech|spoken|parity|transcript|stt|speech to text|speech-to-text)\b/i.test(ctx)){phaseMap=MIC_TEXT_PARITY_PHASES;lane="mic_to_text_parity";}
  if(!phaseMap&&/\b(languagesphere|language sphere|translation|translator|lingosentinel|lingosentinel|multilingual|language)\b/i.test(ctx)){phaseMap=LANGUAGE_SPHERE_PHASES;lane="languagesphere";}
  if(!phaseMap)return {resolved:false,phaseKey:phaseKey||"",lane:"",label:"",summary:""};
  const safePhaseKey=phaseKey||"phase2";
  const phase=phaseMap[safePhaseKey];
  if(!phase)return {resolved:false,phaseKey:safePhaseKey,lane,label:"",summary:""};
  return {resolved:true,phaseKey:safePhaseKey,lane,label:phase.label,summary:phase.summary};
}
function buildPhaseAnchorInstruction(input="",context={}){
  const anchor=resolvePhaseAnchor(input,context);
  if(!anchor.resolved)return "";
  return [`The user is continuing the active lane: ${anchor.lane}.`,`Resolved phase: ${anchor.label}.`,`Phase meaning: ${anchor.summary}`,`Answer directly. Preserve prior phase context, name the validation target, and give one concrete next action. Do not ask broad clarification unless the user introduces a genuinely new topic.`].join("\n");
}
function isLanguageSphereNextStepsRequest(text=""){
  const t=lower(text);
  return /\b(languagesphere|language sphere|language ca|language c a|language k|language see a|language sea)\b/i.test(t)&&/\b(next steps?|what\s+are\s+the\s+next\s+steps|what\s+is\s+next|what'?s next|where are we|roadmap|phase|continue)\b/i.test(t);
}

function isProgressionShapingRequest(text=""){
  const t=normalizePhaseAnchorText(text);
  return /\b(progression shaping|progression refinement|progression test|5 turn progression|5 turn|continuity depth|depth governor|continuity objective|context protection)\b/i.test(t) ||
    /\b(after parity|after party)\b/i.test(t)&&/\b(progression|5 turn|regression test)\b/i.test(t) ||
    /\b(what are we testing inside that phase|testing inside that phase|how does this protect marion|losing context|protect marion from losing context|what is the next action after this test passes)\b/i.test(t);
}
function progressionShapingRecoveryReply(text=""){
  const t=normalizePhaseAnchorText(text);
  if(/\bwhat are we testing|inside that phase|testing inside|test objective|continuity objective\b/i.test(t)){
    return "Inside progression shaping refinement, the continuity objective is the 5-7 turn continuity/depth test: Marion must keep mic-to-text parity marked complete, preserve the active technical lane, carry the phase anchor, avoid broad clarification, block instruction-shaped wording, and give one concrete next action per reply.";
  }
  if(/\bprotect|losing context|context drop|preserve context|context protection\b/i.test(t)){
    return "Progression shaping protects Marion from losing context by binding every follow-up to the accepted phase anchor before generic templates can shape the reply. That keeps mic-to-text parity complete, keeps the current phase as progression shaping refinement, and prevents vague prompts like “continue” from resetting the lane.";
  }
  if(/\bnext action|after this test passes|what is next|after it passes|when this passes\b/i.test(t)){
    return "After progression shaping passes, move into domain confidence scoring: verify Marion can score the active domain, answer when confidence is high, ask one precise clarifier when confidence is low, and fail closed when the domain is weak or unsafe.";
  }
  return "Progression shaping refinement means testing whether Marion carries the active technical thread across 5-7 turns without losing the lane, asking broad clarification, or exposing instruction-shaped wording. Next action: run the five-turn progression sequence and mark the first turn where context, depth, or one-action shaping drops.";
}
function isDomainConfidenceRequest(text=""){
  const t=normalizePhaseAnchorText(text);
  return /\b(domain confidence|confidence scoring|domain scoring|confidence threshold|confidence band|domain signal)\b/i.test(t);
}
function domainConfidenceRecoveryReply(text=""){
  const t=normalizePhaseAnchorText(text);
  if(/\bwhat are we testing|inside that phase|test\b/i.test(t)){
    return "Inside domain confidence scoring, test four bands: high confidence answers directly, medium answers with grounding, low asks one precise clarifier, and weak confidence fails closed without borrowing another domain.";
  }
  if(/\bprotect|domain bleed|cross domain|secondary lane\b/i.test(t)){
    return "Domain confidence protects Marion by making the primary lane prove itself before the answer is shaped. A secondary lane can support the answer, but it cannot take authority or silently replace the primary domain.";
  }
  return "Domain confidence scoring means Marion assigns a confidence band to the active lane before answering. Next action: test high, medium, low, and weak domain prompts, confirm low confidence asks one precise clarifier, and confirm weak confidence fails closed without cross-domain bleed.";
}
function isWrongLaneProgressionReply(reply=""){
  const t=lower(reply);
  return !t ? true :
    /\bthe direct answer needs one usable example\b/i.test(t) ||
    /\bdefine the concept\b/i.test(t) ||
    /\bone concrete use case\b/i.test(t) ||
    /\ba loop breaks when\b/i.test(t) ||
    /\bmerely changes wording\b/i.test(t) ||
    /\btechnical move is to name\b/i.test(t) ||
    /\bactive component\b.*\bfailure mode\b.*\bvalidation step\b/i.test(t) ||
    /\bthe direct answer needs one usable example\b/i.test(t) ||
    /\bin practical terms, define the concept\b/i.test(t) ||
    /\bone concrete use case so the user can apply it immediately\b/i.test(t) ||
    /\bthe direct answer needs one usable example\b.*\bin practical terms\b/i.test(t);
}

function buildProjectRecoveryReply(normalized={}){
  const n=safeObj(normalized);
  const phase=safeObj(n.phaseAnchor);
  const sourceText=[n.userQuery,n.rawUserQuery,n.publicUserQuery,n.text,n.message,n.query,n.activeLane,n.currentLane,n.currentProject,phase.lane,phase.label,phase.summary].map(safeStr).filter(Boolean).join(" ");
  const text=firstText(n.userQuery,n.rawUserQuery,n.publicUserQuery,n.text,n.message,n.query,sourceText);
  if(isWarmNyxGreetingOnly(text))return "";
  const explicitProjectIntent=isExplicitProjectProgressionText(text);
  if((isProgressionShapingRequest(sourceText)||phase.lane==="progression_shaping_refinement")&&explicitProjectIntent)return progressionShapingRecoveryReply(sourceText);
  if((isDomainConfidenceRequest(sourceText)||phase.lane==="domain_confidence_scoring")&&explicitProjectIntent)return domainConfidenceRecoveryReply(sourceText);
  if(phase.resolved&&phase.lane==="mic_to_text_parity"&&phase.phaseKey==="phase2"&&explicitProjectIntent){
    return "Phase 2 is the typed/mic parity regression harness. Test the same prompts by text and voice, then compare intent, domain, language route, clarification behavior, and Marion authority path. The pass condition is that mic and typed input behave structurally the same, even if the final wording is not identical.";
  }
  if(phase.resolved&&phase.lane==="mic_to_text_parity"&&explicitProjectIntent){
    return `${phase.label}: ${phase.summary}`;
  }
  if(isLanguageSphereNextStepsRequest(text)){
    return "LanguageSphere is being prepared to support reliable language routing, translation consistency, and voice/text alignment before the stable pieces move into LingoSentinel.";
  }
  return "";
}
function isBroadLanguageClarifier(value=""){
  const t=safeStr(value);
  return /are you asking about translation,? captions,? or language routing inside the interface\??/i.test(t)||/translation,? captions,? or language routing/i.test(t)||/are you asking about the interface,?\s*radio\/media,?\s*roku,?\s*business strategy,?\s*or backend technical work\??/i.test(t)||/interface,?\s*radio\/media,?\s*roku,?\s*business strategy,?\s*or backend technical work/i.test(t);
}
function shouldSuppressDomainConciergeClarifier(normalized={},domainConcierge={}){
  const n=safeObj(normalized), dc=safeObj(domainConcierge), clarifier=firstText(dc.clarifier,dc.reply,dc.text), q=firstText(n.userQuery,n.rawUserQuery);
  if((n.publicDomainAccess===true||n.forceDomainAnswer===true||safeArray(n.domainAccess).length>0) && (definitionKnowledgeDomainFromText(q)||crossDomainSecondaryLaneProfile(q)||/\b(cash[- ]?flow|auditing|audit process|cognitive|machine learning|least privilege|phishing|syntax|contract law|consideration)\b/i.test(q)))return true;
  if(!isBroadLanguageClarifier(clarifier))return false;
  if(safeObj(n.phaseAnchor).resolved)return true;
  if(safeArray(safeObj(n.spokenAliasRecovery).hits).some(h=>safeObj(h).canonical==="LanguageSphere"||safeObj(h).canonical==="LingoSentinel"))return true;
  return isLanguageSphereNextStepsRequest(q);
}
function applyProjectRecoveryReplyOverride(packet={},ctx={}){
  const out=safeObj(packet), normalized=safeObj(ctx.normalized);
  const recovery=buildProjectRecoveryReply(normalized);
  if(!recovery)return out;
  const current=firstText(out.reply,out.text,out.answer,out.output,out.response,out.message,out.displayReply,safeObj(out.payload).reply,safeObj(out.finalEnvelope).reply);
  const userText=firstText(normalized.userQuery,normalized.rawUserQuery,normalized.publicUserQuery,normalized.text,normalized.message,normalized.query);
  if(isWarmNyxGreetingOnly(userText))return out;
  const q=[userText,safeObj(normalized.phaseAnchor).lane,safeObj(normalized.phaseAnchor).label,safeObj(normalized.phaseAnchor).summary].map(safeStr).filter(Boolean).join(" ");
  const forceProjectLane=isExplicitProjectProgressionText(userText)&&(isProgressionShapingRequest(q)||isDomainConfidenceRequest(q)||safeObj(normalized.phaseAnchor).lane==="progression_shaping_refinement"||safeObj(normalized.phaseAnchor).lane==="domain_confidence_scoring")&&isWrongLaneProgressionReply(current);
  if(!forceProjectLane&&current&&!isPrimitivePublicReply(current)&&!isThinPlaceholderText(current)&&!isBroadLanguageClarifier(current)&&!isGenericGreetingStatusFallback(current)&&!isPublicControlPolicyLeak(current)&&!isPublicWorkflowStateLeak(current))return out;
  out.reply=recovery;out.text=recovery;out.answer=recovery;out.output=recovery;out.response=recovery;out.message=recovery;out.displayReply=recovery;out.spokenText=recovery;out.textSpeak=recovery;out.textDisplay=recovery;
  out.payload={...safeObj(out.payload),reply:recovery,text:recovery,message:recovery,answer:recovery,output:recovery,response:recovery,displayReply:recovery,spokenText:recovery,textSpeak:recovery,textDisplay:recovery};
  out.finalEnvelope={...safeObj(out.finalEnvelope),reply:recovery,text:recovery,displayReply:recovery,spokenText:recovery};
  out.meta={...safeObj(out.meta),projectRecoveryReply:true,noUserFacingDiagnostics:true};
  return out;
}



function readPublicReplyCandidate(packet={}){
  const p=safeObj(packet), payload=safeObj(p.payload), finalEnvelope=safeObj(p.finalEnvelope), speech=safeObj(p.speech);
  return firstText(p.reply,p.text,p.answer,p.output,p.response,p.message,p.displayReply,p.spokenText,p.textSpeak,p.textDisplay,payload.reply,payload.text,payload.answer,payload.output,payload.response,payload.message,payload.displayReply,payload.spokenText,payload.textSpeak,payload.textDisplay,finalEnvelope.reply,finalEnvelope.text,finalEnvelope.displayReply,finalEnvelope.spokenText,speech.text,speech.textDisplay,speech.textSpeak);
}
function isInvalidPublicReplyValue(value){
  if(value===false||value===true||value==null)return true;
  const text=safeStr(value).replace(/[.!?]+$/g,"").trim().toLowerCase();
  return !text||
    /^(?:false|true|null|undefined|none|nan|\[object object\])$/.test(text)||
    /\bi can answer that directly\.?\s*send the prompt again\b/i.test(text)||
    /\bkeep the reply clean,?\s*public[- ]facing,?\s*and free of runtime details\b/i.test(text)||
    isDiagnosticText(text)||
    isTelemetryLeakText(text)||
    isPublicControlPolicyLeak(text)||
    isPublicWorkflowStateLeak(text);
}
function normalizeSixDomainTopicLabel(value=""){
  const raw=String(value==null?"":value).replace(/\s+/g," ").trim();
  if(!raw)return "";
  let s=raw
    .replace(/^(?:tell me about|explain|what is|what are|define|describe|break down|give me an overview of|help me understand)\s+/i,"")
    .replace(/\?+$/,"")
    .trim();
  s=s.replace(/^(?:the|a|an)\s+/i,"").trim();
  return s.slice(0,72);
}
function buildSixDomainPublicKnowledgeAnswer(value=""){
  const source=String(value==null?"":value).replace(/\s+/g," ").trim();
  const t=source.toLowerCase();
  if(!t)return "";
  if(/\bcash[- ]?flow\b/.test(t))return "Cash flow is the movement of money into and out of a business over a period of time. Healthy cash flow means the business can pay expenses, manage timing gaps, and keep operating without constant pressure.";
  if(/\bauditing\b|\baudit process\b|\bfinancial audit\b|\boperational audit\b|\baudit\b/.test(t))return "Auditing is a structured review of records, systems, finances, or work against a standard. The goal is to find gaps, confirm accuracy, reduce risk, and improve accountability.";
  if(/\bcognitive\b|\bcognition\b|\bcognitive process\b/.test(t))return "Cognitive refers to mental processes like attention, memory, learning, reasoning, problem-solving, and decision-making. It is about how information is taken in, processed, and used.";
  if(/\bmachine learning\b|\bml\b/.test(t))return "Machine learning is a branch of AI where systems learn patterns from data and use those patterns to classify, predict, recommend, or make decisions without being manually programmed for every case.";
  if(/\bartificial intelligence\b|\bai\b/.test(t))return "Artificial intelligence is the use of computer systems to perform tasks that normally require human reasoning, such as understanding language, recognizing patterns, making predictions, or supporting decisions.";
  if(/\bleast privilege\b/.test(t))return "Least privilege is a cybersecurity principle where a user, service, or system gets only the access needed to do its job. It limits damage if an account, tool, or process is misused or compromised.";
  if(/\bphishing\b/.test(t))return "Phishing is a cyberattack where someone pretends to be a trusted source to trick a person into giving up passwords, money, or sensitive information.";
  if(/\bsyntax\b/.test(t))return "Syntax is the structure that controls how words, phrases, or symbols are arranged so meaning is clear. In English, it affects sentence order; in code, it controls whether instructions are valid.";
  if(/\bconsideration\b/.test(t)&&/\b(contract|law|legal)\b/.test(t))return "Consideration in contract law is the value exchanged between parties, such as money, services, goods, a promise, or a benefit. It helps show that an agreement is more than a casual statement.";
  if(/\bcontract\b|\blegal\b|\blaw\b|\bliability\b|\bnegligence\b/.test(t))return "In law, the key is to identify the rule, the facts, the duties involved, and the likely consequence. For public use, Nyx should explain the concept clearly without presenting it as legal advice.";
  if(/\brevenue\b|\bprofit\b|\bmargin\b|\bbudget\b|\bpricing\b|\bfinance\b|\bfinancial\b/.test(t))return "In finance, the important question is how money moves, what creates value, what creates cost, and whether the numbers support the decision. A useful answer should connect the concept to cash, risk, and timing.";
  if(/\bgrammar\b|\bwriting\b|\bsentence\b|\bparagraph\b|\bsemantics\b|\bmeaning\b/.test(t))return "In English, the goal is clear meaning. Grammar controls correctness, syntax controls structure, and word choice controls tone and precision.";
  if(/\bpsychology\b|\bbehavior\b|\bemotion\b|\bmotivation\b|\bmemory\b|\blearning\b|\battention\b|\bbias\b|\bfallacy\b/.test(t))return "In psychology, the focus is how people think, feel, learn, decide, and behave. A good explanation connects the concept to real patterns, triggers, and outcomes.";
  if(/\bcyber\b|\bsecurity\b|\bpassword\b|\bmalware\b|\bransomware\b|\bprivacy\b|\bcredential\b|\baccess\b/.test(t))return "In cybersecurity, the goal is to protect systems, accounts, data, and people from misuse or attack. The strongest answer usually covers the threat, the risk, and the practical control.";
  const topic=normalizeSixDomainTopicLabel(source);
  if(topic&&/\b(tell me about|explain|what is|what are|define|describe|break down|help me understand)\b/i.test(source)){
    return topic.charAt(0).toUpperCase()+topic.slice(1)+" is a public knowledge topic Marion can route through the six-domain layer. At a high level, the useful answer should define the term, explain why it matters, and give one practical example.";
  }
  return "";
}

function buildDeterministicLastMilePublicReplyFromText(text=""){
  const source=safeStr(text);
  const t=lower(source);
  if(!t)return "";
  if(/\bsandblast\s+channel\b/i.test(source)){
    return "Sandblast Channel is a media and AI interface ecosystem built around chat, radio, video, news, and multilingual support through Nyx and Marion.";
  }
  const translationTarget=(/\b(?:into|to|in)\s+french\b/i.test(source)||/\bfrançais|francais|fr\b/i.test(source))?"fr":((/\b(?:into|to|in)\s+spanish\b/i.test(source)||/\bespañol|espanol|es\b/i.test(source))?"es":((/\b(?:into|to|in)\s+english\b/i.test(source)||/\ben\b/i.test(source))?"en":""));
  if(/\btranslate\b|\bhow do you say\b|\bsay .* in\b/i.test(source)){
    if(translationTarget==="fr"&&/\bgood morning\b/i.test(source))return "Good morning in French is: Bonjour.";
    if(translationTarget==="es"&&/\bgood morning\b/i.test(source))return "Good morning in Spanish is: Buenos días.";
    if(translationTarget==="en"&&/\bbonjour\b/i.test(source))return "Bonjour means hello in English.";
    if(translationTarget==="en"&&/\bhola\b/i.test(source))return "Hola means hello in English.";
    if(translationTarget==="fr")return "I can translate that into French, but I need the exact phrase to keep the answer accurate.";
    if(translationTarget==="es")return "I can translate that into Spanish, but I need the exact phrase to keep the answer accurate.";
    if(translationTarget==="en")return "I can translate that into English, but I need the exact phrase to keep the answer accurate.";
  }
  if(/\bbonjour\b/i.test(source)&&/\bcomment allez[- ]?vous\b/i.test(source))return "Bonjour, comment allez-vous? means: Hello, how are you?";
  if(/\bhola\b/i.test(source)&&/\bc[oó]mo est[aá]s\b/i.test(source))return "Hola, ¿cómo estás? means: Hello, how are you?";
  if(/\badapt\b/i.test(source)&&/\bfrench audience\b/i.test(source))return "For a French audience, keep the message clear, polished, and culturally respectful while preserving the original intent.";
  if(/\bteach me\b|\blearn\b/i.test(source)){
    if(/\bthank you\b/i.test(source)&&/\bspanish\b/i.test(source))return "Thank you in Spanish is: Gracias.";
    if(/\bthank you\b/i.test(source)&&/\bfrench\b/i.test(source))return "Thank you in French is: Merci.";
  }
  if(/\bcash[- ]?flow\b/i.test(source))return "Cash flow is the movement of money into and out of a business over a specific period. Positive cash flow means more money is coming in than going out; negative cash flow means the business may need reserves, faster collections, or tighter spending even if sales look strong.";
  if(/\bauditing\b|\baudit process\b|\bfinancial audit\b|\boperational audit\b/i.test(source))return "Auditing is a structured review that checks records, systems, finances, operations, or decisions against a standard so gaps can be found and corrected.";
  if(/\bcognitive\b|\bcognition\b/i.test(source))return "Cognitive refers to the mental processes involved in learning, remembering, reasoning, attention, problem-solving, and decision-making.";
  if(/\bmachine learning\b/i.test(source))return "Machine learning is a branch of AI where systems learn patterns from data and use those patterns to classify, predict, recommend, or make decisions without being manually programmed for every case.";
  if(/\bleast privilege\b/i.test(source))return "Least privilege is a cybersecurity principle where each user, service, or system gets only the minimum access needed to do its job, reducing damage if something is misused or compromised.";
  if(/\bphishing\b/i.test(source))return "Phishing is a cyberattack where someone tries to trick a person into sharing credentials, money, or sensitive information by pretending to be a trusted source.";
  if(/\bsyntax\b/i.test(source))return "Syntax is the structure that controls how words, phrases, or symbols are arranged so meaning is clear. In English, it shapes sentence order and grammar.";
  if(/\bconsideration\b/i.test(source)&&/\bcontract|law|legal\b/i.test(source))return "Consideration in contract law is the value exchanged between parties, such as money, a service, a promise, or a benefit. It helps show that an agreement is more than a one-sided gift.";
  const sixDomainReply=buildSixDomainPublicKnowledgeAnswer(source);
  if(sixDomainReply)return sixDomainReply;
  return "";
}

function collectPrimitiveRecoverySource(normalized={},packet={}){
  const n=safeObj(normalized);
  const p=safeObj(packet);
  const np=safeObj(n.payload), nb=safeObj(n.body), nm=safeObj(n.meta), ni=safeObj(n.input);
  const pp=safeObj(p.payload), pb=safeObj(p.body), pm=safeObj(p.meta), pi=safeObj(p.input), fe=safeObj(p.finalEnvelope);
  return [
    n.userQuery,n.publicUserQuery,n.rawUserQuery,n.originalUserText,n.originalText,n.rawUserText,n.userText,n.message,n.text,n.query,
    np.userQuery,np.publicUserQuery,np.rawUserQuery,np.originalUserText,np.originalText,np.rawUserText,np.message,np.text,np.query,
    nb.userQuery,nb.publicUserQuery,nb.rawUserQuery,nb.originalUserText,nb.originalText,nb.rawUserText,nb.message,nb.text,nb.query,
    nm.userQuery,nm.publicUserQuery,nm.rawUserQuery,nm.originalUserText,nm.originalText,nm.rawUserText,nm.message,nm.text,nm.query,
    ni.userQuery,ni.publicUserQuery,ni.rawUserQuery,ni.originalUserText,ni.originalText,ni.rawUserText,ni.message,ni.text,ni.query,
    p.userQuery,p.publicUserQuery,p.rawUserQuery,p.originalUserText,p.originalText,p.rawUserText,p.userText,p.message,p.query,
    pp.userQuery,pp.publicUserQuery,pp.rawUserQuery,pp.originalUserText,pp.originalText,pp.rawUserText,pp.userText,pp.message,pp.query,
    pb.userQuery,pb.publicUserQuery,pb.rawUserQuery,pb.originalUserText,pb.originalText,pb.rawUserText,pb.userText,pb.message,pb.query,
    pm.userQuery,pm.publicUserQuery,pm.rawUserQuery,pm.originalUserText,pm.originalText,pm.rawUserText,pm.userText,pm.message,pm.query,
    pi.userQuery,pi.publicUserQuery,pi.rawUserQuery,pi.originalUserText,pi.originalText,pi.rawUserText,pi.userText,pi.message,pi.query,
    fe.userQuery,fe.publicUserQuery,fe.rawUserQuery,fe.originalUserText,fe.originalText,fe.rawUserText,fe.userText,fe.message,fe.query
  ].map(safeStr).filter(Boolean).join(" ");
}

function buildPrimitiveReplyRecovery(normalized={},packet={}){
  const n=safeObj(normalized);
  const projectRecovery=buildProjectRecoveryReply(n);
  if(projectRecovery)return projectRecovery;
  const text=collectPrimitiveRecoverySource(n,packet);
  const deterministic=buildDeterministicLastMilePublicReplyFromText(text);
  if(deterministic)return deterministic;
  if(isLanguageSphereNextStepsRequest(text)){
    return "LanguageSphere is being prepared to support reliable language routing, translation consistency, and voice/text alignment before the stable pieces move into LingoSentinel.";
  }
  if(safeArray(safeObj(n.spokenAliasRecovery).hits).some((h)=>["LanguageSphere","LingoSentinel"].includes(safeStr(safeObj(h).canonical)))){
    return "I’m tracking LanguageSphere and LingoSentinel. The next step is to keep language routing, translation consistency, and voice/text alignment stable before moving the language components forward.";
  }
  return bridgeLoopGovernorReply(n, safeObj(packet), "primitive_public_reply_recovery");
}
function applyReplyEverywhere(packet={},reply="",flags={}){
  const out=isObj(packet)?packet:{};
  const clean=stripTelemetryLeakFromReply(stripPublicReplyScaffold(reply));
  if(!clean||isInvalidPublicReplyValue(clean)||isThinPlaceholderText(clean)||isBroadLanguageClarifier(clean)||isPublicWorkflowStateLeak(clean))return suppressPublicReplyPacket(out,{...safeObj(flags),publicReplyHardlock:true,unsafeApplyReplySuppressed:true});
  out.reply=clean;out.text=clean;out.answer=clean;out.output=clean;out.response=clean;out.message=clean;out.displayReply=clean;out.spokenText=clean;out.textSpeak=clean;out.textDisplay=clean;
  out.ok=true;out.final=true;out.marionFinal=true;out.handled=true;out.awaitingMarion=false;out.terminal=true;out.suppressUserFacingReply=false;out.emit=true;out.blocked=false;out.transportSafe=true;out.socketReconnect=false;
  out.payload={...safeObj(out.payload),reply:clean,text:clean,answer:clean,output:clean,response:clean,message:clean,displayReply:clean,spokenText:clean,textSpeak:clean,textDisplay:clean,final:true,marionFinal:true,awaitingMarion:false,suppressUserFacingReply:false,emit:true,blocked:false};
  out.finalEnvelope={...safeObj(out.finalEnvelope),reply:clean,text:clean,displayReply:clean,spokenText:clean,final:true,marionFinal:true,handled:true,qualityPass:true,responseDepthShaped:true,contractVersion:firstText(safeObj(out.finalEnvelope).contractVersion,FINAL_ENVELOPE_CONTRACT),signature:firstText(safeObj(out.finalEnvelope).signature,FINAL_SIGNATURE),authority:firstText(safeObj(out.finalEnvelope).authority,"marionFinalEnvelope")};
  out.speech={...safeObj(out.speech),text:clean,textDisplay:clean,textSpeak:clean,silent:false,silentAudio:false};
  out.meta={...safeObj(out.meta),...safeObj(flags),primitivePublicReplyRecovered:!!safeObj(flags).primitivePublicReplyRecovered,noUserFacingDiagnostics:true,transportSafe:true,emit:true,blocked:false,suppressUserFacingReply:false};
  out.diagnostics={...safeObj(out.diagnostics),primitivePublicReplyRecovered:!!safeObj(flags).primitivePublicReplyRecovered,publicReplyHardlock:true,noUserFacingDiagnostics:true,suppressedUserFacingReply:false,emit:true,blocked:false};
  return out;
}
function enforceValidPublicReply(packet={},ctx={}){
  const out=safeObj(packet);
  const normalized=safeObj(ctx.normalized);
  const publicDomainRecovery=(normalized.publicDomainAccess===true||normalized.forceDomainAnswer===true||safeArray(normalized.domainAccess).length>0)?buildDeterministicLastMilePublicReplyFromText(firstText(normalized.userQuery,normalized.rawUserQuery,normalized.text,normalized.query)):"";
  if(publicDomainRecovery)return applyReplyEverywhere(out,publicDomainRecovery,{publicReplyHardlock:true,publicDomainRecovery:true,primitivePublicReplyRecovered:true});
  const candidate=readPublicReplyCandidate(out);
  if(!isInvalidPublicReplyValue(candidate)&&!isThinPlaceholderText(candidate)&&!isBroadLanguageClarifier(candidate)){
    return applyReplyEverywhere(out,candidate,{publicReplyHardlock:true});
  }
  const recovery=buildPrimitiveReplyRecovery(normalized,out);
  if(!recovery||isInvalidPublicReplyValue(recovery)||isThinPlaceholderText(recovery)||isBroadLanguageClarifier(recovery)||isPublicWorkflowStateLeak(recovery)){
    return suppressPublicReplyPacket(out,{publicReplyHardlock:true,loopSuppressionSilent:true,workflowStateLeakSuppressed:true});
  }
  return applyReplyEverywhere(out,recovery,{primitivePublicReplyRecovered:true,publicReplyHardlock:true,deterministicOriginalPromptRecovery:!!buildDeterministicLastMilePublicReplyFromText(collectPrimitiveRecoverySource(normalized,out))});
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

function bridgeProgressionProfile(text="",memory={}){
  if(progressionShapeMod&&typeof progressionShapeMod.buildProgressionProfile==="function"){
    try{return safeObj(progressionShapeMod.buildProgressionProfile(text,{...safeObj(memory),progressionRefinement:safeObj(memory).progressionRefinement}));}catch(_){}
  }
  const phase=resolvePhaseAnchor(text,{memoryText:activeProjectTextFromMemory(memory)});
  return {version:PROGRESSION_SHAPING_REFINEMENT_VERSION,active:!!phase.resolved,lane:phase.lane,phaseKey:phase.phaseKey,phaseLabel:phase.label,signal:isBridgeContinuationRequest(text)?"next_steps":"unknown",responseShape:"build_mode",noUserFacingDiagnostics:true,updatedAt:Date.now()};
}
function bridgeProgressionMemory(text="",reply="",memory={}){
  const previous=safeObj(safeObj(memory).progressionRefinement||safeObj(memory).progressionMemory||safeObj(memory).stateBridge&&safeObj(memory).stateBridge.progressionRefinement);
  if(progressionMemoryMod&&typeof progressionMemoryMod.updateProgressionMemory==="function"){
    try{return safeObj(progressionMemoryMod.updateProgressionMemory({text,reply,previous,context:memory}));}catch(_){}
  }
  const profile=bridgeProgressionProfile(text,memory);
  return {...profile,active:!!profile.active,activePhase:profile.active?"progression_shaping_refinement":"",currentStep:profile.phaseKey||"",lastUserIntent:profile.signal||"",lastSystemAction:profile.responseShape||"",noUserFacingDiagnostics:true};
}
function bridgeProgressionTelemetry(text="",reply="",progressionRefinement={}){
  if(progressionTelemetryMod&&typeof progressionTelemetryMod.buildProgressionTelemetry==="function"){
    try{return safeObj(progressionTelemetryMod.buildProgressionTelemetry({profile:safeObj(progressionRefinement.profile||progressionRefinement),memory:progressionRefinement,text,reply,source:"marionBridge"}));}catch(_){}
  }
  return {};
}
function bridgeShapeProgressionReply(text="",reply="",progressionRefinement={},memory={}){
  const profile=safeObj(progressionRefinement.profile||progressionRefinement);
  if(isWarmNyxGreetingOnly(text))return safeStr(reply);
  if(!isExplicitProjectProgressionText(text))return safeStr(reply);
  if(!profile.active)return safeStr(reply);
  if(progressionResponsePolicyMod&&typeof progressionResponsePolicyMod.shapeProgressionReply==="function"){
    try{
      const shaped=safeStr(progressionResponsePolicyMod.shapeProgressionReply({reply,text,profile,memory:{...safeObj(memory),...safeObj(progressionRefinement)}}));
      if(shaped&&!/^\s*(continue|next|ok|done|proceed)\.?\s*$/i.test(shaped))return shaped;
    }catch(_){}
  }
  if(/^\s*(continue|next|ok|done|proceed)\.?\s*$/i.test(safeStr(reply))){
    return "Send one clear follow-up tied to the current validation target, and I’ll keep the answer specific without resetting the thread.";
  }
  return safeStr(reply);
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
      technicalTargetLock,
      progressionRefinement: safeObj(stateBridge.progressionRefinement || out.progressionRefinement),
      progressionTelemetry: safeObj(stateBridge.progressionTelemetry || out.progressionTelemetry)
    };
  }
  const progressionRefinement=safeObj(out.progressionRefinement||safeObj(out.stateBridge).progressionRefinement); if(Object.keys(progressionRefinement).length) out.progressionRefinement=progressionRefinement; const progressionTelemetry=safeObj(out.progressionTelemetry||safeObj(out.stateBridge).progressionTelemetry); if(Object.keys(progressionTelemetry).length) out.progressionTelemetry=progressionTelemetry; const domainConcierge=compactDomainConciergeForBridge(out.domainConcierge || safeObj(out.stateBridge).domainConcierge);
  if(Object.keys(domainConcierge).length) out.domainConcierge=domainConcierge;
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
  const reply = stripPublicReplyScaffold(extractReply(out) || safeStr(safeObj(out.finalEnvelope).reply));
  const trustedFinal = hasTrustedBridgeFinalPacket(out);
  const hasReply = !!reply && trustedFinal && !isPrimitivePublicReply(reply) && !isThinPlaceholderText(reply) && !isDiagnosticText(reply);
  if (hasReply) {
    out.reply = reply; out.text = reply; out.answer = reply; out.output = reply; out.response = reply; out.message = reply; out.spokenText = safeStr(out.spokenText || reply);
    out.payload = { ...safeObj(out.payload), reply, text: reply, message: reply, answer: reply, output: reply, response: reply, final: true, marionFinal: true, awaitingMarion: false, suppressUserFacingReply: false, emit: true, blocked: false };
  } else {
    out.reply = ""; out.text = ""; out.answer = ""; out.output = ""; out.response = ""; out.message = "";
    out.payload = { ...safeObj(out.payload), reply: "", text: "", message: "", answer: "", output: "", response: "", final: false, marionFinal: false, awaitingMarion: true, suppressUserFacingReply: true, emit: false, blocked: true };
  }
  out.ok = hasReply && out.ok !== false; out.final = !!hasReply; out.marionFinal = !!hasReply; out.handled = true; out.awaitingMarion = !hasReply; out.terminal = hasReply ? out.terminal : false; out.suppressUserFacingReply = !hasReply; out.emit = hasReply; out.blocked = !hasReply; out.transportSafe = true; out.socketReconnect = false;
  if (out.memoryPatch) out.memoryPatch = compactPatchForTransport(out.memoryPatch); if (out.sessionPatch) out.sessionPatch = compactPatchForTransport(out.sessionPatch); if (out.payload && out.payload.memoryPatch) out.payload.memoryPatch = compactPatchForTransport(out.payload.memoryPatch); if (out.payload && out.payload.sessionPatch) out.payload.sessionPatch = compactPatchForTransport(out.payload.sessionPatch);
  out.finalEnvelope = { ...safeObj(out.finalEnvelope), reply: hasReply ? reply : "", spokenText: hasReply ? stripPublicReplyScaffold(safeObj(out.finalEnvelope).spokenText || out.spokenText || reply) : "", final: hasReply, marionFinal: hasReply, handled: true, contractVersion: safeStr(safeObj(out.finalEnvelope).contractVersion || FINAL_ENVELOPE_CONTRACT), qualityPass: hasReply, responseDepthShaped: hasReply };
  out.meta = { ...safeObj(out.meta), transportSafe: true, socketReconnect: false, emitOrder: "finalEnvelope:beforeSessionPatch", finalDeliveryTiming: "single_terminal_packet", conversationQualityGate: true, responseDepthShaped: hasReply, trustedFinalEnvelope: trustedFinal, suppressUserFacingReply: !hasReply, emit: hasReply, blocked: !hasReply };
  out.diagnostics = { ...safeObj(out.diagnostics), transportSafe: true, jsonSanitized: true, finalDeliveryTiming: "single_terminal_packet", trustedFinalEnvelope: trustedFinal, suppressedUserFacingReply: !hasReply };
  return out;
}

function transportSafeError(packet = {}) {
  const out = jsonSafe(packet);
  if (isObj(out)) {
    const candidateReply = readPublicReplyCandidate(out);
    const hasReply = !!candidateReply && !isInvalidPublicReplyValue(candidateReply) && !isThinPlaceholderText(candidateReply) && !isDiagnosticText(candidateReply);
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

function isDiagnosticText(value){const t=lower(value);return /marion[_ -]?final[_ -]?envelope[_ -]?missing|final envelope missing|diagnostic packet|non-final|no_final|composer_invalid|composer_reply_missing|final_envelope_unavailable|bridge_error|packet_invalid|contract_invalid|bridge blocked an invalid public reply|exposing a runtime value|answer from the active lane|i stopped a repeated response before it could render again|current turn is preserved|fresh Marion final|replaying the same fallback|Index\.js transport[- ]only|loop is being contained at the bridge layer|MarionBridge should accept only one clean Marion final|progression active|run next validation|mark passed or failed|validation harness|regression harness|expected result:\s*marion/.test(t)||isPublicWorkflowStateLeak(t);} 
function isRogueFallbackText(value){const t=lower(value);if(!t)return false;if(/give me the specific target or outcome/i.test(t)||/specific target.*answer directly/i.test(t))return true;return /\b(i['’]?m here and tracking the turn|i am here and tracking the turn|nyx is live and tracking the turn|give me the next clear target|send a specific command|press reset|ready\.\s*send|i blocked a repeated fallback|i['’]?m here\.?\s*what[’']?s next|i am here\.?\s*what[’']?s next|i['’]?m online\.?\s*what[’']?s next|i am online\.?\s*what[’']?s next|i['’]?m here,?\s*fully online\.?\s*what are we working on|hi\s*[—-]\s*i['’]?m here|fully online.*what are we working on|i['’]?m holding the thread\.\s*tell me what continuity point|technical path confirmed\.\s*i['’]?ll inspect the route output, composer reply, final envelope, bridge return shape, and state spine mutation|ready for the next test|online\. send next test|still connected\. send the next test)\b/i.test(t);}
function isThinPlaceholderText(value){const t=lower(value);if(!t)return true;if(isDiagnosticText(t)||isRogueFallbackText(t))return true;if(t.length<18)return /^(ready|done|working|ok|okay|yes|no|next|continue|what next|i['’]?m here)$/i.test(t);return /^(i['’]?m here|i am here|i['’]?m online|i am online|still connected|online|ready)\b.*\b(next|test|continue|working on)\b/i.test(t)||/\b(i['’]?ll inspect|i will inspect|i['’]?m holding|i am holding)\b/i.test(t);}
function neutralInterruptedReply(){return "";}
function identityAnchorReply(){return "";}
function hotFallbackReply(_reason,_input={}){return "";}
function createLocalFinalEnvelope({normalized={},routed={},contract={},reason="local_final_fallback",loopGuardResult={}}={}){
  const routing=safeObj(routed.routing),intent=firstText(routing.intent,contract.intent,"simple_chat"),domain=firstText(routing.domain,contract.domain,normalized.domain,"general");
  let reply=firstText(extractReply(contract));
  if(!reply||isPrimitivePublicReply(reply)||isThinPlaceholderText(reply)||isDiagnosticText(reply)||isPublicWorkflowStateLeak(reply)||isPublicControlPolicyLeak(reply))return buildErrorResult(reason||"local_final_reply_missing",{issues:["local_final_reply_missing"],loopGuard:safeObj(loopGuardResult),publicWorkflowStateSuppressed:true},normalized);
  const memoryPatch=safeObj(contract.memoryPatch);
  const runtimeTelemetry=buildBridgeRuntimeTelemetry({source:"marionBridge.createLocalFinalEnvelope",normalized,routed,contract,reply,finalEnvelopeTrusted:true,canEmit:true,error:reason,loopGuardResult});
  const packet={
    ok:true,
    final:true,
    handled:true,
    marionFinal:true,
    awaitingMarion:false,
    suppressUserFacingReply:false,
    emit:true,
    blocked:false,
    finalEnvelope:{
      reply,
      spokenText:firstText(contract.spokenText,reply),
      intent,
      domain,
      turnId:firstText(normalized.turnId),
      sessionId:firstText(normalized.sessionId),
      stateStage:firstText(memoryPatch.stateStage,contract.stateStage,"final"),
      replySignature:firstText(contract.replySignature,memoryPatch.replySignature,hashText(reply)),
      source:"marionBridge",
      authority:"marionFinalEnvelope",
      contractVersion:FINAL_ENVELOPE_CONTRACT,
      signature:FINAL_SIGNATURE,
      singleFinalAuthority:true,
      final:true,
      marionFinal:true,
      runtimeTelemetry,
      finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION
    },
    reply,
    text:reply,
    answer:reply,
    output:reply,
    response:reply,
    message:reply,
    spokenText:reply,
    payload:{reply,text:reply,message:reply,answer:reply,output:reply,response:reply,final:true,marionFinal:true,awaitingMarion:false,suppressUserFacingReply:false,emit:true,blocked:false},
    speech:{enabled:safeObj(contract.speech).enabled!==false,silent:false,silentAudio:false,textDisplay:reply,textSpeak:firstText(safeObj(contract.speech).textSpeak,reply),presenceProfile:firstText(safeObj(contract.speech).presenceProfile,"receptive"),nyxStateHint:firstText(safeObj(contract.speech).nyxStateHint,"receptive")},
    memoryPatch,
    bridge:{version:VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,singleContract:true,localFinalFallback:true,deployHardeningVersion:MARION_BRIDGE_DEPLOY_HARDENING_VERSION},
    routed,
    diagnostics:{bridgeVersion:VERSION,deployHardeningVersion:MARION_BRIDGE_DEPLOY_HARDENING_VERSION,BENCHMARK_OBSERVATION_HOOK_VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,routerCalled:true,composerCalled:!!Object.keys(safeObj(contract)).length,composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,dependencies:DEPENDENCY_STATUS,loopGuardCalled:!!loopGuardMod,loopGuard:safeObj(loopGuardResult),singleContract:true,zeroLoopSurface:true,localFinalFallback:true,reason},
    meta:{version:VERSION,bridgeVersion:VERSION,deployHardeningVersion:MARION_BRIDGE_DEPLOY_HARDENING_VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,endpoint:CANONICAL_ENDPOINT,usedBridge:true,replyAuthority:"marionFinalEnvelope",semanticAuthority:"composeMarionResponse",composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopePresent:true,zeroLoopSurface:true,localFinalFallback:true,reason}
  };
  return attachLanguageSphereFinalMetadata(packet,{normalized,routed,contract:{...safeObj(contract),reply,text:reply,spokenText:stripPublicReplyScaffold(firstText(contract.spokenText,reply))},reply,runtimeTelemetry,loopGuardResult});
}
function extractUserText(input={}){const src=safeObj(input),body=safeObj(src.body),payload=safeObj(src.payload),packet=safeObj(src.packet),synthesis=safeObj(packet.synthesis);return firstText(src.userQuery,src.text,src.query,src.message,body.userQuery,body.text,body.query,body.message,payload.userQuery,payload.text,payload.query,payload.message,synthesis.userQuery,synthesis.text);}
function extractLane(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return firstText(src.lane,src.sessionLane,body.lane,body.sessionLane,session.lane,meta.lane,"general")||"general";}
function extractTurnId(input={}){const src=safeObj(input),body=safeObj(src.body),meta=safeObj(src.meta||body.meta);return firstText(src.turnId,src.requestId,src.traceId,src.id,body.turnId,body.requestId,body.traceId,meta.turnId,meta.requestId,meta.traceId);}
function extractPreviousMemory(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return safeObj(src.previousMemory||src.turnMemory||src.memory||body.previousMemory||body.turnMemory||body.memory||session.previousMemory||session.turnMemory||session.memory||meta.previousMemory||{});}
function extractMarionIntentPacket(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return safeObj(src.marionIntent||src.intentPacket||body.marionIntent||body.intentPacket||session.marionIntent||meta.marionIntent||{});}
function extractRequestedDomain(input={}){const src=safeObj(input),body=safeObj(src.body),meta=safeObj(src.meta||body.meta),packet=safeObj(src.packet),routing=safeObj(packet.routing);return firstText(src.requestedDomain,src.domain,body.requestedDomain,body.domain,meta.requestedDomain,meta.domain,meta.preferredDomain,routing.domain,"general")||"general";}
function normalizeInbound(input={}){
  let source=safeObj(input),commandPacket={};
  if(commandNormalizerMod&&typeof commandNormalizerMod.normalizeCommand==="function"){
    try{
      commandPacket=safeObj(commandNormalizerMod.normalizeCommand(source));
      if(commandPacket.userText||commandPacket.text){
        source={...source,text:firstText(commandPacket.userText,commandPacket.text,source.text,source.userQuery),userQuery:firstText(commandPacket.userText,commandPacket.text,source.userQuery,source.text),query:firstText(commandPacket.userText,commandPacket.text,source.query,source.text),sessionId:firstText(commandPacket.sessionId,source.sessionId),state:safeObj(commandPacket.state||source.state),commandPacket};
      }
    }catch(err){commandPacket={ok:false,error:safeStr(err&&(err.message||err)||"command_normalizer_failed")};}
  }
  const inputSource=canonicalInputSource(source);
  const rawUserQuery=extractUserText(source);
  const publicUserQueryRaw=normalizePublicNyxAddress(rawUserQuery);
  const spokenAliasRecovery=normalizeSpokenProjectAliases(publicUserQueryRaw);
  const publicUserQuery=firstText(spokenAliasRecovery.text,publicUserQueryRaw);
  const userQuery=normalizeParityText(publicUserQuery);
  const previousMemory=extractPreviousMemory(source);
  const memoryText=activeProjectTextFromMemory(previousMemory);
  const lane=extractLane(source);
  const requestedDomain=extractRequestedDomain(source);
  const phaseAnchor=resolvePhaseAnchor(userQuery,{activeLane:lane,currentLane:lane,activeProject:firstText(safeObj(source).activeProject,safeObj(source).topic),topic:firstText(safeObj(source).topic,requestedDomain),memoryText});
  const phaseAnchorInstruction=buildPhaseAnchorInstruction(userQuery,{activeLane:lane,currentLane:lane,activeProject:firstText(safeObj(source).activeProject,safeObj(source).topic),topic:firstText(safeObj(source).topic,requestedDomain),memoryText});
  const bareKnowledgeDomain=bareKnowledgeDomainActivationDomain(userQuery||rawUserQuery);
  const activeKnowledgeDomain=bareKnowledgeDomain||activeKnowledgeDomainFromMemory(previousMemory);
  const technicalTargetLock=canonicalTechnicalTargetFromText(userQuery||rawUserQuery);
  const issues=[];
  if(!userQuery)issues.push("user_query_missing");
  const turnId=extractTurnId(source)||`marion_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const sessionId=firstText(source.sessionId,source.body&&source.body.sessionId,source.meta&&source.meta.sessionId,"public")||"public";
  return{ok:issues.length===0,issues,original:source,commandPacket,userQuery,text:userQuery,query:userQuery,rawUserQuery,publicUserQuery,inputSource,source:inputSource,spokenAliasRecovery,phaseAnchor,phaseAnchorInstruction,voiceTextParity:{active:inputSource==="voice"||rawUserQuery!==userQuery||spokenAliasRecovery.changed,source:inputSource,normalizedText:userQuery,rawHash:hashText(rawUserQuery),normalizedHash:hashText(userQuery),parityLock:true,spokenAliasRecovery,phaseAnchor},technicalTargetLock,knowledgeDomain:bareKnowledgeDomain||activeKnowledgeDomain,activeKnowledgeDomain,lastActivatedKnowledgeDomain:activeKnowledgeDomain,knowledgeDomainExplicit:!!bareKnowledgeDomain,knowledgeDomainReason:bareKnowledgeDomain?"bare_domain_activation":(activeKnowledgeDomain&&isShortConceptFollowup(userQuery)?"active_domain_short_concept_carry":""),targetFile:firstText(safeObj(technicalTargetLock).targetFile,""),targetPath:firstText(safeObj(technicalTargetLock).targetPath,""),targetName:firstText(safeObj(technicalTargetLock).targetName,""),continuityTurnKey:buildContinuityTurnKey(userQuery,sessionId,turnId),lane,requestedDomain,domain:requestedDomain,previousMemory,marionIntent:extractMarionIntentPacket(source),publicDomainAccess:source.publicDomainAccess===true||safeObj(source.ui).domainAccess===true,forceDomainAnswer:source.forceDomainAnswer===true||safeObj(source.ui).hardRetry===true,requireMarionFinal:source.requireMarionFinal===true,domainAccess:safeArray(source.domainAccess),turnId,sessionId};
}
function isDefinitionQuery(text=""){const t=lower(text);return!!t&&(/\b(what\s+is|what\s+are|define|definition\s+of|meaning\s+of|explain|explain\s+the\s+term|explain\s+the\s+word|describe)\b/i.test(t)||/\?$/.test(t));}

function normalizeBridgeKnowledgeDomain(value=""){
  const raw=lower(value).replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  const map={psychology:"psychology",psych:"psychology",emotional:"psychology",emotion:"psychology",english:"english",language:"english",grammar:"english",writing:"english",ai:"ai",artificial_intelligence:"ai",cyber:"cyber",cybersecurity:"cyber",security:"cyber",law:"law",legal:"law",finance:"finance",financial:"finance",economics:"finance"};
  return map[raw]||"";
}
function isShortConceptFollowup(text=""){
  const t=lower(text).replace(/[?!.]+$/,"").trim();
  if(!t||t.length>96||bareKnowledgeDomainActivationDomain(t)||canonicalTechnicalTargetFromText(t))return false;
  if(/\b(full autopsy|line[-\s]?by[-\s]?line|audit|critical fix|patch|debug|backend|frontend|widget|script|file|api\/chat|deploy|syntax|node --check|reset|send|open|link)\b/i.test(t))return false;
  const words=t.split(/\s+/).filter(Boolean);
  return words.length>=1&&words.length<=6&&words.every(w=>w.length<=28)&&/[a-z]/i.test(t);
}
function activeKnowledgeDomainFromMemory(memory={}){
  const m=safeObj(memory),sb=safeObj(m.stateBridge),cv=safeObj(m.conversationVector),mc=safeObj(m.marionCohesion),st=safeObj(m.stateSpine||m.conversationState);
  const candidates=[m.activeKnowledgeDomain,m.lastActivatedKnowledgeDomain,m.lastKnowledgeDomain,sb.activeKnowledgeDomain,sb.lastActivatedKnowledgeDomain,sb.knowledgeDomain,cv.activeKnowledgeDomain,cv.knowledgeDomain,mc.activeKnowledgeDomain,mc.lastKnowledgeDomain,st.activeKnowledgeDomain,st.lastActivatedKnowledgeDomain,st.lastKnowledgeDomain];
  for(const c of candidates){const k=normalizeBridgeKnowledgeDomain(c);if(k)return k;}
  return "";
}

function definitionKnowledgeDomainFromText(text=""){const bare=bareKnowledgeDomainActivationDomain(text);if(bare)return bare;const t=lower(text);if(!isDefinitionQuery(t))return"";if(safeObj(canonicalTechnicalTargetFromText(t)).targetPath)return"";if(/\b(full autopsy|line[-\s]?by[-\s]?line|critical fix|critical fixes|patch|debug|backend|frontend|widget|script|file|api\/chat|render|deploy|node --check)\b/i.test(t))return"";const pairs=[["law",/\b(contract consideration|legal consideration|consideration in contract|consideration|contract|contract law|statute|jurisdiction|legal information|legal advice|liability|negligence|fiduciary|tort|case law|compliance)\b/i],["finance",/\b(cash[-\s]?flow|unit economics|runway|margin|gross margin|profit|revenue|ltv|cac|working capital|burn rate|capital markets|pricing tier|scenario analysis|financial resilience|auditing|audit process|financial audit|operational audit)\b/i],["psychology",/\b(cognitive distortion|emotional regulation|attachment|trauma|bias|cognition|cognitive|shutdown|emotional shutdown|anxiety|panic|behavior|behaviour)\b/i],["ai",/\b(tool routing|rag|retrieval augmented generation|llm|large language model|embedding|agent orchestration|ai agent|artificial intelligence|machine learning|model inference|prompt injection in ai)\b/i],["cyber",/\b(least privilege|mfa|multi[-\s]?factor|iam|identity access|zero trust|incident response|threat model|input validation|secrets rotation|phishing|ransomware|endpoint security|cloud security|network security|data protection|privacy minimization)\b/i],["english",/\b(sentence clarity|syntax|grammar|tone|wording|language flow|professional clarity|plain language|copyedit|proofread)\b/i]];for(const [d,rx]of pairs){if(rx.test(t))return d;}return"";}


function bareKnowledgeDomainActivationDomain(text=""){
  const t=lower(text).replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
  const map=Object.freeze({
    "psychology":"psychology","psych":"psychology","emotional":"psychology","emotion":"psychology",
    "english":"english","language":"english","grammar":"english","writing":"english",
    "ai":"ai","artificial intelligence":"ai",
    "cyber":"cyber","cybersecurity":"cyber","security":"cyber",
    "law":"law","legal":"law",
    "finance":"finance","financial":"finance","economics":"finance"
  });
  return map[t]||"";
}

function crossDomainSecondaryLaneProfile(text=""){
  const t=lower(text);
  if(!t||safeObj(canonicalTechnicalTargetFromText(t)).targetPath)return null;
  if(/\b(full autopsy|line[-\s]?by[-\s]?line|critical fix|critical fixes|patch|debug|backend|frontend|widget|script|file|api\/chat|render|deploy|node --check)\b/i.test(t))return null;
  const aiContext=/\b(ai product|ai system|ai agent|ai model|artificial intelligence product|artificial intelligence system|llm product|model product|recommendation system|machine learning system)\b/i.test(t);
  if(aiContext&&/\b(security|cyber|prompt injection|threat|vulnerability|attack|abuse|hardening|access control|secrets|input validation)\b/i.test(t))return{primary:"ai",secondary:["cyber"],reason:"ai_product_security_secondary_cyber",answerMode:"direct_with_secondary_context",confidence:0.97};
  if(aiContext&&/\b(business|finance|financial|cash[-\s]?flow|revenue|pricing|margin|cost|runway|market|commercial)\b/i.test(t))return{primary:"ai",secondary:["finance"],reason:"ai_product_business_secondary_finance",answerMode:"direct_with_secondary_context",confidence:0.94};
  if(aiContext&&/\b(compliance|regulatory|regulation|legal|law|governance|audit|liability|privacy|consent|data protection|risk)\b/i.test(t))return{primary:"ai",secondary:["law"],reason:"ai_product_compliance_secondary_law",answerMode:"direct_with_secondary_context",confidence:0.97};
  if(/\bcash[-\s]?flow risk\b/i.test(t)&&/\b(legal dispute|lawsuit|litigation|claim|settlement|court|legal)\b/i.test(t))return{primary:"finance",secondary:["law"],reason:"finance_cashflow_legal_secondary",answerMode:"direct_with_secondary_context",confidence:0.95};
  if(/\b(rewrite|translate|make|put)\b/i.test(t)&&/\blegal clause\b/i.test(t)&&/\bplain english|plain language|clear english\b/i.test(t))return{primary:"english",secondary:["law"],reason:"english_plain_language_legal_secondary",answerMode:"direct_with_secondary_context",confidence:0.94};
  if(/\b(cognitive bias|cognitive distortion|bias)\b/i.test(t)&&/\b(ai|recommendation system|model|algorithm|machine learning)\b/i.test(t))return{primary:"ai",secondary:["psychology"],reason:"ai_recommendation_psychology_secondary",answerMode:"direct_with_secondary_context",confidence:0.95};
  if(/\b(prompt injection)\b/i.test(t)&&/\bplain english|plain language|non[-\s]?technical|business owner\b/i.test(t))return{primary:"cyber",secondary:["ai","english"],reason:"cyber_prompt_injection_plain_english",answerMode:"direct_with_secondary_context",confidence:0.95};
  if(/\bleast privilege\b/i.test(t)&&/\bnon[-\s]?technical|business owner|plain english|plain language\b/i.test(t))return{primary:"cyber",secondary:["english"],reason:"cyber_least_privilege_plain_english",answerMode:"direct_with_secondary_context",confidence:0.95};
  return null;
}

function fallbackRoute(normalized){const projectGatewayReply=buildProjectGatewayPublicAnswerFromPacket({text:normalized.userQuery,userText:normalized.rawUserQuery,message:normalized.userQuery},{normalized});if(projectGatewayReply)return{ok:true,marionIntent:{activate:true,intent:"domain_question",confidence:0.96,source:"bridge_project_gateway_precedence_lock",knowledgeDomain:"",knowledgeDomainExplicit:false,knowledgeDomainReason:"project_gateway_precedence",secondaryDomains:[],answerMode:"direct_project_gateway_explanation",crossDomainProfile:null},routing:{domain:"general_reasoning",intent:"domain_question",knowledgeDomain:"",secondaryDomains:[],answerMode:"direct_project_gateway_explanation",crossDomainProfile:null,technicalTargetLock:safeObj(normalized.technicalTargetLock||canonicalTechnicalTargetFromText(normalized.userQuery)),lane:normalized.lane,endpoint:CANONICAL_ENDPOINT,mode:"project_gateway_explanation",depth:"direct",domainConfidence:{version:"nyx.marion.domainConfidence/1.1",confidence:0.96,band:"high",routeLocked:true,primaryDomain:"general_reasoning",knowledgeDomain:"",reason:"project_gateway_precedence"}},routerVersion:"bridge_project_gateway_precedence_lock/1.0"};const text=lower(normalized.userQuery),bareDomain=bareKnowledgeDomainActivationDomain(normalized.userQuery),activeDomain=normalized.activeKnowledgeDomain&&isShortConceptFollowup(normalized.userQuery)?normalizeBridgeKnowledgeDomain(normalized.activeKnowledgeDomain):"",technicalTargetLock=safeObj(normalized.technicalTargetLock||canonicalTechnicalTargetFromText(normalized.userQuery)),crossDomainProfile=crossDomainSecondaryLaneProfile(normalized.userQuery),definitionDomain=bareDomain||activeDomain||(crossDomainProfile&&crossDomainProfile.primary?crossDomainProfile.primary:definitionKnowledgeDomainFromText(normalized.userQuery));let intent="simple_chat",knowledgeDomain="";if(bareDomain){intent="domain_question";knowledgeDomain=bareDomain;}else if(activeDomain){intent="domain_question";knowledgeDomain=activeDomain;}else if(definitionDomain){intent="domain_question";knowledgeDomain=definitionDomain;}else if(/who are you|what are you|what(?:\'|’)s your name|what is your name|your name|what should i call you|are you nyx|how.*marion.*think|how.*you.*think|marion helps you think|identity|consciousness/i.test(text))intent="identity_query";else if(/bug|error|route|endpoint|index|diag|autopsy|line[- ]?by[- ]?line|loop|widget|frontend|backend|fix|script|file|state spine|chatengine|marionbridge|composemarionresponse|final envelope/i.test(text))intent="technical_debug";else if(/sad|stress|overwhelm|depress|anx|hurt|alone|frustr|panic|grief/i.test(text)){intent="emotional_support";knowledgeDomain="psychology";}else if(/rewrite|polish|proofread|grammar|tone|copyedit|wording|professional clarity|business english/i.test(text)){intent="domain_question";knowledgeDomain="english";}else if(/least privilege|mfa|multi[-\s]?factor|iam|identity access|zero trust|incident response|threat model|phishing|ransomware|prompt injection|cyber|cybersecurity|endpoint security|cloud security|network security|data protection|privacy minimization/i.test(text)){intent="domain_question";knowledgeDomain="cyber";}else if(/unit economics|cash flow|runway|margin|ltv|cac|pricing|finance|financial|capital markets|risk model/i.test(text)){intent="domain_question";knowledgeDomain="finance";}else if(/contract consideration|canadian law|legal information|legal advice|case law|statute|jurisdiction|tort|criminal law|charter/i.test(text)){intent="domain_question";knowledgeDomain="law";}else if(/cognitive distortion|emotional regulation|attachment|trauma|psychology|bias|fallacy/i.test(text)){intent="domain_question";knowledgeDomain="psychology";}else if(/rag|llm|embedding|tool routing|ai agent|machine learning|artificial intelligence|orchestration/i.test(text)){intent="domain_question";knowledgeDomain="ai";}else if(/digital transformation|business strategy|organizational intelligence|auditing|audit process|market positioning|operational strategy|price|sponsor|media|monet|pitch|fund|invest|sales|proposal/i.test(text))intent="business_strategy";else if(/top 10|song|artist|album|chart|music|radio|playlist/i.test(text))intent="music_query";else if(/news|story|headline|article|rss|newscanada/i.test(text))intent="news_query";else if(/roku|tv app|channel|linear tv|stream/i.test(text))intent="roku_query";else if(/remember|last time|continue|state spine|memory/i.test(text))intent="identity_or_memory";if(intent==="simple_chat"&&/\b(tell me about|explain|describe|define|what is|what are|what does)\b/i.test(text))intent="domain_question";const domainMap={simple_chat:"general",technical_debug:"technical",emotional_support:"emotional",business_strategy:"business",music_query:"music",news_query:"news",roku_query:"roku",identity_query:"identity",identity_or_memory:"memory",domain_question:"general_reasoning"};const domain=knowledgeDomain||domainMap[intent]||"general";return{ok:true,marionIntent:{activate:intent!=="simple_chat",intent,confidence:intent==="simple_chat"?0.4:0.82,source:"bridge_fallback_router",technicalTargetLock,knowledgeDomain,knowledgeDomainExplicit:!!knowledgeDomain,knowledgeDomainReason:crossDomainProfile&&crossDomainProfile.reason?crossDomainProfile.reason:(knowledgeDomain?"bridge_fallback_knowledge_terms":""),secondaryDomains:crossDomainProfile?crossDomainProfile.secondary||[]:[],answerMode:crossDomainProfile?crossDomainProfile.answerMode||"":"",crossDomainProfile:crossDomainProfile||null},routing:{domain,intent,knowledgeDomain,secondaryDomains:crossDomainProfile?crossDomainProfile.secondary||[]:[],answerMode:crossDomainProfile?crossDomainProfile.answerMode||"":"",crossDomainProfile:crossDomainProfile||null,technicalTargetLock,lane:normalized.lane,endpoint:CANONICAL_ENDPOINT,mode:knowledgeDomain?"knowledge_domain":"balanced",depth:knowledgeDomain==="cyber"||knowledgeDomain==="ai"?"forensic":"balanced",domainConfidence:{version:"nyx.marion.domainConfidence/1.1",confidence:knowledgeDomain?0.88:(intent==="simple_chat"?0.4:0.7),band:knowledgeDomain?"medium":"low",routeLocked:!!knowledgeDomain,primaryDomain:domain,knowledgeDomain,reason:knowledgeDomain?"bridge_fallback_knowledge_terms":"bridge_fallback_router"}},routerVersion:"bridge_fallback_router/1.1"};}
function validateRouterResult(result={}){const src=safeObj(result),routing=safeObj(src.routing),marionIntent=safeObj(src.marionIntent),issues=[];if(src.ok===false)issues.push("router_not_ok");if(!safeStr(routing.intent||marionIntent.intent))issues.push("intent_missing");if(!safeStr(routing.domain))issues.push("domain_missing");return{ok:issues.length===0,issues};}
function extractReply(contract={}){const src=safeObj(contract),finalEnvelope=safeObj(src.finalEnvelope),payload=safeObj(src.payload),synthesis=safeObj(src.synthesis),packet=safeObj(src.packet),packetSynthesis=safeObj(packet.synthesis);const reply=firstText(finalEnvelope.reply,finalEnvelope.text,finalEnvelope.spokenText,src.reply,src.text,src.answer,src.output,src.response,src.message,src.spokenText,payload.reply,payload.text,payload.answer,payload.output,payload.message,synthesis.reply,synthesis.text,synthesis.answer,synthesis.output,synthesis.spokenText,packetSynthesis.reply,packetSynthesis.text,packetSynthesis.answer,packetSynthesis.output,packetSynthesis.spokenText);return isThinPlaceholderText(reply)?"":reply;}
function validateComposeResult(contract={}){const issues=[],src=safeObj(contract),rawReply=firstText(safeObj(src.finalEnvelope).reply,src.reply,src.text,src.answer,src.output,src.response,src.message,src.spokenText,safeObj(src.payload).reply,safeObj(src.synthesis).reply,safeObj(safeObj(src.packet).synthesis).reply);if(!Object.keys(src).length)issues.push("compose_contract_missing");if(src.ok===false)issues.push("compose_not_ok");if(!extractReply(src))issues.push(isThinPlaceholderText(rawReply)?"compose_placeholder_reply":"compose_reply_missing");return{ok:issues.length===0,issues};}
function buildErrorResult(reason,detail={},input={}){const normalized=safeObj(input);const runtimeTelemetry=buildBridgeRuntimeTelemetry({source:"marionBridge.buildErrorResult",normalized,reply:"",finalEnvelopeTrusted:false,canEmit:false,error:reason});return{ok:false,final:false,handled:true,marionFinal:false,awaitingMarion:true,terminal:false,suppressUserFacingReply:true,emit:false,blocked:true,error:safeStr(reason||"bridge_error")||"bridge_error",reason:safeStr(reason||"bridge_error")||"bridge_error",detail:safeObj(detail),reply:"",text:"",output:"",response:"",message:"",payload:{reply:"",text:"",message:"",final:false,awaitingMarion:true,error:true,suppressUserFacingReply:true,emit:false,blocked:true},diagnostics:{bridgeVersion:VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,bridgeError:true,noUserFacingBridgeError:true,suppressUserFacingReply:true,emit:false,blocked:true,reason:safeStr(reason||"bridge_error"),detail:safeObj(detail)},meta:{version:VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,endpoint:CANONICAL_ENDPOINT,turnId:safeStr(normalized.turnId||""),final:false,marionFinal:false,awaitingMarion:true,suppressUserFacingReply:true,emit:false,blocked:true,replyAuthority:"none",reason:safeStr(reason||"bridge_error")}};}
function isGreetingOnly(text){const t=lower(text).replace(/[.!?]+$/g,"").trim();return /^(hi|hello|hey|yo|hiya|good morning|good afternoon|good evening)(\s+(nyx|nix|vera))?$/.test(t);}
function isHowAreYouTurn(text){const t=lower(text).replace(/[.!?]+$/g,"").trim();return /^(how are you|how are you today|how are you doing|how are you feeling|you good|are you okay|are you ok)(\s+(nyx|nix|vera))?$/.test(t);}
function isCapabilityQuestion(text){const t=lower(text);return /\b(what can you help with|what do you help with|what areas can you help with|what can you do|help me with|what are your lanes|what domains)\b/i.test(t);}
function isIdentityQuestion(text){const t=lower(text);return /\b(who are you|what are you|what is nyx|who is nyx|what is marion|who is marion|how do you work|how does marion help|how marion helps|marion helps you think)\b/i.test(t);}

const NYX_MARION_LOOP_GOVERNOR_VERSION = "nyx.marion.loopGovernor.capacitySeparation/1.0";
function isCognitiveLoadSeparationRequest(value=""){
  const text=lower(value);
  return !!(text&&/\b(marion|nyx|nix|nicks)\b/i.test(text)&&/\b(too much|cognitive load|overload|separate responsibilities|responsibilit(?:y|ies)|compromised|lingosentinel|lingo sentinel|lingolink|aster|thalon|fallon|loop|looping)\b/i.test(text));
}
function buildCognitiveLoadSeparationReply(){
  return "Your concern is valid: Marion should not carry every workload directly. The cleaner architecture is separation by responsibility: Nyx handles the public conversation, Marion keeps final authority and response arbitration, LingoSentinel handles language routing/adaptation as an advisory lane, Aster handles environmental observation as an advisory lane, and Thalon stays as strategic/ethical review. The fix is not to make Marion bigger; it is to make Marion the judge of final output while each subsystem does its own bounded job.";
}
function bridgeLoopGovernorReply(normalized={},routed={},reason=""){
  const source=[normalized.userQuery,normalized.rawUserQuery,normalized.userText,normalized.text,normalized.message,normalized.originalText,safeObj(normalized.payload).userText,safeObj(normalized.payload).message,reason].map(safeStr).filter(Boolean).join(" ");
  if(isCognitiveLoadSeparationRequest(source))return buildCognitiveLoadSeparationReply();
  if(/\b(loop|looping|duplicate|repeated|fallback)\b/i.test(source)&&/\b(nyx|nix|nicks|marion|bridge|composer|index|chat)\b/i.test(source)){
    return "Nyx should not render recycled fallbacks. Keep Marion as the final-answer authority, reject duplicate generic replies after sanitization, and keep support lanes advisory.";
  }
  return "";
}

function bridgeRecoveryReply(normalized={},routed={},reason="bridge_recovery"){
  const text=safeStr(normalized.userQuery||normalized.text||normalized.query||"");
  if(isCognitiveLoadSeparationRequest(text))return buildCognitiveLoadSeparationReply();
  const lingoSentinelReply=buildLingoSentinelPublicAnswerFromPacket({text,userText:normalized.rawUserQuery,message:text},{normalized});
  if(lingoSentinelReply)return lingoSentinelReply;
  const bare=bareKnowledgeDomainActivationDomain(text);if(bare)return bridgeDomainActivationReply(bare);
  const routing=safeObj(routed.routing);
  const intent=safeStr(routing.intent||safeObj(routed.marionIntent).intent||safeObj(normalized.marionIntent).intent||"simple_chat");
  if(isGreetingOnly(text))return WARM_NYX_GREETING;
  if(isHowAreYouTurn(text))return WARM_NYX_STATUS_REPLY;
  if(isCapabilityQuestion(text))return WARM_NYX_CAPABILITY_REPLY;
  if(intent==="identity_query"||isIdentityQuestion(text))return "I’m Nyx — the live Sandblast interface. Marion is the reasoning layer behind me: it helps with intent, context, memory, and final response shaping while I handle the conversation you see here.";
  if(intent==="technical_debug"||/\b(loop|looping|debug|test|fallback|technical|route|bridge|composer|chat engine|state spine|api|backend|frontend|final envelope)\b/i.test(text))return bridgeLoopGovernorReply(normalized,routed,reason);
  if(intent==="emotional_support"||/\b(sad|stress|overwhelm|anxious|panic|hurt|alone|grief)\b/i.test(text))return "I’m with you. Let’s keep this small and specific: what is the one pressure point that needs attention first?";
  return "";
}

function bridgeDomainActivationReply(domain=""){
  const d=lower(domain);
  const labels={psychology:"Psychology",english:"English",ai:"AI",cyber:"Cybersecurity",law:"Law",finance:"Finance"};
  const modes={
    psychology:"I’ll treat the next turn as psychology-first: cognition, behavior, emotion, framing, and practical next-step analysis.",
    english:"I’ll treat the next turn as English-first: wording, clarity, grammar, tone, and structure.",
    ai:"I’ll treat the next turn as AI-first: architecture, model behavior, routing, agents, tools, and implementation logic.",
    cyber:"I’ll treat the next turn as cybersecurity-first: defensive security, least privilege, risk, hardening, and safe validation.",
    law:"I’ll treat the next turn as law-first: legal information, issue framing, jurisdiction awareness, and practical caution.",
    finance:"I’ll treat the next turn as finance-first: assumptions, pricing, cash flow, risk, and scenario logic."
  };
  if(!labels[d])return"";
  return `${labels[d]} lane active. ${modes[d]}`;
}

function buildBridgeRecoveryFinal(normalized={},routed={},reason="bridge_recovery",detail={},loopGuardResult={}){
  const reply=bridgeRecoveryReply(normalized,routed,reason);
  const routing=safeObj(routed.routing);
  const contract={ok:true,reply,text:reply,answer:reply,output:reply,response:reply,message:reply,spokenText:reply,intent:safeStr(routing.intent||safeObj(routed.marionIntent).intent||"simple_chat"),domain:safeStr(routing.domain||normalized.domain||"general"),memoryPatch:{stateStage:"bridge_recovered_final",recoveryRequired:false,bridgeRecoveryReason:safeStr(reason),activeKnowledgeDomain:firstText(safeObj(routing).knowledgeDomain,normalized.activeKnowledgeDomain,normalized.knowledgeDomain),lastActivatedKnowledgeDomain:firstText(safeObj(routing).knowledgeDomain,normalized.activeKnowledgeDomain,normalized.knowledgeDomain),replySignature:hashText(reply)},sessionPatch:{stateStage:"bridge_recovered_final",recoveryRequired:false,bridgeRecoveryReason:safeStr(reason)},speech:{enabled:true,silent:false,silentAudio:false,textDisplay:reply,textSpeak:reply,presenceProfile:"receptive",nyxStateHint:"receptive"},meta:{bridgeRecovery:true,bridgeRecoverySurface:"user_safe",reason:safeStr(reason),detail:safeObj(detail)},diagnostics:{bridgeRecovery:true,bridgeRecoverySurface:"user_safe",technicalLanguageSuppressed:!/(technical_debug)/i.test(safeStr(routing.intent||"")),reason:safeStr(reason),detail:safeObj(detail)}};
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
function normalizeComposeInput(normalized,routed,resolvedEmotionPacket={}){
  const routing=safeObj(routed.routing),marionIntent=safeObj(routed.marionIntent),domainConcierge=compactDomainConciergeForBridge(safeObj(routed).domainConcierge||routing.domainConcierge||normalized.domainConcierge);
  const statePatch=safeObj(safeObj(safeObj(routed).domainConciergeRaw||{}).stateSpinePatch||safeObj(normalized.domainConcierge).stateSpinePatch);
  return{
    userQuery:normalized.userQuery,text:normalized.userQuery,query:normalized.userQuery,rawUserQuery:normalized.rawUserQuery,inputSource:normalized.inputSource,source:normalized.inputSource,voiceTextParity:safeObj(normalized.voiceTextParity),spokenAliasRecovery:safeObj(normalized.spokenAliasRecovery),phaseAnchor:safeObj(normalized.phaseAnchor),phaseAnchorInstruction:safeStr(normalized.phaseAnchorInstruction),continuityTurnKey:normalized.continuityTurnKey,
    domain:safeStr(routing.domain||domainConcierge.route||normalized.domain||"general")||"general",requestedDomain:safeStr(routing.domain||domainConcierge.route||normalized.requestedDomain||"general")||"general",intent:safeStr(routing.intent||domainConcierge.intent||marionIntent.intent||"simple_chat")||"simple_chat",
    knowledgeDomain:firstText(routing.knowledgeDomain,domainConcierge.knowledgeDomain,normalized.knowledgeDomain,normalized.activeKnowledgeDomain),activeKnowledgeDomain:firstText(normalized.activeKnowledgeDomain,routing.knowledgeDomain,domainConcierge.knowledgeDomain),lastActivatedKnowledgeDomain:firstText(normalized.lastActivatedKnowledgeDomain,normalized.activeKnowledgeDomain,routing.knowledgeDomain,domainConcierge.knowledgeDomain),
    marionIntent,routing:{...routing,domainConcierge},domainConcierge,concierge:domainConcierge,domainConfidence:safeObj(routing.domainConfidence||safeObj(safeObj(routed).domainConciergeRaw).domainConfidence),questionShape:safeObj(safeObj(safeObj(routed).domainConciergeRaw).questionShape),
    previousMemory:normalized.previousMemory,conversationState:safeObj(normalized.previousMemory.stateSpine||normalized.previousMemory.conversationState||normalized.commandPacket.state),lane:normalized.lane,sessionId:normalized.sessionId,turnId:normalized.turnId,sourceTurnId:normalized.turnId,
    stateSpinePatch:Object.keys(statePatch).length?statePatch:undefined,
    lingoSentinel:safeObj(normalized.lingoSentinel),languageMeta:safeObj(normalized.languageMeta),lingoInput:safeObj(normalized.lingoInput),translationMeta:safeObj(normalized.translationMeta),glossaryMeta:safeObj(normalized.glossaryMeta),glossaryIntegrity:safeObj(normalized.glossaryIntegrity),lingoSentinelGatewayMeta:safeObj(normalized.lingoSentinelGatewayMeta),lingoSentinelTelemetry:safeObj(normalized.lingoSentinelTelemetry),
    aster:safeObj(normalized.aster),asterObservation:safeObj(normalized.asterObservation),asterPassiveObservation:safeObj(normalized.asterPassiveObservation),environmentalPathway:safeObj(normalized.asterPassiveObservation||normalized.aster),parallelLaneCoordination:safeObj(normalized.parallelLaneCoordination),dualTrack:safeObj(normalized.dualTrack),coordinationTelemetry:safeObj(normalized.coordinationTelemetry),ethicalGate:safeObj(normalized.ethicalGate),riskClassification:safeObj(normalized.riskClassification),
    resolvedEmotion:safeObj(resolvedEmotionPacket.state),emotionRuntime:safeObj(resolvedEmotionPacket),emotionRuntimeOk:resolvedEmotionPacket.ok!==false
  };
}
function wrapFinal({normalized,routed,contract,loopGuardResult,resolvedEmotionPacket={}}){const rawReply=extractReply(contract);if(!rawReply)return createLocalFinalEnvelope({normalized,routed,contract,reason:"composer_reply_missing",loopGuardResult});if(!finalEnvelopeMod||typeof finalEnvelopeMod.createMarionFinalEnvelope!=="function")return createLocalFinalEnvelope({normalized,routed,contract:{...safeObj(contract),reply:rawReply,text:rawReply,spokenText:firstText(contract.spokenText,rawReply)},reason:"final_envelope_unavailable",loopGuardResult});const userText=normalized.userText||normalized.text||normalized.query||"",routing=safeObj(routed.routing),progressionRefinement=bridgeProgressionMemory(userText,rawReply,{...safeObj(contract.memoryPatch),...safeObj(normalized.memory),...safeObj(routed)}),reply=bridgeShapeProgressionReply(userText,rawReply,progressionRefinement,{...safeObj(contract.memoryPatch),...safeObj(normalized.memory),...safeObj(routed)}),progressionTelemetry=bridgeProgressionTelemetry(userText,reply,progressionRefinement),memoryPatch={...safeObj(contract.memoryPatch),progressionRefinement,progressionTelemetry,lingoSentinel:safeObj(normalized.lingoSentinel),languageMeta:safeObj(normalized.languageMeta),translationMeta:safeObj(normalized.translationMeta),glossaryMeta:safeObj(normalized.glossaryMeta),aster:safeObj(normalized.aster),asterObservation:safeObj(normalized.asterObservation),asterPassiveObservation:safeObj(normalized.asterPassiveObservation),parallelLaneCoordination:safeObj(normalized.parallelLaneCoordination),dualTrack:safeObj(normalized.dualTrack),coordinationTelemetry:safeObj(normalized.coordinationTelemetry),ethicalGate:safeObj(normalized.ethicalGate),riskClassification:safeObj(normalized.riskClassification),stateBridge:{...safeObj(safeObj(contract.memoryPatch).stateBridge),progressionRefinement,progressionTelemetry},domainConcierge:compactDomainConciergeForBridge(safeObj(contract).domainConcierge||safeObj(routed).domainConcierge||routing.domainConcierge)};const envelope=finalEnvelopeMod.createMarionFinalEnvelope({reply,spokenText:safeStr(contract.spokenText||reply),intent:safeStr(routing.intent||contract.intent||"simple_chat"),domain:safeStr(routing.domain||contract.domain||normalized.domain||"general"),routing:{...routing,endpoint:safeStr(routing.endpoint||CANONICAL_ENDPOINT)||CANONICAL_ENDPOINT},stateStage:safeStr(memoryPatch.stateStage||contract.stateStage||(loopGuardResult.forceRecovery?"recover":"final")),turnId:normalized.turnId,sessionId:normalized.sessionId,memoryPatch,resolvedEmotion:safeObj(resolvedEmotionPacket.state||contract.resolvedEmotion),emotionSummary:emotionSummary(resolvedEmotionPacket.state?resolvedEmotionPacket:safeObj(contract.emotionRuntime)),speech:safeObj(contract.speech),replySignature:safeStr(contract.replySignature||memoryPatch.replySignature||hashText(reply)),composerVersion:safeStr(contract.version||contract.composerVersion||""),bridgeVersion:VERSION,meta:{...safeObj(contract.meta),bridgeVersion:VERSION,lingoSentinelGatewayBridgeVersion:LINGOSENTINEL_GATEWAY_BRIDGE_VERSION,lingoSentinel:safeObj(normalized.lingoSentinel),languageMeta:safeObj(normalized.languageMeta),translationMeta:safeObj(normalized.translationMeta),glossaryMeta:safeObj(normalized.glossaryMeta),unknownLanguageAlert:safeObj(normalized.unknownLanguageAlert),scannerHeartbeat:safeObj(normalized.scannerHeartbeat),dormantScanner:safeObj(normalized.dormantScanner),lingoSentinelGatewayMeta:safeObj(normalized.lingoSentinelGatewayMeta),inputHash:safeStr(normalized.inputHash),gatewayHash:safeStr(normalized.gatewayHash),stableHash:safeStr(normalized.stableHash),correlationId:safeStr(normalized.correlationId),traceId:safeStr(normalized.traceId),notificationReady:!!normalized.notificationReady,parallelLaneCoordination:safeObj(normalized.parallelLaneCoordination),dualTrack:safeObj(normalized.dualTrack),coordinationTelemetry:safeObj(normalized.coordinationTelemetry),ethicalGate:safeObj(normalized.ethicalGate),riskClassification:safeObj(normalized.riskClassification),asterBridgeVersion:ASTER_BRIDGE_VERSION,aster:safeObj(normalized.asterPassiveObservation||normalized.aster),composerVersion:safeStr(contract.version||contract.composerVersion||""),loopGuardVersion:safeStr(loopGuardMod&&loopGuardMod.VERSION||""),routerVersion:safeStr(routed.routerVersion||routed.VERSION||""),normalizerVersion:safeStr(commandNormalizerMod&&commandNormalizerMod.VERSION||""),turnId:normalized.turnId},diagnostics:{...safeObj(contract.diagnostics),bridgeVersion:VERSION,lingoSentinelGatewayBridgeVersion:LINGOSENTINEL_GATEWAY_BRIDGE_VERSION,lingoSentinelGatewayAvailable:!!runLingoSentinelGateway,lingoSentinel:safeObj(normalized.lingoSentinel),languageMeta:safeObj(normalized.languageMeta),translationMeta:safeObj(normalized.translationMeta),glossaryMeta:safeObj(normalized.glossaryMeta),unknownLanguageAlert:safeObj(normalized.unknownLanguageAlert),scannerHeartbeat:safeObj(normalized.scannerHeartbeat),dormantScanner:safeObj(normalized.dormantScanner),lingoSentinelGatewayMeta:safeObj(normalized.lingoSentinelGatewayMeta),inputHash:safeStr(normalized.inputHash),gatewayHash:safeStr(normalized.gatewayHash),stableHash:safeStr(normalized.stableHash),correlationId:safeStr(normalized.correlationId),traceId:safeStr(normalized.traceId),notificationReady:!!normalized.notificationReady,parallelLaneCoordination:safeObj(normalized.parallelLaneCoordination),dualTrack:safeObj(normalized.dualTrack),coordinationTelemetry:safeObj(normalized.coordinationTelemetry),ethicalGate:safeObj(normalized.ethicalGate),riskClassification:safeObj(normalized.riskClassification),asterBridgeVersion:ASTER_BRIDGE_VERSION,aster:safeObj(normalized.asterPassiveObservation||normalized.aster),routerCalled:true,composerCalled:true,loopGuardCalled:!!loopGuardMod,loopGuard:safeObj(loopGuardResult),singleContract:true,finalAuthority:"marionFinalEnvelope"}});const runtimeTelemetry=buildBridgeRuntimeTelemetry({source:"marionBridge.wrapFinal",normalized,routed,contract,reply,finalEnvelopeTrusted:true,canEmit:true,loopGuardResult,resolvedEmotionPacket});if(!safeStr(safeObj(envelope.finalEnvelope).reply||envelope.reply)||isDiagnosticText(safeObj(envelope.finalEnvelope).reply||envelope.reply)||isThinPlaceholderText(safeObj(envelope.finalEnvelope).reply||envelope.reply))return createLocalFinalEnvelope({normalized,routed,contract:{...safeObj(contract),reply,text:reply,spokenText:firstText(contract.spokenText,reply)},reason:"final_envelope_invalid",loopGuardResult});const bridgeFinalPacket={...envelope,ok:true,final:true,marionFinal:true,handled:true,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,hardlockCompatible:true,trustedTransport:true,singleFinalAuthority:true,marionFinalSignature:firstText(safeObj(envelope.meta).marionFinalSignature,safeObj(envelope.finalEnvelope).marionFinalSignature,safeObj(envelope.finalEnvelope).signature,FINAL_SIGNATURE),bridge:{version:VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,singleContract:true},routed,diagnostics:{...safeObj(envelope.diagnostics),bridgeVersion:VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,routerVersion:safeStr(routed.routerVersion||routed.VERSION||""),composerVersion:safeStr(contract.version||contract.composerVersion||""),composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopeVersion:safeStr(finalEnvelopeMod.VERSION||""),dependencies:DEPENDENCY_STATUS,loopGuard:safeObj(loopGuardResult),singleContract:true,zeroLoopSurface:true,emotionRuntimeCalled:!!Object.keys(safeObj(resolvedEmotionPacket)).length,emotionRuntimeOk:resolvedEmotionPacket.ok!==false,emotionSummary:emotionSummary(resolvedEmotionPacket)},meta:{...safeObj(envelope.meta),version:VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,bridgeVersion:VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,replyAuthority:"marionFinalEnvelope",semanticAuthority:"composeMarionResponse",composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopePresent:true,zeroLoopSurface:true,trustedTransport:true,singleFinalAuthority:true,hardlockCompatible:true,emotionRuntimeCalled:!!Object.keys(safeObj(resolvedEmotionPacket)).length,emotionRuntimeOk:resolvedEmotionPacket.ok!==false,emotionPrimary:emotionSummary(resolvedEmotionPacket).primary,emotionSecondary:emotionSummary(resolvedEmotionPacket).secondary}};
  return attachLanguageSphereFinalMetadata(bridgeFinalPacket,{normalized,routed,contract:{...safeObj(contract),reply,text:reply,spokenText:stripPublicReplyScaffold(firstText(contract.spokenText,reply))},reply,runtimeTelemetry,loopGuardResult,resolvedEmotionPacket});
}
async function processWithMarionUnsafe(input={}){
  let normalized=normalizeInbound(input);
  if(!normalized.ok)return buildErrorResult("input_invalid",{issues:normalized.issues},normalized);
  const lingoSentinelInbound=await runLingoSentinelGatewayForBridgeSafe(normalized,input);
  normalized={...normalized,...safeObj(lingoSentinelInbound.normalizedPatch),lingoSentinel:{...safeObj(normalized.lingoSentinel),...safeObj(safeObj(lingoSentinelInbound).normalizedPatch).lingoSentinel}};
  const languageSphereInbound=await normalizeLanguageSphereInboundSafe(normalized);
  normalized={...normalized,...safeObj(languageSphereInbound.normalizedPatch),languageSphere:{...safeObj(normalized.languageSphere),...safeObj(safeObj(languageSphereInbound).normalizedPatch).languageSphere}};
  const asterPassiveObservation=runAsterPassiveObservationSafe(normalized,input);
  normalized={...normalized,asterPassiveObservation,aster:asterPassiveObservation,asterObservation:safeObj(asterPassiveObservation.observation),environmentalPathway:asterPassiveObservation};
  const parallelLaneCoordination=buildParallelCoordinationSafe(normalized,input);
  normalized={...normalized,parallelLaneCoordination,dualTrack:safeObj(parallelLaneCoordination.dualTrack),coordinationTelemetry:safeObj(parallelLaneCoordination.coordinationTelemetry),ethicalGate:safeObj(parallelLaneCoordination.ethicalGate),riskClassification:safeObj(parallelLaneCoordination.riskClassification)};
  if(typeof composeMarionResponse!=="function")return buildErrorResult("composer_unavailable",{dependencyStatus:DEPENDENCY_STATUS.composer,hardFailure:true},normalized);
  const resolvedEmotionPacket=resolveEmotionForTurn(normalized);
  let routed=null;
  if(typeof routeMarionIntent==="function"){try{routed=await Promise.resolve(routeMarionIntent({text:normalized.userQuery,query:normalized.userQuery,userQuery:normalized.userQuery,spokenAliasRecovery:safeObj(normalized.spokenAliasRecovery),phaseAnchor:safeObj(normalized.phaseAnchor),phaseAnchorInstruction:safeStr(normalized.phaseAnchorInstruction),lane:normalized.lane,requestedDomain:normalized.requestedDomain,domain:normalized.domain,knowledgeDomain:normalized.knowledgeDomain,activeKnowledgeDomain:normalized.activeKnowledgeDomain,lastActivatedKnowledgeDomain:normalized.lastActivatedKnowledgeDomain,knowledgeDomainExplicit:normalized.knowledgeDomainExplicit,knowledgeDomainReason:normalized.knowledgeDomainReason,marionIntent:normalized.marionIntent,previousMemory:normalized.previousMemory,session:{lane:normalized.lane,previousMemory:normalized.previousMemory,marionIntent:normalized.marionIntent},turnId:normalized.turnId,lingoSentinel:safeObj(normalized.lingoSentinel),languageMeta:safeObj(normalized.languageMeta),lingoInput:safeObj(normalized.lingoInput),translationMeta:safeObj(normalized.translationMeta),glossaryMeta:safeObj(normalized.glossaryMeta),lingoSentinelGatewayMeta:safeObj(normalized.lingoSentinelGatewayMeta),aster:safeObj(normalized.aster),asterObservation:safeObj(normalized.asterObservation),asterPassiveObservation:safeObj(normalized.asterPassiveObservation),environmentalPathway:safeObj(normalized.environmentalPathway),parallelLaneCoordination:safeObj(normalized.parallelLaneCoordination),dualTrack:safeObj(normalized.dualTrack),coordinationTelemetry:safeObj(normalized.coordinationTelemetry),ethicalGate:safeObj(normalized.ethicalGate),riskClassification:safeObj(normalized.riskClassification),resolvedEmotion:safeObj(resolvedEmotionPacket.state),emotionRuntime:safeObj(resolvedEmotionPacket)}));}catch(_){routed=null;}}
  if(!validateRouterResult(routed).ok||normalized.knowledgeDomainExplicit)routed=fallbackRoute(normalized);
  const publicDomainRoute=fallbackRoute(normalized);
  if((normalized.publicDomainAccess===true||normalized.forceDomainAnswer===true||safeArray(normalized.domainAccess).length>0) && safeStr(safeObj(publicDomainRoute.routing).knowledgeDomain))routed=publicDomainRoute;
  const domainConciergeRaw=runDomainConciergeSafe(normalized,routed,resolvedEmotionPacket);
  const domainConcierge=compactDomainConciergeForBridge(domainConciergeRaw);
  if(Object.keys(domainConcierge).length){
    normalized.domainConcierge=domainConciergeRaw;
    routed=mergeDomainConciergeIntoRoute({...safeObj(routed),domainConciergeRaw},domainConciergeRaw);
  }
  if(domainConcierge.action==="clarify"&&domainConcierge.clarifier&&!shouldSuppressDomainConciergeClarifier(normalized,domainConcierge)){
    const clarifyContract={ok:true,reply:domainConcierge.clarifier,text:domainConcierge.clarifier,answer:domainConcierge.clarifier,output:domainConcierge.clarifier,response:domainConcierge.clarifier,message:domainConcierge.clarifier,spokenText:domainConcierge.clarifier,intent:domainConcierge.intent,domain:domainConcierge.route,memoryPatch:{stateStage:"classified",domainConcierge,lastConciergeAction:"clarify",lastRoute:domainConcierge.route,lastIntent:domainConcierge.intent,lastRouteConfidence:domainConcierge.confidence,lastClarifier:domainConcierge.clarifier,domainConfidence:safeObj(domainConciergeRaw.domainConfidence),questionShape:safeObj(domainConciergeRaw.questionShape)},sessionPatch:{domainConcierge,lastConciergeAction:"clarify",lastRoute:domainConcierge.route,lastIntent:domainConcierge.intent,lastRouteConfidence:domainConcierge.confidence,lastClarifier:domainConcierge.clarifier},meta:{domainConcierge,domainConciergeClarifier:true},diagnostics:{domainConciergeObserved:true,domainConciergeClarifier:true}};
    return createLocalFinalEnvelope({normalized,routed,contract:clarifyContract,reason:"domain_concierge_clarifier",loopGuardResult:{ok:true,loopDetected:false,allowReply:true,forceRecovery:false,reasons:[]}});
  }
  const composeInput=normalizeComposeInput(normalized,routed,resolvedEmotionPacket);
  let contract={};
  try{contract=await Promise.resolve(composeMarionResponse({...safeObj(routed),primaryDomain:safeStr(safeObj(routed.routing).domain||composeInput.domain),domain:safeStr(safeObj(routed.routing).domain||composeInput.domain),intent:safeStr(safeObj(routed.routing).intent||composeInput.intent),routing:safeObj(routed.routing),marionIntent:safeObj(routed.marionIntent)},composeInput));}
  catch(err){return buildErrorResult("composer_exception",{message:safeStr(err&&(err.message||err)||""),routed:safeObj(routed)},normalized);}
  contract=applyProjectRecoveryReplyOverride(applyLingoSentinelReplyOverride(safeObj(contract),{normalized,routed}),{normalized,routed});
  if(Object.keys(domainConcierge).length){contract={...safeObj(contract),domainConcierge,meta:{...safeObj(safeObj(contract).meta),domainConcierge},memoryPatch:{...safeObj(safeObj(contract).memoryPatch),domainConcierge},sessionPatch:{...safeObj(safeObj(contract).sessionPatch),domainConcierge}};}
  let composeValidation=validateComposeResult(contract);
  if(!composeValidation.ok)return buildErrorResult("composer_invalid",{issues:composeValidation.issues,composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,rawPreview:safeStr(firstText(safeObj(contract).reply,safeObj(contract).text,safeObj(contract).message)).slice(0,180)},normalized);
  contract=mergeEmotionIntoContract(contract,resolvedEmotionPacket);
  contract=applyProjectRecoveryReplyOverride(applyLingoSentinelReplyOverride(safeObj(contract),{normalized,routed}),{normalized,routed});
  let reply=extractReply(contract),loopGuardResult={ok:true,loopDetected:false,allowReply:true,forceRecovery:false,reasons:[]};
  if(loopGuardMod&&typeof loopGuardMod.applyLoopGuard==="function"){try{loopGuardResult=safeObj(loopGuardMod.applyLoopGuard({...composeInput,state:{...safeObj(composeInput.conversationState),...safeObj(normalized.commandPacket&&normalized.commandPacket.state),lastAssistantReply:safeStr(safeObj(composeInput.conversationState).lastAssistantReply||safeObj(normalized.commandPacket&&normalized.commandPacket.state).lastAssistantReply),loopCount:Number(safeObj(composeInput.conversationState).loopCount||safeObj(normalized.commandPacket&&normalized.commandPacket.state).loopCount||0)}},reply));if(loopGuardResult.forceRecovery){const recoveryContract=await Promise.resolve(composeMarionResponse({...safeObj(routed),forceRecovery:true,recoveryRequired:true,loopGuard:loopGuardResult,lastLoopReasons:safeArray(loopGuardResult.reasons)},{...composeInput,forceRecovery:true,recoveryRequired:true,loopGuard:loopGuardResult,lastLoopReasons:safeArray(loopGuardResult.reasons),state:{...safeObj(composeInput.conversationState),stateStage:"recover",recoveryRequired:true,loopCount:Number(safeObj(composeInput.conversationState).loopCount||0)+1,lastLoopReasons:safeArray(loopGuardResult.reasons)}}));const rv=validateComposeResult(recoveryContract);if(!rv.ok)return buildBridgeRecoveryFinal(normalized,routed,"loop_recovery_invalid",{issues:rv.issues,loopGuard:loopGuardResult},loopGuardResult);contract=mergeEmotionIntoContract(recoveryContract,resolvedEmotionPacket);reply=extractReply(contract);if(!reply||isGenericGreetingStatusFallback(reply)||isThinPlaceholderText(reply)||isPublicControlPolicyLeak(reply)||isDiagnosticText(reply))return buildBridgeRecoveryFinal(normalized,routed,"loop_recovery_blocked_invalid_public_reply",{replyPreview:safeStr(reply).slice(0,160),loopGuard:loopGuardResult},loopGuardResult);}}catch(err){loopGuardResult={ok:false,loopDetected:false,allowReply:true,forceRecovery:false,reasons:["loop_guard_error"],detail:safeStr(err&&(err.message||err)||"")};}}
  if(!reply||isThinPlaceholderText(reply))return buildErrorResult("final_reply_rejected",{reason:"thin_or_placeholder_reply",loopGuard:loopGuardResult},normalized);
  return wrapFinal({normalized,routed,contract,loopGuardResult,resolvedEmotionPacket});
}
async function processWithMarion(input = {}) {
  let normalizedForPublicReply = {};
  try { normalizedForPublicReply = normalizeInbound(input); } catch (_err) { normalizedForPublicReply = {}; }
  try {
    const packet = await processWithMarionUnsafe(input);
    const observedPacket = observeBridgeRuntimeSafely(packet,{normalized: normalizedForPublicReply,phase:"phase5-bridge-passive-observation"});
    const safePacket = observedPacket && observedPacket.ok === false ? transportSafeError(observedPacket) : transportSafePacket(observedPacket);
    return enforceValidPublicReply(safePacket,{normalized: normalizedForPublicReply});
  } catch (err) {
    const safePacket = transportSafeError(buildErrorResult("bridge_transport_exception", { message: safeStr(err && (err.message || err) || "") }, Object.keys(normalizedForPublicReply).length?normalizedForPublicReply:normalizeInbound(input)));
    return enforceValidPublicReply(safePacket,{normalized: normalizedForPublicReply});
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
    domainConciergeResolvedPath: DEPENDENCY_STATUS.domainConcierge.resolvedPath,
    domainConciergeExists: !!DEPENDENCY_STATUS.domainConcierge.exists,
    authority: "bridge.wrapFinal -> marionFinalEnvelope",
    stateSchema: STATE_SPINE_SCHEMA,
    stateSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    deployHardeningVersion: MARION_BRIDGE_DEPLOY_HARDENING_VERSION,
    languageSphereBridgeVersion: LANGUAGE_SPHERE_BRIDGE_VERSION,
    asterBridgeVersion: ASTER_BRIDGE_VERSION,
    asterEnvironmentAdapterResolvedPath: DEPENDENCY_STATUS.asterEnvironmentAdapter.resolvedPath,
    asterEnvironmentAdapterExists: !!DEPENDENCY_STATUS.asterEnvironmentAdapter.exists
  };
}

module.exports={VERSION,NYX_MARION_LOOP_GOVERNOR_VERSION,CANONICAL_ENDPOINT,DEPENDENCY_STATUS,PIPELINE_FORENSIC_NORMALIZATION_VERSION,FINAL_RUNTIME_TELEMETRY_VERSION,DOMAIN_CONCIERGE_VERSION,CONFIDENCE_AWARE_RESPONSE_SHAPING_VERSION,LANGUAGE_SPHERE_BRIDGE_VERSION,LINGOSENTINEL_GATEWAY_BRIDGE_VERSION,ASTER_BRIDGE_VERSION,MARION_BRIDGE_DEPLOY_HARDENING_VERSION,PROGRESSION_SHAPING_REFINEMENT_VERSION,TELEMETRY_VISIBILITY_VERSION,FAILURE_SIGNATURE_AUDIT_VERSION,classifyFailureSignature,buildFailureSignatureAudit,isTelemetryLeakText,stripTelemetryLeakFromReply,bridgeForensicNormalizationStatus,retrieveLayer2Signals,processWithMarion,createMarionBridge,route,maybeResolve,ask,handle,default:processWithMarion,_internal:{NYX_MARION_LOOP_GOVERNOR_VERSION,isCognitiveLoadSeparationRequest,buildCognitiveLoadSeparationReply,bridgeLoopGovernorReply,normalizeInbound,canonicalTechnicalTargetFromText,fallbackRoute,validateRouterResult,extractReply,validateComposeResult,wrapFinal,buildErrorResult,buildBridgeRecoveryFinal,bridgeRecoveryReply,createLocalFinalEnvelope,hotFallbackReply,identityAnchorReply,isDiagnosticText,isThinPlaceholderText,DEPENDENCY_STATUS,COMPOSER_REQUIRE_CANDIDATES,DOMAIN_CONCIERGE_REQUIRE_CANDIDATES,compactDomainConciergeForBridge,runDomainConciergeSafe,mergeDomainConciergeIntoRoute,resolveEmotionForTurn,emotionSummary,mergeEmotionIntoContract,jsonSafe,canonicalInputSource,normalizeParityText,buildContinuityTurnKey,transportSafePacket,transportSafeError,compactPatchForTransport,compactResolvedEmotion,compactCreativeCognitiveCarry,signatureLooksTrusted,hasTrustedBridgeFinalPacket,hasFinalFailureShape,bridgeForensicNormalizationStatus,buildBridgeRuntimeTelemetry,classifyFailureSignature,buildFailureSignatureAudit,isTelemetryLeakText,stripTelemetryLeakFromReply,normalizeLanguageSphereInboundSafe,runLingoSentinelGatewayForBridgeSafe,normalizeLingoSentinelGatewaySurfaceForBridge,attachLanguageSphereFinalMetadata,languageSpherePayload,normalizeLanguageSphereSurface,isMarionAuthorityValue,normalizePublicNyxAddress,buildNyxPublicContextPassport,isLingoSentinelExplanationPrompt,isAsterExplanationPrompt,isGenericGreetingStatusFallback,buildLingoSentinelPublicAnswerFromPacket,buildAsterPublicAnswerFromPacket,buildProjectGatewayPublicAnswerFromPacket,applyLingoSentinelReplyOverride,normalizeSpokenProjectAliases,detectSpokenProjectAliasHit,bridgeProgressionProfile,bridgeProgressionMemory,bridgeProgressionTelemetry,bridgeShapeProgressionReply,resolvePhaseAnchor,buildPhaseAnchorInstruction,applyProjectRecoveryReplyOverride,isProgressionShapingRequest,isDomainConfidenceRequest,shouldSuppressDomainConciergeClarifier,readPublicReplyCandidate,isInvalidPublicReplyValue,buildPrimitiveReplyRecovery,applyReplyEverywhere,enforceValidPublicReply,observeBridgeRuntimeSafely,runAsterPassiveObservationSafe,bridgeAsterShouldObserve,bridgeAsterBuildInput,compactAsterObservationForBridge,buildParallelCoordinationSafe,bridgeLaneRecencySummary},
  FINAL_RENDER_TELEMETRY_VERSION};
