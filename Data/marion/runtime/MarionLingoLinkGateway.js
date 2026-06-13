'use strict';

/**
 * MarionLingoLinkGateway
 *
 * Final gateway between Marion and LingoLink.
 *
 * Current architecture note:
 * - LingoLink / LanguageSphere runtime files are expected to live in the
 *   Marion runtime folder beside this file.
 * - Do not require from ../../lingolink/runtime unless the project structure
 *   is intentionally changed later.
 *
 * Responsibilities:
 * - Classify whether multilingual routing is needed.
 * - Build a LingoLink request envelope.
 * - Call LingoLink.
 * - Run Marion authority review.
 * - Return a governed response object.
 *
 * Marion remains the final authority.
 */

const {
  ROUTES,
  classifyLanguageRoute
} = require('./MarionLanguageRouteClassifier');

const {
  reviewLingoLinkOutput
} = require('./MarionLingoLinkAuthorityGuard');

const {
  createHandoffStarted,
  createHandoffCompleted,
  createHandoffFallback,
  createAuthorityReview,
  createErrorEvent,
  createTelemetryBundle
} = require('./MarionLingoLinkTelemetry');

function optionalRequire(path) {
  try {
    return require(path);
  } catch (error) {
    return null;
  }
}

/**
 * LingoLink files currently live in Data/marion/runtime.
 * This is intentional. Keep these local requires unless the runtime structure changes.
 */
const LingoLinkRequestEnvelope = optionalRequire('./LingoLinkRequestEnvelope');
const LingoLinkCoreAdapter = optionalRequire('./LingoLinkCoreAdapter');

