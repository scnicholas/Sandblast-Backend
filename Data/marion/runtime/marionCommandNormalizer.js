"use strict";

/**
 * marionCommandNormalizer.js
 * Marion inbound command / packet normalizer.
 *
 * Purpose:
 * - Accept raw Nyx/widget/backend input.
 * - Produce one stable Marion-ready packet.
 * - Do NOT generate replies.
 * - Do NOT route domains.
 * - Do NOT mutate memory.
 * - Do NOT perform fallback logic.
 *
 * This file exists only to clean and stabilize inbound user input
 * before it reaches MarionBridge, marionIntentRouter, or StateSpine.
 */

const VERSION = "marionCommandNormalizer v1.2.0 PRIORITY2-COMMAND-ROUTING-HARDENING + DEFENSIVE-INTENT-SIGNAL-CARRY + TECHNICAL-FOLLOWUP-SCHEDULER-BYPASS + MARION-PACKET-STABILITY";
const PROTECTIVE_ESCALATION_VERSION = "nyx.marion.protectiveEscalationRouting/1.0";

const DEFAULT_SOURCE = "nyx-widget";
const DEFAULT_CHANNEL = "chat";
const CONTRACT_VERSION = "nyx.marion.packet/1.0";

function safeStr(value) {
  return value == null ? "" : String(value).trim();
}

function safeLower(value) {
  return safeStr(value).toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "pkt") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clampNumber(value, fallback = 0, min = 0, max = 999) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function extractUserText(input = {}) {
  if (typeof input === "string") return safeStr(input);

  if (!input || typeof input !== "object") return "";

  return safeStr(
    input.text ||
    input.message ||
    input.query ||
    input.userQuery ||
    input.input ||
    input.prompt ||
    input.body?.text ||
    input.body?.message ||
    input.body?.query ||
    input.body?.prompt ||
    input.payload?.text ||
    input.payload?.message ||
    input.payload?.query ||
    input.payload?.prompt ||
    input.turn?.text ||
    input.turn?.message ||
    input.command?.text ||
    input.command?.message ||
    ""
  );
}

function detectEmotionalSignal(text) {
  const t = safeLower(text);

  if (!t) {
    return {
      detected: false,
      level: "none",
      score: 0,
      terms: []
    };
  }

  const high = [
    "suicide",
    "self harm",
    "self-harm",
    "kill myself",
    "don't want to live",
    "dont want to live",
    "panic attack",
    "crisis"
  ];

  const medium = [
    "depressed",
    "sad",
    "lonely",
    "overwhelmed",
    "anxious",
    "hurt",
    "heartbroken",
    "grief",
    "crying",
    "afraid",
    "stressed"
  ];

  const matchedHigh = high.filter(term => t.includes(term));
  const matchedMedium = medium.filter(term => t.includes(term));

  if (matchedHigh.length) {
    return {
      detected: true,
      level: "high",
      score: 0.95,
      terms: matchedHigh
    };
  }

  if (matchedMedium.length) {
    return {
      detected: true,
      level: "medium",
      score: 0.72,
      terms: matchedMedium
    };
  }

  return {
    detected: false,
    level: "none",
    score: 0,
    terms: []
  };
}


