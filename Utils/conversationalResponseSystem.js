"use strict";

const VERSION = "conversationalResponseSystem v2.3.0 HANDOFF-NORMALIZED PIPELINE-TRACE";
const DEBUG_TAG = "[MARION] conversationalResponseSystem patch active";
try { console.log(DEBUG_TAG, VERSION); } catch (_e) {}

function safeStr(v) { return v == null ? "" : String(v); }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v) { return Array.isArray(v) ? v : []; }
function toFiniteNumber(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(v, min, max, fallback = min) { const n = toFiniteNumber(v, fallback); return Math.max(min, Math.min(max, n)); }
function clamp01(v, fallback = 0) { return clamp(v, 0, 1, fallback); }
function firstNonEmpty() { for (const value of arguments) { const s = safeStr(value).trim(); if (s) return s; } return ""; }
function uniq(items) { const out = []; const seen = new Set(); for (const item of arr(items)) { const key = typeof item === "string" ? item.trim().toLowerCase() : JSON.stringify(item); if (!key || seen.has(key)) continue; seen.add(key); out.push(item); } return out; }


function normalizePipelineTrace(raw) {
  const src = isObj(raw) ? raw : {};
  return {
    stage: safeStr(src.stage || "unknown"),
    version: safeStr(src.version || ""),
    domain: safeStr(src.domain || ""),
    supportMode: safeStr(src.supportMode || ""),
    riskLevel: safeStr(src.riskLevel || ""),
    resolvedAt: toFiniteNumber(src.resolvedAt, Date.now())
  };
}

function normalizeStrategy(raw) {
  const src = isObj(raw) ? raw : {};
  const expressionContract = isObj(src.expressionContract) ? src.expressionContract : {};
  return {
    archetype: safeStr(src.archetype || "clarify").toLowerCase(),
    supportModeCandidate: safeStr(src.supportModeCandidate || src.supportMode || "steady_assist").toLowerCase(),
    routeBias: safeStr(src.routeBias || "maintain").toLowerCase(),
    deliveryTone: safeStr(src.deliveryTone || "steadying").toLowerCase(),
    questionPressure: safeStr(src.questionPressure || expressionContract.questionPressure || "medium").toLowerCase(),
    transitionReadiness: safeStr(src.transitionReadiness || expressionContract.transitionReadiness || "medium").toLowerCase(),
    acknowledgementMode: safeStr(src.acknowledgementMode || expressionContract.acknowledgementMode || "auto").toLowerCase(),
    expressionContract
  };
}

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
    locked: src.locked !== false,
    primaryEmotion: firstNonEmpty(src.primaryEmotion, src.emotion, src.source?.emotion, "neutral").toLowerCase(),
    secondaryEmotion: firstNonEmpty(src.secondaryEmotion, "").toLowerCase(),
    intensity: clamp01(src.intensity, 0),
    valence: clamp(src.valence, -1, 1, 0),
    confidence: clamp01(src.confidence, 0.82),
    supportFlags: normalizeSupportFlags(src.supportFlags),
    needs: uniq(arr(src.needs || [])),
    cues: uniq(arr(src.cues || []))
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
  const domain = firstNonEmpty(result?.domain, packet?.routing?.domain, result?.source?.domain, "general").toLowerCase();
  const responsePlan = isObj(result?.responsePlan) ? result.responsePlan : (isObj(packet?.synthesis?.responsePlan) ? packet.synthesis.responsePlan : {});
  const nyxDirective = isObj(result?.nyxDirective) ? result.nyxDirective : (isObj(packet?.synthesis?.nyxDirective) ? packet.synthesis.nyxDirective : {});
  const requestedMode = firstNonEmpty(result?.mode, packet?.synthesis?.mode, responsePlan?.semanticFrame, "balanced").toLowerCase();
  const intent = firstNonEmpty(result?.intent, packet?.routing?.intent, result?.meta?.intent, "general").toLowerCase();
  const emotion = normalizeEmotion(
    result?.emotion ||
    packet?.emotion?.lockedEmotion ||
    packet?.emotion ||
    result?.emotionalTurn?.emotion ||
    result?.synthesis?.emotion ||
    {}
  );
  const strategy = normalizeStrategy(result?.strategy || result?.synthesis?.strategy || packet?.strategy || {});
  const evidenceCount = Math.max(0, toFiniteNumber(packet?.evidence?.count, arr(packet?.evidence).length));
  const privateChannel = isObj(packet?.privateChannel) ? packet.privateChannel : (isObj(result?.privateChannel) ? result.privateChannel : {});
  const trustState = isObj(packet?.trustState) ? packet.trustState : (isObj(result?.trustState) ? result.trustState : {});
  const consciousness = isObj(packet?.consciousness) ? packet.consciousness : (isObj(result?.consciousness) ? result.consciousness : {});
  const supportMode = firstNonEmpty(result?.supportMode, result?.synthesis?.supportMode, packet?.synthesis?.supportMode, strategy.supportModeCandidate, "").toLowerCase();
  const guidance = uniq(arr(result?.guidance || packet?.synthesis?.guidance || []));
  const guardrails = uniq(arr(result?.guardrails || packet?.synthesis?.guardrails || []));
  const source = isObj(result?.source) ? result.source : {};
  const diagnostics = isObj(result?.diagnostics) ? result.diagnostics : {};
  const pipelineTrace = normalizePipelineTrace(result?.pipelineTrace || {});
  return {
    domain, requestedMode, intent, emotion, strategy, evidenceCount,
    privateChannel, trustState, consciousness, responsePlan, nyxDirective,
    supportMode, guidance, guardrails, source, diagnostics, pipelineTrace
  };
}

