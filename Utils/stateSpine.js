"use strict";

/**
 * Utils/stateSpine.js
 *
 * Canonical Conversational State Spine for Nyx.
 * - single source of truth for state shape + update logic
 * - update-on-every-turn guard (revision increments)
 * - deterministic decideNextMove(state) planner
 *
 * Designed to be imported by Utils/chatEngine.js (pure, no express).
 */

const SPINE_VERSION = "stateSpine v1.0.0";

const LANE = Object.freeze({
  MUSIC: "music",
  MOVIES: "movies",
  NEWS: "news",
  SPONSORS: "sponsors",
  HELP: "help",
  GENERAL: "general",
});

const STAGE = Object.freeze({
  OPEN: "open",
  TRIAGE: "triage",
  CLARIFY: "clarify",
  DELIVER: "deliver",
  CONFIRM: "confirm",
  CLOSE: "close",
});

const MOVE = Object.freeze({
  ADVANCE: "advance",
  NARROW: "narrow",
  CLARIFY: "clarify",
  CLOSE: "close",
});

function nowIso() {
  return new Date().toISOString();
}

function safeStr(x, max = 200) {
  if (x == null) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function normalizeLane(x) {
  const v = String(x || "").toLowerCase().trim();
  if (Object.values(LANE).includes(v)) return v;
  return LANE.GENERAL;
}

function normalizeStage(x) {
  const v = String(x || "").toLowerCase().trim();
  if (Object.values(STAGE).includes(v)) return v;
  return STAGE.OPEN;
}

function inferEngagement(prev, inbound) {
  // simple: cold->warm on meaningful text, warm->velvet on repeated engagement intent
  const p = String(prev || "cold");
  const txt = safeStr(inbound?.text || "", 800).trim();
  const hasText = txt.length >= 8;
  const wantsMore = /next steps|implement|do them all|keep going|continue/i.test(txt);

  if (p === "velvet") return "velvet";
  if (hasText && wantsMore) return "velvet";
  if (hasText) return "warm";
  return p || "cold";
}

function createState(seed = {}) {
  const createdAt = nowIso();
  const state = {
    __spineVersion: SPINE_VERSION,
    rev: 0,
    createdAt,
    updatedAt: createdAt,

    // Core spine
    lane: normalizeLane(seed.lane),
    stage: normalizeStage(seed.stage),
    topic: safeStr(seed.topic || ""),
    lastUserIntent: safeStr(seed.lastUserIntent || ""),

    // "pendingAsk": what Nyx needs from the user to proceed
    pendingAsk: seed.pendingAsk
      ? {
          id: safeStr(seed.pendingAsk.id || ""),
          type: safeStr(seed.pendingAsk.type || "clarify"), // clarify|confirm|choice|input
          prompt: safeStr(seed.pendingAsk.prompt || ""),
          createdAt: safeStr(seed.pendingAsk.createdAt || createdAt),
          required: seed.pendingAsk.required !== false,
        }
      : null,

    // Goal inference
    goal: seed.goal
      ? {
          label: safeStr(seed.goal.label || ""),
          confidence: clamp01(seed.goal.confidence),
          locked: !!seed.goal.locked,
          updatedAt: safeStr(seed.goal.updatedAt || createdAt),
        }
      : { label: "", confidence: 0, locked: false, updatedAt: createdAt },

    // Turn signals
    engagementTemp: inferEngagement(seed.engagementTemp, { text: "" }),
    lastMove: "",

    // Evidence trail (small, safe)
    lastUserText: "",
    lastAssistantSummary: "",

    // Stats
    turns: {
      user: 0,
      assistant: 0,
      sinceReset: 0,
    },

    // Diagnostics
    diag: {
      lastDecision: null,
      lastUpdateReason: "",
    },
  };

  return state;
}

/**
 * Must be called ON EVERY TURN.
 * - merges safe fields
 * - increments rev
 * - updates timestamps
 */
function updateState(prev, patch = {}, reason = "turn") {
  const p = prev && typeof prev === "object" ? prev : createState();
  const updatedAt = nowIso();

  const next = {
    ...p,
    ...patch,
    lane: patch.lane ? normalizeLane(patch.lane) : p.lane,
    stage: patch.stage ? normalizeStage(patch.stage) : p.stage,
    topic: patch.topic != null ? safeStr(patch.topic, 240) : p.topic,
    lastUserIntent:
      patch.lastUserIntent != null ? safeStr(patch.lastUserIntent, 120) : p.lastUserIntent,
    lastUserText: patch.lastUserText != null ? safeStr(patch.lastUserText, 800) : p.lastUserText,
    lastAssistantSummary:
      patch.lastAssistantSummary != null
        ? safeStr(patch.lastAssistantSummary, 400)
        : p.lastAssistantSummary,

    goal: patch.goal
      ? {
          ...p.goal,
          ...patch.goal,
          label: patch.goal.label != null ? safeStr(patch.goal.label, 140) : p.goal.label,
          confidence:
            patch.goal.confidence != null ? clamp01(patch.goal.confidence) : p.goal.confidence,
          locked: patch.goal.locked != null ? !!patch.goal.locked : p.goal.locked,
          updatedAt,
        }
      : p.goal,

    pendingAsk: patch.pendingAsk === null
      ? null
      : patch.pendingAsk
      ? {
          id: safeStr(patch.pendingAsk.id || p.pendingAsk?.id || ""),
          type: safeStr(patch.pendingAsk.type || p.pendingAsk?.type || "clarify"),
          prompt: safeStr(patch.pendingAsk.prompt || p.pendingAsk?.prompt || ""),
          createdAt: safeStr(p.pendingAsk?.createdAt || updatedAt),
          required: patch.pendingAsk.required != null ? !!patch.pendingAsk.required : true,
        }
      : p.pendingAsk,

    engagementTemp: patch.engagementTemp
      ? String(patch.engagementTemp)
      : p.engagementTemp,

    updatedAt,
    rev: (Number.isFinite(p.rev) ? p.rev : 0) + 1,
    diag: {
      ...p.diag,
      ...patch.diag,
      lastUpdateReason: safeStr(reason, 120),
    },
  };

  // Turn counter increments can be driven by caller
  return next;
}

/**
 * Single deterministic planner.
 * Output includes:
 * - move: ADVANCE | NARROW | CLARIFY | CLOSE
 * - stage: next stage
 * - speak: one-sentence "Nyx explains the move out loud"
 * - ask: optional pendingAsk
 */
function decideNextMove(state, inbound = {}) {
  const s = state || createState();
  const text = safeStr(inbound.text || "", 1200).trim();
  const hasText = text.length > 0;

  // If we already have a pending ask, we should try to resolve it
  if (s.pendingAsk && s.pendingAsk.required) {
    const move = MOVE.CLARIFY;
    const stage = STAGE.CLARIFY;
    const speak = `I’m going to get one quick detail so I can move forward cleanly.`;
    return {
      move,
      stage,
      speak,
      ask: s.pendingAsk,
      rationale: "pending_ask_required",
    };
  }

  // No text: treat as a stall; narrow via last context if we can, otherwise clarify
  if (!hasText) {
    const move = s.topic ? MOVE.NARROW : MOVE.CLARIFY;
    const stage = move === MOVE.NARROW ? STAGE.TRIAGE : STAGE.CLARIFY;
    const speak =
      move === MOVE.NARROW
        ? `I’ll keep us moving by narrowing this to the most likely next step.`
        : `I need one small input to aim this correctly, then I’ll proceed.`;
    const ask =
      move === MOVE.CLARIFY
        ? {
            id: "need_intent",
            type: "clarify",
            prompt: "What are we advancing right now: state spine, guidance layer, goal inference, or response filter?",
            required: true,
          }
        : null;

    return { move, stage, speak, ask, rationale: "empty_inbound" };
  }

  // Common "next steps" trigger: advance by offering an immediate actionable plan
  if (/next steps|what next|do them all|implement/i.test(text)) {
    const move = MOVE.ADVANCE;
    const stage = STAGE.DELIVER;
    const speak = `I’m going to advance: I’ll propose the smallest next change you can paste in and verify in one run.`;
    return { move, stage, speak, ask: null, rationale: "advance_request" };
  }

  // Ambiguous short input → clarify
  if (text.length < 10) {
    const move = MOVE.CLARIFY;
    const stage = STAGE.CLARIFY;
    const speak = `I’m going to ask one clarifying question so we don’t build the wrong thing.`;
    const ask = {
      id: "short_ambig",
      type: "clarify",
      prompt: "Say what you want Nyx to do next in one phrase (e.g., “wire it into chatEngine”, “add tests”, “connect to sessionPatch”).",
      required: true,
    };
    return { move, stage, speak, ask, rationale: "too_short" };
  }

  // Default: advance
  return {
    move: MOVE.ADVANCE,
    stage: STAGE.DELIVER,
    speak: `I’m going to move forward using what you gave me, and I’ll flag any assumptions clearly.`,
    ask: null,
    rationale: "default_advance",
  };
}

/**
 * Enforce update-on-every-turn:
 * caller should pass prevRev and nextRev to assert increment.
 */
function assertTurnUpdated(prevState, nextState) {
  const a = prevState && typeof prevState.rev === "number" ? prevState.rev : -1;
  const b = nextState && typeof nextState.rev === "number" ? nextState.rev : -1;
  if (!(b === a + 1)) {
    const err = new Error(
      `STATE_SPINE_NOT_UPDATED: expected rev ${a + 1} but got ${b}`
    );
    err.code = "STATE_SPINE_NOT_UPDATED";
    throw err;
  }
}

module.exports = {
  SPINE_VERSION,
  LANE,
  STAGE,
  MOVE,
  createState,
  updateState,
  decideNextMove,
  assertTurnUpdated,
};
