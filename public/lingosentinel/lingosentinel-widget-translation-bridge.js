"use strict";

(function attachLingoSentinelWidgetTranslationBridge(globalScope) {
  const DEFAULT_TRANSLATION_ENDPOINT = "/api/lingosentinel/translate";
  const DEFAULT_TOKEN_ENDPOINT = "/api/lingosentinel/token";

  function cleanString(value) { return String(value == null ? "" : value).trim(); }
  function assertNoInternalEndpoint(endpoint, fallback) {
    const text = cleanString(endpoint || fallback);
    if (/\/internal\/lingosentinel\//i.test(text)) throw new Error("LINGOSENTINEL_WIDGET_INTERNAL_ROUTE_BLOCKED");
    return text || fallback;
  }
  function normalizeWidgetPayload(input) {
    const payload = input && typeof input === "object" ? input : { text: input };
    return {
      text: cleanString(payload.text || payload.message || payload.input || ""),
      source: cleanString(payload.source || payload.from || payload.sourceLanguage || "auto"),
      target: cleanString(payload.target || payload.to || payload.targetLanguage || "English"),
      preserve: Array.isArray(payload.preserve) ? payload.preserve : ["Marion", "LingoSentinel", "Sandblast"],
      requestId: cleanString(payload.requestId || "")
    };
  }
  function resolveClient(options) {
    const opts = options && typeof options === "object" ? options : {};
    if (opts.client && typeof opts.client.translate === "function") return opts.client;
    if (globalScope.LingoSentinelPublicClient && typeof globalScope.LingoSentinelPublicClient.translate === "function") return globalScope.LingoSentinelPublicClient;
    if (globalScope.LingoSentinelPublicTranslationClient && typeof globalScope.LingoSentinelPublicTranslationClient.translate === "function") return globalScope.LingoSentinelPublicTranslationClient;
    try { if (typeof require === "function") return require("./lingosentinel-public-translation-client.js"); } catch (_) {}
    return null;
  }
  function safeFailure(requestId, error) {
    return { requestId: cleanString(requestId), ok: false, error: cleanString(error || "LINGOSENTINEL_WIDGET_OPERATION_FAILED"), publicBoundary: true, internalRoutesExposed: false, tokensExposed: false, telemetryExposed: false };
  }
  async function translateFromWidget(input, options) {
    const opts = options && typeof options === "object" ? options : {};
    const payload = normalizeWidgetPayload(input);
    const client = resolveClient(opts);
    if (!client) return safeFailure(payload.requestId, "LINGOSENTINEL_PUBLIC_CLIENT_UNAVAILABLE");
    if (!payload.text) return safeFailure(payload.requestId, "EMPTY_WIDGET_TRANSLATION_TEXT");
    try {
      const result = await client.translate(payload, { endpoint: assertNoInternalEndpoint(opts.endpoint || DEFAULT_TRANSLATION_ENDPOINT, DEFAULT_TRANSLATION_ENDPOINT), requestId: payload.requestId || undefined });
      return result && result.ok === true ? result : safeFailure(result && result.requestId || payload.requestId, result && result.error || "LINGOSENTINEL_WIDGET_TRANSLATION_FAILED");
    } catch (error) { return safeFailure(payload.requestId, error && error.message || "LINGOSENTINEL_WIDGET_TRANSLATION_EXCEPTION"); }
  }
  function getIdentity(options) {
    const client = resolveClient(options);
    return client && typeof client.getOrCreateIdentity === "function" ? client.getOrCreateIdentity(options) : null;
  }
  async function requestRealtimeToken(input, options) {
    const opts = options && typeof options === "object" ? options : {};
    const client = resolveClient(opts);
    if (!client || typeof client.requestRealtimeToken !== "function") return safeFailure("", "LINGOSENTINEL_TOKEN_CLIENT_UNAVAILABLE");
    try { return await client.requestRealtimeToken(input, { ...opts, endpoint: assertNoInternalEndpoint(opts.tokenEndpoint || DEFAULT_TOKEN_ENDPOINT, DEFAULT_TOKEN_ENDPOINT) }); }
    catch (error) { return safeFailure("", error && error.message || "LINGOSENTINEL_TOKEN_EXCEPTION"); }
  }
  function createWidgetBridge(options) {
    const baseOptions = options && typeof options === "object" ? options : {};
    return Object.freeze({
      version: "lingosentinel.widgetTranslationBridge/8B-layer1-layer2",
      translate(input, callOptions) { return translateFromWidget(input, { ...baseOptions, ...(callOptions || {}) }); },
      requestRealtimeToken(input, callOptions) { return requestRealtimeToken(input, { ...baseOptions, ...(callOptions || {}) }); },
      getIdentity(callOptions) { return getIdentity({ ...baseOptions, ...(callOptions || {}) }); },
      normalizeWidgetPayload,
      assertNoInternalEndpoint
    });
  }
  const bridge = Object.freeze({
    version: "lingosentinel.widgetTranslationBridge/8B-layer1-layer2",
    createWidgetBridge,
    translateFromWidget,
    requestRealtimeToken,
    getIdentity,
    normalizeWidgetPayload,
    assertNoInternalEndpoint
  });
  globalScope.LingoSentinelWidgetTranslationBridge = bridge;
  if (typeof module !== "undefined" && module.exports) module.exports = bridge;
})(typeof window !== "undefined" ? window : globalThis);
