"use strict";

/**
 * R18D Layer 10 — Finance Delivery Controller
 * Consumes Layer 09 final response envelopes and prepares a runtime-safe
 * delivery package for Marion/Nyx, API responses, UI blocks, and telemetry.
 *
 * Boundary:
 * - Does not ingest.
 * - Does not normalize.
 * - Does not calculate.
 * - Does not re-score evidence.
 * - Does not fetch external data.
 * - Does not remove caveats.
 * - Does not convert blocked claims into deliverable claims.
 *
 * No external dependencies.
 */

const { FinanceDeliveryPolicyGate } = require("./FinanceDeliveryPolicyGate");
const { FinanceRuntimeResponseAdapter } = require("./FinanceRuntimeResponseAdapter");
const { FinanceUIDeliveryAdapter } = require("./FinanceUIDeliveryAdapter");
const { FinanceTelemetryEmitter } = require("./FinanceTelemetryEmitter");
const { FinanceDeliveryEnvelope } = require("./FinanceDeliveryEnvelope");

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

class FinanceDeliveryController {
  constructor(options = {}) {
    this.policyGate =
      options.policyGate || new FinanceDeliveryPolicyGate(options);

    this.runtimeResponseAdapter =
      options.runtimeResponseAdapter || new FinanceRuntimeResponseAdapter(options);

    this.uiDeliveryAdapter =
      options.uiDeliveryAdapter || new FinanceUIDeliveryAdapter(options);

    this.telemetryEmitter =
      options.telemetryEmitter || new FinanceTelemetryEmitter(options);
  }

  deliver(input = {}) {
    const startedAt = Date.now();
    const normalizedInput = this.normalizeInput(input);

    const deliveryPolicy = this.policyGate.evaluate({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      queryText: normalizedInput.queryText,
      responseReadiness: normalizedInput.responseReadiness,
      nextLayerHandoff: normalizedInput.nextLayerHandoff,
      finalResponseText: normalizedInput.finalResponseText,
      caveatsApplied: normalizedInput.caveatsApplied,
      blockedClaims: normalizedInput.blockedClaims,
      toneGuardFindings: normalizedInput.toneGuardFindings,
      verificationGaps: normalizedInput.verificationGaps,
      diagnostics: normalizedInput.diagnostics
    });

    const runtimeResponse = this.runtimeResponseAdapter.adapt({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      queryText: normalizedInput.queryText,
      finalResponseText: normalizedInput.finalResponseText,
      finalResponseBlocks: normalizedInput.finalResponseBlocks,
      renderedSections: normalizedInput.renderedSections,
      caveatsApplied: normalizedInput.caveatsApplied,
      blockedClaims: normalizedInput.blockedClaims,
      toneGuardFindings: normalizedInput.toneGuardFindings,
      responseReadiness: normalizedInput.responseReadiness,
      deliveryPolicy: deliveryPolicy.deliveryPolicy,
      answerPlan: normalizedInput.answerPlan,
      synthesisReadiness: normalizedInput.synthesisReadiness
    });

    const uiDelivery = this.uiDeliveryAdapter.adapt({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      queryText: normalizedInput.queryText,
      finalResponseText: normalizedInput.finalResponseText,
      finalResponseBlocks: normalizedInput.finalResponseBlocks,
      renderedSections: normalizedInput.renderedSections,
      caveatsApplied: normalizedInput.caveatsApplied,
      blockedClaims: normalizedInput.blockedClaims,
      toneGuardFindings: normalizedInput.toneGuardFindings,
      verificationGaps: normalizedInput.verificationGaps,
      evidenceNotes: normalizedInput.evidenceNotes,
      assumptionNotes: normalizedInput.assumptionNotes,
      responseReadiness: normalizedInput.responseReadiness,
      deliveryPolicy: deliveryPolicy.deliveryPolicy,
      runtimeResponse: runtimeResponse.runtimeResponse
    });

    const telemetry = this.telemetryEmitter.emit({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      queryText: normalizedInput.queryText,
      sourceLayer: normalizedInput.sourceLayer,
      responseReadiness: normalizedInput.responseReadiness,
      deliveryPolicy: deliveryPolicy.deliveryPolicy,
      runtimeResponse: runtimeResponse.runtimeResponse,
      uiDelivery: uiDelivery.uiDelivery,
      caveatsApplied: normalizedInput.caveatsApplied,
      blockedClaims: normalizedInput.blockedClaims,
      toneGuardFindings: normalizedInput.toneGuardFindings,
      verificationGaps: normalizedInput.verificationGaps,
      renderedSections: normalizedInput.renderedSections,
      finalResponseBlocks: normalizedInput.finalResponseBlocks,
      startedAt,
      elapsedMs: Date.now() - startedAt
    });

    return FinanceDeliveryEnvelope.create({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      parentEnvelopeVersion: normalizedInput.envelopeVersion,
      sourceLayer: normalizedInput.sourceLayer,
      originalQuery: normalizedInput.queryText,
      normalizedQuery: normalizeText(normalizedInput.queryText),

      finalResponseText: normalizedInput.finalResponseText,
      finalResponseBlocks: normalizedInput.finalResponseBlocks,
      renderedSections: normalizedInput.renderedSections,

      runtimeResponse: runtimeResponse.runtimeResponse,
      uiDelivery: uiDelivery.uiDelivery,
      deliveryPolicy: deliveryPolicy.deliveryPolicy,
      telemetry: telemetry.telemetry,

      responseReadiness: normalizedInput.responseReadiness,
      synthesisReadiness: normalizedInput.synthesisReadiness,
      evidenceReadiness: normalizedInput.evidenceReadiness,
      executionQuality: normalizedInput.executionQuality,
      analysisReadiness: normalizedInput.analysisReadiness,
      normalizationQuality: normalizedInput.normalizationQuality,
      ingestionQuality: normalizedInput.ingestionQuality,

      answerPlan: normalizedInput.answerPlan,
      answerSections: normalizedInput.answerSections,
      finalAnswerPackage: normalizedInput.finalAnswerPackage,

      caveatsApplied: normalizedInput.caveatsApplied,
      blockedClaims: normalizedInput.blockedClaims,
      toneGuardFindings: normalizedInput.toneGuardFindings,

      prioritizedResults: normalizedInput.prioritizedResults,
      resultGroups: normalizedInput.resultGroups,
      caveats: normalizedInput.caveats,
      evidenceNotes: normalizedInput.evidenceNotes,
      assumptionNotes: normalizedInput.assumptionNotes,
      blockedItems: normalizedInput.blockedItems,

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

      assumptions: normalizedInput.assumptions,
      missingInputs: normalizedInput.missingInputs,
      riskFlags: normalizedInput.riskFlags,
      evidenceRequirements: normalizedInput.evidenceRequirements,

      diagnostics: {
        controller: {
          ok: true,
          warnings: [],
          errors: []
        },
        policyGate: deliveryPolicy.diagnostics,
        runtimeResponseAdapter: runtimeResponse.diagnostics,
        uiDeliveryAdapter: uiDelivery.diagnostics,
        telemetryEmitter: telemetry.diagnostics
      }
    });
  }

