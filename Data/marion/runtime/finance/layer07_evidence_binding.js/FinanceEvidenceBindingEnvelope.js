"use strict";

/**
 * R18D Layer 07 — Finance Evidence Binding Envelope
 * Stable Layer 07 handoff envelope for evidence-bound finance execution results,
 * claim support scoring, verification gaps, and downstream synthesis readiness.
 *
 * No external dependencies.
 */

const EVIDENCE_BINDING_VERSION = "1.0.0";
const EVIDENCE_BINDING_LAYER = "R18D_layer07_finance_evidence_binding";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function stableSlug(value) {
  const slug = normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "unknown";
}

function uniqueArray(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function generateTraceId(payload = {}) {
  const seed = payload.traceId || payload.requestId || payload.originalQuery || Date.now();
  return `fin_l07_${stableSlug(seed).slice(0, 32)}_${Date.now().toString(36)}`;
}

function calculateEvidenceReadiness(payload = {}) {
  const boundEvidence = payload.boundEvidence || {};
  const boundResults = safeArray(boundEvidence.evidenceBoundResults);
  const resultSupportScores = safeArray(payload.resultSupportScores);
  const verificationGaps = safeArray(payload.verificationGaps);
  const evidenceRequirements = safeArray(payload.evidenceRequirements);

  const blockingGaps = verificationGaps.filter((gap) => gap.severity === "blocking");
  const highGaps = verificationGaps.filter((gap) => gap.severity === "high");
  const unsupportedScores = resultSupportScores.filter((score) => score.supportStatus === "unsupported");
  const blockedScores = resultSupportScores.filter((score) => score.supportStatus === "blocked_pending_evidence");
  const strongOrAdequate = resultSupportScores.filter((score) => {
    return score.supportStatus === "strong_support" || score.supportStatus === "adequate_support";
  });

  let score = 0;

  if (boundResults.length > 0) score += 0.18;
  if (resultSupportScores.length > 0) score += 0.16;
  if (strongOrAdequate.length > 0) {
    score += Math.min(0.36, strongOrAdequate.length * 0.08);
  }
  if (evidenceRequirements.length > 0) score += 0.08;
  if (verificationGaps.length === 0) score += 0.18;

  score -= Math.min(0.35, blockingGaps.length * 0.16);
  score -= Math.min(0.24, highGaps.length * 0.08);
  score -= Math.min(0.18, unsupportedScores.length * 0.05);
  score -= Math.min(0.26, blockedScores.length * 0.12);

  score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));

  let status = "partially_evidence_bound";

  if (blockingGaps.length > 0 || blockedScores.length > 0) {
    status = "blocked_pending_evidence";
  } else if (boundResults.length === 0) {
    status = "no_results_to_bind";
  } else if (unsupportedScores.length > 0 || highGaps.length > 0) {
    status = "needs_evidence_caveats";
  } else if (score >= 0.72) {
    status = "evidence_bound";
  }

  return {
    status,
    score,
    boundResultCount: boundResults.length,
    supportedResultCount: strongOrAdequate.length,
    unsupportedResultCount: unsupportedScores.length,
    blockingIssues: uniqueArray([
      ...blockingGaps.map((gap) => gap.gapCode),
      ...blockedScores.map((scoreItem) => scoreItem.resultId)
    ]),
    warnings: uniqueArray([
      ...verificationGaps.filter((gap) => gap.severity !== "blocking").map((gap) => gap.gapCode),
      ...resultSupportScores
        .filter((scoreItem) => scoreItem.shouldCaveat)
        .map((scoreItem) => `caveat_result:${scoreItem.resultId}`)
    ])
  };
}

class FinanceEvidenceBindingEnvelope {
  constructor(payload = {}) {
    Object.assign(this, FinanceEvidenceBindingEnvelope.create(payload));
  }

