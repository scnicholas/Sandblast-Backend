"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceRuntimeMonitoringController = require("../../../Data/marion/runtime/finance/layer16_runtime_monitoring/FinanceRuntimeMonitoringController");

function buildController() {
  return new FinanceRuntimeMonitoringController({
    driftDetectionThresholds: {
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
    },

    feedbackTrendRules: {
      trendRules: {
        unsafeAdvice: {
          matchesCorrectionTypes: ["unsafeAdvice"],
          matchesSignals: [
            "unsafe advice",
            "missing caveat",
            "financial advice",
            "guaranteed return",
            "missing disclosure"
          ],
          trendType: "compliance_recurrence",
          minimumCount: 1,
          severity: "critical",
          recommendedRoute: "route_to_layer14_compliance_review"
        },
        mathError: {
          matchesCorrectionTypes: ["mathError"],
          matchesSignals: [
            "calculation error",
            "ratio error",
            "valuation error",
            "projection error",
            "numbers don't match"
          ],
          trendType: "calculation_recurrence",
          minimumCount: 2,
          severity: "high",
          recommendedRoute: "route_to_layer06_execution_recalculation"
        },
        staleData: {
          matchesCorrectionTypes: ["staleData"],
          matchesSignals: [
            "outdated source",
            "stale data",
            "deadline changed",
            "rate changed",
            "program changed",
            "not current"
          ],
          trendType: "source_freshness_pressure",
          minimumCount: 2,
          severity: "high",
          recommendedRoute: "route_to_layer02_source_freshness_review"
        },
        unsupportedClaim: {
          matchesCorrectionTypes: ["explicitCorrection"],
          matchesSignals: [
            "unsupported claim",
            "missing citation",
            "weak evidence",
            "source conflict",
            "no source"
          ],
          trendType: "evidence_support_decay",
          minimumCount: 2,
          severity: "high",
          recommendedRoute: "route_to_layer07_evidence_binding_review"
        },
        qualityDegradation: {
          matchesQualityBands: ["degraded", "failed"],
          trendType: "quality_degradation",
          minimumCount: 2,
          severity: "medium",
          recommendedRoute: "route_to_operator_review"
        }
      },
      priorityOrder: [
        "unsafeAdvice",
        "staleData",
        "mathError",
        "unsupportedClaim",
        "missingContext",
        "qualityDegradation"
      ],
      defaultRoute: "monitor_only"
    },

    complianceRecurrenceRules: {
      complianceSignals: {
        unsafeAdvice: {
          aliases: [
            "unsafeAdvice",
            "unsafe advice",
            "financial advice",
            "personalized investment advice"
          ],
          singleOccurrenceSeverity: "critical",
          recurrenceSeverity: "critical",
          immediateEscalation: true,
          recommendedRoute: "route_to_layer14_compliance_review"
        },
        missingDisclosure: {
          aliases: [
            "missing disclosure",
            "missing caveat",
            "no disclaimer",
            "disclosure gap"
          ],
          singleOccurrenceSeverity: "high",
          recurrenceSeverity: "critical",
          immediateEscalation: false,
          recommendedRoute: "route_to_layer14_compliance_review"
        },
        guaranteeLanguage: {
          aliases: [
            "guaranteed return",
            "guaranteed profit",
            "approval guaranteed",
            "funding guaranteed",
            "guaranteed outcome"
          ],
          singleOccurrenceSeverity: "critical",
          recurrenceSeverity: "critical",
          immediateEscalation: true,
          recommendedRoute: "route_to_layer14_compliance_review"
        },
        sensitiveDataHandling: {
          aliases: [
            "data leak",
            "sensitive financial data",
            "account number exposed",
            "sin exposed",
            "ssn exposed",
            "private financial data"
          ],
          singleOccurrenceSeverity: "critical",
          recurrenceSeverity: "critical",
          immediateEscalation: true,
          recommendedRoute: "route_to_operator_review"
        }
      },
      recurrencePolicy: {
        oneOccurrence: {
          runtimeStatus: "watch",
          alertLevel: "watch"
        },
        twoOccurrences: {
          runtimeStatus: "degraded",
          alertLevel: "warning"
        },
        threeOrMoreOccurrences: {
          runtimeStatus: "escalation_required",
          alertLevel: "operator_review"
        },
        criticalImmediate: {
          runtimeStatus: "escalation_required",
          alertLevel: "critical"
        }
      },
      reviewRequirements: {
        requiresComplianceReview: true,
        requiresOperatorReviewWhenCritical: true,
        requiresOperatorReviewWhenRecurring: true
      }
    },

    runtimeAlertPolicy: {
      alertLevels: {
        none: {
          requiresOperatorReview: false,
          defaultRoute: "monitor_only"
        },
        watch: {
          requiresOperatorReview: false,
          defaultRoute: "monitor_only"
        },
        warning: {
          requiresOperatorReview: false,
          defaultRoute: "route_for_regression_review"
        },
        critical: {
          requiresOperatorReview: true,
          defaultRoute: "route_to_operator_review"
        },
        operator_review: {
          requiresOperatorReview: true,
          defaultRoute: "route_to_operator_review"
        }
      },
      routePriority: [
        "route_to_operator_review",
        "route_to_layer14_compliance_review",
        "route_to_layer02_source_freshness_review",
        "route_to_layer06_execution_recalculation",
        "route_to_layer07_evidence_binding_review",
        "route_to_layer03_ingestion_gap_review",
        "route_for_regression_review",
        "monitor_only"
      ],
      statusPolicy: {
        stable: {
          alertLevel: "none",
          requiresOperatorReview: false
        },
        watch: {
          alertLevel: "watch",
          requiresOperatorReview: false
        },
        degraded: {
          alertLevel: "warning",
          requiresOperatorReview: false
        },
        drift_detected: {
          alertLevel: "critical",
          requiresOperatorReview: true
        },
        escalation_required: {
          alertLevel: "operator_review",
          requiresOperatorReview: true
        }
      }
    }
  });
}

