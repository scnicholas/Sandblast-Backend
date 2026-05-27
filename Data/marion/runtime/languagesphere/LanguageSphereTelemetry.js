"use strict";

/**
 * LanguageSphereTelemetry
 *
 * Purpose:
 * Records safe commercial-readiness metrics for LanguageSphere.
 *
 * Contract:
 * - Never blocks final answer.
 * - Never exposes secrets, tokens, stack traces, or raw debug.
 * - Keeps Marion as final authority.
 */

const DEFAULT_CONFIG = {
  authority: "marion",
  enabled: true,
  maxMetricValueMs: 30000,
  defaultConfidenceBand: "unknown",
  allowedMetricKeys: [
    "language_detect_ms",
    "translation_ms",
    "domain_route_ms",
    "tone_adaptation_ms",
    "final_envelope_ms",
    "total_pipeline_ms",
  ],
};

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
  const text = String(value || "").trim();
  return text || fallback;
}

function sanitizeTelemetry(value) {
  if (!value || typeof value !== "object") return value;

  const output = Array.isArray(value) ? [] : {};

  for (const [key, item] of Object.entries(value)) {
    const lowered = key.toLowerCase();

    if (
      lowered.includes("token") ||
      lowered.includes("secret") ||
      lowered.includes("password") ||
      lowered.includes("authorization") ||
      lowered.includes("apikey") ||
      lowered.includes("api_key")
    ) {
      output[key] = "[redacted]";
      continue;
    }

    if (typeof item === "string" && /bearer\s+|stack trace|typeerror|referenceerror|syntaxerror/i.test(item)) {
      output[key] = "[redacted]";
      continue;
    }

    if (item && typeof item === "object") {
      output[key] = sanitizeTelemetry(item);
    } else {
      output[key] = item;
    }
  }

  return output;
}

function buildTelemetryRecord(payload = {}, options = {}) {
  try {
    payload = payload && typeof payload === "object" ? payload : {};
    options = options && typeof options === "object" ? options : {};
    const config = {
      ...DEFAULT_CONFIG,
      ...(options.config || payload.config || {}),
    };

    const metrics = {
      language_detect_ms: clampMs(payload.language_detect_ms || payload.languageDetectMs),
      translation_ms: clampMs(payload.translation_ms || payload.translationMs),
      domain_route_ms: clampMs(payload.domain_route_ms || payload.domainRouteMs),
      tone_adaptation_ms: clampMs(payload.tone_adaptation_ms || payload.toneAdaptationMs),
      final_envelope_ms: clampMs(payload.final_envelope_ms || payload.finalEnvelopeMs),
      total_pipeline_ms: clampMs(payload.total_pipeline_ms || payload.totalPipelineMs),
    };

    return {
      ok: true,
      authority: "marion",
      telemetryEnabled: Boolean(config.enabled),
      requestId: normalizeString(payload.requestId, "languagesphere-telemetry"),
      timestamp: new Date().toISOString(),
      metrics,
      signals: {
        fallback_used: normalizeBoolean(payload.fallbackUsed || payload.fallback_used),
        confidence_band: normalizeString(
          payload.confidenceBand ||
            payload.confidence_band,
          config.defaultConfidenceBand
        ),
        source_language: normalizeString(payload.sourceLanguage || payload.source_language, "en"),
        target_language: normalizeString(payload.targetLanguage || payload.target_language, "en"),
        active_domain: normalizeString(payload.activeDomain || payload.active_domain || payload.domain, "general"),
        route_family: normalizeString(payload.routeFamily || payload.route_family, null),
        tone_mode: normalizeString(payload.toneMode || payload.tone_mode, null),
        handoff_status: normalizeString(payload.handoffStatus || payload.handoff_status, "available"),
        final_authority: "marion",
      },
      safeMetadata: sanitizeTelemetry(payload.metadata || {}),
    };
  } catch (_) {
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
}

function validateTelemetryRecord(record = {}) {
  record = record && typeof record === "object" ? record : {};
  const serialized = JSON.stringify(record || {});

  return {
    valid:
      record.authority === "marion" &&
      record.signals &&
      record.signals.final_authority === "marion" &&
      !/bearer\s+|secret-token|password\s*[:=]|stack trace|typeerror|referenceerror/i.test(serialized),
    hasMetrics: Boolean(record.metrics),
    hasSignals: Boolean(record.signals),
    noDebugLeak: !/stack trace|typeerror|referenceerror|syntaxerror/i.test(serialized),
  };
}

function process(payload = {}, options = {}) {
  return buildTelemetryRecord(payload, options);
}

function record(payload = {}, options = {}) {
  return buildTelemetryRecord(payload, options);
}

module.exports = {
  DEFAULT_CONFIG,
  clampMs,
  normalizeBoolean,
  normalizeString,
  sanitizeTelemetry,
  buildTelemetryRecord,
  validateTelemetryRecord,
  process,
  record,
};
