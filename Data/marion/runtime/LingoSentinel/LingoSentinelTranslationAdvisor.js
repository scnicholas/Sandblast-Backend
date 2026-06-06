"use strict";

/**
 * LingoSentinelTranslationAdvisor
 *
 * Purpose:
 * Provides Marion-safe advisory translation metadata for LingoSentinel.
 *
 * Scope:
 * - Advisory only: never overrides Marion.
 * - Render-safe: every branch returns text/renderText/publicText/finalText.
 * - Failure-safe: missing dependencies or malformed metadata do not crash backend rendering.
 * - Audit-safe: preserves original input and normalized input.
 */

let detectLanguage = null;
let normalizeInput = null;

try {
  const languageDetectMod = require("./LingoSentinelLanguageDetect");
  if (languageDetectMod && typeof languageDetectMod.detectLanguage === "function") {
    detectLanguage = languageDetectMod.detectLanguage;
  }
} catch (_) {
  detectLanguage = null;
}

try {
  const normalizerMod = require("./LingoSentinelNormalizer");
  if (normalizerMod && typeof normalizerMod.normalizeInput === "function") {
    normalizeInput = normalizerMod.normalizeInput;
  }
} catch (_) {
  normalizeInput = null;
}

const VERSION = "LingoSentinelTranslationAdvisor v0.2.2 RENDER-SAFE-NULL-FALLBACK-HARDLOCK";

const DEFAULT_TRANSLATION_CONFIG = Object.freeze({
  enabled: true,
  defaultLanguage: "en",
  supportedLanguages: ["en", "fr", "es"],
  advisoryOnly: true,
  forceTranslation: false,
  renderSafeFallback: true,
  authority: {
    finalAuthority: "Marion",
    lingoSentinelAdvisoryOnly: true,
    neverOverrideMarion: true
  }
});

const PHRASE_TRANSLATION_MEMORY = Object.freeze({
  fr: Object.freeze({
    "bonjour": "hello",
    "bonjour comment ca va": "hello, how are you?",
    "bonjour comment ça va": "hello, how are you?",
    "comment ca va": "how are you?",
    "comment ça va": "how are you?",
    "merci": "thank you",
    "s il vous plait": "please",
    "s il vous plaît": "please",
    "sil vous plait": "please",
    "au revoir": "goodbye"
  }),
  es: Object.freeze({
    "hola": "hello",
    "hola como estas": "hello, how are you?",
    "hola cómo estás": "hello, how are you?",
    "como estas": "how are you?",
    "cómo estás": "how are you?",
    "gracias": "thank you",
    "por favor": "please",
    "adios": "goodbye",
    "adiós": "goodbye"
  })
});

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

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
  return isPlainObject(value) ? value : {};
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
  const f = Number(fallback);
  return Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0;
}

