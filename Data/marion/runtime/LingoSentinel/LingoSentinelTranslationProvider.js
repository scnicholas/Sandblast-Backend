"use strict";

/**
 * LingoSentinelTranslationProvider
 * Canonical provider boundary for spontaneous and contextual translation.
 *
 * Supports LibreTranslate/Argos-compatible endpoints, generic JSON providers,
 * and NLLB-style provider-code mapping through the language registry.
 * Provider endpoints, credentials, request text, and raw provider payloads are
 * never returned or written to diagnostics.
 */

const Registry = require("./LingoSentinelLanguageRegistry");

const VERSION = "2.2.2-provider-routing-diagnostics-hardened";
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 120000;
const DEFAULT_TIMEOUT_MS = clampTimeout(
  process.env.LINGOSENTINEL_TRANSLATE_TIMEOUT_MS ||
  process.env.LINGOSENTINEL_TRANSLATION_TIMEOUT_MS ||
  30000
);
const DEFAULT_MAX_ATTEMPTS = clampAttempts(
  process.env.LINGOSENTINEL_TRANSLATE_MAX_ATTEMPTS || 2
);
const DEFAULT_RETRY_DELAY_MS = clampRetryDelay(
  process.env.LINGOSENTINEL_TRANSLATE_RETRY_DELAY_MS || 750
);
const MAX_RESPONSE_BYTES = Math.max(
  4096,
  Math.min(
    2 * 1024 * 1024,
    Number(process.env.LINGOSENTINEL_TRANSLATE_MAX_RESPONSE_BYTES) ||
      1024 * 1024
  )
);

const ENDPOINT_ENV_KEYS = Object.freeze([
  "ARGOS_TRANSLATE_ENDPOINT",
  "LIBRETRANSLATE_URL",
  "ARGOS_TRANSLATE_URL",
  "LINGOSENTINEL_TRANSLATE_URL",
  "LINGOSENTINEL_PROVIDER_URL",
  "LINGOSENTINEL_TRANSLATION_URL"
]);

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function safeString(value, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = safeString(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function clampTimeout(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 30000;
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(number)));
}

function clampAttempts(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 2;
  return Math.max(1, Math.min(3, Math.floor(number)));
}

function clampRetryDelay(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 750;
  return Math.max(0, Math.min(5000, Math.floor(number)));
}

function providerKind(options = {}) {
  return safeString(
    options.provider ||
      process.env.LINGOSENTINEL_TRANSLATE_PROVIDER ||
      process.env.LINGOSENTINEL_PROVIDER_KIND ||
      "libretranslate-compatible"
  ).toLowerCase();
}

function normalizeEndpointCandidate(value) {
  const raw = safeString(value).replace(/\/+$/, "");
  if (!raw) {
    return {
      endpoint: "",
      error: "",
      pathClass: "empty"
    };
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    return {
      endpoint: "",
      error: "translation_provider_endpoint_invalid",
      pathClass: "invalid_url"
    };
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    return {
      endpoint: "",
      error: "translation_provider_endpoint_invalid",
      pathClass: "invalid_protocol"
    };
  }

  const cleanPath = parsed.pathname.replace(/\/+$/, "") || "/";
  const lowerPath = cleanPath.toLowerCase();

  // A provider must never point back to the public LingoSentinel route. Doing
  // so produces the Nyx not-found envelope instead of a translation response.
  if (
    /(^|\/)(api\/)?lingosentinel(\/translate)?$/.test(
      lowerPath.replace(/^\/+/, "")
    ) ||
    lowerPath.includes("/api/lingosentinel/") ||
    lowerPath.includes("/lingosentinel/")
  ) {
    return {
      endpoint: "",
      error: "translation_provider_endpoint_misdirected",
      pathClass: "lingosentinel_route"
    };
  }

  if (/\/languages$/i.test(cleanPath)) {
    parsed.pathname = cleanPath.replace(/\/languages$/i, "/translate");
  } else if (!/\/(translate|api\/translate)$/i.test(cleanPath)) {
    parsed.pathname = `${cleanPath === "/" ? "" : cleanPath}/translate`;
  }

  parsed.hash = "";
  return {
    endpoint: parsed.toString().replace(/\/+$/, ""),
    error: "",
    pathClass: /\/api\/translate$/i.test(parsed.pathname)
      ? "api_translate"
      : "translate"
  };
}

