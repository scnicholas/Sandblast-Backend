"use strict";

/**
 * LingoSentinelLanguageDetect
 *
 * Purpose:
 * Lightweight advisory language detection gateway for Marion/LingoSentinel.
 *
 * Scope:
 * - Detects English, French, Spanish, or unknown.
 * - Handles short phrases, including unaccented Spanish/French user input.
 * - Returns structured metadata only.
 * - Does not translate.
 * - Does not mutate user input.
 * - Does not override Marion authority.
 */

const DEFAULT_CONFIG = Object.freeze({
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
    lingosentinelAdvisoryOnly: true
  }
});

const LANGUAGE_LEXICONS = Object.freeze({
  en: [
    "hello", "hi", "hey", "good", "morning", "night", "today", "tomorrow",
    "the", "and", "you", "are", "is", "this", "that", "with", "for",
    "what", "how", "why", "where", "when", "thanks", "thank", "please",
    "need", "help", "tell", "about", "explain", "i", "we", "they", "he", "she",
    "it", "my", "your", "our", "their", "can", "could", "would", "should"
  ],
  fr: [
    "bonjour", "salut", "merci", "comment", "ca", "ça", "va", "oui", "non",
    "s'il", "sil", "vous", "plait", "plaît", "je", "tu", "il", "elle", "nous",
    "ils", "elles", "mon", "ma", "mes", "votre", "le", "la", "les", "un",
    "une", "des", "est", "sont", "avec", "pour", "quoi", "qui", "ou", "où",
    "dans", "sur", "de", "du", "ce", "cette"
  ],
  es: [
    "hola", "gracias", "como", "cómo", "estas", "estás", "buenos", "buenas",
    "dias", "días", "tardes", "noches", "por", "favor", "yo", "tu", "tú",
    "el", "él", "ella", "nosotros", "ustedes", "ellos", "ellas", "mi", "mis",
    "su", "es", "son", "con", "para", "que", "qué", "quien", "quién", "donde",
    "dónde", "cuando", "cuándo", "muy", "bien", "necesito", "ayuda"
  ]
});

const CHARACTER_HINTS = Object.freeze({
  fr: /[àâçéèêëîïôùûüÿœ]/i,
  es: /[áéíóúñü¿¡]/i
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

function normalizeForDetection(value) {
  return safeString(value)
    .trim()
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ");
}

function tokenize(text) {
  const normalized = normalizeForDetection(text)
    .replace(/[¿¡]/g, " ")
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

function countTokenMatches(tokens, lexicon) {
  if (!Array.isArray(tokens) || !Array.isArray(lexicon)) return 0;
  const lexiconSet = new Set(lexicon);
  return tokens.reduce((count, token) => count + (lexiconSet.has(token) ? 1 : 0), 0);
}

function scoreLanguage(text, languageCode) {
  const originalText = safeString(text);
  const tokens = tokenize(originalText);
  if (!tokens.length) return 0;

  const lexicon = LANGUAGE_LEXICONS[languageCode] || [];
  const matches = countTokenMatches(tokens, lexicon);
  const tokenRatio = matches / Math.max(tokens.length, 1);
  const matchDensity = matches / Math.max(Math.min(tokens.length, 6), 1);

  let score = Math.max(tokenRatio, matchDensity);

  if (tokens.length <= 4 && matches >= 1) score += 0.22;
  if (tokens.length <= 4 && matches >= 2) score += 0.18;
  if (tokens.length <= 6 && matches >= 3) score += 0.12;

  const characterHint = CHARACTER_HINTS[languageCode];
  if (characterHint && characterHint.test(originalText)) score += 0.18;

  // Avoid over-crediting English for single common words in very short inputs.
  if (languageCode === "en" && tokens.length <= 2 && matches === 1) score -= 0.12;

  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
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

function mergeConfig(options) {
  const supplied = options && typeof options === "object" ? options.config || {} : {};

  return {
    ...DEFAULT_CONFIG,
    ...supplied,
    confidenceThresholds: {
      ...DEFAULT_CONFIG.confidenceThresholds,
      ...(supplied.confidenceThresholds || {})
    },
    authority: {
      ...DEFAULT_CONFIG.authority,
      ...(supplied.authority || {})
    }
  };
}

function detectLanguage(input, options = {}) {
  const config = mergeConfig(options);
  const originalText = safeString(input);
  const detectionText = normalizeForDetection(originalText);

  if (!config.enabled) {
    return {
      detectedLanguage: config.defaultLanguage || "en",
      confidence: 1,
      supported: true,
      requiresTranslation: false,
      fallbackTriggered: false,
      reason: "lingosentinel_detection_disabled",
      source: "LingoSentinelLanguageDetect"
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
      source: "LingoSentinelLanguageDetect"
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
      source: "LingoSentinelLanguageDetect"
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
    source: "LingoSentinelLanguageDetect"
  };
}

module.exports = {
  detectLanguage,
  normalizeForDetection,
  scoreLanguage,
  DEFAULT_CONFIG,
  LANGUAGE_LEXICONS
};
