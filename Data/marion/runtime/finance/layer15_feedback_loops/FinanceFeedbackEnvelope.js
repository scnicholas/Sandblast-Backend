"use strict";

class FinanceFeedbackEnvelope {
  static build(input = {}) {
    const qualityScore = Number.isFinite(input.qualityScore)
      ? Math.max(0, Math.min(1, input.qualityScore))
      : 1;

    const regressionRisk = input.regressionRisk || "none";

    return {
      domain: "finance",
      runtimeLayer: "layer15_feedback_loops",
      feedbackStatus: input.feedbackStatus || "captured",
      feedbackSignals: Array.isArray(input.feedbackSignals) ? input.feedbackSignals : [],
      correctionType: input.correctionType || "none",
      qualityScore,
      qualityBand: input.qualityBand || this._qualityBand(qualityScore),
      regressionRisk,
      regressionTargets: Array.isArray(input.regressionTargets) ? input.regressionTargets : [],
      memoryWriteCandidate: Boolean(input.memoryWriteCandidate),
      memoryRecord: input.memoryRecord || null,
      nextAction: input.nextAction || "monitor",
      requiresRegressionReview: Boolean(input.requiresRegressionReview),
      requiresComplianceReview: Boolean(input.requiresComplianceReview),
      diagnostics: input.diagnostics || {},
      nextLayerHandoff: {
        targetLayer: "layer16_finance_runtime_monitoring",
        eligible: input.nextLayerEligible !== false,
        reason: input.nextLayerReason || null
      },
      timestamp: new Date().toISOString()
    };
  }

  static fail(reason, diagnostics = {}) {
    return this.build({
      feedbackStatus: "failed",
      feedbackSignals: [],
      correctionType: "invalid_payload",
      qualityScore: 0,
      qualityBand: "failed",
      regressionRisk: "high",
      memoryWriteCandidate: false,
      nextAction: "reject_feedback_payload",
      requiresRegressionReview: true,
      requiresComplianceReview: false,
      diagnostics,
      nextLayerEligible: false,
      nextLayerReason: reason
    });
  }

  static _qualityBand(score) {
    if (score >= 0.9) return "excellent";
    if (score >= 0.75) return "acceptable";
    if (score >= 0.5) return "degraded";
    return "failed";
  }
}

module.exports = FinanceFeedbackEnvelope;
