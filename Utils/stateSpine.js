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

const SPINE_VERSION = "stateSpine v2.14.2 TECHNICAL-TARGET-LOCK + FINAL-ENVELOPE-SOURCE-TOLERANCE + DOMAIN-CONFIDENCE-CARRY-LOCK + FINAL-RUNTIME-TELEMETRY + FIVE-TURN-CONTRACT-STATE-CARRY + CONVERSATIONAL-PACK-COHESION";
const CONVERSATIONAL_PACK_COHESION_VERSION = "nyx.conversationalPackCohesion/1.0";
const FINAL_RUNTIME_TELEMETRY_VERSION = "nyx.marion.finalRuntimeTelemetry/1.0";
const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const FINAL_ENVELOPE_CONTRACT = "nyx.marion.final/1.0";
const FINAL_SIGNATURE = "MARION_FINAL_AUTHORITY";
const MARION_FINAL_SIGNATURE_PREFIX = "MARION::FINAL::";
const REQUIRED_CHAT_ENGINE_SIGNATURE = "CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24";

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

function extractRuntimeTelemetryFromTurn(params = {}, inbound = {}) {
  const p=isPlainObject(params)?params:{}, src=isPlainObject(inbound)?inbound:{}, marion=extractMarionObject(p), memoryPatch=extractComposerMemoryPatch(p);
  const candidates=[p.runtimeTelemetry,src.runtimeTelemetry,safeObj(src.meta).runtimeTelemetry,safeObj(src.diagnostics).runtimeTelemetry,safeObj(src.finalEnvelope).runtimeTelemetry,safeObj(marion.finalEnvelope).runtimeTelemetry,marion.runtimeTelemetry,memoryPatch.runtimeTelemetry,safeObj(memoryPatch.stateBridge).runtimeTelemetry];
  for (const item of candidates) if (isPlainObject(item) && Object.keys(item).length) return item;
  return {};
}
function buildStateRuntimeTelemetry({params={},inbound={},reply="",trustedFinalCompletion=false,stage="",intent="",domain="",lane=""}={}){
  const inherited=extractRuntimeTelemetryFromTurn(params,inbound);
  return {
    ...inherited,
    version: FINAL_RUNTIME_TELEMETRY_VERSION,
    source: "stateSpine.finalizeTurn",
    stage: normalizeStateStage(stage || (trustedFinalCompletion ? "final" : "open"), "open"),
    finalAuthority: trustedFinalCompletion ? "marionFinalEnvelope" : "pending",
    replyAuthority: trustedFinalCompletion ? "stateSpine_observed_final" : "none",
    canEmit: !!trustedFinalCompletion,
    intent: safeStr(intent),
    domain: safeStr(domain),
    lane: safeStr(lane),
    inputSource: canonicalTurnInputSource(inbound, params),
    domainConfidence: normalizeDomainConfidenceCarry(isPlainObject(inherited.domainConfidence) ? inherited.domainConfidence : safeObj(params).domainConfidence),
    replySignature: reply ? hashText(reply) : safeStr(inherited.replySignature || ""),
    marionFinalObserved: !!hasMarionFinalSignal(params),
    finalEnvelopeTrusted: !!(hasTrustedMarionFinalEnvelope(params) || hasTrustedFinalShape(params)),
    spineVersion: SPINE_VERSION,
    updatedAt: nowMs()
  };
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
  return {
    version: safeStr(v.version || "nyx.marion.domainConfidence/1.1"),
    confidence: c,
    band: boundedOneLine(v.band || (c >= 0.92 ? "high" : c >= 0.72 ? "medium" : c >= 0.52 ? "low" : "weak"), 32),
    margin: m,
    ambiguous,
    routeLocked,
    failClosed: !!(v.failClosed || (ambiguous && !routeLocked)),
    primary: boundedOneLine(v.primary || v.primaryIntent || v.primaryDomain || v.selectedDomain || "", 64),
    primaryDomain: boundedOneLine(v.primaryDomain || v.selectedDomain || v.domain || "", 64),
    knowledgeDomain: boundedOneLine(v.knowledgeDomain || "", 64),
    reason: boundedOneLine(v.reason || "", 160),
    candidates: Array.isArray(v.candidates) ? v.candidates.slice(0, 6).map((x) => isPlainObject(x) ? { domain: boundedOneLine(x.domain || x.primaryDomain || "", 64), confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0)), reasons: boundedArray(x.reasons || [], 4, 80) } : null).filter(Boolean) : []
  };
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
  const mk=(targetKey,targetName,targetFile,targetPath)=>({version:"nyx.marion.technicalTargetLock/1.0",targetKey,targetName,targetFile,targetPath,explicit:true,source:"current_user_text",locked:true});
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
  const marker = { at: nowMs(), technicalTargetLock, source: canonicalTurnInputSource(inbound, { inputSource: memoryPatch.inputSource }), userHash: boundedSignature(userHash), replyHash: boundedSignature(assistantHash || memoryPatch.replyStateSignature || memoryPatch.replySignature), depth: clampInt(nextTurnDepth, 0, 0, 999999), trustedFinal: !!trustedFinalCompletion, topic: boundedOneLine(memoryPatch.lastTopic || "", 160), regressionTarget: fiveTurnContract.regressionTarget, turnObjective: fiveTurnContract.turnObjective };
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
    lastAssistantReply: "",
    lastKnowledgeDomain: "",
    lastTopic: "",
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
      playbackReady: false
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
    lastAssistantReply: boundedOneLine(src.lastAssistantReply || base.lastAssistantReply || "", MAX_STATE_TEXT),
    lastKnowledgeDomain: safeStr(src.lastKnowledgeDomain || base.lastKnowledgeDomain || ""),
    lastTopic: boundedOneLine(src.lastTopic || base.lastTopic || "", 320),
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
      playbackReady: !!src?.audio?.playbackReady
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
  const sig = isPlainObject(inbound?.turnSignals) ? inbound.turnSignals : {};
  const audioFailure = isPlainObject(inbound?.audioFailure) ? inbound.audioFailure : (isPlainObject(inbound?.ttsFailure) ? inbound.ttsFailure : {});
  const audio = isPlainObject(inbound?.audio) ? inbound.audio : {};
  const ttsResult = isPlainObject(inbound?.ttsResult) ? inbound.ttsResult : (isPlainObject(inbound?.tts) ? inbound.tts : {});
  const transport = isPlainObject(inbound?.transport) ? inbound.transport : {};
  const bridgeTts = isPlainObject(inbound?.bridge?.tts) ? inbound.bridge.tts : {};

  const actionRaw = safeStr(
    sig.ttsAction || sig.audioAction ||
    audioFailure.action || audio.action || ttsResult.action || transport.action ||
    bridgeTts.action || ""
  );
  const action = /retry/i.test(actionRaw) ? "retry" :
    /downgrade/i.test(actionRaw) ? "downgrade" :
    /stop|terminal/i.test(actionRaw) ? "stop" : "";

  const shouldStop = !!(
    sig.ttsShouldStop || sig.audioShouldStop ||
    audioFailure.shouldTerminate || audioFailure.shouldStop ||
    audio.shouldStop || ttsResult.shouldStop || transport.shouldStop || bridgeTts.shouldStop ||
    action === "stop"
  );
  const retryable = !!(
    sig.ttsRetryable || sig.audioRetryable ||
    audioFailure.retryable || audio.retryable || ttsResult.retryable || transport.retryable || bridgeTts.retryable ||
    action === "retry"
  );
  const reason = safeStr(
    sig.ttsReason || sig.audioReason ||
    audioFailure.reason || audioFailure.message ||
    audio.reason || ttsResult.reason || transport.reason || bridgeTts.reason || ""
  );
  const status = clampInt(
    sig.ttsProviderStatus || sig.audioProviderStatus ||
    audioFailure.providerStatus || audioFailure.status ||
    audio.providerStatus || audio.status ||
    ttsResult.providerStatus || ttsResult.status ||
    transport.providerStatus || transport.status ||
    bridgeTts.providerStatus || bridgeTts.status,
    0, 0, 999999
  );

  const audioUrl = safeStr(
    sig.audioUrl || sig.ttsAudioUrl ||
    audio.url || audio.audioUrl ||
    ttsResult.url || ttsResult.audioUrl ||
    transport.url || transport.audioUrl ||
    bridgeTts.url || bridgeTts.audioUrl || ""
  );
  const audioBase64 = safeStr(
    sig.audioBase64 || sig.ttsAudioBase64 ||
    audio.base64 || audio.audioBase64 ||
    ttsResult.base64 || ttsResult.audioBase64 ||
    transport.base64 || transport.audioBase64 ||
    bridgeTts.base64 || bridgeTts.audioBase64 || ""
  );
  const mimeType = safeStr(
    sig.audioMimeType || sig.ttsMimeType ||
    audio.mimeType || audio.contentType ||
    ttsResult.mimeType || ttsResult.contentType ||
    transport.mimeType || transport.contentType ||
    bridgeTts.mimeType || bridgeTts.contentType || ""
  ).toLowerCase();
  const format = safeStr(
    sig.audioFormat || sig.ttsFormat ||
    audio.format || ttsResult.format || transport.format || bridgeTts.format || ""
  ).toLowerCase();
  const chars = clampInt(
    sig.audioChars || sig.ttsChars ||
    audio.chars || audio.textLength ||
    ttsResult.chars || ttsResult.textLength ||
    transport.chars || transport.textLength ||
    bridgeTts.chars || bridgeTts.textLength,
    0, 0, 999999
  );
  const playable = !!(
    sig.audioPlayable || sig.ttsPlayable ||
    audio.playable || ttsResult.playable || transport.playable || bridgeTts.playable ||
    audioUrl || audioBase64
  );

  return { action, shouldStop, retryable, reason, status, playable, audioUrl, audioBase64, mimeType, format, chars };
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
  const text = `${extractInboundText(inbound)} ${memoryPatch.lastTopic || ""} ${memoryPatch.carryForwardSummary || ""}`.toLowerCase();
  if (/sandblast|user engagement|conversion path|roku|sponsor|investor|business value|premium|pitch|progression shaping|active users|first move|make it sharper|user-facing/.test(text)) return "Sandblast engagement and Roku conversion path";
  if (/nyx|nexus|marion|ai media|interface|emotionally aware|intelligent/.test(text)) return "AI media interface continuity";
  if (/cash flow|profit|finance/.test(text)) return "finance";
  if (/legal|law/.test(text)) return "law";
  if (/least privilege|cyber|security/.test(text)) return "cyber";
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
  const userHash = firstNonEmpty(memoryPatch.userSignature, memoryPatch.lastUserSignature, hashUserTextForComposer(inboundText));
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
    !audio.shouldStop &&
    (marionFinalSignal || trustedFinalShape || trustedFinalEnvelope || composerAdvancedState) &&
    isActionableComposerReply(speak)
  );
  const deepeningTrustedFinalCompletion = !!(
    (deepeningInbound || trustedDeepeningCompletion) &&
    trustedFinalCompletion &&
    !loopPhraseRejected &&
    !audio.shouldStop
  );
  if (trustedFinalCompletion && stage === "recover") stage = "final";
  if (trustedFinalCompletion && stage === "open") stage = "final";
  if (deepeningTrustedFinalCompletion && (stage === "recover" || stage === "recovery" || stage === "open" || stage === "compose")) stage = "final";

  const existingTerminalStopActive = Number(prev.audio?.terminalStopUntil || 0) > nowMs();
  const terminalStopUntil = audio.shouldStop ? nowMs() + TERMINAL_AUDIO_STOP_MS : (existingTerminalStopActive && !trustedFinalCompletion ? Number(prev.audio.terminalStopUntil || 0) : 0);
  if (existingTerminalStopActive && !trustedFinalCompletion && !technicalBypassSupportLock && stage !== "terminal_stop") stage = "terminal_stop";
  const releaseSupportLock = !!(
    stage !== "terminal_stop" &&
    !audio.shouldStop &&
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
    audio.shouldStop ||
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

  const continuityThread = {
    depthLevel: Math.max(1, Math.max(clampInt(memoryPatch.turnDepth, 0, 0, 999999), repetition.sameStageCount + 1, repetition.sameIntentCount + 1, repetition.sameEmotionCount + 1)),
    threadContinuation: (loopBreakTrustedFinal || deepeningTrustedFinalCompletion || trustedDeepeningCompletion) ? true : !!((sameLane || sameIntent || sameUser) && !sameAssistant || support.lockActive || repetition.noProgressCount > 0),
    unresolvedSignals: boundedArray([safeStr(emo.emotionKey || ""), safeStr(emo.emotionCluster || ""), safeStr(greeting.intent || ""), safeStr(greeting.tone || ""), safeStr(decision.rationale || ""), safeStr(creativeCognitive.lastIntent || "")], 6, 160),
    lastTopics: boundedArray([safeStr(memoryPatch.lastTopic || ""), safeStr(inbound?.lane || lane || ""), safeStr(intent || ""), safeStr(greeting.intent || ""), safeStr(creativeCognitive.lastMode || "")], 6, 160),
    responseMode: safeStr(emo.supportMode || (greeting.matched ? "greeting_intent" : "") || plannerMode || decision.move || "steady") || "steady",
    marionFinalObserved: marionFinalSignal,
    finalEnvelopeTrusted: trustedFinalEnvelope || trustedFinalShape,
    loopPhraseRejected: trustedFinalBreaksRecovery ? false : loopPhraseRejected,
    packCohesion: conversationalPack,
    updatedAt: nowMs()
  };

  const nextTurnDepth = trustedFinalCompletion ? Math.max(1, clampInt(memoryPatch.turnDepth, 0, 0, 999999) || (deepeningInbound ? clampInt(prev.turnDepth, 0, 0, 999999) + 1 : 1)) : clampInt(prev.turnDepth, 0, 0, 999999);
  const nextTopic = firstNonEmpty(memoryPatch.lastTopic, deriveStateTopic(inbound, memoryPatch, lane), prev.lastTopic);
  const nextCarryForwardSummary = trustedFinalCompletion ? buildStateCarryForwardSummary({ prev, inbound, memoryPatch, speak, intent, domain: composerDomain, lane }) : prev.carryForwardSummary;
  const nextConversationSummary = trustedFinalCompletion ? compactStateSummary(nextCarryForwardSummary, 760) : prev.conversationSummary;
  const inputSource = canonicalTurnInputSource(inbound, { ...params, inputSource: memoryPatch.inputSource });
  const continuityRegression = buildFiveTurnContinuityState({ prev, inbound, memoryPatch, speak, userHash, assistantHash, trustedFinalCompletion, nextTurnDepth });
  const fiveTurnContract = continuityRegression.fiveTurnContract || extractFiveTurnContractState(prev,memoryPatch,inbound);
  const runtimeTelemetry = buildStateRuntimeTelemetry({params,inbound,reply:speak,trustedFinalCompletion,stage,intent,domain:composerDomain,lane});
  const domainConfidenceCarry = extractDomainConfidenceCarry(params, inbound, memoryPatch);
  const progressionShapingGuard = extractProgressionShapingGuardCarry(params, inbound, memoryPatch);

  const nextState = {
    ...prev,
    rev: clampInt(prev.rev, 0, 0, 999999) + 1,
    lane,
    domain: safeStr(composerDomain || lane) || lane,
    lastUserText: boundedOneLine(inboundText || memoryPatch.lastUserText || prev.lastUserText, MAX_STATE_TEXT),
    lastAssistantReply: trustedFinalCompletion ? boundedOneLine(speak, MAX_STATE_TEXT) : prev.lastAssistantReply,
    lastKnowledgeDomain: composerKnowledgeDomain || prev.lastKnowledgeDomain || "",
    lastTopic: boundedOneLine(nextTopic, 320),
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
    progressionLock,
    progressionShapingGuard,
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
      playbackReady: !!audio.playable
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
      progressionShapingGuard,
      progressionShapingGuardActive: !!progressionShapingGuard.active,
      marionFinalObserved: marionFinalSignal,
      lastComposerIntent: boundedOneLine(memoryPatch.lastIntent || marion.intent || "", 160),
      lastComposerDomain: boundedOneLine(memoryPatch.lastDomain || marion.domain || "", 160),
      lastComposerUserSignature: boundedSignature(memoryPatch.userSignature || memoryPatch.lastUserSignature || ""),
      lastComposerReplySignature: boundedSignature(memoryPatch.replySignature || memoryPatch.lastReplySignature || ""),
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
  detectConversationalPackTrack,
  deriveConversationalPackRuntimeSelector,
  extractRuntimeTelemetryFromTurn,
  buildStateRuntimeTelemetry
};
module.exports.default = module.exports;
