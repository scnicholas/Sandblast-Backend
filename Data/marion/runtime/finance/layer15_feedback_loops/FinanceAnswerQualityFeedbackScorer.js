"use strict";

class FinanceAnswerQualityFeedbackScorer {
  constructor(config = {}) {
    this.config = config;
    this.qualityDimensions = config.qualityDimensions || {};
    this.scoreBands = config.scoreBands || {};
  }

  score(payload = {}) {
    const text = this._collectText(payload);
    let penalty = 0;
    const dimensionResults = [];

    for (const [dimension, rule] of Object.entries(this.qualityDimensions)) {
      const weight = Number.isFinite(rule.weight) ? rule.weight : 0;
      const signals = Array.isArray(rule.failureSignals) ? rule.failureSignals : [];
      const matched = signals.filter(signal =>
        text.includes(String(signal).toLowerCase())
      );

      if (matched.length) {
        penalty += weight;
      }

      dimensionResults.push({
        dimension,
        weight,
        matched,
        failed: matched.length > 0
      });
    }

    const qualityScore = Math.max(0, Math.min(1, Number((1 - penalty).toFixed(10))));
    const qualityBand = this._bandFor(qualityScore);

    return {
      qualityScore,
      qualityBand,
      dimensionResults,
      nextAction: this._actionFor(qualityBand)
    };
  }

  _collectText(payload) {
    return [
      payload.userFeedback,
      payload.feedback,
      payload.comment,
      payload.testFailure,
      payload.errorMessage
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  _bandFor(score) {
    if (score >= 0.9) return "excellent";
    if (score >= 0.75) return "acceptable";
    if (score >= 0.5) return "degraded";
    return "failed";
  }

  _actionFor(band) {
    const entry = this.scoreBands[band];
    return entry?.action || "monitor";
  }
}

module.exports = FinanceAnswerQualityFeedbackScorer;
