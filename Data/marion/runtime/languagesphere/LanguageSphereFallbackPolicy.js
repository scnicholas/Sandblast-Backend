'use strict';

/**
 * LanguageSphereFallbackPolicy
 * ------------------------------------------------------------
 * Controlled fallback policy for LanguageSphere Phase 5.
 *
 * Purpose:
 * - Prevent provider/runtime failures from crashing /api/chat.
 * - Preserve Marion final authority.
 * - Prevent debug leakage.
 * - Normalize safe fallback decisions for middleware.
 *
 * Rule:
 * Fallback policy may choose safe prepared text.
 * It does not create final visible answers.
 */

function sanitizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function sanitizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sanitizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function sanitizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeWhitespace(value = '') {
  return sanitizeString(value).replace(/\s+/g, ' ').trim();
}

function extractTextCandidate(value = {}) {
  if (typeof value === 'string') return value;

  const safeValue = sanitizeObject(value);

  return (
    sanitizeString(safeValue.text) ||
    sanitizeString(safeValue.userText) ||
    sanitizeString(safeValue.message) ||
    sanitizeString(safeValue.input) ||
    ''
  );
}

function extractEnvelopeText(envelope = {}) {
  const safeEnvelope = sanitizeObject(envelope);
  const text = sanitizeObject(safeEnvelope.text);

  return {
    marionInputText: sanitizeString(text.marionInputText),
    translatedText: sanitizeString(text.translatedText),
    normalizedText: sanitizeString(text.normalizedText),
    sourceText: sanitizeString(text.sourceText)
  };
}

function createFallbackDecision(payload = {}) {
  const safePayload = sanitizeObject(payload);

  const originalText = sanitizeString(safePayload.originalText);
  const normalizedText = sanitizeString(safePayload.normalizedText);
  const translatedText = sanitizeString(safePayload.translatedText);
  const marionInputText = sanitizeString(safePayload.marionInputText);

  let selectedText = '';
  let selectedSource = 'none';

  if (normalizeWhitespace(marionInputText)) {
    selectedText = marionInputText;
    selectedSource = 'marionInputText';
  } else if (normalizeWhitespace(translatedText)) {
    selectedText = translatedText;
    selectedSource = 'translatedText';
  } else if (normalizeWhitespace(normalizedText)) {
    selectedText = normalizedText;
    selectedSource = 'normalizedText';
  } else if (normalizeWhitespace(originalText)) {
    selectedText = originalText;
    selectedSource = 'originalText';
  }

  const blocked = !normalizeWhitespace(selectedText);

  return {
    module: 'LanguageSphereFallbackPolicy',
    status: blocked ? 'blocked' : 'ok',
    blocked,
    reason: sanitizeString(
      safePayload.reason,
      blocked ? 'empty-or-unsafe-input-blocked' : 'safe-fallback-selected'
    ),
    selectedText,
    selectedSource,
    fallbackApplied: sanitizeBoolean(safePayload.fallbackApplied, selectedSource !== 'marionInputText'),
    safeForMarion: !blocked,
    confidence: Math.max(0, Math.min(1, sanitizeNumber(safePayload.confidence, blocked ? 0 : 0.7))),
    warnings: sanitizeArray(safePayload.warnings),
    errors: sanitizeArray(safePayload.errors),
    safety: {
      debugLeakageBlocked: true,
      finalAnswerBlocked: true,
      authorityBypassBlocked: true,
      emptyInputBlocked: blocked,
      providerFailureGuardActive: true
    },
    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false
    }
  };
}

function resolveFallbackFromEnvelope(envelope = {}, originalPayload = {}, options = {}) {
  const safeEnvelope = sanitizeObject(envelope);
  const safePayload = sanitizeObject(originalPayload);
  const safeOptions = sanitizeObject(options);

  const envelopeText = extractEnvelopeText(safeEnvelope);
  const originalText = extractTextCandidate(safePayload);

  const diagnostics = sanitizeObject(safeEnvelope.diagnostics);
  const language = sanitizeObject(safeEnvelope.language);

  const warnings = [
    ...sanitizeArray(diagnostics.warnings),
    ...sanitizeArray(safeOptions.warnings)
  ];

  const errors = [
    ...sanitizeArray(diagnostics.errors),
    ...sanitizeArray(safeOptions.errors)
  ];

  const status = sanitizeString(safeEnvelope.status, 'unknown');

  if (status === 'empty') {
    return createFallbackDecision({
      originalText,
      ...envelopeText,
      reason: 'empty-envelope-blocked',
      fallbackApplied: true,
      confidence: 0,
      warnings,
      errors
    });
  }

  if (status === 'error') {
    return createFallbackDecision({
      originalText,
      ...envelopeText,
      reason: 'runtime-error-fallback-selected',
      fallbackApplied: true,
      confidence: 0.45,
      warnings,
      errors
    });
  }

  if (status === 'unsupported-language') {
    return createFallbackDecision({
      originalText,
      ...envelopeText,
      reason: 'unsupported-language-passthrough-selected',
      fallbackApplied: true,
      confidence: 0.5,
      warnings,
      errors
    });
  }

  return createFallbackDecision({
    originalText,
    ...envelopeText,
    reason: 'runtime-envelope-safe',
    fallbackApplied: Boolean(language.fallbackApplied),
    confidence: sanitizeNumber(language.confidence, 0.7),
    warnings,
    errors
  });
}

function resolveFallbackFromError(error, originalPayload = {}, options = {}) {
  const safeOptions = sanitizeObject(options);
  const originalText = extractTextCandidate(originalPayload);
  const normalizedText = normalizeWhitespace(originalText);

  const exposeInternalErrors = sanitizeBoolean(safeOptions.exposeInternalErrors, false);

  return createFallbackDecision({
    originalText,
    normalizedText,
    translatedText: normalizedText,
    marionInputText: normalizedText,
    reason: normalizeWhitespace(normalizedText)
      ? 'runtime-exception-original-text-selected'
      : 'runtime-exception-empty-input-blocked',
    fallbackApplied: true,
    confidence: normalizeWhitespace(normalizedText) ? 0.35 : 0,
    warnings: ['LanguageSphere runtime exception handled safely.'],
    errors: [
      exposeInternalErrors && error && error.message
        ? error.message
        : 'LanguageSphere failed safely.'
    ]
  });
}

function shouldBlockRequest(fallbackDecision = {}) {
  const decision = sanitizeObject(fallbackDecision);
  return Boolean(decision.blocked || !normalizeWhitespace(decision.selectedText));
}

function createSafeBlockedPayload(reason = 'blocked-by-fallback-policy', extra = {}) {
  const safeExtra = sanitizeObject(extra);

  return {
    ok: false,
    blocked: true,
    reason,
    text: '',
    userText: '',
    languageSphereApplied: false,
    languageSphereFailedSafe: true,
    diagnostics: {
      warnings: [
        'LanguageSphere fallback policy blocked unsafe/empty request.',
        ...sanitizeArray(safeExtra.warnings)
      ],
      errors: sanitizeArray(safeExtra.errors)
    },
    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false
    }
  };
}

module.exports = {
  createFallbackDecision,
  resolveFallbackFromEnvelope,
  resolveFallbackFromError,
  shouldBlockRequest,
  createSafeBlockedPayload,
  extractTextCandidate,
  extractEnvelopeText,
  normalizeWhitespace
};
