"use strict";

/**
 * LingoSentinelTranslationProvider
 * Canonical provider boundary for spontaneous and contextual translation.
 *
 * Supports LibreTranslate/Argos-compatible endpoints, generic JSON providers,
 * and NLLB-style provider-code mapping through the language registry.
 * Provider endpoints, credentials, and raw provider payloads are never returned.
 */

const Registry = require("./LingoSentinelLanguageRegistry");

const VERSION = "2.2.1-provider-cohesion-hardened";
const DEFAULT_TIMEOUT_MS = clampTimeout(
  process.env.LINGOSENTINEL_TRANSLATE_TIMEOUT_MS ||
  process.env.LINGOSENTINEL_TRANSLATION_TIMEOUT_MS ||
  12000
);
const MAX_RESPONSE_BYTES = Math.max(
  4096,
  Math.min(2 * 1024 * 1024, Number(process.env.LINGOSENTINEL_TRANSLATE_MAX_RESPONSE_BYTES) || 1024 * 1024)
);

function safeString(value, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function clampTimeout(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 12000;
  return Math.max(1000, Math.min(30000, Math.floor(number)));
}

function providerKind(options = {}) {
  return safeString(
    options.provider ||
    process.env.LINGOSENTINEL_TRANSLATE_PROVIDER ||
    process.env.LINGOSENTINEL_PROVIDER_KIND ||
    "libretranslate-compatible"
  ).toLowerCase();
}

function normalizeEndpoint(value) {
  const raw = safeString(value).replace(/\/+$/, "");
  if (!raw) return "";

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    return "";
  }

  if (!/^https?:$/.test(parsed.protocol)) return "";
  return /\/(translate|api\/translate)$/i.test(parsed.pathname)
    ? raw
    : `${raw}/translate`;
}

function providerEndpoint(options = {}) {
  return normalizeEndpoint(
    options.endpoint ||
    process.env.LINGOSENTINEL_TRANSLATE_URL ||
    process.env.LINGOSENTINEL_PROVIDER_URL ||
    process.env.LINGOSENTINEL_TRANSLATION_URL ||
    process.env.LIBRETRANSLATE_URL ||
    process.env.ARGOS_TRANSLATE_URL ||
    process.env.ARGOS_TRANSLATE_ENDPOINT ||
    ""
  );
}

function providerApiKey(options = {}) {
  return safeString(
    options.apiKey ||
    process.env.LINGOSENTINEL_TRANSLATE_API_KEY ||
    process.env.LIBRETRANSLATE_API_KEY ||
    ""
  );
}

function providerBearer(options = {}) {
  return safeString(
    options.bearerToken ||
    process.env.LINGOSENTINEL_TRANSLATE_BEARER_TOKEN ||
    ""
  );
}

function isConfigured(options = {}) {
  return Boolean(providerEndpoint(options));
}

function createAbortSignal(timeoutMs) {
  if (typeof AbortController === "undefined") {
    return { signal: undefined, clear: () => {} };
  }

  const controller = new AbortController();
  let cleared = false;
  const timer = setTimeout(() => {
    try { controller.abort(); } catch (_) {}
  }, clampTimeout(timeoutMs || DEFAULT_TIMEOUT_MS));

  return {
    signal: controller.signal,
    clear: () => {
      if (cleared) return;
      cleared = true;
      clearTimeout(timer);
    }
  };
}

function pickTranslatedText(json = {}) {
  return safeString(
    json.translatedText ||
    json.translation ||
    json.targetText ||
    json.translated ||
    json.result ||
    json.output ||
    json.textTranslated ||
    (json.data && (
      json.data.translatedText ||
      json.data.translation ||
      json.data.targetText ||
      json.data.output
    )) ||
    (json.message && (
      json.message.translatedText ||
      json.message.translation
    )) ||
    ""
  );
}

function normalizeConfidence(value, fallback = 0.8) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function buildProviderPayload(input = {}, options = {}) {
  const kind = providerKind(options);
  const source = Registry.getProviderLanguageCode(input.sourceLanguage || "auto", kind);
  const target = Registry.getProviderLanguageCode(input.targetLanguage || "en", kind);
  const text = input.text;
  const instruction = input.instruction || "";
  const apiKey = providerApiKey(options);

  if (kind.includes("nllb")) {
    return {
      text,
      inputs: text,
      sourceLanguage: source,
      targetLanguage: target,
      source,
      target,
      src_lang: source,
      tgt_lang: target,
      context: input.contextSummary || "",
      instruction
    };
  }

  if (kind.includes("generic")) {
    const payload = {
      text,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      source,
      target,
      context: input.contextSummary || "",
      instruction
    };
    if (apiKey) payload.api_key = apiKey;
    return payload;
  }

  const payload = {
    q: text,
    source: source === "mixed" || source === "unknown" ? "auto" : source,
    target,
    format: "text"
  };
  if (apiKey) payload.api_key = apiKey;
  return payload;
}

