"use strict";

const VERSION = "marionPacketNormalizer v1.2.4 LOOP-FINAL-PRESERVE + DATA-MARION-RUNTIME-PATH + MARION-INTENT-PASSTHROUGH + ROUTING-DOMAIN-GUARD + MEMORY-ENVELOPE-PRESERVE + SOFTFAIL-GUARDED";

const FALLBACK_REPLY = "I am here with you. Tell me what feels most important right now.";
const DEFAULT_ENDPOINT = "marion://routeMarion.primary";
const MAX_EVIDENCE = 8;
const MAX_FOLLOWUPS = 4;
const MARION_CONFIDENCE_FLOOR = 0;
const MARION_CONFIDENCE_CEILING = 1;
const MARION_RUNTIME_PATH = "./Data/marion/runtime";

function tryRequireRuntime(paths) {
  for (const p of Array.isArray(paths) ? paths : []) {
    try { return require(p); } catch (_) {}
  }
  return null;
}

const marionRuntimeRouter = tryRequireRuntime([
  "./marionIntentRouter",
  "./Data/marion/runtime/marionIntentRouter",
  "../Data/marion/runtime/marionIntentRouter",
  "../../Data/marion/runtime/marionIntentRouter"
]);

const DOMAIN_BY_INTENT = Object.freeze({
  technical_debug: "technical",
  emotional_support: "emotional",
  business_strategy: "business",
  music_query: "music",
  news_query: "news",
  roku_query: "roku",
  identity_or_memory: "memory",
  domain_question: "general_reasoning",
  simple_chat: "general"
});

const INTENT_ALIASES = Object.freeze({
  technical: "technical_debug",
  tech: "technical_debug",
  debug: "technical_debug",
  autopsy: "technical_debug",
  emotional: "emotional_support",
  support: "emotional_support",
  business: "business_strategy",
  strategy: "business_strategy",
  music: "music_query",
  news: "news_query",
  newscanada: "news_query",
  roku: "roku_query",
  memory: "identity_or_memory",
  continuity: "identity_or_memory",
  general: "domain_question",
  question: "domain_question",
  chat: "simple_chat"
});

const INTERNAL_BLOCKER_PATTERNS = [
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
  /undefined/i,
  /null/i
];

