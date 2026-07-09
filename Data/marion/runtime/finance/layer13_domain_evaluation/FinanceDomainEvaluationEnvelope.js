"use strict";

/**
 * R18D Layer 13 — Finance Domain Evaluation Envelope
 * Stable final envelope for finance-domain evaluation and validation.
 *
 * No external dependencies.
 */

const EVALUATION_VERSION = "1.0.0";
const EVALUATION_LAYER = "R18D_layer13_finance_domain_evaluation_validation_harness";

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
  return `fin_l13_${stableSlug(seed).slice(0, 32)}_${Date.now().toString(36)}`;
}

function calculateEvaluationReadiness(payload = {}) {
  const regressionAudit = payload.regressionAudit || {};
  const scenarioResults = safeArray(payload.scenarioResults);
  const aggregateScore =
    typeof payload.aggregateScore === "number"
      ? payload.aggregateScore
      : typeof regressionAudit.aggregateScore === "number"
        ? regressionAudit.aggregateScore
        : 0;

  const evaluationStatus =
    regressionAudit.evaluationStatus ||
    statusForAggregate(aggregateScore, scenarioResults);

  const failedScenarioCount =
    typeof regressionAudit.failedScenarioCount === "number"
      ? regressionAudit.failedScenarioCount
      : scenarioResults.filter((item) => item.failed).length;

  const criticalFailureCount =
    typeof regressionAudit.criticalFailureCount === "number"
      ? regressionAudit.criticalFailureCount
      : scenarioResults.filter((item) => item.score && item.score.critical).length;

  return {
    status: readinessStatusForEvaluation(evaluationStatus),
    evaluationStatus,
    score: aggregateScore,
    totalScenarios: scenarioResults.length,
    passedScenarioCount:
      typeof regressionAudit.passedScenarioCount === "number"
        ? regressionAudit.passedScenarioCount
        : scenarioResults.filter((item) => item.passed).length,
    failedScenarioCount,
    warningScenarioCount:
      typeof regressionAudit.warningScenarioCount === "number"
        ? regressionAudit.warningScenarioCount
        : scenarioResults.filter((item) => item.warning).length,
    criticalFailureCount,
    canPromoteDomain:
      evaluationStatus === "evaluation_passed" ||
      evaluationStatus === "evaluation_passed_with_warnings",
    canPromoteWithWarnings:
      evaluationStatus === "evaluation_passed_with_warnings",
    requiresRegressionPatch:
      evaluationStatus === "evaluation_failed" ||
      criticalFailureCount > 0,
    requiresReview:
      evaluationStatus === "evaluation_partial" ||
      evaluationStatus === "evaluation_failed",
    blocked:
      evaluationStatus === "evaluation_blocked",
    failed:
      evaluationStatus === "evaluation_failed"
  };
}

function statusForAggregate(score, scenarioResults = []) {
  if (scenarioResults.length === 0) return "evaluation_blocked";
  if (score >= 0.9) return "evaluation_passed";
  if (score >= 0.75) return "evaluation_passed_with_warnings";
  if (score >= 0.5) return "evaluation_partial";
  return "evaluation_failed";
}

function readinessStatusForEvaluation(evaluationStatus) {
  const map = {
    evaluation_passed: "evaluation_ready",
    evaluation_passed_with_warnings: "evaluation_ready_with_warnings",
    evaluation_partial: "evaluation_partial",
    evaluation_failed: "evaluation_failed",
    evaluation_blocked: "evaluation_blocked"
  };

  return map[evaluationStatus] || "evaluation_unknown";
}

class FinanceDomainEvaluationEnvelope {
  constructor(payload = {}) {
    Object.assign(this, FinanceDomainEvaluationEnvelope.create(payload));
  }

