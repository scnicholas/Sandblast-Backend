"use strict";

/**
 * R18D Layer 12 — Finance Domain Adapter Envelope
 * Stable handoff envelope for Marion/Nyx finance-domain adapter integration.
 *
 * No external dependencies.
 */

const ADAPTER_VERSION = "1.0.0";
const ADAPTER_LAYER = "R18D_layer12_finance_marion_nyx_domain_adapter_runtime_bridge";

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
  return `fin_l12_${stableSlug(seed).slice(0, 32)}_${Date.now().toString(36)}`;
}

function calculateBridgeReadiness(payload = {}) {
  const routeStatus = payload.routeStatus || "unknown";
  const marionResponse = payload.marionResponse || {};
  const nyxResponse = payload.nyxResponse || {};
  const runtimeBridge = payload.runtimeBridge || {};
  const orchestrationEnvelope = payload.orchestrationEnvelope || {};
  const domainDecision = payload.domainDecision || {};

  let score = 0;

  if (domainDecision.shouldRouteToFinance) score += 0.18;
  if (runtimeBridge && runtimeBridge.bridgeStatus) score += 0.18;
  if (orchestrationEnvelope && orchestrationEnvelope.runtimeLayer === "layer11_runtime_orchestration") score += 0.18;
  if (marionResponse && marionResponse.replyText) score += 0.22;
  if (nyxResponse && nyxResponse.displayText) score += 0.12;
  if (["finance_ready", "finance_ready_with_caveats", "pass_to_default_router"].includes(routeStatus)) score += 0.12;

  if (routeStatus === "finance_failed") score -= 0.38;
  if (routeStatus === "finance_blocked") score -= 0.34;
  if (routeStatus === "handoff_review") score -= 0.18;
  if (routeStatus === "request_more_evidence") score -= 0.14;

  score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));

  let status = "adapter_prepared";

  if (routeStatus === "pass_to_default_router") status = "adapter_bypassed_to_default_router";
  else if (routeStatus === "finance_ready") status = "adapter_ready";
  else if (routeStatus === "finance_ready_with_caveats") status = "adapter_ready_with_caveats";
  else if (routeStatus === "handoff_review") status = "adapter_hold_for_review";
  else if (routeStatus === "request_more_evidence") status = "adapter_requires_more_evidence";
  else if (routeStatus === "finance_blocked") status = "adapter_blocked";
  else if (routeStatus === "finance_failed") status = "adapter_failed";

  return {
    status,
    score,
    routeStatus,
    canReturnToMarion:
      status === "adapter_ready" ||
      status === "adapter_ready_with_caveats" ||
      status === "adapter_bypassed_to_default_router",
    canReturnToNyx:
      status === "adapter_ready" ||
      status === "adapter_ready_with_caveats" ||
      status === "adapter_bypassed_to_default_router",
    canReturnWithCaveats:
      status === "adapter_ready_with_caveats",
    requiresHumanReview:
      status === "adapter_hold_for_review" ||
      status === "adapter_blocked" ||
      status === "adapter_failed",
    requiresMoreEvidence:
      status === "adapter_requires_more_evidence",
    blocked:
      status === "adapter_blocked",
    failed:
      status === "adapter_failed",
    responseLength: String(marionResponse.replyText || marionResponse.reply || "").length,
    uiBlockCount: safeArray(marionResponse.uiBlocks).length
  };
}

class FinanceDomainAdapterEnvelope {
  constructor(payload = {}) {
    Object.assign(this, FinanceDomainAdapterEnvelope.create(payload));
  }

