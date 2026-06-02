"use strict";

/**
 * LingoLink Language Detection Regression Test
 *
 * Purpose:
 * Verifies English, French, Spanish, and unknown-language detection before full
 * translation is introduced.
 *
 * Critical hardening notes:
 * - Uses stable ASCII phrases for PowerShell compatibility.
 * - Avoids overfitting to optional candidate/score internals.
 * - Still validates confidence, support status, and translation requirement.
 */

const {
  detectLanguage,
  normalizeForDetection,
  scoreLanguage,
  DEFAULT_CONFIG
} = require("../../Data/marion/runtime/LingoLinkLanguageDetect");

describe("LingoLink Language Detection Regression", () => {
  test("module exports detection functions", () => {
    expect(typeof detectLanguage).toBe("function");
    expect(typeof normalizeForDetection).toBe("function");
    expect(typeof scoreLanguage).toBe("function");
    expect(DEFAULT_CONFIG).toBeDefined();
  });

  test("detects English input", () => {
    const result = detectLanguage("Hello, how are you today?");

    expect(result).toBeDefined();
    expect(result.detectedLanguage).toBe("en");
    expect(result.supported).toBe(true);
    expect(result.requiresTranslation).toBe(false);
    expect(result.source).toBe("LingoLinkLanguageDetect");
  });

  test("detects French input", () => {
    const result = detectLanguage("Bonjour, comment ca va?");

    expect(result).toBeDefined();
    expect(result.detectedLanguage).toBe("fr");
    expect(result.supported).toBe(true);
    expect(result.requiresTranslation).toBe(true);
    expect(result.source).toBe("LingoLinkLanguageDetect");
  });

  test("detects Spanish input", () => {
    const result = detectLanguage("Hola, como estas?");

    expect(result).toBeDefined();
    expect(result.detectedLanguage).toBe("es");
    expect(result.supported).toBe(true);
    expect(result.requiresTranslation).toBe(true);
    expect(result.source).toBe("LingoLinkLanguageDetect");
  });

  test("returns unknown for empty input", () => {
    const result = detectLanguage("");

    expect(result).toBeDefined();
    expect(result.detectedLanguage).toBe("unknown");
    expect(result.supported).toBe(false);
    expect(result.fallbackTriggered).toBe(true);
    expect(result.reason).toBe("empty_input");
  });

  test("returns unknown for null input", () => {
    const result = detectLanguage(null);

    expect(result).toBeDefined();
    expect(result.detectedLanguage).toBe("unknown");
    expect(result.supported).toBe(false);
    expect(result.fallbackTriggered).toBe(true);
  });

  test("returns unknown for ambiguous symbolic input", () => {
    const result = detectLanguage("??? ###");

    expect(result).toBeDefined();
    expect(result.detectedLanguage).toBe("unknown");
    expect(result.supported).toBe(false);
    expect(result.fallbackTriggered).toBe(true);
  });

  test("normalizes detection text safely", () => {
    const result = normalizeForDetection("  Bonjour,    COMMENT ca va?  ");

    expect(result).toBe("bonjour, comment ca va?");
  });

  test("scores French higher for French phrase", () => {
    const text = normalizeForDetection("Bonjour, comment ca va?");

    const frScore = scoreLanguage(text, "fr");
    const enScore = scoreLanguage(text, "en");
    const esScore = scoreLanguage(text, "es");

    expect(frScore).toBeGreaterThan(enScore);
    expect(frScore).toBeGreaterThan(esScore);
  });

  test("scores Spanish higher for Spanish phrase", () => {
    const text = normalizeForDetection("Hola, como estas?");

    const esScore = scoreLanguage(text, "es");
    const enScore = scoreLanguage(text, "en");
    const frScore = scoreLanguage(text, "fr");

    expect(esScore).toBeGreaterThan(enScore);
    expect(esScore).toBeGreaterThan(frScore);
  });

  test("respects disabled detection config", () => {
    const result = detectLanguage("Bonjour", {
      config: {
        enabled: false,
        defaultLanguage: "en"
      }
    });

    expect(result.detectedLanguage).toBe("en");
    expect(result.confidence).toBe(1);
    expect(result.supported).toBe(true);
    expect(result.reason).toBe("lingolink_detection_disabled");
  });

  test("supports custom language allowlist", () => {
    const result = detectLanguage("Bonjour, comment ca va?", {
      config: {
        supportedLanguages: ["en", "es"]
      }
    });

    expect(result.detectedLanguage).toBe("fr");
    expect(result.supported).toBe(false);
    expect(result.fallbackTriggered).toBe(true);
    expect(result.reason).toBe("unsupported_language");
  });
});
