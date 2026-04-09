"use strict";

function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function _dominantBlendKey(blend = {}) {
  const obj = _safeObj(blend);
  let bestKey = "";
  let bestValue = -1;
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > bestValue) {
      bestValue = n;
      bestKey = k;
    }
  }
  return bestKey || null;
}

function buildEmotionalContinuity({
  fusionPacket = {},
  previousMemory = {}
} = {}) {
  const currentEmotion = _safeObj(_safeObj(fusionPacket).emotion);
  const prevMemory = _safeObj(previousMemory);
  const prevEmotion = _safeObj(prevMemory.emotion);
  const prevContinuity = _safeObj(prevMemory.emotionalContinuity);

  const currentPrimary = currentEmotion.primaryEmotion || "neutral";
  const previousPrimary = prevEmotion.primaryEmotion || "neutral";
  const currentIntensity = _clamp01(currentEmotion.intensity);
  const previousIntensity = _clamp01(prevEmotion.intensity);
  const currentBlend = _safeObj(currentEmotion.blendProfile);
  const previousBlend = _safeObj(prevEmotion.blendProfile || prevContinuity.previousBlendProfile);
  const currentDominantBlend = _dominantBlendKey(currentBlend);
  const previousDominantBlend = _dominantBlendKey(previousBlend);

  const maintained = previousPrimary !== "neutral" && currentPrimary === previousPrimary;
  const shifted = previousPrimary !== "neutral" && currentPrimary !== previousPrimary;
  const escalation = currentIntensity > previousIntensity + 0.1;
  const deescalation = previousIntensity > currentIntensity + 0.1;
  const blendShifted = !!currentDominantBlend && !!previousDominantBlend && currentDominantBlend !== previousDominantBlend;

  const stableEmotionStreak = maintained
    ? (Number(prevContinuity.stableEmotionStreak || 0) || 0) + 1
    : (currentPrimary !== "neutral" ? 1 : 0);

  return {
    previousPrimaryEmotion: previousPrimary,
    currentPrimaryEmotion: currentPrimary,
    previousIntensity,
    currentIntensity,
    previousBlendProfile: previousBlend,
    currentBlendProfile: currentBlend,
    previousDominantBlend,
    currentDominantBlend,
    maintained,
    shifted,
    escalation,
    deescalation,
    blendShifted,
    stableEmotionStreak,
    stateDrift: _safeObj(currentEmotion.stateDrift)
  };
}

module.exports = {
  buildEmotionalContinuity
};
