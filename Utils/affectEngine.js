/**
 * affectEngine.js
 * ---------------------------------------------------------
 * Emotional Depth Layer for Nyx/Marion voice output.
 *
 * Critical updates (Depth-first; ElevenLabs-ready):
 *  1) Lane-aware intent defaults + stronger lane bias (contextual posture)
 *  2) RVG micro-ritual (Reflect → Validate → Guide) when intensity rises
 *  3) Intensity persisted on state (low/med/high) for deterministic shaping
 *  4) ElevenLabs voice_settings mapping + presetKey for consistent delivery
 *  5) Safer, slightly richer lexicon + regex-based scoring (still lightweight)
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
 *   // Optionally pass out.elevenLabsVoiceSettings to your TTS layer
 *
 * Notes:
 * - No external deps.
 * - Fail-open friendly: if this module errors, upstream should keep running.
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

  // RVG shaping (Reflect → Validate → Guide)
  enableRVG: true,
  rvgMaxLines: 3,          // hard cap; keeps it tight
  rvgOnlyWhen: "medium",   // "medium" | "high" | "any"
  rvgMinValence: -0.12,    // negative valence triggers RVG even if intensity is low

  // lane defaults (intent + mild style posture)
  laneDefaults: {
    JustTalk: { intent: "assist", style: "buddy" },
    Roku:     { intent: "coach",  style: "executive" },
    News:     { intent: "clarify",style: "neutral" },
    Music:    { intent: "celebrate", style: "playful" },
    Default:  { intent: "assist", style: "neutral" }
  },

  // lane tone biases (nudges; still subtle)
  // warmth ↑ feels more intimate; dominance ↑ feels more leading; arousal ↑ feels more energetic
  laneBias: {
    JustTalk: { warmth: +0.14, dominance: -0.06, arousal: -0.06 },
    Roku:     { warmth: +0.04, dominance: +0.14, arousal: +0.08 },
    News:     { warmth: -0.04, dominance: +0.10, arousal: +0.00 },
    Music:    { warmth: +0.10, dominance: -0.02, arousal: +0.14 },
    Default:  { warmth: +0.00, dominance: +0.00, arousal: +0.00 }
  },

  // ElevenLabs preset behavior (keeps Nyx stable across turns)
  // Your tts.js can use presetKey to apply base voice_settings, then override with ttsProfile if desired.
  presets: {
    NYX_CALM:  { stability: 0.82, similarity: 0.88, style: 0.18, speakerBoost: true },
    NYX_COACH: { stability: 0.70, similarity: 0.90, style: 0.30, speakerBoost: true },
    NYX_WARM:  { stability: 0.62, similarity: 0.86, style: 0.48, speakerBoost: true },
    NYX_ANALYTIC: { stability: 0.88, similarity: 0.92, style: 0.10, speakerBoost: false },
    NYX_BOUNDARY: { stability: 0.92, similarity: 0.92, style: 0.06, speakerBoost: true }
  },

  // keywords / regex for quick inference (starter set; expand later)
  // NOTE: we use small regex patterns instead of naive includes so stems work.
  lexicon: {
    frustration: [
      /not\s+happy/i, /\bannoy(ed|ing)?\b/i, /\bfrustrat(ed|ing|ion)?\b/i,
      /\b(piss(ed)?|damn)\b/i, /\bthis\s+sucks\b/i, /\bbroken\b/i,
      /doesn'?t\s+work/i, /isn'?t\s+working/i, /\bfed\s+up\b/i, /\bhate\b/i
    ],
    overwhelm: [
      /\boverwhelm(ed|ing)?\b/i, /\btoo\s+much\b/i, /can'?t\s+do\s+this/i,
      /\bi\s+can'?t\b/i, /\bstress(ed|ful)?\b/i, /\banxious\b/i, /\bpanic\b/i,
      /\bburnt?\s+out\b/i
    ],
    sadness: [
      /\bsad\b/i, /\bdown\b/i, /\bdepress(ed|ion)?\b/i, /\blonely\b/i,
      /\bhurt\b/i, /\bgrief\b/i, /\bcry(ing)?\b/i
    ],
    excitement: [
      /\blove\b/i, /\bexcited\b/i, /\blet'?s\s+go\b/i, /\bamazing\b/i,
      /\bperfect\b/i, /\bawesome\b/i, /\bthis\s+is\s+great\b/i, /\bhype\b/i
    ],
    confusion: [
      /\bconfused\b/i, /i\s+don'?t\s+get/i, /what\s+do\s+you\s+mean/i,
      /\bunclear\b/i, /\bhuh\b/i, /\bnot\s+sure\b/i, /\bexplain\b/i, /\blost\b/i
    ],
    gratitude: [
      /\bthank(s|you)?\b/i, /\bappreciate\b/i, /\bgrateful\b/i, /you'?re\s+the\s+best/i
    ],
    urgency: [
      /\basap\b/i, /\burgent\b/i, /\bright\s+now\b/i, /\bimmediately\b/i,
      /\btoday\b/i, /\bdeadline\b/i
    ],
    safety: [
      /kill\s+myself/i, /\bsuicide\b/i, /self\s*harm/i, /hurt\s+myself/i, /\boverdose\b/i
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
  applyProsodyMarkup,

  // optional helpers (for tts.js convenience)
  toElevenLabsVoiceSettings,
  choosePresetKey
};

/**
 * Main entry point.
 * @param {Object} input
 * @param {string} input.userText
 * @param {string} input.assistantDraft
 * @param {string=} input.lane
 * @param {Object=} input.memory - persistent per-session object (optional)
 * @param {Object=} input.opts - overrides
 * @returns {Object} { affectState, styleKey, styleProfile, ttsProfile, elevenLabsVoiceSettings, presetKey, spokenText, memory, debug }
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

  // Preset selection (keeps Nyx coherent turn-to-turn)
  const presetKey = choosePresetKey({ styleKey, lane, affectState: affect, opts });

  // Vendor-specific tts profile normalization
  const ttsProfile = normalizeTtsProfile(styleProfile.tts, opts.vendor);

  // ElevenLabs payload mapping (voice_settings)
  const elevenLabsVoiceSettings =
    (safeStr(opts.vendor).toLowerCase() === "elevenlabs")
      ? toElevenLabsVoiceSettings({ presetKey, ttsProfile, opts })
      : null;

  // Rewrite for speech (subtle punctuation beats + RVG micro-ritual)
  const spokenText = applyProsodyMarkup({
    text: assistantDraft,
    userText,
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
    elevenLabsVoiceSettings,
    presetKey,
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

  // lane defaults (intent/style)
  const laneDef = opts.laneDefaults[lane] || opts.laneDefaults.Default;

  let state = {
    valence: prev ? clamp(prev.valence, -1, 1) : 0.10,
    arousal: prev ? clamp(prev.arousal, 0, 1) : 0.35,
    dominance: prev ? clamp(prev.dominance, 0, 1) : 0.55,
    warmth: prev ? clamp(prev.warmth, 0, 1) : opts.warmthStart,
    confidence: prev ? clamp(prev.confidence, 0, 1) : 0.70,

    // defaults (may be overridden by emotion signal)
    intent: safeStr(laneDef.intent || "assist"), // soothe | coach | clarify | challenge | celebrate | ground | assist
    risk_flag: "none", // none | self_harm | mental_health | medical | legal | harassment
    style: safeStr(laneDef.style || "neutral"),  // therapist_adjacent | buddy | executive | playful | neutral

    // explicit intensity band for deterministic shaping:
    // 0 low, 1 medium, 2 high
    intensityBand: 0
  };

  const debug = { lane, hits: {} };
  const u = safeStr(userText).trim();

  // Safety check (high priority)
  if (regexAny(u, opts.lexicon.safety)) {
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

  // Emotions / signals (regex scoring)
  const fr = scoreRegexHits(u, opts.lexicon.frustration);
  const ow = scoreRegexHits(u, opts.lexicon.overwhelm);
  const sd = scoreRegexHits(u, opts.lexicon.sadness);
  const ex = scoreRegexHits(u, opts.lexicon.excitement);
  const cf = scoreRegexHits(u, opts.lexicon.confusion);
  const gr = scoreRegexHits(u, opts.lexicon.gratitude);
  const ur = scoreRegexHits(u, opts.lexicon.urgency);

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
  state.intensityBand = intensity;
  debug.intensity = intensity;

  // Apply lane bias (nudges)
  const bias = opts.laneBias[lane] || opts.laneBias.Default;
  state.warmth = clamp(state.warmth + (bias.warmth || 0), 0, 1);
  state.dominance = clamp(state.dominance + (bias.dominance || 0), 0, 1);
  state.arousal = clamp(state.arousal + (bias.arousal || 0), 0, 1);

  // Map top signal -> affect adjustments + intent/style selection
  // Keep it restrained. Depth comes from consistency + micro-behaviors.
  if (top.v > 0) {
    switch (top.k) {
      case "frustration":
        state.valence = clamp(state.valence - (intensity === 2 ? 0.38 : 0.22), -1, 1);
        state.arousal = clamp(state.arousal + (intensity === 2 ? 0.18 : 0.10), 0, 1);
        state.intent = "clarify";
        state.style = "executive";
        state.dominance = clamp(state.dominance + 0.12, 0, 1);
        break;

      case "overwhelm":
        state.valence = clamp(state.valence - (intensity === 2 ? 0.28 : 0.14), -1, 1);
        state.arousal = clamp(state.arousal - 0.12, 0, 1);
        state.intent = "soothe";
        state.style = "therapist_adjacent";
        state.dominance = clamp(state.dominance + 0.06, 0, 1);
        state.warmth = clamp(state.warmth + 0.12, 0, 1);
        break;

      case "sadness":
        state.valence = clamp(state.valence - 0.24, -1, 1);
        state.arousal = clamp(state.arousal - 0.14, 0, 1);
        state.intent = "soothe";
        state.style = "therapist_adjacent";
        state.warmth = clamp(state.warmth + 0.14, 0, 1);
        break;

      case "confusion":
        state.valence = clamp(state.valence - 0.08, -1, 1);
        state.arousal = clamp(state.arousal - 0.06, 0, 1);
        state.intent = "clarify";
        state.style = "neutral";
        state.dominance = clamp(state.dominance + 0.10, 0, 1);
        break;

      case "excitement":
        state.valence = clamp(state.valence + (intensity === 2 ? 0.48 : 0.30), -1, 1);
        state.arousal = clamp(state.arousal + (intensity === 2 ? 0.24 : 0.14), 0, 1);
        state.intent = "celebrate";
        state.style = "playful";
        state.warmth = clamp(state.warmth + 0.10, 0, 1);
        break;

      case "gratitude":
        state.valence = clamp(state.valence + 0.18, -1, 1);
        state.arousal = clamp(state.arousal - 0.02, 0, 1);
        state.intent = "assist";
        state.style = "buddy";
        state.warmth = clamp(state.warmth + 0.10, 0, 1);
        break;

      case "urgency":
        state.valence = clamp(state.valence + 0.02, -1, 1);
        state.arousal = clamp(state.arousal + 0.20, 0, 1);
        state.intent = "coach";
        state.style = "executive";
        state.dominance = clamp(state.dominance + 0.14, 0, 1);
        break;

      default:
        // keep lane defaults
        break;
    }
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
      if (affectState.valence < 0) {
        return { styleKey: "compassionate_concern", styleProfile: STYLE_PROFILES.compassionate_concern };
      }
      return { styleKey: "calm_support", styleProfile: STYLE_PROFILES.calm_support };

    case "celebrate":
      return { styleKey: "warm_joy", styleProfile: STYLE_PROFILES.warm_joy };

    case "coach":
      return { styleKey: "confident_coach", styleProfile: STYLE_PROFILES.confident_coach };

    case "clarify":
      // frustration uses coach; otherwise analytical
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
      // lane nuance: News more analytical, Music more warm, JustTalk calm support when negative
      if (lane === "News") return { styleKey: "focused_analytical", styleProfile: STYLE_PROFILES.focused_analytical };
      if (lane === "Music") return { styleKey: "warm_joy", styleProfile: STYLE_PROFILES.warm_joy };
      if (lane === "JustTalk" && affectState.valence < -0.12)
        return { styleKey: "calm_support", styleProfile: STYLE_PROFILES.calm_support };
      return { styleKey: "focused_analytical", styleProfile: STYLE_PROFILES.focused_analytical };
  }
}

/**
 * Choose a stable preset key (optional but recommended for ElevenLabs).
 */
