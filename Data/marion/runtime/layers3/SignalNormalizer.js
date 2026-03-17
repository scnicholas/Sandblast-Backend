// runtime/layer3/SignalNormalizer.js

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeEvidenceItem(item = {}, sourceType = 'unknown') {
  return {
    id: item.id || null,
    type: item.type || sourceType,
    source: item.source || sourceType,
    dataset: item.dataset || null,
    title: item.title || null,
    content: item.content || item.text || '',
    summary: item.summary || '',
    score: Number.isFinite(item.score) ? item.score : 0,
    confidence: Number.isFinite(item.confidence) ? item.confidence : 0,
    tags: safeArray(item.tags),
    domain: item.domain || 'general',
    emotionalRelevance: Number.isFinite(item.emotionalRelevance) ? item.emotionalRelevance : 0,
    recency: Number.isFinite(item.recency) ? item.recency : 0,
    metadata: item.metadata || {}
  };
}

function normalizeEmotionPayload(emotion = {}) {
  return {
    primaryEmotion: emotion.primaryEmotion || 'neutral',
    secondaryEmotion: emotion.secondaryEmotion || null,
    intensity: Number.isFinite(emotion.intensity) ? emotion.intensity : 0,
    valence: Number.isFinite(emotion.valence) ? emotion.valence : 0,
    needs: safeArray(emotion.needs),
    cues: safeArray(emotion.cues),
    confidence: Number.isFinite(emotion.confidence) ? emotion.confidence : 0
  };
}

function normalizePsychPayload(psych = {}) {
  return {
    patterns: safeArray(psych.patterns),
    risks: safeArray(psych.risks),
    needs: safeArray(psych.needs),
    recommendedApproach: psych.recommendedApproach || 'supportive',
    toneGuide: psych.toneGuide || 'balanced',
    confidence: Number.isFinite(psych.confidence) ? psych.confidence : 0
  };
}

function normalizeRetrieverBundle(bundle = {}) {
  return {
    intent: bundle.intent || 'general',
    domain: bundle.domain || 'general',
    userQuery: bundle.userQuery || '',
    conversationState: bundle.conversationState || {},
    emotion: normalizeEmotionPayload(bundle.emotion || {}),
    psychology: normalizePsychPayload(bundle.psychology || {}),
    evidence: [
      ...safeArray(bundle.domainEvidence).map(item => normalizeEvidenceItem(item, 'domain')),
      ...safeArray(bundle.datasetEvidence).map(item => normalizeEvidenceItem(item, 'dataset')),
      ...safeArray(bundle.memoryEvidence).map(item => normalizeEvidenceItem(item, 'memory')),
      ...safeArray(bundle.generalEvidence).map(item => normalizeEvidenceItem(item, 'general'))
    ]
  };
}

module.exports = {
  normalizeRetrieverBundle,
  normalizeEvidenceItem
};
