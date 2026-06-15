
'use strict';

/**
 * NyxSpeechTimingAdapter
 * Phase 2 speech timing estimator.
 *
 * Converts approved spoken text into deterministic timing windows. This is not
 * TTS-provider timing; it is a safe fallback clock for avatar preparation.
 */

const VERSION = 'nyx.speechTimingAdapter/1.1-monotonic-phase2-clock';

const DEFAULT_WORDS_PER_MINUTE = 155;
const MIN_WORDS_PER_MINUTE = 90;
const MAX_WORDS_PER_MINUTE = 240;
const MIN_DURATION_MS = 650;
const MAX_DURATION_MS = 30000;
const MAX_WORDS = 420;
const MAX_WORD_CHARS = 48;

function safeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function splitWords(text) {
  return safeText(text).split(/\s+/).map((word) => word.trim()).filter(Boolean).slice(0, MAX_WORDS);
}

function punctuationPauseCount(text) {
  return (safeText(text).match(/[,.!?;:]/g) || []).length;
}

function estimateSpeechDurationMs(text, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const words = splitWords(text);
  const wpm = clampNumber(opts.wordsPerMinute, DEFAULT_WORDS_PER_MINUTE, MIN_WORDS_PER_MINUTE, MAX_WORDS_PER_MINUTE);
  const baseMs = words.length ? (words.length / wpm) * 60000 : 0;
  const punctuationPauseMs = punctuationPauseCount(text) * 120;
  const duration = Math.round(baseMs + punctuationPauseMs + 220);
  return clampNumber(duration, words.length ? duration : 0, words.length ? MIN_DURATION_MS : 0, MAX_DURATION_MS);
}

function buildWordTimings(text, options) {
  const words = splitWords(text);
  const durationMs = estimateSpeechDurationMs(text, options);
  if (!words.length || !durationMs) return [];

  const weights = words.map((word) => Math.max(1, word.replace(/[^a-z0-9]/gi, '').length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || words.length;
  let cursor = 0;
  return words.map((word, index) => {
    const remainingWords = words.length - index - 1;
    const minRemainingMs = remainingWords * 45;
    const proposed = Math.max(45, Math.round(durationMs * (weights[index] / totalWeight)));
    const end = index === words.length - 1 ? durationMs : Math.min(durationMs - minRemainingMs, cursor + proposed);
    const safeEnd = Math.max(cursor, end);
    const item = {
      word: word.slice(0, MAX_WORD_CHARS),
      startMs: Math.round(cursor),
      endMs: Math.round(safeEnd),
      durationMs: Math.max(0, Math.round(safeEnd - cursor))
    };
    cursor = safeEnd;
    return item;
  });
}

function buildPhaseWindows(estimatedDurationMs, leadInMs, settleMs) {
  const lead = Math.max(0, Math.round(Number(leadInMs || 0) || 0));
  const speech = Math.max(0, Math.round(Number(estimatedDurationMs || 0) || 0));
  const settle = Math.max(0, Math.round(Number(settleMs || 0) || 0));
  return {
    prepare: { startMs: 0, endMs: lead, durationMs: lead },
    speech: { startMs: lead, endMs: lead + speech, durationMs: speech },
    settle: { startMs: lead + speech, endMs: lead + speech + settle, durationMs: settle }
  };
}

function buildSpeechTiming(text, options) {
  const value = safeText(text);
  const words = splitWords(value);
  const estimatedDurationMs = estimateSpeechDurationMs(value, options);
  const wordTimings = buildWordTimings(value, options);
  const leadInMs = value ? 120 : 0;
  const settleMs = value ? 180 : 0;
  const phaseWindows = buildPhaseWindows(estimatedDurationMs, leadInMs, settleMs);

  return {
    version: VERSION,
    source: 'NyxSpeechTimingAdapter',
    audioStored: false,
    noRawAudioStored: true,
    transcriptOnly: true,
    words: words.length,
    characters: value.length,
    punctuationPauses: punctuationPauseCount(value),
    estimatedDurationMs,
    leadInMs,
    settleMs,
    totalAnimationWindowMs: estimatedDurationMs + leadInMs + settleMs,
    phaseWindows,
    monotonic: true,
    wordTimings
  };
}

module.exports = {
  VERSION,
  DEFAULT_WORDS_PER_MINUTE,
  MIN_WORDS_PER_MINUTE,
  MAX_WORDS_PER_MINUTE,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
  estimateSpeechDurationMs,
  buildWordTimings,
  buildSpeechTiming,
  buildPhaseWindows,
  splitWords,
  punctuationPauseCount
};
