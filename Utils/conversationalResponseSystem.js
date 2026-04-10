"use strict";

const VERSION = "conversationalResponseSystem v2.2.0 EMOTIONAL-ROUTE-PRESERVE";

function safeStr(v) { return v == null ? "" : String(v); }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v) { return Array.isArray(v) ? v : []; }
function toFiniteNumber(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(v, min, max, fallback = min) { const n = toFiniteNumber(v, fallback); return Math.max(min, Math.min(max, n)); }
function clamp01(v, fallback = 0) { return clamp(v, 0, 1, fallback); }
function firstNonEmpty() { for (const value of arguments) { const s = safeStr(value).trim(); if (s) return s; } return ""; }
function uniq(items) { const out = []; const seen = new Set(); for (const item of arr(items)) { const key = typeof item === "string" ? item.trim().toLowerCase() : JSON.stringify(item); if (!key || seen.has(key)) continue; seen.add(key); out.push(item); } return out; }

function normalizeSupportFlags(raw) {
  const src = isObj(raw) ? raw : {};
  return {
    highDistress: !!src.highDistress,
    needsContainment: !!src.needsContainment,
    needsGrounding: !!src.needsGrounding,
    needsStabilization: !!src.needsStabilization,
    vulnerable: !!src.vulnerable
  };
}

function normalizeEmotion(raw) {
  const src = isObj(raw) ? raw : {};
  return {
    primaryEmotion: firstNonEmpty(src.primaryEmotion, src.emotion, "neutral").toLowerCase(),
    secondaryEmotion: firstNonEmpty(src.secondaryEmotion, "").toLowerCase(),
    intensity: clamp01(src.intensity, 0),
    valence: clamp(src.valence, -1, 1, 0),
    supportFlags: normalizeSupportFlags(src.supportFlags)
  };
}

function sanitizeUserFacingReply(reply) {
  let out = safeStr(reply).trim();
  if (!out) return "";
  for (const rx of [
    /\b(shell is active|guiding properly)\b/ig,
    /\broute[_ ]?guard\b/ig,
    /\bturn lifecycle\b/ig,
    /\btelemetry\b/ig,
    /\bruntime(?:-|\s)?trace\b/ig,
    /\binternal(?:-|\s)?pipeline\b/ig
  ]) out = out.replace(rx, "");
  return out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function normalizeContext(result, packet) {
  const domain = firstNonEmpty(result?.domain, packet?.routing?.domain, "general").toLowerCase();
  const requestedMode = firstNonEmpty(result?.mode, packet?.synthesis?.mode, result?.responsePlan?.semanticFrame, "balanced").toLowerCase();
  const intent = firstNonEmpty(result?.intent, packet?.routing?.intent, "general").toLowerCase();
  const emotion = normalizeEmotion(result?.emotion || packet?.emotion?.lockedEmotion || result?.emotionalTurn?.emotion || {});
  const evidenceCount = Math.max(0, toFiniteNumber(packet?.evidence?.count, arr(packet?.evidence).length));
  const privateChannel = isObj(packet?.privateChannel) ? packet.privateChannel : (isObj(result?.privateChannel) ? result.privateChannel : {});
  const trustState = isObj(packet?.trustState) ? packet.trustState : (isObj(result?.trustState) ? result.trustState : {});
  const consciousness = isObj(packet?.consciousness) ? packet.consciousness : (isObj(result?.consciousness) ? result.consciousness : {});
  const responsePlan = isObj(result?.responsePlan) ? result.responsePlan : (isObj(packet?.synthesis?.responsePlan) ? packet.synthesis.responsePlan : {});
  const nyxDirective = isObj(result?.nyxDirective) ? result.nyxDirective : (isObj(packet?.synthesis?.nyxDirective) ? packet.synthesis.nyxDirective : {});
  const supportMode = firstNonEmpty(result?.supportMode, packet?.synthesis?.supportMode, "").toLowerCase();
  return { domain, requestedMode, intent, emotion, evidenceCount, privateChannel, trustState, consciousness, responsePlan, nyxDirective, supportMode };
}

function inferState(domain, emotion, requestedMode) {
  const d = safeStr(domain).toLowerCase();
  const m = safeStr(requestedMode).toLowerCase();
  if (d === "psychology") return "supportive";
  if (m === "recovery") return "clarifying";
  if (emotion.supportFlags.highDistress || emotion.supportFlags.needsContainment || emotion.supportFlags.needsStabilization) return "supportive";
  if (["sad","sadness","anxious","anxiety","overwhelmed","depressed","fear","grief","loneliness","panic"].includes(emotion.primaryEmotion)) return "supportive";
  return "focused";
}

function buildFallbackReply(context) {
  if (context.domain === "psychology") {
    if (context.emotion.supportFlags.highDistress || context.emotion.intensity >= 0.8) {
      return "I am here with you. We can take this one step at a time. What feels heaviest right now?";
    }
    if (["depressed","sad","sadness","grief","loneliness"].includes(context.emotion.primaryEmotion)) {
      return "I hear the weight in that. You do not have to carry the whole thing at once. What has been sitting on you the most?";
    }
    if (["anxious","anxiety","fear","panic","overwhelmed"].includes(context.emotion.primaryEmotion)) {
      return "I am with you. Let us slow this down and take the most urgent part first. What feels hardest right now?";
    }
    return "I am with you. Tell me what feels most important right now.";
  }
  return "I am with you. Give me a little more, and I will help tighten the next move.";
}

function domainPlaceholder(domain, state) {
  switch (safeStr(domain).toLowerCase()) {
    case "psychology": return state === "supportive" ? "Tell Nyx what feels heavy…" : "Tell Nyx what matters most right now…";
    case "finance": return "Ask Nyx to break down the numbers…";
    case "law": return "Ask Nyx what applies and where the risk is…";
    default: return "Ask Nyx anything about Sandblast…";
  }
}

function buildUi(context, state) {
  return {
    chips: [],
    allowMic: true,
    mode: state,
    state,
    emotionalState: state,
    promptPlacement: "attached",
    replace: state === "supportive",
    clearStale: state === "supportive",
    placeholder: domainPlaceholder(context.domain, state)
  };
}

function buildEmotionalTurn(context, state) {
  return {
    state,
    domain: context.domain,
    intent: context.intent,
    mode: context.requestedMode,
    emotion: context.emotion,
    privateChannel: context.privateChannel,
    trustState: context.trustState,
    consciousness: context.consciousness,
    supportMode: context.supportMode,
    responsePlan: context.responsePlan,
    nyxDirective: context.nyxDirective
  };
}

function resolveReply(result, packet, context) {
  const emotionalCandidate = firstNonEmpty(
    result.reply,
    result.output,
    result.interpretation,
    packet?.synthesis?.reply,
    packet?.synthesis?.answer,
    packet?.reply,
    packet?.answer
  );
  const cleaned = sanitizeUserFacingReply(emotionalCandidate);
  if (cleaned && !/^done\.?$/i.test(cleaned)) return cleaned;
  return buildFallbackReply(context);
}

function buildResponseContract(result = {}, packet = {}) {
  const context = normalizeContext(result, packet);
  const state = inferState(context.domain, context.emotion, context.requestedMode);
  const reply = resolveReply(result, packet, context);
  const ui = buildUi(context, state);
  const emotionalTurn = buildEmotionalTurn(context, state);
  const followUps = uniq(arr(result.followUps || packet?.synthesis?.followUps || [])).slice(0, 4);
  return {
    ok: true,
    reply,
    ui,
    emotionalTurn,
    followUps,
    meta: {
      version: VERSION,
      domain: context.domain,
      intent: context.intent,
      state,
      evidenceCount: context.evidenceCount,
      privateChannelActive: !!context.privateChannel?.active,
      trustTier: safeStr(context.trustState?.tier || ""),
      consciousnessLevel: safeStr(context.consciousness?.level || ""),
      supportMode: safeStr(context.supportMode || ""),
      preservedEmotionalRoute: true
    }
  };
}

module.exports = { VERSION, buildResponseContract, sanitizeUserFacingReply };