async function translate(input = {}, options = {}) {
  const kind = providerKind(options);
  const text = safeString(input.text);
  const sourceLanguage = Registry.normalizeLanguageCode(
    input.sourceLanguage || input.source || "auto",
    "auto"
  );
  const targetLanguage = Registry.coerceTargetLanguage(
    input.targetLanguage || input.target || "en"
  );
  const pair = Registry.validateLanguagePair(sourceLanguage, targetLanguage, {
    provider: kind,
    allowAutoSource: true
  });

  if (!text) {
    return {
      ok: false,
      provider: "none",
      error: "empty_text",
      translatedText: "",
      sourceLanguage,
      targetLanguage,
      fallback: true
    };
  }

  if (!pair.target || !Registry.isSupportedLanguage(pair.target)) {
    return {
      ok: false,
      provider: kind,
      error: "unsupported_target_language",
      text,
      translatedText: text,
      sourceLanguage,
      targetLanguage,
      fallback: true
    };
  }

  if (sourceLanguage !== "auto" && sourceLanguage === targetLanguage) {
    return {
      ok: true,
      provider: "same-language-bypass",
      stage: "same_language_bypass",
      text,
      translatedText: text,
      sourceLanguage,
      detectedLanguage: sourceLanguage,
      targetLanguage,
      confidence: 1,
      fallback: false,
      providerSource: pair.providerSource,
      providerTarget: pair.providerTarget
    };
  }

  const endpoint = providerEndpoint(options);
  if (!endpoint) {
    return {
      ok: false,
      provider: "unconfigured",
      error: "translation_provider_unconfigured",
      text,
      translatedText: text,
      sourceLanguage,
      targetLanguage,
      fallback: true
    };
  }

  const fetchFn = typeof options.fetchFn === "function"
    ? options.fetchFn
    : typeof fetch === "function"
      ? fetch
      : null;

  if (!fetchFn) {
    return {
      ok: false,
      provider: "fetch-unavailable",
      error: "fetch_unavailable",
      text,
      translatedText: text,
      sourceLanguage,
      targetLanguage,
      fallback: true
    };
  }

  const timeout = createAbortSignal(
    options.timeoutMs ||
    process.env.LINGOSENTINEL_TRANSLATE_TIMEOUT_MS ||
    process.env.LINGOSENTINEL_TRANSLATION_TIMEOUT_MS ||
    DEFAULT_TIMEOUT_MS
  );

  try {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json"
    };
    const bearer = providerBearer(options);
    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    const response = await fetchFn(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(
        buildProviderPayload({ ...input, text, sourceLanguage, targetLanguage }, options)
      ),
      signal: timeout.signal
    });

    const declaredLength = Number(response && response.headers && response.headers.get
      ? response.headers.get("content-length")
      : 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      return {
        ok: false,
        provider: kind,
        error: "provider_response_too_large",
        text,
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        fallback: true
      };
    }

    const bodyText = response && typeof response.text === "function"
      ? await response.text()
      : "";

    if (Buffer.byteLength(bodyText || "", "utf8") > MAX_RESPONSE_BYTES) {
      return {
        ok: false,
        provider: kind,
        error: "provider_response_too_large",
        text,
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        fallback: true
      };
    }

    let json = {};
    try { json = bodyText ? JSON.parse(bodyText) : {}; } catch (_) { json = {}; }

    if (!response || !response.ok) {
      return {
        ok: false,
        provider: kind,
        error: `provider_http_${response && Number.isInteger(response.status) ? response.status : 502}`,
        text,
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        fallback: true
      };
    }

    const contentType = response.headers && response.headers.get
      ? safeString(response.headers.get("content-type")).toLowerCase()
      : "";
    const translatedText = pickTranslatedText(json) ||
      (contentType.startsWith("text/plain") ? safeString(bodyText) : "");

    if (!translatedText) {
      return {
        ok: false,
        provider: kind,
        error: "provider_translation_empty",
        text,
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        fallback: true
      };
    }

    return {
      ok: true,
      provider: kind,
      stage: "provider_translation",
      text,
      translatedText,
      sourceLanguage: Registry.normalizeLanguageCode(
        json.sourceLanguage || json.source || sourceLanguage,
        sourceLanguage
      ),
      detectedLanguage: Registry.normalizeLanguageCode(
        json.detectedLanguage || json.language || json.sourceLanguage || sourceLanguage,
        sourceLanguage
      ),
      targetLanguage: Registry.normalizeLanguageCode(
        json.targetLanguage || json.target || targetLanguage,
        targetLanguage
      ),
      confidence: normalizeConfidence(json.confidence, 0.8),
      fallback: false,
      providerSource: pair.providerSource,
      providerTarget: pair.providerTarget
    };
  } catch (error) {
    return {
      ok: false,
      provider: kind,
      error: error && error.name === "AbortError"
        ? "provider_timeout"
        : "provider_request_failed",
      text,
      translatedText: text,
      sourceLanguage,
      targetLanguage,
      fallback: true
    };
  } finally {
    timeout.clear();
  }
}

function health(options = {}) {
  const endpoint = providerEndpoint(options);
  return {
    ok: Boolean(endpoint),
    version: VERSION,
    provider: providerKind(options),
    status: endpoint ? "ready" : "degraded",
    endpointConfigured: Boolean(endpoint),
    providerEndpointExposed: false,
    apiKeyConfigured: Boolean(providerApiKey(options)),
    bearerConfigured: Boolean(providerBearer(options)),
    supportedLanguageCount: Registry.getSupportedLanguageCodes().length,
    timeoutMs: clampTimeout(options.timeoutMs || DEFAULT_TIMEOUT_MS),
    maxResponseBytes: MAX_RESPONSE_BYTES,
    diagnosticsRedacted: true
  };
}

module.exports = Object.freeze({
  VERSION,
  translate,
  health,
  getHealth: health,
  isConfigured,
  providerEndpoint,
  providerKind,
  buildProviderPayload
});