function resolveEndpoint(options = {}) {
  const candidates = [];

  if (safeString(options.endpoint)) {
    candidates.push({
      source: "options.endpoint",
      raw: options.endpoint
    });
  }

  for (const key of ENDPOINT_ENV_KEYS) {
    if (safeString(process.env[key])) {
      candidates.push({
        source: key,
        raw: process.env[key]
      });
    }
  }

  if (!candidates.length) {
    return {
      endpoint: "",
      source: "",
      error: "translation_provider_unconfigured",
      conflictDetected: false,
      configuredAliasCount: 0,
      pathClass: "empty"
    };
  }

  const normalized = candidates.map(candidate => ({
    ...candidate,
    ...normalizeEndpointCandidate(candidate.raw)
  }));

  const invalid = normalized.find(item => item.error);
  if (invalid) {
    return {
      endpoint: "",
      source: invalid.source,
      error: invalid.error,
      conflictDetected: false,
      configuredAliasCount: candidates.length,
      pathClass: invalid.pathClass
    };
  }

  const uniqueEndpoints = [...new Set(normalized.map(item => item.endpoint))];
  if (uniqueEndpoints.length > 1 && options.allowEndpointConflict !== true) {
    return {
      endpoint: "",
      source: normalized[0].source,
      error: "translation_provider_endpoint_conflict",
      conflictDetected: true,
      configuredAliasCount: candidates.length,
      pathClass: "conflict"
    };
  }

  return {
    endpoint: normalized[0].endpoint,
    source: normalized[0].source,
    error: "",
    conflictDetected: uniqueEndpoints.length > 1,
    configuredAliasCount: candidates.length,
    pathClass: normalized[0].pathClass
  };
}

function providerEndpoint(options = {}) {
  const resolution = resolveEndpoint(options);
  return resolution.error ? "" : resolution.endpoint;
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

function diagnosticsEnabled(options = {}) {
  if (typeof options.diagnostics === "boolean") return options.diagnostics;
  return safeBoolean(
    process.env.LINGOSENTINEL_TRANSLATE_DIAGNOSTICS,
    false
  );
}

function emitDiagnostic(code, details = {}, options = {}) {
  if (!diagnosticsEnabled(options)) return;

  const event = {
    service: "LingoSentinelTranslationProvider",
    version: VERSION,
    code: safeString(code, "translation_provider_event"),
    requestId: safeString(details.requestId),
    provider: safeString(details.provider),
    sourceLanguage: safeString(details.sourceLanguage),
    targetLanguage: safeString(details.targetLanguage),
    providerSource: safeString(details.providerSource),
    providerTarget: safeString(details.providerTarget),
    endpointSource: safeString(details.endpointSource),
    endpointPathClass: safeString(details.endpointPathClass),
    attempt: Number.isFinite(details.attempt) ? details.attempt : undefined,
    maxAttempts: Number.isFinite(details.maxAttempts)
      ? details.maxAttempts
      : undefined,
    httpStatus: Number.isFinite(details.httpStatus)
      ? details.httpStatus
      : undefined,
    retrying: Boolean(details.retrying),
    timestamp: new Date().toISOString()
  };

  Object.keys(event).forEach(key => {
    if (event[key] === "" || event[key] === undefined) delete event[key];
  });

  try {
    console.warn(
      `[LingoSentinel][TranslationProvider] ${JSON.stringify(event)}`
    );
  } catch (_) {}
}

function isConfigured(options = {}) {
  const resolution = resolveEndpoint(options);
  return Boolean(resolution.endpoint && !resolution.error);
}

function createAbortSignal(timeoutMs) {
  if (typeof AbortController === "undefined") {
    return { signal: undefined, clear: () => {} };
  }

  const controller = new AbortController();
  let cleared = false;
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch (_) {}
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
      (json.data &&
        (json.data.translatedText ||
          json.data.translation ||
          json.data.targetText ||
          json.data.output)) ||
      (json.message &&
        (json.message.translatedText || json.message.translation)) ||
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
  const source = Registry.getProviderLanguageCode(
    input.sourceLanguage || input.source || "auto",
    kind
  );
  const target = Registry.getProviderLanguageCode(
    input.targetLanguage || input.target || "en",
    kind
  );
  const text = safeString(input.text);
  const instruction = safeString(input.instruction);
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
      context: safeString(input.contextSummary),
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
      context: safeString(input.contextSummary),
      instruction
    };
    if (apiKey) payload.api_key = apiKey;
    return payload;
  }

  const payload = {
    q: text,
    source:
      source === "mixed" || source === "unknown" ? "auto" : source,
    target,
    format: "text"
  };
  if (apiKey) payload.api_key = apiKey;
  return payload;
}

