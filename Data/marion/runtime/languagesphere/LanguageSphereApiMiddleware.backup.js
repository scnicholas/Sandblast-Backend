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
 *
 * Critical rule:
 * This middleware prepares Marion-safe payloads only.
 * It does not create final visible answers and it cannot bypass Marion.
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

const LanguageSphereTelemetry = (() => {
  try {
    return require('./LanguageSphereTelemetry') || {};
  } catch (_) {
    return {};
  }
})();

function createFallbackLanguageSphereTelemetry(seed = {}) {
  const safeSeed = sanitizeObject(seed);
  const requestPayload = sanitizeObject(safeSeed.requestPayload);
  const envelope = sanitizeObject(safeSeed.envelope);
  const fallbackDecision = sanitizeObject(safeSeed.fallbackDecision);

  const telemetry = {
    ok: true,
    authority: 'marion',
    telemetryEnabled: true,
    source: 'languagesphere-api-middleware',
    requestId:
      sanitizeString(requestPayload.requestId) ||
      sanitizeString(requestPayload.reqId) ||
      createMiddlewareTraceId('ls_tel'),
    sessionId: sanitizeString(requestPayload.sessionId),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [],
    warnings: sanitizeArray(fallbackDecision.warnings),
    errors: sanitizeArray(fallbackDecision.errors),
    signals: {
      fallback_used: Boolean(fallbackDecision.fallbackApplied),
      blocked: Boolean(fallbackDecision.blocked),
      final_authority: 'marion',
      source_language:
        sanitizeString(envelope.language && envelope.language.sourceLanguage) ||
        sanitizeString(requestPayload.sourceLanguage) ||
        'unknown',
      target_language:
        sanitizeString(envelope.language && envelope.language.targetLanguage) ||
        sanitizeString(requestPayload.targetLanguage) ||
        'en'
    },

    record(event, payload = {}) {
      this.events.push({
        event: sanitizeString(event, 'event'),
        payload: sanitizeObject(payload),
        at: new Date().toISOString()
      });
      this.updatedAt = new Date().toISOString();
      return this;
    },

    warn(payload = {}) {
      this.warnings.push(sanitizeObject(payload));
      this.updatedAt = new Date().toISOString();
      return this;
    },

    error(payload = {}) {
      this.errors.push(sanitizeObject(payload));
      this.updatedAt = new Date().toISOString();
      return this;
    },

    toJSON() {
      return {
        ok: this.ok,
        authority: this.authority,
        telemetryEnabled: this.telemetryEnabled,
        source: this.source,
        requestId: this.requestId,
        sessionId: this.sessionId,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        events: sanitizeArray(this.events),
        warnings: sanitizeArray(this.warnings),
        errors: sanitizeArray(this.errors),
        signals: sanitizeObject(this.signals)
      };
    }
  };

  telemetry.record('languagesphere-api-middleware-prepared', {
    blocked: Boolean(fallbackDecision.blocked),
    fallbackApplied: Boolean(fallbackDecision.fallbackApplied)
  });

  return telemetry;
}

function summarizeFallbackTelemetry(telemetry = {}) {
  const safeTelemetry = sanitizeObject(
    typeof telemetry.toJSON === 'function' ? telemetry.toJSON() : telemetry
  );

  return {
    ok: safeTelemetry.ok !== false,
    authority: 'marion',
    telemetryEnabled: safeTelemetry.telemetryEnabled !== false,
    requestId: sanitizeString(safeTelemetry.requestId),
    events: sanitizeArray(safeTelemetry.events).length,
    warnings: sanitizeArray(safeTelemetry.warnings).length,
    errors: sanitizeArray(safeTelemetry.errors).length,
    fallbackUsed: Boolean(safeTelemetry.signals && safeTelemetry.signals.fallback_used),
    blocked: Boolean(safeTelemetry.signals && safeTelemetry.signals.blocked),
    finalAuthority: 'marion'
  };
}

const createLanguageSphereTelemetry =
  typeof LanguageSphereTelemetry.createLanguageSphereTelemetry === 'function'
    ? LanguageSphereTelemetry.createLanguageSphereTelemetry
    : createFallbackLanguageSphereTelemetry;

const summarizeTelemetry =
  typeof LanguageSphereTelemetry.summarizeTelemetry === 'function'
    ? LanguageSphereTelemetry.summarizeTelemetry
    : summarizeFallbackTelemetry;

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

function sanitizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
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
  if (raw === 'speech') return 'mic';
  if (raw === 'stt') return 'mic';
  if (raw === 'mic') return 'mic';
  if (raw === 'text') return 'text';

  return raw || 'text';
}