function normalizeLanguageCode(value, fallback = "unknown") {
  const text = safeString(value).trim().toLowerCase();
  if (["en", "eng", "english"].includes(text)) return "en";
  if (["fr", "fre", "fra", "french", "français", "francais"].includes(text)) return "fr";
  if (["es", "spa", "spanish", "español", "espanol"].includes(text)) return "es";
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
    .replace(/[¿¡]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[.,!?;:()\[\]{}"“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLookupKeys(value) {
  const base = normalizeKey(value);
  const stripped = normalizeKey(stripDiacritics(value));
  return Array.from(new Set([base, stripped].filter(Boolean)));
}

function extractTextInput(input) {
  if (typeof input === "string") return input;
  const obj = safeObject(input);
  return safeString(
    obj.message ||
    obj.input ||
    obj.text ||
    obj.prompt ||
    obj.originalInput ||
    obj.normalizedText ||
    ""
  );
}

function fallbackNormalizeInput(input) {
  const originalText = extractTextInput(input);
  const normalizedText = originalText
    .trim()
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([¿¡])\s+/g, "$1")
    .trim();

  return {
    originalText,
    normalizedText,
    changed: originalText !== normalizedText,
    operations: originalText !== normalizedText ? ["fallback_normalize"] : [],
    source: "LingoSentinelTranslationAdvisorFallbackNormalizer"
  };
}

function fallbackDetectLanguage(input, config = {}) {
  const text = normalizeKey(input);
  const plain = normalizeKey(stripDiacritics(input));

  if (!text) {
    return {
      detectedLanguage: "unknown",
      confidence: 0,
      supported: false,
      requiresTranslation: false,
      fallbackTriggered: true,
      reason: "empty_input",
      source: "LingoSentinelTranslationAdvisorFallbackDetect"
    };
  }

  let detectedLanguage = "unknown";
  let confidence = 0.12;

  if (/\b(bonjour|merci|comment|vous|plait|sil|revoir)\b/.test(plain)) {
    detectedLanguage = "fr";
    confidence = 0.82;
  } else if (/\b(hola|gracias|como|estas|por favor|adios)\b/.test(plain)) {
    detectedLanguage = "es";
    confidence = 0.82;
  } else if (/\b(hello|how|are|you|today|thanks|please|goodbye)\b/.test(plain)) {
    detectedLanguage = "en";
    confidence = 0.82;
  }

  const supportedLanguages = Array.isArray(config.supportedLanguages)
    ? config.supportedLanguages.map((item) => normalizeLanguageCode(item, "")).filter(Boolean)
    : ["en", "fr", "es"];

  const defaultLanguage = normalizeLanguageCode(config.defaultLanguage, "en");
  const supported = detectedLanguage !== "unknown" && supportedLanguages.includes(detectedLanguage);

  return {
    detectedLanguage,
    confidence,
    supported,
    requiresTranslation: supported && detectedLanguage !== defaultLanguage,
    fallbackTriggered: !supported,
    reason: supported ? "language_detected" : "low_confidence_or_ambiguous",
    source: "LingoSentinelTranslationAdvisorFallbackDetect"
  };
}

function safeMergeConfig(config) {
  const incoming = safeObject(config);
  return {
    ...DEFAULT_TRANSLATION_CONFIG,
    ...incoming,
    supportedLanguages: Array.isArray(incoming.supportedLanguages)
      ? incoming.supportedLanguages
      : DEFAULT_TRANSLATION_CONFIG.supportedLanguages,
    authority: {
      ...DEFAULT_TRANSLATION_CONFIG.authority,
      ...safeObject(incoming.authority),
      finalAuthority: "Marion",
      lingoSentinelAdvisoryOnly: true,
      neverOverrideMarion: true
    },
    advisoryOnly: true,
    forceTranslation: false
  };
}

function normalizeLanguageMeta(languageMeta, config, normalizedText) {
  const meta = safeObject(languageMeta);
  const defaultLanguage = normalizeLanguageCode(config.defaultLanguage, "en");
  const detectedLanguage = normalizeLanguageCode(meta.detectedLanguage, "unknown");
  const supportedLanguages = Array.isArray(config.supportedLanguages)
    ? config.supportedLanguages.map((item) => normalizeLanguageCode(item, "")).filter(Boolean)
    : ["en", "fr", "es"];

  if (detectedLanguage !== "unknown") {
    const supported = typeof meta.supported === "boolean"
      ? meta.supported
      : supportedLanguages.includes(detectedLanguage);

    return {
      detectedLanguage,
      confidence: clamp01(meta.confidence, 0.74),
      supported,
      requiresTranslation: typeof meta.requiresTranslation === "boolean"
        ? meta.requiresTranslation
        : supported && detectedLanguage !== defaultLanguage,
      fallbackTriggered: !!meta.fallbackTriggered,
      reason: safeString(meta.reason) || (supported ? "language_detected" : "unsupported_language"),
      source: safeString(meta.source) || "LingoSentinelTranslationAdvisor"
    };
  }

  if (typeof detectLanguage === "function") {
    try {
      return normalizeLanguageMeta(
        detectLanguage(normalizedText, {
          config: {
            supportedLanguages,
            defaultLanguage,
            unknownLanguage: "unknown"
          }
        }),
        config,
        normalizedText
      );
    } catch (_) {}
  }

  return fallbackDetectLanguage(normalizedText, {
    supportedLanguages,
    defaultLanguage
  });
}

function lookupAdvisoryTranslation(normalizedText, sourceLanguage) {
  const lang = normalizeLanguageCode(sourceLanguage, "unknown");
  const languageMemory = PHRASE_TRANSLATION_MEMORY[lang];
  const original = safeString(normalizedText);

  if (!languageMemory) {
    return {
      translatedText: original,
      matched: false,
      method: "passthrough"
    };
  }

  const keys = normalizeLookupKeys(original);
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(languageMemory, key)) {
      return {
        translatedText: languageMemory[key],
        matched: true,
        method: "phrase_memory"
      };
    }
  }

  return {
    translatedText: original,
    matched: false,
    method: "passthrough"
  };
}

function makeRenderAliases(text, fallbackText = "") {
  const safeText = safeString(text);
  const safeFallback = safeString(fallbackText);
  const renderText = safeText || safeFallback;

  return {
    text: renderText,
    renderText,
    publicText: renderText,
    finalText: renderText,
    safeToRender: true,
    renderSafe: true
  };
}