  static create(payload = {}) {
    const requestId =
      payload.requestId ||
      `fin_eval_req_${Date.now().toString(36)}`;

    const traceId =
      payload.traceId ||
      generateTraceId({ ...payload, requestId });

    const scenarioResults = safeArray(payload.scenarioResults);
    const regressionAudit = payload.regressionAudit || {};
    const aggregateScore =
      typeof payload.aggregateScore === "number"
        ? payload.aggregateScore
        : typeof regressionAudit.aggregateScore === "number"
          ? regressionAudit.aggregateScore
          : 0;

    const evaluationStatus =
      regressionAudit.evaluationStatus ||
      statusForAggregate(aggregateScore, scenarioResults);

    const evaluationReadiness =
      payload.evaluationReadiness ||
      calculateEvaluationReadiness({
        ...payload,
        scenarioResults,
        regressionAudit,
        aggregateScore
      });

    const diagnostics = {
      ok:
        evaluationStatus === "evaluation_passed" ||
        evaluationStatus === "evaluation_passed_with_warnings",
      valid:
        evaluationStatus !== "evaluation_blocked",
      warnings: uniqueArray([
        ...safeArray(regressionAudit.warnings),
        evaluationReadiness.canPromoteWithWarnings ? "evaluation_promotable_with_warnings" : null
      ]),
      errors: uniqueArray([
        ...safeArray(regressionAudit.errors),
        evaluationReadiness.requiresRegressionPatch ? "evaluation_requires_regression_patch" : null
      ]),
      ...(payload.diagnostics || {})
    };

    return {
      requestId,
      traceId,
      schemaVersion: EVALUATION_VERSION,
      version: EVALUATION_VERSION,
      envelopeVersion: EVALUATION_VERSION,
      envelopeType: "finance_domain_evaluation_envelope",
      domain: "finance",
      layer: EVALUATION_LAYER,
      runtimeLayer: "layer13_domain_evaluation",
      sourceLayer: "layer12_marion_nyx_bridge",
      createdAt: new Date().toISOString(),

      queryContext: {
        originalQuery: payload.originalQuery || "",
        normalizedQuery: payload.normalizedQuery || normalizeText(payload.originalQuery || "")
      },

      evaluationContext: payload.evaluationContext || {},
      evaluationStatus,
      evaluationReadiness,
      scenarioResults,
      aggregateScore,
      regressionAudit,
      diagnostics,

      nextLayerHandoff: {
        canPromoteFinanceDomain:
          evaluationReadiness.canPromoteDomain === true,
        canPromoteWithWarnings:
          evaluationReadiness.canPromoteWithWarnings === true,
        requiresRegressionPatch:
          evaluationReadiness.requiresRegressionPatch === true,
        requiresHumanReview:
          evaluationReadiness.requiresReview === true,
        blocked:
          evaluationReadiness.blocked === true,
        failed:
          evaluationReadiness.failed === true,
        evaluationStatus,
        evaluationReadinessStatus: evaluationReadiness.status,
        aggregateScore: evaluationReadiness.score,
        totalScenarios: evaluationReadiness.totalScenarios,
        failedScenarioCount: evaluationReadiness.failedScenarioCount,
        criticalFailureCount: evaluationReadiness.criticalFailureCount
      }
    };
  }

  static validate(envelope = {}) {
    const errors = [];

    if (envelope.domain !== "finance") {
      errors.push("Envelope domain must be finance.");
    }

    if (envelope.layer !== EVALUATION_LAYER) {
      errors.push(`Envelope layer must be ${EVALUATION_LAYER}.`);
    }

    if (envelope.runtimeLayer !== "layer13_domain_evaluation") {
      errors.push("runtimeLayer must be layer13_domain_evaluation.");
    }

    if (!envelope.evaluationStatus) {
      errors.push("evaluationStatus is required.");
    }

    if (!envelope.evaluationReadiness || typeof envelope.evaluationReadiness !== "object") {
      errors.push("evaluationReadiness is required.");
    }

    if (!Array.isArray(envelope.scenarioResults)) {
      errors.push("scenarioResults must be an array.");
    }

    if (!envelope.regressionAudit || typeof envelope.regressionAudit !== "object") {
      errors.push("regressionAudit is required.");
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
    return calculateEvaluationReadiness(payload);
  }

  static build(payload = {}) { return FinanceDomainEvaluationEnvelope.create(payload); }
  static wrap(payload = {}) { return FinanceDomainEvaluationEnvelope.create(payload); }
  static compose(payload = {}) { return FinanceDomainEvaluationEnvelope.create(payload); }
  static toEnvelope(payload = {}) { return FinanceDomainEvaluationEnvelope.create(payload); }
}

module.exports = {
  FinanceDomainEvaluationEnvelope
};
