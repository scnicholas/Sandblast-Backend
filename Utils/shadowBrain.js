"use strict";

/**
 * Shadow Brain — C+ + D (v1.2)
 *  - C+ Probabilistic follow-up weighting (deterministic)
 *  - D Cognitive memory imprinting (behavioral prefs; non-sensitive)
 *
 * Goals:
 *  - No external deps
 *  - Deterministic weights (no RNG required)
 *  - Tiny memory footprint (in-process LRU + TTL)
 *  - Guardrails (caps, decay, TTL, update throttles)
 *
 * Usage:
 *   const shadowBrain = require("./Utils/shadowBrain");
 *   shadowBrain.prime({ session, visitorId, lane, mode, year, now });
 *   shadowBrain.observe({ session, visitorId, userText, event, lane, mode, year, now });
 *   const { shadow, imprint } = shadowBrain.get({ session, visitorId, lane, mode, year, userText, replyText, followUps, now });
 *
 * Notes:
 *  - This module NEVER stores sensitive personal data.
 *  - It stores only small numeric "knobs" that represent interaction preferences.
 *  - "session" is used for per-session shadow caching only.
 */

/* ======================================================
   Defaults
====================================================== */

const DEFAULTS = {
  // Session shadow TTL (ms): if stale, rebuild candidates
  shadowTtlMs: 45_000,

  // Imprint TTL (ms): evict users if inactive
  imprintTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days

  // LRU cap
  maxImprints: 3000,

  // Caps: avoid overlearning quickly
  imprintMaxUpdatesPerDay: 24,
  imprintStep: 0.04, // base update step (small)
  imprintStepStrong: 0.07, // for high-signal events like explicit correction / "stop asking"
  imprintMin: 0.05,
  imprintMax: 0.95,

  // Decay: old prefs drift toward neutral (0.5)
  imprintHalfLifeDays: 14,

  // Baselines by lane (C+ starting distributions)
  laneBaselines: {
    music: [
      { intent: "top10_run", w: 0.55 },
      { intent: "story_moment", w: 0.25 },
      { intent: "number1", w: 0.10 },
      { intent: "another_year", w: 0.10 },
    ],
    sponsors: [
      { intent: "collect_property", w: 0.35 },
      { intent: "collect_goal", w: 0.30 },
      { intent: "collect_budget", w: 0.20 },
      { intent: "request_contact", w: 0.15 },
    ],
    schedule: [
      { intent: "what_playing_now", w: 0.40 },
      { intent: "convert_time", w: 0.35 },
      { intent: "set_city", w: 0.15 },
      { intent: "back_to_music", w: 0.10 },
    ],
    movies: [
      { intent: "collect_title", w: 0.35 },
      { intent: "collect_budget", w: 0.25 },
      { intent: "collect_rights", w: 0.25 },
      { intent: "request_contact", w: 0.15 },
    ],
    general: [
      { intent: "clarify", w: 0.45 },
      { intent: "recommend", w: 0.35 },
      { intent: "options", w: 0.20 },
    ],
  },

  // Bias mapping: which imprint knobs influence which intents
  intentBiasMap: {
    // music
    top10_run: { knob: "musicTop10", dir: +1 },
    story_moment: { knob: "musicStory", dir: +1 },
    number1: { knob: "musicNumber1", dir: +1 },
    another_year: { knob: "momentumFast", dir: +1 },

    // general
    recommend: { knob: "recoveryRecommend", dir: +1 },
    options: { knob: "recoveryOptions", dir: +1 },
    clarify: { knob: "questionTolerance", dir: +1 },

    // schedule
    what_playing_now: { knob: "momentumFast", dir: +1 },
    convert_time: { knob: "questionTolerance", dir: +1 },
    set_city: { knob: "questionTolerance", dir: +1 },

    // sponsors/movies (light, optional)
    collect_property: { knob: "questionTolerance", dir: +1 },
    collect_goal: { knob: "questionTolerance", dir: +1 },
    collect_budget: { knob: "questionTolerance", dir: +1 },
    request_contact: { knob: "momentumFast", dir: +1 },
  },

  // Strong deterministic evidence boosts (C+)
  evidenceBoosts: {
    userSaysNextYear: { another_year: +0.22 },
    userSaysAnotherYear: { another_year: +0.18 },
    userAsksStory: { story_moment: +0.25 },
    userAsksTop10: { top10_run: +0.25 },
    userAsksNumber1: { number1: +0.25 },
    userVagueOkContinue: { story_moment: +0.10, top10_run: +0.06 },
    userCorrects: { clarify: +0.20 },
    userSaysSwitchMode: { story_moment: +0.08, top10_run: +0.08, number1: +0.05 },
    userAsksSchedule: { what_playing_now: +0.18, convert_time: +0.10 },
    userAsksSponsors: { collect_goal: +0.14, collect_property: +0.10 },
    userAsksMovies: { collect_title: +0.14, collect_budget: +0.10 },
  },

  // Soft penalties
  penalties: {
    lowQuestionToleranceClarifyPenalty: 0.15,
  },

  // Candidate templates (turn intents into UI chips)
  candidates: {
    music: {
      top10_run: (year) => ({
        label: year ? `Top 10 ${year}` : "Top 10",
        send: year ? `top 10 ${year}` : "Top 10",
      }),
      story_moment: (year) => ({
        label: year ? `Story moment ${year}` : "Story moment",
        send: year ? `story moment ${year}` : "Story moment",
      }),
      micro_moment: (year) => ({
        label: year ? `Micro moment ${year}` : "Micro moment",
        send: year ? `micro moment ${year}` : "Micro moment",
      }),
      number1: (year) => ({
        label: year ? `#1 ${year}` : "#1",
        send: year ? `#1 ${year}` : "#1",
      }),
      another_year: () => ({ label: "Another year", send: "another year" }),
      next_year: () => ({ label: "Next year", send: "next year" }),
      prev_year: () => ({ label: "Prev year", send: "prev year" }),
      replay: () => ({ label: "Replay last", send: "replay" }),
      switch_mode: () => ({ label: "Switch mode", send: "switch" }),
      back_to_music: () => ({ label: "Back to music", send: "back to music" }),
    },
    sponsors: {
      collect_property: () => ({ label: "TV / Radio / Web?", send: "tv" }),
      collect_goal: () => ({ label: "Goal", send: "brand awareness" }),
      collect_budget: () => ({ label: "Budget", send: "starter_test" }),
      request_contact: () => ({ label: "WhatsApp", send: "whatsapp" }),
      back_to_music: () => ({ label: "Back to music", send: "back to music" }),
    },
    schedule: {
      what_playing_now: () => ({ label: "What’s playing now?", send: "what’s playing now" }),
      convert_time: () => ({ label: "Convert time", send: "what time does it play in London" }),
      set_city: () => ({ label: "Set my city", send: "I’m in London" }),
      back_to_music: () => ({ label: "Back to music", send: "back to music" }),
    },
    movies: {
      collect_title: () => ({ label: "Movie title", send: "Movie: The Saint" }),
      collect_budget: () => ({ label: "Budget", send: "budget under $1000" }),
      collect_rights: () => ({ label: "Rights", send: "non-exclusive license" }),
      request_contact: () => ({ label: "Email me details", send: "send rate card" }),
      back_to_music: () => ({ label: "Back to music", send: "back to music" }),
    },
    general: {
      clarify: () => ({ label: "Clarify", send: "clarify" }),
      recommend: () => ({ label: "Recommend", send: "recommend" }),
      options: () => ({ label: "Options", send: "options" }),
    },
  },
};

