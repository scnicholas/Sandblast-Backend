"use strict";

/**
 * R18D Layer 09 — Finance Final Response Controller
 * Consumes Layer 08 synthesis envelopes and renders the final user-facing
 * finance response without recalculating, fetching, or modifying evidence.
 *
 * R18C controller/tone-guard bridge patch:
 * - Passes raw Layer 08 answer material into the tone guard as scan-only context.
 * - This allows the controller path to report unsafe finance wording even when
 *   the unsafe wording is excluded or softened before final delivery.
 *
 * Boundary:
 * - Does not ingest.
 * - Does not normalize.
 * - Does not plan analysis.
 * - Does not calculate.
 * - Does not fetch live market data.
 * - Does not invent sources.
 * - Does not remove caveats.
 *
 * No external dependencies.
 */

const { FinanceNarrativeRenderer } = require("./FinanceNarrativeRenderer");
const { FinanceSectionRenderer } = require("./FinanceSectionRenderer");
const { FinanceCaveatNarrativeInjector } = require("./FinanceCaveatNarrativeInjector");
const { FinanceResponseToneGuard } = require("./FinanceResponseToneGuard");
const { FinanceFinalResponseEnvelope } = require("./FinanceFinalResponseEnvelope");

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function safeJson(value) {
  try {
    return JSON.stringify(value || null);
  } catch (err) {
    return "";
  }
}

class FinanceFinalResponseController {
  constructor(options = {}) {
    this.sectionRenderer =
      options.sectionRenderer || new FinanceSectionRenderer(options);

    this.narrativeRenderer =
      options.narrativeRenderer || new FinanceNarrativeRenderer(options);

    this.caveatInjector =
      options.caveatInjector || new FinanceCaveatNarrativeInjector(options);

    this.toneGuard =
      options.toneGuard || new FinanceResponseToneGuard(options);
  }

  render(input = {}) {
    const normalizedInput = this.normalizeInput(input);

    const sectionRender = this.sectionRenderer.render({
      queryText: normalizedInput.queryText,
      answerPlan: normalizedInput.answerPlan,
      answerSections: normalizedInput.answerSections,
      finalAnswerPackage: normalizedInput.finalAnswerPackage,
      prioritizedResults: normalizedInput.prioritizedResults,
      caveats: normalizedInput.caveats,
      evidenceNotes: normalizedInput.evidenceNotes,
      assumptionNotes: normalizedInput.assumptionNotes,
      blockedItems: normalizedInput.blockedItems
    });

    const narrative = this.narrativeRenderer.render({
      queryText: normalizedInput.queryText,
      answerPlan: normalizedInput.answerPlan,
      synthesisReadiness: normalizedInput.synthesisReadiness,
      answerSections: normalizedInput.answerSections,
      renderedSections: sectionRender.renderedSections,
      finalResponseBlocks: sectionRender.finalResponseBlocks,
      prioritizedResults: normalizedInput.prioritizedResults,
      caveats: normalizedInput.caveats,
      blockedItems: normalizedInput.blockedItems
    });

    const caveatInjection = this.caveatInjector.inject({
      finalResponseText: narrative.finalResponseText,
      renderedSections: narrative.renderedSections,
      finalResponseBlocks: narrative.finalResponseBlocks,
      caveats: normalizedInput.caveats,
      blockedItems: normalizedInput.blockedItems,
      evidenceNotes: normalizedInput.evidenceNotes,
      assumptionNotes: normalizedInput.assumptionNotes,
      verificationGaps: normalizedInput.verificationGaps,
      resultSupportScores: normalizedInput.resultSupportScores
    });

    const toneGuard = this.toneGuard.guard({
      finalResponseText: caveatInjection.finalResponseText,
      renderedSections: caveatInjection.renderedSections,
      finalResponseBlocks: caveatInjection.finalResponseBlocks,
      caveatsApplied: caveatInjection.caveatsApplied,
      blockedClaims: caveatInjection.blockedClaims,
      queryText: normalizedInput.queryText,
      rawTextSources: this.toneGuardScanSources(normalizedInput, sectionRender, narrative, caveatInjection)
    });

    return FinanceFinalResponseEnvelope.create({
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
      synthesisReadiness: normalizedInput.synthesisReadiness,
      normalizationQuality: normalizedInput.normalizationQuality,
      ingestionQuality: normalizedInput.ingestionQuality,

      answerPlan: normalizedInput.answerPlan,
      answerSections: normalizedInput.answerSections,
      finalAnswerPackage: normalizedInput.finalAnswerPackage,

      renderedSections: toneGuard.renderedSections,
      finalResponseText: toneGuard.finalResponseText,
      finalResponseBlocks: toneGuard.finalResponseBlocks,

      prioritizedResults: normalizedInput.prioritizedResults,
      resultGroups: normalizedInput.resultGroups,
      caveats: normalizedInput.caveats,
      caveatsApplied: caveatInjection.caveatsApplied,
      evidenceNotes: normalizedInput.evidenceNotes,
      assumptionNotes: normalizedInput.assumptionNotes,
      blockedItems: normalizedInput.blockedItems,
      blockedClaims: caveatInjection.blockedClaims,

      boundEvidence: normalizedInput.boundEvidence,
      evidenceBoundResults: normalizedInput.evidenceBoundResults,
      sourceRequirementMap: normalizedInput.sourceRequirementMap,
      resultSupportScores: normalizedInput.resultSupportScores,
      verificationGaps: normalizedInput.verificationGaps,

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

      toneGuardFindings: toneGuard.toneGuardFindings,

      diagnostics: {
        controller: {
          ok: true,
          warnings: [],
          errors: []
        },
        sectionRenderer: sectionRender.diagnostics,
        narrativeRenderer: narrative.diagnostics,
        caveatInjector: caveatInjection.diagnostics,
        toneGuard: toneGuard.diagnostics
      }
    });
  }

