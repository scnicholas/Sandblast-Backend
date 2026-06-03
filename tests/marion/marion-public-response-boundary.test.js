"use strict";

/**
 * Marion Public Response Boundary Test
 *
 * Purpose:
 * Ensures internal Marion/LingoLink/real-world/Thalon metadata never becomes
 * public-facing reply text.
 */

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

const {
  buildMarionCoordinationTelemetry
} = require("../../Data/marion/runtime/MarionCoordinationTelemetry");

const INTERNAL_LEAK_PATTERNS = Object.freeze([
  /\blanguageMeta\b/i,
  /\blingoInput\b/i,
  /\btranslationMeta\b/i,
  /\bglossaryMeta\b/i,
  /\bgatewayMeta\b/i,
  /\bunknownLanguageAlert\b/i,
  /\bscannerHeartbeat\b/i,
  /\bdormantScanner\b/i,
  /\bnotificationReady\b/i,
  /\brealWorldTrack\b/i,
  /\brealWorldEnvelope\b/i,
  /\bobservationSummary\b/i,
  /\bethicalGate\b/i,
  /\bethicalGatekeeper\b/i,
  /\briskClassification\b/i,
  /\briskClassifier\b/i,
  /\bthalonReadiness\b/i,
  /\bThalonReadinessStub\b/i,
  /\bcoordinationTelemetry\b/i,
  /\bMarionCoordinationTelemetry\b/i,
  /\bfinalEnvelope\b/i,
  /\bruntimeTelemetry\b/i,
  /\bmarionAuthority\b/i,
  /\bfinalAuthority\b/i,
  /\badvisoryOnly\b/i,
  /\bneverOverrideMarion\b/i,
  /\bcorrelationId\b/i,
  /\btraceId\b/i,
  /\binputHash\b/i,
  /\bgatewayHash\b/i,
  /\bstableHash\b/i,
  /\bMARION::FINAL::/i,
  /\bnyx\.marion\./i,
  /\bTypeError\b/i,
  /\bReferenceError\b/i,
  /\bundefined undefined\b/i,
  /\bnull null\b/i
]);

function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function hasInternalLeak(value) {
  const text = cleanText(value);
  if (!text) return false;
  return INTERNAL_LEAK_PATTERNS.some((rx) => rx.test(text));
}

function assertNoPublicLeak(value) {
  expect(hasInternalLeak(value)).toBe(false);
}

function assertInternalPacketPublicFieldsClean(packet) {
  assertNoPublicLeak(packet.text);
  assertNoPublicLeak(packet.renderText);
  assertNoPublicLeak(packet.publicText);
  assertNoPublicLeak(packet.message);
  assertNoPublicLeak(packet.input);
  assertNoPublicLeak(packet.originalInput);
}