/* ======================================================
   Tiny LRU
====================================================== */

class TinyLRU {
  constructor(max = 1000) {
    this.max = max;
    this.map = new Map(); // key -> { value, at }
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return null;
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, at: Date.now() });
    if (this.map.size > this.max) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }
  delete(key) {
    this.map.delete(key);
  }
  size() {
    return this.map.size;
  }
  keys() {
    return Array.from(this.map.keys());
  }
}

/* ======================================================
   Global memory (process-local)
====================================================== */

const IMPRINTS = new TinyLRU(DEFAULTS.maxImprints);

/* ======================================================
   Utilities
====================================================== */

function cleanText(s) {
  return String(s || "")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function nowMs(provided) {
  return Number.isFinite(provided) ? provided : Date.now();
}

function dayKeyOf(t) {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function normWeights(arr) {
  const s = arr.reduce((acc, x) => acc + (Number.isFinite(x.w) ? x.w : 0), 0);
  if (s <= 0) {
    const n = arr.length || 1;
    return arr.map((x) => ({ ...x, w: 1 / n }));
  }
  return arr.map((x) => ({ ...x, w: x.w / s }));
}

// Exponential decay toward "mid" (0.5 typically)
function decayToward(mid, value, halfLifeMs, dtMs) {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return value;
  if (!Number.isFinite(halfLifeMs) || halfLifeMs <= 0) return value;
  const factor = Math.pow(0.5, dtMs / halfLifeMs);
  return mid + (value - mid) * factor;
}

function clampYear(y) {
  if (!Number.isFinite(y)) return null;
  if (y < 1950 || y > 2024) return null;
  return y;
}

function laneOf(laneRaw) {
  const lane = cleanText(laneRaw || "").toLowerCase();
  if (lane === "music") return "music";
  if (lane === "sponsors") return "sponsors";
  if (lane === "movies") return "movies";
  if (lane === "schedule") return "schedule";
  return "general";
}

/* ======================================================
   Imprints (D)
====================================================== */

function ensureImprint(visitorId, now) {
  const t = nowMs(now);
  const vid = cleanText(visitorId || "");
  if (!vid) return null;

  let imp = IMPRINTS.get(vid);
  if (!imp) {
    imp = {
      visitorId: vid,
      createdAt: t,
      lastSeenAt: t,

      // throttling
      dayKey: dayKeyOf(t),
      dayUpdates: 0,

      // knob values in [0..1], neutral at 0.5
      knobs: {
        // music preferences
        musicTop10: 0.50,
        musicStory: 0.50,
        musicNumber1: 0.50,

        // pacing
        momentumFast: 0.50,

        // recovery preference
        recoveryRecommend: 0.55,
        recoveryOptions: 0.45,

        // question tolerance (higher = more OK with clarifying questions)
        questionTolerance: 0.50,

        // tone bias (reserved for later)
        toneCrisp: 0.55,
        toneWarm: 0.45,
      },
    };
    IMPRINTS.set(vid, imp);
  } else {
    imp.lastSeenAt = t;
  }

  // rollover daily throttles
  const dk = dayKeyOf(t);
  if (imp.dayKey !== dk) {
    imp.dayKey = dk;
    imp.dayUpdates = 0;
  }

  // decay knobs toward 0.5 over time
  const halfLifeMs = DEFAULTS.imprintHalfLifeDays * 24 * 60 * 60 * 1000;
  const dt = t - Number(imp.lastDecayAt || imp.lastSeenAt || t);
  if (Number.isFinite(dt) && dt > 0) {
    for (const k of Object.keys(imp.knobs || {})) {
      const v = Number(imp.knobs[k]);
      if (!Number.isFinite(v)) continue;
      imp.knobs[k] = clamp(decayToward(0.5, v, halfLifeMs, dt), 0, 1);
    }
    imp.lastDecayAt = t;
  }

  return imp;
}

function imprintExpired(imp, now) {
  if (!imp) return true;
  const t = nowMs(now);
  const last = Number(imp.lastSeenAt || 0);
  if (!Number.isFinite(last) || last <= 0) return true;
  return t - last > DEFAULTS.imprintTtlMs;
}

function maybeEvictExpired(now) {
  const t = nowMs(now);
  const keys = IMPRINTS.keys();
  if (!keys.length) return;
  // cheap sweep (bounded)
  const sweepN = Math.min(30, keys.length);
  for (let i = 0; i < sweepN; i++) {
    const k = keys[i];
    const imp = IMPRINTS.get(k);
    if (!imp || imprintExpired(imp, t)) IMPRINTS.delete(k);
  }
}

function canImprintUpdate(imp) {
  if (!imp) return false;
  if (imp.dayUpdates >= DEFAULTS.imprintMaxUpdatesPerDay) return false;
  return true;
}

function bumpKnob(imp, knob, delta) {
  if (!imp || !imp.knobs) return;
  if (!Object.prototype.hasOwnProperty.call(imp.knobs, knob)) return;
  const v = Number(imp.knobs[knob]);
  const nv = clamp(v + delta, DEFAULTS.imprintMin, DEFAULTS.imprintMax);
  imp.knobs[knob] = nv;
}

function recordImprintEvent(imp, evidence) {
  if (!imp) return;
  if (!canImprintUpdate(imp)) return;

  const strong = evidence && evidence.strong === true;
  const step = strong ? DEFAULTS.imprintStepStrong : DEFAULTS.imprintStep;

  // evidence->knob updates (kept sparse and safe)
  if (evidence.userAsksTop10) bumpKnob(imp, "musicTop10", +step);
  if (evidence.userAsksStory) bumpKnob(imp, "musicStory", +step);
  if (evidence.userAsksNumber1) bumpKnob(imp, "musicNumber1", +step);

  if (evidence.userSaysNextYear || evidence.userSaysAnotherYear) bumpKnob(imp, "momentumFast", +step);

  // "stop asking / don't ask / just do it" => lower question tolerance
  if (evidence.userSignalsLowQuestions) bumpKnob(imp, "questionTolerance", -step);

  // "can you explain / why / how" => higher question tolerance
  if (evidence.userSignalsWantsExplain) bumpKnob(imp, "questionTolerance", +step);

  // weak preference (recommend vs options) — only if explicitly asked
  if (evidence.userSignalsRecommend) {
    bumpKnob(imp, "recoveryRecommend", +step);
    bumpKnob(imp, "recoveryOptions", -step * 0.5);
  }
  if (evidence.userSignalsOptions) {
    bumpKnob(imp, "recoveryOptions", +step);
    bumpKnob(imp, "recoveryRecommend", -step * 0.5);
  }

  imp.dayUpdates += 1;
  imp.lastUpdateAt = Date.now();
}

/* ======================================================
   Evidence extraction (deterministic)
====================================================== */

function extractEvidence(userText, lane, mode, year) {
  const t = cleanText(userText || "").toLowerCase();
  const ev = {
    userSaysNextYear: false,
    userSaysAnotherYear: false,
    userAsksStory: false,
    userAsksTop10: false,
    userAsksNumber1: false,
    userVagueOkContinue: false,
    userCorrects: false,
    userSaysSwitchMode: false,

    userAsksSchedule: false,
    userAsksSponsors: false,
    userAsksMovies: false,

    userSignalsLowQuestions: false,
    userSignalsWantsExplain: false,
    userSignalsRecommend: false,
    userSignalsOptions: false,

    strong: false,
  };

  if (!t) return ev;

  // nav
  if (/^\s*(next|next year|year\+1)\b/.test(t)) ev.userSaysNextYear = true;
  if (/^\s*(another year|new year|different year)\b/.test(t)) ev.userSaysAnotherYear = true;

  // modes
  if (/\b(story moment|story)\b/.test(t)) ev.userAsksStory = true;
  if (/\b(top\s*10|top10|top ten)\b/.test(t)) ev.userAsksTop10 = true;
  if (/\b(#\s*1|number\s*1|number\s*one|no\.?\s*1)\b/.test(t)) ev.userAsksNumber1 = true;

  if (/^\s*(ok|okay|sure|yes|continue|go on|carry on)\s*$/.test(t)) ev.userVagueOkContinue = true;

  // user correction signals
  if (/\b(no[, ]|not that|that’s wrong|thats wrong|actually|i meant|correction)\b/.test(t)) ev.userCorrects = true;

  // switch
  if (/^\s*(switch|switch mode)\b/.test(t)) ev.userSaysSwitchMode = true;

  // lane intent
  if (/\b(schedule|what time|playing now|what's playing|what is playing|in london|in toronto|timezone)\b/.test(t)) {
    ev.userAsksSchedule = true;
  }
  if (/\b(sponsor|advertis|rate card|pricing|package|whatsapp)\b/.test(t)) {
    ev.userAsksSponsors = true;
  }
  if (/\b(movies|license|filmhub|bitmax|series|rights)\b/.test(t)) {
    ev.userAsksMovies = true;
  }

  // question tolerance cues
  if (/\b(stop asking|don’t ask|don't ask|just do it|skip questions|no questions)\b/.test(t)) {
    ev.userSignalsLowQuestions = true;
    ev.strong = true;
  }
  if (/\b(explain|why|how does|walk me through|detail|step by step)\b/.test(t)) {
    ev.userSignalsWantsExplain = true;
  }

  // recovery preference
  if (/\b(recommend|suggest|what should i|best option)\b/.test(t)) ev.userSignalsRecommend = true;
  if (/\b(options|choices|list them|give me choices)\b/.test(t)) ev.userSignalsOptions = true;

  // If user explicitly names a lane while in another lane, consider it strong.
  const ln = laneOf(lane);
  if (ln !== "schedule" && ev.userAsksSchedule) ev.strong = true;
  if (ln !== "sponsors" && ev.userAsksSponsors) ev.strong = true;
  if (ln !== "movies" && ev.userAsksMovies) ev.strong = true;

  return ev;
}

/* ======================================================
   Weighting (C+)
====================================================== */

function baselineForLane(lane) {
  const ln = laneOf(lane);
  const base = DEFAULTS.laneBaselines[ln] || DEFAULTS.laneBaselines.general;
  return base.map((x) => ({ intent: x.intent, w: Number(x.w) }));
}

function applyEvidenceBoosts(weights, evidence) {
  const out = weights.map((x) => ({ ...x }));
  const boosts = DEFAULTS.evidenceBoosts;

  function addBoost(mapKey) {
    const boost = boosts[mapKey];
    if (!boost) return;
    for (const it of out) {
      if (Object.prototype.hasOwnProperty.call(boost, it.intent)) {
        it.w += Number(boost[it.intent]) || 0;
      }
    }
  }

  if (evidence.userSaysNextYear) addBoost("userSaysNextYear");
  if (evidence.userSaysAnotherYear) addBoost("userSaysAnotherYear");
  if (evidence.userAsksStory) addBoost("userAsksStory");
  if (evidence.userAsksTop10) addBoost("userAsksTop10");
  if (evidence.userAsksNumber1) addBoost("userAsksNumber1");
  if (evidence.userVagueOkContinue) addBoost("userVagueOkContinue");
  if (evidence.userCorrects) addBoost("userCorrects");
  if (evidence.userSaysSwitchMode) addBoost("userSaysSwitchMode");
  if (evidence.userAsksSchedule) addBoost("userAsksSchedule");
  if (evidence.userAsksSponsors) addBoost("userAsksSponsors");
  if (evidence.userAsksMovies) addBoost("userAsksMovies");

  return out;
}

function applyImprintBias(weights, imp) {
  if (!imp || !imp.knobs) return weights;

  const out = weights.map((x) => ({ ...x }));
  for (const it of out) {
    const rule = DEFAULTS.intentBiasMap[it.intent];
    if (!rule) continue;
    const knobVal = Number(imp.knobs[rule.knob]);
    if (!Number.isFinite(knobVal)) continue;

    // neutral = 0.5. Convert to bias in [-1..+1]
    const centered = (knobVal - 0.5) * 2.0 * (rule.dir || 1);

    // Bias scale (kept conservative)
    const scale = 0.18; // max ~ +/-0.18 weight shift before renorm
    it.w += centered * scale;
  }
  return out;
}

function applyPenalties(weights, imp) {
  const out = weights.map((x) => ({ ...x }));
  if (!imp || !imp.knobs) return out;

  const qt = Number(imp.knobs.questionTolerance);
  if (Number.isFinite(qt) && qt < 0.35) {
    // penalize clarify if user dislikes questions
    for (const it of out) {
      if (it.intent === "clarify") {
        it.w -= DEFAULTS.penalties.lowQuestionToleranceClarifyPenalty;
      }
    }
  }
  return out;
}

function rankIntents(lane, evidence, imp) {
  let w = baselineForLane(lane);
  w = applyEvidenceBoosts(w, evidence);
  w = applyImprintBias(w, imp);
  w = applyPenalties(w, imp);
  w = w.map((x) => ({ ...x, w: Math.max(0.001, Number(x.w) || 0.001) }));
  w = normWeights(w);
  w.sort((a, b) => b.w - a.w);
  return w;
}

/* ======================================================
   Candidates + preparation payload
====================================================== */

function buildCandidates(lane, year, session) {
  const ln = laneOf(lane);
  const y = clampYear(Number(year));

  // Always include a safe nav escape where relevant
  const templates = DEFAULTS.candidates[ln] || DEFAULTS.candidates.general;

  const list = [];

  // Music: include mode set + replay/switch/navigation (if year known)
  if (ln === "music") {
    // Always offer the 3 core modes
    list.push(templates.top10_run(y));
    list.push(templates.story_moment(y));
    list.push(templates.micro_moment(y));
    list.push(templates.number1(y));

    if (y) {
      // These are UI actions; ordering handled by weights
      list.push(templates.next_year());
      list.push(templates.prev_year());
    }
    list.push(templates.another_year());
    list.push(templates.replay());
    list.push(templates.switch_mode());
  } else if (ln === "schedule") {
    list.push(templates.what_playing_now());
    list.push(templates.convert_time());
    list.push(templates.set_city());
    list.push(templates.back_to_music());
  } else if (ln === "sponsors") {
    list.push(templates.collect_property());
    list.push(templates.collect_goal());
    list.push(templates.collect_budget());
    list.push(templates.request_contact());
    list.push(templates.back_to_music());
  } else if (ln === "movies") {
    list.push(templates.collect_title());
    list.push(templates.collect_budget());
    list.push(templates.collect_rights());
    list.push(templates.request_contact());
    list.push(templates.back_to_music());
  } else {
    // general
    list.push(templates.recommend());
    list.push(templates.options());
    list.push(templates.clarify());
  }

  // Dedupe by send
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const send = cleanText(c && c.send);
    const label = cleanText(c && c.label);
    if (!send || !label) continue;
    const k = send.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label, send });
  }

  return out;
}

function intentForCandidate(lane, candidate) {
  const ln = laneOf(lane);
  const send = cleanText(candidate && candidate.send).toLowerCase();
  const label = cleanText(candidate && candidate.label).toLowerCase();

  if (ln === "music") {
    if (send.startsWith("top 10") || label.startsWith("top 10")) return "top10_run";
    if (send.startsWith("story moment") || label.startsWith("story moment")) return "story_moment";
    if (send.startsWith("micro moment") || label.startsWith("micro moment")) return "micro_moment";
    if (send.startsWith("#1") || label.startsWith("#1")) return "number1";
    if (send === "another year") return "another_year";
    if (send === "next year") return "next_year";
    if (send === "prev year") return "prev_year";
    if (send === "replay") return "replay";
    if (send === "switch") return "switch_mode";
    if (send === "back to music") return "back_to_music";
  }

  if (ln === "schedule") {
    if (send.includes("playing now")) return "what_playing_now";
    if (send.includes("what time")) return "convert_time";
    if (send.includes("i’m in") || send.includes("i'm in")) return "set_city";
    if (send === "back to music") return "back_to_music";
  }

  if (ln === "sponsors") {
    if (send === "tv") return "collect_property";
    if (send.includes("awareness") || send.includes("calls") || send.includes("foot")) return "collect_goal";
    if (send.includes("starter") || send.includes("budget")) return "collect_budget";
    if (send.includes("whatsapp") || send.includes("rate")) return "request_contact";
    if (send === "back to music") return "back_to_music";
  }

  if (ln === "movies") {
    if (send.startsWith("movie:")) return "collect_title";
    if (send.includes("budget")) return "collect_budget";
    if (send.includes("license") || send.includes("rights")) return "collect_rights";
    if (send.includes("rate") || send.includes("email")) return "request_contact";
    if (send === "back to music") return "back_to_music";
  }

  if (ln === "general") {
    if (send === "recommend") return "recommend";
    if (send === "options") return "options";
    if (send === "clarify") return "clarify";
  }

  // fallback
  return "clarify";
}

function orderCandidatesByIntentWeights(lane, candidates, rankedIntents) {
  const ln = laneOf(lane);
  const wByIntent = new Map();
  for (const r of rankedIntents || []) wByIntent.set(r.intent, Number(r.w) || 0);

  const scored = (candidates || []).map((c, idx) => {
    const intent = intentForCandidate(ln, c);
    const w = wByIntent.has(intent) ? wByIntent.get(intent) : 0.0001;
    return { c, intent, w, idx };
  });

  scored.sort((a, b) => {
    if (b.w !== a.w) return b.w - a.w;
    return a.idx - b.idx; // deterministic tie-break
  });

  const top = scored.map((x) => x.c);

  // Return also “candidates with scores” for debug/prefetch
  const candMeta = scored.map((x) => ({
    intent: x.intent,
    w: x.w,
    label: x.c.label,
    send: x.c.send,
  }));

  return { ordered: top, candMeta };
}

/* ======================================================
   Session shadow cache (C+)
====================================================== */

function getSessionShadow(session) {
  if (!session || typeof session !== "object") return null;
  return session._shadowBrain || null;
}

function setSessionShadow(session, shadow) {
  if (!session || typeof session !== "object") return;
  session._shadowBrain = shadow;
}

function freshShadow(session, now) {
  const sh = getSessionShadow(session);
  if (!sh) return false;
  const t = nowMs(now);
  const at = Number(sh.at || 0);
  if (!Number.isFinite(at) || at <= 0) return false;
  return t - at <= DEFAULTS.shadowTtlMs;
}

/* ======================================================
   Public API
====================================================== */

function prime({ session, visitorId, lane, mode, year, now } = {}) {
  const t = nowMs(now);
  maybeEvictExpired(t);

  const vid = cleanText(visitorId || "");
  if (!vid) return { ok: false };

  const imp = ensureImprint(vid, t);
  if (!imp) return { ok: false };

  // cache baseline shadow in session to avoid recompute
  const ln = laneOf(lane || (session && session.lane) || "general");
  const y = clampYear(Number(year || (session && (session.lastYear || session.lastMusicYear))));

  if (session && !freshShadow(session, t)) {
    setSessionShadow(session, {
      at: t,
      lane: ln,
      mode: cleanText(mode || (session && (session.activeMusicMode || session.pendingMode)) || ""),
      year: y,
      orderedIntents: [],
      candidates: [],
      prepared: null,
    });
  }

  return { ok: true };
}

function observe({ session, visitorId, userText, event, lane, mode, year, now } = {}) {
  const t = nowMs(now);
  maybeEvictExpired(t);

  const vid = cleanText(visitorId || "");
  if (!vid) return { ok: false };

  const imp = ensureImprint(vid, t);
  if (!imp) return { ok: false };

  const ln = laneOf(lane || (session && session.lane) || "general");
  const y = clampYear(Number(year || (session && (session.lastYear || session.lastMusicYear))));

  const evidence = extractEvidence(userText, ln, mode, y);

  // imprint update (D)
  recordImprintEvent(imp, evidence);

  // invalidate session shadow so next get() rebuilds with latest evidence
  if (session) {
    const sh = getSessionShadow(session) || {};
    sh.at = 0; // force stale
    setSessionShadow(session, sh);
  }

  return { ok: true, evidence: slimEvidence(evidence), imprint: slimImprint(imp) };
}

function get({
  session,
  visitorId,
  lane,
  mode,
  year,
  userText,
  replyText,
  followUps,
  now,
} = {}) {
  const t = nowMs(now);
  maybeEvictExpired(t);

  const vid = cleanText(visitorId || "");
  if (!vid) return { shadow: null, imprint: null };

  const imp = ensureImprint(vid, t);
  if (!imp) return { shadow: null, imprint: null };

  const ln = laneOf(lane || (session && session.lane) || "general");
  const y = clampYear(Number(year || (session && (session.lastYear || session.lastMusicYear))));

  // Try session cache
  let sh = session ? getSessionShadow(session) : null;
  const needsRebuild = !sh || !freshShadow(session, t) || sh.lane !== ln || sh.year !== y;

  if (needsRebuild) {
    const evidence = extractEvidence(userText || "", ln, mode, y);
    const ranked = rankIntents(ln, evidence, imp);

    // candidates can be driven either from engine followUps (if provided) or templates
    const baseCandidates =
      Array.isArray(followUps) && followUps.length
        ? sanitizeExternalFollowUps(followUps)
        : buildCandidates(ln, y, session);

    const ordered = orderCandidatesByIntentWeights(ln, baseCandidates, ranked);

    sh = {
      at: t,
      lane: ln,
      mode: cleanText(mode || (session && (session.activeMusicMode || session.pendingMode)) || ""),
      year: y,
      orderedIntents: ranked.map((r) => ({ intent: r.intent, w: round4(r.w) })),
      candidates: ordered.candMeta.map((c) => ({
        intent: c.intent,
        w: round4(c.w),
        label: c.label,
        send: c.send,
      })),
      prepared: {
        // “prepared” is intentionally lightweight: helps UI prefetch cues
        year: y,
        lane: ln,
        topIntent: ranked[0] ? ranked[0].intent : null,
      },
      // orderedChips can be used by UI if you want to reorder chips on client
      orderedChips: ordered.ordered.slice(0, 8),
    };

    if (session) setSessionShadow(session, sh);
  }

  return { shadow: slimShadow(sh), imprint: slimImprint(imp) };
}

/* ======================================================
   Slimming helpers (don’t leak internals)
====================================================== */

function round4(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

function slimImprint(imp) {
  if (!imp) return null;
  return {
    visitorId: imp.visitorId,
    lastSeenAt: imp.lastSeenAt,
    dayUpdates: imp.dayUpdates,
    knobs: {
      musicTop10: round4(imp.knobs.musicTop10),
      musicStory: round4(imp.knobs.musicStory),
      musicNumber1: round4(imp.knobs.musicNumber1),
      momentumFast: round4(imp.knobs.momentumFast),
      recoveryRecommend: round4(imp.knobs.recoveryRecommend),
      recoveryOptions: round4(imp.knobs.recoveryOptions),
      questionTolerance: round4(imp.knobs.questionTolerance),
      toneCrisp: round4(imp.knobs.toneCrisp),
      toneWarm: round4(imp.knobs.toneWarm),
    },
  };
}

function slimEvidence(ev) {
  if (!ev) return null;
  // only return booleans that matter
  const keys = Object.keys(ev).filter((k) => typeof ev[k] === "boolean" && ev[k] === true);
  return keys.sort();
}

function slimShadow(sh) {
  if (!sh) return null;
  return {
    at: sh.at,
    lane: sh.lane,
    mode: sh.mode || null,
    year: sh.year || null,
    orderedIntents: Array.isArray(sh.orderedIntents) ? sh.orderedIntents : [],
    candidates: Array.isArray(sh.candidates) ? sh.candidates : [],
    prepared: sh.prepared || null,
    // If you want the UI to reorder chips, you can read this and apply it.
    orderedChips: Array.isArray(sh.orderedChips) ? sh.orderedChips : null,
  };
}

/* ======================================================
   External followUp sanitization
====================================================== */

function sanitizeExternalFollowUps(followUps) {
  const out = [];
  const seen = new Set();
  for (const it of followUps || []) {
    const label = cleanText(it && it.label);
    const send = cleanText(it && it.send);
    if (!label || !send) continue;
    const k = send.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label, send });
  }
  return out;
}

/* ======================================================
   Module exports
====================================================== */

module.exports = {
  DEFAULTS,
  prime,
  observe,
  get,

  // (optional) diagnostics hooks
  _diag: {
    imprintsSize: () => IMPRINTS.size(),
    _getImprintUnsafe: (visitorId) => IMPRINTS.get(cleanText(visitorId || "")),
  },
};
