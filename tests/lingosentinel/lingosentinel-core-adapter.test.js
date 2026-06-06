"use strict";

/**
 * LingoSentinel Core Adapter Test
 *
 * Jest-compatible conversion.
 *
 * Purpose:
 * - Keeps the LingoSentinel runtime import path canonical.
 * - Verifies fallback language detection.
 * - Verifies glossary safety.
 * - Verifies fallback translation behavior.
 * - Verifies request processing remains Marion-review gated.
 */

const {
  processLingoSentinelRequest,
  detectLanguage,
  applyGlossary,
  localFallbackTranslate
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelCoreAdapter");

const {
  createLingoSentinelRequestEnvelope
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelRequestEnvelope");

describe("LingoSentinel Core Adapter", () => {
  test("detects English fallback language", async () => {
    const result = await detectLanguage("Hello, how are you?");
    expect(result).toBe("en");
  });

  test("detects French fallback language", async () => {
    const result = await detectLanguage("Bonjour, comment allez-vous?");
    expect(result).toBe("fr");
  });

  test("detects Spanish fallback language", async () => {
    const result = await detectLanguage("Hola, ¿cómo estás?");
    expect(result).toBe("es");
  });

  test("applies glossary safely even when glossary runtime is absent", () => {
    const result = applyGlossary("Hello world.", {
      sourceLanguage: "en",
      targetLanguage: "fr"
    });

    expect(result.text).toBe("Hello world.");
    expect(typeof result.glossaryUsed).toBe("boolean");
  });

  test("local fallback returns normalized source text when source equals target", () => {
    const result = localFallbackTranslate({
      text: "Hello world.",
      sourceLanguage: "en",
      targetLanguage: "en"
    });

    expect(result.ok).toBe(true);
    expect(result.text).toBe("Hello world.");
    expect(result.translatedText).toBe("Hello world.");
    expect(result.provider).toBe("local-fallback");
  });

  test("local fallback warns when source and target differ", () => {
    const result = localFallbackTranslate({
      text: "Hello world.",
      sourceLanguage: "en",
      targetLanguage: "fr"
    });

    expect(result.ok).toBe(true);
    expect(result.text).toBe("Hello world.");
    expect(result.provider).toBe("local-fallback");
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  test("processes empty LingoSentinel request as fallback response", async () => {
    const response = await processLingoSentinelRequest({
      requestId: "core_empty_1",
      text: "",
      sourceLanguage: "en",
      targetLanguage: "fr",
      mode: "translate"
    });

    expect(response.ok).toBe(false);
    expect(response.fallbackUsed).toBe(true);
    expect(response.requiresMarionReview).toBe(true);
  });

  test("processes detect request", async () => {
    const request = createLingoSentinelRequestEnvelope({
      requestId: "core_detect_1",
      text: "Bonjour mon ami.",
      sourceLanguage: "auto",
      targetLanguage: "en",
      mode: "detect"
    });

    const response = await processLingoSentinelRequest(request);

    expect(response.ok).toBe(true);
    expect(response.mode).toBe("detect");
    expect(response.detectedLanguage).toBe("fr");
    expect(response.requiresMarionReview).toBe(true);
  });

  test("processes translate request without crashing", async () => {
    const request = createLingoSentinelRequestEnvelope({
      requestId: "core_translate_1",
      text: "Translate hello into French.",
      sourceLanguage: "en",
      targetLanguage: "fr",
      mode: "translate"
    });

    const response = await processLingoSentinelRequest(request);

    expect(response.gateway).toBe("marion-lingosentinel");
    expect(response.requestId).toBe("core_translate_1");
    expect(response.requiresMarionReview).toBe(true);
    expect(typeof response.ok).toBe("boolean");
  });
});
