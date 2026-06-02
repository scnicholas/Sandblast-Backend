"use strict";

/**
 * tests/languagesphere/glossary-preservation-regression.test.js
 *
 * Purpose:
 * - Ensure protected terms are tokenized before translation.
 * - Ensure protected terms are restored after provider output.
 * - Ensure brand/system terms are not corrupted.
 *
 * Run:
 *   node .\tests\languagesphere\glossary-preservation-regression.test.js
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

const Glossary = requireRuntimeModule("TranslationGlossary.js");
const Adapter = requireRuntimeModule("UniversalTranslatorAdapter.js");

async function runGlossaryPreservationRegression() {
  assert.strictEqual(
    typeof Glossary.protectText,
    "function",
    "TranslationGlossary.protectText must be exported"
  );

  assert.strictEqual(
    typeof Glossary.restoreText,
    "function",
    "TranslationGlossary.restoreText must be exported"
  );

  const source =
    "Sandblast Channel uses Nyx, Marion, LanguageSphere, LingoLink, Aster, and the Context Passport.";

  const protectedPayload = Glossary.protectText(source, {
    domain: "ai",
    extraTerms: ["LingoLink", "Aster"]
  });

  assert.ok(
    protectedPayload.tokens.length >= 6,
    `Expected protected terms to be tokenized. Tokens: ${protectedPayload.tokens.length}`
  );

  assert.ok(
    protectedPayload.text.includes("__SB_TRANSLATION_PROTECTED_"),
    "Protected text should contain glossary tokens"
  );

  const restored = Glossary.restoreText(protectedPayload.text, protectedPayload.tokens);

  assert.strictEqual(
    restored,
    source,
    "Glossary restoration should return the exact original protected text"
  );

  if (typeof Adapter.resetUniversalTranslatorCaches === "function") {
    Adapter.resetUniversalTranslatorCaches();
  }

  const adapterMiss = await Adapter.translateText(source, {
    provider: "manualDictionary",
    sourceLanguage: "en",
    targetLanguage: "fr",
    domain: "ai",
    extraTerms: ["LingoLink", "Aster"],
    allowLowConfidenceTranslation: true
  });

  assert.strictEqual(
    adapterMiss.text,
    source,
    "Dictionary miss should fail closed while preserving protected terms"
  );

  for (const term of ["Sandblast Channel", "Nyx", "Marion", "LanguageSphere", "LingoLink", "Aster"]) {
    assert.ok(
      adapterMiss.text.includes(term),
      `Protected term should survive translation path: ${term}`
    );
  }

  assert.ok(
    adapterMiss.meta.protectedTermsApplied >= 6,
    "Adapter metadata should report protected terms applied"
  );

  console.log("PASS glossary-preservation-regression");
}

runGlossaryPreservationRegression().catch((error) => {
  console.error(error);
  process.exit(1);
});
