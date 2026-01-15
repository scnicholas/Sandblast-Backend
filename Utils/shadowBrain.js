"use strict";

/**
 * Shadow Brain — C+ + D (v1.3a PATCHED)
 *  - C+ Probabilistic follow-up weighting (deterministic)
 *  - D Cognitive memory imprinting (behavioral prefs; non-sensitive)
 *
 * PATCHES INCLUDED (v1.3a):
 *  1) Fix decay bug (already in your v1.3) via lastDecayAt
 *  2) Lane alias normalization
 *  3) Session year extraction fallback
 *  4) micro_moment intent supported end-to-end (baseline + bias + evidence)
 *  5) External followUps merge w/ minimum core actions (music)
 *  6) Deterministic signature (no user data)
 *  7) Minimal uiHints for prefetch
 *  8) Safety: rankIntents never returns empty
 */

const DEFAULTS = {
  shadowTtlMs: 45_000,

  imprintTtlMs: 7 * 24 * 60 * 60 * 1000,
  maxImprints: 3000,

  imprintMaxUpdatesPerDay: 24,
  imprintStep: 0.04,
  imprintStepStrong: 0.07,
  imprintMin: 0.05,
  imprintMax: 0.95,

  imprintHalfLifeDays: 14,

  // PATCH: include micro_moment baseline (small but non-zero)
  laneBaselines: {
    music: [
      { intent: "top10_run", w: 0.50 },
      { intent: "story_moment", w: 0.22 },
      { intent: "micro_moment", w: 0.10 },
      { intent: "number1", w: 0.10 },
      { intent: "another_year", w: 0.08 }
    ],
    sponsors: [
      { intent: "collect_property", w: 0.35 },
      { intent: "collect_goal", w: 0.30 },
      { intent: "collect_budget", w: 0.20 },
      { intent: "request_contact", w: 0.15 }
    ],
    schedule: [
      { intent: "what_playing_now", w: 0.40 },
      { intent: "convert_time", w: 0.35 },
      { intent: "set_city", w: 0.15 },
      { intent: "back_to_music", w: 0.10 }
    ],
    movies: [
      { intent: "collect_title", w: 0.35 },
      { intent: "collect_budget", w: 0.25 },
      { intent: "collect_rights", w: 0.25 },
      { intent: "request_contact", w: 0.15 }
    ],
    general: [
      { intent: "clarify", w: 0.45 },
      { intent: "recommend", w: 0.35 },
      { intent: "options", w: 0.20 }
    ]
  },

  // PATCH: micro_moment bias knob added (uses musicStory by default to avoid new knob)
  intentBiasMap: {
    top10_run: { knob: "musicTop10", dir: +1 },
    story_moment: { knob: "musicStory", dir: +1 },
    micro_moment: { knob: "musicStory", dir: +0.6 }, // softer coupling
    number1: { knob: "musicNumber1", dir: +1 },
    another_year: { knob: "momentumFast", dir: +1 },

    recommend: { knob: "recoveryRecommend", dir: +1 },
    options: { knob: "recoveryOptions", dir: +1 },
    clarify: { knob: "questionTolerance", dir: +1 },

    what_playing_now: { knob: "momentumFast", dir: +1 },
    convert_time: { knob: "questionTolerance", dir: +1 },
    set_city: { knob: "questionTolerance", dir: +1 },

    collect_property: { knob: "questionTolerance", dir: +1 },
    collect_goal: { knob: "questionTolerance", dir: +1 },
    collect_budget: { knob: "questionTolerance", dir: +1 },
    request_contact: { knob: "momentumFast", dir: +1 }
  },

  // PATCH: add userAsksMicro boost
  evidenceBoosts: {
    userSaysNextYear: { another_year: +0.22 },
    userSaysAnotherYear: { another_year: +0.18 },
    userAsksStory: { story_moment: +0.25 },
    userAsksMicro: { micro_moment: +0.25 },
    userAsksTop10: { top10_run: +0.25 },
    userAsksNumber1: { number1: +0.25 },
    userVagueOkContinue: { story_moment: +0.10, top10_run: +0.06 },
    userCorrects: { clarify: +0.20 },
    userSaysSwitchMode: { story_moment: +0.08, top10_run: +0.08, number1: +0.05, micro_moment: +0.06 },
    userAsksSchedule: { what_playing_now: +0.18, convert_time: +0.10 },
    userAsksSponsors: { collect_goal: +0.14, collect_property: +0.10 },
    userAsksMovies: { collect_title: +0.14, collect_budget: +0.10 }
  },

  penalties: {
    lowQuestionToleranceClarifyPenalty: 0.15
  },

  candidates: {
    music: {
      top10_run: (year) => ({ label: year ? `Top 10 ${year}` : "Top 10", send: year ? `top 10 ${year}` : "Top 10" }),
      story_moment: (year) => ({ label: year ? `Story moment ${year}` : "Story moment", send: year ? `story moment ${year}` : "Story moment" }),
      micro_moment: (year) => ({ label: year ? `Micro moment ${year}` : "Micro moment", send: year ? `micro moment ${year}` : "Micro moment" }),
      number1: (year) => ({ label: year ? `#1 ${year}` : "#1", send: year ? `#1 ${year}` : "#1" }),
      another_year: () => ({ label: "Another year", send: "another year" }),
      next_year: () => ({ label: "Next year", send: "next year" }),
      prev_year: () => ({ label: "Prev year", send: "prev year" }),
      replay: () => ({ label: "Replay last", send: "replay" }),
      switch_mode: () => ({ label: "Switch mode", send: "switch" }),
      back_to_music: () => ({ label: "Back to music", send: "back to music" })
    },
    sponsors: {
      collect_property: () => ({ label: "TV / Radio / Web?", send: "tv" }),
      collect_goal: () => ({ label: "Goal", send: "brand awareness" }),
      collect_budget: () => ({ label: "Budget", send: "starter_test" }),
      request_contact: () => ({ label: "WhatsApp", send: "whatsapp" }),
      back_to_music: () => ({ label: "Back to music", send: "back to music" })
    },
    schedule: {
      what_playing_now: () => ({ label: "What’s playing now?", send: "what’s playing now" }),
      convert_time: () => ({ label: "Convert time", send: "what time does it play in London" }),
      set_city: () => ({ label: "Set my city", send: "I’m in London" }),
      back_to_music: () => ({ label: "Back to music", send: "back to music" })
    },
    movies: {
      collect_title: () => ({ label: "Movie title", send: "Movie: The Saint" }),
      collect_budget: () => ({ label: "Budget", send: "budget under $1000" }),
      collect_rights: () => ({ label: "Rights", send: "non-exclusive license" }),
      request_contact: () => ({ label: "Email me details", send: "send rate card" }),
      back_to_music: () => ({ label: "Back to music", send: "back to music" })
    },
    general: {
      clarify: () => ({ label: "Clarify", send: "clarify" }),
      recommend: () => ({ label: "Recommend", send: "recommend" }),
      options: () => ({ label: "Options", send: "options" })
    }
  }
};

