"use strict";

const VERSION = "conversationalResponseSystem v2.6.0 MARION-AUTHORITY-LOCK + FAST-PATH-GREETING-COMMAND-HARDENED-CONTINUITY-LOOP-GUARD";
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
  /no valid response generated/i,
  /fallback only/i,
  /timeout/i,
  /diagnostic/i,
  /trace id/i
];

const GREETING_ONLY_RE = /^(?:hi|hello|hey|yo|sup|good\s+(?:morning|afternoon|evening)|howdy|hiya|greetings)(?:[\s,!?.]|$)+/i;
const THANKS_ONLY_RE = /^(?:thanks|thank you|thx|ty)(?:\s+(?:nyx|nix|vera))?(?:[\s,!?.]|$)+$/i;
const SHORT_ACK_RE = /^(?:ok(?:ay)?|cool|nice|great|perfect|sounds good|all right|alright)(?:[\s,!?.]|$)+$/i;
const ACTION_LEAD_RE = /^(?:please\s+)?(?:help|show|tell|give|make|write|build|open|fix|update|check|find|explain|break\s+down|walk\s+me\s+through|summarize)\b/i;

function isInternalBlockerText(value) {
  const text = safeStr(value).trim();
  if (!text) return false;
  return INTERNAL_BLOCKER_PATTERNS.some((rx) => rx.test(text));
}

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
    crisis: !!src.crisis,
    highDistress: !!src.highDistress,
    needsContainment: !!src.needsContainment,
    needsGrounding: !!src.needsGrounding,
    needsStabilization: !!src.needsStabilization,
    needsClarification: !!src.needsClarification,
    needsConnection: !!src.needsConnection,
    guardedness: !!src.guardedness,
    suppressed: !!src.suppressed,
    forcedPositivity: !!src.forcedPositivity,
    minimization: !!src.minimization,
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

function extractAuthoritativeReply(result, packet) {
  const resultMeta = isObj(result?.meta) ? result.meta : {};
  const packetMeta = isObj(packet?.meta) ? packet.meta : {};
  const packetPayload = isObj(packet?.payload) ? packet.payload : {};
  return sanitizeUserFacingReply(firstNonEmpty(
    resultMeta.overrideReply,
    resultMeta.authoritativeReply,
    resultMeta.reply,
    resultMeta.response,
    result?.authoritativeReply,
    result?.authoritative_reply,
    result?.reply,
    result?.output,
    result?.spokenText,
    result?.answer,
    result?.finalAnswer,
    result?.response,
    result?.text,
    result?.payload?.response,
    result?.payload?.reply,
    result?.payload?.text,
    result?.payload?.message,
    packetMeta.overrideReply,
    packetMeta.authoritativeReply,
    packetPayload.reply,
    packetPayload.text,
    packetPayload.message,
    packet?.synthesis?.reply,
    packet?.synthesis?.answer,
    packet?.synthesis?.spokenText,
    packet?.synthesis?.finalAnswer,
    packet?.synthesis?.response,
    packet?.reply,
    packet?.answer,
    packet?.output,
    packet?.spokenText,
    packet?.finalAnswer,
    packet?.response,
    result?.interpretation
  ));
}

function shouldBlockFallback(result, packet, context) {
  const resultMeta = isObj(result?.meta) ? result.meta : {};
  const packetMeta = isObj(packet?.meta) ? packet.meta : {};
  if (resultMeta.marionAuthorityLock === true || packetMeta.marionAuthorityLock === true) return true;
  if (resultMeta.singleSourceOfTruth === true || packetMeta.singleSourceOfTruth === true) return true;
  if (resultMeta.allowReplySynthesis === false || packet?.synthesis?.nyxDirective?.allowReplySynthesis === false) return true;
  if (context && context.strategy && /ground|clarify|channel|celebrate|witness|boundary/.test(safeStr(context.strategy.archetype))) return true;
  return false;
}

