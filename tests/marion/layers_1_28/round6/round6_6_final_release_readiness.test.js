"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  abs,
  readJson,
  loadExact,
  byteLength,
  CANONICAL_METACOGNITION_ROOT,
  PHASE_A_HARD_STOP_LAYER,
  CONVERSATION_HARD_STOP_LAYER,
  GLOBAL_HARD_STOP_LAYER,
  COGNITIVE_SUPERVISION_INTEGRATION_TEST,
  assertCanonicalMetacognitionTree,
  assertSupervisorUsesCanonicalMetacognitionPath
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
  "tests/marion/marionLayers27_28Regression.test.js",
  COGNITIVE_SUPERVISION_INTEGRATION_TEST
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
      GLOBAL_HARD_STOP_LAYER,
      "Round 6 must preserve the global Layer 28 hard stop."
    );

    assert.equal(
      manifest.phaseAHardStopLayer,
      PHASE_A_HARD_STOP_LAYER,
      "Round 6 manifest lost the Phase A Layer 24 boundary."
    );

    assert.equal(
      manifest.conversationArchitectureHardStopLayer,
      CONVERSATION_HARD_STOP_LAYER,
      "Round 6 manifest lost the Phase B/conversation Layer 26 boundary."
    );

    assert.equal(
      manifest.layer29Present,
      false,
      "Round 6 must explicitly reject Layer 29."
    );

    assert.equal(
      manifest.automaticExecutionAllowed,
      false,
      "Round 6 must not enable automatic execution."
    );

    assert.equal(
      manifest.replyAuthorityPreserved,
      true,
      "Round 6 must preserve established reply authority."
    );

    assert.equal(
      manifest.canonicalPaths &&
      manifest.canonicalPaths.layer28Metacognition,
      CANONICAL_METACOGNITION_ROOT,
      "Round 6 manifest Layer 28 metacognition path drifted."
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


test(
  "Round 6.6 canonical metacognition and Cognitive Supervisor path remain freeze-ready",
  () => {
    const files =
      assertCanonicalMetacognitionTree();

    assert.equal(
      files.length,
      13
    );

    assert.equal(
      assertSupervisorUsesCanonicalMetacognitionPath(),
      true
    );
  }
);
