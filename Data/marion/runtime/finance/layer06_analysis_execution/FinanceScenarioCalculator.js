"use strict";

/**
 * R18D Layer 06 — Finance Scenario Calculator
 * Executes basic scenario/runway/stress calculations when numeric assumptions exist.
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
    const cash = this.findMetricValue(metrics, ["cash_and_equivalents", "cash_on_hand", "cash"]);
    const burn = this.findMetricValue(metrics, ["monthly_burn", "monthly_fixed_costs"]);

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
      missingInputs: [],
      executionStatus: "calculated",
      confidence: 0.84
    };
  }

  calculateRevenueShock(metrics = [], scenarioFrame = {}) {
    const monthlyRevenue = this.findMetricValue(metrics, ["monthly_revenue", "revenue"]);
    const monthlyBurn = this.findMetricValue(metrics, ["monthly_burn", "monthly_fixed_costs"]);
    const cash = this.findMetricValue(metrics, ["cash_and_equivalents", "cash_on_hand", "cash"]);
    const decline = this.findMetricValue(metrics, ["revenue_decline"]);

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
      confidence: stressedRunway !== null ? 0.82 : 0.72
    };
  }

  calculateDebtServicePressure(metrics = []) {
    const debtService = this.findMetricValue(metrics, ["debt_service"]);
    const revenue = this.findMetricValue(metrics, ["monthly_revenue", "revenue"]);
    const cash = this.findMetricValue(metrics, ["cash_and_equivalents", "cash_on_hand", "cash"]);

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
      missingInputs: [
        revenue === null ? "monthly_revenue" : null,
        cash === null ? "cash_on_hand" : null
      ].filter(Boolean),
      executionStatus: debtServiceRevenueBurden !== null || debtServiceCashCoverage !== null ? "calculated" : "partial",
      confidence: 0.72
    };
  }

  findMetricValue(metrics = [], names = []) {
    for (const name of names) {
      const metric = safeArray(metrics).find((item) => metricName(item) === name && toNumber(item.value) !== null);
      if (metric) return toNumber(metric.value);
    }

    return null;
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
