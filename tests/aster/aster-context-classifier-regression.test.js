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


const Classifier = requireRuntimeModule("AsterContextClassifier.js");
const classifyContext = getFunction(Classifier, [
  "classifyAsterContext", "classifyEnvironmentContext", "classifyContext", "classify", "run", "default"
]);

describe("AsterContextClassifier regression", () => {
  it("classifies environmental weather context without final answer authority", () => {
    const result = classifyContext({
      sensorType: "weather",
      normalized: { temperatureC: 34, humidityPercent: 78, airQualityIndex: 91, windKph: 22 },
      location: "test-zone",
      source: "manual-regression"
    });
    assert.equal(result.gateway, "Aster");
    assert.equal(result.sensorType, "weather");
    assert.ok(result.context.includes("environment.weather"));
    assertAsterAuthority(result, "Classifier result");
  });

  it("falls closed for unknown context", () => {
    const unknown = classifyContext({ sensorType: "unknown-sensor", normalized: {}, source: "unknown-context-regression" });
    assert.ok(unknown);
    assert.equal(typeof unknown, "object");
    assertAsterAuthority(unknown, "Unknown classifier result");
    const text = stringifyLower(unknown);
    assert.ok(text.includes("unknown") || text.includes("general") || text.includes("fallback") || text.includes("context"));
  });

  it("prioritizes heat context for high temperature weather readings", () => {
    const result = classifyContext({ sensorType: "weather", normalized: { temperatureC: 35, humidityPercent: 60, windKph: 5 } });
    assert.equal(result.context, "environment.weather.heat");
    assert.ok(result.tags.includes("heat"));
    assertAsterAuthority(result, "Heat classifier result");
  });
});
