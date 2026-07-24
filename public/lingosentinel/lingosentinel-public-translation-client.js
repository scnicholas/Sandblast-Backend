"use strict";

/**
 * public/lingosentinel/lingosentinel-public-translation-client.js
 * Layer 1-2 critical update:
 * - Preserves the existing public translation contract.
 * - Adds stable browser identity and per-tab session identity.
 * - Adds public Ably token acquisition through /api/lingosentinel/token.
 * - Never carries backend root keys or calls internal routes.
 */

(function attachLingoSentinelPublicTranslationClient(globalScope) {
  const DEFAULT_TRANSLATION_ENDPOINT = "/api/lingosentinel/translate";
  const DEFAULT_TOKEN_ENDPOINT = "/api/lingosentinel/token";
  const IDENTITY_STORAGE_KEY = "lingosentinel.clientIdentity.v1";
  const SESSION_STORAGE_KEY = "lingosentinel.sessionIdentity.v1";
  const DEFAULT_PRESERVE = Object.freeze(["Marion", "LingoSentinel", "Sandblast"]);
  let memoryIdentity = null;
  let memorySessionId = "";

  function cleanString(value) {
    return String(value == null ? "" : value).trim();
  }

  function safeStorage(kind) {
    try {
      const storage = globalScope && globalScope[kind];
      if (!storage) return null;
      const probe = "__ls_probe__";
      storage.setItem(probe, "1");
      storage.removeItem(probe);
      return storage;
    } catch (_) {
      return null;
    }
  }

  function randomToken(bytes) {
    try {
      const array = new Uint8Array(bytes || 12);
      globalScope.crypto.getRandomValues(array);
      return Array.from(array, function (item) { return item.toString(16).padStart(2, "0"); }).join("");
    } catch (_) {
      return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
  }

  function createRequestId(prefix) {
    const safePrefix = cleanString(prefix || "ls_frontend")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 32) || "ls_frontend";
    return `${safePrefix}_${Date.now()}_${randomToken(5).slice(0, 10)}`;
  }

  function createClientId() {
    return `lsu_${Date.now().toString(36)}_${randomToken(10)}`.slice(0, 80);
  }

  function createSessionId() {
    return `lss_${Date.now().toString(36)}_${randomToken(8)}`.slice(0, 80);
  }

  function sanitizeDisplayName(value, clientId) {
    const clean = cleanString(value).replace(/[<>\u0000-\u001f\u007f]/g, "").slice(0, 80);
    return clean || `Participant ${cleanString(clientId).slice(-6) || "Guest"}`;
  }

  function parseStoredIdentity(value) {
    try {
      const parsed = JSON.parse(String(value || ""));
      if (!parsed || typeof parsed !== "object") return null;
      const clientId = cleanString(parsed.clientId).replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 80);
      if (!clientId || clientId.length < 8 || /(?:^|[-_:])(marion|admin|root|system|operator)(?:$|[-_:])/i.test(clientId)) return null;
      return {
        contract: "lingosentinel.clientIdentity/1.0",
        clientId,
        displayName: sanitizeDisplayName(parsed.displayName, clientId),
        role: "participant",
        authenticated: parsed.authenticated === true,
        createdAt: cleanString(parsed.createdAt) || new Date().toISOString()
      };
    } catch (_) {
      return null;
    }
  }

  function getOrCreateIdentity(options) {
    const opts = options && typeof options === "object" ? options : {};
    const local = safeStorage("localStorage");
    let identity = memoryIdentity;

    if (!identity && local) identity = parseStoredIdentity(local.getItem(IDENTITY_STORAGE_KEY));
    if (!identity) {
      const clientId = createClientId();
      identity = {
        contract: "lingosentinel.clientIdentity/1.0",
        clientId,
        displayName: sanitizeDisplayName(opts.displayName, clientId),
        role: "participant",
        authenticated: false,
        createdAt: new Date().toISOString()
      };
    } else if (cleanString(opts.displayName)) {
      identity = { ...identity, displayName: sanitizeDisplayName(opts.displayName, identity.clientId) };
    }

    memoryIdentity = Object.freeze({ ...identity });
    try { if (local) local.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(memoryIdentity)); } catch (_) {}
    return memoryIdentity;
  }

  function getOrCreateSessionId() {
    if (memorySessionId) return memorySessionId;
    const session = safeStorage("sessionStorage");
    try { memorySessionId = cleanString(session && session.getItem(SESSION_STORAGE_KEY)); } catch (_) {}
    if (!memorySessionId) memorySessionId = createSessionId();
    try { if (session) session.setItem(SESSION_STORAGE_KEY, memorySessionId); } catch (_) {}
    return memorySessionId;
  }

  function clearIdentity() {
    memoryIdentity = null;
    memorySessionId = "";
    const local = safeStorage("localStorage");
    const session = safeStorage("sessionStorage");
    try { if (local) local.removeItem(IDENTITY_STORAGE_KEY); } catch (_) {}
    try { if (session) session.removeItem(SESSION_STORAGE_KEY); } catch (_) {}
    return true;
  }

  function normalizePreserve(value) {
    const supplied = Array.isArray(value) ? value : [];
    return Array.from(new Set(DEFAULT_PRESERVE.concat(supplied).map(cleanString).filter(Boolean))).slice(0, 25);
  }

  function assertPublicEndpoint(endpoint, fallback) {
    const text = cleanString(endpoint || fallback);
    if (/\/internal\/lingosentinel\//i.test(text)) throw new Error("LINGOSENTINEL_INTERNAL_ROUTE_BLOCKED");
    return text || fallback;
  }

  async function readJsonResponse(response) {
    try { return await response.json(); } catch (_) { return null; }
  }

  async function translate(input, options) {
    const opts = options && typeof options === "object" ? options : {};
    const payload = input && typeof input === "object" ? input : { text: input };
    const endpoint = assertPublicEndpoint(opts.endpoint || DEFAULT_TRANSLATION_ENDPOINT, DEFAULT_TRANSLATION_ENDPOINT);
    const requestId = cleanString(payload.requestId || opts.requestId || createRequestId("ls_translate"));
    const text = cleanString(payload.text || payload.message || payload.input || "");

    if (!text) {
      return { requestId, ok: false, error: "EMPTY_FRONTEND_TRANSLATION_TEXT", publicBoundary: true, internalRoutesExposed: false, tokensExposed: false, telemetryExposed: false };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-request-id": requestId },
      body: JSON.stringify({
        text,
        source: cleanString(payload.source || payload.from || payload.sourceLanguage || "auto"),
        target: cleanString(payload.target || payload.to || payload.targetLanguage || "English"),
        preserve: normalizePreserve(payload.preserve)
      }),
      credentials: "omit",
      cache: "no-store"
    });

    const data = await readJsonResponse(response);
    if (!data || typeof data !== "object") {
      return { requestId, ok: false, error: "LINGOSENTINEL_FRONTEND_BAD_RESPONSE", publicBoundary: true, internalRoutesExposed: false, tokensExposed: false, telemetryExposed: false };
    }
    if (data.ok !== true) {
      return { requestId: cleanString(data.requestId || requestId), ok: false, error: cleanString(data.error || "LINGOSENTINEL_TRANSLATION_FAILED"), publicBoundary: true, internalRoutesExposed: false, tokensExposed: false, telemetryExposed: false };
    }

    return {
      requestId: cleanString(data.requestId || requestId),
      ok: true,
      translatedText: cleanString(data.translatedText || ""),
      source: cleanString(data.source || ""),
      target: cleanString(data.target || ""),
      confidence: typeof data.confidence === "number" ? data.confidence : null,
      provider: cleanString(data.provider || "internal"),
      publicBoundary: true,
      internalRoutesExposed: false,
      tokensExposed: false,
      telemetryExposed: false
    };
  }

  async function requestRealtimeToken(input, options) {
    const opts = options && typeof options === "object" ? options : {};
    const payload = input && typeof input === "object" ? input : {};
    const endpoint = assertPublicEndpoint(opts.endpoint || DEFAULT_TOKEN_ENDPOINT, DEFAULT_TOKEN_ENDPOINT);
    const identity = getOrCreateIdentity({ displayName: payload.displayName || opts.displayName });
    const sessionId = getOrCreateSessionId();
    const requestId = cleanString(payload.requestId || opts.requestId || createRequestId("ls_token"));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-request-id": requestId },
      body: JSON.stringify({
        mode: cleanString(payload.mode || "group_room"),
        roomId: cleanString(payload.roomId || payload.channelId || payload.conversationId || "lingosentinel-main"),
        clientId: identity.clientId,
        displayName: identity.displayName,
        sessionId,
        ttlMs: Number(payload.ttlMs) > 0 ? Number(payload.ttlMs) : undefined,
        autoJoin: payload.autoJoin === true
      }),
      credentials: "omit",
      cache: "no-store"
    });

    const data = await readJsonResponse(response);
    if (!data || data.ok !== true || !data.tokenRequest) {
      return {
        requestId,
        ok: false,
        error: cleanString(data && ((data.errors && data.errors[0]) || data.error) || "LINGOSENTINEL_TOKEN_FAILED"),
        status: response.status,
        identity: { ...identity, sessionId },
        publicBoundary: true,
        rootKeyExposed: false
      };
    }

    return {
      requestId,
      ok: true,
      tokenRequest: data.tokenRequest,
      channel: cleanString(data.canonicalChannel || data.channel),
      mode: cleanString(data.mode || payload.mode),
      roomId: cleanString(data.roomId || payload.roomId),
      ttlMs: Number(data.ttlMs) || null,
      identity: data.identity && typeof data.identity === "object" ? data.identity : { ...identity, sessionId },
      policyVersion: cleanString(data.policyVersion),
      publicBoundary: true,
      rootKeyExposed: false,
      roomMembershipRequired: true
    };
  }

  const client = Object.freeze({
    version: "lingosentinel.frontendPublicClient/9A-layers1-4",
    endpoint: DEFAULT_TRANSLATION_ENDPOINT,
    translationEndpoint: DEFAULT_TRANSLATION_ENDPOINT,
    tokenEndpoint: DEFAULT_TOKEN_ENDPOINT,
    translate,
    requestRealtimeToken,
    getOrCreateIdentity,
    getOrCreateSessionId,
    clearIdentity,
    createRequestId,
    createClientId,
    normalizePreserve,
    assertPublicEndpoint
  });

  globalScope.LingoSentinelPublicTranslationClient = client;
  globalScope.LingoSentinelPublicClient = client;
  if (typeof module !== "undefined" && module.exports) module.exports = client;
})(typeof window !== "undefined" ? window : globalThis);
