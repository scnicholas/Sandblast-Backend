"use strict";

/**
 * R18D Layer 01 — Finance Intent Confidence
 * Scores and bands finance intent matches.
 *
 * No external dependencies.
 */

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 3) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function getBand(score) {
  if (score >= 0.8) return "high";
  if (score >= 0.55) return "medium";
  if (score >= 0.35) return "low";
  return "insufficient";
}

class FinanceIntentConfidence {
  constructor(options = {}) {
    this.options = options;
  }

  scoreIntent(input = {}) {
    const {
      intentId = "unknown",
      keywordMatches = [],
      phraseMatches = [],
      secondaryHintMatches = [],
      laneConfig = {},
      normalized = {},
      advisoryBoundaryHit = false,
      jurisdictionDetected = false,
      freshnessDetected = false,
      riskLanguageDetected = false,
      complianceLanguageDetected = false
    } = input;

    const drivers = [];
    const penalties = [];

    let score = 0.12;

    if (keywordMatches.length > 0) {
      const boost = Math.min(0.34, keywordMatches.length * 0.055);
      score += boost;
      drivers.push(`keyword_matches:${keywordMatches.length}`);
    }

    if (phraseMatches.length > 0) {
      const boost = Math.min(0.36, phraseMatches.length * 0.12);
      score += boost;
      drivers.push(`phrase_matches:${phraseMatches.length}`);
    }

    if (secondaryHintMatches.length > 0) {
      const boost = Math.min(0.12, secondaryHintMatches.length * 0.04);
      score += boost;
      drivers.push(`secondary_hint_matches:${secondaryHintMatches.length}`);
    }

    if (riskLanguageDetected && intentId === "commercial_risk") {
      score += 0.08;
      drivers.push("risk_language_aligned");
    }

    if (complianceLanguageDetected && intentId === "compliance") {
      score += 0.1;
      drivers.push("compliance_language_aligned");
    }

    if (freshnessDetected && laneConfig.requiresFreshData) {
      score += 0.04;
      drivers.push("freshness_marker_aligned");
    }

    if (jurisdictionDetected && laneConfig.requiresJurisdiction) {
      score += 0.05;
      drivers.push("jurisdiction_marker_aligned");
    }

    if (normalized.shape && normalized.shape.asksForFramework && intentId === "case_study") {
      score += 0.04;
      drivers.push("framework_shape_aligned");
    }

    if (normalized.shape && normalized.shape.asksForSources && intentId === "source_lookup") {
      score += 0.1;
      drivers.push("source_lookup_shape_aligned");
    }

    if (normalized.shape && normalized.shape.containsNumbers) {
      score += 0.02;
      drivers.push("numeric_context_present");
    }

    if (laneConfig.requiresJurisdiction && !jurisdictionDetected && complianceLanguageDetected) {
      score -= 0.05;
      penalties.push("jurisdiction_required_but_missing");
    }

    if (normalized.meaningfulTokens && normalized.meaningfulTokens.length <= 2) {
      score -= 0.08;
      penalties.push("very_short_query");
    }

    if (normalized.shape && normalized.shape.asksForPrediction) {
      score -= 0.03;
      penalties.push("forecast_or_prediction_language");
    }

    if (advisoryBoundaryHit) {
      score -= 0.02;
      penalties.push("advisory_boundary_trigger_present");
    }

    const finalScore = round(clamp(score), 3);

    return {
      intentId,
      score: finalScore,
      band: getBand(finalScore),
      drivers,
      penalties,
      keywordMatches,
      phraseMatches,
      secondaryHintMatches
    };
  }

  rankScores(scores = [], priority = []) {
    const priorityIndex = new Map();

    priority.forEach((intentId, index) => {
      priorityIndex.set(intentId, index);
    });

    return scores
      .slice()
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;

        const aPriority = priorityIndex.has(a.intentId)
          ? priorityIndex.get(a.intentId)
          : Number.MAX_SAFE_INTEGER;

        const bPriority = priorityIndex.has(b.intentId)
          ? priorityIndex.get(b.intentId)
          : Number.MAX_SAFE_INTEGER;

        return aPriority - bPriority;
      });
  }

  static getBand(score) {
    return getBand(score);
  }

  static scoreIntent(input = {}) {
    return new FinanceIntentConfidence().scoreIntent(input);
  }

  static rankScores(scores = [], priority = []) {
    return new FinanceIntentConfidence().rankScores(scores, priority);
  }
}

module.exports = {
  FinanceIntentConfidence
};
