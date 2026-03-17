// runtime/layer5/ResetGuard.js

function buildResetGuard({
  continuityState = {},
  emotionalContinuity = {},
  domainContinuity = {},
  topicThread = {}
} = {}) {
  const flags = [];
  let shouldSuppressHardReset = false;

  if (topicThread.continued) {
    flags.push('topic-continuity');
    shouldSuppressHardReset = true;
  }

  if (emotionalContinuity.maintained || emotionalContinuity.escalation) {
    flags.push('emotional-continuity');
    shouldSuppressHardReset = true;
  }

  if (domainContinuity.maintained) {
    flags.push('domain-continuity');
    shouldSuppressHardReset = true;
  }

  return {
    shouldSuppressHardReset,
    flags,
    continuityState
  };
}

module.exports = {
  buildResetGuard
};
