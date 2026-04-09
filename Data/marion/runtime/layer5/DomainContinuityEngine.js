"use strict";

function _trim(v) { return v == null ? "" : String(v).trim(); }
function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }

function buildDomainContinuity({
  fusionPacket = {},
  previousMemory = {}
} = {}) {
  const packet = _safeObj(fusionPacket);
  const prev = _safeObj(previousMemory);
  const previousPersistent = _safeObj(prev.persistent);

  const currentDomain = _trim(packet.domain || "general") || "general";
  const previousDomain = _trim(prev.domain || previousPersistent.domain || "general") || "general";

  const maintained = currentDomain === previousDomain && currentDomain !== "general";
  const shifted = previousDomain !== "general" && currentDomain !== previousDomain && currentDomain !== "general";
  const degraded = currentDomain === "general" && previousDomain !== "general";
  const regained = currentDomain !== "general" && previousDomain === "general";

  const stableDomainStreak = maintained
    ? (Number(prev.stableDomainStreak || 0) || 0) + 1
    : (currentDomain !== "general" ? 1 : 0);

  const continuityScore = maintained ? 1
    : shifted ? 0.45
    : degraded ? 0.25
    : regained ? 0.6
    : 0.5;

  return {
    previousDomain,
    currentDomain,
    maintained,
    shifted,
    degraded,
    regained,
    preferredDomain: currentDomain !== "general" ? currentDomain : previousDomain,
    stableDomainStreak,
    continuityScore: Number(continuityScore.toFixed(3))
  };
}

module.exports = {
  buildDomainContinuity
};