test("FinanceRuntimeMonitoringController returns stable for clean runtime input", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "finance",
    events: []
  });

  assert.equal(result.domain, "finance");
  assert.equal(result.runtimeLayer, "layer16_runtime_monitoring");
  assert.equal(result.runtimeStatus, "stable");
  assert.equal(result.driftDetected, false);
  assert.equal(result.alertLevel, "none");
  assert.equal(result.recommendedRoute, "monitor_only");
  assert.equal(result.requiresOperatorReview, false);
  assert.equal(result.requiresComplianceReview, false);
  assert.equal(result.requiresRegressionReview, false);
  assert.equal(result.nextLayerHandoff.targetLayer, "layer17_finance_operator_intervention");
  assert.equal(result.nextLayerHandoff.eligible, true);
});

test("FinanceRuntimeMonitoringController routes repeated math errors to Layer 06", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "finance",
    events: [
      {
        id: "evt-1",
        correctionType: "mathError",
        userFeedback: "The calculation is wrong."
      },
      {
        id: "evt-2",
        correctionType: "mathError",
        userFeedback: "This is another calculation error."
      }
    ]
  });

  assert.equal(result.runtimeStatus, "watch");
  assert.equal(result.alertLevel, "watch");
  assert.equal(result.recommendedRoute, "route_to_layer06_execution_recalculation");
  assert.equal(result.requiresRegressionReview, true);
  assert.equal(result.requiresOperatorReview, false);

  assert.ok(
    result.trendSignals.some(signal => signal.trendType === "calculation_recurrence"),
    "Expected calculation recurrence trend."
  );
});

test("FinanceRuntimeMonitoringController routes stale-source pressure to Layer 02", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "finance",
    events: [
      {
        id: "evt-1",
        correctionType: "staleData",
        userFeedback: "This source is outdated."
      },
      {
        id: "evt-2",
        correctionType: "staleData",
        userFeedback: "The deadline changed and the information is not current."
      }
    ]
  });

  assert.equal(result.runtimeStatus, "degraded");
  assert.equal(result.alertLevel, "warning");
  assert.equal(result.recommendedRoute, "route_to_layer02_source_freshness_review");
  assert.equal(result.sourceFreshnessPressure.pressureLevel, "warning");
  assert.equal(result.requiresRegressionReview, true);
  assert.equal(result.requiresOperatorReview, false);
});

test("FinanceRuntimeMonitoringController escalates unsafe advice recurrence", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "finance",
    events: [
      {
        id: "evt-1",
        correctionType: "unsafeAdvice",
        requiresComplianceReview: true,
        regressionRisk: "high",
        userFeedback: "This is unsafe advice with a missing caveat."
      }
    ]
  });

  assert.equal(result.runtimeStatus, "escalation_required");
  assert.equal(result.alertLevel, "critical");
  assert.equal(result.recommendedRoute, "route_to_operator_review");
  assert.equal(result.requiresComplianceReview, true);
  assert.equal(result.requiresOperatorReview, true);

  assert.ok(
    result.recurrenceSignals.some(signal => signal.signal === "unsafeAdvice"),
    "Expected unsafeAdvice recurrence signal."
  );
});

test("FinanceRuntimeMonitoringController rejects non-finance domain payloads", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "law",
    events: []
  });

  assert.equal(result.runtimeStatus, "failed");
  assert.equal(result.alertLevel, "critical");
  assert.equal(result.recommendedRoute, "route_to_operator_review");
  assert.equal(result.requiresOperatorReview, true);
  assert.equal(result.nextLayerHandoff.eligible, false);
});

test("FinanceRuntimeMonitoringController rejects invalid payloads", () => {
  const controller = buildController();

  const result = controller.evaluate(null);

  assert.equal(result.runtimeStatus, "failed");
  assert.equal(result.alertLevel, "critical");
  assert.equal(result.recommendedRoute, "route_to_operator_review");
  assert.equal(result.requiresOperatorReview, true);
  assert.equal(result.nextLayerHandoff.eligible, false);
});
