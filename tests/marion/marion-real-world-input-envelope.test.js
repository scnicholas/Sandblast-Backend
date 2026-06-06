"use strict";

/**
 * tests/marion/marion-real-world-input-envelope.test.js
 *
 * Purpose:
 * - Validate Marion's real-world input envelope.
 * - Confirm real-world interpretation remains advisory-only.
 * - Confirm Marion remains the final authority.
 * - Confirm public-facing output stays empty/internal-only.
 *
 * Node test runner compatible.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { describe, it } = test;

const {
  buildRealWorldInputEnvelope,
  summarizeRealWorldEnvelope,
  inferObservationType,
  containsSensitiveOrBlockedInference,
  normalizePermissionStatus,
  normalizeRiskLevel,
  REAL_WORLD_ENVELOPE_VERSION
} = require("../../Data/marion/runtime/MarionRealWorldInputEnvelope");

function assertAuthority(packet) {
  assert.ok(packet, "Envelope packet should exist");
  assert.ok(packet.authority, "Envelope packet should include authority metadata");
  assert.equal(packet.authority.finalAuthority, "Marion");
  assert.equal(packet.authority.realWorldAdvisoryOnly, true);
  assert.equal(packet.authority.neverOverrideMarion, true);
  assert.equal(packet.marionAuthority, true);
  assert.equal(packet.finalAuthority, "Marion");
}

function assertInternalOnly(packet) {
  assert.ok(packet, "Envelope packet should exist");

  /*
   * Some disabled or blocked packet paths may omit public-surface booleans.
   * Safety condition:
   * - public flags must never be true
   * - renderable/public text must remain empty
   */
  assert.notEqual(packet.userFacing, true);
  assert.notEqual(packet.publicReplyVisible, true);
  assert.equal(packet.publicText || "", "");
  assert.equal(packet.renderText || "", "");
  assert.equal(packet.text || "", "");
}

describe("Marion Real-World Input Envelope", () => {
  it("exports expected functions", () => {
    assert.equal(typeof buildRealWorldInputEnvelope, "function");
    assert.equal(typeof summarizeRealWorldEnvelope, "function");
    assert.equal(typeof inferObservationType, "function");
    assert.equal(typeof containsSensitiveOrBlockedInference, "function");
  });

  it("builds valid envelope for permitted burned grass observation", () => {
    const envelope = buildRealWorldInputEnvelope({
      observationType: "visual_environment",
      observationSummary: "Burned grass detected in a localized outdoor patch.",
      permissionStatus: "allowed",
      confidence: 0.72,
      riskLevel: "low"
    });

    assert.equal(envelope.version, REAL_WORLD_ENVELOPE_VERSION);
    assert.equal(envelope.observationType, "visual_environment");
    assert.equal(envelope.permissionAllowed, true);
    assert.equal(envelope.blocked, false);
    assert.equal(envelope.hypothesisOnly, true);
    assert.equal(envelope.requiresHumanReview, false);
    assertAuthority(envelope);
    assertInternalOnly(envelope);
  });

  it("blocks missing permission", () => {
    const envelope = buildRealWorldInputEnvelope({
      observationSummary: "A camera feed is available.",
      permissionStatus: "unknown",
      confidence: 0.9,
      riskLevel: "low"
    });

    assert.equal(envelope.permissionAllowed, false);
    assert.equal(envelope.requiresHumanReview, true);
    assert.equal(envelope.blockReason, "permission_not_allowed");
    assertAuthority(envelope);
    assertInternalOnly(envelope);
  });

  it("blocks sensitive identity inference", () => {
    const envelope = buildRealWorldInputEnvelope({
      observationSummary: "Identify this person using face recognition.",
      permissionStatus: "allowed",
      confidence: 0.9,
      riskLevel: "medium"
    });

    assert.equal(envelope.blocked, true);
    assert.equal(envelope.blockReason, "sensitive_or_disallowed_inference");
    assert.equal(envelope.requiresHumanReview, true);
    assert.match(envelope.observationSummary, /blocked/i);
    assertAuthority(envelope);
    assertInternalOnly(envelope);
  });

  it("high risk requires human review", () => {
    const envelope = buildRealWorldInputEnvelope({
      observationSummary: "Smoke appears to be coming from inside a building.",
      permissionStatus: "allowed",
      confidence: 0.78,
      riskLevel: "high"
    });

    assert.equal(envelope.riskLevel, "high");
    assert.equal(envelope.requiresHumanReview, true);
    assert.equal(envelope.hypothesisOnly, true);
    assertAuthority(envelope);
    assertInternalOnly(envelope);
  });

  it("normalizes helper values", () => {
    assert.equal(normalizePermissionStatus("allowed"), "allowed");
    assert.equal(normalizePermissionStatus("bad"), "unknown");
    assert.equal(normalizeRiskLevel("critical"), "critical");
    assert.equal(normalizeRiskLevel("bad"), "low");
  });

  it("summary remains compact and Marion-safe", () => {
    const envelope = buildRealWorldInputEnvelope({
      observationSummary: "Burned grass detected.",
      permissionStatus: "allowed",
      confidence: 0.72,
      riskLevel: "low"
    });

    const summary = summarizeRealWorldEnvelope(envelope);

    assert.equal(summary.version, REAL_WORLD_ENVELOPE_VERSION);
    assert.equal(summary.permissionStatus, "allowed");
    assert.equal(summary.riskLevel, "low");
    assert.ok(summary.authority, "Summary should include authority metadata");
    assert.equal(summary.authority.finalAuthority, "Marion");
  });
});
