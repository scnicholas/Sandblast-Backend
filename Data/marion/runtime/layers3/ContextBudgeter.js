// runtime/layer3/ContextBudgeter.js
"use strict";

function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _trim(v) { return v == null ? "" : String(v).trim(); }
function _clamp(n, min = 0, max = 100000) {
  const value = Number(n);
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function estimateTextWeight(text = "") {
  if (!text) return 0;
  return _trim(text).split(/\s+/).filter(Boolean).length;
}

function estimateEvidenceWeight(item = {}) {
  const obj = _safeObj(item);
  return (
    estimateTextWeight(obj.title || "") +
    estimateTextWeight(obj.summary || "") +
    Math.min(estimateTextWeight(obj.content || ""), 180)
  );
}

function deriveBudgetProfile(context = {}) {
  const domain = _trim(context.domain || "general");
  const recoveryMode = _trim(context.conversationState?.recoveryMode || "normal");
  const intensity = Number(context.emotion?.intensity || 0);

  let maxTokensApprox = 900;
  let maxItems = 8;

  if (["law", "finance", "cybersecurity"].includes(domain)) {
    maxTokensApprox = 1050;
    maxItems = 9;
  }

  if (recoveryMode === "guided-recovery" || intensity >= 0.75) {
    maxTokensApprox = Math.min(maxTokensApprox, 760);
    maxItems = Math.min(maxItems, 6);
  }

  return { maxTokensApprox, maxItems };
}

function _priorityScore(item = {}) {
  const obj = _safeObj(item);
  let priority = Number(obj.fusedScore || obj.score || 0);
  if (obj.mustKeep) priority += 1;
  if (_safeArray(obj.tags).includes("crisis")) priority += 0.3;
  if (_safeArray(obj.tags).includes("support")) priority += 0.08;
  if (_safeArray(obj.tags).includes("primary")) priority += 0.05;
  return priority;
}

function trimEvidenceToBudget(evidence = [], maxTokensApprox = 900, maxItems = 8) {
  let used = 0;
  const kept = [];
  const dropped = [];
  const ordered = _safeArray(evidence).slice().sort((a, b) => _priorityScore(b) - _priorityScore(a));

  for (const item of ordered) {
    const weight = estimateEvidenceWeight(item);

    if (kept.length >= maxItems) {
      dropped.push({ ...item, budgetDropReason: "max-items" });
      continue;
    }

    if ((used + weight) > maxTokensApprox && !item.mustKeep) {
      dropped.push({ ...item, budgetDropReason: "token-budget" });
      continue;
    }

    kept.push({ ...item, budgetWeight: weight });
    used += weight;
  }

  return {
    kept,
    dropped,
    usedBudget: used,
    maxBudget: maxTokensApprox,
    maxItems
  };
}

function buildCompactEvidence(evidence = [], maxItems = 8) {
  return _safeArray(evidence).slice(0, maxItems).map((item) => ({
    id: item.id || null,
    source: item.source || null,
    dataset: item.dataset || null,
    domain: item.domain || "general",
    title: item.title || null,
    summary: item.summary || (item.content ? _trim(String(item.content)).slice(0, 240) : ""),
    fusedScore: Number(item.fusedScore || item.score || 0),
    confidence: Number(item.confidence || 0),
    recency: Number(item.recency || 0),
    tags: _safeArray(item.tags).slice(0, 8),
    metadata: _safeObj(item.metadata)
  }));
}

module.exports = {
  trimEvidenceToBudget,
  buildCompactEvidence,
  estimateTextWeight,
  estimateEvidenceWeight,
  deriveBudgetProfile
};
