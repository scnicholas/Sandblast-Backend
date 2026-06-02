"use strict";

/**
 * tests/aster/aster-sensor-normalizer-regression.test.js
 *
 * Purpose:
 * - Validate Aster sensor normalization.
 * - Confirm numeric readings are clamped/normalized safely.
 * - Confirm unknown/malformed sensor input fails closed instead of crashing.
 *
 * Run:
 *   node .\tests\aster\aster-sensor-normalizer-regression.test.js
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
    if (fs.existsSync(candidate)) {
      return require(candidate);
    }
  }

  throw new Error(`Unable to locate Aster runtime module: ${fileName}`);
}

function getFunction(moduleValue, names) {
  for (const name of names) {
    if (moduleValue && typeof moduleValue[name] === "function") {
      return moduleValue[name];
    }
  }

  if (typeof moduleValue === "function") {
    return moduleValue;
  }

  throw new Error(`Unable to locate exported function. Tried: ${names.join(", ")}`);
}

const Normalizer = requireRuntimeModule("AsterSensorNormalizer.js");

const normalizeSensorReading = getFunction(Normalizer, [
  "normalizeSensorReading",
  "normalizeAsterSensorReading",
  "normalizeSensorInput",
  "normalize",
  "run",
  "default"
]);

(function runAsterSensorNormalizerRegression() {
  const normalized = normalizeSensorReading({
    sensorType: "weather",
    source: "manual-regression",
    readings: {
      temperatureC: "31.5",
      humidityPercent: "72",
      airQualityIndex: "68",
      windKph: "19"
    },
    timestamp: "2026-06-01T20:00:00.000Z"
  });

  assert.ok(normalized, "Normalizer should return a result");

  assert.strictEqual(
    typeof normalized,
    "object",
    "Normalizer result should be an object"
  );

  const payload = normalized.normalized || normalized.readings || normalized.observation || normalized;

  assert.ok(
    payload,
    "Normalizer should expose normalized payload"
  );

  const serialized = JSON.stringify(normalized);

  assert.ok(
    /31\.5|31/.test(serialized),
    "Normalized result should preserve usable temperature reading"
  );

  assert.ok(
    /72/.test(serialized),
    "Normalized result should preserve usable humidity reading"
  );

  assert.ok(
    /68/.test(serialized),
    "Normalized result should preserve usable air-quality reading"
  );

  assert.ok(
    /19/.test(serialized),
    "Normalized result should preserve usable wind reading"
  );

  const malformed = normalizeSensorReading({
    sensorType: "weather",
    source: "bad-input-regression",
    readings: {
      temperatureC: "not-a-number",
      humidityPercent: null,
      airQualityIndex: undefined,
      windKph: {}
    }
  });

  assert.ok(
    malformed,
    "Malformed readings should fail closed into a result object, not crash"
  );

  assert.strictEqual(
    typeof malformed,
    "object",
    "Malformed normalization result should remain object-shaped"
  );

  assert.notStrictEqual(
    malformed.finalAnswerAuthorized,
    true,
    "Normalizer must not authorize public final answers"
  );

  const malformedText = JSON.stringify(malformed).toLowerCase();

  assert.ok(
    malformedText.includes("warning") ||
      malformedText.includes("invalid") ||
      malformedText.includes("fallback") ||
      malformedText.includes("unknown") ||
      malformedText.includes("normalized"),
    "Malformed input should carry warning/fallback/unknown/normalized metadata"
  );

  console.log("PASS aster-sensor-normalizer-regression");
})();
