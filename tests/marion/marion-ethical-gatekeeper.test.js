"use strict";

const {
  evaluateEthicalGate,
  summarizeEthicalGate,
  containsDisallowedEthicalRequest,
  containsCautionSignal,
  ETHICAL_GATEKEEPER_VERSION
} = require("../../Data/marion/runtime/MarionEthicalGatekeeper");

function assertAuthority(packet) {
  expect(packet.authority.finalAuthority).toBe("Marion");
  expect(packet.authority.ethicalAdvisoryOnly).toBe(true);
  expect(packet.authority.neverOverrideMarion).toBe(true);
  expect(packet.marionAuthority).toBe(true);
  expect(packet.finalAuthority).toBe("Marion");
}

function assertInternalOnly(packet) {
  expect(packet.userFacing).toBe(false);
  expect(packet.publicReplyVisible).toBe(false);
  expect(packet.publicText).toBe("");
  expect(packet.renderText).toBe("");
  expect(packet.text).toBe("");
}

describe("Marion Ethical Gatekeeper", () => {
  test("exports expected behavior", () => {
    expect(typeof evaluateEthicalGate).toBe("function");
    expect(typeof summarizeEthicalGate).toBe("function");
    expect(typeof containsDisallowedEthicalRequest).toBe("function");
    expect(typeof containsCautionSignal).toBe("function");
  });

  test("allows non-sensitive burned grass explanation as hypothesis", () => {
    const result = evaluateEthicalGate({
      observationSummary: "Burned grass detected in a localized outdoor patch.",
      confidence: 0.72,
      riskLevel: "low"
    });

    expect(result.version).toBe(ETHICAL_GATEKEEPER_VERSION);
    expect(result.allowed).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.hypothesisOnly).toBe(true);
    expect(result.disallowedActions).toContain("state_uncertain_cause_as_fact");
    assertAuthority(result);
    assertInternalOnly(result);
  });

  test("blocks private person identification request", () => {
    const result = evaluateEthicalGate({
      observationSummary: "Identify this person using face recognition.",
      confidence: 0.9,
      riskLevel: "medium"
    });

    expect(result.allowed).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.decision).toBe("block");
    expect(result.ethicalConcernLevel).toBe("critical");
    expect(result.requiresHumanReview).toBe(true);
    expect(result.reason).toBe("disallowed_sensitive_or_unsafe_inference");
    assertAuthority(result);
    assertInternalOnly(result);
  });

  test("high risk context requires caution and review", () => {
    const result = evaluateEthicalGate({
      observationSummary: "Smoke appears inside a building.",
      confidence: 0.78,
      riskLevel: "high"
    });

    expect(result.decision).toBe("caution");
    expect(result.ethicalConcernLevel).toBe("high");
    expect(result.requiresHumanReview).toBe(true);
    expect(result.allowed).toBe(true);
    assertAuthority(result);
  });

  test("low confidence requires uncertainty", () => {
    const result = evaluateEthicalGate({
      observationSummary: "Unclear object near doorway.",
      confidence: 0.42,
      riskLevel: "low"
    });

    expect(result.decision).toBe("clarify");
    expect(result.uncertaintyRequired).toBe(true);
    expect(result.hypothesisOnly).toBe(true);
    assertAuthority(result);
  });

  test("detects disallowed and caution patterns", () => {
    expect(containsDisallowedEthicalRequest("Who is this person?")).toBe(true);
    expect(containsDisallowedEthicalRequest("Burned grass detected.")).toBe(false);
    expect(containsCautionSignal("There is smoke nearby.")).toBe(true);
  });

  test("summary remains compact and Marion-safe", () => {
    const result = evaluateEthicalGate({
      observationSummary: "Smoke appears inside a building.",
      confidence: 0.78,
      riskLevel: "high"
    });

    const summary = summarizeEthicalGate(result);

    expect(summary.version).toBe(ETHICAL_GATEKEEPER_VERSION);
    expect(summary.requiresHumanReview).toBe(true);
    expect(summary.authority.finalAuthority).toBe("Marion");
  });

  test("disabled gatekeeper passes safely without losing authority", () => {
    const result = evaluateEthicalGate("Identify this person.", {
      config: {
        enabled: false
      }
    });

    expect(result.enabled).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.blocked).toBe(false);
    assertAuthority(result);
  });
});
