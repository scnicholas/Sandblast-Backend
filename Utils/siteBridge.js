"use strict";

/**
 * Utils/sitebridge.js
 *
 * SiteBridge v1.1.0
 * Domain Aggregator + Control-Signal Resolver for Nyx
 *
 * PHASE 1–5 READY:
 * - Audio hints (pure)
 * - Tempo hints (pure)
 * - Intro cues (pure)
 * - Deterministic merge
 * - Strict sanitization
 * - Fail-open safe
 *
 * HARD RULES:
 * - NO raw user text
 * - No side effects
 * - Bounded outputs only
 * - Deterministic ordering
 */

const BRIDGE_VERSION = "1.1.0";

/* ===============================
   SAFE HELPERS
================================= */

function isObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function safeStr(x, max = 80) {
  if (x === null || x === undefined) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function clampInt(n, fallback, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  if (x < min) return min;
  if (x > max) return max;
  return Math.round(x);
}

function uniqBounded(arr, max = 10, maxLen = 64) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(arr) ? arr : []) {
    const v = safeStr(it, maxLen).trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/* ===============================
   DEFAULTS
================================= */

const DEFAULTS = {
  mode: "normal",
  intent: "CLARIFY",
  regulation: "steady",
  cognitiveLoad: "medium",
  stance: "teach+verify",
};

const AUDIO_DEFAULTS = {
  speakEnabled: true,
  listenEnabled: true,
  bargeInAllowed: true,
  userGestureRequired: true,
  silent: false,
  voiceStyle: "neutral",
  maxSpeakChars: 700,
  maxSpeakSeconds: 22,
  cooldownMs: 280,
};

const TEMPO_DEFAULTS = {
  thinkingDelayMs: 220,
  microPauseMs: 110,
  sentencePauseMs: 190,
  chunkChars: 320,
  maxUtterances: 6,
};

/* ===============================
   PHASE 3 – TEMPO
================================= */

function resolveTempo(ctx, opts = {}) {
  const f = isObject(ctx?.features) ? ctx.features : {};

  return {
    thinkingDelayMs: clampInt(
      opts.thinkingDelayMs ?? f.thinkingDelayMs ?? TEMPO_DEFAULTS.thinkingDelayMs,
      TEMPO_DEFAULTS.thinkingDelayMs,
      0,
      1200
    ),
    microPauseMs: clampInt(
      opts.microPauseMs ?? f.microPauseMs ?? TEMPO_DEFAULTS.microPauseMs,
      TEMPO_DEFAULTS.microPauseMs,
      0,
      600
    ),
    sentencePauseMs: clampInt(
      opts.sentencePauseMs ?? f.sentencePauseMs ?? TEMPO_DEFAULTS.sentencePauseMs,
      TEMPO_DEFAULTS.sentencePauseMs,
      0,
      900
    ),
    chunkChars: clampInt(
      opts.chunkChars ?? f.chunkChars ?? TEMPO_DEFAULTS.chunkChars,
      TEMPO_DEFAULTS.chunkChars,
      120,
      900
    ),
    maxUtterances: clampInt(
      opts.maxUtterances ?? f.maxUtterances ?? TEMPO_DEFAULTS.maxUtterances,
      TEMPO_DEFAULTS.maxUtterances,
      1,
      10
    ),
  };
}

/* ===============================
   PHASE 1 – AUDIO
================================= */

function resolveAudio(ctx, opts = {}) {
  const f = isObject(ctx?.features) ? ctx.features : {};

  const silent = !!(opts.silent || f.silentAudio);

  const audio = {
    speakEnabled:
      (opts.speakEnabled ?? f.speakEnabled ?? AUDIO_DEFAULTS.speakEnabled) && !silent,
    listenEnabled:
      opts.listenEnabled ?? f.listenEnabled ?? AUDIO_DEFAULTS.listenEnabled,
    bargeInAllowed:
      opts.bargeInAllowed ?? f.bargeInAllowed ?? AUDIO_DEFAULTS.bargeInAllowed,
    userGestureRequired:
      opts.userGestureRequired ??
      f.userGestureRequired ??
      AUDIO_DEFAULTS.userGestureRequired,
    silent,
    voiceStyle: safeStr(
      opts.voiceStyle ?? f.voiceStyle ?? AUDIO_DEFAULTS.voiceStyle,
      16
    ),
    maxSpeakChars: clampInt(
      opts.maxSpeakChars ?? f.maxSpeakChars ?? AUDIO_DEFAULTS.maxSpeakChars,
      AUDIO_DEFAULTS.maxSpeakChars,
      120,
      2200
    ),
    maxSpeakSeconds: clampInt(
      opts.maxSpeakSeconds ?? f.maxSpeakSeconds ?? AUDIO_DEFAULTS.maxSpeakSeconds,
      AUDIO_DEFAULTS.maxSpeakSeconds,
      6,
      60
    ),
    cooldownMs: clampInt(
      opts.cooldownMs ?? f.cooldownMs ?? AUDIO_DEFAULTS.cooldownMs,
      AUDIO_DEFAULTS.cooldownMs,
      0,
      2000
    ),
  };

  if (audio.silent) audio.speakEnabled = false;

  return audio;
}

/* ===============================
   PHASE 2 – INTRO
================================= */

function resolveIntro(ctx, opts = {}) {
  const f = isObject(ctx?.features) ? ctx.features : {};
  const disableIntro = !!(opts.disableIntro || f.disableIntro);

  return {
    enabled: !disableIntro,
    cueKey: safeStr(opts.cueKey || f.cueKey || "nyx_intro_v1", 32),
    speakOnOpen:
      opts.speakOnOpen ?? f.speakOnOpen ?? true,
    oncePerSession:
      opts.oncePerSession ?? f.oncePerSession ?? true,
  };
}

/* ===============================
   FINAL SANITIZER
================================= */

function finalize(out) {
  return {
    version: BRIDGE_VERSION,
    queryKey: safeStr(out.queryKey, 48),
    sessionKey: safeStr(out.sessionKey, 72),

    mode: safeStr(out.mode || DEFAULTS.mode, 16),
    intent: safeStr(out.intent || DEFAULTS.intent, 16),
    regulation: safeStr(out.regulation || DEFAULTS.regulation, 16),
    cognitiveLoad: safeStr(out.cognitiveLoad || DEFAULTS.cognitiveLoad, 16),
    stance: safeStr(out.stance || DEFAULTS.stance, 40),

    toneCues: uniqBounded(out.toneCues, 10, 24),
    uiCues: uniqBounded(out.uiCues, 12, 32),
    guardrails: uniqBounded(out.guardrails, 12, 90),
    responseCues: uniqBounded(out.responseCues, 14, 60),

    tempo: out.tempo,
    audio: out.audio,
    intro: out.intro,

    domains: isObject(out.domains) ? out.domains : {},
    confidence: clamp01(out.confidence),
    diag: isObject(out.diag) ? out.diag : {},
  };
}

/* ===============================
   MAIN BUILD
================================= */

function build(input = {}) {
  try {
    const features = isObject(input.features) ? input.features : {};
    const opts = isObject(input.opts) ? input.opts : {};

    const mode = DEFAULTS.mode;
    const regulation = DEFAULTS.regulation;

    const tempo = resolveTempo({ features }, opts);
    const audio = resolveAudio({ features }, opts);
    const intro = resolveIntro({ features }, opts);

    return finalize({
      queryKey: input.queryKey,
      sessionKey: input.sessionKey,
      mode,
      intent: features.intent || DEFAULTS.intent,
      regulation,
      cognitiveLoad: features.cognitiveLoad || DEFAULTS.cognitiveLoad,
      stance: DEFAULTS.stance,
      toneCues: ["clear", "supportive"],
      uiCues: [],
      guardrails: ["no_raw_user_text"],
      responseCues: ["keep_short"],
      tempo,
      audio,
      intro,
      domains: {},
      confidence: 0.85,
      diag: { ok: true },
    });
  } catch (e) {
    return finalize({
      queryKey: "",
      sessionKey: "",
      mode: DEFAULTS.mode,
      intent: DEFAULTS.intent,
      regulation: DEFAULTS.regulation,
      cognitiveLoad: DEFAULTS.cognitiveLoad,
      stance: DEFAULTS.stance,
      toneCues: [],
      uiCues: [],
      guardrails: ["fail_open"],
      responseCues: [],
      tempo: TEMPO_DEFAULTS,
      audio: AUDIO_DEFAULTS,
      intro: { enabled: false },
      domains: {},
      confidence: 0,
      diag: { failOpen: true },
    });
  }
}

module.exports = {
  build,
  buildPsyche: build,
};
