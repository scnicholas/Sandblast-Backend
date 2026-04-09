"use strict";

function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }

function assembleTurnMemory({
  continuityState = {},
  extractedSignals = {},
  persistence = {},
  emotionalContinuity = {},
  domainContinuity = {},
  topicThread = {},
  resetGuard = {},
  previousMemory = {}
} = {}) {
  const continuityHealth = resetGuard.shouldForceRecoveryMode
    ? "fragile"
    : continuityState.continuityHealth || "watch";

  const recoveryMode = resetGuard.shouldForceRecoveryMode
    ? "guided-recovery"
    : (extractedSignals.recoveryMode || "normal");

  const fallbackApplied = Boolean(continuityState.fallbackApplied || extractedSignals.fallbackApplied);
  const lastStableMode = !fallbackApplied
    ? (continuityState.responseMode || previousMemory.lastStableMode || "balanced")
    : (previousMemory.lastStableMode || continuityState.responseMode || "balanced");

  return {
    lastQuery: continuityState.activeQuery || "",
    normalizedQuery: continuityState.normalizedQuery || "",
    queryFingerprint: continuityState.queryFingerprint || "",
    domain: continuityState.activeDomain || "general",
    intent: continuityState.activeIntent || "general",
    emotion: {
      primaryEmotion: continuityState.activeEmotion || "neutral",
      intensity: continuityState.emotionalIntensity || 0,
      blendProfile: _safeObj(continuityState.blendProfile),
      stateDrift: _safeObj(continuityState.stateDrift),
      suppressionSignals: Array.isArray(continuityState.suppressionSignals) ? continuityState.suppressionSignals : []
    },
    persistent: persistence.persistent || {},
    transient: persistence.transient || {},
    emotionalContinuity,
    domainContinuity,
    topicThread,
    resetGuard,
    extractedSignals,
    fallbackApplied,
    fallbackStreak: Number(resetGuard.fallbackStreak || 0),
    repeatQueryStreak: Number(resetGuard.repeatQueryStreak || 0),
    stableDomainStreak: Number(domainContinuity.stableDomainStreak || 0),
    continuityHealth,
    recoveryMode,
    lastStableMode,
    updatedAt: Date.now()
  };
}

module.exports = {
  assembleTurnMemory
};
