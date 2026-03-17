// runtime/marionRouter.js
"use strict";

const { classifyQuery } = require("./queryClassifier");
const { retrieveEmotion } = require("./retrievers/emotionRetriever");
const { retrievePsychology } = require("./retrievers/psychologyRetriever");

function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _mergeSupportFlags(a, b, c) { return { ..._safeObj(a), ..._safeObj(b), ..._safeObj(c) }; }

function _choosePrimaryDomain(classified, emotion, psychology) {
  const classifications = _safeObj(classified.classifications);
  const candidates = _safeArray(classified.domainCandidates);

  if (classifications.crisis && psychology && psychology.matched) return "psychology";

  if (psychology && psychology.matched && emotion && emotion.matched) {
    const psychScore = Number(_safeObj(psychology.primary).score || 0);
    const emoScore = Number(_safeObj(emotion.primary).score || 0);
    return psychScore >= emoScore ? "psychology" : "emotion";
  }

  if (psychology && psychology.matched) return "psychology";
  if (emotion && emotion.matched) return "emotion";

  return candidates[0] || "general";
}

function routeMarion(input = {}) {
  const text = input.text || input.userText || input.query || "";

  const emotion = retrieveEmotion({
    text,
    userText: input.userText || text,
    query: input.query || text,
    maxMatches: 5
  });

  const mergedFlags = _mergeSupportFlags(input.supportFlags, _safeObj(emotion.supportFlags));

  const classified = classifyQuery({
    text,
    affect: input.affect,
    supportFlags: mergedFlags,
    emotion
  });

  const domainCandidates = _safeArray(classified.domainCandidates);
  const finalSupportFlags = _mergeSupportFlags(mergedFlags, classified.supportFlags);

  let psychology = null;
  if (domainCandidates.includes("psychology")) {
    psychology = retrievePsychology({
      text,
      supportFlags: finalSupportFlags,
      riskLevel: input.riskLevel || (_safeObj(classified.classifications).crisis ? "critical" : "low"),
      maxMatches: 3
    });
  }

  const primaryDomain = _choosePrimaryDomain(classified, emotion, psychology);

  return {
    ok: true,
    primaryDomain,
    classified,
    supportFlags: finalSupportFlags,
    domains: {
      emotion,
      psychology
    },
    diagnostics: {
      domainCandidates,
      usedPsychology: !!psychology,
      supportFlagCount: Object.keys(finalSupportFlags).length
    }
  };
}

module.exports = { routeMarion };
