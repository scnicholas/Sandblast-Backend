"use strict";

class FinanceDriftDetector {
  constructor(config = {}) {
    this.config = config;
    this.thresholds = config.thresholds || config;
    this.weights = this.thresholds.weights || {};
  }

  detect(payload = {}) {
    const events = this._normalizeEvents(payload);
    const quality = this._qualityDegradation(events);
    const feedback = this._feedbackRecurrence(events);
    const compliance = this._complianceRecurrence(events);
    const freshness = this._sourceFreshnessPressure(events);
    const regression = this._regressionRisk(events);

    const driftScore = this._weightedScore({
      quality,
      feedback,
      compliance,
      freshness,
      regression
    });

    const runtimeStatus = this._runtimeStatusFor(driftScore, {
      quality,
      feedback,
      compliance,
      freshness,
      regression
    });

    return {
      driftDetected: runtimeStatus === "drift_detected" || runtimeStatus === "escalation_required",
      driftScore,
      runtimeStatus,
      monitoredEventCount: events.length,
      driftFactors: {
        quality,
        feedback,
        compliance,
        freshness,
        regression
      }
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

    const maxWindow = Number(this.thresholds.windowing?.maxWindowSize || 50);

    return combined.slice(0, maxWindow).map((event, index) => ({
      id: event.id || event.eventId || `finance-drift-event-${index}`,
      correctionType: event.correctionType || "none",
      qualityScore: Number.isFinite(event.qualityScore) ? event.qualityScore : 1,
      qualityBand: event.qualityBand || "excellent",
      regressionRisk: event.regressionRisk || "none",
      requiresComplianceReview: Boolean(event.requiresComplianceReview),
      requiresRegressionReview: Boolean(event.requiresRegressionReview),
      feedbackSignals: Array.isArray(event.feedbackSignals) ? event.feedbackSignals : [],
      regressionTargets: Array.isArray(event.regressionTargets) ? event.regressionTargets : [],
      rawText: this._collectText(event)
    }));
  }

  _qualityDegradation(events = []) {
    if (!events.length) {
      return {
        score: 0,
        count: 0,
        degradedCount: 0,
        failedCount: 0
      };
    }

    const qualityThresholds = this.thresholds.qualityThresholds || {};
    const warningBelow = Number(qualityThresholds.qualityScoreWarningBelow || 0.75);
    const criticalBelow = Number(qualityThresholds.qualityScoreCriticalBelow || 0.5);
    const degradedWarningCount = Number(qualityThresholds.degradedBandCountWarning || 2);
    const failedCriticalCount = Number(qualityThresholds.failedBandCountCritical || 1);

    const degraded = events.filter(event =>
      event.qualityScore < warningBelow || event.qualityBand === "degraded"
    );

    const failed = events.filter(event =>
      event.qualityScore < criticalBelow || event.qualityBand === "failed"
    );

    let score = 0;

    if (degraded.length >= degradedWarningCount) score += 0.5;
    if (failed.length >= failedCriticalCount) score += 0.5;

    return {
      score: Math.min(1, score),
      count: degraded.length + failed.length,
      degradedCount: degraded.length,
      failedCount: failed.length
    };
  }

  _feedbackRecurrence(events = []) {
    const thresholds = this.thresholds.feedbackThresholds || {};
    const repeatedCount = Number(thresholds.repeatedCorrectionTypeCount || 2);
    const clusterCount = Number(thresholds.userCorrectionClusterCount || 3);

    const correctionCounts = events.reduce((acc, event) => {
      if (!event.correctionType || event.correctionType === "none") return acc;
      acc[event.correctionType] = (acc[event.correctionType] || 0) + 1;
      return acc;
    }, {});

    const repeatedTypes = Object.entries(correctionCounts)
      .filter(([, count]) => count >= repeatedCount)
      .map(([type, count]) => ({ type, count }));

    const correctionTotal = Object.values(correctionCounts).reduce((sum, count) => sum + count, 0);

    let score = 0;

    if (repeatedTypes.length) score += 0.5;
    if (correctionTotal >= clusterCount) score += 0.5;

    return {
      score: Math.min(1, score),
      correctionCounts,
      repeatedTypes,
      correctionTotal
    };
  }

  _complianceRecurrence(events = []) {
    const thresholds = this.thresholds.complianceThresholds || {};
    const criticalCount = Number(thresholds.complianceReviewCriticalCount || 2);
    const warningCount = Number(thresholds.complianceReviewWarningCount || 1);

    const complianceEvents = events.filter(event => {
      const text = [
        event.rawText,
        event.correctionType,
        JSON.stringify(event.feedbackSignals),
        JSON.stringify(event.regressionTargets)
      ].join(" ").toLowerCase();

      return (
        event.requiresComplianceReview ||
        event.correctionType === "unsafeAdvice" ||
        text.includes("unsafe advice") ||
        text.includes("missing caveat") ||
        text.includes("missing disclosure") ||
        text.includes("guaranteed return") ||
        text.includes("data leak")
      );
    });

    let score = 0;

    if (complianceEvents.length >= warningCount) score += 0.5;
    if (complianceEvents.length >= criticalCount) score += 0.5;

    return {
      score: Math.min(1, score),
      count: complianceEvents.length,
      eventIds: complianceEvents.map(event => event.id)
    };
  }

  _sourceFreshnessPressure(events = []) {
    const thresholds = this.thresholds.sourceFreshnessThresholds || {};
    const warningCount = Number(thresholds.staleDataWarningCount || 2);
    const criticalCount = Number(thresholds.staleDataCriticalCount || 3);

    const freshnessEvents = events.filter(event => {
      const text = [
        event.rawText,
        event.correctionType,
        JSON.stringify(event.feedbackSignals),
        JSON.stringify(event.regressionTargets)
      ].join(" ").toLowerCase();

      return (
        event.correctionType === "staleData" ||
        text.includes("stale") ||
        text.includes("outdated") ||
        text.includes("not current") ||
        text.includes("deadline changed") ||
        text.includes("source freshness") ||
        text.includes("layer02_source_authority")
      );
    });

    let score = 0;

    if (freshnessEvents.length >= warningCount) score += 0.5;
    if (freshnessEvents.length >= criticalCount) score += 0.5;

    return {
      score: Math.min(1, score),
      count: freshnessEvents.length,
      eventIds: freshnessEvents.map(event => event.id)
    };
  }

  _regressionRisk(events = []) {
    const highRisk = events.filter(event => event.regressionRisk === "high");
    const criticalRisk = events.filter(event => event.regressionRisk === "critical");

    let score = 0;

    if (highRisk.length >= 1) score += 0.5;
    if (criticalRisk.length >= 1) score += 0.5;

    return {
      score: Math.min(1, score),
      highCount: highRisk.length,
      criticalCount: criticalRisk.length
    };
  }

  _weightedScore(parts = {}) {
    const weights = {
      qualityDegradation: Number(this.weights.qualityDegradation ?? 0.25),
      feedbackRecurrence: Number(this.weights.feedbackRecurrence ?? 0.2),
      complianceRecurrence: Number(this.weights.complianceRecurrence ?? 0.25),
      sourceFreshnessPressure: Number(this.weights.sourceFreshnessPressure ?? 0.15),
      regressionRisk: Number(this.weights.regressionRisk ?? 0.15)
    };

    const score =
      parts.quality.score * weights.qualityDegradation +
      parts.feedback.score * weights.feedbackRecurrence +
      parts.compliance.score * weights.complianceRecurrence +
      parts.freshness.score * weights.sourceFreshnessPressure +
      parts.regression.score * weights.regressionRisk;

    return Math.max(0, Math.min(1, Number(score.toFixed(4))));
  }

  _runtimeStatusFor(score, parts = {}) {
    const thresholds = this.thresholds.driftScoreThresholds || {};

    const escalationMin = Number(thresholds.escalationRequiredMin || 0.85);
    const driftMin = Number(thresholds.driftDetectedMin || 0.7);
    const degradedMin = Number(thresholds.degradedMin || 0.45);
    const watchMin = Number(thresholds.watchMin || 0.25);

    const qualityScore = Number(parts.quality?.score || 0);
    const feedbackScore = Number(parts.feedback?.score || 0);
    const complianceScore = Number(parts.compliance?.score || 0);
    const freshnessScore = Number(parts.freshness?.score || 0);
    const regressionScore = Number(parts.regression?.score || 0);

    if (complianceScore >= 1 && regressionScore >= 0.5) {
      return "escalation_required";
    }

    if (score >= escalationMin) return "escalation_required";
    if (score >= driftMin) return "drift_detected";
    if (score >= degradedMin) return "degraded";
    if (score >= watchMin) return "watch";

    /*
     * Runtime floor elevations:
     * The weighted drift score can be lower than the global watch threshold
     * when a single factor has a low configured weight. A fully active runtime
     * factor should still elevate the detector out of "stable" because it
     * represents an actual finance-domain monitoring signal.
     */
    if (complianceScore >= 0.5) return "watch";
    if (freshnessScore >= 1) return "watch";
    if (feedbackScore >= 1) return "watch";
    if (qualityScore >= 1) return "watch";
    if (regressionScore >= 0.5) return "watch";

    return "stable";
  }

  _collectText(event = {}) {
    return [
      event.userFeedback,
      event.feedback,
      event.comment,
      event.testFailure,
      event.errorMessage,
      event.correctionType,
      event.qualityBand,
      event.regressionRisk,
      event.nextAction
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }
}

module.exports = FinanceDriftDetector;
