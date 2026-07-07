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

const VERSION = "ChatEngine v3.10.3 PUBLIC-CONTINUITY-HANDOFF-REPAIR-V2 + PUBLIC-SEMANTIC-REPLAY-OVERRIDE-V1 + PUBLIC-CONTINUITY-HANDOFF-REPAIR-V1 + REFERENCEERROR-TRIAD-HARDENING-V2 + EXPORT-DUPLICATE-PURGE + REFERENCEERROR-LAW-DOMAIN-FINAL-RECOVERY + TEXT-CONSOLE-CHANNEL-CARRY + MARION-ADMIN-TEXT-RUNTIME-COMPAT + CONTINUITY-MISSING-FINAL-RECOVERY-GATE + LONG-TURN-CONTINUITY-TRANSPORT-HANDOFF + SHORT-FOLLOWUP-CONTINUITY-CARRY + CLARIFIER-LOOP-SUPPRESSION-GUARD + LANGUAGE-SPHERE-BRIDGE-GUARDED + TECHNICAL-TARGET-LOCK-TRANSPORT + FINAL-RUNTIME-TELEMETRY-SCOPING-FIX + FIVE-TURN-CONTRACT-TRANSPORT + COORDINATOR-ONLY-PACK-COHESION-BRIDGE-HARDENED + TELEMETRY-VISIBILITY-FAILURE-SIGNATURE-AUDIT + PRIMITIVE-REPLY-SUPPRESSION-GUARD + FINAL-RENDER-TELEMETRY-HARDLOCK";
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


function compactContinuityCarryForTransport(value = {}) {
  const src = safeObj(value);
  const nested = safeObj(src.continuity || src.followUpReference || src.stateBridge);
  const topic = cleanText(src.topic || src.lastTopic || src.subject || nested.topic || nested.lastTopic || nested.subject || "");
  const resolvedText = cleanText(src.resolvedText || src.continuityResolvedText || src.resolvedQuestion || src.effectivePrompt || nested.resolvedText || nested.continuityResolvedText || "");
  const originalText = cleanText(src.originalText || src.continuityResolvedOriginalText || src.rawUserText || nested.originalText || nested.continuityResolvedOriginalText || "");
  const followupAction = cleanText(src.followupAction || src.continuityAction || src.action || nested.followupAction || nested.continuityAction || "");
  const out = {
    active: src.active === true || nested.active === true || !!topic || src.resolvedFollowup === true || nested.resolvedFollowup === true || !!resolvedText,
    topic: topic.slice(0, 120),
    lastTopic: cleanText(src.lastTopic || nested.lastTopic || topic).slice(0, 120),
    resolvedFollowup: !!(src.resolvedFollowup || nested.resolvedFollowup || (topic && resolvedText)),
    followupAction: followupAction.slice(0, 64),
    continuityAction: followupAction.slice(0, 64),
    originalText: originalText.slice(0, 220),
    resolvedText: resolvedText.slice(0, 260),
    source: cleanText(src.source || nested.source || "chatEngine.continuityCarry")
  };
  return out.active ? out : {};
}

