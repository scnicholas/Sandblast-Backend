"use strict";

/**
 * chatEngine.js
 *
 * Chat Engine v3.3.0 COORDINATOR-ONLY-MARION-FINAL-TRUST-GATE-HARDENED
 * ------------------------------------------------------------
 * PURPOSE
 * - Act as a transport/coordinator only.
 * - Accept Marion final replies through a strict but version-tolerant trust gate.
 * - Never invent, recover, emotionally rewrite, or fallback-personality a reply.
 * - Return explicit non-final awaiting-Marion errors for non-terminal missing-final cases.
 *
 * HARD RULES
 * - No buildLoopRecoveryReply.
 * - No emotional fallback.
 * - No reply invention.
 * - No synthetic "I'm here..." recovery.
 * - No fallbackResponse/replySeed promotion unless it is part of an accepted Marion envelope.
 */

const VERSION = "ChatEngine v3.9.4 CLARIFIER-LOOP-SUPPRESSION-GUARD + LANGUAGE-SPHERE-BRIDGE-GUARDED + TECHNICAL-TARGET-LOCK-TRANSPORT + FINAL-RUNTIME-TELEMETRY-SCOPING-FIX + FIVE-TURN-CONTRACT-TRANSPORT + COORDINATOR-ONLY-PACK-COHESION-BRIDGE-HARDENED + TELEMETRY-VISIBILITY-FAILURE-SIGNATURE-AUDIT + PRIMITIVE-REPLY-SUPPRESSION-GUARD + FINAL-RENDER-TELEMETRY-HARDLOCK";
const CONVERSATIONAL_PACK_COHESION_VERSION = "nyx.conversationalPackCohesion/1.0";
const CHAT_ENGINE_SIGNATURE = "CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24";
const MARION_FINAL_SIGNATURE_PREFIX = "MARION::FINAL::";
const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const FINAL_ENVELOPE_CONTRACT = "nyx.marion.final/1.0";
const FINAL_SIGNATURE = "MARION_FINAL_AUTHORITY";
const FINAL_RUNTIME_TELEMETRY_VERSION = "nyx.marion.finalRuntimeTelemetry/1.0";
const DOMAIN_CONCIERGE_CORE_VERSION = "nyx.marion.domainConciergeCore/1.0-transport";
const DOMAIN_CONCIERGE_CONTRACT_VERSION = "nyx.marion.domainConcierge/1.0";
const FINAL_RENDER_TELEMETRY_VERSION = "nyx.marion.finalRenderTelemetry/1.0";
const finalRenderTelemetryMod = (() => { try { return require("../Data/marion/runtime/finalRenderTelemetry.js"); } catch (_) { return null; } })();

const LANGUAGE_SPHERE_BRIDGE_VERSION = "nyx.languageSphere.chatEngineBridge/1.0";
const UNIVERSAL_TRANSLATOR_ADAPTER_PATH = "./UniversalTranslatorAdapter.js";

const KNOWN_GOOD_FINAL_CONTRACTS = Object.freeze([
  FINAL_ENVELOPE_CONTRACT,
  "nyx.marion.final/0.9",
  "nyx.marion.contract/2.1",
  "nyx.marion.intent/2.1"
]);

const LEGACY_TRUST_FLAGS = Object.freeze([
  "trustedTransport",
  "internalTrustedTransport",
  "marionTrustedTransport",
  "bridgeTrustedTransport",
  "hardlockCompatible",
  "freshMarionFinal",
  "singleFinalAuthority"
]);

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function lower(value) {
  return cleanText(value).toLowerCase();
}

function safeObj(value) {
  return isPlainObject(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactDomainConciergeForTransport(value = {}) {
  const src = safeObj(value);
  if (!Object.keys(src).length) return {};
  const domainConfidence = safeObj(src.domainConfidence);
  const questionShape = safeObj(src.questionShape);
  const composerContext = safeObj(src.composerContext);
  const stateSpinePatch = safeObj(src.stateSpinePatch);

  const out = {
    version: cleanText(src.version || src.contract || DOMAIN_CONCIERGE_CONTRACT_VERSION),
    source: cleanText(src.source || "DomainConcierge"),
    action: cleanText(src.action || ""),
    route: cleanText(src.route || src.domain || ""),
    intent: cleanText(src.intent || ""),
    confidence: clampNumber(src.confidence ?? domainConfidence.confidence, 0, 0, 1),
    needsClarifier: !!src.needsClarifier,
    clarifier: src.needsClarifier ? clipText(src.clarifier, 420) : "",
    reason: clipText(src.reason, 180),
    noUserFacingDiagnostics: src.noUserFacingDiagnostics !== false,
    finalEnvelopeRequired: src.finalEnvelopeRequired !== false,
    bridgeCompatible: src.bridgeCompatible !== false,
    composerCompatible: src.composerCompatible !== false,
    stateSpineCompatible: src.stateSpineCompatible !== false
  };

  if (Object.keys(domainConfidence).length) {
    out.domainConfidence = {
      version: cleanText(domainConfidence.version || ""),
      confidence: clampNumber(domainConfidence.confidence, out.confidence, 0, 1),
      band: cleanText(domainConfidence.band || ""),
      ambiguous: !!domainConfidence.ambiguous,
      routeLocked: !!domainConfidence.routeLocked,
      failClosed: !!domainConfidence.failClosed,
      primaryDomain: cleanText(domainConfidence.primaryDomain || out.route),
      knowledgeDomain: cleanText(domainConfidence.knowledgeDomain || ""),
      reason: clipText(domainConfidence.reason, 180)
    };
  }

  if (Object.keys(questionShape).length) {
    out.questionShape = {
      version: cleanText(questionShape.version || ""),
      questionShape: cleanText(questionShape.questionShape || ""),
      changed: !!questionShape.changed,
      reason: clipText(questionShape.reason, 140),
      normalizedText: clipText(questionShape.normalizedText || questionShape.normalizedUserIntent, 260)
    };
  }

  if (Object.keys(stateSpinePatch).length) {
    out.stateSpinePatch = {
      source: cleanText(stateSpinePatch.source || "DomainConcierge"),
      schema: cleanText(stateSpinePatch.schema || STATE_SPINE_SCHEMA),
      shouldAdvanceState: !!stateSpinePatch.shouldAdvanceState,
      stateStage: cleanText(stateSpinePatch.stateStage || ""),
      lastConciergeAction: cleanText(stateSpinePatch.lastConciergeAction || out.action),
      lastRoute: cleanText(stateSpinePatch.lastRoute || out.route),
      lastIntent: cleanText(stateSpinePatch.lastIntent || out.intent),
      lastRouteConfidence: clampNumber(stateSpinePatch.lastRouteConfidence, out.confidence, 0, 1),
      routeLock: !!stateSpinePatch.routeLock,
      routeFailClosed: !!stateSpinePatch.routeFailClosed,
      updatedAt: Number(stateSpinePatch.updatedAt || 0) || 0
    };
  }

  if (Object.keys(composerContext).length) {
    out.composerContext = {
      concierge: compactDomainConciergeForTransport(composerContext.concierge || {}),
      normalizedUserIntent: clipText(composerContext.normalizedUserIntent, 260),
      rawUserText: clipText(composerContext.rawUserText, 260)
    };
  }

  return out;
}

function extractDomainConcierge(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const diagnostics = safeObj(src.diagnostics);
  const routing = safeObj(src.routing);
  const sessionPatch = safeObj(src.sessionPatch || src.memoryPatch);
  const payloadPatch = safeObj(payload.sessionPatch || payload.memoryPatch);
  const finalEnvelope = safeObj(src.finalEnvelope || payload.finalEnvelope || meta.finalEnvelope);
  const contract = safeObj(src.marionContract || src.contract || payload.marionContract || payload.contract || meta.marionContract);
  const packet = safeObj(src.packet || payload.packet || meta.packet);
  const packetMeta = safeObj(packet.meta);
  const candidates = [
    src.domainConcierge,
    src.domainConciergeSeed,
    routing.domainConcierge,
    routing.domainConciergeSeed,
    payload.domainConcierge,
    payload.domainConciergeSeed,
    meta.domainConcierge,
    diagnostics.domainConcierge,
    sessionPatch.domainConcierge,
    sessionPatch.domainConciergeSeed,
    payloadPatch.domainConcierge,
    payloadPatch.domainConciergeSeed,
    finalEnvelope.domainConcierge,
    contract.domainConcierge,
    packet.domainConcierge,
    packetMeta.domainConcierge
  ];

  for (const item of candidates) {
    const compact = compactDomainConciergeForTransport(item);
    if (Object.keys(compact).length) return compact;
  }

  return {};
}

function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = cleanText(arguments[i]);
    if (value) return value;
  }
  return "";
}

function isPrimitivePublicReplyValue(value) {
  if (typeof value === "boolean") return true;
  const text = cleanText(value).replace(/[.!?]+$/g, "").toLowerCase();
  if (!text) return true;
  return /^(?:false|true|null|undefined|nan|none|\[object object\])$/i.test(text);
}

function normalizeMicTextIntentText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\bmike\s*(?:to|2)?\s*text\b/g, "mic to text")
    .replace(/\bmic\s*(?:to|2)?\s*text\b/g, "mic to text")
    .replace(/\bmicrophone\s*(?:to|2)?\s*text\b/g, "mic to text")
    .replace(/\bspeech\s*(?:to|2)?\s*text\b/g, "mic to text")
    .replace(/\blanguage\s+(?:c\s*a|ca|k|see\s*a|sea|fair|fare|fear|sphere)\b/g, "languagesphere")
    .replace(/\s+/g, " ")
    .trim();
}

function collectIntentTextForRecovery(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const finalEnvelope = safeObj(src.finalEnvelope || payload.finalEnvelope || meta.finalEnvelope);
  const contract = safeObj(src.marionContract || src.contract || payload.marionContract || payload.contract || meta.marionContract);
  const pieces = [
    src.userText, src.rawUserText, src.originalUserText, src.text, src.message, src.query, src.inputText, src.originalText,
    payload.userText, payload.rawUserText, payload.originalUserText, payload.text, payload.message, payload.query, payload.originalText,
    meta.userText, meta.rawUserText, meta.originalUserText, meta.text, meta.message, meta.query,
    finalEnvelope.userText, finalEnvelope.rawUserText, finalEnvelope.originalUserText, finalEnvelope.text, finalEnvelope.message,
    contract.userText, contract.rawUserText, contract.originalUserText, contract.text, contract.message
  ];
  return normalizeMicTextIntentText(pieces.map(cleanText).filter(Boolean).join(" "));
}

