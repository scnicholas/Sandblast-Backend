"use strict";

/**
 * R18D Layer 13 — Finance Evaluation Scenario Runner
 * Executes one evaluation scenario against the Layer 12 finance adapter.
 *
 * Boundary:
 * - Does not calculate finance metrics.
 * - Does not mutate Layer 12 adapter logic.
 * - Does not rewrite finance answers.
 * - Does not fetch live finance data.
 * - Converts scenario execution failures into structured evaluation output.
 *
 * V3 surgical patch:
 * - Simulated runtime-failure envelopes now preserve the Layer 12 Marion/Nyx
 *   response contract fields: domain, source, adapterLayer, runtimeLayer,
 *   replyText/displayText, review flags, and handoff fields.
 * - This prevents false Layer 13 contract failures during the default
 *   runtime_failure_safe_fallback scenario.
 *
 * No external dependencies.
 */

let FinanceMarionDomainAdapter = null;

try {
  ({ FinanceMarionDomainAdapter } = require("../layer12_marion_nyx_bridge/FinanceMarionDomainAdapter"));
} catch (err) {
  FinanceMarionDomainAdapter = null;
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
      adapt: (input = {}) => {
        const requestId =
          input.requestId ||
          "simulated_failure_request";

        const traceId =
          input.traceId ||
          "simulated_failure_trace";

        const fallbackText =
          "The finance runtime could not complete the request safely. The failure has been preserved for review.";

        return {
          requestId,
          traceId,
          schemaVersion: "1.0.0",
          envelopeVersion: "1.0.0",
          envelopeType: "finance_marion_nyx_domain_adapter_envelope",
          domain: "finance",
          layer: "R18D_layer12_finance_marion_nyx_domain_adapter_runtime_bridge",
          runtimeLayer: "layer12_marion_nyx_bridge",
          sourceLayer: "layer11_runtime_orchestration",
          routeStatus: "finance_failed",

          domainDecision: {
            shouldRouteToFinance: true,
            intent: "finance_general_analysis",
            confidence: 0.72,
            matchedSignals: ["finance_keyword"],
            rejectedSignals: [],
            routeReason: "finance_route:finance_general_analysis"
          },

          runtimeBridge: {
            bridgeId: "simulated_runtime_failure_bridge",
            domain: "finance",
            runtimeLayer: "layer12_marion_nyx_bridge",
            bridgeStatus: "bridge_failed",
            orchestratorAvailable: true,
            orchestrationEnvelope: null,
            runtimeResponse: null,
            uiDelivery: null,
            telemetry: null,
            diagnostics: {
              ok: false,
              warnings: [],
              errors: ["simulated_runtime_failure"],
              error: {
                code: "simulated_runtime_failure",
                message: "Layer 13 simulated runtime failure."
              }
            }
          },

          orchestrationEnvelope: null,

          marionResponse: {
            responseId: "fin_marion_simulated_failure",
            domain: "finance",
            source: "finax",
            adapterLayer: "layer12_marion_nyx_bridge",
            runtimeLayer: "layer12_marion_nyx_bridge",
            intent: "finance_general_analysis",
            reply: fallbackText,
            replyText: fallbackText,
            text: fallbackText,
            displayText: fallbackText,
            voiceText: fallbackText,
            answer: fallbackText,
            responseBlocks: [],
            uiBlocks: [],
            uiDelivery: {
              blocks: [],
              mainAnswer: fallbackText
            },
            telemetry: null,
            deliveryStatus: "finance_failed",
            caveatState: "failure_review_required",
            confidence: 0,
            canReturnToUser: false,
            requiresHumanReview: true,
            requiresMoreEvidence: false,
            metadata: {
              requestId,
              traceId,
              routeStatus: "finance_failed",
              simulatedFailure: true
            }
          },

          nyxResponse: {
            responseId: "fin_nyx_simulated_failure",
            domain: "finance",
            source: "finax",
            adapterLayer: "layer12_marion_nyx_bridge",
            runtimeLayer: "layer12_marion_nyx_bridge",
            personaSurface: "nyx",
            reply: fallbackText,
            replyText: fallbackText,
            text: fallbackText,
            displayText: fallbackText,
            voiceText: fallbackText,
            answer: fallbackText,
            responseBlocks: [],
            uiBlocks: [],
            uiDelivery: {
              blocks: [],
              mainAnswer: fallbackText
            },
            telemetry: null,
            deliveryStatus: "finance_failed",
            caveatState: "failure_review_required",
            confidence: 0,
            canReturnToUser: false,
            requiresHumanReview: true,
            requiresMoreEvidence: false,
            channelReady: true,
            widgetReady: true,
            apiReady: false
          },

          bridgeReadiness: {
            status: "adapter_failed",
            score: 0,
            routeStatus: "finance_failed",
            canReturnToMarion: false,
            canReturnToNyx: false,
            canReturnWithCaveats: false,
            requiresHumanReview: true,
            requiresMoreEvidence: false,
            blocked: false,
            failed: true,
            responseLength: fallbackText.length,
            uiBlockCount: 0
          },

          diagnostics: {
            ok: false,
            valid: false,
            warnings: [],
            errors: ["simulated_runtime_failure"],
            simulatedFailure: true
          },

          nextLayerHandoff: {
            canReturnToMarion: false,
            canReturnToNyx: false,
            canReturnWithCaveats: false,
            requiresHumanReview: true,
            requiresMoreEvidence: false,
            blocked: false,
            failed: true,
            routeStatus: "finance_failed",
            bridgeReadinessStatus: "adapter_failed",
            responseLength: fallbackText.length,
            uiBlockCount: 0
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

    const normalizedQuery =
      scenarioInput.normalizedQuery ||
      normalizeText(originalQuery);

    return {
      ...scenarioInput,
      requestId,
      traceId,
      originalQuery,
      normalizedQuery,
      queryContext: {
        ...(scenarioInput.queryContext || {}),
        originalQuery,
        normalizedQuery,
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
