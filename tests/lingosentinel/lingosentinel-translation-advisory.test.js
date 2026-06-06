"use strict";

/**
 * LingoSentinel Translation Advisory Test
 *
 * Purpose:
 * Confirms LingoSentinel can produce advisory translation metadata
 * without overriding Marion or forcing translation.
 */

const {
  adviseTranslation,
  lookupAdvisoryTranslation,
  DEFAULT_TRANSLATION_CONFIG
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelTranslationAdvisor");

const {
  detectLanguage
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelLanguageDetect");

const {
  normalizeInput
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelNormalizer");

describe("LingoSentinel Translation Advisory", () => {
  test("module exports translation advisory functions", () => {
    expect(typeof adviseTranslation).toBe("function");
    expect(typeof lookupAdvisoryTranslation).toBe("function");
    expect(DEFAULT_TRANSLATION_CONFIG).toBeDefined();
  });

  test("does not translate English input", () => {
    const result = adviseTranslation("Hello, how are you today?");

    expect(result).toBeDefined();
    expect(result.sourceLanguage).toBe("en");
    expect(result.targetLanguage).toBe("en");
    expect(result.translated).toBe(false);
    expect(result.advisoryOnly).toBe(true);
    expect(result.forceTranslation).toBe(false);
    expect(result.reason).toBe("translation_not_required");
    expect(result.authority.finalAuthority).toBe("Marion");
  });

  test("creates advisory translation for French phrase", () => {
    const result = adviseTranslation("Bonjour, comment ça va?");

    expect(result).toBeDefined();
    expect(result.sourceLanguage).toBe("fr");
    expect(result.targetLanguage).toBe("en");
    expect(result.translated).toBe(true);
    expect(result.advisoryOnly).toBe(true);
    expect(result.forceTranslation).toBe(false);
    expect(result.advisoryText).toBe("hello, how are you?");
    expect(result.reason).toBe("translation_advisory_created");
    expect(result.authority.neverOverrideMarion).toBe(true);
  });

  test("creates advisory translation for unaccented French phrase", () => {
    const result = adviseTranslation("Bonjour, comment ca va?");

    expect(result).toBeDefined();
    expect(result.sourceLanguage).toBe("fr");
    expect(result.translated).toBe(true);
    expect(result.advisoryText).toBe("hello, how are you?");
  });

  test("creates advisory translation for Spanish phrase", () => {
    const result = adviseTranslation("Hola, cómo estás?");

    expect(result).toBeDefined();
    expect(result.sourceLanguage).toBe("es");
    expect(result.targetLanguage).toBe("en");
    expect(result.translated).toBe(true);
    expect(result.advisoryText).toBe("hello, how are you?");
    expect(result.advisoryOnly).toBe(true);
  });

  test("creates advisory translation for unaccented Spanish phrase", () => {
    const result = adviseTranslation("Hola, como estas?");

    expect(result).toBeDefined();
    expect(result.sourceLanguage).toBe("es");
    expect(result.translated).toBe(true);
    expect(result.advisoryText).toBe("hello, how are you?");
  });

  test("falls back safely for unknown language input", () => {
    const result = adviseTranslation("??? ###");

    expect(result).toBeDefined();
    expect(result.sourceLanguage).toBe("unknown");
    expect(result.translated).toBe(false);
    expect(result.supported).toBe(false);
    expect(result.fallbackTriggered).toBe(true);
    expect(result.reason).toBe("unsupported_or_unknown_language");
  });

  test("falls back safely for empty input", () => {
    const result = adviseTranslation("");

    expect(result).toBeDefined();
    expect(result.translated).toBe(false);
    expect(result.fallbackTriggered).toBe(true);
    expect(result.reason).toBe("empty_input");
  });

  test("accepts precomputed normalization and language metadata", () => {
    const normalization = normalizeInput("  Hola,   como estas ?  ");
    const languageMeta = detectLanguage(normalization.normalizedText);

    const result = adviseTranslation(normalization.normalizedText, {
      normalization,
      languageMeta
    });

    expect(result.originalText).toBe("  Hola,   como estas ?  ");
    expect(result.normalizedText).toBe("Hola, como estas?");
    expect(result.sourceLanguage).toBe("es");
    expect(result.translated).toBe(true);
    expect(result.advisoryText).toBe("hello, how are you?");
  });

  test("respects disabled translation advisor config", () => {
    const result = adviseTranslation("Bonjour, comment ça va?", {
      config: {
        enabled: false
      }
    });

    expect(result.translated).toBe(false);
    expect(result.fallbackTriggered).toBe(true);
    expect(result.reason).toBe("translation_advisor_disabled");
    expect(result.advisoryOnly).toBe(true);
  });

  test("lookup returns passthrough when phrase is not in memory", () => {
    const result = lookupAdvisoryTranslation(
      "Ceci est une phrase nouvelle.",
      "fr"
    );

    expect(result.translatedText).toBe("Ceci est une phrase nouvelle.");
    expect(result.matched).toBe(false);
    expect(result.method).toBe("passthrough");
  });
});
