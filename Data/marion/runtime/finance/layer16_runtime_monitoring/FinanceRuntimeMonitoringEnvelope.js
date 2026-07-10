"use strict";

class FinanceRuntimeMonitoringEnvelope {
  static build(input = {}) {
    const driftScore = this._clampScore(input.driftScore);
    const runtimeStatus = input.runtimeStatus || this._statusForScore(driftScore);

    return {
      domain: "finance",
      runtimeLayer: "layer16_runtime_monitoring",
      runtimeStatus,
      driftDetected: Boolean(input.driftDetected),
      driftScore,
      trendSignals: Array.isArray(input.trendSignals) ? input.trendSignals : [],
      recurrenceSignals: Array.isArray(input.recurrenceSignals) ? input.recurrenceSignals : [],
      sourceFreshnessPressure: input.sourceFreshnessPressure || {
        detected: false,
        pressureLevel: "none",
        count: 0
      },
      alertLevel: input.alertLevel || "none",
      recommendedRoute: input.recommendedRoute || "monitor_only",
      requiresOperatorReview: Boolean(input.requiresOperatorReview),
      requiresComplianceReview: Boolean(input.requiresComplianceReview),
      requiresRegressionReview: Boolean(input.requiresRegressionReview),
      monitoredEventCount: Number.isFinite(input.monitoredEventCount)
        ? input.monitoredEventCount
        : 0,
      diagnostics: input.diagnostics || {},
      nextLayerHandoff: {
        targetLayer: "layer17_finance_operator_intervention",
        eligible: input.nextLayerEligible !== false,
        reason: input.nextLayerReason || null
      },
      timestamp: new Date().toISOString()
    };
  }

  static fail(reason, diagnostics = {}) {
    return this.build({
      runtimeStatus: "failed",
      driftDetected: false,
      driftScore: 0,
      trendSignals: [],
      recurrenceSignals: [],
      sourceFreshnessPressure: {
        detected: false,
        pressureLevel: "none",
        count: 0
      },
      alertLevel: "critical",
      recommendedRoute: "route_to_operator_review",
      requiresOperatorReview: true,
      requiresComplianceReview: false,
      requiresRegressionReview: true,
      diagnostics,
      nextLayerEligible: false,
      nextLayerReason: reason
    });
  }

  static _clampScore(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }

  static _statusForScore(score) {
    if (score >= 0.85) return "escalation_required";
    if (score >= 0.7) return "drift_detected";
    if (score >= 0.45) return "degraded";
    if (score >= 0.25) return "watch";
    return "stable";
  }
}

module.exports = FinanceRuntimeMonitoringEnvelope;
