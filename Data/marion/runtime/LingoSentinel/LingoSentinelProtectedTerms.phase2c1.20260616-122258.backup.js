"use strict";

/**
 * Data/marion/runtime/LingoSentinel/LingoSentinelProtectedTerms.js
 *
 * Phase 2C.1:
 * Stabilized protected-term masking for Argos translation.
 * Uses bracketed sentinel tokens that are less likely to be translated/mutated.
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

function buildToken(index) {
  return `[[LS_PROTECTED_${String(index).padStart(4, "0")}]]`;
}

function buildLooseTokenRegex(token) {
  const compact = String(token).replace(/\s+/g, "");
  const escapedChars = compact
    .split("")
    .map((char) => escapeRegExp(char))
    .join("\\s*");

  return new RegExp(escapedChars, "gi");
}

function protectTerms(text, terms = DEFAULT_PROTECTED_TERMS) {
  const originalText = String(text || "");
  const protectedTerms = uniqueTerms(terms);
  const replacements = [];
  let protectedText = originalText;

  protectedTerms.forEach((term, index) => {
    const token = buildToken(index);
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

    const exactRegex = new RegExp(escapeRegExp(item.token), "g");
    restoredText = restoredText.replace(exactRegex, item.term);

    const looseRegex = buildLooseTokenRegex(item.token);
    restoredText = restoredText.replace(looseRegex, item.term);
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
