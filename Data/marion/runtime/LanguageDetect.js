"use strict";

/**
 * LanguageDetect.js
 * Lightweight local language detector for Marion/Nyx Universal Translator.
 *
 * Hardened Phase-1/Phase-2 detector.
 *
 * Scope:
 * - English
 * - French
 * - Spanish
 *
 * Design rules:
 * - No external dependencies.
 * - Fail-safe: detection should never crash Marion routing.
 * - Conservative confidence: ambiguous text should not overclaim.
 * - Adapter-compatible: exports detectLanguage(), normalizeLanguageCode(),
 *   isSupportedLanguage(), and detectTargetLanguageFromRequest().
 * - Translation-safe: strips URLs/code-ish noise from scoring without changing
 *   the original caller text.
 */

const VERSION = "0.2.0 + LINGOLINK-ASTER-GATEWAY";

const SUPPORTED_LANGUAGES = ["en", "fr", "es"];

const LANGUAGE_LABELS = {
  en: "English",
  fr: "French",
  es: "Spanish",
  unknown: "Unknown"
};

const DEFAULT_SCORES = Object.freeze({ en: 0, fr: 0, es: 0 });

/**
 * Weighted phrase signals.
 * Keep high-specificity phrases weighted above short/common particles.
 */
const SIGNALS = {
  en: [
    ["thank you", 4], ["how are you", 4], ["what is", 3], ["where is", 3],
    ["can you", 3], ["could you", 3], ["i need", 3], ["i want", 3],
    ["please", 3], ["because", 3], ["with", 2], ["inside", 2],
    ["today", 2], ["tomorrow", 2], ["english", 4], ["translate", 3],
    ["hello", 3], ["thanks", 3], ["yes", 2], ["why", 2], ["what", 2],
    ["which", 2], ["who", 2], ["when", 2], ["you", 1], ["we", 1],
    ["the", 1], ["and", 1], ["of", 1], ["to", 1], ["in", 1], ["is", 1]
  ],
  fr: [
    ["s'il vous plaît", 5], ["est-ce que", 5], ["parce que", 4],
    ["je voudrais", 4], ["peux-tu", 4], ["pouvez-vous", 4],
    ["qu'est-ce", 4], ["aujourd'hui", 4], ["comment ça va", 5],
    ["bonjour", 4], ["merci", 4], ["salut", 3], ["français", 5],
    ["pourquoi", 3], ["comment", 3], ["avec", 2], ["dans", 2],
    ["pour", 2], ["vous", 2], ["nous", 2], ["je suis", 3],
    ["tu es", 3], ["il est", 3], ["elle est", 3], ["c'est", 3],
    ["ça", 3], ["très", 3], ["être", 4], ["avoir", 2],
    ["lorsque", 3], ["quel", 2], ["quelle", 2], ["quels", 2],
    ["quelles", 2], ["oui", 2], ["non", 1], ["le", 1], ["les", 1],
    ["des", 1], ["du", 1], ["une", 1], ["un", 1], ["la", 1]
  ],
  es: [
    ["por favor", 5], ["por qué", 4], ["porque", 3],
    ["cómo estás", 5], ["buenos días", 5], ["buenas tardes", 5],
    ["me gustaría", 4], ["puedes", 3], ["podrías", 3],
    ["qué es", 3], ["dónde está", 4], ["español", 5],
    ["hola", 4], ["gracias", 4], ["cómo", 3], ["usted", 3],
    ["nosotros", 2], ["yo soy", 3], ["tú eres", 4],
    ["él es", 3], ["ella es", 3], ["hoy", 2], ["mañana", 4],
    ["muy", 2], ["estar", 3], ["tener", 3], ["cuando", 3],
    ["qué", 3], ["cuál", 3], ["cuáles", 3], ["sí", 3],
    ["con", 2], ["para", 2], ["el", 1], ["los", 1], ["las", 1],
    ["una", 1], ["un", 1], ["la", 1], ["no", 1]
  ]
};

