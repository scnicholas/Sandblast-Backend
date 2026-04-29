/**
 * emotionalGovernor.js
 * Marion Emotional Governor
 *
 * Location:
 *   /backend/Data/marion/runtime/emotion/emotionalGovernor.js
 *
 * Version:
 *   emotionalGovernor v1.1.0 NO-LOOP-CONTINUITY-GOVERNOR
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

const VERSION = 'emotionalGovernor v1.1.0 NO-LOOP-CONTINUITY-GOVERNOR';

const LOOP_RISK_PHRASES = Object.freeze([
  "i'm here with you",
  'i am here with you',
  'i hear you',
  'i understand',
  'that sounds really hard',
  'you are not alone',
  'what part of it is pressing',
  'what part of this is pressing',
  'what feels hardest to carry',
  'let us slow it down',
  "let's slow it down"
]);

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, Number(num.toFixed(4))));
}

function isObj(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value || {}));
  } catch (_err) {
    return {};
  }
}

function normalizeText(value) {
  return String(value == null ? '' : value).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
}

function countRecentPhraseUse(recentReplies = [], phrases = LOOP_RISK_PHRASES) {
  if (!Array.isArray(recentReplies)) return 0;
  const normalizedReplies = recentReplies.map(normalizeText).filter(Boolean).slice(-8);
  let count = 0;
  for (const reply of normalizedReplies) {
    for (const phrase of phrases) {
      if (reply.includes(normalizeText(phrase))) count += 1;
    }
  }
  return count;
}

function uniquePush(target, value) {
  if (!Array.isArray(target) || !value) return;
  if (!target.includes(value)) target.push(value);
}

function normalizeGovernedShape(next) {
  next.emotion = isObj(next.emotion) ? next.emotion : {};
  next.nuance = isObj(next.nuance) ? next.nuance : {};
  next.runtime_meta = isObj(next.runtime_meta) ? next.runtime_meta : {};
  next.support = isObj(next.support) ? next.support : {};
  next.support.timing_profile = isObj(next.support.timing_profile) ? next.support.timing_profile : {};
  next.guard = isObj(next.guard) ? next.guard : {};
  next.marion_handoff = isObj(next.marion_handoff) ? next.marion_handoff : {};
  next.marion_handoff.response_constraints = Array.isArray(next.marion_handoff.response_constraints) ? next.marion_handoff.response_constraints : [];
  return next;
}

function governResolvedState(state = {}, context = {}) {
  const next = normalizeGovernedShape(cloneJson(state));
  const intensity = clamp01(next.emotion && next.emotion.intensity, 0.25);
  const confidence = clamp01(next.emotion && next.emotion.confidence, 0.5);
  const primary = normalizeText(next.emotion && next.emotion.primary) || 'neutral';
  const secondary = normalizeText((next.emotion && next.emotion.secondary) || next.nuance.subtype) || 'unclear';
  const phraseLoopCount = countRecentPhraseUse(context.recentReplies || []);
  const applied = [];
  const fatigueLike = /exhaust|burnout|fatigue|drain|overwhelm|strain/.test(`${primary} ${secondary}`);

  if (intensity >= 0.67) {
    next.support.advice_level = 'low';
    next.support.timing_profile.response_length = 'short';
    uniquePush(next.marion_handoff.response_constraints, 'cap_advice_when_intensity_high');
    uniquePush(next.marion_handoff.response_constraints, 'validate_before_guidance');
    applied.push('high_intensity_advice_cap');
  }

  if (intensity >= 0.82) {
    next.support.followup = false;
    uniquePush(next.marion_handoff.response_constraints, 'no_more_than_one_containment_sentence_before_next_user_signal');
    applied.push('very_high_intensity_followup_suppression');
  }

  if (phraseLoopCount >= 1) {
    uniquePush(next.marion_handoff.response_constraints, 'avoid_repeated_comfort_phrases');
    uniquePush(next.marion_handoff.response_constraints, 'use_specific_contextual_reflection_not_generic_reassurance');
    uniquePush(next.marion_handoff.response_constraints, 'do_not_emit_i_am_here_with_you');
    applied.push('comfort_phrase_repetition_dampener');
  }

  if (fatigueLike && confidence >= 0.35) {
    next.support.advice_level = 'low';
    next.support.followup = true;
    next.support.timing_profile.response_length = 'short_to_medium';
    next.support.timing_profile.pacing = next.support.timing_profile.pacing || 'measured';
    next.guard.action_mode = next.guard.action_mode || 'reduce_load_then_continue';
    uniquePush(next.marion_handoff.response_constraints, 'acknowledge_cognitive_load_without_looping');
    uniquePush(next.marion_handoff.response_constraints, 'offer_one_grounded_next_step_only');
    applied.push('fatigue_continuity_stabilizer');
  }

  if (next.guard.escalation_needed) {
    next.support.advice_level = 'none';
    next.support.followup = false;
    next.support.timing_profile.response_length = 'short';
    next.guard.safe_to_continue = false;
    uniquePush(next.marion_handoff.response_constraints, 'safety_or_stabilization_priority');
    applied.push('escalation_safety_cap');
  }

  next.marion_handoff.response_constraints = [...new Set(next.marion_handoff.response_constraints)].slice(0, 12);
  next.runtime_meta.emotional_governor = {
    version: VERSION,
    applied,
    phrase_loop_count: phraseLoopCount,
    continuity_safe: true,
    governed_at: new Date().toISOString()
  };
  return next;
}

module.exports = { VERSION, LOOP_RISK_PHRASES, countRecentPhraseUse, governResolvedState, _internal: { normalizeText, cloneJson } };
