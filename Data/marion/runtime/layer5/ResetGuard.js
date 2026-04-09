"use strict";

function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }

function buildResetGuard({
  continuityState = {},
  emotionalContinuity = {},
  domainContinuity = {},
  topicThread = {},
  extractedSignals = {},
  previousMemory = {},
  assembledResponse = {}
} = {}) {
  const flags = [];
  let shouldSuppressHardReset = false;

  const prev = _safeObj(previousMemory);
  const previousFingerprint =
    _safeObj(prev.persistent).queryFingerprint ||
    _safeObj(prev.extractedSignals).queryFingerprint ||
    "";

  const currentFingerprint = extractedSignals.queryFingerprint || continuityState.queryFingerprint || "";
  const fallbackApplied = Boolean(assembledResponse.partial || assembledResponse.fallbackApplied || continuityState.fallbackApplied);
  const previousFallbackStreak = Number(prev.fallbackStreak || 0) || 0;
  const previousRepeatStreak = Number(prev.repeatQueryStreak || 0) || 0;

  const repeatedQuery = Boolean(previousFingerprint) && currentFingerprint === previousFingerprint;
  const repeatQueryStreak = repeatedQuery ? previousRepeatStreak + 1 : 0;
  const fallbackStreak = fallbackApplied ? previousFallbackStreak + 1 : 0;

  if (topicThread.continued) {
    flags.push("topic-continuity");
    shouldSuppressHardReset = true;
  }
  if (topicThread.exactRepeat) flags.push("repeat-query");
  if (emotionalContinuity.maintained || emotionalContinuity.escalation || emotionalContinuity.blendShifted) {
    flags.push("emotional-continuity");
    shouldSuppressHardReset = true;
  }
  if (domainContinuity.maintained) {
    flags.push("domain-continuity");
    shouldSuppressHardReset = true;
  }
  if ((extractedSignals.suppressionSignals || []).length) flags.push("guarded-signal");
  if (fallbackApplied) flags.push("fallback-active");
  if (fallbackStreak >= 2) flags.push("fallback-streak");
  if (repeatQueryStreak >= 2) flags.push("repeat-risk");

  const shouldForceRecoveryMode =
    fallbackStreak >= 2 ||
    repeatQueryStreak >= 2 ||
    (topicThread.exactRepeat && fallbackApplied) ||
    !!emotionalContinuity.escalation;

  const shouldAllowNormalReset =
    !shouldSuppressHardReset &&
    !topicThread.continued &&
    !domainContinuity.maintained &&
    !emotionalContinuity.maintained &&
    !emotionalContinuity.escalation;

  return {
    shouldSuppressHardReset,
    shouldForceRecoveryMode,
    shouldAllowNormalReset,
    repeatedQuery,
    repeatQueryStreak,
    fallbackStreak,
    flags,
    continuityState
  };
}

module.exports = {
  buildResetGuard
};
