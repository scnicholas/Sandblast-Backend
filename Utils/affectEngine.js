"use strict";

const VERSION = "affectEngine v3.0.0 LOCKED-EXPRESSION-ONLY";

const DEFAULTS = {
  vendor: "generic",
  warmthStart: 0.42,
  warmthMax: 0.88,
  warmthStepGoodTurn: 0.025,
  warmthStepBadTurn: -0.05,
  maxSentenceLenForSplit: 150,
  laneBias: {
    JustTalk: { warmth: 0.08, dominance: -0.03, arousal: -0.03 },
    Roku: { warmth: 0.02, dominance: 0.08, arousal: 0.03 },
    News: { warmth: -0.02, dominance: 0.06, arousal: -0.01 },
    Music: { warmth: 0.05, dominance: -0.02, arousal: 0.06 },
    Default: { warmth: 0, dominance: 0, arousal: 0 }
  }
};

const STYLE_PROFILES = {
  calm_support: {
    styleName: "Calm Support",
    pacing: "slow",
    pauseDensity: "high",
    pitch: "slightly_lower",
    energy: "soft_steady",
    tts: { stability: 0.8, similarity: 0.88, style: 0.2, speakerBoost: true }
  },
  compassionate_concern: {
    styleName: "Compassionate Concern",
    pacing: "slow",
    pauseDensity: "high",
    pitch: "lower",
    energy: "gentle",
    tts: { stability: 0.84, similarity: 0.89, style: 0.15, speakerBoost: true }
  },
  focused_analytical: {
    styleName: "Focused Analytical",
    pacing: "medium",
    pauseDensity: "low",
    pitch: "neutral",
    energy: "controlled",
    tts: { stability: 0.87, similarity: 0.92, style: 0.1, speakerBoost: false }
  },
  confident_coach: {
    styleName: "Confident Coach",
    pacing: "medium_fast",
    pauseDensity: "medium",
    pitch: "neutral",
    energy: "firm",
    tts: { stability: 0.72, similarity: 0.9, style: 0.3, speakerBoost: true }
  },
  warm_joy: {
    styleName: "Warm Joy",
    pacing: "medium",
    pauseDensity: "low",
    pitch: "slightly_higher",
    energy: "bright",
    tts: { stability: 0.6, similarity: 0.87, style: 0.46, speakerBoost: true }
  },
  boundary_safety: {
    styleName: "Boundary / Safety",
    pacing: "slow",
    pauseDensity: "high",
    pitch: "lower",
    energy: "firm_calm",
    tts: { stability: 0.91, similarity: 0.92, style: 0.08, speakerBoost: true }
  }
};

function safeStr(v) { return v == null ? "" : String(v); }
function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function mergeDeep(target, ...sources) {
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    for (const key of Object.keys(src)) {
      const value = src[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (!target[key] || typeof target[key] !== "object") target[key] = {};
        mergeDeep(target[key], value);
      } else target[key] = value;
    }
  }
  return target;
}

function toValenceLabel(n) {
  if (typeof n === "string") return n.toLowerCase();
  if (Number(n) > 0.15) return "positive";
  if (Number(n) < -0.15) return "negative";
  return "mixed";
}

function normalizeLockedEmotion(lockedEmotion = {}) {
  return {
    locked: !!lockedEmotion.locked,
    primaryEmotion: safeStr(lockedEmotion.primaryEmotion) || "neutral",
    secondaryEmotion: safeStr(lockedEmotion.secondaryEmotion) || null,
    intensity: clamp(num(lockedEmotion.intensity, 0), 0, 1),
    valence: clamp(num(lockedEmotion.valence, 0), -1, 1),
    valenceLabel: toValenceLabel(lockedEmotion.valenceLabel || lockedEmotion.valence),
    confidence: clamp(num(lockedEmotion.confidence, 0), 0, 1),
    supportFlags: lockedEmotion.supportFlags && typeof lockedEmotion.supportFlags === "object" ? lockedEmotion.supportFlags : {},
    needs: Array.isArray(lockedEmotion.needs) ? lockedEmotion.needs : [],
    cues: Array.isArray(lockedEmotion.cues) ? lockedEmotion.cues : []
  };
}

