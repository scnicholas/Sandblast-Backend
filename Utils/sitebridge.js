"use strict";

/**
 * Utils/sitebridge.js
 *
 * SiteBridge v1.1.2 (QC HARDEN++++ | FAIL-SOFT LOAD++++ | MULTI-ALIAS REQUIRE++++
 *                   | ASYNC BUILD COMPAT++++ | DEFAULT ENVELOPES++++ | DIAG SAFE++++)
 *
 * GOAL: eliminate deploy-time / runtime 500s caused by:
 *  - case-sensitive filename mismatches in prod (Linux)
 *  - missing/optional domain modules
 *  - bridge callers expecting async build()
 *  - unexpected domain return shapes / oversized diags
 *
 * HARD RULES:
 *  - NO raw user text in outputs.
 *  - No side effects.
 *  - Bounded outputs only.
 *  - Deterministic ordering / dedupe.
 */

const BRIDGE_VERSION = "1.1.2";

// ===============================
// SAFE HELPERS
// ===============================

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

// clampInt signature: clampInt(value, fallback, min, max)
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

function safeBool(x, fallback) {
  if (x === true) return true;
  if (x === false) return false;
  return fallback;
}

// ===============================
// OPTIONAL DOMAIN MODULES (FAIL-OPEN)
// ===============================

function safeRequire(relPath) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(relPath);
  } catch (_e) {
    return null;
  }
}

/**
 * safeRequireAny("./financeKnowledge", ["./FinanceKnowledge","./financeKnowledge","./Financeknowledge"])
 * Helps with case-sensitive deploy environments where the repo may contain mixed casing.
 * NOTE: This does NOT fix a missing file; it only tries known aliases.
 */
function safeRequireAny(primary, aliases = []) {
  const first = safeRequire(primary);
  if (first) return first;
  for (const a of aliases) {
    const m = safeRequire(a);
    if (m) return m;
  }
  return null;
}

// Adjust these to your actual filenames if needed.
// We keep them fail-open so casing differences won’t 500 your server.
const PsychologyK = safeRequireAny("./psychologyKnowledge", ["./PsychologyKnowledge"]);
const CyberK = safeRequireAny("./cyberKnowledge", ["./CyberKnowledge"]);
const EnglishK = safeRequireAny("./englishKnowledge", ["./EnglishKnowledge"]);
const FinanceK = safeRequireAny("./financeKnowledge", ["./FinanceKnowledge", "./Financeknowledge"]);
const LawK = safeRequireAny("./lawKnowledge", ["./LawKnowledge"]);
const AIK = safeRequireAny("./aiKnowledge", ["./AIKnowledge"]);

function callDomain(mod, input) {
  try {
    if (!mod) return null;
    if (typeof mod.getNyxPsycheProfile === "function") return mod.getNyxPsycheProfile(input);
    if (typeof mod.getMarionHints === "function") return mod.getMarionHints(input);
    if (typeof mod.build === "function") return mod.build(input);
    return null;
  } catch (_e) {
    return null;
  }
}

// ===============================
// DEFAULTS + LIMITS
// ===============================

const DEFAULTS = Object.freeze({
  mode: "normal",
  intent: "CLARIFY",
  regulation: "steady", // steady | strained | fragile | crisis
  cognitiveLoad: "medium",
  stance: "teach+verify",
});

const LIMITS = Object.freeze({
  toneCues: 10,
  uiCues: 12,
  guardrails: 12,
  responseCues: 14,
  primer: 6,
  frameworks: 6,
  domainHits: 10,
});

const AUDIO_DEFAULTS = Object.freeze({
  speakEnabled: true,
  listenEnabled: true,
  bargeInAllowed: true,
  userGestureRequired: true,
  silent: false,
  voiceStyle: "neutral", // neutral | upbeat | broadcast | concise | soothing
  maxSpeakChars: 700,
  maxSpeakSeconds: 22,
  cooldownMs: 280,
});

