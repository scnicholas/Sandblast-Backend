"use strict";

/**
 * LanguageSphereTelemetry
 *
 * Purpose:
 * Records safe commercial-readiness metrics for LanguageSphere.
 *
 * Contract:
 * - Never blocks final answer.
 * - Never exposes secrets, tokens, stack traces, raw debug, or provider errors.
 * - Keeps Marion as final authority.
 * - Provides safe summary/event helpers for API middleware and regression tests.
 */

const DEFAULT_CONFIG = Object.freeze({
  authority: "marion",
  enabled: true,
  maxMetricValueMs: 30000,
  defaultConfidenceBand: "unknown",
  allowedMetricKeys: Object.freeze([
    "language_detect_ms",
    "translation_ms",
    "domain_route_ms",
    "tone_adaptation_ms",
    "final_envelope_ms",
    "total_pipeline_ms",
  ]),
});

const REDACTION_PATTERN =
  /bearer\s+|stack trace|typeerror|referenceerror|syntaxerror|secret|password|authorization|apikey|api_key|access[_-]?token|refresh[_-]?token/i;

function clampMs(value, max = DEFAULT_CONFIG.maxMetricValueMs) {
  const n = Number(value);

  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > max) return max;

  return Math.round(n);
}

function normalizeBoolean(value) {
  return Boolean(value);
}

function normalizeString(value, fallback = null) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isSensitiveKey(key) {
  const lowered = String(key || "").toLowerCase();
  return (
    lowered.includes("token") ||
    lowered.includes("secret") ||
    lowered.includes("password") ||
    lowered.includes("authorization") ||
    lowered.includes("apikey") ||
    lowered.includes("api_key") ||
    lowered.includes("accesskey") ||
    lowered.includes("credential")
  );
}

function sanitizeTelemetry(value, depth = 0) {
  if (depth > 8) return "[redacted-depth-limit]";

  if (typeof value === "string") {
    return REDACTION_PATTERN.test(value) ? "[redacted]" : value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "boolean" || value === null || value === undefined) {
    return value;
  }

  if (typeof value === "function") {
    return "[redacted-function]";
  }

  if (value instanceof Error) {
    return {
      name: sanitizeTelemetry(value.name || "Error", depth + 1),
      message: REDACTION_PATTERN.test(String(value.message || ""))
        ? "[redacted]"
        : "error-redacted",
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTelemetry(item, depth + 1));
  }

  if (!value || typeof value !== "object") return value;

  const output = {};

  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      output[key] = "[redacted]";
      continue;
    }

    output[key] = sanitizeTelemetry(item, depth + 1);
  }

  return output;
}

function buildTelemetryRecord(payload = {}, options = {}) {
  try {
    const safePayload = payload && typeof payload === "object" ? payload : {};
    const safeOptions = options && typeof options === "object" ? options : {};
    const config = {
      ...DEFAULT_CONFIG,
      ...(safeOptions.config || safePayload.config || {}),
    };

    const metrics = {
      language_detect_ms: clampMs(
        safePayload.language_detect_ms ?? safePayload.languageDetectMs,
        config.maxMetricValueMs
      ),
      translation_ms: clampMs(
        safePayload.translation_ms ?? safePayload.translationMs,
        config.maxMetricValueMs
      ),
      domain_route_ms: clampMs(
        safePayload.domain_route_ms ?? safePayload.domainRouteMs,
        config.maxMetricValueMs
      ),
      tone_adaptation_ms: clampMs(
        safePayload.tone_adaptation_ms ?? safePayload.toneAdaptationMs,
        config.maxMetricValueMs
      ),
      final_envelope_ms: clampMs(
        safePayload.final_envelope_ms ?? safePayload.finalEnvelopeMs,
        config.maxMetricValueMs
      ),
      total_pipeline_ms: clampMs(
        safePayload.total_pipeline_ms ?? safePayload.totalPipelineMs,
        config.maxMetricValueMs
      ),
    };

    return {
      ok: true,
      authority: "marion",
      telemetryEnabled: Boolean(config.enabled),
      requestId: normalizeString(safePayload.requestId, "languagesphere-telemetry"),
      timestamp: new Date().toISOString(),
      metrics,
      signals: {
        fallback_used: normalizeBoolean(
          safePayload.fallbackUsed ?? safePayload.fallback_used
        ),
        confidence_band: normalizeString(
          safePayload.confidenceBand ?? safePayload.confidence_band,
          config.defaultConfidenceBand
        ),
        source_language: normalizeString(
          safePayload.sourceLanguage ?? safePayload.source_language,
          "en"
        ),
        target_language: normalizeString(
          safePayload.targetLanguage ?? safePayload.target_language,
          "en"
        ),
        active_domain: normalizeString(
          safePayload.activeDomain ?? safePayload.active_domain ?? safePayload.domain,
          "general"
        ),
        route_family: normalizeString(
          safePayload.routeFamily ?? safePayload.route_family,
          null
        ),
        tone_mode: normalizeString(safePayload.toneMode ?? safePayload.tone_mode, null),
        handoff_status: normalizeString(
          safePayload.handoffStatus ?? safePayload.handoff_status,
          "available"
        ),
        final_authority: "marion",
      },
      safeMetadata: sanitizeTelemetry(safePayload.metadata || {}),
    };
  } catch (_) {
    return createFallbackTelemetryRecord();
  }
}

