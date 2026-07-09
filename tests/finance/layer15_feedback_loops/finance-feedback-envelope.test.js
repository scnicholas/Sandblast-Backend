"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceFeedbackEnvelope = require("../../../Data/marion/runtime/finance/layer15_feedback_loops/FinanceFeedbackEnvelope");

test("FinanceFeedbackEnvelope builds a default captured envelope", () => {
  const envelope = FinanceFeedbackEnvelope.build({
    feedbackSignals: [
      {
        type: "user_correction",
        subtype: "mathError",
        severity: "high"
      }
    ],
    correctionType: "mathError",
    qualityScore: 0.7,
    regressionRisk: "high",
    regressionTargets: [
      {
        layer: "layer06_execution",
        matched: ["calculation error"]
      }
    ],
    memoryWriteCandidate: true,
    memoryRecord: {
      domain: "finance",
      type: "finance_feedback_learning_signal"
    },
    nextAction: "route_for_regression_review",
    requiresRegressionReview: true
  });

  assert.equal(envelope.domain, "finance");
  assert.equal(envelope.runtimeLayer, "layer15_feedback_loops");
  assert.equal(envelope.feedbackStatus, "captured");
  assert.equal(envelope.correctionType, "mathError");
  assert.equal(envelope.qualityScore, 0.7);
  assert.equal(envelope.qualityBand, "degraded");
  assert.equal(envelope.regressionRisk, "high");
  assert.equal(envelope.memoryWriteCandidate, true);
  assert.equal(envelope.requiresRegressionReview, true);
  assert.equal(envelope.nextLayerHandoff.targetLayer, "layer16_finance_runtime_monitoring");
  assert.equal(envelope.nextLayerHandoff.eligible, true);
  assert.ok(envelope.timestamp);
});

test("FinanceFeedbackEnvelope clamps quality score safely", () => {
  const high = FinanceFeedbackEnvelope.build({
    qualityScore: 2
  });

  const low = FinanceFeedbackEnvelope.build({
    qualityScore: -1
  });

  assert.equal(high.qualityScore, 1);
  assert.equal(high.qualityBand, "excellent");

  assert.equal(low.qualityScore, 0);
  assert.equal(low.qualityBand, "failed");
});

test("FinanceFeedbackEnvelope fail helper builds failed envelope", () => {
  const envelope = FinanceFeedbackEnvelope.fail("Invalid payload.", {
    received: null
  });

  assert.equal(envelope.feedbackStatus, "failed");
  assert.equal(envelope.correctionType, "invalid_payload");
  assert.equal(envelope.qualityScore, 0);
  assert.equal(envelope.qualityBand, "failed");
  assert.equal(envelope.regressionRisk, "high");
  assert.equal(envelope.requiresRegressionReview, true);
  assert.equal(envelope.nextLayerHandoff.eligible, false);
  assert.equal(envelope.nextLayerHandoff.reason, "Invalid payload.");
});

test("FinanceFeedbackEnvelope is JSON serializable", () => {
  const envelope = FinanceFeedbackEnvelope.build({
    correctionType: "staleData",
    qualityScore: 0.8
  });

  const parsed = JSON.parse(JSON.stringify(envelope));

  assert.equal(parsed.domain, "finance");
  assert.equal(parsed.runtimeLayer, "layer15_feedback_loops");
  assert.equal(parsed.correctionType, "staleData");
  assert.equal(parsed.qualityScore, 0.8);
});
