"use strict";

/**
 * LingoLink Gateway Alert Integration Test
 *
 * Purpose:
 * Confirms LingoLinkGateway carries unknown-language alert metadata
 * inside the Marion-safe gateway package.
 *
 * This protects:
 * - unknownLanguageAlert presence
 * - notificationReady behavior
 * - alertTriggered behavior
 * - crypto-safe correlation/hash fields
 * - Marion final authority
 * - LingoLink advisory-only contract
 */

const {
  runLingoLinkGateway,
  buildMarionBridgePayload
} = require("../../Data/marion/runtime/LingoLinkGateway");

function safeSerialize(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return `SERIALIZE_ERROR:${error && error.message ? error.message : String(error)}`;
  }
}

function assertMarionAuthority(packet) {
  expect(packet).toBeDefined();
  expect(packet.authority).toBeDefined();

  expect(packet.authority.finalAuthority).toBe("Marion");
  expect(packet.authority.lingoLinkAdvisoryOnly).toBe(true);
  expect(packet.authority.neverOverrideMarion).toBe(true);

  expect(packet.marionAuthority).toBe(true);
  expect(packet.finalAuthority).toBe("Marion");
}

function assertGatewayBase(packet) {
  expect(packet).toBeDefined();

  expect(packet.languageMeta).toBeDefined();
  expect(packet.lingoInput).toBeDefined();
  expect(packet.translationMeta).toBeDefined();
  expect(packet.glossaryMeta).toBeDefined();
  expect(packet.glossaryIntegrity).toBeDefined();
  expect(packet.gatewayMeta).toBeDefined();
  expect(packet.telemetry).toBeDefined();

  expect(packet.gatewayMeta.gateway).toBe("LingoLink");
  expect(packet.gatewayMeta.advisoryOnly).toBe(true);

  expect(packet.translationMeta.advisoryOnly).toBe(true);
  expect(packet.translationMeta.forceTranslation).toBe(false);

  expect(packet.translationMeta.safeToRender).toBe(true);
  expect(packet.translationMeta.renderSafe).toBe(true);

  assertMarionAuthority(packet);
}

function assertAlertCarry(packet) {
  expect(packet.unknownLanguageAlert).toBeDefined();
  expect(typeof packet.unknownLanguageAlert).toBe("object");

  expect(packet.unknownLanguageAlert.alertType).toBe("unknown_language_pattern");
  expect(packet.unknownLanguageAlert.authority).toBeDefined();
  expect(packet.unknownLanguageAlert.authority.finalAuthority).toBe("Marion");
  expect(packet.unknownLanguageAlert.authority.lingoLinkAdvisoryOnly).toBe(true);
  expect(packet.unknownLanguageAlert.authority.neverOverrideMarion).toBe(true);

  expect(packet.unknownLanguageAlert.advisoryOnly).toBe(true);
  expect(packet.unknownLanguageAlert.forceTranslation).toBe(false);

  /**
   * Alerts are metadata only.
   * They should not become public reply text.
   */
  expect(typeof packet.unknownLanguageAlert.text).toBe("string");
  expect(typeof packet.unknownLanguageAlert.renderText).toBe("string");
  expect(typeof packet.unknownLanguageAlert.publicText).toBe("string");

  expect(packet.unknownLanguageAlert.userFacing).toBe(false);
}

function assertJsonSafe(packet) {
  const serialized = safeSerialize(packet);

  expect(serialized).not.toContain("SERIALIZE_ERROR");
  expect(serialized).not.toContain("TypeError");
  expect(serialized).not.toContain("ReferenceError");
  expect(serialized).not.toContain("undefined undefined");
  expect(serialized).not.toContain("null null");
}

