// runtime/layer5/ContinuityStateBuilder.js

function buildContinuityState({
  userQuery = '',
  fusionPacket = {},
  assembledResponse = {},
  previousMemory = {}
} = {}) {
  const emotion = fusionPacket.emotion || {};
  const psychology = fusionPacket.psychology || {};
  const domain = fusionPacket.domain || previousMemory.domain || 'general';
  const intent = fusionPacket.intent || previousMemory.intent || 'general';

  return {
    activeQuery: userQuery,
    activeDomain: domain,
    activeIntent: intent,
    activeEmotion: emotion.primaryEmotion || previousMemory.activeEmotion || 'neutral',
    emotionalIntensity: Number.isFinite(emotion.intensity) ? emotion.intensity : 0,
    psychologyRisks: psychology.risks || [],
    responseMode: assembledResponse.responseMode?.mode || 'balanced',
    timestamp: Date.now()
  };
}

module.exports = {
  buildContinuityState
};