function choosePresetKey({ styleKey, lane, affectState, opts }) {
  // Safety overrides
  if (affectState && affectState.risk_flag === "self_harm") return "NYX_BOUNDARY";

  // Intent / lane anchoring
  if (styleKey === "focused_analytical") return "NYX_ANALYTIC";
  if (styleKey === "confident_coach") return "NYX_COACH";
  if (styleKey === "warm_joy" || styleKey === "playful_tease") return "NYX_WARM";
  if (styleKey === "compassionate_concern" || styleKey === "calm_support") return "NYX_CALM";

  // fallback: lane
  if (lane === "News") return "NYX_ANALYTIC";
  if (lane === "Roku") return "NYX_COACH";
  if (lane === "Music") return "NYX_WARM";
  return "NYX_CALM";
}

/**
 * Normalize vendor profile so your TTS layer can consume it consistently.
 * For ElevenLabs, we keep normalized keys (stability/similarity/style/speakerBoost).
 */
function normalizeTtsProfile(tts, vendor) {
  const base = {
    stability: clamp(num(tts && tts.stability, 0.75), 0, 1),
    similarity: clamp(num(tts && tts.similarity, 0.85), 0, 1),
    style: clamp(num(tts && tts.style, 0.25), 0, 1),
    speakerBoost: !!(tts && tts.speakerBoost)
  };

  if ((vendor || "").toLowerCase() === "elevenlabs") return base;
  return base;
}

