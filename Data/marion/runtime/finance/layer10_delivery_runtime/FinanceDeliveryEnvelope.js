"use strict";

/**
 * R18D Layer 10 — Finance Delivery Envelope
 * Stable Layer 10 handoff envelope for runtime delivery integration.
 *
 * No external dependencies.
 */

const DELIVERY_VERSION = "1.0.0";
const DELIVERY_LAYER = "R18D_layer10_finance_delivery_runtime_integration";

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
  return `fin_l10_${stableSlug(seed).slice(0, 32)}_${Date.now().toString(36)}`;
}

function calculateDeliveryReadiness(payload = {}) {
  const deliveryPolicy = payload.deliveryPolicy || {};
  const runtimeResponse = payload.runtimeResponse || {};
  const uiDelivery = payload.uiDelivery || {};
  const telemetry = payload.telemetry || {};

  const status = deliveryPolicy.status || "unknown";
  const replyText = String(runtimeResponse.replyText || "");
  const blockCount = safeArray(uiDelivery.blocks).length;

  let score = 0;

  if (replyText.length > 0) score += 0.28;
  if (deliveryPolicy.canDeliver) score += 0.28;
  if (uiDelivery.mainAnswer || blockCount > 0) score += 0.16;
  if (telemetry.telemetryId) score += 0.1;
  if (!deliveryPolicy.requiresReview) score += 0.1;
  if (!deliveryPolicy.requiresMoreEvidence) score += 0.08;

  if (status === "blocked") score -= 0.4;
  if (status === "hold_for_review") score -= 0.24;
  if (status === "request_more_evidence") score -= 0.18;
  if (deliveryPolicy.requiresCaveats) score -= 0.04;

  score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));

  let readinessStatus = "delivery_prepared";

  if (status === "blocked") {
    readinessStatus = "delivery_blocked";
  } else if (status === "hold_for_review") {
    readinessStatus = "delivery_hold_for_review";
  } else if (status === "request_more_evidence") {
    readinessStatus = "delivery_requires_more_evidence";
  } else if (status === "deliver_with_caveats") {
    readinessStatus = "delivery_ready_with_caveats";
  } else if (status === "deliver" && score >= 0.72) {
    readinessStatus = "delivery_ready";
  }

  return {
    status: readinessStatus,
    score,
    canDeliver: Boolean(deliveryPolicy.canDeliver),
    requiresReview: Boolean(deliveryPolicy.requiresReview),
    requiresCaveats: Boolean(deliveryPolicy.requiresCaveats),
    requiresMoreEvidence: Boolean(deliveryPolicy.requiresMoreEvidence),
    runtimeReplyLength: replyText.length,
    uiBlockCount: blockCount,
    telemetryEmitted: Boolean(telemetry.telemetryId),
    blockingIssues: uniqueArray(deliveryPolicy.blockingReasons || []),
    warnings: uniqueArray(deliveryPolicy.warnings || [])
  };
}

class FinanceDeliveryEnvelope {
  constructor(payload = {}) {
    Object.assign(this, FinanceDeliveryEnvelope.create(payload));
  }

