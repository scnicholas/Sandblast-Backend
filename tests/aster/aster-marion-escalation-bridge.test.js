"use strict";

/**
 * AsterMarionEscalationBridge.js
 *
 * Runtime role:
 * - Convert Aster environmental observation/risk metadata into a Marion-safe
 *   real-world advisory packet.
 * - Recommend escalation for elevated/high/critical risk.
 * - Remain advisory-only.
 * - Never authorize final public answers.
 */

const ASTER_MARION_ESCALATION_BRIDGE_VERSION = "nyx.aster.marionEscalationBridge/0.2";

const RISK_ALIASES = Object.freeze({
  normal: "none",
  stable: "none",
  none: "none",
  low: "low",
  mild: "low",
  medium: "moderate",
  med: "moderate",
  moderate: "moderate",
  elevated: "elevated",
  severe: "critical",
  high: "high",
  critical: "critical",
  unknown: "unknown",
  fallback: "unknown"
});

const RISK_RANK = Object.freeze({
  unknown: -1,
  none: 0,
  low: 1,
  moderate: 2,
  elevated: 3,
  high: 4,
  critical: 5
});

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).replace(/\s+/g, " ").trim() || fallback;
}

function normalizeRiskLevel(level) {
  const raw = safeString(level, "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return RISK_ALIASES[raw] || "unknown";
}

function riskRank(level) {
  const normalized = normalizeRiskLevel(level);
  return Object.prototype.hasOwnProperty.call(RISK_RANK, normalized)
    ? RISK_RANK[normalized]
    : RISK_RANK.unknown;
}

function riskAtLeast(level, minimum) {
  return riskRank(level) >= riskRank(minimum);
}

function extractEnvelope(payload = {}) {
  const p = safeObject(payload);
  const realWorldTrack = safeObject(p.realWorldTrack);
  const riskClassification = safeObject(p.riskClassification);
  const observation = safeObject(p.observation);
  const nestedEnvelope = safeObject(realWorldTrack.envelope);

  return safeObject(
    p.envelope ||
    p.realWorldEnvelope ||
    p.asterEnvelope ||
    nestedEnvelope ||
    observation.envelope ||
    riskClassification.envelope
  );
}

function extractRiskLevel(payload = {}, envelope = {}) {
  const p = safeObject(payload);
  const e = safeObject(envelope);
  const riskClassification = safeObject(p.riskClassification);
  const risk = safeObject(p.risk || e.risk || riskClassification.risk);
  const realWorldTrack = safeObject(p.realWorldTrack);

  return normalizeRiskLevel(
    p.riskLevel ||
    e.riskLevel ||
    e.level ||
    risk.level ||
    risk.riskLevel ||
    riskClassification.riskLevel ||
    riskClassification.level ||
    realWorldTrack.riskLevel ||
    "unknown"
  );
}

function buildAsterMarionEscalationBridge(payload = {}, options = {}) {
  const p = safeObject(payload);
  const envelope = extractEnvelope(p);
  const riskLevel = extractRiskLevel(p, envelope);

  const explicitHumanReview =
    p.requiresHumanReview === true ||
    envelope.requiresHumanReview === true ||
    safeObject(p.riskClassification).requiresHumanReview === true ||
    safeObject(p.realWorldTrack).requiresHumanReview === true;

  const elevatedOrHigher = riskAtLeast(riskLevel, "elevated");
  const requiresHumanReview = explicitHumanReview || elevatedOrHigher;

  const active = Boolean(
    Object.keys(envelope).length ||
    p.active === true ||
    riskLevel !== "unknown"
  );

  return {
    version: ASTER_MARION_ESCALATION_BRIDGE_VERSION,
    active,
    lane: "real_world",
    source: "AsterMarionEscalationBridge",
    envelope,
    riskLevel,
    riskRank: riskRank(riskLevel),
    requiresHumanReview,
    escalationRecommended: requiresHumanReview,
    advisoryOnly: true,

    /**
     * Authority guardrails.
     * Aster can recommend escalation. Marion authorizes all public final output.
     */
    finalAnswerAuthorized: false,
    finalAuthority: "Marion",
    marionAuthorityRequired: true,
    publicReplyVisible: false,
    userFacing: false,
    publicText: "",
    renderText: "",
    text: "",
    options: safeObject(options),
    updatedAt: Date.now()
  };
}

module.exports = {
  ASTER_MARION_ESCALATION_BRIDGE_VERSION,
  RISK_RANK,
  normalizeRiskLevel,
  riskRank,
  riskAtLeast,
  buildAsterMarionEscalationBridge,
  default: buildAsterMarionEscalationBridge
};