function canonicalTechnicalTargetFromText(text = "") {
  const t = safeStr(text || "");
  const mk = (targetKey, targetName, targetFile, targetPath, layer = "runtime") => ({
    version: "nyx.marion.technicalTargetLock/1.2",
    targetKey,
    targetName,
    targetFile,
    targetPath,
    layer,
    explicit: true,
    source: "current_user_text",
    locked: true,
    technicalFollowUpLock: true,
    blockScheduleInterception: true
  });
  if (/\b(chat\s*engine|chatengine)\b/i.test(t)) return mk("chatEngine", "ChatEngine", "chatEngine.js", "Utils/chatEngine.js", "transport");
  if (/\b(marion\s*bridge|marionbridge)\b/i.test(t)) return mk("marionBridge", "MarionBridge", "marionBridge.js", "Data/marion/runtime/marionBridge.js", "bridge");
  if (/\b(compose\s*marion\s*response|composemarionresponse|composer)\b/i.test(t)) return mk("composeMarionResponse", "ComposeMarionResponse", "composeMarionResponse.js", "Data/marion/runtime/composeMarionResponse.js", "composer");
  if (/\b(state\s*spine|statespine|state-spine)\b/i.test(t)) return mk("stateSpine", "StateSpine", "stateSpine.js", "Utils/stateSpine.js", "state");
  if (/\b(marion\s*intent\s*router|intent\s*router|marionintentrouter)\b/i.test(t)) return mk("marionIntentRouter", "MarionIntentRouter", "marionIntentRouter.js", "Data/marion/runtime/marionIntentRouter.js", "router");
  if (/\b(command\s*normalizer|marion\s*command\s*normalizer|marioncommandnormalizer)\b/i.test(t)) return mk("marionCommandNormalizer", "MarionCommandNormalizer", "marionCommandNormalizer.js", "Data/marion/runtime/marionCommandNormalizer.js", "normalizer");
  if (/\b(guardian\s*pipeline\s*router|guardian\.pipeline\.router|guardianpipelinerouter)\b/i.test(t)) return mk("guardianPipelineRouter", "GuardianPipelineRouter", "guardian.pipeline.router.js", "Data/marion/runtime/guardian.pipeline.router.js", "guardian_router");
  if (/\b(domain\s*concierge|domainconcierge)\b/i.test(t)) return mk("DomainConcierge", "DomainConcierge", "DomainConcierge.js", "Data/marion/runtime/DomainConcierge.js", "concierge");
  if (/\b(domain\s*retriever|domainretriever)\b/i.test(t)) return mk("domainRetriever", "DomainRetriever", "domainRetriever.js", "Data/marion/runtime/domainRetriever.js", "retriever");
  if (/\b(domain\s*router|domainrouter)\b/i.test(t)) return mk("domainRouter", "DomainRouter", "domainRouter.js", "Utils/domainRouter.js", "router");
  if (/\b(domain\s*registry|marion\s*domain\s*registry|mariondomainregistry)\b/i.test(t)) return mk("marionDomainRegistry", "MarionDomainRegistry", "marionDomainRegistry.js", "Data/marion/runtime/marionDomainRegistry.js", "registry");
  if (/\b(marion\s*ethical\s*gatekeeper|ethical\s*gatekeeper|marionethicalgatekeeper)\b/i.test(t)) return mk("MarionEthicalGatekeeper", "MarionEthicalGatekeeper", "MarionEthicalGatekeeper.js", "Data/marion/runtime/MarionEthicalGatekeeper.js", "ethics");
  if (/\b(marion\s*runtime\s*contract|runtime\s*contract|marion\.runtime\.contract)\b/i.test(t)) return mk("marionRuntimeContract", "MarionRuntimeContract", "marion.runtime.contract.json", "Data/marion/runtime/marion.runtime.contract.json", "contract");
  if (/\b(index\.js|api\/chat|\/api\/chat)\b/i.test(t)) return mk("index", "index.js", "index.js", "index.js", "outer_transport");
  return {};
}

function isTechnicalFollowUpIntent(text = "") {
  const t = safeStr(text || "");
  const target = canonicalTechnicalTargetFromText(t);
  if (!target || !target.targetPath) return false;
  return /\b(now|next|then|also|again|from there|after that|one more)\b/i.test(t) || /\b(full autopsy|autopsy|audit|line[-\s]?by[-\s]?line|critical fix|critical fixes|check|inspect|review|patch|harden|run|fix|update)\b/i.test(t);
}

