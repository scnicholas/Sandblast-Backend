// runtime/layer4/NyxOutputAdapter.js

function buildNyxNarrative(response = {}) {
  const mode = response.responseMode?.mode || 'balanced';
  const domain = response.domain || 'general';
  const opening = response.domainResponse?.openingStrategy || 'Open clearly.';
  const reasoning = response.domainResponse?.reasoningSteps || [];
  const tone = response.toneEnvelope?.directives || [];
  const evidence = response.domainResponse?.evidenceLines || [];
  const fallback = response.fallbackResponse;

  return {
    mode,
    domain,
    opening,
    reasoning,
    tone,
    evidence,
    fallback
  };
}

function adaptForNyx(response = {}) {
  const narrative = buildNyxNarrative(response);

  return {
    ok: true,
    channel: 'nyx',
    voiceDirectives: {
      warmth: response.toneEnvelope?.warmth || 0.5,
      precision: response.toneEnvelope?.precision || 0.7,
      directness: response.toneEnvelope?.directness || 0.6
    },
    narrative,
    safety: response.safetyEnvelope || {},
    metadata: {
      domain: response.domain || 'general',
      intent: response.intent || 'general',
      mode: response.responseMode?.mode || 'balanced'
    }
  };
}

module.exports = {
  adaptForNyx
};
