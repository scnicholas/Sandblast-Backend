// runtime/layer4/ToneEnvelopeBuilder.js

function clamp(n, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}

function buildToneEnvelope({ fusionPacket = {}, responseMode = {} } = {}) {
  const emotion = fusionPacket.emotion || {};
  const psychology = fusionPacket.psychology || {};
  const domain = fusionPacket.domain || 'general';

  const intensity = clamp(Number(emotion.intensity || 0));
  const primaryEmotion = emotion.primaryEmotion || 'neutral';

  const directives = [];
  const forbidden = [];
  let warmth = 0.55;
  let precision = 0.7;
  let directness = 0.65;

  if (primaryEmotion !== 'neutral') {
    directives.push(`Acknowledge ${primaryEmotion} without melodrama.`);
    warmth += 0.1;
  }

  if (intensity > 0.7) {
    directives.push('Keep pacing calm and grounded.');
    directives.push('Lead with emotional steadiness before complexity.');
    forbidden.push('abruptness');
    forbidden.push('cold detachment');
    warmth += 0.1;
    directness -= 0.08;
  }

  if ((psychology.recommendedApproach || '').includes('directive')) {
    directives.push('Be clear and guiding, not controlling.');
    directness += 0.08;
  }

  if (responseMode.mode === 'analytical' || responseMode.mode === 'evidence-led') {
    directives.push('Prioritize clarity, structure, and evidence.');
    precision += 0.12;
  }

  if (responseMode.mode === 'strategic') {
    directives.push('Frame the answer in operational steps.');
    precision += 0.08;
    directness += 0.06;
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

  return {
    warmth: clamp(Number(warmth.toFixed(4))),
    precision: clamp(Number(precision.toFixed(4))),
    directness: clamp(Number(directness.toFixed(4))),
    directives,
    forbidden
  };
}

module.exports = {
  buildToneEnvelope
};
