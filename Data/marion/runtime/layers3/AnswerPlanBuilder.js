// runtime/layer3/AnswerPlanBuilder.js

function buildOpeningStrategy(packet = {}) {
  const emotion = packet.emotion?.primaryEmotion || 'neutral';
  const intensity = packet.emotion?.intensity || 0;

  if (intensity > 0.7 && emotion !== 'neutral') {
    return 'Start with emotional acknowledgement, then move into grounded guidance.';
  }

  if (packet.intent === 'analysis' || packet.intent === 'research') {
    return 'Start with a direct answer, then support it with ranked reasoning.';
  }

  return 'Open warmly, answer directly, then reinforce with blended evidence.';
}

function buildReasoningSteps(packet = {}) {
  const steps = [];

  if (packet.emotion?.primaryEmotion && packet.emotion.primaryEmotion !== 'neutral') {
    steps.push(`Reflect the user’s likely emotional state: ${packet.emotion.primaryEmotion}.`);
  }

  if (packet.psychology?.recommendedApproach) {
    steps.push(`Apply psychology posture: ${packet.psychology.recommendedApproach}.`);
  }

  steps.push(`Use the active domain lens: ${packet.domain}.`);

  if (Array.isArray(packet.evidence) && packet.evidence.length) {
    steps.push(`Anchor response in top ${packet.evidence.length} evidence fragments.`);
  }

  steps.push('Keep tone unified so the answer sounds like one intelligence, not stacked modules.');

  return steps;
}

function buildAnswerPlan(packet = {}) {
  return {
    openingStrategy: buildOpeningStrategy(packet),
    reasoningSteps: buildReasoningSteps(packet),
    toneDirectives: packet.toneDirectives || [],
    domain: packet.domain || 'general',
    intent: packet.intent || 'general',
    evidence: packet.evidence || [],
    weights: packet.weights || {}
  };
}

module.exports = {
  buildAnswerPlan
};
