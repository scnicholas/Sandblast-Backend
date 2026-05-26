'use strict';

/**
 * LocaleContextResolver
 * ------------------------------------------------------------
 * Resolves safe locale context for LanguageSphere.
 *
 * Purpose:
 * - Normalize locale/language inputs.
 * - Resolve language family, region, and tone profile key.
 * - Keep unsupported locales from breaking the runtime.
 *
 * Rule:
 * Locale context is advisory metadata only.
 * Marion remains final authority.
 */

const DEFAULT_LANGUAGE = 'en';
const DEFAULT_REGION = 'neutral';

const SUPPORTED_LANGUAGE_CODES = new Set(['en', 'es', 'fr']);

const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  unknown: 'Unknown'
};

function sanitizeString(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value;
}

function sanitizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function normalizeLanguageCode(value, fallback = DEFAULT_LANGUAGE) {
  const raw = sanitizeString(value, fallback).trim().toLowerCase();

  if (!raw) return fallback;

  const base = raw.split('-')[0].split('_')[0];

  if (SUPPORTED_LANGUAGE_CODES.has(base)) return base;

  if (base === 'eng') return 'en';
  if (base === 'spa' || base === 'esp') return 'es';
  if (base === 'fre' || base === 'fra') return 'fr';

  return fallback;
}

function normalizeRegionCode(value, fallback = DEFAULT_REGION) {
  const raw = sanitizeString(value, fallback).trim();

  if (!raw) return fallback;

  const parts = raw.split(/[-_]/);

  if (parts.length >= 2 && parts[1]) {
    return parts[1].toUpperCase();
  }

  if (/^[a-z]{2}$/i.test(raw)) {
    return raw.toUpperCase();
  }

  return fallback;
}

function normalizeLocale(value, fallbackLanguage = DEFAULT_LANGUAGE) {
  const raw = sanitizeString(value).trim();

  if (!raw) {
    return {
      language: fallbackLanguage,
      region: DEFAULT_REGION,
      locale: fallbackLanguage,
      explicitLocale: false
    };
  }

  const normalized = raw.replace('_', '-').toLowerCase();
  const parts = normalized.split('-');

  const language = normalizeLanguageCode(parts[0], fallbackLanguage);
  const region = parts[1] ? parts[1].toUpperCase() : DEFAULT_REGION;

  return {
    language,
    region,
    locale: region === DEFAULT_REGION ? language : `${language}-${region}`,
    explicitLocale: true
  };
}

function resolveToneProfileKey(language, region = DEFAULT_REGION) {
  const safeLanguage = normalizeLanguageCode(language, DEFAULT_LANGUAGE);
  const safeRegion = normalizeRegionCode(region, DEFAULT_REGION);

  if (safeRegion !== DEFAULT_REGION) {
    return `${safeLanguage}-${safeRegion}`;
  }

  return safeLanguage;
}

function resolveLocaleContext(input = {}, options = {}) {
  const safeInput = sanitizeObject(input);
  const safeOptions = sanitizeObject(options);

  const sourceLanguage =
    safeInput.sourceLanguage ||
    safeInput.language?.sourceLanguage ||
    safeInput.languageContext?.sourceLanguage ||
    safeInput.language ||
    safeInput.lang ||
    DEFAULT_LANGUAGE;

  const targetLanguage =
    safeInput.targetLanguage ||
    safeInput.language?.targetLanguage ||
    safeInput.languageContext?.targetLanguage ||
    safeInput.targetLang ||
    safeOptions.targetLanguage ||
    DEFAULT_LANGUAGE;

  const requestedLocale =
    safeInput.locale ||
    safeInput.targetLocale ||
    safeOptions.locale ||
    safeOptions.targetLocale ||
    targetLanguage;

  const normalizedLocale = normalizeLocale(
    requestedLocale,
    normalizeLanguageCode(targetLanguage, DEFAULT_LANGUAGE)
  );

  const resolvedTargetLanguage = normalizeLanguageCode(
    normalizedLocale.language,
    DEFAULT_LANGUAGE
  );

  const region = normalizeRegionCode(normalizedLocale.region, DEFAULT_REGION);

  return {
    sourceLanguage: normalizeLanguageCode(sourceLanguage, 'unknown'),
    targetLanguage: resolvedTargetLanguage,
    region,
    locale:
      region === DEFAULT_REGION
        ? resolvedTargetLanguage
        : `${resolvedTargetLanguage}-${region}`,
    languageName: LANGUAGE_NAMES[resolvedTargetLanguage] || 'Unknown',
    toneProfileKey: resolveToneProfileKey(resolvedTargetLanguage, region),
    explicitLocale: Boolean(normalizedLocale.explicitLocale),
    supported: SUPPORTED_LANGUAGE_CODES.has(resolvedTargetLanguage),
    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false
    }
  };
}

function isRomanceLanguage(language) {
  const code = normalizeLanguageCode(language, 'unknown');
  return code === 'es' || code === 'fr';
}

function getLanguageFamily(language) {
  const code = normalizeLanguageCode(language, 'unknown');

  if (code === 'en') return 'germanic';
  if (code === 'es' || code === 'fr') return 'romance';

  return 'unknown';
}

module.exports = {
  DEFAULT_LANGUAGE,
  DEFAULT_REGION,
  SUPPORTED_LANGUAGE_CODES,
  normalizeLanguageCode,
  normalizeRegionCode,
  normalizeLocale,
  resolveToneProfileKey,
  resolveLocaleContext,
  isRomanceLanguage,
  getLanguageFamily
};