function inferState(domain, emotion, requestedMode, supportMode) {
  const d = safeStr(domain).toLowerCase();
  const m = safeStr(requestedMode).toLowerCase();
  const s = safeStr(supportMode).toLowerCase();
  if (d === "psychology") return "supportive";
  if (/crisis|acute|soothe|stabilize|ground/.test(s)) return "supportive";
  if (m === "recovery" || m === "clarity_building") return "clarifying";
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
    strategy: context.strategy,
    privateChannel: context.privateChannel,
    trustState: context.trustState,
    consciousness: context.consciousness,
    supportMode: context.supportMode,
    responsePlan: context.responsePlan,
    nyxDirective: context.nyxDirective,
    guidance: context.guidance,
    guardrails: context.guardrails,
    source: context.source,
    diagnostics: context.diagnostics,
    pipelineTrace: context.pipelineTrace
  };
}

function resolveReply(result, packet, context) {
  const emotionalCandidate = firstNonEmpty(
    result.reply,
    result.output,
    packet?.synthesis?.reply,
    packet?.synthesis?.answer,
    packet?.reply,
    packet?.answer,
    result.interpretation
  );
  const cleaned = sanitizeUserFacingReply(emotionalCandidate);
  if (cleaned && !/^done\.?$/i.test(cleaned)) return cleaned;
  return buildFallbackReply(context);
}

function buildResponseContract(result = {}, packet = {}) {
  const context = normalizeContext(result, packet);
  const state = inferState(context.domain, context.emotion, context.requestedMode, context.supportMode);
  const reply = resolveReply(result, packet, context);
  const ui = buildUi(context, state);
  const emotionalTurn = buildEmotionalTurn(context, state);
  const followUps = uniq(arr(result.followUps || packet?.synthesis?.followUps || [])).slice(0, 4);
  try {
    console.log("[MARION] conversationalResponseSystem route", {
      domain: context.domain,
      intent: context.intent,
      state,
      supportMode: context.supportMode,
      replyPreview: safeStr(reply).slice(0, 120),
      preservedEmotionalRoute: true
    });
  } catch (_e) {}
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
      strategyArchetype: safeStr(context.strategy?.archetype || ""),
      pipelineStage: safeStr(context.pipelineTrace?.stage || ""),
      preservedEmotionalRoute: true
    }
  };
}

module.exports = { VERSION, buildResponseContract, sanitizeUserFacingReply };
