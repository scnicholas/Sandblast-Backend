"use strict";

/**
 * Utils/supportResponse.js
 *
 * NON-CLINICAL supportive response generator for Nyx / Marion / SiteBridge.
 *
 * PURPOSE
 * - Consume richer emotionRouteGuard payloads cleanly.
 * - Generate calm, structured, emotionally coherent replies.
 * - Support distress, recovery, positive reinforcement, and mixed states.
 * - Remain fail-open safe and lightweight.
 *
 * DESIGN GOALS
 * - Non-clinical / therapist-adjacent only
 * - No diagnosis / no licensure claims
 * - Crisis-safe short-form escalation language
 * - Structured enough for operational intelligence layering
 * - Deterministic-ish phrasing by seed to reduce jitter / looping
 *
 * PHASE ALIGNMENT
 * ------------------------------------------------------------
 * Phase 01: Emotional payload intake
 * Phase 02: Crisis / high-risk gating
 * Phase 03: Dominant emotion interpretation
 * Phase 04: Valence-aware reflection
 * Phase 05: Intensity-aware pacing
 * Phase 06: Positive reinforcement shaping
 * Phase 07: Distress reinforcement shaping
 * Phase 08: Recovery signal acknowledgment
 * Phase 09: Contradiction / mixed-state handling
 * Phase 10: Continuity-safe wording
 * Phase 11: Tone recommendation execution
 * Phase 12: Support disclaimer cadence
 * Phase 13: Actionable micro-step generation
 * Phase 14: Gentle next-question generation
 * Phase 15: Fail-open integrity
 */

const VERSION = "supportResponse v1.7.0 SEMANTIC-VARIATION LOOP-HARDEN";

const DEFAULT_CONFIG = {
  includeDisclaimerOnSoft: false,
  includeDisclaimerOnCrisis: false,
  includeDisclaimerOnEveryTurn: false,
  maxQuestionCount: 1,
  maxMicroSteps: 1,
  keepCrisisShort: true,
  suppressQuestionOnTechnical: true,
  suppressQuestionOnRecovery: true,
  supportLockTurns: 2,
  suppressChipsOnSupport: true,
  suppressChipsOnTechnical: true,
  debug: false
};

function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}

function isPlainObject(x) {
  return !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype ||
      Object.getPrototypeOf(x) === null);
}

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}

function oneLine(s) {
  return safeStr(s).replace(/\s+/g, " ").trim();
}

function uniq(arr) {
  return [...new Set((Array.isArray(arr) ? arr : []).map((x) => safeStr(x).trim()).filter(Boolean))];
}

function lower(v) {
  return safeStr(v).toLowerCase();
}

function normalizeNuanceProfile(nuance) {
  const n = isPlainObject(nuance) ? nuance : {};
  const uniqSafe = (arr, fallback = []) => uniq(Array.isArray(arr) ? arr : fallback);
  return {
    arousal: safeStr(n.arousal || 'medium').toLowerCase(),
    socialDirection: safeStr(n.socialDirection || 'mixed').toLowerCase(),
    timeOrientation: safeStr(n.timeOrientation || 'present').toLowerCase(),
    controlState: safeStr(n.controlState || 'uncertain').toLowerCase(),
    conversationNeed: safeStr(n.conversationNeed || 'clarify').toLowerCase(),
    followupStyle: safeStr(n.followupStyle || 'reflective').toLowerCase(),
    transitionReadiness: safeStr(n.transitionReadiness || 'medium').toLowerCase(),
    loopRisk: safeStr(n.loopRisk || 'medium').toLowerCase(),
    archetype: safeStr(n.archetype || 'clarify').toLowerCase(),
    fallbackArchetype: safeStr(n.fallbackArchetype || 'ground').toLowerCase(),
    questionPressure: safeStr(n.questionPressure || 'medium').toLowerCase(),
    mirrorDepth: safeStr(n.mirrorDepth || 'medium').toLowerCase(),
    transitionTargets: uniqSafe(n.transitionTargets, ['clarify']),
    antiLoopShift: safeStr(n.antiLoopShift || 'shift_to_grounding_after_two_similar_turns').toLowerCase()
  };
}

function normalizeConversationPlan(plan) {
  const p = isPlainObject(plan) ? plan : {};
  return {
    primaryArchetype: safeStr(p.primaryArchetype || '').toLowerCase(),
    fallbackArchetype: safeStr(p.fallbackArchetype || '').toLowerCase(),
    askAllowed: p.askAllowed === false ? false : true,
    questionStyle: safeStr(p.questionStyle || '').toLowerCase(),
    questionPressure: safeStr(p.questionPressure || '').toLowerCase(),
    mirrorDepth: safeStr(p.mirrorDepth || '').toLowerCase(),
    shouldSuppressMenus: !!p.shouldSuppressMenus,
    shouldPreferReflection: !!p.shouldPreferReflection,
    shouldDelaySolutioning: !!p.shouldDelaySolutioning,
    recommendedDepth: safeStr(p.recommendedDepth || '').toLowerCase(),
    antiLoopShift: safeStr(p.antiLoopShift || '').toLowerCase(),
    transitionTargets: uniq(p.transitionTargets),
    conversationNeed: safeStr(p.conversationNeed || '').toLowerCase(),
    followupStyle: safeStr(p.followupStyle || '').toLowerCase(),
    allowsActionShift: !!p.allowsActionShift,
    expressionStyle: safeStr(p.expressionStyle || '').toLowerCase(),
    deliveryTone: safeStr(p.deliveryTone || '').toLowerCase(),
    semanticFrame: safeStr(p.semanticFrame || '').toLowerCase(),
    responseFamily: safeStr(p.responseFamily || '').toLowerCase()
  };
}


function normalizePresentationProfile(src) {
  const s = isPlainObject(src) ? src : {};
  return {
    expressionStyle: safeStr(s.expressionStyle || '').toLowerCase(),
    deliveryTone: safeStr(s.deliveryTone || '').toLowerCase(),
    semanticFrame: safeStr(s.semanticFrame || '').toLowerCase(),
    priorResponseFamily: safeStr(s.priorResponseFamily || '').toLowerCase(),
    lastOpeningFamily: safeStr(s.lastOpeningFamily || '').toLowerCase(),
    lastQuestionStyle: safeStr(s.lastQuestionStyle || '').toLowerCase(),
    sameResponseFamilyCount: clampInt(s.sameResponseFamilyCount, 0, 0, 99),
    presentationSignals: isPlainObject(s.presentationSignals) ? s.presentationSignals : {}
  };
}

