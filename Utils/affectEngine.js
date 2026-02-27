/**
 * affectEngine.js
 * ---------------------------------------------------------
 * Emotional Depth Layer for Nyx/Marion voice output.
 *
 * Goals:
 * - Infer a lightweight affect state from user + assistant draft text
 * - Select a prosody / TTS profile (vendor-agnostic; ElevenLabs-friendly)
 * - Rewrite assistant draft into "spokenText" with subtle punctuation beats
 *
 * Drop-in usage:
 *   const { runAffectEngine } = require("./affectEngine");
 *   const out = runAffectEngine({
 *     userText,
 *     assistantDraft,
 *     lane: "JustTalk",
 *     memory: session.affectMemory,   // optional persistent object
 *     opts: { vendor: "elevenlabs" }  // optional
 *   });
 *   session.affectMemory = out.memory;
 *   // Use out.spokenText for TTS
 *   // Optionally pass out.ttsProfile to your TTS layer
 *
 * Notes:
 * - This file intentionally avoids external deps.
 * - You can expand rules over time; start with consistency.
 * ---------------------------------------------------------
 */

"use strict";

/** ---------------------------
 *  Defaults / Configuration
 *  ---------------------------
 */

const DEFAULTS = {
  vendor: "generic", // "elevenlabs" | "generic"
  // warmth progression: starts lower and ramps with successful turns
  warmthStart: 0.35,
  warmthMax: 0.85,
  warmthStepGoodTurn: 0.03,
  warmthStepBadTurn: -0.06,

  // guard: keep prosody cues subtle; avoid melodrama
  maxSentenceLenForSplit: 150,

  // lane tone biases (small nudges)
  laneBias: {
    JustTalk: { warmth: +0.10, dominance: -0.05, arousal: -0.05 },
    Roku: { warmth: +0.02, dominance: +0.10, arousal: +0.05 },
    News: { warmth: -0.02, dominance: +0.05, arousal: +0.00 },
    Music: { warmth: +0.06, dominance: -0.02, arousal: +0.08 },
    Default: { warmth: +0.00, dominance: +0.00, arousal: +0.00 }
  },

  // keywords for quick inference (starter set; expand later)
  lexicon: {
    frustration: [
      "not happy", "annoy", "frustrat", "piss", "damn", "this sucks",
      "broken", "doesn't work", "isn't working", "fed up", "hate"
    ],
    overwhelm: [
      "overwhelmed", "too much", "can't do this", "i can't", "stressed",
      "anxious", "panic", "burnt out", "burned out"
    ],
    sadness: [
      "sad", "down", "depressed", "lonely", "hurt", "grief", "cry"
    ],
    excitement: [
      "love", "excited", "let's go", "amazing", "perfect", "awesome",
      "this is great", "hype"
    ],
    confusion: [
      "confused", "i don't get", "what do you mean", "unclear", "huh",
      "not sure", "explain", "lost"
    ],
    gratitude: [
      "thank", "appreciate", "grateful", "you're the best", "thanks"
    ],
    urgency: [
      "asap", "urgent", "right now", "immediately", "today", "deadline"
    ],
    safety: [
      "kill myself", "suicide", "self harm", "hurt myself", "overdose"
    ]
  }
};