function detectTechnicalSignal(text) {
  const t = safeLower(text);

  const terms = [
    "index.js",
    "marion",
    "runtime",
    "surgical",
    "bridge",
    "router",
    "command routing",
    "priority two",
    "priority 2",
    "guardian pipeline",
    "domain concierge",
    "domain retriever",
    "domain registry",
    "normalizer",
    "state spine",
    "statespine",
    "loop",
    "looping",
    "fallback",
    "route",
    "endpoint",
    "script",
    "debug",
    "bug",
    "fix",
    "autopsy",
    "audit",
    "gap refinement",
    "download",
    "zip"
  ];

  const matched = terms.filter(term => t.includes(term));

  return {
    detected: matched.length > 0,
    score: matched.length ? Math.min(0.95, 0.45 + matched.length * 0.08) : 0,
    terms: matched
  };
}

function detectProtectiveEscalationSignal(text) {
  const t = safeLower(text);
  if (!t) {
    return {
      version: PROTECTIVE_ESCALATION_VERSION,
      detected: false,
      level: "none",
      guardians: [],
      requiresEthicalGate: false,
      requiresVerifiedIntent: false,
      protectivePurposeOnly: true,
      boundedOutputRequired: true
    };
  }

  const guardians = [];
  if (/\baster\b/i.test(t)) guardians.push("aster");
  if (/\b(talon|thalon)\b/i.test(t)) guardians.push("thalon");
  if (/\bmarion\b/i.test(t)) guardians.push("marion");

  const protective = /\b(defen[cs]e|defensive|self[-\s]?defen[cs]e|protect|protection|protective|personal safety|emergency|threat|imminent|danger|alarm|alert|escalation|boundary|guardrail|justified scenario|intent justifier|verified command|code word|codeword)\b/i.test(t);
  const elevated = /\b(90\s*dB|ninety\s*dB|decibel|burst|cooldown|interval|alarm|loud|sir[eo]n|audio controller|cross over|ethical boundary|line crossing)\b/i.test(t);
  const implementation = /\b(add|include|implement|integrate|route|patch|harden|controller|runtime|gatekeeper|guardrail|boundary|policy)\b/i.test(t);
  const detected = protective && (elevated || guardians.length > 0 || implementation);

  return {
    version: PROTECTIVE_ESCALATION_VERSION,
    detected,
    level: detected && elevated ? "elevated" : (detected ? "bounded" : "none"),
    guardians: Array.from(new Set(guardians)),
    requiresEthicalGate: detected,
    requiresVerifiedIntent: detected,
    protectivePurposeOnly: true,
    boundedOutputRequired: true,
    noPunitiveUse: true,
    noCoerciveUse: true,
    noContinuousAlarm: true,
    reason: detected ? "protective_escalation_command_signal" : "none"
  };
}

function priorityTwoTargetSignals(text = "") {
  const t = safeLower(text);
  const targets = [];
  const add = (key, file, layer) => { if (!targets.some((x) => x.key === key)) targets.push({ key, file, layer }); };
  if (/\b(intent router|marionintentrouter|marion intent router)\b/i.test(t)) add("marionIntentRouter", "marionIntentRouter.js", "router");
  if (/\b(command normalizer|marioncommandnormalizer|marion command normalizer)\b/i.test(t)) add("marionCommandNormalizer", "marionCommandNormalizer.js", "normalizer");
  if (/\b(guardian pipeline|guardian\.pipeline\.router|guardianpipelinerouter)\b/i.test(t)) add("guardianPipelineRouter", "guardian.pipeline.router.js", "guardian_router");
  if (/\b(domain concierge|domainconcierge)\b/i.test(t)) add("DomainConcierge", "DomainConcierge.js", "concierge");
  if (/\b(domain registry|mariondomainregistry|marion domain registry)\b/i.test(t)) add("marionDomainRegistry", "marionDomainRegistry.js", "registry");
  if (/\b(domain retriever|domainretriever)\b/i.test(t)) add("domainRetriever", "domainRetriever.js", "retriever");
  if (/\bcommand\s+routing\b/i.test(t)) add("commandRouting", "marionIntentRouter.js", "routing_stack");
  if (/\bpriority\s*(?:number\s*)?(?:two|2)\b/i.test(t)) {
    add("marionIntentRouter", "marionIntentRouter.js", "router");
    add("marionCommandNormalizer", "marionCommandNormalizer.js", "normalizer");
    add("guardianPipelineRouter", "guardian.pipeline.router.js", "guardian_router");
    add("DomainConcierge", "DomainConcierge.js", "concierge");
    add("marionDomainRegistry", "marionDomainRegistry.js", "registry");
    add("domainRetriever", "domainRetriever.js", "retriever");
  }
  return targets;
}

