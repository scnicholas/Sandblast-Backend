"use strict";

const FinanceFeedbackEnvelope = require("./FinanceFeedbackEnvelope");
const FinanceUserCorrectionInterpreter = require("./FinanceUserCorrectionInterpreter");
const FinanceRegressionFeedbackMapper = require("./FinanceRegressionFeedbackMapper");
const FinanceAnswerQualityFeedbackScorer = require("./FinanceAnswerQualityFeedbackScorer");
const FinanceFeedbackMemoryBridge = require("./FinanceFeedbackMemoryBridge");

class FinanceFeedbackController {
  constructor(config = {}) {
    this.config = config;

    this.userCorrectionInterpreter = new FinanceUserCorrectionInterpreter(
      config.userCorrectionRules || {}
    );

    this.regressionFeedbackMapper = new FinanceRegressionFeedbackMapper(
      config.regressionFeedbackMap || {}
    );

    this.answerQualityFeedbackScorer = new FinanceAnswerQualityFeedbackScorer(
      config.answerQualityFeedback || {}
    );

    this.feedbackMemoryBridge = new FinanceFeedbackMemoryBridge(
      config.feedbackMemory || {}
    );
  }

  evaluate(payload = {}) {
    if (!payload || typeof payload !== "object") {
      return FinanceFeedbackEnvelope.fail("Invalid finance feedback payload.");
    }

    const domain = payload.domain || "finance";

    if (domain !== "finance") {
      return FinanceFeedbackEnvelope.fail("Non-finance payload rejected by finance feedback layer.", {
        receivedDomain: domain
      });
    }

    const correction = this.userCorrectionInterpreter.interpret(payload);

    const regression = this.regressionFeedbackMapper.map({
      ...payload,
      correctionType: correction.correctionType
    });

    const quality = this.answerQualityFeedbackScorer.score(payload);

    const feedbackSignals = this._buildFeedbackSignals({
      correction,
      regression,
      quality
    });

    const requiresComplianceReview =
      correction.correctionType === "unsafeAdvice" ||
      regression.regressionTargets.some(target =>
        target.layer === "layer14_compliance_governance"
      );

    const memory = this.feedbackMemoryBridge.prepare({
      ...payload,
      correctionType: correction.correctionType,
      regressionRisk: regression.regressionRisk,
      qualityBand: quality.qualityBand,
      regressionTargets: regression.regressionTargets
    });

    return FinanceFeedbackEnvelope.build({
      feedbackStatus: feedbackSignals.length ? "captured" : "no_feedback_signal",
      feedbackSignals,
      correctionType: correction.correctionType,
      qualityScore: quality.qualityScore,
      qualityBand: quality.qualityBand,
      regressionRisk: regression.regressionRisk,
      regressionTargets: regression.regressionTargets,
      memoryWriteCandidate: memory.memoryWriteCandidate,
      memoryRecord: memory.memoryRecord,
      nextAction: this._nextAction({
        correction,
        regression,
        quality,
        requiresComplianceReview
      }),
      requiresRegressionReview: regression.requiresRegressionReview,
      requiresComplianceReview,
      diagnostics: {
        correction,
        regression,
        quality,
        memory
      },
      nextLayerEligible: true,
      nextLayerReason: feedbackSignals.length
        ? "Finance feedback captured and prepared for runtime monitoring."
        : "No actionable finance feedback signal detected."
    });
  }

  _buildFeedbackSignals(input = {}) {
    const signals = [];

    const correction = input.correction || {};
    const regression = input.regression || {};
    const quality = input.quality || {};

    if (correction.correctionType && correction.correctionType !== "none") {
      signals.push({
        type: "user_correction",
        subtype: correction.correctionType,
        severity: this._severityForCorrection(correction.correctionType),
        action: correction.recommendedAction
      });
    }

    if (regression.regressionRisk && regression.regressionRisk !== "none") {
      signals.push({
        type: "regression_feedback",
        severity: regression.regressionRisk,
        targets: regression.regressionTargets
      });
    }

    if (quality.qualityBand === "degraded" || quality.qualityBand === "failed") {
      signals.push({
        type: "answer_quality_feedback",
        severity: quality.qualityBand === "failed" ? "high" : "medium",
        qualityScore: quality.qualityScore,
        qualityBand: quality.qualityBand
      });
    }

    return signals;
  }

  _severityForCorrection(correctionType) {
    const severity = {
      unsafeAdvice: "critical",
      mathError: "high",
      staleData: "high",
      missingContext: "medium",
      explicitCorrection: "medium"
    };

    return severity[correctionType] || "low";
  }

  _nextAction(input = {}) {
    if (input.requiresComplianceReview) return "route_to_layer14_compliance_review";
    if (input.regression?.requiresRegressionReview) return "route_for_regression_review";
    if (input.quality?.nextAction) return input.quality.nextAction;
    if (input.correction?.recommendedAction) return input.correction.recommendedAction;
    return "monitor";
  }
}

module.exports = FinanceFeedbackController;
