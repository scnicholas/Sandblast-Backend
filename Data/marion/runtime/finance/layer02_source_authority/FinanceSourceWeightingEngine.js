"use strict";

/**
 * R18D Layer 02 — Finance Source Weighting Engine
 * Combines authority, freshness, relevance, specificity, and consistency.
 *
 * No external dependencies.
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_PACK_DIR = path.resolve(__dirname, "../../../../Domains/finance/packs");

function safeReadJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    return {
      __loadError: true,
      filePath,
      message: error.message,
      fallback
    };
  }
}

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (Number.isNaN(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round(value, decimals = 3) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function band(score) {
  if (score >= 0.8) return "strong";
  if (score >= 0.6) return "moderate";
  if (score >= 0.4) return "weak";
  return "insufficient";
}

class FinanceSourceWeightingEngine {
  constructor(options = {}) {
    this.packDir = options.packDir ? path.resolve(options.packDir) : DEFAULT_PACK_DIR;

    this.rules = safeReadJson(
      path.join(this.packDir, "fin_evidence_weighting_v1.json"),
      {
        scoreComponents: {
          authority: { weight: 0.35 },
          freshness: { weight: 0.25 },
          relevance: { weight: 0.2 },
          specificity: { weight: 0.1 },
          consistency: { weight: 0.1 }
        },
        claimSensitivityMultipliers: {}
      }
    );
  }

  getLoadStatus() {
    return {
      packDir: this.packDir,
      evidenceWeightingLoaded: !this.rules.__loadError,
      errors: [this.rules.__loadError ? this.rules : null].filter(Boolean)
    };
  }

  freshnessScore(freshnessStatus) {
    switch (freshnessStatus) {
      case "current":
        return 1;
      case "dated_but_usable":
        return 0.75;
      case "unknown_freshness":
        return 0.45;
      case "stale_for_current_claim":
        return 0.2;
      case "requires_live_check":
        return 0;
      default:
        return 0.55;
    }
  }

  applyAdjustments(baseScore, source = {}, freshness = {}, conflict = {}) {
    let score = baseScore;
    const adjustments = [];

    if (source.sourceTier === "primary_official") {
      score += 0.08;
      adjustments.push("official_primary_source:+0.08");
    }

    if (source.jurisdictionMatch === true) {
      score += 0.06;
      adjustments.push("direct_jurisdiction_match:+0.06");
    }

    if (source.metricMatch === true) {
      score += 0.05;
      adjustments.push("direct_metric_match:+0.05");
    }

    if (source.corroborated === true) {
      score += 0.08;
      adjustments.push("corroborated_by_second_authoritative_source:+0.08");
    }

    if (freshness.freshnessStatus === "stale_for_current_claim") {
      score -= 0.25;
      adjustments.push("stale_for_current_claim:-0.25");
    }

    if (freshness.freshnessStatus === "unknown_freshness") {
      score -= 0.12;
      adjustments.push("unknown_source_date:-0.12");
    }

    if (source.sourceTier === "unsupported_or_unknown") {
      score -= 0.5;
      adjustments.push("unsupported_source:-0.5");
    }

    if (conflict.conflictDetected && conflict.confidenceImpact === "decrease") {
      score -= 0.2;
      adjustments.push("unresolved_conflict:-0.20");
    }

    if (conflict.conflictDetected && conflict.confidenceImpact === "block") {
      score = 0;
      adjustments.push("blocking_conflict:set_0");
    }

    return {
      score: round(clamp(score), 3),
      adjustments
    };
  }

  evaluateSource(input = {}) {
    const {
      source = {},
      freshness = {},
      conflict = {},
      claimSensitivity = "business_decision_support"
    } = input;

    const weights = this.rules.scoreComponents || {};
    const authorityWeight = clamp(source.authorityWeight ?? 0.2);
    const freshnessWeight = this.freshnessScore(freshness.freshnessStatus);
    const relevanceScore = clamp(source.relevanceScore ?? 0.7);
    const specificityScore = clamp(source.specificityScore ?? 0.65);
    const consistencyScore = clamp(source.consistencyScore ?? 0.8);

    const baseScore =
      authorityWeight * (weights.authority ? weights.authority.weight : 0.35) +
      freshnessWeight * (weights.freshness ? weights.freshness.weight : 0.25) +
      relevanceScore * (weights.relevance ? weights.relevance.weight : 0.2) +
      specificityScore * (weights.specificity ? weights.specificity.weight : 0.1) +
      consistencyScore * (weights.consistency ? weights.consistency.weight : 0.1);

    const adjusted = this.applyAdjustments(baseScore, source, freshness, conflict);
    const sensitivityRule = this.rules.claimSensitivityMultipliers
      ? this.rules.claimSensitivityMultipliers[claimSensitivity]
      : null;

    const minimumEvidenceScore = sensitivityRule && typeof sensitivityRule.minimumEvidenceScore === "number"
      ? sensitivityRule.minimumEvidenceScore
      : 0.6;

    const citationRequired = Boolean(
      source.citationRequired ||
      (sensitivityRule && sensitivityRule.citationRequired)
    );

    return {
      ...source,
      freshnessStatus: freshness.freshnessStatus || "unknown_freshness",
      freshnessRequired: Boolean(freshness.freshnessRequired),
      sourceAgeDays: freshness.sourceAgeDays ?? null,

      relevanceScore,
      specificityScore,
      consistencyScore,
      evidenceScore: adjusted.score,
      evidenceBand: band(adjusted.score),
      meetsMinimumEvidence: adjusted.score >= minimumEvidenceScore,
      minimumEvidenceScore,
      citationRequired,
      confidenceImpact: adjusted.score >= minimumEvidenceScore ? "neutral" : "decrease",
      weightingAdjustments: adjusted.adjustments
    };
  }

  aggregate(scoredSources = []) {
    if (!Array.isArray(scoredSources) || scoredSources.length === 0) {
      return {
        aggregateEvidenceScore: 0,
        evidenceBand: "insufficient"
      };
    }

    const sorted = scoredSources
      .slice()
      .sort((a, b) => (b.evidenceScore || 0) - (a.evidenceScore || 0));

    const topThree = sorted.slice(0, 3);
    const average = topThree.reduce((sum, source) => sum + (source.evidenceScore || 0), 0) / topThree.length;

    return {
      aggregateEvidenceScore: round(clamp(average), 3),
      evidenceBand: band(average)
    };
  }
}

module.exports = {
  FinanceSourceWeightingEngine
};
