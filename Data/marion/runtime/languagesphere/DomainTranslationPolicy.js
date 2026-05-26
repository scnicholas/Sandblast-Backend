'use strict';

/**
 * DomainTranslationPolicy
 * ------------------------------------------------------------
 * Applies domain-sensitive translation policy decisions.
 *
 * Purpose:
 * - Decide whether a term should be preserved exactly.
 * - Decide whether a term can be translated through approved mapping.
 * - Prevent domain drift in Marion/Nyx architecture language.
 *
 * Rule:
 * This policy layer does not create final visible answers.
 * Marion remains final authority.
 */

const {
  resolveDomainTerminology,
  getTermPolicy
} = require('./DomainTerminologyResolver');

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

function createPolicyDecision(termResult = {}, targetLanguage = 'en') {
  const safeTerm = sanitizeObject(termResult);
  const policy = getTermPolicy(safeTerm.term);

  const mappedTranslation =
    policy.translations && typeof policy.translations[targetLanguage] === 'string'
      ? policy.translations[targetLanguage]
      : safeTerm.mappedTranslation || '';

  let action = 'translate-normal';

  if (policy.policy === 'preserve-exact') {
    action = 'preserve-exact';
  } else if (policy.policy === 'preserve-concept') {
    action = mappedTranslation ? 'use-approved-concept-map' : 'preserve-concept';
  } else if (policy.policy === 'translate-carefully') {
    action = mappedTranslation ? 'use-approved-domain-map' : 'translate-carefully';
  }

  return {
    term: safeTerm.term || policy.term,
    domain: policy.domain || safeTerm.domain || 'general',
    policy: policy.policy || safeTerm.policy || 'translate-normal',
    action,
    mappedTranslation,
    allowTranslation: policy.policy !== 'preserve-exact',
    allowRewrite:
      policy.policy !== 'preserve-exact' &&
      policy.policy !== 'preserve-concept',
    preserveExact: policy.policy === 'preserve-exact',
    preserveConcept: policy.policy === 'preserve-concept',
    translateCarefully: policy.policy === 'translate-carefully',
    reason: policy.reason || '',
    source: policy.source || safeTerm.source || 'unknown'
  };
}

function resolveTranslationPolicy(text = '', options = {}) {
  const safeOptions = sanitizeObject(options);
  const targetLanguage = sanitizeString(safeOptions.targetLanguage, 'en');

  const terminology = resolveDomainTerminology(text, {
    ...safeOptions,
    targetLanguage
  });

  const decisions = sanitizeArray(terminology.detectedTerms).map((termResult) =>
    createPolicyDecision(termResult, targetLanguage)
  );

  const blockedExactTerms = decisions.filter((item) => item.preserveExact);
  const conceptTerms = decisions.filter((item) => item.preserveConcept);
  const carefulTerms = decisions.filter((item) => item.translateCarefully);

  const riskLevel =
    blockedExactTerms.length > 0
      ? 'high'
      : conceptTerms.length > 0
        ? 'medium'
        : carefulTerms.length > 0
          ? 'low-medium'
          : 'low';

  return {
    module: 'DomainTranslationPolicy',
    status: 'ok',
    targetLanguage,
    sourceText: sanitizeString(text),
    terminology,
    decisions,
    riskLevel,
    summary: {
      totalTerms: decisions.length,
      preserveExact: blockedExactTerms.length,
      preserveConcept: conceptTerms.length,
      translateCarefully: carefulTerms.length,
      translateNormal: decisions.filter((item) => item.policy === 'translate-normal').length
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

function applyTerminologyPolicyToText(text = '', options = {}) {
  const safeText = sanitizeString(text);
  const policy = resolveTranslationPolicy(safeText, options);

  return {
    originalText: safeText,
    policyAppliedText: safeText,
    rewriteApplied: false,
    reason: 'metadata-only-domain-policy',
    policy,
    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false
    }
  };
}

function attachDomainPolicyToEnvelope(envelope = {}, options = {}) {
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

  const domainTranslationPolicy = resolveTranslationPolicy(sourceText, {
    ...options,
    targetLanguage
  });

  return {
    ...safeEnvelope,
    domainTranslationPolicy
  };
}

function shouldBlockLooseTranslation(policyResult = {}) {
  const safePolicy = sanitizeObject(policyResult);
  const summary = sanitizeObject(safePolicy.summary);

  return Boolean(
    summary.preserveExact > 0 ||
    summary.preserveConcept > 0
  );
}

module.exports = {
  resolveTranslationPolicy,
  applyTerminologyPolicyToText,
  attachDomainPolicyToEnvelope,
  createPolicyDecision,
  shouldBlockLooseTranslation
};
