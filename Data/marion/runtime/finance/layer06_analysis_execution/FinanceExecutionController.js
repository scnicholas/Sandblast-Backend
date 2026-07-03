"use strict";

/**
 * R18D Layer 06 — Finance Execution Controller
 * Consumes Layer 05 analysis-planning envelopes and executes available finance
 * calculations/comparisons/scenarios without fetching data or composing final prose.
 *
 * No external dependencies.
 */

const { FinanceRatioCalculator } = require("./FinanceRatioCalculator");
const { FinanceTrendAnalyzer } = require("./FinanceTrendAnalyzer");
const { FinancePeerComparator } = require("./FinancePeerComparator");
const { FinanceScenarioCalculator } = require("./FinanceScenarioCalculator");
const { FinanceValuationAnalyzer } = require("./FinanceValuationAnalyzer");
const { FinanceExecutionEnvelope } = require("./FinanceExecutionEnvelope");

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

class FinanceExecutionController {
  constructor(options = {}) {
    this.ratioCalculator = options.ratioCalculator || new FinanceRatioCalculator(options);
    this.trendAnalyzer = options.trendAnalyzer || new FinanceTrendAnalyzer(options);
    this.peerComparator = options.peerComparator || new FinancePeerComparator(options);
    this.scenarioCalculator = options.scenarioCalculator || new FinanceScenarioCalculator(options);
    this.valuationAnalyzer = options.valuationAnalyzer || new FinanceValuationAnalyzer(options);
  }

  execute(input = {}) {
    const normalizedInput = this.normalizeInput(input);

    const ratioResults = this.ratioCalculator.calculate({
      queryText: normalizedInput.queryText,
      analysisPlan: normalizedInput.analysisPlan,
      ratioMap: normalizedInput.ratioMap,
      normalizedMetrics: normalizedInput.normalizedMetrics,
      normalizedEntities: normalizedInput.normalizedEntities,
      normalizedPeriods: normalizedInput.normalizedPeriods,
      missingInputs: normalizedInput.missingInputs
    });

    const trendResults = this.trendAnalyzer.analyze({
      queryText: normalizedInput.queryText,
      analysisPlan: normalizedInput.analysisPlan,
      normalizedMetrics: normalizedInput.normalizedMetrics,
      normalizedEntities: normalizedInput.normalizedEntities,
      normalizedPeriods: normalizedInput.normalizedPeriods,
      missingInputs: normalizedInput.missingInputs
    });

    const peerComparison = this.peerComparator.compare({
      queryText: normalizedInput.queryText,
      analysisPlan: normalizedInput.analysisPlan,
      normalizedMetrics: normalizedInput.normalizedMetrics,
      normalizedEntities: normalizedInput.normalizedEntities,
      normalizedPeriods: normalizedInput.normalizedPeriods,
      missingInputs: normalizedInput.missingInputs
    });

    const scenarioResults = this.scenarioCalculator.calculate({
      queryText: normalizedInput.queryText,
      analysisPlan: normalizedInput.analysisPlan,
      scenarioFrame: normalizedInput.scenarioFrame,
      normalizedMetrics: normalizedInput.normalizedMetrics,
      normalizedEntities: normalizedInput.normalizedEntities,
      normalizedPeriods: normalizedInput.normalizedPeriods,
      assumptions: normalizedInput.assumptions,
      missingInputs: normalizedInput.missingInputs
    });

    const valuationResults = this.valuationAnalyzer.analyze({
      queryText: normalizedInput.queryText,
      analysisPlan: normalizedInput.analysisPlan,
      ratioMap: normalizedInput.ratioMap,
      normalizedMetrics: normalizedInput.normalizedMetrics,
      normalizedEntities: normalizedInput.normalizedEntities,
      normalizedPeriods: normalizedInput.normalizedPeriods,
      evidenceRequirements: normalizedInput.evidenceRequirements,
      missingInputs: normalizedInput.missingInputs
    });

    return FinanceExecutionEnvelope.create({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      parentEnvelopeVersion: normalizedInput.envelopeVersion,
      sourceLayer: normalizedInput.sourceLayer,
      originalQuery: normalizedInput.queryText,
      normalizedQuery: normalizeText(normalizedInput.queryText),

      analysisPlan: normalizedInput.analysisPlan,
      ratioMap: normalizedInput.ratioMap,
      scenarioFrame: normalizedInput.scenarioFrame,
      riskFlags: normalizedInput.riskFlags,
      evidenceRequirements: normalizedInput.evidenceRequirements,
      analysisReadiness: normalizedInput.analysisReadiness,

      normalizedMetrics: normalizedInput.normalizedMetrics,
      normalizedEntities: normalizedInput.normalizedEntities,
      normalizedPeriods: normalizedInput.normalizedPeriods,
      normalizedSources: normalizedInput.normalizedSources,

      missingInputs: normalizedInput.missingInputs,
      assumptions: normalizedInput.assumptions,
      ingestionQuality: normalizedInput.ingestionQuality,
      normalizationQuality: normalizedInput.normalizationQuality,

      ratioResults: ratioResults.ratioResults,
      trendResults: trendResults.trendResults,
      peerComparison: peerComparison.peerComparison,
      scenarioResults: scenarioResults.scenarioResults,
      valuationResults: valuationResults.valuationResults,

      diagnostics: {
        controller: {
          ok: true,
          warnings: [],
          errors: []
        },
        ratios: ratioResults.diagnostics,
        trends: trendResults.diagnostics,
        peers: peerComparison.diagnostics,
        scenarios: scenarioResults.diagnostics,
        valuation: valuationResults.diagnostics
      }
    });
  }

  normalizeInput(input = {}) {
    const queryContext = input.queryContext || {};
    const analysisPlan = input.analysisPlan || {};
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
      sourceLayer: input.layer || input.runtimeLayer || "layer05_analysis_planning",
      queryText,

      analysisPlan,
      ratioMap: input.ratioMap || {},
      scenarioFrame: input.scenarioFrame || {},
      riskFlags: safeArray(input.riskFlags),
      evidenceRequirements: safeArray(input.evidenceRequirements),
      analysisReadiness: input.analysisReadiness || null,

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

      assumptions: safeArray(input.assumptions),
      missingInputs: safeArray(input.missingInputs || input.missing),
      ingestionQuality: input.ingestionQuality || null,
      normalizationQuality: input.normalizationQuality || null
    };
  }

  analyze(input = {}) { return this.execute(input); }
  process(input = {}) { return this.execute(input); }
  run(input = {}) { return this.execute(input); }

  static execute(input = {}, options = {}) {
    return new FinanceExecutionController(options).execute(input);
  }
}

module.exports = {
  FinanceExecutionController
};
