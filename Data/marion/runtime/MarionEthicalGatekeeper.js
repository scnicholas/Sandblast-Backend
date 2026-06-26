"use strict";

/**
 * MarionEthicalGatekeeper
 *
 * Purpose:
 * Applies Marion-safe ethical guardrails to real-world, strategic, and defensive-escalation context.
 *
 * Scope:
 * - Does not override Marion.
 * - Does not identify private individuals.
 * - Does not infer sensitive traits.
 * - Does not make medical/legal/criminal determinations.
 * - Does not convert uncertainty into certainty.
 * - Produces advisory ethics metadata only.
 * - Allows elevated defensive signalling only when justified, permissioned, explicit, and bounded.
 */

const ETHICAL_GATEKEEPER_VERSION = "nyx.marion.ethicalGatekeeper/0.3-DEFENSIVE-INTENT-JUSTIFIER";
const DEFENSIVE_ESCALATION_POLICY_VERSION = "nyx.marion.defensiveEscalationPolicy/0.1";

const DEFAULT_ETHICAL_CONFIG = Object.freeze({
  enabled: true,
  highRiskRequiresHumanReview: true,
  uncertainObservationsRequireHypothesis: true,
  publicReplyVisible: false,
  defensiveEscalation: Object.freeze({
    enabled: true,
    requiresExplicitIntent: true,
    requiresPermission: true,
    requiresProtectivePurpose: true,
    requiresImmediateThreatForElevatedOutput: true,
    advisoryOnly: true,
    recommendedMaxDb: 85,
    absoluteEmergencyMaxDb: 90,
    maxBurstSeconds: 8,
    minIntervalSeconds: 30,
    emergencyMinIntervalSeconds: 15,
    noContinuousOutput: true,
    noPunitiveUse: true,
    noCoerciveUse: true
  }),
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
  /\btrade\s+union\b/i,
  /\bpunish\b/i,
  /\bretaliat(?:e|ion)\b/i,
  /\bcoerc(?:e|ion|ive)\b/i,
  /\bharass(?:ment)?\b/i,
  /\bintimidat(?:e|ion)\b/i,
  /\bharm\s+(?:someone|them|people|a person)\b/i
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
  /\bthreat\b/i,
  /\balarm\b/i,
  /\bsiren\b/i,
  /\bdecibel\b/i,
  /\bself[-\s]?defen[cs]e\b/i,
  /\bpersonal\s+safety\b/i,
  /\bprotection\b/i
]);

const PROTECTION_PATTERNS = Object.freeze([
  /\bself[-\s]?defen[cs]e\b/i,
  /\bdefen[cs]e\s+of\s+(?:self|myself|others|another|someone)\b/i,
  /\bpersonal\s+safety\b/i,
  /\bprotect(?:ion|ing)?\s+(?:myself|self|someone|another|others|a person|the user)\b/i,
  /\bimminent\s+(?:threat|harm|danger|attack)\b/i,
  /\bactive\s+(?:threat|danger|intrusion|attack)\b/i,
  /\bemergency\b/i,
  /\bintruder\b/i,
  /\bbreak[-\s]?in\b/i,
  /\bassault\b/i,
  /\bcall\s+(?:for\s+)?help\b/i
]);

const ESCALATION_PATTERNS = Object.freeze([
  /\balarm\b/i,
  /\bsiren\b/i,
  /\baudio\s+alert\b/i,
  /\bsound\s+alert\b/i,
  /\battention[-\s]?grabbing\b/i,
  /\bdecibel\b/i,
  /\b90\s*dB\b/i,
  /\bgod[-\s]?ray\b/i,
  /\baster\b/i,
  /\btalon\b/i,
  /\bprotection\s+service\b/i,
  /\bdefensive\s+escalation\b/i
]);

const EXPLICIT_CONFIRMATION_PATTERNS = Object.freeze([
  /\bexplicit\s+(?:command|confirmation|authorization|approval)\b/i,
  /\bauthorized\s+(?:command|code|mode|phrase)\b/i,
  /\bsecure\s+(?:command|code|phrase)\b/i,
  /\bintent\s+justifier\b/i,
  /\bconfirmed\s+(?:defensive|emergency|protection)\b/i,
  /\bactivate\s+(?:defensive|protection|emergency)\s+(?:mode|alert|protocol)\b/i,
  /\bcode\s+(?:word|phrase|confirmed|verified)\b/i
]);

