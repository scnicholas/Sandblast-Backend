'use strict';

/**
 * MarionLanguageSphereBridge
 * ------------------------------------------------------------
 * Bridge between incoming user input and Marion's reasoning path.
 *
 * Purpose:
 * - Run LanguageSphere before Marion receives text.
 * - Give Marion clean prepared input.
 * - Preserve original text, language metadata, and diagnostics.
 * - Prevent LanguageSphere from bypassing Marion.
 *
 * Critical flow:
 * user input
 * → LanguageSphere prepares/normalizes/translates if needed
 * → Authority guard validates envelope
 * → Final gate approves prepared input only
 * → Marion receives prepared text and metadata
 */

const {
  runLanguageSphere
} = require('./LanguageSphereRuntime');

const {
  enforceLanguageSphereAuthority,
  validateLanguageSphereAuthority
} = require('./LanguageSphereAuthorityGuard');

const {
  gateLanguageSphereForMarion,
  stripLanguageSphereFinalFields,
  assertMarionFinalAuthority
} = require('./LanguageSphereFinalGate');

function sanitizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function sanitizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function sanitizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractIncomingText(input = {}) {
  if (typeof input === 'string') return input;

  const safeInput = sanitizeObject(input);

  return (
    sanitizeString(safeInput.text) ||
    sanitizeString(safeInput.userText) ||
    sanitizeString(safeInput.message) ||
    sanitizeString(safeInput.input) ||
    ''
  );
}

function createBridgeTraceId(prefix = 'mlsb') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function createBridgeFailure(reason, input = {}, extra = {}) {
  const safeInput = sanitizeObject(input);
  const safeExtra = sanitizeObject(extra);

  return {
    ok: false,
    bridge: 'MarionLanguageSphereBridge',
    reason,
    preparedText: extractIncomingText(input).trim(),
    marionInput: {
      text: extractIncomingText(input).trim(),
      originalText: extractIncomingText(input),
      languageSphereApplied: false,
      languageSphereFailedSafe: true,
      finalAuthorityOwner: 'Marion'
    },
    languageSphere: safeExtra.languageSphere || null,
    diagnostics: {
      traceId: safeExtra.traceId || createBridgeTraceId(),
      warnings: [
        'LanguageSphere bridge failed safely; original text prepared for Marion.',
        reason,
        ...sanitizeArray(safeExtra.warnings)
      ],
      errors: sanitizeArray(safeExtra.errors)
    },
    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false,
      marionBypassBlocked: true
    }
  };
}

function createBridgeSuccess(input = {}, languageSphereEnvelope = {}, gateResult = {}, extra = {}) {
  const safeInput = sanitizeObject(input);
  const safeExtra = sanitizeObject(extra);
  const language = sanitizeObject(languageSphereEnvelope.language);
  const text = sanitizeObject(languageSphereEnvelope.text);

  const originalText = extractIncomingText(input);
  const preparedText = sanitizeString(gateResult.preparedInputText);

  return {
    ok: true,
    bridge: 'MarionLanguageSphereBridge',
    reason: 'languagesphere-prepared-marion-input',
    preparedText,
    marionInput: {
      ...safeInput,
      text: preparedText,
      userText: preparedText,
      originalText,
      languageSphereApplied: true,
      languageSphereFailedSafe: false,
      finalAuthorityOwner: 'Marion',
      languageContext: {
        sourceLanguage: sanitizeString(language.sourceLanguage, 'unknown'),
        targetLanguage: sanitizeString(language.targetLanguage, 'en'),
        confidence:
          typeof language.confidence === 'number' ? language.confidence : 0,
        translationRequired: Boolean(language.translationRequired),
        translationApplied: Boolean(language.translationApplied),
        fallbackApplied: Boolean(language.fallbackApplied)
      }
    },
    languageSphere: stripLanguageSphereFinalFields(languageSphereEnvelope),
    diagnostics: {
      traceId:
        safeExtra.traceId ||
        languageSphereEnvelope.diagnostics?.traceId ||
        createBridgeTraceId(),
      warnings: [
        ...sanitizeArray(languageSphereEnvelope.diagnostics?.warnings),
        ...sanitizeArray(gateResult.diagnostics?.warnings),
        ...sanitizeArray(safeExtra.warnings)
      ],
      errors: [
        ...sanitizeArray(languageSphereEnvelope.diagnostics?.errors),
        ...sanitizeArray(gateResult.diagnostics?.errors),
        ...sanitizeArray(safeExtra.errors)
      ]
    },
    authority: {
      finalAuthority: false,
      finalAuthorityOwner: 'Marion',
      mayBypassMarion: false,
      marionBypassBlocked: true
    },
    textSnapshot: {
      sourceText: sanitizeString(text.sourceText),
      normalizedText: sanitizeString(text.normalizedText),
      translatedText: sanitizeString(text.translatedText),
      marionInputText: sanitizeString(text.marionInputText)
    }
  };
}

