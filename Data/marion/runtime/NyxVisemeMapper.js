
'use strict';

/**
 * NyxVisemeMapper
 * Phase 2 deterministic text-to-viseme estimator.
 *
 * This module does not inspect or store raw audio. It converts already-approved
 * spoken text into lightweight mouth-shape cues that the frontend can animate.
 */

const VERSION = 'nyx.visemeMapper/1.1-phase2-timing-aligned-hardlock';

const DEFAULT_FRAME_MS = 90;
const MAX_VISEMES = 180;
const MAX_TEXT_CHARS = 2200;
const VISEME_CONTRACT = 'nyx.avatar.visemeSequence/1.0';

function safeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampInteger(value, fallback, min, max) {
  return Math.trunc(clampNumber(value, fallback, min, max));
}

function clipSpeechText(value) {
  const text = safeText(value);
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS).trim() : text;
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
  return clipSpeechText(text)
    .split(/(\s+|[,.!?;:]+)/)
    .map((part) => safeText(part))
    .filter(Boolean)
    .map((part) => {
      const isPause = /^[,.!?;:]+$/.test(part);
      return { raw: part, token: normalizeToken(part), pause: isPause };
    })
    .filter((item) => item.pause || item.token);
}

function normalizeCue(cue, index) {
  const startMs = Math.max(0, Math.round(Number(cue.startMs || 0) || 0));
  const endMs = Math.max(startMs, Math.round(Number(cue.endMs || startMs) || startMs));
  const viseme = safeText(cue.viseme || 'REST').toUpperCase() || 'REST';
  return {
    id: `v_${String(index).padStart(3, '0')}`,
    index,
    viseme,
    token: safeText(cue.token || '').slice(0, 48),
    startMs,
    endMs,
    durationMs: Math.max(0, Math.round(endMs - startMs)),
    mouthOpen: clampNumber(cue.mouthOpen, mouthOpenForViseme(viseme), 0, 1),
    intensity: clampNumber(cue.intensity, intensityForViseme(viseme), 0, 1),
    pause: cue.pause === true
  };
}

function scaleVisemesToDuration(visemes, targetDurationMs) {
  const target = Math.round(Number(targetDurationMs || 0) || 0);
  if (!Array.isArray(visemes) || !visemes.length || target <= 0) return visemes;
  const current = Math.max(1, Math.round(Number(visemes[visemes.length - 1].endMs || 0) || 0));
  const scale = target / current;
  let cursor = 0;
  return visemes.map((cue, index) => {
    const baseDuration = Math.max(1, Math.round(Number(cue.durationMs || (cue.endMs - cue.startMs) || 1) * scale));
    const end = index === visemes.length - 1 ? target : Math.min(target, cursor + baseDuration);
    const out = normalizeCue(Object.assign({}, cue, { startMs: cursor, endMs: end }), index);
    cursor = end;
    return out;
  });
}

function mapTextToVisemes(text, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const frameMs = clampInteger(opts.frameMs, DEFAULT_FRAME_MS, 40, 220);
  const maxVisemes = clampInteger(opts.maxVisemes, MAX_VISEMES, 24, 400);
  const targetDurationMs = Math.max(0, Math.round(Number(opts.totalDurationMs || opts.estimatedDurationMs || 0) || 0));
  const tokens = splitSpeechTokens(text);
  const rawCues = [];
  let cursor = 0;

  for (const item of tokens) {
    if (rawCues.length >= maxVisemes) break;

    if (item.pause) {
      const durationMs = /[.!?]/.test(item.raw) ? frameMs * 3 : frameMs * 2;
      rawCues.push({
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
    rawCues.push({
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

  if (!rawCues.length && safeText(text)) {
    rawCues.push({
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

  if (rawCues.length && rawCues[rawCues.length - 1].viseme !== 'REST' && rawCues.length < maxVisemes) {
    rawCues.push({
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

  const normalized = rawCues.map(normalizeCue);
  const visemes = targetDurationMs ? scaleVisemesToDuration(normalized, targetDurationMs) : normalized;
  const estimatedDurationMs = visemes.length ? Math.round(visemes[visemes.length - 1].endMs) : 0;

  return {
    version: VERSION,
    contract: VISEME_CONTRACT,
    source: 'NyxVisemeMapper',
    audioStored: false,
    noRawAudioStored: true,
    transcriptOnly: true,
    frameMs,
    timingAligned: targetDurationMs > 0,
    targetDurationMs,
    estimatedDurationMs,
    count: visemes.length,
    maxVisemes,
    truncated: tokens.length > maxVisemes,
    visemes
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
  VISEME_CONTRACT,
  DEFAULT_FRAME_MS,
  MAX_VISEMES,
  MAX_TEXT_CHARS,
  mapTextToVisemes,
  splitSpeechTokens,
  visemeForToken,
  mouthOpenForViseme,
  intensityForViseme,
  scaleVisemesToDuration
};
