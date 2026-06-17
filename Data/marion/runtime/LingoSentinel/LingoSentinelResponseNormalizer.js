"use strict";

/**
 * LingoSentinelResponseNormalizer
 * Forces every provider/backend result into one browser-safe response shape.
 */

const VERSION = "2.2.0-spontaneity-response-normalizer";

function safeString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}
function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function pickText(...values) { for (const value of values) { const text = safeString(value).trim(); if (text) return text; } return ""; }
function normalizeLang(value, fallback = "") { return pickText(value, fallback).toLowerCase().replace(/_/g, "-").split("-")[0] || fallback; }

function normalizeTranslationResponse(raw = {}, fallback = {}) {
  const response = safeObject(raw);
  const message = safeObject(response.message);
  const payload = safeObject(response.payload);
  const data = safeObject(response.data);
  const rawProvider = safeObject(response.rawProvider);

  const originalText = pickText(fallback.text, fallback.originalText, response.text, response.originalText, message.originalText, payload.originalText, data.originalText, rawProvider.text);
  const translatedText = pickText(
    response.translatedText, response.translation, response.targetText, response.translated, response.result,
    message.translatedText, message.translation, message.targetText,
    payload.translatedText, payload.translation, payload.targetText,
    data.translatedText, data.translation, data.targetText,
    rawProvider.translatedText, rawProvider.translation, rawProvider.targetText,
    fallback.translatedText,
    originalText
  );

  const sourceLanguage = normalizeLang(pickText(response.sourceLanguage, response.source, response.detectedLanguage, message.sourceLanguage, payload.sourceLanguage, data.sourceLanguage, fallback.sourceLanguage, "auto"), "auto");
  const targetLanguage = normalizeLang(pickText(response.targetLanguage, response.target, message.targetLanguage, payload.targetLanguage, data.targetLanguage, fallback.targetLanguage, "en"), "en");
  const detectedLanguage = normalizeLang(pickText(response.detectedLanguage, response.language, message.detectedLanguage, payload.detectedLanguage, data.detectedLanguage, fallback.detectedLanguage, sourceLanguage), sourceLanguage);
  const provider = pickText(response.provider, payload.provider, data.provider, fallback.provider, "unknown");
  const fallbackFlag = response.fallback === true || fallback.fallback === true;
  const echoFallback = fallbackFlag && originalText && translatedText && originalText === translatedText && sourceLanguage !== "auto" && sourceLanguage !== "mixed" && sourceLanguage !== targetLanguage;
  const ok = response.ok !== false && Boolean(translatedText) && !echoFallback;

  return {
    ok,
    text: originalText,
    originalText,
    translatedText,
    sourceLanguage,
    detectedLanguage,
    targetLanguage,
    provider,
    fallback: fallbackFlag || echoFallback,
    confidence: Number(response.confidence || fallback.confidence || 0) || 0,
    tone: safeObject(fallback.tone),
    contextUsed: Boolean(fallback.contextUsed),
    error: ok ? "" : pickText(response.error, response.message, fallback.error, echoFallback ? "provider_echo_fallback" : "translation_unavailable"),
    diagnosticsRedacted: true,
    version: VERSION
  };
}

function normalizeError(error, fallback = {}) {
  return normalizeTranslationResponse({ ok: false, fallback: true, error: error && error.message ? error.message : "translation_failed" }, fallback);
}

module.exports = { VERSION, normalizeTranslationResponse, normalizeError };
