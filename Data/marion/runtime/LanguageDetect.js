"use strict";

/**
 * LanguageDetect.js
 * Lightweight local language detector for Marion/Nyx Universal Translator.
 *
 * Phase 1 scope:
 * - English
 * - French
 * - Spanish
 *
 * Purpose:
 * - Avoid paid detection APIs.
 * - Provide stable source-language metadata.
 * - Help Marion normalize French/Spanish prompts into an English routing lane later.
 *
 * Note:
 * - This is intentionally lightweight.
 * - Later we can swap this with a stronger local model without changing the public contract.
 */

const SUPPORTED_LANGUAGES = ["en", "fr", "es"];

const LANGUAGE_LABELS = {
  en: "English",
  fr: "French",
  es: "Spanish",
  unknown: "Unknown"
};

const FRENCH_SIGNALS = [
  "bonjour",
  "merci",
  "salut",
  "oui",
  "non",
  "comment",
  "pourquoi",
  "parce que",
  "avec",
  "dans",
  "pour",
  "vous",
  "nous",
  "je suis",
  "tu es",
  "il est",
  "elle est",
  "c'est",
  "est-ce",
  "ça",
  "français",
  "aujourd'hui",
  "demain",
  "très",
  "être",
  "avoir",
  "lorsque",
  "quel",
  "quelle",
  "quels",
  "quelles",
  "le ",
  " la ",
  " les ",
  " des ",
  " du ",
  " une ",
  " un "
];

const SPANISH_SIGNALS = [
  "hola",
  "gracias",
  "sí",
  "no",
  "cómo",
  "porque",
  "por qué",
  "para",
  "con",
  "usted",
  "nosotros",
  "yo soy",
  "tú eres",
  "él es",
  "ella es",
  "español",
  "hoy",
  "mañana",
  "muy",
  "estar",
  "tener",
  "cuando",
  "qué",
  "cuál",
  "cuáles",
  "el ",
  " la ",
  " los ",
  " las ",
  " una ",
  " un "
];

const ENGLISH_SIGNALS = [
  "hello",
  "thanks",
  "thank you",
  "yes",
  "no",
  "how",
  "why",
  "because",
  "with",
  "inside",
  "for",
  "you",
  "we",
  "i am",
  "you are",
  "he is",
  "she is",
  "english",
  "today",
  "tomorrow",
  "very",
  "what",
  "which",
  "who",
  "where",
  "when",
  " the ",
  " and ",
  " of ",
  " to ",
  " in ",
  " is "
];

function normalizeText(value) {
  if (!value || typeof value !== "string") return "";

  return ` ${value
    .toLowerCase()
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function normalizeLanguageCode(lang) {
  if (!lang || typeof lang !== "string") return "unknown";

  const value = lang.trim().toLowerCase();

  if (value.startsWith("en")) return "en";
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("es")) return "es";

  return "unknown";
}

function isSupportedLanguage(lang) {
  return SUPPORTED_LANGUAGES.includes(normalizeLanguageCode(lang));
}

function countSignalMatches(sample, signals) {
  if (!sample) return 0;

  let score = 0;

  for (const signal of signals) {
    if (!signal || typeof signal !== "string") continue;

    if (sample.includes(signal)) {
      score += signal.length <= 4 ? 1 : 2;
    }
  }

  return score;
}

function detectAccentBias(sample) {
  let frBias = 0;
  let esBias = 0;

  if (/[àâçéèêëîïôùûüÿœ]/i.test(sample)) frBias += 2;
  if (/[áéíóúñü¿¡]/i.test(sample)) esBias += 2;

  return { frBias, esBias };
}

function calculateConfidence(topScore, secondScore, textLength) {
  if (topScore <= 0) return 0;

  const gap = Math.max(0, topScore - secondScore);
  const lengthBoost = Math.min(0.12, textLength / 800);
  const scoreBoost = Math.min(0.28, topScore * 0.035);
  const gapBoost = Math.min(0.22, gap * 0.055);

  return Number(Math.min(0.97, 0.46 + lengthBoost + scoreBoost + gapBoost).toFixed(3));
}

/**
 * detectLanguage()
 *
 * Returns:
 * {
 *   language: "en" | "fr" | "es" | "unknown",
 *   label: "English" | "French" | "Spanish" | "Unknown",
 *   confidence: number,
 *   method: string,
 *   scores: { en, fr, es }
 * }
 */
function detectLanguage(text, options = {}) {
  const sample = normalizeText(text);

  if (!sample) {
    return {
      language: "unknown",
      label: LANGUAGE_LABELS.unknown,
      confidence: 0,
      method: "empty-input",
      scores: { en: 0, fr: 0, es: 0 }
    };
  }

  const bias = detectAccentBias(sample);

  const scores = {
    en: countSignalMatches(sample, ENGLISH_SIGNALS),
    fr: countSignalMatches(sample, FRENCH_SIGNALS) + bias.frBias,
    es: countSignalMatches(sample, SPANISH_SIGNALS) + bias.esBias
  };

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topLang, topScore] = sorted[0];
  const [, secondScore] = sorted[1];

  if (topScore <= 0) {
    return {
      language: options.defaultLanguage || "en",
      label: LANGUAGE_LABELS[options.defaultLanguage || "en"] || LANGUAGE_LABELS.en,
      confidence: 0.52,
      method: "default-language",
      scores
    };
  }

  const confidence = calculateConfidence(topScore, secondScore, sample.length);

  /**
   * Ambiguous French/Spanish cases often share articles like "la" and "un".
   * If the confidence is weak, default to English unless requested otherwise.
   */
  if (confidence < 0.55 && options.allowLowConfidence !== true) {
    return {
      language: options.defaultLanguage || "en",
      label: LANGUAGE_LABELS[options.defaultLanguage || "en"] || LANGUAGE_LABELS.en,
      confidence,
      method: "low-confidence-default",
      scores
    };
  }

  return {
    language: topLang,
    label: LANGUAGE_LABELS[topLang] || LANGUAGE_LABELS.unknown,
    confidence,
    method: "local-signal-detector",
    scores
  };
}

function detectTargetLanguageFromRequest(text) {
  const sample = normalizeText(text);

  if (!sample) return null;

  const targetPatterns = [
    { lang: "fr", patterns: ["in french", "to french", "en français", "vers le français", "translate to french"] },
    { lang: "es", patterns: ["in spanish", "to spanish", "en español", "al español", "translate to spanish"] },
    { lang: "en", patterns: ["in english", "to english", "en anglais", "en inglés", "translate to english"] }
  ];

  for (const item of targetPatterns) {
    for (const pattern of item.patterns) {
      if (sample.includes(pattern)) {
        return item.lang;
      }
    }
  }

  return null;
}

module.exports = {
  VERSION: "0.1.0",
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABELS,
  normalizeText,
  normalizeLanguageCode,
  isSupportedLanguage,
  detectLanguage,
  detectTargetLanguageFromRequest
};
