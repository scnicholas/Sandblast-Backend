"use strict";

/**
 * Data/marion/runtime/LingoSentinel/LingoSentinelGlossaryRefiner.js
 *
 * Phase 3E:
 * Conservative glossary-based post-translation refinement.
 */

const {
  getSessionTranslationMemory,
} = require("./LingoSentinelTranslationMemory");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePhrase(value = "") {
  return String(value || "").trim();
}

function getGlossaryEntries(sessionId = "default") {
  const memory = getSessionTranslationMemory(sessionId);
  const glossary = memory.glossary || {};

  return Object.values(glossary)
    .filter(Boolean)
    .filter((entry) => entry.sourcePhrase && entry.targetPhrase)
    .map((entry) => ({
      sourcePhrase: normalizePhrase(entry.sourcePhrase),
      targetPhrase: normalizePhrase(entry.targetPhrase),
    }))
    .filter((entry) => entry.sourcePhrase && entry.targetPhrase);
}

function applyGlossaryRefinements(text = "", options = {}) {
  let refinedText = String(text || "");
  const sessionId = options.sessionId || "default";

  const entries = Array.isArray(options.entries)
    ? options.entries
    : getGlossaryEntries(sessionId);

  const applied = [];

  for (const entry of entries) {
    const targetPhrase = normalizePhrase(entry.targetPhrase);
    if (!targetPhrase) continue;

    const bracketedRegex = new RegExp(`\\[\\s*${escapeRegExp(targetPhrase)}\\s*\\]`, "gi");

    if (bracketedRegex.test(refinedText)) {
      refinedText = refinedText.replace(bracketedRegex, targetPhrase);
      applied.push({
        type: "BRACKETED_TARGET_CLEANUP",
        targetPhrase,
      });
    }

    const spacedPunctuationRegex = new RegExp(`${escapeRegExp(targetPhrase)}\\s+([,.!?;:])`, "gi");

    if (spacedPunctuationRegex.test(refinedText)) {
      refinedText = refinedText.replace(spacedPunctuationRegex, `${targetPhrase}$1`);
      applied.push({
        type: "TARGET_PUNCTUATION_CLEANUP",
        targetPhrase,
      });
    }
  }

  refinedText = refinedText.replace(/\s+([,.!?;:])/g, "$1");

  return {
    text: refinedText,
    applied,
    changed: refinedText !== String(text || ""),
  };
}

function refineTranslationResult(result = {}) {
  if (!result || result.ok !== true || !result.translatedText) {
    return result;
  }

  const sessionId =
    result.translationMeta && result.translationMeta.sessionId
      ? result.translationMeta.sessionId
      : "default";

  const refined = applyGlossaryRefinements(result.translatedText, {
    sessionId,
  });

  if (!refined.changed) {
    return result;
  }

  return {
    ...result,
    translatedText: refined.text,
    responseText: refined.text,
    voiceText: refined.text,
    warnings: Array.from(
      new Set([
        ...(Array.isArray(result.warnings) ? result.warnings : []),
        "GLOSSARY_REFINEMENT_APPLIED",
      ])
    ),
    translationMeta: {
      ...(result.translationMeta || {}),
      glossaryRefinementApplied: true,
      glossaryRefinements: refined.applied,
    },
  };
}

module.exports = {
  getGlossaryEntries,
  applyGlossaryRefinements,
  refineTranslationResult,
};
