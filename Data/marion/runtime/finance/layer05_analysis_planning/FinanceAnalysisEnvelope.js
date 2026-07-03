"use strict";

/**
 * R18D Layer 05 — Finance Analysis Envelope
 * Stable Layer 05 handoff envelope for analysis planning, ratio mapping,
 * scenario framing, risk flags, and evidence requirements.
 *
 * No external dependencies.
 */

const ANALYSIS_VERSION = "1.0.0";
const ANALYSIS_LAYER = "R18D_layer05_finance_analysis_planning";

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
  return `fin_l05_${stableSlug(seed).slice(0, 32)}_${Date.now().toString(36)}`;
}

function calculateAnalysisReadiness(payload = {}) {
  const analysisPlan = payload.analysisPlan || {};
  const ratioMap = payload.ratioMap || {};
  const scenarioFrame = payload.scenarioFrame || {};
  const riskFlags = safeArray(payload.riskFlags);
  const evidenceRequirements = safeArray(payload.evidenceRequirements);
  const normalizedMetrics = safeArray(payload.normalizedMetrics);

  const blockingRisks = riskFlags.filter((risk) => risk.severity === "blocking");
  const requiredEvidence = evidenceRequirements.filter((item) => item.priority === "required");
  const blockingEvidence = requiredEvidence.filter((item) => item.blockingWithoutEvidence === true);

  let score = 0;

  if (analysisPlan.primaryRoute && analysisPlan.primaryRoute !== "insufficient_analysis_context") score += 0.24;
  if (normalizedMetrics.length > 0) score += Math.min(0.2, normalizedMetrics.length * 0.04);
  if (safeArray(ratioMap.calculableRatios).length > 0) score += 0.14;
  if (safeArray(ratioMap.directlyProvidedRatios).length > 0) score += 0.08;
  if (scenarioFrame.scenarioRequired === false || scenarioFrame.readinessStatus === "scenario_ready") score += 0.12;
  if (riskFlags.length === 0) score += 0.1;
  if (evidenceRequirements.length > 0) score += 0.08;

  score -= Math.min(0.35, blockingRisks.length * 0.16);
  score -= Math.min(0.25, blockingEvidence.length * 0.12);

  score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));

  let status = "analysis_planned";

  if (!analysisPlan.primaryRoute || analysisPlan.primaryRoute === "insufficient_analysis_context") {
    status = "insufficient_context";
  } else if (blockingRisks.length > 0 || blockingEvidence.length > 0) {
    status = "blocked";
  } else if (analysisPlan.readinessStatus === "needs_clarification") {
    status = "needs_clarification";
  } else if (score >= 0.75) {
    status = "ready_for_execution";
  }

  return {
    status,
    score,
    blockingIssues: uniqueArray([
      ...blockingRisks.map((risk) => risk.riskCode),
      ...blockingEvidence.map((item) => item.requirementCode)
    ]),
    warnings: uniqueArray([
      ...riskFlags.filter((risk) => risk.severity !== "blocking").map((risk) => risk.riskCode),
      ...requiredEvidence.map((item) => `evidence_required:${item.requirementCode}`)
    ])
  };
}

class FinanceAnalysisEnvelope {
  constructor(payload = {}) {
    Object.assign(this, FinanceAnalysisEnvelope.create(payload));
  }

