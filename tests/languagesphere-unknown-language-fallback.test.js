"use strict";

/**
 * LanguageSphere Unknown Language Fallback Regression
 *
 * Purpose:
 * Unknown or low-confidence language detection must fail closed to the original
 * text and never corrupt Marion/Nyx flow.
 */

const path = require("path");

const ADAPTER_PATH = path.resolve(
  process.cwd(),
  "Data/marion/runtime/UniversalTranslatorAdapter.js"
);

const DETECT_PATH = path.resolve(
  process.cwd(),
  "Data/marion/runtime/LanguageDetect.js"
);

function loadAdapter() {
  jest.resetModules();
  return require(ADAPTER_PATH);
}

function loadDetector() {
  jest.resetModules();
  return require(DETECT_PATH);
}

function getTranslateFn(adapter) {
  return (
    adapter.translateText ||
    adapter.translate ||
    adapter.translateForMarion ||
    adapter.runTranslation ||
    null
  );
}

describe("LanguageSphere unknown-language fallback", () => {
  test("detector returns a safe result for non-supported script", () => {
    const detector = loadDetector();

    expect(typeof detector.detectLanguage).toBe("function");

    const result = detector.detectLanguage("これは日本語のテストです。");

    expect(result).toBeTruthy();
    expect(typeof result.language).toBe("string");
    expect(result.language).toMatch(/unknown|en|fr|es/);
    expect(Number(result.confidence || 0)).toBeGreaterThanOrEqual(0);
  });

  test("translator returns original for unsupported source language", async () => {
    const adapter = loadAdapter();
    const fn = getTranslateFn(adapter);

    expect(typeof fn).toBe("function");

    const input = "これは日本語のテストです。";

    const result = await Promise.resolve(
      fn(input, {
        sourceLanguage: "ja",
        targetLanguage: "en",
        provider: "manualDictionary",
        domain: "general",
      })
    );

    const text =
      typeof result === "string"
        ? result
        : result.text || result.translatedText || result.translation || "";

    expect(text).toBe(input);
  });

  test("translator returns original when target language is unknown", async () => {
    const adapter = loadAdapter();
    const fn = getTranslateFn(adapter);

    const input = "Bonjour";

    const result = await Promise.resolve(
      fn(input, {
        sourceLanguage: "fr",
        targetLanguage: "unknown",
        provider: "manualDictionary",
      })
    );

    const text =
      typeof result === "string"
        ? result
        : result.text || result.translatedText || result.translation || "";

    expect(text).toBe(input);
  });
});
