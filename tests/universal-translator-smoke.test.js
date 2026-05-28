"use strict";

/**
 * universal-translator-smoke.test.js
 * Smoke tests for the Marion/Nyx Universal Translator / LanguageSphere gate.
 *
 * Works in both modes:
 *   node tests/universal-translator-smoke.test.js
 *   npx jest tests/universal-translator-smoke.test.js
 *
 * Scope:
 * - English/French/Spanish detection.
 * - Target-language request parsing.
 * - Glossary protection/restoration.
 * - Adapter translation-gate safety.
 * - Marion authority metadata preservation.
 * - Final-envelope preservation.
 * - File-backed translation memory isolation.
 *
 * This test intentionally avoids paid APIs and remote providers.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

function requireRuntimeModule(fileName) {
  const candidates = [
    path.resolve(__dirname, "../Data/marion/runtime", fileName),
    path.resolve(process.cwd(), "Data/marion/runtime", fileName),
    path.resolve(__dirname, "../Data/marion/runtime/languagesphere", fileName),
    path.resolve(process.cwd(), "Data/marion/runtime/languagesphere", fileName)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return require(candidate);
    }
  }

  throw new Error(`Runtime module not found: ${fileName}`);
}

const UniversalTranslator = requireRuntimeModule("UniversalTranslatorAdapter.js");
const LanguageDetect = requireRuntimeModule("LanguageDetect.js");
const Glossary = requireRuntimeModule("TranslationGlossary.js");
const TranslationMemory = requireRuntimeModule("TranslationMemoryStore.js");

function assertOneOf(value, allowed, message) {
  assert.ok(
    allowed.includes(value),
    `${message}. Received ${JSON.stringify(value)}, expected one of ${JSON.stringify(allowed)}`
  );
}

function getResultText(result) {
  if (typeof result === "string") return result;
  if (result && typeof result.text === "string") return result.text;
  if (result && typeof result.translatedText === "string") return result.translatedText;
  if (result && typeof result.normalizedText === "string") return result.normalizedText;
  return "";
}

function getResultMeta(result) {
  if (!result || typeof result !== "object") return {};
  return result.meta || result.translationMeta || {};
}

function getAuthorityMeta(result) {
  if (!result || typeof result !== "object") return {};
  const meta = getResultMeta(result);
  return result.translationAuthority || meta.translationAuthority || meta.authority || {};
}

async function translateText(text, options) {
  if (UniversalTranslator && typeof UniversalTranslator.translateText === "function") {
    return UniversalTranslator.translateText(text, options);
  }

  if (UniversalTranslator && typeof UniversalTranslator.translate === "function") {
    return UniversalTranslator.translate(text, options);
  }

  throw new Error("UniversalTranslatorAdapter is missing translateText()/translate()");
}

async function applyUniversalTranslation(envelope, options) {
  if (UniversalTranslator && typeof UniversalTranslator.applyUniversalTranslation === "function") {
    return UniversalTranslator.applyUniversalTranslation(envelope, options);
  }

  throw new Error("UniversalTranslatorAdapter is missing applyUniversalTranslation()");
}

async function normalizeInputForMarion(text, options) {
  if (UniversalTranslator && typeof UniversalTranslator.normalizeInputForMarion === "function") {
    return UniversalTranslator.normalizeInputForMarion(text, options);
  }

  throw new Error("UniversalTranslatorAdapter is missing normalizeInputForMarion()");
}

function assertLanguageDetection() {
  const fr = LanguageDetect.detectLanguage("Bonjour, comment ça va aujourd'hui?");
  assert.strictEqual(fr.language, "fr", "French detection failed");

  const es = LanguageDetect.detectLanguage("Hola, cómo estás hoy?");
  assert.strictEqual(es.language, "es", "Spanish detection failed");

  const en = LanguageDetect.detectLanguage("Hello, how are you today?");
  assert.strictEqual(en.language, "en", "English detection failed");

  const ambiguous = LanguageDetect.detectLanguage("Nyx Marion LanguageSphere 12345");
  assert.ok(ambiguous && typeof ambiguous.language === "string", "Ambiguous detection should return a safe language payload");

  assertOneOf(
    ambiguous.language,
    ["en", "fr", "es", "unknown"],
    "Ambiguous detection should stay inside the supported detector contract"
  );
}

function assertTargetLanguageDetection() {
  assert.strictEqual(
    LanguageDetect.detectTargetLanguageFromRequest("Translate this to French"),
    "fr",
    "Target French request detection failed"
  );

  assert.strictEqual(
    LanguageDetect.detectTargetLanguageFromRequest("Translate this to Spanish"),
    "es",
    "Target Spanish request detection failed"
  );

  assert.strictEqual(
    LanguageDetect.detectTargetLanguageFromRequest("Please explain this in English"),
    "en",
    "Target English request detection failed"
  );
}

function assertGlossaryProtection() {
  const original =
    "Explain Marion Bridge, Final Authority, State Spine, Context Passport, LanguageSphere, and Sandblast.channel.";

  const protectedPayload = Glossary.protectText(original, {
    domain: "ai",
    extraTerms: ["Marion Bridge", "Final Authority", "State Spine", "Context Passport"]
  });

  assert.ok(
    protectedPayload.text.includes("__SB_TRANSLATION_PROTECTED_"),
    "Protected token was not applied"
  );

  assert.ok(
    Array.isArray(protectedPayload.tokens) && protectedPayload.tokens.length >= 4,
    "Expected protected glossary tokens to be captured"
  );

  const restored = Glossary.restoreText(protectedPayload.text, protectedPayload.tokens);

  assert.strictEqual(restored, original, "Glossary restoration failed");

  const terms = typeof Glossary.getProtectedTerms === "function"
    ? Glossary.getProtectedTerms({
        domain: "ai",
        extraTerms: ["Marion Bridge", "Final Authority", "State Spine", "Context Passport"]
      })
    : [];

  for (const protectedTerm of ["Marion Bridge", "Final Authority", "State Spine", "Context Passport"]) {
    assert.ok(
      terms.includes(protectedTerm),
      `Glossary is missing protected term: ${protectedTerm}`
    );
  }
}

async function assertAdapterTranslationGate() {
  const result = await translateText("Explain Marion Bridge in Spanish.", {
    sourceLanguage: "en",
    targetLanguage: "es",
    domain: "ai",
    tone: "calm-professional",
    protectedTerms: ["Marion Bridge"]
  });

  const text = getResultText(result);
  const meta = getResultMeta(result);
  const authority = getAuthorityMeta(result);

  assert.strictEqual(typeof text, "string", "Adapter should return text as a string");
  assert.ok(text.length > 0, "Adapter should not return empty text");

  assert.strictEqual(
    meta.targetLanguage,
    "es",
    "Adapter metadata should preserve requested target language"
  );

  assert.strictEqual(
    meta.sourceLanguage,
    "en",
    "Adapter metadata should preserve source language"
  );

  assert.strictEqual(
    text.includes("Marion Bridge"),
    true,
    "Adapter should preserve protected term: Marion Bridge"
  );

  assert.notStrictEqual(
    meta.finalAnswerAuthorized,
    true,
    "Translation gate must not authorize a final Marion answer"
  );

  assert.notStrictEqual(
    authority.finalAnswerAuthorized,
    true,
    "Translation authority metadata must not authorize a final Marion answer"
  );

  assert.ok(
    meta.marionAuthorityRequired === true ||
      authority.marionAuthorityRequired === true ||
      meta.finalAnswerAuthorized === false ||
      authority.finalAnswerAuthorized === false,
    "Adapter should expose Marion authority gating metadata"
  );
}

async function assertFinalEnvelopePreservation() {
  const envelope = {
    final: "Synapse brings Canada, Sports, and Finance together through Marion Bridge.",
    routeFamily: "general",
    authority: "marion-final",
    diagnostics: {
      loopHardlock: true
    }
  };

  const output = await applyUniversalTranslation(envelope, {
    sourceLanguage: "en",
    targetLanguage: "fr",
    domain: "media",
    emotion: "clear",
    protectedTerms: ["Marion Bridge"]
  });

  assert.ok(output && typeof output === "object", "Envelope translation should return an object");
  assert.notStrictEqual(output, envelope, "Envelope should be cloned before translation metadata is attached");

  assert.strictEqual(
    output.final,
    envelope.final,
    "Final text should remain safe during local/no-provider/manual-gate phase"
  );

  assert.strictEqual(
    output.routeFamily,
    envelope.routeFamily,
    "Envelope routeFamily should be preserved"
  );

  assert.strictEqual(
    output.authority,
    envelope.authority,
    "Envelope final authority should be preserved"
  );

  assert.ok(
    output.translationMeta,
    "Translation metadata should be attached to the cloned envelope"
  );

  assert.strictEqual(
    output.translationMeta.targetLanguage,
    "fr",
    "Translation metadata target language failed"
  );

  assert.notStrictEqual(
    output.translationMeta.finalAnswerAuthorized,
    true,
    "Final envelope translation metadata must not authorize final response directly"
  );
}

async function assertInputNormalizationSafety() {
  const normalized = await normalizeInputForMarion("Bonjour, peux-tu expliquer Synapse?", {
    context: "test"
  });

  assert.strictEqual(
    normalized.originalText,
    "Bonjour, peux-tu expliquer Synapse?",
    "Original multilingual input should be preserved"
  );

  assertOneOf(
    normalized.detectedLanguage,
    ["fr", "en", "es", "unknown"],
    "Detected language should be present and contract-safe"
  );

  assert.strictEqual(
    typeof normalized.normalizedText,
    "string",
    "Normalized text should be a string"
  );

  assert.notStrictEqual(
    normalized.finalAnswerAuthorized,
    true,
    "Input normalization must not authorize final response directly"
  );
}

function assertTranslationMemory() {
  if (typeof TranslationMemory.createTranslationMemoryStore !== "function") {
    throw new Error("TranslationMemoryStore is missing createTranslationMemoryStore()");
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nyx-translation-memory-"));
  const tempFile = path.join(tempDir, "translation_memory.test.json");

  try {
    const memory = TranslationMemory.createTranslationMemoryStore({
      filePath: tempFile,
      maxEntries: 10,
      ttlMs: 1000 * 60 * 60
    });

    const stored = memory.set({
      sourceLanguage: "en",
      targetLanguage: "fr",
      sourceText: "Start Reading",
      translatedText: "Commencer la lecture",
      domain: "interface",
      provider: "manual-test",
      confidence: 1,
      protectedTerms: ["Synapse"],
      glossaryVersion: "smoke-test"
    });

    assert.strictEqual(stored.stored, true, "Translation memory set failed");

    const hit = memory.get({
      sourceLanguage: "en",
      targetLanguage: "fr",
      sourceText: "Start Reading",
      domain: "interface",
      protectedTerms: ["Synapse"],
      glossaryVersion: "smoke-test"
    });

    assert.strictEqual(hit.hit, true, "Translation memory lookup failed");

    assert.strictEqual(
      hit.entry.translatedText,
      "Commencer la lecture",
      "Translation memory returned wrong translation"
    );

    const wrongLanguageHit = memory.get({
      sourceLanguage: "en",
      targetLanguage: "es",
      sourceText: "Start Reading",
      domain: "interface",
      protectedTerms: ["Synapse"],
      glossaryVersion: "smoke-test"
    });

    assert.strictEqual(
      wrongLanguageHit.hit,
      false,
      "Translation memory must not leak across target languages"
    );

    const wrongGlossaryHit = memory.get({
      sourceLanguage: "en",
      targetLanguage: "fr",
      sourceText: "Start Reading",
      domain: "interface",
      protectedTerms: ["DifferentTerm"],
      glossaryVersion: "smoke-test"
    });

    assert.strictEqual(
      wrongGlossaryHit.hit,
      false,
      "Translation memory must not leak across protected-term contexts"
    );

    const stats = memory.stats();
    assert.strictEqual(stats.totalEntries, 1, "Translation memory stats failed");

    memory.clear();

    assert.strictEqual(
      memory.stats().totalEntries,
      0,
      "Translation memory clear failed"
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runSmokeTests() {
  console.log("Running Universal Translator smoke tests...");

  assertLanguageDetection();
  assertTargetLanguageDetection();
  assertGlossaryProtection();
  await assertAdapterTranslationGate();
  await assertFinalEnvelopePreservation();
  await assertInputNormalizationSafety();
  assertTranslationMemory();

  console.log("Universal Translator smoke tests passed.");
}

module.exports = {
  runSmokeTests,
  assertLanguageDetection,
  assertTargetLanguageDetection,
  assertGlossaryProtection,
  assertAdapterTranslationGate,
  assertFinalEnvelopePreservation,
  assertInputNormalizationSafety,
  assertTranslationMemory
};

/**
 * Jest mode:
 * Register at least one test() block so Jest does not throw:
 * "Your test suite must contain at least one test."
 */
if (typeof describe === "function" && typeof test === "function") {
  describe("Universal Translator smoke tests", () => {
    test("passes the LanguageSphere translation gate smoke suite", async () => {
      await runSmokeTests();
    }, 30000);
  });
}

/**
 * Node-script mode:
 * Preserve direct execution compatibility.
 */
if (require.main === module) {
  runSmokeTests().catch((error) => {
    console.error("Universal Translator smoke tests failed.");
    console.error(error);
    process.exit(1);
  });
}