describe("LingoLink Gateway Alert Integration", () => {
  test("gateway carries unknownLanguageAlert for English without triggering notification", () => {
    const result = runLingoLinkGateway("Hello, how are you today?");

    assertGatewayBase(result);
    assertAlertCarry(result);
    assertJsonSafe(result);

    expect(result.languageMeta.detectedLanguage).toBe("en");
    expect(result.languageMeta.supported).toBe(true);

    expect(result.unknownLanguageAlert.alertTriggered).toBe(false);
    expect(result.unknownLanguageAlert.notificationReady).toBe(false);

    expect(result.gatewayMeta.alertTriggered).toBe(false);
    expect(result.gatewayMeta.notificationReady).toBe(false);
  });

  test("gateway carries unknownLanguageAlert for French without triggering notification", () => {
    const result = runLingoLinkGateway("Bonjour, comment ca va?");

    assertGatewayBase(result);
    assertAlertCarry(result);
    assertJsonSafe(result);

    expect(result.languageMeta.detectedLanguage).toBe("fr");
    expect(result.languageMeta.supported).toBe(true);
    expect(result.languageMeta.requiresTranslation).toBe(true);

    expect(result.translationMeta.translated).toBe(true);
    expect(result.translationMeta.renderText).toBe("hello, how are you?");

    expect(result.unknownLanguageAlert.alertTriggered).toBe(false);
    expect(result.unknownLanguageAlert.notificationReady).toBe(false);

    expect(result.gatewayMeta.alertTriggered).toBe(false);
    expect(result.gatewayMeta.notificationReady).toBe(false);
  });

  test("gateway carries unknownLanguageAlert for Spanish without triggering notification", () => {
    const result = runLingoLinkGateway("Hola, como estas?");

    assertGatewayBase(result);
    assertAlertCarry(result);
    assertJsonSafe(result);

    expect(result.languageMeta.detectedLanguage).toBe("es");
    expect(result.languageMeta.supported).toBe(true);
    expect(result.languageMeta.requiresTranslation).toBe(true);

    expect(result.translationMeta.translated).toBe(true);
    expect(result.translationMeta.publicText).toBe("hello, how are you?");

    expect(result.unknownLanguageAlert.alertTriggered).toBe(false);
    expect(result.unknownLanguageAlert.notificationReady).toBe(false);

    expect(result.gatewayMeta.alertTriggered).toBe(false);
    expect(result.gatewayMeta.notificationReady).toBe(false);
  });

  test("gateway triggers unknownLanguageAlert for unknown input", () => {
    const result = runLingoLinkGateway("??? ###");

    assertGatewayBase(result);
    assertAlertCarry(result);
    assertJsonSafe(result);

    expect(result.languageMeta.detectedLanguage).toBe("unknown");
    expect(result.languageMeta.supported).toBe(false);
    expect(result.languageMeta.fallbackTriggered).toBe(true);

    expect(result.translationMeta.translated).toBe(false);
    expect(result.translationMeta.fallbackTriggered).toBe(true);

    expect(result.unknownLanguageAlert.alertTriggered).toBe(true);
    expect(result.unknownLanguageAlert.notificationReady).toBe(true);
    expect(result.unknownLanguageAlert.detectedLanguage).toBe("unknown");
    expect(result.unknownLanguageAlert.severity).toBeTruthy();

    expect(result.gatewayMeta.alertTriggered).toBe(true);
    expect(result.gatewayMeta.notificationReady).toBe(true);
    expect(result.gatewayMeta.fallbackTriggered).toBe(true);
  });

  test("gateway alert metadata remains non-user-facing", () => {
    const result = runLingoLinkGateway("??? ###");

    assertAlertCarry(result);

    expect(result.unknownLanguageAlert.userFacing).toBe(false);
    expect(result.unknownLanguageAlert.publicText).toBe("");
    expect(result.unknownLanguageAlert.renderText).toBe("");
    expect(result.unknownLanguageAlert.text).toBe("");

    expect(result.message).toBe("??? ###");
    expect(result.input).toBe("??? ###");
  });

  test("gateway includes stable crypto-safe correlation fields when available", () => {
    const result = runLingoLinkGateway("Bonjour, comment ca va?");

    assertGatewayBase(result);
    assertJsonSafe(result);

    /**
     * The patched gateway should expose correlation/hash identifiers
     * without relying on browser crypto or randomUUID.
     */
    expect(result.gatewayMeta).toBeDefined();

    const serialized = safeSerialize(result.gatewayMeta);

    expect(serialized).not.toContain("crypto is not defined");
    expect(serialized).not.toContain("randomUUID is not a function");
    expect(serialized).not.toContain("ReferenceError");

    /**
     * Be tolerant about exact field names while still enforcing that
     * the gateway metadata is serializable and stable.
     */
    const hasCorrelationLikeField =
      Object.prototype.hasOwnProperty.call(result.gatewayMeta, "correlationId") ||
      Object.prototype.hasOwnProperty.call(result.gatewayMeta, "gatewayHash") ||
      Object.prototype.hasOwnProperty.call(result.gatewayMeta, "inputHash") ||
      Object.prototype.hasOwnProperty.call(result.gatewayMeta, "stableHash") ||
      Object.prototype.hasOwnProperty.call(result.gatewayMeta, "traceId");

    expect(hasCorrelationLikeField).toBe(true);
  });

  test("Marion Bridge payload carries unknownLanguageAlert safely", () => {
    const payload = buildMarionBridgePayload("??? ###");

    expect(payload).toBeDefined();

    expect(payload.unknownLanguageAlert).toBeDefined();
    expect(payload.unknownLanguageAlert.alertTriggered).toBe(true);
    expect(payload.unknownLanguageAlert.notificationReady).toBe(true);

    expect(payload.gatewayMeta.alertTriggered).toBe(true);
    expect(payload.gatewayMeta.notificationReady).toBe(true);

    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.authority.lingoLinkAdvisoryOnly).toBe(true);
    expect(payload.marionAuthority).toBe(true);
    expect(payload.finalAuthority).toBe("Marion");

    assertJsonSafe(payload);
  });

  test("Marion Bridge payload does not trigger alert for supported languages", () => {
    const cases = [
      {
        input: "Hello, how are you today?",
        expectedLanguage: "en"
      },
      {
        input: "Bonjour, comment ca va?",
        expectedLanguage: "fr"
      },
      {
        input: "Hola, como estas?",
        expectedLanguage: "es"
      }
    ];

    for (const item of cases) {
      const payload = buildMarionBridgePayload(item.input);

      expect(payload.languageMeta.detectedLanguage).toBe(item.expectedLanguage);

      expect(payload.unknownLanguageAlert).toBeDefined();
      expect(payload.unknownLanguageAlert.alertTriggered).toBe(false);
      expect(payload.unknownLanguageAlert.notificationReady).toBe(false);

      expect(payload.gatewayMeta.alertTriggered).toBe(false);
      expect(payload.gatewayMeta.notificationReady).toBe(false);

      expect(payload.authority.finalAuthority).toBe("Marion");
      expect(payload.authority.neverOverrideMarion).toBe(true);

      assertJsonSafe(payload);
    }
  });
});
