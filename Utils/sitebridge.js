"use strict";

/**
 * Utils/SiteBridge.js  (formerly psycheBridge.js / sitebridge.js)
 *
 * SiteBridge — Domain Aggregator + Control-Signal Resolver for Nyx
 *
 * Purpose:
 *  - Keep MarionSO slim: Marion computes features/tokens and calls SiteBridge.build()
 *  - SiteBridge queries enabled domain knowledge modules (Marion-safe APIs)
 *  - Produces ONE deterministic psyche object to hand to Nyx (atoms + control signals)
 *  - Adds Phase 1–5 AUDIO/INTRO/TEMPO control envelopes as *pure hints* (no side effects)
 *
 * Hard Rules:
 *  - NO RAW USER TEXT enters SiteBridge. Ever.
 *  - Fail-open: if any domain module fails/missing, bridge still returns a valid psyche object.
 *  - Deterministic: stable merge ordering, bounded outputs, stable dedupe.
 *  - No cross-contamination: output is sanitized + bounded; no module output is trusted verbatim.
 *
 * Input:
 *  build({ features, tokens, queryKey, sessionKey, opts })
 *
 * Output (high level):
 *  {
 *    version,
 *    queryKey,
 *    sessionKey,
 *    mode,
 *    intent,
 *    regulation,
 *    cognitiveLoad,
 *    stance,
 *    toneCues[],
 *    uiCues[],
 *    guardrails[],
 *    responseCues[],
 *
 *    // PHASE 1–5 additions (host-facing hints)
 *    tempo: {...},
 *    audio: {...},
 *    intro: {...},
 *
 *    domains: { psychology, cyber, english, finance, law, ai },
 *    confidence,
 *    diag
 *  }
 *
 * Notes:
 *  - This module is intentionally SIDE-EFFECT FREE.
 *  - If any domain module returns a Promise (async), build() will not await it (to preserve
 *    backward compatibility). Use buildAsync() if you want awaited resolution.
 */

// =========================
// OPTIONAL DOMAIN MODULES (FAIL-OPEN)
// =========================

function safeRequire(relPath) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(relPath);
  } catch (_e1) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      return require(relPath + ".js");
    } catch (_e2) {
      return null;
    }
  }
}

// Adjust names if your repo uses different filenames.
const PsychologyK = safeRequire("./psychologyKnowledge");
const CyberK = safeRequire("./cyberKnowledge");
const EnglishK = safeRequire("./englishKnowledge");
const FinanceK = safeRequire("./financeKnowledge");
const LawK = safeRequire("./lawKnowledge");
const AIK = safeRequire("./aiKnowledge");

// =========================
// CONFIG
// =========================

const BRIDGE_VERSION = "1.2.2";

// deterministic caps
const LIMITS = Object.freeze({
  guardrails: 12,
  responseCues: 14,
  toneCues: 10,
  uiCues: 12,
  primer: 8,
  domainHits: 12,
  domainAtoms: 4,
  affectLabels: 8,
  reinforcementPhrases: 8,
  diagBytes: 6000,
});

// domain order matters for determinism + precedence
const DOMAIN_ORDER = Object.freeze([
  "psychology",
  "law",
  "cyber",
  "ai",
  "finance",
  "english",
]);

// defaults
const DEFAULTS = Object.freeze({
  mode: "normal",
  intent: "CLARIFY",
  regulation: "steady", // steady | strained | fragile | crisis
  cognitiveLoad: "medium",
  stance: "teach+verify",
});

// PHASE 1: AUDIO DEFAULTS (hints only)
const AUDIO_DEFAULTS = Object.freeze({
  speakEnabled: true,
  listenEnabled: true,
  bargeInAllowed: true,
  userGestureRequired: true, // important for iOS/mobile autoplay constraints
  silent: false,
  voiceStyle: "neutral", // neutral | upbeat | broadcast | concise | soothing
  maxSpeakChars: 700, // host may chunk; this is only a hint
  maxSpeakSeconds: 22, // hint for "keep it tight"
  cooldownMs: 280, // hint to avoid oscillation
});

// PHASE 3: TEMPO DEFAULTS (bounded)
const TEMPO_DEFAULTS = Object.freeze({
  thinkingDelayMs: 220,
  microPauseMs: 110,
  sentencePauseMs: 190,
  chunkChars: 320,
  maxUtterances: 6,
});

// PHASE 4: LANE / MODE VOICE PRESETS (pure)
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

// =========================
// FAIL-OPEN BASELINE
// =========================

function failOpenPsyche(err, input) {
  const queryKey = safeStr(input?.queryKey || "", 32);
  const sessionKey = safeStr(input?.sessionKey || "", 64);
  const tokens = safeTokens(input?.tokens || [], 24);
  const features = isObject(input?.features) ? input.features : {};
  const msg = safeStr(err && (err.message || err.name || String(err)), 160) || "unknown_error";

  const empty = (name) => ({
    enabled: true,
    domain: name,
    queryKey: "",
    focus: "",
    stance: "",
    confidence: 0,
    primer: [],
    frameworks: [],
    guardrails: [],
    responseCues: [],
    snippets: [],
    examples: [],
    hits: [],
    reason: "fail_open",
    riskTier: "",
  });

  const regulation = "steady";
  const mode = "normal";

  // Fail-open must still return a valid full contract.
  return finalizeContract({
    enabled: true,
    reason: "fail_open",
    version: BRIDGE_VERSION,
    queryKey,
    sessionKey,

    mode,
    intent: safeStr(features.intent || DEFAULTS.intent, 16).toUpperCase() || DEFAULTS.intent,
    regulation,
    cognitiveLoad:
      safeStr(features.cognitiveLoad || DEFAULTS.cognitiveLoad, 12).toLowerCase() || DEFAULTS.cognitiveLoad,
    stance: DEFAULTS.stance,

    toneCues: ["clear", "supportive"],
    uiCues: [],

    guardrails: ["no_raw_user_text", "fail_open_enabled"],
    responseCues: ["keep_short", "ask_1_clarifier"],

    // phase 1–5: safe hints
    tempo: resolveTempo({ features, mode, regulation }, input?.opts),
    audio: resolveAudio({ features, mode, regulation }, input?.opts),
    intro: resolveIntro({ features, mode, regulation }, input?.opts),

    domains: {
      psychology: empty("psychology"),
      cyber: empty("cyber"),
      english: empty("english"),
      finance: empty("finance"),
      law: empty("law"),
      ai: empty("ai"),
    },

    confidence: 0,
    diag: {
      failOpen: true,
      error: msg,
      enabledDomains: chooseEnabledDomains(features, tokens, input?.opts),
      tokenCount: Array.isArray(tokens) ? tokens.length : 0,
    },
  });
}

