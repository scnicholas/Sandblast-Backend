"use strict";

/**
 * Shadow Brain — C+ + D
 *  - C+ Probabilistic follow-up weighting (deterministic)
 *  - D Cognitive memory imprinting (behavioral prefs, not sensitive)
 *
 * Drop-in goals:
 *  - No external deps
 *  - Deterministic weights
 *  - Tiny memory footprint
 *  - Guardrails (caps, decay, TTL)
 *
 * Usage:
 *   const shadowBrain = require("./Utils/shadowBrain");
 *   shadowBrain.prime({ session, visitorId, lane, mode, year, now });
 *   shadowBrain.observe({ session, visitorId, userText, event, lane, mode, year, now });
 *   const { shadow, imprint } = shadowBrain.get({ session, visitorId, lane, mode, year, now });
 *
 *   // Put shadow into response payload to drive chip ordering/prefetch.
 */

const DEFAULTS = {
  // Session shadow TTL (ms): if stale, rebuild candidates
  shadowTtlMs: 45_000,

  // Imprint TTL (ms): evict users if inactive
  imprintTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days

  // Caps: avoid overlearning quickly
  imprintMaxUpdatesPerDay: 24,
  imprintStep: 0.04,        // base update step (small)
  imprintStepStrong: 0.07,  // for high-signal events like explicit "stop asking"
  imprintMin: 0.05,
  imprintMax: 0.95,

  // Decay: old prefs slowly drift toward neutral
  imprintHalfLifeDays: 14, // how quickly preferences fade to baseline

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
  },

  // Strong, deterministic evidence boosts (C+)
  evidenceBoosts: {
    userSaysNextYear: { another_year: +0.22 },
    userSaysAnotherYear: { another_year: +0.18 },
    userAsksStory: { story_moment: +0.25 },
    userAsksTop10: { top10_run: +0.25 },
    userAsksNumber1: { number1: +0.25 },
    userVagueOkContinue: { story_moment: +0.10, top10_run: +0.06 },
    userCorrects: { clarify: +0.20 },
  },

  // Soft penalties to reduce annoying behaviors
  penalties: {
    // When questionTolerance is low, punish "clarify"
    lowQuestionToleranceClarifyPenalty: 0.15,
  },
};

// ---------------------------
// Tiny LRU with TTL eviction
// ---------------------------
class TinyLRU {
  constructor(max = 1000) {
    this.max = max;
    this.map = new Map(); // key -> { value, at }
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return null;
    // refresh LRU order
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, at: Date.now() });
    if (this.map.size > this.max) {
      // delete oldest
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }
  delete(key) {
    this.map.delete(key);
  }
  keys() {
    return Array.from(this.map.keys());
  }
  size() {
    return this.map.size;
  }
}

// Global (process memory). If you later want persistent, swap these.
const IMPRINTS = new TinyLRU(3000);

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function normWeights(arr) {
  const s = arr.reduce((acc, x) => acc + (Number.isFinite(x.w) ? x.w : 0), 0);
  if (s <= 0) {
    const n = arr.length || 1;
    return arr.map(x => ({ ...x, w: 1 / n }));
  }
  return arr.map(x => ({ ...x, w: x.w / s }));
}

function nowMs(provided) {
  return Number.isFinite(provided) ? provided : Date.now();
}

// Exponential decay toward baseline weight 0.5 over time
function decayToward(mid, value, halfLifeMs, dtMs) {
  if (dtMs <= 0) return value;
  // factor = 0.5^(dt/halfLife)
  const factor = Math.pow(0.5, dtMs / halfLifeMs);
  return mid + (value - mid) * factor;
}

function ensureImprint(visitorId, now) {
  const t = nowMs(now);
  let imp = IMPRINTS.get(visitorId);
  if (!imp) {
    imp = {
      visitorId,
      createdAt: t,
      lastSeenAt: t,
      // Update throttling
      dayKey: dayKeyOf(t),
      dayUpdates: 0,

      // Knobs (0..1), start at neutral 0.5 unless you want lane biases
      knobs: {
        // music preferences
        musicTop10: 0.50,
        musicStory: 0.50,
        musicNumber1: 0.50,

        // pacing / momentum
        momentumFast: 0.50, // higher = likes quick transitions

        // recovery preference
        recoveryRecommend: 0.55, // bias slightly toward recommend
        recoveryOptions: 0.45,

        // question tolerance (higher = ok with clarifying questions)
        questionTolerance: 0.50,

        // tone bias (optional knobs you can use later)
        toneCrisp: 0.55,
        toneWarm: 0.45,
      },
    };
    IMPRINTS.set(visitorId, imp);
  } else {
    imp.lastSeenAt = t;
  }
  // TTL eviction is handled lazily by get(); we also decay on access
  imp = applyImprintDecay(imp, t);
  IMPRINTS.set(visitorId, imp);
  return imp;
}

