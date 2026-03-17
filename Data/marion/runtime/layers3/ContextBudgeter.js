// runtime/layer3/ContextBudgeter.js

function estimateTextWeight(text = '') {
  if (!text) return 0;
  return String(text).trim().split(/\s+/).length;
}

function trimEvidenceToBudget(evidence = [], maxTokensApprox = 900) {
  let used = 0;
  const kept = [];

  for (const item of evidence) {
    const weight =
      estimateTextWeight(item.summary || '') +
      estimateTextWeight(item.content || '');

    if ((used + weight) > maxTokensApprox) continue;

    kept.push(item);
    used += weight;
  }

  return {
    kept,
    usedBudget: used,
    maxBudget: maxTokensApprox
  };
}

function buildCompactEvidence(evidence = [], maxItems = 8) {
  return evidence.slice(0, maxItems).map(item => ({
    id: item.id,
    source: item.source,
    dataset: item.dataset,
    domain: item.domain,
    title: item.title,
    summary: item.summary || (item.content ? String(item.content).slice(0, 220) : ''),
    fusedScore: item.fusedScore,
    tags: item.tags || []
  }));
}

module.exports = {
  trimEvidenceToBudget,
  buildCompactEvidence
};
