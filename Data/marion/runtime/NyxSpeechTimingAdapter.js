'use strict';

/**
 * NyxSpeechTimingAdapter
 * Persistent-guide speech clock.
 *
 * Uses provider/audio duration when available and a bounded deterministic
 * estimate otherwise. It never stores raw audio.
 */

const VERSION = 'nyx.speechTimingAdapter/1.2-provider-duration-authority';
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

function safeObj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
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
  return Math.min(1000, (safeText(text).match(/[,.!?;:]/g) || []).length);
}

function providerDurationMs(options) {
  const opts = safeObj(options);
  const audio = safeObj(opts.audio);
  const candidates = [
    opts.actualDurationMs,
    opts.audioDurationMs,
    opts.durationMs,
    audio.durationMs,
    Number.isFinite(Number(opts.durationSeconds)) ? Number(opts.durationSeconds) * 1000 : NaN,
    Number.isFinite(Number(audio.duration)) ? Number(audio.duration) * 1000 : NaN
  ];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return Math.round(clampNumber(n, 0, MIN_DURATION_MS, MAX_DURATION_MS));
  }
  return 0;
}

function estimateSpeechDurationMs(text, options) {
  const actual = providerDurationMs(options);
  if (actual) return actual;
  const opts = safeObj(options);
  const words = splitWords(text);
  if (!words.length) return 0;
  const wpm = clampNumber(opts.wordsPerMinute, DEFAULT_WORDS_PER_MINUTE, MIN_WORDS_PER_MINUTE, MAX_WORDS_PER_MINUTE);
  const baseMs = (words.length / wpm) * 60000;
  const punctuationPauseMs = punctuationPauseCount(text) * 120;
  const duration = Math.max(words.length * 45, Math.round(baseMs + punctuationPauseMs + 220));
  return Math.round(clampNumber(duration, duration, MIN_DURATION_MS, MAX_DURATION_MS));
}

function buildWordTimings(text, options) {
  const words = splitWords(text);
  const durationMs = estimateSpeechDurationMs(text, options);
  if (!words.length || !durationMs) return [];

  const weights = words.map((word) => Math.max(1, word.replace(/[^\p{L}\p{N}]/gu, '').length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || words.length;
  let cursor = 0;
  return words.map((word, index) => {
    const remainingWeight = weights.slice(index).reduce((sum, weight) => sum + weight, 0) || 1;
    const remainingMs = Math.max(0, durationMs - cursor);
    const proposed = index === words.length - 1 ? remainingMs : Math.max(1, Math.round(remainingMs * (weights[index] / remainingWeight)));
    const endMs = index === words.length - 1 ? durationMs : Math.min(durationMs, cursor + proposed);
    const item = {
      word: word.slice(0, MAX_WORD_CHARS),
      startMs: Math.round(cursor),
      endMs: Math.round(endMs),
      durationMs: Math.max(0, Math.round(endMs - cursor))
    };
    cursor = endMs;
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
  const opts = safeObj(options);
  const value = safeText(text);
  const words = splitWords(value);
  const actualDurationMs = providerDurationMs(opts);
  const estimatedDurationMs = estimateSpeechDurationMs(value, opts);
  const reducedMotion = opts.reducedMotion === true;
  const wordTimings = buildWordTimings(value, { ...opts, actualDurationMs: actualDurationMs || undefined });
  const leadInMs = value ? Math.round(clampNumber(opts.leadInMs, reducedMotion ? 0 : 120, 0, 1000)) : 0;
  const settleMs = value ? Math.round(clampNumber(opts.settleMs, reducedMotion ? 80 : 180, 0, 2000)) : 0;
  const phaseWindows = buildPhaseWindows(estimatedDurationMs, leadInMs, settleMs);

  return {
    version: VERSION,
    source: 'NyxSpeechTimingAdapter',
    clockSource: actualDurationMs ? 'provider_audio' : 'deterministic_estimate',
    durationAuthoritative: !!actualDurationMs,
    actualDurationMs,
    reducedMotion,
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
  providerDurationMs,
  estimateSpeechDurationMs,
  buildWordTimings,
  buildSpeechTiming,
  buildPhaseWindows,
  splitWords,
  punctuationPauseCount
};
