'use strict';

/**
 * LingoSentinelResponseNormalizer
 * Forces every provider/backend result into one browser-safe response shape.
 */

const VERSION = '2.1.0-spontaneous-response-normalizer';

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function pickText(...values) {
  for (const value of values) {
    const text = safeString(value).trim();
    if (text) return text;
  }
  return '';
}

function normalizeTranslationResponse(raw = {}, fallback = {}) {
  const response = safeObject(raw);
  const message = safeObject(response.message);
  const payload = safeObject(response.payload);
  const data = safeObject(response.data);

  const originalText = pickText(
    fallback.text,
    response.text,
    response.originalText,
    message.originalText,
    payload.originalText,
    data.originalText
  );

  const translatedText = pickText(
    response.translatedText,
    response.translation,
    response.targetText,
    response.translated,
    response.result,
    message.translatedText,
    message.translation,
    message.targetText,
    payload.translatedText,
    payload.translation,
    payload.targetText,
    data.translatedText,
    data.translation,
    data.targetText,
    fallback.translatedText,
    originalText
  );

  const sourceLanguage = pickText(
    response.sourceLanguage,
    response.source,
    response.detectedLanguage,
    message.sourceLanguage,
    payload.sourceLanguage,
    data.sourceLanguage,
    fallback.sourceLanguage,
    'auto'
  );

  const targetLanguage = pickText(
    response.targetLanguage,
    response.target,
    message.targetLanguage,
    payload.targetLanguage,
    data.targetLanguage,
    fallback.targetLanguage,
    'en'
  );

  const detectedLanguage = pickText(
    response.detectedLanguage,
    response.language,
    message.detectedLanguage,
    payload.detectedLanguage,
    fallback.detectedLanguage,
    sourceLanguage
  );

  const provider = pickText(response.provider, payload.provider, data.provider, fallback.provider, 'unknown');
  const ok = response.ok !== false && Boolean(translatedText);

  return {
    ok,
    text: originalText,
    originalText,
    translatedText,
    sourceLanguage,
    detectedLanguage,
    targetLanguage,
    provider,
    fallback: response.fallback === true || fallback.fallback === true,
    confidence: Number(response.confidence || fallback.confidence || 0) || 0,
    tone: safeObject(fallback.tone),
    contextUsed: Boolean(fallback.contextUsed),
    error: ok ? '' : pickText(response.error, response.message, fallback.error, 'translation_unavailable'),
    diagnosticsRedacted: true,
    version: VERSION
  };
}

function normalizeError(error, fallback = {}) {
  return normalizeTranslationResponse({
    ok: false,
    fallback: true,
    error: error && error.message ? error.message : 'translation_failed'
  }, fallback);
}

module.exports = {
  VERSION,
  normalizeTranslationResponse,
  normalizeError
};
