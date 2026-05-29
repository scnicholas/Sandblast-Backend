"use strict";

/**
 * LanguageConfidenceScorer
 *
 * Purpose:
 * Scores LanguageSphere language detection, translation confidence,
 * mixed-language risk, and fallback safety before Marion trusts the layer.
 *
 * Contract:
 * - Never throws.
 * - Defaults safely to English.
 * - Marks low/ambiguous confidence clearly.
 * - Does not override Marion final authority.
 */

const DEFAULT_CONFIG = {
  defaultLanguage: "en",
  supportedLanguages: ["en", "es", "fr"],
  confidenceBands: {
    high: 0.85,
    medium: 0.65,
    low: 0.0,
  },
  mixedLanguagePenalty: 0.2,
  unsupportedLanguagePenalty: 0.35,
  emptyInputPenalty: 0.5,
};

function clampScore(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;

  return n;
}

function normalizeLanguage(value, config = DEFAULT_CONFIG) {
  const language = String(value || "").trim().toLowerCase();

  if (!language) {
    return config.defaultLanguage || "en";
  }

  if (language === "eng") return "en";
  if (language === "spa" || language === "es-419") return "es";
  if (language === "fre" || language === "fra") return "fr";

  if (language.includes("-")) {
    return language.split("-")[0];
  }

  return language;
}

function isSupportedLanguage(language, config = DEFAULT_CONFIG) {
  const normalized = normalizeLanguage(language, config);
  return Array.isArray(config.supportedLanguages)
    ? config.supportedLanguages.includes(normalized)
    : ["en", "es", "fr"].includes(normalized);
}

function getConfidenceBand(score, config = DEFAULT_CONFIG) {
  const confidence = clampScore(score);
  const bands = config.confidenceBands || DEFAULT_CONFIG.confidenceBands;

  if (confidence >= Number(bands.high || 0.85)) return "high";
  if (confidence >= Number(bands.medium || 0.65)) return "medium";

  return "low";
}

function detectMixedLanguageSignal(text) {
  const input = String(text || "").toLowerCase();

  if (!input.trim()) return false;

  const englishHints = /\b(the|and|hello|please|explain|what|how|why|answer)\b/i.test(input);
  const spanishHints = /\b(hola|puedes|explicar|por favor|gracias|respuesta|sistema)\b/i.test(input);
  const frenchHints = /\b(bonjour|peux|expliquer|merci|réponse|système|s'il)\b/i.test(input);

  const matches = [englishHints, spanishHints, frenchHints].filter(Boolean).length;

  return matches >= 2;
}

function scoreLanguageConfidence(payload = {}, options = {}) {
  try {
    const config = {
      ...DEFAULT_CONFIG,
      ...(options.config || payload.config || {}),
    };

    const text = String(
      payload.text ||
        payload.inputText ||
        payload.originalText ||
        ""
    );

    const detectedLanguage = normalizeLanguage(
      payload.detectedLanguage ||
        payload.language ||
        payload.sourceLanguage,
      config
    );

    const targetLanguage = normalizeLanguage(
      payload.targetLanguage ||
        payload.responseLanguage ||
        config.defaultLanguage,
      config
    );

    const baseConfidence =
      typeof payload.confidence === "number"
        ? payload.confidence
        : typeof payload.languageConfidence === "number"
          ? payload.languageConfidence
          : detectedLanguage
            ? 0.75
            : 0.45;

    let score = clampScore(baseConfidence);

    const mixedLanguage =
      Boolean(payload.mixedLanguage || payload.isMixedLanguage) ||
      detectMixedLanguageSignal(text);

    const supported = isSupportedLanguage(detectedLanguage, config);

    if (!text.trim()) {
      score -= Number(config.emptyInputPenalty || 0.5);
    }

    if (mixedLanguage) {
      score -= Number(config.mixedLanguagePenalty || 0.2);
    }

    if (!supported) {
      score -= Number(config.unsupportedLanguagePenalty || 0.35);
    }

    score = clampScore(score);

    const confidenceBand = getConfidenceBand(score, config);
    const fallbackUsed =
      !supported ||
      !text.trim() ||
      confidenceBand === "low" ||
      Boolean(payload.forceFallback);

    return {
      ok: true,
      authority: "marion",
      detectedLanguage: supported ? detectedLanguage : config.defaultLanguage,
      originalDetectedLanguage: detectedLanguage,
      targetLanguage,
      supportedLanguage: supported,
      mixedLanguage,
      confidence: score,
      confidenceBand,
      fallbackUsed,
      fallbackLanguage: fallbackUsed ? config.defaultLanguage : null,
      reason: fallbackUsed
        ? "language_confidence_fallback"
        : "language_confidence_accepted",
    };
  } catch (error) {
    return {
      ok: false,
      authority: "marion",
      detectedLanguage: DEFAULT_CONFIG.defaultLanguage,
      targetLanguage: DEFAULT_CONFIG.defaultLanguage,
      supportedLanguage: true,
      mixedLanguage: false,
      confidence: 0,
      confidenceBand: "low",
      fallbackUsed: true,
      fallbackLanguage: DEFAULT_CONFIG.defaultLanguage,
      reason: "language_confidence_exception",
    };
  }
}

function score(payload = {}, options = {}) {
  return scoreLanguageConfidence(payload, options);
}

function process(payload = {}, options = {}) {
  return scoreLanguageConfidence(payload, options);
}

module.exports = {
  DEFAULT_CONFIG,
  clampScore,
  normalizeLanguage,
  isSupportedLanguage,
  getConfidenceBand,
  detectMixedLanguageSignal,
  scoreLanguageConfidence,
  score,
  process,
};