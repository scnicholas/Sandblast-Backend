"use strict";

const { buildThalonEthicalReasoningFrame } = require("../../Data/marion/runtime/thalon/ThalonEthicalReasoningFrame");

describe("ThalonEthicalReasoningFrame", () => {
  test("returns advisory-only ethical reasoning metadata under Marion authority", () => {
    const result = buildThalonEthicalReasoningFrame({
      message: "This has privacy, consent, safety, and uncertainty concerns."
    });

    expect(result.finalAuthority).toBe("Marion");
    expect(result.advisoryOnly).toBe(true);
    expect(result.finalAnswerAuthorized).toBe(false);
    expect(result.publicReplyVisible).toBe(false);
    expect(result.ethicalPressureScore).toBeGreaterThan(0);
    expect(result.marionAuthority).toBe(true);
  });
});
