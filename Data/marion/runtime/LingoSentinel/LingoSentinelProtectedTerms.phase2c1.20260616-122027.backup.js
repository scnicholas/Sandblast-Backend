"use strict";

/**
 * Data/marion/runtime/LingoSentinel/LingoSentinelProtectedTerms.js
 *
 * Protects project names, proper nouns, and governed terms before translation.
 */

const DEFAULT_PROTECTED_TERMS = Object.freeze([
  "Nyx",
  "Marion",
  "LingoSentinel",
  "Lingo Sentinel",
  "LingoLink",
  "LanguageSphere",
  "Sandblast",
  "Sandblast Channel",
  "Sandblast Media",
  "Aster",
  "Thalon",
  "Guardians",
  "Civic Guardian",
  "Sentinel",
  "Nexus",
]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueTerms(terms = []) {
  return Array.from(
    new Set(
      terms
        .filter(Boolean)
        .map((term) => String(term).trim())
        .filter(Boolean)
    )
  ).sort((a, b) => b.length - a.length);
}

function getProtectedTerms(extraTerms = []) {
  return uniqueTerms([...DEFAULT_PROTECTED_TERMS, ...extraTerms]);
}

function protectTerms(text, terms = DEFAULT_PROTECTED_TERMS) {
  const originalText = String(text || "");
  const protectedTerms = uniqueTerms(terms);
  const replacements = [];
  let protectedText = originalText;

  protectedTerms.forEach((term, index) => {
    const token = `LSTERM${String(index).padStart(4, "0")}TOKEN`;
    const regex = new RegExp(`\\b${escapeRegExp(term)}\\b`, "g");

    if (regex.test(protectedText)) {
      protectedText = protectedText.replace(regex, token);
      replacements.push({
        token,
        term,
      });
    }
  });

  return {
    text: protectedText,
    replacements,
    protectedTerms,
  };
}

function restoreProtectedTerms(text, replacements = []) {
  let restoredText = String(text || "");

  for (const item of replacements) {
    if (!item || !item.token) continue;
    const regex = new RegExp(escapeRegExp(item.token), "g");
    restoredText = restoredText.replace(regex, item.term);
  }

  return restoredText;
}

function detectProtectedTermCollision(originalText, translatedText, replacements = []) {
  const warnings = [];

  for (const item of replacements) {
    if (!item || !item.term) continue;

    const existedInOriginal = String(originalText || "").includes(item.term);
    const existsInTranslated = String(translatedText || "").includes(item.term);

    if (existedInOriginal && !existsInTranslated) {
      warnings.push(`PROTECTED_TERM_MISSING:${item.term}`);
    }
  }

  return {
    ok: warnings.length === 0,
    warnings,
  };
}

module.exports = {
  DEFAULT_PROTECTED_TERMS,
  getProtectedTerms,
  protectTerms,
  restoreProtectedTerms,
  detectProtectedTermCollision,
};