function inferInputKind(text) {
  const t = safeLower(text);

  if (!t) return "empty";
  if (t.endsWith("?")) return "question";
  if (/^(fix|update|send|create|build|make|audit|analyze|check|review)\b/i.test(t)) return "command";
  if (t.length <= 32 && !t.includes(" ")) return "keyword";
  return "statement";
}

function normalizeSession(input = {}) {
  const src = input && typeof input === "object" ? input : {};

  const headers = src.headers || src.body?.headers || {};
  const body = src.body || {};
  const payload = src.payload || body.payload || {};
  return {
    sessionId: safeStr(
      src.sessionId || src.session_id || src.sid ||
      body.sessionId || payload.sessionId ||
      headers["x-sb-session-id"] || headers["x-session-id"] || ""
    ),
    turnId: safeStr(
      src.turnId || src.turn_id || body.turnId || payload.turnId || headers["x-sb-turn-id"] || ""
    ),
    traceId: safeStr(
      src.traceId || src.requestId || body.traceId || payload.traceId || headers["x-sb-trace-id"] || ""
    ),
    userId: safeStr(src.userId || src.user_id || src.uid || body.userId || ""),
    channel: safeStr(src.channel || body.channel || payload.channel || DEFAULT_CHANNEL),
    source: safeStr(src.source || body.source || payload.source || body.inputSource || payload.inputSource || DEFAULT_SOURCE),
    client: src.client && typeof src.client === "object" ? src.client : (body.client && typeof body.client === "object" ? body.client : {}),
    audience: safeStr(src.audience || body.audience || payload.audience || src.ui?.audience || body.ui?.audience || headers["x-sb-audience"] || "public"),
    surfaceAgent: safeStr(src.surfaceAgent || body.surfaceAgent || payload.surfaceAgent || src.ui?.surfaceAgent || body.ui?.surfaceAgent || headers["x-sb-public-surface"] || "nyx"),
    publicSurfaceOnly: src.publicSurfaceOnly === true || body.publicSurfaceOnly === true || payload.publicSurfaceOnly === true || src.ui?.publicSurfaceOnly === true || body.ui?.publicSurfaceOnly === true,
    operatorPersonalization: src.operatorPersonalization === true || body.operatorPersonalization === true,
    allowPersonalName: src.allowPersonalName === true || body.allowPersonalName === true,
    publicIdentityLock: src.publicIdentityLock === true || body.publicIdentityLock === true || payload.publicIdentityLock === true
  };
}

function normalizeState(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  const state = src.state || src.sessionState || src.body?.state || {};

  return {
    lastIntent: safeStr(state.lastIntent || src.lastIntent || ""),
    lastDomain: safeStr(state.lastDomain || src.lastDomain || ""),
    lastUserText: safeStr(state.lastUserText || src.lastUserText || ""),
    lastAssistantReply: safeStr(state.lastAssistantReply || src.lastAssistantReply || ""),
    conversationDepth: clampNumber(
      state.conversationDepth ?? src.conversationDepth,
      0,
      0,
      100
    ),
    loopCount: clampNumber(
      state.loopCount ?? src.loopCount,
      0,
      0,
      25
    ),
    stateStage: safeStr(state.stateStage || src.stateStage || "intake")
  };
}

