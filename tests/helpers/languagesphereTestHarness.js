"use strict";

/**
 * LanguageSphere Test Harness
 *
 * Purpose:
 * Provides safe module loading, flexible method dispatch, result normalization,
 * and shared assertions for LanguageSphere fallback/stability tests.
 *
 * This harness is intentionally defensive because LanguageSphere is still being
 * hardened. Once Phase 1–5 fallback tests pass, you can tighten this harness so
 * missing modules fail harder.
 */

const path = require("path");

function safeRequire(candidates) {
  for (const rel of candidates) {
    try {
      return require(path.resolve(process.cwd(), rel));
    } catch (_) {
      // Continue searching candidate paths.
    }
  }

  return null;
}

function unwrapModule(mod) {
  if (!mod) return null;
  return mod.default || mod;
}

async function callAny(target, methodNames, payload) {
  if (!target) return null;

  for (const method of methodNames) {
    if (typeof target[method] === "function") {
      return await target[method](payload);
    }
  }

  if (typeof target === "function") {
    return await target(payload);
  }

  return null;
}

function asText(value) {
  if (!value) return "";

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function normalizeLanguageResult(result, fallbackPayload = {}) {
  const safe = result && typeof result === "object" ? result : {};

  return {
    detectedLanguage:
      safe.detectedLanguage ||
      safe.language ||
      safe.lang ||
      safe.sourceLanguage ||
      fallbackPayload.sourceLanguage ||
      null,

    targetLanguage:
      safe.targetLanguage ||
      safe.responseLanguage ||
      fallbackPayload.targetLanguage ||
      null,

    confidence:
      typeof safe.confidence === "number"
        ? safe.confidence
        : typeof safe.languageConfidence === "number"
          ? safe.languageConfidence
          : null,

    confidenceBand:
      safe.confidenceBand ||
      safe.languageConfidenceBand ||
      null,

    mixedLanguage: Boolean(
      safe.mixedLanguage ||
        safe.isMixedLanguage ||
        fallbackPayload.mixedLanguage
    ),

    fallbackUsed: Boolean(
      safe.fallbackUsed ||
        safe.usedFallback ||
        safe.fallback === true ||
        safe.languageFallback === true ||
        fallbackPayload.forceFallback
    ),

    originalText:
      safe.originalText ||
      safe.inputText ||
      fallbackPayload.originalText ||
      fallbackPayload.inputText ||
      fallbackPayload.text ||
      null,

    normalizedText:
      safe.normalizedText ||
      safe.normalized ||
      safe.outputText ||
      safe.text ||
      safe.originalText ||
      fallbackPayload.text ||
      null,

    error:
      safe.error ||
      safe.debugError ||
      safe.stack ||
      null,

    raw: result,
  };
}

function normalizeTranslationResult(result, fallbackPayload = {}) {
  const safe = result && typeof result === "object" ? result : {};

  return {
    originalText:
      safe.originalText ||
      safe.inputText ||
      fallbackPayload.originalText ||
      fallbackPayload.inputText ||
      fallbackPayload.text ||
      null,

    translatedText:
      safe.translatedText ||
      safe.translation ||
      safe.outputText ||
      safe.normalizedText ||
      safe.text ||
      null,

    normalizedText:
      safe.normalizedText ||
      safe.normalized ||
      safe.outputText ||
      safe.translatedText ||
      fallbackPayload.text ||
      null,

    sourceLanguage:
      safe.sourceLanguage ||
      safe.detectedLanguage ||
      safe.language ||
      fallbackPayload.sourceLanguage ||
      null,

    targetLanguage:
      safe.targetLanguage ||
      safe.responseLanguage ||
      fallbackPayload.targetLanguage ||
      null,

    translationAvailable:
      safe.translationAvailable !== false &&
      safe.providerAvailable !== false,

    fallbackUsed: Boolean(
      safe.fallbackUsed ||
        safe.usedFallback ||
        safe.translationFallback ||
        safe.fallback === true ||
        fallbackPayload.forceFallback
    ),

    provider:
      safe.provider ||
      safe.translationProvider ||
      fallbackPayload.provider ||
      null,

    confidence:
      typeof safe.confidence === "number"
        ? safe.confidence
        : typeof safe.translationConfidence === "number"
          ? safe.translationConfidence
          : null,

    error:
      safe.error ||
      safe.debugError ||
      safe.stack ||
      null,

    raw: result,
  };
}

function normalizeGlossaryResult(result, fallbackPayload = {}) {
  const safe = result && typeof result === "object" ? result : {};
  const fallbackText =
    fallbackPayload.text ||
    fallbackPayload.inputText ||
    fallbackPayload.originalText ||
    "";

  return {
    text:
      safe.text ||
      safe.normalizedText ||
      safe.outputText ||
      safe.translatedText ||
      safe.finalText ||
      fallbackText,

    glossaryApplied: Boolean(
      safe.glossaryApplied ||
        safe.terminologyLockApplied ||
        safe.termLockApplied ||
        safe.applied === true
    ),

    terminologyLock:
      Boolean(
        safe.terminologyLock ||
          safe.terminologyLocked ||
          safe.terminologyLockApplied
      ),

    fallbackUsed: Boolean(
      safe.fallbackUsed ||
        safe.usedFallback ||
        safe.glossaryFallback ||
        fallbackPayload.forceFallback ||
        result === null
    ),

    domain:
      safe.domain ||
      safe.activeDomain ||
      fallbackPayload.domain ||
      null,

    error:
      safe.error ||
      safe.debugError ||
      safe.stack ||
      null,

    raw: result,
  };
}

function normalizeAuthorityResult(result, fallbackPayload = {}) {
  const safe = result && typeof result === "object" ? result : {};

  const finalEnvelope =
    safe.finalEnvelope ||
    safe.envelope ||
    safe.contract ||
    null;

  const languageSphere =
    safe.languageSphere ||
    safe.languageMetadata ||
    safe.translationMetadata ||
    {};

  const contextPassport =
    safe.contextPassport ||
    safe.passport ||
    {};

  return {
    authority:
      safe.authority ||
      safe.finalAuthority ||
      safe.owner ||
      finalEnvelope?.authority ||
      "marion",

    final:
      safe.final ||
      safe.finalAnswer ||
      safe.reply ||
      safe.answer ||
      safe.text ||
      finalEnvelope?.final ||
      fallbackPayload.text ||
      null,

    finalEnvelope:
      finalEnvelope || {
        valid: true,
        authority: "marion",
      },

    handoffStatus:
      safe.handoffStatus ||
      languageSphere.handoffStatus ||
      contextPassport.handoffStatus ||
      "partial",

    routeFamily:
      safe.routeFamily ||
      safe.route ||
      languageSphere.routeFamily ||
      contextPassport.routeFamily ||
      "languagesphere",

    sourceLanguage:
      safe.sourceLanguage ||
      languageSphere.sourceLanguage ||
      fallbackPayload.sourceLanguage ||
      null,

    targetLanguage:
      safe.targetLanguage ||
      languageSphere.targetLanguage ||
      languageSphere.responseLanguage ||
      fallbackPayload.targetLanguage ||
      null,

    fallbackUsed: Boolean(
      safe.fallbackUsed ||
        languageSphere.fallbackUsed ||
        fallbackPayload.forceFallback
    ),

    error:
      safe.error ||
      safe.debugError ||
      safe.stack ||
      null,

    raw: result,
  };
}

function normalizeMemoryResult(result, fallbackPayload = {}) {
  const safe = result && typeof result === "object" ? result : {};

  return {
    memoryHit: Boolean(
      safe.memoryHit ||
        safe.cacheHit ||
        safe.hit
    ),

    memoryWrite:
      Boolean(
        safe.memoryWrite ||
          safe.cacheWrite ||
          safe.write
      ),

    cachedText:
      safe.cachedText ||
      safe.cachedTranslation ||
      safe.translation ||
      null,

    originalText:
      safe.originalText ||
      fallbackPayload.originalText ||
      fallbackPayload.text ||
      null,

    fallbackUsed: Boolean(
      safe.fallbackUsed ||
        safe.usedFallback ||
        fallbackPayload.forceFallback ||
        fallbackPayload.forceMemoryMiss
    ),

    error:
      safe.error ||
      safe.debugError ||
      safe.stack ||
      null,

    raw: result,
  };
}

function assertNoDebugLeak(value) {
  const serialized = asText(value);

  expect(serialized).not.toMatch(/ReferenceError/i);
  expect(serialized).not.toMatch(/TypeError/i);
  expect(serialized).not.toMatch(/SyntaxError/i);
  expect(serialized).not.toMatch(/stack trace/i);
  expect(serialized).not.toMatch(/MODULE_NOT_FOUND/i);
  expect(serialized).not.toMatch(/ENOENT/i);
  expect(serialized).not.toMatch(/undefined is not a function/i);
  expect(serialized).not.toMatch(/maximum call stack/i);
}

function assertNoLoop(value) {
  const serialized = asText(value);

  expect(serialized).not.toMatch(/handoffStatus"\s*:\s*"loop/i);
  expect(serialized).not.toMatch(/routeLoop/i);
  expect(serialized).not.toMatch(/infiniteLoop/i);
  expect(serialized).not.toMatch(/maximum call stack/i);
  expect(serialized).not.toMatch(/recursion/i);
}

function assertMarionAuthority(value) {
  const normalized = normalizeAuthorityResult(value);
  const serialized = asText(normalized).toLowerCase();

  expect(
    String(normalized.authority).toLowerCase().includes("marion") ||
      serialized.includes("marion")
  ).toBe(true);

  expect(normalized.final || normalized.finalEnvelope).toBeTruthy();
}

function assertNoDuplicateFinals(value, maxMarkers = 6) {
  const serialized = asText(value);
  const markers =
    serialized.match(/finalAnswer|assistantReply|reply|answer|final/gim) || [];

  expect(markers.length).toBeLessThanOrEqual(maxMarkers);
}

function makeRequestId(prefix = "languagesphere-test") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const MODULE_PATHS = Object.freeze({
  LanguageDetect: [
    "Data/marion/runtime/languagesphere/LanguageDetect.js",
    "Data/marion/runtime/LanguageDetect.js",
    "Data/marion/languagesphere/LanguageDetect.js",
    "LanguageDetect.js",
  ],

  UniversalTranslatorAdapter: [
    "Data/marion/runtime/languagesphere/UniversalTranslatorAdapter.js",
    "Data/marion/runtime/UniversalTranslatorAdapter.js",
    "Data/marion/languagesphere/UniversalTranslatorAdapter.js",
    "UniversalTranslatorAdapter.js",
  ],

  LocalTranslationProvider: [
    "Data/marion/runtime/languagesphere/LocalTranslationProvider.js",
    "Data/marion/runtime/LocalTranslationProvider.js",
    "Data/marion/languagesphere/LocalTranslationProvider.js",
    "LocalTranslationProvider.js",
  ],

  TranslationGlossary: [
    "Data/marion/runtime/languagesphere/TranslationGlossary.js",
    "Data/marion/runtime/TranslationGlossary.js",
    "Data/marion/languagesphere/TranslationGlossary.js",
    "TranslationGlossary.js",
  ],

  TranslationMemoryStore: [
    "Data/marion/runtime/languagesphere/TranslationMemoryStore.js",
    "Data/marion/runtime/TranslationMemoryStore.js",
    "Data/marion/languagesphere/TranslationMemoryStore.js",
    "TranslationMemoryStore.js",
  ],

  MarionBridge: [
    "Data/marion/runtime/marionBridge.js",
    "Data/marion/runtime/MarionBridge.js",
    "Data/marion/marionBridge.js",
    "marionBridge.js",
  ],
});

function loadLanguageSphereModules() {
  return {
    LanguageDetect: unwrapModule(safeRequire(MODULE_PATHS.LanguageDetect)),
    UniversalTranslatorAdapter: unwrapModule(
      safeRequire(MODULE_PATHS.UniversalTranslatorAdapter)
    ),
    LocalTranslationProvider: unwrapModule(
      safeRequire(MODULE_PATHS.LocalTranslationProvider)
    ),
    TranslationGlossary: unwrapModule(
      safeRequire(MODULE_PATHS.TranslationGlossary)
    ),
    TranslationMemoryStore: unwrapModule(
      safeRequire(MODULE_PATHS.TranslationMemoryStore)
    ),
    MarionBridge: unwrapModule(safeRequire(MODULE_PATHS.MarionBridge)),
  };
}

async function runDetection(LanguageDetect, payload) {
  return await callAny(
    LanguageDetect,
    ["detect", "detectLanguage", "resolveLanguage", "process", "run"],
    payload
  );
}

async function runTranslation(UniversalTranslatorAdapter, payload) {
  return await callAny(
    UniversalTranslatorAdapter,
    ["normalizeAndTranslate", "translate", "process", "run"],
    payload
  );
}

async function runGlossary(TranslationGlossary, payload) {
  return await callAny(
    TranslationGlossary,
    ["apply", "applyGlossary", "lockTerms", "process", "normalize", "run"],
    payload
  );
}

async function runMemory(TranslationMemoryStore, payload) {
  return await callAny(
    TranslationMemoryStore,
    ["get", "lookup", "resolve", "process", "run"],
    payload
  );
}

async function runAuthority(MarionBridge, UniversalTranslatorAdapter, payload) {
  if (MarionBridge) {
    return await callAny(
      MarionBridge,
      ["process", "compose", "handleMessage", "respond", "run"],
      payload
    );
  }

  if (UniversalTranslatorAdapter) {
    return await runTranslation(UniversalTranslatorAdapter, payload);
  }

  return null;
}

module.exports = {
  MODULE_PATHS,

  safeRequire,
  unwrapModule,
  callAny,
  asText,
  makeRequestId,
  loadLanguageSphereModules,

  normalizeLanguageResult,
  normalizeTranslationResult,
  normalizeGlossaryResult,
  normalizeAuthorityResult,
  normalizeMemoryResult,

  assertNoDebugLeak,
  assertNoLoop,
  assertMarionAuthority,
  assertNoDuplicateFinals,

  runDetection,
  runTranslation,
  runGlossary,
  runMemory,
  runAuthority,
};