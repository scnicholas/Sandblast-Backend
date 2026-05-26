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

const ENVELOPE_VERSION = '1.0.0';

function nowIso() {
  return new Date().toISOString();
}

function sanitizeString(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value;
}

function sanitizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sanitizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function createLanguageSphereEnvelope(payload = {}) {
  const safePayload = sanitizeObject(payload);

  const sourceText = sanitizeString(safePayload.sourceText);
  const normalizedText = sanitizeString(safePayload.normalizedText, sourceText);
  const translatedText = sanitizeString(safePayload.translatedText, normalizedText);

  const sourceLanguage = sanitizeString(safePayload.sourceLanguage, 'unknown');
  const targetLanguage = sanitizeString(safePayload.targetLanguage, 'en');

  const confidence = Math.max(
    0,
    Math.min(1, sanitizeNumber(safePayload.confidence, 0))
  );

  const translationRequired = sanitizeBoolean(
    safePayload.translationRequired,
    sourceLanguage !== targetLanguage && sourceLanguage !== 'unknown'
  );

  const translationApplied = sanitizeBoolean(safePayload.translationApplied, false);
  const fallbackApplied = sanitizeBoolean(safePayload.fallbackApplied, false);

  return {
    envelopeVersion: ENVELOPE_VERSION,
    module: 'LanguageSphere',
    status: sanitizeString(safePayload.status, 'ok'),

    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayPrepareInput: true,
      mayAdaptOutput: false,
      mayBypassMarion: false
    },

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
      marionInputText: translatedText || normalizedText || sourceText
    },

    provider: {
      name: sanitizeString(safePayload.providerName, 'none'),
      mode: sanitizeString(safePayload.providerMode, 'local'),
      latencyMs: sanitizeNumber(safePayload.latencyMs, 0)
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
      providerFailureGuardActive: true
    },

    diagnostics: {
      warnings: sanitizeArray(safePayload.warnings),
      errors: sanitizeArray(safePayload.errors),
      traceId: sanitizeString(safePayload.traceId, ''),
      createdAt: nowIso()
    }
  };
}

function createLanguageSphereErrorEnvelope(payload = {}) {
  const safePayload = sanitizeObject(payload);

  return createLanguageSphereEnvelope({
    ...safePayload,
    status: 'error',
    fallbackApplied: true,
    translationApplied: false,
    warnings: sanitizeArray(safePayload.warnings),
    errors: sanitizeArray(safePayload.errors).length
      ? sanitizeArray(safePayload.errors)
      : ['LanguageSphere runtime error']
  });
}

function isLanguageSphereEnvelope(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.module === 'LanguageSphere' &&
    value.envelopeVersion === ENVELOPE_VERSION &&
    value.authority &&
    value.authority.finalAuthority === false &&
    value.authority.finalAuthorityOwner === 'Marion'
  );
}

module.exports = {
  ENVELOPE_VERSION,
  createLanguageSphereEnvelope,
  createLanguageSphereErrorEnvelope,
  isLanguageSphereEnvelope
};