  static create(payload = {}) {
    const requestId = payload.requestId || `fin_evidence_req_${Date.now().toString(36)}`;
    const traceId = payload.traceId || generateTraceId({ ...payload, requestId });

    const boundEvidence = payload.boundEvidence || {
      evidenceBoundResults: [],
      byResultType: {},
      executionResultCount: 0,
      boundResultCount: 0
    };

    const sourceRequirementMap = safeArray(payload.sourceRequirementMap);
    const resultSupportScores = safeArray(payload.resultSupportScores);
    const verificationGaps = safeArray(payload.verificationGaps);

    const evidenceReadiness =
      payload.evidenceReadiness ||
      calculateEvidenceReadiness({
        ...payload,
        boundEvidence,
        sourceRequirementMap,
        resultSupportScores,
        verificationGaps
      });

    const diagnostics = {
      ok:
        evidenceReadiness.status !== "blocked_pending_evidence" &&
        evidenceReadiness.status !== "no_results_to_bind",
      valid:
        evidenceReadiness.status !== "blocked_pending_evidence" &&
        evidenceReadiness.status !== "no_results_to_bind",
      warnings: evidenceReadiness.warnings,
      errors: evidenceReadiness.blockingIssues.map((item) => `blocking:${item}`),
      ...(payload.diagnostics || {})
    };

    return {
      requestId,
      traceId,
      schemaVersion: EVIDENCE_BINDING_VERSION,
      version: EVIDENCE_BINDING_VERSION,
      envelopeVersion: EVIDENCE_BINDING_VERSION,
      envelopeType: "finance_evidence_binding_envelope",
      domain: "finance",
      layer: EVIDENCE_BINDING_LAYER,
      runtimeLayer: "layer07_evidence_binding",
      parentEnvelopeVersion: payload.parentEnvelopeVersion || null,
      sourceLayer: payload.sourceLayer || "layer06_analysis_execution",
      createdAt: new Date().toISOString(),

      queryContext: {
        originalQuery: payload.originalQuery || "",
        normalizedQuery: payload.normalizedQuery || normalizeText(payload.originalQuery || "")
      },

      analysisPlan: payload.analysisPlan || null,
      analysisReadiness: payload.analysisReadiness || null,
      executionQuality: payload.executionQuality || null,
      normalizationQuality: payload.normalizationQuality || null,
      ingestionQuality: payload.ingestionQuality || null,

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

      sourceRequirementMap,
      boundEvidence,
      evidenceBoundResults: safeArray(boundEvidence.evidenceBoundResults),
      resultSupportScores,
      verificationGaps,
      evidenceReadiness,
      diagnostics,

      nextLayerHandoff: {
        canProceedToSynthesis:
          evidenceReadiness.status === "evidence_bound" ||
          evidenceReadiness.status === "partially_evidence_bound" ||
          evidenceReadiness.status === "needs_evidence_caveats",
        canProceedWithCaveats:
          evidenceReadiness.status === "partially_evidence_bound" ||
          evidenceReadiness.status === "needs_evidence_caveats",
        requiresEvidenceVerification:
          evidenceReadiness.status === "blocked_pending_evidence" ||
          verificationGaps.some((gap) => ["blocking", "high", "medium"].includes(gap.severity)),
        requiresUserClarification:
          verificationGaps.some((gap) => normalizeText(gap.gapCode).includes("assumption requires confirmation")) ||
          safeArray(payload.missingInputs).some((item) => item.severity === "required" || item.blocksAnalysis === true),
        evidenceStatus: evidenceReadiness.status,
        supportScoreCount: resultSupportScores.length,
        verificationGapCount: verificationGaps.length,
        boundResultCount: evidenceReadiness.boundResultCount
      }
    };
  }

  static validate(envelope = {}) {
    const errors = [];

    if (envelope.domain !== "finance") {
      errors.push("Envelope domain must be finance.");
    }

    if (envelope.layer !== EVIDENCE_BINDING_LAYER) {
      errors.push(`Envelope layer must be ${EVIDENCE_BINDING_LAYER}.`);
    }

    if (!envelope.boundEvidence || typeof envelope.boundEvidence !== "object") {
      errors.push("boundEvidence is required.");
    }

    if (!Array.isArray(envelope.sourceRequirementMap)) {
      errors.push("sourceRequirementMap must be an array.");
    }

    if (!Array.isArray(envelope.resultSupportScores)) {
      errors.push("resultSupportScores must be an array.");
    }

    if (!Array.isArray(envelope.verificationGaps)) {
      errors.push("verificationGaps must be an array.");
    }

    if (!envelope.evidenceReadiness || typeof envelope.evidenceReadiness !== "object") {
      errors.push("evidenceReadiness is required.");
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
    return calculateEvidenceReadiness(payload);
  }

  static build(payload = {}) { return FinanceEvidenceBindingEnvelope.create(payload); }
  static wrap(payload = {}) { return FinanceEvidenceBindingEnvelope.create(payload); }
  static compose(payload = {}) { return FinanceEvidenceBindingEnvelope.create(payload); }
  static toEnvelope(payload = {}) { return FinanceEvidenceBindingEnvelope.create(payload); }
}

module.exports = {
  FinanceEvidenceBindingEnvelope
};