  toneGuardScanSources(normalizedInput = {}, sectionRender = {}, narrative = {}, caveatInjection = {}) {
    return [
      safeJson(normalizedInput.answerSections),
      safeJson(normalizedInput.finalAnswerPackage),
      safeJson(normalizedInput.prioritizedResults),
      safeJson(normalizedInput.resultGroups),
      safeJson(sectionRender.renderedSections),
      safeJson(sectionRender.finalResponseBlocks),
      safeJson(narrative.finalResponseBlocks),
      safeJson(caveatInjection.finalResponseBlocks)
    ].filter(Boolean);
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

    const finalAnswerPackage = input.finalAnswerPackage || {};
    const packageSections = safeArray(finalAnswerPackage.answerSections);

    return {
      requestId: input.requestId || input.id || null,
      traceId: input.traceId || null,
      envelopeVersion: input.envelopeVersion || input.schemaVersion || input.version || null,
      sourceLayer: input.layer || input.runtimeLayer || "layer08_synthesis",
      queryText,

      analysisPlan: input.analysisPlan || {},
      analysisReadiness: input.analysisReadiness || null,
      executionQuality: input.executionQuality || null,
      evidenceReadiness: input.evidenceReadiness || null,
      synthesisReadiness: input.synthesisReadiness || null,
      normalizationQuality: input.normalizationQuality || null,
      ingestionQuality: input.ingestionQuality || null,

      answerPlan: input.answerPlan || finalAnswerPackage.answerPlan || null,
      answerSections: safeArray(input.answerSections).length > 0
        ? safeArray(input.answerSections)
        : packageSections,
      finalAnswerPackage,

      prioritizedResults: safeArray(input.prioritizedResults),
      resultGroups: input.resultGroups || {},
      caveats: safeArray(input.caveats),
      evidenceNotes: safeArray(input.evidenceNotes),
      assumptionNotes: safeArray(input.assumptionNotes),
      blockedItems: safeArray(input.blockedItems),

      boundEvidence: input.boundEvidence || {},
      evidenceBoundResults: safeArray(input.evidenceBoundResults),
      sourceRequirementMap: safeArray(input.sourceRequirementMap),
      resultSupportScores: safeArray(input.resultSupportScores),
      verificationGaps: safeArray(input.verificationGaps),

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

  prepare(input = {}) { return this.render(input); }
  process(input = {}) { return this.render(input); }
  execute(input = {}) { return this.render(input); }
  run(input = {}) { return this.render(input); }

  static render(input = {}, options = {}) {
    return new FinanceFinalResponseController(options).render(input);
  }

  static prepare(input = {}, options = {}) {
    return new FinanceFinalResponseController(options).render(input);
  }
}

module.exports = {
  FinanceFinalResponseController
};
