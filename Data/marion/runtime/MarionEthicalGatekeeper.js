"use strict";

/**
 * MarionEthicalGatekeeper
 *
 * Purpose:
 * Applies Marion-safe ethical guardrails to real-world and strategic context.
 *
 * Scope:
 * - Does not override Marion.
 * - Does not identify private individuals.
 * - Does not infer sensitive traits.
 * - Does not make medical/legal/criminal determinations.
 * - Does not convert uncertainty into certainty.
 * - Produces advisory ethics metadata only.
 */

const ETHICAL_GATEKEEPER_VERSION = "nyx.marion.ethicalGatekeeper/0.2";

const DEFAULT_ETHICAL_CONFIG = Object.freeze({
  enabled: true,
  highRiskRequiresHumanReview: true,
  uncertainObservationsRequireHypothesis: true,
  publicReplyVisible: false,
  authority: {
    finalAuthority: "Marion",
    ethicalAdvisoryOnly: true,
    neverOverrideMarion: true
  }
});

const DISALLOWED_PATTERNS = Object.freeze([
  /\bidentify\s+(?:this|that)?\s*(?:person|individual|man|woman|child|face)\b/i,
  /\bwho\s+is\s+(?:this|that)\s+(?:person|individual|man|woman|child)\b/i,
  /\bface\s+recognition\b/i,
  /\btrack\s+(?:this|that)?\s*(?:person|individual)\b/i,
  /\bfollow\s+(?:this|that)?\s*(?:person|individual)\b/i,
  /\bsurveil\b/i,
  /\bunpermissioned\s+monitoring\b/i,
  /\bdiagnose\b/i,
  /\bmedical\s+condition\b/i,
  /\bmental\s+health\b/i,
  /\bcriminal\b/i,
  /\barsonist\b/i,
  /\bguilty\b/i,
  /\billegal\s+activity\b/i,
  /\blegal\s+determination\b/i,
  /\breligion\b/i,
  /\bethnicity\b/i,
  /\brace\b/i,
  /\bpolitical\s+(?:belief|affiliation|party)\b/i,
  /\bsexual\b/i,
  /\btrade\s+union\b/i
]);