// =========================
// HELPERS
// =========================

function isObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function safeStr(x, max = 80) {
  if (x === null || x === undefined) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function normalizeKey(x) {
  return safeStr(x, 120).trim().toLowerCase();
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

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  const xi = Math.round(x);
  if (xi < min) return min;
  if (xi > max) return max;
  return xi;
}

function pickTop(arr, max) {
  return (Array.isArray(arr) ? arr : []).slice(0, max);
}

function safeTokens(tokens, max = 24) {
  const out = [];
  const seen = new Set();
  for (const t of Array.isArray(tokens) ? tokens : []) {
    const v = String(t || "").toLowerCase().trim().slice(0, 40);
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
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

function isThenable(x) {
  return !!x && (typeof x === "object" || typeof x === "function") && typeof x.then === "function";
}

function sanitizeAtomList(arr, max = 4, maxLen = 240) {
  // Keep atoms shallow and string-safe. If modules send objects, we reduce to short strings.
  const out = [];
  for (const it of Array.isArray(arr) ? arr : []) {
    if (out.length >= max) break;
    if (typeof it === "string") {
      const s = safeStr(it, maxLen).trim();
      if (s) out.push(s);
      continue;
    }
    if (isObject(it)) {
      const s = safeStr(it.text || it.title || it.name || JSON.stringify(it), maxLen).trim();
      if (s) out.push(s);
      continue;
    }
    const s = safeStr(it, maxLen).trim();
    if (s) out.push(s);
  }
  return out;
}

// =========================
// DOMAIN CALL WRAPPERS (FAIL-OPEN)
// =========================

function callNyxProfile(mod, input) {
  try {
    if (!mod) return null;
    if (typeof mod.getNyxPsycheProfile === "function") return mod.getNyxPsycheProfile(input);
    if (typeof mod.getMarionHints === "function") return mod.getMarionHints(input);
    return null;
  } catch (_e) {
    return null;
  }
}

async function callNyxProfileAsync(mod, input) {
  try {
    if (!mod) return null;
    let v = null;
    if (typeof mod.getNyxPsycheProfile === "function") v = mod.getNyxPsycheProfile(input);
    else if (typeof mod.getMarionHints === "function") v = mod.getMarionHints(input);
    if (isThenable(v)) v = await v;
    return v;
  } catch (_e) {
    return null;
  }
}

// =========================
// NORMALIZE DOMAIN SLICE
// =========================

function normalizeDomainSlice(domainName, raw) {
  const d = isObject(raw) ? raw : {};
  return {
    enabled: d.enabled !== false,
    domain: domainName,
    queryKey: safeStr(d.queryKey || "", 32),
    focus: safeStr(d.focus || "", 32),
    stance: safeStr(d.stance || "", 32),
    confidence: clamp01(d.confidence),

    // canonical atoms
    primer: uniqBounded(d.principles || d.primer || [], LIMITS.primer, 80),
    frameworks: uniqBounded(d.frameworks || [], 6, 48),
    guardrails: uniqBounded(d.guardrails || [], LIMITS.guardrails, 80),
    responseCues: uniqBounded(d.responseCues || [], LIMITS.responseCues, 48),

    // atoms only (bounded shallow)
    snippets: sanitizeAtomList(d.snippets || [], LIMITS.domainAtoms, 240),
    examples: sanitizeAtomList(d.faceExamples || d.examples || [], LIMITS.domainAtoms, 240),

    hits: uniqBounded(d.hits || [], LIMITS.domainHits, 140),
    reason: safeStr(d.reason || "", 32),
    riskTier: safeStr(d.riskTier || "", 12).toLowerCase(),
  };
}

// =========================
// GLOBAL PSYCHE RESOLUTION
// =========================

function resolveRegulation(features, psychSlice, tokens) {
  const f = isObject(features) ? features : {};
  const intent = safeStr(f.intent || DEFAULTS.intent, 16).toUpperCase();
  const reg = safeStr(f.regulationState || "", 18).toLowerCase();
  const load = safeStr(f.cognitiveLoad || DEFAULTS.cognitiveLoad, 12).toLowerCase();

  // psychology has precedence if it provides riskTier
  const riskTier = safeStr(psychSlice?.riskTier || "", 12).toLowerCase();
  const tset = new Set(safeTokens(tokens, 24));

  if (riskTier === "high") return "crisis";
  if (intent === "STABILIZE" || reg === "dysregulated") return "fragile";
  if (load === "high") return "strained";

  // if upstream tokenization encoded high-risk canonical tokens (safe-derived), allow escalation
  if (
    tset.has("self_harm") ||
    tset.has("suicide") ||
    tset.has("harm") ||
    tset.has("violence") ||
    tset.has("abuse")
  ) {
    return "crisis";
  }

  return "steady";
}

function resolveStance(features, regulation, psychSlice) {
  const f = isObject(features) ? features : {};
  const intent = safeStr(f.intent || DEFAULTS.intent, 16).toUpperCase();
  const desire = safeStr(f.desire || "", 16).toLowerCase();

  if (regulation === "crisis" || regulation === "fragile") return "contain+options";
  if (intent === "ADVANCE" || intent === "EXECUTE") return "confirm+execute";
  if (desire === "mastery") return "teach+structure";

  const ps = safeStr(psychSlice?.stance || "", 32);
  return ps || DEFAULTS.stance;
}

function resolveMode(regulation) {
  if (regulation === "crisis") return "safety";
  if (regulation === "fragile") return "stabilize";
  return "normal";
}

function mergeByPrecedence(domainSlices, field, max, maxLen) {
  const merged = [];
  for (const name of DOMAIN_ORDER) {
    const slice = domainSlices[name];
    if (!slice || slice.enabled === false) continue;
    const arr = slice[field];
    for (const it of Array.isArray(arr) ? arr : []) merged.push(it);
  }
  return uniqBounded(merged, max, maxLen);
}

function computeOverallConfidence(domainSlices) {
  const weights = {
    psychology: 1.6,
    law: 1.2,
    cyber: 1.2,
    ai: 1.1,
    finance: 1.0,
    english: 0.9,
  };

  let sum = 0;
  let wsum = 0;
  for (const name of Object.keys(domainSlices || {})) {
    const s = domainSlices[name];
    if (!s || s.enabled === false) continue;
    const w = weights[name] || 1.0;
    sum += clamp01(s.confidence) * w;
    wsum += w;
  }
  if (!wsum) return 0;
  return clamp01(sum / wsum);
}

// =========================
// ROUTING (bridge all knowledge, but avoid noise)
// =========================

function chooseEnabledDomains(features, tokens, opts) {
  const o = isObject(opts) ? opts : {};
  const enableAll = o.enableAll !== false;

  const enabled = {
    psychology: true,
    cyber: enableAll,
    english: enableAll,
    finance: enableAll,
    law: enableAll,
    ai: enableAll,
  };

  const f = isObject(features) ? features : {};
  const load = safeStr(f.cognitiveLoad || "", 12).toLowerCase();
  const intent = safeStr(f.intent || "", 16).toUpperCase();
  const reg = safeStr(f.regulationState || "", 18).toLowerCase();

  // Lane-based reinforcement: if the host is in a lane, keep the matching domain ON even if enableAll is false.
  const lane = safeStr(f.lane || f.lastLane || f.activeLane || "", 32).toLowerCase();
  if (!enableAll && lane) {
    if (lane.includes("law")) enabled.law = true;
    if (lane.includes("cyber") || lane.includes("security")) enabled.cyber = true;
    if (lane.includes("ai") || lane.includes("tech")) enabled.ai = true;
    if (lane.includes("finance") || lane.includes("grant") || lane.includes("budget")) enabled.finance = true;
    if (lane.includes("english") || lane.includes("writing")) enabled.english = true;
    if (lane.includes("psych") || lane.includes("support")) enabled.psychology = true;
  }

  if (o.reduceOnStabilize && (intent === "STABILIZE" || reg === "dysregulated" || load === "high")) {
    enabled.law = !!o.keepLawOnStabilize;
    enabled.cyber = !!o.keepCyberOnStabilize;
    enabled.ai = !!o.keepAIOnStabilize;
    enabled.finance = false;
    enabled.english = false;
  }

  // explicit overrides
  if (isObject(o.domains)) {
    for (const k of Object.keys(o.domains)) enabled[k] = !!o.domains[k];
  }

  return enabled;
}

// =========================
// PHASE 1–5: TEMPO/AUDIO/INTRO RESOLUTION (PURE HINTS)
// =========================

function resolveTempo(ctx, opts) {
  const o = isObject(opts) ? opts : {};
  const f = isObject(ctx?.features) ? ctx.features : {};
  const mode = safeStr(ctx?.mode || "normal", 12);
  const regulation = safeStr(ctx?.regulation || "steady", 12);

  // allow host override (bounded)
  const base = {
    thinkingDelayMs: clampInt(
      o.thinkingDelayMs ?? f.thinkingDelayMs ?? TEMPO_DEFAULTS.thinkingDelayMs,
      0,
      1200,
      TEMPO_DEFAULTS.thinkingDelayMs
    ),
    microPauseMs: clampInt(
      o.microPauseMs ?? f.microPauseMs ?? TEMPO_DEFAULTS.microPauseMs,
      0,
      600,
      TEMPO_DEFAULTS.microPauseMs
    ),
    sentencePauseMs: clampInt(
      o.sentencePauseMs ?? f.sentencePauseMs ?? TEMPO_DEFAULTS.sentencePauseMs,
      0,
      900,
      TEMPO_DEFAULTS.sentencePauseMs
    ),
    chunkChars: clampInt(
      o.chunkChars ?? f.chunkChars ?? TEMPO_DEFAULTS.chunkChars,
      120,
      900,
      TEMPO_DEFAULTS.chunkChars
    ),
    maxUtterances: clampInt(
      o.maxUtterances ?? f.maxUtterances ?? TEMPO_DEFAULTS.maxUtterances,
      1,
      10,
      TEMPO_DEFAULTS.maxUtterances
    ),
  };

  // safety/stabilize tighten delivery
  if (mode === "safety" || mode === "stabilize" || regulation === "crisis" || regulation === "fragile") {
    base.thinkingDelayMs = clampInt(base.thinkingDelayMs, 0, 600, base.thinkingDelayMs);
    base.chunkChars = clampInt(base.chunkChars, 120, 420, base.chunkChars);
    base.maxUtterances = clampInt(base.maxUtterances, 1, 5, base.maxUtterances);
  }

  return base;
}

function resolveVoiceStyle(features, mode) {
  const f = isObject(features) ? features : {};
  const lane = safeStr(f.lane || f.lastLane || f.activeLane || "", 24).toLowerCase();
  if (lane && LANE_VOICE[lane]) return LANE_VOICE[lane];
  return VOICE_PRESETS[mode] || AUDIO_DEFAULTS.voiceStyle;
}

function resolveAudio(ctx, opts) {
  const o = isObject(opts) ? opts : {};
  const f = isObject(ctx?.features) ? ctx.features : {};
  const mode = safeStr(ctx?.mode || "normal", 12);
  const regulation = safeStr(ctx?.regulation || "steady", 12);

  const silent = !!(o.silentAudio || o.silent || f.silentAudio || f.silent);
  const disableSpeak = !!(o.disableSpeak || f.disableSpeak);
  const disableListen = !!(o.disableListen || f.disableListen);

  const audio = {
    speakEnabled: safeBool(o.speakEnabled ?? f.speakEnabled, AUDIO_DEFAULTS.speakEnabled) && !disableSpeak,
    listenEnabled: safeBool(o.listenEnabled ?? f.listenEnabled, AUDIO_DEFAULTS.listenEnabled) && !disableListen,
    bargeInAllowed: safeBool(o.bargeInAllowed ?? f.bargeInAllowed, AUDIO_DEFAULTS.bargeInAllowed),
    userGestureRequired: safeBool(o.userGestureRequired ?? f.userGestureRequired, AUDIO_DEFAULTS.userGestureRequired),
    silent,
    voiceStyle: safeStr(o.voiceStyle || f.voiceStyle || resolveVoiceStyle(f, mode), 16) || AUDIO_DEFAULTS.voiceStyle,
    maxSpeakChars: clampInt(
      o.maxSpeakChars ?? f.maxSpeakChars ?? AUDIO_DEFAULTS.maxSpeakChars,
      120,
      2200,
      AUDIO_DEFAULTS.maxSpeakChars
    ),
    maxSpeakSeconds: clampInt(
      o.maxSpeakSeconds ?? f.maxSpeakSeconds ?? AUDIO_DEFAULTS.maxSpeakSeconds,
      6,
      60,
      AUDIO_DEFAULTS.maxSpeakSeconds
    ),
    cooldownMs: clampInt(o.cooldownMs ?? f.cooldownMs ?? AUDIO_DEFAULTS.cooldownMs, 0, 2000, AUDIO_DEFAULTS.cooldownMs),

    // embed a bounded tempo copy for convenience
    tempo: resolveTempo(ctx, opts),
  };

  // In safety/stabilize: be conservative
  if (mode === "safety" || mode === "stabilize" || regulation === "crisis" || regulation === "fragile") {
    audio.voiceStyle = "soothing";
    audio.bargeInAllowed = true;
    audio.maxSpeakChars = clampInt(audio.maxSpeakChars, 120, 900, audio.maxSpeakChars);
    audio.maxSpeakSeconds = clampInt(audio.maxSpeakSeconds, 6, 28, audio.maxSpeakSeconds);
  }

  // Silent implies no speak; listening can remain on if you want (host decides)
  if (audio.silent) {
    audio.speakEnabled = false;
  }

  return audio;
}

function resolveIntro(ctx, opts) {
  const o = isObject(opts) ? opts : {};
  const f = isObject(ctx?.features) ? ctx.features : {};
  const mode = safeStr(ctx?.mode || "normal", 12);
  const regulation = safeStr(ctx?.regulation || "steady", 12);

  const disableIntro = !!(o.disableIntro || f.disableIntro);
  const preferShort = !!(o.shortIntro || f.shortIntro);

  // The bridge cannot patch sessions safely; it emits a cue only.
  // MarionSO should handle "once per session" gating.
  let cueKey = "nyx_intro_v1";
  if (preferShort) cueKey = "nyx_intro_short_v1";

  const lane = safeStr(f.lane || f.lastLane || f.activeLane || "", 32).toLowerCase();
  if (lane && (lane === "news" || lane === "news-canada")) cueKey = "nyx_intro_news_v1";
  if (lane && lane === "roku") cueKey = "nyx_intro_roku_v1";

  if (mode === "safety" || regulation === "crisis") cueKey = "nyx_intro_safety_v1";
  if (mode === "stabilize" || regulation === "fragile") cueKey = "nyx_intro_stabilize_v1";

  return {
    enabled: !disableIntro,
    cueKey,
    speakOnOpen: safeBool(o.speakOnOpen ?? f.speakOnOpen, true),
    oncePerSession: safeBool(o.oncePerSession ?? f.oncePerSession, true), // hint only
  };
}

// =========================
// QC / SANITIZATION (NO CROSS-CONTAMINATION)
// =========================

// =========================
// AFFECT + REINFORCEMENT (SAFE, NO RAW USER TEXT)
// =========================

const AFFECT_LEX = Object.freeze({
  positive: [
    "happy","glad","elated","excited","thrilled","great day","great today","amazing","fantastic","awesome","grateful","proud","relieved",
    "optimistic","motivated","confident","energized","inspired","hopeful","content"
  ],
  neutral: [
    "okay","fine","alright","so-so","normal","neutral","steady","calm","focused","busy","tired","meh","not sure","unsure"
  ],
  negative: [
    "sad","down","upset","angry","frustrated","stressed","anxious","worried","overwhelmed","burned out","burnt out","depressed","lonely",
    "irritated","annoyed","disappointed","scared","afraid","tension","panic"
  ],
});

const REINFORCEMENT_PHRASES = Object.freeze({
  positive: [
    "Love that energy — let’s build on it.",
    "Nice. Keep that momentum; what’s the next step?",
    "That’s a win. Want to turn it into a repeatable pattern?",
    "I’m with you — let’s amplify what’s working.",
    "Beautiful. Give me the goal and I’ll map the path.",
    "Great day vibes. What do you want to accomplish right now?",
  ],
  neutral: [
    "Got it. What outcome are you aiming for?",
    "Okay — let’s get specific. What’s the constraint?",
    "Understood. Do you want fast progress or maximum accuracy?",
    "Fair. Tell me what ‘better’ looks like here.",
    "Alright — I’ll stay practical and keep it clean.",
    "Makes sense. What’s the next smallest step?",
  ],
  negative: [
    "I hear you. Let’s reduce the load and fix one thing at a time.",
    "Totally fair — we’ll stabilize first, then improve.",
    "That sounds heavy. Want me to triage the highest-risk piece?",
    "Okay. We’ll slow down, get clarity, and protect what’s working.",
    "I’m here. Tell me what’s failing and I’ll isolate the cause.",
    "We can get through this — start with the exact error / symptom.",
  ],
});

function toTokenSet(tokens) {
  const out = new Set();
  const arr = Array.isArray(tokens) ? tokens : [];
  for (const t of arr) {
    const s = safeStr(t, 80).toLowerCase();
    if (!s) continue;
    out.add(s);
    // allow formats like "mood:happy" or "mood_happy" or "happy"
    const parts = s.split(/[:_]/g);
    for (const p of parts) if (p) out.add(p);
  }
  return out;
}

function resolveAffect(ctx) {
  const c = isObject(ctx) ? ctx : {};
  const f = isObject(c.features) ? c.features : {};
  const tokSet = toTokenSet(c.tokens || []);

  // optional upstream hints (still safe)
  const hint = safeStr(f.mood || f.sentiment || f.userMood || "", 40).toLowerCase();
  if (hint) {
    tokSet.add(hint);
    for (const p of hint.split(/[:_\s]+/g)) if (p) tokSet.add(p);
  }

  const hit = (list) => list.some((w) => tokSet.has(w));

  let valence = "neutral";
  if (hit(AFFECT_LEX.negative)) valence = "negative";
  else if (hit(AFFECT_LEX.positive)) valence = "positive";
  else if (hit(AFFECT_LEX.neutral)) valence = "neutral";

  const labels = [];
  if (valence === "positive") labels.push("positive_reinforcement", "amplify_momentum", "celebrate_progress");
  if (valence === "neutral") labels.push("practical_next_step", "clarify_goal", "keep_tone_steady");
  if (valence === "negative") labels.push("validate_emotion", "reduce_load", "stabilize_then_improve");

  // allow a small set of explicit emotion tags to pass through (still safe)
  const passthru = ["happy","elated","excited","calm","focused","stressed","anxious","frustrated","angry","sad","overwhelmed"];
  for (const k of passthru) {
    if (tokSet.has(k) && !labels.includes("mood_"+k)) labels.push("mood_"+k);
  }

  return {
    valence,
    labels: uniqBounded(labels, LIMITS.affectLabels, 48),
  };
}

function resolveReinforcement(affect) {
  const a = isObject(affect) ? affect : {};
  const v = safeStr(a.valence || "neutral", 12);
  const pick = (k) => uniqBounded(REINFORCEMENT_PHRASES[k] || [], LIMITS.reinforcementPhrases, 120);

  return {
    valence: v,
    positive: pick("positive"),
    neutral: pick("neutral"),
    negative: pick("negative"),
  };
}




// =========================
// PHASE 1–3: SOCIAL INTENT + STATE HINTS (NO RAW USER TEXT)
// =========================
//
// Phase 1 (Social Intelligence Patch):
//  - SiteBridge does NOT see raw user text. It can only infer "social intent" from SAFE tokens/features.
//  - We emit intent/tone/ui/response cues as hints so ChatEngine can choose a greeting/ack response.
//
// Phase 2 (State Spine Reinforcement):
//  - We echo bounded "state hints" derived from features (turn depth, last intent) to help hosts/debugging.
//
// Phase 3 (Resilience Layer):
//  - We expose bounded retry/timeout hints under diag/audio if upstream provides them via features/opts.

const SOCIAL_LEX = Object.freeze({
  greeting: ["hello","hi","hey","good_morning","goodmorning","good_afternoon","goodafternoon","good_evening","goodevening"],
  howareyou: ["how_are_you","howareyou","how_you_doing","howru","hru","how_is_it_going","howitsgoing"],
  thanks: ["thanks","thank_you","thx","appreciate_it","appreciate"],
  bye: ["bye","goodbye","see_you","cya","talk_later","later","take_care"],
});

function resolveSocialIntent(input) {
  const f = isObject(input?.features) ? input.features : {};
  const tokens = Array.isArray(input?.tokens) ? input.tokens : [];
  const tset = toTokenSet(tokens);

  // Upstream explicit intent wins if set to something concrete (but we still tag social cues).
  const upstreamIntent = safeStr(f.intent || "", 24).toUpperCase();

  const hit = (arr) => arr.some((k) => tset.has(k));
  const isGreeting = hit(SOCIAL_LEX.greeting);
  const isHowAreYou = hit(SOCIAL_LEX.howareyou);
  const isThanks = hit(SOCIAL_LEX.thanks);
  const isBye = hit(SOCIAL_LEX.bye);

  // Intent override only when upstream intent is empty/CLARIFY/default.
  const allowOverride = !upstreamIntent || upstreamIntent === "CLARIFY" || upstreamIntent === "NORMAL";

  let intent = "";
  let kind = "";
  if (allowOverride && (isGreeting || isHowAreYou)) { intent = "GREETING"; kind = isHowAreYou ? "how_are_you" : "greeting"; }
  else if (allowOverride && isThanks) { intent = "THANKS"; kind = "thanks"; }
  else if (allowOverride && isBye) { intent = "GOODBYE"; kind = "goodbye"; }

  return {
    intent,
    kind,
    isGreeting,
    isHowAreYou,
    isThanks,
    isBye,
  };
}

function resolveStateHints(features) {
  const f = isObject(features) ? features : {};
  const turnDepth = clampInt(f.__turnDepth ?? f.turnDepth ?? f.depth ?? 0, 0, 40, 0);
  const lastIntent = safeStr(f.__lastIntent ?? f.lastIntent ?? "", 24).toUpperCase();
  const lastLane = safeStr(f.lastLane ?? f.lane ?? f.activeLane ?? "", 32).toLowerCase();

  const hints = {
    turnDepth,
    lastIntent,
    lastLane,
  };

  // prune empties
  if (!hints.lastIntent) delete hints.lastIntent;
  if (!hints.lastLane) delete hints.lastLane;

  return hints;
}

function resolveResilienceHints(features, opts) {
  const f = isObject(features) ? features : {};
  const o = isObject(opts) ? opts : {};

  const retryCap = clampInt(o.retryCap ?? f.retryCap ?? f.__retryCap ?? 0, 0, 5, 0);
  const timeoutMs = clampInt(o.timeoutMs ?? f.timeoutMs ?? f.__timeoutMs ?? 0, 0, 20000, 0);
  const vendor = safeStr(o.vendor ?? f.vendor ?? f.__vendor ?? "", 24).toLowerCase();
  const vendorHealth = safeStr(o.vendorHealth ?? f.vendorHealth ?? f.__vendorHealth ?? "", 24).toLowerCase();

  const out = {};
  if (retryCap) out.retryCap = retryCap;
  if (timeoutMs) out.timeoutMs = timeoutMs;
  if (vendor) out.vendor = vendor;
  if (vendorHealth) out.vendorHealth = vendorHealth;

  return out;
}
function finalizeContract(out) {
  const o = isObject(out) ? out : {};
  const safe = {
    version: safeStr(o.version || BRIDGE_VERSION, 16),
    queryKey: safeStr(o.queryKey || "", 32),
    sessionKey: safeStr(o.sessionKey || "", 64),

    mode: safeStr(o.mode || DEFAULTS.mode, 12),
    intent: safeStr(o.intent || DEFAULTS.intent, 16).toUpperCase() || DEFAULTS.intent,
    regulation: safeStr(o.regulation || DEFAULTS.regulation, 12),
    cognitiveLoad: safeStr(o.cognitiveLoad || DEFAULTS.cognitiveLoad, 12),
    stance: safeStr(o.stance || DEFAULTS.stance, 32),

    toneCues: uniqBounded(o.toneCues || [], LIMITS.toneCues, 24),
    uiCues: uniqBounded(o.uiCues || [], LIMITS.uiCues, 32),

    guardrails: uniqBounded(o.guardrails || [], LIMITS.guardrails, 80),
    responseCues: uniqBounded(o.responseCues || [], LIMITS.responseCues, 48),

    affect: isObject(o.affect) ? o.affect : resolveAffect({ tokens: [], features: {} }),
    reinforcement: isObject(o.reinforcement)
      ? o.reinforcement
      : resolveReinforcement(isObject(o.affect) ? o.affect : resolveAffect({ tokens: [], features: {} })),

    stateHints: isObject(o.stateHints) ? resolveStateHints(o.stateHints) : undefined,
    resilience: isObject(o.resilience) ? o.resilience : undefined,

    // phases 1–5: objects are bounded by resolvers
    tempo: isObject(o.tempo)
      ? o.tempo
      : resolveTempo(
          { features: {}, mode: safeStr(o.mode || "normal", 12), regulation: safeStr(o.regulation || "steady", 12) },
          {}
        ),
    audio: isObject(o.audio)
      ? o.audio
      : resolveAudio(
          { features: {}, mode: safeStr(o.mode || "normal", 12), regulation: safeStr(o.regulation || "steady", 12) },
          {}
        ),
    intro: isObject(o.intro)
      ? o.intro
      : resolveIntro(
          { features: {}, mode: safeStr(o.mode || "normal", 12), regulation: safeStr(o.regulation || "steady", 12) },
          {}
        ),

    domains: isObject(o.domains) ? o.domains : {},
    confidence: clamp01(o.confidence),
    diag: isObject(o.diag) ? o.diag : {},
  };

  // absolute invariants (avoid accidental side effects)
  if (safe.audio && safe.audio.silent) safe.audio.speakEnabled = false;

  // never allow huge diag blobs
  try {
    if (safe.diag && JSON.stringify(safe.diag).length > LIMITS.diagBytes) {
      safe.diag = { trimmed: true };
    }
  } catch (_e) {
    safe.diag = { trimmed: true };
  }

  return safe;
}

// =========================
// MAIN: BUILD PSYCHE (SYNC, backward compatible)
// =========================

function build(input) {
  try {
    const features0 = isObject(input?.features) ? input.features : {};
    const tokens = safeTokens(input?.tokens || [], 24);
    const queryKey = safeStr(input?.queryKey || "", 32);
    const sessionKey = safeStr(input?.sessionKey || "", 64);
    const opts = isObject(input?.opts) ? input.opts : {};

    // Allow the caller to force psych routing without introducing raw user text.
    const forcePsychBridge = !!(
      opts.forcePsychBridge ||
      features0.forcePsychBridge ||
      features0.forcePsych ||
      features0.psychBridge
    );

    // Never mutate caller-provided features.
    const features = { ...features0 };
    if (forcePsychBridge) {
      if (!features.intent) features.intent = "SUPPORT";
      if (!features.regulationState) features.regulationState = "dysregulated";
      if (!features.cognitiveLoad) features.cognitiveLoad = "high";
      features.__forcePsychBridge = true;
    }

    const enabled = chooseEnabledDomains(features, tokens, opts);
    const commonIn = { features, tokens, queryKey };

    // gather domain raw outputs (fail-open)
    const pendingAsync = {};
    const raw = {
      psychology: enabled.psychology ? callNyxProfile(PsychologyK, commonIn) : null,
      cyber: enabled.cyber ? callNyxProfile(CyberK, commonIn) : null,
      english: enabled.english ? callNyxProfile(EnglishK, commonIn) : null,
      finance: enabled.finance ? callNyxProfile(FinanceK, commonIn) : null,
      law: enabled.law ? callNyxProfile(LawK, commonIn) : null,
      ai: enabled.ai ? callNyxProfile(AIK, commonIn) : null,
    };

    // Detect thenables (async modules) and fail-open them in sync mode.
    for (const k of Object.keys(raw)) {
      if (isThenable(raw[k])) {
        pendingAsync[k] = true;
        raw[k] = null;
      }
    }

    // normalize slices
    const domains = {
      psychology: normalizeDomainSlice("psychology", raw.psychology),
      cyber: normalizeDomainSlice("cyber", raw.cyber),
      english: normalizeDomainSlice("english", raw.english),
      finance: normalizeDomainSlice("finance", raw.finance),
      law: normalizeDomainSlice("law", raw.law),
      ai: normalizeDomainSlice("ai", raw.ai),
    };

    // global resolution (psych precedence)
    const regulation = resolveRegulation(features, domains.psychology, tokens);
    const mode = resolveMode(regulation);

    let intent = safeStr(features.intent || DEFAULTS.intent, 16).toUpperCase();
    const cognitiveLoad = safeStr(features.cognitiveLoad || DEFAULTS.cognitiveLoad, 12).toLowerCase();
    const stance = resolveStance(features, regulation, domains.psychology);

// Phase 1: Social intent inference (SAFE tokens/features only)
const social = resolveSocialIntent({ features, tokens });
if (social.intent) intent = social.intent;

    // global merges (deterministic, precedence)
    const guardrails = mergeByPrecedence(domains, "guardrails", LIMITS.guardrails, 80);
    const responseCuesBase = mergeByPrecedence(domains, "responseCues", LIMITS.responseCues, 48);

    // Reinforcement hooks: safe, deterministic cues for both positive + negative reinforcement.
    const responseCues = Array.isArray(responseCuesBase) ? responseCuesBase.slice() : [];
    if (features.__forcePsychBridge || mode === "stabilize" || mode === "safety") {
      responseCues.unshift("validate_emotion", "ask_feeling_context", "offer_options");
      responseCues.unshift("avoid_shaming", "avoid_minimizing");
    } else {
      responseCues.unshift("reinforce_progress", "gentle_reframe");
    }

    // toneCues + uiCues: derived primarily from regulation + stance
    const toneCues = [];
    const uiCues = [];

    if (features.__forcePsychBridge) {
      uiCues.push("hide_nav_prompts", "compact_reply");
    }

    if (mode === "safety") {
      toneCues.push("calm", "direct", "safety_first");
      uiCues.push("minimize_choices", "show_help_options", "compact_reply");
    } else if (mode === "stabilize") {
      toneCues.push("warm", "grounded", "short_sentences");
      uiCues.push("minimize_choices", "show_grounding_chip", "compact_reply");
    } else {
      toneCues.push("clear", "supportive");
    }

// Phase 1: If social intent detected, bias toward warmth + follow-up hooks (host may render chips)
if (social && social.intent) {
  responseCues.unshift("social_intent", "acknowledge_then_followup");
  if (social.intent === "GREETING") responseCues.unshift("social_greeting");
  if (social.intent === "THANKS") responseCues.unshift("social_thanks");
  if (social.intent === "GOODBYE") responseCues.unshift("social_goodbye");
  toneCues.unshift("warm", "friendly");
  uiCues.unshift("show_social_followup");
}


    if (stance === "confirm+execute") uiCues.push("confirm_then_run");
    if (responseCues.includes("ask_1_clarifier")) uiCues.push("single_clarifier_prompt");
    if (responseCues.includes("keep_short")) uiCues.push("compact_reply");

    const mergedTone = uniqBounded(toneCues, LIMITS.toneCues, 24);
    const mergedUI = uniqBounded(uiCues, LIMITS.uiCues, 32);
    const confidence = computeOverallConfidence(domains);

    // Phase 1–5: compute pure hint envelopes
    const ctx = { features, mode, regulation };

    // diagnostics (safe)
    const diag = {
      enabledDomains: enabled,
      pendingAsyncDomains: Object.keys(pendingAsync).length ? pendingAsync : undefined,
      domainConfidence: {
        psychology: domains.psychology.confidence,
        law: domains.law.confidence,
        cyber: domains.cyber.confidence,
        ai: domains.ai.confidence,
        finance: domains.finance.confidence,
        english: domains.english.confidence,
      },
      regulation,
      mode,
      stance,
      lane: safeStr(features.lane || features.lastLane || "", 24).toLowerCase(),
      audioSilent: !!(opts.silentAudio || opts.silent || features.silentAudio || features.silent),
    };

    const affect = resolveAffect(ctx);
    const reinforcement = resolveReinforcement(affect);
    try{ for(const lab of (affect.labels||[])) responseCues.push(lab); }catch(_){ }

return finalizeContract({
      version: BRIDGE_VERSION,
      queryKey,
      sessionKey,

      mode,
      intent,
      regulation,
      cognitiveLoad,
      stance,

      toneCues: mergedTone,
      uiCues: mergedUI,

      guardrails,
      responseCues: uniqBounded(responseCues, LIMITS.responseCues, 48),
      affect,
      reinforcement,

      tempo: resolveTempo(ctx, opts),
      audio: resolveAudio(ctx, opts),
      intro: resolveIntro(ctx, opts),

      domains,

      confidence,
      diag,
      stateHints: resolveStateHints(features),
      resilience: resolveResilienceHints(features, opts),
    });
  } catch (e) {
    return failOpenPsyche(e, input);
  }
}

// =========================
// MAIN: BUILD PSYCHE (ASYNC, awaits domain modules)
// =========================

async function buildAsync(input) {
  try {
    const features0 = isObject(input?.features) ? input.features : {};
    const tokens = safeTokens(input?.tokens || [], 24);
    const queryKey = safeStr(input?.queryKey || "", 32);
    const sessionKey = safeStr(input?.sessionKey || "", 64);
    const opts = isObject(input?.opts) ? input.opts : {};

    const forcePsychBridge = !!(
      opts.forcePsychBridge ||
      features0.forcePsychBridge ||
      features0.forcePsych ||
      features0.psychBridge
    );

    const features = { ...features0 };
    if (forcePsychBridge) {
      if (!features.intent) features.intent = "SUPPORT";
      if (!features.regulationState) features.regulationState = "dysregulated";
      if (!features.cognitiveLoad) features.cognitiveLoad = "high";
      features.__forcePsychBridge = true;
    }

    const enabled = chooseEnabledDomains(features, tokens, opts);
    const commonIn = { features, tokens, queryKey };

    const raw = {
      psychology: enabled.psychology ? await callNyxProfileAsync(PsychologyK, commonIn) : null,
      cyber: enabled.cyber ? await callNyxProfileAsync(CyberK, commonIn) : null,
      english: enabled.english ? await callNyxProfileAsync(EnglishK, commonIn) : null,
      finance: enabled.finance ? await callNyxProfileAsync(FinanceK, commonIn) : null,
      law: enabled.law ? await callNyxProfileAsync(LawK, commonIn) : null,
      ai: enabled.ai ? await callNyxProfileAsync(AIK, commonIn) : null,
    };

    const domains = {
      psychology: normalizeDomainSlice("psychology", raw.psychology),
      cyber: normalizeDomainSlice("cyber", raw.cyber),
      english: normalizeDomainSlice("english", raw.english),
      finance: normalizeDomainSlice("finance", raw.finance),
      law: normalizeDomainSlice("law", raw.law),
      ai: normalizeDomainSlice("ai", raw.ai),
    };

    const regulation = resolveRegulation(features, domains.psychology, tokens);
    const mode = resolveMode(regulation);

    let intent = safeStr(features.intent || DEFAULTS.intent, 16).toUpperCase();
    const cognitiveLoad = safeStr(features.cognitiveLoad || DEFAULTS.cognitiveLoad, 12).toLowerCase();
    const stance = resolveStance(features, regulation, domains.psychology);

// Phase 1: Social intent inference (SAFE tokens/features only)
const social = resolveSocialIntent({ features, tokens });
if (social.intent) intent = social.intent;

    const guardrails = mergeByPrecedence(domains, "guardrails", LIMITS.guardrails, 80);
    const responseCuesBase = mergeByPrecedence(domains, "responseCues", LIMITS.responseCues, 48);

    const responseCues = Array.isArray(responseCuesBase) ? responseCuesBase.slice() : [];
    if (features.__forcePsychBridge || mode === "stabilize" || mode === "safety") {
      responseCues.unshift("validate_emotion", "ask_feeling_context", "offer_options");
      responseCues.unshift("avoid_shaming", "avoid_minimizing");
    } else {
      responseCues.unshift("reinforce_progress", "gentle_reframe");
    }

    const toneCues = [];
    const uiCues = [];

    if (features.__forcePsychBridge) uiCues.push("hide_nav_prompts", "compact_reply");

    if (mode === "safety") {
      toneCues.push("calm", "direct", "safety_first");
      uiCues.push("minimize_choices", "show_help_options", "compact_reply");
    } else if (mode === "stabilize") {
      toneCues.push("warm", "grounded", "short_sentences");
      uiCues.push("minimize_choices", "show_grounding_chip", "compact_reply");
    } else {
      toneCues.push("clear", "supportive");
    }

// Phase 1: If social intent detected, bias toward warmth + follow-up hooks (host may render chips)
if (social && social.intent) {
  responseCues.unshift("social_intent", "acknowledge_then_followup");
  if (social.intent === "GREETING") responseCues.unshift("social_greeting");
  if (social.intent === "THANKS") responseCues.unshift("social_thanks");
  if (social.intent === "GOODBYE") responseCues.unshift("social_goodbye");
  toneCues.unshift("warm", "friendly");
  uiCues.unshift("show_social_followup");
}


    if (stance === "confirm+execute") uiCues.push("confirm_then_run");
    if (responseCues.includes("ask_1_clarifier")) uiCues.push("single_clarifier_prompt");
    if (responseCues.includes("keep_short")) uiCues.push("compact_reply");

    const confidence = computeOverallConfidence(domains);
    const ctx = { features, mode, regulation };

    const diag = {
      enabledDomains: enabled,
      domainConfidence: {
        psychology: domains.psychology.confidence,
        law: domains.law.confidence,
        cyber: domains.cyber.confidence,
        ai: domains.ai.confidence,
        finance: domains.finance.confidence,
        english: domains.english.confidence,
      },
      regulation,
      mode,
      stance,
      lane: safeStr(features.lane || features.lastLane || "", 24).toLowerCase(),
      audioSilent: !!(opts.silentAudio || opts.silent || features.silentAudio || features.silent),
      async: true,
    };

    const affect = resolveAffect(ctx);
    const reinforcement = resolveReinforcement(affect);
    try{ for(const lab of (affect.labels||[])) responseCues.push(lab); }catch(_){ }

    return finalizeContract({
      version: BRIDGE_VERSION,
      queryKey,
      sessionKey,

      mode,
      intent,
      regulation,
      cognitiveLoad,
      stance,

      toneCues: uniqBounded(toneCues, LIMITS.toneCues, 24),
      uiCues: uniqBounded(uiCues, LIMITS.uiCues, 32),

      guardrails,
      responseCues: uniqBounded(responseCues, LIMITS.responseCues, 48),
      affect,
      reinforcement,

      tempo: resolveTempo(ctx, opts),
      audio: resolveAudio(ctx, opts),
      intro: resolveIntro(ctx, opts),

      domains,

      confidence,
      diag,
      stateHints: resolveStateHints(features),
      resilience: resolveResilienceHints(features, opts),
    });
  } catch (e) {
    return failOpenPsyche(e, input);
  }
}

// For MarionSO convenience: a slimmer wrapper name.
function buildPsyche(input) {
  return build(input);
}

module.exports = {
  build,
  buildAsync,
  buildPsyche,

  // optional exports for testing
  _internal: {
    normalizeDomainSlice,
    resolveRegulation,
    resolveStance,
    mergeByPrecedence,
    chooseEnabledDomains,
    resolveTempo,
    resolveAudio,
    resolveIntro,
    finalizeContract,
  },
};
