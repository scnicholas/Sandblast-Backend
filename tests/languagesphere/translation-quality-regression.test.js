"use strict";

/**
 * tests/languagesphere/translation-quality-regression.test.js
 *
 * Purpose:
 * - Validate Phase-1 manual dictionary translations.
 * - Confirm supported language pairs behave deterministically.
 * - Confirm misses fail closed to original text instead of inventing output.
 *
 * Run:
 *   node .\tests\languagesphere\translation-quality-regression.test.js
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

const Provider = requireRuntimeModule("LocalTranslationProvider.js");
const Adapter = requireRuntimeModule("UniversalTranslatorAdapter.js");

async function runTranslationQualityRegression() {
  assert.strictEqual(
    typeof Provider.translateText,
    "function",
    "LocalTranslationProvider.translateText must be exported"
  );

  assert.strictEqual(
    typeof Adapter.translateText,
    "function",
    "UniversalTranslatorAdapter.translateText must be exported"
  );

  const providerFr = await Provider.translateText("Nyx is ready.", {
    provider: "manualDictionary",
    sourceLanguage: "en",
    targetLanguage: "fr"
  });

  assert.strictEqual(
    providerFr.text,
    "Nyx est prête.",
    "Provider should translate known English phrase to French"
  );

  assert.strictEqual(
    providerFr.translated,
    true,
    "Provider should mark dictionary hit as translated"
  );

  assert.strictEqual(
    providerFr.meta.dictionaryHit,
    true,
    "Provider metadata should confirm dictionary hit"
  );

  const providerEs = await Provider.translateText("Nyx is ready.", {
    provider: "manualDictionary",
    sourceLanguage: "en",
    targetLanguage: "es"
  });

  assert.strictEqual(
    providerEs.text,
    "Nyx está lista.",
    "Provider should translate known English phrase to Spanish"
  );

  assert.strictEqual(
    providerEs.translated,
    true,
    "Provider should mark Spanish dictionary hit as translated"
  );

  const missText = "This phrase is intentionally outside the manual dictionary.";
  const miss = await Provider.translateText(missText, {
    provider: "manualDictionary",
    sourceLanguage: "en",
    targetLanguage: "fr"
  });

  assert.strictEqual(
    miss.text,
    missText,
    "Manual dictionary miss must fail closed to original text"
  );

  assert.strictEqual(
    miss.translated,
    false,
    "Manual dictionary miss must not pretend translation happened"
  );

  assert.strictEqual(
    miss.meta.warning,
    "manual-dictionary-miss",
    "Manual dictionary miss should produce a clear warning"
  );

  if (typeof Adapter.resetUniversalTranslatorCaches === "function") {
    Adapter.resetUniversalTranslatorCaches();
  }

  const adapterResult = await Adapter.translateText("Nyx is ready.", {
    provider: "manualDictionary",
    sourceLanguage: "en",
    targetLanguage: "fr",
    allowLowConfidenceTranslation: true
  });

  assert.strictEqual(
    adapterResult.text,
    "Nyx est prête.",
    "Adapter should preserve provider translation output"
  );

  assert.strictEqual(
    adapterResult.meta.translated,
    true,
    "Adapter metadata should mark successful translation"
  );

  assert.strictEqual(
    adapterResult.meta.languagePair,
    "en-fr",
    "Adapter should report the language pair"
  );

  console.log("PASS translation-quality-regression");
}

runTranslationQualityRegression().catch((error) => {
  console.error(error);
  process.exit(1);
});