  static create(payload = {}) {
    const requestId =
      payload.requestId ||
      `fin_domain_adapter_req_${Date.now().toString(36)}`;

    const traceId =
      payload.traceId ||
      generateTraceId({ ...payload, requestId });

    const domainDecision = payload.domainDecision || {};
    const runtimeBridge = payload.runtimeBridge || null;
    const orchestrationEnvelope = payload.orchestrationEnvelope || null;
    const marionResponse = payload.marionResponse || null;
    const nyxResponse = payload.nyxResponse || null;
    const routeStatus = payload.routeStatus || "unknown";

    const bridgeReadiness =
      payload.bridgeReadiness ||
      calculateBridgeReadiness({
        ...payload,
        domainDecision,
        runtimeBridge,
        orchestrationEnvelope,
        marionResponse,
        nyxResponse,
        routeStatus
      });

    const diagnostics = {
      ok:
        bridgeReadiness.status === "adapter_ready" ||
        bridgeReadiness.status === "adapter_ready_with_caveats" ||
        bridgeReadiness.status === "adapter_bypassed_to_default_router",
      valid:
        bridgeReadiness.status !== "adapter_failed",
      warnings: uniqueArray([
        bridgeReadiness.canReturnWithCaveats ? "adapter_ready_with_caveats" : null,
        bridgeReadiness.requiresHumanReview ? "adapter_requires_human_review" : null,
        bridgeReadiness.requiresMoreEvidence ? "adapter_requires_more_evidence" : null
      ]),
      errors: uniqueArray([
        bridgeReadiness.blocked ? "adapter_blocked" : null,
        bridgeReadiness.failed ? "adapter_failed" : null
      ]),
      ...(payload.diagnostics || {})
    };

    return {
      requestId,
      traceId,
      schemaVersion: ADAPTER_VERSION,
      version: ADAPTER_VERSION,
      envelopeVersion: ADAPTER_VERSION,
      envelopeType: "finance_marion_nyx_domain_adapter_envelope",
      domain: "finance",
      layer: ADAPTER_LAYER,
      runtimeLayer: "layer12_marion_nyx_bridge",
      sourceLayer: "layer11_runtime_orchestration",
      createdAt: new Date().toISOString(),

      queryContext: {
        originalQuery: payload.originalQuery || "",
        normalizedQuery: payload.normalizedQuery || normalizeText(payload.originalQuery || "")
      },

      domainDecision,
      routeStatus,
      runtimeBridge,
      orchestrationEnvelope,
      marionResponse,
      nyxResponse,
      bridgeReadiness,
      diagnostics,

      runtimeResponse:
        orchestrationEnvelope && orchestrationEnvelope.runtimeResponse ||
        runtimeBridge && runtimeBridge.runtimeResponse ||
        null,

      uiDelivery:
        orchestrationEnvelope && orchestrationEnvelope.uiDelivery ||
        runtimeBridge && runtimeBridge.uiDelivery ||
        marionResponse && marionResponse.uiDelivery ||
        null,

      telemetry:
        orchestrationEnvelope && orchestrationEnvelope.telemetry ||
        runtimeBridge && runtimeBridge.telemetry ||
        marionResponse && marionResponse.telemetry ||
        null,

      nextLayerHandoff: {
        canReturnToMarion: bridgeReadiness.canReturnToMarion,
        canReturnToNyx: bridgeReadiness.canReturnToNyx,
        canReturnWithCaveats: bridgeReadiness.canReturnWithCaveats,
        requiresHumanReview: bridgeReadiness.requiresHumanReview,
        requiresMoreEvidence: bridgeReadiness.requiresMoreEvidence,
        blocked: bridgeReadiness.blocked,
        failed: bridgeReadiness.failed,
        routeStatus,
        bridgeReadinessStatus: bridgeReadiness.status,
        responseLength: bridgeReadiness.responseLength,
        uiBlockCount: bridgeReadiness.uiBlockCount
      }
    };
  }

  static validate(envelope = {}) {
    const errors = [];

    if (envelope.domain !== "finance") {
      errors.push("Envelope domain must be finance.");
    }

    if (envelope.layer !== ADAPTER_LAYER) {
      errors.push(`Envelope layer must be ${ADAPTER_LAYER}.`);
    }

    if (envelope.runtimeLayer !== "layer12_marion_nyx_bridge") {
      errors.push("runtimeLayer must be layer12_marion_nyx_bridge.");
    }

    if (!envelope.domainDecision || typeof envelope.domainDecision !== "object") {
      errors.push("domainDecision is required.");
    }

    if (!envelope.bridgeReadiness || typeof envelope.bridgeReadiness !== "object") {
      errors.push("bridgeReadiness is required.");
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
    return calculateBridgeReadiness(payload);
  }

  static build(payload = {}) { return FinanceDomainAdapterEnvelope.create(payload); }
  static wrap(payload = {}) { return FinanceDomainAdapterEnvelope.create(payload); }
  static compose(payload = {}) { return FinanceDomainAdapterEnvelope.create(payload); }
  static toEnvelope(payload = {}) { return FinanceDomainAdapterEnvelope.create(payload); }
}

module.exports = {
  FinanceDomainAdapterEnvelope
};
