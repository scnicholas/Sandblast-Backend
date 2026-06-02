"use strict";

/**
 * tests/aster/aster-observation-envelope-smoke.test.js
 *
 * Purpose:
 * - Validate Aster observation envelope creation.
 * - Confirm envelope carries observation metadata safely.
 * - Confirm Aster remains below Marion final-answer authority.
 *
 * Run:
 *   node .\tests\aster\aster-observation-envelope-smoke.test.js
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

const Envelope = requireRuntimeModule("AsterObservationEnvelope.js");

const createEnvelope = getFunction(Envelope, [
  "createAsterObservationEnvelope",
  "buildAsterObservationEnvelope",
  "createObservationEnvelope",
  "buildObservationEnvelope",
  "envelopeObservation",
  "run",
  "default"
]);

(function runAsterObservationEnvelopeSmoke() {
  const result = createEnvelope({
    source: "observation-envelope-smoke",
    observation: {
      sensorType: "weather",
      normalized: {
        temperatureC: 29,
        humidityPercent: 64,
        airQualityIndex: 55,
        windKph: 12
      },
      context: "environment.weather.general",
      risk: {
        level: "low",
        tags: ["stable", "watch"]
      }
    },
    metadata: {
      gateway: "Aster",
      linkedGateway: "LingoLink",
      project: "Sandblast"
    }
  });

  assert.ok(result, "Observation envelope should return a result object");
  assert.strictEqual(typeof result, "object", "Observation envelope result should be object-shaped");

  const serialized = JSON.stringify(result).toLowerCase();

  assert.ok(serialized.includes("aster"), "Envelope should include Aster gateway identity");

  assert.ok(
    serialized.includes("observation") ||
      serialized.includes("environment") ||
      serialized.includes("weather"),
    "Envelope should include observation/environment/weather metadata"
  );

  assert.notStrictEqual(
    result.finalAnswerAuthorized,
    true,
    "Aster observation envelope must not authorize final public answers"
  );

  assert.notStrictEqual(
    result.marionAuthorityRequired,
    false,
    "Aster observation envelope should preserve Marion authority requirement"
  );

  assert.ok(
    serialized.includes("lingolink") ||
      serialized.includes("linkedgateway") ||
      serialized.includes("gateway"),
    "Envelope should carry gateway linkage metadata for future LingoLink/Aster sequencing"
  );

  console.log("PASS aster-observation-envelope-smoke");
})();
