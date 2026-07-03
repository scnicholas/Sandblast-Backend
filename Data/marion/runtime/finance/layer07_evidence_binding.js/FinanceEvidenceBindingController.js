"use strict";

/**
 * R18D Layer 07 — Finance Evidence Binding Controller
 * Consumes Layer 06 finance execution envelopes and binds execution outputs
 * to available source/evidence lineage without fetching new data.
 *
 * Boundary:
 * - Does not ingest.
 * - Does not normalize.
 * - Does not plan.
 * - Does not calculate.
 * - Does not compose final user-facing prose.
 *
 * No external dependencies.
 */

const { FinanceResultEvidenceBinder } = require("./FinanceResultEvidenceBinder");
const { FinanceSourceRequirementMapper } = require("./FinanceSourceRequirementMapper");
const { FinanceClaimSupportScorer } = require("./FinanceClaimSupportScorer");
const { FinanceVerificationGapDetector } = require("./FinanceVerificationGapDetector");
const { FinanceEvidenceBindingEnvelope } = require("./FinanceEvidenceBindingEnvelope");

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

class FinanceEvidenceBindingController {
  constructor(options = {}) {
    this.resultEvidenceBinder =
      options.resultEvidenceBinder || new FinanceResultEvidenceBinder(options);

    this.sourceRequirementMapper =
      options.sourceRequirementMapper || new FinanceSourceRequirementMapper(options);

    this.claimSupportScorer =
      options.claimSupportScorer || new FinanceClaimSupportScorer(options);

    this.verificationGapDetector =
      options.verificationGapDetector || new FinanceVerificationGapDetector(options);
  }

  bind(input = {}) {
    const normalizedInput = this.normalizeInput(input);

    const sourceRequirementMap = this.sourceRequirementMapper.map({
      queryText: normalizedInput.queryText,
      analysisPlan: normalizedInput.analysisPlan,
      ratioResults: normalizedInput.ratioResults,
      trendResults: normalizedInput.trendResults,
      peerComparison: normalizedInput.peerComparison,
      scenarioResults: normalizedInput.scenarioResults,
      valuationResults: normalizedInput.valuationResults,
      evidenceRequirements: normalizedInput.evidenceRequirements,
      normalizedSources: normalizedInput.normalizedSources,
      normalizedMetrics: normalizedInput.normalizedMetrics,
      assumptions: normalizedInput.assumptions
    });

    const boundEvidence = this.resultEvidenceBinder.bind({
      queryText: normalizedInput.queryText,
      normalizedMetrics: normalizedInput.normalizedMetrics,
      normalizedSources: normalizedInput.normalizedSources,
      ratioResults: normalizedInput.ratioResults,
      trendResults: normalizedInput.trendResults,
      peerComparison: normalizedInput.peerComparison,
      scenarioResults: normalizedInput.scenarioResults,
      valuationResults: normalizedInput.valuationResults,
      evidenceRequirements: normalizedInput.evidenceRequirements,
      sourceRequirementMap: sourceRequirementMap.sourceRequirementMap,
      assumptions: normalizedInput.assumptions
    });

    const resultSupportScores = this.claimSupportScorer.score({
      boundEvidence: boundEvidence.boundEvidence,
      sourceRequirementMap: sourceRequirementMap.sourceRequirementMap,
      evidenceRequirements: normalizedInput.evidenceRequirements,
      normalizedSources: normalizedInput.normalizedSources,
      assumptions: normalizedInput.assumptions,
      riskFlags: normalizedInput.riskFlags
    });

    const verificationGaps = this.verificationGapDetector.detect({
      boundEvidence: boundEvidence.boundEvidence,
      sourceRequirementMap: sourceRequirementMap.sourceRequirementMap,
      resultSupportScores: resultSupportScores.resultSupportScores,
      evidenceRequirements: normalizedInput.evidenceRequirements,
      normalizedSources: normalizedInput.normalizedSources,
      normalizedMetrics: normalizedInput.normalizedMetrics,
      assumptions: normalizedInput.assumptions,
      riskFlags: normalizedInput.riskFlags
    });

    return FinanceEvidenceBindingEnvelope.create({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      parentEnvelopeVersion: normalizedInput.envelopeVersion,
      sourceLayer: normalizedInput.sourceLayer,
      originalQuery: normalizedInput.queryText,
      normalizedQuery: normalizeText(normalizedInput.queryText),

      analysisPlan: normalizedInput.analysisPlan,
      analysisReadiness: normalizedInput.analysisReadiness,
      executionQuality: normalizedInput.executionQuality,
      normalizationQuality: normalizedInput.normalizationQuality,
      ingestionQuality: normalizedInput.ingestionQuality,

      normalizedMetrics: normalizedInput.normalizedMetrics,
      normalizedEntities: normalizedInput.normalizedEntities,
      normalizedPeriods: normalizedInput.normalizedPeriods,
      normalizedSources: normalizedInput.normalizedSources,

      ratioResults: normalizedInput.ratioResults,
      trendResults: normalizedInput.trendResults,
      peerComparison: normalizedInput.peerComparison,
      scenarioResults: normalizedInput.scenarioResults,
      valuationResults: normalizedInput.valuationResults,

      riskFlags: normalizedInput.riskFlags,
      evidenceRequirements: normalizedInput.evidenceRequirements,
      assumptions: normalizedInput.assumptions,
      missingInputs: normalizedInput.missingInputs,

      sourceRequirementMap: sourceRequirementMap.sourceRequirementMap,
      boundEvidence: boundEvidence.boundEvidence,
      resultSupportScores: resultSupportScores.resultSupportScores,
      verificationGaps: verificationGaps.verificationGaps,

      diagnostics: {
        controller: {
          ok: true,
          warnings: [],
          errors: []
        },
        sourceRequirements: sourceRequirementMap.diagnostics,
        binding: boundEvidence.diagnostics,
        scoring: resultSupportScores.diagnostics,
        gaps: verificationGaps.diagnostics
      }
    });
  }

