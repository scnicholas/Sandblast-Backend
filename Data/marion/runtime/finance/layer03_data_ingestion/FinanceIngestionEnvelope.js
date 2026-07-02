"use strict";

/**
 * R18D Layer 03 — Finance Ingestion Envelope
 * Creates the stable finance data-ingestion envelope for Layer 04 normalization.
 *
 * No external dependencies.
 */

const ENVELOPE_VERSION = "1.0.0";

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (Number.isNaN(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round(value, decimals = 3) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function uniqueArray(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function calculateQuality(payload = {}) {
  const rawInputs = safeArray(payload.rawInputs);
  const metricInputs = safeArray(payload.metricInputs);
  const claimTargets = safeArray(payload.claimTargets);
  const missingInputs = safeArray(payload.missingInputs);
  const assumptions = safeArray(payload.assumptions);

  const blockingMissing = missingInputs.filter((item) => item.blocksAnalysis === true);
  const requiredMissing = missingInputs.filter((item) => item.severity === "required");
  const ambiguousInputs = rawInputs.filter((item) => item.confidence < 0.5 || item.detectedMetric === "ambiguous");

  let score = 0;

  if (rawInputs.length > 0) score += 0.2;
  if (metricInputs.length > 0) score += Math.min(0.35, metricInputs.length * 0.08);
  if (claimTargets.length > 0) score += 0.18;
  if (assumptions.length > 0) score += 0.04;

  if (payload.entityInputs && safeArray(payload.entityInputs.jurisdictions).length > 0) score += 0.08;
  if (payload.sourceAuthorityEnvelope) score += 0.05;

  score -= Math.min(0.35, requiredMissing.length * 0.08);
  score -= Math.min(0.25, blockingMissing.length * 0.12);
  score -= Math.min(0.18, ambiguousInputs.length * 0.05);

  score = round(clamp(score), 3);

  let status = "partial";

  if (blockingMissing.length > 0 || score < 0.4) {
    status = "insufficient";
  } else if (ambiguousInputs.length > 0) {
    status = "ambiguous";
  } else if (score >= 0.85 && requiredMissing.length === 0) {
    status = "complete";
  } else {
    status = "partial";
  }

  return {
    status,
    score,
    blockingIssues: uniqueArray([
      ...blockingMissing.map((item) => item.missingInput),
      ...(payload.blockingIssues || [])
    ]),
    warnings: uniqueArray([
      ...requiredMissing.map((item) => `missing_required:${item.missingInput}`),
      ...ambiguousInputs.map((item) => `ambiguous_input:${item.rawValue}`),
      ...(payload.warnings || [])
    ])
  };
}

class FinanceIngestionEnvelope {
  static create(payload = {}) {
    const rawInputs = safeArray(payload.rawInputs);
    const metricInputs = safeArray(payload.metricInputs);
    const missingInputs = safeArray(payload.missingInputs);
    const assumptions = safeArray(payload.assumptions);
    const claimTargets = safeArray(payload.claimTargets);

    const ingestionQuality = payload.ingestionQuality || calculateQuality({
      ...payload,
      rawInputs,
      metricInputs,
      missingInputs,
      assumptions,
      claimTargets
    });

    const missingRequiredInputs = uniqueArray(
      missingInputs
        .filter((item) => item.severity === "required" || item.blocksAnalysis === true)
        .map((item) => item.missingInput)
    );

    const normalizationRequired =
      rawInputs.some((item) => item.requiresNormalization === true) ||
      metricInputs.some((item) => item.normalizationRequired === true);

    return {
      envelopeVersion: ENVELOPE_VERSION,
      domain: "finance",
      layer: "R18D_layer03_data_ingestion",
      runtimeLayer: "layer03_data_ingestion",
      createdAt: new Date().toISOString(),

      queryContext: {
        originalQuery: payload.originalQuery || "",
        normalizedQuery: payload.normalizedQuery || "",
        primaryIntent: payload.primaryIntent || null,
        secondaryIntents: safeArray(payload.secondaryIntents),
        jurisdictions: uniqueArray(payload.jurisdictions || []),
        requiresFreshData: Boolean(payload.requiresFreshData),
        sourceAuthorityEnvelope: payload.sourceAuthorityEnvelope || null
      },

      claimTargets,
      rawInputs,
      metricInputs,

      entityInputs: {
        businessNames: uniqueArray(payload.entityInputs && payload.entityInputs.businessNames),
        programNames: uniqueArray(payload.entityInputs && payload.entityInputs.programNames),
        companyNames: uniqueArray(payload.entityInputs && payload.entityInputs.companyNames),
        sourceNames: uniqueArray(payload.entityInputs && payload.entityInputs.sourceNames),
        jurisdictions: uniqueArray(payload.entityInputs && payload.entityInputs.jurisdictions),
        dates: uniqueArray(payload.entityInputs && payload.entityInputs.dates)
      },

      assumptions,
      missingInputs,
      ingestionQuality,

      nextLayerHandoff: {
        canProceedToNormalization:
          ingestionQuality.status !== "insufficient" &&
          rawInputs.length > 0 &&
          metricInputs.length > 0,
        normalizationRequired,
        missingRequiredInputs,
        requiresUserClarification: missingRequiredInputs.length > 0 || ingestionQuality.status === "ambiguous",
        requiresSourceVerification:
          Boolean(payload.requiresSourceVerification) ||
          rawInputs.some((item) => item.requiresVerification === true) ||
          metricInputs.some((item) => item.verificationRequired === true)
      }
    };
  }

  static validate(envelope = {}) {
    const errors = [];

    if (envelope.domain !== "finance") {
      errors.push("Envelope domain must be finance.");
    }

    if (envelope.layer !== "R18D_layer03_data_ingestion") {
      errors.push("Envelope layer must be R18D_layer03_data_ingestion.");
    }

    if (!envelope.queryContext || typeof envelope.queryContext !== "object") {
      errors.push("Envelope queryContext is required.");
    }

    if (!Array.isArray(envelope.rawInputs)) {
      errors.push("Envelope rawInputs must be an array.");
    }

    if (!Array.isArray(envelope.metricInputs)) {
      errors.push("Envelope metricInputs must be an array.");
    }

    if (!envelope.nextLayerHandoff || typeof envelope.nextLayerHandoff !== "object") {
      errors.push("Envelope nextLayerHandoff is required.");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static calculateQuality(payload = {}) {
    return calculateQuality(payload);
  }
}

module.exports = {
  FinanceIngestionEnvelope
};
