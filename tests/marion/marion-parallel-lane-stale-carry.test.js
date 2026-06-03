
"use strict";

const {
  buildMarionDualTrackPacket,
  summarizeDualTrackPacket,
  DUAL_TRACK_GATEWAY_VERSION
} = require("../../Data/marion/runtime/MarionDualTrackGateway");

function assertAuthority(packet) {
  expect(packet.finalAuthority).toBe("Marion");
  expect(packet.marionAuthority).toBe(true);
  expect(packet.advisoryOnly).toBe(true);
  expect(packet.publicReplyVisible).toBe(false);
  expect(packet.userFacing).toBe(false);
  expect(packet.text).toBe("");
}

describe("Marion parallel lane stale-carry suppression", () => {
  test("clears stale advisory lanes across a six-turn mixed flow", () => {
    let previous = null;

    const turn1 = buildMarionDualTrackPacket({
      message: "Bonjour Nyx",
      languageMeta: { detectedLanguage: "fr", requiresTranslation: true }
    }, { previousDualTrack: previous });
    expect(turn1.coordinationMeta.activeTracks).toEqual(["language"]);
    expect(turn1.coordinationMeta.laneRecency.staleTracks).toEqual([]);
    assertAuthority(turn1);
    previous = turn1;

    const turn2 = buildMarionDualTrackPacket({ message: "normal chat" }, { previousDualTrack: previous });
    expect(turn2.coordinationMeta.activeTracks).toEqual(["language"]);
    expect(turn2.coordinationMeta.laneRecency.staleTracks).toEqual([]);
    assertAuthority(turn2);
    previous = turn2;

    const turn3 = buildMarionDualTrackPacket({
      realWorldObservation: { observationType: "environment", riskLevel: "low", observationSummary: "clear environment" }
    }, { previousDualTrack: previous });
    expect(turn3.coordinationMeta.activeTracks).toEqual(["real_world"]);
    expect(turn3.coordinationMeta.laneRecency.staleTracks).toContain("language");
    expect(turn3.coordinationMeta.staleCarrySuppressed).toBe(true);
    assertAuthority(turn3);
    previous = turn3;

    const turn4 = buildMarionDualTrackPacket({}, { previousDualTrack: previous });
    expect(turn4.coordinationMeta.activeTracks).toEqual([]);
    expect(turn4.coordinationMeta.laneRecency.staleTracks).toContain("real_world");
    expect(turn4.coordinationMeta.staleCarrySuppressed).toBe(true);
    assertAuthority(turn4);
    previous = turn4;

    const turn5 = buildMarionDualTrackPacket({
      strategicReview: { decisionPressureIndex: 0.82, humanReviewRecommended: true }
    }, { previousDualTrack: previous });
    expect(turn5.coordinationMeta.activeTracks).toEqual(["strategic"]);
    expect(turn5.coordinationMeta.requiresHumanReview).toBe(true);
    assertAuthority(turn5);
    previous = turn5;

    const turn6 = buildMarionDualTrackPacket({ message: "normal chat" }, { previousDualTrack: previous });
    expect(turn6.coordinationMeta.activeTracks).toEqual(["language"]);
    expect(turn6.coordinationMeta.laneRecency.staleTracks).toContain("strategic");
    expect(turn6.coordinationMeta.staleCarrySuppressed).toBe(true);

    const summary = summarizeDualTrackPacket(turn6);
    expect(summary.version).toBe(DUAL_TRACK_GATEWAY_VERSION);
    expect(summary.activeTracks).toContain("language");
    expect(summary.staleTracks).toContain("strategic");
    expect(summary.staleCarrySuppressed).toBe(true);
    expect(summary.authority.finalAuthority).toBe("Marion");
  });
});
