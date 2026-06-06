"use strict";

/**
 * LingoSentinelResponseEnvelope
 *
 * Standard output contract from LingoSentinel back to Marion.
 *
 * Conflict-resolution note:
 * This file intentionally keeps the response-envelope implementation only.
 * Request-envelope logic belongs in LingoSentinelRequestEnvelope.js.
 */

function normalizeText(value) {
  return String(value || "").trim();
}

function clampConfidence(value, fallback = 0.75) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, number));
}

function createLingoSentinelResponseEnvelope(input = {}) {
  const translatedText = normalizeText(input.translatedText);
  const adaptedText = normalizeText(input.adaptedText);
  const normalizedText = normalizeText(input.normalizedText);
  const finalText = normalizeText(input.finalText || adaptedText || translatedText || normalizedText);

  const warnings = Array.isArray(input.warnings)
    ? input.warnings.filter(Boolean)
    : [];

  if (!finalText) {
    warnings.push("No final text was produced by LingoSentinel.");
  }

  return {
    ok: input.ok !== false && Boolean(finalText),
    gateway: "marion-lingosentinel",
    requestId: input.requestId || null,
    detectedLanguage: input.detectedLanguage || input.sourceLanguage || "auto",
    sourceLanguage: input.sourceLanguage || input.detectedLanguage || "auto",
    targetLanguage: input.targetLanguage || "en",
    mode: input.mode || "translate",
    normalizedText,
    translatedText,
    adaptedText,
    finalText,
    confidence: clampConfidence(input.confidence),
    warnings,
    fallbackUsed: Boolean(input.fallbackUsed),
    requiresMarionReview: true,
    glossaryUsed: Boolean(input.glossaryUsed),
    memoryUsed: Boolean(input.memoryUsed),
    provider: input.provider || "lingosentinel-core",
    metadata: {
      createdAt: new Date().toISOString(),
      ...input.metadata
    }
  };
}

function createLingoSentinelFallbackResponse(input = {}) {
  const originalText = normalizeText(input.originalText || input.text);

  return createLingoSentinelResponseEnvelope({
    ok: false,
    requestId: input.requestId || null,
    detectedLanguage: input.detectedLanguage || input.sourceLanguage || "auto",
    sourceLanguage: input.sourceLanguage || "auto",
    targetLanguage: input.targetLanguage || "en",
    mode: input.mode || "translate",
    normalizedText: originalText,
    translatedText: "",
    adaptedText: "",
    finalText: "",
    confidence: 0,
    fallbackUsed: true,
    warnings: [
      input.reason || "LingoSentinel fallback response created."
    ],
    provider: "lingosentinel-fallback"
  });
}

function validateLingoSentinelResponseEnvelope(envelope = {}) {
  const errors = [];

  if (!envelope || typeof envelope !== "object") {
    errors.push("Response envelope must be an object.");
  }

  if (envelope.ok && !normalizeText(envelope.finalText)) {
    errors.push("Successful response envelope requires finalText.");
  }

  if (typeof envelope.confidence !== "number") {
    errors.push("Confidence must be numeric.");
  }

  if (envelope.requiresMarionReview !== true) {
    errors.push("Response must require Marion review.");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

module.exports = {
  createLingoSentinelResponseEnvelope,
  createLingoSentinelFallbackResponse,
  validateLingoSentinelResponseEnvelope,
  default: createLingoSentinelResponseEnvelope
};
