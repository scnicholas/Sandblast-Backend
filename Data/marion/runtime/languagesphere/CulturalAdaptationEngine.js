'use strict';

/**
 * CulturalAdaptationEngine
 * ------------------------------------------------------------
 * Adds controlled cultural adaptation metadata to LanguageSphere.
 *
 * Critical updates:
 * - Module-load safe dependency handling.
 * - Hardened JSON/rule fallback.
 * - Stable locked-term and idiom-risk detection even when config files are
 *   missing, malformed, or saved with the wrong extension.
 * - Marion authority lock is preserved on every public result.
 *
 * Rule:
 * This engine does not create a final user-facing answer.
 * It only prepares adaptation metadata for Marion-safe processing.
 */

const path = require('path');

function safeRequire(modulePath, fallback = null) {
  try {
    return require(modulePath);
  } catch (_) {
    return fallback;
  }
}

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

function normalizeLanguageCode(value, fallback = 'en') {
  const raw = sanitizeString(value, fallback).trim().toLowerCase();
  if (!raw) return fallback;

  const base = raw.split('-')[0].split('_')[0];

  if (base === 'eng') return 'en';
  if (base === 'spa' || base === 'esp') return 'es';
  if (base === 'fre' || base === 'fra') return 'fr';
  if (base === 'en' || base === 'es' || base === 'fr') return base;

  return fallback;
}

function normalizeRegionFromLocale(value) {
  const raw = sanitizeString(value).trim();
  if (!raw) return 'neutral';

  const parts = raw.split(/[-_]/);
  if (parts.length >= 2 && parts[1]) return parts[1].toUpperCase();

  return 'neutral';
}

const localeResolverModule = safeRequire('./LocaleContextResolver', {});

const resolveLocaleContext =
  typeof localeResolverModule.resolveLocaleContext === 'function'
    ? localeResolverModule.resolveLocaleContext
    : function fallbackResolveLocaleContext(input = {}, options = {}) {
        const safeInput = sanitizeObject(input);
        const safeOptions = sanitizeObject(options);

        const sourceLanguage = normalizeLanguageCode(
          safeInput.sourceLanguage ||
            safeInput.language?.sourceLanguage ||
            safeInput.languageContext?.sourceLanguage ||
            safeInput.language ||
            safeInput.lang ||
            'unknown',
          'unknown'
        );

        const targetLanguage = normalizeLanguageCode(
          safeInput.targetLanguage ||
            safeInput.language?.targetLanguage ||
            safeInput.languageContext?.targetLanguage ||
            safeInput.targetLang ||
            safeOptions.targetLanguage ||
            'en',
          'en'
        );

        const requestedLocale =
          safeInput.locale ||
          safeInput.targetLocale ||
          safeOptions.locale ||
          safeOptions.targetLocale ||
          targetLanguage;

        const region = normalizeRegionFromLocale(requestedLocale);
        const locale = region === 'neutral' ? targetLanguage : `${targetLanguage}-${region}`;

        return {
          sourceLanguage,
          targetLanguage,
          region,
          locale,
          languageName:
            targetLanguage === 'es'
              ? 'Spanish'
              : targetLanguage === 'fr'
                ? 'French'
                : 'English',
          toneProfileKey: locale,
          explicitLocale: Boolean(requestedLocale),
          supported: ['en', 'es', 'fr'].includes(targetLanguage),
          authority: {
            finalAuthority: false,
            finalAuthorityOwner: 'Marion',
            mayBypassMarion: false
          }
        };
      };

const getLanguageFamily =
  typeof localeResolverModule.getLanguageFamily === 'function'
    ? localeResolverModule.getLanguageFamily
    : function fallbackGetLanguageFamily(language) {
        const code = normalizeLanguageCode(language, 'unknown');
        if (code === 'en') return 'germanic';
        if (code === 'es' || code === 'fr') return 'romance';
        return 'unknown';
      };

const toneModule = safeRequire('./TonePreservationEngine', {});

const recommendTonePreservation =
  typeof toneModule.recommendTonePreservation === 'function'
    ? toneModule.recommendTonePreservation
    : function fallbackRecommendTonePreservation(text = '', localeInput = {}, options = {}) {
        const localeContext = resolveLocaleContext(localeInput, options);

        return {
          module: 'TonePreservationEngine',
          status: 'fallback',
          tone: {
            primaryTone: 'neutral',
            signals: {},
            confidence: 0.55
          },
          localeContext,
          toneProfile: {},
          preserve: ['user intent', 'technical specificity'],
          avoid: ['tone flattening', 'invented cultural assumptions'],
          recommendations: ['preserve direct clarity'],
          authority: {
            finalAuthority: false,
            finalAuthorityOwner: 'Marion',
            mayBypassMarion: false
          },
          safety: {
            debugLeakageBlocked: true,
            toneOverreachBlocked: true,
            finalAnswerBlocked: true
          }
        };
      };

