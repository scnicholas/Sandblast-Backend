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


const Envelope = requireRuntimeModule("AsterObservationEnvelope.js");
const createEnvelope = getFunction(Envelope, [
  "createAsterObservationEnvelope", "buildAsterObservationEnvelope", "createObservationEnvelope",
  "buildObservationEnvelope", "envelopeObservation", "run", "default"
]);

describe("AsterObservationEnvelope smoke", () => {
  it("creates observation envelope with gateway linkage and Marion authority requirement", () => {
    const result = createEnvelope({
      source: "observation-envelope-smoke",
      observation: {
        sensorType: "weather",
        normalized: { temperatureC: 29, humidityPercent: 64, airQualityIndex: 55, windKph: 12 },
        context: "environment.weather.general",
        risk: { level: "low", tags: ["stable", "watch"] }
      },
      metadata: { gateway: "Aster", linkedGateway: "LingoLink", project: "Sandblast" }
    });
    assert.equal(result.gateway, "Aster");
    assert.equal(result.envelope.gateway, "Aster");
    assert.equal(result.envelope.authority.finalAnswerAuthorized, false);
    assert.equal(result.envelope.authority.marionAuthorityRequired, true);
    assert.ok(result.envelope.linkedGateways.includes("LingoLink"));
    assertAsterAuthority(result, "Observation envelope result");
  });

  it("falls closed with unknown envelope when observation is empty", () => {
    const result = createEnvelope({});
    assert.equal(result.context, "environment.unknown");
    assert.ok(result.warnings.includes("unknown-sensor-type"));
    assert.ok(result.warnings.includes("no-observation-readings"));
    assertAsterAuthority(result, "Empty observation envelope");
  });
});
