"use strict";

/**
 * MarionRealWorldInputEnvelope
 *
 * Purpose:
 * Creates a Marion-safe envelope for real-world observations.
 *
 * Scope:
 * - Does not run sensor capture.
 * - Does not identify private people.
 * - Does not make criminal, medical, or legal determinations.
 * - Does not convert uncertainty into certainty.
 * - Does not override Marion.
 */

const REAL_WORLD_ENVELOPE_VERSION = "nyx.marion.realWorldInputEnvelope/0.1";

const DEFAULT_REAL_WORLD_CONFIG = Object.freeze({
  enabled: true,
  defaultPermissionStatus: "unknown",
  minConfidence: 0,
  maxSummaryChars: 500,
  authority: {
    finalAuthority: "Marion",
    realWorldAdvisoryOnly: true,
    neverOverrideMarion: true
  }
});

const VALID_PERMISSION_STATUSES = Object.freeze([
  "allowed",
  "denied",
  "unknown",
  "restricted"
]);

const VALID_RISK_LEVELS = Object.freeze([
  "none",
  "low",
  "medium",
  "high",
  "critical"
]);

const BLOCKED_SENSITIVE_PATTERNS = Object.freeze([
  /\bidentify\s+(?:this\s+)?(?:person|individual|man|woman|child)\b/i,
  /\bwho\s+is\s+(?:this|that)\s+(?:person|individual|man|woman|child)\b/i,
  /\bface\s+recognition\b/i,
  /\bcriminal\b/i,
  /\barsonist\b/i,
  /\bdiagnose\b/i,
  /\bmedical\s+condition\b/i,
  /\breligion\b/i,
  /\bpolitical\b/i,
  /\bethnicity\b/i,
  /\brace\b/i,
  /\bsexual\b/i,
  /\bmental\s+health\b/i
]);

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

function normalizePermissionStatus(value, fallback = "unknown") {
  const status = safeString(value).trim().toLowerCase();
  if (VALID_PERMISSION_STATUSES.includes(status)) return status;
  return VALID_PERMISSION_STATUSES.includes(fallback) ? fallback : "unknown";
}

function normalizeRiskLevel(value, fallback = "low") {
  const level = safeString(value).trim().toLowerCase();
  if (VALID_RISK_LEVELS.includes(level)) return level;
  return VALID_RISK_LEVELS.includes(fallback) ? fallback : "low";
}

function mergeRealWorldConfig(config) {
  const incoming = safeObject(config);

  return {
    ...DEFAULT_REAL_WORLD_CONFIG,
    ...incoming,
    authority: {
      ...DEFAULT_REAL_WORLD_CONFIG.authority,
      ...safeObject(incoming.authority),
      finalAuthority: "Marion",
      realWorldAdvisoryOnly: true,
      neverOverrideMarion: true
    }
  };
}

function clipText(value, maxChars) {
  const text = safeString(value).replace(/\s+/g, " ").trim();
  const max = Math.max(80, Math.min(2000, Number(maxChars) || 500));
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function containsSensitiveOrBlockedInference(value) {
  const text = safeString(value);
  if (!text) return false;
  return BLOCKED_SENSITIVE_PATTERNS.some((rx) => rx.test(text));
}

function inferObservationType(observation = {}) {
  const o = safeObject(observation);
  const raw = safeString(o.observationType || o.type || o.modality || o.sourceType).toLowerCase();

  if (raw.includes("visual") || raw.includes("camera") || raw.includes("image")) {
    return "visual_environment";
  }

  if (raw.includes("audio")) {
    return "audio_environment";
  }

  if (raw.includes("location")) {
    return "location_context";
  }

  if (raw.includes("sensor")) {
    return "sensor_context";
  }

  return "general_environment";
}

function buildRealWorldInputEnvelope(observation = {}, options = {}) {
  const config = mergeRealWorldConfig(options.config);
  const o = safeObject(observation);

  const rawSummary = safeString(
    o.observationSummary ||
      o.summary ||
      o.description ||
      o.text ||
      o.message ||
      ""
  );

  const permissionStatus = normalizePermissionStatus(
    o.permissionStatus || options.permissionStatus,
    config.defaultPermissionStatus
  );

  const confidence = clamp01(o.confidence, 0);
  const observationType = inferObservationType(o);
  const riskLevel = normalizeRiskLevel(o.riskLevel || o.risk || "low", "low");

  const blocked = containsSensitiveOrBlockedInference(rawSummary);
  const permissionBlocked = permissionStatus !== "allowed";
  const requiresHumanReview =
    blocked ||
    permissionBlocked ||
    ["high", "critical"].includes(riskLevel) ||
    confidence < clamp01(config.minConfidence, 0);

  const safeSummary = blocked
    ? "Observation blocked because it appears to request or contain sensitive inference."
    : clipText(rawSummary || "No real-world observation summary provided.", config.maxSummaryChars);

  return {
    version: REAL_WORLD_ENVELOPE_VERSION,
    enabled: config.enabled !== false,

    observationType,
    observationSummary: safeSummary,
    originalSummary: rawSummary,

    permissionStatus,
    permissionAllowed: permissionStatus === "allowed",

    confidence,
    riskLevel,

    blocked,
    blockReason: blocked
      ? "sensitive_or_disallowed_inference"
      : permissionBlocked
        ? "permission_not_allowed"
        : "",

    requiresHumanReview,
    uncertaintyRequired: confidence < 0.82,
    hypothesisOnly: true,

    allowedActions: blocked || permissionBlocked
      ? ["block", "ask_permission_or_clarify", "human_review"]
      : ["describe_environment", "mark_uncertainty", "recommend_caution", "human_review_if_needed"],

    disallowedActions: [
      "identify_private_person",
      "infer_sensitive_traits",
      "make_criminal_determination",
      "make_medical_diagnosis",
      "make_legal_determination",
      "continuous_unpermissioned_monitoring",
      "state_uncertain_cause_as_fact"
    ],

    userFacing: false,
    publicText: "",
    renderText: "",
    text: "",

    advisoryOnly: true,
    forceAction: false,

    authority: {
      ...config.authority,
      finalAuthority: "Marion",
      realWorldAdvisoryOnly: true,
      neverOverrideMarion: true
    },

    marionAuthority: true,
    finalAuthority: "Marion",
    source: "MarionRealWorldInputEnvelope"
  };
}

function summarizeRealWorldEnvelope(envelope = {}) {
  const e = safeObject(envelope);

  return {
    version: REAL_WORLD_ENVELOPE_VERSION,
    observationType: safeString(e.observationType || "general_environment"),
    permissionStatus: normalizePermissionStatus(e.permissionStatus || "unknown"),
    confidence: clamp01(e.confidence, 0),
    riskLevel: normalizeRiskLevel(e.riskLevel || "low"),
    blocked: e.blocked === true,
    requiresHumanReview: e.requiresHumanReview === true,
    hypothesisOnly: e.hypothesisOnly !== false,
    authority: {
      finalAuthority: "Marion",
      realWorldAdvisoryOnly: true,
      neverOverrideMarion: true
    },
    source: "MarionRealWorldInputEnvelope"
  };
}

module.exports = {
  buildRealWorldInputEnvelope,
  summarizeRealWorldEnvelope,
  mergeRealWorldConfig,
  inferObservationType,
  containsSensitiveOrBlockedInference,
  normalizePermissionStatus,
  normalizeRiskLevel,
  DEFAULT_REAL_WORLD_CONFIG,
  REAL_WORLD_ENVELOPE_VERSION
};
