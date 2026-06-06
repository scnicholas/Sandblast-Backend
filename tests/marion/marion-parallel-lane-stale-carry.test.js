"use strict";

/**
 * tests/marion/marion-parallel-lane-stale-carry.test.js
 *
 * Purpose:
 * - Validate parallel lane stale-carry discipline.
 * - Confirm advisory lanes do not persist into ordinary follow-up turns.
 * - Confirm Marion remains the final authority and public output remains empty.
 *
 * Node test runner compatible.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { describe, it } = test;

const {
  buildMarionDualTrackPacket,
  summarizeDualTrackPacket
} = require("../../Data/marion/runtime/MarionDualTrackGateway");

function assertAuthority(packet) {
  assert.ok(packet, "Packet should exist");
  assert.equal(packet.finalAuthority, "Marion");
  assert.equal(packet.marionAuthority, true);
  assert.equal(packet.advisoryOnly, true);
  assert.equal(packet.publicReplyVisible, false);
  assert.equal(packet.userFacing, false);
  assert.equal(packet.text, "");
  assert.equal(packet.publicText, "");
  assert.equal(packet.renderText, "");
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
  it("normal chat after a language turn suppresses stale language carry", () => {
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

    assert.ok(turn1.summary.activeTracks.includes("language"));
    assert.equal(turn1.summary.activeTracks.includes("real_world"), false);
    assert.equal(turn1.summary.activeTracks.includes("strategic"), false);
    assertAuthority(turn1.packet);
    previous = turn1.packet;

    const turn2 = buildTurn({
      message: "normal chat"
    }, previous, "turn-2-normal");

    assert.deepEqual(turn2.summary.activeTracks, []);
    assert.equal(turn2.summary.staleCarrySuppressed, true);
    assert.ok(turn2.summary.staleTracks.includes("language"));
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

    assert.ok(turn3.summary.activeTracks.includes("real_world"));
    assert.equal(turn3.summary.activeTracks.includes("language"), false);
    assert.equal(turn3.summary.requiresHumanReview, true);
    assertAuthority(turn3.packet);
    previous = turn3.packet;

    const turn4 = buildTurn({
      message: "Return to ordinary chat."
    }, previous, "turn-4-normal");

    assert.deepEqual(turn4.summary.activeTracks, []);
    assert.equal(turn4.summary.staleCarrySuppressed, true);
    assert.ok(turn4.summary.staleTracks.includes("real_world"));
    assertAuthority(turn4.packet);
  });

  it("normal chat after strategic review suppresses stale strategic carry", () => {
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

    assert.ok(turn1.summary.activeTracks.includes("strategic"));
    assert.equal(turn1.summary.requiresHumanReview, true);
    assertAuthority(turn1.packet);
    previous = turn1.packet;

    const turn2 = buildTurn({
      message: "normal chat"
    }, previous, "turn-2-normal");

    assert.deepEqual(turn2.summary.activeTracks, []);
    assert.equal(turn2.summary.staleCarrySuppressed, true);
    assert.ok(turn2.summary.staleTracks.includes("strategic"));
    assertAuthority(turn2.packet);
  });
});