const OPENING_VARIANTS = {
  warm_affirmation: [
    'I can feel the lift in that.',
    'That lands with real warmth.',
    'There is a genuine positive signal in what you just said.',
    'That feels good in a grounded way.',
    'I can hear something bright and real in that.',
    'That has a healthy kind of lift to it.',
    'There is real life in that line.',
    'That sounds like a good moment landing cleanly.',
    'That carries a steady kind of good energy.',
    'I can hear the positive charge in that.'
  ],
  warm_celebration: [
    'That is a beautiful thing to hear.',
    'Now that has some shine on it.',
    'That deserves a real smile.',
    'There is some strong good energy in that.',
    'That feels like a win worth noticing.',
    'I like the lift in that.',
    'That lands like a real bright spot.',
    'There is a lot of life in that one.',
    'That sounds genuinely exciting.',
    'That has celebration energy in it.'
  ],
  grounded_reinforcement: [
    'That sounds steady in a good way.',
    'I hear a more solid footing there.',
    'That has a grounded kind of relief to it.',
    'That sounds like something settling into place.',
    'There is steadiness in that.',
    'That feels more anchored than fleeting.',
    'I can hear the exhale in that.',
    'That has a stabilizing quality to it.',
    'That sounds like things easing into alignment.',
    'There is real ground under that feeling.'
  ],
  reflective_mirroring: [
    'There is something quietly beautiful in that.',
    'That lands like a soft observation with feeling inside it.',
    'I can hear the reflective quality in that.',
    'That feels more like noticing than announcing.',
    'There is a gentle kind of appreciation in that.',
    'That has a thoughtful softness to it.',
    'It sounds like you are taking in the moment, not just naming it.',
    'That feels almost scenic in the way you said it.',
    'There is real texture in that observation.',
    'That carries a calm kind of wonder.'
  ],
  earned_affirmation: [
    'That sounds earned.',
    'You get to take credit for that.',
    'That was not luck — that was you showing up well.',
    'There is real earned pride in that.',
    'That sounds like you delivered.',
    'You have every right to feel good about that.',
    'That has accomplishment written all over it.',
    'That sounds like a clean win.',
    'There is substance behind that good feeling.',
    'That sounds deserved.'
  ],
  purpose_alignment: [
    'That has real alignment in it.',
    'That sounds like your work is meeting something true in you.',
    'There is a deeper fit in that statement.',
    'That lands like purpose, not just a passing high.',
    'That sounds like the kind of work connection people hope to find.',
    'There is something deeply right-sized about that for you.',
    'That feels like identity and work are pulling in the same direction.',
    'That sounds meaningful in a lasting way.',
    'There is a rare steadiness in loving what you do like that.',
    'That carries purpose energy, not just productivity.'
  ],
  gentle_presence: [
    'I am here with you.',
    'I am staying with this with you.',
    'I hear you clearly.',
    'I am with you in this moment.',
    'You do not have to force it here.',
    'We can stay with this gently.',
    'I am right here with you.',
    'You do not need to carry this alone in here.',
    'I am tracking with you.',
    'We can hold this steadily.'
  ]
};

const VALIDATION_VARIANTS = {
  positive_anchor: [
    'It is worth recognizing instead of brushing past.',
    'That deserves to be noticed.',
    'There is something solid in that.',
    'That is not trivial — that matters.',
    'I would not minimize that signal.',
    'That is worth anchoring while it is here.',
    'That has real value in it.',
    'There is something healthy to preserve there.'
  ],
  positive_extension: [
    'That can be built on.',
    'There is room to carry that forward.',
    'That kind of signal can turn into momentum.',
    'That is the sort of thing worth extending.',
    'That can become a stronger pattern if you protect it.',
    'There is a next layer available inside that.',
    'That can travel further than one moment.',
    'That is the kind of energy worth using well.'
  ],
  reflective_positive: [
    'The way you said it tells me this is not just surface-level positivity.',
    'There is some meaning in that, not just a passing good mood.',
    'That feels deeper than a quick upbeat moment.',
    'There is texture in that positive signal.',
    'That sounds felt, not performative.',
    'There is some quiet truth in that.',
    'That feels integrated, not just excited.',
    'There is a real inner signal there.'
  ],
  gentle_validation: [
    'It makes sense that this matters to you.',
    'That is a human response, not a flaw.',
    'You are not overreacting just because it is vivid.',
    'What you are feeling tracks.',
    'That lands as real to me.',
    'There is nothing strange about reacting that way.',
    'That fits the weight of what you are carrying.',
    'It makes sense that it would hit like that.'
  ]
};

const FOLLOWUP_STYLES = {
  reflective: [
    'What part of that feels most alive to you?',
    'What about that stands out the most from the inside?',
    'What is the strongest thread in that feeling?',
    'Where does that land for you most clearly?',
    'What feels most true in that right now?',
    'What part of that do you want to stay with a little longer?'
  ],
  grounding: [
    'What would help you keep this steady for the next little while?',
    'What is one thing that would make the next stretch feel more grounded?',
    'What would help settle this into something stable?',
    'What keeps this from slipping away too fast?',
    'What helps your footing stay under you here?',
    'What would make this easier to hold onto calmly?'
  ],
  action_step: [
    'What is one next move that fits this energy well?',
    'How do you want to use this momentum?',
    'What is the next concrete step from here?',
    'What can you do next that matches this signal?',
    'Where do you want to put this energy?',
    'What is the cleanest next move you can make?' 
  ],
  meaning_making: [
    'What do you think this says about what matters to you?',
    'What meaning do you want to take from that?',
    'What does this moment reveal about where you are headed?',
    'What does that tell you about yourself or your life right now?',
    'What feels important about this beyond the surface?',
    'What are you learning from the shape of that feeling?'
  ],
  narrowing: [
    'Which part matters most right now?',
    'What is the clearest piece of that?',
    'If you narrow it down, what is the main thing?',
    'What is the one part you want to focus on first?',
    'What is most important inside that?',
    'What is the cleanest focal point here?'
  ],
  supportive: [
    'Do you want me to stay with the feeling, or help you turn it into a next step?',
    'Would it help more to reflect it back, or move with it?',
    'Do you want to deepen this, or make it practical?',
    'Should we sit with it a moment longer, or build on it?',
    'Do you want warmth, clarity, or motion from me next?',
    'Would it help if I mirrored it more, or sharpened it into action?'
  ]
};

const QUESTION_STYLE_VARIANTS = {
  gentle_reflective: FOLLOWUP_STYLES.reflective,
  grounding: FOLLOWUP_STYLES.grounding,
  execution: FOLLOWUP_STYLES.action_step,
  extension: FOLLOWUP_STYLES.action_step,
  integrative: FOLLOWUP_STYLES.meaning_making,
  narrowing: FOLLOWUP_STYLES.narrowing,
  connection_or_meaning: FOLLOWUP_STYLES.meaning_making,
  small_next_step: FOLLOWUP_STYLES.action_step,
  action_gate: FOLLOWUP_STYLES.action_step,
  supportive: FOLLOWUP_STYLES.supportive,
  default: FOLLOWUP_STYLES.supportive
};

function rotateChoice(list, seed, avoid) {
  const arr = Array.isArray(list) ? list.filter(Boolean) : [];
  if (!arr.length) return '';
  const primary = pick(arr, seed);
  if (!avoid || primary !== avoid || arr.length === 1) return primary;
  const idx = arr.indexOf(primary);
  return arr[(idx + 1) % arr.length] || primary;
}

function determineResponseFamily(emo, layer, presentation) {
  const semanticFrame = presentation.semanticFrame || safeStr(emo.conversationPlan.semanticFrame || '').toLowerCase();
  const expressionStyle = presentation.expressionStyle || safeStr(emo.conversationPlan.expressionStyle || '').toLowerCase();
  if (emo.valence === 'negative' || emo.supportFlags.highDistress) return 'gentle_presence';
  if (semanticFrame.includes('purpose') || expressionStyle === 'purpose_work_affirmation') return 'purpose_alignment';
  if (semanticFrame.includes('achievement') || expressionStyle === 'achievement_statement') return 'earned_affirmation';
  if (semanticFrame.includes('aesthetic') || semanticFrame.includes('awe') || expressionStyle === 'poetic_observation') return 'reflective_mirroring';
  if (semanticFrame.includes('recovery') || expressionStyle === 'recovery_statement') return 'grounded_reinforcement';
  if (expressionStyle === 'celebratory_burst') return 'warm_celebration';
  if (semanticFrame.includes('grounded_positive') || semanticFrame.includes('life_appraisal')) return 'grounded_reinforcement';
  return 'warm_affirmation';
}