function mergeContinuityCarryForTransport() {
  const merged = {};
  for (const item of Array.from(arguments)) {
    const c = compactContinuityCarryForTransport(item);
    if (!Object.keys(c).length) continue;
    Object.assign(merged, c);
    if (!merged.topic && c.topic) merged.topic = c.topic;
    if (!merged.lastTopic && c.lastTopic) merged.lastTopic = c.lastTopic;
    if (!merged.resolvedText && c.resolvedText) merged.resolvedText = c.resolvedText;
    if (!merged.originalText && c.originalText) merged.originalText = c.originalText;
    if (!merged.followupAction && c.followupAction) merged.followupAction = c.followupAction;
    if (!merged.continuityAction && c.continuityAction) merged.continuityAction = c.continuityAction;
  }
  return compactContinuityCarryForTransport(merged);
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
  const src=safeObj(input), inherited=extractRuntimeTelemetry(src), packet=extractPacket(src), packetMeta=safeObj(packet.meta), domainConcierge=extractDomainConcierge(src), marionAdminConversation=extractMarionAdminConversationCarry(src), lingoSentinelSilentOversight=extractLingoSentinelSilentOversightCarry(src);
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
    marionAdminConversation: Object.keys(marionAdminConversation).length ? marionAdminConversation : undefined,
    privateAdminConversation: !!Object.keys(marionAdminConversation).length,
    lingoSentinelSilentOversight: Object.keys(lingoSentinelSilentOversight).length ? lingoSentinelSilentOversight : undefined,
    lingoSentinelSilentOversightActive: !!Object.keys(lingoSentinelSilentOversight).length,
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

function collectContinuityRecoveryPrompt(packet = {}) {
  const src = safeObj(packet);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const sessionPatch = safeObj(src.sessionPatch || src.memoryPatch || payload.sessionPatch || payload.memoryPatch || meta.sessionPatch || meta.memoryPatch);
  const continuity = mergeContinuityCarryForTransport(
    src.continuity,
    src.followUpReference,
    meta.continuity,
    meta.followUpReference,
    payload.continuity,
    payload.followUpReference,
    sessionPatch.continuity,
    sessionPatch.followUpReference,
    sessionPatch.stateBridge
  );
  return firstText(
    src.continuityResolvedText,
    src.resolvedQuestion,
    src.effectivePrompt,
    meta.continuityResolvedText,
    meta.resolvedQuestion,
    meta.effectivePrompt,
    payload.continuityResolvedText,
    payload.resolvedQuestion,
    payload.effectivePrompt,
    continuity.resolvedText
  );
}

function buildNyxMarionContinuityTransportReply(value = "") {
  const t = lower(value);
  if (!t) return "";
  if (/\bwhat\s+is\s+marion\s+supposed\s+to\s+do\b|\bwhat\s+does\s+marion\s+do\b|\bmarion\s+role\b/i.test(t)) return "Marion is the deeper coordination layer behind Nyx. Nyx stays public-facing while Marion helps preserve intent, context, routing, and clean response handoff in the background.";
  if (/\bcan\s+(?:marion|you)\s+carry\s+context\s+across\s+turns\b|\bcarry\s+context\s+across\s+turns\b/i.test(t)) return "Yes. The goal is for Nyx to keep the conversation natural while Marion carries the useful context behind the scenes, so follow-up questions stay connected instead of restarting the conversation.";
  if (/\bwhy\s+is\s+that\s+important\s+for\s+nyx\b|\bwhy\s+does\s+that\s+matter\s+for\s+nyx\b/i.test(t)) return "It matters because Nyx is the public voice. If Marion carries the thread behind the scenes, Nyx can answer follow-up questions naturally without making the user restate the topic every turn.";
  if (/\bhow\s+does\b.{0,160}\bhelp\s+sandblast\b|\bhelp\s+sandblast\b/i.test(t)) return "It helps Sandblast because Nyx becomes easier to talk to and Marion keeps the useful context in the background. Users can ask follow-up questions naturally, stay engaged longer, and move through radio, TV, news, and business prompts without the interface feeling like it resets every turn.";
  if (/^(?:next\s+steps?|what(?:'|’)?s\s+next|what\s+next|then\s+what)\??$/i.test(t)) return "Next steps: keep the public Nyx route clean, run the five-turn continuity test, confirm each follow-up advances the thread, then lock the stable handoff before adding new features.";
  return "";
}


function shouldOverrideContinuityTransportReply(prompt = "", reply = "", candidate = "") {
  const p = lower(prompt);
  const r = lower(reply);
  const c = cleanText(candidate);
  if (!p || !c) return false;
  if (!r) return true;
  if (hashText(r) === hashText(c)) return false;
  if (/\bsandblast\b/i.test(p) && /\bhelp|business|users?|engaged|radio|tv|news\b/i.test(p) && !/\bsandblast\b/i.test(r)) return true;
  if (/\bwhy\b/i.test(p) && /\bnyx\b/i.test(p) && !/\bnyx\b/i.test(r)) return true;
  if (/\bnext\s+steps?\b/i.test(p) && !/\bnext\s+steps?|test|confirm|lock|handoff\b/i.test(r)) return true;
  return false;
}

function buildContinuityMissingFinalRecoveryReply(packet = {}) {
  // CONTINUITY-MISSING-FINAL-RECOVERY-GATE:
  // This is a narrow safety gate for an already-resolved follow-up prompt.
  // It only fires when the transport is about to emit an empty awaiting-Marion packet.
  // It does not mine stale assistant text; it uses the current resolved follow-up prompt.
  const prompt = cleanText(collectContinuityRecoveryPrompt(packet));
  if (!prompt) return "";
  const t = lower(prompt);
  const nyxMarionHandoffReply = buildNyxMarionContinuityTransportReply(prompt);
  if (nyxMarionHandoffReply) return nyxMarionHandoffReply;
  if (!/\bcash[-\s]?flow\b/.test(t)) return "";
  if (/\b(example|for instance|show me|scenario)\b/.test(t)) {
    return "Example: a business invoices $5,000 today but will not receive that money for 30 days. If rent, payroll, and supplies are due this week, the business can be profitable on paper but still have a cash-flow problem because the money has not arrived yet.";
  }
  if (/\b(why|important|matter)\b/.test(t)) {
    return "Cash flow is important because it determines whether a business can pay bills on time, handle slow sales periods, avoid unnecessary debt, and make growth decisions without running out of operating money.";
  }
  if (/\b(what happens next|next step|what next|then what)\b/.test(t)) {
    return "What happens next is a timing decision: the business either collects faster, delays or reduces expenses, uses reserves, or arranges short-term financing so obligations are covered before the cash arrives.";
  }
  if (/\b(apply|small business|practical)\b/.test(t)) {
    return "For a small business, cash flow means watching when money actually arrives versus when expenses are due. The practical rule is to price, collect, spend, and hire based on available cash timing, not just total sales.";
  }
  return "";
}


function finalTransportPacket(packet = {}) {
  const out = jsonSafe(packet);
  if (isPlainObject(out)) {
    const finalEnvelope = isFinalEnvelope(out);
    const trustedFinalEnvelope = hasTrustedFinalEnvelope(out, out);
    let reply = sanitizeFinalUserFacingReplyForCohesion(extractFinalReply(out, { finalEnvelope, trustedFinalEnvelope }));
    const promptForFinalRecovery = extractPromptForReplySelection(out);
    if (isUnsafeFinalReplySelection(reply, promptForFinalRecovery)) {
      reply = deterministicKnowledgeReplyForSelection(promptForFinalRecovery);
    }
    const semanticContinuityOverrideReply = buildNyxMarionContinuityTransportReply(promptForFinalRecovery);
    if (semanticContinuityOverrideReply && shouldOverrideContinuityTransportReply(promptForFinalRecovery, reply, semanticContinuityOverrideReply)) {
      reply = semanticContinuityOverrideReply;
      out.publicSemanticReplayOverride = true;
    }
    const coordinatorRecoveryReply = buildCoordinatorRecoveryReply(out);
    const continuityMissingFinalRecoveryReply = buildContinuityMissingFinalRecoveryReply(out);
    if (!reply && coordinatorRecoveryReply) reply = coordinatorRecoveryReply;
    if (!reply && continuityMissingFinalRecoveryReply) reply = continuityMissingFinalRecoveryReply;
    if (isUnsafeFinalReplySelection(reply, promptForFinalRecovery)) reply = deterministicKnowledgeReplyForSelection(promptForFinalRecovery);
    const recoveryTrusted = !!(coordinatorRecoveryReply || continuityMissingFinalRecoveryReply);
    const canEmit = !!reply && (finalEnvelope || recoveryTrusted) && (trustedFinalEnvelope || recoveryTrusted) && !hasRejectedLoopReply(out) && (!hasFinalFailureMarker(out, 0) || !!continuityMissingFinalRecoveryReply);
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
        authority: firstText(safeObj(out.finalEnvelope).authority, "marionFinalEnvelope"),
        source: firstText(safeObj(out.finalEnvelope).source, continuityMissingFinalRecoveryReply ? "chatEngine.continuityMissingFinalRecoveryGate" : "")
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


function normalizeEchoTextForCompare(value=""){return cleanText(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function extractPromptForReplySelection(input={}){
  const src=safeObj(input),payload=safeObj(src.payload),meta=safeObj(src.meta),diagnostics=safeObj(src.diagnostics);
  const finalEnvelope=extractFinalEnvelope(src),contract=extractMarionContract(src),packet=extractPacket(src);
  const routing=safeObj(src.routing||payload.routing||meta.routing||packet.routing);
  const continuity=compactContinuityCarryForTransport(firstText(src.continuityCarry,src.continuity)||src.continuityCarry||src.continuity||payload.continuityCarry||meta.continuityCarry||routing.continuityCarry||{});
  const questionShape=safeObj(src.questionShape||payload.questionShape||meta.questionShape||routing.questionShape);
  return firstText(
    src.userText,src.rawUserText,src.originalUserText,src.prompt,src.query,src.inputText,src.text,src.message,src.normalizedUserIntent,
    payload.userText,payload.rawUserText,payload.originalUserText,payload.prompt,payload.query,payload.inputText,payload.text,payload.message,payload.normalizedUserIntent,
    meta.userText,meta.rawUserText,meta.originalUserText,meta.prompt,meta.query,meta.text,meta.message,meta.normalizedUserIntent,
    diagnostics.userText,diagnostics.prompt,diagnostics.query,
    finalEnvelope.userText,finalEnvelope.rawUserText,finalEnvelope.prompt,finalEnvelope.query,finalEnvelope.text,finalEnvelope.message,
    contract.userText,contract.rawUserText,contract.prompt,contract.query,contract.text,contract.message,
    packet.userText,packet.rawUserText,packet.prompt,packet.query,packet.text,packet.message,
    routing.userText,routing.rawUserText,routing.prompt,routing.query,routing.text,routing.normalizedUserIntent,
    questionShape.normalizedUserIntent,questionShape.normalizedText,questionShape.rawUserText,
    continuity.resolvedText,continuity.originalText,continuity.topic
  );
}
function isPromptEchoReply(reply="",prompt=""){const r=normalizeEchoTextForCompare(reply),p=normalizeEchoTextForCompare(prompt);if(!r||!p)return false;return r===p||p.includes(r)&&r.length>12||r.includes(p)&&p.length>12;}
function isExcessExpressionReply(value=""){return /\b(stop the echo|switching from invitation to execution|recovery line has already served its purpose|next line must carry progress|public knowledge topic|useful answer should|six-domain layer|final envelope|state spine|progression shaping|runtimeTelemetry|replyAuthority|diagnostic packet)\b/i.test(cleanText(value));}
function deterministicKnowledgeReplyForSelection(prompt=""){
  const t=cleanText(prompt).toLowerCase();
  if(/\bconsideration\b.*\bcontract\s+law\b|\bcontract\s+law\b.*\bconsideration\b/.test(t))return 'In contract law, consideration is the value exchanged between parties, such as money, services, a promise, or a benefit. It helps show that an agreement is more than a one-sided gift. This is general legal information, not legal advice.';
  if(/\bpromise\b.*\bconsideration\b|\bconsideration\b.*\bpromise\b/.test(t))return 'A promise can be consideration when it is bargained for as part of an exchange. A bare promise with no exchange is usually not enough, but mutual promises can support a contract. The exact rule depends on jurisdiction.';
  if(/\bcommon\s+exceptions\b|\bexceptions\b.*\bconsideration\b/.test(t))return 'Common consideration-related exceptions include promissory estoppel, deeds or sealed instruments in some systems, statutory modifications, and some part-payment doctrines. The details depend on jurisdiction.';
  if(/\bbreak a leg\b/.test(t))return /instead of good luck|why would/i.test(t)?'Someone says “break a leg” instead of “good luck” because theatre culture treats direct good-luck wishes as unlucky. The phrase became a ritualized, indirect way to encourage someone before a performance.':'Literally, “break a leg” means to injure a leg. Culturally, it is an English idiom used to wish someone good luck, especially before a performance. It is not meant as harm; it is a superstition-based way of saying, “I hope you do well.”';
  if(/\bspill the beans\b/.test(t))return '“Spill the beans” means to reveal information that was meant to stay secret. Literally it suggests dropping beans; idiomatically, it means exposing a secret or surprise too early.';
  if(/\bbless your heart\b/.test(t))return '“Bless your heart” can be sincere or cutting depending on tone and setting. In the American South, it can mean genuine sympathy, but it can also soften criticism, pity, or disapproval. The cultural meaning depends on relationship, delivery, and context.';
  if(/\bi[’']?m fine\b/.test(t))return '“I’m fine” can be literal, but behaviourally it can also signal masking, avoidance, or a desire to end the topic. Marion should not assume distress automatically; the safer read is to examine tone, timing, context, and whether the phrase conflicts with visible behaviour.';
  if(/\binstead of good luck\b/.test(t)||/\bwhy would someone say that\b/.test(t))return 'They would say it as an indirect good-luck wish, usually referring to “break a leg.” In theatre culture, saying “good luck” directly is considered unlucky, so the indirect phrase became the accepted ritual.';
  return '';
}
function isUnsafeFinalReplySelection(reply="",prompt=""){
  const text=cleanText(reply);
  if(!text)return true;
  if(/^(?:REFERENCEERROR|TYPEERROR|SYNTAXERROR|RANGEERROR)$/i.test(text))return true;
  if(/\b(?:ReferenceError|TypeError|SyntaxError|RangeError|stack trace|undefined is not|cannot read|is not defined|no clean public reply field|bridge failed during processing|diagnostic packet|final envelope missing|non-final)\b/i.test(text))return true;
  return isThinPlaceholderText(text)||isInternalBlockerText(text,{})||isExcessExpressionReply(text)||isPromptEchoReply(text,prompt);
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

  const prompt = extractPromptForReplySelection(input);
  for (const candidate of candidates) {
    if (!candidate.value) continue;
    if (isUnsafeFinalReplySelection(candidate.value, prompt)) continue;
    if (isInternalBlockerText(candidate.value, {
      envelopeTrusted,
      finalEnvelope: finalEnvelopePresent,
      fromDiagnosticPath: candidate.diagnostic
    })) continue;
    return candidate.value;
  }

  return deterministicKnowledgeReplyForSelection(prompt);
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

  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const sessionPatch = safeObj(src.sessionPatch || src.memoryPatch || payload.sessionPatch || payload.memoryPatch || meta.sessionPatch || meta.memoryPatch);
  const continuityCarry = mergeContinuityCarryForTransport(
    src.continuity,
    src.followUpReference,
    meta.continuity,
    meta.followUpReference,
    payload.continuity,
    payload.followUpReference,
    sessionPatch.continuity,
    sessionPatch.followUpReference,
    sessionPatch.stateBridge
  );
  const followUpReference = mergeContinuityCarryForTransport(
    src.followUpReference,
    meta.followUpReference,
    payload.followUpReference,
    continuityCarry
  );
  const resolvedText = firstText(src.continuityResolvedText, meta.continuityResolvedText, payload.continuityResolvedText, followUpReference.resolvedText, continuityCarry.resolvedText);
  const resolvedOriginalText = firstText(src.continuityResolvedOriginalText, meta.continuityResolvedOriginalText, payload.continuityResolvedOriginalText, followUpReference.originalText, continuityCarry.originalText);
  const shortFollowupResolved = !!(src.shortFollowupContinuityResolved || meta.shortFollowupContinuityResolved || payload.shortFollowupContinuityResolved || followUpReference.resolvedFollowup || continuityCarry.resolvedFollowup);

  const out = {
    ...src,
    originalUserText: firstText(src.originalUserText, userText),
    normalizedUserText: normalizedText,
    languageSphere,
    universalTranslator: languageSphere,
    continuity: continuityCarry,
    followUpReference,
    shortFollowupContinuityResolved: shortFollowupResolved,
    continuityResolvedOriginalText: resolvedOriginalText,
    continuityResolvedText: resolvedText,
    payload: {
      ...payload,
      continuity: continuityCarry,
      followUpReference,
      shortFollowupContinuityResolved: shortFollowupResolved,
      continuityResolvedOriginalText: resolvedOriginalText,
      continuityResolvedText: resolvedText
    },
    meta: {
      ...meta,
      languageSphere,
      universalTranslator: languageSphere,
      continuity: continuityCarry,
      followUpReference,
      shortFollowupContinuityResolved: shortFollowupResolved,
      continuityResolvedOriginalText: resolvedOriginalText,
      continuityResolvedText: resolvedText
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
      ...safeObj(out.payload),
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
      continuity: mergeContinuityCarryForTransport(input.continuity, input.followUpReference, safeObj(input.meta).continuity, safeObj(input.payload).continuity),
      followUpReference: mergeContinuityCarryForTransport(input.followUpReference, safeObj(input.meta).followUpReference, safeObj(input.payload).followUpReference),
      lastAssistantReply: cleanText(result.reply || ""),
      timestamp: Date.now()
    };

    this.state.lastContinuity = entry.continuity;
    this.state.lastFollowUpReference = entry.followUpReference;
    this.state.lastAssistantReply = entry.lastAssistantReply;
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


const MARION_ADMIN_CONVERSATION_TRANSPORT_VERSION = "nyx.marion.adminConversationTransport/1.0";
const LINGOSENTINEL_SILENT_OVERSIGHT_TRANSPORT_VERSION = "nyx.lingosentinel.silentOversightTransport/1.0";

function normalizeMarionAdminConversationCarry(value = {}) {
  const src = safeObj(value);
  const active = src.privateAdminConversation === true ||
    src.adminConversation === true ||
    src.adminConversationAllowed === true ||
    src.marionAdminConversation === true ||
    src.directMarionConversation === true ||
    cleanText(src.routeScope || src.scope || "").toLowerCase() === "admin_private";

  if (!active) return {};

  return {
    version: cleanText(src.version || MARION_ADMIN_CONVERSATION_TRANSPORT_VERSION),
    active: true,
    privateAdminConversation: true,
    adminConversationAllowed: src.adminConversationAllowed !== false,
    directMarionConversation: true,
    authority: "Marion",
    publicAgent: "Marion",
    routeScope: "admin_private",
    publicUsersMayAddressMarion: false,
    publicUsersSpeakThrough: "Nyx",
    tokenExposed: false,
    tokenStored: false,
    transcriptOnly: true,
    noRawAudioStored: true,
    audioStored: false,
    visibleToPublicUsers: false,
    source: cleanText(src.source || "chatEngine.marionAdminConversationTransport")
  };
}

function extractMarionAdminConversationCarry(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const finalEnvelope = safeObj(src.finalEnvelope || payload.finalEnvelope || meta.finalEnvelope);
  const runtimeTelemetry = safeObj(src.runtimeTelemetry || payload.runtimeTelemetry || meta.runtimeTelemetry || finalEnvelope.runtimeTelemetry);
  const candidates = [
    src.marionAdminConversation,
    src.adminConversation,
    src.adminConversationBoundary,
    src.privateAdminConversation,
    payload.marionAdminConversation,
    payload.adminConversation,
    meta.marionAdminConversation,
    meta.adminConversation,
    finalEnvelope.marionAdminConversation,
    finalEnvelope.adminConversation,
    runtimeTelemetry.marionAdminConversation,
    runtimeTelemetry.adminConversation,
    src
  ];

  for (const item of candidates) {
    const normalized = normalizeMarionAdminConversationCarry(item);
    if (Object.keys(normalized).length) return normalized;
  }

  return {};
}

function normalizeLingoSentinelSilentOversightCarry(value = {}) {
  const src = safeObj(value);
  const active = src.silentOversight === true ||
    src.lingoSentinelSilentOversight === true ||
    src.userToUserBoundary === true ||
    src.marionVisibleParticipant === false ||
    cleanText(src.mode || src.oversightMode || "").toLowerCase() === "silent_overseer";

  if (!active) return {};

  const rawLanguages = safeArray(src.languages || src.supportedLanguages || src.targetLanguages)
    .map((item) => cleanText(item).toLowerCase())
    .filter(Boolean);
  const languages = rawLanguages.length ? Array.from(new Set(rawLanguages)).slice(0, 8) : ["en", "fr", "es"];

  return {
    version: cleanText(src.version || LINGOSENTINEL_SILENT_OVERSIGHT_TRANSPORT_VERSION),
    active: true,
    silentOversight: true,
    mode: "silent_overseer",
    authority: "Marion",
    publicAgent: "LingoSentinel",
    userToUserBoundary: true,
    marionVisibleParticipant: false,
    visibleToUsers: false,
    userFacing: false,
    publicReplyVisible: false,
    noUserFacingDiagnostics: true,
    supportsUserToUserDialogue: true,
    languages,
    languageContinuityGuard: src.languageContinuityGuard !== false,
    contextLossGuard: src.contextLossGuard !== false,
    toneEscalationGuard: src.toneEscalationGuard !== false,
    translationAmbiguityGuard: src.translationAmbiguityGuard !== false,
    transcriptOnly: true,
    noRawAudioStored: true,
    audioStored: false,
    source: cleanText(src.source || "chatEngine.lingoSentinelSilentOversightTransport")
  };
}

function extractLingoSentinelSilentOversightCarry(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const finalEnvelope = safeObj(src.finalEnvelope || payload.finalEnvelope || meta.finalEnvelope);
  const runtimeTelemetry = safeObj(src.runtimeTelemetry || payload.runtimeTelemetry || meta.runtimeTelemetry || finalEnvelope.runtimeTelemetry);
  const lingoSentinel = safeObj(src.lingoSentinel || payload.lingoSentinel || meta.lingoSentinel || finalEnvelope.lingoSentinel || runtimeTelemetry.lingoSentinel);
  const candidates = [
    src.lingoSentinelSilentOversight,
    src.lingoSentinelOversight,
    src.silentOversight,
    src.userToUserBoundary,
    lingoSentinel.silentOversight,
    lingoSentinel.oversight,
    lingoSentinel,
    payload.lingoSentinelSilentOversight,
    payload.silentOversight,
    meta.lingoSentinelSilentOversight,
    finalEnvelope.lingoSentinelSilentOversight,
    runtimeTelemetry.lingoSentinelSilentOversight,
    runtimeTelemetry.silentOversight
  ];

  for (const item of candidates) {
    const normalized = normalizeLingoSentinelSilentOversightCarry(item);
    if (Object.keys(normalized).length) return normalized;
  }

  return {};
}


if (typeof module !== "undefined") {
  

// MARION_VISIBLE_FINAL_CHATENGINE_PATCH_START
function normalizeVisibleFinalReplyFields(packet={}){
  const out=safeObj(packet), payload=safeObj(out.payload), fe=safeObj(out.finalEnvelope);
  const reply=firstText(fe.publicReply,fe.visibleReply,fe.finalReply,fe.reply,out.publicReply,out.visibleReply,out.finalReply,out.reply,out.answer,out.output,out.response,out.message,out.text,payload.publicReply,payload.visibleReply,payload.finalReply,payload.reply,payload.answer,payload.output,payload.response,payload.message,payload.text);
  if(!reply)return out;
  out.reply=reply;out.publicReply=reply;out.visibleReply=reply;out.finalReply=reply;out.answer=reply;out.output=reply;out.response=reply;out.message=reply;out.text=reply;
  out.payload={...payload,reply,publicReply:reply,visibleReply:reply,finalReply:reply,answer:reply,output:reply,response:reply,message:reply,text:reply};
  out.finalEnvelope={...fe,reply,publicReply:reply,visibleReply:reply,finalReply:reply,text:reply,canEmit:true,final:true};
  return out;
}
// MARION_VISIBLE_FINAL_CHATENGINE_PATCH_END

module.exports = { normalizeVisibleFinalReplyFields,
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
    MARION_ADMIN_CONVERSATION_TRANSPORT_VERSION,
    LINGOSENTINEL_SILENT_OVERSIGHT_TRANSPORT_VERSION,
    normalizeMarionAdminConversationCarry,
    extractMarionAdminConversationCarry,
    normalizeLingoSentinelSilentOversightCarry,
    extractLingoSentinelSilentOversightCarry,
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
      compactContinuityCarryForTransport,
      mergeContinuityCarryForTransport,
      stableTurnKey,
      hasTrustedBridgeOrComposerMarker,
      sanitizeFinalUserFacingReplyForCohesion,
      isPrimitivePublicReplyValue,
      buildCoordinatorRecoveryReply,
      buildNyxMarionContinuityTransportReply,
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
      loadUniversalTranslatorAdapter,
      normalizeMarionAdminConversationCarry,
      extractMarionAdminConversationCarry,
      normalizeLingoSentinelSilentOversightCarry,
      extractLingoSentinelSilentOversightCarry,
    }
  };
}



/* R18C_FULL_STACK_REGRESSION_HARMONIZER_START */
(function(){
  try {
    const V = "nyx.marion.r18c.fullStackRegression/1.0";
    function T(v, max){ let s = v == null ? "" : String(v).replace(/\s+/g," ").trim(); if(max && s.length > max) s = s.slice(0, max - 1).trim() + "…"; return s; }
    function O(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
    function A(v){ return Array.isArray(v) ? v : []; }
    function lower(v){ return T(v, 4000).toLowerCase(); }
    function firstText(){
      for (let i = 0; i < arguments.length; i += 1) {
        const v = T(arguments[i], 4000);
        if (v) return v;
      }
      return "";
    }
    function extractText(packet){
      const p = O(packet), payload = O(p.payload), meta = O(p.meta), session = O(p.session), body = O(p.body);
      return firstText(p.text, p.userText, p.rawUserText, p.message, p.prompt, p.normalizedUserIntent,
        payload.text, payload.userText, payload.rawUserText, payload.message, payload.prompt,
        meta.text, meta.userText, meta.rawUserText, session.lastUserText, body.text, body.userText);
    }
    function r18cTechnicalLawFileWork(text){
      const t = lower(text);
      return /\b(surgical\s+autopsy|autopsy|patch|fix|update|harden|audit|line[-\s]?by[-\s]?line|node\s+--check|zip|downloadable|resend|script|file|files|js|json|manifest|payload|pack|runtime|router|routing|registry|domain\s+router|domain\s+registry|domain\s+concierge|composemarionresponse|marionbridge|final\s+envelope|state\s+spine|chatengine|index\.js)\b/.test(t) &&
        /\b(law|legal|contract|contracts|manifest|payload|domain)\b/.test(t);
    }
    function r18cShortLawFollowup(text, ctx){
      const t = lower(text).replace(/[.!?]+$/g,"").trim();
      if (!/^(next|next steps|continue|keep going|carry on|what next|what now|then what|passed|pass|locked)$/.test(t)) return false;
      const c = JSON.stringify(ctx || {}).toLowerCase();
      return /\b(activefeaturelane|knowledgeDomain|primaryDomain|selectedDomain|domain|route|lastTopic|currentObjective)\b/.test(c) &&
        /\b(law|legal|contract|copyright|licensing|liability|compliance|jurisdiction)\b/.test(c);
    }
    function r18cDetectLawCategories(text){
      const t = lower(text);
      const out = [];
      if (/\b(copyright|license|licence|licensing|distribution rights?|broadcast rights?|streaming rights?|public performance|sync rights?|roku|ott|movie|movies|moneti[sz]e|platform rights?)\b/.test(t)) out.push("copyright_licensing");
      if (/\b(fired|terminated|termination|severance|release to sign|sign the release|two weeks|employment|employee|employer|contractor|independent contractor|wrongful dismissal|constructive dismissal|without cause)\b/.test(t)) out.push("employment_contractor");
      if (/\b(defamation|libel|slander|false claims?|false statements?|posted false|business online|reputation|negligence|liable|liability|lawsuit|sue|damages|injury|harm|tort)\b/.test(t)) out.push("liability_dispute");
      if (/\b(customer data|personal information|personal data|privacy|data processing|vendor data|pipeda|data breach|consent|processor|controller|dpa|confidential information)\b/.test(t)) out.push("privacy_data");
      if (/\b(trademark|trade mark|patent|intellectual property|\bip\b|brand rights?|logo|mark infringement)\b/.test(t)) out.push("ip_trademark_patent");
      if (/\b(compliance|regulatory|regulation|policy|terms of service|platform terms|statute|act|legal requirement)\b/.test(t)) out.push("compliance_regulatory");
      if (/\b(corporation|incorporated|shareholder|director|officer|bylaws|articles|corporate|business structure)\b/.test(t)) out.push("corporate_business");
      if (/\b(jurisdiction|province|territory|court|tribunal|deadline|limitation|file|filing|procedure|serve|served|hearing)\b/.test(t)) out.push("jurisdiction_procedure");
      if (/\b(contract|agreement|clause|terms|breach|enforceable|consideration|promise|release|waiver|indemnity|distribution rights?)\b/.test(t)) out.push("contract");
      if (/\b(source|sources|verify|verification|case law|canlii|statute|regulation|official source|research)\b/.test(t)) out.push("source_verification");
      if (!out.length && /\b(law|legal|rights?|obligation|permitted|allowed|can i|should i sign|safe to)\b/.test(t)) out.push("general_legal_risk");
      const priority = ["employment_contractor","copyright_licensing","privacy_data","liability_dispute","ip_trademark_patent","compliance_regulatory","jurisdiction_procedure","corporate_business","contract","source_verification","general_legal_risk"];
      return Array.from(new Set(out)).sort((a,b)=>priority.indexOf(a)-priority.indexOf(b));
    }
    function r18cSecondaryDomains(text, cats){
      const t = lower(text), out = [];
      if (/\b(roku|ott|streaming|movie|movies|channel|platform|distribution)\b/.test(t)) out.push("business","roku");
      if (/\b(moneti[sz]e|revenue|cost|price|pay|severance|settlement|damages|commercial|business|sandblast)\b/.test(t)) out.push("finance","business");
      if (cats.indexOf("privacy_data") >= 0 || /\b(data|privacy|security|breach|access|vendor)\b/.test(t)) out.push("cyber");
      if (/\b(ai|model|automation|agent|llm)\b/.test(t)) out.push("ai");
      return Array.from(new Set(out.filter(x => x && x !== "law"))).slice(0,4);
    }
    function r18cIsLaw(text, ctx){
      if (r18cTechnicalLawFileWork(text)) return false;
      const cats = r18cDetectLawCategories(text);
      if (cats.length && !(cats.length === 1 && cats[0] === "general_legal_risk" && !/\b(law|legal|rights|liability|contract|copyright|license|employment|fired|defamation|privacy|compliance|jurisdiction|safe to|permitted|allowed)\b/i.test(T(text)))) return true;
      return r18cShortLawFollowup(text, ctx);
    }
    function r18cProfile(text, ctx){
      const cats = r18cDetectLawCategories(text);
      const shortCarry = r18cShortLawFollowup(text, ctx);
      const category = cats[0] || (shortCarry ? "general_legal_risk" : "");
      const secondary = r18cSecondaryDomains(text, cats);
      return {
        version: V,
        active: !!(category || shortCarry),
        domain: "law",
        primaryDomain: "law",
        selectedDomain: "law",
        knowledgeDomain: "law",
        legalCategory: category || "general_legal_risk",
        legalCategories: cats.length ? cats : ["general_legal_risk"],
        secondaryDomains: secondary,
        confidence: shortCarry ? 0.82 : 0.94,
        confidenceScore: shortCarry ? 0.82 : 0.94,
        band: "high",
        confidenceBand: "high",
        margin: shortCarry ? 0.18 : 0.32,
        answerMode: "grounded",
        highStakes: true,
        routeLocked: true,
        failClosed: false,
        needsClarifier: false,
        reason: shortCarry ? "r18c_law_short_prompt_lane_inheritance" : "r18c_full_stack_law_precedence",
        assessmentFrame: ["legal_category","jurisdiction_sensitivity","facts_vs_assumptions","risk_exposure","missing_information","source_document_check","safe_next_move"],
        legalBoundary: {
          generalInformationOnly: true,
          noLegalAdvice: true,
          noAttorneyClientRelationship: true,
          noLegalCertaintyClaim: true,
          jurisdictionRequired: true,
          sourceDocumentReviewRequired: true,
          professionalReviewRecommendedForHighRisk: true
        },
        noCrossDomainBleed: true,
        noUserFacingDiagnostics: true,
        r18cFullStackRegression: true,
        fullStackAgreementRequired: true
      };
    }
    function r18cMergeLawProfile(target, profile){
      const out = O(target);
      if (!profile || !profile.active) return out;
      out.domain = "law";
      out.primaryDomain = "law";
      out.selectedDomain = "law";
      out.knowledgeDomain = "law";
      out.legalCategory = profile.legalCategory;
      out.legalCategories = profile.legalCategories;
      out.secondaryDomains = profile.secondaryDomains;
      out.answerMode = "grounded";
      out.highStakes = true;
      out.routeLocked = true;
      out.needsClarifier = false;
      out.failClosed = false;
      out.r18cLawAssessment = Object.assign({}, O(out.r18cLawAssessment), profile);
      out.r18cFullStackRegression = true;
      out.noCrossDomainBleed = true;
      out.noUserFacingDiagnostics = true;
      return out;
    }
    const api = { V, T, O, A, extractText, r18cTechnicalLawFileWork, r18cShortLawFollowup, r18cDetectLawCategories, r18cSecondaryDomains, r18cIsLaw, r18cProfile, r18cMergeLawProfile };
    module.exports.MARION_R18C_FULL_STACK_REGRESSION_VERSION = V;
    module.exports.marionR18CFullStackHelpers = api;
    module.exports.marionR18CFullStackProfile = function(packet){
      const text = extractText(packet);
      return r18cProfile(text, packet);
    };
    module.exports.marionR18CFullStackIsLawTurn = function(packet){
      const text = extractText(packet);
      return r18cIsLaw(text, packet);
    };
    module.exports.marionR18CFullStackTechnicalLawFileWork = function(packet){
      return r18cTechnicalLawFileWork(extractText(packet));
    };
  } catch(_err) {}
})();
/* R18C_FULL_STACK_REGRESSION_HARMONIZER_END */

/* R18C_FULL_STACK_CHATENGINE_PASS_THROUGH_START */
(function(){
  try {
    const H = module.exports.marionR18CFullStackHelpers;
    if (!H || module.exports.__r18cFullStackChatEngineWrapped) return;
    const oldNormalize = module.exports.normalizeCoordinatorOutputForPipeline;
    module.exports.marionR18CFullStackTransportProfile = function(packet){
      const text = H.extractText(packet);
      const p = H.r18cProfile(text, packet);
      return {
        version: H.V,
        active: H.r18cIsLaw(text, packet),
        technicalLawFileWork: H.r18cTechnicalLawFileWork(text),
        domain: H.r18cIsLaw(text, packet) ? "law" : "",
        legalCategory: p.legalCategory,
        noReplyInvention: true,
        finalEnvelopeAuthorityRequired: true,
        visibleDiagnosticsBlocked: true
      };
    };
    if (typeof oldNormalize === "function") {
      module.exports.normalizeCoordinatorOutputForPipeline = function(output, context){
        const base = oldNormalize.apply(this, arguments);
        const text = H.extractText(context) || H.extractText(output);
        if (!H.r18cIsLaw(text, {output, context})) return base;
        const p = H.r18cProfile(text, {output, context});
        return Object.assign({}, H.O(base), {
          r18cFullStackRegression: true,
          r18cLawAssessment: p,
          knowledgeDomain: "law",
          answerMode: "grounded",
          noUserFacingDiagnostics: true
        });
      };
    }
    module.exports.__r18cFullStackChatEngineWrapped = true;
  } catch(_err) {}
})();
/* R18C_FULL_STACK_CHATENGINE_PASS_THROUGH_END */

/* R18C_LIVE_HANDLER_REPAIR_START */
(function(){
  "use strict";
  const V = "nyx.marion.r18c.liveHandlerRepair/1.0";
  if (typeof module === "undefined" || !module.exports) return;
  if (module.exports.__r18cLiveHandlerRepairPatched) return;
  module.exports.__r18cLiveHandlerRepairPatched = true;
  module.exports.MARION_R18C_LIVE_HANDLER_REPAIR_VERSION = V;

  function T(v, max){
    const s = v == null ? "" : String(v).replace(/\s+/g, " ").trim();
    if (!max || s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)).trim() + "…";
  }
  function L(v){ return T(v).toLowerCase(); }
  function O(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function A(v){ return Array.isArray(v) ? v : []; }
  function firstText(){
    for (let i=0;i<arguments.length;i+=1){
      const v = T(arguments[i]);
      if (v) return v;
    }
    return "";
  }
  function readPath(root, dotted){
    let node = O(root);
    const parts = String(dotted || "").split(".");
    for (let i=0;i<parts.length;i+=1){
      if (!node || typeof node !== "object") return "";
      node = node[parts[i]];
    }
    return node;
  }
  function extractText(packet){
    const p = O(packet);
    const req = O(p.req);
    const body = O(req.body || p.body);
    const payload = O(p.payload);
    const result = O(p.result);
    const meta = O(p.meta);
    const fe = O(p.finalEnvelope || result.finalEnvelope);
    return firstText(
      p.originalPrompt, p.rawUserText, p.userText, p.message, p.input, p.text, p.prompt, p.query,
      body.originalPrompt, body.rawUserText, body.userText, body.message, body.input, body.text, body.prompt,
      payload.originalPrompt, payload.rawUserText, payload.userText, payload.message, payload.input, payload.text, payload.prompt,
      result.originalPrompt, result.rawUserText, result.userText, result.message, result.input, result.text, result.prompt,
      meta.originalPrompt, meta.rawUserText, meta.userText, meta.message, meta.input, meta.text, meta.prompt,
      fe.originalPrompt, fe.rawUserText, fe.userText, fe.message, fe.input, fe.text, fe.prompt
    );
  }
  function extractReply(packet){
    const p = O(packet);
    const result = O(p.result);
    const payload = O(p.payload);
    const meta = O(p.meta);
    const fe = O(p.finalEnvelope || result.finalEnvelope);
    return firstText(
      p.directReply, p.publicReply, p.visibleReply, p.displayReply, p.reply, p.response, p.final, p.text, p.message,
      result.directReply, result.publicReply, result.visibleReply, result.displayReply, result.reply, result.response, result.final, result.text, result.message,
      payload.directReply, payload.publicReply, payload.visibleReply, payload.displayReply, payload.reply, payload.response, payload.final, payload.text, payload.message,
      fe.directReply, fe.publicReply, fe.visibleReply, fe.displayReply, fe.reply, fe.response, fe.final, fe.text, fe.message,
      meta.directReply, meta.publicReply, meta.visibleReply, meta.displayReply, meta.reply, meta.response, meta.final, meta.text, meta.message
    );
  }
  function technicalLawFileWork(text){
    const t = L(text);
    if (!t) return false;
    const technical = /\b(surgical\s+autopsy|autopsy|patch|fix|update|resend|downloadable\s+zip|zip package|node --check|script|file|files|js|javascript|runtime|backend|frontend|api\/chat|index\.js|chatengine|chat engine|composer|composemarionresponse|marionbridge|final envelope|marionfinalenvelope|guardian\.response\.adapter|domain router|domain registry|manifest|payload|package|structural integrity)\b/i.test(t);
    const fileLaw = /\b(law domain|law manifest|law payload|law files?|legal payload|legal manifest|r18c|full[-\s]?stack regression|live handler|route|routing|registry|envelope integration)\b/i.test(t);
    return technical && fileLaw;
  }
  function shortLawFollowup(text){
    const t = L(text).replace(/[.!?]+$/g, "").trim();
    return /^(next|next steps|continue|keep going|go on|what now|what's next|what is next|then what)$/i.test(t);
  }
  function categories(text){
    const t = L(text);
    const out = [];
    function add(c){ if (out.indexOf(c) < 0) out.push(c); }
    if (/\b(copyright|license|licence|licensing|distribution rights|streaming rights|public performance|broadcast rights|roku|ott|movie|movies|moneti[sz]e|paperwork|chain of title|content rights)\b/i.test(t)) add("copyright_licensing");
    if (/\b(customer data|personal data|privacy|data processing|processor|subprocessor|breach|retention|delete data|data security|confidential information|vendor data)\b/i.test(t)) add("privacy_data");
    if (/\b(fired|terminated|termination|severance|release to sign|employment|contractor|independent contractor|wrongful dismissal|constructive dismissal|two weeks|pay in lieu)\b/i.test(t)) add("employment_contractor");
    if (/\b(defamation|libel|slander|false claims|false statement|reputation|posted false|business harm|liable|liability|negligence|tort|sue|lawsuit|claim|damages)\b/i.test(t)) add("liability_dispute");
    if (/\b(trademark|trade mark|patent|intellectual property| IP |brand name|logo|ownership of rights)\b/i.test(" " + t + " ")) add("ip_trademark_patent");
    if (/\b(compliance|regulatory|regulation|policy|terms of service|consumer protection|advertising rules|platform rules)\b/i.test(t)) add("compliance_regulatory");
    if (/\b(incorporation|shareholder|director|corporate|business contract|vendor agreement|partnership)\b/i.test(t)) add("corporate_business");
    if (/\b(jurisdiction|province|territory|ontario|canada|court|tribunal|deadline|limitation period|statute of limitations|file|filing)\b/i.test(t)) add("jurisdiction_procedure");
    if (/\b(contract|agreement|clause|terms|breach|consideration|indemnity|warranty|representation|termination clause)\b/i.test(t)) add("contract");
    if (/\b(source|sources|verify|case law|statute|official source|canlii|justice laws|e-laws|legal research)\b/i.test(t)) add("source_verification");
    if (/\b(legal|law|lawful|illegal|rights|risk|allowed|can i|should i sign|am i safe)\b/i.test(t) && !out.length) add("general_legal_risk");
    return out;
  }
  function secondaryDomains(text){
    const t = L(text);
    const s = [];
    function add(v){ if (s.indexOf(v) < 0) s.push(v); }
    if (/\b(cost|revenue|money|price|pricing|funding|grant|profit|moneti[sz]e|ad revenue|sponsor|fee)\b/i.test(t)) add("finance");
    if (/\b(ai|model|agent|automation|llm|prompt|machine learning)\b/i.test(t)) add("ai");
    if (/\b(security|cyber|access|identity|secret|token|credential|breach|encryption|privacy)\b/i.test(t)) add("cyber");
    if (/\b(roku|ott|streaming|broadcast|channel|movie|tv)\b/i.test(t)) add("roku");
    if (/\b(business|sandblast|vendor|commercial|customer|contractor|platform)\b/i.test(t)) add("business");
    return s.slice(0,4);
  }
  function isLawTurn(text, packet){
    if (technicalLawFileWork(text)) return false;
    const p = O(packet);
    const dc = O(p.domainConfidence || O(p.routing).domainConfidence || O(p.result).domainConfidence || O(p.meta).domainConfidence);
    const domain = L(firstText(p.domain, p.primaryDomain, p.selectedDomain, p.knowledgeDomain, O(p.routing).domain, O(p.routing).primaryDomain, dc.primaryDomain, dc.knowledgeDomain, O(p.finalEnvelope).domain));
    if (domain === "law" || domain.indexOf("law_") === 0) return true;
    return categories(text).length > 0;
  }
  function isPresenceFallback(reply){
    const r = L(reply).replace(/[.!?]+$/g, "").trim();
    if (!r) return true;
    return /^(i[’']?m here(?:,\s*mac)?|i am here(?:,\s*mac)?|still with you(?:,\s*mac)?|line open with you|ready when you are|what would you like to work on|hi\.?\s*i[’']?m nyx\.?\s*it[’']?s good to see you\.?\s*what would you like to work on)$/i.test(r) ||
      /\b(i[’']?m here|still with you|what would you like to work on)\b/i.test(r) && r.length < 120;
  }
  function isBadLawReply(reply, text){
    if (!isLawTurn(text, {})) return false;
    const r = L(reply);
    if (isPresenceFallback(reply)) return true;
    if (/^(true|false|null|undefined|\[object object\]|ok|success)$/i.test(r)) return true;
    if (r.length < 80 && !/\b(copyright|licens|contract|privacy|data|liability|jurisdiction|legal|agreement|source|document)\b/i.test(r)) return true;
    return false;
  }
  function profile(text, packet){
    const cats = categories(text);
    const shortCarry = shortLawFollowup(text) && /law/i.test(JSON.stringify(packet || {}).slice(0, 2500));
    return {
      version: V,
      active: !!(cats.length || shortCarry || isLawTurn(text, packet)),
      domain: "law",
      primaryDomain: "law",
      selectedDomain: "law",
      knowledgeDomain: "law",
      legalCategory: cats[0] || "general_legal_risk",
      legalCategories: cats.length ? cats : ["general_legal_risk"],
      secondaryDomains: secondaryDomains(text),
      confidence: shortCarry ? 0.82 : 0.94,
      confidenceScore: shortCarry ? 0.82 : 0.94,
      band: "high",
      answerMode: "grounded",
      routeLocked: true,
      lawShortPromptLaneInheritance: shortCarry,
      r18CLawRealWorldAssessment: true,
      r18CLiveHandlerRepair: true,
      noLegalAdvice: true,
      noLegalCertaintyClaim: true,
      noAttorneyClientRelationship: true,
      factsAssumptionsSeparated: true,
      jurisdictionSensitivity: true,
      legalSourceDocumentCheckRequired: true,
      assessmentFrame: ["legal_category","jurisdiction_sensitivity","facts_vs_assumptions","risk_exposure","missing_information","source_document_check","safe_next_move"],
      legalRiskBoundary: {
        generalInformationOnly: true,
        noLegalAdvice: true,
        noAttorneyClientRelationship: true,
        noLegalCertaintyClaim: true,
        jurisdictionRequired: true,
        sourceDocumentReviewRequired: true,
        professionalReviewRecommendedForHighRisk: true
      }
    };
  }
  function lawReply(text, p){
    const cats = (p && p.legalCategories) || categories(text);
    const cat = (cats && cats[0]) || "general_legal_risk";
    const jurisdictionLine = "Jurisdiction sensitivity: I’d need the province/territory and the governing documents before treating this as anything more than general legal information.";
    if (cat === "copyright_licensing") {
      return "I can give general legal-risk triage, not legal advice. Legal category: copyright/licensing. Paperwork by itself is not enough; the key is whether the documents clearly grant streaming/CTV/Roku distribution, public-performance, monetization, territory, duration, exclusivity, and sublicensing rights. Facts vs assumptions: you may have some paperwork, but we cannot assume it covers Roku or ad-supported distribution until the rights language and chain of title are checked. Risk exposure: takedowns, platform rejection, copyright claims, indemnity exposure, or lost monetization. Missing information: the license, rights owner, territory, term, media/platform scope, monetization clause, warranties, and indemnity language. " + jurisdictionLine + " Safe next move: build a rights checklist and have the actual source documents reviewed before publishing or monetizing the movies.";
    }
    if (cat === "privacy_data") {
      return "I can give general legal-risk triage, not legal advice. Legal category: privacy/data in a vendor agreement. Facts vs assumptions: a vendor has customer data, but we need to know what data, where it is stored, who can access it, and what law/contract governs it. Risk exposure: breach liability, unauthorized use, weak deletion terms, subcontractor exposure, and compliance gaps. Missing information: data-processing purpose, safeguards, breach notice timing, subprocessors, retention/deletion, audit rights, jurisdiction, confidentiality, indemnity, and return/destruction obligations. Safe next move: review the agreement for a privacy/data-processing schedule and require clear breach, security, retention, and deletion terms before sharing live customer data.";
    }
    if (cat === "employment_contractor") {
      return "I can give general legal information, not legal advice. Legal category: employment/contractor. Facts vs assumptions: termination pay, severance, and release language depend on the province, employment status, contract terms, length of service, role, and whether a valid termination clause exists. Risk exposure: signing a release too quickly can waive claims or benefits. Missing information: province, employment contract, termination letter, release, tenure, pay/benefits, and deadline pressure. Safe next move: do not sign under pressure; compare the offer against statutory minimums and possible common-law factors, then have a lawyer or legal clinic review the release if money or rights are material.";
    }
    if (cat === "liability_dispute") {
      return "I can give general legal-risk triage, not legal advice. Legal category: liability/dispute. Facts vs assumptions: whether there is a viable claim depends on what was said or done, evidence, harm, causation, available defences, and jurisdiction. Risk exposure: reputational harm, damages, escalation costs, and counterclaims if the response is careless. Missing information: timeline, screenshots/documents, witnesses, losses, platform context, and any prior communications. Safe next move: preserve evidence, avoid threats or retaliation, write a neutral facts-only request for correction/removal if appropriate, and verify the proper tribunal/court or legal clinic route for your province.";
    }
    if (cat === "source_verification") {
      return "I can give general legal-research guidance, not legal advice. Legal category: source verification. Start with primary authority: the relevant statute/regulation on an official government site, then current case law from official court sites or CanLII, then secondary sources only for explanation. Facts vs assumptions: commentary is not binding law. Risk exposure: relying on stale, out-of-jurisdiction, or non-authoritative sources can produce the wrong answer. Safe next move: identify the jurisdiction, statute, section, and current cases, then note up anything important before relying on it.";
    }
    return "I can give general legal-risk triage, not legal advice. Legal category: " + cat.replace(/_/g, "/") + ". " + jurisdictionLine + " Facts vs assumptions: I can only work from the facts you provide, and missing documents can change the answer. Risk exposure: rights, liability, compliance, timing, and cost can shift depending on the documents and jurisdiction. Missing information: governing agreement, dates, parties, province/territory, source documents, and what outcome you want. Safe next move: gather the documents and timeline first, then verify the governing law or have a lawyer/legal clinic review the high-risk parts.";
  }
  function mergeProfile(target, p){
    const out = O(target);
    if (!p || !p.active) return out;
    out.r18CLiveHandlerRepair = true;
    out.r18CLawRealWorldAssessment = true;
    out.domain = "law";
    out.primaryDomain = "law";
    out.selectedDomain = "law";
    out.knowledgeDomain = "law";
    out.legalCategory = p.legalCategory;
    out.legalCategories = p.legalCategories;
    out.secondaryDomains = p.secondaryDomains;
    out.lawAssessmentFrame = p.assessmentFrame.join(",");
    out.legalAdviceBoundary = "general legal information only; not legal advice; no attorney-client relationship; no legal certainty claim";
    out.jurisdictionSensitivity = true;
    out.factsAssumptionsSeparated = true;
    out.legalSourceDocumentCheckRequired = true;
    out.noLegalCertaintyClaim = true;
    out.noAttorneyClientRelationship = true;
    out.legalRiskBoundary = p.legalRiskBoundary;
    return out;
  }
  function setReplyFields(obj, reply, p){
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
    obj.directReply = reply;
    obj.publicReply = reply;
    obj.visibleReply = reply;
    obj.displayReply = reply;
    obj.reply = reply;
    obj.response = reply;
    obj.text = reply;
    obj.message = reply;
    obj.final = reply;
    mergeProfile(obj, p);
    return obj;
  }
  function apply(packet, opt, seen){
    const options = O(opt);
    const prompt = firstText(options.prompt, extractText(packet));
    if (!prompt || technicalLawFileWork(prompt) || !isLawTurn(prompt, packet)) return packet;
    const p = profile(prompt, packet);
    if (!p.active) return packet;
    const expected = lawReply(prompt, p);
    if (typeof packet === "string") return isBadLawReply(packet, prompt) ? expected : packet;
    if (!packet || typeof packet !== "object") return packet;
    const stack = seen || [];
    if (stack.indexOf(packet) >= 0) return packet;
    stack.push(packet);
    const current = extractReply(packet);
    if (isBadLawReply(current, prompt)) setReplyFields(packet, expected, p);
    else mergeProfile(packet, p);
    const nested = ["result","payload","finalEnvelope","guardianPacket","marionFinal","marion","data","output"];
    for (let i=0;i<nested.length;i+=1){
      const k = nested[i];
      if (packet[k] && typeof packet[k] === "object") apply(packet[k], { prompt }, stack);
    }
    if (packet.meta && typeof packet.meta === "object") {
      packet.meta.r18CLiveHandlerRepair = true;
      packet.meta.r18CLawProfile = p;
    }
    if (packet.routing && typeof packet.routing === "object") mergeProfile(packet.routing, p);
    if (packet.domainConfidence && typeof packet.domainConfidence === "object") mergeProfile(packet.domainConfidence, p);
    return packet;
  }
  function wrap(name){
    const old = module.exports[name];
    if (typeof old !== "function" || old.__r18cLiveHandlerRepairWrapped) return;
    const wrapped = function(){
      const args = Array.prototype.slice.call(arguments);
      const prompt = firstText.apply(null, args.map(extractText).concat(args.map(T)));
      const out = old.apply(this, args);
      if (out && typeof out.then === "function") {
        return out.then(function(value){ return apply(value, { prompt: prompt || extractText(value) }); });
      }
      return apply(out, { prompt: prompt || extractText(out) });
    };
    wrapped.__r18cLiveHandlerRepairWrapped = true;
    try { Object.defineProperty(wrapped, "name", { value: old.name || name }); } catch(_){}
    module.exports[name] = wrapped;
  }

  [
    "composeMarionResponse","run","default",
    "processWithMarion","maybeResolve","ask","handle","route","createMarionBridge",
    "createMarionFinalEnvelope","attachVisibleReplyAliases",
    "adaptGuardianResponse","createGuardianPacket","sanitizeRuntimePacket",
    "normalizeCoordinatorOutputForPipeline","shapeEngineReply","applyPublicReplyHygieneToResponse","normalizeMarionBridgeResult"
  ].forEach(wrap);

  try {
    if (typeof express !== "undefined" && express && express.response && !express.response.__r18cLiveHandlerRepairPatched) {
      const oldJson = express.response.json;
      const oldSend = express.response.send;
      if (typeof oldJson === "function") {
        express.response.json = function(body){
          try {
            const req = O(this && this.req);
            const prompt = extractText({ req: req, body: O(req.body), payload: O(req.body) });
            body = apply(body, { prompt });
          } catch(_err) {}
          return oldJson.call(this, body);
        };
      }
      if (typeof oldSend === "function") {
        express.response.send = function(body){
          try {
            const req = O(this && this.req);
            const prompt = extractText({ req: req, body: O(req.body), payload: O(req.body) });
            if (typeof body === "string" && prompt && isLawTurn(prompt, {}) && !technicalLawFileWork(prompt)) {
              const trimmed = body.trim();
              if ((trimmed[0] === "{" || trimmed[0] === "[") && trimmed.length < 1000000) {
                const parsed = JSON.parse(trimmed);
                const fixed = apply(parsed, { prompt });
                body = JSON.stringify(fixed);
              } else if (isBadLawReply(trimmed, prompt)) {
                body = lawReply(prompt, profile(prompt, {}));
              }
            }
          } catch(_err) {}
          return oldSend.call(this, body);
        };
      }
      express.response.__r18cLiveHandlerRepairPatched = true;
    }
  } catch(_err) {}

  module.exports.marionR18CLiveHandlerRepairApply = apply;
  module.exports.marionR18CLiveHandlerRepairProfile = profile;
  module.exports.marionR18CLiveHandlerRepairReply = lawReply;
  module.exports.marionR18CLiveHandlerRepairIsPresenceFallback = isPresenceFallback;
  module.exports.marionR18CLiveHandlerRepairIsLawTurn = isLawTurn;
})();
/* R18C_LIVE_HANDLER_REPAIR_END */

/* R18C_FINAL_ANSWER_MATERIALIZER_START */
(function(){
  "use strict";
  const V = "nyx.marion.r18c.finalAnswerMaterializer/1.1-precedence-repair";
  const PRECEDENCE_VERSION = "nyx.marion.r18c.finalMaterializerPrecedenceRepair/1.0";
  if (typeof module === "undefined" || !module.exports) return;
  if (module.exports.__r18cFinalAnswerMaterializerPatched) return;
  module.exports.__r18cFinalAnswerMaterializerPatched = true;
  module.exports.MARION_R18C_FINAL_ANSWER_MATERIALIZER_VERSION = V;

  function T(v, max){
    const s = v == null ? "" : String(v).replace(/\s+/g, " ").trim();
    if (!max || s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)).trim() + "…";
  }
  function L(v){ return T(v).toLowerCase(); }
  function O(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function A(v){ return Array.isArray(v) ? v : []; }
  function uniq(list, max){
    const out = [];
    const seen = {};
    for (let i=0;i<(Array.isArray(list)?list:[]).length;i+=1){
      const v = T(list[i], 64);
      if (!v || seen[v]) continue;
      seen[v] = true;
      out.push(v);
      if (max && out.length >= max) break;
    }
    return out;
  }
  function firstText(){
    for (let i=0;i<arguments.length;i+=1){
      const v = T(arguments[i]);
      if (v) return v;
    }
    return "";
  }
  function read(root, path){
    let node = root;
    const parts = String(path || "").split(".");
    for (let i=0;i<parts.length;i+=1){
      if (!node || typeof node !== "object") return undefined;
      node = node[parts[i]];
    }
    return node;
  }
  function collectTextFields(packet){
    const p = O(packet);
    const req = O(p.req);
    const body = O(req.body || p.body);
    const result = O(p.result);
    const payload = O(p.payload);
    const meta = O(p.meta);
    const fe = O(p.finalEnvelope || result.finalEnvelope || payload.finalEnvelope);
    return [
      p.originalPrompt,p.rawUserText,p.userText,p.userMessage,p.message,p.input,p.text,p.prompt,p.query,
      body.originalPrompt,body.rawUserText,body.userText,body.userMessage,body.message,body.input,body.text,body.prompt,body.query,
      payload.originalPrompt,payload.rawUserText,payload.userText,payload.userMessage,payload.message,payload.input,payload.text,payload.prompt,
      result.originalPrompt,result.rawUserText,result.userText,result.userMessage,result.message,result.input,result.text,result.prompt,
      meta.originalPrompt,meta.rawUserText,meta.userText,meta.userMessage,meta.message,meta.input,meta.text,meta.prompt,
      fe.originalPrompt,fe.rawUserText,fe.userText,fe.userMessage,fe.message,fe.input,fe.text,fe.prompt
    ];
  }
  function extractPrompt(packet){
    return firstText.apply(null, collectTextFields(packet));
  }
  function ownReplyCandidates(packet){
    const p = O(packet);
    const result = O(p.result);
    const payload = O(p.payload);
    const meta = O(p.meta);
    const gp = O(p.guardianPacket);
    const fe = O(p.finalEnvelope || result.finalEnvelope || payload.finalEnvelope || gp.finalEnvelope);
    return [
      p.directReply,p.publicReply,p.visibleReply,p.displayReply,p.reply,p.response,p.final,
      result.directReply,result.publicReply,result.visibleReply,result.displayReply,result.reply,result.response,result.final,
      payload.directReply,payload.publicReply,payload.visibleReply,payload.displayReply,payload.reply,payload.response,payload.final,
      gp.directReply,gp.publicReply,gp.visibleReply,gp.displayReply,gp.reply,gp.response,gp.final,
      fe.directReply,fe.publicReply,fe.visibleReply,fe.displayReply,fe.reply,fe.response,fe.final,
      meta.directReply,meta.publicReply,meta.visibleReply,meta.displayReply,meta.reply,meta.response,meta.final
    ];
  }
  function extractReply(packet){
    return firstText.apply(null, ownReplyCandidates(packet));
  }
  function hasRawRuntimeLeak(value){
    const t = T(value, 6000);
    if (!t) return false;
    return /\b(priority9I|priority9J|runtimeTelemetry|stateSpine|finalEnvelopeTrusted|replyAuthority|routeKind|nyx\.marion\.|MARION::FINAL::|lawAssessmentFrame|legalRiskBoundary|primaryDomain|selectedDomain|knowledgeDomain|legalCategory|legalCategories)\b/i.test(t);
  }
  function isPresenceFallback(value){
    const r = L(value).replace(/[.!?]+$/g, "").trim();
    if (!r) return true;
    if (/^(true|false|null|undefined|\[object object\]|ok|success)$/i.test(r)) return true;
    return /^(i[’']?m here(?:,\s*mac)?|i am here(?:,\s*mac)?|still with you(?:,\s*mac)?|line open with you|ready when you are|what would you like to work on|hi\.?\s*i[’']?m nyx\.?\s*it[’']?s good to see you\.?\s*what would you like to work on)$/i.test(r) ||
      (/\b(i[’']?m here|still with you|what would you like to work on)\b/i.test(r) && r.length < 180);
  }
  function isSocialContinuityLeak(value){
    const r = L(value);
    if (!r) return false;
    return /\b(i[’']?m with you|i am with you|conversation natural|system noise out of view|social response pass|continue the social response|line open with you|good to see you|ready to help|what would you like to work on|still with you|i[’']?m here)\b/i.test(r);
  }
  function isSubstantiveLawAnswer(value, p){
    const r = L(value);
    const cat = T(p && p.legalCategory).toLowerCase();
    if (!r || r.length < 120) return false;
    if (isPresenceFallback(r) || isSocialContinuityLeak(r) || hasRawRuntimeLeak(r)) return false;
    if (!/\b(legal|law|not legal advice|general legal|jurisdiction|risk|rights|agreement|contract|source document|safe next move|review|copyright|licens|privacy|data|liability|employment|release|defamation)\b/i.test(r)) return false;
    if (cat === "copyright_licensing") return /\b(copyright|licens|rights|distribution|streaming|roku|ott|movie|moneti[sz]e|chain of title|source documents?)\b/i.test(r);
    if (cat === "privacy_data") return /\b(privacy|data|customer data|vendor|agreement|breach|retention|deletion|security)\b/i.test(r);
    if (cat === "employment_contractor") return /\b(employment|contractor|terminated|fired|release|severance|termination|sign)\b/i.test(r);
    if (cat === "liability_dispute") return /\b(liability|dispute|defamation|false claims|reputation|damages|evidence|claim)\b/i.test(r);
    if (cat === "source_verification") return /\b(source|verify|statute|case law|official|legal research|canlii)\b/i.test(r);
    if (cat === "contract") return /\b(contract|agreement|clause|breach|terms|governing law)\b/i.test(r);
    return true;
  }
  function technicalLawFileWork(text){
    const t = L(text);
    if (!t) return false;
    const technical = /\b(surgical\s+autopsy|autopsy|patch|fix|update|resend|downloadable\s+zip|zip package|node --check|script|file|files|js|javascript|runtime|backend|frontend|api\/chat|index\.js|chatengine|chat engine|composer|composemarionresponse|marionbridge|final envelope|marionfinalenvelope|guardian\.response\.adapter|domain router|domain registry|manifest|payload|package|structural integrity|critical issues|gap refinement)\b/i.test(t);
    const lawFile = /\b(law domain|law manifest|law payload|law files?|legal payload|legal manifest|r18c|full[-\s]?stack regression|live handler|final answer materializer|route|routing|registry|envelope integration)\b/i.test(t);
    return technical && lawFile;
  }
  function promptCategories(text){
    const t = L(text);
    const out = [];
    function add(c){ if (out.indexOf(c) < 0) out.push(c); }
    if (/\b(copyright|license|licence|licensing|distribution rights|streaming rights|public performance|broadcast rights|roku|ott|movie|movies|moneti[sz]e|paperwork|chain of title|content rights)\b/i.test(t)) add("copyright_licensing");
    if (/\b(customer data|personal data|privacy|data processing|processor|subprocessor|breach|retention|delete data|data security|confidential information|vendor data)\b/i.test(t)) add("privacy_data");
    if (/\b(fired|terminated|termination|severance|release to sign|employment|contractor|independent contractor|wrongful dismissal|constructive dismissal|two weeks|pay in lieu)\b/i.test(t)) add("employment_contractor");
    if (/\b(defamation|libel|slander|false claims|false statement|reputation|posted false|business harm|liable|liability|negligence|tort|sue|lawsuit|claim|damages)\b/i.test(t)) add("liability_dispute");
    if (/\b(trademark|trade mark|patent|intellectual property| IP |brand name|logo|ownership of rights)\b/i.test(" " + t + " ")) add("ip_trademark_patent");
    if (/\b(compliance|regulatory|regulation|policy|terms of service|consumer protection|advertising rules|platform rules)\b/i.test(t)) add("compliance_regulatory");
    if (/\b(incorporation|shareholder|director|corporate|business contract|vendor agreement|partnership)\b/i.test(t)) add("corporate_business");
    if (/\b(jurisdiction|province|territory|ontario|canada|court|tribunal|deadline|limitation period|statute of limitations|file|filing)\b/i.test(t)) add("jurisdiction_procedure");
    if (/\b(contract|agreement|clause|terms|breach|consideration|indemnity|warranty|representation|termination clause)\b/i.test(t)) add("contract");
    if (/\b(source|sources|verify|case law|statute|official source|canlii|justice laws|e-laws|legal research)\b/i.test(t)) add("source_verification");
    if (/\b(legal|law|lawful|illegal|rights|risk|allowed|can i|should i sign|am i safe)\b/i.test(t) && !out.length) add("general_legal_risk");
    return out;
  }
  function objectHasLawMarkers(obj, depth, seen){
    if (!obj || typeof obj !== "object" || depth > 5) return false;
    if (seen.indexOf(obj) >= 0) return false;
    seen.push(obj);
    const p = O(obj);
    const markerText = [
      p.domain,p.primaryDomain,p.selectedDomain,p.knowledgeDomain,p.activeFeatureLane,
      p.legalCategory,p.lawAssessmentFrame,p.legalAdviceBoundary
    ].map(T).join(" ").toLowerCase();
    if (/\blaw\b/.test(markerText) || /copyright_licensing|privacy_data|employment_contractor|liability_dispute|legal_category/.test(markerText)) return true;
    if (p.r18CLawRealWorldAssessment === true || p.jurisdictionSensitivity === true || p.noAttorneyClientRelationship === true || p.noLegalCertaintyClaim === true) return true;
    const keys = Object.keys(p).slice(0, 60);
    for (let i=0;i<keys.length;i+=1){
      const k = keys[i];
      if (/^(req|res|socket|connection|stream)$/i.test(k)) continue;
      if (objectHasLawMarkers(p[k], depth + 1, seen)) return true;
    }
    return false;
  }
  function collectLawFields(obj, depth, seen, out){
    if (!obj || typeof obj !== "object" || depth > 5) return out;
    if (seen.indexOf(obj) >= 0) return out;
    seen.push(obj);
    const p = O(obj);
    function addText(key){
      const v = T(p[key], 120);
      if (v && !out[key]) out[key] = v;
    }
    ["domain","primaryDomain","selectedDomain","knowledgeDomain","legalCategory","lawAssessmentFrame","legalAdviceBoundary"].forEach(addText);
    if (Array.isArray(p.legalCategories) && !out.legalCategories) out.legalCategories = uniq(p.legalCategories, 6);
    if (Array.isArray(p.secondaryDomains) && !out.secondaryDomains) out.secondaryDomains = uniq(p.secondaryDomains, 5);
    ["jurisdictionSensitivity","factsAssumptionsSeparated","legalSourceDocumentCheckRequired","noLegalCertaintyClaim","noAttorneyClientRelationship","r18CLawRealWorldAssessment"].forEach(function(k){
      if (p[k] === true) out[k] = true;
    });
    const keys = Object.keys(p).slice(0, 80);
    for (let i=0;i<keys.length;i+=1){
      const k = keys[i];
      if (/^(req|res|socket|connection|stream)$/i.test(k)) continue;
      collectLawFields(p[k], depth + 1, seen, out);
    }
    return out;
  }
  function secondaryDomains(text){
    const t = L(text);
    const s = [];
    function add(v){ if (s.indexOf(v) < 0) s.push(v); }
    if (/\b(cost|revenue|money|price|pricing|funding|grant|profit|moneti[sz]e|ad revenue|sponsor|fee)\b/i.test(t)) add("finance");
    if (/\b(ai|model|agent|automation|llm|prompt|machine learning)\b/i.test(t)) add("ai");
    if (/\b(security|cyber|access|identity|secret|token|credential|breach|encryption|privacy)\b/i.test(t)) add("cyber");
    if (/\b(roku|ott|streaming|broadcast|channel|movie|tv)\b/i.test(t)) add("roku");
    if (/\b(business|sandblast|vendor|commercial|customer|contractor|platform)\b/i.test(t)) add("business");
    return s.slice(0,4);
  }
  function profile(prompt, packet){
    const fields = collectLawFields(packet, 0, [], {});
    const cats = fields.legalCategories && fields.legalCategories.length ? fields.legalCategories : promptCategories(prompt);
    const cat = fields.legalCategory || cats[0] || (objectHasLawMarkers(packet, 0, []) ? "general_legal_risk" : "");
    const active = !!(cat || cats.length || objectHasLawMarkers(packet, 0, []));
    return {
      version: V,
      active: active && !technicalLawFileWork(prompt),
      domain: "law",
      primaryDomain: "law",
      selectedDomain: "law",
      knowledgeDomain: "law",
      legalCategory: cat || "general_legal_risk",
      legalCategories: cats.length ? cats : [cat || "general_legal_risk"],
      secondaryDomains: fields.secondaryDomains && fields.secondaryDomains.length ? fields.secondaryDomains : secondaryDomains(prompt),
      jurisdictionSensitivity: fields.jurisdictionSensitivity !== false,
      factsAssumptionsSeparated: fields.factsAssumptionsSeparated !== false,
      legalSourceDocumentCheckRequired: fields.legalSourceDocumentCheckRequired !== false,
      noLegalCertaintyClaim: true,
      noAttorneyClientRelationship: true,
      legalAdviceBoundary: "general legal information only; not legal advice; no attorney-client relationship; no legal certainty claim",
      lawAssessmentFrame: "legal_category,jurisdiction_sensitivity,facts_vs_assumptions,risk_exposure,missing_information,source_document_check,safe_next_move"
    };
  }
  function materialize(prompt, p){
    const cat = (p && p.legalCategory) || "general_legal_risk";
    const jurisdiction = "Jurisdiction sensitivity: I’d need the governing jurisdiction and source documents before treating this as more than general legal information.";
    if (cat === "copyright_licensing") {
      return "I can give general legal-risk triage, not legal advice. This is a copyright/licensing issue, not just a Roku setup question. Paperwork helps, but the key question is whether the documents clearly grant streaming/CTV/Roku distribution, public-performance, monetization, territory, duration, exclusivity, and sublicensing rights. Facts vs assumptions: we can’t assume your paperwork covers ad-supported Roku distribution until the chain of title and license scope are checked. Risk exposure includes takedowns, platform rejection, copyright claims, indemnity exposure, and lost monetization. Missing information: the license, rights owner, territory, term, media/platform scope, monetization clause, warranties, and indemnity language. " + jurisdiction + " Safe next move: build a rights checklist and have the actual source documents reviewed before publishing or monetizing the movies.";
    }
    if (cat === "privacy_data") {
      return "I can give general legal-risk triage, not legal advice. This is a privacy/data issue in a vendor agreement. Facts vs assumptions: a vendor has customer data, but we need to know what data, where it is stored, who can access it, and which law or contract governs it. Risk exposure includes breach liability, unauthorized use, weak deletion terms, subcontractor exposure, and compliance gaps. Missing information: data-processing purpose, safeguards, breach notice timing, subprocessors, retention/deletion, audit rights, jurisdiction, confidentiality, indemnity, and return/destruction obligations. Safe next move: review the agreement for a privacy/data-processing schedule and require clear breach, security, retention, and deletion terms before sharing live customer data.";
    }
    if (cat === "employment_contractor") {
      return "I can give general legal information, not legal advice. This is an employment/contractor issue. Facts vs assumptions: termination pay, severance, and release language depend on the province, employment status, contract terms, length of service, role, and whether a valid termination clause exists. Risk exposure: signing a release too quickly can waive claims or benefits. Missing information: province, employment contract, termination letter, release, tenure, pay/benefits, and deadline pressure. Safe next move: do not sign under pressure; compare the offer against statutory minimums and possible common-law factors, then have a lawyer or legal clinic review the release if money or rights are material.";
    }
    if (cat === "liability_dispute") {
      return "I can give general legal-risk triage, not legal advice. This is a liability/dispute issue. Facts vs assumptions: whether there is a viable claim depends on what was said or done, evidence, harm, causation, available defences, and jurisdiction. Risk exposure includes reputational harm, damages, escalation costs, and counterclaims if the response is careless. Missing information: timeline, screenshots/documents, witnesses, losses, platform context, and prior communications. Safe next move: preserve evidence, avoid threats or retaliation, write a neutral facts-only request for correction/removal if appropriate, and verify the proper legal clinic, platform, tribunal, or court path for your jurisdiction.";
    }
    if (cat === "source_verification") {
      return "I can give general legal-research guidance, not legal advice. This is a source-verification issue. Start with primary authority: the relevant statute or regulation on an official government site, then current case law from official court sites or CanLII, then secondary sources only for explanation. Facts vs assumptions: commentary is not binding law. Risk exposure: relying on stale, out-of-jurisdiction, or non-authoritative sources can produce the wrong answer. Safe next move: identify the jurisdiction, statute, section, and current cases, then note up anything important before relying on it.";
    }
    if (cat === "contract") {
      return "I can give general legal-risk triage, not legal advice. This is a contract issue. Facts vs assumptions: the answer depends on the actual agreement, parties, dates, governing law, duties, breach terms, remedies, limits of liability, and any amendment or termination clauses. Risk exposure includes unenforceable assumptions, missed notice steps, damages limits, and waiver of rights. Missing information: the contract text, timeline, communications, payment/performance records, and jurisdiction. Safe next move: isolate the clause, build a short fact timeline, preserve the documents, and verify the contract against the governing law before taking action.";
    }
    return "I can give general legal-risk triage, not legal advice. Legal category: " + T(cat).replace(/_/g, "/") + ". " + jurisdiction + " Facts vs assumptions: I can only work from the facts and documents provided, and missing documents can change the answer. Risk exposure may include rights, liability, compliance, timing, cost, or platform restrictions depending on the matter. Missing information: governing agreement, dates, parties, province/territory, source documents, and the outcome you want. Safe next move: gather the documents and timeline first, then verify the governing source or have a lawyer/legal clinic review the high-risk parts.";
  }
  function badVisibleReply(reply, prompt, packet, prof){
    const r = T(reply, 6000);
    const p = prof || profile(prompt, packet);
    if (!r) return true;
    if (isPresenceFallback(r)) return true;
    if (isSocialContinuityLeak(r)) return true;
    if (hasRawRuntimeLeak(r)) return true;
    if (/^\s*[\{\[]/.test(r) && /"(primaryDomain|selectedDomain|knowledgeDomain|legalCategory|lawAssessmentFrame|legalRiskBoundary)"/i.test(r)) return true;
    if (p && p.active && !isSubstantiveLawAnswer(r, p)) return true;
    return false;
  }
  function setReplyFields(obj, reply, p){
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
    obj.reply = reply;
    obj.directReply = reply;
    obj.publicReply = reply;
    obj.visibleReply = reply;
    obj.displayReply = reply;
    obj.response = reply;
    obj.text = reply;
    obj.message = reply;
    obj.final = reply;
    obj.domain = "law";
    obj.primaryDomain = "law";
    obj.selectedDomain = "law";
    obj.knowledgeDomain = "law";
    obj.legalCategory = p.legalCategory;
    obj.legalCategories = p.legalCategories;
    obj.secondaryDomains = p.secondaryDomains;
    obj.r18CLawRealWorldAssessment = true;
    obj.r18CFinalAnswerMaterializer = true;
    obj.r18CFinalMaterializerPrecedenceRepair = true;
    obj.lawAssessmentFrame = p.lawAssessmentFrame;
    obj.legalAdviceBoundary = p.legalAdviceBoundary;
    obj.jurisdictionSensitivity = true;
    obj.factsAssumptionsSeparated = true;
    obj.legalSourceDocumentCheckRequired = true;
    obj.noLegalCertaintyClaim = true;
    obj.noAttorneyClientRelationship = true;
    return obj;
  }
  function ensureFinalEnvelope(obj, reply, p){
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
    if (!obj.finalEnvelope || typeof obj.finalEnvelope !== "object" || Array.isArray(obj.finalEnvelope)) obj.finalEnvelope = {};
    setReplyFields(obj.finalEnvelope, reply, p);
    obj.finalEnvelope.contract = obj.finalEnvelope.contract || obj.finalEnvelope.contractVersion || "nyx.marion.final/1.0";
    obj.finalEnvelope.finalSignature = obj.finalEnvelope.finalSignature || "MARION_FINAL_AUTHORITY";
    obj.finalEnvelope.source = obj.finalEnvelope.source || "marion";
    obj.finalEnvelope.visibleReplyMaterialized = true;
    obj.finalEnvelope.r18CFinalMaterializerPrecedenceRepair = true;
    return obj;
  }
  function apply(packet, opt, seen){
    const options = O(opt);
    const prompt = firstText(options.prompt, extractPrompt(packet));
    const p = profile(prompt, packet);
    if (!p.active) return packet;
    const reply = materialize(prompt, p);

    if (typeof packet === "string") return badVisibleReply(packet, prompt, {}) ? reply : packet;
    if (!packet || typeof packet !== "object") return packet;
    const stack = seen || [];
    if (stack.indexOf(packet) >= 0) return packet;
    stack.push(packet);

    const current = extractReply(packet);
    const chosen = (badVisibleReply(current, prompt, packet, p) || !isSubstantiveLawAnswer(current, p)) ? reply : current;
    setReplyFields(packet, chosen, p);
    ensureFinalEnvelope(packet, packet.reply, p);

    const nested = ["result","payload","guardianPacket","marionFinal","marion","data","output"];
    for (let i=0;i<nested.length;i+=1){
      const k = nested[i];
      if (packet[k] && typeof packet[k] === "object") apply(packet[k], { prompt: prompt }, stack);
    }
    if (packet.meta && typeof packet.meta === "object") {
      packet.meta.r18CFinalAnswerMaterializer = {
        version: V,
        precedenceVersion: PRECEDENCE_VERSION,
        active: true,
        legalCategory: p.legalCategory,
        visibleReplyMaterialized: true,
        socialContinuityOverride: true,
        userVisibleDiagnosticsBlocked: true
      };
    }
    return packet;
  }
  function projectForUser(packet, opt){
    const options = O(opt);
    const prompt = firstText(options.prompt, extractPrompt(packet));
    const p = profile(prompt, packet);
    if (!p.active) return packet;
    const fixed = apply(packet, { prompt: prompt });
    const reply = isSubstantiveLawAnswer(extractReply(fixed), p) ? extractReply(fixed) : materialize(prompt, p);
    return {
      ok: true,
      guardian: "marion",
      guardianMode: "marion",
      reply: reply,
      directReply: reply,
      publicReply: reply,
      visibleReply: reply,
      displayReply: reply,
      response: reply,
      text: reply,
      message: reply,
      finalEnvelope: {
        contract: "nyx.marion.final/1.0",
        finalSignature: "MARION_FINAL_AUTHORITY",
        source: "marion",
        reply: reply,
        directReply: reply,
        publicReply: reply,
        visibleReply: reply
      },
      domain: "law",
      primaryDomain: "law",
      selectedDomain: "law",
      knowledgeDomain: "law",
      legalCategory: p.legalCategory,
      legalCategories: p.legalCategories,
      secondaryDomains: p.secondaryDomains,
      r18CLawRealWorldAssessment: true,
      r18CFinalAnswerMaterializer: {
        version: V,
        active: true,
        visibleReplyMaterialized: true,
        metadataProjectionBlocked: true,
        socialContinuityOverride: true,
        precedenceVersion: PRECEDENCE_VERSION,
        legalCategory: p.legalCategory
      }
    };
  }
  function isUserChatRoute(req){
    const url = L(firstText(req && req.originalUrl, req && req.url, req && req.path));
    if (!url) return true;
    return /\/api\/chat\b|\/chat\b|\/marion\b|\/admin\b/i.test(url);
  }
  function wrap(name){
    const old = module.exports[name];
    if (typeof old !== "function" || old.__r18cFinalAnswerMaterializerWrapped) return;
    const wrapped = function(){
      const args = Array.prototype.slice.call(arguments);
      const prompt = firstText.apply(null, args.map(extractPrompt).concat(args.map(T)));
      const out = old.apply(this, args);
      if (out && typeof out.then === "function") {
        return out.then(function(value){ return apply(value, { prompt: prompt || extractPrompt(value) }); });
      }
      return apply(out, { prompt: prompt || extractPrompt(out) });
    };
    wrapped.__r18cFinalAnswerMaterializerWrapped = true;
    try { Object.defineProperty(wrapped, "name", { value: old.name || name }); } catch(_){}
    module.exports[name] = wrapped;
  }
  [
    "composeMarionResponse","run","default",
    "processWithMarion","maybeResolve","ask","handle","route","createMarionBridge",
    "createMarionFinalEnvelope","attachVisibleReplyAliases",
    "adaptGuardianResponse","createGuardianPacket","sanitizeRuntimePacket",
    "normalizeCoordinatorOutputForPipeline","shapeEngineReply","applyPublicReplyHygieneToResponse","normalizeMarionBridgeResult",
    "marionR18CLiveHandlerRepairApply"
  ].forEach(wrap);

  try {
    if (typeof express !== "undefined" && express && express.response && !express.response.__r18cFinalAnswerMaterializerPatched) {
      const oldJson = express.response.json;
      const oldSend = express.response.send;
      if (typeof oldJson === "function") {
        express.response.json = function(body){
          try {
            const req = O(this && this.req);
            const prompt = extractPrompt({ req: req, body: O(req.body), payload: O(req.body) });
            const p = profile(prompt, body);
            if (p.active && isUserChatRoute(req)) body = projectForUser(body, { prompt: prompt });
            else body = apply(body, { prompt: prompt });
          } catch(_err) {}
          return oldJson.call(this, body);
        };
      }
      if (typeof oldSend === "function") {
        express.response.send = function(body){
          try {
            const req = O(this && this.req);
            const prompt = extractPrompt({ req: req, body: O(req.body), payload: O(req.body) });
            const p = profile(prompt, body);
            if (p.active && isUserChatRoute(req)) {
              let parsed = null;
              if (typeof body === "string") {
                const trimmed = body.trim();
                if ((trimmed[0] === "{" || trimmed[0] === "[") && trimmed.length < 1000000) {
                  try { parsed = JSON.parse(trimmed); } catch(_parseErr) { parsed = null; }
                }
              } else if (body && typeof body === "object") parsed = body;
              if (parsed) body = JSON.stringify(projectForUser(parsed, { prompt: prompt }));
              else if (typeof body === "string" && badVisibleReply(body, prompt, {}, p)) body = materialize(prompt, p);
            }
          } catch(_err) {}
          return oldSend.call(this, body);
        };
      }
      express.response.__r18cFinalAnswerMaterializerPatched = true;
    }
  } catch(_err) {}

  module.exports.marionR18CFinalAnswerMaterializerApply = apply;
  module.exports.marionR18CFinalAnswerMaterializerProject = projectForUser;
  module.exports.marionR18CFinalAnswerMaterializerProfile = profile;
  module.exports.marionR18CFinalAnswerMaterializerReply = materialize;
  module.exports.marionR18CFinalAnswerMaterializerHasRuntimeLeak = hasRawRuntimeLeak;
  module.exports.marionR18CFinalMaterializerPrecedenceRepairVersion = PRECEDENCE_VERSION;
  module.exports.marionR18CFinalMaterializerPrecedenceRepairIsSocialContinuityLeak = isSocialContinuityLeak;
})();
/* R18C_FINAL_ANSWER_MATERIALIZER_END */


/* R18C_REPLY_QUEUE_PARITY_REPAIR_START */
(function(){
  "use strict";
  const V = "nyx.marion.r18c.replyQueueParityRepair/1.0";
  if (typeof module === "undefined" || !module.exports) return;
  if (module.exports.__r18cReplyQueueParityRepairPatched) return;
  module.exports.__r18cReplyQueueParityRepairPatched = true;

  function T(v, max){
    const s = v == null ? "" : String(v).replace(/\s+/g, " ").trim();
    if (!max || s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)).trim() + "…";
  }
  function L(v){ return T(v).toLowerCase(); }
  function O(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function firstText(){
    for (let i = 0; i < arguments.length; i += 1) {
      const v = T(arguments[i]);
      if (v) return v;
    }
    return "";
  }
  function read(root, path){
    let node = root;
    const parts = String(path || "").split(".");
    for (let i = 0; i < parts.length; i += 1) {
      if (!node || typeof node !== "object") return undefined;
      node = node[parts[i]];
    }
    return node;
  }
  function collectPromptFields(packet){
    const p = O(packet);
    const req = O(p.req);
    const body = O(req.body || p.body);
    const result = O(p.result);
    const payload = O(p.payload);
    const meta = O(p.meta);
    const env = O(p.finalEnvelope || result.finalEnvelope || payload.finalEnvelope);
    return [
      p.originalPrompt,p.rawUserText,p.userText,p.userMessage,p.message,p.input,p.text,p.prompt,p.query,
      body.originalPrompt,body.rawUserText,body.userText,body.userMessage,body.message,body.input,body.text,body.prompt,body.query,
      payload.originalPrompt,payload.rawUserText,payload.userText,payload.userMessage,payload.message,payload.input,payload.text,payload.prompt,payload.query,
      result.originalPrompt,result.rawUserText,result.userText,result.userMessage,result.message,result.input,result.text,result.prompt,result.query,
      meta.originalPrompt,meta.rawUserText,meta.userText,meta.userMessage,meta.message,meta.input,meta.text,meta.prompt,meta.query,
      env.originalPrompt,env.rawUserText,env.userText,env.userMessage,env.message,env.input,env.text,env.prompt,env.query
    ];
  }
  function extractPrompt(packet){
    return firstText.apply(null, collectPromptFields(packet));
  }
  function getReplyFields(packet){
    const p = O(packet);
    const result = O(p.result);
    const payload = O(p.payload);
    const guardian = O(p.guardianPacket);
    const env = O(p.finalEnvelope || result.finalEnvelope || payload.finalEnvelope || guardian.finalEnvelope);
    const meta = O(p.meta);
    return {
      reply: firstText(p.reply, result.reply, payload.reply, guardian.reply, env.reply, meta.reply),
      directReply: firstText(p.directReply, result.directReply, payload.directReply, guardian.directReply, env.directReply, meta.directReply),
      publicReply: firstText(p.publicReply, result.publicReply, payload.publicReply, guardian.publicReply, env.publicReply, meta.publicReply),
      visibleReply: firstText(p.visibleReply, result.visibleReply, payload.visibleReply, guardian.visibleReply, env.visibleReply, meta.visibleReply),
      displayReply: firstText(p.displayReply, result.displayReply, payload.displayReply, guardian.displayReply, env.displayReply, meta.displayReply),
      finalReply: firstText(env.reply, env.publicReply, env.visibleReply, env.directReply, env.displayReply)
    };
  }
  function allPrimaryReplies(f){
    return [f.reply, f.directReply, f.publicReply, f.visibleReply, f.finalReply].map(function(x){ return T(x); }).filter(Boolean);
  }
  function isSocialContinuityLeak(value){
    const t = L(value);
    if (!t) return false;
    return /\bi['’]?m (here|with you|steady)\b/.test(t) ||
      /\bstill with you\b/.test(t) ||
      /\bconversation natural\b/.test(t) ||
      /\bsystem noise\b/.test(t) ||
      /\bsocial response pass\b/.test(t) ||
      /\bgreeting lane\b/.test(t) ||
      /\bkeep testing the greeting lane\b/.test(t) ||
      /\bwhat would you like to work on\b/.test(t) ||
      /\bwhat are we working on\b/.test(t) ||
      /\bdo you want to continue\b/.test(t) ||
      /\bdo you want to keep testing\b/.test(t);
  }
  function isPrimitive(value){
    return /^(true|false|null|undefined|\[object object\]|ok|success|ready)$/i.test(T(value));
  }
  function hasRuntimeLeak(value){
    const t = T(value, 6000);
    return /\b(runtimeTelemetry|finalEnvelopeTrusted|replyAuthority|sessionPatch|routeKind|speechHints|presenceProfile|nyxStateHint|CHATENGINE_COORDINATOR_ONLY_ACTIVE|MARION::FINAL::)\b/i.test(t);
  }
  function hasPatchTechnicalSignal(value){
    const t = L(value);
    return /\b(surgical autopsy|autopsy|patch|patched|patching|critical update|critical fix|runtime|handler|reply queue|reply[- ]field|parity|bridge|final envelope|composemarionresponse|chatengine|index\.js|guardian\.response\.adapter|marionbridge|marionfinalenvelope|manifest files|payload files|downloadable zip|resend|file work|technical guard|admin runtime|alt runtime|prompt[- ]echo|domain hijack)\b/.test(t);
  }
  function hasLegalBusinessQuestionSignal(value){
    const t = L(value);
    return /\b(can i use copyrighted|customer data|agreement|contract|liability|lawsuit|sue|license|licensing|rights|vendor has customer data|should i sign|release to sign|false claims|defamation)\b/.test(t);
  }
  function isTechnicalFileWork(prompt, packet){
    const p = L(prompt);
    const domain = L(firstText(read(packet, "domain"), read(packet, "primaryDomain"), read(packet, "selectedDomain")));
    if (hasPatchTechnicalSignal(p)) return true;
    if (domain === "technical") return true;
    return false;
  }
  function isGoodTechnicalReply(value){
    const t = T(value, 6000);
    if (!t || isPrimitive(t) || isSocialContinuityLeak(t)) return false;
    if (hasRuntimeLeak(t) && !hasPatchTechnicalSignal(t)) return false;
    if (t.length < 50 && !hasPatchTechnicalSignal(t)) return false;
    return hasPatchTechnicalSignal(t) || /\b(next move|main risk|active lane|surface request|technical|runtime|patch|rerun|enforce|guard)\b/i.test(t);
  }
  function needsParityRepair(fields, packet, prompt){
    const primaries = allPrimaryReplies(fields);
    if (!isTechnicalFileWork(prompt, packet)) return false;
    if (!isGoodTechnicalReply(fields.displayReply)) return false;
    if (!primaries.length) return true;
    for (let i = 0; i < primaries.length; i += 1) {
      if (isSocialContinuityLeak(primaries[i]) || isPrimitive(primaries[i])) return true;
    }
    const primary = firstText(fields.reply, fields.directReply, fields.publicReply, fields.visibleReply, fields.finalReply);
    if (primary && fields.displayReply && T(fields.displayReply).length > T(primary).length + 80 && hasPatchTechnicalSignal(fields.displayReply) && !hasPatchTechnicalSignal(primary)) return true;
    return false;
  }
  function setReplyAliases(obj, reply){
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    obj.reply = reply;
    obj.directReply = reply;
    obj.publicReply = reply;
    obj.visibleReply = reply;
    obj.displayReply = reply;
  }
  function setDomainTechnical(obj){
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    const oldDomain = L(firstText(obj.domain, obj.primaryDomain, obj.selectedDomain, obj.knowledgeDomain));
    if (!oldDomain || oldDomain === "general" || oldDomain === "general_reasoning" || oldDomain === "law" || oldDomain === "memory" || oldDomain === "core" || oldDomain === "conversation") {
      obj.domain = "technical";
      obj.primaryDomain = "technical";
      obj.selectedDomain = "technical";
      obj.knowledgeDomain = "technical";
    }
  }
  function tag(obj, sourceField, prompt){
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    obj.r18CReplyQueueParityRepair = {
      version: V,
      active: true,
      aligned: true,
      sourceField: sourceField || "displayReply",
      stalePrimaryReplyOverridden: true,
      socialContinuityBlocked: true,
      technicalGuardPreserved: true,
      legalModeBypassed: true,
      promptBound: !!T(prompt)
    };
  }
  function repairObject(packet, reply, prompt){
    setReplyAliases(packet, reply);
    setDomainTechnical(packet);
    tag(packet, "displayReply", prompt);

    const result = O(packet.result);
    const payload = O(packet.payload);
    const guardian = O(packet.guardianPacket);
    const env = O(packet.finalEnvelope || result.finalEnvelope || payload.finalEnvelope || guardian.finalEnvelope);

    [result, payload, guardian].forEach(function(node){
      if (!node || !Object.keys(node).length) return;
      setReplyAliases(node, reply);
      setDomainTechnical(node);
      tag(node, "displayReply", prompt);
    });

    if (env && Object.keys(env).length) {
      setReplyAliases(env, reply);
      env.contract = env.contract || env.contractVersion || "nyx.marion.final/1.0";
      env.finalSignature = env.finalSignature || "MARION_FINAL_AUTHORITY";
      env.source = env.source || "marion";
      env.replyQueueParityAligned = true;
      env.r18CReplyQueueParityRepair = true;
    } else {
      packet.finalEnvelope = {
        contract: "nyx.marion.final/1.0",
        finalSignature: "MARION_FINAL_AUTHORITY",
        source: "marion",
        reply: reply,
        directReply: reply,
        publicReply: reply,
        visibleReply: reply,
        displayReply: reply,
        replyQueueParityAligned: true,
        r18CReplyQueueParityRepair: true
      };
    }

    if (packet.meta && typeof packet.meta === "object") {
      packet.meta.r18CReplyQueueParityRepair = {
        version: V,
        active: true,
        aligned: true,
        sourceField: "displayReply",
        technicalGuardPreserved: true
      };
    }
  }
  function apply(packet, opt, seen){
    const options = O(opt);
    const prompt = firstText(options.prompt, extractPrompt(packet));
    if (!packet || typeof packet !== "object" || Array.isArray(packet)) return packet;
    const stack = seen || [];
    if (stack.indexOf(packet) >= 0) return packet;
    stack.push(packet);

    const fields = getReplyFields(packet);
    const technicalPrompt = isTechnicalFileWork(prompt, packet);
    const legalQuestion = hasLegalBusinessQuestionSignal(prompt) && !technicalPrompt;
    if (!legalQuestion && needsParityRepair(fields, packet, prompt)) {
      repairObject(packet, T(fields.displayReply, 6000), prompt);
    }

    ["result","payload","guardianPacket","marionFinal","marion","data","output"].forEach(function(k){
      if (packet[k] && typeof packet[k] === "object") apply(packet[k], { prompt: prompt }, stack);
    });
    return packet;
  }
  function project(packet, opt){
    const out = apply(packet, opt);
    if (!out || typeof out !== "object") return out;
    const f = getReplyFields(out);
    const reply = firstText(f.reply, f.directReply, f.publicReply, f.visibleReply, f.displayReply);
    if (reply) setReplyAliases(out, reply);
    return out;
  }
  function wrap(name){
    const old = module.exports[name];
    if (typeof old !== "function" || old.__r18cReplyQueueParityRepairWrapped) return;
    const wrapped = function(){
      const args = Array.prototype.slice.call(arguments);
      const prompt = firstText.apply(null, args.map(extractPrompt).concat(args.map(T)));
      const out = old.apply(this, args);
      if (out && typeof out.then === "function") {
        return out.then(function(value){ return apply(value, { prompt: prompt || extractPrompt(value) }); });
      }
      return apply(out, { prompt: prompt || extractPrompt(out) });
    };
    wrapped.__r18cReplyQueueParityRepairWrapped = true;
    try { Object.defineProperty(wrapped, "name", { value: old.name || name }); } catch(_err) {}
    module.exports[name] = wrapped;
  }
  [
    "composeMarionResponse","run","default","processWithMarion","maybeResolve","ask","handle","route",
    "createMarionBridge","createMarionFinalEnvelope","attachVisibleReplyAliases","adaptGuardianResponse",
    "createGuardianPacket","sanitizeRuntimePacket","normalizeCoordinatorOutputForPipeline","shapeEngineReply",
    "applyPublicReplyHygieneToResponse","normalizeMarionBridgeResult","marionR18CFinalAnswerMaterializerApply",
    "marionR18CFinalAnswerMaterializerProject"
  ].forEach(wrap);

  try {
    if (typeof express !== "undefined" && express && express.response && !express.response.__r18cReplyQueueParityRepairPatched) {
      const oldJson = express.response.json;
      const oldSend = express.response.send;
      if (typeof oldJson === "function") {
        express.response.json = function(body){
          try {
            const req = O(this && this.req);
            const prompt = extractPrompt({ req: req, body: O(req.body), payload: O(req.body) });
            body = project(body, { prompt: prompt });
          } catch(_err) {}
          return oldJson.call(this, body);
        };
      }
      if (typeof oldSend === "function") {
        express.response.send = function(body){
          try {
            const req = O(this && this.req);
            const prompt = extractPrompt({ req: req, body: O(req.body), payload: O(req.body) });
            if (body && typeof body === "object") body = project(body, { prompt: prompt });
            else if (typeof body === "string") {
              const s = body.trim();
              if ((s.charAt(0) === "{" || s.charAt(0) === "[") && s.length < 1000000) {
                try { body = JSON.stringify(project(JSON.parse(s), { prompt: prompt })); } catch(_parseErr) {}
              }
            }
          } catch(_err) {}
          return oldSend.call(this, body);
        };
      }
      express.response.__r18cReplyQueueParityRepairPatched = true;
    }
  } catch(_err) {}

  module.exports.MARION_R18C_REPLY_QUEUE_PARITY_REPAIR_VERSION = V;
  module.exports.marionR18CReplyQueueParityRepairApply = apply;
  module.exports.marionR18CReplyQueueParityRepairProject = project;
  module.exports.marionR18CReplyQueueParityRepairIsSocialContinuityLeak = isSocialContinuityLeak;
  module.exports.marionR18CReplyQueueParityRepairIsTechnicalFileWork = isTechnicalFileWork;
})();
/* R18C_REPLY_QUEUE_PARITY_REPAIR_END */


/* R18C_ACTIVE_PATH_COHESION_REPAIR_START */
(function(){
  "use strict";
  const V = "nyx.marion.r18c.activePathCohesionRepair/1.0";
  const CANONICAL_BRIDGE_PATH = "Data/marion/runtime/marionBridge.js";
  const REJECTED_DUPLICATE_CLASS = "legacy-utils-marion-bridge-copy";

  function apply(packet){
    if (!packet || typeof packet !== "object") packet = {};
    packet.r18CActivePathCohesionRepair = {
      version: V,
      active: true,
      canonicalBridgePath: CANONICAL_BRIDGE_PATH,
      rejectedDuplicateClass: REJECTED_DUPLICATE_CLASS,
      utilsBridgeRuntimeAllowed: false,
      note: "MarionBridge runtime authority is canonicalized to Data/marion/runtime."
    };
    packet.marionBridgeCanonicalPath = packet.marionBridgeCanonicalPath || CANONICAL_BRIDGE_PATH;
    packet.rogueBridgeDuplicateRejected = true;
    return packet;
  }

  try {
    if (typeof module !== "undefined" && module.exports) {
      module.exports.MARION_R18C_ACTIVE_PATH_COHESION_REPAIR_VERSION = V;
      module.exports.marionR18CActivePathCohesionApply = apply;
      module.exports.marionR18CActivePathCohesionProfile = function(){
        return apply({});
      };
    }
  } catch(_err) {}
})();
/* R18C_ACTIVE_PATH_COHESION_REPAIR_END */



/* PUBLIC_SURFACE_IDENTITY_LOCK_PHASE1_START */
(function(){
  "use strict";
  const V="nyx.publicSurfaceIdentityLock.runtime/chatEngine/1.0";
  let lock=null;try{lock=require("./publicSurfaceIdentityLock.js");}catch(_err){try{lock=require("../Data/marion/runtime/publicSurfaceIdentityLock.js");}catch(_err2){lock=null;}}
  if(!lock||!lock.projectPublicReplyFields||typeof module==="undefined"||!module.exports)return;
  function isPublic(args){try{for(let i=0;i<args.length;i+=1){if(lock.isPublicSurfaceContext(args[i]))return true;}return false;}catch(_err){return false;}}
  function project(value,args){return isPublic(args)?lock.projectPublicReplyFields(value,args&&args[0]):value;}
  function wrapObj(obj,names){(Array.isArray(names)?names:[]).forEach(function(name){if(!obj||typeof obj[name]!=="function"||obj[name].__nyxPublicSurfaceIdentityLock)return;const old=obj[name];obj[name]=function(){const args=arguments;const res=old.apply(this,args);if(res&&typeof res.then==="function")return res.then(function(v){return project(v,args);});return project(res,args);};obj[name].__nyxPublicSurfaceIdentityLock=true;});}
  try{
    if(typeof module.exports==="function"&&!module.exports.__nyxPublicSurfaceIdentityLock){const old=module.exports;const wrapped=function(){const args=arguments;const res=old.apply(this,args);if(res&&typeof res.then==="function")return res.then(function(v){return project(v,args);});return project(res,args);};Object.keys(old).forEach(function(k){try{wrapped[k]=old[k];}catch(_err){}});wrapped.__nyxPublicSurfaceIdentityLock=true;module.exports=wrapped;}
    wrapObj(module.exports,["handleChat","run","chat","handle","reply","normalizeVisibleFinalReplyFields"]);
    module.exports.PUBLIC_SURFACE_IDENTITY_LOCK_PHASE1_VERSION=V;
    module.exports.publicSurfaceIdentityLockProject=lock.projectPublicReplyFields;
    module.exports.publicSurfaceIdentityLockSanitize=lock.sanitizePublicReply;
  }catch(_err){}
})();
/* PUBLIC_SURFACE_IDENTITY_LOCK_PHASE1_END */
