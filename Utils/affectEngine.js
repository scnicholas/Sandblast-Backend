
"use strict";

const VERSION = "affectEngine v3.2.1 BRIDGE-HARDENED + YEAR-SPEECH";

const DEFAULTS = {
  vendor: "generic",
  warmthStart: 0.42,
  warmthMax: 0.9,
  warmthStepGoodTurn: 0.025,
  warmthStepBadTurn: -0.05,
  maxSentenceLenForSplit: 150,
  injectAcknowledgement: true,
  injectAcknowledgementMaxChars: 240,
  conversationalNoContractions: true,
  speechHints: {
    pauses: { commaMs: 130, periodMs: 360, questionMs: 410, exclaimMs: 360, colonMs: 230, semicolonMs: 280, ellipsisMs: 560, yearMs: 70 },
    pacing: { mode: "fluid", preservePunctuation: true, sentenceBreath: true, noRunOns: true },
    years: { normalize: true, style: "spoken" }
  },
  pronunciationMap: { Nyx: "Nix", Nix: "Nix", Nick: "Nix", Sandblast: "Sand-blast", Roku: "Roh-koo", Marion: "Marry-in" },
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
    tts: { stability: 0.82, similarity: 0.89, style: 0.22, speakerBoost: true }
  },
  compassionate_concern: {
    styleName: "Compassionate Concern",
    pacing: "slow",
    pauseDensity: "high",
    pitch: "lower",
    energy: "gentle",
    tts: { stability: 0.85, similarity: 0.9, style: 0.18, speakerBoost: true }
  },
  focused_analytical: {
    styleName: "Focused Analytical",
    pacing: "medium",
    pauseDensity: "low",
    pitch: "neutral",
    energy: "controlled",
    tts: { stability: 0.88, similarity: 0.92, style: 0.1, speakerBoost: false }
  },
  confident_coach: {
    styleName: "Confident Coach",
    pacing: "medium_fast",
    pauseDensity: "medium",
    pitch: "neutral",
    energy: "firm",
    tts: { stability: 0.74, similarity: 0.9, style: 0.31, speakerBoost: true }
  },
  warm_joy: {
    styleName: "Warm Joy",
    pacing: "medium",
    pauseDensity: "low",
    pitch: "slightly_higher",
    energy: "bright",
    tts: { stability: 0.62, similarity: 0.88, style: 0.46, speakerBoost: true }
  },
  boundary_safety: {
    styleName: "Boundary / Safety",
    pacing: "slow",
    pauseDensity: "high",
    pitch: "lower",
    energy: "firm_calm",
    tts: { stability: 0.92, similarity: 0.93, style: 0.08, speakerBoost: true }
  }
};

function safeStr(v) { return v == null ? "" : String(v); }
function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function uniq(arr) { return [...new Set((Array.isArray(arr) ? arr : []).map((x) => safeStr(x).trim()).filter(Boolean))]; }
function lower(v) { return safeStr(v).toLowerCase(); }

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

function toEvidenceDigest(matches) {
  return (Array.isArray(matches) ? matches : [])
    .slice(0, 3)
    .map((m) => ({
      title: safeStr(m && (m.title || m.emotion || m.label)) || "unknown",
      score: clamp(num(m && (m.confidence ?? m.score), 0), 0, 1),
      tags: uniq(m && m.tags)
    }));
}

function normalizeLockedEmotion(lockedEmotion = {}) {
  const supportFlags = lockedEmotion.supportFlags && typeof lockedEmotion.supportFlags === "object" ? lockedEmotion.supportFlags : {};
  const evidenceMatches = Array.isArray(lockedEmotion.evidenceMatches) ? lockedEmotion.evidenceMatches : [];
  const meta = lockedEmotion.meta && typeof lockedEmotion.meta === "object" ? lockedEmotion.meta : {};
  return {
    locked: !!lockedEmotion.locked,
    primaryEmotion: safeStr(lockedEmotion.primaryEmotion) || "neutral",
    secondaryEmotion: safeStr(lockedEmotion.secondaryEmotion) || null,
    intensity: clamp(num(lockedEmotion.intensity, 0), 0, 1),
    valence: clamp(num(lockedEmotion.valence, 0), -1, 1),
    valenceLabel: toValenceLabel(lockedEmotion.valenceLabel || lockedEmotion.valence),
    confidence: clamp(num(lockedEmotion.confidence, 0), 0, 1),
    supportFlags,
    needs: uniq(lockedEmotion.needs),
    cues: uniq(lockedEmotion.cues),
    evidenceMatches,
    evidenceDigest: toEvidenceDigest(evidenceMatches),
    linkedDatasets: uniq(meta.linkedDatasets),
    datasetMeta: meta,
    signature: safeStr(lockedEmotion.signature)
  };
}

