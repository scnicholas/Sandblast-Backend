"use strict";

/**
 * LingoSentinelUnknownLanguageAlert
 *
 * Purpose:
 * Builds Marion-safe alert packets when LingoSentinel detects an unknown,
 * unsupported, low-confidence, or ambiguous language pattern.
 *
 * Scope:
 * - Does not notify externally by itself.
 * - Does not override Marion.
 * - Does not translate.
 * - Produces structured alert metadata for Marion/index/dashboard layers.
 * - Keeps all user-facing output render-safe.
 */

const ALERT_VERSION = "nyx.lingosentinel.unknownLanguageAlert/0.1";

const DEFAULT_ALERT_CONFIG = Object.freeze({
  enabled: true,
  minConfidenceForKnownLanguage: 0.65,
  alertOnUnknown: true,
  alertOnUnsupported: true,
  alertOnLowConfidence: true,
  alertOnAmbiguous: true,
  maxSampleChars: 240,
  severityBands: {
    critical: 0.15,
    high: 0.35,
    medium: 0.55
  },
  authority: {
    finalAuthority: "Marion",
    lingoSentinelAdvisoryOnly: true,
    neverOverrideMarion: true
  }
});

function safeString(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return String(value);
  } catch (_) {
    return "";
  }
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.min(1, Number(fallback) || 0));
  return Math.max(0, Math.min(1, n));
}

function normalizeLanguageCode(value) {
  const code = safeString(value).trim().toLowerCase();
  if (!code) return "unknown";
  if (["en", "english"].includes(code)) return "en";
  if (["fr", "fra", "fre", "french", "français", "francais"].includes(code)) return "fr";
  if (["es", "spa", "spanish", "español", "espanol"].includes(code)) return "es";
  return code;
}

function mergeAlertConfig(config) {
  const incoming = safeObject(config);

  return {
    ...DEFAULT_ALERT_CONFIG,
    ...incoming,
    severityBands: {
      ...DEFAULT_ALERT_CONFIG.severityBands,
      ...safeObject(incoming.severityBands)
    },
    authority: {
      ...DEFAULT_ALERT_CONFIG.authority,
      ...safeObject(incoming.authority),
      finalAuthority: "Marion",
      lingoSentinelAdvisoryOnly: true,
      neverOverrideMarion: true
    }
  };
}

