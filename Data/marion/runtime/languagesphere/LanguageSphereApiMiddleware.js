'use strict';

/**
 * LanguageSphereApiMiddleware
 * ------------------------------------------------------------
 * Safe /api/chat preparation middleware for LanguageSphere Phase 5.
 *
 * Purpose:
 * - Run LanguageSphere before Marion receives user text.
 * - Apply fallback policy.
 * - Attach safe telemetry.
 * - Preserve request/session/inputSource metadata.
 * - Never bypass Marion or generate final visible output.
 */

const {
  runLanguageSphere
} = require('./LanguageSphereRuntime');

const {
  resolveFallbackFromEnvelope,
  resolveFallbackFromError,
  shouldBlockRequest,
  createSafeBlockedPayload,
  extractTextCandidate,
  normalizeWhitespace
} = require('./LanguageSphereFallbackPolicy');

const {
  createLanguageSphereTelemetry,
  summarizeTelemetry
} = require('./LanguageSphereTelemetry');

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

function createMiddlewareTraceId(prefix = 'lsm') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function normalizeInputSource(value = 'text') {
  const raw = sanitizeString(value, 'text').trim().toLowerCase();

  if (raw === 'voice') return 'mic';
  if (raw === 'microphone') return 'mic';
  if (raw === 'audio') return 'mic';
  if (raw === 'mic') return 'mic';
  if (raw === 'text') return 'text';

  return raw || 'text';
}

function extractRequestMetadata(payload = {}) {
  const safePayload = sanitizeObject(payload);

  return {
    requestId:
      sanitizeString(safePayload.requestId) ||
      sanitizeString(safePayload.reqId) ||
      createMiddlewareTraceId('req'),
    sessionId:
      sanitizeString(safePayload.sessionId) ||
      sanitizeString(safePayload.session_id) ||
      '',
    inputSource: normalizeInputSource(
      safePayload.inputSource ||
      safePayload.source ||
      safePayload.mode ||
      'text'
    ),
    targetLanguage:
      sanitizeString(safePayload.targetLanguage) ||
      sanitizeString(safePayload.targetLang) ||
      sanitizeString(safePayload.locale).split('-')[0] ||
      'en',
    locale:
      sanitizeString(safePayload.locale) ||
      sanitizeString(safePayload.targetLocale) ||
      ''
  };
}

function createPreparedMarionPayload(originalPayload = {}, envelope = {}, fallbackDecision = {}, telemetry = {}) {
  const safeOriginal = sanitizeObject(originalPayload);
  const metadata = extractRequestMetadata(safeOriginal);
  const selectedText = sanitizeString(fallbackDecision.selectedText);

  const language = sanitizeObject(envelope.language);

  return {
    ...safeOriginal,

    text: selectedText,
    userText: selectedText,
    message: selectedText,

    originalText: extractTextCandidate(safeOriginal),
    normalizedText: sanitizeString(envelope.text?.normalizedText),
    translatedText: sanitizeString(envelope.text?.translatedText),

    requestId: metadata.requestId,
    sessionId: metadata.sessionId,
    inputSource: metadata.inputSource,
    targetLanguage: metadata.targetLanguage,
    locale: metadata.locale,

    languageSphereApplied: true,
    languageSphereFailedSafe: Boolean(fallbackDecision.fallbackApplied),
    languageSphereBlocked: Boolean(fallbackDecision.blocked),

    languageContext: {
      sourceLanguage: sanitizeString(language.sourceLanguage, 'unknown'),
      targetLanguage: sanitizeString(language.targetLanguage, metadata.targetLanguage),
      confidence: typeof language.confidence === 'number' ? language.confidence : 0,
      translationRequired: Boolean(language.translationRequired),
      translationApplied: Boolean(language.translationApplied),
      fallbackApplied: Boolean(language.fallbackApplied || fallbackDecision.fallbackApplied)
    },

    languageSphere: envelope,
    languageSphereFallback: fallbackDecision,
    languageSphereTelemetry: telemetry,
    languageSphereTelemetrySummary: summarizeTelemetry(telemetry),

    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false,
      marionBypassBlocked: true
    }
  };
}

function createMiddlewareResult(payload = {}) {
  const safePayload = sanitizeObject(payload);

  return {
    ok: Boolean(safePayload.ok),
    blocked: Boolean(safePayload.blocked),
    reason: sanitizeString(safePayload.reason),
    marionPayload: sanitizeObject(safePayload.marionPayload),
    languageSphere: safePayload.languageSphere || null,
    fallbackDecision: safePayload.fallbackDecision || null,
    telemetry: safePayload.telemetry || null,
    diagnostics: {
      warnings: sanitizeArray(safePayload.warnings),
      errors: sanitizeArray(safePayload.errors)
    },
    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false
    }
  };
}

