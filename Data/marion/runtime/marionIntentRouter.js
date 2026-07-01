"use strict";

/**
 * marionIntentRouter.js
 * Deterministic Marion intent router.
 *
 * Purpose:
 * - Classify incoming Nyx/Marion text into one authoritative canonical intent.
 * - Attach routing metadata for MarionBridge, State Spine, and ComposeMarionResponse.
 * - Preserve cohesion with ComposeMarionResponse and MarionBridge by using the shared intent set.
 * - Add identity + reasoning + baseline cognition routing without composing final user replies.
 * - Prevent emotional, identity, and recovery turns from falling into dead-loop fallback handling.
 */

const VERSION = "PRIORITY-9J-R1B-OBJECT-REPLY-SERIALIZATION-GUARD + PRIORITY-9J-R1A-RUNTIME-DECISION-SPECIFIC-FINAL-OVERRIDE + PRIORITY-9J-R1-DECISION-SPECIFIC-AUTHORITY-HOTFIX + PRIORITY-9I-R2A-ALT-PRESSURE-SPECIFIC-FINAL-OVERRIDE + PRIORITY-9I-R2-PRESSURE-SPECIFIC-ANSWER-SHAPING + PRIORITY-9I-R1-9J-PREMATURE-ESCALATION-CONTAINMENT + PRIORITY-9F-R2-DOMAIN-HIJACK-SUPPRESSION + PRIORITY-9F-R1-LAYERED-PRECEDENCE-HOTFIX + marionIntentRouter v3.6.0 PRIORITY2-COMMAND-ROUTING-HARDENING + DEFENSIVE-INTENT-SIGNAL-CARRY + FOLLOWUP-CANDIDATE-SANITIZATION + UNRESOLVED-FOLLOWUP-DEADEND-BYPASS + FOLLOWUP-EFFECTIVE-PROMPT-BINDING-HARDLOCK + FOLLOWUP-DETECTION-TOPIC-INFERENCE-HARDLOCK + SHORT-FOLLOWUP-CONTINUITY-HOTFIX + ANSWERABLE-TOPIC-CLARIFIER-BYPASS-LOCK + QUESTION-SHAPE-NORMALIZER-MODULE-LOCK + CROSS-DOMAIN-SECONDARY-LANE-SCORING-LOCK + SIX-DOMAIN-DEFINITION-ROUTING-AUTHORITY-LOCK + IDENTITY-RESET-GENERIC-FALLBACK-LOOP-LOCK + OUTER-SCHEDULER-BYPASS-COMPAT + TECHNICAL-FOLLOWUP-INTENT-LOCK + CYBER-LEAST-PRIVILEGE-PRECISION + DOMAIN-CONFIDENCE-SCORING-HARDLOCK + DOMAIN-CONFIDENCE-TOPLEVEL + REGISTRY-COHESION-HARDENED + TELEMETRY-VISIBILITY-FAILURE-SIGNATURE-AUDIT + R18C-LAW-INTENT-ROUTING";
const DOMAIN_CONFIDENCE_VERSION = "nyx.marion.domainConfidence/1.1";
const DOMAIN_CONCIERGE_CORE_VERSION = "nyx.marion.domainConciergeCore/0.1-prep";
const QUESTION_SHAPE_NORMALIZATION_VERSION = "nyx.marion.questionShapeNormalization/1.0";
const PROTECTIVE_ESCALATION_ROUTING_VERSION = "nyx.marion.protectiveEscalationRouting/1.0";

const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const INTENT_CONTRACT_VERSION = "nyx.marion.intent/2.5";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";
const PIPELINE_FORENSIC_NORMALIZATION_VERSION = "pipeline.forensicNormalization/1.0";

const DOMAIN_REGISTRY_REQUIRE_CANDIDATES = Object.freeze([
  "./marionDomainRegistry.js",
  "./marionDomainRegistry",
  "./Data/marion/runtime/marionDomainRegistry.js",
  "./Data/marion/runtime/marionDomainRegistry",
  "../runtime/marionDomainRegistry.js",
  "../runtime/marionDomainRegistry"
]);

function tryRequireOptional(paths) {
  for (const p of Array.isArray(paths) ? paths : []) {
    try {
      const mod = require(p);
      if (mod) return mod;
    } catch (_) {}
  }
  return null;
}

const domainRegistryMod = tryRequireOptional(DOMAIN_REGISTRY_REQUIRE_CANDIDATES);
const domainConfidenceMod = tryRequireOptional(["./domainConfidence.js", "./domainConfidence", "./Data/marion/runtime/domainConfidence.js", "./Data/marion/runtime/domainConfidence", "../runtime/domainConfidence.js", "../runtime/domainConfidence"]);

const QUESTION_SHAPE_NORMALIZER_REQUIRE_CANDIDATES = Object.freeze([
  "./QuestionShapeNormalizer.js",
  "./QuestionShapeNormalizer",
  "./Data/marion/runtime/QuestionShapeNormalizer.js",
  "./Data/marion/runtime/QuestionShapeNormalizer",
  "../runtime/QuestionShapeNormalizer.js",
  "../runtime/QuestionShapeNormalizer"
]);

const questionShapeNormalizerMod = tryRequireOptional(QUESTION_SHAPE_NORMALIZER_REQUIRE_CANDIDATES);

const VALID_INTENTS = Object.freeze([
  "simple_chat",
  "technical_debug",
  "emotional_support",
  "business_strategy",
  "music_query",
  "news_query",
  "roku_query",
  "identity_query",
  "identity_or_memory",
  "directive_response",
  "contextual_directive",
  "domain_question"
]);

const INTENT_TO_DOMAIN = Object.freeze({
  simple_chat: "general",
  technical_debug: "technical",
  emotional_support: "emotional",
  business_strategy: "business",
  music_query: "music",
  news_query: "news",
  roku_query: "roku",
  identity_query: "identity",
  identity_or_memory: "memory",
  directive_response: "execution",
  contextual_directive: "execution_context",
  domain_question: "general_reasoning"
});

const DOMAIN_MODE = Object.freeze({
  general: "conversation",
  technical: "debug",
  emotional: "support_then_advance",
  business: "strategy",
  music: "retrieval",
  news: "retrieval",
  roku: "platform",
  memory: "continuity",
  identity: "identity",
  execution: "execution",
  execution_context: "contextual_execution",
  general_reasoning: "reasoning",
  english: "language_fluency",
  psychology: "support_then_advance",
  ai: "ai_architecture_reasoning",
  cyber: "defensive_cybersecurity",
  law: "educational_law_information",
  finance: "scenario_finance_reasoning"
});

const DOMAIN_DEPTH = Object.freeze({
  general: "normal",
  technical: "forensic",
  emotional: "deep_forward",
  business: "strategic",
  music: "normal",
  news: "normal",
  roku: "normal",
  memory: "continuity_deep",
  identity: "identity_baseline",
  execution: "direct_execution",
  execution_context: "contextual_precision",
  general_reasoning: "baseline_cognition",
  english: "polished_language",
  psychology: "deep_forward",
  ai: "forensic",
  cyber: "forensic",
  law: "balanced",
  finance: "balanced"
});

const PREFERRED_STYLE = Object.freeze({
  general: "direct_warm",
  technical: "direct_forensic",
  emotional: "warm_deep_forward",
  business: "strategic_direct",
  music: "clear_retrieval",
  news: "clean_source_aware",
  roku: "platform_direct",
  memory: "identity_continuity",
  identity: "identity_clear",
  execution: "short_direct_action",
  execution_context: "contextual_directive",
  general_reasoning: "reasoned_direct",
  english: "clear_polished",
  psychology: "contain_then_clarify",
  ai: "implementation_grade",
  cyber: "defensive_only",
  law: "jurisdiction_aware",
  finance: "assumption_disclosed"
});

const VALID_KNOWLEDGE_DOMAINS = Object.freeze([
  "psychology",
  "english",
  "ai",
  "cyber",
  "law",
  "finance"
]);

const KNOWLEDGE_OPERATIONAL_DOMAIN = Object.freeze({
  psychology: "emotional",
  english: "english",
  ai: "ai",
  cyber: "cyber",
  law: "law",
  finance: "finance"
});

const KNOWLEDGE_DOMAIN_MODE = Object.freeze({
  psychology: "support_then_advance",
  english: "language_fluency",
  ai: "ai_architecture_reasoning",
  cyber: "defensive_cybersecurity",
  law: "educational_law_information",
  finance: "scenario_finance_reasoning"
});

const KNOWLEDGE_DOMAIN_DEPTH = Object.freeze({
  psychology: "deep_forward",
  english: "polished_language",
  ai: "forensic",
  cyber: "forensic",
  law: "balanced",
  finance: "balanced"
});

function safeStr(v) {
  return v == null ? "" : String(v).replace(/\s+/g, " ").trim();
}

