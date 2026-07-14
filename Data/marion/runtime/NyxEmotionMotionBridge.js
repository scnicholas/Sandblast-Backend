'use strict';

/**
 * NyxEmotionMotionBridge
 * Persistent-guide motion metadata bridge.
 *
 * Produces lightweight avatar motion metadata for idle, listening, thinking,
 * speaking, guiding and recovery states. It never stores raw audio.
 */

const VERSION = 'nyx.emotionMotionBridge/1.1-persistent-guide-motion';
const MOTION_CONTRACT = 'nyx.avatar.motionProfile/1.1';
const GUIDE_STATES = new Set(['available', 'listening', 'thinking', 'speaking', 'guiding', 'quiet', 'recovery', 'minimized', 'idle']);
const MAX_DURATION_MS = 30 * 60 * 1000;
const MAX_VISEMES = 100000;

function safeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function safeObj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function positiveMs(value, max = MAX_DURATION_MS) {
  return Math.max(0, Math.min(max, Math.round(Number(value || 0) || 0)));
}

function normalizeGuideState(value, speaking) {
  if (speaking) return 'speaking';
  const state = safeText(value || 'available').toLowerCase().replace(/[^a-z0-9_-]+/g, '');
  return GUIDE_STATES.has(state) ? state : 'available';
}

function buildMotionTimeline(input) {
  const src = safeObj(input);
  const timing = safeObj(src.timing);
  const expression = safeText(safeObj(src.expression).expression || src.expressionState || 'focused_warm');
  const speechMs = positiveMs(timing.actualDurationMs || timing.estimatedDurationMs || src.estimatedDurationMs);
  const leadInMs = positiveMs(timing.leadInMs || src.leadInMs || (speechMs ? 120 : 0), 2000);
  const settleMs = positiveMs(timing.settleMs || src.settleMs || (speechMs ? 180 : 0), 3000);
  const totalMs = positiveMs(timing.totalAnimationWindowMs || (leadInMs + speechMs + settleMs));
  const guideState = normalizeGuideState(src.guideState || src.state, speechMs > 0);
  const reducedMotion = src.reducedMotion === true;

  if (speechMs) {
    return [
      { id: 'motion_prepare', type: 'phase', state: 'prepare_speech', expression, startMs: 0, endMs: leadInMs, durationMs: leadInMs },
      { id: 'motion_speech', type: 'phase', state: 'speaking', expression, startMs: leadInMs, endMs: leadInMs + speechMs, durationMs: speechMs },
      { id: 'motion_settle', type: 'phase', state: 'available', expression: 'neutral_idle', startMs: leadInMs + speechMs, endMs: totalMs, durationMs: settleMs }
    ];
  }

  if (reducedMotion || guideState === 'quiet' || guideState === 'minimized') return [];
  const ambientMs = positiveMs(src.ambientWindowMs || 2400, 10000);
  return [{
    id: `guide_${guideState}`,
    type: 'ambient',
    state: guideState,
    expression,
    startMs: 0,
    endMs: ambientMs,
    durationMs: ambientMs,
    loop: true
  }];
}

function buildNyxEmotionMotion(input) {
  const src = safeObj(input);
  const expression = safeObj(src.expression);
  const timing = safeObj(src.timing);
  const visemes = (Array.isArray(src.visemes) ? src.visemes : []).slice(0, MAX_VISEMES);
  const speechMs = positiveMs(timing.actualDurationMs || timing.estimatedDurationMs || src.estimatedDurationMs);
  const speaking = speechMs > 0 && src.speakAllowed !== false;
  const reducedMotion = src.reducedMotion === true || expression.reducedMotion === true;
  const enabled = src.enabled !== false && expression.enabled !== false;
  const guideState = normalizeGuideState(src.guideState || src.state || safeObj(src.guide).state, speaking);
  const defaultIntensity = guideState === 'recovery' ? 0.3 : guideState === 'guiding' ? 0.62 : guideState === 'listening' ? 0.48 : 0.42;
  const intensity = clampNumber(src.intensity, clampNumber(expression.intensity, reducedMotion ? 0.22 : defaultIntensity, 0, 1), 0, reducedMotion ? 0.34 : 0.86);
  const expressionState = safeText(expression.expression || src.expressionState || (guideState === 'recovery' ? 'steady_recovery' : 'focused_warm'));
  const timeline = enabled ? buildMotionTimeline({
    timing,
    expression,
    expressionState,
    estimatedDurationMs: speechMs,
    guideState,
    reducedMotion,
    ambientWindowMs: src.ambientWindowMs
  }) : [];

  return {
    version: VERSION,
    contract: MOTION_CONTRACT,
    source: 'NyxEmotionMotionBridge',
    phase: 'persistent_guide_motion_metadata',
    enabled,
    frontendReady: enabled,
    guideState,
    speechActive: speaking,
    expression: expressionState,
    intensity,
    motionProfile: {
      blink: enabled,
      blinkRate: reducedMotion ? 'minimal' : (guideState === 'listening' ? 'focused' : 'calm'),
      headMicroMotion: enabled && !reducedMotion && !['quiet', 'minimized'].includes(guideState),
      breathMotion: enabled && guideState !== 'minimized',
      browMicroMotion: enabled && !reducedMotion && !['quiet', 'recovery', 'minimized'].includes(guideState),
      guideStateDriver: 'guide_lifecycle',
      mouthDriver: speaking ? (visemes.length ? 'viseme_sequence' : 'speech_open_ready') : 'rest',
      speechStateDriver: 'avatarSpeechState',
      reducedMotionSafe: true
    },
    mouth: {
      enabled: enabled && speaking,
      driver: speaking ? (visemes.length ? 'visemes' : 'speech_open_ready') : 'rest',
      visemeDriven: speaking && visemes.length > 0,
      visemeCount: visemes.length,
      intensity: speaking ? clampNumber(intensity + 0.08, intensity, 0, 1) : 0
    },
    timeline,
    timelineCount: timeline.length,
    reducedMotion,
    estimatedDurationMs: speechMs,
    totalAnimationWindowMs: positiveMs(timing.totalAnimationWindowMs || src.totalAnimationWindowMs || (timeline[0] && timeline[0].endMs)),
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
  MOTION_CONTRACT,
  GUIDE_STATES,
  normalizeGuideState,
  buildNyxEmotionMotion,
  buildMotionTimeline
};