function normalizeTargetLanguage(payload = {}) {
  const safePayload = sanitizeObject(payload);

  const direct =
    sanitizeString(safePayload.targetLanguage) ||
    sanitizeString(safePayload.targetLang);

  if (direct.trim()) return direct.trim().split(/[-_]/)[0].toLowerCase();

  const locale =
    sanitizeString(safePayload.locale) ||
    sanitizeString(safePayload.targetLocale);

  if (locale.trim()) return locale.trim().split(/[-_]/)[0].toLowerCase();

  return 'en';
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
    targetLanguage: normalizeTargetLanguage(safePayload),
    locale:
      sanitizeString(safePayload.locale) ||
      sanitizeString(safePayload.targetLocale) ||
      ''
  };
}

function createAuthorityLock() {
  return {
    finalAuthority: false,
    finalAuthorityOwner: 'Marion',
    mayBypassMarion: false,
    marionBypassBlocked: true
  };
}

function createLanguageContext(envelope = {}, fallbackDecision = {}, targetLanguage = 'en') {
  const safeEnvelope = sanitizeObject(envelope);
  const language = sanitizeObject(safeEnvelope.language);

  return {
    sourceLanguage: sanitizeString(language.sourceLanguage, 'unknown'),
    targetLanguage: sanitizeString(language.targetLanguage, targetLanguage),
    confidence: typeof language.confidence === 'number' ? language.confidence : 0,
    translationRequired: Boolean(language.translationRequired),
    translationApplied: Boolean(language.translationApplied),
    fallbackApplied: Boolean(language.fallbackApplied || fallbackDecision.fallbackApplied)
  };
}

function createPreparedMarionPayload(originalPayload = {}, envelope = {}, fallbackDecision = {}, telemetry = {}) {
  const safeOriginal = sanitizeObject(originalPayload);
  const metadata = extractRequestMetadata(safeOriginal);
  const selectedText = sanitizeString(fallbackDecision.selectedText);
  const text = sanitizeObject(envelope.text);

  return {
    ...safeOriginal,

    text: selectedText,
    userText: selectedText,
    message: selectedText,

    originalText: extractTextCandidate(safeOriginal),
    normalizedText: sanitizeString(text.normalizedText),
    translatedText: sanitizeString(text.translatedText),

    requestId: metadata.requestId,
    sessionId: metadata.sessionId,
    inputSource: metadata.inputSource,
    targetLanguage: metadata.targetLanguage,
    locale: metadata.locale,

    languageSphereApplied: true,
    languageSphereFailedSafe: Boolean(fallbackDecision.fallbackApplied),
    languageSphereBlocked: Boolean(fallbackDecision.blocked),

    languageContext: createLanguageContext(envelope, fallbackDecision, metadata.targetLanguage),

    languageSphere: envelope,
    languageSphereFallback: fallbackDecision,
    languageSphereTelemetry: telemetry,
    languageSphereTelemetrySummary: summarizeTelemetry(telemetry),

    authority: createAuthorityLock()
  };
}