function determineValidationFamily(emo, presentation) {
  if (emo.valence === 'negative' || emo.supportFlags.highDistress) return 'gentle_validation';
  if ((presentation.expressionStyle || '').includes('poetic') || (presentation.semanticFrame || '').includes('aesthetic') || (presentation.semanticFrame || '').includes('awe')) return 'reflective_positive';
  if ((presentation.expressionStyle || '').includes('recovery') || (presentation.semanticFrame || '').includes('recovery')) return 'positive_anchor';
  if ((presentation.expressionStyle || '').includes('purpose') || (presentation.semanticFrame || '').includes('purpose')) return 'reflective_positive';
  if ((presentation.expressionStyle || '').includes('celebratory') || (presentation.expressionStyle || '').includes('achievement')) return 'positive_extension';
  return 'positive_anchor';
}

function chooseOpeningVariant(emo, layer, presentation, seed) {
  const family = determineResponseFamily(emo, layer, presentation);
  const line = rotateChoice(OPENING_VARIANTS[family] || OPENING_VARIANTS.warm_affirmation, `${seed}|opening|${family}`, presentation.lastOpeningFamily);
  return { family, line };
}

function chooseValidationVariant(emo, presentation, seed) {
  const family = determineValidationFamily(emo, presentation);
  const line = rotateChoice(VALIDATION_VARIANTS[family] || VALIDATION_VARIANTS.positive_anchor, `${seed}|validation|${family}`, presentation.priorResponseFamily);
  return { family, line };
}

function chooseFollowupVariant(emo, layer, presentation, seed) {
  const key = safeStr(layer.followupStyle || layer.conversationNeed || 'supportive').toLowerCase();
  const family = FOLLOWUP_STYLES[key] ? key : 'supportive';
  const line = rotateChoice(FOLLOWUP_STYLES[family], `${seed}|followup|${family}`, presentation.lastQuestionStyle);
  return { family, line };
}

function chooseQuestionVariant(emo, layer, presentation, seed) {
  const style = safeStr(emo.conversationPlan.questionStyle || layer.followupStyle || 'default').toLowerCase();
  const family = QUESTION_STYLE_VARIANTS[style] ? style : 'default';
  const line = rotateChoice(QUESTION_STYLE_VARIANTS[family], `${seed}|question|${family}`, presentation.lastQuestionStyle);
  return { family, line };
}

function emotionAny(emo, list) {
  const set = new Set((Array.isArray(list) ? list : []).map((x) => lower(x)));
  const vals = [
    emo?.primaryEmotion,
    emo?.secondaryEmotion,
    emo?.dominantEmotion
  ].map((x) => lower(x)).filter(Boolean);
  return vals.some((v) => set.has(v));
}

function emotionClusterIs(emo, list) {
  const set = new Set((Array.isArray(list) ? list : []).map((x) => lower(x)));
  return set.has(lower(emo?.emotionCluster));
}