/**
 * Map affect-driven settings into ElevenLabs voice_settings shape.
 * Returns: { stability, similarity_boost, style, use_speaker_boost }
 *
 * Strategy:
 * - Start from presetKey base (more consistent across turns)
 * - Apply ttsProfile as gentle override (lets affectEngine steer without wobble)
 */
function toElevenLabsVoiceSettings({ presetKey, ttsProfile, opts }) {
  const presets = (opts && opts.presets) ? opts.presets : DEFAULTS.presets;
  const base = presets[presetKey] || presets.NYX_CALM;

  const merged = {
    stability: clamp(num(base.stability, 0.78), 0, 1),
    similarity: clamp(num(base.similarity, 0.88), 0, 1),
    style: clamp(num(base.style, 0.22), 0, 1),
    speakerBoost: !!base.speakerBoost
  };

  // Soft override with computed profile (bounded)
  if (ttsProfile && typeof ttsProfile === "object") {
    merged.stability = clamp(lerp(merged.stability, num(ttsProfile.stability, merged.stability), 0.45), 0, 1);
    merged.similarity = clamp(lerp(merged.similarity, num(ttsProfile.similarity, merged.similarity), 0.45), 0, 1);
    merged.style = clamp(lerp(merged.style, num(ttsProfile.style, merged.style), 0.50), 0, 1);
    merged.speakerBoost = (ttsProfile.speakerBoost !== undefined) ? !!ttsProfile.speakerBoost : merged.speakerBoost;
  }

  return {
    stability: merged.stability,
    similarity_boost: merged.similarity,
    style: merged.style,
    use_speaker_boost: merged.speakerBoost
  };
}

