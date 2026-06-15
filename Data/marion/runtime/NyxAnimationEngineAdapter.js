'use strict';

/**
 * NyxAnimationEngineAdapter
 * Phase 3B frontend animation packet adapter.
 *
 * Builds engine-neutral avatar animation metadata. The default target is the
 * existing Webflow/custom DOM layer; richer engines can consume the same packet.
 */

const VERSION = 'nyx.animationEngineAdapter/1.0-phase3b-metadata-bridge';
const ENGINE_CONTRACT = 'nyx.avatar.animationEnginePacket/1.0';
const ENGINES = new Set(['custom_dom', 'css_dom', 'rive', 'lottie', 'three']);

function safeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function safeObj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeEngine(value) {
  const engine = safeText(value || 'custom_dom').toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  return ENGINES.has(engine) ? engine : 'custom_dom';
}

function className(value, prefix) {
  const suffix = safeText(value || 'idle').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'idle';
  return `${prefix}-${suffix}`;
}

function buildNyxAnimationEnginePacket(input) {
  const src = safeObj(input);
  const expression = safeObj(src.expression);
  const motion = safeObj(src.motion);
  const timing = safeObj(src.timing);
  const avatar = safeObj(src.avatar);
  const visemes = Array.isArray(src.visemes) ? src.visemes : [];
  const engine = normalizeEngine(src.engine || src.animationEngine || 'custom_dom');
  const enabled = src.enabled !== false && motion.enabled !== false && avatar.enabled !== false;
  const expressionState = safeText(expression.expression || motion.expression || avatar.expression || 'focused_warm');
  const speechState = safeText(avatar.avatarState || avatar.speechState || 'voice_delivery_ready');
  const mouthState = safeText(avatar.mouthState || (visemes.length ? 'viseme_sequence_ready' : 'speech_open_ready'));

  return {
    version: VERSION,
    contract: ENGINE_CONTRACT,
    source: 'NyxAnimationEngineAdapter',
    phase: 'phase3b_animation_metadata_bridge',
    enabled,
    frontendReady: enabled,
    engine,
    driver: 'metadata_only',
    speechState,
    expression: expressionState,
    mouthState,
    cssState: {
      dataFace: enabled ? 'speak' : 'ready',
      expressionClass: className(expressionState, 'nyx-expression'),
      speechClass: className(speechState, 'nyx-speech'),
      mouthClass: className(mouthState, 'nyx-mouth')
    },
    channels: {
      mouth: visemes.length ? 'viseme_sequence' : 'speech_open_ready',
      expression: 'expression_state',
      motion: 'micro_motion_profile',
      timing: 'speech_clock'
    },
    cues: Array.isArray(motion.timeline) ? motion.timeline : [],
    cueCount: Array.isArray(motion.timeline) ? motion.timeline.length : 0,
    visemeCount: visemes.length,
    estimatedDurationMs: Math.max(0, Math.round(Number(timing.estimatedDurationMs || 0) || 0)),
    totalAnimationWindowMs: Math.max(0, Math.round(Number(timing.totalAnimationWindowMs || 0) || 0)),
    reducedMotionSafe: true,
    audioStored: false,
    noRawAudioStored: true,
    transcriptOnly: true
  };
}

module.exports = {
  VERSION,
  ENGINE_CONTRACT,
  normalizeEngine,
  buildNyxAnimationEnginePacket
};
