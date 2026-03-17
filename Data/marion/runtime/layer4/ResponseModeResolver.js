// runtime/layer4/ResponseModeResolver.js

function resolveResponseMode({ fusionPacket = {}, answerPlan = {} } = {}) {
  const intent = fusionPacket.intent || answerPlan.intent || 'general';
  const emotion = fusionPacket.emotion || {};
  const psychology = fusionPacket.psychology || {};
  const domain = fusionPacket.domain || answerPlan.domain || 'general';

  const intensity = Number.isFinite(emotion.intensity) ? emotion.intensity : 0;
  const primaryEmotion = emotion.primaryEmotion || 'neutral';
  const approach = psychology.recommendedApproach || 'supportive';

  let mode = 'balanced';

  if (intent === 'analysis') mode = 'analytical';
  if (intent === 'research') mode = 'evidence-led';
  if (intent === 'strategy') mode = 'strategic';
  if (intent === 'support') mode = 'supportive';

  if (intensity > 0.7 && primaryEmotion !== 'neutral') {
    mode = 'stabilizing';
  }

  if (approach.includes('directive') && intensity > 0.55) {
    mode = 'supportive-directive';
  }

  return {
    mode,
    intent,
    domain,
    primaryEmotion,
    intensity,
    recommendedApproach: approach
  };
}

module.exports = {
  resolveResponseMode
};
