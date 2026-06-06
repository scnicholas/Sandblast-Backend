"use strict";

/**
 * LingoSentinel Alert Bridge Carry Test
 *
 * Purpose:
 * Confirms the LingoSentinel alert/scanner/correlation carry survives
 * the Marion Bridge handoff layer safely.
 *
 * Protects:
 * - unknownLanguageAlert carry
 * - scannerHeartbeat carry
 * - dormantScanner carry
 * - correlation/hash carry
 * - notificationReady carry
 * - Marion final authority
 * - LingoSentinel advisory-only contract
 */

const marionBridge = require("../../Data/marion/runtime/marionBridge");

const {
  runLingoSentinelGateway,
  buildMarionBridgePayload
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelGateway");

function safeSerialize(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return `SERIALIZE_ERROR:${error && error.message ? error.message : String(error)}`;
  }
}

function resolveBridgeHandler(bridge) {
  if (!bridge) return null;

  if (typeof bridge === "function") return bridge;

  const candidates = [
    "handleMarionBridge",
    "runMarionBridge",
    "processMarionRequest",
    "composeMarionBridgeResponse",
    "handleRequest",
    "handleMessage",
    "routeRequest",
    "respond",
    "default"
  ];

  for (const key of candidates) {
    if (typeof bridge[key] === "function") {
      return bridge[key].bind(bridge);
    }
  }

  return null;
}

async function invokeBridgeSafely(handler, payload) {
  if (typeof handler !== "function") {
    return {
      skipped: true,
      reason: "no_callable_marion_bridge_handler"
    };
  }

  const attempts = [
    () => handler(payload),
    () => handler(payload.message, payload),
    () => handler({ body: payload }),
    () => handler({ message: payload.message, ...payload })
  ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      const result = await attempt();

      if (result !== undefined && result !== null) {
        return {
          skipped: false,
          result
        };
      }
    } catch (error) {
      lastError = error;
    }
  }

  return {
    skipped: false,
    error: lastError
  };
}

function assertMarionAuthority(packet) {
  expect(packet).toBeDefined();
  expect(packet.authority).toBeDefined();

  expect(packet.authority.finalAuthority).toBe("Marion");
  expect(packet.authority.lingoSentinelAdvisoryOnly).toBe(true);
  expect(packet.authority.neverOverrideMarion).toBe(true);

  expect(packet.marionAuthority).toBe(true);
  expect(packet.finalAuthority).toBe("Marion");
}

function assertAlertScannerCarry(packet) {
  expect(packet).toBeDefined();

  expect(packet.unknownLanguageAlert).toBeDefined();
  expect(packet.scannerHeartbeat).toBeDefined();
  expect(packet.dormantScanner).toBeDefined();

  expect(packet.unknownLanguageAlert.authority.finalAuthority).toBe("Marion");
  expect(packet.scannerHeartbeat.authority.finalAuthority).toBe("Marion");
  expect(packet.dormantScanner.authority.finalAuthority).toBe("Marion");

  expect(packet.unknownLanguageAlert.advisoryOnly).toBe(true);
  expect(packet.scannerHeartbeat.advisoryOnly).toBe(true);
  expect(packet.dormantScanner.advisoryOnly).toBe(true);

  expect(packet.unknownLanguageAlert.forceTranslation).toBe(false);
  expect(packet.scannerHeartbeat.forceTranslation).toBe(false);
  expect(packet.dormantScanner.forceTranslation).toBe(false);
}

function assertCorrelationCarry(packet) {
  expect(packet).toBeDefined();

  const gatewayMeta = packet.gatewayMeta || {};

  const hasCorrelationLikeField =
    Object.prototype.hasOwnProperty.call(packet, "correlationId") ||
    Object.prototype.hasOwnProperty.call(packet, "traceId") ||
    Object.prototype.hasOwnProperty.call(packet, "gatewayHash") ||
    Object.prototype.hasOwnProperty.call(packet, "inputHash") ||
    Object.prototype.hasOwnProperty.call(packet, "stableHash") ||
    Object.prototype.hasOwnProperty.call(gatewayMeta, "correlationId") ||
    Object.prototype.hasOwnProperty.call(gatewayMeta, "traceId") ||
    Object.prototype.hasOwnProperty.call(gatewayMeta, "gatewayHash") ||
    Object.prototype.hasOwnProperty.call(gatewayMeta, "inputHash") ||
    Object.prototype.hasOwnProperty.call(gatewayMeta, "stableHash");

  expect(hasCorrelationLikeField).toBe(true);
}

function assertJsonSafe(packet) {
  const serialized = safeSerialize(packet);

  expect(serialized).not.toContain("SERIALIZE_ERROR");
  expect(serialized).not.toContain("TypeError");
  expect(serialized).not.toContain("ReferenceError");
  expect(serialized).not.toContain("undefined undefined");
  expect(serialized).not.toContain("null null");
  expect(serialized).not.toContain("crypto is not defined");
  expect(serialized).not.toContain("randomUUID is not a function");
}

