"use strict";

/**
 * UniversalTranslatorAdapter.js
 * Marion/Nyx Universal Translator Adapter
 *
 * Purpose:
 * - Adds a controlled translation layer without compromising Marion's final-envelope authority.
 * - Supports English, French, and Spanish first.
 * - Protects Sandblast/Nyx/Marion/Synapse brand terms.
 * - Provides translation metadata for downstream telemetry.
 *
 * Important:
 * - This file does NOT depend on paid APIs.
 * - This file does NOT mutate core Marion response objects unless explicitly requested.
 * - External engines can be added later behind the translateText() provider boundary.
 */

const path = require("path");

let CONFIG = null;
let GLOSSARY = null;

const DEFAULT_SUPPORTED_LANGUAGES = ["en", "fr", "es"];

function safeRequire(relativePath, fallback) {
  try {
    return require(relativePath);
  } catch (_) {
    return fallback;
  }
}

function loadConfig() {
  if (CONFIG) return CONFIG;

  CONFIG = safeRequire("./translationConfig.json", {
    version: "0.1.0",
    enabled: true,
    defaultSourceLanguage: "auto",
    defaultTargetLanguage: "en",
    supportedLanguages: DEFAULT_SUPPORTED_LANGUAGES,
    provider: {
      active: "none",
      fallback: "identity"
    },
    behavior: {
      preserveFinalEnvelope: true,
      translateFinalOnly: true,
      allowInputNormalization: true,
      attachTranslationMeta: true,
      failClosedToOriginal: true
    }
  });

  return CONFIG;
}

function loadGlossary() {
  if (GLOSSARY) return GLOSSARY;

  GLOSSARY = safeRequire("./TranslationGlossary.js", {
    protectText: (text) => ({ text, tokens: [] }),
    restoreText: (text) => text,
    getProtectedTerms: () => []
  });

  return GLOSSARY;
}

function normalizeLanguageCode(lang) {
  if (!lang || typeof lang !== "string") return "auto";

  const value = lang.trim().toLowerCase();

  if (value.startsWith("en")) return "en";
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("es")) return "es";

  return value || "auto";
}

function isSupportedLanguage(lang) {
  const config = loadConfig();
  const normalized = normalizeLanguageCode(lang);

  return Array.isArray(config.supportedLanguages)
    ? config.supportedLanguages.includes(normalized)
    : DEFAULT_SUPPORTED_LANGUAGES.includes(normalized);
}

/**
 * Lightweight language detector.
 * This is intentionally simple for Phase 1.
 * Later we can replace this with a stronger local detector.
 */
function detectLanguage(text) {
  if (!text || typeof text !== "string") {
    return {
      language: "unknown",
      confidence: 0,
      method: "empty-input"
    };
  }

  const sample = text.toLowerCase();

  const frenchSignals = [
    " le ", " la ", " les ", " des ", " une ", " un ",
    "bonjour", "merci", "comment", "pourquoi", "avec", "dans",
    "être", "suis", "vous", "nous", "est-ce", "ça", "français"
  ];

  const spanishSignals = [
    " el ", " la ", " los ", " las ", " una ", " un ",
    "hola", "gracias", "cómo", "porque", "para", "con",
    "estoy", "usted", "nosotros", "qué", "español"
  ];

  let frScore = 0;
  let esScore = 0;

  for (const token of frenchSignals) {
    if (sample.includes(token)) frScore += 1;
  }

  for (const token of spanishSignals) {
    if (sample.includes(token)) esScore += 1;
  }

  if (frScore > esScore && frScore > 0) {
    return {
      language: "fr",
      confidence: Math.min(0.95, 0.45 + frScore * 0.08),
      method: "signal-match"
    };
  }

  if (esScore > frScore && esScore > 0) {
    return {
      language: "es",
      confidence: Math.min(0.95, 0.45 + esScore * 0.08),
      method: "signal-match"
    };
  }

  return {
    language: "en",
    confidence: 0.62,
    method: "default-en"
  };
}

function shouldTranslate(sourceLanguage, targetLanguage) {
  const source = normalizeLanguageCode(sourceLanguage);
  const target = normalizeLanguageCode(targetLanguage);

  if (!target || target === "auto") return false;
  if (source === target) return false;
  if (!isSupportedLanguage(target)) return false;
  if (source !== "unknown" && source !== "auto" && !isSupportedLanguage(source)) return false;

  return true;
}

/**
 * Provider boundary.
 *
 * Phase 1:
 * - identity provider only.
 *
 * Phase 2:
 * - connect local LibreTranslate/Argos/OpenNMT/HuggingFace model server.
 *
 * Phase 3:
 * - add OPUS/Tatoeba/HuggingFace-backed validation and translation memory.
 */