/** ---------------------------
 *  Prosody Markup (Text Rewriting)
 *  ---------------------------
 */

function applyProsodyMarkup({ text, userText, affectState, styleKey, lane, opts }) {
  let t = safeStr(text).trim();
  if (!t) return t;

  // 0) RVG Micro-ritual (Reflect → Validate → Guide) for depth
  if (shouldApplyRVG({ affectState, opts })) {
    t = applyRVG({ text: t, userText, affectState, styleKey, lane, opts });
  }

  // 1) Add a gentle human opener sometimes (sparingly).
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

  // 7) Safety/Boundary: enforce calm/firm tone if risk flagged
  if (affectState.risk_flag === "self_harm") {
    // Placeholder; your primary safety logic should live upstream.
    t = enforceBoundaryTone(t);
  }

  return t.trim();
}

function shouldApplyRVG({ affectState, opts }) {
  if (!opts || !opts.enableRVG) return false;
  if (!affectState || typeof affectState !== "object") return false;
  if (affectState.risk_flag === "self_harm") return true;

  const band = Number.isFinite(affectState.intensityBand) ? affectState.intensityBand : 0;
  const val = Number.isFinite(affectState.valence) ? affectState.valence : 0;

  if (val <= num(opts.rvgMinValence, -0.12)) return true;

  const when = safeStr(opts.rvgOnlyWhen || "medium").toLowerCase();
  if (when === "any") return band >= 0;
  if (when === "high") return band >= 2;
  // medium default
  return band >= 1;
}

