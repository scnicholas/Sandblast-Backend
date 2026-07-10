"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceRuntimeAlertRouter = require("../../../Data/marion/runtime/finance/layer16_runtime_monitoring/FinanceRuntimeAlertRouter");

function buildRouter() {
  return new FinanceRuntimeAlertRouter({
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
  });
}

test("FinanceRuntimeAlertRouter returns monitor-only route for stable runtime", () => {
  const router = buildRouter();

  const result = router.route({
    runtimeStatus: "stable"
  });

  assert.equal(result.alertLevel, "none");
  assert.equal(result.recommendedRoute, "monitor_only");
  assert.equal(result.requiresOperatorReview, false);
});

test("FinanceRuntimeAlertRouter prioritizes operator review", () => {
  const router = buildRouter();

  const result = router.route({
    runtimeStatus: "escalation_required",
    requiresOperatorReview: true,
    requiresComplianceReview: true,
    requiresRegressionReview: true
  });

  assert.equal(result.alertLevel, "operator_review");
  assert.equal(result.recommendedRoute, "route_to_operator_review");
  assert.equal(result.requiresOperatorReview, true);
});

test("FinanceRuntimeAlertRouter routes compliance review when compliance is required", () => {
  const router = buildRouter();

  const result = router.route({
    runtimeStatus: "watch",
    requiresComplianceReview: true
  });

  assert.equal(result.alertLevel, "watch");
  assert.equal(result.recommendedRoute, "route_to_layer14_compliance_review");
  assert.equal(result.requiresOperatorReview, false);
});

test("FinanceRuntimeAlertRouter routes source freshness pressure to Layer 02", () => {
  const router = buildRouter();

  const result = router.route({
    runtimeStatus: "degraded",
    sourceFreshnessPressure: {
      requiresSourceFreshnessReview: true
    }
  });

  assert.equal(result.alertLevel, "warning");
  assert.equal(result.recommendedRoute, "route_to_layer02_source_freshness_review");
  assert.equal(result.requiresOperatorReview, false);
});

test("FinanceRuntimeAlertRouter routes regression review when no higher-priority route exists", () => {
  const router = buildRouter();

  const result = router.route({
    runtimeStatus: "degraded",
    requiresRegressionReview: true
  });

  assert.equal(result.alertLevel, "warning");
  assert.equal(result.recommendedRoute, "route_for_regression_review");
  assert.equal(result.requiresOperatorReview, false);
});
