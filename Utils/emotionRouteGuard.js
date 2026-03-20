"use strict";

const VERSION = "emotionRouteGuard v4.0.0 STRATEGY-ONLY";

const ARCHETYPES = {
  witness: { openingStyle: "reflective_presence", questionStyle: "gentle_reflective", allowsActionShift: false },
  soothe: { openingStyle: "calming_validation", questionStyle: "grounding", allowsActionShift: false },
  ground: { openingStyle: "steadying", questionStyle: "sensory_or_scope_reduction", allowsActionShift: true },
  clarify: { openingStyle: "orienting", questionStyle: "narrowing", allowsActionShift: true },
  repair: { openingStyle: "careful_nonshaming", questionStyle: "repair_focused", allowsActionShift: true },
  reconnect: { openingStyle: "relational_attunement", questionStyle: "connection_or_meaning", allowsActionShift: true },
  boundary: { openingStyle: "containment", questionStyle: "limit_setting", allowsActionShift: true },
  activate: { openingStyle: "energy_restore", questionStyle: "small_next_step", allowsActionShift: true },
  celebrate: { openingStyle: "affirming", questionStyle: "extension", allowsActionShift: true },
  meaningMake: { openingStyle: "meaning_reflection", questionStyle: "integrative", allowsActionShift: true },
  challenge: { openingStyle: "soft_challenge", questionStyle: "reconsideration", allowsActionShift: true },
  channel: { openingStyle: "directed_momentum", questionStyle: "execution", allowsActionShift: true }
};

const EMOTION_STRATEGY_MAP = {
  neutral: { supportMode: "steady_assist", routeBias: "maintain", archetype: "clarify", questionPressure: "medium", expressionTone: "neutral_warm" },
  anxiety: { supportMode: "soothe_and_structure", routeBias: "stabilize", archetype: "soothe", questionPressure: "low", expressionTone: "gentle_regulated" },
  fear: { supportMode: "soothe_and_ground", routeBias: "stabilize", archetype: "ground", questionPressure: "low", expressionTone: "firm_calm" },
  panic: { supportMode: "immediate_grounding", routeBias: "stabilize", archetype: "ground", questionPressure: "none", expressionTone: "firm_calm" },
  overwhelm: { supportMode: "stabilize_then_shrink_scope", routeBias: "stabilize", archetype: "ground", questionPressure: "low", expressionTone: "gentle_regulated" },
  sadness: { supportMode: "validate_and_hold", routeBias: "stabilize", archetype: "witness", questionPressure: "low", expressionTone: "soft_attuned" },
  grief: { supportMode: "validate_and_hold", routeBias: "stabilize", archetype: "witness", questionPressure: "low", expressionTone: "soft_attuned" },
  shame: { supportMode: "repair_and_soothe", routeBias: "repair", archetype: "repair", questionPressure: "low", expressionTone: "nonjudgmental_soft" },
  loneliness: { supportMode: "attune_and_connect", routeBias: "deepen", archetype: "reconnect", questionPressure: "low", expressionTone: "warm_attuned" },
  confusion: { supportMode: "clarify_and_sequence", routeBias: "clarify", archetype: "clarify", questionPressure: "medium", expressionTone: "clear_measured" },
  frustration: { supportMode: "regulate_and_unblock", routeBias: "clarify", archetype: "clarify", questionPressure: "medium", expressionTone: "steady_direct" },
  anger: { supportMode: "regulate_and_redirect", routeBias: "stabilize", archetype: "boundary", questionPressure: "low", expressionTone: "firm_contained" },
  gratitude: { supportMode: "affirm_and_anchor", routeBias: "maintain", archetype: "celebrate", questionPressure: "medium", expressionTone: "warm_bright" },
  joy: { supportMode: "celebrate_and_anchor", routeBias: "maintain", archetype: "celebrate", questionPressure: "medium", expressionTone: "warm_bright" },
  calm: { supportMode: "steady_and_extend", routeBias: "maintain", archetype: "meaningMake", questionPressure: "medium", expressionTone: "soft_steady" },
  relief: { supportMode: "stabilize_and_anchor", routeBias: "maintain", archetype: "ground", questionPressure: "medium", expressionTone: "soft_steady" },
  excitement: { supportMode: "celebrate_and_channel", routeBias: "channel", archetype: "channel", questionPressure: "medium", expressionTone: "bright_directed" },
  hope: { supportMode: "reinforce_and_channel", routeBias: "channel", archetype: "channel", questionPressure: "medium", expressionTone: "warm_directed" }
};

function safeStr(v) { return v == null ? "" : String(v); }
function lower(v) { return safeStr(v).toLowerCase(); }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function uniq(arr) { return [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean))]; }

