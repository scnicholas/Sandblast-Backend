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


const Normalizer = requireRuntimeModule("AsterSensorNormalizer.js");
const normalizeSensorReading = getFunction(Normalizer, [
  "normalizeSensorReading", "normalizeAsterSensorReading", "normalizeSensorInput", "normalize", "run", "default"
]);

describe("AsterSensorNormalizer regression", () => {
  it("normalizes numeric weather readings without public final authority", () => {
    const normalized = normalizeSensorReading({
      sensorType: "weather",
      source: "manual-regression",
      readings: { temperatureC: "31.5", humidityPercent: "72", airQualityIndex: "68", windKph: "19" },
      timestamp: "2026-06-01T20:00:00.000Z"
    });
    assert.equal(normalized.gateway, "Aster");
    assert.equal(normalized.sensorType, "weather");
    assert.equal(normalized.normalized.temperatureC, 31.5);
    assert.equal(normalized.normalized.humidityPercent, 72);
    assert.equal(normalized.normalized.airQualityIndex, 68);
    assert.equal(normalized.normalized.windKph, 19);
    assertAsterAuthority(normalized, "Normalizer result");
  });

  it("fails closed for malformed readings instead of crashing", () => {
    const malformed = normalizeSensorReading({
      sensorType: "weather",
      source: "bad-input-regression",
      readings: { temperatureC: "not-a-number", humidityPercent: null, airQualityIndex: undefined, windKph: {} }
    });
    assert.ok(malformed);
    assert.equal(typeof malformed, "object");
    assertAsterAuthority(malformed, "Malformed normalizer result");
    const text = stringifyLower(malformed);
    assert.ok(text.includes("warning") || text.includes("invalid") || text.includes("fallback") || text.includes("unknown") || text.includes("normalized"));
  });

  it("clamps out-of-range readings and preserves raw values", () => {
    const result = normalizeSensorReading({
      sensorType: "weather",
      readings: { temperatureC: 99, humidityPercent: 150, windKph: -5 }
    });
    assert.equal(result.normalized.temperatureC, 60);
    assert.equal(result.normalized.humidityPercent, 100);
    assert.equal(result.normalized.windKph, 0);
    assert.equal(result.raw.temperatureC, 99);
    assert.ok(result.warnings.includes("clamped-reading:temperatureC"));
    assertAsterAuthority(result, "Clamped normalizer result");
  });
});
