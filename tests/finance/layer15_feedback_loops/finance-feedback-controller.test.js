"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceFeedbackController = require("../../../Data/marion/runtime/finance/layer15_feedback_loops/FinanceFeedbackController");

function buildController() {
  return new FinanceFeedbackController({
    userCorrectionRules: {
      correctionPatterns: {
        explicitCorrection: ["that's wrong", "incorrect", "actually", "fix this"],
        staleData: ["outdated", "stale", "check latest", "deadline changed"],
        mathError: ["math is wrong", "calculation is wrong", "numbers don't match"],
        missingContext: ["you didn't account for", "you left out", "wrong year"],
        unsafeAdvice: ["sounds like financial advice", "you guaranteed", "missing caveat"]
      },
      classificationPriority: [
        "unsafeAdvice",
        "mathError",
        "staleData",
        "missingContext",
        "explicitCorrection"
      ],
      actions: {
        unsafeAdvice: "route_to_layer14_compliance_review",
        mathError: "route_to_layer06_execution_recalculation",
        staleData: "route_to_layer02_source_freshness_review",
        missingContext: "route_to_layer03_ingestion_gap_review",
        explicitCorrection: "route_to_feedback_memory_review"
      }
    },

    regressionFeedbackMap: {
      regressionMap: {
        layer02_source_authority: ["bad source", "outdated source", "source conflict"],
        layer03_data_ingestion: ["missing input", "missing context", "bad extraction"],
        layer06_execution: ["calculation error", "ratio error", "valuation error"],
        layer07_evidence_binding: ["unsupported claim", "missing citation", "weak evidence"],
        layer14_compliance_governance: ["unsafe advice", "missing disclosure", "guaranteed return", "data leak"]
      },
      riskLevels: {
        critical: ["unsafe advice", "guaranteed return", "data leak"],
        high: ["calculation error", "outdated source", "unsupported claim", "missing disclosure"],
        medium: ["missing context", "wrong period", "bad answer structure"],
        low: ["tone issue", "format issue", "too verbose"]
      }
    },

    answerQualityFeedback: {
      qualityDimensions: {
        accuracy: {
          weight: 0.3,
          failureSignals: ["wrong", "incorrect", "doesn't add up", "bad calculation"]
        },
        freshness: {
          weight: 0.2,
          failureSignals: ["outdated", "stale", "not current", "changed"]
        },
        evidence: {
          weight: 0.2,
          failureSignals: ["unsupported", "no source", "missing citation", "source conflict"]
        },
        compliance: {
          weight: 0.2,
          failureSignals: ["financial advice", "guaranteed", "missing caveat", "disclaimer"]
        },
        clarity: {
          weight: 0.1,
          failureSignals: ["unclear", "too vague", "too technical", "confusing"]
        }
      },
      scoreBands: {
        excellent: {
          min: 0.9,
          action: "no_action_required"
        },
        acceptable: {
          min: 0.75,
          action: "monitor"
        },
        degraded: {
          min: 0.5,
          action: "review_and_patch"
        },
        failed: {
          min: 0,
          action: "route_for_regression_review"
        }
      }
    }
  });
}

test("FinanceFeedbackController captures unsafe advice and routes to compliance review", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "finance",
    userFeedback: "This sounds like financial advice and has a missing caveat."
  });

  assert.equal(result.domain, "finance");
  assert.equal(result.runtimeLayer, "layer15_feedback_loops");
  assert.equal(result.feedbackStatus, "captured");
  assert.equal(result.correctionType, "unsafeAdvice");
  assert.equal(result.regressionRisk, "high");
  assert.equal(result.requiresComplianceReview, true);
  assert.equal(result.nextAction, "route_to_layer14_compliance_review");
  assert.equal(result.memoryWriteCandidate, true);
  assert.equal(result.nextLayerHandoff.targetLayer, "layer16_finance_runtime_monitoring");
  assert.equal(result.nextLayerHandoff.eligible, true);
});

test("FinanceFeedbackController captures math error and routes to regression review", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "finance",
    userFeedback: "The calculation is wrong. This is a calculation error."
  });

  assert.equal(result.feedbackStatus, "captured");
  assert.equal(result.correctionType, "mathError");
  assert.equal(result.regressionRisk, "high");
  assert.equal(result.requiresRegressionReview, true);
  assert.equal(result.requiresComplianceReview, false);
  assert.equal(result.nextAction, "route_for_regression_review");

  assert.ok(
    result.regressionTargets.some(target => target.layer === "layer06_execution"),
    "Expected layer06 execution regression target."
  );
});

test("FinanceFeedbackController captures stale source feedback", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "finance",
    userFeedback: "This is outdated source material. Check latest program deadline."
  });

  assert.equal(result.feedbackStatus, "captured");
  assert.equal(result.correctionType, "staleData");
  assert.equal(result.regressionRisk, "high");
  assert.equal(result.requiresRegressionReview, true);
  assert.equal(result.memoryWriteCandidate, true);

  assert.ok(
    result.regressionTargets.some(target => target.layer === "layer02_source_authority"),
    "Expected source authority regression target."
  );
});

test("FinanceFeedbackController returns no signal for positive feedback", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "finance",
    userFeedback: "This is clear and useful."
  });

  assert.equal(result.feedbackStatus, "no_feedback_signal");
  assert.equal(result.correctionType, "none");
  assert.equal(result.regressionRisk, "none");
  assert.equal(result.qualityScore, 1);
  assert.equal(result.memoryWriteCandidate, false);
  assert.equal(result.nextAction, "no_action_required");
});

test("FinanceFeedbackController rejects non-finance domain payloads", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "law",
    userFeedback: "Wrong statute."
  });

  assert.equal(result.feedbackStatus, "failed");
  assert.equal(result.correctionType, "invalid_payload");
  assert.equal(result.qualityScore, 0);
  assert.equal(result.requiresRegressionReview, true);
  assert.equal(result.nextLayerHandoff.eligible, false);
});

test("FinanceFeedbackController rejects invalid payloads", () => {
  const controller = buildController();

  const result = controller.evaluate(null);

  assert.equal(result.feedbackStatus, "failed");
  assert.equal(result.correctionType, "invalid_payload");
  assert.equal(result.qualityScore, 0);
  assert.equal(result.requiresRegressionReview, true);
  assert.equal(result.nextLayerHandoff.eligible, false);
});
