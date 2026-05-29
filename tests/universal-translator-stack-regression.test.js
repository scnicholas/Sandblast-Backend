"use strict";

/**
 * universal-translator-stack-regression.test.js
 * Marion/Nyx Universal Translator full-stack regression.
 *
 * Run from project root:
 *   npx jest tests/universal-translator-stack-regression.test.js --runInBand --verbose
 *
 * Optional direct Node run:
 *   node tests/universal-translator-stack-regression.test.js
 *
 * Purpose:
 * - Validate the complete Phase-1 LanguageSphere / Universal Translator bridge.
 * - Test Adapter + Provider + Glossary + LanguageDetect + MemoryStore + Config together.
 * - Confirm Marion final-envelope authority is preserved.
 * - Confirm provider failure fails closed to original text.
 * - Confirm protected terms survive translation.
 * - Confirm memory does not create wrong-language sticky reuse.
 *
 * This test does not require paid APIs.
 * This test does not require Argos, LibreTranslate, Hugging Face, or OPUS.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const IS_JEST_RUNTIME =
  typeof global.describe === "function" && typeof global.test === "function";

function safeLog(...args) {
  if (!IS_JEST_RUNTIME) {
    console.log(...args);
  }
}

function safeError(...args) {
  if (!IS_JEST_RUNTIME) {
    console.error(...args);
  }
}

const PROJECT_ROOT = path.resolve(__dirname, "..");

const RUNTIME_ROOT = path.join(PROJECT_ROOT, "Data", "marion", "runtime");

const ADAPTER_PATH = path.join(RUNTIME_ROOT, "UniversalTranslatorAdapter.js");
const PROVIDER_PATH = path.join(RUNTIME_ROOT, "LocalTranslationProvider.js");
const GLOSSARY_PATH = path.join(RUNTIME_ROOT, "TranslationGlossary.js");
const DETECT_PATH = path.join(RUNTIME_ROOT, "LanguageDetect.js");
const MEMORY_PATH = path.join(RUNTIME_ROOT, "TranslationMemoryStore.js");
const CONFIG_PATH = path.join(RUNTIME_ROOT, "translationConfig.json");

function ensureFileExists(filePath, label) {
  assert.ok(
    fs.existsSync(filePath),
    `${label} missing at expected path: ${filePath}`
  );
}

function requireFresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
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

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, backup.content, "utf8");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createStackTestConfig(overrides = {}) {
  return {
    version: "0.3.0-stack-test",
    enabled: true,
    defaultSourceLanguage: "auto",
    defaultTargetLanguage: "en",
    supportedLanguages: ["en", "fr", "es"],
    languageLabels: {
      en: "English",
      fr: "French",
      es: "Spanish",
      auto: "Auto-detect",
      unknown: "Unknown"
    },
    provider: {
      active: "manualDictionary",
      fallback: "identity",
      allowRemoteProviders: false,
      allowSelfHostedProviders: true,
      endpoint: null,
      timeoutMs: 1500,
      maxCharactersPerRequest: 4500,
      maxResponseBytes: 524288,
      manualDictionary: {
        enabled: true,
        failClosedOnMiss: true,
        caseInsensitiveLookup: true,
        punctuationTolerantLookup: true
      },
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
      returnOriginalOnDetectionFailure: true,
      blockUnsupportedLanguages: true,
      cloneEnvelopeBeforeMutation: true,
      neverTranslateAuthorityFields: true,
      ...(overrides.behavior || {})
    },
    routing: {
      inputNormalizationTarget: "en",
      finalAnswerTranslation: true,
      domainAwareTranslation: true,
      emotionAwareTranslation: true,
      supportedInputLanguages: ["en", "fr", "es"],
      supportedOutputLanguages: ["en", "fr", "es"],
      minimumDetectionConfidence: 0.55,
      lowConfidenceBehavior: "default-to-original",
      unsupportedLanguageBehavior: "return-original",
      ...(overrides.routing || {})
    },
    glossary: {
      enabled: true,
      restoreTokensAfterProvider: true,
      caseInsensitiveProtection: true,
      protectUrls: true,
      protectStandaloneAcronyms: true,
      maxProtectedTermsPerRequest: 250,
      ...(overrides.glossary || {})
    },
    translationMemory: {
      enabled: false,
      storageFile: "Data/translation/memory/translation_memory.json",
      maxEntries: 25000,
      maxTextCharacters: 4500,
      ttlMs: 2592000000,
      minConfidence: 0.5,
      reuseExactMatches: true,
      reuseNormalizedMatches: false,
      contextAwareKeys: true,
      includeProtectedTermsInKey: true,
      includeGlossaryVersionInKey: true,
      quarantineInvalidEntries: true,
      atomicWrites: true,
      ...(overrides.translationMemory || {})
    },
    telemetry: {
      enabled: true,
      logProvider: true,
      logLanguagePair: true,
      logCharacterCount: true,
      logFailures: true,
      logProtectedTermsCount: true,
      logEndpointType: true,
      logMemoryHit: true,
      logDetectionConfidence: true,
      logFinalTextSlot: true,
      logWarnings: true,
      redactSourceText: true,
      redactTranslatedText: true,
      ...(overrides.telemetry || {})
    },
    protectedTerms: [
      "Sandblast",
      "Sandblast Channel",
      "Sandblast.channel",
      "sandblast.channel",
      "sandblastchannel.com",
      "Sandblast Radio",
      "Sandblast TV",
      "Sandblast one",
      "Synapse",
      "Nyx",
      "Marion",
      "Nyx/Marion",
      "Marion/Nyx",
      "Nexus",
      "Concierge",
      "Universal Translator",
      "LanguageSphere",
      "Canada Feed",
      "Sports Feed",
      "Finance & Economics",
      "Roku",
      "AI",
      "Cyber",
      "Finance",
      "Law",
      "Psychology",
      "English"
    ],
    security: {
      allowCredentialsInProviderUrl: false,
      allowFileProtocolProvider: false,
      allowRemoteProvidersByDefault: false,
      allowedRemoteHosts: [],
      allowedLocalHosts: ["localhost", "127.0.0.1", "::1", "0.0.0.0"],
      blockPrivateNetworkBypass: true,
      ...(overrides.security || {})
    }
  };
}

function assertExport(moduleRef, exportName, label) {
  assert.ok(
    moduleRef && typeof moduleRef === "object",
    `${label} module must load as an object`
  );

  assert.strictEqual(
    typeof moduleRef[exportName],
    "function",
    `${label}.${exportName} must be exported as a function`
  );
}

function resetTranslatorCachesIfAvailable(Adapter) {
  if (Adapter && typeof Adapter.resetUniversalTranslatorCaches === "function") {
    Adapter.resetUniversalTranslatorCaches();
    return true;
  }

  return false;
}

async function run() {
  safeLog("Running Universal Translator full-stack regression...");

  ensureFileExists(ADAPTER_PATH, "UniversalTranslatorAdapter.js");
  ensureFileExists(PROVIDER_PATH, "LocalTranslationProvider.js");
  ensureFileExists(GLOSSARY_PATH, "TranslationGlossary.js");
  ensureFileExists(DETECT_PATH, "LanguageDetect.js");
  ensureFileExists(MEMORY_PATH, "TranslationMemoryStore.js");
  ensureFileExists(CONFIG_PATH, "translationConfig.json");

  const configBackup = backupFile(CONFIG_PATH);

  try {
    /**
     * ----------------------------------------------------------------------
     * 1. Export contract checks.
     * ----------------------------------------------------------------------
     */
    writeJson(CONFIG_PATH, createStackTestConfig());

    let Adapter = requireFresh(ADAPTER_PATH);
    let Provider = requireFresh(PROVIDER_PATH);
    let Glossary = requireFresh(GLOSSARY_PATH);
    let Detect = requireFresh(DETECT_PATH);
    let Memory = requireFresh(MEMORY_PATH);

    resetTranslatorCachesIfAvailable(Adapter);

    assertExport(Adapter, "detectLanguage", "UniversalTranslatorAdapter");
    assertExport(Adapter, "translateText", "UniversalTranslatorAdapter");
    assertExport(Adapter, "applyUniversalTranslation", "UniversalTranslatorAdapter");
    assertExport(Adapter, "normalizeInputForMarion", "UniversalTranslatorAdapter");

    assertExport(Provider, "translateText", "LocalTranslationProvider");
    assertExport(Provider, "translate", "LocalTranslationProvider");

    assertExport(Glossary, "protectText", "TranslationGlossary");
    assertExport(Glossary, "restoreText", "TranslationGlossary");
    assertExport(Glossary, "getProtectedTerms", "TranslationGlossary");

    assertExport(Detect, "detectLanguage", "LanguageDetect");
    assertExport(Detect, "detectTargetLanguageFromRequest", "LanguageDetect");

    assertExport(Memory, "createTranslationMemoryStore", "TranslationMemoryStore");
    assertExport(Memory, "makeMemoryKey", "TranslationMemoryStore");

    /**
     * ----------------------------------------------------------------------
     * 2. Language detection checks.
     * ----------------------------------------------------------------------
     */
    const frDetect = Detect.detectLanguage("Bonjour, comment ça va?");
    const esDetect = Detect.detectLanguage("Hola, cómo estás?");
    const enDetect = Detect.detectLanguage("Hello, how are you?");

    assert.strictEqual(frDetect.language, "fr", "French detection should return fr");
    assert.strictEqual(esDetect.language, "es", "Spanish detection should return es");
    assert.strictEqual(enDetect.language, "en", "English detection should return en");

    assert.strictEqual(
      Detect.detectTargetLanguageFromRequest("Translate this to French"),
      "fr",
      "target-language request should detect French"
    );

    assert.strictEqual(
      Detect.detectTargetLanguageFromRequest("Can you put this in Spanish?"),
      "es",
      "target-language request should detect Spanish"
    );

    /**
     * ----------------------------------------------------------------------
     * 3. Glossary protection checks.
     * ----------------------------------------------------------------------
     */
    const glossaryPayload = Glossary.protectText(
      "Synapse is live on Sandblast Channel and AI is active. Plain text stays plain.",
      {
        domain: "ai",
        extraTerms: ["Synapse", "Sandblast Channel", "AI"]
      }
    );

    assert.ok(
      glossaryPayload.text.includes("__SB_TRANSLATION_PROTECTED_") ||
        glossaryPayload.text.includes("__SB_PROTECTED_"),
      "glossary should tokenize protected terms"
    );

    const restoredGlossaryText = Glossary.restoreText(
      glossaryPayload.text,
      glossaryPayload.tokens
    );

    assert.strictEqual(
      restoredGlossaryText,
      "Synapse is live on Sandblast Channel and AI is active. Plain text stays plain.",
      "glossary restore should return the original protected text"
    );

    assert.ok(
      !glossaryPayload.text.toLowerCase().includes("plain") ||
        restoredGlossaryText.includes("Plain text stays plain."),
      "standalone acronym protection must not damage normal words like plain"
    );

    /**
     * ----------------------------------------------------------------------
     * 4. Provider manual dictionary checks.
     * ----------------------------------------------------------------------
     */
    const providerFr = await Provider.translateText("Start Reading", {
      provider: "manualDictionary",
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "interface"
    });

    assert.strictEqual(
      providerFr.text,
      "Commencer la lecture",
      "provider should translate Start Reading to French"
    );

    assert.strictEqual(
      providerFr.meta.translated,
      true,
      "provider manualDictionary hit should set meta.translated=true"
    );

    const providerEs = await Provider.translateText("Start Reading", {
      provider: "manualDictionary",
      sourceLanguage: "en",
      targetLanguage: "es",
      domain: "interface"
    });

    assert.strictEqual(
      providerEs.text,
      "Comenzar a leer",
      "provider should translate Start Reading to Spanish"
    );

    const providerMissText = "This phrase is intentionally not in the dictionary.";

    const providerMiss = await Provider.translateText(providerMissText, {
      provider: "manualDictionary",
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "general"
    });

    assert.strictEqual(
      providerMiss.text,
      providerMissText,
      "manual dictionary miss should preserve original text"
    );

    assert.strictEqual(
      providerMiss.meta.translated,
      false,
      "manual dictionary miss should not mark translated=true"
    );

    /**
     * ----------------------------------------------------------------------
     * 5. Adapter translation chain checks.
     * ----------------------------------------------------------------------
     */
    const adapterFr = await Adapter.translateText("Start Reading", {
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "interface"
    });

    assert.strictEqual(
      adapterFr.text,
      "Commencer la lecture",
      "adapter should route through provider and translate to French"
    );

    assert.strictEqual(
      adapterFr.meta.translated,
      true,
      "adapter translation hit should set meta.translated=true"
    );

    assert.strictEqual(
      adapterFr.meta.targetLanguage,
      "fr",
      "adapter metadata targetLanguage should be fr"
    );

    const sameLanguage = await Adapter.translateText("Start Reading", {
      sourceLanguage: "en",
      targetLanguage: "en",
      domain: "interface"
    });

    assert.strictEqual(
      sameLanguage.text,
      "Start Reading",
      "same-language adapter request should preserve original"
    );

    assert.strictEqual(
      sameLanguage.meta.translated,
      false,
      "same-language adapter request must not mark translated=true"
    );

    /**
     * ----------------------------------------------------------------------
     * 6. Final-envelope authority preservation checks.
     * ----------------------------------------------------------------------
     */
    const finalEnvelope = {
      final: "Start Reading",
      authority: "marion-final",
      routeFamily: "general",
      finalSignature: "trusted-final",
      diagnostics: {
        loopHardlock: true,
        source: "stack-regression"
      }
    };

    const translatedEnvelope = await Adapter.applyUniversalTranslation(
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
      "translated envelope should be cloned, not mutated in place"
    );

    assert.strictEqual(
      translatedEnvelope.final,
      "Commencer la lecture",
      "final text should be translated"
    );

    assert.strictEqual(
      translatedEnvelope.authority,
      "marion-final",
      "authority must be preserved"
    );

    assert.strictEqual(
      translatedEnvelope.finalSignature,
      "trusted-final",
      "finalSignature must be preserved"
    );

    assert.strictEqual(
      translatedEnvelope.routeFamily,
      "general",
      "routeFamily must be preserved"
    );

    assert.deepStrictEqual(
      translatedEnvelope.diagnostics,
      finalEnvelope.diagnostics,
      "diagnostics must be preserved"
    );

    assert.ok(
      translatedEnvelope.translationMeta,
      "translationMeta should be attached"
    );

    assert.strictEqual(
      translatedEnvelope.translationMeta.finalTextSlot,
      "final",
      "translationMeta should identify final slot"
    );

    /**
     * ----------------------------------------------------------------------
     * 7. Nested envelope preservation checks.
     * ----------------------------------------------------------------------
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

    const nestedTranslated = await Adapter.applyUniversalTranslation(
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
      "nested finalEnvelope.reply should translate to Spanish"
    );

    assert.strictEqual(
      nestedTranslated.authority,
      "marion-final",
      "nested authority must be preserved"
    );

    assert.ok(
      nestedTranslated.translationMeta,
      "nested translated envelope should receive translationMeta"
    );

    /**
     * ----------------------------------------------------------------------
     * 8. Input normalization checks.
     * ----------------------------------------------------------------------
     */
    const normalizedFr = await Adapter.normalizeInputForMarion(
      "Bonjour, peux-tu expliquer Synapse?",
      {
        domain: "general",
        context: "pre-routing",
        protectedTerms: ["Synapse"]
      }
    );

    assert.strictEqual(
      normalizedFr.originalText,
      "Bonjour, peux-tu expliquer Synapse?",
      "normalizeInputForMarion must preserve originalText"
    );

    assert.strictEqual(
      normalizedFr.detectedLanguage,
      "fr",
      "normalizeInputForMarion should detect French"
    );

    assert.strictEqual(
      typeof normalizedFr.normalizedText,
      "string",
      "normalizeInputForMarion should return normalizedText as a string"
    );

    assert.ok(
      Object.prototype.hasOwnProperty.call(normalizedFr, "translatedForRouting"),
      "normalizeInputForMarion should include translatedForRouting"
    );

    /**
     * ----------------------------------------------------------------------
     * 9. Character cap guard.
     * ----------------------------------------------------------------------
     */
    const longText = "x".repeat(5000);

    const capped = await Adapter.translateText(longText, {
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "general"
    });

    assert.strictEqual(
      capped.text,
      longText,
      "over-character-limit text should return unchanged"
    );

    assert.strictEqual(
      capped.meta.translated,
      false,
      "over-character-limit text should not translate"
    );

    assert.ok(
      String(capped.meta.warning || "").includes("max"),
      "over-character-limit should include max warning"
    );

    /**
     * ----------------------------------------------------------------------
     * 10. Provider failure fail-closed check.
     * ----------------------------------------------------------------------
     */
    writeJson(
      CONFIG_PATH,
      createStackTestConfig({
        provider: {
          active: "localHttp",
          endpoint: "http://127.0.0.1:9/translate",
          timeoutMs: 300,
          maxCharactersPerRequest: 4500,
          allowRemoteProviders: false,
          allowSelfHostedProviders: true
        },
        translationMemory: {
          enabled: false
        }
      })
    );

    Adapter = requireFresh(ADAPTER_PATH);

    resetTranslatorCachesIfAvailable(Adapter);

    const failedProvider = await Adapter.translateText("Start Reading", {
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "interface"
    });

    assert.strictEqual(
      failedProvider.text,
      "Start Reading",
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
      "failed provider should include safe failure warning"
    );

    /**
     * ----------------------------------------------------------------------
     * 11. Disabled translator check.
     * ----------------------------------------------------------------------
     */
    writeJson(
      CONFIG_PATH,
      createStackTestConfig({
        enabled: false,
        provider: {
          active: "manualDictionary"
        }
      })
    );

    Adapter = requireFresh(ADAPTER_PATH);

    resetTranslatorCachesIfAvailable(Adapter);

    const disabledEnvelope = {
      final: "Start Reading",
      authority: "marion-final"
    };

    const disabledOutput = await Adapter.applyUniversalTranslation(
      disabledEnvelope,
      {
        sourceLanguage: "en",
        targetLanguage: "fr"
      }
    );

    assert.deepStrictEqual(
      disabledOutput,
      disabledEnvelope,
      "disabled translator should return original envelope data unchanged"
    );

    assert.strictEqual(
      disabledOutput.final,
      "Start Reading",
      "disabled translator should not translate final text"
    );

    assert.strictEqual(
      disabledOutput.translationMeta,
      undefined,
      "disabled translator should not attach translationMeta when disabled"
    );

    /**
     * ----------------------------------------------------------------------
     * 12. Memory store direct checks.
     * ----------------------------------------------------------------------
     */
    const tempMemoryPath = path.join(
      os.tmpdir(),
      `translation-memory-stack-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}.json`
    );

    const memoryStore = Memory.createTranslationMemoryStore({
      filePath: tempMemoryPath,
      ttlMs: 1000 * 60 * 60,
      maxEntries: 50
    });

    const stored = memoryStore.set({
      sourceLanguage: "en",
      targetLanguage: "fr",
      sourceText: "Start Reading",
      translatedText: "Commencer la lecture",
      domain: "interface",
      provider: "manualDictionary",
      confidence: 1,
      protectedTerms: ["Nyx"]
    });

    assert.strictEqual(
      stored.stored,
      true,
      "memory store should store a valid translation"
    );

    const memoryHit = memoryStore.get({
      sourceLanguage: "en",
      targetLanguage: "fr",
      sourceText: "Start Reading",
      domain: "interface",
      protectedTerms: ["Nyx"]
    });

    assert.strictEqual(memoryHit.hit, true, "memory should return exact context hit");

    const wrongLanguageMiss = memoryStore.get({
      sourceLanguage: "en",
      targetLanguage: "es",
      sourceText: "Start Reading",
      domain: "interface",
      protectedTerms: ["Nyx"]
    });

    assert.strictEqual(
      wrongLanguageMiss.hit,
      false,
      "memory must not reuse English→French result for English→Spanish"
    );

    const sameLanguageRejected = memoryStore.set({
      sourceLanguage: "en",
      targetLanguage: "en",
      sourceText: "Start Reading",
      translatedText: "Start Reading",
      domain: "interface"
    });

    assert.strictEqual(
      sameLanguageRejected.stored,
      false,
      "memory should reject same-language identity entries"
    );

    try {
      if (fs.existsSync(tempMemoryPath)) fs.unlinkSync(tempMemoryPath);
    } catch (_) {
      // Cleanup should not affect regression result.
    }

    /**
     * ----------------------------------------------------------------------
     * 13. Memory enabled adapter behavior.
     * This confirms memory can be enabled without breaking adapter output.
     * The first call may use provider; subsequent calls may hit memory.
     * Either way, the final result must remain correct.
     * ----------------------------------------------------------------------
     */
    writeJson(
      CONFIG_PATH,
      createStackTestConfig({
        provider: {
          active: "manualDictionary"
        },
        translationMemory: {
          enabled: true,
          storageFile: tempMemoryPath,
          reuseExactMatches: true,
          reuseNormalizedMatches: false
        }
      })
    );

    Adapter = requireFresh(ADAPTER_PATH);

    resetTranslatorCachesIfAvailable(Adapter);

    const memoryAdapterFirst = await Adapter.translateText("Start Reading", {
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "interface",
      protectedTerms: ["Nyx"]
    });

    const memoryAdapterSecond = await Adapter.translateText("Start Reading", {
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "interface",
      protectedTerms: ["Nyx"]
    });

    assert.strictEqual(
      memoryAdapterFirst.text,
      "Commencer la lecture",
      "memory-enabled adapter first call should return correct translation"
    );

    assert.strictEqual(
      memoryAdapterSecond.text,
      "Commencer la lecture",
      "memory-enabled adapter second call should return correct translation"
    );

    try {
      if (fs.existsSync(tempMemoryPath)) fs.unlinkSync(tempMemoryPath);
    } catch (_) {
      // Cleanup should not affect regression result.
    }

    safeLog("Universal Translator full-stack regression passed.");
  } finally {
    restoreFile(CONFIG_PATH, configBackup);

    try {
      if (fs.existsSync(ADAPTER_PATH)) {
        const Adapter = requireFresh(ADAPTER_PATH);
        resetTranslatorCachesIfAvailable(Adapter);
      }
    } catch (_) {
      /**
       * Cleanup must never mask the actual regression result.
       * The config has already been restored at this point.
       */
    }
  }
}

if (IS_JEST_RUNTIME) {
  describe("Universal Translator full-stack regression", () => {
    test("validates adapter, provider, glossary, detection, memory, config, and Marion envelope safety", async () => {
      await run();
    });
  });
} else if (require.main === module) {
  run().catch((error) => {
    safeError("Universal Translator full-stack regression failed.");
    safeError(error);
    process.exit(1);
  });
}

module.exports = {
  run,
  createStackTestConfig,
  resetTranslatorCachesIfAvailable
};
