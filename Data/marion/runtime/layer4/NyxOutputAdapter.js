function buildNyxNarrative(response = {}) {
  const mode = response.responseMode?.mode || 'balanced';
  const domain = response.domain || 'general';
  const opening = response.domainResponse?.openingStrategy || 'Lead clearly.';
  const reasoning = response.domainResponse?.reasoningSteps || [];
  const tone = response.toneEnvelope?.directives || [];
  const evidence = response.domainResponse?.evidenceLines || [];
  const fallback = response.fallbackResponse || null;
  const recoveryNotes = response.domainResponse?.recoveryNotes || [];

  return {
    mode,
    domain,
    opening,
    reasoning,
    tone,
    evidence,
    fallback,
    recoveryNotes
  };
}

function adaptForNyx(response = {}) {
  const narrative = buildNyxNarrative(response);
  const meta = response.meta || {};

  return {
    ok: true,
    channel: 'nyx',
    partial: Boolean(response.partial),
    status: response.status || 'healthy',
    voiceDirectives: {
      warmth: response.toneEnvelope?.warmth || 0.55,
      precision: response.toneEnvelope?.precision || 0.72,
      directness: response.toneEnvelope?.directness || 0.66
    },
    narrative,
    safety: response.safetyEnvelope || {},
    metadata: {
      domain: response.domain || 'general',
      intent: response.intent || 'general',
      mode: response.responseMode?.mode || 'balanced',
      recoveryMode: meta.recoveryMode || 'normal',
      continuityHealth: meta.continuityHealth || 'watch',
      fallbackStreak: Number(meta.fallbackStreak || 0),
      repeatQueryStreak: Number(meta.repeatQueryStreak || 0),
      lowEvidence: Boolean(meta.lowEvidence)
    }
  };
}

module.exports = {
  adaptForNyx
};
