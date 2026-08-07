"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  CORE_AUTHORITIES,
  abs,
  loadExact,
  assertCommonJsApi
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
  "tests/marion/marionLayers27_28Regression.test.js"
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
