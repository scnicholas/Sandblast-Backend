"use strict";

/**
 * TranslationGlossary.js
 * Protected glossary layer for Marion/Nyx Universal Translator.
 *
 * Hardened provider-neutral glossary boundary.
 *
 * Purpose:
 * - Prevent brand names, product names, URLs, route names, and domain terms from being translated incorrectly.
 * - Tokenize protected terms before translation and restore them after translation.
 * - Preserve original casing/value while allowing case-insensitive detection when safe.
 * - Provide stable metadata for UniversalTranslatorAdapter protectedTermsApplied reporting.
 * - No external dependencies.
 */

const VERSION = "0.2.2";

const DEFAULT_PROTECTED_TERMS = Object.freeze([
  "Sandblast",
  "Sandblast Channel",
  "Sandblast.channel",
  "sandblast.channel",
  "sandblastchannel.com",
  "www.sandblast.channel",
  "www.sandblastchannel.com",
  "Sandblast Radio",
  "Sandblast TV",
  "Sandblast One",
  "Sandblast one",
  "Synapse",
  "Nyx",
  "Marion",
  "Nexus",
  "Concierge",
  "Universal Translator",
  "LanguageSphere",
  "Marion/Nyx",
  "Nyx/Marion",
  "News Canada",
  "Canada Feed",
  "Sports Feed",
  "Finance & Economics",
  "AI",
  "Cyber",
  "Finance",
  "Law",
  "Psychology",
  "English"
]);

const DOMAIN_TERMS = Object.freeze({
  psychology: Object.freeze([
    "cognition",
    "affect",
    "attachment",
    "schema",
    "behavioral response",
    "emotional regulation",
    "cognitive load",
    "intent",
    "tone",
    "empathy"
  ]),
  finance: Object.freeze([
    "inflation",
    "liquidity",
    "asset",
    "equity",
    "market signal",
    "risk exposure",
    "cash flow",
    "Finance & Economics"
  ]),
  law: Object.freeze([
    "contract",
    "liability",
    "intellectual property",
    "copyright",
    "licensing",
    "compliance",
    "terms of use",
    "privacy policy"
  ]),
  cyber: Object.freeze([
    "threat model",
    "attack surface",
    "credential",
    "encryption",
    "authentication",
    "authorization",
    "zero trust",
    "token"
  ]),
  ai: Object.freeze([
    "model",
    "inference",
    "training data",
    "prompt",
    "embedding",
    "retrieval",
    "classifier",
    "final envelope",
    "authority gate",
    "loop hardlock",
    "StateSpine",
    "MarionBridge",
    "ComposeMarionResponse"
  ]),
  english: Object.freeze([
    "syntax",
    "grammar",
    "rhetoric",
    "semantics",
    "tone",
    "composition"
  ]),
  media: Object.freeze([
    "Sandblast Channel",
    "Sandblast Radio",
    "Sandblast TV",
    "Roku",
    "BR Logic",
    "HTML5",
    "HLS",
    "m3u8",
    "MP4"
  ]),
  interface: Object.freeze([
    /**
     * Do not protect translatable UI labels such as:
     * - Start Reading
     * - Open Feed
     * - Canada Feed
     * - Sports Feed
     *
     * Those belong in LocalTranslationProvider.MANUAL_DICTIONARY.
     * Protecting them before provider lookup prevents exact dictionary hits.
     */
    "Synapse",
    "Nyx",
    "Marion",
    "Sandblast",
    "Sandblast Channel"
  ])
});

const TOKEN_PREFIX = "__SB_TRANSLATION_PROTECTED_";
const TOKEN_SUFFIX = "__";
const TOKEN_PATTERN = /__SB_TRANSLATION_PROTECTED_[0-9]+__/g;

