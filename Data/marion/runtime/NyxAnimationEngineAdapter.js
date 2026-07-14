'use strict';

/**
 * NyxAnimationEngineAdapter
 * Frontend animation packet adapter.
 *
 * Builds engine-neutral avatar animation metadata. This module never controls
 * TTS synthesis or browser audio playback.
 */

const VERSION = 'nyx.animationEngineAdapter/1.1-readiness-integrity-hardlock';
const ENGINE_CONTRACT = 'nyx.avatar.animationEnginePacket/1.1';
const ENGINES = new Set(['custom_dom', 'css_dom', 'rive', 'lottie', 'three']);
const MAX_TIMELINE_CUES = 4096;
const MAX_DURATION_MS = 30 * 60 * 1000;
const MAX_VISEME_COUNT = 100000;

function safeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function safeObj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function boolish(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = safeText(value).toLowerCase();
  if (['1', 'true', 'yes', 'on', 'ready', 'enabled', 'playable'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'blocked', 'disabled', 'unavailable'].includes(normalized)) return false;
  return fallback;
}

function firstBooleanSignal() {
  for (const value of arguments) {
    if (value !== undefined && value !== null && value !== '') return boolish(value, false);
  }
  return false;
}

function finiteNonNegative(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function normalizeEngine(value) {
  const engine = safeText(value || 'custom_dom').toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  return ENGINES.has(engine) ? engine : 'custom_dom';
}

function className(value, prefix) {
  const suffix = safeText(value || 'idle').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'idle';
  return `${prefix}-${suffix}`;
}

function boundedTimeline(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_TIMELINE_CUES).map((cue) => {
    if (!cue || typeof cue !== 'object' || Array.isArray(cue)) return cue;
    const out = {};
    for (const key of Object.keys(cue).slice(0, 24)) {
      const item = cue[key];
      if (typeof item === 'string') out[key] = item.slice(0, 240);
      else if (typeof item === 'number' && Number.isFinite(item)) out[key] = item;
      else if (typeof item === 'boolean' || item == null) out[key] = item;
    }
    return out;
  });
}

function buildNyxAnimationEnginePacket(input) {
  const src = safeObj(input);
  const expression = safeObj(src.expression);
  const motion = safeObj(src.motion);
  const timing = safeObj(src.timing);
  const avatar = safeObj(src.avatar);
  const audio = safeObj(src.audio);
  const payload = safeObj(src.payload);
  const playback = safeObj(src.playback);
  const visemes = Array.isArray(src.visemes) ? src.visemes : [];
  const timeline = boundedTimeline(motion.timeline);
  const engine = normalizeEngine(src.engine || src.animationEngine || 'custom_dom');

  const explicitEnabled = firstBooleanSignal(src.enabled, motion.enabled, avatar.enabled, true);
  const speechReady = firstBooleanSignal(
    avatar.frontendReady,
    avatar.enabled,
    src.speakAllowed,
    src.playable,
    audio.playable,
    payload.playable,
    playback.ready,
    src.shouldPlay,
    audio.shouldPlay,
    payload.shouldPlay
  );
  const enabled = explicitEnabled && speechReady;

  const expressionState = safeText(expression.expression || motion.expression || avatar.expression || 'focused_warm');
  const speechState = safeText(avatar.speechState || avatar.avatarState || (enabled ? 'speaking_ready' : 'idle'));
  const mouthState = safeText(avatar.mouthState || (enabled ? (visemes.length ? 'viseme_sequence_ready' : 'speech_open_ready') : 'rest'));
  const estimatedDurationMs = finiteNonNegative(timing.estimatedDurationMs, 0, MAX_DURATION_MS);
  const totalAnimationWindowMs = finiteNonNegative(timing.totalAnimationWindowMs, estimatedDurationMs, MAX_DURATION_MS);
  const visemeCount = finiteNonNegative(visemes.length || avatar.visemeCount, 0, MAX_VISEME_COUNT);

  return {
    version: VERSION,
    contract: ENGINE_CONTRACT,
    source: 'NyxAnimationEngineAdapter',
    phase: 'phase3b_animation_metadata_bridge',
    enabled,
    frontendReady: enabled,
    speechReady,
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
      mouth: enabled ? (visemeCount ? 'viseme_sequence' : 'speech_open_ready') : 'rest',
      expression: 'expression_state',
      motion: 'micro_motion_profile',
      timing: 'speech_clock'
    },
    cues: timeline,
    cueCount: timeline.length,
    cuesTruncated: Array.isArray(motion.timeline) && motion.timeline.length > timeline.length,
    visemeCount,
    estimatedDurationMs,
    totalAnimationWindowMs,
    reducedMotionSafe: true,
    advisoryOnly: true,
    blocksAudioDelivery: false,
    audioAuthority: 'tts_route',
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
