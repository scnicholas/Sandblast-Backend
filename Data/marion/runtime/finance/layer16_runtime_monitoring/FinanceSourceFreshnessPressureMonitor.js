"use strict";

class FinanceSourceFreshnessPressureMonitor {
  constructor(config = {}) {
    this.config = config;
    this.thresholds = config.sourceFreshnessThresholds || config.thresholds || {};
  }

  monitor(payload = {}) {
    const events = this._normalizeEvents(payload);
    const matches = events.filter(event => this._isFreshnessSignal(event));

    const count = matches.length;
    const warningCount = Number(this.thresholds.staleDataWarningCount || 2);
    const criticalCount = Number(this.thresholds.staleDataCriticalCount || 3);

    let pressureLevel = "none";
    let alertLevel = "none";
    let recommendedRoute = "monitor_only";

    if (count >= criticalCount) {
      pressureLevel = "critical";
      alertLevel = "critical";
      recommendedRoute = "route_to_layer02_source_freshness_review";
    } else if (count >= warningCount) {
      pressureLevel = "warning";
      alertLevel = "warning";
      recommendedRoute = "route_to_layer02_source_freshness_review";
    } else if (count > 0) {
      pressureLevel = "watch";
      alertLevel = "watch";
      recommendedRoute = "monitor_only";
    }

    return {
      detected: count > 0,
      pressureLevel,
      count,
      matchedEventIds: matches.map(item => item.id),
      alertLevel,
      recommendedRoute,
      requiresSourceFreshnessReview: recommendedRoute === "route_to_layer02_source_freshness_review"
    };
  }

  _normalizeEvents(payload = {}) {
    const source = Array.isArray(payload.events)
      ? payload.events
      : Array.isArray(payload.recentFeedbackEnvelopes)
        ? payload.recentFeedbackEnvelopes
        : Array.isArray(payload.feedbackHistory)
          ? payload.feedbackHistory
          : [];

    const current = payload.currentFeedbackEnvelope || payload.feedbackEnvelope || null;
    const combined = current ? [current, ...source] : source;

    return combined.map((event, index) => ({
      id: event.id || event.eventId || `finance-source-freshness-event-${index}`,
      correctionType: event.correctionType || "none",
      nextAction: event.nextAction || "",
      regressionTargets: Array.isArray(event.regressionTargets) ? event.regressionTargets : [],
      feedbackSignals: Array.isArray(event.feedbackSignals) ? event.feedbackSignals : [],
      rawText: this._collectText(event)
    }));
  }

  _isFreshnessSignal(event = {}) {
    if (String(event.correctionType).toLowerCase() === "staledata") return true;

    if (String(event.nextAction).toLowerCase().includes("source_freshness")) return true;

    const targetHit = event.regressionTargets.some(target =>
      String(target.layer || "").toLowerCase().includes("layer02_source_authority")
    );

    if (targetHit) return true;

    const text = [
      event.rawText,
      JSON.stringify(event.feedbackSignals),
      JSON.stringify(event.regressionTargets)
    ]
      .join(" ")
      .toLowerCase();

    const terms = [
      "stale",
      "outdated",
      "not current",
      "check latest",
      "deadline changed",
      "rate changed",
      "price changed",
      "program changed",
      "filing changed",
      "source freshness",
      "outdated source"
    ];

    return terms.some(term => text.includes(term));
  }

  _collectText(event = {}) {
    return [
      event.userFeedback,
      event.feedback,
      event.comment,
      event.testFailure,
      event.errorMessage,
      event.correctionType,
      event.nextAction,
      event.regressionRisk
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }
}

module.exports = FinanceSourceFreshnessPressureMonitor;
