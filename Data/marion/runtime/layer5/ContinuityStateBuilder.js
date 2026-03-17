function normalizeText(text = '') {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
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

function buildContinuityState({
  userQuery = '',
  fusionPacket = {},
  assembledResponse = {},
  previousMemory = {}
} = {}) {
  const emotion = fusionPacket.emotion || {};
  const psychology = fusionPacket.psychology || {};
  const persistent = previousMemory.persistent || {};

  const normalizedQuery = normalizeText(userQuery);
  const activeDomain =
    fusionPacket.domain ||
    previousMemory.domain ||
    persistent.domain ||
    'general';

  const activeIntent =
    fusionPacket.intent ||
    previousMemory.intent ||
    persistent.intent ||
    'general';

  const activeEmotion =
    emotion.primaryEmotion ||
    previousMemory?.emotion?.primaryEmotion ||
    previousMemory.activeEmotion ||
    'neutral';

  const emotionalIntensity = Number.isFinite(emotion.intensity)
    ? Math.max(0, Math.min(1, emotion.intensity))
    : (
      Number.isFinite(previousMemory?.emotion?.intensity)
        ? previousMemory.emotion.intensity
        : 0
    );

  const fallbackStreak = Number(previousMemory.fallbackStreak || 0) || 0;
  const repeatQueryStreak = Number(previousMemory.repeatQueryStreak || 0) || 0;
  const continuityFlags = Array.isArray(previousMemory?.resetGuard?.flags)
    ? previousMemory.resetGuard.flags
    : [];

  const continuityHealth =
    fallbackStreak >= 3 ? 'critical'
      : fallbackStreak === 2 || repeatQueryStreak >= 3 ? 'fragile'
        : continuityFlags.length >= 2 ? 'stable'
          : 'watch';

  return {
    activeQuery: userQuery,
    normalizedQuery,
    queryFingerprint: fingerprint(userQuery),
    activeDomain,
    activeIntent,
    activeEmotion,
    emotionalIntensity,
    psychologyRisks: Array.isArray(psychology.risks) ? psychology.risks : [],
    responseMode: assembledResponse.responseMode?.mode || previousMemory.lastStableMode || 'balanced',
    fallbackApplied: Boolean(assembledResponse.partial || assembledResponse.fallbackApplied),
    continuityHealth,
    timestamp: Date.now()
  };
}

module.exports = {
  buildContinuityState
};
