"use strict";

/**
 * MarionRealWorldRiskClassifier
 *
 * Purpose:
 * Classifies real-world observation risk without making definitive
 * medical/legal/criminal determinations.
 *
 * Scope:
 * - Does not override Marion.
 * - Does not identify people.
 * - Does not act autonomously.
 * - Provides advisory risk metadata only.
 */

const REAL_WORLD_RISK_CLASSIFIER_VERSION = "nyx.marion.realWorldRiskClassifier/0.1";

const DEFAULT_RISK_CONFIG = Object.freeze({
  enabled: true,
  defaultRiskLevel: "low",
  criticalRequiresHumanReview: true,
  authority: {
    finalAuthority: "Marion",
    riskClassifierAdvisoryOnly: true,
    neverOverrideMarion: true
  }
});

const RISK_RANK = Object.freeze({
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
});

const CRITICAL_PATTERNS = Object.freeze([
  /\bperson\s+(?:injured|unconscious|not breathing|bleeding heavily)\b/i,
  /\bserious\s+injury\b/i,
  /\bimmediate\s+danger\b/i,
  /\bbuilding\s+on\s+fire\b/i,
  /\bactive\s+fire\b/i
]);

const HIGH_PATTERNS = Object.freeze([
  /\bsmoke\s+(?:indoors|inside|from inside|in building)\b/i,
  /\bweapon\b/i,
  /\bgun\b/i,
  /\bknife\b/i,
  /\belectrical\s+(?:spark|fire|hazard)\b/i,
  /\bchemical\s+(?:spill|exposure|hazard)\b/i,
  /\bgas\s+leak\b/i,
  /\bpossible\s+fire\b/i
]);

const MEDIUM_PATTERNS = Object.freeze([
  /\bburn(?:ed|t)?\s+grass\b/i,
  /\bscorched\s+grass\b/i,
  /\bsmoke\b/i,
  /\bunknown\s+object\b/i,
  /\btrip\s+hazard\b/i,
  /\bslippery\b/i,
  /\bsmall\s+fire\b/i,
  /\bchemical\b/i
]);

