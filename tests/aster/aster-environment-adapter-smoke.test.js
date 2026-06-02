"use strict";

/**
 * tests/aster/aster-environment-adapter-smoke.test.js
 *
 * Purpose:
 * - Smoke test Aster environmental adapter boundary.
 * - Confirm Aster stays observational, not final authority.
 * - Confirm adapter emits normalized observation metadata safely.
 *
 * Run:
 *   node .\tests\aster\aster-environment-adapter-smoke.test.js
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");

function requireRuntimeModule(fileName) {
  const root = path.resolve(__dirname, "..", "..");

  const candidates = [
    path.join(root, "Data", "marion", "runtime", "aster", fileName),
    path.join(root, "Data", "marion", "runtime", fileName),
    path.join(root, "Data", "marion", "runtime", "Aster", fileName),
    path.join(root, "aster", fileName),
    path.join(root, fileName)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return require(candidate);
  }

  throw new Error(`Unable to locate Aster runtime module: ${fileName}`);
}

function getFunction(moduleValue, names) {
  for (const name of names) {
    if (moduleValue && typeof moduleValue[name] === "function") {
      return moduleValue[name];
    }
  }

  if (typeof moduleValue === "function") return moduleValue;

  throw new Error(`Unable to locate exported function. Tried: ${names.join(", ")}`);
}

const Adapter = requireRuntimeModule("AsterEnvironmentAdapter.js");

const runAdapter = getFunction(Adapter, [
  "runAsterEnvironmentAdapter",
  "adaptEnvironmentObservation",
  "createEnvironmentObservation",
  "observeEnvironment",
  "run",
  "default"
]);

(function runAsterEnvironmentAdapterSmoke() {
  const result = runAdapter({
    source: "manual-smoke",
    sensorType: "weather",
    location: "test-zone",
    readings: {
      temperatureC: 31,
      humidityPercent: 72,
      airQualityIndex: 68,
      windKph: 19
    },
    context: {
      userFacing: false,
      project: "Aster",
      gateway: "LingoLink"
    }
  });

  assert.ok(result, "Adapter should return a result object");
  assert.strictEqual(typeof result, "object", "Adapter result should be an object");

  assert.notStrictEqual(
    result.finalAnswerAuthorized,
    true,
    "Aster adapter must not authorize final public answers"
  );

  assert.notStrictEqual(
    result.marionAuthorityRequired,
    false,
    "Aster adapter should require Marion authority before public final output"
  );

  assert.ok(
    result.observation || result.normalized || result.envelope || result.aster,
    "Adapter should expose observation, normalized, envelope, or aster payload"
  );

  const serialized = JSON.stringify(result).toLowerCase();

  assert.ok(
    serialized.includes("aster"),
    "Adapter result should include Aster identity metadata"
  );

  assert.ok(
    !serialized.includes("marion_final_authority") ||
      serialized.includes("marionauthorityrequired"),
    "Adapter should not pretend to be Marion final authority"
  );

  console.log("PASS aster-environment-adapter-smoke");
})();
