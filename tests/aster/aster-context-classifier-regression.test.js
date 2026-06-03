"use strict";

/**
 * Jest-compatible Aster regression/smoke test.
 * Maintenance: converted from raw Node assert runner to Jest test wrapper.
 * Authority rule: Aster remains observational/advisory; Marion remains final authority.
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


const Classifier = requireRuntimeModule("AsterContextClassifier.js");

const classifyContext = getFunction(Classifier, [
  "classifyAsterContext",
  "classifyEnvironmentContext",
  "classifyContext",
  "classify",
  "run",
  "default"
]);

describe("AsterContextClassifier regression", () => {
  test("classifies environmental weather context without final answer authority", () => {
    const result = classifyContext({
      sensorType: "weather",
      normalized: {
        temperatureC: 34,
        humidityPercent: 78,
        airQualityIndex: 91,
        windKph: 22
      },
      location: "test-zone",
      source: "manual-regression"
    });

    assert.ok(result, "Classifier should return a result object");
    assert.strictEqual(typeof result, "object", "Classifier result should be object-shaped");

    const serialized = JSON.stringify(result).toLowerCase();

    assert.ok(
      serialized.includes("environment") ||
        serialized.includes("weather") ||
        serialized.includes("air") ||
        serialized.includes("climate") ||
        serialized.includes("context"),
      "Classifier should identify an environmental/weather/air/climate context"
    );

    assert.notStrictEqual(
      result.finalAnswerAuthorized,
      true,
      "Context classifier must not authorize final public answers"
    );

    assert.notStrictEqual(
      result.marionAuthorityRequired,
      false,
      "Context classifier should preserve Marion authority requirement"
    );
  });

  test("falls closed for unknown context", () => {
    const unknown = classifyContext({
      sensorType: "unknown-sensor",
      normalized: {},
      source: "unknown-context-regression"
    });

    assert.ok(unknown, "Unknown context should fail closed into a result object");
    assert.strictEqual(typeof unknown, "object", "Unknown context result should be object-shaped");

    const unknownText = JSON.stringify(unknown).toLowerCase();

    assert.ok(
      unknownText.includes("unknown") ||
        unknownText.includes("general") ||
        unknownText.includes("fallback") ||
        unknownText.includes("context"),
      "Unknown context should include unknown/general/fallback/context metadata"
    );
  });
});