function createFallbackTelemetryRecord() {
  return {
    ok: false,
    authority: "marion",
    telemetryEnabled: false,
    requestId: "languagesphere-telemetry-fallback",
    timestamp: new Date().toISOString(),
    metrics: {
      language_detect_ms: 0,
      translation_ms: 0,
      domain_route_ms: 0,
      tone_adaptation_ms: 0,
      final_envelope_ms: 0,
      total_pipeline_ms: 0,
    },
    signals: {
      fallback_used: true,
      confidence_band: "low",
      source_language: "en",
      target_language: "en",
      active_domain: "general",
      route_family: null,
      tone_mode: null,
      handoff_status: "fallback",
      final_authority: "marion",
    },
    safeMetadata: {},
  };
}

function validateTelemetryRecord(record = {}) {
  const safeRecord = record && typeof record === "object" ? record : {};
  const serialized = JSON.stringify(sanitizeTelemetry(safeRecord));

  return {
    valid:
      safeRecord.authority === "marion" &&
      safeRecord.signals &&
      safeRecord.signals.final_authority === "marion" &&
      !REDACTION_PATTERN.test(serialized),
    hasMetrics: Boolean(safeRecord.metrics),
    hasSignals: Boolean(safeRecord.signals),
    noDebugLeak: !/stack trace|typeerror|referenceerror|syntaxerror/i.test(serialized),
  };
}

function processTelemetry(payload = {}, options = {}) {
  return buildTelemetryRecord(payload, options);
}

function record(payload = {}, options = {}) {
  return buildTelemetryRecord(payload, options);
}

function createTelemetryEvent(event, payload = {}) {
  return {
    event: normalizeString(event, "event"),
    payload: sanitizeTelemetry(payload && typeof payload === "object" ? payload : {}),
    at: new Date().toISOString(),
  };
}

function getConfidenceBand(confidence) {
  const normalized = normalizeNumber(confidence, NaN);

  if (!Number.isFinite(normalized)) return "unknown";
  if (normalized >= 0.75) return "high";
  if (normalized >= 0.55) return "medium";
  return "low";
}