/**
 * RVG = Reflect → Validate → Guide
 * We keep it short, and we do NOT invent user facts.
 */
function applyRVG({ text, userText, affectState, styleKey, lane, opts }) {
  const u = safeStr(userText).trim();
  const band = Number.isFinite(affectState.intensityBand) ? affectState.intensityBand : 0;

  const reflect = buildReflectLine({ userText: u, affectState, lane });
  const validate = buildValidateLine({ affectState, lane });
  const guide = buildGuideLine({ affectState, styleKey, lane, band });

  const lines = [reflect, validate, guide].filter(Boolean).slice(0, clampInt(opts.rvgMaxLines, 1, 5));
  if (!lines.length) return text;

  // If the draft already begins with a strong empathy line, don't double it.
  const head = normalize(text).slice(0, 40);
  if (/\b(i\s+hear\s+you|that\s+makes\s+sense|i\s+get\s+it)\b/.test(head)) {
    return lines.filter((l) => !/I hear you|That makes sense/i.test(l)).join("\n") + "\n" + text;
  }

  return lines.join("\n") + "\n" + text;
}

function buildReflectLine({ userText, affectState, lane }) {
  const t = normalize(userText);
  if (!t) return null;

  // Don’t echo verbatim; “reflect” the signal.
  if (regexAny(userText, DEFAULTS.lexicon.frustration)) return "I hear the frustration.";
  if (regexAny(userText, DEFAULTS.lexicon.overwhelm)) return "That sounds like a lot to carry right now.";
  if (regexAny(userText, DEFAULTS.lexicon.confusion)) return "I can tell this feels unclear.";
  if (regexAny(userText, DEFAULTS.lexicon.urgency)) return "I feel the urgency.";
  if (regexAny(userText, DEFAULTS.lexicon.excitement)) return "I can feel the momentum.";

  // Lane-specific neutral reflect
  if (lane === "News") return "Got it—let’s anchor the facts and the thread.";
  if (lane === "Roku") return "Okay—let’s lock the next move cleanly.";
  return "Okay. I’m with you.";
}

