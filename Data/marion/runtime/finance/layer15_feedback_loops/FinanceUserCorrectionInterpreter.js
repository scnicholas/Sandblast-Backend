"use strict";

class FinanceUserCorrectionInterpreter {
  constructor(config = {}) {
    this.config = config;
    this.correctionPatterns = config.correctionPatterns || {};
    this.classificationPriority = Array.isArray(config.classificationPriority)
      ? config.classificationPriority
      : [
          "unsafeAdvice",
          "mathError",
          "staleData",
          "missingContext",
          "explicitCorrection"
        ];
    this.actions = config.actions || {};
  }

  interpret(payload = {}) {
    const text = this._collectText(payload);
    const matchedCategories = [];

    for (const [category, patterns] of Object.entries(this.correctionPatterns)) {
      const matched = this._matchPatterns(text, patterns);
      if (matched.length) {
        matchedCategories.push({
          category,
          matched,
          action: this.actions[category] || "review_feedback"
        });
      }
    }

    const correctionType = this._selectPrimaryCorrection(matchedCategories);

    return {
      correctionType,
      matchedCategories,
      hasCorrection: correctionType !== "none",
      recommendedAction: correctionType === "none"
        ? "monitor"
        : this.actions[correctionType] || "review_feedback"
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
      payload.errorMessage
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  _matchPatterns(text, patterns = []) {
    return patterns.filter(pattern =>
      text.includes(String(pattern).toLowerCase())
    );
  }

  _selectPrimaryCorrection(matchedCategories = []) {
    if (!matchedCategories.length) return "none";

    for (const priority of this.classificationPriority) {
      if (matchedCategories.some(item => item.category === priority)) {
        return priority;
      }
    }

    return matchedCategories[0].category;
  }
}

module.exports = FinanceUserCorrectionInterpreter;
