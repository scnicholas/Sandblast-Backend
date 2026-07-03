"use strict";

/**
 * R18D Layer 05 — Finance Scenario Analyzer
 * Frames scenario/stress-analysis requirements from normalized finance inputs.
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

function includesAny(text = "", terms = []) {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

function metricNames(metrics = []) {
  return safeArray(metrics).map((item) => item.canonicalMetric || item.metric || item.originalMetric).filter(Boolean);
}

class FinanceScenarioAnalyzer {
  frame(input = {}) {
    const queryText = input.queryText || "";
    const analysisPlan = input.analysisPlan || {};
    const normalizedMetrics = safeArray(input.normalizedMetrics);
    const claimTargets = safeArray(input.claimTargets);
    const assumptions = safeArray(input.assumptions);
    const missingInputs = safeArray(input.missingInputs);

    const scenarioTypes = this.detectScenarioTypes({
      queryText,
      analysisPlan,
      claimTargets,
      normalizedMetrics
    });

    const metrics = metricNames(normalizedMetrics);
    const scenarioInputs = this.mapScenarioInputs(metrics, missingInputs);
    const scenarioAssumptions = this.mapAssumptions(assumptions);

    const scenarioFrame = {
      frameId: `fin_scenario_frame_${Date.now().toString(36)}`,
      scenarioRequired: scenarioTypes.length > 0,
      scenarioTypes,
      primaryScenarioType: scenarioTypes[0] || null,
      scenarioInputs,
      scenarioAssumptions,
      sensitivityAxes: this.buildSensitivityAxes(scenarioTypes, metrics),
      missingScenarioInputs: scenarioInputs.filter((item) => item.status === "missing"),
      readinessStatus:
        scenarioTypes.length === 0
          ? "scenario_not_required"
          : scenarioInputs.some((item) => item.required && item.status === "missing")
            ? "needs_scenario_inputs"
            : "scenario_ready"
    };

    return {
      scenarioFrame,
      diagnostics: {
        ok: scenarioFrame.readinessStatus !== "needs_scenario_inputs",
        warnings: scenarioFrame.readinessStatus === "needs_scenario_inputs" ? ["scenario_inputs_missing"] : [],
        errors: [],
        scenarioCount: scenarioTypes.length
      }
    };
  }

  detectScenarioTypes(input = {}) {
    const queryText = input.queryText || "";
    const analysisPlan = input.analysisPlan || {};
    const claimTargets = safeArray(input.claimTargets);
    const metrics = metricNames(input.normalizedMetrics);

    const scenarioTypes = [];

    if (
      analysisPlan.primaryRoute === "business_survival_scenario" ||
      claimTargets.some((target) => target.targetType === "business_survival_under_revenue_shock") ||
      includesAny(queryText, ["survive", "survival", "runway", "cash pressure"])
    ) {
      scenarioTypes.push("cash_runway_survival");
    }

    if (includesAny(queryText, ["revenue drop", "revenue drops", "sales decline", "income drop", "shock"])) {
      scenarioTypes.push("revenue_shock");
    }

    if (includesAny(queryText, ["cost increase", "costs rise", "margin compression", "inflation"])) {
      scenarioTypes.push("cost_pressure");
    }

    if (includesAny(queryText, ["interest rate", "rate increase", "debt service", "repayment"])) {
      scenarioTypes.push("rate_or_debt_service_sensitivity");
    }

    if (metrics.includes("free_cash_flow") || metrics.includes("cash_and_equivalents")) {
      if (includesAny(queryText, ["stress", "runway", "cash flow", "survive"])) {
        scenarioTypes.push("cash_flow_stress");
      }
    }

    return Array.from(new Set(scenarioTypes));
  }

  mapScenarioInputs(metrics = [], missingInputs = []) {
    const missingNames = new Set(safeArray(missingInputs).map((item) => item.missingInput || item.input || item.key));

    const required = [
      { input: "cash_on_hand", metricAliases: ["cash_and_equivalents"], required: true },
      { input: "monthly_revenue", metricAliases: ["revenue"], required: false },
      { input: "monthly_burn", metricAliases: ["monthly_burn"], required: true },
      { input: "scenario_period", metricAliases: ["claim_period"], required: false },
      { input: "revenue_decline", metricAliases: ["revenue_decline"], required: false }
    ];

    return required.map((item) => {
      const presentByMetric = item.metricAliases.some((metric) => metrics.includes(metric));
      const explicitlyMissing = missingNames.has(item.input);

      return {
        input: item.input,
        required: item.required,
        metricAliases: item.metricAliases,
        status: presentByMetric ? "available" : explicitlyMissing ? "missing" : "not_detected",
        confidence: presentByMetric ? 0.82 : explicitlyMissing ? 0.45 : 0.52
      };
    });
  }

  mapAssumptions(assumptions = []) {
    return safeArray(assumptions).map((assumption, index) => ({
      assumptionId: assumption.assumptionId || `fin_scenario_assumption_${index + 1}`,
      statement: assumption.statement || String(assumption),
      requiresConfirmation: Boolean(assumption.requiresConfirmation),
      confidence: assumption.confidence ?? 0.6,
      scenarioRole: "scenario_driver"
    }));
  }

  buildSensitivityAxes(scenarioTypes = [], metrics = []) {
    const axes = [];

    if (scenarioTypes.includes("revenue_shock")) {
      axes.push({
        axis: "revenue_change",
        direction: "downside",
        exampleRange: ["-10%", "-25%", "-50%"]
      });
    }

    if (scenarioTypes.includes("cost_pressure")) {
      axes.push({
        axis: "cost_change",
        direction: "upside_pressure",
        exampleRange: ["+10%", "+20%", "+35%"]
      });
    }

    if (scenarioTypes.includes("rate_or_debt_service_sensitivity")) {
      axes.push({
        axis: "interest_rate_change",
        direction: "upside_pressure",
        exampleRange: ["+100 bps", "+200 bps", "+300 bps"]
      });
    }

    if (scenarioTypes.includes("cash_runway_survival") || metrics.includes("cash_and_equivalents")) {
      axes.push({
        axis: "runway_duration",
        direction: "survival_window",
        exampleRange: ["3 months", "6 months", "12 months"]
      });
    }

    return axes;
  }

  analyze(input = {}) { return this.frame(input); }
  process(input = {}) { return this.frame(input); }
  execute(input = {}) { return this.frame(input); }
  run(input = {}) { return this.frame(input); }

  static frame(input = {}, options = {}) {
    return new FinanceScenarioAnalyzer(options).frame(input);
  }
}

module.exports = {
  FinanceScenarioAnalyzer
};
