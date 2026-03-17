"use strict";

function _str(v) {
  return v == null ? "" : String(v);
}

function _trim(v) {
  return _str(v).trim();
}

function _lower(v) {
  return _trim(v).toLowerCase();
}

function _containsAny(text, phrases) {
  const t = _lower(text);
  return (phrases || []).some((p) => t.includes(_lower(p)));
}

function classifyQuery(input = {}) {
  const text = _trim(input.text);
  const affect = _safeObj(input.affect);
  const supportFlags = _safeObj(input.supportFlags);

  const crisis = _containsAny(text, [
    "i want to die",
    "hurt myself",
    "can't stay safe",
    "not safe with myself",
    "i might hurt someone",
    "going to snap",
    "don't want to be here"
  ]);

  const psychology = crisis || _containsAny(text, [
    "overwhelmed",
    "spiraling",
    "numb",
    "drained",
    "failure",
    "worthless",
    "not enough",
    "pulling away",
    "checking for a reply",
    "ruin everything",
    "disaster",
    "always happens",
    "never works",
    "set me off",
    "feel safe",
    "everything is too much"
  ]);

  const positive = _containsAny(text, [
    "i feel great",
    "i feel better",
    "i'm doing better",
    "things are turning around",
    "i can do this"
  ]) || !!supportFlags.positivePresent || !!supportFlags.recoveryPresent;

  const domainCandidates = [];
  if (psychology) domainCandidates.push("psychology");
  if (positive && !domainCandidates.includes("psychology")) domainCandidates.push("psychology");

  if (!domainCandidates.length) {
    domainCandidates.push("psychology");
  }

  return {
    ok: true,
    text,
    classifications: {
      crisis,
      psychology,
      positive
    },
    supportFlags: {
      crisis,
      highDistress: crisis || !!supportFlags.highDistress,
      recoveryPresent: !!supportFlags.recoveryPresent || positive,
      positivePresent: !!supportFlags.positivePresent || positive,
      needsStabilization: crisis || _containsAny(text, ["overwhelmed", "spiraling", "panic", "too much"]),
      needsClarification: _containsAny(text, ["confused", "not sure", "what happened", "what do they mean"]),
      needsContainment: crisis || _containsAny(text, ["can't breathe", "losing it", "freaking out"]),
      needsConnection: _containsAny(text, ["alone", "pulling away", "need someone", "still care"])
    },
    domainCandidates
  };
}

function _safeObj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

module.exports = {
  classifyQuery
};
