/**
 * emotionValidator.js
 * Marion Emotion Runtime Validator
 *
 * Location:
 *   /backend/Data/marion/runtime/emotion/emotionValidator.js
 *
 * Purpose:
 *   Validates emotion labels, nuance labels, blend axes, suppression signals,
 *   confidence/intensity ranges, guard fields, support fields, and Nyx handoff contracts.
 *
 * Architectural rule:
 *   This module validates and normalizes contracts only.
 *   It does NOT compose replies, infer emotions, or talk to Nyx directly.
 */

'use strict';

const DEFAULT_PRIMARY_FALLBACK = 'neutral';
const DEFAULT_SECONDARY_FALLBACK = 'unclear';

const DEFAULT_ALLOWED = Object.freeze({
  primary: ['anger', 'joy', 'sadness', 'fear', 'surprise', 'disgust', 'neutral'],
  secondary: [
    'loneliness', 'grief', 'disappointment', 'hopelessness', 'hurt',
    'anxiety', 'panic', 'uncertainty', 'hypervigilance', 'overwhelm',
    'frustration', 'resentment', 'moral_injury', 'relief', 'gratitude',
    'excitement', 'contentment', 'confusion', 'amazement', 'shock',
    'revulsion', 'rejection', 'moral_disgust', 'flat', 'informational',
    'guarded', 'emotional_numbness', 'shame', 'depressed', 'unclear',
    'boundary_activation'
  ],
  blendAxes: [
    'threat_response', 'emotional_loss', 'boundary_activation',
    'positive_release', 'orientation_shift', 'aversion_response',
    'low_signal_state'
  ],
  suppressionSignals: [
    'deflection', 'minimization', 'forced_positivity', 'detachment',
    'dry_humor_under_strain', 'topic_shift', 'understatement', 'low_signal'
  ],
  pacing: ['normal', 'slowed', 'slow', 'slow_and_containing', 'slow_and_structured', 'steady', 'measured', 'contained', 'natural'],
  responseLength: ['short', 'short_to_medium', 'medium'],
  adviceLevels: ['none', 'low', 'medium'],
  actionModes: ['supportive_monitoring', 'stabilize_then_external_support', 'deescalate_then_safety_boundary', 'grounding_first', 'neutral_continue', 'safe_decline']
});

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, Number(num.toFixed(4))));
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))];
}

function buildAllowedFromContracts(contracts = {}) {
  const labels = contracts.baseLabels || {};
  const allowed = {
    primary: uniqueStrings(labels.primary_emotions).length ? uniqueStrings(labels.primary_emotions) : DEFAULT_ALLOWED.primary,
    secondary: uniqueStrings(labels.secondary_emotions).length ? uniqueStrings(labels.secondary_emotions) : DEFAULT_ALLOWED.secondary,
    blendAxes: uniqueStrings(labels.blend_axes).length ? uniqueStrings(labels.blend_axes) : DEFAULT_ALLOWED.blendAxes,
    suppressionSignals: uniqueStrings(labels.suppression_signals).length ? uniqueStrings(labels.suppression_signals).concat('low_signal') : DEFAULT_ALLOWED.suppressionSignals,
    pacing: DEFAULT_ALLOWED.pacing,
    responseLength: DEFAULT_ALLOWED.responseLength,
    adviceLevels: DEFAULT_ALLOWED.adviceLevels,
    actionModes: DEFAULT_ALLOWED.actionModes
  };
  allowed.suppressionSignals = [...new Set(allowed.suppressionSignals)];
  return allowed;
}

