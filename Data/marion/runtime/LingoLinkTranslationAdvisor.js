"use strict";

/**
 * LingoLinkTranslationAdvisor
 *
 * Purpose:
 * Provides Marion-safe advisory translation metadata for LingoLink.
 *
 * Architectural contract:
 * - LingoLink advises only.
 * - Marion remains final authority.
 * - This module does not perform production translation.
 * - This module never forces translation.
 * - This module preserves original input.
 * - This module returns render-safe strings so backend rendering cannot crash on
 *   missing translation data, missing dependencies, null input, or malformed metadata.
 */

const VERSION = "LingoLinkTranslationAdvisor v0.3.0 RENDER-SAFE-ADVISORY-HARDENED + MARION-AUTHORITY-LOCK";

function safeRequire(relativePath) {
  try {
    return require(relativePath);
  } catch (_) {
    return null;
  }
}

const languageDetectMod = safeRequire("./LingoLinkLanguageDetect");
const normalizerMod = safeRequire("./LingoLinkNormalizer");

const detectLanguage =
  languageDetectMod && typeof languageDetectMod.detectLanguage === "function"
    ? languageDetectMod.detectLanguage
    : fallbackDetectLanguage;

const normalizeInput =
  normalizerMod && typeof normalizerMod.normalizeInput === "function"
    ? normalizerMod.normalizeInput
    : fallbackNormalizeInput;

const DEFAULT_TRANSLATION_CONFIG = Object.freeze({
  enabled: true,
  defaultLanguage: "en",
  supportedLanguages: ["en", "fr", "es"],
  advisoryOnly: true,
  forceTranslation: false,
  renderSafe: true,
  confidenceFloorForPhraseMemory: 0.72,
  authority: {
    finalAuthority: "Marion",
    lingoLinkAdvisoryOnly: true,
    neverOverrideMarion: true
  },
  telemetry: {
    enabled: true,
    includeLookupKey: true,
    includeDependencyStatus: true
  }
});

const PHRASE_TRANSLATION_MEMORY = Object.freeze({
  fr: Object.freeze({
    "bonjour": "hello",
    "bonjour, comment ça va?": "hello, how are you?",
    "bonjour, comment ca va?": "hello, how are you?",
    "bonjour comment ça va": "hello, how are you?",
    "bonjour comment ca va": "hello, how are you?",
    "comment ça va?": "how are you?",
    "comment ca va?": "how are you?",
    "comment ça va": "how are you?",
    "comment ca va": "how are you?",
    "merci": "thank you",
    "s'il vous plaît": "please",
    "s'il vous plait": "please",
    "sil vous plaît": "please",
    "sil vous plait": "please",
    "au revoir": "goodbye"
  }),
  es: Object.freeze({
    "hola": "hello",
    "hola, cómo estás?": "hello, how are you?",
    "hola, como estas?": "hello, how are you?",
    "hola cómo estás": "hello, how are you?",
    "hola como estas": "hello, how are you?",
    "cómo estás?": "how are you?",
    "como estas?": "how are you?",
    "cómo estás": "how are you?",
    "como estas": "how are you?",
    "gracias": "thank you",
    "por favor": "please",
    "adiós": "goodbye",
    "adios": "goodbye"
  })
});

function safeString(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return String(value);
  } catch (_) {
    return "";
  }
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
  const f = Number(fallback);
  return Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0;
}

function normalizeLanguageCode(value, fallback = "unknown") {
  const raw = safeString(value).trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "english") return "en";
  if (raw === "french" || raw === "français" || raw === "francais") return "fr";
  if (raw === "spanish" || raw === "español" || raw === "espanol") return "es";
  if (["en", "fr", "es", "unknown"].includes(raw)) return raw;
  return fallback;
}

