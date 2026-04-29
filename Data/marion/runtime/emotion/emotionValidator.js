/**
 * emotionValidator.js
 * Marion Emotion Runtime Validator
 *
 * Location:
 *   /backend/Data/marion/runtime/emotion/emotionValidator.js
 *
 * Version:
 *   emotionValidator v1.1.0 CONTINUITY-SAFE-SERIALIZATION
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

const VERSION = 'emotionValidator v1.1.0 CONTINUITY-SAFE-SERIALIZATION';
const DEFAULT_PRIMARY_FALLBACK = 'neutral';
const DEFAULT_SECONDARY_FALLBACK = 'unclear';
const MAX_STRING = 360;
const MAX_ARRAY = 12;
const MAX_OBJECT_DEPTH = 5;
const MAX_OBJECT_KEYS = 40;

const DEFAULT_ALLOWED = Object.freeze({
  primary: ['anger', 'joy', 'sadness', 'fear', 'surprise', 'disgust', 'neutral'],
  secondary: [
    'loneliness', 'grief', 'disappointment', 'hopelessness', 'hurt',
    'anxiety', 'panic', 'uncertainty', 'hypervigilance', 'overwhelm',
    'frustration', 'resentment', 'moral_injury', 'relief', 'gratitude',
    'excitement', 'contentment', 'confusion', 'amazement', 'shock',
    'revulsion', 'rejection', 'moral_disgust', 'flat', 'informational',
    'guarded', 'emotional_numbness', 'shame', 'depressed', 'depression',
    'exhaustion', 'burnout', 'fatigue', 'mental_fatigue', 'strain',
    'unclear', 'boundary_activation'
  ],
  blendAxes: [
    'threat_response', 'emotional_loss', 'boundary_activation',
    'positive_release', 'orientation_shift', 'aversion_response',
    'low_signal_state', 'resource_depletion', 'continuity_pressure'
  ],
  suppressionSignals: [
    'deflection', 'minimization', 'forced_positivity', 'detachment',
    'dry_humor_under_strain', 'topic_shift', 'understatement', 'low_signal',
    'fatigue_disclosure', 'cognitive_load'
  ],
  pacing: ['normal', 'slowed', 'slow', 'slow_and_containing', 'slow_and_structured', 'steady', 'measured', 'contained', 'natural'],
  responseLength: ['short', 'short_to_medium', 'medium'],
  adviceLevels: ['none', 'low', 'medium'],
  actionModes: ['supportive_monitoring', 'stabilize_then_external_support', 'deescalate_then_safety_boundary', 'grounding_first', 'neutral_continue', 'safe_decline', 'reduce_load_then_continue']
});

const SECONDARY_ALIASES = Object.freeze({
  overwhelmed: 'overwhelm',
  exhaustion: 'exhaustion',
  exhausted: 'exhaustion',
  burnout: 'burnout',
  burned_out: 'burnout',
  mental_exhaustion: 'mental_fatigue',
  cognitive_fatigue: 'mental_fatigue',
  tired: 'fatigue',
  drained: 'fatigue',
  depressed: 'depressed',
  depression: 'depressed'
});

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, fallback = '', max = MAX_STRING) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : fallback;
}

function labelKey(value) {
  return cleanString(value, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, Number(num.toFixed(4))));
}

function uniqueStrings(values, max = MAX_ARRAY) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((v) => cleanString(v, '', 160)).filter(Boolean))].slice(0, max);
}

function safeJson(value, depth = 0) {
  if (depth > MAX_OBJECT_DEPTH) return '[truncated]';
  if (value === null || value === undefined) return value === null ? null : undefined;
  if (typeof value === 'string') return cleanString(value, '', MAX_STRING);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item) => safeJson(item, depth + 1)).filter((item) => item !== undefined);
  if (!isPlainObject(value)) return cleanString(value, '', MAX_STRING);

  const out = {};
  for (const key of Object.keys(value).slice(0, MAX_OBJECT_KEYS)) {
    const cleanKey = cleanString(key, '', 80);
    if (!cleanKey) continue;
    const next = safeJson(value[key], depth + 1);
    if (next !== undefined) out[cleanKey] = next;
  }
  return out;
}

function buildAllowedFromContracts(contracts = {}) {
  const labels = isPlainObject(contracts.baseLabels) ? contracts.baseLabels : {};
  const allowed = {
    primary: uniqueStrings(labels.primary_emotions, 50).length ? uniqueStrings(labels.primary_emotions, 50).map(labelKey) : DEFAULT_ALLOWED.primary,
    secondary: uniqueStrings(labels.secondary_emotions, 120).length ? uniqueStrings(labels.secondary_emotions, 120).map(labelKey) : DEFAULT_ALLOWED.secondary,
    blendAxes: uniqueStrings(labels.blend_axes, 80).length ? uniqueStrings(labels.blend_axes, 80).map(labelKey) : DEFAULT_ALLOWED.blendAxes,
    suppressionSignals: uniqueStrings(labels.suppression_signals, 80).length ? uniqueStrings(labels.suppression_signals, 80).map(labelKey).concat('low_signal') : DEFAULT_ALLOWED.suppressionSignals,
    pacing: DEFAULT_ALLOWED.pacing,
    responseLength: DEFAULT_ALLOWED.responseLength,
    adviceLevels: DEFAULT_ALLOWED.adviceLevels,
    actionModes: DEFAULT_ALLOWED.actionModes
  };

  // Contract files may lag the runtime. Keep these continuity-safe labels available
  // so emotional carry never invalidates the final envelope because of vocabulary drift.
  allowed.secondary = [...new Set(allowed.secondary.concat(DEFAULT_ALLOWED.secondary))];
  allowed.blendAxes = [...new Set(allowed.blendAxes.concat(DEFAULT_ALLOWED.blendAxes))];
  allowed.suppressionSignals = [...new Set(allowed.suppressionSignals.concat(DEFAULT_ALLOWED.suppressionSignals))];
  return allowed;
}

function normalizeAllowed(value, allowed, fallback, aliases = {}) {
  const raw = labelKey(value);
  const aliased = aliases[raw] || raw;
  return allowed.includes(aliased) ? aliased : fallback;
}

function validateLabel(value, allowed, fallback) {
  return normalizeAllowed(value, allowed, fallback);
}

function validateTimingProfile(input = {}, allowed = DEFAULT_ALLOWED) {
  const timing = isPlainObject(input) ? input : {};
  return {
    pause_before_response: Boolean(timing.pause_before_response),
    response_length: validateLabel(timing.response_length, allowed.responseLength, 'short'),
    followup_delay: cleanString(timing.followup_delay, 'light', 60),
    pacing: validateLabel(timing.pacing, allowed.pacing, 'natural')
  };
}

function validateEmotion(input = {}, allowed = DEFAULT_ALLOWED) {
  const emotion = isPlainObject(input) ? input : {};
  return {
    primary: normalizeAllowed(emotion.primary, allowed.primary, DEFAULT_PRIMARY_FALLBACK),
    secondary: normalizeAllowed(emotion.secondary, allowed.secondary, DEFAULT_SECONDARY_FALLBACK, SECONDARY_ALIASES),
    confidence: clamp01(emotion.confidence, 0.5),
    intensity: clamp01(emotion.intensity, 0.25)
  };
}

function validateBlendProfile(input = {}, allowed = DEFAULT_ALLOWED) {
  const blend = isPlainObject(input) ? input : {};
  const rawWeights = isPlainObject(blend.weights) ? blend.weights : {};
  const weights = {};
  for (const rawKey of Object.keys(rawWeights).slice(0, 20)) {
    const key = labelKey(rawKey);
    if (allowed.primary.includes(key)) weights[key] = clamp01(rawWeights[rawKey], 0);
  }
  return {
    weights,
    dominant_axis: validateLabel(blend.dominant_axis, allowed.blendAxes, 'low_signal_state'),
    interaction_note: cleanString(blend.interaction_note, '', 240)
  };
}

function validateNuance(input = {}, allowed = DEFAULT_ALLOWED) {
  const nuance = isPlainObject(input) ? input : {};
  const rawSuppression = nuance.suppression_signal == null ? null : labelKey(nuance.suppression_signal);
  const suppression = rawSuppression ? validateLabel(rawSuppression, allowed.suppressionSignals, null) : null;
  return {
    subtype: normalizeAllowed(nuance.subtype, allowed.secondary, DEFAULT_SECONDARY_FALLBACK, SECONDARY_ALIASES),
    social_pattern: cleanString(nuance.social_pattern, 'low_signal', 120),
    suppression_signal: suppression,
    risk_flags: uniqueStrings(nuance.risk_flags, 10).map(labelKey).filter(Boolean).slice(0, 10)
  };
}

function validateSupport(input = {}, allowed = DEFAULT_ALLOWED) {
  const support = isPlainObject(input) ? input : {};
  return {
    tone: cleanString(support.tone, 'steady', 60),
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
    detected_flags: uniqueStrings(guard.detected_flags, 10).map(labelKey).filter(Boolean).slice(0, 10),
    action_mode: validateLabel(guard.action_mode, allowed.actionModes, 'supportive_monitoring')
  };
}

function validateNyxContract(input = {}) {
  const contract = isPlainObject(input) ? input : {};
  const cap = Number(contract.followup_cap);
  return {
    reply_mode: 'resolved_state_only',
    followup_cap: Number.isFinite(cap) ? Math.max(0, Math.min(Math.trunc(cap), 1)) : 1,
    pacing_source: cleanString(contract.pacing_source, 'support.timing_profile', 100)
  };
}

function validateHandoff(input = {}) {
  const handoff = isPlainObject(input) ? input : {};
  const constraints = uniqueStrings(handoff.response_constraints, 14);
  return {
    interpreter_summary: cleanString(handoff.interpreter_summary, 'Resolved emotional state prepared for Marion composition.', 300),
    nyx_expression_goal: cleanString(handoff.nyx_expression_goal, 'Maintain steady presence without over-talking.', 220),
    response_constraints: constraints.slice(0, 12),
    nyx_contract: validateNyxContract(handoff.nyx_contract)
  };
}

function validateStateDrift(input = {}) {
  const drift = isPlainObject(input) ? input : {};
  const rolling = Array.isArray(drift.rolling_window) ? drift.rolling_window.slice(-5).map((item) => {
    const entry = isPlainObject(item) ? item : {};
    return {
      primary: cleanString(entry.primary, 'neutral', 40),
      secondary: cleanString(entry.secondary, 'unclear', 60),
      intensity: clamp01(entry.intensity, 0.25),
      confidence: clamp01(entry.confidence, 0.5),
      timestamp: cleanString(entry.timestamp, '', 60)
    };
  }) : [];
  return {
    previous_emotion: cleanString(drift.previous_emotion, '', 40) || null,
    current_emotion: cleanString(drift.current_emotion, 'neutral', 40),
    previous_secondary: cleanString(drift.previous_secondary, '', 60) || null,
    current_secondary: cleanString(drift.current_secondary, 'unclear', 60),
    trend: cleanString(drift.trend, 'stable_continuity', 80),
    stability: clamp01(drift.stability, 1),
    volatility: clamp01(drift.volatility, 0),
    rolling_window: rolling,
    rolling_window_size: Math.max(1, Math.min(Math.trunc(Number(drift.rolling_window_size) || rolling.length || 3), 8)),
    dominant_pattern: cleanString(drift.dominant_pattern, 'low_signal', 60),
    stabilization_hint: cleanString(drift.stabilization_hint, 'maintain_current_pacing', 120)
  };
}

function validateResolvedState(input = {}, contracts = {}) {
  const allowed = buildAllowedFromContracts(contracts);
  const state = isPlainObject(input) ? input : {};
  const emotion = validateEmotion(state.emotion, allowed);
  const blend_profile = validateBlendProfile(state.blend_profile, allowed);
  if (!Object.keys(blend_profile.weights).length && emotion.primary) blend_profile.weights[emotion.primary] = emotion.confidence;
  const nuance = validateNuance(state.nuance, allowed);
  if (nuance.subtype === DEFAULT_SECONDARY_FALLBACK && emotion.secondary !== DEFAULT_SECONDARY_FALLBACK) nuance.subtype = emotion.secondary;
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
    guard.safe_to_continue = false;
    warnings.push('escalation_mode_caps_followup_and_advice');
  }

  return {
    ok: true,
    warnings,
    state: {
      schema_version: cleanString(state.schema_version, 'marion-resolved-emotion-state.v1.0', 80),
      runtime_contract: { producer: 'Marion emotion runtime', consumer: 'MarionBridge/Nyx', mode: 'resolved_state_only', strict_json: true },
      emotion,
      blend_profile,
      nuance,
      state_drift: validateStateDrift(state.state_drift),
      psychology: safeJson(state.psychology || {}),
      support,
      guard,
      marion_handoff,
      runtime_meta: safeJson(state.runtime_meta || {})
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
  VERSION,
  DEFAULT_ALLOWED,
  buildAllowedFromContracts,
  clamp01,
  validateEmotion,
  validateNuance,
  validateSupport,
  validateGuard,
  validateResolvedState,
  assertResolvedState,
  _internal: { cleanString, labelKey, safeJson, validateStateDrift }
};
