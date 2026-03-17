// runtime/layer4/ResponseAssembler.js

function assembleResponse({
  fusionPacket = {},
  answerPlan = {},
  responseMode = {},
  toneEnvelope = {},
  domainResponse = {},
  safetyEnvelope = {},
  fallbackResponse = null
} = {}) {
  const diagnostics = fusionPacket.diagnostics || {};
  const lowEvidence = (diagnostics.evidenceKept || 0) < 2;

  return {
    ok: true,
    domain: fusionPacket.domain || 'general',
    intent: fusionPacket.intent || 'general',
    responseMode,
    toneEnvelope,
    domainResponse,
    safetyEnvelope,
    fallbackResponse: lowEvidence ? fallbackResponse : null,
    sourcePacket: {
      emotion: fusionPacket.emotion || {},
      psychology: fusionPacket.psychology || {},
      evidence: fusionPacket.evidence || [],
      weights: fusionPacket.weights || {}
    },
    answerPlan
  };
}

module.exports = {
  assembleResponse
};
