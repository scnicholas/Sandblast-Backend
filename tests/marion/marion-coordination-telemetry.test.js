"use strict";

const {
  buildMarionCoordinationTelemetry,
  summarizeCoordinationTelemetry,
  buildLaneSummary,
  extractCoordinationIds,
  detectLingoLinkActive,
  detectUnknownLanguageAlertActive,
  detectDormantScannerActive,
  detectRealWorldContextActive,
  detectEthicalGatekeeperActive,
  detectRiskClassifierActive,
  detectThalonReviewRecommended,
  MARION_COORDINATION_TELEMETRY_VERSION
} = require("../../Data/marion/runtime/MarionCoordinationTelemetry");

const {
  buildMarionBridgePayload
} = require("../../Data/marion/runtime/LingoLinkGateway");

const {
  buildMarionDualTrackPacket
} = require("../../Data/marion/runtime/MarionDualTrackGateway");

const {
  evaluateEthicalGate
} = require("../../Data/marion/runtime/MarionEthicalGatekeeper");

const {
  classifyRiskLevel
} = require("../../Data/marion/runtime/MarionRealWorldRiskClassifier");

const {
  buildThalonReadinessPacket
} = require("../../Data/marion/runtime/ThalonReadinessStub");

function assertAuthority(packet) {
  expect(packet.authority.finalAuthority).toBe("Marion");
  expect(packet.authority.coordinationTelemetryAdvisoryOnly).toBe(true);
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

describe("Marion Coordination Telemetry", () => {
  test("exports expected functions", () => {
    expect(typeof buildMarionCoordinationTelemetry).toBe("function");
    expect(typeof summarizeCoordinationTelemetry).toBe("function");
    expect(typeof buildLaneSummary).toBe("function");
    expect(typeof extractCoordinationIds).toBe("function");
    expect(typeof detectLingoLinkActive).toBe("function");
    expect(typeof detectUnknownLanguageAlertActive).toBe("function");
    expect(typeof detectDormantScannerActive).toBe("function");
    expect(typeof detectRealWorldContextActive).toBe("function");
    expect(typeof detectEthicalGatekeeperActive).toBe("function");
    expect(typeof detectRiskClassifierActive).toBe("function");
    expect(typeof detectThalonReviewRecommended).toBe("function");
  });

  test("builds telemetry for language-only LingoLink payload", () => {
    const payload = buildMarionBridgePayload("Bonjour, comment ca va?");
    const telemetry = buildMarionCoordinationTelemetry(payload);

    expect(telemetry.version).toBe(MARION_COORDINATION_TELEMETRY_VERSION);
    expect(telemetry.lingoLinkActive).toBe(true);
    expect(telemetry.unknownLanguageAlertActive).toBe(false);
    expect(telemetry.dormantScannerActive).toBe(true);
    expect(telemetry.realWorldContextActive).toBe(false);
    expect(telemetry.activeLanes).toContain("lingolink");
    expect(telemetry.activeLanes).toContain("dormant_scanner");
    expect(telemetry.marionFinalAuthorityPreserved).toBe(true);
    assertAuthority(telemetry);
    assertInternalOnly(telemetry);
  });

  test("builds telemetry for unknown-language alert", () => {
    const payload = buildMarionBridgePayload("??? ###");
    const telemetry = buildMarionCoordinationTelemetry(payload);

    expect(telemetry.lingoLinkActive).toBe(true);
    expect(telemetry.unknownLanguageAlertActive).toBe(true);
    expect(telemetry.dormantScannerActive).toBe(true);
    expect(telemetry.notificationReady).toBe(true);
    expect(telemetry.activeLanes).toContain("unknown_language_alert");
    expect(telemetry.laneSummary.unknownLanguageAlert.alertTriggered).toBe(true);
    assertAuthority(telemetry);
  });

  test("builds telemetry for real-world dual-track packet", () => {
    const dual = buildMarionDualTrackPacket({
      message: "Hola, como estas?",
      observation: {
        observationSummary: "Smoke indoors near a hallway.",
        permissionStatus: "allowed",
        confidence: 0.82,
        riskLevel: "high"
      }
    });

    const telemetry = buildMarionCoordinationTelemetry(dual);

    expect(telemetry.lingoLinkActive).toBe(true);
    expect(telemetry.realWorldContextActive).toBe(true);
    expect(telemetry.notificationReady).toBe(true);
    expect(telemetry.requiresHumanReview).toBe(true);
    expect(telemetry.activeLanes).toContain("real_world_context");
    assertAuthority(telemetry);
    assertInternalOnly(telemetry);
  });

  test("builds telemetry with ethical gate, risk classifier, and Thalon readiness", () => {
    const ethicalGate = evaluateEthicalGate({
      observationSummary: "Smoke indoors near a hallway.",
      confidence: 0.78,
      riskLevel: "high"
    });

    const riskClassification = classifyRiskLevel({
      observationSummary: "Smoke indoors near a hallway.",
      confidence: 0.78
    });

    const thalonReadiness = buildThalonReadinessPacket({
      ethicalGate,
      riskClassification
    });

    const telemetry = buildMarionCoordinationTelemetry({
      ethicalGate,
      riskClassification,
      thalonReadiness
    });

    expect(telemetry.ethicalGatekeeperActive).toBe(true);
    expect(telemetry.riskClassifierActive).toBe(true);
    expect(telemetry.thalonReviewRecommended).toBe(true);
    expect(telemetry.requiresHumanReview).toBe(true);
    expect(telemetry.activeLanes).toContain("ethical_gatekeeper");
    expect(telemetry.activeLanes).toContain("risk_classifier");
    expect(telemetry.activeLanes).toContain("thalon_review");
    assertAuthority(telemetry);
  });

  test("extracts coordination IDs from gateway payload", () => {
    const payload = buildMarionBridgePayload("Bonjour, comment ca va?");
    const ids = extractCoordinationIds(payload);

    expect(ids).toBeDefined();

    const hasAnyId =
      Boolean(ids.correlationId) ||
      Boolean(ids.traceId) ||
      Boolean(ids.inputHash) ||
      Boolean(ids.gatewayHash) ||
      Boolean(ids.stableHash);

    expect(hasAnyId).toBe(true);
  });

  test("summary remains compact and Marion-safe", () => {
    const payload = buildMarionBridgePayload("??? ###");
    const telemetry = buildMarionCoordinationTelemetry(payload);
    const summary = summarizeCoordinationTelemetry(telemetry);

    expect(summary.version).toBe(MARION_COORDINATION_TELEMETRY_VERSION);
    expect(summary.notificationReady).toBe(true);
    expect(summary.marionFinalAuthorityPreserved).toBe(true);
    expect(summary.publicReplyVisible).toBe(false);
    expect(summary.userFacing).toBe(false);
    expect(summary.authority.finalAuthority).toBe("Marion");
  });

  test("disabled telemetry remains safe", () => {
    const telemetry = buildMarionCoordinationTelemetry(
      buildMarionBridgePayload("Hello"),
      {
        config: {
          enabled: false
        }
      }
    );

    expect(telemetry.enabled).toBe(false);
    expect(telemetry.lingoLinkActive).toBe(false);
    expect(telemetry.marionFinalAuthorityPreserved).toBe(true);
    assertAuthority(telemetry);
  });

  test("JSON output remains safe", () => {
    const payload = buildMarionBridgePayload("??? ###");
    const telemetry = buildMarionCoordinationTelemetry(payload);

    const serialized = JSON.stringify(telemetry);

    expect(serialized).not.toContain("TypeError");
    expect(serialized).not.toContain("ReferenceError");
    expect(serialized).not.toContain("undefined undefined");
    expect(serialized).not.toContain("null null");
    expect(serialized).not.toContain("crypto is not defined");
  });
});
