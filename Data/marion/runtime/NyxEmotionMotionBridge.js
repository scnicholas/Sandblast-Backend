'use strict';

/**
 * NyxEmotionMotionBridge
 * Phase 3B motion metadata bridge.
 *
 * Turns expression + speech timing into lightweight avatar motion metadata for
 * frontend engines. It remains metadata-only and never stores raw audio.
 */

const VERSION = 'nyx.emotionMotionBridge/1.0-phase3b-metadata-bridge';
const MOTION_CONTRACT = 'nyx.avatar.motionProfile/1.0';

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

function positiveMs(value) {
  return Math.max(0, Math.round(Number(value || 0) || 0));
}

function buildMotionTimeline(input) {
  const src = safeObj(input);
  const timing = safeObj(src.timing);
  const leadInMs = positiveMs(timing.leadInMs || src.leadInMs || 120);
  const speechMs = positiveMs(timing.estimatedDurationMs || src.estimatedDurationMs || 0);
  const settleMs = positiveMs(timing.settleMs || src.settleMs || 180);
  const totalMs = positiveMs(timing.totalAnimationWindowMs || (leadInMs + speechMs + settleMs));
  const expression = safeText(safeObj(src.expression).expression || src.expressionState || 'focused_warm');

  if (!speechMs) return [];
  return [
    {
      id: 'motion_prepare',
      type: 'phase',
      state: 'prepare_speech',
      expression,
      startMs: 0,
      endMs: leadInMs,
      durationMs: leadInMs
    },
    {
      id: 'motion_speech',
      type: 'phase',
      state: 'speaking',
      expression,
      startMs: leadInMs,
      endMs: leadInMs + speechMs,
      durationMs: speechMs
    },
    {
      id: 'motion_settle',
      type: 'phase',
      state: 'settle_to_idle',
      expression: 'neutral_idle',
      startMs: leadInMs + speechMs,
      endMs: totalMs,
      durationMs: settleMs
    }
  ];
}

function buildNyxEmotionMotion(input) {
  const src = safeObj(input);
  const expression = safeObj(src.expression);
  const timing = safeObj(src.timing);
  const visemes = Array.isArray(src.visemes) ? src.visemes : [];
  const reducedMotion = src.reducedMotion === true || expression.reducedMotion === true;
  const enabled = src.enabled !== false && expression.enabled !== false && positiveMs(timing.estimatedDurationMs || src.estimatedDurationMs) > 0;
  const intensity = clampNumber(src.intensity, clampNumber(expression.intensity, reducedMotion ? 0.28 : 0.52, 0, 1), 0, reducedMotion ? 0.36 : 0.86);
  const expressionState = safeText(expression.expression || src.expressionState || 'focused_warm');
  const timeline = enabled ? buildMotionTimeline({
    timing,
    expression,
    expressionState,
    estimatedDurationMs: src.estimatedDurationMs
  }) : [];

  return {
    version: VERSION,
    contract: MOTION_CONTRACT,
    source: 'NyxEmotionMotionBridge',
    phase: 'phase3b_animation_metadata_bridge',
    enabled,
    frontendReady: enabled,
    expression: expressionState,
    intensity,
    motionProfile: {
      blink: true,
      blinkRate: reducedMotion ? 'minimal' : 'calm',
      headMicroMotion: !reducedMotion,
      breathMotion: true,
      browMicroMotion: !reducedMotion && expressionState !== 'steady_recovery',
      mouthDriver: visemes.length ? 'viseme_sequence' : 'speech_open_ready',
      speechStateDriver: 'avatarSpeechState',
      reducedMotionSafe: true
    },
    mouth: {
      enabled,
      driver: visemes.length ? 'visemes' : 'speech_open_ready',
      visemeDriven: visemes.length > 0,
      visemeCount: visemes.length,
      intensity: clampNumber(intensity + 0.08, intensity, 0, 1)
    },
    timeline,
    timelineCount: timeline.length,
    reducedMotion,
    estimatedDurationMs: positiveMs(timing.estimatedDurationMs || src.estimatedDurationMs),
    totalAnimationWindowMs: positiveMs(timing.totalAnimationWindowMs || src.totalAnimationWindowMs),
    audioStored: false,
    noRawAudioStored: true,
    transcriptOnly: true
  };
}

module.exports = {
  VERSION,
  MOTION_CONTRACT,
  buildNyxEmotionMotion,
  buildMotionTimeline
};
