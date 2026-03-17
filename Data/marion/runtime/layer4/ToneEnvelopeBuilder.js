function clamp(n, min = 0, max = 1) {
  const num = Number(n);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function uniq(arr = []) {
  return [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean))];
}

function buildToneEnvelope({ fusionPacket = {}, responseMode = {}, turnMemory = {} } = {}) {
  const emotion = fusionPacket.emotion || {};
  const psychology = fusionPacket.psychology || {};
  const domain = fusionPacket.domain || 'general';

  const intensity = clamp(emotion.intensity || 0);
  const primaryEmotion = emotion.primaryEmotion || 'neutral';
  const fallbackStreak = Number(turnMemory.fallbackStreak || 0);
  const repeatQueryStreak = Number(turnMemory.repeatQueryStreak || 0);
  const recoveryMode = turnMemory.recoveryMode || 'normal';

  const directives = [];
  const forbidden = [];
  let warmth = 0.55;
  let precision = 0.72;
  let directness = 0.66;

  if (primaryEmotion !== 'neutral') {
    directives.push(`Acknowledge ${primaryEmotion} without melodrama or mimicry.`);
    warmth += 0.1;
  }

  if (intensity > 0.7) {
    directives.push('Keep pacing calm, grounded, and emotionally steady.');
    directives.push('Lead with steadiness before complexity.');
    forbidden.push('abruptness', 'cold detachment');
    warmth += 0.08;
    directness -= 0.08;
  }

  if ((psychology.recommendedApproach || '').includes('directive')) {
    directives.push('Be guiding and clear without sounding controlling.');
    directness += 0.06;
  }

  if (
    responseMode.mode === 'analytical' ||
    responseMode.mode === 'evidence-led' ||
    responseMode.mode === 'bounded-analytical'
  ) {
    directives.push('Prioritize clarity, structure, and bounded claims.');
    precision += 0.12;
  }

  if (responseMode.mode === 'strategic') {
    directives.push('Frame the answer in operational steps with forward motion.');
    precision += 0.08;
    directness += 0.06;
  }

  if (responseMode.mode === 'recovery') {
    directives.push('Break repetition. Do not restate the same reassurance in new clothes.');
    directives.push('Use one clear next move, not a spiral of options.');
    precision += 0.06;
    directness += 0.04;
    forbidden.push('repetitive reassurance', 'circular phrasing');
  }

  if (domain === 'law' || domain === 'finance' || domain === 'cybersecurity') {
    directives.push(`Maintain disciplined ${domain} framing.`);
    precision += 0.08;
    forbidden.push('overclaiming');
  }

  if (domain === 'psychology') {
    directives.push('Be supportive, stable, and human-aware.');
    forbidden.push('clinical coldness');
  }

  if (fallbackStreak >= 2 || repeatQueryStreak >= 2 || recoveryMode === 'guided-recovery') {
    directives.push('Tighten the answer and reduce ornamental language.');
    forbidden.push('generic filler');
    precision += 0.05;
    directness += 0.04;
  }

  return {
    warmth: clamp(Number(warmth.toFixed(4))),
    precision: clamp(Number(precision.toFixed(4))),
    directness: clamp(Number(directness.toFixed(4))),
    directives: uniq(directives),
    forbidden: uniq(forbidden)
  };
}

module.exports = {
  buildToneEnvelope
};
