"use strict";

/**
 * universal-translator-integration.test.js
 * Marion/Nyx Universal Translator integration regression.
 *
 * Run from project root:
 * node tests/universal-translator-integration.test.js
 *
 * Purpose:
 * - Prove UniversalTranslatorAdapter can sit beside Marion safely.
 * - Confirm multilingual input normalization does not destroy original text.
 * - Confirm final-envelope translation does not compromise authority fields.
 * - Confirm provider failure returns original text/envelope.
 * - Confirm glossary-protected terms survive translation.
 *
 * Notes:
 * - This test assumes these files exist:
 *   Data/marion/runtime/UniversalTranslatorAdapter.js
 *   Data/marion/runtime/LocalTranslationProvider.js
 *   Data/marion/runtime/TranslationGlossary.js
 *   Data/marion/runtime/LanguageDetect.js
 *   Data/marion/runtime/TranslationMemoryStore.js
 *
 * - It does not require paid APIs.
 * - It does not require Argos, LibreTranslate, Hugging Face, or OPUS yet.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

const ADAPTER_PATH = path.join(
  PROJECT_ROOT,
  "Data",
  "marion",
  "runtime",
  "UniversalTranslatorAdapter.js"
);

const CONFIG_PATH = path.join(
  PROJECT_ROOT,
  "Data",
  "marion",
  "runtime",
  "translationConfig.json"
);

const PROVIDER_PATH = path.join(
  PROJECT_ROOT,
  "Data",
  "marion",
  "runtime",
  "LocalTranslationProvider.js"
);

const GLOSSARY_PATH = path.join(
  PROJECT_ROOT,
  "Data",
  "marion",
  "runtime",
  "TranslationGlossary.js"
);

function requireFresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function ensureFileExists(filePath, label) {
  assert.ok(
    fs.existsSync(filePath),
    `${label} missing at expected path: ${filePath}`
  );
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON at ${filePath}: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      existed: false,
      content: null
    };
  }

  return {
    existed: true,
    content: fs.readFileSync(filePath, "utf8")
  };
}

function restoreFile(filePath, backup) {
  if (!backup.existed) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }

  fs.writeFileSync(filePath, backup.content, "utf8");
}

function createTestConfig(overrides = {}) {
  return {
    version: "0.3.0-test",
    enabled: true,
    defaultSourceLanguage: "auto",
    defaultTargetLanguage: "en",
    supportedLanguages: ["en", "fr", "es"],
    provider: {
      active: "manualDictionary",
      fallback: "identity",
      allowRemoteProviders: false,
      allowSelfHostedProviders: true,
      endpoint: null,
      timeoutMs: 1500,
      maxCharactersPerRequest: 4500,
      ...(overrides.provider || {})
    },
    behavior: {
      preserveFinalEnvelope: true,
      translateFinalOnly: true,
      allowInputNormalization: true,
      attachTranslationMeta: true,
      failClosedToOriginal: true,
      protectBrandTerms: true,
      protectDomainTerms: true,
      preserveEmotionTone: true,
      preserveUserIntent: true,
      ...(overrides.behavior || {})
    },
    routing: {
      inputNormalizationTarget: "en",
      finalAnswerTranslation: true,
      domainAwareTranslation: true,
      emotionAwareTranslation: true,
      ...(overrides.routing || {})
    },
    translationMemory: {
      /**
       * Keep memory disabled in integration tests unless specifically testing memory.
       * This avoids stale memory making provider checks look like false positives.
       */
      enabled: false,
      reuseExactMatches: true,
      reuseNormalizedMatches: true,
      ...(overrides.translationMemory || {})
    },
    telemetry: {
      enabled: true,
      logProvider: true,
      logLanguagePair: true,
      logCharacterCount: true,
      logFailures: true,
      logProtectedTermsCount: true,
      ...(overrides.telemetry || {})
    },
    protectedTerms: [
      "Sandblast",
      "Sandblast Channel",
      "Synapse",
      "Nyx",
      "Marion",
      "Finance & Economics"
    ]
  };
}