function makeFailure({
  kind,
  error,
  text,
  sourceLanguage,
  targetLanguage,
  pair,
  endpointResolution,
  requestId,
  attempt,
  maxAttempts,
  httpStatus,
  options
}) {
  emitDiagnostic(
    error,
    {
      requestId,
      provider: kind,
      sourceLanguage,
      targetLanguage,
      providerSource: pair && pair.providerSource,
      providerTarget: pair && pair.providerTarget,
      endpointSource: endpointResolution && endpointResolution.source,
      endpointPathClass:
        endpointResolution && endpointResolution.pathClass,
      attempt,
      maxAttempts,
      httpStatus,
      retrying: false
    },
    options
  );

  return {
    ok: false,
    provider: kind,
    error,
    text,
    translatedText: text,
    sourceLanguage,
    targetLanguage,
    fallback: true,
    providerSource: pair && pair.providerSource,
    providerTarget: pair && pair.providerTarget,
    diagnosticsRedacted: true
  };
}

function detectMisdirectedProviderResponse(json = {}, status = 0) {
  const error = safeString(json.error).toLowerCase();
  const path = safeString(json.path).toLowerCase();
  const publicAgent = safeString(json.publicAgent).toLowerCase();

  if (
    error === "not_found" &&
    (path.includes("/lingosentinel/") ||
      path.endsWith("/lingosentinel/translate") ||
      publicAgent === "nyx")
  ) {
    return "provider_endpoint_misdirected";
  }

  if (
    Number(status) === 404 &&
    (path.includes("lingosentinel") || publicAgent === "nyx")
  ) {
    return "provider_endpoint_misdirected";
  }

  return "";
}

