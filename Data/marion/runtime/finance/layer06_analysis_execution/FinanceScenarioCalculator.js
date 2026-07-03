"use strict";

/**
 * R18D Layer 06 — Finance Scenario Calculator
 * Executes basic scenario/runway/stress calculations when numeric assumptions exist.
 *
 * R18D lineage + null-safety patch:
 * - Anchors revenue-shock calculations to revenue_decline entity + period.
 * - Prefers same entity + same period, then same entity + latest period.
 * - Prevents FY2023 revenue from being used for a FY2024 decline scenario.
 * - Hardens helper functions against null metric objects.
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
  const item = metric || {};
  return item.canonicalMetric || item.metric || item.originalMetric || null;
}

function metricEntity(metric = {}) {
  const item = metric || {};
  return item.entityId || item.companyId || item.company || item.entity || item.entityName || null;
}

function metricPeriod(metric = {}) {
  const item = metric || {};
  return item.period || item.canonicalPeriod || item.periodId || null;
}

function sameNormalized(left, right) {
  if (!left || !right) return false;
  return normalizeText(left) === normalizeText(right);
}

function sortPeriodKey(value) {
  const text = String(value || "").toUpperCase();

  const fy = text.match(/FY\s?((?:20|19)\d{2})/);
  if (fy) return Number(fy[1]) * 10;

  const q = text.match(/Q([1-4])\s?((?:20|19)\d{2})/);
  if (q) return Number(q[2]) * 10 + Number(q[1]);

  const year = text.match(/(?:20|19)\d{2}/);
  if (year) return Number(year[0]) * 10;

  if (text === "TTM") return 999999;

  return 0;
}

class FinanceScenarioCalculator {
  calculate(input = {}) {
    const scenarioFrame = input.scenarioFrame || {};
    const normalizedMetrics = safeArray(input.normalizedMetrics);
    const scenarioRequired = Boolean(scenarioFrame.scenarioRequired);

    const scenarioOutputs = [];

    scenarioOutputs.push(this.calculateCashRunway(normalizedMetrics));
    scenarioOutputs.push(this.calculateRevenueShock(normalizedMetrics, scenarioFrame));
    scenarioOutputs.push(this.calculateDebtServicePressure(normalizedMetrics));

    const filtered = scenarioOutputs.filter(Boolean);
    const executable = filtered.filter((item) => item.executionStatus === "calculated");
    const partial = filtered.filter((item) => item.executionStatus !== "calculated");

    return {
      scenarioResults: {
        resultId: `fin_scenario_results_${Date.now().toString(36)}`,
        scenarioRequired,
        scenarioTypes: safeArray(scenarioFrame.scenarioTypes),
        scenarioOutputs: filtered,
        executableScenarios: executable,
        partialScenarios: partial,
        assumptionTrace: safeArray(input.assumptions).map((assumption) => ({
          assumptionId: assumption.assumptionId || null,
          statement: assumption.statement || String(assumption),
          requiresConfirmation: Boolean(assumption.requiresConfirmation)
        })),
        executionSummary: {
          scenarioOutputCount: filtered.length,
          calculatedCount: executable.length,
          partialCount: partial.length
        }
      },
      diagnostics: {
        ok: executable.length > 0 || !scenarioRequired,
        warnings:
          scenarioRequired && executable.length === 0
            ? ["scenario_required_but_no_scenario_calculated"]
            : [],
        errors: [],
        scenarioOutputCount: filtered.length
      }
    };
  }

  calculateCashRunway(metrics = []) {
    const cashMetric = this.findMetric(metrics, ["cash_and_equivalents", "cash_on_hand", "cash"], { preferLatest: true });
    const burnMetric = this.findMetric(metrics, ["monthly_burn", "monthly_fixed_costs"], {
      preferredEntity: metricEntity(cashMetric),
      preferredPeriod: metricPeriod(cashMetric),
      preferLatest: true
    });

    const cash = this.metricNumericValue(cashMetric);
    const burn = this.metricNumericValue(burnMetric);

    if (cash === null && burn === null) {
      return {
        scenarioId: "fin_scenario_cash_runway",
        scenarioType: "cash_runway",
        value: null,
        unit: "months",
        missingInputs: ["cash_on_hand", "monthly_burn"],
        executionStatus: "missing_required_inputs",
        confidence: 0.35
      };
    }

    if (cash === null || burn === null || burn <= 0) {
      return {
        scenarioId: "fin_scenario_cash_runway",
        scenarioType: "cash_runway",
        value: null,
        unit: "months",
        missingInputs: [
          cash === null ? "cash_on_hand" : null,
          burn === null || burn <= 0 ? "monthly_burn" : null
        ].filter(Boolean),
        executionStatus: "partial",
        lineageContext: {
          cashMetricId: cashMetric && (cashMetric.normalizedMetricId || cashMetric.metricId) || null,
          burnMetricId: burnMetric && (burnMetric.normalizedMetricId || burnMetric.metricId) || null,
          entityId: metricEntity(cashMetric) || metricEntity(burnMetric) || null,
          period: metricPeriod(cashMetric) || metricPeriod(burnMetric) || null
        },
        confidence: 0.52
      };
    }

    return {
      scenarioId: "fin_scenario_cash_runway",
      scenarioType: "cash_runway",
      value: round(cash / burn, 2),
      unit: "months",
      inputsUsed: {
        cashOnHand: cash,
        monthlyBurn: burn
      },
      lineageContext: {
        cashMetricId: cashMetric && (cashMetric.normalizedMetricId || cashMetric.metricId) || null,
        burnMetricId: burnMetric && (burnMetric.normalizedMetricId || burnMetric.metricId) || null,
        entityId: metricEntity(cashMetric) || metricEntity(burnMetric) || null,
        period: metricPeriod(cashMetric) || metricPeriod(burnMetric) || null,
        alignmentStatus: this.describeAlignment(cashMetric, burnMetric)
      },
      missingInputs: [],
      executionStatus: "calculated",
      confidence: 0.84
    };
  }

  calculateRevenueShock(metrics = [], scenarioFrame = {}) {
    const declineMetric = this.findMetric(metrics, ["revenue_decline"], { preferLatest: true });
    const anchorEntity = metricEntity(declineMetric);
    const anchorPeriod = metricPeriod(declineMetric);

    const revenueMetric = this.findMetric(metrics, ["monthly_revenue", "revenue"], {
      preferredEntity: anchorEntity,
      preferredPeriod: anchorPeriod,
      preferLatest: true
    });

    const burnMetric = this.findMetric(metrics, ["monthly_burn", "monthly_fixed_costs"], {
      preferredEntity: anchorEntity || metricEntity(revenueMetric),
      preferredPeriod: anchorPeriod || metricPeriod(revenueMetric),
      preferLatest: true
    });

    const cashMetric = this.findMetric(metrics, ["cash_and_equivalents", "cash_on_hand", "cash"], {
      preferredEntity: anchorEntity || metricEntity(revenueMetric),
      preferredPeriod: anchorPeriod || metricPeriod(revenueMetric),
      preferLatest: true
    });

    const monthlyRevenue = this.metricNumericValue(revenueMetric);
    const monthlyBurn = this.metricNumericValue(burnMetric);
    const cash = this.metricNumericValue(cashMetric);
    const decline = this.metricNumericValue(declineMetric);

    if (monthlyRevenue === null && decline === null) {
      return {
        scenarioId: "fin_scenario_revenue_shock",
        scenarioType: "revenue_shock",
        value: null,
        unit: null,
        missingInputs: ["monthly_revenue", "revenue_decline"],
        executionStatus: "missing_required_inputs",
        lineageContext: {
          anchorMetricId: null,
          entityId: null,
          period: null,
          alignmentStatus: "no_revenue_or_decline_anchor"
        },
        confidence: 0.35
      };
    }

    if (monthlyRevenue === null || decline === null) {
      return {
        scenarioId: "fin_scenario_revenue_shock",
        scenarioType: "revenue_shock",
        value: null,
        unit: null,
        missingInputs: [
          monthlyRevenue === null ? "monthly_revenue" : null,
          decline === null ? "revenue_decline" : null
        ].filter(Boolean),
        executionStatus: "partial",
        lineageContext: {
          revenueMetricId: revenueMetric && (revenueMetric.normalizedMetricId || revenueMetric.metricId) || null,
          declineMetricId: declineMetric && (declineMetric.normalizedMetricId || declineMetric.metricId) || null,
          entityId: anchorEntity || metricEntity(revenueMetric) || null,
          period: anchorPeriod || metricPeriod(revenueMetric) || null,
          alignmentStatus: this.describeAlignment(revenueMetric, declineMetric)
        },
        confidence: 0.52
      };
    }

    const declineRate = Math.abs(decline) > 1 ? Math.abs(decline) / 100 : Math.abs(decline);
    const revenueLoss = monthlyRevenue * declineRate;
    const stressedMonthlyBurn = monthlyBurn !== null ? monthlyBurn + revenueLoss : null;
    const stressedRunway = cash !== null && stressedMonthlyBurn && stressedMonthlyBurn > 0
      ? cash / stressedMonthlyBurn
      : null;

    return {
      scenarioId: "fin_scenario_revenue_shock",
      scenarioType: "revenue_shock",
      value: round(revenueLoss, 2),
      unit: "currency_per_month",
      inputsUsed: {
        monthlyRevenue,
        declineRate,
        monthlyBurn,
        cash
      },
      outputs: {
        estimatedMonthlyRevenueLoss: round(revenueLoss, 2),
        stressedMonthlyBurn: round(stressedMonthlyBurn, 2),
        stressedRunwayMonths: round(stressedRunway, 2)
      },
      lineageContext: {
        revenueMetricId: revenueMetric && (revenueMetric.normalizedMetricId || revenueMetric.metricId) || null,
        declineMetricId: declineMetric && (declineMetric.normalizedMetricId || declineMetric.metricId) || null,
        burnMetricId: burnMetric && (burnMetric.normalizedMetricId || burnMetric.metricId) || null,
        cashMetricId: cashMetric && (cashMetric.normalizedMetricId || cashMetric.metricId) || null,
        entityId: anchorEntity || metricEntity(revenueMetric) || null,
        period: anchorPeriod || metricPeriod(revenueMetric) || null,
        alignmentStatus: this.describeAlignment(revenueMetric, declineMetric)
      },
      missingInputs: [
        monthlyBurn === null ? "monthly_burn" : null,
        cash === null ? "cash_on_hand" : null
      ].filter(Boolean),
      executionStatus: "calculated",
      confidence: stressedRunway !== null ? 0.84 : 0.74
    };
  }

  calculateDebtServicePressure(metrics = []) {
    const debtServiceMetric = this.findMetric(metrics, ["debt_service"], { preferLatest: true });
    const debtEntity = metricEntity(debtServiceMetric);
    const debtPeriod = metricPeriod(debtServiceMetric);

    const revenueMetric = this.findMetric(metrics, ["monthly_revenue", "revenue"], {
      preferredEntity: debtEntity,
      preferredPeriod: debtPeriod,
      preferLatest: true
    });

    const cashMetric = this.findMetric(metrics, ["cash_and_equivalents", "cash_on_hand", "cash"], {
      preferredEntity: debtEntity || metricEntity(revenueMetric),
      preferredPeriod: debtPeriod || metricPeriod(revenueMetric),
      preferLatest: true
    });

    const debtService = this.metricNumericValue(debtServiceMetric);
    const revenue = this.metricNumericValue(revenueMetric);
    const cash = this.metricNumericValue(cashMetric);

    if (debtService === null) {
      return {
        scenarioId: "fin_scenario_debt_service_pressure",
        scenarioType: "debt_service_pressure",
        value: null,
        unit: null,
        missingInputs: ["debt_service"],
        executionStatus: "missing_required_inputs",
        confidence: 0.35
      };
    }

    const debtServiceRevenueBurden = revenue && revenue !== 0 ? debtService / revenue * 100 : null;
    const debtServiceCashCoverage = debtService && debtService !== 0 && cash !== null ? cash / debtService : null;

    return {
      scenarioId: "fin_scenario_debt_service_pressure",
      scenarioType: "debt_service_pressure",
      value: round(debtServiceRevenueBurden, 2),
      unit: "percent_of_revenue",
      outputs: {
        debtServiceRevenueBurden: round(debtServiceRevenueBurden, 2),
        debtServiceCashCoverageMonths: round(debtServiceCashCoverage, 2)
      },
      lineageContext: {
        debtServiceMetricId: debtServiceMetric && (debtServiceMetric.normalizedMetricId || debtServiceMetric.metricId) || null,
        revenueMetricId: revenueMetric && (revenueMetric.normalizedMetricId || revenueMetric.metricId) || null,
        cashMetricId: cashMetric && (cashMetric.normalizedMetricId || cashMetric.metricId) || null,
        entityId: debtEntity || metricEntity(revenueMetric) || metricEntity(cashMetric) || null,
        period: debtPeriod || metricPeriod(revenueMetric) || metricPeriod(cashMetric) || null
      },
      missingInputs: [
        revenue === null ? "monthly_revenue" : null,
        cash === null ? "cash_on_hand" : null
      ].filter(Boolean),
      executionStatus: debtServiceRevenueBurden !== null || debtServiceCashCoverage !== null ? "calculated" : "partial",
      confidence: 0.72
    };
  }

  findMetric(metrics = [], names = [], options = {}) {
    const candidates = safeArray(metrics).filter((item) => {
      return names.includes(metricName(item)) && toNumber(item && item.value) !== null;
    });

    if (candidates.length === 0) return null;

    const scored = candidates.map((metric, index) => {
      let score = 0;

      if (toNumber(metric.value) !== null) score += 100;
      if (options.preferredEntity && sameNormalized(metricEntity(metric), options.preferredEntity)) score += 35;
      if (options.preferredPeriod && sameNormalized(metricPeriod(metric), options.preferredPeriod)) score += 35;
      if (options.preferLatest) score += sortPeriodKey(metricPeriod(metric)) / 100000;
      score -= index * 0.001;

      return { metric, score };
    }).sort((a, b) => b.score - a.score);

    return scored[0].metric;
  }

  findMetricValue(metrics = [], names = [], options = {}) {
    const metric = this.findMetric(metrics, names, { ...options, preferLatest: options.preferLatest !== false });
    return this.metricNumericValue(metric);
  }

  metricNumericValue(metric) {
    if (!metric) return null;
    return toNumber(metric.value);
  }

  describeAlignment(left, right) {
    if (!left || !right) return "partial_alignment";

    const sameEntity = metricEntity(left) && metricEntity(right) && sameNormalized(metricEntity(left), metricEntity(right));
    const samePeriod = metricPeriod(left) && metricPeriod(right) && sameNormalized(metricPeriod(left), metricPeriod(right));

    if (sameEntity && samePeriod) return "entity_period_aligned";
    if (sameEntity) return "entity_aligned";
    if (samePeriod) return "period_aligned";
    return "not_aligned";
  }

  calculateScenarios(input = {}) { return this.calculate(input); }
  process(input = {}) { return this.calculate(input); }
  execute(input = {}) { return this.calculate(input); }
  run(input = {}) { return this.calculate(input); }

  static calculate(input = {}, options = {}) {
    return new FinanceScenarioCalculator(options).calculate(input);
  }
}

module.exports = {
  FinanceScenarioCalculator
};
