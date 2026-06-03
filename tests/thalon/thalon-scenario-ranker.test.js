"use strict";

const { rankThalonScenarios } = require("../../Data/marion/runtime/thalon/ThalonScenarioRanker");

describe("ThalonScenarioRanker", () => {
  test("ranks safer staged scenarios above risky fast paths while preserving Marion authority", () => {
    const result = rankThalonScenarios({
      scenarios: [
        { label: "Fast but risky", clarity: 0.8, safety: 0.2, strategicValue: 0.8, risk: 0.8 },
        { label: "Controlled staged path", clarity: 0.8, safety: 0.9, reversibility: 0.8, strategicValue: 0.8, risk: 0.1 }
      ]
    });

    expect(result.finalAuthority).toBe("Marion");
    expect(result.advisoryOnly).toBe(true);
    expect(result.finalAnswerAuthorized).toBe(false);
    expect(result.publicReplyVisible).toBe(false);
    expect(result.rankedScenarios[0].label).toBe("Controlled staged path");
    expect(result.marionAuthority).toBe(true);
  });
});
