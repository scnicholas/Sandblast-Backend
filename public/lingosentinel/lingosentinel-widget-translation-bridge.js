"use strict";

/**
 * public/lingosentinel/lingosentinel-widget-translation-bridge.js
 *
 * Phase 6B:
 * Widget/app integration bridge for LingoSentinel translation.
 *
 * Rules:
 * - Uses only the public translation client.
 * - Calls only /api/lingosentinel/translate.
 * - Blocks /internal/lingosentinel/*.
 * - Does not carry internal tokens.
 * - Does not expose telemetry.
 * - Nyx untouched.
 */

(function attachLingoSentinelWidgetTranslationBridge(globalScope) {
  const DEFAULT_ENDPOINT = "/api/lingosentinel/translate";
  const DEFAULT_SOURCE = "auto";
  const DEFAULT_TARGET = "English";

  function cleanString(value) {
    return String(value == null ? "" : value).trim();
  }

  function assertNoInternalEndpoint(endpoint) {
    const text = cleanString(endpoint || DEFAULT_ENDPOINT);

    if (/\/internal\/lingosentinel\//i.test(text)) {
      throw new Error("LINGOSENTINEL_WIDGET_INTERNAL_ROUTE_BLOCKED");
    }

    return text || DEFAULT_ENDPOINT;
  }

  function normalizeWidgetPayload(input) {
    const payload = input && typeof input === "object" ? input : { text: input };

    return {
      text: cleanString(payload.text || payload.message || payload.input || ""),
      source: cleanString(payload.source || payload.from || payload.sourceLanguage || DEFAULT_SOURCE),
      target: cleanString(payload.target || payload.to || payload.targetLanguage || DEFAULT_TARGET),
      preserve: Array.isArray(payload.preserve)
        ? payload.preserve
        : ["Marion", "LingoSentinel", "Sandblast"],
      requestId: cleanString(payload.requestId || "")
    };
  }

  function resolveClient(options) {
    const opts = options && typeof options === "object" ? options : {};

    if (opts.client && typeof opts.client.translate === "function") {
      return opts.client;
    }

    if (
      globalScope.LingoSentinelPublicTranslationClient &&
      typeof globalScope.LingoSentinelPublicTranslationClient.translate === "function"
    ) {
      return globalScope.LingoSentinelPublicTranslationClient;
    }

    try {
      if (typeof require === "function") {
        return require("./lingosentinel-public-translation-client.js");
      }
    } catch (_) {}

    return null;
  }

  function safeFailure(requestId, error) {
    return {
      requestId: cleanString(requestId),
      ok: false,
      error: cleanString(error || "LINGOSENTINEL_WIDGET_TRANSLATION_FAILED"),
      publicBoundary: true,
      internalRoutesExposed: false,
      tokensExposed: false,
      telemetryExposed: false
    };
  }

  async function translateFromWidget(input, options) {
    const opts = options && typeof options === "object" ? options : {};
    const payload = normalizeWidgetPayload(input);
    const client = resolveClient(opts);

    if (opts.endpoint) {
      assertNoInternalEndpoint(opts.endpoint);
    }

    if (!client) {
      return safeFailure(payload.requestId, "LINGOSENTINEL_PUBLIC_CLIENT_UNAVAILABLE");
    }

    if (!payload.text) {
      return safeFailure(payload.requestId, "EMPTY_WIDGET_TRANSLATION_TEXT");
    }

    try {
      const result = await client.translate(payload, {
        endpoint: assertNoInternalEndpoint(opts.endpoint || DEFAULT_ENDPOINT),
        requestId: payload.requestId || undefined
      });

      if (!result || result.ok !== true) {
        return safeFailure(
          result && result.requestId ? result.requestId : payload.requestId,
          result && result.error ? result.error : "LINGOSENTINEL_WIDGET_TRANSLATION_FAILED"
        );
      }

      return {
        requestId: cleanString(result.requestId || payload.requestId),
        ok: true,
        translatedText: cleanString(result.translatedText || ""),
        source: cleanString(result.source || ""),
        target: cleanString(result.target || ""),
        confidence: typeof result.confidence === "number" ? result.confidence : null,
        provider: cleanString(result.provider || "internal"),
        publicBoundary: true,
        internalRoutesExposed: false,
        tokensExposed: false,
        telemetryExposed: false
      };
    } catch (error) {
      return safeFailure(
        payload.requestId,
        error && error.message ? error.message : "LINGOSENTINEL_WIDGET_TRANSLATION_EXCEPTION"
      );
    }
  }

  function createWidgetBridge(options) {
    const baseOptions = options && typeof options === "object" ? options : {};

    return Object.freeze({
      version: "lingosentinel.widgetTranslationBridge/6B",
      translate(input, callOptions) {
        return translateFromWidget(input, {
          ...baseOptions,
          ...(callOptions && typeof callOptions === "object" ? callOptions : {})
        });
      },
      normalizeWidgetPayload,
      assertNoInternalEndpoint
    });
  }

  const bridge = Object.freeze({
    version: "lingosentinel.widgetTranslationBridge/6B",
    createWidgetBridge,
    translateFromWidget,
    normalizeWidgetPayload,
    assertNoInternalEndpoint
  });

  globalScope.LingoSentinelWidgetTranslationBridge = bridge;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = bridge;
  }
})(typeof window !== "undefined" ? window : globalThis);
