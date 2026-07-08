"use strict";

/**
 * R18D Layer 09 — Finance Final Response Envelope
 * Stable Layer 09 handoff envelope for final rendered finance responses.
 *
 * No external dependencies.
 */

const FINAL_RESPONSE_VERSION = "1.0.0";
const FINAL_RESPONSE_LAYER = "R18D_layer09_finance_final_response_narrative_rendering";

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
  return `fin_l09_${stableSlug(seed).slice(0, 32)}_${Date.now().toString(36)}`;
}

function calculateResponseReadiness(payload = {}) {
  const finalResponseText = String(payload.finalResponseText || "").trim();
  const renderedSections = safeArray(payload.renderedSections);
  const caveatsApplied = safeArray(payload.caveatsApplied);
  const blockedClaims = safeArray(payload.blockedClaims);
  const toneGuardFindings = safeArray(payload.toneGuardFindings);

  const blockingToneFindings = toneGuardFindings.filter((item) => item.severity === "blocking");
  const blockingClaims = blockedClaims.filter((item) => item.severity === "blocking");
  const highToneFindings = toneGuardFindings.filter((item) => item.severity === "high");

  let score = 0;

  if (finalResponseText.length > 0) score += 0.35;
  if (renderedSections.length > 0) score += 0.2;
  if (payload.finalResponseBlocks && payload.finalResponseBlocks.length > 0) score += 0.12;
  if (caveatsApplied.length === 0 || finalResponseText.toLowerCase().includes("caveat")) score += 0.1;
  if (blockingClaims.length === 0) score += 0.12;
  if (blockingToneFindings.length === 0) score += 0.11;

  score -= Math.min(0.28, blockingClaims.length * 0.14);
  score -= Math.min(0.24, blockingToneFindings.length * 0.12);
  score -= Math.min(0.16, highToneFindings.length * 0.08);

  score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));

  let status = "response_rendered";

  if (!finalResponseText) {
    status = "empty_response";
  } else if (blockingToneFindings.length > 0 || blockingClaims.length > 0) {
    status = "response_rendered_with_blocks";
  } else if (caveatsApplied.length > 0 || highToneFindings.length > 0) {
    status = "response_rendered_with_caveats";
  } else if (score >= 0.72) {
    status = "ready_for_delivery";
  }

  return {
    status,
    score,
    renderedSectionCount: renderedSections.length,
    responseLength: finalResponseText.length,
    caveatCount: caveatsApplied.length,
    blockedClaimCount: blockedClaims.length,
    toneFindingCount: toneGuardFindings.length,
    blockingIssues: uniqueArray([
      ...blockingClaims.map((item) => item.code || item.blockedClaimId),
      ...blockingToneFindings.map((item) => item.findingCode)
    ]),
    warnings: uniqueArray([
      ...caveatsApplied.map((item) => item.caveatCode),
      ...highToneFindings.map((item) => item.findingCode)
    ])
  };
}

class FinanceFinalResponseEnvelope {
  constructor(payload = {}) {
    Object.assign(this, FinanceFinalResponseEnvelope.create(payload));
  }

