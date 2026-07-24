"use strict";

(function attachLingoSentinelWidgetIntegrationHook(globalScope) {
  const DEFAULT_TRANSLATION_ENDPOINT = "/api/lingosentinel/translate";
  const DEFAULT_TOKEN_ENDPOINT = "/api/lingosentinel/token";

  function cleanString(value) { return String(value == null ? "" : value).trim(); }
  function createRequestId(prefix) {
    const safe = cleanString(prefix || "ls_widget").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "ls_widget";
    return `${safe}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  function assertPublicEndpoint(endpoint, fallback) {
    const text = cleanString(endpoint || fallback);
    if (/\/internal\/lingosentinel\//i.test(text)) throw new Error("LINGOSENTINEL_WIDGET_INTERNAL_ROUTE_BLOCKED");
    return text || fallback;
  }
  function resolveBridge(options) {
    const opts = options && typeof options === "object" ? options : {};
    if (opts.bridge && typeof opts.bridge.translate === "function") return opts.bridge;
    const globalBridge = globalScope.LingoSentinelWidgetTranslationBridge;
    if (globalBridge && typeof globalBridge.createWidgetBridge === "function") return globalBridge.createWidgetBridge(opts);
    return globalBridge || null;
  }
  function normalizeInput(input) {
    const payload = input && typeof input === "object" ? input : { text: input };
    return {
      requestId: cleanString(payload.requestId || createRequestId("phase9_widget")),
      text: cleanString(payload.text || payload.message || payload.input || ""),
      source: cleanString(payload.source || payload.from || payload.sourceLanguage || "auto"),
      target: cleanString(payload.target || payload.to || payload.targetLanguage || "English"),
      roomId: cleanString(payload.roomId || "lingosentinel-main"),
      mode: cleanString(payload.mode || "group_room"),
      displayName: cleanString(payload.displayName || ""),
      preserve: Array.isArray(payload.preserve) ? payload.preserve : ["Marion", "LingoSentinel", "Sandblast"]
    };
  }
  function safeFailure(requestId, error) {
    return { requestId: cleanString(requestId), ok: false, error: cleanString(error || "LINGOSENTINEL_WIDGET_INTEGRATION_FAILED"), publicBoundary: true, internalRoutesExposed: false, tokensExposed: false, telemetryExposed: false };
  }
  async function translateWidgetText(input, options) {
    const opts = options && typeof options === "object" ? options : {};
    const payload = normalizeInput(input);
    const bridge = resolveBridge(opts);
    if (!payload.text) return safeFailure(payload.requestId, "EMPTY_WIDGET_INTEGRATION_TEXT");
    if (!bridge || typeof bridge.translate !== "function") return safeFailure(payload.requestId, "LINGOSENTINEL_WIDGET_BRIDGE_UNAVAILABLE");
    try {
      const result = await bridge.translate(payload, { endpoint: assertPublicEndpoint(opts.endpoint || DEFAULT_TRANSLATION_ENDPOINT, DEFAULT_TRANSLATION_ENDPOINT), requestId: payload.requestId });
      return result && result.ok === true ? result : safeFailure(result && result.requestId || payload.requestId, result && result.error || "LINGOSENTINEL_WIDGET_INTEGRATION_TRANSLATION_FAILED");
    } catch (error) { return safeFailure(payload.requestId, error && error.message || "LINGOSENTINEL_WIDGET_INTEGRATION_EXCEPTION"); }
  }
  function initializeIdentity(options) {
    const bridge = resolveBridge(options);
    return bridge && typeof bridge.getIdentity === "function" ? bridge.getIdentity(options) : null;
  }
  async function requestRealtimeToken(input, options) {
    const opts = options && typeof options === "object" ? options : {};
    const bridge = resolveBridge(opts);
    if (!bridge || typeof bridge.requestRealtimeToken !== "function") return safeFailure("", "LINGOSENTINEL_TOKEN_BRIDGE_UNAVAILABLE");
    try { return await bridge.requestRealtimeToken(input || {}, { ...opts, tokenEndpoint: assertPublicEndpoint(opts.tokenEndpoint || DEFAULT_TOKEN_ENDPOINT, DEFAULT_TOKEN_ENDPOINT) }); }
    catch (error) { return safeFailure("", error && error.message || "LINGOSENTINEL_TOKEN_INTEGRATION_EXCEPTION"); }
  }
  async function initializeRealtime(input, options) {
    const opts = options && typeof options === "object" ? options : {};
    const payload = normalizeInput(input || {});
    const bridge = resolveBridge(opts);
    if (!bridge || typeof bridge.connectRealtime !== "function") return safeFailure(payload.requestId, "LINGOSENTINEL_REALTIME_BRIDGE_UNAVAILABLE");
    try {
      const result = await bridge.connectRealtime({ roomId: payload.roomId, mode: payload.mode, displayName: payload.displayName }, opts);
      return result && result.ok === true ? result : safeFailure(payload.requestId, result && result.error || "LINGOSENTINEL_REALTIME_INITIALIZATION_FAILED");
    } catch (error) { return safeFailure(payload.requestId, error && error.message || "LINGOSENTINEL_REALTIME_INITIALIZATION_EXCEPTION"); }
  }
  function getRealtimeClient(options) {
    const bridge = resolveBridge(options);
    return bridge && typeof bridge.getRealtimeClient === "function" ? bridge.getRealtimeClient(options) : null;
  }
  function getApproxByteSize(value) {
    const text = String(value == null ? "" : value);
    return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(text).length : text.length;
  }
  const hook = Object.freeze({
    version: "lingosentinel.widgetIntegrationHook/9C-layers1-4",
    endpoint: DEFAULT_TRANSLATION_ENDPOINT,
    tokenEndpoint: DEFAULT_TOKEN_ENDPOINT,
    translateWidgetText,
    initializeIdentity,
    requestRealtimeToken,
    initializeRealtime,
    getRealtimeClient,
    normalizeInput,
    assertPublicEndpoint,
    createRequestId,
    getApproxByteSize
  });
  globalScope.LingoSentinelWidgetIntegrationHook = hook;
  if (typeof module !== "undefined" && module.exports) module.exports = hook;
})(typeof window !== "undefined" ? window : globalThis);
