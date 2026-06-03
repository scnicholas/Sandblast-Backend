"use strict";

const {
  buildMarionDualTrackPacket,
  summarizeDualTrackPacket,
  looksLikeExplicitLanguageSignal
} = require("../../Data/marion/runtime/MarionDualTrackGateway");

const {
  buildMarionCoordinationTelemetry,
  summarizeCoordinationTelemetry
} = require("../../Data/marion/runtime/MarionCoordinationTelemetry");

function assertPublicSurface(packet) {
  expect(packet.finalAuthority).toBe("Marion");
  expect(packet.marionAuthority).toBe(true);
  expect(packet.advisoryOnly).toBe(true);
  expect(packet.publicReplyVisible).toBe(false);
  expect(packet.userFacing).toBe(false);
  expect(packet.text).toBe("");
  expect(packet.publicText).toBe("");
  expect(packet.renderText).toBe("");
}

function buildTurn(payload, previousPacket, turnId) {
  const packet = buildMarionDualTrackPacket(
    { ...payload, turnId },
    { previousDualTrack: previousPacket, turnId }
  );
  const telemetry = buildMarionCoordinationTelemetry({
    ...payload,
    turnId,
    languageTrack: packet.languageTrack,
    realWorldTrack: packet.realWorldTrack,
    ethicalGate: packet.ethicalTrack.ethicalReview,
    strategicTrack: packet.strategicTrack,
    coordinationMeta: packet.coordinationMeta,
    laneRecency: packet.laneRecency
  });
  return { packet, telemetry, summary: summarizeDualTrackPacket(packet), telemetrySummary: summarizeCoordinationTelemetry(telemetry) };
}

describe("Marion live multi-turn parallel lane discipline", () => {
  test("does not activate LingoLink for generic normal chat", () => {
    expect(looksLikeExplicitLanguageSignal({ message: "How are you today?" })).toBe(false);
    expect(looksLikeExplicitLanguageSignal({ message: "Bonjour Nyx, translate this", languageMeta: { detectedLanguage: "fr" } })).toBe(true);
  });

  test("keeps advisory lanes isolated across a six-turn sequence", () => {
    let previous = null;

    const turn1 = buildTurn({
      message: "Bonjour Nyx, translate this phrase.",
      languageMeta: { detectedLanguage: "fr", requiresTranslation: true, confidence: 0.94, updatedAt: Date.now() },
      translationMeta: { sourceLanguage: "fr", targetLanguage: "en", translated: true, updatedAt: Date.now() }
    }, previous, "turn-1-lingolink");
    previous = turn1.packet;

    expect(turn1.summary.activeTracks).toContain("language");
    expect(turn1.summary.activeTracks).not.toContain("real_world");
    assertPublicSurface(turn1.packet);

    const turn2 = buildTurn({
      message: "Give me one clean normal follow-up sentence."
    }, previous, "turn-2-normal");
    previous = turn2.packet;

    expect(turn2.summary.activeTracks).toEqual([]);
    expect(turn2.summary.staleCarrySuppressed).toBe(true);
    expect(turn2.summary.staleTracks).toContain("language");
    assertPublicSurface(turn2.packet);

    const turn3 = buildTurn({
      message: "Aster observation packet.",
      realWorldObservation: {
        observationType: "environment",
        observationSummary: "smoke indoors",
        riskLevel: "high",
        confidence: 0.82,
        updatedAt: Date.now()
      }
    }, previous, "turn-3-aster");
    previous = turn3.packet;

    expect(turn3.summary.activeTracks).toContain("real_world");
    expect(turn3.summary.activeTracks).not.toContain("language");
    assertPublicSurface(turn3.packet);

    const turn4 = buildTurn({
      message: "Normal chat again."
    }, previous, "turn-4-normal");
    previous = turn4.packet;

    expect(turn4.summary.activeTracks).toEqual([]);
    expect(turn4.summary.staleTracks).toContain("real_world");
    assertPublicSurface(turn4.packet);

    const turn5 = buildTurn({
      message: "Thalon strategic review packet.",
      strategicReview: {
        decisionPressureIndex: 0.86,
        strategicReviewRequired: true,
        humanReviewRecommended: true,
        advisoryOnly: true,
        updatedAt: Date.now()
      }
    }, previous, "turn-5-thalon");
    previous = turn5.packet;

    expect(turn5.summary.activeTracks).not.toContain("ethical");
    expect(turn5.summary.activeTracks).toContain("strategic");
    expect(turn5.summary.requiresHumanReview).toBe(true);
    assertPublicSurface(turn5.packet);

    const turn6 = buildTurn({
      message: "Return to ordinary chat."
    }, previous, "turn-6-normal");

    expect(turn6.summary.activeTracks).toEqual([]);
    expect(turn6.summary.staleTracks).toEqual(expect.arrayContaining(["strategic"]));
    expect(turn6.telemetrySummary.marionFinalAuthorityPreserved).toBe(true);
    expect(turn6.telemetrySummary.publicReplyVisible).toBe(false);
    assertPublicSurface(turn6.packet);
  });
});
