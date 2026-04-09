"use strict";

function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _safeArray(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }
function _str(v) { return v == null ? "" : String(v); }
function _trim(v) { return _str(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeText(text = "") {
  return _lower(text).replace(/\s+/g, " ").trim();
}

function fingerprint(text = "") {
  const input = normalizeText(text);
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

function _deriveContinuityHealth({
  fallbackStreak = 0,
  repeatQueryStreak = 0,
  flags = [],
  intensity = 0,
  stateDrift = {}
} = {}) {
  const drift = _safeObj(stateDrift);
  const escalated = !!drift.escalation || !!drift.shiftedToHigherRisk;
  if (fallbackStreak >= 3 || repeatQueryStreak >= 4 || (escalated && intensity >= 0.8)) return "critical";
  if (fallbackStreak >= 2 || repeatQueryStreak >= 2 || escalated) return "fragile";
  if (flags.length >= 1 || intensity >= 0.55) return "watch";
  return "stable";
}

function buildContinuityState({
  userQuery = "",
  fusionPacket = {},
  assembledResponse = {},
  previousMemory = {}
} = {}) {
  const packet = _safeObj(fusionPacket);
  const response = _safeObj(assembledResponse);
  const prev = _safeObj(previousMemory);
  const persistent = _safeObj(prev.persistent);
  const emotion = _safeObj(packet.emotion);
  const psychology = _safeObj(packet.psychology);
  const meta = _safeObj(response.meta);
  const resetGuard = _safeObj(prev.resetGuard);

  const normalizedQuery = normalizeText(userQuery);
  const activeDomain = _trim(packet.domain || prev.domain || persistent.domain || "general") || "general";
  const activeIntent = _trim(packet.intent || prev.intent || persistent.intent || "general") || "general";
  const activeEmotion = _trim(emotion.primaryEmotion || _safeObj(prev.emotion).primaryEmotion || prev.activeEmotion || "neutral") || "neutral";
  const emotionalIntensity = _clamp01(
    Number.isFinite(Number(emotion.intensity)) ? emotion.intensity : _safeObj(prev.emotion).intensity
  );

  const fallbackApplied = Boolean(response.partial || response.fallbackApplied || meta.lowEvidence);
  const fallbackStreak = Number(prev.fallbackStreak || 0) + (fallbackApplied ? 1 : 0);
  const continuityFlags = _safeArray(resetGuard.flags);

  const continuityHealth = _deriveContinuityHealth({
    fallbackStreak,
    repeatQueryStreak: Number(prev.repeatQueryStreak || 0),
    flags: continuityFlags,
    intensity: emotionalIntensity,
    stateDrift: emotion.stateDrift || _safeObj(prev.stateDrift)
  });

  return {
    activeQuery: _trim(userQuery),
    normalizedQuery,
    queryFingerprint: fingerprint(userQuery),
    activeDomain,
    activeIntent,
    activeEmotion,
    emotionalIntensity,
    blendProfile: _safeObj(emotion.blendProfile),
    stateDrift: _safeObj(emotion.stateDrift),
    suppressionSignals: _safeArray(emotion.suppressionSignals),
    psychologyRisks: _safeArray(psychology.risks),
    psychologyPatterns: _safeArray(psychology.patterns),
    supportFlags: _safeObj(emotion.supportFlags),
    responseMode: _trim(_safeObj(response.responseMode).mode || prev.lastStableMode || "balanced") || "balanced",
    fallbackApplied,
    continuityHealth,
    timestamp: Date.now()
  };
}

module.exports = {
  buildContinuityState,
  normalizeText,
  fingerprint
};
