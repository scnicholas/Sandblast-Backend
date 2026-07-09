"use strict";

/**
 * R18D Layer 11 — Finance Runtime Orchestration Envelope
 * Stable full-pipeline envelope for Finax end-to-end runtime execution.
 *
 * No external dependencies.
 */

const ORCHESTRATION_VERSION = "1.0.0";
const ORCHESTRATION_LAYER = "R18D_layer11_finance_runtime_orchestration_end_to_end_pipeline_harness";

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

function uniqueArray(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function generateTraceId(payload = {}) {
  const seed = payload.traceId || payload.requestId || payload.originalQuery || Date.now();
  return `fin_l11_${stableSlug(seed).slice(0, 32)}_${Date.now().toString(36)}`;
}

function calculatePipelineReadiness(payload = {}) {
  if (payload.pipelineReadiness && typeof payload.pipelineReadiness === "object") {
    return payload.pipelineReadiness;
  }

  const pipelineStatus = payload.pipelineStatus || "unknown";
  const finalDeliveryEnvelope = payload.finalDeliveryEnvelope || {};
  const stateTrace = payload.stateTrace || {};
  const completedLayerCount = safeArray(stateTrace.completedLayers).length;
  const failedLayerCount = safeArray(stateTrace.failedLayers).length;
  const skippedLayerCount = safeArray(stateTrace.skippedLayers).length;

  let score = 0;

  score += Math.min(0.48, completedLayerCount * 0.06);
  if (finalDeliveryEnvelope && finalDeliveryEnvelope.runtimeLayer === "layer10_delivery_runtime") score += 0.2;
  if (payload.runtimeResponse) score += 0.12;
  if (payload.uiDelivery) score += 0.08;
  if (payload.telemetry) score += 0.04;
  if (failedLayerCount === 0) score += 0.08;

  if (pipelineStatus === "failed") score -= 0.48;
  if (pipelineStatus === "blocked") score -= 0.32;
  if (pipelineStatus === "completed_with_review_hold") score -= 0.18;
  if (pipelineStatus === "requires_more_evidence") score -= 0.14;
  if (skippedLayerCount > 0) score -= Math.min(0.24, skippedLayerCount * 0.06);

  score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));

  return {
    status: readinessStatusForPipeline(pipelineStatus),
    score,
    completedLayerCount,
    failedLayerCount,
    skippedLayerCount,
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

function readinessStatusForPipeline(pipelineStatus) {
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

class FinanceRuntimeOrchestrationEnvelope {
  constructor(payload = {}) {
    Object.assign(this, FinanceRuntimeOrchestrationEnvelope.create(payload));
  }

  static create(payload = {}) {
    const requestId =
      payload.requestId ||
      `fin_orchestration_req_${Date.now().toString(36)}`;

    const traceId =
      payload.traceId ||
      generateTraceId({ ...payload, requestId });

    const pipelineStatus = payload.pipelineStatus || "unknown";
    const layerOutputs = payload.layerOutputs || {};
    const finalDeliveryEnvelope = payload.finalDeliveryEnvelope || null;
    const runtimeResponse =
      payload.runtimeResponse ||
      finalDeliveryEnvelope && finalDeliveryEnvelope.runtimeResponse ||
      null;

    const uiDelivery =
      payload.uiDelivery ||
      finalDeliveryEnvelope && finalDeliveryEnvelope.uiDelivery ||
      null;

    const telemetry =
      payload.telemetry ||
      finalDeliveryEnvelope && finalDeliveryEnvelope.telemetry ||
      null;

    const stateTrace = payload.stateTrace || {};
    const pipelineReadiness = calculatePipelineReadiness({
      ...payload,
      pipelineStatus,
      finalDeliveryEnvelope,
      runtimeResponse,
      uiDelivery,
      telemetry,
      stateTrace
    });

    const diagnostics = {
      ok:
        pipelineStatus === "completed" ||
        pipelineStatus === "completed_with_caveats",
      valid: pipelineStatus !== "failed",
      warnings: uniqueArray([
        ...safeArray(pipelineReadiness.warnings),
        ...safeArray(stateTrace.warnings)
      ]),
      errors: uniqueArray([
        ...safeArray(pipelineReadiness.errors),
        ...safeArray(stateTrace.errors)
      ]),
      ...(payload.diagnostics || {})
    };

    return {
      requestId,
      traceId,
      schemaVersion: ORCHESTRATION_VERSION,
      version: ORCHESTRATION_VERSION,
      envelopeVersion: ORCHESTRATION_VERSION,
      envelopeType: "finance_runtime_orchestration_envelope",
      domain: "finance",
      layer: ORCHESTRATION_LAYER,
      runtimeLayer: "layer11_runtime_orchestration",
      sourceLayer: "layer10_delivery_runtime",
      createdAt: new Date().toISOString(),

      queryContext: {
        originalQuery: payload.originalQuery || "",
        normalizedQuery: payload.normalizedQuery || normalizeText(payload.originalQuery || "")
      },

      pipelineStatus,
      pipelineReadiness,
      layerOutputs,
      layerOutputSummary: safeArray(payload.layerOutputSummary),
      finalDeliveryEnvelope,
      runtimeResponse,
      uiDelivery,
      telemetry,
      stateTrace,
      diagnostics,

      nextLayerHandoff: {
        canReturnToMarion:
          pipelineReadiness.canReturnToRuntime === true,
        canReturnToMarionWithCaveats:
          pipelineReadiness.canReturnWithCaveats === true,
        requiresHumanReview:
          pipelineReadiness.requiresReview === true,
        requiresMoreEvidence:
          pipelineReadiness.requiresMoreEvidence === true,
        blocked:
          pipelineReadiness.blocked === true,
        failed:
          pipelineReadiness.failed === true,
        pipelineStatus,
        pipelineReadinessStatus: pipelineReadiness.status,
        finalDeliveryStatus:
          finalDeliveryEnvelope &&
          finalDeliveryEnvelope.deliveryPolicy &&
          finalDeliveryEnvelope.deliveryPolicy.status ||
          null,
        runtimeReplyLength:
          runtimeResponse &&
          String(runtimeResponse.replyText || "").length ||
          0,
        uiBlockCount:
          uiDelivery &&
          safeArray(uiDelivery.blocks).length ||
          0
      }
    };
  }

  static validate(envelope = {}) {
    const errors = [];

    if (envelope.domain !== "finance") {
      errors.push("Envelope domain must be finance.");
    }

    if (envelope.layer !== ORCHESTRATION_LAYER) {
      errors.push(`Envelope layer must be ${ORCHESTRATION_LAYER}.`);
    }

    if (envelope.runtimeLayer !== "layer11_runtime_orchestration") {
      errors.push("runtimeLayer must be layer11_runtime_orchestration.");
    }

    if (!envelope.pipelineStatus) {
      errors.push("pipelineStatus is required.");
    }

    if (!envelope.pipelineReadiness || typeof envelope.pipelineReadiness !== "object") {
      errors.push("pipelineReadiness is required.");
    }

    if (!envelope.layerOutputs || typeof envelope.layerOutputs !== "object") {
      errors.push("layerOutputs is required.");
    }

    if (!envelope.stateTrace || typeof envelope.stateTrace !== "object") {
      errors.push("stateTrace is required.");
    }

    if (!envelope.nextLayerHandoff || typeof envelope.nextLayerHandoff !== "object") {
      errors.push("nextLayerHandoff is required.");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static calculateQuality(payload = {}) {
    return calculatePipelineReadiness(payload);
  }

  static build(payload = {}) { return FinanceRuntimeOrchestrationEnvelope.create(payload); }
  static wrap(payload = {}) { return FinanceRuntimeOrchestrationEnvelope.create(payload); }
  static compose(payload = {}) { return FinanceRuntimeOrchestrationEnvelope.create(payload); }
  static toEnvelope(payload = {}) { return FinanceRuntimeOrchestrationEnvelope.create(payload); }
}

module.exports = {
  FinanceRuntimeOrchestrationEnvelope
};