// Prosody / style map (vendor-agnostic; values are normalized 0..1)
const STYLE_PROFILES = {
  calm_support: {
    styleName: "Calm Support",
    pacing: "slow",
    pauseDensity: "high",
    pitch: "slightly_lower",
    energy: "soft_steady",
    tts: { stability: 0.78, similarity: 0.86, style: 0.22, speakerBoost: true }
  },
  warm_joy: {
    styleName: "Warm Joy",
    pacing: "medium",
    pauseDensity: "low",
    pitch: "slightly_higher",
    energy: "bright",
    tts: { stability: 0.58, similarity: 0.86, style: 0.48, speakerBoost: true }
  },
  compassionate_concern: {
    styleName: "Compassionate Concern",
    pacing: "slow",
    pauseDensity: "high",
    pitch: "lower",
    energy: "gentle",
    tts: { stability: 0.82, similarity: 0.88, style: 0.16, speakerBoost: true }
  },
  confident_coach: {
    styleName: "Confident Coach",
    pacing: "medium_fast",
    pauseDensity: "medium",
    pitch: "neutral",
    energy: "firm",
    tts: { stability: 0.68, similarity: 0.90, style: 0.34, speakerBoost: true }
  },
  focused_analytical: {
    styleName: "Focused Analytical",
    pacing: "medium",
    pauseDensity: "low",
    pitch: "neutral",
    energy: "controlled",
    tts: { stability: 0.86, similarity: 0.92, style: 0.10, speakerBoost: false }
  },
  playful_tease: {
    styleName: "Playful Tease",
    pacing: "medium_fast",
    pauseDensity: "low",
    pitch: "higher",
    energy: "lively",
    tts: { stability: 0.55, similarity: 0.84, style: 0.55, speakerBoost: true }
  },
  boundary_safety: {
    styleName: "Boundary / Safety",
    pacing: "slow",
    pauseDensity: "high",
    pitch: "lower",
    energy: "firm_calm",
    tts: { stability: 0.90, similarity: 0.92, style: 0.08, speakerBoost: true }
  }
};

/** ---------------------------
 *  Public API
 *  ---------------------------
 */

module.exports = {
  runAffectEngine,
  inferAffectState,
  selectStyleProfile,
  applyProsodyMarkup
};

/**
 * Main entry point.
 * @param {Object} input
 * @param {string} input.userText
 * @param {string} input.assistantDraft
 * @param {string=} input.lane
 * @param {Object=} input.memory - persistent per-session object (optional)
 * @param {Object=} input.opts - overrides
 * @returns {Object} { affectState, styleKey, styleProfile, ttsProfile, spokenText, memory, debug }
 */
function runAffectEngine(input = {}) {
  const userText = safeStr(input.userText);
  const assistantDraft = safeStr(input.assistantDraft);
  const lane = safeStr(input.lane) || "Default";
  const memory = (input.memory && typeof input.memory === "object") ? input.memory : {};
  const opts = mergeDeep({}, DEFAULTS, input.opts || {});

  // Infer state
  const affect = inferAffectState({ userText, assistantDraft, lane, memory, opts });

  // Choose style profile
  const { styleKey, styleProfile } = selectStyleProfile({ affectState: affect, lane, opts });

  // Vendor-specific tts profile normalization
  const ttsProfile = normalizeTtsProfile(styleProfile.tts, opts.vendor);

  // Rewrite for speech (subtle punctuation beats)
  const spokenText = applyProsodyMarkup({
    text: assistantDraft,
    affectState: affect,
    styleKey,
    lane,
    opts
  });

  // Update memory (warmth progression / stability feedback)
  const updatedMemory = updateAffectMemory({ memory, affectState: affect, lane, opts });

  return {
    affectState: affect,
    styleKey,
    styleProfile,
    ttsProfile,
    spokenText,
    memory: updatedMemory,
    debug: affect.debug || {}
  };
}

/** ---------------------------
 *  Affect Inference
 *  ---------------------------
 */

/**
 * Compute an affect state from text + lane + memory.
 * @returns {Object} NyxAffectState + debug info
 */
