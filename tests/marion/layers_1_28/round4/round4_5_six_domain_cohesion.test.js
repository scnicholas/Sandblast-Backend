"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  SIX_DOMAINS,
  abs,
  loadExact,
  assertCommonJsApi,
  assertSourceHasDomains,
  byteLength
} = require("./_round4_common.js");

test(
  "Round 4.5 all six domains coexist with Layers 27 and 28 certification",
  () => {
    assertSourceHasDomains(
      "Data/marion/runtime/marionDomainRegistry.js",
      SIX_DOMAINS
    );

    const requiredTests = [
      "tests/marion/marionStrategicPlanner.test.js",
      "tests/marion/marionPriorityArbitrator.test.js",
      "tests/marion/marionLayer27Integration.test.js",
      "tests/marion/marionReasoningAuditor.test.js",
      "tests/marion/marionQualityCalibrator.test.js",
      "tests/marion/marionLayer28Integration.test.js",
      "tests/marion/marionLayers27_28Regression.test.js"
    ];

    const missing =
      requiredTests.filter(
        (file) =>
          !fs.existsSync(
            abs(file)
          )
      );

    assert.deepStrictEqual(
      missing,
      [],
      `Round 4.5 prerequisite certification files are missing: ${missing.join(", ")}`
    );
  }
);

test(
  "Round 4.5 cognitive supervision remains non-authoritative at Layer 28",
  () => {
    const supervisor =
      loadExact(
        "Data/marion/runtime/supervision/marionCognitiveSupervisor.js"
      );

    assertCommonJsApi(
      supervisor,
      "Marion Cognitive Supervisor"
    );

    assert.equal(
      Number(
        supervisor.HARD_STOP_LAYER
      ),
      28,
      "Cognitive Supervisor hard stop must remain Layer 28."
    );

    if (
      typeof supervisor.getStatus ===
      "function"
    ) {
      const status =
        supervisor.getStatus();

      assert.equal(
        Number(
          status.hardStopLayer
        ),
        28
      );

      assert.notEqual(
        status.executionAuthorized,
        true
      );

      assert.ok(
        byteLength(status) <
        50000
      );
    }
  }
);
