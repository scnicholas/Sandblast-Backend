// runtime/layer5/EmotionalContinuityEngine.js

function buildEmotionalContinuity({
  fusionPacket = {},
  previousMemory = {}
} = {}) {
  const currentEmotion = fusionPacket.emotion || {};
  const prevEmotion = previousMemory.emotion || {};

  const currentPrimary = currentEmotion.primaryEmotion || 'neutral';
  const previousPrimary = prevEmotion.primaryEmotion || 'neutral';

  const continuity = {
    previousPrimaryEmotion: previousPrimary,
    currentPrimaryEmotion: currentPrimary,
    maintained: false,
    shifted: false,
    escalation: false
  };

  if (previousPrimary !== 'neutral' && currentPrimary === previousPrimary) {
    continuity.maintained = true;
  }

  if (previousPrimary !== 'neutral' && currentPrimary !== previousPrimary) {
    continuity.shifted = true;
  }

  if (
    Number.isFinite(currentEmotion.intensity) &&
    Number.isFinite(prevEmotion.intensity) &&
    currentEmotion.intensity > prevEmotion.intensity
  ) {
    continuity.escalation = true;
  }

  return continuity;
}

module.exports = {
  buildEmotionalContinuity
};
