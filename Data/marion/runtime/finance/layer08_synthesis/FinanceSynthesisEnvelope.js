"use strict";

/**
 * R18D Layer 08 — Finance Synthesis Envelope
 * Stable Layer 08 handoff envelope for structured answer preparation.
 *
 * No external dependencies.
 */

const SYNTHESIS_VERSION = "1.0.0";
const SYNTHESIS_LAYER = "R18D_layer08_finance_synthesis_answer_preparation";

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
  return `fin_l08_${stableSlug(seed).slice(0, 32)}_${Date.now().toString(36)}`;
}

function calculateSynthesisReadiness(payload = {}) {
  const prioritizedResults = safeArray(payload.prioritizedResults);
  const caveats = safeArray(payload.caveats);
  const blockedItems = safeArray(payload.blockedItems);
  const answerSections = safeArray(payload.answerSections);
  const verificationGaps = safeArray(payload.verificationGaps);

  const blockingCaveats = caveats.filter((item) => item.severity === "blocking");
  const highCaveats = caveats.filter((item) => item.severity === "high");
  const renderableResults = prioritizedResults.filter((item) => item.canUseInFinalSynthesis !== false);
  const caveatedResults = prioritizedResults.filter((item) => item.shouldCaveat === true);

  let score = 0;

  if (answerSections.length > 0) score += 0.16;
  if (renderableResults.length > 0) score += Math.min(0.36, renderableResults.length * 0.08);
  if (payload.finalAnswerPackage) score += 0.16;
  if (caveats.length === 0) score += 0.14;
  if (blockedItems.length === 0) score += 0.12;

  score -= Math.min(0.35, blockingCaveats.length * 0.16);
  score -= Math.min(0.24, highCaveats.length * 0.08);
  score -= Math.min(0.2, blockedItems.length * 0.1);
  score -= Math.min(0.12, verificationGaps.filter((gap) => gap.severity === "high").length * 0.04);

  score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));

  let status = "synthesis_prepared";

  if (blockingCaveats.length > 0 || blockedItems.length > 0) {
    status = "synthesis_blocked_or_partial";
  } else if (renderableResults.length === 0) {
    status = "insufficient_synthesis_material";
  } else if (caveatedResults.length > 0 || highCaveats.length > 0) {
    status = "synthesis_prepared_with_caveats";
  } else if (score >= 0.72) {
    status = "ready_for_final_render";
  }

  return {
    status,
    score,
    renderableResultCount: renderableResults.length,
    caveatedResultCount: caveatedResults.length,
    blockedItemCount: blockedItems.length,
    sectionCount: answerSections.length,
    blockingIssues: uniqueArray([
      ...blockingCaveats.map((item) => item.caveatCode),
      ...blockedItems.map((item) => item.code || item.blockedItemId)
    ]),
    warnings: uniqueArray([
      ...highCaveats.map((item) => item.caveatCode),
      ...caveatedResults.map((item) => `caveated_result:${item.resultId}`)
    ])
  };
}

class FinanceSynthesisEnvelope {
  constructor(payload = {}) {
    Object.assign(this, FinanceSynthesisEnvelope.create(payload));
  }

