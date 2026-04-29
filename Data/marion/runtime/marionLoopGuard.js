"use strict";

/**
 * marionLoopGuard.js
 * marionLoopGuard v1.1.0 DEEPENING-LOOP-STABILIZED
 * ------------------------------------------------------------
 * PURPOSE
 * - Detect true repetition, blocked fallback text, bridge echo contamination, and stuck recovery state.
 * - Preserve valid Marion final replies during multi-turn contextual/emotional deepening.
 * - Return recovery signals only; never generate a user-facing reply and never mutate durable memory.
 */

const VERSION = "marionLoopGuard v1.1.0 DEEPENING-LOOP-STABILIZED";

const DEFAULT_BLOCKED_PHRASES = Object.freeze([
  "i'm here with you",
  "i am here with you",
  "i blocked a repeated fallback from the bridge",
  "send a specific command",
  "press reset to clear this session",
  "i need one specific command to continue clearly",
  "nyx is live and tracking the turn",
  "give me the next clear target",
  "the final reply did not validate cleanly",
  "response path was interrupted before marion completed the final reply",
  "marion did not return",
  "final envelope missing",
  "diagnostic packet",
  "non-final"
]);

function safeStr(value) {
  return value == null ? "" : String(value).trim();
}

function safeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return safeStr(value)
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function similarity(a, b) {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ax = new Set(tokenize(x));
  const by = new Set(tokenize(y));
  if (!ax.size || !by.size) return 0;
  let overlap = 0;
  for (const word of ax) if (by.has(word)) overlap += 1;
  return overlap / Math.max(ax.size, by.size);
}

function containsBlockedPhrase(reply, blockedPhrases = DEFAULT_BLOCKED_PHRASES) {
  const r = normalizeText(reply);
  if (!r) return false;
  return safeArray(blockedPhrases).some((phrase) => {
    const p = normalizeText(phrase);
    return p && r.includes(p);
  });
}

function getState(packet = {}) {
  const p = safeObj(packet);
  return safeObj(p.state || p.sessionState || p.conversationState || p.previousMemory || {});
}

function getHistory(packet = {}) {
  const p = safeObj(packet);
  const state = getState(p);
  const history = p.history || state.history || state.turns || [];
  return Array.isArray(history) ? history : [];
}

function getLastAssistantReply(packet = {}) {
  const p = safeObj(packet);
  const state = getState(p);
  return safeStr(
    p.lastAssistantReply ||
    p.previousReply ||
    state.lastAssistantReply ||
    state.lastReply ||
    state.assistantReply ||
    safeObj(state.memoryPatch).lastAssistantReply ||
    ""
  );
}