async function prepareLanguageSphereForApiChat(payload = {}, options = {}) {
  const safePayload = sanitizeObject(payload);
  const safeOptions = sanitizeObject(options);
  const metadata = extractRequestMetadata(safePayload);

  const originalText = extractTextCandidate(safePayload);

  if (!normalizeWhitespace(originalText)) {
    const blockedPayload = createSafeBlockedPayload('empty-api-chat-input-blocked', {
      warnings: ['API chat payload did not contain usable text.']
    });

    const telemetry = createLanguageSphereTelemetry({
      requestPayload: {
        ...safePayload,
        ...metadata
      },
      envelope: {},
      fallbackDecision: {
        blocked: true,
        reason: 'empty-api-chat-input-blocked',
        selectedSource: 'none',
        fallbackApplied: true,
        safeForMarion: false
      }
    });

    return createMiddlewareResult({
      ok: false,
      blocked: true,
      reason: 'empty-api-chat-input-blocked',
      marionPayload: {
        ...safePayload,
        ...blockedPayload,
        requestId: metadata.requestId,
        sessionId: metadata.sessionId,
        inputSource: metadata.inputSource,
        targetLanguage: metadata.targetLanguage,
        languageSphereTelemetry: telemetry,
        languageSphereTelemetrySummary: summarizeTelemetry(telemetry)
      },
      telemetry,
      warnings: blockedPayload.diagnostics.warnings
    });
  }

  try {
    const envelope = await runLanguageSphere(
      {
        ...safePayload,
        text: originalText,
        userText: originalText,
        targetLanguage: metadata.targetLanguage,
        locale: metadata.locale || metadata.targetLanguage,
        inputSource: metadata.inputSource,
        requestId: metadata.requestId,
        sessionId: metadata.sessionId
      },
      safeOptions
    );

    const fallbackDecision = resolveFallbackFromEnvelope(envelope, safePayload, safeOptions);

    const telemetry = createLanguageSphereTelemetry({
      requestPayload: {
        ...safePayload,
        ...metadata
      },
      envelope,
      fallbackDecision
    });

    if (shouldBlockRequest(fallbackDecision)) {
      return createMiddlewareResult({
        ok: false,
        blocked: true,
        reason: fallbackDecision.reason,
        marionPayload: {
          ...safePayload,
          text: '',
          userText: '',
          originalText,
          requestId: metadata.requestId,
          sessionId: metadata.sessionId,
          inputSource: metadata.inputSource,
          targetLanguage: metadata.targetLanguage,
          languageSphereApplied: false,
          languageSphereFailedSafe: true,
          languageSphereBlocked: true,
          languageSphere: envelope,
          languageSphereFallback: fallbackDecision,
          languageSphereTelemetry: telemetry,
          languageSphereTelemetrySummary: summarizeTelemetry(telemetry),
          authority: {
            finalAuthority: false,
            finalAuthorityOwner: 'Marion',
            mayBypassMarion: false,
            marionBypassBlocked: true
          }
        },
        languageSphere: envelope,
        fallbackDecision,
        telemetry,
        warnings: fallbackDecision.warnings,
        errors: fallbackDecision.errors
      });
    }

    const marionPayload = createPreparedMarionPayload(
      {
        ...safePayload,
        requestId: metadata.requestId,
        sessionId: metadata.sessionId,
        inputSource: metadata.inputSource,
        targetLanguage: metadata.targetLanguage,
        locale: metadata.locale
      },
      envelope,
      fallbackDecision,
      telemetry
    );

    return createMiddlewareResult({
      ok: true,
      blocked: false,
      reason: 'languagesphere-api-chat-prepared',
      marionPayload,
      languageSphere: envelope,
      fallbackDecision,
      telemetry,
      warnings: fallbackDecision.warnings,
      errors: fallbackDecision.errors
    });
  } catch (error) {
    const fallbackDecision = resolveFallbackFromError(error, safePayload, safeOptions);

    const telemetry = createLanguageSphereTelemetry({
      requestPayload: {
        ...safePayload,
        ...metadata
      },
      envelope: {},
      fallbackDecision
    });

    if (shouldBlockRequest(fallbackDecision)) {
      return createMiddlewareResult({
        ok: false,
        blocked: true,
        reason: fallbackDecision.reason,
        marionPayload: {
          ...safePayload,
          text: '',
          userText: '',
          originalText,
          requestId: metadata.requestId,
          sessionId: metadata.sessionId,
          inputSource: metadata.inputSource,
          targetLanguage: metadata.targetLanguage,
          languageSphereApplied: false,
          languageSphereFailedSafe: true,
          languageSphereBlocked: true,
          languageSphereFallback: fallbackDecision,
          languageSphereTelemetry: telemetry,
          languageSphereTelemetrySummary: summarizeTelemetry(telemetry),
          authority: {
            finalAuthority: false,
            finalAuthorityOwner: 'Marion',
            mayBypassMarion: false,
            marionBypassBlocked: true
          }
        },
        fallbackDecision,
        telemetry,
        warnings: fallbackDecision.warnings,
        errors: fallbackDecision.errors
      });
    }

    return createMiddlewareResult({
      ok: true,
      blocked: false,
      reason: 'languagesphere-api-chat-runtime-error-fallback',
      marionPayload: {
        ...safePayload,
        text: fallbackDecision.selectedText,
        userText: fallbackDecision.selectedText,
        message: fallbackDecision.selectedText,
        originalText,
        requestId: metadata.requestId,
        sessionId: metadata.sessionId,
        inputSource: metadata.inputSource,
        targetLanguage: metadata.targetLanguage,
        languageSphereApplied: false,
        languageSphereFailedSafe: true,
        languageSphereBlocked: false,
        languageSphereFallback: fallbackDecision,
        languageSphereTelemetry: telemetry,
        languageSphereTelemetrySummary: summarizeTelemetry(telemetry),
        authority: {
          finalAuthority: false,
          finalAuthorityOwner: 'Marion',
          mayBypassMarion: false,
          marionBypassBlocked: true
        }
      },
      fallbackDecision,
      telemetry,
      warnings: fallbackDecision.warnings,
      errors: fallbackDecision.errors
    });
  }
}

module.exports = {
  prepareLanguageSphereForApiChat,
  createPreparedMarionPayload,
  createMiddlewareResult,
  extractRequestMetadata,
  normalizeInputSource
};
