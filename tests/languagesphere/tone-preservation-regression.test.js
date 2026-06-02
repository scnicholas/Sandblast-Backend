"use strict";

/**
 * tests/languagesphere/tone-preservation-regression.test.js
 *
 * Purpose:
 * - Confirm tone/emotion context can pass through the adapter boundary.
 * - Confirm fail-closed behavior preserves emotional wording when provider cannot translate.
 * - Prevent flattening or accidental rewriting during fallback.
 * - Allow protected glossary terms such as Nyx to be preserved instead of forced translated.
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

function assertPlainObject(value, message) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    message
  );
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

  assertPlainObject(result, "Adapter should return an object result");
  assertPlainObject(result.meta, "Adapter result should expose metadata");

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

  assertPlainObject(knownPhrase, "Known phrase should return an object result");
  assertPlainObject(knownPhrase.meta, "Known phrase should expose metadata");

  assert.ok(
    ["Nyx is ready.", "Nyx está lista."].includes(knownPhrase.text),
    "Known phrase should either translate through dictionary or preserve protected glossary terms safely"
  );

  assert.strictEqual(
    knownPhrase.meta.languagePair,
    "en-es",
    "Known phrase should retain correct language-pair metadata"
  );

  assert.strictEqual(
    typeof knownPhrase.meta.translated,
    "boolean",
    "Known phrase should expose translated status as boolean metadata"
  );

  assert.strictEqual(
    typeof knownPhrase.meta.fallbackUsed,
    "boolean",
    "Known phrase should expose fallbackUsed status as boolean metadata"
  );

  if (knownPhrase.text === "Nyx is ready.") {
    assert.strictEqual(
      knownPhrase.meta.translated,
      false,
      "Protected glossary preservation must not claim translated output"
    );

    assert.strictEqual(
      knownPhrase.meta.fallbackUsed,
      true,
      "Protected glossary preservation should be represented as fallback/protection behavior"
    );
  }

  if (knownPhrase.text === "Nyx está lista.") {
    assert.strictEqual(
      knownPhrase.meta.translated,
      true,
      "Dictionary translation should mark translated true"
    );
  }

  console.log("PASS tone-preservation-regression");
}

runTonePreservationRegression().catch((error) => {
  console.error(error);
  process.exit(1);
});
