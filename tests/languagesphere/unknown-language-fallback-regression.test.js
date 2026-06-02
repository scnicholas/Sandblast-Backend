"use strict";

/**
 * tests/languagesphere/unknown-language-fallback-regression.test.js
 *
 * Purpose:
 * - Confirm unsupported languages/scripts do not get forced into EN/FR/ES.
 * - Confirm adapter preserves original text on unsupported/low-confidence detection.
 * - Confirm fallback metadata stays explicit.
 *
 * Run:
 *   node .\tests\languagesphere\unknown-language-fallback-regression.test.js
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");

function requireRuntimeModule(fileName) {
  const root = path.resolve(__dirname, "..", "..");

  const candidates = [
    path.join(root, "Data", "marion", "runtime", fileName),
    path.join(root, fileName),
    path.join(root, "Data", "marion", "runtime", "languagesphere", fileName)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return require(candidate);
    }
  }

  throw new Error(`Unable to locate runtime module: ${fileName}`);
}

const LanguageDetect = requireRuntimeModule("LanguageDetect.js");
const Adapter = requireRuntimeModule("UniversalTranslatorAdapter.js");

async function runUnknownLanguageFallbackRegression() {
  const unsupportedSamples = [
    "これは日本語の文章です。",
    "مرحبا كيف حالك اليوم؟",
    "Привет, как дела сегодня?"
  ];

  for (const sample of unsupportedSamples) {
    const detected = LanguageDetect.detectLanguage(sample, {
      defaultToUnknown: true
    });

    assert.strictEqual(
      detected.language,
      "unknown",
      `Unsupported sample should detect as unknown: ${sample}`
    );

    assert.ok(
      ["unsupported-script", "no-signal", "low-confidence-default"].includes(detected.method),
      `Unexpected detection method for unsupported sample: ${detected.method}`
    );

    if (typeof Adapter.resetUniversalTranslatorCaches === "function") {
      Adapter.resetUniversalTranslatorCaches();
    }

    const result = await Adapter.translateText(sample, {
      provider: "manualDictionary",
      sourceLanguage: "auto",
      targetLanguage: "en"
    });

    assert.strictEqual(
      result.text,
      sample,
      "Unsupported language fallback should return original text"
    );

    assert.strictEqual(
      result.meta.translated,
      false,
      "Unsupported language fallback must not claim translation"
    );

    assert.strictEqual(
      result.meta.fallbackUsed,
      true,
      "Unsupported language fallback should mark fallbackUsed true"
    );

    assert.ok(
      result.meta.warning,
      "Unsupported language fallback should include a warning"
    );
  }

  console.log("PASS unknown-language-fallback-regression");
}

runUnknownLanguageFallbackRegression().catch((error) => {
  console.error(error);
  process.exit(1);
});