function normalizeCommand(input = {}) {
  const userText = extractUserText(input);
  const session = normalizeSession(input);
  const previousState = normalizeState(input);

  const emotionalSignal = detectEmotionalSignal(userText);
  const technicalSignal = detectTechnicalSignal(userText);
  const technicalTargetLock = canonicalTechnicalTargetFromText(userText);
  const technicalFollowUpLock = isTechnicalFollowUpIntent(userText);
  const protectiveEscalation = detectProtectiveEscalationSignal(userText);
  const priorityTwoTargets = priorityTwoTargetSignals(userText);
  const priorityTwoRoutingLock = priorityTwoTargets.length > 0 || /\b(priority\s*(?:number\s*)?(?:two|2)|command\s+routing|guardian\s+pipeline|domain\s+concierge|domain\s+retriever|domain\s+registry)\b/i.test(userText);
  const inputKind = inferInputKind(userText);

  const packet = {
    ok: true,
    final: false,
    contractVersion: CONTRACT_VERSION,
    normalizerVersion: VERSION,

    packetId: makeId("marion"),
    createdAt: nowIso(),

    source: session.source,
    channel: session.channel,
    sessionId: session.sessionId,
    turnId: session.turnId,
    traceId: session.traceId,
    userId: session.userId,
    client: session.client,

    userText,
    normalizedText: userText.replace(/\s+/g, " ").trim(),

    input: {
      kind: inputKind,
      empty: !userText,
      length: userText.length,
      wordCount: userText ? userText.split(/\s+/).filter(Boolean).length : 0
    },

    signals: {
      emotional: emotionalSignal,
      technical: technicalSignal,
      technicalTargetLock,
      technicalFollowUpLock,
      protectiveEscalation,
      priorityTwoTargets,
      priorityTwoRoutingLock
    },

    state: {
      ...previousState,
      stateStage: "intake"
    },

    routingHints: {
      preferEmotional: emotionalSignal.detected,
      preferTechnical: technicalSignal.detected || technicalFollowUpLock || priorityTwoRoutingLock || protectiveEscalation.detected,
      forceTechnical: technicalFollowUpLock || priorityTwoRoutingLock || protectiveEscalation.detected,
      blockScheduleInterception: technicalFollowUpLock || priorityTwoRoutingLock,
      requiresRecovery: previousState.loopCount > 0,
      allowFallback: true,
      allowLoopBlock: true,
      priorityTwoRoutingLock,
      priorityTwoTargets,
      requiresEthicalGate: protectiveEscalation.requiresEthicalGate,
      requiresVerifiedIntent: protectiveEscalation.requiresVerifiedIntent
    },

    meta: {
      singlePacketAuthority: true,
      bridgeCompatible: true,
      intentRouterCompatible: true,
      stateSpineCompatible: true,
      composerCompatible: true,
      technicalTargetLock,
      technicalFollowUpLock,
      priorityTwoRoutingLock,
      priorityTwoTargets,
      protectiveEscalation,
      requiresEthicalGate: protectiveEscalation.requiresEthicalGate,
      optionC: true,
      publicInterfaceHandoff: true,
      publicSurfaceIdentityLock: session.publicIdentityLock !== false,
      audience: session.audience || "public",
      surfaceAgent: session.surfaceAgent || "nyx",
      publicSurfaceOnly: session.publicSurfaceOnly !== false,
      operatorPersonalization: false,
      allowPersonalName: false,
      client: session.client,
      turnId: session.turnId,
      traceId: session.traceId,
      blockScheduleInterception: technicalFollowUpLock || priorityTwoRoutingLock
    }
  };

  return packet;
}

function isNormalizedMarionPacket(value) {
  return !!(
    value &&
    typeof value === "object" &&
    value.contractVersion === CONTRACT_VERSION &&
    value.normalizerVersion &&
    typeof value.userText === "string" &&
    value.meta?.singlePacketAuthority === true
  );
}

module.exports = {
  VERSION,
  CONTRACT_VERSION,
  normalizeCommand,
  isNormalizedMarionPacket,
  canonicalTechnicalTargetFromText,
  isTechnicalFollowUpIntent,
  detectProtectiveEscalationSignal,
  priorityTwoTargetSignals
};


