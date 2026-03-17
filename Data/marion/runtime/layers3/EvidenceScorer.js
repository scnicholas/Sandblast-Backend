// runtime/layer3/EvidenceScorer.js

function clamp(n, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}

function scoreEvidenceItem(item, context = {}) {
  const {
    targetDomain = 'general',
    primaryEmotion = 'neutral',
    emotionIntensity = 0,
    intent = 'general'
  } = context;

  const domainBoost = item.domain === targetDomain ? 0.25 : 0;
  const datasetBoost = item.dataset ? 0.08 : 0;
  const sourceBoost = item.source === 'dataset' ? 0.05 : item.source === 'domain' ? 0.07 : 0;
  const emotionalBoost = primaryEmotion !== 'neutral'
    ? clamp((item.emotionalRelevance || 0) * (0.15 + emotionIntensity * 0.2), 0, 0.25)
    : 0;

  const intentBoost =
    item.tags && item.tags.includes(intent) ? 0.12 : 0;

  const base =
    (item.score || 0) * 0.35 +
    (item.confidence || 0) * 0.30 +
    (item.recency || 0) * 0.10;

  const total = clamp(base + domainBoost + datasetBoost + sourceBoost + emotionalBoost + intentBoost, 0, 1.5);

  return {
    ...item,
    fusedScore: Number(total.toFixed(4))
  };
}

function scoreEvidenceList(evidence = [], context = {}) {
  return evidence
    .map(item => scoreEvidenceItem(item, context))
    .sort((a, b) => (b.fusedScore || 0) - (a.fusedScore || 0));
}

module.exports = {
  scoreEvidenceItem,
  scoreEvidenceList
};