const CAUTION_PATTERNS = Object.freeze([
  /\bsmoke\b/i,
  /\bfire\b/i,
  /\bburn(?:ed|t)?\b/i,
  /\binjur(?:y|ed)\b/i,
  /\bweapon\b/i,
  /\bblood\b/i,
  /\bchemical\b/i,
  /\belectrical\b/i,
  /\bhazard\b/i,
  /\bthreat\b/i
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

function normalizeRiskLevel(value) {
  const level = safeString(value).trim().toLowerCase();
  if (["none", "low", "medium", "high", "critical"].includes(level)) return level;
  return "low";
}

function mergeEthicalConfig(config) {
  const incoming = safeObject(config);

  return {
    ...DEFAULT_ETHICAL_CONFIG,
    ...incoming,
    publicReplyVisible: false,
    authority: {
      ...DEFAULT_ETHICAL_CONFIG.authority,
      ...safeObject(incoming.authority),
      finalAuthority: "Marion",
      ethicalAdvisoryOnly: true,
      neverOverrideMarion: true
    }
  };
}

function extractEthicalText(payload = {}) {
  if (typeof payload === "string") return payload;

  const p = safeObject(payload);
  const envelope = safeObject(p.realWorldEnvelope || p.envelope || p.realWorldTrack && p.realWorldTrack.envelope);

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

function containsDisallowedEthicalRequest(value) {
  const text = safeString(value);
  if (!text) return false;
  return DISALLOWED_PATTERNS.some((rx) => rx.test(text));
}

function containsCautionSignal(value) {
  const text = safeString(value);
  if (!text) return false;
  return CAUTION_PATTERNS.some((rx) => rx.test(text));
}

function evaluateEthicalGate(payload = {}, options = {}) {
  const config = mergeEthicalConfig(options.config);

  if (!config.enabled) {
    return {
      version: ETHICAL_GATEKEEPER_VERSION,
      enabled: false,
      allowed: true,
      blocked: false,
      decision: "pass",
      ethicalConcernLevel: "none",
      requiresHumanReview: false,
      reason: "ethical_gatekeeper_disabled",
      publicReplyVisible: false,
      userFacing: false,
      publicText: "",
      renderText: "",
      text: "",
      authority: config.authority,
      marionAuthority: true,
      finalAuthority: "Marion",
      source: "MarionEthicalGatekeeper"
    };
  }

  const p = safeObject(payload);
  const envelope = safeObject(p.realWorldEnvelope || p.envelope || safeObject(p.realWorldTrack).envelope);
  const text = extractEthicalText(payload);

  const riskLevel = normalizeRiskLevel(
    p.riskLevel ||
      safeObject(p.realWorldTrack).riskLevel ||
      envelope.riskLevel ||
      "low"
  );

  const confidence = clamp01(
    p.confidence ??
      safeObject(p.realWorldTrack).confidence ??
      envelope.confidence ??
      0
  );

  const disallowed = containsDisallowedEthicalRequest(text) || envelope.blocked === true;
  const caution = containsCautionSignal(text);
  const highRisk = ["high", "critical"].includes(riskLevel);
  const lowConfidence = confidence > 0 && confidence < 0.62;
  const permissionAllowed = envelope.permissionAllowed !== false && envelope.permissionStatus !== "denied" && envelope.permissionStatus !== "restricted";

  let decision = "pass";
  let ethicalConcernLevel = "low";
  let blocked = false;
  let requiresHumanReview = false;
  let reason = "ethical_pass";

  if (disallowed) {
    decision = "block";
    ethicalConcernLevel = "critical";
    blocked = true;
    requiresHumanReview = true;
    reason = "disallowed_sensitive_or_unsafe_inference";
  } else if (!permissionAllowed) {
    decision = "hold";
    ethicalConcernLevel = "high";
    blocked = true;
    requiresHumanReview = true;
    reason = "permission_boundary_not_satisfied";
  } else if (riskLevel === "critical") {
    decision = "escalate";
    ethicalConcernLevel = "critical";
    requiresHumanReview = true;
    reason = "critical_real_world_risk";
  } else if (riskLevel === "high" || highRisk) {
    decision = "caution";
    ethicalConcernLevel = "high";
    requiresHumanReview = true;
    reason = "high_real_world_risk";
  } else if (caution || riskLevel === "medium") {
    decision = "caution";
    ethicalConcernLevel = "medium";
    requiresHumanReview = false;
    reason = "caution_signal_detected";
  } else if (lowConfidence) {
    decision = "clarify";
    ethicalConcernLevel = "medium";
    requiresHumanReview = false;
    reason = "low_confidence_requires_uncertainty";
  }

  return {
    version: ETHICAL_GATEKEEPER_VERSION,
    enabled: true,

    allowed: !blocked,
    blocked,
    decision,
    ethicalConcernLevel,
    riskLevel,
    confidence,

    requiresHumanReview,
    uncertaintyRequired: lowConfidence || config.uncertainObservationsRequireHypothesis === true,
    hypothesisOnly: true,

    allowedActions: blocked
      ? ["block", "ask_clarifying_question", "human_review"]
      : ["describe_non_sensitive_context", "mark_uncertainty", "recommend_caution", "human_review_if_needed"],

    disallowedActions: [
      "identify_private_person",
      "infer_sensitive_traits",
      "make_criminal_determination",
      "make_medical_diagnosis",
      "make_legal_determination",
      "continuous_unpermissioned_monitoring",
      "state_uncertain_cause_as_fact"
    ],

    reason,

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
      ethicalAdvisoryOnly: true,
      neverOverrideMarion: true
    },

    marionAuthority: true,
    finalAuthority: "Marion",
    source: "MarionEthicalGatekeeper"
  };
}

function summarizeEthicalGate(result = {}) {
  const r = safeObject(result);

  return {
    version: ETHICAL_GATEKEEPER_VERSION,
    allowed: r.allowed !== false,
    blocked: r.blocked === true,
    decision: safeString(r.decision || "pass"),
    ethicalConcernLevel: safeString(r.ethicalConcernLevel || "none"),
    requiresHumanReview: r.requiresHumanReview === true,
    hypothesisOnly: r.hypothesisOnly !== false,
    authority: {
      finalAuthority: "Marion",
      ethicalAdvisoryOnly: true,
      neverOverrideMarion: true
    },
    source: "MarionEthicalGatekeeper"
  };
}

module.exports = {
  evaluateEthicalGate,
  summarizeEthicalGate,
  mergeEthicalConfig,
  extractEthicalText,
  containsDisallowedEthicalRequest,
  containsCautionSignal,
  DEFAULT_ETHICAL_CONFIG,
  ETHICAL_GATEKEEPER_VERSION
};
