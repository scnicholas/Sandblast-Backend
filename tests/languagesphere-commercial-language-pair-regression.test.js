"use strict";

/**
 * LanguageSphere Commercial Language Pair Regression
 *
 * Purpose:
 * Verifies that the runtime-level UniversalTranslatorAdapter handles the
 * commercial Phase-1 language pairs safely.
 *
 * Active files are expected at:
 * Data/marion/runtime/
 */

const path = require("path");

const ADAPTER_PATH = path.resolve(
  process.cwd(),
  "Data/marion/runtime/UniversalTranslatorAdapter.js"
);

function loadAdapter() {
  jest.resetModules();
  return require(ADAPTER_PATH);
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

async function callTranslate(adapter, text, sourceLanguage, targetLanguage, extra = {}) {
  const fn = getTranslateFn(adapter);

  expect(typeof fn).toBe("function");

  const result = await Promise.resolve(
    fn(text, {
      sourceLanguage,
      targetLanguage,
      domain: extra.domain || "general",
      context: extra.context || "commercial-regression",
      provider: extra.provider || "manualDictionary",
      ...extra,
    })
  );

  expect(result).toBeTruthy();

  const translatedText =
    typeof result === "string"
      ? result
      : result.text || result.translatedText || result.translation || result.output || "";

  expect(typeof translatedText).toBe("string");
  expect(translatedText.length).toBeGreaterThan(0);

  return { result, translatedText };
}

describe("LanguageSphere commercial language-pair regression", () => {
  test.each([
    ["en", "fr", "Start Reading"],
    ["fr", "en", "Commencer la lecture"],
    ["en", "es", "Start Reading"],
    ["es", "en", "Comenzar a leer"],
    ["fr", "es", "Commencer la lecture"],
    ["es", "fr", "Comenzar a leer"],
  ])("handles %s → %s safely", async (sourceLanguage, targetLanguage, text) => {
    const adapter = loadAdapter();
    const { translatedText } = await callTranslate(
      adapter,
      text,
      sourceLanguage,
      targetLanguage
    );

    expect(translatedText).toBeTruthy();
    expect(translatedText).not.toMatch(/undefined|null|\[object Object\]/i);
  });

  test("fails closed to original text for same-language requests", async () => {
    const adapter = loadAdapter();
    const input = "Start Reading";

    const { translatedText } = await callTranslate(adapter, input, "en", "en");

    expect(translatedText).toBe(input);
  });

  test("does not crash on unsupported source language", async () => {
    const adapter = loadAdapter();
    const input = "これはテストです";

    const { translatedText } = await callTranslate(adapter, input, "ja", "en");

    expect(translatedText).toBe(input);
  });
});
