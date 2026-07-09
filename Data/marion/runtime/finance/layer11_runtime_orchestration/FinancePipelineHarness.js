"use strict";

/**
 * R18D Layer 11 — Finance Pipeline Harness
 * Ordered end-to-end runner for Finax Layers 03–10.
 *
 * Execution order:
 * 03 ingestion
 * 04 normalization
 * 05 analysis planning
 * 06 analysis execution
 * 07 evidence binding
 * 08 synthesis
 * 09 final response rendering
 * 10 delivery/runtime integration
 *
 * No external dependencies.
 */

const { FinanceLayerRegistry } = require("./FinanceLayerRegistry");
const { FinancePipelineStateTracker } = require("./FinancePipelineStateTracker");
const { FinanceRuntimeErrorBoundary } = require("./FinanceRuntimeErrorBoundary");

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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

class FinancePipelineHarness {
  constructor(options = {}) {
    this.registry = options.registry || new FinanceLayerRegistry(options);
    this.stateTracker = options.stateTracker || new FinancePipelineStateTracker(options);
    this.errorBoundary = options.errorBoundary || new FinanceRuntimeErrorBoundary(options);
    this.stopOnLayerFailure = options.stopOnLayerFailure !== false;
  }

  run(input = {}) {
    const requestContext = this.normalizeInput(input);
    const state = this.stateTracker.startPipeline(requestContext);

    const layerOutputs = {};
    let currentPayload = {
      ...input,
      requestId: requestContext.requestId,
      traceId: requestContext.traceId,
      originalQuery: requestContext.originalQuery,
      normalizedQuery: requestContext.normalizedQuery,
      queryContext: requestContext.queryContext
    };

    let pipelineStatus = "completed";
    let failed = false;

    const layers = this.registry.getAllLayers();

    for (const layerDescriptor of layers) {
      if (failed && this.stopOnLayerFailure) {
        this.stateTracker.skipLayer(layerDescriptor.key, {
          reason: "previous_layer_failed"
        });
        continue;
      }

      this.stateTracker.startLayer(layerDescriptor.key);

      const execution = this.errorBoundary.executeLayer({
        layerDescriptor,
        input: currentPayload,
        executor: () => this.invokeLayer(layerDescriptor, currentPayload)
      });

      if (!execution.ok) {
        failed = true;
        pipelineStatus = "failed";

        layerOutputs[layerDescriptor.key] = execution.fallbackOutput;

        this.stateTracker.failLayer(layerDescriptor.key, execution.error);

        if (this.stopOnLayerFailure) {
          continue;
        }
      } else {
        const output = execution.output;

        layerOutputs[layerDescriptor.key] = output;
        currentPayload = output;

        this.stateTracker.completeLayer(layerDescriptor.key, {
          runtimeLayer: output && output.runtimeLayer || layerDescriptor.runtimeLayer,
          envelopeType: output && output.envelopeType || null
        });
      }
    }

    const finalDeliveryEnvelope = this.resolveFinalDeliveryEnvelope(layerOutputs, currentPayload);
    const resolvedStatus = this.resolvePipelineStatus({
      pipelineStatus,
      failed,
      finalDeliveryEnvelope,
      layerOutputs
    });

    this.stateTracker.finishPipeline({
      pipelineStatus: resolvedStatus,
      finalRuntimeLayer: finalDeliveryEnvelope && finalDeliveryEnvelope.runtimeLayer || null
    });

    const stateTrace = this.stateTracker.snapshot();

    return {
      requestId: requestContext.requestId,
      traceId: requestContext.traceId,
      domain: "finance",
      runtimeLayer: "layer11_runtime_orchestration",
      pipelineStatus: resolvedStatus,
      pipelineReadiness: this.calculatePipelineReadiness({
        pipelineStatus: resolvedStatus,
        finalDeliveryEnvelope,
        stateTrace,
        layerOutputs
      }),
      layerOutputs,
      layerOutputSummary: this.summarizeLayerOutputs(layerOutputs),
      finalDeliveryEnvelope,
      runtimeResponse: finalDeliveryEnvelope && finalDeliveryEnvelope.runtimeResponse || null,
      uiDelivery: finalDeliveryEnvelope && finalDeliveryEnvelope.uiDelivery || null,
      telemetry: finalDeliveryEnvelope && finalDeliveryEnvelope.telemetry || null,
      stateTrace,
      diagnostics: this.buildDiagnostics({
        pipelineStatus: resolvedStatus,
        failed,
        finalDeliveryEnvelope,
        stateTrace,
        layerOutputs
      })
    };
  }