  static create(payload = {}) {
    const requestId = payload.requestId || `fin_synthesis_req_${Date.now().toString(36)}`;
    const traceId = payload.traceId || generateTraceId({ ...payload, requestId });

    const prioritizedResults = safeArray(payload.prioritizedResults);
    const resultGroups = payload.resultGroups || {};
    const caveats = safeArray(payload.caveats);
    const evidenceNotes = safeArray(payload.evidenceNotes);
    const assumptionNotes = safeArray(payload.assumptionNotes);
    const blockedItems = safeArray(payload.blockedItems);
    const answerSections = safeArray(payload.answerSections);
    const finalAnswerPackage = payload.finalAnswerPackage || {
      packageId: `fin_final_answer_package_${Date.now().toString(36)}`,
      format: "structured_answer_package",
      renderMode: "request_clarification_first",
      answerSections
    };

    const synthesisReadiness =
      payload.synthesisReadiness ||
      calculateSynthesisReadiness({
        ...payload,
        prioritizedResults,
        caveats,
        blockedItems,
        answerSections,
        finalAnswerPackage
      });

    const diagnostics = {
      ok:
        synthesisReadiness.status !== "insufficient_synthesis_material" &&
        synthesisReadiness.status !== "synthesis_blocked_or_partial",
      valid:
        synthesisReadiness.status !== "insufficient_synthesis_material",
      warnings: synthesisReadiness.warnings,
      errors: synthesisReadiness.blockingIssues.map((item) => `blocking:${item}`),
      ...(payload.diagnostics || {})
    };

    return {
      requestId,
      traceId,
      schemaVersion: SYNTHESIS_VERSION,
      version: SYNTHESIS_VERSION,
      envelopeVersion: SYNTHESIS_VERSION,
      envelopeType: "finance_synthesis_answer_preparation_envelope",
      domain: "finance",
      layer: SYNTHESIS_LAYER,
      runtimeLayer: "layer08_synthesis",
      parentEnvelopeVersion: payload.parentEnvelopeVersion || null,
      sourceLayer: payload.sourceLayer || "layer07_evidence_binding",
      createdAt: new Date().toISOString(),

      queryContext: {
        originalQuery: payload.originalQuery || "",
        normalizedQuery: payload.normalizedQuery || normalizeText(payload.originalQuery || "")
      },

      analysisPlan: payload.analysisPlan || null,
      analysisReadiness: payload.analysisReadiness || null,
      executionQuality: payload.executionQuality || null,
      evidenceReadiness: payload.evidenceReadiness || null,
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

      boundEvidence: payload.boundEvidence || {},
      evidenceBoundResults: safeArray(payload.evidenceBoundResults),
      sourceRequirementMap: safeArray(payload.sourceRequirementMap),
      resultSupportScores: safeArray(payload.resultSupportScores),
      verificationGaps: safeArray(payload.verificationGaps),

      prioritizedResults,
      resultGroups,
      caveats,
      evidenceNotes,
      assumptionNotes,
      blockedItems,
      answerPlan: payload.answerPlan || null,
      answerSections,
      finalAnswerPackage,
      synthesisReadiness,
      diagnostics,

      assumptions: safeArray(payload.assumptions),
      missingInputs: safeArray(payload.missingInputs),
      missing: safeArray(payload.missingInputs),
      riskFlags: safeArray(payload.riskFlags),
      evidenceRequirements: safeArray(payload.evidenceRequirements),

      nextLayerHandoff: {
        canProceedToFinalRender:
          synthesisReadiness.status === "ready_for_final_render" ||
          synthesisReadiness.status === "synthesis_prepared" ||
          synthesisReadiness.status === "synthesis_prepared_with_caveats",
        canProceedWithCaveats:
          synthesisReadiness.status === "synthesis_prepared_with_caveats" ||
          synthesisReadiness.status === "synthesis_blocked_or_partial",
        requiresEvidenceVerification:
          safeArray(payload.verificationGaps).some((gap) => ["blocking", "high", "medium"].includes(gap.severity)) ||
          caveats.some((caveat) => ["blocking", "high"].includes(caveat.severity)),
        requiresUserClarification:
          blockedItems.length > 0 ||
          safeArray(payload.missingInputs).some((item) => item.severity === "required" || item.blocksAnalysis === true),
        synthesisStatus: synthesisReadiness.status,
        renderableResultCount: synthesisReadiness.renderableResultCount,
        caveatCount: caveats.length,
        sectionCount: answerSections.length
      }
    };
  }

  static validate(envelope = {}) {
    const errors = [];

    if (envelope.domain !== "finance") {
      errors.push("Envelope domain must be finance.");
    }

    if (envelope.layer !== SYNTHESIS_LAYER) {
      errors.push(`Envelope layer must be ${SYNTHESIS_LAYER}.`);
    }

    if (!Array.isArray(envelope.prioritizedResults)) {
      errors.push("prioritizedResults must be an array.");
    }

    if (!Array.isArray(envelope.caveats)) {
      errors.push("caveats must be an array.");
    }

    if (!Array.isArray(envelope.answerSections)) {
      errors.push("answerSections must be an array.");
    }

    if (!envelope.finalAnswerPackage || typeof envelope.finalAnswerPackage !== "object") {
      errors.push("finalAnswerPackage is required.");
    }

    if (!envelope.synthesisReadiness || typeof envelope.synthesisReadiness !== "object") {
      errors.push("synthesisReadiness is required.");
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
    return calculateSynthesisReadiness(payload);
  }

  static build(payload = {}) { return FinanceSynthesisEnvelope.create(payload); }
  static wrap(payload = {}) { return FinanceSynthesisEnvelope.create(payload); }
  static compose(payload = {}) { return FinanceSynthesisEnvelope.create(payload); }
  static toEnvelope(payload = {}) { return FinanceSynthesisEnvelope.create(payload); }
}

module.exports = {
  FinanceSynthesisEnvelope
};