function getLoopCount(packet = {}) {
  const p = safeObj(packet);
  const state = getState(p);
  const repetition = safeObj(state.repetition);
  const value = state.loopCount ?? p.loopCount ?? repetition.noProgressCount ?? 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function getStateStage(packet = {}) {
  const p = safeObj(packet);
  const state = getState(p);
  return safeStr(state.stateStage || state.stage || p.stateStage || "compose");
}

function isTrustedFinalPacket(packet = {}) {
  const p = safeObj(packet);
  const meta = safeObj(p.meta);
  const finalEnvelope = safeObj(p.finalEnvelope || safeObj(p.payload).finalEnvelope);
  const memoryPatch = safeObj(p.memoryPatch || safeObj(p.payload).memoryPatch);
  return !!(
    p.final === true ||
    p.marionFinal === true ||
    finalEnvelope.final === true ||
    finalEnvelope.marionFinal === true ||
    meta.freshMarionFinal === true ||
    meta.singleFinalAuthority === true ||
    memoryPatch.composedOnce === true ||
    safeObj(memoryPatch.stateBridge).shouldAdvanceState === true ||
    /MARION::FINAL::/i.test(safeStr(p.marionFinalSignature || p.finalSignature || meta.marionFinalSignature || meta.signature || finalEnvelope.marionFinalSignature))
  );
}

function detectBridgeEcho(packet = {}, reply = "") {
  const replyText = normalizeText(reply);
  if (!replyText) return false;
  // A packet coming from marionBridge is not automatically a bridge echo. Only
  // bridge diagnostic/recovery wording should be blocked.
  const bridgeMarkers = [
    "from the bridge",
    "bridge fallback",
    "specific command",
    "reset to clear",
    "blocked a repeated fallback",
    "response path was interrupted",
    "final reply did not validate cleanly"
  ];
  return bridgeMarkers.some((marker) => replyText.includes(marker));
}

function isDeepeningTurn(packet = {}) {
  const p = safeObj(packet);
  const text = normalizeText(p.text || p.userQuery || p.query || p.message || safeObj(p.input).text || "");
  const state = getState(p);
  const continuity = safeObj(state.emotionalContinuity || state.continuityThread || safeObj(state.memoryPatch).emotionalContinuity);
  return !!(
    /\b(given that|based on that|what happens if|what layer|continue|deeper|underneath|still|exhausting|mentally|that risk|that setup)\b/i.test(text) ||
    continuity.active === true ||
    continuity.threadContinuation === true ||
    Number(continuity.depthLevel || continuity.carryDepth || 0) > 1
  );
}

function evaluateLoop(packet = {}, candidateReply = "", options = {}) {
  const reply = safeStr(candidateReply);
  const lastReply = getLastAssistantReply(packet);
  const history = getHistory(packet);
  const loopCount = getLoopCount(packet);
  const stateStage = getStateStage(packet);
  const trustedFinal = options.trustedFinal === true || isTrustedFinalPacket(packet);
  const deepeningTurn = options.deepeningTurn === true || isDeepeningTurn(packet);

  const blockedPhrases = Array.isArray(options.blockedPhrases) ? options.blockedPhrases : DEFAULT_BLOCKED_PHRASES;

  const exactRepeat = !!reply && normalizeText(reply) === normalizeText(lastReply);
  const similarityToLastReply = similarity(reply, lastReply);
  const nearRepeatThreshold = deepeningTurn || trustedFinal ? 0.94 : 0.88;
  const nearRepeat = !!reply && !!lastReply && similarityToLastReply >= nearRepeatThreshold;
  const blockedPhrase = containsBlockedPhrase(reply, blockedPhrases);
  const bridgeEcho = detectBridgeEcho(packet, reply);

  const recentAssistantReplies = history
    .filter((item) => item && (item.role === "assistant" || item.role === "nyx" || item.role === "marion"))
    .map((item) => item.content || item.text || item.reply || item.message || "")
    .filter(Boolean)
    .slice(-5);

  const repeatedInHistory = !!reply && recentAssistantReplies.some((prev) => {
    const score = similarity(prev, reply);
    return normalizeText(prev) === normalizeText(reply) || score >= (deepeningTurn || trustedFinal ? 0.95 : 0.9);
  });

  const stuckState = !trustedFinal && (
    loopCount >= 3 ||
    (["fallback", "blocked", "unknown", "recover"].includes(normalizeText(stateStage)) && loopCount >= 2)
  );

  const loopDetected = !!(
    blockedPhrase ||
    bridgeEcho ||
    exactRepeat ||
    nearRepeat ||
    repeatedInHistory ||
    stuckState
  );

  const reasons = [];
  if (exactRepeat) reasons.push("exact_reply_repeat");
  if (nearRepeat) reasons.push("near_reply_repeat");
  if (blockedPhrase) reasons.push("blocked_phrase_detected");
  if (bridgeEcho) reasons.push("bridge_echo_detected");
  if (repeatedInHistory) reasons.push("history_repeat_detected");
  if (stuckState) reasons.push("stuck_state_detected");

  const allowReply = !loopDetected || (trustedFinal && !blockedPhrase && !bridgeEcho && !exactRepeat);
  const forceRecovery = !allowReply;
  const nextStateStage = forceRecovery ? "recover" : (trustedFinal ? "final" : (normalizeText(stateStage) || "compose"));

  return {
    ok: true,
    loopDetected,
    allowReply,
    forceRecovery,
    nextStateStage,
    reasons,
    loopGuardVersion: VERSION,
    diagnostics: {
      loopCount,
      stateStage,
      trustedFinal,
      deepeningTurn,
      exactRepeat,
      nearRepeat,
      blockedPhrase,
      bridgeEcho,
      repeatedInHistory,
      stuckState,
      similarityToLastReply
    }
  };
}

function applyLoopGuard(packet = {}, candidateReply = "", options = {}) {
  const result = evaluateLoop(packet, candidateReply, options);
  return {
    ...result,
    packetPatch: {
      stateStage: result.nextStateStage,
      loopCount: result.forceRecovery ? getLoopCount(packet) + 1 : 0,
      recoveryRequired: result.forceRecovery,
      lastLoopReasons: result.reasons,
      loopGuardVersion: VERSION
    }
  };
}

module.exports = {
  VERSION,
  DEFAULT_BLOCKED_PHRASES,
  normalizeText,
  similarity,
  containsBlockedPhrase,
  evaluateLoop,
  applyLoopGuard,
  isTrustedFinalPacket,
  isDeepeningTurn,
  detectBridgeEcho
};
