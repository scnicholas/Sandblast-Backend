'use strict';

/**
 * NyxSpeechTimingAdapter
 * Phase 2 speech timing estimator.
 *
 * Converts approved spoken text into deterministic timing windows. This is not
 * TTS-provider timing; it is a safe fallback clock for avatar preparation.
 */

const VERSION = 'nyx.speechTimingAdapter/1.0-phase2-speech-sync';

const DEFAULT_WORDS_PER_MINUTE = 155;
const MIN_DURATION_MS = 650;
const MAX_DURATION_MS = 30000;

function safeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function splitWords(text) {
  return safeText(text).split(/\s+/).map((word) => word.trim()).filter(Boolean);
}

function estimateSpeechDurationMs(text, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const words = splitWords(text);
  const wpm = clampNumber(opts.wordsPerMinute, DEFAULT_WORDS_PER_MINUTE, 90, 240);
  const baseMs = words.length ? (words.length / wpm) * 60000 : 0;
  const punctuationPauseMs = (safeText(text).match(/[,.!?;:]/g) || []).length * 120;
  const duration = Math.round(baseMs + punctuationPauseMs + 220);
  return clampNumber(duration, words.length ? duration : 0, words.length ? MIN_DURATION_MS : 0, MAX_DURATION_MS);
}

function buildWordTimings(text, options) {
  const words = splitWords(text);
  const durationMs = estimateSpeechDurationMs(text, options);
  if (!words.length || !durationMs) return [];

  const totalWeight = words.reduce((sum, word) => sum + Math.max(1, word.replace(/[^a-z0-9]/gi, '').length), 0);
  let cursor = 0;
  return words.map((word, index) => {
    const weight = Math.max(1, word.replace(/[^a-z0-9]/gi, '').length);
    const rawDuration = Math.max(90, Math.round(durationMs * (weight / totalWeight)));
    const end = index === words.length - 1 ? durationMs : Math.min(durationMs, cursor + rawDuration);
    const item = {
      word: word.slice(0, 48),
      startMs: Math.round(cursor),
      endMs: Math.round(end),
      durationMs: Math.max(0, Math.round(end - cursor))
    };
    cursor = end;
    return item;
  });
}

function buildSpeechTiming(text, options) {
  const value = safeText(text);
  const words = splitWords(value);
  const estimatedDurationMs = estimateSpeechDurationMs(value, options);
  const wordTimings = buildWordTimings(value, options);
  const leadInMs = value ? 120 : 0;
  const settleMs = value ? 180 : 0;

  return {
    version: VERSION,
    source: 'NyxSpeechTimingAdapter',
    audioStored: false,
    transcriptOnly: true,
    words: words.length,
    characters: value.length,
    estimatedDurationMs,
    leadInMs,
    settleMs,
    totalAnimationWindowMs: estimatedDurationMs + leadInMs + settleMs,
    wordTimings
  };
}

module.exports = {
  VERSION,
  DEFAULT_WORDS_PER_MINUTE,
  estimateSpeechDurationMs,
  buildWordTimings,
  buildSpeechTiming
};
