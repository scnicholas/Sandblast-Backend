'use strict';

/**
 * NyxVisemeMapper
 * Phase 2 deterministic text-to-viseme estimator.
 *
 * This module does not inspect or store raw audio. It converts already-approved
 * spoken text into lightweight mouth-shape cues that the frontend can animate.
 */

const VERSION = 'nyx.visemeMapper/1.0-phase2-speech-sync';

const DEFAULT_FRAME_MS = 90;
const MAX_VISEMES = 180;

function safeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeToken(value) {
  return safeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function visemeForToken(token) {
  const t = normalizeToken(token);
  if (!t) return 'REST';
  if (/^(m|b|p)/.test(t)) return 'MBP';
  if (/^(f|v)/.test(t)) return 'FV';
  if (/^(th)/.test(t)) return 'TH';
  if (/^(ch|sh|j|zh)/.test(t)) return 'SHCH';
  if (/^(s|z|x|c)/.test(t)) return 'S';
  if (/^(l|r)/.test(t)) return 'LR';
  if (/^(w|q)/.test(t)) return 'WQ';
  if (/[ou]/.test(t.slice(0, 3))) return 'O';
  if (/[ei]/.test(t.slice(0, 3))) return 'E';
  if (/[a]/.test(t.slice(0, 3))) return 'A';
  if (/[ou]/.test(t)) return 'O';
  if (/[ei]/.test(t)) return 'E';
  if (/[a]/.test(t)) return 'A';
  return 'NEUTRAL';
}

function tokenWeight(token) {
  const t = normalizeToken(token);
  if (!t) return 0.5;
  return clampNumber(0.75 + Math.min(t.length, 12) * 0.08, 1.1, 0.55, 1.8);
}

function splitSpeechTokens(text) {
  return safeText(text)
    .split(/(\s+|[,.!?;:]+)/)
    .map((part) => safeText(part))
    .filter(Boolean)
    .map((part) => {
      const isPause = /^[,.!?;:]+$/.test(part);
      return { raw: part, token: normalizeToken(part), pause: isPause };
    })
    .filter((item) => item.pause || item.token);
}

function mapTextToVisemes(text, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const frameMs = clampNumber(opts.frameMs, DEFAULT_FRAME_MS, 40, 220);
  const maxVisemes = clampNumber(opts.maxVisemes, MAX_VISEMES, 24, 400);
  const tokens = splitSpeechTokens(text);
  const cues = [];
  let cursor = 0;

  for (const item of tokens) {
    if (cues.length >= maxVisemes) break;

    if (item.pause) {
      const durationMs = /[.!?]/.test(item.raw) ? frameMs * 3 : frameMs * 2;
      cues.push({
        viseme: 'REST',
        token: item.raw,
        startMs: Math.round(cursor),
        endMs: Math.round(cursor + durationMs),
        durationMs: Math.round(durationMs),
        mouthOpen: 0,
        intensity: 0.15,
        pause: true
      });
      cursor += durationMs;
      continue;
    }

    const durationMs = Math.round(frameMs * tokenWeight(item.token));
    const viseme = visemeForToken(item.token);
    cues.push({
      viseme,
      token: item.token,
      startMs: Math.round(cursor),
      endMs: Math.round(cursor + durationMs),
      durationMs,
      mouthOpen: mouthOpenForViseme(viseme),
      intensity: intensityForViseme(viseme),
      pause: false
    });
    cursor += durationMs;
  }

  if (!cues.length && safeText(text)) {
    cues.push({
      viseme: 'NEUTRAL',
      token: 'speech',
      startMs: 0,
      endMs: frameMs,
      durationMs: frameMs,
      mouthOpen: 0.35,
      intensity: 0.35,
      pause: false
    });
    cursor = frameMs;
  }

  if (cues.length && cues[cues.length - 1].viseme !== 'REST' && cues.length < maxVisemes) {
    cues.push({
      viseme: 'REST',
      token: '',
      startMs: Math.round(cursor),
      endMs: Math.round(cursor + frameMs),
      durationMs: frameMs,
      mouthOpen: 0,
      intensity: 0.1,
      pause: true
    });
    cursor += frameMs;
  }

  return {
    version: VERSION,
    source: 'NyxVisemeMapper',
    audioStored: false,
    transcriptOnly: true,
    frameMs,
    estimatedDurationMs: Math.round(cursor),
    count: cues.length,
    visemes: cues
  };
}

function mouthOpenForViseme(viseme) {
  switch (String(viseme || '').toUpperCase()) {
    case 'A': return 0.78;
    case 'O': return 0.68;
    case 'E': return 0.52;
    case 'TH': return 0.42;
    case 'SHCH': return 0.38;
    case 'S': return 0.32;
    case 'FV': return 0.28;
    case 'MBP': return 0.12;
    case 'LR': return 0.45;
    case 'WQ': return 0.36;
    case 'NEUTRAL': return 0.3;
    default: return 0;
  }
}

function intensityForViseme(viseme) {
  switch (String(viseme || '').toUpperCase()) {
    case 'A':
    case 'O': return 0.7;
    case 'E':
    case 'LR': return 0.55;
    case 'TH':
    case 'SHCH':
    case 'S': return 0.45;
    case 'FV':
    case 'WQ': return 0.38;
    case 'MBP': return 0.28;
    case 'NEUTRAL': return 0.32;
    default: return 0.1;
  }
}

module.exports = {
  VERSION,
  DEFAULT_FRAME_MS,
  MAX_VISEMES,
  mapTextToVisemes,
  splitSpeechTokens,
  visemeForToken,
  mouthOpenForViseme,
  intensityForViseme
};