  invokeLayer(layerDescriptor = {}, input = {}) {
    const controller = layerDescriptor.createController();

    const methodNames = safeArray(layerDescriptor.methodNames);

    for (const methodName of methodNames) {
      if (controller && typeof controller[methodName] === "function") {
        return controller[methodName](input);
      }
    }

    throw new Error(
      `missing_layer_method:${layerDescriptor.key}:${methodNames.join("|")}`
    );
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
      `fin_pipeline_req_${Date.now().toString(36)}`;

    const traceId =
      input.traceId ||
      `fin_pipeline_trace_${Date.now().toString(36)}`;

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

  resolveFinalDeliveryEnvelope(layerOutputs = {}, currentPayload = {}) {
    if (layerOutputs.layer10_delivery_runtime) {
      return layerOutputs.layer10_delivery_runtime;
    }

    if (currentPayload && currentPayload.runtimeLayer === "layer10_delivery_runtime") {
      return currentPayload;
    }

    return null;
  }

  resolvePipelineStatus(options = {}) {
    if (options.failed) return "failed";

    const finalDeliveryEnvelope = options.finalDeliveryEnvelope || {};
    const deliveryPolicy = finalDeliveryEnvelope.deliveryPolicy || {};
    const deliveryReadiness = finalDeliveryEnvelope.deliveryReadiness || {};

    if (!finalDeliveryEnvelope || Object.keys(finalDeliveryEnvelope).length === 0) {
      return "partial";
    }

    if (deliveryReadiness.status === "delivery_blocked" || deliveryPolicy.status === "blocked") {
      return "blocked";
    }

    if (
      deliveryReadiness.status === "delivery_hold_for_review" ||
      deliveryPolicy.status === "hold_for_review"
    ) {
      return "completed_with_review_hold";
    }

    if (
      deliveryReadiness.status === "delivery_requires_more_evidence" ||
      deliveryPolicy.status === "request_more_evidence"
    ) {
      return "requires_more_evidence";
    }

    if (
      deliveryReadiness.status === "delivery_ready_with_caveats" ||
      deliveryPolicy.status === "deliver_with_caveats"
    ) {
      return "completed_with_caveats";
    }

    return "completed";
  }

  calculatePipelineReadiness(options = {}) {
    const stateTrace = options.stateTrace || {};
    const finalDeliveryEnvelope = options.finalDeliveryEnvelope || {};
    const deliveryReadiness = finalDeliveryEnvelope.deliveryReadiness || {};
    const pipelineStatus = options.pipelineStatus || "unknown";

    const completedLayerCount = safeArray(stateTrace.completedLayers).length;
    const failedLayerCount = safeArray(stateTrace.failedLayers).length;
    const skippedLayerCount = safeArray(stateTrace.skippedLayers).length;

    let score = 0;

    score += Math.min(0.48, completedLayerCount * 0.06);
    if (finalDeliveryEnvelope && finalDeliveryEnvelope.runtimeLayer === "layer10_delivery_runtime") score += 0.22;
    if (finalDeliveryEnvelope && finalDeliveryEnvelope.runtimeResponse) score += 0.12;
    if (finalDeliveryEnvelope && finalDeliveryEnvelope.uiDelivery) score += 0.08;
    if (finalDeliveryEnvelope && finalDeliveryEnvelope.telemetry) score += 0.05;
    if (failedLayerCount === 0) score += 0.05;

    if (pipelineStatus === "failed") score -= 0.5;
    if (pipelineStatus === "blocked") score -= 0.32;
    if (pipelineStatus === "completed_with_review_hold") score -= 0.2;
    if (pipelineStatus === "requires_more_evidence") score -= 0.16;
    if (skippedLayerCount > 0) score -= Math.min(0.24, skippedLayerCount * 0.06);

    score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));