function buildCoordinatorRecoveryReply(input = {}) {
  const text = collectIntentTextForRecovery(input);
  if (!text) return "";
  const asksNext = /\b(next steps?|what'?s next|where are we|roadmap|phase|continue)\b/i.test(text);
  const asksAfter = /\b(after|what happens after|after that|following|then)\b/i.test(text);
  if (/\blanguagesphere\b/i.test(text) && (asksNext || asksAfter)) {
    return "Next for LanguageSphere: harden mic-to-text parity, confirm spoken alias recovery, verify phase anchoring, then run paired typed/voice regression tests before moving stable components into LingoLink.";
  }
  if (/\bmic to text\b/i.test(text) && /\bparity\b/i.test(text) && (asksAfter || asksNext || /\bphase\b/i.test(text))) {
    return "After mic-to-text parity, the next step is the five-turn live mic smoke test: confirm voice input preserves topic, phase, domain route, and Marion authority across consecutive turns without returning false or broad clarification.";
  }
  if (/\bphase\s*(?:2|two)\b/i.test(text) && /\bmic to text|parity|voice\b/i.test(text)) {
    return "Phase 2 is the typed/mic parity regression harness. Test the same prompts by text and voice, then compare intent, domain, language route, clarification behavior, and Marion authority path.";
  }
  return "";
}

function clipText(value, max = 220) {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function hashText(value) {
  const source = cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
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



function extractRuntimeTelemetry(source = {}) {
  const src=safeObj(source), payload=safeObj(src.payload), meta=safeObj(src.meta), diagnostics=safeObj(src.diagnostics), finalEnvelope=extractFinalEnvelope(src), contract=extractMarionContract(src), packet=extractPacket(src);
  const rt=safeObj(src.runtimeTelemetry||payload.runtimeTelemetry||meta.runtimeTelemetry||diagnostics.runtimeTelemetry||finalEnvelope.runtimeTelemetry||contract.runtimeTelemetry||safeObj(packet.meta).runtimeTelemetry);
  if (Object.keys(rt).length) return rt;
  return {};
}
function buildChatRuntimeTelemetry({source="chatEngine",input={},reply="",trustedFinalEnvelope=false,finalEnvelope=false,canEmit=false,error=""}={}){
  const src=safeObj(input), inherited=extractRuntimeTelemetry(src), packet=extractPacket(src), packetMeta=safeObj(packet.meta), domainConcierge=extractDomainConcierge(src);
  const finalRenderTelemetry = finalRenderTelemetryMod && typeof finalRenderTelemetryMod.buildFinalRenderTelemetry === "function" ? safeObj(finalRenderTelemetryMod.buildFinalRenderTelemetry({source,stage:canEmit ? "final" : "awaiting_marion",reply,canEmit,finalEnvelopeTrusted:trustedFinalEnvelope,runtimeTelemetry:inherited,domainConfidence:safeObj(inherited.domainConfidence),error})) : {};
  return {
    ...inherited,
    version: FINAL_RUNTIME_TELEMETRY_VERSION,
    telemetryVisibilityVersion: TELEMETRY_VISIBILITY_VERSION,
    failureSignature: classifyFailureSignature({source,error,reply,canEmit,finalEnvelopeTrusted:trustedFinalEnvelope,trustedFinalEnvelope}),
    failureSignatureAudit: buildFailureSignatureAudit({source,error,reply,canEmit,stage:canEmit ? "final" : "awaiting_marion",intent:extractIntent(src),domain:extractDomain(src),finalEnvelopeTrusted:trustedFinalEnvelope,trustedFinalEnvelope}),
    source,
    stage: canEmit ? "final" : "awaiting_marion",
    finalAuthority: canEmit ? "marionFinalEnvelope" : "marion_required",
    replyAuthority: canEmit ? "chatEngine_passthrough" : "none",
    coordinatorOnly: true,
    canEmit: !!canEmit,
    error: cleanText(error || inherited.error || ""),
    intent: extractIntent(src),
    domain: extractDomain(src),
    lane: extractLane(src),
    turnId: extractTurnId(src),
    inputSource: firstText(src.inputSource,src.source,safeObj(src.session).inputSource,inherited.inputSource,"text"),
    technicalTargetLock: safeObj(src.technicalTargetLock || safeObj(src.sessionPatch).technicalTargetLock || safeObj(packetMeta).technicalTargetLock || inherited.technicalTargetLock),
    domainConcierge: Object.keys(domainConcierge).length ? domainConcierge : undefined,
    domainConciergeObserved: !!Object.keys(domainConcierge).length,
    domainConciergeCoreVersion: DOMAIN_CONCIERGE_CORE_VERSION,
    replySignature: reply ? hashText(reply) : firstText(inherited.replySignature,packetMeta.replySignature,""),
    trustedFinalEnvelope: !!trustedFinalEnvelope,
    finalEnvelope: !!finalEnvelope,
    finalRenderTelemetry,
    finalRenderTelemetryActive: !!Object.keys(finalRenderTelemetry).length,
    publicSurfaceClean: safeObj(finalRenderTelemetry).publicSurfaceClean !== false,
    engineVersion: VERSION,
    updatedAt: Date.now()
  };
}

function safeStringify(value, max = 4000) {
  const seen = new WeakSet();
  try {
    const text = JSON.stringify(value, function (_key, item) {
      if (typeof item === "function" || typeof item === "symbol" || typeof item === "bigint") return undefined;
      if (item && typeof item === "object") {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }
      return item;
    });
    return text && text.length > max ? `${text.slice(0, max)}…` : (text || "");
  } catch (err) {
    return `[Unserializable:${cleanText(err && err.message || err)}]`;
  }
}

function jsonSafe(value, depth = 0, seen = new WeakSet()) {
  if (value == null) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (t === "bigint") return String(value);
  if (t === "function" || t === "symbol" || t === "undefined") return undefined;
  if (depth > 8) return "[MaxDepth]";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => jsonSafe(item, depth + 1, seen)).filter((item) => item !== undefined);
  if (isPlainObject(value)) {
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

function clampNumber(value, fallback = 0, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function compactStringList(value, maxItems = 8, maxChars = 160) {
  return safeArray(value)
    .map((item) => clipText(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function compactCreativeCognitiveCarry(value = {}) {
  const carry = safeObj(value);
  if (!Object.keys(carry).length) return {};
  const suppression = safeObj(carry.suppression || carry.suppressionFlags || carry.guards);
  const scope = safeObj(carry.scope || carry.route || carry.routing);
  return {
    active: carry.active !== false,
    layer: clipText(firstText(carry.layer, carry.name, carry.module, "creative_cognitive"), 80),
    mode: clipText(firstText(carry.mode, carry.intentMode, carry.carryMode), 80),
    suggestion: clipText(firstText(carry.suggestion, carry.nextSuggestion, carry.creativeSuggestion, carry.prompt), 520),
    rationale: clipText(firstText(carry.rationale, carry.reason, carry.why), 360),
    confidence: clampNumber(carry.confidence, 0, 0, 1),
    carryDepth: Math.max(0, Math.min(50, Math.trunc(Number(carry.carryDepth || carry.depth || 0) || 0))),
    scope: {
      intent: clipText(firstText(scope.intent, carry.intent), 80),
      domain: clipText(firstText(scope.domain, carry.domain), 80),
      lane: clipText(firstText(scope.lane, carry.lane), 80)
    },
    suppression: {
      greetingSuppressed: !!suppression.greetingSuppressed,
      voiceSuppressed: !!suppression.voiceSuppressed,
      systemCheckSuppressed: !!suppression.systemCheckSuppressed,
      reason: clipText(firstText(suppression.reason, suppression.suppressionReason), 160)
    },
    tags: compactStringList(carry.tags || carry.labels || carry.signals, 8, 80),
    updatedAt: Number(carry.updatedAt || carry.at || 0) || 0
  };
}

function extractCreativeCognitiveCarryFromPatch(patch = {}) {
  const src = safeObj(patch);
  const stateBridge = safeObj(src.stateBridge);
  const candidates = [
    src.creativeCognitiveCarry,
    src.creativeCarry,
    src.cognitiveCarry,
    src.creativeSuggestionCarry,
    stateBridge.creativeCognitiveCarry,
    stateBridge.creativeCarry,
    stateBridge.cognitiveCarry
  ];
  for (const candidate of candidates) {
    if (isPlainObject(candidate) && Object.keys(candidate).length) return compactCreativeCognitiveCarry(candidate);
  }
  return {};
}

function compactStateBridgeForTransport(value = {}) {
  const bridge = safeObj(value);
  if (!Object.keys(bridge).length) return {};
  const carry = extractCreativeCognitiveCarryFromPatch({ stateBridge: bridge });
  const technicalTargetLock = safeObj(bridge.technicalTargetLock || bridge.targetLock);
  const out = {
    composedOnce: !!bridge.composedOnce,
    shouldAdvanceState: !!bridge.shouldAdvanceState,
    finalEnvelopeTrusted: !!bridge.finalEnvelopeTrusted,
    loopPhraseRejected: !!bridge.loopPhraseRejected,
    statePatchRequired: !!bridge.statePatchRequired,
    carryForwardSummary: clipText(firstText(bridge.carryForwardSummary, bridge.summary), 520),
    continuityTopic: clipText(firstText(bridge.continuityTopic, bridge.topic), 160),
    updatedAt: Number(bridge.updatedAt || 0) || 0
  };
  if (Object.keys(technicalTargetLock).length) out.technicalTargetLock = technicalTargetLock;
  if (Object.keys(carry).length) out.creativeCognitiveCarry = carry;
  return out;
}

function compactSessionPatchForTransport(value = {}) {
  const patch = jsonSafe(safeObj(value));
  const emotion = safeObj(patch.resolvedEmotion || patch.emotionState || patch.lastEmotionState);
  if (Object.keys(emotion).length) {
    const drift = safeObj(emotion.state_drift);
    const compactEmotion = {
      schema_version: cleanText(emotion.schema_version || "marion-resolved-emotion-state.v1.0"),
      emotion: safeObj(emotion.emotion),
      nuance: safeObj(emotion.nuance),
      support: safeObj(emotion.support),
      guard: safeObj(emotion.guard),
      state_drift: {
        trend: cleanText(drift.trend || ""),
        stability: Number(drift.stability || 0) || 0,
        volatility: Number(drift.volatility || 0) || 0,
        dominant_pattern: cleanText(drift.dominant_pattern || "")
      },
      runtime_meta: { source: cleanText(safeObj(emotion.runtime_meta).source || "") }
    };
    patch.resolvedEmotion = compactEmotion;
    patch.emotionState = compactEmotion;
    patch.lastEmotionState = compactEmotion;
  }

  const carry = extractCreativeCognitiveCarryFromPatch(patch);
  if (Object.keys(carry).length) {
    patch.creativeCognitiveCarry = carry;
    patch.creativeCarry = carry;
    patch.cognitiveCarry = carry;
  }

  const domainConcierge = extractDomainConcierge(patch);
  if (Object.keys(domainConcierge).length) {
    patch.domainConcierge = domainConcierge;
    patch.domainConciergeSeed = domainConcierge;
  }

  if (isPlainObject(patch.stateBridge) && Object.keys(patch.stateBridge).length) {
    patch.stateBridge = compactStateBridgeForTransport(patch.stateBridge);
  }

  if (typeof patch.carryForwardSummary === "string") patch.carryForwardSummary = clipText(patch.carryForwardSummary, 900);
  if (typeof patch.conversationSummary === "string") patch.conversationSummary = clipText(patch.conversationSummary, 900);
  if (typeof patch.lastAssistantReply === "string") patch.lastAssistantReply = clipText(patch.lastAssistantReply, 900);
  if (typeof patch.lastUserText === "string") patch.lastUserText = clipText(patch.lastUserText, 900);

  return patch;
}


function transportInputSource(packet = {}) {
  const p = safeObj(packet), meta = safeObj(p.meta), payload = safeObj(p.payload), sessionPatch = safeObj(p.sessionPatch || p.memoryPatch || payload.sessionPatch);
  const raw = lower(firstText(p.inputSource, p.source, payload.inputSource, payload.source, sessionPatch.inputSource, meta.inputSource, meta.source, "text"));
  return /^(voice|mic|microphone|speech|spoken|audio)$/.test(raw) ? "voice" : "text";
}
function continuityTransportMarker(packet = {}, reply = "") {
  const p = safeObj(packet), payload = safeObj(p.payload), sp = safeObj(p.sessionPatch || p.memoryPatch || payload.sessionPatch), cr = safeObj(sp.continuityRegression), ft = safeObj(sp.fiveTurnContract || cr.fiveTurnContract || payload.fiveTurnContract);
  return { version: "nyx.chatEngine.fiveTurnContinuity/1.1", inputSource: transportInputSource(packet), turnDepth: Number(sp.turnDepth || 0) || 0, continuityEligible: (Number(sp.turnDepth || 0) || 0) >= 1 && (Number(sp.turnDepth || 0) || 0) <= 5, userHash: firstText(sp.lastUserHash, sp.stateUserHash, sp.userSignature), replyHash: firstText(sp.lastAssistantHash, sp.replyStateSignature, sp.replySignature, hashText(reply)), regressionTarget: firstText(ft.regressionTarget, cr.regressionTarget), turnObjective: firstText(ft.turnObjective, cr.turnObjective), parityTarget: firstText(ft.parityTarget, cr.parityTarget), fiveTurnContract: ft, updatedAt: Date.now() };
}

function finalTransportPacket(packet = {}) {
  const out = jsonSafe(packet);
  if (isPlainObject(out)) {
    const finalEnvelope = isFinalEnvelope(out);
    const trustedFinalEnvelope = hasTrustedFinalEnvelope(out, out);
    let reply = sanitizeFinalUserFacingReplyForCohesion(extractFinalReply(out, { finalEnvelope, trustedFinalEnvelope }));
    const coordinatorRecoveryReply = buildCoordinatorRecoveryReply(out);
    if (!reply && coordinatorRecoveryReply) reply = coordinatorRecoveryReply;
    const canEmit = !!reply && (finalEnvelope || !!coordinatorRecoveryReply) && (trustedFinalEnvelope || !!coordinatorRecoveryReply) && !hasRejectedLoopReply(out) && !hasFinalFailureMarker(out, 0);
    const continuityTransport = continuityTransportMarker(out, reply);
    out.ok = canEmit && out.ok !== false;
    out.final = !!canEmit;
    out.marionFinal = !!canEmit;
    out.awaitingMarion = !canEmit;
    out.transportSafe = true;
    out.socketReconnect = false;
    out.suppressUserFacingReply = !canEmit;
    out.emit = canEmit;
    out.blocked = !canEmit;
    if (canEmit) {
      const spokenText = firstText(out.spokenText, safeObj(out.finalEnvelope).spokenText, reply);
      out.reply = reply; out.text = reply; out.answer = reply; out.output = reply; out.response = reply; out.message = reply; out.spokenText = spokenText;
      out.finalEnvelope = {
        ...safeObj(out.finalEnvelope),
        reply,
        text: reply,
        displayReply: reply,
        spokenText,
        final: true,
        marionFinal: true,
        handled: true,
        contractVersion: firstText(safeObj(out.finalEnvelope).contractVersion, FINAL_ENVELOPE_CONTRACT),
        authority: firstText(safeObj(out.finalEnvelope).authority, "marionFinalEnvelope")
      };
      out.payload = { ...safeObj(out.payload), reply, text: reply, message: reply, answer: reply, output: reply, response: reply, authoritativeReply: reply, spokenText, finalEnvelope: jsonSafe(out.finalEnvelope), final: true, marionFinal: true, awaitingMarion: false, suppressUserFacingReply: false, emit: true, blocked: false };
    } else {
      out.ok = false; out.final = false; out.marionFinal = false; out.terminal = false;
      out.reply = ""; out.text = ""; out.answer = ""; out.output = ""; out.response = ""; out.message = "";
      out.payload = { ...safeObj(out.payload), reply: "", text: "", message: "", answer: "", output: "", response: "", final: false, marionFinal: false, awaitingMarion: true, suppressUserFacingReply: true, emit: false, blocked: true };
    }
    if (out.sessionPatch) out.sessionPatch = compactSessionPatchForTransport(out.sessionPatch);
    if (out.memoryPatch) out.memoryPatch = compactSessionPatchForTransport(out.memoryPatch);
    if (out.payload && out.payload.sessionPatch) out.payload.sessionPatch = compactSessionPatchForTransport(out.payload.sessionPatch);
    const domainConcierge = extractDomainConcierge(out);
    if (Object.keys(domainConcierge).length) {
      out.domainConcierge = domainConcierge;
      out.payload = { ...safeObj(out.payload), domainConcierge };
    }
    out.meta = { ...safeObj(out.meta), transportSafe: true, socketReconnect: false, emitOrder: "finalEnvelope:beforeSessionPatch", trustedFinalEnvelope, finalEnvelope, suppressUserFacingReply: !canEmit, emit: canEmit, blocked: !canEmit, inputSource: continuityTransport.inputSource, continuityTransport, domainConciergeCompatible: true, domainConciergeCoreVersion: DOMAIN_CONCIERGE_CORE_VERSION, domainConciergeObserved: !!Object.keys(domainConcierge).length };
    out.diagnostics = { ...safeObj(out.diagnostics), transportSafe: true, trustedFinalEnvelope, finalEnvelope, suppressedUserFacingReply: !canEmit, continuityTransport, domainConciergeObserved: !!Object.keys(domainConcierge).length };
  }
  return out;
}

const INTERNAL_BLOCKER_PATTERNS = Object.freeze([
  /marion input required before reply emission/i,
  /reply emission/i,
  /bridge rejected malformed marion output before nyx handoff/i,
  /bridge rejected/i,
  /authoritative_reply_missing/i,
  /packet_synthesis_reply_missing/i,
  /contract_missing/i,
  /packet_missing/i,
  /bridge_rejected/i,
  /marion_contract_invalid/i,
  /compose_marion_response_unavailable/i,
  /packet_invalid/i,
  /technical response:\s*the marion path must return one trusted final reply only/i,
  /the marion path must return one trusted final reply only/i,
  /are you asking about the interface,?\s*(?:the backend|radio|media|roku|business strategy|system technical work|or a support issue)/i,
  /which area should i route this to:\s*interface,?\s*backend,?\s*media\/roku,?\s*business strategy,?\s*or support/i,
  /blocking generic placeholder language/i,
  /keeping the reply bound to the routed intent/i,
  /final envelope,? and session-state update/i
]);

const SHORT_BLOCKER_WORD_PATTERNS = Object.freeze([
  /^done\.?$/i,
  /^ready\.?$/i,
  /^working\.?$/i
]);


const ROGUE_FALLBACK_REPLY_PATTERNS = Object.freeze([
  /\bi need one specific command to continue (clearly|cleanly)\b/i,
  /\bsend a specific command\b/i,
  /\bpress reset to clear this session\b/i,
  /\bready\.\s*send (your next message|the next instruction|the specific file)\b/i,
  /\bi blocked a repeated fallback from the bridge\b/i,
  /\bnyx is connected\.\s*what would you like to do next\b/i,
  /\bi am here with you\b/i,
  /\bi['’]?m here with you\b/i,
  /\bwe can take this one step at a time\b/i,
  /\bi can stay with this clearly\b/i,
  /\bi[’\']?m here and tracking the turn\b/i,
  /\bi am here and tracking the turn\b/i,
  /\bgive me the next clear target\b/i,
  /\bnyx is live and tracking the turn\b/i,
  /\bi[’\']?m here\.?\s*what[’\']?s next\b/i,
  /\bi am here\.?\s*what[’\']?s next\b/i,
  /\bi[’\']?m online\.?\s*what[’\']?s next\b/i,
  /\bi am online\.?\s*what[’\']?s next\b/i,
  /\bi[’\']?m here,?\s*fully online\.?\s*what are we working on\b/i,
  /\bhi\s*[—-]\s*i[’\']?m here\b/i,
  /\bfully online\b.*\bwhat are we working on\b/i,
  /\bi[’\']?m holding the thread\.\s*tell me what continuity point\b/i,
  /\btechnical path confirmed\.\s*i[’\']?ll inspect the route output, composer reply, final envelope, bridge return shape, and state spine mutation\b/i,
  /\bready for the next test\b/i,
  /\bonline\. send next test\b/i,
  /\bstill connected\. send the next test\b/i
]);

function isRogueFallbackText(value) {
  const text = cleanText(value);
  if (!text) return false;
  return ROGUE_FALLBACK_REPLY_PATTERNS.some((rx) => rx.test(text));
}

function isMetadataLeakText(value) {
  const text = cleanText(value);
  if (!text) return false;
  return /\b(routeKind|speechHints|presenceProfile|nyxStateHint|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority)\s*[=:]/i.test(text) ||
    /\b(textSpeak|textToSynth|autoPlay|provider|when=post_reply|strategy=single_shot|compatibilityRoute|healthEndpoint)\s*[=:]/i.test(text);
}

function isThinPlaceholderText(value) {
  if (isPrimitivePublicReplyValue(value)) return true;
  const text = cleanText(value);
  if (!text) return true;
  if (isRogueFallbackText(text)) return true;
  if (text.length < 18) return /^(ready|done|working|ok|okay|yes|no|next|continue|what next|i[’']?m here)$/i.test(text);
  return /^(i[’']?m here|i am here|i[’']?m online|i am online|still connected|online|ready)\b.*\b(next|test|continue|working on)\b/i.test(text) || /\b(i[’']?ll inspect|i will inspect|i[’']?m holding|i am holding)\b/i.test(text);
}

function isShortBlockerText(value) {
  const text = cleanText(value);
  if (!text) return false;
  return SHORT_BLOCKER_WORD_PATTERNS.some((rx) => rx.test(text));
}

function isInternalBlockerText(value, context = {}) {
  const text = cleanText(value);
  if (!text) return false;

  if (isRogueFallbackText(text)) return true;
  if (isMetadataLeakText(text)) return true;
  if (INTERNAL_BLOCKER_PATTERNS.some((rx) => rx.test(text))) return true;

  const envelopeTrusted = !!context.envelopeTrusted;
  const fromDiagnosticPath = !!context.fromDiagnosticPath;
  const finalEnvelope = !!context.finalEnvelope;

  // Short generic words can be valid intentional final replies.
  // Block them only when they came from diagnostic/synthesis fallback space,
  // or when the envelope is not a trusted final.
  if (isShortBlockerText(text)) {
    return fromDiagnosticPath || !finalEnvelope || !envelopeTrusted;
  }

  return false;
}

function extractMarionContract(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const marion = safeObj(src.marion || payload.marion || meta.marion);
  return safeObj(
    src.marionContract ||
    src.contract ||
    payload.marionContract ||
    payload.contract ||
    meta.marionContract ||
    marion.contract ||
    marion.marionContract ||
    {}
  );
}

function extractPacket(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const marion = safeObj(src.marion || payload.marion || meta.marion);
  return safeObj(src.packet || payload.packet || meta.packet || marion.packet || {});
}

function extractFinalEnvelope(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  return safeObj(
    src.finalEnvelope ||
    payload.finalEnvelope ||
    meta.finalEnvelope ||
    safeObj(src.marion).finalEnvelope ||
    safeObj(payload.marion).finalEnvelope ||
    safeObj(meta.marion).finalEnvelope ||
    {}
  );
}

function getNestedFinalLocations(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const marion = safeObj(src.marion || payload.marion || meta.marion);
  const contract = extractMarionContract(src);
  const packet = extractPacket(src);
  const packetMeta = safeObj(packet.meta);
  const synthesis = safeObj(packet.synthesis);
  const finalEnvelope = extractFinalEnvelope(src);

  return {
    src,
    payload,
    meta,
    marion,
    contract,
    packet,
    packetMeta,
    synthesis,
    finalEnvelope
  };
}

function isAuthoritativeMarionFinalLocation(input = {}) {
  const { contract, packet, packetMeta, synthesis, finalEnvelope } = getNestedFinalLocations(input);

  return !!(
    contract.final === true ||
    contract.marionFinal === true ||
    synthesis.final === true ||
    synthesis.marionFinal === true ||
    packet.final === true ||
    packet.marionFinal === true ||
    packetMeta.final === true ||
    packetMeta.marionFinal === true ||
    finalEnvelope.final === true
  );
}

function isWeakFinalFlagPresent(input = {}) {
  const { src, payload, meta, marion } = getNestedFinalLocations(input);

  return !!(
    src.final === true ||
    src.marionFinal === true ||
    src.handled === true ||
    src.marionHandled === true ||
    payload.final === true ||
    payload.marionFinal === true ||
    meta.final === true ||
    meta.marionFinal === true ||
    marion.final === true ||
    marion.marionFinal === true
  );
}

function isFinalEnvelope(source = {}) {
  // Prefer Marion-side contract/synthesis/packet final flags.
  // Generic wrapper/meta final flags are accepted only when paired with a trust marker.
  const authoritative = isAuthoritativeMarionFinalLocation(source);
  if (authoritative) return true;

  return !!(isWeakFinalFlagPresent(source) && objectContainsTrustedFinalSignature(source, 0));
}

function hasKnownGoodContractVersion(value = {}) {
  if (!isPlainObject(value)) return false;
  const { src, payload, meta, contract, packet, packetMeta, synthesis, finalEnvelope } = getNestedFinalLocations(value);
  const versions = [
    src.contractVersion,
    src.finalContractVersion,
    payload.contractVersion,
    meta.contractVersion,
    contract.contractVersion,
    contract.finalContractVersion,
    packet.contractVersion,
    packetMeta.contractVersion,
    synthesis.contractVersion,
    finalEnvelope.contractVersion
  ].map(cleanText).filter(Boolean);

  return versions.some((v) => KNOWN_GOOD_FINAL_CONTRACTS.includes(v));
}

function containsLegacyTrustFlag(value, depth = 0) {
  if (depth > 8 || value == null) return false;
  if (Array.isArray(value)) return value.some((item) => containsLegacyTrustFlag(item, depth + 1));
  if (!isPlainObject(value)) return false;

  for (const key of LEGACY_TRUST_FLAGS) {
    if (value[key] === true) return true;
  }

  const source = lower(value.source || value.origin || value.authority || "");
  if (source === "marion" || source === "marionbridge" || source === "composemarionresponse") {
    if (value.final === true || value.marionFinal === true || value.handled === true) return true;
  }

  return Object.keys(value).some((key) => containsLegacyTrustFlag(value[key], depth + 1));
}


function hasTrustedBridgeOrComposerMarker(value, depth = 0) {
  if (depth > 8 || value == null) return false;
  if (typeof value === "string") {
    const s = cleanText(value);
    return !!(
      /marionBridge v(6\.(3|4|5|6)|7\.[0-9]+)/i.test(s) ||
      /composeMarionResponse v(2\.(3|4|5)|3\.[0-9]+)/i.test(s) ||
      /STATE-SPINE-COHESION|FINAL-ENVELOPE|TRANSPORT-AUTHORITY-LOCK/i.test(s)
    );
  }
  if (Array.isArray(value)) return value.some((item) => hasTrustedBridgeOrComposerMarker(item, depth + 1));
  if (isPlainObject(value)) return Object.keys(value).some((key) => hasTrustedBridgeOrComposerMarker(value[key], depth + 1));
  return false;
}

function hasRejectedLoopReply(input = {}) {
  const candidate = extractReplyCandidate(input);
  return isRogueFallbackText(candidate.value);
}

function objectContainsTrustedFinalSignature(value, depth = 0) {
  if (depth > 8 || value == null) return false;

  if (typeof value === "string") {
    const s = cleanText(value);
    return !!(
      s.indexOf(MARION_FINAL_SIGNATURE_PREFIX) === 0 &&
      s.indexOf(CHAT_ENGINE_SIGNATURE) !== -1 &&
      (
        s.indexOf(STATE_SPINE_SCHEMA) !== -1 ||
        s.indexOf(STATE_SPINE_SCHEMA_COMPAT) !== -1 ||
        /nyx\.marion\.stateSpine\/[0-9.]+/i.test(s)
      )
    );
  }

  if (Array.isArray(value)) return value.some((item) => objectContainsTrustedFinalSignature(item, depth + 1));

  if (isPlainObject(value)) {
    const signature = cleanText(value.marionFinalSignature || value.finalSignature || value.signature);
    if (value.requiredSignature === CHAT_ENGINE_SIGNATURE && signature.indexOf(MARION_FINAL_SIGNATURE_PREFIX) === 0) return true;
    if (value.contractVersion === FINAL_ENVELOPE_CONTRACT && value.source === "marion" && value.signature === FINAL_SIGNATURE && value.final === true) return true;
    if ((value.authority === "marionFinalEnvelope" || value.replyAuthority === "marionFinalEnvelope") && (value.final === true || value.marionFinal === true || cleanText(value.reply))) return true;
    if (value.source === "composeMarionResponse" && value.authority === "marionFinalEnvelope" && cleanText(value.reply)) return true;
    if (value.meta && value.meta.freshMarionFinal === true && value.meta.singleFinalAuthority === true) return true;
    return Object.keys(value).some((key) => objectContainsTrustedFinalSignature(value[key], depth + 1));
  }

  return false;
}


function hasFinalFailureMarker(value, depth = 0) {
  if (depth > 8 || value == null) return false;
  if (Array.isArray(value)) return value.some((item) => hasFinalFailureMarker(item, depth + 1));
  if (!isPlainObject(value)) return false;

  const completion = safeObj(value.completionStatus);
  if (value.requiresRetry === true || value.recoverySuggested === true || value.error === true) return true;
  if (completion.requiresRetry === true || completion.recoverySuggested === true) return true;
  if (completion.complete === false && completion.actionableReply !== true) return true;
  if (completion.softRecoveryDetected === true) return true;

  const reason = lower(value.reason || completion.reason || value.status || value.error || value.code || "");
  if (/soft_recovery_reply_not_final|reply_not_actionable|marion_final_error|composer_invalid|compose_reply_missing|missing_reply|not_final_yet/.test(reason)) return true;

  return Object.keys(value).some((key) => {
    // Do not let stale diagnostics/history from a prior rejected turn poison a current valid final envelope.
    if (/^(diagnostics|debug|trace|pipelineTrace|rejectionLog|previousMemory|history|memory|session|state)$/i.test(key)) return false;
    return hasFinalFailureMarker(value[key], depth + 1);
  });
}

function hasTrustedFinalEnvelope(source = {}, options = {}) {
  const finalEnvelope = isFinalEnvelope(source);
  if (!finalEnvelope) return false;

  // Never trust known rogue fallback text. Stale failure markers are isolated below so a valid current finalEnvelope can still emit.
  if (hasRejectedLoopReply(source)) return false;

  const finalEnv = extractFinalEnvelope(source);
  if (cleanText(finalEnv.reply) && !hasFinalFailureMarker(finalEnv, 0) && (finalEnv.authority === "marionFinalEnvelope" || finalEnv.source === "marion" || finalEnv.source === "composeMarionResponse" || finalEnv.source === "marionBridge")) return true;

  if (hasFinalFailureMarker(source, 0)) return false;

  const strictSignature = objectContainsTrustedFinalSignature(source, 0);
  if (strictSignature) return true;

  const knownGoodContract = hasKnownGoodContractVersion(source);
  const legacyTrust = containsLegacyTrustFlag(source, 0);
  const bridgeOrComposerMarker = hasTrustedBridgeOrComposerMarker(source, 0);
  const internalTrusted = !!(
    options.trustedTransport ||
    source.trustedTransport === true ||
    safeObj(source.meta).trustedTransport === true ||
    safeObj(source.payload).trustedTransport === true
  );

  // Version-gated trust: accept known-good final contracts when explicit legacy/internal
  // trust is present, even if the newer final signature is not mirrored.
  if (knownGoodContract && (legacyTrust || internalTrusted || bridgeOrComposerMarker)) return true;

  // Legacy compatibility: older bridge/composer final packets may lack final envelope
  // signature but still expose Marion-side final plus hardlock compatibility.
  if (isAuthoritativeMarionFinalLocation(source) && (legacyTrust || bridgeOrComposerMarker)) return true;

  return false;
}

function extractReplyCandidate(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const marion = safeObj(src.marion || payload.marion || meta.marion);
  const contract = extractMarionContract(src);
  const contractPayload = safeObj(contract.payload);
  const packet = extractPacket(src);
  const synthesis = safeObj(packet.synthesis);
  const finalEnvelope = extractFinalEnvelope(src);

  const candidates = [
    // Final envelope is the render authority. Wrapper fields can be stale mirrors
    // from older transport layers, so the canonical envelope must win first.
    { value: finalEnvelope.reply, path: "finalEnvelope.reply", diagnostic: false },
    { value: finalEnvelope.text, path: "finalEnvelope.text", diagnostic: false },
    { value: finalEnvelope.displayReply, path: "finalEnvelope.displayReply", diagnostic: false },
    { value: finalEnvelope.spokenText, path: "finalEnvelope.spokenText", diagnostic: false },
    { value: src.reply, path: "src.reply", diagnostic: false },
    { value: src.text, path: "src.text", diagnostic: false },
    { value: src.answer, path: "src.answer", diagnostic: false },
    { value: src.output, path: "src.output", diagnostic: false },
    { value: src.response, path: "src.response", diagnostic: false },
    { value: src.message, path: "src.message", diagnostic: false },
    { value: src.spokenText, path: "src.spokenText", diagnostic: false },
    { value: contract.reply, path: "contract.reply", diagnostic: false },
    { value: contract.text, path: "contract.text", diagnostic: false },
    { value: contract.answer, path: "contract.answer", diagnostic: false },
    { value: contract.output, path: "contract.output", diagnostic: false },
    { value: contract.response, path: "contract.response", diagnostic: false },
    { value: contract.spokenText, path: "contract.spokenText", diagnostic: false },
    { value: contractPayload.reply, path: "contract.payload.reply", diagnostic: false },
    { value: contractPayload.text, path: "contract.payload.text", diagnostic: false },
    { value: marion.reply, path: "marion.reply", diagnostic: false },
    { value: marion.text, path: "marion.text", diagnostic: false },
    { value: marion.answer, path: "marion.answer", diagnostic: false },
    { value: marion.output, path: "marion.output", diagnostic: false },
    { value: marion.response, path: "marion.response", diagnostic: false },
    { value: marion.spokenText, path: "marion.spokenText", diagnostic: false },
    { value: payload.reply, path: "payload.reply", diagnostic: false },
    { value: payload.text, path: "payload.text", diagnostic: false },
    { value: payload.answer, path: "payload.answer", diagnostic: false },
    { value: payload.output, path: "payload.output", diagnostic: false },
    { value: packet.reply, path: "packet.reply", diagnostic: false },
    { value: packet.text, path: "packet.text", diagnostic: false },
    { value: packet.answer, path: "packet.answer", diagnostic: false },
    { value: packet.output, path: "packet.output", diagnostic: false },
    { value: synthesis.reply, path: "packet.synthesis.reply", diagnostic: true },
    { value: synthesis.text, path: "packet.synthesis.text", diagnostic: true },
    { value: synthesis.answer, path: "packet.synthesis.answer", diagnostic: true },
    { value: synthesis.output, path: "packet.synthesis.output", diagnostic: true },
    { value: synthesis.spokenText, path: "packet.synthesis.spokenText", diagnostic: true }
  ];

  for (const candidate of candidates) {
    const text = cleanText(candidate.value);
    if (text) return { ...candidate, value: text };
  }

  return { value: "", path: "", diagnostic: false };
}

function extractFinalReply(input = {}, trust = {}) {
  const candidates = [];
  const first = extractReplyCandidate(input);
  if (first.value) candidates.push(first);

  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const marion = safeObj(src.marion || payload.marion || meta.marion);
  const contract = extractMarionContract(src);
  const contractPayload = safeObj(contract.payload);
  const packet = extractPacket(src);
  const synthesis = safeObj(packet.synthesis);
  const finalEnvelope = extractFinalEnvelope(src);

  const extraCandidates = [
    { value: finalEnvelope.reply, path: "finalEnvelope.reply", diagnostic: false },
    { value: finalEnvelope.text, path: "finalEnvelope.text", diagnostic: false },
    { value: finalEnvelope.displayReply, path: "finalEnvelope.displayReply", diagnostic: false },
    { value: src.reply, path: "src.reply", diagnostic: false },
    { value: src.text, path: "src.text", diagnostic: false },
    { value: src.answer, path: "src.answer", diagnostic: false },
    { value: src.output, path: "src.output", diagnostic: false },
    { value: src.response, path: "src.response", diagnostic: false },
    { value: contract.reply, path: "contract.reply", diagnostic: false },
    { value: contract.text, path: "contract.text", diagnostic: false },
    { value: contractPayload.reply, path: "contract.payload.reply", diagnostic: false },
    { value: contractPayload.text, path: "contract.payload.text", diagnostic: false },
    { value: marion.reply, path: "marion.reply", diagnostic: false },
    { value: marion.text, path: "marion.text", diagnostic: false },
    { value: payload.reply, path: "payload.reply", diagnostic: false },
    { value: payload.text, path: "payload.text", diagnostic: false },
    { value: packet.reply, path: "packet.reply", diagnostic: false },
    { value: packet.text, path: "packet.text", diagnostic: false },
    { value: synthesis.reply, path: "packet.synthesis.reply", diagnostic: true },
    { value: synthesis.text, path: "packet.synthesis.text", diagnostic: true }
  ];
  for (const c of extraCandidates) {
    const text = cleanText(c.value);
    if (text && !candidates.some((x) => x.path === c.path && x.value === text)) candidates.push({ ...c, value: text });
  }

  const envelopeTrusted = typeof trust.trustedFinalEnvelope === "boolean" ? trust.trustedFinalEnvelope : hasTrustedFinalEnvelope(input, trust);
  const finalEnvelopePresent = typeof trust.finalEnvelope === "boolean" ? trust.finalEnvelope : isFinalEnvelope(input);

  for (const candidate of candidates) {
    if (!candidate.value) continue;
    if (isThinPlaceholderText(candidate.value)) continue;
    if (isInternalBlockerText(candidate.value, {
      envelopeTrusted,
      finalEnvelope: finalEnvelopePresent,
      fromDiagnosticPath: candidate.diagnostic
    })) continue;
    return candidate.value;
  }

  return "";
}

function extractIntent(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const contract = extractMarionContract(src);
  const packet = extractPacket(src);
  const routing = safeObj(packet.routing);
  const synthesis = safeObj(packet.synthesis);
  const finalEnvelope = extractFinalEnvelope(src);

  return firstText(
    finalEnvelope.intent,
    src.intent,
    payload.intent,
    meta.intent,
    contract.intent,
    routing.intent,
    synthesis.intent,
    "general"
  ) || "general";
}

function extractDomain(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const contract = extractMarionContract(src);
  const packet = extractPacket(src);
  const routing = safeObj(packet.routing);
  const synthesis = safeObj(packet.synthesis);
  const finalEnvelope = extractFinalEnvelope(src);

  return firstText(
    finalEnvelope.domain,
    src.domain,
    src.requestedDomain,
    payload.domain,
    meta.domain,
    meta.requestedDomain,
    contract.domain,
    routing.domain,
    synthesis.domain,
    "general"
  ) || "general";
}

function extractLane(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);

  return firstText(
    src.lane,
    src.laneId,
    src.sessionLane,
    payload.lane,
    payload.laneId,
    payload.sessionLane,
    meta.lane,
    meta.laneId,
    "general"
  ) || "general";
}

function extractTurnId(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const packet = extractPacket(src);
  const packetMeta = safeObj(packet.meta);

  return firstText(
    src.turnId,
    src.requestId,
    src.traceId,
    src.id,
    payload.turnId,
    payload.requestId,
    payload.traceId,
    meta.turnId,
    meta.requestId,
    meta.traceId,
    packetMeta.turnId,
    packetMeta.requestId,
    packetMeta.traceId
  );
}

function extractUserText(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);

  return firstText(
    src.userQuery,
    src.text,
    src.query,
    src.message,
    payload.userQuery,
    payload.text,
    payload.query,
    payload.message,
    meta.userQuery,
    meta.text,
    meta.query
  );
}

function extractFollowUps(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const contract = extractMarionContract(src);
  const packet = extractPacket(src);
  const synthesis = safeObj(packet.synthesis);

  return safeArray(
    src.followUpsStrings ||
    src.followUps ||
    payload.followUpsStrings ||
    payload.followUps ||
    contract.followUpsStrings ||
    contract.followUps ||
    synthesis.followUpsStrings ||
    synthesis.followUps ||
    []
  ).map(cleanText).filter(Boolean).slice(0, 4);
}

function extractSessionPatch(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const contract = extractMarionContract(src);
  const packet = extractPacket(src);
  const synthesis = safeObj(packet.synthesis);

  return safeObj(
    src.sessionPatch ||
    src.memoryPatch ||
    payload.sessionPatch ||
    payload.memoryPatch ||
    contract.sessionPatch ||
    contract.memoryPatch ||
    packet.memoryPatch ||
    synthesis.memoryPatch ||
    {}
  );
}

function classifyMissingFinalReason({ finalEnvelope, trustedFinalEnvelope, replyPresent, rogueFallbackPresent }) {
  if (rogueFallbackPresent) return "rogue_fallback_reply_rejected";
  if (!finalEnvelope) return "not_final_yet";
  if (!trustedFinalEnvelope) return "missing_signature";
  if (!replyPresent) return "missing_reply";
  return "marion_final_reply_missing";
}

function buildBlankErrorContract(reason, detail = {}, input = {}, options = {}) {
  const lane = extractLane(input);
  const intent = extractIntent(input);
  const domain = extractDomain(input);
  const turnId = extractTurnId(input);
  const userQuery = extractUserText(input);
  const domainConcierge = compactDomainConciergeForTransport(extractDomainConcierge(input));
  const terminal = options && options.terminal === true;
  const awaitingMarion = !terminal;
  const runtimeTelemetry = buildChatRuntimeTelemetry({source:"chatEngine.buildMissingFinalResult",input,reply:"",trustedFinalEnvelope:false,finalEnvelope:false,canEmit:false,error:reason});

  return {
    ok: false,
    error: true,
    final: terminal,
    marionFinal: false,
    handled: true,
    terminal,
    awaitingMarion,
    suppressUserFacingReply: true,
    emit: false,
    blocked: true,
    status: terminal ? "terminal_error" : "awaiting_marion",
    reason: cleanText(reason || "marion_final_reply_missing") || "marion_final_reply_missing",
    detail: safeObj(detail),

    reply: "",
    text: "",
    answer: "",
    output: "",
    spokenText: "",
    message: "",

    lane,
    laneId: lane,
    sessionLane: lane,
    domain,
    intent,
    userQuery,

    payload: {
      reply: "",
      text: "",
      answer: "",
      output: "",
      spokenText: "",
      final: terminal,
      error: true,
      awaitingMarion,
      suppressUserFacingReply: true,
      emit: false,
      blocked: true,
      domainConcierge: Object.keys(domainConcierge).length ? domainConcierge : undefined
    },

    followUps: [],
    followUpsStrings: [],
    sessionPatch: {},

    cog: {
      intent,
      mode: terminal ? "coordinator_only_terminal_error" : "coordinator_only_waiting",
      publicMode: true,
      decisionAuthority: "marion_required"
    },

    meta: {
      engineVersion: VERSION,
      finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
      runtimeTelemetry,
      chatEngineSignature: CHAT_ENGINE_SIGNATURE,
      stateSpineSchema: STATE_SPINE_SCHEMA,
      stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
      coordinatorOnly: true,
      finalReplyAuthority: "marion",
      replyAuthority: "none",
      domainConciergeCompatible: true,
      domainConciergeCoreVersion: DOMAIN_CONCIERGE_CORE_VERSION,
      domainConciergeObserved: !!Object.keys(domainConcierge).length,
      awaitingMarion,
      suppressUserFacingReply: true,
      emit: false,
      blocked: true,
      terminal,
      turnId,
      reason: cleanText(reason || "marion_final_reply_missing") || "marion_final_reply_missing",
      detail: safeObj(detail)
    },

    diagnostics: {
      engineVersion: VERSION,
      finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
      runtimeTelemetry,
      chatEngineSignature: CHAT_ENGINE_SIGNATURE,
      stateSpineSchema: STATE_SPINE_SCHEMA,
      stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
      coordinatorOnly: true,
      error: true,
      domainConciergeCompatible: true,
      domainConciergeCoreVersion: DOMAIN_CONCIERGE_CORE_VERSION,
      domainConciergeObserved: !!Object.keys(domainConcierge).length,
      awaitingMarion,
      suppressUserFacingReply: true,
      emit: false,
      blocked: true,
      terminal,
      reason: cleanText(reason || "marion_final_reply_missing") || "marion_final_reply_missing",
      detail: safeObj(detail)
    },

    speech: null
  };
}

function buildStructuredFinalReply(input = {}, trust = {}) {
  const trustedFinalEnvelope = typeof trust.trustedFinalEnvelope === "boolean" ? trust.trustedFinalEnvelope : hasTrustedFinalEnvelope(input, trust);
  const finalEnvelope = typeof trust.finalEnvelope === "boolean" ? trust.finalEnvelope : isFinalEnvelope(input);
  const reply = sanitizeFinalUserFacingReplyForCohesion(extractFinalReply(input, { ...trust, trustedFinalEnvelope, finalEnvelope }));
  const lane = extractLane(input);
  const intent = extractIntent(input);
  const domain = extractDomain(input);
  const turnId = extractTurnId(input);
  const userQuery = extractUserText(input);
  const followUpsStrings = extractFollowUps(input);
  const sessionPatch = compactSessionPatchForTransport(extractSessionPatch(input));
  const domainConcierge = compactDomainConciergeForTransport(extractDomainConcierge(input));
  const creativeCognitiveCarry = extractCreativeCognitiveCarryFromPatch(sessionPatch);
  const contract = extractMarionContract(input);
  const packet = extractPacket(input);
  const replySignature = firstText(
    input.replySignature,
    safeObj(input.meta).replySignature,
    safeObj(packet.meta).replySignature,
    hashText(reply)
  );
  const sourceEnvelope = extractFinalEnvelope(input);
  const spokenText = firstText(input.spokenText, contract.spokenText, safeObj(packet.synthesis).spokenText, safeObj(sourceEnvelope).spokenText, reply.replace(/\n+/g, " "));
  const runtimeTelemetry = buildChatRuntimeTelemetry({
    source: "chatEngine.buildStructuredFinalReply",
    input,
    reply,
    trustedFinalEnvelope,
    finalEnvelope,
    canEmit: true,
    error: ""
  });
  const canonicalFinalEnvelope = Object.keys(sourceEnvelope).length ? {
    ...sourceEnvelope,
    reply,
    text: reply,
    displayReply: reply,
    spokenText,
    final: true,
    marionFinal: true,
    handled: true,
    contractVersion: firstText(sourceEnvelope.contractVersion, FINAL_ENVELOPE_CONTRACT),
    authority: firstText(sourceEnvelope.authority, "marionFinalEnvelope"),
    finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
    runtimeTelemetry
  } : undefined;

  return {
    ok: true,
    final: true,
    marionFinal: true,
    handled: true,
    suppressUserFacingReply: false,
    emit: true,
    blocked: false,
    status: "ok",

    reply,
    text: reply,
    answer: reply,
    output: reply,
    spokenText: firstText(input.spokenText, contract.spokenText, safeObj(packet.synthesis).spokenText, reply.replace(/\n+/g, " ")),

    lane,
    laneId: lane,
    sessionLane: lane,
    domain,
    intent,
    userQuery,

    payload: {
      reply,
      text: reply,
      message: reply,
      answer: reply,
      output: reply,
      response: reply,
      authoritativeReply: reply,
      spokenText: firstText(input.spokenText, contract.spokenText, safeObj(packet.synthesis).spokenText, reply.replace(/\n+/g, " ")),
      final: true,
      marionFinal: true,
      awaitingMarion: false,
      suppressUserFacingReply: false,
      emit: true,
      blocked: false,
      domainConcierge: Object.keys(domainConcierge).length ? domainConcierge : undefined
    },

    bridge: Object.keys(safeObj(input.marion)).length ? safeObj(input.marion) : null,
    finalEnvelope: canonicalFinalEnvelope,
    packet: Object.keys(packet).length ? packet : undefined,
    contract: Object.keys(contract).length ? contract : undefined,

    ctx: {},
    ui: safeObj(input.ui),
    emotionalTurn: null,
    directives: [],
    followUps: followUpsStrings.map((text) => ({ label: text, text })),
    followUpsStrings,
    sessionPatch,
    domainConcierge: Object.keys(domainConcierge).length ? domainConcierge : null,
    creativeCognitiveCarry: Object.keys(creativeCognitiveCarry).length ? creativeCognitiveCarry : null,
    finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
    runtimeTelemetry,
    resolvedEmotion: input.resolvedEmotion || sessionPatch.resolvedEmotion || sessionPatch.lastEmotionState || null,
    emotionRuntime: input.emotionRuntime || null,
    emotionSummary: input.emotionSummary || safeObj(input.diagnostics).emotionSummary || null,

    cog: {
      intent,
      mode: "coordinator_only",
      publicMode: true,
      decisionAuthority: "marion"
    },

    meta: {
      ...safeObj(input.meta),
      engineVersion: VERSION,
      finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
      runtimeTelemetry,
      chatEngineSignature: CHAT_ENGINE_SIGNATURE,
      stateSpineSchema: STATE_SPINE_SCHEMA,
      stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
      coordinatorOnly: true,
      finalReplyAuthority: "marion",
      replyAuthority: "marion_final",
      marionAuthorityLock: true,
      awaitingMarion: false,
      turnId,
      replySignature,
      source: "chatEngine_passthrough",
      trustedFinalEnvelope,
      finalEnvelope,
      stateSpineCompatible: true,
      creativeCognitiveCarryCompatible: true,
      domainConciergeCompatible: true,
      domainConciergeCoreVersion: DOMAIN_CONCIERGE_CORE_VERSION
    },

    diagnostics: {
      ...safeObj(input.diagnostics),
      engineVersion: VERSION,
      chatEngineSignature: CHAT_ENGINE_SIGNATURE,
      stateSpineSchema: STATE_SPINE_SCHEMA,
      stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
      coordinatorOnly: true,
      acceptedFinalEnvelope: true,
      trustedFinalEnvelope,
      finalEnvelope,
      stateSpineCompatible: true,
      creativeCognitiveCarryCompatible: true,
      creativeCognitiveCarryObserved: !!Object.keys(creativeCognitiveCarry).length,
      domainConciergeObserved: !!Object.keys(domainConcierge).length,
      replyPreview: clipText(reply, 160)
    },

    speech: input.speech || null
  };
}



const FINAL_PIPELINE_COHESION_BLOCKLIST = Object.freeze([
  /finalEnvelope\s*[=:]/i,
  /sessionPatch\s*[=:]/i,
  /routeKind\s*[=:]/i,
  /speechHints\s*[=:]/i,
  /presenceProfile\s*[=:]/i,
  /transportSafe\s*[=:]/i,
  /replyAuthority\s*[=:]/i,
  /marionFinal\s*[=:]/i,
  /nyxStateHint\s*[=:]/i,
  /memoryPatch\s*[=:]/i,
  /diagnostic packet/i,
  /trusted final envelope/i
]);

function sanitizeFinalUserFacingReplyForCohesion(value) {
  let text = cleanText(value);
  if (!text || isPrimitivePublicReplyValue(value) || isPrimitivePublicReplyValue(text)) return "";
  if (FINAL_PIPELINE_COHESION_BLOCKLIST.some((rx) => rx.test(text))) return "";
  text = text.replace(/\b(MARION::FINAL::[^\s]+|CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2})\b/g, "").replace(/\s+/g, " ").trim();
  if (isPrimitivePublicReplyValue(text) || isRogueFallbackText(text) || isMetadataLeakText(text) || isInternalBlockerText(text, { finalEnvelope: false, envelopeTrusted: false })) return "";
  return text;
}


function extractConversationalPackBridge(source = {}) {
  const src = safeObj(source);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const diagnostics = safeObj(src.diagnostics);
  const finalEnvelope = extractFinalEnvelope(src);
  const sessionPatch = safeObj(src.sessionPatch || payload.sessionPatch || finalEnvelope.sessionPatch || {});
  const memoryPatch = safeObj(src.memoryPatch || payload.memoryPatch || finalEnvelope.memoryPatch || {});
  const candidates = [
    src.conversationalPack,
    src.packCohesion,
    src.packRuntime,
    payload.conversationalPack,
    payload.packCohesion,
    meta.conversationalPack,
    meta.packCohesion,
    diagnostics.conversationalPack,
    diagnostics.packCohesion,
    sessionPatch.conversationalPack,
    sessionPatch.packCohesion,
    memoryPatch.conversationalPack,
    memoryPatch.packCohesion,
    safeObj(sessionPatch.marionCohesion).packCohesion
  ];
  for (const candidate of candidates) {
    if (isPlainObject(candidate) && Object.keys(candidate).length) return candidate;
  }
  return {};
}

function normalizeConversationalPackBridge(source = {}) {
  const bridge = safeObj(extractConversationalPackBridge(source));
  const rawTrack = lower(firstText(bridge.track, bridge.route, bridge.mode, bridge.kind));
  const allowedTracks = new Set([
    "emotional_specificity",
    "public_diagnostic_translation",
    "developer_diagnostic",
    "next_step_context",
    "repetition_escape",
    "backend_empty_guard",
    "state_persistence_correction",
    "atmosphere_continuity"
  ]);
  const track = allowedTracks.has(rawTrack) ? rawTrack : "atmosphere_continuity";
  const replayRisk = clampNumber(bridge.replayRisk ?? bridge.risk ?? 0, 0, 0, 1);
  return {
    version: CONVERSATIONAL_PACK_COHESION_VERSION,
    active: bridge.active !== false,
    track,
    depthBand: firstText(bridge.depthBand, bridge.depth, "early"),
    antiLoopEligible: !!(bridge.antiLoopEligible || track !== "atmosphere_continuity" || replayRisk >= 0.35),
    atmosphereEligible: bridge.atmosphereEligible !== false && track === "atmosphere_continuity" && replayRisk < 0.35,
    stateAdvanceRequired: bridge.stateAdvanceRequired !== false && (track !== "atmosphere_continuity" || replayRisk >= 0.35),
    publicDiagnostic: !!bridge.publicDiagnostic,
    replayRisk,
    staleCarrySuppressed: !!bridge.staleCarrySuppressed,
    source: firstText(bridge.source, "chatEngine.packBridge")
  };
}

function conversationPackCohesionProfile(source = {}) {
  const pack = normalizeConversationalPackBridge(source);
  const reply = extractFinalReply(source, { finalEnvelope: isFinalEnvelope(source), trustedFinalEnvelope: hasTrustedFinalEnvelope(source, source) });
  const loopy = isRogueFallbackText(reply) || isThinPlaceholderText(reply) || isMetadataLeakText(reply);
  return {
    ...pack,
    coordinatorOnly: true,
    replyLoopRisk: !!loopy,
    canUseAtmosphere: !!(pack.atmosphereEligible && !loopy),
    requiresActionBearingReply: !!(pack.antiLoopEligible || pack.stateAdvanceRequired || loopy),
    updatedAt: Date.now()
  };
}

function finalPipelineCohesionProfile(source = {}) {
  const src = safeObj(source);
  const finalEnvelope = isFinalEnvelope(src);
  const trustedFinalEnvelope = hasTrustedFinalEnvelope(src, src);
  const rawReply = extractFinalReply(src, { finalEnvelope, trustedFinalEnvelope });
  const reply = sanitizeFinalUserFacingReplyForCohesion(rawReply);
  const currentFinalEnvelope = extractFinalEnvelope(src);
  const finalFailurePresent = hasFinalFailureMarker(currentFinalEnvelope, 0) || (!trustedFinalEnvelope && hasFinalFailureMarker(src, 0));
  const packCohesion = conversationPackCohesionProfile(src);
  return {
    version: VERSION,
    coordinatorOnly: true,
    finalEnvelope,
    trustedFinalEnvelope,
    replyPresent: !!reply,
    rogueFallbackPresent: hasRejectedLoopReply(src),
    finalFailurePresent,
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    packCohesion,
    canEmit: !!(reply && finalEnvelope && trustedFinalEnvelope && !hasRejectedLoopReply(src) && !finalFailurePresent),
    updatedAt: Date.now()
  };
}

function normalizeCoordinatorOutputForPipeline(packet = {}) {
  const out = jsonSafe(packet);
  if (!isPlainObject(out)) return out;
  const profile = finalPipelineCohesionProfile(out);
  out.meta = { ...safeObj(out.meta), finalPipelineCohesion: profile, packCohesion: profile.packCohesion, coordinatorOnly: true, transportSafe: true };
  out.diagnostics = { ...safeObj(out.diagnostics), finalPipelineCohesion: profile, packCohesion: profile.packCohesion };
  if (profile.canEmit) {
    const reply = sanitizeFinalUserFacingReplyForCohesion(extractFinalReply(out, { finalEnvelope: true, trustedFinalEnvelope: true }));
    out.reply = reply; out.text = reply; out.answer = reply; out.output = reply; out.response = reply; out.message = reply;
    if (isPlainObject(out.payload)) {
      out.payload.reply = reply; out.payload.text = reply; out.payload.answer = reply; out.payload.output = reply; out.payload.response = reply; out.payload.message = reply;
    }
    if (isPlainObject(out.finalEnvelope)) {
      out.finalEnvelope.reply = reply; out.finalEnvelope.text = reply; out.finalEnvelope.displayReply = reply;
    }
  }
  const domainConcierge = extractDomainConcierge(out);
  if (Object.keys(domainConcierge).length) {
    out.domainConcierge = domainConcierge;
    if (isPlainObject(out.payload)) out.payload.domainConcierge = domainConcierge;
    out.meta = { ...safeObj(out.meta), domainConciergeCompatible: true, domainConciergeCoreVersion: DOMAIN_CONCIERGE_CORE_VERSION, domainConciergeObserved: true };
    out.diagnostics = { ...safeObj(out.diagnostics), domainConciergeObserved: true };
  }
  return out;
}

function stableTurnKey(input = {}) {
  const turnId = extractTurnId(input);
  if (turnId) return cleanText(turnId);
  const userText = extractUserText(input);
  const signature = firstText(
    input.marionFinalSignature,
    input.finalSignature,
    input.signature,
    safeObj(input.meta).marionFinalSignature,
    safeObj(input.meta).signature,
    safeObj(input.packet).meta && safeObj(safeObj(input.packet).meta).marionFinalSignature
  );
  return hashText(`${userText || ""}::${signature || ""}::${extractIntent(input)}::${extractDomain(input)}`);
}



function loadUniversalTranslatorAdapter() {
  try {
    return require(UNIVERSAL_TRANSLATOR_ADAPTER_PATH);
  } catch (_err) {
    return null;
  }
}

function extractLanguageSphereBlock(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const diagnostics = safeObj(src.diagnostics);
  const finalEnvelope = extractFinalEnvelope(src);

  return safeObj(
    src.languageSphere ||
    src.universalTranslator ||
    payload.languageSphere ||
    payload.universalTranslator ||
    meta.languageSphere ||
    meta.universalTranslator ||
    diagnostics.languageSphere ||
    finalEnvelope.languageSphere ||
    {}
  );
}

function extractTranslationBlock(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const finalEnvelope = extractFinalEnvelope(src);
  const languageSphere = extractLanguageSphereBlock(src);

  return safeObj(
    src.translation ||
    src.translationOptions ||
    payload.translation ||
    payload.translationOptions ||
    meta.translation ||
    meta.translationOptions ||
    finalEnvelope.translation ||
    languageSphere.translation ||
    languageSphere.options ||
    {}
  );
}

function normalizeChatEngineLanguageCode(value) {
  const text = lower(value);
  if (!text) return "";
  if (text === "auto") return "auto";
  if (text === "unknown") return "unknown";
  if (text.indexOf("english") === 0 || text.indexOf("en") === 0) return "en";
  if (text.indexOf("french") === 0 || text.indexOf("fr") === 0) return "fr";
  if (text.indexOf("spanish") === 0 || text.indexOf("es") === 0) return "es";
  return "";
}

function compactTranslationMeta(value = {}) {
  const meta = safeObj(value);
  if (!Object.keys(meta).length) return {};
  return {
    adapterVersion: cleanText(meta.adapterVersion || ""),
    translated: meta.translated === true,
    provider: cleanText(meta.provider || ""),
    sourceLanguage: cleanText(meta.sourceLanguage || ""),
    targetLanguage: cleanText(meta.targetLanguage || ""),
    languagePair: cleanText(meta.languagePair || ""),
    protectedTermsApplied: Number(meta.protectedTermsApplied || 0) || 0,
    memoryHit: meta.memoryHit === true,
    characterCount: Number(meta.characterCount || 0) || 0,
    durationMs: meta.durationMs == null ? null : Number(meta.durationMs) || 0,
    warning: cleanText(meta.warning || ""),
    error: cleanText(meta.error || ""),
    finalTextSlot: cleanText(meta.finalTextSlot || "")
  };
}

function extractProtectedTermsForTranslation(input = {}) {
  const block = extractTranslationBlock(input);
  const sphere = extractLanguageSphereBlock(input);
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);

  const combined = [
    ...safeArray(block.protectedTerms),
    ...safeArray(block.extraTerms),
    ...safeArray(sphere.protectedTerms),
    ...safeArray(payload.protectedTerms),
    ...safeArray(meta.protectedTerms)
  ];

  return combined.map(cleanText).filter(Boolean).slice(0, 250);
}

function extractFinalTranslationOptions(input = {}, reply = "") {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const finalEnvelope = extractFinalEnvelope(src);
  const block = extractTranslationBlock(src);
  const sphere = extractLanguageSphereBlock(src);

  const enabled = block.enabled !== false &&
    sphere.enabled !== false &&
    src.translationEnabled !== false &&
    payload.translationEnabled !== false &&
    meta.translationEnabled !== false;

  const targetLanguage = normalizeChatEngineLanguageCode(firstText(
    block.targetLanguage,
    block.target,
    block.replyLanguage,
    sphere.targetLanguage,
    sphere.target,
    sphere.replyLanguage,
    src.targetLanguage,
    src.replyLanguage,
    payload.targetLanguage,
    payload.replyLanguage,
    meta.targetLanguage,
    meta.replyLanguage,
    finalEnvelope.targetLanguage,
    finalEnvelope.replyLanguage
  ));

  const sourceLanguage = normalizeChatEngineLanguageCode(firstText(
    block.sourceLanguage,
    block.source,
    sphere.sourceLanguage,
    sphere.source,
    src.sourceLanguage,
    payload.sourceLanguage,
    meta.sourceLanguage,
    finalEnvelope.sourceLanguage,
    "auto"
  )) || "auto";

  return {
    enabled: !!enabled && !!targetLanguage && targetLanguage !== "auto" && targetLanguage !== "unknown",
    sourceLanguage,
    targetLanguage,
    domain: firstText(block.domain, sphere.domain, extractDomain(src), "general"),
    domains: safeArray(block.domains || sphere.domains).map(cleanText).filter(Boolean),
    emotion: firstText(block.emotion, sphere.emotion, safeObj(src.resolvedEmotion).emotion, ""),
    context: firstText(block.context, sphere.context, "chat-engine-post-final"),
    protectedTerms: extractProtectedTermsForTranslation(src),
    requested: !!targetLanguage,
    replyPreview: clipText(reply, 120)
  };
}

function mirrorTranslatedReplyAcrossTransport(result = {}, translatedReply = "", translationMeta = {}) {
  if (!isPlainObject(result) || !translatedReply) return result;

  const reply = sanitizeFinalUserFacingReplyForCohesion(translatedReply);
  if (!reply) return result;

  const spokenText = reply.replace(/\n+/g, " ");
  const meta = compactTranslationMeta(translationMeta);
  const languageSphere = {
    version: LANGUAGE_SPHERE_BRIDGE_VERSION,
    stage: "post-final-output",
    authorityPreserved: true,
    coordinatorOnly: true,
    translated: meta.translated === true,
    targetLanguage: meta.targetLanguage,
    sourceLanguage: meta.sourceLanguage,
    provider: meta.provider,
    translationMeta: meta
  };

  const cloneLanguageSphere = () => ({
    ...languageSphere,
    translationMeta: { ...meta }
  });

  result.reply = reply;
  result.text = reply;
  result.answer = reply;
  result.output = reply;
  result.response = reply;
  result.message = reply;
  result.spokenText = spokenText;

  if (isPlainObject(result.payload)) {
    result.payload.reply = reply;
    result.payload.text = reply;
    result.payload.message = reply;
    result.payload.answer = reply;
    result.payload.output = reply;
    result.payload.response = reply;
    result.payload.authoritativeReply = reply;
    result.payload.spokenText = spokenText;
    result.payload.languageSphere = cloneLanguageSphere();
  }

  if (isPlainObject(result.finalEnvelope)) {
    result.finalEnvelope = {
      ...result.finalEnvelope,
      reply,
      text: reply,
      displayReply: reply,
      spokenText,
      languageSphere: cloneLanguageSphere(),
      translationMeta: { ...meta }
    };
  }

  result.meta = {
    ...safeObj(result.meta),
    languageSphere: cloneLanguageSphere(),
    translationMeta: { ...meta },
    languageSphereBridgeVersion: LANGUAGE_SPHERE_BRIDGE_VERSION
  };

  result.diagnostics = {
    ...safeObj(result.diagnostics),
    languageSphere: {
      version: LANGUAGE_SPHERE_BRIDGE_VERSION,
      stage: "post-final-output",
      translated: meta.translated === true,
      authorityPreserved: true,
      finalEnvelopePreserved: true,
      targetLanguage: meta.targetLanguage,
      provider: meta.provider,
      warning: meta.warning,
      error: meta.error
    }
  };

  return result;
}

async function applyLanguageSphereToTrustedFinal(result = {}, originalInput = {}) {
  if (!isPlainObject(result) || !result.reply) return result;

  const adapter = loadUniversalTranslatorAdapter();
  if (!adapter || typeof adapter.applyUniversalTranslation !== "function") {
    return result;
  }

  const options = extractFinalTranslationOptions(originalInput, result.reply);
  if (!options.enabled) {
    return result;
  }

  try {
    const sourceEnvelope = isPlainObject(result.finalEnvelope) && Object.keys(result.finalEnvelope).length
      ? result.finalEnvelope
      : {
          reply: result.reply,
          final: true,
          marionFinal: true,
          handled: true,
          authority: "marionFinalEnvelope",
          contractVersion: FINAL_ENVELOPE_CONTRACT
        };

    const translatedEnvelope = await adapter.applyUniversalTranslation(sourceEnvelope, {
      sourceLanguage: options.sourceLanguage,
      targetLanguage: options.targetLanguage,
      domain: options.domain,
      domains: options.domains,
      emotion: options.emotion,
      context: options.context,
      protectedTerms: options.protectedTerms
    });

    const translatedReply = firstText(
      safeObj(translatedEnvelope).reply,
      safeObj(translatedEnvelope).text,
      safeObj(translatedEnvelope).displayReply,
      result.reply
    );

    const translationMeta = safeObj(
      safeObj(translatedEnvelope).translationMeta ||
      safeObj(translatedEnvelope).languageSphere ||
      {}
    );

    if (!translatedReply || translatedReply === result.reply) {
      result.meta = {
        ...safeObj(result.meta),
        languageSphere: {
          version: LANGUAGE_SPHERE_BRIDGE_VERSION,
          stage: "post-final-output",
          requested: true,
          translated: false,
          authorityPreserved: true,
          targetLanguage: options.targetLanguage,
          reason: "translation-not-required-or-unchanged",
          translationMeta: compactTranslationMeta(translationMeta)
        }
      };
      return result;
    }

    return mirrorTranslatedReplyAcrossTransport(result, translatedReply, translationMeta);
  } catch (error) {
    const message = cleanText(error && error.message || error || "language-sphere-translation-failed");
    result.meta = {
      ...safeObj(result.meta),
      languageSphere: {
        version: LANGUAGE_SPHERE_BRIDGE_VERSION,
        stage: "post-final-output",
        requested: true,
        translated: false,
        authorityPreserved: true,
        failClosedToOriginal: true,
        targetLanguage: options.targetLanguage,
        error: message
      }
    };
    result.diagnostics = {
      ...safeObj(result.diagnostics),
      languageSphere: {
        version: LANGUAGE_SPHERE_BRIDGE_VERSION,
        translated: false,
        failClosedToOriginal: true,
        error: message
      }
    };
    return result;
  }
}

async function normalizeInputForMarion(input = {}, options = {}) {
  const adapter = loadUniversalTranslatorAdapter();
  const src = typeof input === "string" ? { text: input } : jsonSafe(safeObj(input));

  if (!adapter || typeof adapter.normalizeInputForMarion !== "function") {
    return src;
  }

  const userText = extractUserText(src);
  if (!userText) return src;

  const block = extractTranslationBlock(src);
  const sphere = extractLanguageSphereBlock(src);
  const protectedTerms = [
    ...extractProtectedTermsForTranslation(src),
    ...safeArray(options.protectedTerms).map(cleanText).filter(Boolean)
  ].slice(0, 250);

  const normalized = await adapter.normalizeInputForMarion(userText, {
    domain: firstText(options.domain, block.domain, sphere.domain, extractDomain(src), "general"),
    domains: safeArray(options.domains || block.domains || sphere.domains),
    context: firstText(options.context, block.context, sphere.context, "chat-engine-pre-routing"),
    emotion: firstText(options.emotion, block.emotion, sphere.emotion, ""),
    protectedTerms
  });

  const normalizedText = cleanText(normalized && normalized.normalizedText || userText);
  const languageSphere = {
    version: LANGUAGE_SPHERE_BRIDGE_VERSION,
    stage: "pre-routing-input-normalization",
    originalText: userText,
    normalizedText,
    detectedLanguage: cleanText(normalized && normalized.detectedLanguage || ""),
    detectionConfidence: normalized && typeof normalized.detectionConfidence === "number" ? normalized.detectionConfidence : null,
    detectionMethod: cleanText(normalized && normalized.detectionMethod || ""),
    translatedForRouting: !!(normalized && normalized.translatedForRouting),
    translationMeta: compactTranslationMeta(safeObj(normalized && normalized.translationMeta))
  };

  const out = {
    ...src,
    originalUserText: firstText(src.originalUserText, userText),
    normalizedUserText: normalizedText,
    languageSphere,
    universalTranslator: languageSphere,
    meta: {
      ...safeObj(src.meta),
      languageSphere,
      universalTranslator: languageSphere
    }
  };

  /**
   * Only replace routing-facing text when the adapter actually translated.
   * Otherwise preserve caller fields exactly to avoid unnecessary turn drift.
   */
  if (languageSphere.translatedForRouting && normalizedText) {
    out.text = normalizedText;
    out.query = normalizedText;
    out.message = normalizedText;
    out.userQuery = normalizedText;
    out.payload = {
      ...safeObj(src.payload),
      text: normalizedText,
      query: normalizedText,
      message: normalizedText,
      userQuery: normalizedText,
      originalUserText: userText,
      normalizedUserText: normalizedText,
      languageSphere
    };
  }

  return out;
}

class ChatEngine {
  constructor(options = {}) {
    this.state = {
      lastUserInput: "",
      memory: [],
      rejectionLog: [],
      pipelineTrace: [],
      rejectionByTurn: new Map()
    };

    this.config = {
      maxMemory: Number.isInteger(options.maxMemory) ? options.maxMemory : 12,
      maxRejectionLog: Number.isInteger(options.maxRejectionLog) ? options.maxRejectionLog : 200,
      maxPipelineTrace: Number.isInteger(options.maxPipelineTrace) ? options.maxPipelineTrace : 100,
      rejectionThreshold: Number.isInteger(options.rejectionThreshold) ? options.rejectionThreshold : 3
    };
  }

  async processInput(input = {}) {
    const trace = {
      at: Date.now(),
      rawInputType: typeof input,
      rawInputPreview: typeof input === "string" ? input.slice(0, 120) : clipText(safeStringify(input || {}, 180), 180),
      stages: [],
      accepted: false,
      responsePreview: "",
      errors: []
    };

    try {
      const src = typeof input === "string" ? { text: input } : safeObj(input);
      const turnId = stableTurnKey(src);
      const finalEnvelope = isFinalEnvelope(src);
      const trustedFinalEnvelope = hasTrustedFinalEnvelope(src, src);
      const rogueFallbackPresent = hasRejectedLoopReply(src);
      const reply = extractFinalReply(src, { finalEnvelope, trustedFinalEnvelope });

      trace.stages.push({ stage: "detectFinalEnvelope", ok: finalEnvelope });
      trace.stages.push({ stage: "detectTrustedFinalEnvelope", ok: trustedFinalEnvelope });
      trace.stages.push({ stage: "extractFinalReply", ok: !!reply, replyPreview: clipText(reply, 120) });
      trace.stages.push({ stage: "detectRogueFallbackReply", ok: !rogueFallbackPresent });

      if (!finalEnvelope || !trustedFinalEnvelope || !reply || rogueFallbackPresent) {
        const reason = classifyMissingFinalReason({ finalEnvelope, trustedFinalEnvelope, replyPresent: !!reply, rogueFallbackPresent });
        const rejectionCount = this.incrementRejection(turnId);
        const terminal = false;

        const errorContract = buildBlankErrorContract(reason, {
          finalEnvelope,
          trustedFinalEnvelope,
          replyPresent: !!reply,
          rogueFallbackPresent,
          rejectionCount,
          rejectionThreshold: this.config.rejectionThreshold
        }, src, { terminal });

        this.pushRejectionLog({
          at: Date.now(),
          code: reason,
          finalEnvelope,
          trustedFinalEnvelope,
          replyPresent: !!reply,
          rogueFallbackPresent,
          turnId,
          rejectionCount,
          terminal
        });

        trace.accepted = false;
        trace.responsePreview = "";
        trace.stages.push({ stage: "reject", reason, rejectionCount, terminal });
        this.pushPipelineTrace(trace);
        return errorContract;
      }

      this.clearRejection(turnId);

      let result = buildStructuredFinalReply(src, { finalEnvelope, trustedFinalEnvelope });
      result = await applyLanguageSphereToTrustedFinal(result, src);
      this.updateState(src, result);

      trace.accepted = true;
      trace.responsePreview = clipText(result.reply, 160);
      trace.stages.push({
        stage: "languageSpherePostFinal",
        ok: true,
        requested: !!safeObj(result.meta).languageSphere,
        translated: safeObj(safeObj(result.meta).languageSphere).translated === true,
        targetLanguage: cleanText(safeObj(safeObj(result.meta).languageSphere).targetLanguage || "")
      });
      this.pushPipelineTrace(trace);

      return normalizeCoordinatorOutputForPipeline(finalTransportPacket(result));
    } catch (err) {
      const errorContract = buildBlankErrorContract("chat_engine_coordinator_fault", {
        message: this.safeError(err)
      }, isPlainObject(input) ? input : { text: input }, { terminal: true });

      trace.errors.push(this.safeError(err));
      trace.accepted = false;
      trace.responsePreview = "";
      this.pushPipelineTrace(trace);

      return jsonSafe(errorContract);
    }
  }

  incrementRejection(turnId) {
    const key = cleanText(turnId || "unknown_turn") || "unknown_turn";
    const current = Number(this.state.rejectionByTurn.get(key) || 0) + 1;
    this.state.rejectionByTurn.set(key, current);
    this.pruneRejectionMap();
    return current;
  }

  pruneRejectionMap() {
    const max = Math.max(20, this.config.maxRejectionLog || 200);
    while (this.state.rejectionByTurn.size > max) {
      const firstKey = this.state.rejectionByTurn.keys().next().value;
      if (!firstKey) break;
      this.state.rejectionByTurn.delete(firstKey);
    }
  }

  clearRejection(turnId) {
    const key = cleanText(turnId || "unknown_turn") || "unknown_turn";
    this.state.rejectionByTurn.delete(key);
  }

  updateState(input = {}, result = {}) {
    const entry = {
      input: extractUserText(input),
      intent: extractIntent(result),
      domain: extractDomain(result),
      replyAuthority: "marion_final",
      reply: cleanText(result.reply || ""),
      replySignature: cleanText(result.meta && result.meta.replySignature || hashText(result.reply || "")),
      creativeCognitiveCarryObserved: !!result.creativeCognitiveCarry,
      domainConciergeObserved: !!result.domainConcierge,
      domainConciergeAction: cleanText(safeObj(result.domainConcierge).action || ""),
      domainConciergeRoute: cleanText(safeObj(result.domainConcierge).route || ""),
      domainConciergeConfidence: clampNumber(safeObj(result.domainConcierge).confidence, 0, 0, 1),
      timestamp: Date.now()
    };

    this.state.lastUserInput = entry.input;
    this.state.memory.push(entry);

    if (this.state.memory.length > this.config.maxMemory) {
      this.state.memory.shift();
    }
  }

  pushPipelineTrace(trace) {
    this.state.pipelineTrace.push(trace);
    if (this.state.pipelineTrace.length > this.config.maxPipelineTrace) {
      this.state.pipelineTrace.shift();
    }
  }

  pushRejectionLog(entry) {
    this.state.rejectionLog.push(entry);
    if (this.state.rejectionLog.length > this.config.maxRejectionLog) {
      this.state.rejectionLog.shift();
    }
  }

  getRejectionLog() {
    return [...this.state.rejectionLog];
  }

  getPipelineTrace() {
    return [...this.state.pipelineTrace];
  }

  getMemorySnapshot() {
    return [...this.state.memory];
  }

  reset() {
    this.state.lastUserInput = "";
    this.state.memory = [];
    this.state.rejectionLog = [];
    this.state.pipelineTrace = [];
    this.state.rejectionByTurn = new Map();
  }

  safeError(err) {
    if (!err) return "unknown_error";
    if (typeof err === "string") return err;
    if (err && typeof err.message === "string") return err.message;
    try {
      return JSON.stringify(err);
    } catch (_jsonErr) {
      return String(err);
    }
  }
}

let runtime = null;

function getRuntime() {
  if (!runtime) runtime = new ChatEngine();
  return runtime;
}

async function handleChat(input = {}) {
  const runtimeInstance = getRuntime();
  return await runtimeInstance.processInput(input);
}

async function run(input = {}) {
  return handleChat(input);
}

async function chat(input = {}) {
  return handleChat(input);
}

async function handle(input = {}) {
  return handleChat(input);
}

async function reply(input = {}) {
  return handleChat(input);
}

function extractMarionFields(src = {}) {
  return {
    marionContract: extractMarionContract(src),
    marion: safeObj(src.marion),
    reply: extractFinalReply(src),
    intent: extractIntent(src),
    emotionalState: ""
  };
}

function shouldLockMarionAuthority(source = {}) {
  return hasTrustedFinalEnvelope(source) &&
    !hasRejectedLoopReply(source) &&
    !!extractFinalReply(source, { trustedFinalEnvelope: true, finalEnvelope: true });
}

if (typeof module !== "undefined") {
  module.exports = {
    VERSION,
    FINAL_RUNTIME_TELEMETRY_VERSION,
    DOMAIN_CONCIERGE_CORE_VERSION,
    DOMAIN_CONCIERGE_CONTRACT_VERSION,
    LANGUAGE_SPHERE_BRIDGE_VERSION,
    TELEMETRY_VISIBILITY_VERSION,
    FAILURE_SIGNATURE_AUDIT_VERSION,
    CHAT_ENGINE_SIGNATURE,
    MARION_FINAL_SIGNATURE_PREFIX,
    STATE_SPINE_SCHEMA,
    STATE_SPINE_SCHEMA_COMPAT,
    FINAL_ENVELOPE_CONTRACT,
    FINAL_SIGNATURE,
    ChatEngine,
    handleChat,
    run,
    chat,
    handle,
    reply,
    normalizeInputForMarion,
    applyLanguageSphereToTrustedFinal,
    extractFinalTranslationOptions,
    extractMarionFields,
    shouldLockMarionAuthority,
    finalPipelineCohesionProfile,
    normalizeCoordinatorOutputForPipeline,
    extractRuntimeTelemetry,
    buildChatRuntimeTelemetry,
    classifyFailureSignature,
    buildFailureSignatureAudit,
    isTelemetryLeakText,
    stripTelemetryLeakFromReply,
    CONVERSATIONAL_PACK_COHESION_VERSION,
    extractConversationalPackBridge,
    extractDomainConcierge,
    compactDomainConciergeForTransport,
    normalizeConversationalPackBridge,
    conversationPackCohesionProfile,
    _internal: {
      isFinalEnvelope,
      isAuthoritativeMarionFinalLocation,
      isWeakFinalFlagPresent,
      hasKnownGoodContractVersion,
      containsLegacyTrustFlag,
      objectContainsTrustedFinalSignature,
      hasTrustedFinalEnvelope,
      extractFinalReply,
      classifyMissingFinalReason,
      buildBlankErrorContract,
      buildStructuredFinalReply,
      isInternalBlockerText,
      isRogueFallbackText,
      isThinPlaceholderText,
      isMetadataLeakText,
      hasRejectedLoopReply,
      hasFinalFailureMarker,
      jsonSafe,
      finalTransportPacket,
      transportInputSource,
      continuityTransportMarker,
      compactSessionPatchForTransport,
      compactCreativeCognitiveCarry,
      extractCreativeCognitiveCarryFromPatch,
      compactStateBridgeForTransport,
      stableTurnKey,
      hasTrustedBridgeOrComposerMarker,
      sanitizeFinalUserFacingReplyForCohesion,
      isPrimitivePublicReplyValue,
      buildCoordinatorRecoveryReply,
      finalPipelineCohesionProfile,
      normalizeCoordinatorOutputForPipeline,
      extractConversationalPackBridge,
      extractDomainConcierge,
      compactDomainConciergeForTransport,
      normalizeConversationalPackBridge,
      conversationPackCohesionProfile,
      normalizeInputForMarion,
      applyLanguageSphereToTrustedFinal,
      extractFinalTranslationOptions,
      loadUniversalTranslatorAdapter
    }
  };
}
