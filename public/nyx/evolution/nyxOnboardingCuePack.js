"use strict";

/**
 * Nyx Onboarding Cue Pack
 *
 * Purpose:
 * Clean user-facing onboarding cues.
 *
 * Rule:
 * No Marion mention.
 * No clipped phrasing like “Where to?”
 * No over-casual phrasing.
 */

const NYX_ONBOARDING_CUE_PACK_VERSION = "nyx.evolution.onboardingCuePack/1.0";

const DEFAULT_ONBOARDING_CUE =
  "Welcome. I’m ready when you are. What would you like to work on?";

const NYX_ONBOARDING_CUES = Object.freeze({
  general: [
    DEFAULT_ONBOARDING_CUE,
    "Tell me what you want to work through, and I’ll help you shape the next step.",
    "Send me the idea, question, or task. I’ll help make it manageable.",
  ],

  chat: [
    DEFAULT_ONBOARDING_CUE,
    "Ask me a question, send a draft, or tell me what you want to improve.",
  ],

  music: [
    "I can help you explore music moments, top songs, or live listening.",
    "Pick a year, artist, or music lane, and I’ll help you navigate it.",
  ],

  live: [
    "I can help you move into live listening or viewing.",
    "Choose radio or TV, and I’ll keep the path simple.",
  ],

  info: [
    "I can help you browse stories and organize what matters.",
    "Tell me the topic you want, and I’ll help narrow the news lane.",
  ],

  view: [
    "I can help you move into visual content without losing the chat flow.",
    "Choose what you want to watch or explore next.",
  ],

  ai: [
    "Tell me what you’re building, and I’ll help sharpen the next step.",
    "Send the concept, script, or system issue, and I’ll help structure it.",
  ],

  fallback: [
    "I’m still with you. Try sending the request again with one clear target.",
    "That came through a little thin. Send the exact thing you want handled next.",
  ],
});

function safeStr(value, fallback = "") {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text || fallback;
}

function normalizeLane(value, fallback = "general") {
  const lane = safeStr(value, fallback).toLowerCase().replace(/[^a-z0-9]+/g, "_");

  const aliases = {
    news: "info",
    about: "general",
    watch: "view",
    media: "view",
    voice: "chat",
  };

  return aliases[lane] || lane;
}

function getCueListForLane(lane = "general") {
  const normalized = normalizeLane(lane);
  return NYX_ONBOARDING_CUES[normalized] || NYX_ONBOARDING_CUES.general;
}

module.exports = {
  NYX_ONBOARDING_CUE_PACK_VERSION,
  DEFAULT_ONBOARDING_CUE,
  NYX_ONBOARDING_CUES,
  safeStr,
  normalizeLane,
  getCueListForLane,
};