  static create(payload = {}) {
    const requestId = payload.requestId || `fin_delivery_req_${Date.now().toString(36)}`;
    const traceId = payload.traceId || generateTraceId({ ...payload, requestId });

    const runtimeResponse = payload.runtimeResponse || {};
    const uiDelivery = payload.uiDelivery || {};
    const deliveryPolicy = payload.deliveryPolicy || {};
    const telemetry = payload.telemetry || {};

    const deliveryReadiness =
      payload.deliveryReadiness ||
      calculateDeliveryReadiness({
        ...payload,
        runtimeResponse,
        uiDelivery,
        deliveryPolicy,
        telemetry
      });

    const diagnostics = {
      ok:
        deliveryReadiness.status === "delivery_ready" ||
        deliveryReadiness.status === "delivery_ready_with_caveats" ||
        deliveryReadiness.status === "delivery_prepared",
      valid: deliveryReadiness.status !== "delivery_blocked",
      warnings: deliveryReadiness.warnings,
      errors: deliveryReadiness.blockingIssues.map((item) => `blocking:${item}`),
      ...(payload.diagnostics || {})
    };

    return {
      requestId,
      traceId,
      schemaVersion: DELIVERY_VERSION,
      version: DELIVERY_VERSION,
      envelopeVersion: DELIVERY_VERSION,
      envelopeType: "finance_delivery_runtime_envelope",
      domain: "finance",
      layer: DELIVERY_LAYER,
      runtimeLayer: "layer10_delivery_runtime",
      parentEnvelopeVersion: payload.parentEnvelopeVersion || null,
      sourceLayer: payload.sourceLayer || "layer09_final_response",
      createdAt: new Date().toISOString(),

      queryContext: {
        originalQuery: payload.originalQuery || "",
        normalizedQuery: payload.normalizedQuery || normalizeText(payload.originalQuery || "")
      },

      finalResponseText: payload.finalResponseText || "",
      finalResponseBlocks: safeArray(payload.finalResponseBlocks),
      renderedSections: safeArray(payload.renderedSections),

      runtimeResponse,
      uiDelivery,
      deliveryPolicy,
      telemetry,
      deliveryReadiness,
      diagnostics,

      responseReadiness: payload.responseReadiness || null,
      synthesisReadiness: payload.synthesisReadiness || null,
      evidenceReadiness: payload.evidenceReadiness || null,
      executionQuality: payload.executionQuality || null,
      analysisReadiness: payload.analysisReadiness || null,
      normalizationQuality: payload.normalizationQuality || null,
      ingestionQuality: payload.ingestionQuality || null,

      answerPlan: payload.answerPlan || null,
      answerSections: safeArray(payload.answerSections),
      finalAnswerPackage: payload.finalAnswerPackage || null,

      caveatsApplied: safeArray(payload.caveatsApplied),
      blockedClaims: safeArray(payload.blockedClaims),
      toneGuardFindings: safeArray(payload.toneGuardFindings),

      prioritizedResults: safeArray(payload.prioritizedResults),
      resultGroups: payload.resultGroups || {},
      caveats: safeArray(payload.caveats),
      evidenceNotes: safeArray(payload.evidenceNotes),
      assumptionNotes: safeArray(payload.assumptionNotes),
      blockedItems: safeArray(payload.blockedItems),

      boundEvidence: payload.boundEvidence || {},
      evidenceBoundResults: safeArray(payload.evidenceBoundResults),
      sourceRequirementMap: safeArray(payload.sourceRequirementMap),
      resultSupportScores: safeArray(payload.resultSupportScores),
      verificationGaps: safeArray(payload.verificationGaps),

      normalizedMetrics: safeArray(payload.normalizedMetrics),
      normalizedEntities: payload.normalizedEntities || {
        companies: [],
        businessNames: [],
        programs: [],
        jurisdictions: [],
        sources: []
      },
      normalizedPeriods: safeArray(payload.normalizedPeriods),
      normalizedSources: safeArray(payload.normalizedSources),

      ratioResults: payload.ratioResults || {},
      trendResults: payload.trendResults || {},
      peerComparison: payload.peerComparison || {},
      scenarioResults: payload.scenarioResults || {},
      valuationResults: payload.valuationResults || {},

      assumptions: safeArray(payload.assumptions),
      missingInputs: safeArray(payload.missingInputs),
      missing: safeArray(payload.missingInputs),
      riskFlags: safeArray(payload.riskFlags),
      evidenceRequirements: safeArray(payload.evidenceRequirements),

      nextLayerHandoff: {
        canReturnToRuntime:
          deliveryReadiness.status === "delivery_ready" ||
          deliveryReadiness.status === "delivery_ready_with_caveats" ||
          deliveryReadiness.status === "delivery_prepared",
        canReturnToRuntimeWithCaveats:
          deliveryReadiness.status === "delivery_ready_with_caveats" ||
          deliveryPolicy.requiresCaveats === true,
        requiresHumanReview:
          deliveryReadiness.status === "delivery_hold_for_review" ||
          deliveryPolicy.requiresReview === true,
        requiresMoreEvidence:
          deliveryReadiness.status === "delivery_requires_more_evidence" ||
          deliveryPolicy.requiresMoreEvidence === true,
        blocked:
          deliveryReadiness.status === "delivery_blocked",
        deliveryStatus: deliveryPolicy.status || "unknown",
        deliveryReadinessStatus: deliveryReadiness.status,
        runtimeReplyLength: deliveryReadiness.runtimeReplyLength,
        uiBlockCount: deliveryReadiness.uiBlockCount,
        telemetryEmitted: deliveryReadiness.telemetryEmitted
      }
    };
  }

  static validate(envelope = {}) {
    const errors = [];

    if (envelope.domain !== "finance") {
      errors.push("Envelope domain must be finance.");
    }

    if (envelope.layer !== DELIVERY_LAYER) {
      errors.push(`Envelope layer must be ${DELIVERY_LAYER}.`);
    }

    if (!envelope.runtimeResponse || typeof envelope.runtimeResponse !== "object") {
      errors.push("runtimeResponse is required.");
    }

    if (!envelope.uiDelivery || typeof envelope.uiDelivery !== "object") {
      errors.push("uiDelivery is required.");
    }

    if (!envelope.deliveryPolicy || typeof envelope.deliveryPolicy !== "object") {
      errors.push("deliveryPolicy is required.");
    }

    if (!envelope.telemetry || typeof envelope.telemetry !== "object") {
      errors.push("telemetry is required.");
    }

    if (!envelope.deliveryReadiness || typeof envelope.deliveryReadiness !== "object") {
      errors.push("deliveryReadiness is required.");
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
    return calculateDeliveryReadiness(payload);
  }

  static build(payload = {}) { return FinanceDeliveryEnvelope.create(payload); }
  static wrap(payload = {}) { return FinanceDeliveryEnvelope.create(payload); }
  static compose(payload = {}) { return FinanceDeliveryEnvelope.create(payload); }
  static toEnvelope(payload = {}) { return FinanceDeliveryEnvelope.create(payload); }
}

module.exports = {
  FinanceDeliveryEnvelope
};
