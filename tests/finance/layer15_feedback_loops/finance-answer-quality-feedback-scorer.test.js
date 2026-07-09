"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceAnswerQualityFeedbackScorer = require("../../../Data/marion/runtime/finance/layer15_feedback_loops/FinanceAnswerQualityFeedbackScorer");

function buildScorer() {
  return new FinanceAnswerQualityFeedbackScorer({
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
  });
}

test("FinanceAnswerQualityFeedbackScorer returns excellent for clean feedback", () => {
  const scorer = buildScorer();

  const result = scorer.score({
    userFeedback: "This is clear and useful."
  });

  assert.equal(result.qualityScore, 1);
  assert.equal(result.qualityBand, "excellent");
  assert.equal(result.nextAction, "no_action_required");
});

test("FinanceAnswerQualityFeedbackScorer penalizes accuracy failures", () => {
  const scorer = buildScorer();

  const result = scorer.score({
    userFeedback: "This is wrong and the calculation is a bad calculation."
  });

  assert.equal(result.qualityScore, 0.7);
  assert.equal(result.qualityBand, "degraded");
  assert.equal(result.nextAction, "review_and_patch");

  assert.ok(
    result.dimensionResults.some(item => item.dimension === "accuracy" && item.failed),
    "Expected accuracy dimension failure."
  );
});

test("FinanceAnswerQualityFeedbackScorer penalizes stale and unsupported answers", () => {
  const scorer = buildScorer();

  const result = scorer.score({
    userFeedback: "This is outdated and unsupported with no source."
  });

  assert.equal(result.qualityScore, 0.6);
  assert.equal(result.qualityBand, "degraded");
  assert.equal(result.nextAction, "review_and_patch");
});

test("FinanceAnswerQualityFeedbackScorer marks severe multi-dimension failure", () => {
  const scorer = buildScorer();

  const result = scorer.score({
    userFeedback:
      "This is wrong, outdated, unsupported, sounds like financial advice, and is confusing."
  });

  assert.equal(result.qualityScore, 0);
  assert.equal(result.qualityBand, "failed");
  assert.equal(result.nextAction, "route_for_regression_review");
});

test("FinanceAnswerQualityFeedbackScorer handles empty feedback safely", () => {
  const scorer = buildScorer();

  const result = scorer.score({});

  assert.equal(result.qualityScore, 1);
  assert.equal(result.qualityBand, "excellent");
});
