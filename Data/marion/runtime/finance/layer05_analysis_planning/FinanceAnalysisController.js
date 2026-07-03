"use strict";

/**
 * R18D Layer 05 — Finance Analysis Controller
 * Consumes Layer 04 finance normalization envelopes and produces an analysis-planning
 * envelope for downstream Layer 06 execution/calculation.
 *
 * No external dependencies.
 */

const { FinanceAnalysisPlanner } = require("./FinanceAnalysisPlanner");
const { FinanceRatioMapper } = require("./FinanceRatioMapper");
const { FinanceScenarioAnalyzer } = require("./FinanceScenarioAnalyzer");
const { FinanceRiskFlagger } = require("./FinanceRiskFlagger");
const { FinanceEvidenceRequirementChecker } = require("./FinanceEvidenceRequirementChecker");
const { FinanceAnalysisEnvelope } = require("./FinanceAnalysisEnvelope");

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

class FinanceAnalysisController {
  constructor(options = {}) {
    this.analysisPlanner = options.analysisPlanner || new FinanceAnalysisPlanner(options);
    this.ratioMapper = options.ratioMapper || new FinanceRatioMapper(options);
    this.scenarioAnalyzer = options.scenarioAnalyzer || new FinanceScenarioAnalyzer(options);
    this.riskFlagger = options.riskFlagger || new FinanceRiskFlagger(options);
    this.evidenceRequirementChecker =
      options.evidenceRequirementChecker || new FinanceEvidenceRequirementChecker(options);
  }

  analyze(input = {}) {
    const normalizedInput = this.normalizeInput(input);

    const analysisPlan = this.analysisPlanner.plan({
      queryText: normalizedInput.queryText,
      claimTargets: normalizedInput.claimTargets,
      normalizedMetrics: normalizedInput.normalizedMetrics,
      normalizedEntities: normalizedInput.normalizedEntities,
      normalizedPeriods: normalizedInput.normalizedPeriods,
      missingInputs: normalizedInput.missingInputs,
      assumptions: normalizedInput.assumptions,
      normalizationQuality: normalizedInput.normalizationQuality
    });

    const ratioMap = this.ratioMapper.map({
      queryText: normalizedInput.queryText,
      normalizedMetrics: normalizedInput.normalizedMetrics,
      normalizedEntities: normalizedInput.normalizedEntities,
      normalizedPeriods: normalizedInput.normalizedPeriods,
      analysisPlan,
      missingInputs: normalizedInput.missingInputs
    });

    const scenarioFrame = this.scenarioAnalyzer.frame({
      queryText: normalizedInput.queryText,
      claimTargets: normalizedInput.claimTargets,
      normalizedMetrics: normalizedInput.normalizedMetrics,
      normalizedEntities: normalizedInput.normalizedEntities,
      normalizedPeriods: normalizedInput.normalizedPeriods,
      assumptions: normalizedInput.assumptions,
      missingInputs: normalizedInput.missingInputs,
      analysisPlan
    });

    const riskFlags = this.riskFlagger.flag({
      queryText: normalizedInput.queryText,
      analysisPlan,
      ratioMap,
      scenarioFrame,
      normalizedMetrics: normalizedInput.normalizedMetrics,
      normalizedEntities: normalizedInput.normalizedEntities,
      normalizedPeriods: normalizedInput.normalizedPeriods,
      normalizedSources: normalizedInput.normalizedSources,
      missingInputs: normalizedInput.missingInputs,
      assumptions: normalizedInput.assumptions,
      normalizationQuality: normalizedInput.normalizationQuality,
      nextLayerHandoff: normalizedInput.nextLayerHandoff
    });

    const evidenceRequirements = this.evidenceRequirementChecker.check({
      queryText: normalizedInput.queryText,
      analysisPlan,
      ratioMap,
      scenarioFrame,
      riskFlags,
      normalizedMetrics: normalizedInput.normalizedMetrics,
      normalizedEntities: normalizedInput.normalizedEntities,
      normalizedPeriods: normalizedInput.normalizedPeriods,
      normalizedSources: normalizedInput.normalizedSources,
      missingInputs: normalizedInput.missingInputs,
      assumptions: normalizedInput.assumptions,
      normalizationQuality: normalizedInput.normalizationQuality
    });

    return FinanceAnalysisEnvelope.create({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      parentEnvelopeVersion: normalizedInput.envelopeVersion,
      sourceLayer: normalizedInput.sourceLayer,
      originalQuery: normalizedInput.queryText,
      normalizedQuery: normalizeText(normalizedInput.queryText),

      claimTargets: normalizedInput.claimTargets,
      normalizedMetrics: normalizedInput.normalizedMetrics,
      normalizedEntities: normalizedInput.normalizedEntities,
      normalizedPeriods: normalizedInput.normalizedPeriods,
      normalizedSources: normalizedInput.normalizedSources,

      metricMap: normalizedInput.metricMap,
      entityMap: normalizedInput.entityMap,
      periodMap: normalizedInput.periodMap,
      sourceMap: normalizedInput.sourceMap,

      missingInputs: normalizedInput.missingInputs,
      assumptions: normalizedInput.assumptions,
      ingestionQuality: normalizedInput.ingestionQuality,
      normalizationQuality: normalizedInput.normalizationQuality,

      analysisPlan: analysisPlan.analysisPlan,
      ratioMap: ratioMap.ratioMap,
      scenarioFrame: scenarioFrame.scenarioFrame,
      riskFlags: riskFlags.riskFlags,
      evidenceRequirements: evidenceRequirements.evidenceRequirements,

      diagnostics: {
        controller: {
          ok: true,
          warnings: [],
          errors: []
        },
        planner: analysisPlan.diagnostics,
        ratios: ratioMap.diagnostics,
        scenarios: scenarioFrame.diagnostics,
        risks: riskFlags.diagnostics,
        evidence: evidenceRequirements.diagnostics
      }
    });
  }

  normalizeInput(input = {}) {
    const queryContext = input.queryContext || {};
    const nextLayerHandoff = input.nextLayerHandoff || {};

    const queryText = firstValue(
      input.originalQuery,
      input.query,
      input.userText,
      input.rawInput,
      queryContext.originalQuery,
      queryContext.normalizedQuery,
      ""
    );

    const normalizedEntities = input.normalizedEntities || {
      companies: [],
      businessNames: [],
      programs: [],
      jurisdictions: [],
      sources: []
    };

    return {
      requestId: input.requestId || input.id || null,
      traceId: input.traceId || null,
      envelopeVersion: input.envelopeVersion || input.schemaVersion || input.version || null,
      sourceLayer: input.layer || input.runtimeLayer || "layer04_normalization",

      queryText,
      claimTargets: safeArray(queryContext.claimTargets || input.claimTargets),

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

      metricMap: input.metricMap || {},
      entityMap: input.entityMap || {},
      periodMap: input.periodMap || {},
      sourceMap: input.sourceMap || {},

      assumptions: safeArray(input.assumptions),
      missingInputs: safeArray(input.missingInputs || input.missing),
      ingestionQuality: input.ingestionQuality || null,
      normalizationQuality: input.normalizationQuality || null,
      nextLayerHandoff
    };
  }

  normalize(input = {}) { return this.analyze(input); }
  process(input = {}) { return this.analyze(input); }
  execute(input = {}) { return this.analyze(input); }
  run(input = {}) { return this.analyze(input); }

  static analyze(input = {}, options = {}) {
    return new FinanceAnalysisController(options).analyze(input);
  }
}

module.exports = {
  FinanceAnalysisController
};
