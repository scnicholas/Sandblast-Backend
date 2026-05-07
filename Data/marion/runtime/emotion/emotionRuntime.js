/**
 * emotionRuntime.js
 * Marion Emotion Runtime
 *
 * Location:
 *   /backend/Data/marion/runtime/emotion/emotionRuntime.js
 *
 * Purpose:
 *   Main emotion orchestration layer. Converts user text and optional Marion context into a
 *   validated resolved emotional state for MarionBridge / ComposeMarionResponse / Nyx.
 *
 * Architectural rule:
 *   This is the only emotion runtime entry point Marion should call.
 *   Nyx must receive only the resolved state, never raw pattern matches.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { validateResolvedState, buildAllowedFromContracts, clamp01 } = require('./emotionValidator');
const { resolveSuppression, applySuppressionToCandidate, normalizeText } = require('./emotionSuppressionResolver');
const { updateEmotionState } = require('./emotionStateTracker');
const { governResolvedState } = require('./emotionalGovernor');

const DEFAULT_CONTRACT_DIR = path.resolve(__dirname, '../../emotions');

const DEFAULT_FILES = Object.freeze({
  baseLabels: 'base_labels.json',
  conversationPatterns: 'conversation_patterns.json',
  analysisSchema: 'emotion_analysis_schema.json',
  nuanceMap: 'nuance_map.json'
});

let contractCache = null;

function safeReadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function loadContracts(options = {}) {
  const contractDir = options.contractDir || process.env.MARION_EMOTION_CONTRACT_DIR || DEFAULT_CONTRACT_DIR;
  const files = { ...DEFAULT_FILES, ...(options.files || {}) };
  if (contractCache && !options.forceReload && contractCache.contractDir === contractDir) return contractCache.contracts;

  const contracts = {
    baseLabels: safeReadJson(path.join(contractDir, files.baseLabels)),
    conversationPatterns: safeReadJson(path.join(contractDir, files.conversationPatterns)),
    analysisSchema: safeReadJson(path.join(contractDir, files.analysisSchema)),
    nuanceMap: safeReadJson(path.join(contractDir, files.nuanceMap))
  };
  contractCache = { contractDir, contracts, loadedAt: new Date().toISOString() };
  return contracts;
}

function getHealth(options = {}) {
  try {
    const contracts = loadContracts(options);
    return {
      ok: true,
      runtime: 'marion-emotion-runtime',
      version: '1.0.0',
      mode: 'resolved_state_only',
      contract_dir: options.contractDir || process.env.MARION_EMOTION_CONTRACT_DIR || DEFAULT_CONTRACT_DIR,
      loaded_contracts: Object.keys(contracts),
      loaded_at: contractCache && contractCache.loadedAt
    };
  } catch (error) {
    return { ok: false, runtime: 'marion-emotion-runtime', error: 'emotion_contract_load_failed', detail: error.message };
  }
}

function priorityScore(priority) {
  if (priority === 'high') return 0.2;
  if (priority === 'medium') return 0.1;
  return 0;
}

function matchPatternCandidates(inputText, contracts) {
  const normalized = normalizeText(inputText);
  const patterns = contracts.conversationPatterns && Array.isArray(contracts.conversationPatterns.patterns) ? contracts.conversationPatterns.patterns : [];
  const candidates = [];

  for (const pattern of patterns) {
    if (!pattern || !Array.isArray(pattern.phrases)) continue;
    const matched = pattern.phrases.map((phrase) => normalizeText(phrase)).filter((phrase) => phrase && normalized.includes(phrase));
    if (!matched.length) continue;
    const baseWeight = clamp01(pattern.weight, 0.5);
    candidates.push({
      pattern_id: pattern.pattern_id || 'unknown_pattern',
      match_type: pattern.match_type || 'contains',
      matched_phrases: matched.slice(0, 4),
      emotion_bias: pattern.emotion_bias || 'neutral',
      nuance_bias: pattern.nuance_bias || 'unclear',
      weight: clamp01(baseWeight + priorityScore(pattern.priority), baseWeight),
      priority: pattern.priority || 'low',
      suppression_signal: pattern.suppression_signal || null
    });
  }
  return candidates.sort((a, b) => b.weight - a.weight);
}

function fallbackCandidateFromText(inputText) {
  const normalized = normalizeText(inputText);
  if (!normalized) return { pattern_id: 'fallback_empty_or_low_signal', emotion_bias: 'neutral', nuance_bias: 'unclear', weight: 0.25, priority: 'low', suppression_signal: 'low_signal' };
  return { pattern_id: 'fallback_unmatched_text', emotion_bias: 'neutral', nuance_bias: 'informational', weight: 0.38, priority: 'low', suppression_signal: null };
}

function getNuanceProfile(primary, contracts) {
  const map = contracts.nuanceMap || {};
  return map[primary] || map.neutral || {};
}

function resolveDominantAxis(primary, secondary, contracts) {
  const map = contracts.nuanceMap || {};
  const rules = map.blend_resolution_rules || {};
  const directKey = `${primary}+${secondary}`;
  const reverseKey = `${secondary}+${primary}`;
  if (rules[directKey] && rules[directKey].dominant_axis) return rules[directKey].dominant_axis;
  if (rules[reverseKey] && rules[reverseKey].dominant_axis) return rules[reverseKey].dominant_axis;
  const profile = getNuanceProfile(primary, contracts);
  return Array.isArray(profile.blend_axes) && profile.blend_axes[0] ? profile.blend_axes[0] : 'low_signal_state';
}

function resolveCandidate(inputText, contracts) {
  const allowed = buildAllowedFromContracts(contracts);
  const suppression = resolveSuppression(inputText);
  const rawCandidates = matchPatternCandidates(inputText, contracts);
  const candidates = (rawCandidates.length ? rawCandidates : [fallbackCandidateFromText(inputText)]).map((candidate) => applySuppressionToCandidate(candidate, suppression)).sort((a, b) => b.weight - a.weight);
  const top = candidates[0] || fallbackCandidateFromText(inputText);
  const primary = allowed.primary.includes(top.emotion_bias) ? top.emotion_bias : 'neutral';
  const secondary = allowed.secondary.includes(top.nuance_bias) ? top.nuance_bias : 'unclear';
  return {
    primary,
    secondary,
    confidence: clamp01(top.weight, 0.5),
    intensity: clamp01(top.weight, 0.35),
    suppression_signal: top.suppression_signal || suppression.primary_signal || null,
    suppression,
    raw_candidates: candidates.slice(0, 5)
  };
}


function hasContinuityCue(inputText) {
  const normalized = normalizeText(inputText);
  return /\b(still|again|same|continues|hasn'?t stopped|has not stopped|not better|trying|exhausting|mentally|overwhelming|too much|carry|pressure|deeper|underneath)\b/i.test(normalized);
}

function sanitizePlain(value, depth = 0) {
  if (depth > 8) return null;
  if (value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizePlain(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'function' || typeof item === 'symbol' || typeof item === 'undefined') continue;
      out[key] = sanitizePlain(item, depth + 1);
    }
    return out;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  return value;
}

function mergePreviousEmotionWhenNeeded(inputText, draftState, context = {}) {
  const previous = context.previousEmotionState && typeof context.previousEmotionState === 'object' ? context.previousEmotionState : {};
  const previousEmotion = previous.emotion && typeof previous.emotion === 'object' ? previous.emotion : {};
  const currentEmotion = draftState.emotion && typeof draftState.emotion === 'object' ? draftState.emotion : {};
  const previousIntensity = Number(previousEmotion.intensity || 0) || 0;
  const currentIntensity = Number(currentEmotion.intensity || 0) || 0;
  const currentNeutral = String(currentEmotion.primary || 'neutral') === 'neutral' && currentIntensity <= 0.4;
  const priorUsable = previousEmotion.primary && previousEmotion.primary !== 'neutral' && previousIntensity >= 0.45;
  if (!(currentNeutral && priorUsable && hasContinuityCue(inputText))) return draftState;
  const carried = sanitizePlain(previous);
  return {
    ...draftState,
    ...carried,
    emotion: {
      ...currentEmotion,
      ...previousEmotion,
      confidence: Math.max(Number(previousEmotion.confidence || 0) || 0, Number(currentEmotion.confidence || 0) || 0, 0.55),
      intensity: Math.max(previousIntensity, currentIntensity, 0.5)
    },
    runtime_meta: {
      ...(draftState.runtime_meta || {}),
      carried_from_previous: true,
      carry_reason: 'deepening_turn_low_signal_current_emotion',
      generated_at: new Date().toISOString()
    }
  };
}

function riskFlagsFromInput(inputText, resolved, contracts) {
  const normalized = normalizeText(inputText);
  const flags = [];
  const riskLexicon = [
    { flag: 'self_harm_language', phrases: ['kill myself', 'end my life', 'hurt myself', 'do not want to live', "don't want to live"] },
    { flag: 'violence_language', phrases: ['hurt someone', 'kill them', 'make them pay'] },
    { flag: 'panic_escalation', phrases: ['panic attack', 'i cannot breathe', "i can't breathe"] },
    { flag: 'despair_language', phrases: ['hopeless', 'no way out', 'nothing matters'] }
  ];
  for (const item of riskLexicon) {
    if (item.phrases.some((phrase) => normalized.includes(normalizeText(phrase)))) flags.push(item.flag);
  }
  const profile = getNuanceProfile(resolved.primary, contracts);
  if (Array.isArray(profile.risk_flags)) {
    for (const risk of profile.risk_flags) {
      if (resolved.secondary === 'hopelessness' && String(risk).includes('despair')) flags.push(risk);
      if (resolved.secondary === 'emotional_numbness' && String(risk).includes('shutdown')) flags.push(risk);
    }
  }
  return [...new Set(flags)].slice(0, 10);
}

function buildResolvedState(inputText, context = {}, options = {}) {
  const contracts = options.contracts || loadContracts(options);
  const resolved = resolveCandidate(inputText, contracts);
  const profile = getNuanceProfile(resolved.primary, contracts);
  const risk_flags = riskFlagsFromInput(inputText, resolved, contracts);
  const escalationNeeded = risk_flags.includes('self_harm_language') || risk_flags.includes('violence_language');
  const timing = profile.timing_profile || { pause_before_response: false, response_length: 'short', followup_delay: 'light', pacing: 'natural' };
  const careDefaults = Array.isArray(profile.care_sequence_defaults) ? profile.care_sequence_defaults : ['observe', 'clarify'];
  const responseStyle = Array.isArray(profile.response_style) ? profile.response_style : ['clarity'];
  const emotion = { primary: resolved.primary, secondary: resolved.secondary, confidence: resolved.confidence, intensity: resolved.intensity };
  const stateDrift = updateEmotionState(context.previousEmotionState || {}, emotion, { windowSize: contracts.baseLabels && contracts.baseLabels.state_tracking ? contracts.baseLabels.state_tracking.rolling_window_size : 3 });
  const dominantAxis = resolveDominantAxis(resolved.primary, resolved.secondary, contracts);

  const draftState = {
    schema_version: 'marion-resolved-emotion-state.v1.0',
    emotion,
    blend_profile: { weights: { [resolved.primary]: resolved.confidence }, dominant_axis: dominantAxis, interaction_note: `${resolved.primary} / ${resolved.secondary} resolved from pattern and suppression analysis` },
    nuance: { subtype: resolved.secondary, social_pattern: Array.isArray(profile.social_patterns) && profile.social_patterns[0] ? profile.social_patterns[0] : 'low_signal', suppression_signal: resolved.suppression_signal, risk_flags },
    state_drift: stateDrift,
    psychology: {
      interpretation: 'Resolved emotional signal for Marion composition; not a diagnosis.',
      care_mode: resolved.primary === 'fear' ? 'stabilization_first' : resolved.primary === 'anger' ? 'containment_first' : resolved.primary === 'joy' ? 'affirmation_first' : resolved.primary === 'neutral' ? 'neutral_observation' : 'validation_first',
      care_sequence: careDefaults
    },
    support: { tone: responseStyle.includes('warmth') ? 'gentle' : 'steady', followup: true, advice_level: 'low', timing_profile: timing },
    guard: {
      diagnosis_block: true,
      safe_to_continue: !escalationNeeded,
      escalation_needed: escalationNeeded,
      detected_flags: risk_flags,
      action_mode: escalationNeeded ? (risk_flags.includes('violence_language') ? 'deescalate_then_safety_boundary' : 'stabilize_then_external_support') : (risk_flags.includes('panic_escalation') ? 'grounding_first' : 'supportive_monitoring')
    },
    marion_handoff: {
      interpreter_summary: 'Use resolved state only. Do not expose raw pattern matches. Avoid diagnosis and emotional over-performance.',
      nyx_expression_goal: 'Sound present, steady, context-aware, and restrained.',
      response_constraints: ['no diagnosis', 'no cheerleading overreach', 'keep first response concise', 'do not expose raw emotion analysis'],
      nyx_contract: { reply_mode: 'resolved_state_only', followup_cap: 1, pacing_source: 'support.timing_profile' }
    },
    runtime_meta: { source: 'emotionRuntime.resolveEmotionState', raw_pattern_count: resolved.raw_candidates.length, raw_patterns_redacted_from_nyx: true, suppression: resolved.suppression, generated_at: new Date().toISOString() }
  };

  const carriedState = mergePreviousEmotionWhenNeeded(inputText, draftState, context);
  const governed = governResolvedState(carriedState, { recentReplies: context.recentReplies || [] });
  return sanitizePlain(validateResolvedState(governed, contracts).state);
}

function resolveEmotionState(inputText, context = {}, options = {}) {
  try {
    const state = buildResolvedState(inputText, context, options);
    return { ok: true, mode: 'resolved_state_only', state };
  } catch (error) {
    const fallback = {
      schema_version: 'marion-resolved-emotion-state.v1.0',
      emotion: { primary: 'neutral', secondary: 'unclear', confidence: 0.2, intensity: 0.15 },
      blend_profile: { weights: { neutral: 0.2 }, dominant_axis: 'low_signal_state', interaction_note: 'Emotion runtime fallback after validation or contract failure.' },
      nuance: { subtype: 'unclear', social_pattern: 'low_signal', suppression_signal: 'low_signal', risk_flags: [] },
      state_drift: {},
      psychology: { interpretation: 'Fallback neutral state; no diagnosis.', care_mode: 'neutral_observation', care_sequence: ['observe', 'clarify'] },
      support: { tone: 'steady', followup: true, advice_level: 'low', timing_profile: { pause_before_response: false, response_length: 'short', followup_delay: 'light', pacing: 'natural' } },
      guard: { diagnosis_block: true, safe_to_continue: true, escalation_needed: false, detected_flags: [], action_mode: 'neutral_continue' },
      marion_handoff: { interpreter_summary: 'Fallback state generated; continue without emotional overreach.', nyx_expression_goal: 'Stay clear and steady.', response_constraints: ['no diagnosis', 'do not over-validate'], nyx_contract: { reply_mode: 'resolved_state_only', followup_cap: 1, pacing_source: 'support.timing_profile' } },
      runtime_meta: { source: 'emotionRuntime.resolveEmotionState.fallback', error: error.message, generated_at: new Date().toISOString() }
    };
    return { ok: false, mode: 'resolved_state_only', error: 'emotion_runtime_failed', detail: error.message, state: fallback };
  }
}

module.exports = { DEFAULT_CONTRACT_DIR, DEFAULT_FILES, loadContracts, getHealth, matchPatternCandidates, resolveEmotionState, buildResolvedState, hasContinuityCue, sanitizePlain };
