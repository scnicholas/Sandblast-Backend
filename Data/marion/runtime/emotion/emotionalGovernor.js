/**
 * emotionalGovernor.js
 * Marion Emotional Governor
 *
 * Location:
 *   /backend/Data/marion/runtime/emotion/emotionalGovernor.js
 *
 * Purpose:
 *   Prevents emotional over-performance, repeated comfort loops, advice overflow,
 *   high-intensity verbosity, and therapy-bot drift.
 *
 * Architectural rule:
 *   This module constrains the resolved state.
 *   It does NOT create response copy and does NOT override MarionBridge authority.
 */

'use strict';

const LOOP_RISK_PHRASES = [
  "i'm here with you",
  'i hear you',
  'i understand',
  'that sounds really hard',
  'you are not alone'
];

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, Number(num.toFixed(4))));
}

function countRecentPhraseUse(recentReplies = [], phrases = LOOP_RISK_PHRASES) {
  if (!Array.isArray(recentReplies)) return 0;
  const normalizedReplies = recentReplies.map((r) => String(r || '').toLowerCase());
  let count = 0;
  for (const reply of normalizedReplies) {
    for (const phrase of phrases) {
      if (reply.includes(phrase)) count += 1;
    }
  }
  return count;
}

function governResolvedState(state = {}, context = {}) {
  const next = JSON.parse(JSON.stringify(state || {}));
  next.runtime_meta = next.runtime_meta || {};
  next.support = next.support || {};
  next.support.timing_profile = next.support.timing_profile || {};
  next.guard = next.guard || {};
  next.marion_handoff = next.marion_handoff || {};
  next.marion_handoff.response_constraints = Array.isArray(next.marion_handoff.response_constraints) ? next.marion_handoff.response_constraints : [];

  const intensity = clamp01(next.emotion && next.emotion.intensity, 0.25);
  const phraseLoopCount = countRecentPhraseUse(context.recentReplies || []);
  const applied = [];

  if (intensity >= 0.67) {
    next.support.advice_level = 'low';
    next.support.timing_profile.response_length = 'short';
    next.marion_handoff.response_constraints.push('cap_advice_when_intensity_high');
    next.marion_handoff.response_constraints.push('validate_before_guidance');
    applied.push('high_intensity_advice_cap');
  }

  if (intensity >= 0.82) {
    next.support.followup = false;
    next.marion_handoff.response_constraints.push('no_more_than_one_containment_sentence_before_next_user_signal');
    applied.push('very_high_intensity_followup_suppression');
  }

  if (phraseLoopCount >= 1) {
    next.marion_handoff.response_constraints.push('avoid_repeated_comfort_phrases');
    next.marion_handoff.response_constraints.push('use_specific_contextual_reflection_not_generic_reassurance');
    applied.push('comfort_phrase_repetition_dampener');
  }

  if (next.guard.escalation_needed) {
    next.support.advice_level = 'none';
    next.support.followup = false;
    next.support.timing_profile.response_length = 'short';
    next.marion_handoff.response_constraints.push('safety_or_stabilization_priority');
    applied.push('escalation_safety_cap');
  }

  next.marion_handoff.response_constraints = [...new Set(next.marion_handoff.response_constraints)].slice(0, 12);
  next.runtime_meta.emotional_governor = { applied, phrase_loop_count: phraseLoopCount, governed_at: new Date().toISOString() };
  return next;
}

module.exports = { LOOP_RISK_PHRASES, countRecentPhraseUse, governResolvedState };
