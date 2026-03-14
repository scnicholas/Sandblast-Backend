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

const VERSION = "supportResponse v1.5.0 EMOTION-XOVER LOOP-HARDEN";

const DEFAULT_CONFIG = {
  includeDisclaimerOnSoft: false,
  includeDisclaimerOnCrisis: false,
  includeDisclaimerOnEveryTurn: false,
  maxQuestionCount: 1,
  maxMicroSteps: 1,
  keepCrisisShort: true,
  suppressQuestionOnTechnical: true,
  suppressQuestionOnRecovery: true,
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

  const pool = emo.supportFlags.crisis || emo.valence === "negative" || emo.valence === "critical_negative"
    ? mapDistressMicroSteps(emo)
    : emo.valence === "positive"
      ? mapPositiveMicroSteps(emo)
      : [
          "What is the smallest clean next step you can take from here?"
        ];

  return pickN(pool, `${seed}|micro`, maxSteps).join(" ");
}

function buildQuestion(emo, cfg, seed) {
  const maxQuestions = clampInt(cfg.maxQuestionCount, 1, 0, 1);
  if (maxQuestions <= 0) return "";

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

    if (emo.supportFlags.crisis || emo.disclaimers.needCrisis) {
      return buildCrisisResponse({ seed, country: input.country || "" });
    }

    if (technical) {
      return joinSentences([
        buildReflectiveLead(emo, seed) || "I hear the pressure in this.",
        buildValidation(emo, seed) || "We can keep this tight and practical.",
        buildRecoveryAcknowledgment(emo, seed),
        buildDistressReinforcementLine(emo, seed),
        emo.needsNovelMove || emo.routeExhaustion
          ? "We will break the repetition here and move with one cleaner emotional strategy, not the same loop again."
          : "We will stay on the exact technical target and not bounce this into a generic support loop."
      ]);
    }

    if (emotionAny(emo, ["loneliness", "lonely", "isolation"])) {
      const lonelyOut = buildLonelinessResponse(emo, cfg, seed);
      if (lonelyOut) return enforceSingleQuestion(lonelyOut);
    }

    const parts = [];

    parts.push(buildReflectiveLead(emo, seed));
    parts.push(buildValidation(emo, seed));
    parts.push(buildDistressReinforcementLine(emo, seed));
    parts.push(buildPositiveReinforcementLine(emo, seed));
    parts.push(buildRecoveryAcknowledgment(emo, seed));
    parts.push(buildMixedStateLine(emo, seed));

    if (shouldUseDisclaimer(emo, cfg)) {
      parts.push(buildDisclaimer(seed));
    }

    parts.push(buildMicroStep(emo, cfg, seed));

    const shouldAsk = !(cfg.suppressQuestionOnRecovery && emo.supportFlags.recoveryPresent) && !technical;
    if (shouldAsk) {
      parts.push(buildQuestion(emo, cfg, seed));
    }

    let out = joinSentences(parts);
    if (!shouldAsk) out = stripTerminalQuestion(out);
    out = enforceSingleQuestion(out);

    if (out) return out;

    return technical
      ? "I hear the strain in this. We will keep it technical, direct, and free of extra support layering."
      : "I hear you. We can keep this steady and work one small step at a time. What feels most important right now?";
  } catch (_err) {
    return looksTechnicalRequest(safeStr(input && input.userText || ""))
      ? "I hear the strain in this. We will keep it technical, direct, and free of extra support layering."
      : "I hear you. We can keep this simple and steady. What feels most important right now?";
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
        valence: emo.valence
      }
    };
  }

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
      routeExhaustion: !!emo.routeExhaustion
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
