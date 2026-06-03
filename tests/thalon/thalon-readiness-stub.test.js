"use strict";

const {
  buildThalonReadinessPacket,
  summarizeThalonReadiness,
  extractConcernLevel,
  normalizeConcernLevel,
  concernAtLeast,
  THALON_READINESS_VERSION
} = require("../../Data/marion/runtime/ThalonReadinessStub");

function assertAuthority(packet) {
  expect(packet.authority.finalAuthority).toBe("Marion");
  expect(packet.authority.thalonAdvisoryOnly).toBe(true);
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

describe("Thalon Readiness Stub", () => {
  test("exports expected functions", () => {
    expect(typeof buildThalonReadinessPacket).toBe("function");
    expect(typeof summarizeThalonReadiness).toBe("function");
    expect(typeof extractConcernLevel).toBe("function");
    expect(typeof normalizeConcernLevel).toBe("function");
    expect(typeof concernAtLeast).toBe("function");
  });

  test("normalizes concern levels", () => {
    expect(normalizeConcernLevel("critical")).toBe("critical");
    expect(normalizeConcernLevel("HIGH")).toBe("high");
    expect(normalizeConcernLevel("bad")).toBe("low");
    expect(concernAtLeast("high", "medium")).toBe(true);
    expect(concernAtLeast("low", "medium")).toBe(false);
  });

  test("builds standby readiness for low concern", () => {
    const packet = buildThalonReadinessPacket({
      ethicalGate: {
        ethicalConcernLevel: "low",
        requiresHumanReview: false
      }
    });

    expect(packet.version).toBe(THALON_READINESS_VERSION);
    expect(packet.thalonReady).toBe(true);
    expect(packet.strategicReviewRequired).toBe(false);
    expect(packet.recommendationMode).toBe("standby");
    assertAuthority(packet);
    assertInternalOnly(packet);
  });

  test("requires strategic review for medium concern", () => {
    const packet = buildThalonReadinessPacket({
      ethicalGate: {
        ethicalConcernLevel: "medium",
        requiresHumanReview: false
      }
    });

    expect(packet.thalonReady).toBe(true);
    expect(packet.strategicReviewRequired).toBe(true);
    expect(packet.ethicalConcernLevel).toBe("medium");
    expect(packet.recommendationMode).toBe("advisory_review");
    assertAuthority(packet);
    assertInternalOnly(packet);
  });

  test("requires strategic review for high risk classification", () => {
    const packet = buildThalonReadinessPacket({
      riskClassification: {
        riskLevel: "high",
        requiresHumanReview: true
      }
    });

    expect(packet.strategicReviewRequired).toBe(true);
    expect(packet.ethicalConcernLevel).toBe("high");
    expect(packet.reviewLane).toBe("ethical_strategy_review");
    assertAuthority(packet);
  });

  test("critical risk creates critical concern", () => {
    const packet = buildThalonReadinessPacket({
      riskClassification: {
        riskLevel: "critical",
        requiresHumanReview: true
      }
    });

    expect(packet.strategicReviewRequired).toBe(true);
    expect(packet.ethicalConcernLevel).toBe("critical");
    assertAuthority(packet);
  });

  test("summary remains compact", () => {
    const packet = buildThalonReadinessPacket({
      ethicalGate: {
        ethicalConcernLevel: "medium"
      }
    });

    const summary = summarizeThalonReadiness(packet);

    expect(summary.version).toBe(THALON_READINESS_VERSION);
    expect(summary.thalonReady).toBe(true);
    expect(summary.strategicReviewRequired).toBe(true);
    expect(summary.authority.finalAuthority).toBe("Marion");
  });

  test("disabled readiness stub is safe", () => {
    const packet = buildThalonReadinessPacket({
      ethicalGate: {
        ethicalConcernLevel: "critical"
      }
    }, {
      config: {
        enabled: false
      }
    });

    expect(packet.enabled).toBe(false);
    expect(packet.thalonReady).toBe(false);
    expect(packet.strategicReviewRequired).toBe(false);
    assertAuthority(packet);
  });
});
