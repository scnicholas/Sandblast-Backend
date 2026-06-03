"use strict";

/**
 * ThalonReadinessStub
 *
 * Purpose:
 * Creates the first readiness doorway for Thalon ethical/strategic review.
 *
 * Scope:
 * - Does not implement full Thalon reasoning.
 * - Does not override Marion.
 * - Does not make final decisions.
 * - Produces strategic/ethical readiness metadata only.
 */

const THALON_READINESS_VERSION = "nyx.thalon.readinessStub/0.1";

const DEFAULT_THALON_CONFIG = Object.freeze({
  enabled: true,
  strategicReviewMinConcern: "medium",
  authority: {
    finalAuthority: "Marion",
    thalonAdvisoryOnly: true,
    neverOverrideMarion: true
  }
});

const CONCERN_RANK = Object.freeze({
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
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

function normalizeConcernLevel(value, fallback = "low") {
  const level = safeString(value).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(CONCERN_RANK, level)) return level;
  return Object.prototype.hasOwnProperty.call(CONCERN_RANK, fallback) ? fallback : "low";
}

function concernAtLeast(value, threshold) {
  const level = normalizeConcernLevel(value, "none");
  const min = normalizeConcernLevel(threshold, "none");
  return CONCERN_RANK[level] >= CONCERN_RANK[min];
}

function mergeThalonConfig(config) {
  const incoming = safeObject(config);

  return {
    ...DEFAULT_THALON_CONFIG,
    ...incoming,
    authority: {
      ...DEFAULT_THALON_CONFIG.authority,
      ...safeObject(incoming.authority),
      finalAuthority: "Marion",
      thalonAdvisoryOnly: true,
      neverOverrideMarion: true
    }
  };
}

function extractConcernLevel(packet = {}) {
  const p = safeObject(packet);
  const ethical = safeObject(p.ethicalGate || p.ethicalReview || p.ethicalTrack);
  const risk = safeObject(p.riskClassification || p.riskClassifier || p.realWorldRisk);
  const realWorld = safeObject(p.realWorldTrack || p.realWorldEnvelope || p.envelope);

  if (ethical.ethicalConcernLevel) return normalizeConcernLevel(ethical.ethicalConcernLevel);
  if (risk.riskLevel === "critical") return "critical";
  if (risk.riskLevel === "high") return "high";
  if (risk.riskLevel === "medium") return "medium";
  if (realWorld.requiresHumanReview === true) return "medium";
  if (p.notificationReady === true) return "medium";

  return "low";
}

function buildThalonReadinessPacket(packet = {}, options = {}) {
  const config = mergeThalonConfig(options.config);

  if (!config.enabled) {
    return {
      version: THALON_READINESS_VERSION,
      enabled: false,
      thalonReady: false,
      strategicReviewRequired: false,
      ethicalConcernLevel: "none",
      recommendationMode: "disabled",
      reason: "thalon_readiness_disabled",
      advisoryOnly: true,
      authority: config.authority,
      marionAuthority: true,
      finalAuthority: "Marion",
      source: "ThalonReadinessStub"
    };
  }

  const p = safeObject(packet);
  const concern = extractConcernLevel(packet);
  const strategicReviewRequired =
    concernAtLeast(concern, config.strategicReviewMinConcern) ||
    safeObject(p.ethicalGate).requiresHumanReview === true ||
    safeObject(p.riskClassification).requiresHumanReview === true ||
    safeObject(p.coordinationMeta).requiresHumanReview === true;

  return {
    version: THALON_READINESS_VERSION,
    enabled: true,

    thalonReady: true,
    strategicReviewRequired,
    ethicalConcernLevel: concern,

    recommendationMode: strategicReviewRequired ? "advisory_review" : "standby",
    reviewLane: strategicReviewRequired ? "ethical_strategy_review" : "none",

    reason: strategicReviewRequired
      ? "strategic_review_recommended"
      : "strategic_review_not_required",

    acceptedInputs: {
      ethicalGate: Object.keys(safeObject(p.ethicalGate)).length > 0,
      riskClassification: Object.keys(safeObject(p.riskClassification)).length > 0,
      dualTrack: Object.keys(safeObject(p.coordinationMeta)).length > 0,
      realWorld: Object.keys(safeObject(p.realWorldTrack || p.realWorldEnvelope)).length > 0,
      language: Object.keys(safeObject(p.languageTrack || p.languageMeta)).length > 0
    },

    publicReplyVisible: false,
    userFacing: false,
    publicText: "",
    renderText: "",
    text: "",

    advisoryOnly: true,
    forceDecision: false,

    authority: {
      ...config.authority,
      finalAuthority: "Marion",
      thalonAdvisoryOnly: true,
      neverOverrideMarion: true
    },

    marionAuthority: true,
    finalAuthority: "Marion",
    source: "ThalonReadinessStub"
  };
}

function summarizeThalonReadiness(packet = {}) {
  const p = safeObject(packet);

  return {
    version: THALON_READINESS_VERSION,
    thalonReady: p.thalonReady === true,
    strategicReviewRequired: p.strategicReviewRequired === true,
    ethicalConcernLevel: normalizeConcernLevel(p.ethicalConcernLevel || "none", "none"),
    recommendationMode: safeString(p.recommendationMode || "standby"),
    authority: {
      finalAuthority: "Marion",
      thalonAdvisoryOnly: true,
      neverOverrideMarion: true
    },
    source: "ThalonReadinessStub"
  };
}

module.exports = {
  buildThalonReadinessPacket,
  summarizeThalonReadiness,
  extractConcernLevel,
  normalizeConcernLevel,
  concernAtLeast,
  mergeThalonConfig,
  DEFAULT_THALON_CONFIG,
  THALON_READINESS_VERSION
};
