"use strict";

/**
 * LingoSentinel Gateway Orchestration Test
 *
 * Purpose:
 * Confirms LingoSentinelGateway orchestrates:
 * normalization → language detection → translation advisory → glossary guard
 *
 * This does not patch Marion Bridge yet.
 * This proves the LingoSentinel package is stable before integration.
 */

const {
  runLingoSentinelGateway,
  buildMarionBridgePayload,
  extractInput,
  mergeGatewayConfig,
  DEFAULT_GATEWAY_CONFIG
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelGateway");

describe("LingoSentinel Gateway Orchestration", () => {
  test("module exports gateway functions", () => {
    expect(typeof runLingoSentinelGateway).toBe("function");
    expect(typeof buildMarionBridgePayload).toBe("function");
    expect(typeof extractInput).toBe("function");
    expect(typeof mergeGatewayConfig).toBe("function");
    expect(DEFAULT_GATEWAY_CONFIG).toBeDefined();
  });

  test("extracts string payload directly", () => {
    expect(extractInput("Hello")).toBe("Hello");
  });

  test("extracts message from object payload", () => {
    expect(extractInput({ message: "Hello from message" })).toBe("Hello from message");
  });

  test("extracts fallback input fields from object payload", () => {
    expect(extractInput({ input: "Hello from input" })).toBe("Hello from input");
    expect(extractInput({ text: "Hello from text" })).toBe("Hello from text");
    expect(extractInput({ prompt: "Hello from prompt" })).toBe("Hello from prompt");
  });

  test("runs complete gateway for English input", () => {
    const result = runLingoSentinelGateway("  Hello,   how are you today ?  ");

    expect(result).toBeDefined();
    expect(result.enabled).toBe(true);

    expect(result.originalInput).toBe("  Hello,   how are you today ?  ");
    expect(result.message).toBe("Hello, how are you today?");

    expect(result.languageMeta.detectedLanguage).toBe("en");
    expect(result.languageMeta.supported).toBe(true);
    expect(result.languageMeta.requiresTranslation).toBe(false);

    expect(result.translationMeta.translated).toBe(false);
    expect(result.translationMeta.reason).toBe("translation_not_required");

    expect(result.gatewayMeta.gateway).toBe("LingoSentinel");
    expect(result.gatewayMeta.advisoryOnly).toBe(true);

    expect(result.authority.finalAuthority).toBe("Marion");
    expect(result.authority.lingoSentinelAdvisoryOnly).toBe(true);
    expect(result.authority.neverOverrideMarion).toBe(true);

    expect(result.marionAuthority).toBe(true);
    expect(result.finalAuthority).toBe("Marion");
  });

  test("runs complete gateway for French input", () => {
    const result = runLingoSentinelGateway("  Bonjour,   comment ca va ?  ");

    expect(result).toBeDefined();
    expect(result.originalInput).toBe("  Bonjour,   comment ca va ?  ");
    expect(result.message).toBe("Bonjour, comment ca va?");

    expect(result.languageMeta.detectedLanguage).toBe("fr");
    expect(result.languageMeta.supported).toBe(true);
    expect(result.languageMeta.requiresTranslation).toBe(true);

    expect(result.translationMeta.sourceLanguage).toBe("fr");
    expect(result.translationMeta.targetLanguage).toBe("en");
    expect(result.translationMeta.translated).toBe(true);
    expect(result.translationMeta.advisoryText).toBe("hello, how are you?");

    expect(result.glossaryMeta).toBeDefined();
    expect(result.gatewayMeta.fallbackTriggered).toBe(false);

    expect(result.authority.finalAuthority).toBe("Marion");
  });

  test("runs complete gateway for Spanish input", () => {
    const result = runLingoSentinelGateway("  Hola,   como estas ?  ");

    expect(result).toBeDefined();
    expect(result.message).toBe("Hola, como estas?");

    expect(result.languageMeta.detectedLanguage).toBe("es");
    expect(result.languageMeta.supported).toBe(true);
    expect(result.languageMeta.requiresTranslation).toBe(true);

    expect(result.translationMeta.sourceLanguage).toBe("es");
    expect(result.translationMeta.targetLanguage).toBe("en");
    expect(result.translationMeta.translated).toBe(true);
    expect(result.translationMeta.advisoryText).toBe("hello, how are you?");
  });

  test("handles unknown input safely", () => {
    const result = runLingoSentinelGateway(" ??? ### ");

    expect(result).toBeDefined();
    expect(result.originalInput).toBe(" ??? ### ");
    expect(result.message).toBe("??? ###");

    expect(result.languageMeta.detectedLanguage).toBe("unknown");
    expect(result.languageMeta.supported).toBe(false);
    expect(result.languageMeta.fallbackTriggered).toBe(true);

    expect(result.translationMeta.translated).toBe(false);
    expect(result.translationMeta.fallbackTriggered).toBe(true);

    expect(result.gatewayMeta.fallbackTriggered).toBe(true);
    expect(result.authority.finalAuthority).toBe("Marion");
    expect(result.marionAuthority).toBe(true);
  });

  test("preserves protected glossary terms in gateway output", () => {
    const result = runLingoSentinelGateway(
      "Bonjour, Marion utilise LingoSentinel."
    );

    expect(result).toBeDefined();
    expect(result.glossaryMeta).toBeDefined();

    expect(result.glossaryMeta.foundInOriginal).toContain("Marion");
    expect(result.glossaryMeta.foundInOriginal).toContain("LingoSentinel");

    expect(result.glossaryMeta.guardedText).toContain("Marion");
    expect(result.glossaryMeta.guardedText).toContain("LingoSentinel");

    expect(result.glossaryIntegrity.intact).toBe(true);
  });

  test("builds Marion Bridge payload from gateway package", () => {
    const payload = buildMarionBridgePayload("  Hola,   como estas ?  ");

    expect(payload).toBeDefined();

    expect(payload.message).toBe("Hola, como estas?");
    expect(payload.originalInput).toBe("  Hola,   como estas ?  ");

    expect(payload.languageMeta.detectedLanguage).toBe("es");
    expect(payload.translationMeta.advisoryText).toBe("hello, how are you?");
    expect(payload.gatewayMeta.gateway).toBe("LingoSentinel");

    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.marionAuthority).toBe(true);
    expect(payload.finalAuthority).toBe("Marion");
  });

  test("respects disabled gateway config", () => {
    const result = runLingoSentinelGateway("Bonjour", {
      config: {
        enabled: false
      }
    });

    expect(result.enabled).toBe(false);
    expect(result.gatewayMeta.enabled).toBe(false);
    expect(result.gatewayMeta.reason).toBe("lingosentinel_gateway_disabled");
    expect(result.authority.finalAuthority).toBe("Marion");
    expect(result.languageMeta.reason).toBe("lingosentinel_gateway_disabled");
  });

  test("merges config safely without losing authority defaults", () => {
    const config = mergeGatewayConfig({
      gateway: {
        version: "test"
      },
      authority: {
        custom: true
      }
    });

    expect(config.gateway.version).toBe("test");
    expect(config.authority.custom).toBe(true);
    expect(config.authority.finalAuthority).toBe("Marion");
    expect(config.authority.lingoSentinelAdvisoryOnly).toBe(true);
    expect(config.authority.neverOverrideMarion).toBe(true);
  });
});