async function run() {
  console.log("Running Universal Translator integration regression...");

  ensureFileExists(ADAPTER_PATH, "UniversalTranslatorAdapter.js");
  ensureFileExists(PROVIDER_PATH, "LocalTranslationProvider.js");
  ensureFileExists(GLOSSARY_PATH, "TranslationGlossary.js");

  const configBackup = backupFile(CONFIG_PATH);

  try {
    /**
     * Test config: manualDictionary provider.
     * This proves provider routing without paid API or local ML engine.
     */
    writeJson(CONFIG_PATH, createTestConfig());

    let Translator = requireFresh(ADAPTER_PATH);

    if (typeof Translator.resetUniversalTranslatorCaches === "function") {
      Translator.resetUniversalTranslatorCaches();
    }

    /**
     * 1. Basic language detection contract.
     */
    const frDetect = Translator.detectLanguage("Bonjour, comment ça va?");
    assert.strictEqual(
      frDetect.language,
      "fr",
      "French detection should return fr"
    );

    const esDetect = Translator.detectLanguage("Hola, cómo estás?");
    assert.strictEqual(
      esDetect.language,
      "es",
      "Spanish detection should return es"
    );

    const enDetect = Translator.detectLanguage("Hello, how are you?");
    assert.strictEqual(
      enDetect.language,
      "en",
      "English detection should return en"
    );

    /**
     * 2. Known manual dictionary phrase should translate.
     */
    const manualFr = await Translator.translateText("Start Reading", {
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "interface",
      context: "integration-test"
    });

    assert.strictEqual(
      manualFr.text,
      "Commencer la lecture",
      "manualDictionary should translate Start Reading to French"
    );

    assert.strictEqual(
      manualFr.meta.translated,
      true,
      "manualDictionary hit should mark translated=true"
    );

    assert.strictEqual(
      manualFr.meta.targetLanguage,
      "fr",
      "target language metadata should be fr"
    );

    /**
     * 3. Same-language request should bypass translation.
     */
    const sameLanguage = await Translator.translateText("Start Reading", {
      sourceLanguage: "en",
      targetLanguage: "en",
      domain: "interface"
    });

    assert.strictEqual(
      sameLanguage.text,
      "Start Reading",
      "same-language translation should preserve original"
    );

    assert.strictEqual(
      sameLanguage.meta.translated,
      false,
      "same-language translation should not mark translated=true"
    );

    assert.ok(
      sameLanguage.meta.warning === "same-language" ||
        sameLanguage.meta.warning === "translation-not-required-or-unsupported",
      "same-language request should include safe bypass warning"
    );

    /**
     * 4. Unknown phrase should fail closed to original under manualDictionary.
     */
    const unknownPhrase =
      "This phrase is intentionally not present in the manual dictionary.";

    const manualMiss = await Translator.translateText(unknownPhrase, {
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "general"
    });

    assert.strictEqual(
      manualMiss.text,
      unknownPhrase,
      "manualDictionary miss should preserve original text"
    );

    assert.strictEqual(
      manualMiss.meta.translated,
      false,
      "manualDictionary miss should not mark translated=true"
    );

    assert.ok(
      String(manualMiss.meta.warning || "").includes("miss") ||
        String(manualMiss.meta.warning || "").includes("not"),
      "manualDictionary miss should include warning metadata"
    );

    /**
     * 5. Final-envelope authority preservation.
     */
    const finalEnvelope = {
      final: "Start Reading",
      authority: "marion-final",
      routeFamily: "general",
      finalSignature: "trusted-final",
      diagnostics: {
        loopHardlock: true,
        source: "integration-test"
      }
    };

    const translatedEnvelope = await Translator.applyUniversalTranslation(
      finalEnvelope,
      {
        sourceLanguage: "en",
        targetLanguage: "fr",
        domain: "interface",
        emotion: "clear",
        context: "final-output"
      }
    );

    assert.notStrictEqual(
      translatedEnvelope,
      finalEnvelope,
      "applyUniversalTranslation should return a cloned envelope"
    );

    assert.strictEqual(
      translatedEnvelope.final,
      "Commencer la lecture",
      "final text should be translated when provider returns a hit"
    );

    assert.strictEqual(
      translatedEnvelope.authority,
      "marion-final",
      "authority field must be preserved"
    );

    assert.strictEqual(
      translatedEnvelope.routeFamily,
      "general",
      "routeFamily field must be preserved"
    );

    assert.strictEqual(
      translatedEnvelope.finalSignature,
      "trusted-final",
      "finalSignature field must be preserved"
    );

    assert.deepStrictEqual(
      translatedEnvelope.diagnostics,
      finalEnvelope.diagnostics,
      "diagnostics object should be preserved"
    );

    assert.ok(
      translatedEnvelope.translationMeta,
      "translationMeta should be attached to translated envelope"
    );

    assert.strictEqual(
      translatedEnvelope.translationMeta.finalTextSlot,
      "final",
      "translationMeta should identify final text slot"
    );

    /**
     * 6. Nested final envelope preservation.
     */
    const nestedEnvelope = {
      finalEnvelope: {
        reply: "Start Reading"
      },
      authority: "marion-final",
      routeFamily: "general",
      diagnostics: {
        loopHardlock: true
      }
    };

    const nestedTranslated = await Translator.applyUniversalTranslation(
      nestedEnvelope,
      {
        sourceLanguage: "en",
        targetLanguage: "es",
        domain: "interface"
      }
    );

    assert.strictEqual(
      nestedTranslated.finalEnvelope.reply,
      "Comenzar a leer",
      "nested finalEnvelope.reply should be translated"
    );

    assert.strictEqual(
      nestedTranslated.authority,
      "marion-final",
      "nested envelope authority should be preserved"
    );

    assert.ok(
      nestedTranslated.translationMeta,
      "nested envelope should receive translationMeta"
    );

    /**
     * 7. Input normalization contract.
     * During no real provider phase, unknown full French/Spanish phrases may remain original.
     * The important requirement: originalText must never be lost.
     */
    const normalizedFr = await Translator.normalizeInputForMarion(
      "Bonjour, peux-tu expliquer Synapse?",
      {
        domain: "general",
        context: "pre-routing"
      }
    );

    assert.strictEqual(
      normalizedFr.originalText,
      "Bonjour, peux-tu expliquer Synapse?",
      "input normalization must preserve originalText"
    );

    assert.strictEqual(
      typeof normalizedFr.normalizedText,
      "string",
      "input normalization must return normalizedText as string"
    );

    assert.strictEqual(
      normalizedFr.detectedLanguage,
      "fr",
      "input normalization should detect French"
    );

    assert.ok(
      Object.prototype.hasOwnProperty.call(normalizedFr, "translatedForRouting"),
      "input normalization should include translatedForRouting flag"
    );

    /**
     * 8. Brand/glossary protection.
     * This checks the glossary itself and the adapter metadata path.
     */
    const brandPhrase = "Synapse is live on Sandblast Channel.";

    const brandTranslation = await Translator.translateText(brandPhrase, {
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "media",
      protectedTerms: ["Synapse", "Sandblast Channel"]
    });

    /**
     * If manual dictionary has this phrase, protected terms should still remain undamaged.
     * If not, fail-closed original should also keep them intact.
     */
    assert.ok(
      brandTranslation.text.includes("Synapse"),
      "protected brand term Synapse should survive translation path"
    );

    assert.ok(
      brandTranslation.text.includes("Sandblast Channel"),
      "protected brand term Sandblast Channel should survive translation path"
    );

    assert.ok(
      typeof brandTranslation.meta.protectedTermsApplied === "number",
      "protectedTermsApplied metadata should exist"
    );

    /**
     * 9. Character cap guard.
     */
    const longText = "x".repeat(5000);

    const capped = await Translator.translateText(longText, {
      sourceLanguage: "en",
      targetLanguage: "fr"
    });

    assert.strictEqual(
      capped.text,
      longText,
      "over-character-limit text should be returned unchanged"
    );

    assert.strictEqual(
      capped.meta.translated,
      false,
      "over-character-limit text should not be translated"
    );

    assert.ok(
      String(capped.meta.warning || "").includes("max"),
      "over-character-limit result should contain max warning"
    );

    /**
     * 10. Provider failure must fail closed to original.
     * We switch config to localHttp with a bad endpoint.
     */
    writeJson(
      CONFIG_PATH,
      createTestConfig({
        provider: {
          active: "localHttp",
          endpoint: "http://127.0.0.1:9/translate",
          timeoutMs: 300,
          maxCharactersPerRequest: 4500
        },
        translationMemory: {
          enabled: false
        }
      })
    );

    Translator = requireFresh(ADAPTER_PATH);

    if (typeof Translator.resetUniversalTranslatorCaches === "function") {
      Translator.resetUniversalTranslatorCaches();
    }

    const failureText = "Start Reading";

    const failedProvider = await Translator.translateText(failureText, {
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "interface"
    });

    assert.strictEqual(
      failedProvider.text,
      failureText,
      "failed provider must return original text"
    );

    assert.strictEqual(
      failedProvider.meta.translated,
      false,
      "failed provider must not mark translated=true"
    );

    assert.ok(
      String(failedProvider.meta.warning || "").includes("translation-failed") ||
        String(failedProvider.meta.warning || "").includes("provider"),
      "failed provider should include provider failure warning"
    );

    /**
     * 11. Disabled translator should return original envelope untouched.
     */
    writeJson(
      CONFIG_PATH,
      createTestConfig({
        provider: {
          active: "manualDictionary"
        }
      })
    );

    const disabledConfig = readJsonSafe(CONFIG_PATH);
    disabledConfig.enabled = false;
    writeJson(CONFIG_PATH, disabledConfig);

    Translator = requireFresh(ADAPTER_PATH);

    if (typeof Translator.resetUniversalTranslatorCaches === "function") {
      Translator.resetUniversalTranslatorCaches();
    }

    const disabledEnvelope = {
      final: "Start Reading",
      authority: "marion-final"
    };

    const disabledOutput = await Translator.applyUniversalTranslation(
      disabledEnvelope,
      {
        sourceLanguage: "en",
        targetLanguage: "fr"
      }
    );

    assert.strictEqual(
      disabledOutput,
      disabledEnvelope,
      "disabled translator should return same envelope reference untouched"
    );

    console.log("Universal Translator integration regression passed.");
  } finally {
    restoreFile(CONFIG_PATH, configBackup);

    /**
     * Clear adapter cache after restoring config.
     */
    if (fs.existsSync(ADAPTER_PATH)) {
      const Translator = requireFresh(ADAPTER_PATH);
      if (typeof Translator.resetUniversalTranslatorCaches === "function") {
        Translator.resetUniversalTranslatorCaches();
      }
    }
  }
}

run().catch((error) => {
  console.error("Universal Translator integration regression failed.");
  console.error(error);
  process.exit(1);
});
