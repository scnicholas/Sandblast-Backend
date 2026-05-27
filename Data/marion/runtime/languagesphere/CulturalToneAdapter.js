"use strict";

/**
 * CulturalToneAdapter
 *
 * Purpose:
 * Adjusts translation tone metadata for English, Spanish, and French
 * without rewriting Marion's final authority.
 *
 * Contract:
 * - Never throws.
 * - Does not invent final answers.
 * - Produces tone metadata only.
 * - Keeps Marion as final authority.
 */

const DEFAULT_CONFIG = {
  defaultTone: "clear_direct",
  supportedLanguages: ["en", "es", "fr"],
  supportedToneModes: [
    "clear_direct",
    "warm_direct",
    "formal_polite",
    "calm_supportive",
    "commercial_precise",
  ],
  languageToneDefaults: {
    en: "clear_direct",
    es: "warm_direct",
    fr: "formal_polite",
  },
};

function normalizeLanguage(value) {
  const language = String(value || "").trim().toLowerCase();

  if (!language) return "en";
  if (language === "eng") return "en";
  if (language === "spa" || language === "es-419") return "es";
  if (language === "fre" || language === "fra") return "fr";
  if (language.includes("-")) return language.split("-")[0];

  return language;
}

function normalizeTone(value, config = DEFAULT_CONFIG) {
  const tone = String(value || "").trim().toLowerCase();

  if (!tone) return config.defaultTone;

  const aliases = {
    warm: "warm_direct",
    friendly: "warm_direct",
    direct: "clear_direct",
    precise: "commercial_precise",
    formal: "formal_polite",
    polite: "formal_polite",
    calm: "calm_supportive",
    supportive: "calm_supportive",
  };

  const normalized = aliases[tone] || tone;

  return config.supportedToneModes.includes(normalized)
    ? normalized
    : config.defaultTone;
}

function inferSourceTone(text) {
  const input = String(text || "").toLowerCase();

  if (/\bplease|thank you|thanks|merci|gracias|por favor|s'il vous plaît\b/i.test(input)) {
    return "formal_polite";
  }

  if (/\bworried|concerned|afraid|anxious|help me|stuck\b/i.test(input)) {
    return "calm_supportive";
  }

  if (/\brevenue|commercial|contract|benchmark|metrics|market\b/i.test(input)) {
    return "commercial_precise";
  }

  return "clear_direct";
}

function adaptTone(payload = {}, options = {}) {
  try {
    const config = {
      ...DEFAULT_CONFIG,
      ...(options.config || payload.config || {}),
    };

    const text = String(
      payload.text ||
        payload.normalizedText ||
        payload.originalText ||
        ""
    );

    const sourceLanguage = normalizeLanguage(
      payload.sourceLanguage ||
        payload.detectedLanguage ||
        payload.language ||
        "en"
    );

    const targetLanguage = normalizeLanguage(
      payload.targetLanguage ||
        payload.responseLanguage ||
        sourceLanguage ||
        "en"
    );

    const sourceTone = normalizeTone(
      payload.sourceTone ||
        payload.tone ||
        inferSourceTone(text),
      config
    );

    const preferredTargetTone =
      payload.targetTone ||
      config.languageToneDefaults[targetLanguage] ||
      config.defaultTone;

    let targetTone = normalizeTone(preferredTargetTone, config);

    if (sourceTone === "commercial_precise") {
      targetTone = "commercial_precise";
    }

    if (sourceTone === "calm_supportive") {
      targetTone = "calm_supportive";
    }

    const adaptationApplied =
      sourceTone !== targetTone ||
      sourceLanguage !== targetLanguage ||
      Boolean(payload.forceAdaptation);

    return {
      ok: true,
      authority: "marion",
      sourceLanguage,
      targetLanguage,
      sourceTone,
      targetTone,
      adaptationApplied,
      toneMode: targetTone,
      text,
      reason: adaptationApplied
        ? "cultural_tone_adapted"
        : "cultural_tone_preserved",
    };
  } catch (_) {
    return {
      ok: false,
      authority: "marion",
      sourceLanguage: "en",
      targetLanguage: "en",
      sourceTone: DEFAULT_CONFIG.defaultTone,
      targetTone: DEFAULT_CONFIG.defaultTone,
      toneMode: DEFAULT_CONFIG.defaultTone,
      adaptationApplied: false,
      text: "",
      reason: "cultural_tone_exception_fallback",
    };
  }
}

function process(payload = {}, options = {}) {
  return adaptTone(payload, options);
}

function apply(payload = {}, options = {}) {
  return adaptTone(payload, options);
}

module.exports = {
  DEFAULT_CONFIG,
  normalizeLanguage,
  normalizeTone,
  inferSourceTone,
  adaptTone,
  process,
  apply,
};
