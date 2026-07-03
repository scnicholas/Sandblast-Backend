"use strict";

/**
 * R18D Layer 06 — Finance Valuation Analyzer
 * Executes valuation-readiness checks and simple valuation metrics when inputs exist.
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

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const parsed = Number(String(value).replace(/,/g, "").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, decimals = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function metricName(metric = {}) {
  return metric.canonicalMetric || metric.metric || metric.originalMetric || null;
}

class FinanceValuationAnalyzer {
  analyze(input = {}) {
    const normalizedMetrics = safeArray(input.normalizedMetrics);
    const analysisPlan = input.analysisPlan || {};
    const valuationRequired = this.valuationRequired(input);

    const valuationChecks = [
      this.analyzePERatio(normalizedMetrics),
      this.analyzeDirectValuationMultiple(normalizedMetrics)
    ].filter(Boolean);

    const executable = valuationChecks.filter((item) => item.executionStatus === "calculated" || item.executionStatus === "direct_value_available");
    const partial = valuationChecks.filter((item) => !["calculated", "direct_value_available"].includes(item.executionStatus));

    return {
      valuationResults: {
        resultId: `fin_valuation_results_${Date.now().toString(36)}`,
        valuationRequired,
        primaryRoute: analysisPlan.primaryRoute || null,
        valuationChecks,
        executableValuations: executable,
        partialValuations: partial,
        valuationReadiness: this.readiness({
          valuationRequired,
          executable,
          partial,
          evidenceRequirements: input.evidenceRequirements
        })
      },
      diagnostics: {
        ok: executable.length > 0 || !valuationRequired,
        warnings:
          valuationRequired && executable.length === 0
            ? ["valuation_requested_but_not_calculable"]
            : [],
        errors: [],
        valuationCheckCount: valuationChecks.length
      }
    };
  }

  valuationRequired(input = {}) {
    const plan = input.analysisPlan || {};
    const secondary = safeArray(plan.secondaryRoutes);

    return plan.primaryRoute === "valuation_analysis" ||
      secondary.includes("valuation_analysis") ||
      /\bvaluation|pe ratio|p\/e|multiple|market price\b/i.test(String(input.queryText || ""));
  }

  analyzePERatio(metrics = []) {
    const pe = this.findMetric(metrics, "price_earnings_ratio");
    if (pe) {
      return {
        valuationId: "fin_valuation_pe_ratio_direct",
        valuationType: "price_earnings_ratio",
        value: toNumber(pe.value),
        unit: pe.unit || "multiple",
        sourceMetricIds: [pe.normalizedMetricId || pe.metricId].filter(Boolean),
        missingInputs: toNumber(pe.value) === null ? ["price_earnings_ratio_value"] : [],
        executionStatus: toNumber(pe.value) === null ? "direct_metric_without_value" : "direct_value_available",
        confidence: pe.confidence ?? 0.76
      };
    }

    const eps = this.findMetric(metrics, "eps");
    const marketPrice = this.findMetric(metrics, "market_price");

    const epsValue = eps ? toNumber(eps.value) : null;
    const marketPriceValue = marketPrice ? toNumber(marketPrice.value) : null;

    if (epsValue !== null && marketPriceValue !== null && epsValue !== 0) {
      return {
        valuationId: "fin_valuation_pe_ratio_calculated",
        valuationType: "price_earnings_ratio",
        value: round(marketPriceValue / epsValue, 4),
        unit: "multiple",
        sourceMetricIds: [
          eps.normalizedMetricId || eps.metricId,
          marketPrice.normalizedMetricId || marketPrice.metricId
        ].filter(Boolean),
        missingInputs: [],
        executionStatus: "calculated",
        confidence: 0.82
      };
    }

    return {
      valuationId: "fin_valuation_pe_ratio_pending",
      valuationType: "price_earnings_ratio",
      value: null,
      unit: "multiple",
      sourceMetricIds: [
        eps && (eps.normalizedMetricId || eps.metricId),
        marketPrice && (marketPrice.normalizedMetricId || marketPrice.metricId)
      ].filter(Boolean),
      missingInputs: [
        epsValue === null ? "eps" : null,
        marketPriceValue === null ? "market_price" : null
      ].filter(Boolean),
      executionStatus: "missing_values",
      confidence: 0.45
    };
  }

  analyzeDirectValuationMultiple(metrics = []) {
    const knownMultiples = ["ev_to_ebitda", "price_to_sales", "price_to_book"];

    const direct = safeArray(metrics).find((metric) => knownMultiples.includes(metricName(metric)));

    if (!direct) return null;

    return {
      valuationId: `fin_valuation_${stableSlug(metricName(direct))}`,
      valuationType: metricName(direct),
      value: toNumber(direct.value),
      unit: direct.unit || "multiple",
      sourceMetricIds: [direct.normalizedMetricId || direct.metricId].filter(Boolean),
      missingInputs: toNumber(direct.value) === null ? [`${metricName(direct)}_value`] : [],
      executionStatus: toNumber(direct.value) === null ? "direct_metric_without_value" : "direct_value_available",
      confidence: direct.confidence ?? 0.72
    };
  }

  readiness(input = {}) {
    const requiredEvidence = safeArray(input.evidenceRequirements).filter((item) => item.priority === "required");

    if (!input.valuationRequired) {
      return {
        status: "valuation_not_required",
        blockingIssues: [],
        warnings: []
      };
    }

    if (input.executable.length > 0) {
      return {
        status: "valuation_executable",
        blockingIssues: requiredEvidence.filter((item) => item.blockingWithoutEvidence).map((item) => item.requirementCode),
        warnings: requiredEvidence.map((item) => `evidence_required:${item.requirementCode}`)
      };
    }

    return {
      status: "valuation_inputs_missing",
      blockingIssues: [],
      warnings: ["valuation_inputs_missing"]
    };
  }

  findMetric(metrics = [], canonicalMetric) {
    return safeArray(metrics).find((metric) => metricName(metric) === canonicalMetric) || null;
  }

  analyzeValuation(input = {}) { return this.analyze(input); }
  process(input = {}) { return this.analyze(input); }
  execute(input = {}) { return this.analyze(input); }
  run(input = {}) { return this.analyze(input); }

  static analyze(input = {}, options = {}) {
    return new FinanceValuationAnalyzer(options).analyze(input);
  }
}

module.exports = {
  FinanceValuationAnalyzer
};
