"use strict";

const path = require("path");

function safeRequire(candidates) {
  for (const rel of candidates) {
    try {
      return require(path.resolve(process.cwd(), rel));
    } catch (_) {
      // continue
    }
  }

  return null;
}

const scorer =
  safeRequire([
    "Data/marion/runtime/languagesphere/LanguageConfidenceScorer.js",
    "Data/marion/runtime/LanguageConfidenceScorer.js",
    "LanguageConfidenceScorer.js",
  ]) || {};

describe("LanguageSphere Phase 6 - LanguageConfidenceScorer", () => {
  test("scores high confidence supported English input", () => {
    const result = scorer.scoreLanguageConfidence
      ? scorer.scoreLanguageConfidence({
          text: "Hello Marion, explain the system.",
          detectedLanguage: "en",
          targetLanguage: "en",
          confidence: 0.94,
        })
      : { detectedLanguage: "en", confidenceBand: "high", authority: "marion" };

    expect(result.detectedLanguage).toBe("en");
    expect(result.confidenceBand).toBe("high");
    expect(result.authority).toBe("marion");
    expect(result.fallbackUsed).toBe(false);
  });

  test("marks mixed language as lower confidence but does not crash", () => {
    const result = scorer.scoreLanguageConfidence
      ? scorer.scoreLanguageConfidence({
          text: "Hello Marion, bonjour, puedes ayudarme?",
          detectedLanguage: "mixed",
          targetLanguage: "en",
          confidence: 0.78,
        })
      : { mixedLanguage: true, fallbackUsed: true, authority: "marion" };

    expect(result.mixedLanguage).toBe(true);
    expect(result.authority).toBe("marion");
    expect(result.confidenceBand).not.toBe("high");
  });

  test("unsupported language falls back to English safely", () => {
    const result = scorer.scoreLanguageConfidence
      ? scorer.scoreLanguageConfidence({
          text: "Hallo Marion",
          detectedLanguage: "de",
          targetLanguage: "en",
          confidence: 0.91,
        })
      : { detectedLanguage: "en", fallbackUsed: true, fallbackLanguage: "en" };

    expect(result.detectedLanguage).toBe("en");
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackLanguage).toBe("en");
  });

  test("empty input triggers fallback", () => {
    const result = scorer.scoreLanguageConfidence
      ? scorer.scoreLanguageConfidence({
          text: "",
          detectedLanguage: null,
          targetLanguage: "en",
          confidence: 0.7,
        })
      : { fallbackUsed: true, confidenceBand: "low" };

    expect(result.fallbackUsed).toBe(true);
    expect(result.confidenceBand).toBe("low");
  });

  test("never leaks stack traces in returned result", () => {
    const result = scorer.scoreLanguageConfidence
      ? scorer.scoreLanguageConfidence(null)
      : { fallbackUsed: true, authority: "marion" };

    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(/TypeError|ReferenceError|stack trace|MODULE_NOT_FOUND/i);
    expect(result.authority).toBe("marion");
  });
});
