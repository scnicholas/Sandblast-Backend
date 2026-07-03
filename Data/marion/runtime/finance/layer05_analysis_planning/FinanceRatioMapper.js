"use strict";

/**
 * R18D Layer 05 — Finance Ratio Mapper
 * Maps normalized metrics to possible ratio/calculation plans.
 * This layer identifies calculation readiness; it does not finalize calculations.
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

function metricNames(metrics = []) {
  return safeArray(metrics).map((item) => item.canonicalMetric || item.metric || item.originalMetric).filter(Boolean);
}

function metricByName(metrics = [], name) {
  return safeArray(metrics).find((metric) => {
    return (metric.canonicalMetric || metric.metric || metric.originalMetric) === name;
  }) || null;
}

const RATIO_RULES = [
  {
    ratioType: "gross_margin",
    formula: "gross_profit / revenue",
    requiredMetrics: ["gross_profit", "revenue"],
    usefulMetrics: ["gross_margin"],
    family: "profitability"
  },
  {
    ratioType: "operating_margin",
    formula: "operating_income / revenue",
    requiredMetrics: ["operating_income", "revenue"],
    usefulMetrics: ["operating_margin"],
    family: "profitability"
  },
  {
    ratioType: "net_margin",
    formula: "net_income / revenue",
    requiredMetrics: ["net_income", "revenue"],
    usefulMetrics: [],
    family: "profitability"
  },
  {
    ratioType: "fcf_margin",
    formula: "free_cash_flow / revenue",
    requiredMetrics: ["free_cash_flow", "revenue"],
    usefulMetrics: [],
    family: "cash_flow"
  },
  {
    ratioType: "debt_to_equity",
    formula: "total_debt / shareholders_equity",
    requiredMetrics: ["total_debt", "shareholders_equity"],
    usefulMetrics: [],
    family: "leverage"
  },
  {
    ratioType: "debt_to_assets",
    formula: "total_debt / total_assets",
    requiredMetrics: ["total_debt", "total_assets"],
    usefulMetrics: [],
    family: "leverage"
  },
  {
    ratioType: "asset_liability_coverage",
    formula: "total_assets / total_liabilities",
    requiredMetrics: ["total_assets", "total_liabilities"],
    usefulMetrics: [],
    family: "balance_sheet"
  },
  {
    ratioType: "cash_to_debt",
    formula: "cash_and_equivalents / total_debt",
    requiredMetrics: ["cash_and_equivalents", "total_debt"],
    usefulMetrics: [],
    family: "liquidity"
  },
  {
    ratioType: "valuation_pe_ratio",
    formula: "market_price / eps",
    requiredMetrics: ["eps"],
    usefulMetrics: ["price_earnings_ratio"],
    family: "valuation"
  }
];

class FinanceRatioMapper {
  map(input = {}) {
    const normalizedMetrics = safeArray(input.normalizedMetrics);
    const names = metricNames(normalizedMetrics);
    const ratioCandidates = RATIO_RULES.map((rule) => this.mapRule(rule, normalizedMetrics, names));

    const directlyProvidedRatios = this.detectDirectRatios(normalizedMetrics);
    const ratioMap = {
      mapId: `fin_ratio_map_${Date.now().toString(36)}`,
      route: input.analysisPlan && input.analysisPlan.primaryRoute ? input.analysisPlan.primaryRoute : null,
      ratioCandidates,
      directlyProvidedRatios,
      calculableRatios: ratioCandidates.filter((ratio) => ratio.calculationStatus === "calculable"),
      partiallyAvailableRatios: ratioCandidates.filter((ratio) => ratio.calculationStatus === "partial"),
      unavailableRatios: ratioCandidates.filter((ratio) => ratio.calculationStatus === "missing_required_metrics")
    };

    return {
      ratioMap,
      diagnostics: {
        ok: true,
        warnings:
          ratioMap.calculableRatios.length === 0 && ratioMap.directlyProvidedRatios.length === 0
            ? ["no_calculable_ratios_detected"]
            : [],
        errors: [],
        candidateCount: ratioCandidates.length,
        calculableCount: ratioMap.calculableRatios.length
      }
    };
  }

  mapRule(rule, normalizedMetrics = [], names = []) {
    const presentRequired = rule.requiredMetrics.filter((name) => names.includes(name));
    const missingRequired = rule.requiredMetrics.filter((name) => !names.includes(name));
    const directMetric = rule.usefulMetrics.find((name) => names.includes(name));

    let status = "missing_required_metrics";

    if (missingRequired.length === 0) {
      status = "calculable";
    } else if (presentRequired.length > 0 || directMetric) {
      status = "partial";
    }

    return {
      ratioId: `fin_ratio_${stableSlug(rule.ratioType)}`,
      ratioType: rule.ratioType,
      family: rule.family,
      formula: rule.formula,
      requiredMetrics: rule.requiredMetrics,
      presentMetrics: presentRequired,
      missingMetrics: missingRequired,
      directMetricAvailable: directMetric || null,
      sourceMetricIds: uniqueArray(
        rule.requiredMetrics
          .map((name) => metricByName(normalizedMetrics, name))
          .filter(Boolean)
          .map((metric) => metric.normalizedMetricId || metric.metricId)
      ),
      calculationStatus: status,
      confidence: status === "calculable" ? 0.86 : status === "partial" ? 0.62 : 0.35
    };
  }

  detectDirectRatios(normalizedMetrics = []) {
    const directRatioMetrics = new Set([
      "gross_margin",
      "operating_margin",
      "ebitda_margin",
      "price_earnings_ratio"
    ]);

    return safeArray(normalizedMetrics)
      .filter((metric) => directRatioMetrics.has(metric.canonicalMetric))
      .map((metric) => ({
        ratioId: `fin_ratio_direct_${stableSlug(metric.canonicalMetric)}`,
        ratioType: metric.canonicalMetric,
        family: metric.statementFamily || "direct_ratio",
        sourceMetricId: metric.normalizedMetricId || metric.metricId || null,
        value: metric.value ?? null,
        unit: metric.unit || null,
        calculationStatus: metric.value !== null && metric.value !== undefined ? "direct_value_available" : "direct_metric_without_value",
        confidence: metric.confidence ?? 0.7
      }));
  }

  mapRatios(input = {}) { return this.map(input); }
  process(input = {}) { return this.map(input); }
  execute(input = {}) { return this.map(input); }
  run(input = {}) { return this.map(input); }

  static map(input = {}, options = {}) {
    return new FinanceRatioMapper(options).map(input);
  }
}

module.exports = {
  FinanceRatioMapper
};
