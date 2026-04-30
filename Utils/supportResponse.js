"use strict";

/**
 * supportResponse.js
 * Deterministic supportive response generator with continuity-aware response shaping.
 */

const VERSION = "supportResponse v2.3.1 STATE-SPINE-COHESION-FINAL-LOOP-HARDLOCK";


const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const BLOCKED_LOOPING_SUPPORT_PATTERNS = Object.freeze([
  /\bi\s+am\s+here\s+with\s+you\b/i,
  /\bi['’]?m\s+here\s+with\s+you\b/i,
  /\bi\s+am\s+here\.\s*what['’]?s\s+next\??/i,
  /\bi['’]?m\s+here\.\s*what['’]?s\s+next\??/i,
  /\bwe\s+can\s+take\s+this\s+one\s+step\s+at\s+a\s+time\b/i,
  /\blet['’]?s\s+take\s+this\s+one\s+step\s+at\s+a\s+time\b/i,
  /\bi\s+can\s+stay\s+with\s+this\s+clearly\b/i,
  /\btell\s+me\s+the\s+next\s+piece\s+and\s+i\s+will\s+stay\s+with\b/i
]);

function getStateSpine(input) { const src = isPlainObject(input) ? input : {}; const prev = isPlainObject(src.previousMemory) ? src.previousMemory : {}; const session = isPlainObject(src.session) ? src.session : {}; return isPlainObject(src.stateSpine) ? src.stateSpine : isPlainObject(src.conversationState) ? src.conversationState : isPlainObject(prev.stateSpine) ? prev.stateSpine : isPlainObject(prev.conversationState) ? prev.conversationState : isPlainObject(session.stateSpine) ? session.stateSpine : {}; }
function hasStateSpineLoopPressure(input) { const spine = getStateSpine(input); const rep = isPlainObject(spine.repetition) ? spine.repetition : {}; const support = isPlainObject(spine.support) ? spine.support : {}; return !!(spine.progressionLock || support.lockActive || Number(rep.noProgressCount || 0) >= 2 || Number(rep.sameAssistantHashCount || 0) >= 2); }

function hasBlockedLoopPhrase(value) {
  const text = oneLine(value);
  if (!text) return false;
  return BLOCKED_LOOPING_SUPPORT_PATTERNS.some((rx) => rx.test(text));
}

function scrubLoopPhrases(reply, input) {
  let text = oneLine(reply);
  if (!text) return "";
  const loopPressure = hasStateSpineLoopPressure(input);
  if (!loopPressure && !hasBlockedLoopPhrase(text)) return text;
  text = text
    .replace(/\bI\s+am\s+here\s+with\s+you\.?(\s*)/ig, "I have the thread. ")
    .replace(/\bI'm\s+here\s+with\s+you\.?(\s*)/ig, "I have the thread. ")
    .replace(/\bI’m\s+here\s+with\s+you\.?(\s*)/ig, "I have the thread. ")
    .replace(/\bI\s+am\s+here\.\s*What['’]?s\s+next\??/ig, "I have the thread. Give me the next concrete move.")
    .replace(/\bI'm\s+here\.\s*What['’]?s\s+next\??/ig, "I have the thread. Give me the next concrete move.")
    .replace(/\bI’m\s+here\.\s*What['’]?s\s+next\??/ig, "I have the thread. Give me the next concrete move.")
    .replace(/\bWe\s+can\s+take\s+this\s+one\s+step\s+at\s+a\s+time\.?(\s*)/ig, "We can keep the next move small and concrete. ")
    .replace(/\bLet['’]?s\s+take\s+this\s+one\s+step\s+at\s+a\s+time\.?(\s*)/ig, "Let us keep the next move small and concrete. ")
    .replace(/\bI\s+can\s+stay\s+with\s+this\s+clearly\.?(\s*)/ig, "I can keep this clear. ")
    .replace(/\s+/g, " ")
    .trim();
  if (hasBlockedLoopPhrase(text)) {
    return looksTechnicalRequest(input && input.text)
      ? "Technical response: I blocked the generic support fallback and kept this in the execution lane."
      : "I have the thread. We can keep the next move small, clear, and grounded.";
  }
  return text;
}

function finalizeSupportReply(reply, input) {
  let text = scrubLoopPhrases(reply, input);
  if (!text) return "";
  if (looksTechnicalRequest(input && input.text) && hasBlockedLoopPhrase(text)) {
    return "Technical response: support fallback was blocked before final emission. Keep the turn specific and execution-first.";
  }
  return text;
}

const DEFAULT_CONFIG = {
  includeDisclaimerOnSoft: false,
  includeDisclaimerOnCrisis: false,
  includeDisclaimerOnEveryTurn: false,
  maxQuestionCount: 1,
  maxMicroSteps: 1,
  keepCrisisShort: true,
  suppressQuestionOnTechnical: true,
  suppressQuestionOnRecovery: true,
  suppressQuestionOnLoop: true,
  suppressQuestionOnHighContinuity: true,
  suppressQuestionOnContainment: true,
  suppressQuestionOnHighDistress: true,
  allowQuestionsOnPositive: true,
  debug: false
};

function safeStr(x) { return x === null || x === undefined ? "" : String(x); }
function isPlainObject(x) { return !!x && typeof x === "object" && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null); }
function clampInt(v, def, min, max) { const n = Number(v); if (!Number.isFinite(n)) return def; const t = Math.trunc(n); if (t < min) return min; if (t > max) return max; return t; }
function oneLine(s) { return safeStr(s).replace(/\s+/g, " ").trim(); }
function uniq(arr) { return [...new Set((Array.isArray(arr) ? arr : []).map((x) => safeStr(x).trim()).filter(Boolean))]; }
function lower(v) { return safeStr(v).toLowerCase(); }
function emotionAny(emo, list) { const set = new Set((Array.isArray(list) ? list : []).map((x) => lower(x))); const vals = [emo?.primaryEmotion, emo?.secondaryEmotion, emo?.dominantEmotion].map((x) => lower(x)).filter(Boolean); return vals.some((v) => set.has(v)); }
function hashSeed(seed) { let h = 0; const s = safeStr(seed || "nyx"); for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h >>> 0; }
function pick(arr, seed) { if (!Array.isArray(arr) || !arr.length) return ""; const h = hashSeed(seed); return safeStr(arr[h % arr.length] || ""); }
function joinSentences(parts) { return (Array.isArray(parts) ? parts : []).map((p) => oneLine(p)).filter(Boolean).join(" ").replace(/\s+/g, " ").trim(); }

function looksGreeting(text) {
  const s = safeStr(text).trim().toLowerCase();
  if (!s) return false;
  return /^(hi|hello|hey|good morning|good afternoon|good evening)(\b|[!.?])/.test(s);
}

function looksHowAreYou(text) {
  const s = safeStr(text).trim().toLowerCase();
  if (!s) return false;
  return /^(how are you|how are you doing|how have you been)(\b|[!.?])/.test(s);
}

function looksTechnicalRequest(text) {
  const s = safeStr(text).toLowerCase();
  if (!s) return false;
  return /(chat engine|state spine|support response|emotion route|loop|looping|debug|debugging|patch|update|rebuild|restructure|integrate|implementation|code|script|file|tts|api|route|backend|frontend|runtime|function|syntax|error|bug)/.test(s);
}

function normalizeAudioFailure(input) {
  const bag =
    (isPlainObject(input?.ttsFailure) && input.ttsFailure) ||
    (isPlainObject(input?.audioFailure) && input.audioFailure) ||
    (isPlainObject(input?.turnSignals?.ttsFailure) && input.turnSignals.ttsFailure) ||
    {};
  const explicitAction = lower(bag.action || "");
  const cleared = bag.cleared === true || (bag.ok === true && explicitAction === "clear");
  if (cleared) {
    return { present: false, cleared: true, reason: "", message: "", providerStatus: clampInt(bag.providerStatus || bag.status, 200, 0, 999999), retryable: false, action: "clear", shouldTerminate: false, terminalStopUntil: 0 };
  }
  const reason = lower(bag.reason || bag.message || "");
  const providerStatus = clampInt(bag.providerStatus || bag.status, 0, 0, 999999);
  const retryable = !!bag.retryable;
  const action = /retry/i.test(explicitAction) ? "retry" : /stop|terminal/i.test(explicitAction) ? "stop" : /downgrade/i.test(explicitAction) ? "downgrade" : "";
  const shouldTerminate = !!(bag.shouldTerminate || bag.shouldStop || action === "stop");
  return {
    present: !!(reason || providerStatus || retryable || action),
    cleared: false,
    reason,
    message: safeStr(bag.message || ""),
    providerStatus,
    retryable,
    action: action || (retryable ? "retry" : (providerStatus >= 400 && providerStatus < 500 ? "stop" : (providerStatus >= 500 ? "downgrade" : ""))),
    shouldTerminate,
    terminalStopUntil: Number(bag.terminalStopUntil || 0) || 0
  };
}

function buildAudioFailureLine(audioFailure, seed) {
  if (audioFailure?.cleared || !audioFailure?.present) return "";
  if (audioFailure.shouldTerminate || audioFailure.action === "stop") {
    return pick([
      "Audio is not the move right now, so I am keeping this clean and text-only.",
      "I am not going to keep forcing audio through a broken lane.",
      "The audio path needs to stop here, so I am keeping this stable in text."
    ], `${seed}|audio|stop`);
  }
  if (audioFailure.action === "retry") {
    return pick([
      "Audio hit a temporary snag, so I am keeping the response steady instead of letting that derail the turn.",
      "The voice layer looks transiently unstable, so I am holding the response in a safer lane.",
      "Audio stumbled, but the turn itself does not need to spiral with it."
    ], `${seed}|audio|retry`);
  }
  return pick([
    "Audio is unstable, so I am downgrading this to a cleaner text response.",
    "Rather than pushing a shaky voice path, I am keeping the response usable in text.",
    "The voice path is noisy right now, so text is the safer lane."
  ], `${seed}|audio|downgrade`);
}

function looksNeutralInformational(text) {
  const s = safeStr(text).trim();
  if (!s) return false;
  if (/\?$/.test(s)) return false;
  if (looksTechnicalRequest(s)) return false;
  if (/\b(feel|felt|feeling|lost|depressed|sad|anxious|afraid|worried|lonely|angry|proud|happy|love|great|amazing|beautiful|hopeless|numb|grief|ashamed|guilty)\b/i.test(s)) return false;
  return true;
}

function normalizeEmotion(input) {
  const emo = isPlainObject(input?.emo) ? input.emo : (isPlainObject(input?.emotion) ? input.emotion : {});
  const supportFlags = isPlainObject(emo.supportFlags) ? emo.supportFlags : {};
  const presentationSignals = isPlainObject(emo.presentationSignals)
    ? emo.presentationSignals
    : (isPlainObject(input?.presentationSignals) ? input.presentationSignals : (isPlainObject(input?.turnSignals) ? input.turnSignals : {}));
  const expressionContract = isPlainObject(emo.expressionContract)
    ? emo.expressionContract
    : (isPlainObject(input?.expressionContract) ? input.expressionContract : {});
  const nuanceProfile = isPlainObject(emo.nuanceProfile)
    ? emo.nuanceProfile
    : {};
  const conversationPlan = isPlainObject(emo.conversationPlan)
    ? emo.conversationPlan
    : {};
  return {
    ...emo,
    supportFlags,
    presentationSignals,
    expressionContract,
    nuanceProfile,
    conversationPlan
  };
}

function deriveQuestionBudget(cfg, emo, text) {
  let budget = clampInt(cfg.maxQuestionCount, 1, 0, 2);
  const pressure = lower(emo?.nuanceProfile?.questionPressure || "");
  if (pressure === "none") budget = 0;
  else if (pressure === "low") budget = Math.min(budget, 1);
  const askAtMost = clampInt(emo?.expressionContract?.askAtMost, budget, 0, 2);
  budget = Math.min(budget, askAtMost);
  if (cfg.suppressQuestionOnTechnical && looksTechnicalRequest(text)) budget = 0;
  if (cfg.suppressQuestionOnContainment && emo?.supportFlags?.needsContainment) budget = 0;
  if (cfg.suppressQuestionOnHighDistress && emo?.supportFlags?.highDistress) budget = 0;
  if (emo?.supportFlags?.needsGentlePacing && Number(emo?.intensity || 0) >= 0.75) budget = 0;
  if (cfg.suppressQuestionOnRecovery && emo?.supportFlags?.crisis) budget = 0;
  if (cfg.suppressQuestionOnLoop && emo?.nuanceProfile?.loopRisk === "high") budget = 0;
  if (cfg.suppressQuestionOnHighContinuity && inputContinuityHigh(emo)) budget = 0;
  if (!cfg.allowQuestionsOnPositive && emotionAny(emo, ["joy", "gratitude", "relief", "excitement", "hope"])) budget = 0;
  return budget;
}

function inputContinuityHigh(emo) {
  return !!(emo?.continuity?.high || emo?.supportFlags?.highContinuity || emo?.presentationSignals?.hasContrast || emo?.presentationSignals?.narrativeDensity >= 3);
}

function buildContainmentLine(emo, seed) {
  if (emo?.supportFlags?.crisis) return "";
  if (emo?.supportFlags?.needsContainment || emo?.supportModeCandidate === "validate_and_hold") {
    return pick([
      "We do not need to solve all of it at once.",
      "We can keep this small and steady.",
      "Let us stay with one honest piece at a time."
    ], `${seed}|containment`);
  }
  if (emo?.supportFlags?.needsStabilization || emo?.routeBias === "stabilize") {
    return pick([
      "Let us slow this down and shrink the scope.",
      "We can steady this one piece at a time.",
      "We do not need to let the whole spiral run the room."
    ], `${seed}|stabilize`);
  }
  return "";
}

function buildQuestion(emo, seed, budget) {
  if (budget <= 0) return "";
  const primary = lower(emo?.primaryEmotion || "neutral");
  if (["depressed", "sadness", "grief", "loneliness"].includes(primary)) {
    return pick([
      "What feels heaviest right now?",
      "What part of this is pressing on you the most?",
      "What is hurting the most right now?"
    ], `${seed}|sad|q`);
  }
  if (["anxiety", "fear", "panic", "overwhelm"].includes(primary)) {
    return pick([
      "What is the most urgent part right now?",
      "What is the first thing your mind keeps jumping back to?",
      "Which piece feels most immediate?"
    ], `${seed}|fear|q`);
  }
  if (["shame", "guilt"].includes(primary)) {
    return pick([
      "What part feels hardest to face directly?",
      "What are you blaming yourself for most right now?",
      "What feels most exposed in this for you?"
    ], `${seed}|repair|q`);
  }
  if (["joy", "gratitude", "relief", "excitement", "hope"].includes(primary)) {
    return pick([
      "What do you want to build on next?",
      "What do you want to carry forward from this?",
      "What is the next smart move from here?"
    ], `${seed}|positive|q`);
  }
  if (emo?.routeBias === "clarify") {
    return pick([
      "What is the exact point that feels most unclear?",
      "Which part do you want to isolate first?",
      "What is the cleanest next piece to look at?"
    ], `${seed}|clarify|q`);
  }
  return "Give me the next concrete piece, and I will keep the real thread clear.";
}

function buildOpening(emo, seed) {
  const primary = lower(emo?.primaryEmotion || "neutral");
  if (["depressed", "sadness", "grief", "loneliness"].includes(primary)) {
    return pick([
      "I have the thread.",
      "I have the thread.",
      "You do not have to carry this alone for this moment."
    ], `${seed}|sad|open`);
  }
  if (["anxiety", "fear", "panic", "overwhelm"].includes(primary)) {
    return "I have the thread.";
  }
  if (["shame", "guilt"].includes(primary)) {
    return pick([
      "I have the thread, and I am not meeting this with judgment.",
      "You are allowed to bring this here without getting shamed for it.",
      "We can look at this carefully without turning it into punishment."
    ], `${seed}|repair|open`);
  }
  if (["joy", "gratitude", "relief", "excitement", "hope"].includes(primary)) {
    return pick([
      "That is good to hear.",
      "I like that shift.",
      "That has real lift in it."
    ], `${seed}|positive|open`);
  }
  return "I have the thread.";
}

function buildSupportReply(input = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...(isPlainObject(input.config) ? input.config : {}) };
  const text = oneLine(input.text || "");
  const emit = (reply) => finalizeSupportReply(reply, { ...input, text });
  const emo = normalizeEmotion(input);
  const audioFailure = normalizeAudioFailure(input);
  const seed = `${text}|${emo.primaryEmotion || "neutral"}|${emo.intensity || 0}|${emo.routeBias || "maintain"}`;
  const questionBudget = deriveQuestionBudget(cfg, emo, text);

  if (looksGreeting(text) && !emotionAny(emo, ["depressed", "sadness", "grief", "loneliness", "anxiety", "fear", "panic", "overwhelm", "shame", "guilt"])) {
    return emit("Hey. I am online and ready. Tell me what you want to explore, fix, or understand.");
  }

  if (looksHowAreYou(text) && !emotionAny(emo, ["depressed", "sadness", "grief", "loneliness", "anxiety", "fear", "panic", "overwhelm", "shame", "guilt"])) {
    return emit("I am steady and ready to help. What do you want to get into first?");
  }

  if (looksTechnicalRequest(text)) {
    return emit(joinSentences([
      buildAudioFailureLine(audioFailure, seed),
      emo?.nuanceProfile?.loopRisk === "high"
        ? "I have the technical thread, and I am not going to re-enter a support loop on it."
        : "I have the technical thread.",
      "I will keep the next move tight, concrete, and execution-first."
    ]));
  }

  if (emo.supportFlags?.crisis || emo.escalation_required === true || emo?.guard?.escalation_required === true) {
    return cfg.keepCrisisShort
      ? "Safety first. If you are in immediate danger or might hurt yourself, call your local emergency number right now. In Canada or the United States you can also call or text 988."
      : "Your safety matters more than solving this conversation cleanly. If you are in immediate danger or might hurt yourself, call your local emergency number right now. In Canada or the United States you can also call or text 988.";
  }

  if (emotionAny(emo, ["depressed", "sadness", "grief", "loneliness"]) || /\b(depressed|hopeless|empty|numb|sad|grief|lonely)\b/i.test(text)) {
    return emit(joinSentences([
      buildAudioFailureLine(audioFailure, seed),
      buildOpening(emo, seed),
      buildContainmentLine(emo, seed),
      buildQuestion(emo, seed, questionBudget)
    ]));
  }

  if (emotionAny(emo, ["anxiety", "fear", "panic", "overwhelm"])) {
    return emit(joinSentences([
      buildAudioFailureLine(audioFailure, seed),
      buildOpening(emo, seed),
      buildContainmentLine(emo, seed),
      buildQuestion(emo, seed, questionBudget)
    ]));
  }

  if (emotionAny(emo, ["shame", "guilt"])) {
    return emit(joinSentences([
      buildAudioFailureLine(audioFailure, seed),
      buildOpening(emo, seed),
      buildContainmentLine(emo, seed),
      buildQuestion(emo, seed, questionBudget)
    ]));
  }

  if (emotionAny(emo, ["joy", "gratitude", "relief", "excitement", "hope"])) {
    return emit(joinSentences([
      buildAudioFailureLine(audioFailure, seed),
      buildOpening(emo, seed),
      buildQuestion(emo, seed, questionBudget)
    ]));
  }

  if (looksNeutralInformational(text)) {
    return emit(joinSentences([
      buildAudioFailureLine(audioFailure, seed),
      emo?.routeBias === "clarify"
        ? "I have the thread. Give me one clean beat more, and I will answer directly without flattening the conversation."
        : "I have the thread, and I can answer this directly once you give me one more clean piece of context."
    ]));
  }

  return emit(joinSentences([
    buildAudioFailureLine(audioFailure, seed),
    buildOpening(emo, seed),
    buildContainmentLine(emo, seed),
    buildQuestion(emo, seed, questionBudget)
  ]));
}

module.exports = {
  VERSION,
  DEFAULT_CONFIG,
  buildSupportReply,
  getSupportReply: buildSupportReply,
  default: buildSupportReply,
  normalizeAudioFailure,
  normalizeEmotion,
  scrubLoopPhrases,
  finalizeSupportReply
};