function isProtectedTokenText(text) {
  return typeof text === "string" && /^__SB_TRANSLATION_PROTECTED_[0-9]+__$/.test(text.trim());
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDomainKey(domain) {
  if (!domain || typeof domain !== "string") return "";
  return domain.trim().toLowerCase();
}

function normalizeTermKey(term) {
  return String(term || "").normalize("NFC").trim().toLowerCase();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function dedupeTerms(terms) {
  const seen = new Set();
  const output = [];

  for (const term of terms || []) {
    if (typeof term !== "string") continue;

    const normalized = term.normalize("NFC").replace(/\s+/g, " ").trim();
    const key = normalizeTermKey(normalized);

    if (!normalized || seen.has(key)) continue;

    seen.add(key);
    output.push(normalized);
  }

  /**
   * Longer terms must be protected first.
   * Example: "Sandblast Channel" before "Sandblast".
   */
  output.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return a.localeCompare(b);
  });

  return output;
}

function normalizeTermsInput(value) {
  if (!value) return [];

  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");

  if (typeof value === "string") return [value];

  if (isPlainObject(value)) {
    const terms = [];
    for (const candidate of Object.values(value)) {
      terms.push(...normalizeTermsInput(candidate));
    }
    return terms;
  }

  return [];
}

function getDomainTerms(domainOrDomains) {
  const domains = Array.isArray(domainOrDomains)
    ? domainOrDomains
    : domainOrDomains
      ? [domainOrDomains]
      : [];

  const terms = [];

  for (const domain of domains) {
    const key = normalizeDomainKey(domain);
    if (key && Array.isArray(DOMAIN_TERMS[key])) {
      terms.push(...DOMAIN_TERMS[key]);
    }
  }

  return terms;
}

function getProtectedTerms(options = {}) {
  const terms = [];

  terms.push(...DEFAULT_PROTECTED_TERMS);

  if (options.domain) {
    terms.push(...getDomainTerms(options.domain));
  }

  if (Array.isArray(options.domains)) {
    terms.push(...getDomainTerms(options.domains));
  }

  /**
   * Adapter passes protectedTerms in some paths and extraTerms in others.
   * Support both to keep this module adapter-neutral.
   */
  terms.push(...normalizeTermsInput(options.extraTerms));
  terms.push(...normalizeTermsInput(options.protectedTerms));

  const deduped = dedupeTerms(terms);
  const maxTerms = Number(options.maxProtectedTerms || options.maxProtectedTermsPerRequest || 0);
  return Number.isFinite(maxTerms) && maxTerms > 0 ? deduped.slice(0, maxTerms) : deduped;
}

function makeToken(index) {
  return `${TOKEN_PREFIX}${index}${TOKEN_SUFFIX}`;
}

function hasAlphaNumericBoundary(value, indexBefore, indexAfter) {
  const before = indexBefore >= 0 ? value[indexBefore] : "";
  const after = indexAfter < value.length ? value[indexAfter] : "";

  const boundaryChar = /[\p{L}\p{N}_]/u;

  return !boundaryChar.test(before) && !boundaryChar.test(after);
}

function shouldUseLooseBoundary(term) {
  /**
   * URLs, dotted names, slashed names, ampersands, and multi-word phrases are safest
   * with direct escaped matching because punctuation is part of the protected value.
   */
  return /[.\-/&]/.test(term) || /\s/.test(term);
}

function buildTermPattern(term, options = {}) {
  const flags = options.caseSensitive === true ? "g" : "gi";
  const escaped = escapeRegExp(term);

  if (shouldUseLooseBoundary(term)) {
    return new RegExp(escaped, flags);
  }

  /**
   * Do not match inside longer words.
   * Example: protect "AI" without corrupting "said" or "plain".
   */
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, `${flags}u`);
}

function collectProtectedUrlTerms(text) {
  if (!text || typeof text !== "string") return [];

  const matches = text.match(/\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+/gi);
  return Array.isArray(matches) ? matches : [];
}

