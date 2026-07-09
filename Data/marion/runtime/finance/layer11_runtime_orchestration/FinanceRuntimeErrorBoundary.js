"use strict";

/**
 * R18D Layer 11 — Finance Runtime Error Boundary
 * Catches, classifies, and preserves finance pipeline failures.
 *
 * It does not hide failures. It converts them into safe, serializable runtime
 * diagnostics so the pipeline can fail cleanly.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stableSlug(value) {
  const slug = normalizeText(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || "unknown";
}

class FinanceRuntimeErrorBoundary {
  executeLayer(options = {}) {
    const layerDescriptor = options.layerDescriptor || {};
    const layerKey = layerDescriptor.key || "unknown_layer";

    try {
      const output = options.executor();

      const validation = this.validateLayerOutput(layerDescriptor, output);

      if (!validation.valid) {
        const error = this.buildError({
          layerKey,
          code: "invalid_layer_output",
          message: validation.errors.join("; "),
          classification: "invalid_layer_output"
        });

        return {
          ok: false,
          output: null,
          error,
          fallbackOutput: this.buildFallbackOutput({
            layerDescriptor,
            error
          })
        };
      }

      return {
        ok: true,
        output,
        error: null,
        fallbackOutput: null
      };
    } catch (err) {
      const error = this.classifyError(err, layerDescriptor);

      return {
        ok: false,
        output: null,
        error,
        fallbackOutput: this.buildFallbackOutput({
          layerDescriptor,
          error
        })
      };
    }
  }

  validateLayerOutput(layerDescriptor = {}, output) {
    const errors = [];

    if (!output || typeof output !== "object") {
      errors.push("Layer output must be an object.");
    }

    if (output && output.domain && output.domain !== "finance") {
      errors.push("Layer output domain must be finance when present.");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  classifyError(err = {}, layerDescriptor = {}) {
    const message = String(err.message || err || "Unknown finance runtime error.");
    const lower = message.toLowerCase();
    const layerKey = layerDescriptor.key || "unknown_layer";

    let classification = "layer_execution_error";

    if (lower.includes("missing_layer_module") || lower.includes("cannot find module")) {
      classification = "missing_layer_module";
    } else if (lower.includes("missing_layer_export")) {
      classification = "missing_layer_export";
    } else if (lower.includes("missing_layer_method")) {
      classification = "missing_layer_method";
    } else if (lower.includes("invalid_layer_output")) {
      classification = "invalid_layer_output";
    } else if (lower.includes("empty_final_delivery")) {
      classification = "empty_final_delivery";
    } else if (lower.includes("pipeline_blocked")) {
      classification = "pipeline_blocked";
    }

    return this.buildError({
      layerKey,
      code: classification,
      message,
      classification,
      originalName: err.name || "Error",
      stack: err.stack || null
    });
  }

  buildError(payload = {}) {
    return {
      errorId: `fin_runtime_error_${stableSlug(payload.layerKey)}_${Date.now().toString(36)}`,
      domain: "finance",
      runtimeLayer: "layer11_runtime_orchestration",
      layerKey: payload.layerKey || "unknown_layer",
      code: payload.code || "layer_execution_error",
      classification: payload.classification || payload.code || "layer_execution_error",
      type: payload.originalName || "Error",
      message: payload.message || "Finance runtime layer failed.",
      recoverable: this.isRecoverable(payload.classification || payload.code),
      createdAt: new Date().toISOString(),
      stack: payload.stack || null
    };
  }

  isRecoverable(classification) {
    return [
      "missing_layer_method",
      "invalid_layer_output",
      "empty_final_delivery"
    ].includes(classification);
  }

  buildFallbackOutput(options = {}) {
    const layerDescriptor = options.layerDescriptor || {};
    const error = options.error || {};

    return {
      requestId: null,
      traceId: null,
      domain: "finance",
      layer: "R18D_layer11_finance_runtime_error_boundary",
      runtimeLayer: layerDescriptor.runtimeLayer || layerDescriptor.key || "unknown_layer",
      envelopeType: "finance_runtime_layer_failure",
      layerKey: layerDescriptor.key || "unknown_layer",
      failedLayer: layerDescriptor.key || "unknown_layer",
      pipelineStatus: "failed",
      error,
      diagnostics: {
        ok: false,
        valid: false,
        warnings: [],
        errors: [
          error.code || "layer_execution_error",
          error.message || "Finance runtime layer failed."
        ]
      },
      nextLayerHandoff: {
        canContinuePipeline: false,
        requiresReview: true,
        blocked: true,
        reason: error.classification || error.code || "layer_execution_error"
      }
    };
  }

  classify(err = {}, layerDescriptor = {}) {
    return this.classifyError(err, layerDescriptor);
  }

  safeExecute(options = {}) {
    return this.executeLayer(options);
  }

  static executeLayer(options = {}) {
    return new FinanceRuntimeErrorBoundary().executeLayer(options);
  }
}

module.exports = {
  FinanceRuntimeErrorBoundary
};
