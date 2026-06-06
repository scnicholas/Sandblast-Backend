'use strict';

/**
 * MarionLanguageRouteClassifier
 *
 * Decides whether a user request should stay inside Marion or be routed
 * through LingoLink for multilingual handling.
 *
 * Marion remains the authority. This classifier only recommends routing.
 */

const ROUTES = Object.freeze({
  MARION_ONLY: 'MARION_ONLY',
  LINGOLINK_TRANSLATE: 'LINGOLINK_TRANSLATE',
  LINGOLINK_ADAPT: 'LINGOLINK_ADAPT',
  LINGOLINK_LEARNING: 'LINGOLINK_LEARNING',
  LINGOLINK_DETECT: 'LINGOLINK_DETECT',
  LINGOLINK_UNKNOWN_LANGUAGE: 'LINGOLINK_UNKNOWN_LANGUAGE',
  LINGOLINK_FALLBACK: 'LINGOLINK_FALLBACK'
});

const SUPPORTED_LANGUAGES = Object.freeze({
  en: 'English',
  fr: 'French',
  es: 'Spanish'
});

const LANGUAGE_ALIASES = Object.freeze({
  english: 'en',
  anglais: 'en',
  inglés: 'en',

  french: 'fr',
  francais: 'fr',
  français: 'fr',
  français: 'fr',
  francés: 'fr',

  spanish: 'es',
  espanol: 'es',
  español: 'es',
  espagnol: 'es'
});

function normalizeText(value) {
  return String(value || '').trim();
}

function lower(value) {
  return normalizeText(value).toLowerCase();
}

function detectExplicitTargetLanguage(text) {
  const normalized = lower(text);

  for (const [alias, code] of Object.entries(LANGUAGE_ALIASES)) {
    const pattern = new RegExp(`\\b${alias}\\b`, 'i');
    if (pattern.test(normalized)) {
      return code;
    }
  }

  return null;
}

function containsTranslationIntent(text) {
  const normalized = lower(text);

  return [
    /\btranslate\b/,
    /\btranslation\b/,
    /\bhow do you say\b/,
    /\bsay this in\b/,
    /\bin french\b/,
    /\bin spanish\b/,
    /\bin english\b/,
    /\btraduis\b/,
    /\btraduire\b/,
    /\btraduce\b/,
    /\btraducir\b/
  ].some((pattern) => pattern.test(normalized));
}

function containsAdaptationIntent(text) {
  const normalized = lower(text);

  return [
    /\badapt\b/,
    /\bcultural\b/,
    /\blocali[sz]e\b/,
    /\blocalization\b/,
    /\blocalisation\b/,
    /\bmake this sound natural\b/,
    /\bmake it natural\b/,
    /\bfor a french audience\b/,
    /\bfor a spanish audience\b/,
    /\bfor an english audience\b/,
    /\btone\b/,
    /\bidiom\b/,
    /\bnuance\b/
  ].some((pattern) => pattern.test(normalized));
}

function containsLearningIntent(text) {
  const normalized = lower(text);

  return [
    /\bteach me\b/,
    /\blearn\b/,
    /\bexplain the language\b/,
    /\bgrammar\b/,
    /\bpronunciation\b/,
    /\bpractice\b/,
    /\bphrase\b/,
    /\bvocabulary\b/,
    /\bconjugat/
  ].some((pattern) => pattern.test(normalized));
}

function containsLanguageDetectionIntent(text) {
  const normalized = lower(text);

  return [
    /\bwhat language is this\b/,
    /\bdetect language\b/,
    /\bidentify the language\b/,
    /\bwhich language\b/
  ].some((pattern) => pattern.test(normalized));
}

function hasNonEnglishSignals(text) {
  const value = normalizeText(text);

  if (!value) return false;

  const accentedLatinPattern = /[àâçéèêëîïôûùüÿñáíóú¿¡]/i;
  const commonFrenchWords = /\b(je|tu|vous|nous|avec|bonjour|merci|pourquoi|comment|est-ce|français)\b/i;
  const commonSpanishWords = /\b(hola|gracias|por qué|porque|cómo|usted|ustedes|español|qué|dónde)\b/i;

  return accentedLatinPattern.test(value) ||
    commonFrenchWords.test(value) ||
    commonSpanishWords.test(value);
}