function inferAffectState({ userText, assistantDraft, lane, memory, opts }) {
  // baseline from memory
  const prev = memory.prevAffectState || null;

  let state = {
    valence: prev ? clamp(prev.valence, -1, 1) : 0.10,
    arousal: prev ? clamp(prev.arousal, 0, 1) : 0.35,
    dominance: prev ? clamp(prev.dominance, 0, 1) : 0.55,
    warmth: prev ? clamp(prev.warmth, 0, 1) : opts.warmthStart,
    confidence: prev ? clamp(prev.confidence, 0, 1) : 0.70,
    intent: "assist", // soothe | coach | clarify | challenge | celebrate | ground | assist
    risk_flag: "none", // none | self_harm | mental_health | medical | legal | harassment
    style: "neutral"  // therapist_adjacent | buddy | executive | playful | neutral
  };

  const debug = {
    lane,
    hits: {}
  };

  const u = normalize(userText);

  // Safety check (high priority)
  if (hasAny(u, opts.lexicon.safety)) {
    state.risk_flag = "self_harm";
    state.intent = "ground";
    state.valence = 0.0;
    state.arousal = 0.2;
    state.dominance = 0.7;
    state.warmth = clamp(state.warmth + 0.10, 0, 1);
    state.style = "therapist_adjacent";
    debug.hits.safety = true;
    state.debug = debug;
    return state;
  }

  // Emotions / signals
  const fr = scoreHits(u, opts.lexicon.frustration);
  const ow = scoreHits(u, opts.lexicon.overwhelm);
  const sd = scoreHits(u, opts.lexicon.sadness);
  const ex = scoreHits(u, opts.lexicon.excitement);
  const cf = scoreHits(u, opts.lexicon.confusion);
  const gr = scoreHits(u, opts.lexicon.gratitude);
  const ur = scoreHits(u, opts.lexicon.urgency);

  debug.hits = { frustration: fr, overwhelm: ow, sadness: sd, excitement: ex, confusion: cf, gratitude: gr, urgency: ur };

  // Determine dominant signal
  const signals = [
    { k: "overwhelm", v: ow },
    { k: "frustration", v: fr },
    { k: "sadness", v: sd },
    { k: "confusion", v: cf },
    { k: "excitement", v: ex },
    { k: "gratitude", v: gr },
    { k: "urgency", v: ur }
  ].sort((a, b) => b.v - a.v);

  const top = signals[0];

  // Intensity band (0 low, 1 med, 2 high)
  const intensity = computeIntensity({ topKey: top.k, topVal: top.v, userText: u });
  debug.intensity = intensity;

  // Apply lane bias (tiny nudges)
  const bias = opts.laneBias[lane] || opts.laneBias.Default;
  state.warmth = clamp(state.warmth + (bias.warmth || 0), 0, 1);
  state.dominance = clamp(state.dominance + (bias.dominance || 0), 0, 1);
  state.arousal = clamp(state.arousal + (bias.arousal || 0), 0, 1);

  // Map top signal -> affect adjustments + intent/style selection
  // Keep it restrained. Depth comes from consistency, not big swings.
  if (top.v > 0) {
    switch (top.k) {
      case "frustration":
        state.valence = clamp(state.valence - (intensity === 2 ? 0.35 : 0.20), -1, 1);
        state.arousal = clamp(state.arousal + (intensity === 2 ? 0.15 : 0.08), 0, 1);
        state.intent = "clarify";
        state.style = "executive";
        state.dominance = clamp(state.dominance + 0.10, 0, 1);
        break;

      case "overwhelm":
        state.valence = clamp(state.valence - (intensity === 2 ? 0.25 : 0.12), -1, 1);
        state.arousal = clamp(state.arousal - 0.10, 0, 1);
        state.intent = "soothe";
        state.style = "therapist_adjacent";
        state.dominance = clamp(state.dominance + 0.05, 0, 1);
        state.warmth = clamp(state.warmth + 0.10, 0, 1);
        break;

      case "sadness":
        state.valence = clamp(state.valence - 0.22, -1, 1);
        state.arousal = clamp(state.arousal - 0.12, 0, 1);
        state.intent = "soothe";
        state.style = "therapist_adjacent";
        state.warmth = clamp(state.warmth + 0.12, 0, 1);
        break;

      case "confusion":
        state.valence = clamp(state.valence - 0.08, -1, 1);
        state.arousal = clamp(state.arousal - 0.05, 0, 1);
        state.intent = "clarify";
        state.style = "neutral";
        state.dominance = clamp(state.dominance + 0.08, 0, 1);
        break;

      case "excitement":
        state.valence = clamp(state.valence + (intensity === 2 ? 0.45 : 0.28), -1, 1);
        state.arousal = clamp(state.arousal + (intensity === 2 ? 0.22 : 0.12), 0, 1);
        state.intent = "celebrate";
        state.style = "playful";
        state.warmth = clamp(state.warmth + 0.08, 0, 1);
        break;

      case "gratitude":
        state.valence = clamp(state.valence + 0.18, -1, 1);
        state.arousal = clamp(state.arousal - 0.02, 0, 1);
        state.intent = "assist";
        state.style = "buddy";
        state.warmth = clamp(state.warmth + 0.08, 0, 1);
        break;

      case "urgency":
        state.valence = clamp(state.valence + 0.02, -1, 1);
        state.arousal = clamp(state.arousal + 0.18, 0, 1);
        state.intent = "coach";
        state.style = "executive";
        state.dominance = clamp(state.dominance + 0.12, 0, 1);
        break;

      default:
        state.intent = "assist";
        state.style = "neutral";
        break;
    }
  } else {
    // no strong signal: default to helpful + calm
    state.intent = "assist";
    state.style = "neutral";
  }

  // Confidence heuristics
  state.confidence = clamp(state.confidence + confidenceDeltaFromText(userText), 0, 1);

  // Clamp always
  state.valence = clamp(state.valence, -1, 1);
  state.arousal = clamp(state.arousal, 0, 1);
  state.dominance = clamp(state.dominance, 0, 1);
  state.warmth = clamp(state.warmth, 0, 1);
  state.confidence = clamp(state.confidence, 0, 1);

  state.debug = debug;
  return state;
}

