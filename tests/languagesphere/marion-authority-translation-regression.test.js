"use strict";

/**
 * tests/languagesphere/marion-authority-translation-regression.test.js
 *
 * Purpose:
 * - Confirm UniversalTranslatorAdapter remains a translation gate, not final authority.
 * - Confirm translated text is available when safe, while protected glossary terms may be preserved.
 * - Confirm final answer authorization remains with Marion.
 * - Confirm public-facing authority remains Nyx while Marion authority is required internally.
 *
 * Run:
 *   node .\tests\languagesphere\marion-authority-translation-regression.test.js
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

async function runMarionAuthorityTranslationRegression() {
  assert.strictEqual(
    typeof Adapter.translate,
    "function",
    "UniversalTranslatorAdapter.translate must be exported"
  );

  if (typeof Adapter.resetUniversalTranslatorCaches === "function") {
    Adapter.resetUniversalTranslatorCaches();
  }

  const result = await Adapter.translate(
    {
      text: "Nyx is ready.",
      sourceLanguage: "en",
      targetLanguage: "fr",
      provider: "manualDictionary",
      domain: "interface"
    },
    {
      allowLowConfidenceTranslation: true
    }
  );

  assertPlainObject(result, "Adapter should return an object result");

  assert.strictEqual(
    result.ok,
    true,
    "Adapter translation result should be ok"
  );

  assert.ok(
    ["Nyx is ready.", "Nyx est prête."].includes(result.text),
    "Adapter should expose translated text when safe, or preserve protected glossary terms"
  );

  assert.strictEqual(
    typeof result.translationAvailable,
    "boolean",
    "Adapter should expose translationAvailable as boolean metadata"
  );

  if (result.text === "Nyx est prête.") {
    assert.strictEqual(
      result.translationAvailable,
      true,
      "Dictionary translation should mark translationAvailable true"
    );
  }

  if (result.text === "Nyx is ready.") {
    assert.strictEqual(
      result.translationAvailable,
      false,
      "Protected glossary preservation must not claim translationAvailable true"
    );
  }

  assert.strictEqual(
    result.translationGate,
    true,
    "Adapter must remain a translation gate"
  );

  assert.strictEqual(
    result.marionAuthorityRequired,
    true,
    "Adapter must require Marion authority before final answer"
  );

  assert.strictEqual(
    result.finalAnswerAuthorized,
    false,
    "Adapter must not authorize final answers"
  );

  assert.strictEqual(
    result.publicAgent,
    "nyx",
    "Public-facing agent should remain Nyx"
  );

  assert.strictEqual(
    result.displayAuthority,
    "nyx",
    "Display authority should remain Nyx"
  );

  assertPlainObject(
    result.languageSphere,
    "Adapter should include languageSphere metadata"
  );

  assert.strictEqual(
    result.languageSphere.marionAuthorityRequired,
    true,
    "languageSphere metadata must preserve Marion authority requirement"
  );

  assert.strictEqual(
    result.languageSphere.finalAnswerAuthorized,
    false,
    "languageSphere metadata must not authorize final answer"
  );

  assert.strictEqual(
    result.languageSphere.translationGate,
    true,
    "languageSphere metadata should mark translationGate true"
  );

  assertPlainObject(
    result.translationMeta,
    "Translation metadata should be present"
  );

  assert.strictEqual(
    result.translationMeta.languagePair,
    "en-fr",
    "Translation metadata should preserve language pair"
  );

  const fallback = await Adapter.translate(
    {
      text: "This phrase should stay original because it is outside the dictionary.",
      sourceLanguage: "en",
      targetLanguage: "fr",
      provider: "manualDictionary",
      domain: "general"
    },
    {
      allowLowConfidenceTranslation: true
    }
  );

  assertPlainObject(fallback, "Fallback should return an object result");

  assert.strictEqual(
    fallback.translationAvailable,
    false,
    "Fallback should not mark translationAvailable true"
  );

  assert.strictEqual(
    fallback.fallbackUsed,
    true,
    "Fallback should mark fallbackUsed true"
  );

  assert.strictEqual(
    fallback.marionAuthorityRequired,
    true,
    "Fallback path must still require Marion final authority"
  );

  assert.strictEqual(
    fallback.finalAnswerAuthorized,
    false,
    "Fallback path must not authorize final answer"
  );

  console.log("PASS marion-authority-translation-regression");
}

runMarionAuthorityTranslationRegression().catch((error) => {
  console.error(error);
  process.exit(1);
});