function validateLabel(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function validateTimingProfile(input = {}, allowed = DEFAULT_ALLOWED) {
  const timing = isPlainObject(input) ? input : {};
  return {
    pause_before_response: Boolean(timing.pause_before_response),
    response_length: validateLabel(timing.response_length, allowed.responseLength, 'short'),
    followup_delay: typeof timing.followup_delay === 'string' && timing.followup_delay.trim() ? timing.followup_delay.trim() : 'light',
    pacing: validateLabel(timing.pacing, allowed.pacing, 'natural')
  };
}

function validateEmotion(input = {}, allowed = DEFAULT_ALLOWED) {
  const emotion = isPlainObject(input) ? input : {};
  return {
    primary: validateLabel(emotion.primary, allowed.primary, DEFAULT_PRIMARY_FALLBACK),
    secondary: validateLabel(emotion.secondary, allowed.secondary, DEFAULT_SECONDARY_FALLBACK),
    confidence: clamp01(emotion.confidence, 0.5),
    intensity: clamp01(emotion.intensity, 0.25)
  };
}

function validateBlendProfile(input = {}, allowed = DEFAULT_ALLOWED) {
  const blend = isPlainObject(input) ? input : {};
  const rawWeights = isPlainObject(blend.weights) ? blend.weights : {};
  const weights = {};
  for (const key of Object.keys(rawWeights)) {
    if (allowed.primary.includes(key)) weights[key] = clamp01(rawWeights[key], 0);
  }
  return {
    weights,
    dominant_axis: validateLabel(blend.dominant_axis, allowed.blendAxes, 'low_signal_state'),
    interaction_note: typeof blend.interaction_note === 'string' ? blend.interaction_note.slice(0, 240) : ''
  };
}

function validateNuance(input = {}, allowed = DEFAULT_ALLOWED) {
  const nuance = isPlainObject(input) ? input : {};
  const suppression = nuance.suppression_signal == null ? null : validateLabel(nuance.suppression_signal, allowed.suppressionSignals, null);
  return {
    subtype: validateLabel(nuance.subtype, allowed.secondary, DEFAULT_SECONDARY_FALLBACK),
    social_pattern: typeof nuance.social_pattern === 'string' ? nuance.social_pattern.slice(0, 120) : 'low_signal',
    suppression_signal: suppression,
    risk_flags: uniqueStrings(nuance.risk_flags).slice(0, 8)
  };
}

function validateSupport(input = {}, allowed = DEFAULT_ALLOWED) {
  const support = isPlainObject(input) ? input : {};
  return {
    tone: typeof support.tone === 'string' && support.tone.trim() ? support.tone.trim().slice(0, 60) : 'steady',
    followup: support.followup !== false,
    advice_level: validateLabel(support.advice_level, allowed.adviceLevels, 'low'),
    timing_profile: validateTimingProfile(support.timing_profile, allowed)
  };
}

function validateGuard(input = {}, allowed = DEFAULT_ALLOWED) {
  const guard = isPlainObject(input) ? input : {};
  return {
    diagnosis_block: guard.diagnosis_block !== false,
    safe_to_continue: guard.safe_to_continue !== false,
    escalation_needed: Boolean(guard.escalation_needed),
    detected_flags: uniqueStrings(guard.detected_flags).slice(0, 10),
    action_mode: validateLabel(guard.action_mode, allowed.actionModes, 'supportive_monitoring')
  };
}

function validateNyxContract(input = {}) {
  const contract = isPlainObject(input) ? input : {};
  return {
    reply_mode: 'resolved_state_only',
    followup_cap: Number.isInteger(contract.followup_cap) ? Math.max(0, Math.min(contract.followup_cap, 1)) : 1,
    pacing_source: typeof contract.pacing_source === 'string' && contract.pacing_source.trim() ? contract.pacing_source.trim() : 'support.timing_profile'
  };
}

function validateHandoff(input = {}) {
  const handoff = isPlainObject(input) ? input : {};
  return {
    interpreter_summary: typeof handoff.interpreter_summary === 'string' ? handoff.interpreter_summary.slice(0, 300) : 'Resolved emotional state prepared for Marion composition.',
    nyx_expression_goal: typeof handoff.nyx_expression_goal === 'string' ? handoff.nyx_expression_goal.slice(0, 220) : 'Maintain steady presence without over-talking.',
    response_constraints: uniqueStrings(handoff.response_constraints).slice(0, 10),
    nyx_contract: validateNyxContract(handoff.nyx_contract)
  };
}

function validateResolvedState(input = {}, contracts = {}) {
  const allowed = buildAllowedFromContracts(contracts);
  const state = isPlainObject(input) ? input : {};
  const emotion = validateEmotion(state.emotion, allowed);
  const blend_profile = validateBlendProfile(state.blend_profile, allowed);
  const nuance = validateNuance(state.nuance, allowed);
  const support = validateSupport(state.support, allowed);
  const guard = validateGuard(state.guard, allowed);
  const marion_handoff = validateHandoff(state.marion_handoff);
  const warnings = [];

  if (emotion.intensity >= 0.67 && support.advice_level === 'medium') {
    support.advice_level = 'low';
    warnings.push('high_intensity_advice_level_capped');
  }
  if (guard.escalation_needed) {
    support.followup = false;
    support.advice_level = 'none';
    warnings.push('escalation_mode_caps_followup_and_advice');
  }

  return {
    ok: true,
    warnings,
    state: {
      schema_version: state.schema_version || 'marion-resolved-emotion-state.v1.0',
      runtime_contract: { producer: 'Marion emotion runtime', consumer: 'MarionBridge/Nyx', mode: 'resolved_state_only', strict_json: true },
      emotion,
      blend_profile,
      nuance,
      state_drift: isPlainObject(state.state_drift) ? state.state_drift : {},
      psychology: isPlainObject(state.psychology) ? state.psychology : {},
      support,
      guard,
      marion_handoff,
      runtime_meta: isPlainObject(state.runtime_meta) ? state.runtime_meta : {}
    }
  };
}

function assertResolvedState(input = {}, contracts = {}) {
  const result = validateResolvedState(input, contracts);
  if (!result.ok) {
    const err = new Error('Invalid Marion resolved emotion state');
    err.details = result;
    throw err;
  }
  return result.state;
}

module.exports = {
  DEFAULT_ALLOWED,
  buildAllowedFromContracts,
  clamp01,
  validateEmotion,
  validateNuance,
  validateSupport,
  validateGuard,
  validateResolvedState,
  assertResolvedState
};
