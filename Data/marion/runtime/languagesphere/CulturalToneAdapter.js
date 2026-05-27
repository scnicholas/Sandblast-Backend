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
 *
 * Critical fixes:
 * - Null-safe payload/options handling.
 * - Commercial/business intent outranks target-language politeness defaults.
 * - Supportive/emotional intent outranks target-language defaults when present.
 * - Explicit targetTone is respected unless forceIntentPriority is enabled.
 * - Config arrays/maps are normalized defensively.
 */

const DEFAULT_CONFIG = Object.freeze({
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
  intentPriority: {
    commercial: true,
    supportive: true,
  },
  forceIntentPriority: false,
});

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function buildConfig(payload = {}, options = {}) {
  const safePayload = asObject(payload);
  const safeOptions = asObject(options);
  const optionConfig = asObject(safeOptions.config);
  const payloadConfig = asObject(safePayload.config);

  const merged = {
    ...DEFAULT_CONFIG,
    ...payloadConfig,
    ...optionConfig,
    languageToneDefaults: {
      ...DEFAULT_CONFIG.languageToneDefaults,
      ...asObject(payloadConfig.languageToneDefaults),
      ...asObject(optionConfig.languageToneDefaults),
    },
    intentPriority: {
      ...DEFAULT_CONFIG.intentPriority,
      ...asObject(payloadConfig.intentPriority),
      ...asObject(optionConfig.intentPriority),
    },
  };

  if (!Array.isArray(merged.supportedLanguages)) {
    merged.supportedLanguages = DEFAULT_CONFIG.supportedLanguages.slice();
  }

  if (!Array.isArray(merged.supportedToneModes)) {
    merged.supportedToneModes = DEFAULT_CONFIG.supportedToneModes.slice();
  }

  if (!merged.defaultTone || !merged.supportedToneModes.includes(merged.defaultTone)) {
    merged.defaultTone = DEFAULT_CONFIG.defaultTone;
  }

  return merged;
}

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
  const safeConfig = buildConfig({ config });
  const tone = String(value || "").trim().toLowerCase();

  if (!tone) return safeConfig.defaultTone;

  const aliases = {
    warm: "warm_direct",
    friendly: "warm_direct",
    conversational: "warm_direct",
    direct: "clear_direct",
    clear: "clear_direct",
    precise: "commercial_precise",
    commercial: "commercial_precise",
    business: "commercial_precise",
    formal: "formal_polite",
    polite: "formal_polite",
    professional: "formal_polite",
    calm: "calm_supportive",
    supportive: "calm_supportive",
    empathetic: "calm_supportive",
  };

  const normalized = aliases[tone] || tone;

  return safeConfig.supportedToneModes.includes(normalized)
    ? normalized
    : safeConfig.defaultTone;
}

function hasCommercialSignal(text) {
  return /\b(revenue|commercial|contract|contracts|benchmark|benchmarks|metric|metrics|market|licensing|license|pilot|readiness|customer|customers|sales|business|enterprise|monetize|monetization|valuation|cash\s*flow|roi)\b/i.test(
    String(text || "")
  );
}

function hasSupportiveSignal(text) {
  return /\b(worried|concerned|afraid|anxious|anxiety|help me|stuck|overwhelmed|confused|frustrated|stress|stressed|uncertain|lost)\b/i.test(
    String(text || "")
  );
}

function hasPoliteSignal(text) {
  return /\b(please|thank you|thanks|merci|gracias|por favor|s'il vous plaît|svp)\b/i.test(
    String(text || "")
  );
}

function inferSourceTone(text) {
  const input = String(text || "");

  // Intent-bearing signals must be checked before general politeness.
  if (hasCommercialSignal(input)) {
    return "commercial_precise";
  }

  if (hasSupportiveSignal(input)) {
    return "calm_supportive";
  }

  if (hasPoliteSignal(input)) {
    return "formal_polite";
  }

  return "clear_direct";
}

function shouldApplyIntentPriority(payload, config) {
  const safePayload = asObject(payload);

  // If targetTone is explicit, respect it by default. The caller can opt into
  // intent priority with forceIntentPriority when Marion needs strict intent lock.
  if (safePayload.targetTone && !safePayload.forceIntentPriority) {
    return Boolean(config.forceIntentPriority);
  }

  return true;
}

function adaptTone(payload = {}, options = {}) {
  try {
    const safePayload = asObject(payload);
    const config = buildConfig(safePayload, options);

    const text = String(
      safePayload.text ||
        safePayload.normalizedText ||
        safePayload.originalText ||
        safePayload.inputText ||
        ""
    );

    const sourceLanguage = normalizeLanguage(
      safePayload.sourceLanguage ||
        safePayload.detectedLanguage ||
        safePayload.language ||
        "en"
    );

    const targetLanguage = normalizeLanguage(
      safePayload.targetLanguage ||
        safePayload.responseLanguage ||
        sourceLanguage ||
        "en"
    );

    const sourceTone = normalizeTone(
      safePayload.sourceTone ||
        safePayload.tone ||
        inferSourceTone(text),
      config
    );

    const preferredTargetTone =
      safePayload.targetTone ||
      config.languageToneDefaults[targetLanguage] ||
      config.defaultTone;

    let targetTone = normalizeTone(preferredTargetTone, config);

    const commercialSignal = hasCommercialSignal(text);
    const supportiveSignal = hasSupportiveSignal(text);
    const applyIntentPriority = shouldApplyIntentPriority(safePayload, config);

    if (
      applyIntentPriority &&
      config.intentPriority.commercial !== false &&
      (commercialSignal || sourceTone === "commercial_precise")
    ) {
      targetTone = "commercial_precise";
    } else if (
      applyIntentPriority &&
      config.intentPriority.supportive !== false &&
      (supportiveSignal || sourceTone === "calm_supportive")
    ) {
      targetTone = "calm_supportive";
    }

    const adaptationApplied =
      sourceTone !== targetTone ||
      sourceLanguage !== targetLanguage ||
      Boolean(safePayload.forceAdaptation);

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
      signals: {
        commercial: commercialSignal,
        supportive: supportiveSignal,
        polite: hasPoliteSignal(text),
      },
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
      signals: {
        commercial: false,
        supportive: false,
        polite: false,
      },
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
  buildConfig,
  normalizeLanguage,
  normalizeTone,
  hasCommercialSignal,
  hasSupportiveSignal,
  hasPoliteSignal,
  inferSourceTone,
  adaptTone,
  process,
  apply,
};