  normalizeInput(input = {}) {
    const queryContext = input.queryContext || {};
    const normalizedEntities = input.normalizedEntities || {};

    const queryText = firstValue(
      input.originalQuery,
      input.query,
      input.userText,
      input.rawInput,
      queryContext.originalQuery,
      queryContext.normalizedQuery,
      ""
    );

    return {
      requestId: input.requestId || input.id || null,
      traceId: input.traceId || null,
      envelopeVersion: input.envelopeVersion || input.schemaVersion || input.version || null,
      sourceLayer: input.layer || input.runtimeLayer || "layer06_analysis_execution",
      queryText,

      analysisPlan: input.analysisPlan || {},
      analysisReadiness: input.analysisReadiness || null,
      executionQuality: input.executionQuality || null,
      normalizationQuality: input.normalizationQuality || null,
      ingestionQuality: input.ingestionQuality || null,

      normalizedMetrics: safeArray(input.normalizedMetrics),
      normalizedEntities: {
        companies: safeArray(normalizedEntities.companies),
        businessNames: safeArray(normalizedEntities.businessNames),
        programs: safeArray(normalizedEntities.programs),
        jurisdictions: safeArray(normalizedEntities.jurisdictions),
        sources: safeArray(normalizedEntities.sources)
      },
      normalizedPeriods: safeArray(input.normalizedPeriods),
      normalizedSources: safeArray(input.normalizedSources),

      ratioResults: input.ratioResults || {},
      trendResults: input.trendResults || {},
      peerComparison: input.peerComparison || {},
      scenarioResults: input.scenarioResults || {},
      valuationResults: input.valuationResults || {},

      riskFlags: safeArray(input.riskFlags),
      evidenceRequirements: safeArray(input.evidenceRequirements),
      assumptions: safeArray(input.assumptions),
      missingInputs: safeArray(input.missingInputs || input.missing)
    };
  }

  process(input = {}) { return this.bind(input); }
  execute(input = {}) { return this.bind(input); }
  run(input = {}) { return this.bind(input); }

  static bind(input = {}, options = {}) {
    return new FinanceEvidenceBindingController(options).bind(input);
  }
}

module.exports = {
  FinanceEvidenceBindingController
};
