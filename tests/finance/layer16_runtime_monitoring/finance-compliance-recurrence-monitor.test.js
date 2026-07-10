"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceComplianceRecurrenceMonitor = require("../../../Data/marion/runtime/finance/layer16_runtime_monitoring/FinanceComplianceRecurrenceMonitor");

function buildMonitor() {
  return new FinanceComplianceRecurrenceMonitor({
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
  });
}

test("FinanceComplianceRecurrenceMonitor escalates unsafe advice immediately", () => {
  const monitor = buildMonitor();

  const result = monitor.monitor({
    events: [
      {
        id: "evt-1",
        correctionType: "unsafeAdvice",
        userFeedback: "This is unsafe advice."
      }
    ]
  });

  assert.equal(result.hasComplianceRecurrence, true);
  assert.equal(result.hasCriticalCompliance, true);
  assert.equal(result.requiresComplianceReview, true);
  assert.equal(result.requiresOperatorReview, true);
  assert.equal(result.runtimeStatus, "escalation_required");
  assert.equal(result.alertLevel, "critical");
  assert.equal(result.recommendedRoute, "route_to_layer14_compliance_review");
});

test("FinanceComplianceRecurrenceMonitor watches a single missing-disclosure occurrence", () => {
  const monitor = buildMonitor();

  const result = monitor.monitor({
    events: [
      {
        id: "evt-1",
        userFeedback: "There is a missing caveat."
      }
    ]
  });

  assert.equal(result.hasComplianceRecurrence, true);
  assert.equal(result.requiresComplianceReview, true);
  assert.equal(result.requiresOperatorReview, false);
  assert.equal(result.runtimeStatus, "watch");
  assert.equal(result.alertLevel, "watch");
  assert.equal(result.strongestComplianceSignal.signal, "missingDisclosure");
});

test("FinanceComplianceRecurrenceMonitor escalates repeated missing disclosures", () => {
  const monitor = buildMonitor();

  const result = monitor.monitor({
    events: [
      {
        id: "evt-1",
        userFeedback: "There is a missing disclosure."
      },
      {
        id: "evt-2",
        userFeedback: "Another missing caveat happened."
      }
    ]
  });

  assert.equal(result.hasComplianceRecurrence, true);
  assert.equal(result.requiresComplianceReview, true);
  assert.equal(result.requiresOperatorReview, true);
  assert.equal(result.runtimeStatus, "degraded");
  assert.equal(result.alertLevel, "warning");
  assert.equal(result.strongestComplianceSignal.count, 2);
});

test("FinanceComplianceRecurrenceMonitor routes sensitive data handling to operator review", () => {
  const monitor = buildMonitor();

  const result = monitor.monitor({
    events: [
      {
        id: "evt-1",
        userFeedback: "There was a data leak and private financial data was exposed."
      }
    ]
  });

  assert.equal(result.hasComplianceRecurrence, true);
  assert.equal(result.hasCriticalCompliance, true);
  assert.equal(result.requiresOperatorReview, true);
  assert.equal(result.runtimeStatus, "escalation_required");
  assert.equal(result.alertLevel, "critical");
  assert.equal(result.recommendedRoute, "route_to_operator_review");
});

test("FinanceComplianceRecurrenceMonitor returns stable when no compliance signal exists", () => {
  const monitor = buildMonitor();

  const result = monitor.monitor({
    events: [
      {
        id: "evt-1",
        userFeedback: "This answer was useful."
      }
    ]
  });

  assert.equal(result.hasComplianceRecurrence, false);
  assert.equal(result.hasCriticalCompliance, false);
  assert.equal(result.requiresComplianceReview, false);
  assert.equal(result.requiresOperatorReview, false);
  assert.equal(result.runtimeStatus, "stable");
  assert.equal(result.alertLevel, "none");
  assert.equal(result.recommendedRoute, "monitor_only");
  assert.deepEqual(result.recurrenceSignals, []);
});
