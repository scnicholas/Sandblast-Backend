function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function assembleResponse({
  fusionPacket = {},
  answerPlan = {},
  responseMode = {},
  toneEnvelope = {},
  domainResponse = {},
  safetyEnvelope = {},
  fallbackResponse = null,
  continuityState = {},
  turnMemory = {}
} = {}) {
  const diagnostics = fusionPacket.diagnostics || {};
  const evidence = normalizeArray(fusionPacket.evidence);
  const evidenceKept = Number(diagnostics.evidenceKept || evidence.length || 0);
  const lowEvidence = evidenceKept < 2;
  const thinReasoning = Boolean(domainResponse?.gapSignals?.thinReasoning);
  const recoveryMode = turnMemory.recoveryMode || continuityState.recoveryMode || 'normal';
  const fallbackStreak = Number(turnMemory.fallbackStreak || 0);
  const repeatQueryStreak = Number(turnMemory.repeatQueryStreak || 0);
  const partial = lowEvidence || thinReasoning || responseMode.mode === 'recovery';

  return {
    ok: true,
    partial,
    status: partial ? 'degraded-but-usable' : 'healthy',
    domain: fusionPacket.domain || 'general',
    intent: fusionPacket.intent || 'general',
    responseMode,
    toneEnvelope,
    domainResponse,
    safetyEnvelope,
    fallbackResponse: partial ? fallbackResponse : null,
    sourcePacket: {
      emotion: fusionPacket.emotion || {},
      psychology: fusionPacket.psychology || {},
      evidence,
      weights: fusionPacket.weights || {},
      diagnostics
    },
    answerPlan,
    meta: {
      evidenceKept,
      lowEvidence,
      thinReasoning,
      recoveryMode,
      fallbackStreak,
      repeatQueryStreak,
      continuityHealth: turnMemory.continuityHealth || continuityState.continuityHealth || 'watch'
    }
  };
}

module.exports = {
  assembleResponse
};
