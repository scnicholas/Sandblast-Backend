"use strict";

const VERSION = "marionBridge v7.8.3 NYX-PUBLIC-AGENT-ALIAS-LOCK + RENDER-DEPLOY-HARDENED + LANGUAGESPHERE-SURFACE-PASSTHROUGH + CONFIDENCE-AWARE-SHAPING-CARRY + DOMAIN-CONCIERGE-RUNTIME-ORCHESTRATION + SHORT-CONCEPT-FOLLOWUP-BRIDGE-CARRY + BARE-DOMAIN-ACTIVATION-BRIDGE-LOCK + LOOP-FALLBACK-FINAL-REJECTION + SIX-DOMAIN-DEFINITION-ROUTING-AUTHORITY-LOCK + IDENTITY-RESET-GENERIC-FALLBACK-LOOP-LOCK + OUTER-SCHEDULER-BYPASS-COMPAT + TECHNICAL-TARGET-LOCK + FALLBACK-KNOWLEDGE-DOMAIN-ROUTE-FIX + FINAL-RUNTIME-TELEMETRY + FIVE-TURN-CONTINUITY-PARITY-BRIDGE + FINAL-AUTHORITY-STATE-CREATIVE-COMPAT-HARDENED + TELEMETRY-VISIBILITY-FAILURE-SIGNATURE-AUDIT";
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
const DOMAIN_CONCIERGE_VERSION = "nyx.marion.domainConcierge/1.0";
const CONFIDENCE_AWARE_RESPONSE_SHAPING_VERSION = "nyx.marion.confidenceAwareResponseShaping/1.0";
const LANGUAGE_SPHERE_BRIDGE_VERSION = "nyx.marion.languageSphereBridge/1.0";
const MARION_BRIDGE_DEPLOY_HARDENING_VERSION = "nyx.marion.bridgeDeployHardening/1.0";

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
  languageSphereTelemetry: dependencyStatus("LanguageSphereTelemetry", languageSphereTelemetryLoaded)
});

function safeStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function lower(value){return safeStr(value).toLowerCase();}
function isObj(value){return !!value&&typeof value==="object"&&!Array.isArray(value);}
function safeObj(value){return isObj(value)?value:{};}
function safeArray(value){return Array.isArray(value)?value:[];}
function firstText(){for(let i=0;i<arguments.length;i+=1){const value=safeStr(arguments[i]);if(value)return value;}return "";}
function hashText(value){const source=lower(value).replace(/[^a-z0-9]+/g," ").trim();let hash=0;for(let i=0;i<source.length;i+=1){hash=((hash<<5)-hash)+source.charCodeAt(i);hash|=0;}return String(hash>>>0);}

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
    publicAgent:"nyx",
    userFacingAgent:"Nyx",
    displayAuthority:"nyx",
    contextPassport:safeClonePlain(src.contextPassport),
    events:safeArray(src.events).map((event)=>safeClonePlain(event)).slice(0,20),
    telemetry:safeClonePlain(src.telemetry)
  };
}
function languageSphereText(input={}){
  const o=safeObj(input);
  return firstText(o.userQuery,o.text,o.query,o.rawUserQuery,o.userText,o.message);
}
function languageSphereTargetLanguage(input={}){
  const o=safeObj(input), original=safeObj(o.original), body=safeObj(original.body), meta=safeObj(original.meta);
  return firstText(o.targetLanguage,o.responseLanguage,original.targetLanguage,body.targetLanguage,meta.targetLanguage,"en").toLowerCase();
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
function attachLanguageSphereFinalMetadata(packet={},ctx={}){
  const out=safeObj(packet);
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
    contextPassport:safeObj(passport.contextPassport),
    events:safeArray(passport.events),
    telemetry:safeObj(telemetry)
  });
  const contextPassport=Object.keys(safeObj(languageSphere.contextPassport)).length?languageSphere.contextPassport:buildNyxPublicContextPassport(languageSphere);
  languageSphere.contextPassport=contextPassport;
  const languageSphereEvents=languageSphere.events;
  const languageSphereTelemetry=languageSphere.telemetry;
  const multilingualFinalEnvelope=safeObj(multilingual.finalEnvelope);
  const finalEnvelope={...safeObj(out.finalEnvelope),languageSphere,contextPassport,languageSphereEvents,languageSphereTelemetry,multilingualFinalEnvelope};
  return {
    ...out,
    languageSphere,
    contextPassport,
    languageSphereEvents,
    events:languageSphereEvents,
    languageSphereTelemetry,
    telemetry:languageSphereTelemetry,
    multilingualFinalEnvelope,
    finalEnvelope,
    payload:{...safeObj(out.payload),languageSphere,contextPassport,languageSphereEvents,events:languageSphereEvents,languageSphereTelemetry,telemetry:languageSphereTelemetry,multilingualFinalEnvelope},
    meta:{...safeObj(out.meta),languageSphereBridgeVersion:LANGUAGE_SPHERE_BRIDGE_VERSION,languageSphere,contextPassport,languageSphereEvents,languageSphereTelemetry,multilingualFinalEnvelope},
    diagnostics:{...safeObj(out.diagnostics),languageSphereBridge:{version:LANGUAGE_SPHERE_BRIDGE_VERSION,universalTranslator:!!universalTranslatorMod,multilingualFinalEnvelope:!!multilingualFinalEnvelopeMod,contextPassportEvents:!!contextPassportEventsMod,telemetry:!!languageSphereTelemetryMod}}
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
      emotionRuntime:safeObj(resolvedEmotionPacket)
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
    domainConfidence:Object.keys(rawDc).length?rawDc:safeObj(routing.domainConfidence),
    domainConcierge:dc
  };
  return {...base,routing:nextRouting,domainConcierge:dc,confidenceAwareResponseShaping:safeObj(dc.confidenceAwareResponseShaping),domainConfidence:nextRouting.domainConfidence};
}

