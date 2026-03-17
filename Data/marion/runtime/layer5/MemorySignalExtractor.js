// runtime/layer5/MemorySignalExtractor.js

function uniq(arr = []) {
  return [...new Set(arr.filter(Boolean))];
}

function extractMemorySignals({
  userQuery = '',
  fusionPacket = {},
  assembledResponse = {}
} = {}) {
  const emotion = fusionPacket.emotion || {};
  const psychology = fusionPacket.psychology || {};
  const evidence = fusionPacket.evidence || [];

  const signals = {
    query: userQuery,
    domain: fusionPacket.domain || 'general',
    intent: fusionPacket.intent || 'general',
    primaryEmotion: emotion.primaryEmotion || 'neutral',
    emotionalNeeds: emotion.needs || [],
    psychologyPatterns: psychology.patterns || [],
    psychologyNeeds: psychology.needs || [],
    evidenceTitles: uniq(evidence.slice(0, 5).map(x => x.title)),
    responseMode: assembledResponse.responseMode?.mode || 'balanced'
  };

  return signals;
}

module.exports = {
  extractMemorySignals
};
