"use strict";

const { classifyQuery } = require("./queryClassifier");
const { retrievePsychology } = require("./retrievers/psychologyRetriever");

function _safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function _safeObj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function _mergeSupportFlags(a, b) {
  return {
    ..._safeObj(a),
    ..._safeObj(b)
  };
}

function routeMarion(input = {}) {
  const classified = classifyQuery({
    text: input.text,
    affect: input.affect,
    supportFlags: input.supportFlags
  });

  const domainCandidates = _safeArray(classified.domainCandidates);
  const mergedFlags = _mergeSupportFlags(input.supportFlags, classified.supportFlags);

  let psychology = null;

  if (domainCandidates.includes("psychology")) {
    psychology = retrievePsychology({
      text: input.text,
      supportFlags: mergedFlags,
      riskLevel: input.riskLevel || (classified.classifications.crisis ? "critical" : "low"),
      maxMatches: 3
    });
  }

  const primaryDomain = psychology && psychology.matched ? "psychology" : (domainCandidates[0] || "psychology");

  return {
    ok: true,
    primaryDomain,
    classified,
    supportFlags: mergedFlags,
    domains: {
      psychology
    }
  };
}

module.exports = {
  routeMarion
};
