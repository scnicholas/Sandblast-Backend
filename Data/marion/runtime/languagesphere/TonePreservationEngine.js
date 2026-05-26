'use strict';

/**
 * TonePreservationEngine
 * ------------------------------------------------------------
 * Preserves and classifies tone metadata for LanguageSphere.
 *
 * Critical updates:
 * - Module-load safe dependency handling.
 * - Hardened JSON/profile fallback.
 * - Stable locale profile resolution even when config files are missing,
 *   malformed, or saved with the wrong extension.
 * - Marion authority lock is preserved on every public result.
 *
 * Rule:
 * This engine does not produce Marion's final answer.
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
        const toneProfileKey = locale;

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
          toneProfileKey,
          explicitLocale: Boolean(requestedLocale),
          supported: ['en', 'es', 'fr'].includes(targetLanguage),
          authority: {
            finalAuthority: false,
            finalAuthorityOwner: 'Marion',
            mayBypassMarion: false
          }
        };
      };

const DEFAULT_TONE_PROFILES = {
  version: '1.0.0-fallback',
  module: 'LanguageSphereLocaleToneProfilesFallback',
  authority: {
    finalAuthority: false,
    finalAuthorityOwner: 'Marion',
    mayBypassMarion: false
  },
  profiles: {
    en: {
      language: 'en',
      label: 'English Neutral',
      defaultFormality: 'neutral',
      directness: 'medium-high',
      warmth: 'medium',
      politeness: 'medium',
      compression: 'medium',
      preferredGreetingStyle: 'clear',
      avoid: [
        'overly ceremonial phrasing',
        'excessive apology',
        'unnecessary honorifics'
      ],
      preserve: [
        'technical clarity',
        'direct request intent',
        'business terms',
        'Marion/Nyx internal architecture terms'
      ]
    },
    'en-CA': {
      language: 'en',
      region: 'CA',
      label: 'Canadian English',
      defaultFormality: 'neutral',
      directness: 'medium',
      warmth: 'medium-high',
      politeness: 'medium-high',
      compression: 'medium',
      preferredGreetingStyle: 'clear-warm',
      avoid: [
        'aggressive sales phrasing',
        'overly blunt rejection language'
      ],
      preserve: [
        'grant terminology',
        'Canadian spelling when requested',
        'business compliance wording'
      ]
    },
    es: {
      language: 'es',
      label: 'Spanish Neutral',
      defaultFormality: 'neutral-warm',
      directness: 'medium',
      warmth: 'high',
      politeness: 'medium-high',
      compression: 'medium',
      preferredGreetingStyle: 'warm',
      avoid: [
        'literal English idioms',
        'overly cold phrasing',
        'loss of respectful address'
      ],
      preserve: [
        'technical terminology',
        'brand names',
        'AI system names',
        'legal and finance terms when locked'
      ]
    },
    fr: {
      language: 'fr',
      label: 'French Neutral',
      defaultFormality: 'neutral-formal',
      directness: 'medium-low',
      warmth: 'medium',
      politeness: 'high',
      compression: 'medium-low',
      preferredGreetingStyle: 'polished',
      avoid: [
        'word-for-word English structure',
        'excessive informality',
        'flattened nuance'
      ],
      preserve: [
        'formal register',
        'technical terminology',
        'brand names',
        'legal and finance terms when locked'
      ]
    },
    'fr-CA': {
      language: 'fr',
      region: 'CA',
      label: 'Canadian French',
      defaultFormality: 'neutral-formal',
      directness: 'medium',
      warmth: 'medium-high',
      politeness: 'high',
      compression: 'medium',
      preferredGreetingStyle: 'polished-warm',
      avoid: [
        'European-only phrasing when Canadian context is clear',
        'overly rigid formalism'
      ],
      preserve: [
        'Canadian institutional terms',
        'business compliance wording',
        'domain terminology'
      ]
    }
  },
  fallbackProfile: {
    language: 'unknown',
    label: 'Neutral Fallback',
    defaultFormality: 'neutral',
    directness: 'medium',
    warmth: 'medium',
    politeness: 'medium',
    compression: 'medium',
    preferredGreetingStyle: 'clear',
    avoid: [
      'unsupported cultural assumptions'
    ],
    preserve: [
      'user intent',
      'technical terminology',
      'brand names'
    ]
  }
};

function mergeToneProfiles(loadedProfiles) {
  const safeLoaded = sanitizeObject(loadedProfiles);
  const loadedProfileMap = sanitizeObject(safeLoaded.profiles);

  return {
    ...DEFAULT_TONE_PROFILES,
    ...safeLoaded,
    authority: {
      ...DEFAULT_TONE_PROFILES.authority,
      ...sanitizeObject(safeLoaded.authority),
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false
    },
    profiles: {
      ...DEFAULT_TONE_PROFILES.profiles,
      ...loadedProfileMap
    },
    fallbackProfile: {
      ...DEFAULT_TONE_PROFILES.fallbackProfile,
      ...sanitizeObject(safeLoaded.fallbackProfile)
    }
  };
}

const toneProfiles = mergeToneProfiles(
  safeRequire(path.join(__dirname, 'localeToneProfiles.json'), DEFAULT_TONE_PROFILES)
);

function normalizeWhitespace(text) {
  return sanitizeString(text).replace(/\s+/g, ' ').trim();
}

function getToneProfile(localeContext = {}) {
  const safeContext = sanitizeObject(localeContext);
  const profiles = sanitizeObject(toneProfiles.profiles);

  const preferredKey = sanitizeString(safeContext.toneProfileKey);
  const localeKey = sanitizeString(safeContext.locale);
  const languageKey = sanitizeString(safeContext.targetLanguage);

  return (
    profiles[preferredKey] ||
    profiles[localeKey] ||
    profiles[languageKey] ||
    toneProfiles.fallbackProfile ||
    DEFAULT_TONE_PROFILES.fallbackProfile
  );
}

function detectToneSignals(text = '') {
  const normalized = normalizeWhitespace(text);
  const lower = normalized.toLowerCase();

  const signals = {
    urgency: false,
    frustration: false,
    gratitude: false,
    uncertainty: false,
    technical: false,
    business: false,
    emotional: false,
    casual: false,
    formal: false
  };

  if (/[!?]{2,}/.test(normalized) || /\b(asap|urgent|quick|right now|immediately)\b/i.test(normalized)) {
    signals.urgency = true;
  }

  if (/\b(frustrated|annoyed|broken|not working|failed|screwed|problem|issue)\b/i.test(lower)) {
    signals.frustration = true;
  }

  if (/\b(thanks|thank you|gracias|merci|appreciate)\b/i.test(lower)) {
    signals.gratitude = true;
  }

  if (/\b(maybe|not sure|i think|possibly|probably|could be|might)\b/i.test(lower)) {
    signals.uncertainty = true;
  }

  if (/\b(api|runtime|bridge|router|payload|json|config|regression|test|domain|latency|provider|state spine|statespine)\b/i.test(lower)) {
    signals.technical = true;
  }

  if (/\b(application|fund|licensing|revenue|client|meeting|financial|portal|business|proposal|grant)\b/i.test(lower)) {
    signals.business = true;
  }

  if (/\b(feel|worried|hope|afraid|excited|concerned|stressed)\b/i.test(lower)) {
    signals.emotional = true;
  }

  if (/\b(hey|yeah|okay|cool|gonna|wanna)\b/i.test(lower)) {
    signals.casual = true;
  }

  if (/\b(please|kindly|regards|would you|could you)\b/i.test(lower)) {
    signals.formal = true;
  }

  return signals;
}

function classifyTone(text = '') {
  const signals = detectToneSignals(text);

  let primaryTone = 'neutral';

  if (signals.frustration && signals.urgency) {
    primaryTone = 'urgent-frustrated';
  } else if (signals.urgency) {
    primaryTone = 'urgent';
  } else if (signals.frustration) {
    primaryTone = 'frustrated';
  } else if (signals.gratitude) {
    primaryTone = 'appreciative';
  } else if (signals.uncertainty) {
    primaryTone = 'uncertain';
  } else if (signals.technical) {
    primaryTone = 'technical';
  } else if (signals.business) {
    primaryTone = 'business';
  } else if (signals.emotional) {
    primaryTone = 'emotional';
  }

  return {
    primaryTone,
    signals,
    confidence: primaryTone === 'neutral' ? 0.55 : 0.78
  };
}

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

function recommendTonePreservation(text = '', localeInput = {}, options = {}) {
  const localeContext = resolveLocaleContext(localeInput, options);
  const toneProfile = getToneProfile(localeContext);
  const tone = classifyTone(text);

  const preserve = [
    'user intent',
    'emotional force',
    'technical specificity',
    ...sanitizeArray(toneProfile.preserve)
  ];

  const avoid = [
    'tone flattening',
    'invented cultural assumptions',
    ...sanitizeArray(toneProfile.avoid)
  ];

  const recommendations = [];

  if (tone.signals.urgency) {
    recommendations.push('preserve urgency without adding panic');
  }

  if (tone.signals.frustration) {
    recommendations.push('acknowledge friction without escalating blame');
  }

  if (tone.signals.technical) {
    recommendations.push('preserve technical precision and locked terminology');
  }

  if (tone.signals.business) {
    recommendations.push('preserve professional clarity');
  }

  if (localeContext.targetLanguage === 'es') {
    recommendations.push('preserve warmth and respectful phrasing');
  }

  if (localeContext.targetLanguage === 'fr') {
    recommendations.push('preserve polished phrasing and register');
  }

  if (localeContext.targetLanguage === 'en') {
    recommendations.push('preserve direct clarity');
  }

  return {
    module: 'TonePreservationEngine',
    status: 'ok',
    tone,
    localeContext,
    toneProfile,
    preserve: Array.from(new Set(preserve)),
    avoid: Array.from(new Set(avoid)),
    recommendations: Array.from(new Set(recommendations)),
    authority: buildAuthorityMetadata(),
    safety: {
      debugLeakageBlocked: true,
      toneOverreachBlocked: true,
      finalAnswerBlocked: true,
      authorityBypassBlocked: true
    }
  };
}

function attachToneMetadataToEnvelope(envelope = {}, options = {}) {
  const safeEnvelope = sanitizeObject(envelope);
  const text = sanitizeObject(safeEnvelope.text);
  const language = sanitizeObject(safeEnvelope.language);

  const sourceText =
    sanitizeString(text.sourceText) ||
    sanitizeString(text.normalizedText) ||
    sanitizeString(text.marionInputText);

  const tonePreservation = recommendTonePreservation(
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
    tonePreservation
  };
}

module.exports = {
  detectToneSignals,
  classifyTone,
  getToneProfile,
  recommendTonePreservation,
  attachToneMetadataToEnvelope
};