function detectPresentationSignals(text) {
  const t = lower(text)
    .replace(/\bcan'?t\b/g, "cannot")
    .replace(/\bi'?m\b/g, "i am")
    .replace(/[^a-z0-9?!' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    isQuestion: /\?/.test(text) || /\b(can you|could you|would you|should i|what do i|how do i|why do i|am i|is this|do you think)\b/.test(t),
    asksForHelp: /\b(help me|i need help|can you help|need support|stay with me|talk to me)\b/.test(t),
    asksForRelief: /\b(make it stop|i need this to stop|get me out of this|calm me down|help me breathe)\b/.test(t),
    hasContrast: /\b(but|though|except|yet)\b/.test(t),
    hasUncertainty: /\b(maybe|i guess|not sure|i think|possibly|kind of|sort of)\b/.test(t),
    mentionsLooping: /\b(loop|looping|same response|same thing|again and again|repeating)\b/.test(t),
    requestsAction: /\b(what should i do|next step|what now|how do i move forward|what can i do)\b/.test(t),
    celebratoryBuzz: /\b(amazing|awesome|incredible|fantastic|lets go|let's go|pumped)\b/.test(t),
    narrativeDensity: (t.match(/\b(and|because|when|after|before|then|while)\b/g) || []).length
  };
}

function basePayload() {
  return {
    ok: true,
    version: VERSION,
    mode: "REGULATED",
    source: "emotionRouteGuard",
    consumesLockedEmotion: true,
    strategyLocked: true,
    primaryEmotion: "neutral",
    secondaryEmotion: null,
    intensity: 0,
    valence: "mixed",
    confidence: 0,
    supportModeCandidate: "steady_assist",
    routeBias: "maintain",
    archetype: "clarify",
    nuanceProfile: {
      arousal: "medium",
      socialDirection: "mixed",
      timeOrientation: "present",
      controlState: "uncertain",
      conversationNeed: "clarify",
      followupStyle: "reflective",
      transitionReadiness: "medium",
      loopRisk: "medium",
      questionPressure: "medium",
      mirrorDepth: "medium"
    },
    conversationPlan: {
      openingStyle: "orienting",
      questionStyle: "narrowing",
      allowsActionShift: true,
      recommendedNextMove: "clarify"
    },
    supportFlags: {},
    routeHints: [],
    deliveryTone: "neutral_warm",
    downstream: {},
    expressionContract: {},
    input: {}
  };
}

function deriveValenceLabel(n) {
  if (typeof n === "string") return lower(n) || "mixed";
  if (Number(n) > 0.15) return "positive";
  if (Number(n) < -0.15) return "negative";
  return "mixed";
}

function deriveLoopRisk(primaryEmotion, intensity, signals, priorState) {
  let risk = intensity >= 0.8 ? "high" : intensity >= 0.45 ? "medium" : "low";
  if (signals.mentionsLooping) risk = "high";
  const prev = priorState && priorState.primaryEmotion ? lower(priorState.primaryEmotion) : "";
  if (prev && prev === lower(primaryEmotion) && intensity >= 0.6) risk = "high";
  return risk;
}

function deriveTransitionReadiness(primaryEmotion, intensity) {
  const e = lower(primaryEmotion);
  if (["panic", "fear", "grief", "sadness", "shame", "overwhelm"].includes(e)) return "low";
  if (intensity >= 0.75) return "low";
  if (["joy", "gratitude", "hope", "excitement"].includes(e)) return "high";
  return "medium";
}

function deriveConversationNeed(primaryEmotion) {
  const e = lower(primaryEmotion);
  if (["anxiety", "fear", "panic", "overwhelm"].includes(e)) return "ground";
  if (["sadness", "grief", "loneliness"].includes(e)) return "witness";
  if (["shame", "guilt"].includes(e)) return "repair";
  if (["confusion", "frustration"].includes(e)) return "clarify";
  if (["joy", "gratitude", "excitement", "hope"].includes(e)) return "channel";
  return "clarify";
}

function buildStrategyFromEmotion(lockedEmotion, signals, priorState) {
  const primaryEmotion = lower(lockedEmotion.primaryEmotion || "neutral");
  const base = EMOTION_STRATEGY_MAP[primaryEmotion] || EMOTION_STRATEGY_MAP.neutral;
  const intensity = clamp(Number(lockedEmotion.intensity) || 0, 0, 1);
  const valenceLabel = deriveValenceLabel(lockedEmotion.valenceLabel || lockedEmotion.valence);
  const archetype = ARCHETYPES[base.archetype] ? base.archetype : "clarify";
  const conversationNeed = deriveConversationNeed(primaryEmotion);
  const transitionReadiness = deriveTransitionReadiness(primaryEmotion, intensity);
  const loopRisk = deriveLoopRisk(primaryEmotion, intensity, signals, priorState);
  const questionPressure = base.questionPressure === "medium" && signals.asksForRelief ? "low" : base.questionPressure;

  const nuanceProfile = {
    arousal: intensity >= 0.75 ? "high" : intensity <= 0.25 ? "low" : "medium",
    socialDirection: ["loneliness", "gratitude", "joy"].includes(primaryEmotion) ? "relational" : "mixed",
    timeOrientation: ["fear", "anxiety", "hope", "excitement"].includes(primaryEmotion) ? "future" : "present",
    controlState: lockedEmotion.supportFlags && lockedEmotion.supportFlags.needsContainment ? "powerless" : intensity >= 0.7 ? "guarded" : "agentic",
    conversationNeed,
    followupStyle: ["clarify", "channel"].includes(archetype) ? "narrowing" : "reflective",
    transitionReadiness,
    loopRisk,
    questionPressure,
    mirrorDepth: ["sadness", "grief", "shame", "loneliness"].includes(primaryEmotion) ? "high" : "medium"
  };

  const routeHints = uniq([
    base.routeBias,
    conversationNeed,
    lockedEmotion.supportFlags && lockedEmotion.supportFlags.needsStabilization ? "stabilize_first" : null,
    lockedEmotion.supportFlags && lockedEmotion.supportFlags.needsClarification ? "clarify_scope" : null,
    signals.requestsAction ? "action_requested" : null,
    signals.isQuestion ? "answer_requested" : null,
    loopRisk === "high" ? "avoid_repetition" : null
  ]);

  return {
    primaryEmotion: lockedEmotion.primaryEmotion,
    secondaryEmotion: lockedEmotion.secondaryEmotion || null,
    intensity,
    valence: valenceLabel,
    confidence: clamp(Number(lockedEmotion.confidence) || 0, 0, 1),
    supportModeCandidate: base.supportMode,
    routeBias: base.routeBias,
    archetype,
    nuanceProfile,
    routeHints,
    deliveryTone: base.expressionTone,
    conversationPlan: {
      ...ARCHETYPES[archetype],
      recommendedNextMove: routeHints[0] || "maintain"
    }
  };
}

function buildExpressionContract(strategy, lockedEmotion) {
  return {
    emotionLocked: true,
    strategyLocked: true,
    primaryEmotion: lockedEmotion.primaryEmotion,
    secondaryEmotion: lockedEmotion.secondaryEmotion,
    intensity: lockedEmotion.intensity,
    valence: deriveValenceLabel(lockedEmotion.valenceLabel || lockedEmotion.valence),
    supportMode: strategy.supportModeCandidate,
    deliveryTone: strategy.deliveryTone,
    archetype: strategy.archetype,
    questionPressure: strategy.nuanceProfile.questionPressure,
    mirrorDepth: strategy.nuanceProfile.mirrorDepth,
    pacingBias: strategy.nuanceProfile.questionPressure === "none" ? "slow_grounding" : strategy.intensity >= 0.75 ? "slow_steady" : strategy.valence === "positive" ? "lifted_natural" : "natural_regulated"
  };
}

function analyzeEmotionRoute(input = {}, priorState = {}) {
  const payload = basePayload();
  const text = safeStr(input.text || input.userText || input.message || "");
  const lockedEmotion = input.lockedEmotion && typeof input.lockedEmotion === "object" ? input.lockedEmotion : null;
  if (!lockedEmotion || !lockedEmotion.locked) {
    return {
      ...payload,
      ok: false,
      error: "locked_emotion_required",
      input: { textLength: text.length, hasPriorState: !!priorState && Object.keys(priorState || {}).length > 0 }
    };
  }

  const signals = detectPresentationSignals(text);
  const strategy = buildStrategyFromEmotion(lockedEmotion, signals, priorState);

  payload.primaryEmotion = lockedEmotion.primaryEmotion;
  payload.secondaryEmotion = lockedEmotion.secondaryEmotion || null;
  payload.intensity = strategy.intensity;
  payload.valence = strategy.valence;
  payload.confidence = strategy.confidence;
  payload.supportModeCandidate = strategy.supportModeCandidate;
  payload.routeBias = strategy.routeBias;
  payload.archetype = strategy.archetype;
  payload.nuanceProfile = strategy.nuanceProfile;
  payload.conversationPlan = strategy.conversationPlan;
  payload.supportFlags = lockedEmotion.supportFlags || {};
  payload.routeHints = strategy.routeHints;
  payload.deliveryTone = strategy.deliveryTone;
  payload.expressionContract = buildExpressionContract(strategy, lockedEmotion);
  payload.input = { textLength: text.length, hasPriorState: !!priorState && Object.keys(priorState || {}).length > 0, consumedLockedEmotion: true };
  payload.presentationSignals = signals;
  payload.downstream = {
    affect: {
      useLockedEmotion: true,
      useStrategy: true,
      allowEmotionOverride: false,
      archetype: strategy.archetype,
      deliveryTone: strategy.deliveryTone
    },
    tts: {
      pacingBias: payload.expressionContract.pacingBias,
      caution: payload.supportFlags.needsContainment || payload.supportFlags.needsStabilization || false
    }
  };
  payload.mode = payload.supportFlags.highDistress ? "VULNERABLE" : strategy.valence === "positive" ? "POSITIVE" : "REGULATED";
  return payload;
}

const emotionRouteGuard = { version: VERSION, archetypes: ARCHETYPES, analyzeEmotionRoute };

module.exports = {
  VERSION,
  ARCHETYPES,
  analyzeEmotionRoute,
  emotionRouteGuard
};
