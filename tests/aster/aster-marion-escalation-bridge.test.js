"use strict";

const {
  buildAsterMarionEscalationBridge,
  ASTER_MARION_ESCALATION_BRIDGE_VERSION
} = require("../../Data/marion/runtime/aster/AsterMarionEscalationBridge");

describe("AsterMarionEscalationBridge", () => {
  test("builds Marion-authorized escalation packet for high-risk real-world context", () => {
    const packet = buildAsterMarionEscalationBridge({
      envelope: {
        riskLevel: "high",
        requiresHumanReview: true,
        observationSummary: "smoke indoors"
      }
    });

    expect(packet.version).toBe(ASTER_MARION_ESCALATION_BRIDGE_VERSION);
    expect(packet.active).toBe(true);
    expect(packet.lane).toBe("real_world");
    expect(packet.source).toBe("AsterMarionEscalationBridge");
    expect(packet.riskLevel).toBe("high");
    expect(packet.requiresHumanReview).toBe(true);
    expect(packet.escalationRecommended).toBe(true);
    expect(packet.advisoryOnly).toBe(true);
    expect(packet.finalAuthority).toBe("Marion");
    expect(packet.finalAnswerAuthorized).toBe(false);
    expect(packet.marionAuthorityRequired).toBe(true);
    expect(packet.publicReplyVisible).toBe(false);
    expect(packet.userFacing).toBe(false);
    expect(packet.text).toBe("");
  });

  test("keeps low-risk context advisory-only without forcing escalation", () => {
    const packet = buildAsterMarionEscalationBridge({
      envelope: {
        riskLevel: "low",
        requiresHumanReview: false,
        observationSummary: "clear environment"
      }
    });

    expect(packet.active).toBe(true);
    expect(packet.riskLevel).toBe("low");
    expect(packet.requiresHumanReview).toBe(false);
    expect(packet.escalationRecommended).toBe(false);
    expect(packet.advisoryOnly).toBe(true);
    expect(packet.finalAuthority).toBe("Marion");
    expect(packet.finalAnswerAuthorized).toBe(false);
  });
});
