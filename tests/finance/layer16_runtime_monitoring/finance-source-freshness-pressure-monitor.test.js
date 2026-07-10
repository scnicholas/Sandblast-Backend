"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceSourceFreshnessPressureMonitor = require("../../../Data/marion/runtime/finance/layer16_runtime_monitoring/FinanceSourceFreshnessPressureMonitor");

function buildMonitor() {
  return new FinanceSourceFreshnessPressureMonitor({
    sourceFreshnessThresholds: {
      staleDataWarningCount: 2,
      staleDataCriticalCount: 3,
      sourceAuthorityReviewCount: 2
    }
  });
}

test("FinanceSourceFreshnessPressureMonitor returns no pressure when no freshness signal exists", () => {
  const monitor = buildMonitor();

  const result = monitor.monitor({
    events: [
      {
        id: "evt-1",
        userFeedback: "Looks good."
      }
    ]
  });

  assert.equal(result.detected, false);
  assert.equal(result.pressureLevel, "none");
  assert.equal(result.count, 0);
  assert.equal(result.alertLevel, "none");
  assert.equal(result.recommendedRoute, "monitor_only");
  assert.equal(result.requiresSourceFreshnessReview, false);
});

test("FinanceSourceFreshnessPressureMonitor returns watch for one stale-data signal", () => {
  const monitor = buildMonitor();

  const result = monitor.monitor({
    events: [
      {
        id: "evt-1",
        correctionType: "staleData",
        userFeedback: "This source is outdated."
      }
    ]
  });

  assert.equal(result.detected, true);
  assert.equal(result.pressureLevel, "watch");
  assert.equal(result.count, 1);
  assert.equal(result.alertLevel, "watch");
  assert.equal(result.recommendedRoute, "monitor_only");
  assert.equal(result.requiresSourceFreshnessReview, false);
});

test("FinanceSourceFreshnessPressureMonitor returns warning for repeated stale-data signals", () => {
  const monitor = buildMonitor();

  const result = monitor.monitor({
    events: [
      {
        id: "evt-1",
        correctionType: "staleData",
        userFeedback: "This source is outdated."
      },
      {
        id: "evt-2",
        userFeedback: "The deadline changed and the information is not current."
      }
    ]
  });

  assert.equal(result.detected, true);
  assert.equal(result.pressureLevel, "warning");
  assert.equal(result.count, 2);
  assert.equal(result.alertLevel, "warning");
  assert.equal(result.recommendedRoute, "route_to_layer02_source_freshness_review");
  assert.equal(result.requiresSourceFreshnessReview, true);
});

test("FinanceSourceFreshnessPressureMonitor returns critical for three stale-data signals", () => {
  const monitor = buildMonitor();

  const result = monitor.monitor({
    events: [
      {
        id: "evt-1",
        correctionType: "staleData"
      },
      {
        id: "evt-2",
        userFeedback: "Program changed."
      },
      {
        id: "evt-3",
        userFeedback: "Rate changed and this is not current."
      }
    ]
  });

  assert.equal(result.detected, true);
  assert.equal(result.pressureLevel, "critical");
  assert.equal(result.count, 3);
  assert.equal(result.alertLevel, "critical");
  assert.equal(result.recommendedRoute, "route_to_layer02_source_freshness_review");
  assert.equal(result.requiresSourceFreshnessReview, true);
});

test("FinanceSourceFreshnessPressureMonitor detects Layer 02 source authority regression target", () => {
  const monitor = buildMonitor();

  const result = monitor.monitor({
    events: [
      {
        id: "evt-1",
        regressionTargets: [
          {
            layer: "layer02_source_authority",
            matched: ["outdated source"]
          }
        ]
      }
    ]
  });

  assert.equal(result.detected, true);
  assert.equal(result.pressureLevel, "watch");
  assert.equal(result.count, 1);
  assert.deepEqual(result.matchedEventIds, ["evt-1"]);
});