function buildValidateLine({ affectState, lane }) {
  if (affectState.risk_flag === "self_harm") return "You deserve support, and you don’t have to handle this alone.";
  if (affectState.valence < -0.15) return "That reaction makes sense.";
  if (affectState.intent === "coach") return "It’s normal to want this airtight before you trust it.";
  if (affectState.intent === "clarify") return "It’s fair to demand clarity here.";
  if (affectState.intent === "celebrate") return "That’s a real win.";
  return null;
}

function buildGuideLine({ affectState, styleKey, lane, band }) {
  if (affectState.risk_flag === "self_harm") return "If you’re in immediate danger, please contact local emergency services right now.";
  // Keep it non-verbose. “Guide” is a pivot, not a lecture.
  if (styleKey === "confident_coach") return "Here’s the move—one step at a time.";
  if (styleKey === "focused_analytical") return "Let’s simplify it into the smallest testable pieces.";
  if (styleKey === "compassionate_concern") return "We’ll go gently: one clear next step, then the next.";
  if (styleKey === "warm_joy") return "Let’s build on that momentum—clean and controlled.";
  return "Let’s take the next step together.";
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
  const badTurn = neg && strongArousal;

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
    style: affectState.style,
    intensityBand: affectState.intensityBand
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
      const chunks = sentence.split(/[,;:]\s+/);
      if (chunks.length > 1) {
        out += chunks.map(c => c.trim()).filter(Boolean).join(".\n") + (delim.trim() ? delim.trim() + " " : ".\n");
      } else {
        out += sentence + (delim || ". ");
      }
    } else {
      out += sentence + (delim || ". ");
    }
  }
  return out.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function addMicroPauses(text) {
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
  t = t.replace(/\bmaybe\b/gi, "");

  // Normalize whitespace
  t = t.replace(/\s{2,}/g, " ").trim();

  // Reduce rhetorical filler
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
  let t = text;
  t = t.replace(/!+/g, ".");
  return t.trim();
}

function confidenceDeltaFromText(userText) {
  const q = (safeStr(userText).match(/\?/g) || []).length;
  const imp = /\b(do|fix|build|ship|need|must)\b/i.test(safeStr(userText));
  let delta = 0;
  if (q >= 2) delta -= 0.06;
  if (imp) delta += 0.04;
  return delta;
}

function computeIntensity({ topKey, topVal, userText }) {
  if (!topVal || topVal <= 0) return 0;

  const s = safeStr(userText);
  const caps = /[A-Z]{4,}/.test(s);
  const manyBang = (s.match(/!/g) || []).length >= 2;
  const strong = /\b(very|extremely|so\s+much|right\s+now|can’t|can't)\b/i.test(s);

  let score = 0;
  score += Math.min(2, topVal);
  if (caps) score += 1;
  if (manyBang) score += 1;
  if (strong) score += 1;

  if (score >= 3) return 2;
  if (score >= 2) return 1;
  return 0;
}

function scoreRegexHits(text, patterns) {
  if (!patterns || !patterns.length) return 0;
  let hits = 0;
  for (const rx of patterns) {
    if (!rx) continue;
    if (rx instanceof RegExp) {
      if (rx.test(text)) hits++;
    } else {
      // fallback: treat as substring
      if (safeStr(text).toLowerCase().includes(safeStr(rx).toLowerCase())) hits++;
    }
  }
  return hits;
}

function regexAny(text, patterns) {
  for (const rx of patterns || []) {
    if (!rx) continue;
    if (rx instanceof RegExp) {
      if (rx.test(text)) return true;
    } else {
      if (safeStr(text).toLowerCase().includes(safeStr(rx).toLowerCase())) return true;
    }
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

function clampInt(x, a, b) {
  const n = parseInt(x, 10);
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function lerp(a, b, t) {
  const tt = clamp(num(t, 0.5), 0, 1);
  return a + (b - a) * tt;
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
