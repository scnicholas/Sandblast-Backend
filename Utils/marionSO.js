"use strict";

/**
 * Utils/marionSO.js
 *
 * MarionSO — Separate Object (SO) mediator module for Nyx.
 * Pure, side-effect-free cognition mediator:
 *   mediate(norm, session, opts) -> cog object
 *
 * Goals:
 * - Keep chatEngine deterministic: Marion only classifies/mediates (mode/intent/budget/dominance)
 * - Keep it safe: no raw user text in traces; bounded outputs; fail-open behavior
 * - Keep it portable: no express, no fs, no index.js imports, no knowledge access
 *
 * v1.0.2 (PSYCH LAYER ALWAYS-ON++++: PsychologyReasoningObject v1 + load/regulation/agency/social pressure wiring)
 * ✅ Adds PsychologyReasoningObject (PRO) computed every turn (no persistence, no raw text stored).
 * ✅ PRO influences budget, dominance, groundingMaxLines, and some intent arbitration (containment on dysregulation).
 * ✅ Deterministic, bounded heuristics; fail-open safe defaults.
 * ✅ Keeps: MarionStyleContract, deterministic clock hook, stricter privacy, tighter intent/stall logic, handoff hints.
 */

const MARION_VERSION = "marionSO v1.0.2";

// -------------------------
// helpers
// -------------------------
function nowMsDefault() {
  return Date.now();
}
function safeStr(x, max = 200) {
  if (x === null || x === undefined) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}
function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype ||
      Object.getPrototypeOf(x) === null)
  );
}
function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
function truthy(v) {
  if (v === true) return true;
  const s = safeStr(v, 40).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}
function sha1Lite(str) {
  // small stable hash (NOT cryptographic) for traces
  const s = safeStr(str, 2000);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function normYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < 1900 || t > 2100) return null;
  return t;
}

// -------------------------
// enums + contracts
// -------------------------
const LATENT_DESIRE = Object.freeze({
  AUTHORITY: "authority",
  COMFORT: "comfort",
  CURIOSITY: "curiosity",
  VALIDATION: "validation",
  MASTERY: "mastery",
});

const MARION_TRACE_MAX = 160; // hard cap in chars

// PsychologyReasoningObject v1 (always-on, bounded, nonverbal)
const PSYCH = Object.freeze({
  LOAD: Object.freeze({
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
  }),
  REG: Object.freeze({
    REGULATED: "regulated",
    STRAINED: "strained",
    DYSREGULATED: "dysregulated",
  }),
  AGENCY: Object.freeze({
    GUIDED: "guided",
    AUTONOMOUS: "autonomous",
  }),
  PRESSURE: Object.freeze({
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
  }),
});

// Marion narration style contract (used by chatEngine/UI, but defined here as canonical policy)
const MARION_STYLE_CONTRACT = Object.freeze({
  maxSentences: 2,
  forbidTokens: [
    "sorry",
    "unfortunately",
    "i think",
    "maybe",
    "might",
    "i’m sorry",
    "im sorry",
  ],
  allowMetaphor: false,
  tone: "system",
  // tag guidance (optional): chat UI may show these on Marion outputs
  tags: Object.freeze({
    ok: "[marion:ok]",
    hold: "[marion:hold]",
    retry: "[marion:retry]",
    deny: "[marion:deny]",
  }),
  // handoff rule: Marion ends, Nyx begins (no blended registers)
  handoff: Object.freeze({
    marionEndsHard: true,
    nyxBeginsAfter: true,
    allowSameTurnSplit: true, // if same payload, must be separated blocks
  }),
});

// -------------------------
// mac mode inference (lightweight)
// -------------------------
function normalizeMacModeRaw(v) {
  const s = safeStr(v, 60).trim().toLowerCase();
  if (!s) return "";
  if (s === "architect" || s === "builder" || s === "dev") return "architect";
  if (s === "user" || s === "viewer" || s === "consumer") return "user";
  if (s === "transitional" || s === "mixed" || s === "both") return "transitional";
  return "";
}