function shouldRetryHttpStatus(status) {
  return RETRYABLE_HTTP_STATUSES.has(Number(status));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

async function translate(input = {}, options = {}) {
  const kind = providerKind(options);
  const requestId = safeString(input.requestId || options.requestId);
  const text = safeString(input.text);
  const sourceLanguage = Registry.normalizeLanguageCode(
    input.sourceLanguage || input.source || "auto",
    "auto"
  );
  const targetLanguage = Registry.coerceTargetLanguage(
    input.targetLanguage || input.target || "en"
  );
  const pair = Registry.validateLanguagePair(
    sourceLanguage,
    targetLanguage,
    {
      provider: kind,
      allowAutoSource: true
    }
  );

  if (!text) {
    return {
      ok: false,
      provider: "none",
      error: "empty_text",
      translatedText: "",
      sourceLanguage,
      targetLanguage,
      fallback: true,
      diagnosticsRedacted: true
    };
  }

  if (
    sourceLanguage !== "auto" &&
    !Registry.isSpecialLanguage(sourceLanguage) &&
    !Registry.isSupportedLanguage(sourceLanguage)
  ) {
    return {
      ok: false,
      provider: kind,
      error: "unsupported_source_language",
      text,
      translatedText: text,
      sourceLanguage,
      targetLanguage,
      fallback: true,
      diagnosticsRedacted: true
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
      fallback: true,
      diagnosticsRedacted: true
    };
  }

  if (
    sourceLanguage !== "auto" &&
    sourceLanguage === targetLanguage
  ) {
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
      providerTarget: pair.providerTarget,
      diagnosticsRedacted: true
    };
  }

  const endpointResolution = resolveEndpoint(options);
  if (endpointResolution.error || !endpointResolution.endpoint) {
    return makeFailure({
      kind:
        endpointResolution.error === "translation_provider_unconfigured"
          ? "unconfigured"
          : kind,
      error:
        endpointResolution.error ||
        "translation_provider_unconfigured",
      text,
      sourceLanguage,
      targetLanguage,
      pair,
      endpointResolution,
      requestId,
      attempt: 0,
      maxAttempts: 0,
      options
    });
  }

  const fetchFn =
    typeof options.fetchFn === "function"
      ? options.fetchFn
      : typeof fetch === "function"
        ? fetch
        : null;

  if (!fetchFn) {
    return makeFailure({
      kind: "fetch-unavailable",
      error: "fetch_unavailable",
      text,
      sourceLanguage,
      targetLanguage,
      pair,
      endpointResolution,
      requestId,
      attempt: 0,
      maxAttempts: 0,
      options
    });
  }

  const maxAttempts = clampAttempts(
    options.maxAttempts ||
      process.env.LINGOSENTINEL_TRANSLATE_MAX_ATTEMPTS ||
      DEFAULT_MAX_ATTEMPTS
  );
  const retryDelayMs = clampRetryDelay(
    options.retryDelayMs ||
      process.env.LINGOSENTINEL_TRANSLATE_RETRY_DELAY_MS ||
      DEFAULT_RETRY_DELAY_MS
  );
  const timeoutMs = clampTimeout(
    options.timeoutMs ||
      process.env.LINGOSENTINEL_TRANSLATE_TIMEOUT_MS ||
      process.env.LINGOSENTINEL_TRANSLATION_TIMEOUT_MS ||
      DEFAULT_TIMEOUT_MS
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const timeout = createAbortSignal(timeoutMs);

    try {
      const headers = {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json"
      };
      const bearer = providerBearer(options);
      if (bearer) headers.Authorization = `Bearer ${bearer}`;

      const response = await fetchFn(endpointResolution.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(
          buildProviderPayload(
            {
              ...input,
              text,
              sourceLanguage,
              targetLanguage
            },
            options
          )
        ),
        signal: timeout.signal
      });

      const declaredLength = Number(
        response &&
          response.headers &&
          response.headers.get
          ? response.headers.get("content-length")
          : 0
      );

      if (
        Number.isFinite(declaredLength) &&
        declaredLength > MAX_RESPONSE_BYTES
      ) {
        return makeFailure({
          kind,
          error: "provider_response_too_large",
          text,
          sourceLanguage,
          targetLanguage,
          pair,
          endpointResolution,
          requestId,
          attempt,
          maxAttempts,
          httpStatus: response && response.status,
          options
        });
      }

      const bodyText =
        response && typeof response.text === "function"
          ? await response.text()
          : "";

      if (
        Buffer.byteLength(bodyText || "", "utf8") >
        MAX_RESPONSE_BYTES
      ) {
        return makeFailure({
          kind,
          error: "provider_response_too_large",
          text,
          sourceLanguage,
          targetLanguage,
          pair,
          endpointResolution,
          requestId,
          attempt,
          maxAttempts,
          httpStatus: response && response.status,
          options
        });
      }

      let json = {};
      try {
        json = bodyText ? JSON.parse(bodyText) : {};
      } catch (_) {
        json = {};
      }

      const misdirected = detectMisdirectedProviderResponse(
        json,
        response && response.status
      );
      if (misdirected) {
        return makeFailure({
          kind,
          error: misdirected,
          text,
          sourceLanguage,
          targetLanguage,
          pair,
          endpointResolution,
          requestId,
          attempt,
          maxAttempts,
          httpStatus: response && response.status,
          options
        });
      }

      if (!response || !response.ok) {
        const status =
          response && Number.isInteger(response.status)
            ? response.status
            : 502;
        const error = `provider_http_${status}`;
        const retrying =
          attempt < maxAttempts && shouldRetryHttpStatus(status);

        if (retrying) {
          emitDiagnostic(
            error,
            {
              requestId,
              provider: kind,
              sourceLanguage,
              targetLanguage,
              providerSource: pair.providerSource,
              providerTarget: pair.providerTarget,
              endpointSource: endpointResolution.source,
              endpointPathClass: endpointResolution.pathClass,
              attempt,
              maxAttempts,
              httpStatus: status,
              retrying: true
            },
            options
          );
          timeout.clear();
          await sleep(retryDelayMs * attempt);
          continue;
        }

        return makeFailure({
          kind,
          error,
          text,
          sourceLanguage,
          targetLanguage,
          pair,
          endpointResolution,
          requestId,
          attempt,
          maxAttempts,
          httpStatus: status,
          options
        });
      }

      const contentType =
        response.headers && response.headers.get
          ? safeString(
              response.headers.get("content-type")
            ).toLowerCase()
          : "";
      const translatedText =
        pickTranslatedText(json) ||
        (contentType.startsWith("text/plain")
          ? safeString(bodyText)
          : "");

      if (!translatedText) {
        return makeFailure({
          kind,
          error: "provider_translation_empty",
          text,
          sourceLanguage,
          targetLanguage,
          pair,
          endpointResolution,
          requestId,
          attempt,
          maxAttempts,
          httpStatus: response.status,
          options
        });
      }

      emitDiagnostic(
        "provider_translation_success",
        {
          requestId,
          provider: kind,
          sourceLanguage,
          targetLanguage,
          providerSource: pair.providerSource,
          providerTarget: pair.providerTarget,
          endpointSource: endpointResolution.source,
          endpointPathClass: endpointResolution.pathClass,
          attempt,
          maxAttempts,
          httpStatus: response.status,
          retrying: false
        },
        options
      );

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
          json.detectedLanguage ||
            json.language ||
            json.sourceLanguage ||
            sourceLanguage,
          sourceLanguage
        ),
        targetLanguage: Registry.normalizeLanguageCode(
          json.targetLanguage || json.target || targetLanguage,
          targetLanguage
        ),
        confidence: normalizeConfidence(json.confidence, 0.8),
        fallback: false,
        providerSource: pair.providerSource,
        providerTarget: pair.providerTarget,
        diagnosticsRedacted: true,
        attempts: attempt
      };
    } catch (error) {
      const stableError =
        error && error.name === "AbortError"
          ? "provider_timeout"
          : "provider_request_failed";
      const retrying = attempt < maxAttempts;

      if (retrying) {
        emitDiagnostic(
          stableError,
          {
            requestId,
            provider: kind,
            sourceLanguage,
            targetLanguage,
            providerSource: pair.providerSource,
            providerTarget: pair.providerTarget,
            endpointSource: endpointResolution.source,
            endpointPathClass: endpointResolution.pathClass,
            attempt,
            maxAttempts,
            retrying: true
          },
          options
        );
        timeout.clear();
        await sleep(retryDelayMs * attempt);
        continue;
      }

      return makeFailure({
        kind,
        error: stableError,
        text,
        sourceLanguage,
        targetLanguage,
        pair,
        endpointResolution,
        requestId,
        attempt,
        maxAttempts,
        options
      });
    } finally {
      timeout.clear();
    }
  }

  return makeFailure({
    kind,
    error: "provider_request_failed",
    text,
    sourceLanguage,
    targetLanguage,
    pair,
    endpointResolution,
    requestId,
    attempt: maxAttempts,
    maxAttempts,
    options
  });
}

