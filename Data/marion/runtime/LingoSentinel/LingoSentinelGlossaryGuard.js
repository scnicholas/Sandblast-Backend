"use strict";

/**
 * LingoSentinelGlossaryGuard
 *
 * Purpose:
 * Protects Sandblast/Marion ecosystem terms from unsafe translation or mutation.
 *
 * Scope:
 * - Preserves protected terms.
 * - Detects altered glossary terms.
 * - Produces metadata for Marion.
 * - Does not override Marion.
 */

const DEFAULT_PROTECTED_TERMS = [
  "Marion",
  "Nyx",
  "LingoSentinel",
  "LanguageSphere",
  "Aster",
  "Thalon",
  "Sandblast",
  "Sandblast Channel",
  "cognitive operating system",
  "Marion Bridge",
  "LanguageSphere"
];

const DEFAULT_GLOSSARY_CONFIG = {
  enabled: true,
  caseSensitive: false,
  advisoryOnly: true,
  authority: {
    finalAuthority: "Marion",
    glossaryAdvisoryOnly: true,
    neverOverrideMarion: true
  }
};

function safeString(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return String(value);
  } catch (_) {
    return "";
  }
}

function escapeRegExp(value) {
  return safeString(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueTerms(terms) {
  const seen = new Set();
  const output = [];

  for (const term of terms || []) {
    const safeTerm = safeString(term).trim();
    const key = safeTerm.toLowerCase();

    if (!safeTerm || seen.has(key)) continue;

    seen.add(key);
    output.push(safeTerm);
  }

  return output;
}

function buildTermPattern(term, caseSensitive) {
  const flags = caseSensitive ? "g" : "gi";
  return new RegExp(escapeRegExp(term), flags);
}

function findTerms(text, terms, caseSensitive) {
  const safeText = safeString(text);
  const found = [];

  for (const term of uniqueTerms(terms)) {
    const pattern = buildTermPattern(term, caseSensitive);

    if (pattern.test(safeText)) {
      found.push(term);
    }
  }

  return found;
}

function preserveGlossaryTerms(sourceText, candidateText, options = {}) {
  const config = {
    ...DEFAULT_GLOSSARY_CONFIG,
    ...(options.config || {}),
    authority: {
      ...DEFAULT_GLOSSARY_CONFIG.authority,
      ...((options.config && options.config.authority) || {})
    }
  };

  const protectedTerms = uniqueTerms([
    ...DEFAULT_PROTECTED_TERMS,
    ...((options.protectedTerms && Array.isArray(options.protectedTerms))
      ? options.protectedTerms
      : [])
  ]);

  const originalText = safeString(sourceText);
  let guardedText = safeString(candidateText);

  if (!config.enabled) {
    return {
      originalText,
      candidateText: safeString(candidateText),
      guardedText,
      changed: false,
      protectedTerms,
      foundInOriginal: [],
      foundInCandidate: [],
      restoredTerms: [],
      missingTerms: [],
      advisoryOnly: true,
      reason: "glossary_guard_disabled",
      authority: config.authority,
      source: "LingoSentinelGlossaryGuard"
    };
  }

  const foundInOriginal = findTerms(
    originalText,
    protectedTerms,
    config.caseSensitive
  );

  const foundInCandidate = findTerms(
    guardedText,
    protectedTerms,
    config.caseSensitive
  );

  const restoredTerms = [];
  const missingTerms = [];

  for (const term of foundInOriginal) {
    const candidateHasTerm = findTerms(
      guardedText,
      [term],
      config.caseSensitive
    ).length > 0;

    if (!candidateHasTerm) {
      missingTerms.push(term);

      /**
       * Conservative restoration:
       * Add protected term in brackets only when it disappeared entirely.
       * This avoids aggressive rewriting while preserving audit visibility.
       */
      guardedText = guardedText
        ? `${guardedText} [${term}]`
        : `[${term}]`;

      restoredTerms.push(term);
    }
  }

  return {
    originalText,
    candidateText: safeString(candidateText),
    guardedText,
    changed: guardedText !== safeString(candidateText),
    protectedTerms,
    foundInOriginal,
    foundInCandidate,
    restoredTerms,
    missingTerms,
    advisoryOnly: true,
    reason: restoredTerms.length
      ? "protected_terms_restored"
      : "protected_terms_preserved",
    authority: config.authority,
    source: "LingoSentinelGlossaryGuard"
  };
}

function inspectGlossaryIntegrity(sourceText, candidateText, options = {}) {
  const config = {
    ...DEFAULT_GLOSSARY_CONFIG,
    ...(options.config || {})
  };

  const protectedTerms = uniqueTerms([
    ...DEFAULT_PROTECTED_TERMS,
    ...((options.protectedTerms && Array.isArray(options.protectedTerms))
      ? options.protectedTerms
      : [])
  ]);

  const originalText = safeString(sourceText);
  const outputText = safeString(candidateText);

  const foundInOriginal = findTerms(
    originalText,
    protectedTerms,
    config.caseSensitive
  );

  const foundInCandidate = findTerms(
    outputText,
    protectedTerms,
    config.caseSensitive
  );

  const missingTerms = foundInOriginal.filter((term) => {
    return findTerms(outputText, [term], config.caseSensitive).length === 0;
  });

  return {
    originalText,
    candidateText: outputText,
    protectedTerms,
    foundInOriginal,
    foundInCandidate,
    missingTerms,
    intact: missingTerms.length === 0,
    advisoryOnly: true,
    source: "LingoSentinelGlossaryGuard"
  };
}

module.exports = {
  preserveGlossaryTerms,
  inspectGlossaryIntegrity,
  findTerms,
  DEFAULT_PROTECTED_TERMS,
  DEFAULT_GLOSSARY_CONFIG
};
