"use strict";

/**
 * ArgosTranslationAdapter
 * Layers 11-12 adapter contract backed by the canonical
 * LingoSentinelTranslationProvider boundary.
 */

const Provider = require("./LingoSentinelTranslationProvider");

const VERSION = "nyx.lingosentinel.argosTranslationAdapter/12.1-provider-consolidated";
const DEFAULT_TIMEOUT_MS = Math.max(
  1000,
  Math.min(
    30000,
    Number(
      process.env.LINGOSENTINEL_TRANSLATION_TIMEOUT_MS ||
      process.env.LINGOSENTINEL_TRANSLATE_TIMEOUT_MS
    ) || 10000
  )
);

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function confidence(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function adapterError(providerError) {
  switch (providerError) {
    case "translation_provider_unconfigured": return "ARGOS_NOT_CONFIGURED";
    case "fetch_unavailable": return "FETCH_UNAVAILABLE";
    case "provider_timeout": return "ARGOS_TIMEOUT";
    case "empty_text": return "TRANSLATION_TEXT_REQUIRED";
    default: return "ARGOS_TRANSLATION_FAILED";
  }
}

function normalizeResult(result, source, target, text) {
  const ok = Boolean(result && result.ok);
  const translatedText = clean(result && result.translatedText) || text;
  return {
    ok,
    translatedText,
    source: clean(result && result.sourceLanguage) || source,
    target: clean(result && result.targetLanguage) || target,
    sourceLanguage: clean(result && result.sourceLanguage) || source,
    targetLanguage: clean(result && result.targetLanguage) || target,
    detectedLanguage: clean(result && result.detectedLanguage) || source,
    confidence: confidence(result && result.confidence, ok ? 0.8 : 0),
    provider: clean(result && result.provider) || "argos-compatible",
    fallback: Boolean(result && result.fallback),
    stage: clean(result && result.stage) || (ok ? "provider_translation" : "provider_fallback"),
    error: ok ? undefined : adapterError(result && result.error),
    providerError: ok ? undefined : clean(result && result.error) || "provider_request_failed"
  };
}

async function translate(input = {}, options = {}) {
  const source = clean(input.sourceLanguage || input.source || "en").toLowerCase();
  const target = clean(input.targetLanguage || input.target).toLowerCase();
  const text = String(input.text == null ? "" : input.text);

  if (!text.trim()) {
    return {
      ok: false,
      error: "TRANSLATION_TEXT_REQUIRED",
      translatedText: "",
      source,
      target,
      sourceLanguage: source,
      targetLanguage: target,
      confidence: 0,
      provider: "none",
      fallback: true
    };
  }

  if (!target) {
    return {
      ok: false,
      error: "TRANSLATION_TARGET_REQUIRED",
      translatedText: text,
      source,
      target,
      sourceLanguage: source,
      targetLanguage: target,
      confidence: 0,
      provider: "none",
      fallback: true
    };
  }

  if (source === target) {
    return {
      ok: true,
      translatedText: text,
      source,
      target,
      sourceLanguage: source,
      targetLanguage: target,
      detectedLanguage: source,
      confidence: 1,
      provider: "same-language-bypass",
      stage: "same_language_bypass",
      fallback: false
    };
  }

  if (typeof options.translateFn === "function") {
    try {
      const injected = await options.translateFn({
        text,
        source,
        target,
        sourceLanguage: source,
        targetLanguage: target,
        locale: input.locale,
        formality: input.formality,
        context: input.context,
        contextSummary: input.contextSummary,
        instruction: input.instruction
      });
      return normalizeResult(injected, source, target, text);
    } catch (_) {
      return normalizeResult({
        ok: false,
        error: "provider_request_failed",
        translatedText: text,
        provider: "injected-provider",
        fallback: true
      }, source, target, text);
    }
  }

  const result = await Provider.translate({
    ...input,
    text,
    sourceLanguage: source,
    targetLanguage: target,
    contextSummary: input.contextSummary || input.context || ""
  }, {
    endpoint: options.endpoint,
    provider: options.provider,
    apiKey: options.apiKey,
    bearerToken: options.bearerToken,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    fetchFn: options.fetchFn
  });

  return normalizeResult(result, source, target, text);
}

function getHealth(options = {}) {
  const providerHealth = typeof Provider.getHealth === "function"
    ? Provider.getHealth(options)
    : typeof Provider.health === "function"
      ? Provider.health(options)
      : { ok: false, status: "degraded" };

  return {
    ok: Boolean(providerHealth && providerHealth.ok),
    service: "ArgosTranslationAdapter",
    version: VERSION,
    status: providerHealth && providerHealth.ok ? "ready" : "degraded",
    configured: Boolean(providerHealth && providerHealth.endpointConfigured),
    provider: clean(providerHealth && providerHealth.provider) || "argos-compatible",
    providerEndpointExposed: false,
    apiKeyConfigured: Boolean(providerHealth && providerHealth.apiKeyConfigured),
    bearerConfigured: Boolean(providerHealth && providerHealth.bearerConfigured),
    supportedLanguageCount: Number(providerHealth && providerHealth.supportedLanguageCount) || 0,
    timeoutMs: Number(providerHealth && providerHealth.timeoutMs) || DEFAULT_TIMEOUT_MS,
    diagnosticsRedacted: true
  };
}

function isConfigured(options = {}) {
  if (typeof Provider.isConfigured === "function") {
    return Boolean(Provider.isConfigured(options));
  }
  return Boolean(getHealth(options).configured);
}

module.exports = Object.freeze({
  VERSION,
  translate,
  getHealth,
  isConfigured
});
