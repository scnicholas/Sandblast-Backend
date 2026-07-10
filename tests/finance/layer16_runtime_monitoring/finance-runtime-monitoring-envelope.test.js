"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceRuntimeMonitoringEnvelope = require("../../../Data/marion/runtime/finance/layer16_runtime_monitoring/FinanceRuntimeMonitoringEnvelope");

test("FinanceRuntimeMonitoringEnvelope builds a stable default envelope", () => {
  const envelope = FinanceRuntimeMonitoringEnvelope.build({
    driftScore: 0.1
  });

  assert.equal(envelope.domain, "finance");
  assert.equal(envelope.runtimeLayer, "layer16_runtime_monitoring");
  assert.equal(envelope.runtimeStatus, "stable");
  assert.equal(envelope.driftDetected, false);
  assert.equal(envelope.driftScore, 0.1);
  assert.deepEqual(envelope.trendSignals, []);
  assert.deepEqual(envelope.recurrenceSignals, []);
  assert.equal(envelope.sourceFreshnessPressure.detected, false);
  assert.equal(envelope.alertLevel, "none");
  assert.equal(envelope.recommendedRoute, "monitor_only");
  assert.equal(envelope.requiresOperatorReview, false);
  assert.equal(envelope.nextLayerHandoff.targetLayer, "layer17_finance_operator_intervention");
  assert.equal(envelope.nextLayerHandoff.eligible, true);
  assert.ok(envelope.timestamp);
});

test("FinanceRuntimeMonitoringEnvelope derives runtime status from drift score", () => {
  const watch = FinanceRuntimeMonitoringEnvelope.build({ driftScore: 0.3 });
  const degraded = FinanceRuntimeMonitoringEnvelope.build({ driftScore: 0.5 });
  const drift = FinanceRuntimeMonitoringEnvelope.build({ driftScore: 0.75 });
  const escalation = FinanceRuntimeMonitoringEnvelope.build({ driftScore: 0.9 });

  assert.equal(watch.runtimeStatus, "watch");
  assert.equal(degraded.runtimeStatus, "degraded");
  assert.equal(drift.runtimeStatus, "drift_detected");
  assert.equal(escalation.runtimeStatus, "escalation_required");
});

test("FinanceRuntimeMonitoringEnvelope clamps drift score safely", () => {
  const high = FinanceRuntimeMonitoringEnvelope.build({
    driftScore: 2
  });

  const low = FinanceRuntimeMonitoringEnvelope.build({
    driftScore: -1
  });

  assert.equal(high.driftScore, 1);
  assert.equal(high.runtimeStatus, "escalation_required");

  assert.equal(low.driftScore, 0);
  assert.equal(low.runtimeStatus, "stable");
});

test("FinanceRuntimeMonitoringEnvelope fail helper builds failed envelope", () => {
  const envelope = FinanceRuntimeMonitoringEnvelope.fail("Invalid payload.", {
    received: null
  });

  assert.equal(envelope.runtimeStatus, "failed");
  assert.equal(envelope.driftDetected, false);
  assert.equal(envelope.driftScore, 0);
  assert.equal(envelope.alertLevel, "critical");
  assert.equal(envelope.recommendedRoute, "route_to_operator_review");
  assert.equal(envelope.requiresOperatorReview, true);
  assert.equal(envelope.requiresRegressionReview, true);
  assert.equal(envelope.nextLayerHandoff.eligible, false);
  assert.equal(envelope.nextLayerHandoff.reason, "Invalid payload.");
});

test("FinanceRuntimeMonitoringEnvelope is JSON serializable", () => {
  const envelope = FinanceRuntimeMonitoringEnvelope.build({
    runtimeStatus: "watch",
    driftDetected: false,
    driftScore: 0.3,
    trendSignals: [
      {
        trendType: "quality_degradation",
        severity: "medium"
      }
    ],
    recommendedRoute: "monitor_only"
  });

  const parsed = JSON.parse(JSON.stringify(envelope));

  assert.equal(parsed.domain, "finance");
  assert.equal(parsed.runtimeLayer, "layer16_runtime_monitoring");
  assert.equal(parsed.runtimeStatus, "watch");
  assert.equal(parsed.driftScore, 0.3);
  assert.equal(parsed.trendSignals.length, 1);
});
