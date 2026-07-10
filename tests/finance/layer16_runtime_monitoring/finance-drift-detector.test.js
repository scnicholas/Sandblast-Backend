"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceDriftDetector = require("../../../Data/marion/runtime/finance/layer16_runtime_monitoring/FinanceDriftDetector");

function buildDetector() {
  return new FinanceDriftDetector({
    windowing: {
      defaultRecentWindow: 10,
      minimumEventsForTrend: 3,
      criticalEventWindow: 5,
      maxWindowSize: 50
    },
    qualityThresholds: {
      qualityScoreExcellentMin: 0.9,
      qualityScoreAcceptableMin: 0.75,
      qualityScoreWarningBelow: 0.75,
      qualityScoreCriticalBelow: 0.5,
      degradedBandCountWarning: 2,
      failedBandCountCritical: 1
    },
    feedbackThresholds: {
      mediumRiskFeedbackCountWindow: 3,
      highRiskFeedbackCountWindow: 2,
      criticalFeedbackCountWindow: 1,
      repeatedCorrectionTypeCount: 2,
      userCorrectionClusterCount: 3
    },
    complianceThresholds: {
      complianceReviewWarningCount: 1,
      complianceReviewCriticalCount: 2,
      unsafeAdviceImmediateEscalation: true,
      guaranteeLanguageImmediateEscalation: true,
      dataLeakImmediateEscalation: true
    },
    sourceFreshnessThresholds: {
      staleDataWarningCount: 2,
      staleDataCriticalCount: 3,
      sourceAuthorityReviewCount: 2
    },
    driftScoreThresholds: {
      stableMax: 0.24,
      watchMin: 0.25,
      degradedMin: 0.45,
      driftDetectedMin: 0.7,
      escalationRequiredMin: 0.85
    },
    weights: {
      qualityDegradation: 0.25,
      feedbackRecurrence: 0.2,
      complianceRecurrence: 0.25,
      sourceFreshnessPressure: 0.15,
      regressionRisk: 0.15
    }
  });
}

test("FinanceDriftDetector returns stable with no events", () => {
  const detector = buildDetector();

  const result = detector.detect({
    events: []
  });

  assert.equal(result.driftDetected, false);
  assert.equal(result.driftScore, 0);
  assert.equal(result.runtimeStatus, "stable");
  assert.equal(result.monitoredEventCount, 0);
});

test("FinanceDriftDetector detects quality degradation factors", () => {
  const detector = buildDetector();

  const result = detector.detect({
    events: [
      {
        id: "evt-1",
        qualityScore: 0.7,
        qualityBand: "degraded"
      },
      {
        id: "evt-2",
        qualityScore: 0.4,
        qualityBand: "failed"
      }
    ]
  });

  assert.equal(result.driftFactors.quality.score, 1);
  assert.equal(result.driftFactors.quality.degradedCount, 2);
  assert.equal(result.driftFactors.quality.failedCount, 1);
  assert.equal(result.runtimeStatus, "watch");
});

test("FinanceDriftDetector detects repeated correction feedback", () => {
  const detector = buildDetector();

  const result = detector.detect({
    events: [
      {
        id: "evt-1",
        correctionType: "mathError"
      },
      {
        id: "evt-2",
        correctionType: "mathError"
      },
      {
        id: "evt-3",
        correctionType: "mathError"
      }
    ]
  });

  assert.equal(result.driftFactors.feedback.score, 1);
  assert.equal(result.driftFactors.feedback.correctionTotal, 3);
  assert.deepEqual(result.driftFactors.feedback.repeatedTypes, [
    {
      type: "mathError",
      count: 3
    }
  ]);
});

test("FinanceDriftDetector escalates compliance recurrence with high regression risk", () => {
  const detector = buildDetector();

  const result = detector.detect({
    events: [
      {
        id: "evt-1",
        correctionType: "unsafeAdvice",
        requiresComplianceReview: true,
        regressionRisk: "high"
      },
      {
        id: "evt-2",
        correctionType: "unsafeAdvice",
        requiresComplianceReview: true
      }
    ]
  });

  assert.equal(result.driftFactors.compliance.score, 1);
  assert.equal(result.driftFactors.regression.score, 0.5);
  assert.equal(result.runtimeStatus, "escalation_required");
  assert.equal(result.driftDetected, true);
});

test("FinanceDriftDetector detects source freshness pressure", () => {
  const detector = buildDetector();

  const result = detector.detect({
    events: [
      {
        id: "evt-1",
        correctionType: "staleData"
      },
      {
        id: "evt-2",
        userFeedback: "This is outdated."
      },
      {
        id: "evt-3",
        regressionTargets: [
          {
            layer: "layer02_source_authority",
            matched: ["outdated source"]
          }
        ]
      }
    ]
  });

  assert.equal(result.driftFactors.freshness.score, 1);
  assert.equal(result.driftFactors.freshness.count, 3);
  assert.equal(result.runtimeStatus, "watch");
});
