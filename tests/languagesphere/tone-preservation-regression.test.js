"use strict";

/**
 * tests/languagesphere/tone-preservation-regression.test.js
 *
 * Purpose:
 * - Confirm tone/emotion context can pass through the adapter boundary.
 * - Confirm fail-closed behavior preserves emotional wording when provider cannot translate.
 * - Prevent flattening or accidental rewriting during fallback.
 *
 * Run:
 *   node .\tests\languagesphere\tone-preservation-regression.test.js
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

const Adapter = requireRuntimeModule("UniversalTranslatorAdapter.js");

async function runTonePreservationRegression() {
  assert.strictEqual(
    typeof Adapter.translateText,
    "function",
    "UniversalTranslatorAdapter.translateText must be exported"
  );

  if (typeof Adapter.resetUniversalTranslatorCaches === "function") {
    Adapter.resetUniversalTranslatorCaches();
  }

  const emotionalText =
    "I know this is hard, but we can handle it carefully and keep moving forward.";

  const result = await Adapter.translateText(emotionalText, {
    provider: "manualDictionary",
    sourceLanguage: "en",
    targetLanguage: "fr",
    emotion: "supportive",
    tone: "warm",
    domain: "psychology",
    allowLowConfidenceTranslation: true
  });

  assert.strictEqual(
    result.text,
    emotionalText,
    "Fallback should preserve original emotional wording exactly"
  );

  assert.strictEqual(
    result.meta.translated,
    false,
    "Dictionary miss should not claim translated tone output"
  );

  assert.strictEqual(
    result.meta.fallbackUsed,
    true,
    "Tone fallback should be explicit in metadata"
  );

  assert.ok(
    result.meta.warning,
    "Tone fallback should include a warning"
  );

  const knownPhrase = await Adapter.translateText("Nyx is ready.", {
    provider: "manualDictionary",
    sourceLanguage: "en",
    targetLanguage: "es",
    emotion: "calm",
    tone: "concise",
    allowLowConfidenceTranslation: true
  });

  assert.strictEqual(
    knownPhrase.text,
    "Nyx está lista.",
    "Known phrase should still translate while carrying tone context through boundary"
  );

  assert.strictEqual(
    knownPhrase.meta.translated,
    true,
    "Known phrase should mark translated true"
  );

  assert.strictEqual(
    knownPhrase.meta.languagePair,
    "en-es",
    "Known phrase should retain correct language-pair metadata"
  );

  console.log("PASS tone-preservation-regression");
}

runTonePreservationRegression().catch((error) => {
  console.error(error);
  process.exit(1);
});
