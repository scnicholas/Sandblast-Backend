"use strict";

/**
 * LingoLink ⇄ Marion Bridge Contract Test
 *
 * Purpose:
 * Ensures Marion Bridge can accept future LingoLink metadata
 * without surrendering Marion's final authority or breaking the response envelope.
 */

const marionBridge = require("../../Data/marion/runtime/marionBridge");

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

function serialize(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

describe("LingoLink Marion Bridge Contract", () => {
  test("marionBridge imports successfully", () => {
    expect(marionBridge).toBeDefined();
  });

  test("marionBridge exposes a callable bridge handler", () => {
    const handler = resolveBridgeHandler(marionBridge);
    expect(typeof handler).toBe("function");
  });

  test("marionBridge accepts LingoLink language metadata without requiring translation metadata", async () => {
    const handler = resolveBridgeHandler(marionBridge);

    const input = {
      message: "Bonjour, comment ça va?",
      originalInput: "Bonjour, comment ça va?",
      languageMeta: {
        detectedLanguage: "fr",
        confidence: 0.91,
        supported: true,
        requiresTranslation: true,
        fallbackTriggered: false,
        reason: "language_detected",
        source: "LingoLinkLanguageDetect"
      },
      lingoInput: {
        originalText: "Bonjour, comment ça va?",
        normalizedText: "Bonjour, comment ça va?",
        changed: false,
        operations: [],
        source: "LingoLinkNormalizer"
      },
      authority: {
        finalAuthority: "Marion",
        lingoLinkAdvisoryOnly: true
      }
    };

    const result = await handler(input);

    expect(result).toBeDefined();

    const serialized = serialize(result);

    expect(serialized).toContain("Marion");
    expect(serialized).not.toContain("TypeError");
    expect(serialized).not.toContain("ReferenceError");
  });

  test("marionBridge preserves stable behavior with normalized Spanish input", async () => {
    const handler = resolveBridgeHandler(marionBridge);

    const originalInput = "  Hola,   cómo estás ? ";

    const input = {
      message: "Hola, cómo estás?",
      originalInput,
      languageMeta: {
        detectedLanguage: "es",
        confidence: 0.9,
        supported: true,
        requiresTranslation: true,
        fallbackTriggered: false,
        reason: "language_detected",
        source: "LingoLinkLanguageDetect"
      },
      lingoInput: {
        originalText: originalInput,
        normalizedText: "Hola, cómo estás?",
        changed: true,
        operations: ["trim", "collapse_spaces", "punctuation_spacing"],
        source: "LingoLinkNormalizer"
      },
      authority: {
        finalAuthority: "Marion",
        lingoLinkAdvisoryOnly: true
      }
    };

    const result = await handler(input);

    expect(result).toBeDefined();

    const serialized = serialize(result);

    expect(serialized).not.toContain("TypeError");
    expect(serialized).not.toContain("ReferenceError");
    expect(serialized).not.toContain("undefined undefined");
    expect(serialized).not.toContain("null null");
  });

  test("marionBridge handles unknown language metadata safely", async () => {
    const handler = resolveBridgeHandler(marionBridge);

    const input = {
      message: "∆∆∆ ???",
      originalInput: "∆∆∆ ???",
      languageMeta: {
        detectedLanguage: "unknown",
        confidence: 0.12,
        supported: false,
        requiresTranslation: false,
        fallbackTriggered: true,
        reason: "low_confidence_or_ambiguous",
        source: "LingoLinkLanguageDetect"
      },
      lingoInput: {
        originalText: "∆∆∆ ???",
        normalizedText: "∆∆∆ ???",
        changed: false,
        operations: [],
        source: "LingoLinkNormalizer"
      },
      authority: {
        finalAuthority: "Marion",
        lingoLinkAdvisoryOnly: true
      }
    };

    const result = await handler(input);

    expect(result).toBeDefined();

    const serialized = serialize(result);

    expect(serialized).not.toContain("TypeError");
    expect(serialized).not.toContain("ReferenceError");
  });
});