const DEFAULT_ADAPTATION_RULES = {
  version: '1.0.0-fallback',
  module: 'LanguageSphereCulturalAdaptationRulesFallback',
  authority: {
    finalAuthority: false,
    finalAuthorityOwner: 'Marion',
    mayBypassMarion: false
  },
  rules: {
    global: {
      preserveIntent: true,
      preserveTechnicalTerms: true,
      preserveBrandNames: true,
      preserveSystemNames: true,
      avoidLiteralIdiomTransfer: true,
      doNotInventCulturalContext: true,
      doNotOverrideMarionFinal: true
    },
    en: {
      adaptationBias: 'clarity',
      directnessAdjustment: 'maintain',
      warmthAdjustment: 'light',
      formalityAdjustment: 'neutral',
      notes: [
        'Prefer clear structure.',
        'Keep technical language precise.',
        'Avoid unnecessary ceremony.'
      ]
    },
    es: {
      adaptationBias: 'warmth-and-respect',
      directnessAdjustment: 'soften-slightly',
      warmthAdjustment: 'increase',
      formalityAdjustment: 'preserve-context',
      notes: [
        'Avoid overly literal English structure.',
        'Preserve respectful tone.',
        'Keep technical terms stable when locked.'
      ]
    },
    fr: {
      adaptationBias: 'polish-and-nuance',
      directnessAdjustment: 'soften',
      warmthAdjustment: 'moderate',
      formalityAdjustment: 'increase-slightly',
      notes: [
        'Preserve nuance and register.',
        'Avoid casual phrasing unless user tone is clearly casual.',
        'Keep technical terms stable when locked.'
      ]
    }
  },
  lockedTerms: [
    'Marion',
    'Nyx',
    'LanguageSphere',
    'Sandblast',
    'StateSpine',
    'final authority',
    'final authority gate',
    'final envelope',
    'loop hardlock',
    'domain confidence scoring',
    'MarionBridge',
    'ComposeMarionResponse'
  ],
  idiomRiskMarkers: {
    en: [
      'hit the ground running',
      'ballpark',
      'on the same page',
      'move the needle',
      'under the hood'
    ],
    es: [],
    fr: []
  },
  safety: {
    debugLeakageBlocked: true,
    culturalOverreachBlocked: true,
    authorityBypassBlocked: true,
    unsupportedLocaleFallback: true
  }
};

function mergeAdaptationRules(loadedRules) {
  const safeLoaded = sanitizeObject(loadedRules);
  const loadedRuleMap = sanitizeObject(safeLoaded.rules);
  const defaultRuleMap = sanitizeObject(DEFAULT_ADAPTATION_RULES.rules);

  return {
    ...DEFAULT_ADAPTATION_RULES,
    ...safeLoaded,
    authority: {
      ...DEFAULT_ADAPTATION_RULES.authority,
      ...sanitizeObject(safeLoaded.authority),
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false
    },
    rules: {
      ...defaultRuleMap,
      ...loadedRuleMap,
      global: {
        ...sanitizeObject(defaultRuleMap.global),
        ...sanitizeObject(loadedRuleMap.global)
      },
      en: {
        ...sanitizeObject(defaultRuleMap.en),
        ...sanitizeObject(loadedRuleMap.en)
      },
      es: {
        ...sanitizeObject(defaultRuleMap.es),
        ...sanitizeObject(loadedRuleMap.es)
      },
      fr: {
        ...sanitizeObject(defaultRuleMap.fr),
        ...sanitizeObject(loadedRuleMap.fr)
      }
    },
    lockedTerms: Array.from(
      new Set([
        ...sanitizeArray(DEFAULT_ADAPTATION_RULES.lockedTerms),
        ...sanitizeArray(safeLoaded.lockedTerms)
      ])
    ),
    idiomRiskMarkers: {
      ...sanitizeObject(DEFAULT_ADAPTATION_RULES.idiomRiskMarkers),
      ...sanitizeObject(safeLoaded.idiomRiskMarkers)
    },
    safety: {
      ...sanitizeObject(DEFAULT_ADAPTATION_RULES.safety),
      ...sanitizeObject(safeLoaded.safety)
    }
  };
}

const adaptationRules = mergeAdaptationRules(
  safeRequire(path.join(__dirname, 'culturalAdaptationRules.json'), DEFAULT_ADAPTATION_RULES)
);

function buildAuthorityMetadata() {
  return {
    finalAuthority: false,
    finalAuthorityOwner: 'Marion',
    mayBypassMarion: false,
    mayPrepareInput: true,
    mayAdaptOutput: false,
    finalAnswerBlocked: true,
    marionBypassBlocked: true
  };
}

function getRulesForLanguage(language) {
  const rules = sanitizeObject(adaptationRules.rules);
  const code = normalizeLanguageCode(language, 'en');

  return {
    global: sanitizeObject(rules.global),
    language: sanitizeObject(rules[code] || rules.en)
  };
}

function detectLockedTerms(text = '') {
  const normalized = sanitizeString(text);
  const normalizedLower = normalized.toLowerCase();
  const lockedTerms = sanitizeArray(adaptationRules.lockedTerms);

  return lockedTerms.filter((term) => {
    if (!term || typeof term !== 'string') return false;
    return normalizedLower.includes(term.toLowerCase());
  });
}

function detectIdiomRisks(text = '', language = 'en') {
  const markers = sanitizeObject(adaptationRules.idiomRiskMarkers);
  const code = normalizeLanguageCode(language, 'en');
  const list = sanitizeArray(markers[code]);
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
    actions: Array.from(new Set(actions)),
    tonePreservation,
    safety: {
      debugLeakageBlocked: true,
      culturalOverreachBlocked: true,
      finalAnswerBlocked: true,
      authorityBypassBlocked: true
    },
    authority: buildAuthorityMetadata()
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
    authority: buildAuthorityMetadata()
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