function inferSourceLanguage(text) {
  const value = normalizeText(text);

  if (!value) return 'auto';

  const frenchSignals = [
    /[àâçéèêëîïôûùüÿ]/i,
    /\b(bonjour|merci|pourquoi|comment|vous|nous|français|est-ce|avec)\b/i
  ];

  const spanishSignals = [
    /[ñáéíóú¿¡]/i,
    /\b(hola|gracias|porque|cómo|usted|ustedes|español|dónde|qué)\b/i
  ];

  const frenchScore = frenchSignals.reduce((score, pattern) => score + (pattern.test(value) ? 1 : 0), 0);
  const spanishScore = spanishSignals.reduce((score, pattern) => score + (pattern.test(value) ? 1 : 0), 0);

  if (frenchScore > spanishScore && frenchScore > 0) return 'fr';
  if (spanishScore > frenchScore && spanishScore > 0) return 'es';

  return 'en';
}

function classifyLanguageRoute(input, options = {}) {
  const text = normalizeText(
    typeof input === 'string'
      ? input
      : input && (input.text || input.message || input.query || input.userText)
  );

  const defaultTargetLanguage = options.defaultTargetLanguage || 'en';
  const sourceLanguage = options.sourceLanguage || inferSourceLanguage(text);
  const explicitTargetLanguage = options.targetLanguage || detectExplicitTargetLanguage(text);
  const targetLanguage = explicitTargetLanguage || defaultTargetLanguage;

  const routeBase = {
    ok: true,
    text,
    sourceLanguage,
    targetLanguage,
    supportedLanguages: Object.keys(SUPPORTED_LANGUAGES),
    reason: '',
    confidence: 0.75,
    requiresLingoLink: false,
    route: ROUTES.MARION_ONLY,
    metadata: {
      explicitTargetLanguage: Boolean(explicitTargetLanguage),
      hasNonEnglishSignals: hasNonEnglishSignals(text)
    }
  };

  if (!text) {
    return {
      ...routeBase,
      ok: false,
      route: ROUTES.LINGOLINK_FALLBACK,
      reason: 'Empty input cannot be routed.',
      confidence: 0
    };
  }

  if (containsLanguageDetectionIntent(text)) {
    return {
      ...routeBase,
      route: ROUTES.LINGOLINK_DETECT,
      requiresLingoLink: true,
      reason: 'User is asking for language detection.',
      confidence: 0.92
    };
  }

  if (containsLearningIntent(text)) {
    return {
      ...routeBase,
      route: ROUTES.LINGOLINK_LEARNING,
      requiresLingoLink: true,
      reason: 'User is asking for language learning or explanation.',
      confidence: 0.88
    };
  }

  if (containsAdaptationIntent(text)) {
    return {
      ...routeBase,
      route: ROUTES.LINGOLINK_ADAPT,
      requiresLingoLink: true,
      reason: 'User is asking for cultural or tone adaptation.',
      confidence: 0.86
    };
  }

  if (containsTranslationIntent(text)) {
    const unsupportedTarget = targetLanguage && !SUPPORTED_LANGUAGES[targetLanguage];

    return {
      ...routeBase,
      route: unsupportedTarget ? ROUTES.LINGOLINK_UNKNOWN_LANGUAGE : ROUTES.LINGOLINK_TRANSLATE,
      requiresLingoLink: true,
      reason: unsupportedTarget
        ? 'User requested an unsupported target language.'
        : 'User is asking for translation.',
      confidence: unsupportedTarget ? 0.62 : 0.9
    };
  }

  if (hasNonEnglishSignals(text) && sourceLanguage !== 'en') {
    return {
      ...routeBase,
      route: ROUTES.LINGOLINK_TRANSLATE,
      requiresLingoLink: true,
      reason: 'Input appears to contain non-English language signals.',
      confidence: 0.79
    };
  }

  return {
    ...routeBase,
    reason: 'No multilingual routing required.',
    confidence: 0.82
  };
}

module.exports = {
  ROUTES,
  SUPPORTED_LANGUAGES,
  classifyLanguageRoute,
  inferSourceLanguage,
  detectExplicitTargetLanguage
};
