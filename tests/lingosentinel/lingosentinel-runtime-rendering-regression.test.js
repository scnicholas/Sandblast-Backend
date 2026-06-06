"use strict";

/**
 * LingoSentinel Runtime Rendering Regression Test
 *
 * Purpose:
 * Protects the backend rendering path after the LingoSentinel Translation Advisor fix.
 *
 * This test confirms:
 * - Translation Advisor always returns render-safe text aliases.
 * - Gateway output remains JSON-safe.
 * - French/Spanish/unknown inputs do not create backend rendering crashes.
 * - LingoSentinel remains advisory.
 * - Marion remains final authority.
 */

const {
  adviseTranslation,
  buildTranslationAdvisory,
  runTranslationAdvisor
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelTranslationAdvisor");

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

function assertRenderSafeAdvisorResult(result) {
  expect(result).toBeDefined();

  expect(typeof result).toBe("object");

  /**
   * These are the key backend rendering aliases.
   * If one renderer expects "text" and another expects "publicText",
   * the advisor should not crash either path.
   */
  expect(typeof result.text).toBe("string");
  expect(typeof result.renderText).toBe("string");
  expect(typeof result.publicText).toBe("string");
  expect(typeof result.finalText).toBe("string");

  expect(result.safeToRender).toBe(true);
  expect(result.renderSafe).toBe(true);

  expect(result.advisoryOnly).toBe(true);
  expect(result.forceTranslation).toBe(false);

  expect(result.authority).toBeDefined();
  expect(result.authority.finalAuthority).toBe("Marion");
  expect(result.authority.lingoSentinelAdvisoryOnly).toBe(true);
  expect(result.authority.neverOverrideMarion).toBe(true);

  const serialized = safeSerialize(result);

  expect(serialized).not.toContain("SERIALIZE_ERROR");
  expect(serialized).not.toContain("TypeError");
  expect(serialized).not.toContain("ReferenceError");
  expect(serialized).not.toContain("undefined undefined");
  expect(serialized).not.toContain("null null");
}

function assertGatewayRenderSafe(result) {
  expect(result).toBeDefined();
  expect(typeof result).toBe("object");

  expect(result.authority).toBeDefined();
  expect(result.authority.finalAuthority).toBe("Marion");
  expect(result.authority.lingoSentinelAdvisoryOnly).toBe(true);
  expect(result.authority.neverOverrideMarion).toBe(true);

  expect(result.marionAuthority).toBe(true);
  expect(result.finalAuthority).toBe("Marion");

  expect(result.languageMeta).toBeDefined();
  expect(result.lingoInput).toBeDefined();
  expect(result.translationMeta).toBeDefined();
  expect(result.glossaryMeta).toBeDefined();
  expect(result.gatewayMeta).toBeDefined();

  /**
   * Translation metadata must be render-safe because this is where the
   * backend rendering issue appeared.
   */
  expect(typeof result.translationMeta.text).toBe("string");
  expect(typeof result.translationMeta.renderText).toBe("string");
  expect(typeof result.translationMeta.publicText).toBe("string");
  expect(typeof result.translationMeta.finalText).toBe("string");
  expect(result.translationMeta.safeToRender).toBe(true);
  expect(result.translationMeta.renderSafe).toBe(true);

  const serialized = safeSerialize(result);

  expect(serialized).not.toContain("SERIALIZE_ERROR");
  expect(serialized).not.toContain("TypeError");
  expect(serialized).not.toContain("ReferenceError");
  expect(serialized).not.toContain("undefined undefined");
  expect(serialized).not.toContain("null null");
}

describe("LingoSentinel Runtime Rendering Regression", () => {
  test("Translation Advisor exports rendering-safe callable functions", () => {
    expect(typeof adviseTranslation).toBe("function");
    expect(typeof buildTranslationAdvisory).toBe("function");
    expect(typeof runTranslationAdvisor).toBe("function");
  });

  test("Translation Advisor returns render-safe aliases for English input", () => {
    const result = adviseTranslation("Hello, how are you today?");

    assertRenderSafeAdvisorResult(result);

    expect(result.sourceLanguage).toBe("en");
    expect(result.targetLanguage).toBe("en");
    expect(result.translated).toBe(false);
    expect(result.reason).toBe("translation_not_required");
  });

  test("Translation Advisor returns render-safe aliases for French input", () => {
    const result = adviseTranslation("Bonjour, comment ca va?");

    assertRenderSafeAdvisorResult(result);

    expect(result.sourceLanguage).toBe("fr");
    expect(result.targetLanguage).toBe("en");
    expect(result.translated).toBe(true);
    expect(result.advisoryText).toBe("hello, how are you?");
    expect(result.renderText).toBe("hello, how are you?");
  });

  test("Translation Advisor returns render-safe aliases for accented French input", () => {
    const result = adviseTranslation("Bonjour, comment ça va?");

    assertRenderSafeAdvisorResult(result);

    expect(result.sourceLanguage).toBe("fr");
    expect(result.targetLanguage).toBe("en");
    expect(result.translated).toBe(true);
    expect(result.publicText).toBe("hello, how are you?");
  });

  test("Translation Advisor returns render-safe aliases for Spanish input", () => {
    const result = adviseTranslation("Hola, como estas?");

    assertRenderSafeAdvisorResult(result);

    expect(result.sourceLanguage).toBe("es");
    expect(result.targetLanguage).toBe("en");
    expect(result.translated).toBe(true);
    expect(result.advisoryText).toBe("hello, how are you?");
    expect(result.finalText).toBe("hello, how are you?");
  });

  test("Translation Advisor returns render-safe aliases for accented Spanish input", () => {
    const result = adviseTranslation("Hola, cómo estás?");

    assertRenderSafeAdvisorResult(result);

    expect(result.sourceLanguage).toBe("es");
    expect(result.targetLanguage).toBe("en");
    expect(result.translated).toBe(true);
    expect(result.text).toBe("hello, how are you?");
  });

  test("Translation Advisor handles unknown-language input without rendering crash", () => {
    const result = adviseTranslation("??? ###");

    assertRenderSafeAdvisorResult(result);

    expect(result.sourceLanguage).toBe("unknown");
    expect(result.translated).toBe(false);
    expect(result.fallbackTriggered).toBe(true);
    expect(result.reason).toBe("unsupported_or_unknown_language");
  });

  test("Translation Advisor handles null input without rendering crash", () => {
    const result = adviseTranslation(null);

    assertRenderSafeAdvisorResult(result);

    expect(result.translated).toBe(false);
    expect(result.fallbackTriggered).toBe(true);
  });

  test("Translation Advisor handles object input without rendering crash", () => {
    const result = adviseTranslation({
      message: "Bonjour, comment ca va?"
    });

    assertRenderSafeAdvisorResult(result);

    expect(result.safeToRender).toBe(true);
    expect(result.renderSafe).toBe(true);
  });

  test("buildTranslationAdvisory compatibility alias remains render-safe", () => {
    const result = buildTranslationAdvisory("Hola, como estas?");

    assertRenderSafeAdvisorResult(result);

    expect(result.sourceLanguage).toBe("es");
    expect(result.advisoryOnly).toBe(true);
  });

  test("runTranslationAdvisor compatibility alias remains render-safe", () => {
    const result = runTranslationAdvisor("Bonjour, comment ca va?");

    assertRenderSafeAdvisorResult(result);

    expect(result.sourceLanguage).toBe("fr");
    expect(result.advisoryOnly).toBe(true);
  });

  test("LingoSentinel Gateway returns render-safe package for English input", () => {
    const result = runLingoSentinelGateway("Hello, how are you today?");

    assertGatewayRenderSafe(result);

    expect(result.languageMeta.detectedLanguage).toBe("en");
    expect(result.translationMeta.translated).toBe(false);
  });

  test("LingoSentinel Gateway returns render-safe package for French input", () => {
    const result = runLingoSentinelGateway("Bonjour, comment ca va?");

    assertGatewayRenderSafe(result);

    expect(result.languageMeta.detectedLanguage).toBe("fr");
    expect(result.translationMeta.translated).toBe(true);
    expect(result.translationMeta.renderText).toBe("hello, how are you?");
  });

  test("LingoSentinel Gateway returns render-safe package for Spanish input", () => {
    const result = runLingoSentinelGateway("Hola, como estas?");

    assertGatewayRenderSafe(result);

    expect(result.languageMeta.detectedLanguage).toBe("es");
    expect(result.translationMeta.translated).toBe(true);
    expect(result.translationMeta.publicText).toBe("hello, how are you?");
  });

  test("LingoSentinel Gateway returns render-safe package for unknown input", () => {
    const result = runLingoSentinelGateway("??? ###");

    assertGatewayRenderSafe(result);

    expect(result.languageMeta.detectedLanguage).toBe("unknown");
    expect(result.languageMeta.fallbackTriggered).toBe(true);
    expect(result.translationMeta.translated).toBe(false);
    expect(result.translationMeta.fallbackTriggered).toBe(true);
  });

  test("Marion Bridge payload carries render-safe translation metadata", () => {
    const payload = buildMarionBridgePayload("Bonjour, comment ca va?");

    expect(payload).toBeDefined();

    expect(payload.authority.finalAuthority).toBe("Marion");
    expect(payload.authority.lingoSentinelAdvisoryOnly).toBe(true);
    expect(payload.marionAuthority).toBe(true);
    expect(payload.finalAuthority).toBe("Marion");

    expect(payload.translationMeta).toBeDefined();
    expect(payload.translationMeta.safeToRender).toBe(true);
    expect(payload.translationMeta.renderSafe).toBe(true);

    expect(typeof payload.translationMeta.text).toBe("string");
    expect(typeof payload.translationMeta.renderText).toBe("string");
    expect(typeof payload.translationMeta.publicText).toBe("string");
    expect(typeof payload.translationMeta.finalText).toBe("string");

    const serialized = safeSerialize(payload);

    expect(serialized).not.toContain("SERIALIZE_ERROR");
    expect(serialized).not.toContain("TypeError");
    expect(serialized).not.toContain("ReferenceError");
  });
});
