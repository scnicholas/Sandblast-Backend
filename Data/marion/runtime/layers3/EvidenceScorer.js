// runtime/layer3/EvidenceScorer.js
"use strict";

const { getPreferredSourceRank, getDomainMeta } = require("./DomainRegistry");

function clamp(n, min = 0, max = 1.5) {
  const value = Number(n);
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function computeSourceBoost(item = {}, sourceRank = {}) {
  const rank = sourceRank[item.source] || 4;
  if (rank === 1) return 0.09;
  if (rank === 2) return 0.06;
  if (rank === 3) return 0.03;
  return 0.01;
}

function _tagSet(tags) {
  return new Set(Array.isArray(tags) ? tags : []);
}

function scoreEvidenceItem(item = {}, context = {}) {
  const {
    targetDomain = "general",
    primaryEmotion = "neutral",
    emotionIntensity = 0,
    intent = "general",
    suppressionSignals = []
  } = context;

  const sourceRank = getPreferredSourceRank(targetDomain);
  const domainMeta = getDomainMeta(targetDomain);
  const tags = _tagSet(item.tags);

  const baseScore = (
    (Number(item.score) || 0) * 0.33 +
    (Number(item.confidence) || 0) * 0.28 +
    (Number(item.recency) || 0) * 0.12
  );

  const domainBoost = item.domain === targetDomain ? 0.22 : (item.domain === "general" ? 0.02 : 0);
  const datasetBoost = item.dataset ? 0.06 : 0;
  const sourceBoost = computeSourceBoost(item, sourceRank);

  const emotionalBoost = primaryEmotion !== "neutral"
    ? clamp((Number(item.emotionalRelevance) || 0) * (0.1 + Number(emotionIntensity || 0) * 0.18), 0, 0.22)
    : 0;

  const intentBoost = tags.has(intent) ? 0.1 : 0;
  const titleBoost = item.title ? 0.02 : 0;
  const contentPenalty = !item.summary && !item.content ? -0.08 : 0;
  const riskPenalty = domainMeta.riskTolerance < 0.25 && (Number(item.confidence) || 0) < 0.35 ? -0.08 : 0;
  const suppressionBoost = suppressionSignals.length && (tags.has("psychology") || tags.has("support")) ? 0.04 : 0;

  const total = clamp(
    baseScore +
    domainBoost +
    datasetBoost +
    sourceBoost +
    emotionalBoost +
    intentBoost +
    titleBoost +
    suppressionBoost +
    contentPenalty +
    riskPenalty,
    0,
    1.5
  );

  return {
    ...item,
    fusedScore: Number(total.toFixed(4))
  };
}

function scoreEvidenceList(evidence = [], context = {}) {
  return (Array.isArray(evidence) ? evidence : [])
    .map((item) => scoreEvidenceItem(item, context))
    .sort((a, b) => {
      const diff = (b.fusedScore || 0) - (a.fusedScore || 0);
      if (diff !== 0) return diff;
      return (b.confidence || 0) - (a.confidence || 0);
    });
}

module.exports = {
  scoreEvidenceItem,
  scoreEvidenceList,
  computeSourceBoost
};