const TEMPO_DEFAULTS = Object.freeze({
  thinkingDelayMs: 220,
  microPauseMs: 110,
  sentencePauseMs: 190,
  chunkChars: 320,
  maxUtterances: 6,
});

const VOICE_PRESETS = Object.freeze({
  normal: "neutral",
  stabilize: "soothing",
  safety: "soothing",
});

const LANE_VOICE = Object.freeze({
  music: "upbeat",
  radio: "upbeat",
  "news-canada": "broadcast",
  news: "broadcast",
  roku: "concise",
  schedule: "concise",
  help: "neutral",
});

// ===============================
// PHASE 3 – TEMPO (PURE HINTS)
// ===============================

function resolveTempo(ctx, opts = {}) {
  const f = isObject(ctx?.features) ? ctx.features : {};

  const t = {
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

  // tighten on stabilize/safety
  const mode = safeStr(ctx?.mode || DEFAULTS.mode, 12);
  const reg = safeStr(ctx?.regulation || DEFAULTS.regulation, 12);
  if (mode === "safety" || mode === "stabilize" || reg === "crisis" || reg === "fragile") {
    t.chunkChars = clampInt(t.chunkChars, TEMPO_DEFAULTS.chunkChars, 120, 420);
    t.maxUtterances = clampInt(t.maxUtterances, TEMPO_DEFAULTS.maxUtterances, 1, 5);
    t.thinkingDelayMs = clampInt(t.thinkingDelayMs, TEMPO_DEFAULTS.thinkingDelayMs, 0, 600);
  }

  return t;
}

// ===============================
// PHASE 1 – AUDIO (PURE HINTS)
// ===============================

function resolveVoiceStyle(features, mode) {
  const f = isObject(features) ? features : {};
  const lane = safeStr(f.lane || f.lastLane || f.activeLane || "", 24).toLowerCase();
  if (lane && LANE_VOICE[lane]) return LANE_VOICE[lane];
  return VOICE_PRESETS[mode] || AUDIO_DEFAULTS.voiceStyle;
}

function resolveAudio(ctx, opts = {}) {
  const f = isObject(ctx?.features) ? ctx.features : {};
  const mode = safeStr(ctx?.mode || DEFAULTS.mode, 12);
  const regulation = safeStr(ctx?.regulation || DEFAULTS.regulation, 12);

  const silent = !!(opts.silentAudio || opts.silent || f.silentAudio || f.silent);

  const audio = {
    speakEnabled: safeBool(opts.speakEnabled ?? f.speakEnabled, AUDIO_DEFAULTS.speakEnabled),
    listenEnabled: safeBool(opts.listenEnabled ?? f.listenEnabled, AUDIO_DEFAULTS.listenEnabled),
    bargeInAllowed: safeBool(opts.bargeInAllowed ?? f.bargeInAllowed, AUDIO_DEFAULTS.bargeInAllowed),
    userGestureRequired: safeBool(opts.userGestureRequired ?? f.userGestureRequired, AUDIO_DEFAULTS.userGestureRequired),
    silent,
    voiceStyle: safeStr(opts.voiceStyle || f.voiceStyle || resolveVoiceStyle(f, mode), 16) || AUDIO_DEFAULTS.voiceStyle,
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

  // Invariant: silent => no speak
  if (audio.silent) audio.speakEnabled = false;

  // Stabilize/safety tuning
  if (mode === "safety" || mode === "stabilize" || regulation === "crisis" || regulation === "fragile") {
    audio.voiceStyle = "soothing";
    audio.maxSpeakChars = clampInt(audio.maxSpeakChars, AUDIO_DEFAULTS.maxSpeakChars, 120, 900);
    audio.maxSpeakSeconds = clampInt(audio.maxSpeakSeconds, AUDIO_DEFAULTS.maxSpeakSeconds, 6, 28);
    audio.bargeInAllowed = true;
  }

  // Embed a bounded tempo copy (convenience)
  audio.tempo = resolveTempo(ctx, opts);

  return audio;
}

// ===============================
// PHASE 2 – INTRO (PURE HINTS)
// ===============================

function resolveIntro(ctx, opts = {}) {
  const f = isObject(ctx?.features) ? ctx.features : {};
  const mode = safeStr(ctx?.mode || DEFAULTS.mode, 12);
  const regulation = safeStr(ctx?.regulation || DEFAULTS.regulation, 12);

  const disableIntro = !!(opts.disableIntro || f.disableIntro);

  let cueKey = safeStr(opts.cueKey || f.cueKey || "nyx_intro_v1", 32);
  const preferShort = !!(opts.shortIntro || f.shortIntro);

  if (preferShort) cueKey = "nyx_intro_short_v1";
  if (mode === "safety" || regulation === "crisis") cueKey = "nyx_intro_safety_v1";
  if (mode === "stabilize" || regulation === "fragile") cueKey = "nyx_intro_stabilize_v1";

  return {
    enabled: !disableIntro,
    cueKey,
    speakOnOpen: safeBool(opts.speakOnOpen ?? f.speakOnOpen, true),
    oncePerSession: safeBool(opts.oncePerSession ?? f.oncePerSession, true),
  };
}

// ===============================
// DOMAIN NORMALIZATION (BOUNDED)
// ===============================

function safeArr(a, max, maxLen) {
  return uniqBounded(a, max, maxLen);
}

function normalizeDomain(domainName, raw) {
  const d = isObject(raw) ? raw : {};
  return {
    enabled: d.enabled !== false,
    domain: domainName,
    focus: safeStr(d.focus || "", 48),
    stance: safeStr(d.stance || "", 48),
    confidence: clamp01(d.confidence),
    primer: safeArr(d.primer || d.principles || [], LIMITS.primer, 90),
    frameworks: safeArr(d.frameworks || [], LIMITS.frameworks, 60),
    guardrails: safeArr(d.guardrails || [], LIMITS.guardrails, 90),
    responseCues: safeArr(d.responseCues || [], LIMITS.responseCues, 60),
    hits: safeArr(d.hits || [], LIMITS.domainHits, 140),
    riskTier: safeStr(d.riskTier || "", 12).toLowerCase(),
    reason: safeStr(d.reason || "", 24),
  };
}

function computeConfidence(domains) {
  const weights = { psychology: 1.6, law: 1.2, cyber: 1.2, ai: 1.1, finance: 1.0, english: 0.9 };
  let sum = 0;
  let wsum = 0;
  for (const k of Object.keys(domains || {})) {
    const d = domains[k];
    if (!d || d.enabled === false) continue;
    const w = weights[k] || 1.0;
    sum += clamp01(d.confidence) * w;
    wsum += w;
  }
  if (!wsum) return 0;
  return clamp01(sum / wsum);
}

// ===============================
// REGULATION / MODE RESOLUTION
// ===============================

function resolveRegulation(features, psychologySlice, tokens) {
  const f = isObject(features) ? features : {};
  const intent = safeStr(f.intent || DEFAULTS.intent, 16).toUpperCase();
  const reg = safeStr(f.regulationState || "", 18).toLowerCase();
  const load = safeStr(f.cognitiveLoad || DEFAULTS.cognitiveLoad, 12).toLowerCase();

  const riskTier = safeStr(psychologySlice?.riskTier || "", 12).toLowerCase();

  // Tokens must be canonical/safe tokens, not raw text.
  const tset = new Set(
    Array.isArray(tokens)
      ? tokens.slice(0, 40).map((t) => safeStr(t, 32).toLowerCase().trim())
      : []
  );

  if (riskTier === "high") return "crisis";
  if (intent === "STABILIZE" || reg === "dysregulated") return "fragile";
  if (load === "high") return "strained";
  if (tset.has("self_harm") || tset.has("suicide") || tset.has("harm")) return "crisis";

  return "steady";
}

function resolveMode(regulation) {
  if (regulation === "crisis") return "safety";
  if (regulation === "fragile") return "stabilize";
  return "normal";
}

function resolveStance(features, regulation, psychologySlice) {
  const f = isObject(features) ? features : {};
  const intent = safeStr(f.intent || DEFAULTS.intent, 16).toUpperCase();
  const desire = safeStr(f.desire || "", 16).toLowerCase();

  if (regulation === "crisis" || regulation === "fragile") return "contain+options";
  if (intent === "ADVANCE" || intent === "EXECUTE") return "confirm+execute";
  if (desire === "mastery") return "teach+structure";

  const ps = safeStr(psychologySlice?.stance || "", 48);
  return ps || DEFAULTS.stance;
}

// ===============================
// FINAL SANITIZER (NO CROSS-CONTAMINATION)
// ===============================

function finalize(out) {
  const o = isObject(out) ? out : {};
  const safe = {
    version: BRIDGE_VERSION,
    queryKey: safeStr(o.queryKey, 48),
    sessionKey: safeStr(o.sessionKey, 72),

    mode: safeStr(o.mode || DEFAULTS.mode, 16),
    intent: safeStr(o.intent || DEFAULTS.intent, 16).toUpperCase() || DEFAULTS.intent,
    regulation: safeStr(o.regulation || DEFAULTS.regulation, 16),
    cognitiveLoad: safeStr(o.cognitiveLoad || DEFAULTS.cognitiveLoad, 16),
    stance: safeStr(o.stance || DEFAULTS.stance, 48),

    toneCues: uniqBounded(o.toneCues || [], LIMITS.toneCues, 24),
    uiCues: uniqBounded(o.uiCues || [], LIMITS.uiCues, 32),
    guardrails: uniqBounded(o.guardrails || [], LIMITS.guardrails, 90),
    responseCues: uniqBounded(o.responseCues || [], LIMITS.responseCues, 60),

    // IMPORTANT: Always provide envelopes (never null) to keep callers simple.
    tempo: isObject(o.tempo) ? o.tempo : { ...TEMPO_DEFAULTS },
    audio: isObject(o.audio) ? o.audio : { ...AUDIO_DEFAULTS, tempo: { ...TEMPO_DEFAULTS } },
    intro: isObject(o.intro) ? o.intro : { enabled: true, cueKey: "nyx_intro_v1", speakOnOpen: true, oncePerSession: true },

    domains: isObject(o.domains) ? o.domains : {},
    confidence: clamp01(o.confidence),
    diag: isObject(o.diag) ? o.diag : {},
  };

  // Invariants
  if (safe.audio && safe.audio.silent) safe.audio.speakEnabled = false;

  // Cap diag bloat
  try {
    const s = JSON.stringify(safe.diag);
    if (s.length > 1800) safe.diag = { trimmed: true };
  } catch (_e) {
    safe.diag = { trimmed: true };
  }

  return safe;
}

// ===============================
// MAIN BUILD (FAIL-SOFT)
// ===============================

async function build(input = {}) {
  try {
    const features = isObject(input.features) ? input.features : {};
    const opts = isObject(input.opts) ? input.opts : {};
    const tokens = Array.isArray(input.tokens) ? input.tokens.slice(0, 180).map((t) => safeStr(t, 48)) : [];

    const queryKey = safeStr(input.queryKey || "", 220);
    const sessionKey = safeStr(input.sessionKey || "", 220);

    // Domain gathers are fail-open
    const commonIn = { features, tokens, queryKey };
    const domainsRaw = {
      psychology: callDomain(PsychologyK, commonIn),
      law: callDomain(LawK, commonIn),
      cyber: callDomain(CyberK, commonIn),
      ai: callDomain(AIK, commonIn),
      finance: callDomain(FinanceK, commonIn),
      english: callDomain(EnglishK, commonIn),
    };

    const domains = {
      psychology: normalizeDomain("psychology", domainsRaw.psychology),
      law: normalizeDomain("law", domainsRaw.law),
      cyber: normalizeDomain("cyber", domainsRaw.cyber),
      ai: normalizeDomain("ai", domainsRaw.ai),
      finance: normalizeDomain("finance", domainsRaw.finance),
      english: normalizeDomain("english", domainsRaw.english),
    };

    const regulation = resolveRegulation(features, domains.psychology, tokens);
    const mode = resolveMode(regulation);
    const intent = safeStr(features.intent || DEFAULTS.intent, 16).toUpperCase();
    const cognitiveLoad = safeStr(features.cognitiveLoad || DEFAULTS.cognitiveLoad, 16).toLowerCase();
    const stance = resolveStance(features, regulation, domains.psychology);

    // Deterministic cues (bounded)
    const toneCues = [];
    const uiCues = [];
    const guardrails = ["no_raw_user_text"];
    const responseCues = [];

    if (mode === "safety") {
      toneCues.push("calm", "direct", "safety_first");
      uiCues.push("minimize_choices", "compact_reply");
      responseCues.push("keep_short", "ask_1_clarifier", "offer_options");
      guardrails.push("no_moralizing", "avoid_minimizing");
    } else if (mode === "stabilize") {
      toneCues.push("warm", "grounded", "short_sentences");
      uiCues.push("minimize_choices", "compact_reply");
      responseCues.push("keep_short", "ask_1_clarifier", "validate_emotion");
      guardrails.push("avoid_shaming", "avoid_minimizing");
    } else {
      toneCues.push("clear", "supportive");
      responseCues.push("keep_short");
    }

    // Merge in domain-provided guardrails/response cues (bounded)
    for (const k of Object.keys(domains)) {
      const d = domains[k];
      if (!d || d.enabled === false) continue;
      for (const g of d.guardrails || []) guardrails.push(g);
      for (const r of d.responseCues || []) responseCues.push(r);
    }

    const ctx = { features, mode, regulation };
    const tempo = resolveTempo(ctx, opts);
    const audio = resolveAudio(ctx, opts);
    const intro = resolveIntro(ctx, opts);
    const confidence = computeConfidence(domains);

    const diag = {
      ok: true,
      bridge: "sitebridge",
      version: BRIDGE_VERSION,
      enabledDomains: {
        psychology: !!PsychologyK,
        law: !!LawK,
        cyber: !!CyberK,
        ai: !!AIK,
        finance: !!FinanceK,
        english: !!EnglishK,
      },
      mode,
      regulation,
    };

    return finalize({
      queryKey,
      sessionKey,
      mode,
      intent,
      regulation,
      cognitiveLoad,
      stance,
      toneCues,
      uiCues,
      guardrails,
      responseCues,
      tempo,
      audio,
      intro,
      domains,
      confidence,
      diag,
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
      toneCues: ["clear"],
      uiCues: ["compact_reply"],
      guardrails: ["fail_open", "no_raw_user_text"],
      responseCues: ["keep_short", "ask_1_clarifier"],
      tempo: { ...TEMPO_DEFAULTS },
      audio: { ...AUDIO_DEFAULTS, speakEnabled: true, silent: false, tempo: { ...TEMPO_DEFAULTS } },
      intro: { enabled: true, cueKey: "nyx_intro_v1", speakOnOpen: true, oncePerSession: true },
      domains: {},
      confidence: 0,
      diag: { failOpen: true, err: safeStr(e && (e.message || e.name || String(e)), 160) },
    });
  }
}

module.exports = {
  build,
  buildPsyche: build, // back-compat with psycheBridge contract
  BRIDGE_VERSION,
};
