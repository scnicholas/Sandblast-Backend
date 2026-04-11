
"use strict";

/**
 * supportResponse.js
 * Deterministic supportive response generator.
 */

const VERSION = "supportResponse v1.8.0 PERSONA-COHESION";

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
  debug: false
};

function safeStr(x) { return x === null || x === undefined ? "" : String(x); }
function isPlainObject(x) { return !!x && typeof x === "object" && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null); }
function clampInt(v, def, min, max) { const n = Number(v); if (!Number.isFinite(n)) return def; const t = Math.trunc(n); if (t < min) return min; if (t > max) return max; return t; }
function oneLine(s) { return safeStr(s).replace(/\s+/g, " ").trim(); }
function uniq(arr) { return [...new Set((Array.isArray(arr) ? arr : []).map((x) => safeStr(x).trim()).filter(Boolean))]; }
function lower(v) { return safeStr(v).toLowerCase(); }
function emotionAny(emo, list) { const set = new Set((Array.isArray(list) ? list : []).map((x) => lower(x))); const vals = [emo?.primaryEmotion, emo?.secondaryEmotion, emo?.dominantEmotion].map((x) => lower(x)).filter(Boolean); return vals.some((v) => set.has(v)); }
function emotionClusterIs(emo, list) { const set = new Set((Array.isArray(list) ? list : []).map((x) => lower(x))); return set.has(lower(emo?.emotionCluster)); }
function hashSeed(seed) { let h = 0; const s = safeStr(seed || "nyx"); for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h >>> 0; }
function pick(arr, seed) { if (!Array.isArray(arr) || !arr.length) return ""; const h = hashSeed(seed); return safeStr(arr[h % arr.length] || ""); }
function pickN(arr, seed, maxCount) { const a = Array.isArray(arr) ? arr.slice() : []; const out = []; if (!a.length || maxCount <= 0) return out; let h = hashSeed(seed); const seen = new Set(); for (let i = 0; i < a.length && out.length < maxCount; i++) { const idx = (h + i) % a.length; const val = safeStr(a[idx] || "").trim(); if (!val || seen.has(val)) continue; seen.add(val); out.push(val); } return out; }
function joinSentences(parts) { return (Array.isArray(parts) ? parts : []).map((p) => oneLine(p)).filter(Boolean).join(" ").replace(/\s+/g, " ").trim(); }


function looksGreeting(text) {
  const s = safeStr(text).trim().toLowerCase();
  if (!s) return false;
  return /^(hi|hello|hey|good morning|good afternoon|good evening)(\b|[!.?])/.test(s);
}

function looksTechnicalRequest(text) {
  const s = safeStr(text).toLowerCase();
  if (!s) return false;
  return /(chat engine|state spine|support response|loop|looping|debug|debugging|patch|update|rebuild|restructure|integrate|implementation|code|script|file|tts|api|route|backend)/.test(s);
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
  return { present: !!(reason || providerStatus || retryable || action), cleared: false, reason, message: safeStr(bag.message || ""), providerStatus, retryable, action: action || (retryable ? "retry" : (providerStatus >= 400 && providerStatus < 500 ? "stop" : (providerStatus >= 500 ? "downgrade" : ""))), shouldTerminate, terminalStopUntil: Number(bag.terminalStopUntil || 0) || 0 };
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
  if (/\b(feel|felt|feeling|lost|depressed|sad|anxious|afraid|worried|lonely|angry|proud|happy|love|great|amazing|beautiful)\b/i.test(s)) return false;
  return true;
}

function buildSupportReply(input = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...(isPlainObject(input.config) ? input.config : {}) };
  const text = oneLine(input.text || "");
  const emo = isPlainObject(input.emo) ? input.emo : (isPlainObject(input.emotion) ? input.emotion : {});
  const audioFailure = normalizeAudioFailure(input);
  const seed = `${text}|${emo.primaryEmotion || "neutral"}|${emo.intensity || 0}`;

  if (looksGreeting(text) && !emotionAny(emo, ["depressed", "sadness", "grief", "loneliness", "anxiety", "fear", "panic", "overwhelm"])) {
    return "I am here. How can I help you today?";
  }

  if (looksTechnicalRequest(text)) {
    return joinSentences([
      buildAudioFailureLine(audioFailure, seed),
      "I have the technical thread.",
      "Give me the exact failure point and I will keep the next move tight."
    ]);
  }

  if (emo.supportFlags?.crisis || emo.escalation_required === true || emo?.guard?.escalation_required === true) {
    return "I am here with you. If you are in immediate danger or might hurt yourself, call your local emergency number right now. In Canada or the United States you can also call or text 988.";
  }

  if (emotionAny(emo, ["depressed", "sadness", "grief", "loneliness"]) || /\b(depressed|hopeless|empty|numb|sad)\b/i.test(text)) {
    return joinSentences([
      pick([
        "I am here with you.",
        "I am with you in this.",
        "You do not have to carry this alone for this moment."
      ], `${seed}|sad|open`),
      pick([
        "We can keep this small and steady.",
        "We do not need to solve all of it at once.",
        "Let us stay with the next honest piece only."
      ], `${seed}|sad|contain`),
      cfg.maxQuestionCount > 0 ? pick([
        "What feels heaviest right now?",
        "What part of this is pressing on you the most?",
        "Do you want to tell me what is hurting the most?"
      ], `${seed}|sad|q`) : ""
    ]);
  }

  if (emotionAny(emo, ["anxiety", "fear", "panic", "overwhelm"])) {
    return joinSentences([
      "I am here with you.",
      pick([
        "Let us slow this down and shrink the scope.",
        "We can steady this one piece at a time.",
        "We do not need to let the whole spiral run the room."
      ], `${seed}|fear|contain`),
      cfg.maxQuestionCount > 0 ? pick([
        "What is the most urgent part right now?",
        "What is the first thing your mind keeps jumping back to?",
        "Which piece feels most immediate?"
      ], `${seed}|fear|q`) : ""
    ]);
  }

  if (emotionAny(emo, ["joy", "gratitude", "relief", "excitement"])) {
    return joinSentences([
      pick(["That is good to hear.", "I like that shift.", "That has real lift in it."], `${seed}|pos|open`),
      cfg.maxQuestionCount > 0 ? pick(["What do you want to build on next?", "What do you want to carry forward from this?", "What is the next smart move from here?"], `${seed}|pos|q`) : ""
    ]);
  }

  if (looksNeutralInformational(text)) {
    return "I have the thread. Give me one clean beat more, and I will answer directly.";
  }

  return joinSentences([
    "I am here with you.",
    cfg.maxQuestionCount > 0 ? "Tell me the next piece, and I will stay with the real thread." : ""
  ]);
}

module.exports = {
  VERSION,
  DEFAULT_CONFIG,
  buildSupportReply,
  getSupportReply: buildSupportReply,
  default: buildSupportReply
};
