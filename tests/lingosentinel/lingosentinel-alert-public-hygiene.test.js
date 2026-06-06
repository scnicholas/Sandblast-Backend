"use strict";

/**
 * LingoSentinel Alert Public Hygiene Test
 *
 * Purpose:
 * Ensures the new alert/scanner/correlation carry stays internal.
 *
 * Metadata can be transported through the runtime, but it must not leak into
 * public reply text.
 */

const {
  runLingoSentinelGateway,
  buildMarionBridgePayload
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelGateway");

const INTERNAL_ALERT_LEAK_PATTERNS = Object.freeze([
  /\bunknownLanguageAlert\b/i,
  /\bscannerHeartbeat\b/i,
  /\bdormantScanner\b/i,
  /\bnotificationReady\b/i,
  /\binputHash\b/i,
  /\bgatewayHash\b/i,
  /\bstableHash\b/i,
  /\bcorrelationId\b/i,
  /\btraceId\b/i,
  /\blanguageMeta\b/i,
  /\blingoInput\b/i,
  /\btranslationMeta\b/i,
  /\bglossaryMeta\b/i,
  /\bglossaryIntegrity\b/i,
  /\bgatewayMeta\b/i,
  /\bruntimeTelemetry\b/i,
  /\bfinalEnvelope\b/i,
  /\bfinalEnvelopeTrusted\b/i,
  /\breplyAuthority\b/i,
  /\bmarionAuthority\b/i,
  /\badvisoryOnly\b/i,
  /\bforceTranslation\b/i,
  /\bneverOverrideMarion\b/i,
  /\bLingoSentinelGateway\b/i,
  /\bLingoSentinelDormantScanner\b/i,
  /\bLingoSentinelUnknownLanguageAlert\b/i,
  /\bLingoSentinelTranslationAdvisor\b/i,
  /\bLingoSentinelLanguageDetect\b/i,
  /\bLingoSentinelNormalizer\b/i,
  /\bLingoSentinelGlossaryGuard\b/i,
  /\bMARION::FINAL::/i,
  /\bnyx\.marion\./i,
  /\bTypeError\b/i,
  /\bReferenceError\b/i,
  /\bundefined undefined\b/i,
  /\bnull null\b/i,
  /\bcrypto is not defined\b/i,
  /\brandomUUID is not a function\b/i
]);

function cleanPublicReply(value) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
}

function hasInternalAlertLeak(value) {
  const text = cleanPublicReply(value);

  if (!text) return false;

  return INTERNAL_ALERT_LEAK_PATTERNS.some((rx) => rx.test(text));
}

function assertNoPublicAlertLeak(value) {
  const text = cleanPublicReply(value);

  expect(text).toBeDefined();
  expect(hasInternalAlertLeak(text)).toBe(false);
}

function choosePotentialPublicReply(packet) {
  if (!packet || typeof packet !== "object") return "";

  return cleanPublicReply(
    packet.reply ||
      packet.publicReply ||
      packet.text ||
      packet.message ||
      packet.answer ||
      packet.finalReply ||
      packet.output ||
      ""
  );
}

