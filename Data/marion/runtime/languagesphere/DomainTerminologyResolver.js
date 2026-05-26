'use strict';

/**
 * DomainTerminologyResolver
 * ------------------------------------------------------------
 * Detects and classifies domain-sensitive terminology for LanguageSphere.
 *
 * Purpose:
 * - Detect protected architecture/business/legal/finance terms.
 * - Attach domain terminology metadata to LanguageSphere envelopes.
 * - Prevent translation from corrupting Marion/Nyx system vocabulary.
 *
 * Rule:
 * This resolver does not generate final text.
 * Marion remains final authority.
 */

const path = require('path');

function safeRequire(modulePath, fallback = null) {
  try {
    return require(modulePath);
  } catch (_) {
    return fallback;
  }
}

const terminologyLock = safeRequire(
  path.join(__dirname, 'domainTerminologyLock.json'),
  {
    lockedTerms: [],
    lockPolicies: {},
    safety: {}
  }
);

const translationMap = safeRequire(
  path.join(__dirname, 'domainTranslationMap.json'),
  {
    terms: {},
    fallback: {
      policy: 'translate-normal',
      domain: 'general'
    },
    safety: {}
  }
);

function sanitizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function sanitizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function sanitizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeForMatch(value = '') {
  return sanitizeString(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value = '') {
  return sanitizeString(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLockedTerms() {
  return sanitizeArray(terminologyLock.lockedTerms);
}

function getTranslationTerms() {
  return sanitizeObject(translationMap.terms);
}

function termExistsInText(text = '', term = '') {
  const safeText = sanitizeString(text);
  const safeTerm = sanitizeString(term);

  if (!safeText || !safeTerm) return false;

  const escaped = escapeRegExp(safeTerm);
  const pattern = new RegExp(`(^|[^\\w])${escaped}([^\\w]|$)`, 'i');

  return pattern.test(safeText);
}

function getTermPolicy(term = '') {
  const safeTerm = sanitizeString(term);
  const terms = getTranslationTerms();
  const lockedTerms = getLockedTerms();

  if (terms[safeTerm]) {
    return {
      term: safeTerm,
      domain: terms[safeTerm].domain || 'general',
      policy: terms[safeTerm].policy || 'translate-normal',
      translations: sanitizeObject(terms[safeTerm].translations),
      source: 'domainTranslationMap'
    };
  }

  const normalizedRequested = normalizeForMatch(safeTerm);

  const match = lockedTerms.find((item) => {
    const safeItem = sanitizeObject(item);
    return normalizeForMatch(safeItem.term) === normalizedRequested;
  });

  if (match) {
    return {
      term: match.term,
      domain: match.domain || 'general',
      policy: match.policy || 'translate-normal',
      translations: {},
      reason: match.reason || '',
      source: 'domainTerminologyLock'
    };
  }

  return {
    term: safeTerm,
    domain: translationMap.fallback?.domain || 'general',
    policy: translationMap.fallback?.policy || 'translate-normal',
    translations: {},
    source: 'fallback'
  };
}

function resolveDomainTerminology(text = '', options = {}) {
  const safeText = sanitizeString(text);
  const safeOptions = sanitizeObject(options);
  const targetLanguage = sanitizeString(safeOptions.targetLanguage, 'en');

  const lockedTerms = getLockedTerms();
  const translationTerms = getTranslationTerms();

  const candidates = [];

  for (const item of lockedTerms) {
    const safeItem = sanitizeObject(item);
    if (safeItem.term) candidates.push(safeItem.term);
  }

  for (const term of Object.keys(translationTerms)) {
    candidates.push(term);
  }

  const uniqueCandidates = [...new Set(candidates)];

  const detectedTerms = uniqueCandidates
    .filter((term) => termExistsInText(safeText, term))
    .map((term) => {
      const policy = getTermPolicy(term);
      const mappedTranslation =
        policy.translations && typeof policy.translations[targetLanguage] === 'string'
          ? policy.translations[targetLanguage]
          : '';

      return {
        term,
        normalizedTerm: normalizeForMatch(term),
        domain: policy.domain,
        policy: policy.policy,
        source: policy.source,
        mappedTranslation,
        preserveExact: policy.policy === 'preserve-exact',
        preserveConcept: policy.policy === 'preserve-concept',
        translateCarefully: policy.policy === 'translate-carefully',
        allowTranslation: policy.policy !== 'preserve-exact'
      };
    });

  const domains = [...new Set(detectedTerms.map((item) => item.domain))];
  const lockedExactTerms = detectedTerms.filter((item) => item.preserveExact);
  const conceptTerms = detectedTerms.filter((item) => item.preserveConcept);
  const carefulTerms = detectedTerms.filter((item) => item.translateCarefully);

  return {
    module: 'DomainTerminologyResolver',
    status: 'ok',
    sourceText: safeText,
    targetLanguage,
    detectedTerms,
    domains,
    counts: {
      detected: detectedTerms.length,
      preserveExact: lockedExactTerms.length,
      preserveConcept: conceptTerms.length,
      translateCarefully: carefulTerms.length
    },
    safety: {
      debugLeakageBlocked: true,
      finalAnswerBlocked: true,
      authorityBypassBlocked: true,
      domainMeaningProtectionEnabled: true
    },
    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false
    }
  };
}

function attachDomainTerminologyToEnvelope(envelope = {}, options = {}) {
  const safeEnvelope = sanitizeObject(envelope);
  const text = sanitizeObject(safeEnvelope.text);
  const language = sanitizeObject(safeEnvelope.language);

  const sourceText =
    sanitizeString(text.sourceText) ||
    sanitizeString(text.normalizedText) ||
    sanitizeString(text.marionInputText);

  const targetLanguage =
    sanitizeString(options.targetLanguage) ||
    sanitizeString(language.targetLanguage, 'en');

  const domainTerminology = resolveDomainTerminology(sourceText, {
    ...options,
    targetLanguage
  });

  return {
    ...safeEnvelope,
    domainTerminology
  };
}

module.exports = {
  resolveDomainTerminology,
  attachDomainTerminologyToEnvelope,
  getTermPolicy,
  getLockedTerms,
  getTranslationTerms,
  termExistsInText,
  normalizeForMatch
};
