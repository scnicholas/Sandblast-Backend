// runtime/layer3/FusionKernel.js

const { normalizeRetrieverBundle } = require('./SignalNormalizer');
const { scoreEvidenceList } = require('./EvidenceScorer');
const { buildDomainWeights } = require('./DomainWeightEngine');
const { trimEvidenceToBudget, buildCompactEvidence } = require('./ContextBudgeter');

function deriveToneDirective({ emotion = {}, psychology = {}, domain = 'general' } = {}) {
  const directives = [];

  if (emotion.primaryEmotion && emotion.primaryEmotion !== 'neutral') {
    directives.push(`Acknowledge ${emotion.primaryEmotion} state with measured sensitivity.`);
  }

  if (emotion.intensity > 0.7) {
    directives.push('Lead with stabilization before analysis.');
  }

  if (psychology.recommendedApproach) {
    directives.push(`Use ${psychology.recommendedApproach} response posture.`);
  }

  directives.push(`Blend domain reasoning for ${domain} without losing emotional coherence.`);

  return directives;
}

function buildFusionPacket(bundle = {}) {
  const normalized = normalizeRetrieverBundle(bundle);

  const weights = buildDomainWeights({
    domain: normalized.domain,
    emotion: normalized.emotion,
    psychology: normalized.psychology,
    intent: normalized.intent
  });

  const scoredEvidence = scoreEvidenceList(normalized.evidence, {
    targetDomain: normalized.domain,
    primaryEmotion: normalized.emotion.primaryEmotion,
    emotionIntensity: normalized.emotion.intensity,
    intent: normalized.intent
  });

  const budgeted = trimEvidenceToBudget(scoredEvidence, 900);
  const compactEvidence = buildCompactEvidence(budgeted.kept, 8);

  const toneDirectives = deriveToneDirective({
    emotion: normalized.emotion,
    psychology: normalized.psychology,
    domain: normalized.domain
  });

  return {
    intent: normalized.intent,
    domain: normalized.domain,
    userQuery: normalized.userQuery,
    conversationState: normalized.conversationState,
    emotion: normalized.emotion,
    psychology: normalized.psychology,
    weights,
    toneDirectives,
    evidence: compactEvidence,
    diagnostics: {
      evidenceSeen: normalized.evidence.length,
      evidenceKept: compactEvidence.length,
      budgetUsedApprox: budgeted.usedBudget,
      budgetMaxApprox: budgeted.maxBudget
    }
  };
}

module.exports = {
  buildFusionPacket
};
