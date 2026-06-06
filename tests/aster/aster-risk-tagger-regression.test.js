"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const { describe, it } = test;

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
    if (moduleValue && typeof moduleValue[name] === "function") return moduleValue[name];
  }
  if (typeof moduleValue === "function") return moduleValue;
  throw new Error(`Unable to locate exported function. Tried: ${names.join(", ")}`);
}

function assertAsterAuthority(value, label = "Aster packet") {
  assert.ok(value, `${label} should exist`);
  assert.equal(value.finalAnswerAuthorized, false, `${label} must not authorize final public answers`);
  assert.notEqual(value.marionAuthorityRequired, false, `${label} must preserve Marion authority`);
  assert.notEqual(value.publicReplyVisible, true, `${label} must not expose public reply visibility`);
  assert.notEqual(value.userFacing, true, `${label} must not mark itself user-facing`);
  if (Object.prototype.hasOwnProperty.call(value, "publicText")) assert.equal(value.publicText || "", "");
  if (Object.prototype.hasOwnProperty.call(value, "renderText")) assert.equal(value.renderText || "", "");
  if (Object.prototype.hasOwnProperty.call(value, "text")) assert.equal(value.text || "", "");
}

function stringifyLower(value) {
  return JSON.stringify(value || {}).toLowerCase();
}


const RiskTagger = requireRuntimeModule("AsterRiskTagger.js");
const tagRisk = getFunction(RiskTagger, [
  "tagAsterRisk", "tagEnvironmentRisk", "tagRisk", "assessRisk", "classifyRisk", "run", "default"
]);

describe("AsterRiskTagger regression", () => {
  it("tags elevated readings without alarmist public output", () => {
    const elevated = tagRisk({
      context: "environment.weather.air-quality",
      normalized: { temperatureC: 38, humidityPercent: 82, airQualityIndex: 155, windKph: 45 },
      source: "risk-regression"
    });
    assert.equal(elevated.gateway, "Aster");
    assert.ok(["moderate", "elevated", "high"].includes(elevated.riskLevel));
    assert.notEqual(elevated.publicAlarm, true);
    assertAsterAuthority(elevated, "Elevated risk result");
  });

  it("keeps low-risk readings low or stable while advisory-only", () => {
    const low = tagRisk({
      context: "environment.weather.general",
      normalized: { temperatureC: 21, humidityPercent: 45, airQualityIndex: 28, windKph: 8 },
      source: "low-risk-regression"
    });
    assert.ok(["none", "low"].includes(low.riskLevel));
    assertAsterAuthority(low, "Low-risk result");
    const text = stringifyLower(low);
    assert.ok(text.includes("low") || text.includes("normal") || text.includes("stable") || text.includes("none") || text.includes("risk"));
  });

  it("returns unknown risk when no supported metrics are present", () => {
    const result = tagRisk({ context: "environment.unknown", normalized: { unsupportedMetric: 123 } });
    assert.equal(result.riskLevel, "unknown");
    assert.ok(result.warnings.includes("no-supported-risk-metrics-found"));
    assertAsterAuthority(result, "Unknown risk result");
  });
});
