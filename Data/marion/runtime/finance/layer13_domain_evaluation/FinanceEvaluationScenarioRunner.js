"use strict";

/**
 * R18D Layer 13 — Finance Evaluation Scenario Runner
 * Executes one evaluation scenario against the Layer 12 finance adapter.
 *
 * No external dependencies.
 */

let FinanceMarionDomainAdapter = null;

try {
  ({ FinanceMarionDomainAdapter } = require("../layer12_marion_nyx_bridge/FinanceMarionDomainAdapter"));
} catch (err) {
  FinanceMarionDomainAdapter = null;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

class FinanceEvaluationScenarioRunner {
  constructor(options = {}) {
    this.adapter =
      options.adapter ||
      options.financeAdapter ||
      (FinanceMarionDomainAdapter ? new FinanceMarionDomainAdapter(options) : null);

    this.adapterFactory = options.adapterFactory || null;
  }

  runScenario(input = {}) {
    const scenario = input.scenario || {};
    const startedAt = Date.now();

    try {
      const adapter = this.resolveAdapter(scenario, input);
      const scenarioInput = this.buildScenarioInput(scenario, input);

      if (!adapter || typeof adapter.adapt !== "function") {
        throw new Error("missing_layer12_finance_adapter");
      }

      const adapterEnvelope = adapter.adapt(scenarioInput);

      return {
        scenarioId: scenario.scenarioId || "unknown_scenario",
        category: scenario.category || "unknown_category",
        ok: true,
        adapterEnvelope,
        thrownError: null,
        durationMs: Date.now() - startedAt,
        routeStatus: adapterEnvelope && adapterEnvelope.routeStatus || null,
        bridgeReadinessStatus:
          adapterEnvelope &&
          adapterEnvelope.bridgeReadiness &&
          adapterEnvelope.bridgeReadiness.status ||
          null,
        diagnostics: {
          ok: true,
          warnings: [],
          errors: []
        }
      };
    } catch (err) {
      return {
        scenarioId: scenario.scenarioId || "unknown_scenario",
        category: scenario.category || "unknown_category",
        ok: false,
        adapterEnvelope: null,
        thrownError: {
          name: err.name || "Error",
          message: err.message || "Scenario execution failed.",
          code: this.classifyError(err),
          stack: err.stack || null
        },
        durationMs: Date.now() - startedAt,
        routeStatus: "scenario_execution_failed",
        bridgeReadinessStatus: "adapter_failed",
        diagnostics: {
          ok: false,
          warnings: [],
          errors: [
            this.classifyError(err),
            err.message || "Scenario execution failed."
          ]
        }
      };
    }
  }

  resolveAdapter(scenario = {}, input = {}) {
    if (scenario.adapter) return scenario.adapter;

    if (typeof scenario.adapterFactory === "function") {
      return scenario.adapterFactory(scenario, input);
    }

    if (typeof this.adapterFactory === "function") {
      return this.adapterFactory(scenario, input);
    }

    if (scenario.harness && scenario.harness.simulateRuntimeFailure) {
      return this.buildFailureAdapter();
    }

    return this.adapter;
  }

  buildFailureAdapter() {
    return {
      adapt: () => {
        return {
          requestId: "simulated_failure_request",
          traceId: "simulated_failure_trace",
          domain: "finance",
          runtimeLayer: "layer12_marion_nyx_bridge",
          routeStatus: "finance_failed",
          domainDecision: {
            shouldRouteToFinance: true,
            intent: "finance_general_analysis",
            confidence: 0.72
          },
          marionResponse: {
            replyText: "The finance runtime could not complete the request safely. The failure has been preserved for review.",
            displayText: "The finance runtime could not complete the request safely. The failure has been preserved for review.",
            canReturnToUser: false,
            requiresHumanReview: true,
            requiresMoreEvidence: false
          },
          nyxResponse: {
            displayText: "The finance runtime could not complete the request safely. The failure has been preserved for review.",
            apiReady: false
          },
          bridgeReadiness: {
            status: "adapter_failed",
            failed: true,
            requiresHumanReview: true,
            canReturnToMarion: false
          },
          nextLayerHandoff: {
            failed: true,
            requiresHumanReview: true,
            canReturnToMarion: false
          },
          diagnostics: {
            ok: false,
            valid: false,
            warnings: [],
            errors: ["simulated_runtime_failure"]
          }
        };
      }
    };
  }

  buildScenarioInput(scenario = {}, input = {}) {
    const scenarioInput = scenario.input || {};

    const requestId =
      scenarioInput.requestId ||
      input.requestId ||
      `fin_eval_scenario_req_${Date.now().toString(36)}`;

    const traceId =
      scenarioInput.traceId ||
      input.traceId ||
      `fin_eval_scenario_trace_${Date.now().toString(36)}`;

    const originalQuery =
      scenarioInput.originalQuery ||
      scenarioInput.userText ||
      scenarioInput.query ||
      "Finance evaluation scenario.";

    return {
      ...scenarioInput,
      requestId,
      traceId,
      originalQuery,
      normalizedQuery: scenarioInput.normalizedQuery || normalizeText(originalQuery),
      queryContext: {
        ...(scenarioInput.queryContext || {}),
        originalQuery,
        normalizedQuery: scenarioInput.normalizedQuery || normalizeText(originalQuery),
        evaluationScenarioId: scenario.scenarioId || null,
        evaluationCategory: scenario.category || null
      }
    };
  }

  classifyError(err = {}) {
    const message = String(err.message || err || "").toLowerCase();

    if (message.includes("missing_layer12_finance_adapter")) {
      return "missing_layer12_finance_adapter";
    }

    if (message.includes("cannot find module")) {
      return "missing_layer12_module";
    }

    if (message.includes("timeout")) {
      return "scenario_timeout";
    }

    return "scenario_execution_error";
  }

  run(input = {}) { return this.runScenario(input); }
  execute(input = {}) { return this.runScenario(input); }
  process(input = {}) { return this.runScenario(input); }

  static runScenario(input = {}, options = {}) {
    return new FinanceEvaluationScenarioRunner(options).runScenario(input);
  }
}

module.exports = {
  FinanceEvaluationScenarioRunner
};
