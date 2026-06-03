"use strict";

const { buildThalonMarionAdvisoryBridge } = require("../../Data/marion/runtime/thalon/ThalonMarionAdvisoryBridge");

describe("ThalonMarionAdvisoryBridge", () => {
  test("builds an advisory strategic packet without authorizing final output", () => {
    const packet = buildThalonMarionAdvisoryBridge({
      text: "urgent strategic tradeoff with safety uncertainty"
    });

    expect(packet.active).toBe(true);
    expect(packet.strategicReviewRequired).toBe(true);
    expect(packet.finalAuthority).toBe("Marion");
    expect(packet.finalAnswerAuthorized).toBe(false);
    expect(packet.advisoryOnly).toBe(true);
    expect(packet.publicReplyVisible).toBe(false);
    expect(packet.marionAuthorityRequired).toBe(true);
  });
});
