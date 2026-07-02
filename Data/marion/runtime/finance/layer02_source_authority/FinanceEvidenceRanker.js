"use strict";

/**
 * R18D Layer 02 — Finance Evidence Ranker
 * Scores and ranks finance evidence using source authority, freshness, and conflicts.
 *
 * No external dependencies.
 */

const { FinanceSourceWeightingEngine } = require("./FinanceSourceWeightingEngine");
const { FinanceSourceFreshnessEvaluator } = require("./FinanceSourceFreshnessEvaluator");
const { FinanceConflictingSourceResolver } = require("./FinanceConflictingSourceResolver");

function uniqueArray(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

class FinanceEvidenceRanker {
  constructor(options = {}) {
    this.freshnessEvaluator = options.freshnessEvaluator || new FinanceSourceFreshnessEvaluator({
      packDir: options.packDir,
      now: options.now
    });

    this.weightingEngine = options.weightingEngine || new FinanceSourceWeightingEngine({
      packDir: options.packDir
    });

    this.conflictResolver = options.conflictResolver || new FinanceConflictingSourceResolver({
      packDir: options.packDir
    });
  }

  getLoadStatus() {
    return {
      freshness: this.freshnessEvaluator.getLoadStatus(),
      weighting: this.weightingEngine.getLoadStatus(),
      conflicts: this.conflictResolver.getLoadStatus()
    };
  }

  rank(input = {}) {
    const {
      sources = [],
      intentContext = {},
      claim = "",
      claimType = "unknown",
      claimSensitivity = "business_decision_support",
      queryText = ""
    } = input;

    if (!Array.isArray(sources) || sources.length === 0) {
      return {
        rankedSources: [],
        aggregateEvidenceScore: 0,
        evidenceBand: "insufficient",
        conflict: this.conflictResolver.detect([], intentContext),
        citationRequired: false,
        freshnessRequired: false,
        missingEvidence: ["sources"],
        notes: ["No finance sources were provided for ranking."]
      };
    }

    const freshnessResults = sources.map((source) => {
      return this.freshnessEvaluator.evaluate({
        sourceDate: source.sourceDate,
        claimType: source.claimType || claimType,
        intentId: intentContext.primaryIntent || intentContext.intentId || "unknown",
        sourceType: source.sourceType || "unknown",
        queryText,
        currentRequired: Boolean(intentContext.requiresFreshData)
      });
    });

    const preConflictScored = sources.map((source, index) => {
      return this.weightingEngine.evaluateSource({
        source,
        freshness: freshnessResults[index],
        conflict: { conflictDetected: false, confidenceImpact: "neutral" },
        claimSensitivity
      });
    });

    const conflict = this.conflictResolver.detect(preConflictScored, {
      ...intentContext,
      claim,
      claimType,
      claimSensitivity
    });

    const finalScored = sources.map((source, index) => {
      return this.weightingEngine.evaluateSource({
        source,
        freshness: freshnessResults[index],
        conflict,
        claimSensitivity
      });
    });

    const rankedSources = finalScored
      .slice()
      .sort((a, b) => {
        if ((b.evidenceScore || 0) !== (a.evidenceScore || 0)) {
          return (b.evidenceScore || 0) - (a.evidenceScore || 0);
        }
        return (b.authorityWeight || 0) - (a.authorityWeight || 0);
      });

    const aggregate = this.weightingEngine.aggregate(rankedSources);

    const citationRequired = rankedSources.some((source) => source.citationRequired);
    const freshnessRequired = freshnessResults.some((freshness) => freshness.freshnessRequired);

    const missingEvidence = [];

    if (aggregate.aggregateEvidenceScore < 0.4) {
      missingEvidence.push("stronger_authoritative_source");
    }

    if (freshnessRequired && freshnessResults.some((freshness) => freshness.freshnessStatus !== "current")) {
      missingEvidence.push("current_source");
    }

    if (conflict.confidenceImpact === "block") {
      missingEvidence.push("conflict_resolution");
    }

    return {
      rankedSources,
      aggregateEvidenceScore: aggregate.aggregateEvidenceScore,
      evidenceBand: aggregate.evidenceBand,
      conflict,
      citationRequired,
      freshnessRequired,
      missingEvidence: uniqueArray(missingEvidence),
      notes: uniqueArray([
        conflict.conflictDetected ? "source_conflict_detected" : null,
        freshnessRequired ? "freshness_required" : null
      ])
    };
  }
}

module.exports = {
  FinanceEvidenceRanker
};