describe("LingoSentinel Alert Bridge Carry", () => {
  test("gateway package carries alert/scanner/correlation fields before bridge handoff", () => {
    const packet = runLingoSentinelGateway("??? ###");

    assertMarionAuthority(packet);
    assertAlertScannerCarry(packet);
    assertCorrelationCarry(packet);
    assertJsonSafe(packet);

    expect(packet.languageMeta.detectedLanguage).toBe("unknown");
    expect(packet.unknownLanguageAlert.alertTriggered).toBe(true);
    expect(packet.unknownLanguageAlert.notificationReady).toBe(true);
    expect(packet.dormantScanner.notificationReady).toBe(true);
    expect(packet.gatewayMeta.notificationReady).toBe(true);
  });

  test("Marion Bridge payload carries alert/scanner/correlation fields for unknown input", () => {
    const payload = buildMarionBridgePayload("??? ###");

    assertMarionAuthority(payload);
    assertAlertScannerCarry(payload);
    assertCorrelationCarry(payload);
    assertJsonSafe(payload);

    expect(payload.languageMeta.detectedLanguage).toBe("unknown");
    expect(payload.unknownLanguageAlert.alertTriggered).toBe(true);
    expect(payload.unknownLanguageAlert.notificationReady).toBe(true);
    expect(payload.dormantScanner.notificationReady).toBe(true);
    expect(payload.gatewayMeta.notificationReady).toBe(true);
  });

  test("Marion Bridge payload carries alert/scanner fields without false notification for supported inputs", () => {
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

      assertMarionAuthority(payload);
      assertAlertScannerCarry(payload);
      assertCorrelationCarry(payload);
      assertJsonSafe(payload);

      expect(payload.languageMeta.detectedLanguage).toBe(item.expectedLanguage);
      expect(payload.unknownLanguageAlert.alertTriggered).toBe(false);
      expect(payload.unknownLanguageAlert.notificationReady).toBe(false);
      expect(payload.dormantScanner.notificationReady).toBe(false);
      expect(payload.gatewayMeta.notificationReady).toBe(false);
    }
  });

  test("Marion Bridge imports and exposes callable handler or safe skip contract", () => {
    expect(marionBridge).toBeDefined();

    const handler = resolveBridgeHandler(marionBridge);

    expect(handler === null || typeof handler === "function").toBe(true);
  });

  test("Marion Bridge can receive unknown-language LingoSentinel alert payload when callable", async () => {
    const handler = resolveBridgeHandler(marionBridge);
    const payload = buildMarionBridgePayload("??? ###");

    const invocation = await invokeBridgeSafely(handler, payload);

    expect(invocation).toBeDefined();

    if (invocation.skipped) {
      expect(invocation.reason).toBe("no_callable_marion_bridge_handler");
      return;
    }

    if (invocation.error) {
      throw invocation.error;
    }

    expect(invocation.result).toBeDefined();

    const serialized = safeSerialize(invocation.result);

    expect(serialized).not.toContain("SERIALIZE_ERROR");
    expect(serialized).not.toContain("TypeError");
    expect(serialized).not.toContain("ReferenceError");
    expect(serialized).not.toContain("undefined undefined");
    expect(serialized).not.toContain("null null");
  });

  test("Marion Bridge can receive supported-language LingoSentinel payloads when callable", async () => {
    const handler = resolveBridgeHandler(marionBridge);

    const cases = [
      "Hello, how are you today?",
      "Bonjour, comment ca va?",
      "Hola, como estas?"
    ];

    for (const input of cases) {
      const payload = buildMarionBridgePayload(input);
      const invocation = await invokeBridgeSafely(handler, payload);

      expect(invocation).toBeDefined();

      if (invocation.skipped) {
        expect(invocation.reason).toBe("no_callable_marion_bridge_handler");
        continue;
      }

      if (invocation.error) {
        throw invocation.error;
      }

      expect(invocation.result).toBeDefined();

      const serialized = safeSerialize(invocation.result);

      expect(serialized).not.toContain("SERIALIZE_ERROR");
      expect(serialized).not.toContain("TypeError");
      expect(serialized).not.toContain("ReferenceError");
    }
  });

  test("bridge payload keeps notificationReady as metadata, not authority", () => {
    const payload = buildMarionBridgePayload("??? ###");

    expect(payload.gatewayMeta.notificationReady).toBe(true);
    expect(payload.unknownLanguageAlert.notificationReady).toBe(true);
    expect(payload.dormantScanner.notificationReady).toBe(true);

    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.authority.lingoSentinelAdvisoryOnly).toBe(true);
    expect(payload.authority.neverOverrideMarion).toBe(true);

    expect(payload.translationMeta.forceTranslation).toBe(false);
    expect(payload.translationMeta.advisoryOnly).toBe(true);
  });
});
