'use strict';

/**
 * LocaleContextResolver
 * ------------------------------------------------------------
 * Resolves language + locale context for LanguageSphere.
 *
 * Purpose:
 * - Normalize target locale.
 * - Infer cultural profile from language/locale.
 * - Keep Phase 3 adaptation deterministic and safe.
 *
 * Rule:
 * This resolver provides context only. It does not generate final answers.
 */

const DEFAULT_LANGUAGE = 'en';
const DEFAULT_LOCALE = 'en-US';

const SUPPORTED_LANGUAGE_TO_DEFAULT_LOCALE = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR'
};

const SUPPORTED_LOCALES = new Set([
  'en-US',
  'en-CA',
  'en-GB',
  'es-ES',
  'es-MX',
  'es-US',
  'fr-FR',
  'fr-CA'
]);

function sanitizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function sanitizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function normalizeLanguageCode(value, fallback = DEFAULT_LANGUAGE) {
  const raw = sanitizeString(value, fallback).