function normalizeStrategy(strategy = {}) {
  if (strategy && strategy.strategy && typeof strategy.strategy === "object") {
    strategy = strategy.strategy;
  }
  const expressionContract = strategy.expressionContract && typeof strategy.expressionContract === "object"
    ? strategy.expressionContract
    : {};
  return {
    archetype: safeStr(strategy.archetype) || "clarify",
    supportModeCandidate: safeStr(strategy.supportModeCandidate) || "steady_assist",
    routeBias: safeStr(strategy.routeBias) || "maintain",
    deliveryTone: safeStr(strategy.deliveryTone) || "neutral_warm",
    questionPressure: safeStr(expressionContract.questionPressure || strategy.questionPressure) || "medium",
    transitionReadiness: safeStr(expressionContract.transitionReadiness || strategy.transitionReadiness) || "medium",
    acknowledgementMode: safeStr(expressionContract.acknowledgementMode || strategy.acknowledgementMode) || "auto",
    expressionContract
  };
}

function resolveInputs(input = {}) {
  const lockedEmotion = normalizeLockedEmotion(
    (input.lockedEmotion && input.lockedEmotion.locked) ? input.lockedEmotion :
    (input.emotion && input.emotion.locked) ? input.emotion :
    (input.retrieverResult && input.retrieverResult.lockedEmotion) ? input.retrieverResult.lockedEmotion :
    {}
  );
  const strategy = normalizeStrategy(
    input.strategy ||
    input.routeGuardResult ||
    input.route ||
    {}
  );
  const guidedPrompt = input && typeof input === "object" ? (input.guidedPrompt || input.payload?.guidedPrompt || input.body?.guidedPrompt || null) : null;
  return { lockedEmotion, strategy, guidedPrompt };
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
    dominance: clamp(
      (strategy.archetype === "ground"
        ? 0.72
        : strategy.archetype === "channel" || strategy.archetype === "clarify"
        ? 0.66
        : 0.58) + (bias.dominance || 0),
      0,
      1
    ),
    warmth: clamp(
      warmthBase +
      (lockedEmotion.valenceLabel === "positive" ? 0.06 : 0.05) +
      (lockedEmotion.needs.includes("connection") ? 0.03 : 0) +
      (bias.warmth || 0),
      0,
      opts.warmthMax
    ),
    confidence: clamp(Math.max(lockedEmotion.confidence, 0.7), 0, 1),
    intent: mapIntent(strategy),
    risk_flag: lockedEmotion.supportFlags.needsContainment ? "high_distress" : "none",
    style: mapStyle(strategy),
    strategySignature: `${strategy.supportModeCandidate}|${strategy.archetype}|${strategy.deliveryTone}`,
    needs: lockedEmotion.needs,
    cues: lockedEmotion.cues,
    linkedDatasets: lockedEmotion.linkedDatasets
  };

  affectState.debug = {
    lane,
    consumedLockedEmotion: true,
    consumedStrategy: true,
    consumedDatasets: lockedEmotion.linkedDatasets,
    emotionOverrideAttempted: false,
    lockedEmotionSignature: lockedEmotion.signature || null
  };
  return affectState;
}