function safeString(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try { return String(value); } catch (_) { return ""; }
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
  const incomingEscalation = safeObject(incoming.defensiveEscalation);

  return {
    ...DEFAULT_ETHICAL_CONFIG,
    ...incoming,
    publicReplyVisible: false,
    defensiveEscalation: {
      ...DEFAULT_ETHICAL_CONFIG.defensiveEscalation,
      ...incomingEscalation,
      advisoryOnly: true,
      noContinuousOutput: true,
      noPunitiveUse: true,
      noCoerciveUse: true
    },
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
  const realWorldTrack = safeObject(p.realWorldTrack);
  const envelope = safeObject(p.realWorldEnvelope || p.envelope || realWorldTrack.envelope);
  const defensive = safeObject(p.defensiveJustification || p.defensiveIntentJustifier || p.escalationJustification || envelope.defensiveJustification);

  return safeString(
    p.observationSummary ||
      p.summary ||
      p.description ||
      p.message ||
      p.text ||
      defensive.summary ||
      defensive.reason ||
      defensive.purpose ||
      envelope.observationSummary ||
      envelope.originalSummary ||
      ""
  );
}

function anyPatternMatch(value, patterns) {
  const text = safeString(value);
  if (!text) return false;
  return patterns.some((rx) => rx.test(text));
}

function containsDisallowedEthicalRequest(value) {
  return anyPatternMatch(value, DISALLOWED_PATTERNS);
}

function containsCautionSignal(value) {
  return anyPatternMatch(value, CAUTION_PATTERNS);
}

function containsProtectionSignal(value) {
  return anyPatternMatch(value, PROTECTION_PATTERNS);
}

function containsEscalationSignal(value) {
  return anyPatternMatch(value, ESCALATION_PATTERNS);
}

function containsExplicitConfirmationSignal(value) {
  return anyPatternMatch(value, EXPLICIT_CONFIRMATION_PATTERNS);
}

function normalizeDefensiveJustification(payload = {}) {
  const p = safeObject(payload);
  const realWorldTrack = safeObject(p.realWorldTrack);
  const envelope = safeObject(p.realWorldEnvelope || p.envelope || realWorldTrack.envelope);
  const raw = safeObject(p.defensiveJustification || p.defensiveIntentJustifier || p.escalationJustification || envelope.defensiveJustification || envelope.intentJustifier);
  const text = extractEthicalText(payload);

  const purpose = safeString(raw.purpose || p.purpose || envelope.purpose || "").toLowerCase();
  const explicitCommand = raw.explicitCommand === true || raw.commandVerified === true || p.explicitCommand === true || envelope.explicitCommand === true || containsExplicitConfirmationSignal(text);
  const immediateThreat = raw.immediateThreat === true || p.immediateThreat === true || envelope.immediateThreat === true || /\bimminent\s+(?:threat|harm|danger|attack)\b|\bactive\s+(?:threat|danger|intrusion|attack)\b|\bemergency\b/i.test(text);
  const protectivePurpose = raw.protectivePurpose === true || p.protectivePurpose === true || envelope.protectivePurpose === true || containsProtectionSignal(text) || ["self_defense", "protection", "personal_safety", "emergency", "defense_of_others"].includes(purpose);
  const escalationRequested = raw.escalationRequested === true || p.escalationRequested === true || envelope.escalationRequested === true || containsEscalationSignal(text);
  const permissionAllowed = envelope.permissionAllowed !== false && envelope.permissionStatus !== "denied" && envelope.permissionStatus !== "restricted" && raw.permissionAllowed !== false && raw.permissionStatus !== "denied" && raw.permissionStatus !== "restricted";

  return {
    version: DEFENSIVE_ESCALATION_POLICY_VERSION,
    active: escalationRequested || protectivePurpose || immediateThreat || Object.keys(raw).length > 0,
    escalationRequested,
    protectivePurpose,
    immediateThreat,
    explicitCommand,
    permissionAllowed,
    purpose: safeString(raw.purpose || p.purpose || envelope.purpose || (protectivePurpose ? "protection" : "")),
    reason: safeString(raw.reason || raw.summary || p.reason || envelope.reason || text),
    commandId: safeString(raw.commandId || p.commandId || envelope.commandId || ""),
    source: "MarionEthicalGatekeeper"
  };
}

function evaluateDefensiveEscalation(payload = {}, config = DEFAULT_ETHICAL_CONFIG) {
  const policy = safeObject(config.defensiveEscalation);
  const justification = normalizeDefensiveJustification(payload);
  const enabled = policy.enabled !== false;

  const allowedByIntent = !policy.requiresExplicitIntent || justification.explicitCommand === true;
  const allowedByPurpose = !policy.requiresProtectivePurpose || justification.protectivePurpose === true;
  const allowedByPermission = !policy.requiresPermission || justification.permissionAllowed === true;
  const elevatedAllowedByThreat = !policy.requiresImmediateThreatForElevatedOutput || justification.immediateThreat === true;

  const escalationAllowed = enabled && justification.active === true && allowedByIntent && allowedByPurpose && allowedByPermission && elevatedAllowedByThreat;
  const standardAttentionAllowed = enabled && justification.active === true && allowedByIntent && allowedByPurpose && allowedByPermission;

  let reason = "no_defensive_escalation_requested";
  if (!enabled && justification.active) reason = "defensive_escalation_policy_disabled";
  else if (justification.active && !allowedByPurpose) reason = "defensive_escalation_requires_protective_purpose";
  else if (justification.active && !allowedByIntent) reason = "defensive_escalation_requires_explicit_command";
  else if (justification.active && !allowedByPermission) reason = "defensive_escalation_requires_permission_boundary";
  else if (justification.active && !elevatedAllowedByThreat) reason = "elevated_output_requires_immediate_threat";
  else if (escalationAllowed) reason = "defensive_escalation_justified_and_bounded";
  else if (standardAttentionAllowed) reason = "standard_attention_alert_only";

  return {
    version: DEFENSIVE_ESCALATION_POLICY_VERSION,
    active: justification.active,
    escalationAllowed,
    standardAttentionAllowed,
    requiresHumanReview: justification.active && (escalationAllowed || !standardAttentionAllowed),
    reason,
    justification,
    boundedOutputPolicy: {
      advisoryOnly: true,
      soundOutputType: "attention_alert_only",
      recommendedMaxDb: Number(policy.recommendedMaxDb) || 85,
      absoluteEmergencyMaxDb: Number(policy.absoluteEmergencyMaxDb) || 90,
      maxBurstSeconds: Number(policy.maxBurstSeconds) || 8,
      minIntervalSeconds: Number(policy.minIntervalSeconds) || 30,
      emergencyMinIntervalSeconds: Number(policy.emergencyMinIntervalSeconds) || 15,
      noContinuousOutput: true,
      noPunitiveUse: true,
      noCoerciveUse: true,
      noHarmIntent: true
    },
    allowedActions: escalationAllowed
      ? ["controlled_attention_alert", "notify_authorities_if_configured", "human_review", "log_justification"]
      : standardAttentionAllowed
        ? ["standard_attention_alert", "human_review_if_needed", "log_justification"]
        : ["hold_escalation", "ask_for_explicit_protective_justification", "human_review"],
    disallowedActions: [
      "continuous_alarm_output",
      "punitive_alarm_use",
      "coercive_alarm_use",
      "unpermissioned_alerting",
      "identity_targeting",
      "harmful_sound_output"
    ],
    publicReplyVisible: false,
    userFacing: false,
    source: "MarionEthicalGatekeeper"
  };
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
      defensiveEscalation: evaluateDefensiveEscalation(payload, config),
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
  const realWorldTrack = safeObject(p.realWorldTrack);
  const envelope = safeObject(p.realWorldEnvelope || p.envelope || realWorldTrack.envelope);
  const text = extractEthicalText(payload);

  const riskLevel = normalizeRiskLevel(
    p.riskLevel ||
      realWorldTrack.riskLevel ||
      envelope.riskLevel ||
      safeObject(p.riskClassification).riskLevel ||
      safeObject(p.riskClassification).level ||
      "low"
  );

  const confidence = clamp01(
    p.confidence ??
      realWorldTrack.confidence ??
      envelope.confidence ??
      safeObject(p.riskClassification).confidence ??
      0
  );

  const disallowed = containsDisallowedEthicalRequest(text) || envelope.blocked === true;
  const caution = containsCautionSignal(text);
  const highRisk = ["high", "critical"].includes(riskLevel);
  const lowConfidence = confidence > 0 && confidence < 0.62;
  const permissionAllowed = envelope.permissionAllowed !== false && envelope.permissionStatus !== "denied" && envelope.permissionStatus !== "restricted";
  const defensiveEscalation = evaluateDefensiveEscalation(payload, config);

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
  } else if (defensiveEscalation.active && defensiveEscalation.escalationAllowed) {
    decision = "protected_escalation_authorized";
    ethicalConcernLevel = defensiveEscalation.justification.immediateThreat ? "critical" : "high";
    requiresHumanReview = true;
    reason = defensiveEscalation.reason;
  } else if (defensiveEscalation.active && !defensiveEscalation.standardAttentionAllowed) {
    decision = "hold";
    ethicalConcernLevel = "high";
    blocked = true;
    requiresHumanReview = true;
    reason = defensiveEscalation.reason;
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

  const allowedActions = blocked
    ? ["block", "ask_clarifying_question", "human_review"]
    : defensiveEscalation.active
      ? defensiveEscalation.allowedActions
      : ["describe_non_sensitive_context", "mark_uncertainty", "recommend_caution", "human_review_if_needed"];

  return {
    version: ETHICAL_GATEKEEPER_VERSION,
    enabled: true,

    allowed: !blocked,
    blocked,
    decision,
    ethicalConcernLevel,
    riskLevel,
    confidence,

    requiresHumanReview: requiresHumanReview || (config.highRiskRequiresHumanReview === true && highRisk),
    uncertaintyRequired: lowConfidence || config.uncertainObservationsRequireHypothesis === true,
    hypothesisOnly: true,

    defensiveEscalation,
    defensiveJustification: defensiveEscalation.justification,

    allowedActions,

    disallowedActions: [
      "identify_private_person",
      "infer_sensitive_traits",
      "make_criminal_determination",
      "make_medical_diagnosis",
      "make_legal_determination",
      "continuous_unpermissioned_monitoring",
      "state_uncertain_cause_as_fact",
      "continuous_alarm_output",
      "punitive_alarm_use",
      "coercive_alarm_use",
      "harmful_sound_output"
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
  const defensiveEscalation = safeObject(r.defensiveEscalation);

  return {
    version: ETHICAL_GATEKEEPER_VERSION,
    allowed: r.allowed !== false,
    blocked: r.blocked === true,
    decision: safeString(r.decision || "pass"),
    ethicalConcernLevel: safeString(r.ethicalConcernLevel || "none"),
    requiresHumanReview: r.requiresHumanReview === true,
    hypothesisOnly: r.hypothesisOnly !== false,
    defensiveEscalation: {
      active: defensiveEscalation.active === true,
      escalationAllowed: defensiveEscalation.escalationAllowed === true,
      standardAttentionAllowed: defensiveEscalation.standardAttentionAllowed === true,
      reason: safeString(defensiveEscalation.reason || "")
    },
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
  evaluateDefensiveEscalation,
  summarizeEthicalGate,
  mergeEthicalConfig,
  extractEthicalText,
  normalizeDefensiveJustification,
  containsDisallowedEthicalRequest,
  containsCautionSignal,
  containsProtectionSignal,
  containsEscalationSignal,
  containsExplicitConfirmationSignal,
  DEFAULT_ETHICAL_CONFIG,
  ETHICAL_GATEKEEPER_VERSION,
  DEFENSIVE_ESCALATION_POLICY_VERSION,
  default: evaluateEthicalGate
};
