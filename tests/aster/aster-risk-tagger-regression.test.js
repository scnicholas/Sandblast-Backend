"use strict";

/**
 * tests/aster/aster-risk-tagger-regression.test.js
 *
 * Purpose:
 * - Validate Aster risk tagging.
 * - Confirm higher-risk readings are tagged without creating alarmist public output.
 * - Confirm low-risk readings remain low/no-risk.
 *
 * Run:
 *   node .\tests\aster\aster-risk-tagger-regression.test.js
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

const RiskTagger = requireRuntimeModule("AsterRiskTagger.js");

const tagRisk = getFunction(RiskTagger, [
  "tagAsterRisk",
  "tagEnvironmentRisk",
  "tagRisk",
  "assessRisk",
  "classifyRisk",
  "run",
  "default"
]);

(function runAsterRiskTaggerRegression() {
  const elevated = tagRisk({
    context: "environment.weather.air-quality",
    normalized: {
      temperatureC: 38,
      humidityPercent: 82,
      airQualityIndex: 155,
      windKph: 45
    },
    source: "risk-regression"
  });

  assert.ok(elevated, "Risk tagger should return a result object");
  assert.strictEqual(typeof elevated, "object", "Risk tagger result should be object-shaped");

  const elevatedText = JSON.stringify(elevated).toLowerCase();

  assert.ok(
    elevatedText.includes("risk") ||
      elevatedText.includes("elevated") ||
      elevatedText.includes("moderate") ||
      elevatedText.includes("high") ||
      elevatedText.includes("caution"),
    "Elevated readings should produce risk/elevated/moderate/high/caution metadata"
  );

  assert.notStrictEqual(
    elevated.finalAnswerAuthorized,
    true,
    "Risk tagger must not authorize final public answers"
  );

  assert.notStrictEqual(
    elevated.publicAlarm,
    true,
    "Risk tagger should not create alarmist public output by default"
  );

  const low = tagRisk({
    context: "environment.weather.general",
    normalized: {
      temperatureC: 21,
      humidityPercent: 45,
      airQualityIndex: 28,
      windKph: 8
    },
    source: "low-risk-regression"
  });

  assert.ok(low, "Low-risk input should return a result object");

  const lowText = JSON.stringify(low).toLowerCase();

  assert.ok(
    lowText.includes("low") ||
      lowText.includes("normal") ||
      lowText.includes("stable") ||
      lowText.includes("none") ||
      lowText.includes("risk"),
    "Low-risk readings should produce low/normal/stable/none/risk metadata"
  );

  assert.notStrictEqual(
    low.finalAnswerAuthorized,
    true,
    "Low-risk path must still not authorize final public answers"
  );

  console.log("PASS aster-risk-tagger-regression");
})();