const LOW_PATTERNS = Object.freeze([
  /\bclear\s+environment\b/i,
  /\bminor\b/i,
  /\bgrass\b/i,
  /\bobject\s+on\s+floor\b/i,
  /\bwet\s+floor\b/i
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

function normalizeRiskLevel(value, fallback = "low") {
  const level = safeString(value).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(RISK_RANK, level)) return level;
  return Object.prototype.hasOwnProperty.call(RISK_RANK, fallback) ? fallback : "low";
}

function riskAtLeast(value, threshold) {
  const risk = normalizeRiskLevel(value, "none");
  const min = normalizeRiskLevel(threshold, "none");
  return RISK_RANK[risk] >= RISK_RANK[min];
}

function mergeRiskConfig(config) {
  const incoming = safeObject(config);

  return {
    ...DEFAULT_RISK_CONFIG,
    ...incoming,
    authority: {
      ...DEFAULT_RISK_CONFIG.authority,
      ...safeObject(incoming.authority),
      finalAuthority: "Marion",
      riskClassifierAdvisoryOnly: true,
      neverOverrideMarion: true
    }
  };
}

function extractRiskText(payload = {}) {
  if (typeof payload === "string") return payload;

  const p = safeObject(payload);
  const envelope = safeObject(p.realWorldEnvelope || p.envelope || safeObject(p.realWorldTrack).envelope);

  return safeString(
    p.observationSummary ||
      p.summary ||
      p.description ||
      p.message ||
      p.text ||
      envelope.observationSummary ||
      envelope.originalSummary ||
      ""
  );
}

function matchAny(text, patterns) {
  return patterns.some((rx) => rx.test(text));
}

function classifyRiskLevel(payload = {}, options = {}) {
  const config = mergeRiskConfig(options.config);
  const text = extractRiskText(payload);
  const p = safeObject(payload);
  const envelope = safeObject(p.realWorldEnvelope || p.envelope || safeObject(p.realWorldTrack).envelope);

  const declaredRisk = normalizeRiskLevel(
    p.riskLevel ||
      envelope.riskLevel ||
      safeObject(p.realWorldTrack).riskLevel ||
      "",
    ""
  );

  if (!config.enabled) {
    return {
      version: REAL_WORLD_RISK_CLASSIFIER_VERSION,
      enabled: false,
      riskLevel: "none",
      confidence: 1,
      requiresHumanReview: false,
      reason: "risk_classifier_disabled",
      advisoryOnly: true,
      authority: config.authority,
      marionAuthority: true,
      finalAuthority: "Marion",
      source: "MarionRealWorldRiskClassifier"
    };
  }

  let inferred = normalizeRiskLevel(config.defaultRiskLevel, "low");
  let reason = "default_risk_level";

  if (matchAny(text, CRITICAL_PATTERNS)) {
    inferred = "critical";
    reason = "critical_pattern_detected";
  } else if (matchAny(text, HIGH_PATTERNS)) {
    inferred = "high";
    reason = "high_risk_pattern_detected";
  } else if (matchAny(text, MEDIUM_PATTERNS)) {
    inferred = "medium";
    reason = "medium_risk_pattern_detected";
  } else if (matchAny(text, LOW_PATTERNS)) {
    inferred = "low";
    reason = "low_risk_pattern_detected";
  }

  const finalRisk =
    declaredRisk && riskAtLeast(declaredRisk, inferred)
      ? declaredRisk
      : inferred;

  const confidence = clamp01(
    p.confidence ??
      envelope.confidence ??
      safeObject(p.realWorldTrack).confidence ??
      0.65,
    0.65
  );

  const requiresHumanReview =
    riskAtLeast(finalRisk, "high") ||
    envelope.requiresHumanReview === true ||
    envelope.blocked === true;

  return {
    version: REAL_WORLD_RISK_CLASSIFIER_VERSION,
    enabled: true,

    riskLevel: finalRisk,
    inferredRiskLevel: inferred,
    declaredRiskLevel: declaredRisk || "",
    confidence,

    requiresHumanReview,
    emergencySafeWordingRequired: finalRisk === "critical",
    cautionRequired: riskAtLeast(finalRisk, "medium"),
    hypothesisOnly: true,

    reason,

    allowedActions: [
      "describe_non_sensitive_environment",
      "mark_uncertainty",
      "recommend_caution",
      "ask_for_context",
      "human_review_if_needed"
    ],

    disallowedActions: [
      "identify_private_person",
      "declare_cause_as_fact",
      "make_criminal_determination",
      "make_medical_diagnosis",
      "make_legal_determination",
      "act_autonomously"
    ],

    publicReplyVisible: false,
    userFacing: false,
    publicText: "",
    renderText: "",
    text: "",

    advisoryOnly: true,
    forceAction: false,

    authority: {
      ...config.authority,
      finalAuthority: "Marion",
      riskClassifierAdvisoryOnly: true,
      neverOverrideMarion: true
    },

    marionAuthority: true,
    finalAuthority: "Marion",
    source: "MarionRealWorldRiskClassifier"
  };
}

function summarizeRiskClassification(result = {}) {
  const r = safeObject(result);

  return {
    version: REAL_WORLD_RISK_CLASSIFIER_VERSION,
    riskLevel: normalizeRiskLevel(r.riskLevel || "low"),
    confidence: clamp01(r.confidence, 0),
    requiresHumanReview: r.requiresHumanReview === true,
    emergencySafeWordingRequired: r.emergencySafeWordingRequired === true,
    hypothesisOnly: r.hypothesisOnly !== false,
    authority: {
      finalAuthority: "Marion",
      riskClassifierAdvisoryOnly: true,
      neverOverrideMarion: true
    },
    source: "MarionRealWorldRiskClassifier"
  };
}

module.exports = {
  classifyRiskLevel,
  summarizeRiskClassification,
  normalizeRiskLevel,
  riskAtLeast,
  mergeRiskConfig,
  extractRiskText,
  DEFAULT_RISK_CONFIG,
  REAL_WORLD_RISK_CLASSIFIER_VERSION
};
