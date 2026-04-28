/**
 * emotionStateTracker.js
 * Marion Emotion State Tracker
 *
 * Location:
 *   /backend/Data/marion/runtime/emotion/emotionStateTracker.js
 *
 * Purpose:
 *   Maintains rolling emotional continuity, state drift, volatility, and stabilization hints.
 *
 * Architectural rule:
 *   This module tracks state only.
 *   It does NOT infer raw emotion by itself and does NOT compose final user-facing responses.
 */

'use strict';

const DEFAULT_WINDOW_SIZE = 3;

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, Number(num.toFixed(4))));
}

function cleanEntry(entry = {}) {
  return {
    primary: typeof entry.primary === 'string' ? entry.primary : 'neutral',
    secondary: typeof entry.secondary === 'string' ? entry.secondary : 'unclear',
    intensity: clamp01(entry.intensity, 0.25),
    confidence: clamp01(entry.confidence, 0.5),
    timestamp: entry.timestamp || new Date().toISOString()
  };
}

function getRollingWindow(previousWindow = [], nextEntry = {}, size = DEFAULT_WINDOW_SIZE) {
  const safeSize = Number.isInteger(size) && size > 0 ? size : DEFAULT_WINDOW_SIZE;
  const current = Array.isArray(previousWindow) ? previousWindow.map(cleanEntry) : [];
  current.push(cleanEntry(nextEntry));
  return current.slice(-safeSize);
}

function calculateVolatility(window = []) {
  if (!Array.isArray(window) || window.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < window.length; i += 1) {
    const prev = cleanEntry(window[i - 1]);
    const curr = cleanEntry(window[i]);
    const emotionShift = prev.primary === curr.primary ? 0 : 0.35;
    const intensityShift = Math.abs(curr.intensity - prev.intensity);
    total += emotionShift + intensityShift;
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
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || 'low_signal';
}

function inferTrend(previous = {}, current = {}, volatility = 0) {
  const prev = cleanEntry(previous);
  const curr = cleanEntry(current);
  if (volatility >= 0.67) return 'volatile_emotional_shift';
  if (curr.primary !== prev.primary) return 'state_transition';
  if (curr.intensity > prev.intensity + 0.12) return 'intensifying';
  if (curr.intensity < prev.intensity - 0.12) return 'settling_after_activation';
  return 'stable_continuity';
}

function updateEmotionState(previousState = {}, resolvedEmotion = {}, options = {}) {
  const size = options.windowSize || previousState.rolling_window_size || DEFAULT_WINDOW_SIZE;
  const previousWindow = Array.isArray(previousState.rolling_window) ? previousState.rolling_window : [];
  const nextEntry = cleanEntry(resolvedEmotion);
  const rolling = getRollingWindow(previousWindow, nextEntry, size);
  const previous = rolling.length > 1 ? rolling[rolling.length - 2] : {};
  const volatility = calculateVolatility(rolling);
  const stability = calculateStability(rolling);
  return {
    previous_emotion: previous.primary || null,
    current_emotion: nextEntry.primary,
    previous_secondary: previous.secondary || null,
    current_secondary: nextEntry.secondary,
    trend: inferTrend(previous, nextEntry, volatility),
    stability,
    volatility,
    rolling_window: rolling,
    rolling_window_size: size,
    dominant_pattern: dominantPattern(rolling),
    stabilization_hint: volatility >= 0.67 ? 'reduce_expressive_shift_and_prioritize_containment' : stability >= 0.67 ? 'maintain_current_pacing' : 'use_measured_transition'
  };
}

module.exports = { DEFAULT_WINDOW_SIZE, cleanEntry, getRollingWindow, calculateVolatility, calculateStability, dominantPattern, inferTrend, updateEmotionState };
