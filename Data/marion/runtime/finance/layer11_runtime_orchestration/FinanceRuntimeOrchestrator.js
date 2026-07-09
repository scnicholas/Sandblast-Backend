"use strict";

/**
 * R18D Layer 11 — Finance Runtime Orchestrator
 * Top-level Finax runtime orchestrator.
 *
 * Runs the full finance-domain path across Layers 03–10 and wraps the result
 * in a Layer 11 orchestration envelope.
 *
 * Boundary:
 * - Does not calculate finance metrics directly.
 * - Does not normalize data directly.
 * - Does not bind evidence directly.
 * - Does not rewrite final response text.
 * - Does not override delivery policy.
 * - Does not fetch live market data.
 *
 * No external dependencies.
 */

const { FinancePipelineHarness } = require("./FinancePipelineHarness");
const { FinanceLayerRegistry } = require("./FinanceLayerRegistry");
const { FinancePipelineStateTracker } = require("./FinancePipelineStateTracker");
const { FinanceRuntimeErrorBoundary } = require("./FinanceRuntimeErrorBoundary");
const { FinanceRuntimeOrchestrationEnvelope } = require("./FinanceRuntimeOrchestrationEnvelope");

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

class FinanceRuntimeOrchestrator {
  constructor(options = {}) {
    this.registry =
      options.registry ||
      new FinanceLayerRegistry(options);

    this.stateTracker =
      options.stateTracker ||
      new FinancePipelineStateTracker(options);

    this.errorBoundary =
      options.errorBoundary ||
      new FinanceRuntimeErrorBoundary(options);

    this.pipelineHarness =
      options.pipelineHarness ||
      new FinancePipelineHarness({
        ...options,
        registry: this.registry,
        stateTracker: this.stateTracker,
        errorBoundary: this.errorBoundary
      });
  }

  orchestrate(input = {}) {
    const normalizedInput = this.normalizeInput(input);

    const pipelineResult = this.pipelineHarness.run({
      ...input,
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      originalQuery: normalizedInput.originalQuery,
      normalizedQuery: normalizedInput.normalizedQuery,
      queryContext: normalizedInput.queryContext
    });

    return FinanceRuntimeOrchestrationEnvelope.create({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      originalQuery: normalizedInput.originalQuery,
      normalizedQuery: normalizedInput.normalizedQuery,

      pipelineStatus: pipelineResult.pipelineStatus,
      pipelineReadiness: pipelineResult.pipelineReadiness,
      layerOutputs: pipelineResult.layerOutputs,
      layerOutputSummary: pipelineResult.layerOutputSummary,
      finalDeliveryEnvelope: pipelineResult.finalDeliveryEnvelope,

      runtimeResponse: pipelineResult.runtimeResponse,
      uiDelivery: pipelineResult.uiDelivery,
      telemetry: pipelineResult.telemetry,

      stateTrace: pipelineResult.stateTrace,
      diagnostics: {
        orchestrator: {
          ok: true,
          warnings: [],
          errors: []
        },
        pipelineHarness: pipelineResult.diagnostics
      }
    });
  }

  normalizeInput(input = {}) {
    const queryContext = input.queryContext || {};

    const originalQuery = firstValue(
      input.originalQuery,
      input.query,
      input.userText,
      input.rawInput,
      queryContext.originalQuery,
      queryContext.normalizedQuery,
      ""
    );

    const requestId =
      input.requestId ||
      input.id ||
      `fin_orchestration_req_${Date.now().toString(36)}`;

    const traceId =
      input.traceId ||
      `fin_orchestration_trace_${Date.now().toString(36)}`;

    return {
      requestId,
      traceId,
      originalQuery,
      normalizedQuery: input.normalizedQuery || normalizeText(originalQuery),
      queryContext: {
        ...queryContext,
        originalQuery,
        normalizedQuery: input.normalizedQuery || normalizeText(originalQuery)
      }
    };
  }

  run(input = {}) { return this.orchestrate(input); }
  execute(input = {}) { return this.orchestrate(input); }
  process(input = {}) { return this.orchestrate(input); }
  handle(input = {}) { return this.orchestrate(input); }

  static orchestrate(input = {}, options = {}) {
    return new FinanceRuntimeOrchestrator(options).orchestrate(input);
  }

  static run(input = {}, options = {}) {
    return new FinanceRuntimeOrchestrator(options).orchestrate(input);
  }
}

module.exports = {
  FinanceRuntimeOrchestrator
};
