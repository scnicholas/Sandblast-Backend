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


const Adapter = requireRuntimeModule("AsterEnvironmentAdapter.js");
const runAdapter = getFunction(Adapter, [
  "runAsterEnvironmentAdapter", "adaptEnvironmentObservation", "createEnvironmentObservation",
  "observeEnvironment", "run", "default"
]);

describe("AsterEnvironmentAdapter smoke", () => {
  it("emits normalized observation metadata while preserving Marion authority", () => {
    const result = runAdapter({
      source: "manual-smoke",
      sensorType: "weather",
      location: "test-zone",
      readings: { temperatureC: 31, humidityPercent: 72, airQualityIndex: 68, windKph: 19 },
      context: { userFacing: false, project: "Aster", gateway: "LingoLink" }
    });
    assert.equal(result.gateway, "Aster");
    assert.ok(result.observation || result.normalized || result.envelope || result.aster);
    assert.equal(result.pipeline.normalizer, true);
    assert.equal(result.pipeline.contextClassifier, true);
    assert.equal(result.pipeline.riskTagger, true);
    assert.equal(result.pipeline.observationEnvelope, true);
    assertAsterAuthority(result, "Adapter result");
    const text = stringifyLower(result);
    assert.ok(text.includes("aster"));
    assert.ok(!text.includes("marion_final_authority") || text.includes("marionauthorityrequired"));
  });

  it("fails closed for empty input without public-facing leakage", () => {
    const result = runAdapter({});
    assert.equal(result.gateway, "Aster");
    assertAsterAuthority(result, "Empty adapter result");
  });
});