function selectStyleProfile({ affectState, strategy, lane }) {
  if (affectState.risk_flag !== "none" || affectState.primaryEmotion === "panic") {
    return { styleKey: "boundary_safety", styleProfile: STYLE_PROFILES.boundary_safety };
  }
  if (
    strategy.archetype === "ground" ||
    strategy.archetype === "witness" ||
    strategy.supportModeCandidate.includes("soothe") ||
    strategy.supportModeCandidate.includes("stabilize")
  ) {
    return {
      styleKey: affectState.valenceLabel === "negative" ? "compassionate_concern" : "calm_support",
      styleProfile: affectState.valenceLabel === "negative" ? STYLE_PROFILES.compassionate_concern : STYLE_PROFILES.calm_support
    };
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
  const v = lower(vendor);
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

function needsAcknowledgement({ text, strategy, lockedEmotion, opts }) {
  if (!opts.injectAcknowledgement) return false;
  const trimmed = safeStr(text).trim();
  if (!trimmed) return false;
  if (trimmed.length > opts.injectAcknowledgementMaxChars) return false;
  if (strategy.acknowledgementMode === "never") return false;
  const low = lower(trimmed);
  if (
    low.startsWith("i hear you") ||
    low.startsWith("that sounds") ||
    low.startsWith("it sounds") ||
    low.startsWith("you sound") ||
    low.startsWith("that feels") ||
    low.startsWith("i can hear")
  ) return false;

  const supportFlags = lockedEmotion && lockedEmotion.supportFlags && typeof lockedEmotion.supportFlags === "object" ? lockedEmotion.supportFlags : {};
  const needs = Array.isArray(lockedEmotion && lockedEmotion.needs) ? lockedEmotion.needs : [];
  return (
    lockedEmotion.valenceLabel === "negative" ||
    !!supportFlags.needsStabilization ||
    needs.includes("connection") ||
    strategy.supportModeCandidate.includes("soothe") ||
    strategy.supportModeCandidate.includes("stabilize")
  );
}

function buildAcknowledgement({ lockedEmotion, strategy }) {
  const emotion = lower(lockedEmotion.primaryEmotion);
  if (emotion === "overwhelm" || emotion === "anxiety" || emotion === "panic" || emotion === "fear") {
    return "I hear the pressure in that.";
  }
  if (emotion === "sadness" || emotion === "grief" || emotion === "loneliness" || emotion === "despair") {
    return "I can hear how heavy that feels.";
  }
  if (emotion === "anger" || emotion === "frustration" || emotion === "resentment") {
    return "I can hear the strain in that.";
  }
  if (strategy.supportModeCandidate.includes("soothe") || strategy.supportModeCandidate.includes("stabilize")) {
    return "I hear that this feels like a lot right now.";
  }
  if (strategy.archetype === "clarify") {
    return "I can hear there is real weight behind this.";
  }
  return "";
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

function applyProsodyMarkup({ text, affectState, strategy, styleKey, opts }) {
  let t = safeStr(text).trim();
  if (!t) return t;

  if (needsAcknowledgement({ text: t, strategy, lockedEmotion: affectState, opts })) {
    const ack = buildAcknowledgement({ lockedEmotion: affectState, strategy });
    if (ack) t = `${ack} ${t}`;
  }

  if (opts.conversationalNoContractions) t = expandCoreContractions(t);

  if (strategy.expressionContract && strategy.questionPressure === "none") {
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

  t = t
    .replace(/\s*—\s*/g, ". ")
    .replace(/\s{2,}/g, " ")
    .replace(/\b(Nyx|Nick)\b/g, "Nix");

  return t.trim();
}

function expandCoreContractions(text) {
  let t = safeStr(text);
  const replacements = [
    [/\bI\'m\b/gi, "I am"], [/\bI\'ll\b/gi, "I will"], [/\bI\'ve\b/gi, "I have"], [/\bI\'d\b/gi, "I would"],
    [/\byou\'re\b/gi, "you are"], [/\byou\'ll\b/gi, "you will"], [/\byou\'ve\b/gi, "you have"], [/\byou\'d\b/gi, "you would"],
    [/\bwe\'re\b/gi, "we are"], [/\bwe\'ll\b/gi, "we will"], [/\bthey\'re\b/gi, "they are"],
    [/\bit\'s\b/gi, "it is"], [/\bthat\'s\b/gi, "that is"], [/\bthere\'s\b/gi, "there is"], [/\bhere\'s\b/gi, "here is"],
    [/\bcan\'t\b/gi, "cannot"], [/\bwon\'t\b/gi, "will not"], [/\bdon\'t\b/gi, "do not"], [/\bdoesn\'t\b/gi, "does not"],
    [/\bdidn\'t\b/gi, "did not"], [/\baren\'t\b/gi, "are not"], [/\bisn\'t\b/gi, "is not"], [/\bwasn\'t\b/gi, "was not"],
    [/\bweren\'t\b/gi, "were not"], [/\bshouldn\'t\b/gi, "should not"], [/\bcouldn\'t\b/gi, "could not"], [/\bwouldn\'t\b/gi, "would not"]
  ];
  for (const [pattern, replacement] of replacements) t = t.replace(pattern, replacement);
  return t;
}

function buildSpeechHints({ styleKey, lane, affectState, strategy, opts }) {
  const base = mergeDeep({}, opts.speechHints || DEFAULTS.speechHints);
  if (["compassionate_concern", "calm_support", "boundary_safety"].includes(styleKey)) {
    base.pauses.commaMs = Math.max(num(base.pauses.commaMs, 130), 135);
    base.pauses.periodMs = Math.max(num(base.pauses.periodMs, 360), 380);
    base.pauses.questionMs = Math.max(num(base.pauses.questionMs, 410), 430);
    base.pacing.mode = "gentle";
  }
  if (strategy.archetype === "channel" || safeStr(lane) === "Music") {
    base.pauses.commaMs = Math.min(num(base.pauses.commaMs, 130), 120);
    base.pauses.periodMs = Math.min(num(base.pauses.periodMs, 360), 320);
    base.pacing.mode = "steady";
  }
  if (affectState.primaryEmotion === "panic" || affectState.primaryEmotion === "fear" || affectState.primaryEmotion === "overwhelm") {
    base.pauses.commaMs = Math.max(num(base.pauses.commaMs, 130), 150);
    base.pauses.periodMs = Math.max(num(base.pauses.periodMs, 360), 430);
    base.pacing.mode = "grounded";
  }
  base.pacing.preservePunctuation = true;
  base.pacing.sentenceBreath = true;
  base.pacing.noRunOns = true;
  if (!base.years || typeof base.years !== "object") base.years = {};
  base.years.normalize = base.years.normalize !== false;
  base.years.style = safeStr(base.years.style || "spoken").toLowerCase() || "spoken";
  return base;
}

function buildPronunciationMap({ opts }) {
  const merged = mergeDeep({}, DEFAULTS.pronunciationMap, opts.pronunciationMap || {});
  merged.NYX = merged.NYX || "Nix";
  return merged;
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

function buildExpressionBridge({ lockedEmotion, strategy, affectState, styleKey, styleProfile, ttsProfile, guidedPrompt, speechHints, pronunciationMap, spokenText }) {
  return {
    version: VERSION,
    emotionLocked: true,
    strategyLocked: true,
    primaryEmotion: lockedEmotion.primaryEmotion,
    secondaryEmotion: lockedEmotion.secondaryEmotion,
    emotionConfidence: lockedEmotion.confidence,
    emotionSignature: lockedEmotion.signature || null,
    evidenceDigest: lockedEmotion.evidenceDigest,
    linkedDatasets: lockedEmotion.linkedDatasets,
    needs: lockedEmotion.needs,
    cues: lockedEmotion.cues,
    guidedPrompt: guidedPrompt && typeof guidedPrompt === "object" ? guidedPrompt : null,
    strategyArchetype: strategy.archetype,
    supportMode: strategy.supportModeCandidate,
    deliveryTone: strategy.deliveryTone,
    styleKey,
    styleName: styleProfile.styleName,
    ttsProfile,
    speechHints,
    pronunciationMap,
    spokenText,
    affectState
  };
}



function derivePrimaryState({ affectState, strategy, continuity }) {
  const continuityBand = continuity && typeof continuity === "object" ? safeStr(continuity.stateBand || continuity.level || "") : "";
  if (affectState.risk_flag !== "none") return "reassuring";
  if (affectState.valenceLabel === "negative") return "supportive";
  if (strategy.archetype === "clarify") return continuityBand === "deep" ? "focused" : "clarifying";
  if (strategy.archetype === "channel") return "decisive";
  if (strategy.archetype === "celebrate" || affectState.valenceLabel === "positive") return "celebratory";
  return continuityBand === "deep" ? "focused" : "curious";
}

function deriveSecondaryState({ affectState, strategy }) {
  if (affectState.risk_flag !== "none") return "holding";
  if (strategy.supportModeCandidate.includes("stabilize") || strategy.supportModeCandidate.includes("soothe")) return "reassuring";
  if (strategy.supportModeCandidate.includes("clarify") || strategy.archetype === "clarify") return "narrowing";
  if (strategy.supportModeCandidate.includes("channel") || strategy.archetype === "channel") return "advancing";
  if (affectState.valenceLabel === "positive") return "amplifying";
  return "steady";
}

function continuityWeight(memory = {}) {
  const prev = memory.prevUnifiedTurn && typeof memory.prevUnifiedTurn === "object" ? memory.prevUnifiedTurn : null;
  if (!prev) return 0;
  const streak = clamp(num(prev.stateStreak, 0), 0, 6);
  return clamp(0.18 + streak * 0.07, 0, 0.55);
}

function smoothStateLabel(nextLabel, prevLabel, weight) {
  if (!prevLabel) return nextLabel;
  if (nextLabel === prevLabel) return nextLabel;
  return weight >= 0.42 ? prevLabel : nextLabel;
}

function placeholderForState(state) {
  switch (safeStr(state).toLowerCase()) {
    case "supportive": return "Tell me what feels heavy…";
    case "reassuring": return "Tell me what feels hardest right now…";
    case "clarifying": return "Give me the part you want sharpened…";
    case "decisive": return "Tell me what you want done…";
    case "celebratory": return "Tell me what you want to build on…";
    case "focused": return "Pick the next move…";
    default: return "Ask Nyx anything about Sandblast…";
  }
}

function buildActionCluster({ primaryState, lane, guidedPrompt }) {
  const l = lower(lane) || "general";
  const gpLane = guidedPrompt && typeof guidedPrompt === "object" ? lower(guidedPrompt.lane || "") : "";
  const resolvedLane = gpLane || l;
  const items = [];
  const add = (label, role, payload) => items.push({ label, role, payload: payload || {} });

  if (primaryState === "supportive" || primaryState === "reassuring") {
    add("Break it down for me", "stabilize", { action: "support_break_down", lane: resolvedLane });
    add("Show the easiest next step", "advance", { action: "next_step", lane: resolvedLane });
    add("Stay with this and guide me", "confirm", { action: "guided_mode_on", lane: resolvedLane });
  } else if (resolvedLane === "music") {
    add("Give me a Top 10", "advance", { lane: "music", action: "top10" });
    add("Pick a year", "narrow", { lane: "music", action: "year_pick" });
    add("Tell me the story", "explore", { lane: "music", action: "story_moment" });
  } else if (primaryState === "clarifying") {
    add("Visual redesign", "narrow", { action: "visual_redesign", lane: resolvedLane });
    add("Backend fix", "advance", { action: "backend_fix", lane: resolvedLane });
    add("Voice upgrade", "pivot", { action: "voice_upgrade", lane: resolvedLane });
  } else if (primaryState === "decisive" || primaryState === "focused") {
    add("Show the exact fix", "advance", { action: "exact_fix", lane: resolvedLane });
    add("Generate the code", "advance", { action: "generate_code", lane: resolvedLane });
    add("Apply this to the widget", "pivot", { action: "apply_widget", lane: resolvedLane });
  } else {
    add("Pick the next move", "advance", { action: "next_step", lane: resolvedLane });
    add("Explore options", "explore", { action: "explore_options", lane: resolvedLane });
    add("Keep this focused", "confirm", { action: "focus_mode", lane: resolvedLane });
  }

  return items.slice(0, primaryState === "curious" ? 4 : 3).map((item, idx) => ({
    id: `${safeStr(item.payload.action || item.label).toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${idx + 1}`,
    type: "action",
    label: item.label,
    role: item.role,
    payload: item.payload
  }));
}

function buildUnifiedTurn({ affectState, strategy, guidedPrompt, memory, lane }) {
  const continuity = memory.prevUnifiedTurn && typeof memory.prevUnifiedTurn === "object" ? memory.prevUnifiedTurn : {};
  const weight = continuityWeight(memory);
  const primaryState = smoothStateLabel(
    derivePrimaryState({ affectState, strategy, continuity }),
    safeStr(continuity.primaryState || ""),
    weight
  );
  const secondaryState = smoothStateLabel(
    deriveSecondaryState({ affectState, strategy }),
    safeStr(continuity.secondaryState || ""),
    Math.max(0.25, weight * 0.85)
  );
  const continuityScore = clamp(num(continuity.continuityScore, 0.35) * 0.45 + (weight + 0.3) * 0.55, 0, 1);
  return {
    primaryState,
    secondaryState,
    placeholder: placeholderForState(primaryState),
    actions: buildActionCluster({ primaryState, lane, guidedPrompt }),
    continuityScore,
    stateStreak: safeStr(continuity.primaryState || "") === primaryState ? clamp(num(continuity.stateStreak, 0) + 1, 0, 99) : 0,
    expression: {
      styleKey: affectState.presetKey || "calm_support",
      pacing: affectState.ttsProfile ? (affectState.ttsProfile.style >= 0.3 ? "expressive" : "steady") : "steady",
      energy: affectState.style || "neutral",
      intent: affectState.intent || "assist"
    }
  };
}

function inferAffectState(input = {}) {
  const { lockedEmotion, strategy, guidedPrompt } = resolveInputs(input);
  if (!lockedEmotion.locked) {
    return {
      ok: false,
      source: "affectEngine",
      error: "locked_emotion_required",
      allowEmotionOverride: false
    };
  }
  return buildAffectState({
    lockedEmotion,
    strategy,
    lane: safeStr(input.lane) || "Default",
    memory: input.memory && typeof input.memory === "object" ? input.memory : {},
    opts: mergeDeep({}, DEFAULTS, input.opts || {})
  });
}

function runAffectEngine(input = {}) {
  const assistantDraft = safeStr(input.assistantDraft || input.replyText || input.reply || "");
  const lane = safeStr(input.lane) || "Default";
  const memory = input.memory && typeof input.memory === "object" ? input.memory : {};
  const opts = mergeDeep({}, DEFAULTS, input.opts || {});
  const { lockedEmotion, strategy, guidedPrompt } = resolveInputs(input);

  if (!lockedEmotion.locked || !strategy.supportModeCandidate) {
    return {
      ok: false,
      source: "affectEngine",
      error: !lockedEmotion.locked ? "locked_emotion_required" : "strategy_required",
      allowEmotionOverride: false,
      memory,
      debug: {
        hasLockedEmotion: !!lockedEmotion.locked,
        hasStrategy: !!strategy.supportModeCandidate
      }
    };
  }

  const affectState = buildAffectState({ lockedEmotion, strategy, lane, memory, opts });
  const { styleKey, styleProfile } = selectStyleProfile({ affectState, strategy, lane, opts });
  const rawTtsProfile = normalizeTtsProfile(styleProfile.tts, opts.vendor);
  const ttsProfile = smoothTtsProfile({ ttsProfile: rawTtsProfile, memory, presetKey: styleKey });

  affectState.ttsProfile = ttsProfile;
  affectState.presetKey = styleKey;

  const spokenText = applyProsodyMarkup({ text: assistantDraft, affectState, strategy, styleKey, opts });
  const speechHints = buildSpeechHints({ styleKey, lane, affectState, strategy, opts });
  const pronunciationMap = buildPronunciationMap({ opts });
  const unifiedTurn = buildUnifiedTurn({ affectState, strategy, guidedPrompt, memory, lane });
  const nextMemory = updateAffectMemory({ memory, affectState, ttsProfile, presetKey: styleKey });
  nextMemory.prevUnifiedTurn = unifiedTurn;

  return {
    ok: true,
    source: "affectEngine",
    affectState,
    styleKey,
    styleProfile,
    ttsProfile,
    spokenText,
    speechHints,
    pronunciationMap,
    memory: nextMemory,
    unifiedTurn,
    expressionBridge: buildExpressionBridge({ lockedEmotion, strategy, affectState, styleKey, styleProfile, ttsProfile, guidedPrompt, speechHints, pronunciationMap, spokenText }),
    debug: affectState.debug
  };
}

module.exports = {
  VERSION,
  runAffectEngine,
  inferAffectState,
  selectStyleProfile,
  applyProsodyMarkup,
  resolveInputs,
  derivePrimaryState,
  buildUnifiedTurn,
  placeholderForState,
  buildSpeechHints,
  buildPronunciationMap,
  expandCoreContractions
};