  static create(payload = {}) {
    const requestId = payload.requestId || `fin_analysis_req_${Date.now().toString(36)}`;
    const traceId = payload.traceId || generateTraceId({ ...payload, requestId });

    const analysisPlan = payload.analysisPlan || {
      primaryRoute: "insufficient_analysis_context",
      secondaryRoutes: [],
      readinessStatus: "needs_clarification",
      confidence: 0.35
    };

    const ratioMap = payload.ratioMap || {
      ratioCandidates: [],
      directlyProvidedRatios: [],
      calculableRatios: [],
      partiallyAvailableRatios: [],
      unavailableRatios: []
    };

    const scenarioFrame = payload.scenarioFrame || {
      scenarioRequired: false,
      scenarioTypes: [],
      readinessStatus: "scenario_not_required"
    };

    const riskFlags = safeArray(payload.riskFlags);
    const evidenceRequirements = safeArray(payload.evidenceRequirements);

    const analysisReadiness =
      payload.analysisReadiness ||
      calculateAnalysisReadiness({
        ...payload,
        analysisPlan,
        ratioMap,
        scenarioFrame,
        riskFlags,
        evidenceRequirements
      });

    const diagnostics = {
      ok: analysisReadiness.status !== "blocked" && analysisReadiness.status !== "insufficient_context",
      valid: analysisReadiness.status !== "blocked" && analysisReadiness.status !== "insufficient_context",
      warnings: analysisReadiness.warnings,
      errors: analysisReadiness.blockingIssues.map((item) => `blocking:${item}`),
      ...(payload.diagnostics || {})
    };

    return {
      requestId,
      traceId,
      schemaVersion: ANALYSIS_VERSION,
      version: ANALYSIS_VERSION,
      envelopeVersion: ANALYSIS_VERSION,
      envelopeType: "finance_analysis_planning_envelope",
      domain: "finance",
      layer: ANALYSIS_LAYER,
      runtimeLayer: "layer05_analysis_planning",
      parentEnvelopeVersion: payload.parentEnvelopeVersion || null,
      sourceLayer: payload.sourceLayer || "layer04_normalization",
      createdAt: new Date().toISOString(),

      queryContext: {
        originalQuery: payload.originalQuery || "",
        normalizedQuery: payload.normalizedQuery || normalizeText(payload.originalQuery || ""),
        claimTargets: safeArray(payload.claimTargets)
      },

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

      metricMap: payload.metricMap || {},
      entityMap: payload.entityMap || {},
      periodMap: payload.periodMap || {},
      sourceMap: payload.sourceMap || {},

      assumptions: safeArray(payload.assumptions),
      missingInputs: safeArray(payload.missingInputs),
      missing: safeArray(payload.missingInputs),
      ingestionQuality: payload.ingestionQuality || null,
      normalizationQuality: payload.normalizationQuality || null,

      analysisPlan,
      ratioMap,
      scenarioFrame,
      riskFlags,
      evidenceRequirements,
      analysisReadiness,
      diagnostics,

      nextLayerHandoff: {
        canProceedToExecution:
          analysisReadiness.status === "ready_for_execution" ||
          analysisReadiness.status === "analysis_planned",
        canProceedWithCaveats:
          analysisReadiness.status === "needs_clarification" &&
          !analysisReadiness.blockingIssues.length,
        requiresUserClarification:
          analysisReadiness.status === "needs_clarification" ||
          safeArray(payload.missingInputs).some((item) => item.severity === "required" || item.blocksAnalysis === true),
        requiresEvidenceVerification:
          evidenceRequirements.some((item) => item.priority === "required") ||
          riskFlags.some((risk) => String(risk.riskCode || "").includes("verification")),
        primaryAnalysisRoute: analysisPlan.primaryRoute || null,
        ratioCandidateCount: safeArray(ratioMap.ratioCandidates).length,
        calculableRatioCount: safeArray(ratioMap.calculableRatios).length,
        riskCount: riskFlags.length,
        evidenceRequirementCount: evidenceRequirements.length
      }
    };
  }

  static validate(envelope = {}) {
    const errors = [];

    if (envelope.domain !== "finance") {
      errors.push("Envelope domain must be finance.");
    }

    if (envelope.layer !== ANALYSIS_LAYER) {
      errors.push(`Envelope layer must be ${ANALYSIS_LAYER}.`);
    }

    if (!envelope.analysisPlan || typeof envelope.analysisPlan !== "object") {
      errors.push("analysisPlan is required.");
    }

    if (!envelope.ratioMap || typeof envelope.ratioMap !== "object") {
      errors.push("ratioMap is required.");
    }

    if (!envelope.scenarioFrame || typeof envelope.scenarioFrame !== "object") {
      errors.push("scenarioFrame is required.");
    }

    if (!Array.isArray(envelope.riskFlags)) {
      errors.push("riskFlags must be an array.");
    }

    if (!Array.isArray(envelope.evidenceRequirements)) {
      errors.push("evidenceRequirements must be an array.");
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
    return calculateAnalysisReadiness(payload);
  }

  static build(payload = {}) { return FinanceAnalysisEnvelope.create(payload); }
  static wrap(payload = {}) { return FinanceAnalysisEnvelope.create(payload); }
  static compose(payload = {}) { return FinanceAnalysisEnvelope.create(payload); }
  static toEnvelope(payload = {}) { return FinanceAnalysisEnvelope.create(payload); }
}

module.exports = {
  FinanceAnalysisEnvelope
};