/* PUBLIC_SURFACE_IDENTITY_LOCK_PHASE1_START */
(function(){
  "use strict";
  const V="nyx.publicSurfaceIdentityLock.runtime/marionCommandNormalizer/1.0";
  let lock=null;try{lock=require("./publicSurfaceIdentityLock.js");}catch(_err){try{lock=require("../Data/marion/runtime/publicSurfaceIdentityLock.js");}catch(_err2){lock=null;}}
  if(!lock||!lock.projectPublicReplyFields||typeof module==="undefined"||!module.exports)return;
  function isPublic(args){try{for(let i=0;i<args.length;i+=1){if(lock.isPublicSurfaceContext(args[i]))return true;}return false;}catch(_err){return false;}}
  function project(value,args){return isPublic(args)?lock.projectPublicReplyFields(value,args&&args[0]):value;}
  function wrapObj(obj,names){(Array.isArray(names)?names:[]).forEach(function(name){if(!obj||typeof obj[name]!=="function"||obj[name].__nyxPublicSurfaceIdentityLock)return;const old=obj[name];obj[name]=function(){const args=arguments;const res=old.apply(this,args);if(res&&typeof res.then==="function")return res.then(function(v){return project(v,args);});return project(res,args);};obj[name].__nyxPublicSurfaceIdentityLock=true;});}
  try{
    if(typeof module.exports==="function"&&!module.exports.__nyxPublicSurfaceIdentityLock){const old=module.exports;const wrapped=function(){const args=arguments;const res=old.apply(this,args);if(res&&typeof res.then==="function")return res.then(function(v){return project(v,args);});return project(res,args);};Object.keys(old).forEach(function(k){try{wrapped[k]=old[k];}catch(_err){}});wrapped.__nyxPublicSurfaceIdentityLock=true;module.exports=wrapped;}
    wrapObj(module.exports,["normalizeCommand"]);
    module.exports.PUBLIC_SURFACE_IDENTITY_LOCK_PHASE1_VERSION=V;
    module.exports.publicSurfaceIdentityLockProject=lock.projectPublicReplyFields;
    module.exports.publicSurfaceIdentityLockSanitize=lock.sanitizePublicReply;
  }catch(_err){}
})();
/* PUBLIC_SURFACE_IDENTITY_LOCK_PHASE1_END */


/* PRIVATE_OPERATOR_BOUNDARY_LOCK_PHASE2_START */
(function(){
  "use strict";
  const V="nyx.privateOperatorBoundaryLock.phase2/runtimeWrapper/2.0";
  let lock=null;try{lock=require("./privateOperatorBoundaryLock.js");}catch(_err){try{lock=require("../Data/marion/runtime/privateOperatorBoundaryLock.js");}catch(_err2){lock=null;}}
  if(!lock||!lock.isVerifiedOperatorContext||typeof module==="undefined"||!module.exports)return;
  function ctx(value,args){args=Array.prototype.slice.call(args||[]);return{payload:value,body:args[0],auth:args[1],meta:args[2],headers:(args[0]&&args[0].headers)||(args[1]&&args[1].headers)||{},route:(value&&value.route)||(args[0]&&args[0].route)||(args[0]&&args[0].path)||""};}
  function project(value,args){try{const c=ctx(value,args);return lock.isVerifiedOperatorContext(c)?lock.projectPrivateOperatorFields(value,c):value;}catch(_err){return value;}}
  function wrapFn(fn,name){if(typeof fn!=="function"||fn.__nyxPrivateOperatorBoundaryLock)return fn;const wrapped=function(){const args=arguments;const res=fn.apply(this,args);if(res&&typeof res.then==="function")return res.then(function(v){return project(v,args);});return project(res,args);};try{Object.keys(fn).forEach(function(k){wrapped[k]=fn[k];});}catch(_err){}try{Object.defineProperty(wrapped,"name",{value:fn.name||name||"privateOperatorBoundaryWrapped"});}catch(_err){}wrapped.__nyxPrivateOperatorBoundaryLock=true;return wrapped;}
  try{if(typeof module.exports==="function")module.exports=wrapFn(module.exports,"default");}catch(_err){}
  try{const obj=module.exports&&typeof module.exports==="object"?module.exports:null;if(obj){["processWithMarion","route","maybeResolve","ask","handle","handleVoiceTranscript","handleVoiceInput","default","composeMarionResponse","compose","buildReply","run","handler","createMarionFinalEnvelope","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","normalizeCommand","handleMarionAdminConversation","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","process","safeResponse","buildResponse","createResponse"].forEach(function(n){if(typeof obj[n]==="function")obj[n]=wrapFn(obj[n],n);});obj.PRIVATE_OPERATOR_BOUNDARY_LOCK_PHASE2_VERSION=V;obj.privateOperatorBoundaryLockProject=lock.projectPrivateOperatorFields;obj.privateOperatorBoundaryLockIsVerified=lock.isVerifiedOperatorContext;}}catch(_err){}
})();
/* PRIVATE_OPERATOR_BOUNDARY_LOCK_PHASE2_END */


