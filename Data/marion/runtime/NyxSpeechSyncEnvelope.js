
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

const VERSION = 'nyx.speechSyncEnvelope/1.1-phase2-integrity-hardlock';
const SPEECH_SYNC_CONTRACT = 'nyx.avatar.speechSync/1.0';

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

function normalizeVoiceMode(value, speakAllowed, spokenText) {
  if (speakAllowed !== true || !safeText(spokenText)) return 'silent';
  return safeText(value).toLowerCase() === 'brief' ? 'brief' : 'full';
}

function hasRawAudioInput(src) {
  const source = safeObj(src);
  return source.rawAudio != null || source.audio != null || source.audioBlob != null || source.blob != null || source.buffer != null;
}

function disabledSpeechSync(reason) {
  return {
    version: VERSION,
    contract: SPEECH_SYNC_CONTRACT,
    enabled: false,
    frontendReady: false,
    reason: safeText(reason || 'SPEECH_SYNC_DISABLED'),
    audioStored: false,
    noRawAudioStored: true,
    transcriptOnly: true,
    visemes: [],
    visemeCount: 0,
    timing: null,
    mouthTimeline: [],
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

  if (hasRawAudioInput(src) || hasRawAudioInput(voice) || hasRawAudioInput(voiceEnvelope)) return disabledSpeechSync('RAW_AUDIO_INPUT_REJECTED');
  if (!speakAllowed) return disabledSpeechSync('SPEAK_NOT_ALLOWED');
  if (!spokenText) return disabledSpeechSync('SPOKEN_TEXT_EMPTY');
  if (!adminVoiceDeliveryAllowed) return disabledSpeechSync('ADMIN_VOICE_REQUIRED');
  if (!finalApproved) return disabledSpeechSync('MARION_FINAL_REQUIRED');

  const timing = buildSpeechTiming(spokenText, src.timing || {});
  const mapped = mapTextToVisemes(spokenText, Object.assign({}, src.viseme || {}, {
    totalDurationMs: timing.estimatedDurationMs
  }));
  const avatar = buildAvatarSpeechState({
    speakAllowed: true,
    spokenText,
    estimatedDurationMs: timing.estimatedDurationMs,
    visemeCount: mapped.count,
    intensity: src.intensity,
    reducedMotion: src.reducedMotion === true
  });
  const voiceMode = normalizeVoiceMode(src.voiceMode || voice.voiceMode || 'full', true, spokenText);

  return {
    version: VERSION,
    contract: SPEECH_SYNC_CONTRACT,
    enabled: true,
    frontendReady: true,
    source: 'NyxSpeechSyncEnvelope',
    authority: 'Marion',
    publicAgent: 'Nyx',
    finalApproved: true,
    speakAllowed: true,
    voiceMode,
    text: spokenText,
    textHash: hashText(spokenText),
    locale: safeText(voiceEnvelope.locale || src.locale || 'en-CA'),
    estimatedDurationMs: timing.estimatedDurationMs,
    totalAnimationWindowMs: timing.totalAnimationWindowMs,
    animationClock: {
      leadInMs: timing.leadInMs,
      speechStartMs: timing.leadInMs,
      speechEndMs: timing.leadInMs + timing.estimatedDurationMs,
      settleEndMs: timing.totalAnimationWindowMs
    },
    timing,
    visemes: mapped.visemes,
    mouthTimeline: mapped.visemes,
    visemeCount: mapped.count,
    visemeFrameMs: mapped.frameMs,
    timingAligned: mapped.timingAligned === true,
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
  SPEECH_SYNC_CONTRACT,
  buildSpeechSyncEnvelope,
  disabledSpeechSync,
  normalizeVoiceMode
};
