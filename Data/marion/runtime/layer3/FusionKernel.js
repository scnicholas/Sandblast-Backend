// runtime/layer3/FusionKernel.js
"use strict";

const { normalizeRetrieverBundle } = require("./SignalNormalizer");
const { scoreEvidenceList } = require("./EvidenceScorer");
const { buildDomainWeights } = require("./DomainWeightEngine");
const { trimEvidenceToBudget, buildCompactEvidence, deriveBudgetProfile } = require("./ContextBudgeter");

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function deriveToneDirective({ emotion = {}, psychology = {}, domain = "general", conversationState = {} } = {}) {
  const directives = [];

  if (emotion.primaryEmotion && emotion.primaryEmotion !== "neutral") {
    directives.push(`Acknowledge ${emotion.primaryEmotion} state with measured sensitivity.`);
  }

  if (emotion.intensity > 0.7) {
    directives.push("Lead with stabilization before analysis.");
  }

  if ((emotion.suppressionSignals || []).length) {
    directives.push("Treat guarded language carefully and avoid pressure-heavy probing.");
  }

  if (psychology.recommendedApproach) {
    directives.push(`Use ${psychology.recommendedApproach} response posture.`);
  }

  if (conversationState.recoveryMode === "guided-recovery") {
    directives.push("Break repetition and keep the next move singular and grounded.");
  }

  directives.push(`Blend domain reasoning for ${domain} without losing emotional coherence.`);

  return uniqueStrings(directives);
}

function buildFusionDiagnostics({
  normalized = {},
  scoredEvidence = [],
  budgeted = {},
  weights = {}
} = {}) {
  const scored = Array.isArray(scoredEvidence) ? scoredEvidence : [];
  const kept = Array.isArray(budgeted.kept) ? budgeted.kept : [];
  const topScore = scored[0]?.fusedScore || 0;
  const confidenceBlend = Number((
    (
      (normalized.emotion?.confidence || 0) * weights.emotionWeight +
      (normalized.psychology?.confidence || 0) * weights.psychologyWeight +
      topScore * (weights.domainWeight + weights.datasetWeight)
    )
  ).toFixed(4));

  return {
    evidenceSeen: normalized.evidence.length,
    evidenceKept: kept.length,
    evidenceDropped: Array.isArray(budgeted.dropped) ? budgeted.dropped.length : 0,
    budgetUsedApprox: budgeted.usedBudget || 0,
    budgetMaxApprox: budgeted.maxBudget || 0,
    topEvidenceScore: topScore,
    confidenceBlend,
    lowEvidence: kept.length < 2,
    degradedSignal: kept.length < 2 || confidenceBlend < 0.45,
    suppressionPresent: Array.isArray(normalized.emotion?.suppressionSignals) && normalized.emotion.suppressionSignals.length > 0,
    driftTrend: normalized.emotion?.stateDrift?.trend || null,
    dominantAxis: normalized.emotion?.blendProfile?.dominantAxis || null
  };
}

function buildFusionPacket(bundle = {}) {
  const normalized = normalizeRetrieverBundle(bundle);

  const weights = buildDomainWeights({
    domain: normalized.domain,
    emotion: normalized.emotion,
    psychology: normalized.psychology,
    intent: normalized.intent,
    conversationState: normalized.conversationState
  });

  const scoredEvidence = scoreEvidenceList(normalized.evidence, {
    targetDomain: normalized.domain,
    primaryEmotion: normalized.emotion.primaryEmotion,
    emotionIntensity: normalized.emotion.intensity,
    suppressionSignals: normalized.emotion.suppressionSignals,
    intent: normalized.intent
  });

  const budgetProfile = deriveBudgetProfile({
    domain: normalized.domain,
    conversationState: normalized.conversationState,
    emotion: normalized.emotion
  });

  const budgeted = trimEvidenceToBudget(scoredEvidence, budgetProfile.maxTokensApprox, budgetProfile.maxItems);
  const compactEvidence = buildCompactEvidence(budgeted.kept, budgetProfile.maxItems);

  const conversationState = {
    ...(normalized.conversationState || {}),
    continuityHealth: normalized.conversationState?.continuityHealth || "watch",
    recoveryMode: normalized.conversationState?.recoveryMode || "normal",
    fallbackStreak: Number(normalized.conversationState?.fallbackStreak || 0),
    repeatQueryStreak: Number(normalized.conversationState?.repeatQueryStreak || 0)
  };

  const toneDirectives = deriveToneDirective({
    emotion: normalized.emotion,
    psychology: normalized.psychology,
    domain: normalized.domain,
    conversationState
  });

  const diagnostics = buildFusionDiagnostics({
    normalized,
    scoredEvidence,
    budgeted,
    weights
  });

  return {
    intent: normalized.intent,
    domain: normalized.domain,
    userQuery: normalized.userQuery,
    conversationState,
    emotion: normalized.emotion,
    psychology: normalized.psychology,
    weights,
    toneDirectives,
    evidence: compactEvidence,
    diagnostics
  };
}

module.exports = {
  buildFusionPacket,
  buildFusionDiagnostics,
  deriveToneDirective
};