function buildAffectState({ lockedEmotion, strategy, lane, memory, opts }) {
  const bias = opts.laneBias[lane] || opts.laneBias.Default;
  const prev = memory.prevAffectState && typeof memory.prevAffectState === "object" ? memory.prevAffectState : null;
  const intensity = lockedEmotion.intensity;
  const valence = clamp(lockedEmotion.valence, -1, 1);
  const warmthBase = prev ? prev.warmth : opts.warmthStart;

  const affectState = {
    source: "affectEngine",
    version: VERSION,
    usedLockedEmotion: true,
    allowEmotionOverride: false,
    primaryEmotion: lockedEmotion.primaryEmotion,
    secondaryEmotion: lockedEmotion.secondaryEmotion,
    valence,
    valenceLabel: lockedEmotion.valenceLabel,
    arousal: clamp(intensity + (bias.arousal || 0), 0, 1),
    dominance: clamp((strategy.archetype === "ground" ? 0.72 : strategy.archetype === "channel" || strategy.archetype === "clarify" ? 0.66 : 0.58) + (bias.dominance || 0), 0, 1),
    warmth: clamp(warmthBase + (lockedEmotion.valenceLabel === "positive" ? 0.06 : 0.04) + (bias.warmth || 0), 0, opts.warmthMax),
    confidence: clamp(Math.max(lockedEmotion.confidence, 0.68), 0, 1),
    intent: mapIntent(strategy),
    risk_flag: lockedEmotion.supportFlags.needsContainment ? "high_distress" : "none",
    style: mapStyle(strategy),
    strategySignature: `${strategy.supportModeCandidate}|${strategy.archetype}|${strategy.deliveryTone}`
  };

  affectState.debug = {
    lane,
    consumedLockedEmotion: true,
    consumedStrategy: true,
    emotionOverrideAttempted: false
  };
  return affectState;
}

function mapIntent(strategy) {
  switch (strategy.supportModeCandidate) {
    case "immediate_grounding":
    case "soothe_and_ground":
    case "soothe_and_structure":
    case "stabilize_then_shrink_scope":
      return "soothe";
    case "clarify_and_sequence":
    case "regulate_and_unblock":
      return "clarify";
    case "celebrate_and_channel":
    case "reinforce_and_channel":
      return "celebrate";
    case "affirm_and_anchor":
    case "steady_and_extend":
    case "stabilize_and_anchor":
      return "assist";
    default:
      return strategy.routeBias === "channel" ? "coach" : strategy.routeBias === "repair" ? "soothe" : "assist";
  }
}

function mapStyle(strategy) {
  if (strategy.archetype === "ground" || strategy.archetype === "boundary") return "therapist_adjacent";
  if (strategy.archetype === "channel") return "executive";
  if (strategy.archetype === "celebrate") return "playful";
  return "neutral";
}

function selectStyleProfile({ affectState, strategy, lane }) {
  if (affectState.risk_flag !== "none" || affectState.primaryEmotion === "panic") {
    return { styleKey: "boundary_safety", styleProfile: STYLE_PROFILES.boundary_safety };
  }
  if (strategy.archetype === "ground" || strategy.archetype === "witness" || strategy.supportModeCandidate.includes("soothe") || strategy.supportModeCandidate.includes("stabilize")) {
    return { styleKey: affectState.valenceLabel === "negative" ? "compassionate_concern" : "calm_support", styleProfile: affectState.valenceLabel === "negative" ? STYLE_PROFILES.compassionate_concern : STYLE_PROFILES.calm_support };
  }
  if (strategy.archetype === "clarify") return { styleKey: "focused_analytical", styleProfile: STYLE_PROFILES.focused_analytical };
  if (strategy.archetype === "channel") return { styleKey: "confident_coach", styleProfile: STYLE_PROFILES.confident_coach };
  if (strategy.archetype === "celebrate") return { styleKey: "warm_joy", styleProfile: STYLE_PROFILES.warm_joy };
  if (lane === "News") return { styleKey: "focused_analytical", styleProfile: STYLE_PROFILES.focused_analytical };
  return { styleKey: "calm_support", styleProfile: STYLE_PROFILES.calm_support };
}

function normalizeTtsProfile(tts, vendor) {
  const base = {
    stability: clamp(num(tts.stability, 0.78), 0, 1),
    similarity: clamp(num(tts.similarity, 0.86), 0, 1),
    style: clamp(num(tts.style, 0.2), 0, 1),
    speakerBoost: !!tts.speakerBoost
  };
  const v = safeStr(vendor).toLowerCase();
  return v === "resemble" || v === "generic" || v === "elevenlabs" ? base : base;
}

function smoothTtsProfile({ ttsProfile, memory, presetKey }) {
  const prev = memory.prevTtsProfile && typeof memory.prevTtsProfile === "object" ? memory.prevTtsProfile : null;
  if (!prev || memory.prevPresetKey !== presetKey) return { ...ttsProfile };
  const alpha = 0.55;
  return {
    stability: clamp(prev.stability * (1 - alpha) + ttsProfile.stability * alpha, 0, 1),
    similarity: clamp(prev.similarity * (1 - alpha) + ttsProfile.similarity * alpha, 0, 1),
    style: clamp(prev.style * (1 - alpha) + ttsProfile.style * alpha, 0, 1),
    speakerBoost: ttsProfile.speakerBoost
  };
}

