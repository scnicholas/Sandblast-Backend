"use strict";

class FinanceRegulatoryBoundaryChecker {
  constructor(config = {}) {
    this.config = config;
    this.boundaryTriggers = config.boundaryTriggers || {};
  }

  check(payload = {}) {
    const text = this._collectText(payload);
    const flags = [];

    for (const [category, triggers] of Object.entries(this.boundaryTriggers)) {
      const matched = this._matchTriggers(text, triggers);
      if (matched.length) {
        flags.push({
          category,
          severity: this._severityFor(category),
          matched
        });
      }
    }

    return {
      boundaryFlags: flags,
      hasBlockingBoundary: flags.some(flag => flag.severity === "block"),
      hasReviewBoundary: flags.some(flag => flag.severity === "hold")
    };
  }

  _collectText(payload) {
    return [
      payload.query,
      payload.answer,
      payload.response,
      payload.sanitizedResponse,
      payload.intent,
      payload.analysisType
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  _matchTriggers(text, triggers = []) {
    return triggers.filter(trigger => text.includes(String(trigger).toLowerCase()));
  }

  _severityFor(category) {
    const hold = new Set([
      "personalizedAdvice",
      "taxBoundary",
      "legalBoundary",
      "highRiskFinancialProduct"
    ]);

    const block = new Set([
      "fundingBoundary"
    ]);

    if (block.has(category)) return "block";
    if (hold.has(category)) return "hold";
    return "warn";
  }
}

module.exports = FinanceRegulatoryBoundaryChecker;
