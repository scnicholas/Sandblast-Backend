"use strict";

class FinanceFeedbackTrendAnalyzer {
  constructor(config = {}) {
    this.config = config;
    this.trendRules = config.trendRules || {};
    this.priorityOrder = Array.isArray(config.priorityOrder)
      ? config.priorityOrder
      : [];
    this.defaultRoute = config.defaultRoute || "monitor_only";
  }

  analyze(payload = {}) {
    const events = this._normalizeEvents(payload);
    const trendSignals = [];

    for (const [ruleName, rule] of Object.entries(this.trendRules)) {
      const matches = this._findMatches(events, rule);

      if (matches.length >= Number(rule.minimumCount || 1)) {
        trendSignals.push({
          rule: ruleName,
          trendType: rule.trendType || ruleName,
          severity: rule.severity || "medium",
          count: matches.length,
          matchedEventIds: matches.map(item => item.id),
          recommendedRoute: rule.recommendedRoute || this.defaultRoute
        });
      }
    }

    trendSignals.sort((a, b) => {
      const aIndex = this._priorityIndex(a.rule);
      const bIndex = this._priorityIndex(b.rule);
      if (aIndex !== bIndex) return aIndex - bIndex;
      return this._severityRank(b.severity) - this._severityRank(a.severity);
    });

    return {
      trendSignals,
      hasTrend: trendSignals.length > 0,
      strongestTrend: trendSignals[0] || null,
      recommendedRoute: trendSignals[0]?.recommendedRoute || this.defaultRoute
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
      id: event.id || event.eventId || `finance-runtime-event-${index}`,
      correctionType: event.correctionType || "none",
      qualityBand: event.qualityBand || "excellent",
      qualityScore: Number.isFinite(event.qualityScore) ? event.qualityScore : 1,
      regressionRisk: event.regressionRisk || "none",
      nextAction: event.nextAction || "",
      feedbackSignals: Array.isArray(event.feedbackSignals) ? event.feedbackSignals : [],
      regressionTargets: Array.isArray(event.regressionTargets) ? event.regressionTargets : [],
      rawText: this._collectText(event)
    }));
  }

  _findMatches(events = [], rule = {}) {
    return events.filter(event => {
      const correctionMatch = (rule.matchesCorrectionTypes || []).some(type =>
        String(event.correctionType).toLowerCase() === String(type).toLowerCase()
      );

      const qualityBandMatch = (rule.matchesQualityBands || []).some(band =>
        String(event.qualityBand).toLowerCase() === String(band).toLowerCase()
      );

      const signalText = [
        event.rawText,
        event.nextAction,
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

      const signalMatch = (rule.matchesSignals || []).some(signal =>
        signalText.includes(String(signal).toLowerCase())
      );

      return correctionMatch || qualityBandMatch || signalMatch;
    });
  }

  _collectText(event = {}) {
    return [
      event.userFeedback,
      event.feedback,
      event.comment,
      event.testFailure,
      event.errorMessage,
      event.correctionType,
      event.regressionRisk,
      event.qualityBand,
      event.nextAction,
      JSON.stringify(event.feedbackSignals || []),
      JSON.stringify(event.regressionTargets || [])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  _priorityIndex(ruleName) {
    const index = this.priorityOrder.indexOf(ruleName);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
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

module.exports = FinanceFeedbackTrendAnalyzer;
