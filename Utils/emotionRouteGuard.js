"use strict";

const VERSION = "emotionRouteGuard v4.3.0 COHESION-HARDENED";

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
  depressed: { supportMode: "validate_and_hold", routeBias: "stabilize", archetype: "witness", questionPressure: "low", expressionTone: "soft_attuned" },
  grief: { supportMode: "validate_and_hold", routeBias: "stabilize", archetype: "witness", questionPressure: "low", expressionTone: "soft_attuned" },
  shame: { supportMode: "repair_and_soothe", routeBias: "repair", archetype: "repair", questionPressure: "low", expressionTone: "nonjudgmental_soft" },
  guilt: { supportMode: "repair_and_soothe", routeBias: "repair", archetype: "repair", questionPressure: "low", expressionTone: "nonjudgmental_soft" },
  loneliness: { supportMode: "attune_and_connect", routeBias: "deepen", archetype: "reconnect", questionPressure: "low", expressionTone: "warm_attuned" },
  confusion: { supportMode: "clarify_and_sequence", routeBias: "clarify", archetype: "clarify", questionPressure: "medium", expressionTone: "clear_measured" },
  frustration: { supportMode: "regulate_and_unblock", routeBias: "clarify", archetype: "clarify", questionPressure: "medium", expressionTone: "steady_direct" },
  anger: { supportMode: "regulate_and_redirect", routeBias: "stabilize", archetype: "boundary", questionPressure: "low", expressionTone: "firm_contained" },
  gratitude: { supportMode: "affirm_and_anchor", routeBias: "maintain", archetype: "celebrate", questionPressure: "medium", expressionTone: "warm_bright" },
  joy: { supportMode: "celebrate_and_anchor", routeBias: "maintain", archetype: "celebrate", questionPressure: "medium", expressionTone: "warm_bright" },
  calm: { supportMode: "steady_and_extend", routeBias: "maintain", archetype: "meaningMake", questionPressure: "medium", expressionTone: "soft_steady" },
  relief: { supportMode: "stabilize_and_anchor", routeBias: "maintain", archetype: "ground", questionPressure: "medium", expressionTone: "soft_steady" },
  excitement: { supportMode: "celebrate_and_channel", routeBias: "channel", archetype: "channel", questionPressure: "medium", expressionTone: "warm_bright" },
  hope: { supportMode: "steady_and_extend", routeBias: "channel", archetype: "meaningMake", questionPressure: "medium", expressionTone: "soft_steady" }
};

function safeStr(v) { return v == null ? "" : String(v); }
function lower(v) { return safeStr(v).toLowerCase(); }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function extractGuidedPrompt(input = {}) {
  const obj = isObj(input) ? input : {};
  const body = isObj(obj.body) ? obj.body : {};
  const payload = isObj(obj.payload) ? obj.payload : {};
  const gp = isObj(obj.guidedPrompt) ? obj.guidedPrompt : (isObj(payload.guidedPrompt) ? payload.guidedPrompt : {});
  return {
    label: safeStr(gp.label || obj.label || payload.label || body.label || "").trim(),
    text: safeStr(gp.text || obj.text || payload.text || body.text || "").trim(),
    domainHint: safeStr(gp.domainHint || obj.domainHint || payload.domainHint || body.domainHint || "").trim(),
    intentHint: safeStr(gp.intentHint || obj.intentHint || payload.intentHint || body.intentHint || "").trim(),
    emotionalHint: safeStr(gp.emotionalHint || obj.emotionalHint || payload.emotionalHint || body.emotionalHint || "").trim()
  };
}

