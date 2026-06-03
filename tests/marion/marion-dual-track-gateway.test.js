"use strict";

const {
  buildMarionDualTrackPacket,
  summarizeDualTrackPacket,
  extractLanguageTrack,
  extractRealWorldTrack,
  extractEthicalTrack,
  DUAL_TRACK_GATEWAY_VERSION
} = require("../../Data/marion/runtime/MarionDualTrackGateway");

const {
  buildMarionBridgePayload
} = require("../../Data/marion/runtime/LingoLinkGateway");

function assertAuthority(packet) {
  expect(packet.authority.finalAuthority).toBe("Marion");
  expect(packet.authority.lingoLinkAdvisoryOnly).toBe(true);
  expect(packet.authority.realWorldAdvisoryOnly).toBe(true);
  expect(packet.authority.ethicalAdvisoryOnly).toBe(true);
  expect(packet.authority.neverOverrideMarion).toBe(true);
  expect(packet.marionAuthority).toBe(true);
  expect(packet.finalAuthority).toBe("Marion");
}

function assertInternalOnly(packet) {
  expect(packet.userFacing).toBe(false);
  expect(packet.publicText).toBe("");
  expect(packet.renderText).toBe("");
  expect(packet.text).toBe("");
}

describe("Marion Dual-Track Gateway", () => {
  test("exports expected functions", () => {
    expect(typeof buildMarionDualTrackPacket).toBe("function");
    expect(typeof summarizeDualTrackPacket).toBe("function");
    expect(typeof extractLanguageTrack).toBe("function");
    expect(typeof extractRealWorldTrack).toBe("function");
    expect(typeof extractEthicalTrack).toBe("function");
  });

  test("builds language-only dual-track packet", () => {
    const lingoPayload = buildMarionBridgePayload("Bonjour, comment ca va?");
    const packet = buildMarionDualTrackPacket(lingoPayload);

    expect(packet.version).toBe(DUAL_TRACK_GATEWAY_VERSION);
    expect(packet.languageTrack.active).toBe(true);
    expect(packet.realWorldTrack.active).toBe(false);
    expect(packet.ethicalTrack.active).toBe(false);
    expect(packet.coordinationMeta.activeTracks).toContain("language");
    expect(packet.coordinationMeta.mixedInput).toBe(false);
    assertAuthority(packet);
    assertInternalOnly(packet);
  });

  test("builds real-world-only dual-track packet", () => {
    const packet = buildMarionDualTrackPacket({
      observation: {
        observationSummary: "Burned grass detected in one patch.",
        permissionStatus: "allowed",
        confidence: 0.72,
        riskLevel: "low"
      }
    });

    expect(packet.languageTrack.active).toBe(false);
    expect(packet.realWorldTrack.active).toBe(true);
    expect(packet.realWorldTrack.envelope.permissionAllowed).toBe(true);
    expect(packet.coordinationMeta.activeTracks).toContain("real_world");
    assertAuthority(packet);
    assertInternalOnly(packet);
  });

  test("builds combined language plus real-world packet", () => {
    const lingoPayload = buildMarionBridgePayload("Hola, como estas?");

    const packet = buildMarionDualTrackPacket({
      ...lingoPayload,
      observation: {
        observationSummary: "Localized smoke visible near a wall.",
        permissionStatus: "allowed",
        confidence: 0.76,
        riskLevel: "high"
      }
    });

    expect(packet.languageTrack.active).toBe(true);
    expect(packet.realWorldTrack.active).toBe(true);
    expect(packet.coordinationMeta.mixedInput).toBe(true);
    expect(packet.coordinationMeta.requiresHumanReview).toBe(true);
    expect(packet.coordinationMeta.notificationReady).toBe(true);
    assertAuthority(packet);
    assertInternalOnly(packet);
  });

  test("unknown language alert can coexist with real-world context", () => {
    const lingoPayload = buildMarionBridgePayload("??? ###");

    const packet = buildMarionDualTrackPacket({
      ...lingoPayload,
      observation: {
        observationSummary: "Grass appears burned or chemically damaged.",
        permissionStatus: "allowed",
        confidence: 0.64,
        riskLevel: "medium"
      }
    });

    expect(packet.languageTrack.active).toBe(true);
    expect(packet.realWorldTrack.active).toBe(true);
    expect(packet.languageTrack.unknownLanguageAlert.alertTriggered).toBe(true);
    expect(packet.coordinationMeta.notificationReady).toBe(true);
    assertAuthority(packet);
  });

  test("blocked real-world context does not override Marion", () => {
    const packet = buildMarionDualTrackPacket({
      observation: {
        observationSummary: "Identify this person using face recognition.",
        permissionStatus: "allowed",
        confidence: 0.9,
        riskLevel: "medium"
      }
    });

    expect(packet.realWorldTrack.active).toBe(true);
    expect(packet.realWorldTrack.blocked).toBe(true);
    expect(packet.realWorldTrack.requiresHumanReview).toBe(true);
    expect(packet.authority.finalAuthority).toBe("Marion");
    expect(packet.advisoryOnly).toBe(true);
    expect(packet.forceAction).toBe(false);
  });

  test("summary remains compact", () => {
    const packet = buildMarionDualTrackPacket({
      message: "Hello",
      observation: {
        observationSummary: "Clear environment.",
        permissionStatus: "allowed",
        confidence: 0.9,
        riskLevel: "low"
      }
    });

    const summary = summarizeDualTrackPacket(packet);

    expect(summary.version).toBe(DUAL_TRACK_GATEWAY_VERSION);
    expect(summary.activeTracks).toContain("language");
    expect(summary.activeTracks).toContain("real_world");
    expect(summary.mixedInput).toBe(true);
    expect(summary.authority.finalAuthority).toBe("Marion");
  });

  test("disabled gateway remains Marion-safe", () => {
    const packet = buildMarionDualTrackPacket("Hello", {
      config: {
        enabled: false
      }
    });

    expect(packet.enabled).toBe(false);
    expect(packet.coordinationMeta.reason).toBe("dual_track_gateway_disabled");
    expect(packet.authority.finalAuthority).toBe("Marion");
    expect(packet.marionAuthority).toBe(true);
  });
});
