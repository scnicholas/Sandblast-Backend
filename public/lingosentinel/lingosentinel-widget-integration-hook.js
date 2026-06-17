"use strict";

(function attachLingoSentinelWidgetIntegrationHook(globalScope) {
  const DEFAULT_ENDPOINT = "/api/lingosentinel/translate";

  function cleanString(value) {
    return String(value == null ? "" : value).trim();
  }

  function createRequestId(prefix) {
    const safe = cleanString(prefix || "ls_widget")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 32) || "ls_widget";

    return `${safe}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function assertPublicEndpoint(endpoint) {
    const text = cleanString(endpoint || DEFAULT_ENDPOINT);

    if (/\/internal\/lingosentinel\//i.test(text)) {
      throw new Error("LINGOSENTINEL_PHASE7_INTERNAL_ROUTE_BLOCKED");
    }

    return text || DEFAULT_ENDPOINT;
  }

  function resolveBridge(options) {
    const opts = options && typeof options === "object" ? options : {};

    if (opts.bridge && typeof opts.bridge.translate === "function") {
      return opts.bridge;
    }

    if (
      globalScope.LingoSentinelWidgetTranslationBridge &&
      typeof globalScope.LingoSentinelWidgetTranslationBridge.createWidgetBridge === "function"
    ) {
      return globalScope.LingoSentinelWidgetTranslationBridge.createWidgetBridge(opts);
    }

    if (
      globalScope.LingoSentinelWidgetTranslationBridge &&
      typeof globalScope.LingoSentinelWidgetTranslationBridge.translateFromWidget === "function"
    ) {
      return {
        translate(input, callOptions) {
          return globalScope.LingoSentinelWidgetTranslationBridge.translateFromWidget(input, callOptions);
        }
      };
    }

    return null;
  }

  function normalizeInput(input) {
    const payload = input && typeof input === "object" ? input : { text: input };

    return {
      requestId: cleanString(payload.requestId || createRequestId("phase7_widget")),
      text: cleanString(payload.text || payload.message || payload.input || ""),
      source: cleanString(payload.source || payload.from || payload.sourceLanguage || "auto"),
      target: cleanString(payload.target || payload.to || payload.targetLanguage || "English"),
      preserve: Array.isArray(payload.preserve)
        ? payload.preserve
        : ["Marion", "LingoSentinel", "Sandblast"]
    };
  }

  function safeFailure(requestId, error) {
    return {
      requestId: cleanString(requestId),
      ok: false,
      error: cleanString(error || "LINGOSENTINEL_WIDGET_INTEGRATION_FAILED"),
      publicBoundary: true,
      internalRoutesExposed: false,
      tokensExposed: false,
      telemetryExposed: false
    };
  }

  async function translateWidgetText(input, options) {
    const opts = options && typeof options === "object" ? options : {};
    const payload = normalizeInput(input);
    const endpoint = assertPublicEndpoint(opts.endpoint || DEFAULT_ENDPOINT);
    const bridge = resolveBridge(opts);

    if (!payload.text) {
      return safeFailure(payload.requestId, "EMPTY_WIDGET_INTEGRATION_TEXT");
    }

    if (!bridge) {
      return safeFailure(payload.requestId, "LINGOSENTINEL_WIDGET_BRIDGE_UNAVAILABLE");
    }

    try {
      const result = await bridge.translate(payload, {
        endpoint,
        requestId: payload.requestId
      });

      if (!result || result.ok !== true) {
        return safeFailure(
          result && result.requestId ? result.requestId : payload.requestId,
          result && result.error ? result.error : "LINGOSENTINEL_WIDGET_INTEGRATION_TRANSLATION_FAILED"
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
        error && error.message ? error.message : "LINGOSENTINEL_WIDGET_INTEGRATION_EXCEPTION"
      );
    }
  }

  function getApproxByteSize(value) {
    const text = String(value == null ? "" : value);

    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(text).length;
    }

    return text.length;
  }

  const hook = Object.freeze({
    version: "lingosentinel.widgetIntegrationHook/7A",
    endpoint: DEFAULT_ENDPOINT,
    translateWidgetText,
    normalizeInput,
    assertPublicEndpoint,
    createRequestId,
    getApproxByteSize
  });

  globalScope.LingoSentinelWidgetIntegrationHook = hook;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = hook;
  }
})(typeof window !== "undefined" ? window : globalThis);