function buildBridgeRuntimeTelemetry({source="marionBridge",normalized={},routed={},contract={},reply="",finalEnvelopeTrusted=false,canEmit=true,error="",loopGuardResult={},resolvedEmotionPacket={}}={}){
  const n=safeObj(normalized), route=safeObj(safeObj(routed).routing), c=safeObj(contract), meta=safeObj(c.meta), diag=safeObj(c.diagnostics), domainConcierge=compactDomainConciergeForBridge(firstObj(n.domainConcierge,route.domainConcierge,c.domainConcierge,safeObj(c.meta).domainConcierge,safeObj(c.memoryPatch).domainConcierge));
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
    finalEnvelopeTrusted: !!finalEnvelopeTrusted,
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
  return /\b(routeKind=|speechHints=|presenceProfile=|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority=|nyxStateHint=|diagnostic packet|final envelope missing|non-final)\b/i.test(telemetryAuditText(value));
}
function stripTelemetryLeakFromReply(value=""){
  const text=telemetryAuditText(value);
  if(!text)return"";
  if(isTelemetryLeakText(text))return text.replace(/\b(routeKind|speechHints|presenceProfile|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority|nyxStateHint)\s*=\s*[^.;,\n]+[.;,]?\s*/gi,"").replace(/\bdiagnostic packet\b/ig,"").replace(/\bfinal envelope missing\b/ig,"").replace(/\bnon-final\b/ig,"").replace(/\s+/g," ").trim();
  return text;
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
  const domainConcierge=compactDomainConciergeForBridge(out.domainConcierge || safeObj(out.stateBridge).domainConcierge);
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
function isRogueFallbackText(value){const t=lower(value);if(!t)return false;if(/give me the specific target or outcome/i.test(t)||/specific target.*answer directly/i.test(t))return true;return /\b(i['’]?m here and tracking the turn|i am here and tracking the turn|nyx is live and tracking the turn|give me the next clear target|send a specific command|press reset|ready\.\s*send|i blocked a repeated fallback|i['’]?m here\.?\s*what[’']?s next|i am here\.?\s*what[’']?s next|i['’]?m online\.?\s*what[’']?s next|i am online\.?\s*what[’']?s next|i['’]?m here,?\s*fully online\.?\s*what are we working on|hi\s*[—-]\s*i['’]?m here|fully online.*what are we working on|i['’]?m holding the thread\.\s*tell me what continuity point|technical path confirmed\.\s*i['’]?ll inspect the route output, composer reply, final envelope, bridge return shape, and state spine mutation|ready for the next test|online\. send next test|still connected\. send the next test)\b/i.test(t);}
function isThinPlaceholderText(value){const t=lower(value);if(!t)return true;if(isDiagnosticText(t)||isRogueFallbackText(t))return true;if(t.length<18)return /^(ready|done|working|ok|okay|yes|no|next|continue|what next|i['’]?m here)$/i.test(t);return /^(i['’]?m here|i am here|i['’]?m online|i am online|still connected|online|ready)\b.*\b(next|test|continue|working on)\b/i.test(t)||/\b(i['’]?ll inspect|i will inspect|i['’]?m holding|i am holding)\b/i.test(t);}
function neutralInterruptedReply(){return "";}
function identityAnchorReply(){return "";}
function hotFallbackReply(_reason,_input={}){return "";}
function createLocalFinalEnvelope({normalized={},routed={},contract={},reason="local_final_fallback",loopGuardResult={}}={}){
  const routing=safeObj(routed.routing),intent=firstText(routing.intent,contract.intent,"simple_chat"),domain=firstText(routing.domain,contract.domain,normalized.domain,"general");
  let reply=firstText(extractReply(contract));
  if(!reply||isThinPlaceholderText(reply)||isDiagnosticText(reply))return buildErrorResult(reason||"local_final_reply_missing",{issues:["local_final_reply_missing"],loopGuard:safeObj(loopGuardResult)},normalized);
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
    diagnostics:{bridgeVersion:VERSION,deployHardeningVersion:MARION_BRIDGE_DEPLOY_HARDENING_VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,routerCalled:true,composerCalled:!!Object.keys(safeObj(contract)).length,composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,dependencies:DEPENDENCY_STATUS,loopGuardCalled:!!loopGuardMod,loopGuard:safeObj(loopGuardResult),singleContract:true,zeroLoopSurface:true,localFinalFallback:true,reason},
    meta:{version:VERSION,bridgeVersion:VERSION,deployHardeningVersion:MARION_BRIDGE_DEPLOY_HARDENING_VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,endpoint:CANONICAL_ENDPOINT,usedBridge:true,replyAuthority:"marionFinalEnvelope",semanticAuthority:"composeMarionResponse",composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopePresent:true,zeroLoopSurface:true,localFinalFallback:true,reason}
  };
  return attachLanguageSphereFinalMetadata(packet,{normalized,routed,contract:{...safeObj(contract),reply,text:reply,spokenText:firstText(contract.spokenText,reply)},reply,runtimeTelemetry,loopGuardResult});
}
function extractUserText(input={}){const src=safeObj(input),body=safeObj(src.body),payload=safeObj(src.payload),packet=safeObj(src.packet),synthesis=safeObj(packet.synthesis);return firstText(src.userQuery,src.text,src.query,src.message,body.userQuery,body.text,body.query,body.message,payload.userQuery,payload.text,payload.query,payload.message,synthesis.userQuery,synthesis.text);}
function extractLane(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return firstText(src.lane,src.sessionLane,body.lane,body.sessionLane,session.lane,meta.lane,"general")||"general";}
function extractTurnId(input={}){const src=safeObj(input),body=safeObj(src.body),meta=safeObj(src.meta||body.meta);return firstText(src.turnId,src.requestId,src.traceId,src.id,body.turnId,body.requestId,body.traceId,meta.turnId,meta.requestId,meta.traceId);}
function extractPreviousMemory(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return safeObj(src.previousMemory||src.turnMemory||src.memory||body.previousMemory||body.turnMemory||body.memory||session.previousMemory||session.turnMemory||session.memory||meta.previousMemory||{});}
function extractMarionIntentPacket(input={}){const src=safeObj(input),body=safeObj(src.body),session=safeObj(src.session||body.session),meta=safeObj(src.meta||body.meta);return safeObj(src.marionIntent||src.intentPacket||body.marionIntent||body.intentPacket||session.marionIntent||meta.marionIntent||{});}
function extractRequestedDomain(input={}){const src=safeObj(input),body=safeObj(src.body),meta=safeObj(src.meta||body.meta),packet=safeObj(src.packet),routing=safeObj(packet.routing);return firstText(src.requestedDomain,src.domain,body.requestedDomain,body.domain,meta.requestedDomain,meta.domain,meta.preferredDomain,routing.domain,"general")||"general";}
function normalizeInbound(input={}){let source=safeObj(input),commandPacket={};if(commandNormalizerMod&&typeof commandNormalizerMod.normalizeCommand==="function"){try{commandPacket=safeObj(commandNormalizerMod.normalizeCommand(source));if(commandPacket.userText||commandPacket.text){source={...source,text:firstText(commandPacket.userText,commandPacket.text,source.text,source.userQuery),userQuery:firstText(commandPacket.userText,commandPacket.text,source.userQuery,source.text),query:firstText(commandPacket.userText,commandPacket.text,source.query,source.text),sessionId:firstText(commandPacket.sessionId,source.sessionId),state:safeObj(commandPacket.state||source.state),commandPacket};}}catch(err){commandPacket={ok:false,error:safeStr(err&&(err.message||err)||"command_normalizer_failed")};}}const inputSource=canonicalInputSource(source),rawUserQuery=extractUserText(source),publicUserQuery=normalizePublicNyxAddress(rawUserQuery),userQuery=normalizeParityText(publicUserQuery),previousMemory=extractPreviousMemory(source),bareKnowledgeDomain=bareKnowledgeDomainActivationDomain(userQuery||rawUserQuery),activeKnowledgeDomain=bareKnowledgeDomain||activeKnowledgeDomainFromMemory(previousMemory),technicalTargetLock=canonicalTechnicalTargetFromText(userQuery||rawUserQuery),issues=[];if(!userQuery)issues.push("user_query_missing");const turnId=extractTurnId(source)||`marion_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,sessionId=firstText(source.sessionId,source.body&&source.body.sessionId,source.meta&&source.meta.sessionId,"public")||"public";return{ok:issues.length===0,issues,original:source,commandPacket,userQuery,text:userQuery,query:userQuery,rawUserQuery,publicUserQuery,inputSource,source:inputSource,voiceTextParity:{active:inputSource==="voice"||rawUserQuery!==userQuery,source:inputSource,normalizedText:userQuery,rawHash:hashText(rawUserQuery),normalizedHash:hashText(userQuery),parityLock:true},technicalTargetLock,knowledgeDomain:bareKnowledgeDomain||activeKnowledgeDomain,activeKnowledgeDomain,lastActivatedKnowledgeDomain:activeKnowledgeDomain,knowledgeDomainExplicit:!!bareKnowledgeDomain,knowledgeDomainReason:bareKnowledgeDomain?"bare_domain_activation":(activeKnowledgeDomain&&isShortConceptFollowup(userQuery)?"active_domain_short_concept_carry":""),targetFile:firstText(safeObj(technicalTargetLock).targetFile,""),targetPath:firstText(safeObj(technicalTargetLock).targetPath,""),targetName:firstText(safeObj(technicalTargetLock).targetName,""),continuityTurnKey:buildContinuityTurnKey(userQuery,sessionId,turnId),lane:extractLane(source),requestedDomain:extractRequestedDomain(source),domain:extractRequestedDomain(source),previousMemory,marionIntent:extractMarionIntentPacket(source),turnId,sessionId};}
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

function definitionKnowledgeDomainFromText(text=""){const bare=bareKnowledgeDomainActivationDomain(text);if(bare)return bare;const t=lower(text);if(!isDefinitionQuery(t))return"";if(safeObj(canonicalTechnicalTargetFromText(t)).targetPath)return"";if(/\b(full autopsy|line[-\s]?by[-\s]?line|audit|critical fix|critical fixes|patch|debug|backend|frontend|widget|script|file|api\/chat|render|deploy|syntax|node --check)\b/i.test(t))return"";const pairs=[["law",/\b(contract consideration|legal consideration|consideration in contract|consideration|contract|contract law|statute|jurisdiction|legal information|legal advice|liability|negligence|fiduciary|tort|case law|compliance)\b/i],["finance",/\b(cash[-\s]?flow|unit economics|runway|margin|gross margin|profit|revenue|ltv|cac|working capital|burn rate|capital markets|pricing tier|scenario analysis|financial resilience)\b/i],["psychology",/\b(cognitive distortion|emotional regulation|attachment|trauma|bias|cognition|cognitive|shutdown|emotional shutdown|anxiety|panic|behavior|behaviour)\b/i],["ai",/\b(tool routing|rag|retrieval augmented generation|llm|large language model|embedding|agent orchestration|ai agent|artificial intelligence|machine learning|model inference|prompt injection in ai)\b/i],["cyber",/\b(least privilege|mfa|multi[-\s]?factor|iam|identity access|zero trust|incident response|threat model|input validation|secrets rotation|phishing|ransomware|endpoint security|cloud security|network security|data protection|privacy minimization)\b/i],["english",/\b(sentence clarity|syntax|grammar|tone|wording|language flow|professional clarity|plain language|copyedit|proofread)\b/i]];for(const [d,rx]of pairs){if(rx.test(t))return d;}return"";}


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
  if(/\b(full autopsy|line[-\s]?by[-\s]?line|audit|critical fix|critical fixes|patch|debug|backend|frontend|widget|script|file|api\/chat|render|deploy|syntax|node --check)\b/i.test(t))return null;
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

function fallbackRoute(normalized){const text=lower(normalized.userQuery),bareDomain=bareKnowledgeDomainActivationDomain(normalized.userQuery),activeDomain=normalized.activeKnowledgeDomain&&isShortConceptFollowup(normalized.userQuery)?normalizeBridgeKnowledgeDomain(normalized.activeKnowledgeDomain):"",technicalTargetLock=safeObj(normalized.technicalTargetLock||canonicalTechnicalTargetFromText(normalized.userQuery)),crossDomainProfile=crossDomainSecondaryLaneProfile(normalized.userQuery),definitionDomain=bareDomain||activeDomain||(crossDomainProfile&&crossDomainProfile.primary?crossDomainProfile.primary:definitionKnowledgeDomainFromText(normalized.userQuery));let intent="simple_chat",knowledgeDomain="";if(bareDomain){intent="domain_question";knowledgeDomain=bareDomain;}else if(activeDomain){intent="domain_question";knowledgeDomain=activeDomain;}else if(definitionDomain){intent="domain_question";knowledgeDomain=definitionDomain;}else if(/who are you|what are you|what(?:\'|’)s your name|what is your name|your name|what should i call you|are you nyx|how.*marion.*think|how.*you.*think|marion helps you think|identity|consciousness/i.test(text))intent="identity_query";else if(/bug|error|route|endpoint|index|diag|autopsy|line[- ]?by[- ]?line|loop|widget|frontend|backend|fix|script|file|state spine|chatengine|marionbridge|composemarionresponse|final envelope/i.test(text))intent="technical_debug";else if(/sad|stress|overwhelm|depress|anx|hurt|alone|frustr|panic|grief/i.test(text)){intent="emotional_support";knowledgeDomain="psychology";}else if(/rewrite|polish|proofread|grammar|tone|copyedit|wording|professional clarity|business english/i.test(text)){intent="domain_question";knowledgeDomain="english";}else if(/least privilege|mfa|multi[-\s]?factor|iam|identity access|zero trust|incident response|threat model|phishing|ransomware|prompt injection|cyber|cybersecurity|endpoint security|cloud security|network security|data protection|privacy minimization/i.test(text)){intent="domain_question";knowledgeDomain="cyber";}else if(/unit economics|cash flow|runway|margin|ltv|cac|pricing|finance|financial|capital markets|risk model/i.test(text)){intent="domain_question";knowledgeDomain="finance";}else if(/contract consideration|canadian law|legal information|legal advice|case law|statute|jurisdiction|tort|criminal law|charter/i.test(text)){intent="domain_question";knowledgeDomain="law";}else if(/cognitive distortion|emotional regulation|attachment|trauma|psychology|bias|fallacy/i.test(text)){intent="domain_question";knowledgeDomain="psychology";}else if(/rag|llm|embedding|tool routing|ai agent|machine learning|artificial intelligence|orchestration/i.test(text)){intent="domain_question";knowledgeDomain="ai";}else if(/digital transformation|business strategy|organizational intelligence|auditing|audit process|market positioning|operational strategy|price|sponsor|media|monet|pitch|fund|invest|sales|proposal/i.test(text))intent="business_strategy";else if(/top 10|song|artist|album|chart|music|radio|playlist/i.test(text))intent="music_query";else if(/news|story|headline|article|rss|newscanada/i.test(text))intent="news_query";else if(/roku|tv app|channel|linear tv|stream/i.test(text))intent="roku_query";else if(/remember|last time|continue|state spine|memory/i.test(text))intent="identity_or_memory";if(intent==="simple_chat"&&/\b(tell me about|explain|describe|define|what is|what are|what does)\b/i.test(text))intent="domain_question";const domainMap={simple_chat:"general",technical_debug:"technical",emotional_support:"emotional",business_strategy:"business",music_query:"music",news_query:"news",roku_query:"roku",identity_query:"identity",identity_or_memory:"memory",domain_question:"general_reasoning"};const domain=knowledgeDomain||domainMap[intent]||"general";return{ok:true,marionIntent:{activate:intent!=="simple_chat",intent,confidence:intent==="simple_chat"?0.4:0.82,source:"bridge_fallback_router",technicalTargetLock,knowledgeDomain,knowledgeDomainExplicit:!!knowledgeDomain,knowledgeDomainReason:crossDomainProfile&&crossDomainProfile.reason?crossDomainProfile.reason:(knowledgeDomain?"bridge_fallback_knowledge_terms":""),secondaryDomains:crossDomainProfile?crossDomainProfile.secondary||[]:[],answerMode:crossDomainProfile?crossDomainProfile.answerMode||"":"",crossDomainProfile:crossDomainProfile||null},routing:{domain,intent,knowledgeDomain,secondaryDomains:crossDomainProfile?crossDomainProfile.secondary||[]:[],answerMode:crossDomainProfile?crossDomainProfile.answerMode||"":"",crossDomainProfile:crossDomainProfile||null,technicalTargetLock,lane:normalized.lane,endpoint:CANONICAL_ENDPOINT,mode:knowledgeDomain?"knowledge_domain":"balanced",depth:knowledgeDomain==="cyber"||knowledgeDomain==="ai"?"forensic":"balanced",domainConfidence:{version:"nyx.marion.domainConfidence/1.1",confidence:knowledgeDomain?0.88:(intent==="simple_chat"?0.4:0.7),band:knowledgeDomain?"medium":"low",routeLocked:!!knowledgeDomain,primaryDomain:domain,knowledgeDomain,reason:knowledgeDomain?"bridge_fallback_knowledge_terms":"bridge_fallback_router"}},routerVersion:"bridge_fallback_router/1.1"};}
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
  const bare=bareKnowledgeDomainActivationDomain(text);if(bare)return bridgeDomainActivationReply(bare);
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
    userQuery:normalized.userQuery,text:normalized.userQuery,query:normalized.userQuery,rawUserQuery:normalized.rawUserQuery,inputSource:normalized.inputSource,source:normalized.inputSource,voiceTextParity:safeObj(normalized.voiceTextParity),continuityTurnKey:normalized.continuityTurnKey,
    domain:safeStr(routing.domain||domainConcierge.route||normalized.domain||"general")||"general",requestedDomain:safeStr(routing.domain||domainConcierge.route||normalized.requestedDomain||"general")||"general",intent:safeStr(routing.intent||domainConcierge.intent||marionIntent.intent||"simple_chat")||"simple_chat",
    knowledgeDomain:firstText(routing.knowledgeDomain,domainConcierge.knowledgeDomain,normalized.knowledgeDomain,normalized.activeKnowledgeDomain),activeKnowledgeDomain:firstText(normalized.activeKnowledgeDomain,routing.knowledgeDomain,domainConcierge.knowledgeDomain),lastActivatedKnowledgeDomain:firstText(normalized.lastActivatedKnowledgeDomain,normalized.activeKnowledgeDomain,routing.knowledgeDomain,domainConcierge.knowledgeDomain),
    marionIntent,routing:{...routing,domainConcierge},domainConcierge,concierge:domainConcierge,domainConfidence:safeObj(routing.domainConfidence||safeObj(safeObj(routed).domainConciergeRaw).domainConfidence),questionShape:safeObj(safeObj(safeObj(routed).domainConciergeRaw).questionShape),
    previousMemory:normalized.previousMemory,conversationState:safeObj(normalized.previousMemory.stateSpine||normalized.previousMemory.conversationState||normalized.commandPacket.state),lane:normalized.lane,sessionId:normalized.sessionId,turnId:normalized.turnId,sourceTurnId:normalized.turnId,
    stateSpinePatch:Object.keys(statePatch).length?statePatch:undefined,
    resolvedEmotion:safeObj(resolvedEmotionPacket.state),emotionRuntime:safeObj(resolvedEmotionPacket),emotionRuntimeOk:resolvedEmotionPacket.ok!==false
  };
}
function wrapFinal({normalized,routed,contract,loopGuardResult,resolvedEmotionPacket={}}){const reply=extractReply(contract);if(!reply)return createLocalFinalEnvelope({normalized,routed,contract,reason:"composer_reply_missing",loopGuardResult});if(!finalEnvelopeMod||typeof finalEnvelopeMod.createMarionFinalEnvelope!=="function")return createLocalFinalEnvelope({normalized,routed,contract:{...safeObj(contract),reply,text:reply,spokenText:firstText(contract.spokenText,reply)},reason:"final_envelope_unavailable",loopGuardResult});const routing=safeObj(routed.routing),memoryPatch={...safeObj(contract.memoryPatch),domainConcierge:compactDomainConciergeForBridge(safeObj(contract).domainConcierge||safeObj(routed).domainConcierge||routing.domainConcierge)};const envelope=finalEnvelopeMod.createMarionFinalEnvelope({reply,spokenText:safeStr(contract.spokenText||reply),intent:safeStr(routing.intent||contract.intent||"simple_chat"),domain:safeStr(routing.domain||contract.domain||normalized.domain||"general"),routing:{...routing,endpoint:safeStr(routing.endpoint||CANONICAL_ENDPOINT)||CANONICAL_ENDPOINT},stateStage:safeStr(memoryPatch.stateStage||contract.stateStage||(loopGuardResult.forceRecovery?"recover":"final")),turnId:normalized.turnId,sessionId:normalized.sessionId,memoryPatch,resolvedEmotion:safeObj(resolvedEmotionPacket.state||contract.resolvedEmotion),emotionSummary:emotionSummary(resolvedEmotionPacket.state?resolvedEmotionPacket:safeObj(contract.emotionRuntime)),speech:safeObj(contract.speech),replySignature:safeStr(contract.replySignature||memoryPatch.replySignature||hashText(reply)),composerVersion:safeStr(contract.version||contract.composerVersion||""),bridgeVersion:VERSION,meta:{...safeObj(contract.meta),bridgeVersion:VERSION,composerVersion:safeStr(contract.version||contract.composerVersion||""),loopGuardVersion:safeStr(loopGuardMod&&loopGuardMod.VERSION||""),routerVersion:safeStr(routed.routerVersion||routed.VERSION||""),normalizerVersion:safeStr(commandNormalizerMod&&commandNormalizerMod.VERSION||""),turnId:normalized.turnId},diagnostics:{...safeObj(contract.diagnostics),bridgeVersion:VERSION,routerCalled:true,composerCalled:true,loopGuardCalled:!!loopGuardMod,loopGuard:safeObj(loopGuardResult),singleContract:true,finalAuthority:"marionFinalEnvelope"}});const runtimeTelemetry=buildBridgeRuntimeTelemetry({source:"marionBridge.wrapFinal",normalized,routed,contract,reply,finalEnvelopeTrusted:true,canEmit:true,loopGuardResult,resolvedEmotionPacket});if(!safeStr(safeObj(envelope.finalEnvelope).reply||envelope.reply)||isDiagnosticText(safeObj(envelope.finalEnvelope).reply||envelope.reply)||isThinPlaceholderText(safeObj(envelope.finalEnvelope).reply||envelope.reply))return createLocalFinalEnvelope({normalized,routed,contract:{...safeObj(contract),reply,text:reply,spokenText:firstText(contract.spokenText,reply)},reason:"final_envelope_invalid",loopGuardResult});const bridgeFinalPacket={...envelope,ok:true,final:true,marionFinal:true,handled:true,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,hardlockCompatible:true,trustedTransport:true,singleFinalAuthority:true,marionFinalSignature:firstText(safeObj(envelope.meta).marionFinalSignature,safeObj(envelope.finalEnvelope).marionFinalSignature,safeObj(envelope.finalEnvelope).signature,FINAL_SIGNATURE),bridge:{version:VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,singleContract:true},routed,diagnostics:{...safeObj(envelope.diagnostics),bridgeVersion:VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,routerVersion:safeStr(routed.routerVersion||routed.VERSION||""),composerVersion:safeStr(contract.version||contract.composerVersion||""),composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopeVersion:safeStr(finalEnvelopeMod.VERSION||""),dependencies:DEPENDENCY_STATUS,loopGuard:safeObj(loopGuardResult),singleContract:true,zeroLoopSurface:true,emotionRuntimeCalled:!!Object.keys(safeObj(resolvedEmotionPacket)).length,emotionRuntimeOk:resolvedEmotionPacket.ok!==false,emotionSummary:emotionSummary(resolvedEmotionPacket)},meta:{...safeObj(envelope.meta),version:VERSION,finalRuntimeTelemetryVersion:FINAL_RUNTIME_TELEMETRY_VERSION,runtimeTelemetry,bridgeVersion:VERSION,endpoint:CANONICAL_ENDPOINT,usedBridge:true,replyAuthority:"marionFinalEnvelope",semanticAuthority:"composeMarionResponse",composerResolvedPath:DEPENDENCY_STATUS.composer.resolvedPath,composerExists:DEPENDENCY_STATUS.composer.exists,finalEnvelopePresent:true,zeroLoopSurface:true,trustedTransport:true,singleFinalAuthority:true,hardlockCompatible:true,emotionRuntimeCalled:!!Object.keys(safeObj(resolvedEmotionPacket)).length,emotionRuntimeOk:resolvedEmotionPacket.ok!==false,emotionPrimary:emotionSummary(resolvedEmotionPacket).primary,emotionSecondary:emotionSummary(resolvedEmotionPacket).secondary}};
  return attachLanguageSphereFinalMetadata(bridgeFinalPacket,{normalized,routed,contract,reply,runtimeTelemetry,loopGuardResult,resolvedEmotionPacket});
}
async function processWithMarionUnsafe(input={}){
  let normalized=normalizeInbound(input);
  if(!normalized.ok)return buildErrorResult("input_invalid",{issues:normalized.issues},normalized);
  const languageSphereInbound=await normalizeLanguageSphereInboundSafe(normalized);
  normalized={...normalized,...safeObj(languageSphereInbound.normalizedPatch),languageSphere:{...safeObj(normalized.languageSphere),...safeObj(safeObj(languageSphereInbound).normalizedPatch).languageSphere}};
  if(typeof composeMarionResponse!=="function")return buildErrorResult("composer_unavailable",{dependencyStatus:DEPENDENCY_STATUS.composer,hardFailure:true},normalized);
  const resolvedEmotionPacket=resolveEmotionForTurn(normalized);
  let routed=null;
  if(typeof routeMarionIntent==="function"){try{routed=await Promise.resolve(routeMarionIntent({text:normalized.userQuery,query:normalized.userQuery,userQuery:normalized.userQuery,lane:normalized.lane,requestedDomain:normalized.requestedDomain,domain:normalized.domain,knowledgeDomain:normalized.knowledgeDomain,activeKnowledgeDomain:normalized.activeKnowledgeDomain,lastActivatedKnowledgeDomain:normalized.lastActivatedKnowledgeDomain,knowledgeDomainExplicit:normalized.knowledgeDomainExplicit,knowledgeDomainReason:normalized.knowledgeDomainReason,marionIntent:normalized.marionIntent,previousMemory:normalized.previousMemory,session:{lane:normalized.lane,previousMemory:normalized.previousMemory,marionIntent:normalized.marionIntent},turnId:normalized.turnId,resolvedEmotion:safeObj(resolvedEmotionPacket.state),emotionRuntime:safeObj(resolvedEmotionPacket)}));}catch(_){routed=null;}}
  if(!validateRouterResult(routed).ok||normalized.knowledgeDomainExplicit)routed=fallbackRoute(normalized);
  const domainConciergeRaw=runDomainConciergeSafe(normalized,routed,resolvedEmotionPacket);
  const domainConcierge=compactDomainConciergeForBridge(domainConciergeRaw);
  if(Object.keys(domainConcierge).length){
    normalized.domainConcierge=domainConciergeRaw;
    routed=mergeDomainConciergeIntoRoute({...safeObj(routed),domainConciergeRaw},domainConciergeRaw);
  }
  if(domainConcierge.action==="clarify"&&domainConcierge.clarifier){
    const clarifyContract={ok:true,reply:domainConcierge.clarifier,text:domainConcierge.clarifier,answer:domainConcierge.clarifier,output:domainConcierge.clarifier,response:domainConcierge.clarifier,message:domainConcierge.clarifier,spokenText:domainConcierge.clarifier,intent:domainConcierge.intent,domain:domainConcierge.route,memoryPatch:{stateStage:"classified",domainConcierge,lastConciergeAction:"clarify",lastRoute:domainConcierge.route,lastIntent:domainConcierge.intent,lastRouteConfidence:domainConcierge.confidence,lastClarifier:domainConcierge.clarifier,domainConfidence:safeObj(domainConciergeRaw.domainConfidence),questionShape:safeObj(domainConciergeRaw.questionShape)},sessionPatch:{domainConcierge,lastConciergeAction:"clarify",lastRoute:domainConcierge.route,lastIntent:domainConcierge.intent,lastRouteConfidence:domainConcierge.confidence,lastClarifier:domainConcierge.clarifier},meta:{domainConcierge,domainConciergeClarifier:true},diagnostics:{domainConciergeObserved:true,domainConciergeClarifier:true}};
    return createLocalFinalEnvelope({normalized,routed,contract:clarifyContract,reason:"domain_concierge_clarifier",loopGuardResult:{ok:true,loopDetected:false,allowReply:true,forceRecovery:false,reasons:[]}});
  }
  const composeInput=normalizeComposeInput(normalized,routed,resolvedEmotionPacket);
  let contract={};
  try{contract=await Promise.resolve(composeMarionResponse({...safeObj(routed),primaryDomain:safeStr(safeObj(routed.routing).domain||composeInput.domain),domain:safeStr(safeObj(routed.routing).domain||composeInput.domain),intent:safeStr(safeObj(routed.routing).intent||composeInput.intent),routing:safeObj(routed.routing),marionIntent:safeObj(routed.marionIntent)},composeInput));}
  catch(err){return buildErrorResult("composer_exception",{message:safeStr(err&&(err.message||err)||""),routed:safeObj(routed)},normalized);}
  if(Object.keys(domainConcierge).length){contract={...safeObj(contract),domainConcierge,meta:{...safeObj(safeObj(contract).meta),domainConcierge},memoryPatch:{...safeObj(safeObj(contract).memoryPatch),domainConcierge},sessionPatch:{...safeObj(safeObj(contract).sessionPatch),domainConcierge}};}
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
    domainConciergeResolvedPath: DEPENDENCY_STATUS.domainConcierge.resolvedPath,
    domainConciergeExists: !!DEPENDENCY_STATUS.domainConcierge.exists,
    authority: "bridge.wrapFinal -> marionFinalEnvelope",
    stateSchema: STATE_SPINE_SCHEMA,
    stateSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    deployHardeningVersion: MARION_BRIDGE_DEPLOY_HARDENING_VERSION,
    languageSphereBridgeVersion: LANGUAGE_SPHERE_BRIDGE_VERSION
  };
}

module.exports={VERSION,CANONICAL_ENDPOINT,DEPENDENCY_STATUS,PIPELINE_FORENSIC_NORMALIZATION_VERSION,FINAL_RUNTIME_TELEMETRY_VERSION,DOMAIN_CONCIERGE_VERSION,CONFIDENCE_AWARE_RESPONSE_SHAPING_VERSION,LANGUAGE_SPHERE_BRIDGE_VERSION,MARION_BRIDGE_DEPLOY_HARDENING_VERSION,TELEMETRY_VISIBILITY_VERSION,FAILURE_SIGNATURE_AUDIT_VERSION,classifyFailureSignature,buildFailureSignatureAudit,isTelemetryLeakText,stripTelemetryLeakFromReply,bridgeForensicNormalizationStatus,retrieveLayer2Signals,processWithMarion,createMarionBridge,route,maybeResolve,ask,handle,default:processWithMarion,_internal:{normalizeInbound,canonicalTechnicalTargetFromText,fallbackRoute,validateRouterResult,extractReply,validateComposeResult,wrapFinal,buildErrorResult,buildBridgeRecoveryFinal,bridgeRecoveryReply,createLocalFinalEnvelope,hotFallbackReply,identityAnchorReply,isDiagnosticText,isThinPlaceholderText,DEPENDENCY_STATUS,COMPOSER_REQUIRE_CANDIDATES,DOMAIN_CONCIERGE_REQUIRE_CANDIDATES,compactDomainConciergeForBridge,runDomainConciergeSafe,mergeDomainConciergeIntoRoute,resolveEmotionForTurn,emotionSummary,mergeEmotionIntoContract,jsonSafe,canonicalInputSource,normalizeParityText,buildContinuityTurnKey,transportSafePacket,transportSafeError,compactPatchForTransport,compactResolvedEmotion,compactCreativeCognitiveCarry,signatureLooksTrusted,hasTrustedBridgeFinalPacket,hasFinalFailureShape,bridgeForensicNormalizationStatus,buildBridgeRuntimeTelemetry,classifyFailureSignature,buildFailureSignatureAudit,isTelemetryLeakText,stripTelemetryLeakFromReply,normalizeLanguageSphereInboundSafe,attachLanguageSphereFinalMetadata,languageSpherePayload,normalizeLanguageSphereSurface,isMarionAuthorityValue,normalizePublicNyxAddress,buildNyxPublicContextPassport}};
