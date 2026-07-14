'use strict';

/**
 * NyxAvatarMotionTelemetry
 * Non-sensitive motion telemetry summary.
 *
 * Produces bounded count and keyed-hash metadata only. It never stores raw audio
 * or raw transcript and never controls TTS playback.
 */

const crypto = require('crypto');

const VERSION = 'nyx.avatarMotionTelemetry/1.1-privacy-bounds-readiness-hardlock';
const TELEMETRY_CONTRACT = 'nyx.avatar.motionTelemetry/1.1';
const MAX_COUNT = 100000;
const MAX_DURATION_MS = 30 * 60 * 1000;
const PROCESS_HASH_KEY = crypto.randomBytes(32);
const ENGINE_SET = new Set(['custom_dom', 'css_dom', 'rive', 'lottie', 'three']);

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

function boundedNumber(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function normalizeEngine(value) {
  const normalized = safeText(value || 'custom_dom').toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  return ENGINE_SET.has(normalized) ? normalized : 'custom_dom';
}

function hashText(value) {
  const text = safeText(value);
  if (!text) return '';
  const configuredKey = safeText(process.env.SB_NYX_AVATAR_TELEMETRY_HASH_KEY);
  const key = configuredKey || PROCESS_HASH_KEY;
  return crypto.createHmac('sha256', key).update(text, 'utf8').digest('hex').slice(0, 24);
}

function createNyxAvatarMotionTelemetry(input) {
  const src = safeObj(input);
  const expression = safeObj(src.expression);
  const motion = safeObj(src.motion);
  const animation = safeObj(src.animation);
  const timing = safeObj(src.timing);
  const avatar = safeObj(src.avatar);
  const audio = safeObj(src.audio);
  const payload = safeObj(src.payload);
  const playback = safeObj(src.playback);

  const spokenText = safeText(
    src.spokenText || src.speechText || src.textSpeak || src.text ||
    payload.spokenText || payload.textSpeak || payload.text || ''
  );
  const hasTelemetrySignal = !!(
    spokenText ||
    Object.keys(expression).length ||
    Object.keys(motion).length ||
    Object.keys(animation).length ||
    Object.keys(timing).length
  );
  const enabledSignal = firstBooleanSignal(
    src.enabled,
    animation.enabled,
    motion.enabled,
    avatar.enabled,
    src.playable,
    audio.playable,
    payload.playable,
    playback.ready
  );
  const enabled = hasTelemetrySignal && enabledSignal;
  const frontendReady = enabled && firstBooleanSignal(
    animation.frontendReady,
    avatar.frontendReady,
    motion.frontendReady,
    enabled
  );

  const cueCount = boundedNumber(
    animation.cueCount ?? (Array.isArray(motion.timeline) ? motion.timeline.length : motion.timelineCount),
    0,
    MAX_COUNT
  );
  const visemeCount = boundedNumber(
    src.visemeCount ?? animation.visemeCount ?? safeObj(motion.mouth).visemeCount,
    0,
    MAX_COUNT
  );
  const estimatedDurationMs = boundedNumber(
    timing.estimatedDurationMs ?? animation.estimatedDurationMs ?? motion.estimatedDurationMs,
    0,
    MAX_DURATION_MS
  );
  const totalAnimationWindowMs = boundedNumber(
    timing.totalAnimationWindowMs ?? animation.totalAnimationWindowMs ?? motion.totalAnimationWindowMs,
    estimatedDurationMs,
    MAX_DURATION_MS
  );

  return {
    version: VERSION,
    contract: TELEMETRY_CONTRACT,
    source: 'NyxAvatarMotionTelemetry',
    phase: 'phase3b_animation_metadata_bridge',
    enabled,
    frontendReady,
    textHash: hashText(spokenText),
    textHashAlgorithm: 'hmac-sha256-96',
    textHashStableAcrossRestarts: !!safeText(process.env.SB_NYX_AVATAR_TELEMETRY_HASH_KEY),
    expression: safeText(expression.expression || animation.expression || motion.expression || ''),
    engine: normalizeEngine(animation.engine || src.engine || 'custom_dom'),
    cueCount,
    visemeCount,
    estimatedDurationMs,
    totalAnimationWindowMs,
    telemetryOnly: true,
    advisoryOnly: true,
    blocksAudioDelivery: false,
    audioAuthority: 'tts_route',
    rawTextStored: false,
    audioStored: false,
    noRawAudioStored: true,
    transcriptOnly: true
  };
}

module.exports = {
  VERSION,
  TELEMETRY_CONTRACT,
  createNyxAvatarMotionTelemetry,
  hashText
};