function hashSeed(seed) {
  let h = 0;
  const s = safeStr(seed || "nyx");
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

function pick(arr, seed) {
  if (!Array.isArray(arr) || !arr.length) return "";
  const h = hashSeed(seed);
  return safeStr(arr[h % arr.length] || "");
}

function pickN(arr, seed, maxCount) {
  const a = Array.isArray(arr) ? arr.slice() : [];
  const out = [];
  if (!a.length || maxCount <= 0) return out;

  let h = hashSeed(seed);
  const seen = new Set();

  for (let i = 0; i < a.length && out.length < maxCount; i++) {
    const idx = (h + i) % a.length;
    const val = safeStr(a[idx] || "").trim();
    if (!val) continue;
    if (seen.has(val)) continue;
    seen.add(val);
    out.push(val);
  }

  return out;
}

function joinSentences(parts) {
  return (Array.isArray(parts) ? parts : [])
    .map((p) => oneLine(p))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksTechnicalRequest(text) {
  const s = safeStr(text).toLowerCase();
  if (!s) return false;
  return /(chat engine|state spine|support response|loop|looping|debug|debugging|patch|update|rebuild|restructure|integrate|implementation|code|script|file|tts|api|route|backend)/.test(s);
}

function shouldSupportLock(emo, userText, cfg) {
  const technical = looksTechnicalRequest(userText);
  if (technical) return false;
  if (!emo || !isPlainObject(emo)) return false;
  if (emo.supportFlags.crisis) return true;
  if (emo.supportFlags.highDistress) return true;
  if (emo.bypassClarify) return true;
  if (emo.fallbackSuppression || emo.needsNovelMove || emo.routeExhaustion) return true;
  if (emo.valence === "negative" || emo.valence === "mixed") return true;
  if (emo.supportFlags.needsGentlePacing || emo.supportFlags.needsContainment || emo.supportFlags.needsConnection) return true;
  if (emotionAny(emo, ["sadness", "grief", "hurt", "loneliness", "lonely", "isolation", "despair", "helplessness", "anxiety", "fear", "shame"])) return true;
  return !!cfg.supportLockTurns;
}

function buildConversationLayerMeta(emo, userText, cfg, input = {}) {
  const technical = looksTechnicalRequest(userText);
  const supportLock = shouldSupportLock(emo, userText, cfg);
  const plan = normalizeConversationPlan(emo.conversationPlan);
  const nuance = normalizeNuanceProfile(emo.nuanceProfile);
  const presentation = normalizePresentationProfile({
    expressionStyle: emo.expressionStyle || plan.expressionStyle,
    deliveryTone: emo.deliveryTone || plan.deliveryTone,
    semanticFrame: emo.semanticFrame || plan.semanticFrame,
    priorResponseFamily: input.priorResponseFamily || input.lastResponseFamily || '',
    lastOpeningFamily: input.lastOpeningFamily || '',
    lastQuestionStyle: input.lastQuestionStyle || '',
    sameResponseFamilyCount: input.sameResponseFamilyCount || 0,
    presentationSignals: emo.presentationSignals || {}
  });
  const recommendedTurns = nuance.transitionReadiness === "low"
    ? Math.max(2, clampInt(cfg.supportLockTurns, 2, 1, 4))
    : clampInt(cfg.supportLockTurns, 2, 1, 4);

  return {
    supportLock,
    supportLockTurns: supportLock ? recommendedTurns : 0,
    suppressChips: technical
      ? !!cfg.suppressChipsOnTechnical
      : (supportLock ? true : !!plan.shouldSuppressMenus || !!cfg.suppressChipsOnSupport),
    suppressLaneRouting: technical ? !!cfg.suppressChipsOnTechnical : (supportLock || !!plan.shouldSuppressMenus),
    followupStyle: technical
      ? "none"
      : safeStr(plan.followupStyle || nuance.followupStyle || (supportLock ? "supportive" : "default"), 40) || "default",
    conversationDepth: technical
      ? "technical"
      : safeStr(plan.recommendedDepth || (supportLock ? "deep_support" : "standard"), 40) || "standard",
    askAllowed: technical ? false : !!plan.askAllowed && !emo.supportFlags.delayQuestions && nuance.questionPressure !== "none",
    questionPressure: safeStr(plan.questionPressure || nuance.questionPressure || "medium", 20) || "medium",
    archetype: safeStr(plan.primaryArchetype || nuance.archetype || "clarify", 40) || "clarify",
    conversationNeed: safeStr(plan.conversationNeed || nuance.conversationNeed || "clarify", 40) || "clarify",
    antiLoopShift: safeStr(plan.antiLoopShift || nuance.antiLoopShift || "", 80),
    transitionTargets: uniq(plan.transitionTargets && plan.transitionTargets.length ? plan.transitionTargets : nuance.transitionTargets),
    expressionStyle: presentation.expressionStyle || plan.expressionStyle || '',
    deliveryTone: presentation.deliveryTone || plan.deliveryTone || '',
    semanticFrame: presentation.semanticFrame || plan.semanticFrame || '',
    priorResponseFamily: presentation.priorResponseFamily || ''
  };
}

function stripTerminalQuestion(text) {
  const s = oneLine(text);
  if (!s) return "";
  return s.replace(/\s+[A-Z][^?!.]{0,180}\?$/,'').trim();
}

function enforceSingleQuestion(text) {
  const s = oneLine(text);
  if (!s) return "";
  const matches = s.match(/\?/g) || [];
  if (matches.length <= 1) return s;
  const firstQ = s.indexOf('?');
  return s.slice(0, firstQ + 1).trim();
}

function normalizeEmotionPayload(emo) {
  const e = isPlainObject(emo) ? emo : {};
  const supportFlags = isPlainObject(e.supportFlags) ? e.supportFlags : {};
  const disclaimers = isPlainObject(e.disclaimers) ? e.disclaimers : {};
  const contradictions = isPlainObject(e.contradictions) ? e.contradictions : { count: 0, contradictions: [] };
  const summary = isPlainObject(e.summary) ? e.summary : {};
  const continuity = isPlainObject(e.continuity) ? e.continuity : {};
  const tags = uniq(e.tags);
  const routeHints = uniq(e.routeHints);
  const responseHints = uniq(e.responseHints);
  const distressReinforcements = uniq(e.distressReinforcements);
  const positiveReinforcements = uniq(e.positiveReinforcements);
  const recoverySignals = uniq(e.recoverySignals);
  const nuanceProfile = normalizeNuanceProfile(e.nuanceProfile || e.nuance || e.downstream && e.downstream.supportResponse && e.downstream.supportResponse.nuanceProfile);
  const conversationPlan = normalizeConversationPlan(e.conversationPlan || e.downstream && e.downstream.supportResponse && e.downstream.supportResponse.conversationPlan);

  const primaryEmotion = safeStr(e.primaryEmotion || e.dominantEmotion || "neutral").toLowerCase();
  const secondaryEmotion = safeStr(e.secondaryEmotion || "").toLowerCase();
  const rawIntensity = e.intensity;

  return {
    source: safeStr(e.source || ""),
    mode: safeStr(e.mode || "NORMAL").toUpperCase(),
    valence: safeStr(e.valence || "neutral").toLowerCase(),
    intensityLabel: safeStr(e.intensityLabel || e.intensity || "flat").toLowerCase(),
    intensity: clampInt(
      typeof rawIntensity === "number"
        ? (rawIntensity <= 1 ? Math.round(rawIntensity * 100) : rawIntensity)
        : e.intensityLabel === "very_high" ? 95 :
          e.intensityLabel === "high" ? 78 :
          e.intensityLabel === "moderate" ? 55 :
          e.intensityLabel === "low" ? 28 :
          e.intensity,
      0,
      0,
      100
    ),
    confidence: clampInt(
      typeof e.confidence === "number"
        ? (e.confidence <= 1 ? Math.round(e.confidence * 100) : e.confidence)
        : 0,
      0,
      0,
      100
    ),
    dominantEmotion: primaryEmotion,
    primaryEmotion,
    secondaryEmotion,
    dominantSource: safeStr(e.dominantSource || "none").toLowerCase(),
    emotionCluster: safeStr(e.emotionCluster || "").toLowerCase(),
    tone: safeStr(e.tone || "steady_neutral").toLowerCase(),
    routeBias: safeStr(e.routeBias || "").toLowerCase(),
    supportModeCandidate: safeStr(e.supportModeCandidate || "").toLowerCase(),
    bypassClarify: !!e.bypassClarify,
    fallbackSuppression: !!e.fallbackSuppression,
    needsNovelMove: !!e.needsNovelMove,
    routeExhaustion: !!e.routeExhaustion,
    emotionalVolatility: safeStr(e.emotionalVolatility || "stable").toLowerCase(),
    supportFlags: {
      crisis: !!supportFlags.crisis,
      highDistress: !!supportFlags.highDistress,
      needsGentlePacing: !!(supportFlags.needsGentlePacing || supportFlags.needsStabilization),
      avoidCelebratoryTone: !!supportFlags.avoidCelebratoryTone,
      recoveryPresent: !!supportFlags.recoveryPresent,
      positivePresent: !!supportFlags.positivePresent,
      needsStabilization: !!supportFlags.needsStabilization,
      needsClarification: !!supportFlags.needsClarification,
      needsContainment: !!supportFlags.needsContainment,
      needsConnection: !!supportFlags.needsConnection,
      needsForwardMotion: !!supportFlags.needsForwardMotion,
      needsWitnessing: !!supportFlags.needsWitnessing,
      needsRepair: !!supportFlags.needsRepair,
      delayQuestions: !!supportFlags.delayQuestions,
      shouldSuppressMenus: !!supportFlags.shouldSuppressMenus,
      mentionsLooping: !!supportFlags.mentionsLooping
    },
    disclaimers: {
      needSoft: !!disclaimers.needSoft,
      needCrisis: !!disclaimers.needCrisis
    },
    contradictions: {
      count: clampInt(contradictions.count, 0, 0, 99),
      contradictions: Array.isArray(contradictions.contradictions) ? contradictions.contradictions.slice(0, 8) : []
    },
    continuity: {
      sameEmotionCount: clampInt(continuity.sameEmotionCount || 0, 0, 0, 99),
      sameSupportModeCount: clampInt(continuity.sameSupportModeCount || 0, 0, 0, 99),
      noProgressTurnCount: clampInt(continuity.noProgressTurnCount || 0, 0, 0, 99),
      repeatedFallbackCount: clampInt(continuity.repeatedFallbackCount || 0, 0, 0, 99),
      stateShift: safeStr(continuity.stateShift || ""),
    },
    summary: {
      concise: safeStr(summary.concise || ""),
      narrative: safeStr(summary.narrative || "")
    },
    nuanceProfile,
    conversationPlan,
    expressionStyle: safeStr(e.expressionStyle || e.downstream && e.downstream.supportResponse && e.downstream.supportResponse.expressionStyle || conversationPlan.expressionStyle || '').toLowerCase(),
    deliveryTone: safeStr(e.deliveryTone || e.downstream && e.downstream.supportResponse && e.downstream.supportResponse.deliveryTone || conversationPlan.deliveryTone || '').toLowerCase(),
    semanticFrame: safeStr(e.semanticFrame || e.downstream && e.downstream.supportResponse && e.downstream.supportResponse.semanticFrame || conversationPlan.semanticFrame || '').toLowerCase(),
    presentationSignals: isPlainObject(e.presentationSignals) ? e.presentationSignals : {},
    tags,
    routeHints,
    responseHints,
    distressReinforcements,
    positiveReinforcements,
    recoverySignals,
    cached: !!e.cached
  };
}

function shouldUseDisclaimer(emo, cfg) {
  if (cfg.includeDisclaimerOnEveryTurn) return true;
  if (emo.supportFlags.crisis && cfg.includeDisclaimerOnCrisis) return true;
  if ((emo.disclaimers.needSoft || emo.supportFlags.needsGentlePacing) && cfg.includeDisclaimerOnSoft) return true;
  return false;
}

function buildDisclaimer(seed) {
  return pick([
    "I am not a licensed therapist or clinician, but I can stay with you and help you think through this carefully.",
    "Just a quick note: I am not a clinician, though I can still offer steady support and help you find the next clear step.",
    "I am not a therapist, but I can be present with you and help make this feel a little more manageable."
  ], `${seed}|disclaimer`);
}

function buildReflectiveLead(emo, seed) {
  const dom = emo.primaryEmotion || emo.dominantEmotion;
  const val = emo.valence;
  const intense = emo.intensity >= 75;
  const nuance = normalizeNuanceProfile(emo.nuanceProfile);
  const plan = normalizeConversationPlan(emo.conversationPlan);

  if (emo.supportFlags.crisis) {
    return pick([
      "I am really glad you said this out loud.",
      "Thank you for telling me directly.",
      "I am glad you reached out instead of sitting with this alone."
    ], `${seed}|lead|crisis`);
  }

  if (dom === "anxiety" || dom === "fear") {
    return pick(intense ? [
      "That sounds like your system is under a lot of pressure right now.",
      "That kind of anxiety can feel relentless when your body will not settle.",
      "I can hear how activated this feels for you right now."
    ] : [
      "That anxious edge can wear you down fast.",
      "I can hear the tension in this.",
      "That sounds mentally and physically tiring."
    ], `${seed}|lead|anxiety`);
  }

  if (dom === "sadness" || dom === "disappointment") {
    return pick([
      "That sounds heavy, and I am here with you in it.",
      "There is a lot of weight in what you just said.",
      "I can feel the heaviness in that."
    ], `${seed}|lead|sadness`);
  }

  if (dom === "grief") {
    return pick([
      "That is a painful kind of loss to be carrying.",
      "Loss like that can hit in waves and take a lot out of you.",
      "That sounds deeply painful."
    ], `${seed}|lead|grief`);
  }

  if (dom === "loneliness" || dom === "lonely" || dom === "isolation") {
    return pick([
      "I am here with you right now.",
      "That alone feeling can hit deep.",
      "Feeling cut off like that can get very heavy."
    ], `${seed}|lead|loneliness`);
  }

  if (dom === "shame") {
    return pick([
      "Shame can be brutally convincing when you are already hurting.",
      "That sounds like one of those moments where pain starts turning against you.",
      "I can hear how harsh this has become inside your own head."
    ], `${seed}|lead|shame`);
  }

  if (dom === "anger" || dom === "frustration" || dom === "resentment") {
    return pick([
      "I can hear the frustration in this clearly.",
      "That sounds like you have been pushed past your limit.",
      "There is a lot of heat in this, and it makes sense."
    ], `${seed}|lead|anger`);
  }

  if (dom === "confusion" || dom === "surprise" || dom === "awkwardness") {
    return pick([
      "It sounds like too many things are hitting at once.",
      "That kind of mental overload can make everything feel scrambled.",
      "I can hear how hard it is to get a clean grip on this."
    ], `${seed}|lead|confusion`);
  }

  if (dom === "despair" || dom === "helplessness") {
    return pick([
      "That sounds painfully bleak right now.",
      "I can hear how close to empty this feels.",
      "That is a very hard place to be sitting in."
    ], `${seed}|lead|despair`);
  }

  if (dom === "disgust" || dom === "horror") {
    return pick([
      "That reaction sounds deeply aversive for you.",
      "I can hear how strongly this pushed you back.",
      "That lands like something your system wants distance from immediately."
    ], `${seed}|lead|aversion`);
  }

  if (dom === "nostalgia" || dom === "aestheticappreciation" || dom === "awe") {
    return pick([
      "There is a reflective depth in that.",
      "That sounds like it is carrying meaning beyond the surface.",
      "I can hear the memory and feeling layered together there."
    ], `${seed}|lead|reflective`);
  }

  if (dom === "interest" || dom === "curiosity" || dom === "surprise") {
    return pick([
      "There is real curiosity in that.",
      "That sounds like your mind is trying to orient and understand.",
      "I can hear the pull to explore this a bit further."
    ], `${seed}|lead|curious`);
  }

  if (nuance.conversationNeed === "witness" || plan.shouldPreferReflection) {
    return pick([
      "I want to stay with the feeling before we try to tidy it up.",
      "This sounds like something that needs to be witnessed, not rushed past.",
      "There is more to hold here than to fix immediately."
    ], `${seed}|lead|witness`);
  }

  if (nuance.conversationNeed === "repair") {
    return pick([
      "There is pain here, but also a part of you trying to make sense of it without becoming the villain in your own story.",
      "This feels like a moment that needs care, not self-punishment.",
      "I can hear both the hurt and the urge to repair something important."
    ], `${seed}|lead|repair`);
  }

  if (nuance.conversationNeed === "boundary") {
    return pick([
      "Your system sounds like it is trying to protect a line that got crossed.",
      "This feels like a boundary response, not random intensity.",
      "I can hear that something in this is asking for distance or containment."
    ], `${seed}|lead|boundary`);
  }

  if (val === "positive") {
    return pick([
      "That carries a strong signal in a good direction.",
      "There is real lift in what you just said.",
      "That sounds steady and meaningful."
    ], `${seed}|lead|positive`);
  }

  if (val === "mixed") {
    return pick([
      "It sounds like more than one truth is present at the same time.",
      "I can hear that this is not simple or one-note.",
      "There is a mix here, and that matters."
    ], `${seed}|lead|mixed`);
  }

  return pick([
    "I hear you.",
    "What you are describing makes sense.",
    "I am with you."
  ], `${seed}|lead|default`);
}

function buildValidation(emo, seed) {
  if (emo.supportFlags.crisis) {
    return pick([
      "You do not need to carry this alone right now.",
      "This is serious, and your safety matters more than trying to power through it.",
      "What you are feeling deserves immediate care and support."
    ], `${seed}|validate|crisis`);
  }

  if (emo.supportFlags.highDistress) {
    return pick([
      "You are not weak for feeling this strongly.",
      "This does not read like failure to me — it reads like strain.",
      "A lot of people would feel shaken under this kind of weight."
    ], `${seed}|validate|high`);
  }

  if (emo.valence === "positive" && !emo.supportFlags.avoidCelebratoryTone) {
    return pick([
      "It is worth noticing that this is movement, not nothing.",
      "That deserves to be recognized, not brushed past.",
      "There is something solid in that."
    ], `${seed}|validate|positive`);
  }

  if (emo.valence === "mixed") {
    return pick([
      "Two things can be true here: part of you can be hurting while another part is still trying to move forward.",
      "You do not have to flatten this into one emotion for it to be real.",
      "Mixed feelings do not mean you are confused — sometimes they mean you are being honest."
    ], `${seed}|validate|mixed`);
  }

  if (emotionAny(emo, ["loneliness", "lonely", "isolation"])) {
    return pick([
      "You are not asking for too much by wanting connection.",
      "Feeling alone does not make you a problem.",
      "This is a human ache, not a weakness."
    ], `${seed}|validate|loneliness`);
  }

  return pick([
    "This is a human response, not a character flaw.",
    "It makes sense that this would affect you.",
    "You are not overreacting just because it hurts."
  ], `${seed}|validate|default`);
}

function buildRecoveryAcknowledgment(emo, seed) {
  if (!emo.supportFlags.recoveryPresent && !emo.recoverySignals.length) return "";

  if (emo.recoverySignals.includes("active_recovery_present")) {
    return pick([
      "I also want to note that there are recovery signals here, and that matters.",
      "There is already some regulation effort showing up in what you said.",
      "I can see signs that part of you is already trying to stabilize."
    ], `${seed}|recovery|active`);
  }

  if (emo.recoverySignals.includes("resilience_present")) {
    return pick([
      "There is resilience here too, even if it does not feel loud yet.",
      "I do not want to miss the fact that you are still showing up inside this.",
      "There is effort and survival energy in this too."
    ], `${seed}|recovery|resilience`);
  }

  if (emo.recoverySignals.includes("upward_shift_detected")) {
    return pick([
      "There are signs of movement in a better direction.",
      "I can hear a slight upward shift in this.",
      "Something in you is already trying to move toward steadier ground."
    ], `${seed}|recovery|up`);
  }

  return "";
}

function mapDistressMicroSteps(emo) {
  const dom = emo.primaryEmotion || emo.dominantEmotion;

  if (emo.supportFlags.crisis) {
    return [
      "Please reach a real person now — call or text 9-8-8 in Canada, or your local emergency number if you are in immediate danger."
    ];
  }

  if (dom === "anxiety" || dom === "fear") {
    return [
      "Try one slower exhale than inhale — not to fix everything, just to lower the alarm a notch."
    ];
  }

  if (dom === "confusion" || dom === "surprise" || dom === "awkwardness" || emo.distressReinforcements.includes("reduce_complexity")) {
    return [
      "Let us reduce the load: name the one thing that is most urgent and ignore the rest for this minute."
    ];
  }

  if (dom === "shame") {
    return [
      "Try separating the feeling from the verdict: this hurts, but that does not automatically make the story about you true."
    ];
  }

  if (dom === "loneliness" || dom === "lonely" || dom === "isolation") {
    return [
      "You do not need a huge solution right now — even one honest message to one safe person can count."
    ];
  }

  if (dom === "anger" || dom === "frustration" || dom === "resentment") {
    return [
      "Before acting on the heat, pin down the real target: what exactly crossed the line?"
    ];
  }

  if (dom === "sadness" || dom === "despair" || dom === "helplessness" || dom === "disappointment") {
    return [
      "Keep the horizon very small for now: what would make the next hour 5% gentler?"
    ];
  }

  return [
    "Let us keep the next step very small: what is one move that makes this feel even slightly more manageable?"
  ];
}

function mapPositiveMicroSteps(emo) {
  const dom = emo.primaryEmotion || emo.dominantEmotion;

  if (dom === "confidence" || dom === "momentum" || dom === "determination" || dom === "anticipation" || dom === "excitement") {
    return [
      "Use the energy while it is clean: what is the next concrete move you can lock in today?"
    ];
  }

  if (dom === "pride") {
    return [
      "Name exactly what worked so you can repeat it on purpose."
    ];
  }

  if (dom === "gratitude" || dom === "connection" || dom === "admiration" || dom === "adoration" || dom === "trust" || dom === "empathy") {
    return [
      "Hold onto what is helping here and make it repeatable."
    ];
  }

  if (dom === "calm" || dom === "calmness" || dom === "relief" || dom === "satisfaction") {
    return [
      "Protect this steadier state before the noise rushes back in."
    ];
  }

  return [
    "Turn this signal into one deliberate next action while it is still alive."
  ];
}

function buildMicroStep(emo, cfg, seed) {
  const maxSteps = clampInt(cfg.maxMicroSteps, 1, 0, 2);
  if (maxSteps <= 0) return "";

  const nuance = normalizeNuanceProfile(emo.nuanceProfile);
  const plan = normalizeConversationPlan(emo.conversationPlan);
  let pool = emo.supportFlags.crisis || emo.valence === "negative" || emo.valence === "critical_negative"
    ? mapDistressMicroSteps(emo)
    : emo.valence === "positive"
      ? mapPositiveMicroSteps(emo)
      : [
          "What is the smallest clean next step you can take from here?"
        ];

  if (plan.shouldDelaySolutioning || nuance.transitionReadiness === "low" || nuance.followupStyle === "reflective") {
    pool = [
      "We do not need a full solution yet — let us just stay with the clearest part of what is happening.",
      "For this turn, we can keep it to one honest layer instead of forcing a fix.",
      "Let us hold the signal steady before we ask it to become a plan."
    ].concat(pool);
  }

  if (nuance.conversationNeed === "repair") {
    pool = [
      "Let us separate repair from self-attack and find the smallest honest correction.",
      "Name the part that needs care first, then decide what needs repair after that."
    ].concat(pool);
  }

  if (nuance.conversationNeed === "boundary") {
    pool = [
      "Reduce exposure first — figure out what needs distance, not just what needs explanation.",
      "Pin down the line that got crossed so your next move comes from clarity, not just heat."
    ].concat(pool);
  }

  if (emo.needsNovelMove || emo.routeExhaustion || nuance.loopRisk === "high") {
    pool = [
      "We are not going to recycle the same emotional loop — let us shift the angle and work the next clean layer.",
      safeStr(plan.antiLoopShift || nuance.antiLoopShift || "Shift the pattern before asking for more explanation.")
        .replace(/_/g, " ")
    ].concat(pool);
  }

  return pickN(pool, `${seed}|micro`, maxSteps).join(" ");
}

function buildQuestion(emo, cfg, seed, layer = {}, presentation = {}) {
  const maxQuestions = clampInt(cfg.maxQuestionCount, 1, 0, 1);
  if (maxQuestions <= 0) return "";

  const nuance = normalizeNuanceProfile(emo.nuanceProfile);
  const plan = normalizeConversationPlan(emo.conversationPlan);
  if (plan.askAllowed === false || emo.supportFlags.delayQuestions || nuance.questionPressure === "none") return "";
  if (emo.valence === 'positive' || presentation.expressionStyle || presentation.semanticFrame) {
    const picked = chooseQuestionVariant(emo, layer, presentation, seed);
    if (picked.line && !emo.supportFlags.crisis && !emotionAny(emo, ['loneliness','lonely','isolation','anxiety','fear','sadness','grief','disappointment','helplessness','shame','guilt','embarrassment','anger','frustration','resentment','disgust'])) {
      return picked.line;
    }
  }

  if (nuance.questionPressure === "low" && (plan.shouldDelaySolutioning || nuance.transitionReadiness === "low")) {
    const gentle = pick([
      "Do you want me to stay with the feeling a little longer, or help you name the most important part of it?",
      "What part of this feels safest to put words around right now?",
      "Would it help more to stay with the emotion, or to narrow one piece of it?"
    ], `${seed}|q|gentle`);
    return gentle;
  }

  if (emo.supportFlags.crisis) {
    return pick([
      "Can you get to a real person right now and stay with them?",
      "Are you alone right now, or is someone with you?",
      "Can you call or text 9-8-8 right now while we keep this simple?"
    ], `${seed}|q|crisis`);
  }

  if (emotionAny(emo, ["loneliness", "lonely", "isolation"])) {
    return pick([
      "Do you want to tell me what is making today feel especially lonely?",
      "What feels heaviest about the alone feeling right now?",
      "Do you want to talk about what is sitting under this feeling?"
    ], `${seed}|q|loneliness`);
  }

  if (emotionAny(emo, ["anxiety", "fear"])) {
    return pick([
      "Is this hitting more in your thoughts, or more in your body?",
      "What feels most activated right now — your chest, your thoughts, or your sense of pressure?",
      "Is this more fear, more overload, or more uncertainty?"
    ], `${seed}|q|anxiety`);
  }

  if (emotionAny(emo, ["sadness", "grief", "disappointment", "helplessness"])) {
    return pick([
      "What has felt heaviest about it today?",
      "What part of this hurts the most right now?",
      "What has this been like for you in the quiet moments?"
    ], `${seed}|q|sadness`);
  }

  if (emotionAny(emo, ["shame", "guilt", "embarrassment"])) {
    return pick([
      "What is the harshest thing your mind is saying about you right now?",
      "What story is the shame trying to force on you?",
      "What are you blaming yourself for most?"
    ], `${seed}|q|shame`);
  }

  if (emotionAny(emo, ["anger", "frustration", "resentment", "disgust"])) {
    return pick([
      "What exactly crossed the line for you?",
      "What part of this feels most unfair?",
      "What is the real injury underneath the anger?"
    ], `${seed}|q|anger`);
  }

  if (nuance.conversationNeed === "repair") {
    return pick([
      "What feels most repairable here without attacking yourself?",
      "What part needs accountability, and what part just needs care?",
      "Where do you want to begin separating regret from self-erasure?"
    ], `${seed}|q|repair`);
  }

  if (nuance.conversationNeed === "boundary") {
    return pick([
      "What boundary feels most important here?",
      "What part of this needs distance or containment first?",
      "Where did the line get crossed for you?"
    ], `${seed}|q|boundary`);
  }

  if (emo.valence === "positive") {
    return pick([
      "What do you want to build on next?",
      "How do you want to use this momentum?",
      "What is the next move that fits this energy?"
    ], `${seed}|q|positive`);
  }

  if (emo.valence === "mixed" || emo.contradictions.count > 0) {
    return pick([
      "Which side of this feels loudest right now?",
      "What part needs the most attention first — the pain, the pressure, or the next step?",
      "If you had to name the central tension in one sentence, what would it be?"
    ], `${seed}|q|mixed`);
  }

  return pick([
    "What has been building up around this?",
    "What feels most important about this right now?",
    "Where do you want to start with it?"
  ], `${seed}|q|default`);
}

function buildPositiveReinforcementLine(emo, seed) {
  if (!Array.isArray(emo.positiveReinforcements) || !emo.positiveReinforcements.length) return "";

  if (emo.supportFlags.avoidCelebratoryTone) return "";

  if ((safeStr(emo.semanticFrame || '').includes('purpose')) || (safeStr(emo.expressionStyle || '').includes('purpose_work'))) {
    return pick([
      'Loving what you do is a real signal of alignment, and that is worth honoring.',
      'That kind of fit between you and your work is not small — it is worth protecting.',
      'There is something deeply encouraging in hearing that level of alignment.'
    ], `${seed}|pos|purpose`);
  }

  if (safeStr(emo.semanticFrame || '').includes('life_appraisal')) {
    return pick([
      'A broad statement like that usually means something is settling into a better shape.',
      'That kind of overall good signal is worth anchoring instead of rushing past.',
      'It is worth noticing when life feels more open and workable.'
    ], `${seed}|pos|life`);
  }

  if (emo.positiveReinforcements.includes("reinforce_self_trust")) {
    return pick([
      "There is a self-trust signal in this, and that is worth protecting.",
      "I would not rush past the confidence showing up here.",
      "That sounds like you are finding your footing, not just feeling better for a second."
    ], `${seed}|pos|trust`);
  }

  if (emo.positiveReinforcements.includes("reflect_resilience")) {
    return pick([
      "I also want to give credit to the resilience in this.",
      "There is strength in the fact that you are still moving inside it.",
      "Part of what stands out here is your resilience."
    ], `${seed}|pos|resilience`);
  }

  if (emo.positiveReinforcements.includes("highlight_momentum") || emo.positiveReinforcements.includes("support_upward_trajectory")) {
    return pick([
      "There is real forward motion here.",
      "This feels like momentum, not just relief.",
      "That sounds like movement in the right direction."
    ], `${seed}|pos|momentum`);
  }

  return pick([
    "There is something genuinely constructive in this.",
    "I would not minimize the positive signal here.",
    "That deserves to be noticed."
  ], `${seed}|pos|default`);
}

function buildDistressReinforcementLine(emo, seed) {
  if (!Array.isArray(emo.distressReinforcements) || !emo.distressReinforcements.length) {
    if (emotionAny(emo, ["loneliness", "lonely", "isolation"])) {
      return pick([
        "You do not have to solve your whole life from this moment.",
        "We can keep this gentle and honest.",
        "You do not need to force a big answer right this second."
      ], `${seed}|dist|loneliness`);
    }
    return "";
  }

  if (emo.supportFlags.crisis) {
    return pick([
      "Right now the priority is safety, not perfect wording or perfect control.",
      "We do not need to solve everything this second — safety comes first.",
      "The goal right now is immediate support and safety."
    ], `${seed}|dist|crisis`);
  }

  if (emo.distressReinforcements.includes("slow_the_pacing") || emo.supportFlags.needsGentlePacing) {
    return pick([
      "We can slow this right down.",
      "There is no need to force clarity too fast here.",
      "We can keep this simple and steady."
    ], `${seed}|dist|pace`);
  }

  if (emo.distressReinforcements.includes("offer_one_clear_option")) {
    return pick([
      "Let us reduce this to one clear step instead of ten.",
      "You do not need a full map right now — just one foothold.",
      "We only need one clean next move from here."
    ], `${seed}|dist|clear`);
  }

  return pick([
    "I want to keep this grounded and manageable with you.",
    "Let us not add pressure to an already heavy moment.",
    "We can work with this without overwhelming you more."
  ], `${seed}|dist|default`);
}

function buildMixedStateLine(emo, seed) {
  if (emo.valence !== "mixed" && emo.contradictions.count <= 0) return "";

  return pick([
    "It sounds like part of you is trying to hold together while another part is hurting.",
    "I do not think this is one-note — it feels layered.",
    "There is a push-pull in this, and that is important to respect."
  ], `${seed}|mixed`);
}

function buildCrisisResponse(options = {}) {
  const seed = safeStr(options.seed || "nyx|crisis");
  const shortLead = pick([
    "I am really sorry you are feeling this way.",
    "I am glad you said this out loud.",
    "Thank you for telling me directly."
  ], `${seed}|lead`);

  const body = [
    shortLead,
    "I cannot help with anything that involves harming yourself or someone else.",
    "If you are in immediate danger or think you might act on these thoughts, call your local emergency number right now.",
    "If you are in Canada, call or text 9-8-8 for immediate support."
  ];

  if (options.country && !/canada/i.test(safeStr(options.country))) {
    body.push("If you tell me your country, I can help point you to the right crisis line.");
  } else {
    body.push("If you are elsewhere, tell me your country and I will point you to the right crisis line.");
  }

  return joinSentences(body);
}

function buildLonelinessResponse(emo, cfg, seed) {
  const parts = [];

  parts.push(pick([
    "I am here with you right now.",
    "You do not have to sit in that feeling alone for this moment.",
    "I am with you, and I am listening."
  ], `${seed}|lonely|lead`));

  parts.push(pick([
    "Feeling lonely can make everything feel heavier than it already is.",
    "That kind of disconnection can ache in a very real way.",
    "That alone feeling can get loud fast."
  ], `${seed}|lonely|reflect`));

  if (emo.supportFlags.needsGentlePacing || emo.valence === "negative") {
    parts.push(pick([
      "We can keep this gentle.",
      "We do not need to force a perfect explanation right away.",
      "You do not have to perform strength with me."
    ], `${seed}|lonely|pace`));
  }

  const micro = buildMicroStep(emo, cfg, seed);
  if (micro) parts.push(micro);

  const q = buildQuestion(emo, cfg, seed);
  if (q) parts.push(q);

  return joinSentences(parts);
}

function buildSupportiveResponse(input = {}, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...(isPlainObject(config) ? config : {}) };

  try {
    const userText = safeStr(input.userText || "");
    const emo = normalizeEmotionPayload(input.emo);
    const seed = safeStr(input.seed || userText || `${emo.mode}|${emo.primaryEmotion || emo.dominantEmotion}|nyx`);
    const technical = looksTechnicalRequest(userText);
    const layering = buildConversationLayerMeta(emo, userText, cfg, input);
    const presentation = normalizePresentationProfile({
      expressionStyle: emo.expressionStyle || layering.expressionStyle,
      deliveryTone: emo.deliveryTone || layering.deliveryTone,
      semanticFrame: emo.semanticFrame || layering.semanticFrame,
      priorResponseFamily: input.priorResponseFamily || input.lastResponseFamily || '',
      lastOpeningFamily: input.lastOpeningFamily || '',
      lastQuestionStyle: input.lastQuestionStyle || '',
      sameResponseFamilyCount: input.sameResponseFamilyCount || 0,
      presentationSignals: emo.presentationSignals || {}
    });

    if (emo.supportFlags.crisis || emo.disclaimers.needCrisis) {
      return buildCrisisResponse({ seed, country: input.country || "" });
    }

    if (technical) {
      return joinSentences([
        buildReflectiveLead(emo, seed) || "I hear the pressure in this.",
        buildValidation(emo, seed) || "We can keep this tight and practical.",
        buildRecoveryAcknowledgment(emo, seed),
        buildDistressReinforcementLine(emo, seed),
        "There is value in getting clarity here, and I can help without turning this into noise.",
        emo.needsNovelMove || emo.routeExhaustion
          ? "I am going to change the pattern and keep the answer cleaner so this does not fall back into repetition."
          : "I will stay on the exact target and keep the response supportive, useful, and direct."
      ]);
    }

    if (emotionAny(emo, ["loneliness", "lonely", "isolation"])) {
      const lonelyOut = buildLonelinessResponse(emo, cfg, seed);
      if (lonelyOut) return enforceSingleQuestion(lonelyOut);
    }

    const opening = chooseOpeningVariant(emo, layering, presentation, seed);
    const validation = chooseValidationVariant(emo, presentation, seed);
    const followup = chooseFollowupVariant(emo, layering, presentation, seed);

    const parts = [];

    parts.push(opening.line || buildReflectiveLead(emo, seed));
    if (emo.valence === 'positive') {
      parts.push(validation.line || buildValidation(emo, seed));
      parts.push(buildPositiveReinforcementLine(emo, seed));
      parts.push(buildRecoveryAcknowledgment(emo, seed));
      if (followup.line && layering.conversationDepth !== 'technical' && !layering.askAllowed) {
        parts.push(followup.line);
      }
    } else {
      parts.push(buildReflectiveLead(emo, seed));
      parts.push(validation.line || buildValidation(emo, seed));
      parts.push(buildDistressReinforcementLine(emo, seed));
      parts.push(buildPositiveReinforcementLine(emo, seed));
      parts.push(buildRecoveryAcknowledgment(emo, seed));
      parts.push(buildMixedStateLine(emo, seed));
    }

    if (shouldUseDisclaimer(emo, cfg)) {
      parts.push(buildDisclaimer(seed));
    }

    parts.push(buildMicroStep(emo, cfg, seed));

    const shouldAsk = !(cfg.suppressQuestionOnRecovery && emo.supportFlags.recoveryPresent) && !technical && !!layering.askAllowed;
    if (shouldAsk) {
      parts.push(buildQuestion(emo, cfg, seed, layering, presentation));
    }

    if (emo.needsNovelMove || emo.routeExhaustion || emo.supportFlags.mentionsLooping || presentation.sameResponseFamilyCount >= 2) {
      parts.push('I am going to shift the shape a little here so it stays fresh and useful.');
    }

    let out = joinSentences(parts);
    if (!shouldAsk) out = stripTerminalQuestion(out);
    out = enforceSingleQuestion(out);

    if (out) return out;

    return technical
      ? "I hear the strain in this. We will keep it direct, useful, and steady."
      : "I hear you. I am here, and we can take this one steady step at a time. What feels most important right now?";
  } catch (_err) {
    return looksTechnicalRequest(safeStr(input && input.userText || ""))
      ? "I hear the strain in this. We will keep it direct, useful, and steady."
      : "I hear you. I am here, and we can keep this simple and steady. What feels most important right now?";
  }
}

function buildSupportPacket(input = {}, config = {}) {
  const emo = normalizeEmotionPayload(input.emo);
  const seed = safeStr(input.seed || input.userText || "nyx");
  const cfg = { ...DEFAULT_CONFIG, ...(isPlainObject(config) ? config : {}) };

  if (emo.supportFlags.crisis || emo.disclaimers.needCrisis) {
    return {
      ok: true,
      version: VERSION,
      mode: "crisis",
      reply: buildCrisisResponse({ seed, country: input.country || "" }),
      meta: {
        crisis: true,
        dominantEmotion: emo.primaryEmotion || emo.dominantEmotion,
        valence: emo.valence,
        supportLock: true,
        supportLockTurns: Math.max(2, clampInt(cfg.supportLockTurns, 2, 1, 4)),
        suppressChips: true,
        suppressLaneRouting: true,
        followupStyle: "supportive",
        conversationDepth: "crisis_support"
      }
    };
  }

  const layering = buildConversationLayerMeta(emo, input.userText || "", cfg, input);

  return {
    ok: true,
    version: VERSION,
    mode: "supportive",
    reply: buildSupportiveResponse(input, cfg),
    meta: {
      crisis: false,
      dominantEmotion: emo.primaryEmotion || emo.dominantEmotion,
      valence: emo.valence,
      tone: emo.tone,
      needsGentlePacing: !!emo.supportFlags.needsGentlePacing,
      positivePresent: !!emo.supportFlags.positivePresent,
      recoveryPresent: !!emo.supportFlags.recoveryPresent,
      emotionCluster: emo.emotionCluster,
      routeBias: emo.routeBias,
      supportModeCandidate: emo.supportModeCandidate,
      fallbackSuppression: !!emo.fallbackSuppression,
      needsNovelMove: !!emo.needsNovelMove,
      routeExhaustion: !!emo.routeExhaustion,
      supportLock: !!layering.supportLock,
      supportLockTurns: layering.supportLockTurns,
      suppressChips: !!layering.suppressChips,
      suppressLaneRouting: !!layering.suppressLaneRouting,
      followupStyle: layering.followupStyle,
      conversationDepth: layering.conversationDepth,
      askAllowed: !!layering.askAllowed,
      questionPressure: layering.questionPressure,
      archetype: layering.archetype,
      conversationNeed: layering.conversationNeed,
      antiLoopShift: layering.antiLoopShift,
      transitionTargets: layering.transitionTargets,
      nuanceProfile: emo.nuanceProfile,
      conversationPlan: emo.conversationPlan,
      expressionStyle: emo.expressionStyle || layering.expressionStyle,
      deliveryTone: emo.deliveryTone || layering.deliveryTone,
      semanticFrame: emo.semanticFrame || layering.semanticFrame,
      responseFamily: determineResponseFamily(emo, layering, normalizePresentationProfile({ expressionStyle: emo.expressionStyle || layering.expressionStyle, deliveryTone: emo.deliveryTone || layering.deliveryTone, semanticFrame: emo.semanticFrame || layering.semanticFrame, priorResponseFamily: input.priorResponseFamily || input.lastResponseFamily || '' })),
      priorResponseFamily: input.priorResponseFamily || input.lastResponseFamily || ''
    }
  };
}

module.exports = {
  VERSION,
  DEFAULT_CONFIG,
  buildSupportiveResponse,
  buildCrisisResponse,
  buildSupportPacket,
  normalizeEmotionPayload
};
