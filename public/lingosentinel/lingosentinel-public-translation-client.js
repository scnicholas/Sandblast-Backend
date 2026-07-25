"use strict";

(function attachLingoSentinelPublicTranslationClient(globalScope) {
  const VERSION = "lingosentinel.frontendPublicClient/12.1-provider-cohesion";
  const TRANSLATE = "/api/lingosentinel/translate";
  const TOKEN = "/api/lingosentinel/token";
  const IDENTITY_KEY = "lingosentinel.clientIdentity.v1";
  const SESSION_KEY = "lingosentinel.sessionIdentity.v1";
  const DEFAULT_TIMEOUT_MS = 15000;
  const DEFAULT_PRESERVE = Object.freeze(["Marion", "LingoSentinel", "Sandblast"]);
  const LANGUAGE_ALIASES = Object.freeze({
    auto: "auto", english: "en", eng: "en", en: "en",
    spanish: "es", espanol: "es", "español": "es", es: "es",
    french: "fr", francais: "fr", "français": "fr", fr: "fr",
    chinese: "zh", mandarin: "zh", zh: "zh",
    portuguese: "pt", portugues: "pt", "português": "pt", pt: "pt"
  });
  let memoryIdentity = null;
  let memorySessionId = "";

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function boundedText(value, max) { return String(value == null ? "" : value).replace(/\r\n?/g, "\n").slice(0, max || 4000); }
  function safeCode(value, fallback) {
    const raw = clean(value).toLowerCase().replace(/_/g, "-");
    const api = globalScope.LingoSentinelPublicLanguagePreferences;
    if (api && typeof api.normalizeLanguage === "function") {
      try { return api.normalizeLanguage(raw, fallback || "en"); } catch (_) {}
    }
    const base = LANGUAGE_ALIASES[raw] || raw.split("-")[0];
    return /^[a-z]{2,3}$/.test(base) || base === "auto" ? base : (fallback || "en");
  }
  function store(kind) {
    try {
      const value = globalScope && globalScope[kind];
      if (!value) return null;
      const probe = "__ls_probe__";
      value.setItem(probe, "1"); value.removeItem(probe);
      return value;
    } catch (_) { return null; }
  }
  function random(bytes) {
    try {
      const array = new Uint8Array(bytes || 12);
      globalScope.crypto.getRandomValues(array);
      return Array.from(array, function (value) { return value.toString(16).padStart(2, "0"); }).join("");
    } catch (_) { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  }
  function createRequestId(prefix) {
    const safePrefix = clean(prefix || "ls_frontend").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "ls_frontend";
    return safePrefix + "_" + Date.now() + "_" + random(5).slice(0, 10);
  }
  function createClientId() { return ("lsu_" + Date.now().toString(36) + "_" + random(10)).slice(0, 80); }
  function createSessionId() { return ("lss_" + Date.now().toString(36) + "_" + random(8)).slice(0, 80); }
  function displayName(value, id) {
    const normalized = clean(value).replace(/[<>\u0000-\u001f\u007f]/g, "").slice(0, 80);
    return normalized || "Participant " + (clean(id).slice(-6) || "Guest");
  }
  function parseIdentity(value) {
    try {
      const parsed = JSON.parse(String(value || ""));
      if (!parsed || typeof parsed !== "object") return null;
      const id = clean(parsed.clientId).replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 80);
      if (!id || id.length < 8 || /(?:^|[-_:])(marion|admin|root|system|operator)(?:$|[-_:])/i.test(id)) return null;
      return {
        contract: "lingosentinel.clientIdentity/1.0",
        clientId: id,
        displayName: displayName(parsed.displayName, id),
        role: "participant",
        authenticated: parsed.authenticated === true,
        createdAt: clean(parsed.createdAt) || new Date().toISOString()
      };
    } catch (_) { return null; }
  }
  function getOrCreateIdentity(options) {
    const opts = options && typeof options === "object" ? options : {};
    const local = store("localStorage");
    let identity = memoryIdentity;
    if (!identity && local) identity = parseIdentity(local.getItem(IDENTITY_KEY));
    if (!identity) {
      const clientId = createClientId();
      identity = {
        contract: "lingosentinel.clientIdentity/1.0",
        clientId,
        displayName: displayName(opts.displayName, clientId),
        role: "participant",
        authenticated: false,
        createdAt: new Date().toISOString()
      };
    } else if (clean(opts.displayName)) {
      identity = Object.assign({}, identity, { displayName: displayName(opts.displayName, identity.clientId) });
    }
    memoryIdentity = Object.freeze(Object.assign({}, identity));
    try { if (local) local.setItem(IDENTITY_KEY, JSON.stringify(memoryIdentity)); } catch (_) {}
    return memoryIdentity;
  }
  function getOrCreateSessionId() {
    if (memorySessionId) return memorySessionId;
    const session = store("sessionStorage");
    try { memorySessionId = clean(session && session.getItem(SESSION_KEY)); } catch (_) {}
    if (!memorySessionId) memorySessionId = createSessionId();
    try { if (session) session.setItem(SESSION_KEY, memorySessionId); } catch (_) {}
    return memorySessionId;
  }
  function clearIdentity() {
    memoryIdentity = null; memorySessionId = "";
    try { const local = store("localStorage"); if (local) local.removeItem(IDENTITY_KEY); } catch (_) {}
    try { const session = store("sessionStorage"); if (session) session.removeItem(SESSION_KEY); } catch (_) {}
    return true;
  }
  function preserve(values) {
    return Array.from(new Set(DEFAULT_PRESERVE.concat(Array.isArray(values) ? values : [])
      .map(function (value) { return clean(value).replace(/[<>\u0000-\u001f\u007f]/g, "").slice(0, 80); })
      .filter(Boolean))).slice(0, 25);
  }
  function endpoint(value, fallback) {
    const selected = clean(value || fallback);
    if (/\/internal\/lingosentinel\//i.test(selected)) throw new Error("LINGOSENTINEL_INTERNAL_ROUTE_BLOCKED");
    return selected || fallback;
  }
  async function readJson(response) { try { return await response.json(); } catch (_) { return null; } }
  function getPreferences(payload, options) {
    const api = globalScope.LingoSentinelPublicLanguagePreferences;
    const roomId = clean(payload.roomId || options.roomId);
    let stored = {};
    try { if (api && typeof api.get === "function") stored = api.get(roomId) || {}; } catch (_) {}
    const sourceLanguage = safeCode(payload.sourceLanguage || payload.source || payload.from || stored.sourceLanguage || "auto", "auto");
    const targetLanguage = safeCode(payload.targetLanguage || payload.target || payload.to || stored.targetLanguage || "en", "en");
    return {
      sourceLanguage,
      targetLanguage,
      locale: clean(payload.locale || stored.locale).slice(0, 24),
      formality: /^(neutral|formal|informal)$/.test(clean(payload.formality || stored.formality).toLowerCase()) ? clean(payload.formality || stored.formality).toLowerCase() : "neutral",
      preserve: preserve((Array.isArray(payload.preserve) ? payload.preserve : []).concat(stored.protectedTerms || []))
    };
  }
  function findPayload(data) {
    if (!data || typeof data !== "object") return {};
    const candidates = [data.translationResult, data.translation, data.result, data.data, data];
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      if (candidate && typeof candidate === "object" && (
        Object.prototype.hasOwnProperty.call(candidate, "translatedText") ||
        Object.prototype.hasOwnProperty.call(candidate, "fallback") ||
        Object.prototype.hasOwnProperty.call(candidate, "sourceLanguage") ||
        Object.prototype.hasOwnProperty.call(candidate, "targetLanguage")
      )) return candidate;
    }
    return data;
  }
  function normalizeProviderResult(data, response, context) {
    const payload = findPayload(data);
    const requestId = clean(payload.requestId || data && data.requestId || context.requestId);
    const sourceLanguage = safeCode(payload.sourceLanguage || payload.source || context.sourceLanguage, context.sourceLanguage || "auto");
    const targetLanguage = safeCode(payload.targetLanguage || payload.target || context.targetLanguage, context.targetLanguage || "en");
    const translatedText = boundedText(payload.translatedText || payload.translation || "", 4000);
    const originalText = boundedText(payload.originalText || payload.text || context.text, 4000);
    const error = clean(payload.error || data && data.error);
    const stage = clean(payload.stage || payload.status || data && data.stage || data && data.status).toLowerCase();
    const fallback = payload.fallback === true || /(?:fallback|failed|unavailable|original_only|reject)/.test(stage) || !!error;
    const sameLanguage = sourceLanguage === targetLanguage;
    const responseOk = !!(response && response.ok);
    const bodyOk = data && data.ok === false ? false : payload.ok === false ? false : true;
    const translated = sameLanguage
      ? responseOk && bodyOk && !error
      : responseOk && bodyOk && !fallback && !!translatedText;
    const confidenceNumber = Number(payload.confidence);
    const confidence = Number.isFinite(confidenceNumber) ? Math.max(0, Math.min(1, confidenceNumber)) : null;
    const status = sameLanguage && translated ? "bypassed" : translated ? (stage === "low_confidence" ? "low_confidence" : "translated") : (stage || "failed");
    return {
      requestId,
      ok: translated,
      translatedText: translated ? (translatedText || originalText) : "",
      originalText,
      sourceLanguage,
      targetLanguage,
      source: sourceLanguage,
      target: targetLanguage,
      confidence,
      provider: clean(payload.provider || data && data.provider || (sameLanguage ? "same-language-bypass" : "internal")).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40),
      status,
      stage,
      fallback,
      error: translated ? "" : (error || (response ? "LINGOSENTINEL_TRANSLATION_HTTP_" + response.status : "LINGOSENTINEL_TRANSLATION_FAILED")),
      httpStatus: response ? response.status : 0,
      roomId: clean(context.roomId).slice(0, 96),
      messageId: clean(context.messageId).slice(0, 96),
      retryable: !translated && (!response || [408, 425, 429, 500, 502, 503, 504].includes(response.status) || /(?:timeout|unavailable|provider|network|fetch)/i.test(error)),
      publicBoundary: true,
      internalRoutesExposed: false,
      tokensExposed: false,
      telemetryExposed: false
    };
  }
  function emitEvent(name, detail) {
    try {
      if (globalScope.dispatchEvent && typeof globalScope.CustomEvent === "function") {
        globalScope.dispatchEvent(new globalScope.CustomEvent(name, { detail }));
      }
    } catch (_) {}
  }
  function emitTranslationState(result) {
    emitEvent("lingosentinel:translation-state", Object.freeze({
      requestId: result.requestId,
      messageId: result.messageId || null,
      roomId: result.roomId || null,
      state: result.ok ? "translated" : "unavailable",
      status: result.status,
      retryable: result.retryable === true,
      at: new Date().toISOString()
    }));
    if (!result.messageId && !result.requestId) return;
    const identity = result.messageId || result.requestId;
    const status = result.ok ? (result.status === "low_confidence" ? "low_confidence" : "translated") : "failed";
    emitEvent("lingosentinel:translation-result", Object.freeze({
      contract: "lingosentinel.translationResult/1.0",
      version: 1,
      translationId: ("lst_direct_" + result.requestId).slice(0, 96),
      messageId: identity.slice(0, 96),
      requestId: result.requestId,
      roomId: result.roomId || "lingosentinel-main",
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
      originalText: result.originalText,
      translatedText: result.translatedText,
      status,
      confidence: result.confidence,
      provider: result.provider,
      createdAt: new Date().toISOString(),
      directResponse: true,
      retryable: result.retryable === true,
      errorCode: result.ok ? "" : result.error
    }));
  }
  async function translate(input, options) {
    const opts = options && typeof options === "object" ? options : {};
    const payload = input && typeof input === "object" ? input : { text: input };
    const url = endpoint(opts.endpoint || TRANSLATE, TRANSLATE);
    const requestId = clean(payload.requestId || opts.requestId || createRequestId("ls_translate"));
    const text = boundedText(payload.text || payload.message || payload.input, 4000).trim();
    if (!text) return { requestId, ok: false, error: "EMPTY_FRONTEND_TRANSLATION_TEXT", publicBoundary: true };
    const pref = getPreferences(payload, opts);
    const roomId = clean(payload.roomId || opts.roomId);
    const messageId = clean(payload.messageId || opts.messageId);
    const timeoutMs = Math.max(1000, Math.min(30000, Number(opts.timeoutMs) || DEFAULT_TIMEOUT_MS));
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
    const requestBody = {
      text,
      sourceLanguage: pref.sourceLanguage,
      targetLanguage: pref.targetLanguage,
      source: pref.sourceLanguage,
      target: pref.targetLanguage,
      locale: pref.locale,
      formality: pref.formality,
      preserve: pref.preserve,
      roomId,
      messageId,
      requestId
    };
    let result;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "x-request-id": requestId },
        body: JSON.stringify(requestBody),
        credentials: "omit",
        cache: "no-store",
        signal: controller && controller.signal
      });
      const data = await readJson(response);
      result = normalizeProviderResult(data, response, { requestId, text, sourceLanguage: pref.sourceLanguage, targetLanguage: pref.targetLanguage, roomId, messageId });
    } catch (error) {
      result = {
        requestId,
        ok: false,
        translatedText: "",
        originalText: text,
        sourceLanguage: pref.sourceLanguage,
        targetLanguage: pref.targetLanguage,
        source: pref.sourceLanguage,
        target: pref.targetLanguage,
        confidence: null,
        provider: "unavailable",
        status: "failed",
        stage: "request_failed",
        fallback: true,
        error: error && error.name === "AbortError" ? "LINGOSENTINEL_TRANSLATION_TIMEOUT" : "LINGOSENTINEL_TRANSLATION_NETWORK_FAILED",
        httpStatus: 0,
        roomId,
        messageId,
        retryable: true,
        publicBoundary: true,
        internalRoutesExposed: false,
        tokensExposed: false,
        telemetryExposed: false
      };
    } finally { if (timer) clearTimeout(timer); }
    emitTranslationState(result);
    return Object.freeze(result);
  }
  async function requestRealtimeToken(input, options) {
    const opts = options && typeof options === "object" ? options : {};
    const payload = input && typeof input === "object" ? input : {};
    const url = endpoint(opts.endpoint || TOKEN, TOKEN);
    const identity = getOrCreateIdentity({ displayName: payload.displayName || opts.displayName });
    const sessionId = getOrCreateSessionId();
    const requestId = clean(payload.requestId || opts.requestId || createRequestId("ls_token"));
    const credential = clean(payload.membershipCredential || opts.membershipCredential);
    const response = await fetch(url, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json", "x-request-id": requestId }, credential ? { "x-lingosentinel-membership": credential } : {}),
      body: JSON.stringify({
        mode: clean(payload.mode || "group_room"),
        roomId: clean(payload.roomId || payload.channelId || payload.conversationId || "lingosentinel-main"),
        clientId: identity.clientId,
        displayName: identity.displayName,
        sessionId,
        ttlMs: Number(payload.ttlMs) > 0 ? Number(payload.ttlMs) : undefined,
        autoJoin: payload.autoJoin === true
      }),
      credentials: "omit",
      cache: "no-store"
    });
    const data = await readJson(response);
    if (!data || data.ok !== true || !data.tokenRequest) {
      return {
        requestId,
        ok: false,
        error: clean(data && ((data.errors && data.errors[0] && (data.errors[0].code || data.errors[0])) || data.error) || "LINGOSENTINEL_TOKEN_FAILED"),
        status: response.status,
        identity: Object.assign({}, identity, { sessionId }),
        publicBoundary: true,
        rootKeyExposed: false
      };
    }
    return {
      requestId,
      ok: true,
      tokenRequest: data.tokenRequest,
      channel: clean(data.canonicalChannel || data.channel),
      clientStateChannel: clean(data.clientStateChannel),
      mode: clean(data.mode || payload.mode),
      roomId: clean(data.roomId || payload.roomId),
      ttlMs: Number(data.ttlMs) || null,
      identity: data.identity && typeof data.identity === "object" ? data.identity : Object.assign({}, identity, { sessionId }),
      policyVersion: clean(data.policyVersion),
      publicBoundary: true,
      rootKeyExposed: false,
      roomMembershipRequired: true
    };
  }
  async function requestMessageTranslation(messageId, options) {
    const client = globalScope.LingoSentinelPublicTranslationResultClient;
    if (client && typeof client.requestTranslation === "function") return client.requestTranslation(messageId, options);
    throw new Error("LINGOSENTINEL_TRANSLATION_RESULT_CLIENT_UNAVAILABLE");
  }

  const api = Object.freeze({
    version: VERSION,
    endpoint: TRANSLATE,
    translationEndpoint: TRANSLATE,
    tokenEndpoint: TOKEN,
    translate,
    requestRealtimeToken,
    requestMessageTranslation,
    getLanguagePreferences: function (roomId) {
      return globalScope.LingoSentinelPublicLanguagePreferences && globalScope.LingoSentinelPublicLanguagePreferences.get(roomId);
    },
    getOrCreateIdentity,
    getOrCreateSessionId,
    clearIdentity,
    createRequestId,
    createClientId,
    normalizePreserve: preserve,
    normalizeLanguage: safeCode,
    normalizeProviderResult,
    assertPublicEndpoint: endpoint
  });
  globalScope.LingoSentinelPublicTranslationClient = api;
  globalScope.LingoSentinelPublicClient = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
