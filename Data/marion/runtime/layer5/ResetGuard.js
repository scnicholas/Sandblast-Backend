<<<<<<< HEAD
"use strict";

function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }

=======
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)
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

<<<<<<< HEAD
  const prev = _safeObj(previousMemory);
  const previousFingerprint =
    _safeObj(prev.persistent).queryFingerprint ||
    _safeObj(prev.extractedSignals).queryFingerprint ||
    "";

  const currentFingerprint = extractedSignals.queryFingerprint || continuityState.queryFingerprint || "";
  const fallbackApplied = Boolean(assembledResponse.partial || assembledResponse.fallbackApplied || continuityState.fallbackApplied);
  const previousFallbackStreak = Number(prev.fallbackStreak || 0) || 0;
  const previousRepeatStreak = Number(prev.repeatQueryStreak || 0) || 0;
=======
  const previousFingerprint =
    previousMemory?.persistent?.queryFingerprint ||
    previousMemory?.extractedSignals?.queryFingerprint ||
    '';

  const currentFingerprint = extractedSignals.queryFingerprint || continuityState.queryFingerprint || '';
  const fallbackApplied = Boolean(assembledResponse.partial || assembledResponse.fallbackApplied);
  const previousFallbackStreak = Number(previousMemory.fallbackStreak || 0) || 0;
  const previousRepeatStreak = Number(previousMemory.repeatQueryStreak || 0) || 0;
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)

  const repeatedQuery = Boolean(previousFingerprint) && currentFingerprint === previousFingerprint;
  const repeatQueryStreak = repeatedQuery ? previousRepeatStreak + 1 : 0;
  const fallbackStreak = fallbackApplied ? previousFallbackStreak + 1 : 0;

  if (topicThread.continued) {
<<<<<<< HEAD
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
=======
    flags.push('topic-continuity');
    shouldSuppressHardReset = true;
  }

  if (topicThread.exactRepeat) {
    flags.push('repeat-query');
  }

  if (emotionalContinuity.maintained || emotionalContinuity.escalation) {
    flags.push('emotional-continuity');
    shouldSuppressHardReset = true;
  }

  if (domainContinuity.maintained) {
    flags.push('domain-continuity');
    shouldSuppressHardReset = true;
  }

  if (fallbackApplied) {
    flags.push('fallback-active');
  }

  if (fallbackStreak >= 2) {
    flags.push('fallback-streak');
  }

  if (repeatQueryStreak >= 2) {
    flags.push('repeat-risk');
  }
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)

  const shouldForceRecoveryMode =
    fallbackStreak >= 2 ||
    repeatQueryStreak >= 2 ||
<<<<<<< HEAD
    (topicThread.exactRepeat && fallbackApplied) ||
    !!emotionalContinuity.escalation;

  const shouldAllowNormalReset =
    !shouldSuppressHardReset &&
    !topicThread.continued &&
    !domainContinuity.maintained &&
    !emotionalContinuity.maintained &&
    !emotionalContinuity.escalation;
=======
    (topicThread.exactRepeat && fallbackApplied);

  const shouldAllowNormalReset = !shouldSuppressHardReset && !topicThread.continued && !domainContinuity.maintained;
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)

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
<<<<<<< HEAD
};
=======
};
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)
