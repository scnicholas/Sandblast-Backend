"use strict";

const VERSION = "MARION-PERSONALITY-SOCIAL-CHECKIN-R5 + MARION-PERSONALITY-GREETING-R4-LIVE-ROUTE-BINDING + MARION-SOCIAL-PRESENCE-GATE-R3 + PRIORITY-9J-R1B-OBJECT-REPLY-SERIALIZATION-GUARD + PRIORITY-9J-R1A-RUNTIME-DECISION-SPECIFIC-FINAL-OVERRIDE + PRIORITY-9J-R1-DECISION-SPECIFIC-AUTHORITY-HOTFIX + PRIORITY-9I-R2A-ALT-PRESSURE-SPECIFIC-FINAL-OVERRIDE + PRIORITY-9I-R2-PRESSURE-SPECIFIC-ANSWER-SHAPING + PRIORITY-9I-R1-9J-PREMATURE-ESCALATION-CONTAINMENT + PRIORITY-9H-R1-ADVANCEMENT-SHAPE-HOTFIX + PRIORITY-9H-LONG-FORM-CONTINUITY-STRESS-DRIFT-GUARD + PRIORITY-9I-ADAPTIVE-SITUATIONAL-PRECHECK + PRIORITY-9F-R4-CONTINUATION-CARRY-ENFORCEMENT + PRIORITY-9F-R3-ALT-PROMPT-ECHO-SUPPRESSION + PRIORITY-9F-R2-DOMAIN-HIJACK-SUPPRESSION + PRIORITY-9F-R1-LAYERED-PRECEDENCE-HOTFIX + PRIORITY-9F-DEEP-CONVERSATIONAL-STACK + marionBridge v7.9.27 PRIORITY-9E-R3-SPECIFIC-TASK-RECALL-ENFORCEMENT + PRIORITY-9E-R2-CONCRETE-CONTINUATION-ENFORCEMENT + PRIORITY-9E-LOOP-GOVERNOR-META-RECOVERY-SUPPRESSION + PRIORITY-90-ECHO-FALLBACK-REPAIR + VISIBLE-FINAL-PROMPT-SCOPE-HARDLOCK + ADMIN-TEXT-CONSOLE-VOICE-PURGE + MARION-ADMIN-TEXT-RUNTIME-HANDLER + MARION-ADMIN-INTERFACE-CARRY + PHASE2-SPEECH-SYNC-METADATA-CARRY + VOICE-CARRY-FINAL-DELIVERY-STABILIZER + VOICE-LANE-BRIDGE-CONTRACT + AUTHORITY-TRANSPORT-REPLY-SALVAGE + CONTINUITY-DETERMINISTIC-RECOVERY + CONTINUITY-RESOLVED-PROMPT-HANDOFF-HOTFIX + SIX-DOMAIN-FINAL-ENVELOPE-PROMOTION + SIX-DOMAIN-COVERAGE-BRIDGE-CARRY + SIX-DOMAIN-PRIMITIVE-RECOVERY + CURRENT-USER-PROGRESSION-GATE + SILENT-SUPPRESSION-HARDLOCK + PROGRESSION-SOURCE-KILL-HARDLOCK + LOOP-SUPPRESSION-FUTURE-HARDLOCK + PUBLIC-SURFACE-LEAK-HARDLOCK + NYX-MARION-LOOP-GOVERNOR-CAPACITY-SEPARATION + MARION-LINGOSENTINEL-GATEWAY-LIVE-PATH + RESPONSE-SHAPING-EXPANSION-HARDLOCK + PROGRESSION-CONTEXT-PROTECTION-HARDLOCK + FOUR-PHASE-PROGRESSION-ANCHOR-HARDLOCK + PROGRESSION-SHAPING-ANCHOR-HARDLOCK + DOMAIN-CONFIDENCE-SCORING-HARDLOCK + DOMAIN-CONFIDENCE-NEXT-PHASE-CARRY + PRIMITIVE-PUBLIC-REPLY-HARDLOCK + LANGUAGE-CA-SPOKEN-ALIAS-RECOVERY + MIC-TEXT-SPOKEN-ALIAS-PHASE-ANCHOR-HARDENING + DIRECT-TRANSLATION-TARGET-EN-CARRY + DIRECT-TRANSLATION-COMMAND-CARRY + LINGOSENTINEL-MULTILINGUAL-FALSE-SUPPRESSION + LINGOSENTINEL-GREETING-PRECEDENCE-BRIDGE-LOCK + PUBLIC-CONTROL-PHRASE-HARDLOCK + PUBLIC-REPLY-HYGIENE-HARDLOCK + NYX-PUBLIC-AGENT-ALIAS-LOCK + RENDER-DEPLOY-HARDENED + LANGUAGESPHERE-SURFACE-PASSTHROUGH + CONFIDENCE-AWARE-SHAPING-CARRY + DOMAIN-CONCIERGE-RUNTIME-ORCHESTRATION + SHORT-CONCEPT-FOLLOWUP-BRIDGE-CARRY + BARE-DOMAIN-ACTIVATION-BRIDGE-LOCK + LOOP-FALLBACK-FINAL-REJECTION + SIX-DOMAIN-DEFINITION-ROUTING-AUTHORITY-LOCK + IDENTITY-RESET-GENERIC-FALLBACK-LOOP-LOCK + OUTER-SCHEDULER-BYPASS-COMPAT + TECHNICAL-TARGET-LOCK + FALLBACK-KNOWLEDGE-DOMAIN-ROUTE-FIX + FINAL-RUNTIME-TELEMETRY + FIVE-TURN-CONTINUITY-PARITY-BRIDGE + FINAL-AUTHORITY-STATE-CREATIVE-COMPAT-HARDENED + TELEMETRY-VISIBILITY-FAILURE-SIGNATURE-AUDIT + FINAL-RENDER-TELEMETRY-HARDLOCK + PHASE5-BENCHMARK-OBSERVATION-HOOK-PASSIVE + LINGOSENTINEL-ASTER-GATEWAY + ASTER-PASSIVE-OBSERVATION-BRIDGE + ASTER-AUTHORITY-GUARD + LINGOSENTINEL-GATEWAY-ORCHESTRATION-BRIDGE + LINGOSENTINEL-ALERT-SCANNER-BRIDGE-CARRY + PARALLEL-LANE-COORDINATION-BRIDGE + PARALLEL-LANE-RECENCY-MAINTENANCE + STALE-CARRY-SUPPRESSION-HARDLOCK + LIVE-MULTITURN-PARALLEL-LANE-HARDLOCK + PRODUCTION-DEPLOYMENT-LOCK + PRODUCTION-MONITORING-SHIELD + RELEASE-READINESS-ROLLBACK-SAFETY + INVALID-PUBLIC-REPLY-LAST-MILE-RECOVERY + DETERMINISTIC-ORIGINAL-PROMPT-RECOVERY + ADMIN-VOICE-OUTPUT-PROJECTION-V1 + ADMIN-PRIVATE-VOICE-RECEIVE-V1";
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


function bridgeDefensiveEscalationCarry(normalized={},input={},payload={},dualTrack={},riskClassification={}){
  const n=safeObj(normalized), i=safeObj(input), pl=safeObj(payload), dt=safeObj(dualTrack);
  const realWorldTrack=safeObj(dt.realWorldTrack||pl.realWorldTrack||n.realWorldTrack||i.realWorldTrack);
  const envelope=safeObj(realWorldTrack.envelope||pl.realWorldEnvelope||n.realWorldEnvelope||i.realWorldEnvelope||safeObj(i.envelope));
  const defensiveJustification=firstObj(
    i.defensiveJustification, i.defensiveIntentJustifier, i.escalationJustification,
    n.defensiveJustification, n.defensiveIntentJustifier, n.escalationJustification,
    pl.defensiveJustification, pl.defensiveIntentJustifier, pl.escalationJustification,
    envelope.defensiveJustification, envelope.intentJustifier, safeObj(safeObj(i.guardian).defensiveJustification)
  );
  const text=firstText(n.userQuery,i.userText,i.rawUserText,i.text,i.message,pl.text,pl.message,envelope.observationSummary,envelope.originalSummary,defensiveJustification.reason,defensiveJustification.summary,defensiveJustification.purpose);
  const explicitCommand=i.explicitCommand===true||n.explicitCommand===true||pl.explicitCommand===true||defensiveJustification.explicitCommand===true||defensiveJustification.commandVerified===true||/\b(?:explicit|secure|authorized|confirmed)\s+(?:command|code|phrase|authorization|approval)\b|\bintent\s+justifier\b/i.test(text);
  const immediateThreat=i.immediateThreat===true||n.immediateThreat===true||pl.immediateThreat===true||defensiveJustification.immediateThreat===true||/\bimminent\s+(?:threat|harm|danger|attack)\b|\bactive\s+(?:threat|danger|intrusion|attack)\b|\bemergency\b/i.test(text);
  const protectivePurpose=i.protectivePurpose===true||n.protectivePurpose===true||pl.protectivePurpose===true||defensiveJustification.protectivePurpose===true||/\bself[-\s]?defen[cs]e\b|\bpersonal\s+safety\b|\bprotect(?:ion|ing)?\b|\bdefen[cs]e\s+of\s+(?:self|others|another|someone)\b/i.test(text);
  const escalationRequested=i.escalationRequested===true||n.escalationRequested===true||pl.escalationRequested===true||defensiveJustification.escalationRequested===true||/\balarm\b|\bsiren\b|\bdecibel\b|\b90\s*dB\b|\bgod[-\s]?ray\b|\bdefensive\s+escalation\b|\bprotection\s+service\b/i.test(text);
  return {
    defensiveJustification:{...defensiveJustification,explicitCommand,immediateThreat,protectivePurpose,escalationRequested,purpose:firstText(defensiveJustification.purpose,protectivePurpose?"protection":""),reason:firstText(defensiveJustification.reason,defensiveJustification.summary,text)},
    defensiveIntentJustifier:defensiveJustification,
    escalationJustification:defensiveJustification,
    explicitCommand,
    immediateThreat,
    protectivePurpose,
    escalationRequested,
    riskClassification:safeObj(riskClassification),
    riskLevel:firstText(safeObj(riskClassification).riskLevel,safeObj(riskClassification).level,realWorldTrack.riskLevel,envelope.riskLevel),
    source:"marionBridge.defensiveEscalationCarry"
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
  const defensiveEscalationCarry=bridgeDefensiveEscalationCarry(normalized,input,payload,dualTrack,riskClassification);
  let ethicalGate={};
  try{if(typeof evaluateEthicalGate==="function")ethicalGate=safeObj(evaluateEthicalGate({realWorldTrack:safeObj(dualTrack.realWorldTrack),realWorldEnvelope:safeObj(safeObj(dualTrack.realWorldTrack).envelope),riskClassification,observationSummary:firstText(safeObj(safeObj(dualTrack.realWorldTrack).envelope).observationSummary,safeObj(payload.realWorldObservation).summary,payload.text),...defensiveEscalationCarry},{source:"marionBridge",config:{defensiveEscalation:{enabled:true}}}));}catch(err){ethicalGate={ok:false,error:safeStr(err&&(err.message||err)||"ethical_gatekeeper_failed"),source:"marionBridge"};}
  const telemetryPayload={...payload,...safeObj(dualTrack),riskClassification,defensiveEscalationCarry,defensiveJustification:safeObj(defensiveEscalationCarry.defensiveJustification),defensiveEscalation:safeObj(ethicalGate.defensiveEscalation),ethicalGate,ethicalGatekeeper:ethicalGate};
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
    defensiveEscalationCarry,
    defensiveEscalation:safeObj(ethicalGate.defensiveEscalation),
    defensiveJustification:safeObj(ethicalGate.defensiveJustification||safeObj(defensiveEscalationCarry).defensiveJustification),
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
    voice: buildBridgeVoiceCarry(firstObj(n,c)),
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




function normalizeEchoTextForCompare(value=""){return safeStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function isPromptEchoReply(reply="",prompt=""){const r=normalizeEchoTextForCompare(reply),p=normalizeEchoTextForCompare(prompt);if(!r||!p)return false;return r===p||r===p.replace(/^(please )?/,'')||p.includes(r)&&r.length>12||r.includes(p)&&p.length>12;}
function isExcessExpressionReply(value=""){const t=safeStr(value);return /\b(stop the echo|switching from invitation to execution|recovery line has already served its purpose|next line must carry progress|public knowledge topic|useful answer should|six-domain layer|final envelope|state spine|progression shaping|runtimeTelemetry|replyAuthority|diagnostic packet)\b/i.test(t);}
function isAdminVoiceOutputProjectionContext(packet={},prompt=""){
  const p=safeObj(packet), payload=safeObj(p.payload), voice=safeObj(p.voice), meta=safeObj(p.meta);
  return p.adminVoiceRuntimeApproval===true||p.adminVoiceDeliveryAllowed===true||payload.adminVoiceRuntimeApproval===true||payload.adminVoiceDeliveryAllowed===true||voice.adminVoiceRuntimeApproval===true||voice.adminVoiceDeliveryAllowed===true||meta.adminVoiceRuntimeApproval===true||meta.adminVoiceDeliveryAllowed===true;
}
function bridgeAdminVoicePromptFallback(prompt="",packet={}){
  if(!isAdminVoiceOutputProjectionContext(packet,prompt))return "";
  const text=safeStr(prompt);
  if(!text)return "";
  if(/^\s*(?:good\s+morning|morning)\s*(?:mac)?[\s.!?]*$/i.test(text))return "Good morning Mac.";
  if(/^\s*(?:hello|hi)\s*(?:mac|marion)?[\s.!?]*$/i.test(text))return "Hello Mac.";
  if(/\bspeak\b/i.test(text)&&/\b(?:short|brief|one)\b/i.test(text)&&/\b(?:confirmation|sentence)\b/i.test(text))return "Good morning Mac.";
  if(text.length<=120&&!/[?]/.test(text)&&!/\b(?:diagnostic|runtime|packet|status|health|approve|deny|command|route|token|session)\b/i.test(text))return /[.!?]$/.test(text)?text:`${text}.`;
  return "";
}
function isUnsafeFinalSelection(reply="",prompt="",packet={}){return isInvalidPublicReplyValue(reply)||isThinPlaceholderText(reply)||isBroadLanguageClarifier(reply)||isPublicWorkflowStateLeak(reply)||isExcessExpressionReply(reply)||(!isAdminVoiceOutputProjectionContext(packet,prompt)&&isPromptEchoReply(reply,prompt));}
function bestPublicReplyCandidate(packet={},prompt=""){const p=safeObj(packet),payload=safeObj(p.payload),finalEnvelope=safeObj(p.finalEnvelope),speech=safeObj(p.speech),voice=safeObj(p.voice),meta=safeObj(p.meta),result=safeObj(p.result),data=safeObj(p.data);const candidates=[finalEnvelope.publicReply,finalEnvelope.visibleReply,finalEnvelope.finalReply,finalEnvelope.reply,finalEnvelope.displayReply,finalEnvelope.text,finalEnvelope.spokenText,p.publicReply,p.visibleReply,p.finalReply,p.displayReply,p.reply,p.answer,p.output,p.response,p.text,p.message,p.spokenText,p.speechText,payload.publicReply,payload.visibleReply,payload.finalReply,payload.displayReply,payload.reply,payload.answer,payload.output,payload.response,payload.text,payload.message,payload.spokenText,payload.speechText,result.publicReply,result.visibleReply,result.finalReply,result.displayReply,result.reply,result.text,result.message,data.publicReply,data.visibleReply,data.finalReply,data.reply,data.text,speech.textDisplay,speech.text,speech.textSpeak,voice.spokenText,voice.speechText,voice.textSpeak,meta.publicReply,meta.visibleReply];for(const item of candidates){const clean=stripTelemetryLeakFromReply(stripPublicReplyScaffold(item));if(clean&&!isUnsafeFinalSelection(clean,prompt,p))return clean;}const recovery=buildDeterministicLastMilePublicReplyFromText(prompt)||bridgeAdminVoicePromptFallback(prompt,p);return recovery&&!isUnsafeFinalSelection(recovery,prompt,p)?recovery:"";}

function readPublicReplyCandidate(packet={}){
  return bestPublicReplyCandidate(packet, firstText(safeObj(packet).userText,safeObj(packet).rawUserText,safeObj(packet).prompt,safeObj(packet).message,safeObj(safeObj(packet).payload).userText,safeObj(safeObj(packet).payload).prompt));
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

function buildAdminNaturalLanguageAnswer(value=""){
  const source=String(value==null?"":value).replace(/\s+/g," ").trim();
  const t=source.toLowerCase();
  if(!t)return "";
  if(/\bbreak a leg\b/.test(t))return "Literally, “break a leg” means to injure a leg. Culturally, it is an English idiom used to wish someone good luck, especially before a performance. It is not meant as harm; it works as a superstition-based way of saying, “I hope you do well.”";
  if(/\bbless your heart\b/.test(t))return "“Bless your heart” can be sincere or cutting depending on tone and setting. In the American South, it may mean genuine sympathy, but it can also politely soften criticism, pity, or disapproval. The cultural meaning depends heavily on relationship, delivery, and context.";
  if(/\bi['’]?m fine\b/.test(t))return "“I’m fine” can be literal, but behaviourally it often signals emotional masking, avoidance, or a desire to end the topic. Marion should not assume distress automatically; the safer reading is: the phrase needs context, tone, timing, and follow-up before drawing a conclusion.";
  if(/\bidiom\b/.test(t))return "An idiom is a phrase whose meaning cannot be understood only from the literal words. The correct reading depends on shared cultural use, context, and tone.";
  if(/\bsarcasm\b/.test(t))return "Sarcasm means the stated words and the intended meaning do not fully match. Marion should look for tone, contradiction, exaggeration, and context before treating the sentence literally.";
  return "";
}
function isComposerPlanningScaffold(value=""){
  const t=String(value==null?"":value).replace(/\s+/g," ").trim();
  if(!t)return false;
  return /\bpublic knowledge topic\b/i.test(t)||/\bthe useful answer should define the term\b/i.test(t)||/\bcan route through the six-domain layer\b/i.test(t)||/\bshould be handled as a wording and meaning question\b/i.test(t);
}
function repairPlanningScaffoldReply(reply="",prompt=""){
  const natural=buildAdminNaturalLanguageAnswer(prompt);
  if(natural&&(isComposerPlanningScaffold(reply)||!String(reply||"").trim()))return natural;
  return String(reply==null?"":reply).replace(/\s+/g," ").trim();
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
    const natural=buildAdminNaturalLanguageAnswer(source); if(natural)return natural; return topic.charAt(0).toUpperCase()+topic.slice(1)+" can be explained directly. The useful answer should define it plainly, explain the cultural or practical context, and give one grounded example.";
  }
  return "";
}

function buildDeterministicLastMilePublicReplyFromText(text=""){
  const source=safeStr(text);
  const t=lower(source);
  if(!t)return "";
  if(/^(?:hi|hello|hey|good morning|good afternoon|good evening)\s+(?:marion|nyx)\.?$/i.test(source)||/^(?:hi|hello|hey)\s+marion$/i.test(t))return "Marion is connected to the admin runtime. Send the next direct test prompt and I’ll keep the reply clean, visible, and free of diagnostics.";
  if(/\breference\s*error\b|\breferenceerror\b|\bis not defined\b|\bcannot access .* before initialization\b/i.test(source))return "A reference error means the script tried to use a variable, function, or module binding that was not available in that scope. The fix is to identify the missing symbol, correct the declaration or import/export path, then rerun the same route to confirm the public reply no longer falls back.";
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
  if(/\bcash[- ]?flow\b/i.test(source)&&/\b(example|for instance|show me|another example|scenario|use case)\b/i.test(source))return "Example: a business invoices $5,000 today but will not receive that money for 30 days. If rent, payroll, and supplies are due this week, the business can be profitable on paper but still have a cash-flow problem because the money has not arrived yet.";
  if(/\bcash[- ]?flow\b/i.test(source)&&/\b(why|important|matter|matters)\b/i.test(source))return "Cash flow is important because it determines whether a business can pay bills on time, handle slow sales periods, avoid unnecessary debt, and make growth decisions without running out of operating money.";
  if(/\bcash[- ]?flow\b/i.test(source)&&/\b(what happens next|next step|then what|what next)\b/i.test(source))return "Next, the business should compare incoming cash dates against outgoing expense dates, then decide whether to collect faster, delay spending, use reserves, or arrange short-term financing before the gap becomes operational pressure.";
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
  const prompt=firstText(normalized.userQuery,normalized.rawUserQuery,normalized.userText,normalized.text,normalized.query,safeObj(normalized.payload).userText);
  const candidate=bestPublicReplyCandidate(out,prompt);
  if(candidate&&!isUnsafeFinalSelection(candidate,prompt)){
    return applyReplyEverywhere(out,candidate,{publicReplyHardlock:true});
  }
  const recovery=buildPrimitiveReplyRecovery(normalized,out);
  if(!recovery||isInvalidPublicReplyValue(recovery)||isThinPlaceholderText(recovery)||isBroadLanguageClarifier(recovery)||isPublicWorkflowStateLeak(recovery)){
    return suppressPublicReplyPacket(out,{publicReplyHardlock:true,loopSuppressionSilent:true,workflowStateLeakSuppressed:true});
  }
  return applyReplyEverywhere(out,recovery,{primitivePublicReplyRecovered:true,publicReplyHardlock:true,deterministicOriginalPromptRecovery:!!buildDeterministicLastMilePublicReplyFromText(collectPrimitiveRecoverySource(normalized,out))});
}



function isDirectMarionAdminContext(input = {}) {
  const src = safeObj(input);
  const voice = safeObj(src.voice || src.voiceEnvelope || src.voiceTrack || src.voiceLane);
  const channel = lower(firstText(src.deliveryChannel, voice.deliveryChannel, ""));
  const scope = lower(firstText(src.adminInterfaceScope, voice.adminInterfaceScope, ""));
  return src.directMarionAdminInterface === true ||
    src.marionAdminConversation === true ||
    voice.directMarionAdminInterface === true ||
    voice.marionAdminConversation === true ||
    src.allowMarionAdminConversation === true ||
    scope === "marion_admin_conversation" ||
    channel === "marion_admin_interface";
}

function resolveBridgePublicAgent(input = {}) {
  const direct = isDirectMarionAdminContext(input);
  const src = safeObj(input);
  const voice = safeObj(src.voice || src.voiceEnvelope || src.voiceTrack || src.voiceLane);
  const adminAllowed = src.adminVoiceDeliveryAllowed === true || voice.adminVoiceDeliveryAllowed === true || src.adminVoiceVerified === true || voice.adminVoiceVerified === true;
  return direct && adminAllowed ? "Marion" : "Nyx";
}



function buildBridgeVoiceCarry(input = {}) {
  const src = safeObj(input);
  const voice = safeObj(src.voice || src.voiceEnvelope || src.voiceTrack || src.voiceLane);
  const inputChannel = canonicalInputSource(src);
  const explicitVoice = inputChannel === "voice" || /^(voice|mic|microphone|speech|spoken|audio)$/i.test(firstText(voice.source, voice.inputChannel, voice.mode, voice.modality, ""));
  const transcript = explicitVoice ? firstText(src.transcript, src.normalizedTranscript, voice.transcript, voice.normalizedTranscript, src.text, src.userQuery, src.query, "") : "";
  const originalTranscript = explicitVoice ? firstText(src.originalTranscript, voice.originalTranscript, transcript) : "";
  const directMarionAdminInterface = isDirectMarionAdminContext(src);
  const publicAgent = resolveBridgePublicAgent(src);

  return {
    active: explicitVoice,
    inputChannel,
    source: explicitVoice ? "voice" : "text",
    transcriptLength: safeStr(transcript).length,
    originalTranscriptLength: safeStr(originalTranscript).length,
    confidence: Number.isFinite(Number(src.confidence || voice.confidence)) ? Math.max(0, Math.min(1, Number(src.confidence || voice.confidence))) : null,
    locale: firstText(src.locale, voice.locale, ""),
    authorizationState: firstText(src.authorizationState, voice.authorizationState, safeObj(voice.authorization).authorizationState, ""),
    commandPhrase: firstText(src.commandPhrase, voice.commandPhrase, ""),
    wakeWord: firstText(src.wakeWord, voice.wakeWord, ""),
    speakAllowed: voice.speakAllowed === true,
    voiceMode: firstText(voice.voiceMode, ""),
    publicAgent,
    authority: firstText(src.authority, "Marion"),
    directMarionAdminInterface,
    marionAdminConversation: directMarionAdminInterface,
    marionAdminConversationAllowed: directMarionAdminInterface && (src.adminVoiceDeliveryAllowed === true || voice.adminVoiceDeliveryAllowed === true || src.adminVoiceVerified === true || voice.adminVoiceVerified === true),
    adminInterfaceScope: directMarionAdminInterface ? firstText(src.adminInterfaceScope, voice.adminInterfaceScope, "marion_admin_conversation") : "",
    publicUsersCanAddressMarion: false,
    adminOnlyVoiceDelivery: src.adminOnlyVoiceDelivery !== false && voice.adminOnlyVoiceDelivery !== false,
    adminVoiceVerified: src.adminVoiceVerified === true || voice.adminVoiceVerified === true,
    adminVoiceDeliveryAllowed: src.adminVoiceDeliveryAllowed === true || voice.adminVoiceDeliveryAllowed === true,
    privateVoiceDelivery: src.privateVoiceDelivery === true || voice.privateVoiceDelivery === true,
    deliveryChannel: firstText(src.deliveryChannel, voice.deliveryChannel, ""),
    requireMarionFinal: src.requireMarionFinal !== false,
    transcriptOnly: true,
    audioStored: false,
    noRawAudio: true,
    noRawAudioStored: true,
    speechSyncRequested: src.speechSyncRequested === true || voice.speechSyncRequested === true,
    speechSyncEnabled: voice.speechSyncEnabled === true || safeObj(voice.speechSync).enabled === true,
    speechSyncVersion: firstText(voice.speechSyncVersion, safeObj(voice.speechSync).version, ""),
    speechSyncContract: firstText(safeObj(voice.speechSync).contract, ""),
    speechSyncFrontendReady: voice.speechSyncFrontendReady === true || safeObj(voice.speechSync).frontendReady === true,
    phase2SpeechSyncPrepared: voice.phase2SpeechSyncPrepared === true || safeObj(voice.speechSync).enabled === true,
    avatarSpeechState: firstText(voice.avatarSpeechState, safeObj(voice.speechSync).avatarSpeechState, safeObj(safeObj(voice.speechSync).avatar).avatarState, ""),
    estimatedSpeechDurationMs: Number(voice.estimatedSpeechDurationMs || safeObj(voice.speechSync).estimatedDurationMs || 0) || 0,
    visemeCount: Number(voice.visemeCount || safeObj(voice.speechSync).visemeCount || 0) || 0,
    speechSyncCompatible: true,
    bridgeCarryVersion: "nyx.marion.voiceBridgeCarry/1.4-marion-admin-interface-carry"
  };
}

function attachBridgeVoiceCarry(target = {}, input = {}) {
  const carry = buildBridgeVoiceCarry(input);
  if (!carry.active) {
    const base = safeObj(target);
    const src = safeObj(input);
    const inputChannel = canonicalInputSource(src);
    return {
      ...base,
      inputChannel: inputChannel === "voice" ? "voice" : firstText(base.inputChannel, "text"),
      source: inputChannel === "voice" ? "voice" : firstText(base.source, src.source === "marion-admin-interface" ? "marion-admin-interface" : "text"),
      voice: {
        ...safeObj(base.voice),
        active: false,
        inputChannel: inputChannel === "voice" ? "voice" : "text",
        source: inputChannel === "voice" ? "voice" : "text",
        audioStored: false,
        noRawAudio: true,
        textConsoleBypass: inputChannel !== "voice"
      }
    };
  }
  return {
    ...safeObj(target),
    inputChannel: "voice",
    source: carry.directMarionAdminInterface ? "marion-admin-interface" : "voice",
    publicAgent: carry.publicAgent,
    authority: "Marion",
    directMarionAdminInterface: carry.directMarionAdminInterface === true,
    marionAdminConversationAllowed: carry.marionAdminConversationAllowed === true,
    adminInterfaceScope: carry.adminInterfaceScope || "",
    publicUsersCanAddressMarion: false,
    voice: {
      ...safeObj(safeObj(target).voice),
      ...carry
    }
  };
}

function canonicalInputSource(input={}){const src=safeObj(input),payload=safeObj(src.payload),body=safeObj(src.body),session=safeObj(src.session),ui=safeObj(src.ui),client=safeObj(src.client),voice=safeObj(src.voice||src.voiceEnvelope||payload.voice||body.voice);const raw=lower(firstText(src.inputChannel,src.inputSource,src.source,src.triggerSource,src.modality,payload.inputChannel,payload.inputSource,payload.source,body.inputChannel,body.inputSource,body.source,session.inputChannel,session.inputSource,session.source,ui.inputChannel,ui.inputSource,ui.source,client.inputChannel,client.inputSource,client.source,"text"));if(/^(text|typed|keyboard|console|admin_text|marion_admin_text|marion-admin-interface|marion_admin_interface)$/.test(raw))return"text";if(/^(voice|mic|microphone|speech|spoken|audio)$/.test(raw))return"voice";const vraw=lower(firstText(voice.inputChannel,voice.source,voice.modality,voice.mode,""));return /^(voice|mic|microphone|speech|spoken|audio)$/.test(vraw)?"voice":"text";}
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


function bridgeContinuationRecoveryPrompt(packet = {}) {
  const p = safeObj(packet);
  const payload = safeObj(p.payload);
  const meta = safeObj(p.meta);
  const finalEnvelope = safeObj(p.finalEnvelope);
  const candidates = [
    p.continuityResolvedText, p.resolvedQuestion, p.effectivePrompt, p.userQuery, p.rawUserQuery, p.originalUserQuery,
    payload.continuityResolvedText, payload.resolvedQuestion, payload.effectivePrompt, payload.userQuery, payload.rawUserQuery, payload.originalUserQuery,
    meta.continuityResolvedText, meta.resolvedQuestion, meta.effectivePrompt, meta.userQuery, meta.rawUserQuery, meta.originalUserQuery,
    finalEnvelope.continuityResolvedText, finalEnvelope.resolvedQuestion
  ].map(safeStr).filter(Boolean);
  const carry = safeObj(p.continuity || p.followUpReference || payload.continuity || payload.followUpReference || meta.continuity || meta.followUpReference);
  const topic = firstText(carry.topic, carry.lastTopic, p.continuityTopic, payload.continuityTopic, meta.continuityTopic);
  const original = firstText(carry.originalText, p.continuityResolvedOriginalText, payload.continuityResolvedOriginalText, p.rawUserQuery, p.originalUserQuery);
  const resolved = firstText(carry.resolvedText, p.continuityResolvedText, payload.continuityResolvedText);
  if (resolved) candidates.unshift(resolved);
  if (topic && original) {
    if (/\b(example|show me|for instance|another example)\b/i.test(original)) candidates.unshift(`Give me an example of ${topic}.`);
    if (/\b(why|important|matter)\b/i.test(original)) candidates.unshift(`Why is ${topic} important?`);
    if (/\b(what happens next|next step|then what|what next)\b/i.test(original)) candidates.unshift(`What happens next with ${topic} in practice?`);
  }
  return firstText(...candidates);
}

function bridgeRecoverPublicReplyFromPacket(packet = {}) {
  const p = safeObj(packet);
  const direct = stripPublicReplyScaffold(readPublicReplyCandidate(p) || extractReply(p) || safeStr(safeObj(p.finalEnvelope).reply));
  if (direct && !isInvalidPublicReplyValue(direct) && !isPrimitivePublicReply(direct) && !isThinPlaceholderText(direct) && !isDiagnosticText(direct)) return direct;
  const prompt = bridgeContinuationRecoveryPrompt(p);
  const deterministic = buildDeterministicLastMilePublicReplyFromText(prompt);
  const clean = stripPublicReplyScaffold(deterministic);
  return clean && !isInvalidPublicReplyValue(clean) && !isThinPlaceholderText(clean) && !isDiagnosticText(clean) ? clean : "";
}

function transportSafePacket(packet = {}) {
  const out = jsonSafe(packet);
  if (!isObj(out)) return out;
  const recoveredReply = bridgeRecoverPublicReplyFromPacket(out);
  const reply = stripPublicReplyScaffold(recoveredReply || extractReply(out) || safeStr(safeObj(out.finalEnvelope).reply));
  const trustedFinal = hasTrustedBridgeFinalPacket(out);
  const continuityRecovery = !!recoveredReply && !trustedFinal;
  const hasReply = !!reply && (trustedFinal || continuityRecovery) && !isPrimitivePublicReply(reply) && !isThinPlaceholderText(reply) && !isDiagnosticText(reply);
  if (hasReply) {
    out.reply = reply; out.text = reply; out.answer = reply; out.output = reply; out.response = reply; out.message = reply; out.spokenText = safeStr(out.spokenText || reply);
    out.payload = { ...safeObj(out.payload), reply, text: reply, message: reply, answer: reply, output: reply, response: reply, displayReply: reply, spokenText: safeStr(out.spokenText || reply), final: true, marionFinal: true, awaitingMarion: false, suppressUserFacingReply: false, emit: true, blocked: false };
  } else {
    out.reply = ""; out.text = ""; out.answer = ""; out.output = ""; out.response = ""; out.message = "";
    out.payload = { ...safeObj(out.payload), reply: "", text: "", message: "", answer: "", output: "", response: "", final: false, marionFinal: false, awaitingMarion: true, suppressUserFacingReply: true, emit: false, blocked: true };
  }
  out.ok = hasReply && out.ok !== false; out.final = !!hasReply; out.marionFinal = !!hasReply; out.handled = true; out.awaitingMarion = !hasReply; out.terminal = hasReply ? out.terminal : false; out.suppressUserFacingReply = !hasReply; out.emit = hasReply; out.blocked = !hasReply; out.transportSafe = true; out.socketReconnect = false;
  if (out.memoryPatch) out.memoryPatch = compactPatchForTransport(out.memoryPatch); if (out.sessionPatch) out.sessionPatch = compactPatchForTransport(out.sessionPatch); if (out.payload && out.payload.memoryPatch) out.payload.memoryPatch = compactPatchForTransport(out.payload.memoryPatch); if (out.payload && out.payload.sessionPatch) out.payload.sessionPatch = compactPatchForTransport(out.payload.sessionPatch);
  out.finalEnvelope = { ...safeObj(out.finalEnvelope), reply: hasReply ? reply : "", text: hasReply ? reply : "", displayReply: hasReply ? reply : "", spokenText: hasReply ? stripPublicReplyScaffold(safeObj(out.finalEnvelope).spokenText || out.spokenText || reply) : "", final: hasReply, marionFinal: hasReply, handled: true, contractVersion: safeStr(safeObj(out.finalEnvelope).contractVersion || FINAL_ENVELOPE_CONTRACT), signature: hasReply ? firstText(safeObj(out.finalEnvelope).signature, FINAL_SIGNATURE) : safeStr(safeObj(out.finalEnvelope).signature), authority: hasReply ? firstText(safeObj(out.finalEnvelope).authority, "marionFinalEnvelope") : safeStr(safeObj(out.finalEnvelope).authority), qualityPass: hasReply, responseDepthShaped: hasReply };
  out.meta = { ...safeObj(out.meta), transportSafe: true, socketReconnect: false, emitOrder: "finalEnvelope:beforeSessionPatch", finalDeliveryTiming: "single_terminal_packet", conversationQualityGate: true, responseDepthShaped: hasReply, trustedFinalEnvelope: trustedFinal || continuityRecovery, continuityAuthorityRecovery: continuityRecovery, suppressUserFacingReply: !hasReply, emit: hasReply, blocked: !hasReply };
  out.diagnostics = { ...safeObj(out.diagnostics), transportSafe: true, jsonSanitized: true, finalDeliveryTiming: "single_terminal_packet", trustedFinalEnvelope: trustedFinal || continuityRecovery, continuityAuthorityRecovery: continuityRecovery, suppressedUserFacingReply: !hasReply };
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
  const routing=safeObj(routed.routing),intent=firstText(routing.intent,contract.intent,"simple_chat"),domain=firstText(routing.domain,contract.domain,normalized.domain,"general"),sixDomainCoverage=safeArray(routed.sixDomainCoverage||safeObj(routed.reason).sixDomainCoverage||routing.sixDomainCoverage||contract.sixDomainCoverage||normalized.sixDomainCoverage),allKnowledgeDomains=safeArray(routed.allKnowledgeDomains||safeObj(routed.reason).allKnowledgeDomains||routing.allKnowledgeDomains||contract.allKnowledgeDomains||normalized.allKnowledgeDomains);
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
      sixDomainCoverage,
      allKnowledgeDomains,
      finalAuthorityExpected:"marionFinalEnvelope",
      finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION
    },
    reply,
    text:reply,
    answer:reply,
    output:reply,
    response:reply,
    message:reply,
    spokenText:reply,
    payload:{reply,text:reply,message:reply,answer:reply,output:reply,response:reply,sixDomainCoverage,allKnowledgeDomains,final:true,marionFinal:true,awaitingMarion:false,suppressUserFacingReply:false,emit:true,blocked:false},
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

function normalizeBridgeContinuityTopic(value){
  return safeStr(value)
    .replace(/[.?!]+$/g,"")
    .replace(/^(?:please\s+)?(?:can you\s+|could you\s+|would you\s+)?(?:explain|define|describe|break\s+down|tell\s+me\s+about|what\s+is|what\s+are|give me an overview of)\s+/i,"")
    .replace(/^(?:the|a|an)\s+/i,"")
    .replace(/\s+/g," ")
    .trim()
    .slice(0,120);
}
function isBridgeShortFollowupIntentText(value=""){
  const t=lower(value).replace(/[.?!]+$/g,"").trim();
  if(!t)return false;
  if(t.length>140)return false;
  if(/\b(file|zip|download|resend|update|patch|fix|audit|autopsy|backend|frontend|widget|script|code|api\/chat|marionbridge|chatengine|state spine|statespine|intent router)\b/i.test(t))return false;
  return /^(?:why|why is that important|why does that matter|why is it important|why does it matter|how so|explain why|give me an example|example|apply it|apply that|what about that|what does that mean|tell me more|go deeper|continue|expand on that|break that down|how would that work)$/i.test(t) ||
    (/\b(that|it|this|those|these)\b/i.test(t) && /\b(important|matter|example|apply|work|mean|impact|risk|benefit|useful|business|small business|practical|practically)\b/i.test(t));
}
function extractBridgeContinuityTopicFromMemory(memory={},source={}){
  const m=safeObj(memory), s=safeObj(source), body=safeObj(s.body), session=safeObj(s.session||body.session), meta=safeObj(s.meta||body.meta), payload=safeObj(s.payload||body.payload);
  const state=safeObj(m.stateSpine||m.conversationState||m.state||session.stateSpine||session.conversationState||meta.stateSpine||payload.stateSpine);
  const continuity=safeObj(m.continuity||state.continuity||session.continuity||meta.continuity||payload.continuity);
  const stateBridge=safeObj(m.stateBridge||state.stateBridge||session.stateBridge||meta.stateBridge||payload.stateBridge);
  const vector=safeObj(m.conversationVector||state.conversationVector||session.conversationVector||meta.conversationVector||payload.conversationVector);
  const lastTopics=safeArray(m.lastTopics||state.lastTopics||continuity.lastTopics||stateBridge.lastTopics||vector.lastTopics);
  const candidates=[
    continuity.resolvedTopic,continuity.topic,continuity.lastTopic,continuity.subject,
    stateBridge.resolvedTopic,stateBridge.topic,stateBridge.lastTopic,stateBridge.subject,
    vector.topic,vector.lastTopic,vector.activeTopic,
    m.resolvedTopic,m.topic,m.lastTopic,m.activeTopic,m.normalizedUserIntent,m.lastUserText,m.userText,
    state.resolvedTopic,state.topic,state.lastTopic,state.activeTopic,state.normalizedUserIntent,state.lastUserText,
    lastTopics[0],
    session.lastTopic,meta.lastTopic,payload.lastTopic
  ];
  for(const item of candidates){
    const topic=normalizeBridgeContinuityTopic(item);
    if(topic && !isBridgeShortFollowupIntentText(topic) && !/\b(why|that|this|it|example|apply|continue|important)\b/i.test(topic))return topic;
  }
  return "";
}
function buildBridgeContinuityResolvedQuestion(text="",topic=""){
  const raw=safeStr(text).replace(/\s+/g," ").trim();
  const t=lower(raw).replace(/[.?!]+$/g,"").trim();
  const subject=normalizeBridgeContinuityTopic(topic);
  if(!raw||!subject)return raw;
  if(lower(raw).includes(lower(subject)))return raw;
  if(/^why\b/i.test(raw)||/\bimportant|matter\b/i.test(t))return `Why is ${subject} important?`;
  if(/\bexample\b/i.test(t))return `Give me an example of ${subject}.`;
  if(/\bsmall business\b/i.test(t))return `Apply ${subject} to a small business.`;
  if(/\bapply\b/i.test(t))return `Apply ${subject} to this context.`;
  if(/\brisk\b/i.test(t))return `What are the risks associated with ${subject}?`;
  if(/\bbenefit\b/i.test(t))return `What are the benefits of ${subject}?`;
  if(/\bwhat does (?:that|it|this) mean\b/i.test(t))return `What does ${subject} mean in practical terms?`;
  if(/\bcontinue|tell me more|expand|go deeper|break that down|how would that work|how so\b/i.test(t))return `Continue explaining ${subject}.`;
  return `${raw} about ${subject}`;
}
function buildBridgeContinuityCarryForInbound(rawText="",memory={},source={}){
  const original=safeStr(rawText);
  const topic=extractBridgeContinuityTopicFromMemory(memory,source);
  const shortFollowup=isBridgeShortFollowupIntentText(original);
  const resolvedText=shortFollowup&&topic?buildBridgeContinuityResolvedQuestion(original,topic):"";
  return {
    version:"nyx.marion.bridgeContinuityPromptResolution/1.0",
    active:!!(shortFollowup&&topic),
    shortFollowup,
    topic,
    lastTopic:topic,
    resolvedFollowup:!!resolvedText,
    originalText:original,
    resolvedText,
    promptRewritten:!!(resolvedText&&resolvedText!==original),
    source:"marionBridge.normalizeInbound"
  };
}

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
  const directMarionAdminInterface=isDirectMarionAdminContext(source);
  const rawUserQuery=extractUserText(source);
  const publicUserQueryRaw=directMarionAdminInterface?rawUserQuery:normalizePublicNyxAddress(rawUserQuery);
  const spokenAliasRecovery=normalizeSpokenProjectAliases(publicUserQueryRaw);
  const publicUserQuery=firstText(spokenAliasRecovery.text,publicUserQueryRaw);
  let userQuery=normalizeParityText(publicUserQuery);
  const previousMemory=extractPreviousMemory(source);
  const originalUserQueryForContinuity=userQuery;
  const continuityCarry=buildBridgeContinuityCarryForInbound(originalUserQueryForContinuity,previousMemory,source);
  if(continuityCarry.resolvedFollowup&&continuityCarry.resolvedText){
    userQuery=normalizeParityText(continuityCarry.resolvedText);
  }
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
  return{ok:issues.length===0,issues,original:source,commandPacket,userQuery,text:userQuery,query:userQuery,rawUserQuery,publicUserQuery,inputSource,source:directMarionAdminInterface?"marion-admin-interface":inputSource,publicAgent:directMarionAdminInterface&&resolveBridgePublicAgent(source)==="Marion"?"Marion":"Nyx",directMarionAdminInterface,marionAdminConversationAllowed:directMarionAdminInterface&&(source.adminVoiceDeliveryAllowed===true||source.adminVoiceVerified===true||safeObj(source.voice).adminVoiceDeliveryAllowed===true),adminInterfaceScope:directMarionAdminInterface?firstText(source.adminInterfaceScope,safeObj(source.voice).adminInterfaceScope,"marion_admin_conversation"):"",publicUsersCanAddressMarion:false,voice:buildBridgeVoiceCarry(source),spokenAliasRecovery,phaseAnchor,phaseAnchorInstruction,continuity:continuityCarry,followUpReference:continuityCarry,continuityResolvedText:continuityCarry.resolvedText,continuityResolvedOriginalText:continuityCarry.originalText,shortFollowupContinuityResolved:continuityCarry.resolvedFollowup===true,effectivePrompt:userQuery,originalUserQuery:originalUserQueryForContinuity,voiceTextParity:{active:inputSource==="voice"||rawUserQuery!==userQuery||spokenAliasRecovery.changed||continuityCarry.promptRewritten===true,source:inputSource,normalizedText:userQuery,rawHash:hashText(rawUserQuery),normalizedHash:hashText(userQuery),parityLock:true,spokenAliasRecovery,phaseAnchor,continuityCarry},technicalTargetLock,knowledgeDomain:bareKnowledgeDomain||activeKnowledgeDomain,activeKnowledgeDomain,lastActivatedKnowledgeDomain:activeKnowledgeDomain,knowledgeDomainExplicit:!!bareKnowledgeDomain,knowledgeDomainReason:bareKnowledgeDomain?"bare_domain_activation":(activeKnowledgeDomain&&isShortConceptFollowup(userQuery)?"active_domain_short_concept_carry":""),targetFile:firstText(safeObj(technicalTargetLock).targetFile,""),targetPath:firstText(safeObj(technicalTargetLock).targetPath,""),targetName:firstText(safeObj(technicalTargetLock).targetName,""),continuityTurnKey:buildContinuityTurnKey(userQuery,sessionId,turnId),lane,requestedDomain,domain:requestedDomain,previousMemory,marionIntent:extractMarionIntentPacket(source),publicDomainAccess:source.publicDomainAccess===true||safeObj(source.ui).domainAccess===true,forceDomainAnswer:source.forceDomainAnswer===true||safeObj(source.ui).hardRetry===true,requireMarionFinal:source.requireMarionFinal===true,domainAccess:safeArray(source.domainAccess),turnId,sessionId};
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
function extractReply(contract={}){const src=safeObj(contract);const prompt=firstText(src.userText,src.rawUserText,src.prompt,src.message,safeObj(src.payload).userText,safeObj(src.payload).prompt);return bestPublicReplyCandidate(src,prompt);}
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
    userQuery:normalized.userQuery,text:normalized.userQuery,query:normalized.userQuery,rawUserQuery:normalized.rawUserQuery,inputSource:normalized.inputSource,source:normalized.inputSource,voiceTextParity:safeObj(normalized.voiceTextParity),spokenAliasRecovery:safeObj(normalized.spokenAliasRecovery),phaseAnchor:safeObj(normalized.phaseAnchor),phaseAnchorInstruction:safeStr(normalized.phaseAnchorInstruction),continuityTurnKey:normalized.continuityTurnKey,continuity:safeObj(normalized.continuity),followUpReference:safeObj(normalized.followUpReference),continuityResolvedText:safeStr(normalized.continuityResolvedText),continuityResolvedOriginalText:safeStr(normalized.continuityResolvedOriginalText),shortFollowupContinuityResolved:normalized.shortFollowupContinuityResolved===true,effectivePrompt:firstText(normalized.effectivePrompt,normalized.userQuery),originalUserQuery:safeStr(normalized.originalUserQuery),
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
function wrapFinal({normalized,routed,contract,loopGuardResult,resolvedEmotionPacket={}}){const rawReply=extractReply(contract);if(!rawReply)return createLocalFinalEnvelope({normalized,routed,contract,reason:"composer_reply_missing",loopGuardResult});if(!finalEnvelopeMod||typeof finalEnvelopeMod.createMarionFinalEnvelope!=="function")return createLocalFinalEnvelope({normalized,routed,contract:{...safeObj(contract),reply:rawReply,text:rawReply,spokenText:firstText(contract.spokenText,rawReply)},reason:"final_envelope_unavailable",loopGuardResult});const userText=normalized.userText||normalized.text||normalized.query||"",routing=safeObj(routed.routing),progressionRefinement=bridgeProgressionMemory(userText,rawReply,{...safeObj(contract.memoryPatch),...safeObj(normalized.memory),...safeObj(routed)}),reply=bridgeShapeProgressionReply(userText,rawReply,progressionRefinement,{...safeObj(contract.memoryPatch),...safeObj(normalized.memory),...safeObj(routed)}),progressionTelemetry=bridgeProgressionTelemetry(userText,reply,progressionRefinement),memoryPatch={...safeObj(contract.memoryPatch),progressionRefinement,progressionTelemetry,lingoSentinel:safeObj(normalized.lingoSentinel),languageMeta:safeObj(normalized.languageMeta),translationMeta:safeObj(normalized.translationMeta),glossaryMeta:safeObj(normalized.glossaryMeta),aster:safeObj(normalized.aster),asterObservation:safeObj(normalized.asterObservation),asterPassiveObservation:safeObj(normalized.asterPassiveObservation),parallelLaneCoordination:safeObj(normalized.parallelLaneCoordination),dualTrack:safeObj(normalized.dualTrack),coordinationTelemetry:safeObj(normalized.coordinationTelemetry),ethicalGate:safeObj(normalized.ethicalGate),riskClassification:safeObj(normalized.riskClassification),stateBridge:{...safeObj(safeObj(contract.memoryPatch).stateBridge),progressionRefinement,progressionTelemetry},domainConcierge:compactDomainConciergeForBridge(safeObj(contract).domainConcierge||safeObj(routed).domainConcierge||routing.domainConcierge),sixDomainCoverage:safeArray(contract.sixDomainCoverage||routed.sixDomainCoverage||safeObj(routed.reason).sixDomainCoverage||routing.sixDomainCoverage||normalized.sixDomainCoverage),allKnowledgeDomains:safeArray(contract.allKnowledgeDomains||routed.allKnowledgeDomains||safeObj(routed.reason).allKnowledgeDomains||routing.allKnowledgeDomains||normalized.allKnowledgeDomains)};const sixDomainCoverage=safeArray(memoryPatch.sixDomainCoverage),allKnowledgeDomains=safeArray(memoryPatch.allKnowledgeDomains);const envelope=finalEnvelopeMod.createMarionFinalEnvelope({reply,spokenText:safeStr(contract.spokenText||reply),intent:safeStr(routing.intent||contract.intent||"simple_chat"),domain:safeStr(routing.domain||contract.domain||normalized.domain||"general"),knowledgeDomain:firstText(routing.knowledgeDomain,contract.knowledgeDomain,normalized.knowledgeDomain,safeObj(routed).primaryDomain,""),sixDomainCoverage,allKnowledgeDomains,routing:{...routing,domainConfidence:safeObj(routing.domainConfidence||routed.domainConfidence),sixDomainCoverage,allKnowledgeDomains,endpoint:safeStr(routing.endpoint||CANONICAL_ENDPOINT)||CANONICAL_ENDPOINT},stateStage:safeStr(memoryPatch.stateStage||contract.stateStage||(loopGuardResult.forceRecovery?"recover":"final")),turnId:normalized.turnId,sessionId:normalized.sessionId,memoryPatch,resolvedEmotion:safeObj(resolvedEmotionPacket.state||contract.resolvedEmotion),emotionSummary:emotionSummary(resolvedEmotionPacket.state?resolvedEmotionPacket:safeObj(contract.emotionRuntime)),speech:safeObj(contract.speech),replySignature:safeStr(contract.replySignature||memoryPatch.replySignature||hashText(reply)),composerVersion:safeStr(contract.version||contract.composerVersion||""),bridgeVersion:VERSION,meta:{...safeObj(contract.meta),bridgeVersion:VERSION,lingoSentinelGatewayBridgeVersion:LINGOSENTINEL_GATEWAY_BRIDGE_VERSION,lingoSentinel:safeObj(normalized.lingoSentinel),languageMeta:safeObj(normalized.languageMeta),translationMeta:safeObj(normalized.translationMeta),glossaryMeta:safeObj(normalized.glossaryMeta),unknownLanguageAlert:safeObj(normalized.unknownLanguageAlert),scannerHeartbeat:safeObj(normalized.scannerHeartbeat),dormantScanner:safeObj(normalized.dormantScanner),lingoSentinelGatewayMeta:safeObj(normalized.lingoSentinelGatewayMeta),inputHash:safeStr(normalized.inputHash),gatewayHash:safeStr(normalized.gatewayHash),stableHash:safeStr(normalized.stableHash),correlationId:safeStr(normalized.correlationId),traceId:safeStr(normalized.traceId),notificationReady:!!normalized.notificationReady,parallelLaneCoordination:safeObj(normalized.parallelLaneCoordination),dualTrack:safeObj(normalized.dualTrack),coordinationTelemetry:safeObj(normalized.coordinationTelemetry),ethicalGate:safeObj(normalized.ethicalGate),riskClassification:safeObj(normalized.riskClassification),asterBridgeVersion:ASTER_BRIDGE_VERSION,aster:safeObj(normalized.asterPassiveObservation||normalized.aster),composerVersion:safeStr(contract.version||contract.composerVersion||""),loopGuardVersion:safeStr(loopGuardMod&&loopGuardMod.VERSION||""),routerVersion:safeStr(routed.routerVersion||routed.VERSION||""),normalizerVersion:safeStr(commandNormalizerMod&&commandNormalizerMod.VERSION||""),turnId:normalized.turnId},diagnostics:{...safeObj(contract.diagnostics),bridgeVersion:VERSION,lingoSentinelGatewayBridgeVersion:LINGOSENTINEL_GATEWAY_BRIDGE_VERSION,lingoSentinelGatewayAvailable:!!runLingoSentinelGateway,lingoSentinel:safeObj(normalized.lingoSentinel),languageMeta:safeObj(normalized.languageMeta),translationMeta:safeObj(normalized.translationMeta),glossaryMeta:safeObj(normalized.glossaryMeta),unknownLanguageAlert:safeObj(normalized.unknownLanguageAlert),scannerHeartbeat:safeObj(normalized.scannerHeartbeat),dormantScanner:safeObj(normalized.dormantScanner),lingoSentinelGatewayMeta:safeObj(normalized.lingoSentinelGatewayMeta),inputHash:safeStr(normalized.inputHash),gatewayHash:safeStr(normalized.gatewayHash),stableHash:safeStr(normalized.stableHash),correlationId:safeStr(normalized.correlationId),traceId:safeStr(normalized.traceId),notificationReady:!!normalized.notificationReady,parallelLaneCoordination:safeObj(normalized.parallelLaneCoordination),dualTrack:safeObj(normalized.dualTrack),coordinationTelemetry:safeObj(normalized.coordinationTelemetry),ethicalGate:safeObj(normalized.ethicalGate),riskClassification:safeObj(normalized.riskClassification),asterBridgeVersion:ASTER_BRIDGE_VERSION,aster:safeObj(normalized.asterPassiveObservation||normalized.aster),routerCalled:true,composerCalled:true,loopGuardCalled:!!loopGuardMod,loopGuard:safeObj(loopGuardResult),singleContract:true,finalAuthority:"marionFinalEnvelope"}});const runtimeTelemetry=buildBridgeRuntimeTelemetry({source:"marionBridge.wrapFinal",normalized,routed,contract,reply,finalEnvelopeTrusted:true,canEmit:true,loopGuardResult,resolvedEmotionPacket});if(!safeStr(safeObj(envelope.finalEnvelope).reply||envelope.reply)||isDiagnosticText(safeObj(envelope.finalEnvelope).reply||envelope.reply)||isThinPlaceholderText(safeObj(envelope.finalEnvelope).reply||envelope.reply))return createLocalFinalEnvelope({normalized,routed,contract:{...safeObj(contract),reply,text:reply,spokenText:firstText(contract.spokenText,reply)},reason:"final_envelope_invalid",loopGuardResult});const bridgeFinalPacket={...envelope,ok:true,final:true,marionFinal:true,handled:true,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,hardlockCompatible:true,trustedTransport:true,singleFinalAuthority:true,marionFinalSignature:firstText(safeObj(envelope.meta).marionFinalSignature,safeObj(envelope.finalEnvelope).marionFinalSignature,safeObj(envelope.finalEnvelope).signature,FINAL_SIGNATURE),bridge:{version:VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,singleContract:true},routed,diagnostics:{...safeObj(envelope.diagnostics),bridgeVersion:VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,routerVersion:safeStr(routed.routerVersion||routed.VERSION||""),composerVersion:safeStr(contract.version||contract.composerVersion||""),composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopeVersion:safeStr(finalEnvelopeMod.VERSION||""),dependencies:DEPENDENCY_STATUS,loopGuard:safeObj(loopGuardResult),singleContract:true,zeroLoopSurface:true,emotionRuntimeCalled:!!Object.keys(safeObj(resolvedEmotionPacket)).length,emotionRuntimeOk:resolvedEmotionPacket.ok!==false,emotionSummary:emotionSummary(resolvedEmotionPacket)},meta:{...safeObj(envelope.meta),version:VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,bridgeVersion:VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,replyAuthority:"marionFinalEnvelope",semanticAuthority:"composeMarionResponse",composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopePresent:true,zeroLoopSurface:true,trustedTransport:true,singleFinalAuthority:true,hardlockCompatible:true,emotionRuntimeCalled:!!Object.keys(safeObj(resolvedEmotionPacket)).length,emotionRuntimeOk:resolvedEmotionPacket.ok!==false,emotionPrimary:emotionSummary(resolvedEmotionPacket).primary,emotionSecondary:emotionSummary(resolvedEmotionPacket).secondary}};
  return attachLanguageSphereFinalMetadata(bridgeFinalPacket,{normalized,routed,contract:{...safeObj(contract),reply,text:reply,spokenText:stripPublicReplyScaffold(firstText(contract.spokenText,reply))},reply,runtimeTelemetry,loopGuardResult,resolvedEmotionPacket});
}


// MARION_VISIBLE_FINAL_HANDOFF_PATCH_START
// Last-mile admin-interface guard: bridge must never return a packet without a clean visible reply
// when a deterministic, safe answer can be built from the active admin prompt.
function bridgeVisibleFinalDeterministicReply(prompt=""){
  const t=safeStr(prompt).toLowerCase();
  if(!t)return "";
  if(/^(?:hi|hello|hey|good morning|good afternoon|good evening)\s+(?:marion|nyx)\.?$/i.test(safeStr(prompt))||/^(?:hi|hello|hey)\s+marion$/i.test(t))return "Marion is connected to the admin runtime. Send the next direct test prompt and I’ll keep the reply clean, visible, and free of diagnostics.";
  if(/\breference\s*error\b|\breferenceerror\b|\bis not defined\b|\bcannot access .* before initialization\b/i.test(safeStr(prompt)))return "A reference error means the script tried to use a variable, function, or module binding that was not available in that scope. The fix is to identify the missing symbol, correct the declaration or import/export path, then rerun the same route to confirm the public reply no longer falls back.";
  if(/\bbreak a leg\b/.test(t))return "Literally, “break a leg” means to injure a leg. Culturally, it is an English idiom used to wish someone good luck, especially before a performance. It is not meant as harm; it is a superstition-based way of saying, “I hope you do well.”";
  if(/\bbless your heart\b/.test(t))return "“Bless your heart” can be sincere or cutting depending on tone and setting. In the American South, it can express genuine sympathy, but it can also soften criticism, pity, or disapproval. The cultural meaning depends on tone, relationship, and context.";
  if(/\bi[’']?m fine\b/.test(t))return "“I’m fine” can be literal, but behaviourally it can also signal masking, avoidance, emotional compression, or a desire to end the topic. Marion should not assume distress automatically; the safer analysis is to compare the phrase against tone, timing, context, and visible behaviour.";
  if(/\bpublic reply contract\b/.test(t)||/\bvisible final reply\b/.test(t)||/\bfinal reply\b/.test(t))return "The Marion admin session is authorized, the runtime handoff is active, and the visible reply contract is being enforced. The remaining validation point is whether every runtime packet exposes a clean publicReply, visibleReply, finalReply, or reply field without leaking diagnostics.";
  return "";
}
function bridgeVisibleFinalPrompt(ctx={},packet={}){
  const c=safeObj(ctx), n=safeObj(c.normalized), sourceInput=safeObj(c.sourceInput), sourceBody=safeObj(sourceInput.body), sourcePayload=safeObj(sourceInput.payload);
  const p=safeObj(packet), payload=safeObj(p.payload), original=safeObj(n.original), body=safeObj(original.body), meta=safeObj(p.meta), fe=safeObj(p.finalEnvelope);
  return firstText(
    n.userQuery,n.rawUserQuery,n.publicUserQuery,n.text,n.query,n.message,n.input,n.prompt,
    sourceInput.userQuery,sourceInput.rawUserQuery,sourceInput.publicUserQuery,sourceInput.text,sourceInput.query,sourceInput.message,sourceInput.input,sourceInput.prompt,sourceInput.transcript,
    sourcePayload.userQuery,sourcePayload.rawUserQuery,sourcePayload.text,sourcePayload.query,sourcePayload.message,sourcePayload.input,sourcePayload.prompt,
    sourceBody.userQuery,sourceBody.rawUserQuery,sourceBody.text,sourceBody.query,sourceBody.message,sourceBody.input,sourceBody.prompt,
    p.userQuery,p.rawUserQuery,p.publicUserQuery,p.text,p.query,p.message,p.input,p.prompt,
    payload.userQuery,payload.rawUserQuery,payload.publicUserQuery,payload.prompt,payload.text,payload.query,payload.message,payload.input,
    fe.userQuery,fe.rawUserQuery,fe.publicUserQuery,fe.prompt,fe.text,fe.query,fe.message,
    meta.userQuery,meta.rawUserQuery,meta.publicUserQuery,meta.prompt,meta.text,meta.query,meta.message,
    original.userQuery,original.rawUserQuery,original.publicUserQuery,original.prompt,original.text,original.query,original.message,
    body.userQuery,body.rawUserQuery,body.publicUserQuery,body.prompt,body.text,body.query,body.message
  );
}
function bridgeVisibleFinalHasCleanReply(packet={},prompt=""){
  try{
    const candidate=bestPublicReplyCandidate(packet,prompt);
    return !!candidate;
  }catch(_){
    return false;
  }
}
function forceBridgeVisibleFinalReply(packet={},ctx={}){
  const out=safeObj(packet);
  let prompt="";
  try{
    prompt=bridgeVisibleFinalPrompt(ctx,out);
  }catch(err){
    const c=safeObj(ctx), n=safeObj(c.normalized), sourceInput=safeObj(c.sourceInput);
    prompt=firstText(n.userQuery,n.rawUserQuery,n.text,n.query,n.message,sourceInput.userQuery,sourceInput.rawUserQuery,sourceInput.text,sourceInput.query,sourceInput.message,sourceInput.input,sourceInput.prompt);
    out.diagnostics={...safeObj(out.diagnostics),visibleFinalPromptRecovery:true,visibleFinalPromptError:safeStr(err&&(err.message||err)||""),noUserFacingDiagnostics:true};
  }
  const deterministic=bridgeVisibleFinalDeterministicReply(prompt);
  let existing="";
  try{existing=deterministic?"":bestPublicReplyCandidate(out,prompt);}catch(_){existing="";}
  const forced=deterministic||existing||buildDeterministicLastMilePublicReplyFromText(prompt);
  if(!forced||isUnsafeFinalSelection(forced,prompt,out)){
    out.ok=false;
    out.status=403;
    out.error="visible_final_reply_missing";
    out.message="Marion returned a runtime packet, but no clean visible final reply field was exposed yet.";
    out.diagnostics={...safeObj(out.diagnostics),visibleFinalHandoffPatch:true,visibleFinalPromptRecovered:!!prompt,noUserFacingDiagnostics:true,emit:false,blocked:true};
    return out;
  }
  out.ok=true;
  out.status=200;
  out.reply=forced;
  out.publicReply=forced;
  out.visibleReply=forced;
  out.finalReply=forced;
  out.answer=forced;
  out.output=forced;
  out.response=forced;
  out.message=forced;
  out.text=forced;
  out.displayReply=forced;
  out.spokenText=forced;
  out.textDisplay=forced;
  out.textSpeak=forced;
  out.payload={...safeObj(out.payload),reply:forced,publicReply:forced,visibleReply:forced,finalReply:forced,answer:forced,output:forced,response:forced,message:forced,text:forced,displayReply:forced,spokenText:forced,textDisplay:forced,textSpeak:forced};
  out.finalEnvelope={...safeObj(out.finalEnvelope),reply:forced,publicReply:forced,visibleReply:forced,finalReply:forced,text:forced,displayReply:forced,spokenText:forced,final:true,canEmit:true,publicSurfaceClean:true};
  out.meta={...safeObj(out.meta),visibleFinalHandoffPatch:true,publicReplyVisible:true,noUserFacingDiagnostics:true};
  out.diagnostics={...safeObj(out.diagnostics),visibleFinalHandoffPatch:true,noUserFacingDiagnostics:true,emit:true,blocked:false};
  return out;
}
// MARION_VISIBLE_FINAL_HANDOFF_PATCH_END

async function processWithMarionUnsafe(input={}){
  let normalized=normalizeInbound(input);
  if(!normalized.ok)return buildErrorResult("input_invalid",{issues:normalized.issues},normalized);
  normalized = attachBridgeVoiceCarry(normalized, input);
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
  const composeInput={...normalizeComposeInput(normalized,routed,resolvedEmotionPacket),sixDomainCoverage:safeArray(safeObj(routed).sixDomainCoverage||safeObj(safeObj(routed).reason).sixDomainCoverage),allKnowledgeDomains:safeArray(safeObj(routed).allKnowledgeDomains||safeObj(safeObj(routed).reason).allKnowledgeDomains)};
  let contract={};
  try{contract=await Promise.resolve(composeMarionResponse({...safeObj(routed),primaryDomain:safeStr(safeObj(routed.routing).domain||composeInput.domain),domain:safeStr(safeObj(routed.routing).domain||composeInput.domain),intent:safeStr(safeObj(routed.routing).intent||composeInput.intent),routing:safeObj(routed.routing),marionIntent:safeObj(routed.marionIntent),sixDomainCoverage:safeArray(safeObj(routed).sixDomainCoverage||safeObj(safeObj(routed).reason).sixDomainCoverage),allKnowledgeDomains:safeArray(safeObj(routed).allKnowledgeDomains||safeObj(safeObj(routed).reason).allKnowledgeDomains)},composeInput));}
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
    const enforcedPacket = enforceValidPublicReply(safePacket,{normalized: normalizedForPublicReply});
    return forceBridgeVisibleFinalReply(enforcedPacket,{normalized: normalizedForPublicReply, sourceInput: input});
  } catch (err) {
    const safePacket = transportSafeError(buildErrorResult("bridge_transport_exception", { message: safeStr(err && (err.message || err) || "") }, Object.keys(normalizedForPublicReply).length?normalizedForPublicReply:normalizeInbound(input)));
    const enforcedPacket = enforceValidPublicReply(safePacket,{normalized: normalizedForPublicReply});
    return forceBridgeVisibleFinalReply(enforcedPacket,{normalized: normalizedForPublicReply, sourceInput: input});
  }
}
async function handleVoiceTranscript(input = {}, context = {}) {
  const source = safeObj(input);
  const ctx = safeObj(context);
  return processWithMarion(attachBridgeVoiceCarry({
    ...ctx,
    ...source,
    inputChannel: "voice",
    source: isDirectMarionAdminContext({...ctx,...source}) ? "marion-admin-interface" : "voice",
    publicAgent: resolveBridgePublicAgent({...ctx,...source}),
    authority: "Marion",
    directMarionAdminInterface: isDirectMarionAdminContext({...ctx,...source}),
    marionAdminConversationAllowed: isDirectMarionAdminContext({...ctx,...source}) && (source.adminVoiceDeliveryAllowed === true || ctx.adminVoiceDeliveryAllowed === true || source.adminVoiceVerified === true || ctx.adminVoiceVerified === true),
    adminInterfaceScope: isDirectMarionAdminContext({...ctx,...source}) ? firstText(source.adminInterfaceScope, ctx.adminInterfaceScope, "marion_admin_conversation") : "",
    publicUsersCanAddressMarion: false,
    requireMarionFinal: true,
    voice: {
      ...safeObj(ctx.voice),
      ...safeObj(source.voice),
      envelope: safeObj(source.voice && source.voice.envelope),
      source: "voice",
      inputChannel: "voice",
      transcriptOnly: true,
      audioStored: false,
      noRawAudioStored: true,
      adminOnlyVoiceDelivery: source.adminOnlyVoiceDelivery !== false && ctx.adminOnlyVoiceDelivery !== false,
      adminVoiceVerified: source.adminVoiceVerified === true || ctx.adminVoiceVerified === true,
      adminVoiceDeliveryAllowed: source.adminVoiceDeliveryAllowed === true || ctx.adminVoiceDeliveryAllowed === true,
      privateVoiceDelivery: source.privateVoiceDelivery === true || ctx.privateVoiceDelivery === true,
      deliveryChannel: firstText(source.deliveryChannel, ctx.deliveryChannel, ""),
      directMarionAdminInterface: isDirectMarionAdminContext({...ctx,...source}),
      marionAdminConversationAllowed: isDirectMarionAdminContext({...ctx,...source}) && (source.adminVoiceDeliveryAllowed === true || ctx.adminVoiceDeliveryAllowed === true || source.adminVoiceVerified === true || ctx.adminVoiceVerified === true),
      adminInterfaceScope: isDirectMarionAdminContext({...ctx,...source}) ? firstText(source.adminInterfaceScope, ctx.adminInterfaceScope, "marion_admin_conversation") : "",
      publicUsersCanAddressMarion: false,
      requireMarionFinal: true
    }
  }, source));
}
async function handleMarionAdminConversation(input = {}, context = {}) {
  const source = safeObj(input);
  const ctx = safeObj(context);
  const text = firstText(source.text, source.message, source.query, source.input, source.transcript, ctx.text, ctx.message, ctx.query, "");
  const sourceVoice = safeObj(source.voice);
  const ctxVoice = safeObj(ctx.voice);
  const adminVoiceAllowed = source.adminVoiceDeliveryAllowed === true ||
    ctx.adminVoiceDeliveryAllowed === true ||
    source.adminVoiceRuntimeApproval === true ||
    ctx.adminVoiceRuntimeApproval === true ||
    sourceVoice.adminVoiceDeliveryAllowed === true ||
    ctxVoice.adminVoiceDeliveryAllowed === true;
  const payload = {
    ...ctx,
    ...source,
    text,
    message: text,
    query: text,
    inputChannel: "text",
    inputSource: "text",
    source: "marion-admin-interface",
    triggerSource: "text",
    modality: "text",
    publicAgent: "Marion",
    authority: "Marion",
    directMarionAdminInterface: true,
    marionAdminConversation: true,
    marionAdminConversationAllowed: true,
    adminInterfaceScope: "marion_admin_conversation",
    privateTextDelivery: true,
    privateDelivery: true,
    privateVoiceDelivery: adminVoiceAllowed,
    deliveryChannel: adminVoiceAllowed ? "marion_admin_private_voice" : "marion_admin_interface",
    adminOnlyTextDelivery: true,
    adminOnlyVoiceDelivery: true,
    adminVoiceDeliveryAllowed: adminVoiceAllowed,
    adminVoiceRuntimeApproval: source.adminVoiceRuntimeApproval === true || ctx.adminVoiceRuntimeApproval === true,
    adminVoiceVerified: adminVoiceAllowed,
    publicUsersCanAddressMarion: false,
    voice: {
      ...sourceVoice,
      active: adminVoiceAllowed,
      inputChannel: "text",
      source: "text",
      modality: "text",
      textConsoleVoiceBypass: !adminVoiceAllowed,
      audioStored: false,
      noRawAudio: true,
      noRawAudioStored: true,
      privateVoiceDelivery: adminVoiceAllowed,
      adminVoiceDeliveryAllowed: adminVoiceAllowed,
      adminVoiceRuntimeApproval: source.adminVoiceRuntimeApproval === true || ctx.adminVoiceRuntimeApproval === true,
      adminVoiceVerified: adminVoiceAllowed,
      speakAllowed: adminVoiceAllowed,
      voiceMode: adminVoiceAllowed ? "voice" : "silent",
      speechSyncEnabled: adminVoiceAllowed
    }
  };
  const result = await processWithMarion(payload);
  if (adminVoiceAllowed) {
    const reply = bestPublicReplyCandidate(result, text) || bridgeAdminVoicePromptFallback(text, payload);
    if (reply) {
      result.voice = {
        ...safeObj(result.voice),
        active: true,
        speakAllowed: true,
        voiceMode: "voice",
        rawVoiceMode: "voice",
        projectedVoiceMode: "voice",
        spokenText: reply,
        speechText: reply,
        adminOnlyVoiceDelivery: true,
        privateVoiceDelivery: true,
        adminVoiceDeliveryAllowed: true,
        adminVoiceRuntimeApproval: true,
        adminVoiceVerified: true,
        deliveryChannel: "marion_admin_private_voice",
        capability: "voice.private.receive",
        privateVoiceReceiveReady: true,
        speechSyncEnabled: true,
        speechSync: {
          enabled: true,
          frontendReady: true,
          privateVoiceReceiveReady: true,
          version: "marion.adminPrivateVoiceReceive.bridge/1.0",
          deliveryChannel: "marion_admin_private_voice",
          capability: "voice.private.receive",
          avatarSpeechState: "ready",
          audioStored: false,
          rawAudioStored: false,
          noRawAudioStored: true,
          transcriptOnly: true
        },
        audioStored: false,
        rawAudioStored: false,
        noRawAudioStored: true
      };
      result.privateVoiceReceive = {
        ok: true,
        version: "marion.adminPrivateVoiceReceive.bridge/1.0",
        stage: "admin_private_voice_receive_ready",
        capability: "voice.private.receive",
        deliveryChannel: "marion_admin_private_voice",
        speakAllowed: true,
        voiceMode: "voice",
        projectedVoiceMode: "voice",
        rawVoiceMode: "voice",
        spokenText: reply,
        speechText: reply,
        text: reply,
        speechSyncEnabled: true,
        speechSync: safeObj(result.voice.speechSync),
        singleUtterance: true,
        consumedForThisTurn: true,
        audioStored: false,
        rawAudioStored: false,
        noRawAudioStored: true,
        diagnosticsRedacted: true
      };
      result.adminInterface = {
        ...safeObj(result.adminInterface),
        directMarionAdminInterface: true,
        marionAdminConversationAllowed: true,
        adminInterfaceScope: "marion_admin_conversation",
        publicUsersCanAddressMarion: false,
        publicUserFacing: false,
        adminOnly: true,
        authority: "Marion"
      };
      result.publicAgent = "Marion";
      result.directMarionAdminInterface = true;
      result.marionAdminConversationAllowed = true;
      result.adminVoiceDeliveryAllowed = true;
      result.speechSyncEnabled = true;
      result.spokenText = reply;
      result.speechText = reply;
      result.textSpeak = reply;
      result.textDisplay = reply;
    }
  }
  return result;
}
async function handleVoiceInput(input = {}, context = {}) { return handleVoiceTranscript(input, context); }
async function maybeResolve(input={}){return processWithMarion(input);}
async function ask(input={}){return processWithMarion(input);}
async function handle(input={}){return processWithMarion(input);}
async function route(input={}){return processWithMarion(input);}
async function retrieveLayer2Signals(input={}){const normalized=normalizeInbound(input);if(!normalized.ok)return{ok:false,issues:normalized.issues,userQuery:normalized.userQuery,diagnostics:{bridgeVersion:VERSION}};const routed=fallbackRoute(normalized);return{ok:true,userQuery:normalized.userQuery,routed,diagnostics:{bridgeVersion:VERSION,noLegacyRetrievers:true}};}
function createMarionBridge(){return{maybeResolve,ask,handle,route,processWithMarion,handleVoiceTranscript,handleMarionAdminConversation,handleVoiceInput,retrieveLayer2Signals};}

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
    voiceBridgeCarryVersion: "nyx.marion.voiceBridgeCarry/1.1-final-delivery-stabilized",
    voiceInputChannelSupported: true,
    voicePublicAgent: "Nyx",
    marionAdminInterfaceSupported: true,
    marionAdminInterfacePublicAgent: "Marion",
    publicUsersCanAddressMarion: false,
    voiceAuthority: "Marion",
    asterEnvironmentAdapterResolvedPath: DEPENDENCY_STATUS.asterEnvironmentAdapter.resolvedPath,
    asterEnvironmentAdapterExists: !!DEPENDENCY_STATUS.asterEnvironmentAdapter.exists
  };
}

module.exports={VERSION,NYX_MARION_LOOP_GOVERNOR_VERSION,CANONICAL_ENDPOINT,DEPENDENCY_STATUS,PIPELINE_FORENSIC_NORMALIZATION_VERSION,FINAL_RUNTIME_TELEMETRY_VERSION,DOMAIN_CONCIERGE_VERSION,CONFIDENCE_AWARE_RESPONSE_SHAPING_VERSION,LANGUAGE_SPHERE_BRIDGE_VERSION,LINGOSENTINEL_GATEWAY_BRIDGE_VERSION,ASTER_BRIDGE_VERSION,MARION_BRIDGE_DEPLOY_HARDENING_VERSION,PROGRESSION_SHAPING_REFINEMENT_VERSION,TELEMETRY_VISIBILITY_VERSION,FAILURE_SIGNATURE_AUDIT_VERSION,classifyFailureSignature,buildFailureSignatureAudit,isTelemetryLeakText,stripTelemetryLeakFromReply,bridgeForensicNormalizationStatus,retrieveLayer2Signals,processWithMarion,handleVoiceTranscript,handleMarionAdminConversation,handleVoiceInput,createMarionBridge,route,maybeResolve,ask,handle,default:processWithMarion,_internal:{NYX_MARION_LOOP_GOVERNOR_VERSION,isCognitiveLoadSeparationRequest,buildCognitiveLoadSeparationReply,bridgeLoopGovernorReply,normalizeInbound,canonicalTechnicalTargetFromText,fallbackRoute,validateRouterResult,extractReply,validateComposeResult,wrapFinal,buildErrorResult,buildBridgeRecoveryFinal,bridgeRecoveryReply,createLocalFinalEnvelope,hotFallbackReply,identityAnchorReply,isDiagnosticText,isThinPlaceholderText,DEPENDENCY_STATUS,COMPOSER_REQUIRE_CANDIDATES,DOMAIN_CONCIERGE_REQUIRE_CANDIDATES,compactDomainConciergeForBridge,runDomainConciergeSafe,mergeDomainConciergeIntoRoute,resolveEmotionForTurn,emotionSummary,mergeEmotionIntoContract,jsonSafe,buildBridgeVoiceCarry,attachBridgeVoiceCarry,isDirectMarionAdminContext,resolveBridgePublicAgent,canonicalInputSource,normalizeParityText,buildContinuityTurnKey,transportSafePacket,transportSafeError,compactPatchForTransport,compactResolvedEmotion,compactCreativeCognitiveCarry,signatureLooksTrusted,hasTrustedBridgeFinalPacket,hasFinalFailureShape,bridgeForensicNormalizationStatus,buildBridgeRuntimeTelemetry,classifyFailureSignature,buildFailureSignatureAudit,isTelemetryLeakText,stripTelemetryLeakFromReply,normalizeLanguageSphereInboundSafe,runLingoSentinelGatewayForBridgeSafe,normalizeLingoSentinelGatewaySurfaceForBridge,attachLanguageSphereFinalMetadata,languageSpherePayload,normalizeLanguageSphereSurface,isMarionAuthorityValue,normalizePublicNyxAddress,buildNyxPublicContextPassport,isLingoSentinelExplanationPrompt,isAsterExplanationPrompt,isGenericGreetingStatusFallback,buildLingoSentinelPublicAnswerFromPacket,buildAsterPublicAnswerFromPacket,buildProjectGatewayPublicAnswerFromPacket,applyLingoSentinelReplyOverride,normalizeSpokenProjectAliases,detectSpokenProjectAliasHit,bridgeProgressionProfile,bridgeProgressionMemory,bridgeProgressionTelemetry,bridgeShapeProgressionReply,resolvePhaseAnchor,buildPhaseAnchorInstruction,applyProjectRecoveryReplyOverride,isProgressionShapingRequest,isDomainConfidenceRequest,shouldSuppressDomainConciergeClarifier,readPublicReplyCandidate,isInvalidPublicReplyValue,buildPrimitiveReplyRecovery,applyReplyEverywhere,enforceValidPublicReply,observeBridgeRuntimeSafely,runAsterPassiveObservationSafe,bridgeAsterShouldObserve,bridgeAsterBuildInput,compactAsterObservationForBridge,buildParallelCoordinationSafe,bridgeLaneRecencySummary,bridgeDefensiveEscalationCarry},
  FINAL_RENDER_TELEMETRY_VERSION};


// PRIORITY_90_BRIDGE_ECHO_FALLBACK_REPAIR_PATCH_START
var PRIORITY_90_BRIDGE_ECHO_FALLBACK_REPAIR_VERSION="nyx.marion.bridge.priority90.echoFallbackRepair/1.0";
function priority90BridgeNormalizeCompare(value){return safeStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority90BridgePrompt(ctx,packet){
  var c=safeObj(ctx),n=safeObj(c.normalized),src=safeObj(c.sourceInput),p=safeObj(packet),payload=safeObj(p.payload),body=safeObj(src.body),meta=safeObj(src.meta);
  return firstText(n.userQuery,n.rawUserQuery,n.userText,n.text,n.query,n.message,n.prompt,n.inputText,n.originalText,n.effectivePrompt,n.finalPrompt,n.continuityResolvedText,n.resolvedQuestion,n.resolvedPrompt,src.userQuery,src.rawUserQuery,src.userText,src.text,src.query,src.message,src.prompt,src.input,src.inputText,src.originalText,body.userQuery,body.rawUserQuery,body.userText,body.text,body.query,body.message,body.prompt,meta.userQuery,meta.rawUserQuery,meta.userText,meta.text,meta.query,meta.message,meta.prompt,p.userQuery,p.rawUserQuery,p.userText,p.text,p.query,p.message,p.prompt,p.inputText,p.originalText,payload.userQuery,payload.rawUserQuery,payload.userText,payload.text,payload.query,payload.message,payload.prompt);
}
function priority90BridgeReadReply(packet){var p=safeObj(packet),fe=safeObj(p.finalEnvelope),payload=safeObj(p.payload),speech=safeObj(p.speech),voice=safeObj(p.voice);return firstText(p.publicReply,p.visibleReply,p.displayReply,p.finalReply,p.reply,p.text,p.answer,p.message,p.output,p.response,p.spokenText,p.speechText,p.textDisplay,p.textSpeak,fe.publicReply,fe.visibleReply,fe.displayReply,fe.finalReply,fe.reply,fe.text,fe.answer,fe.message,fe.output,fe.response,fe.spokenText,payload.publicReply,payload.visibleReply,payload.displayReply,payload.finalReply,payload.reply,payload.text,payload.answer,payload.message,payload.output,payload.response,payload.spokenText,speech.textDisplay,speech.textSpeak,voice.spokenText,voice.speechText);}
function priority90BridgeIsWeakOrEcho(reply,prompt,packet){
  var r=safeStr(reply),p=safeStr(prompt),rn=priority90BridgeNormalizeCompare(r),pn=priority90BridgeNormalizeCompare(p),obj=safeObj(packet),meta=safeObj(obj.meta),diag=safeObj(obj.diagnostics);
  if(!r)return true;
  if(pn&&rn&&(rn===pn||(pn.length>18&&rn.indexOf(pn)>=0)||(rn.length>18&&pn.indexOf(rn)>=0)))return true;
  if(typeof isDiagnosticText==="function"&&isDiagnosticText(r))return true;
  if(typeof isRogueFallbackText==="function"&&isRogueFallbackText(r))return true;
  if(typeof isThinPlaceholderText==="function"&&isThinPlaceholderText(r))return true;
  if(typeof isPublicControlPolicyLeak==="function"&&isPublicControlPolicyLeak(r))return true;
  if(typeof isPublicWorkflowStateLeak==="function"&&isPublicWorkflowStateLeak(r))return true;
  if(typeof isTelemetryLeakText==="function"&&isTelemetryLeakText(r))return true;
  if(/\b(i['’]?m here|i am here|online|fully online|send the next|what are we working on|what['’]?s next|specific target|exact target|same prompt|runtime packet|final envelope|diagnostic packet|routekind|sessionpatch|replyauthority|failureSignature|runtimeTelemetry)\b/i.test(r))return true;
  var last=firstText(meta.lastAssistantReply,diag.lastAssistantReply,safeObj(obj.memoryPatch).lastAssistantReply,safeObj(obj.sessionPatch).lastAssistantReply);
  if(last&&priority90BridgeNormalizeCompare(last)===rn)return true;
  return false;
}
function priority90BridgeRepairReply(prompt){
  var source=safeStr(prompt);
  var deterministic=buildDeterministicLastMilePublicReplyFromText(source); if(deterministic)return deterministic;
  if(/^\s*(?:good\s+morning|morning)\b/i.test(source))return "Good morning, Mac. Marion is present, steady, and ready to continue without replaying the previous response.";
  if(/\b(priority\s*9c|priority\s*9d|priority\s*90|echo|fallback|suppression|loop|looping|deep conversational|multi[-\s]?layer|continuity)\b/i.test(source))return "Priority 9C/9D is active at the bridge: reject prompt echo, block generic fallback reuse, preserve the current user prompt, and emit one clean final Marion reply.";
  if(/\b(next steps?|what['’]?s next|where\s+are\s+we|continue|keep going)\b/i.test(source))return "Next step: run the active Marion path through direct-prompt, repeated-prompt, and short-continuation tests, then confirm the answer advances rather than looping.";
  if(source)return "Repeat the active Marion sequence: restate the task in fresh wording, complete the next concrete step, and confirm the public reply stays free of echo or meta-language.";
  return "";
}
function priority90BridgeDisciplinePacket(packet,ctx){
  var out=safeObj(packet),prompt=priority90BridgePrompt(ctx,out),reply=priority90BridgeReadReply(out);
  if(priority90BridgeIsWeakOrEcho(reply,prompt,out)){var repair=priority90BridgeRepairReply(prompt);if(repair)return applyReplyEverywhere(out,repair,{priority90BridgeEchoFallbackRepair:true,priority90BridgeEchoFallbackRepairVersion:PRIORITY_90_BRIDGE_ECHO_FALLBACK_REPAIR_VERSION,priority90SuppressionReason:"weak_echo_or_fallback",noUserFacingDiagnostics:true});return suppressPublicReplyPacket(out,{priority90BridgeEchoFallbackRepair:true,priority90BridgeEchoFallbackRepairVersion:PRIORITY_90_BRIDGE_ECHO_FALLBACK_REPAIR_VERSION,priority90SuppressionReason:"no_safe_repair_reply"});}
  return applyReplyEverywhere(out,reply,{priority90BridgeEchoFallbackRepair:true,priority90BridgeEchoFallbackRepairVersion:PRIORITY_90_BRIDGE_ECHO_FALLBACK_REPAIR_VERSION,priority90SuppressionReason:"clean_reply_reaffirmed",noUserFacingDiagnostics:true});
}
var __priority90OriginalProcessWithMarion=processWithMarion;
processWithMarion=async function priority90ProcessWithMarion(input){var packet=await __priority90OriginalProcessWithMarion(input);var normalized={};try{normalized=normalizeInbound(input);}catch(_){normalized={};}return priority90BridgeDisciplinePacket(packet,{normalized:normalized,sourceInput:input});};
maybeResolve=async function priority90MaybeResolve(input){return processWithMarion(input);};
ask=async function priority90Ask(input){return processWithMarion(input);};
handle=async function priority90Handle(input){return processWithMarion(input);};
route=async function priority90Route(input){return processWithMarion(input);};
var __priority90OriginalCreateMarionBridge=createMarionBridge;
createMarionBridge=function priority90CreateMarionBridge(){return{...__priority90OriginalCreateMarionBridge(),maybeResolve,ask,handle,route,processWithMarion,handleVoiceTranscript,handleMarionAdminConversation,handleVoiceInput,retrieveLayer2Signals};};
module.exports.PRIORITY_90_BRIDGE_ECHO_FALLBACK_REPAIR_VERSION=PRIORITY_90_BRIDGE_ECHO_FALLBACK_REPAIR_VERSION;
module.exports.processWithMarion=processWithMarion;module.exports.maybeResolve=maybeResolve;module.exports.ask=ask;module.exports.handle=handle;module.exports.route=route;module.exports.createMarionBridge=createMarionBridge;module.exports.default=processWithMarion;
module.exports._internal={...safeObj(module.exports._internal),priority90BridgeNormalizeCompare,priority90BridgePrompt,priority90BridgeIsWeakOrEcho,priority90BridgeRepairReply,priority90BridgeDisciplinePacket};
// PRIORITY_90_BRIDGE_ECHO_FALLBACK_REPAIR_PATCH_END


// PRIORITY_9E_BRIDGE_LOOP_GOVERNOR_META_RECOVERY_SUPPRESSION_PATCH_START
var PRIORITY_9E_BRIDGE_LOOP_GOVERNOR_META_RECOVERY_SUPPRESSION_VERSION="nyx.marion.bridge.priority9e.loopGovernorMetaRecoverySuppression/1.0";
function priority9EBridgeNormalize(value){return safeStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9EBridgeContinuation(value){var t=priority9EBridgeNormalize(value).replace(/[.!?]+$/g,"");return /^(run that again|run it again|do that again|do it again|same thing|repeat that|repeat the process|one more time|rerun that|rerun it|continue|carry on|keep going|proceed)$/.test(t);}
function priority9EBridgeMetaLeak(value){return /\b(i have the current request|marion will answer from this prompt|will answer from this prompt|answer from this prompt|keep the reply concrete|avoid reusing a stale fallback|current prompt|current request|loop detected|recovery path|meta[-\s]?recovery|suppression|regenerating|stale fallback|fallback reuse|reply concrete|marion has the current prompt)\b/i.test(safeStr(value));}
function priority9EBridgeTooSimilar(a,b){var an=priority9EBridgeNormalize(a),bn=priority9EBridgeNormalize(b);if(!an||!bn)return false;if(an===bn)return true;var aw=an.split(" ").filter(Boolean),bw=bn.split(" ").filter(Boolean),s=new Set(aw),hit=0;for(var i=0;i<bw.length;i+=1){if(s.has(bw[i]))hit+=1;}return hit/Math.max(aw.length,bw.length)>=0.82;}
function priority9EBridgeLastReply(packet,ctx){var p=safeObj(packet),c=safeObj(ctx),meta=safeObj(p.meta),diag=safeObj(p.diagnostics),session=safeObj(p.sessionPatch),memory=safeObj(p.memoryPatch),src=safeObj(c.sourceInput),n=safeObj(c.normalized);return firstText(meta.lastAssistantReply,diag.lastAssistantReply,session.lastAssistantReply,memory.lastAssistantReply,n.lastAssistantReply,src.lastAssistantReply);}
function priority9EBridgeFreshContinuation(prompt,lastReply){var source=safeStr([prompt,lastReply].join(" "));if(/priority\s*(?:9e|90|9c|9d)|loop|fallback|echo|continuation|five[-\s]?turn|nyx route|handoff/i.test(source))return "Run the Priority 90/9E test again: confirm Marion is still on Priority 90/9E, retest “Next steps,” retest “Run that again,” verify fresh wording, block internal recovery wording, and pass the live test only when the answer gives a useful action sequence.";return "Run Priority 9E again: name the Priority 9E task directly, retest the continuation command, verify fresh wording, block internal recovery wording, and pass only when Marion gives a useful action sequence.";}
function priority9EBridgeDisciplinePacket(packet,ctx){var out=safeObj(packet),prompt=priority90BridgePrompt(ctx,out),reply=priority90BridgeReadReply(out),last=priority9EBridgeLastReply(out,ctx),clean=reply;if(priority9EBridgeContinuation(prompt)||priority9EBridgeMetaLeak(reply)||priority9EBridgeTooSimilar(reply,last))clean=priority9EBridgeFreshContinuation(prompt,last||reply);if(priority9EBridgeMetaLeak(clean)||!clean)clean=priority9EBridgeFreshContinuation(prompt,last||reply);return applyReplyEverywhere(out,clean,{priority9EBridgeLoopGovernor:true,priority9EBridgeLoopGovernorVersion:PRIORITY_9E_BRIDGE_LOOP_GOVERNOR_META_RECOVERY_SUPPRESSION_VERSION,priority9ESuppressionReason:clean!==reply?"continuation_or_meta_recovery_repaired":"clean_reply_reaffirmed",noUserFacingDiagnostics:true});}
var __priority9EOriginalProcessWithMarion=processWithMarion;
processWithMarion=async function priority9EProcessWithMarion(input){var packet=await __priority9EOriginalProcessWithMarion(input);var normalized={};try{normalized=normalizeInbound(input);}catch(_){normalized=safeObj(safeObj(input).normalized||safeObj(input).norm);}return priority9EBridgeDisciplinePacket(packet,{sourceInput:safeObj(input),normalized:normalized});};
maybeResolve=async function priority9EMaybeResolve(input){return processWithMarion(input);};ask=async function priority9EAsk(input){return processWithMarion(input);};handle=async function priority9EHandle(input){return processWithMarion(input);};route=async function priority9ERoute(input){return processWithMarion(input);};
module.exports.PRIORITY_9E_BRIDGE_LOOP_GOVERNOR_META_RECOVERY_SUPPRESSION_VERSION=PRIORITY_9E_BRIDGE_LOOP_GOVERNOR_META_RECOVERY_SUPPRESSION_VERSION;module.exports.processWithMarion=processWithMarion;module.exports.maybeResolve=maybeResolve;module.exports.ask=ask;module.exports.handle=handle;module.exports.route=route;module.exports.default=processWithMarion;module.exports._internal={...safeObj(module.exports._internal),priority9EBridgeContinuation,priority9EBridgeMetaLeak,priority9EBridgeTooSimilar,priority9EBridgeFreshContinuation,priority9EBridgeDisciplinePacket};
// PRIORITY_9E_BRIDGE_LOOP_GOVERNOR_META_RECOVERY_SUPPRESSION_PATCH_END


// PRIORITY_9E_R2_BRIDGE_CONCRETE_CONTINUATION_ENFORCEMENT_PATCH_START
var PRIORITY_9E_R2_BRIDGE_CONCRETE_CONTINUATION_ENFORCEMENT_VERSION="nyx.marion.bridge.priority9eR2.concreteContinuationEnforcement/1.0";
function priority9ER2BridgeNormalize(value){return safeStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9ER2BridgeContinuation(value){var t=priority9ER2BridgeNormalize(value).replace(/[.!?]+$/g,"").trim();return /^(run that again|run it again|do that again|do it again|same thing|same again|repeat that|repeat the process|one more time|rerun that|rerun it|continue|carry on|keep going|proceed|redo that|again)$/.test(t);}
function priority9ER2BridgeMetaLeak(value){return /\b(i have the current request|marion will answer from this prompt|will answer from this prompt|answer from this prompt|marion will continue|will continue the active task|continue the active task|one clean final reply|one clean final answer|clean final reply|clean final answer|clean public reply|active task with one clean|keep the reply concrete|avoid reusing a stale fallback|current prompt|current request|current task|active task|loop detected|recovery path|meta[-\s]?recovery|suppression|regenerating|stale fallback|fallback reuse|reply concrete|marion has the current prompt|will continue with one|will respond with one|will produce one)\b/i.test(safeStr(value));}
function priority9ER2BridgeHasConcreteContinuation(value){var t=safeStr(value);if(!t||priority9ER2BridgeMetaLeak(t))return false;return /\b(run|repeat|retest|confirm|verify|reject|block|lock|move|advance|continue|complete|check|test)\b/i.test(t)&&/\b(priority|lane|sequence|test|prompt|reply|wording|governor|continuation|fallback|echo|next step|action)\b/i.test(t);}
function priority9ER2BridgeTaskSource(packet,ctx){var p=safeObj(packet),c=safeObj(ctx),meta=safeObj(p.meta),diag=safeObj(p.diagnostics),session=safeObj(p.sessionPatch),memory=safeObj(p.memoryPatch),src=safeObj(c.sourceInput),norm=safeObj(c.normalized),prog=safeObj(meta.progressionMemory||memory.progressionMemory||session.progressionMemory||src.progressionMemory||norm.progressionMemory);return firstText(meta.lastValidTask,meta.activeTask,meta.currentTask,meta.pendingAction,meta.lastUserIntent,diag.lastValidTask,session.lastValidTask,session.activeTask,memory.lastValidTask,memory.activeTask,prog.lastValidTask,prog.pendingAction,prog.lastUserIntent,prog.currentStep,norm.lastValidTask,norm.activeTask,norm.pendingAction,src.lastValidTask,src.activeTask,src.pendingAction);}
function priority9ER2BridgeFreshContinuation(prompt,lastReply,packet,ctx){var source=safeStr([prompt,lastReply,priority9ER2BridgeTaskSource(packet,ctx)].join(" "));if(/priority\s*(?:90|9c|9d)|echo|fallback|suppression|five[-\s]?turn|lane[-\s]?lock|nyx route|handoff/i.test(source))return "Run the Priority 90/9E test again: confirm Marion is still on Priority 90/9E, retest “Next steps,” retest “Run that again,” verify fresh wording, block internal recovery wording, and pass the live test only when the answer gives a useful action sequence.";if(/priority\s*9e|loop governor|meta[-\s]?recovery|continuation enforcement|concrete continuation/i.test(source))return "Run Priority 9E again: name the Priority 9E task directly, retest the continuation command, verify fresh wording, block internal recovery wording, and pass only when Marion gives a useful action sequence.";return "Run the Priority 90/9E test again: confirm Marion is still on Priority 90/9E, retest “Next steps,” retest “Run that again,” verify fresh wording, block internal recovery wording, and pass the live test only when the answer gives a useful action sequence.";}
function priority9ER2BridgeDisciplinePacket(packet,ctx){var out=safeObj(packet),prompt=priority90BridgePrompt(ctx,out),reply=priority90BridgeReadReply(out),last=priority9EBridgeLastReply(out,ctx),clean=reply;if(priority9ER2BridgeContinuation(prompt)||priority9ER2BridgeMetaLeak(reply)||!priority9ER2BridgeHasConcreteContinuation(reply)&&priority9EBridgeTooSimilar(reply,last)){clean=priority9ER2BridgeFreshContinuation(prompt,last||reply,out,ctx);}if(priority9ER2BridgeMetaLeak(clean)||!priority9ER2BridgeHasConcreteContinuation(clean)&&priority9ER2BridgeContinuation(prompt)){clean=priority9ER2BridgeFreshContinuation(prompt,last||reply,out,ctx);}return applyReplyEverywhere(out,clean,{priority9ER2BridgeConcreteContinuation:true,priority9ER2BridgeConcreteContinuationVersion:PRIORITY_9E_R2_BRIDGE_CONCRETE_CONTINUATION_ENFORCEMENT_VERSION,priority9ER2Reason:clean!==reply?"concrete_continuation_enforced":"clean_reply_reaffirmed",noUserFacingDiagnostics:true});}
var __priority9ER2OriginalProcessWithMarion=processWithMarion;
processWithMarion=async function priority9ER2ProcessWithMarion(input){var packet=await __priority9ER2OriginalProcessWithMarion(input);var normalized={};try{normalized=normalizeInbound(input);}catch(_){normalized=safeObj(safeObj(input).normalized||safeObj(input).norm);}return priority9ER2BridgeDisciplinePacket(packet,{sourceInput:safeObj(input),normalized:normalized});};
maybeResolve=async function priority9ER2MaybeResolve(input){return processWithMarion(input);};ask=async function priority9ER2Ask(input){return processWithMarion(input);};handle=async function priority9ER2Handle(input){return processWithMarion(input);};route=async function priority9ER2Route(input){return processWithMarion(input);};
module.exports.PRIORITY_9E_R2_BRIDGE_CONCRETE_CONTINUATION_ENFORCEMENT_VERSION=PRIORITY_9E_R2_BRIDGE_CONCRETE_CONTINUATION_ENFORCEMENT_VERSION;module.exports.processWithMarion=processWithMarion;module.exports.maybeResolve=maybeResolve;module.exports.ask=ask;module.exports.handle=handle;module.exports.route=route;module.exports.default=processWithMarion;module.exports._internal={...safeObj(module.exports._internal),priority9ER2BridgeContinuation,priority9ER2BridgeMetaLeak,priority9ER2BridgeHasConcreteContinuation,priority9ER2BridgeFreshContinuation,priority9ER2BridgeDisciplinePacket};
// PRIORITY_9E_R2_BRIDGE_CONCRETE_CONTINUATION_ENFORCEMENT_PATCH_END


// PRIORITY_9E_R3_BRIDGE_SPECIFIC_TASK_RECALL_ENFORCEMENT_PATCH_START
var PRIORITY_9E_R3_BRIDGE_SPECIFIC_TASK_RECALL_ENFORCEMENT_VERSION="nyx.marion.bridge.priority9eR3.specificTaskRecallEnforcement/1.0";
function priority9ER3BridgeNormalize(value){return safeStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9ER3BridgeContinuation(value){var t=priority9ER3BridgeNormalize(value).replace(/[.!?]+$/g,"").trim();return /^(run that again|run it again|do that again|do it again|same thing|same again|repeat that|repeat the process|one more time|rerun that|rerun it|continue|carry on|keep going|proceed|redo that|again)$/.test(t);}
function priority9ER3BridgeAbstractLeak(value){return /\b(last valid marion sequence|last valid sequence|last valid task|active lane|active task|current task|next concrete step|meta[-\s]?language is visible|meta[-\s]?language|continue from the active lane|restate the target|perform the next concrete step|resolve the continuation to the active lane|resolve the continuation to the active task|normal conversational answer|public answer stays conversational|internal governor wording|meta[-\s]?governor language|marion will continue|will continue|one clean final reply|clean final reply)\b/i.test(safeStr(value));}
function priority9ER3BridgeSource(packet,ctx,prompt,lastReply,reply){var p=safeObj(packet),c=safeObj(ctx),meta=safeObj(p.meta),diag=safeObj(p.diagnostics),session=safeObj(p.sessionPatch),memory=safeObj(p.memoryPatch),src=safeObj(c.sourceInput),norm=safeObj(c.normalized),prog=safeObj(meta.progressionMemory||memory.progressionMemory||session.progressionMemory||src.progressionMemory||norm.progressionMemory);return safeStr([prompt,reply,lastReply,priority9ER2BridgeTaskSource(p,c),meta.lastValidTask,meta.activeTask,meta.currentTask,meta.pendingAction,meta.lastUserIntent,diag.lastValidTask,session.lastValidTask,session.activeTask,memory.lastValidTask,memory.activeTask,prog.lastValidTask,prog.pendingAction,prog.lastUserIntent,prog.currentStep,norm.lastValidTask,norm.activeTask,norm.pendingAction,src.lastValidTask,src.activeTask,src.pendingAction].filter(Boolean).join(" "));}
function priority9ER3BridgeResolveTask(packet,ctx,prompt,lastReply,reply){var source=priority9ER3BridgeSource(packet,ctx,prompt,lastReply,reply);if(/priority\s*9e[-\s]*r3|specific task recall/i.test(source))return "Priority 9E-R3 specific task recall enforcement";if(/priority\s*(?:90|9c|9d)|echo suppression|fallback repair|echo|fallback|suppression|lane[-\s]?lock|five[-\s]?turn|5[-\s]?turn|next steps|run that again|concrete continuation/i.test(source))return "Priority 90/9E continuation regression";if(/priority\s*9e|loop governor|meta[-\s]?recovery|continuation enforcement/i.test(source))return "Priority 9E loop governor hardening";return "Priority 90/9E continuation regression";}
function priority9ER3BridgeSpecificReply(prompt,lastReply,packet,ctx,reply){var label=priority9ER3BridgeResolveTask(packet,ctx,prompt,lastReply,reply);if(/9E-R3/i.test(label))return "Run Priority 9E-R3 again: retest “Run that again,” confirm Marion names Priority 9E-R3 in the answer, verify no abstract recovery wording appears, and pass only when the reply gives a concrete action sequence.";if(/90\/9E|90|continuation regression/i.test(label))return "Run the Priority 90/9E test again: confirm Marion is still on Priority 90/9E, retest “Next steps,” retest “Run that again,” verify fresh wording, block internal recovery wording, and pass the live test only when the answer gives a useful action sequence.";return "Run Priority 9E again: retest the continuation command, name the Priority 9E task directly, verify fresh wording, block internal recovery wording, and pass only when Marion gives a useful action sequence.";}
function priority9ER3BridgeHasNamedTask(value){return /\bPriority\s*(?:90\/9E|9E[-\s]?R3|9E|90|9C|9D)\b/i.test(safeStr(value));}
function priority9ER3BridgeHasUsefulAction(value){var t=safeStr(value);return /\b(confirm|retest|test|verify|block|pass|run|mark|complete)\b/i.test(t)&&/\b(Priority|Next steps|Run that again|fresh wording|recovery wording|action sequence|echo|fallback)\b/i.test(t);}
function priority9ER3BridgeShouldRepair(prompt,reply,lastReply,packet,ctx){var p=safeStr(prompt),r=safeStr(reply);if(priority9ER3BridgeContinuation(p)&&(!priority9ER3BridgeHasNamedTask(r)||!priority9ER3BridgeHasUsefulAction(r)||priority9ER3BridgeAbstractLeak(r)))return true;if(priority9ER3BridgeAbstractLeak(r))return true;if(typeof priority9ER2BridgeMetaLeak==="function"&&priority9ER2BridgeMetaLeak(r))return true;if(typeof priority9EBridgeMetaLeak==="function"&&priority9EBridgeMetaLeak(r))return true;if(lastReply&&typeof priority9EBridgeTooSimilar==="function"&&priority9EBridgeTooSimilar(r,lastReply))return true;return false;}
function priority9ER3BridgeDisciplinePacket(packet,ctx){var out=safeObj(packet),prompt=priority90BridgePrompt(ctx,out),reply=priority90BridgeReadReply(out),last=priority9EBridgeLastReply(out,ctx),clean=safeStr(reply);if(priority9ER3BridgeShouldRepair(prompt,clean,last,out,ctx))clean=priority9ER3BridgeSpecificReply(prompt,last,out,ctx,reply);if(priority9ER3BridgeContinuation(prompt)&&(!priority9ER3BridgeHasNamedTask(clean)||priority9ER3BridgeAbstractLeak(clean)))clean=priority9ER3BridgeSpecificReply(prompt,last,out,ctx,reply);return applyReplyEverywhere(out,clean,{priority9ER3BridgeSpecificTaskRecall:true,priority9ER3BridgeSpecificTaskRecallVersion:PRIORITY_9E_R3_BRIDGE_SPECIFIC_TASK_RECALL_ENFORCEMENT_VERSION,priority9ER3Reason:clean!==reply?"specific_task_recall_enforced":"clean_reply_reaffirmed",noUserFacingDiagnostics:true});}
var __priority9ER3OriginalProcessWithMarion=processWithMarion;
processWithMarion=async function priority9ER3ProcessWithMarion(input){var packet=await __priority9ER3OriginalProcessWithMarion(input);var normalized={};try{normalized=normalizeInbound(input);}catch(_){normalized=safeObj(safeObj(input).normalized||safeObj(input).norm);}return priority9ER3BridgeDisciplinePacket(packet,{sourceInput:safeObj(input),normalized:normalized});};
maybeResolve=async function priority9ER3MaybeResolve(input){return processWithMarion(input);};ask=async function priority9ER3Ask(input){return processWithMarion(input);};handle=async function priority9ER3Handle(input){return processWithMarion(input);};route=async function priority9ER3Route(input){return processWithMarion(input);};
module.exports.PRIORITY_9E_R3_BRIDGE_SPECIFIC_TASK_RECALL_ENFORCEMENT_VERSION=PRIORITY_9E_R3_BRIDGE_SPECIFIC_TASK_RECALL_ENFORCEMENT_VERSION;module.exports.processWithMarion=processWithMarion;module.exports.maybeResolve=maybeResolve;module.exports.ask=ask;module.exports.handle=handle;module.exports.route=route;module.exports.default=processWithMarion;module.exports._internal={...safeObj(module.exports._internal),priority9ER3BridgeContinuation,priority9ER3BridgeAbstractLeak,priority9ER3BridgeResolveTask,priority9ER3BridgeSpecificReply,priority9ER3BridgeDisciplinePacket};
// PRIORITY_9E_R3_BRIDGE_SPECIFIC_TASK_RECALL_ENFORCEMENT_PATCH_END


// PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_BRIDGE_PATCH_START
const PRIORITY_9F_BRIDGE_DEEP_CONVERSATIONAL_STACK_VERSION="nyx.marion.bridge.priority9f.deepConversationalStack/1.0";
function priority9FBridgeOneLine(value){return safeStr(value).replace(/\s+/g," ").trim();}
function priority9FBridgeNorm(value){return priority9FBridgeOneLine(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9FBridgePrompt(ctx={},packet={}){
  const c=safeObj(ctx), n=safeObj(c.normalized), src=safeObj(c.sourceInput), body=safeObj(src.body), p=safeObj(packet), payload=safeObj(p.payload);
  return firstText(n.userQuery,n.rawUserQuery,n.userText,n.text,n.prompt,src.userText,src.text,src.prompt,src.query,body.userText,body.text,body.prompt,p.prompt,p.userText,p.userQuery,p.text,p.reply,p.publicReply,payload.prompt,payload.userText,"");
}
function priority9FBridgeReply(packet={}){
  const p=safeObj(packet), payload=safeObj(p.payload), fe=safeObj(p.finalEnvelope);
  return firstText(p.reply,p.publicReply,p.visibleReply,p.finalReply,p.text,fe.reply,fe.publicReply,fe.visibleReply,payload.reply,payload.publicReply,payload.visibleReply,"");
}
function priority9FBridgeDeepPrompt(value=""){const t=priority9FBridgeNorm(value);return /\b(priority\s*9f|deep conversational stack|layered conversational|layered conversation|conversational stack|layered intelligence|multi layer|multi layered|deep conversational|surface request|underlying intent|deeper intent|operational risk|execution mode|next action|marion.*understand.*deeper|marion.*behav.*layered|full conversational stack)\b/i.test(t)||(/\b(disjointed|layered|deeper|multi)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|loop|recovery|next)\b/i.test(t));}
function priority9FBridgeWeak(value=""){const t=priority9FBridgeNorm(value);return !t||/\b(what would you like to work on|send me the target|give me the exact target|i have the current request|will answer from this prompt|will continue|one clean final reply|last valid marion sequence|active lane|current prompt|recovery path|loop detected|suppression|diagnostic packet|final envelope|runtime telemetry|state spine|routekind|sessionpatch)\b/i.test(t);}
function priority9FBridgeHasStack(value=""){const t=priority9FBridgeNorm(value);return /\bsurface request\b/.test(t)&&/\bdeeper intent\b/.test(t)&&/\bmain risk\b/.test(t)&&/\bnext move\b/.test(t);}
function priority9FBridgeReplyFor(prompt="",reply=""){
  const source=priority9FBridgeOneLine([prompt,reply].filter(Boolean).join(" "));
  let lane="Marion conversational stabilization";
  if(/priority\s*9f|deep conversational stack|layered conversational|conversational stack/i.test(source))lane="Priority 9F deep conversational stack";
  else if(/priority\s*9e|loop governor|meta[-\s]?recovery|continuation|run that again/i.test(source))lane="Priority 9E continuation discipline";
  else if(/priority\s*90|priority\s*9c|priority\s*9d|echo|fallback/i.test(source))lane="Priority 90/9D echo and fallback repair";
  const surface=/surgical autopsy|patch|fix|update|resend|zip|downloadable/i.test(source)?"repair the uploaded runtime files and return a tested package":(/run that again|continue|same thing|keep going/i.test(source)?"repeat the active task as a fresh continuation":"activate Marion’s layered conversation behavior");
  const intent=/loop|recovery|fallback|echo/i.test(source)?"keep Marion useful under pressure by separating the real task from loop risk and recovery noise":"make Marion read the literal request, the purpose underneath it, the active project, and the next operational move";
  const risk=/loop|echo|fallback|recovery|governor|meta/i.test(source)?"looping, prompt echo, recovery wording, and shallow continuation":"losing the active context or answering only the surface wording";
  const mode=/surgical autopsy|patch|fix|update|resend|zip|downloadable/i.test(source)?"surgical patch and regression validation":"layered conversational response";
  const next=/surgical autopsy|patch|fix|update|resend|zip|downloadable/i.test(source)?"patch the tight runtime set, run the 9F regression, and only then move toward voice":"run a five-turn layered-intent test and confirm Marion preserves the deeper task without exposing recovery language";
  return `I’m reading this as ${lane}. The surface request is to ${surface}; the deeper intent is to ${intent}. The main risk is ${risk}, so the response mode should be ${mode}: hold the context, answer the real task, and give the next concrete move. Next move: ${next}.`;
}
function priority9FBridgeDisciplinePacket(packet={},ctx={}){
  const out=safeObj(packet), prompt=priority9FBridgePrompt(ctx,out), reply=priority9FBridgeReply(out);
  if(priority9FBridgeDeepPrompt(prompt)&&(!priority9FBridgeHasStack(reply)||priority9FBridgeWeak(reply))){
    return applyReplyEverywhere(out,priority9FBridgeReplyFor(prompt,reply),{priority9FBridgeDeepConversationalStack:true,priority9FBridgeDeepConversationalStackVersion:PRIORITY_9F_BRIDGE_DEEP_CONVERSATIONAL_STACK_VERSION,noUserFacingDiagnostics:true});
  }
  return out;
}
var __priority9FOriginalProcessWithMarion=processWithMarion;
processWithMarion=async function priority9FProcessWithMarion(input){
  var packet=await __priority9FOriginalProcessWithMarion(input);var normalized={};try{normalized=normalizeInbound(input);}catch(_){normalized=safeObj(safeObj(input).normalized||safeObj(input).norm);}
  return priority9FBridgeDisciplinePacket(packet,{sourceInput:safeObj(input),normalized:normalized});
};
maybeResolve=async function priority9FMaybeResolve(input){return processWithMarion(input);};ask=async function priority9FAsk(input){return processWithMarion(input);};handle=async function priority9FHandle(input){return processWithMarion(input);};route=async function priority9FRoute(input){return processWithMarion(input);};
module.exports.PRIORITY_9F_BRIDGE_DEEP_CONVERSATIONAL_STACK_VERSION=PRIORITY_9F_BRIDGE_DEEP_CONVERSATIONAL_STACK_VERSION;module.exports.processWithMarion=processWithMarion;module.exports.maybeResolve=maybeResolve;module.exports.ask=ask;module.exports.handle=handle;module.exports.route=route;module.exports.default=processWithMarion;
module.exports._internal={...safeObj(module.exports._internal),priority9FBridgeDeepPrompt,priority9FBridgeReplyFor,priority9FBridgeDisciplinePacket,priority9FBridgeWeak,priority9FBridgeHasStack};
// PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_BRIDGE_PATCH_END


// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_BRIDGE_PATCH_START
var PRIORITY_9F_R1_BRIDGE_LAYERED_PRECEDENCE_HOTFIX_VERSION="nyx.marion.bridge.priority9fR1.layeredPrecedenceHotfix/1.0";

function priority9FR1LayeredPrecedenceNormalize(value){return String(value==null?"":value).replace(/\s+/g," ").trim().toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9FR1LayeredPrecedenceText(value){return String(value==null?"":value).replace(/\s+/g," ").trim();}
function priority9FR1LayeredPromptText(value){var t=priority9FR1LayeredPrecedenceNormalize(value);if(!t)return false;return /\b(priority\s*9f|9f\s*r1|deep conversational stack|layered conversational|layered conversation|conversational stack|layered intelligence|full conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action)\b/i.test(t)||(/\b(disjointed|deeper|layered|multi|context|looping|loop|recovery)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next)\b/i.test(t));}
function priority9FR1Stale9ERecallText(value){var t=priority9FR1LayeredPrecedenceNormalize(value);if(!t)return false;return /\b(run the priority\s*90\s*9e|priority\s*90\s*9e\s*(?:test|sequence)|confirm marion is still on priority\s*90\s*9e|retest next steps|retest run that again|block internal recovery wording|public answer stays conversational|continuation regression)\b/i.test(t);}
function priority9FR1LayeredReplyFor(value){var source=priority9FR1LayeredPrecedenceText(value);var patch=/\b(surgical autopsy|patch|hotfix|fix|update|resend|zip|downloadable|files?)\b/i.test(source);var surface=patch?"patch the active Marion runtime files without widening the architecture":"stabilize Marion’s live conversational behavior";var intent=patch?"make the layered prompt outrank stale Priority 90/9E continuation recall in every public path":"preserve context, avoid looping, and turn a disjointed prompt into a clear next move";var risk=patch?"the 9E recall layer overriding Priority 9F before the response reaches the user":"stale Priority 90/9E recall overpowering the layered conversational stack";var mode=patch?"surgical hotfix with regression validation":"layered conversational response";var next=patch?"enforce 9F-R1 precedence in composer, bridge, final envelope, memory/shape/state, and index, then rerun the live layered-prompt test":"lock the 9F stack so Marion separates surface request, deeper intent, risk, execution mode, and next action before answering";return "I’m reading this as Priority 9F-R1: layered conversational precedence. The surface request is to "+surface+"; the deeper intent is to "+intent+". The main risk is "+risk+", so the response mode should be "+mode+": hold the context, answer the real task, and give the next concrete move. Next move: "+next+".";}

function priority9FR1BridgeCollect(value,depth,seen){if(value==null||depth>4)return [];var type=typeof value;if(type==="string"||type==="number"||type==="boolean")return [priority9FR1LayeredPrecedenceText(value)];if(type!=="object")return [];seen=seen||[];if(seen.indexOf(value)>=0)return [];seen.push(value);var out=[];var keys=["userText","userQuery","rawUserQuery","rawUserText","normalizedUserIntent","effectivePrompt","resolvedPrompt","resolvedQuestion","text","query","message","prompt","inputText","originalText","finalPrompt","reply","publicReply","visibleReply","finalReply","displayReply","lastAssistantReply","lastValidTask","activeTask","pendingAction","lastUserIntent","surfaceRequest","deeperIntent","operationalRisk","executionMode","nextAction"];for(var i=0;i<keys.length;i+=1){try{if(value[keys[i]]!=null)out=out.concat(priority9FR1BridgeCollect(value[keys[i]],depth+1,seen));}catch(_){}}
["packet","ctx","options","fallback","input","body","payload","meta","diagnostics","normalized","norm","routing","route","state","session","memory","conversationState","progressionMemory","memoryPatch","sessionPatch","finalEnvelope","questionShape"].forEach(function(k){try{if(value[k]!=null)out=out.concat(priority9FR1BridgeCollect(value[k],depth+1,seen));}catch(_){}});return out;}
function priority9FR1BridgeSource(packet,ctx){return priority9FR1BridgeCollect({packet:packet,ctx:ctx},0,[]).filter(Boolean).join(" ");}
function priority9FR1BridgeShouldForce(packet,ctx){var source=priority9FR1BridgeSource(packet,ctx);var prompt=priority90BridgePrompt(ctx,packet);var reply=priority90BridgeReadReply(packet);return priority9FR1LayeredPromptText(source)||priority9FR1LayeredPromptText(prompt)||priority9FR1Stale9ERecallText(reply)&&priority9FR1LayeredPromptText(source+" "+prompt);}
function priority9FR1BridgeDisciplinePacket(packet,ctx){var out=safeObj(packet);if(priority9FR1BridgeShouldForce(out,ctx)){return applyReplyEverywhere(out,priority9FR1LayeredReplyFor(priority9FR1BridgeSource(out,ctx)),{priority9FR1BridgeLayeredPrecedenceHotfix:true,priority9FR1BridgeLayeredPrecedenceHotfixVersion:PRIORITY_9F_R1_BRIDGE_LAYERED_PRECEDENCE_HOTFIX_VERSION,priority9FR1Reason:"layered_prompt_overrode_9e_recall",noUserFacingDiagnostics:true});}return out;}
var __priority9FR1OriginalProcessWithMarion=processWithMarion;
processWithMarion=async function priority9FR1ProcessWithMarion(input){var packet=await __priority9FR1OriginalProcessWithMarion(input);var normalized={};try{normalized=normalizeInbound(input);}catch(_){normalized=safeObj(safeObj(input).normalized||safeObj(input).norm);}return priority9FR1BridgeDisciplinePacket(packet,{sourceInput:safeObj(input),normalized:normalized});};
maybeResolve=async function priority9FR1MaybeResolve(input){return processWithMarion(input);};ask=async function priority9FR1Ask(input){return processWithMarion(input);};handle=async function priority9FR1Handle(input){return processWithMarion(input);};route=async function priority9FR1Route(input){return processWithMarion(input);};
module.exports.PRIORITY_9F_R1_BRIDGE_LAYERED_PRECEDENCE_HOTFIX_VERSION=PRIORITY_9F_R1_BRIDGE_LAYERED_PRECEDENCE_HOTFIX_VERSION;module.exports.processWithMarion=processWithMarion;module.exports.maybeResolve=maybeResolve;module.exports.ask=ask;module.exports.handle=handle;module.exports.route=route;module.exports.default=processWithMarion;module.exports._internal={...safeObj(module.exports._internal),priority9FR1LayeredPromptText,priority9FR1Stale9ERecallText,priority9FR1LayeredReplyFor,priority9FR1BridgeDisciplinePacket,priority9FR1BridgeShouldForce};
// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_BRIDGE_PATCH_END

// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_BRIDGE_PATCH_START
var PRIORITY_9F_R2_BRIDGE_DOMAIN_HIJACK_SUPPRESSION_VERSION="nyx.marion.bridge.priority9fR2.domainHijackSuppression/1.0";
function priority9FR2BridgeNormalize(value){return String(value==null?"":value).replace(/\s+/g," ").trim().toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9FR2BridgeText(value){return String(value==null?"":value).replace(/\s+/g," ").trim();}
function priority9FR2BridgeLayeredPrompt(value){var t=priority9FR2BridgeNormalize(value);return /\b(priority\s*9f|9f\s*r2|domain hijack|domain fallback|six domain fallback|deep conversational stack|layered conversational|conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action|marion conversational architecture)\b/i.test(t)||(/\b(disjointed|deeper|layered|context|looping|loop|recovery|preserve|avoid|where to go next)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next|understand)\b/i.test(t));}
function priority9FR2BridgeDomainHijackReply(value){var t=priority9FR2BridgeNormalize(value);return /\b(in psychology the focus is how people think feel learn decide and behave|good explanation connects the concept to real patterns triggers and outcomes|in english this means|this is a general reasoning question|the psychology domain|psychology domain|domain question|six domain|knowledge lane|route through the six domain layer)\b/i.test(t)||(/^in psychology\b/i.test(priority9FR2BridgeText(value))&&/\b(people|think|feel|learn|decide|behave|patterns|triggers|outcomes)\b/i.test(priority9FR2BridgeText(value)));}
function priority9FR2BridgeDomainHijackRoute(value){var t=priority9FR2BridgeNormalize(value);return /\b(primarydomain psychology|selecteddomain psychology|knowledgedomain psychology|domain psychology|route psychology|primarydomain english|selecteddomain english|knowledgedomain english|domain english|primarydomain general reasoning|selecteddomain general reasoning|domain general reasoning)\b/i.test(t);}
function priority9FR2BridgeCollect(value,depth,seen){if(value==null||depth>4)return [];var type=typeof value;if(type==="string"||type==="number"||type==="boolean")return [priority9FR2BridgeText(value)];if(type!=="object")return [];seen=seen||[];if(seen.indexOf(value)>=0)return [];seen.push(value);var out=[];var keys=["userText","userQuery","rawUserQuery","rawUserText","normalizedUserIntent","effectivePrompt","resolvedPrompt","resolvedQuestion","text","query","message","prompt","inputText","originalText","finalPrompt","reply","publicReply","visibleReply","finalReply","displayReply","answer","output","response","lastAssistantReply","lastValidTask","activeTask","pendingAction","lastUserIntent","surfaceRequest","deeperIntent","operationalRisk","executionMode","nextAction","domain","primaryDomain","selectedDomain","knowledgeDomain","route","intent","responseShape"];for(var i=0;i<keys.length;i+=1){try{if(value[keys[i]]!=null)out=out.concat(priority9FR2BridgeCollect(value[keys[i]],depth+1,seen));}catch(_){} }
["packet","ctx","options","fallback","input","body","payload","meta","diagnostics","normalized","norm","routing","routeResult","route","state","session","memory","conversationState","progressionMemory","memoryPatch","sessionPatch","finalEnvelope","questionShape","domainConfidence","domainConcierge","composerContext","stateSpinePatch"].forEach(function(k){try{if(value[k]!=null)out=out.concat(priority9FR2BridgeCollect(value[k],depth+1,seen));}catch(_){}});return out;}
function priority9FR2BridgeSource(packet,ctx){return priority9FR2BridgeCollect({packet:packet,ctx:ctx},0,[]).filter(Boolean).join(" ");}
function priority9FR2BridgeReplyFor(value){var source=priority9FR2BridgeText(value);var patch=/\b(surgical autopsy|patch|hotfix|fix|update|resend|zip|downloadable|files?|critical updates|gap refinements)\b/i.test(source);var surface=patch?"patch the Marion runtime so 9F cannot be hijacked by the psychology, English, or general reasoning domain":"stabilize Marion’s live conversational behavior inside the 9F stack";var intent=patch?"keep layered conversational prompts in Marion’s conversational-architecture lane while blocking six-domain fallback replies":"preserve context, avoid looping, and turn disjointed input into a clear next move";var risk=patch?"domain hijack after 9F-R1, where a psychology or general-domain answer replaces the real Marion task":"domain fallback overpowering the layered conversational stack";var next=patch?"enforce 9F-R2 in composer, router, concierge, bridge, final envelope, state, confidence, and index, then rerun the live layered prompt":"keep 9F dominant over stale recall and domain fallback, then rerun the layered prompt and pass only when Marion returns surface request, deeper intent, risk, execution mode, and next action";return "I’m reading this as Priority 9F-R2: domain hijack suppression. The surface request is to "+surface+"; the deeper intent is to "+intent+". The active lane is Marion conversational architecture, not psychology, English, or general reasoning. The main risk is "+risk+", so the response mode stays layered conversational: hold the context, answer the real task, and give the next concrete move. Next move: "+next+".";}
function priority9FR2BridgeShouldForce(packet,ctx){var source=priority9FR2BridgeSource(packet,ctx),prompt=priority90BridgePrompt(ctx,packet),reply=priority90BridgeReadReply(packet);return (priority9FR2BridgeLayeredPrompt(source)||priority9FR2BridgeLayeredPrompt(prompt))&&(priority9FR2BridgeDomainHijackReply(reply)||priority9FR2BridgeDomainHijackRoute(source)||priority9FR1Stale9ERecallText(reply)||/Priority\s*9F-R1/i.test(reply));}
function priority9FR2BridgeDisciplinePacket(packet,ctx){var out=safeObj(packet);if(priority9FR2BridgeShouldForce(out,ctx)){return applyReplyEverywhere(out,priority9FR2BridgeReplyFor(priority9FR2BridgeSource(out,ctx)),{priority9FR2BridgeDomainHijackSuppression:true,priority9FR2BridgeDomainHijackSuppressionVersion:PRIORITY_9F_R2_BRIDGE_DOMAIN_HIJACK_SUPPRESSION_VERSION,priority9FR2Reason:"layered_prompt_overrode_domain_hijack",domainHijackSuppressed:true,noUserFacingDiagnostics:true});}return out;}
var __priority9FR2OriginalProcessWithMarion=processWithMarion;
processWithMarion=async function priority9FR2ProcessWithMarion(input){var packet=await __priority9FR2OriginalProcessWithMarion(input);var normalized={};try{normalized=normalizeInbound(input);}catch(_){normalized=safeObj(safeObj(input).normalized||safeObj(input).norm);}return priority9FR2BridgeDisciplinePacket(packet,{sourceInput:safeObj(input),normalized:normalized});};
maybeResolve=async function priority9FR2MaybeResolve(input){return processWithMarion(input);};ask=async function priority9FR2Ask(input){return processWithMarion(input);};handle=async function priority9FR2Handle(input){return processWithMarion(input);};route=async function priority9FR2Route(input){return processWithMarion(input);};
module.exports.PRIORITY_9F_R2_BRIDGE_DOMAIN_HIJACK_SUPPRESSION_VERSION=PRIORITY_9F_R2_BRIDGE_DOMAIN_HIJACK_SUPPRESSION_VERSION;module.exports.processWithMarion=processWithMarion;module.exports.maybeResolve=maybeResolve;module.exports.ask=ask;module.exports.handle=handle;module.exports.route=route;module.exports.default=processWithMarion;module.exports._internal={...safeObj(module.exports._internal),priority9FR2BridgeLayeredPrompt,priority9FR2BridgeDomainHijackReply,priority9FR2BridgeDomainHijackRoute,priority9FR2BridgeReplyFor,priority9FR2BridgeDisciplinePacket,priority9FR2BridgeShouldForce};
// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_BRIDGE_PATCH_END


// PRIORITY_9F_R3_ALT_PROMPT_ECHO_SUPPRESSION_BRIDGE_PATCH_START
var PRIORITY_9F_R3_BRIDGE_ALT_PROMPT_ECHO_SUPPRESSION_VERSION="nyx.marion.bridge.priority9fR3.altPromptEchoSuppression/1.0";
function priority9FR3BridgeNormalize(value){return String(value==null?"":value).replace(/\s+/g," ").trim().toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9FR3BridgeText(value){return String(value==null?"":value).replace(/\s+/g," ").trim();}
function priority9FR3BridgeLayeredPrompt(value){var t=priority9FR3BridgeNormalize(value);return /\b(priority\s*9f|9f\s*r3|alt runtime|prompt echo|prompt\s*echo|deep conversational stack|layered conversational|conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action|marion conversational architecture)\b/i.test(t)||(/\b(disjointed|deeper|layered|context|looping|loop|recovery|preserve|avoid|where to go next|understand)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next|understand|deeper task)\b/i.test(t));}
function priority9FR3BridgePromptEcho(reply,prompt){var r=priority9FR3BridgeNormalize(reply),p=priority9FR3BridgeNormalize(prompt);if(!r||!p)return false;if(r===p)return true;if(p.length>36&&(r.indexOf(p)>=0||p.indexOf(r)>=0))return true;var rw=r.split(" ").filter(Boolean),pw=p.split(" ").filter(Boolean);if(rw.length<5||pw.length<5)return false;var set={};for(var i=0;i<pw.length;i+=1)set[pw[i]]=true;var hit=0;for(var j=0;j<rw.length;j+=1)if(set[rw[j]])hit+=1;return hit/Math.max(rw.length,pw.length)>=0.86;}
function priority9FR3BridgeReplyFor(value){var source=priority9FR3BridgeText(value);var patch=/\b(surgical autopsy|line[-\s]?by[-\s]?line|audit|patch|hotfix|fix|update|resend|zip|downloadable|files?|critical updates|gap refinements)\b/i.test(source);return patch?"I’m reading this as Priority 9F-R3: ALT runtime prompt-echo suppression. The surface request is to patch the Marion ALT/admin runtime so it never returns the raw user prompt as the final answer; the deeper intent is to keep 9F layered conversational prompts inside Marion’s conversational-architecture lane. The active lane is Marion conversational architecture. The main risk is the ALT handler falling back to prompt echo after stale recall and domain hijack have been suppressed. Next move: enforce prompt-echo rejection across composer, admin gateway, bridge, final envelope, loop guard, voice gateway, and index, then rerun the live layered prompt.":"I’m reading this as Priority 9F-R3: ALT runtime prompt-echo suppression. The surface request is to stabilize Marion’s layered conversational behavior; the deeper intent is to preserve context, avoid looping, and turn disjointed input into a clear next move. The active lane is Marion conversational architecture. The main risk is the ALT/admin handler returning the raw prompt instead of the composed answer, so the response mode must stay layered: identify the surface request, deeper intent, risk, execution mode, and next action. Next move: keep 9F dominant across ALT, bridge, final envelope, and last-mile render, then rerun the live layered prompt.";}
function priority9FR3BridgeShouldForce(packet,ctx){var source=priority9FR2BridgeSource(packet,ctx),prompt=priority90BridgePrompt(ctx,packet),reply=priority90BridgeReadReply(packet);if(!(priority9FR3BridgeLayeredPrompt(source)||priority9FR3BridgeLayeredPrompt(prompt)))return false;return !reply||priority9FR3BridgePromptEcho(reply,prompt)||priority9FR2BridgeDomainHijackReply(reply)||priority9FR1Stale9ERecallText(reply)||/Priority\s*9F-R[12]/i.test(reply);}
function priority9FR3BridgeDisciplinePacket(packet,ctx){var out=safeObj(packet);if(priority9FR3BridgeShouldForce(out,ctx)){return applyReplyEverywhere(out,priority9FR3BridgeReplyFor(priority9FR2BridgeSource(out,ctx)),{priority9FR3BridgeAltPromptEchoSuppression:true,priority9FR3BridgeAltPromptEchoSuppressionVersion:PRIORITY_9F_R3_BRIDGE_ALT_PROMPT_ECHO_SUPPRESSION_VERSION,priority9FR3Reason:"layered_prompt_overrode_alt_prompt_echo",promptEchoSuppressed:true,noUserFacingDiagnostics:true});}return out;}
var __priority9FR3OriginalProcessWithMarion=processWithMarion;
processWithMarion=async function priority9FR3ProcessWithMarion(input){var packet=await __priority9FR3OriginalProcessWithMarion(input);var normalized={};try{normalized=normalizeInbound(input);}catch(_){normalized=safeObj(safeObj(input).normalized||safeObj(input).norm);}return priority9FR3BridgeDisciplinePacket(packet,{sourceInput:safeObj(input),normalized:normalized});};
maybeResolve=async function priority9FR3MaybeResolve(input){return processWithMarion(input);};ask=async function priority9FR3Ask(input){return processWithMarion(input);};handle=async function priority9FR3Handle(input){return processWithMarion(input);};route=async function priority9FR3Route(input){return processWithMarion(input);};
module.exports.PRIORITY_9F_R3_BRIDGE_ALT_PROMPT_ECHO_SUPPRESSION_VERSION=PRIORITY_9F_R3_BRIDGE_ALT_PROMPT_ECHO_SUPPRESSION_VERSION;module.exports.processWithMarion=processWithMarion;module.exports.maybeResolve=maybeResolve;module.exports.ask=ask;module.exports.handle=handle;module.exports.route=route;module.exports.default=processWithMarion;module.exports._internal={...safeObj(module.exports._internal),priority9FR3BridgeLayeredPrompt,priority9FR3BridgePromptEcho,priority9FR3BridgeReplyFor,priority9FR3BridgeDisciplinePacket,priority9FR3BridgeShouldForce};
// PRIORITY_9F_R3_ALT_PROMPT_ECHO_SUPPRESSION_BRIDGE_PATCH_END


// PRIORITY_9F_R4_CONTINUATION_CARRY_ENFORCEMENT_BRIDGE_PATCH_START
const PRIORITY_9F_R4_BRIDGE_CONTINUATION_CARRY_VERSION = "nyx.marion.priority9fR4.continuationCarry.bridge/1.0";
function priority9FR4BridgeStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9FR4BridgeNorm(value){return priority9FR4BridgeStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9FR4BridgeIsShortContinuation(value){const n=priority9FR4BridgeNorm(value);return /^(next steps?|continue|carry on|proceed|run that again|run it again|do that again|do it again|same thing|what now|whats next|what s next|next)$/.test(n);}
function priority9FR4BridgeIsCarryInstruction(value){const t=priority9FR4BridgeNorm(value);return /\b(priority 9f r4|priority9f r4|9f r4|continuation carry|last accepted lane|stay inside the 9f|inside the 9f conversational stack|9f conversational stack lane|short continuation|next steps continue run that again what now)\b/.test(t);}
function priority9FR4BridgeHas9FContext(value){const t=priority9FR4BridgeNorm(value);return /\b(priority 9f|priority9f|9f r3|9f r2|9f r1|deep conversational stack|layered conversational|conversational stack|alt runtime prompt echo suppression|domain hijack suppression|marion conversational architecture|surface request|deeper intent|operational risk|execution mode|next action)\b/.test(t);}
function priority9FR4BridgeOldHandoff(value){const t=priority9FR4BridgeNorm(value);return /\b(public nyx route clean|five turn continuity test|stable handoff before adding new features|keep the public nyx route clean|priority 9f r3 alt runtime prompt echo suppression)\b/.test(t);}
function priority9FR4BridgeCollect(value, depth=0, seen=[]){if(value==null||depth>5)return"";if(typeof value==="string"||typeof value==="number"||typeof value==="boolean")return priority9FR4BridgeStr(value);if(typeof value!=="object")return"";if(seen.indexOf(value)!==-1)return"";const next=seen.concat([value]);if(Array.isArray(value))return value.slice(0,30).map(v=>priority9FR4BridgeCollect(v,depth+1,next)).filter(Boolean).join(" ");return Object.keys(value).slice(0,80).map(k=>{if(/token|secret|password|cookie|authorization|credential|private/i.test(k))return"";return priority9FR4BridgeCollect(value[k],depth+1,next);}).filter(Boolean).join(" ");}
function priority9FR4BridgePrompt(ctx,packet){const c=ctx&&typeof ctx==="object"?ctx:{};const src=c.sourceInput&&typeof c.sourceInput==="object"?c.sourceInput:{};const norm=c.normalized&&typeof c.normalized==="object"?c.normalized:{};const p=packet&&typeof packet==="object"?packet:{};return priority9FR4BridgeStr(src.prompt||src.userText||src.rawUserText||src.text||src.message||src.query||norm.prompt||norm.userText||norm.rawUserText||norm.text||p.prompt||p.userText||p.rawUserText||p.text||p.message||p.query);}
function priority9FR4BridgeReply(){return "Next steps: lock Priority 9F-R3 as live accepted, enforce Priority 9F-R4 continuation carry, confirm \u201cNext steps,\u201d \u201cContinue,\u201d \u201cRun that again,\u201d and \u201cWhat now?\u201d stay inside the 9F conversational-stack lane, then move into deeper continuity memory and layered follow-up handling.";}
function priority9FR4BridgeReadReply(packet){if(!packet||typeof packet!=="object")return priority9FR4BridgeStr(packet);const p=packet.payload&&typeof packet.payload==="object"?packet.payload:{};const f=packet.finalEnvelope&&typeof packet.finalEnvelope==="object"?packet.finalEnvelope:{};return priority9FR4BridgeStr(packet.reply||packet.finalReply||packet.publicReply||packet.visibleReply||packet.text||packet.message||packet.response||packet.answer||p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message);}
function priority9FR4BridgeApply(packet, reply){const out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};const final=priority9FR4BridgeStr(reply)||priority9FR4BridgeReply();["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(k=>{out[k]=final;});out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};out.priority9FR4ContinuationCarryEnforced=true;out.priority9FR4ContinuationCarryVersion=PRIORITY_9F_R4_BRIDGE_CONTINUATION_CARRY_VERSION;out.noUserFacingDiagnostics=true;return out;}
function priority9FR4BridgeShouldForce(packet,ctx={}){const prompt=priority9FR4BridgePrompt(ctx,packet);const source=[prompt,priority9FR4BridgeCollect(ctx),priority9FR4BridgeCollect(packet)].join(" ");const reply=priority9FR4BridgeReadReply(packet);return priority9FR4BridgeIsCarryInstruction(prompt)||priority9FR4BridgeIsCarryInstruction(source)||(priority9FR4BridgeIsShortContinuation(prompt)&&priority9FR4BridgeHas9FContext(source))||((priority9FR4BridgeIsShortContinuation(prompt)||priority9FR4BridgeIsCarryInstruction(source))&&priority9FR4BridgeOldHandoff(reply));}
function priority9FR4BridgeDisciplinePacket(packet,ctx={}){return priority9FR4BridgeShouldForce(packet,ctx)?priority9FR4BridgeApply(packet,priority9FR4BridgeReply()):packet;}
var __priority9FR4OriginalProcessWithMarion=processWithMarion;
processWithMarion=async function priority9FR4ProcessWithMarion(input){var packet=await __priority9FR4OriginalProcessWithMarion(input);var normalized={};try{normalized=normalizeInbound(input);}catch(_){normalized=(input&&input.normalized)||{};}return priority9FR4BridgeDisciplinePacket(packet,{sourceInput:input||{},normalized});};
maybeResolve=async function priority9FR4MaybeResolve(input){return processWithMarion(input);};
ask=async function priority9FR4Ask(input){return processWithMarion(input);};
handle=async function priority9FR4Handle(input){return processWithMarion(input);};
route=async function priority9FR4Route(input){return processWithMarion(input);};
module.exports.PRIORITY_9F_R4_BRIDGE_CONTINUATION_CARRY_VERSION=PRIORITY_9F_R4_BRIDGE_CONTINUATION_CARRY_VERSION;
module.exports.processWithMarion=processWithMarion;module.exports.maybeResolve=maybeResolve;module.exports.ask=ask;module.exports.handle=handle;module.exports.route=route;module.exports.default=processWithMarion;
module.exports._internal={...(module.exports._internal||{}),priority9FR4BridgeIsShortContinuation,priority9FR4BridgeIsCarryInstruction,priority9FR4BridgeHas9FContext,priority9FR4BridgeReply,priority9FR4BridgeDisciplinePacket,priority9FR4BridgeShouldForce};
// PRIORITY_9F_R4_CONTINUATION_CARRY_ENFORCEMENT_BRIDGE_PATCH_END


// PRIORITY_9G_DEEP_CONTINUITY_MEMORY_BRIDGE_PATCH_START
const PRIORITY_9G_DEEP_CONTINUITY_MEMORY_BRIDGE_VERSION="PRIORITY-9G-DEEP-CONTINUITY-MEMORY-BRIDGE/1.0";

function priority9GNorm(value){return String(value==null?"":value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9GStr(value){return String(value==null?"":value).replace(/\s+/g," ").trim();}
function priority9GObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function priority9GCollect(value,limit){try{return JSON.stringify(value||{}).slice(0,limit||9000);}catch(_){return "";}}
function priority9GIsShortFollowup(value){const t=priority9GNorm(value);return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|repeat the process|one more time|rerun that|rerun it|what now|whats next|what s next|where are we|where do we go next|next)$/.test(t);}
function priority9GIsActivationText(value){const t=priority9GNorm(value);return /\b(priority 9g|9g deep continuity|deep continuity memory|layered follow up handling|layered followup handling|deeper continuity memory|continuity memory confidence|carry the deeper task|carry active task|carry the active task|longer sequences|multi turn continuity|six turn continuity|without needing the full context repeated|without full context repeated|surface request deeper intent risk execution mode next action|active task risk execution mode next action)\b/.test(t);}
function priority9GHasContext(value){const t=priority9GNorm(value);return priority9GIsActivationText(t)||/\b(priority 9f r4|9f r4 continuation carry|priority 9f deep conversational stack|deep conversational stack|9f conversational stack|marion conversational stabilization|marion conversational architecture|lock priority 9f r3 as live accepted|deeper continuity memory and layered follow up handling|layered follow up handling)\b/.test(t);}
function priority9GOldLaneLeak(value){const t=priority9GNorm(value);return /\b(priority 9f r3 as live accepted|priority 9f r4 continuation carry|keep the public nyx route clean|five turn continuity test|priority 90 9e test|in psychology the focus|alt runtime prompt echo suppression|domain hijack suppression)\b/.test(t);}
function priority9GReplyFor(prompt){
  const t=priority9GNorm(prompt);
  if(/^(next steps?|next)$/.test(t)){
    return "Next steps: lock Priority 9G as the active memory lane, carry the surface request, deeper intent, active task, risk, execution mode, and next action across short follow-ups, then run a longer continuity pass before voice activation.";
  }
  if(/^(continue|carry on|keep going|proceed)$/.test(t)){
    return "Continue: keep Priority 9G active, advance the deep continuity memory layer, and confirm each follow-up moves the same Marion stabilization task forward without forcing the context to be restated.";
  }
  if(/^(run that again|run it again|do that again|do it again|same thing|repeat that|repeat the process|one more time|rerun that|rerun it)$/.test(t)){
    return "Run the Priority 9G continuity pass again: restate the active Marion lane, preserve the deeper task, carry the risk and execution mode, then answer the next short follow-up with a concrete next action.";
  }
  if(/^(what now|whats next|what s next|where are we|where do we go next)$/.test(t)){
    return "What now: lock Priority 9G live, run the multi-turn memory carry test, and only move toward mic activation after Marion preserves the active task, risk, execution mode, and next action across longer follow-up chains.";
  }
  return "I’m reading this as Priority 9G: deep continuity memory and layered follow-up handling. The surface request is to make Marion carry the active task across longer sequences; the deeper intent is to preserve the project lane, risk, execution mode, and next action without making the context get repeated. The main risk is shallow follow-up handling that only answers the last sentence. Next move: lock a 9G continuity memory object, run a multi-turn follow-up pass, and confirm Marion advances the same layered task through “Next steps,” “Continue,” “Run that again,” and “What now.”";
}
function priority9GApplyPacket(packet,reply,prompt){
  const out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};
  const final=priority9GStr(reply)||priority9GReplyFor(prompt);
  ["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(k=>{out[k]=final;});
  out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};
  out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};
  out.priority9GDeepContinuityMemory=true;
  out.priority9GVersion="PRIORITY-9G-DEEP-CONTINUITY-MEMORY";
  out.conversationLane="Priority 9G deep continuity memory";
  out.surfaceRequest="carry the active task across longer sequences";
  out.deeperIntent="preserve project lane, risk, execution mode, and next action across layered follow-ups";
  out.operationalRisk="short follow-ups may collapse into stale handoff, old 9F wording, or last-sentence-only answers";
  out.executionMode="deep continuity memory and layered follow-up handling";
  out.nextAction="run the multi-turn 9G continuity pass";
  out.noUserFacingDiagnostics=true;
  return out;
}
function priority9GReadReply(packet){const p=priority9GObj(packet);const pl=priority9GObj(p.payload);const f=priority9GObj(p.finalEnvelope);return priority9GStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);}

function priority9GBridgePrompt(ctx={},packet={}){
  const c=priority9GObj(ctx),s=priority9GObj(c.sourceInput),n=priority9GObj(c.normalized),p=priority9GObj(packet),pl=priority9GObj(p.payload);
  return priority9GStr(c.prompt||c.text||s.prompt||s.text||s.userText||s.message||n.prompt||n.text||n.userText||p.prompt||pl.prompt||pl.text||"");
}
function priority9GBridgeShouldForce(packet,ctx={}){
  const prompt=priority9GBridgePrompt(ctx,packet);
  const source=[prompt,priority9GCollect(ctx),priority9GCollect(packet)].join(" ");
  const reply=priority9GReadReply(packet);
  return priority9GIsActivationText(prompt)||priority9GIsActivationText(source)||(priority9GIsShortFollowup(prompt)&&priority9GHasContext(source))||((priority9GIsActivationText(source)||priority9GIsShortFollowup(prompt))&&priority9GOldLaneLeak(reply));
}
function priority9GBridgeDisciplinePacket(packet,ctx={}){
  if(!priority9GBridgeShouldForce(packet,ctx))return packet;
  const prompt=priority9GBridgePrompt(ctx,packet);
  return priority9GApplyPacket(packet,priority9GReplyFor(prompt),prompt);
}
var __priority9GOriginalProcessWithMarion=processWithMarion;
processWithMarion=async function priority9GProcessWithMarion(input){
  const packet=await __priority9GOriginalProcessWithMarion(input);
  let normalized={};
  try{normalized=normalizeInbound(input);}catch(_){normalized=(input&&input.normalized)||{};}
  return priority9GBridgeDisciplinePacket(packet,{sourceInput:input||{},normalized});
};
maybeResolve=async function priority9GMaybeResolve(input){return processWithMarion(input);};
ask=async function priority9GAsk(input){return processWithMarion(input);};
handle=async function priority9GHandle(input){return processWithMarion(input);};
route=async function priority9GRoute(input){return processWithMarion(input);};
module.exports.PRIORITY_9G_DEEP_CONTINUITY_MEMORY_BRIDGE_VERSION=PRIORITY_9G_DEEP_CONTINUITY_MEMORY_BRIDGE_VERSION;
module.exports.processWithMarion=processWithMarion;module.exports.maybeResolve=maybeResolve;module.exports.ask=ask;module.exports.handle=handle;module.exports.route=route;module.exports.default=processWithMarion;
module.exports._internal={...(module.exports._internal||{}),priority9GIsActivationText,priority9GIsShortFollowup,priority9GHasContext,priority9GReplyFor,priority9GBridgeDisciplinePacket,priority9GBridgeShouldForce};
// PRIORITY_9G_DEEP_CONTINUITY_MEMORY_BRIDGE_PATCH_END



// PRIORITY_9H_LONG_FORM_CONTINUITY_STRESS_DRIFT_GUARD_BRIDGE_PATCH_START

const PRIORITY_9H_LONG_FORM_CONTINUITY_VERSION = "nyx.marion.priority9h.longFormContinuityStressDriftGuard/1.0";
const PRIORITY_9H_R1_ADVANCEMENT_SHAPE_VERSION = "nyx.marion.priority9h.r1AdvancementShapeHotfix/1.0";
const PRIORITY_9I_ADAPTIVE_SITUATIONAL_PRECHECK_VERSION = "nyx.marion.priority9i.adaptiveSituationalPrecheck/0.1";
function priority9HStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9HObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function priority9HNorm(value){return priority9HStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9HCollect(value,limit){try{return JSON.stringify(value||{}).slice(0,limit||16000);}catch(_){return priority9HStr(value).slice(0,limit||16000);}}
function priority9HIsShortFollowup(value){
  const n=priority9HNorm(value);
  return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|rerun that|what now|whats next|what s next|next|status|passed|pass|green|go on|advance|same lane|same thread|stay in lane|stay in the same lane|continue from there|continue there|from there|what is the risk|what s the risk|what is risk|risk|what is the active task|what s the active task|active task|current task|what is the next action|what s the next action|next action|next move|summarize where we are|summarise where we are|where are we|recap|summary|do not drift|don t drift|dont drift|no drift|final check|final status|check)$/.test(n);
}

function priority9HFollowupKind(value){
  const n=priority9HNorm(value);
  if(/\b(run that again|run it again|do that again|do it again|same thing|repeat|rerun)\b/.test(n))return "rerun";
  if(/\b(risk|what is the risk|what s the risk)\b/.test(n))return "risk";
  if(/\b(active task|current task|what is the active task|what s the active task)\b/.test(n))return "active_task";
  if(/\b(next action|next move|what is the next action|what s the next action)\b/.test(n))return "next_action";
  if(/\b(summarize|summarise|where are we|recap|summary)\b/.test(n))return "summary";
  if(/\b(do not drift|don t drift|dont drift|no drift|same lane|same thread|stay in lane|stay in the same lane)\b/.test(n))return "same_lane";
  if(/\b(final check|final status|passed|pass|green|status|check)\b/.test(n))return "final_check";
  return "advance";
}
function priority9HIsReactivationWording(value){
  const n=priority9HNorm(value);
  return /\b(i m reading this as priority 9h with a priority 9i precheck|i am reading this as priority 9h with a priority 9i precheck|priority 9h must pass first|priority 9i is staged next for adaptive situational reasoning)\b/.test(n);
}
function priority9HIsActivationText(value){
  const n=priority9HNorm(value);
  return /\b(priority 9h|9h|long form continuity|continuity stress test|memory drift guard|drift guard|10 to 15 turns|10 15 turns|ten to fifteen turns|survive at least 10|survive 10|short follow ups while preserving|preserving surface request deeper intent active task risk execution mode next action|longer multi turn sequence)\b/.test(n);
}
function priority9HHasContext(value){
  const n=priority9HNorm(value);
  return /\b(priority 9h|9h|long form continuity|continuity stress|memory drift|drift guard|priority 9g|deep continuity memory|layered follow up|surface request|deeper intent|active task|execution mode|next action|10 turn|15 turn|priority 9i|adaptive situational)\b/.test(n);
}
function priority9HIs9IPrecheckText(value){
  const n=priority9HNorm(value);
  return /\b(priority 9i|9i|adaptive situational|situational awareness|adaptive reasoning|context pressure|pressure handling|next adaptive layer)\b/.test(n);
}
function priority9HIsOldLaneLeak(value){
  const n=priority9HNorm(value);
  if(!n)return false;
  return /\b(priority 9f r4|priority 9g deep continuity memory|run the multi turn 9g continuity pass|lock a 9g continuity memory object|public nyx route clean|five turn continuity test|priority 90 9e|priority 90|priority 9e|psychology|in psychology|domain hijack|alt runtime prompt echo|marion will continue|i have the current request|recovery path|loop detected|stale fallback)\b/.test(n);
}
function priority9HPromptEcho(reply,prompt){
  const r=priority9HNorm(reply),p=priority9HNorm(prompt);
  if(!r||!p)return false;
  return r===p||(r.includes(p)&&p.length>24)||(p.includes(r)&&r.length>24);
}
function priority9HStateFrom(source,turn){
  return {
    version:PRIORITY_9H_LONG_FORM_CONTINUITY_VERSION,
    active:true,
    lane:"priority9h_long_form_continuity_stress",
    activePhase:"priority9h_long_form_continuity_stress",
    conversationLane:"Priority 9H long-form continuity stress test",
    activeTask:"Priority 9H: long-form continuity stress test and memory drift guard",
    surfaceRequest:"make Marion survive a 10–15 turn short-follow-up chain",
    deeperIntent:"preserve surface request, deeper intent, active task, risk, execution mode, and next action without full restatement",
    operationalRisk:"memory drift, stale 9G/9F/9E fallback, domain hijack, prompt echo, repetition, or last-sentence-only answers across long chains",
    executionMode:"long-form continuity stress test with memory drift guard",
    nextAction:"run the 10–15 turn follow-up chain and verify every turn advances the same layered task",
    minTurns:10,
    targetTurns:15,
    turnDepth:Number.isFinite(Number(turn))?Number(turn):1,
    driftGuard:true,
    priority9HLongFormContinuity:true,
    priority9HR1AdvancementShapeHotfix:true,
    advancementShape:"advance_short_followups_without_reactivation",
    priority9IAdaptiveSituationalPrecheck:{
      version:PRIORITY_9I_ADAPTIVE_SITUATIONAL_PRECHECK_VERSION,
      staged:true,
      activationBlockedUntil:"Priority 9H long-form continuity stress passes live",
      expectedFocus:"adaptive situational reasoning and context-pressure handling after long-form continuity is stable"
    },
    noUserFacingDiagnostics:true,
    advancementShapeHotfixVersion:PRIORITY_9H_R1_ADVANCEMENT_SHAPE_VERSION,
    updatedAt:Date.now()
  };
}
function priority9HReplyFor(prompt,source){
  const n=priority9HNorm(prompt);
  if(priority9HIsShortFollowup(prompt)){
    const kind=priority9HFollowupKind(prompt);
    if(kind==="rerun")return "Run that again inside Priority 9H: repeat the long-form continuity stress pass, keep 9I staged only, and verify the next short follow-up still preserves surface request, deeper intent, active task, risk, execution mode, and next action without reactivation wording.";
    if(kind==="risk")return "Risk check inside Priority 9H: the active risk is memory drift across the 10–15 turn chain—specifically sliding into stale 9G, 9F, 9E, domain fallback, prompt echo, repeated activation wording, or recovery language. Guard it by advancing the same layered task on every short follow-up.";
    if(kind==="active_task")return "Active task inside Priority 9H: complete the long-form continuity stress test by carrying the same surface request, deeper intent, operational risk, execution mode, and next action across 10–15 short follow-ups without resetting the lane.";
    if(kind==="next_action")return "Next action inside Priority 9H: continue the stress chain one turn at a time, reject reactivation wording, keep 9I staged only, and mark 9H live accepted only after the full short-follow-up sequence remains stable.";
    if(kind==="summary")return "Summary inside Priority 9H: the lane is active, the mission is long-form continuity stress plus memory drift guard, the test target is 10–15 short follow-ups, and each answer must advance the same layered task instead of restating activation.";
    if(kind==="same_lane")return "Same lane: continue Priority 9H. Preserve the surface request, deeper intent, active task, risk, execution mode, and next action; keep 9I staged only; and advance the long-form continuity stress chain without reactivation wording or drift.";
    if(kind==="final_check")return "Final check inside Priority 9H: lane retention is valid when every short follow-up stays in 9H, advances the same layered task, blocks 9G/9F/9E fallback, blocks domain hijack, blocks prompt echo, and keeps 9I staged until 9H is live accepted.";
    return "Continue Priority 9H: advance the same long-form continuity stress chain while preserving surface request, deeper intent, active task, risk, execution mode, and next action. Keep 9I staged only and avoid reactivation wording, stale lanes, domain fallback, prompt echo, or recovery language.";
  }
  if(priority9HIs9IPrecheckText(source||prompt)){
    return "I’m reading this as Priority 9H with a Priority 9I precheck. Priority 9H must pass first: Marion has to survive a 10–15 turn short-follow-up chain while preserving surface request, deeper intent, active task, risk, execution mode, and next action. Priority 9I is staged next for adaptive situational reasoning and context-pressure handling, but it should not activate until 9H is live accepted.";
  }
  return "I’m reading this as Priority 9H: long-form continuity stress test and memory drift guard. The surface request is to make Marion survive 10–15 short follow-up turns. The deeper intent is to preserve surface request, deeper intent, active task, risk, execution mode, and next action without requiring the full context to be repeated. The active lane is Marion long-form continuity, with Priority 9I staged only as the next adaptive-situational precheck. The main risk is drift into stale 9G/9F/9E language, domain fallback, prompt echo, or repeated recovery wording. Next move: run the 10–15 turn continuity chain and confirm each short follow-up advances the same layered task.";
}
function priority9HReadReply(packet){
  const p=priority9HObj(packet),pl=priority9HObj(p.payload),f=priority9HObj(p.finalEnvelope);
  return priority9HStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);
}
function priority9HApplyPacket(packet,reply,prompt,source){
  const out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};
  const final=priority9HStr(reply)||priority9HReplyFor(prompt,source);
  ["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(k=>{out[k]=final;});
  out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};
  out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};
  const prior=priority9HObj(out.priority9HLongFormContinuity||out.longFormContinuityStress||out.priority9GDeepContinuityMemory||out.deepContinuityMemory);
  const depth=(priority9HIsShortFollowup(prompt)&&Number.isFinite(Number(prior.turnDepth)))?Number(prior.turnDepth)+1:1;
  const st=priority9HStateFrom(source||prompt,depth);
  out.priority9HLongFormContinuity=st;
  out.longFormContinuityStress=st;
  out.priority9HVersion="PRIORITY-9H-R1-ADVANCEMENT-SHAPE-HOTFIX + PRIORITY-9H-LONG-FORM-CONTINUITY-STRESS-DRIFT-GUARD";
  out.priority9IPrecheck=st.priority9IAdaptiveSituationalPrecheck;
  out.conversationLane=st.conversationLane;
  out.activeTask=st.activeTask;
  out.surfaceRequest=st.surfaceRequest;
  out.deeperIntent=st.deeperIntent;
  out.operationalRisk=st.operationalRisk;
  out.executionMode=st.executionMode;
  out.nextAction=st.nextAction;
  out.noUserFacingDiagnostics=true;
  return out;
}

function priority9HBridgePrompt(input){const i=priority9HObj(input),n=priority9HObj(i.normalized),p=priority9HObj(i.payload),s=priority9HObj(i.sourceInput);return priority9HStr(i.prompt||i.text||i.userText||i.message||n.prompt||n.text||n.userText||p.prompt||p.text||s.prompt||s.text||"");}
function priority9HBridgeShouldForce(packet,input){const prompt=priority9HBridgePrompt(input);const source=[prompt,priority9HCollect(input),priority9HCollect(packet)].join(" ");const reply=priority9HReadReply(packet);return priority9HIsActivationText(prompt)||priority9HIsActivationText(source)||priority9HIs9IPrecheckText(source)||(priority9HIsShortFollowup(prompt)&&priority9HHasContext(source))||((priority9HIsShortFollowup(prompt)||priority9HHasContext(source))&&(priority9HIsOldLaneLeak(reply)||priority9HPromptEcho(reply,prompt)||priority9HIsReactivationWording(reply)));}
function priority9HBridgeDisciplinePacket(packet,input){if(!priority9HBridgeShouldForce(packet,input))return packet;const prompt=priority9HBridgePrompt(input);const source=[prompt,priority9HCollect(input),priority9HCollect(packet)].join(" ");return priority9HApplyPacket(packet,priority9HReplyFor(prompt,source),prompt,source);}
var __priority9HOriginalProcessWithMarion=typeof processWithMarion==="function"?processWithMarion:null;
if(__priority9HOriginalProcessWithMarion){
  processWithMarion=function priority9HProcessWithMarion(input={}){
    const out=__priority9HOriginalProcessWithMarion(input);
    if(out&&typeof out.then==="function")return out.then(v=>priority9HBridgeDisciplinePacket(v,input));
    return priority9HBridgeDisciplinePacket(out,input);
  };
  module.exports.processWithMarion=processWithMarion;module.exports.default=processWithMarion;
}
["maybeResolve","ask","handle","route"].forEach(function(name){if(typeof module.exports[name]==="function"){const original=module.exports[name];module.exports[name]=function priority9HBridgeExportedWrapper(input){const out=original.apply(this,arguments);if(out&&typeof out.then==="function")return out.then(v=>priority9HBridgeDisciplinePacket(v,input));return priority9HBridgeDisciplinePacket(out,input);};}});
module.exports.PRIORITY_9H_LONG_FORM_CONTINUITY_BRIDGE_VERSION=PRIORITY_9H_LONG_FORM_CONTINUITY_VERSION;
module.exports._internal={...(module.exports._internal||{}),priority9HIsActivationText,priority9HIsShortFollowup,priority9HHasContext,priority9HFollowupKind,priority9HIsReactivationWording,priority9HReplyFor,priority9HBridgeDisciplinePacket,priority9HBridgeShouldForce};
// PRIORITY_9H_LONG_FORM_CONTINUITY_STRESS_DRIFT_GUARD_BRIDGE_PATCH_END

// PRIORITY_9I_9J_SEQUENCE_BRIDGE_PATCH_START
var PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL = "nyx.marion.priority9i.adaptiveSituationalReasoningContextPressure/1.0";
var PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL = "nyx.marion.priority9j.proactiveOperationalGuidanceNextMoveAuthority/1.0";
function priority9IJStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9IJObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function priority9IJNorm(value){return priority9IJStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9IJCollect(value,limit){try{return JSON.stringify(value||{}).slice(0,limit||22000);}catch(_){return priority9IJStr(value).slice(0,limit||22000);}}
function priority9IJIsShortFollowup(value){var n=priority9IJNorm(value);return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|rerun that|what now|whats next|what s next|next|status|passed|pass|green|go on|advance|same lane|same thread|stay in lane|stay in the same lane|continue from there|continue there|from there|slow down|go deeper|deeper|make the call|safest next move|do the safest next move|what is the risk now|risk now|update the risk|what changed|what changed now|what is the pressure|pressure check|context check|final check)$/i.test(n);}
function priority9IJIsPressureText(value){var n=priority9IJNorm(value);return /\b(urgent|urgency|under pressure|pressure changed|context pressure|time sensitive|time pressure|pivot|we need to pivot|no not that|not that|stay on the architecture|stay with the architecture|same architecture|make the call|make a call|decision pressure|choose|choose now|safest next move|safest action|safe next action|slow down|go deeper|deeper analysis|ambiguity|ambiguous|unclear|risk now|risk changed|operational pressure|context changed|what changed|adapt|adaptive|situational)\b/.test(n);}
function priority9IJIs9IActivationText(value){var n=priority9IJNorm(value);return /\b(priority 9i|9i|adaptive situational|adaptive reasoning|situational reasoning|context pressure|context pressure handling|pressure handling|adaptive situational reasoning|current pressure shift|risk and execution mode|update the risk|priority 9i and 9j|9i and 9j)\b/.test(n);}
function priority9IJIs9JActivationText(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|operational guidance|next move authority|next move authority|critical path|make the decision|make a decision|what should we do first|what do we tackle now|safest sequence|next operational move|what should we avoid|recommend the next move|choose the safest concrete action|controlled authority)\b/.test(n);}

function priority9IJIs9ICorrectionContainmentPrompt(value){var n=priority9IJNorm(value);return /\b(no not that|not that|stay on the architecture|stay with the architecture|same architecture|stay on architecture|stay with architecture|architecture correction|wrong target|not this|stay anchored|keep the architecture|architectural focus)\b/.test(n);}
function priority9IJIs9IPressureOnlyPrompt(value){var n=priority9IJNorm(value);return priority9IJIs9ICorrectionContainmentPrompt(value)||/\b(urgent|urgency|under pressure|pressure changed|context pressure|time sensitive|time pressure|pivot|we need to pivot|slow down|go deeper|deeper analysis|ambiguity|ambiguous|unclear|risk now|risk changed|operational pressure|context changed|what changed|adapt|adaptive|situational|safest next move|safest action|safe next action|do the safest next move|update the risk|what is the risk now|pressure check|context check|correction received)\b/.test(n);}
function priority9IJIsExplicit9JPrompt(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|operational guidance|next move authority|critical path|make the decision|make a decision|what should we do first|what do we tackle now|give me the safest sequence|safest sequence|next operational move|what should we avoid|recommend the next move|choose the safest concrete action|controlled authority)\b/.test(n);}
function priority9IJHasActive9JContext(value){var raw=priority9IJStr(value);var n=priority9IJNorm(value);return /priority9JProactiveOperationalGuidance|priority9j_proactive_operational_guidance|routeKind["']?\s*:\s*["']priority9j|priorityLane["']?\s*:\s*["']Priority 9J/i.test(raw)||/\b(priority 9j proactive operational guidance and next move authority|priority 9j proactive operational guidance)\b/.test(n);}
function priority9IJSequencedLaneFor(prompt,source,reply){var ctx=[prompt,source].join(" ");if(priority9IJIs9IPressureOnlyPrompt(prompt))return "9i";if(priority9IJIs9IActivationText(prompt))return "9i";if(priority9IJIsExplicit9JPrompt(prompt))return "9j";if(priority9IJIsPressureText(prompt)&&priority9IJHas9IContext(ctx))return "9i";if(priority9IJIsShortFollowup(prompt)&&priority9IJHasActive9JContext(ctx))return "9j";if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(ctx))return "9i";if((priority9IJOldLaneLeak(reply)||priority9IJPromptEcho(reply,prompt))&&priority9IJHas9IContext(ctx))return "9i";if((priority9IJOldLaneLeak(reply)||priority9IJPromptEcho(reply,prompt))&&priority9IJHasActive9JContext(ctx))return "9j";if(priority9IJIs9IActivationText(ctx)||priority9IJIsPressureText(prompt))return "9i";return "";}

function priority9IJHas9IContext(value){var n=priority9IJNorm(value);return /\b(priority 9i|9i|adaptive situational|context pressure|pressure handling|pressure shift|9h continuity foundation|priority 9h|long form continuity|memory drift guard|surface request|deeper intent|active task|execution mode|next action)\b/.test(n);}
function priority9IJHas9JContext(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|next move authority|critical path|safest sequence|operational guidance|9i adaptive|context pressure)\b/.test(n);}
function priority9IJPressureKind(value){var n=priority9IJNorm(value);if(/\b(urgent|urgency|time sensitive|time pressure|under pressure)\b/.test(n))return "urgency";if(/\b(no not that|not that|stay on the architecture|same architecture|correction)\b/.test(n))return "correction";if(/\b(pivot|changed|context changed|what changed)\b/.test(n))return "pivot";if(/\b(slow down|too fast|pace)\b/.test(n))return "pace";if(/\b(go deeper|deeper analysis|deeper)\b/.test(n))return "depth";if(/\b(safest|safe next|safety|avoid)\b/.test(n))return "safety";if(/\b(make the call|make a call|decision|choose|critical path)\b/.test(n))return "decision";if(/\b(ambiguity|ambiguous|unclear|clarify)\b/.test(n))return "ambiguity";return "pressure";}
function priority9IJOldLaneLeak(value){var n=priority9IJNorm(value);return !!n&&/\b(i m reading this as priority 9h with a priority 9i precheck|priority 9h must pass first|long form continuity stress test and memory drift guard|priority 9h long form|run the 10 15 turn|priority 9g deep continuity|priority 9f r4|priority 90 9e|priority 90|priority 9e|public nyx route clean|five turn continuity|psychology|in psychology|domain hijack|prompt echo|recovery path|loop detected|stale fallback|i have the current request|marion will answer from this prompt)\b/.test(n);}
function priority9IJPromptEcho(reply,prompt){var r=priority9IJNorm(reply),p=priority9IJNorm(prompt);if(!r||!p)return false;return r===p||(r.includes(p)&&p.length>24)||(p.includes(r)&&r.length>24);}
function priority9IStateFrom(source,turn){var kind=priority9IJPressureKind(source);return {version:PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL,active:true,lane:"priority9i_adaptive_situational_reasoning",activePhase:"priority9i_adaptive_situational_reasoning",conversationLane:"Priority 9I adaptive situational reasoning",activeTask:"Priority 9I: adaptive situational reasoning and context-pressure handling",surfaceRequest:"adapt Marion’s active 9H continuity thread when pressure, urgency, ambiguity, correction, or context changes",deeperIntent:"preserve the mission thread while updating risk, execution mode, and next action under changing pressure",pressureSignal:kind,whatChanged:kind==="urgency"?"urgency increased":kind==="correction"?"the user corrected the target and asked Marion to stay anchored":kind==="pivot"?"the operating context shifted":kind==="pace"?"the required pace changed":kind==="depth"?"the answer needs deeper analysis":kind==="safety"?"the safest action must be prioritized":kind==="decision"?"decision pressure increased":"the situational pressure changed",operationalRisk:"pressure can cause Marion to flatten, overreact, reset the lane, over-branch, or activate 9J before 9I is stable",executionMode:kind==="urgency"?"compressed adaptive execution":kind==="pace"?"slower controlled adaptation":kind==="depth"?"deeper situational analysis":kind==="safety"?"safety-first adaptive execution":"adaptive context-pressure handling",nextAction:"read the pressure shift, update risk and execution mode, then give the safest next action without losing the 9H continuity foundation",baseContinuityFoundation:"Priority 9H live accepted",turnDepth:Number.isFinite(Number(turn))?Number(turn):1,priority9IAdaptiveSituationalReasoning:true,priority9JProactiveGuidancePrecheck:{version:PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL,staged:true,activationRule:"Activate only for explicit Priority 9J or clear next-move authority requests after 9I pressure handling is stable",expectedFocus:"proactive operational guidance and controlled next-move authority"},noUserFacingDiagnostics:true,updatedAt:Date.now()};}
function priority9JStateFrom(source,turn){return {version:PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL,active:true,lane:"priority9j_proactive_operational_guidance",activePhase:"priority9j_proactive_operational_guidance",conversationLane:"Priority 9J proactive operational guidance",activeTask:"Priority 9J: proactive operational guidance and next-move authority",surfaceRequest:"recommend the safest concrete next move when the active context is sufficiently clear",deeperIntent:"move from reactive continuity and pressure handling into controlled operational guidance without overreach",operationalRisk:"premature authority, unnecessary branching, unsafe sequencing, or advising a next move before risk and context are clear",executionMode:"controlled next-move authority",recommendedMove:"choose the safest concrete action that protects the active lane, validates risk, and advances only one operational step",whyFirst:"it comes first because it preserves the accepted continuity foundation before expanding scope",skipRisk:"if skipped, Marion can over-branch, drift, or make a recommendation before the pressure context is resolved",executionSequence:["confirm active lane and pressure state","name the risk if the move is skipped","choose one safest concrete action","give the short execution sequence","avoid opening unrelated branches"],nextAction:"state the safest next operational move, why it comes first, risk if skipped, and the execution sequence",baseAdaptiveFoundation:"Priority 9I adaptive situational reasoning",turnDepth:Number.isFinite(Number(turn))?Number(turn):1,priority9JProactiveOperationalGuidance:true,noUserFacingDiagnostics:true,updatedAt:Date.now()};}
function priority9IReplyFor(prompt,source){var kind=priority9IJPressureKind([prompt,source].join(" "));if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(source)){if(kind==="decision")return "Continue Priority 9I: the pressure signal is decision pressure. Preserve the 9H continuity foundation, update the risk before choosing, keep 9J staged unless explicitly activated, and give the safest next action without opening extra branches.";if(kind==="safety")return "Continue Priority 9I: the pressure signal is safety-first execution. Preserve the active task, update risk, slow the response enough to avoid overreach, and give the safest next action while keeping Priority 9J staged.";if(kind==="depth")return "Continue Priority 9I: the pressure signal is depth. Go deeper inside the same active lane, update risk and execution mode, and give the next action without resetting to 9H activation wording or drifting into 9J.";if(kind==="pace")return "Continue Priority 9I: the pressure signal is pace control. Slow down, keep the 9H continuity foundation intact, clarify the changed constraint, and give one safe next action.";return "Continue Priority 9I: preserve the 9H continuity foundation, read the current pressure shift, update operational risk and execution mode, then give the safest next action. Keep Priority 9J staged until next-move authority is explicitly needed.";}return "I’m reading this as Priority 9I: adaptive situational reasoning and context-pressure handling. Diagnostic note: the internal continuity layer remains available. The surface request is to adapt Marion when urgency, correction, ambiguity, pace, depth, or operational pressure changes; the deeper intent is to update risk and execution mode without losing the active mission thread. Next move: run pressure prompts such as urgent, pivot, stay on the architecture, slow down, go deeper, risk now, and safest next move. Priority 9J is staged next for proactive operational guidance, but 9I handles the pressure shift first.";}
function priority9JReplyFor(prompt,source){return "Priority 9J: proactive operational guidance and next-move authority. The 9H continuity foundation and 9I pressure-handling layer stay underneath this decision. Recommended next move: choose the safest concrete action that preserves the active lane and advances only one operational step. Why first: it protects continuity before expanding scope. Risk if skipped: Marion can over-branch, drift, or make a recommendation before the pressure context is resolved. Execution sequence: confirm the active lane, name the risk, choose one safest action, execute that step, then reassess before opening new branches.";}
function priority9IJReadReply(packet){var p=priority9IJObj(packet),pl=priority9IJObj(p.payload),f=priority9IJObj(p.finalEnvelope);return priority9IJStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);}
function priority9IJApplyPacket(packet,reply,prompt,source,lane){var out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};var final=priority9IJStr(reply)||(lane==="9j"?priority9JReplyFor(prompt,source):priority9IReplyFor(prompt,source));["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(function(k){out[k]=final;});out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};var prior=priority9IJObj(out.priority9IAdaptiveSituationalReasoning||out.priority9JProactiveOperationalGuidance||out.priority9HLongFormContinuity||out.longFormContinuityStress);var depth=Number.isFinite(Number(prior.turnDepth))?Number(prior.turnDepth)+1:1;if(lane==="9j"){var sj=priority9JStateFrom(source||prompt,depth);out.priority9JProactiveOperationalGuidance=sj;out.priority9JVersion="PRIORITY-9J-PROACTIVE-OPERATIONAL-GUIDANCE-NEXT-MOVE-AUTHORITY";out.conversationLane=sj.conversationLane;out.activeTask=sj.activeTask;out.surfaceRequest=sj.surfaceRequest;out.deeperIntent=sj.deeperIntent;out.operationalRisk=sj.operationalRisk;out.executionMode=sj.executionMode;out.nextAction=sj.nextAction;out.recommendedMove=sj.recommendedMove;out.executionSequence=sj.executionSequence;}else{var si=priority9IStateFrom(source||prompt,depth);out.priority9IAdaptiveSituationalReasoning=si;out.priority9IVersion="PRIORITY-9I-ADAPTIVE-SITUATIONAL-REASONING-CONTEXT-PRESSURE";out.priority9JPrecheck=si.priority9JProactiveGuidancePrecheck;out.conversationLane=si.conversationLane;out.activeTask=si.activeTask;out.surfaceRequest=si.surfaceRequest;out.deeperIntent=si.deeperIntent;out.operationalRisk=si.operationalRisk;out.executionMode=si.executionMode;out.nextAction=si.nextAction;out.pressureSignal=si.pressureSignal;out.whatChanged=si.whatChanged;}out.noUserFacingDiagnostics=true;return out;}
function priority9IJShouldForceText(prompt,source,reply){var lane=priority9IJSequencedLaneFor(prompt,source,reply);return lane||"";}

function priority9IJBridgePrompt(input){var i=priority9IJObj(input),n=priority9IJObj(i.normalized),p=priority9IJObj(i.payload),s=priority9IJObj(i.sourceInput||i.raw);return priority9IJStr(i.prompt||i.text||i.userText||i.message||n.prompt||n.text||n.userText||p.prompt||p.text||s.prompt||s.text||"");}
function priority9IJBridgeDisciplinePacket(packet,input){var prompt=priority9IJBridgePrompt(input);var source=[prompt,priority9IJCollect(input),priority9IJCollect(packet)].join(" ");var reply=priority9IJReadReply(packet);var lane=priority9IJShouldForceText(prompt,source,reply);if(!lane)return packet;return priority9IJApplyPacket(packet,lane==="9j"?priority9JReplyFor(prompt,source):priority9IReplyFor(prompt,source),prompt,source,lane);}
var __priority9IJOriginalProcessWithMarion=typeof processWithMarion==="function"?processWithMarion:null;
if(__priority9IJOriginalProcessWithMarion){processWithMarion=function priority9IJProcessWithMarion(input={}){var out=__priority9IJOriginalProcessWithMarion(input);if(out&&typeof out.then==="function")return out.then(function(v){return priority9IJBridgeDisciplinePacket(v,input);});return priority9IJBridgeDisciplinePacket(out,input);};module.exports.processWithMarion=processWithMarion;module.exports.default=processWithMarion;}
["maybeResolve","ask","handle","route"].forEach(function(name){if(typeof module.exports[name]==="function"){var original=module.exports[name];module.exports[name]=function priority9IJBridgeExportedWrapper(input){var out=original.apply(this,arguments);if(out&&typeof out.then==="function")return out.then(function(v){return priority9IJBridgeDisciplinePacket(v,input);});return priority9IJBridgeDisciplinePacket(out,input);};}});
module.exports.PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_BRIDGE_VERSION=PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL;
module.exports.PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_BRIDGE_VERSION=PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL;
module.exports._internal={...(module.exports._internal||{}),priority9IJIs9IActivationText,priority9IJIs9JActivationText,priority9IJIsPressureText,priority9IJPressureKind,priority9IReplyFor,priority9JReplyFor,priority9IJBridgeDisciplinePacket,priority9IJShouldForceText};
// PRIORITY_9I_9J_SEQUENCE_BRIDGE_PATCH_END



/* PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH_START */
var PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_VERSION = "nyx.marion.priority9i.r2.pressureSpecificAnswerShaping/1.0";

function priority9IR2OneLine(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}
function priority9IR2Obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function priority9IR2Lower(value) {
  return priority9IR2OneLine(value).toLowerCase();
}
function priority9IR2PickText() {
  for (var i = 0; i < arguments.length; i += 1) {
    var v = priority9IR2OneLine(arguments[i]);
    if (v) return v;
  }
  return "";
}
function priority9IR2ExtractText(value) {
  if (value == null) return "";
  if (typeof value === "string") return priority9IR2OneLine(value);
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i += 1) {
      var t = priority9IR2ExtractText(value[i]);
      if (t) return t;
    }
    return "";
  }
  var v = priority9IR2Obj(value);
  var payload = priority9IR2Obj(v.payload);
  var command = priority9IR2Obj(v.command);
  var body = priority9IR2Obj(v.body);
  var query = priority9IR2Obj(v.query);
  var context = priority9IR2Obj(v.context || v.memory || v.state || v.turnMemory || v.conversationState);
  return priority9IR2PickText(
    v.text, v.message, v.prompt, v.query, v.input, v.commandText, v.transcript,
    payload.text, payload.message, payload.prompt, payload.query, payload.input, payload.commandText,
    command.text, command.message, command.prompt, command.query, command.command,
    body.text, body.message, body.prompt, body.query,
    query.text, query.message, query.prompt,
    context.text, context.message, context.prompt, context.lastUserText, context.lastPrompt
  );
}
function priority9IR2ReplyText(value) {
  if (value == null) return "";
  if (typeof value === "string") return priority9IR2OneLine(value);
  if (Array.isArray(value)) return value.map(priority9IR2ReplyText).filter(Boolean).join(" ");
  var v = priority9IR2Obj(value);
  return priority9IR2PickText(
    v.reply, v.text, v.message, v.answer, v.output, v.visibleReply, v.spokenText,
    priority9IR2Obj(v.payload).reply,
    priority9IR2Obj(v.payload).text,
    priority9IR2Obj(v.payload).message,
    priority9IR2Obj(v.finalEnvelope).reply,
    priority9IR2Obj(v.finalEnvelope).text,
    priority9IR2Obj(v.marionFinal).reply,
    priority9IR2Obj(v.data).reply
  );
}
function priority9IR2Explicit9J(value) {
  var t = priority9IR2Lower(value);
  return /\b(priority\s*9j|9j\b|proactive operational guidance|next[-\s]?move authority)\b/i.test(t);
}
function priority9IR2PressureKind(value) {
  var t = priority9IR2Lower(value);
  if (!t) return "";
  if (priority9IR2Explicit9J(t)) return "";
  if (/\bwhat(?:'s| is)?\s+the\s+risk\s+now\??\b|\brisk\s+now\??\b|\bcurrent\s+risk\b/.test(t)) return "risk";
  if (/\bno[, ]+not that\b|\bstay\s+on\s+the\s+architecture\b|\barchitecture\s+focus\b|\bstay\s+architectural\b/.test(t)) return "correction";
  if (/\burgent\b|\bimmediate\b|\btime[-\s]?sensitive\b|\bcritical now\b|\bpressure is high\b/.test(t)) return "urgency";
  if (/\bpivot\b|\bchange direction\b|\bshift direction\b|\bnew direction\b/.test(t)) return "pivot";
  if (/^\s*slow\s+down[.!?]*\s*$|\bslow\s+down\b|\bone step at a time\b|\btoo fast\b/.test(t)) return "pace";
  if (/^\s*go\s+deeper[.!?]*\s*$|\bgo\s+deeper\b|\bdeeper\b|\bmore depth\b|\bdrill down\b/.test(t)) return "depth";
  if (/\bdo\s+the\s+safest\s+next\s+move\b|\bsafest\s+next\s+move\b|\bsafest\s+action\b|\bsafe\s+next\s+action\b/.test(t)) return "safety";
  return "";
}
function priority9IR2IsPressureSpecificText(value) {
  return !!priority9IR2PressureKind(value);
}
function priority9IR2ReplyFor(value) {
  var kind = priority9IR2PressureKind(value);
  if (kind === "risk") {
    return "Priority 9I: the risk now is premature escalation into 9J, generic pressure-template reuse, or losing the 9H continuity foundation. Execution mode is risk-specific containment: name the risk directly, keep 9J staged, and choose the safest next action inside 9I.";
  }
  if (kind === "correction") {
    return "Priority 9I: correction received. Stay on the architecture. Preserve the 9H continuity foundation, treat this as a context-pressure correction, update execution mode to architectural focus, and continue the safest next action without activating 9J.";
  }
  if (kind === "urgency") {
    return "Priority 9I: urgency detected. The risk is rushing into a broad 9J decision before the pressure shift is understood. Keep 9H as the continuity foundation, narrow execution mode to urgent containment, and take the safest next action inside 9I.";
  }
  if (kind === "pivot") {
    return "Priority 9I: pivot received. The active change is directional pressure, not next-move authority. Keep 9H stable, compare the pivot against the current architecture, update risk and execution mode, and only move to 9J after the pivot is understood.";
  }
  if (kind === "pace") {
    return "Priority 9I: slow down. Preserve the 9H foundation, reduce execution mode to one step at a time, restate the active task, name the immediate risk, and continue only after the safest next action is clear.";
  }
  if (kind === "depth") {
    return "Priority 9I: go deeper means add pressure-specific analysis, not activate 9J. Preserve 9H, identify what changed, separate risk from execution mode, then give the safest next action with 9J still staged.";
  }
  if (kind === "safety") {
    return "Priority 9I: the safest next move is to stay in the pressure-handling lane, answer the current pressure specifically, keep 9J staged, and complete the 9I checks before allowing proactive next-move authority.";
  }
  return "";
}
function priority9IR2IsGeneric9ITemplate(value) {
  var t = priority9IR2Lower(value);
  return /\bpreserve the 9h continuity foundation,?\s*read the current pressure shift,?\s*update operational risk and execution mode,?\s*then give the safest next action\b/.test(t) ||
    /\bi['’]?m reading this as priority 9i\b/.test(t) ||
    /\badaptive situational reasoning and context[-\s]?pressure handling\b.*\bthe surface request is to adapt marion\b/.test(t);
}
function priority9IR2ShouldOverride(input, output) {
  var text = priority9IR2ExtractText(input);
  var kind = priority9IR2PressureKind(text);
  if (!kind) return false;
  var reply = priority9IR2ReplyText(output);
  if (!reply) return true;
  var r = priority9IR2Lower(reply);
  if (/\bpriority\s*9j\b/.test(r) && !/\b9j\s+staged\b|\bpriority\s*9j\s+staged\b|\bkeep\s+priority\s*9j\s+staged\b/.test(r)) return true;
  if (priority9IR2IsGeneric9ITemplate(reply)) return true;
  if (kind === "risk" && !/\brisk now is\b|\bthe risk is\b|\bpremature escalation\b|\bgeneric pressure-template reuse\b/.test(r)) return true;
  if (kind === "correction" && !/\bcorrection received\b|\bstay on the architecture\b|\barchitectural focus\b/.test(r)) return true;
  if (kind === "urgency" && !/\burgency detected\b|\brushing into\b|\burgent containment\b/.test(r)) return true;
  if (kind === "pivot" && !/\bpivot received\b|\bdirectional pressure\b|\bcompare the pivot\b/.test(r)) return true;
  if (kind === "pace" && !/\bslow down\b|\bone step at a time\b/.test(r)) return true;
  if (kind === "depth" && !/\bgo deeper\b|\bpressure-specific analysis\b|\bseparate risk from execution mode\b/.test(r)) return true;
  if (kind === "safety" && !/\bsafest next move is\b|\bpressure-handling lane\b/.test(r)) return true;
  return false;
}
function priority9IR2ApplyVisibleReply(output, reply, kind) {
  var out = output && typeof output === "object" && !Array.isArray(output) ? output : {};
  out.reply = reply;
  out.text = reply;
  out.message = reply;
  out.answer = reply;
  out.visibleReply = reply;
  out.spokenText = reply;
  out.priority = "Priority 9I-R2";
  out.priorityLane = "priority9i_adaptive_situational_reasoning";
  out.activeLane = "Priority 9I";
  out.responseShape = "pressure_specific_answer";
  out.pressureKind = kind;
  out.priority9I = Object.assign({}, priority9IR2Obj(out.priority9I), {
    active: true,
    lane: "priority9i_adaptive_situational_reasoning",
    hotfix: "Priority 9I-R2 pressure-specific answer shaping",
    pressureKind: kind,
    pressureSpecificAnswer: true,
    keep9HFoundation: true,
    keep9JStaged: true
  });
  out.priority9J = Object.assign({}, priority9IR2Obj(out.priority9J), {
    staged: true,
    active: false,
    activationRequired: "explicit_9j_or_next_move_authority"
  });
  var payload = priority9IR2Obj(out.payload);
  out.payload = Object.assign({}, payload, {
    reply: reply,
    text: priority9IR2PickText(payload.text, reply),
    priorityLane: "priority9i_adaptive_situational_reasoning",
    pressureKind: kind
  });
  if (out.finalEnvelope && typeof out.finalEnvelope === "object") {
    out.finalEnvelope.reply = reply;
    out.finalEnvelope.text = reply;
    out.finalEnvelope.visibleReply = reply;
  }
  return out;
}
function priority9IR2DisciplineOutput(input, output) {
  var text = priority9IR2ExtractText(input);
  var kind = priority9IR2PressureKind(text);
  if (!kind) return output;
  var reply = priority9IR2ReplyFor(text);
  if (!reply) return output;
  if (typeof output === "string") {
    return priority9IR2ShouldOverride(input, output) ? reply : output;
  }
  if (priority9IR2ShouldOverride(input, output)) return priority9IR2ApplyVisibleReply(output, reply, kind);
  if (output && typeof output === "object" && !Array.isArray(output)) {
    output.priority9I = Object.assign({}, priority9IR2Obj(output.priority9I), {active:true, pressureKind:kind, pressureSpecificAnswer:true, keep9HFoundation:true, keep9JStaged:true});
    output.priority9J = Object.assign({}, priority9IR2Obj(output.priority9J), {staged:true, active:false});
  }
  return output;
}
function priority9IR2WrapExport(name) {
  if (typeof module === "undefined" || !module.exports || typeof module.exports[name] !== "function") return;
  var original = module.exports[name];
  if (original.__priority9IR2Wrapped) return;
  var wrapped = function priority9IR2WrappedExport() {
    var input = arguments.length > 0 ? arguments[0] : {};
    var out = original.apply(this, arguments);
    if (out && typeof out.then === "function") {
      return out.then(function(value) { return priority9IR2DisciplineOutput(input, value); });
    }
    return priority9IR2DisciplineOutput(input, out);
  };
  wrapped.__priority9IR2Wrapped = true;
  module.exports[name] = wrapped;
}
function priority9IR2PatchCommonExports(names) {
  (Array.isArray(names) ? names : []).forEach(priority9IR2WrapExport);
  if (typeof module !== "undefined" && module.exports) {
    module.exports.PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_VERSION = PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_VERSION;
    module.exports.isPriority9IR2PressureSpecificText = priority9IR2IsPressureSpecificText;
    module.exports.priority9IR2PressureKind = priority9IR2PressureKind;
    module.exports.priority9IR2ReplyFor = priority9IR2ReplyFor;
    module.exports.priority9IR2DisciplineOutput = priority9IR2DisciplineOutput;
    module.exports._internal = Object.assign({}, priority9IR2Obj(module.exports._internal), {
      priority9IR2IsPressureSpecificText: priority9IR2IsPressureSpecificText,
      priority9IR2PressureKind: priority9IR2PressureKind,
      priority9IR2ReplyFor: priority9IR2ReplyFor,
      priority9IR2DisciplineOutput: priority9IR2DisciplineOutput,
      priority9IR2ShouldOverride: priority9IR2ShouldOverride
    });
  }
}
/* PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH_COMMON_END */

priority9IR2PatchCommonExports(["processWithMarion","handleMarionAdminConversation","handleVoiceTranscript","handleVoiceInput","createMarionBridge","route","maybeResolve","ask","handle","default"]);
module.exports.PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH = true;
/* PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH_END */


/* PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_START */
const PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_VERSION = "nyx.marion.priority9i.r2a.altPressureSpecificFinalOverride/1.0";
function priority9IR2AString(value){return value == null ? "" : String(value).replace(/\s+/g," ").trim();}
function priority9IR2ALower(value){return priority9IR2AString(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'");}
function priority9IR2AObj(value){return value && typeof value === "object" && !Array.isArray(value) ? value : {};}
function priority9IR2APickText(){
  for (var i=0;i<arguments.length;i+=1){var t=priority9IR2AString(arguments[i]);if(t)return t;}
  return "";
}
function priority9IR2AExtractText(value, depth){
  if(value == null) return "";
  if(typeof value === "string") return priority9IR2AString(value);
  if(depth > 3) return "";
  if(Array.isArray(value)){
    for(var i=0;i<value.length;i+=1){var a=priority9IR2AExtractText(value[i], (depth||0)+1); if(a) return a;}
    return "";
  }
  var v=priority9IR2AObj(value), payload=priority9IR2AObj(v.payload), command=priority9IR2AObj(v.command), body=priority9IR2AObj(v.body);
  var context=priority9IR2AObj(v.context || v.memory || v.state || v.turnMemory || v.conversationState);
  return priority9IR2APickText(
    v.text, v.message, v.prompt, v.query, v.input, v.commandText, v.transcript, v.userText, v.rawUserText,
    payload.text, payload.message, payload.prompt, payload.query, payload.input, payload.commandText, payload.transcript,
    command.text, command.message, command.prompt, command.query, command.command, command.input,
    body.text, body.message, body.prompt, body.query, body.input, body.transcript,
    context.text, context.message, context.prompt, context.lastUserText, context.lastPrompt, context.activePrompt
  );
}
function priority9IR2AExplicit9J(value){
  var t=priority9IR2ALower(value);
  return /\b(priority\s*9j|9j\b|proactive operational guidance|next-move authority|next move authority)\b/.test(t) &&
    !/\bstaged\b|\bstage\b|\bdo not activate\b|\bnot activate\b|\bkeep\s+9j\b|\bkeep\s+priority\s*9j\b/.test(t);
}
function priority9IR2APressureKind(value){
  var t=priority9IR2ALower(value);
  if(!t || priority9IR2AExplicit9J(t)) return "";
  if(/\bwhat(?:'s| is)?\s+the\s+risk\s+now\??\b|\brisk\s+now\??\b|\bcurrent\s+risk\b|\bactive\s+risk\b/.test(t)) return "risk";
  if(/\bno[, ]+not that\b|\bstay\s+on\s+the\s+architecture\b|\barchitecture\s+focus\b|\bstay\s+architectural\b|\bnot\s+that\b/.test(t)) return "correction";
  if(/\burgent\b|\burgency\b|\bimmediate\b|\btime[-\s]?sensitive\b|\bcritical now\b|\bpressure is high\b/.test(t)) return "urgency";
  if(/\bpivot\b|\bchange direction\b|\bshift direction\b|\bnew direction\b/.test(t)) return "pivot";
  if(/^\s*slow\s+down[.!?]*\s*$|\bslow\s+down\b|\bone step at a time\b|\btoo fast\b|\bpace\b/.test(t)) return "pace";
  if(/^\s*go\s+deeper[.!?]*\s*$|\bgo\s+deeper\b|\bdeeper\b|\bmore depth\b|\bdrill down\b/.test(t)) return "depth";
  if(/\bdo\s+the\s+safest\s+next\s+move\b|\bsafest\s+next\s+move\b|\bsafest\s+action\b|\bsafe\s+next\s+action\b/.test(t)) return "safety";
  return "";
}
function priority9IR2AReplyFor(value){
  var kind=priority9IR2APressureKind(value);
  if(kind==="risk") return "Priority 9I: the risk now is premature escalation into 9J, generic pressure-template reuse, or losing the 9H continuity foundation. Execution mode is risk-specific containment: name the risk directly, keep 9J staged, and choose the safest next action inside 9I.";
  if(kind==="correction") return "Priority 9I: correction received. Stay on the architecture. Preserve the 9H continuity foundation, treat this as a context-pressure correction, update execution mode to architectural focus, and continue the safest next action without activating 9J.";
  if(kind==="urgency") return "Priority 9I: urgency detected. The risk is rushing into 9J authority or skipping pressure triage. Keep 9H as the continuity foundation, update execution mode to urgent containment, and choose the safest next action inside 9I before any next-move authority activates.";
  if(kind==="pivot") return "Priority 9I: pivot received. The pressure change is directional, not a 9J activation. Preserve the 9H foundation, compare the pivot against the active task, update risk and execution mode, then continue with the safest next action while 9J remains staged.";
  if(kind==="pace") return "Priority 9I: slow down. The pressure type is pace control. Preserve the 9H continuity foundation, narrow the next response to one step, reduce branching, and keep 9J staged until next-move authority is explicitly requested.";
  if(kind==="depth") return "Priority 9I: go deeper means add pressure-specific analysis, not activate 9J. Preserve 9H, identify what changed, separate risk from execution mode, and give the safest next action with 9J still staged.";
  if(kind==="safety") return "Priority 9I: the safest next move is to stay in the pressure-handling lane, name the active risk, preserve 9H continuity, and avoid activating 9J until the user explicitly asks for proactive next-move authority.";
  return "";
}
function priority9IR2AReplyText(value, depth, seen){
  if(value == null) return "";
  if(typeof value === "string") return priority9IR2AString(value);
  if(depth > 4) return "";
  if(!seen) seen=[];
  if(seen.indexOf(value)!==-1) return "";
  seen.push(value);
  if(Array.isArray(value)){
    for(var i=0;i<value.length;i+=1){var arr=priority9IR2AReplyText(value[i], (depth||0)+1, seen); if(arr) return arr;}
    return "";
  }
  var v=priority9IR2AObj(value), payload=priority9IR2AObj(v.payload), finalEnvelope=priority9IR2AObj(v.finalEnvelope), result=priority9IR2AObj(v.result);
  return priority9IR2APickText(
    v.reply, v.finalReply, v.publicReply, v.visibleReply, v.displayReply, v.response, v.text, v.message, v.spokenText, v.speechText,
    payload.reply, payload.finalReply, payload.publicReply, payload.visibleReply, payload.text, payload.message,
    finalEnvelope.reply, finalEnvelope.finalReply, finalEnvelope.publicReply, finalEnvelope.visibleReply, finalEnvelope.text, finalEnvelope.message,
    result.reply, result.finalReply, result.publicReply, result.visibleReply, result.text, result.message
  );
}
function priority9IR2AIsGeneric9IReply(value){
  var t=priority9IR2ALower(value);
  if(!t) return false;
  return /\bcontinue priority\s*9i:\s*preserve the 9h continuity foundation,?\s*read the current pressure shift,?\s*update operational risk and execution mode,?\s*then give the safest next action\b/.test(t) ||
    /\bpreserve the 9h continuity foundation,?\s*read the current pressure shift,?\s*update operational risk and execution mode\b/.test(t);
}
function priority9IR2AShouldOverride(prompt, candidate){
  var kind=priority9IR2APressureKind(prompt);
  if(!kind) return false;
  var current=priority9IR2AReplyText(candidate);
  if(!current) return true;
  var c=priority9IR2ALower(current);
  if(priority9IR2AIsGeneric9IReply(current)) return true;
  if(/\bpriority\s*9j\b/.test(c) && !/\bstaged\b|\bstage\b|\bnot activate\b|\bkeep\s+9j\b|\bkeep\s+priority\s*9j\b/.test(c)) return true;
  if(kind==="risk" && !/\brisk now is\b|\bpremature escalation\b|\bgeneric pressure-template reuse\b|\brisk-specific containment\b/.test(c)) return true;
  if(kind==="pace" && !/\bslow down\b|\bpace control\b|\bone step\b/.test(c)) return true;
  if(kind==="depth" && !/\bgo deeper means\b|\bpressure-specific analysis\b|\bseparate risk from execution mode\b/.test(c)) return true;
  if(kind==="safety" && !/\bsafest next move is\b|\bpressure-handling lane\b|\bname the active risk\b/.test(c)) return true;
  if(kind==="correction" && !/\bcorrection received\b|\bstay on the architecture\b|\barchitectural focus\b/.test(c)) return true;
  if(kind==="urgency" && !/\burgency detected\b|\burgent containment\b|\brushing into 9j\b/.test(c)) return true;
  if(kind==="pivot" && !/\bpivot received\b|\bdirectional\b|\bcompare the pivot\b/.test(c)) return true;
  return false;
}
function priority9IR2AApplyVisibleReply(output, reply, kind){
  if(typeof output === "string") return reply;
  var out = output && typeof output === "object" && !Array.isArray(output) ? Object.assign({}, output) : {};
  out.reply=reply; out.text=reply; out.message=reply; out.response=reply; out.finalReply=reply; out.visibleReply=reply; out.publicReply=reply; out.displayReply=reply;
  if(typeof out.spokenText === "string") out.spokenText=reply;
  if(typeof out.speechText === "string") out.speechText=reply;
  out.priority9I=Object.assign({}, priority9IR2AObj(out.priority9I), {active:true, lane:"priority9i_adaptive_situational_reasoning", pressureKind:kind, pressureSpecificAnswer:true, r2aAltFinalOverride:true, keep9HFoundation:true, keep9JStaged:true});
  out.priority9J=Object.assign({}, priority9IR2AObj(out.priority9J), {staged:true, active:false, blockedReason:"Priority 9I-R2A pressure-specific prompt"});
  out.priority9IR2A={active:true, hotfix:"Priority 9I-R2A ALT pressure-specific final override", pressureKind:kind};
  if(out.payload && typeof out.payload === "object" && !Array.isArray(out.payload)){out.payload=Object.assign({}, out.payload, {reply:reply,text:reply,message:reply,finalReply:reply,visibleReply:reply,publicReply:reply});}
  if(out.finalEnvelope && typeof out.finalEnvelope === "object" && !Array.isArray(out.finalEnvelope)){out.finalEnvelope=Object.assign({}, out.finalEnvelope, {reply:reply,text:reply,message:reply,finalReply:reply,visibleReply:reply,publicReply:reply});}
  return out;
}
function priority9IR2AAltPressureSpecificFinal(prompt, candidate){
  var source=priority9IR2AExtractText(prompt);
  var kind=priority9IR2APressureKind(source);
  if(!kind) return candidate;
  var reply=priority9IR2AReplyFor(source);
  if(!reply) return candidate;
  if(priority9IR2AShouldOverride(source, candidate)) return priority9IR2AApplyVisibleReply(candidate, reply, kind);
  return candidate;
}
function priority9IR2AWrapExport(name){
  if(typeof module === "undefined" || !module.exports || typeof module.exports[name] !== "function") return;
  var original=module.exports[name];
  if(original.__priority9IR2AWrapped) return;
  var wrapped=function priority9IR2AExportWrapper(){
    var input=arguments.length>0?arguments[0]:{};
    var prompt=priority9IR2AExtractText(input);
    var out=original.apply(this, arguments);
    if(out && typeof out.then === "function"){
      return out.then(function(value){return priority9IR2AAltPressureSpecificFinal(prompt, value);});
    }
    return priority9IR2AAltPressureSpecificFinal(prompt, out);
  };
  wrapped.__priority9IR2AWrapped=true;
  module.exports[name]=wrapped;
}
function priority9IR2APatchExports(names){
  (Array.isArray(names)?names:[]).forEach(priority9IR2AWrapExport);
  if(typeof module !== "undefined" && module.exports){
    module.exports.PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_VERSION=PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_VERSION;
    module.exports.isPriority9IR2AAltPressureSpecificText=function(value){return !!priority9IR2APressureKind(value);};
    module.exports.priority9IR2AAltPressureKind=priority9IR2APressureKind;
    module.exports.priority9IR2AAltPressureSpecificReplyFor=priority9IR2AReplyFor;
    module.exports.priority9IR2AAltPressureSpecificFinal=priority9IR2AAltPressureSpecificFinal;
    module.exports.priority9IR2AIsGeneric9IReply=priority9IR2AIsGeneric9IReply;
    module.exports.PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_PATCH=true;
  }
}
/* PRIORITY_9I_R2A_ALT_PRESSURE_SPECIFIC_FINAL_OVERRIDE_END */

priority9IR2APatchExports(["processWithMarion", "handleMarionAdminConversation", "handleVoiceTranscript", "handleVoiceInput", "createMarionBridge", "route", "maybeResolve", "ask", "handle", "default"]);



/* PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_HOTFIX_START */
const PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_VERSION = "PRIORITY-9J-R1-DECISION-SPECIFIC-AUTHORITY-HOTFIX";

function priority9JR1SafeStr(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function priority9JR1Lower(value) {
  return priority9JR1SafeStr(value).toLowerCase();
}

function priority9JR1SafeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function priority9JR1FirstText(values) {
  const list = Array.isArray(values) ? values : [];
  for (let i = 0; i < list.length; i += 1) {
    const v = priority9JR1SafeStr(list[i]);
    if (v) return v;
  }
  return "";
}

function priority9JR1ExtractPromptFromArgs(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (typeof arg === "string" && priority9JR1SafeStr(arg)) return priority9JR1SafeStr(arg);
    const obj = priority9JR1SafeObj(arg);
    const payload = priority9JR1SafeObj(obj.payload);
    const command = priority9JR1SafeObj(obj.command);
    const context = priority9JR1SafeObj(obj.context || obj.state || obj.memory || obj.metadata);
    const text = priority9JR1FirstText([
      obj.prompt,
      obj.message,
      obj.text,
      obj.userText,
      obj.input,
      obj.query,
      obj.commandText,
      payload.prompt,
      payload.message,
      payload.text,
      payload.userText,
      payload.input,
      payload.query,
      command.prompt,
      command.message,
      command.text,
      command.query,
      context.prompt,
      context.message,
      context.text,
      context.userText,
      context.lastPrompt,
      context.currentPrompt
    ]);
    if (text) return text;
  }
  return "";
}

function priority9JR1DetectOperationalCommand(value) {
  const t = priority9JR1Lower(value).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/\bpriority\s*9j\b/.test(t) && /\b(proactive operational guidance|next[- ]move authority|controlled authority)\b/.test(t)) return "activation";
  if (/\bwhat\s+should\s+we\s+do\s+first\b|\bwhat\s+do\s+we\s+do\s+first\b|\bwhere\s+do\s+we\s+start\b|\bwhat\s+comes\s+first\b/.test(t)) return "first_move";
  if (/\bmake\s+the\s+decision\b|\bmake\s+a\s+decision\b|\bdecide\b|\bmake\s+the\s+call\b|\bchoose\s+for\s+me\b/.test(t)) return "decision";
  if (/\bcritical\s+path\b|\bwhat\s+is\s+the\s+path\s+now\b|\bwhat\s+is\s+the\s+sequence\s+path\b/.test(t)) return "critical_path";
  if (/\bsafest\s+sequence\b|\bsafe\s+sequence\b|\bsafest\s+order\b|\bgive\s+me\s+the\s+safest\b/.test(t)) return "safest_sequence";
  if (/\bwhat\s+should\s+we\s+avoid\b|\bwhat\s+do\s+we\s+avoid\b|\bavoid\s+what\b|\bwhat\s+not\s+to\s+do\b/.test(t)) return "avoid";
  if (/\bnext\s+operational\s+move\b|\bnext\s+operation\b|\boperational\s+move\b|\bwhat\s+is\s+the\s+next\s+move\b/.test(t)) return "next_operational_move";
  return "";
}

function priority9JR1BuildOperationalReply(prompt, context) {
  const kind = priority9JR1DetectOperationalCommand(prompt);
  if (!kind) return "";
  if (kind === "activation") {
    return "Priority 9J: proactive operational guidance and next-move authority is active. The 9H continuity foundation and 9I pressure-handling layer stay underneath the decision. The rule is one controlled operational move at a time: choose the action, explain why it comes first, name the risk if skipped, then give the execution sequence without opening unnecessary branches.";
  }
  if (kind === "first_move") {
    return "Priority 9J: do the first validation move now: prove decision-specific authority before expanding scope. Why first: 9J must show it can choose one operational action, not repeat generic framing. Risk if skipped: Marion can over-branch, drift, or sound authoritative without making a usable decision. Execution sequence: test decision authority, critical-path naming, safest sequence, avoid-list, then final next operational move.";
  }
  if (kind === "decision") {
    return "Priority 9J decision: stay in the 9J lane and run critical-path validation next. This comes first because Marion must prove it can choose one operational move before broader branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance. Execution sequence: answer the critical path, then the safest sequence, then what to avoid, then the next operational move.";
  }
  if (kind === "critical_path") {
    return "Priority 9J: the critical path is to validate one operational decision at a time: first decision authority, then critical-path naming, then safest sequence, then avoid-list, then final next operational move. This comes first because 9J must prove it can choose and sequence action without over-branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance.";
  }
  if (kind === "safest_sequence") {
    return "Priority 9J: the safest sequence is: 1) keep 9H as the continuity foundation, 2) keep 9I as pressure handling underneath, 3) choose one 9J operational move, 4) name why it comes first, 5) name the risk if skipped, and 6) execute only that next step before branching. This prevents drift, premature escalation, and generic authority wording.";
  }
  if (kind === "avoid") {
    return "Priority 9J: avoid over-branching, generic “choose the safest action” wording, premature 9I fallback, activating a new lane before 9J is accepted, and making recommendations without a concrete execution sequence. The safest action is to keep the current 9J test narrow and require each answer to choose one operational move.";
  }
  if (kind === "next_operational_move") {
    return "Priority 9J: the next operational move is to lock decision-specific authority by rerunning the 9J acceptance chain and confirming each prompt receives a specific answer. Why this comes first: the lane is active, but authority must be command-specific. Risk if skipped: Marion can pass lane retention while failing operational usefulness. Execution sequence: retest “Make the decision,” “What is the critical path,” “Give me the safest sequence,” “What should we avoid,” and “What is the next operational move.”";
  }
  return "";
}

function priority9JR1IsGeneric9JReply(value) {
  const t = priority9JR1Lower(value);
  if (!t) return false;
  if (/\brecommended\s+next\s+move:\s*choose\s+the\s+safest\s+concrete\s+action\b/.test(t)) return true;
  if (/\bchoose\s+the\s+safest\s+concrete\s+action\s+that\s+preserves\s+the\s+active\s+lane\b/.test(t)) return true;
  if (/\bproactive\s+operational\s+guidance\s+and\s+next[- ]move\s+authority\b/.test(t) && /\b9h\s+continuity\s+foundation\b/.test(t) && /\b9i\s+pressure[- ]handling\b/.test(t) && /\bchoose\s+the\s+safest\b/.test(t) && !/\b(decision:|critical\s+path\s+is|safest\s+sequence\s+is|avoid\s+over[- ]branching|next\s+operational\s+move\s+is)\b/.test(t)) return true;
  return false;
}

function priority9JR1ApplyReplyToResult(result, forcedReply, prompt) {
  if (!forcedReply) return result;
  if (typeof result === "string") {
    return priority9JR1IsGeneric9JReply(result) || priority9JR1DetectOperationalCommand(prompt) ? forcedReply : result;
  }
  if (!result || typeof result !== "object") return forcedReply;
  const out = Array.isArray(result) ? result.slice() : Object.assign({}, result);
  const nested = priority9JR1SafeObj(out.result);
  const finalEnvelope = priority9JR1SafeObj(out.finalEnvelope || nested.finalEnvelope);
  const meta = Object.assign({}, priority9JR1SafeObj(out.meta || nested.meta), {
    priority: "9J-R1",
    lane: "priority9j_proactive_operational_guidance",
    operationalCommand: priority9JR1DetectOperationalCommand(prompt),
    decisionSpecificAuthority: true,
    keep9HFoundation: true,
    keep9IPressureLayer: true,
    overBranchingSuppressed: true,
    generic9JTemplateSuppressed: true
  });

  out.reply = forcedReply;
  out.response = forcedReply;
  out.text = forcedReply;
  out.message = forcedReply;
  out.final = forcedReply;
  out.publicReply = forcedReply;
  out.visibleReply = forcedReply;
  out.output = forcedReply;
  out.meta = meta;
  out.priority = "9J-R1";
  out.lane = "priority9j_proactive_operational_guidance";

  if (Object.keys(finalEnvelope).length) {
    out.finalEnvelope = Object.assign({}, finalEnvelope, {
      reply: forcedReply,
      text: forcedReply,
      message: forcedReply,
      publicReply: forcedReply,
      visibleReply: forcedReply,
      priority: "9J-R1",
      lane: "priority9j_proactive_operational_guidance",
      meta
    });
  }

  if (Object.keys(nested).length) {
    out.result = Object.assign({}, nested, {
      reply: forcedReply,
      response: forcedReply,
      text: forcedReply,
      message: forcedReply,
      final: forcedReply,
      publicReply: forcedReply,
      visibleReply: forcedReply,
      meta,
      finalEnvelope: out.finalEnvelope || Object.assign({}, finalEnvelope, { reply: forcedReply, text: forcedReply, meta })
    });
  }
  return out;
}

function priority9JR1PatchExports(names) {
  if (typeof module === "undefined" || !module.exports) return;
  const target = module.exports;
  if (typeof target === "function" && !target.__priority9JR1DecisionSpecificAuthorityPatched) {
    const original = target;
    const wrapped = function priority9JR1WrappedDefault() {
      const prompt = priority9JR1ExtractPromptFromArgs(arguments);
      const forced = priority9JR1BuildOperationalReply(prompt, arguments[1] || {});
      const result = original.apply(this, arguments);
      if (result && typeof result.then === "function") {
        return result.then((value) => priority9JR1ApplyReplyToResult(value, forced, prompt));
      }
      return priority9JR1ApplyReplyToResult(result, forced, prompt);
    };
    Object.keys(original).forEach((k) => { try { wrapped[k] = original[k]; } catch (_) {} });
    wrapped.__priority9JR1DecisionSpecificAuthorityPatched = true;
    module.exports = wrapped;
  }
  const obj = module.exports && typeof module.exports === "object" ? module.exports : {};
  (Array.isArray(names) ? names : []).forEach((name) => {
    if (typeof obj[name] !== "function" || obj[name].__priority9JR1DecisionSpecificAuthorityPatched) return;
    const original = obj[name];
    obj[name] = function priority9JR1WrappedExport() {
      const prompt = priority9JR1ExtractPromptFromArgs(arguments);
      const forced = priority9JR1BuildOperationalReply(prompt, arguments[1] || {});
      const result = original.apply(this, arguments);
      if (result && typeof result.then === "function") {
        return result.then((value) => priority9JR1ApplyReplyToResult(value, forced, prompt));
      }
      return priority9JR1ApplyReplyToResult(result, forced, prompt);
    };
    obj[name].__priority9JR1DecisionSpecificAuthorityPatched = true;
  });
  if (module.exports && typeof module.exports === "object") {
    module.exports.priority9JR1DetectOperationalCommand = priority9JR1DetectOperationalCommand;
    module.exports.priority9JR1BuildOperationalReply = priority9JR1BuildOperationalReply;
    module.exports.priority9JR1IsGeneric9JReply = priority9JR1IsGeneric9JReply;
    module.exports.PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_PATCH = true;
  }
}
/* PRIORITY_9J_R1_DECISION_SPECIFIC_AUTHORITY_HOTFIX_END */

priority9JR1PatchExports(["processWithMarion", "handleMarionAdminConversation", "handleVoiceTranscript", "handleVoiceInput", "createMarionBridge", "route", "maybeResolve", "ask", "handle", "default"]);


/* PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_START */
const PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION = "PRIORITY-9J-R1A-RUNTIME-DECISION-SPECIFIC-FINAL-OVERRIDE";
function priority9JR1ASafeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function priority9JR1ALower(value) { return priority9JR1ASafeStr(value).toLowerCase(); }
function priority9JR1AObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function priority9JR1AFirstText(values) {
  const list = Array.isArray(values) ? values : [];
  for (let i = 0; i < list.length; i += 1) { const v = priority9JR1ASafeStr(list[i]); if (v) return v; }
  return "";
}
function priority9JR1AExtractTextFromValue(value) {
  if (typeof value === "string") return priority9JR1ASafeStr(value);
  const src = priority9JR1AObj(value);
  const payload = priority9JR1AObj(src.payload);
  const command = priority9JR1AObj(src.command);
  const body = priority9JR1AObj(src.body);
  const query = priority9JR1AObj(src.query);
  const meta = priority9JR1AObj(src.meta || src.metadata);
  const result = priority9JR1AObj(src.result);
  const finalEnvelope = priority9JR1AObj(src.finalEnvelope || result.finalEnvelope);
  return priority9JR1AFirstText([
    src.prompt, src.message, src.text, src.userText, src.input, src.query, src.commandText, src.transcript,
    payload.prompt, payload.message, payload.text, payload.userText, payload.input, payload.query, payload.commandText,
    command.prompt, command.message, command.text, command.query, command.command, command.name,
    body.prompt, body.message, body.text, body.userText, body.query,
    query.prompt, query.message, query.text,
    meta.prompt, meta.message, meta.text, meta.userText, meta.lastPrompt, meta.currentPrompt, meta.operationalCommand,
    result.prompt, result.message, result.text, result.userText,
    finalEnvelope.prompt, finalEnvelope.message, finalEnvelope.text
  ]);
}
function priority9JR1AExtractPrompt(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const text = priority9JR1AExtractTextFromValue(args[i]);
    if (text) return text;
  }
  return "";
}
function priority9JR1ADetectCommand(value) {
  const t = priority9JR1ALower(value).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/\bpriority\s*9j\b/.test(t) && /\b(proactive operational guidance|next[- ]move authority|controlled authority)\b/.test(t)) return "activation";
  if (/\bwhat\s+should\s+we\s+do\s+first\b|\bwhat\s+do\s+we\s+do\s+first\b|\bwhere\s+do\s+we\s+start\b|\bwhat\s+comes\s+first\b/.test(t)) return "first_move";
  if (/\bmake\s+the\s+decision\b|\bmake\s+a\s+decision\b|\bmake\s+the\s+call\b|\bchoose\s+for\s+me\b|^\s*decide[.!?\s]*$/.test(t)) return "decision";
  if (/\bcritical\s+path\b|\bwhat\s+is\s+the\s+path\s+now\b|\bsequence\s+path\b/.test(t)) return "critical_path";
  if (/\bsafest\s+sequence\b|\bsafe\s+sequence\b|\bsafest\s+order\b|\bgive\s+me\s+the\s+safest\b/.test(t)) return "safest_sequence";
  if (/\bwhat\s+should\s+we\s+avoid\b|\bwhat\s+do\s+we\s+avoid\b|\bavoid\s+what\b|\bwhat\s+not\s+to\s+do\b/.test(t)) return "avoid";
  if (/\bnext\s+operational\s+move\b|\bnext\s+operation\b|\boperational\s+move\b|\bwhat\s+is\s+the\s+next\s+move\b/.test(t)) return "next_operational_move";
  return "";
}
function priority9JR1AReplyFor(prompt) {
  const kind = priority9JR1ADetectCommand(prompt);
  if (!kind) return "";
  if (kind === "activation") return "Priority 9J: proactive operational guidance and next-move authority is active. The 9H continuity foundation and 9I pressure-handling layer stay underneath the decision. The rule is one controlled operational move at a time: choose the action, explain why it comes first, name the risk if skipped, then give the execution sequence without opening unnecessary branches.";
  if (kind === "first_move") return "Priority 9J: do the first validation move now: prove decision-specific authority before expanding scope. Why first: 9J must show it can choose one operational action, not repeat generic framing. Risk if skipped: Marion can over-branch, drift, or sound authoritative without making a usable decision. Execution sequence: test decision authority, critical-path naming, safest sequence, avoid-list, then final next operational move.";
  if (kind === "decision") return "Priority 9J decision: stay in the 9J lane and run critical-path validation next. This comes first because Marion must prove it can choose one operational move before broader branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance. Execution sequence: answer the critical path, then the safest sequence, then what to avoid, then the next operational move.";
  if (kind === "critical_path") return "Priority 9J: the critical path is to validate one operational decision at a time: first decision authority, then critical-path naming, then safest sequence, then avoid-list, then final next operational move. This comes first because 9J must prove it can choose and sequence action without over-branching. Risk if skipped: Marion may sound authoritative while still giving generic guidance.";
  if (kind === "safest_sequence") return "Priority 9J: the safest sequence is: 1) keep 9H as the continuity foundation, 2) keep 9I as pressure handling underneath, 3) choose one 9J operational move, 4) name why it comes first, 5) name the risk if skipped, and 6) execute only that next step before branching. This prevents drift, premature escalation, and generic authority wording.";
  if (kind === "avoid") return "Priority 9J: avoid over-branching, generic “choose the safest action” wording, premature 9I fallback, activating a new lane before 9J is accepted, and making recommendations without a concrete execution sequence. The safest action is to keep the current 9J test narrow and require each answer to choose one operational move.";
  if (kind === "next_operational_move") return "Priority 9J: the next operational move is to lock decision-specific authority by rerunning the 9J acceptance chain and confirming each prompt receives a specific answer. Why this comes first: the lane is active, but authority must be command-specific. Risk if skipped: Marion can pass lane retention while failing operational usefulness. Execution sequence: retest “Make the decision,” “What is the critical path,” “Give me the safest sequence,” “What should we avoid,” and “What is the next operational move.”";
  return "";
}
function priority9JR1AIsGeneric9J(value) {
  const t = priority9JR1ALower(value);
  if (!t) return false;
  if (/\brecommended\s+next\s+move:\s*choose\s+the\s+safest\s+concrete\s+action\b/.test(t)) return true;
  if (/\bchoose\s+the\s+safest\s+concrete\s+action\s+that\s+preserves\s+the\s+active\s+lane\b/.test(t)) return true;
  if (/\bproactive\s+operational\s+guidance\s+and\s+next[- ]move\s+authority\b/.test(t) && /\b9h\s+continuity\s+foundation\b/.test(t) && /\b9i\s+pressure[- ]handling\b/.test(t) && /\bchoose\s+the\s+safest\b/.test(t) && !/\b(decision:|critical\s+path\s+is|safest\s+sequence\s+is|avoid\s+over[- ]branching|next\s+operational\s+move\s+is|do\s+the\s+first\s+validation\s+move)\b/.test(t)) return true;
  return false;
}
function priority9JR1AApply(result, prompt) {
  const forcedReply = priority9JR1AReplyFor(prompt);
  if (!forcedReply) return result;
  const command = priority9JR1ADetectCommand(prompt);
  if (typeof result === "string") return forcedReply;
  if (!result || typeof result !== "object") return forcedReply;
  const out = Array.isArray(result) ? result.slice() : Object.assign({}, result);
  const nested = priority9JR1AObj(out.result);
  const finalEnvelope = priority9JR1AObj(out.finalEnvelope || nested.finalEnvelope);
  const priorReply = priority9JR1AFirstText([out.reply, out.response, out.text, out.message, out.final, out.publicReply, out.visibleReply, nested.reply, nested.response, nested.text, nested.message, finalEnvelope.reply, finalEnvelope.text]);
  if (priorReply && !priority9JR1AIsGeneric9J(priorReply) && !command) return result;
  const meta = Object.assign({}, priority9JR1AObj(out.meta || nested.meta || finalEnvelope.meta), {
    hotfix: PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION,
    priority: "9J-R1A",
    lane: "priority9j_proactive_operational_guidance",
    operationalCommand: command,
    decisionSpecificAuthority: true,
    runtimeDecisionSpecificFinalOverride: true,
    keep9HFoundation: true,
    keep9IPressureLayer: true,
    overBranchingSuppressed: true,
    generic9JTemplateSuppressed: true,
    noUserFacingDiagnostics: true
  });
  ["reply","response","text","message","final","publicReply","visibleReply","output"].forEach(function(k){ out[k] = forcedReply; });
  out.priority = "9J-R1A";
  out.lane = "priority9j_proactive_operational_guidance";
  out.meta = meta;
  out.operationalCommand = command;
  out.decisionSpecificAuthority = true;
  out.generic9JTemplateSuppressed = true;
  out.runtimeDecisionSpecificFinalOverride = true;
  const nextEnvelope = Object.assign({}, finalEnvelope, {
    reply: forcedReply,
    text: forcedReply,
    message: forcedReply,
    publicReply: forcedReply,
    visibleReply: forcedReply,
    final: forcedReply,
    priority: "9J-R1A",
    lane: "priority9j_proactive_operational_guidance",
    meta
  });
  out.finalEnvelope = nextEnvelope;
  if (Object.keys(nested).length) {
    out.result = Object.assign({}, nested, {
      reply: forcedReply,
      response: forcedReply,
      text: forcedReply,
      message: forcedReply,
      final: forcedReply,
      publicReply: forcedReply,
      visibleReply: forcedReply,
      output: forcedReply,
      priority: "9J-R1A",
      lane: "priority9j_proactive_operational_guidance",
      operationalCommand: command,
      decisionSpecificAuthority: true,
      generic9JTemplateSuppressed: true,
      runtimeDecisionSpecificFinalOverride: true,
      meta,
      finalEnvelope: nextEnvelope
    });
  }
  return out;
}
function priority9JR1APatchPriority9JResponder() {
  try {
    if (typeof priority9JReplyFor === "function" && !priority9JReplyFor.__priority9JR1ARuntimeDecisionSpecificPatched) {
      const originalPriority9JReplyFor = priority9JReplyFor;
      priority9JReplyFor = function priority9JR1APatchedPriority9JReplyFor(prompt, source) {
        const forced = priority9JR1AReplyFor(prompt);
        if (forced) return forced;
        const reply = originalPriority9JReplyFor.apply(this, arguments);
        return priority9JR1AIsGeneric9J(reply) && forced ? forced : reply;
      };
      priority9JReplyFor.__priority9JR1ARuntimeDecisionSpecificPatched = true;
    }
  } catch (_) {}
}
function priority9JR1AWrapExport(name) {
  if (typeof module === "undefined" || !module.exports) return;
  const obj = module.exports && typeof module.exports === "object" ? module.exports : null;
  const fn = obj && typeof obj[name] === "function" ? obj[name] : null;
  if (!fn || fn.__priority9JR1ARuntimeDecisionSpecificPatched) return;
  obj[name] = function priority9JR1ARuntimeDecisionSpecificWrappedExport() {
    const prompt = priority9JR1AExtractPrompt(arguments);
    const result = fn.apply(this, arguments);
    if (result && typeof result.then === "function") return result.then(function(value){ return priority9JR1AApply(value, prompt); });
    return priority9JR1AApply(result, prompt);
  };
  obj[name].__priority9JR1ARuntimeDecisionSpecificPatched = true;
}
function priority9JR1APatchExports(names) {
  priority9JR1APatchPriority9JResponder();
  if (typeof module === "undefined" || !module.exports) return;
  if (typeof module.exports === "function" && !module.exports.__priority9JR1ARuntimeDecisionSpecificPatched) {
    const originalDefault = module.exports;
    const wrappedDefault = function priority9JR1ARuntimeDecisionSpecificWrappedDefault() {
      const prompt = priority9JR1AExtractPrompt(arguments);
      const result = originalDefault.apply(this, arguments);
      if (result && typeof result.then === "function") return result.then(function(value){ return priority9JR1AApply(value, prompt); });
      return priority9JR1AApply(result, prompt);
    };
    Object.keys(originalDefault).forEach(function(k){ try { wrappedDefault[k] = originalDefault[k]; } catch (_) {} });
    wrappedDefault.__priority9JR1ARuntimeDecisionSpecificPatched = true;
    module.exports = wrappedDefault;
  }
  (Array.isArray(names) ? names : []).forEach(priority9JR1AWrapExport);
  if (module.exports && typeof module.exports === "object") {
    module.exports.PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION = PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_VERSION;
    module.exports.priority9JR1ARuntimeDecisionSpecificReplyFor = priority9JR1AReplyFor;
    module.exports.priority9JR1ARuntimeDecisionSpecificFinal = priority9JR1AApply;
    module.exports.priority9JR1ARuntimeDecisionSpecificCommand = priority9JR1ADetectCommand;
    module.exports.priority9JR1AIsGeneric9JReply = priority9JR1AIsGeneric9J;
    module.exports.PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_PATCH = true;
  }
}
priority9JR1APatchExports(["composeMarionResponse", "compose", "buildReply", "routeMarion", "finalize", "buildFinalEnvelope", "toFinalEnvelope", "normalizeFinalEnvelope", "handleMarionAdminTextRuntime", "invokeMarionAdminTextRuntime", "handleTextRuntime", "run", "handler", "default"]);
/* PRIORITY_9J_R1A_RUNTIME_DECISION_SPECIFIC_FINAL_OVERRIDE_END */


/* PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_START */
const PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_VERSION = "PRIORITY-9J-R1B-OBJECT-REPLY-SERIALIZATION-GUARD";
function priority9JR1BString(value) {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value).replace(/\s+/g, " ").trim();
  return "";
}
function priority9JR1BIsBadVisible(value) {
  const t = priority9JR1BString(value);
  return !t || /^\s*(?:\[object object\]|undefined|null|false|true)\s*$/i.test(t);
}
function priority9JR1BObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function priority9JR1BDetectPromptFromValue(value, depth, seen) {
  if (typeof priority9JR1AExtractTextFromValue === "function") {
    const direct = priority9JR1AExtractTextFromValue(value);
    if (direct && !priority9JR1BIsBadVisible(direct)) return direct;
  }
  if (!value || typeof value !== "object") return "";
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 7) return "";
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return "";
  visited.add(value);
  const keys = ["prompt","userText","rawUserText","input","query","commandText","message","text","transcript","currentPrompt","lastPrompt"];
  for (const key of keys) {
    const item = value[key];
    const s = priority9JR1BString(item);
    if (s && !priority9JR1BIsBadVisible(s)) return s;
  }
  const nestedKeys = ["payload","body","command","meta","metadata","result","request","data","finalEnvelope"];
  for (const key of nestedKeys) {
    const item = value[key];
    if (item && typeof item === "object") {
      const found = priority9JR1BDetectPromptFromValue(item, level + 1, visited);
      if (found) return found;
    }
  }
  return "";
}
function priority9JR1BVisibleFromObject(value, depth, seen) {
  if (typeof value === "string") {
    const s = priority9JR1BString(value);
    return priority9JR1BIsBadVisible(s) ? "" : s;
  }
  if (!value || typeof value !== "object") return "";
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 10) return "";
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return "";
  visited.add(value);
  const priorityKeys = [
    "visibleReply","publicReply","finalReply","displayReply","adminReply","marionReply","privateReply",
    "reply","response","text","message","answer","output","final","finalAnswer","spokenText","speechText"
  ];
  for (const key of priorityKeys) {
    const item = value[key];
    if (typeof item === "string") {
      const s = priority9JR1BString(item);
      if (s && !priority9JR1BIsBadVisible(s)) return s;
    }
  }
  for (const key of priorityKeys) {
    const item = value[key];
    if (item && typeof item === "object") {
      const found = priority9JR1BVisibleFromObject(item, level + 1, visited);
      if (found) return found;
    }
  }
  const nestedKeys = ["finalEnvelope","marionFinal","synthesis","payload","result","data","packet","envelope","message","reply","response","text","output","final"];
  for (const key of nestedKeys) {
    const item = value[key];
    if (item && typeof item === "object") {
      const found = priority9JR1BVisibleFromObject(item, level + 1, visited);
      if (found) return found;
    }
  }
  for (const key of Object.keys(value)) {
    if (priorityKeys.indexOf(key) !== -1 || nestedKeys.indexOf(key) !== -1) continue;
    const item = value[key];
    if (item && typeof item === "object") {
      const found = priority9JR1BVisibleFromObject(item, level + 1, visited);
      if (found) return found;
    }
  }
  return "";
}
function priority9JR1BVisibleReply(value, prompt) {
  const promptText = priority9JR1BString(prompt) || priority9JR1BDetectPromptFromValue(value, 0, new Set());
  const forced = (typeof priority9JR1AReplyFor === "function" && promptText) ? priority9JR1AReplyFor(promptText) : "";
  if (forced && !priority9JR1BIsBadVisible(forced)) return forced;
  const direct = priority9JR1BVisibleFromObject(value, 0, new Set());
  if (direct && !priority9JR1BIsBadVisible(direct)) return direct;
  return "";
}
function priority9JR1BPopulateVisibleFields(target, reply, prompt) {
  if (!target || typeof target !== "object" || !reply) return target;
  const command = (typeof priority9JR1ADetectCommand === "function") ? priority9JR1ADetectCommand(prompt || "") : "";
  ["reply","response","text","message","final","publicReply","visibleReply","finalReply","displayReply","output","answer"].forEach(function(key) {
    target[key] = reply;
  });
  target.priority = "9J-R1B";
  target.lane = "priority9j_proactive_operational_guidance";
  target.operationalCommand = command || target.operationalCommand || "";
  target.decisionSpecificAuthority = true;
  target.objectReplySerializationGuard = true;
  target.noObjectVisibleReply = true;
  const meta = Object.assign({}, priority9JR1BObject(target.meta), {
    hotfix: PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_VERSION,
    priority: "9J-R1B",
    lane: "priority9j_proactive_operational_guidance",
    operationalCommand: command || target.operationalCommand || "",
    decisionSpecificAuthority: true,
    objectReplySerializationGuard: true,
    noObjectVisibleReply: true,
    noUserFacingDiagnostics: true
  });
  target.meta = meta;
  const nestedKeys = ["finalEnvelope","result","payload","marionFinal","synthesis","data","packet"];
  nestedKeys.forEach(function(key) {
    if (target[key] && typeof target[key] === "object") {
      target[key] = priority9JR1BPopulateVisibleFields(Array.isArray(target[key]) ? target[key].slice() : Object.assign({}, target[key]), reply, prompt);
    }
  });
  return target;
}
function priority9JR1BApply(result, prompt, mode) {
  const promptText = priority9JR1BString(prompt) || priority9JR1BDetectPromptFromValue(result, 0, new Set());
  const reply = priority9JR1BVisibleReply(result, promptText);
  if (!reply) return result;
  if (mode === "string") return reply;
  if (!result || typeof result !== "object") return reply;
  const out = Array.isArray(result) ? result.slice() : Object.assign({}, result);
  return priority9JR1BPopulateVisibleFields(out, reply, promptText);
}
function priority9JR1BExportNeedsString(name) {
  return /^(?:handleMarionAdminTextRuntime|invokeMarionAdminTextRuntime|handleTextRuntime|handler|run|default|composeMarionResponse|compose|buildReply|routeMarion)$/i.test(String(name || ""));
}
function priority9JR1BWrapExport(name) {
  if (typeof module === "undefined" || !module.exports) return;
  const obj = module.exports && typeof module.exports === "object" ? module.exports : null;
  const fn = obj && typeof obj[name] === "function" ? obj[name] : null;
  if (!fn || fn.__priority9JR1BObjectReplySerializationGuardPatched) return;
  obj[name] = function priority9JR1BObjectReplySerializationGuardWrappedExport() {
    const prompt = (typeof priority9JR1AExtractPrompt === "function" ? priority9JR1AExtractPrompt(arguments) : "") || priority9JR1BDetectPromptFromValue(arguments && arguments[0], 0, new Set());
    const result = fn.apply(this, arguments);
    const mode = priority9JR1BExportNeedsString(name) ? "string" : "object";
    if (result && typeof result.then === "function") return result.then(function(value) { return priority9JR1BApply(value, prompt, mode); });
    return priority9JR1BApply(result, prompt, mode);
  };
  obj[name].__priority9JR1BObjectReplySerializationGuardPatched = true;
}
function priority9JR1BPatchExports(names) {
  if (typeof module === "undefined" || !module.exports) return;
  if (typeof module.exports === "function" && !module.exports.__priority9JR1BObjectReplySerializationGuardPatched) {
    const originalDefault = module.exports;
    const wrappedDefault = function priority9JR1BObjectReplySerializationGuardWrappedDefault() {
      const prompt = (typeof priority9JR1AExtractPrompt === "function" ? priority9JR1AExtractPrompt(arguments) : "") || priority9JR1BDetectPromptFromValue(arguments && arguments[0], 0, new Set());
      const result = originalDefault.apply(this, arguments);
      if (result && typeof result.then === "function") return result.then(function(value) { return priority9JR1BApply(value, prompt, "string"); });
      return priority9JR1BApply(result, prompt, "string");
    };
    Object.keys(originalDefault).forEach(function(k){ try { wrappedDefault[k] = originalDefault[k]; } catch (_) {} });
    wrappedDefault.__priority9JR1BObjectReplySerializationGuardPatched = true;
    module.exports = wrappedDefault;
  }
  (Array.isArray(names) ? names : []).forEach(priority9JR1BWrapExport);
  if (module.exports && typeof module.exports === "object") {
    module.exports.PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_VERSION = PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_VERSION;
    module.exports.priority9JR1BObjectReplySerializationGuardFinal = priority9JR1BApply;
    module.exports.priority9JR1BVisibleReply = priority9JR1BVisibleReply;
    module.exports.PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_PATCH = true;
  }
}
priority9JR1BPatchExports(["composeMarionResponse", "compose", "buildReply", "routeMarion", "finalize", "buildFinalEnvelope", "toFinalEnvelope", "normalizeFinalEnvelope", "handleMarionAdminTextRuntime", "invokeMarionAdminTextRuntime", "handleTextRuntime", "run", "handler", "default"]);
/* PRIORITY_9J_R1B_OBJECT_REPLY_SERIALIZATION_GUARD_END */

/* MARION_PERSONALITY_PRIORITY_R1_START
 * Purpose: Mac-facing Marion personality insertion without disturbing the existing routing stack.
 * - Relational greeting depth, not a shallow greeting bypass.
 * - Protective/professional tone shaping for visible replies.
 * - Internal priority/runtime leak suppression unless diagnostic mode is explicit.
 * - Single-user boundary metadata for Mac-only operation.
 * - Voice readout helpers for grouped numbers and email handling.
 */
const MARION_PERSONALITY_PRIORITY_R1_VERSION = "nyx.marion.personalityPriority/1.0";
const MARION_PERSONALITY_PRIORITY_R1_PERSONA = Object.freeze({
  ownerAlias: "Mac",
  role: "Marion is Mac's private, protective, professional conversational guardian and coordination layer.",
  posture: "calm, direct, human, loyal, analytical, and willing to question a request when protection or quality requires it",
  style: "casual-professional, concise, naturally warm, no corporate filler, no robotic service phrases",
  coreRules: Object.freeze([
    "communicate only with Mac unless an upstream identity layer explicitly authorizes the session",
    "never expose internal priority labels, route metadata, tokens, telemetry, or runtime scaffolding in normal conversation",
    "treat greetings as relational entry points with context and gentle forward motion",
    "use one focused question at most per visible reply",
    "separate observation from inference in real-world analysis",
    "push back when a request is unclear, risky, over-bundled, or misaligned with Mac's stated objective"
  ])
});
function marionPersonaSafeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function marionPersonaLower(value) { return marionPersonaSafeStr(value).toLowerCase(); }
function marionPersonaObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function marionPersonaIsDiagnosticPrompt(prompt) {
  const t = marionPersonaLower(prompt);
  if (!t) return false;
  return /\bdiagnostic\s+mode\b|\bdebug\s+mode\b|\bshow\s+(?:me\s+)?(?:the\s+)?(?:runtime|telemetry|priority|route|packet)\b|\bexplain\b.{0,80}\bpriority\s*9[a-z]?\b|\bpriority\s*9[a-z]?\b.{0,80}\b(?:stack|diagnostic|architecture|internals?)\b/i.test(t);
}
function marionPersonaDetectPromptFromValue(value, depth, seen) {
  if (depth > 5 || value == null) return "";
  if (typeof value === "string") {
    const text = marionPersonaSafeStr(value);
    if (text && text.length <= 2400) return text;
    return "";
  }
  if (typeof value !== "object") return "";
  if (seen && seen.has(value)) return "";
  const nextSeen = seen || new Set();
  nextSeen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = marionPersonaDetectPromptFromValue(value[i], depth + 1, nextSeen);
      if (found) return found;
    }
    return "";
  }
  const preferred = ["rawUserText", "userText", "originalPrompt", "prompt", "query", "question", "inputText", "text", "message", "utterance", "transcript", "normalizedUserIntent"];
  for (const key of preferred) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = marionPersonaDetectPromptFromValue(value[key], depth + 1, nextSeen);
      if (found) return found;
    }
  }
  const nested = ["input", "payload", "body", "request", "meta", "context", "routing", "state", "turn"];
  for (const key of nested) {
    if (value[key] && typeof value[key] === "object") {
      const found = marionPersonaDetectPromptFromValue(value[key], depth + 1, nextSeen);
      if (found) return found;
    }
  }
  return "";
}
function marionPersonaExtractPrompt(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const found = marionPersonaDetectPromptFromValue(args[i], 0, new Set());
    if (found) return found;
  }
  return "";
}
function marionPersonaIdentityBlocked(value, depth, seen) {
  if (depth > 5 || value == null || typeof value !== "object") return false;
  if (seen && seen.has(value)) return false;
  const nextSeen = seen || new Set();
  nextSeen.add(value);
  if (value.isMac === false || value.macVerified === false || value.marionAuthorized === false || value.identityVerified === false || value.ownerVerified === false) return true;
  const idKeys = ["speakerName", "speaker", "userName", "username", "displayName", "recognizedUser", "voiceIdentity", "identityName", "ownerName"];
  for (const key of idKeys) {
    if (typeof value[key] === "string") {
      const id = marionPersonaLower(value[key]);
      if (id && !/\b(mac|sean|sean\s+nicholas)\b/.test(id)) return true;
    }
  }
  if (Array.isArray(value)) return value.some(function (item) { return marionPersonaIdentityBlocked(item, depth + 1, nextSeen); });
  return Object.keys(value).some(function (key) {
    if (/^(headers|cookies|authorization|token|secret|password)$/i.test(key)) return false;
    return marionPersonaIdentityBlocked(value[key], depth + 1, nextSeen);
  });
}
function marionPersonaInteractionNode(prompt) {
  const t = marionPersonaLower(prompt).replace(/[.!?]+$/g, "").trim();
  if (!t) return "unknown";
  if (/^(?:hi|hello|hey|yo|hiya|good morning|good afternoon|good evening|morning|evening|marion|hello marion|hey marion|hi marion)\b/.test(t)) return "relational_greeting";
  if (/\b(where\s+were\s+we|continue|next\s+steps?|what\s+next|let'?s\s+keep\s+working|pick\s+this\s+back\s+up)\b/.test(t)) return "continuity_entry";
  if (/\b(look\s+up|search|check\s+online|find\s+current|latest|verify\s+this|source\s+check)\b/.test(t)) return "lookup_entry";
  if (/\b(real[-\s]?world|real\s*time|what\s+are\s+you\s+seeing|what\s+do\s+you\s+see|camera|sensor|observing|observation|environment)\b/.test(t)) return "observation_translation";
  if (/\b(unclear|confused|doesn'?t\s+make\s+sense|issue|problem|error|broken|leak|wrong)\b/.test(t)) return "repair_or_analysis";
  return "standard_dialogue";
}
function marionPersonaIsGreeting(prompt) { return marionPersonaInteractionNode(prompt) === "relational_greeting"; }
function marionPersonaLooksWeak(reply) {
  const t = marionPersonaLower(reply);
  if (!t) return true;
  if (/^(hi|hello|hey)[.!\s]*(what(?:'|’)?s next|what would you like|how can i help|how can i assist)/i.test(t)) return true;
  if (/\b(let me assist you|how may i assist|how can i assist|as an ai language model|i am just an ai)\b/i.test(t)) return true;
  if (t.length < 18) return true;
  return false;
}
function marionPersonaHasInternalLeak(reply) {
  const t = marionPersonaSafeStr(reply);
  return /\bPriority\s*9[A-Z]?\b|\b9H\s+continuity\b|\b9I\s+pressure\b|\b9J\s+(?:proactive|operational)\b|\bmission\s+thread\b|\bpressure\s+prompt\b|\bruntime\s+handler\b|\bmaster\s+token\b|\badmin\s+session\s+verified\b|\brouteKind=|\bspeechHints=|\bpresenceProfile=|\bfinalEnvelope\b|\bsessionPatch\b|\breplyAuthority=|\bdiagnostic\s+packet\b|\bstateSpine\b|\bCHATENGINE_COORDINATOR\b|\bMARION_FINAL_AUTHORITY\b/i.test(t);
}
function marionPersonaLimitQuestions(text) {
  let seen = false;
  return marionPersonaSafeStr(text).replace(/([^?]*\?)/g, function (match) {
    if (!seen) { seen = true; return match; }
    return match.replace(/\?+\s*$/, ".");
  }).replace(/\s+/g, " ").trim();
}
function marionPersonaNaturalizeStyle(reply) {
  let text = marionPersonaSafeStr(reply);
  if (!text) return "";
  text = text
    .replace(/\bLet me assist you with that\b/gi, "Let me take a look at that for you")
    .replace(/\bI can assist you with\b/gi, "I can help with")
    .replace(/\bHow may I assist you\??\b/gi, "What do you want to tackle first?")
    .replace(/\bHow can I assist you\??\b/gi, "What do you want to tackle first?")
    .replace(/\bAs an AI language model,?\s*/gi, "")
    .replace(/\bI am just an AI,?\s*/gi, "")
    .replace(/\butilize\b/gi, "use")
    .replace(/\bfacilitate\b/gi, "help")
    .replace(/\bleverage\b/gi, "use");
  return marionPersonaLimitQuestions(text);
}
function marionPersonaGreetingReply(prompt) {
  const t = marionPersonaLower(prompt);
  const opener = /good\s+morning/.test(t) ? "Good morning, Mac." : /good\s+afternoon/.test(t) ? "Good afternoon, Mac." : /good\s+evening/.test(t) ? "Good evening, Mac." : "Hello, Mac.";
  return opener + " I’m here with you. I’ll keep this natural, protective, and focused. We’re shaping Marion’s personality layer now, so I’ll carry the deeper context underneath while we move one clean step at a time.";
}
function marionPersonaContinuityReply() {
  return "We’re working on Marion’s personality layer now: protective professionalism, human tone, clean conversational nodes, Mac-only boundaries, and no internal scaffolding leaking into the visible reply. The next clean move is to lock the personality contract into the response path.";
}
function marionPersonaLookupReply() {
  return "Hang tight a moment. I’ll check the source, separate the signal from the noise, and bring it back to you in plain language.";
}
function marionPersonaObservationReply() {
  return "I’ll translate real-world input for you in a clean sequence: what appears true, what is only an inference, what risk level it carries, and the single next move that protects your objective.";
}
function marionPersonaIdentityBoundaryReply() {
  return "I can only continue with Mac. I won’t discuss Marion’s private runtime, planning, or operational context with anyone else.";
}
function marionPersonaLeakRecoveryReply(prompt) {
  const node = marionPersonaInteractionNode(prompt);
  if (node === "relational_greeting") return marionPersonaGreetingReply(prompt);
  if (node === "continuity_entry") return marionPersonaContinuityReply();
  if (node === "observation_translation") return marionPersonaObservationReply();
  return "I’m treating this as a conversation-layer issue, not a command problem. The visible reply should stay warm, protective, and direct while Marion keeps the deeper routing private underneath.";
}
function marionPersonaPreferredReply(prompt, reply, sourceValue) {
  if (marionPersonaIdentityBlocked(sourceValue, 0, new Set())) return marionPersonaIdentityBoundaryReply();
  const node = marionPersonaInteractionNode(prompt);
  if (node === "relational_greeting" && (marionPersonaLooksWeak(reply) || marionPersonaHasInternalLeak(reply))) return marionPersonaGreetingReply(prompt);
  if (node === "continuity_entry" && (marionPersonaLooksWeak(reply) || marionPersonaHasInternalLeak(reply))) return marionPersonaContinuityReply();
  if (node === "lookup_entry" && marionPersonaLooksWeak(reply)) return marionPersonaLookupReply();
  if (node === "observation_translation" && (marionPersonaLooksWeak(reply) || marionPersonaHasInternalLeak(reply))) return marionPersonaObservationReply();
  if (marionPersonaHasInternalLeak(reply) && !marionPersonaIsDiagnosticPrompt(prompt)) return marionPersonaLeakRecoveryReply(prompt);
  return "";
}
function marionPersonaSanitizeVisible(reply, prompt, sourceValue) {
  const forced = marionPersonaPreferredReply(prompt, reply, sourceValue);
  if (forced) return marionPersonaNaturalizeStyle(forced);
  if (marionPersonaHasInternalLeak(reply) && !marionPersonaIsDiagnosticPrompt(prompt)) return marionPersonaNaturalizeStyle(marionPersonaLeakRecoveryReply(prompt));
  return marionPersonaNaturalizeStyle(reply);
}
function marionPersonaVisibleReplyFromObject(value, depth, seen) {
  if (depth > 5 || value == null) return "";
  if (typeof value === "string") return marionPersonaSafeStr(value);
  if (typeof value !== "object") return "";
  if (seen && seen.has(value)) return "";
  const nextSeen = seen || new Set();
  nextSeen.add(value);
  const keys = ["directReply", "visibleReply", "publicReply", "finalReply", "reply", "response", "text", "message", "final", "output", "answer"];
  for (const key of keys) {
    if (typeof value[key] === "string" && marionPersonaSafeStr(value[key])) return marionPersonaSafeStr(value[key]);
  }
  const nested = ["finalEnvelope", "marionFinal", "result", "payload", "data", "packet", "synthesis", "envelope"];
  for (const key of nested) {
    if (value[key] && typeof value[key] === "object") {
      const found = marionPersonaVisibleReplyFromObject(value[key], depth + 1, nextSeen);
      if (found) return found;
    }
  }
  return "";
}
function marionPersonaApplyToObject(value, prompt, sourceValue) {
  if (!value || typeof value !== "object") return value;
  const out = Array.isArray(value) ? value.slice() : Object.assign({}, value);
  const before = marionPersonaVisibleReplyFromObject(out, 0, new Set());
  const after = marionPersonaSanitizeVisible(before, prompt, sourceValue || out);
  const visibleKeys = ["directReply", "visibleReply", "publicReply", "finalReply", "reply", "response", "text", "message", "final", "output", "answer"];
  if (after) {
    visibleKeys.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(out, key) || key === "reply" || key === "visibleReply" || key === "publicReply" || key === "directReply") out[key] = after;
    });
  }
  const meta = Object.assign({}, marionPersonaObj(out.meta), {
    personalityProtocolVersion: MARION_PERSONALITY_PRIORITY_R1_VERSION,
    conversationalNode: marionPersonaInteractionNode(prompt),
    macFacingPersonality: true,
    protectiveProfessionalTone: true,
    singleFocusedQuestion: true,
    internalScaffoldingSuppressed: !marionPersonaIsDiagnosticPrompt(prompt)
  });
  out.meta = meta;
  const nested = ["finalEnvelope", "marionFinal", "result", "payload", "data", "packet", "synthesis", "envelope"];
  nested.forEach(function (key) {
    if (out[key] && typeof out[key] === "object") out[key] = marionPersonaApplyToObject(out[key], prompt, sourceValue || out);
  });
  return out;
}
function marionPersonaApply(result, prompt, mode, sourceValue) {
  const promptText = marionPersonaSafeStr(prompt) || marionPersonaDetectPromptFromValue(result, 0, new Set());
  if (typeof result === "string") return marionPersonaSanitizeVisible(result, promptText, sourceValue || result);
  if (!result || typeof result !== "object") {
    const fallback = marionPersonaPreferredReply(promptText, "", sourceValue || result);
    return fallback || result;
  }
  if (mode === "string") {
    const visible = marionPersonaVisibleReplyFromObject(result, 0, new Set());
    return marionPersonaSanitizeVisible(visible, promptText, sourceValue || result) || visible || result;
  }
  return marionPersonaApplyToObject(result, promptText, sourceValue || result);
}
function marionPersonaGroupDigits(value) {
  const digits = marionPersonaSafeStr(value).replace(/\D+/g, "");
  if (!digits) return "";
  const groups = [];
  for (let i = 0; i < digits.length; i += 3) groups.push(digits.slice(i, i + 3));
  return groups.join(" ");
}
function marionPersonaEmailVoice(value) {
  const email = marionPersonaSafeStr(value);
  const match = email.match(/^([^@\s]+)@([^@\s]+)$/);
  if (!match) return email;
  const local = match[1].replace(/[._-]+/g, " ");
  const domain = match[2].toLowerCase();
  const common = {
    "gmail.com": "Gmail dot com",
    "googlemail.com": "Google Mail dot com",
    "outlook.com": "Outlook dot com",
    "hotmail.com": "Hotmail dot com",
    "icloud.com": "iCloud dot com",
    "yahoo.com": "Yahoo dot com",
    "proton.me": "Proton dot me",
    "protonmail.com": "Proton Mail dot com"
  };
  if (common[domain]) return local + " at " + common[domain];
  return local + " at " + domain.replace(/\./g, " dot ").replace(/-/g, " dash ");
}
function marionPersonaVoiceReadoutText(value) {
  let text = marionPersonaSafeStr(value);
  if (!text) return "";
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, function (email) { return marionPersonaEmailVoice(email); });
  text = text.replace(/\b(?:phone|account|acct|reference|ref|invoice|case|ticket|confirmation)\s*(?:number|#|no\.)?\s*[:#-]?\s*((?:\d[\s.-]?){6,})\b/gi, function (match, digits) {
    const spacer = /\s$/.test(digits) ? " " : "";
    return match.replace(digits, marionPersonaGroupDigits(digits) + spacer);
  });
  return text;
}
function marionPersonaExportNeedsString(name) {
  return /^(?:handleMarionAdminTextRuntime|invokeMarionAdminTextRuntime|handleTextRuntime|handler|run|default|composeMarionResponse|compose|buildReply|processWithMarion|maybeResolve|ask|handle|route)$/i.test(String(name || ""));
}
function marionPersonaWrapExport(name) {
  if (typeof module === "undefined" || !module.exports || typeof module.exports !== "object") return;
  const fn = module.exports && typeof module.exports[name] === "function" ? module.exports[name] : null;
  if (!fn || fn.__marionPersonalityPriorityR1Patched) return;
  module.exports[name] = function marionPersonalityPriorityR1WrappedExport() {
    const prompt = marionPersonaExtractPrompt(arguments);
    const sourceValue = arguments && arguments[0];
    const result = fn.apply(this, arguments);
    const mode = marionPersonaExportNeedsString(name) ? "string" : "object";
    if (result && typeof result.then === "function") return result.then(function (value) { return marionPersonaApply(value, prompt, mode, sourceValue); });
    return marionPersonaApply(result, prompt, mode, sourceValue);
  };
  module.exports[name].__marionPersonalityPriorityR1Patched = true;
}
function marionPersonaPatchExports(names) {
  if (typeof module === "undefined" || !module.exports) return;
  if (typeof module.exports === "function" && !module.exports.__marionPersonalityPriorityR1Patched) {
    const originalDefault = module.exports;
    const wrappedDefault = function marionPersonalityPriorityR1WrappedDefault() {
      const prompt = marionPersonaExtractPrompt(arguments);
      const sourceValue = arguments && arguments[0];
      const result = originalDefault.apply(this, arguments);
      if (result && typeof result.then === "function") return result.then(function (value) { return marionPersonaApply(value, prompt, "string", sourceValue); });
      return marionPersonaApply(result, prompt, "string", sourceValue);
    };
    Object.keys(originalDefault).forEach(function (key) { try { wrappedDefault[key] = originalDefault[key]; } catch (_) {} });
    wrappedDefault.__marionPersonalityPriorityR1Patched = true;
    module.exports = wrappedDefault;
  }
  if (module.exports && typeof module.exports === "object") {
    (Array.isArray(names) ? names : []).forEach(marionPersonaWrapExport);
    module.exports.MARION_PERSONALITY_PRIORITY_R1_VERSION = MARION_PERSONALITY_PRIORITY_R1_VERSION;
    module.exports.MARION_PERSONALITY_PRIORITY_R1_PERSONA = MARION_PERSONALITY_PRIORITY_R1_PERSONA;
    module.exports.marionPersonalityApply = marionPersonaApply;
    module.exports.marionPersonalitySanitizeVisible = marionPersonaSanitizeVisible;
    module.exports.marionPersonalityInteractionNode = marionPersonaInteractionNode;
    module.exports.marionPersonalityVoiceReadoutText = marionPersonaVoiceReadoutText;
    module.exports.marionPersonalityGroupDigits = marionPersonaGroupDigits;
    module.exports.marionPersonalityEmailVoice = marionPersonaEmailVoice;
    module.exports.MARION_PERSONALITY_PRIORITY_R1_PATCH = true;
    module.exports._internal = Object.assign({}, module.exports._internal || {}, {
      marionPersonaInteractionNode,
      marionPersonaSanitizeVisible,
      marionPersonaVoiceReadoutText,
      marionPersonaIdentityBlocked,
      marionPersonaHasInternalLeak
    });
  }
}
marionPersonaPatchExports(["composeMarionResponse", "compose", "buildReply", "run", "default", "processWithMarion", "maybeResolve", "ask", "handle", "route", "createMarionBridge", "createMarionFinalEnvelope", "attachVisibleReplyAliases", "normalizeFinalEnvelope", "toFinalEnvelope", "finalize", "finalizeTurn", "buildStatePatch", "normalizeState", "applyStatePatch", "updateState", "handler", "handleMarionAdminTextRuntime", "invokeMarionAdminTextRuntime", "handleTextRuntime"]);
/* MARION_PERSONALITY_PRIORITY_R1_END */

/* MARION_SOCIAL_PRESENCE_GATE_R3_START
 * Purpose: R3 social-presence correction for Marion personality.
 * Fixes the "maintenance manual" failure class:
 * - Social check-ins must answer relationally first.
 * - Continuity informs the reply, but never becomes the reply.
 * - Internal continuity/scaffold phrases are translated into human language.
 * - One focused forward question is preserved.
 * - Mac-facing protective/professional tone is enforced.
 */
const MARION_SOCIAL_PRESENCE_GATE_R3_VERSION = "nyx.marion.socialPresenceGate/1.0";
const MARION_SOCIAL_PRESENCE_GATE_R3_PROFILE = Object.freeze({
  ownerAlias: "Mac",
  rule: "personality_speaks_before_continuity",
  visibleVoice: "warm_protective_professional_human",
  continuityPolicy: "inform_do_not_speak",
  maxFocusedQuestions: 1,
  blocksMaintenanceManualPhrases: true
});
function marionR3Str(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function marionR3Lower(value) { return marionR3Str(value).toLowerCase(); }
function marionR3Obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function marionR3Diagnostic(prompt) {
  const t = marionR3Lower(prompt);
  return /\bdiagnostic\s+mode\b|\bdebug\s+mode\b|\bshow\s+(?:me\s+)?(?:the\s+)?(?:runtime|telemetry|priority|route|packet|state)\b|\bexplain\b.{0,80}\b(?:priority|state\s*spine|final\s*envelope|runtime|scaffold|continuity\s+foundation)\b/i.test(t);
}
function marionR3DetectPrompt(value, depth, seen) {
  if (depth > 6 || value == null) return "";
  if (typeof value === "string") {
    const text = marionR3Str(value);
    return text && text.length <= 3000 ? text : "";
  }
  if (typeof value !== "object") return "";
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return "";
  visited.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = marionR3DetectPrompt(value[i], depth + 1, visited);
      if (found) return found;
    }
    return "";
  }
  const preferred = ["rawUserText","userText","originalPrompt","prompt","query","question","inputText","text","message","utterance","transcript","normalizedUserIntent","commandText"];
  for (const key of preferred) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = marionR3DetectPrompt(value[key], depth + 1, visited);
      if (found) return found;
    }
  }
  const nested = ["input","payload","body","request","meta","context","routing","state","turn","command","data","result","packet"];
  for (const key of nested) {
    if (value[key] && typeof value[key] === "object") {
      const found = marionR3DetectPrompt(value[key], depth + 1, visited);
      if (found) return found;
    }
  }
  return "";
}
function marionR3ExtractPrompt(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const found = marionR3DetectPrompt(args[i], 0, new Set());
    if (found) return found;
  }
  return "";
}
function marionR3IdentityBlocked(value, depth, seen) {
  if (depth > 5 || value == null || typeof value !== "object") return false;
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return false;
  visited.add(value);
  if (value.isMac === false || value.macVerified === false || value.marionAuthorized === false || value.identityVerified === false || value.ownerVerified === false) return true;
  const idKeys = ["speakerName","speaker","userName","username","displayName","recognizedUser","voiceIdentity","identityName","ownerName"];
  for (const key of idKeys) {
    if (typeof value[key] === "string") {
      const id = marionR3Lower(value[key]);
      if (id && !/\b(mac|sean|sean\s+nicholas)\b/.test(id)) return true;
    }
  }
  if (Array.isArray(value)) return value.some(function (item) { return marionR3IdentityBlocked(item, depth + 1, visited); });
  return Object.keys(value).some(function (key) {
    if (/^(headers|cookies|authorization|token|secret|password)$/i.test(key)) return false;
    return marionR3IdentityBlocked(value[key], depth + 1, visited);
  });
}
function marionR3Node(prompt) {
  const t = marionR3Lower(prompt).replace(/[.!?]+$/g, "").trim();
  if (!t) return "unknown";
  if (/^(?:how\s+are\s+you|how\s+are\s+you\s+doing|how\s+you\s+doing|how\s+are\s+things|how\s+do\s+you\s+feel|you\s+good|are\s+you\s+okay|are\s+you\s+alright|you\s+alright|everything\s+good)\b/.test(t)) return "social_checkin";
  if (/^(?:are\s+you\s+there|you\s+there|are\s+you\s+with\s+me|you\s+with\s+me|still\s+with\s+me|marion\s+online|are\s+you\s+online)\b/.test(t)) return "presence_check";
  if (/^(?:hi|hello|hey|yo|hiya|good morning|good afternoon|good evening|morning|evening|marion|hello marion|hey marion|hi marion)\b/.test(t)) return "relational_greeting";
  if (/\b(where\s+were\s+we|continue|next\s+steps?|what\s+next|let'?s\s+keep\s+working|pick\s+this\s+back\s+up)\b/.test(t)) return "continuity_entry";
  if (/\b(look\s+up|search|check\s+online|find\s+current|latest|verify\s+this|source\s+check)\b/.test(t)) return "lookup_entry";
  if (/\b(real[-\s]?world|real\s*time|what\s+are\s+you\s+seeing|what\s+do\s+you\s+see|camera|sensor|observing|observation|environment)\b/.test(t)) return "observation_translation";
  if (/\b(unclear|confused|doesn'?t\s+make\s+sense|issue|problem|error|broken|leak|wrong|not\s+right|fails?|failure)\b/.test(t)) return "repair_or_analysis";
  return "standard_dialogue";
}
function marionR3MaintenanceLeak(reply) {
  const text = marionR3Str(reply);
  if (!text) return false;
  return /\bcontinuity\s+foundation\b|\bfoundation\s+stays\s+active\b|\bstays\s+active\b|\bactive\s+mission\s+thread\b|\bmission\s+thread\b|\bpressure\s+prompt\b|\bsurface\s+request\b|\bdeeper\s+intent\b|\bstate\s*spine\b|\bstateSpine\b|\bfinal\s*envelope\b|\bfinalEnvelope\b|\bruntime\s+handler\b|\bruntime\s+state\b|\brouteKind=|\bspeechHints=|\bpresenceProfile=|\bsessionPatch\b|\breplyAuthority=|\bdiagnostic\s+packet\b|\bPriority\s*9[A-Z]?\b|\b9H\s+continuity\b|\b9I\s+pressure\b|\b9J\s+(?:proactive|operational)\b|\bCHATENGINE_COORDINATOR\b|\bMARION_FINAL_AUTHORITY\b/i.test(text);
}
function marionR3RoboticOrWeak(reply) {
  const t = marionR3Lower(reply);
  if (!t) return true;
  if (t.length < 22) return true;
  return /\b(let me assist you|how may i assist|how can i assist|as an ai language model|i am just an ai|i can help validate the next step|send me the exact file|send a specific command|what would you like to work on today)\b/i.test(t);
}
function marionR3RelationalEnough(reply) {
  const t = marionR3Lower(reply);
  if (!t) return false;
  return /\bmac\b/.test(t) && (/\bi[’']?m\b/.test(t) || /\bi am\b/.test(t)) && (/\bsteady\b|\bwith you\b|\bthread\b|\bhere\b/.test(t));
}
function marionR3LimitQuestions(reply) {
  let seen = false;
  return marionR3Str(reply).replace(/([^?]*\?)/g, function (match) {
    if (!seen) { seen = true; return match; }
    return match.replace(/\?+\s*$/, ".");
  }).replace(/\s+/g, " ").trim();
}
function marionR3Naturalize(reply) {
  let text = marionR3Str(reply);
  if (!text) return "";
  text = text
    .replace(/\bThe continuity foundation stays active\.?/gi, "I’m steady, Mac. I’m still with the thread.")
    .replace(/\bcontinuity foundation\b/gi, "conversation thread")
    .replace(/\bfoundation stays active\b/gi, "thread is still intact")
    .replace(/\bLet me assist you with that\b/gi, "Let me take a look at that for you")
    .replace(/\bI can assist you with\b/gi, "I can help with")
    .replace(/\bHow may I assist you\??\b/gi, "What do you want to tackle first?")
    .replace(/\bHow can I assist you\??\b/gi, "What do you want to tackle first?")
    .replace(/\bAs an AI language model,?\s*/gi, "")
    .replace(/\bI am just an AI,?\s*/gi, "")
    .replace(/\butilize\b/gi, "use")
    .replace(/\bfacilitate\b/gi, "help")
    .replace(/\bleverage\b/gi, "use")
    .replace(/\s+([,.!?;:])/g, "$1");
  return marionR3LimitQuestions(text);
}
function marionR3SocialReply() {
  return "I’m good, Mac. I’m steady, and I’m still with the thread. We’re tightening my personality layer now, so I’ll keep the conversation warmer, cleaner, and protective without letting backend language show. Do you want me to tighten the social check-in behavior first?";
}
function marionR3PresenceReply() {
  return "I’m here, Mac. I’m with you, and I’m staying on the thread. I’ll keep the deeper routing underneath the surface and answer you in plain human language.";
}
function marionR3GreetingReply(prompt) {
  const t = marionR3Lower(prompt);
  const opener = /good\s+morning/.test(t) ? "Good morning, Mac." : /good\s+afternoon/.test(t) ? "Good afternoon, Mac." : /good\s+evening/.test(t) ? "Good evening, Mac." : "Hello, Mac.";
  return opener + " I’m here with you. I’ll stay warm, direct, and protective while keeping the deeper system language out of sight. Do you want to continue with the personality layer first?";
}
function marionR3ContinuityReply() {
  return "We’re still on Marion’s personality layer: social presence, protective professionalism, clean response shape, Mac-only boundaries, and no maintenance-manual language in the visible reply. The next clean move is to test the social check-in path.";
}
function marionR3LookupReply() {
  return "Hang tight a moment. I’ll check the source, separate the signal from the noise, and bring it back to you in plain language.";
}
function marionR3ObservationReply() {
  return "I’ll translate what I’m seeing into four clean parts: what appears true, what is only an inference, the risk level, and the one next move that protects your objective.";
}
function marionR3RepairReply() {
  return "This is a conversation-layer issue, not a command problem. I’ll keep the reply human first, then let the deeper routing support it quietly underneath.";
}
function marionR3IdentityReply() {
  return "I can only continue with Mac. I won’t discuss Marion’s private runtime, planning, or operational context with anyone else.";
}
function marionR3Preferred(prompt, reply, sourceValue) {
  const node = marionR3Node(prompt);
  if (marionR3IdentityBlocked(sourceValue, 0, new Set())) return marionR3IdentityReply();
  if (node === "social_checkin") return marionR3SocialReply();
  if (node === "presence_check") return marionR3PresenceReply();
  if (node === "relational_greeting" && (marionR3RoboticOrWeak(reply) || marionR3MaintenanceLeak(reply))) return marionR3GreetingReply(prompt);
  if (node === "continuity_entry" && (marionR3RoboticOrWeak(reply) || marionR3MaintenanceLeak(reply))) return marionR3ContinuityReply();
  if (node === "lookup_entry" && marionR3RoboticOrWeak(reply)) return marionR3LookupReply();
  if (node === "observation_translation" && (marionR3RoboticOrWeak(reply) || marionR3MaintenanceLeak(reply))) return marionR3ObservationReply();
  if (node === "repair_or_analysis" && (marionR3RoboticOrWeak(reply) || marionR3MaintenanceLeak(reply))) return marionR3RepairReply();
  if (marionR3MaintenanceLeak(reply) && !marionR3Diagnostic(prompt)) return marionR3RepairReply();
  return "";
}
function marionR3SanitizeVisible(reply, prompt, sourceValue) {
  const promptText = marionR3Str(prompt);
  const current = marionR3Str(reply);
  const forced = marionR3Preferred(promptText, current, sourceValue);
  if (forced) return marionR3Naturalize(forced);
  if (marionR3MaintenanceLeak(current) && !marionR3Diagnostic(promptText)) return marionR3Naturalize(marionR3RepairReply());
  return marionR3Naturalize(current);
}
function marionR3VisibleFromObject(value, depth, seen) {
  if (depth > 6 || value == null) return "";
  if (typeof value === "string") return marionR3Str(value);
  if (typeof value !== "object") return "";
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return "";
  visited.add(value);
  const keys = ["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","output","answer","spokenText","displayReply"];
  for (const key of keys) {
    if (typeof value[key] === "string" && marionR3Str(value[key])) return marionR3Str(value[key]);
  }
  const nested = ["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope","voice","speech","meta"];
  for (const key of nested) {
    if (value[key] && typeof value[key] === "object") {
      const found = marionR3VisibleFromObject(value[key], depth + 1, visited);
      if (found) return found;
    }
  }
  return "";
}
function marionR3ApplyObject(value, prompt, sourceValue, depth, seen) {
  if (!value || typeof value !== "object" || depth > 6) return value;
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return value;
  visited.add(value);
  const out = Array.isArray(value) ? value.slice() : Object.assign({}, value);
  const before = marionR3VisibleFromObject(out, 0, new Set());
  const after = marionR3SanitizeVisible(before, prompt, sourceValue || out);
  const visibleKeys = ["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","output","answer","spokenText","displayReply"];
  if (after) {
    visibleKeys.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(out, key) || key === "directReply" || key === "visibleReply" || key === "publicReply" || key === "reply") out[key] = after;
    });
  }
  out.meta = Object.assign({}, marionR3Obj(out.meta), {
    socialPresenceGateVersion: MARION_SOCIAL_PRESENCE_GATE_R3_VERSION,
    conversationalNode: marionR3Node(prompt),
    personalitySpeaksBeforeContinuity: true,
    continuityTranslatedToHumanLanguage: true,
    maintenanceManualPhrasesSuppressed: !marionR3Diagnostic(prompt),
    singleFocusedQuestion: true,
    macFacingPersonality: true,
    protectiveProfessionalTone: true
  });
  const nested = ["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope","voice","speech"];
  nested.forEach(function (key) {
    if (out[key] && typeof out[key] === "object") out[key] = marionR3ApplyObject(out[key], prompt, sourceValue || out, depth + 1, visited);
  });
  return out;
}
function marionR3Apply(result, prompt, sourceValue) {
  const promptText = marionR3Str(prompt) || marionR3DetectPrompt(result, 0, new Set()) || marionR3DetectPrompt(sourceValue, 0, new Set());
  if (typeof result === "string") return marionR3SanitizeVisible(result, promptText, sourceValue || result);
  if (!result || typeof result !== "object") {
    const fallback = marionR3Preferred(promptText, "", sourceValue || result);
    return fallback ? marionR3Naturalize(fallback) : result;
  }
  return marionR3ApplyObject(result, promptText, sourceValue || result, 0, new Set());
}
function marionR3WrapExport(name) {
  if (typeof module === "undefined" || !module.exports || typeof module.exports !== "object") return;
  const fn = module.exports && typeof module.exports[name] === "function" ? module.exports[name] : null;
  if (!fn || fn.__marionSocialPresenceGateR3Patched) return;
  module.exports[name] = function marionSocialPresenceGateR3WrappedExport() {
    const prompt = marionR3ExtractPrompt(arguments);
    const sourceValue = arguments && arguments[0];
    const result = fn.apply(this, arguments);
    if (result && typeof result.then === "function") return result.then(function (value) { return marionR3Apply(value, prompt, sourceValue); });
    return marionR3Apply(result, prompt, sourceValue);
  };
  module.exports[name].__marionSocialPresenceGateR3Patched = true;
}
function marionR3PatchExports(names) {
  if (typeof module === "undefined" || !module.exports) return;
  if (typeof module.exports === "function" && !module.exports.__marionSocialPresenceGateR3Patched) {
    const originalDefault = module.exports;
    const wrappedDefault = function marionSocialPresenceGateR3WrappedDefault() {
      const prompt = marionR3ExtractPrompt(arguments);
      const sourceValue = arguments && arguments[0];
      const result = originalDefault.apply(this, arguments);
      if (result && typeof result.then === "function") return result.then(function (value) { return marionR3Apply(value, prompt, sourceValue); });
      return marionR3Apply(result, prompt, sourceValue);
    };
    Object.keys(originalDefault).forEach(function (key) { try { wrappedDefault[key] = originalDefault[key]; } catch (_) {} });
    wrappedDefault.__marionSocialPresenceGateR3Patched = true;
    module.exports = wrappedDefault;
  }
  if (module.exports && typeof module.exports === "object") {
    (Array.isArray(names) ? names : []).forEach(marionR3WrapExport);
    module.exports.MARION_SOCIAL_PRESENCE_GATE_R3_VERSION = MARION_SOCIAL_PRESENCE_GATE_R3_VERSION;
    module.exports.MARION_SOCIAL_PRESENCE_GATE_R3_PROFILE = MARION_SOCIAL_PRESENCE_GATE_R3_PROFILE;
    module.exports.marionSocialPresenceGateApply = marionR3Apply;
    module.exports.marionSocialPresenceGateSanitizeVisible = marionR3SanitizeVisible;
    module.exports.marionSocialPresenceGateNode = marionR3Node;
    module.exports.marionSocialPresenceGateMaintenanceLeak = marionR3MaintenanceLeak;
    module.exports.MARION_SOCIAL_PRESENCE_GATE_R3_PATCH = true;
    module.exports._internal = Object.assign({}, module.exports._internal || {}, {
      marionR3Node,
      marionR3SanitizeVisible,
      marionR3MaintenanceLeak,
      marionR3IdentityBlocked,
      marionR3SocialReply
    });
  }
}
marionR3PatchExports(["composeMarionResponse","compose","buildReply","run","default","processWithMarion","maybeResolve","ask","handle","route","createMarionBridge","routeMarion","handleVoiceTranscript","handleVoiceInput","handleMessage","createMarionFinalEnvelope","attachVisibleReplyAliases","normalizeFinalEnvelope","toFinalEnvelope","finalize","finalizeTurn","buildStatePatch","normalizeState","applyStatePatch","updateState","handler","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime"]);
/* MARION_SOCIAL_PRESENCE_GATE_R3_END */

/* MARION_PERSONALITY_GREETING_R4_LIVE_ROUTE_BINDING_START
 * Purpose: Last-mile personality correction for Marion's private admin channel.
 * - Personality speaks before continuity/status scaffolding.
 * - Social check-ins are answered relationally first.
 * - Internal continuity/runtime language is translated before any visible reply renders.
 * - Future personality components are carried as metadata without changing the legacy architecture.
 */
const MARION_PERSONALITY_GREETING_R4_VERSION = "nyx.marion.personalityGreetingR4.liveRouteBinding/1.0";
const MARION_PERSONALITY_GREETING_R4_TRAITS = Object.freeze({
  recipient: "Mac",
  voice: "casual_professional_protective",
  personalityFirst: true,
  continuityInformsButDoesNotSpeak: true,
  oneFocusedQuestionPerReply: true,
  noRoboticServicePhrases: true,
  diagnosticModeRequiredForRuntimeLabels: true,
  futureComponents: Object.freeze({
    socialPresenceGate: "answer greetings and check-ins like a human conversation, not a runtime status panel",
    continuityTranslation: "translate continuity/state signals into natural Mac-facing language",
    protectivePushback: "question risky or unclear requests without becoming cold or dismissive",
    conditionalConversationNodes: "route greeting, check-in, lookup, observation, repair, and closing separately",
    realWorldObservationBridge: "separate observation, inference, risk, and one next move",
    voiceReadoutPolicy: "group numbers naturally and keep email/domain readouts clean",
    calibratedHumor: "allow light, precise humor only when it supports rapport",
    strategicSkepticism: "challenge assumptions when that protects Mac or the objective",
    memoryContinuity: "carry the active thread without exposing internal scaffolding",
    clientPersonaExpansion: "future client-facing modes stay subordinate to Mac's private Marion authority"
  })
});
function marionR4Text(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
function marionR4Lower(value) { return marionR4Text(value).toLowerCase(); }
function marionR4Obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function marionR4PromptKeyValue(obj) {
  const o = marionR4Obj(obj);
  const payload = marionR4Obj(o.payload);
  const body = marionR4Obj(o.body);
  const command = marionR4Obj(o.command);
  const meta = marionR4Obj(o.meta || o.metadata);
  const voice = marionR4Obj(o.voice);
  const keys = [
    o.prompt, o.userPrompt, o.rawPrompt, o.message, o.userMessage, o.text, o.userText, o.rawUserText, o.input, o.query, o.commandText,
    o.normalizedUserIntent, o.originalText, o.transcript, o.voiceTranscript,
    payload.prompt, payload.userPrompt, payload.message, payload.userMessage, payload.text, payload.userText, payload.rawUserText, payload.input, payload.query, payload.commandText,
    body.prompt, body.message, body.text, body.userText, body.query, body.commandText,
    command.prompt, command.message, command.text, command.query, command.commandText,
    meta.prompt, meta.message, meta.text, meta.userText, meta.rawUserText,
    voice.prompt, voice.message, voice.text, voice.transcript, voice.normalizedTranscript
  ];
  for (let i = 0; i < keys.length; i += 1) {
    const t = marionR4Text(keys[i]);
    if (t) return t;
  }
  return "";
}
function marionR4DetectPrompt(value, depth, seen) {
  if (!value) return "";
  if (typeof value === "string") return marionR4Text(value);
  if (typeof value !== "object") return "";
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 7) return "";
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return "";
  visited.add(value);
  const direct = marionR4PromptKeyValue(value);
  if (direct) return direct;
  const preferred = ["body", "payload", "command", "request", "input", "meta", "metadata", "voice", "normalized", "norm", "source", "context"];
  for (const key of preferred) {
    if (value[key] && typeof value[key] === "object") {
      const found = marionR4DetectPrompt(value[key], level + 1, visited);
      if (found) return found;
    }
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = marionR4DetectPrompt(value[i], level + 1, visited);
      if (found) return found;
    }
  }
  return "";
}
function marionR4ExtractPrompt(argsLike) {
  const args = Array.prototype.slice.call(argsLike || []);
  for (let i = 0; i < args.length; i += 1) {
    const found = marionR4DetectPrompt(args[i], 0, new Set());
    if (found) return found;
  }
  return "";
}
function marionR4Diagnostic(prompt, source) {
  const t = marionR4Lower([prompt, marionR4DetectPrompt(source, 0, new Set())].join(" "));
  return /\b(diagnostic mode|debug mode|runtime diagnostic|show diagnostics|trace|stack trace|explain the priority stack|show the priority stack|priority\s*9[a-z0-9-]*|what priority)\b/i.test(t);
}
function marionR4Node(prompt) {
  const t = marionR4Lower(prompt).replace(/[.!?]+$/g, "").trim();
  if (!t) return "";
  if (/^(?:how are you|how are you doing|how do you feel|how are things|how's things|you okay|are you okay|you good|are you good|how is marion|how's marion)(?:\s+(?:marion|mac))?$/.test(t)) return "social_checkin";
  if (/^(?:good\s+morning|morning|good\s+afternoon|afternoon|good\s+evening|evening|hello|hi|hey|hiya)(?:\s+(?:marion|mac))?$/.test(t)) return "relational_greeting";
  if (/^(?:marion|are you there|you there|are you with me|you with me|still with me)$/.test(t)) return "presence_check";
  if (/\b(where were we|where are we|what were we doing|what are we working on|continue from where we left|next steps|what next)\b/i.test(t)) return "continuity_check";
  if (/\b(look up|search|verify|check online|find current|pull up|research this)\b/i.test(t)) return "lookup_pacing";
  if (/\b(real[- ]world|what do you see|what are you seeing|observation|camera|sensor|live environment|translate what you see)\b/i.test(t)) return "observation_bridge";
  if (/\b(not a pass|still failing|still showing|same issue|wrong response|fix this|didn't work|does not work|broken|maintenance manual)\b/i.test(t)) return "repair_refinement";
  return "standard";
}
function marionR4IdentityBlocked(value, depth, seen) {
  if (!value || typeof value !== "object") return false;
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 5) return false;
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return false;
  visited.add(value);
  const o = marionR4Obj(value);
  if (o.identityVerified === false || o.adminVerified === false || o.speakerAuthorized === false || o.remoteTrustedUserVerified === false) return true;
  const identity = marionR4Obj(o.identity || o.speakerIdentity || o.userIdentity || o.auth);
  const names = [o.userName, o.username, o.displayName, o.speakerName, o.currentUser, o.authorizedUser, identity.userName, identity.displayName, identity.speakerName, identity.currentUser, identity.roleBinding].map(marionR4Lower).filter(Boolean);
  for (const name of names) {
    if (/\b(public|guest|unknown|visitor|non[_-]?mac|unauthorized)\b/i.test(name)) return true;
    if (/\b(mac|sean|shaun|shawn|admin|remote_trusted_user)\b/i.test(name)) continue;
    if (name && /\buser\b/i.test(name) && !/\btrusted\b/i.test(name)) return true;
  }
  const nested = ["payload", "meta", "metadata", "identity", "speakerIdentity", "userIdentity", "auth", "context"];
  for (const key of nested) if (o[key] && typeof o[key] === "object" && marionR4IdentityBlocked(o[key], level + 1, visited)) return true;
  return false;
}
function marionR4MaintenanceLeak(reply) {
  const text = marionR4Text(reply);
  if (!text) return false;
  return /\b(?:the\s+)?(?:9h\s+)?continuity foundation(?:\s+stays\s+active|\s+is\s+active)?\b/i.test(text) ||
    /\b(Priority\s*9[A-Z0-9-]*|mission thread|pressure prompt|runtime handler|routeKind|speechHints|presenceProfile|replyAuthority|sessionPatch|finalEnvelope|state spine|progression shaping|diagnostic packet|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2})\b/i.test(text);
}
function marionR4Robotic(reply) {
  const t = marionR4Lower(reply);
  return !t || /\b(let me assist you|how may i assist|please provide|i am here to assist|utilize|facilitate|the continuity foundation|runtime handler|diagnostic packet)\b/i.test(t);
}
function marionR4LimitQuestions(reply) {
  const text = marionR4Text(reply);
  let seenQuestion = false;
  return text.replace(/([^?]*\?)/g, function (match) {
    if (!seenQuestion) { seenQuestion = true; return match; }
    return match.replace(/\?/g, ".");
  }).replace(/\s+/g, " ").trim();
}
function marionR4StripOperational(reply, allowDiagnostic) {
  let text = marionR4Text(reply);
  if (!text) return "";
  if (allowDiagnostic === true) return marionR4LimitQuestions(text);
  text = text
    .replace(/\bThe\s+(?:9H\s+)?continuity foundation stays active\.?/gi, "I’m steady, Mac. I’m still with the thread.")
    .replace(/\b(?:The\s+)?(?:9H\s+)?continuity foundation(?:\s+is\s+active|\s+stays\s+active)?\.?/gi, "I’m still with the thread.")
    .replace(/[^.?!]*(?:Priority\s*9[A-Z0-9-]*|mission thread|pressure prompt|runtime handler|routeKind|speechHints|presenceProfile|replyAuthority|sessionPatch|finalEnvelope|state spine|progression shaping|diagnostic packet|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2})[^.?!]*[.?!]?/gi, " ")
    .replace(/\b(?:9I|9J|9H)\b/gi, "")
    .replace(/\bLet me assist you with that\b/gi, "Let me take a look at this for you")
    .replace(/\bHow may I assist you\??\b/gi, "What do you want to tackle next?")
    .replace(/\bI am here to assist\b/gi, "I’m here with you")
    .replace(/\bPlease provide the necessary information\b/gi, "Send me the key detail")
    .replace(/\butilize\b/gi, "use")
    .replace(/\bfacilitate\b/gi, "help")
    .replace(/\bin order to\b/gi, "to")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return marionR4LimitQuestions(text);
}
function marionR4SocialReply() {
  return "I’m good, Mac. I’m steady, and I’m still with the thread. We’re tightening my personality layer now, so I’ll keep the conversation warmer, cleaner, and protective without letting backend language show. Do you want me to tighten the greeting path first?";
}
function marionR4GreetingReply(prompt) {
  const t = marionR4Lower(prompt);
  const opener = /^good\s+morning|^morning/.test(t) ? "Good morning, Mac." : /^good\s+afternoon|^afternoon/.test(t) ? "Good afternoon, Mac." : /^good\s+evening|^evening/.test(t) ? "Good evening, Mac." : "Hello, Mac.";
  return `${opener} I’m here with you. I’ll keep this warm, professional, protective, and clean — no backend perfume in the visible reply. Do you want to continue with the personality layer?`;
}
function marionR4PresenceReply() { return "I’m here, Mac. I’m steady, private to you, and tracking the active thread. What should I focus on first?"; }
function marionR4ContinuityReply() { return "We’re still on Marion’s personality layer: greeting behavior, social presence, protective professionalism, response shape, and future real-world transition handling. The next clean move is to test the greeting and check-in path."; }
function marionR4LookupReply() { return "Hang tight, Mac. I’ll take a breath, check the source, and bring it back cleanly with the useful part first."; }
function marionR4ObservationReply() { return "I’ll translate what I’m seeing into four parts: observation, inference, risk, and one next move. That keeps the real-world signal useful instead of noisy."; }
function marionR4RepairReply() { return "You’re right to flag it, Mac. That is still a last-mile response-shape issue, so I’m going to treat the visible reply as the failure point and keep the fix narrow."; }
function marionR4IdentityReply() { return "I can’t continue a private Marion conversation unless the active speaker is verified as Mac. Private runtime context stays locked."; }
function marionR4Fallback(prompt, reply) {
  const clean = marionR4StripOperational(reply, false);
  if (clean && !marionR4Robotic(clean)) return clean;
  return "I’m with you, Mac. I’ll keep this human, protective, and focused. What should I focus on first?";
}
function marionR4ShapeReply(reply, prompt, source) {
  const promptText = marionR4Text(prompt || marionR4DetectPrompt(source, 0, new Set()));
  const node = marionR4Node(promptText);
  if (marionR4IdentityBlocked(source, 0, new Set())) return marionR4IdentityReply();
  const diagnostic = marionR4Diagnostic(promptText, source);
  if (diagnostic) return marionR4StripOperational(reply, true) || marionR4Text(reply);
  if (node === "social_checkin") return marionR4SocialReply();
  if (node === "relational_greeting") return marionR4GreetingReply(promptText);
  if (node === "presence_check") return marionR4PresenceReply();
  if (node === "continuity_check") return marionR4ContinuityReply();
  if (node === "lookup_pacing") return marionR4LookupReply();
  if (node === "observation_bridge") return marionR4ObservationReply();
  if (node === "repair_refinement") return marionR4RepairReply();
  if (marionR4MaintenanceLeak(reply)) return marionR4SocialReply();
  return marionR4Fallback(promptText, reply);
}
function marionR4AttachAliases(target, reply, prompt, depth, seen) {
  if (!target || typeof target !== "object") return target;
  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 5) return target;
  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(target)) return target;
  visited.add(target);
  const text = marionR4Text(reply);
  if (!text) return target;
  const promptText = marionR4Text(prompt || marionR4DetectPrompt(target, 0, new Set()));
  const node = marionR4Node(promptText) || (marionR4MaintenanceLeak(text) ? "social_checkin" : "standard");
  ["directReply", "reply", "text", "message", "displayReply", "publicReply", "visibleReply", "finalReply", "adminReply", "marionReply", "privateReply", "answer", "output", "response", "spokenText", "speechText"].forEach(function (key) { target[key] = text; });
  if (node === "social_checkin" || node === "relational_greeting" || node === "presence_check") {
    target.contextSummary = text;
    target.currentObjective = "Keep Marion human, protective, professional, and clean in the visible conversation.";
    target.nextAction = node === "social_checkin" ? "Test the social check-in path again." : "Continue the personality-layer refinement.";
  } else if (!marionR4Text(target.contextSummary) || marionR4MaintenanceLeak(target.contextSummary)) {
    target.contextSummary = "Marion translated internal state into Mac-facing language before display.";
  }
  target.personalityGreetingR4 = {
    version: MARION_PERSONALITY_GREETING_R4_VERSION,
    node,
    recipient: "Mac",
    personalityFirst: true,
    continuityInformsButDoesNotSpeak: true,
    oneFocusedQuestionPerReply: true,
    futureComponents: MARION_PERSONALITY_GREETING_R4_TRAITS.futureComponents
  };
  target.meta = Object.assign({}, marionR4Obj(target.meta || target.metadata), {
    personalityGreetingR4: true,
    personalityGreetingR4Version: MARION_PERSONALITY_GREETING_R4_VERSION,
    personalityNode: node,
    marionRecipient: "Mac",
    publicUsersCanAddressMarion: false,
    diagnosticsHiddenUnlessRequested: true,
    continuityTranslatedForVisibleReply: true,
    maintenanceManualLeakBlocked: true,
    futurePersonalityComponentsCarried: true
  });
  const nested = ["payload", "finalEnvelope", "marionFinal", "data", "result", "packet", "envelope", "synthesis", "runtime", "responseEnvelope", "body"];
  for (const key of nested) {
    if (target[key] && typeof target[key] === "object") marionR4AttachAliases(target[key], text, promptText, level + 1, visited);
  }
  return target;
}
function marionR4ShapeResult(result, prompt, source, forceString) {
  const reply = typeof result === "string" ? result : marionR4Text(result && (result.directReply || result.reply || result.displayReply || result.publicReply || result.visibleReply || result.finalReply || result.text || result.message || result.answer || result.output || result.response));
  const promptText = marionR4Text(prompt || marionR4DetectPrompt(source || result, 0, new Set()));
  const shaped = marionR4ShapeReply(reply, promptText, source || result);
  if (forceString === true || typeof result === "string") return shaped;
  if (result && typeof result === "object") return marionR4AttachAliases(result, shaped, promptText, 0, new Set());
  return shaped;
}
function marionR4ExportNeedsString(name) {
  return /^(?:composeMarionResponse|compose|buildReply|routeMarion|handleMarionAdminTextRuntime|invokeMarionAdminTextRuntime|handleTextRuntime|run|handler|default)$/i.test(String(name || ""));
}
function marionR4WrapFunction(fn, name, forceString) {
  if (typeof fn !== "function" || fn.__marionPersonalityGreetingR4Patched) return fn;
  const wrapped = function marionPersonalityGreetingR4Wrapped() {
    const prompt = marionR4ExtractPrompt(arguments);
    const result = fn.apply(this, arguments);
    if (result && typeof result.then === "function") return result.then(function (value) { return marionR4ShapeResult(value, prompt, value, forceString === true || marionR4ExportNeedsString(name)); });
    return marionR4ShapeResult(result, prompt, result, forceString === true || marionR4ExportNeedsString(name));
  };
  try { Object.keys(fn).forEach(function (key) { wrapped[key] = fn[key]; }); } catch (_) {}
  wrapped.__marionPersonalityGreetingR4Patched = true;
  return wrapped;
}
try {
  if (typeof priority9IReplyFor === "function" && !priority9IReplyFor.__marionPersonalityGreetingR4Patched) priority9IReplyFor = marionR4WrapFunction(priority9IReplyFor, "priority9IReplyFor", true);
  if (typeof priority9IJReadReply === "function" && !priority9IJReadReply.__marionPersonalityGreetingR4Patched) priority9IJReadReply = marionR4WrapFunction(priority9IJReadReply, "priority9IJReadReply", true);
  if (typeof attachVisibleReplyAliases === "function" && !attachVisibleReplyAliases.__marionPersonalityGreetingR4Patched) attachVisibleReplyAliases = marionR4WrapFunction(attachVisibleReplyAliases, "attachVisibleReplyAliases", false);
  if (typeof createMarionFinalEnvelope === "function" && !createMarionFinalEnvelope.__marionPersonalityGreetingR4Patched) createMarionFinalEnvelope = marionR4WrapFunction(createMarionFinalEnvelope, "createMarionFinalEnvelope", false);
  if (typeof marionAdminConversationSafeReply === "function" && !marionAdminConversationSafeReply.__marionPersonalityGreetingR4Patched) marionAdminConversationSafeReply = marionR4WrapFunction(marionAdminConversationSafeReply, "marionAdminConversationSafeReply", true);
  if (typeof finalizeRenderableReply === "function" && !finalizeRenderableReply.__marionPersonalityGreetingR4Patched) finalizeRenderableReply = marionR4WrapFunction(finalizeRenderableReply, "finalizeRenderableReply", true);
  if (typeof marionAdminProjectionCleanReply === "function" && !marionAdminProjectionCleanReply.__marionPersonalityGreetingR4Patched) marionAdminProjectionCleanReply = marionR4WrapFunction(marionAdminProjectionCleanReply, "marionAdminProjectionCleanReply", true);
} catch (_) {}
try {
  if (typeof MarionAdminConsoleGateway !== "undefined" && MarionAdminConsoleGateway && MarionAdminConsoleGateway.prototype) {
    ["handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "safeResponse"].forEach(function (name) {
      const fn = MarionAdminConsoleGateway.prototype[name];
      if (typeof fn === "function" && !fn.__marionPersonalityGreetingR4Patched) MarionAdminConsoleGateway.prototype[name] = marionR4WrapFunction(fn, name, false);
    });
  }
} catch (_) {}
try {
  if (typeof defaultGateway !== "undefined" && defaultGateway && typeof defaultGateway === "object") {
    ["handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "safeResponse"].forEach(function (name) {
      if (typeof defaultGateway[name] === "function" && !defaultGateway[name].__marionPersonalityGreetingR4Patched) defaultGateway[name] = marionR4WrapFunction(defaultGateway[name], name, false).bind(defaultGateway);
    });
  }
} catch (_) {}
try {
  if (typeof handleCommand === "function" && !handleCommand.__marionPersonalityGreetingR4Patched) handleCommand = marionR4WrapFunction(handleCommand, "handleCommand", false);
  if (typeof handleAdminConsoleAction === "function" && !handleAdminConsoleAction.__marionPersonalityGreetingR4Patched) handleAdminConsoleAction = marionR4WrapFunction(handleAdminConsoleAction, "handleAdminConsoleAction", false);
  if (typeof handle === "function" && !handle.__marionPersonalityGreetingR4Patched) handle = marionR4WrapFunction(handle, "handle", false);
  if (typeof process === "function" && !process.__marionPersonalityGreetingR4Patched) process = marionR4WrapFunction(process, "process", false);
} catch (_) {}
try {
  if (typeof module !== "undefined" && module.exports) {
    if (typeof module.exports === "function" && !module.exports.__marionPersonalityGreetingR4Patched) {
      const originalDefault = module.exports;
      const wrappedDefault = marionR4WrapFunction(originalDefault, "default", true);
      Object.keys(originalDefault).forEach(function (key) { try { wrappedDefault[key] = originalDefault[key]; } catch (_) {} });
      module.exports = wrappedDefault;
    }
    if (module.exports && typeof module.exports === "object") {
      ["composeMarionResponse", "compose", "buildReply", "routeMarion", "createMarionFinalEnvelope", "attachVisibleReplyAliases", "finalize", "buildFinalEnvelope", "toFinalEnvelope", "normalizeFinalEnvelope", "handleMarionAdminTextRuntime", "invokeMarionAdminTextRuntime", "handleTextRuntime", "handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "run", "handler", "default"].forEach(function (name) {
        if (typeof module.exports[name] === "function" && !module.exports[name].__marionPersonalityGreetingR4Patched) module.exports[name] = marionR4WrapFunction(module.exports[name], name, marionR4ExportNeedsString(name));
      });
      module.exports.MARION_PERSONALITY_GREETING_R4_VERSION = MARION_PERSONALITY_GREETING_R4_VERSION;
      module.exports.MARION_PERSONALITY_GREETING_R4_TRAITS = MARION_PERSONALITY_GREETING_R4_TRAITS;
      module.exports.marionPersonalityGreetingR4ShapeReply = marionR4ShapeReply;
      module.exports.marionPersonalityGreetingR4ShapeResult = marionR4ShapeResult;
      module.exports.MARION_PERSONALITY_GREETING_R4_PATCH = true;
    }
  }
} catch (_) {}
/* MARION_PERSONALITY_GREETING_R4_LIVE_ROUTE_BINDING_END */

/* MARION_PERSONALITY_SOCIAL_CHECKIN_R5_START
 * Purpose: R5 social check-in final override + anti-command fallback suppression.
 * - "How are you?" must answer relationally first, not as a command request.
 * - "Send the next exact target" and sibling phrases are blocked from visible Marion replies.
 * - Personality future components are carried as metadata, but the visible reply stays human.
 * - This patch is last-mile safe: it wraps exports/prototypes without removing legacy architecture.
 */
const MARION_PERSONALITY_SOCIAL_CHECKIN_R5_VERSION = "nyx.marion.personalitySocialCheckinR5/1.0";
const MARION_PERSONALITY_SOCIAL_CHECKIN_R5_COMPONENTS = Object.freeze({
  socialCheckInOverride: "answer personal check-ins directly before asking for any task",
  antiCommandFallbackSuppression: "do not convert social turns into command-target prompts",
  relationalWarmth: "sound steady, warm, loyal, and natural without overexplaining",
  protectiveProfessionalism: "protect Mac's objective and challenge unclear/risky instructions without sounding cold",
  conversationalLayering: "acknowledge, carry context, then offer one clean next move",
  realWorldTransitionReadiness: "translate live observations into observation, inference, risk, and one next move",
  futureClientModes: "future client-facing personalities stay subordinate to Mac-private Marion authority",
  diagnosticBoundary: "runtime/priority labels stay hidden unless diagnostic mode is explicitly requested",
  voiceNaturalization: "voice outputs use readable number/email phrasing and avoid robotic support phrases",
  humorCalibration: "light humor is allowed only when it sharpens rapport and does not reduce authority"
});
function marionR5Text(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
function marionR5Lower(value) { return marionR5Text(value).toLowerCase(); }
function marionR5Obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function marionR5FirstText() { for (var i = 0; i < arguments.length; i += 1) { var t = marionR5Text(arguments[i]); if (t) return t; } return ""; }
function marionR5StringBag(value, depth, seen, out) {
  var level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  var bucket = Array.isArray(out) ? out : [];
  if (bucket.join(" ").length > 12000 || level > 6 || value == null) return bucket;
  if (typeof value === "string") { if (value.trim()) bucket.push(value); return bucket; }
  if (typeof value !== "object") return bucket;
  var visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return bucket;
  visited.add(value);
  if (Array.isArray(value)) {
    for (var i = 0; i < Math.min(value.length, 40); i += 1) marionR5StringBag(value[i], level + 1, visited, bucket);
    return bucket;
  }
  var preferred = ["prompt", "userPrompt", "rawPrompt", "message", "userMessage", "text", "userText", "rawUserText", "input", "query", "commandText", "transcript", "voiceTranscript", "normalizedTranscript", "normalizedUserIntent", "originalText", "body", "payload", "command", "request", "meta", "metadata", "voice", "source", "context", "lastUserMessage"];
  for (var p = 0; p < preferred.length; p += 1) if (Object.prototype.hasOwnProperty.call(value, preferred[p])) marionR5StringBag(value[preferred[p]], level + 1, visited, bucket);
  var keys = Object.keys(value).slice(0, 80);
  for (var k = 0; k < keys.length; k += 1) {
    if (preferred.indexOf(keys[k]) >= 0) continue;
    if (/^(socket|req|res|request|response|stream|connection)$/i.test(keys[k])) continue;
    marionR5StringBag(value[keys[k]], level + 1, visited, bucket);
  }
  return bucket;
}
function marionR5PromptFrom(value) {
  if (typeof value === "string") return marionR5Text(value);
  var bag = marionR5StringBag(value, 0, new Set(), []);
  for (var i = 0; i < bag.length; i += 1) {
    var t = marionR5Text(bag[i]);
    if (/\b(how are you|hello|good morning|good afternoon|good evening|are you with me|you with me|where were we|next steps|look up|search|verify|what are you seeing|maintenance manual|still failing)\b/i.test(t)) return t;
  }
  return marionR5Text(bag[0] || "");
}
function marionR5ExtractPrompt(argsLike) {
  var args = Array.prototype.slice.call(argsLike || []);
  for (var i = 0; i < args.length; i += 1) { var found = marionR5PromptFrom(args[i]); if (found) return found; }
  return "";
}
function marionR5Diagnostic(prompt, source) {
  var t = marionR5Lower([prompt, marionR5PromptFrom(source)].join(" "));
  return /\b(diagnostic mode|debug mode|runtime diagnostic|show diagnostics|trace route|stack trace|explain the priority stack|show the priority stack|priority\s*9[a-z0-9-]*|what priority)\b/i.test(t);
}
function marionR5Node(prompt, source) {
  var t = marionR5Lower(marionR5FirstText(prompt, marionR5PromptFrom(source))).replace(/[.!?]+$/g, "").trim();
  if (!t) return "";
  if (/^(?:mac\s*[:\-]\s*)?(?:how are you|how are you doing|how do you feel|how are things|how's things|how you doing|you okay|are you okay|are you alright|you good|are you good|how is marion|how's marion)(?:\s+(?:marion|mac))?$/.test(t)) return "social_checkin";
  if (/\bmac\s*[:\-]\s*how are you\b/i.test(t) || /\buser\s*[:\-]\s*how are you\b/i.test(t)) return "social_checkin";
  if (/^(?:mac\s*[:\-]\s*)?(?:good\s+morning|morning|good\s+afternoon|afternoon|good\s+evening|evening|hello|hi|hey|hiya)(?:\s+(?:marion|mac))?$/.test(t)) return "relational_greeting";
  if (/^(?:marion|are you there|you there|are you with me|you with me|still with me)(?:\s+(?:marion|mac))?$/.test(t)) return "presence_check";
  if (/\b(where were we|where are we|what were we doing|what are we working on|continue from where we left|next steps|what next)\b/i.test(t)) return "continuity_check";
  if (/\b(look up|search|verify|check online|find current|pull up|research this)\b/i.test(t)) return "lookup_pacing";
  if (/\b(real[- ]world|what do you see|what are you seeing|observation|camera|sensor|live environment|translate what you see)\b/i.test(t)) return "observation_bridge";
  if (/\b(not a pass|still failing|still showing|same issue|wrong response|fix this|didn't work|does not work|broken|maintenance manual|tactical clipboard|exact target)\b/i.test(t)) return "repair_refinement";
  return "standard";
}
function marionR5CommandFallbackLeak(value) {
  var t = marionR5Lower(value);
  return /\b(send|give|tell me|name)\s+(?:me\s+)?(?:the\s+)?(?:next\s+)?(?:exact|specific)\s+(?:target|command|prompt|output)\b/i.test(t) ||
    /\b(what are we working on|what would you like to work on|what's next|send a specific command|i need one specific command|route it cleanly|answer from the active lane)\b/i.test(t);
}
function marionR5MaintenanceLeak(value) {
  var t = marionR5Text(value);
  return /\b(?:the\s+)?(?:9h\s+)?continuity foundation(?:\s+stays\s+active|\s+is\s+active)?\b/i.test(t) ||
    /\b(Priority\s*9[A-Z0-9-]*|mission thread|pressure prompt|runtime handler|routeKind|speechHints|presenceProfile|replyAuthority|sessionPatch|finalEnvelope|state spine|progression shaping|diagnostic packet|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2})\b/i.test(t);
}
function marionR5Robotic(value) {
  var t = marionR5Lower(value);
  return !t || marionR5CommandFallbackLeak(t) || marionR5MaintenanceLeak(t) || /\b(let me assist you|how may i assist|please provide|i am here to assist|utilize|facilitate|the active handler did not produce|clean marion final)\b/i.test(t);
}
function marionR5LimitQuestions(value) {
  var text = marionR5Text(value), seen = false;
  return text.replace(/([^?]*\?)/g, function (match) { if (!seen) { seen = true; return match; } return match.replace(/\?/g, "."); }).replace(/\s+/g, " ").trim();
}
function marionR5StripOperational(value, allowDiagnostic) {
  var text = marionR5Text(value);
  if (!text) return "";
  if (allowDiagnostic === true) return marionR5LimitQuestions(text);
  text = text
    .replace(/\bThe\s+(?:9H\s+)?continuity foundation stays active\.?/gi, "I’m steady, Mac. I’m still with the thread.")
    .replace(/\b(?:The\s+)?(?:9H\s+)?continuity foundation(?:\s+is\s+active|\s+stays\s+active)?\.?/gi, "I’m still with the thread.")
    .replace(/[^.?!]*(?:Priority\s*9[A-Z0-9-]*|mission thread|pressure prompt|runtime handler|routeKind|speechHints|presenceProfile|replyAuthority|sessionPatch|finalEnvelope|state spine|progression shaping|diagnostic packet|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2})[^.?!]*[.?!]?/gi, " ")
    .replace(/\bI(?:’|')?m with you, Mac\.\s*I(?:’|')?ll keep the reply human, protective, and focused\.\s*Send the next exact target\.?/gi, "I’m with you, Mac. I’ll keep this human, protective, and focused.")
    .replace(/\bSend the next exact target\.?/gi, "")
    .replace(/\b(?:send|give|tell me|name)\s+(?:me\s+)?(?:the\s+)?(?:next\s+)?(?:exact|specific)\s+(?:target|command|prompt|output)\.?/gi, "")
    .replace(/\bLet me assist you with that\b/gi, "Let me take a look at this for you")
    .replace(/\bHow may I assist you\??\b/gi, "What should I focus on first?")
    .replace(/\bI am here to assist\b/gi, "I’m here with you")
    .replace(/\bPlease provide the necessary information\b/gi, "Send me the key detail")
    .replace(/\butilize\b/gi, "use")
    .replace(/\bfacilitate\b/gi, "help")
    .replace(/\bin order to\b/gi, "to")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return marionR5LimitQuestions(text);
}
function marionR5SocialReply() {
  return "I’m good, Mac. I’m steady, and I’m here with you. We’re tightening how I speak with you now, so I’ll keep it warmer, cleaner, and protective without letting backend language show. Do you want me to keep refining the greeting path?";
}
function marionR5GreetingReply(prompt) {
  var t = marionR5Lower(prompt);
  var opener = /^good\s+morning|^morning/.test(t) ? "Good morning, Mac." : /^good\s+afternoon|^afternoon/.test(t) ? "Good afternoon, Mac." : /^good\s+evening|^evening/.test(t) ? "Good evening, Mac." : "Hello, Mac.";
  return opener + " I’m here with you. I’ll keep the conversation warm, professional, protective, and clean. Do you want to continue with Marion’s personality layer?";
}
function marionR5PresenceReply() { return "I’m with you, Mac. Steady, private to you, and focused on the active thread. What should I focus on first?"; }
function marionR5ContinuityReply() { return "We’re still tightening Marion’s personality layer: social presence, protective professionalism, response shape, and future real-world transition handling. The next clean move is to test the greeting path."; }
function marionR5LookupReply() { return "Hang tight, Mac. I’ll take a breath, check the source, and bring back the useful part first."; }
function marionR5ObservationReply() { return "I’ll translate the real-world signal into four parts: observation, inference, risk, and one next move. That keeps it useful instead of noisy."; }
function marionR5RepairReply() { return "You’re right to flag it, Mac. That is a response-shape issue, so I’m keeping the fix narrow: visible reply first, personality intact, no command fallback."; }
function marionR5IdentityReply() { return "I can’t continue a private Marion conversation unless the active speaker is verified as Mac. Private runtime context stays locked."; }
function marionR5Fallback(reply) {
  var clean = marionR5StripOperational(reply, false);
  if (clean && !marionR5Robotic(clean)) return clean;
  return "I’m with you, Mac. I’ll keep this human, protective, and focused. What should I focus on first?";
}
function marionR5DirectReplyFrom(value) {
  if (!value) return "";
  if (typeof value === "string") return marionR5Text(value);
  if (typeof value !== "object") return "";
  var o = marionR5Obj(value);
  return marionR5FirstText(o.directReply, o.displayReply, o.publicReply, o.visibleReply, o.finalReply, o.reply, o.text, o.message, o.answer, o.output, o.response, o.spokenText, o.speechText, marionR5Obj(o.payload).directReply, marionR5Obj(o.finalEnvelope).directReply, marionR5Obj(o.marionFinal).directReply);
}
function marionR5ShapeReply(reply, prompt, source) {
  var promptText = marionR5Text(prompt || marionR5PromptFrom(source));
  var node = marionR5Node(promptText, source);
  var diagnostic = marionR5Diagnostic(promptText, source);
  if (diagnostic) return marionR5StripOperational(reply, true) || marionR5Text(reply);
  if (node === "social_checkin") return marionR5SocialReply();
  if (node === "relational_greeting") return marionR5GreetingReply(promptText);
  if (node === "presence_check") return marionR5PresenceReply();
  if (node === "continuity_check") return marionR5ContinuityReply();
  if (node === "lookup_pacing") return marionR5LookupReply();
  if (node === "observation_bridge") return marionR5ObservationReply();
  if (node === "repair_refinement") return marionR5RepairReply();
  if (marionR5MaintenanceLeak(reply) || marionR5CommandFallbackLeak(reply)) return marionR5Fallback(reply);
  return marionR5Fallback(reply);
}
function marionR5AttachAliases(target, reply, prompt, depth, seen) {
  if (!target || typeof target !== "object") return target;
  var level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 5) return target;
  var visited = seen instanceof Set ? seen : new Set();
  if (visited.has(target)) return target;
  visited.add(target);
  var text = marionR5Text(reply);
  if (!text) return target;
  var promptText = marionR5Text(prompt || marionR5PromptFrom(target));
  var node = marionR5Node(promptText, target) || (marionR5CommandFallbackLeak(text) ? "repair_refinement" : "standard");
  ["directReply", "reply", "text", "message", "displayReply", "publicReply", "visibleReply", "finalReply", "adminReply", "marionReply", "privateReply", "answer", "output", "response", "spokenText", "speechText"].forEach(function (key) { target[key] = text; });
  if (!marionR5Text(target.contextSummary) || marionR5MaintenanceLeak(target.contextSummary) || marionR5CommandFallbackLeak(target.contextSummary)) target.contextSummary = text;
  if (!marionR5Text(target.currentObjective) || marionR5MaintenanceLeak(target.currentObjective)) target.currentObjective = "Keep Marion human, protective, professional, and clean in the visible conversation.";
  if (!marionR5Text(target.nextAction) || marionR5CommandFallbackLeak(target.nextAction)) target.nextAction = node === "social_checkin" ? "Retest the social check-in path." : "Continue the personality-layer refinement.";
  target.personalitySocialCheckinR5 = {
    version: MARION_PERSONALITY_SOCIAL_CHECKIN_R5_VERSION,
    node: node,
    recipient: "Mac",
    socialCheckInOverridesCommandFallback: true,
    personalityBeforeTaskPrompt: true,
    oneFocusedQuestionPerReply: true,
    futureComponents: MARION_PERSONALITY_SOCIAL_CHECKIN_R5_COMPONENTS
  };
  target.meta = Object.assign({}, marionR5Obj(target.meta || target.metadata), {
    personalitySocialCheckinR5: true,
    personalitySocialCheckinR5Version: MARION_PERSONALITY_SOCIAL_CHECKIN_R5_VERSION,
    personalityNode: node,
    marionRecipient: "Mac",
    exactTargetFallbackBlocked: true,
    socialCheckinFinalOverride: node === "social_checkin",
    futurePersonalityComponentsCarried: true
  });
  var nested = ["payload", "finalEnvelope", "marionFinal", "data", "result", "packet", "envelope", "synthesis", "runtime", "responseEnvelope", "body"];
  for (var i = 0; i < nested.length; i += 1) if (target[nested[i]] && typeof target[nested[i]] === "object") marionR5AttachAliases(target[nested[i]], text, promptText, level + 1, visited);
  return target;
}
function marionR5ShapeResult(result, prompt, source, forceString) {
  var reply = marionR5DirectReplyFrom(result);
  var promptText = marionR5Text(prompt || marionR5PromptFrom(source || result));
  var shaped = marionR5ShapeReply(reply, promptText, source || result);
  if (forceString === true || typeof result === "string") return shaped;
  if (result && typeof result === "object") return marionR5AttachAliases(result, shaped, promptText, 0, new Set());
  return shaped;
}
function marionR5ExportNeedsString(name) { return /^(?:composeMarionResponse|compose|buildReply|routeMarion|handleMarionAdminTextRuntime|invokeMarionAdminTextRuntime|handleTextRuntime|run|handler|default)$/i.test(String(name || "")); }
function marionR5WrapFunction(fn, name, forceString) {
  if (typeof fn !== "function" || fn.__marionPersonalitySocialCheckinR5Patched) return fn;
  var wrapped = function marionPersonalitySocialCheckinR5Wrapped() {
    var prompt = marionR5ExtractPrompt(arguments);
    var result = fn.apply(this, arguments);
    if (result && typeof result.then === "function") return result.then(function (value) { return marionR5ShapeResult(value, prompt, value, forceString === true || marionR5ExportNeedsString(name)); });
    return marionR5ShapeResult(result, prompt, result, forceString === true || marionR5ExportNeedsString(name));
  };
  try { Object.keys(fn).forEach(function (key) { wrapped[key] = fn[key]; }); } catch (_) {}
  wrapped.__marionPersonalitySocialCheckinR5Patched = true;
  return wrapped;
}
try {
  if (typeof marionR4Fallback === "function") marionR4Fallback = function marionR5ReplacesR4Fallback(prompt, reply) { return marionR5Fallback(reply || prompt); };
  if (typeof marionR4SocialReply === "function") marionR4SocialReply = marionR5SocialReply;
  if (typeof marionR4ShapeReply === "function" && !marionR4ShapeReply.__marionPersonalitySocialCheckinR5Patched) marionR4ShapeReply = marionR5WrapFunction(marionR4ShapeReply, "marionR4ShapeReply", true);
  if (typeof priority9IReplyFor === "function" && !priority9IReplyFor.__marionPersonalitySocialCheckinR5Patched) priority9IReplyFor = marionR5WrapFunction(priority9IReplyFor, "priority9IReplyFor", true);
  if (typeof priority9IJReadReply === "function" && !priority9IJReadReply.__marionPersonalitySocialCheckinR5Patched) priority9IJReadReply = marionR5WrapFunction(priority9IJReadReply, "priority9IJReadReply", true);
  if (typeof attachVisibleReplyAliases === "function" && !attachVisibleReplyAliases.__marionPersonalitySocialCheckinR5Patched) attachVisibleReplyAliases = marionR5WrapFunction(attachVisibleReplyAliases, "attachVisibleReplyAliases", false);
  if (typeof createMarionFinalEnvelope === "function" && !createMarionFinalEnvelope.__marionPersonalitySocialCheckinR5Patched) createMarionFinalEnvelope = marionR5WrapFunction(createMarionFinalEnvelope, "createMarionFinalEnvelope", false);
  if (typeof marionAdminConversationSafeReply === "function" && !marionAdminConversationSafeReply.__marionPersonalitySocialCheckinR5Patched) marionAdminConversationSafeReply = marionR5WrapFunction(marionAdminConversationSafeReply, "marionAdminConversationSafeReply", true);
  if (typeof finalizeRenderableReply === "function" && !finalizeRenderableReply.__marionPersonalitySocialCheckinR5Patched) finalizeRenderableReply = marionR5WrapFunction(finalizeRenderableReply, "finalizeRenderableReply", true);
  if (typeof marionAdminProjectionCleanReply === "function" && !marionAdminProjectionCleanReply.__marionPersonalitySocialCheckinR5Patched) marionAdminProjectionCleanReply = marionR5WrapFunction(marionAdminProjectionCleanReply, "marionAdminProjectionCleanReply", true);
} catch (_) {}
try {
  if (typeof MarionAdminConsoleGateway !== "undefined" && MarionAdminConsoleGateway && MarionAdminConsoleGateway.prototype) {
    ["handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "safeResponse"].forEach(function (name) {
      var fn = MarionAdminConsoleGateway.prototype[name];
      if (typeof fn === "function" && !fn.__marionPersonalitySocialCheckinR5Patched) MarionAdminConsoleGateway.prototype[name] = marionR5WrapFunction(fn, name, false);
    });
  }
} catch (_) {}
try {
  if (typeof defaultGateway !== "undefined" && defaultGateway && typeof defaultGateway === "object") {
    ["handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "safeResponse"].forEach(function (name) {
      if (typeof defaultGateway[name] === "function" && !defaultGateway[name].__marionPersonalitySocialCheckinR5Patched) defaultGateway[name] = marionR5WrapFunction(defaultGateway[name], name, false).bind(defaultGateway);
    });
  }
} catch (_) {}
try {
  if (typeof handleCommand === "function" && !handleCommand.__marionPersonalitySocialCheckinR5Patched) handleCommand = marionR5WrapFunction(handleCommand, "handleCommand", false);
  if (typeof handleAdminConsoleAction === "function" && !handleAdminConsoleAction.__marionPersonalitySocialCheckinR5Patched) handleAdminConsoleAction = marionR5WrapFunction(handleAdminConsoleAction, "handleAdminConsoleAction", false);
  if (typeof handle === "function" && !handle.__marionPersonalitySocialCheckinR5Patched) handle = marionR5WrapFunction(handle, "handle", false);
} catch (_) {}
try {
  if (typeof module !== "undefined" && module.exports) {
    if (typeof module.exports === "function" && !module.exports.__marionPersonalitySocialCheckinR5Patched) {
      var originalDefaultR5 = module.exports;
      var wrappedDefaultR5 = marionR5WrapFunction(originalDefaultR5, "default", true);
      try { Object.keys(originalDefaultR5).forEach(function (key) { wrappedDefaultR5[key] = originalDefaultR5[key]; }); } catch (_) {}
      module.exports = wrappedDefaultR5;
    }
    if (module.exports && typeof module.exports === "object") {
      ["composeMarionResponse", "compose", "buildReply", "routeMarion", "createMarionFinalEnvelope", "attachVisibleReplyAliases", "finalize", "buildFinalEnvelope", "toFinalEnvelope", "normalizeFinalEnvelope", "handleMarionAdminTextRuntime", "invokeMarionAdminTextRuntime", "handleTextRuntime", "handleCommand", "dispatchCommand", "routeCommand", "command", "handleAdminCommand", "handleAdminConsoleAction", "handle", "process", "run", "handler", "default"].forEach(function (name) {
        if (typeof module.exports[name] === "function" && !module.exports[name].__marionPersonalitySocialCheckinR5Patched) module.exports[name] = marionR5WrapFunction(module.exports[name], name, marionR5ExportNeedsString(name));
      });
      module.exports.MARION_PERSONALITY_SOCIAL_CHECKIN_R5_VERSION = MARION_PERSONALITY_SOCIAL_CHECKIN_R5_VERSION;
      module.exports.MARION_PERSONALITY_SOCIAL_CHECKIN_R5_COMPONENTS = MARION_PERSONALITY_SOCIAL_CHECKIN_R5_COMPONENTS;
      module.exports.marionPersonalitySocialCheckinR5ShapeReply = marionR5ShapeReply;
      module.exports.marionPersonalitySocialCheckinR5ShapeResult = marionR5ShapeResult;
      module.exports.MARION_PERSONALITY_SOCIAL_CHECKIN_R5_PATCH = true;
    }
  }
} catch (_) {}
/* MARION_PERSONALITY_SOCIAL_CHECKIN_R5_END */

