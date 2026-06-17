"use strict";

/**
 * LingoSentinelTranslationProvider
 * Provider adapter for spontaneous translation.
 *
 * Supports LibreTranslate/Argos-compatible endpoints, generic JSON providers,
 * and NLLB-style provider-code mapping through the language registry.
 * No provider keys are exposed to the browser.
 */

const Registry = require("./LingoSentinelLanguageRegistry");

const VERSION = "2.2.0-spontaneity-provider-adapter";
const DEFAULT_TIMEOUT_MS = 12000;

function safeString(value, fallback = "") { if (typeof value === "string") return value.trim(); if (value === null || value === undefined) return fallback; return String(value).trim(); }
function providerKind(options = {}) { return safeString(options.provider || process.env.LINGOSENTINEL_TRANSLATE_PROVIDER || process.env.LINGOSENTINEL_PROVIDER_KIND || "libretranslate-compatible").toLowerCase(); }
function normalizeEndpoint(value) { const raw = safeString(value).replace(/\/+$/, ""); if (!raw) return ""; return /\/(translate|api\/translate)$/i.test(raw) ? raw : `${raw}/translate`; }
function providerEndpoint(options = {}) { return normalizeEndpoint(options.endpoint || process.env.LINGOSENTINEL_TRANSLATE_URL || process.env.LINGOSENTINEL_PROVIDER_URL || process.env.LIBRETRANSLATE_URL || process.env.ARGOS_TRANSLATE_URL || ""); }
function providerApiKey(options = {}) { return safeString(options.apiKey || process.env.LINGOSENTINEL_TRANSLATE_API_KEY || process.env.LIBRETRANSLATE_API_KEY || ""); }

function createAbortSignal(timeoutMs) {
  if (typeof AbortController === "undefined") return { signal: undefined, clear: () => {} };
  const controller = new AbortController();
  let cleared = false;
  const timer = setTimeout(() => { try { controller.abort(); } catch (_) {} }, timeoutMs || DEFAULT_TIMEOUT_MS);
  return { signal: controller.signal, clear: () => { if (!cleared) { cleared = true; clearTimeout(timer); } } };
}

function pickTranslatedText(json = {}) {
  return safeString(json.translatedText || json.translation || json.targetText || json.translated || json.result || json.output || json.textTranslated || (json.data && (json.data.translatedText || json.data.translation || json.data.targetText || json.data.output)) || (json.message && (json.message.translatedText || json.message.translation)) || "");
}

function buildProviderPayload(input = {}, options = {}) {
  const kind = providerKind(options);
  const source = Registry.getProviderLanguageCode(input.sourceLanguage || "auto", kind);
  const target = Registry.getProviderLanguageCode(input.targetLanguage || "en", kind);
  const text = input.text;
  const instruction = input.instruction || "";
  const apiKey = providerApiKey(options);

  if (kind.includes("nllb")) {
    return { text, inputs: text, sourceLanguage: source, targetLanguage: target, source, target, src_lang: source, tgt_lang: target, context: input.contextSummary || "", instruction };
  }

  if (kind.includes("generic")) {
    const payload = { text, sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage, source, target, context: input.contextSummary || "", instruction };
    if (apiKey) payload.api_key = apiKey;
    return payload;
  }

  const payload = { q: text, source: source === "mixed" || source === "unknown" ? "auto" : source, target, format: "text" };
  if (apiKey) payload.api_key = apiKey;
  return payload;
}

async function translate(input = {}, options = {}) {
  const endpoint = providerEndpoint(options);
  const kind = providerKind(options);
  const text = safeString(input.text);
  const sourceLanguage = Registry.normalizeLanguageCode(input.sourceLanguage || "auto", "auto");
  const targetLanguage = Registry.coerceTargetLanguage(input.targetLanguage || "en");
  const pair = Registry.validateLanguagePair(sourceLanguage, targetLanguage, { provider: kind, allowAutoSource: true });

  if (!text) return { ok: false, provider: "none", error: "empty_text", translatedText: "" };
  if (!pair.target || !Registry.isSupportedLanguage(pair.target)) {
    return { ok: false, provider: kind, error: "unsupported_target_language", text, translatedText: text, sourceLanguage, targetLanguage, fallback: true };
  }
  if (typeof fetch !== "function") {
    return { ok: false, provider: "fetch-unavailable", error: "fetch_unavailable", text, translatedText: text, sourceLanguage, targetLanguage, fallback: true };
  }
  if (!endpoint) {
    return { ok: false, provider: "unconfigured", error: "translation_provider_unconfigured", text, translatedText: text, sourceLanguage, targetLanguage, fallback: true };
  }

  const timeout = createAbortSignal(Number(options.timeoutMs || process.env.LINGOSENTINEL_TRANSLATE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  try {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    const bearer = safeString(options.bearerToken || process.env.LINGOSENTINEL_TRANSLATE_BEARER_TOKEN || "");
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(buildProviderPayload({ ...input, sourceLanguage, targetLanguage }, options)), signal: timeout.signal });
    timeout.clear();
    const bodyText = await response.text();
    let json = {};
    try { json = bodyText ? JSON.parse(bodyText) : {}; } catch (_) { json = {}; }
    if (!response.ok) {
      return { ok: false, provider: kind, error: json.error || json.message || `provider_http_${response.status}`, text, translatedText: text, sourceLanguage, targetLanguage, fallback: true };
    }
    const translatedText = pickTranslatedText(json);
    return {
      ok: Boolean(translatedText && translatedText !== text),
      provider: kind,
      rawProvider: json,
      text,
      translatedText: translatedText || text,
      sourceLanguage: Registry.normalizeLanguageCode(json.sourceLanguage || json.source || sourceLanguage, sourceLanguage),
      detectedLanguage: Registry.normalizeLanguageCode(json.detectedLanguage || json.language || json.sourceLanguage || sourceLanguage, sourceLanguage),
      targetLanguage: Registry.normalizeLanguageCode(json.targetLanguage || json.target || targetLanguage, targetLanguage),
      fallback: !translatedText || translatedText === text,
      providerSource: pair.providerSource,
      providerTarget: pair.providerTarget
    };
  } catch (error) {
    timeout.clear();
    return { ok: false, provider: kind, error: error && error.message ? error.message : "provider_request_failed", text, translatedText: text, sourceLanguage, targetLanguage, fallback: true };
  }
}

function health(options = {}) {
  const endpoint = providerEndpoint(options);
  return { ok: Boolean(endpoint), version: VERSION, provider: providerKind(options), endpointConfigured: Boolean(endpoint), apiKeyConfigured: Boolean(providerApiKey(options)), bearerConfigured: Boolean(process.env.LINGOSENTINEL_TRANSLATE_BEARER_TOKEN), supportedLanguageCount: Registry.getSupportedLanguageCodes().length, diagnosticsRedacted: true };
}

module.exports = { VERSION, translate, health, providerEndpoint, providerKind, buildProviderPayload };