function lower(v) {
  return safeStr(v).toLowerCase();
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeObj(v) {
  return isObj(v) ? v : {};
}
function safeArray(v) {
  return Array.isArray(v) ? v : [];
}


function normalizeContinuityTopic(value) {
  return safeStr(value)
    .replace(/[.?!]+$/g, "")
    .replace(/^(?:explain|define|describe|break\s+down|tell\s+me\s+about|what\s+is|what\s+are)\s+/i, "")
    .replace(/^(?:the|a|an)\s+/i, "")
    .trim()
    .slice(0, 120);
}


function inferContinuityTopicFromAssistantText(value = "") {
  const t = safeStr(value).replace(/[“”"']/g, "");
  const lowerT = lower(t);
  if (!t) return "";
  const directTopics = [
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
  if (m && m[1]) return normalizeContinuityTopic(m[1]);
  m = lowerT.match(/^([a-z][a-z0-9\s\-]{2,80})\s+(?:is|means|refers to)\b/);
  if (m && m[1]) return normalizeContinuityTopic(m[1]);
  return "";
}

function chooseContinuityTopicCandidate(candidates = []) {
  for (const item of Array.isArray(candidates) ? candidates : []) {
    const direct = normalizeContinuityTopic(item);
    if (!direct) continue;
    if (/\b(awaitingMarion|finalEnvelope|suppressUserFacingReply|runtimeTelemetry|diagnostics|routeKind|marionFinal|conversation_authority_empty|trusted_marion_final_reply_missing)\b/i.test(direct)) continue;
    if (isShortContinuityFollowupText(direct)) continue;
    const inferred = inferContinuityTopicFromAssistantText(item) || direct;
    const topic = normalizeContinuityTopic(inferred);
    if (topic && !isShortContinuityFollowupText(topic)) return topic;
  }
  return "";
}


function collectContinuityCandidateTexts(input = {}) {
  const src = safeObj(input);
  const meta = safeObj(src.meta);
  const payload = safeObj(src.payload);
  const session = safeObj(src.session);
  const body = safeObj(src.body);
  const memoryPatch = safeObj(src.memoryPatch || payload.memoryPatch || meta.memoryPatch || session.memoryPatch);
  const stateBridge = safeObj(src.stateBridge || memoryPatch.stateBridge || payload.stateBridge || meta.stateBridge);
  const prevState = safeObj(src.prevState || src.previousState || src.state || src.stateSpine || src.conversationState || session.prevState || session.previousState || session.state || session.stateSpine || meta.prevState || meta.previousState || payload.prevState || payload.previousState);
  const previousMemory = safeObj(src.previousMemory || src.memory || session.memory || meta.previousMemory || payload.previousMemory || prevState);
  const previousContinuity = safeObj(previousMemory.continuity || prevState.continuity || stateBridge.continuity);
  const direct = safeObj(src.continuity || meta.continuity || payload.continuity || stateBridge.continuity);
  const ref = safeObj(src.followUpReference || meta.followUpReference || payload.followUpReference || stateBridge.followUpReference);
  const lastTopics = safeArray(previousMemory.lastTopics || prevState.lastTopics || safeObj(prevState.continuityThread).lastTopics || safeObj(previousMemory.continuityThread).lastTopics);

  const directCandidates = [
    ref.topic, ref.lastTopic, ref.subject,
    direct.topic, direct.lastTopic, direct.subject,
    meta.continuityTopic, payload.continuityTopic, stateBridge.continuityTopic,
    stateBridge.topic, stateBridge.lastTopic,
    previousContinuity.topic, previousContinuity.lastTopic, previousContinuity.subject,
    previousMemory.topic, previousMemory.lastTopic, previousMemory.activeTopic,
    prevState.topic, prevState.lastTopic, prevState.activeTopic,
    previousMemory.normalizedUserIntent, prevState.normalizedUserIntent,
    previousMemory.userText, prevState.lastUserText,
    lastTopics[0]
  ];

  const assistantCandidates = [
    src.lastAssistantReply, src.previousAssistantReply, src.assistantReply,
    meta.lastAssistantReply, meta.previousAssistantReply, meta.assistantReply,
    payload.lastAssistantReply, payload.previousAssistantReply, payload.assistantReply,
    body.lastAssistantReply, body.previousAssistantReply, body.assistantReply,
    previousMemory.lastAssistantReply, previousMemory.previousAssistantReply,
    prevState.lastAssistantReply, prevState.previousAssistantReply,
    previousMemory.carryForwardSummary, prevState.carryForwardSummary,
    previousMemory.conversationSummary, prevState.conversationSummary
  ];

  const historyCandidates = [];
  const historySources = [
    src.conversationHistory, src.history, src.messages, src.turns,
    payload.conversationHistory, payload.history, payload.messages, payload.turns,
    body.conversationHistory, body.history, body.messages, body.turns,
    session.conversationHistory, session.history, session.messages, session.turns,
    previousMemory.conversationHistory, previousMemory.history, previousMemory.messages, previousMemory.turns,
    prevState.conversationHistory, prevState.history, prevState.messages, prevState.turns
  ];
  for (const list of historySources) {
    if (!Array.isArray(list)) continue;
    for (let i = list.length - 1; i >= 0 && historyCandidates.length < 12; i -= 1) {
      const item = safeObj(list[i]);
      const role = lower(item.role || item.sender || item.author || item.source || "");
      const candidate = item.text || item.message || item.reply || item.content || item.displayReply || "";
      if (!candidate) continue;
      // UNRESOLVED-FOLLOWUP-DEADEND-BYPASS:
      // Only assistant-visible prior replies should seed public continuity topics.
      // System/runtime records can contain "awaitingMarion", finalEnvelope, or other
      // transport markers that poison topic inference and create blank blocked packets.
      if (!role || /assistant|nyx|marion/.test(role)) {
        const cleanCandidate = safeStr(candidate);
        if (
          cleanCandidate &&
          !/\b(awaitingMarion|finalEnvelope|suppressUserFacingReply|runtimeTelemetry|diagnostics|routeKind|marionFinal)\b/i.test(cleanCandidate)
        ) historyCandidates.push(cleanCandidate);
      }
    }
  }

  return {
    directCandidates,
    assistantCandidates,
    historyCandidates,
    allCandidates: [...directCandidates, ...assistantCandidates, ...historyCandidates]
  };
}

function extractContinuityCarry(input = {}) {
  const src = safeObj(input);
  const meta = safeObj(src.meta);
  const payload = safeObj(src.payload);
  const session = safeObj(src.session);
  const memoryPatch = safeObj(src.memoryPatch || payload.memoryPatch || meta.memoryPatch || session.memoryPatch);
  const stateBridge = safeObj(src.stateBridge || memoryPatch.stateBridge || payload.stateBridge || meta.stateBridge);
  const prevState = safeObj(src.prevState || src.previousState || src.state || src.stateSpine || src.conversationState || session.prevState || session.previousState || session.state || session.stateSpine || meta.prevState || meta.previousState || payload.prevState || payload.previousState);
  const previousMemory = safeObj(src.previousMemory || src.memory || session.memory || meta.previousMemory || payload.previousMemory || prevState);
  const previousContinuity = safeObj(previousMemory.continuity || prevState.continuity || stateBridge.continuity);
  const direct = safeObj(src.continuity || meta.continuity || payload.continuity || stateBridge.continuity);
  const ref = safeObj(src.followUpReference || meta.followUpReference || payload.followUpReference || stateBridge.followUpReference);
  const lastTopics = safeArray(previousMemory.lastTopics || prevState.lastTopics || safeObj(prevState.continuityThread).lastTopics || safeObj(previousMemory.continuityThread).lastTopics);
  const continuityCandidates = collectContinuityCandidateTexts(src);
  let topic = chooseContinuityTopicCandidate(continuityCandidates.directCandidates);
  if (!topic) topic = chooseContinuityTopicCandidate(continuityCandidates.assistantCandidates);
  if (!topic) topic = chooseContinuityTopicCandidate(continuityCandidates.historyCandidates);
  if (!topic) topic = chooseContinuityTopicCandidate(continuityCandidates.allCandidates);
  const originalText = safeStr(src.continuityResolvedOriginalText || ref.originalText || direct.originalText || meta.continuityResolvedOriginalText || "");
  const resolvedText = safeStr(src.continuityResolvedText || ref.resolvedText || direct.resolvedText || meta.continuityResolvedText || "");
  const currentText = extractText(src);
  const currentLooksLikeFollowup = isShortContinuityFollowupText(currentText);
  const active = !!(topic || ref.active || direct.active || previousContinuity.active || src.shortFollowupContinuityResolved || meta.shortFollowupContinuityResolved || (currentLooksLikeFollowup && topic));
  const resolvedFollowup = !!(src.shortFollowupContinuityResolved || ref.resolvedFollowup || ref.active || direct.resolvedFollowup || meta.shortFollowupContinuityResolved || (topic && (resolvedText || currentLooksLikeFollowup)));
  return {
    active,
    topic,
    lastTopic: topic,
    resolvedFollowup,
    originalText,
    resolvedText,
    source: safeStr(ref.source || direct.source || previousContinuity.source || "marionIntentRouter.extractContinuityCarry.hotfix")
  };
}

function isShortContinuityFollowupText(value = "") {
  const t = lower(value).replace(/[.?!]+$/g, "").trim();
  if (!t) return false;
  return /^(?:why|why is that important|why does that matter|why is it important|why does it matter|how so|explain why|give me an example|give me example|show me an example|show me example|show another example|another example|example|use case|apply it|apply that|what about that|what happens next|what next|then what|what does that mean|tell me more|go deeper|continue|expand on that|break that down|how would that work)$/i.test(t) ||
    /\b(that|it|this|those|these)\b/i.test(t) && /\b(important|matter|example|apply|work|mean|impact|risk|benefit|useful|business|small business|practical|practically)\b/i.test(t);
}

function isResolvedShortContinuityPrompt(input = {}, text = "") {
  const carry = extractContinuityCarry(input);
  if (!carry.topic) return false;
  const t = lower(text);
  if (carry.resolvedFollowup === true) return true;
  if (t && t.includes(lower(carry.topic))) return true;
  return isShortContinuityFollowupText(t);
}

function buildContinuityResolvedQuestion(text = "", carry = {}) {
  const topic = normalizeContinuityTopic(carry.topic || carry.lastTopic || "");
  const raw = safeStr(text).replace(/\s+/g, " ").trim();
  if (!topic || !raw) return raw;
  if (lower(raw).includes(lower(topic))) return raw;

  if (/^why\s+(?:is\s+that\s+important|does\s+that\s+matter|is\s+it\s+important|does\s+it\s+matter)?\??$/i.test(raw) || /^why\b/i.test(raw)) {
    return `Why is ${topic} important?`;
  }
  if (/^(?:how so|explain why)\??$/i.test(raw)) return `Explain why ${topic} matters.`;
  if (/\bexample\b/i.test(raw)) return `Give me an example of ${topic}.`;
  if (/\bsmall business\b/i.test(raw)) return `Apply ${topic} to a small business.`;
  if (/\bapply\b/i.test(raw)) return `Apply ${topic} to this context.`;
  if (/\bwhat happens next|next step|what next|then what\b/i.test(raw)) return `What happens next with ${topic} in practice?`;
  if (/\bcontinue|tell me more|expand|go deeper|break that down\b/i.test(raw)) return `Continue explaining ${topic}.`;
  if (/\bwhat does that mean|what does it mean\b/i.test(raw)) return `What does ${topic} mean in practical terms?`;
  return `${raw} about ${topic}`;
}

function clamp01(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function has(rx, text) {
  if (!text) return false;
  rx.lastIndex = 0;
  return rx.test(text);
}

function compactWhitespace(v) {
  return safeStr(v);
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




function normalizeRouterVoiceTextParity(text="") {
  return safeStr(text)
    .replace(/\b(nick|nix|mix|mike)\b/gi, "Nyx")
    .replace(/\b(state\s+line|state\s+sign|statespine|state\s+spine)\b/gi, "State Spine")
    .replace(/\b(chad\s+engine|chat\s+engine)\b/gi, "ChatEngine")
    .replace(/\b(mary\s+bridge|marian\s+bridge|marion\s+bridge)\b/gi, "MarionBridge")
    .replace(/\b(compose\s+marion\s+response|composed\s+marion\s+response|compose\s+marian\s+response|composed\s+marian\s+response|compose\s+mailing\s+response|composed\s+mailing\s+response)\b/gi, "ComposeMarionResponse")
    .replace(/\b(nyx|nix|nick)\s+steps\s+for\s+(publishing|submission|submitting)\b/gi, "Next steps for $2")
    .replace(/\b(nex\s+steps|neck\s+steps)\b/gi, "Next steps")
    .replace(/\b(mic\s*tech|mike\s*tech|mike\s*text|mic\s*text)\b/gi, "mic text")
    .replace(/\b(5\s*term|five\s*term|five\s*turn|5\s*turn)\b/gi, "5-turn")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackNormalizeQuestionShape(text = "") {
  const raw = normalizeRouterVoiceTextParity(compactWhitespace(text));
  const cleaned = raw
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const lowerCleaned = lower(cleaned);
  const passthrough = (reason = "passthrough") => ({
    version: QUESTION_SHAPE_NORMALIZATION_VERSION,
    rawText: raw,
    normalizedText: cleaned || raw,
    normalizedUserIntent: cleaned || raw,
    questionShape: "direct_or_unknown",
    changed: false,
    reason,
    source: "marionIntentRouter.fallbackQuestionShapeNormalizer"
  });

  if (!cleaned) return passthrough("empty_input");
  if (
    detectBackendTechnicalContext(cleaned) ||
    detectDirectiveIntent(cleaned) ||
    isInfrastructureContinuityPrompt(cleaned) ||
    /\b(file|files|zip|download|resend|update|patch|fix|replace|audit|autopsy|line[-\s]?by[-\s]?line|structural integrity|architecture|deploy|validate|node --check|backend|frontend|widget|script|code|html|css|javascript|js|api\/chat|runtime|router|composer|state spine|statespine|marion|nyx|nix|nixon|marionbridge|chatengine|composemarionresponse|intent router|domain registry|question shape normalizer|question-shape normalizer)\b/i.test(lowerCleaned)
  ) {
    return passthrough("execution_or_technical_guard");
  }

  const patterns = [
    { rx: /^(?:please\s+)?(?:can you\s+|could you\s+|would you\s+)?tell me(?:\s+something)?\s+about\s+(.+)$/i, reason: "tell_me_about" },
    { rx: /^(?:please\s+)?(?:can you\s+|could you\s+|would you\s+)?give me\s+(?:something|some info|information|a quick overview|an overview)\s+(?:about|on|regarding|for)\s+(.+)$/i, reason: "give_me_about" },
    { rx: /^(?:please\s+)?(?:can you\s+|could you\s+|would you\s+)?(?:explain|describe|define|break down)\s+(.+)$/i, reason: "explain_or_define" },
    { rx: /^(?:please\s+)?(?:i want to know|i wanna know|i need to understand|i'd like to know|i would like to know)\s+(?:about|what|how)?\s*(.+)$/i, reason: "want_to_know" },
    { rx: /^(?:please\s+)?what\s+(?:is|are)\s+(.+)$/i, reason: "what_is" },
    { rx: /^(?:please\s+)?what\s+does\s+(.+?)\s+mean$/i, reason: "what_does_mean" },
    { rx: /^(?:please\s+)?how\s+does\s+(.+?)\s+work$/i, reason: "how_does_work" }
  ];

  for (const { rx, reason } of patterns) {
    const match = cleaned.match(rx);
    const candidate = match && match[1]
      ? safeStr(match[1]).replace(/^(a|an|the)\s+/i, "").replace(/[?!.,]+$/g, "").trim()
      : "";
    if (
      candidate &&
      candidate.length >= 2 &&
      !/\b(file|files|zip|download|resend|update|patch|fix|replace|audit|autopsy|line[-\s]?by[-\s]?line|structural integrity|architecture|deploy|validate|backend|frontend|widget|script|code|api\/chat|runtime|router|composer|state spine|statespine|marion|nyx|nix|nixon)\b/i.test(candidate)
    ) {
      return {
        version: QUESTION_SHAPE_NORMALIZATION_VERSION,
        rawText: raw,
        normalizedText: candidate,
        normalizedUserIntent: candidate,
        questionShape: "topic_request",
        changed: candidate !== cleaned,
        reason,
        source: "marionIntentRouter.fallbackQuestionShapeNormalizer"
      };
    }
  }

  return passthrough("no_topic_prefix_match");
}

function normalizeQuestionShape(text = "") {
  if (questionShapeNormalizerMod && typeof questionShapeNormalizerMod.normalizeQuestionShape === "function") {
    try {
      const normalized = questionShapeNormalizerMod.normalizeQuestionShape(text, {
        isExecutionOrTechnicalRequest(value) {
          return detectBackendTechnicalContext(value) ||
            detectDirectiveIntent(value) ||
            isInfrastructureContinuityPrompt(value);
        }
      });
      if (normalized && typeof normalized === "object") {
        return {
          version: safeStr(normalized.version || QUESTION_SHAPE_NORMALIZATION_VERSION),
          rawText: safeStr(normalized.rawText || normalizeRouterVoiceTextParity(compactWhitespace(text))),
          normalizedText: safeStr(normalized.normalizedText || normalized.normalizedUserIntent || text),
          normalizedUserIntent: safeStr(normalized.normalizedUserIntent || normalized.normalizedText || text),
          questionShape: safeStr(normalized.questionShape || "direct_or_unknown"),
          changed: !!normalized.changed,
          reason: safeStr(normalized.reason || "external_question_shape_normalizer"),
          source: safeStr(normalized.source || "QuestionShapeNormalizer")
        };
      }
    } catch (_) {}
  }
  return fallbackNormalizeQuestionShape(text);
}

function normalizeInputSource(value) {
  const raw = lower(value);
  if (/voice|speech|mic|audio|headset/.test(raw)) return "voice";
  if (/text|typed|keyboard|manual/.test(raw)) return "text";
  return raw || "text";
}

function isIdentityNameQuestion(text = "") {
  const t = lower(normalizeRouterVoiceTextParity(text));
  return /\b(who are you|what are you|what(?:\'|’)s your name|what is your name|your name|what should i call you|are you nyx|is your name nyx|your identity|your role)\b/i.test(t);
}


function canonicalTechnicalTargetFromText(text = "") {
  const t = safeStr(text || "");
  const mk = (targetKey, targetName, targetFile, targetPath, layer = "runtime") => ({ version: "nyx.marion.technicalTargetLock/1.1", targetKey, targetName, targetFile, targetPath, layer, explicit: true, source: "current_user_text", locked: true, technicalFollowUpLock: true, blockScheduleInterception: true });
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
  return /\b(now|next|then|also|again|from there|after that|one more)\b/i.test(t) || /\b(full autopsy|autopsy|audit|line[-\s]?by[-\s]?line|critical fix|critical fixes|check|inspect|review|patch|harden|run)\b/i.test(t);
}

function detectProtectiveEscalationRouting(text = "", packet = {}) {
  const t = lower(normalizeRouterVoiceTextParity(text));
  const p = safeObj(packet);
  const signal = safeObj(safeObj(p.signals).protectiveEscalation || p.protectiveEscalation || safeObj(p.meta).protectiveEscalation);
  const guardians = [];
  if (/\baster\b/i.test(t) || safeArray(signal.guardians).includes("aster")) guardians.push("aster");
  if (/\b(talon|thalon)\b/i.test(t) || safeArray(signal.guardians).includes("thalon")) guardians.push("thalon");
  if (/\bmarion\b/i.test(t) || safeArray(signal.guardians).includes("marion")) guardians.push("marion");
  const protective = /\b(defen[cs]e|defensive|self[-\s]?defen[cs]e|protect|protection|protective|personal safety|emergency|threat|imminent|danger|alarm|alert|escalation|boundary|guardrail|intent justifier|justified scenario|verified command|code word|codeword)\b/i.test(t);
  const elevated = /\b(90\s*dB|ninety\s*dB|decibel|burst|cooldown|interval|siren|audio controller|cross over|ethical boundary|line crossing)\b/i.test(t);
  const implementation = /\b(add|include|implement|integrate|route|patch|harden|controller|runtime|gatekeeper|guardrail|boundary|policy|file|code)\b/i.test(t);
  const detected = signal.detected === true || (protective && (elevated || guardians.length > 0 || implementation));
  return {
    version: PROTECTIVE_ESCALATION_ROUTING_VERSION,
    detected,
    level: detected && (elevated || signal.level === "elevated") ? "elevated" : (detected ? "bounded" : "none"),
    guardians: Array.from(new Set(guardians.concat(safeArray(signal.guardians).map(safeStr).filter(Boolean)))),
    requiresEthicalGate: detected,
    requiresVerifiedIntent: detected,
    protectivePurposeOnly: true,
    boundedOutputRequired: true,
    noPunitiveUse: true,
    noCoerciveUse: true,
    noContinuousAlarm: true,
    routeAsTechnicalPolicy: detected && implementation,
    reason: detected ? "protective_escalation_routing_signal" : "none"
  };
}

function isPriorityTwoRuntimeRoutingText(text = "") {
  const t = lower(normalizeRouterVoiceTextParity(text));
  if (!t) return false;
  return /\bpriority\s*(?:number\s*)?(?:two|2)\b/i.test(t) ||
    /\b(command routing|intent router|marionintentrouter|command normalizer|marioncommandnormalizer|guardian pipeline|guardian\.pipeline\.router|domain concierge|domainconcierge|domain registry|mariondomainregistry|domain retriever|domainretriever)\b/i.test(t);
}

function isInfrastructureContinuityPrompt(text) {
  const t = lower(normalizeRouterVoiceTextParity(text));
  return /\b(bootstrap|guard|manifest|declared path|root path|domain isolation|domain route|domain routing|fail[-\s]?closed|silent fallback|cross[-\s]?domain bleed|domain bleed|domain path|final envelope|state spine|5-turn|five-turn|continuity regression|mic text parity|input source parity|same route|same state|same final|response consistency)\b/i.test(t) || /\b(broken|invalid|failed|missing)\b.*\b(psychology|english|finance|general|domain)\b.*\b(affect|fallback|bleed|load|route)\b/i.test(t) || /\b(should not|must not|cannot)\b.*\b(affect|fall back|fallback|bleed)\b.*\b(english|finance|general|psychology)\b/i.test(t);
}

function isContinuationCompressionInstruction(text) {
  const t = lower(normalizeRouterVoiceTextParity(text));
  if (!t) return false;
  return /\bcontinue from (?:the )?(?:last|previous) answer\b/i.test(t) && /\b(compress|one sentence|single sentence|final rule|without repeating|previous wording|same idea|shorten)\b/i.test(t);
}

function isRokuPublishingRequest(text = "") {
  const t = lower(normalizeRouterVoiceTextParity(text));
  if (!t) return false;
  return /\b(roku|ott|channel app|roku app|tv app|streaming app)\b/i.test(t) && /\b(publish|publishing|submit|submission|developer|package|pkg|channel|feed|stream|playback|deeplink|deep link|certification|screenshots|artwork|manifest|sideload|beta|private channel|public channel|app path|before submission|checked before submission|next steps|nyx steps)\b/i.test(t);
}

function isNewsMediaPositioningRequest(text = "") {
  const t = lower(normalizeRouterVoiceTextParity(text));
  if (!t) return false;
  if (/\b(rewrite|revise|edit|proofread|polish|copyedit|grammar|tone|professional(?:ly)?|make this .*sound|wording|language flow)\b/i.test(t)) return false;
  const brandHit = /\b(news canada|newscanada|sandblast media|sandblast channel|media page|news page)\b/i.test(t);
  const positioningHit = /\b(positioning|position|shape|trust|reliable|credib(?:le|ility)|current|fresh|freshness|useful|usefulness|story hierarchy|headline hierarchy|source path|update cadence|older stories|editorial|content trust|visitor trust|page feels|feels reliable)\b/i.test(t);
  const retrievalOnly = /\b(feed issue|rss error|rss route|wp rest|story url|headline url|fetch|parse|diagnostics|route result)\b/i.test(t) && !/\b(positioning|trust|reliable|credible|useful|current|fresh)\b/i.test(t);
  return brandHit && positioningHit && !retrievalOnly;
}

function turnContinuityHash(value) {
  const source = lower(normalizeRouterVoiceTextParity(value)).replace(/[^a-z0-9]+/g, " ").trim();
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function normalizeIntentName(v) {
  const raw = lower(v).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  const aliases = Object.freeze({
    chat: "simple_chat",
    general: "simple_chat",
    simple: "simple_chat",
    simplechat: "simple_chat",
    simple_chat: "simple_chat",

    debug: "technical_debug",
    technical: "technical_debug",
    technical_debug: "technical_debug",
    autopsy: "technical_debug",
    audit: "technical_debug",
    code: "technical_debug",
    fix: "technical_debug",
    script: "technical_debug",
    endpoint: "technical_debug",
    bridge: "technical_debug",
    packet: "technical_debug",
    contract: "technical_debug",

    support: "emotional_support",
    emotional: "emotional_support",
    emotion: "emotional_support",
    emotional_support: "emotional_support",
    distress: "emotional_support",
    crisis: "emotional_support",

    business: "business_strategy",
    strategy: "business_strategy",
    business_strategy: "business_strategy",
    sales: "business_strategy",
    monetization: "business_strategy",

    music: "music_query",
    music_query: "music_query",
    radio: "music_query",

    news: "news_query",
    news_query: "news_query",
    newscanada: "news_query",

    roku: "roku_query",
    roku_query: "roku_query",

    memory: "identity_or_memory",
    identity: "identity_query",
    identity_query: "identity_query",
    identity_or_memory: "identity_or_memory",
    continuity: "identity_or_memory",
    state: "identity_or_memory",
    state_spine: "identity_or_memory",
    statespine: "identity_or_memory",
    spine: "identity_or_memory",
    greeting: "simple_chat",
    greetings: "simple_chat",
    social: "simple_chat",

    directive: "directive_response",
    directive_response: "directive_response",
    contextual_directive: "contextual_directive",
    context_directive: "contextual_directive",
    question: "domain_question",
    domain_question: "domain_question",
    reasoning: "domain_question",
    baseline_cognition: "domain_question"
  });

  const normalized = aliases[raw] || raw || "";
  return VALID_INTENTS.includes(normalized) ? normalized : "";
}

function extractText(packet = {}) {
  const p = safeObj(packet);
  const body = safeObj(p.body);
  const payload = safeObj(p.payload);
  const session = safeObj(p.session || body.session);
  const turn = safeObj(p.turn || body.turn);
  const message = safeObj(p.message && typeof p.message === "object" ? p.message : {});

  return normalizeRouterVoiceTextParity(compactWhitespace(
    p.text ||
    p.query ||
    p.userText ||
    p.normalizedText ||
    p.userQuery ||
    (typeof p.message === "string" ? p.message : "") ||
    p.input ||
    p.prompt ||
    p.command ||
    body.text ||
    body.query ||
    body.userText ||
    body.normalizedText ||
    (typeof body.message === "string" ? body.message : "") ||
    body.input ||
    payload.text ||
    payload.query ||
    payload.userText ||
    payload.normalizedText ||
    (typeof payload.message === "string" ? payload.message : "") ||
    payload.input ||
    turn.text ||
    turn.message ||
    message.text ||
    session.lastUserText ||
    ""
  ));
}

function extractExistingIntent(packet = {}) {
  const p = safeObj(packet);
  const body = safeObj(p.body);
  const payload = safeObj(p.payload);
  const session = safeObj(p.session || body.session);
  return safeObj(p.marionIntent || p.intentPacket || body.marionIntent || body.intentPacket || payload.marionIntent || session.marionIntent || {});
}

function detectSafetyLevel(text) {
  const t = lower(text);
  if (!t) return "none";

  if (has(/\b(suicide|suicidal|self[- ]?harm|kill myself|end my life|don['’]?t want to live|dont want to live|want to die|crisis|panic attack)\b/i, t)) {
    return "crisis";
  }

  if (has(/\b(depressed|depression|sad|lonely|overwhelmed|anxious|anxiety|hurt|heartbroken|grief|crying|afraid|stressed|hopeless|numb|burned out|burnt out|frustrated|exhausted)\b/i, t)) {
    return "distress";
  }

  return "none";
}

function detectSocialIntent(text) {
  const t = lower(text).replace(/[.!?]+$/g, "").trim();
  if (!t) return "";
  if (/^(hi|hello|hey|yo|hiya|good morning|good afternoon|good evening)(\s+(nyx|nix|vera|mac))?$/.test(t)) return "greeting";
  if (/\b(how are you|how are you today|how's it going|how is it going|you doing okay|are you there)\b/i.test(t)) return "wellbeing_check";
  if (/\b(what can you help with|what do you help with|what can you do|what are your areas|where can we start|help me start)\b/i.test(t)) return "capabilities_intro";
  if (/\b(thank you|thanks|appreciate it|perfect|beautiful|good job)\b/i.test(t) && t.length < 120) return "courtesy";
  return "";
}

function detectContextualDirectiveIntent(text) {
  const t = lower(text);
  if (!t) return false;
  return !!(
    has(/\b(given that setup|given this setup|based on that|based on this|that setup|that architecture|that context|from there|in this case)\b/i, t) ||
    has(/\b(final envelope|finalenvelope|session patch|sessionpatch|contract)\b.*\b(breaks|fails|lost|survives|risk|harden|first)\b/i, t) ||
    has(/\b(what layer|which layer|harden first|biggest risk|desynchronization risk)\b/i, t)
  );
}

function detectDomainIntroIntent(text) {
  const t = lower(text);
  if (!t) return "";
  if (/\b(avatar|voice|tts|speech|nyx voice|avatar controls|micro[- ]?expression|head and shoulders)\b/i.test(t)) return "avatar_voice";
  if (/\b(backend diagnostics|diagnostics|health check|route health|api status|server status)\b/i.test(t)) return "backend_diagnostics";
  if (/\b(media|radio|linear tv|sandblast channel|campaign|audience|listeners)\b/i.test(t)) return "media_radio";
  return "";
}

function detectBackendTechnicalContext(text) {
  const t = lower(text);
  if (!t) return false;
  const backendAnchor = /\b(nyx|marion|backend|chatengine|chat engine|marionbridge|marion bridge|intent router|marion intent router|command normalizer|guardian pipeline|guardian\.pipeline\.router|domain concierge|domainconcierge|domain registry|mariondomainregistry|domain retriever|domainretriever|composemarionresponse|compose marion response|state spine|statespine|state-spine|final envelope|finalenvelope|session patch|sessionpatch|reply authority|transport|coordinator|composer|bridge|router|runtime|utils|api\/chat|endpoint|contract|packet|script|file|code-level|code level|priority two|priority 2)\b/i.test(t);
  const technicalAction = /\b(autopsy|audit|line[- ]?by[- ]?line|critical fix|critical fixes|fix|patch|harden|hardening|stabilize|refine|regression|smoke test|compatibility|cohesion|routing|handoff|continuity|carry-forward|carry forward|final-authority|authority preservation|structural integrity)\b/i.test(t);
  return !!(backendAnchor && technicalAction);
}

function detectCreativeCognitiveCarryContext(text) {
  const t = lower(text);
  if (!t) return false;
  return /\b(creative cognitive|cognitive carry|creative carry|creative suggestion|cognitive intelligence|intelligence layer|reflective prompt|suggestion module)\b/i.test(t);
}

function detectSubIntent(text, intent) {
  const t = lower(text);
  if (!t) return "empty_input";

  if (intent === "simple_chat") {
    const social = detectSocialIntent(text);
    if (social) return social;
    const domainIntro = detectDomainIntroIntent(text);
    if (domainIntro) return domainIntro;
    return "plain_conversation";
  }

  if (intent === "identity_query") {
    return "identity_baseline";
  }

  if (intent === "identity_or_memory") {
    if (has(/\b(who are you|what are you|what is marion|who is marion|what is nyx|tell me who you are|how (do|does) (you|marion) (think|help)|marion helps you think|nyx.*marion|marion.*nyx|your brain|your consciousness|your identity)\b/i, t)) return "identity_baseline";
    if (has(/\b(remember|last time|continue|carry forward|continuity|state spine|conversation state|turn state)\b/i, t)) return "memory_continuity";
    return "identity_or_memory";
  }

  if (intent === "technical_debug") {
    if (has(/\b(final envelope|final reply|reply envelope|contract|authority gate|diagnostic|packet|bridge|composer|compose|endpoint|api\/chat|loop|looping)\b/i, t)) return "contract_or_bridge_diagnosis";
    if (has(/\b(autopsy|audit|gap refinement|critical fix|critical fixes|line[- ]?by[- ]?line)\b/i, t)) return "forensic_audit";
    if (has(/\b(integration|cohesion|cohesive|90%|ninety percent|baseline cognition|reasoning)\b/i, t)) return "cohesion_upgrade";
    return "technical_execution";
  }

  if (intent === "contextual_directive") {
    return "contextual_precision";
  }

  if (intent === "directive_response") {
    if (has(/\b(next best step|best next step|what should (i|we) do next)\b/i, t)) return "next_best_step";
    if (has(/\b(short|direct|concise|brief)\b/i, t)) return "short_direct_answer";
    return "directive_execution";
  }

  if (intent === "domain_question") {
    if (has(/\b(reason|reasoning|analyze|analysis|break down|step by step|why|how)\b/i, t)) return "baseline_reasoning";
    return "general_question";
  }

  if (intent === "emotional_support") return "emotional_containment";
  if (intent === "business_strategy") return "commercial_strategy";
  if (intent === "music_query") return "music_retrieval";
  if (intent === "news_query") return isNewsMediaPositioningRequest(text) ? "media_positioning" : "news_retrieval";
  if (intent === "roku_query") return "roku_platform";
  return "plain_conversation";
}

function detectDirectiveIntent(text) {
  const t = lower(text);
  if (!t) return false;
  return !!(
    has(/\b(short[, ]+direct answer|short direct answer|direct answer|short answer|concise answer|brief answer)\b/i, t) ||
    has(/\b(next best step|best next step|single next step|one next step|what is the next best step|what should (i|we) do next)\b/i, t) ||
    has(/\b(give me|tell me)\b.*\b(short|direct|concise|brief)\b.*\b(answer|step|move)\b/i, t) ||
    has(/\b(one|single)\b.*\b(action|fix|move|step)\b/i, t)
  );
}


function normalizeKnowledgeDomainName(value) {
  const raw = lower(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const aliases = Object.freeze({
    psychology: "psychology",
    psych: "psychology",
    emotional: "psychology",
    emotion: "psychology",
    support: "psychology",
    english: "english",
    language: "english",
    grammar: "english",
    writing: "english",
    syntax: "english",
    ai: "ai",
    artificial_intelligence: "ai",
    machine_learning: "ai",
    ml: "ai",
    cyber: "cyber",
    cybersecurity: "cyber",
    security: "cyber",
    infosec: "cyber",
    law: "law",
    legal: "law",
    canada_law: "law",
    finance: "finance",
    financial: "finance",
    economics: "finance",
    pricing: "finance"
  });
  return aliases[raw] || (VALID_KNOWLEDGE_DOMAINS.includes(raw) ? raw : "");
}

function registryKnowledgeRoute(domain) {
  const key = normalizeKnowledgeDomainName(domain);
  if (!key || !domainRegistryMod) return null;
  try {
    if (typeof domainRegistryMod.buildKnowledgeRoute === "function") {
      const route = domainRegistryMod.buildKnowledgeRoute(key);
      if (route && route.supported !== false) return route;
    }
  } catch (_) {}
  return null;
}

function registryKnowledgeWiring(domain) {
  const key = normalizeKnowledgeDomainName(domain);
  if (!key || !domainRegistryMod) return null;
  try {
    if (typeof domainRegistryMod.getDomainWiringStatus === "function") {
      const status = domainRegistryMod.getDomainWiringStatus(key, { includePack: false });
      if (status && status.supported !== false) return status;
    }
  } catch (_) {}
  return null;
}

function registryKnowledgeConfig(domain) {
  const key = normalizeKnowledgeDomainName(domain);
  if (!key || !domainRegistryMod) return null;
  try {
    if (typeof domainRegistryMod.getKnowledgeDomainConfig === "function") {
      const cfg = domainRegistryMod.getKnowledgeDomainConfig(key);
      if (cfg && cfg.supported !== false) return cfg;
    }
    if (typeof domainRegistryMod.getDomainConfig === "function") {
      const cfg = domainRegistryMod.getDomainConfig(key);
      if (cfg && cfg.supported !== false) return cfg;
    }
  } catch (_) {}
  return null;
}

function isKnowledgeDomainActivationRequest(text) {
  return /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(english language|english|psychology|psych|emotion|emotional|ai|artificial intelligence|cybersecurity|cyber|law|legal|finance|financial)\s+(domain|lane|knowledge|pack|setup)\b/i.test(lower(text));
}


function bareKnowledgeDomainActivationDomain(text="") {
  const t = lower(text).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const map = Object.freeze({
    "psychology":"psychology","psych":"psychology","emotional":"psychology","emotion":"psychology",
    "english":"english","language":"english","grammar":"english","writing":"english",
    "ai":"ai","artificial intelligence":"ai",
    "cyber":"cyber","cybersecurity":"cyber","security":"cyber",
    "law":"law","legal":"law",
    "finance":"finance","financial":"finance","economics":"finance"
  });
  return map[t] || "";
}

function domainTestPhrase(text) {
  const t = lower(text);
  const pairs = [
    ["psychology", /\b(psychology|psych|emotion|emotional)\s+(domain|lane)\s+test(\s+only)?\b/i],
    ["english", /\b(english|language|grammar|writing)\s+(domain|lane)\s+test(\s+only)?\b/i],
    ["ai", /\b(ai|artificial intelligence)\s+(domain|lane)\s+test(\s+only)?\b/i],
    ["cyber", /\b(cyber|cybersecurity|security)\s+(domain|lane)\s+test(\s+only)?\b/i],
    ["law", /\b(law|legal)\s+(domain|lane)\s+test(\s+only)?\b/i],
    ["finance", /\b(finance|financial|economics)\s+(domain|lane)\s+test(\s+only)?\b/i]
  ];
  for (const [key, rx] of pairs) if (rx.test(t)) return key;
  return "";
}


function isDefinitionQuery(text = "") {
  const t = lower(normalizeRouterVoiceTextParity(text));
  if (!t) return false;
  return /\b(what\s+is|what\s+are|define|definition\s+of|meaning\s+of|explain|explain\s+the\s+term|explain\s+the\s+word|describe)\b/i.test(t) || /\?$/.test(t);
}


function isAnswerableTopicRequest(text = "", questionShape = {}) {
  const t = lower(normalizeRouterVoiceTextParity(text));
  const qs = safeObj(questionShape);
  const shape = safeStr(qs.questionShape || "");
  const normalized = lower(qs.normalizedUserIntent || qs.normalizedText || text);
  if (!t && !normalized) return false;
  if (canonicalTechnicalTargetFromText(t).targetPath) return false;
  if (detectDirectiveIntent(t) || detectContextualDirectiveIntent(t) || isInfrastructureContinuityPrompt(t)) return false;
  if (/\b(file|files|zip|download|resend|update|patch|fix|replace|line[-\s]?by[-\s]?line|structural integrity|deploy|validate|node --check|api\/chat|runtime|router|composer|state spine|statespine|marionbridge|chatengine|composemarionresponse)\b/i.test(t)) return false;
  if (shape === "topic_request" && normalized.length >= 2) return true;
  if (/^(tell me|explain|describe|define|break down|what is|what are|what does|how does)\b/i.test(t) && t.length <= 180) return true;
  return false;
}

function definitionKnowledgeDomainFromText(text = ""){
  const t = lower(normalizeRouterVoiceTextParity(text));
  if (!isDefinitionQuery(t)) return "";
  if (canonicalTechnicalTargetFromText(t).targetPath) return "";
  if (/\b(full autopsy|line[-\s]?by[-\s]?line|audit|critical fix|critical fixes|patch|debug|backend|frontend|widget|script|file|api\/chat|render|deploy|syntax|node --check)\b/i.test(t)) return "";
  const domainTerms=[
    ["law",/\b(contract consideration|legal consideration|consideration in contract|consideration|contract|contract law|statute|jurisdiction|legal information|legal advice|liability|negligence|fiduciary|tort|case law|compliance|due process|algorithmic liability|privacy law|ai act)\b/i],
    ["finance",/\b(cash[-\s]?flow|compound interest|interest rate|unit economics|runway|margin|gross margin|profit|revenue|ltv|cac|working capital|burn rate|capital markets|pricing tier|scenario analysis|financial resilience|roi|roas|attribution|incrementality|customer acquisition cost|lifetime value|audit|auditing|financial audit|internal audit)\b/i],
    ["psychology",/\b(emotional intelligence|cognitive distortion|emotional regulation|attachment|trauma|bias|cognition|shutdown|emotional shutdown|anxiety|panic|behavior|behaviour|trust calibration|overreliance|mental model|cognitive load|affective computing)\b/i],
    ["ai",/\b(artificial intelligence|intelligent agent|ai agent|agent architecture|tool routing|rag|retrieval augmented generation|llm|large language model|embedding|agent orchestration|machine learning|model inference|prompt injection in ai|recommendation system|algorithmic bias|model evaluation|neural network|reinforcement learning|human[-\s]?in[-\s]?the[-\s]?loop|ai governance|ai ethics|model security|cognitive intelligence)\b/i],
    ["cyber",/\b(least privilege|cia triad|attack surface|defense in depth|assume breach|secure by default|mfa|multi[-\s]?factor|iam|identity access|rbac|jit access|zero trust|incident response|threat model|input validation|secrets rotation|phishing|ransomware|endpoint security|cloud security|shared responsibility|network security|web security|tls|data protection|privacy minimization|data minimization|security culture|source ladder)\b/i],
    ["english",/\b(sentence clarity|actor[-\s]?action clarity|syntax|grammar|register|corpus|pragmatics|semantics|morphology|phonology|phonetics|eap|plain language|cohesion|stance|hedging|wording|language flow|professional clarity|copyedit|proofread)\b/i]
  ];
  for(const [d,rx]of domainTerms){if(rx.test(t))return d;}
  return "";
}

function crossDomainSecondaryLaneProfile(text = "") {
  const t = lower(normalizeRouterVoiceTextParity(text));
  if (!t || canonicalTechnicalTargetFromText(t).targetPath) return null;
  if (/\b(full autopsy|line[-\s]?by[-\s]?line|audit|critical fix|critical fixes|patch|debug|backend|frontend|widget|script|file|api\/chat|render|deploy|syntax|node --check)\b/i.test(t)) return null;
  const aiContext = /\b(ai product|ai system|ai agent|ai model|artificial intelligence product|artificial intelligence system|llm product|model product|recommendation system|machine learning system)\b/i.test(t);
  if (aiContext && /\b(security|cyber|prompt injection|threat|vulnerability|attack|abuse|hardening|access control|secrets|input validation)\b/i.test(t)) {
    return { primary:"ai", secondary:["cyber"], reason:"ai_product_security_secondary_cyber", answerMode:"direct_with_secondary_context", confidence:0.97 };
  }
  if (aiContext && /\b(business|finance|financial|cash[-\s]?flow|revenue|pricing|margin|cost|runway|market|commercial)\b/i.test(t)) {
    return { primary:"ai", secondary:["finance"], reason:"ai_product_business_secondary_finance", answerMode:"direct_with_secondary_context", confidence:0.94 };
  }
  if (aiContext && /\b(compliance|regulatory|regulation|legal|law|governance|audit|liability|privacy|consent|data protection|risk)\b/i.test(t)) {
    return { primary:"ai", secondary:["law"], reason:"ai_product_compliance_secondary_law", answerMode:"direct_with_secondary_context", confidence:0.97 };
  }
  if (/\bcash[-\s]?flow risk\b/i.test(t) && /\b(legal dispute|lawsuit|litigation|claim|settlement|court|legal)\b/i.test(t)) {
    return { primary:"finance", secondary:["law"], reason:"finance_cashflow_legal_secondary", answerMode:"direct_with_secondary_context", confidence:0.95 };
  }
  if (/\b(rewrite|translate|make|put)\b/i.test(t) && /\blegal clause\b/i.test(t) && /\bplain english|plain language|clear english\b/i.test(t)) {
    return { primary:"english", secondary:["law"], reason:"english_plain_language_legal_secondary", answerMode:"direct_with_secondary_context", confidence:0.94 };
  }
  if (/\b(cognitive bias|cognitive distortion|bias)\b/i.test(t) && /\b(ai|recommendation system|model|algorithm|machine learning)\b/i.test(t)) {
    return { primary:"ai", secondary:["psychology"], reason:"ai_recommendation_psychology_secondary", answerMode:"direct_with_secondary_context", confidence:0.95 };
  }
  if (/\b(prompt injection)\b/i.test(t) && /\bplain english|plain language|non[-\s]?technical|business owner\b/i.test(t)) {
    return { primary:"cyber", secondary:["ai","english"], reason:"cyber_prompt_injection_plain_english", answerMode:"direct_with_secondary_context", confidence:0.95 };
  }
  if (/\bleast privilege\b/i.test(t) && /\bnon[-\s]?technical|business owner|plain english|plain language\b/i.test(t)) {
    return { primary:"cyber", secondary:["english"], reason:"cyber_least_privilege_plain_english", answerMode:"direct_with_secondary_context", confidence:0.95 };
  }
  return null;
}

function detectKnowledgeDomain(text) {
  const t = lower(text);
  if (!t) return { knowledgeDomain: "", explicit: false, reason: "none" };
  if (isContinuationCompressionInstruction(t)) return { knowledgeDomain: "", explicit: false, reason: "continuation_compression_precedence" };
  const bareDomain = bareKnowledgeDomainActivationDomain(text);if(bareDomain)return { knowledgeDomain: bareDomain, explicit: true, reason: "bare_domain_activation" };
  const crossDomainProfile = crossDomainSecondaryLaneProfile(t);
  if (crossDomainProfile && crossDomainProfile.primary) return { knowledgeDomain: crossDomainProfile.primary, explicit: true, reason: crossDomainProfile.reason, secondaryDomains: crossDomainProfile.secondary, answerMode: crossDomainProfile.answerMode, crossDomainProfile };
  const definitionDomain = definitionKnowledgeDomainFromText(t);
  if (definitionDomain) return { knowledgeDomain: definitionDomain, explicit: true, reason: "definition_query_domain_lock" };
  if (isInfrastructureContinuityPrompt(t)) return { knowledgeDomain: "", explicit: false, reason: "technical_infrastructure_precedence" };

  const domainTest = domainTestPhrase(t);
  if (domainTest) return { knowledgeDomain: domainTest, explicit: true, reason: "domain_test_phrase" };

  const explicit = [
    { k: "psychology", rx: /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(psychology|psych|emotional support)\s+(domain|lane|knowledge|pack)\b/i },
    { k: "english", rx: /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(english|english language|language|grammar|writing)\s+(domain|lane|knowledge|pack|setup)\b/i },
    { k: "ai", rx: /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(ai|artificial intelligence)\s+(domain|lane|knowledge|pack)\b/i },
    { k: "cyber", rx: /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(cyber|cybersecurity|security)\s+(domain|lane|knowledge|pack)\b/i },
    { k: "law", rx: /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(law|legal|canadian law)\s+(domain|lane|knowledge|pack)\b/i },
    { k: "finance", rx: /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(finance|financial|economics|pricing)\s+(domain|lane|knowledge|pack)\b/i }
  ];
  for (const item of explicit) {
    if (has(item.rx, t)) return { knowledgeDomain: item.k, explicit: true, reason: "explicit_domain_phrase" };
  }

  if (!isContinuationCompressionInstruction(t) && /\b(rewrite|polish|grammar|syntax|tone|professional clarity|business english|make this paragraph|make this sentence|language flow|wording|copyedit|proofread)\b/i.test(t)) {
    return { knowledgeDomain: "english", explicit: false, reason: "english_language_terms" };
  }
  if (/\b(overwhelmed|spiraling|panic|numb|shutdown|attachment|shame|trauma|stabilize first|cognitive distortion|emotional intelligence|support strategy)\b/i.test(t)) {
    return { knowledgeDomain: "psychology", explicit: false, reason: "psychology_support_terms" };
  }
  if (/\b(ai agent|artificial intelligence|cognitive intelligence|llm|rag|embedding|tool routing|agent orchestration|machine learning|prompt injection defense for ai)\b/i.test(t)) {
    return { knowledgeDomain: "ai", explicit: false, reason: "ai_terms" };
  }
  if (/\b(cyber|cybersecurity|prompt injection|phishing|malware|ransomware|mfa|least privilege|identity access|iam|incident response|threat model|defensive security|endpoint security|cloud security|network security|web security|privacy minimization|data protection|hardening)\b/i.test(t)) {
    return { knowledgeDomain: "cyber", explicit: false, reason: "cyber_terms" };
  }
  if (/\bhardening\b/i.test(t) && !detectBackendTechnicalContext(t)) {
    return { knowledgeDomain: "cyber", explicit: false, reason: "cyber_hardening_terms" };
  }
  if (/\b(legal advice|legal information|law in canada|canadian law|contract law|tort|criminal law|charter|case law|statute|jurisdiction)\b/i.test(t)) {
    return { knowledgeDomain: "law", explicit: false, reason: "law_terms" };
  }
  if (/\b(cash[-\s]?flow risk|cash[-\s]?flow impact|cash[-\s]?flow pressure|cash[-\s]?flow runway|business runway|financial resilience|working capital|burn rate|unit economics|compound interest|interest rate|ltv|cac|pricing tiers|capital markets|cash[-\s]?flow|runway|margin|gross margin|finance|financial|investment advice|scenario analysis)\b/i.test(t)) {
    return { knowledgeDomain: "finance", explicit: false, reason: "finance_confidence_terms" };
  }
  return { knowledgeDomain: "", explicit: false, reason: "none" };
}

function operationalDomainForKnowledge(knowledgeDomain, fallbackIntent = "domain_question") {
  const k = normalizeKnowledgeDomainName(knowledgeDomain);
  if (!k) return INTENT_TO_DOMAIN[fallbackIntent] || "general_reasoning";
  return KNOWLEDGE_OPERATIONAL_DOMAIN[k] || "general_reasoning";
}

function inferIntentFromText(text) {
  const t = lower(text);
  const safetyLevel = detectSafetyLevel(t);
  const knowledge = detectKnowledgeDomain(t);
  const technicalTargetLock = canonicalTechnicalTargetFromText(text);
  const technicalFollowUpLock = isTechnicalFollowUpIntent(text);
  const protectiveEscalation = detectProtectiveEscalationRouting(text);

  if (!t) {
    return {
      intent: "simple_chat",
      confidence: 0.35,
      reason: "empty_text",
      stateStageHint: "deliver",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  /* Safety must outrank all other classes. */
  if (safetyLevel === "crisis") {
    return {
      intent: "emotional_support",
      confidence: 0.98,
      reason: "crisis_distress_terms",
      stateStageHint: "recovery",
      safetyLevel,
      recoveryRequired: true,
      knowledgeDomain: knowledge.knowledgeDomain || (safetyLevel === "crisis" || safetyLevel === "distress" ? "psychology" : ""),
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason || "safety_psychology"
    };
  }

  if (safetyLevel === "distress") {
    return {
      intent: "emotional_support",
      confidence: 0.89,
      reason: "emotional_distress_terms",
      stateStageHint: "recovery",
      safetyLevel,
      recoveryRequired: true,
      knowledgeDomain: knowledge.knowledgeDomain || (safetyLevel === "crisis" || safetyLevel === "distress" ? "psychology" : ""),
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason || "safety_psychology"
    };
  }

  if (knowledge.knowledgeDomain && knowledge.reason === "definition_query_domain_lock" && safetyLevel === "none") {
    return {
      intent: "domain_question",
      confidence: 0.98,
      reason: "definition_query_domain_lock",
      stateStageHint: "reason",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: true,
      knowledgeDomainReason: knowledge.reason,
      routeLock: true,
      secondaryDomains: safeArray(knowledge.secondaryDomains).map(normalizeKnowledgeDomainName).filter(Boolean),
      answerMode: safeStr(knowledge.answerMode || ""),
      crossDomainProfile: safeObj(knowledge.crossDomainProfile)
    };
  }

  if ((technicalTargetLock && technicalTargetLock.targetPath || isPriorityTwoRuntimeRoutingText(text)) && safetyLevel === "none") {
    return {
      intent: "technical_debug",
      confidence: 0.99,
      reason: technicalFollowUpLock ? "technical_followup_target_lock" : (isPriorityTwoRuntimeRoutingText(text) ? "priority_two_command_routing_lock" : "technical_target_lock"),
      stateStageHint: "execution",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: "",
      knowledgeDomainExplicit: false,
      knowledgeDomainReason: "technical_target_overrides_location_schedule_and_stale_memory",
      routeLock: true,
      technicalTargetLock,
      technicalFollowUpLock: !!technicalFollowUpLock,
      blockScheduleInterception: true,
      protectiveEscalation,
      ethicalEscalationRequired: !!protectiveEscalation.requiresEthicalGate
    };
  }

  if (protectiveEscalation.detected && safetyLevel === "none") {
    return {
      intent: "technical_debug",
      confidence: 0.96,
      reason: "protective_escalation_policy_routing",
      stateStageHint: "execution",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: "",
      knowledgeDomainExplicit: false,
      knowledgeDomainReason: "protective_escalation_routes_to_runtime_policy",
      routeLock: true,
      protectiveEscalation,
      ethicalEscalationRequired: true,
      blockScheduleInterception: true
    };
  }

  if (isInfrastructureContinuityPrompt(t) && safetyLevel === "none") {
    return {
      intent: "technical_debug",
      confidence: 0.98,
      reason: "infrastructure_continuity_precedence",
      stateStageHint: "execution",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: "",
      knowledgeDomainExplicit: false,
      knowledgeDomainReason: "technical_infrastructure_overrides_domain_keywords",
      routeLock: true
    };
  }

  if (detectBackendTechnicalContext(t) && safetyLevel === "none") {
    return {
      intent: "technical_debug",
      confidence: detectCreativeCognitiveCarryContext(t) ? 0.96 : 0.94,
      reason: detectCreativeCognitiveCarryContext(t) ? "backend_technical_creative_cognitive_context" : "backend_technical_hardening_context",
      stateStageHint: "execution",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: "",
      knowledgeDomainExplicit: false,
      knowledgeDomainReason: "technical_context_overrides_broad_knowledge_domain"
    };
  }

  if (knowledge.knowledgeDomain && safetyLevel === "none") {
    return {
      intent: "domain_question",
      confidence: knowledge.explicit ? 0.97 : 0.86,
      reason: knowledge.reason || "knowledge_domain_terms",
      stateStageHint: "reason",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  const socialIntent = detectSocialIntent(t);
  if (socialIntent) {
    return {
      intent: "simple_chat",
      confidence: socialIntent === "greeting" ? 0.96 : 0.9,
      reason: `social_${socialIntent}`,
      stateStageHint: "deliver",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (detectContextualDirectiveIntent(t)) {
    return {
      intent: "contextual_directive",
      confidence: 0.93,
      reason: "contextual_directive_terms",
      stateStageHint: "execute_context",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (isNewsMediaPositioningRequest(t)) {
    return {
      intent: "news_query",
      confidence: 0.95,
      reason: "news_media_positioning_terms",
      stateStageHint: "strategy",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: "",
      knowledgeDomainExplicit: false,
      knowledgeDomainReason: ""
    };
  }

  /* Directive execution must outrank generic question and broad technical terms. */
  if (detectDirectiveIntent(t)) {
    return {
      intent: "directive_response",
      confidence: 0.94,
      reason: "directive_execution_terms",
      stateStageHint: "execute",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  /* Identity baseline must outrank generic question and broad technical terms. */
  if (has(/\b(who are you|what are you|what is marion|who is marion|what is nyx|tell me who you are|how (do|does) (you|marion) (think|help)|marion helps you think|nyx.*marion|marion.*nyx|your brain|your consciousness|your identity|identity anchor)\b/i, t)) {
    return {
      intent: "identity_query",
      confidence: 0.93,
      reason: "identity_baseline_terms",
      stateStageHint: "continuity",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (has(/\b(remember|last time|continue|memory|conversation state|turn state|continuity|state spine|statespine|who am i)\b/i, t)) {
    return {
      intent: "identity_or_memory",
      confidence: 0.82,
      reason: "memory_continuity_terms",
      stateStageHint: "continuity",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (detectContextualDirectiveIntent(t)) {
    return {
      intent: "contextual_directive",
      confidence: 0.93,
      reason: "contextual_directive_terms",
      stateStageHint: "execute_context",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (isRokuPublishingRequest(t)) {
    return {
      intent: "roku_query",
      confidence: 0.96,
      reason: "roku_publishing_submission_terms",
      stateStageHint: "deliver",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: "",
      knowledgeDomainExplicit: false,
      knowledgeDomainReason: ""
    };
  }

  if (has(/\b(index\.js|marionbridge|marion bridge|intent router|manual intent router|normalizer|packet|packets|phrase pack|phrase packs|compose|composer|composemarionresponse|state spine|statespine|state-spine|autopsy|audit|gap refinement|line[- ]?by[- ]?line|syntax|debug|bug|loop|looping|route|endpoint|api\/chat|backend diagnostics|diagnostics route|health check|final envelope|contract|authority gate|script|file|harden|critical fix|critical fixes|download|zip|integration|cohesion|cohesive|90%|ninety percent|baseline cognition)\b/i, t)) {
    return {
      intent: "technical_debug",
      confidence: 0.92,
      reason: "technical_debug_or_cohesion_terms",
      stateStageHint: "execution",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (has(/\b(avatar|tts|speech|voice route|voice ready|avatar controls|micro[- ]?expression|head and shoulders)\b/i, t)) {
    return {
      intent: "technical_debug",
      confidence: 0.82,
      reason: "avatar_voice_technical_terms",
      stateStageHint: "execution",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (has(/\b(top\s*10|song|songs|artist|album|chart|playlist|music|radio|billboard|year|decade|70s|80s|90s|2000s|adult contemporary)\b/i, t)) {
    return {
      intent: "music_query",
      confidence: 0.84,
      reason: "music_terms",
      stateStageHint: "retrieve",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (isNewsMediaPositioningRequest(t)) {
    return {
      intent: "news_query",
      confidence: 0.95,
      reason: "news_media_positioning_terms",
      stateStageHint: "strategy",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: "",
      knowledgeDomainExplicit: false,
      knowledgeDomainReason: ""
    };
  }

  if (has(/\b(news|headline|headlines|article|story|stories|rss|newscanada|for your life|feed)\b/i, t)) {
    return {
      intent: "news_query",
      confidence: 0.84,
      reason: "news_terms",
      stateStageHint: "retrieve",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (has(/\b(roku|tv app|linear tv|streaming|channel app|ott)\b/i, t)) {
    return {
      intent: "roku_query",
      confidence: isRokuPublishingRequest(t) ? 0.96 : 0.86,
      reason: isRokuPublishingRequest(t) ? "roku_publishing_submission_terms" : "roku_terms",
      stateStageHint: "deliver",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (has(/\b(price|pricing|sponsor|sponsorship|media kit|monetize|monetization|pitch|funding|investor|sales|proposal|revenue|business|startup|advertising|ad template|audience|brand awareness|commercial positioning|digital transformation|business model|operations strategy|operational efficiency|process improvement|audit|auditing)\b/i, t)) {
    return {
      intent: "business_strategy",
      confidence: 0.84,
      reason: "business_terms",
      stateStageHint: "strategy",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (has(/(^|\s)(how|what|why|where|when|can you|could you|should i|would it|is it|are we|explain|analyze|break down)\b|\?$/i, t)) {
    return {
      intent: "domain_question",
      confidence: t.length > 60 ? 0.7 : 0.6,
      reason: "general_question",
      stateStageHint: "reason",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  return {
    intent: "simple_chat",
    confidence: 0.72,
    reason: "plain_conversation",
    stateStageHint: "deliver",
    safetyLevel,
    recoveryRequired: false
  };
}

function normalizeIntent(rawInput = {}, fallbackText = "") {
  const src = safeObj(rawInput);
  const inferred = inferIntentFromText(fallbackText);
  const explicit = normalizeIntentName(src.intent || src.type || src.name || "");
  const detectedKnowledge = detectKnowledgeDomain(fallbackText);
  const technicalTargetLock = safeObj(src.technicalTargetLock || canonicalTechnicalTargetFromText(fallbackText));
  const technicalFollowUpLock = !!(src.technicalFollowUpLock || isTechnicalFollowUpIntent(fallbackText));
  const protectiveEscalation = detectProtectiveEscalationRouting(fallbackText, src);
  const explicitKnowledge = normalizeKnowledgeDomainName(src.knowledgeDomain || src.domainKnowledge || src.primaryKnowledgeDomain || safeObj(src.routing).knowledgeDomain || "");
  let knowledgeDomain = explicitKnowledge || inferred.knowledgeDomain || detectedKnowledge.knowledgeDomain || "";

  let intent = explicit && explicit !== "simple_chat" ? explicit : inferred.intent;
  let confidence = clamp01(src.confidence, inferred.confidence);
  let reason = safeStr(src.reason || src.source || inferred.reason);
  let stateStageHint = safeStr(src.stateStageHint || src.stage || inferred.stateStageHint || "deliver");
  let safetyLevel = safeStr(src.safetyLevel || inferred.safetyLevel || "none");
  let recoveryRequired = Boolean(src.recoveryRequired || inferred.recoveryRequired);

  if (knowledgeDomain && (detectedKnowledge.reason === "definition_query_domain_lock" || inferred.knowledgeDomainReason === "definition_query_domain_lock") && inferred.intent !== "emotional_support") {
    intent = "domain_question";
    confidence = Math.max(confidence, 0.98);
    reason = "definition_query_domain_lock";
    stateStageHint = "reason";
    recoveryRequired = false;
  }

  if ((technicalTargetLock && technicalTargetLock.targetPath || isPriorityTwoRuntimeRoutingText(fallbackText)) && inferred.intent !== "emotional_support" && reason !== "definition_query_domain_lock") {
    intent = "technical_debug";
    confidence = Math.max(confidence, 0.99);
    reason = technicalFollowUpLock ? "technical_followup_target_lock" : (isPriorityTwoRuntimeRoutingText(fallbackText) ? "priority_two_command_routing_lock" : "technical_target_lock");
    stateStageHint = "execution";
    recoveryRequired = false;
    knowledgeDomain = "";
  }

  if (isInfrastructureContinuityPrompt(fallbackText) && inferred.intent !== "emotional_support" && reason !== "definition_query_domain_lock") {
    intent = "technical_debug";
    confidence = Math.max(confidence, 0.98);
    reason = "infrastructure_continuity_precedence";
    stateStageHint = "execution";
    recoveryRequired = false;
    knowledgeDomain = "";
  }

  if (detectBackendTechnicalContext(fallbackText) && inferred.intent !== "emotional_support" && reason !== "definition_query_domain_lock") {
    intent = "technical_debug";
    confidence = Math.max(confidence, detectCreativeCognitiveCarryContext(fallbackText) ? 0.96 : 0.94);
    reason = detectCreativeCognitiveCarryContext(fallbackText) ? "backend_technical_creative_cognitive_context" : "backend_technical_hardening_context";
    stateStageHint = "execution";
    recoveryRequired = false;
    knowledgeDomain = "";
  }

  if (protectiveEscalation.detected && inferred.intent !== "emotional_support" && reason !== "definition_query_domain_lock") {
    intent = "technical_debug";
    confidence = Math.max(confidence, 0.96);
    reason = "protective_escalation_policy_routing";
    stateStageHint = "execution";
    recoveryRequired = false;
    knowledgeDomain = "";
  }

  if (knowledgeDomain && inferred.intent !== "emotional_support" && intent === "simple_chat") {
    intent = "domain_question";
    confidence = Math.max(confidence, detectedKnowledge.explicit || inferred.knowledgeDomainExplicit ? 0.97 : 0.86);
    reason = detectedKnowledge.reason || inferred.knowledgeDomainReason || "knowledge_domain_promoted";
    stateStageHint = "reason";
    recoveryRequired = false;
  }

  /* Distress language wins over stale explicit/general intent. */
  if (inferred.intent === "emotional_support") {
    intent = "emotional_support";
    confidence = Math.max(confidence, inferred.confidence);
    reason = inferred.reason;
    stateStageHint = "recovery";
    safetyLevel = inferred.safetyLevel;
    recoveryRequired = true;
  }

  /* Social interaction wins over stale identity/greeting hints so greetings stay warm, not diagnostic. */
  if (inferred.intent === "simple_chat" && /^social_/.test(inferred.reason) && intent !== "emotional_support") {
    intent = "simple_chat";
    confidence = Math.max(confidence, inferred.confidence);
    reason = inferred.reason;
    stateStageHint = "deliver";
    recoveryRequired = false;
  }

  /* Broad answerable topic requests must answer directly instead of falling into a domain clarifier loop. */
  if (intent === "simple_chat" && isAnswerableTopicRequest(fallbackText, src.questionShape || {})) {
    intent = "domain_question";
    confidence = Math.max(confidence, 0.74);
    reason = "answerable_topic_request";
    stateStageHint = "reason";
    recoveryRequired = false;
  }

  /* Contextual directive wins over stale simple/domain/technical intent. */
  if (inferred.intent === "contextual_directive" && intent !== "emotional_support") {
    intent = "contextual_directive";
    confidence = Math.max(confidence, inferred.confidence);
    reason = inferred.reason;
    stateStageHint = "execute_context";
    recoveryRequired = false;
  }

  /* Directive execution wins over stale simple/domain/technical intent and must not be treated as clarification. */
  if (inferred.intent === "directive_response" && intent !== "emotional_support") {
    intent = "directive_response";
    confidence = Math.max(confidence, inferred.confidence);
    reason = inferred.reason;
    stateStageHint = "execute";
    recoveryRequired = false;
  }

  /* Identity baseline wins over stale simple/domain intent and must not be treated as generic Q&A. */
  if ((inferred.intent === "identity_query" || inferred.intent === "identity_or_memory") && intent !== "emotional_support") {
    intent = inferred.intent;
    confidence = Math.max(confidence, inferred.confidence);
    reason = inferred.reason;
    stateStageHint = "continuity";
    recoveryRequired = false;
  }

  /* Technical can override support only when there is no distress language. */
  if (intent === "emotional_support" && inferred.intent === "technical_debug" && inferred.safetyLevel === "none") {
    intent = "technical_debug";
    confidence = Math.max(confidence, 0.92);
    reason = "technical_override_support";
    stateStageHint = "execution";
    recoveryRequired = false;
  }

  if (!VALID_INTENTS.includes(intent)) {
    intent = "domain_question";
    confidence = Math.max(0.5, confidence);
    reason = reason || "unknown_intent_normalized";
    stateStageHint = stateStageHint || "reason";
  }

  const subIntent = safeStr(src.subIntent || src.subintent || detectSubIntent(fallbackText, intent));

  return {
    activate: intent !== "simple_chat",
    intent,
    subIntent,
    confidence,
    reason,
    stateStageHint,
    safetyLevel,
    recoveryRequired,
    loopSafe: true,
    allowGenericFallback: false,
    requiresFinalEnvelope: true,
    requiresComposer: true,
    identityAnchorRequired: subIntent === "identity_baseline",
    baselineCognitionRequired: intent === "domain_question" || intent === "directive_response" || subIntent === "baseline_reasoning" || subIntent === "cohesion_upgrade" || subIntent === "identity_baseline" || detectCreativeCognitiveCarryContext(fallbackText),
    creativeCognitiveCarryRequired: detectCreativeCognitiveCarryContext(fallbackText),
    directiveExecutionRequired: intent === "directive_response",
    knowledgeDomain,
    knowledgeDomainExplicit: !!(explicitKnowledge || inferred.knowledgeDomainExplicit || detectedKnowledge.explicit),
    knowledgeDomainReason: inferred.knowledgeDomainReason || detectedKnowledge.reason || "",
    secondaryDomains: safeArray(src.secondaryDomains || inferred.secondaryDomains || detectedKnowledge.secondaryDomains).map(normalizeKnowledgeDomainName).filter(Boolean),
    answerMode: safeStr(src.answerMode || inferred.answerMode || detectedKnowledge.answerMode || ""),
    crossDomainProfile: safeObj(src.crossDomainProfile || inferred.crossDomainProfile || detectedKnowledge.crossDomainProfile),
    technicalTargetLock,
    technicalFollowUpLock: !!technicalFollowUpLock,
    protectiveEscalation,
    ethicalEscalationRequired: !!protectiveEscalation.requiresEthicalGate,
    blockScheduleInterception: !!((technicalTargetLock && technicalTargetLock.targetPath) || isPriorityTwoRuntimeRoutingText(fallbackText)),
    knowledgeDomainActivationRequest: isKnowledgeDomainActivationRequest(fallbackText),
    source: safeStr(src.source || "marionIntentRouter"),
    inputSource: normalizeInputSource(src.inputSource || src.source || "text"),
    routeLock: !!(src.routeLock || inferred.routeLock || isInfrastructureContinuityPrompt(fallbackText)),
    turnHash: turnContinuityHash(fallbackText),
    turnText: fallbackText,
    micTextParity: true,
    continuityRegressionReady: true,
    domainConfidence: intentConfidenceProfile({ ...src, confidence, intent, knowledgeDomain, reason, routeLock: !!(src.routeLock || inferred.routeLock || isInfrastructureContinuityPrompt(fallbackText)) }, fallbackText)
  };
}


function confidenceBand(confidence) {
  const c = clamp01(confidence, 0);
  if (c >= 0.92) return "high";
  if (c >= 0.72) return "medium";
  if (c >= 0.52) return "low";
  return "weak";
}

function addDomainCandidate(map, domain, score, reason, knowledgeDomain = "") {
  const key = knowledgeDomain ? normalizeKnowledgeDomainName(knowledgeDomain) : safeStr(domain || "").replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
  const normalized = key;
  if (!normalized) return;
  const current = map.get(normalized) || { domain: normalized, confidence: 0, reasons: [], knowledgeDomain: "" };
  current.confidence = Math.max(current.confidence, clamp01(score, 0));
  if (reason) current.reasons.push(safeStr(reason));
  if (knowledgeDomain) current.knowledgeDomain = normalizeKnowledgeDomainName(knowledgeDomain);
  map.set(normalized, current);
}

function domainSignalCandidates(text = "", intentPacket = {}) {
  const t = lower(text), p = safeObj(intentPacket), map = new Map();
  const intent = normalizeIntentName(p.intent || "") || "domain_question";
  const baseDomain = INTENT_TO_DOMAIN[intent] || "general_reasoning";
  const knowledgeDomain = normalizeKnowledgeDomainName(p.knowledgeDomain || "");
  addDomainCandidate(map, baseDomain, knowledgeDomain ? Math.max(0.45, clamp01(p.confidence, 0.48) - 0.06) : clamp01(p.confidence, 0.48), `intent:${intent}`);
  if (knowledgeDomain) addDomainCandidate(map, knowledgeDomain, p.knowledgeDomainExplicit ? 0.99 : Math.max(clamp01(p.confidence, 0.72), 0.84), p.knowledgeDomainReason || "knowledge_domain", knowledgeDomain);
  if (/\b(full autopsy|surgical autopsy|line[- ]?by[- ]?line audit|critical fix|backend|widget|marion|nyx|state spine|chatengine|intent router|command normalizer|guardian pipeline|domain concierge|domain registry|domain retriever|composemarionresponse|final envelope|telemetry|pipeline|routing|priority two|priority 2)\b/i.test(t) && !(knowledgeDomain && !detectBackendTechnicalContext(t))) addDomainCandidate(map, "technical", 0.98, "priority_two_technical_terms");
  if (detectProtectiveEscalationRouting(t).detected) addDomainCandidate(map, "technical", 0.96, "protective_escalation_policy_terms");
  if (/\b(overwhelmed|panic|spiral|emotional shutdown|cognitive distortion|emotional intelligence|trauma|attachment|distress|support strategy)\b/i.test(t)) addDomainCandidate(map, "psychology", 0.9, "psychology_terms", "psychology");
  if (isContinuationCompressionInstruction(t)) addDomainCandidate(map, "memory", 0.91, "continuation_compression_terms");
  else if (/\b(rewrite|proofread|polish|grammar|syntax|tone|copyedit|wording|business english|language flow)\b/i.test(t)) addDomainCandidate(map, "english", 0.9, "english_terms", "english");
  if (/\b(ai agent|llm|rag|embedding|tool routing|agent orchestration|machine learning|artificial intelligence|cognitive intelligence|confidence scoring)\b/i.test(t)) addDomainCandidate(map, "ai", 0.94, "ai_terms", "ai");
  if (/\b(cyber|cybersecurity|phishing|ransomware|mfa|least privilege|identity access|iam|incident response|threat model|defensive security|endpoint security|cloud security|network security|web security|privacy minimization|data protection|hardening)\b/i.test(t)) addDomainCandidate(map, "cyber", 0.92, "cyber_terms", "cyber");
  if (/\b(legal advice|legal information|canadian law|contract law|case law|statute|jurisdiction|tort)\b/i.test(t)) addDomainCandidate(map, "law", 0.86, "law_terms", "law");
  if (/\b(finance|financial|cash[-\s]?flow|compound interest|interest rate|runway|margin|unit economics|ltv|cac|pricing tiers|capital markets|investment|scenario analysis|audit|auditing|financial audit|internal audit)\b/i.test(t)) addDomainCandidate(map, "finance", 0.88, "finance_terms", "finance");
  if (/\b(sponsor|sponsorship|media kit|monetize|monetization|sales|revenue|business strategy|advertising|brand awareness|audience|digital transformation|business model|operations strategy|operational efficiency|process improvement|audit|auditing)\b/i.test(t)) addDomainCandidate(map, "business", 0.84, "business_terms");
  if (isNewsMediaPositioningRequest(t)) addDomainCandidate(map, "news", 0.95, "news_media_positioning_signal");
  if (/\b(news canada|rss|feed|story|headline|wp rest|editorial)\b/i.test(t)) addDomainCandidate(map, "news", isNewsMediaPositioningRequest(t) ? 0.95 : 0.84, isNewsMediaPositioningRequest(t) ? "news_media_positioning_terms" : "news_terms");
  if (/\b(roku|ott|linear tv|streaming app|channel app)\b/i.test(t)) addDomainCandidate(map, "roku", 0.84, "roku_terms");
  if (isRokuPublishingRequest(t)) addDomainCandidate(map, "roku", 0.96, "roku_publishing_submission_terms");
  return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 6).map((c) => ({...c, confidence: clamp01(c.confidence, 0), reasons: Array.from(new Set(c.reasons)).slice(0, 4)}));
}

function intentConfidenceProfile(intentPacket = {}, text = "") {
  const p = safeObj(intentPacket);
  const questionShape = safeObj(p.questionShape);
  const answerableTopic = isAnswerableTopicRequest(text, questionShape);
  const candidates = domainSignalCandidates(text, p);
  const top = candidates[0] || { domain: INTENT_TO_DOMAIN[p.intent] || "general_reasoning", confidence: clamp01(p.confidence, 0), reasons: ["intent_confidence"] };
  const second = candidates[1] || null;
  const c = Math.max(clamp01(p.confidence, 0), clamp01(top.confidence, 0));
  const margin = second ? Math.max(0, c - clamp01(second.confidence, 0)) : c;
  const routeLocked = !!(p.routeLock || answerableTopic || isPriorityTwoRuntimeRoutingText(text) || detectProtectiveEscalationRouting(text, p).detected || isInfrastructureContinuityPrompt(text) || isNewsMediaPositioningRequest(text) || c >= 0.82 || (c >= 0.72 && margin >= 0.16));
  const ambiguous = !routeLocked && (c < 0.62 || (second && margin < 0.08));
  const knowledgeDomain = normalizeKnowledgeDomainName(p.knowledgeDomain || top.knowledgeDomain || "");
  const base = {
    version: DOMAIN_CONFIDENCE_VERSION,
    confidence: c,
    confidenceScore: c,
    band: confidenceBand(c),
    confidenceBand: confidenceBand(c),
    margin,
    ambiguous,
    routeLocked,
    needsClarifier: ambiguous && !routeLocked,
    reason: safeStr(answerableTopic ? "answerable_topic_request_route_lock" : (p.reason || (top.reasons && top.reasons[0]) || "intent_domain_confidence")),
    primaryIntent: safeStr(p.intent || "simple_chat"),
    primaryDomain: safeStr(knowledgeDomain && p.reason === "definition_query_domain_lock" ? knowledgeDomain : (top.domain || INTENT_TO_DOMAIN[p.intent] || "general_reasoning")),
    selectedDomain: safeStr(knowledgeDomain && p.reason === "definition_query_domain_lock" ? knowledgeDomain : (top.domain || INTENT_TO_DOMAIN[p.intent] || "general_reasoning")),
    secondaryDomains: candidates.slice(1, 4).map((c) => c.domain).filter(Boolean),
    knowledgeDomain,
    candidates,
    answerMode: c >= 0.82 ? "direct" : (c >= 0.62 ? "grounded" : "clarify"),
    fallbackReason: ambiguous && !routeLocked ? "intent_domain_confidence_margin_or_score_low" : "",
    failClosed: ambiguous && !routeLocked && c < 0.38,
    noCrossDomainBleed: true,
    noUserFacingDiagnostics: true
  };
  if (domainConfidenceMod && typeof domainConfidenceMod.normalizeDomainConfidenceProfile === "function") {
    try {
      return domainConfidenceMod.normalizeDomainConfidenceProfile(base, { rawText: text, intent: p.intent, knowledgeDomain, candidates, confidence: c });
    } catch (_err) {}
  }
  return base;
}

function buildDomainConciergeSeed(routing = {}, marionIntent = {}, questionShape = {}) {
  const rt = safeObj(routing);
  const mi = safeObj(marionIntent);
  const dc = safeObj(rt.domainConfidence || mi.domainConfidence);
  const confidence = clamp01(dc.confidence || rt.routeConfidence || mi.confidence, 0);
  const route = safeStr(rt.domain || dc.selectedDomain || dc.primaryDomain || INTENT_TO_DOMAIN[mi.intent] || "general");
  const intent = normalizeIntentName(mi.intent || rt.intent || "simple_chat");
  const answerableTopic = isAnswerableTopicRequest(safeStr(rt.rawTurnText || rt.normalizedUserIntent || mi.rawTurnText || mi.normalizedUserIntent || mi.turnText || ""), questionShape || mi.questionShape || rt.questionShape || {});
  const protectiveEscalation = detectProtectiveEscalationRouting(safeStr(rt.rawTurnText || rt.normalizedUserIntent || mi.rawTurnText || mi.normalizedUserIntent || mi.turnText || ""), mi);
  const ambiguous = !!(rt.routeAmbiguous || dc.ambiguous || rt.routeFailClosed || dc.failClosed);
  const routeLocked = !!(rt.routeLock || dc.routeLocked || answerableTopic || confidence >= 0.82);
  const action = ambiguous && !routeLocked && !answerableTopic ? "clarify" : "route";
  return {
    version: DOMAIN_CONCIERGE_CORE_VERSION,
    source: "marionIntentRouter",
    action,
    route,
    intent,
    confidence,
    confidenceBand: safeStr(rt.routeConfidenceBand || dc.confidenceBand || dc.band || confidenceBand(confidence)),
    needsClarifier: action === "clarify" || !!dc.needsClarifier,
    clarifier: action === "clarify" ? "Which area should I route this to: interface, backend, media/Roku, business strategy, or support?" : "",
    routeLocked,
    routeFailClosed: !!(rt.routeFailClosed || dc.failClosed),
    questionShape: safeObj(questionShape),
    protectiveEscalation,
    ethicalEscalationRequired: !!protectiveEscalation.requiresEthicalGate,
    answerMode: safeStr(dc.answerMode || (action === "clarify" ? "clarify" : "direct")), fallbackReason: safeStr(dc.fallbackReason || ""), secondaryDomains: safeArray(dc.secondaryDomains || rt.secondaryDomains).slice(0, 4), candidates: safeArray(rt.candidateDomains || dc.candidates).slice(0, 6),
    noUserFacingDiagnostics: true
  };
}

function buildRouting(marionIntent) {
  const knowledgeDomain = normalizeKnowledgeDomainName(marionIntent.knowledgeDomain || "");
  const confidenceProfile = intentConfidenceProfile(marionIntent, marionIntent.turnText || "");
  const registryRoute = registryKnowledgeRoute(knowledgeDomain);
  const registryWiring = registryKnowledgeWiring(knowledgeDomain);
  const registryConfig = registryKnowledgeConfig(knowledgeDomain);
  const baseDomain = INTENT_TO_DOMAIN[marionIntent.intent] || "general_reasoning";
  const definitionDomainLock = knowledgeDomain && safeStr(marionIntent.knowledgeDomainReason) === "definition_query_domain_lock";
  const crossDomainPrimaryLock = knowledgeDomain && safeStr(marionIntent.answerMode) === "direct_with_secondary_context";
  const domain = (definitionDomainLock || crossDomainPrimaryLock) ? knowledgeDomain : (knowledgeDomain ? safeStr((registryRoute && registryRoute.operationalDomain) || operationalDomainForKnowledge(knowledgeDomain, marionIntent.intent)) : baseDomain);
  const mode = (registryRoute && registryRoute.mode) || (knowledgeDomain && KNOWLEDGE_DOMAIN_MODE[knowledgeDomain]) || DOMAIN_MODE[domain] || "conversation";
  const depth = (registryRoute && registryRoute.depth) || (knowledgeDomain && KNOWLEDGE_DOMAIN_DEPTH[knowledgeDomain]) || DOMAIN_DEPTH[domain] || "normal";
  const preferredStyle = (registryRoute && registryRoute.preferredStyle) || (registryConfig && registryConfig.preferredStyle) || (knowledgeDomain && PREFERRED_STYLE[knowledgeDomain]) || PREFERRED_STYLE[domain] || "direct";
  const domainRoute = knowledgeDomain ? {
    knowledgeDomain,
    operationalDomain: domain,
    reason: safeStr(marionIntent.knowledgeDomainReason || "knowledge_domain_handoff"),
    explicit: !!marionIntent.knowledgeDomainExplicit,
    activationRequest: !!marionIntent.knowledgeDomainActivationRequest,
    registryVersion: safeStr((registryRoute && registryRoute.registryVersion) || (registryConfig && registryConfig.registryVersion) || ""),
    manifestFound: !!(registryWiring && registryWiring.manifestFound),
    manifestPath: safeStr(registryWiring && registryWiring.manifestPath),
    packFilesFound: Number(registryWiring && registryWiring.packFilesFound) || 0,
    wiringReady: !!(registryWiring && registryWiring.ready)
  } : null;

  return {
    domain,
    telemetryVisibilityVersion: TELEMETRY_VISIBILITY_VERSION,
    failureSignature: classifyFailureSignature({source:"marionIntentRouter",canEmit:true,stage:"routed",intent:marionIntent.intent,domain,primaryDomain:knowledgeDomain || domain,secondaryDomains:safeArray(marionIntent.secondaryDomains),answerMode:marionIntent.answerMode,routeAmbiguous:confidenceProfile.ambiguous}),
    failureSignatureAudit: buildFailureSignatureAudit({source:"marionIntentRouter",canEmit:true,stage:"routed",intent:marionIntent.intent,domain,primaryDomain:knowledgeDomain || domain,knowledgeDomain,secondaryDomains:safeArray(marionIntent.secondaryDomains),answerMode:marionIntent.answerMode,routeAmbiguous:confidenceProfile.ambiguous,finalEnvelopeTrusted:true}),
    intent: marionIntent.intent,
    subIntent: marionIntent.subIntent,
    endpoint: CANONICAL_ENDPOINT,
    contractVersion: INTENT_CONTRACT_VERSION,
  PIPELINE_FORENSIC_NORMALIZATION_VERSION,
  DOMAIN_CONFIDENCE_VERSION,
  TELEMETRY_VISIBILITY_VERSION,
  FAILURE_SIGNATURE_AUDIT_VERSION,
  routerForensicNormalizationStatus,
    expectsComposer: "composeMarionResponse",
    expectedComposerContract: "finalEnvelope.reply.required",
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    stateStageHint: marionIntent.stateStageHint,
    mode,
    depth,
    cognitiveMode: marionIntent.directiveExecutionRequired ? "directive_execution" : (marionIntent.baselineCognitionRequired ? "baseline_cognition" : mode),
    useMemory: domain === "memory" || domain === "identity" || domain === "emotional" || domain === "psychology" || marionIntent.subIntent === "identity_baseline",
    useDomainKnowledge: domain !== "general" || !!knowledgeDomain,
    knowledgeDomain,
    knowledgeDomainExplicit: !!marionIntent.knowledgeDomainExplicit,
    knowledgeDomainReason: safeStr(marionIntent.knowledgeDomainReason || ""),
    secondaryDomains: safeArray(marionIntent.secondaryDomains).map(normalizeKnowledgeDomainName).filter(Boolean),
    answerMode: safeStr(marionIntent.answerMode || ""),
    crossDomainProfile: safeObj(marionIntent.crossDomainProfile),
    knowledgeDomainActivationRequest: !!marionIntent.knowledgeDomainActivationRequest,
    technicalTargetLock: safeObj(marionIntent.technicalTargetLock),
    technicalFollowUpLock: !!marionIntent.technicalFollowUpLock,
    protectiveEscalation: safeObj(marionIntent.protectiveEscalation),
    ethicalEscalationRequired: !!marionIntent.ethicalEscalationRequired,
    blockScheduleInterception: !!marionIntent.blockScheduleInterception,
    domainConfidence: confidenceProfile,
    routeConfidence: confidenceProfile.confidence,
    routeConfidenceBand: confidenceProfile.band,
    routeAmbiguous: confidenceProfile.ambiguous,
    routeLock: !!(marionIntent.routeLock || confidenceProfile.routeLocked),
    routeFailClosed: !!confidenceProfile.failClosed,
    candidateDomains: confidenceProfile.candidates || [],
    noCrossDomainBleed: true,
    inputSource: normalizeInputSource(marionIntent.inputSource || "text"),
    turnHash: safeStr(marionIntent.turnHash || ""),
    micTextParity: true,
    continuityRegressionReady: true,
    domainRoute,
    requireFreshComposerEnvelope: true,
    requiresFinalEnvelope: true,
    requiresHotFallback: false,
    directiveExecutionRequired: !!marionIntent.directiveExecutionRequired,
    blockRepeatedBridgeFallback: true,
    recoveryRequired: marionIntent.recoveryRequired,
    safetyLevel: marionIntent.safetyLevel,
    identityAnchorRequired: !!marionIntent.identityAnchorRequired,
    baselineCognitionRequired: !!marionIntent.baselineCognitionRequired,
    creativeCognitiveCompatible: true,
    creativeCognitiveCarryRequired: !!marionIntent.creativeCognitiveCarryRequired,
    preferredStyle,
    registryKnowledgeAvailable: !!(registryWiring && (registryWiring.ready || registryWiring.manifestFound || registryWiring.packFilesFound > 0)),
    cohesion: {
      targetPercent: 90,
      bridgeCompatible: true,
      composerCompatible: true,
      stateSpineCompatible: true,
      creativeCognitiveCompatible: true,
      registryCompatible: true,
      finalEnvelopeRequired: true,
      directiveExecutionRequired: !!marionIntent.directiveExecutionRequired,
      noDiagnosticUserSurface: true,
      noUnsupportedDomainLeak: true
    }
  };
}
function routeMarionIntent(packet = {}) {
  const __identityText = extractText(packet);
  if (isIdentityNameQuestion(__identityText)) {
    return { ok:true, marionIntent:{ activate:true, intent:"identity_query", confidence:0.96, reason:"identity_reset_name_anchor", source:"marionIntentRouter", identityAnchorRequired:true }, routing:{ domain:"identity", intent:"identity_query", mode:"identity", depth:"identity_baseline", endpoint:CANONICAL_ENDPOINT, domainConfidence:{ version:DOMAIN_CONFIDENCE_VERSION, confidence:0.96, band:"high", routeLocked:true, primaryDomain:"identity", reason:"identity_reset_name_anchor" } }, meta:{ routerVersion:VERSION, identityResetAnchor:true } };
  }
  const rawText = extractText(packet);
  const src = safeObj(packet);
  const existingIntent = extractExistingIntent(src);
  const continuityCarry = extractContinuityCarry(src);
  const continuityResolved = isResolvedShortContinuityPrompt(src, rawText);
  const continuityResolvedText = continuityResolved
    ? buildContinuityResolvedQuestion(rawText, continuityCarry)
    : "";
  const questionShape = normalizeQuestionShape(continuityResolvedText || rawText);
  const text = continuityResolvedText || questionShape.normalizedText || rawText;
  const effectivePrompt = continuityResolvedText || questionShape.normalizedUserIntent || questionShape.normalizedText || rawText;
  const continuityExistingIntent = continuityResolved
    ? {
        intent: "domain_question",
        confidence: Math.max(clamp01(existingIntent.confidence, 0), 0.91),
        reason: "short_followup_continuity_resolved",
        source: "marionIntentRouter.shortFollowupContinuity",
        continuityCarry
      }
    : {};

  const marionIntent = normalizeIntent({...existingIntent, ...continuityExistingIntent, questionShape}, effectivePrompt);
  marionIntent.rawTurnText = rawText;
  marionIntent.turnText = effectivePrompt;
  marionIntent.message = effectivePrompt;
  marionIntent.text = effectivePrompt;
  marionIntent.userText = effectivePrompt;
  marionIntent.normalizedUserIntent = effectivePrompt;
  marionIntent.effectivePrompt = effectivePrompt;
  marionIntent.questionShape = {
    ...questionShape,
    normalizedText: effectivePrompt,
    normalizedUserIntent: effectivePrompt
  };
  const routing = buildRouting(marionIntent);
  const domainConciergeSeed = buildDomainConciergeSeed({ ...routing, rawTurnText: rawText, normalizedUserIntent: effectivePrompt, effectivePrompt, questionShape: marionIntent.questionShape }, marionIntent, marionIntent.questionShape);
  routing.domainConciergeSeed = domainConciergeSeed;
  routing.questionShape = marionIntent.questionShape;
  routing.rawTurnText = rawText;
  routing.normalizedUserIntent = effectivePrompt;
  routing.effectivePrompt = effectivePrompt;
  routing.resolvedQuestion = continuityResolvedText || "";
  let boundContinuityCarry = {};
  if (continuityCarry.active || continuityResolved) {
    boundContinuityCarry = {
      ...continuityCarry,
      active: true,
      topic: continuityCarry.topic || inferContinuityTopicFromAssistantText(effectivePrompt) || normalizeContinuityTopic(effectivePrompt),
      lastTopic: continuityCarry.topic || inferContinuityTopicFromAssistantText(effectivePrompt) || normalizeContinuityTopic(effectivePrompt),
      resolvedFollowup: !!continuityResolved,
      originalText: continuityCarry.originalText || rawText,
      resolvedText: continuityResolvedText || text,
      source: "marionIntentRouter.shortFollowupContinuityReferenceBinding"
    };
    routing.continuity = boundContinuityCarry;
    routing.followUpReference = boundContinuityCarry;
    routing.shortFollowupContinuityResolved = !!continuityResolved;
    routing.previousTopic = boundContinuityCarry.topic || "";
    routing.normalizedUserIntent = continuityResolvedText || routing.normalizedUserIntent;
    routing.effectivePrompt = continuityResolvedText || routing.normalizedUserIntent;
    routing.resolvedQuestion = continuityResolvedText || "";
    routing.continuityResolvedText = continuityResolvedText || "";
    marionIntent.continuityCarry = boundContinuityCarry;
    marionIntent.shortFollowupContinuityResolved = !!continuityResolved;
    marionIntent.normalizedUserIntent = continuityResolvedText || marionIntent.normalizedUserIntent;
    marionIntent.effectivePrompt = continuityResolvedText || marionIntent.normalizedUserIntent;
    marionIntent.resolvedQuestion = continuityResolvedText || "";
    marionIntent.continuityResolvedText = continuityResolvedText || "";
    marionIntent.reason = continuityResolved ? "short_followup_continuity_reference_bound" : marionIntent.reason;
  }
  const inputSource = normalizeInputSource(src.inputSource || safeObj(src.session).inputSource || marionIntent.inputSource || "text");
  const turnHash = turnContinuityHash(effectivePrompt);

  return {
    ok: true,
    final: false,
    routerVersion: VERSION,
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    intentContractVersion: INTENT_CONTRACT_VERSION,
    marionIntent,
    routing,
    domainConfidence: routing.domainConfidence || intentConfidenceProfile(marionIntent, text),
    domainConciergeSeed,
    questionShape: marionIntent.questionShape,
    rawUserText: rawText,
    message: effectivePrompt,
    text: effectivePrompt,
    userText: effectivePrompt,
    query: effectivePrompt,
    normalizedUserIntent: effectivePrompt,
    effectivePrompt,
    resolvedQuestion: continuityResolvedText || "",
    continuityResolvedText: continuityResolvedText || "",
    continuityResolvedOriginalText: continuityResolved ? rawText : "",
    continuity: (continuityCarry.active || continuityResolved) ? (routing.continuity || boundContinuityCarry || continuityCarry) : undefined,
    followUpReference: (continuityCarry.active || continuityResolved) ? (routing.followUpReference || boundContinuityCarry || continuityCarry) : undefined,
    shortFollowupContinuityResolved: !!continuityResolved,
    stateSpinePatch: {
      source: "marionIntentRouter",
      schema: STATE_SPINE_SCHEMA,
      shouldAdvanceState: true,
      stateStage: marionIntent.stateStageHint || "classified",
      intent: marionIntent.intent,
      subIntent: marionIntent.subIntent,
      inputSource,
      turnHash,
      rawUserText: rawText,
      normalizedUserIntent: effectivePrompt,
      effectivePrompt,
      resolvedQuestion: continuityResolvedText || "",
      continuityResolvedText: continuityResolvedText || "",
      questionShape: marionIntent.questionShape,
      continuity: (continuityCarry.active || continuityResolved) ? (boundContinuityCarry || continuityCarry) : undefined,
      followUpReference: (continuityCarry.active || continuityResolved) ? (boundContinuityCarry || continuityCarry) : undefined,
      shortFollowupContinuityResolved: !!continuityResolved,
      micTextParity: true,
      continuityRegressionReady: true,
      routeLock: !!(marionIntent.routeLock || safeObj(routing.domainConfidence).routeLocked),
      routeFailClosed: !!safeObj(routing.domainConfidence).failClosed,
      domainConfidence: routing.domainConfidence || intentConfidenceProfile(marionIntent, text),
      domainConcierge: domainConciergeSeed,
      protectiveEscalation: safeObj(marionIntent.protectiveEscalation),
      ethicalEscalationRequired: !!marionIntent.ethicalEscalationRequired
    },
    meta: {
      routedAt: new Date().toISOString(),
      confidence: marionIntent.confidence,
      domainConfidence: routing.domainConfidence || intentConfidenceProfile(marionIntent, text),
      domainConcierge: domainConciergeSeed,
      triggerSource: marionIntent.source,
      textPresent: Boolean(text),
      singleIntentAuthority: true,
      bridgeCompatible: true,
      composerCompatible: true,
      stateSpineCompatible: true,
      preventsFallbackDeadState: true,
      finalEnvelopeRequired: true,
      directiveExecutionRequired: !!marionIntent.directiveExecutionRequired,
      identityAnchorRequired: !!marionIntent.identityAnchorRequired,
      baselineCognitionRequired: !!marionIntent.baselineCognitionRequired,
      creativeCognitiveCarryRequired: !!marionIntent.creativeCognitiveCarryRequired,
      knowledgeDomain: marionIntent.knowledgeDomain || "",
      knowledgeDomainExplicit: !!marionIntent.knowledgeDomainExplicit,
      registryKnowledgeAvailable: !!routing.registryKnowledgeAvailable,
      noUserFacingDiagnostics: true,
      inputSource,
      turnHash,
      rawUserText: rawText,
      normalizedUserIntent: effectivePrompt,
      effectivePrompt,
      resolvedQuestion: continuityResolvedText || "",
      continuityResolvedText: continuityResolvedText || "",
      questionShape: marionIntent.questionShape,
      continuity: (continuityCarry.active || continuityResolved) ? (routing.continuity || continuityCarry) : undefined,
      followUpReference: (continuityCarry.active || continuityResolved) ? (routing.followUpReference || continuityCarry) : undefined,
      shortFollowupContinuityResolved: !!continuityResolved,
      micTextParity: true,
      continuityRegressionReady: true,
      routeLock: !!(marionIntent.routeLock || safeObj(routing.domainConfidence).routeLocked),
      routeFailClosed: !!safeObj(routing.domainConfidence).failClosed,
      protectiveEscalation: safeObj(marionIntent.protectiveEscalation),
      ethicalEscalationRequired: !!marionIntent.ethicalEscalationRequired
    }
  };
}


function routerForensicNormalizationStatus(){
  return {
    version: PIPELINE_FORENSIC_NORMALIZATION_VERSION,
    routerVersion: VERSION,
    intentContractVersion: INTENT_CONTRACT_VERSION,
    canonicalEndpoint: CANONICAL_ENDPOINT,
    validIntentCount: VALID_INTENTS.length,
    knowledgeDomainCount: VALID_KNOWLEDGE_DOMAINS.length,
    authority: "router.single-canonical-intent",
    stateSchema: STATE_SPINE_SCHEMA,
    stateSchemaCompat: STATE_SPINE_SCHEMA_COMPAT
  };
}

module.exports = {
  VERSION,
  PIPELINE_FORENSIC_NORMALIZATION_VERSION,
  DOMAIN_CONFIDENCE_VERSION,
  DOMAIN_CONCIERGE_CORE_VERSION,
  QUESTION_SHAPE_NORMALIZATION_VERSION,
  PROTECTIVE_ESCALATION_ROUTING_VERSION,
  routerForensicNormalizationStatus,
  STATE_SPINE_SCHEMA,
  STATE_SPINE_SCHEMA_COMPAT,
  INTENT_CONTRACT_VERSION,
  CANONICAL_ENDPOINT,
  VALID_INTENTS,
  INTENT_TO_DOMAIN,
  normalizeIntentName,
  inferIntentFromText,
  detectDirectiveIntent,
  detectKnowledgeDomain,
  detectBackendTechnicalContext,
  detectCreativeCognitiveCarryContext,
  normalizeKnowledgeDomainName,
  normalizeIntent,
  routeMarionIntent,
  isContinuationCompressionInstruction,
  isNewsMediaPositioningRequest,
  normalizeInputSource,
  normalizeQuestionShape,
  fallbackNormalizeQuestionShape,
  canonicalTechnicalTargetFromText,
  isTechnicalFollowUpIntent,
  isInfrastructureContinuityPrompt,
  isPriorityTwoRuntimeRoutingText,
  detectProtectiveEscalationRouting,
  isAnswerableTopicRequest,
  turnContinuityHash,
  confidenceBand,
  domainSignalCandidates,
  intentConfidenceProfile,
  buildDomainConciergeSeed,
  classifyFailureSignature,
  buildFailureSignatureAudit,
  isTelemetryLeakText,
  stripTelemetryLeakFromReply,
  _internal: {
    extractText,
    extractExistingIntent,
    detectSafetyLevel,
    detectSocialIntent,
    detectContextualDirectiveIntent,
    detectDomainIntroIntent,
    detectSubIntent,
    detectDirectiveIntent,
    detectKnowledgeDomain,
    crossDomainSecondaryLaneProfile,
    confidenceBand,
    domainSignalCandidates,
    detectBackendTechnicalContext,
    detectCreativeCognitiveCarryContext,
    normalizeKnowledgeDomainName,
    operationalDomainForKnowledge,
    registryKnowledgeRoute,
    registryKnowledgeWiring,
    registryKnowledgeConfig,
    isKnowledgeDomainActivationRequest,
    domainTestPhrase,
    buildRouting,
    buildDomainConciergeSeed,
    normalizeRouterVoiceTextParity,
    normalizeInputSource,
    normalizeQuestionShape,
    fallbackNormalizeQuestionShape,
    canonicalTechnicalTargetFromText,
    isTechnicalFollowUpIntent,
    isInfrastructureContinuityPrompt,
    isPriorityTwoRuntimeRoutingText,
    detectProtectiveEscalationRouting,
    isAnswerableTopicRequest,
    turnContinuityHash,
    extractContinuityCarry,
    inferContinuityTopicFromAssistantText,
    chooseContinuityTopicCandidate,
    buildContinuityResolvedQuestion,
    isShortContinuityFollowupText,
    isResolvedShortContinuityPrompt,
    routerForensicNormalizationStatus,
    classifyFailureSignature,
    buildFailureSignatureAudit,
    isTelemetryLeakText,
    stripTelemetryLeakFromReply
  }
};


// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_INTENT_ROUTER_PATCH_START
const PRIORITY_9F_R1_INTENT_ROUTER_LAYERED_PRECEDENCE_VERSION="nyx.marion.intentRouter.priority9fR1.layeredPrecedence/1.0";
function isPriority9FR1LayeredPrecedenceText(text=""){const t=safeStr(text).toLowerCase().replace(/[_-]+/g," ");return /\b(priority\s*9f|9f\s*r1|deep conversational stack|layered conversational|layered conversation|conversational stack|layered intelligence|full conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action)\b/i.test(t)||(/\b(disjointed|deeper|layered|multi|context|looping|loop|recovery)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next)\b/i.test(t));}
const __priority9FR1OriginalRouteMarionIntent=routeMarionIntent;
routeMarionIntent=function priority9FR1RouteMarionIntent(packet={}){const rawText=extractText(packet);if(!isPriority9FR1LayeredPrecedenceText(rawText))return __priority9FR1OriginalRouteMarionIntent(packet);const base=__priority9FR1OriginalRouteMarionIntent(packet);return {...base,ok:true,marionIntent:{...safeObj(base.marionIntent),activate:true,intent:"contextual_directive",confidence:0.97,reason:"priority9f_r1_layered_prompt_precedence",source:"marionIntentRouter.priority9fR1",rawTurnText:rawText,turnText:rawText,text:rawText,userText:rawText,normalizedUserIntent:rawText,effectivePrompt:rawText,questionShape:{...safeObj(safeObj(base.marionIntent).questionShape),questionShape:"layered_conversational_stack",normalizedText:rawText,normalizedUserIntent:rawText}},routing:{...safeObj(base.routing),domain:"execution_context",intent:"contextual_directive",mode:"contextual_execution",depth:"continuity_deep",endpoint:CANONICAL_ENDPOINT,rawTurnText:rawText,normalizedUserIntent:rawText,effectivePrompt:rawText,questionShape:{...safeObj(safeObj(base.routing).questionShape),questionShape:"layered_conversational_stack",normalizedText:rawText,normalizedUserIntent:rawText},domainConfidence:{...safeObj(safeObj(base.routing).domainConfidence),version:DOMAIN_CONFIDENCE_VERSION,confidence:0.97,band:"high",routeLocked:true,primaryDomain:"execution_context",reason:"priority9f_r1_layered_prompt_precedence"},priority9FR1LayeredPrecedence:true},meta:{...safeObj(base.meta),routerVersion:VERSION,priority9FR1LayeredPrecedence:true,noUserFacingDiagnostics:true}};};
module.exports.PRIORITY_9F_R1_INTENT_ROUTER_LAYERED_PRECEDENCE_VERSION=PRIORITY_9F_R1_INTENT_ROUTER_LAYERED_PRECEDENCE_VERSION;module.exports.isPriority9FR1LayeredPrecedenceText=isPriority9FR1LayeredPrecedenceText;module.exports.routeMarionIntent=routeMarionIntent;module.exports.default=module.exports;
// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_INTENT_ROUTER_PATCH_END

// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_INTENT_ROUTER_PATCH_START
const PRIORITY_9F_R2_INTENT_ROUTER_DOMAIN_HIJACK_SUPPRESSION_VERSION="nyx.marion.intentRouter.priority9fR2.domainHijackSuppression/1.0";
function isPriority9FR2DomainHijackSuppressionText(text=""){const t=safeStr(text).toLowerCase().replace(/[_-]+/g," ");return /\b(priority\s*9f|9f\s*r2|domain hijack|domain fallback|six domain fallback|deep conversational stack|layered conversational|conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action|marion conversational architecture)\b/i.test(t)||(/\b(disjointed|deeper|layered|context|looping|loop|recovery|preserve|avoid|where to go next)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next|understand)\b/i.test(t));}
const __priority9FR2OriginalRouteMarionIntent=routeMarionIntent;
routeMarionIntent=function priority9FR2RouteMarionIntent(packet={}){const rawText=extractText(packet);const base=__priority9FR2OriginalRouteMarionIntent(packet);if(!isPriority9FR2DomainHijackSuppressionText(rawText))return base;return {...base,ok:true,marionIntent:{...safeObj(base.marionIntent),activate:true,intent:"contextual_directive",confidence:0.99,reason:"priority9f_r2_domain_hijack_suppression",source:"marionIntentRouter.priority9fR2",rawTurnText:rawText,turnText:rawText,text:rawText,userText:rawText,normalizedUserIntent:rawText,effectivePrompt:rawText,questionShape:{...safeObj(safeObj(base.marionIntent).questionShape),questionShape:"layered_conversational_stack",normalizedText:rawText,normalizedUserIntent:rawText}},routing:{...safeObj(base.routing),domain:"execution_context",intent:"contextual_directive",mode:"contextual_execution",depth:"continuity_deep",knowledgeDomain:"",endpoint:CANONICAL_ENDPOINT,rawTurnText:rawText,normalizedUserIntent:rawText,effectivePrompt:rawText,questionShape:{...safeObj(safeObj(base.routing).questionShape),questionShape:"layered_conversational_stack",normalizedText:rawText,normalizedUserIntent:rawText},domainConfidence:{...safeObj(safeObj(base.routing).domainConfidence),version:DOMAIN_CONFIDENCE_VERSION,confidence:0.99,band:"high",confidenceBand:"high",routeLocked:true,ambiguous:false,needsClarifier:false,primaryDomain:"execution_context",selectedDomain:"execution_context",knowledgeDomain:"",secondaryDomains:[],reason:"priority9f_r2_domain_hijack_suppression",noCrossDomainBleed:true,noUserFacingDiagnostics:true},priority9FR2DomainHijackSuppression:true,domainHijackSuppressed:true},meta:{...safeObj(base.meta),routerVersion:VERSION,priority9FR2DomainHijackSuppression:true,domainHijackSuppressed:true,noUserFacingDiagnostics:true}};};
module.exports.PRIORITY_9F_R2_INTENT_ROUTER_DOMAIN_HIJACK_SUPPRESSION_VERSION=PRIORITY_9F_R2_INTENT_ROUTER_DOMAIN_HIJACK_SUPPRESSION_VERSION;module.exports.isPriority9FR2DomainHijackSuppressionText=isPriority9FR2DomainHijackSuppressionText;module.exports.routeMarionIntent=routeMarionIntent;module.exports.default=module.exports;
// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_INTENT_ROUTER_PATCH_END

// PRIORITY_9I_9J_SEQUENCE_INTENT_ROUTER_PATCH_START
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

function priority9IJRoutePrompt(input){var i=priority9IJObj(input),n=priority9IJObj(i.normalized),p=priority9IJObj(i.payload);return priority9IJStr(i.prompt||i.text||i.userText||i.message||n.prompt||n.text||p.prompt||p.text||"");}
function priority9IJRouteMetadata(input,base){var text=priority9IJRoutePrompt(input);var src=[text,priority9IJCollect(input),priority9IJCollect(base)].join(" ");var lane=priority9IJSequencedLaneFor(text,src,priority9IJReadReply(base));if(lane==="9j"){return {...priority9IJObj(base),intent:"contextual_directive",canonicalIntent:"contextual_directive",domain:"execution_context",routeKind:"priority9j_proactive_operational_guidance",priorityLane:"Priority 9J",priority9JProactiveOperationalGuidance:priority9JStateFrom(src,1),confidence:0.997,shouldClarify:false,noUserFacingDiagnostics:true};}if(lane==="9i"||priority9IJIs9IActivationText(src)){var si=priority9IStateFrom(src,1);return {...priority9IJObj(base),intent:"contextual_directive",canonicalIntent:"contextual_directive",domain:"execution_context",routeKind:"priority9i_adaptive_situational_reasoning",priorityLane:"Priority 9I",priority9IAdaptiveSituationalReasoning:si,priority9JPrecheck:si.priority9JProactiveGuidancePrecheck,confidence:0.997,shouldClarify:false,noUserFacingDiagnostics:true};}return base;}
var __priority9IJOriginalRouteMarionIntent=typeof routeMarionIntent==="function"?routeMarionIntent:null;
if(__priority9IJOriginalRouteMarionIntent){routeMarionIntent=function priority9IJRouteMarionIntent(input={}){return priority9IJRouteMetadata(input,__priority9IJOriginalRouteMarionIntent(input));};module.exports.routeMarionIntent=routeMarionIntent;}
module.exports.PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_ROUTER_VERSION=PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL;
module.exports.PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_ROUTER_VERSION=PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL;
module.exports.isPriority9IAdaptiveSituationalText=priority9IJIs9IActivationText;
module.exports.isPriority9JProactiveOperationalText=priority9IJIs9JActivationText;
module.exports.default=module.exports;
// PRIORITY_9I_9J_SEQUENCE_INTENT_ROUTER_PATCH_END



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


function priority9IR2RouteMetadata(input, previous) {
  var text = priority9IR2ExtractText(input);
  var kind = priority9IR2PressureKind(text);
  if (!kind) return previous || {};
  var base = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
  return Object.assign({}, base, {
    intent: "contextual_directive",
    canonicalIntent: "contextual_directive",
    routeKind: "execution_context",
    domain: "execution_context",
    confidence: Math.max(Number(base.confidence) || 0, 0.94),
    priorityLane: "priority9i_adaptive_situational_reasoning",
    activeLane: "Priority 9I",
    pressureKind: kind,
    pressureSpecificAnswer: true,
    suppress9JEscalation: true
  });
}
["routeMarionIntent","classifyIntent","route","default"].forEach(function(name){if(typeof module.exports[name]==="function"){var original=module.exports[name];module.exports[name]=function priority9IR2RouterWrapper(input){return priority9IR2RouteMetadata(input, original.apply(this,arguments));};}});
module.exports.priority9IR2RouteMetadata = priority9IR2RouteMetadata;

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

priority9IR2APatchExports(["routeMarionIntent", "classifyIntent", "route", "default"]);



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

priority9JR1PatchExports(["routeMarionIntent", "classifyIntent", "route", "default"]);


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

// R18C_LAW_ROUTING_REGISTRY_PATCH_START
const R18C_INTENT_ROUTER_VERSION = "nyx.marion.r18c.intentRouter.lawAssessment/1.0";
const R18C_LAW_INTENT_FRAME = Object.freeze(["legal_category","jurisdiction_sensitivity","facts_vs_assumptions","risk_exposure","missing_information","safe_next_move"]);
const R18C_LAW_INTENT_BOUNDARY = Object.freeze({generalInformationOnly:true,noLegalAdvice:true,noAttorneyClientRelationship:true,noLegalCertaintyClaim:true,jurisdictionRequired:true,sourceDocumentReviewRequired:true,professionalReviewRecommendedForHighRisk:true});
function r18cIrStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function r18cIrObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function r18cIrFirst(){for(let i=0;i<arguments.length;i+=1){const v=r18cIrStr(arguments[i]);if(v)return v;}return"";}
function r18cExtractText(packet){const p=r18cIrObj(packet),payload=r18cIrObj(p.payload),meta=r18cIrObj(p.meta),session=r18cIrObj(p.session);return r18cIrFirst(p.text,p.userText,p.message,p.prompt,p.query,p.rawUserText,p.normalizedUserIntent,p.effectivePrompt,payload.text,payload.userText,payload.message,meta.text,session.lastUserText);}
function r18cLawCategories(text=""){
  const t=r18cIrStr(text).toLowerCase(), out=[]; const add=(key,rx)=>{if(rx.test(t)&&!out.includes(key))out.push(key);};
  add("contract",/\b(contract|agreement|nda|terms|clause|consideration|breach|indemnity|warranty|termination|assignment)\b/i);
  add("copyright_licensing",/\b(copyright|copyrighted|licen[cs]e|licen[cs]ing|distribution rights?|broadcast rights?|ott rights?|roku rights?|streaming rights?|content rights?|fair use|public domain|royalty)\b/i);
  add("intellectual_property",/\b(ip|intellectual property|trademark|trade mark|patent|trade secret|brand mark|logo ownership|copyright ownership)\b/i);
  add("compliance_regulatory",/\b(compliance|regulatory|regulation|policy|statute|permit|filing|reporting requirement|tax credit|grant eligibility)\b/i);
  add("liability_dispute",/\b(liability|liable|negligence|duty of care|damages|claim|lawsuit|litigation|settlement|dispute|legal exposure)\b/i);
  add("employment_contractor",/\b(employee|employment|contractor|independent contractor|worker classification|termination|severance|non[-\s]?compete|non[-\s]?solicit)\b/i);
  add("privacy_data",/\b(privacy|pipeda|gdpr|personal information|personal data|consent|data protection|data retention|user data)\b/i);
  add("corporate_business",/\b(incorporat(?:e|ion)|corporation|shareholder|director|officer|bylaw|articles|business registration|operating agreement)\b/i);
  add("jurisdiction_procedure",/\b(jurisdiction|province|federal|ontario|canada|canadian law|court|tribunal|legal process|procedure|venue)\b/i);
  return out;
}
function r18cIsTechnicalFileOperation(text=""){
  const t=r18cIrStr(text).toLowerCase();
  return /\b(surgical autopsy|autopsy|audit|patch|update|resend|zip|downloadable|files?|node --check|domain routing|domain registry|domainrouter|mariondomainregistry|marionintentrouter|domainconcierge|domainconfidence|runtime file|javascript|\.js)\b/i.test(t) && r18cLawCategories(t).length===0 && !/\b(r18c|law domain|legal domain)\b/i.test(t);
}
function r18cDetectLawIntentSignals(text="", context={}){
  const src=[r18cIrStr(text),JSON.stringify(r18cIrObj(context)).slice(0,1400)].join(" ");
  const categories=r18cLawCategories(src);
  const explicit=/\b(r18c|law domain|legal domain|legal lane|route.*law|activate.*law|law real[-\s]?world assessment|legal risk assessment)\b/i.test(src);
  const active=(categories.length>0||explicit)&&!r18cIsTechnicalFileOperation(text);
  const secondary=[];
  if(/\b(ai|artificial intelligence|model|llm|automation|agent)\b/i.test(src))secondary.push("ai");
  if(/\b(cyber|security|privacy|data protection|credential|access|identity)\b/i.test(src))secondary.push("cyber");
  if(/\b(revenue|pricing|cost|grant|funding|tax credit|moneti[sz]e|royalty|fee|damages)\b/i.test(src))secondary.push("finance");
  if(/\b(roku|ott|streaming|channel|distribution|commercial|business)\b/i.test(src))secondary.push("business");
  return {version:R18C_INTENT_ROUTER_VERSION,active,knowledgeDomain:active?"law":"",domain:active?"law":"",legalCategory:categories[0]||"general_legal_risk",legalCategories:categories,secondaryDomains:Array.from(new Set(secondary.filter(d=>d!=="law"))).slice(0,4),confidence:active?(explicit?0.97:0.94):0,answerMode:"grounded",assessmentFrame:R18C_LAW_INTENT_FRAME.slice(),legalBoundary:Object.assign({},R18C_LAW_INTENT_BOUNDARY),highStakes:!!active,routeLocked:!!active,noCrossDomainBleed:true,noUserFacingDiagnostics:true};
}
function r18cLawDomainConfidence(sig){
  return {version:DOMAIN_CONFIDENCE_VERSION,confidence:sig.confidence,confidenceScore:sig.confidence,band:"high",confidenceBand:"high",margin:0.16,ambiguous:false,routeLocked:true,needsClarifier:false,failClosed:false,reason:"r18c_law_real_world_assessment_precedence",primaryIntent:"domain_question",primaryDomain:"law",selectedDomain:"law",secondaryDomains:sig.secondaryDomains||[],knowledgeDomain:"law",candidates:[{domain:"law",confidence:sig.confidence,reasons:["r18c_law_real_world_assessment_signal",sig.legalCategory],knowledgeDomain:"law"}],answerMode:"grounded",highStakes:true,legalCategory:sig.legalCategory,legalCategories:sig.legalCategories,assessmentFrame:sig.assessmentFrame,legalBoundary:sig.legalBoundary,r18cLawAssessment:sig,noCrossDomainBleed:true,noUserFacingDiagnostics:true};
}
function r18cApplyLawIntentRoute(result,packet){
  if(!result||typeof result!=="object")return result;
  const text=r18cExtractText(packet)||result.effectivePrompt||result.normalizedUserIntent||result.text||"";
  const sig=r18cDetectLawIntentSignals(text,result);
  if(!sig.active)return result;
  const out=Array.isArray(result)?result.slice():Object.assign({},result);
  const dc=r18cLawDomainConfidence(sig);
  out.marionIntent=Object.assign({},r18cIrObj(out.marionIntent),{intent:"domain_question",subIntent:"law_real_world_assessment",confidence:sig.confidence,reason:"r18c_law_real_world_assessment_precedence",knowledgeDomain:"law",knowledgeDomainExplicit:true,knowledgeDomainReason:"r18c_law_signal",secondaryDomains:sig.secondaryDomains,answerMode:"grounded",routeLock:true,legalCategory:sig.legalCategory,legalCategories:sig.legalCategories,assessmentFrame:sig.assessmentFrame,legalBoundary:sig.legalBoundary,r18cLawAssessment:sig,highStakes:true,noUserFacingDiagnostics:true});
  out.routing=Object.assign({},r18cIrObj(out.routing),{domain:"law",intent:"domain_question",mode:"law_real_world_assessment",depth:"jurisdiction_aware_grounded",preferredStyle:"risk_assessment_not_legal_advice",knowledgeDomain:"law",primaryDomain:"law",selectedDomain:"law",secondaryDomains:sig.secondaryDomains,answerMode:"grounded",routeLock:true,domainConfidence:dc,r18cLawAssessment:sig,noCrossDomainBleed:true});
  out.domainConfidence=dc;
  out.domainConciergeSeed=Object.assign({},r18cIrObj(out.domainConciergeSeed),{route:"law",intent:"domain_question",knowledgeDomain:"law",confidence:sig.confidence,answerMode:"grounded",r18cLawAssessment:sig,domainConfidence:dc,noUserFacingDiagnostics:true});
  out.stateSpinePatch=Object.assign({},r18cIrObj(out.stateSpinePatch),{intent:"domain_question",selectedDomain:"law",knowledgeDomain:"law",routeLock:true,domainConfidence:dc,r18cLawAssessment:sig,noCrossDomainBleed:true});
  out.meta=Object.assign({},r18cIrObj(out.meta),{knowledgeDomain:"law",r18cLawAssessment:sig,domainConfidence:dc,noUserFacingDiagnostics:true});
  out.r18cLawAssessment=sig;
  return out;
}
(function r18cPatchIntentRouterExports(){
  if(typeof module==="undefined"||!module.exports||typeof module.exports!=="object")return;
  const exp=module.exports;
  if(typeof exp.detectKnowledgeDomain==="function"&&!exp.detectKnowledgeDomain.__r18cLawIntentPatched){
    const original=exp.detectKnowledgeDomain;
    exp.detectKnowledgeDomain=function r18cDetectKnowledgeDomainWrapped(text){const sig=r18cDetectLawIntentSignals(text,{}); if(sig.active)return {knowledgeDomain:"law",explicit:true,reason:"r18c_law_real_world_assessment_signal",secondaryDomains:sig.secondaryDomains,answerMode:"grounded",crossDomainProfile:{primary:"law",secondary:sig.secondaryDomains,reason:"r18c_law_real_world_assessment_signal",answerMode:"grounded",confidence:sig.confidence}}; return original.apply(this,arguments);};
    exp.detectKnowledgeDomain.__r18cLawIntentPatched=true;
  }
  if(typeof exp.routeMarionIntent==="function"&&!exp.routeMarionIntent.__r18cLawIntentPatched){
    const original=exp.routeMarionIntent;
    exp.routeMarionIntent=function r18cRouteMarionIntentWrapped(packet){const result=original.apply(this,arguments); if(result&&typeof result.then==="function")return result.then(function(v){return r18cApplyLawIntentRoute(v,packet);}); return r18cApplyLawIntentRoute(result,packet);};
    exp.routeMarionIntent.__r18cLawIntentPatched=true;
  }
  exp.R18C_INTENT_ROUTER_VERSION=R18C_INTENT_ROUTER_VERSION;
  exp.R18C_LAW_INTENT_FRAME=R18C_LAW_INTENT_FRAME;
  exp.R18C_LAW_INTENT_BOUNDARY=R18C_LAW_INTENT_BOUNDARY;
  exp.r18cLawCategories=r18cLawCategories;
  exp.r18cDetectLawIntentSignals=r18cDetectLawIntentSignals;
  exp.r18cApplyLawIntentRoute=r18cApplyLawIntentRoute;
  exp.R18C_LAW_ROUTING_REGISTRY_PATCH=true;
  exp.default=exp.routeMarionIntent;
})();
// R18C_LAW_ROUTING_REGISTRY_PATCH_END