function detectMacModeImplicit(text) {
  // NOTE: we do scan text for mode inference, but we never store raw text.
  const t = safeStr(text, 1400).trim();
  if (!t) return { mode: "", scoreA: 0, scoreU: 0, scoreT: 0, why: [] };

  const s = t.toLowerCase();
  let a = 0,
    u = 0,
    tr = 0;
  const why = [];

  // Architect signals
  if (/\b(let's|lets)\s+(define|design|lock|implement|encode|ship|wire)\b/.test(s)) {
    a += 3;
    why.push("architect:lets-define/design");
  }
  if (/\b(non[-\s]?negotiable|must|hard rule|lock this in|constitution|mediator|pipeline|governor|decision table)\b/.test(s)) {
    a += 3;
    why.push("architect:constraints/architecture");
  }
  if (/\b(step\s*\d+|1\s*,\s*2\s*,\s*3|1\s*2\s*3)\b/.test(s) || /\b\d+\)\s/.test(s)) {
    a += 2;
    why.push("architect:enumeration");
  }
  if (/\b(index\.js|chatengine\.js|statespine\.js|render|cors|session|payload|json|endpoint|route|resolver|pack|tests?)\b/.test(s)) {
    a += 2;
    why.push("architect:technical");
  }

  // User signals
  if (/\b(i('?m)?\s+not\s+sure|help\s+me\s+understand|does\s+this\s+make\s+sense|where\s+do\s+i|get\s+the\s+url)\b/.test(s)) {
    u += 3;
    why.push("user:uncertainty/how-to");
  }
  if (/\b(confused|stuck|frustrated|overwhelmed|worried)\b/.test(s)) {
    u += 2;
    why.push("user:emotion");
  }

  // Transitional signals (mixed)
  if (a > 0 && u > 0) {
    tr += 3;
    why.push("transitional:mixed-signals");
  }

  let mode = "";
  if (tr >= 3) mode = "transitional";
  else if (a >= u + 2) mode = "architect";
  else if (u >= a + 2) mode = "user";
  else mode = "";

  return { mode, scoreA: a, scoreU: u, scoreT: tr, why };
}

// -------------------------
// PSYCHOLOGY LAYER (always-on, deterministic, bounded)
// -------------------------
function estimateCognitiveLoad(norm, session) {
  // No raw storage; we only compute.
  const text = safeStr(norm?.text || "", 1400);
  const s = text.toLowerCase();

  const len = text.length;
  const hasEnum = /\b(step\s*\d+|1\s*,\s*2\s*,\s*3|1\s*2\s*3)\b/.test(s) || /\b\d+\)\s/.test(s);
  const qMarks = (text.match(/\?/g) || []).length;
  const tech = /\b(index\.js|chatengine\.js|statespine\.js|cors|session|payload|endpoint|route|resolver|json|tests?)\b/.test(s);
  const urgent = /\b(asap|urgent|right now|immediately|quick|fast)\b/.test(s);

  let score = 0;
  if (len >= 900) score += 2;
  else if (len >= 450) score += 1;

  if (qMarks >= 3) score += 1;
  if (hasEnum) score += 1;
  if (tech) score += 1;
  if (urgent) score += 1;

  // If user is stalled, treat as slightly higher load (friction increases load)
  const lastAdvanceAt = Number(isPlainObject(session) ? session.lastAdvanceAt : 0) || 0;
  const now = Number(norm?.__nowMs || 0) || 0; // optional, injected by caller; if absent, ignored
  if (lastAdvanceAt && now && now - lastAdvanceAt > 90 * 1000) score += 1;

  if (score >= 4) return PSYCH.LOAD.HIGH;
  if (score >= 2) return PSYCH.LOAD.MEDIUM;
  return PSYCH.LOAD.LOW;
}

function estimateRegulationState(norm) {
  const text = safeStr(norm?.text || "", 1400).toLowerCase();

  // Dysregulated signals (containment)
  if (
    /\b(panic|i can'?t breathe|i'?m freaking out|meltdown|spiral|breakdown|i can'?t do this)\b/.test(text)
  ) {
    return PSYCH.REG.DYSREGULATED;
  }

  // Strained signals
  if (
    /\b(overwhelmed|stuck|frustrated|anxious|stress(ed)?|worried|i'?m not sure|confused)\b/.test(text)
  ) {
    return PSYCH.REG.STRAINED;
  }

  return PSYCH.REG.REGULATED;
}

function estimateAgencyPreference(norm, session, mode) {
  const text = safeStr(norm?.text || "", 1400).toLowerCase();

  // If user explicitly asks for a plan / tell me what to do -> guided
  if (/\b(give me a plan|tell me what to do|decide for me|just pick|do it)\b/.test(text)) {
    return PSYCH.AGENCY.GUIDED;
  }

  // If user asks for options / ideas -> autonomous
  if (/\b(options|ideas|what are my choices|pick from|menu)\b/.test(text)) {
    return PSYCH.AGENCY.AUTONOMOUS;
  }

  // If in architect mode, default guided (fast forward); user mode default autonomous
  if (safeStr(mode || "").toLowerCase() === "architect") return PSYCH.AGENCY.GUIDED;
  if (safeStr(mode || "").toLowerCase() === "user") return PSYCH.AGENCY.AUTONOMOUS;

  // Continuity: if user recently accepted chips/clicks, treat as guided
  const clicked = !!(norm?.turnSignals?.hasPayload && norm?.turnSignals?.payloadActionable);
  if (clicked) return PSYCH.AGENCY.GUIDED;

  return PSYCH.AGENCY.GUIDED;
}

function estimateSocialPressure(norm, session) {
  const text = safeStr(norm?.text || "", 1400).toLowerCase();
  // Heuristic: public/demo/stakeholder language increases pressure.
  if (/\b(demo|client|stakeholder|investor|sponsor|launch|press|deadline|meeting)\b/.test(text)) {
    return PSYCH.PRESSURE.HIGH;
  }
  if (/\b(team|we need|today|this week|timeline)\b/.test(text)) {
    return PSYCH.PRESSURE.MEDIUM;
  }
  return PSYCH.PRESSURE.LOW;
}

function computePsychologyReasoningObject(norm, session, medSeed) {
  const mode = safeStr(medSeed?.mode || "", 20).toLowerCase();
  const load = estimateCognitiveLoad(norm, session);
  const regulationState = estimateRegulationState(norm);
  const agencyPreference = estimateAgencyPreference(norm, session, mode);
  const socialPressure = estimateSocialPressure(norm, session);

  // Motivation comes from latent desire (computed later), but we still output a slot.
  return {
    cognitiveLoad: load,
    regulationState,
    motivation: "", // filled after latent desire inference
    agencyPreference,
    socialPressure,
  };
}

// Apply PRO impacts to mediator outputs (budget/dominance/grounding and containment)
function applyPsychologyToMediator(cog, psych) {
  const out = isPlainObject(cog) ? { ...cog } : {};
  const p = isPlainObject(psych) ? psych : {};

  // Budget tightening under high load or high pressure
  if (p.cognitiveLoad === PSYCH.LOAD.HIGH || p.socialPressure === PSYCH.PRESSURE.HIGH) {
    out.budget = "short";
  }

  // Containment on dysregulation: avoid sprawl, keep firm structure (but not harsh)
  if (p.regulationState === PSYCH.REG.DYSREGULATED) {
    out.intent = out.actionable ? "ADVANCE" : "STABILIZE";
    out.dominance = "firm";
    out.groundingMaxLines = Math.max(0, Math.min(2, Number(out.groundingMaxLines || 0) || 0));
  }

  // Strained: reduce ambiguity; prefer clarify over wander
  if (p.regulationState === PSYCH.REG.STRAINED && !out.actionable) {
    out.intent = "CLARIFY";
    if (out.dominance !== "firm") out.dominance = "neutral";
    out.groundingMaxLines = Math.max(0, Math.min(1, Number(out.groundingMaxLines || 0) || 0));
  }

  // Agency preference affects dominance posture slightly
  if (p.agencyPreference === PSYCH.AGENCY.GUIDED) {
    if (out.intent === "ADVANCE") out.dominance = out.dominance === "soft" ? "neutral" : out.dominance;
  } else if (p.agencyPreference === PSYCH.AGENCY.AUTONOMOUS) {
    if (out.dominance === "firm" && out.intent !== "ADVANCE") out.dominance = "neutral";
  }

  out.psychology = {
    cognitiveLoad: safeStr(p.cognitiveLoad || "", 12),
    regulationState: safeStr(p.regulationState || "", 16),
    motivation: safeStr(p.motivation || "", 16),
    agencyPreference: safeStr(p.agencyPreference || "", 16),
    socialPressure: safeStr(p.socialPressure || "", 12),
  };

  return out;
}

// -------------------------
// intent classification (expects precomputed turnSignals when available)
// -------------------------
function classifyTurnIntent(norm) {
  const text = safeStr(norm?.text || "", 1200).trim().toLowerCase();
  const action = safeStr(norm?.action || "", 80).trim();

  const hasPayload = !!norm?.turnSignals?.hasPayload;
  const textEmpty = !!norm?.turnSignals?.textEmpty;
  const payloadActionable = !!norm?.turnSignals?.payloadActionable;
  const payloadAction = safeStr(norm?.turnSignals?.payloadAction || "", 60).trim();
  const payloadYear = normYear(norm?.turnSignals?.payloadYear);

  const actionable =
    !!action ||
    (payloadActionable && hasPayload && (payloadAction || payloadYear !== null)) ||
    (payloadActionable && textEmpty && hasPayload);

  // Constitution: actionable always ADVANCE
  if (actionable) return "ADVANCE";

  // Stabilize has priority when explicit emotion/dysregulation shows up
  if (/\b(i('?m)?\s+stuck|i('?m)?\s+worried|overwhelmed|frustrated|anxious|panic|stress(ed)?|reassure|calm)\b/.test(text)) {
    return "STABILIZE";
  }

  // Clarify patterns
  if (/\b(explain|how do i|how to|what is|walk me through|where do i|get|why|help me)\b/.test(text)) {
    return "CLARIFY";
  }

  return "CLARIFY";
}

// -------------------------
// latent desire inference
// -------------------------
function inferLatentDesire(norm, session, med) {
  const t = safeStr(norm?.text || "", 1400).toLowerCase();
  const a = safeStr(norm?.action || "", 80).toLowerCase();
  const mode = safeStr(med?.mode || "", 20).toLowerCase();

  // Strong mastery signals
  if (/\b(optimi[sz]e|systems?|framework|architecture|hard(en)?|constraints?|regression tests?|unit tests?|audit|refactor|contract|deterministic)\b/.test(t)) {
    return LATENT_DESIRE.MASTERY;
  }

  if (/\b(am i right|do i make sense|how am i perceived|handsome|attractive|validation|do you think)\b/.test(t)) {
    return LATENT_DESIRE.VALIDATION;
  }

  if (/\b(why|meaning|connect|pattern|link|what connects|deeper|layer)\b/.test(t)) {
    return LATENT_DESIRE.CURIOSITY;
  }

  if (/\b(worried|overwhelmed|stuck|anxious|stress|reassure|calm)\b/.test(t)) {
    return LATENT_DESIRE.COMFORT;
  }

  // counselor-lite typically comfort/clarity
  if (a === "counsel_intro") return LATENT_DESIRE.COMFORT;

  // Music interactions typically seek anchoring/authority unless explicitly reflective
  if (a === "top10" || a === "yearend_hot100") return LATENT_DESIRE.AUTHORITY;
  if (a === "story_moment" || a === "micro_moment" || a === "custom_story") return LATENT_DESIRE.COMFORT;

  // Architect mode leans authority/mastery depending on density
  if (mode === "architect") {
    if (/\bdesign|implement|encode|ship|lock|wire|merge|pin|canonical\b/.test(t)) return LATENT_DESIRE.MASTERY;
    return LATENT_DESIRE.AUTHORITY;
  }

  // continuity: comfort if already in velvet, else curiosity
  if (truthy(session?.velvetMode)) return LATENT_DESIRE.COMFORT;

  return LATENT_DESIRE.CURIOSITY;
}

// -------------------------
// confidence inference
// -------------------------
function inferConfidence(norm, session, med) {
  const s = isPlainObject(session) ? session : {};
  const text = safeStr(norm?.text || "", 1400).trim();
  const action = safeStr(norm?.action || "", 80).trim();
  const hasPayload = !!norm?.turnSignals?.hasPayload;
  const textEmpty = !!norm?.turnSignals?.textEmpty;
  const actionablePayload = !!norm?.turnSignals?.payloadActionable;

  // user confidence proxy
  let user = 0.5;

  if (
    action ||
    (actionablePayload &&
      hasPayload &&
      (safeStr(norm?.turnSignals?.payloadAction || "", 60).trim() ||
        normYear(norm?.turnSignals?.payloadYear) !== null))
  ) {
    user += 0.15;
  }

  if (textEmpty && hasPayload && actionablePayload) user += 0.05;

  if (/\b(i('?m)?\s+not\s+sure|confused|stuck|overwhelmed)\b/i.test(text)) user -= 0.25;
  if (/\b(are you sure|really\??)\b/i.test(text)) user -= 0.1;

  // Nyx confidence: how firmly she should lead
  let nyx = 0.55;

  if (safeStr(med?.intent || "", 20).toUpperCase() === "ADVANCE") nyx += 0.15;
  if (safeStr(med?.intent || "", 20).toUpperCase() === "STABILIZE") nyx -= 0.25;

  // repetition can increase Nyx lead slightly
  const lastAction = safeStr(s.lastAction || "", 80).trim();
  const lastYear = normYear(s.lastYear);
  const yr = normYear(norm?.year);
  if (lastAction && lastAction === action && lastYear && yr && lastYear === yr) nyx += 0.1;

  // Mode arbitration
  const mode = safeStr(med?.mode || "", 20).toLowerCase();
  if (mode === "architect" || mode === "transitional") nyx += 0.05;
  if (mode === "user") nyx -= 0.05;

  return { user: clamp01(user), nyx: clamp01(nyx) };
}

// -------------------------
// velvet mode (music-first)
// -------------------------
function computeVelvet(norm, session, med, desire, now) {
  const s = isPlainObject(session) ? session : {};
  const action = safeStr(norm?.action || "", 80).trim();
  const lane = safeStr(norm?.lane || "", 40).trim() || (action ? "music" : "");
  const yr = normYear(norm?.year);
  const lastYear = normYear(s.lastYear);
  const lastLane = safeStr(s.lane || "", 40).trim();

  const already = truthy(s.velvetMode);

  const wantsDepth =
    action === "story_moment" ||
    action === "micro_moment" ||
    action === "custom_story" ||
    /\b(why|meaning|connect|deeper|layer)\b/i.test(safeStr(norm?.text || "", 1400));

  const repeatedTopic = !!(lastLane && lane && lastLane === lane && yr && lastYear && yr === lastYear);

  const acceptedChip = !!(
    norm?.turnSignals?.hasPayload &&
    norm?.turnSignals?.payloadActionable &&
    (safeStr(norm?.turnSignals?.payloadAction || "", 60).trim() ||
      normYear(norm?.turnSignals?.payloadYear) !== null)
  );

  // music-first eligibility
  const musicFirstEligible = lane === "music" || !!action;

  let signals = 0;
  if (wantsDepth) signals++;
  if (repeatedTopic) signals++;
  if (acceptedChip) signals++;
  if (clamp01(med?.confidence?.nyx) >= 0.6) signals++;
  if (desire === LATENT_DESIRE.COMFORT || desire === LATENT_DESIRE.CURIOSITY) signals++;

  if (!musicFirstEligible) {
    return {
      velvet: already,
      velvetSince: Number(s.velvetSince || 0) || 0,
      reason: already ? "carry" : "no",
    };
  }

  if (already) {
    if (safeStr(med?.intent || "", 20).toUpperCase() === "STABILIZE") {
      return { velvet: false, velvetSince: Number(s.velvetSince || 0) || 0, reason: "stabilize_exit" };
    }
    if (lastLane && lane && lastLane !== lane) {
      return { velvet: false, velvetSince: Number(s.velvetSince || 0) || 0, reason: "lane_shift_exit" };
    }
    return { velvet: true, velvetSince: Number(s.velvetSince || 0) || now, reason: "hold" };
  }

  if (signals >= 2) return { velvet: true, velvetSince: now, reason: "entry" };

  return { velvet: false, velvetSince: 0, reason: "no" };
}

// -------------------------
// bounded trace (no raw user text)
// -------------------------
function buildTrace(norm, session, med) {
  const y = normYear(norm?.year);
  const parts = [
    `m=${safeStr(med?.mode || "", 20)}`,
    `i=${safeStr(med?.intent || "", 20)}`,
    `d=${safeStr(med?.dominance || "", 20)}`,
    `b=${safeStr(med?.budget || "", 20)}`,
    `a=${safeStr(norm?.action || "", 60) || "-"}`,
    `y=${y !== null ? y : "-"}`,
    `p=${med?.actionable ? "1" : "0"}`,
    `e=${med?.textEmpty ? "1" : "0"}`,
    `st=${med?.stalled ? "1" : "0"}`,
    `ld=${safeStr(med?.latentDesire || "", 20)}`,
    `cu=${String(Math.round(clamp01(med?.confidence?.user) * 100))}`,
    `cn=${String(Math.round(clamp01(med?.confidence?.nyx) * 100))}`,
    `v=${med?.velvet ? "1" : "0"}`,
    `vr=${safeStr(med?.velvetReason || "", 30) || "-"}`,
    // psych (bounded)
    `pl=${safeStr(med?.psychology?.cognitiveLoad || "", 8) || "-"}`,
    `pr=${safeStr(med?.psychology?.regulationState || "", 12) || "-"}`,
    `pa=${safeStr(med?.psychology?.agencyPreference || "", 10) || "-"}`,
    `ps=${safeStr(med?.psychology?.socialPressure || "", 8) || "-"}`,
  ];

  const base = parts.join("|");
  if (base.length <= MARION_TRACE_MAX) return base;
  return base.slice(0, MARION_TRACE_MAX - 3) + "...";
}
function hashTrace(trace) {
  return sha1Lite(safeStr(trace, 400)).slice(0, 10);
}

// -------------------------
// main: mediate
// -------------------------
function mediate(norm, session, opts = {}) {
  // FAIL-OPEN: any error returns safe defaults
  try {
    const s = isPlainObject(session) ? session : {};
    const n = isPlainObject(norm) ? norm : {};
    const o = isPlainObject(opts) ? opts : {};

    const clockNow = typeof o.nowMs === "function" ? o.nowMs : nowMsDefault;
    const now = Number(clockNow()) || nowMsDefault();

    // (optional) allow psych load estimator to use clock without storing anything
    n.__nowMs = now;

    const hasPayload = !!n?.turnSignals?.hasPayload;
    const textEmpty = !!n?.turnSignals?.textEmpty;
    const payloadActionable = !!n?.turnSignals?.payloadActionable;

    // Mode: default to ARCHITECT when uncertain (your constitution)
    const macModeOverride =
      normalizeMacModeRaw(
        n?.turnSignals?.macModeOverride ||
          n?.macModeOverride ||
          n?.macMode ||
          n?.payload?.macMode ||
          n?.payload?.mode ||
          n?.body?.macMode ||
          n?.body?.mode ||
          ""
      ) || "";

    const implicit = detectMacModeImplicit(n.text || "");
    let mode = macModeOverride || implicit.mode || "";
    if (!mode) mode = "architect";
    if (mode !== "architect" && mode !== "user" && mode !== "transitional") mode = "architect";

    // Momentum / stall heuristic
    const lastAdvanceAt = Number(s.lastAdvanceAt || 0) || 0;
    const stalled = lastAdvanceAt ? now - lastAdvanceAt > 90 * 1000 : false;

    // Intent (with constitution: action wins)
    let intent = safeStr(n.turnIntent || "", 20).trim().toUpperCase();
    if (!intent || (intent !== "ADVANCE" && intent !== "CLARIFY" && intent !== "STABILIZE")) {
      intent = classifyTurnIntent(n);
    }

    // actionable definition (tightened)
    const payloadAction = safeStr(n?.turnSignals?.payloadAction || "", 60).trim();
    const payloadYear = normYear(n?.turnSignals?.payloadYear);

    const actionable =
      !!safeStr(n.action || "", 80).trim() ||
      (payloadActionable && hasPayload && (payloadAction || payloadYear !== null)) ||
      (payloadActionable && textEmpty && hasPayload);

    if (actionable) intent = "ADVANCE";

    // If stalled and not actionable, prefer CLARIFY (avoid spinning)
    if (stalled && (mode === "architect" || mode === "transitional") && intent !== "ADVANCE") {
      intent = "CLARIFY";
    }

    // Dominance & budget baseline
    let dominance = "neutral"; // firm | neutral | soft
    let budget = "medium"; // short | medium

    if (mode === "architect" || mode === "transitional") {
      budget = "short";
      dominance = intent === "ADVANCE" ? "firm" : "neutral";
    } else {
      budget = "medium";
      dominance = intent === "ADVANCE" ? "neutral" : "soft";
    }

    // grounding allowance (how many “why/meaning” lines Nyx can add before action)
    const grounding = mode === "user" || mode === "transitional";
    const groundingMaxLines = intent === "STABILIZE" ? 3 : grounding ? 1 : 0;

    // --- PSYCH LAYER (always-on) ---
    const psych0 = computePsychologyReasoningObject(n, s, { mode, intent, dominance, budget, actionable, textEmpty, stalled });

    // Desire + confidence (arbitrated here)
    const latentDesire = inferLatentDesire(n, s, { mode, intent, dominance, budget });
    const confidence = inferConfidence(n, s, { mode, intent, dominance, budget });

    // Fill motivation from latent desire (bounded mapping)
    psych0.motivation = safeStr(latentDesire || "", 16);

    // Velvet binding (music-first)
    const velvet = computeVelvet(
      n,
      s,
      { mode, intent, dominance, budget, confidence },
      latentDesire,
      now
    );

    // dominance correction
    if (velvet.velvet && mode === "user" && intent !== "ADVANCE") dominance = "soft";
    if (
      latentDesire === LATENT_DESIRE.MASTERY &&
      (mode === "architect" || mode === "transitional") &&
      intent === "ADVANCE"
    ) {
      dominance = "firm";
    }

    // Marion state machine (light)
    let marionState = "SEEK"; // SEEK | DELIVER | STABILIZE | BRIDGE
    let marionReason = "default";
    const a = safeStr(n.action || "", 80).trim();

    if (intent === "STABILIZE") {
      marionState = "STABILIZE";
      marionReason = "intent_stabilize";
    } else if (intent === "ADVANCE") {
      marionState = "DELIVER";
      marionReason = actionable ? "actionable" : "advance";
    } else if (a === "switch_lane" || a === "ask_year") {
      marionState = "BRIDGE";
      marionReason = "routing";
    } else {
      marionState = "SEEK";
      marionReason = "clarify";
    }

    // Build base cog
    let cog = {
      // identity
      marionVersion: MARION_VERSION,

      // main outputs
      mode,
      intent,
      dominance,
      budget,

      // turn features
      stalled: !!stalled,
      actionable: !!actionable,
      textEmpty: !!textEmpty,
      groundingMaxLines,

      // cognitive scalars
      latentDesire,
      confidence: {
        user: clamp01(confidence.user),
        nyx: clamp01(confidence.nyx),
      },

      // velvet binding
      velvet: !!velvet.velvet,
      velvetSince: velvet.velvet ? Number(velvet.velvetSince || 0) || now : 0,
      velvetReason: safeStr(velvet.reason || "", 40),

      // state machine
      marionState,
      marionReason,

      // style + handoff policy (pure hints)
      marionStyle: MARION_STYLE_CONTRACT,
      handoff: {
        marionEndsHard: true,
        nyxBeginsAfter: true,
        allowSameTurnSplit: true,
        marionTagSuggested:
          intent === "ADVANCE"
            ? MARION_STYLE_CONTRACT.tags.ok
            : intent === "STABILIZE"
            ? MARION_STYLE_CONTRACT.tags.hold
            : MARION_STYLE_CONTRACT.tags.ok,
      },

      // explainability hooks (safe)
      macModeOverride: macModeOverride || "",
      macModeWhy: Array.isArray(implicit.why)
        ? implicit.why.slice(0, 6).map((x) => safeStr(x, 60))
        : [],
    };

    // Apply psychology impacts last (so it can override intent/budget/dominance safely)
    cog = applyPsychologyToMediator(cog, psych0);

    // trace (no raw text)
    const trace = buildTrace(n, s, {
      ...cog,
      confidence: cog.confidence,
      latentDesire: cog.latentDesire,
      velvet: cog.velvet,
      velvetReason: cog.velvetReason,
      stalled: cog.stalled,
      actionable: cog.actionable,
      textEmpty: cog.textEmpty,
      psychology: cog.psychology,
    });

    cog.marionTrace = safeStr(trace, MARION_TRACE_MAX + 8);
    cog.marionTraceHash = hashTrace(trace);

    // Optional policy hooks (future-safe)
    if (o && o.forceBudget && (o.forceBudget === "short" || o.forceBudget === "medium")) {
      cog.budget = o.forceBudget;
    }
    if (o && o.forceDominance && (o.forceDominance === "firm" || o.forceDominance === "neutral" || o.forceDominance === "soft")) {
      cog.dominance = o.forceDominance;
    }
    if (o && o.forceIntent && (o.forceIntent === "ADVANCE" || o.forceIntent === "CLARIFY" || o.forceIntent === "STABILIZE")) {
      cog.intent = o.forceIntent;
    }
    if (o && typeof o.forceVelvet === "boolean") {
      cog.velvet = o.forceVelvet;
      cog.velvetSince = o.forceVelvet ? now : 0;
      cog.velvetReason = o.forceVelvet ? "forced_on" : "forced_off";
    }

    return cog;
  } catch (e) {
    // fail-open, never break UX
    const code = safeStr(e && (e.code || e.name) ? e.code || e.name : "ERR", 40);
    return {
      marionVersion: MARION_VERSION,
      mode: "architect",
      intent: "CLARIFY",
      dominance: "neutral",
      budget: "short",
      stalled: false,
      actionable: false,
      textEmpty: false,
      groundingMaxLines: 0,
      latentDesire: LATENT_DESIRE.CURIOSITY,
      confidence: { user: 0.5, nyx: 0.55 },
      velvet: false,
      velvetSince: 0,
      velvetReason: "fail_open",
      marionState: "SEEK",
      marionReason: "fail_open",
      psychology: {
        cognitiveLoad: PSYCH.LOAD.MEDIUM,
        regulationState: PSYCH.REG.REGULATED,
        motivation: LATENT_DESIRE.CURIOSITY,
        agencyPreference: PSYCH.AGENCY.GUIDED,
        socialPressure: PSYCH.PRESSURE.LOW,
      },
      marionStyle: MARION_STYLE_CONTRACT,
      handoff: {
        marionEndsHard: true,
        nyxBeginsAfter: true,
        allowSameTurnSplit: true,
        marionTagSuggested: MARION_STYLE_CONTRACT.tags.retry,
      },
      marionTrace: "fail_open",
      marionTraceHash: sha1Lite("fail_open").slice(0, 10),
      macModeOverride: "",
      macModeWhy: [],
      errorCode: code,
    };
  }
}

module.exports = {
  MARION_VERSION,
  LATENT_DESIRE,
  MARION_STYLE_CONTRACT,
  PSYCH,
  mediate,

  // (optional exports for diagnostics)
  buildTrace,
  hashTrace,

  // psych exports for deterministic unit tests
  computePsychologyReasoningObject,
  applyPsychologyToMediator,
};
