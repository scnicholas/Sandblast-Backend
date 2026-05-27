"use strict";

/**
 * Nyx Guidance Actions
 *
 * Purpose:
 * Lightweight user guidance chips.
 *
 * Contract:
 * - Suggests, never hijacks.
 * - No backend dependency.
 * - No Marion mention.
 * - Small labels only.
 */

const NYX_GUIDANCE_ACTIONS_VERSION = "nyx.evolution.guidanceActions/1.0";

const GUIDANCE_ACTIONS_BY_LANE = Object.freeze({
  general: ["Ask", "Explore", "Refine", "Build"],
  chat: ["Ask", "Rewrite", "Explain", "Plan"],
  music: ["Top 10", "Moments", "Live", "Search"],
  live: ["Radio", "TV", "Listen", "Watch"],
  info: ["Stories", "Topics", "Summarize", "Open"],
  view: ["Watch", "Preview", "Open", "Back"],
  ai: ["Refine", "Compare", "Build", "Test"],
  fallback: ["Try again", "Rephrase", "Switch lane", "Reset"],
});

function safeStr(value, fallback = "") {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text || fallback;
}

function normalizeLane(value, fallback = "general") {
  const lane = safeStr(value, fallback).toLowerCase().replace(/[^a-z0-9]+/g, "_");

  const aliases = {
    news: "info",
    media: "view",
    watch: "view",
    voice: "chat",
  };

  return aliases[lane] || lane;
}

function isSafeActionLabel(value) {
  const text = safeStr(value);
  if (!text || text.length > 18) return false;
  return !/marion|debug|telemetry|token|secret|finalEnvelope|failureSignature/i.test(text);
}

function getGuidanceActions(input = {}) {
  const lane = normalizeLane(input.lane || input.activeLane || "general");
  const fallback = input.fallbackUsed === true || input.state === "fallback";
  const key = fallback ? "fallback" : lane;
  const actions = GUIDANCE_ACTIONS_BY_LANE[key] || GUIDANCE_ACTIONS_BY_LANE.general;

  return actions.filter(isSafeActionLabel).slice(0, 4).map((label) => ({
    label,
    lane: key,
    safe: true,
    visualOnly: true,
  }));
}

module.exports = {
  NYX_GUIDANCE_ACTIONS_VERSION,
  GUIDANCE_ACTIONS_BY_LANE,
  safeStr,
  normalizeLane,
  isSafeActionLabel,
  getGuidanceActions,
};