function protectText(text, options = {}) {
  if (typeof text !== "string" || text.length === 0) {
    return {
      text,
      tokens: [],
      protectedTermsApplied: 0
    };
  }

  let output = text;
  const tokens = [];
  const terms = getProtectedTerms({
    ...options,
    extraTerms: [
      ...normalizeTermsInput(options.extraTerms),
      ...collectProtectedUrlTerms(text)
    ]
  });

  for (const term of terms) {
    const pattern = buildTermPattern(term, options);
    let matchFound = false;

    output = output.replace(pattern, (match, offset, fullText) => {
      /**
       * Extra guard for engines without lookbehind-equivalent safety in loose mode.
       */
      if (!shouldUseLooseBoundary(term)) {
        const beforeIndex = Number(offset) - 1;
        const afterIndex = Number(offset) + String(match).length;
        if (!hasAlphaNumericBoundary(fullText, beforeIndex, afterIndex)) {
          return match;
        }
      }

      const token = makeToken(tokens.length);
      tokens.push({
        token,
        value: match,
        canonical: term,
        index: tokens.length
      });
      matchFound = true;
      return token;
    });

    /**
     * Keep pattern variable intentionally used through replace callback above.
     * matchFound exists for debugability without emitting logs in production.
     */
    void matchFound;
  }

  return {
    text: output,
    tokens,
    protectedTermsApplied: tokens.length
  };
}

function restoreText(text, tokens = []) {
  if (typeof text !== "string" || text.length === 0) return text;
  if (!Array.isArray(tokens) || tokens.length === 0) return text;

  let output = text;

  /**
   * Restore in reverse order to avoid accidental partial restoration if a provider
   * reorders identical-looking token fragments.
   */
  const safeTokens = tokens
    .filter((item) => item && typeof item.token === "string" && typeof item.value === "string")
    .slice()
    .sort((a, b) => String(b.token).length - String(a.token).length);

  for (const item of safeTokens) {
    const pattern = new RegExp(escapeRegExp(item.token), "g");
    output = output.replace(pattern, item.value);
  }

  return output;
}

function findUnrestoredTokens(text) {
  if (typeof text !== "string") return [];
  const matches = text.match(TOKEN_PATTERN);
  return Array.isArray(matches) ? dedupeTerms(matches) : [];
}

function validateRestoration(text, tokens = []) {
  const unrestoredTokens = findUnrestoredTokens(text);

  return {
    valid: unrestoredTokens.length === 0,
    unrestoredTokens,
    expectedTokenCount: Array.isArray(tokens) ? tokens.length : 0
  };
}

async function withProtectedTerms(text, translatorFn, options = {}) {
  const protectedPayload = protectText(text, options);

  if (typeof translatorFn !== "function") {
    return {
      text,
      tokens: protectedPayload.tokens,
      protectedText: protectedPayload.text,
      restored: false,
      protectedTermsApplied: protectedPayload.protectedTermsApplied,
      validation: validateRestoration(text, protectedPayload.tokens)
    };
  }

  const translatedProtectedText = await translatorFn(protectedPayload.text);
  const restoredText = restoreText(translatedProtectedText, protectedPayload.tokens);

  return {
    text: restoredText,
    tokens: protectedPayload.tokens,
    protectedText: protectedPayload.text,
    restored: true,
    protectedTermsApplied: protectedPayload.protectedTermsApplied,
    validation: validateRestoration(restoredText, protectedPayload.tokens)
  };
}

function createGlossary(extraTerms = []) {
  const merged = dedupeTerms([...DEFAULT_PROTECTED_TERMS, ...normalizeTermsInput(extraTerms)]);

  return {
    VERSION,
    getTerms: (options = {}) =>
      getProtectedTerms({
        ...options,
        extraTerms: [
          ...merged,
          ...normalizeTermsInput(options.extraTerms),
          ...normalizeTermsInput(options.protectedTerms)
        ]
      }),
    protectText: (text, options = {}) =>
      protectText(text, {
        ...options,
        extraTerms: [
          ...merged,
          ...normalizeTermsInput(options.extraTerms),
          ...normalizeTermsInput(options.protectedTerms)
        ]
      }),
    restoreText,
    withProtectedTerms,
    validateRestoration
  };
}

module.exports = {
  VERSION,
  DEFAULT_PROTECTED_TERMS,
  DOMAIN_TERMS,
  TOKEN_PREFIX,
  TOKEN_SUFFIX,
  TOKEN_PATTERN,
  escapeRegExp,
  dedupeTerms,
  normalizeDomainKey,
  normalizeTermKey,
  normalizeTermsInput,
  getDomainTerms,
  getProtectedTerms,
  makeToken,
  isProtectedTokenText,
  protectText,
  restoreText,
  findUnrestoredTokens,
  validateRestoration,
  withProtectedTerms,
  createGlossary
};
