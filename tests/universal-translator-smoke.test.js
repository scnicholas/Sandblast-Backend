"use strict";

/**
 * universal-translator-smoke.test.js
 * Smoke tests for Marion/Nyx Universal Translator spine.
 *
 * Run from project root:
 * node tests/universal-translator-smoke.test.js
 *
 * This test intentionally avoids paid APIs and remote providers.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const UniversalTranslator = require("../Data/marion/runtime/UniversalTranslatorAdapter.js");
const LanguageDetect = require("../Data/marion/runtime/LanguageDetect.js");
const Glossary = require("../Data/marion/runtime/TranslationGlossary.js");
const {
  createTranslationMemoryStore
} = require("../Data/marion/runtime/TranslationMemoryStore.js");

async function run() {
  console.log("Running Universal Translator smoke tests...");

  /**
   * 1. Language detection
   */
  const fr = LanguageDetect.detectLanguage("Bonjour, comment ça va aujourd'hui?");
  assert.strictEqual(fr.language, "fr", "French detection failed");

  const es = LanguageDetect.detectLanguage("Hola, cómo estás hoy?");
  assert.strictEqual(es.language, "es", "Spanish detection failed");

  const en = LanguageDetect.detectLanguage("Hello, how are you today?");
  assert.strictEqual(en.language, "en", "English detection failed");

  /**
   * 2. Target-language request detection
   */
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

  /**
   * 3. Glossary protection/restoration
   */
  const protectedPayload = Glossary.protectText(
    "Synapse is part of Sandblast Channel and works with Marion.",
    { domain: "ai" }
  );

  assert.ok(
    protectedPayload.text.includes("__SB_TRANSLATION_PROTECTED_"),
    "Protected token was not applied"
  );

  const restored = Glossary.restoreText(
    protectedPayload.text,
    protectedPayload.tokens
  );

  assert.strictEqual(
    restored,
    "Synapse is part of Sandblast Channel and works with Marion.",
    "Glossary restoration failed"
  );

  /**
   * 4. Universal adapter should fail closed when no provider is configured.
   */
  const translated = await UniversalTranslator.translateText(
    "Synapse is live on Sandblast Channel.",
    {
      sourceLanguage: "en",
      targetLanguage: "fr"
    }
  );

  assert.strictEqual(
    translated.text,
    "Synapse is live on Sandblast Channel.",
    "Identity fallback should preserve original text"
  );

  assert.strictEqual(
    translated.meta.translated,
    false,
    "No-provider phase should not mark translation as completed"
  );

  /**
   * 5. Final envelope preservation
   */
  const envelope = {
    final: "Synapse brings Canada, Sports, and Finance together.",
    routeFamily: "general",
    authority: "marion-final",
    diagnostics: {
      loopHardlock: true
    }
  };

  const output = await UniversalTranslator.applyUniversalTranslation(envelope, {
    sourceLanguage: "en",
    targetLanguage: "fr",
    domain: "media",
    emotion: "clear"
  });

  assert.strictEqual(
    output.final,
    envelope.final,
    "Final text should remain unchanged during no-provider phase"
  );

  assert.strictEqual(
    output.routeFamily,
    envelope.routeFamily,
    "Envelope route family should be preserved"
  );

  assert.strictEqual(
    output.authority,
    envelope.authority,
    "Final authority should be preserved"
  );

  assert.ok(
    output.translationMeta,
    "Translation metadata should be attached"
  );

  assert.strictEqual(
    output.translationMeta.targetLanguage,
    "fr",
    "Translation metadata target language failed"
  );

  /**
   * 6. Input normalization should preserve original text.
   */
  const normalized = await UniversalTranslator.normalizeInputForMarion(
    "Bonjour, peux-tu expliquer Synapse?",
    {
      context: "test"
    }
  );

  assert.strictEqual(
    normalized.originalText,
    "Bonjour, peux-tu expliquer Synapse?",
    "Original multilingual input should be preserved"
  );

  assert.ok(
    ["fr", "en"].includes(normalized.detectedLanguage),
    "Detected language should be present"
  );

  assert.strictEqual(
    typeof normalized.normalizedText,
    "string",
    "Normalized text should be a string"
  );

  /**
   * 7. Translation memory file-backed storage.
   */
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nyx-translation-memory-"));
  const tempFile = path.join(tempDir, "translation_memory.test.json");

  const memory = createTranslationMemoryStore({
    filePath: tempFile,
    maxEntries: 10
  });

  const stored = memory.set({
    sourceLanguage: "en",
    targetLanguage: "fr",
    sourceText: "Start Reading",
    translatedText: "Commencer la lecture",
    domain: "interface",
    provider: "manual-test",
    confidence: 1
  });

  assert.strictEqual(stored.stored, true, "Translation memory set failed");

  const hit = memory.get({
    sourceLanguage: "en",
    targetLanguage: "fr",
    sourceText: "Start Reading",
    domain: "interface"
  });

  assert.strictEqual(hit.hit, true, "Translation memory lookup failed");

  assert.strictEqual(
    hit.entry.translatedText,
    "Commencer la lecture",
    "Translation memory returned wrong translation"
  );

  const stats = memory.stats();

  assert.strictEqual(stats.totalEntries, 1, "Translation memory stats failed");

  memory.clear();

  assert.strictEqual(
    memory.stats().totalEntries,
    0,
    "Translation memory clear failed"
  );

  console.log("Universal Translator smoke tests passed.");
}

run().catch((error) => {
  console.error("Universal Translator smoke tests failed.");
  console.error(error);
  process.exit(1);
});
