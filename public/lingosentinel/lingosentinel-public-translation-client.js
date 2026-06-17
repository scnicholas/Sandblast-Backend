"use strict";

/**
 * public/lingosentinel/lingosentinel-public-translation-client.js
 *
 * Phase 6A:
 * Frontend-safe LingoSentinel translation client.
 *
 * Rules:
 * - Calls only /api/lingosentinel/translate.
 * - Never calls /internal/lingosentinel/*.
 * - Never carries internal backend tokens.
 * - Preserves frontend-safe requestId.
 * - Handles frontend-safe errors only.
 * - Nyx untouched.
 */

(function attachLingoSentinelPublicTranslationClient(globalScope) {
  const DEFAULT_ENDPOINT = "/api/lingosentinel/translate";

  const DEFAULT_PRESERVE = Object.freeze([
    "Marion",
    "LingoSentinel",
    "Sandblast"
  ]);

  function cleanString(value) {
    return String(value == null ? "" : value).trim();
  }

  function createRequestId(prefix) {
    const safePrefix = cleanString(prefix || "ls_frontend")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 32) || "ls_frontend";

    const randomPart = Math.random().toString(36).slice(2, 10);
    return `${safePrefix}_${Date.now()}_${randomPart}`;
  }

  function normalizePreserve(value) {
    const supplied = Array.isArray(value) ? value : [];

    return Array.from(
      new Set(
        DEFAULT_PRESERVE
          .concat(supplied)
          .map(cleanString)
          .filter(Boolean)
      )
    ).slice(0, 25);
  }

  function assertPublicEndpoint(endpoint) {
    const text = cleanString(endpoint || DEFAULT_ENDPOINT);

    if (/\/internal\/lingosentinel\//i.test(text)) {
      throw new Error("LINGOSENTINEL_INTERNAL_ROUTE_BLOCKED");
    }

    return text || DEFAULT_ENDPOINT;
  }

  async function translate(input, options) {
    const opts = options && typeof options === "object" ? options : {};
    const payload = input && typeof input === "object" ? input : { text: input };

    const endpoint = assertPublicEndpoint(opts.endpoint || DEFAULT_ENDPOINT);
    const requestId = cleanString(payload.requestId || opts.requestId || createRequestId("ls_translate"));

    const text = cleanString(payload.text || payload.message || payload.input || "");

    if (!text) {
      return {
        requestId,
        ok: false,
        error: "EMPTY_FRONTEND_TRANSLATION_TEXT",
        publicBoundary: true,
        internalRoutesExposed: false,
        tokensExposed: false,
        telemetryExposed: false
      };
    }

    const body = {
      text,
      source: cleanString(payload.source || payload.from || payload.sourceLanguage || "auto"),
      target: cleanString(payload.target || payload.to || payload.targetLanguage || "English"),
      preserve: normalizePreserve(payload.preserve)
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": requestId
      },
      body: JSON.stringify(body),
      credentials: "omit",
      cache: "no-store"
    });

    let data = null;

    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }

    if (!data || typeof data !== "object") {
      return {
        requestId,
        ok: false,
        error: "LINGOSENTINEL_FRONTEND_BAD_RESPONSE",
        publicBoundary: true,
        internalRoutesExposed: false,
        tokensExposed: false,
        telemetryExposed: false
      };
    }

    if (data.ok !== true) {
      return {
        requestId: cleanString(data.requestId || requestId),
        ok: false,
        error: cleanString(data.error || "LINGOSENTINEL_TRANSLATION_FAILED"),
        publicBoundary: true,
        internalRoutesExposed: false,
        tokensExposed: false,
        telemetryExposed: false
      };
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

  const client = Object.freeze({
    version: "lingosentinel.frontendPublicTranslationClient/6A",
    endpoint: DEFAULT_ENDPOINT,
    translate,
    createRequestId,
    normalizePreserve,
    assertPublicEndpoint
  });

  globalScope.LingoSentinelPublicTranslationClient = client;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = client;
  }
})(typeof window !== "undefined" ? window : globalThis);
