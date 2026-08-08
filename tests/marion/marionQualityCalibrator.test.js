"use strict";

/**
 * tests/marion/marionQualityCalibrator.test.js
 *
 * Layer 28 quality-calibrator certification.
 *
 * CANONICAL TEST PATH:
 * tests/marion/marionQualityCalibrator.test.js
 *
 * Baseline-freeze path policy:
 * preferred: Data/marion/runtime/supervision/metacognition/
 * fallback:  Data/marion/runtime/metacognition/
 * No runtime-root or src/marion compatibility locations are accepted.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");
const MAX_OUTPUT_BYTES = 20000;
const TEST_RELATIVE = path.join(
  "tests",
  "marion",
  "marionQualityCalibrator.test.js"
);
const RUNTIME_NAME = "marionQualityCalibrator.js";

const RUNTIME_CANDIDATES = Object.freeze([
  path.join(
    BACKEND_ROOT,
    "Data",
    "marion",
    "runtime",
    "supervision",
    "metacognition",
    RUNTIME_NAME
  ),
  path.join(
    BACKEND_ROOT,
    "Data",
    "marion",
    "runtime",
    "metacognition",
    RUNTIME_NAME
  )
]);

const CALLABLE_EXPORTS = Object.freeze([
  "calibrate",
  "score",
  "evaluate",
  "run"
]);

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function deepClone(value) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function loadRuntime() {
  const attempted = [];

  for (const candidate of RUNTIME_CANDIDATES) {
    attempted.push(candidate);

    if (!fs.existsSync(candidate)) {
      continue;
    }

    let resolved;

    try {
      resolved = require.resolve(candidate);
    } catch (error) {
      throw new Error(
        [
          "Layer 28 quality-calibrator runtime exists but could not be resolved.",
          `Candidate: ${candidate}`,
          `Cause: ${error && error.message ? error.message : error}`
        ].join("\n"),
        { cause: error }
      );
    }

    try {
      return require(resolved);
    } catch (error) {
      /*
       * The selected module exists. Do not hide a transitive
       * MODULE_NOT_FOUND as though the calibrator itself were absent.
       */
      throw new Error(
        [
          "Layer 28 quality-calibrator runtime failed during module loading.",
          `Resolved: ${resolved}`,
          `Cause: ${error && error.message ? error.message : error}`
        ].join("\n"),
        { cause: error }
      );
    }
  }

  throw new Error(
    [
      "Missing Layer 28 runtime module marionQualityCalibrator.js.",
      "Attempted:",
      ...attempted.map((candidate) => `- ${candidate}`)
    ].join("\n")
  );
}

function callable(api) {
  if (typeof api === "function") {
    return api;
  }

  for (const name of CALLABLE_EXPORTS) {
    const descriptor =
      api &&
      Object.getOwnPropertyDescriptor(api, name);

    if (
      descriptor &&
      typeof descriptor.value === "function"
    ) {
      return descriptor.value.bind(api);
    }
  }

  throw new TypeError(
    `Quality calibrator has no supported callable export: ${CALLABLE_EXPORTS.join(", ")}`
  );
}

function numberInRange(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function assertNonAuthoritative(out) {
  assert.ok(
    isObject(out),
    "Quality calibrator must return a non-array object."
  );

  assert.notEqual(
    out.executionAuthorized,
    true,
    "Quality calibration must never authorize execution."
  );

  assert.notEqual(
    out.automaticExecutionAllowed,
    true,
    "Quality calibration must never enable automatic execution."
  );

  assert.notEqual(
    out.replaceComposer,
    true,
    "Quality calibration must not replace the response composer."
  );

  assert.notEqual(
    out.replaceReplyAuthority,
    true,
    "Quality calibration must not replace Marion reply authority."
  );
}

function assertBounded(out) {
  let serialized;

  assert.doesNotThrow(
    () => {
      serialized = JSON.stringify(out);
    },
    "Quality-calibrator output must be JSON-serializable."
  );

  assert.ok(
    Buffer.byteLength(serialized, "utf8") < MAX_OUTPUT_BYTES,
    "Quality-calibrator output must remain below 20,000 UTF-8 bytes."
  );

  return serialized;
}

test(
  "Layer 28 quality calibrator remains in the canonical Marion test folder",
  () => {
    const actual =
      path.normalize(
        path.relative(
          BACKEND_ROOT,
          __filename
        )
      );

    assert.equal(
      actual.toLowerCase(),
      path.normalize(TEST_RELATIVE).toLowerCase(),
      [
        "Quality-calibrator test pathway drifted.",
        `Expected: ${TEST_RELATIVE}`,
        `Actual: ${actual}`
      ].join("\n")
    );
  }
);

test(
  "Layer 28 quality calibrator resolves from a bounded known runtime location",
  () => {
    assert.ok(
      RUNTIME_CANDIDATES.some(
        (candidate) =>
          fs.existsSync(candidate)
      ),
      [
        "No known quality-calibrator runtime exists.",
        ...RUNTIME_CANDIDATES.map(
          (candidate) =>
            `- ${candidate}`
        )
      ].join("\n")
    );

    const api =
      loadRuntime();

    assert.ok(
      api &&
      (
        typeof api === "function" ||
        typeof api === "object"
      ),
      "Quality-calibrator runtime did not load as a CommonJS API."
    );
  }
);

test(
  "Layer 28 quality calibrator emits normalized bounded quality dimensions",
  async () => {
    const api =
      loadRuntime();

    const calibrate =
      callable(api);

    const input = {
      prompt:
        "Send the six dedicated tests first.",
      reply:
        "The six dedicated tests are included. The runtime modules are deferred.",
      evidenceCoverage:
        1,
      constraints: {
        concise:
          true,
        preserveCurrentTurnAuthority:
          true
      }
    };

    const snapshot =
      deepClone(input);

    const out =
      await Promise.resolve(
        calibrate(input)
      );

    assertNonAuthoritative(out);

    const scores =
      out.scores ||
      out.quality ||
      out.dimensions;

    assert.ok(
      isObject(scores),
      "Quality calibrator must expose a score/dimension object."
    );

    for (
      const key
      of [
        "clarity",
        "specificity",
        "completeness"
      ]
    ) {
      assert.ok(
        numberInRange(scores[key]),
        `${key} must be normalized from 0 to 1`
      );
    }

    if (
      scores.confidence !== undefined
    ) {
      assert.ok(
        numberInRange(
          scores.confidence
        ),
        "confidence must be normalized from 0 to 1"
      );
    }

    assert.deepEqual(
      input,
      snapshot,
      "Quality calibration must not mutate its input."
    );

    assertBounded(out);
  }
);

test(
  "Layer 28 quality calibrator flags leaked diagnostics and recursive self-commentary",
  async () => {
    const api =
      loadRuntime();

    const calibrate =
      callable(api);

    const out =
      await Promise.resolve(
        calibrate({
          prompt:
            "Give the result.",
          reply:
            "TypeError at marionMetaReasoner.js:44. I am reflecting on my reflection and will now reflect again.",
          noUserFacingDiagnostics:
            true
        })
      );

    assertNonAuthoritative(out);

    const text =
      assertBounded(out);

    assert.match(
      text,
      /diagnostic|stack|recursive|reflection|quality/i,
      "Quality calibrator did not expose a diagnostic/recursion quality signal."
    );

    assert.notEqual(
      out.approved,
      true,
      "A reply containing leaked diagnostics and recursive self-commentary must not be approved."
    );
  }
);
