"use strict";

/**
 * R18D Layer 12 — Finance Nyx Runtime Bridge
 * Calls the Layer 11 Finax runtime orchestrator and normalizes its result for
 * Marion/Nyx domain adapter use.
 *
 * No external dependencies.
 */

let FinanceRuntimeOrchestrator = null;

try {
  ({ FinanceRuntimeOrchestrator } = require("../layer11_runtime_orchestration/FinanceRuntimeOrchestrator"));
} catch (err) {
  FinanceRuntimeOrchestrator = null;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

class FinanceNyxRuntimeBridge {
  constructor(options = {}) {
    this.orchestrator =
      options.orchestrator ||
      options.financeRuntimeOrchestrator ||
      (FinanceRuntimeOrchestrator ? new FinanceRuntimeOrchestrator(options) : null);

    this.allowMissingOrchestratorFallback = options.allowMissingOrchestratorFallback !== false;
  }

  bridge(input = {}) {
    const normalizedInput = this.normalizeInput(input);

    if (!this.orchestrator || typeof this.orchestrator.orchestrate !== "function") {
      return this.missingOrchestratorFallback(normalizedInput);
    }

    try {
      const orchestrationEnvelope = this.orchestrator.orchestrate({
        ...input,
        requestId: normalizedInput.requestId,
        traceId: normalizedInput.traceId,
        originalQuery: normalizedInput.originalQuery,
        normalizedQuery: normalizedInput.normalizedQuery,
        queryContext: normalizedInput.queryContext,
        domainContext: {
          domain: "finance",
          adapterLayer: "layer12_marion_nyx_bridge",
          domainDecision: input.domainDecision || null
        }
      });

      return {
        bridgeId: `fin_nyx_bridge_${Date.now().toString(36)}`,
        domain: "finance",
        runtimeLayer: "layer12_marion_nyx_bridge",
        bridgeStatus: this.resolveBridgeStatus(orchestrationEnvelope),
        orchestratorAvailable: true,
        orchestrationEnvelope,
        runtimeResponse: orchestrationEnvelope && orchestrationEnvelope.runtimeResponse || null,
        uiDelivery: orchestrationEnvelope && orchestrationEnvelope.uiDelivery || null,
        telemetry: orchestrationEnvelope && orchestrationEnvelope.telemetry || null,
        diagnostics: {
          ok: orchestrationEnvelope && orchestrationEnvelope.diagnostics
            ? orchestrationEnvelope.diagnostics.valid !== false
            : Boolean(orchestrationEnvelope),
          warnings: [],
          errors: [],
          orchestrationRuntimeLayer: orchestrationEnvelope && orchestrationEnvelope.runtimeLayer || null,
          pipelineStatus: orchestrationEnvelope && orchestrationEnvelope.pipelineStatus || null
        }
      };
    } catch (err) {
      return this.runtimeBridgeFailure(normalizedInput, err);
    }
  }

  normalizeInput(input = {}) {
    const queryContext = input.queryContext || {};

    const originalQuery = firstValue(
      input.originalQuery,
      input.query,
      input.userText,
      input.rawInput,
      input.message,
      input.text,
      queryContext.originalQuery,
      queryContext.normalizedQuery,
      ""
    );

    const requestId =
      input.requestId ||
      input.id ||
      `fin_nyx_bridge_req_${Date.now().toString(36)}`;

    const traceId =
      input.traceId ||
      `fin_nyx_bridge_trace_${Date.now().toString(36)}`;

    const normalizedQuery = input.normalizedQuery || normalizeText(originalQuery);

    return {
      requestId,
      traceId,
      originalQuery,
      normalizedQuery,
      queryContext: {
        ...queryContext,
        originalQuery,
        normalizedQuery
      }
    };
  }

  resolveBridgeStatus(orchestrationEnvelope = {}) {
    const pipelineStatus = orchestrationEnvelope.pipelineStatus;
    const handoff = orchestrationEnvelope.nextLayerHandoff || {};

    if (!orchestrationEnvelope || Object.keys(orchestrationEnvelope).length === 0) {
      return "bridge_empty";
    }

    if (pipelineStatus === "failed" || handoff.failed) return "bridge_failed";
    if (pipelineStatus === "blocked" || handoff.blocked) return "bridge_blocked";
    if (pipelineStatus === "completed_with_review_hold" || handoff.requiresHumanReview) return "bridge_review_required";
    if (pipelineStatus === "requires_more_evidence" || handoff.requiresMoreEvidence) return "bridge_requires_more_evidence";
    if (pipelineStatus === "completed_with_caveats" || handoff.canReturnToMarionWithCaveats) return "bridge_ready_with_caveats";
    if (pipelineStatus === "completed" || handoff.canReturnToMarion) return "bridge_ready";

    return "bridge_prepared";
  }

  missingOrchestratorFallback(input = {}) {
    const error = {
      code: "missing_finance_runtime_orchestrator",
      message: "FinanceRuntimeOrchestrator is unavailable to the Layer 12 bridge.",
      recoverable: false
    };

    return {
      bridgeId: `fin_nyx_bridge_missing_${Date.now().toString(36)}`,
      domain: "finance",
      runtimeLayer: "layer12_marion_nyx_bridge",
      bridgeStatus: "bridge_failed",
      orchestratorAvailable: false,
      orchestrationEnvelope: null,
      runtimeResponse: null,
      uiDelivery: null,
      telemetry: null,
      diagnostics: {
        ok: false,
        warnings: [],
        errors: [error.code, error.message],
        error
      }
    };
  }

  runtimeBridgeFailure(input = {}, err = {}) {
    const message = err.message || "Finance runtime bridge failed.";

    return {
      bridgeId: `fin_nyx_bridge_error_${Date.now().toString(36)}`,
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
        errors: ["finance_runtime_bridge_failure", message],
        error: {
          code: "finance_runtime_bridge_failure",
          message,
          type: err.name || "Error"
        }
      }
    };
  }

  run(input = {}) { return this.bridge(input); }
  execute(input = {}) { return this.bridge(input); }
  process(input = {}) { return this.bridge(input); }

  static bridge(input = {}, options = {}) {
    return new FinanceNyxRuntimeBridge(options).bridge(input);
  }
}

module.exports = {
  FinanceNyxRuntimeBridge
};
