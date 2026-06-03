"use strict";

const {
  buildMarionDualTrackPacket,
  summarizeDualTrackPacket
} = require("../../Data/marion/runtime/MarionDualTrackGateway");

function assertAuthority(packet) {
  expect(packet).toBeTruthy();
  expect(packet.finalAuthority).toBe("Marion");
  expect(packet.marionAuthority).toBe(true);
  expect(packet.advisoryOnly).toBe(true);
  expect(packet.publicReplyVisible).toBe(false);
  expect(packet.userFacing).toBe(false);
  expect(packet.text).toBe("");
  expect(packet.publicText).toBe("");
  expect(packet.renderText).toBe("");
}

function buildTurn(payload, previousDualTrack, turnId) {
  const packet = buildMarionDualTrackPacket(
    { ...payload, turnId },
    { previousDualTrack, turnId }
  );

  return {
    packet,
    summary: summarizeDualTrackPacket(packet)
  };
}

describe("Marion parallel lane stale-carry discipline", () => {
  test("normal chat after a language turn suppresses stale language carry", () => {
    let previous = null;

    const turn1 = buildTurn({
      message: "Bonjour Nyx, translate this phrase into English.",
      languageMeta: {
        detectedLanguage: "fr",
        requiresTranslation: true,
        confidence: 0.94,
        updatedAt: Date.now()
      },
      translationMeta: {
        sourceLanguage: "fr",
        targetLanguage: "en",
        translated: true,
        updatedAt: Date.now()
      }
    }, previous, "turn-1-language");

    expect(turn1.summary.activeTracks).toContain("language");
    expect(turn1.summary.activeTracks).not.toContain("real_world");
    expect(turn1.summary.activeTracks).not.toContain("strategic");
    assertAuthority(turn1.packet);
    previous = turn1.packet;

    const turn2 = buildTurn({
      message: "normal chat"
    }, previous, "turn-2-normal");

    expect(turn2.summary.activeTracks).toEqual([]);
    expect(turn2.summary.staleCarrySuppressed).toBe(true);
    expect(turn2.summary.staleTracks).toContain("language");
    assertAuthority(turn2.packet);
    previous = turn2.packet;

    const turn3 = buildTurn({
      message: "Aster observation packet.",
      realWorldObservation: {
        observationType: "environment",
        observationSummary: "smoke indoors",
        riskLevel: "high",
        confidence: 0.82,
        updatedAt: Date.now()
      }
    }, previous, "turn-3-real-world");

    expect(turn3.summary.activeTracks).toContain("real_world");
    expect(turn3.summary.activeTracks).not.toContain("language");
    expect(turn3.summary.requiresHumanReview).toBe(true);
    assertAuthority(turn3.packet);
    previous = turn3.packet;

    const turn4 = buildTurn({
      message: "Return to ordinary chat."
    }, previous, "turn-4-normal");

    expect(turn4.summary.activeTracks).toEqual([]);
    expect(turn4.summary.staleCarrySuppressed).toBe(true);
    expect(turn4.summary.staleTracks).toContain("real_world");
    assertAuthority(turn4.packet);
  });

  test("normal chat after strategic review suppresses stale strategic carry", () => {
    let previous = null;

    const turn1 = buildTurn({
      message: "Thalon strategic review packet.",
      strategicReview: {
        decisionPressureIndex: 0.86,
        strategicReviewRequired: true,
        humanReviewRecommended: true,
        advisoryOnly: true,
        updatedAt: Date.now()
      }
    }, previous, "turn-1-strategic");

    expect(turn1.summary.activeTracks).toContain("strategic");
    expect(turn1.summary.requiresHumanReview).toBe(true);
    assertAuthority(turn1.packet);
    previous = turn1.packet;

    const turn2 = buildTurn({
      message: "normal chat"
    }, previous, "turn-2-normal");

    expect(turn2.summary.activeTracks).toEqual([]);
    expect(turn2.summary.staleCarrySuppressed).toBe(true);
    expect(turn2.summary.staleTracks).toContain("strategic");
    assertAuthority(turn2.packet);
  });
});
