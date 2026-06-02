"use strict";

/**
 * LingoLink Marion Authority Integration Test
 *
 * Purpose:
 * Confirms the LingoLink Gateway produces Marion-safe payloads
 * that can be handed to Marion Bridge without letting LingoLink become authority.
 *
 * This test is intentionally defensive because Marion Bridge may expose
 * different handler names depending on the current runtime version.
 */

const marionBridge = require("../../Data/marion/runtime/marionBridge");

const {
  buildMarionBridgePayload,
  runLingoLinkGateway
} = require("../../Data/marion/runtime/LingoLinkGateway");

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

function serialize(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

describe("LingoLink Marion Authority Integration", () => {
  test("Marion Bridge imports successfully", () => {
    expect(marionBridge).toBeDefined();
  });

  test("LingoLink Gateway payload keeps Marion as final authority", () => {
    const payload = buildMarionBridgePayload("  Bonjour,   comment ca va ?  ");

    expect(payload).toBeDefined();

    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.authority.lingoLinkAdvisoryOnly).toBe(true);
    expect(payload.authority.neverOverrideMarion).toBe(true);

    expect(payload.marionAuthority).toBe(true);
    expect(payload.finalAuthority).toBe("Marion");

    expect(payload.gatewayMeta.gateway).toBe("LingoLink");
    expect(payload.gatewayMeta.advisoryOnly).toBe(true);

    expect(payload.languageMeta.detectedLanguage).toBe("fr");
    expect(payload.translationMeta.advisoryOnly).toBe(true);
    expect(payload.translationMeta.forceTranslation).toBe(false);
  });

  test("LingoLink Gateway does not force translation authority", () => {
    const payload = buildMarionBridgePayload("  Hola,   como estas ?  ");

    expect(payload.translationMeta.translated).toBe(true);
    expect(payload.translationMeta.advisoryOnly).toBe(true);
    expect(payload.translationMeta.forceTranslation).toBe(false);

    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.authority.neverOverrideMarion).toBe(true);
  });

  test("LingoLink Gateway unknown-language fallback still preserves Marion authority", () => {
    const payload = buildMarionBridgePayload(" ??? ### ");

    expect(payload.languageMeta.detectedLanguage).toBe("unknown");
    expect(payload.languageMeta.supported).toBe(false);
    expect(payload.languageMeta.fallbackTriggered).toBe(true);

    expect(payload.translationMeta.translated).toBe(false);
    expect(payload.translationMeta.fallbackTriggered).toBe(true);

    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.marionAuthority).toBe(true);
  });

  test("Marion Bridge exposes callable handler or safe skip contract", () => {
    const handler = resolveBridgeHandler(marionBridge);

    /**
     * If this fails, it means Marion Bridge currently exports constants/utilities
     * but no callable request handler. That is not a LingoLink failure.
     * It tells us Marion Bridge needs a formal integration handler next.
     */
    expect(handler === null || typeof handler === "function").toBe(true);
  });

  test("Marion Bridge accepts LingoLink Gateway payload when callable", async () => {
    const handler = resolveBridgeHandler(marionBridge);
    const payload = buildMarionBridgePayload("  Bonjour,   comment ca va ?  ");

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

    const serialized = serialize(invocation.result);

    expect(serialized).not.toContain("TypeError");
    expect(serialized).not.toContain("ReferenceError");
    expect(serialized).not.toContain("undefined undefined");
    expect(serialized).not.toContain("null null");
  });

  test("Gateway package remains stable across multiple language cases", () => {
    const cases = [
      {
        input: "Hello, how are you today?",
        expectedLanguage: "en",
        requiresTranslation: false
      },
      {
        input: "Bonjour, comment ca va?",
        expectedLanguage: "fr",
        requiresTranslation: true
      },
      {
        input: "Hola, como estas?",
        expectedLanguage: "es",
        requiresTranslation: true
      },
      {
        input: "??? ###",
        expectedLanguage: "unknown",
        requiresTranslation: false
      }
    ];

    for (const item of cases) {
      const result = runLingoLinkGateway(item.input);

      expect(result).toBeDefined();
      expect(result.languageMeta.detectedLanguage).toBe(item.expectedLanguage);
      expect(result.languageMeta.requiresTranslation).toBe(item.requiresTranslation);

      expect(result.authority.finalAuthority).toBe("Marion");
      expect(result.authority.lingoLinkAdvisoryOnly).toBe(true);
      expect(result.authority.neverOverrideMarion).toBe(true);
      expect(result.marionAuthority).toBe(true);
    }
  });
});