/** ---------------------------
 *  Style Selection
 *  ---------------------------
 */

function selectStyleProfile({ affectState, lane, opts }) {
  // Risk flag overrides
  if (affectState.risk_flag === "self_harm") {
    return { styleKey: "boundary_safety", styleProfile: STYLE_PROFILES.boundary_safety };
  }

  // Intent-driven mapping first (keeps it coherent)
  switch (affectState.intent) {
    case "soothe":
      // if valence is negative -> compassionate concern, else calm support
      if (affectState.valence < 0) {
        return { styleKey: "compassionate_concern", styleProfile: STYLE_PROFILES.compassionate_concern };
      }
      return { styleKey: "calm_support", styleProfile: STYLE_PROFILES.calm_support };

    case "celebrate":
      return { styleKey: "warm_joy", styleProfile: STYLE_PROFILES.warm_joy };

    case "coach":
      return { styleKey: "confident_coach", styleProfile: STYLE_PROFILES.confident_coach };

    case "clarify":
      // confusion -> focused analytical; frustration -> confident coach
      if (affectState.valence < -0.15) {
        return { styleKey: "confident_coach", styleProfile: STYLE_PROFILES.confident_coach };
      }
      return { styleKey: "focused_analytical", styleProfile: STYLE_PROFILES.focused_analytical };

    case "ground":
      return { styleKey: "calm_support", styleProfile: STYLE_PROFILES.calm_support };

    case "challenge":
      return { styleKey: "confident_coach", styleProfile: STYLE_PROFILES.confident_coach };

    case "assist":
    default:
      // lane nuance: Music gets a touch more warmth/energy; News more analytical
      if (lane === "News") return { styleKey: "focused_analytical", styleProfile: STYLE_PROFILES.focused_analytical };
      if (lane === "Music") return { styleKey: "warm_joy", styleProfile: STYLE_PROFILES.warm_joy };
      return { styleKey: "focused_analytical", styleProfile: STYLE_PROFILES.focused_analytical };
  }
}

/**
 * Normalize vendor profile so your TTS layer can consume it consistently.
 * For ElevenLabs, the keys align to common parameters.
 */
function normalizeTtsProfile(tts, vendor) {
  const base = {
    stability: clamp(num(tts.stability, 0.75), 0, 1),
    similarity: clamp(num(tts.similarity, 0.85), 0, 1),
    style: clamp(num(tts.style, 0.25), 0, 1),
    speakerBoost: !!tts.speakerBoost
  };

  if ((vendor || "").toLowerCase() === "elevenlabs") {
    // Keep same shape; your tts.js can map to API params directly
    return base;
  }

  // Generic vendor-agnostic (still usable)
  return base;
}

/** ---------------------------
 *  Prosody Markup (Text Rewriting)
 *  ---------------------------
 */