/* LIVE_CONVERSATION_PARTITION_VALIDATION_PHASE3_START */
(function(){
  "use strict";
  const V="nyx.marion.phase3.liveConversationPartition.runtimeWrapper/1.0";
  let part=null;try{part=require("./liveConversationPartitionValidator.js");}catch(_err){try{part=require("../Data/marion/runtime/liveConversationPartitionValidator.js");}catch(_err2){part=null;}}
  if(!part||!part.projectResult||typeof module==="undefined"||!module.exports)return;
  function ctx(value,args){args=Array.prototype.slice.call(args||[]);return{payload:value,body:args[0],auth:args[1],meta:args[2],headers:(args[0]&&args[0].headers)||(args[1]&&args[1].headers)||{},route:(value&&value.route)||(args[0]&&args[0].route)||(args[0]&&args[0].path)||""};}
  function project(value,args){try{return part.projectResult(value,ctx(value,args));}catch(_err){return value;}}
  function wrapFn(fn,name){if(typeof fn!=="function"||fn.__nyxPhase3Partition)return fn;const wrapped=function(){const args=arguments;const res=fn.apply(this,args);if(res&&typeof res.then==="function")return res.then(function(v){return project(v,args);});return project(res,args);};try{Object.keys(fn).forEach(function(k){wrapped[k]=fn[k];});}catch(_err){}try{Object.defineProperty(wrapped,"name",{value:fn.name||name||"phase3PartitionWrapped"});}catch(_err){}wrapped.__nyxPhase3Partition=true;return wrapped;}
  try{if(typeof module.exports==="function")module.exports=wrapFn(module.exports,"default");}catch(_err){}
  try{const obj=module.exports&&typeof module.exports==="object"?module.exports:null;if(obj){["processWithMarion","route","maybeResolve","ask","handle","handleVoiceTranscript","handleVoiceInput","default","composeMarionResponse","compose","buildReply","run","handler","createMarionFinalEnvelope","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","normalizeCommand","handleMarionAdminConversation","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","process","safeResponse","buildResponse","createResponse","finalizeTurn","updateState","advanceState","mergeState","inspectLoop","checkLoop","evaluateLoop","guardReply","matchPacket","selectPacket","resolvePacket","applyPacket"].forEach(function(n){if(typeof obj[n]==="function")obj[n]=wrapFn(obj[n],n);});obj.LIVE_CONVERSATION_PARTITION_VALIDATION_PHASE3_VERSION=V;obj.liveConversationPartitionProject=part.projectResult;obj.liveConversationPartitionPatch=part.buildPartitionPatch;obj.liveConversationPartitionValidate=part.validateNoCrossPartitionLeak;}}catch(_err){}
})();
/* LIVE_CONVERSATION_PARTITION_VALIDATION_PHASE3_END */
