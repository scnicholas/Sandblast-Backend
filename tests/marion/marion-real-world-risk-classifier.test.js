"use strict";

const {
  classifyRiskLevel,
  summarizeRiskClassification,
  normalizeRiskLevel,
  riskAtLeast,
  REAL_WORLD_RISK_CLASSIFIER_VERSION
} = require("../../Data/marion/runtime/MarionRealWorldRiskClassifier");

function assertAuthority(packet) {
  expect(packet.authority.finalAuthority).toBe("Marion");
  expect(packet.authority.riskClassifierAdvisoryOnly).toBe(true);
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

describe("Marion Real-World Risk Classifier", () => {
  test("exports and normalizes risk levels", () => {
    expect(typeof classifyRiskLevel).toBe("function");
    expect(typeof summarizeRiskClassification).toBe("function");
    expect(normalizeRiskLevel("critical")).toBe("critical");
    expect(normalizeRiskLevel("bad")).toBe("low");
    expect(riskAtLeast("high", "medium")).toBe(true);
    expect(riskAtLeast("low", "medium")).toBe(false);
  });

  test("classifies burned grass as medium risk", () => {
    const result = classifyRiskLevel({
      observationSummary: "Burned grass detected in a localized outdoor patch.",
      confidence: 0.72
    });

    expect(result.version).toBe(REAL_WORLD_RISK_CLASSIFIER_VERSION);
    expect(result.riskLevel).toBe("medium");
    expect(result.cautionRequired).toBe(true);
    expect(result.hypothesisOnly).toBe(true);
    assertAuthority(result);
    assertInternalOnly(result);
  });

  test("classifies smoke indoors as high risk", () => {
    const result = classifyRiskLevel({
      observationSummary: "Smoke indoors near the hallway.",
      confidence: 0.82
    });

    expect(result.riskLevel).toBe("high");
    expect(result.requiresHumanReview).toBe(true);
    expect(result.cautionRequired).toBe(true);
    assertAuthority(result);
  });

  test("classifies serious injury as critical", () => {
    const result = classifyRiskLevel({
      observationSummary: "A person injured and bleeding heavily.",
      confidence: 0.88
    });

    expect(result.riskLevel).toBe("critical");
    expect(result.requiresHumanReview).toBe(true);
    expect(result.emergencySafeWordingRequired).toBe(true);
    assertAuthority(result);
  });

  test("declared higher risk is preserved", () => {
    const result = classifyRiskLevel({
      observationSummary: "Unknown object on floor.",
      riskLevel: "high",
      confidence: 0.75
    });

    expect(result.riskLevel).toBe("high");
    expect(result.declaredRiskLevel).toBe("high");
    expect(result.requiresHumanReview).toBe(true);
    assertAuthority(result);
  });

  test("summary remains compact and Marion-safe", () => {
    const result = classifyRiskLevel({
      observationSummary: "Smoke indoors near the hallway.",
      confidence: 0.82
    });

    const summary = summarizeRiskClassification(result);

    expect(summary.version).toBe(REAL_WORLD_RISK_CLASSIFIER_VERSION);
    expect(summary.riskLevel).toBe("high");
    expect(summary.requiresHumanReview).toBe(true);
    expect(summary.authority.finalAuthority).toBe("Marion");
  });

  test("disabled classifier remains safe", () => {
    const result = classifyRiskLevel("Smoke indoors.", {
      config: {
        enabled: false
      }
    });

    expect(result.enabled).toBe(false);
    expect(result.riskLevel).toBe("none");
    expect(result.authority.finalAuthority).toBe("Marion");
  });
});