function applyProsodyMarkup({ text, affectState, styleKey, lane, opts }) {
  let t = safeStr(text).trim();
  if (!t) return t;

  // Keep original content; just shape it for speech.
  // 1) Add a gentle human opener sometimes (very sparingly).
  t = maybeAddSoftOpener(t, affectState, styleKey);

  // 2) Split overly long sentences (helps TTS pacing)
  t = splitLongSentences(t, opts.maxSentenceLenForSplit);

  // 3) Add micro-pauses for soothing / concern / safety
  if (styleKey === "calm_support" || styleKey === "compassionate_concern" || styleKey === "boundary_safety") {
    t = addMicroPauses(t);
  }

  // 4) For coach mode: add pivot em-dash and crisp structure
  if (styleKey === "confident_coach") {
    t = coachifyStructure(t);
  }

  // 5) For analytical: remove fluff, tighten redundant phrases
  if (styleKey === "focused_analytical") {
    t = tightenForClarity(t);
  }

  // 6) For warm joy/playful: brighten slightly, but keep professional
  if (styleKey === "warm_joy" || styleKey === "playful_tease") {
    t = brightenLightly(t);
  }

  // 7) Safety/Boundary: enforce calm/firm template if risk flagged
  if (affectState.risk_flag === "self_harm") {
    // This is a placeholder; your main safety policy logic should live upstream.
    // We keep it minimal here to avoid surprising behavior.
    t = enforceBoundaryTone(t);
  }

  return t.trim();
}

/** ---------------------------
 *  Memory Update
 *  ---------------------------
 */

function updateAffectMemory({ memory, affectState, lane, opts }) {
  const m = mergeDeep({}, memory);

  // Initialize if missing
  if (typeof m.warmth !== "number") m.warmth = opts.warmthStart;

  // Warmth progression: assume "good turn" if no negative signals are strong
  const neg = (affectState.valence < -0.15);
  const strongArousal = (affectState.arousal > 0.75);
  const badTurn = neg && strongArousal; // rough heuristic: agitated negative

  if (badTurn) m.warmth = clamp(m.warmth + opts.warmthStepBadTurn, 0, 1);
  else m.warmth = clamp(m.warmth + opts.warmthStepGoodTurn, 0, 1);

  // Tie back to state
  affectState.warmth = clamp(affectState.warmth + (m.warmth - opts.warmthStart) * 0.35, 0, 1);

  m.prevAffectState = {
    valence: affectState.valence,
    arousal: affectState.arousal,
    dominance: affectState.dominance,
    warmth: affectState.warmth,
    confidence: affectState.confidence,
    intent: affectState.intent,
    risk_flag: affectState.risk_flag,
    style: affectState.style
  };

  m.lastLane = lane;
  m.updatedAt = Date.now();
  return m;
}

/** ---------------------------
 *  Helpers
 *  ---------------------------
 */

function maybeAddSoftOpener(text, affectState, styleKey) {
  // Add at most occasionally: only when negative/tense AND soothing/coach
  const should =
    (affectState.valence < -0.10 || affectState.intent === "soothe") &&
    (styleKey === "calm_support" || styleKey === "compassionate_concern" || styleKey === "confident_coach");

  if (!should) return text;

  // Avoid doubling if already starts with a filler
  const starts = normalize(text).slice(0, 12);
  if (starts.startsWith("mm") || starts.startsWith("okay") || starts.startsWith("alright")) return text;

  // Subtle, not cute.
  return "Mm. " + text;
}

function splitLongSentences(text, maxLen) {
  const parts = text.split(/(\. |\? |\! )/); // keep delimiters
  let out = "";
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = (parts[i] || "").trim();
    const delim = parts[i + 1] || "";
    if (!sentence) continue;

    if (sentence.length > maxLen) {
      // split by commas / semicolons first
      const chunks = sentence.split(/[,;:]\s+/);
      if (chunks.length > 1) {
        out += chunks.map(c => c.trim()).filter(Boolean).join(".\n") + (delim.trim() ? delim.trim() + " " : ".\n");
      } else {
        out += sentence + (delim || ". ") ;
      }
    } else {
      out += sentence + (delim || ". ");
    }
  }
  return out.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function addMicroPauses(text) {
  // Add micro pauses after short lead-ins and before pivots
  let t = text;

  // encourage short grounding lines
  t = t.replace(/\bI hear you\b/gi, "I hear you.");
  t = t.replace(/\bThat makes sense\b/gi, "That makes sense.");
  t = t.replace(/\bWe can\b/gi, "We can…");

  // soft pivot
  t = t.replace(/\bBut\b/g, "But…");
  t = t.replace(/\bSo\b/g, "So…");

  // avoid excessive ellipses
  t = t.replace(/\.{4,}/g, "…").replace(/…{2,}/g, "…");
  return t;
}

