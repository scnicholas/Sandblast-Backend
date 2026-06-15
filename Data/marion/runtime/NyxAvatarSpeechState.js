
'use strict';

/**
 * NyxAvatarSpeechState
 * Phase 2 avatar speech-state builder.
 *
 * Provides a small, frontend-safe state object for avatar animation readiness.
 */

const VERSION = 'nyx.avatarSpeechState/1.1-frontend-ready-contract';

function safeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function buildAvatarSpeechState(input) {
  const src = input && typeof input === 'object' ? input : {};
  const speakAllowed = src.speakAllowed === true;
  const spokenText = safeText(src.spokenText || src.text || '');
  const durationMs = Math.max(0, Number(src.estimatedDurationMs || 0) || 0);
  const visemeCount = Math.max(0, Number(src.visemeCount || 0) || 0);
  const reducedMotion = src.reducedMotion === true;
  const baseIntensity = reducedMotion ? 0.34 : 0.58;
  const intensity = clamp01(src.intensity, speakAllowed && spokenText ? baseIntensity : 0.12);

  const speechState = speakAllowed && spokenText ? 'speaking_ready' : 'idle';
  const mouthState = speakAllowed && spokenText
    ? (reducedMotion ? 'speech_open_ready' : (visemeCount ? 'viseme_sequence_ready' : 'speech_open_ready'))
    : 'rest';

  return {
    version: VERSION,
    source: 'NyxAvatarSpeechState',
    enabled: speakAllowed && !!spokenText,
    frontendReady: speakAllowed && !!spokenText,
    speechState,
    mouthState,
    avatarState: speakAllowed && spokenText ? 'voice_delivery_ready' : 'voice_idle',
    animationPhase: speakAllowed && spokenText ? 'speech_sync_ready' : 'idle',
    intensity,
    motionIntensity: reducedMotion ? Math.min(0.35, intensity) : intensity,
    reducedMotion,
    estimatedDurationMs: durationMs,
    visemeCount,
    leadInState: speakAllowed && spokenText ? 'prepare_mouth' : 'none',
    settleState: speakAllowed && spokenText ? 'return_to_idle' : 'none',
    audioStored: false,
    noRawAudioStored: true,
    transcriptOnly: true
  };
}

module.exports = {
  VERSION,
  buildAvatarSpeechState
};
