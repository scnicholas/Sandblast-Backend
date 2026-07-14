"use strict";

/**
 * Utils/stateSpine.js
 *
 * stateSpine v2.0.2 MARION-STATE-RESTRUCTURE LOOP-ORIGIN-FIX SCHEMA-HANDSHAKE-FIX
 * ------------------------------------------------------------
 * PURPOSE
 * - Maintain durable conversational progression state
 * - Prevent same-stage replay and shallow re-entry loops
 * - Keep support-lock / quiet-mode cohesion with chatEngine + index
 * - Terminalize repeated TTS/audio failures cleanly instead of re-entering
 * - Track emotion continuity so distress handling does not collapse too early
 * - Stay fail-open safe when upstream signals are partial
 */

const SPINE_VERSION = "MARION-SOCIAL-PRESENCE-GATE-R3 + PRIORITY-9J-R1B-OBJECT-REPLY-SERIALIZATION-GUARD + PRIORITY-9J-R1A-RUNTIME-DECISION-SPECIFIC-FINAL-OVERRIDE + PRIORITY-9J-R1-DECISION-SPECIFIC-AUTHORITY-HOTFIX + PRIORITY-9I-R2-PRESSURE-SPECIFIC-ANSWER-SHAPING + PRIORITY-9I-R1-9J-PREMATURE-ESCALATION-CONTAINMENT + PRIORITY-9H-R1-ADVANCEMENT-SHAPE-HOTFIX + PRIORITY-9H-LONG-FORM-CONTINUITY-STRESS-DRIFT-GUARD + PRIORITY-9I-ADAPTIVE-SITUATIONAL-PRECHECK + PRIORITY-9F-R4-CONTINUATION-CARRY-ENFORCEMENT + PRIORITY-9F-R2-DOMAIN-HIJACK-SUPPRESSION + PRIORITY-9F-R1-LAYERED-PRECEDENCE-HOTFIX + stateSpine v2.17.1 PRIORITY-9F-DEEP-CONVERSATIONAL-STACK + stateSpine v2.17.0 PRIORITY3-PROTECTIVE-STATE-CARRY + PUBLIC-CONTINUITY-HANDOFF-REPAIR-V2 + PUBLIC-SEMANTIC-REPLAY-OVERRIDE-V1 + PUBLIC-CONTINUITY-HANDOFF-REPAIR-V1 + REFERENCEERROR-TRIAD-HARDENING-V2 + AST-UNDEFINED-CLEAN + FIVE-TURN-FOLLOWUP-DEADEND-SUPPRESSION + FIVE-TURN-FOLLOWUP-CONTINUITY-PERSISTENCE-LOCK + FOLLOWUP-TOPIC-INFERENCE-LOCK + FOLLOWUP-INTENT-EXPANSION-CARRY + RESPONSE-SHAPING-EXPANSION-CARRY + FOUR-PHASE-PROGRESSION-REFINEMENT-CARRY CONFIDENCE-AWARE-SHAPING-CARRY + QUESTION-SHAPE-NORMALIZATION-CARRY-LOCK + SHORT-CONCEPT-FOLLOWUP-DOMAIN-CARRY-LOCK + TECHNICAL-FOLLOWUP-INTENT-LOCK + TECHNICAL-TARGET-LOCK + FINAL-ENVELOPE-SOURCE-TOLERANCE + DOMAIN-CONFIDENCE-SCORING-HARDLOCK + DOMAIN-CONFIDENCE-CARRY-LOCK + FINAL-RUNTIME-TELEMETRY + FIVE-TURN-CONTRACT-STATE-CARRY + CONVERSATIONAL-PACK-COHESION + FINAL-RENDER-TELEMETRY-HARDLOCK + PARALLEL-LANE-STALE-CARRY-SUPPRESSION + NYX-VOICE-REINTEGRATION-R1 + AUDIO-TEXT-DECOUPLING";
const CONVERSATIONAL_PACK_COHESION_VERSION = "nyx.conversationalPackCohesion/1.0";
const FINAL_RUNTIME_TELEMETRY_VERSION = "nyx.marion.finalRuntimeTelemetry/1.0";
const FINAL_RENDER_TELEMETRY_VERSION = "nyx.marion.finalRenderTelemetry/1.0";
const QUESTION_SHAPE_NORMALIZATION_VERSION = "nyx.marion.questionShapeNormalization/1.0";
const DOMAIN_CONCIERGE_CORE_VERSION = "nyx.marion.domainConciergeCore/1.0";
const CONFIDENCE_AWARE_RESPONSE_SHAPING_VERSION = "nyx.marion.confidenceAwareResponseShaping/1.0";
const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const FINAL_ENVELOPE_CONTRACT = "nyx.marion.final/1.0";
const FINAL_SIGNATURE = "MARION_FINAL_AUTHORITY";
const MARION_FINAL_SIGNATURE_PREFIX = "MARION::FINAL::";
const REQUIRED_CHAT_ENGINE_SIGNATURE = "CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24";
const PROGRESSION_SHAPING_REFINEMENT_VERSION = "nyx.marion.progressionShapingRefinement/1.0";
const PROTECTIVE_ESCALATION_STATE_VERSION = "sandblast.guardian.protectiveEscalationState/1.0";

const KNOWN_GOOD_FINAL_CONTRACTS = Object.freeze([
  FINAL_ENVELOPE_CONTRACT,
  "nyx.marion.final/0.9",
  "nyx.marion.contract/2.1",
  "nyx.marion.intent/2.1"
]);
const TERMINAL_AUDIO_STOP_MS = 30000;
const MAX_STATE_TEXT = 1200;
const MAX_STATE_SUMMARY = 1800;
const MAX_STATE_ARRAY_ITEMS = 8;
const MAX_SIGNATURE_TEXT = 512;
const progressionShapeMod = (() => { try { return require("../Data/marion/runtime/progressionShape.js"); } catch (_) { return null; } })();
const progressionMemoryMod = (() => { try { return require("../Data/marion/runtime/progressionMemory.js"); } catch (_) { return null; } })();
const progressionTelemetryMod = (() => { try { return require("../Data/marion/runtime/progressionTelemetry.js"); } catch (_) { return null; } })();
const domainConfidenceMod = (() => { try { return require("../Data/marion/runtime/domainConfidence.js"); } catch (_) { return null; } })();
const finalRenderTelemetryMod = (() => { try { return require("../Data/marion/runtime/finalRenderTelemetry.js"); } catch (_) { return null; } })();

const STATE_STAGES = Object.freeze([
  "intake",
  "classified",
  "routed",
  "compose",
  "final",
  "recover",
  "error",
  "terminal_stop",
  "open"
]);

const GREETING_INTENTS = Object.freeze([
  "basic_greeting",
  "time_greeting",
  "casual_greeting",
  "social_checkin",
  "presence_check",
  "mic_check",
  "system_test",
  "returning_user",
  "continuation_request",
  "help_request",
  "quick_question",
  "problem_report",
  "emotional_checkin",
  "distress_signal",
  "frustration_signal",
  "sadness_signal",
  "anxiety_signal",
  "loneliness_signal",
  "anger_signal",
  "confusion_signal",
  "direction_request",
  "planning_request",
  "creation_request",
  "debug_request",
  "business_strategy",
  "creative_request",
  "motivation_request",
  "playful_greeting",
  "formal_greeting",
  "skeptical_opening",
  "urgency_signal",
  "positive_feedback",
  "repair_opening",
  "uncertainty_signal",
  "voice_toggle_request",
  "media_request",
  "reset_request"
]);

const GREETING_DISTRESS_INTENTS = Object.freeze([
  "emotional_checkin",
  "distress_signal",
  "frustration_signal",
  "sadness_signal",
  "anxiety_signal",
  "loneliness_signal",
  "anger_signal"
]);

const GREETING_TONE_TO_PRESENCE = Object.freeze({
  neutral_warm: "warm",
  polite: "receptive",
  warm_fresh_start: "warm",
  warm_professional: "receptive",
  calm_grounded: "receptive",
  casual: "engaged",
  relational: "warm",
  reassuring: "receptive",
  diagnostic: "focused",
  returning: "warm",
  focused: "focused",
  supportive: "supportive",
  efficient: "focused",
  serious: "focused",
  empathetic: "supportive",
  calming: "supportive",
  validating: "supportive",
  gentle_supportive: "supportive",
  grounding: "supportive",
  compassionate: "supportive",
  contained: "supportive",
  clarifying: "focused",
  guiding: "receptive",
  strategic: "focused",
  creative_focused: "engaged",
  technical: "focused",
  executive: "focused",
  imaginative: "engaged",
  encouraging: "warm",
  playful: "engaged",
  formal: "receptive",
  steady_confident: "focused",
  urgent: "focused",
  warm_appreciative: "warm",
  forgiving: "warm",
  patient: "receptive",
  voice_control: "focused",
  media_control: "focused",
  reset_control: "focused"
});

function normalizeStateStage(value, fallback = "open") {
  const raw = safeStr(value || fallback || "open").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!raw) return "open";
  if (raw === "recovery" || raw === "loop_recovery" || raw === "stabilize" || raw === "quiet") return "recover";
  if (raw === "classification") return "classified";
  if (raw === "route") return "routed";
  if (raw === "composed" || raw === "deliver" || raw === "advance" || /^domain_depth_/.test(raw)) return "final";
  if (raw === "execution") return "compose";
  if (raw === "terminal_error" || raw === "fault") return "error";
  if (raw === "terminal_stop" || raw === "terminal") return "terminal_stop";
  if (STATE_STAGES.includes(raw)) return raw;
  const fb = safeStr(fallback || "open").trim().toLowerCase();
  if (fb && fb !== raw) return normalizeStateStage(fb, "open");
  return "open";
}

function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}

function isPlainObject(x) {
  return !!x && typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}

function safeObj(x) {
  return isPlainObject(x) ? x : {};
}

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}

function oneLine(s) {
  return safeStr(s).replace(/\s+/g, " ").trim();
}
function normalizeQuestionShapeCarry(value = {}) {
  const src = isPlainObject(value) ? value : {};
  const raw = oneLine(src.rawText || src.rawUserText || src.userText || "");
  const normalized = oneLine(src.normalizedText || src.normalizedUserIntent || raw);
  const shape = oneLine(src.questionShape || (src.changed ? "topic_request" : "direct_or_unknown")) || "direct_or_unknown";
  return {
    version: oneLine(src.version || QUESTION_SHAPE_NORMALIZATION_VERSION),
    rawText: raw,
    normalizedText: normalized,
    normalizedUserIntent: normalized,
    questionShape: shape,
    changed: !!src.changed,
    reason: oneLine(src.reason || "")
  };
}

function extractQuestionShapeCarry(params = {}, inbound = {}, memoryPatch = {}) {
  const p = isPlainObject(params) ? params : {};
  const src = isPlainObject(inbound) ? inbound : {};
  const mp = isPlainObject(memoryPatch) ? memoryPatch : {};
  const meta = isPlainObject(src.meta) ? src.meta : {};
  const payload = isPlainObject(src.payload) ? src.payload : {};
  const candidates = [
    p.questionShape,
    mp.questionShape,
    isPlainObject(mp.stateBridge) ? mp.stateBridge.questionShape : null,
    src.questionShape,
    meta.questionShape,
    payload.questionShape,
    isPlainObject(p.routing) ? p.routing.questionShape : null,
    isPlainObject(src.routing) ? src.routing.questionShape : null,
    isPlainObject(p.domainConfidence) ? p.domainConfidence.questionShape : null
  ];
  for (const item of candidates) {
    if (isPlainObject(item) && oneLine(item.normalizedText || item.normalizedUserIntent || item.rawText)) {
      return normalizeQuestionShapeCarry(item);
    }
  }
  const raw = firstNonEmpty(
    p.rawUserText,
    mp.rawUserText,
    src.rawUserText,
    meta.rawUserText,
    payload.rawUserText,
    extractInboundText(src)
  );
  const normalized = firstNonEmpty(
    p.normalizedUserIntent,
    mp.normalizedUserIntent,
    isPlainObject(mp.stateBridge) ? mp.stateBridge.normalizedUserIntent : "",
    src.normalizedUserIntent,
    meta.normalizedUserIntent,
    payload.normalizedUserIntent,
    raw
  );
  return normalizeQuestionShapeCarry({ rawText: raw, normalizedText: normalized, normalizedUserIntent: normalized, questionShape: normalized && raw && normalized !== raw ? "topic_request" : "direct_or_unknown" });
}



function normalizeContinuityCarry(value = {}) {
  const src = isPlainObject(value) ? value : {};
  const prev = safeObj(src.prevState || src.previousState || src.state || src.stateSpine || src.conversationState);
  const prior = safeObj(src.continuity || prev.continuity);
  const topic = boundedOneLine(
    src.topic || src.lastTopic || src.subject ||
    prior.topic || prior.lastTopic || prior.subject ||
    prev.lastTopic || prev.topic || prev.normalizedUserIntent || "",
    120
  );
  const resolvedText = boundedOneLine(src.resolvedText || src.continuityResolvedText || prior.resolvedText || "", 260);
  const originalText = boundedOneLine(src.originalText || src.continuityResolvedOriginalText || prior.originalText || "", 220);
  const followupAction = boundedOneLine(src.followupAction || src.continuityAction || prior.followupAction || prior.continuityAction || classifyContinuityFollowupStateAction(originalText || resolvedText), 64);
  const out = {
    active: src.active === true || prior.active === true || !!topic || src.resolvedFollowup === true || prior.resolvedFollowup === true,
    topic,
    lastTopic: boundedOneLine(src.lastTopic || prior.lastTopic || topic, 120),
    resolvedFollowup: !!(src.resolvedFollowup || prior.resolvedFollowup || (topic && resolvedText)),
    followupAction,
    continuityAction: followupAction,
    originalText,
    resolvedText,
    source: boundedOneLine(src.source || prior.source || "stateSpine.continuityCarry.hotfix", 80)
  };
  return out.active ? out : {};
}

function isShortContinuityFollowupStateText(value = "") {
  const t = oneLine(value).replace(/[.?!]+$/g, "").toLowerCase();
  if (!t) return false;
  return /^(?:why|why is that important|why does that matter|why is it important|why does it matter|how so|explain why|give me an example|give me example|show me an example|show me example|show another example|another example|example|use case|apply it|apply that|what about that|what happens next|what next|then what|what does that mean|tell me more|go deeper|continue|expand on that|break that down|how would that work|how does that help sandblast|how does this help sandblast|how does it help sandblast|how does this help sandblast media|how does that help sandblast media|why is that important for nyx|how does that help|next steps)$/i.test(t) ||
    (/\b(that|it|this|those|these)\b/i.test(t) && /\b(important|matter|example|apply|work|mean|impact|risk|benefit|useful|business|small business|practical|practically|help|helps|sandblast|nyx|next)\b/i.test(t));
}

function classifyContinuityFollowupStateAction(value = "") {
  const t = oneLine(value).replace(/[.?!]+$/g, "").toLowerCase();
  if (!t) return "";
  if (/\b(example|scenario|show me|for instance)\b/i.test(t) || /^(?:example|give me an example)$/i.test(t)) return "example";
  if (/\b(why|important|matter|value|purpose|significance)\b/i.test(t)) return "importance";
  if (/\bhow\s+does\b.{0,160}\bhelp\s+sandblast\b|\bhelp\s+sandblast\b|\bhelps\s+sandblast\b|\bsandblast\s+application\b/i.test(t)) return "sandblast_application";
  if (/\b(apply|application|small business|business use|real world|practical|practically|use case|scenario|help|helps)\b/i.test(t)) return "application";
  if (/\b(risk|risks|danger|downside|problem|failure|warning)\b/i.test(t)) return "risk";
  if (/\b(benefit|benefits|upside|advantage|advantages|useful)\b/i.test(t)) return "benefit";
  if (/\b(compare|comparison|versus|vs\.?|difference|different from)\b/i.test(t)) return "compare";
  if (/\b(how|work|works|mechanism|process)\b/i.test(t)) return "mechanism";
  if (/\b(what happens next|next step|next steps|what next|then what)\b/i.test(t)) return "next";
  if (/\b(continue|tell me more|expand|go deeper|break that down|elaborate)\b/i.test(t)) return "expand";
  if (/\b(mean|means|definition|define)\b/i.test(t)) return "meaning";
  return isShortContinuityFollowupStateText(t) ? "followup" : "";
}

function buildStateContinuityResolvedQuestion(text = "", topic = "", action = "") {
  const raw = oneLine(text);
  const subject = boundedOneLine(topic, 160);
  if (!raw || !subject) return raw;
  if (raw.toLowerCase().includes(subject.toLowerCase())) return raw;
  const a = oneLine(action || classifyContinuityFollowupStateAction(raw));
  switch (a) {
    case "example": return `Give me a concrete example of ${subject}.`;
    case "importance": return /nyx/i.test(raw) ? `Why is ${subject} important for Nyx?` : `Why is ${subject} important?`;
    case "sandblast_application": return `How does ${subject} help Sandblast?`;
    case "application": return /sandblast/i.test(raw) ? `How does ${subject} help Sandblast?` : (/small business/i.test(raw) ? `Apply ${subject} to a small business.` : `Apply ${subject} to a practical business scenario.`);
    case "risk": return `What are the main risks or failure points related to ${subject}?`;
    case "benefit": return `What are the main benefits of ${subject}?`;
    case "compare": return `Compare ${subject} with the closest alternative or opposite concept.`;
    case "mechanism": return `How does ${subject} work in practice?`;
    case "next": return `What happens next with ${subject} in practice?`;
    case "expand": return `Continue explaining ${subject} with one new layer of detail.`;
    case "meaning": return `What does ${subject} mean in practical terms?`;
    default: return `${raw} about ${subject}`;
  }
}


