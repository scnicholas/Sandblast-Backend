"use strict";

/**
 * R18D Layer 11 — Finance Pipeline State Tracker
 * Observational pipeline state tracker for Layers 03–10.
 *
 * Does not modify finance outputs.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

class FinancePipelineStateTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      requestId: null,
      traceId: null,
      domain: "finance",
      runtimeLayer: "layer11_runtime_orchestration",
      startedAt: null,
      completedAt: null,
      elapsedMs: null,
      currentLayer: null,
      completedLayers: [],
      failedLayers: [],
      skippedLayers: [],
      layerTimings: {},
      warnings: [],
      errors: [],
      pipelineStatus: "not_started"
    };

    return this;
  }

  startPipeline(context = {}) {
    this.reset();

    const now = Date.now();

    this.state.requestId = context.requestId || null;
    this.state.traceId = context.traceId || null;
    this.state.startedAt = new Date(now).toISOString();
    this.state.startedAtEpochMs = now;
    this.state.pipelineStatus = "running";

    return this.snapshot();
  }

  startLayer(layerKey) {
    const now = Date.now();

    this.state.currentLayer = layerKey;

    this.state.layerTimings[layerKey] = {
      layerKey,
      startedAt: new Date(now).toISOString(),
      startedAtEpochMs: now,
      completedAt: null,
      completedAtEpochMs: null,
      elapsedMs: null,
      status: "running"
    };

    return this.snapshot();
  }

  completeLayer(layerKey, metadata = {}) {
    const now = Date.now();
    const timing = this.ensureTiming(layerKey);

    timing.completedAt = new Date(now).toISOString();
    timing.completedAtEpochMs = now;
    timing.elapsedMs = now - timing.startedAtEpochMs;
    timing.status = "completed";
    timing.runtimeLayer = metadata.runtimeLayer || null;
    timing.envelopeType = metadata.envelopeType || null;

    this.state.completedLayers.push({
      layerKey,
      runtimeLayer: metadata.runtimeLayer || null,
      envelopeType: metadata.envelopeType || null,
      completedAt: timing.completedAt,
      elapsedMs: timing.elapsedMs
    });

    this.state.currentLayer = null;

    return this.snapshot();
  }

  failLayer(layerKey, error = {}) {
    const now = Date.now();
    const timing = this.ensureTiming(layerKey);

    timing.completedAt = new Date(now).toISOString();
    timing.completedAtEpochMs = now;
    timing.elapsedMs = now - timing.startedAtEpochMs;
    timing.status = "failed";

    const safeError = this.safeError(error);

    this.state.failedLayers.push({
      layerKey,
      failedAt: timing.completedAt,
      elapsedMs: timing.elapsedMs,
      error: safeError
    });

    this.state.errors.push(`${layerKey}:${safeError.code || safeError.message || "layer_failed"}`);
    this.state.currentLayer = null;

    return this.snapshot();
  }

  skipLayer(layerKey, metadata = {}) {
    const now = new Date().toISOString();

    this.state.skippedLayers.push({
      layerKey,
      skippedAt: now,
      reason: metadata.reason || "not_specified"
    });

    this.state.warnings.push(`${layerKey}:skipped:${metadata.reason || "not_specified"}`);

    return this.snapshot();
  }

  addWarning(code, detail = null) {
    this.state.warnings.push(detail ? `${code}:${detail}` : code);
    return this.snapshot();
  }

  addError(code, detail = null) {
    this.state.errors.push(detail ? `${code}:${detail}` : code);
    return this.snapshot();
  }

  finishPipeline(metadata = {}) {
    const now = Date.now();

    this.state.completedAt = new Date(now).toISOString();
    this.state.completedAtEpochMs = now;
    this.state.elapsedMs = this.state.startedAtEpochMs
      ? now - this.state.startedAtEpochMs
      : null;
    this.state.pipelineStatus = metadata.pipelineStatus || "completed";
    this.state.finalRuntimeLayer = metadata.finalRuntimeLayer || null;
    this.state.currentLayer = null;

    return this.snapshot();
  }

  ensureTiming(layerKey) {
    if (!this.state.layerTimings[layerKey]) {
      const now = Date.now();

      this.state.layerTimings[layerKey] = {
        layerKey,
        startedAt: new Date(now).toISOString(),
        startedAtEpochMs: now,
        completedAt: null,
        completedAtEpochMs: null,
        elapsedMs: null,
        status: "unknown"
      };
    }

    return this.state.layerTimings[layerKey];
  }

  safeError(error = {}) {
    if (typeof error === "string") {
      return {
        code: "layer_error",
        message: error
      };
    }

    return {
      code: error.code || error.errorCode || "layer_error",
      type: error.type || error.name || "Error",
      message: error.message || "Layer execution failed.",
      layerKey: error.layerKey || null,
      classification: error.classification || null
    };
  }

  snapshot() {
    return {
      requestId: this.state.requestId,
      traceId: this.state.traceId,
      domain: this.state.domain,
      runtimeLayer: this.state.runtimeLayer,
      startedAt: this.state.startedAt,
      completedAt: this.state.completedAt,
      elapsedMs: this.state.elapsedMs,
      currentLayer: this.state.currentLayer,
      completedLayers: safeArray(this.state.completedLayers).map((item) => ({ ...item })),
      failedLayers: safeArray(this.state.failedLayers).map((item) => ({ ...item })),
      skippedLayers: safeArray(this.state.skippedLayers).map((item) => ({ ...item })),
      layerTimings: Object.fromEntries(
        Object.entries(this.state.layerTimings).map(([key, value]) => [key, { ...value }])
      ),
      warnings: safeArray(this.state.warnings).slice(),
      errors: safeArray(this.state.errors).slice(),
      pipelineStatus: this.state.pipelineStatus,
      finalRuntimeLayer: this.state.finalRuntimeLayer || null
    };
  }

  getState() { return this.snapshot(); }
  trace() { return this.snapshot(); }

  static create() {
    return new FinancePipelineStateTracker();
  }
}

module.exports = {
  FinancePipelineStateTracker
};