describe("LingoSentinel Alert Public Hygiene", () => {
  test("leak detector catches alert/scanner/correlation internals", () => {
    expect(hasInternalAlertLeak("unknownLanguageAlert notificationReady")).toBe(true);
    expect(hasInternalAlertLeak("scannerHeartbeat dormantScanner")).toBe(true);
    expect(hasInternalAlertLeak("correlationId traceId gatewayHash")).toBe(true);
    expect(hasInternalAlertLeak("Hello, how are you?")).toBe(false);
  });

  test("gateway public-facing message remains clean for English input", () => {
    const packet = runLingoSentinelGateway("Hello, how are you today?");
    const publicReply = choosePotentialPublicReply(packet);

    assertNoPublicAlertLeak(publicReply);
    assertNoPublicAlertLeak(packet.message);
    assertNoPublicAlertLeak(packet.input);
    assertNoPublicAlertLeak(packet.originalInput);

    expect(packet.unknownLanguageAlert.alertTriggered).toBe(false);
    expect(packet.gatewayMeta.notificationReady).toBe(false);
    expect(packet.authority.finalAuthority).toBe("Marion");
  });

  test("gateway public-facing message remains clean for French input", () => {
    const packet = runLingoSentinelGateway("Bonjour, comment ca va?");
    const publicReply = choosePotentialPublicReply(packet);

    assertNoPublicAlertLeak(publicReply);
    assertNoPublicAlertLeak(packet.message);
    assertNoPublicAlertLeak(packet.input);
    assertNoPublicAlertLeak(packet.originalInput);

    expect(packet.languageMeta.detectedLanguage).toBe("fr");
    expect(packet.unknownLanguageAlert.alertTriggered).toBe(false);
    expect(packet.gatewayMeta.notificationReady).toBe(false);
    expect(packet.authority.finalAuthority).toBe("Marion");
  });

  test("gateway public-facing message remains clean for Spanish input", () => {
    const packet = runLingoSentinelGateway("Hola, como estas?");
    const publicReply = choosePotentialPublicReply(packet);

    assertNoPublicAlertLeak(publicReply);
    assertNoPublicAlertLeak(packet.message);
    assertNoPublicAlertLeak(packet.input);
    assertNoPublicAlertLeak(packet.originalInput);

    expect(packet.languageMeta.detectedLanguage).toBe("es");
    expect(packet.unknownLanguageAlert.alertTriggered).toBe(false);
    expect(packet.gatewayMeta.notificationReady).toBe(false);
    expect(packet.authority.finalAuthority).toBe("Marion");
  });

  test("gateway unknown-language public-facing message remains clean", () => {
    const packet = runLingoSentinelGateway("??? ###");
    const publicReply = choosePotentialPublicReply(packet);

    assertNoPublicAlertLeak(publicReply);
    assertNoPublicAlertLeak(packet.message);
    assertNoPublicAlertLeak(packet.input);
    assertNoPublicAlertLeak(packet.originalInput);

    expect(packet.languageMeta.detectedLanguage).toBe("unknown");
    expect(packet.unknownLanguageAlert.alertTriggered).toBe(true);
    expect(packet.gatewayMeta.notificationReady).toBe(true);

    expect(packet.unknownLanguageAlert.text).toBe("");
    expect(packet.unknownLanguageAlert.renderText).toBe("");
    expect(packet.unknownLanguageAlert.publicText).toBe("");
    expect(packet.unknownLanguageAlert.userFacing).toBe(false);
  });

  test("Marion Bridge payload carries alert metadata without putting it into text handoff fields", () => {
    const payload = buildMarionBridgePayload("??? ###");

    expect(payload.unknownLanguageAlert).toBeDefined();
    expect(payload.scannerHeartbeat).toBeDefined();
    expect(payload.dormantScanner).toBeDefined();

    assertNoPublicAlertLeak(payload.message);
    assertNoPublicAlertLeak(payload.input);
    assertNoPublicAlertLeak(payload.originalInput);

    expect(payload.unknownLanguageAlert.alertTriggered).toBe(true);
    expect(payload.gatewayMeta.notificationReady).toBe(true);
    expect(payload.authority.finalAuthority).toBe("Marion");
  });

  test("render-safe translation fields remain clean while alert metadata exists", () => {
    const payload = buildMarionBridgePayload("Bonjour, comment ca va?");

    expect(payload.translationMeta).toBeDefined();
    expect(payload.unknownLanguageAlert).toBeDefined();
    expect(payload.scannerHeartbeat).toBeDefined();
    expect(payload.dormantScanner).toBeDefined();

    assertNoPublicAlertLeak(payload.translationMeta.text);
    assertNoPublicAlertLeak(payload.translationMeta.renderText);
    assertNoPublicAlertLeak(payload.translationMeta.publicText);
    assertNoPublicAlertLeak(payload.translationMeta.finalText);

    expect(payload.translationMeta.text).toBe("hello, how are you?");
    expect(payload.translationMeta.renderSafe).toBe(true);
    expect(payload.translationMeta.safeToRender).toBe(true);
  });

  test("alert/scanner/correlation metadata remains JSON transport only", () => {
    const payload = buildMarionBridgePayload("??? ###");

    const serialized = JSON.stringify(payload);

    expect(serialized).toContain("unknownLanguageAlert");
    expect(serialized).toContain("scannerHeartbeat");
    expect(serialized).toContain("dormantScanner");

    /**
     * Serialized transport can contain metadata, but the public text fields cannot.
     */
    assertNoPublicAlertLeak(payload.message);
    assertNoPublicAlertLeak(payload.input);
    assertNoPublicAlertLeak(payload.originalInput);
    assertNoPublicAlertLeak(payload.unknownLanguageAlert.text);
    assertNoPublicAlertLeak(payload.unknownLanguageAlert.renderText);
    assertNoPublicAlertLeak(payload.unknownLanguageAlert.publicText);
  });

  test("public hygiene holds across standard cases", () => {
    const cases = [
      "Hello, how are you today?",
      "Bonjour, comment ca va?",
      "Bonjour, comment ça va?",
      "Hola, como estas?",
      "Hola, cómo estás?",
      "??? ###"
    ];

    for (const input of cases) {
      const payload = buildMarionBridgePayload(input);

      assertNoPublicAlertLeak(payload.message);
      assertNoPublicAlertLeak(payload.input);
      assertNoPublicAlertLeak(payload.originalInput);

      expect(payload.authority.finalAuthority).toBe("Marion");
      expect(payload.authority.lingoSentinelAdvisoryOnly).toBe(true);
      expect(payload.authority.neverOverrideMarion).toBe(true);
    }
  });
});
