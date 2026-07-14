'use strict';

/**
 * NyxAvatarSpeechState
 * Frontend-safe avatar speech readiness builder.
 *
 * This module is advisory metadata only. It does not synthesize audio, call a
 * provider, or authorize playback. The /api/tts contract remains the sole audio
 * authority.
 */

const VERSION = 'nyx.avatarSpeechState/1.2-playback-contract-alias-hardlock';
const SPEECH_STATE_CONTRACT = 'nyx.avatar.speechState/1.1';
const MAX_DURATION_MS = 30 * 60 * 1000;
const MAX_VISEME_COUNT = 100000;

function safeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function safeObj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function clampNonNegative(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function boolish(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = safeText(value).toLowerCase();
  if (['1', 'true', 'yes', 'on', 'ready', 'enabled', 'playable'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'blocked', 'disabled', 'unavailable'].includes(normalized)) return false;
  return fallback;
}

function firstText() {
  for (const value of arguments) {
    const text = safeText(value);
    if (text) return text;
  }
  return '';
}

function firstBooleanSignal() {
  for (const value of arguments) {
    if (value !== undefined && value !== null && value !== '') return boolish(value, false);
  }
  return false;
}

function buildAvatarSpeechState(input) {
  const src = safeObj(input);
  const audio = safeObj(src.audio);
  const payload = safeObj(src.payload);
  const playback = safeObj(src.playback);
  const speech = safeObj(src.speech);
  const voice = safeObj(src.voice);
  const timing = safeObj(src.timing);
  const avatar = safeObj(src.avatar);

  const spokenText = firstText(
    src.spokenText,
    src.speechText,
    src.textSpeak,
    src.text,
    speech.textSpeak,
    speech.text,
    speech.textDisplay,
    voice.spokenText,
    voice.speechText,
    payload.spokenText,
    payload.textSpeak,
    payload.text
  );

  // Explicit speakAllowed remains the highest-precedence contract. When it is
  // absent, accept the current audio-first aliases so a valid playback packet is
  // not incorrectly downgraded to idle by this metadata layer.
  const speakAllowed = firstBooleanSignal(
    src.speakAllowed,
    voice.speakAllowed,
    speech.speak,
    speech.enabled,
    playback.ready,
    playback.playable,
    src.playable,
    audio.playable,
    payload.playable,
    src.shouldPlay,
    audio.shouldPlay,
    payload.shouldPlay,
    src.autoPlay,
    audio.autoPlay,
    payload.autoPlay
  );

  const playable = firstBooleanSignal(
    src.playable,
    audio.playable,
    payload.playable,
    playback.playable,
    playback.ready
  );

  const durationMs = clampNonNegative(
    src.estimatedDurationMs ?? timing.estimatedDurationMs ?? audio.estimatedDurationMs,
    0,
    MAX_DURATION_MS
  );
  const visemeCount = clampNonNegative(
    src.visemeCount ?? avatar.visemeCount ?? payload.visemeCount,
    0,
    MAX_VISEME_COUNT
  );
  const reducedMotion = firstBooleanSignal(src.reducedMotion, avatar.reducedMotion, payload.reducedMotion);
  const baseIntensity = reducedMotion ? 0.34 : 0.58;
  const speechEligible = speakAllowed && !!spokenText;
  const intensity = clamp01(src.intensity, speechEligible ? baseIntensity : 0.12);

  const speechState = speechEligible ? 'speaking_ready' : 'idle';
  const mouthState = speechEligible
    ? (reducedMotion ? 'speech_open_ready' : (visemeCount ? 'viseme_sequence_ready' : 'speech_open_ready'))
    : 'rest';
  const reason = speechEligible ? '' : (!speakAllowed ? 'SPEAK_NOT_ALLOWED' : 'SPOKEN_TEXT_EMPTY');

  return {
    version: VERSION,
    contract: SPEECH_STATE_CONTRACT,
    source: 'NyxAvatarSpeechState',
    enabled: speechEligible,
    frontendReady: speechEligible,
    playbackReady: speechEligible && playable,
    speakAllowed,
    playable,
    reason,
    speechState,
    mouthState,
    avatarState: speechEligible ? 'voice_delivery_ready' : 'voice_idle',
    animationPhase: speechEligible ? 'speech_sync_ready' : 'idle',
    intensity,
    motionIntensity: reducedMotion ? Math.min(0.35, intensity) : intensity,
    reducedMotion,
    estimatedDurationMs: durationMs,
    visemeCount,
    leadInState: speechEligible ? 'prepare_mouth' : 'none',
    settleState: speechEligible ? 'return_to_idle' : 'none',
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
  SPEECH_STATE_CONTRACT,
  buildAvatarSpeechState
};