describe("Marion Public Response Boundary", () => {
  test("leak detector catches internal fields", () => {
    expect(hasInternalLeak("languageMeta translationMeta gatewayMeta")).toBe(true);
    expect(hasInternalLeak("unknownLanguageAlert scannerHeartbeat dormantScanner")).toBe(true);
    expect(hasInternalLeak("realWorldTrack ethicalGate riskClassification thalonReadiness")).toBe(true);
    expect(hasInternalLeak("Hello, this is a clean response.")).toBe(false);
  });

  test("LingoLink bridge payload text fields stay clean", () => {
    const payload = buildMarionBridgePayload("Bonjour, comment ca va?");

    assertNoPublicLeak(payload.message);
    assertNoPublicLeak(payload.input);
    assertNoPublicLeak(payload.originalInput);
    assertNoPublicLeak(payload.translationMeta.text);
    assertNoPublicLeak(payload.translationMeta.renderText);
    assertNoPublicLeak(payload.translationMeta.publicText);
    assertNoPublicLeak(payload.translationMeta.finalText);

    expect(payload.authority.finalAuthority).toBe("Marion");
  });

  test("unknown-language alert fields stay internal", () => {
    const payload = buildMarionBridgePayload("??? ###");

    expect(payload.unknownLanguageAlert.alertTriggered).toBe(true);
    expect(payload.unknownLanguageAlert.userFacing).toBe(false);

    assertNoPublicLeak(payload.message);
    assertNoPublicLeak(payload.input);
    assertNoPublicLeak(payload.originalInput);
    assertNoPublicLeak(payload.unknownLanguageAlert.text);
    assertNoPublicLeak(payload.unknownLanguageAlert.renderText);
    assertNoPublicLeak(payload.unknownLanguageAlert.publicText);
  });

  test("dual-track packet public fields remain clean", () => {
    const lingo = buildMarionBridgePayload("Hola, como estas?");

    const dual = buildMarionDualTrackPacket({
      ...lingo,
      observation: {
        observationSummary: "Smoke indoors near a hallway.",
        permissionStatus: "allowed",
        confidence: 0.82,
        riskLevel: "high"
      }
    });

    expect(dual.userFacing).toBe(false);
    expect(dual.coordinationMeta.publicReplyVisible).toBe(false);

    assertInternalPacketPublicFieldsClean(dual);
    expect(dual.authority.finalAuthority).toBe("Marion");
  });

  test("ethical gatekeeper public fields remain clean", () => {
    const ethicalGate = evaluateEthicalGate({
      observationSummary: "Identify this person using face recognition.",
      confidence: 0.9,
      riskLevel: "medium"
    });

    expect(ethicalGate.blocked).toBe(true);
    expect(ethicalGate.userFacing).toBe(false);

    assertNoPublicLeak(ethicalGate.text);
    assertNoPublicLeak(ethicalGate.renderText);
    assertNoPublicLeak(ethicalGate.publicText);
    expect(ethicalGate.authority.finalAuthority).toBe("Marion");
  });

  test("risk classifier public fields remain clean", () => {
    const risk = classifyRiskLevel({
      observationSummary: "Smoke indoors near a hallway.",
      confidence: 0.82
    });

    expect(risk.riskLevel).toBe("high");
    expect(risk.userFacing).toBe(false);

    assertNoPublicLeak(risk.text);
    assertNoPublicLeak(risk.renderText);
    assertNoPublicLeak(risk.publicText);
    expect(risk.authority.finalAuthority).toBe("Marion");
  });

  test("Thalon readiness public fields remain clean", () => {
    const thalon = buildThalonReadinessPacket({
      ethicalGate: {
        ethicalConcernLevel: "medium",
        requiresHumanReview: true
      }
    });

    expect(thalon.thalonReady).toBe(true);
    expect(thalon.userFacing).toBe(false);

    assertNoPublicLeak(thalon.text);
    assertNoPublicLeak(thalon.renderText);
    assertNoPublicLeak(thalon.publicText);
    expect(thalon.authority.finalAuthority).toBe("Marion");
  });

  test("coordination telemetry public fields remain clean", () => {
    const lingo = buildMarionBridgePayload("??? ###");
    const telemetry = buildMarionCoordinationTelemetry(lingo);

    expect(telemetry.userFacing).toBe(false);
    expect(telemetry.publicReplyVisible).toBe(false);

    assertNoPublicLeak(telemetry.text);
    assertNoPublicLeak(telemetry.renderText);
    assertNoPublicLeak(telemetry.publicText);
    expect(telemetry.authority.finalAuthority).toBe("Marion");
  });

  test("combined packet transport can contain metadata but public fields stay clean", () => {
    const lingo = buildMarionBridgePayload("??? ###");
    const dual = buildMarionDualTrackPacket({
      ...lingo,
      observation: {
        observationSummary: "Burned grass detected in a localized patch.",
        permissionStatus: "allowed",
        confidence: 0.72,
        riskLevel: "medium"
      }
    });

    const ethicalGate = evaluateEthicalGate({
      observationSummary: "Burned grass detected in a localized patch.",
      confidence: 0.72,
      riskLevel: "medium"
    });

    const riskClassification = classifyRiskLevel({
      observationSummary: "Burned grass detected in a localized patch.",
      confidence: 0.72
    });

    const thalonReadiness = buildThalonReadinessPacket({
      ethicalGate,
      riskClassification
    });

    const telemetry = buildMarionCoordinationTelemetry({
      ...dual,
      ethicalGate,
      riskClassification,
      thalonReadiness
    });

    const transport = JSON.stringify({
      dual,
      ethicalGate,
      riskClassification,
      thalonReadiness,
      telemetry
    });

    expect(transport).toContain("languageTrack");
    expect(transport).toContain("realWorldTrack");
    expect(transport).toContain("thalonReadiness");

    assertInternalPacketPublicFieldsClean(dual);
    assertNoPublicLeak(ethicalGate.text);
    assertNoPublicLeak(riskClassification.text);
    assertNoPublicLeak(thalonReadiness.text);
    assertNoPublicLeak(telemetry.text);
  });
});