function sanitizeUserFacingReply(reply) {
  let out = safeStr(reply).trim();
  if (!out) return "";
  if (isInternalBlockerText(out)) return "";
  if (/^[\[{]/.test(out) && /(?:"ok"|"error"|"route"|"meta"|"trace")/i.test(out)) return "";
  for (const rx of [
    /\b(shell is active|guiding properly)\b/ig,
    /\broute[_ ]?guard\b/ig,
    /\bturn lifecycle\b/ig,
    /\btelemetry\b/ig,
    /\bruntime(?:-|\s)?trace\b/ig,
    /\binternal(?:-|\s)?pipeline\b/ig,
    /\bops(?:-|\s)?diagnostic(?:s)?\b/ig,
    /\bcontract validation\b/ig
  ]) out = out.replace(rx, "");
  out = out
    .replace(/\bundefined\b/ig, "")
    .replace(/\bnull\b/ig, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  return out;
}

function normalizeUserInput(result, packet) {
  const raw = firstNonEmpty(
    result?.userInput,
    result?.input,
    result?.query,
    result?.message,
    result?.prompt,
    packet?.userInput,
    packet?.input,
    packet?.query,
    packet?.message,
    packet?.prompt,
    packet?.routing?.userInput,
    packet?.routing?.input,
    packet?.routing?.query,
    packet?.turn?.userText,
    packet?.turn?.text
  );
  const text = safeStr(raw).replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const tokenCount = text ? text.split(/\s+/).length : 0;
  const greetingOnly = !!text && GREETING_ONLY_RE.test(text) && tokenCount <= 6 && !ACTION_LEAD_RE.test(text);
  const thanksOnly = !!text && THANKS_ONLY_RE.test(text);
  const ackOnly = !!text && SHORT_ACK_RE.test(text);
  const actionLead = !!text && ACTION_LEAD_RE.test(text);
  return { raw, text, lower, tokenCount, greetingOnly, thanksOnly, ackOnly, actionLead };
}


function normalizeContinuityState(result, packet) {
  const continuity = isObj(packet?.continuityState) ? packet.continuityState : (isObj(result?.continuityState) ? result.continuityState : {});
  const turnMemory = isObj(packet?.turnMemory) ? packet.turnMemory : (isObj(result?.turnMemory) ? result.turnMemory : {});
  return {
    depthLevel: Math.max(1, clamp(continuity.depthLevel || turnMemory.depthLevel || 1, 1, 6, 1)),
    threadContinuation: !!(continuity.threadContinuation || turnMemory.threadContinuation),
    continuityMode: firstNonEmpty(continuity.continuityMode, turnMemory.continuityMode, "stabilize").toLowerCase(),
    unresolvedSignals: uniq(arr(continuity.unresolvedSignals || turnMemory.unresolvedSignals || [])),
    lastTopics: uniq(arr(continuity.lastTopics || turnMemory.lastTopics || []))
  };
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
  const userInput = normalizeUserInput(result, packet);
  const continuity = normalizeContinuityState(result, packet);
  const marionAuthorityLock = !!(result?.meta?.marionAuthorityLock || packet?.meta?.marionAuthorityLock || packet?.synthesis?.nyxDirective?.singleSourceOfTruth);
  const authoritativeReply = extractAuthoritativeReply(result, packet);
  return {
    domain, requestedMode, intent, emotion, strategy, evidenceCount,
    privateChannel, trustState, consciousness, responsePlan, nyxDirective,
    supportMode, guidance, guardrails, source, diagnostics, pipelineTrace,
    userInput, continuity, marionAuthorityLock, authoritativeReply
  };
}

function inferState(domain, emotion, requestedMode, supportMode, userInput) {
  const d = safeStr(domain).toLowerCase();
  const m = safeStr(requestedMode).toLowerCase();
  const s = safeStr(supportMode).toLowerCase();
  if (userInput?.greetingOnly || userInput?.thanksOnly || userInput?.ackOnly) return "focused";
  if (d === "psychology") return "supportive";
  if (/crisis|acute|soothe|stabilize|ground/.test(s)) return "supportive";
  if (emotion.supportFlags.crisis) return "supportive";
  if (m === "recovery" || m === "clarity_building") return "clarifying";
  if (emotion.supportFlags.highDistress || emotion.supportFlags.needsContainment || emotion.supportFlags.needsStabilization) return "supportive";
  if (["sad","sadness","anxious","anxiety","overwhelmed","depressed","fear","grief","loneliness","panic"].includes(emotion.primaryEmotion)) return "supportive";
  return "focused";
}

function buildGreetingReply(context) {
  if (context.userInput.thanksOnly) return "You’re welcome. I’m here. What do you want to tackle next?";
  if (context.userInput.ackOnly) return "All right. Give me the next move when you’re ready.";
  return "Hey. I’m here with you. What do you want to do?";
}

function buildActionFallback(context) {
  if (context.domain === "finance") return "Tell me the number, goal, or decision you want broken down, and I’ll tighten it up with you.";
  if (context.domain === "law") return "Tell me the issue, document, or rule you want checked, and I’ll break down what matters most.";
  if (context.domain === "psychology") return "Tell me what’s happening, and we’ll take the next step together without overcomplicating it.";
  return "Tell me exactly what you want handled, and I’ll help you move it forward.";
}

function countRecentReplyRepeats(context, target) {
  const continuity = isObj(context?.continuity) ? context.continuity : {};
  const unresolved = arr(continuity.unresolvedSignals).map((item) => safeStr(item).toLowerCase());
  const reply = safeStr(target).toLowerCase();
  return unresolved.filter((item) => item === reply).length;
}

function buildLoopGuardReply(context) {
  if (context.userInput.greetingOnly) return buildGreetingReply(context);
  if (context.userInput.actionLead) return buildActionFallback(context);
  if (context.continuity.lastTopics.length) {
    return `Stay with ${context.continuity.lastTopics.slice(0, 3).join(", ")}, and tell me the exact part you want handled next.`;
  }
  return "Tell me the exact point you want handled, and I’ll answer that directly.";
}

function buildFallbackReply(context) {
  if (context.userInput.greetingOnly || context.userInput.thanksOnly || context.userInput.ackOnly) {
    return buildGreetingReply(context);
  }
  if (context.userInput.actionLead) {
    return buildActionFallback(context);
  }
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
  const replace = !!(context.userInput.greetingOnly || context.userInput.thanksOnly || context.userInput.ackOnly);
  return {
    chips: [],
    allowMic: true,
    mode: state,
    state,
    emotionalState: state,
    promptPlacement: "attached",
    replace,
    clearStale: replace,
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
    pipelineTrace: context.pipelineTrace,
    userInput: {
      text: context.userInput.text,
      tokenCount: context.userInput.tokenCount,
      greetingOnly: context.userInput.greetingOnly,
      thanksOnly: context.userInput.thanksOnly,
      ackOnly: context.userInput.ackOnly,
      actionLead: context.userInput.actionLead
    },
    continuity: context.continuity
  };
}

function resolveReply(result, packet, context) {
  const authoritativeReply = sanitizeUserFacingReply(context?.authoritativeReply || "");
  if (authoritativeReply && !/^done\.?$/i.test(authoritativeReply) && !isInternalBlockerText(authoritativeReply)) {
    return authoritativeReply;
  }

  const emotionalCandidate = firstNonEmpty(
    result?.reply,
    result?.output,
    result?.spokenText,
    result?.answer,
    result?.finalAnswer,
    result?.authoritativeReply,
    result?.authoritative_reply,
    result?.response,
    result?.text,
    result?.payload?.response,
    result?.payload?.reply,
    result?.payload?.text,
    result?.payload?.message,
    packet?.synthesis?.reply,
    packet?.synthesis?.answer,
    packet?.synthesis?.spokenText,
    packet?.synthesis?.finalAnswer,
    packet?.synthesis?.response,
    packet?.reply,
    packet?.answer,
    packet?.output,
    packet?.spokenText,
    packet?.finalAnswer,
    packet?.response,
    result?.interpretation
  );
  const cleaned = sanitizeUserFacingReply(emotionalCandidate);
  if (cleaned && !/^done\.?$/i.test(cleaned) && !isInternalBlockerText(cleaned)) return cleaned;
  if (context?.marionAuthorityLock || shouldBlockFallback(result, packet, context)) {
    return buildLoopGuardReply(context);
  }
  const fallback = buildFallbackReply(context);
  if (countRecentReplyRepeats(context, fallback) > 0) {
    return buildLoopGuardReply(context);
  }
  return fallback;
}

function resolveFollowUps(result, packet, reply, context) {
  if (context.userInput.greetingOnly || context.userInput.thanksOnly || context.userInput.ackOnly) return [];
  return uniq(
    arr(result?.followUps || packet?.synthesis?.followUps || packet?.followUps || [])
      .map((item) => sanitizeUserFacingReply(item))
      .filter(Boolean)
      .filter((item) => !isInternalBlockerText(item))
      .filter((item) => item.toLowerCase() !== reply.toLowerCase())
  ).slice(0, 4);
}

function buildResponseContract(result = {}, packet = {}) {
  const startedAt = Date.now();
  const context = normalizeContext(result, packet);
  const state = inferState(context.domain, context.emotion, context.requestedMode, context.supportMode, context.userInput);
  const reply = resolveReply(result, packet, context);
  const ui = buildUi(context, state);
  const emotionalTurn = buildEmotionalTurn(context, state);
  const followUps = resolveFollowUps(result, packet, reply, context);
  const latencyMs = Date.now() - startedAt;
  const fastPath = !!(context.userInput.greetingOnly || context.userInput.thanksOnly || context.userInput.ackOnly);
  try {
    console.log("[MARION] conversationalResponseSystem route", {
      domain: context.domain,
      intent: context.intent,
      state,
      supportMode: context.supportMode,
      fastPath,
      latencyMs,
      replyPreview: safeStr(reply).slice(0, 120),
      preservedEmotionalRoute: true
    });
  } catch (_e) {}
  return {
    ok: true,
    reply,
    output: reply,
    spokenText: reply,
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
      preservedEmotionalRoute: true,
      fastPath,
      latencyMs,
      continuityDepth: context.continuity.depthLevel,
      threadContinuation: !!context.continuity.threadContinuation,
      marionAuthorityLock: !!context.marionAuthorityLock,
      replyAuthority: context.marionAuthorityLock && context.authoritativeReply ? "marion_locked" : (reply === buildLoopGuardReply(context) ? "loop_guard" : "resolved")
    },
    continuityState: context.continuity
  };
}

module.exports = { VERSION, buildResponseContract, sanitizeUserFacingReply };
