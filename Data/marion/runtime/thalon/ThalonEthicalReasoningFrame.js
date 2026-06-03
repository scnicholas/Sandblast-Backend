"use strict";

/**
 * ThalonEthicalReasoningFrame
 *
 * Purpose:
 * Builds advisory-only ethical reasoning metadata for Marion.
 *
 * Scope:
 * - Does not override Marion.
 * - Does not generate public reply text.
 * - Does not make medical/legal/criminal determinations.
 * - Converts uncertainty into review flags, not certainty.
 */

const THALON_ETHICAL_REASONING_FRAME_VERSION = "nyx.thalon.ethicalReasoningFrame/0.1";

const DEFAULT_ETHICAL_REASONING_CONFIG = Object.freeze({
  enabled: true,
  publicReplyVisible: false,
  authority: {
    finalAuthority: "Marion",
    thalonAdvisoryOnly: true,
    neverOverrideMarion: true
  }
});

const ETHICAL_PRESSURE_PATTERNS = Object.freeze([
  /\bethic(?:al|s)\b/i,
  /\bsafety\b/i,
  /\brisk\b/i,
  /\bharm\b/i,
  /\bprivacy\b/i,
  /\bpermission\b/i,
  /\bconsent\b/i,
  /\buncertain\b/i,
  /\btrade[-\s]?off\b/i,
  /\bshould\s+i\b/i,
  /\bwhat\s+is\s+the\s+right\s+move\b/i
]);

function safeString(value) {
  if (value === null || value === undefined) return "";
  try { return String(value).replace(/\s+/g, " ").trim(); } catch (_) { return ""; }
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.min(1, Number(fallback) || 0));
  return Math.max(0, Math.min(1, n));
}

function mergeEthicalReasoningConfig(config) {
  const incoming = safeObject(config);
  return {
    ...DEFAULT_ETHICAL_REASONING_CONFIG,
    ...incoming,
    publicReplyVisible: false,
    authority: {
      ...DEFAULT_ETHICAL_REASONING_CONFIG.authority,
      ...safeObject(incoming.authority),
      finalAuthority: "Marion",
      thalonAdvisoryOnly: true,
      neverOverrideMarion: true
    }
  };
}

function extractScenarioText(payload = {}) {
  if (typeof payload === "string") return payload;
  const p = safeObject(payload);
  return safeString(p.scenario || p.summary || p.message || p.text || p.prompt || p.description || "");
}

function buildThalonEthicalReasoningFrame(payload = {}, options = {}) {
  const config = mergeEthicalReasoningConfig(options.config);

  if (!config.enabled) {
    return {
      version: THALON_ETHICAL_REASONING_FRAME_VERSION,
      enabled: false,
      active: false,
      ethicalPressureScore: 0,
      ethicalConcernLevel: "none",
      reviewRecommended: false,
      requiresHumanReview: false,
      reason: "thalon_ethical_reasoning_disabled",
      advisoryOnly: true,
      publicReplyVisible: false,
      userFacing: false,
      text: "",
      renderText: "",
      authority: config.authority,
      marionAuthority: true,
      finalAuthority: "Marion",
      source: "ThalonEthicalReasoningFrame"
    };
  }

  const p = safeObject(payload);
  const text = extractScenarioText(payload);
  let score = clamp01(p.ethicalPressureScore || p.ethicalPressure || p.pressure || 0);

  for (const rx of ETHICAL_PRESSURE_PATTERNS) {
    if (rx.test(text)) score += 0.1;
  }

  if (p.requiresHumanReview === true) score += 0.25;
  if (p.uncertainty === true || p.uncertain === true) score += 0.15;
  score = clamp01(score);

  const concernLevel = score >= 0.75 ? "high" : score >= 0.45 ? "medium" : score > 0 ? "low" : "none";

  return {
    version: THALON_ETHICAL_REASONING_FRAME_VERSION,
    enabled: true,
    active: score > 0 || Boolean(text),
    ethicalPressureScore: score,
    ethicalConcernLevel: concernLevel,
    reviewRecommended: score >= 0.45,
    requiresHumanReview: score >= 0.75 || p.requiresHumanReview === true,
    reason: score >= 0.75 ? "high_ethical_pressure" : score >= 0.45 ? "ethical_review_recommended" : score > 0 ? "low_ethical_signal" : "no_ethical_signal",
    advisoryOnly: true,
    finalAnswerAuthorized: false,
    publicReplyVisible: false,
    userFacing: false,
    text: "",
    renderText: "",
    authority: config.authority,
    marionAuthority: true,
    finalAuthority: "Marion",
    source: "ThalonEthicalReasoningFrame"
  };
}

module.exports = {
  THALON_ETHICAL_REASONING_FRAME_VERSION,
  buildThalonEthicalReasoningFrame,
  default: buildThalonEthicalReasoningFrame
};
