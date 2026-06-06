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


const {
  buildAsterMarionEscalationBridge,
  ASTER_MARION_ESCALATION_BRIDGE_VERSION
} = requireRuntimeModule("AsterMarionEscalationBridge.js");

describe("AsterMarionEscalationBridge", () => {
  it("builds Marion-authorized escalation packet for high-risk real-world context", () => {
    const packet = buildAsterMarionEscalationBridge({
      envelope: { riskLevel: "high", requiresHumanReview: true, observationSummary: "smoke indoors" }
    });
    assert.equal(packet.version, ASTER_MARION_ESCALATION_BRIDGE_VERSION);
    assert.equal(packet.active, true);
    assert.equal(packet.lane, "real_world");
    assert.equal(packet.source, "AsterMarionEscalationBridge");
    assert.equal(packet.riskLevel, "high");
    assert.equal(packet.requiresHumanReview, true);
    assert.equal(packet.escalationRecommended, true);
    assert.equal(packet.advisoryOnly, true);
    assert.equal(packet.finalAuthority, "Marion");
    assertAsterAuthority(packet, "High-risk escalation packet");
  });

  it("keeps low-risk context advisory-only without forcing escalation", () => {
    const packet = buildAsterMarionEscalationBridge({
      envelope: { riskLevel: "low", requiresHumanReview: false, observationSummary: "clear environment" }
    });
    assert.equal(packet.active, true);
    assert.equal(packet.riskLevel, "low");
    assert.equal(packet.requiresHumanReview, false);
    assert.equal(packet.escalationRecommended, false);
    assert.equal(packet.advisoryOnly, true);
    assert.equal(packet.finalAuthority, "Marion");
    assertAsterAuthority(packet, "Low-risk escalation packet");
  });

  it("normalizes moderate/elevated risk lanes without becoming public output", () => {
    const moderate = buildAsterMarionEscalationBridge({ envelope: { riskLevel: "moderate" } });
    const elevated = buildAsterMarionEscalationBridge({ envelope: { riskLevel: "elevated" } });
    assert.equal(moderate.requiresHumanReview, false);
    assert.equal(moderate.escalationRecommended, false);
    assert.equal(elevated.requiresHumanReview, true);
    assert.equal(elevated.escalationRecommended, true);
    assertAsterAuthority(moderate, "Moderate escalation packet");
    assertAsterAuthority(elevated, "Elevated escalation packet");
  });
});