function applyImprintDecay(imp, now) {
  const t = nowMs(now);
  const halfLifeMs = DEFAULTS.imprintHalfLifeDays * 24 * 60 * 60 * 1000;
  const dt = t - (imp._lastDecayAt || imp.lastSeenAt || t);
  if (dt <= 0) {
    imp._lastDecayAt = t;
    return imp;
  }
  // Decay every knob toward 0.5
  const knobs = imp.knobs || {};
  for (const k of Object.keys(knobs)) {
    const v = knobs[k];
    if (!Number.isFinite(v)) continue;
    knobs[k] = decayToward(0.5, v, halfLifeMs, dt);
  }
  imp.knobs = knobs;
  imp._lastDecayAt = t;
  return imp;
}

function dayKeyOf(tsMs) {
  const d = new Date(tsMs);
  // YYYY-MM-DD
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function canUpdateImprint(imp, now) {
  const t = nowMs(now);
  const dk = dayKeyOf(t);
  if (imp.dayKey !== dk) {
    imp.dayKey = dk;
    imp.dayUpdates = 0;
  }
  if (imp.dayUpdates >= DEFAULTS.imprintMaxUpdatesPerDay) return false;
  imp.dayUpdates += 1;
  return true;
}

function bumpKnob(imp, knob, delta, now) {
  if (!imp || !imp.knobs) return;
  const min = DEFAULTS.imprintMin;
  const max = DEFAULTS.imprintMax;
  const v0 = Number.isFinite(imp.knobs[knob]) ? imp.knobs[knob] : 0.5;
  imp.knobs[knob] = clamp(v0 + delta, min, max);
  imp.lastSeenAt = nowMs(now);
}

function parseSignals(userTextRaw) {
  const text = String(userTextRaw || "").trim().toLowerCase();
  const sig = {
    userSaysNextYear: false,
    userSaysAnotherYear: false,
    userAsksStory: false,
    userAsksTop10: false,
    userAsksNumber1: false,
    userVagueOkContinue: false,
    userCorrects: false,
    explicitStopAsking: false,
  };

  if (!text) return sig;

  // Next year variants
  if (/\bnext year\b/.test(text)) sig.userSaysNextYear = true;
  if (/\banother year\b|\bnew year\b/.test(text)) sig.userSaysAnotherYear = true;

  // Mode asks
  if (/\bstory\b/.test(text)) sig.userAsksStory = true;
  if (/\btop\s*10\b|\btop ten\b/.test(text)) sig.userAsksTop10 = true;
  if (/\b#?\s*1\b|\bnumber\s*1\b|\bno\.\s*1\b/.test(text)) sig.userAsksNumber1 = true;

  // Vague continue
  if (/^(ok|okay|go on|continue|sure|yes|yep|yeah)\b/.test(text)) sig.userVagueOkContinue = true;

  // Corrections / frustration (simple deterministic)
  if (/\bno\b.*\bthat\b|\bnot what i meant\b|\byou mean\b|\bactually\b/.test(text)) sig.userCorrects = true;

  // Explicit stop asking (strong signal)
  if (/\bstop asking\b|\btoo many questions\b|\bdon't ask\b/.test(text)) sig.explicitStopAsking = true;

  return sig;
}

function baselineForLane(lane) {
  const l = String(lane || "general").toLowerCase();
  return DEFAULTS.laneBaselines[l] || DEFAULTS.laneBaselines.general;
}

function getBiasMultiplier(imp, intent) {
  const map = DEFAULTS.intentBiasMap[intent];
  if (!map) return 1.0;
  const knob = map.knob;
  const dir = map.dir || +1;
  const v = imp?.knobs?.[knob];
  const vv = Number.isFinite(v) ? v : 0.5;

  // Convert knob (0..1) to multiplier around 1.0
  // 0.5 -> 1.0
  // 0.95 -> ~1.18
  // 0.05 -> ~0.82
  const swing = 0.18;
  const centered = (vv - 0.5) * 2; // -1..+1
  const mult = 1 + dir * swing * centered;
  return clamp(mult, 0.75, 1.25);
}

function applyEvidence(weights, signals) {
  const boosts = DEFAULTS.evidenceBoosts;
  for (const [sigKey, isOn] of Object.entries(signals || {})) {
    if (!isOn) continue;
    const b = boosts[sigKey];
    if (!b) continue;
    for (const [intent, delta] of Object.entries(b)) {
      const item = weights.find(x => x.intent === intent);
      if (item) item.w += delta;
      else weights.push({ intent, w: Math.max(0.01, delta) });
    }
  }
  return weights;
}

function applyPenalties(weights, imp) {
  // If question tolerance is low, penalize clarify
  const qt = imp?.knobs?.questionTolerance;
  const qtv = Number.isFinite(qt) ? qt : 0.5;
  if (qtv < 0.35) {
    const item = weights.find(x => x.intent === "clarify");
    if (item) item.w = Math.max(0.01, item.w - DEFAULTS.penalties.lowQuestionToleranceClarifyPenalty);
  }
  return weights;
}

function computeCandidates({ visitorId, lane, mode, year, userText, now }) {
  const t = nowMs(now);
  const imp = ensureImprint(visitorId || "anon", t);

  // Start from lane baseline
  const base = baselineForLane(lane).map(x => ({ ...x }));

  // Evidence from text
  const signals = parseSignals(userText);
  let weights = applyEvidence(base, signals);

  // Apply imprint bias multipliers
  weights = weights.map(x => ({ ...x, w: x.w * getBiasMultiplier(imp, x.intent) }));

  // Apply penalties
  weights = applyPenalties(weights, imp);

  // Normalize + sort
  weights = normWeights(weights).sort((a, b) => b.w - a.w);

  // Deterministic chip ordering: top intents first
  const orderedIntents = weights.map(x => x.intent);

  // Prefetch hints: top 2 intents (no heavy work here, just flags)
  const prepared = {
    want: orderedIntents.slice(0, 2),
    lane: String(lane || "general"),
    mode: mode || null,
    year: year || null,
    at: t,
  };

  return { imp, candidates: weights, orderedIntents, prepared, signals };
}

function primeShadow({ session, visitorId, lane, mode, year, now }) {
  const t = nowMs(now);
  if (!session) return;
  const res = computeCandidates({ visitorId, lane, mode, year, userText: "", now: t });
  session.shadow = {
    at: t,
    lane: lane || "general",
    mode: mode || null,
    year: year || null,
    candidates: res.candidates,
    orderedIntents: res.orderedIntents,
    prepared: res.prepared,
    lastText: "",
    signals: res.signals,
  };
  return session.shadow;
}

/**
 * Observe user action to update imprint (D).
 *
 * event examples:
 *  - "picked_story" (chip or explicit)
 *  - "picked_top10"
 *  - "picked_number1"
 *  - "picked_next_year"
 *  - "vague_continue"
 *  - "corrected"
 *  - "stop_asking"
 */
function observe({ session, visitorId, userText, event, lane, mode, year, now }) {
  const t = nowMs(now);
  const imp = ensureImprint(visitorId || "anon", t);

  // Update imprint slowly with caps
  if (canUpdateImprint(imp, t)) {
    const step = DEFAULTS.imprintStep;
    const strong = DEFAULTS.imprintStepStrong;

    // Lane-specific preference imprints
    if (String(lane || "").toLowerCase() === "music") {
      if (event === "picked_story") {
        bumpKnob(imp, "musicStory", +step, t);
        bumpKnob(imp, "musicTop10", -step * 0.6, t);
      }
      if (event === "picked_top10") {
        bumpKnob(imp, "musicTop10", +step, t);
        bumpKnob(imp, "musicStory", -step * 0.6, t);
      }
      if (event === "picked_number1") {
        bumpKnob(imp, "musicNumber1", +step, t);
      }
      if (event === "picked_next_year") {
        bumpKnob(imp, "momentumFast", +step, t);
      }
      if (event === "vague_continue") {
        // Vague "ok" indicates user wants Nyx to proceed; bias recommend/act
        bumpKnob(imp, "recoveryRecommend", +step * 0.5, t);
        bumpKnob(imp, "recoveryOptions", -step * 0.5, t);
      }
    }