    return {
      status: this.pipelineReadinessStatus(pipelineStatus),
      score,
      completedLayerCount,
      failedLayerCount,
      skippedLayerCount,
      finalDeliveryStatus: deliveryReadiness.status || null,
      canReturnToRuntime:
        pipelineStatus === "completed" ||
        pipelineStatus === "completed_with_caveats",
      canReturnWithCaveats:
        pipelineStatus === "completed_with_caveats",
      requiresReview:
        pipelineStatus === "completed_with_review_hold",
      requiresMoreEvidence:
        pipelineStatus === "requires_more_evidence",
      blocked:
        pipelineStatus === "blocked",
      failed:
        pipelineStatus === "failed"
    };
  }

  pipelineReadinessStatus(pipelineStatus) {
    const map = {
      completed: "pipeline_ready",
      completed_with_caveats: "pipeline_ready_with_caveats",
      completed_with_review_hold: "pipeline_hold_for_review",
      requires_more_evidence: "pipeline_requires_more_evidence",
      blocked: "pipeline_blocked",
      failed: "pipeline_failed",
      partial: "pipeline_partial"
    };

    return map[pipelineStatus] || "pipeline_unknown";
  }

  summarizeLayerOutputs(layerOutputs = {}) {
    return Object.entries(layerOutputs).map(([key, value]) => ({
      layerKey: key,
      runtimeLayer: value && value.runtimeLayer || null,
      envelopeType: value && value.envelopeType || null,
      domain: value && value.domain || null,
      ok: value && value.diagnostics ? value.diagnostics.ok !== false : Boolean(value),
      status:
        value && value.deliveryReadiness && value.deliveryReadiness.status ||
        value && value.responseReadiness && value.responseReadiness.status ||
        value && value.synthesisReadiness && value.synthesisReadiness.status ||
        value && value.evidenceReadiness && value.evidenceReadiness.status ||
        value && value.executionQuality && value.executionQuality.status ||
        value && value.analysisReadiness && value.analysisReadiness.status ||
        value && value.normalizationQuality && value.normalizationQuality.status ||
        value && value.ingestionQuality && value.ingestionQuality.status ||
        value && value.pipelineStatus ||
        null
    }));
  }

  buildDiagnostics(options = {}) {
    const stateTrace = options.stateTrace || {};
    const failedLayers = safeArray(stateTrace.failedLayers);
    const skippedLayers = safeArray(stateTrace.skippedLayers);

    return {
      ok:
        options.pipelineStatus === "completed" ||
        options.pipelineStatus === "completed_with_caveats",
      valid: options.pipelineStatus !== "failed",
      warnings: [
        ...safeArray(stateTrace.warnings),
        ...skippedLayers.map((item) => `skipped:${item.layerKey || item}`)
      ],
      errors: [
        ...safeArray(stateTrace.errors),
        ...failedLayers.map((item) => `failed:${item.layerKey || item}`)
      ],
      layerCount: Object.keys(options.layerOutputs || {}).length,
      failedLayerCount: failedLayers.length,
      skippedLayerCount: skippedLayers.length,
      hasFinalDeliveryEnvelope: Boolean(options.finalDeliveryEnvelope)
    };
  }

  process(input = {}) { return this.run(input); }
  execute(input = {}) { return this.run(input); }
  orchestrate(input = {}) { return this.run(input); }

  static run(input = {}, options = {}) {
    return new FinancePipelineHarness(options).run(input);
  }
}

module.exports = {
  FinancePipelineHarness
};
