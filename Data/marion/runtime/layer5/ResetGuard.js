"use strict";

/**
 * ResetGuard.js
 *
 * Prevents destructive conversation resets when continuity evidence remains
 * active. It does not generate replies or own final authority.
 */

const VERSION =
  "marion.resetGuard/2.1-conflict-resolved-continuity-safe";

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function buildResetGuard({
  continuityState = {},
  emotionalContinuity = {},
  domainContinuity = {},
  topicThread = {},
  extractedSignals = {},
  previousMemory = {},
  assembledResponse = {}
} = {}) {
  const continuity = safeObject(continuityState);
  const emotional = safeObject(emotionalContinuity);
  const domain = safeObject(domainContinuity);
  const topic = safeObject(topicThread);
  const signals = safeObject(extractedSignals);
  const previous = safeObject(previousMemory);
  const response = safeObject(assembledResponse);

  const flags = [];
  let shouldSuppressHardReset = false;

  const previousFingerprint =
    safeObject(previous.persistent).queryFingerprint ||
    safeObject(previous.extractedSignals).queryFingerprint ||
    "";

  const currentFingerprint =
    signals.queryFingerprint ||
    continuity.queryFingerprint ||
    "";

  const fallbackApplied = Boolean(
    response.partial ||
    response.fallbackApplied ||
    continuity.fallbackApplied
  );

  const previousFallbackStreak =
    Number(previous.fallbackStreak || 0) || 0;

  const previousRepeatStreak =
    Number(previous.repeatQueryStreak || 0) || 0;

  const repeatedQuery =
    Boolean(previousFingerprint) &&
    Boolean(currentFingerprint) &&
    currentFingerprint === previousFingerprint;

  const repeatQueryStreak =
    repeatedQuery
      ? previousRepeatStreak + 1
      : 0;

  const fallbackStreak =
    fallbackApplied
      ? previousFallbackStreak + 1
      : 0;

  if (topic.continued) {
    flags.push("topic-continuity");
    shouldSuppressHardReset = true;
  }

  if (topic.exactRepeat) {
    flags.push("repeat-query");
  }

  if (
    emotional.maintained ||
    emotional.escalation ||
    emotional.blendShifted
  ) {
    flags.push("emotional-continuity");
    shouldSuppressHardReset = true;
  }

  if (domain.maintained) {
    flags.push("domain-continuity");
    shouldSuppressHardReset = true;
  }

  if (
    Array.isArray(signals.suppressionSignals) &&
    signals.suppressionSignals.length
  ) {
    flags.push("guarded-signal");
  }

  if (fallbackApplied) {
    flags.push("fallback-active");
  }

  if (fallbackStreak >= 2) {
    flags.push("fallback-streak");
  }

  if (repeatQueryStreak >= 2) {
    flags.push("repeat-risk");
  }

  const shouldForceRecoveryMode = Boolean(
    fallbackStreak >= 2 ||
    repeatQueryStreak >= 2 ||
    (topic.exactRepeat && fallbackApplied) ||
    emotional.escalation
  );

  const shouldAllowNormalReset = Boolean(
    !shouldSuppressHardReset &&
    !topic.continued &&
    !domain.maintained &&
    !emotional.maintained &&
    !emotional.escalation
  );

  return {
    shouldSuppressHardReset,
    shouldForceRecoveryMode,
    shouldAllowNormalReset,
    repeatedQuery,
    repeatQueryStreak,
    fallbackStreak,
    flags: unique(flags),
    continuityState: continuity
  };
}

module.exports = {
  VERSION,
  buildResetGuard
};