function applyProsodyMarkup({ text, affectState, strategy, styleKey, opts }) {
  let t = safeStr(text).trim();
  if (!t) return t;

  if (strategy.expressionContract && strategy.expressionContract.questionPressure === "none") {
    t = t.replace(/\?/g, ".");
  }

  if ((styleKey === "compassionate_concern" || styleKey === "calm_support" || styleKey === "boundary_safety") && !/[.!?]$/.test(t)) {
    t += ".";
  }

  if (affectState.primaryEmotion === "panic" || affectState.primaryEmotion === "fear" || affectState.primaryEmotion === "overwhelm") {
    t = splitLongSentences(t, opts.maxSentenceLenForSplit);
    t = t.replace(/,\s+/g, ", … ");
  } else if (strategy.archetype === "channel" || strategy.archetype === "celebrate") {
    t = t.replace(/\.\s+/g, ". ");
  }

  return t;
}

function splitLongSentences(text, maxLen) {
  return text
    .split(/([.!?])/)
    .reduce((acc, piece) => {
      if (!piece) return acc;
      if (piece.length > maxLen && !/[.!?]/.test(piece)) return acc + piece.replace(/,\s+/g, ", … ");
      return acc + piece;
    }, "");
}

function updateAffectMemory({ memory, affectState, ttsProfile, presetKey }) {
  return {
    ...memory,
    prevAffectState: {
      primaryEmotion: affectState.primaryEmotion,
      valence: affectState.valence,
      arousal: affectState.arousal,
      dominance: affectState.dominance,
      warmth: affectState.warmth,
      confidence: affectState.confidence,
      intent: affectState.intent,
      style: affectState.style
    },
    prevTtsProfile: { ...ttsProfile },
    prevPresetKey: presetKey
  };
}

function buildExpressionBridge({ lockedEmotion, strategy, affectState, styleKey, styleProfile, ttsProfile }) {
  return {
    version: VERSION,
    emotionLocked: true,
    strategyLocked: true,
    primaryEmotion: lockedEmotion.primaryEmotion,
    strategyArchetype: strategy.archetype,
    supportMode: strategy.supportModeCandidate,
    styleKey,
    styleName: styleProfile.styleName,
    ttsProfile,
    affectState
  };
}

function inferAffectState(input = {}) {
  const lockedEmotion = normalizeLockedEmotion(input.lockedEmotion || {});
  if (!lockedEmotion.locked) {
    return {
      ok: false,
      source: "affectEngine",
      error: "locked_emotion_required",
      allowEmotionOverride: false
    };
  }
  const strategy = input.strategy && typeof input.strategy === "object" ? input.strategy : { archetype: "clarify", supportModeCandidate: "steady_assist", routeBias: "maintain", deliveryTone: "neutral_warm", expressionContract: {} };
  return buildAffectState({ lockedEmotion, strategy, lane: safeStr(input.lane) || "Default", memory: input.memory && typeof input.memory === "object" ? input.memory : {}, opts: mergeDeep({}, DEFAULTS, input.opts || {}) });
}

function runAffectEngine(input = {}) {
  const assistantDraft = safeStr(input.assistantDraft);
  const lane = safeStr(input.lane) || "Default";
  const memory = input.memory && typeof input.memory === "object" ? input.memory : {};
  const opts = mergeDeep({}, DEFAULTS, input.opts || {});
  const lockedEmotion = normalizeLockedEmotion(input.lockedEmotion || {});
  const strategy = input.strategy && typeof input.strategy === "object" ? input.strategy : null;

  if (!lockedEmotion.locked || !strategy) {
    return {
      ok: false,
      source: "affectEngine",
      error: !lockedEmotion.locked ? "locked_emotion_required" : "strategy_required",
      allowEmotionOverride: false,
      memory
    };
  }

  const affectState = buildAffectState({ lockedEmotion, strategy, lane, memory, opts });
  const { styleKey, styleProfile } = selectStyleProfile({ affectState, strategy, lane, opts });
  const rawTtsProfile = normalizeTtsProfile(styleProfile.tts, opts.vendor);
  const ttsProfile = smoothTtsProfile({ ttsProfile: rawTtsProfile, memory, presetKey: styleKey });
  affectState.ttsProfile = ttsProfile;
  affectState.presetKey = styleKey;
  const spokenText = applyProsodyMarkup({ text: assistantDraft, affectState, strategy, styleKey, opts });
  const nextMemory = updateAffectMemory({ memory, affectState, ttsProfile, presetKey: styleKey });

  return {
    ok: true,
    source: "affectEngine",
    affectState,
    styleKey,
    styleProfile,
    ttsProfile,
    spokenText,
    memory: nextMemory,
    expressionBridge: buildExpressionBridge({ lockedEmotion, strategy, affectState, styleKey, styleProfile, ttsProfile }),
    debug: affectState.debug
  };
}

module.exports = {
  VERSION,
  runAffectEngine,
  inferAffectState,
  selectStyleProfile,
  applyProsodyMarkup
};
