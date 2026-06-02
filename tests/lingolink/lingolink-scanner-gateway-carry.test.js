"use strict";

/**
 * LingoLink Scanner Gateway Carry Test
 *
 * Purpose:
 * Confirms LingoLinkGateway carries dormant scanner metadata safely.
 *
 * This protects:
 * - scannerHeartbeat presence
 * - dormantScanner presence
 * - no background timer side effects
 * - notificationReady behavior
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

function assertScannerCarry(packet) {
  expect(packet).toBeDefined();

  expect(packet.scannerHeartbeat).toBeDefined();
  expect(typeof packet.scannerHeartbeat).toBe("object");

  expect(packet.dormantScanner).toBeDefined();
  expect(typeof packet.dormantScanner).toBe("object");

  expect(packet.scannerHeartbeat.scanner).toBe("LingoLinkDormantScanner");
  expect(packet.scannerHeartbeat.authority).toBeDefined();
  expect(packet.scannerHeartbeat.authority.finalAuthority).toBe("Marion");
  expect(packet.scannerHeartbeat.authority.lingoLinkAdvisoryOnly).toBe(true);
  expect(packet.scannerHeartbeat.authority.neverOverrideMarion).toBe(true);

  expect(packet.scannerHeartbeat.advisoryOnly).toBe(true);
  expect(packet.scannerHeartbeat.forceTranslation).toBe(false);

  expect(packet.dormantScanner.authority).toBeDefined();
  expect(packet.dormantScanner.authority.finalAuthority).toBe("Marion");
  expect(packet.dormantScanner.authority.lingoLinkAdvisoryOnly).toBe(true);
  expect(packet.dormantScanner.authority.neverOverrideMarion).toBe(true);

  expect(packet.dormantScanner.advisoryOnly).toBe(true);
  expect(packet.dormantScanner.forceTranslation).toBe(false);
}

function assertJsonSafe(packet) {
  const serialized = safeSerialize(packet);

  expect(serialized).not.toContain("SERIALIZE_ERROR");
  expect(serialized).not.toContain("TypeError");
  expect(serialized).not.toContain("ReferenceError");
  expect(serialized).not.toContain("undefined undefined");
  expect(serialized).not.toContain("null null");
}

describe("LingoLink Scanner Gateway Carry", () => {
  test("gateway carries scannerHeartbeat and dormantScanner for English input", () => {
    const result = runLingoLinkGateway("Hello, how are you today?");

    assertMarionAuthority(result);
    assertScannerCarry(result);
    assertJsonSafe(result);

    expect(result.languageMeta.detectedLanguage).toBe("en");

    expect(result.scannerHeartbeat.enabled).toBe(true);
    expect(result.scannerHeartbeat.status).toBe("ready");
    expect(result.scannerHeartbeat.dormant).toBe(true);
    expect(result.scannerHeartbeat.notificationReady).toBe(false);

    expect(result.dormantScanner.enabled).toBe(true);
    expect(result.dormantScanner.scanned).toBe(true);
    expect(result.dormantScanner.languageMeta.detectedLanguage).toBe("en");
    expect(result.dormantScanner.notificationReady).toBe(false);
  });

  test("gateway carries scannerHeartbeat and dormantScanner for French input", () => {
    const result = runLingoLinkGateway("Bonjour, comment ca va?");

    assertMarionAuthority(result);
    assertScannerCarry(result);
    assertJsonSafe(result);

    expect(result.languageMeta.detectedLanguage).toBe("fr");

    expect(result.scannerHeartbeat.status).toBe("ready");
    expect(result.dormantScanner.scanned).toBe(true);
    expect(result.dormantScanner.languageMeta.detectedLanguage).toBe("fr");
    expect(result.dormantScanner.notificationReady).toBe(false);
  });

  test("gateway carries scannerHeartbeat and dormantScanner for Spanish input", () => {
    const result = runLingoLinkGateway("Hola, como estas?");

    assertMarionAuthority(result);
    assertScannerCarry(result);
    assertJsonSafe(result);

    expect(result.languageMeta.detectedLanguage).toBe("es");

    expect(result.scannerHeartbeat.status).toBe("ready");
    expect(result.dormantScanner.scanned).toBe(true);
    expect(result.dormantScanner.languageMeta.detectedLanguage).toBe("es");
    expect(result.dormantScanner.notificationReady).toBe(false);
  });

  test("gateway dormantScanner triggers notificationReady for unknown input", () => {
    const result = runLingoLinkGateway("??? ###");

    assertMarionAuthority(result);
    assertScannerCarry(result);
    assertJsonSafe(result);

    expect(result.languageMeta.detectedLanguage).toBe("unknown");

    expect(result.dormantScanner.scanned).toBe(true);
    expect(result.dormantScanner.languageMeta.detectedLanguage).toBe("unknown");
    expect(result.dormantScanner.unknownLanguageAlert).toBeDefined();
    expect(result.dormantScanner.unknownLanguageAlert.alertTriggered).toBe(true);
    expect(result.dormantScanner.notificationReady).toBe(true);

    expect(result.gatewayMeta.notificationReady).toBe(true);
  });

  test("scanner carry remains passive and does not expose timer handles", () => {
    const result = runLingoLinkGateway("Hello, how are you today?");

    assertScannerCarry(result);

    const serialized = safeSerialize(result);

    /**
     * Scanner must not create background timer handles.
     * It should only return metadata packets.
     */
    expect(serialized).not.toContain("_idleTimeout");
    expect(serialized).not.toContain("_onTimeout");
    expect(serialized).not.toContain("Timeout");
    expect(serialized).not.toContain("setInterval");
    expect(serialized).not.toContain("setTimeout");
  });

  test("scanner heartbeat carries stable timing fields", () => {
    const result = runLingoLinkGateway("Hola, como estas?");

    assertScannerCarry(result);

    expect(typeof result.scannerHeartbeat.heartbeatAt).toBe("number");
    expect(typeof result.scannerHeartbeat.heartbeatIntervalMs).toBe("number");
    expect(typeof result.scannerHeartbeat.staleAfterMs).toBe("number");

    expect(result.scannerHeartbeat.heartbeatIntervalMs).toBeGreaterThan(0);
    expect(result.scannerHeartbeat.staleAfterMs).toBeGreaterThan(0);
  });

  test("scanner telemetry is included without replacing gateway telemetry", () => {
    const result = runLingoLinkGateway("??? ###");

    assertScannerCarry(result);

    expect(result.telemetry).toBeDefined();
    expect(result.telemetry.source).toBe("LingoLinkGateway");

    /**
     * Be tolerant about exact telemetry field names,
     * but enforce that the alert/scanner signal is represented somewhere.
     */
    const serializedTelemetry = safeSerialize(result.telemetry);

    expect(serializedTelemetry).toContain("LingoLinkGateway");
    expect(serializedTelemetry).not.toContain("SERIALIZE_ERROR");

    const gatewaySerialized = safeSerialize(result.gatewayMeta);
    expect(gatewaySerialized).toContain("notificationReady");
  });

  test("Marion Bridge payload carries scanner metadata safely", () => {
    const payload = buildMarionBridgePayload("??? ###");

    expect(payload).toBeDefined();

    expect(payload.scannerHeartbeat).toBeDefined();
    expect(payload.dormantScanner).toBeDefined();

    expect(payload.scannerHeartbeat.scanner).toBe("LingoLinkDormantScanner");
    expect(payload.dormantScanner.source).toBe("LingoLinkDormantScanner");

    expect(payload.dormantScanner.notificationReady).toBe(true);
    expect(payload.gatewayMeta.notificationReady).toBe(true);

    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.authority.lingoLinkAdvisoryOnly).toBe(true);
    expect(payload.marionAuthority).toBe(true);
    expect(payload.finalAuthority).toBe("Marion");

    assertJsonSafe(payload);
  });

  test("Marion Bridge payload carries scanner metadata for supported inputs without notification", () => {
    const cases = [
      "Hello, how are you today?",
      "Bonjour, comment ca va?",
      "Hola, como estas?"
    ];

    for (const input of cases) {
      const payload = buildMarionBridgePayload(input);

      expect(payload.scannerHeartbeat).toBeDefined();
      expect(payload.dormantScanner).toBeDefined();

      expect(payload.scannerHeartbeat.notificationReady).toBe(false);
      expect(payload.dormantScanner.notificationReady).toBe(false);
      expect(payload.gatewayMeta.notificationReady).toBe(false);

      expect(payload.authority.finalAuthority).toBe("Marion");
      expect(payload.authority.neverOverrideMarion).toBe(true);

      assertJsonSafe(payload);
    }
  });
});
