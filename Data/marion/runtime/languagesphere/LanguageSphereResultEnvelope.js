'use strict';

/**
 * LanguageSphereResultEnvelope
 * ------------------------------------------------------------
 * Canonical envelope factory for LanguageSphere runtime output.
 *
 * Purpose:
 * - Keep translation/detection output predictable.
 * - Prevent LanguageSphere from becoming final authority.
 * - Give Marion a clean, structured object to reason over.
 *
 * Critical rule:
 * LanguageSphere prepares language context. Marion still owns the
 * final response decision.
 */

const ENVELOPE_VERSION = '1.0.1';

const MODULE_NAME = 'LanguageSphere';
const FINAL_AUTHORITY_OWNER = 'Marion';

const VALID_STATUSES = new Set([
  'ok',
  'error',
  'disabled',
  'empty',
  'unsupported-language',
  'provider-error',
  'runtime-error',
  'fallback'
]);

function nowIso() {
  return new Date().toISOString();
}

function sanitizeString(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value;
}

function sanitizeStatus(value, fallback = 'ok') {
  const status = sanitizeString(value, fallback);
  return VALID_STATUSES.has(status) ? status : fallback;
}

function sanitizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampUnitInterval(value, fallback = 0) {
  return Math.max(0, Math.min(1, sanitizeNumber(value, fallback)));
}

function sanitizeArray(value) {
  return Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null) : [];
}

function sanitizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function sanitizeLanguageCode(value, fallback = 'unknown') {
  const language = sanitizeString(value, fallback).trim().toLowerCase();

  if (!language) return fallback;

  // Accept simple BCP-47 style values such as en, es, fr, en-ca, fr-ca.
  if (/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language)) {
    return language;
  }

  return fallback;
}

function resolveMarionInputText(translatedText, normalizedText) {
  const translated = sanitizeString(translatedText, '');
  const normalized = sanitizeString(normalizedText, '');

  if (translated.trim()) return translated;
  if (normalized.trim()) return normalized;

  return '';
}

function resolveTranslationRequired(payload, sourceLanguage, targetLanguage) {
  if (typeof payload.translationRequired === 'boolean') {
    return payload.translationRequired;
  }

  return Boolean(
    sourceLanguage &&
      sourceLanguage !== 'unknown' &&
      targetLanguage &&
      sourceLanguage !== targetLanguage
  );
}

function createAuthorityBlock(payload = {}) {
  const safePayload = sanitizeObject(payload);
  const requestedAuthority = sanitizeObject(safePayload.authority);

  return {
    finalAuthority: false,
    finalAuthorityOwner: FINAL_AUTHORITY_OWNER,
    mayPrepareInput: true,
    mayAdaptOutput: sanitizeBoolean(requestedAuthority.mayAdaptOutput, false),
    mayBypassMarion: false
  };
}

function createLanguageSphereEnvelope(payload = {}) {
  const safePayload = sanitizeObject(payload);

  const sourceText = sanitizeString(safePayload.sourceText);
  const normalizedText = sanitizeString(safePayload.normalizedText, sourceText);
  const translatedText = sanitizeString(safePayload.translatedText, normalizedText);

  const sourceLanguage = sanitizeLanguageCode(safePayload.sourceLanguage, 'unknown');
  const targetLanguage = sanitizeLanguageCode(safePayload.targetLanguage, 'en');

  const confidence = clampUnitInterval(safePayload.confidence, 0);

  const translationRequired = resolveTranslationRequired(
    safePayload,
    sourceLanguage,
    targetLanguage
  );

  const translationApplied = sanitizeBoolean(safePayload.translationApplied, false);
  const fallbackApplied = sanitizeBoolean(safePayload.fallbackApplied, false);

  const warnings = sanitizeArray(safePayload.warnings);
  const errors = sanitizeArray(safePayload.errors);

  return {
    envelopeVersion: ENVELOPE_VERSION,
    module: MODULE_NAME,
    status: sanitizeStatus(safePayload.status, errors.length ? 'error' : 'ok'),

    authority: createAuthorityBlock(safePayload),

    language: {
      sourceLanguage,
      targetLanguage,
      confidence,
      translationRequired,
      translationApplied,
      fallbackApplied
    },

    text: {
      sourceText,
      normalizedText,
      translatedText,
      marionInputText: resolveMarionInputText(translatedText, normalizedText)
    },

    provider: {
      name: sanitizeString(safePayload.providerName, 'none'),
      mode: sanitizeString(safePayload.providerMode, 'local'),
      latencyMs: Math.max(0, sanitizeNumber(safePayload.latencyMs, 0))
    },

    glossary: {
      termsDetected: sanitizeArray(safePayload.termsDetected),
      termsLocked: sanitizeArray(safePayload.termsLocked),
      termsApplied: sanitizeArray(safePayload.termsApplied)
    },

    memory: {
      hit: sanitizeBoolean(safePayload.memoryHit, false),
      key: sanitizeString(safePayload.memoryKey, ''),
      source: sanitizeString(safePayload.memorySource, '')
    },

    safety: {
      debugLeakageBlocked: true,
      loopGuardActive: true,
      emptyInputGuardActive: true,
      providerFailureGuardActive: true,
      marionBypassBlocked: true,
      whitespaceOnlyInputBlocked: !resolveMarionInputText(translatedText, normalizedText)
    },

    diagnostics: {
      warnings,
      errors,
      traceId: sanitizeString(safePayload.traceId, ''),
      createdAt: sanitizeString(safePayload.createdAt, nowIso())
    }
  };
}

function createLanguageSphereErrorEnvelope(payload = {}) {
  const safePayload = sanitizeObject(payload);
  const errors = sanitizeArray(safePayload.errors);

  return createLanguageSphereEnvelope({
    ...safePayload,
    status: 'error',
    fallbackApplied: true,
    translationApplied: false,
    errors: errors.length ? errors : ['LanguageSphere runtime error']
  });
}

function createLanguageSphereEmptyEnvelope(payload = {}) {
  const safePayload = sanitizeObject(payload);

  return createLanguageSphereEnvelope({
    ...safePayload,
    status: 'empty',
    normalizedText: '',
    translatedText: '',
    sourceLanguage: sanitizeString(safePayload.sourceLanguage, 'unknown'),
    fallbackApplied: true,
    translationApplied: false,
    translationRequired: false,
    warnings: [
      ...sanitizeArray(safePayload.warnings),
      'Empty or whitespace-only input received; Marion input suppressed.'
    ]
  });
}

function isLanguageSphereEnvelope(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      value.module === MODULE_NAME &&
      typeof value.envelopeVersion === 'string' &&
      value.authority &&
      value.authority.finalAuthority === false &&
      value.authority.finalAuthorityOwner === FINAL_AUTHORITY_OWNER &&
      value.authority.mayBypassMarion === false &&
      value.text &&
      typeof value.text.marionInputText === 'string'
  );
}

module.exports = {
  ENVELOPE_VERSION,
  MODULE_NAME,
  FINAL_AUTHORITY_OWNER,
  createLanguageSphereEnvelope,
  createLanguageSphereErrorEnvelope,
  createLanguageSphereEmptyEnvelope,
  isLanguageSphereEnvelope,

  // Exported for regression testing and future bridge hardening.
  resolveMarionInputText,
  sanitizeLanguageCode
};