function health(options = {}) {
  const endpointResolution = resolveEndpoint(options);
  const configured = Boolean(
    endpointResolution.endpoint && !endpointResolution.error
  );

  return {
    ok: configured,
    version: VERSION,
    provider: providerKind(options),
    status: configured ? "ready" : "degraded",
    endpointConfigured: configured,
    endpointSource: endpointResolution.source || "",
    endpointPathClass: endpointResolution.pathClass || "",
    endpointConflictDetected:
      endpointResolution.conflictDetected === true,
    endpointError: endpointResolution.error || "",
    configuredAliasCount:
      endpointResolution.configuredAliasCount || 0,
    providerEndpointExposed: false,
    apiKeyConfigured: Boolean(providerApiKey(options)),
    bearerConfigured: Boolean(providerBearer(options)),
    supportedLanguageCount:
      Registry.getSupportedLanguageCodes().length,
    timeoutMs: clampTimeout(
      options.timeoutMs ||
        process.env.LINGOSENTINEL_TRANSLATE_TIMEOUT_MS ||
        process.env.LINGOSENTINEL_TRANSLATION_TIMEOUT_MS ||
        DEFAULT_TIMEOUT_MS
    ),
    maxAttempts: clampAttempts(
      options.maxAttempts ||
        process.env.LINGOSENTINEL_TRANSLATE_MAX_ATTEMPTS ||
        DEFAULT_MAX_ATTEMPTS
    ),
    retryDelayMs: clampRetryDelay(
      options.retryDelayMs ||
        process.env.LINGOSENTINEL_TRANSLATE_RETRY_DELAY_MS ||
        DEFAULT_RETRY_DELAY_MS
    ),
    maxResponseBytes: MAX_RESPONSE_BYTES,
    diagnosticsEnabled: diagnosticsEnabled(options),
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
  buildProviderPayload,
  resolveEndpoint
});