class TinyLRU {
  constructor(max = 1000) {
    this.max = max;
    this.map = new Map();
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

const IMPRINTS = new TinyLRU(DEFAULTS.maxImprints);

function cleanText(s) {
  return String(s || "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
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
  if (lane === "music" || lane === "musiclane" || lane === "music_lane") return "music";
  if (lane === "sponsors" || lane === "sponsor" || lane === "ads" || lane === "advertising") return "sponsors";
  if (lane === "movies" || lane === "movie" || lane === "film") return "movies";
  if (lane === "schedule" || lane === "programming" || lane === "tv_schedule") return "schedule";
  return "general";
}
function getSessionYear(session) {
  if (!session || typeof session !== "object") return null;
  const candidates = [session.year, session.lastYear, session.lastMusicYear, session.musicYear, session.activeYear];
  for (const v of candidates) {
    const y = clampYear(Number(v));
    if (y) return y;
  }
  return null;
}
function sigOf(lane, year, mode, topIntent) {
  const s = `${lane || ""}|${year || ""}|${mode || ""}|${topIntent || ""}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

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
      dayKey: dayKeyOf(t),
      dayUpdates: 0,
      lastDecayAt: t,
      knobs: {
        musicTop10: 0.50,
        musicStory: 0.50,
        musicNumber1: 0.50,
        momentumFast: 0.50,
        recoveryRecommend: 0.55,
        recoveryOptions: 0.45,
        questionTolerance: 0.50,
        toneCrisp: 0.55,
        toneWarm: 0.45
      }
    };
    IMPRINTS.set(vid, imp);
    return imp;
  }

  const dk = dayKeyOf(t);
  if (imp.dayKey !== dk) {
    imp.dayKey = dk;
    imp.dayUpdates = 0;
  }

  const halfLifeMs = DEFAULTS.imprintHalfLifeDays * 24 * 60 * 60 * 1000;
  const lastDecayAt = Number.isFinite(Number(imp.lastDecayAt)) ? Number(imp.lastDecayAt) : Number(imp.lastSeenAt || t);
  const dt = t - lastDecayAt;

  if (Number.isFinite(dt) && dt > 0) {
    for (const k of Object.keys(imp.knobs || {})) {
      const v = Number(imp.knobs[k]);
      if (!Number.isFinite(v)) continue;
      imp.knobs[k] = clamp(decayToward(0.5, v, halfLifeMs, dt), 0, 1);
    }
    imp.lastDecayAt = t;
  }

  imp.lastSeenAt = t;
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

  if (evidence.userAsksTop10) bumpKnob(imp, "musicTop10", +step);
  if (evidence.userAsksStory) bumpKnob(imp, "musicStory", +step);
  if (evidence.userAsksMicro) bumpKnob(imp, "musicStory", +step * 0.6);
  if (evidence.userAsksNumber1) bumpKnob(imp, "musicNumber1", +step);

  if (evidence.userSaysNextYear || evidence.userSaysAnotherYear) bumpKnob(imp, "momentumFast", +step);

  if (evidence.userSignalsLowQuestions) bumpKnob(imp, "questionTolerance", -step);
  if (evidence.userSignalsWantsExplain) bumpKnob(imp, "questionTolerance", +step);

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

function extractEvidence(userText, lane, mode, year) {
  const t = cleanText(userText || "").toLowerCase();
  const ev = {
    userSaysNextYear: false,
    userSaysAnotherYear: false,
    userAsksStory: false,
    userAsksMicro: false,
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

    strong: false
  };

  if (!t) return ev;

  if (/^\s*(next|next year|year\+1)\b/.test(t)) ev.userSaysNextYear = true;
  if (/^\s*(another year|new year|different year)\b/.test(t)) ev.userSaysAnotherYear = true;

  if (/\b(story moment|story)\b/.test(t)) ev.userAsksStory = true;
  if (/\b(micro moment|micro)\b/.test(t)) ev.userAsksMicro = true;
  if (/\b(top\s*10|top10|top ten)\b/.test(t)) ev.userAsksTop10 = true;
  if (/\b(#\s*1|number\s*1|number\s*one|no\.?\s*1)\b/.test(t)) ev.userAsksNumber1 = true;

  if (/^\s*(ok|okay|sure|yes|continue|go on|carry on)\s*$/.test(t)) ev.userVagueOkContinue = true;

  if (/\b(no[, ]|not that|that’s wrong|thats wrong|actually|i meant|correction)\b/.test(t)) ev.userCorrects = true;

  if (/^\s*(switch|switch mode)\b/.test(t)) ev.userSaysSwitchMode = true;

  if (/\b(schedule|what time|playing now|what's playing|what is playing|timezone|time zone)\b/.test(t)) ev.userAsksSchedule = true;
  if (/\b(sponsor|advertis|rate card|pricing|package|whatsapp)\b/.test(t)) ev.userAsksSponsors = true;
  if (/\b(movies|license|filmhub|bitmax|series|rights)\b/.test(t)) ev.userAsksMovies = true;

  if (/\b(stop asking|don’t ask|don't ask|just do it|skip questions|no questions)\b/.test(t)) {
    ev.userSignalsLowQuestions = true;
    ev.strong = true;
  }
  if (/\b(explain|why|how does|walk me through|detail|step by step)\b/.test(t)) ev.userSignalsWantsExplain = true;

  if (/\b(recommend|suggest|what should i|best option)\b/.test(t)) ev.userSignalsRecommend = true;
  if (/\b(options|choices|list them|give me choices)\b/.test(t)) ev.userSignalsOptions = true;

  const ln = laneOf(lane);
  if (ln !== "schedule" && ev.userAsksSchedule) ev.strong = true;
  if (ln !== "sponsors" && ev.userAsksSponsors) ev.strong = true;
  if (ln !== "movies" && ev.userAsksMovies) ev.strong = true;

  return ev;
}

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
  if (evidence.userAsksMicro) addBoost("userAsksMicro");
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

    const centered = (knobVal - 0.5) * 2.0 * (rule.dir || 1);
    const scale = 0.18;
    it.w += centered * scale;
  }
  return out;
}

function applyPenalties(weights, imp) {
  const out = weights.map((x) => ({ ...x }));
  if (!imp || !imp.knobs) return out;

  const qt = Number(imp.knobs.questionTolerance);
  if (Number.isFinite(qt) && qt < 0.35) {
    for (const it of out) {
      if (it.intent === "clarify") it.w -= DEFAULTS.penalties.lowQuestionToleranceClarifyPenalty;
    }
  }
  return out;
}

// PATCH: never return empty
function rankIntents(lane, evidence, imp) {
  let w = baselineForLane(lane);
  w = applyEvidenceBoosts(w, evidence);
  w = applyImprintBias(w, imp);
  w = applyPenalties(w, imp);
  w = w.map((x) => ({ ...x, w: Math.max(0.001, Number(x.w) || 0.001) }));
  w = normWeights(w);
  w.sort((a, b) => b.w - a.w);

  if (!Array.isArray(w) || w.length === 0) {
    // fallback for safety
    w = normWeights([{ intent: "clarify", w: 1 }]);
  }
  return w;
}

function dedupeCandidates(list) {
  const seen = new Set();
  const out = [];
  for (const c of list || []) {
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

function buildCandidates(lane, year) {
  const ln = laneOf(lane);
  const y = clampYear(Number(year));
  const templates = DEFAULTS.candidates[ln] || DEFAULTS.candidates.general;
  const list = [];

  if (ln === "music") {
    list.push(templates.top10_run(y));
    list.push(templates.story_moment(y));
    list.push(templates.micro_moment(y));
    list.push(templates.number1(y));
    if (y) {
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
    list.push(templates.recommend());
    list.push(templates.options());
    list.push(templates.clarify());
  }

  return dedupeCandidates(list);
}

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

function mergeWithCoreCandidates(lane, year, externalCandidates) {
  const ln = laneOf(lane);
  const core = buildCandidates(ln, year);
  if (!Array.isArray(externalCandidates) || externalCandidates.length === 0) return core;

  if (ln === "music") {
    const merged = [...externalCandidates, ...core];
    return dedupeCandidates(merged);
  }

  const merged = [...externalCandidates];
  const coreBack = core.find((c) => cleanText(c.send).toLowerCase() === "back to music");
  if (coreBack) merged.push(coreBack);
  return dedupeCandidates(merged);
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
    return a.idx - b.idx;
  });

  const orderedChips = scored.map((x) => x.c);
  const candMeta = scored.map((x) => ({ intent: x.intent, w: x.w, label: x.c.label, send: x.c.send }));
  return { ordered: orderedChips, candMeta };
}

function uiHintsFor(lane, topIntent) {
  const ln = laneOf(lane);
  const intent = String(topIntent || "");

  if (ln === "music") {
    if (intent === "top10_run") return { prefetch: ["top10"], nudge: "top10" };
    if (intent === "story_moment") return { prefetch: ["story"], nudge: "story" };
    if (intent === "micro_moment") return { prefetch: ["micro"], nudge: "micro" };
    if (intent === "number1") return { prefetch: ["number1"], nudge: "number1" };
    return { prefetch: ["top10"], nudge: "top10" };
  }
  if (ln === "schedule") return { prefetch: ["schedule"], nudge: "schedule" };
  if (ln === "sponsors") return { prefetch: ["sponsors"], nudge: "sponsors" };
  if (ln === "movies") return { prefetch: ["movies"], nudge: "movies" };
  return { prefetch: [], nudge: "clarify" };
}

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

function prime({ session, visitorId, lane, mode, year, now } = {}) {
  const t = nowMs(now);
  maybeEvictExpired(t);

  const vid = cleanText(visitorId || "");
  if (!vid) return { ok: false };

  const imp = ensureImprint(vid, t);
  if (!imp) return { ok: false };

  const ln = laneOf(lane || (session && session.lane) || "general");
  const y = clampYear(Number(year || getSessionYear(session)));

  if (session && !freshShadow(session, t)) {
    setSessionShadow(session, {
      at: t,
      lane: ln,
      mode: cleanText(mode || (session && (session.activeMusicMode || session.pendingMode)) || ""),
      year: y,
      orderedIntents: [],
      candidates: [],
      prepared: null,
      orderedChips: null,
      sig: null
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
  const y = clampYear(Number(year || getSessionYear(session)));

  const evidence = extractEvidence(userText, ln, mode, y);
  recordImprintEvent(imp, evidence);

  if (session) {
    const sh = getSessionShadow(session) || {};
    sh.at = 0;
    setSessionShadow(session, sh);
  }

  return { ok: true, evidence: slimEvidence(evidence), imprint: slimImprint(imp) };
}

function get({ session, visitorId, lane, mode, year, userText, replyText, followUps, now } = {}) {
  const t = nowMs(now);
  maybeEvictExpired(t);

  const vid = cleanText(visitorId || "");
  if (!vid) return { shadow: null, imprint: null };

  const imp = ensureImprint(vid, t);
  if (!imp) return { shadow: null, imprint: null };

  const ln = laneOf(lane || (session && session.lane) || "general");
  const y = clampYear(Number(year || getSessionYear(session)));

  let sh = session ? getSessionShadow(session) : null;
  const needsRebuild = !sh || !freshShadow(session, t) || sh.lane !== ln || sh.year !== y;

  if (needsRebuild) {
    const evidence = extractEvidence(userText || "", ln, mode, y);
    const ranked = rankIntents(ln, evidence, imp);

    const externalCandidates = Array.isArray(followUps) && followUps.length ? sanitizeExternalFollowUps(followUps) : null;
    const baseCandidates = mergeWithCoreCandidates(ln, y, externalCandidates);

    const ordered = orderCandidatesByIntentWeights(ln, baseCandidates, ranked);
    const topIntent = ranked[0] ? ranked[0].intent : null;

    sh = {
      at: t,
      lane: ln,
      mode: cleanText(mode || (session && (session.activeMusicMode || session.pendingMode)) || ""),
      year: y,
      orderedIntents: ranked.map((r) => ({ intent: r.intent, w: round4(r.w) })),
      candidates: ordered.candMeta.map((c) => ({ intent: c.intent, w: round4(c.w), label: c.label, send: c.send })),
      prepared: {
        year: y,
        lane: ln,
        topIntent,
        uiHints: uiHintsFor(ln, topIntent)
      },
      orderedChips: ordered.ordered.slice(0, 10),
      sig: sigOf(ln, y, (session && session.activeMusicMode) || mode || "", topIntent)
    };

    if (session) setSessionShadow(session, sh);
  }

  return { shadow: slimShadow(sh), imprint: slimImprint(imp) };
}

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
      toneWarm: round4(imp.knobs.toneWarm)
    }
  };
}

function slimEvidence(ev) {
  if (!ev) return null;
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
    orderedChips: Array.isArray(sh.orderedChips) ? sh.orderedChips : null,
    sig: sh.sig || null
  };
}

module.exports = {
  DEFAULTS,
  prime,
  observe,
  get,
  _diag: {
    imprintsSize: () => IMPRINTS.size(),
    _getImprintUnsafe: (visitorId) => IMPRINTS.get(cleanText(visitorId || ""))
  }
};
