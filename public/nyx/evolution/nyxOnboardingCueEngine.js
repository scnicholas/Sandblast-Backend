"use strict";

/**
 * Nyx Onboarding Cue Engine
 *
 * Purpose:
 * Selects polished onboarding cues based on lane/context.
 *
 * Contract:
 * - No Marion mention.
 * - No clipped “Where to?” style phrasing.
 * - Does not call backend.
 * - Does not mutate assistant reply path.
 */

const {
  DEFAULT_ONBOARDING_CUE,
  getCueListForLane,
  normalizeLane,
  safeStr,
} = require("./nyxOnboardingCuePack");

const NYX_ONBOARDING_CUE_ENGINE_VERSION = "nyx.evolution.onboardingCueEngine/1.0";

const BLOCKED_CUE_PATTERNS = Object.freeze([
  /\bmarion\b/i,
  /\bwhere to\??$/i,
  /^hi,\s*i['’]?m nyx\.?\s*where/i,
  /\bdebug\b/i,
  /\btelemetry\b/i,
  /\bfailureSignature\b/i,
  /\bfinalEnvelope\b/i,
]);

function isCueSafe(value) {
  const text = safeStr(value);
  if (!text) return false;
  return !BLOCKED_CUE_PATTERNS.some((rx) => rx.test(text));
}

function selectCueFromList(list = [], seed = 0) {
  const safe = (Array.isArray(list) ? list : []).filter(isCueSafe);

  if (!safe.length) return DEFAULT_ONBOARDING_CUE;

  const index = Math.abs(Number(seed || 0)) % safe.length;
  return safe[index];
}

function buildOnboardingCue(input = {}) {
  const lane = normalizeLane(input.lane || input.activeLane || "general");
  const cues = getCueListForLane(lane);
  const seedSource = safeStr(input.seed || input.turnId || input.requestId || lane);
  let seed = 0;

  for (let i = 0; i < seedSource.length; i += 1) {
    seed = ((seed << 5) - seed) + seedSource.charCodeAt(i);
    seed |= 0;
  }

  const cue = selectCueFromList(cues, seed);

  return {
    version: NYX_ONBOARDING_CUE_ENGINE_VERSION,
    lane,
    cue,
    visible: true,
    safe: isCueSafe(cue),
  };
}

function getResetGreeting() {
  return DEFAULT_ONBOARDING_CUE;
}

module.exports = {
  NYX_ONBOARDING_CUE_ENGINE_VERSION,
  BLOCKED_CUE_PATTERNS,
  isCueSafe,
  selectCueFromList,
  buildOnboardingCue,
  getResetGreeting,
};