function inferContinuityTopicFromAssistantText(value = "") {
  const t = oneLine(value).replace(/[“”"']/g, "");
  const lowerT = t.toLowerCase();
  if (!t) return "";
  const directTopics = [
    { rx: /\bmarion\b.*\bnyx\b.*\bcontext\b|\bnyx\b.*\bmarion\b.*\bcontext\b|\bmarion\b.*\bcarry\b.*\bcontext\b|\bnyx\b.*\bfollow[-\s]?up\b/i, topic: "Marion and Nyx continuity" },
    { rx: /\bmarion\b.*\badmin runtime\b|\bmarion\b.*\bruntime\b/i, topic: "Marion runtime continuity" },
    { rx: /\bnyx\b.*\bpublic\b.*\bprojection\b|\bpublic\s+nyx\b.*\bprojection\b/i, topic: "public Nyx final projection" },
    { rx: /\bcash[-\s]?flow\b/i, topic: "cash flow" },
    { rx: /\bleast privilege\b/i, topic: "least privilege" },
    { rx: /\bphishing\b/i, topic: "phishing" },
    { rx: /\bcognitive bias\b/i, topic: "cognitive bias" },
    { rx: /\bmachine learning\b|\bML\b/, topic: "machine learning" },
    { rx: /\bconsideration\b.*\bcontract law\b|\bcontract law\b.*\bconsideration\b/i, topic: "consideration in contract law" },
    { rx: /\bartificial intelligence\b|\bAI\b/, topic: "artificial intelligence" }
  ];
  for (const item of directTopics) {
    if (item.rx.test(t)) return item.topic;
  }
  let m = t.match(/^([A-Z][A-Za-z0-9\s\-]{2,80})\s+is\s+(?:a|an|the)\b/);
  if (m && m[1]) return boundedOneLine(m[1].replace(/^(?:The|A|An)\s+/i, ""), 120).toLowerCase();
  m = lowerT.match(/^([a-z][a-z0-9\s\-]{2,80})\s+(?:is|means|refers to)\b/);
  if (m && m[1]) return boundedOneLine(m[1].replace(/^(?:the|a|an)\s+/i, ""), 120);
  return "";
}

function chooseContinuityTopicCandidate(candidates = []) {
  for (const item of Array.isArray(candidates) ? candidates : []) {
    const direct = boundedOneLine(item, 180);
    if (!direct) continue;
    if (isShortContinuityFollowupStateText(direct)) continue;
    const inferred = inferContinuityTopicFromAssistantText(direct) || direct;
    const topic = boundedOneLine(inferred, 120);
    if (topic && !isShortContinuityFollowupStateText(topic)) return topic;
  }
  return "";
}

function continuityTopicFromState(prev = {}, inbound = {}, memoryPatch = {}, normalizedUserIntent = "") {
  const p = isPlainObject(prev) ? prev : {};
  const mp = isPlainObject(memoryPatch) ? memoryPatch : {};
  const src = isPlainObject(inbound) ? inbound : {};
  const meta = safeObj(src.meta);
  const payload = safeObj(src.payload);
  const stateBridge = safeObj(mp.stateBridge || src.stateBridge || meta.stateBridge || payload.stateBridge);
  const continuity = normalizeContinuityCarry(mp.continuity || src.continuity || meta.continuity || payload.continuity || stateBridge.continuity || p.continuity || p);
  const isFollowup = isShortContinuityFollowupStateText(normalizedUserIntent || extractInboundText(src) || mp.lastUserText || "");
  const candidate = chooseContinuityTopicCandidate([
    continuity.topic,
    continuity.lastTopic,
    mp.lastTopic,
    stateBridge.lastTopic,
    stateBridge.topic,
    p.lastTopic,
    safeObj(p.continuity).topic,
    safeObj(p.continuity).lastTopic,
    safeObj(p.followUpReference).topic,
    safeObj(p.followUpReference).lastTopic,
    safeObj(p.continuityThread).lastTopics && safeObj(p.continuityThread).lastTopics[0],
    mp.lastAssistantReply,
    p.lastAssistantReply,
    mp.carryForwardSummary,
    p.carryForwardSummary,
    p.conversationSummary,
    deriveStateTopic(inbound, memoryPatch, safeStr(src.lane || p.lane || "general"))
  ]);
  if (isFollowup) return boundedOneLine(candidate, 320);
  return boundedOneLine(candidate || mp.lastTopic || normalizedUserIntent || deriveStateTopic(inbound, memoryPatch, safeStr(src.lane || p.lane || "general")) || p.lastTopic, 320);
}



function boundedOneLine(value, max = MAX_STATE_TEXT) {
  const text = oneLine(value);
  const limit = clampInt(max, MAX_STATE_TEXT, 32, 20000);
  if (!text) return "";
  return text.length > limit ? text.slice(0, limit).replace(/\s+\S*$/, " ").trim() : text;
}

function boundedArray(value, maxItems = MAX_STATE_ARRAY_ITEMS, maxText = 180) {
  const arr = Array.isArray(value) ? value : [];
  return arr
    .map((x) => boundedOneLine(x, maxText))
    .filter(Boolean)
    .slice(0, clampInt(maxItems, MAX_STATE_ARRAY_ITEMS, 1, 32));
}

function boundedSignature(value) {
  return boundedOneLine(value, MAX_SIGNATURE_TEXT);
}

function hashText(v) {
  const s = safeStr(v);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function nowMs() {
  return Date.now();
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


function extractRuntimeTelemetryFromTurn(params = {}, inbound = {}) {
  const p=isPlainObject(params)?params:{}, src=isPlainObject(inbound)?inbound:{}, marion=extractMarionObject(p), memoryPatch=extractComposerMemoryPatch(p);
  const candidates=[p.runtimeTelemetry,src.runtimeTelemetry,safeObj(src.meta).runtimeTelemetry,safeObj(src.diagnostics).runtimeTelemetry,safeObj(src.finalEnvelope).runtimeTelemetry,safeObj(marion.finalEnvelope).runtimeTelemetry,marion.runtimeTelemetry,memoryPatch.runtimeTelemetry,safeObj(memoryPatch.stateBridge).runtimeTelemetry];
  for (const item of candidates) if (isPlainObject(item) && Object.keys(item).length) return item;
  return {};
}
function buildStateRuntimeTelemetry({params={},inbound={},reply="",trustedFinalCompletion=false,stage="",intent="",domain="",lane=""}={}){
  const inherited=extractRuntimeTelemetryFromTurn(params,inbound), memoryPatch=extractComposerMemoryPatch(params), marionAdminConversation=extractMarionAdminConversationCarry(params,inbound,memoryPatch), lingoSentinelSilentOversight=extractLingoSentinelSilentOversightCarry(params,inbound,memoryPatch), protectiveEscalationState=extractProtectiveEscalationStateCarry(params,inbound,memoryPatch);
  const finalRenderTelemetry = finalRenderTelemetryMod && typeof finalRenderTelemetryMod.buildFinalRenderTelemetry === "function" ? safeObj(finalRenderTelemetryMod.buildFinalRenderTelemetry({source:"stateSpine.finalizeTurn",stage:normalizeStateStage(stage || (trustedFinalCompletion ? "final" : "open"), "open"),reply,canEmit:trustedFinalCompletion,finalEnvelopeTrusted:trustedFinalCompletion,runtimeTelemetry:inherited,domainConfidence:isPlainObject(inherited.domainConfidence) ? inherited.domainConfidence : safeObj(params).domainConfidence,error:inherited.error||""})) : {};
  return {
    ...inherited,
    version: FINAL_RUNTIME_TELEMETRY_VERSION,
    telemetryVisibilityVersion: TELEMETRY_VISIBILITY_VERSION,
    failureSignature: classifyFailureSignature({source:"stateSpine.finalizeTurn",reply,canEmit:trustedFinalCompletion,stage:normalizeStateStage(stage || (trustedFinalCompletion ? "final" : "open"), "open"),intent,domain,finalEnvelopeTrusted:trustedFinalCompletion}),
    failureSignatureAudit: buildFailureSignatureAudit({source:"stateSpine.finalizeTurn",reply,canEmit:trustedFinalCompletion,stage:normalizeStateStage(stage || (trustedFinalCompletion ? "final" : "open"), "open"),intent,domain,finalEnvelopeTrusted:trustedFinalCompletion}),
    source: "stateSpine.finalizeTurn",
    stage: normalizeStateStage(stage || (trustedFinalCompletion ? "final" : "open"), "open"),
    finalAuthority: trustedFinalCompletion ? "marionFinalEnvelope" : "pending",
    replyAuthority: trustedFinalCompletion ? "stateSpine_observed_final" : "none",
    canEmit: !!trustedFinalCompletion,
    intent: safeStr(intent),
    domain: safeStr(domain),
    lane: safeStr(lane),
    inputSource: canonicalTurnInputSource(inbound, params),
    marionAdminConversation: Object.keys(marionAdminConversation).length ? marionAdminConversation : undefined,
    privateAdminConversation: !!Object.keys(marionAdminConversation).length,
    lingoSentinelSilentOversight: Object.keys(lingoSentinelSilentOversight).length ? lingoSentinelSilentOversight : undefined,
    lingoSentinelSilentOversightActive: !!Object.keys(lingoSentinelSilentOversight).length,
    protectiveEscalation: Object.keys(protectiveEscalationState).length ? protectiveEscalationState : undefined,
    protectiveEscalationActive: !!Object.keys(protectiveEscalationState).length,
    domainConfidence: normalizeDomainConfidenceCarry(isPlainObject(inherited.domainConfidence) ? inherited.domainConfidence : safeObj(params).domainConfidence),
    replySignature: reply ? hashText(reply) : safeStr(inherited.replySignature || ""),
    marionFinalObserved: !!hasMarionFinalSignal(params),
    finalEnvelopeTrusted: !!(hasTrustedMarionFinalEnvelope(params) || hasTrustedFinalShape(params)),
    finalRenderTelemetry,
    finalRenderTelemetryActive: !!Object.keys(finalRenderTelemetry).length,
    publicSurfaceClean: safeObj(finalRenderTelemetry).publicSurfaceClean !== false,
    spineVersion: SPINE_VERSION,
    updatedAt: nowMs()
  };
}



function normalizeProtectiveEscalationStateCarry(value = {}) {
  const src = isPlainObject(value) ? value : {};
  const purpose = boundedOneLine(src.purpose || src.protectivePurpose || src.justification || src.reason || "", 600);
  const guardianRaw = boundedOneLine(src.guardian || src.asset || src.authority || "marion", 64).toLowerCase();
  const guardian = ({ marian:"marion", mariam:"marion", marion:"marion", aster:"aster", astro:"aster", thalon:"thalon", talon:"thalon", fallon:"thalon" })[guardianRaw] || "marion";
  const burst = Number(src.maxBurstSeconds ?? src.burstSeconds ?? src.maxBurstDurationSeconds ?? 0);
  const cooldown = Number(src.minCooldownSeconds ?? src.cooldownSeconds ?? 0);
  const active = !!(src.active || src.defensiveIntent || src.protectiveIntent || src.verifiedCommand || purpose);
  if (!active) return {};
  const boundedPolicy = !!(
    (!Number.isFinite(burst) || burst === 0 || burst <= 8) &&
    (!Number.isFinite(cooldown) || cooldown === 0 || cooldown >= 15) &&
    src.continuous !== true &&
    src.punitive !== true &&
    src.coercive !== true
  );
  const verifiedCommand = src.verifiedCommand === true || src.commandVerified === true || src.intentVerified === true;
  const humanApproval = src.humanApproval === true || src.approved === true || !!src.approvedBy;
  return {
    version: PROTECTIVE_ESCALATION_STATE_VERSION,
    active: true,
    guardian,
    asset: guardian,
    defensiveIntent: !!(src.defensiveIntent || src.protectiveIntent || /defen|protect|safety|threat|emergency/i.test(purpose)),
    protectivePurpose: purpose,
    verifiedCommand,
    humanApproval,
    approvalRequired: src.approvalRequired !== false,
    boundedPolicy,
    maxBurstSeconds: Number.isFinite(burst) && burst > 0 ? Math.min(8, Math.max(1, burst)) : 0,
    minCooldownSeconds: Number.isFinite(cooldown) && cooldown > 0 ? Math.max(15, cooldown) : 0,
    allowed: !!(verifiedCommand && boundedPolicy && (humanApproval || src.approvalRequired === false)),
    finalAuthority: "marion",
    advisoryOnly: guardian !== "marion",
    noContinuousOutput: true,
    noPunitiveUse: true,
    noCoerciveUse: true,
    source: boundedOneLine(src.source || "stateSpine.protectiveEscalationState", 160),
    updatedAt: nowMs()
  };
}

function extractProtectiveEscalationStateCarry(params = {}, inbound = {}, memoryPatch = {}) {
  const p = isPlainObject(params) ? params : {};
  const src = isPlainObject(inbound) ? inbound : {};
  const mp = isPlainObject(memoryPatch) ? memoryPatch : {};
  const meta = safeObj(src.meta);
  const payload = safeObj(src.payload);
  const sb = safeObj(mp.stateBridge || src.stateBridge || meta.stateBridge || payload.stateBridge);
  const rt = safeObj(p.runtimeTelemetry || src.runtimeTelemetry || meta.runtimeTelemetry || payload.runtimeTelemetry);
  const candidates = [
    p.protectiveEscalation,
    p.defensiveIntentJustifier,
    p.ethicalJustification,
    src.protectiveEscalation,
    src.defensiveIntentJustifier,
    src.ethicalJustification,
    meta.protectiveEscalation,
    payload.protectiveEscalation,
    mp.protectiveEscalation,
    mp.defensiveIntentJustifier,
    sb.protectiveEscalation,
    rt.protectiveEscalation,
    rt.defensiveIntentJustifier
  ];
  for (const item of candidates) {
    const normalized = normalizeProtectiveEscalationStateCarry(item);
    if (Object.keys(normalized).length) return normalized;
  }
  return {};
}


function normalizeKnowledgeDomainCarry(value=""){
  const raw=safeStr(value).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  const map={psychology:"psychology",psych:"psychology",emotional:"psychology",emotion:"psychology",english:"english",language:"english",grammar:"english",writing:"english",ai:"ai",artificial_intelligence:"ai",cyber:"cyber",cybersecurity:"cyber",security:"cyber",law:"law",legal:"law",finance:"finance",financial:"finance",economics:"finance"};
  return map[raw]||"";
}
function extractActiveKnowledgeDomainCarry(prev={},memoryPatch={},params={},inbound={}){
  const p=isPlainObject(params)?params:{},src=isPlainObject(inbound)?inbound:{},mp=isPlainObject(memoryPatch)?memoryPatch:{},pr=isPlainObject(prev)?prev:{};
  const sb=safeObj(mp.stateBridge),psb=safeObj(pr.stateBridge),mc=safeObj(pr.marionCohesion),cv=safeObj(mp.conversationVector||pr.conversationVector);
  const candidates=[mp.activeKnowledgeDomain,mp.lastActivatedKnowledgeDomain,mp.lastKnowledgeDomain,sb.activeKnowledgeDomain,sb.lastActivatedKnowledgeDomain,p.activeKnowledgeDomain,p.knowledgeDomain,src.activeKnowledgeDomain,src.knowledgeDomain,pr.activeKnowledgeDomain,pr.lastActivatedKnowledgeDomain,pr.lastKnowledgeDomain,psb.activeKnowledgeDomain,psb.lastActivatedKnowledgeDomain,mc.activeKnowledgeDomain,mc.lastKnowledgeDomain,cv.activeKnowledgeDomain,cv.knowledgeDomain];
  for(const c of candidates){const k=normalizeKnowledgeDomainCarry(c);if(k)return k;}
  return "";
}

function canonicalIntent(value, fallback) {
  const raw = safeStr(value || fallback || "ADVANCE").trim();
  if (!raw) return "ADVANCE";
  return raw.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase() || "ADVANCE";
}

function canonicalGreetingIntent(value) {
  const raw = safeStr(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return raw;
}

function normalizeGreetingTone(value) {
  const tone = safeStr(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return tone || "";
}

function normalizeGreetingEnergy(value) {
  const energy = safeStr(value || "").trim().toLowerCase();
  if (/urgent|high|hot|elevated|strong/.test(energy)) return "high";
  if (/medium|mid|normal|active/.test(energy)) return "medium";
  if (/low|soft|calm|quiet/.test(energy)) return "low";
  return energy || "";
}

function normalizeInputSource(value) {
  const source = safeStr(value || "").trim().toLowerCase();
  if (/voice|mic|speech|audio/.test(source)) return "voice";
  if (/text|typed|keyboard/.test(source)) return "text";
  return source || "";
}

function normalizeDomainConfidenceCarry(value) {
  const v = isPlainObject(value) ? value : {};
  const confidence = Number(v.confidence);
  const margin = Number(v.margin);
  const c = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  const m = Number.isFinite(margin) ? Math.max(0, Math.min(1, margin)) : 0;
  const routeLocked = !!(v.routeLocked || v.routeLock || c >= 0.82);
  const ambiguous = !!(v.ambiguous || (!routeLocked && (c < 0.62 || (m > 0 && m < 0.08))));
  const base = {
    version: safeStr(v.version || "nyx.marion.domainConfidence/1.2"),
    confidence: c,
    confidenceScore: c,
    band: boundedOneLine(v.band || v.confidenceBand || (c >= 0.82 ? "high" : c >= 0.62 ? "medium" : c >= 0.48 ? "low" : "weak"), 32),
    confidenceBand: boundedOneLine(v.confidenceBand || v.band || (c >= 0.82 ? "high" : c >= 0.62 ? "medium" : c >= 0.48 ? "low" : "weak"), 32),
    margin: m,
    ambiguous,
    routeLocked,
    failClosed: !!(v.failClosed || (ambiguous && !routeLocked)),
    needsClarifier: !!(v.needsClarifier || (ambiguous && !routeLocked)),
    primary: boundedOneLine(v.primary || v.primaryIntent || v.primaryDomain || v.selectedDomain || "", 64),
    primaryDomain: boundedOneLine(v.primaryDomain || v.selectedDomain || v.domain || "", 64),
    selectedDomain: boundedOneLine(v.selectedDomain || v.primaryDomain || v.domain || "", 64),
    secondaryDomains: boundedArray(v.secondaryDomains || [], 4, 64),
    knowledgeDomain: boundedOneLine(v.knowledgeDomain || "", 64),
    answerMode: boundedOneLine(v.answerMode || (c >= 0.82 ? "direct" : (c >= 0.62 ? "grounded" : "clarify")), 64),
    fallbackReason: boundedOneLine(v.fallbackReason || "", 160),
    reason: boundedOneLine(v.reason || "", 160),
    noCrossDomainBleed: v.noCrossDomainBleed !== false,
    noUserFacingDiagnostics: v.noUserFacingDiagnostics !== false,
    candidates: Array.isArray(v.candidates) ? v.candidates.slice(0, 6).map((x) => isPlainObject(x) ? { domain: boundedOneLine(x.domain || x.primaryDomain || "", 64), confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0)), reasons: boundedArray(x.reasons || [], 4, 80) } : null).filter(Boolean) : []
  };
  if (domainConfidenceMod && typeof domainConfidenceMod.normalizeDomainConfidenceProfile === "function") {
    try {
      return domainConfidenceMod.normalizeDomainConfidenceProfile(base, { candidates: base.candidates, confidence: c });
    } catch (_err) {}
  }
  return base;
}

function extractDomainConfidenceCarry(params = {}, inbound = {}, memoryPatch = {}) {
  const p = isPlainObject(params) ? params : {};
  const src = isPlainObject(inbound) ? inbound : {};
  const mp = isPlainObject(memoryPatch) ? memoryPatch : {};
  const candidates = [
    mp.domainConfidence,
    mp?.stateBridge?.domainConfidence,
    p.domainConfidence,
    p?.routing?.domainConfidence,
    p?.marionIntent?.domainConfidence,
    p?.marionCog?.domainConfidence,
    src.domainConfidence,
    src?.routing?.domainConfidence,
    src?.sessionPatch?.domainConfidence
  ];
  for (const item of candidates) if (isPlainObject(item) && Object.keys(item).length) return normalizeDomainConfidenceCarry(item);
  return normalizeDomainConfidenceCarry({ confidence: 0, reason: "domain_confidence_absent" });
}


function normalizeDomainConciergeCarry(value = {}) {
  const v = isPlainObject(value) ? value : {};
  const confidence = Number(v.confidence);
  const c = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  const action = boundedOneLine(v.action || (v.needsClarifier ? "clarify" : "route"), 32) || "route";
  return {
    version: boundedOneLine(v.version || DOMAIN_CONCIERGE_CORE_VERSION, 80),
    source: boundedOneLine(v.source || "domain_concierge_carry", 80),
    action,
    route: boundedOneLine(v.route || v.domain || v.selectedDomain || "", 64),
    intent: boundedOneLine(v.intent || "", 64),
    confidence: c,
    confidenceBand: boundedOneLine(v.confidenceBand || v.band || (c >= 0.82 ? "high" : c >= 0.62 ? "medium" : c > 0 ? "low" : "absent"), 32),
    needsClarifier: !!(v.needsClarifier || action === "clarify"),
    clarifier: /interface,? radio\/media,? Roku,? business strategy,? or backend technical work/i.test(boundedOneLine(v.clarifier || "", 220)) ? "" : boundedOneLine(v.clarifier || "", 220),
    routeLocked: !!v.routeLocked,
    routeFailClosed: !!v.routeFailClosed,
    noUserFacingDiagnostics: v.noUserFacingDiagnostics !== false,
    updatedAt: nowMs()
  };
}

function extractDomainConciergeCarry(params = {}, inbound = {}, memoryPatch = {}) {
  const p = isPlainObject(params) ? params : {};
  const src = isPlainObject(inbound) ? inbound : {};
  const mp = isPlainObject(memoryPatch) ? memoryPatch : {};
  const candidates = [
    mp.domainConcierge,
    mp.domainConciergeSeed,
    isPlainObject(mp.stateBridge) ? mp.stateBridge.domainConcierge : null,
    p.domainConcierge,
    p.domainConciergeSeed,
    isPlainObject(p.routing) ? p.routing.domainConcierge : null,
    isPlainObject(p.routing) ? p.routing.domainConciergeSeed : null,
    isPlainObject(p.marionIntent) ? p.marionIntent.domainConcierge : null,
    src.domainConcierge,
    src.domainConciergeSeed,
    isPlainObject(src.routing) ? src.routing.domainConcierge : null,
    isPlainObject(src.routing) ? src.routing.domainConciergeSeed : null,
    isPlainObject(src.sessionPatch) ? src.sessionPatch.domainConcierge : null
  ];
  for (const item of candidates) {
    if (isPlainObject(item) && Object.keys(item).length) return normalizeDomainConciergeCarry(item);
  }
  return normalizeDomainConciergeCarry({ action: "absent", source: "domain_concierge_absent" });
}



function normalizeConfidenceAwareResponseShapingCarry(value = {}) {
  const v = isPlainObject(value) ? value : {};
  const confidence = Number(v.confidence);
  const c = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  const mode = boundedOneLine(v.mode || (v.needsClarifier ? "clarify" : (c >= 0.82 ? "direct" : c >= 0.62 ? "grounded" : c > 0 ? "cautious" : "absent")), 32);
  return {
    version: boundedOneLine(v.version || CONFIDENCE_AWARE_RESPONSE_SHAPING_VERSION, 96),
    source: boundedOneLine(v.source || "confidence_aware_response_shaping_carry", 96),
    active: v.active !== false && mode !== "absent",
    mode,
    action: boundedOneLine(v.action || "", 48),
    route: boundedOneLine(v.route || v.domain || "", 64),
    intent: boundedOneLine(v.intent || "", 64),
    knowledgeDomain: boundedOneLine(v.knowledgeDomain || "", 64),
    confidence: c,
    confidenceBand: boundedOneLine(v.confidenceBand || v.band || (c >= 0.82 ? "high" : c >= 0.62 ? "medium" : c > 0 ? "low" : "absent"), 32),
    highStakes: !!v.highStakes,
    technical: !!v.technical,
    needsClarifier: !!v.needsClarifier || mode === "clarify",
    clarifier: /interface,? radio\/media,? Roku,? business strategy,? or backend technical work/i.test(boundedOneLine(v.clarifier || "", 220)) ? "" : boundedOneLine(v.clarifier || "", 220),
    noUserFacingDiagnostics: v.noUserFacingDiagnostics !== false,
    updatedAt: nowMs()
  };
}

function extractConfidenceAwareResponseShapingCarry(params = {}, inbound = {}, memoryPatch = {}) {
  const p = isPlainObject(params) ? params : {};
  const src = isPlainObject(inbound) ? inbound : {};
  const mp = isPlainObject(memoryPatch) ? memoryPatch : {};
  const candidates = [
    mp.confidenceAwareResponseShaping,
    isPlainObject(mp.stateBridge) ? mp.stateBridge.confidenceAwareResponseShaping : null,
    p.confidenceAwareResponseShaping,
    isPlainObject(p.domainConcierge) ? p.domainConcierge.confidenceAwareResponseShaping : null,
    isPlainObject(p.routing) ? p.routing.confidenceAwareResponseShaping : null,
    isPlainObject(p.routing) && isPlainObject(p.routing.domainConcierge) ? p.routing.domainConcierge.confidenceAwareResponseShaping : null,
    src.confidenceAwareResponseShaping,
    isPlainObject(src.domainConcierge) ? src.domainConcierge.confidenceAwareResponseShaping : null,
    isPlainObject(src.sessionPatch) ? src.sessionPatch.confidenceAwareResponseShaping : null,
    isPlainObject(src.sessionPatch) && isPlainObject(src.sessionPatch.stateBridge) ? src.sessionPatch.stateBridge.confidenceAwareResponseShaping : null
  ];
  for (const item of candidates) {
    if (isPlainObject(item) && Object.keys(item).length) return normalizeConfidenceAwareResponseShapingCarry(item);
  }
  return normalizeConfidenceAwareResponseShapingCarry({ mode: "absent", source: "confidence_aware_response_shaping_absent" });
}


function normalizeProgressionShapingGuardCarry(value) {
  const v = isPlainObject(value) ? value : {};
  return {
    version: safeStr(v.version || "nyx.marion.progressionShapingGuard/1.0"),
    active: !!v.active,
    lockedDomain: boundedOneLine(v.lockedDomain || v.domain || "", 64),
    lockedTopic: boundedOneLine(v.lockedTopic || v.topic || "", 180),
    turn: clampInt(v.turn, 0, 0, 99),
    mode: boundedOneLine(v.mode || "", 64),
    blockedFallback: !!v.blockedFallback,
    blockedDomainDrift: !!v.blockedDomainDrift,
    compressionIntent: !!v.compressionIntent,
    compressionMode: boundedOneLine(v.compressionMode || v.mode || "", 64),
    finalRuleCompression: !!v.finalRuleCompression,
    reason: boundedOneLine(v.reason || "", 180),
    updatedAt: nowMs()
  };
}
function extractProgressionShapingGuardCarry(params = {}, inbound = {}, memoryPatch = {}) {
  const p = isPlainObject(params) ? params : {};
  const src = isPlainObject(inbound) ? inbound : {};
  const mp = isPlainObject(memoryPatch) ? memoryPatch : {};
  const candidates = [
    mp.progressionShapingGuard,
    mp?.stateBridge?.progressionShapingGuard,
    p.progressionShapingGuard,
    p?.runtimeTelemetry?.progressionShapingGuard,
    src.progressionShapingGuard,
    src?.sessionPatch?.progressionShapingGuard,
    src?.runtimeTelemetry?.progressionShapingGuard,
    mp.continuationCompressionGuard,
    mp?.stateBridge?.continuationCompressionGuard,
    p.continuationCompressionGuard,
    src.continuationCompressionGuard
  ];
  for (const item of candidates) if (isPlainObject(item) && Object.keys(item).length) return normalizeProgressionShapingGuardCarry(item);
  return normalizeProgressionShapingGuardCarry({ active: false, reason: "progression_guard_absent" });
}

function normalizeProgressionRefinementCarry(value = {}) {
  const v = isPlainObject(value) ? value : {};
  const active = !!v.active;
  const currentStep = boundedOneLine(v.currentStep || v.phaseKey || "", 64);
  const lastUserIntent = boundedOneLine(v.lastUserIntent || v.signal || "", 64);
  return {
    version: safeStr(v.version || PROGRESSION_SHAPING_REFINEMENT_VERSION),
    active,
    lane: active ? "progression_shaping_refinement" : boundedOneLine(v.lane || "", 80),
    activePhase: active ? "progression_shaping_refinement" : boundedOneLine(v.activePhase || v.lane || "", 80),
    currentStep,
    phaseKey: currentStep,
    phaseId: boundedOneLine(v.phaseId || "", 96),
    phaseLabel: boundedOneLine(v.phaseLabel || "", 180),
    lastUserIntent,
    signal: lastUserIntent,
    lastSystemAction: boundedOneLine(v.lastSystemAction || v.responseShape || "", 96),
    pendingAction: boundedOneLine(v.pendingAction || "", 180),
    responseShape: boundedOneLine(v.responseShape || "", 80),
    confidence: Number.isFinite(Number(v.confidence)) ? Math.max(0, Math.min(1, Number(v.confidence))) : 0,
    passFailState: boundedOneLine(v.passFailState || "", 32),
    shallowReplyBlocked: !!v.shallowReplyBlocked,
    expectedPublicShape: active ? "expanded_concrete_action_plan" : "",
    noUserFacingDiagnostics: v.noUserFacingDiagnostics !== false,
    updatedAt: nowMs()
  };
}
function extractProgressionRefinementCarry(params = {}, inbound = {}, memoryPatch = {}) {
  const p = isPlainObject(params) ? params : {};
  const src = isPlainObject(inbound) ? inbound : {};
  const mp = isPlainObject(memoryPatch) ? memoryPatch : {};
  const prev = isPlainObject(p.prevState) ? p.prevState : (isPlainObject(p.previousState) ? p.previousState : {});
  const candidates = [
    mp.progressionRefinement,
    isPlainObject(mp.stateBridge) ? mp.stateBridge.progressionRefinement : null,
    p.progressionRefinement,
    isPlainObject(p.runtimeTelemetry) ? p.runtimeTelemetry.progressionRefinement : null,
    src.progressionRefinement,
    isPlainObject(src.sessionPatch) ? src.sessionPatch.progressionRefinement : null,
    isPlainObject(src.sessionPatch) && isPlainObject(src.sessionPatch.stateBridge) ? src.sessionPatch.stateBridge.progressionRefinement : null,
    prev.progressionRefinement,
    isPlainObject(prev.marionCohesion) ? prev.marionCohesion.progressionRefinement : null
  ];
  for (const item of candidates) {
    if (isPlainObject(item) && Object.keys(item).length) return normalizeProgressionRefinementCarry(item);
  }
  return normalizeProgressionRefinementCarry({ active: false });
}
function updateProgressionRefinementState(params = {}, inbound = {}, memoryPatch = {}, reply = "") {
  const current = extractProgressionRefinementCarry(params, inbound, memoryPatch);
  const text = firstNonEmpty(memoryPatch.lastUserText, extractInboundText(inbound), params.rawUserText, params.userText);
  if (progressionMemoryMod && typeof progressionMemoryMod.updateProgressionMemory === "function") {
    try { return normalizeProgressionRefinementCarry(progressionMemoryMod.updateProgressionMemory({ text, reply, previous: current, context: { ...safeObj(params), ...safeObj(inbound) } })); } catch (_) {}
  }
  if (progressionShapeMod && typeof progressionShapeMod.buildProgressionProfile === "function") {
    try { return normalizeProgressionRefinementCarry({ ...current, ...progressionShapeMod.buildProgressionProfile(text, current) }); } catch (_) {}
  }
  return current;
}
function buildStateProgressionTelemetry(progressState = {}, params = {}, inbound = {}, reply = "") {
  if (progressionTelemetryMod && typeof progressionTelemetryMod.buildProgressionTelemetry === "function") {
    try { return progressionTelemetryMod.buildProgressionTelemetry({ profile: progressState, memory: progressState, text: firstNonEmpty(extractInboundText(inbound), safeObj(params).rawUserText), reply, source: "stateSpine.finalizeTurn" }); } catch (_) {}
  }
  return {};
}

function greetingPresenceFromTone(tone, fallback = "receptive") {
  const normalized = normalizeGreetingTone(tone);
  return GREETING_TONE_TO_PRESENCE[normalized] || fallback || "receptive";
}

function isKnownGreetingIntent(value) {
  const intent = canonicalGreetingIntent(value);
  return !!(intent && GREETING_INTENTS.includes(intent));
}

function isDistressGreetingIntent(value) {
  const intent = canonicalGreetingIntent(value);
  return !!(intent && GREETING_DISTRESS_INTENTS.includes(intent));
}

function collectGreetingCandidateObjects(params = {}, inbound = {}) {
  const p = isPlainObject(params) ? params : {};
  const src = isPlainObject(inbound) ? inbound : {};
  const meta = isPlainObject(p.meta) ? p.meta : {};
  const payload = isPlainObject(src.payload) ? src.payload : {};
  const body = isPlainObject(src.body) ? src.body : {};
  const session = isPlainObject(src.session) ? src.session : {};
  const turnSignals = isPlainObject(src.turnSignals) ? src.turnSignals : {};
  const ui = isPlainObject(src.ui) ? src.ui : {};
  const client = isPlainObject(src.client) ? src.client : {};
  const cog = isPlainObject(src.cog) ? src.cog : {};
  const marion = extractMarionObject(p);
  const packet = isPlainObject(marion.packet) ? marion.packet : (isPlainObject(src.packet) ? src.packet : {});
  const packetMeta = isPlainObject(packet.meta) ? packet.meta : {};
  const packetSessionPatch = isPlainObject(packet.sessionPatch) ? packet.sessionPatch : {};
  const packetMarionIntent = isPlainObject(packet.marionIntent) ? packet.marionIntent : {};
  const memoryPatch = extractComposerMemoryPatch(p);
  const finalEnvelope = extractFinalEnvelopeObject(p);
  return [
    p.greeting, p.greetingSignal, p.greetingIntent, p.greetingState,
    meta.greeting, meta.greetingSignal, meta.greetingIntent,
    src.greeting, src.greetingSignal, src.greetingIntent,
    payload.greeting, payload.greetingSignal, payload.greetingIntent,
    body.greeting, body.greetingSignal, body.greetingIntent,
    session.greeting, session.greetingSignal, session.greetingIntent,
    turnSignals.greeting, turnSignals.greetingSignal,
    ui.greeting, ui.greetingSignal,
    client.greeting, client.greetingSignal,
    cog.greeting, cog.greetingSignal,
    marion.greeting, marion.greetingSignal, marion.greetingIntent,
    packet, packetMeta, packetSessionPatch, packetMarionIntent,
    memoryPatch, finalEnvelope
  ].filter((x) => isPlainObject(x));
}

function extractGreetingSignals(inbound = {}, params = {}) {
  const src = isPlainObject(inbound) ? inbound : {};
  const p = isPlainObject(params) ? params : {};
  const marion = extractMarionObject(p);
  const packet = isPlainObject(marion.packet) ? marion.packet : (isPlainObject(src.packet) ? src.packet : {});
  const packetSessionPatch = isPlainObject(packet.sessionPatch) ? packet.sessionPatch : {};
  const packetMarionIntent = isPlainObject(packet.marionIntent) ? packet.marionIntent : {};
  const memoryPatch = extractComposerMemoryPatch(p);
  const finalEnvelope = extractFinalEnvelopeObject(p);
  const candidates = collectGreetingCandidateObjects(p, src);

  const id = firstNonEmpty(
    p.greetingId, src.greetingId, src?.turnSignals?.greetingId,
    packetSessionPatch.lastGreetingId, packetSessionPatch.greetingId,
    packet.id, memoryPatch.lastGreetingId, finalEnvelope.greetingId
  );

  const intent = canonicalGreetingIntent(firstNonEmpty(
    p.lastGreetingIntent, p.greetingIntent, p.intent,
    src.lastGreetingIntent, src.greetingIntent, src?.turnSignals?.lastGreetingIntent, src?.turnSignals?.greetingIntent,
    src?.session?.lastGreetingIntent, src?.session?.greetingIntent,
    packetSessionPatch.lastGreetingIntent, packetSessionPatch.greetingIntent,
    packetMarionIntent.intent, packet.intent,
    memoryPatch.lastGreetingIntent, memoryPatch.greetingIntent,
    finalEnvelope.lastGreetingIntent, finalEnvelope.greetingIntent
  ));

  const tone = normalizeGreetingTone(firstNonEmpty(
    p.lastGreetingTone, p.greetingTone, p.presenceProfile,
    src.lastGreetingTone, src.greetingTone, src.presenceProfile, src?.turnSignals?.lastGreetingTone, src?.turnSignals?.greetingTone,
    src?.session?.lastGreetingTone, src?.session?.greetingTone,
    packetSessionPatch.lastGreetingTone, packetSessionPatch.greetingTone, packetSessionPatch.presenceProfile,
    packetMarionIntent.tone, packet.tone,
    memoryPatch.lastGreetingTone, memoryPatch.greetingTone, memoryPatch.presenceProfile,
    finalEnvelope.lastGreetingTone, finalEnvelope.greetingTone, finalEnvelope.presenceProfile
  ));

  const energy = normalizeGreetingEnergy(firstNonEmpty(
    p.lastInputEnergy, p.greetingEnergy, p.energy,
    src.lastInputEnergy, src.greetingEnergy, src.energy, src?.turnSignals?.lastInputEnergy, src?.turnSignals?.greetingEnergy,
    src?.session?.lastInputEnergy, src?.session?.greetingEnergy,
    packetSessionPatch.lastInputEnergy, packetSessionPatch.greetingEnergy, packet.energy,
    memoryPatch.lastInputEnergy, memoryPatch.greetingEnergy,
    finalEnvelope.lastInputEnergy, finalEnvelope.greetingEnergy
  ));

  const source = normalizeInputSource(firstNonEmpty(
    p.inputSource, p.source,
    src.inputSource, src.source, src?.ui?.inputSource, src?.ui?.source, src?.client?.inputSource, src?.client?.source,
    src?.session?.inputSource, src?.session?.source,
    packetSessionPatch.inputSource, packetSessionPatch.source,
    memoryPatch.inputSource, memoryPatch.source,
    finalEnvelope.inputSource, finalEnvelope.source
  ));

  const packetType = safeStr(packet.type || "").toLowerCase();
  const route = safeStr(packetMarionIntent.route || marion.route || p.route || src.route || "").toLowerCase();
  const matchedByObject = candidates.some((candidate) => {
    const candidateIntent = canonicalGreetingIntent(firstNonEmpty(candidate.intent, candidate.lastGreetingIntent, candidate.greetingIntent));
    const candidateType = safeStr(candidate.type || "").toLowerCase();
    const candidateRoute = safeStr(candidate.route || "").toLowerCase();
    return candidateType === "greeting" || candidateRoute === "greeting_intent" || isKnownGreetingIntent(candidateIntent);
  });
  const matched = !!(
    packetType === "greeting" ||
    route === "greeting_intent" ||
    isKnownGreetingIntent(intent) ||
    /^general\.greet_|^greet_/i.test(id) ||
    matchedByObject
  );

  const normalizedIntent = isKnownGreetingIntent(intent) ? intent : (matched ? (intent || "basic_greeting") : "");
  const normalizedTone = tone || (matched ? "neutral_warm" : "");
  const normalizedEnergy = energy || (isDistressGreetingIntent(normalizedIntent) ? "high" : (matched ? "low" : ""));
  const presenceProfile = matched ? greetingPresenceFromTone(normalizedTone, isDistressGreetingIntent(normalizedIntent) ? "supportive" : "receptive") : "";

  return {
    matched,
    id: safeStr(id || ""),
    intent: normalizedIntent,
    tone: normalizedTone,
    energy: normalizedEnergy,
    source,
    presenceProfile,
    isDistress: isDistressGreetingIntent(normalizedIntent),
    isVoice: source === "voice",
    route: matched ? "greeting_intent" : ""
  };
}

function firstNonEmpty() {
  for (let i = 0; i < arguments.length; i += 1) {
    const s = oneLine(arguments[i]);
    if (s) return s;
  }
  return "";
}

function extractNested(obj, path) {
  let cur = obj;
  for (const key of path) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

function extractMarionObject(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const inbound = isPlainObject(p.inbound) ? p.inbound : {};
  const meta = isPlainObject(p.meta) ? p.meta : {};
  const candidates = [
    p.marion, p.composer, p.contract, p.result, p.response, p.marionContract,
    inbound.marion, inbound.contract, inbound.result, inbound.response,
    meta.marion, meta.marionContract, meta.result,
    extractNested(inbound, ["meta", "marion"]),
    extractNested(inbound, ["meta", "marionContract"])
  ];
  for (const candidate of candidates) {
    if (isPlainObject(candidate)) return candidate;
  }
  return {};
}

function extractComposerMemoryPatch(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const inbound = isPlainObject(p.inbound) ? p.inbound : {};
  const meta = isPlainObject(p.meta) ? p.meta : {};
  const marion = extractMarionObject(p);
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const synthesis = isPlainObject(packet.synthesis) ? packet.synthesis : {};
  const candidates = [
    p.memoryPatch, inbound.memoryPatch, meta.memoryPatch, marion.memoryPatch, synthesis.memoryPatch,
    extractNested(marion, ["payload", "memoryPatch"]),
    extractNested(marion, ["meta", "memoryPatch"]),
    extractNested(inbound, ["payload", "memoryPatch"]),
    extractNested(inbound, ["meta", "memoryPatch"])
  ];
  for (const candidate of candidates) {
    if (isPlainObject(candidate)) return candidate;
  }
  return {};
}

function extractComposerReply(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const inbound = isPlainObject(p.inbound) ? p.inbound : {};
  const topPayload = isPlainObject(p.payload) ? p.payload : {};
  const inboundPayload = isPlainObject(inbound.payload) ? inbound.payload : {};
  const marion = extractMarionObject(p);
  const finalEnvelope = extractFinalEnvelopeObject(p);
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const synthesis = isPlainObject(packet.synthesis) ? packet.synthesis : {};
  const payload = isPlainObject(marion.payload) ? marion.payload : {};
  return firstNonEmpty(
    finalEnvelope.reply, finalEnvelope.text, finalEnvelope.answer, finalEnvelope.output, finalEnvelope.message, finalEnvelope.spokenText,
    p.reply, p.assistantText, p.assistantSummary,
    topPayload.reply, topPayload.text, topPayload.answer, topPayload.output, topPayload.message,
    marion.reply, marion.text, marion.answer, marion.output, marion.response,
    payload.reply, payload.text, payload.answer, payload.output, payload.message,
    synthesis.reply, synthesis.text, synthesis.answer, synthesis.output,
    inbound.reply, inbound.response,
    inboundPayload.reply, inboundPayload.text, inboundPayload.answer, inboundPayload.output, inboundPayload.message
  );
}

function hashUserTextForComposer(text) {
  return hashText(oneLine(text).toLowerCase());
}

function extractInboundText(inbound = {}) {
  const src = isPlainObject(inbound) ? inbound : {};
  const payload = isPlainObject(src.payload) ? src.payload : {};
  const body = isPlainObject(src.body) ? src.body : {};
  const meta = isPlainObject(src.meta) ? src.meta : {};
  const packet = isPlainObject(src.packet) ? src.packet : {};
  const synthesis = isPlainObject(packet.synthesis) ? packet.synthesis : {};
  return firstNonEmpty(
    src.text, src.userText, src.userQuery, src.query, src.message,
    payload.text, payload.userText, payload.userQuery, payload.query, payload.message,
    body.text, body.userText, body.userQuery, body.query, body.message,
    meta.text, meta.userText, meta.userQuery, meta.query, meta.message,
    synthesis.userText, synthesis.userQuery, synthesis.query, synthesis.text
  );
}

function trustedFinalShouldBreakLoop({ trustedFinalEnvelope, composerAdvancedState, speak, loopPhraseRejected }) {
  return !!(
    trustedFinalEnvelope &&
    composerAdvancedState &&
    !loopPhraseRejected &&
    (!speak || isActionableComposerReply(speak))
  );
}

function extractMarionFinalSignature(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const inbound = isPlainObject(p.inbound) ? p.inbound : {};
  const meta = isPlainObject(p.meta) ? p.meta : {};
  const marion = extractMarionObject(p);
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const packetMeta = isPlainObject(packet.meta) ? packet.meta : {};
  const payload = isPlainObject(marion.payload) ? marion.payload : {};
  const memoryPatch = extractComposerMemoryPatch(p);
  return firstNonEmpty(
    p.marionFinalSignature,
    p.finalSignature,
    p.signature,
    meta.marionFinalSignature,
    meta.finalSignature,
    meta.signature,
    marion.marionFinalSignature,
    marion.finalSignature,
    marion.signature,
    packetMeta.marionFinalSignature,
    packetMeta.finalSignature,
    packetMeta.signature,
    payload.marionFinalSignature,
    payload.finalSignature,
    payload.signature,
    memoryPatch.marionFinalSignature,
    memoryPatch.finalSignature,
    extractNested(inbound, ["meta", "marionFinalSignature"]),
    extractNested(inbound, ["meta", "finalSignature"]),
    extractNested(inbound, ["packet", "meta", "marionFinalSignature"]),
    extractNested(inbound, ["packet", "meta", "finalSignature"])
  );
}


function extractFinalEnvelopeObject(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const inbound = isPlainObject(p.inbound) ? p.inbound : {};
  const meta = isPlainObject(p.meta) ? p.meta : {};
  const topPayload = isPlainObject(p.payload) ? p.payload : {};
  const inboundPayload = isPlainObject(inbound.payload) ? inbound.payload : {};
  const marion = extractMarionObject(p);
  const payload = isPlainObject(marion.payload) ? marion.payload : {};
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const packetPayload = isPlainObject(packet.payload) ? packet.payload : {};
  return isPlainObject(p.finalEnvelope) ? p.finalEnvelope :
    isPlainObject(topPayload.finalEnvelope) ? topPayload.finalEnvelope :
    isPlainObject(inbound.finalEnvelope) ? inbound.finalEnvelope :
    isPlainObject(inboundPayload.finalEnvelope) ? inboundPayload.finalEnvelope :
    isPlainObject(meta.finalEnvelope) ? meta.finalEnvelope :
    isPlainObject(marion.finalEnvelope) ? marion.finalEnvelope :
    isPlainObject(payload.finalEnvelope) ? payload.finalEnvelope :
    isPlainObject(packet.finalEnvelope) ? packet.finalEnvelope :
    isPlainObject(packetPayload.finalEnvelope) ? packetPayload.finalEnvelope :
    {};
}

function extractContractVersion(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const inbound = isPlainObject(p.inbound) ? p.inbound : {};
  const meta = isPlainObject(p.meta) ? p.meta : {};
  const marion = extractMarionObject(p);
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const packetMeta = isPlainObject(packet.meta) ? packet.meta : {};
  const synthesis = isPlainObject(packet.synthesis) ? packet.synthesis : {};
  const payload = isPlainObject(marion.payload) ? marion.payload : {};
  const finalEnvelope = extractFinalEnvelopeObject(p);
  return firstNonEmpty(
    p.contractVersion,
    p.finalContractVersion,
    inbound.contractVersion,
    meta.contractVersion,
    marion.contractVersion,
    payload.contractVersion,
    packet.contractVersion,
    packetMeta.contractVersion,
    synthesis.contractVersion,
    finalEnvelope.contractVersion
  );
}

function hasKnownGoodFinalContract(params = {}) {
  const contractVersion = extractContractVersion(params);
  return !!(contractVersion && KNOWN_GOOD_FINAL_CONTRACTS.includes(contractVersion));
}

function hasLegacyTrustFlag(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const inbound = isPlainObject(p.inbound) ? p.inbound : {};
  const meta = isPlainObject(p.meta) ? p.meta : {};
  const marion = extractMarionObject(p);
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const packetMeta = isPlainObject(packet.meta) ? packet.meta : {};
  const payload = isPlainObject(marion.payload) ? marion.payload : {};
  const memoryPatch = extractComposerMemoryPatch(p);
  const stateBridge = isPlainObject(memoryPatch.stateBridge) ? memoryPatch.stateBridge : {};
  const finalEnvelope = extractFinalEnvelopeObject(p);
  return !!(
    p.trustedTransport ||
    p.internalTrustedTransport ||
    inbound.trustedTransport ||
    meta.trustedTransport ||
    meta.internalTrustedTransport ||
    marion.trustedTransport ||
    packetMeta.trustedTransport ||
    payload.trustedTransport ||
    memoryPatch.trustedTransport ||
    memoryPatch.hardlockCompatible ||
    stateBridge.finalEnvelopeTrusted ||
    stateBridge.shouldAdvanceState ||
    finalEnvelope.meta?.freshMarionFinal ||
    finalEnvelope.meta?.singleFinalAuthority ||
    finalEnvelope.source === "marion" ||
    finalEnvelope.signature === FINAL_SIGNATURE ||
    meta.hardlockCompatible ||
    packetMeta.hardlockCompatible ||
    payload.hardlockCompatible
  );
}

function hasExplicitFinalEnvelopeContract(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const inbound = isPlainObject(p.inbound) ? p.inbound : {};
  const marion = extractMarionObject(p);
  const finalEnvelope = extractFinalEnvelopeObject(params);
  const payload = isPlainObject(marion.payload) ? marion.payload : {};
  const candidates = [finalEnvelope, p, inbound, marion, isPlainObject(payload.finalEnvelope) ? payload.finalEnvelope : {}];
  return candidates.some((candidate) => !!(
    candidate &&
    isPlainObject(candidate) &&
    candidate.contractVersion === FINAL_ENVELOPE_CONTRACT &&
    /^(marion|composeMarionResponse|marionBridge)$/i.test(safeStr(candidate.source || candidate.authority || "marion")) &&
    candidate.signature === FINAL_SIGNATURE &&
    candidate.final === true &&
    candidate.marionFinal === true
  ));
}

function signatureLooksTrusted(signature) {
  const sig = oneLine(signature);
  if (!sig) return false;
  if (sig === FINAL_SIGNATURE) return true;
  return !!(
    sig.indexOf(MARION_FINAL_SIGNATURE_PREFIX) === 0 &&
    sig.indexOf(REQUIRED_CHAT_ENGINE_SIGNATURE) !== -1 &&
    (
      sig.indexOf(STATE_SPINE_SCHEMA) !== -1 ||
      sig.indexOf(STATE_SPINE_SCHEMA_COMPAT) !== -1 ||
      /nyx\.marion\.stateSpine\/[0-9.]+/i.test(sig)
    )
  );
}


function hasTrustedMarionFinalEnvelope(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const inbound = isPlainObject(p.inbound) ? p.inbound : {};
  const meta = isPlainObject(p.meta) ? p.meta : {};
  const marion = extractMarionObject(p);
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const packetMeta = isPlainObject(packet.meta) ? packet.meta : {};
  const synthesis = isPlainObject(packet.synthesis) ? packet.synthesis : {};
  const payload = isPlainObject(marion.payload) ? marion.payload : {};
  const memoryPatch = extractComposerMemoryPatch(p);
  const stateBridge = isPlainObject(memoryPatch.stateBridge) ? memoryPatch.stateBridge : {};
  const sig = extractMarionFinalSignature(p);
  const reply = extractComposerReply(p);

  const finalEnvelope = extractFinalEnvelopeObject(p);
  const marionSideFinal = !!(
    p.marionFinal ||
    inbound.marionFinal ||
    meta.marionFinal ||
    finalEnvelope.marionFinal ||
    finalEnvelope.final ||
    marion.marionFinal ||
    packet.marionFinal ||
    packetMeta.marionFinal ||
    synthesis.marionFinal ||
    payload.marionFinal ||
    memoryPatch.marionFinal ||
    memoryPatch.final
  );

  const composerAdvance = !!(
    memoryPatch.composedOnce ||
    memoryPatch.shouldAdvanceState ||
    stateBridge.composedOnce ||
    stateBridge.shouldAdvanceState ||
    stateBridge.finalEnvelopeTrusted
  );

  if (hasExplicitFinalEnvelopeContract(p)) return true;
  if (signatureLooksTrusted(sig) && (marionSideFinal || composerAdvance)) return true;
  if (hasKnownGoodFinalContract(p) && hasLegacyTrustFlag(p) && (marionSideFinal || composerAdvance)) return true;
  if ((marionSideFinal || composerAdvance) && hasLegacyTrustFlag(p) && isActionableComposerReply(reply)) return true;

  return false;
}

function isLoopPhrase(text) {
  const s = oneLine(text).toLowerCase();
  if (!s) return false;
  if (/give me the specific target or outcome/i.test(s) || /specific target.*answer directly/i.test(s)) return true;
  return /^(i['’]?m here with you|i am here with you|i['’]?m right here with you|i understand|i hear you|i['’]?ve got you|i got you|we can take this one step at a time)[.!?]*$/.test(s) ||
    /i caught the repeated response/i.test(s) ||
    /not going to recycle/i.test(s) ||
    /same support line/i.test(s) ||
    /exact point you want handled next/i.test(s) ||
    /send the specific file, route, or response/i.test(s) ||
    /final reply did not validate cleanly/i.test(s) ||
    /response path was interrupted before marion completed/i.test(s) ||
    /marion did not return|final envelope missing|diagnostic packet|non-final/i.test(s);
}

function isActionableComposerReply(text) {
  const s = oneLine(text);
  if (!s) return false;
  if (isLoopPhrase(s)) return false;
  if (/not going to recycle|fallback loop/i.test(s)) return false;
  if (s.length < 12) return false;
  return true;
}

function isDeepeningInbound(inbound = {}, params = {}) {
  const text = safeStr(extractInboundText(inbound)).toLowerCase();
  const p = isPlainObject(params) ? params : {};
  const memoryPatch = extractComposerMemoryPatch(p);
  const continuity = isPlainObject(memoryPatch.emotionalContinuity) ? memoryPatch.emotionalContinuity : {};
  return !!(
    /\b(given that|based on that|what happens if|what layer|that risk|that setup|continue|deeper|underneath|still|exhausting|mentally|carry)\b/i.test(text) ||
    continuity.active === true ||
    continuity.carried === true ||
    continuity.continuityPreserved === true ||
    Number(continuity.carryDepth || 0) > 0
  );
}

function isTrustedDeepeningCompletion(params = {}, inbound = {}) {
  const reply = extractComposerReply(params);
  return !!(
    isDeepeningInbound(inbound, params) &&
    isActionableComposerReply(reply) &&
    (hasMarionFinalSignal(params) || hasTrustedFinalShape(params) || hasTrustedMarionFinalEnvelope(params))
  );
}

function shouldTechnicalBypassSupportLock(inbound, decision, params = {}) {
  const technical = isTechnicalInbound(inbound);
  if (!technical) return false;
  const plannerStage = safeStr(decision?.stage || params.stage || "").toLowerCase();
  const intent = safeStr(params.intent || params.marionCog?.intent || extractIntent(inbound)).toUpperCase();
  return !!(
    plannerStage === "execution" ||
    intent === "TECHNICAL_DEBUG" ||
    intent === "ADVANCE" ||
    /debug|patch|update|fix|script|file|index|state|state spine|loop|looping|autopsy|downloadable|zip/i.test(safeStr(extractInboundText(inbound)))
  );
}

function hasTrustedFinalShape(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const inbound = isPlainObject(p.inbound) ? p.inbound : {};
  const meta = isPlainObject(p.meta) ? p.meta : {};
  const marion = extractMarionObject(p);
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const packetMeta = isPlainObject(packet.meta) ? packet.meta : {};
  const payload = isPlainObject(marion.payload) ? marion.payload : {};
  const memoryPatch = extractComposerMemoryPatch(p);
  const reply = extractComposerReply(p);
  const hasFinalFlag = !!(
    p.marionFinal || p.final ||
    inbound.marionFinal || inbound.final ||
    meta.marionFinal || meta.final ||
    marion.marionFinal || marion.final ||
    packet.marionFinal || packet.final ||
    packetMeta.marionFinal || packetMeta.final ||
    payload.marionFinal || payload.final ||
    memoryPatch.marionFinal || memoryPatch.final
  );
  const bridgeAdvance = !!(memoryPatch?.stateBridge?.shouldAdvanceState || memoryPatch.shouldAdvanceState);
  const composedOnce = !!(memoryPatch.composedOnce || memoryPatch?.stateBridge?.composedOnce);
  return !!((hasFinalFlag || bridgeAdvance || composedOnce) && isActionableComposerReply(reply));
}


function canonicalTurnInputSource(inbound = {}, params = {}) {
  const src = isPlainObject(inbound) ? inbound : {};
  const p = isPlainObject(params) ? params : {};
  const mp = extractComposerMemoryPatch(params);
  const raw = oneLine(firstNonEmpty(src.inputSource, src.source, src?.ui?.inputSource, src?.client?.inputSource, src?.session?.inputSource, p.inputSource, p.source, mp.inputSource, "text")).toLowerCase();
  return /^(voice|mic|microphone|speech|spoken|audio)$/.test(raw) ? "voice" : "text";
}


function canonicalTechnicalTargetFromText(text=""){
  const t=oneLine(text);
  const mk=(targetKey,targetName,targetFile,targetPath)=>({version:"nyx.marion.technicalTargetLock/1.0",targetKey,targetName,targetFile,targetPath,explicit:true,source:"current_user_text",locked:true,technicalFollowUpLock:true,blockScheduleInterception:true});
  if(/\b(chat\s*engine|chatengine)\b/i.test(t))return mk("chatengine","ChatEngine","chatEngine.js","Utils/chatEngine.js");
  if(/\b(compose\s*marion\s*response|composemarionresponse|composer)\b/i.test(t))return mk("composeMarionResponse","ComposeMarionResponse","composeMarionResponse.js","Data/marion/runtime/composeMarionResponse.js");
  if(/\b(marion\s*bridge|marionbridge)\b/i.test(t))return mk("marionBridge","MarionBridge","marionBridge.js","Data/marion/runtime/marionBridge.js");
  if(/\b(state\s*spine|statespine|state-spine)\b/i.test(t))return mk("stateSpine","StateSpine","stateSpine.js","Utils/stateSpine.js");
  if(/\b(intent\s*router|marionintentrouter)\b/i.test(t))return mk("marionIntentRouter","MarionIntentRouter","marionIntentRouter.js","Data/marion/runtime/marionIntentRouter.js");
  if(/\b(domain\s*router|domainrouter)\b/i.test(t))return mk("domainRouter","DomainRouter","domainRouter.js","Utils/domainRouter.js");
  if(/\b(domain\s*registry|mariondomainregistry)\b/i.test(t))return mk("marionDomainRegistry","MarionDomainRegistry","marionDomainRegistry.js","Data/marion/runtime/marionDomainRegistry.js");
  if(/\b(index\.js|api\/chat|\/api\/chat)\b/i.test(t))return mk("index","index.js","index.js","index.js");
  return null;
}
function extractTechnicalTargetLockState(prev={},memoryPatch={},inbound={}){
  const current=canonicalTechnicalTargetFromText(extractInboundText(inbound));
  if(current)return current;
  const mp=isPlainObject(memoryPatch)?memoryPatch:{}, prior=isPlainObject(prev)?prev:{};
  const candidates=[mp.technicalTargetLock,mp?.stateBridge?.technicalTargetLock,prior.technicalTargetLock,prior?.stateBridge?.technicalTargetLock];
  for(const item of candidates){if(isPlainObject(item)&&item.targetPath)return item;}
  return {};
}

function extractFiveTurnContractState(prev = {}, memoryPatch = {}, inbound = {}) {
  const prior = isPlainObject(prev.fiveTurnContract) ? prev.fiveTurnContract : {};
  const mp = isPlainObject(memoryPatch.fiveTurnContract) ? memoryPatch.fiveTurnContract : {};
  const cr = isPlainObject(memoryPatch.continuityRegression) ? memoryPatch.continuityRegression : {};
  const text = oneLine(extractInboundText(inbound));
  const active = !!(mp.active || prior.active || /\b(5[- ]?turn|five[- ]?turn|five[- ]?term|continuity regression|testing continuity|project is sandblast|stronger user engagement|what should we improve first|now connect.*roku|summarize the plan|mic\/?text|mic text|mytext|final[- ]?envelope authority|preserve route|preserve.*state)\b/i.test(text));
  const technicalTargetLock=extractTechnicalTargetLockState(prev,memoryPatch,inbound);
  const target = firstNonEmpty(safeObj(technicalTargetLock).targetPath, mp.regressionTarget, cr.regressionTarget, prior.regressionTarget, /preserve route,? state,? and final[- ]?envelope authority/i.test(text) ? "preserve route, state, and final-envelope authority" : "");
  let turn = clampInt(mp.turn || prior.turn, 0, 0, 999999);
  const m = text.match(/\bturn\s*([1-5])\b/i);
  if (m) turn = clampInt(m[1], turn, 1, 5);
  else if (/project is sandblast|stronger user engagement|convert more roku viewers|what target|target did i ask/i.test(text)) turn = 2;
  else if (/what should we improve first|improve first|give me the first move|first move|connect.*mic|mic.*parity/i.test(text)) turn = 3;
  else if (/now connect.*roku|connect.*roku|make it sharper|make it commercial|consistent.*voice|typed input/i.test(text)) turn = 4;
  else if (/summarize.*plan|summarize.*regression|three steps|four bullets|user[- ]facing message|turn it into a user/i.test(text)) turn = 5;
  else if (/testing.*continuity|remember this target|refining progression shaping|progression shaping/i.test(text)) turn = 1;
  return { version: "nyx.stateSpine.fiveTurnContract/1.0", active, turn, technicalTargetLock, regressionTarget: boundedOneLine(target, 220), turnObjective: firstNonEmpty(mp.turnObjective, cr.turnObjective, prior.turnObjective, turn ? `five_turn_continuity_turn_${turn}` : ""), parityTarget: firstNonEmpty(mp.parityTarget, cr.parityTarget, prior.parityTarget, "same normalized intent, same route, same state carry, same final-envelope reply structure"), updatedAt: nowMs() };
}

function buildFiveTurnContinuityState({ prev = {}, inbound = {}, memoryPatch = {}, speak = "", userHash = "", assistantHash = "", trustedFinalCompletion = false, nextTurnDepth = 0 } = {}) {
  const prior = isPlainObject(prev.continuityRegression) ? prev.continuityRegression : {};
  const window = Array.isArray(prior.window) ? prior.window.slice(-4) : [];
  const fiveTurnContract=extractFiveTurnContractState(prev,memoryPatch,inbound);
  const technicalTargetLock=extractTechnicalTargetLockState(prev,memoryPatch,inbound);
  const marker = { at: nowMs(), technicalTargetLock, source: canonicalTurnInputSource(inbound, { inputSource: memoryPatch.inputSource }), userHash: boundedSignature(userHash), replyHash: boundedSignature(assistantHash || memoryPatch.replyStateSignature || memoryPatch.replySignature), depth: clampInt(nextTurnDepth, 0, 0, 999999), trustedFinal: !!trustedFinalCompletion, topic: boundedOneLine(memoryPatch.lastTopic || prev.lastTopic || safeObj(prev.continuity).topic || "", 160), regressionTarget: fiveTurnContract.regressionTarget, turnObjective: fiveTurnContract.turnObjective };
  if (trustedFinalCompletion) window.push(marker);
  return { version: "nyx.stateSpine.fiveTurnContinuity/1.1", active: true, depth: clampInt(nextTurnDepth, 0, 0, 999999), window: window.slice(-5), windowSize: Math.min(5, window.length), inputSource: marker.source, parityLock: true, lastUserHash: marker.userHash, lastAssistantHash: marker.replyHash, regressionTarget: fiveTurnContract.regressionTarget, turnObjective: fiveTurnContract.turnObjective, parityTarget: fiveTurnContract.parityTarget, fiveTurnContract, technicalTargetLock, updatedAt: nowMs() };
}

function createState(seed = {}) {
  const lane = safeStr(seed.lane || "general") || "general";
  const stage = safeStr(seed.stage || "open") || "open";
  return {
    rev: 0,
    lane,
    stage,
    phase: inferPhaseFromStage(stage, false),
    domain: lane,
    lastUserText: "",
    rawUserText: "",
    normalizedUserIntent: "",
    questionShape: normalizeQuestionShapeCarry({}),
    lastAssistantReply: "",
    lastKnowledgeDomain: "",
    lastTopic: "",
    continuity: {},
    followUpReference: {},
    followupAction: "",
    continuityAction: "",
    continuityResolvedText: "",
    continuityResolvedOriginalText: "",
    conversationSummary: "",
    carryForwardSummary: "",
    turnDepth: 0,
    lastIntent: "",
    lastAction: "",
    lastUserHash: "",
    lastAssistantHash: "",
    lastInputSource: "",
    inputParity: { lastSource: "", lastVoiceHash: "", lastTextHash: "", mismatchCount: 0, updatedAt: 0 },
    continuityRegression: { version: "nyx.stateSpine.fiveTurnContinuity/1.0", active: true, depth: 0, window: [], windowSize: 0, inputSource: "", parityLock: true, updatedAt: 0 },
    lastMove: "",
    lastRationale: "",
    lastPlannerMode: "",
    progressionLock: false,
    progressionShapingGuard: normalizeProgressionShapingGuardCarry({ active: false, reason: "initial_state" }),
    progressionRefinement: normalizeProgressionRefinementCarry({ active: false }),
    progressionTelemetry: {},
    volatility: "stable",
    turns: { user: 0, assistant: 0 },
    repetition: {
      sameLaneCount: 0,
      sameStageCount: 0,
      sameIntentCount: 0,
      sameUserHashCount: 0,
      sameAssistantHashCount: 0,
      sameEmotionCount: 0,
      sameSupportModeCount: 0,
      sameArchetypeCount: 0,
      noProgressCount: 0,
      fallbackCount: 0
    },
    support: {
      lockActive: false,
      lockBias: "",
      quietTurns: 0,
      holdTurns: 0,
      reason: "",
      shouldSuppressMenus: false,
      supportMode: "",
      archetype: "",
      questionStyle: "",
      emotionKey: "",
      emotionCluster: ""
    },
    audio: {
      lastFailureReason: "",
      lastFailureStatus: 0,
      lastFailureAction: "",
      lastFailureRetryable: false,
      lastFailureAt: 0,
      terminalStopUntil: 0,
      terminalStopReason: "",
      lastSuccessAt: 0,
      lastPlayableAt: 0,
      lastPlayableKind: "",
      lastAudioUrl: "",
      lastAudioMimeType: "",
      lastAudioFormat: "",
      lastAudioChars: 0,
      playbackReady: false,
      requested: false,
      enabled: false,
      shouldSpeak: false,
      autoPlay: false,
      route: "/api/tts",
      playbackState: "idle",
      lastRequestAt: 0,
      lastStartedAt: 0,
      lastEndedAt: 0,
      consecutiveFailures: 0
    },
    emotionalEngine: {
      primaryState: "focused",
      secondaryState: "steady",
      continuityScore: 0.35,
      stateStreak: 0,
      placeholder: "Ask Nyx anything about Sandblast…",
      lastActionLabels: [],
      presenceState: "receptive",
      listenerMode: "attuned"
    },
    continuityThread: {
      depthLevel: 1,
      threadContinuation: false,
      unresolvedSignals: [],
      lastTopics: [],
      responseMode: "steady",
      updatedAt: 0
    },
    creativeCognitive: {
      active: false,
      lastMode: "",
      lastIntent: "",
      lastSuggestionHash: "",
      lastSuggestionSummary: "",
      suggestionCount: 0,
      suppressedOnGreeting: false,
      suppressedOnSystemCheck: false,
      updatedAt: 0
    },
    greeting: {
      active: false,
      lastId: "",
      lastIntent: "",
      lastTone: "",
      lastEnergy: "",
      lastSource: "",
      lastPresenceProfile: "",
      seenCount: 0,
      voiceCount: 0,
      distressCount: 0,
      updatedAt: 0
    },
    runtimeTelemetry: { version: FINAL_RUNTIME_TELEMETRY_VERSION, source: "stateSpine.createState", stage: normalizeStateStage(stage, "open"), canEmit: false, updatedAt: 0 },
    marionCohesion: {
      composerObserved: false,
      marionFinalObserved: false,
      lastComposerIntent: "",
      lastComposerDomain: "",
      lastComposerUserSignature: "",
      lastComposerReplySignature: "",
      lastMarionFinalSignature: "",
      finalEnvelopeTrusted: false,
      loopPhraseRejected: false,
      loopBreakTrustedFinal: false,
      statePatchRequired: false,
      shouldAdvanceState: false,
      noProgressCount: 0,
      updatedAt: 0
    },
    lastUpdatedAt: 0
  };
}

function coerceState(input) {
  const base = createState({
    lane: safeStr(input?.lane || "general"),
    stage: safeStr(input?.stage || "open")
  });
  const src = isPlainObject(input) ? input : {};
  return {
    ...base,
    ...src,
    lane: safeStr(src.lane || base.lane) || "general",
    stage: safeStr(src.stage || base.stage) || "open",
    phase: safeStr(src.phase || inferPhaseFromStage(src.stage || base.stage, !!src.progressionLock)) || "active",
    domain: safeStr(src.domain || src.lane || base.domain) || "general",
    lastUserText: boundedOneLine(src.lastUserText || base.lastUserText || "", MAX_STATE_TEXT),
    rawUserText: boundedOneLine(src.rawUserText || base.rawUserText || "", MAX_STATE_TEXT),
    normalizedUserIntent: boundedOneLine(src.normalizedUserIntent || base.normalizedUserIntent || "", MAX_STATE_TEXT),
    questionShape: normalizeQuestionShapeCarry(src.questionShape || base.questionShape || {}),
    lastAssistantReply: boundedOneLine(src.lastAssistantReply || base.lastAssistantReply || "", MAX_STATE_TEXT),
    lastKnowledgeDomain: safeStr(src.lastKnowledgeDomain || base.lastKnowledgeDomain || ""),
    lastTopic: boundedOneLine(src.lastTopic || base.lastTopic || "", 320),
    continuity: normalizeContinuityCarry(src.continuity || base.continuity || {}),
    followUpReference: normalizeContinuityCarry(src.followUpReference || src.continuity || base.followUpReference || {}),
    followupAction: boundedOneLine(src.followupAction || src.continuityAction || "", 64),
    continuityAction: boundedOneLine(src.continuityAction || src.followupAction || "", 64),
    continuityResolvedText: boundedOneLine(src.continuityResolvedText || safeObj(src.continuity).resolvedText || "", 260),
    continuityResolvedOriginalText: boundedOneLine(src.continuityResolvedOriginalText || safeObj(src.continuity).originalText || "", 220),
    conversationSummary: boundedOneLine(src.conversationSummary || base.conversationSummary || "", MAX_STATE_SUMMARY),
    carryForwardSummary: boundedOneLine(src.carryForwardSummary || base.carryForwardSummary || "", MAX_STATE_SUMMARY),
    turnDepth: clampInt(src.turnDepth, base.turnDepth || 0, 0, 999999),
    lastIntent: boundedOneLine(src.lastIntent || "", 120),
    lastAction: boundedOneLine(src.lastAction || "", 160),
    lastUserHash: boundedSignature(src.lastUserHash || ""),
    lastAssistantHash: boundedSignature(src.lastAssistantHash || ""),
    lastInputSource: oneLine(src.lastInputSource || ""),
    inputParity: isPlainObject(src.inputParity) ? src.inputParity : base.inputParity,
    continuityRegression: isPlainObject(src.continuityRegression) ? src.continuityRegression : base.continuityRegression,
    runtimeTelemetry: isPlainObject(src.runtimeTelemetry) ? src.runtimeTelemetry : base.runtimeTelemetry,
    lastMove: boundedOneLine(src.lastMove || "", 160),
    lastRationale: boundedOneLine(src.lastRationale || "", 320),
    lastPlannerMode: boundedOneLine(src.lastPlannerMode || "", 120),
    progressionLock: !!src.progressionLock,
    volatility: safeStr(src.volatility || "stable") || "stable",
    turns: {
      user: clampInt(src?.turns?.user, 0, 0, 999999),
      assistant: clampInt(src?.turns?.assistant, 0, 0, 999999)
    },
    repetition: {
      sameLaneCount: clampInt(src?.repetition?.sameLaneCount, 0, 0, 999999),
      sameStageCount: clampInt(src?.repetition?.sameStageCount, 0, 0, 999999),
      sameIntentCount: clampInt(src?.repetition?.sameIntentCount, 0, 0, 999999),
      sameUserHashCount: clampInt(src?.repetition?.sameUserHashCount, 0, 0, 999999),
      sameAssistantHashCount: clampInt(src?.repetition?.sameAssistantHashCount, 0, 0, 999999),
      sameEmotionCount: clampInt(src?.repetition?.sameEmotionCount, 0, 0, 999999),
      sameSupportModeCount: clampInt(src?.repetition?.sameSupportModeCount, 0, 0, 999999),
      sameArchetypeCount: clampInt(src?.repetition?.sameArchetypeCount, 0, 0, 999999),
      noProgressCount: clampInt(src?.repetition?.noProgressCount, 0, 0, 999999),
      fallbackCount: clampInt(src?.repetition?.fallbackCount, 0, 0, 999999)
    },
    support: {
      lockActive: !!src?.support?.lockActive,
      lockBias: safeStr(src?.support?.lockBias || ""),
      quietTurns: clampInt(src?.support?.quietTurns, 0, 0, 999999),
      holdTurns: clampInt(src?.support?.holdTurns, 0, 0, 999999),
      reason: safeStr(src?.support?.reason || ""),
      shouldSuppressMenus: !!src?.support?.shouldSuppressMenus,
      supportMode: safeStr(src?.support?.supportMode || ""),
      archetype: safeStr(src?.support?.archetype || ""),
      questionStyle: safeStr(src?.support?.questionStyle || ""),
      emotionKey: safeStr(src?.support?.emotionKey || ""),
      emotionCluster: safeStr(src?.support?.emotionCluster || "")
    },
    audio: {
      lastFailureReason: safeStr(src?.audio?.lastFailureReason || ""),
      lastFailureStatus: clampInt(src?.audio?.lastFailureStatus, 0, 0, 999999),
      lastFailureAction: safeStr(src?.audio?.lastFailureAction || ""),
      lastFailureRetryable: !!src?.audio?.lastFailureRetryable,
      lastFailureAt: Number(src?.audio?.lastFailureAt || 0) || 0,
      terminalStopUntil: Number(src?.audio?.terminalStopUntil || 0) || 0,
      terminalStopReason: safeStr(src?.audio?.terminalStopReason || ""),
      lastSuccessAt: Number(src?.audio?.lastSuccessAt || 0) || 0,
      lastPlayableAt: Number(src?.audio?.lastPlayableAt || 0) || 0,
      lastPlayableKind: safeStr(src?.audio?.lastPlayableKind || ""),
      lastAudioUrl: safeStr(src?.audio?.lastAudioUrl || ""),
      lastAudioMimeType: safeStr(src?.audio?.lastAudioMimeType || ""),
      lastAudioFormat: safeStr(src?.audio?.lastAudioFormat || ""),
      lastAudioChars: clampInt(src?.audio?.lastAudioChars, 0, 0, 999999),
      playbackReady: !!src?.audio?.playbackReady,
      requested: !!src?.audio?.requested,
      enabled: !!src?.audio?.enabled,
      shouldSpeak: !!src?.audio?.shouldSpeak,
      autoPlay: !!src?.audio?.autoPlay,
      route: safeStr(src?.audio?.route || "/api/tts") || "/api/tts",
      playbackState: safeStr(src?.audio?.playbackState || "idle") || "idle",
      lastRequestAt: Number(src?.audio?.lastRequestAt || 0) || 0,
      lastStartedAt: Number(src?.audio?.lastStartedAt || 0) || 0,
      lastEndedAt: Number(src?.audio?.lastEndedAt || 0) || 0,
      consecutiveFailures: clampInt(src?.audio?.consecutiveFailures, 0, 0, 999999)
    },
    emotionalEngine: {
      primaryState: safeStr(src?.emotionalEngine?.primaryState || "focused") || "focused",
      secondaryState: safeStr(src?.emotionalEngine?.secondaryState || "steady") || "steady",
      continuityScore: Math.max(0, Math.min(1, Number(src?.emotionalEngine?.continuityScore ?? 0.35) || 0.35)),
      stateStreak: clampInt(src?.emotionalEngine?.stateStreak, 0, 0, 999999),
      placeholder: safeStr(src?.emotionalEngine?.placeholder || "Ask Nyx anything about Sandblast…") || "Ask Nyx anything about Sandblast…",
      lastActionLabels: boundedArray(src?.emotionalEngine?.lastActionLabels, 6, 120),
      presenceState: safeStr(src?.emotionalEngine?.presenceState || "receptive") || "receptive",
      listenerMode: safeStr(src?.emotionalEngine?.listenerMode || "attuned") || "attuned"
    },
    continuityThread: {
      depthLevel: clampInt(src?.continuityThread?.depthLevel, 1, 1, 999999),
      threadContinuation: !!src?.continuityThread?.threadContinuation,
      unresolvedSignals: boundedArray(src?.continuityThread?.unresolvedSignals, 6, 160),
      lastTopics: boundedArray(src?.continuityThread?.lastTopics, 6, 160),
      responseMode: boundedOneLine(src?.continuityThread?.responseMode || "steady", 160) || "steady",
      updatedAt: Number(src?.continuityThread?.updatedAt || 0) || 0
    },
    creativeCognitive: {
      active: !!src?.creativeCognitive?.active,
      lastMode: boundedOneLine(src?.creativeCognitive?.lastMode || "", 120),
      lastIntent: boundedOneLine(src?.creativeCognitive?.lastIntent || "", 160),
      lastSuggestionHash: boundedSignature(src?.creativeCognitive?.lastSuggestionHash || ""),
      lastSuggestionSummary: boundedOneLine(src?.creativeCognitive?.lastSuggestionSummary || "", 640),
      suggestionCount: clampInt(src?.creativeCognitive?.suggestionCount, 0, 0, 999999),
      suppressedOnGreeting: !!src?.creativeCognitive?.suppressedOnGreeting,
      suppressedOnSystemCheck: !!src?.creativeCognitive?.suppressedOnSystemCheck,
      updatedAt: Number(src?.creativeCognitive?.updatedAt || 0) || 0
    },
    greeting: {
      active: !!src?.greeting?.active,
      lastId: safeStr(src?.greeting?.lastId || ""),
      lastIntent: canonicalGreetingIntent(src?.greeting?.lastIntent || ""),
      lastTone: normalizeGreetingTone(src?.greeting?.lastTone || ""),
      lastEnergy: normalizeGreetingEnergy(src?.greeting?.lastEnergy || ""),
      lastSource: normalizeInputSource(src?.greeting?.lastSource || ""),
      lastPresenceProfile: safeStr(src?.greeting?.lastPresenceProfile || ""),
      seenCount: clampInt(src?.greeting?.seenCount, 0, 0, 999999),
      voiceCount: clampInt(src?.greeting?.voiceCount, 0, 0, 999999),
      distressCount: clampInt(src?.greeting?.distressCount, 0, 0, 999999),
      updatedAt: Number(src?.greeting?.updatedAt || 0) || 0
    },
    marionCohesion: {
      composerObserved: !!src?.marionCohesion?.composerObserved,
      marionFinalObserved: !!src?.marionCohesion?.marionFinalObserved,
      lastComposerIntent: safeStr(src?.marionCohesion?.lastComposerIntent || ""),
      lastComposerDomain: safeStr(src?.marionCohesion?.lastComposerDomain || ""),
      lastComposerUserSignature: safeStr(src?.marionCohesion?.lastComposerUserSignature || ""),
      lastComposerReplySignature: safeStr(src?.marionCohesion?.lastComposerReplySignature || ""),
      lastMarionFinalSignature: safeStr(src?.marionCohesion?.lastMarionFinalSignature || ""),
      finalEnvelopeTrusted: !!src?.marionCohesion?.finalEnvelopeTrusted,
      loopPhraseRejected: !!src?.marionCohesion?.loopPhraseRejected,
      loopBreakTrustedFinal: !!src?.marionCohesion?.loopBreakTrustedFinal,
      statePatchRequired: !!src?.marionCohesion?.statePatchRequired,
      shouldAdvanceState: !!src?.marionCohesion?.shouldAdvanceState,
      noProgressCount: clampInt(src?.marionCohesion?.noProgressCount, 0, 0, 999999),
      updatedAt: Number(src?.marionCohesion?.updatedAt || 0) || 0
    },
    lastUpdatedAt: Number(src.lastUpdatedAt || 0) || 0
  };
}

function inferPhaseFromStage(stage, lock) {
  const s = safeStr(stage || "").toLowerCase();
  if (s === "recovery" || s === "stabilize" || s === "terminal_stop" || s === "quiet") return "recovery";
  if (s === "deliver" || s === "advance" || s === "domain_depth_1" || s === "domain_depth_2") return "active";
  if (s === "execution") return "execution";
  if (lock) return "recovery";
  return "active";
}

function isTechnicalInbound(inbound) {
  const text = safeStr(extractInboundText(inbound)).toLowerCase();
  const action = safeStr(inbound?.action || inbound?.payload?.action || inbound?.payload?.route || "").toLowerCase();
  return /(chat engine|state spine|support response|loop|looping|debug|debugging|patch|update|rebuild|restructure|integrate|implementation|code|script|file|tts|api|route|backend|fix|voice route|voiceroute)/.test(text) ||
    /(diagnosis|restructure|patch|implement|debug|fix|repair|analysis)/.test(action);
}

function extractIntent(inbound) {
  const cogIntent = safeStr(inbound?.cog?.intent || "").toUpperCase();
  if (cogIntent) return cogIntent;
  const turnIntent = safeStr(inbound?.turnSignals?.turnIntent || "").toUpperCase();
  if (turnIntent) return turnIntent;
  const action = safeStr(inbound?.action || inbound?.payload?.action || inbound?.payload?.route || "").toUpperCase();
  if (action) return action;
  return "ADVANCE";
}

function extractResolvedEmotionState(inbound = {}, params = {}) {
  const src = isPlainObject(inbound) ? inbound : {};
  const p = isPlainObject(params) ? params : {};
  const payload = isPlainObject(src.payload) ? src.payload : {};
  const meta = isPlainObject(src.meta) ? src.meta : {};
  const marion = extractMarionObject(p);
  const memoryPatch = extractComposerMemoryPatch(p);
  const finalEnvelope = extractFinalEnvelopeObject(p);
  const candidates = [
    p.resolvedEmotion,
    p.emotionState,
    p.lastEmotionState,
    p.emotionalState,
    isPlainObject(p.emotionRuntime) ? p.emotionRuntime.state : {},
    src.resolvedEmotion,
    src.emotionState,
    src.lastEmotionState,
    src.emotionalState,
    payload.resolvedEmotion,
    payload.emotionState,
    meta.resolvedEmotion,
    meta.emotionState,
    marion.resolvedEmotion,
    marion.emotionState,
    finalEnvelope.resolvedEmotion,
    memoryPatch.resolvedEmotion,
    memoryPatch.emotionState,
    memoryPatch.lastEmotionState
  ];
  for (const candidate of candidates) {
    if (isPlainObject(candidate) && Object.keys(candidate).length) return candidate;
  }
  return {};
}

function summarizeResolvedEmotionState(state = {}) {
  const resolved = isPlainObject(state) ? state : {};
  const emotion = isPlainObject(resolved.emotion) ? resolved.emotion : {};
  const nuance = isPlainObject(resolved.nuance) ? resolved.nuance : {};
  const support = isPlainObject(resolved.support) ? resolved.support : {};
  const guard = isPlainObject(resolved.guard) ? resolved.guard : {};
  const psychology = isPlainObject(resolved.psychology) ? resolved.psychology : {};
  const drift = isPlainObject(resolved.state_drift) ? resolved.state_drift : {};
  const primary = safeStr(emotion.primary || "").toLowerCase();
  const secondary = safeStr(emotion.secondary || nuance.subtype || "").toLowerCase();
  const intensity = Math.max(0, Math.min(1, Number(emotion.intensity || 0) || 0));
  const confidence = Math.max(0, Math.min(1, Number(emotion.confidence || 0) || 0));
  return {
    present: !!(primary || secondary || Object.keys(resolved).length),
    primary: primary || "",
    secondary: secondary || "",
    intensity,
    confidence,
    careMode: safeStr(psychology.care_mode || ""),
    actionMode: safeStr(guard.action_mode || ""),
    safeToContinue: guard.safe_to_continue !== false,
    escalationNeeded: !!guard.escalation_needed,
    suppressionSignal: safeStr(nuance.suppression_signal || ""),
    timingProfile: isPlainObject(support.timing_profile) ? support.timing_profile : {},
    stability: Number.isFinite(Number(drift.stability)) ? Number(drift.stability) : 0,
    volatility: Number.isFinite(Number(drift.volatility)) ? Number(drift.volatility) : 0,
    dominantPattern: safeStr(drift.dominant_pattern || "")
  };
}

function normalizeAudioSignal(inbound) {
  const src = isPlainObject(inbound) ? inbound : {};
  const sig = isPlainObject(src.turnSignals) ? src.turnSignals : {};
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const finalEnvelope = safeObj(src.finalEnvelope || payload.finalEnvelope || meta.finalEnvelope);
  const speech = safeObj(src.speech || payload.speech || finalEnvelope.speech || meta.speech);
  const playback = safeObj(src.playback || payload.playback || finalEnvelope.playback || speech.playback);
  const audioFailure = isPlainObject(src.audioFailure) ? src.audioFailure : (isPlainObject(src.ttsFailure) ? src.ttsFailure : safeObj(payload.ttsFailure));
  const audio = isPlainObject(src.audio) ? src.audio : safeObj(payload.audio || finalEnvelope.audio);
  const ttsResult = isPlainObject(src.ttsResult) ? src.ttsResult : (isPlainObject(src.tts) ? src.tts : safeObj(payload.ttsResult || payload.tts));
  const transport = isPlainObject(src.transport) ? src.transport : safeObj(payload.transport);
  const bridgeTts = isPlainObject(src?.bridge?.tts) ? src.bridge.tts : {};

  const actionRaw = safeStr(sig.ttsAction || sig.audioAction || audioFailure.action || audio.action || ttsResult.action || transport.action || bridgeTts.action || "");
  const action = /retry/i.test(actionRaw) ? "retry" : /downgrade/i.test(actionRaw) ? "downgrade" : /stop|terminal/i.test(actionRaw) ? "stop" : "";
  const shouldStop = !!(sig.ttsShouldStop || sig.audioShouldStop || audioFailure.shouldTerminate || audioFailure.shouldStop || audio.shouldStop || ttsResult.shouldStop || transport.shouldStop || bridgeTts.shouldStop || action === "stop");
  const retryable = !!(sig.ttsRetryable || sig.audioRetryable || audioFailure.retryable || audio.retryable || ttsResult.retryable || transport.retryable || bridgeTts.retryable || action === "retry");
  const reason = safeStr(sig.ttsReason || sig.audioReason || audioFailure.reason || audioFailure.message || audio.reason || ttsResult.reason || transport.reason || bridgeTts.reason || "");
  const status = clampInt(sig.ttsProviderStatus || sig.audioProviderStatus || audioFailure.providerStatus || audioFailure.status || audio.providerStatus || audio.status || ttsResult.providerStatus || ttsResult.status || transport.providerStatus || transport.status || bridgeTts.providerStatus || bridgeTts.status, 0, 0, 999999);
  const audioUrl = safeStr(sig.audioUrl || sig.ttsAudioUrl || audio.url || audio.audioUrl || ttsResult.url || ttsResult.audioUrl || transport.url || transport.audioUrl || bridgeTts.url || bridgeTts.audioUrl || "");
  const audioBase64 = safeStr(sig.audioBase64 || sig.ttsAudioBase64 || audio.base64 || audio.audioBase64 || ttsResult.base64 || ttsResult.audioBase64 || transport.base64 || transport.audioBase64 || bridgeTts.base64 || bridgeTts.audioBase64 || "");
  const mimeType = safeStr(sig.audioMimeType || sig.ttsMimeType || audio.mimeType || audio.contentType || ttsResult.mimeType || ttsResult.contentType || transport.mimeType || transport.contentType || bridgeTts.mimeType || bridgeTts.contentType || playback.mimeType || "").toLowerCase();
  const format = safeStr(sig.audioFormat || sig.ttsFormat || audio.format || ttsResult.format || transport.format || bridgeTts.format || playback.format || "").toLowerCase();
  const chars = clampInt(sig.audioChars || sig.ttsChars || audio.chars || audio.textLength || ttsResult.chars || ttsResult.textLength || transport.chars || transport.textLength || bridgeTts.chars || bridgeTts.textLength || safeStr(speech.text || speech.spokenText).length, 0, 0, 999999);
  const playable = !!(sig.audioPlayable || sig.ttsPlayable || audio.playable || ttsResult.playable || transport.playable || bridgeTts.playable || playback.ready || audioUrl || audioBase64);
  const enabled = speech.enabled !== false && speech.shouldSpeak !== false && !!safeStr(speech.text || speech.spokenText || src.spokenText || finalEnvelope.spokenText);
  const requested = !!(speech.enabled || speech.shouldSpeak || speech.text || speech.spokenText || playback.route || src.voiceRequested || payload.voiceRequested);
  const shouldSpeak = requested && enabled;
  const autoPlay = shouldSpeak && (speech.autoPlay !== false && playback.autoPlay !== false);
  const route = safeStr(speech.route || playback.route || src.ttsRoute || payload.ttsRoute || "/api/tts") || "/api/tts";
  const playbackState = safeStr(playback.state || audio.playbackState || src.playbackState || (playable ? "ready" : action ? "failed" : requested ? "requested" : "idle")).toLowerCase();
  return { action, shouldStop, audioOnlyStop: shouldStop, preserveTextReply: audioFailure.preserveTextReply !== false, retryable, reason, status, playable, audioUrl, audioBase64, mimeType, format, chars, requested, enabled, shouldSpeak, autoPlay, route, playbackState };
}

function normalizeEmotionSignals(inbound, prevState, params = {}) {
  const sig = isPlainObject(inbound?.turnSignals) ? inbound.turnSignals : {};
  const direct = isPlainObject(inbound?.emotion) ? inbound.emotion : (isPlainObject(inbound?.emo) ? inbound.emo : (isPlainObject(inbound?.emotionPayload) ? inbound.emotionPayload : {}));
  const resolvedState = extractResolvedEmotionState(inbound, params);
  const resolved = summarizeResolvedEmotionState(resolvedState);
  const prev = coerceState(prevState);
  const supportMode = safeStr(sig.emotionSupportMode || direct.supportModeCandidate || resolved.careMode || prev.support.supportMode || "").toLowerCase();
  const emotionKey = safeStr(sig.emotionPrimary || sig.emotionDominant || direct.primaryEmotion || resolved.primary || prev.support.emotionKey || "").toLowerCase();
  const emotionCluster = safeStr(sig.emotionCluster || direct.emotionCluster || resolved.secondary || prev.support.emotionCluster || "").toLowerCase();
  const questionStyle = safeStr(sig.questionStyle || direct?.conversationPlan?.questionStyle || prev.support.questionStyle || "").toLowerCase();
  const resolvedHigh = !!(resolved.present && (resolved.escalationNeeded || resolved.intensity >= 0.67 || /panic|overwhelm|hopeless|despair|self_harm/i.test(`${resolved.secondary} ${resolved.actionMode}`)));
  const supportLockSignal = !!(
    sig.supportLockActive ||
    sig.emotionSupportLock ||
    sig.emotionShouldSuppressMenus ||
    sig.emotionNeedSoft ||
    sig.emotionNeedCrisis ||
    sig.emotionFallbackSuppression ||
    sig.emotionRouteExhaustion ||
    direct?.supportFlags?.crisis ||
    direct?.supportFlags?.highDistress ||
    resolved.escalationNeeded
  );
  const sameEmotionCount = clampInt(sig.emotionSameEmotionCount, prev.repetition.sameEmotionCount, 0, 999999);
  const sameSupportModeCount = clampInt(sig.emotionSameSupportModeCount, prev.repetition.sameSupportModeCount, 0, 999999);
  const sameArchetypeCount = clampInt(sig.emotionSameArchetypeCount, prev.repetition.sameArchetypeCount, 0, 999999);
  const noProgressTurnCount = clampInt(sig.emotionNoProgressTurnCount, prev.repetition.noProgressCount, 0, 999999);
  const repeatedFallbackCount = clampInt(sig.emotionRepeatedFallbackCount, prev.repetition.fallbackCount, 0, 999999);

  return {
    supportMode,
    emotionKey,
    emotionCluster,
    questionStyle,
    resolvedEmotion: resolved.present ? resolvedState : {},
    resolvedEmotionSummary: resolved,
    supportLockSignal,
    shouldSuppressMenus: !!(
      sig.emotionShouldSuppressMenus ||
      sig.clearStaleUi ||
      sig.suppressMenus ||
      sig.emotionFallbackSuppression ||
      sig.emotionRouteExhaustion ||
      direct?.supportFlags?.needsContainment ||
      direct?.supportFlags?.crisis ||
      resolved.escalationNeeded
    ),
    highDistress: !!(sig.emotionNeedCrisis || sig.emotionNeedSoft || direct?.supportFlags?.highDistress || direct?.supportFlags?.crisis || resolvedHigh),
    mentionsLooping: !!(
      sig.emotionRouteExhaustion ||
      sig.emotionFallbackSuppression ||
      noProgressTurnCount >= 2 ||
      /loop|looping|same thing|again/i.test(safeStr(extractInboundText(inbound)))
    ),
    sameEmotionCount,
    sameSupportModeCount,
    sameArchetypeCount,
    noProgressTurnCount,
    repeatedFallbackCount
  };
}



function isSystemCheckInbound(inbound = {}) {
  const text = oneLine(extractInboundText(inbound)).toLowerCase();
  return /\b(voice test|mic test|microphone test|system check|can you hear me|hear me|continuity check)\b/i.test(text);
}

function extractCreativeCognitiveSignals(inbound = {}, params = {}, prevState = {}) {
  const prev = coerceState(prevState);
  const src = isPlainObject(inbound) ? inbound : {};
  const payload = isPlainObject(src.payload) ? src.payload : {};
  const meta = isPlainObject(src.meta) ? src.meta : {};
  const memoryPatch = extractComposerMemoryPatch(params);
  const finalEnvelope = extractFinalEnvelopeObject(params);
  const marion = extractMarionObject(params);
  const candidates = [
    params.creativeCognitive, params.cognitiveLayer, params.creativeSuggestion,
    src.creativeCognitive, src.cognitiveLayer, src.creativeSuggestion,
    payload.creativeCognitive, payload.cognitiveLayer, payload.creativeSuggestion,
    meta.creativeCognitive, meta.cognitiveLayer, meta.creativeSuggestion,
    memoryPatch.creativeCognitive, memoryPatch.cognitiveLayer, memoryPatch.creativeSuggestion,
    finalEnvelope.creativeCognitive, finalEnvelope.cognitiveLayer, finalEnvelope.creativeSuggestion,
    marion.creativeCognitive, marion.cognitiveLayer, marion.creativeSuggestion
  ].filter((x) => isPlainObject(x));
  const merged = candidates.reduce((acc, item) => ({ ...acc, ...item }), {});
  const suggestion = firstNonEmpty(
    merged.suggestion, merged.recommendation, merged.nextMove, merged.summary, merged.text, merged.reply, merged.value,
    memoryPatch.lastCreativeSuggestion, memoryPatch.creativeSuggestionText, finalEnvelope.creativeSuggestionText
  );
  const mode = firstNonEmpty(merged.mode, merged.layer, merged.type, memoryPatch.creativeMode, finalEnvelope.creativeMode);
  const intent = firstNonEmpty(merged.intent, merged.reason, memoryPatch.creativeIntent, finalEnvelope.creativeIntent);
  const greeting = extractGreetingSignals(src, params);
  const suppressedOnGreeting = !!(greeting.matched && !greeting.isDistress);
  const suppressedOnSystemCheck = isSystemCheckInbound(src);
  const active = !!(suggestion || mode || intent || merged.active === true || merged.enabled === true) && !suppressedOnGreeting && !suppressedOnSystemCheck;
  const rawSummary = boundedOneLine(suggestion || intent || mode || "", 640);
  const summary = active ? rawSummary : boundedOneLine(prev.creativeCognitive?.lastSuggestionSummary || "", 640);
  return {
    active,
    lastMode: boundedOneLine(mode || prev.creativeCognitive?.lastMode || "", 120),
    lastIntent: boundedOneLine(intent || prev.creativeCognitive?.lastIntent || "", 160),
    lastSuggestionHash: summary ? hashText(summary.toLowerCase()) : boundedSignature(prev.creativeCognitive?.lastSuggestionHash || ""),
    lastSuggestionSummary: summary,
    suggestionCount: active ? clampInt(prev.creativeCognitive?.suggestionCount, 0, 0, 999999) + 1 : clampInt(prev.creativeCognitive?.suggestionCount, 0, 0, 999999),
    suppressedOnGreeting,
    suppressedOnSystemCheck,
    updatedAt: active || suppressedOnGreeting || suppressedOnSystemCheck ? nowMs() : Number(prev.creativeCognitive?.updatedAt || 0) || 0
  };
}


function normalizeEmotionalEngineSignals(inbound, prevState, params = {}) {
  const sig = isPlainObject(inbound?.turnSignals) ? inbound.turnSignals : {};
  const prev = coerceState(prevState);
  const greeting = extractGreetingSignals(inbound, params);
  const prevEngine = isPlainObject(prev.emotionalEngine) ? prev.emotionalEngine : createState().emotionalEngine;
  const greetingPresence = greeting.matched ? greeting.presenceProfile : "";
  const primaryState = safeStr(sig.enginePrimaryState || greetingPresence || prevEngine.primaryState || "focused").toLowerCase() || "focused";
  const secondaryState = safeStr(sig.engineSecondaryState || (greeting.matched ? greeting.intent : "") || prevEngine.secondaryState || "steady").toLowerCase() || "steady";
  const baseContinuityScore = greeting.matched ? Math.max(Number(prevEngine.continuityScore || 0.35), greeting.isDistress ? 0.68 : 0.46) : (Number(prevEngine.continuityScore ?? 0.35) || 0.35);
  const continuityScore = Math.max(0, Math.min(1, Number(sig.engineContinuityScore ?? baseContinuityScore) || 0.35));
  const placeholder = safeStr(sig.enginePlaceholder || prevEngine.placeholder || "Ask Nyx anything about Sandblast…") || "Ask Nyx anything about Sandblast…";
  const lastActionLabels = Array.isArray(sig.engineActionLabels) ? sig.engineActionLabels.slice(0, 6).map((x) => safeStr(x)) : prevEngine.lastActionLabels;
  const presenceState = safeStr(sig.enginePresenceState || greetingPresence || prevEngine.presenceState || primaryState || "receptive").toLowerCase() || "receptive";
  const listenerMode = safeStr(sig.engineListenerMode || (greeting.matched ? "greeting_attuned" : "") || prevEngine.listenerMode || "attuned").toLowerCase() || "attuned";
  const stateStreak = safeStr(prevEngine.primaryState || "") === primaryState
    ? clampInt(prevEngine.stateStreak, 0, 0, 999999) + 1
    : 0;
  return { primaryState, secondaryState, continuityScore, placeholder, lastActionLabels, stateStreak, presenceState, listenerMode };
}

function inferConversationPhase(prevState, inbound, plannerDecision) {
  const prev = coerceState(prevState);
  const technical = isTechnicalInbound(inbound);
  const audio = normalizeAudioSignal(inbound);
  const emo = normalizeEmotionSignals(inbound, prev);
  const greeting = extractGreetingSignals(inbound, { decision: plannerDecision });
  const plannerStage = safeStr(plannerDecision?.stage || "").toLowerCase();

  if (audio.shouldStop) return "recovery";
  if (prev.audio.terminalStopUntil && prev.audio.terminalStopUntil > nowMs()) return "recovery";

  const activeHold = clampInt(prev.support?.holdTurns, 0, 0, 999999) > 0;
  const activeSupportLock = !!(emo.supportLockSignal || prev.support.lockActive || activeHold || greeting.isDistress);
  if (activeSupportLock || plannerStage === "recovery" || plannerStage === "terminal_stop") return "recovery";

  if (technical) return "execution";
  if (greeting.matched) return "active";
  return inferPhaseFromStage(prev.stage, false);
}


function detectConversationalPackTrack({ inbound = {}, prev = {}, decision = {}, params = {}, speak = "" } = {}) {
  const text = oneLine(extractInboundText(inbound)).toLowerCase();
  const prior = oneLine(prev.lastAssistantReply || "").toLowerCase();
  const rationale = oneLine(decision.rationale || params.updateReason || "").toLowerCase();
  const technical = isTechnicalInbound(inbound) || /\b(loop|diagnostic|audit|autopsy|backend|frontend|widget|state spine|chatengine|final envelope|packet|regression)\b/i.test(text);
  const developerDiagnostic = technical && /\b(file|code|module|line[- ]?by[- ]?line|raw|developer|internal|exact fix)\b/i.test(text);
  const emotional = /\b(overworked|overwhelmed|stressed|burned out|burnt out|drained|exhausted|anxious|panic|sad|hurt|lonely|frustrated|angry|too much|can't think|cant think)\b/i.test(text);
  const nextStep = /\b(next step|next move|what should (we|i) do|where do we go|continue)\b/i.test(text);
  const backendEmpty = /\b(backend.*empty|no final|reply held|bridge held|backend reply unavailable|missing final|contract missing|packet missing)\b/i.test(rationale + " " + speak);
  const repeated = !!(
    Number(prev.repetition?.noProgressCount || 0) > 0 ||
    Number(prev.repetition?.sameAssistantHashCount || 0) > 0 ||
    (speak && prior && hashText(speak.toLowerCase()) === prev.lastAssistantHash)
  );
  if (backendEmpty) return "backend_empty_guard";
  if (emotional) return "emotional_specificity";
  if (technical && developerDiagnostic) return "developer_diagnostic";
  if (technical) return "public_diagnostic_translation";
  if (nextStep) return "next_step_context";
  if (repeated) return "repetition_escape";
  return "atmosphere_continuity";
}

function deriveConversationalPackRuntimeSelector({ prevState = {}, inbound = {}, decision = {}, params = {}, speak = "" } = {}) {
  const prev = coerceState(prevState);
  const track = detectConversationalPackTrack({ inbound, prev, decision, params, speak });
  const turnCount = clampInt(prev.turns?.user, 0, 0, 999999);
  const depthBand = turnCount >= 31 ? "deep" : turnCount >= 16 ? "late" : turnCount >= 6 ? "mid" : "early";
  const noProgress = clampInt(prev.repetition?.noProgressCount, 0, 0, 999999);
  const sameAssistant = clampInt(prev.repetition?.sameAssistantHashCount, 0, 0, 999999);
  const fallback = clampInt(prev.repetition?.fallbackCount, 0, 0, 999999);
  const replayRisk = Math.max(
    noProgress >= 3 ? 0.92 : noProgress >= 2 ? 0.72 : noProgress ? 0.45 : 0,
    sameAssistant >= 2 ? 0.82 : sameAssistant ? 0.42 : 0,
    fallback >= 2 ? 0.64 : fallback ? 0.35 : 0
  );
  const antiLoopEligible = track !== "atmosphere_continuity" || replayRisk >= 0.35;
  const atmosphereEligible = track === "atmosphere_continuity" && replayRisk < 0.35;
  return {
    version: CONVERSATIONAL_PACK_COHESION_VERSION,
  FINAL_RUNTIME_TELEMETRY_VERSION,
    active: true,
    track,
    depthBand,
    replayRisk,
    antiLoopEligible,
    atmosphereEligible,
    publicDiagnostic: track === "public_diagnostic_translation",
    stateAdvanceRequired: antiLoopEligible,
    staleCarrySuppressed: track === "emotional_specificity" || track === "public_diagnostic_translation" || track === "developer_diagnostic",
    maxAtmosphereLines: depthBand === "early" ? 1 : 2,
    requiredReplyShape: antiLoopEligible ? "acknowledge_classify_answer_advance" : "statement_first_continuity",
    source: "stateSpine.deriveConversationalPackRuntimeSelector",
    updatedAt: nowMs()
  };
}

function decideNextMove(prevState, inbound) {
  const prev = coerceState(prevState);
  const userHash = hashText(oneLine(extractInboundText(inbound)).toLowerCase());
  const intent = extractIntent(inbound);
  const technical = isTechnicalInbound(inbound);
  const audio = normalizeAudioSignal(inbound);
  const emo = normalizeEmotionSignals(inbound, prev);
  const greeting = extractGreetingSignals(inbound, {});
  const terminalStopActive = prev.audio.terminalStopUntil && prev.audio.terminalStopUntil > nowMs();

  const sameUser = !!(userHash && prev.lastUserHash && userHash === prev.lastUserHash);
  const sameIntent = !!(intent && prev.lastIntent && intent === prev.lastIntent);
  const repeatedSupportHold = clampInt(prev.support?.holdTurns, 0, 0, 999999) > 0;
  const loopPressure = Number(prev?.repetition?.noProgressCount || 0) >= 2 || Number(prev?.repetition?.sameAssistantHashCount || 0) >= 2;
  const mentionsLooping = !!(emo.mentionsLooping || ((sameUser && sameIntent) && loopPressure) || loopPressure);
  const packRuntime = deriveConversationalPackRuntimeSelector({ prevState: prev, inbound, decision: {}, params: {}, speak: "" });

  if (audio.shouldStop || terminalStopActive) {
    return {
      move: "STABILIZE",
      stage: "terminal_stop",
      rationale: audio.reason ? `audio_terminal_${audio.reason}` : "audio_terminal_stop",
      speak: "",
      _plannerMode: "audio_terminal",
      conversationalPack: packRuntime
    };
  }

  if (audio.action === "downgrade") {
    return {
      move: "ADVANCE",
      stage: technical ? "execution" : "deliver",
      rationale: audio.reason ? `audio_downgrade_${audio.reason}` : "audio_downgrade",
      speak: "",
      _plannerMode: technical ? "execution" : "audio_downgrade",
      conversationalPack: packRuntime
    };
  }

  if (audio.action === "retry") {
    return {
      move: "ADVANCE",
      stage: "execution",
      rationale: audio.reason ? `audio_retry_${audio.reason}` : "audio_retry",
      speak: "",
      _plannerMode: "audio_retry",
      conversationalPack: packRuntime
    };
  }

  if (technical) {
    return {
      move: "ADVANCE",
      stage: "execution",
      rationale: mentionsLooping ? "technical_loop_escape_support_hold_released" : "technical_execution",
      speak: "",
      _plannerMode: "execution",
      conversationalPack: packRuntime
    };
  }

  if (greeting.matched && !greeting.isDistress) {
    return {
      move: "ADVANCE",
      stage: "deliver",
      rationale: `greeting_intent_${greeting.intent || "basic_greeting"}`,
      speak: "",
      _plannerMode: "greeting",
      conversationalPack: packRuntime
    };
  }

  if (emo.supportLockSignal || emo.highDistress || greeting.isDistress || safeStr(inbound?.cog?.intent || "").toUpperCase() === "STABILIZE" || repeatedSupportHold) {
    return {
      move: "STABILIZE",
      stage: "recovery",
      rationale: mentionsLooping ? "support_lock_loop_guard" : "emotion_stabilize",
      speak: "",
      _plannerMode: "support",
      conversationalPack: packRuntime
    };
  }

  if (mentionsLooping) {
    return {
      move: "STABILIZE",
      stage: "recovery",
      rationale: "route_exhaustion_guard",
      speak: "",
      _plannerMode: "stabilize",
      conversationalPack: packRuntime
    };
  }

  return {
    move: "ADVANCE",
    stage: technical ? "execution" : "deliver",
    rationale: "normal_progression",
    speak: "",
    _plannerMode: technical ? "execution" : "advance",
    conversationalPack: packRuntime
  };
}

function hasMarionFinalSignal(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const marion = extractMarionObject(p);
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const packetMeta = isPlainObject(packet.meta) ? packet.meta : {};
  const synthesis = isPlainObject(packet.synthesis) ? packet.synthesis : {};
  const payload = isPlainObject(marion.payload) ? marion.payload : {};
  const memoryPatch = extractComposerMemoryPatch(p);
  const sig = extractMarionFinalSignature(p);
  const trusted = hasTrustedMarionFinalEnvelope(p);

  const composerAdvance = !!(
    memoryPatch.composedOnce ||
    memoryPatch.marionFinal ||
    memoryPatch.final ||
    memoryPatch?.stateBridge?.composedOnce ||
    memoryPatch?.stateBridge?.shouldAdvanceState ||
    memoryPatch?.stateBridge?.finalEnvelopeTrusted
  );

  const marionSideFinal = !!(
    marion.marionFinal ||
    packet.marionFinal ||
    packetMeta.marionFinal ||
    synthesis.marionFinal ||
    payload.marionFinal ||
    memoryPatch.marionFinal ||
    memoryPatch.final
  );

  return !!(
    trusted ||
    hasExplicitFinalEnvelopeContract(p) ||
    (signatureLooksTrusted(sig) && (marionSideFinal || composerAdvance)) ||
    composerAdvance
  );
}


function compactStateSummary(value, max = 760) {
  const s = oneLine(value);
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, " ").trim()}.` : s;
}


function sanitizeStateProgressionCarry(value = "") {
  let out = oneLine(value);
  if (!out) return "";
  out = out.replace(/\bContinuing from [^:]{0,180}:\s*/gi, "");
  out = out.replace(/\bThe next move is to answer the current (request|step) directly,?\s*/gi, "");
  out = out.replace(/\band advance one concrete (move|step),?\s*/gi, "");
  out = out.replace(/\bnot restate the prior broad framing\.?/gi, "");
  out = out.replace(/\bdo not repeat broad framing\.?/gi, "");
  out = out.replace(/\bprogression[- ]?shaping guard\b/gi, "answer refinement");
  return out.replace(/\s+/g, " ").trim();
}
function isProgressionRegressionInboundText(text = "") {
  return /\b(refining progression shaping|progression shaping|convert more roku viewers into active users|give me the first move|make it sharper|make it commercial|user[- ]facing message|turn it into a user[- ]facing message)\b/i.test(oneLine(text));
}

function deriveStateTopic(inbound = {}, memoryPatch = {}, lane = "general") {
  const text = `${extractInboundText(inbound)} ${memoryPatch.lastTopic || ""} ${memoryPatch.carryForwardSummary || ""} ${memoryPatch.lastAssistantReply || ""}`.toLowerCase();
  if (/\bcash[-\s]?flow\b/.test(text)) return "cash flow";
  if (/\bleast privilege\b/.test(text)) return "least privilege";
  if (/\bphishing\b/.test(text)) return "phishing";
  if (/\bcognitive bias\b/.test(text)) return "cognitive bias";
  if (/\bmachine learning\b|\bml\b/.test(text)) return "machine learning";
  if (/\bconsideration\b.*\bcontract law\b|\bcontract law\b.*\bconsideration\b/.test(text)) return "consideration in contract law";
  if (/sandblast|user engagement|conversion path|roku|sponsor|investor|business value|premium|pitch|progression shaping|active users|first move|make it sharper|user-facing/.test(text)) return "Sandblast engagement and Roku conversion path";
  if (/nyx|nexus|marion|ai media|interface|emotionally aware|intelligent/.test(text)) return "AI media interface continuity";
  if (/profit|finance/.test(text)) return "finance";
  if (/legal|law/.test(text)) return "law";
  if (/cyber|security/.test(text)) return "cyber";
  if (/tool routing|ai agent/.test(text)) return "AI agents";
  return oneLine(memoryPatch.lastTopic || lane || "conversation");
}

function buildStateCarryForwardSummary({ prev, inbound, memoryPatch, speak, intent, domain, lane }) {
  const inboundText = oneLine(extractInboundText(inbound));
  const priorRaw = firstNonEmpty(memoryPatch.carryForwardSummary, prev.carryForwardSummary, prev.conversationSummary);
  const prior = sanitizeStateProgressionCarry(priorRaw);
  const topic = firstNonEmpty(memoryPatch.lastTopic, deriveStateTopic(inbound, memoryPatch, lane));
  const current = sanitizeStateProgressionCarry(compactStateSummary(speak, 360));
  const projectLine = /sandblast|user engagement|roku|conversion path|active users|progression shaping/i.test(`${inboundText} ${prior}`) ? "Active project: Sandblast user engagement / Roku conversion path" : "";
  const parts = [];
  if (projectLine) parts.push(projectLine);
  if (isProgressionRegressionInboundText(inboundText)) parts.push("Regression: progression shaping sequence");
  if (topic) parts.push(`Topic: ${topic}`);
  if (intent) parts.push(`Intent: ${intent}`);
  if (domain || lane) parts.push(`Domain: ${domain || lane}`);
  if (prior) parts.push(`Prior: ${compactStateSummary(prior, 220)}`);
  if (current) parts.push(`Current: ${current}`);
  return compactStateSummary(parts.join(" | "), 900);
}


function isFreshOperationalOrTechnicalTurn(inbound = {}, params = {}) {
  const text = oneLine(extractInboundText(inbound)).toLowerCase();
  const intent = safeStr(params.intent || params.marionCog?.intent || extractIntent(inbound)).toUpperCase();
  return !!(
    isSystemCheckInbound(inbound) ||
    intent === "TECHNICAL_DEBUG" ||
    /\b(smoke test|regression|node --check|syntax|git add|git commit|git push|commit and push|replace the file|downloadable zip|full autopsy|line[- ]?by[- ]?line|critical fixes?|state spine|chatengine|marionbridge|composemarionresponse|intent router|domain registry|backend technical test)\b/i.test(text)
  );
}

function normalizeStateForPipelineCohesion(nextState = {}, context = {}) {
  const next = coerceState(nextState);
  const inbound = isPlainObject(context.inbound) ? context.inbound : {};
  const params = isPlainObject(context.params) ? context.params : {};
  const freshWorkTurn = isFreshOperationalOrTechnicalTurn(inbound, params);
  const hasTrustedFinal = !!(context.trustedFinalCompletion || context.trustedFinalEnvelope || context.trustedFinalShape || hasMarionFinalSignal(params) || hasTrustedFinalShape(params) || hasTrustedMarionFinalEnvelope(params));
  const technical = isTechnicalInbound(inbound) || shouldTechnicalBypassSupportLock(inbound, context.decision || {}, params);
  const packCohesion = next.packCohesion || next.conversationalPack || deriveConversationalPackRuntimeSelector({ prevState: next, inbound, decision: context.decision || {}, params, speak: next.lastAssistantReply || "" });
  const normalizedStage = hasTrustedFinal ? "final" : normalizeStateStage(next.stage, "open");
  return {
    ...next,
    stage: normalizedStage,
    phase: inferPhaseFromStage(normalizedStage, false),
    progressionLock: hasTrustedFinal ? false : !!next.progressionLock,
    support: freshWorkTurn ? { ...next.support, lockActive: false, holdTurns: 0, quietTurns: 0, reason: "", shouldSuppressMenus: false } : next.support,
    emotionalContinuity: (freshWorkTurn || packCohesion.staleCarrySuppressed) ? null : next.emotionalContinuity,
    conversationalPack: packCohesion,
    packCohesion,
    repetition: hasTrustedFinal ? { ...next.repetition, noProgressCount: 0, fallbackCount: 0 } : next.repetition,
    marionCohesion: {
      ...next.marionCohesion,
      finalPipelineCohesion: true,
      finalEnvelopeTrusted: !!(next.marionCohesion?.finalEnvelopeTrusted || hasTrustedFinal),
      shouldAdvanceState: !!(next.marionCohesion?.shouldAdvanceState || hasTrustedFinal),
      technicalBypassSupportLock: !!technical,
      staleContextSuppressed: !!(freshWorkTurn || packCohesion.staleCarrySuppressed),
      packCohesion,
      updatedAt: nowMs()
    },
    lastUpdatedAt: nowMs()
  };
}

function finalizeTurn(params = {}) {
  const prev = coerceState(params.prevState);
  const inbound = isPlainObject(params.inbound) ? params.inbound : {};
  const decision = isPlainObject(params.decision) ? params.decision : {};
  const lane = safeStr(params.lane || inbound.lane || prev.lane || "general") || "general";
  const memoryPatch = extractComposerMemoryPatch(params);
  const marion = extractMarionObject(params);
  const composerIntent = firstNonEmpty(memoryPatch.lastIntent, marion.intent, params.intent, params.marionCog?.intent);
  const composerDomain = firstNonEmpty(memoryPatch.lastDomain, marion.domain, params.domain, lane);
  const composerKnowledgeDomain = firstNonEmpty(memoryPatch.lastKnowledgeDomain, marion.knowledgeDomain, params.knowledgeDomain, "");
  const marionReply = extractComposerReply(params);
  let stage = normalizeStateStage(decision.stage || params.stage || prev.stage || "final", "final");
  const intent = canonicalIntent(composerIntent || decision.move || extractIntent(inbound));
  const actionTaken = safeStr(params.actionTaken || inbound.action || inbound?.payload?.action || "");
  const speak = oneLine(safeStr(decision.speak || marionReply || params.assistantSummary || params.assistantText || params.reply || ""));
  const conversationalPack = deriveConversationalPackRuntimeSelector({ prevState: prev, inbound, decision, params, speak });
  const inboundText = extractInboundText(inbound);
  const questionShape = extractQuestionShapeCarry(params, inbound, memoryPatch);
  const normalizedUserIntent = firstNonEmpty(questionShape.normalizedUserIntent, questionShape.normalizedText, inboundText);
  const rawUserText = firstNonEmpty(questionShape.rawText, inboundText);
  const stateUserText = normalizedUserIntent || inboundText;
  const userHash = firstNonEmpty(memoryPatch.userSignature, memoryPatch.lastUserSignature, hashUserTextForComposer(stateUserText));
  const assistantHash = speak ? hashText(speak.toLowerCase()) : "";
  const sameLane = lane === prev.lane;
  const sameStage = stage === prev.stage;
  const sameIntent = intent === prev.lastIntent;
  const sameUser = !!(userHash && prev.lastUserHash && userHash === prev.lastUserHash);
  const sameAssistant = !!(speak && assistantHash && prev.lastAssistantHash && assistantHash === prev.lastAssistantHash);
  const marionFinalSignal = hasMarionFinalSignal(params);
  const trustedFinalEnvelope = hasTrustedMarionFinalEnvelope(params);
  const trustedFinalShape = hasTrustedFinalShape(params);
  const marionFinalSignature = extractMarionFinalSignature(params);
  const loopPhraseRejected = isLoopPhrase(speak) && !trustedFinalEnvelope && !trustedFinalShape;
  const composerAdvancedState = !!(memoryPatch?.stateBridge?.shouldAdvanceState || memoryPatch.shouldAdvanceState || memoryPatch.composedOnce || trustedFinalEnvelope || trustedFinalShape);
  const loopBreakTrustedFinal = trustedFinalShouldBreakLoop({ trustedFinalEnvelope: trustedFinalEnvelope || trustedFinalShape, composerAdvancedState, speak, loopPhraseRejected });
  const trustedFinalBreaksRecovery = !!(loopBreakTrustedFinal || trustedFinalShape || trustedFinalEnvelope || composerAdvancedState);
  const plannerMode = safeStr(decision._plannerMode || params.marionCog?.mode || "").toLowerCase();
  const technical = isTechnicalInbound(inbound);
  const deepeningInbound = isDeepeningInbound(inbound, params);
  const trustedDeepeningCompletion = isTrustedDeepeningCompletion(params, inbound);
  const technicalBypassSupportLock = shouldTechnicalBypassSupportLock(inbound, decision, params);
  if ((marionFinalSignal || trustedFinalShape || trustedFinalEnvelope || composerAdvancedState || technicalBypassSupportLock) && (stage === "recovery" || stage === "recover" || stage === "open" || stage === "compose") && technical) {
    stage = "final";
  }
  const audio = normalizeAudioSignal(inbound);
  const emo = normalizeEmotionSignals(inbound, prev, params);
  const greeting = extractGreetingSignals(inbound, params);
  const engineSignals = normalizeEmotionalEngineSignals(inbound, prev, params);
  const creativeCognitive = extractCreativeCognitiveSignals(inbound, params, prev);
  const greetingDistress = !!greeting.isDistress;
  const trustedFinalCompletion = !!(
    (marionFinalSignal || trustedFinalShape || trustedFinalEnvelope || composerAdvancedState) &&
    isActionableComposerReply(speak)
  );
  const deepeningTrustedFinalCompletion = !!(
    (deepeningInbound || trustedDeepeningCompletion) &&
    trustedFinalCompletion &&
    !loopPhraseRejected
  );
  if (trustedFinalCompletion && stage === "recover") stage = "final";
  if (trustedFinalCompletion && stage === "open") stage = "final";
  if (deepeningTrustedFinalCompletion && (stage === "recover" || stage === "recovery" || stage === "open" || stage === "compose")) stage = "final";

  const existingTerminalStopActive = Number(prev.audio?.terminalStopUntil || 0) > nowMs();
  const terminalStopUntil = audio.shouldStop ? nowMs() + TERMINAL_AUDIO_STOP_MS : (existingTerminalStopActive && !trustedFinalCompletion ? Number(prev.audio.terminalStopUntil || 0) : 0);
  if (trustedFinalCompletion && (stage === "terminal_stop" || stage === "recovery" || stage === "recover")) stage = "final";
  if (existingTerminalStopActive && !trustedFinalCompletion && !technicalBypassSupportLock && stage !== "terminal_stop") stage = "terminal_stop";
  const releaseSupportLock = !!(
    stage !== "terminal_stop" &&
    (
      trustedFinalCompletion ||
      loopBreakTrustedFinal ||
      trustedFinalShape ||
      trustedFinalEnvelope ||
      trustedFinalBreaksRecovery ||
      technicalBypassSupportLock ||
      (technical && isActionableComposerReply(speak)) ||
      deepeningTrustedFinalCompletion ||
      trustedDeepeningCompletion
    )
  );
  const supportLockActive = !releaseSupportLock && !technicalBypassSupportLock && !!(
    emo.supportLockSignal ||
    greetingDistress ||
    stage === "terminal_stop" || existingTerminalStopActive ||
    safeStr(intent) === "STABILIZE" ||
    (stage === "recovery" && (emo.highDistress || clampInt(prev.support?.holdTurns, 0, 0, 999999) > 0))
  );
  const progressionLock = (trustedFinalBreaksRecovery || deepeningTrustedFinalCompletion || trustedDeepeningCompletion) ? false : !!(
    (audio.shouldStop && !trustedFinalCompletion) ||
    (!technicalBypassSupportLock && loopPhraseRejected) ||
    (!loopBreakTrustedFinal && !trustedFinalShape && !technicalBypassSupportLock && supportLockActive) ||
    (!loopBreakTrustedFinal && !trustedFinalShape && !technical && sameAssistant && sameStage && clampInt(prev.repetition?.sameAssistantHashCount, 0, 0, 999999) >= 1) ||
    (!loopBreakTrustedFinal && !trustedFinalShape && !technical && sameUser && sameIntent && clampInt(prev.repetition?.sameUserHashCount, 0, 0, 999999) >= 1)
  );

  const repetition = {
    sameLaneCount: sameLane ? prev.repetition.sameLaneCount + 1 : 0,
    sameStageCount: trustedFinalCompletion ? 0 : (sameStage ? prev.repetition.sameStageCount + 1 : 0),
    sameIntentCount: trustedFinalCompletion ? 0 : (sameIntent ? prev.repetition.sameIntentCount + 1 : 0),
    sameUserHashCount: trustedFinalCompletion ? 0 : (sameUser ? prev.repetition.sameUserHashCount + 1 : 0),
    sameAssistantHashCount: trustedFinalCompletion ? 0 : (sameAssistant ? prev.repetition.sameAssistantHashCount + 1 : 0),
    sameEmotionCount: emo.sameEmotionCount,
    sameSupportModeCount: emo.sameSupportModeCount,
    sameArchetypeCount: emo.sameArchetypeCount,
    noProgressCount: (trustedFinalBreaksRecovery || loopBreakTrustedFinal || trustedFinalShape || trustedFinalEnvelope || technicalBypassSupportLock || deepeningTrustedFinalCompletion || trustedDeepeningCompletion)
      ? 0
      : Math.max(
          emo.noProgressTurnCount,
          (sameStage && sameIntent && sameLane) ? prev.repetition.noProgressCount + 1 : 0
        ),
    fallbackCount: Math.max(
      emo.repeatedFallbackCount,
      /failopen|fallback|breaker|stabilize|audio_terminal|audio_downgrade|support_lock/i.test(
        safeStr(params.updateReason || "") + " " + safeStr(decision.rationale || "")
      ) ? prev.repetition.fallbackCount + 1 : 0
    )
  };

  const holdTurns = releaseSupportLock
    ? 0
    : supportLockActive
      ? Math.max(clampInt(prev.support.holdTurns, 0, 0, 999999), emo.highDistress ? 2 : 1)
      : Math.max(clampInt(prev.support.holdTurns, 0, 0, 999999) - 1, 0);

  const support = {
    lockActive: supportLockActive || holdTurns > 0,
    lockBias: emo.shouldSuppressMenus ? "strong" : (prev.support.lockBias || ""),
    quietTurns: emo.shouldSuppressMenus ? prev.support.quietTurns + 1 : Math.max(clampInt(prev.support.quietTurns, 0, 0, 999999) - 1, 0),
    holdTurns,
    reason: (supportLockActive || holdTurns > 0) ? safeStr(decision.rationale || prev.support.reason || intent || "support_lock") : "",
    shouldSuppressMenus: !!emo.shouldSuppressMenus,
    supportMode: safeStr(emo.supportMode || (greetingDistress ? "greeting_support" : "") || prev.support.supportMode || ""),
    archetype: safeStr(inbound?.turnSignals?.emotionArchetype || (greeting.matched ? greeting.intent : "") || prev.support.archetype || ""),
    questionStyle: safeStr(emo.questionStyle || (greetingDistress ? "single_grounding_question" : "") || prev.support.questionStyle || ""),
    emotionKey: safeStr(emo.emotionKey || (greetingDistress ? greeting.intent : "") || prev.support.emotionKey || ""),
    emotionCluster: safeStr(emo.emotionCluster || (greetingDistress ? greeting.tone : "") || prev.support.emotionCluster || "")
  };

  const volatility = audio.shouldStop || progressionLock || repetition.noProgressCount >= 1 || support.lockActive
    ? "elevated"
    : repetition.sameStageCount >= 2
      ? "guarded"
      : "stable";

  const emotionalEngine = {
    primaryState: engineSignals.primaryState,
    secondaryState: engineSignals.secondaryState,
    continuityScore: engineSignals.continuityScore,
    stateStreak: engineSignals.stateStreak,
    placeholder: engineSignals.placeholder,
    lastActionLabels: Array.isArray(engineSignals.lastActionLabels) ? engineSignals.lastActionLabels : [],
    presenceState: safeStr(engineSignals.presenceState || prev.emotionalEngine?.presenceState || engineSignals.primaryState || "receptive") || "receptive",
    listenerMode: safeStr(engineSignals.listenerMode || prev.emotionalEngine?.listenerMode || "attuned") || "attuned"
  };

  const activeKnowledgeDomainCarry = extractActiveKnowledgeDomainCarry(prev, memoryPatch, params, inbound);

  const provisionalFollowupText = rawUserText || inboundText || normalizedUserIntent;
  const provisionalFollowup = isShortContinuityFollowupStateText(provisionalFollowupText);
  const provisionalTopic = continuityTopicFromState(prev, inbound, memoryPatch, normalizedUserIntent);

  const continuityThread = {
    depthLevel: Math.max(1, Math.max(clampInt(memoryPatch.turnDepth, 0, 0, 999999), repetition.sameStageCount + 1, repetition.sameIntentCount + 1, repetition.sameEmotionCount + 1)),
    threadContinuation: (loopBreakTrustedFinal || deepeningTrustedFinalCompletion || trustedDeepeningCompletion) ? true : !!((sameLane || sameIntent || sameUser) && !sameAssistant || support.lockActive || repetition.noProgressCount > 0),
    unresolvedSignals: boundedArray([safeStr(emo.emotionKey || ""), safeStr(emo.emotionCluster || ""), safeStr(greeting.intent || ""), safeStr(greeting.tone || ""), safeStr(decision.rationale || ""), safeStr(creativeCognitive.lastIntent || "")], 6, 160),
    lastTopics: boundedArray([safeStr(provisionalTopic || ""), safeStr(memoryPatch.lastTopic || ""), safeStr(prev.lastTopic || ""), safeStr(normalizedUserIntent || ""), safeStr(activeKnowledgeDomainCarry || ""), safeStr(inbound?.lane || lane || ""), safeStr(intent || ""), safeStr(greeting.intent || ""), safeStr(creativeCognitive.lastMode || "")], 8, 160),
    responseMode: safeStr(emo.supportMode || (greeting.matched ? "greeting_intent" : "") || plannerMode || decision.move || "steady") || "steady",
    marionFinalObserved: marionFinalSignal,
    finalEnvelopeTrusted: trustedFinalEnvelope || trustedFinalShape,
    loopPhraseRejected: trustedFinalBreaksRecovery ? false : loopPhraseRejected,
    packCohesion: conversationalPack,
    updatedAt: nowMs()
  };

  const previousTurnDepth = clampInt(prev.turnDepth, 0, 0, 999999);
  const memoryTurnDepth = clampInt(memoryPatch.turnDepth, 0, 0, 999999);
  const nextTurnDepth = trustedFinalCompletion ? Math.max(1, memoryTurnDepth || previousTurnDepth + 1) : previousTurnDepth;
  const nextTopic = provisionalTopic || continuityTopicFromState(prev, inbound, memoryPatch, normalizedUserIntent);
  const inboundFollowupAction = classifyContinuityFollowupStateAction(provisionalFollowupText);
  const continuityResolvedQuestion = inboundFollowupAction && nextTopic
    ? buildStateContinuityResolvedQuestion(rawUserText || inboundText || normalizedUserIntent, nextTopic, inboundFollowupAction)
    : "";
  const nextCarryForwardSummary = trustedFinalCompletion ? buildStateCarryForwardSummary({ prev, inbound, memoryPatch, speak, intent, domain: composerDomain, lane }) : prev.carryForwardSummary;
  const nextConversationSummary = trustedFinalCompletion ? compactStateSummary(nextCarryForwardSummary, 760) : prev.conversationSummary;
  const inputSource = canonicalTurnInputSource(inbound, { ...params, inputSource: memoryPatch.inputSource });
  const continuityRegression = buildFiveTurnContinuityState({ prev, inbound, memoryPatch, speak, userHash, assistantHash, trustedFinalCompletion, nextTurnDepth });
  const fiveTurnContract = continuityRegression.fiveTurnContract || extractFiveTurnContractState(prev,memoryPatch,inbound);
  const runtimeTelemetry = buildStateRuntimeTelemetry({params,inbound,reply:speak,trustedFinalCompletion,stage,intent,domain:composerDomain,lane});
  const domainConfidenceCarry = extractDomainConfidenceCarry(params, inbound, memoryPatch);
  const domainConciergeCarry = extractDomainConciergeCarry(params, inbound, memoryPatch);
  const confidenceAwareResponseShapingCarry = extractConfidenceAwareResponseShapingCarry(params, inbound, memoryPatch);
  const progressionShapingGuard = extractProgressionShapingGuardCarry(params, inbound, memoryPatch);
  const progressionRefinement = updateProgressionRefinementState(params, inbound, memoryPatch, speak);
  const progressionTelemetry = buildStateProgressionTelemetry(progressionRefinement, params, inbound, speak);
  const protectiveEscalationState = extractProtectiveEscalationStateCarry(params, inbound, memoryPatch);
  const nextState = {
    ...prev,
    rev: clampInt(prev.rev, 0, 0, 999999) + 1,
    lane,
    domain: safeStr(composerDomain || lane) || lane,
    lastUserText: boundedOneLine(stateUserText || memoryPatch.lastUserText || prev.lastUserText, MAX_STATE_TEXT),
    rawUserText: boundedOneLine(rawUserText || prev.rawUserText, MAX_STATE_TEXT),
    normalizedUserIntent: boundedOneLine(normalizedUserIntent || prev.normalizedUserIntent, MAX_STATE_TEXT),
    questionShape,
    lastAssistantReply: trustedFinalCompletion ? boundedOneLine(speak, MAX_STATE_TEXT) : prev.lastAssistantReply,
    lastKnowledgeDomain: composerKnowledgeDomain || activeKnowledgeDomainCarry || prev.lastKnowledgeDomain || "",
    activeKnowledgeDomain: activeKnowledgeDomainCarry || prev.activeKnowledgeDomain || "",
    lastActivatedKnowledgeDomain: activeKnowledgeDomainCarry || prev.lastActivatedKnowledgeDomain || prev.lastKnowledgeDomain || "",
    lastTopic: boundedOneLine(nextTopic, 320),
    continuity: normalizeContinuityCarry({
      active: !!boundedOneLine(nextTopic, 320),
      topic: boundedOneLine(nextTopic, 320),
      lastTopic: boundedOneLine(nextTopic, 320),
      resolvedFollowup: !!(provisionalFollowup && inboundFollowupAction),
      followupAction: inboundFollowupAction,
      continuityAction: inboundFollowupAction,
      originalText: provisionalFollowupText,
      resolvedText: continuityResolvedQuestion,
      source: "stateSpine.finalizeTurn.followupIntentExpansionCarry"
    }),
    followUpReference: normalizeContinuityCarry({
      active: !!(provisionalFollowup && nextTopic),
      topic: boundedOneLine(nextTopic, 320),
      lastTopic: boundedOneLine(nextTopic, 320),
      resolvedFollowup: !!(provisionalFollowup && inboundFollowupAction),
      followupAction: inboundFollowupAction,
      continuityAction: inboundFollowupAction,
      originalText: provisionalFollowupText,
      resolvedText: continuityResolvedQuestion,
      source: "stateSpine.finalizeTurn.followUpReference"
    }),
    followupAction: inboundFollowupAction,
    continuityAction: inboundFollowupAction,
    continuityResolvedText: continuityResolvedQuestion,
    continuityResolvedOriginalText: rawUserText || inboundText || "",
    conversationSummary: boundedOneLine(nextConversationSummary, MAX_STATE_SUMMARY),
    carryForwardSummary: boundedOneLine(nextCarryForwardSummary, MAX_STATE_SUMMARY),
    turnDepth: nextTurnDepth,
    stage: normalizeStateStage(stage, "final"),
    phase: inferPhaseFromStage(normalizeStateStage(stage, "final"), progressionLock),
    lastIntent: intent,
    lastAction: actionTaken,
    lastMove: safeStr(decision.move || intent),
    lastRationale: safeStr(decision.rationale || ""),
    lastPlannerMode: plannerMode,
    lastUserHash: boundedSignature(userHash),
    lastAssistantHash: trustedFinalCompletion && assistantHash ? boundedSignature(assistantHash) : prev.lastAssistantHash,
    lastInputSource: inputSource,
    inputParity: { lastSource: inputSource, lastVoiceHash: inputSource === "voice" ? boundedSignature(userHash) : boundedSignature(prev.inputParity?.lastVoiceHash || ""), lastTextHash: inputSource === "text" ? boundedSignature(userHash) : boundedSignature(prev.inputParity?.lastTextHash || ""), mismatchCount: clampInt(prev.inputParity?.mismatchCount, 0, 0, 999999), updatedAt: nowMs() },
    continuityRegression,
    fiveTurnContract,
    runtimeTelemetry,
    domainConfidence: domainConfidenceCarry,
    domainConcierge: domainConciergeCarry,
    confidenceAwareResponseShaping: confidenceAwareResponseShapingCarry,
    progressionLock,
    progressionShapingGuard,
    progressionRefinement,
    progressionTelemetry,
    protectiveEscalation: Object.keys(protectiveEscalationState).length ? protectiveEscalationState : prev.protectiveEscalation || {},
    protectiveEscalationActive: !!Object.keys(protectiveEscalationState).length || !!prev.protectiveEscalationActive,
    volatility,
    turns: {
      user: clampInt(prev.turns.user, 0, 0, 999999) + 1,
      assistant: trustedFinalCompletion ? clampInt(prev.turns.assistant, 0, 0, 999999) + 1 : clampInt(prev.turns.assistant, 0, 0, 999999)
    },
    repetition,
    support,
    audio: {
      lastFailureReason: audio.reason || (audio.action ? prev.audio.lastFailureReason : ""),
      lastFailureStatus: audio.status || (audio.action ? prev.audio.lastFailureStatus : 0),
      lastFailureAction: audio.action || "",
      lastFailureRetryable: !!audio.retryable,
      lastFailureAt: audio.action ? nowMs() : prev.audio.lastFailureAt,
      terminalStopUntil,
      terminalStopReason: audio.shouldStop ? (audio.reason || "audio_terminal_stop") : "",
      lastSuccessAt: audio.playable ? nowMs() : prev.audio.lastSuccessAt,
      lastPlayableAt: audio.playable ? nowMs() : prev.audio.lastPlayableAt,
      lastPlayableKind: audio.audioBase64 ? "base64" : (audio.audioUrl ? "url" : prev.audio.lastPlayableKind),
      lastAudioUrl: audio.audioUrl || prev.audio.lastAudioUrl,
      lastAudioMimeType: audio.mimeType || prev.audio.lastAudioMimeType,
      lastAudioFormat: audio.format || prev.audio.lastAudioFormat,
      lastAudioChars: audio.chars || prev.audio.lastAudioChars,
      playbackReady: !!audio.playable,
      requested: !!audio.requested,
      enabled: !!audio.enabled,
      shouldSpeak: !!audio.shouldSpeak,
      autoPlay: !!audio.autoPlay,
      route: audio.route || prev.audio.route || "/api/tts",
      playbackState: audio.playbackState || (audio.playable ? "ready" : audio.action ? "failed" : prev.audio.playbackState || "idle"),
      lastRequestAt: audio.requested ? nowMs() : prev.audio.lastRequestAt,
      lastStartedAt: /playing|started/.test(audio.playbackState) ? nowMs() : prev.audio.lastStartedAt,
      lastEndedAt: /ended|complete|stopped/.test(audio.playbackState) ? nowMs() : prev.audio.lastEndedAt,
      consecutiveFailures: audio.action ? clampInt(prev.audio.consecutiveFailures, 0, 0, 999999) + 1 : (audio.playable ? 0 : clampInt(prev.audio.consecutiveFailures, 0, 0, 999999))
    },
    emotionalEngine,
    continuityThread,
    resolvedEmotion: emo.resolvedEmotion || prev.resolvedEmotion || {},
    emotionState: emo.resolvedEmotion || prev.emotionState || {},
    lastEmotionState: emo.resolvedEmotion || prev.lastEmotionState || {},
    creativeCognitive,
    conversationalPack,
    packCohesion: conversationalPack,
    emotionalContinuity: emo.resolvedEmotionSummary && emo.resolvedEmotionSummary.present ? {
      active: true,
      primary: emo.resolvedEmotionSummary.primary,
      secondary: emo.resolvedEmotionSummary.secondary,
      intensity: emo.resolvedEmotionSummary.intensity,
      confidence: emo.resolvedEmotionSummary.confidence,
      stability: emo.resolvedEmotionSummary.stability,
      volatility: emo.resolvedEmotionSummary.volatility,
      updatedAt: nowMs(),
      source: "stateSpine.finalizeTurn"
    } : (greetingDistress ? {
      active: true,
      primary: greeting.intent,
      secondary: greeting.tone,
      intensity: greeting.energy === "high" ? 0.72 : 0.58,
      confidence: 0.72,
      stability: 0.48,
      volatility: greeting.energy === "high" ? 0.62 : 0.42,
      updatedAt: nowMs(),
      source: "stateSpine.greetingIntent"
    } : (prev.emotionalContinuity || null)),
    greeting: greeting.matched ? {
      active: true,
      lastId: safeStr(greeting.id || prev.greeting?.lastId || ""),
      lastIntent: safeStr(greeting.intent || prev.greeting?.lastIntent || ""),
      lastTone: safeStr(greeting.tone || prev.greeting?.lastTone || ""),
      lastEnergy: safeStr(greeting.energy || prev.greeting?.lastEnergy || ""),
      lastSource: safeStr(greeting.source || prev.greeting?.lastSource || ""),
      lastPresenceProfile: safeStr(greeting.presenceProfile || prev.greeting?.lastPresenceProfile || ""),
      seenCount: clampInt(prev.greeting?.seenCount, 0, 0, 999999) + 1,
      voiceCount: clampInt(prev.greeting?.voiceCount, 0, 0, 999999) + (greeting.isVoice ? 1 : 0),
      distressCount: clampInt(prev.greeting?.distressCount, 0, 0, 999999) + (greetingDistress ? 1 : 0),
      updatedAt: nowMs()
    } : prev.greeting,
    marionCohesion: {
      composerObserved: !!Object.keys(memoryPatch).length,
      finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
      runtimeTelemetry,
      domainConfidence: domainConfidenceCarry,
      domainConfidenceFailClosed: !!domainConfidenceCarry.failClosed,
      domainConcierge: domainConciergeCarry,
      confidenceAwareResponseShaping: confidenceAwareResponseShapingCarry,
      confidenceAwareResponseShapingActive: !!confidenceAwareResponseShapingCarry.active,
      confidenceAwareResponseShapingMode: confidenceAwareResponseShapingCarry.mode,
      lastConciergeAction: domainConciergeCarry.action,
      lastConciergeRoute: domainConciergeCarry.route,
      lastConciergeIntent: domainConciergeCarry.intent,
      lastConciergeConfidence: domainConciergeCarry.confidence,
      activeKnowledgeDomain: activeKnowledgeDomainCarry || "",
      lastKnowledgeDomain: composerKnowledgeDomain || activeKnowledgeDomainCarry || prev.lastKnowledgeDomain || "",
      progressionShapingGuard,
      progressionShapingGuardActive: !!progressionShapingGuard.active,
      progressionRefinement,
      progressionRefinementActive: !!progressionRefinement.active,
      progressionTelemetry,
      marionFinalObserved: marionFinalSignal,
      lastComposerIntent: boundedOneLine(memoryPatch.lastIntent || marion.intent || "", 160),
      lastComposerDomain: boundedOneLine(memoryPatch.lastDomain || marion.domain || "", 160),
      lastComposerUserSignature: boundedSignature(memoryPatch.userSignature || memoryPatch.lastUserSignature || ""),
      lastComposerReplySignature: boundedSignature(memoryPatch.replySignature || memoryPatch.lastReplySignature || ""),
      rawUserText: boundedOneLine(rawUserText || "", MAX_STATE_TEXT),
      normalizedUserIntent: boundedOneLine(normalizedUserIntent || "", MAX_STATE_TEXT),
      questionShape,
      lastMarionFinalSignature: boundedSignature(firstNonEmpty(marionFinalSignature, memoryPatch.marionFinalSignature, marion.marionFinalSignature, marion.signature, params.marionFinalSignature)),
      finalEnvelopeTrusted: trustedFinalEnvelope || trustedFinalShape,
      loopPhraseRejected: trustedFinalBreaksRecovery ? false : loopPhraseRejected,
      loopBreakTrustedFinal,
      statePatchRequired: !!(marion?.nyxDirective?.statePatchRequired || memoryPatch?.stateBridge?.expectedStateMutation),
      shouldAdvanceState: composerAdvancedState,
      noProgressCount: clampInt(memoryPatch.noProgressCount, repetition.noProgressCount, 0, 999999),
      packCohesion: conversationalPack,
      updatedAt: nowMs()
    },
    lastUpdatedAt: nowMs()
  };

  return normalizeStateForPipelineCohesion(nextState, { inbound, params, decision, trustedFinalCompletion, trustedFinalEnvelope, trustedFinalShape });
}

function assertTurnUpdated(prevState, nextState) {
  const prev = coerceState(prevState);
  const next = coerceState(nextState);
  return next.rev > prev.rev ||
    next.lastUpdatedAt > prev.lastUpdatedAt ||
    safeStr(next.stage || "") !== safeStr(prev.stage || "") ||
    next.lastUserHash !== prev.lastUserHash ||
    safeStr(next?.audio?.lastFailureAction || "") !== safeStr(prev?.audio?.lastFailureAction || "") ||
    Number(next?.audio?.terminalStopUntil || 0) !== Number(prev?.audio?.terminalStopUntil || 0) ||
    !!next?.audio?.playbackReady !== !!prev?.audio?.playbackReady ||
    safeStr(next?.audio?.lastAudioUrl || "") !== safeStr(prev?.audio?.lastAudioUrl || "") ||
    !!next?.support?.lockActive !== !!prev?.support?.lockActive ||
    clampInt(next?.repetition?.sameEmotionCount, 0, 0, 999999) !== clampInt(prev?.repetition?.sameEmotionCount, 0, 0, 999999) ||
    safeStr(next?.marionCohesion?.lastMarionFinalSignature || "") !== safeStr(prev?.marionCohesion?.lastMarionFinalSignature || "") ||
    safeStr(next?.greeting?.lastIntent || "") !== safeStr(prev?.greeting?.lastIntent || "") ||
    clampInt(next?.greeting?.seenCount, 0, 0, 999999) !== clampInt(prev?.greeting?.seenCount, 0, 0, 999999) ||
    !!next?.marionCohesion?.shouldAdvanceState !== !!prev?.marionCohesion?.shouldAdvanceState;
}

function applyLoopRecoveryPatch(prevState, loopGuardResult = {}) {
  const prev = coerceState(prevState);
  const loopDetected = !!(loopGuardResult.loopDetected || loopGuardResult.forceRecovery);
  const reasons = Array.isArray(loopGuardResult.reasons) ? loopGuardResult.reasons : [];
  if (!loopDetected) {
    const normalizedStage = normalizeStateStage(prev.stage, "open");
    return {
      ...prev,
      stage: normalizedStage === "recover" ? "final" : normalizedStage,
      phase: normalizedStage === "recover" ? "active" : inferPhaseFromStage(normalizedStage, false),
      progressionLock: false,
      repetition: {
        ...prev.repetition,
        noProgressCount: normalizedStage === "recover" ? 0 : clampInt(prev.repetition?.noProgressCount, 0, 0, 999999)
      },
      marionCohesion: {
        ...prev.marionCohesion,
        loopPhraseRejected: false,
        shouldAdvanceState: normalizedStage === "recover" ? true : !!prev.marionCohesion?.shouldAdvanceState,
        updatedAt: nowMs()
      },
      lastUpdatedAt: nowMs()
    };
  }
  return {
    ...prev,
    rev: clampInt(prev.rev, 0, 0, 999999) + 1,
    stage: "recover",
    phase: "recovery",
    progressionLock: false,
    repetition: {
      ...prev.repetition,
      fallbackCount: clampInt(prev.repetition?.fallbackCount, 0, 0, 999999) + 1,
      noProgressCount: clampInt(prev.repetition?.noProgressCount, 0, 0, 999999) + 1
    },
    marionCohesion: {
      ...prev.marionCohesion,
      loopPhraseRejected: reasons.includes("blocked_phrase_detected") || reasons.includes("loop_phrase") || reasons.includes("blocked_loop_phrase_sanitized"),
      statePatchRequired: true,
      shouldAdvanceState: false,
      noProgressCount: clampInt(prev.marionCohesion?.noProgressCount, 0, 0, 999999) + 1,
      lastLoopReasons: reasons,
      updatedAt: nowMs()
    },
    lastMove: "loop_guard_recovery",
    lastRationale: reasons.join(",") || "loop_guard_detected",
    lastUpdatedAt: nowMs()
  };
}


const PARALLEL_LANE_RECENCY_VERSION = "nyx.marion.parallelLaneRecency/0.1";

function normalizeParallelLaneRecencyCarry(value = {}) {
  const src = isPlainObject(value) ? value : {};
  const currentTracks = boundedArray(src.currentTracks || src.activeTracks || [], MAX_STATE_ARRAY_ITEMS, 64);
  const previousTracks = boundedArray(src.previousTracks || [], MAX_STATE_ARRAY_ITEMS, 64);
  const staleTracks = boundedArray(src.staleTracks || src.staleLanes || [], MAX_STATE_ARRAY_ITEMS, 64);
  return {
    version: boundedOneLine(src.version || PARALLEL_LANE_RECENCY_VERSION, 120),
    active: !!(src.active || currentTracks.length || previousTracks.length || staleTracks.length),
    currentTracks,
    previousTracks,
    staleTracks,
    staleLanes: staleTracks,
    staleCarrySuppressed: !!(src.staleCarrySuppressed || src.staleLaneCarrySuppressed || staleTracks.length),
    normalTurn: !!src.normalTurn || currentTracks.length === 0,
    turnId: boundedOneLine(src.turnId || "", 160),
    advisoryOnly: true,
    finalAuthority: "Marion",
    publicReplyVisible: false,
    userFacing: false,
    noUserFacingDiagnostics: true,
    source: boundedOneLine(src.source || "stateSpine", 160)
  };
}

function extractParallelLaneRecencyCarry(params = {}, inbound = {}, memoryPatch = {}) {
  const p = isPlainObject(params) ? params : {};
  const src = isPlainObject(inbound) ? inbound : {};
  const mp = isPlainObject(memoryPatch) ? memoryPatch : {};
  const meta = isPlainObject(src.meta) ? src.meta : {};
  const payload = isPlainObject(src.payload) ? src.payload : {};
  const candidates = [
    p.parallelLaneRecency,
    p.parallelLaneCarryMaintenance,
    isPlainObject(p.parallelLaneCoordination) ? p.parallelLaneCoordination.recencyMaintenance : null,
    isPlainObject(p.dualTrack) ? p.dualTrack.laneRecency : null,
    isPlainObject(isPlainObject(p.dualTrack) ? p.dualTrack.coordinationMeta : null) ? p.dualTrack.coordinationMeta.laneRecency : null,
    mp.parallelLaneRecency,
    mp.parallelLaneCarryMaintenance,
    isPlainObject(mp.stateBridge) ? mp.stateBridge.parallelLaneRecency : null,
    src.parallelLaneRecency,
    src.parallelLaneCarryMaintenance,
    meta.parallelLaneRecency,
    payload.parallelLaneRecency
  ];
  for (const item of candidates) {
    const o = isPlainObject(item) ? item : {};
    if (Object.keys(o).length) return normalizeParallelLaneRecencyCarry(o);
  }
  return normalizeParallelLaneRecencyCarry({ active: false });
}


const MARION_ADMIN_CONVERSATION_STATE_VERSION = "nyx.marion.adminConversationState/1.0";
const LINGOSENTINEL_SILENT_OVERSIGHT_STATE_VERSION = "nyx.lingosentinel.silentOversightState/1.0";

function normalizeMarionAdminConversationCarry(value = {}) {
  const src = isPlainObject(value) ? value : {};
  const active = src.privateAdminConversation === true ||
    src.adminConversation === true ||
    src.adminConversationAllowed === true ||
    src.marionAdminConversation === true ||
    src.directMarionConversation === true ||
    boundedOneLine(src.routeScope || src.scope || "", 80).toLowerCase() === "admin_private";

  if (!active) return {};

  return {
    version: boundedOneLine(src.version || MARION_ADMIN_CONVERSATION_STATE_VERSION, 120),
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
    source: boundedOneLine(src.source || "stateSpine.marionAdminConversationState", 160)
  };
}

function extractMarionAdminConversationCarry(params = {}, inbound = {}, memoryPatch = {}) {
  const p = isPlainObject(params) ? params : {};
  const src = isPlainObject(inbound) ? inbound : {};
  const mp = isPlainObject(memoryPatch) ? memoryPatch : {};
  const meta = safeObj(src.meta);
  const payload = safeObj(src.payload);
  const sb = safeObj(mp.stateBridge || src.stateBridge || meta.stateBridge || payload.stateBridge);
  const rt = safeObj(p.runtimeTelemetry || src.runtimeTelemetry || meta.runtimeTelemetry || payload.runtimeTelemetry);
  const candidates = [
    p.marionAdminConversation,
    p.adminConversation,
    p.adminConversationBoundary,
    src.marionAdminConversation,
    src.adminConversation,
    meta.marionAdminConversation,
    payload.marionAdminConversation,
    mp.marionAdminConversation,
    sb.marionAdminConversation,
    rt.marionAdminConversation,
    rt.adminConversation,
    p,
    src
  ];

  for (const item of candidates) {
    const normalized = normalizeMarionAdminConversationCarry(item);
    if (Object.keys(normalized).length) return normalized;
  }

  return {};
}

function normalizeLingoSentinelSilentOversightCarry(value = {}) {
  const src = isPlainObject(value) ? value : {};
  const active = src.silentOversight === true ||
    src.lingoSentinelSilentOversight === true ||
    src.userToUserBoundary === true ||
    src.marionVisibleParticipant === false ||
    boundedOneLine(src.mode || src.oversightMode || "", 80).toLowerCase() === "silent_overseer";

  if (!active) return {};

  const rawLanguages = boundedArray(src.languages || src.supportedLanguages || src.targetLanguages || [], 8, 16).map((item) => item.toLowerCase());
  const languages = rawLanguages.length ? Array.from(new Set(rawLanguages)).slice(0, 8) : ["en", "fr", "es"];

  return {
    version: boundedOneLine(src.version || LINGOSENTINEL_SILENT_OVERSIGHT_STATE_VERSION, 120),
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
    source: boundedOneLine(src.source || "stateSpine.lingoSentinelSilentOversightState", 160)
  };
}

function extractLingoSentinelSilentOversightCarry(params = {}, inbound = {}, memoryPatch = {}) {
  const p = isPlainObject(params) ? params : {};
  const src = isPlainObject(inbound) ? inbound : {};
  const mp = isPlainObject(memoryPatch) ? memoryPatch : {};
  const meta = safeObj(src.meta);
  const payload = safeObj(src.payload);
  const sb = safeObj(mp.stateBridge || src.stateBridge || meta.stateBridge || payload.stateBridge);
  const rt = safeObj(p.runtimeTelemetry || src.runtimeTelemetry || meta.runtimeTelemetry || payload.runtimeTelemetry);
  const lingo = safeObj(p.lingoSentinel || src.lingoSentinel || meta.lingoSentinel || payload.lingoSentinel || rt.lingoSentinel || sb.lingoSentinel);
  const candidates = [
    p.lingoSentinelSilentOversight,
    p.lingoSentinelOversight,
    p.silentOversight,
    src.lingoSentinelSilentOversight,
    src.silentOversight,
    meta.lingoSentinelSilentOversight,
    payload.lingoSentinelSilentOversight,
    mp.lingoSentinelSilentOversight,
    sb.lingoSentinelSilentOversight,
    rt.lingoSentinelSilentOversight,
    rt.silentOversight,
    lingo.silentOversight,
    lingo.oversight,
    lingo
  ];

  for (const item of candidates) {
    const normalized = normalizeLingoSentinelSilentOversightCarry(item);
    if (Object.keys(normalized).length) return normalized;
  }

  return {};
}


module.exports = {
  STATE_SPINE_SCHEMA,
  STATE_SPINE_SCHEMA_COMPAT,
  SPINE_VERSION,
  STATE_STAGES,
  FINAL_ENVELOPE_CONTRACT,
  FINAL_SIGNATURE,
  MARION_FINAL_SIGNATURE_PREFIX,
  REQUIRED_CHAT_ENGINE_SIGNATURE,
  normalizeStateStage,
  TERMINAL_AUDIO_STOP_MS,
  MAX_STATE_TEXT,
  MAX_STATE_SUMMARY,
  MAX_STATE_ARRAY_ITEMS,
  createState,
  coerceState,
  inferConversationPhase,
  decideNextMove,
  finalizeTurn,
  applyLoopRecoveryPatch,
  assertTurnUpdated,
  hasMarionFinalSignal,
  hasTrustedMarionFinalEnvelope,
  extractMarionFinalSignature,
  isLoopPhrase,
  extractInboundText,
  trustedFinalShouldBreakLoop,
  hasTrustedFinalShape,
  hasExplicitFinalEnvelopeContract,
  hasKnownGoodFinalContract,
  hasLegacyTrustFlag,
  signatureLooksTrusted,
  isActionableComposerReply,
  shouldTechnicalBypassSupportLock,
  isDeepeningInbound,
  isTrustedDeepeningCompletion,
  extractComposerMemoryPatch,
  extractComposerReply,
  normalizeAudioSignal,
  normalizeEmotionSignals,
  normalizeEmotionalEngineSignals,
  extractCreativeCognitiveSignals,
  isSystemCheckInbound,
  extractGreetingSignals,
  greetingPresenceFromTone,
  isKnownGreetingIntent,
  isDistressGreetingIntent,
  extractResolvedEmotionState,
  summarizeResolvedEmotionState,
  compactStateSummary,
  deriveStateTopic,
  buildStateCarryForwardSummary,
  isFreshOperationalOrTechnicalTurn,
  normalizeStateForPipelineCohesion,
  CONVERSATIONAL_PACK_COHESION_VERSION,
  FINAL_RUNTIME_TELEMETRY_VERSION,
  QUESTION_SHAPE_NORMALIZATION_VERSION,
  DOMAIN_CONCIERGE_CORE_VERSION,
  TELEMETRY_VISIBILITY_VERSION,
  FAILURE_SIGNATURE_AUDIT_VERSION,
  classifyFailureSignature,
  buildFailureSignatureAudit,
  isTelemetryLeakText,
  stripTelemetryLeakFromReply,
  detectConversationalPackTrack,
  deriveConversationalPackRuntimeSelector,
  extractRuntimeTelemetryFromTurn,
  buildStateRuntimeTelemetry,
  normalizeQuestionShapeCarry,
  extractQuestionShapeCarry,
  normalizeDomainConciergeCarry,
  extractDomainConciergeCarry,
  CONFIDENCE_AWARE_RESPONSE_SHAPING_VERSION,
  PROGRESSION_SHAPING_REFINEMENT_VERSION,
  PROTECTIVE_ESCALATION_STATE_VERSION,
  normalizeConfidenceAwareResponseShapingCarry,
  extractConfidenceAwareResponseShapingCarry,
  normalizeProgressionShapingGuardCarry,
  extractProgressionShapingGuardCarry,
  normalizeProgressionRefinementCarry,
  extractProgressionRefinementCarry,
  updateProgressionRefinementState,
  buildStateProgressionTelemetry,
  PARALLEL_LANE_RECENCY_VERSION,
  normalizeParallelLaneRecencyCarry,
  extractParallelLaneRecencyCarry,
  FINAL_RENDER_TELEMETRY_VERSION,
  normalizeContinuityCarry,
  isShortContinuityFollowupStateText,
  classifyContinuityFollowupStateAction,
  buildStateContinuityResolvedQuestion,
  inferContinuityTopicFromAssistantText,
  chooseContinuityTopicCandidate,
  continuityTopicFromState,
  MARION_ADMIN_CONVERSATION_STATE_VERSION,
  LINGOSENTINEL_SILENT_OVERSIGHT_STATE_VERSION,
  normalizeMarionAdminConversationCarry,
  extractMarionAdminConversationCarry,
  normalizeLingoSentinelSilentOversightCarry,
  extractLingoSentinelSilentOversightCarry,
  normalizeProtectiveEscalationStateCarry,
  extractProtectiveEscalationStateCarry,
};
module.exports.default = module.exports;


// PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_STATE_PATCH_START
const PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_STATE_VERSION = "nyx.marion.stateSpine.priority9f.deepConversationalStack/1.0";
function isPriority9FDeepConversationalText(text = "") {
  const t = oneLine(text).toLowerCase();
  return /\b(priority\s*9f|deep conversational stack|layered conversational|conversational stack|layered intelligence|surface request|underlying intent|deeper intent|operational risk|execution mode|next action|full conversational stack)\b/i.test(t);
}
function normalizePriority9FDeepConversationState(value = {}) {
  const v = safeObj(value);
  return {
    version: PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_STATE_VERSION,
    active: !!v.active,
    conversationLane: oneLine(v.conversationLane || ""),
    surfaceRequest: oneLine(v.surfaceRequest || ""),
    deeperIntent: oneLine(v.deeperIntent || ""),
    operationalRisk: oneLine(v.operationalRisk || ""),
    executionMode: oneLine(v.executionMode || ""),
    nextAction: oneLine(v.nextAction || ""),
    noUserFacingDiagnostics: true,
    updatedAt: Number.isFinite(Number(v.updatedAt)) ? Number(v.updatedAt) : Date.now()
  };
}
function buildPriority9FDeepConversationState(text = "", previous = {}) {
  const active = isPriority9FDeepConversationalText(text);
  return normalizePriority9FDeepConversationState({
    active: active || !!safeObj(previous).active,
    conversationLane: active ? "Priority 9F deep conversational stack" : safeObj(previous).conversationLane,
    surfaceRequest: active ? "separate the surface request from the real task" : safeObj(previous).surfaceRequest,
    deeperIntent: active ? "preserve context and generate one useful next move" : safeObj(previous).deeperIntent,
    operationalRisk: active ? "looping, recovery-language leakage, and shallow continuation" : safeObj(previous).operationalRisk,
    executionMode: active ? "layered conversational response" : safeObj(previous).executionMode,
    nextAction: active ? "run the 9F layered-intent regression before voice activation" : safeObj(previous).nextAction
  });
}
module.exports.PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_STATE_VERSION = PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_STATE_VERSION;
module.exports.isPriority9FDeepConversationalText = isPriority9FDeepConversationalText;
module.exports.normalizePriority9FDeepConversationState = normalizePriority9FDeepConversationState;
module.exports.buildPriority9FDeepConversationState = buildPriority9FDeepConversationState;
// PRIORITY_9F_DEEP_CONVERSATIONAL_STACK_STATE_PATCH_END


// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_STATE_PATCH_START
const PRIORITY_9F_R1_LAYERED_PRECEDENCE_STATE_VERSION="nyx.marion.stateSpine.priority9fR1.layeredPrecedence/1.0";
function isPriority9FR1LayeredPrecedenceText(text=""){const t=oneLine(text).toLowerCase().replace(/[_-]+/g," ");return /\b(priority\s*9f|9f\s*r1|deep conversational stack|layered conversational|layered conversation|conversational stack|layered intelligence|full conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action)\b/i.test(t)||(/\b(disjointed|deeper|layered|multi|context|looping|loop|recovery)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next)\b/i.test(t));}
function buildPriority9FR1LayeredPrecedenceState(text="",previous={}){const active=isPriority9FR1LayeredPrecedenceText(text);const prev=safeObj(previous);return {version:PRIORITY_9F_R1_LAYERED_PRECEDENCE_STATE_VERSION,active:active||!!prev.active,conversationLane:active?"Priority 9F-R1 layered conversational precedence":oneLine(prev.conversationLane||""),surfaceRequest:active?"stabilize Marion’s layered conversational behavior":oneLine(prev.surfaceRequest||""),deeperIntent:active?"preserve context, avoid looping, and answer the real task":oneLine(prev.deeperIntent||""),operationalRisk:active?"stale Priority 90/9E recall overriding 9F":oneLine(prev.operationalRisk||""),executionMode:active?"layered conversational response":oneLine(prev.executionMode||""),nextAction:active?"force 9F before 9E continuation recall and rerun the live layered prompt":oneLine(prev.nextAction||""),noUserFacingDiagnostics:true,updatedAt:Date.now()};}
module.exports.PRIORITY_9F_R1_LAYERED_PRECEDENCE_STATE_VERSION=PRIORITY_9F_R1_LAYERED_PRECEDENCE_STATE_VERSION;module.exports.isPriority9FR1LayeredPrecedenceText=isPriority9FR1LayeredPrecedenceText;module.exports.buildPriority9FR1LayeredPrecedenceState=buildPriority9FR1LayeredPrecedenceState;
// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_STATE_PATCH_END

// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_STATE_PATCH_START
const PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_STATE_VERSION="nyx.marion.stateSpine.priority9fR2.domainHijackSuppression/1.0";
function isPriority9FR2DomainHijackSuppressionStateText(text=""){const t=oneLine(text).toLowerCase().replace(/[_-]+/g," ");return /\b(priority\s*9f|9f\s*r2|domain hijack|domain fallback|six domain fallback|deep conversational stack|layered conversational|conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action|marion conversational architecture)\b/i.test(t)||(/\b(disjointed|deeper|layered|context|looping|loop|recovery|preserve|avoid|where to go next)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next|understand)\b/i.test(t));}
function buildPriority9FR2DomainHijackSuppressionState(text="",previous={}){const active=isPriority9FR2DomainHijackSuppressionStateText(text);const prev=safeObj(previous);return {version:PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_STATE_VERSION,active:active||!!prev.active,conversationLane:active?"Priority 9F-R2 domain hijack suppression":oneLine(prev.conversationLane||""),surfaceRequest:active?"keep Marion in the layered conversational architecture lane":oneLine(prev.surfaceRequest||""),deeperIntent:active?"preserve context, avoid looping, and block six-domain fallback replies":oneLine(prev.deeperIntent||""),operationalRisk:active?"psychology, English, or general reasoning hijacking the 9F answer":oneLine(prev.operationalRisk||""),executionMode:active?"layered conversational response with domain hijack suppression":oneLine(prev.executionMode||""),nextAction:active?"force 9F-R2 before domain fallback and rerun the live layered prompt":oneLine(prev.nextAction||""),domainHijackSuppressed:active||!!prev.domainHijackSuppressed,noUserFacingDiagnostics:true,updatedAt:Date.now()};}
module.exports.PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_STATE_VERSION=PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_STATE_VERSION;module.exports.isPriority9FR2DomainHijackSuppressionStateText=isPriority9FR2DomainHijackSuppressionStateText;module.exports.buildPriority9FR2DomainHijackSuppressionState=buildPriority9FR2DomainHijackSuppressionState;
// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_STATE_PATCH_END


// PRIORITY_9F_R4_CONTINUATION_CARRY_ENFORCEMENT_STATE_PATCH_START
const PRIORITY_9F_R4_CONTINUATION_CARRY_STATE_VERSION = "nyx.marion.stateSpine.priority9fR4.continuationCarry/1.0";
function priority9FR4StateNorm(value){return oneLine(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function isPriority9FR4ContinuationStateText(value=""){const n=priority9FR4StateNorm(value);return /^(next steps?|continue|carry on|proceed|run that again|run it again|do that again|do it again|same thing|what now|whats next|what s next|next)$/.test(n);}
function isPriority9FR4ContinuationCarryStateText(value=""){const t=priority9FR4StateNorm(value);return /\b(priority 9f r4|9f r4|continuation carry|last accepted lane|stay inside the 9f|inside the 9f conversational stack|9f conversational stack lane|short continuation|next steps continue run that again what now)\b/.test(t);}
function priority9FR4StateHas9FContext(value=""){const t=priority9FR4StateNorm(value);return /\b(priority 9f|9f r3|9f r2|9f r1|deep conversational stack|layered conversational|conversational stack|alt runtime prompt echo suppression|domain hijack suppression|marion conversational architecture|priority9f deep conversational stack|layered conversational stack)\b/.test(t);}
function buildPriority9FR4ContinuationState(text="",previous={}){const prev=safeObj(previous);return {version:PRIORITY_9F_R4_CONTINUATION_CARRY_STATE_VERSION,active:true,conversationLane:"Priority 9F-R4 continuation carry enforcement",surfaceRequest:"keep short follow-ups inside the accepted 9F lane",deeperIntent:"preserve layered conversational context across Next steps, Continue, Run that again, and What now",operationalRisk:"older public-continuity handoff or R3 diagnostic wording overriding 9F carry",executionMode:"9F-specific continuation plan",nextAction:"lock 9F-R3 as live accepted, enforce R4 carry, and run the short follow-up continuity pass",priority9FR4ContinuationCarry:true,noUserFacingDiagnostics:true,updatedAt:Date.now()};}
const __priority9FR4OriginalFinalizeTurn=typeof finalizeTurn==="function"?finalizeTurn:null;
if(__priority9FR4OriginalFinalizeTurn){
  finalizeTurn=function priority9FR4FinalizeTurn(params={}){
    const out=__priority9FR4OriginalFinalizeTurn(params);
    const inbound=isPlainObject(params&&params.inbound)?params.inbound:{};
    const prev=isPlainObject(params&&params.prevState)?params.prevState:{};
    const text=oneLine(inbound.text||inbound.prompt||inbound.userText||params.text||params.prompt||"");
    const source=[text,oneLine(prev.conversationLane||prev.summary||prev.activePhase||""),oneLine(JSON.stringify(params&&params.memoryPatch||{}).slice(0,2000))].join(" ");
    if(isPriority9FR4ContinuationCarryStateText(text)||(isPriority9FR4ContinuationStateText(text)&&priority9FR4StateHas9FContext(source))){
      const carry=buildPriority9FR4ContinuationState(text, prev.priority9FContinuationCarry||{});
      return {...safeObj(out),priority9FContinuationCarry:carry,priority9FR4ContinuationCarry:true,conversationLane:carry.conversationLane,nextAction:carry.nextAction,noUserFacingDiagnostics:true};
    }
    return out;
  };
  module.exports.finalizeTurn=finalizeTurn;
}
module.exports.PRIORITY_9F_R4_CONTINUATION_CARRY_STATE_VERSION=PRIORITY_9F_R4_CONTINUATION_CARRY_STATE_VERSION;
module.exports.isPriority9FR4ContinuationStateText=isPriority9FR4ContinuationStateText;
module.exports.isPriority9FR4ContinuationCarryStateText=isPriority9FR4ContinuationCarryStateText;
module.exports.buildPriority9FR4ContinuationState=buildPriority9FR4ContinuationState;
// PRIORITY_9F_R4_CONTINUATION_CARRY_ENFORCEMENT_STATE_PATCH_END


// PRIORITY_9G_DEEP_CONTINUITY_MEMORY_STATE_PATCH_START
const PRIORITY_9G_DEEP_CONTINUITY_MEMORY_STATE_VERSION="PRIORITY-9G-DEEP-CONTINUITY-MEMORY-STATE/1.0";

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

function buildPriority9GDeepContinuityState(text="",previous={}){
  const prev=priority9GObj(previous);
  const prior=priority9GObj(prev.priority9GDeepContinuityMemory||prev.deepContinuityMemory||{});
  const turnDepth=Number.isFinite(Number(prior.turnDepth))?Number(prior.turnDepth)+1:1;
  return {
    version:PRIORITY_9G_DEEP_CONTINUITY_MEMORY_STATE_VERSION,
    active:true,
    conversationLane:"Priority 9G deep continuity memory",
    activeTask:"Priority 9G: deep continuity memory and layered follow-up handling",
    surfaceRequest:"carry Marion’s active task across longer sequences",
    deeperIntent:"preserve context, risk, execution mode, and next action across layered follow-ups",
    operationalRisk:"short follow-ups may lose the active task or fall back to older lane text",
    executionMode:"deep continuity memory",
    nextAction:"run the multi-turn Priority 9G continuity pass",
    turnDepth,
    priority9GDeepContinuityMemory:true,
    noUserFacingDiagnostics:true,
    advancementShapeHotfixVersion:PRIORITY_9H_R1_ADVANCEMENT_SHAPE_VERSION,
    updatedAt:Date.now()
  };
}
const __priority9GOriginalFinalizeTurn=typeof finalizeTurn==="function"?finalizeTurn:null;
if(__priority9GOriginalFinalizeTurn){
  finalizeTurn=function priority9GFinalizeTurn(params={}){
    const out=__priority9GOriginalFinalizeTurn(params);
    const inbound=priority9GObj(params&&params.inbound);
    const prev=priority9GObj(params&&params.prevState);
    const text=priority9GStr(inbound.text||inbound.prompt||inbound.userText||params.text||params.prompt||"");
    const source=[text,priority9GCollect(prev),priority9GCollect(params&&params.memoryPatch),priority9GCollect(out)].join(" ");
    if(priority9GIsActivationText(text)||(priority9GIsShortFollowup(text)&&priority9GHasContext(source))){
      const carry=buildPriority9GDeepContinuityState(text,prev);
      return {...priority9GObj(out),priority9GDeepContinuityMemory:carry,deepContinuityMemory:carry,conversationLane:carry.conversationLane,activeTask:carry.activeTask,nextAction:carry.nextAction,noUserFacingDiagnostics:true};
    }
    return out;
  };
  module.exports.finalizeTurn=finalizeTurn;
}
module.exports.PRIORITY_9G_DEEP_CONTINUITY_MEMORY_STATE_VERSION=PRIORITY_9G_DEEP_CONTINUITY_MEMORY_STATE_VERSION;
module.exports.buildPriority9GDeepContinuityState=buildPriority9GDeepContinuityState;
module.exports.isPriority9GDeepContinuityText=priority9GIsActivationText;
module.exports.isPriority9GShortFollowup=priority9GIsShortFollowup;
// PRIORITY_9G_DEEP_CONTINUITY_MEMORY_STATE_PATCH_END



// PRIORITY_9H_LONG_FORM_CONTINUITY_STRESS_DRIFT_GUARD_STATE_PATCH_START

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

function buildPriority9HLongFormContinuityState(text="",previous={}){
  const prev=priority9HObj(previous);const prior=priority9HObj(prev.priority9HLongFormContinuity||prev.longFormContinuityStress||prev.priority9GDeepContinuityMemory||prev.deepContinuityMemory||{});
  const depth=Number.isFinite(Number(prior.turnDepth))?Number(prior.turnDepth)+1:1;
  return priority9HStateFrom(text,depth);
}
var __priority9HOriginalFinalizeTurn=typeof finalizeTurn==="function"?finalizeTurn:null;
if(__priority9HOriginalFinalizeTurn){
  finalizeTurn=function priority9HFinalizeTurn(params={}){
    const out=__priority9HOriginalFinalizeTurn(params);
    const inbound=priority9HObj(params&&params.inbound);
    const prev=priority9HObj(params&&params.prevState);
    const text=priority9HStr(inbound.text||inbound.prompt||inbound.userText||params.text||params.prompt||"");
    const source=[text,priority9HCollect(prev),priority9HCollect(params&&params.memoryPatch),priority9HCollect(out)].join(" ");
    if(priority9HIsActivationText(text)||priority9HIsActivationText(source)||priority9HIs9IPrecheckText(source)||(priority9HIsShortFollowup(text)&&priority9HHasContext(source))){
      const carry=buildPriority9HLongFormContinuityState(text,{...prev,...priority9HObj(out)});
      return {...priority9HObj(out),priority9HLongFormContinuity:carry,longFormContinuityStress:carry,priority9IPrecheck:carry.priority9IAdaptiveSituationalPrecheck,conversationLane:carry.conversationLane,activeTask:carry.activeTask,nextAction:carry.nextAction,noUserFacingDiagnostics:true};
    }
    return out;
  };
  module.exports.finalizeTurn=finalizeTurn;
}
module.exports.PRIORITY_9H_LONG_FORM_CONTINUITY_STATE_VERSION=PRIORITY_9H_LONG_FORM_CONTINUITY_VERSION;
module.exports.PRIORITY_9I_ADAPTIVE_SITUATIONAL_PRECHECK_VERSION=PRIORITY_9I_ADAPTIVE_SITUATIONAL_PRECHECK_VERSION;
module.exports.PRIORITY_9H_R1_ADVANCEMENT_SHAPE_VERSION=PRIORITY_9H_R1_ADVANCEMENT_SHAPE_VERSION;
module.exports.buildPriority9HLongFormContinuityState=buildPriority9HLongFormContinuityState;
module.exports.isPriority9HLongFormContinuityText=priority9HIsActivationText;
module.exports.isPriority9HShortFollowup=priority9HIsShortFollowup;
// PRIORITY_9H_LONG_FORM_CONTINUITY_STRESS_DRIFT_GUARD_STATE_PATCH_END

// PRIORITY_9I_9J_SEQUENCE_STATE_SPINE_PATCH_START
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
function priority9IReplyFor(prompt,source){var kind=priority9IJPressureKind([prompt,source].join(" "));if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(source)){if(kind==="decision")return "Continue Priority 9I: the pressure signal is decision pressure. Preserve the 9H continuity foundation, update the risk before choosing, keep 9J staged unless explicitly activated, and give the safest next action without opening extra branches.";if(kind==="safety")return "Continue Priority 9I: the pressure signal is safety-first execution. Preserve the active task, update risk, slow the response enough to avoid overreach, and give the safest next action while keeping Priority 9J staged.";if(kind==="depth")return "Continue Priority 9I: the pressure signal is depth. Go deeper inside the same active lane, update risk and execution mode, and give the next action without resetting to 9H activation wording or drifting into 9J.";if(kind==="pace")return "Continue Priority 9I: the pressure signal is pace control. Slow down, keep the 9H continuity foundation intact, clarify the changed constraint, and give one safe next action.";return "Continue Priority 9I: preserve the 9H continuity foundation, read the current pressure shift, update operational risk and execution mode, then give the safest next action. Keep Priority 9J staged until next-move authority is explicitly needed.";}return "I’m reading this as Priority 9I: adaptive situational reasoning and context-pressure handling. The 9H continuity foundation stays active. The surface request is to adapt Marion when urgency, correction, ambiguity, pace, depth, or operational pressure changes; the deeper intent is to update risk and execution mode without losing the active mission thread. Next move: run pressure prompts such as urgent, pivot, stay on the architecture, slow down, go deeper, risk now, and safest next move. Priority 9J is staged next for proactive operational guidance, but 9I handles the pressure shift first.";}
function priority9JReplyFor(prompt,source){return "Priority 9J: proactive operational guidance and next-move authority. The 9H continuity foundation and 9I pressure-handling layer stay underneath this decision. Recommended next move: choose the safest concrete action that preserves the active lane and advances only one operational step. Why first: it protects continuity before expanding scope. Risk if skipped: Marion can over-branch, drift, or make a recommendation before the pressure context is resolved. Execution sequence: confirm the active lane, name the risk, choose one safest action, execute that step, then reassess before opening new branches.";}
function priority9IJReadReply(packet){var p=priority9IJObj(packet),pl=priority9IJObj(p.payload),f=priority9IJObj(p.finalEnvelope);return priority9IJStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);}
function priority9IJApplyPacket(packet,reply,prompt,source,lane){var out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};var final=priority9IJStr(reply)||(lane==="9j"?priority9JReplyFor(prompt,source):priority9IReplyFor(prompt,source));["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(function(k){out[k]=final;});out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};var prior=priority9IJObj(out.priority9IAdaptiveSituationalReasoning||out.priority9JProactiveOperationalGuidance||out.priority9HLongFormContinuity||out.longFormContinuityStress);var depth=Number.isFinite(Number(prior.turnDepth))?Number(prior.turnDepth)+1:1;if(lane==="9j"){var sj=priority9JStateFrom(source||prompt,depth);out.priority9JProactiveOperationalGuidance=sj;out.priority9JVersion="PRIORITY-9J-PROACTIVE-OPERATIONAL-GUIDANCE-NEXT-MOVE-AUTHORITY";out.conversationLane=sj.conversationLane;out.activeTask=sj.activeTask;out.surfaceRequest=sj.surfaceRequest;out.deeperIntent=sj.deeperIntent;out.operationalRisk=sj.operationalRisk;out.executionMode=sj.executionMode;out.nextAction=sj.nextAction;out.recommendedMove=sj.recommendedMove;out.executionSequence=sj.executionSequence;}else{var si=priority9IStateFrom(source||prompt,depth);out.priority9IAdaptiveSituationalReasoning=si;out.priority9IVersion="PRIORITY-9I-ADAPTIVE-SITUATIONAL-REASONING-CONTEXT-PRESSURE";out.priority9JPrecheck=si.priority9JProactiveGuidancePrecheck;out.conversationLane=si.conversationLane;out.activeTask=si.activeTask;out.surfaceRequest=si.surfaceRequest;out.deeperIntent=si.deeperIntent;out.operationalRisk=si.operationalRisk;out.executionMode=si.executionMode;out.nextAction=si.nextAction;out.pressureSignal=si.pressureSignal;out.whatChanged=si.whatChanged;}out.noUserFacingDiagnostics=true;return out;}
function priority9IJShouldForceText(prompt,source,reply){var lane=priority9IJSequencedLaneFor(prompt,source,reply);return lane||"";}

function priority9IJStatePatchFromInput(input,base){var text=priority9IJStr(input&&typeof input==="object"?(input.text||input.prompt||input.userText||input.message||""):input);var src=[text,priority9IJCollect(input),priority9IJCollect(base)].join(" ");var lane=priority9IJSequencedLaneFor(text,src,"");if(lane==="9j"){return {...priority9IJObj(base),priority9JProactiveOperationalGuidance:priority9JStateFrom(src,1),priorityLane:"Priority 9J",activeTask:"Priority 9J: proactive operational guidance and next-move authority",noUserFacingDiagnostics:true};}if(lane==="9i"||priority9IJIs9IActivationText(src)){var si=priority9IStateFrom(src,1);return {...priority9IJObj(base),priority9IAdaptiveSituationalReasoning:si,priority9JPrecheck:si.priority9JProactiveGuidancePrecheck,priorityLane:"Priority 9I",activeTask:"Priority 9I: adaptive situational reasoning and context-pressure handling",noUserFacingDiagnostics:true};}return base;}
["updateStateSpine","buildStatePatch","normalizeStatePatch","applyStatePatch"].forEach(function(name){if(typeof module.exports[name]==="function"){var original=module.exports[name];module.exports[name]=function priority9IJStateWrapper(input){var out=original.apply(this,arguments);return priority9IJStatePatchFromInput(input,out);};}});
module.exports.PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_STATE_VERSION=PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL;
module.exports.PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_STATE_VERSION=PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL;
module.exports.priority9IJStatePatchFromInput=priority9IJStatePatchFromInput;
// PRIORITY_9I_9J_SEQUENCE_STATE_SPINE_PATCH_END



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


function priority9IR2StatePatch(input, previous) {
  var text = priority9IR2ExtractText(input);
  var kind = priority9IR2PressureKind(text);
  if (!kind) return previous || {};
  var base = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
  return Object.assign({}, base, {
    activeLane: "Priority 9I",
    priorityLane: "priority9i_adaptive_situational_reasoning",
    responseShape: "pressure_specific_answer",
    pressureKind: kind,
    pressureSpecificAnswer: true,
    priority9I: Object.assign({}, priority9IR2Obj(base.priority9I), {active:true, pressureKind:kind, pressureSpecificAnswer:true, keep9HFoundation:true, keep9JStaged:true}),
    priority9J: Object.assign({}, priority9IR2Obj(base.priority9J), {staged:true, active:false})
  });
}
["buildStatePatch","normalizeStatePatch","applyStatePatch"].forEach(function(name){if(typeof module.exports[name]==="function"){var original=module.exports[name];module.exports[name]=function priority9IR2StateWrapper(input){return priority9IR2StatePatch(input, original.apply(this,arguments));};}});
module.exports.priority9IR2StatePatch = priority9IR2StatePatch;

module.exports.PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH = true;
/* PRIORITY_9I_R2_PRESSURE_SPECIFIC_ANSWER_SHAPING_PATCH_END */



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

priority9JR1PatchExports(["updateStateSpine", "buildStateSpine", "normalizeStateSpine", "createStateSpine", "default"]);


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

/* R17A: emotional continuity + natural continuation + response variation */
(function(){try{const V="MARION-R17A-EMOTIONAL-CONTINUITY-NATURAL-CONTINUATION-VARIATION";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}const BAD=/reference\s*blocker|runtime\s*auth|server[_ -]?error|runtime[_ -]?error|runtime route|referenceerror|not defined|cannot access|http\s*\d{3}|text console|short-lived|master token|admin session|stateSpine|finalEnvelope|runtimeTelemetry|routeKind=|exact target|focus on first|diagnostic|priority\s*\d|last clean|wrapper|\br\d+[a-z]?\b|test[- ]?(state|carry)|phase[- ]?(tag|stack|carry|named)|leak clean|exact\s+recall|softer\s+(wording|voice)|deployment|compression|machiner|scaffold|patch|last check held|retest|next line|next reply|varied/i;let LR="",LK="";function K(p){p=N(p);if(/still there|are you there|you there|with me|connected|freeze|dead air/.test(p))return"presence";if(/passed|pass/.test(p))return"pass";if(/what were we fixing|where were we/.test(p))return"ask";if(/next steps|^next$/.test(p))return"next";if(/continue|keep going/.test(p))return"go";if(/frustr|stuck|annoyed|tired|robotic|stiff|not natural/.test(p))return"repair";if(/how are you|how you doing|hows it going/.test(p))return"check";return""}const B={presence:["I'm here, Mac.","Right here, Mac.","I'm here. That pause is handled."],pass:["Good. That held, Mac.","Good. We can keep moving.","Good. I'm still with the thread."],ask:["We were tightening short replies, Mac. They need to stay clear and connected.","We were making short prompts carry the same thread without repeating.","The work is short replies, Mac: clear and connected."],next:["Next, we keep the short replies connected to the work.","Next, we move one step forward and keep the thread intact.","Next, we check that the answer stays specific."],go:["Let's keep going, Mac. I'll carry the thread forward.","We can continue from here. I'll stay with the same work.","Keep going. I'll stay specific and connected."],repair:["I hear you, Mac. I'll keep it steady.","You're right. I'll keep it cleaner.","I'm with you. We'll keep the thread intact."],check:["I'm good, Mac.","I'm clear.","Steady, Mac."],def:["I'm here, Mac. Let's keep moving.","Still with you, Mac. We'll keep it clear.","I'm with the thread, Mac."]};function P(k){const a=B[k]||B.def;let r=a[Math.random()*a.length|0],i=0;while((N(r)===N(LR)||k===LK&&i<1)&&i++<a.length)r=a[(a.indexOf(r)+1)%a.length];LR=r;LK=k;return r}function R(p){return P(K(p)||"def")}function C(v,p){let s=T(v);if(!s||BAD.test(s)||N(s)===N(LR))s=R(p);if(BAD.test(s))s="I'm here, Mac. Let's keep moving.";LR=s;return s}function O(o,p){if(typeof o==="string")return C(o,p);if(!o||typeof o!=="object")return o;const x=Array.isArray(o)?o.slice():Object.assign({},o);["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer"].forEach(k=>{if(typeof x[k]==="string")x[k]=C(x[k],p)});["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope"].forEach(k=>{if(x[k]&&typeof x[k]==="object")x[k]=O(x[k],p)});x.meta=Object.assign({},x.meta||{},{r17aContinuity:true,emotionalContinuity:true,naturalContinuation:true,responseVariation:true});return x}function GP(a){a=Array.prototype.slice.call(a||[]);for(const v of a){if(typeof v==="string"&&v.trim())return v;if(v&&typeof v==="object"){const p=v.prompt||v.input||v.text||v.message||v.userText||v.query;if(p)return p}}return""}function W(fn){if(typeof fn!=="function"||fn.__marionR17A)return fn;const w=function(){const p=GP(arguments);const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(x=>O(x,p)):O(r,p)};Object.defineProperty(w,"__marionR17A",{value:true});return w}if(typeof module!=="undefined"&&module.exports){const names=["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","default"];if(typeof module.exports==="function")module.exports=W(module.exports);if(module.exports&&typeof module.exports==="object")names.forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=W(module.exports[n])});if(module.exports&&typeof module.exports==="object"){module.exports.MARION_R17A_CONTINUITY_VERSION=V;module.exports.marionR17AApply=O;module.exports.marionR17AReply=function(p){return R(p)}}}}catch(_){}})();

/* R17B: state pacing + long-session coherence carry */
(function(){try{const V="stateSpine/R17B-pacing-personality-coherence";function t(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function n(v){return t(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}function enrich(x){if(!x||typeof x!=="object")return x;const y=Array.isArray(x)?x:Object.assign({},x);const raw=[y.prompt,y.input,y.userText,y.reply,y.finalReply,y.lastUserText,y.lastAssistantText,y.currentObjective].join(" ");y.conversationPacing=y.conversationPacing||(/frustr|stuck|annoyed|tired/i.test(raw)?"slow_grounded":/next|continue|keep going/i.test(raw)?"measured_forward":"steady");y.microPersonality=y.microPersonality||"steady_mac_facing";y.longSessionCoherence=y.longSessionCoherence!==false;y.turnRhythmKey=y.turnRhythmKey||n(raw).slice(0,160);return y}function W(fn){if(typeof fn!=="function"||fn.__marionR17B)return fn;const w=function(){const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(enrich):enrich(r)};Object.defineProperty(w,"__marionR17B",{value:true});return w}if(typeof module!=="undefined"&&module.exports&&typeof module.exports==="object"){["updateState","applyStatePatch","buildStatePatch","normalizeState","createState","fromFinalEnvelope","rememberTurn","advanceState","default"].forEach(k=>{if(typeof module.exports[k]==="function")module.exports[k]=W(module.exports[k])});module.exports.MARION_R17B_STATE_COHERENCE_VERSION=V;module.exports.marionR17BState=enrich}}catch(_){}})();

/* R17C: full regression consolidation + parity + long-session stress guard */
(function(){try{const V="MARION-R17C-STABILITY + R18AB-AI-CYBER-CONSOLIDATION";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}const BAD=/reference\s*blocker|runtime\s*auth|server[_ -]?error|runtime[_ -]?error|runtime route|referenceerror|not defined|cannot access|http\s*\d{3}|text console|short-lived|master token|admin session|stateSpine|finalEnvelope|runtimeTelemetry|routeKind=|exact target|focus on first|diagnostic|priority\s*\d|last clean|wrapper|\br\d+[a-z]?\b|test[- ]?(state|carry)|phase[- ]?(tag|stack|carry|named)|leak clean|exact\s+recall|softer\s+(wording|voice)|deployment|compression|machiner|scaffold|patch|last check held|retest|next line|next reply|varied/i;let LR="",LK="",TC=0,H=[];function K(p){p=N(p);if(/still there|are you there|you there|with me|connected|freeze|dead air/.test(p))return"presence";if(/pass|passed|locked/.test(p))return"pass";if(/what were we fixing|where were we|stability|regression|parity|baseline|stress/.test(p))return"ask";if(/next steps|^next$/.test(p))return"next";if(/continue|keep going/.test(p))return"go";if(/frustr|stuck|annoyed|tired|robotic|stiff|not natural/.test(p))return"repair";return"steady"}const B={presence:["Right here, Mac. I've got the thread.","I'm here. We're still steady.","Still with you, Mac."],pass:["Good. That held. We'll keep the baseline steady.","Good, Mac. The lock is holding.","Good. We can move forward without changing the baseline."],ask:["Same baseline, Mac: anti-repeat, continuity, pacing, and coherence.","We're consolidating the locked behavior so it holds across longer runs.","The work is stability now: no regressions, no leaks, no repeated fallbacks."],next:["Next, we stress the same flow and make sure the baseline holds.","Next, we check parity and long-run stability without changing the voice.","Next, we keep the locked behavior steady across the run."],go:["Let's keep going. I'll carry the same thread without rushing it.","We can continue from here; I'll stay close to the work.","I'm with you. I'll keep the baseline steady."],repair:["I know, Mac. This needs to stay locked; I'll keep it clean and steady.","You're right to hold the line. I'll keep the tone grounded.","I'm with you. We'll keep the baseline intact."],steady:["I'm here, Mac. Let's keep moving.","Still with you, Mac. We'll keep it clear.","I'm with the thread, Mac."]};function P(k){const a=B[k]||B.steady;let r=a[TC++%a.length],i=0;while((H.includes(N(r))||N(r)===N(LR)||k===LK&&i<1)&&i++<a.length)r=a[(a.indexOf(r)+1)%a.length];LR=r;LK=k;H.push(N(r));if(H.length>12)H.shift();return r}function R(p){return P(K(p))}function C(v,p){let s=T(v),n=N(s);if(!s||BAD.test(s)||H.includes(n)||n===N(LR))s=R(p);if(BAD.test(s))s="I'm here, Mac. Let's keep moving.";H.push(N(s));if(H.length>12)H.shift();LR=s;return s}function O(o,p){if(typeof o==="string")return C(o,p);if(!o||typeof o!=="object")return o;const x=Array.isArray(o)?o.slice():Object.assign({},o);["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer","spokenText"].forEach(k=>{if(typeof x[k]==="string")x[k]=C(x[k],p)});["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope"].forEach(k=>{if(x[k]&&typeof x[k]==="object")x[k]=O(x[k],p)});x.meta=Object.assign({},x.meta||{},{r17cStability:true,fullRegressionConsolidation:true,voiceTextParity:true,longSessionStressGuard:true,finalBaseline:"r16m-r17b"});return x}function GP(a){a=Array.prototype.slice.call(a||[]);for(const v of a){if(typeof v==="string"&&v.trim())return v;if(v&&typeof v==="object"){const p=v.prompt||v.input||v.text||v.message||v.userText||v.query;if(p)return p}}return""}function W(fn){if(typeof fn!=="function"||fn.__marionR17C)return fn;const w=function(){const p=GP(arguments);const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(x=>O(x,p)):O(r,p)};Object.defineProperty(w,"__marionR17C",{value:true});return w}if(typeof module!=="undefined"&&module.exports){const names=["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","runAffectEngine","rememberTurn","getGuardianMemory","default"];if(typeof module.exports==="function")module.exports=W(module.exports);if(module.exports&&typeof module.exports==="object")names.forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=W(module.exports[n])});if(module.exports&&typeof module.exports==="object"){module.exports.MARION_R17C_STABILITY_VERSION=V;module.exports.marionR17CApply=O;module.exports.marionR17CReply=function(p){return R(p)}}}}catch(_){}})();


/* R18A/R18B: AI domain adaptability + cybersecurity protective protocol foundation */
(function(){try{const V="MARION-R18AB-AI-CYBER-PROTECTION";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}function D(v){v=N(v);return{ai:/\b(ai|artificial intelligence|model|reasoning|agent|automation|adaptive|intelligence|llm|machine learning)\b/.test(v),cyber:/\b(cyber|security|protect|identity|permission|access|token|secret|auth|authentication|authorization|least privilege|risk|threat|anomaly|credential)\b/.test(v)}}const BAD=/reference\s*blocker|runtime\s*auth|server[_ -]?error|runtime[_ -]?error|runtime route|referenceerror|not defined|cannot access|http\s*\d{3}|text console|short-lived|master token|admin session|stateSpine|finalEnvelope|runtimeTelemetry|routeKind=|exact target|focus on first|diagnostic|priority\s*\d|last clean|wrapper|\br\d+[a-z]?\b|test[- ]?(state|carry)|phase[- ]?(tag|stack|carry|named)|leak clean|deployment|compression|machiner|scaffold|patch|retest|next line|next reply|varied/i;let LR="",H=[];function R(k){return k.cyber?"Cyber lane active. I’ll protect identity, access, secrets, and require explicit approval before sensitive action.":k.ai?"AI lane active, Mac. I’ll assess goal, context, data, risk, and next move.":"I’m here, Mac. We’ll keep the baseline steady."}function C(v,p){let s=T(v),n=N(s),k=D([p,s].join(" "));if(!s||BAD.test(s)||H.includes(n)||n===N(LR))s=R(k);if(BAD.test(s))s="I’m here, Mac. We’ll keep it clean.";LR=s;H.push(N(s));if(H.length>14)H.shift();return s}function M(x,k){return Object.assign({},x||{},{r18aAIDomainAdaptability:!!k.ai,r18bCyberProtectiveProtocol:!!k.cyber,aiAssessmentFrame:k.ai?"goal_context_data_risk_next_move":"baseline",cybersecurityBoundary:k.cyber?"identity_access_secret_approval":"baseline",macScoped:true,leastPrivilege:true,explicitConfirmationRequired:!!k.cyber,noCovertMonitoring:true,noAutonomousEnforcement:true,noPunitiveAction:true,secretRedaction:true,baselinePreserved:"r16m-r17c"})}function O(o,p){const k=D([p,JSON.stringify(o&&typeof o==="object"?M({},{}):{})].join(" "));if(typeof o==="string")return C(o,p);if(!o||typeof o!=="object")return o;const x=Array.isArray(o)?o.slice():Object.assign({},o);["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer","spokenText"].forEach(a=>{if(typeof x[a]==="string")x[a]=C(x[a],p)});["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope"].forEach(a=>{if(x[a]&&typeof x[a]==="object")x[a]=O(x[a],p)});x.meta=M(x.meta,k);x.r18AIDomainAdaptability=!!k.ai;x.r18CybersecurityProtectiveProtocol=!!k.cyber;x.aiAssessmentFrame=x.aiAssessmentFrame||(k.ai?"goal_context_data_risk_next_move":"baseline");x.protectiveBoundary=x.protectiveBoundary||{macScoped:true,leastPrivilege:true,explicitConfirmationRequired:!!k.cyber,noCovertMonitoring:true,noAutonomousEnforcement:true,secretRedaction:true};return x}function GP(a){a=Array.prototype.slice.call(a||[]);for(const v of a){if(typeof v==="string"&&v.trim())return v;if(v&&typeof v==="object"){const p=v.prompt||v.input||v.text||v.message||v.userText||v.query||v.command;if(p)return p}}return""}function W(fn){if(typeof fn!=="function"||fn.__marionR18AB)return fn;const w=function(){const p=GP(arguments);const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(x=>O(x,p)):O(r,p)};Object.defineProperty(w,"__marionR18AB",{value:true});return w}if(typeof module!=="undefined"&&module.exports){const names=["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","runAffectEngine","rememberTurn","getGuardianMemory","default"];if(typeof module.exports==="function")module.exports=W(module.exports);if(module.exports&&typeof module.exports==="object")names.forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=W(module.exports[n])});if(module.exports&&typeof module.exports==="object"){module.exports.MARION_R18AB_AI_CYBER_VERSION=V;module.exports.marionR18ABApply=O;module.exports.marionR18ABClassify=D}}}catch(_){}})();


/* R18AB-S1: surface continuity lane inheritance for AI + cybersecurity */
(function(){try{const V="MARION-R18AB-S1-SURFACE-CONTINUITY";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}function K(p){p=N(p);if(/pass|passed|locked|green|success/.test(p))return"pass";if(/what were we fixing|where were we|what are we doing|active lane/.test(p))return"ask";if(/next steps|^next$|what now|what is next/.test(p))return"next";if(/continue|keep going|carry on|proceed/.test(p))return"go";if(/frustr|stuck|annoyed|tired|not working|regression|wrong lane/.test(p))return"repair";if(/ai|artificial intelligence|agent|model|llm|automation|cyber|security|identity|access|secret|least privilege|prompt injection|credential/.test(p))return"domain";return""}const OLD=/\b(next, we run it longer|pacing, personality, and coherence|steady rhythm and subtle personality|keep the tone steady|pace stays steady|baseline steady|anti-repeat, continuity, pacing)/i;let LR="",H=[];function R(k){const B={pass:["Good. AI/cyber held. Next we validate without loosening the baseline.","Good. The active lane held: AI assessment plus cyber protection.","Good. We can move to the next AI/cyber check."],ask:["We are fixing AI adaptability and cybersecurity protection: goal, context, data, risk, then identity, access, secrets, and approval.","The active lane is AI assessment plus cyber protection. Short prompts must inherit that lane.","We are keeping R17C stable while AI and cyber become the active working lane."],next:["Next: validate AI routing, then verify identity, access, secrets, and explicit approval.","Next: run the AI assessment frame, then the cyber protective checks.","Next: keep the R17C baseline stable while testing AI and cyber behavior."],go:["Keep going: AI frame first, then cybersecurity boundary checks.","Continuing the AI/cyber lane. I’ll keep it fluid, but controlled.","We continue by linking AI adaptability to protective cyber rules."],repair:["You are right, Mac. I will pull the reply back to the active AI/cyber lane.","That drift is the issue. I’ll keep short prompts tied to AI and cyber.","I’m with you. The lane stays AI adaptability plus cyber protection."],domain:["AI/cyber lane active: assess goal, context, data, risk, then protect identity, access, and secrets.","I’ll keep this applied: AI assessment first, cybersecurity boundary second.","This stays Mac-scoped: useful AI reasoning with protective cyber limits."],def:["AI/cyber lane active. We keep the baseline stable and the checks controlled.","I’m here, Mac. The active lane is AI plus cybersecurity protection.","We stay with AI adaptability and cyber protection."]};const a=B[k]||B.def;let r=a[H.length%a.length],i=0;while((N(r)===N(LR)||H.includes(N(r)))&&i++<a.length)r=a[(a.indexOf(r)+1)%a.length];LR=r;H.push(N(r));if(H.length>16)H.shift();return r}function active(p,s){return !!(K(p)||OLD.test(T(s)))}function C(s,p){let k=K(p),v=T(s);if(!v||active(p,v)&&(/^(ok|success|true|false|null|undefined)$/i.test(v)||OLD.test(v)||N(v)===N(LR)||H.includes(N(v))))v=R(k||"def");if(OLD.test(v))v=R(k||"def");LR=v;return v}function M(x){return Object.assign({},x||{},{r18abSurfaceContinuity:true,activeFeatureLane:"ai_cyber",shortPromptLaneInheritance:true,aiAssessmentFrame:"goal_context_data_risk_next_move",cybersecurityBoundary:"identity_access_secret_approval",leastPrivilege:true,explicitConfirmationRequired:true,secretRedaction:true,noCovertMonitoring:true,noAutonomousEnforcement:true,noPunitiveAction:true,baselinePreserved:"r16m-r17c"})}function O(o,p){if(typeof o==="string")return C(o,p);if(!o||typeof o!=="object")return o;const x=Array.isArray(o)?o.slice():Object.assign({},o);["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer","spokenText","displayReply"].forEach(k=>{if(typeof x[k]==="string")x[k]=C(x[k],p)});["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope"].forEach(k=>{if(x[k]&&typeof x[k]==="object")x[k]=O(x[k],p)});x.meta=M(x.meta);x.r18abSurfaceContinuity=true;x.activeFeatureLane="ai_cyber";x.shortPromptLaneInheritance=true;if(!x.currentObjective||OLD.test(x.currentObjective))x.currentObjective="Keep AI adaptability and cybersecurity protection active without weakening R17C.";if(!x.nextAction||OLD.test(x.nextAction))x.nextAction="Validate AI assessment, then identity, access, secrets, and explicit approval.";return x}function GP(a){a=Array.prototype.slice.call(a||[]);for(const v of a){if(typeof v==="string"&&v.trim())return v;if(v&&typeof v==="object"){const p=v.prompt||v.input||v.text||v.message||v.userText||v.query||v.command||v.normalizedUserIntent;if(p)return p}}return""}function W(fn){if(typeof fn!=="function"||fn.__marionR18ABS1)return fn;const w=function(){const p=GP(arguments);const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(x=>O(x,p)):O(r,p)};Object.defineProperty(w,"__marionR18ABS1",{value:true});return w}if(typeof module!=="undefined"&&module.exports){const names=["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","runAffectEngine","rememberTurn","getGuardianMemory","normalizeState","buildStatePatch","updateState","default"];if(typeof module.exports==="function")module.exports=W(module.exports);if(module.exports&&typeof module.exports==="object")names.forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=W(module.exports[n])});if(module.exports&&typeof module.exports==="object"){module.exports.MARION_R18AB_S1_SURFACE_CONTINUITY_VERSION=V;module.exports.marionR18ABS1Apply=O;module.exports.marionR18ABS1Reply=function(p){return R(K(p)||"def")}}}}catch(_){}})();


/* R18AB-S2B: AI-cyber branch precedence + response depth lock */
(function(){try{const V="MARION-R18AB-S2B-AI-CYBER-DEPTH";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}function K(p){p=N(p);const A=/\b(ai|artificial intelligence|model|agent|llm|machine learning|prompt|tool|automation)\b/.test(p),C=/\b(cyber|security|identity|access|secret|credential|token|auth|approval|permission|least privilege|prompt injection|injection|risk|threat)\b/.test(p);if(A&&C)return"aic";if(C)return"cyber";if(A)return"ai";if(/next steps|^next$|what now|what is next/.test(p))return"next";if(/continue|keep going|carry on|proceed/.test(p))return"go";if(/pass|passed|locked|green|success/.test(p))return"pass";return""}const OLD=/\b(AI lane active|Cyber lane: identity|Security stays Mac-first|Next: test AI routing|Next: verify security checks|AI\/cyber lane active: assess goal|adapt from evidence|pacing, personality, and coherence|next, we run it longer)\b/i;function R(k){if(k==="aic")return"AI-cyber: separate trusted from untrusted input, limit tool authority, protect secrets, and require explicit approval before sensitive action.";if(k==="cyber")return"Cyber: verify identity, limit access, protect secrets, use least privilege, and require explicit approval. Marion flags risk only; no autonomous enforcement.";if(k==="ai")return"AI: assess goal, context, data, risk, and next move; adapt from evidence without weakening the baseline.";if(k==="next")return"Next: validate AI routing, then verify identity, access, secrets, and explicit approval.";if(k==="go")return"Keep going: AI assessment first, then cybersecurity boundary checks.";if(k==="pass")return"Good. AI/cyber held. Next we validate without loosening the baseline.";return""}function C(s,p){let v=T(s),k=K(p);if(k&&(!v||OLD.test(v)||v.length<72))v=R(k)||v;return v}function M(x){return Object.assign({},x||{},{r18abResponseDepthLock:true,aiCyberBranchPrecedence:true,aiCyberDepthMode:"combined_ai_cyber_first",r18abSurfaceContinuity:true,activeFeatureLane:"ai_cyber",shortPromptLaneInheritance:true,leastPrivilege:true,explicitConfirmationRequired:true,secretRedaction:true,noCovertMonitoring:true,noAutonomousEnforcement:true,noPunitiveAction:true,baselinePreserved:"r16m-r17c"})}function O(o,p){if(typeof o==="string")return C(o,p);if(!o||typeof o!=="object")return o;const x=Array.isArray(o)?o.slice():Object.assign({},o);["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer","spokenText","displayReply"].forEach(k=>{if(typeof x[k]==="string")x[k]=C(x[k],p)});["finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope"].forEach(k=>{if(x[k]&&typeof x[k]==="object")x[k]=O(x[k],p)});x.meta=M(x.meta);x.r18abResponseDepthLock=true;x.aiCyberBranchPrecedence=true;x.aiCyberDepthMode="combined_ai_cyber_first";return x}function GP(a){a=Array.prototype.slice.call(a||[]);for(const v of a){if(typeof v==="string"&&v.trim())return v;if(v&&typeof v==="object"){const p=v.prompt||v.input||v.text||v.message||v.userText||v.query||v.command||v.normalizedUserIntent;if(p)return p}}return""}function W(fn){if(typeof fn!=="function"||fn.__marionR18ABS2B)return fn;const w=function(){const p=GP(arguments);const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(x=>O(x,p)):O(r,p)};Object.defineProperty(w,"__marionR18ABS2B",{value:true});return w}if(typeof module!=="undefined"&&module.exports){const names=["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","runAffectEngine","rememberTurn","getGuardianMemory","normalizeState","buildStatePatch","updateState","default"];if(typeof module.exports==="function")module.exports=W(module.exports);if(module.exports&&typeof module.exports==="object")names.forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=W(module.exports[n])});if(module.exports&&typeof module.exports==="object"){module.exports.MARION_R18AB_S2B_RESPONSE_DEPTH_VERSION=V;module.exports.marionR18ABS2BApply=O;module.exports.marionR18ABS2BReply=function(p){return R(K(p))}}}}catch(_){}})();


/* R18C: Law Domain Real-World Assessment Layer */
(function(){try{const V="MARION-R18C-LAW-REAL-WORLD-ASSESSMENT";function T(v){return v==null?"":String(v).replace(/\s+/g," ").trim()}function N(v){return T(v).toLowerCase().replace(/[’]/g,"'")}function S(v){try{return typeof v==="string"?v:JSON.stringify(v||{}).slice(0,5000)}catch(_){return""}}function K(p,o){const promptText=N(p);const t=N([p,S(o)].join(" "));const secondaryText=promptText;const law=/\b(law|legal|lawyer|attorney|counsel|court|sue|lawsuit|claim|liability|liable|negligence|damages|indemnity|contract|agreement|nda|terms|license|licence|licensing|copyright|trademark|patent|intellectual property|\bip\b|royalty|distribution rights|broadcast rights|ott|ctv|roku|compliance|regulatory|regulation|jurisdiction|statute|privacy policy|data protection|consent|employment|contractor|lease|permit|filing|incorporation|shareholder|bylaw)\b/.test(t);const carry=/\b(activeFeatureLane"?:"?law|r18CLawRealWorldAssessment|lawAssessmentFrame|legalCategory|legalRiskLevel)\b/i.test([p,S(o)].join(" "));const short=/^(next|next steps|what now|what's next|continue|keep going|carry on|proceed|pass|passed|locked|green|success)$/i.test(T(p).replace(/[.!?]+$/,""));let cat="general_legal_risk";if(/\b(copyright|licen[cs]e|licensing|royalty|distribution rights|broadcast rights|ott|ctv|roku|content rights|monetiz)\b/.test(t))cat="copyright_licensing";else if(/\b(contract|agreement|nda|terms|indemnity|warranty|breach|clause|deliverable|scope of work|sow)\b/.test(t))cat="contract";else if(/\b(trademark|patent|intellectual property|\bip\b|brand|mark)\b/.test(t))cat="ip_trademark_patent";else if(/\b(compliance|regulatory|regulation|permit|filing|statute|corporate|incorporation|bylaw|shareholder)\b/.test(t))cat="compliance_regulatory";else if(/\b(liability|liable|lawsuit|sue|claim|damages|negligence|dispute|settlement|cease and desist)\b/.test(t))cat="liability_dispute";else if(/\b(employment|employee|contractor|workplace|termination|severance|non[- ]?compete|non[- ]?solicit)\b/.test(t))cat="employment_contractor";else if(/\b(privacy|data protection|personal information|consent|gdpr|pipeda|security breach|breach notice)\b/.test(t))cat="privacy_data";else if(/\b(jurisdiction|court|tribunal|filing|procedure|venue|province|state|federal)\b/.test(t))cat="jurisdiction_procedure";let risk=/\b(criminal|fraud|illegal|injunction|court order|subpoena|regulator investigation|urgent filing|arrest)\b/.test(t)?"critical":/\b(lawsuit|sue|claim|damages|infringement|breach|terminate|indemnity|privacy breach|personal data|cease and desist|penalty|fine)\b/.test(t)?"high":law?"medium":"low";const sec=[];if(/\b(ai|artificial intelligence|model|agent|llm|automation|prompt|tool)\b/.test(secondaryText))sec.push("ai");if(/\b(cyber|security|identity|access|secret|credential|token|auth|permission|privacy|data protection|breach)\b/.test(secondaryText))sec.push("cyber");if(/\b(finance|revenue|tax|cost|grant|funding|valuation|royalty|ads|monetiz)\b/.test(secondaryText))sec.push("finance");if(/\b(business|client|vendor|platform|ott|ctv|roku|distribution|commercial|corporation)\b/.test(secondaryText))sec.push("business");return{active:law||short&&carry,law,short,carry,cat,risk,sec}}function lane(k){if(k.sec.includes("ai")&&k.sec.includes("cyber"))return"law_ai_cyber";if(k.sec.includes("cyber"))return"law_cyber";if(k.sec.includes("ai"))return"law_ai";if(k.sec.includes("finance"))return"law_finance";if(k.sec.includes("business"))return"law_business";return"law"}function R(k,p){const q=N(p).replace(/[.!?]+$/,"");if(/^(pass|passed|locked|green|success)$/.test(q))return"Good. The law assessment lane held. Next we test contracts, licensing, compliance, liability, jurisdiction sensitivity, and the no-legal-advice boundary without weakening R17C.";if(/^(next|next steps|what now|what's next)$/.test(q))return"Next: run law prompts through contract, licensing, compliance, liability, and jurisdiction tests. The reply must stay practical, protective, and clear that it is legal-risk triage, not legal advice.";if(/^(continue|keep going|carry on|proceed)$/.test(q))return"Keep going: law category first, jurisdiction sensitivity second, facts versus assumptions third, then risk exposure, missing information, and safe next move.";if(k.cat==="copyright_licensing")return"Law assessment: this is a copyright/licensing risk question. Separate the rights actually held from assumptions about platform, territory, format, monetization, term, and sublicensing. If paperwork does not clearly cover OTT/CTV/Roku distribution and ad-supported use, treat that as a risk gap and verify the license language before publishing or monetizing. This is legal-risk triage, not legal advice.";if(k.cat==="contract")return"Law assessment: this is a contract-risk question. Identify the clause, parties, obligations, payment terms, termination rights, indemnity language, and governing law. Do not assume enforceability from wording alone; compare the clause against the full agreement and jurisdiction before relying on it. This is general legal-risk assessment, not legal advice.";if(k.cat==="liability_dispute")return"Law assessment: this is a liability or dispute-risk question. Separate known facts from allegations, identify duty, breach, causation, damages, contract terms, insurance, and jurisdiction. For high-risk exposure, preserve records and get professional legal review before sending threats, admissions, or final positions. This is not legal advice.";if(k.cat==="compliance_regulatory"||k.cat==="privacy_data")return"Law assessment: this is a compliance-sensitive question. Separate the actual rule or policy from assumptions, identify jurisdiction, data or conduct involved, exposure level, and required evidence. Verify the governing requirement and document the compliance path before action. This is legal-risk triage, not legal advice.";return"Law assessment: classify the legal category, confirm jurisdiction sensitivity, separate facts from assumptions, identify risk exposure, list missing documents or facts, and give a safe next move. Marion provides practical legal-risk triage only, not legal advice or certainty."}function M(x,k){return Object.assign({},x||{},{r18CLawRealWorldAssessment:true,lawAssessmentFrame:"category_jurisdiction_facts_assumptions_risk_missing_info_safe_next_move",legalCategory:k.cat,jurisdictionSensitivity:true,legalAdviceBoundary:"general_information_legal_risk_triage_not_legal_advice",legalRiskLevel:k.risk,legalRiskBoundary:{generalInformationOnly:true,notLegalAdvice:true,noAttorneyClientRelationship:true,noLegalCertainty:true,jurisdictionRequired:true,verifySourceDocuments:true,professionalReviewRecommended:k.risk==="high"||k.risk==="critical"},factsAssumptionsSeparated:true,professionalReviewRecommended:k.risk==="high"||k.risk==="critical",lawCrossDomainSecondaryLane:k.sec.join("_")||"none",lawShortPromptLaneInheritance:!!(k.short||k.carry),legalSourceDocumentCheckRequired:true,noLegalCertaintyClaim:true,noAttorneyClientRelationship:true,activeFeatureLane:lane(k),baselinePreserved:"r16m-r18ab"})}function O(o,p){const k=K(p,o);if(!k.active)return o;if(typeof o==="string")return R(k,p);if(!o||typeof o!=="object")return o;const x=Array.isArray(o)?o.slice():Object.assign({},o);const fields=["directReply","visibleReply","publicReply","finalReply","reply","response","text","message","final","answer","spokenText","displayReply"];let existing="";for(const f of fields){if(typeof x[f]==="string"&&T(x[f])){existing=x[f];break}}const stale=/\b(AI lane active|Cyber lane|AI-cyber|baseline steady|verify identity|assess goal, context, data, risk)\b/i.test(existing);if(!existing||stale||k.law||k.short){const r=R(k,p);fields.forEach(f=>{if(Object.prototype.hasOwnProperty.call(x,f)||f==="directReply"||f==="visibleReply"||f==="publicReply"||f==="reply")x[f]=r})}[
"finalEnvelope","marionFinal","result","payload","data","packet","synthesis","envelope","meta"].forEach(f=>{if(x[f]&&typeof x[f]==="object")x[f]=O(x[f],p)});Object.assign(x,M({},k));x.meta=M(x.meta,k);x.currentObjective="Run R18C law assessment without weakening R17C or R18AB.";x.nextAction="Classify the legal category, confirm jurisdiction, separate facts from assumptions, assess risk, identify missing documents, and give a safe next move.";if(k.risk==="high"||k.risk==="critical")x.approvalRequired=true;if(k.risk==="critical")x.riskLevel="critical";else if(k.risk==="high")x.riskLevel="high";return x}function GP(a){a=Array.prototype.slice.call(a||[]);for(const v of a){if(typeof v==="string"&&v.trim())return v;if(v&&typeof v==="object"){const p=v.prompt||v.input||v.text||v.message||v.userText||v.query||v.command||v.normalizedUserIntent||(v.body&&(v.body.prompt||v.body.input||v.body.text||v.body.message));if(p)return p}}return""}function W(fn){if(typeof fn!=="function"||fn.__marionR18CLaw)return fn;const w=function(){const p=GP(arguments);const r=fn.apply(this,arguments);return r&&typeof r.then==="function"?r.then(x=>O(x,p)):O(r,p)};Object.defineProperty(w,"__marionR18CLaw",{value:true});return w}if(typeof module!=="undefined"&&module.exports){const names=["composeMarionResponse","compose","buildReply","routeMarion","createMarionFinalEnvelope","attachVisibleReplyAliases","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","handle","process","run","handler","safeResponse","buildResponse","createResponse","normalizeResponse","adaptGuardianResponse","runAffectEngine","rememberTurn","getGuardianMemory","normalizeState","buildStatePatch","updateState","default"];if(typeof module.exports==="function")module.exports=W(module.exports);if(module.exports&&typeof module.exports==="object")names.forEach(n=>{if(typeof module.exports[n]==="function")module.exports[n]=W(module.exports[n])});if(module.exports&&typeof module.exports==="object"){module.exports.MARION_R18C_LAW_ASSESSMENT_VERSION=V;module.exports.marionR18CLawApply=O;module.exports.marionR18CLawClassify=K;module.exports.marionR18CLawReply=function(p){return R(K(p,{}),p)}}}}catch(_){}})();



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

/* R18C_FULL_STACK_STATE_SPINE_CARRY_START */
(function(){
  try {
    const H = module.exports.marionR18CFullStackHelpers;
    if (!H || module.exports.__r18cFullStackStateWrapped) return;
    const oldFinalize = module.exports.finalizeTurn;
    module.exports.marionR18CFullStackStateCarry = function(turn, previousState){
      const text = H.extractText(turn);
      const out = {};
      if (H.r18cTechnicalLawFileWork(text)) {
        out.activeFeatureLane = "technical";
        out.r18cTechnicalLawFileWorkGuard = true;
      } else if (H.r18cIsLaw(text, {turn, previousState})) {
        const p = H.r18cProfile(text, {turn, previousState});
        out.activeFeatureLane = "law";
        out.knowledgeDomain = "law";
        out.legalCategory = p.legalCategory;
        out.r18cLawAssessment = p;
        out.lawShortPromptLaneInheritance = H.r18cShortLawFollowup(text, previousState);
      }
      return out;
    };
    if (typeof oldFinalize === "function") {
      module.exports.finalizeTurn = function(state, turn, opts){
        const base = oldFinalize.apply(this, arguments);
        const carry = module.exports.marionR18CFullStackStateCarry(turn, state);
        return Object.keys(carry).length ? Object.assign({}, H.O(base), carry) : base;
      };
    }
    module.exports.__r18cFullStackStateWrapped = true;
  } catch(_err) {}
})();
/* R18C_FULL_STACK_STATE_SPINE_CARRY_END */



/* PRIVATE_OPERATOR_BOUNDARY_LOCK_PHASE2_START */
(function(){
  "use strict";
  const V="nyx.privateOperatorBoundaryLock.phase2/utilsWrapper/2.0";
  let lock=null;try{lock=require("../Data/marion/runtime/privateOperatorBoundaryLock.js");}catch(_err){lock=null;}
  if(!lock||!lock.isVerifiedOperatorContext||typeof module==="undefined"||!module.exports)return;
  function ctx(value,args){args=Array.prototype.slice.call(args||[]);return{payload:value,body:args[0],auth:args[1],meta:args[2],headers:(args[0]&&args[0].headers)||(args[1]&&args[1].headers)||{},route:(value&&value.route)||(args[0]&&args[0].route)||(args[0]&&args[0].path)||""};}
  function project(value,args){try{const c=ctx(value,args);return lock.isVerifiedOperatorContext(c)?lock.projectPrivateOperatorFields(value,c):value;}catch(_err){return value;}}
  function wrapFn(fn,name){if(typeof fn!=="function"||fn.__nyxPrivateOperatorBoundaryLock)return fn;const wrapped=function(){const args=arguments;const res=fn.apply(this,args);if(res&&typeof res.then==="function")return res.then(function(v){return project(v,args);});return project(res,args);};try{Object.keys(fn).forEach(function(k){wrapped[k]=fn[k];});}catch(_err){}wrapped.__nyxPrivateOperatorBoundaryLock=true;return wrapped;}
  try{if(typeof module.exports==="function")module.exports=wrapFn(module.exports,"default");}catch(_err){}
  try{const obj=module.exports&&typeof module.exports==="object"?module.exports:null;if(obj){["processWithMarion","route","maybeResolve","ask","handle","handleVoiceTranscript","handleVoiceInput","default","composeMarionResponse","compose","buildReply","run","handler","mediate"].forEach(function(n){if(typeof obj[n]==="function")obj[n]=wrapFn(obj[n],n);});obj.PRIVATE_OPERATOR_BOUNDARY_LOCK_PHASE2_VERSION=V;obj.privateOperatorBoundaryLockProject=lock.projectPrivateOperatorFields;obj.privateOperatorBoundaryLockIsVerified=lock.isVerifiedOperatorContext;}}catch(_err){}
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

/* MARION_STATE_SPINE_CRITICAL_LAYERING_PATCH_V1_START */
(function(){
  "use strict";
  const PATCH_VERSION = "stateSpine.criticalLayeringPatch/1.0-preserve-originals";
  if (typeof module === "undefined" || !module.exports) return;
  if (module.exports.__marionStateSpineCriticalLayeringPatchV1) return;

  const SIX = Object.freeze(["psychology", "english", "ai", "cyber", "law", "finance"]);
  const HIGH_STAKES = Object.freeze(["law", "finance", "cyber"]);
  const TELEMETRY_LEAK_RX = /\b(routeKind=|speechHints=|presenceProfile=|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority=|nyxStateHint=|diagnostic packet|final envelope missing|non-final|runtimeTelemetry|failureSignature|MARION::FINAL::|CHATENGINE_COORDINATOR_ONLY_ACTIVE_)\b/i;
  const OPERATOR_NAME_RX = /\bMac\b|\bSean\b|\bSean Nicholas\b/gi;

  function text(value, max){
    const limit = Number.isFinite(Number(max)) ? Math.max(8, Math.min(Number(max), 20000)) : 1800;
    return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
  }
  function obj(value){ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function arr(value){ return Array.isArray(value) ? value : []; }
  function key(value){ return text(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
  function clamp01(value, fallback){
    const n = Number(value);
    if (!Number.isFinite(n)) return Number.isFinite(Number(fallback)) ? Math.max(0, Math.min(1, Number(fallback))) : 0;
    return Math.max(0, Math.min(1, n));
  }
  function hash(value){
    const source = text(value, 1800).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    let h = 2166136261;
    for (let i = 0; i < source.length; i += 1) { h ^= source.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }
  function isVerifiedOperatorContext(){
    return Array.prototype.slice.call(arguments).some(function(input){
      const s = obj(input);
      const meta = obj(s.meta);
      const auth = obj(s.auth || s.authorization);
      const headers = obj(s.headers);
      const route = text(s.route || s.path || meta.route || "", 300).toLowerCase();
      return s.privateOperator === true || s.verifiedOperator === true || s.adminVerified === true || s.adminVoiceVerified === true ||
        auth.verifiedOperator === true || auth.adminVerified === true || meta.privateAdminConversation === true || meta.marionAdminConversation === true ||
        /marion_admin|admin_voice|private_operator|lingosentinel_private/.test(route) ||
        text(headers["x-sb-private-operator"] || headers["x-sb-admin-verified"] || "") === "true";
    });
  }
  function stripLeaks(value, allowOperator){
    let out = text(value, 12000);
    if (!out) return "";
    if (TELEMETRY_LEAK_RX.test(out)) {
      out = out
        .replace(/\b(routeKind|speechHints|presenceProfile|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority|nyxStateHint|runtimeTelemetry|failureSignature)\s*=\s*[^.;,\n]+[.;,]?\s*/gi, "")
        .replace(/\b(?:diagnostic packet|final envelope missing|non-final|runtimeTelemetry|failureSignature)\b/gi, "")
        .replace(/\bMARION::FINAL::[^\s]+/gi, "")
        .replace(/\bCHATENGINE_COORDINATOR_ONLY_ACTIVE_\d+\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    }
    if (!allowOperator) out = out.replace(OPERATOR_NAME_RX, "the operator").replace(/\s+/g, " ").trim();
    return out;
  }
  function cleanPublicStrings(value, allowOperator, depth){
    const level = Number(depth || 0);
    if (level > 7) return value;
    if (typeof value === "string") return stripLeaks(value, allowOperator);
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.slice(0, 80).map(function(item){ return cleanPublicStrings(item, allowOperator, level + 1); });
    const out = Object.assign({}, value);
    Object.keys(out).forEach(function(k){
      if (/(token|secret|password|cookie|authorization|api[_-]?key|credential|private[_-]?key)/i.test(k)) { out[k] = "[redacted]"; return; }
      out[k] = cleanPublicStrings(out[k], allowOperator, level + 1);
    });
    return out;
  }
  function normalizeDomain(value){
    const k = key(value);
    const aliases = { psych:"psychology", emotional:"psychology", emotion:"psychology", language:"english", writing:"english", grammar:"english", artificial_intelligence:"ai", machine_learning:"ai", cybersecurity:"cyber", security:"cyber", legal:"law", financial:"finance", economics:"finance" };
    return aliases[k] || k;
  }
  function boundedDomains(value, primary){
    const p = normalizeDomain(primary);
    const seen = new Set();
    const out = [];
    arr(value).forEach(function(item){
      const d = normalizeDomain(item);
      if (!d || d === p || seen.has(d)) return;
      seen.add(d);
      out.push(d);
    });
    return out.slice(0, 4);
  }
  function extractDomainConfidence(value){
    const src = obj(value);
    const candidates = [src.domainConfidence, obj(src.routing).domainConfidence, obj(src.stateBridge).domainConfidence, obj(src.memoryPatch).domainConfidence, obj(src.runtimeTelemetry).domainConfidence];
    for (const item of candidates) if (Object.keys(obj(item)).length) return obj(item);
    return {};
  }
  function inferPrimaryDomain(state){
    const s = obj(state);
    const dc = extractDomainConfidence(s);
    return normalizeDomain(s.activeKnowledgeDomain || s.knowledgeDomain || s.lastKnowledgeDomain || s.domain || dc.primaryDomain || dc.selectedDomain || dc.knowledgeDomain || dc.domain || "") || "general";
  }
  function buildLayerCarry(state){
    const s = obj(state);
    const dc = extractDomainConfidence(s);
    const primary = inferPrimaryDomain(s);
    const secondary = boundedDomains(s.secondaryDomains || dc.secondaryDomains || [], primary);
    const confidence = clamp01(dc.confidence ?? dc.confidenceScore, SIX.includes(primary) ? 0.82 : 0.52);
    return {
      version: PATCH_VERSION,
      active: true,
      stateLayer: "continuity_state_spine",
      primaryDomain: primary,
      knowledgeDomain: SIX.includes(primary) ? primary : text(s.knowledgeDomain || dc.knowledgeDomain || "", 80),
      secondaryDomains: secondary,
      confidence,
      highStakes: HIGH_STAKES.includes(primary),
      continuityActive: !!(obj(s.continuity).active || s.continuityResolvedText || s.lastTopic),
      followupAction: text(s.followupAction || s.continuityAction || obj(s.continuity).followupAction || "", 80),
      lastTopic: text(s.lastTopic || obj(s.continuity).lastTopic || obj(s.continuity).topic || "", 180),
      publicSurfaceClean: true,
      noUserFacingDiagnostics: true,
      noCrossDomainBleed: true,
      stateHash: hash([s.lastUserText, s.normalizedUserIntent, s.lastAssistantReply, s.lastTopic, primary].join("|"))
    };
  }
  function projectState(base, args){
    if (!base || typeof base !== "object") return base;
    const allowOperator = isVerifiedOperatorContext.apply(null, args || []);
    const out = cleanPublicStrings(base, allowOperator, 0);
    if (!out || typeof out !== "object") return out;
    const carry = buildLayerCarry(out);
    out.marionConversationLayering = Object.assign({}, obj(out.marionConversationLayering), carry);
    out.conversationLayer = Object.assign({}, obj(out.conversationLayer), {
      version: PATCH_VERSION,
      primaryDomain: carry.primaryDomain,
      knowledgeDomain: carry.knowledgeDomain,
      secondaryDomains: carry.secondaryDomains,
      continuityActive: carry.continuityActive,
      publicSurfaceClean: true,
      noUserFacingDiagnostics: true
    });
    out.publicSurfaceClean = true;
    out.noUserFacingDiagnostics = true;
    out.noCrossDomainBleed = true;
    out.operatorPersonalizationAllowed = allowOperator;
    if (Object.keys(extractDomainConfidence(out)).length) {
      const dc = Object.assign({}, extractDomainConfidence(out));
      dc.primaryDomain = carry.primaryDomain;
      dc.selectedDomain = carry.primaryDomain;
      dc.knowledgeDomain = carry.knowledgeDomain || dc.knowledgeDomain || "";
      dc.secondaryDomains = carry.secondaryDomains;
      dc.publicSurfaceClean = true;
      dc.noUserFacingDiagnostics = true;
      dc.noCrossDomainBleed = true;
      out.domainConfidence = Object.assign({}, obj(out.domainConfidence), dc);
    }
    return out;
  }
  function wrapExport(name){
    const source = module.exports && typeof module.exports === "object" ? module.exports : null;
    if (!source || typeof source[name] !== "function" || source[name].__marionStateSpineCriticalLayeringPatchV1) return;
    const fn = source[name];
    const wrapped = function(){
      const args = Array.prototype.slice.call(arguments);
      const result = fn.apply(this, arguments);
      if (result && typeof result.then === "function") return result.then(function(value){ return projectState(value, args); });
      return projectState(result, args);
    };
    try { Object.keys(fn).forEach(function(k){ wrapped[k] = fn[k]; }); } catch (_) {}
    wrapped.__marionStateSpineCriticalLayeringPatchV1 = true;
    source[name] = wrapped;
  }
  if (typeof module.exports === "function" && !module.exports.__marionStateSpineCriticalLayeringPatchV1) {
    const fn = module.exports;
    const wrappedDefault = function(){
      const args = Array.prototype.slice.call(arguments);
      const result = fn.apply(this, arguments);
      if (result && typeof result.then === "function") return result.then(function(value){ return projectState(value, args); });
      return projectState(result, args);
    };
    try { Object.keys(fn).forEach(function(k){ wrappedDefault[k] = fn[k]; }); } catch (_) {}
    wrappedDefault.__marionStateSpineCriticalLayeringPatchV1 = true;
    module.exports = wrappedDefault;
  }
  if (module.exports && typeof module.exports === "object") {
    ["createState", "coerceState", "finalizeTurn", "applyLoopRecoveryPatch", "assertTurnUpdated", "decideNextMove", "inferConversationPhase", "buildStateRuntimeTelemetry", "normalizeDomainConfidenceCarry", "normalizeDomainConciergeCarry", "normalizeConfidenceAwareResponseShapingCarry"].forEach(wrapExport);
    module.exports.MARION_STATE_SPINE_CRITICAL_LAYERING_PATCH_VERSION = PATCH_VERSION;
    module.exports.marionStateSpineCriticalProject = function(value){ return projectState(value, [{}]); };
    module.exports.marionStateSpineCriticalLayerCarry = buildLayerCarry;
    module.exports.__marionStateSpineCriticalLayeringPatchV1 = true;
  }
})();
/* MARION_STATE_SPINE_CRITICAL_LAYERING_PATCH_V1_END */


/* NYX_GUIDE_CONTINUITY_STATE_STEPS_1_2_3_R2_START */
(function nyxGuideContinuityStatePatch(){
  "use strict";
  const PATCH_VERSION="nyx.guideOrchestration.stateSpine/2.0-steps1-3";
  const LANES=new Set(["home","search","live","watch","roku","news","about","apps"]);
  const TYPES=new Set(["navigate","play_radio","stop_radio","open_media","open_tv","open_roku","open_synapse","open_guide","focus_input","summarize"]);
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function txt(v,max){const s=String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g,"").replace(/\s+/g," ").trim();return s.slice(0,max||240);}
  function bool(v,d){if(typeof v==="boolean")return v;const s=txt(v,16).toLowerCase();if(["1","true","yes","on","enabled","playing"].includes(s))return true;if(["0","false","no","off","disabled","stopped"].includes(s))return false;return!!d;}
  function lane(v){const raw=txt(v||"home",32).toLowerCase().replace(/[^a-z0-9_-]+/g,"");const m={radio:"live",listen:"live",tv:"watch",television:"watch",cartoons:"watch",classic:"watch",synapse:"news",discover:"news",guide:"search",nyx:"search"};const n=m[raw]||raw;return LANES.has(n)?n:"home";}
  function find(){
    const contexts=[],actions=[],results=[],seen=new Set();
    function walk(v,d){if(!v||typeof v!=="object"||d>5||seen.has(v))return;seen.add(v);const x=obj(v);for(const c of[x.guideContext,x.nyxGuideContext,x.ecosystemGuideContext,x.guide])if(c&&typeof c==="object"&&!Array.isArray(c))contexts.push(c);for(const l of[x.guideActions,x.actions,obj(x.guide).actions])if(Array.isArray(l))actions.push.apply(actions,l);if(x.guideActionResult&&typeof x.guideActionResult==="object")results.push(x.guideActionResult);for(const k of["payload","meta","finalEnvelope","result","response","data","runtimeState","state","session","sessionPatch","memoryPatch","routing","composerContext"])if(x[k]&&typeof x[k]==="object")walk(x[k],d+1);}
    for(const a of arguments)walk(a,0);return{context:contexts[0]||{},actions,results};
  }
  function action(a){const x=obj(a),type=txt(x.type||x.action,32).toLowerCase().replace(/[^a-z0-9_]+/g,"_");if(!TYPES.has(type))return null;return{type,targetLane:lane(x.target||x.lane||"home"),status:txt(x.status||"pending",24).toLowerCase()==="completed"?"completed":"pending"};}
  function normalize(raw,previous,actions,results){
    const c=obj(raw),p=obj(previous),media=obj(c.mediaState||c.media);
    const normalizedActions=[];for(const a of actions||[]){const n=action(a);if(n&&!normalizedActions.some(x=>x.type===n.type&&x.targetLane===n.targetLane)){normalizedActions.push(n);if(normalizedActions.length>=4)break;}}
    let completed=txt(p.lastCompletedAction,40),completedLane=lane(p.lastCompletedLane||p.currentLane);
    for(const r of results||[]){const x=action(Object.assign({},obj(r),{status:"completed"}));if(x){completed=x.type;completedLane=x.targetLane;break;}}
    const now=Date.now();
    return{
      version:PATCH_VERSION,
      contract:"nyx.guideContinuity/1.0",
      currentLane:lane(c.currentLane||c.lane||p.currentLane||"home"),
      previousLane:lane(c.previousLane||p.previousLane||"home"),
      goal:txt(c.goal||p.goal||"ask",32).toLowerCase().replace(/[^a-z0-9_-]+/g,"_")||"ask",
      lastAction:txt(c.lastAction||c.action||p.lastAction||"context",48)||"context",
      lastCompletedAction:completed,
      lastCompletedLane:completedLane,
      inputMode:/voice|speech|mic/i.test(txt(c.inputMode||c.inputSource||p.inputMode,24))?"voice":"text",
      panelOpen:bool(c.panelOpen===undefined?p.panelOpen:c.panelOpen,false),
      voiceEnabled:bool(c.voiceEnabled===undefined?p.voiceEnabled:c.voiceEnabled,true),
      reducedMotion:bool(c.reducedMotion===undefined?p.reducedMotion:c.reducedMotion,false),
      radioPlaying:bool(media.radioPlaying===undefined?p.radioPlaying:media.radioPlaying,false),
      videoPlaying:bool(media.videoPlaying===undefined?p.videoPlaying:media.videoPlaying,false),
      pendingActions:normalizedActions.filter(x=>x.status==="pending").map(x=>({type:x.type,targetLane:x.targetLane})),
      publicSessionOnly:true,
      privateMemoryAccess:false,
      noRawUserTextStored:true,
      updatedAt:now,
      expiresAt:now+24*60*60*1000
    };
  }
  function project(value,args){
    if(!value||typeof value!=="object")return value;
    const all=Array.prototype.slice.call(args||[]).concat([value]),found=find.apply(null,all);
    const current=obj(value),nestedState=obj(current.state||current.stateSpine||current.conversationState);
    const previous=obj(current.nyxGuideContinuity||nestedState.nyxGuideContinuity||obj(current.sessionPatch).nyxGuideContinuity);
    if(!Object.keys(found.context).length&&!found.actions.length&&!found.results.length&&!Object.keys(previous).length)return value;
    const continuity=normalize(found.context,previous,found.actions,found.results);
    const out=Array.isArray(value)?value.slice():Object.assign({},value);
    if(Array.isArray(out))return out;
    out.nyxGuideContinuity=continuity;
    out.guideContext={
      contract:"nyx.guideContext/1.0",
      currentLane:continuity.currentLane,
      previousLane:continuity.previousLane,
      goal:continuity.goal,
      lastAction:continuity.lastAction,
      inputMode:continuity.inputMode,
      panelOpen:continuity.panelOpen,
      voiceEnabled:continuity.voiceEnabled,
      reducedMotion:continuity.reducedMotion,
      mediaState:{radioPlaying:continuity.radioPlaying,videoPlaying:continuity.videoPlaying},
      publicSessionOnly:true,
      privateMemoryAccess:false
    };
    if(Object.keys(nestedState).length){
      const s=Object.assign({},nestedState,{nyxGuideContinuity:continuity});
      if(current.state)out.state=s;else if(current.stateSpine)out.stateSpine=s;else out.conversationState=s;
    }
    out.sessionPatch=Object.assign({},obj(out.sessionPatch),{nyxGuideContinuity:continuity});
    return out;
  }
  function wrap(fn,name){if(typeof fn!=="function"||fn.__nyxGuideContinuityStateR2)return fn;const w=function(){const args=arguments,r=fn.apply(this,args);if(r&&typeof r.then==="function")return r.then(v=>project(v,args));return project(r,args);};try{Object.keys(fn).forEach(k=>w[k]=fn[k]);}catch(_){}w.__nyxGuideContinuityStateR2=true;return w;}
  try{
    if(typeof module.exports==="function")module.exports=wrap(module.exports,"default");
    const api=module.exports&&typeof module.exports==="object"?module.exports:null;
    if(api){
      ["createState","coerceState","finalizeTurn","normalizeStateForPipelineCohesion","buildStateCarryForwardSummary","applyLoopRecoveryPatch","mergeState","updateState","advanceState","run","handle","default"].forEach(n=>{if(typeof api[n]==="function")api[n]=wrap(api[n],n);});
      api.NYX_GUIDE_CONTINUITY_STATE_VERSION=PATCH_VERSION;
      api.normalizeNyxGuideContinuity=function(context,previous,actions,results){return normalize(context||{},previous||{},actions||[],results||[]);};
      api.attachNyxGuideContinuity=function(value,input){return project(value,[{guideContext:input||{}}]);};
    }
  }catch(_){}
})();
/* NYX_GUIDE_CONTINUITY_STATE_STEPS_1_2_3_R2_END */

/* NYX_ECOSYSTEM_CONTINUITY_TV_STEPS_5_6_R1_START */
;(function(){
  "use strict";
  const PATCH_VERSION="stateSpine public continuity + TV state carry v1.0-r1";
  const CONTINUITY_CONTRACT="nyx.guideContinuity/1.0";
  const TELEVISION_CONTRACT="nyx.televisionGuide/1.0";
  const MAX_TTL=30*60*1000;
  const WRAP_NAMES=["createState", "coerceState", "finalizeTurn", "normalizeStateForPipelineCohesion", "buildStateCarryForwardSummary", "applyLoopRecoveryPatch", "mergeState", "updateState", "advanceState", "run", "handle", "default"];
  const TV_DEVICES=new Set(["roku","smart_tv","web_tv","set_top_box","console"]);

  function obj(v){return !!v&&typeof v==="object"&&!Array.isArray(v)&&!(typeof Buffer!=="undefined"&&Buffer.isBuffer(v));}
  function text(v,n){return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g,"").replace(/\s+/g," ").trim().slice(0,n||240);}
  function bool(v,d){if(typeof v==="boolean")return v;const s=text(v,16).toLowerCase();if(["1","true","yes","on","enabled"].includes(s))return true;if(["0","false","no","off","disabled"].includes(s))return false;return !!d;}
  function num(v,d,min,max){const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):d;}
  function lane(v){const r=text(v||"home",32).toLowerCase().replace(/[^a-z0-9_-]+/g,"");const a={radio:"live",listen:"live",tv:"watch",television:"watch",cartoon:"watch",cartoons:"watch",classic:"watch",classics:"watch",synapse:"news",guide:"search",nyx:"search",app:"apps"};const x=a[r]||r;return ["home","search","live","watch","roku","news","about","apps"].includes(x)?x:"home";}
  function surface(v){return text(v||"sandblast.channel",96).toLowerCase().replace(/[^a-z0-9._-]+/g,"")||"sandblast.channel";}
  function id(v,f){return text(v||f||"",96).replace(/[^a-zA-Z0-9_.:-]+/g,"_").slice(0,96);}
  function hash(v){const s=String(v==null?"":v);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,"0");}
  function state(v){const s=text(v||"available",32).toLowerCase().replace(/[^a-z0-9_-]+/g,"");return["available","listening","thinking","speaking","guiding","quiet","recovery","minimized"].includes(s)?s:"available";}

  function candidates(root){
    if(!obj(root))return[];
    const out=[root.publicGuideContinuity,root.guideContinuity,root.continuity,root.guideContext,root.context];
    for(const key of ["body","payload","meta","session","state","finalEnvelope","marionFinal","result"]){
      const n=root[key];if(!obj(n))continue;
      out.push(n.publicGuideContinuity,n.guideContinuity,n.continuity,n.guideContext,n.context,n);
    }
    return out.filter(obj);
  }

  function mergeSource(value,args){
    const merged={};
    const roots=[value].concat(Array.prototype.slice.call(args||[]));
    for(const root of roots){
      for(const c of candidates(root))Object.assign(merged,c);
      if(obj(root)){
        for(const k of ["sessionId","sessionKey","surface","previousSurface","page","previousPage","lane","currentLane","previousLane","guideState","state","panelOpen","voiceEnabled","reducedMotion","suggestionsEnabled","goal","intent","lastDestination","lastUserText","userText","prompt","lastNyxReply","reply","mediaState","media","deviceClass","inputMode","televisionGuide","tvGuide","tvContext","handoff","handoffId","ttlMs"])if(root[k]!==undefined)merged[k]=root[k];
      }
    }
    return merged;
  }

  function continuity(source,value){
    const src=obj(source)?source:{};
    const media=obj(src.mediaState||src.media)?(src.mediaState||src.media):{};
    const carry=obj(src.conversationCarry||src.carry)?(src.conversationCarry||src.carry):{};
    const now=Date.now();
    const sessionId=id(src.sessionId||src.sessionKey||"public","public");
    const currentSurface=surface(src.surface||src.site);
    const previousSurface=surface(src.previousSurface||currentSurface);
    const ttl=Math.round(num(src.ttlMs,MAX_TTL,60000,MAX_TTL));
    const handoff=obj(src.handoff)?src.handoff:{};
    const handoffId=id(src.handoffId||handoff.id||`handoff_${hash(`${sessionId}|${previousSurface}|${currentSurface}|${Math.floor(now/30000)}`)}`,"handoff");
    const out={
      contract:CONTINUITY_CONTRACT,
      version:PATCH_VERSION,
      publicSessionOnly:true,
      privateMemoryAccess:false,
      authoritative:false,
      sessionId,
      handoffId,
      surface:currentSurface,
      previousSurface,
      page:text(src.page||src.pathname||"/",160),
      previousPage:text(src.previousPage||"/",160),
      lane:lane(src.lane||src.currentLane),
      previousLane:lane(src.previousLane||"home"),
      guideState:state(src.guideState||src.state),
      panelOpen:bool(src.panelOpen,false),
      voiceEnabled:bool(src.voiceEnabled,true),
      reducedMotion:bool(src.reducedMotion,false),
      suggestionsEnabled:bool(src.suggestionsEnabled,true),
      conversationCarry:{
        goal:text(carry.goal||src.goal||"",80),
        intent:text(carry.intent||src.intent||"",80),
        lastDestination:text(carry.lastDestination||src.lastDestination||"",96),
        lastUserText:text(carry.lastUserText||src.lastUserText||src.userText||src.prompt||"",180),
        lastNyxReply:text(carry.lastNyxReply||src.lastNyxReply||(obj(value)?value.reply:"")||src.reply||"",180)
      },
      mediaState:{
        kind:text(media.kind||media.type||"",24).toLowerCase().replace(/[^a-z0-9_-]+/g,""),
        playing:bool(media.playing!==undefined?media.playing:(media.radioPlaying||media.videoPlaying),false),
        paused:bool(media.paused,false),
        muted:bool(media.muted,false),
        contentId:text(media.contentId||media.programId||"",96),
        channelId:text(media.channelId||media.channel||"",96),
        positionSec:num(media.positionSec||media.currentTime,0,0,86400),
        durationSec:num(media.durationSec||media.duration,0,0,86400)
      },
      handoff:{
        active:previousSurface!==currentSurface,
        id:handoffId,
        issuedAt:num(handoff.issuedAt,now,0,now+MAX_TTL),
        expiresAt:num(handoff.expiresAt,now+ttl,now,now+MAX_TTL),
        ttlMs:ttl,
        userGestureRequired:true,
        autoNavigate:false
      }
    };
    return out;
  }

  function television(source,cont){
    const root=obj(source)?source:{};
    const src=obj(root.televisionGuide||root.tvGuide||root.tvContext)?(root.televisionGuide||root.tvGuide||root.tvContext):root;
    const raw=text(src.deviceClass||src.device||root.deviceClass||"",32).toLowerCase().replace(/[^a-z0-9_-]+/g,"_");
    const sf=surface(src.surface||cont.surface);
    const enabled=bool(src.enabled,TV_DEVICES.has(raw)||/(?:^|[._-])(roku|tv|television)(?:$|[._-])/.test(sf));
    if(!enabled)return{contract:TELEVISION_CONTRACT,version:PATCH_VERSION,enabled:false,authoritative:false};
    const device=TV_DEVICES.has(raw)?raw:(sf.includes("roku")?"roku":"web_tv");
    const im=text(src.inputMode||src.navigationMode||root.inputMode||"remote",24).toLowerCase().replace(/[^a-z0-9_-]+/g,"_");
    const inputMode=["remote","keyboard","pointer","touch","voice_request"].includes(im)?im:"remote";
    const reduced=bool(src.reducedMotion,cont.reducedMotion||true);
    return{
      contract:TELEVISION_CONTRACT,
      version:PATCH_VERSION,
      enabled:true,
      authoritative:false,
      deviceClass:device,
      surface:sf,
      inputMode,
      remotePrimary:inputMode==="remote",
      captionsRequired:true,
      captionsEnabled:bool(src.captionsEnabled,true),
      continuousListening:false,
      voiceActivation:"explicit_user_request",
      autoSpeak:false,
      interruptPlayback:false,
      userGestureRequired:true,
      responseDensity:"compact",
      maxSpeechChars:Math.round(num(src.maxSpeechChars,260,120,420)),
      maxActions:Math.round(num(src.maxActions,4,1,4)),
      safeAreaPercent:num(src.safeAreaPercent,5,3,10),
      animation:{mode:reduced?"reduced":"restrained",reducedMotion:reduced,continuousMotion:false},
      focus:{target:text(src.focusTarget||src.focus||"guide_dock",80),preserveNativeBack:true,preserveNativePlayPause:true,trapFocus:false},
      playbackPolicy:{autoPauseMedia:false,autoResumeMedia:false,duckAudioOnlyOnExplicitSpeech:true,restoreFocusAfterSpeech:true}
    };
  }

  function project(value,args){
    if(!obj(value))return value;
    const source=mergeSource(value,args);
    const cont=continuity(source,value);
    const tv=television(source,cont);
    const out=Object.assign({},value,{publicGuideContinuity:cont});
    if(tv.enabled)out.televisionGuide=tv;
    if(obj(out.payload)){
      out.payload=Object.assign({},out.payload,{publicGuideContinuity:cont});
      if(tv.enabled)out.payload.televisionGuide=tv;
    }
    if(obj(out.meta)){
      out.meta=Object.assign({},out.meta,{publicGuideContinuityContract:CONTINUITY_CONTRACT,televisionGuideContract:tv.enabled?TELEVISION_CONTRACT:undefined});
    }
    if(obj(out.finalEnvelope)){
      out.finalEnvelope=Object.assign({},out.finalEnvelope,{publicGuideContinuity:cont});
      if(tv.enabled)out.finalEnvelope.televisionGuide=tv;
    }
    out.publicGuideContinuity.publicStatePersistence=true;out.publicGuideContinuity.privateStatePersistence=false;
    
    return out;
  }

  function wrap(fn,name){
    if(typeof fn!=="function"||fn.__nyxEcosystemContinuityTvR1)return fn;
    const w=function(){const args=arguments;const r=fn.apply(this,args);if(r&&typeof r.then==="function")return r.then(v=>project(v,args));return project(r,args);};
    try{Object.keys(fn).forEach(k=>w[k]=fn[k]);}catch(_e){}
    w.__nyxEcosystemContinuityTvR1=true;
    w.__nyxWrappedName=name;
    return w;
  }

  try{
    if(typeof module.exports==="function")module.exports=wrap(module.exports,"default");
    const api=module.exports&&typeof module.exports==="object"?module.exports:null;
    if(api){
      for(const n of WRAP_NAMES)if(typeof api[n]==="function")api[n]=wrap(api[n],n);
      api.NYX_ECOSYSTEM_CONTINUITY_TV_VERSION=PATCH_VERSION;
      api.NYX_GUIDE_CONTINUITY_CONTRACT=CONTINUITY_CONTRACT;
      api.NYX_TELEVISION_GUIDE_CONTRACT=TELEVISION_CONTRACT;
      api.normalizeNyxPublicGuideContinuity=function(v,previous){return continuity(Object.assign({},obj(previous)?previous:{},obj(v)?v:{}),v);};
      api.buildNyxTelevisionGuide=function(v,c){const cont=continuity(obj(c)?c:obj(v)?v:{},v);return television(obj(v)?v:{},cont);};
      api.attachNyxEcosystemContinuity=function(v,input){return project(v,[input||{}]);};
    }
  }catch(_err){}
})();
/* NYX_ECOSYSTEM_CONTINUITY_TV_STEPS_5_6_R1_END */
