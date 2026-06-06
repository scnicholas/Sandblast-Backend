"use strict";

/**
 * LingoSentinel Marion Response Behavior Test
 *
 * Purpose:
 * Confirms Marion-facing LingoSentinel payloads preserve the correct behavioral contract:
 *
 * - LingoSentinel can provide advisory metadata.
 * - Marion remains final authority.
 * - Translation advisory does not become the final response authority.
 * - Unknown-language fallback does not trigger unsafe behavior.
 * - Glossary preservation remains available to Marion.
 *
 * This does not require a live backend server.
 */

const marionBridge = require("../../Data/marion/runtime/marionBridge");

const {
  runLingoSentinelGateway,
  buildMarionBridgePayload
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelGateway");

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

function safeSerialize(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return `SERIALIZE_ERROR:${error && error.message ? error.message : String(error)}`;
  }
}

function assertMarionAuthority(payload) {
  expect(payload).toBeDefined();

  expect(payload.authority).toBeDefined();
  expect(payload.authority.finalAuthority).toBe("Marion");
  expect(payload.authority.lingoSentinelAdvisoryOnly).toBe(true);
  expect(payload.authority.neverOverrideMarion).toBe(true);

  expect(payload.marionAuthority).toBe(true);
  expect(payload.finalAuthority).toBe("Marion");
}

function assertLingoSentinelAdvisory(payload) {
  expect(payload.languageMeta).toBeDefined();
  expect(payload.lingoInput).toBeDefined();
  expect(payload.translationMeta).toBeDefined();
  expect(payload.glossaryMeta).toBeDefined();
  expect(payload.gatewayMeta).toBeDefined();

  expect(payload.gatewayMeta.gateway).toBe("LingoSentinel");
  expect(payload.gatewayMeta.advisoryOnly).toBe(true);

  expect(payload.translationMeta.advisoryOnly).toBe(true);
  expect(payload.translationMeta.forceTranslation).toBe(false);

  expect(payload.translationMeta.safeToRender).toBe(true);
  expect(payload.translationMeta.renderSafe).toBe(true);
}

describe("LingoSentinel Marion Response Behavior", () => {
  test("LingoSentinel English payload preserves Marion authority", () => {
    const payload = buildMarionBridgePayload("Hello, how are you today?");

    assertMarionAuthority(payload);
    assertLingoSentinelAdvisory(payload);

    expect(payload.languageMeta.detectedLanguage).toBe("en");
    expect(payload.languageMeta.requiresTranslation).toBe(false);
    expect(payload.translationMeta.translated).toBe(false);
    expect(payload.translationMeta.reason).toBe("translation_not_required");
  });

  test("LingoSentinel French payload advises translation without taking authority", () => {
    const payload = buildMarionBridgePayload("Bonjour, comment ca va?");

    assertMarionAuthority(payload);
    assertLingoSentinelAdvisory(payload);

    expect(payload.languageMeta.detectedLanguage).toBe("fr");
    expect(payload.languageMeta.requiresTranslation).toBe(true);

    expect(payload.translationMeta.translated).toBe(true);
    expect(payload.translationMeta.advisoryText).toBe("hello, how are you?");
    expect(payload.translationMeta.text).toBe("hello, how are you?");
    expect(payload.translationMeta.finalText).toBe("hello, how are you?");

    expect(payload.translationMeta.advisoryOnly).toBe(true);
    expect(payload.translationMeta.forceTranslation).toBe(false);
  });

  test("LingoSentinel Spanish payload advises translation without taking authority", () => {
    const payload = buildMarionBridgePayload("Hola, como estas?");

    assertMarionAuthority(payload);
    assertLingoSentinelAdvisory(payload);

    expect(payload.languageMeta.detectedLanguage).toBe("es");
    expect(payload.languageMeta.requiresTranslation).toBe(true);

    expect(payload.translationMeta.translated).toBe(true);
    expect(payload.translationMeta.advisoryText).toBe("hello, how are you?");
    expect(payload.translationMeta.renderText).toBe("hello, how are you?");

    expect(payload.authority.finalAuthority).toBe("Marion");
  });

  test("LingoSentinel unknown-language fallback remains Marion-safe", () => {
    const payload = buildMarionBridgePayload("??? ###");

    assertMarionAuthority(payload);
    assertLingoSentinelAdvisory(payload);

    expect(payload.languageMeta.detectedLanguage).toBe("unknown");
    expect(payload.languageMeta.supported).toBe(false);
    expect(payload.languageMeta.fallbackTriggered).toBe(true);

    expect(payload.translationMeta.translated).toBe(false);
    expect(payload.translationMeta.fallbackTriggered).toBe(true);
    expect(payload.translationMeta.reason).toBe("unsupported_or_unknown_language");

    expect(payload.translationMeta.safeToRender).toBe(true);
    expect(payload.translationMeta.renderSafe).toBe(true);
  });

  test("LingoSentinel glossary preservation remains available to Marion", () => {
    const result = runLingoSentinelGateway("Bonjour, Marion utilise LingoSentinel.");

    expect(result).toBeDefined();

    assertMarionAuthority(result);
    assertLingoSentinelAdvisory(result);

    expect(result.glossaryMeta.foundInOriginal).toContain("Marion");
    expect(result.glossaryMeta.foundInOriginal).toContain("LingoSentinel");

    expect(result.glossaryMeta.guardedText).toContain("Marion");
    expect(result.glossaryMeta.guardedText).toContain("LingoSentinel");

    expect(result.glossaryIntegrity).toBeDefined();
    expect(result.glossaryIntegrity.intact).toBe(true);
  });

  test("Marion Bridge import remains stable", () => {
    expect(marionBridge).toBeDefined();

    const handler = resolveBridgeHandler(marionBridge);

    expect(handler === null || typeof handler === "function").toBe(true);
  });

  test("Marion Bridge can receive French LingoSentinel payload when callable", async () => {
    const handler = resolveBridgeHandler(marionBridge);
    const payload = buildMarionBridgePayload("Bonjour, comment ca va?");

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

  test("Marion Bridge can receive Spanish LingoSentinel payload when callable", async () => {
    const handler = resolveBridgeHandler(marionBridge);
    const payload = buildMarionBridgePayload("Hola, como estas?");

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
  });

  test("Marion-facing payload does not promote LingoSentinel to final authority", () => {
    const cases = [
      "Hello, how are you today?",
      "Bonjour, comment ca va?",
      "Hola, como estas?",
      "??? ###"
    ];

    for (const input of cases) {
      const payload = buildMarionBridgePayload(input);

      assertMarionAuthority(payload);
      assertLingoSentinelAdvisory(payload);

      expect(payload.finalAuthority).toBe("Marion");
      expect(payload.authority.finalAuthority).toBe("Marion");
      expect(payload.authority.lingoSentinelAdvisoryOnly).toBe(true);
      expect(payload.authority.neverOverrideMarion).toBe(true);
      expect(payload.translationMeta.forceTranslation).toBe(false);
    }
  });
});
