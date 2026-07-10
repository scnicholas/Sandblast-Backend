'use strict';

/**
 * MarionEmotionInterpreter
 * Converts base_labels + conversation_patterns + nuance_map into a resolved
 * state only. It intentionally does not expose raw pattern IDs or matched phrases
 * to Nyx/public surfaces.
 */

const fs = require('fs');
const path = require('path');

const VERSION = 'marion.emotionInterpreter/1.0-package-v1';

function safeText(value, maxLength) {
  const max = Number.isFinite(Number(maxLength)) ? Math.max(1, Math.min(Number(maxLength), 4000)) : 1200;
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function loadJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
  } catch (_) {
    return fallback;
  }
}

const labels = loadJson('base_labels.json', { primary_emotions: ['neutral'], secondary_emotions: ['informational'], suppression_signals: [] });
const patterns = loadJson('conversation_patterns.json', { patterns: [] });
const nuanceMap = loadJson('nuance_map.json', {});

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback == null ? 0 : fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function canonicalPrimary(value) {
  const v = safeText(value, 60).toLowerCase();
  return Array.isArray(labels.primary_emotions) && labels.primary_emotions.includes(v) ? v : 'neutral';
}

function canonicalSecondary(value) {
  const v = safeText(value, 80).toLowerCase();
  if (!v) return null;
  return Array.isArray(labels.secondary_emotions) && labels.secondary_emotions.includes(v) ? v : null;
}

function containsPhrase(text, phrase) {
  const source = safeText(text, 4000).toLowerCase();
  const target = safeText(phrase, 300).toLowerCase();
  if (!target) return false;
  return source.includes(target);
}

function scorePatterns(text) {
  const source = safeText(text, 4000).toLowerCase();
  const scored = [];
  (patterns.patterns || []).forEach((p) => {
    const phrases = Array.isArray(p.phrases) ? p.phrases : [];
    const matched = phrases.some((phrase) => containsPhrase(source, phrase));
    if (!matched) return;
    scored.push({
      emotion: canonicalPrimary(p.emotion_bias),
      secondary: canonicalSecondary(p.nuance_bias),
      weight: clamp01(p.weight, 0.4),
      priority: safeText(p.priority, 20),
      suppression: safeText(p.suppression_signal, 60) || null
    });
  });
  return scored;
}

function resolveCare(primary, secondary, intensity) {
  const entry = nuanceMap[primary] && typeof nuanceMap[primary] === 'object' ? nuanceMap[primary] : {};
  const care = Array.isArray(entry.care_sequence_defaults) ? entry.care_sequence_defaults.slice(0, 4) : ['orient', 'clarify'];
  const timing = entry.timing_profile && typeof entry.timing_profile === 'object' ? entry.timing_profile : {
    response_length: intensity >= 0.67 ? 'short' : 'short_to_medium',
    pacing: intensity >= 0.67 ? 'slow_and_containing' : 'normal'
  };
  return { care, timing };
}

function detectRisk(text, primary, secondary, intensity) {
  const t = safeText(text, 4000).toLowerCase();
  const flags = [];
  if (/\b(kill myself|suicidal|self[- ]harm|end it all|don'?t want to live)\b/.test(t)) flags.push('self_harm_language');
  if (/\b(hurt someone|kill someone|attack them|violent)\b/.test(t)) flags.push('violence_language');
  if (/\bpanic|can'?t breathe|freaking out\b/.test(t)) flags.push('panic_escalation');
  if (primary === 'sadness' && (secondary === 'hopelessness' || intensity >= 0.82)) flags.push('despair_language');
  return Array.from(new Set(flags)).slice(0, 6);
}

function interpretEmotion(input, previousState) {
  const text = typeof input === 'string' ? input : safeText(input && (input.text || input.transcript || input.message || input.query), 4000);
  const hits = scorePatterns(text);
  let primary = 'neutral';
  let secondary = 'informational';
  let confidence = 0.42;
  let intensity = 0.18;
  let suppression = null;

  if (hits.length) {
    hits.sort((a, b) => (b.weight - a.weight));
    const top = hits[0];
    primary = top.emotion;
    secondary = top.secondary || (primary === 'neutral' ? 'informational' : null);
    confidence = clamp01(top.weight, 0.55);
    intensity = clamp01(Math.max(top.weight * 0.82, hits.length > 1 ? 0.55 : 0.32), 0.35);
    suppression = top.suppression || null;
  }

  const riskFlags = detectRisk(text, primary, secondary, intensity);
  if (riskFlags.includes('self_harm_language') || riskFlags.includes('violence_language')) {
    intensity = Math.max(intensity, 0.88);
    confidence = Math.max(confidence, 0.8);
  }

  const { care, timing } = resolveCare(primary, secondary, intensity);
  const safeToContinue = !riskFlags.includes('self_harm_language') && !riskFlags.includes('violence_language');

  return {
    schema_version: 'marion-emotion-analysis-schema.v1.2-resolved',
    interpreter_version: VERSION,
    runtime_contract: {
      producer: 'MarionEmotionInterpreter',
      consumer: 'MarionBridge/Nyx expression layer',
      mode: 'resolved_state_only',
      strict_json: true,
      raw_pattern_exposure: 'blocked'
    },
    emotion: { primary, secondary, confidence, intensity },
    nuance: {
      subtype: secondary,
      suppression_signal: suppression,
      risk_flags: riskFlags
    },
    psychology: {
      care_mode: care[0] || 'orient',
      care_sequence: care
    },
    support: {
      tone: primary === 'anger' ? 'steady' : primary === 'fear' ? 'grounded' : primary === 'sadness' ? 'gentle' : 'clear',
      followup: intensity >= 0.34,
      advice_level: intensity >= 0.67 ? 'low' : 'medium',
      timing_profile: timing
    },
    guard: {
      diagnosis_block: true,
      safe_to_continue: safeToContinue,
      escalation_needed: !safeToContinue || riskFlags.includes('panic_escalation'),
      detected_flags: riskFlags,
      action_mode: !safeToContinue ? 'stabilize_then_external_support' : (riskFlags.includes('panic_escalation') ? 'grounding_first' : 'supportive_monitoring')
    },
    marion_handoff: {
      interpreter_summary: primary === 'neutral' ? 'No strong affect detected; keep the answer clear and direct.' : 'Use the resolved emotion state to shape tone without exposing pattern matches.',
      nyx_expression_goal: 'public-safe, context-aware, bounded response',
      nyx_contract: {
        reply_mode: 'resolved_state_only',
        followup_cap: 1,
        pacing_source: 'support.timing_profile'
      }
    },
    pipeline_contract: {
      handoff_visibility: 'resolved_state_only',
      forbidden_to_nyx: ['raw_phrase_matches', 'internal_pattern_ids', 'diagnostic_reasoning', 'unvalidated_labels']
    }
  };
}

module.exports = {
  VERSION,
  interpretEmotion,
  labels,
  nuanceMap
};
