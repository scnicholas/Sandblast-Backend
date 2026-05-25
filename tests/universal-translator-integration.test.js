"use strict";

/**
 * universal-translator-integration.test.js
 * Marion/Nyx Universal Translator integration regression.
 *
 * Run from project root:
 *   node tests/universal-translator-integration.test.js
 *
 * Optional:
 *   PROJECT_ROOT=/absolute/path node tests/universal-translator-integration.test.js
 *
 * Purpose:
 * - Prove UniversalTranslatorAdapter can sit beside Marion safely.
 * - Confirm multilingual input normalization does not destroy original text.
 * - Confirm final-envelope translation does not compromise authority fields.
 * - Confirm provider failure returns original text/envelope.
 * - Confirm glossary-protected terms survive translation.
 * - Confirm test writes are restored even if a regression fails.
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

const RUNTIME_RELATIVE = path.join("Data", "marion", "runtime");

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function dirExists(dirPath) {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch (_) {
    return false;
  }
}

/**
 * Resolve project root defensively.
 *
 * Primary expectation:
 * - This file lives in /tests and project root is one directory up.
 *
 * Extra protection:
 * - PROJECT_ROOT can override the root.
 * - If copied elsewhere, walk upward until Data/marion/runtime is found.
 */
function resolveProjectRoot() {
  const envRoot = process.env.PROJECT_ROOT
    ? path.resolve(process.env.PROJECT_ROOT)
    : null;

  if (envRoot && dirExists(path.join(envRoot, RUNTIME_RELATIVE))) {
    return envRoot;
  }

  const candidates = [
    path.resolve(__dirname, ".."),
    path.resolve(process.cwd())
  ];

  for (const candidate of candidates) {
    if (dirExists(path.join(candidate, RUNTIME_RELATIVE))) {
      return candidate;
    }
  }

  let cursor = path.resolve(__dirname);
  for (let depth = 0; depth < 8; depth += 1) {
    if (dirExists(path.join(cursor, RUNTIME_RELATIVE))) {
      return cursor;
    }

    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  return path.resolve(__dirname, "..");
}

const PROJECT_ROOT = resolveProjectRoot();
const RUNTIME_DIR = path.join(PROJECT_ROOT, RUNTIME_RELATIVE);

const ADAPTER_PATH = path.join(RUNTIME_DIR, "UniversalTranslatorAdapter.js");
const CONFIG_PATH = path.join(RUNTIME_DIR, "translationConfig.json");
const PROVIDER_PATH = path.join(RUNTIME_DIR, "LocalTranslationProvider.js");
const GLOSSARY_PATH = path.join(RUNTIME_DIR, "TranslationGlossary.js");
const LANGUAGE_DETECT_PATH = path.join(RUNTIME_DIR, "LanguageDetect.js");
const MEMORY_STORE_PATH = path.join(RUNTIME_DIR, "TranslationMemoryStore.js");

function requireFresh(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(resolved);
}

function ensureFileExists(filePath, label) {
  assert.ok(
    fileExists(filePath),
    `${label} missing at expected path: ${filePath}`
  );
}

function ensureRuntimeFilesExist() {
  ensureFileExists(ADAPTER_PATH, "UniversalTranslatorAdapter.js");
  ensureFileExists(PROVIDER_PATH, "LocalTranslationProvider.js");
  ensureFileExists(GLOSSARY_PATH, "TranslationGlossary.js");
  ensureFileExists(LANGUAGE_DETECT_PATH, "LanguageDetect.js");
  ensureFileExists(MEMORY_STORE_PATH, "TranslationMemoryStore.js");
}

function readJsonSafe(filePath) {
  if (!fileExists(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON at ${filePath}: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function backupFile(filePath) {
  if (!fileExists(filePath)) {
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
  if (!backup || !backup.existed) {
    if (fileExists(filePath)) fs.unlinkSync(filePath);
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, backup.content, "utf8");
}

function clearTranslatorCache() {
  if (!fileExists(ADAPTER_PATH)) return;

  const Translator = requireFresh(ADAPTER_PATH);

  if (typeof Translator.resetUniversalTranslatorCaches === "function") {
    Translator.resetUniversalTranslatorCaches();
  }
}

function assertTranslatorContract(Translator) {
  const requiredFns = [
    "detectLanguage",
    "translateText",
    "applyUniversalTranslation",
    "normalizeInputForMarion"
  ];

  for (const fnName of requiredFns) {
    assert.strictEqual(
      typeof Translator[fnName],
      "function",
      `UniversalTranslatorAdapter must export ${fnName}()`
    );
  }
}

function assertObject(value, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
}

function assertMeta(value, label) {
  assertObject(value, label);
  assertObject(value.meta, `${label}.meta`);
  assert.strictEqual(
    typeof value.meta.translated,
    "boolean",
    `${label}.meta.translated must be boolean`
  );
}

function warningIncludes(value, acceptedFragments, label) {
  const warning = String(value && value.meta ? value.meta.warning || "" : "");

  assert.ok(
    acceptedFragments.some((fragment) => warning.includes(fragment)),
    `${label} warning should include one of: ${acceptedFragments.join(", ")}. Received: ${warning || "<empty>"}`
  );
}

function createTestConfig(overrides = {}) {
  return {
    version: "0.3.1-integration-test",
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
  console.log(`Project root: ${PROJECT_ROOT}`);

  ensureRuntimeFilesExist();

  const configBackup = backupFile(CONFIG_PATH);

  try {
    /**
     * Test config: manualDictionary provider.
     * This proves provider routing without paid API or local ML engine.
     */
    writeJson(CONFIG_PATH, createTestConfig());

    let Translator = requireFresh(ADAPTER_PATH);
    assertTranslatorContract(Translator);
    clearTranslatorCache();

    /**
     * 1. Basic language detection contract.
     */
    const frDetect = Translator.detectLanguage("Bonjour, comment ça va?");
    assertObject(frDetect, "French detection result");
    assert.strictEqual(
      frDetect.language,
      "fr",
      "French detection should return fr"
    );

    const esDetect = Translator.detectLanguage("Hola, cómo estás?");
    assertObject(esDetect, "Spanish detection result");
    assert.strictEqual(
      esDetect.language,
      "es",
      "Spanish detection should return es"
    );

    const enDetect = Translator.detectLanguage("Hello, how are you?");
    assertObject(enDetect, "English detection result");
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

    assertMeta(manualFr, "manualDictionary French result");

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

    assertMeta(sameLanguage, "same-language result");

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

    warningIncludes(
      sameLanguage,
      ["same-language", "translation-not-required", "unsupported"],
      "same-language request"
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

    assertMeta(manualMiss, "manualDictionary miss result");

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

    warningIncludes(
      manualMiss,
      ["miss", "not", "unsupported", "original"],
      "manualDictionary miss"
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
      "applyUniversalTranslation should return a cloned envelope when translation is enabled"
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

    assert.notStrictEqual(
      nestedTranslated,
      nestedEnvelope,
      "nested envelope should be cloned when translation is enabled"
    );

    assert.notStrictEqual(
      nestedTranslated.finalEnvelope,
      nestedEnvelope.finalEnvelope,
      "nested finalEnvelope object should be cloned before mutation"
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

    assert.deepStrictEqual(
      nestedTranslated.diagnostics,
      nestedEnvelope.diagnostics,
      "nested diagnostics object should be preserved"
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

    assertObject(normalizedFr, "input normalization result");

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

    assert.strictEqual(
      typeof normalizedFr.translatedForRouting,
      "boolean",
      "translatedForRouting should be boolean"
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

    assertMeta(brandTranslation, "brand/glossary translation result");

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

    assert.strictEqual(
      typeof brandTranslation.meta.protectedTermsApplied,
      "number",
      "protectedTermsApplied metadata should exist as a number"
    );

    /**
     * 9. Character cap guard.
     */
    const longText = "x".repeat(5000);

    const capped = await Translator.translateText(longText, {
      sourceLanguage: "en",
      targetLanguage: "fr"
    });

    assertMeta(capped, "character cap result");

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

    warningIncludes(capped, ["max", "character", "limit"], "over-character-limit result");

    /**
     * 10. Provider failure must fail closed to original.
     * We switch config to localHttp with a deliberately bad endpoint.
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
    assertTranslatorContract(Translator);
    clearTranslatorCache();

    const failureText = "Start Reading";

    const failedProvider = await Translator.translateText(failureText, {
      sourceLanguage: "en",
      targetLanguage: "fr",
      domain: "interface"
    });

    assertMeta(failedProvider, "failed provider result");

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

    warningIncludes(
      failedProvider,
      ["translation-failed", "provider", "fetch", "connect", "timeout"],
      "failed provider"
    );

    /**
     * 11. Disabled translator should return original envelope unchanged.
     *
     * Critical adjustment:
     * - Some safe implementations may return the same object reference.
     * - Others may defensively clone while preserving data.
     * - Both are acceptable as long as no translation mutation/meta leak occurs.
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
    assertObject(disabledConfig, "disabled test config");
    disabledConfig.enabled = false;
    writeJson(CONFIG_PATH, disabledConfig);

    Translator = requireFresh(ADAPTER_PATH);
    assertTranslatorContract(Translator);
    clearTranslatorCache();

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

    assert.deepStrictEqual(
      disabledOutput,
      disabledEnvelope,
      "disabled translator should return an envelope with original data unchanged"
    );

    assert.strictEqual(
      disabledOutput.final,
      "Start Reading",
      "disabled translator should not translate final text"
    );

    assert.strictEqual(
      disabledOutput.translationMeta,
      undefined,
      "disabled translator should not attach translationMeta"
    );

    console.log("Universal Translator integration regression passed.");
  } finally {
    restoreFile(CONFIG_PATH, configBackup);

    /**
     * Clear adapter cache after restoring config.
     */
    try {
      clearTranslatorCache();
    } catch (error) {
      console.warn(
        `Warning: config restored, but adapter cache reset failed: ${error.message}`
      );
    }
  }
}

run().catch((error) => {
  console.error("Universal Translator integration regression failed.");
  console.error(error);
  process.exit(1);
});
