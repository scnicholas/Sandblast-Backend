'use strict';

/**
 * NyxAvatarMotionTelemetry
 * Phase 3B non-sensitive motion telemetry summary.
 *
 * Produces count/hash metadata only. It never stores raw audio or raw transcript.
 */

const crypto = require('crypto');

const VERSION = 'nyx.avatarMotionTelemetry/1.0-phase3b-metadata-bridge';
const TELEMETRY_CONTRACT = 'nyx.avatar.motionTelemetry/1.0';

function safeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function safeObj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hashText(value) {
  const text = safeText(value);
  if (!text) return '';
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 24);
}

function createNyxAvatarMotionTelemetry(input) {
  const src = safeObj(input);
  const expression = safeObj(src.expression);
  const motion = safeObj(src.motion);
  const animation = safeObj(src.animation);
  const timing = safeObj(src.timing);
  const enabled = src.enabled !== false && animation.enabled !== false && motion.enabled !== false;

  return {
    version: VERSION,
    contract: TELEMETRY_CONTRACT,
    source: 'NyxAvatarMotionTelemetry',
    phase: 'phase3b_animation_metadata_bridge',
    enabled,
    frontendReady: enabled,
    textHash: hashText(src.spokenText || src.text || ''),
    expression: safeText(expression.expression || animation.expression || motion.expression || ''),
    engine: safeText(animation.engine || 'custom_dom'),
    cueCount: Number(animation.cueCount || motion.timelineCount || 0) || 0,
    visemeCount: Number(src.visemeCount || animation.visemeCount || motion.mouth && motion.mouth.visemeCount || 0) || 0,
    estimatedDurationMs: Number(timing.estimatedDurationMs || animation.estimatedDurationMs || motion.estimatedDurationMs || 0) || 0,
    totalAnimationWindowMs: Number(timing.totalAnimationWindowMs || animation.totalAnimationWindowMs || motion.totalAnimationWindowMs || 0) || 0,
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
