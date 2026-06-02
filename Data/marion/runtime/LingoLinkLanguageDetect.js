"use strict";

/**
 * LingoLinkLanguageDetect
 *
 * Purpose:
 * Lightweight language detection gateway for Marion/LingoLink.
 *
 * Scope:
 * - Detects English, French, Spanish, or unknown.
 * - Returns structured metadata only.
 * - Does not translate.
 * - Does not mutate user input.
 * - Does not override Marion authority.
 */

const DEFAULT_CONFIG = {
  enabled: true,
  supportedLanguages: ["en", "fr", "es"],
  defaultLanguage: "en",
  unknownLanguage: "unknown",
  confidenceThresholds: {
    detect: 0.65,
    safe: 0.8,
    fallback: 0.45
  },
  authority: {
    finalAuthority: "Marion",
    lingolinkAdvisoryOnly: true
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

function normalizeForDetection(value) {
  return safeString(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function countMatches(text, patterns) {
  if (!text || !Array.isArray(patterns)) return 0;

  return patterns.reduce((count, pattern) => {
    if (!pattern) return count;

    if (pattern instanceof RegExp) {
      return count + (pattern.test(text) ? 1 : 0);
    }

    return count + (text.includes(String(pattern).toLowerCase()) ? 1 : 0);
  }, 0);
}

const LANGUAGE_PATTERNS = {
  en: [
    /\b(the|and|you|are|is|this|that|with|for|what|how|hello|thanks|please)\b/i,
    /\b(good|morning|night|today|tomorrow|need|help|tell|about|explain)\b/i,
    /\b(i|we|they|he|she|it|my|your|our|their)\b/i
  ],

  fr: [
    /\b(bonjour|salut|merci|s'il|sil|vous|plaît|plait|comment|ça|ca|va)\b/i,
    /\b(je|tu|il|elle|nous|vous|ils|elles|mon|ma|mes|votre)\b/i,
    /\b(le|la|les|un|une|des|est|sont|avec|pour|quoi|qui|où|ou)\b/i,
    /[àâçéèêëîïôùûüÿœ]/i
  ],

  es: [
    /\b(hola|gracias|por favor|como|cómo|estas|estás|buenos|buenas)\b/i,
    /\b(yo|tú|tu|él|ella|nosotros|ustedes|ellos|ellas|mi|mis|su)\b/i,
    /\b(el|la|los|las|un|una|unos|unas|es|son|con|para|qué|que|quién)\b/i,
    /[áéíóúñü¿¡]/i
  ]
};

function scoreLanguage(text, languageCode) {
  const patterns = LANGUAGE_PATTERNS[languageCode] || [];
  const matches = countMatches(text, patterns);

  if (!text) return 0;

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const baseScore = matches / Math.max(patterns.length, 1);

  /**
   * Short text needs a slightly forgiving boost because phrases like
   * "bonjour" or "hola" may only trigger one strong language signal.
   */
  const shortTextBoost = wordCount <= 4 && matches > 0 ? 0.18 : 0;

  /**
   * Accent/character matches are strong evidence for French or Spanish.
   */
  const characterBoost =
    (languageCode === "fr" && /[àâçéèêëîïôùûüÿœ]/i.test(text)) ||
    (languageCode === "es" && /[áéíóúñü¿¡]/i.test(text))
      ? 0.2
      : 0;

  return Math.min(1, Number((baseScore + shortTextBoost + characterBoost).toFixed(2)));
}

function chooseBestLanguage(scores) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestLanguage, bestScore] = entries[0] || ["unknown", 0];
  const [, secondScore] = entries[1] || ["unknown", 0];

  return {
    bestLanguage,
    bestScore,
    secondScore,
    margin: Number((bestScore - secondScore).toFixed(2))
  };
}

function detectLanguage(input, options = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...(options.config || {}),
    confidenceThresholds: {
      ...DEFAULT_CONFIG.confidenceThresholds,
      ...((options.config && options.config.confidenceThresholds) || {})
    },
    authority: {
      ...DEFAULT_CONFIG.authority,
      ...((options.config && options.config.authority) || {})
    }
  };

  const originalText = safeString(input);
  const detectionText = normalizeForDetection(originalText);

  if (!config.enabled) {
    return {
      detectedLanguage: config.defaultLanguage || "en",
      confidence: 1,
      supported: true,
      requiresTranslation: false,
      fallbackTriggered: false,
      reason: "lingolink_detection_disabled",
      source: "LingoLinkLanguageDetect"
    };
  }

  if (!detectionText) {
    return {
      detectedLanguage: config.unknownLanguage || "unknown",
      confidence: 0,
      supported: false,
      requiresTranslation: false,
      fallbackTriggered: true,
      reason: "empty_input",
      source: "LingoLinkLanguageDetect"
    };
  }

  const scores = {
    en: scoreLanguage(detectionText, "en"),
    fr: scoreLanguage(detectionText, "fr"),
    es: scoreLanguage(detectionText, "es")
  };

  const choice = chooseBestLanguage(scores);
  const detectThreshold = Number(config.confidenceThresholds.detect || 0.65);
  const fallbackThreshold = Number(config.confidenceThresholds.fallback || 0.45);

  const ambiguous =
    choice.bestScore < detectThreshold ||
    choice.bestScore < fallbackThreshold ||
    choice.margin < 0.08;

  if (ambiguous) {
    return {
      detectedLanguage: config.unknownLanguage || "unknown",
      confidence: choice.bestScore,
      supported: false,
      requiresTranslation: false,
      fallbackTriggered: true,
      reason: "low_confidence_or_ambiguous",
      candidates: scores,
      source: "LingoLinkLanguageDetect"
    };
  }

  const supported = Array.isArray(config.supportedLanguages)
    ? config.supportedLanguages.includes(choice.bestLanguage)
    : ["en", "fr", "es"].includes(choice.bestLanguage);

  return {
    detectedLanguage: choice.bestLanguage,
    confidence: choice.bestScore,
    supported,
    requiresTranslation: supported && choice.bestLanguage !== (config.defaultLanguage || "en"),
    fallbackTriggered: !supported,
    reason: supported ? "language_detected" : "unsupported_language",
    candidates: scores,
    source: "LingoLinkLanguageDetect"
  };
}

module.exports = {
  detectLanguage,
  normalizeForDetection,
  scoreLanguage,
  DEFAULT_CONFIG
};
