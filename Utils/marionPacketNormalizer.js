"use strict";

const VERSION = "marionPacketNormalizer v1.2.0 MARION-INTENT-NORMALIZED + CONTRACT-HARDENED + SOFTFAIL-LOOP-GUARD";

const FALLBACK_REPLY = "I am here with you. Tell me what feels most important right now.";
const DEFAULT_ENDPOINT = "marion://routeMarion.primary";
const MAX_EVIDENCE = 8;
const MAX_FOLLOWUPS = 4;
const MAX_REPLY_CHARS = 2400;
const MAX_TRACE_CHARS = 180;

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

const DOMAIN_BY_INTENT = {
  technical_debug: "technical",
  emotional_support: "emotional",
  business_strategy: "business",
  music_query: "music",
  news_query: "news",
  roku_query: "roku",
  identity_or_memory: "memory",
  domain_question: "general_reasoning",
  simple_chat: "general"
};

function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v) { return Array.isArray(v) ? v : []; }
function safeStr(v) { return v == null ? "" : String(v).trim(); }
function lower(v) { return safeStr(v).toLowerCase(); }
function clampText(v, max = MAX_REPLY_CHARS) {
  const text = safeStr(v).replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return text.length > max ? text.slice(0, max).trim() : text;
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
function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function bool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}
function isInternalBlockerText(v) {
  const text = safeStr(v);
  if (!text) return false;
  return INTERNAL_BLOCKER_PATTERNS.some((rx) => rx.test(text));
}
function sanitizeUserFacingText(v, fallback = "") {
  const text = clampText(v);
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
function pickObj() {
  for (const value of arguments) if (isObj(value)) return { ...value };
  return {};
}
function pickArray() {
  for (const value of arguments) if (Array.isArray(value) && value.length) return value;
  return [];
}
function normalizeIntentName(v) {
  const intent = lower(v).replace(/[\s-]+/g, "_");
  return intent || "simple_chat";
}
function normalizeMarionIntent(packet, result) {
  const src = pickObj(
    packet.marionIntent,
    result.marionIntent,
    result.intentPacket,
    result.ui && result.ui.marionIntent,
    result.session && result.session.marionIntent,
    result.payload && result.payload.marionIntent
  );
  const intent = normalizeIntentName(src.intent || src.type || result.intent || packet.routing?.intent);
  const confidence = Math.max(0, Math.min(1, safeNumber(src.confidence, intent === "simple_chat" ? 0.4 : 0.66)));
  const activate = bool(src.activate, intent !== "simple_chat" || confidence >= 0.65);
  return {
    activate,
    intent,
    confidence,
    reason: safeStr(src.reason || src.source || "normalizer"),
    domainHint: safeStr(src.domainHint || src.domain || "")
  };
}
function resolveDomain(intentPacket, packet, result) {
  const domain = safeStr(
    intentPacket.domainHint ||
    packet.routing?.domain ||
    result.domain ||
    result?.payload?.domain ||
    DOMAIN_BY_INTENT[intentPacket.intent] ||
    "general"
  );
  return domain || "general";
}
function buildSoftReplySeed(packet, result, intentPacket) {
  const domain = lower(packet?.routing?.domain || result?.domain || resolveDomain(intentPacket, packet, result));
  const intent = lower(intentPacket?.intent || packet?.routing?.intent || result?.intent || "general");
  if (domain === "technical" || intent === "technical_debug") return "Send me the failing route, file, or error text, and I’ll run the autopsy cleanly.";
  if (domain === "business" || intent === "business_strategy") return "Tell me the target offer, audience, or pricing decision, and I’ll tighten the strategy.";
  if (domain === "finance") return "Tell me the number, goal, or decision you want broken down, and I’ll tighten it up with you.";
  if (domain === "law") return "Tell me the issue, document, or rule you want checked, and I’ll break down what matters most.";
  if (domain === "emotional" || domain === "psychology" || intent === "emotional_support") return "Tell me what feels most important right now, and I’ll stay with that exact point.";
  if (domain === "memory" || intent === "identity_or_memory") return "Tell me what thread you want continued, and I’ll reconnect the context.";
  return "Tell me the exact point you want handled, and I’ll answer that directly.";
}
function normalizeRouting(packet, result, intentPacket) {
  const routing = cloneObj(packet.routing);
  const domain = resolveDomain(intentPacket, packet, result);
  const intent = safeStr(routing.intent || intentPacket.intent || result.intent || "general") || "general";
  const endpoint = safeStr(routing.endpoint || result.endpoint || DEFAULT_ENDPOINT) || DEFAULT_ENDPOINT;
  const depth = safeStr(routing.depth || result.depth || result?.payload?.depth || (intentPacket.activate ? "domain" : "standard"));
  return { ...routing, domain, intent, endpoint, depth };
}
function normalizeEmotion(packet, result) {
  const emotion = cloneObj(packet.emotion);
  const lockedEmotion = isObj(emotion.lockedEmotion)
    ? { ...emotion.lockedEmotion }
    : pickObj(result.emotion, result.emotionalTurn && result.emotionalTurn.emotion);
  return { ...emotion, lockedEmotion };
}
function normalizeEvidence(packet, result) {
  const evidence = pickArray(packet.evidence, result.evidence, result?.payload?.evidence, result?.contract?.evidence);
  return evidence.slice(0, MAX_EVIDENCE);
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
function normalizeMemoryEnvelope(packet, result) {
  packet.continuityState = pickObj(packet.continuityState, result.continuityState);
  packet.turnMemory = pickObj(packet.turnMemory, result.turnMemory);
  packet.identityState = pickObj(packet.identityState, result.identityState);
  packet.relationshipState = pickObj(packet.relationshipState, result.relationshipState);
  packet.trustState = pickObj(packet.trustState, result.trustState);
  packet.privateChannel = pickObj(packet.privateChannel, result.privateChannel);
  packet.memorySignals = pickObj(packet.memorySignals, result.memorySignals);
  packet.consciousness = pickObj(packet.consciousness, result.consciousness);
  return packet;
}
function normalizeTrace(packet, result) {
  const meta = pickObj(packet.meta, result.meta);
  const traceId = safeStr(meta.traceId || meta.requestId || result.traceId || result.requestId);
  if (traceId) meta.traceId = traceId.slice(0, MAX_TRACE_CHARS);
  return meta;
}

function normalizeMarionPacket(result = {}) {
  const sourcePacket = isObj(result.packet) ? result.packet : {};
  const packet = { ...sourcePacket };

  packet.marionIntent = normalizeMarionIntent(packet, result);
  packet.routing = normalizeRouting(packet, result, packet.marionIntent);
  packet.emotion = normalizeEmotion(packet, result);

  const softReplySeed = buildSoftReplySeed(packet, result, packet.marionIntent);
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
    (packet.marionIntent.activate ? "marion_active" : "balanced")
  ) || "balanced";
  packet.synthesis.reply = resolvedReply;
  packet.synthesis.answer = resolvedReply;
  packet.synthesis.text = resolvedReply;
  packet.synthesis.output = resolvedReply;
  packet.synthesis.response = resolvedReply;
  packet.synthesis.message = resolvedReply;
  packet.synthesis.spokenText = safeStr(packet.synthesis.spokenText || result.spokenText || resolvedReply) || resolvedReply;

  packet.reply = resolvedReply;
  packet.answer = resolvedReply;
  packet.output = resolvedReply;
  packet.response = resolvedReply;
  packet.message = resolvedReply;
  packet.fallbackResponse = softReplySeed;
  packet.replySeed = softReplySeed;

  packet.evidence = normalizeEvidence(packet, result);
  normalizeMemoryEnvelope(packet, result);
  packet.meta = normalizeTrace(packet, result);

  const followUps = normalizeFollowUps(packet, result, resolvedReply);
  if (followUps.length) {
    packet.followUps = followUps;
    packet.synthesis.followUps = followUps;
    packet.synthesis.followUpsStrings = followUps;
  }

  packet.meta.packetNormalizer = VERSION;
  packet.meta.packetNormalized = true;
  packet.meta.marionIntentNormalized = true;
  packet.meta.marionActivated = !!packet.marionIntent.activate;
  packet.meta.replySoftFailed = resolvedReply === FALLBACK_REPLY || resolvedReply === softReplySeed;
  packet.meta.hadInternalBlocker = [
    sourcePacket?.synthesis?.reply,
    sourcePacket?.reply,
    result.reply,
    result.output,
    result.answer,
    result.text,
    result?.payload?.reply,
    result?.contract?.reply
  ].some(isInternalBlockerText);

  return packet;
}

module.exports = { VERSION, normalizeMarionPacket };