const PROJECT_GATEWAY_SIGNALS = Object.freeze({
  lingoLink: Object.freeze([
    "lingolink",
    "lingo link",
    "language sphere",
    "languagesphere",
    "translation gateway",
    "language gateway",
    "multilingual gateway"
  ]),
  aster: Object.freeze([
    "aster",
    "environmental pathway",
    "environmental gateway",
    "climate signal",
    "weather signal",
    "environmental intelligence",
    "ecological signal"
  ])
});

function detectProjectGatewayFromRequest(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return { matched: false, gateway: "", confidence: 0, reason: "empty-text" };
  }

  const hits = [];
  for (const [gateway, terms] of Object.entries(PROJECT_GATEWAY_SIGNALS)) {
    for (const term of terms) {
      if (normalized.includes(normalizeText(term))) hits.push({ gateway, term });
    }
  }

  if (!hits.length) {
    return { matched: false, gateway: "", confidence: 0, reason: "no-project-gateway-signal" };
  }

  const counts = hits.reduce((acc, hit) => {
    acc[hit.gateway] = (acc[hit.gateway] || 0) + 1;
    return acc;
  }, {});
  const gateway = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const confidence = Math.min(0.97, 0.72 + counts[gateway] * 0.08);

  return {
    matched: true,
    gateway,
    confidence,
    hits: hits.filter((hit) => hit.gateway === gateway),
    reason: "project-gateway-signal"
  };
}

const DIACRITIC_BIAS = {
  fr: [
    ["à", 2], ["â", 2], ["ç", 3], ["è", 2], ["ê", 2], ["ë", 2],
    ["î", 2], ["ï", 2], ["ô", 2], ["ù", 2], ["û", 2], ["œ", 4],
    ["ÿ", 2]
  ],
  es: [
    ["á", 2], ["í", 2], ["ó", 2], ["ú", 2], ["ñ", 4], ["¿", 4], ["¡", 4]
  ],
  shared: [
    /**
     * é appears in both French and Spanish. It should not decide the language alone.
     */
    ["é", 1],
    ["ü", 1]
  ]
};

