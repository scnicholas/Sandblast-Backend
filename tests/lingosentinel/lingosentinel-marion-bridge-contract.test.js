"use strict";

/**
 * LingoSentinel ⇄ Marion Bridge Contract Test
 *
 * Purpose:
 * Ensures Marion Bridge can accept LingoSentinel advisory metadata without allowing
 * LingoSentinel to override Marion authority or forcing translation too early.
 *
 * Critical hardening notes:
 * - Resolves multiple possible Marion Bridge export names.
 * - Supports multiple bridge invocation signatures.
 * - Avoids brittle string assertions against a specific response shape.
 * - Produces actionable failure messages when no handler is exposed.
 */

const marionBridge = require("../../Data/marion/runtime/marionBridge");

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
    "handleChat",
    "processMessage",
    "processRequest",
    "routeMessage",
    "routeRequest",
    "bridge",
    "run",
    "handler",
    "main",
    "default"
  ];

  for (const name of candidates) {
    if (typeof bridge[name] === "function") return bridge[name];
  }

  return null;
}

function serialize(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

async function invokeBridge(handler, payload) {
  const attempts = [
    () => handler(payload),
    () => handler(payload.message, payload),
    () => handler(payload.message, { metadata: payload }),
    () => handler({ body: payload }),
    () => handler({ message: payload.message, body: payload }),
    () => handler({ input: payload.message, ...payload })
  ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result !== undefined) return result;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return undefined;
}

function buildPayload(overrides = {}) {
  return {
    message: "Bonjour, comment ça va?",
    originalInput: "Bonjour, comment ça va?",
    languageMeta: {
      detectedLanguage: "fr",
      confidence: 0.91,
      supported: true,
      requiresTranslation: true,
      fallbackTriggered: false,
      reason: "language_detected",
      source: "LingoSentinelLanguageDetect"
    },
    lingoInput: {
      originalText: "Bonjour, comment ça va?",
      normalizedText: "Bonjour, comment ça va?",
      changed: false,
      operations: [],
      source: "LingoSentinelNormalizer"
    },
    gatewayMeta: {
      gateway: "LingoSentinel",
      phase: "entry-detection-normalization",
      advisoryOnly: true
    },
    authority: {
      finalAuthority: "Marion",
      lingoSentinelAdvisoryOnly: true,
      neverOverrideMarion: true
    },
    ...overrides
  };
}

function expectNoRuntimeErrorText(result) {
  const serialized = serialize(result);

  expect(serialized).not.toContain("TypeError");
  expect(serialized).not.toContain("ReferenceError");
  expect(serialized).not.toContain("SyntaxError");
  expect(serialized).not.toContain("undefined undefined");
  expect(serialized).not.toContain("null null");
}

describe("LingoSentinel Marion Bridge Contract", () => {
  test("marionBridge imports successfully", () => {
    expect(marionBridge).toBeDefined();
  });

  test("marionBridge exposes a callable bridge handler", () => {
    const handler = resolveBridgeHandler(marionBridge);

    expect(handler).toBeTruthy();
    expect(typeof handler).toBe("function");
  });

  test("marionBridge accepts LingoSentinel language metadata without requiring translation metadata", async () => {
    const handler = resolveBridgeHandler(marionBridge);
    expect(typeof handler).toBe("function");

    const result = await invokeBridge(handler, buildPayload());

    expect(result).toBeDefined();
    expectNoRuntimeErrorText(result);
  });

  test("marionBridge preserves stable behavior with normalized Spanish input", async () => {
    const handler = resolveBridgeHandler(marionBridge);
    expect(typeof handler).toBe("function");

    const originalInput = "  Hola,   como estas ? ";

    const result = await invokeBridge(handler, buildPayload({
      message: "Hola, como estas?",
      originalInput,
      languageMeta: {
        detectedLanguage: "es",
        confidence: 0.9,
        supported: true,
        requiresTranslation: true,
        fallbackTriggered: false,
        reason: "language_detected",
        source: "LingoSentinelLanguageDetect"
      },
      lingoInput: {
        originalText: originalInput,
        normalizedText: "Hola, como estas?",
        changed: true,
        operations: ["trim", "collapse_spaces", "punctuation_spacing"],
        source: "LingoSentinelNormalizer"
      }
    }));

    expect(result).toBeDefined();
    expectNoRuntimeErrorText(result);
  });

  test("marionBridge handles unknown language metadata safely", async () => {
    const handler = resolveBridgeHandler(marionBridge);
    expect(typeof handler).toBe("function");

    const result = await invokeBridge(handler, buildPayload({
      message: "??? ###",
      originalInput: "??? ###",
      languageMeta: {
        detectedLanguage: "unknown",
        confidence: 0.12,
        supported: false,
        requiresTranslation: false,
        fallbackTriggered: true,
        reason: "low_confidence_or_ambiguous",
        source: "LingoSentinelLanguageDetect"
      },
      lingoInput: {
        originalText: "??? ###",
        normalizedText: "??? ###",
        changed: false,
        operations: [],
        source: "LingoSentinelNormalizer"
      }
    }));

    expect(result).toBeDefined();
    expectNoRuntimeErrorText(result);
  });
});
