"use strict";

/**
 * LingoLink Entry Gateway Test
 *
 * Purpose:
 * Tests the first complete gateway chain:
 *
 * User input
 * → LingoLink language detection
 * → LingoLink normalization
 * → Marion Bridge receives advisory metadata
 *
 * This does not test full translation.
 * This does not allow LingoLink to override Marion.
 */

const marionBridge = require("../../Data/marion/runtime/marionBridge");

const {
  detectLanguage
} = require("../../Data/marion/runtime/LingoLinkLanguageDetect");

const {
  normalizeInput
} = require("../../Data/marion/runtime/LingoLinkNormalizer");

function resolveBridgeHandler(bridge) {
  if (!bridge) return null;

  if (typeof bridge === "function") return bridge;
  if (typeof bridge.handleMarionBridge === "function") return bridge.handleMarionBridge;
  if (typeof bridge.runMarionBridge === "function") return bridge.runMarionBridge;
  if (typeof bridge.processMarionRequest === "function") return bridge.processMarionRequest;
  if (typeof bridge.composeMarionBridgeResponse === "function") return bridge.composeMarionBridgeResponse;
  if (typeof bridge.handleRequest === "function") return bridge.handleRequest;
  if (typeof bridge.default === "function") return bridge.default;

  return null;
}

function buildLingoLinkGatewayPayload(rawInput) {
  const normalization = normalizeInput(rawInput);
  const languageMeta = detectLanguage(normalization.normalizedText);

  return {
    message: normalization.normalizedText,
    originalInput: normalization.originalText,
    languageMeta,
    lingoInput: normalization,
    gatewayMeta: {
      gateway: "LingoLink",
      phase: "entry-detection-normalization",
      advisoryOnly: true
    },
    authority: {
      finalAuthority: "Marion",
      lingoLinkAdvisoryOnly: true,
      neverOverrideMarion: true
    }
  };
}

function serialize(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

describe("LingoLink Entry Gateway", () => {
  test("gateway creates advisory payload from English input", () => {
    const payload = buildLingoLinkGatewayPayload("  Hello,   how are you today ?  ");

    expect(payload.message).toBe("Hello, how are you today?");
    expect(payload.originalInput).toBe("  Hello,   how are you today ?  ");
    expect(payload.languageMeta.detectedLanguage).toBe("en");
    expect(payload.languageMeta.supported).toBe(true);
    expect(payload.languageMeta.requiresTranslation).toBe(false);
    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.authority.lingoLinkAdvisoryOnly).toBe(true);
  });

  test("gateway creates advisory payload from French input", () => {
    const payload = buildLingoLinkGatewayPayload("  Bonjour,   comment ça va ?  ");

    expect(payload.message).toBe("Bonjour, comment ça va?");
    expect(payload.originalInput).toBe("  Bonjour,   comment ça va ?  ");
    expect(payload.languageMeta.detectedLanguage).toBe("fr");
    expect(payload.languageMeta.supported).toBe(true);
    expect(payload.languageMeta.requiresTranslation).toBe(true);
    expect(payload.authority.neverOverrideMarion).toBe(true);
  });

  test("gateway creates advisory payload from Spanish input", () => {
    const payload = buildLingoLinkGatewayPayload("  Hola,   cómo estás ?  ");

    expect(payload.message).toBe("Hola, cómo estás?");
    expect(payload.originalInput).toBe("  Hola,   cómo estás ?  ");
    expect(payload.languageMeta.detectedLanguage).toBe("es");
    expect(payload.languageMeta.supported).toBe(true);
    expect(payload.languageMeta.requiresTranslation).toBe(true);
  });

  test("gateway handles unknown input safely", () => {
    const payload = buildLingoLinkGatewayPayload(" ∆∆∆ ??? ### ");

    expect(payload.message).toBe("∆∆∆ ??? ###");
    expect(payload.originalInput).toBe(" ∆∆∆ ??? ### ");
    expect(payload.languageMeta.detectedLanguage).toBe("unknown");
    expect(payload.languageMeta.supported).toBe(false);
    expect(payload.languageMeta.fallbackTriggered).toBe(true);
    expect(payload.authority.finalAuthority).toBe("Marion");
  });

  test("Marion Bridge accepts complete LingoLink gateway payload", async () => {
    const handler = resolveBridgeHandler(marionBridge);

    expect(typeof handler).toBe("function");

    const payload = buildLingoLinkGatewayPayload("  Bonjour,   comment ça va ?  ");
    const result = await handler(payload);

    expect(result).toBeDefined();

    const serialized = serialize(result);

    expect(serialized).toContain("Marion");
    expect(serialized).not.toContain("TypeError");
    expect(serialized).not.toContain("ReferenceError");
  });

  test("Marion Bridge accepts unknown-language gateway payload without crashing", async () => {
    const handler = resolveBridgeHandler(marionBridge);

    expect(typeof handler).toBe("function");

    const payload = buildLingoLinkGatewayPayload(" ∆∆∆ ??? ### ");
    const result = await handler(payload);

    expect(result).toBeDefined();

    const serialized = serialize(result);

    expect(serialized).not.toContain("TypeError");
    expect(serialized).not.toContain("ReferenceError");
  });
});
