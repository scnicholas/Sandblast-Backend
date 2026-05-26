'use strict';

/**
 * CulturalAdaptationEngine
 * ------------------------------------------------------------
 * Adds controlled cultural adaptation metadata to LanguageSphere.
 *
 * Purpose:
 * - Avoid literal translation artifacts.
 * - Preserve culturally appropriate tone and register.
 * - Protect technical/system terminology.
 *
 * Rule:
 * This engine does not create a final user-facing answer.
 * It only prepares adaptation metadata for Marion-safe processing.
 */

const path = require('path');

const {
  resolveLocaleContext,
  getLanguageFamily
} = require('./LocaleContextResolver');

const {
  recommendTonePreservation
} = require('./TonePreservationEngine');

function safeRequire(modulePath, fallback = null) {
  try {
    return require(modulePath);
  } catch (_) {
    return fallback;
  }
}

const adaptationRules = safeRequire(
  path.join(__dirname, 'culturalAdaptationRules.json'),
  {
    rules: {},
    lockedTerms: [],
    idiomRiskMarkers: {},
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

function normalizeText(text = '') {
  return sanitizeString(text).replace(/\s+/g, ' ').trim();
}

function getRulesForLanguage(language) {
  const rules = sanitizeObject(adaptationRules.rules);
  return {
    global: sanitizeObject(rules.global),
    language: sanitizeObject(rules[language])
  };
}

function detectLockedTerms(text = '') {
  const normalized = sanitizeString(text);
  const lockedTerms = sanitizeArray(adaptationRules.lockedTerms);

  return lockedTerms.filter((term) => {
    if (!term || typeof term !== 'string') return false;
    return normalized.toLowerCase().includes(term.toLowerCase());
  });
}

function detectIdiomRisks(text = '', language = 'en') {
  const markers = sanitizeObject(adaptationRules.idiomRiskMarkers);
  const list = sanitizeArray(markers[language]);
  const normalized = sanitizeString(text).toLowerCase();

  return list.filter((marker) => {
    if (!marker || typeof marker !== 'string') return false;
    return normalized.includes(marker.toLowerCase());
  });
}

function createAdaptationPlan(text = '', localeInput = {}, options = {}) {
  const normalizedText = normalizeText(text);
  const localeContext = resolveLocaleContext(localeInput, options);
  const rules = getRulesForLanguage(localeContext.targetLanguage);
  const tonePreservation = recommendTonePreservation(
    normalizedText,
    localeContext,
    options
  );

  const lockedTermsDetected = detectLockedTerms(normalizedText);
  const idiomRisks = detectIdiomRisks(
    normalizedText,
    localeContext.sourceLanguage || 'en'
  );

  const targetFamily = getLanguageFamily(localeContext.targetLanguage);
  const sourceFamily = getLanguageFamily(localeContext.sourceLanguage);

  const actions = [];

  if (rules.global.preserveIntent) {
    actions.push('preserve-user-intent');
  }

  if (rules.global.preserveTechnicalTerms || lockedTermsDetected.length) {
    actions.push('protect-locked-terminology');
  }

  if (rules.global.avoidLiteralIdiomTransfer && idiomRisks.length) {
    actions.push('avoid-literal-idiom-transfer');
  }

  if (sourceFamily !== targetFamily && sourceFamily !== 'unknown' && targetFamily !== 'unknown') {
    actions.push('adjust-cross-family-phrasing');
  }

  if (rules.language.directnessAdjustment) {
    actions.push(`directness:${rules.language.directnessAdjustment}`);
  }

  if (rules.language.warmthAdjustment) {
    actions.push(`warmth:${rules.language.warmthAdjustment}`);
  }

  if (rules.language.formalityAdjustment) {
    actions.push(`formality:${rules.language.formalityAdjustment}`);
  }

  return {
    module: 'CulturalAdaptationEngine',
    status: 'ok',
    sourceText: normalizedText,
    localeContext,
    languageFamily: {
      source: sourceFamily,
      target: targetFamily
    },
    adaptationBias: rules.language.adaptationBias || 'neutral',
    rules,
    lockedTermsDetected,
    idiomRisks,
    actions,
    tonePreservation,
    safety: {
      debugLeakageBlocked: true,
      culturalOverreachBlocked: true,
      finalAnswerBlocked: true,
      authorityBypassBlocked: true
    },
    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false
    }
  };
}

function attachCulturalAdaptationToEnvelope(envelope = {}, options = {}) {
  const safeEnvelope = sanitizeObject(envelope);
  const text = sanitizeObject(safeEnvelope.text);
  const language = sanitizeObject(safeEnvelope.language);

  const sourceText =
    sanitizeString(text.sourceText) ||
    sanitizeString(text.normalizedText) ||
    sanitizeString(text.marionInputText);

  const adaptation = createAdaptationPlan(
    sourceText,
    {
      sourceLanguage: language.sourceLanguage,
      targetLanguage: language.targetLanguage,
      locale: options.locale || language.targetLanguage
    },
    options
  );

  return {
    ...safeEnvelope,
    culturalAdaptation: adaptation
  };
}

/**
 * Safe text-level adaptation placeholder.
 *
 * Important:
 * This intentionally does not rewrite full text yet.
 * Phase 3 only attaches controlled metadata. Actual rewrite/adaptation
 * should happen later through Marion-approved output adaptation.
 */
function adaptTextMetadataOnly(text = '', localeInput = {}, options = {}) {
  return {
    originalText: sanitizeString(text),
    adaptedText: sanitizeString(text),
    adaptationApplied: false,
    reason: 'metadata-only-phase',
    adaptationPlan: createAdaptationPlan(text, localeInput, options),
    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false
    }
  };
}

module.exports = {
  createAdaptationPlan,
  attachCulturalAdaptationToEnvelope,
  adaptTextMetadataOnly,
  detectLockedTerms,
  detectIdiomRisks,
  getRulesForLanguage
};
