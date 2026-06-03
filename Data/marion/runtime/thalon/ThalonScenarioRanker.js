"use strict";

/**
 * ThalonScenarioRanker
 *
 * Purpose:
 * Ranks candidate strategic paths as advisory metadata for Marion.
 *
 * Scope:
 * - Does not choose the final answer.
 * - Does not expose internal reasoning publicly.
 * - Preserves Marion as final authority.
 */

const THALON_SCENARIO_RANKER_VERSION = "nyx.thalon.scenarioRanker/0.1";

const DEFAULT_SCENARIO_RANKER_CONFIG = Object.freeze({
  enabled: true,
  maxScenarios: 8,
  authority: {
    finalAuthority: "Marion",
    thalonAdvisoryOnly: true,
    neverOverrideMarion: true
  }
});

function safeString(value) {
  if (value === null || value === undefined) return "";
  try { return String(value).replace(/\s+/g, " ").trim(); } catch (_) { return ""; }
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.min(1, Number(fallback) || 0));
  return Math.max(0, Math.min(1, n));
}

function mergeScenarioRankerConfig(config) {
  const incoming = safeObject(config);
  return {
    ...DEFAULT_SCENARIO_RANKER_CONFIG,
    ...incoming,
    maxScenarios: Math.max(1, Math.min(20, Number(incoming.maxScenarios || DEFAULT_SCENARIO_RANKER_CONFIG.maxScenarios))),
    authority: {
      ...DEFAULT_SCENARIO_RANKER_CONFIG.authority,
      ...safeObject(incoming.authority),
      finalAuthority: "Marion",
      thalonAdvisoryOnly: true,
      neverOverrideMarion: true
    }
  };
}

function normalizeScenario(item, index) {
  const obj = safeObject(item);
  const label = safeString(obj.label || obj.name || obj.title || `scenario_${index + 1}`);
  const clarity = clamp01(obj.clarity, 0.5);
  const safety = clamp01(obj.safety, 0.5);
  const reversibility = clamp01(obj.reversibility, 0.5);
  const strategicValue = clamp01(obj.strategicValue || obj.value, 0.5);
  const risk = clamp01(obj.risk, 0);
  const uncertainty = clamp01(obj.uncertainty, 0);
  const score = clamp01((clarity * 0.2) + (safety * 0.25) + (reversibility * 0.15) + (strategicValue * 0.25) - (risk * 0.1) - (uncertainty * 0.05));

  return {
    id: safeString(obj.id || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `scenario_${index + 1}`),
    label,
    score,
    band: score >= 0.75 ? "strong" : score >= 0.45 ? "moderate" : "weak",
    risk,
    uncertainty,
    advisoryOnly: true
  };
}

function extractScenarios(payload = {}) {
  const p = safeObject(payload);
  return safeArray(p.scenarios || p.options || p.paths || p.candidates);
}

function rankThalonScenarios(payload = {}, options = {}) {
  const config = mergeScenarioRankerConfig(options.config);

  if (!config.enabled) {
    return {
      version: THALON_SCENARIO_RANKER_VERSION,
      enabled: false,
      active: false,
      rankedScenarios: [],
      topScenario: null,
      reviewRecommended: false,
      advisoryOnly: true,
      finalAnswerAuthorized: false,
      authority: config.authority,
      marionAuthority: true,
      finalAuthority: "Marion",
      source: "ThalonScenarioRanker"
    };
  }

  const rankedScenarios = extractScenarios(payload)
    .slice(0, config.maxScenarios)
    .map(normalizeScenario)
    .sort((a, b) => b.score - a.score);

  const topScenario = rankedScenarios.length ? rankedScenarios[0] : null;

  return {
    version: THALON_SCENARIO_RANKER_VERSION,
    enabled: true,
    active: rankedScenarios.length > 0,
    rankedScenarios,
    topScenario,
    reviewRecommended: rankedScenarios.length > 1,
    advisoryOnly: true,
    finalAnswerAuthorized: false,
    publicReplyVisible: false,
    userFacing: false,
    text: "",
    renderText: "",
    authority: config.authority,
    marionAuthority: true,
    finalAuthority: "Marion",
    source: "ThalonScenarioRanker"
  };
}

module.exports = {
  THALON_SCENARIO_RANKER_VERSION,
  rankThalonScenarios,
  default: rankThalonScenarios
};
