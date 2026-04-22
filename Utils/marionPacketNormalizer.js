
"use strict";

const VERSION = "marionPacketNormalizer v1.1.0 AUTOPSY-HARDENED-SOFTFAIL-LOOP-GUARD";

const FALLBACK_REPLY = "I am here with you. Tell me what feels most important right now.";
const DEFAULT_ENDPOINT = "marion://routeMarion.primary";
const MAX_EVIDENCE = 8;
const MAX_FOLLOWUPS = 4;

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
  /packet_invalid/i
];

function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v) { return Array.isArray(v) ? v : []; }
function safeStr(v) { return v == null ? "" : String(v).trim(); }
function lower(v) { return safeStr(v).toLowerCase(); }
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
function buildSoftReplySeed(packet, result) {
  const domain = lower(packet?.routing?.domain || result?.domain || "general");
  if (domain === "finance") return "Tell me the number, goal, or decision you want broken down, and I’ll tighten it up with you.";
  if (domain === "law") return "Tell me the issue, document, or rule you want checked, and I’ll break down what matters most.";
  if (domain === "psychology") return "Tell me what feels most important right now, and I’ll stay with that exact point.";
  return "Tell me the exact point you want handled, and I’ll answer that directly.";
}
function normalizeRouting(packet, result) {
  const routing = cloneObj(packet.routing);
  const domain = safeStr(routing.domain || result.domain || "general") || "general";
  const intent = safeStr(routing.intent || result.intent || "general") || "general";
  const endpoint = safeStr(routing.endpoint || result.endpoint || DEFAULT_ENDPOINT) || DEFAULT_ENDPOINT;
  return { domain, intent, endpoint };
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

function normalizeMarionPacket(result = {}) {
  const sourcePacket = isObj(result.packet) ? result.packet : {};
  const packet = { ...sourcePacket };

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

  const baseSynthesis = isObj(packet.synthesis) ? packet.synthesis : {};
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

  packet.reply = resolvedReply;
  packet.answer = resolvedReply;
  packet.output = resolvedReply;
  packet.response = resolvedReply;
  packet.message = resolvedReply;
  packet.fallbackResponse = softReplySeed;
  packet.replySeed = softReplySeed;

  packet.evidence = normalizeEvidence(packet, result);
  packet.continuityState = isObj(packet.continuityState) ? packet.continuityState : (isObj(result.continuityState) ? result.continuityState : {});
  packet.turnMemory = isObj(packet.turnMemory) ? packet.turnMemory : (isObj(result.turnMemory) ? result.turnMemory : {});
  packet.identityState = isObj(packet.identityState) ? packet.identityState : (isObj(result.identityState) ? result.identityState : {});
  packet.relationshipState = isObj(packet.relationshipState) ? packet.relationshipState : (isObj(result.relationshipState) ? result.relationshipState : {});
  packet.trustState = isObj(packet.trustState) ? packet.trustState : (isObj(result.trustState) ? result.trustState : {});
  packet.privateChannel = isObj(packet.privateChannel) ? packet.privateChannel : (isObj(result.privateChannel) ? result.privateChannel : {});
  packet.memorySignals = isObj(packet.memorySignals) ? packet.memorySignals : (isObj(result.memorySignals) ? result.memorySignals : {});
  packet.consciousness = isObj(packet.consciousness) ? packet.consciousness : (isObj(result.consciousness) ? result.consciousness : {});
  packet.meta = isObj(packet.meta) ? { ...packet.meta } : (isObj(result.meta) ? { ...result.meta } : {});

  const followUps = normalizeFollowUps(packet, result, resolvedReply);
  if (followUps.length) {
    packet.followUps = followUps;
    packet.synthesis.followUps = followUps;
    packet.synthesis.followUpsStrings = followUps;
  }

  packet.meta.packetNormalizer = VERSION;
  packet.meta.packetNormalized = true;
  packet.meta.replySoftFailed = resolvedReply === FALLBACK_REPLY;
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