function createBlockedMarionPayload(originalPayload = {}, reason = 'blocked-by-languagesphere-api-middleware', extra = {}) {
  const safeOriginal = sanitizeObject(originalPayload);
  const safeExtra = sanitizeObject(extra);
  const metadata = extractRequestMetadata(safeOriginal);
  const originalText = extractTextCandidate(safeOriginal);

  const fallbackDecision = safeExtra.fallbackDecision || {
    blocked: true,
    reason,
    selectedText: '',
    selectedSource: 'none',
    fallbackApplied: true,
    safeForMarion: false,
    warnings: sanitizeArray(safeExtra.warnings),
    errors: sanitizeArray(safeExtra.errors),
    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false
    }
  };

  const telemetry =
    safeExtra.telemetry ||
    createLanguageSphereTelemetry({
      requestPayload: {
        ...safeOriginal,
        ...metadata
      },
      envelope: safeExtra.envelope || {},
      fallbackDecision
    });

  return {
    ...safeOriginal,

    text: '',
    userText: '',
    message: '',
    originalText,

    requestId: metadata.requestId,
    sessionId: metadata.sessionId,
    inputSource: metadata.inputSource,
    targetLanguage: metadata.targetLanguage,
    locale: metadata.locale,

    languageSphereApplied: false,
    languageSphereFailedSafe: true,
    languageSphereBlocked: true,

    languageContext: createLanguageContext(
      safeExtra.envelope || {},
      fallbackDecision,
      metadata.targetLanguage
    ),

    languageSphere: safeExtra.envelope || null,
    languageSphereFallback: fallbackDecision,
    languageSphereTelemetry: telemetry,
    languageSphereTelemetrySummary: summarizeTelemetry(telemetry),

    authority: createAuthorityLock()
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

    const fallbackDecision = {
      blocked: true,
      reason: 'empty-api-chat-input-blocked',
      selectedText: '',
      selectedSource: 'none',
      fallbackApplied: true,
      safeForMarion: false,
      warnings: sanitizeArray(blockedPayload.diagnostics && blockedPayload.diagnostics.warnings),
      errors: sanitizeArray(blockedPayload.diagnostics && blockedPayload.diagnostics.errors),
      safety: {
        debugLeakageBlocked: true,
        finalAnswerBlocked: true,
        authorityBypassBlocked: true,
        emptyInputBlocked: true,
        providerFailureGuardActive: true
      },
      authority: {
        finalAuthority: false,
        finalAuthorityOwner: 'Marion',
        mayBypassMarion: false
      }
    };

    const telemetry = createLanguageSphereTelemetry({
      requestPayload: {
        ...safePayload,
        ...metadata
      },
      envelope: {},
      fallbackDecision
    });

    const marionPayload = createBlockedMarionPayload(
      {
        ...safePayload,
        requestId: metadata.requestId,
        sessionId: metadata.sessionId,
        inputSource: metadata.inputSource,
        targetLanguage: metadata.targetLanguage,
        locale: metadata.locale
      },
      'empty-api-chat-input-blocked',
      {
        fallbackDecision,
        telemetry,
        warnings: fallbackDecision.warnings,
        errors: fallbackDecision.errors
      }
    );

    return createMiddlewareResult({
      ok: false,
      blocked: true,
      reason: 'empty-api-chat-input-blocked',
      marionPayload,
      fallbackDecision,
      telemetry,
      warnings: fallbackDecision.warnings,
      errors: fallbackDecision.errors
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
      const marionPayload = createBlockedMarionPayload(
        {
          ...safePayload,
          requestId: metadata.requestId,
          sessionId: metadata.sessionId,
          inputSource: metadata.inputSource,
          targetLanguage: metadata.targetLanguage,
          locale: metadata.locale
        },
        fallbackDecision.reason,
        {
          envelope,
          fallbackDecision,
          telemetry,
          warnings: fallbackDecision.warnings,
          errors: fallbackDecision.errors
        }
      );

      return createMiddlewareResult({
        ok: false,
        blocked: true,
        reason: fallbackDecision.reason,
        marionPayload,
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
      const marionPayload = createBlockedMarionPayload(
        {
          ...safePayload,
          requestId: metadata.requestId,
          sessionId: metadata.sessionId,
          inputSource: metadata.inputSource,
          targetLanguage: metadata.targetLanguage,
          locale: metadata.locale
        },
        fallbackDecision.reason,
        {
          fallbackDecision,
          telemetry,
          warnings: fallbackDecision.warnings,
          errors: fallbackDecision.errors
        }
      );

      return createMiddlewareResult({
        ok: false,
        blocked: true,
        reason: fallbackDecision.reason,
        marionPayload,
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
        locale: metadata.locale,
        languageSphereApplied: false,
        languageSphereFailedSafe: true,
        languageSphereBlocked: false,
        languageContext: createLanguageContext({}, fallbackDecision, metadata.targetLanguage),
        languageSphereFallback: fallbackDecision,
        languageSphereTelemetry: telemetry,
        languageSphereTelemetrySummary: summarizeTelemetry(telemetry),
        authority: createAuthorityLock()
      },
      fallbackDecision,
      telemetry,
      warnings: fallbackDecision.warnings,
      errors: fallbackDecision.errors
    });
  }
}

function assertMiddlewareAuthority(result = {}) {
  const safeResult = sanitizeObject(result);
  const marionPayload = sanitizeObject(safeResult.marionPayload);
  const authority = sanitizeObject(marionPayload.authority);

  return Boolean(
    authority.finalAuthority === false &&
    authority.finalAuthorityOwner === 'Marion' &&
    authority.mayBypassMarion === false
  );
}

function isPreparedForMarion(result = {}) {
  const safeResult = sanitizeObject(result);
  const marionPayload = sanitizeObject(safeResult.marionPayload);

  return Boolean(
    safeResult.ok === true &&
    safeResult.blocked === false &&
    normalizeWhitespace(marionPayload.text) &&
    assertMiddlewareAuthority(safeResult)
  );
}

module.exports = {
  prepareLanguageSphereForApiChat,
  createPreparedMarionPayload,
  createBlockedMarionPayload,
  createMiddlewareResult,
  extractRequestMetadata,
  normalizeInputSource,
  normalizeTargetLanguage,
  createAuthorityLock,
  createLanguageContext,
  assertMiddlewareAuthority,
  isPreparedForMarion
};
