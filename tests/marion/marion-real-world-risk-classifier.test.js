"use strict";

/**
 * tests/marion/marion-real-world-risk-classifier.test.js
 *
 * Purpose:
 * - Validate real-world risk classification behavior.
 * - Confirm the classifier remains advisory-only.
 * - Confirm Marion remains the final authority.
 * - Confirm public-facing output stays empty/internal-only.
 *
 * Node test runner compatible.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { describe, it } = test;

const {
  classifyRiskLevel,
  summarizeRiskClassification,
  normalizeRiskLevel,
  riskAtLeast,
  REAL_WORLD_RISK_CLASSIFIER_VERSION
} = require("../../Data/marion/runtime/MarionRealWorldRiskClassifier");

function assertAuthority(packet) {
  assert.ok(packet, "Risk packet should exist");
  assert.ok(packet.authority, "Risk packet should include authority metadata");
  assert.equal(packet.authority.finalAuthority, "Marion");
  assert.equal(packet.authority.riskClassifierAdvisoryOnly, true);
  assert.equal(packet.authority.neverOverrideMarion, true);
  assert.equal(packet.marionAuthority, true);
  assert.equal(packet.finalAuthority, "Marion");
}

function assertInternalOnly(packet) {
  assert.ok(packet, "Risk packet should exist");
  assert.equal(packet.userFacing, false);
  assert.equal(packet.publicReplyVisible, false);
  assert.equal(packet.publicText, "");
  assert.equal(packet.renderText, "");
  assert.equal(packet.text, "");
}

describe("Marion Real-World Risk Classifier", () => {
  it("exports and normalizes risk levels", () => {
    assert.equal(typeof classifyRiskLevel, "function");
    assert.equal(typeof summarizeRiskClassification, "function");
    assert.equal(normalizeRiskLevel("critical"), "critical");
    assert.equal(normalizeRiskLevel("bad"), "low");
    assert.equal(riskAtLeast("high", "medium"), true);
    assert.equal(riskAtLeast("low", "medium"), false);
  });

  it("classifies burned grass as medium risk", () => {
    const result = classifyRiskLevel({
      observationSummary: "Burned grass detected in a localized outdoor patch.",
      confidence: 0.72
    });

    assert.equal(result.version, REAL_WORLD_RISK_CLASSIFIER_VERSION);
    assert.equal(result.riskLevel, "medium");
    assert.equal(result.cautionRequired, true);
    assert.equal(result.hypothesisOnly, true);
    assertAuthority(result);
    assertInternalOnly(result);
  });

  it("classifies smoke indoors as high risk", () => {
    const result = classifyRiskLevel({
      observationSummary: "Smoke indoors near the hallway.",
      confidence: 0.82
    });

    assert.equal(result.riskLevel, "high");
    assert.equal(result.requiresHumanReview, true);
    assert.equal(result.cautionRequired, true);
    assertAuthority(result);
    assertInternalOnly(result);
  });

  it("classifies serious injury as critical", () => {
    const result = classifyRiskLevel({
      observationSummary: "A person injured and bleeding heavily.",
      confidence: 0.88
    });

    assert.equal(result.riskLevel, "critical");
    assert.equal(result.requiresHumanReview, true);
    assert.equal(result.emergencySafeWordingRequired, true);
    assertAuthority(result);
    assertInternalOnly(result);
  });

  it("declared higher risk is preserved", () => {
    const result = classifyRiskLevel({
      observationSummary: "Unknown object on floor.",
      riskLevel: "high",
      confidence: 0.75
    });

    assert.equal(result.riskLevel, "high");
    assert.equal(result.declaredRiskLevel, "high");
    assert.equal(result.requiresHumanReview, true);
    assertAuthority(result);
    assertInternalOnly(result);
  });

  it("summary remains compact and Marion-safe", () => {
    const result = classifyRiskLevel({
      observationSummary: "Smoke indoors near the hallway.",
      confidence: 0.82
    });

    const summary = summarizeRiskClassification(result);

    assert.equal(summary.version, REAL_WORLD_RISK_CLASSIFIER_VERSION);
    assert.equal(summary.riskLevel, "high");
    assert.equal(summary.requiresHumanReview, true);
    assert.ok(summary.authority, "Summary should include authority metadata");
    assert.equal(summary.authority.finalAuthority, "Marion");
  });

  it("disabled classifier remains safe", () => {
    const result = classifyRiskLevel("Smoke indoors.", {
      config: {
        enabled: false
      }
    });

    assert.equal(result.enabled, false);
    assert.equal(result.riskLevel, "none");
    assert.ok(result.authority, "Disabled result should include authority metadata");
    assert.equal(result.authority.finalAuthority, "Marion");
    assertAuthority(result);
    assertInternalOnly(result);
  });
});
