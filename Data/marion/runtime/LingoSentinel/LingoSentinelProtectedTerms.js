"use strict";

/**
 * Data/marion/runtime/LingoSentinel/LingoSentinelProtectedTerms.js
 *
 * Phase 2C.1:
 * Stabilized protected-term masking for Argos translation.
 *
 * Key change:
 * The protected token now keeps the original term inside the wrapper.
 * This prevents names like Marion from disappearing if Argos mutates a token.
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

function buildToken(index, term) {
  return `[[[LS_PROTECTED_${String(index).padStart(4, "0")}::${term}]]]`;
}

function protectTerms(text, terms = DEFAULT_PROTECTED_TERMS) {
  const originalText = String(text || "");
  const protectedTerms = uniqueTerms(terms);
  const replacements = [];
  let protectedText = originalText;

  protectedTerms.forEach((term, index) => {
    const token = buildToken(index, term);
    const regex = new RegExp(`\\b${escapeRegExp(term)}\\b`, "g");

    if (regex.test(protectedText)) {
      protectedText = protectedText.replace(regex, token);
      replacements.push({
        token,
        term,
        index,
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
    if (!item || !item.term) continue;

    const term = String(item.term);
    const token = String(item.token || "");

    if (token) {
      restoredText = restoredText.replace(
        new RegExp(escapeRegExp(token), "g"),
        term
      );
    }

    const wrappedTermRegex = new RegExp(
      `\\[?\\[?\\[?\\s*LS[_\\s-]*PROTECTED[_\\s-]*${String(item.index).padStart(4, "0")}\\s*[:：]{1,2}\\s*${escapeRegExp(term)}\\s*\\]?\\]?\\]?`,
      "gi"
    );

    restoredText = restoredText.replace(wrappedTermRegex, term);

    const caseVariantRegex = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
    restoredText = restoredText.replace(caseVariantRegex, term);
  }

  return restoredText;
}

function detectProtectedTermCollision(originalText, translatedText, replacements = []) {
  const warnings = [];
  const original = String(originalText || "").toLowerCase();
  const translated = String(translatedText || "").toLowerCase();

  for (const item of replacements) {
    if (!item || !item.term) continue;

    const term = String(item.term);
    const termLower = term.toLowerCase();

    const existedInOriginal = original.includes(termLower);
    const existsInTranslated = translated.includes(termLower);

    if (existedInOriginal && !existsInTranslated) {
      warnings.push(`PROTECTED_TERM_MISSING:${term}`);
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

