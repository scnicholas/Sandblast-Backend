// runtime/layer4/FallbackResponseBuilder.js

function buildFallbackResponse({ fusionPacket = {}, responseMode = {} } = {}) {
  const emotion = fusionPacket.emotion || {};
  const primaryEmotion = emotion.primaryEmotion || 'neutral';

  let opening = 'I want to answer this carefully.';
  let posture = 'balanced';
  let nextMove = 'Give a clear, grounded answer with minimal overreach.';

  if (primaryEmotion !== 'neutral') {
    opening = `I can hear some ${primaryEmotion} in this.`;
    posture = 'supportive';
    nextMove = 'Acknowledge the state first, then offer the most grounded next step.';
  }

  if (responseMode.mode === 'analytical') {
    opening = 'The signal is limited, so I’m keeping this precise.';
    posture = 'analytical';
    nextMove = 'Answer directly, mark uncertainty, avoid invention.';
  }

  return {
    fallback: true,
    opening,
    posture,
    nextMove
  };
}

module.exports = {
  buildFallbackResponse
};
