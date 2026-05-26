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

function safeRequire(modulePath, fallback = null) {
  try {
    return require(modulePath);
  } catch (_) {
    return fallback;
  }
}

const resolver = safeRequire('./DomainTerminologyResolver', {});

const resolveDomainTerminology =
  typeof resolver.resolveDomainTerminology === 'function'
    ? resolver.resolveDomainTerminology
    : function fallbackResolveDomainTerminology(text = '', options = {}) {
        return {
          module: 'DomainTerminologyResolver',
          status: 'fallback',
          sourceText: typeof text === 'string' ? text : '',
          targetLanguage:
            options && typeof options.targetLanguage === 'string'
              ? options.targetLanguage
              : 'en',
          detectedTerms: [],
          domains: [],
          counts: {
            detected: 0,
            preserveExact: 0,
            preserveConcept: 0,
            translateCarefully: 0
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
      };

const getTermPolicy =
  typeof resolver.getTermPolicy === 'function'
    ? resolver.getTermPolicy
    : function fallbackGetTermPolicy(term = '') {
        return {
          term,
          domain: 'general',
          policy: 'translate-normal',
          translations: {},
          source: 'fallback'
        };
      };

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

function normalizeLanguage(value, fallback = 'en') {
  const raw = sanitizeString(value, fallback).trim().toLowerCase();

  if (!raw) return fallback;

  return raw.split('-')[0].split('_')[0] || fallback;
}

function normalizePolicyName(value) {
  const policy = sanitizeString(value, 'translate-normal');

  if (
    policy === 'preserve-exact' ||
    policy === 'preserve-concept' ||
    policy === 'translate-carefully' ||
    policy === 'translate-normal'
  ) {
    return policy;
  }

  return 'translate-normal';
}

function createPolicyDecision(termResult = {}, targetLanguage = 'en') {
  const safeTerm = sanitizeObject(termResult);
  const safeTargetLanguage = normalizeLanguage(targetLanguage, 'en');
  const policy = getTermPolicy(safeTerm.term);
  const normalizedPolicy = normalizePolicyName(policy.policy || safeTerm.policy);

  const translations = sanitizeObject(policy.translations);
  const mappedTranslation =
    typeof translations[safeTargetLanguage] === 'string'
      ? translations[safeTargetLanguage]
      : sanitizeString(safeTerm.mappedTranslation);

  let action = 'translate-normal';

  if (normalizedPolicy === 'preserve-exact') {
    action = 'preserve-exact';
  } else if (normalizedPolicy === 'preserve-concept') {
    action = mappedTranslation ? 'use-approved-concept-map' : 'preserve-concept';
  } else if (normalizedPolicy === 'translate-carefully') {
    action = mappedTranslation ? 'use-approved-domain-map' : 'translate-carefully';
  }

  return {
    term: sanitizeString(safeTerm.term || policy.term),
    domain: sanitizeString(policy.domain || safeTerm.domain, 'general'),
    policy: normalizedPolicy,
    action,
    mappedTranslation,
    allowTranslation: normalizedPolicy !== 'preserve-exact',
    allowRewrite:
      normalizedPolicy !== 'preserve-exact' &&
      normalizedPolicy !== 'preserve-concept',
    preserveExact: normalizedPolicy === 'preserve-exact',
    preserveConcept: normalizedPolicy === 'preserve-concept',
    translateCarefully: normalizedPolicy === 'translate-carefully',
    reason: sanitizeString(policy.reason),
    source: sanitizeString(policy.source || safeTerm.source, 'unknown'),
    safety: {
      looseTranslationBlocked:
        normalizedPolicy === 'preserve-exact' ||
        normalizedPolicy === 'preserve-concept',
      finalAnswerBlocked: true,
      authorityBypassBlocked: true
    }
  };
}

function summarizeDecisions(decisions = []) {
  const safeDecisions = sanitizeArray(decisions);
  const blockedExactTerms = safeDecisions.filter((item) => item.preserveExact);
  const conceptTerms = safeDecisions.filter((item) => item.preserveConcept);
  const carefulTerms = safeDecisions.filter((item) => item.translateCarefully);
  const normalTerms = safeDecisions.filter((item) => item.policy === 'translate-normal');

  return {
    totalTerms: safeDecisions.length,
    preserveExact: blockedExactTerms.length,
    preserveConcept: conceptTerms.length,
    translateCarefully: carefulTerms.length,
    translateNormal: normalTerms.length
  };
}

function resolveRiskLevel(summary = {}) {
  const safeSummary = sanitizeObject(summary);

  if (safeSummary.preserveExact > 0) return 'high';
  if (safeSummary.preserveConcept > 0) return 'medium';
  if (safeSummary.translateCarefully > 0) return 'low-medium';

  return 'low';
}

function resolveTranslationPolicy(text = '', options = {}) {
  const safeOptions = sanitizeObject(options);
  const targetLanguage = normalizeLanguage(safeOptions.targetLanguage, 'en');

  const terminology = resolveDomainTerminology(text, {
    ...safeOptions,
    targetLanguage
  });

  const decisions = sanitizeArray(terminology.detectedTerms).map((termResult) =>
    createPolicyDecision(termResult, targetLanguage)
  );

  const summary = summarizeDecisions(decisions);
  const riskLevel = resolveRiskLevel(summary);

  return {
    module: 'DomainTranslationPolicy',
    status: 'ok',
    targetLanguage,
    sourceText: sanitizeString(text),
    terminology: sanitizeObject(terminology),
    decisions,
    riskLevel,
    summary,
    policyMode: {
      metadataOnly: true,
      rewriteApplied: false,
      looseTranslationBlocked: shouldBlockLooseTranslationFromSummary(summary)
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
    },
    safety: {
      debugLeakageBlocked: true,
      finalAnswerBlocked: true,
      authorityBypassBlocked: true,
      domainMeaningProtectionEnabled: true
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
    normalizeLanguage(options.targetLanguage) ||
    normalizeLanguage(language.targetLanguage, 'en');

  const domainTranslationPolicy = resolveTranslationPolicy(sourceText, {
    ...sanitizeObject(options),
    targetLanguage
  });

  return {
    ...safeEnvelope,
    domainTranslationPolicy
  };
}

function shouldBlockLooseTranslationFromSummary(summary = {}) {
  const safeSummary = sanitizeObject(summary);

  return Boolean(
    safeSummary.preserveExact > 0 ||
    safeSummary.preserveConcept > 0
  );
}

function shouldBlockLooseTranslation(policyResult = {}) {
  const safePolicy = sanitizeObject(policyResult);
  const directSummary = sanitizeObject(safePolicy.summary);
  const nestedSummary = sanitizeObject(safePolicy.policy && safePolicy.policy.summary);

  if (Object.keys(directSummary).length) {
    return shouldBlockLooseTranslationFromSummary(directSummary);
  }

  if (Object.keys(nestedSummary).length) {
    return shouldBlockLooseTranslationFromSummary(nestedSummary);
  }

  return false;
}

module.exports = {
  resolveTranslationPolicy,
  applyTerminologyPolicyToText,
  attachDomainPolicyToEnvelope,
  createPolicyDecision,
  shouldBlockLooseTranslation,
  summarizeDecisions,
  resolveRiskLevel
};
