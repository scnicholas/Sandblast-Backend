"use strict";

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function buildNyxNarrative(response = {}) {
  const mode = response.responseMode?.mode || "balanced";
  const domain = response.domain || "general";
  const opening = response.domainResponse?.openingStrategy || "Lead clearly.";
  const reasoning = normalizeArray(response.domainResponse?.reasoningSteps);
  const tone = normalizeArray(response.toneEnvelope?.directives);
  const evidence = normalizeArray(response.domainResponse?.evidenceLines);
  const fallback = response.fallbackResponse || null;
  const recoveryNotes = normalizeArray(response.domainResponse?.recoveryNotes);
  const directive = response.domainResponse?.nyxDirective || {};

  return {
    mode,
    domain,
    opening,
    reasoning,
    tone,
    evidence,
    fallback,
    recoveryNotes,
    directive
  };
}

function adaptForNyx(response = {}) {
  const narrative = buildNyxNarrative(response);
  const meta = response.meta || {};
  const toneEnvelope = response.toneEnvelope || {};
  const voiceWarmth = Number.isFinite(toneEnvelope.warmth) ? toneEnvelope.warmth : 0.55;
  const voicePrecision = Number.isFinite(toneEnvelope.precision) ? toneEnvelope.precision : 0.72;
  const voiceDirectness = Number.isFinite(toneEnvelope.directness) ? toneEnvelope.directness : 0.66;

  return {
    ok: true,
    channel: "nyx",
    partial: Boolean(response.partial),
    status: response.status || "healthy",
    voiceDirectives: {
      warmth: voiceWarmth,
      precision: voicePrecision,
      directness: voiceDirectness,
      pacing: response.domainResponse?.frame?.pacing || "balanced"
    },
    narrative,
    safety: response.safetyEnvelope || {},
    metadata: {
      domain: response.domain || "general",
      intent: response.intent || "general",
      mode: response.responseMode?.mode || "balanced",
      recoveryMode: meta.recoveryMode || "normal",
      continuityHealth: meta.continuityHealth || "watch",
      fallbackStreak: Number(meta.fallbackStreak || 0),
      repeatQueryStreak: Number(meta.repeatQueryStreak || 0),
      lowEvidence: Boolean(meta.lowEvidence),
      suppressionActive: Boolean(meta.suppressionActive),
      driftTrend: meta.driftTrend || "steady"
    }
  };
}

module.exports = {
  adaptForNyx
};
