function uniq(arr = []) {
  return [...new Set(arr.filter(Boolean))];
}

function normalizeText(text = '') {
  return String(text).toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function fingerprint(text = '') {
  const input = normalizeText(text);
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

function extractMemorySignals({
  userQuery = '',
  fusionPacket = {},
  assembledResponse = {}
} = {}) {
  const emotion = fusionPacket.emotion || {};
  const psychology = fusionPacket.psychology || {};
  const evidence = Array.isArray(fusionPacket.evidence) ? fusionPacket.evidence : [];
  const risks = Array.isArray(psychology.risks) ? psychology.risks : [];
  const normalizedQuery = normalizeText(userQuery);
  const queryTokens = uniq(normalizedQuery.split(' ').filter(token => token.length > 2)).slice(0, 12);

  return {
    query: userQuery,
    normalizedQuery,
    queryFingerprint: fingerprint(userQuery),
    queryTokens,
    domain: fusionPacket.domain || 'general',
    intent: fusionPacket.intent || 'general',
    primaryEmotion: emotion.primaryEmotion || 'neutral',
    emotionalIntensity: Number.isFinite(emotion.intensity) ? Math.max(0, Math.min(1, emotion.intensity)) : 0,
    emotionalNeeds: uniq(Array.isArray(emotion.needs) ? emotion.needs : []),
    psychologyPatterns: uniq(Array.isArray(psychology.patterns) ? psychology.patterns : []),
    psychologyNeeds: uniq(Array.isArray(psychology.needs) ? psychology.needs : []),
    psychologyRisks: uniq(risks),
    evidenceTitles: uniq(evidence.slice(0, 5).map(item => item && item.title)),
    responseMode: assembledResponse.responseMode?.mode || 'balanced',
    fallbackApplied: Boolean(assembledResponse.partial || assembledResponse.fallbackApplied)
  };
}

module.exports = {
  extractMemorySignals
};
