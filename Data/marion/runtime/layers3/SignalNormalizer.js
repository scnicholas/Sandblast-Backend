// runtime/layer3/SignalNormalizer.js
"use strict";

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function safeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normalizeText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function uniqueStrings(values = []) {
  return [...new Set(safeArray(values).map((v) => normalizeText(v)).filter(Boolean))];
}

function normalizeMetadata(metadata = {}) {
  return safeObj(metadata);
}

function normalizeEvidenceItem(item = {}, sourceType = "unknown") {
  const normalized = safeObj(item);

  return {
    id: normalized.id || null,
    type: normalized.type || sourceType,
    source: normalized.source || sourceType,
    dataset: normalized.dataset || null,
    title: normalizeText(normalized.title || ""),
    content: normalizeText(normalized.content || normalized.text || ""),
    summary: normalizeText(normalized.summary || ""),
    score: clamp(normalized.score, 0, 1),
    confidence: clamp(normalized.confidence, 0, 1),
    tags: uniqueStrings(normalized.tags),
    domain: normalizeText(normalized.domain || "general") || "general",
    emotionalRelevance: clamp(normalized.emotionalRelevance, 0, 1),
    recency: clamp(normalized.recency, 0, 1),
    metadata: normalizeMetadata(normalized.metadata),
    timestamp: normalized.timestamp || null,
    fusedScore: clamp(normalized.fusedScore, 0, 1.5)
  };
}

function normalizeBlendProfile(value = {}) {
  const normalized = safeObj(value);
  return {
    dominantAxis: normalizeText(normalized.dominantAxis || "") || null,
    weights: safeObj(normalized.weights),
    description: normalizeText(normalized.description || "") || null
  };
}

function normalizeStateDrift(value = {}) {
  const normalized = safeObj(value);
  return {
    previousEmotion: normalizeText(normalized.previousEmotion || "") || null,
    currentEmotion: normalizeText(normalized.currentEmotion || "") || null,
    trend: normalizeText(normalized.trend || "") || null,
    stability: clamp(normalized.stability, 0, 1),
    volatility: clamp(normalized.volatility, 0, 1)
  };
}

function normalizeSupportFlags(flags = {}) {
  const normalized = safeObj(flags);
  return {
    crisis: !!normalized.crisis,
    highDistress: !!normalized.highDistress,
    needsStabilization: !!normalized.needsStabilization,
    needsContainment: !!normalized.needsContainment,
    needsClarification: !!normalized.needsClarification,
    needsConnection: !!normalized.needsConnection,
    positivePresent: !!normalized.positivePresent,
    recoveryPresent: !!normalized.recoveryPresent
  };
}

function normalizeEmotionPayload(emotion = {}) {
  const normalized = safeObj(emotion);
  const locked = safeObj(normalized.lockedEmotion);

  return {
    primaryEmotion: normalizeText(normalized.primaryEmotion || locked.primaryEmotion || "neutral") || "neutral",
    secondaryEmotion: normalizeText(normalized.secondaryEmotion || locked.secondaryEmotion || "") || null,
    intensity: clamp(normalized.intensity != null ? normalized.intensity : locked.intensity, 0, 1),
    valence: clamp(normalized.valence != null ? normalized.valence : locked.valence, -1, 1),
    needs: uniqueStrings(normalized.needs || locked.needs),
    cues: uniqueStrings(normalized.cues || locked.cues),
    confidence: clamp(normalized.confidence != null ? normalized.confidence : locked.confidence, 0, 1),
    suppressionSignals: uniqueStrings(normalized.suppressionSignals),
    supportFlags: normalizeSupportFlags(normalized.supportFlags || locked.supportFlags),
    blendProfile: normalizeBlendProfile(normalized.blendProfile),
    stateDrift: normalizeStateDrift(normalized.stateDrift)
  };
}

function normalizePsychPayload(psych = {}) {
  const normalized = safeObj(psych);

  return {
    patterns: uniqueStrings(normalized.patterns),
    risks: uniqueStrings(normalized.risks),
    needs: uniqueStrings(normalized.needs),
    recommendedApproach: normalizeText(normalized.recommendedApproach || "supportive") || "supportive",
    toneGuide: normalizeText(normalized.toneGuide || "balanced") || "balanced",
    supportMode: normalizeText(normalized.supportMode || "") || null,
    routeBias: normalizeText(normalized.routeBias || "") || null,
    responsePlan: safeObj(normalized.responsePlan),
    confidence: clamp(normalized.confidence, 0, 1)
  };
}

function buildEvidencePool(bundle = {}) {
  return [
    ...safeArray(bundle.domainEvidence).map((item) => normalizeEvidenceItem(item, "domain")),
    ...safeArray(bundle.datasetEvidence).map((item) => normalizeEvidenceItem(item, "dataset")),
    ...safeArray(bundle.memoryEvidence).map((item) => normalizeEvidenceItem(item, "memory")),
    ...safeArray(bundle.generalEvidence).map((item) => normalizeEvidenceItem(item, "general"))
  ];
}

function dedupeEvidence(evidence = []) {
  const seen = new Set();
  const kept = [];

  for (const item of safeArray(evidence)) {
    const key = [
      item.id || "",
      item.title || "",
      item.summary || "",
      String(item.content || "").slice(0, 140),
      item.source || "",
      item.domain || ""
    ].join("::");

    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }

  return kept;
}

function normalizeRetrieverBundle(bundle = {}) {
  const normalizedBundle = safeObj(bundle);
  const evidence = dedupeEvidence(buildEvidencePool(normalizedBundle));

  return {
    intent: normalizeText(normalizedBundle.intent || "general") || "general",
    domain: normalizeText(normalizedBundle.domain || "general") || "general",
    userQuery: normalizeText(normalizedBundle.userQuery || normalizedBundle.query || normalizedBundle.text || ""),
    conversationState: safeObj(normalizedBundle.conversationState),
    emotion: normalizeEmotionPayload(normalizedBundle.emotion || {}),
    psychology: normalizePsychPayload(normalizedBundle.psychology || {}),
    evidence
  };
}

module.exports = {
  normalizeRetrieverBundle,
  normalizeEvidenceItem,
  normalizeEmotionPayload,
  normalizePsychPayload
};