function clipSample(value, maxChars) {
  const text = safeString(value).replace(/\s+/g, " ").trim();
  const max = Math.max(32, Math.min(2000, Number(maxChars) || 240));
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function hashText(value) {
  const text = safeString(value).toLowerCase().replace(/\s+/g, " ").trim();
  let hash = 2166136261;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function classifyUnknownLanguageReason(languageMeta = {}, config = DEFAULT_ALERT_CONFIG) {
  const meta = safeObject(languageMeta);
  const detectedLanguage = normalizeLanguageCode(meta.detectedLanguage || meta.language || meta.code);
  const confidence = clamp01(meta.confidence, 0);
  const supported = meta.supported === true;
  const fallbackTriggered = meta.fallbackTriggered === true;
  const reason = safeString(meta.reason).toLowerCase();
  const candidates = safeObject(meta.candidates);

  if (detectedLanguage === "unknown") {
    return "unknown_language";
  }

  if (!supported) {
    return "unsupported_language";
  }

  if (confidence < clamp01(config.minConfidenceForKnownLanguage, 0.65)) {
    return "low_confidence_language";
  }

  if (
    reason.includes("ambiguous") ||
    reason.includes("low_confidence") ||
    reason.includes("low confidence")
  ) {
    return "ambiguous_language_signal";
  }

  const candidateValues = Object.values(candidates)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .sort((a, b) => b - a);

  if (candidateValues.length > 1) {
    const margin = candidateValues[0] - candidateValues[1];
    if (margin < 0.08) return "ambiguous_language_signal";
  }

  if (fallbackTriggered) {
    return "language_fallback_triggered";
  }

  return "no_alert_needed";
}

function shouldAlert(languageMeta = {}, config = DEFAULT_ALERT_CONFIG) {
  const merged = mergeAlertConfig(config);

  if (!merged.enabled) return false;

  const reason = classifyUnknownLanguageReason(languageMeta, merged);

  if (reason === "unknown_language") return merged.alertOnUnknown !== false;
  if (reason === "unsupported_language") return merged.alertOnUnsupported !== false;
  if (reason === "low_confidence_language") return merged.alertOnLowConfidence !== false;
  if (reason === "ambiguous_language_signal") return merged.alertOnAmbiguous !== false;
  if (reason === "language_fallback_triggered") return true;

  return false;
}

function severityFromConfidence(confidence, config = DEFAULT_ALERT_CONFIG) {
  const merged = mergeAlertConfig(config);
  const c = clamp01(confidence, 0);

  if (c <= clamp01(merged.severityBands.critical, 0.15)) return "critical";
  if (c <= clamp01(merged.severityBands.high, 0.35)) return "high";
  if (c <= clamp01(merged.severityBands.medium, 0.55)) return "medium";

  return "low";
}

function buildUnknownLanguageAlert(payload = {}, options = {}) {
  const config = mergeAlertConfig(options.config);
  const sourcePayload = safeObject(payload);

  const rawInput = safeString(
    options.rawInput ||
      sourcePayload.originalInput ||
      sourcePayload.input ||
      sourcePayload.message ||
      sourcePayload.text ||
      ""
  );

  const languageMeta = safeObject(
    options.languageMeta ||
      sourcePayload.languageMeta ||
      sourcePayload.language ||
      {}
  );

  const detectedLanguage = normalizeLanguageCode(
    languageMeta.detectedLanguage ||
      languageMeta.language ||
      languageMeta.code ||
      "unknown"
  );

  const confidence = clamp01(languageMeta.confidence, 0);
  const reason = classifyUnknownLanguageReason(languageMeta, config);
  const alertTriggered = shouldAlert(languageMeta, config);
  const severity = alertTriggered ? severityFromConfidence(confidence, config) : "none";

  const sample = clipSample(rawInput, config.maxSampleChars);
  const createdAt = Date.now();

  const alertId = `lingosentinel_unknown_${createdAt}_${hashText(
    `${detectedLanguage}:${confidence}:${sample}`
  )}`;

  return {
    version: ALERT_VERSION,
    alertId,
    alertType: "unknown_language_pattern",
    alertTriggered,
    enabled: config.enabled !== false,

    detectedLanguage,
    confidence,
    supported: languageMeta.supported === true,
    fallbackTriggered: languageMeta.fallbackTriggered === true,

    reason,
    severity,

    sample,
    sampleHash: hashText(sample),
    originalLength: rawInput.length,

    notificationReady: alertTriggered,
    notificationChannel: "marion_dashboard",
    userFacing: false,
    publicText: "",
    renderText: "",
    text: "",

    advisoryOnly: true,
    forceTranslation: false,

    authority: {
      ...config.authority,
      finalAuthority: "Marion",
      lingoSentinelAdvisoryOnly: true,
      neverOverrideMarion: true
    },

    metadata: {
      source: "LingoSentinelUnknownLanguageAlert",
      createdAt,
      candidates: safeObject(languageMeta.candidates),
      sourceReason: safeString(languageMeta.reason),
      gateway: safeString(sourcePayload.source || sourcePayload.gateway || "LingoSentinel")
    },

    source: "LingoSentinelUnknownLanguageAlert"
  };
}

function summarizeUnknownLanguageAlert(alert = {}) {
  const a = safeObject(alert);

  return {
    alertId: safeString(a.alertId),
    alertTriggered: a.alertTriggered === true,
    alertType: safeString(a.alertType || "unknown_language_pattern"),
    detectedLanguage: normalizeLanguageCode(a.detectedLanguage || "unknown"),
    confidence: clamp01(a.confidence, 0),
    severity: safeString(a.severity || "none"),
    reason: safeString(a.reason || "no_alert_needed"),
    notificationReady: a.notificationReady === true,
    authority: {
      finalAuthority: "Marion",
      lingoSentinelAdvisoryOnly: true,
      neverOverrideMarion: true
    },
    source: "LingoSentinelUnknownLanguageAlert"
  };
}

module.exports = {
  buildUnknownLanguageAlert,
  summarizeUnknownLanguageAlert,
  classifyUnknownLanguageReason,
  shouldAlert,
  severityFromConfidence,
  DEFAULT_ALERT_CONFIG,
  ALERT_VERSION
};
