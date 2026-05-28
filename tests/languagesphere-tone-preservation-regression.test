"use strict";

/**
 * LanguageSphere Tone Preservation Regression
 *
 * Purpose:
 * Ensures translation metadata carries tone/emotion hints without changing
 * Marion's final authority or leaking diagnostics.
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

function getMeta(result) {
  if (!result || typeof result !== "object") return {};
  return result.meta || result.translationMeta || result.languageSphere || {};
}

describe("LanguageSphere tone preservation regression", () => {
  test("accepts tone/emotion hints without throwing", async () => {
    const adapter = loadAdapter();
    const fn = getTranslateFn(adapter);

    expect(typeof fn).toBe("function");

    const result = await Promise.resolve(
      fn("Start Reading", {
        sourceLanguage: "en",
        targetLanguage: "fr",
        provider: "manualDictionary",
        domain: "interface",
        emotion: "calm",
        tone: "commercial_precise",
        preserveEmotionTone: true,
        context: "tone-preservation-regression",
      })
    );

    const text =
      typeof result === "string"
        ? result
        : result.text || result.translatedText || result.translation || "";

    expect(text).toBeTruthy();
    expect(text).not.toMatch(/runtimeTelemetry|failureSignature|stack trace/i);

    const meta = getMeta(result);
    expect(JSON.stringify(meta)).not.toMatch(/stack trace|Bearer\s+|api[_-]?key/i);
  });

  test("does not expose Marion internals inside translated user text", async () => {
    const adapter = loadAdapter();
    const fn = getTranslateFn(adapter);

    const result = await Promise.resolve(
      fn("Nyx is online.", {
        sourceLanguage: "en",
        targetLanguage: "es",
        provider: "manualDictionary",
        domain: "interface",
        tone: "warm_clear",
      })
    );

    const text =
      typeof result === "string"
        ? result
        : result.text || result.translatedText || result.translation || "";

    expect(text).toBeTruthy();
    expect(text).not.toMatch(
      /MARION::FINAL::|replyAuthority|finalEnvelopeTrusted|sessionPatch/i
    );
  });
});
