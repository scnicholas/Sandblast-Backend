'use strict';

/**
 * NyxAnimationEngineAdapter
 * Persistent-guide animation packet adapter.
 *
 * Builds engine-neutral avatar metadata. It never controls TTS synthesis or
 * browser audio playback. Guide presence and speech readiness are separate.
 */

const VERSION = 'nyx.animationEngineAdapter/1.2-persistent-guide-state';
const ENGINE_CONTRACT = 'nyx.avatar.animationEnginePacket/1.2';
const ENGINES = new Set(['custom_dom', 'css_dom', 'rive', 'lottie', 'three']);
const GUIDE_STATES = new Set(['available', 'listening', 'thinking', 'speaking', 'guiding', 'quiet', 'recovery', 'minimized', 'idle']);
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

function normalizeGuideState(value, speechActive) {
  if (speechActive) return 'speaking';
  const state = safeText(value || 'available').toLowerCase().replace(/[^a-z0-9_-]+/g, '');
  return GUIDE_STATES.has(state) ? state : 'available';
}

function className(value, prefix) {
  const suffix = safeText(value || 'idle').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'idle';
  return `${prefix}-${suffix}`;
}

function boundedTimeline(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_TIMELINE_CUES).map((cue) => {
    if (!cue || typeof cue !== 'object' || Array.isArray(cue)) return null;
    const out = {};
    for (const key of Object.keys(cue).slice(0, 24)) {
      const item = cue[key];
      if (typeof item === 'string') out[key] = item.slice(0, 240);
      else if (typeof item === 'number' && Number.isFinite(item)) out[key] = item;
      else if (typeof item === 'boolean' || item == null) out[key] = item;
    }
    return out;
  }).filter(Boolean);
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
  const guide = safeObj(src.guide || src.guideShell);
  const visemes = Array.isArray(src.visemes) ? src.visemes : [];
  const timeline = boundedTimeline(motion.timeline || src.timeline);
  const engine = normalizeEngine(src.engine || src.animationEngine || 'custom_dom');

  const avatarEnabled = firstBooleanSignal(src.enabled, motion.enabled, avatar.enabled, guide.enabled, true);
  const speechReady = firstBooleanSignal(
    src.speakAllowed,
    src.playable,
    audio.playable,
    payload.playable,
    playback.ready,
    src.shouldPlay,
    audio.shouldPlay,
    payload.shouldPlay
  );
  const guideState = normalizeGuideState(
    src.guideState || guide.state || avatar.guideState || avatar.lifecycleState || src.state,
    speechReady
  );
  const reducedMotion = firstBooleanSignal(src.reducedMotion, motion.reducedMotion, avatar.reducedMotion, guide.reducedMotion, false);
  const expressionState = safeText(expression.expression || motion.expression || avatar.expression || (guideState === 'recovery' ? 'steady_recovery' : 'focused_warm'));
  const speechState = safeText(avatar.speechState || (speechReady ? 'speaking' : guideState));
  const mouthState = safeText(avatar.mouthState || (speechReady ? (visemes.length ? 'viseme_sequence_ready' : 'speech_open_ready') : 'rest'));
  const estimatedDurationMs = finiteNonNegative(timing.estimatedDurationMs, 0, MAX_DURATION_MS);
  const totalAnimationWindowMs = finiteNonNegative(timing.totalAnimationWindowMs, estimatedDurationMs, MAX_DURATION_MS);
  const visemeCount = finiteNonNegative(visemes.length || avatar.visemeCount, 0, MAX_VISEME_COUNT);

  return {
    version: VERSION,
    contract: ENGINE_CONTRACT,
    source: 'NyxAnimationEngineAdapter',
    phase: 'persistent_guide_animation_metadata',
    enabled: avatarEnabled,
    frontendReady: avatarEnabled,
    guideReady: avatarEnabled,
    speechReady,
    speechActive: speechReady,
    guideState,
    reducedMotion,
    engine,
    driver: 'metadata_only',
    speechState,
    expression: expressionState,
    mouthState,
    cssState: {
      dataFace: guideState,
      expressionClass: className(expressionState, 'nyx-expression'),
      guideClass: className(guideState, 'nyx-guide'),
      speechClass: className(speechState, 'nyx-speech'),
      mouthClass: className(mouthState, 'nyx-mouth')
    },
    channels: {
      mouth: speechReady ? (visemeCount ? 'viseme_sequence' : 'speech_open_ready') : 'rest',
      expression: 'expression_state',
      guide: 'guide_lifecycle_state',
      motion: reducedMotion ? 'reduced_motion_profile' : 'micro_motion_profile',
      timing: speechReady ? 'speech_clock' : 'ambient_clock'
    },
    cues: timeline,
    cueCount: timeline.length,
    cuesTruncated: Array.isArray(motion.timeline || src.timeline) && (motion.timeline || src.timeline).length > timeline.length,
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
  GUIDE_STATES,
  normalizeEngine,
  normalizeGuideState,
  buildNyxAnimationEnginePacket
};
