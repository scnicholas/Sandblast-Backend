'use strict';

/**
 * LingoSentinelTranslationProvider
 * Provider adapter for dynamic/spontaneous translation.
 *
 * Supports LibreTranslate-compatible endpoints and Argos/LibreTranslate style
 * local servers. No API keys are exposed to the browser.
 */

const VERSION = '2.1.0-spontaneous-provider-adapter';
const DEFAULT_TIMEOUT_MS = 12000;

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeEndpoint(value) {
  const raw = safeString(value).replace(/\/+$/, '');
  if (!raw) return '';
  return /\/translate$/i.test(raw) ? raw : `${raw}/translate`;
}

function providerEndpoint(options = {}) {
  return normalizeEndpoint(
    options.endpoint ||
    process.env.LINGOSENTINEL_TRANSLATE_URL ||
    process.env.LINGOSENTINEL_PROVIDER_URL ||
    process.env.LIBRETRANSLATE_URL ||
    process.env.ARGOS_TRANSLATE_URL ||
    ''
  );
}

function providerApiKey(options = {}) {
  return safeString(
    options.apiKey ||
    process.env.LINGOSENTINEL_TRANSLATE_API_KEY ||
    process.env.LIBRETRANSLATE_API_KEY ||
    ''
  );
}

function createAbortSignal(timeoutMs) {
  if (typeof AbortController === 'undefined') return { signal: undefined, clear: () => {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function pickTranslatedText(json = {}) {
  return safeString(
    json.translatedText ||
    json.translation ||
    json.targetText ||
    json.result ||
    (json.data && (json.data.translatedText || json.data.translation)) ||
    ''
  );
}

function buildLibrePayload(input = {}, options = {}) {
  const apiKey = providerApiKey(options);
  const payload = {
    q: input.text,
    source: input.sourceLanguage === 'auto' || input.sourceLanguage === 'mixed' ? 'auto' : input.sourceLanguage,
    target: input.targetLanguage,
    format: 'text'
  };
  if (apiKey) payload.api_key = apiKey;
  return payload;
}

async function translate(input = {}, options = {}) {
  const endpoint = providerEndpoint(options);
  const text = safeString(input.text);
  const sourceLanguage = safeString(input.sourceLanguage || 'auto');
  const targetLanguage = safeString(input.targetLanguage || 'en');

  if (!text) {
    return { ok: false, provider: 'none', error: 'empty_text', translatedText: '' };
  }

  if (!endpoint) {
    return {
      ok: false,
      provider: 'unconfigured',
      error: 'translation_provider_unconfigured',
      text,
      translatedText: text,
      sourceLanguage,
      targetLanguage,
      fallback: true
    };
  }

  const timeout = createAbortSignal(Number(options.timeoutMs || process.env.LINGOSENTINEL_TRANSLATE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);

  try {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildLibrePayload({ text, sourceLanguage, targetLanguage }, options)),
      signal: timeout.signal
    });
    timeout.clear();

    const bodyText = await response.text();
    let json = {};
    try { json = bodyText ? JSON.parse(bodyText) : {}; } catch (_) { json = {}; }

    if (!response.ok) {
      return {
        ok: false,
        provider: 'http',
        error: json.error || json.message || `provider_http_${response.status}`,
        text,
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        fallback: true
      };
    }

    const translatedText = pickTranslatedText(json);
    return {
      ok: Boolean(translatedText),
      provider: 'libretranslate-compatible',
      rawProvider: json,
      text,
      translatedText: translatedText || text,
      sourceLanguage: json.sourceLanguage || json.detectedLanguage || sourceLanguage,
      detectedLanguage: json.detectedLanguage || json.sourceLanguage || sourceLanguage,
      targetLanguage: json.targetLanguage || targetLanguage,
      fallback: !translatedText
    };
  } catch (error) {
    timeout.clear();
    return {
      ok: false,
      provider: 'libretranslate-compatible',
      error: error && error.message ? error.message : 'provider_request_failed',
      text,
      translatedText: text,
      sourceLanguage,
      targetLanguage,
      fallback: true
    };
  }
}

function health(options = {}) {
  return {
    ok: Boolean(providerEndpoint(options)),
    version: VERSION,
    provider: providerEndpoint(options) ? 'libretranslate-compatible' : 'unconfigured',
    endpointConfigured: Boolean(providerEndpoint(options)),
    apiKeyConfigured: Boolean(providerApiKey(options)),
    diagnosticsRedacted: true
  };
}

module.exports = {
  VERSION,
  translate,
  health,
  providerEndpoint
};