function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v) { return Array.isArray(v) ? v : []; }
function safeStr(v) { return v == null ? "" : String(v).trim(); }
function lower(v) { return safeStr(v).toLowerCase(); }
function safeBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = lower(v);
  if (["true", "yes", "1", "on"].includes(s)) return true;
  if (["false", "no", "0", "off"].includes(s)) return false;
  return fallback;
}
function clampNumber(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(MARION_CONFIDENCE_FLOOR, Math.min(MARION_CONFIDENCE_CEILING, n));
}
function uniq(items) {
  const seen = new Set();
  const out = [];
  for (const item of arr(items)) {
    const value = safeStr(item);
    const key = lower(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
function cloneObj(v) { return isObj(v) ? { ...v } : {}; }
function firstObj() {
  for (const value of arguments) if (isObj(value)) return value;
  return {};
}
function canonicalIntent(value) {
  const raw = lower(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!raw) return "simple_chat";
  return INTENT_ALIASES[raw] || raw;
}
function isInternalBlockerText(v) {
  const text = safeStr(v);
  if (!text) return false;
  return INTERNAL_BLOCKER_PATTERNS.some((rx) => rx.test(text));
}
function sanitizeUserFacingText(v, fallback = "") {
  const text = safeStr(v);
  if (!text || isInternalBlockerText(text)) return safeStr(fallback);
  return text;
}
function firstUsableReply() {
  for (const value of arguments) {
    const cleaned = sanitizeUserFacingText(value, "");
    if (cleaned && cleaned.length >= 2 && !/^done\.?$/i.test(cleaned)) return cleaned;
  }
  return "";
}
function resolveIntentDomain(intent, fallbackDomain) {
  const key = canonicalIntent(intent);
  return DOMAIN_BY_INTENT[key] || safeStr(fallbackDomain) || "general";
}
function normalizeMarionIntent(packet, result) {
  const raw = firstObj(
    result.marionIntent,
    result.intentPacket,
    result?.payload?.marionIntent,
    result?.session?.marionIntent,
    result?.body?.marionIntent,
    result?.ui?.marionIntent,
    packet.marionIntent,
    packet.intentPacket,
    packet?.session?.marionIntent,
    packet?.payload?.marionIntent,
    packet?.ui?.marionIntent
  );
  const intent = canonicalIntent(raw.intent || raw.type || result.intent || packet.intent || "simple_chat");
  const activate = safeBool(raw.activate, intent !== "simple_chat");
  const domain = resolveIntentDomain(intent, raw.domain || raw.routeDomain || result.domain || packet?.routing?.domain);
  const source = safeStr(raw.source || raw.triggerSource || result.triggerSource || packet.triggerSource || "normalizer");
  return {
    activate,
    intent,
    confidence: clampNumber(raw.confidence, activate ? 0.66 : 0.4),
    reason: safeStr(raw.reason || source || "normalizer"),
    source,
    triggerSource: source,
    domain,
    routeDomain: domain
  };
}
function routeThroughRuntime(packet, result) {
  if (!marionRuntimeRouter || typeof marionRuntimeRouter.routeMarionIntent !== "function") return null;
  try {
    const routed = marionRuntimeRouter.routeMarionIntent({
      text: safeStr(result.text || result.query || packet.text || ""),
      lane: safeStr(result.lane || packet.lane || "general") || "general",
      marionIntent: packet.marionIntent || result.marionIntent || {},
      session: isObj(result.session) ? result.session : (isObj(packet.session) ? packet.session : {})
    });
    return isObj(routed) ? routed : null;
  } catch (_) {
    return null;
  }
}

function buildSoftReplySeed(packet, result) {
  const domain = lower(packet?.routing?.domain || packet?.marionIntent?.domain || result?.domain || "general");
  if (domain === "finance") return "Tell me the number, goal, or decision you want broken down, and I’ll tighten it up with you.";
  if (domain === "law") return "Tell me the issue, document, or rule you want checked, and I’ll break down what matters most.";
  if (domain === "psychology" || domain === "emotional") return "Tell me what feels most important right now, and I’ll stay with that exact point.";
  if (domain === "technical") return "Tell me the file, route, or failure point, and I’ll run the autopsy cleanly.";
  if (domain === "business") return "Tell me the offer, audience, or revenue target, and I’ll sharpen the strategy.";
  if (domain === "memory") return "Tell me what thread you want continued, and I’ll reconnect the context.";
  return "Tell me the exact point you want handled, and I’ll answer that directly.";
}
function normalizeRouting(packet, result) {
  const routing = cloneObj(packet.routing);
  const marionIntent = packet.marionIntent || normalizeMarionIntent(packet, result);
  const runtimeRoute = routeThroughRuntime({ ...packet, marionIntent }, result);
  const routed = isObj(runtimeRoute && runtimeRoute.routing) ? runtimeRoute.routing : {};
  const domain = safeStr(routing.domain || routed.domain || marionIntent.domain || result.domain || "general") || "general";
  const intent = canonicalIntent(routing.intent || routed.intent || marionIntent.intent || result.intent || "general");
  const endpoint = safeStr(routing.endpoint || routed.endpoint || result.endpoint || DEFAULT_ENDPOINT) || DEFAULT_ENDPOINT;
  const depth = safeStr(routing.depth || routed.depth || result.depth || (domain === "technical" ? "forensic" : domain === "emotional" || domain === "memory" ? "high" : "balanced"));
  const mode = safeStr(routing.mode || routed.mode || result.mode || (domain === "technical" ? "autopsy" : domain === "business" ? "commercial" : domain === "memory" ? "continuity" : domain === "emotional" ? "supportive_reasoning" : "domain_retrieval"));
  return { ...routed, ...routing, domain, intent, endpoint, depth, mode, useDomainKnowledge: domain !== "general", useMemory: domain === "memory" || intent === "identity_or_memory", triggerSource: marionIntent.triggerSource || marionIntent.source || routed.triggerSource || "normalizer", runtimePath: MARION_RUNTIME_PATH };
}
function normalizeEmotion(packet, result) {
  const emotion = cloneObj(packet.emotion);
  const lockedEmotion = isObj(emotion.lockedEmotion)
    ? { ...emotion.lockedEmotion }
    : (isObj(result.emotion) ? { ...result.emotion } : {});
  return { ...emotion, lockedEmotion };
}
function normalizeEvidence(packet, result) {
  const evidence = arr(packet.evidence).length ? arr(packet.evidence) : arr(result.evidence);
  return evidence.filter(Boolean).slice(0, MAX_EVIDENCE);
}
function mergeRenderableContent(packet, result) {
  const synthesis = cloneObj(packet.synthesis);
  const payload = isObj(result.payload) ? result.payload : {};
  const ui = isObj(result.ui) ? result.ui : {};
  const emotionalTurn = isObj(result.emotionalTurn) ? result.emotionalTurn : {};
  const contentKeys = [
    "newsItems", "stories", "articles", "cards", "carouselItems",
    "contentBlocks", "sections", "pageData", "page", "newsPage", "render"
  ];
  for (const key of contentKeys) {
    if (typeof synthesis[key] !== "undefined") continue;
    if (typeof payload[key] !== "undefined") synthesis[key] = payload[key];
    else if (typeof ui[key] !== "undefined") synthesis[key] = ui[key];
    else if (typeof emotionalTurn[key] !== "undefined") synthesis[key] = emotionalTurn[key];
  }
  return synthesis;
}
function normalizeFollowUps(packet, result, reply) {
  const raw = []
    .concat(arr(packet.followUps))
    .concat(arr(packet.synthesis && packet.synthesis.followUps))
    .concat(arr(result.followUps))
    .concat(arr(result.followUpsStrings))
    .concat(arr(result.payload && result.payload.followUpsStrings));
  return uniq(raw.map((item) => sanitizeUserFacingText(item, "")))
    .filter(Boolean)
    .filter((item) => lower(item) !== lower(reply))
    .slice(0, MAX_FOLLOWUPS);
}
function normalizeStateEnvelope(packet, result, key) {
  return isObj(packet[key]) ? packet[key] : (isObj(result[key]) ? result[key] : {});
}
function normalizeMeta(packet, result, sourcePacket, resolvedReply, fallbackReply) {
  const meta = isObj(packet.meta) ? { ...packet.meta } : (isObj(result.meta) ? { ...result.meta } : {});
  const blockerInputs = [
    sourcePacket?.synthesis?.reply,
    sourcePacket?.reply,
    result.reply,
    result.output,
    result.answer,
    result.text,
    result?.payload?.reply,
    result?.contract?.reply
  ];
  meta.packetNormalizer = VERSION;
  meta.packetNormalized = true;
  meta.replySoftFailed = resolvedReply === FALLBACK_REPLY || resolvedReply === fallbackReply;
  meta.hadInternalBlocker = blockerInputs.some(isInternalBlockerText);
  meta.normalizedAt = new Date().toISOString();
  return meta;
}

function normalizeMarionPacket(result = {}) {
  const sourcePacket = isObj(result.packet) ? result.packet : {};
  const packet = { ...sourcePacket };

  packet.marionIntent = normalizeMarionIntent(packet, result);
  packet.routing = normalizeRouting(packet, result);
  packet.emotion = normalizeEmotion(packet, result);

  const softReplySeed = buildSoftReplySeed(packet, result);
  const resolvedReply = firstUsableReply(
    sourcePacket?.synthesis?.reply,
    sourcePacket?.synthesis?.answer,
    sourcePacket?.synthesis?.text,
    sourcePacket?.synthesis?.response,
    sourcePacket?.reply,
    sourcePacket?.answer,
    sourcePacket?.response,
    result.reply,
    result.output,
    result.answer,
    result.response,
    result.text,
    result.spokenText,
    result?.payload?.reply,
    result?.payload?.answer,
    result?.payload?.text,
    result?.payload?.response,
    result?.contract?.reply,
    result?.contract?.output,
    result?.contract?.response,
    softReplySeed,
    FALLBACK_REPLY
  ) || softReplySeed || FALLBACK_REPLY;

  packet.synthesis = mergeRenderableContent(packet, result);
  packet.synthesis.domain = safeStr(packet.synthesis.domain || packet.routing.domain) || packet.routing.domain;
  packet.synthesis.intent = safeStr(packet.synthesis.intent || packet.routing.intent) || packet.routing.intent;
  packet.synthesis.mode = safeStr(
    packet.synthesis.mode ||
    result?.contract?.supportMode ||
    result?.supportMode ||
    "balanced"
  ) || "balanced";
  packet.synthesis.reply = resolvedReply;
  packet.synthesis.answer = resolvedReply;
  packet.synthesis.text = resolvedReply;
  packet.synthesis.output = resolvedReply;
  packet.synthesis.response = resolvedReply;
  packet.synthesis.message = resolvedReply;
  packet.synthesis.spokenText = safeStr(
    packet.synthesis.spokenText ||
    result.spokenText ||
    resolvedReply
  ) || resolvedReply;
  packet.synthesis.marionIntent = packet.marionIntent;
  packet.synthesis.routing = packet.routing;

  packet.reply = resolvedReply;
  packet.answer = resolvedReply;
  packet.output = resolvedReply;
  packet.response = resolvedReply;
  packet.message = resolvedReply;
  packet.fallbackResponse = softReplySeed;
  packet.replySeed = softReplySeed;

  packet.evidence = normalizeEvidence(packet, result);
  packet.continuityState = normalizeStateEnvelope(packet, result, "continuityState");
  packet.turnMemory = normalizeStateEnvelope(packet, result, "turnMemory");
  packet.identityState = normalizeStateEnvelope(packet, result, "identityState");
  packet.relationshipState = normalizeStateEnvelope(packet, result, "relationshipState");
  packet.trustState = normalizeStateEnvelope(packet, result, "trustState");
  packet.privateChannel = normalizeStateEnvelope(packet, result, "privateChannel");
  packet.memorySignals = normalizeStateEnvelope(packet, result, "memorySignals");
  packet.consciousness = normalizeStateEnvelope(packet, result, "consciousness");

  const followUps = normalizeFollowUps(packet, result, resolvedReply);
  if (followUps.length) {
    packet.followUps = followUps;
    packet.synthesis.followUps = followUps;
    packet.synthesis.followUpsStrings = followUps;
  }

  packet.meta = normalizeMeta(packet, result, sourcePacket, resolvedReply, softReplySeed);
  packet.meta.marionIntentNormalized = true;
  packet.meta.marionRuntimePath = MARION_RUNTIME_PATH;
  packet.meta.marionRuntimeRouterLoaded = !!marionRuntimeRouter;
  packet.meta.routingHardened = true;
  packet.meta.memoryEnvelopePreserved = true;
  packet.meta.triggerSource = packet.marionIntent.triggerSource || packet.marionIntent.source || "normalizer";
  packet.meta.intent = packet.marionIntent.intent;
  packet.meta.domain = packet.routing.domain;
  packet.meta.routingMode = packet.routing.mode;
  packet.meta.routingDepth = packet.routing.depth;

  return packet;
}

module.exports = { VERSION, normalizeMarionPacket, normalizeMarionIntent };