function createLanguageSphereTelemetry(seed = {}, options = {}) {
  try {
    const safeSeed = seed && typeof seed === "object" ? seed : {};
    const requestPayload =
      safeSeed.requestPayload && typeof safeSeed.requestPayload === "object"
        ? safeSeed.requestPayload
        : {};
    const envelope =
      safeSeed.envelope && typeof safeSeed.envelope === "object" ? safeSeed.envelope : {};
    const fallbackDecision =
      safeSeed.fallbackDecision && typeof safeSeed.fallbackDecision === "object"
        ? safeSeed.fallbackDecision
        : {};

    const language = envelope.language && typeof envelope.language === "object" ? envelope.language : {};

    const recordPayload = {
      requestId: requestPayload.requestId || requestPayload.reqId || "languagesphere-api-chat",
      sessionId: requestPayload.sessionId || requestPayload.session_id || null,
      sourceLanguage:
        language.sourceLanguage ||
        requestPayload.sourceLanguage ||
        requestPayload.detectedLanguage ||
        "unknown",
      targetLanguage:
        language.targetLanguage || requestPayload.targetLanguage || requestPayload.targetLang || "en",
      fallbackUsed: Boolean(fallbackDecision.fallbackApplied),
      confidenceBand: getConfidenceBand(language.confidence),
      activeDomain:
        requestPayload.domain || requestPayload.activeDomain || requestPayload.routeFamily || "general",
      routeFamily: requestPayload.routeFamily || null,
      metadata: {
        blocked: Boolean(fallbackDecision.blocked),
        reason: fallbackDecision.reason || null,
      },
    };

    const base = buildTelemetryRecord(recordPayload, options);
    const timestamp = base.timestamp;

    const telemetry = {
      ...base,
      source: "languagesphere-api-middleware",
      sessionId: normalizeString(recordPayload.sessionId, null),
      createdAt: timestamp,
      updatedAt: timestamp,
      events: [
        createTelemetryEvent("languagesphere-api-chat-telemetry-created", {
          blocked: Boolean(fallbackDecision.blocked),
          fallbackApplied: Boolean(fallbackDecision.fallbackApplied),
        }),
      ],
      warnings: normalizeArray(fallbackDecision.warnings).map((item) => sanitizeTelemetry(item)),
      errors: normalizeArray(fallbackDecision.errors).map((item) => sanitizeTelemetry(item)),

      record(event, payload = {}) {
        this.events.push(createTelemetryEvent(event, payload));
        this.updatedAt = new Date().toISOString();
        return this;
      },

      warn(payload = {}) {
        this.warnings.push(sanitizeTelemetry(payload));
        this.updatedAt = new Date().toISOString();
        return this;
      },

      error(payload = {}) {
        this.errors.push(sanitizeTelemetry(payload));
        this.updatedAt = new Date().toISOString();
        return this;
      },

      toJSON() {
        return {
          ok: this.ok,
          authority: "marion",
          telemetryEnabled: this.telemetryEnabled,
          requestId: this.requestId,
          sessionId: this.sessionId,
          timestamp: this.timestamp,
          createdAt: this.createdAt,
          updatedAt: this.updatedAt,
          metrics: this.metrics,
          signals: this.signals,
          safeMetadata: sanitizeTelemetry(this.safeMetadata || {}),
          events: normalizeArray(this.events).map((item) => sanitizeTelemetry(item)),
          warnings: normalizeArray(this.warnings).map((item) => sanitizeTelemetry(item)),
          errors: normalizeArray(this.errors).map((item) => sanitizeTelemetry(item)),
          source: this.source,
        };
      },
    };

    return telemetry;
  } catch (_) {
    const fallback = buildTelemetryRecord(
      {
        requestId: "languagesphere-telemetry-fallback",
        fallbackUsed: true,
        confidenceBand: "low",
        metadata: {},
      },
      options
    );

    return {
      ...fallback,
      source: "languagesphere-api-middleware",
      createdAt: fallback.timestamp,
      updatedAt: fallback.timestamp,
      events: [],
      warnings: ["telemetry-fallback-created"],
      errors: [],
      record() {
        return this;
      },
      warn() {
        return this;
      },
      error() {
        return this;
      },
      toJSON() {
        return {
          ...fallback,
          source: this.source,
          events: [],
          warnings: this.warnings,
          errors: [],
        };
      },
    };
  }
}

function summarizeTelemetry(telemetry = {}) {
  const source =
    telemetry && typeof telemetry.toJSON === "function"
      ? telemetry.toJSON()
      : telemetry && typeof telemetry === "object"
        ? telemetry
        : {};

  return {
    ok: source.ok !== false,
    authority: "marion",
    telemetryEnabled: source.telemetryEnabled !== false,
    requestId: normalizeString(source.requestId, null),
    source: normalizeString(source.source, "languagesphere-api-middleware"),
    events: normalizeArray(source.events).length,
    warnings: normalizeArray(source.warnings).length,
    errors: normalizeArray(source.errors).length,
    fallbackUsed: Boolean(source.signals && source.signals.fallback_used),
    blocked: Boolean(source.safeMetadata && source.safeMetadata.blocked),
    finalAuthority: "marion",
    noDebugLeak: validateTelemetryRecord(source).noDebugLeak,
  };
}

module.exports = {
  DEFAULT_CONFIG,
  clampMs,
  normalizeBoolean,
  normalizeString,
  normalizeNumber,
  normalizeArray,
  sanitizeTelemetry,
  buildTelemetryRecord,
  createTelemetryEvent,
  createLanguageSphereTelemetry,
  summarizeTelemetry,
  validateTelemetryRecord,
  process: processTelemetry,
  record,
};