function stripDiacritics(value) {
  return safeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeKey(value) {
  return safeString(value)
    .trim()
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([¿¡])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLooseKey(value) {
  return stripDiacritics(normalizeKey(value))
    .replace(/[¿¡]/g, "")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeMergeConfig(config) {
  const incoming = safeObject(config);
  const authority = safeObject(incoming.authority);
  const telemetry = safeObject(incoming.telemetry);

  return {
    ...DEFAULT_TRANSLATION_CONFIG,
    ...incoming,
    enabled: incoming.enabled !== false,
    advisoryOnly: true,
    forceTranslation: false,
    defaultLanguage: normalizeLanguageCode(incoming.defaultLanguage, DEFAULT_TRANSLATION_CONFIG.defaultLanguage),
    supportedLanguages: safeArray(incoming.supportedLanguages).length
      ? safeArray(incoming.supportedLanguages).map((item) => normalizeLanguageCode(item, "")).filter(Boolean)
      : [...DEFAULT_TRANSLATION_CONFIG.supportedLanguages],
    authority: {
      ...DEFAULT_TRANSLATION_CONFIG.authority,
      ...authority,
      finalAuthority: "Marion",
      lingoLinkAdvisoryOnly: true,
      neverOverrideMarion: true
    },
    telemetry: {
      ...DEFAULT_TRANSLATION_CONFIG.telemetry,
      ...telemetry
    }
  };
}

function fallbackNormalizeInput(input) {
  const originalText = safeString(input);
  const normalizedText = originalText
    .trim()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([¿¡])\s+/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim();

  return {
    originalText,
    normalizedText,
    changed: originalText !== normalizedText,
    operations: originalText !== normalizedText ? ["fallback_normalize"] : [],
    source: "LingoLinkTranslationAdvisorFallbackNormalizer"
  };
}

function fallbackDetectLanguage(input, options = {}) {
  const text = normalizeLooseKey(input);
  const config = safeObject(options.config);
  const supportedLanguages = safeArray(config.supportedLanguages).length
    ? safeArray(config.supportedLanguages)
    : ["en", "fr", "es"];

  let detectedLanguage = "unknown";
  let confidence = 0;

  if (/\b(bonjour|merci|comment ca va|sil vous plait|au revoir)\b/.test(text)) {
    detectedLanguage = "fr";
    confidence = 0.82;
  } else if (/\b(hola|gracias|como estas|por favor|adios)\b/.test(text)) {
    detectedLanguage = "es";
    confidence = 0.82;
  } else if (/\b(hello|how are you|thanks|please|goodbye|today)\b/.test(text)) {
    detectedLanguage = "en";
    confidence = 0.78;
  }

  const supported = detectedLanguage !== "unknown" && supportedLanguages.includes(detectedLanguage);

  return {
    detectedLanguage,
    confidence,
    supported,
    requiresTranslation: supported && detectedLanguage !== normalizeLanguageCode(config.defaultLanguage, "en"),
    fallbackTriggered: !supported,
    reason: supported ? "fallback_language_detected" : "fallback_unknown_language",
    source: "LingoLinkTranslationAdvisorFallbackDetector"
  };
}

function normalizeLanguageMeta(value, config) {
  const meta = safeObject(value);
  const detectedLanguage = normalizeLanguageCode(meta.detectedLanguage || meta.language, "unknown");
  const supported = detectedLanguage !== "unknown" && safeArray(config.supportedLanguages).includes(detectedLanguage);
  const confidence = clamp01(meta.confidence, supported ? 0.72 : 0);

  return {
    ...meta,
    detectedLanguage,
    confidence,
    supported: Boolean(meta.supported === undefined ? supported : meta.supported && supported),
    requiresTranslation: Boolean(
      meta.requiresTranslation === undefined
        ? supported && detectedLanguage !== config.defaultLanguage
        : meta.requiresTranslation && supported
    ),
    fallbackTriggered: Boolean(meta.fallbackTriggered || !supported),
    reason: safeString(meta.reason) || (supported ? "language_detected" : "unsupported_or_unknown_language"),
    source: safeString(meta.source) || "LingoLinkTranslationAdvisor"
  };
}

function dependencyTelemetry() {
  return {
    languageDetectLoaded: Boolean(languageDetectMod && typeof languageDetectMod.detectLanguage === "function"),
    normalizerLoaded: Boolean(normalizerMod && typeof normalizerMod.normalizeInput === "function")
  };
}

function lookupAdvisoryTranslation(normalizedText, sourceLanguage) {
  const lang = normalizeLanguageCode(sourceLanguage, "unknown");
  const languageMemory = PHRASE_TRANSLATION_MEMORY[lang];
  const originalKey = normalizeKey(normalizedText);
  const looseKey = normalizeLooseKey(normalizedText);

  if (!languageMemory) {
    return {
      translatedText: safeString(normalizedText),
      matched: false,
      method: "passthrough",
      lookupKey: originalKey,
      sourceLanguage: lang
    };
  }

  const exact = languageMemory[originalKey];
  if (exact) {
    return {
      translatedText: exact,
      matched: true,
      method: "phrase_memory_exact",
      lookupKey: originalKey,
      sourceLanguage: lang
    };
  }

  for (const [key, translatedText] of Object.entries(languageMemory)) {
    if (normalizeLooseKey(key) === looseKey) {
      return {
        translatedText,
        matched: true,
        method: "phrase_memory_loose",
        lookupKey: looseKey,
        sourceLanguage: lang
      };
    }
  }

  return {
    translatedText: safeString(normalizedText),
    matched: false,
    method: "passthrough",
    lookupKey: originalKey,
    sourceLanguage: lang
  };
}

function buildTelemetry({ config, languageMeta, lookup = {}, reason = "", dependency = dependencyTelemetry() } = {}) {
  if (!safeObject(config).telemetry || safeObject(config.telemetry).enabled === false) {
    return {
      enabled: false,
      source: "LingoLinkTranslationAdvisor"
    };
  }

  return {
    enabled: true,
    version: VERSION,
    detectedLanguage: safeString(safeObject(languageMeta).detectedLanguage || "unknown"),
    confidence: clamp01(safeObject(languageMeta).confidence, 0),
    supported: Boolean(safeObject(languageMeta).supported),
    requiresTranslation: Boolean(safeObject(languageMeta).requiresTranslation),
    lookupKey: config.telemetry.includeLookupKey === false ? "" : safeString(lookup.lookupKey),
    method: safeString(lookup.method),
    reason: safeString(reason),
    dependencyStatus: config.telemetry.includeDependencyStatus === false ? {} : dependency,
    advisoryOnly: true,
    finalAuthority: "Marion",
    source: "LingoLinkTranslationAdvisor"
  };
}

function buildAdvisoryPacket({
  originalText = "",
  normalizedText = "",
  advisoryText = "",
  translatedText = "",
  sourceLanguage = "unknown",
  targetLanguage = "en",
  translated = false,
  confidence = 0,
  supported = false,
  fallbackTriggered = false,
  reason = "",
  method = "passthrough",
  config = DEFAULT_TRANSLATION_CONFIG,
  lookup = {},
  safeToRender = true
} = {}) {
  const cleanConfig = safeMergeConfig(config);
  const finalAdvisoryText = safeString(advisoryText || translatedText || normalizedText);
  const finalTranslatedText = safeString(translatedText || finalAdvisoryText);
  const finalNormalizedText = safeString(normalizedText);
  const renderText = safeString(finalAdvisoryText || finalNormalizedText);

  return {
    originalText: safeString(originalText),
    normalizedText: finalNormalizedText,
    advisoryText: renderText,
    translatedText: finalTranslatedText,

    /**
     * Render-safe aliases. These are strings by contract, so downstream renderers
     * do not crash if they expect a public text field instead of advisoryText.
     */
    text: renderText,
    renderText,
    publicText: renderText,
    finalText: renderText,

    sourceLanguage: normalizeLanguageCode(sourceLanguage, "unknown"),
    targetLanguage: normalizeLanguageCode(targetLanguage, cleanConfig.defaultLanguage),
    translated: Boolean(translated),
    advisoryOnly: true,
    forceTranslation: false,
    confidence: clamp01(confidence, 0),
    supported: Boolean(supported),
    fallbackTriggered: Boolean(fallbackTriggered),
    reason: safeString(reason),
    method: safeString(method || "passthrough"),
    safeToRender: Boolean(safeToRender && renderText),
    renderSafe: true,
    authority: cleanConfig.authority,
    marionAuthority: true,
    finalAuthority: "Marion",
    telemetry: buildTelemetry({
      config: cleanConfig,
      languageMeta: {
        detectedLanguage: sourceLanguage,
        confidence,
        supported,
        requiresTranslation: Boolean(supported) && sourceLanguage !== targetLanguage
      },
      lookup,
      reason
    }),
    source: "LingoLinkTranslationAdvisor",
    version: VERSION
  };
}

function buildDisabledAdvisory(originalText, normalizedText, languageMeta, config) {
  return buildAdvisoryPacket({
    originalText,
    normalizedText,
    advisoryText: normalizedText,
    translatedText: normalizedText,
    sourceLanguage: languageMeta.detectedLanguage || config.defaultLanguage,
    targetLanguage: config.defaultLanguage,
    translated: false,
    confidence: languageMeta.confidence || 0,
    supported: Boolean(languageMeta.supported),
    fallbackTriggered: true,
    reason: "translation_advisor_disabled",
    method: "disabled",
    config,
    safeToRender: true
  });
}

function buildNoTranslationNeededAdvisory(originalText, normalizedText, languageMeta, config) {
  return buildAdvisoryPacket({
    originalText,
    normalizedText,
    advisoryText: normalizedText,
    translatedText: normalizedText,
    sourceLanguage: languageMeta.detectedLanguage || config.defaultLanguage,
    targetLanguage: config.defaultLanguage,
    translated: false,
    confidence: languageMeta.confidence || 0,
    supported: Boolean(languageMeta.supported),
    fallbackTriggered: false,
    reason: "translation_not_required",
    method: "passthrough",
    config,
    safeToRender: true
  });
}

function buildFallbackAdvisory(originalText, normalizedText, languageMeta, config, reason) {
  return buildAdvisoryPacket({
    originalText,
    normalizedText,
    advisoryText: normalizedText,
    translatedText: normalizedText,
    sourceLanguage: languageMeta.detectedLanguage || "unknown",
    targetLanguage: config.defaultLanguage,
    translated: false,
    confidence: languageMeta.confidence || 0,
    supported: false,
    fallbackTriggered: true,
    reason,
    method: "fallback",
    config,
    safeToRender: Boolean(normalizedText)
  });
}

function normalizeForAdvisor(input, options = {}) {
  const supplied = safeObject(options.normalization);
  if (Object.keys(supplied).length) {
    return {
      ...supplied,
      originalText: safeString(supplied.originalText !== undefined ? supplied.originalText : input),
      normalizedText: safeString(supplied.normalizedText !== undefined ? supplied.normalizedText : input),
      changed: Boolean(supplied.changed),
      operations: safeArray(supplied.operations),
      source: safeString(supplied.source) || "LingoLinkTranslationAdvisorSuppliedNormalization"
    };
  }

  try {
    const result = normalizeInput(input, safeObject(options.normalizerOptions));
    const normalized = safeObject(result);
    return {
      ...normalized,
      originalText: safeString(normalized.originalText !== undefined ? normalized.originalText : input),
      normalizedText: safeString(normalized.normalizedText !== undefined ? normalized.normalizedText : input),
      changed: Boolean(normalized.changed),
      operations: safeArray(normalized.operations),
      source: safeString(normalized.source) || "LingoLinkNormalizer"
    };
  } catch (_) {
    return fallbackNormalizeInput(input);
  }
}

function detectForAdvisor(normalizedText, options = {}, config = DEFAULT_TRANSLATION_CONFIG) {
  if (safeObject(options.languageMeta) && Object.keys(safeObject(options.languageMeta)).length) {
    return normalizeLanguageMeta(options.languageMeta, config);
  }

  try {
    const detected = detectLanguage(normalizedText, {
      config: {
        supportedLanguages: config.supportedLanguages,
        defaultLanguage: config.defaultLanguage,
        unknownLanguage: "unknown",
        confidenceThresholds: safeObject(config.confidenceThresholds)
      }
    });
    return normalizeLanguageMeta(detected, config);
  } catch (_) {
    return normalizeLanguageMeta(fallbackDetectLanguage(normalizedText, { config }), config);
  }
}

function adviseTranslation(input, options = {}) {
  const config = safeMergeConfig(safeObject(options).config);
  const normalization = normalizeForAdvisor(input, options);
  const originalText = safeString(normalization.originalText);
  const normalizedText = safeString(normalization.normalizedText);
  const languageMeta = detectForAdvisor(normalizedText, options, config);

  if (!config.enabled) {
    return buildDisabledAdvisory(originalText, normalizedText, languageMeta, config);
  }

  if (!normalizedText) {
    return buildFallbackAdvisory(
      originalText,
      normalizedText,
      languageMeta,
      config,
      "empty_input"
    );
  }

  if (!languageMeta.supported || languageMeta.detectedLanguage === "unknown") {
    return buildFallbackAdvisory(
      originalText,
      normalizedText,
      languageMeta,
      config,
      "unsupported_or_unknown_language"
    );
  }

  if (!languageMeta.requiresTranslation) {
    return buildNoTranslationNeededAdvisory(
      originalText,
      normalizedText,
      languageMeta,
      config
    );
  }

  const lookup = lookupAdvisoryTranslation(
    normalizedText,
    languageMeta.detectedLanguage
  );

  const matched = Boolean(lookup.matched);
  const confidence = matched
    ? Math.max(
        clamp01(languageMeta.confidence, 0),
        clamp01(config.confidenceFloorForPhraseMemory, 0.72)
      )
    : clamp01(languageMeta.confidence, 0);

  return buildAdvisoryPacket({
    originalText,
    normalizedText,
    advisoryText: lookup.translatedText,
    translatedText: lookup.translatedText,
    sourceLanguage: languageMeta.detectedLanguage,
    targetLanguage: config.defaultLanguage,
    translated: matched,
    confidence,
    supported: true,
    fallbackTriggered: !matched,
    reason: matched ? "translation_advisory_created" : "no_phrase_memory_match",
    method: lookup.method,
    config,
    lookup,
    safeToRender: true
  });
}

function buildTranslationAdvisory(input, options = {}) {
  return adviseTranslation(input, options);
}

function runTranslationAdvisor(input, options = {}) {
  return adviseTranslation(input, options);
}

module.exports = {
  VERSION,
  adviseTranslation,
  buildTranslationAdvisory,
  runTranslationAdvisor,
  lookupAdvisoryTranslation,
  normalizeKey,
  normalizeLooseKey,
  safeMergeConfig,
  DEFAULT_TRANSLATION_CONFIG,
  PHRASE_TRANSLATION_MEMORY,
  default: adviseTranslation
};
