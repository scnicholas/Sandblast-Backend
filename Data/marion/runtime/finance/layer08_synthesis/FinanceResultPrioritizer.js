"use strict";

/**
 * R18D Layer 08 — Finance Result Prioritizer
 * Selects and orders evidence-bound finance results for answer preparation.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function stableSlug(value) {
  const slug = normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "unknown";
}

function uniqueBy(items = [], keyFn) {
  const seen = new Set();
  const output = [];

  safeArray(items).filter(Boolean).forEach((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });

  return output;
}

class FinanceResultPrioritizer {
  prioritize(input = {}) {
    const boundResults = this.getBoundResults(input);
    const supportByResultId = this.buildSupportIndex(input.resultSupportScores);
    const enriched = boundResults.map((result) => this.enrichResult(result, supportByResultId, input));

    const prioritizedResults = enriched
      .filter((result) => result.presentationStatus !== "exclude_unsupported")
      .sort((a, b) => b.priorityScore - a.priorityScore);

    const resultGroups = this.groupResults(prioritizedResults);

    return {
      prioritizedResults,
      resultGroups,
      diagnostics: {
        ok: prioritizedResults.length > 0 || boundResults.length === 0,
        warnings:
          boundResults.length > 0 && prioritizedResults.length === 0
            ? ["all_results_excluded_from_synthesis"]
            : [],
        errors: [],
        inputResultCount: boundResults.length,
        prioritizedCount: prioritizedResults.length
      }
    };
  }

  getBoundResults(input = {}) {
    const fromEvidence = safeArray(
      input.boundEvidence && input.boundEvidence.evidenceBoundResults
    );

    if (fromEvidence.length > 0) return fromEvidence;

    return safeArray(input.evidenceBoundResults);
  }

  buildSupportIndex(resultSupportScores = []) {
    const map = new Map();

    safeArray(resultSupportScores).forEach((score) => {
      if (score.resultId) map.set(score.resultId, score);
    });

    return map;
  }

  enrichResult(boundResult = {}, supportByResultId = new Map(), input = {}) {
    const support = supportByResultId.get(boundResult.resultId) || {};
    const supportStatus = support.supportStatus || "unknown_support";
    const supportScore = typeof support.supportScore === "number" ? support.supportScore : 0;

    const routeWeight = this.routeWeight(boundResult, input.analysisPlan);
    const resultTypeWeight = this.resultTypeWeight(boundResult.resultType);
    const supportWeight = this.supportWeight(supportStatus);
    const executionWeight = this.executionWeight(boundResult.executionStatus);

    const priorityScore = Math.max(
      0,
      Math.min(
        1,
        Math.round((supportWeight + resultTypeWeight + routeWeight + executionWeight) * 1000) / 1000
      )
    );

    return {
      synthesisResultId: `fin_synth_result_${stableSlug(boundResult.resultType)}_${stableSlug(boundResult.resultName)}_${stableSlug(boundResult.resultId)}`,
      resultId: boundResult.resultId,
      resultType: boundResult.resultType,
      resultName: boundResult.resultName,
      executionStatus: boundResult.executionStatus,
      value: boundResult.value ?? null,
      unit: boundResult.unit || null,
      linkedMetricIds: safeArray(boundResult.linkedMetricIds),
      linkedSources: safeArray(boundResult.linkedSources),
      attachedRequirements: safeArray(boundResult.attachedRequirements),
      bindingStatus: boundResult.bindingStatus,
      supportStatus,
      supportScore,
      priorityScore,
      shouldCaveat: Boolean(support.shouldCaveat || boundResult.requiresVerification),
      canUseInFinalSynthesis:
        support.canUseInFinalSynthesis !== false &&
        supportStatus !== "unsupported" &&
        supportStatus !== "blocked_pending_evidence" &&
        boundResult.bindingStatus !== "unsupported" &&
        boundResult.bindingStatus !== "blocked_pending_evidence",
      presentationStatus: this.presentationStatus(boundResult, supportStatus),
      summaryLabel: this.summaryLabel(boundResult),
      payload: boundResult
    };
  }

  routeWeight(boundResult = {}, analysisPlan = {}) {
    const primary = analysisPlan.primaryRoute || "";
    const secondary = safeArray(analysisPlan.secondaryRoutes);

    if (boundResult.resultType === "scenario" && primary === "business_survival_scenario") return 0.16;
    if (boundResult.resultType === "valuation" && primary === "valuation_analysis") return 0.16;
    if (boundResult.resultType === "trend" && (primary === "trend_comparison" || secondary.includes("trend_comparison"))) return 0.14;
    if (boundResult.resultType === "peer_comparison" && (primary === "peer_comparison" || secondary.includes("peer_comparison"))) return 0.14;
    if (boundResult.resultType === "ratio" && String(primary).includes("profitability")) return 0.12;

    return 0.06;
  }

  resultTypeWeight(resultType = "") {
    const weights = {
      ratio: 0.18,
      trend: 0.17,
      peer_comparison: 0.16,
      scenario: 0.18,
      valuation: 0.15,
      direct_ratio: 0.12
    };

    return weights[resultType] || 0.08;
  }

  supportWeight(status = "") {
    const weights = {
      strong_support: 0.4,
      adequate_support: 0.32,
      partial_support: 0.2,
      unsupported: 0,
      blocked_pending_evidence: 0
    };

    return weights[status] || 0.12;
  }

  executionWeight(status = "") {
    if (["calculated", "trend_calculated", "comparison_calculated", "direct_value_available", "direct_ratio_value_available"].includes(status)) {
      return 0.16;
    }

    if (["partial", "missing_values", "direct_metric_without_value"].includes(status)) {
      return 0.06;
    }

    return 0.02;
  }

  presentationStatus(boundResult = {}, supportStatus = "") {
    if (supportStatus === "blocked_pending_evidence" || boundResult.bindingStatus === "blocked_pending_evidence") {
      return "block_from_answer";
    }

    if (supportStatus === "unsupported" || boundResult.bindingStatus === "unsupported") {
      return "exclude_unsupported";
    }

    if (supportStatus === "partial_support" || boundResult.requiresVerification) {
      return "include_with_caveat";
    }

    return "include";
  }

  summaryLabel(boundResult = {}) {
    const name = boundResult.resultName || "finance_result";
    const type = boundResult.resultType || "result";

    return `${type}:${name}`;
  }

  groupResults(results = []) {
    const groups = {
      keyFindings: [],
      calculations: [],
      trends: [],
      comparisons: [],
      scenarios: [],
      valuations: [],
      caveated: [],
      blocked: []
    };

    safeArray(results).forEach((result) => {
      if (result.presentationStatus === "block_from_answer") groups.blocked.push(result);
      if (result.shouldCaveat || result.presentationStatus === "include_with_caveat") groups.caveated.push(result);

      if (result.resultType === "ratio" || result.resultType === "direct_ratio") groups.calculations.push(result);
      if (result.resultType === "trend") groups.trends.push(result);
      if (result.resultType === "peer_comparison") groups.comparisons.push(result);
      if (result.resultType === "scenario") groups.scenarios.push(result);
      if (result.resultType === "valuation") groups.valuations.push(result);

      if (result.priorityScore >= 0.55) groups.keyFindings.push(result);
    });

    groups.keyFindings = uniqueBy(groups.keyFindings, (item) => item.synthesisResultId);

    return groups;
  }

  prioritizeResults(input = {}) { return this.prioritize(input); }
  process(input = {}) { return this.prioritize(input); }
  execute(input = {}) { return this.prioritize(input); }
  run(input = {}) { return this.prioritize(input); }

  static prioritize(input = {}, options = {}) {
    return new FinanceResultPrioritizer(options).prioritize(input);
  }
}

module.exports = {
  FinanceResultPrioritizer
};
