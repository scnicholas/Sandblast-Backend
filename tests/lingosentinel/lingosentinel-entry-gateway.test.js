"use strict";

/**
 * LingoSentinel Entry Gateway Test
 *
 * Purpose:
 * Tests the first gateway chain:
 * User input → language detection → normalization → Marion Bridge advisory payload.
 *
 * Critical hardening notes:
 * - Avoids Unicode symbols that can cause Windows/PowerShell encoding noise.
 * - Resolves multiple possible Marion Bridge export/call signatures.
 * - Keeps assertions focused on contract integrity, not exact response wording.
 */

const marionBridge = require("../../Data/marion/runtime/marionBridge");
const { detectLanguage } = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelLanguageDetect");
const { normalizeInput } = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelNormalizer");

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

function buildLingoSentinelGatewayPayload(rawInput) {
  const normalization = normalizeInput(rawInput);
  const languageMeta = detectLanguage(normalization.normalizedText);

  return {
    message: normalization.normalizedText,
    originalInput: normalization.originalText,
    languageMeta,
    lingoInput: normalization,
    gatewayMeta: {
      gateway: "LingoSentinel",
      phase: "entry-detection-normalization",
      advisoryOnly: true
    },
    authority: {
      finalAuthority: "Marion",
      lingoSentinelAdvisoryOnly: true,
      neverOverrideMarion: true
    }
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

describe("LingoSentinel Entry Gateway", () => {
  test("gateway creates advisory payload from English input", () => {
    const payload = buildLingoSentinelGatewayPayload("  Hello,   how are you today ?  ");

    expect(payload.message).toBe("Hello, how are you today?");
    expect(payload.originalInput).toBe("  Hello,   how are you today ?  ");
    expect(payload.languageMeta.detectedLanguage).toBe("en");
    expect(payload.languageMeta.supported).toBe(true);
    expect(payload.languageMeta.requiresTranslation).toBe(false);
    expect(payload.gatewayMeta.advisoryOnly).toBe(true);
    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.authority.lingoSentinelAdvisoryOnly).toBe(true);
  });

  test("gateway creates advisory payload from French input", () => {
    const payload = buildLingoSentinelGatewayPayload("  Bonjour,   comment ca va ?  ");

    expect(payload.message).toBe("Bonjour, comment ca va?");
    expect(payload.originalInput).toBe("  Bonjour,   comment ca va ?  ");
    expect(payload.languageMeta.detectedLanguage).toBe("fr");
    expect(payload.languageMeta.supported).toBe(true);
    expect(payload.languageMeta.requiresTranslation).toBe(true);
    expect(payload.authority.neverOverrideMarion).toBe(true);
  });

  test("gateway creates advisory payload from Spanish input", () => {
    const payload = buildLingoSentinelGatewayPayload("  Hola,   como estas ?  ");

    expect(payload.message).toBe("Hola, como estas?");
    expect(payload.originalInput).toBe("  Hola,   como estas ?  ");
    expect(payload.languageMeta.detectedLanguage).toBe("es");
    expect(payload.languageMeta.supported).toBe(true);
    expect(payload.languageMeta.requiresTranslation).toBe(true);
  });

  test("gateway handles unknown input safely", () => {
    const payload = buildLingoSentinelGatewayPayload(" ??? ### ");

    expect(payload.message).toBe("??? ###");
    expect(payload.originalInput).toBe(" ??? ### ");
    expect(payload.languageMeta.detectedLanguage).toBe("unknown");
    expect(payload.languageMeta.supported).toBe(false);
    expect(payload.languageMeta.fallbackTriggered).toBe(true);
    expect(payload.authority.finalAuthority).toBe("Marion");
  });

  test("Marion Bridge accepts complete LingoSentinel gateway payload", async () => {
    const handler = resolveBridgeHandler(marionBridge);
    expect(typeof handler).toBe("function");

    const payload = buildLingoSentinelGatewayPayload("  Bonjour,   comment ca va ?  ");
    const result = await invokeBridge(handler, payload);

    expect(result).toBeDefined();
    expectNoRuntimeErrorText(result);
  });

  test("Marion Bridge accepts unknown-language gateway payload without crashing", async () => {
    const handler = resolveBridgeHandler(marionBridge);
    expect(typeof handler).toBe("function");

    const payload = buildLingoSentinelGatewayPayload(" ??? ### ");
    const result = await invokeBridge(handler, payload);

    expect(result).toBeDefined();
    expectNoRuntimeErrorText(result);
  });
});
