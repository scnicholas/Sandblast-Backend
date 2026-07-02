"use strict";

/**
 * R18D Layer 01 — Finance Intent Envelope
 * Creates a stable classification envelope for downstream finance layers.
 *
 * No external dependencies.
 */

const ENVELOPE_VERSION = "1.0.0";

function uniqueArray(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (Number.isNaN(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function confidenceBand(score) {
  if (score >= 0.8) return "high";
  if (score >= 0.55) return "medium";
  if (score >= 0.35) return "low";
  return "insufficient";
}

class FinanceIntentEnvelope {
  static create(payload = {}) {
    const confidence = clamp(payload.confidence, 0, 1);
    const secondaryIntents = uniqueArray(payload.secondaryIntents || []);
    const recommendedSourcePacks = uniqueArray(payload.recommendedSourcePacks || []);
    const detectedJurisdictions = uniqueArray(payload.detectedJurisdictions || []);
    const boundaryTriggers = uniqueArray(payload.boundaryTriggers || []);
    const missingContext = uniqueArray(payload.missingContext || []);
    const notes = uniqueArray(payload.notes || []);

    return {
      envelopeVersion: ENVELOPE_VERSION,
      domain: "finance",
      layer: "R18D_layer01_intent_classification",
      runtimeLayer: "layer01_intent",
      createdAt: new Date().toISOString(),

      originalQuery: payload.originalQuery || "",
      normalizedQuery: payload.normalizedQuery || "",
      queryShape: payload.queryShape || {},

      primaryIntent: payload.primaryIntent || "unknown",
      secondaryIntents,
      allIntents: uniqueArray([
        payload.primaryIntent || "unknown",
        ...secondaryIntents
      ]),

      confidence,
      confidenceBand: payload.confidenceBand || confidenceBand(confidence),
      intentScores: payload.intentScores || [],

      requiresJurisdiction: Boolean(payload.requiresJurisdiction),
      detectedJurisdictions,
      requiresFreshData: Boolean(payload.requiresFreshData),
      requiresSourceCheck: Boolean(payload.requiresSourceCheck),
      advisoryBoundaryRequired: Boolean(payload.advisoryBoundaryRequired),

      recommendedSourcePacks,
      responseLane: payload.responseLane || null,
      route: payload.route || null,

      matchedSignals: payload.matchedSignals || {
        keywords: [],
        phrases: [],
        riskLanguage: [],
        freshnessMarkers: [],
        jurisdictionMarkers: []
      },

      boundaryTriggers,
      missingContext,
      notes,

      nextLayerHandoff: {
        layer02_sourceAuthorityRequired: Boolean(payload.requiresSourceCheck),
        layer03_jurisdictionRequired: Boolean(payload.requiresJurisdiction),
        complianceBoundaryRequired: Boolean(payload.advisoryBoundaryRequired),
        sourcePacks: recommendedSourcePacks
      }
    };
  }

  static validate(envelope = {}) {
    const errors = [];

    if (envelope.domain !== "finance") {
      errors.push("Envelope domain must be finance.");
    }

    if (!envelope.primaryIntent) {
      errors.push("Envelope requires primaryIntent.");
    }

    if (typeof envelope.confidence !== "number") {
      errors.push("Envelope confidence must be numeric.");
    }

    if (!Array.isArray(envelope.secondaryIntents)) {
      errors.push("Envelope secondaryIntents must be an array.");
    }

    if (!Array.isArray(envelope.recommendedSourcePacks)) {
      errors.push("Envelope recommendedSourcePacks must be an array.");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static confidenceBand(score) {
    return confidenceBand(score);
  }
}

module.exports = {
  FinanceIntentEnvelope
};
