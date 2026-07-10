"use strict";

const FinanceRuntimeMonitoringEnvelope = require("./FinanceRuntimeMonitoringEnvelope");
const FinanceDriftDetector = require("./FinanceDriftDetector");
const FinanceFeedbackTrendAnalyzer = require("./FinanceFeedbackTrendAnalyzer");
const FinanceComplianceRecurrenceMonitor = require("./FinanceComplianceRecurrenceMonitor");
const FinanceSourceFreshnessPressureMonitor = require("./FinanceSourceFreshnessPressureMonitor");
const FinanceRuntimeAlertRouter = require("./FinanceRuntimeAlertRouter");

class FinanceRuntimeMonitoringController {
  constructor(config = {}) {
    this.config = config;

    this.driftDetector = new FinanceDriftDetector(
      config.driftDetectionThresholds || {}
    );

    this.feedbackTrendAnalyzer = new FinanceFeedbackTrendAnalyzer(
      config.feedbackTrendRules || {}
    );

    this.complianceRecurrenceMonitor = new FinanceComplianceRecurrenceMonitor(
      config.complianceRecurrenceRules || {}
    );

    this.sourceFreshnessPressureMonitor = new FinanceSourceFreshnessPressureMonitor(
      config.driftDetectionThresholds || {}
    );

    this.runtimeAlertRouter = new FinanceRuntimeAlertRouter(
      config.runtimeAlertPolicy || {}
    );
  }

  evaluate(payload = {}) {
    if (!payload || typeof payload !== "object") {
      return FinanceRuntimeMonitoringEnvelope.fail("Invalid finance runtime monitoring payload.");
    }

    const domain = payload.domain || "finance";

    if (domain !== "finance") {
      return FinanceRuntimeMonitoringEnvelope.fail(
        "Non-finance payload rejected by finance runtime monitoring layer.",
        {
          receivedDomain: domain
        }
      );
    }

    const monitoringPayload = this._normalizePayload(payload);

    const drift = this.driftDetector.detect(monitoringPayload);
    const trends = this.feedbackTrendAnalyzer.analyze(monitoringPayload);
    const compliance = this.complianceRecurrenceMonitor.monitor(monitoringPayload);
    const freshness = this.sourceFreshnessPressureMonitor.monitor(monitoringPayload);

    const runtimeStatus = this._strongestStatus([
      drift.runtimeStatus,
      compliance.runtimeStatus,
      this._statusFromFreshness(freshness),
      trends.hasTrend ? "watch" : "stable"
    ]);

    const requiresComplianceReview =
      compliance.requiresComplianceReview ||
      trends.trendSignals.some(signal =>
        signal.recommendedRoute === "route_to_layer14_compliance_review"
      );

    const requiresRegressionReview =
      drift.driftDetected ||
      trends.trendSignals.length > 0 ||
      freshness.requiresSourceFreshnessReview;

    const requiresOperatorReview =
      compliance.requiresOperatorReview ||
      runtimeStatus === "drift_detected" ||
      runtimeStatus === "escalation_required";

    const alert = this.runtimeAlertRouter.route({
      runtimeStatus,
      driftDetected: drift.driftDetected,
      trendSignals: trends.trendSignals,
      recurrenceSignals: compliance.recurrenceSignals,
      sourceFreshnessPressure: freshness,
      requiresComplianceReview,
      requiresRegressionReview,
      requiresOperatorReview,
      explicitAlertLevels: [
        compliance.alertLevel,
        freshness.alertLevel
      ].filter(Boolean)
    });

    return FinanceRuntimeMonitoringEnvelope.build({
      runtimeStatus,
      driftDetected: drift.driftDetected,
      driftScore: drift.driftScore,
      trendSignals: trends.trendSignals,
      recurrenceSignals: compliance.recurrenceSignals,
      sourceFreshnessPressure: freshness,
      alertLevel: alert.alertLevel,
      recommendedRoute: alert.recommendedRoute,
      requiresOperatorReview: alert.requiresOperatorReview,
      requiresComplianceReview,
      requiresRegressionReview,
      monitoredEventCount: drift.monitoredEventCount,
      diagnostics: {
        drift,
        trends,
        compliance,
        freshness,
        alert
      },
      nextLayerEligible: true,
      nextLayerReason: alert.requiresOperatorReview
        ? "Runtime drift or recurrence requires Layer 17 operator intervention."
        : "Runtime monitoring completed and eligible for Layer 17 handoff if operator review becomes necessary."
    });
  }

  _normalizePayload(payload = {}) {
    const events = [];

    if (payload.currentFeedbackEnvelope || payload.feedbackEnvelope) {
      events.push(payload.currentFeedbackEnvelope || payload.feedbackEnvelope);
    }

    if (Array.isArray(payload.recentFeedbackEnvelopes)) {
      events.push(...payload.recentFeedbackEnvelopes);
    }

    if (Array.isArray(payload.feedbackHistory)) {
      events.push(...payload.feedbackHistory);
    }

    if (Array.isArray(payload.events)) {
      events.push(...payload.events);
    }

    return {
      ...payload,
      events: events.length ? events : []
    };
  }

  _strongestStatus(statuses = []) {
    const rank = {
      failed: 5,
      escalation_required: 4,
      drift_detected: 3,
      degraded: 2,
      watch: 1,
      stable: 0
    };

    return statuses
      .filter(Boolean)
      .sort((a, b) => (rank[b] || 0) - (rank[a] || 0))[0] || "stable";
  }

  _statusFromFreshness(freshness = {}) {
    if (freshness.pressureLevel === "critical") return "drift_detected";
    if (freshness.pressureLevel === "warning") return "degraded";
    if (freshness.pressureLevel === "watch") return "watch";
    return "stable";
  }
}

module.exports = FinanceRuntimeMonitoringController;
