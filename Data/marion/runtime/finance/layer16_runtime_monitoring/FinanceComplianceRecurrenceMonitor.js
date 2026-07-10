"use strict";

class FinanceComplianceRecurrenceMonitor {
  constructor(config = {}) {
    this.config = config;
    this.complianceSignals = config.complianceSignals || {};
    this.recurrencePolicy = config.recurrencePolicy || {};
    this.reviewRequirements = config.reviewRequirements || {};
  }

  monitor(payload = {}) {
    const events = this._normalizeEvents(payload);
    const recurrenceSignals = [];

    for (const [signalName, rule] of Object.entries(this.complianceSignals)) {
      const matches = this._findMatches(events, signalName, rule);

      if (!matches.length) continue;

      const occurrencePolicy = this._policyFor(matches.length, rule);
      const severity = rule.immediateEscalation
        ? rule.singleOccurrenceSeverity || "critical"
        : matches.length >= 2
          ? rule.recurrenceSeverity || "critical"
          : rule.singleOccurrenceSeverity || "high";

      recurrenceSignals.push({
        signal: signalName,
        severity,
        count: matches.length,
        immediateEscalation: Boolean(rule.immediateEscalation),
        matchedEventIds: matches.map(item => item.id),
        recommendedRoute: rule.recommendedRoute || "route_to_layer14_compliance_review",
        runtimeStatus: occurrencePolicy.runtimeStatus,
        alertLevel: occurrencePolicy.alertLevel
      });
    }

    recurrenceSignals.sort((a, b) => {
      if (a.immediateEscalation !== b.immediateEscalation) {
        return a.immediateEscalation ? -1 : 1;
      }

      return this._severityRank(b.severity) - this._severityRank(a.severity);
    });

    const strongest = recurrenceSignals[0] || null;
    const hasCritical = recurrenceSignals.some(signal =>
      signal.severity === "critical" || signal.immediateEscalation
    );

    return {
      recurrenceSignals,
      hasComplianceRecurrence: recurrenceSignals.length > 0,
      hasCriticalCompliance: hasCritical,
      strongestComplianceSignal: strongest,
      requiresComplianceReview: recurrenceSignals.length > 0,
      requiresOperatorReview: recurrenceSignals.some(signal =>
        signal.alertLevel === "operator_review" ||
        signal.alertLevel === "critical" ||
        (hasCritical && this.reviewRequirements.requiresOperatorReviewWhenCritical !== false)
      ),
      recommendedRoute: strongest?.recommendedRoute || "monitor_only",
      runtimeStatus: strongest?.runtimeStatus || "stable",
      alertLevel: strongest?.alertLevel || "none"
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
      id: event.id || event.eventId || `finance-compliance-event-${index}`,
      correctionType: event.correctionType || "none",
      requiresComplianceReview: Boolean(event.requiresComplianceReview),
      feedbackSignals: Array.isArray(event.feedbackSignals) ? event.feedbackSignals : [],
      regressionTargets: Array.isArray(event.regressionTargets) ? event.regressionTargets : [],
      rawText: this._collectText(event)
    }));
  }

  _findMatches(events = [], signalName, rule = {}) {
    const aliases = [
      signalName,
      ...(Array.isArray(rule.aliases) ? rule.aliases : [])
    ].map(item => String(item).toLowerCase());

    return events.filter(event => {
      const targetText = [
        event.rawText,
        event.correctionType,
        event.requiresComplianceReview ? "requires compliance review" : "",
        ...event.feedbackSignals.map(signal => [
          signal.type,
          signal.subtype,
          signal.severity,
          signal.action
        ].filter(Boolean).join(" ")),
        ...event.regressionTargets.map(target => [
          target.layer,
          ...(Array.isArray(target.matched) ? target.matched : [])
        ].filter(Boolean).join(" "))
      ]
        .join(" ")
        .toLowerCase();

      return aliases.some(alias => targetText.includes(alias));
    });
  }

  _policyFor(count, rule = {}) {
    if (rule.immediateEscalation) {
      return this.recurrencePolicy.criticalImmediate || {
        runtimeStatus: "escalation_required",
        alertLevel: "critical"
      };
    }

    if (count >= 3) {
      return this.recurrencePolicy.threeOrMoreOccurrences || {
        runtimeStatus: "escalation_required",
        alertLevel: "operator_review"
      };
    }

    if (count >= 2) {
      return this.recurrencePolicy.twoOccurrences || {
        runtimeStatus: "degraded",
        alertLevel: "warning"
      };
    }

    return this.recurrencePolicy.oneOccurrence || {
      runtimeStatus: "watch",
      alertLevel: "watch"
    };
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
      event.regressionRisk,
      JSON.stringify(event.feedbackSignals || []),
      JSON.stringify(event.regressionTargets || [])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  _severityRank(severity) {
    const ranks = {
      none: 0,
      low: 1,
      medium: 2,
      high: 3,
      critical: 4
    };

    return ranks[severity] || 0;
  }
}

module.exports = FinanceComplianceRecurrenceMonitor;