function normalizeText(text) {
  return lower(text)
    .replace(/\bcan'?t\b/g, "cannot")
    .replace(/\bi'?m\b/g, "i am")
    .replace(/\bwon'?t\b/g, "will not")
    .replace(/[^a-z0-9?!' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectPresentationSignals(text) {
  const t = normalizeText(text);
  return {
    isQuestion: /\?/.test(text) || /\b(can you|could you|would you|should i|what do i|how do i|why do i|am i|is this|do you think)\b/.test(t),
    asksForHelp: /\b(help me|i need help|can you help|need support|stay with me|talk to me)\b/.test(t),
    asksForRelief: /\b(make it stop|i need this to stop|get me out of this|calm me down|help me breathe)\b/.test(t),
    hasContrast: /\b(but|though|except|yet)\b/.test(t),
    hasUncertainty: /\b(maybe|i guess|not sure|i think|possibly|kind of|sort of)\b/.test(t),
    mentionsLooping: /\b(loop|looping|same response|same thing|again and again|repeating|stuck in this|spiral|spiraling|spiralling)\b/.test(t),
    requestsAction: /\b(what should i do|next step|what now|how do i move forward|what can i do)\b/.test(t),
    celebratoryBuzz: /\b(amazing|awesome|incredible|fantastic|lets go|let's go|pumped)\b/.test(t),
    referencesSelfHarm: /\b(cannot go on|can't go on|want to die|kill myself|hurt myself|suicide|self harm|end it all)\b/.test(t),
    referencesIsolation: /\b(alone|nobody|isolated|disconnected|no one)\b/.test(t),
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
    emotionCluster: "informational",
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
    input: {},
    presentationSignals: {},
    diagnostics: {}
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
  if (priorState && Number(priorState.repeatCount || 0) >= 2) risk = "high";
  return risk;
}

function deriveTransitionReadiness(primaryEmotion, intensity) {
  const e = lower(primaryEmotion);
  if (["panic", "fear", "grief", "sadness", "shame", "overwhelm", "depressed"].includes(e)) return "low";
  if (intensity >= 0.75) return "low";
  if (["joy", "gratitude", "hope", "excitement", "relief"].includes(e)) return "high";
  return "medium";
}

function deriveConversationNeed(primaryEmotion) {
  const e = lower(primaryEmotion);
  if (["anxiety", "fear", "panic", "overwhelm"].includes(e)) return "ground";
  if (["sadness", "grief", "loneliness", "depressed"].includes(e)) return "witness";
  if (["shame", "guilt"].includes(e)) return "repair";
  if (["confusion", "frustration"].includes(e)) return "clarify";
  if (["joy", "gratitude", "excitement", "hope", "relief"].includes(e)) return "channel";
  return "clarify";
}

function deriveEmotionCluster(primaryEmotion) {
  const e = lower(primaryEmotion);
  if (["depressed", "sadness", "grief", "loneliness"].includes(e)) return "withdrawal";
  if (["anxiety", "fear", "panic", "overwhelm"].includes(e)) return "activation";
  if (["anger", "frustration"].includes(e)) return "defense";
  if (["joy", "gratitude", "relief", "excitement", "hope"].includes(e)) return "approach";
  if (["shame", "guilt"].includes(e)) return "repair";
  return "informational";
}

function buildExpressionContract(strategy, lockedEmotion) {
  const supportMode = safeStr(strategy.supportModeCandidate);
  const questionPressure = safeStr(strategy.nuanceProfile?.questionPressure || "medium");
  const askAtMost = questionPressure === "none" ? 0 : 1;
  return {
    pacingBias: /ground|hold|stabilize/.test(supportMode) ? "slow" : "steady",
    askAtMost,
    mirrorIntensity: false,
    tone: strategy.deliveryTone,
    allowActionShift: !!strategy.conversationPlan.allowsActionShift,
    containment: !!lockedEmotion.supportFlags?.needsContainment,
    suppressMenus: !!(lockedEmotion.supportFlags?.needsContainment || lockedEmotion.supportFlags?.crisis),
    prefersSingleTurnStability: !!(lockedEmotion.supportFlags?.highDistress || questionPressure === "none")
  };
}

function buildStrategyFromEmotion(lockedEmotion, signals, priorState, guidedPrompt) {
  const primaryEmotion = lower(lockedEmotion.primaryEmotion || "neutral");
  const template = EMOTION_STRATEGY_MAP[primaryEmotion] || EMOTION_STRATEGY_MAP.neutral;
  const archetype = ARCHETYPES[template.archetype] || ARCHETYPES.clarify;
  const intensity = Number(lockedEmotion.intensity || 0);
  const supportFlags = lockedEmotion.supportFlags || {};
  const questionPressure = supportFlags.crisis || supportFlags.preferNoQuestion ? "none" : template.questionPressure;
  return {
    primaryEmotion,
    intensity,
    confidence: Number(lockedEmotion.confidence || 0.75),
    valence: deriveValenceLabel(lockedEmotion.valence),
    supportModeCandidate: template.supportMode,
    routeBias: supportFlags.crisis ? "contain" : template.routeBias,
    archetype: template.archetype,
    emotionCluster: deriveEmotionCluster(primaryEmotion),
    deliveryTone: template.expressionTone,
    nuanceProfile: {
      arousal: intensity >= 0.75 ? "high" : intensity >= 0.4 ? "medium" : "low",
      socialDirection: primaryEmotion === "loneliness" || signals.referencesIsolation ? "seek_connection" : "mixed",
      timeOrientation: "present",
      controlState: supportFlags.highDistress ? "fragile" : "uncertain",
      conversationNeed: deriveConversationNeed(primaryEmotion),
      followupStyle: archetype.questionStyle,
      transitionReadiness: deriveTransitionReadiness(primaryEmotion, intensity),
      loopRisk: deriveLoopRisk(primaryEmotion, intensity, signals, priorState),
      questionPressure,
      mirrorDepth: supportFlags.highDistress ? "low" : "medium"
    },
    conversationPlan: {
      openingStyle: archetype.openingStyle,
      questionStyle: archetype.questionStyle,
      allowsActionShift: supportFlags.crisis ? false : archetype.allowsActionShift,
      recommendedNextMove: supportFlags.crisis ? "contain" : template.routeBias
    },
    routeHints: [guidedPrompt.domainHint, guidedPrompt.intentHint, guidedPrompt.emotionalHint].filter(Boolean)
  };
}

function inferPrimaryEmotionFromText(text) {
  if (/\b(depressed|empty|numb|hopeless|cannot get up)\b/.test(text)) return "depressed";
  if (/\b(grief|grieving|heartbroken|mourning)\b/.test(text)) return "grief";
  if (/\b(sad|down|low)\b/.test(text)) return "sadness";
  if (/\b(panic|panicking)\b/.test(text)) return "panic";
  if (/\b(anxious|worried|overwhelmed|spiraling|spiralling)\b/.test(text)) return "anxiety";
  if (/\b(afraid|terrified|scared)\b/.test(text)) return "fear";
  if (/\b(shame|ashamed|embarrassed)\b/.test(text)) return "shame";
  if (/\b(guilty|guilt|my fault)\b/.test(text)) return "guilt";
  if (/\b(alone|lonely|isolated|disconnected)\b/.test(text)) return "loneliness";
  if (/\b(confused|unclear|mixed up)\b/.test(text)) return "confusion";
  if (/\b(angry|furious|pissed)\b/.test(text)) return "anger";
  if (/\b(frustrated|blocked|stuck)\b/.test(text)) return "frustration";
  if (/\b(grateful|thankful)\b/.test(text)) return "gratitude";
  if (/\b(happy|great|good|glad|joy)\b/.test(text)) return "joy";
  if (/\b(relieved)\b/.test(text)) return "relief";
  if (/\b(excited|pumped)\b/.test(text)) return "excitement";
  if (/\b(hopeful|maybe this can work|there is a chance)\b/.test(text)) return "hope";
  if (/\b(calm|steady|settled)\b/.test(text)) return "calm";
  return "neutral";
}

function _extractLockedEmotionSource(input = {}) {
  if (isObj(input.lockedEmotion)) return input.lockedEmotion;
  if (isObj(input.emotion)) return input.emotion;
  if (isObj(input.marion_handoff) && isObj(input.marion_handoff.locked_emotion)) return input.marion_handoff.locked_emotion;
  if (isObj(input.analysis) && isObj(input.analysis.lockedEmotion)) return input.analysis.lockedEmotion;
  return input;
}

function normalizeLockedEmotion(input = {}) {
  const src = _extractLockedEmotionSource(input);
  const text = normalizeText(
    input.text || input.message || src.text || (isObj(input.guidedPrompt) ? input.guidedPrompt.text : "") || ""
  );
  let primary = lower(src.primaryEmotion || src.primary || src.dominantEmotion || "");
  if (!primary) primary = inferPrimaryEmotionFromText(text);

  const supportFlags = isObj(src.supportFlags) ? { ...src.supportFlags } : {};
  if (["depressed", "sadness", "grief", "loneliness", "shame", "guilt"].includes(primary)) {
    supportFlags.needsContainment = supportFlags.needsContainment || /\b(depressed|hopeless|empty|numb|ashamed|guilty|alone)\b/.test(text);
    supportFlags.highDistress = supportFlags.highDistress || /\b(depressed|hopeless|empty|cannot cope|numb)\b/.test(text);
  }
  if (/\b(cannot go on|can't go on|want to die|kill myself|hurt myself|suicide|self harm|end it all)\b/.test(text)) {
    supportFlags.crisis = true;
    supportFlags.highDistress = true;
    supportFlags.needsContainment = true;
    supportFlags.needsStabilization = true;
  }
  if (["anxiety", "fear", "panic", "overwhelm"].includes(primary)) supportFlags.needsStabilization = true;
  if (["panic", "grief", "depressed"].includes(primary)) supportFlags.preferNoQuestion = true;
  if (["joy", "gratitude", "relief", "excitement", "hope"].includes(primary)) supportFlags.canChannelForward = true;

  const intensity = clamp(
    src.intensity != null
      ? src.intensity
      : (supportFlags.crisis ? 0.95 : supportFlags.highDistress ? 0.85 : supportFlags.needsStabilization ? 0.72 : 0.5),
    0,
    1
  );

  return {
    primaryEmotion: primary,
    secondaryEmotion: safeStr(src.secondaryEmotion || src.secondary || "").toLowerCase() || null,
    intensity,
    valence: typeof src.valence === "number" || typeof src.valence === "string"
      ? src.valence
      : (["joy", "gratitude", "relief", "excitement", "hope", "calm"].includes(primary) ? 0.6 : ["neutral", "confusion"].includes(primary) ? 0 : -0.6),
    confidence: clamp(src.confidence != null ? src.confidence : 0.8, 0, 1),
    supportFlags
  };
}

function analyzeEmotionRoute(input = {}) {
  const payload = basePayload();
  const text = safeStr(input.text || input.message || (isObj(input.guidedPrompt) ? input.guidedPrompt.text : "") || "");
  const priorState = isObj(input.session) ? input.session : (isObj(input.priorState) ? input.priorState : {});
  const lockedEmotion = normalizeLockedEmotion(input);
  const signals = detectPresentationSignals(text);
  const guidedPrompt = extractGuidedPrompt(input);
  const strategy = buildStrategyFromEmotion(lockedEmotion, signals, priorState, guidedPrompt);

  payload.primaryEmotion = lockedEmotion.primaryEmotion;
  payload.secondaryEmotion = lockedEmotion.secondaryEmotion || null;
  payload.intensity = strategy.intensity;
  payload.valence = strategy.valence;
  payload.confidence = strategy.confidence;
  payload.supportModeCandidate = strategy.supportModeCandidate;
  payload.routeBias = strategy.routeBias;
  payload.archetype = strategy.archetype;
  payload.emotionCluster = strategy.emotionCluster;
  payload.nuanceProfile = strategy.nuanceProfile;
  payload.conversationPlan = strategy.conversationPlan;
  payload.supportFlags = lockedEmotion.supportFlags || {};
  payload.routeHints = strategy.routeHints;
  payload.deliveryTone = strategy.deliveryTone;
  payload.expressionContract = buildExpressionContract(strategy, lockedEmotion);
  payload.input = {
    textLength: text.length,
    hasPriorState: !!priorState && Object.keys(priorState || {}).length > 0,
    consumedLockedEmotion: true,
    guidedPromptSeen: !!(guidedPrompt.label || guidedPrompt.text || guidedPrompt.domainHint || guidedPrompt.intentHint || guidedPrompt.emotionalHint)
  };
  payload.presentationSignals = signals;
  payload.downstream = {
    affect: {
      useLockedEmotion: true,
      useStrategy: true,
      allowEmotionOverride: false,
      archetype: strategy.archetype,
      deliveryTone: strategy.deliveryTone,
      emotionCluster: strategy.emotionCluster,
      supportModeCandidate: strategy.supportModeCandidate
    },
    chat: {
      supportFirst: !!(payload.supportFlags.crisis || payload.supportFlags.highDistress),
      shouldSuppressClarifier: payload.expressionContract.askAtMost === 0,
      questionPressure: payload.nuanceProfile.questionPressure,
      routeBias: payload.routeBias
    },
    tts: {
      pacingBias: payload.expressionContract.pacingBias,
      caution: payload.supportFlags.needsContainment || payload.supportFlags.needsStabilization || false,
      suppressExpressiveEscalation: !!payload.supportFlags.highDistress,
      tone: payload.deliveryTone
    },
    stateSpine: {
      emotionPrimary: payload.primaryEmotion,
      emotionSecondary: payload.secondaryEmotion,
      emotionCluster: payload.emotionCluster,
      emotionSupportMode: payload.supportModeCandidate,
      emotionArchetype: payload.archetype,
      emotionNeedSoft: !!payload.supportFlags.highDistress,
      emotionNeedCrisis: !!payload.supportFlags.crisis,
      emotionShouldSuppressMenus: !!(payload.supportFlags.needsContainment || payload.supportFlags.crisis),
      transitionReadiness: payload.nuanceProfile.transitionReadiness,
      loopRisk: payload.nuanceProfile.loopRisk
    },
    supportResponse: {
      preferredQuestionCount: payload.expressionContract.askAtMost,
      supportModeCandidate: payload.supportModeCandidate,
      routeBias: payload.routeBias,
      questionPressure: payload.nuanceProfile.questionPressure,
      openingStyle: payload.conversationPlan.openingStyle,
      questionStyle: payload.conversationPlan.questionStyle
    }
  };
  payload.mode = payload.supportFlags.crisis
    ? "CRISIS"
    : payload.supportFlags.highDistress
      ? "VULNERABLE"
      : strategy.valence === "positive"
        ? "POSITIVE"
        : "REGULATED";
  payload.diagnostics = {
    normalizedFrom: isObj(input.lockedEmotion)
      ? "lockedEmotion"
      : isObj(input.emotion)
        ? "emotion"
        : isObj(input.marion_handoff) && isObj(input.marion_handoff.locked_emotion)
          ? "marion_handoff.locked_emotion"
          : "input",
    priorStateEmotion: lower(priorState.primaryEmotion || ""),
    inferredSignals: Object.keys(signals).filter((key) => !!signals[key])
  };
  return payload;
}

const emotionRouteGuard = { version: VERSION, archetypes: ARCHETYPES, analyzeEmotionRoute };

module.exports = {
  VERSION,
  ARCHETYPES,
  analyzeEmotionRoute,
  analyze: analyzeEmotionRoute,
  emotionRouteGuard,
  extractGuidedPrompt,
  normalizeLockedEmotion,
  detectPresentationSignals
};