  normalizeInput(input = {}) {
    const queryContext = input.queryContext || {};
    const normalizedEntities = input.normalizedEntities || {};
    const finalAnswerPackage = input.finalAnswerPackage || {};

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
      sourceLayer: input.layer || input.runtimeLayer || "layer09_final_response",
      queryText,

      finalResponseText: String(input.finalResponseText || ""),
      finalResponseBlocks: safeArray(input.finalResponseBlocks),
      renderedSections: safeArray(input.renderedSections),

      responseReadiness: input.responseReadiness || null,
      nextLayerHandoff: input.nextLayerHandoff || {},

      analysisPlan: input.analysisPlan || {},
      analysisReadiness: input.analysisReadiness || null,
      executionQuality: input.executionQuality || null,
      evidenceReadiness: input.evidenceReadiness || null,
      synthesisReadiness: input.synthesisReadiness || null,
      normalizationQuality: input.normalizationQuality || null,
      ingestionQuality: input.ingestionQuality || null,

      answerPlan: input.answerPlan || finalAnswerPackage.answerPlan || null,
      answerSections: safeArray(input.answerSections),
      finalAnswerPackage,

      caveatsApplied: safeArray(input.caveatsApplied),
      blockedClaims: safeArray(input.blockedClaims),
      toneGuardFindings: safeArray(input.toneGuardFindings),

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

      assumptions: safeArray(input.assumptions),
      missingInputs: safeArray(input.missingInputs || input.missing),
      riskFlags: safeArray(input.riskFlags),
      evidenceRequirements: safeArray(input.evidenceRequirements),

      diagnostics: input.diagnostics || {}
    };
  }

  process(input = {}) { return this.deliver(input); }
  execute(input = {}) { return this.deliver(input); }
  run(input = {}) { return this.deliver(input); }
  adapt(input = {}) { return this.deliver(input); }

  static deliver(input = {}, options = {}) {
    return new FinanceDeliveryController(options).deliver(input);
  }

  static execute(input = {}, options = {}) {
    return new FinanceDeliveryController(options).deliver(input);
  }
}

module.exports = {
  FinanceDeliveryController
};
