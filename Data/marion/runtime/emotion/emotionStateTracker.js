/**
 * emotionStateTracker.js
 * Marion Emotion State Tracker
 *
 * Location:
 *   /backend/Data/marion/runtime/emotion/emotionStateTracker.js
 *
 * Version:
 *   emotionStateTracker v1.1.0 CONTINUITY-WINDOW-STABILIZED
 *
 * Purpose:
 *   Maintains rolling emotional continuity, state drift, volatility, and stabilization hints.
 *
 * Architectural rule:
 *   This module tracks state only.
 *   It does NOT infer raw emotion by itself and does NOT compose final user-facing responses.
 */

'use strict';

const VERSION = 'emotionStateTracker v1.1.0 CONTINUITY-WINDOW-STABILIZED';
const DEFAULT_WINDOW_SIZE = 4;
const MAX_WINDOW_SIZE = 8;

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, Number(num.toFixed(4))));
}

function cleanLabel(value, fallback) {
  const text = String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return text || fallback;
}

function safeIso(value) {
  const text = String(value || '').trim();
  if (text && !Number.isNaN(Date.parse(text))) return new Date(text).toISOString();
  return new Date().toISOString();
}

function cleanEntry(entry = {}) {
  const src = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
  return {
    primary: cleanLabel(src.primary, 'neutral'),
    secondary: cleanLabel(src.secondary, 'unclear'),
    intensity: clamp01(src.intensity, 0.25),
    confidence: clamp01(src.confidence, 0.5),
    timestamp: safeIso(src.timestamp)
  };
}

function normalizeWindowSize(size) {
  const n = Number(size);
  if (!Number.isFinite(n)) return DEFAULT_WINDOW_SIZE;
  return Math.max(1, Math.min(Math.trunc(n), MAX_WINDOW_SIZE));
}

function getRollingWindow(previousWindow = [], nextEntry = {}, size = DEFAULT_WINDOW_SIZE) {
  const safeSize = normalizeWindowSize(size);
  const current = Array.isArray(previousWindow) ? previousWindow.map(cleanEntry) : [];
  const next = cleanEntry(nextEntry);
  current.push(next);
  return current.slice(-safeSize);
}

function calculateVolatility(window = []) {
  if (!Array.isArray(window) || window.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < window.length; i += 1) {
    const prev = cleanEntry(window[i - 1]);
    const curr = cleanEntry(window[i]);
    const emotionShift = prev.primary === curr.primary ? 0 : 0.35;
    const secondaryShift = prev.secondary === curr.secondary ? 0 : 0.15;
    const intensityShift = Math.abs(curr.intensity - prev.intensity);
    total += emotionShift + secondaryShift + intensityShift;
  }
  return clamp01(total / (window.length - 1), 0);
}

function calculateStability(window = []) {
  return clamp01(1 - calculateVolatility(window), 1);
}

function dominantPattern(window = []) {
  if (!Array.isArray(window) || !window.length) return 'low_signal';
  const counts = {};
  for (const item of window) {
    const entry = cleanEntry(item);
    counts[entry.primary] = (counts[entry.primary] || 0) + 1;
  }
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))[0] || 'low_signal';
}

function inferTrend(previous = {}, current = {}, volatility = 0) {
  const hasPrevious = previous && typeof previous === 'object' && Object.keys(previous).length > 0;
  const prev = hasPrevious ? cleanEntry(previous) : null;
  const curr = cleanEntry(current);
  if (!prev) return 'new_emotional_signal';
  if (volatility >= 0.67) return 'volatile_emotional_shift';
  if (curr.primary !== prev.primary) return 'state_transition';
  if (curr.secondary !== prev.secondary && curr.intensity >= 0.45) return 'nuance_shift';
  if (curr.intensity > prev.intensity + 0.12) return 'intensifying';
  if (curr.intensity < prev.intensity - 0.12) return 'settling_after_activation';
  return 'stable_continuity';
}

function continuityScore(stability, rolling = []) {
  const sizeFactor = Math.min(Array.isArray(rolling) ? rolling.length / DEFAULT_WINDOW_SIZE : 0, 1);
  return clamp01((stability * 0.7) + (sizeFactor * 0.3), 0.35);
}

function updateEmotionState(previousState = {}, resolvedEmotion = {}, options = {}) {
  const prevState = previousState && typeof previousState === 'object' && !Array.isArray(previousState) ? previousState : {};
  const size = normalizeWindowSize(options.windowSize || prevState.rolling_window_size || DEFAULT_WINDOW_SIZE);
  const previousWindow = Array.isArray(prevState.rolling_window) ? prevState.rolling_window : [];
  const nextEntry = cleanEntry(resolvedEmotion);
  const rolling = getRollingWindow(previousWindow, nextEntry, size);
  const previous = rolling.length > 1 ? rolling[rolling.length - 2] : null;
  const volatility = calculateVolatility(rolling);
  const stability = calculateStability(rolling);
  const trend = inferTrend(previous || {}, nextEntry, volatility);
  const score = continuityScore(stability, rolling);
  return {
    previous_emotion: previous ? previous.primary : null,
    current_emotion: nextEntry.primary,
    previous_secondary: previous ? previous.secondary : null,
    current_secondary: nextEntry.secondary,
    trend,
    stability,
    volatility,
    continuity_score: score,
    rolling_window: rolling,
    rolling_window_size: size,
    dominant_pattern: dominantPattern(rolling),
    stabilization_hint: volatility >= 0.67 ? 'reduce_expressive_shift_and_prioritize_containment' : stability >= 0.67 ? 'maintain_current_pacing' : 'use_measured_transition',
    updated_at: new Date().toISOString()
  };
}

module.exports = {
  VERSION,
  DEFAULT_WINDOW_SIZE,
  cleanEntry,
  getRollingWindow,
  calculateVolatility,
  calculateStability,
  dominantPattern,
  inferTrend,
  updateEmotionState,
  _internal: { cleanLabel, normalizeWindowSize, continuityScore }
};
