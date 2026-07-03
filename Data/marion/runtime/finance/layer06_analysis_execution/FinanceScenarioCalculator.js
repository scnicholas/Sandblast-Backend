"use strict";

/**
 * R18D Layer 06 — Finance Scenario Calculator
 * Executes basic scenario/runway/stress calculations when numeric assumptions exist.
 *
 * R18C lineage patch:
 * - Anchors revenue-shock calculations to the revenue_decline metric's entity + period.
 * - Prefers same entity + same period, then same entity + latest period, then latest numeric fallback.
 * - Adds reusable metric selection helpers for scenario-safe entity/period alignment.
 * - Preserves legacy method aliases and JSON-safe output shape.
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

function metricEntity(metric = {}) {
  return metric.entityId || metric.companyId || metric.company || metric.entity || metric.entityName || null;
}

function metricPeriod(metric = {}) {
  return metric.period || metric.canonicalPeriod || metric.periodId || null;
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
    const cashMetric = this.findMetric(metrics, ["cash_and_equivalents", "cash_on_hand", "cash"]);
    const burnMetric = this.findMetric(metrics, ["monthly_burn", "monthly_fixed_costs"], {
      preferredEntity: metricEntity(cashMetric),
      preferredPeriod: metricPeriod(cashMetric)
    });

    const cash = cashMetric ? toNumber(cashMetric.value) : null;
    const burn = burnMetric ? toNumber(burnMetric.value) : null;

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
        entityId: metricEntity(cashMetric) || metricEntity(burnMetric) || null,
        period: metricPeriod(cashMetric) || metricPeriod(burnMetric) || null,
        cashMetricId: cashMetric && (cashMetric.normalizedMetricId || cashMetric.metricId),
        burnMetricId: burnMetric && (burnMetric.normalizedMetricId || burnMetric.metricId)
      },
      missingInputs: [],
      executionStatus: "calculated",
      confidence: 0.84
    };
  }

  calculateRevenueShock(metrics = [], scenarioFrame = {}) {
    const declineMetric = this.findMetric(metrics, ["revenue_decline"]);
    const anchor = {
      preferredEntity: metricEntity(declineMetric),
      preferredPeriod: metricPeriod(declineMetric)
    };

    const revenueMetric = this.findMetric(metrics, ["monthly_revenue", "revenue"], anchor);
    const burnMetric = this.findMetric(metrics, ["monthly_burn", "monthly_fixed_costs"], anchor);
    const cashMetric = this.findMetric(metrics, ["cash_and_equivalents", "cash_on_hand", "cash"], anchor);

    const monthlyRevenue = revenueMetric ? toNumber(revenueMetric.value) : null;
    const monthlyBurn = burnMetric ? toNumber(burnMetric.value) : null;
    const cash = cashMetric ? toNumber(cashMetric.value) : null;
    const decline = declineMetric ? toNumber(declineMetric.value) : null;

    if (monthlyRevenue === null && decline === null) {
      return {
        scenarioId: "fin_scenario_revenue_shock",
        scenarioType: "revenue_shock",
        value: null,
        unit: null,
        missingInputs: ["monthly_revenue", "revenue_decline"],
        executionStatus: "missing_required_inputs",
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
      lineageContext: {
        anchorMetric: "revenue_decline",
        entityId: metricEntity(declineMetric) || metricEntity(revenueMetric) || null,
        period: metricPeriod(declineMetric) || metricPeriod(revenueMetric) || null,
        revenueMetricId: revenueMetric && (revenueMetric.normalizedMetricId || revenueMetric.metricId),
        declineMetricId: declineMetric && (declineMetric.normalizedMetricId || declineMetric.metricId),
        burnMetricId: burnMetric && (burnMetric.normalizedMetricId || burnMetric.metricId),
        cashMetricId: cashMetric && (cashMetric.normalizedMetricId || cashMetric.metricId),
        alignmentStatus: this.alignmentStatus(revenueMetric, declineMetric)
      },
      outputs: {
        estimatedMonthlyRevenueLoss: round(revenueLoss, 2),
        stressedMonthlyBurn: round(stressedMonthlyBurn, 2),
        stressedRunwayMonths: round(stressedRunway, 2)
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
    const debtServiceMetric = this.findMetric(metrics, ["debt_service"]);
    const anchor = {
      preferredEntity: metricEntity(debtServiceMetric),
      preferredPeriod: metricPeriod(debtServiceMetric)
    };

    const revenueMetric = this.findMetric(metrics, ["monthly_revenue", "revenue"], anchor);
    const cashMetric = this.findMetric(metrics, ["cash_and_equivalents", "cash_on_hand", "cash"], anchor);

    const debtService = debtServiceMetric ? toNumber(debtServiceMetric.value) : null;
    const revenue = revenueMetric ? toNumber(revenueMetric.value) : null;
    const cash = cashMetric ? toNumber(cashMetric.value) : null;

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
      lineageContext: {
        entityId: metricEntity(debtServiceMetric) || metricEntity(revenueMetric) || null,
        period: metricPeriod(debtServiceMetric) || metricPeriod(revenueMetric) || null,
        debtServiceMetricId: debtServiceMetric && (debtServiceMetric.normalizedMetricId || debtServiceMetric.metricId),
        revenueMetricId: revenueMetric && (revenueMetric.normalizedMetricId || revenueMetric.metricId),
        cashMetricId: cashMetric && (cashMetric.normalizedMetricId || cashMetric.metricId)
      },
      outputs: {
        debtServiceRevenueBurden: round(debtServiceRevenueBurden, 2),
        debtServiceCashCoverageMonths: round(debtServiceCashCoverage, 2)
      },
      missingInputs: [
        revenue === null ? "monthly_revenue" : null,
        cash === null ? "cash_on_hand" : null
      ].filter(Boolean),
      executionStatus: debtServiceRevenueBurden !== null || debtServiceCashCoverage !== null ? "calculated" : "partial",
      confidence: 0.72
    };
  }

  findMetricValue(metrics = [], names = [], preferences = {}) {
    const metric = this.findMetric(metrics, names, preferences);
    return metric ? toNumber(metric.value) : null;
  }

  findMetric(metrics = [], names = [], preferences = {}) {
    const candidates = safeArray(metrics).filter((item) => {
      return names.includes(metricName(item)) && toNumber(item.value) !== null;
    });

    if (candidates.length === 0) return null;

    const scored = candidates.map((metric, index) => {
      let score = 0;
      score += 100;

      if (preferences.preferredEntity && sameNormalized(metricEntity(metric), preferences.preferredEntity)) {
        score += 35;
      }

      if (preferences.preferredPeriod && sameNormalized(metricPeriod(metric), preferences.preferredPeriod)) {
        score += 35;
      }

      if (preferences.preferredEntity && metricEntity(metric) && !sameNormalized(metricEntity(metric), preferences.preferredEntity)) {
        score -= 18;
      }

      if (preferences.preferredPeriod && metricPeriod(metric) && !sameNormalized(metricPeriod(metric), preferences.preferredPeriod)) {
        score -= 8;
      }

      score += sortPeriodKey(metricPeriod(metric)) * 0.001;
      score -= index * 0.0001;

      return { metric, score };
    }).sort((a, b) => b.score - a.score);

    return scored[0].metric;
  }

  alignmentStatus(leftMetric = null, rightMetric = null) {
    if (!leftMetric || !rightMetric) return "partial_alignment";

    const leftEntity = metricEntity(leftMetric);
    const rightEntity = metricEntity(rightMetric);
    const leftPeriod = metricPeriod(leftMetric);
    const rightPeriod = metricPeriod(rightMetric);

    const entityAligned = leftEntity && rightEntity && sameNormalized(leftEntity, rightEntity);
    const periodAligned = leftPeriod && rightPeriod && sameNormalized(leftPeriod, rightPeriod);

    if (entityAligned && periodAligned) return "entity_period_aligned";
    if (entityAligned) return "entity_aligned";
    if (periodAligned) return "period_aligned";
    return "unscoped_or_fallback_alignment";
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
