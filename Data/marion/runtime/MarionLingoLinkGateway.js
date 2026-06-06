'use strict';

/**
 * MarionLingoLinkGateway
 *
 * Final gateway between Marion and LingoLink.
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

const LingoLinkRequestEnvelope = optionalRequire('../../lingolink/runtime/LingoLinkRequestEnvelope');
const LingoLinkCoreAdapter = optionalRequire('../../lingolink/runtime/LingoLinkCoreAdapter');

function normalizeText(value) {
  return String(value || '').trim();
}

function generateRequestId(prefix = 'marion_ll') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

function createFallbackGatewayResult(input = {}) {
  const requestId = input.requestId || generateRequestId('marion_ll_fallback');

  const telemetry = createTelemetryBundle([
    createHandoffFallback({
      requestId,
      route: input.route || ROUTES.LINGOLINK_FALLBACK,
      sourceLanguage: input.sourceLanguage || 'auto',
      targetLanguage: input.targetLanguage || 'en',
      confidence: 0,
      warnings: [input.reason || 'Gateway fallback used.']
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
    marionFinalAuthority: true,
    finalText: '',
    reason: input.reason || 'Gateway fallback used.',
    warnings: [input.reason || 'Gateway fallback used.'],
    telemetry
  };
}

async function runMarionLingoLinkGateway(input = {}, options = {}) {
  const startedAt = Date.now();
  const requestId = input.requestId || options.requestId || generateRequestId();
  const text = normalizeText(
    typeof input === 'string'
      ? input
      : input.text || input.message || input.query || input.userText
  );

  const telemetryEvents = [];

  if (!text) {
    return createFallbackGatewayResult({
      requestId,
      reason: 'MarionLingoLinkGateway received empty input.'
    });
  }

  const classification = classifyLanguageRoute(text, {
    sourceLanguage: input.sourceLanguage || options.sourceLanguage,
    targetLanguage: input.targetLanguage || options.targetLanguage,
    defaultTargetLanguage: options.defaultTargetLanguage || 'en'
  });

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
    const completed = createHandoffCompleted({
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
    });

    telemetryEvents.push(completed);

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
      marionFinalAuthority: true,
      reason: classification.reason,
      warnings: [],
      telemetry: createTelemetryBundle(telemetryEvents)
    };
  }

  if (!LingoLinkRequestEnvelope || !LingoLinkCoreAdapter) {
    telemetryEvents.push(createHandoffFallback({
      requestId,
      route: classification.route,
      sourceLanguage: classification.sourceLanguage,
      targetLanguage: classification.targetLanguage,
      confidence: 0,
      latencyMs: Date.now() - startedAt,
      warnings: ['LingoLink runtime files are unavailable.']
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
      marionFinalAuthority: true,
      reason: 'LingoLink runtime files are unavailable.',
      warnings: ['LingoLink runtime files are unavailable.'],
      telemetry: createTelemetryBundle(telemetryEvents)
    };
  }

  try {
    const requestEnvelope = LingoLinkRequestEnvelope.createLingoLinkRequestEnvelope({
      requestId,
      marionRequestId: requestId,
      text,
      sourceLanguage: classification.sourceLanguage,
      targetLanguage: classification.targetLanguage,
      mode: mapRouteToMode(classification.route),
      domain: input.domain || options.domain || 'general',
      route: classification.route,
      preserveTone: input.preserveTone !== false,
      preserveIntent: input.preserveIntent !== false,
      safetyContext: input.safetyContext || options.safetyContext || {},
      glossaryHints: input.glossaryHints || [],
      metadata: {
        classificationReason: classification.reason,
        userLocale: input.userLocale || options.userLocale || null
      }
    });

    const validation = LingoLinkRequestEnvelope.validateLingoLinkRequestEnvelope(requestEnvelope);

    if (!validation.ok) {
      telemetryEvents.push(createHandoffFallback({
        requestId,
        route: classification.route,
        sourceLanguage: classification.sourceLanguage,
        targetLanguage: classification.targetLanguage,
        confidence: 0,
        latencyMs: Date.now() - startedAt,
        warnings: validation.errors
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
        marionFinalAuthority: true,
        reason: 'Invalid LingoLink request envelope.',
        warnings: validation.errors,
        telemetry: createTelemetryBundle(telemetryEvents)
      };
    }

    const lingoLinkResponse = await LingoLinkCoreAdapter.processLingoLinkRequest(requestEnvelope);

    const authorityReview = reviewLingoLinkOutput({
      originalText: text,
      route: classification.route,
      responseEnvelope: lingoLinkResponse
    });

    telemetryEvents.push(createAuthorityReview({
      requestId,
      route: classification.route,
      sourceLanguage: lingoLinkResponse.sourceLanguage || classification.sourceLanguage,
      targetLanguage: lingoLinkResponse.targetLanguage || classification.targetLanguage,
      confidence: authorityReview.authorityConfidence,
      approvedByMarion: authorityReview.approved,
      fallbackUsed: lingoLinkResponse.fallbackUsed,
      warnings: authorityReview.warnings
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
        warnings: authorityReview.warnings
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
        lingoLinkResponse,
        authorityReview,
        finalText: '',
        marionFinalAuthority: true,
        reason: authorityReview.reason,
        warnings: authorityReview.warnings,
        telemetry: createTelemetryBundle(telemetryEvents)
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
      warnings: [
        ...(Array.isArray(lingoLinkResponse.warnings) ? lingoLinkResponse.warnings : []),
        ...(Array.isArray(authorityReview.warnings) ? authorityReview.warnings : [])
      ]
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
      warnings: [
        ...(Array.isArray(lingoLinkResponse.warnings) ? lingoLinkResponse.warnings : []),
        ...(Array.isArray(authorityReview.warnings) ? authorityReview.warnings : [])
      ],
      telemetry: createTelemetryBundle(telemetryEvents)
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
      marionFinalAuthority: true,
      reason: `MarionLingoLinkGateway failed: ${error.message}`,
      warnings: [`MarionLingoLinkGateway failed: ${error.message}`],
      telemetry: createTelemetryBundle(telemetryEvents)
    };
  }
}

module.exports = {
  runMarionLingoLinkGateway,
  createFallbackGatewayResult,
  mapRouteToMode
};