async function prepareInputForMarion(input = {}, options = {}) {
  const traceId = createBridgeTraceId();
  const startedAt = Date.now();

  try {
    const originalText = extractIncomingText(input);

    if (!originalText || !originalText.trim()) {
      return createBridgeFailure('empty-input-before-languagesphere', input, {
        traceId,
        warnings: ['Empty user input blocked before Marion preparation.']
      });
    }

    const languageSphereEnvelope = await runLanguageSphere(input, options);

    const authorityValidation = validateLanguageSphereAuthority(languageSphereEnvelope);

    if (!authorityValidation.ok) {
      return createBridgeFailure(authorityValidation.reason, input, {
        traceId,
        languageSphere: languageSphereEnvelope,
        errors: [authorityValidation.reason]
      });
    }

    enforceLanguageSphereAuthority(languageSphereEnvelope);

    const gateResult = gateLanguageSphereForMarion(languageSphereEnvelope, {
      requirePreparedInput: true
    });

    if (!gateResult.ok) {
      return createBridgeFailure(gateResult.reason, input, {
        traceId,
        languageSphere: languageSphereEnvelope,
        warnings: sanitizeArray(gateResult.diagnostics?.warnings),
        errors: sanitizeArray(gateResult.diagnostics?.errors)
      });
    }

    return createBridgeSuccess(input, languageSphereEnvelope, gateResult, {
      traceId,
      warnings: [`LanguageSphere bridge latency: ${Date.now() - startedAt}ms`]
    });
  } catch (error) {
    return createBridgeFailure('languagesphere-bridge-runtime-error', input, {
      traceId,
      errors: [
        error && error.message
          ? error.message
          : 'LanguageSphere bridge runtime error.'
      ]
    });
  }
}

function mergePreparedInputIntoMarionPayload(originalPayload = {}, bridgeResult = {}) {
  const safePayload = sanitizeObject(originalPayload);
  const safeBridge = sanitizeObject(bridgeResult);

  if (!safeBridge.ok || !safeBridge.marionInput) {
    return {
      ...safePayload,
      text: extractIncomingText(safePayload),
      userText: extractIncomingText(safePayload),
      languageSphereApplied: false,
      languageSphereFailedSafe: true,
      finalAuthorityOwner: 'Marion'
    };
  }

  return {
    ...safePayload,
    ...safeBridge.marionInput,
    languageSphereBridge: {
      ok: safeBridge.ok,
      reason: safeBridge.reason,
      diagnostics: safeBridge.diagnostics,
      authority: safeBridge.authority
    },
    languageSphere: safeBridge.languageSphere
  };
}

function verifyMarionFinalAfterLanguageSphere(finalEnvelope = {}) {
  return assertMarionFinalAuthority(finalEnvelope);
}

module.exports = {
  prepareInputForMarion,
  mergePreparedInputIntoMarionPayload,
  verifyMarionFinalAfterLanguageSphere,
  extractIncomingText,
  createBridgeFailure,
  createBridgeSuccess
};