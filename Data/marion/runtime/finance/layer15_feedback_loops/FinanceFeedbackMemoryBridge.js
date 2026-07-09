"use strict";

class FinanceFeedbackMemoryBridge {
  constructor(config = {}) {
    this.config = config;
  }

  prepare(payload = {}) {
    const correctionType = payload.correctionType || "none";
    const feedbackText = this._extractFeedbackText(payload);

    const memoryWriteCandidate = this._shouldWriteMemory({
      correctionType,
      regressionRisk: payload.regressionRisk,
      qualityBand: payload.qualityBand,
      feedbackText
    });

    if (!memoryWriteCandidate) {
      return {
        memoryWriteCandidate: false,
        memoryRecord: null
      };
    }

    return {
      memoryWriteCandidate: true,
      memoryRecord: {
        domain: "finance",
        type: "finance_feedback_learning_signal",
        correctionType,
        regressionRisk: payload.regressionRisk || "none",
        qualityBand: payload.qualityBand || "acceptable",
        summary: this._summarize(feedbackText),
        regressionTargets: Array.isArray(payload.regressionTargets)
          ? payload.regressionTargets.map(item => item.layer)
          : [],
        createdAt: new Date().toISOString()
      }
    };
  }

  _extractFeedbackText(payload = {}) {
    return [
      payload.userFeedback,
      payload.feedback,
      payload.comment,
      payload.testFailure,
      payload.errorMessage
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  _shouldWriteMemory(input = {}) {
    if (!input.feedbackText) return false;

    const durableCorrectionTypes = new Set([
      "unsafeAdvice",
      "mathError",
      "staleData",
      "missingContext",
      "explicitCorrection"
    ]);

    const durableRisk = new Set([
      "critical",
      "high"
    ]);

    const durableQualityBands = new Set([
      "degraded",
      "failed"
    ]);

    return (
      durableCorrectionTypes.has(input.correctionType) ||
      durableRisk.has(input.regressionRisk) ||
      durableQualityBands.has(input.qualityBand)
    );
  }

  _summarize(text) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();

    if (cleaned.length <= 240) return cleaned;
    return `${cleaned.slice(0, 237)}...`;
  }
}

module.exports = FinanceFeedbackMemoryBridge;
