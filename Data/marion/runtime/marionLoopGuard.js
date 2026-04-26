"use strict";

/**
 * marionLoopGuard.js
 * Detects Marion repetition, fallback loops, bridge echo, and stuck state.
 *
 * Purpose:
 * - Detect loops.
 * - Return a recovery signal.
 * - Never generate the final user-facing reply directly.
 * - Never mutate memory.
 */

const VERSION = "marionLoopGuard v1.0.0 LOOP-RECOVERY-SIGNAL";

const DEFAULT_BLOCKED_PHRASES = Object.freeze([
  "i'm here with you",
  "i am here with you",
  "i blocked a repeated fallback from the bridge",
  "send a specific command",
  "press reset to clear this session",
  "i need one specific command to continue clearly"
]);

function safeStr(value) {
  return value == null ? "" : String(value).trim();
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

function similarity(a, b) {
  const x = normalizeText(a);
  const y = normalizeText(b);

  if (!x || !y) return 0;
  if (x === y) return 1;

  const ax = new Set(x.split(/\s+/).filter(Boolean));
  const by = new Set(y.split(/\s+/).filter(Boolean));

  if (!ax.size || !by.size) return 0;

  let overlap = 0;
  for (const word of ax) {
    if (by.has(word)) overlap += 1;
  }

  return overlap / Math.max(ax.size, by.size);
}

function containsBlockedPhrase(reply, blockedPhrases = DEFAULT_BLOCKED_PHRASES) {
  const r = normalizeText(reply);

  if (!r) return false;

  return blockedPhrases.some(phrase => {
    const p = normalizeText(phrase);
    return p && r.includes(p);
  });
}

function getHistory(packet = {}) {
  const state = packet.state || packet.sessionState || {};
  const history = packet.history || state.history || [];

  if (Array.isArray(history)) return history;

  return [];
}

function getLastAssistantReply(packet = {}) {
  const state = packet.state || packet.sessionState || {};

  return safeStr(
    packet.lastAssistantReply ||
    state.lastAssistantReply ||
    packet.previousReply ||
    ""
  );
}

function getLoopCount(packet = {}) {
  const state = packet.state || packet.sessionState || {};
  const value = state.loopCount ?? packet.loopCount ?? 0;
  const n = Number(value);

  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function getStateStage(packet = {}) {
  const state = packet.state || packet.sessionState || {};
  return safeStr(state.stateStage || packet.stateStage || "unknown");
}

function detectBridgeEcho(packet = {}, reply = "") {
  const source = safeStr(packet.source || packet.meta?.source || "");
  const replyText = normalizeText(reply);

  if (!replyText) return false;

  const bridgeMarkers = [
    "from the bridge",
    "bridge fallback",
    "specific command",
    "reset to clear"
  ];

  return (
    source.toLowerCase().includes("bridge") ||
    bridgeMarkers.some(marker => replyText.includes(marker))
  );
}

function evaluateLoop(packet = {}, candidateReply = "", options = {}) {
  const reply = safeStr(candidateReply);
  const lastReply = getLastAssistantReply(packet);
  const history = getHistory(packet);
  const loopCount = getLoopCount(packet);
  const stateStage = getStateStage(packet);

  const blockedPhrases = Array.isArray(options.blockedPhrases)
    ? options.blockedPhrases
    : DEFAULT_BLOCKED_PHRASES;

  const exactRepeat = !!reply && normalizeText(reply) === normalizeText(lastReply);
  const nearRepeat = !!reply && similarity(reply, lastReply) >= 0.86;
  const blockedPhrase = containsBlockedPhrase(reply, blockedPhrases);
  const bridgeEcho = detectBridgeEcho(packet, reply);

  const recentAssistantReplies = history
    .filter(item => item && item.role === "assistant")
    .map(item => item.content || item.text || item.reply || "")
    .filter(Boolean)
    .slice(-5);

  const repeatedInHistory = recentAssistantReplies.some(prev => {
    return normalizeText(prev) === normalizeText(reply) || similarity(prev, reply) >= 0.9;
  });

  const stuckState =
    loopCount >= 2 ||
    (
      stateStage &&
      ["fallback", "blocked", "unknown", "recover"].includes(stateStage.toLowerCase()) &&
      loopCount >= 1
    );

  const loopDetected =
    exactRepeat ||
    nearRepeat ||
    blockedPhrase ||
    bridgeEcho ||
    repeatedInHistory ||
    stuckState;

  const reasons = [];

  if (exactRepeat) reasons.push("exact_reply_repeat");
  if (nearRepeat) reasons.push("near_reply_repeat");
  if (blockedPhrase) reasons.push("blocked_phrase_detected");
  if (bridgeEcho) reasons.push("bridge_echo_detected");
  if (repeatedInHistory) reasons.push("history_repeat_detected");
  if (stuckState) reasons.push("stuck_state_detected");

  return {
    ok: true,
    loopDetected,
    allowReply: !loopDetected,
    forceRecovery: loopDetected,
    nextStateStage: loopDetected ? "recover" : stateStage || "compose",
    reasons,
    loopGuardVersion: VERSION,
    diagnostics: {
      loopCount,
      stateStage,
      exactRepeat,
      nearRepeat,
      blockedPhrase,
      bridgeEcho,
      repeatedInHistory,
      stuckState,
      similarityToLastReply: similarity(reply, lastReply)
    }
  };
}

function applyLoopGuard(packet = {}, candidateReply = "", options = {}) {
  const result = evaluateLoop(packet, candidateReply, options);

  return {
    ...result,
    packetPatch: {
      stateStage: result.nextStateStage,
      loopCount: result.loopDetected ? getLoopCount(packet) + 1 : 0,
      recoveryRequired: result.forceRecovery,
      lastLoopReasons: result.reasons
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
  applyLoopGuard
};
