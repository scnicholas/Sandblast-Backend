"use strict";

/**
 * R18D Layer 02 — Finance Source Envelope
 * Creates a stable source-authority envelope for downstream finance layers.
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

function evidenceBand(score) {
  if (score >= 0.8) return "strong";
  if (score >= 0.6) return "moderate";
  if (score >= 0.4) return "weak";
  return "insufficient";
}

function confidenceImpactFromScore(score, blocking = false) {
  if (blocking) return "block";
  if (score >= 0.8) return "increase";
  if (score >= 0.6) return "neutral";
  if (score >= 0.4) return "decrease";
  return "block";
}

class FinanceSourceEnvelope {
  static create(payload = {}) {
    const aggregateEvidenceScore = round(clamp(payload.aggregateEvidenceScore || 0), 3);
    const blocking = Boolean(payload.blocking);

    return {
      envelopeVersion: ENVELOPE_VERSION,
      domain: "finance",
      layer: "R18D_layer02_source_authority",
      runtimeLayer: "layer02_source_authority",
      createdAt: new Date().toISOString(),

      intentContext: payload.intentContext || null,
      claim: payload.claim || "",
      claimType: payload.claimType || "unknown",
      claimSensitivity: payload.claimSensitivity || "business_decision_support",

      sources: Array.isArray(payload.sources) ? payload.sources : [],
      rankedSources: Array.isArray(payload.rankedSources) ? payload.rankedSources : [],

      aggregateEvidenceScore,
      evidenceBand: payload.evidenceBand || evidenceBand(aggregateEvidenceScore),
      confidenceImpact: payload.confidenceImpact || confidenceImpactFromScore(aggregateEvidenceScore, blocking),

      citationRequired: Boolean(payload.citationRequired),
      freshnessRequired: Boolean(payload.freshnessRequired),
      sourceAuthorityRequired: Boolean(payload.sourceAuthorityRequired),

      conflict: payload.conflict || {
        conflictDetected: false,
        conflictTypes: [],
        conflictSeverity: "none",
        confidenceImpact: "neutral",
        mustDiscloseConflict: false,
        notes: []
      },

      missingEvidence: uniqueArray(payload.missingEvidence || []),
      limitations: uniqueArray(payload.limitations || []),
      notes: uniqueArray(payload.notes || []),

      nextLayerHandoff: {
        canProceedToAnalysis: !blocking && aggregateEvidenceScore >= 0.4,
        complianceBoundaryRequired: Boolean(payload.complianceBoundaryRequired),
        citationRequired: Boolean(payload.citationRequired),
        unresolvedConflict: Boolean(payload.conflict && payload.conflict.conflictDetected && payload.conflict.confidenceImpact === "block")
      }
    };
  }

  static validate(envelope = {}) {
    const errors = [];

    if (envelope.domain !== "finance") {
      errors.push("Envelope domain must be finance.");
    }

    if (envelope.layer !== "R18D_layer02_source_authority") {
      errors.push("Envelope layer must be R18D_layer02_source_authority.");
    }

    if (!Array.isArray(envelope.sources)) {
      errors.push("Envelope sources must be an array.");
    }

    if (typeof envelope.aggregateEvidenceScore !== "number") {
      errors.push("Envelope aggregateEvidenceScore must be numeric.");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static evidenceBand(score) {
    return evidenceBand(score);
  }

  static confidenceImpactFromScore(score, blocking = false) {
    return confidenceImpactFromScore(score, blocking);
  }
}

module.exports = {
  FinanceSourceEnvelope
};
