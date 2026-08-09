"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  CORE_AUTHORITIES,
  CANONICAL_METACOGNITION_ROOT,
  CANONICAL_METACOGNITION_FILES,
  COGNITIVE_SUPERVISION_INTEGRATION_TEST,
  abs,
  loadExact,
  assertCommonJsApi,
  assertCanonicalMetacognitionTree,
  assertSupervisorUsesCanonicalMetacognitionPath
} = require("./_round6_common.js");

const LAYER_27_TESTS = Object.freeze([
  "tests/marion/marionStrategicPlanner.test.js",
  "tests/marion/marionPriorityArbitrator.test.js",
  "tests/marion/marionLayer27Integration.test.js"
]);

const LAYER_28_TESTS = Object.freeze([
  "tests/marion/marionReasoningAuditor.test.js",
  "tests/marion/marionQualityCalibrator.test.js",
  "tests/marion/marionLayer28Integration.test.js",
  "tests/marion/marionLayers27_28Regression.test.js",
  COGNITIVE_SUPERVISION_INTEGRATION_TEST
]);

test(
  "Round 6.2 canonical Marion runtime authorities resolve without path drift",
  () => {
    for (const relativePath of CORE_AUTHORITIES) {
      const api =
        loadExact(relativePath);

      assertCommonJsApi(
        api,
        relativePath
      );
    }
  }
);

test(
  "Round 6.2 Layer 27 and Layer 28 certification files remain in canonical tests/marion paths",
  () => {
    const required = [
      ...LAYER_27_TESTS,
      ...LAYER_28_TESTS
    ];

    const missing =
      required.filter(
        (relativePath) =>
          !fs.existsSync(
            abs(relativePath)
          )
      );

    assert.deepStrictEqual(
      missing,
      [],
      `Canonical Layer 27/28 certification files are missing: ${missing.join(", ")}`
    );
  }
);


test(
  "Round 6.2 Layer 28 metacognition resolves only from canonical runtime/metacognition",
  () => {
    const files =
      assertCanonicalMetacognitionTree();

    assert.equal(
      CANONICAL_METACOGNITION_ROOT,
      "Data/marion/runtime/metacognition"
    );

    assert.deepEqual(
      files,
      [...CANONICAL_METACOGNITION_FILES]
    );

    assert.equal(
      files.length,
      13,
      "Canonical Layer 28 metacognition inventory must contain exactly 13 modules."
    );

    assert.equal(
      assertSupervisorUsesCanonicalMetacognitionPath(),
      true
    );
  }
);
