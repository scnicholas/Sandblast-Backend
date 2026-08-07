"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  abs,
  readJson,
  loadExact,
  byteLength
} = require("./_round6_common.js");

const REQUIRED_FINAL_PREREQUISITES = Object.freeze([
  "tests/marion/layers_1_28/round1/run_round1_certification.js",
  "tests/marion/layers_1_28/round2/run_round2_certification.js",
  "tests/marion/layers_1_28/round3/run_round3_certification.js",
  "tests/marion/layers_1_28/round4/run_round4_certification.js",
  "tests/marion/layers_1_28/round5/run_round5_certification.js",

  "tests/marion/marionStrategicPlanner.test.js",
  "tests/marion/marionPriorityArbitrator.test.js",
  "tests/marion/marionLayer27Integration.test.js",
  "tests/marion/marionReasoningAuditor.test.js",
  "tests/marion/marionQualityCalibrator.test.js",
  "tests/marion/marionLayer28Integration.test.js",
  "tests/marion/marionLayers27_28Regression.test.js"
]);

test(
  "Round 6.6 all prior certification prerequisites remain present",
  () => {
    const missing =
      REQUIRED_FINAL_PREREQUISITES.filter(
        (relativePath) =>
          !fs.existsSync(
            abs(relativePath)
          )
      );

    assert.deepEqual(
      missing,
      [],
      `Final certification prerequisites are missing: ${missing.join(", ")}`
    );
  }
);

test(
  "Round 6.6 final certification manifest preserves Layer 28 hard stop and complete stage inventory",
  () => {
    const manifest =
      readJson(
        "tests/marion/layers_1_28/round6/round6_certification_manifest.json"
      );

    assert.equal(
      manifest.round,
      6
    );

    assert.equal(
      manifest.finalConsolidation,
      true
    );

    assert.equal(
      manifest.hardStopLayer,
      28,
      "Round 6 must not introduce Layer 29."
    );

    assert.equal(
      manifest.prerequisite,
      "verify:marion-round5"
    );

    assert.equal(
      Array.isArray(manifest.tests)
        ? manifest.tests.length
        : 0,
      6,
      "Round 6 must contain six final-consolidation stages."
    );
  }
);

test(
  "Round 6.6 Cognitive Supervisor reports a non-authoritative Layer 28 terminal state",
  () => {
    const supervisor =
      loadExact(
        "Data/marion/runtime/supervision/marionCognitiveSupervisor.js"
      );

    assert.equal(
      Number(
        supervisor.HARD_STOP_LAYER
      ),
      28
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