function buildAdvisoryEnvelope({
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
  reason = "translation_advisory_created",
  method = "passthrough",
  config = DEFAULT_TRANSLATION_CONFIG
} = {}) {
  const safeConfig = safeMergeConfig(config);
  const safeOriginalText = safeString(originalText);
  const safeNormalizedText = safeString(normalizedText);
  const preferredText = safeString(advisoryText) || safeString(translatedText) || safeNormalizedText || safeOriginalText;
  const renderAliases = makeRenderAliases(preferredText, safeNormalizedText || safeOriginalText);

  return {
    version: VERSION,
    originalText: safeOriginalText,
    normalizedText: safeNormalizedText,
    advisoryText: renderAliases.renderText,
    translatedText: renderAliases.renderText,
    sourceLanguage: normalizeLanguageCode(sourceLanguage, "unknown"),
    targetLanguage: normalizeLanguageCode(targetLanguage, "en"),
    translated: !!translated,
    advisoryOnly: true,
    forceTranslation: false,
    confidence: clamp01(confidence, 0),
    supported: !!supported,
    fallbackTriggered: !!fallbackTriggered,
    reason: safeString(reason) || "translation_advisory_created",
    method: safeString(method) || "passthrough",
    authority: {
      ...safeConfig.authority,
      finalAuthority: "Marion",
      lingoSentinelAdvisoryOnly: true,
      neverOverrideMarion: true
    },
    ...renderAliases,
    source: "LingoSentinelTranslationAdvisor"
  };
}

function adviseTranslation(input, options = {}) {
  const opts = safeObject(options);
  const config = safeMergeConfig(opts.config);

  let normalization = safeObject(opts.normalization);
  if (!normalization.normalizedText && !normalization.originalText) {
    if (typeof normalizeInput === "function") {
      try {
        normalization = normalizeInput(input);
      } catch (_) {
        normalization = fallbackNormalizeInput(input);
      }
    } else {
      normalization = fallbackNormalizeInput(input);
    }
  }

  const originalText = safeString(
    normalization.originalText !== undefined
      ? normalization.originalText
      : extractTextInput(input)
  );
  const normalizedText = safeString(
    normalization.normalizedText !== undefined
      ? normalization.normalizedText
      : originalText
  );

  const languageMeta = normalizeLanguageMeta(opts.languageMeta, config, normalizedText);
  const sourceLanguage = languageMeta.detectedLanguage || "unknown";
  const targetLanguage = normalizeLanguageCode(config.defaultLanguage, "en");

  if (!config.enabled) {
    return buildAdvisoryEnvelope({
      originalText,
      normalizedText,
      advisoryText: normalizedText,
      translatedText: normalizedText,
      sourceLanguage,
      targetLanguage,
      translated: false,
      confidence: languageMeta.confidence,
      supported: !!languageMeta.supported,
      fallbackTriggered: true,
      reason: "translation_advisor_disabled",
      method: "disabled",
      config
    });
  }

  if (!normalizedText) {
    return buildAdvisoryEnvelope({
      originalText,
      normalizedText,
      advisoryText: "",
      translatedText: "",
      sourceLanguage: "unknown",
      targetLanguage,
      translated: false,
      confidence: 0,
      supported: false,
      fallbackTriggered: true,
      reason: "empty_input",
      method: "fallback",
      config
    });
  }

  if (!languageMeta.supported || sourceLanguage === "unknown") {
    return buildAdvisoryEnvelope({
      originalText,
      normalizedText,
      advisoryText: normalizedText,
      translatedText: normalizedText,
      sourceLanguage,
      targetLanguage,
      translated: false,
      confidence: languageMeta.confidence,
      supported: false,
      fallbackTriggered: true,
      reason: "unsupported_or_unknown_language",
      method: "fallback",
      config
    });
  }

  if (!languageMeta.requiresTranslation) {
    return buildAdvisoryEnvelope({
      originalText,
      normalizedText,
      advisoryText: normalizedText,
      translatedText: normalizedText,
      sourceLanguage,
      targetLanguage,
      translated: false,
      confidence: languageMeta.confidence,
      supported: true,
      fallbackTriggered: false,
      reason: "translation_not_required",
      method: "passthrough",
      config
    });
  }

  const lookup = lookupAdvisoryTranslation(normalizedText, sourceLanguage);

  return buildAdvisoryEnvelope({
    originalText,
    normalizedText,
    advisoryText: lookup.translatedText,
    translatedText: lookup.translatedText,
    sourceLanguage,
    targetLanguage,
    translated: lookup.matched,
    confidence: lookup.matched ? Math.max(0.8, languageMeta.confidence || 0.8) : languageMeta.confidence,
    supported: true,
    fallbackTriggered: !lookup.matched,
    reason: lookup.matched ? "translation_advisory_created" : "no_phrase_memory_match",
    method: lookup.method,
    config
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
  DEFAULT_TRANSLATION_CONFIG,
  PHRASE_TRANSLATION_MEMORY,
  default: adviseTranslation
};