async function translateText(text, options = {}) {
  const config = loadConfig();
  const glossary = loadGlossary();

  const sourceLanguage =
    normalizeLanguageCode(options.sourceLanguage) === "auto"
      ? detectLanguage(text).language
      : normalizeLanguageCode(options.sourceLanguage);

  const targetLanguage = normalizeLanguageCode(
    options.targetLanguage || config.defaultTargetLanguage || "en"
  );

  const meta = {
    translated: false,
    provider: config.provider && config.provider.active ? config.provider.active : "none",
    sourceLanguage,
    targetLanguage,
    protectedTermsApplied: 0,
    warning: null
  };

  if (!text || typeof text !== "string") {
    return {
      text,
      meta: {
        ...meta,
        warning: "empty-or-invalid-text"
      }
    };
  }

  if (!shouldTranslate(sourceLanguage, targetLanguage)) {
    return {
      text,
      meta
    };
  }

  const protectedPayload = glossary.protectText(text);
  const protectedText = protectedPayload.text;
  const protectedTermsApplied = Array.isArray(protectedPayload.tokens)
    ? protectedPayload.tokens.length
    : 0;

  meta.protectedTermsApplied = protectedTermsApplied;

  try {
    /**
     * Identity fallback:
     * This keeps the pipeline stable before we connect a real local engine.
     */
    if (!config.provider || config.provider.active === "none") {
      return {
        text,
        meta: {
          ...meta,
          translated: false,
          warning: "no-provider-configured"
        }
      };
    }

    /**
     * Placeholder for future provider routing.
     * Example:
     * if (config.provider.active === "localLibreTranslate") { ... }
     * if (config.provider.active === "argos") { ... }
     * if (config.provider.active === "localNmt") { ... }
     */

    const restored = glossary.restoreText(protectedText);

    return {
      text: restored,
      meta: {
        ...meta,
        translated: false,
        warning: "provider-not-implemented"
      }
    };
  } catch (error) {
    if (config.behavior && config.behavior.failClosedToOriginal) {
      return {
        text,
        meta: {
          ...meta,
          translated: false,
          warning: `translation-failed:${error && error.message ? error.message : "unknown"}`
        }
      };
    }

    throw error;
  }
}

function extractFinalText(envelopeOrText) {
  if (typeof envelopeOrText === "string") {
    return {
      text: envelopeOrText,
      mode: "string"
    };
  }

  if (!envelopeOrText || typeof envelopeOrText !== "object") {
    return {
      text: "",
      mode: "invalid"
    };
  }

  const candidates = [
    "final",
    "reply",
    "answer",
    "message",
    "text",
    "content"
  ];

  for (const key of candidates) {
    if (typeof envelopeOrText[key] === "string" && envelopeOrText[key].trim()) {
      return {
        text: envelopeOrText[key],
        mode: key
      };
    }
  }

  if (
    envelopeOrText.finalEnvelope &&
    typeof envelopeOrText.finalEnvelope === "object"
  ) {
    for (const key of candidates) {
      if (
        typeof envelopeOrText.finalEnvelope[key] === "string" &&
        envelopeOrText.finalEnvelope[key].trim()
      ) {
        return {
          text: envelopeOrText.finalEnvelope[key],
          mode: `finalEnvelope.${key}`
        };
      }
    }
  }

  return {
    text: "",
    mode: "not-found"
  };
}

function writeFinalText(envelopeOrText, translatedText, mode) {
  if (typeof envelopeOrText === "string") {
    return translatedText;
  }

  if (!envelopeOrText || typeof envelopeOrText !== "object") {
    return envelopeOrText;
  }

  const clone = Array.isArray(envelopeOrText)
    ? envelopeOrText.slice()
    : { ...envelopeOrText };

  if (mode && mode.startsWith("finalEnvelope.")) {
    const childKey = mode.replace("finalEnvelope.", "");
    clone.finalEnvelope = {
      ...(clone.finalEnvelope || {}),
      [childKey]: translatedText
    };
    return clone;
  }

  if (mode && mode !== "not-found" && mode !== "invalid") {
    clone[mode] = translatedText;
  }

  return clone;
}

/**
 * Main adapter for Marion final responses.
 *
 * Usage:
 * const translatedEnvelope = await applyUniversalTranslation(finalEnvelope, {
 *   targetLanguage: "fr",
 *   sourceLanguage: "en"
 * });
 */
async function applyUniversalTranslation(envelopeOrText, options = {}) {
  const config = loadConfig();

  if (!config.enabled) {
    return envelopeOrText;
  }

  const extracted = extractFinalText(envelopeOrText);

  if (!extracted.text) {
    return envelopeOrText;
  }

  const result = await translateText(extracted.text, {
    sourceLanguage: options.sourceLanguage || "auto",
    targetLanguage: options.targetLanguage || config.defaultTargetLanguage || "en",
    context: options.context || null,
    emotion: options.emotion || null,
    domain: options.domain || null
  });

  const output = writeFinalText(envelopeOrText, result.text, extracted.mode);

  if (
    output &&
    typeof output === "object" &&
    config.behavior &&
    config.behavior.attachTranslationMeta
  ) {
    output.translationMeta = {
      ...(output.translationMeta || {}),
      ...result.meta,
      adapterVersion: config.version || "0.1.0",
      finalTextSlot: extracted.mode,
      domain: options.domain || null,
      emotion: options.emotion || null
    };
  }

  return output;
}

/**
 * Input-side preparation.
 * This lets Marion understand French/Spanish prompts while preserving original text.
 */
async function normalizeInputForMarion(userText, options = {}) {
  const config = loadConfig();

  const detected = detectLanguage(userText);

  const payload = {
    originalText: userText,
    normalizedText: userText,
    detectedLanguage: detected.language,
    detectionConfidence: detected.confidence,
    translatedForRouting: false,
    translationMeta: null
  };

  if (
    !config.behavior ||
    config.behavior.allowInputNormalization !== true ||
    detected.language === "en" ||
    detected.language === "unknown"
  ) {
    return payload;
  }

  const result = await translateText(userText, {
    sourceLanguage: detected.language,
    targetLanguage: "en",
    context: options.context || "input-normalization"
  });

  payload.normalizedText = result.text;
  payload.translatedForRouting = result.meta.translated === true;
  payload.translationMeta = result.meta;

  return payload;
}

module.exports = {
  VERSION: "0.1.0",
  detectLanguage,
  normalizeLanguageCode,
  isSupportedLanguage,
  shouldTranslate,
  translateText,
  applyUniversalTranslation,
  normalizeInputForMarion,
  extractFinalText
};
