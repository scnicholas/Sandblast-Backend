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
 * v1.0.2 (CRITICAL++++: novelty scoring + discovery hints + telemetry event schema + stall tightening)
 * ✅ Adds novelty scoring (0..1) with zero raw-text leakage; emits discoveryHint when novelty high.
 * ✅ Adds cog.telemetry (structured, privacy-safe) for real-world analytics / tuning loops.
 * ✅ Tightens stall heuristic (supports turnsSinceAdvance + lastAdvanceAt); avoids brittle spin.
 * ✅ Keeps: MarionStyleContract, deterministic nowMs hook, actionable precedence, bounded traces, handoff hints.
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
function asArray(x) {
  return Array.isArray(x) ? x : [];
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
    (payloadActionable && hasPayload && (payloadAction || payloadYear !== null)) ||
    (payloadActionable && textEmpty && hasPayload);

  // Constitution: actionable always ADVANCE
  if (actionable) return "ADVANCE";

  // Stabilize has priority when explicit emotion/dysregulation shows up
  if (
    /\b(i('?m)?\s+stuck|i('?m)?\s+worried|overwhelmed|frustrated|anxious|panic|stress(ed)?|reassure|calm)\b/.test(
      text
    )
  ) {
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
  if (
    /\b(optimi[sz]e|systems?|framework|architecture|hard(en)?|constraints?|regression tests?|unit tests?|audit|refactor|contract|deterministic)\b/.test(
      t
    )
  ) {
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
// novelty scoring (privacy-safe; no raw text stored)
// -------------------------
function computeNovelty(norm, session, med) {
  const s = isPlainObject(session) ? session : {};
  const n = isPlainObject(norm) ? norm : {};
  const reasons = [];

  const intent = safeStr(med?.intent || "", 20).toUpperCase();
  const mode = safeStr(med?.mode || "", 20).toLowerCase();

  const hasPayload = !!n?.turnSignals?.hasPayload;
  const textEmpty = !!n?.turnSignals?.textEmpty;
  const payloadActionable = !!n?.turnSignals?.payloadActionable;
  const action = safeStr(n?.action || "", 80).trim();
  const txt = safeStr(n?.text || "", 800).trim(); // scanned only; never returned

  // Baseline: “unknown / weakly specified” turns are novel
  let score = 0;

  const veryShort = !!txt && txt.length < 18;
  if (veryShort) {
    score += 0.18;
    reasons.push("short_text");
  }

  const mixedLaneCue =
    /\b(music|songs?|hot\s*100|top\s*10|movies?|news|sponsor|advertis|pricing|bundle|legal|law|privacy|compliance|api|endpoint|cors|render)\b/i.test(
      txt
    ) && /\b(and|plus|also|but)\b/i.test(txt);
  if (mixedLaneCue) {
    score += 0.22;
    reasons.push("mixed_domain");
  }

  const ambiguityCue =
    /\b(this|that|it|something|stuff|thing)\b/i.test(txt) && /\b(what|how|why)\b/i.test(txt);
  if (ambiguityCue) {
    score += 0.18;
    reasons.push("ambiguous_reference");
  }

  // “Silent but non-actionable payload” is high novelty (often client metadata noise)
  if (textEmpty && hasPayload && !payloadActionable) {
    score += 0.25;
    reasons.push("non_actionable_payload_silence");
  }

  // No action, no year, no actionable payload => novelty up
  const payloadYear = normYear(n?.turnSignals?.payloadYear);
  const yr = normYear(n?.year);
  const hasAnyAnchor = !!action || payloadYear !== null || yr !== null || (hasPayload && payloadActionable);
  if (!hasAnyAnchor) {
    score += 0.25;
    reasons.push("no_anchor");
  }

  // Stalled sessions amplify novelty because prior path isn’t resolving
  const turnsSinceAdvance = Number(s.turnsSinceAdvance || 0) || 0;
  if (turnsSinceAdvance >= 2 && intent !== "ADVANCE") {
    score += 0.15;
    reasons.push("stall_pressure");
  }

  // Architect mode + high ambiguity => novelty up (because precision is expected)
  if (mode === "architect" && (veryShort || ambiguityCue) && intent !== "ADVANCE") {
    score += 0.1;
    reasons.push("architect_precision_gap");
  }

  score = clamp01(score);

  // cap reasons
  return { score, reasons: reasons.slice(0, 6) };
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
    `nv=${String(Math.round(clamp01(med?.noveltyScore) * 100))}`,
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

    // Momentum / stall heuristic (tightened):
    // - prefers explicit turnsSinceAdvance when available
    // - otherwise uses lastAdvanceAt elapsed time
    const lastAdvanceAt = Number(s.lastAdvanceAt || 0) || 0;
    const turnsSinceAdvance = Number(s.turnsSinceAdvance || 0) || 0;

    let stalled = false;
    if (turnsSinceAdvance >= 2) stalled = true;
    else if (lastAdvanceAt) stalled = now - lastAdvanceAt > 90 * 1000;

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

    // Desire + confidence (arbitrated here)
    const latentDesire = inferLatentDesire(n, s, { mode, intent, dominance, budget });
    const confidence = inferConfidence(n, s, { mode, intent, dominance, budget });

    // Velvet binding (music-first)
    const velvet = computeVelvet(
      n,
      s,
      { mode, intent, dominance, budget, confidence },
      latentDesire,
      now
    );

    // Novelty scoring (0..1, privacy-safe)
    const novelty = computeNovelty(n, s, { mode, intent, dominance, budget, confidence });

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

    // Discovery hint (for Nyx phrasing): when novelty is high and not actionable
    const discoveryHint =
      !actionable && intent === "CLARIFY" && clamp01(novelty.score) >= 0.45
        ? {
            enabled: true,
            style: "one_sharp_question",
            reasonCodes: novelty.reasons.slice(0, 4),
          }
        : { enabled: false, style: "", reasonCodes: [] };

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
      noveltyScore: novelty.score,
    });

    // handoff hints: keep channels separated
    const handoff = {
      marionEndsHard: true,
      nyxBeginsAfter: true,
      allowSameTurnSplit: true,
      // If a renderer is present: Marion should emit tag, then Nyx speaks without tags.
      marionTagSuggested:
        intent === "ADVANCE"
          ? MARION_STYLE_CONTRACT.tags.ok
          : intent === "STABILIZE"
          ? MARION_STYLE_CONTRACT.tags.hold
          : MARION_STYLE_CONTRACT.tags.ok,
      // optional hint: “discovery question” preferred when novelty high
      discoveryPreferred: !!discoveryHint.enabled,
    };

    // telemetry (structured, privacy-safe)
    // NOTE: no raw user text; only derived flags/scalars.
    const telemetry = {
      event: "marion_mediated",
      ts: now,
      v: MARION_VERSION,
      mode,
      intent,
      dominance,
      budget,
      actionable: !!actionable,
      textEmpty: !!textEmpty,
      stalled: !!stalled,
      latentDesire,
      confidenceUser: Math.round(clamp01(confidence.user) * 100),
      confidenceNyx: Math.round(clamp01(confidence.nyx) * 100),
      velvet: !!velvet.velvet,
      velvetReason: safeStr(velvet.reason || "", 40),
      novelty: Math.round(clamp01(novelty.score) * 100),
      noveltyReasons: novelty.reasons.slice(0, 4),
      traceHash: hashTrace(trace),
    };

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

      // novelty + discovery
      noveltyScore: clamp01(novelty.score),
      noveltyReasons: asArray(novelty.reasons).slice(0, 6),
      discoveryHint,

      // state machine
      marionState,
      marionReason,

      // style + handoff policy (pure hints)
      marionStyle: MARION_STYLE_CONTRACT,
      handoff,

      // bounded logging
      marionTrace: safeStr(trace, MARION_TRACE_MAX + 8),
      marionTraceHash: hashTrace(trace),

      // telemetry hook (privacy-safe analytics)
      telemetry,

      // optional: explainability hooks (safe)
      macModeOverride: macModeOverride || "",
      macModeWhy: Array.isArray(implicit.why)
        ? implicit.why.slice(0, 6).map((x) => safeStr(x, 60))
        : [],
    };

    // Optional policy hooks (future-safe)
    if (o && o.forceBudget && (o.forceBudget === "short" || o.forceBudget === "medium")) {
      cog.budget = o.forceBudget;
      cog.telemetry.budget = cog.budget;
    }
    if (
      o &&
      o.forceDominance &&
      (o.forceDominance === "firm" || o.forceDominance === "neutral" || o.forceDominance === "soft")
    ) {
      cog.dominance = o.forceDominance;
      cog.telemetry.dominance = cog.dominance;
    }
    if (
      o &&
      o.forceIntent &&
      (o.forceIntent === "ADVANCE" || o.forceIntent === "CLARIFY" || o.forceIntent === "STABILIZE")
    ) {
      cog.intent = o.forceIntent;
      cog.telemetry.intent = cog.intent;
    }
    if (o && typeof o.forceVelvet === "boolean") {
      cog.velvet = o.forceVelvet;
      cog.velvetSince = o.forceVelvet ? now : 0;
      cog.velvetReason = o.forceVelvet ? "forced_on" : "forced_off";
      cog.telemetry.velvet = cog.velvet;
      cog.telemetry.velvetReason = cog.velvetReason;
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
      noveltyScore: 0,
      noveltyReasons: [],
      discoveryHint: { enabled: false, style: "", reasonCodes: [] },
      marionState: "SEEK",
      marionReason: "fail_open",
      marionStyle: MARION_STYLE_CONTRACT,
      handoff: {
        marionEndsHard: true,
        nyxBeginsAfter: true,
        allowSameTurnSplit: true,
        marionTagSuggested: MARION_STYLE_CONTRACT.tags.retry,
        discoveryPreferred: false,
      },
      marionTrace: "fail_open",
      marionTraceHash: sha1Lite("fail_open").slice(0, 10),
      telemetry: {
        event: "marion_mediated",
        ts: nowMsDefault(),
        v: MARION_VERSION,
        mode: "architect",
        intent: "CLARIFY",
        dominance: "neutral",
        budget: "short",
        actionable: false,
        textEmpty: false,
        stalled: false,
        latentDesire: LATENT_DESIRE.CURIOSITY,
        confidenceUser: 50,
        confidenceNyx: 55,
        velvet: false,
        velvetReason: "fail_open",
        novelty: 0,
        noveltyReasons: [],
        traceHash: sha1Lite("fail_open").slice(0, 10),
      },
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
  mediate,

  // (optional exports for diagnostics)
  buildTrace,
  hashTrace,
  computeNovelty,
};
