"use strict";

/**
 * LingoSentinelNormalizer
 *
 * Purpose:
 * Safe text normalization gateway for Marion/LingoSentinel.
 *
 * Scope:
 * - Preserves original input.
 * - Produces normalized input.
 * - Does not translate.
 * - Does not remove meaningful accents.
 * - Does not override Marion authority.
 */

function safeString(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return String(value);
  } catch (_) {
    return "";
  }
}

function normalizeSmartQuotes(text) {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function normalizeWhitespace(text) {
  return text
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function normalizePunctuationSpacing(text) {
  return text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([¿¡])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .replace(/([([{])\s+/g, "$1");
}

function trimText(text) {
  return text.trim();
}

function normalizeInput(input, options = {}) {
  const originalText = safeString(input);
  let normalizedText = originalText;
  const operations = [];

  const preserveLineBreaks = options.preserveLineBreaks !== false;

  const trimmed = trimText(normalizedText);
  if (trimmed !== normalizedText) {
    normalizedText = trimmed;
    operations.push("trim");
  }

  const smartQuoteNormalized = normalizeSmartQuotes(normalizedText);
  if (smartQuoteNormalized !== normalizedText) {
    normalizedText = smartQuoteNormalized;
    operations.push("smart_quotes");
  }

  const whitespaceNormalized = normalizeWhitespace(normalizedText);
  if (whitespaceNormalized !== normalizedText) {
    normalizedText = whitespaceNormalized;
    operations.push("collapse_spaces");
  }

  const punctuationNormalized = normalizePunctuationSpacing(normalizedText);
  if (punctuationNormalized !== normalizedText) {
    normalizedText = punctuationNormalized;
    operations.push("punctuation_spacing");
  }

  if (!preserveLineBreaks) {
    const singleLine = normalizedText.replace(/\s*\n+\s*/g, " ");
    if (singleLine !== normalizedText) {
      normalizedText = singleLine;
      operations.push("single_line");
    }
  }

  return {
    originalText,
    normalizedText,
    changed: originalText !== normalizedText,
    operations,
    length: {
      original: originalText.length,
      normalized: normalizedText.length
    },
    source: "LingoSentinelNormalizer"
  };
}

module.exports = {
  normalizeInput,
  normalizeSmartQuotes,
  normalizeWhitespace,
  normalizePunctuationSpacing,
  trimText
};
