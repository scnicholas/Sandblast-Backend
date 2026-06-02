"use strict";

/**
 * LingoLinkTranslationAdvisor
 *
 * Purpose:
 * Provides advisory translation metadata for Marion.
 *
 * Scope:
 * - Does not override Marion.
 * - Does not perform full production translation.
 * - Produces safe translation advisories.
 * - Preserves original input.
 * - Allows Marion to decide how to respond.
 */

const {
  detectLanguage
} = require("./LingoLinkLanguageDetect");

const {
  normalizeInput
} = require("./LingoLinkNormalizer");

const DEFAULT_TRANSLATION_CONFIG = {
  enabled: true,
  defaultLanguage: "en",
  supportedLanguages: ["en", "fr", "es"],
  advisoryOnly: true,
  forceTranslation: false,
  authority: {
    finalAuthority: "Marion",
    lingoLinkAdvisoryOnly: true,
    neverOverrideMarion: true
  }
};

const PHRASE_TRANSLATION_MEMORY = {
  fr: {
    "bonjour": "hello",
    "bonjour, comment ça va?": "hello, how are you?",
    "bonjour, comment ca va?": "hello, how are you?",
    "comment ça va?": "how are you?",
    "comment ca va?": "how are you?",
    "merci": "thank you",
    "s'il vous plaît": "please",
    "sil vous plait": "please",
    "au revoir": "goodbye"
  },
  es: {
    "hola": "hello",
    "hola, cómo estás?": "hello, how are you?",
    "hola, como estas?": "hello, how are you?",
    "cómo estás?": "how are you?",
    "como estas?": "how are you?",
    "gracias": "thank you",
    "por favor": "please",
    "adiós": "goodbye",
    "adios": "goodbye"
  }
};

function safeString(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return String(value);
  } catch (_) {
    return "";
  }
}

function normalizeKey(value) {
  return safeString(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function safeMergeConfig(config) {
  return {
    ...DEFAULT_TRANSLATION_CONFIG,
    ...(config || {}),
    authority: {
      ...DEFAULT_TRANSLATION_CONFIG.authority,
      ...((config && config.authority) || {})
    }
  };
}

function lookupAdvisoryTranslation(normalizedText, sourceLanguage) {
  const languageMemory = PHRASE_TRANSLATION_MEMORY[sourceLanguage];

  if (!languageMemory) {
    return {
      translatedText: normalizedText,
      matched: false,
      method: "passthrough"
    };
  }

  const key = normalizeKey(normalizedText);
  const translatedText = languageMemory[key];

  if (!translatedText) {
    return {
      translatedText: normalizedText,
      matched: false,
      method: "passthrough"
    };
  }

  return {
    translatedText,
    matched: true,
    method: "phrase_memory"
  };
}

function buildDisabledAdvisory(originalText, normalizedText, languageMeta, config) {
  return {
    originalText,
    normalizedText,
    advisoryText: normalizedText,
    translatedText: normalizedText,
    sourceLanguage: languageMeta.detectedLanguage || config.defaultLanguage,
    targetLanguage: config.defaultLanguage,
    translated: false,
    advisoryOnly: true,
    forceTranslation: false,
    confidence: languageMeta.confidence || 0,
    supported: Boolean(languageMeta.supported),
    fallbackTriggered: true,
    reason: "translation_advisor_disabled",
    method: "disabled",
    authority: config.authority,
    source: "LingoLinkTranslationAdvisor"
  };
}

function buildNoTranslationNeededAdvisory(originalText, normalizedText, languageMeta, config) {
  return {
    originalText,
    normalizedText,
    advisoryText: normalizedText,
    translatedText: normalizedText,
    sourceLanguage: languageMeta.detectedLanguage || config.defaultLanguage,
    targetLanguage: config.defaultLanguage,
    translated: false,
    advisoryOnly: true,
    forceTranslation: false,
    confidence: languageMeta.confidence || 0,
    supported: Boolean(languageMeta.supported),
    fallbackTriggered: false,
    reason: "translation_not_required",
    method: "passthrough",
    authority: config.authority,
    source: "LingoLinkTranslationAdvisor"
  };
}

function buildFallbackAdvisory(originalText, normalizedText, languageMeta, config, reason) {
  return {
    originalText,
    normalizedText,
    advisoryText: normalizedText,
    translatedText: normalizedText,
    sourceLanguage: languageMeta.detectedLanguage || "unknown",
    targetLanguage: config.defaultLanguage,
    translated: false,
    advisoryOnly: true,
    forceTranslation: false,
    confidence: languageMeta.confidence || 0,
    supported: false,
    fallbackTriggered: true,
    reason,
    method: "fallback",
    authority: config.authority,
    source: "LingoLinkTranslationAdvisor"
  };
}

function adviseTranslation(input, options = {}) {
  const config = safeMergeConfig(options.config);
  const normalization = options.normalization || normalizeInput(input);
  const originalText = safeString(normalization.originalText);
  const normalizedText = safeString(normalization.normalizedText);

  const languageMeta =
    options.languageMeta ||
    detectLanguage(normalizedText, {
      config: {
        supportedLanguages: config.supportedLanguages,
        defaultLanguage: config.defaultLanguage
      }
    });

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

  return {
    originalText,
    normalizedText,
    advisoryText: lookup.translatedText,
    translatedText: lookup.translatedText,
    sourceLanguage: languageMeta.detectedLanguage,
    targetLanguage: config.defaultLanguage,
    translated: lookup.matched,
    advisoryOnly: true,
    forceTranslation: false,
    confidence: lookup.matched
      ? Math.min(1, Number((languageMeta.confidence || 0.8).toFixed(2)))
      : Number((languageMeta.confidence || 0).toFixed(2)),
    supported: true,
    fallbackTriggered: !lookup.matched,
    reason: lookup.matched
      ? "translation_advisory_created"
      : "no_phrase_memory_match",
    method: lookup.method,
    authority: config.authority,
    source: "LingoLinkTranslationAdvisor"
  };
}

module.exports = {
  adviseTranslation,
  lookupAdvisoryTranslation,
  DEFAULT_TRANSLATION_CONFIG,
  PHRASE_TRANSLATION_MEMORY
};
