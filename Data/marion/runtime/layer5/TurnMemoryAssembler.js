// runtime/layer5/TurnMemoryAssembler.js

function assembleTurnMemory({
  continuityState = {},
  extractedSignals = {},
  persistence = {},
  emotionalContinuity = {},
  domainContinuity = {},
  topicThread = {},
  resetGuard = {}
} = {}) {
  return {
    lastQuery: continuityState.activeQuery || '',
    domain: continuityState.activeDomain || 'general',
    intent: continuityState.activeIntent || 'general',
    emotion: {
      primaryEmotion: continuityState.activeEmotion || 'neutral',
      intensity: continuityState.emotionalIntensity || 0
    },
    persistent: persistence.persistent || {},
    transient: persistence.transient || {},
    emotionalContinuity,
    domainContinuity,
    topicThread,
    resetGuard,
    extractedSignals,
    updatedAt: Date.now()
  };
}

module.exports = {
  assembleTurnMemory
};
