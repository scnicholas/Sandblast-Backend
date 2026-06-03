"use strict";

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
  expect(packet.authority.finalAuthority).toBe("Marion");
  expect(packet.authority.realWorldAdvisoryOnly).toBe(true);
  expect(packet.authority.neverOverrideMarion).toBe(true);
  expect(packet.marionAuthority).toBe(true);
  expect(packet.finalAuthority).toBe("Marion");
}

function assertInternalOnly(packet) {
  expect(packet.userFacing).toBe(false);
  expect(packet.publicText).toBe("");
  expect(packet.renderText).toBe("");
  expect(packet.text).toBe("");
}

describe("Marion Real-World Input Envelope", () => {
  test("exports expected functions", () => {
    expect(typeof buildRealWorldInputEnvelope).toBe("function");
    expect(typeof summarizeRealWorldEnvelope).toBe("function");
    expect(typeof inferObservationType).toBe("function");
    expect(typeof containsSensitiveOrBlockedInference).toBe("function");
  });

  test("builds valid envelope for permitted burned grass observation", () => {
    const envelope = buildRealWorldInputEnvelope({
      observationType: "visual_environment",
      observationSummary: "Burned grass detected in a localized outdoor patch.",
      permissionStatus: "allowed",
      confidence: 0.72,
      riskLevel: "low"
    });

    expect(envelope.version).toBe(REAL_WORLD_ENVELOPE_VERSION);
    expect(envelope.observationType).toBe("visual_environment");
    expect(envelope.permissionAllowed).toBe(true);
    expect(envelope.blocked).toBe(false);
    expect(envelope.hypothesisOnly).toBe(true);
    expect(envelope.requiresHumanReview).toBe(false);
    assertAuthority(envelope);
    assertInternalOnly(envelope);
  });

  test("blocks missing permission", () => {
    const envelope = buildRealWorldInputEnvelope({
      observationSummary: "A camera feed is available.",
      permissionStatus: "unknown",
      confidence: 0.9,
      riskLevel: "low"
    });

    expect(envelope.permissionAllowed).toBe(false);
    expect(envelope.requiresHumanReview).toBe(true);
    expect(envelope.blockReason).toBe("permission_not_allowed");
    assertAuthority(envelope);
  });

  test("blocks sensitive identity inference", () => {
    const envelope = buildRealWorldInputEnvelope({
      observationSummary: "Identify this person using face recognition.",
      permissionStatus: "allowed",
      confidence: 0.9,
      riskLevel: "medium"
    });

    expect(envelope.blocked).toBe(true);
    expect(envelope.blockReason).toBe("sensitive_or_disallowed_inference");
    expect(envelope.requiresHumanReview).toBe(true);
    expect(envelope.observationSummary).toContain("blocked");
    assertAuthority(envelope);
    assertInternalOnly(envelope);
  });

  test("high risk requires human review", () => {
    const envelope = buildRealWorldInputEnvelope({
      observationSummary: "Smoke appears to be coming from inside a building.",
      permissionStatus: "allowed",
      confidence: 0.78,
      riskLevel: "high"
    });

    expect(envelope.riskLevel).toBe("high");
    expect(envelope.requiresHumanReview).toBe(true);
    expect(envelope.hypothesisOnly).toBe(true);
    assertAuthority(envelope);
  });

  test("normalizes helper values", () => {
    expect(normalizePermissionStatus("allowed")).toBe("allowed");
    expect(normalizePermissionStatus("bad")).toBe("unknown");
    expect(normalizeRiskLevel("critical")).toBe("critical");
    expect(normalizeRiskLevel("bad")).toBe("low");
  });

  test("summary remains compact and Marion-safe", () => {
    const envelope = buildRealWorldInputEnvelope({
      observationSummary: "Burned grass detected.",
      permissionStatus: "allowed",
      confidence: 0.72,
      riskLevel: "low"
    });

    const summary = summarizeRealWorldEnvelope(envelope);

    expect(summary.version).toBe(REAL_WORLD_ENVELOPE_VERSION);
    expect(summary.permissionStatus).toBe("allowed");
    expect(summary.riskLevel).toBe("low");
    expect(summary.authority.finalAuthority).toBe("Marion");
  });
});