  static create(payload = {}) {
    const requestId = payload.requestId || `fin_final_response_req_${Date.now().toString(36)}`;
    const traceId = payload.traceId || generateTraceId({ ...payload, requestId });

    const renderedSections = safeArray(payload.renderedSections);
    const finalResponseBlocks = safeArray(payload.finalResponseBlocks);
    const caveatsApplied = safeArray(payload.caveatsApplied);
    const blockedClaims = safeArray(payload.blockedClaims);
    const toneGuardFindings = safeArray(payload.toneGuardFindings);

    const responseReadiness =
      payload.responseReadiness ||
      calculateResponseReadiness({
        ...payload,
        renderedSections,
        finalResponseBlocks,
        caveatsApplied,
        blockedClaims,
        toneGuardFindings
      });

    const diagnostics = {
      ok:
        responseReadiness.status !== "empty_response" &&
        responseReadiness.status !== "response_rendered_with_blocks",
      valid: responseReadiness.status !== "empty_response",
      warnings: responseReadiness.warnings,
      errors: responseReadiness.blockingIssues.map((item) => `blocking:${item}`),
      ...(payload.diagnostics || {})
    };

    return {
      requestId,
      traceId,
      schemaVersion: FINAL_RESPONSE_VERSION,
      version: FINAL_RESPONSE_VERSION,
      envelopeVersion: FINAL_RESPONSE_VERSION,
      envelopeType: "finance_final_response_envelope",
      domain: "finance",
      layer: FINAL_RESPONSE_LAYER,
      runtimeLayer: "layer09_final_response",
      parentEnvelopeVersion: payload.parentEnvelopeVersion || null,
      sourceLayer: payload.sourceLayer || "layer08_synthesis",
      createdAt: new Date().toISOString(),

      queryContext: {
        originalQuery: payload.originalQuery || "",
        normalizedQuery: payload.normalizedQuery || normalizeText(payload.originalQuery || "")
      },

      analysisPlan: payload.analysisPlan || null,
      analysisReadiness: payload.analysisReadiness || null,
      executionQuality: payload.executionQuality || null,
      evidenceReadiness: payload.evidenceReadiness || null,
      synthesisReadiness: payload.synthesisReadiness || null,
      normalizationQuality: payload.normalizationQuality || null,
      ingestionQuality: payload.ingestionQuality || null,

      answerPlan: payload.answerPlan || null,
      answerSections: safeArray(payload.answerSections),
      finalAnswerPackage: payload.finalAnswerPackage || null,

      renderedSections,
      finalResponseText: payload.finalResponseText || "",
      finalResponseBlocks,
      caveatsApplied,
      blockedClaims,
      toneGuardFindings,
      responseReadiness,
      diagnostics,

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
        canDeliverToUser:
          responseReadiness.status === "ready_for_delivery" ||
          responseReadiness.status === "response_rendered" ||
          responseReadiness.status === "response_rendered_with_caveats",
        canDeliverWithCaveats:
          responseReadiness.status === "response_rendered_with_caveats" ||
          caveatsApplied.length > 0,
        requiresReviewBeforeDelivery:
          responseReadiness.status === "response_rendered_with_blocks" ||
          responseReadiness.status === "empty_response",
        requiresEvidenceVerification:
          safeArray(payload.verificationGaps).some((gap) => ["blocking", "high", "medium"].includes(gap.severity)),
        finalResponseStatus: responseReadiness.status,
        responseLength: responseReadiness.responseLength,
        caveatCount: responseReadiness.caveatCount,
        blockedClaimCount: responseReadiness.blockedClaimCount,
        toneFindingCount: responseReadiness.toneFindingCount
      }
    };
  }

  static validate(envelope = {}) {
    const errors = [];

    if (envelope.domain !== "finance") {
      errors.push("Envelope domain must be finance.");
    }

    if (envelope.layer !== FINAL_RESPONSE_LAYER) {
      errors.push(`Envelope layer must be ${FINAL_RESPONSE_LAYER}.`);
    }

    if (typeof envelope.finalResponseText !== "string") {
      errors.push("finalResponseText must be a string.");
    }

    if (!Array.isArray(envelope.renderedSections)) {
      errors.push("renderedSections must be an array.");
    }

    if (!Array.isArray(envelope.finalResponseBlocks)) {
      errors.push("finalResponseBlocks must be an array.");
    }

    if (!Array.isArray(envelope.caveatsApplied)) {
      errors.push("caveatsApplied must be an array.");
    }

    if (!Array.isArray(envelope.blockedClaims)) {
      errors.push("blockedClaims must be an array.");
    }

    if (!Array.isArray(envelope.toneGuardFindings)) {
      errors.push("toneGuardFindings must be an array.");
    }

    if (!envelope.responseReadiness || typeof envelope.responseReadiness !== "object") {
      errors.push("responseReadiness is required.");
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
    return calculateResponseReadiness(payload);
  }

  static build(payload = {}) { return FinanceFinalResponseEnvelope.create(payload); }
  static wrap(payload = {}) { return FinanceFinalResponseEnvelope.create(payload); }
  static compose(payload = {}) { return FinanceFinalResponseEnvelope.create(payload); }
  static toEnvelope(payload = {}) { return FinanceFinalResponseEnvelope.create(payload); }
}

module.exports = {
  FinanceFinalResponseEnvelope
};
