"use strict";

/**
 * R18D Layer 06 — Finance Ratio Calculator
 * Executes ratio calculations only when required numeric inputs are available.
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

function uniqueArray(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
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

function metricPeriod(metric = {}) {
  return metric.period || metric.canonicalPeriod || metric.periodId || null;
}

function metricEntity(metric = {}) {
  return metric.entityId || metric.companyId || metric.company || metric.entity || null;
}

class FinanceRatioCalculator {
  calculate(input = {}) {
    const normalizedMetrics = safeArray(input.normalizedMetrics);
    const ratioMap = input.ratioMap || {};
    const candidates = safeArray(ratioMap.ratioCandidates);

    const calculatedRatios = candidates.map((candidate) => {
      return this.calculateCandidate(candidate, normalizedMetrics);
    });

    const directRatios = this.extractDirectRatios({
      directRatios: ratioMap.directlyProvidedRatios,
      normalizedMetrics
    });

    const executableRatios = calculatedRatios.filter((item) => item.executionStatus === "calculated");
    const partialRatios = calculatedRatios.filter((item) => item.executionStatus === "missing_values");

    return {
      ratioResults: {
        resultId: `fin_ratio_results_${Date.now().toString(36)}`,
        calculatedRatios,
        directRatios,
        executableRatios,
        partialRatios,
        unavailableRatios: calculatedRatios.filter((item) => item.executionStatus === "unavailable"),
        executionSummary: {
          calculatedCount: executableRatios.length,
          directRatioCount: directRatios.length,
          partialCount: partialRatios.length,
          unavailableCount: calculatedRatios.filter((item) => item.executionStatus === "unavailable").length
        }
      },
      diagnostics: {
        ok: executableRatios.length > 0 || directRatios.length > 0 || candidates.length === 0,
        warnings:
          candidates.length > 0 && executableRatios.length === 0 && directRatios.length === 0
            ? ["no_ratio_values_calculated"]
            : [],
        errors: [],
        candidateCount: candidates.length,
        calculatedCount: executableRatios.length
      }
    };
  }

  calculateCandidate(candidate = {}, normalizedMetrics = []) {
    const requiredMetrics = safeArray(candidate.requiredMetrics);
    const matched = requiredMetrics.map((name) => {
      return this.findBestMetric(normalizedMetrics, name);
    });

    const missingMetricValues = [];
    const values = {};

    requiredMetrics.forEach((name, index) => {
      const metric = matched[index];
      const value = metric ? toNumber(metric.value) : null;

      if (value === null) missingMetricValues.push(name);
      values[name] = value;
    });

    const ratioType = candidate.ratioType || "unknown_ratio";
    let resultValue = null;
    let unit = "ratio";
    let formulaUsed = candidate.formula || null;

    if (missingMetricValues.length === 0) {
      resultValue = this.compute(ratioType, values);
      if (["gross_margin", "operating_margin", "net_margin", "fcf_margin"].includes(ratioType)) {
        unit = "percent";
        resultValue = resultValue === null ? null : resultValue * 100;
      }
    }

    let executionStatus = "missing_values";
    if (requiredMetrics.length === 0) executionStatus = "unavailable";
    if (missingMetricValues.length === 0 && resultValue !== null) executionStatus = "calculated";

    return {
      ratioExecutionId: `fin_ratio_exec_${stableSlug(ratioType)}`,
      ratioType,
      formula: formulaUsed,
      requiredMetrics,
      sourceMetricIds: uniqueArray(matched.filter(Boolean).map((metric) => metric.normalizedMetricId || metric.metricId)),
      value: round(resultValue, 4),
      unit,
      missingMetricValues,
      executionStatus,
      confidence:
        executionStatus === "calculated"
          ? 0.86
          : executionStatus === "missing_values"
            ? 0.52
            : 0.35,
      notes: uniqueArray([
        executionStatus === "calculated" ? "ratio_calculated_from_normalized_metrics" : null,
        missingMetricValues.length > 0 ? "ratio_inputs_missing_values" : null
      ])
    };
  }

  compute(ratioType, values = {}) {
    const safeDivide = (numerator, denominator) => {
      if (denominator === 0 || denominator === null || denominator === undefined) return null;
      if (numerator === null || numerator === undefined) return null;
      return numerator / denominator;
    };

    switch (ratioType) {
      case "gross_margin":
        return safeDivide(values.gross_profit, values.revenue);
      case "operating_margin":
        return safeDivide(values.operating_income, values.revenue);
      case "net_margin":
        return safeDivide(values.net_income, values.revenue);
      case "fcf_margin":
        return safeDivide(values.free_cash_flow, values.revenue);
      case "debt_to_equity":
        return safeDivide(values.total_debt, values.shareholders_equity);
      case "debt_to_assets":
        return safeDivide(values.total_debt, values.total_assets);
      case "asset_liability_coverage":
        return safeDivide(values.total_assets, values.total_liabilities);
      case "cash_to_debt":
        return safeDivide(values.cash_and_equivalents, values.total_debt);
      case "valuation_pe_ratio":
        return safeDivide(values.market_price, values.eps);
      default:
        return null;
    }
  }

  findBestMetric(metrics = [], canonicalMetric) {
    const matches = safeArray(metrics).filter((metric) => metricName(metric) === canonicalMetric);
    if (matches.length === 0) return null;

    const withValue = matches.find((metric) => toNumber(metric.value) !== null);
    return withValue || matches[0];
  }

  extractDirectRatios(input = {}) {
    const directRatioTypes = new Set([
      "gross_margin",
      "operating_margin",
      "ebitda_margin",
      "price_earnings_ratio"
    ]);

    const fromMap = safeArray(input.directRatios).map((item) => ({
      ratioExecutionId: `fin_ratio_direct_exec_${stableSlug(item.ratioType)}`,
      ratioType: item.ratioType,
      value: toNumber(item.value),
      unit: item.unit || null,
      sourceMetricId: item.sourceMetricId || null,
      executionStatus:
        toNumber(item.value) !== null ? "direct_ratio_value_available" : "direct_ratio_value_missing",
      confidence: item.confidence ?? 0.7
    }));

    const fromMetrics = safeArray(input.normalizedMetrics)
      .filter((metric) => directRatioTypes.has(metricName(metric)))
      .map((metric) => ({
        ratioExecutionId: `fin_ratio_direct_exec_${stableSlug(metricName(metric))}`,
        ratioType: metricName(metric),
        value: toNumber(metric.value),
        unit: metric.unit || null,
        sourceMetricId: metric.normalizedMetricId || metric.metricId || null,
        executionStatus:
          toNumber(metric.value) !== null ? "direct_ratio_value_available" : "direct_ratio_value_missing",
        confidence: metric.confidence ?? 0.7
      }));

    return [...fromMap, ...fromMetrics];
  }

  calculateRatios(input = {}) { return this.calculate(input); }
  process(input = {}) { return this.calculate(input); }
  execute(input = {}) { return this.calculate(input); }
  run(input = {}) { return this.calculate(input); }

  static calculate(input = {}, options = {}) {
    return new FinanceRatioCalculator(options).calculate(input);
  }
}

module.exports = {
  FinanceRatioCalculator
};
