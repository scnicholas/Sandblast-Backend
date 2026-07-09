"use strict";

class FinanceRegressionFeedbackMapper {
  constructor(config = {}) {
    this.config = config;
    this.regressionMap = config.regressionMap || {};
    this.riskLevels = config.riskLevels || {};
  }

  map(payload = {}) {
    const text = this._collectText(payload);
    const regressionTargets = [];

    for (const [layer, signals] of Object.entries(this.regressionMap)) {
      const matched = this._matchSignals(text, signals);
      if (matched.length) {
        regressionTargets.push({
          layer,
          matched
        });
      }
    }

    const regressionRisk = this._riskFor(text, regressionTargets);

    return {
      regressionTargets,
      regressionRisk,
      requiresRegressionReview: regressionRisk === "critical" || regressionRisk === "high"
    };
  }

  _collectText(payload) {
    return [
      payload.userFeedback,
      payload.feedback,
      payload.comment,
      payload.query,
      payload.previousAnswer,
      payload.testFailure,
      payload.errorMessage,
      payload.correctionType
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  _matchSignals(text, signals = []) {
    return signals.filter(signal =>
      text.includes(String(signal).toLowerCase())
    );
  }

  _riskFor(text, regressionTargets = []) {
    for (const level of ["critical", "high", "medium", "low"]) {
      const terms = this.riskLevels[level] || [];
      if (terms.some(term => text.includes(String(term).toLowerCase()))) {
        return level;
      }
    }

    if (regressionTargets.length) return "medium";
    return "none";
  }
}

module.exports = FinanceRegressionFeedbackMapper;