function normalizeText(value) {
  return String(value || '').trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asInputObject(input) {
  if (typeof input === 'string') {
    return { text: input };
  }

  return isObject(input) ? input : {};
}

function generateRequestId(prefix = 'marion_ll') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeWarnings(warnings) {
  const list = Array.isArray(warnings) ? warnings : [warnings];

  return Array.from(
    new Set(
      list
        .flat()
        .filter(Boolean)
        .map((warning) => String(warning).trim())
        .filter(Boolean)
    )
  );
}

function mergeWarnings(...warningLists) {
  return normalizeWarnings(warningLists.flat());
}

function safeTelemetryBundle(events) {
  try {
    return createTelemetryBundle(Array.isArray(events) ? events.filter(Boolean) : []);
  } catch (error) {
    return {
      ok: false,
      gateway: 'marion-lingolink',
      count: 0,
      events: [],
      error: `Telemetry bundle creation failed: ${error.message}`
    };
  }
}

function mapRouteToMode(route) {
  switch (route) {
    case ROUTES.LINGOLINK_ADAPT:
      return 'adapt';

    case ROUTES.LINGOLINK_LEARNING:
      return 'learn';

    case ROUTES.LINGOLINK_DETECT:
      return 'detect';

    case ROUTES.LINGOLINK_TRANSLATE:
    case ROUTES.LINGOLINK_UNKNOWN_LANGUAGE:
    default:
      return 'translate';
  }
}

function hasRequiredRuntime() {
  return Boolean(
    LingoLinkRequestEnvelope &&
    typeof LingoLinkRequestEnvelope.createLingoLinkRequestEnvelope === 'function' &&
    typeof LingoLinkRequestEnvelope.validateLingoLinkRequestEnvelope === 'function' &&
    LingoLinkCoreAdapter &&
    typeof LingoLinkCoreAdapter.processLingoLinkRequest === 'function'
  );
}

function createFallbackGatewayResult(input = {}) {
  const requestId = input.requestId || generateRequestId('marion_ll_fallback');
  const reason = input.reason || 'Gateway fallback used.';
  const warnings = mergeWarnings(input.warnings, reason);

  const telemetry = safeTelemetryBundle([
    createHandoffFallback({
      requestId,
      route: input.route || ROUTES.LINGOLINK_FALLBACK,
      sourceLanguage: input.sourceLanguage || 'auto',
      targetLanguage: input.targetLanguage || 'en',
      confidence: 0,
      fallbackUsed: true,
      warnings
    })
  ]);

  return {
    ok: false,
    gateway: 'marion-lingolink',
    requestId,
    routed: false,
    route: input.route || ROUTES.LINGOLINK_FALLBACK,
    sourceLanguage: input.sourceLanguage || 'auto',
    targetLanguage: input.targetLanguage || 'en',
    originalText: input.originalText || '',
    finalText: '',
    confidence: 0,
    marionFinalAuthority: true,
    reason,
    warnings,
    telemetry
  };
}

function createMarionOnlyResult({
  requestId,
  text,
  classification,
  telemetryEvents,
  startedAt
}) {
  telemetryEvents.push(createHandoffCompleted({
    requestId,
    route: ROUTES.MARION_ONLY,
    sourceLanguage: classification.sourceLanguage,
    targetLanguage: classification.targetLanguage,
    confidence: classification.confidence,
    approvedByMarion: true,
    latencyMs: Date.now() - startedAt,
    metadata: {
      reason: classification.reason
    }
  }));

  return {
    ok: true,
    gateway: 'marion-lingolink',
    requestId,
    routed: false,
    route: ROUTES.MARION_ONLY,
    sourceLanguage: classification.sourceLanguage,
    targetLanguage: classification.targetLanguage,
    originalText: text,
    finalText: text,
    confidence: classification.confidence,
    marionFinalAuthority: true,
    reason: classification.reason,
    warnings: [],
    telemetry: safeTelemetryBundle(telemetryEvents)
  };
}

function createUnavailableRuntimeResult({
  requestId,
  text,
  classification,
  telemetryEvents,
  startedAt
}) {
  const warnings = [
    'Language runtime is unavailable or missing required exports.',
    'Private delivery remains safe while the language runtime is unavailable.'
  ];

  telemetryEvents.push(createHandoffFallback({
    requestId,
    route: classification.route,
    sourceLanguage: classification.sourceLanguage,
    targetLanguage: classification.targetLanguage,
    confidence: 0,
    fallbackUsed: true,
    latencyMs: Date.now() - startedAt,
    warnings
  }));

  return {
    ok: false,
    gateway: 'marion-lingolink',
    requestId,
    routed: false,
    route: classification.route,
    sourceLanguage: classification.sourceLanguage,
    targetLanguage: classification.targetLanguage,
    originalText: text,
    finalText: '',
    confidence: 0,
    marionFinalAuthority: true,
    reason: 'Language runtime files are unavailable or incomplete.',
    warnings,
    telemetry: safeTelemetryBundle(telemetryEvents)
  };
}

function createInvalidEnvelopeResult({
  requestId,
  text,
  classification,
  validation,
  telemetryEvents,
  startedAt
}) {
  const warnings = mergeWarnings(validation && validation.errors);

  telemetryEvents.push(createHandoffFallback({
    requestId,
    route: classification.route,
    sourceLanguage: classification.sourceLanguage,
    targetLanguage: classification.targetLanguage,
    confidence: 0,
    fallbackUsed: true,
    latencyMs: Date.now() - startedAt,
    warnings
  }));

  return {
    ok: false,
    gateway: 'marion-lingolink',
    requestId,
    routed: false,
    route: classification.route,
    sourceLanguage: classification.sourceLanguage,
    targetLanguage: classification.targetLanguage,
    originalText: text,
    finalText: '',
    confidence: 0,
    marionFinalAuthority: true,
    reason: 'Invalid LingoLink request envelope.',
    warnings,
    telemetry: safeTelemetryBundle(telemetryEvents)
  };
}

function normalizeLingoLinkResponse(response, requestEnvelope) {
  if (response && typeof response === 'object') {
    return {
      ...response,
      warnings: normalizeWarnings(response.warnings)
    };
  }

  return {
    ok: false,
    gateway: 'marion-lingolink',
    requestId: requestEnvelope.requestId,
    detectedLanguage: requestEnvelope.sourceLanguage || 'auto',
    sourceLanguage: requestEnvelope.sourceLanguage || 'auto',
    targetLanguage: requestEnvelope.targetLanguage || 'en',
    mode: requestEnvelope.mode || 'translate',
    normalizedText: requestEnvelope.text || '',
    translatedText: '',
    adaptedText: '',
    finalText: '',
    confidence: 0,
    warnings: ['LingoLink returned an invalid or empty response envelope.'],
    fallbackUsed: true,
    requiresMarionReview: true,
    provider: 'invalid-lingolink-response'
  };
}

async function runMarionLingoLinkGateway(input = {}, options = {}) {
  const startedAt = Date.now();
  const safeInput = asInputObject(input);
  const safeOptions = asInputObject(options);

  const requestId =
    safeInput.requestId ||
    safeOptions.requestId ||
    safeInput.marionRequestId ||
    safeOptions.marionRequestId ||
    generateRequestId();

  const text = normalizeText(
    safeInput.text ||
    safeInput.message ||
    safeInput.query ||
    safeInput.userText ||
    safeInput.originalText
  );

  const telemetryEvents = [];

  if (!text) {
    return createFallbackGatewayResult({
      requestId,
      reason: 'MarionLingoLinkGateway received empty input.'
    });
  }

  let classification;

  try {
    classification = classifyLanguageRoute(text, {
      sourceLanguage: safeInput.sourceLanguage || safeOptions.sourceLanguage,
      targetLanguage: safeInput.targetLanguage || safeOptions.targetLanguage,
      defaultTargetLanguage: safeOptions.defaultTargetLanguage || 'en'
    });
  } catch (error) {
    return createFallbackGatewayResult({
      requestId,
      originalText: text,
      reason: `Language route classification failed: ${error.message}`,
      warnings: [`Language route classification failed: ${error.message}`]
    });
  }

  telemetryEvents.push(createHandoffStarted({
    requestId,
    route: classification.route,
    sourceLanguage: classification.sourceLanguage,
    targetLanguage: classification.targetLanguage,
    confidence: classification.confidence,
    metadata: {
      reason: classification.reason
    }
  }));

  if (!classification.requiresLingoLink || classification.route === ROUTES.MARION_ONLY) {
    return createMarionOnlyResult({
      requestId,
      text,
      classification,
      telemetryEvents,
      startedAt
    });
  }

  if (!hasRequiredRuntime()) {
    return createUnavailableRuntimeResult({
      requestId,
      text,
      classification,
      telemetryEvents,
      startedAt
    });
  }

  try {
    const requestEnvelope = LingoLinkRequestEnvelope.createLingoLinkRequestEnvelope({
      requestId,
      marionRequestId: requestId,
      text,
      sourceLanguage: classification.sourceLanguage || safeInput.sourceLanguage || 'auto',
      targetLanguage: classification.targetLanguage || safeInput.targetLanguage || safeOptions.defaultTargetLanguage || 'en',
      mode: mapRouteToMode(classification.route),
      domain: safeInput.domain || safeOptions.domain || 'general',
      route: classification.route,
      preserveTone: safeInput.preserveTone !== false,
      preserveIntent: safeInput.preserveIntent !== false,
      safetyContext: safeInput.safetyContext || safeOptions.safetyContext || {},
      glossaryHints: Array.isArray(safeInput.glossaryHints) ? safeInput.glossaryHints : [],
      metadata: {
        classificationReason: classification.reason,
        userLocale: safeInput.userLocale || safeOptions.userLocale || null,
        gatewayVersion: 'marion-runtime-local-v1'
      }
    });

    const validation = LingoLinkRequestEnvelope.validateLingoLinkRequestEnvelope(requestEnvelope);

    if (!validation || validation.ok !== true) {
      return createInvalidEnvelopeResult({
        requestId,
        text,
        classification,
        validation: validation || { errors: ['Envelope validation returned no result.'] },
        telemetryEvents,
        startedAt
      });
    }

    const rawLingoLinkResponse = await LingoLinkCoreAdapter.processLingoLinkRequest(requestEnvelope);
    const lingoLinkResponse = normalizeLingoLinkResponse(rawLingoLinkResponse, requestEnvelope);

    const authorityReview = reviewLingoLinkOutput({
      originalText: text,
      route: classification.route,
      responseEnvelope: lingoLinkResponse
    });

    const authorityWarnings = normalizeWarnings(authorityReview && authorityReview.warnings);
    const responseWarnings = normalizeWarnings(lingoLinkResponse.warnings);
    const allWarnings = mergeWarnings(responseWarnings, authorityWarnings);

    telemetryEvents.push(createAuthorityReview({
      requestId,
      route: classification.route,
      sourceLanguage: lingoLinkResponse.sourceLanguage || classification.sourceLanguage,
      targetLanguage: lingoLinkResponse.targetLanguage || classification.targetLanguage,
      confidence: authorityReview.authorityConfidence,
      approvedByMarion: authorityReview.approved,
      fallbackUsed: lingoLinkResponse.fallbackUsed,
      warnings: authorityWarnings
    }));

    if (!authorityReview.approved) {
      telemetryEvents.push(createHandoffFallback({
        requestId,
        route: classification.route,
        sourceLanguage: classification.sourceLanguage,
        targetLanguage: classification.targetLanguage,
        confidence: authorityReview.authorityConfidence,
        fallbackUsed: true,
        latencyMs: Date.now() - startedAt,
        warnings: allWarnings
      }));

      return {
        ok: false,
        gateway: 'marion-lingolink',
        requestId,
        routed: true,
        route: classification.route,
        sourceLanguage: classification.sourceLanguage,
        targetLanguage: classification.targetLanguage,
        originalText: text,
        finalText: '',
        confidence: authorityReview.authorityConfidence || 0,
        lingoLinkResponse,
        authorityReview,
        marionFinalAuthority: true,
        reason: authorityReview.reason || 'Marion authority guard rejected the LingoLink response.',
        warnings: allWarnings,
        telemetry: safeTelemetryBundle(telemetryEvents)
      };
    }

    telemetryEvents.push(createHandoffCompleted({
      requestId,
      route: classification.route,
      sourceLanguage: lingoLinkResponse.sourceLanguage || classification.sourceLanguage,
      targetLanguage: lingoLinkResponse.targetLanguage || classification.targetLanguage,
      confidence: lingoLinkResponse.confidence,
      approvedByMarion: true,
      fallbackUsed: lingoLinkResponse.fallbackUsed,
      latencyMs: Date.now() - startedAt,
      warnings: allWarnings
    }));

    return {
      ok: true,
      gateway: 'marion-lingolink',
      requestId,
      routed: true,
      route: classification.route,
      sourceLanguage: lingoLinkResponse.sourceLanguage || classification.sourceLanguage,
      targetLanguage: lingoLinkResponse.targetLanguage || classification.targetLanguage,
      originalText: text,
      finalText: authorityReview.finalText,
      confidence: lingoLinkResponse.confidence,
      lingoLinkResponse,
      authorityReview,
      marionFinalAuthority: true,
      reason: authorityReview.reason,
      warnings: allWarnings,
      telemetry: safeTelemetryBundle(telemetryEvents)
    };
  } catch (error) {
    telemetryEvents.push(createErrorEvent({
      requestId,
      route: classification.route,
      sourceLanguage: classification.sourceLanguage,
      targetLanguage: classification.targetLanguage,
      confidence: 0,
      fallbackUsed: true,
      latencyMs: Date.now() - startedAt,
      error: error.message
    }));

    return {
      ok: false,
      gateway: 'marion-lingolink',
      requestId,
      routed: false,
      route: classification.route,
      sourceLanguage: classification.sourceLanguage,
      targetLanguage: classification.targetLanguage,
      originalText: text,
      finalText: '',
      confidence: 0,
      marionFinalAuthority: true,
      reason: `MarionLingoLinkGateway failed: ${error.message}`,
      warnings: [`MarionLingoLinkGateway failed: ${error.message}`],
      telemetry: safeTelemetryBundle(telemetryEvents)
    };
  }
}


function createPrivateDeliveryGatewayResult(input = {}) {
  const data = asInputObject(input);
  const requestId = normalizeText(data.requestId) || generateRequestId('marion_ls_private');
  const text = normalizeText(data.text || data.message || data.prompt || '');
  const finalText = normalizeText(data.finalText || data.reply || data.response || '');
  return {
    ok: Boolean(finalText),
    gateway: 'marion-lingolink',
    requestId,
    routed: false,
    route: ROUTES.MARION_ONLY,
    sourceLanguage: normalizeText(data.sourceLanguage || 'auto'),
    targetLanguage: normalizeText(data.targetLanguage || 'en'),
    originalText: text,
    finalText,
    confidence: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : 1,
    marionFinalAuthority: true,
    privateDelivery: true,
    adminOnlyDelivery: true,
    publicSurface: 'Nyx',
    noRawAudioStored: true,
    reason: finalText ? 'Marion private delivery prepared.' : 'Marion private delivery did not include final text.',
    warnings: normalizeWarnings(data.warnings),
    telemetry: safeTelemetryBundle([
      createHandoffCompleted({
        requestId,
        route: ROUTES.MARION_ONLY,
        sourceLanguage: normalizeText(data.sourceLanguage || 'auto'),
        targetLanguage: normalizeText(data.targetLanguage || 'en'),
        confidence: 1,
        approvedByMarion: true,
        fallbackUsed: false,
        latencyMs: 0,
        metadata: { privateDelivery: true, adminOnlyDelivery: true }
      })
    ])
  };
}


module.exports = {
  runMarionLingoLinkGateway,
  createFallbackGatewayResult,
  mapRouteToMode,
  hasRequiredRuntime,
  normalizeLingoLinkResponse,
  createPrivateDeliveryGatewayResult
};
