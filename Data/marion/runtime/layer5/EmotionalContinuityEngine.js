function clampIntensity(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function buildEmotionalContinuity({
  fusionPacket = {},
  previousMemory = {}
} = {}) {
  const currentEmotion = fusionPacket.emotion || {};
  const prevEmotion = previousMemory.emotion || {};

  const currentPrimary = currentEmotion.primaryEmotion || 'neutral';
  const previousPrimary = prevEmotion.primaryEmotion || 'neutral';
  const currentIntensity = clampIntensity(currentEmotion.intensity);
  const previousIntensity = clampIntensity(prevEmotion.intensity);

  const continuity = {
    previousPrimaryEmotion: previousPrimary,
    currentPrimaryEmotion: currentPrimary,
    previousIntensity,
    currentIntensity,
    maintained: false,
    shifted: false,
    escalation: false,
    deescalation: false,
    stableEmotionStreak: 0
  };

  if (previousPrimary !== 'neutral' && currentPrimary === previousPrimary) {
    continuity.maintained = true;
  }

  if (previousPrimary !== 'neutral' && currentPrimary !== previousPrimary) {
    continuity.shifted = true;
  }

  if (currentIntensity > previousIntensity + 0.1) {
    continuity.escalation = true;
  }

  if (previousIntensity > currentIntensity + 0.1) {
    continuity.deescalation = true;
  }

  continuity.stableEmotionStreak = continuity.maintained
    ? (Number(previousMemory?.emotionalContinuity?.stableEmotionStreak || 0) || 0) + 1
    : (currentPrimary !== 'neutral' ? 1 : 0);

  return continuity;
}

module.exports = {
  buildEmotionalContinuity
};