const TARGET_LANGUAGE_PATTERNS = [
  {
    lang: "fr",
    patterns: [
      "in french",
      "to french",
      "into french",
      "translate to french",
      "translate this to french",
      "en français",
      "vers le français",
      "traduire en français",
      "traduis en français",
      "français"
    ]
  },
  {
    lang: "es",
    patterns: [
      "in spanish",
      "to spanish",
      "into spanish",
      "translate to spanish",
      "translate this to spanish",
      "en español",
      "al español",
      "traducir al español",
      "traduce al español",
      "español"
    ]
  },
  {
    lang: "en",
    patterns: [
      "in english",
      "to english",
      "into english",
      "translate to english",
      "translate this to english",
      "en anglais",
      "vers l'anglais",
      "en inglés",
      "al inglés",
      "anglais",
      "inglés"
    ]
  }
];

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function stripScoringNoise(value) {
  return safeString(value)
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/www\.\S+/gi, " ")
    .replace(/[`*_~#>{}\[\]();=|\\/]+/g, " ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, " ");
}

function normalizeText(value) {
  const text = stripScoringNoise(value);

  if (!text) return "";

  return ` ${text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[.,!?;:()[\]{}<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function normalizeLanguageCode(lang) {
  if (!lang || typeof lang !== "string") return "unknown";

  const value = lang.trim().toLowerCase();

  if (!value) return "unknown";
  if (value === "auto") return "auto";
  if (value === "unknown") return "unknown";
  if (value.startsWith("en")) return "en";
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("es")) return "es";

  return "unknown";
}

function isSupportedLanguage(lang) {
  const normalized = normalizeLanguageCode(lang);
  return SUPPORTED_LANGUAGES.includes(normalized);
}

function hasWordOrPhrase(sample, phrase) {
  if (!sample || !phrase) return false;

  const normalizedPhrase = normalizeText(phrase).trim();

  if (!normalizedPhrase) return false;

  /**
   * normalizeText pads sample with spaces and punctuation has been spaced out.
   * This gives stable word-boundary behavior without lookbehind compatibility risk.
   */
  return sample.includes(` ${normalizedPhrase} `);
}

function countSignalMatches(sample, signals) {
  if (!sample || !Array.isArray(signals)) return 0;

  let score = 0;
  const matched = [];

  for (const entry of signals) {
    const phrase = Array.isArray(entry) ? entry[0] : entry;
    const weight = Array.isArray(entry) ? Number(entry[1]) || 1 : 1;

    if (!phrase || typeof phrase !== "string") continue;

    if (hasWordOrPhrase(sample, phrase)) {
      score += weight;
      matched.push(phrase);
    }
  }

  return { score, matched };
}

function countOccurrences(sample, char) {
  if (!sample || !char) return 0;
  return sample.split(char).length - 1;
}

function detectAccentBias(sample) {
  const bias = { en: 0, fr: 0, es: 0 };

  for (const [char, weight] of DIACRITIC_BIAS.fr) {
    bias.fr += countOccurrences(sample, char) * weight;
  }

  for (const [char, weight] of DIACRITIC_BIAS.es) {
    bias.es += countOccurrences(sample, char) * weight;
  }

  for (const [char, weight] of DIACRITIC_BIAS.shared) {
    const count = countOccurrences(sample, char);
    bias.fr += count * weight;
    bias.es += count * weight;
  }

  return bias;
}

function getTextStats(sample) {
  const words = sample.trim() ? sample.trim().split(/\s+/).filter(Boolean) : [];
  return {
    length: sample.length,
    wordCount: words.length,
    hasDiacritics: /[àâçéèêëîïôùûüÿœáíóúñ¿¡]/i.test(sample),
    hasCjk: /[\u3040-\u30ff\u3400-\u9fff]/.test(sample),
    hasArabic: /[\u0600-\u06ff]/.test(sample),
    hasCyrillic: /[\u0400-\u04ff]/.test(sample)
  };
}

function calculateConfidence(topScore, secondScore, stats) {
  if (topScore <= 0) return 0;

  const gap = Math.max(0, topScore - secondScore);
  const wordBoost = Math.min(0.12, (stats.wordCount || 0) / 60);
  const scoreBoost = Math.min(0.26, topScore * 0.032);
  const gapBoost = Math.min(0.24, gap * 0.06);
  const diacriticBoost = stats.hasDiacritics ? 0.04 : 0;

  return Number(
    Math.min(0.98, 0.42 + wordBoost + scoreBoost + gapBoost + diacriticBoost).toFixed(3)
  );
}

function resolveDefaultLanguage(options = {}) {
  const normalized = normalizeLanguageCode(options.defaultLanguage || "en");
  return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : "en";
}

function buildUnknownResult(method, scores = DEFAULT_SCORES, extra = {}) {
  return {
    language: "unknown",
    label: LANGUAGE_LABELS.unknown,
    confidence: 0,
    method,
    scores: { ...DEFAULT_SCORES, ...scores },
    ...extra
  };
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
 *   scores: { en, fr, es },
 *   matchedSignals?: { en: string[], fr: string[], es: string[] }
 * }
 */
function detectLanguage(text, options = {}) {
  try {
    const sample = normalizeText(text);

    if (!sample) {
      return buildUnknownResult("empty-input");
    }

    const stats = getTextStats(sample);

    /**
     * This detector only claims EN/FR/ES. For obviously different scripts, do
     * not force English unless the caller explicitly asks for a default.
     */
    if ((stats.hasCjk || stats.hasArabic || stats.hasCyrillic) && options.forceDefault !== true) {
      return buildUnknownResult("unsupported-script", DEFAULT_SCORES, {
        script: stats.hasCjk ? "cjk" : stats.hasArabic ? "arabic" : "cyrillic"
      });
    }

    const enMatches = countSignalMatches(sample, SIGNALS.en);
    const frMatches = countSignalMatches(sample, SIGNALS.fr);
    const esMatches = countSignalMatches(sample, SIGNALS.es);
    const bias = detectAccentBias(sample);

    const scores = {
      en: enMatches.score + bias.en,
      fr: frMatches.score + bias.fr,
      es: esMatches.score + bias.es
    };

    const matchedSignals = {
      en: enMatches.matched,
      fr: frMatches.matched,
      es: esMatches.matched
    };

    const sorted = Object.entries(scores).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

    const [topLang, topScore] = sorted[0];
    const [, secondScore] = sorted[1];

    if (topScore <= 0) {
      const defaultLanguage = resolveDefaultLanguage(options);
      return {
        language: options.defaultToUnknown === true ? "unknown" : defaultLanguage,
        label:
          options.defaultToUnknown === true
            ? LANGUAGE_LABELS.unknown
            : LANGUAGE_LABELS[defaultLanguage],
        confidence: options.defaultToUnknown === true ? 0 : 0.5,
        method: options.defaultToUnknown === true ? "no-signal" : "default-language",
        scores,
        matchedSignals
      };
    }

    const confidence = calculateConfidence(topScore, secondScore, stats);
    const gap = Math.max(0, topScore - secondScore);

    /**
     * French and Spanish share many short particles. If the top score is only
     * one point ahead and there is no accent/strong phrase, classify as low
     * confidence rather than pretending certainty.
     */
    const hasStrongSignal = matchedSignals[topLang].some((signal) => {
      const entry = SIGNALS[topLang].find((item) => item[0] === signal);
      return entry && Number(entry[1]) >= 3;
    });

    const ambiguous =
      gap <= 1 &&
      confidence < 0.68 &&
      stats.wordCount <= 8 &&
      !stats.hasDiacritics &&
      !hasStrongSignal;

    if ((confidence < 0.55 || ambiguous) && options.allowLowConfidence !== true) {
      const defaultLanguage = resolveDefaultLanguage(options);

      return {
        language: options.defaultToUnknown === true ? "unknown" : defaultLanguage,
        label:
          options.defaultToUnknown === true
            ? LANGUAGE_LABELS.unknown
            : LANGUAGE_LABELS[defaultLanguage],
        confidence,
        method: ambiguous ? "ambiguous-low-confidence-default" : "low-confidence-default",
        scores,
        matchedSignals,
        candidateLanguage: topLang
      };
    }

    return {
      language: topLang,
      label: LANGUAGE_LABELS[topLang] || LANGUAGE_LABELS.unknown,
      confidence,
      method: "local-weighted-signal-detector",
      scores,
      matchedSignals
    };
  } catch (error) {
    return buildUnknownResult("detector-error", DEFAULT_SCORES, {
      error: error && error.message ? error.message : "unknown"
    });
  }
}

function detectTargetLanguageFromRequest(text) {
  const sample = normalizeText(text);

  if (!sample) return null;

  for (const item of TARGET_LANGUAGE_PATTERNS) {
    for (const pattern of item.patterns) {
      if (hasWordOrPhrase(sample, pattern)) {
        return item.lang;
      }
    }
  }

  return null;
}

function explainDetection(text, options = {}) {
  const result = detectLanguage(text, {
    ...options,
    allowLowConfidence: true
  });

  return {
    ...result,
    normalizedSample: normalizeText(text).trim(),
    targetLanguageRequest: detectTargetLanguageFromRequest(text),
    projectGateway: detectProjectGatewayFromRequest(text)
  };
}

module.exports = {
  VERSION,
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABELS,
  SIGNALS,
  normalizeText,
  normalizeLanguageCode,
  isSupportedLanguage,
  countSignalMatches,
  detectAccentBias,
  calculateConfidence,
  detectLanguage,
  detectProjectGatewayFromRequest,
  PROJECT_GATEWAY_SIGNALS,
  detectTargetLanguageFromRequest,
  explainDetection
};