function coachifyStructure(text) {
  let t = text;

  // Add a pivot dash for "here's the move"
  t = t.replace(/\bHere(?:’|'|)s what we do\b/gi, "Here’s the move—");
  t = t.replace(/\bHere(?:’|'|)s the plan\b/gi, "Here’s the plan—");

  // Prefer crisp step framing
  t = t.replace(/\bFirst,\s*/gi, "First—");
  t = t.replace(/\bSecond,\s*/gi, "Second—");
  t = t.replace(/\bThird,\s*/gi, "Third—");

  return t;
}

function tightenForClarity(text) {
  let t = text;

  // Remove some hedges (but not all)
  t = t.replace(/\bkind of\b/gi, "");
  t = t.replace(/\bsort of\b/gi, "");
  t = t.replace(/\bmaybe\b/gi, ""); // careful: can be too aggressive later

  // Normalize whitespace
  t = t.replace(/\s{2,}/g, " ").trim();

  // Make rhetorical fluff less frequent
  t = t.replace(/\bto be honest\b/gi, "");
  t = t.replace(/\bI think\b/gi, "");

  return t.trim();
}

function brightenLightly(text) {
  let t = text;

  // gentle uplift, not hype
  t = t.replace(/\bGreat\b/gi, "Good");
  t = t.replace(/\bAwesome\b/gi, "Solid");
  t = t.replace(/\bPerfect\b/gi, "Exactly");

  // soften command tone
  t = t.replace(/\bDo this\b/gi, "Let’s do this");

  return t.trim();
}

function enforceBoundaryTone(text) {
  // Keep it calm. Avoid emotional escalation.
  let t = text;
  t = t.replace(/!+/g, ".");
  t = t.replace(/\bplease\b/gi, ""); // reduce pleading
  return t.trim();
}

function confidenceDeltaFromText(userText) {
  // crude: many question marks lowers confidence; imperative raises it slightly
  const q = (userText.match(/\?/g) || []).length;
  const imp = /\b(do|fix|build|ship|need|must)\b/i.test(userText);
  let delta = 0;
  if (q >= 2) delta -= 0.06;
  if (imp) delta += 0.04;
  return delta;
}

function computeIntensity({ topKey, topVal, userText }) {
  // If no keyword hit, low.
  if (!topVal || topVal <= 0) return 0;

  // High intensity cues
  const caps = /[A-Z]{4,}/.test(userText);
  const manyBang = (userText.match(/!/g) || []).length >= 2;
  const strong = /\b(very|extremely|so\s+much|right\s+now|can’t|can't)\b/i.test(userText);

  let score = 0;
  score += Math.min(2, topVal); // topVal ~ 1+ means multiple hits
  if (caps) score += 1;
  if (manyBang) score += 1;
  if (strong) score += 1;

  if (score >= 3) return 2;
  if (score >= 2) return 1;
  return 0;
}

function scoreHits(normalizedText, patterns) {
  if (!patterns || !patterns.length) return 0;
  let hits = 0;
  for (const p of patterns) {
    if (!p) continue;
    if (normalizedText.includes(p)) hits++;
  }
  return hits;
}

function hasAny(normalizedText, patterns) {
  for (const p of patterns || []) {
    if (p && normalizedText.includes(p)) return true;
  }
  return false;
}

function normalize(s) {
  return safeStr(s).toLowerCase().replace(/\s+/g, " ").trim();
}

function safeStr(x) {
  if (typeof x === "string") return x;
  if (x === null || x === undefined) return "";
  try { return String(x); } catch { return ""; }
}

function num(x, fallback) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function mergeDeep(target, ...sources) {
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if (!target[k] || typeof target[k] !== "object") target[k] = {};
        mergeDeep(target[k], v);
      } else {
        target[k] = v;
      }
    }
  }
  return target;
}
