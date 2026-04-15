// runtime/layer3/DomainWeightEngine.js
"use strict";

const { getDomainMeta } = require("./DomainRegistry");

function clamp(n, min = 0, max = 1) {
  const value = Number(n);
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeWeights(weights = {}) {
  const total =
    (weights.emotionWeight || 0) +
    (weights.psychologyWeight || 0) +
    (weights.domainWeight || 0) +
    (weights.datasetWeight || 0);

  if (!total) {
    return {
      emotionWeight: 0.22,
      psychologyWeight: 0.23,
      domainWeight: 0.35,
      datasetWeight: 0.2
    };
  }

  return {
    emotionWeight: clamp(weights.emotionWeight / total),
    psychologyWeight: clamp(weights.psychologyWeight / total),
    domainWeight: clamp(weights.domainWeight / total),
    datasetWeight: clamp(weights.datasetWeight / total)
  };
}

function buildDomainWeights({
  domain = "general",
  emotion = {},
  psychology = {},
  intent = "general",
  conversationState = {}
} = {}) {
  const meta = getDomainMeta(domain);

  let emotionWeight = 0.22;
  let psychologyWeight = 0.23;
  let domainWeight = 0.35;
  let datasetWeight = 0.2;

  const intensity = clamp(emotion.intensity, 0, 1);
  const emotionConfidence = clamp(emotion.confidence, 0, 1);
  const psychConfidence = clamp(psychology.confidence, 0, 1);
  const supportFlags = emotion.supportFlags || {};
  const suppressionSignals = Array.isArray(emotion.suppressionSignals) ? emotion.suppressionSignals : [];
  const stateDrift = emotion.stateDrift || {};

  if (intensity > 0.65) {
    emotionWeight += 0.08;
    psychologyWeight += 0.05;
    domainWeight -= 0.08;
    datasetWeight -= 0.05;
  }

  if (emotionConfidence < 0.35 && intensity > 0.5) {
    emotionWeight -= 0.04;
    domainWeight += 0.02;
    datasetWeight += 0.02;
  }

  if (psychConfidence > 0.7) {
    psychologyWeight += 0.05;
    domainWeight -= 0.03;
    datasetWeight -= 0.02;
  }

  if (supportFlags.needsContainment || supportFlags.highDistress) {
    emotionWeight += 0.05;
    psychologyWeight += 0.03;
    domainWeight -= 0.04;
    datasetWeight -= 0.04;
  }

  if (suppressionSignals.length) {
    psychologyWeight += 0.04;
    emotionWeight += 0.02;
    domainWeight -= 0.03;
    datasetWeight -= 0.03;
  }

  if (String(stateDrift.trend || "") === "escalating") {
    emotionWeight += 0.03;
    psychologyWeight += 0.03;
    domainWeight -= 0.03;
    datasetWeight -= 0.03;
  }

  if (["analysis", "strategy", "research", "debug", "build", "planning"].includes(intent)) {
    domainWeight += 0.08;
    datasetWeight += 0.05;
    emotionWeight -= 0.05;
    psychologyWeight -= 0.08;
  }

  if (["support", "care"].includes(intent)) {
    emotionWeight += 0.04;
    psychologyWeight += 0.04;
    domainWeight -= 0.04;
    datasetWeight -= 0.04;
  }

  if (String(conversationState.recoveryMode || "") === "guided-recovery") {
    emotionWeight += 0.03;
    psychologyWeight += 0.02;
    domainWeight -= 0.03;
    datasetWeight -= 0.02;
  }

  domainWeight *= meta.priority || 1;
  datasetWeight *= meta.evidenceBias || 1;

  return normalizeWeights({
    emotionWeight,
    psychologyWeight,
    domainWeight,
    datasetWeight
  });
}

module.exports = {
  buildDomainWeights,
  normalizeWeights
};
