"use strict";

/**
 * R18D Layer 06 — Finance Execution Envelope
 * Stable Layer 06 handoff envelope for calculated ratios, trends, peer comparison,
 * scenarios, valuation readiness, and downstream synthesis.
 *
 * No external dependencies.
 */

const EXECUTION_VERSION = "1.0.0";
const EXECUTION_LAYER = "R18D_layer06_finance_analysis_execution";

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
  return `fin_l06_${stableSlug(seed).slice(0, 32)}_${Date.now().toString(36)}`;
}

function calculateExecutionQuality(payload = {}) {
  const ratioResults = payload.ratioResults || {};
  const trendResults = payload.trendResults || {};
  const peerComparison = payload.peerComparison || {};
  const scenarioResults = payload.scenarioResults || {};
  const valuationResults = payload.valuationResults || {};
  const riskFlags = safeArray(payload.riskFlags);
  const evidenceRequirements = safeArray(payload.evidenceRequirements);

  const blockingRisks = riskFlags.filter((risk) => risk.severity === "blocking");
  const blockingEvidence = evidenceRequirements.filter((item) => item.blockingWithoutEvidence === true);

  const ratioCount = safeArray(ratioResults.executableRatios).length + safeArray(ratioResults.directRatios).filter((item) => item.executionStatus === "direct_ratio_value_available").length;
  const trendCount = safeArray(trendResults.executableTrends).length;
  const peerCount = safeArray(peerComparison.executableComparisons).length;
  const scenarioCount = safeArray(scenarioResults.executableScenarios).length;
  const valuationCount = safeArray(valuationResults.executableValuations).length;

  let score = 0;

  if (payload.analysisPlan && payload.analysisPlan.primaryRoute) score += 0.14;
  if (ratioCount > 0) score += Math.min(0.2, ratioCount * 0.06);
  if (trendCount > 0) score += Math.min(0.16, trendCount * 0.05);
  if (peerCount > 0) score += Math.min(0.14, peerCount * 0.05);
  if (scenarioCount > 0) score += Math.min(0.16, scenarioCount * 0.06);
  if (valuationCount > 0) score += Math.min(0.12, valuationCount * 0.06);

  if (
    ratioCount === 0 &&
    trendCount === 0 &&
    peerCount === 0 &&
    scenarioCount === 0 &&
    valuationCount === 0 &&
    safeArray(payload.normalizedMetrics).length > 0
  ) {
    score += 0.18;
  }

  score -= Math.min(0.35, blockingRisks.length * 0.16);
  score -= Math.min(0.25, blockingEvidence.length * 0.12);

  score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));

  let status = "partial_execution";

  if (blockingRisks.length > 0 || blockingEvidence.length > 0) {
    status = "blocked";
  } else if (ratioCount + trendCount + peerCount + scenarioCount + valuationCount > 0) {
    status = "executed";
  } else if (safeArray(payload.normalizedMetrics).length === 0) {
    status = "insufficient_execution_inputs";
  }

  return {
    status,
    score,
    executableResultCounts: {
      ratios: ratioCount,
      trends: trendCount,
      peerComparisons: peerCount,
      scenarios: scenarioCount,
      valuations: valuationCount
    },
    blockingIssues: uniqueArray([
      ...blockingRisks.map((risk) => risk.riskCode),
      ...blockingEvidence.map((item) => item.requirementCode)
    ]),
    warnings: uniqueArray([
      ...riskFlags.filter((risk) => risk.severity !== "blocking").map((risk) => risk.riskCode),
      ...evidenceRequirements.filter((item) => item.priority === "required").map((item) => `evidence_required:${item.requirementCode}`)
    ])
  };
}

class FinanceExecutionEnvelope {
  constructor(payload = {}) {
    Object.assign(this, FinanceExecutionEnvelope.create(payload));
  }

