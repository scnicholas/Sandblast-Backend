/**
 * emotionSuppressionResolver.js
 * Marion Emotion Suppression Resolver
 *
 * Location:
 *   /backend/Data/marion/runtime/emotion/emotionSuppressionResolver.js
 *
 * Purpose:
 *   Detects masking, minimization, topic shifting, forced positivity, detachment,
 *   dry humor under strain, and low-signal emotional states.
 *
 * Architectural rule:
 *   This module never generates final replies.
 *   It only annotates emotional interpretation before resolved-state validation.
 */

'use strict';

const SUPPRESSION_RULES = Object.freeze([
  { id: 'sup_minimization_001', signal: 'minimization', weight: 0.2, phrases: ['it is fine', "it's fine", 'im fine', "i'm fine", 'whatever', 'no big deal', 'not a big deal'] },
  { id: 'sup_forced_positive_001', signal: 'forced_positivity', weight: 0.18, phrases: ['all good', 'yeah im good', "yeah i'm good", 'do not worry about it', "don't worry about it", 'im fine really', "i'm fine really"] },
  { id: 'sup_detachment_001', signal: 'detachment', weight: 0.2, phrases: ['i feel numb', 'i feel empty', 'no energy', 'same thing every day', 'i do not care', "i don't care"] },
  { id: 'sup_topic_shift_001', signal: 'topic_shift', weight: 0.14, phrases: ['anyway', 'forget it', 'moving on', 'never mind', 'nevermind'] },
  { id: 'sup_understatement_001', signal: 'understatement', weight: 0.16, phrases: ['kind of', 'sort of', 'a little', 'maybe', 'i guess'] },
  { id: 'sup_dry_humor_001', signal: 'dry_humor_under_strain', weight: 0.16, phrases: ['lol whatever', 'haha sure', 'great just great', 'story of my life'] },
  { id: 'sup_low_signal_001', signal: 'low_signal', weight: 0.1, phrases: ['idk', 'i do not know', "i don't know", 'not sure', 'hard to explain'] }
]);

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesPhrase(normalized, phrase) {
  const target = normalizeText(phrase);
  return Boolean(target && normalized.includes(target));
}

function resolveSuppression(inputText, options = {}) {
  const normalized = normalizeText(inputText);
  const hits = [];
  for (const rule of SUPPRESSION_RULES) {
    const matched = rule.phrases.filter((phrase) => includesPhrase(normalized, phrase));
    if (matched.length) hits.push({ rule_id: rule.id, signal: rule.signal, weight: rule.weight, matched_phrases: matched.slice(0, 3) });
  }
  const strongest = hits.sort((a, b) => b.weight - a.weight)[0] || null;
  const penalty = hits.reduce((sum, h) => sum + h.weight, 0);
  const maxPenalty = typeof options.maxPenalty === 'number' ? options.maxPenalty : 0.32;
  return {
    has_suppression: Boolean(strongest),
    primary_signal: strongest ? strongest.signal : null,
    confidence_penalty: Math.min(maxPenalty, Number(penalty.toFixed(4))),
    hits,
    notes: strongest ? 'Suppression signal detected; preserve emotional context and reduce neutral certainty.' : 'No suppression signal detected.'
  };
}

function applySuppressionToCandidate(candidate = {}, suppression = {}) {
  const next = { ...candidate };
  const signal = suppression.primary_signal || candidate.suppression_signal || null;
  if (signal) {
    next.suppression_signal = signal;
    if (next.emotion_bias === 'neutral') {
      next.weight = Math.max(0, Number(((next.weight || 0.5) - (suppression.confidence_penalty || 0.12)).toFixed(4)));
      next.neutral_confidence_adjusted = true;
    }
  }
  return next;
}

module.exports = { SUPPRESSION_RULES, normalizeText, resolveSuppression, applySuppressionToCandidate };
