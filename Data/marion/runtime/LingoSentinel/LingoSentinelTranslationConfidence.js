"use strict";

/**
 * Data/marion/runtime/LingoSentinel/LingoSentinelTranslationConfidence.js
 *
 * Confidence/fallback logic for governed translation delivery.
 */

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function getFailClosed() {
  return parseBoolean(process.env.TRANSLATION_FAIL_CLOSED, true);
}

function evaluateTranslationConfidence(input = {}) {
  const warnings = Array.isArray(input.warnings) ? [...input.warnings] : [];
  const originalText = String(input.originalText || "");
  const translatedText = String(input.translatedText || "");
  const source = String(input.source || "").toLowerCase();
  const target = String(input.target || "").toLowerCase();

  let score = 0.78;
  let level = "high";
  let deliver = true;
  let fallbackRequired = false;

  if (!input.ok) {
    score = 0;
    level = "unavailable";
    deliver = false;
    fallbackRequired = getFailClosed();
    warnings.push(input.error || "TRANSLATION_PROVIDER_UNAVAILABLE");
  }

  if (input.ok && !translatedText.trim()) {
    score = 0;
    level = "low";
    deliver = false;
    fallbackRequired = true;
    warnings.push("EMPTY_TRANSLATION_RESULT");
  }

  if (input.ok && source && target && source !== target && originalText.trim() === translatedText.trim()) {
    score -= 0.28;
    warnings.push("TRANSLATION_UNCHANGED");
  }

  if (input.protectedCollision && input.protectedCollision.ok === false) {
    score = Math.min(score, 0.35);
    warnings.push(...input.protectedCollision.warnings);
  }

  if (warnings.some((warning) => String(warning).startsWith("PROTECTED_TERM_MISSING"))) {
    level = "blocked";
    deliver = false;
    fallbackRequired = true;
  } else if (score >= 0.74) {
    level = "high";
    deliver = true;
  } else if (score >= 0.55) {
    level = "medium";
    deliver = true;
  } else if (score > 0) {
    level = "low";
    deliver = false;
    fallbackRequired = true;
  }

  return {
    score: Number(score.toFixed(2)),
    level,
    deliver,
    fallbackRequired,
    warnings: Array.from(new Set(warnings)),
  };
}

function buildTranslationFallback(input = {}) {
  const target = input.target ? ` to ${input.target}` : "";
  const reason = input.reason || "translation is temporarily unavailable";

  return {
    ok: false,
    text: `I can process the request, but ${reason}${target}.`,
    reason,
  };
}

module.exports = {
  evaluateTranslationConfidence,
  buildTranslationFallback,
};
