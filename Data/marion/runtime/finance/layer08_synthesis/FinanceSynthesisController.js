"use strict";

/**
 * R18D Layer 08 — Finance Synthesis Controller
 * Consumes Layer 07 evidence-bound finance envelopes and prepares a structured
 * answer package for downstream final rendering.
 *
 * Boundary:
 * - Does not ingest.
 * - Does not normalize.
 * - Does not plan analysis.
 * - Does not calculate.
 * - Does not fetch or verify external data.
 * - Does not apply final persona/prose rendering.
 *
 * No external dependencies.
 */

const { FinanceAnswerPlanner } = require("./FinanceAnswerPlanner");
const { FinanceCaveatComposer } = require("./FinanceCaveatComposer");
const { FinanceResultPrioritizer } = require("./FinanceResultPrioritizer");
const { FinanceSynthesisEnvelope } = require("./FinanceSynthesisEnvelope");

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

class FinanceSynthesisController {
  constructor(options = {}) {
    this.resultPrioritizer =
      options.resultPrioritizer || new FinanceResultPrioritizer(options);

    this.caveatComposer =
      options.caveatComposer || new FinanceCaveatComposer(options);

    this.answerPlanner =
      options.answerPlanner || new FinanceAnswerPlanner(options);
  }

  synthesize(input = {}) {
    const normalizedInput = this.normalizeInput(input);

    const prioritizedResults = this.resultPrioritizer.prioritize({
      queryText: normalizedInput.queryText,
      analysisPlan: normalizedInput.analysisPlan,
      evidenceReadiness: normalizedInput.evidenceReadiness,
      boundEvidence: normalizedInput.boundEvidence,
      resultSupportScores: normalizedInput.resultSupportScores,
      verificationGaps: normalizedInput.verificationGaps,
      ratioResults: normalizedInput.ratioResults,
      trendResults: normalizedInput.trendResults,
      peerComparison: normalizedInput.peerComparison,
      scenarioResults: normalizedInput.scenarioResults,
      valuationResults: normalizedInput.valuationResults
    });

    const caveats = this.caveatComposer.compose({
      queryText: normalizedInput.queryText,
      evidenceReadiness: normalizedInput.evidenceReadiness,
      prioritizedResults: prioritizedResults.prioritizedResults,
      resultSupportScores: normalizedInput.resultSupportScores,
      verificationGaps: normalizedInput.verificationGaps,
      evidenceRequirements: normalizedInput.evidenceRequirements,
      assumptions: normalizedInput.assumptions,
      missingInputs: normalizedInput.missingInputs,
      riskFlags: normalizedInput.riskFlags,
      nextLayerHandoff: normalizedInput.nextLayerHandoff
    });

    const answerPlan = this.answerPlanner.plan({
      queryText: normalizedInput.queryText,
      analysisPlan: normalizedInput.analysisPlan,
      evidenceReadiness: normalizedInput.evidenceReadiness,
      executionQuality: normalizedInput.executionQuality,
      prioritizedResults: prioritizedResults.prioritizedResults,
      resultGroups: prioritizedResults.resultGroups,
      caveats: caveats.caveats,
      assumptionNotes: caveats.assumptionNotes,
      evidenceNotes: caveats.evidenceNotes,
      blockedItems: caveats.blockedItems,
      missingInputs: normalizedInput.missingInputs,
      verificationGaps: normalizedInput.verificationGaps
    });

    return FinanceSynthesisEnvelope.create({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      parentEnvelopeVersion: normalizedInput.envelopeVersion,
      sourceLayer: normalizedInput.sourceLayer,
      originalQuery: normalizedInput.queryText,
      normalizedQuery: normalizeText(normalizedInput.queryText),

      analysisPlan: normalizedInput.analysisPlan,
      analysisReadiness: normalizedInput.analysisReadiness,
      executionQuality: normalizedInput.executionQuality,
      evidenceReadiness: normalizedInput.evidenceReadiness,
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

      boundEvidence: normalizedInput.boundEvidence,
      evidenceBoundResults: normalizedInput.evidenceBoundResults,
      sourceRequirementMap: normalizedInput.sourceRequirementMap,
      resultSupportScores: normalizedInput.resultSupportScores,
      verificationGaps: normalizedInput.verificationGaps,

      prioritizedResults: prioritizedResults.prioritizedResults,
      resultGroups: prioritizedResults.resultGroups,
      caveats: caveats.caveats,
      evidenceNotes: caveats.evidenceNotes,
      assumptionNotes: caveats.assumptionNotes,
      blockedItems: caveats.blockedItems,
      answerPlan: answerPlan.answerPlan,
      answerSections: answerPlan.answerSections,
      finalAnswerPackage: answerPlan.finalAnswerPackage,

      riskFlags: normalizedInput.riskFlags,
      evidenceRequirements: normalizedInput.evidenceRequirements,
      assumptions: normalizedInput.assumptions,
      missingInputs: normalizedInput.missingInputs,

      diagnostics: {
        controller: {
          ok: true,
          warnings: [],
          errors: []
        },
        prioritizer: prioritizedResults.diagnostics,
        caveats: caveats.diagnostics,
        answerPlanner: answerPlan.diagnostics
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
      sourceLayer: input.layer || input.runtimeLayer || "layer07_evidence_binding",
      queryText,

      analysisPlan: input.analysisPlan || {},
      analysisReadiness: input.analysisReadiness || null,
      executionQuality: input.executionQuality || null,
      evidenceReadiness: input.evidenceReadiness || null,
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

      boundEvidence: input.boundEvidence || {},
      evidenceBoundResults: safeArray(input.evidenceBoundResults || (input.boundEvidence && input.boundEvidence.evidenceBoundResults)),
      sourceRequirementMap: safeArray(input.sourceRequirementMap),
      resultSupportScores: safeArray(input.resultSupportScores),
      verificationGaps: safeArray(input.verificationGaps),

      riskFlags: safeArray(input.riskFlags),
      evidenceRequirements: safeArray(input.evidenceRequirements),
      assumptions: safeArray(input.assumptions),
      missingInputs: safeArray(input.missingInputs || input.missing),
      nextLayerHandoff: input.nextLayerHandoff || {}
    };
  }

  prepare(input = {}) { return this.synthesize(input); }
  process(input = {}) { return this.synthesize(input); }
  execute(input = {}) { return this.synthesize(input); }
  run(input = {}) { return this.synthesize(input); }

  static synthesize(input = {}, options = {}) {
    return new FinanceSynthesisController(options).synthesize(input);
  }
}

module.exports = {
  FinanceSynthesisController
};
