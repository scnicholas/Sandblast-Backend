"use strict";

/**
 * TranslationGlossary.js
 * Protected glossary layer for Marion/Nyx Universal Translator.
 *
 * Purpose:
 * - Prevents brand names, product names, route names, and domain terms from being translated incorrectly.
 * - Provides tokenization before translation and restoration after translation.
 * - No external dependencies.
 */

const DEFAULT_PROTECTED_TERMS = [
  "Sandblast",
  "Sandblast Channel",
  "Sandblast.channel",
  "sandblast.channel",
  "Sandblast Radio",
  "Sandblast TV",
  "Synapse",
  "Nyx",
  "Marion",
  "Nexus",
  "Concierge",
  "Universal Translator",
  "Canada Feed",
  "Sports Feed",
  "Finance & Economics",
  "AI",
  "Cyber",
  "Finance",
  "Law",
  "Psychology",
  "English"
];

const DOMAIN_TERMS = {
  psychology: [
    "cognition",
    "affect",
    "attachment",
    "schema",
    "behavioral response",
    "emotional regulation",
    "cognitive load"
  ],
  finance: [
    "inflation",
    "liquidity",
    "asset",
    "equity",
    "market signal",
    "risk exposure",
    "cash flow"
  ],
  law: [
    "contract",
    "liability",
    "intellectual property",
    "copyright",
    "licensing",
    "compliance"
  ],
  cyber: [
    "threat model",
    "attack surface",
    "credential",
    "encryption",
    "authentication",
    "authorization"
  ],
  ai: [
    "model",
    "inference",
    "training data",
    "prompt",
    "embedding",
    "retrieval",
    "classifier"
  ],
  english: [
    "syntax",
    "grammar",
    "rhetoric",
    "semantics",
    "tone",
    "composition"
  ]
};

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeTerms(terms) {
  const seen = new Set();
  const output = [];

  for (const term of terms || []) {
    if (!term || typeof term !== "string") continue;

    const normalized = term.trim();
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) continue;

    seen.add(key);
    output.push(normalized);
  }

  /**
   * Longer terms must be protected first.
   * Example:
   * "Sandblast Channel" before "Sandblast"
   */
  output.sort((a, b) => b.length - a.length);

  return output;
}

function getProtectedTerms(options = {}) {
  const terms = [];

  terms.push(...DEFAULT_PROTECTED_TERMS);

  if (Array.isArray(options.extraTerms)) {
    terms.push(...options.extraTerms);
  }

  if (options.domain && DOMAIN_TERMS[options.domain]) {
    terms.push(...DOMAIN_TERMS[options.domain]);
  }

  if (Array.isArray(options.domains)) {
    for (const domain of options.domains) {
      if (DOMAIN_TERMS[domain]) {
        terms.push(...DOMAIN_TERMS[domain]);
      }
    }
  }

  return dedupeTerms(terms);
}

function makeToken(index) {
  return `__SB_TRANSLATION_PROTECTED_${index}__`;
}

/**
 * protectText()
 *
 * Replaces protected terms with stable placeholder tokens.
 *
 * Example:
 * "Synapse is part of Sandblast Channel."
 * becomes:
 * "__SB_TRANSLATION_PROTECTED_0__ is part of __SB_TRANSLATION_PROTECTED_1__."
 */
function protectText(text, options = {}) {
  if (!text || typeof text !== "string") {
    return {
      text,
      tokens: []
    };
  }

  const protectedTerms = getProtectedTerms(options);
  let output = text;
  const tokens = [];

  protectedTerms.forEach((term) => {
    const token = makeToken(tokens.length);

    /**
     * Use boundary-soft matching.
     * This avoids damaging URLs and phrases while still protecting terms.
     */
    const pattern = new RegExp(escapeRegExp(term), "g");

    if (pattern.test(output)) {
      output = output.replace(pattern, token);
      tokens.push({
        token,
        value: term
      });
    }
  });

  return {
    text: output,
    tokens
  };
}

/**
 * restoreText()
 *
 * Restores protected tokens back into translated text.
 */
function restoreText(text, tokens = []) {
  if (!text || typeof text !== "string") return text;
  if (!Array.isArray(tokens) || tokens.length === 0) return text;

  let output = text;

  for (const item of tokens) {
    if (!item || !item.token) continue;

    const pattern = new RegExp(escapeRegExp(item.token), "g");
    output = output.replace(pattern, item.value);
  }

  return output;
}

/**
 * Full helper:
 * Runs a callback against protected text, then restores terms.
 *
 * This is useful once we connect a real provider.
 */
async function withProtectedTerms(text, translatorFn, options = {}) {
  const protectedPayload = protectText(text, options);

  if (typeof translatorFn !== "function") {
    return {
      text,
      tokens: protectedPayload.tokens,
      protectedText: protectedPayload.text,
      restored: false
    };
  }

  const translatedProtectedText = await translatorFn(protectedPayload.text);

  return {
    text: restoreText(translatedProtectedText, protectedPayload.tokens),
    tokens: protectedPayload.tokens,
    protectedText: protectedPayload.text,
    restored: true
  };
}

/**
 * Allows runtime injection of additional terms without editing the base array.
 */
function createGlossary(extraTerms = []) {
  const merged = dedupeTerms([...DEFAULT_PROTECTED_TERMS, ...extraTerms]);

  return {
    getTerms: () => merged.slice(),
    protectText: (text, options = {}) =>
      protectText(text, {
        ...options,
        extraTerms: merged
      }),
    restoreText
  };
}

module.exports = {
  VERSION: "0.1.0",
  DEFAULT_PROTECTED_TERMS,
  DOMAIN_TERMS,
  getProtectedTerms,
  protectText,
  restoreText,
  withProtectedTerms,
  createGlossary
};
