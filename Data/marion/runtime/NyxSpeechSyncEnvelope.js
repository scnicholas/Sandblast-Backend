'use strict';

/**
 * NyxSpeechSyncEnvelope
 * Phase 2 speech-sync envelope.
 *
 * Adds avatar-ready timing and viseme metadata after Marion has approved the
 * final spoken text. It never stores raw audio and does not decide authority.
 */

const crypto = require('crypto');

const { mapTextToVisemes } = require('./NyxVisemeMapper');
const { buildSpeechTiming } = require('./NyxSpeechTimingAdapter');
const { buildAvatarSpeechState } = require('./NyxAvatarSpeechState');

const VERSION = 'nyx.speechSyncEnvelope/1.0-phase2-speech-sync';

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

function disabledSpeechSync(reason) {
  return {
    version: VERSION,
    enabled: false,
    reason: safeText(reason || 'SPEECH_SYNC_DISABLED'),
    audioStored: false,
    transcriptOnly: true,
    visemes: [],
    timing: null,
    avatar: buildAvatarSpeechState({ speakAllowed: false })
  };
}

function buildSpeechSyncEnvelope(input) {
  const src = safeObj(input);
  const voice = safeObj(src.voice);
  const voiceEnvelope = safeObj(src.voiceEnvelope);
  const spokenText = safeText(src.spokenText || voice.spokenText || src.text || '');
  const speakAllowed = src.speakAllowed === true || voice.speakAllowed === true;
  const finalApproved = src.finalApproved === true || voice.finalApproved === true || voice.finalEnvelopeOnly === true;
  const adminVoiceDeliveryAllowed = src.adminVoiceDeliveryAllowed === true || voice.adminVoiceDeliveryAllowed === true || voiceEnvelope.adminVoiceDeliveryAllowed === true;

  if (!speakAllowed) return disabledSpeechSync('SPEAK_NOT_ALLOWED');
  if (!spokenText) return disabledSpeechSync('SPOKEN_TEXT_EMPTY');
  if (!adminVoiceDeliveryAllowed) return disabledSpeechSync('ADMIN_VOICE_REQUIRED');
  if (!finalApproved) return disabledSpeechSync('MARION_FINAL_REQUIRED');

  const timing = buildSpeechTiming(spokenText, src.timing || {});
  const mapped = mapTextToVisemes(spokenText, src.viseme || {});
  const avatar = buildAvatarSpeechState({
    speakAllowed: true,
    spokenText,
    estimatedDurationMs: timing.estimatedDurationMs,
    visemeCount: mapped.count,
    intensity: src.intensity
  });

  return {
    version: VERSION,
    enabled: true,
    source: 'NyxSpeechSyncEnvelope',
    authority: 'Marion',
    publicAgent: 'Nyx',
    finalApproved: true,
    speakAllowed: true,
    voiceMode: safeText(src.voiceMode || voice.voiceMode || 'full') || 'full',
    text: spokenText,
    textHash: hashText(spokenText),
    locale: safeText(voiceEnvelope.locale || src.locale || 'en-CA'),
    estimatedDurationMs: timing.estimatedDurationMs,
    totalAnimationWindowMs: timing.totalAnimationWindowMs,
    timing,
    visemes: mapped.visemes,
    visemeCount: mapped.count,
    mouthState: avatar.mouthState,
    speechState: avatar.speechState,
    avatarSpeechState: avatar.avatarState,
    avatar,
    transcriptOnly: true,
    noRawAudioStored: true,
    audioStored: false,
    phase: 'phase2_speech_sync_preparation'
  };
}

module.exports = {
  VERSION,
  buildSpeechSyncEnvelope,
  disabledSpeechSync
};