  static create(payload = {}) {
    const requestId = payload.requestId || `fin_execution_req_${Date.now().toString(36)}`;
    const traceId = payload.traceId || generateTraceId({ ...payload, requestId });

    const ratioResults = payload.ratioResults || {
      calculatedRatios: [],
      directRatios: [],
      executableRatios: [],
      partialRatios: [],
      unavailableRatios: []
    };

    const trendResults = payload.trendResults || {
      trendLines: [],
      executableTrends: [],
      partialTrends: []
    };

    const peerComparison = payload.peerComparison || {
      comparisonMatrix: [],
      metricComparisons: [],
      executableComparisons: [],
      partialComparisons: []
    };

    const scenarioResults = payload.scenarioResults || {
      scenarioOutputs: [],
      executableScenarios: [],
      partialScenarios: []
    };

    const valuationResults = payload.valuationResults || {
      valuationChecks: [],
      executableValuations: [],
      partialValuations: []
    };

    const executionQuality =
      payload.executionQuality ||
      calculateExecutionQuality({
        ...payload,
        ratioResults,
        trendResults,
        peerComparison,
        scenarioResults,
        valuationResults
      });

    const diagnostics = {
      ok: executionQuality.status !== "blocked" && executionQuality.status !== "insufficient_execution_inputs",
      valid: executionQuality.status !== "blocked" && executionQuality.status !== "insufficient_execution_inputs",
      warnings: executionQuality.warnings,
      errors: executionQuality.blockingIssues.map((item) => `blocking:${item}`),
      ...(payload.diagnostics || {})
    };

    return {
      requestId,
      traceId,
      schemaVersion: EXECUTION_VERSION,
      version: EXECUTION_VERSION,
      envelopeVersion: EXECUTION_VERSION,
      envelopeType: "finance_analysis_execution_envelope",
      domain: "finance",
      layer: EXECUTION_LAYER,
      runtimeLayer: "layer06_analysis_execution",
      parentEnvelopeVersion: payload.parentEnvelopeVersion || null,
      sourceLayer: payload.sourceLayer || "layer05_analysis_planning",
      createdAt: new Date().toISOString(),

      queryContext: {
        originalQuery: payload.originalQuery || "",
        normalizedQuery: payload.normalizedQuery || normalizeText(payload.originalQuery || "")
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

      assumptions: safeArray(payload.assumptions),
      missingInputs: safeArray(payload.missingInputs),
      missing: safeArray(payload.missingInputs),
      ingestionQuality: payload.ingestionQuality || null,
      normalizationQuality: payload.normalizationQuality || null,
      analysisReadiness: payload.analysisReadiness || null,

      analysisPlan: payload.analysisPlan || null,
      ratioMap: payload.ratioMap || null,
      scenarioFrame: payload.scenarioFrame || null,
      riskFlags: safeArray(payload.riskFlags),
      evidenceRequirements: safeArray(payload.evidenceRequirements),

      ratioResults,
      trendResults,
      peerComparison,
      scenarioResults,
      valuationResults,

      executionQuality,
      diagnostics,

      nextLayerHandoff: {
        canProceedToSynthesis:
          executionQuality.status === "executed" ||
          executionQuality.status === "partial_execution",
        canProceedWithCaveats:
          executionQuality.status === "partial_execution" &&
          executionQuality.blockingIssues.length === 0,
        requiresUserClarification:
          safeArray(payload.missingInputs).some((item) => item.severity === "required" || item.blocksAnalysis === true),
        requiresEvidenceVerification:
          safeArray(payload.evidenceRequirements).some((item) => item.priority === "required") ||
          safeArray(payload.riskFlags).some((risk) => String(risk.riskCode || "").includes("verification")),
        executionStatus: executionQuality.status,
        executableResultCounts: executionQuality.executableResultCounts
      }
    };
  }

  static validate(envelope = {}) {
    const errors = [];

    if (envelope.domain !== "finance") {
      errors.push("Envelope domain must be finance.");
    }

    if (envelope.layer !== EXECUTION_LAYER) {
      errors.push(`Envelope layer must be ${EXECUTION_LAYER}.`);
    }

    if (!envelope.ratioResults || typeof envelope.ratioResults !== "object") {
      errors.push("ratioResults is required.");
    }

    if (!envelope.trendResults || typeof envelope.trendResults !== "object") {
      errors.push("trendResults is required.");
    }

    if (!envelope.peerComparison || typeof envelope.peerComparison !== "object") {
      errors.push("peerComparison is required.");
    }

    if (!envelope.scenarioResults || typeof envelope.scenarioResults !== "object") {
      errors.push("scenarioResults is required.");
    }

    if (!envelope.valuationResults || typeof envelope.valuationResults !== "object") {
      errors.push("valuationResults is required.");
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
    return calculateExecutionQuality(payload);
  }

  static build(payload = {}) { return FinanceExecutionEnvelope.create(payload); }
  static wrap(payload = {}) { return FinanceExecutionEnvelope.create(payload); }
  static compose(payload = {}) { return FinanceExecutionEnvelope.create(payload); }
  static toEnvelope(payload = {}) { return FinanceExecutionEnvelope.create(payload); }
}

module.exports = {
  FinanceExecutionEnvelope
};
