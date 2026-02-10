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
 * v1.0.0 (MARION SO MODULE++++: extracted mediator + desire/confidence/velvet + bounded trace/hash)
 */

const MARION_VERSION = "marionSO v1.0.0";

// -------------------------
// helpers
// -------------------------
function nowMs() {
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
// enums
// -------------------------
const LATENT_DESIRE = Object.freeze({
  AUTHORITY: "authority",
  COMFORT: "comfort",
  CURIOSITY: "curiosity",
  VALIDATION: "validation",
  MASTERY: "mastery",
});

const MARION_TRACE_MAX = 160; // hard cap in chars

// -------------------------
// mac mode inference (lightweight)
// -------------------------
function normalizeMacModeRaw(v) {
  const s = safeStr(v, 60).trim().toLowerCase();
  if (!s) return "";
  if (s === "architect" || s === "builder" || s === "dev") return "architect";
  if (s === "user" || s === "viewer" || s === "consumer") return "user";
  if (s === "transitional" || s === "mixed" || s === "both")
    return "transitional";
  return "";
}

function detectMacModeImplicit(text) {
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
  if (
    /\b(non[-\s]?negotiable|must|hard rule|lock this in|constitution|mediator|pipeline|governor|decision table)\b/.test(
      s
    )
  ) {
    a += 3;
    why.push("architect:constraints/architecture");
  }
  if (/\b(step\s*\d+|1\s*,\s*2\s*,\s*3|1\s*2\s*3)\b/.test(s) || /\b\d+\)\s/.test(s)) {
    a += 2;
    why.push("architect:enumeration");
  }
  if (
    /\b(index\.js|chatengine\.js|statespine\.js|render|cors|session|payload|json|endpoint|route|resolver|pack|tests?)\b/.test(
      s
    )
  ) {
    a += 2;
    why.push("architect:technical");
  }

  // User signals
  if (
    /\b(i('?m)?\s+not\s+sure|help\s+me\s+understand|does\s+this\s+make\s+sense|where\s+do\s+i|get\s+the\s+url)\b/.test(
      s
    )
  ) {
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
    (payloadActionable &&
      hasPayload &&
      (payloadAction || payloadYear !== null)) ||
    (payloadActionable && textEmpty && hasPayload);

  if (actionable) return "ADVANCE";

  if (/\b(explain|how do i|how to|what is|walk me through|where do i|get|why)\b/.test(text))
    return "CLARIFY";

  if (/\b(i('?m)?\s+stuck|i('?m)?\s+worried|overwhelmed|frustrated|anxious)\b/.test(text))
    return "STABILIZE";

  return "CLARIFY";
}

// -------------------------
// latent desire inference
// -------------------------
function inferLatentDesire(norm, session, med) {
  const t = safeStr(norm?.text || "", 1400).toLowerCase();
  const a = safeStr(norm?.action || "", 80).toLowerCase();
  const mode = safeStr(med?.mode || "", 20).toLowerCase();

  // Strong signals
  if (
    /\b(optimi[sz]e|systems?|framework|architecture|hard(en)?|constraints?|regression tests?|unit tests?)\b/.test(
      t
    )
  )
    return LATENT_DESIRE.MASTERY;

  if (
    /\b(am i right|do i make sense|how am i perceived|handsome|attractive|validation|do you think)\b/.test(
      t
    )
  )
    return LATENT_DESIRE.VALIDATION;

  if (/\b(why|meaning|connect|pattern|link|what connects|deeper|layer)\b/.test(t))
    return LATENT_DESIRE.CURIOSITY;

  if (/\b(worried|overwhelmed|stuck|anxious|stress|reassure|calm)\b/.test(t))
    return LATENT_DESIRE.COMFORT;

  // counselor-lite typically comfort/clarity
  if (a === "counsel_intro") return LATENT_DESIRE.COMFORT;

  // Music interactions typically seek anchoring/authority unless explicitly reflective
  if (a === "top10" || a === "yearend_hot100") return LATENT_DESIRE.AUTHORITY;
  if (a === "story_moment" || a === "micro_moment" || a === "custom_story")
    return LATENT_DESIRE.COMFORT;

  // Architect mode leans authority/mastery depending on density
  if (mode === "architect") {
    if (/\bdesign|implement|encode|ship|lock\b/.test(t)) return LATENT_DESIRE.MASTERY;
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
  )
    user += 0.15;

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
function computeVelvet(norm, session, med, desire) {
  const s = isPlainObject(session) ? session : {};
  const action = safeStr(norm?.action || "", 80).trim();
  const lane = safeStr(norm?.lane || "", 40).trim() || (action ? "music" : "");
  const yr = normYear(norm?.year);
  const lastYear = normYear(s.lastYear);
  const lastLane = safeStr(s.lane || "", 40).trim();
  const now = nowMs();

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
    (safeStr(norm?.turnSignals?.payloadAction || "", 60).trim() || normYear(norm?.turnSignals?.payloadYear) !== null)
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
    const now = nowMs();
    const lastAdvanceAt = Number(s.lastAdvanceAt || 0) || 0;
    const stalled = lastAdvanceAt ? now - lastAdvanceAt > 90 * 1000 : false;

    // Intent (with constitution: action wins)
    let intent = safeStr(n.turnIntent || "", 20).trim().toUpperCase();
    if (!intent || (intent !== "ADVANCE" && intent !== "CLARIFY" && intent !== "STABILIZE")) {
      intent = classifyTurnIntent(n);
    }

    // actionable definition
    const actionable =
      !!safeStr(n.action || "", 80).trim() ||
      (payloadActionable &&
        hasPayload &&
        (safeStr(n?.turnSignals?.payloadAction || "", 60).trim() || normYear(n?.turnSignals?.payloadYear) !== null));

    if (actionable) intent = "ADVANCE";

    if (stalled && (mode === "architect" || mode === "transitional") && intent !== "ADVANCE") {
      intent = actionable ? "ADVANCE" : "CLARIFY";
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

    // grounding allowance
    const grounding = mode === "user" || mode === "transitional";
    const groundingMaxLines = intent === "STABILIZE" ? 3 : grounding ? 1 : 0;

    // Desire + confidence (arbitrated here)
    const latentDesire = inferLatentDesire(n, s, { mode, intent, dominance, budget });
    const confidence = inferConfidence(n, s, { mode, intent, dominance, budget });

    // Velvet binding (music-first)
    const velvet = computeVelvet(n, s, { mode, intent, dominance, budget, confidence }, latentDesire);

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

    // trace (no raw text)
    const trace = buildTrace(n, s, {
      mode,
      intent,
      dominance,
      budget,
      stalled,
      actionable,
      textEmpty,
      latentDesire,
      confidence,
      velvet: velvet.velvet,
      velvetReason: velvet.reason || "",
    });

    const cog = {
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

      // bounded logging
      marionTrace: safeStr(trace, MARION_TRACE_MAX + 8),
      marionTraceHash: hashTrace(trace),

      // optional: explainability hooks (safe)
      macModeOverride: macModeOverride || "",
      macModeWhy: Array.isArray(implicit.why) ? implicit.why.slice(0, 6) : [],
    };

    // Optional policy hooks (future-safe)
    const o = isPlainObject(opts) ? opts : {};
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
      marionTrace: "fail_open",
      marionTraceHash: sha1Lite("fail_open").slice(0, 10),
      macModeOverride: "",
      macModeWhy: [],
      errorCode: safeStr(e && (e.code || e.name) ? e.code || e.name : "ERR", 40),
    };
  }
}

module.exports = {
  MARION_VERSION,
  LATENT_DESIRE,
  mediate,

  // (optional exports for diagnostics)
  buildTrace,
  hashTrace,
};
