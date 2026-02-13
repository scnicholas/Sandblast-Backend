"use strict";

/**
 * Utils/stateSpine.js
 *
 * Canonical Conversational State Spine for Nyx.
 * - single source of truth for state shape + update logic
 * - update-on-every-turn guard (revision increments exactly once per turn)
 * - deterministic decideNextMove(state,inbound) planner (single decider)
 *
 * Designed to be imported by Utils/chatEngine.js (pure, no express).
 *
 * v1.1.4 (CHATENGINE COMPAT++++ + FAIL-OPEN++++ + CASE HARDEN++++)
 * ✅ Fix++++: normalizeInbound now understands chatEngine’s ctx + payload aliases (turnSignals -> signals, effectiveYear/year).
 * ✅ Fix++++: action detection understands payload.route + ctx.action + body.action (matches chatEngine normalizeInbound behavior).
 * ✅ Fix++++: chip-year clear uses inbound normalized year (payload.year OR extracted OR body.year OR ctx.year).
 * ✅ Fix++++: resolves need_pick via chip lane/action OR typed lane token (kept).
 * ✅ Keeps: PRIVACY turnSig hash-only; pendingAsk schema dual-support; need_year detection; safe clear rules.
 */

const SPINE_VERSION = "stateSpine v1.1.4";

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

// -------------------------
// small helpers (pure)
// -------------------------
function nowMs() {
  return Date.now();
}
function nowIso() {
  return new Date().toISOString();
}
function safeStr(x, max = 240) {
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
function asArray(x) {
  return Array.isArray(x) ? x : [];
}
function normalizeLane(x) {
  const v = safeStr(x, 40).toLowerCase().trim();
  return Object.values(LANE).includes(v) ? v : LANE.GENERAL;
}
function normalizeStage(x) {
  const v = safeStr(x, 40).toLowerCase().trim();
  return Object.values(STAGE).includes(v) ? v : STAGE.OPEN;
}
function normYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < 1900 || t > 2100) return null;
  return t;
}
function extractYearFromText(t) {
  const s = safeStr(t, 2000).trim();
  if (!s) return null;
  const m = s.match(/\b(19[5-9]\d|20[0-2]\d|2025)\b/);
  if (!m) return null;
  return normYear(Number(m[1]));
}
function textHasYearToken(t) {
  return extractYearFromText(t) !== null;
}
function sha1Lite(str) {
  // small stable hash (NOT cryptographic) for diagnostics without raw text
  const s = safeStr(str, 2000);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function hasActionablePayload(payload) {
  if (!isPlainObject(payload)) return false;
  const keys = Object.keys(payload);
  if (!keys.length) return false;

  // Only these keys count as "actionable" (prevents ADVANCE on trivial client metadata).
  const actionable = new Set([
    "action",
    "route",
    "year",
    "id",
    "_id",
    "label",
    "lane",
    "vibe",
    "macMode",
    "mode",
    "allowDerivedTop10",
    "allowYearendFallback",
    "focus",
  ]);
  return keys.some((k) => actionable.has(k));
}

function isLaneToken(t) {
  const s = safeStr(t, 64).trim().toLowerCase();
  return (
    s === "music" ||
    s === "movies" ||
    s === "news" ||
    s === "sponsors" ||
    s === "help" ||
    s === "general"
  );
}

// -------------------------
// CRITICAL: pendingAsk schema compatibility
// Supports BOTH shapes:
//  A) { kind, prompt, options, createdAt }
//  B) { id, type, prompt, required }   <-- used by chatEngine.js
// Normalizes to a superset so both planners + chatEngine finalize logic behave.
// -------------------------
function normalizePendingAsk(p) {
  if (!p || typeof p !== "object") return null;

  const kindRaw = safeStr(p.kind || "", 40).trim();
  const idRaw = safeStr(p.id || "", 80).trim();
  const typeRaw = safeStr(p.type || "", 40).trim();

  // Heuristic: prefer explicit kind; else map id/type into kind.
  const kind =
    kindRaw ||
    (idRaw ? safeStr(idRaw, 40) : "") ||
    (typeRaw ? safeStr(typeRaw, 40) : "") ||
    "need_more_detail";

  const prompt = safeStr(p.prompt || "", 220).trim();
  const options = Array.isArray(p.options) ? p.options.slice(0, 8) : [];

  // chatEngine uses required flag; default true.
  const required =
    typeof p.required === "boolean"
      ? p.required
      : safeStr(p.required || "").trim()
      ? !/^(0|false|no|n|off)$/i.test(safeStr(p.required).trim())
      : true;

  const createdAt = Number(p.createdAt || 0) || nowMs();

  const out = {
    // canonical fields
    kind,
    prompt,
    options,
    createdAt,

    // compat fields retained
    id: idRaw || undefined,
    type: typeRaw || undefined,
    required,
  };

  return out;
}

function isNeedYearAsk(pendingAsk) {
  const pa = normalizePendingAsk(pendingAsk);
  if (!pa) return false;

  const k = safeStr(pa.kind || "", 80).toLowerCase();
  const id = safeStr(pa.id || "", 80).toLowerCase();
  const pr = safeStr(pa.prompt || "", 240).toLowerCase();

  if (k === "need_year" || id === "need_year") return true;
  if (/\byear\b/.test(pr)) return true;
  return false;
}

function isNeedPickAsk(pendingAsk) {
  const pa = normalizePendingAsk(pendingAsk);
  if (!pa) return false;
  const k = safeStr(pa.kind || "", 80).toLowerCase();
  const id = safeStr(pa.id || "", 80).toLowerCase();
  return k === "need_pick" || id === "need_pick";
}

function buildPendingAsk(kind, prompt, options) {
  return normalizePendingAsk({
    kind: safeStr(kind || "", 40).trim() || "need_more_detail",
    prompt: safeStr(prompt || "", 220).trim(),
    options: Array.isArray(options) ? options.slice(0, 8) : [],
    createdAt: nowMs(),
    required: true,
  });
}

function buildChipsOffered(followUps) {
  const arr = Array.isArray(followUps) ? followUps : [];
  const mapped = arr
    .map((f) => {
      const id = safeStr(f?.id || "", 80).trim();
      const label = safeStr(f?.label || "", 120).trim();
      const payload = isPlainObject(f?.payload) ? f.payload : {};
      const route = safeStr(payload.route || payload.action || "", 80).trim();
      const lane = safeStr(payload.lane || "", 24).trim();

      const mini = {};
      if (safeStr(payload.action)) mini.action = safeStr(payload.action, 60);
      if (safeStr(payload.route)) mini.route = safeStr(payload.route, 60);
      if (safeStr(payload.lane)) mini.lane = safeStr(payload.lane, 24);
      const yr = normYear(payload.year);
      if (yr !== null) mini.year = yr;
      if (safeStr(payload.vibe)) mini.vibe = safeStr(payload.vibe, 40);

      return {
        id,
        label,
        route,
        lane,
        payload: Object.keys(mini).length ? mini : undefined,
      };
    })
    .filter((x) => x.id || x.label || x.route);

  return mapped.slice(0, 12);
}

function inferUserIntent(norm) {
  const txt = safeStr(norm?.text || "", 2000).trim();
  const hasPayload = !!norm?.signals?.hasPayload;
  const textEmpty = !!norm?.signals?.textEmpty;
  const hasAction = !!safeStr(norm?.action || "", 80).trim();

  if (hasPayload && textEmpty) return "silent_click";
  if (hasAction && hasPayload) return "choose";
  if (hasAction && !txt) return "choose";
  if (txt) return "ask";
  return "unknown";
}

function computeTurnSig({ lane, topic, intent, activeContext, text }) {
  const y =
    activeContext && typeof activeContext.year === "number"
      ? String(activeContext.year)
      : "";
  const rid = activeContext && activeContext.route ? activeContext.route : "";

  // PRIVACY++++: do not include raw text; only include a short stable hash + coarse flags.
  const raw = safeStr(text || "", 2000);
  const hasAnyText = raw ? "1" : "0";
  const hasYear = textHasYearToken(raw) ? "1" : "0";
  const th = raw ? sha1Lite(raw).slice(0, 10) : "";

  return [
    lane || "",
    topic || "",
    intent || "",
    rid || "",
    y || "",
    hasAnyText,
    hasYear,
    th,
  ].join("|");
}

function topicFromAction(action) {
  const a = safeStr(action || "", 80).trim();
  if (!a) return "unknown";
  if (a === "top10") return "top10_by_year";
  if (a === "story_moment" || a === "custom_story") return "story_moment";
  if (a === "micro_moment") return "story_moment";
  if (a === "yearend_hot100") return "year_end";
  if (a === "ask_year") return "help";
  if (a === "switch_lane") return "help";
  if (a === "counsel_intro") return "help";
  if (a === "reset") return "help";
  return "unknown";
}

function stageProgress(prevStage, move) {
  // Deterministic stage evolution (simple + stable):
  // open -> triage -> clarify/deliver -> confirm -> close
  const p = safeStr(prevStage || STAGE.OPEN, 20).toLowerCase();
  const m = safeStr(move || "", 20).toLowerCase();

  if (p === STAGE.CLOSE) return STAGE.CLOSE;

  if (m === MOVE.CLOSE) return STAGE.CLOSE;
  if (m === MOVE.CLARIFY) return STAGE.CLARIFY;
  if (m === MOVE.ADVANCE) return STAGE.DELIVER;
  if (m === MOVE.NARROW) return STAGE.TRIAGE;

  if (p === STAGE.OPEN) return STAGE.TRIAGE;
  return p;
}

function buildActiveContext(norm, spinePrev) {
  // click-to-context binding: capture payload route/action/year when present
  const hasPayload = !!norm?.signals?.hasPayload;
  const textEmpty = !!norm?.signals?.textEmpty;

  const p = isPlainObject(norm?.payload) ? norm.payload : {};
  const route = safeStr(p.route || p.action || "", 80).trim();
  const lane = safeStr(p.lane || norm?.lane || spinePrev?.lane || "", 24).trim();
  const year = normYear(p.year) ?? normYear(norm?.year) ?? null;

  // Silent click with actionable payload -> chip context
  if (hasPayload && norm?.signals?.payloadActionable && textEmpty) {
    const id =
      safeStr(p.id || p._id || "", 80).trim() ||
      safeStr(norm?.action || "", 60).trim() ||
      route ||
      "";
    const label = safeStr(p.label || "", 140).trim();

    const payloadMini = {};
    if (safeStr(p.action)) payloadMini.action = safeStr(p.action, 60);
    if (safeStr(p.route)) payloadMini.route = safeStr(p.route, 60);
    if (safeStr(p.lane)) payloadMini.lane = safeStr(p.lane, 24);
    if (year !== null) payloadMini.year = year;
    if (safeStr(p.vibe)) payloadMini.vibe = safeStr(p.vibe, 40);

    return {
      kind: "chip",
      id,
      route: route || safeStr(norm?.action || "", 60).trim(),
      lane: lane || LANE.GENERAL,
      label,
      year: year !== null ? year : undefined,
      payload: Object.keys(payloadMini).length ? payloadMini : undefined,
      clickedAt: nowMs(),
    };
  }

  // If the user typed (non-empty text) and provided action/year, do NOT carry stale chip context.
  const typedText = safeStr(norm?.text || "", 2000).trim();
  const typed = !!typedText && !textEmpty;
  const hasExplicitAction = !!safeStr(norm?.action || "", 80).trim();
  const hasYear = normYear(norm?.year) !== null;

  if (typed && (hasExplicitAction || hasYear)) {
    const typedCtx = {};
    if (hasExplicitAction) typedCtx.route = safeStr(norm?.action || "", 60).trim();
    if (hasYear) typedCtx.year = normYear(norm?.year);
    if (safeStr(norm?.lane || "", 24).trim())
      typedCtx.lane = safeStr(norm.lane, 24).trim();

    return Object.keys(typedCtx).length
      ? {
          kind: "typed",
          id: "typed",
          route: typedCtx.route || "",
          lane: typedCtx.lane || (spinePrev?.lane || LANE.GENERAL),
          year: typedCtx.year,
          clickedAt: nowMs(),
        }
      : null;
  }

  return spinePrev?.activeContext || null;
}

// -------------------------
// state (canonical)
// -------------------------
function createState(seed = {}) {
  const createdAtIso = nowIso();
  const pendingAsk = normalizePendingAsk(seed.pendingAsk);

  return {
    __spineVersion: SPINE_VERSION,
    rev: 0, // increments exactly once per turn via updateState/finalizeTurn
    createdAt: createdAtIso,
    updatedAt: createdAtIso,

    // Core spine
    lane: normalizeLane(seed.lane),
    stage: normalizeStage(seed.stage),
    topic: safeStr(seed.topic || "", 80) || "unknown",

    lastUserIntent: safeStr(seed.lastUserIntent || "", 40) || "unknown",
    pendingAsk: pendingAsk || null,

    // Context memory
    activeContext:
      seed.activeContext && typeof seed.activeContext === "object"
        ? seed.activeContext
        : null,
    lastChipsOffered: Array.isArray(seed.lastChipsOffered)
      ? seed.lastChipsOffered.slice(0, 12)
      : [],
    lastChipClicked:
      seed.lastChipClicked && typeof seed.lastChipClicked === "object"
        ? seed.lastChipClicked
        : null,

    // Goal inference (small)
    goal:
      seed.goal && typeof seed.goal === "object"
        ? {
            primary: safeStr(seed.goal.primary || "", 120) || null,
            secondary: Array.isArray(seed.goal.secondary)
              ? seed.goal.secondary.slice(0, 8)
              : [],
            updatedAt: Number(seed.goal.updatedAt || 0) || 0,
          }
        : { primary: null, secondary: [], updatedAt: 0 },

    // Decisions / loop fuse (small)
    lastMove: safeStr(seed.lastMove || "", 20) || null,
    lastDecision:
      seed.lastDecision && typeof seed.lastDecision === "object"
        ? {
            move: safeStr(seed.lastDecision.move || "", 20),
            rationale: safeStr(seed.lastDecision.rationale || "", 60),
          }
        : null,
    lastActionTaken: safeStr(seed.lastActionTaken || "", 40) || null,
    lastTurnSig: safeStr(seed.lastTurnSig || "", 240) || null,

    // Evidence trail (NO raw user text by default; callers may provide sanitized summaries)
    lastUserText: safeStr(seed.lastUserText || "", 0), // default empty; keep at 0 unless caller overrides intentionally
    lastAssistantSummary: safeStr(seed.lastAssistantSummary || "", 320),

    // Stats
    turns: {
      user: Number.isFinite(seed?.turns?.user)
        ? Math.max(0, Math.trunc(seed.turns.user))
        : 0,
      assistant: Number.isFinite(seed?.turns?.assistant)
        ? Math.max(0, Math.trunc(seed.turns.assistant))
        : 0,
      sinceReset: Number.isFinite(seed?.turns?.sinceReset)
        ? Math.max(0, Math.trunc(seed.turns.sinceReset))
        : 0,
    },

    // Diagnostics (bounded)
    diag: {
      lastUpdateReason: safeStr(seed?.diag?.lastUpdateReason || "", 120),
    },
  };
}

function coerceState(prev) {
  const d = createState();
  if (!prev || typeof prev !== "object") return d;

  const out = { ...d, ...prev };
  out.__spineVersion = SPINE_VERSION;

  out.rev = Number.isFinite(out.rev) ? Math.trunc(out.rev) : 0;
  if (out.rev < 0) out.rev = 0;

  out.lane = normalizeLane(out.lane);
  out.stage = normalizeStage(out.stage);
  out.topic = safeStr(out.topic || "", 80) || "unknown";
  out.lastUserIntent = safeStr(out.lastUserIntent || "", 40) || "unknown";

  out.pendingAsk = normalizePendingAsk(out.pendingAsk);

  if (!out.goal || typeof out.goal !== "object")
    out.goal = { primary: null, secondary: [], updatedAt: 0 };
  if (!Array.isArray(out.goal.secondary)) out.goal.secondary = [];

  if (!Array.isArray(out.lastChipsOffered)) out.lastChipsOffered = [];
  if (out.lastChipsOffered.length > 12)
    out.lastChipsOffered = out.lastChipsOffered.slice(0, 12);

  if (out.activeContext && typeof out.activeContext !== "object")
    out.activeContext = null;

  if (out.lastDecision && typeof out.lastDecision === "object") {
    out.lastDecision = {
      move: safeStr(out.lastDecision.move || "", 20),
      rationale: safeStr(out.lastDecision.rationale || "", 60),
    };
  } else {
    out.lastDecision = null;
  }

  if (!out.turns || typeof out.turns !== "object") {
    out.turns = { user: 0, assistant: 0, sinceReset: 0 };
  } else {
    out.turns.user = Number.isFinite(out.turns.user)
      ? Math.max(0, Math.trunc(out.turns.user))
      : 0;
    out.turns.assistant = Number.isFinite(out.turns.assistant)
      ? Math.max(0, Math.trunc(out.turns.assistant))
      : 0;
    out.turns.sinceReset = Number.isFinite(out.turns.sinceReset)
      ? Math.max(0, Math.trunc(out.turns.sinceReset))
      : 0;
  }

  out.updatedAt = nowIso();
  return out;
}

/**
 * Must be called ON EVERY TURN.
 * - merges safe fields
 * - increments rev exactly once per call
 * - updates timestamps
 */
function updateState(prev, patch = {}, reason = "turn") {
  const p = coerceState(prev);
  const updatedAt = nowIso();

  // Normalize pendingAsk in patch (supports chatEngine schema)
  const patchPendingAsk =
    patch.pendingAsk === null
      ? null
      : patch.pendingAsk
      ? normalizePendingAsk(patch.pendingAsk)
      : undefined;

  const next = {
    ...p,
    ...patch,
    lane: patch.lane ? normalizeLane(patch.lane) : p.lane,
    stage: patch.stage ? normalizeStage(patch.stage) : p.stage,
    topic: patch.topic != null ? safeStr(patch.topic, 80) : p.topic,
    lastUserIntent:
      patch.lastUserIntent != null
        ? safeStr(patch.lastUserIntent, 40)
        : p.lastUserIntent,

    // Evidence trail (bounded, caller-controlled)
    lastUserText:
      patch.lastUserText != null ? safeStr(patch.lastUserText, 0) : p.lastUserText,
    lastAssistantSummary:
      patch.lastAssistantSummary != null
        ? safeStr(patch.lastAssistantSummary, 320)
        : p.lastAssistantSummary,

    goal: patch.goal
      ? {
          ...p.goal,
          ...patch.goal,
          primary:
            patch.goal.primary != null
              ? safeStr(patch.goal.primary, 120)
              : p.goal.primary,
          secondary: Array.isArray(patch.goal.secondary)
            ? patch.goal.secondary.slice(0, 8)
            : p.goal.secondary,
          updatedAt: nowMs(),
        }
      : p.goal,

    pendingAsk:
      patchPendingAsk === null
        ? null
        : patchPendingAsk
        ? {
            ...(normalizePendingAsk(p.pendingAsk) || {}),
            ...patchPendingAsk,
            kind: safeStr(patchPendingAsk.kind || "need_more_detail", 40),
            prompt: safeStr(patchPendingAsk.prompt || "", 220),
            options: Array.isArray(patchPendingAsk.options)
              ? patchPendingAsk.options.slice(0, 8)
              : asArray(patchPendingAsk.options).slice(0, 8),
            createdAt: Number(patchPendingAsk.createdAt || 0) || nowMs(),
            required:
              typeof patchPendingAsk.required === "boolean"
                ? patchPendingAsk.required
                : true,
          }
        : p.pendingAsk,

    activeContext:
      patch.activeContext === null
        ? null
        : patch.activeContext
        ? patch.activeContext
        : p.activeContext,

    lastChipsOffered: Array.isArray(patch.lastChipsOffered)
      ? patch.lastChipsOffered.slice(0, 12)
      : p.lastChipsOffered,

    lastChipClicked:
      patch.lastChipClicked === null
        ? null
        : patch.lastChipClicked
        ? patch.lastChipClicked
        : p.lastChipClicked,

    lastMove: patch.lastMove != null ? safeStr(patch.lastMove, 20) : p.lastMove,
    lastDecision:
      patch.lastDecision && typeof patch.lastDecision === "object"
        ? {
            move: safeStr(patch.lastDecision.move || "", 20),
            rationale: safeStr(patch.lastDecision.rationale || "", 60),
          }
        : p.lastDecision,

    lastActionTaken:
      patch.lastActionTaken != null
        ? safeStr(patch.lastActionTaken, 40)
        : p.lastActionTaken,
    lastTurnSig:
      patch.lastTurnSig != null ? safeStr(patch.lastTurnSig, 240) : p.lastTurnSig,

    turns:
      patch.turns && typeof patch.turns === "object"
        ? {
            user: Number.isFinite(patch.turns.user)
              ? Math.max(0, Math.trunc(patch.turns.user))
              : p.turns.user,
            assistant: Number.isFinite(patch.turns.assistant)
              ? Math.max(0, Math.trunc(patch.turns.assistant))
              : p.turns.assistant,
            sinceReset: Number.isFinite(patch.turns.sinceReset)
              ? Math.max(0, Math.trunc(patch.turns.sinceReset))
              : p.turns.sinceReset,
          }
        : p.turns,

    updatedAt,
    rev: (Number.isFinite(p.rev) ? p.rev : 0) + 1,

    diag: {
      ...p.diag,
      ...(patch.diag && typeof patch.diag === "object" ? patch.diag : {}),
      lastUpdateReason: safeStr(reason, 120),
    },
  };

  if (Array.isArray(next.lastChipsOffered) && next.lastChipsOffered.length > 12)
    next.lastChipsOffered = next.lastChipsOffered.slice(0, 12);

  if (next.lastDecision && typeof next.lastDecision === "object") {
    next.lastDecision = {
      move: safeStr(next.lastDecision.move || "", 20),
      rationale: safeStr(next.lastDecision.rationale || "", 60),
    };
  } else {
    next.lastDecision = null;
  }

  next.pendingAsk = normalizePendingAsk(next.pendingAsk);

  return next;
}

// -------------------------
// inbound normalization (tiny, for planner/spine only)
// -------------------------
// NOTE: This must accept chatEngine's inbound shapes:
// - body.ctx and/or body.payload
// - chatEngine turnSignals naming
function normalizeInbound(inbound = {}) {
  const body = isPlainObject(inbound) ? inbound : {};
  const payload = isPlainObject(body.payload) ? body.payload : {};
  const ctx = isPlainObject(body.ctx) ? body.ctx : {};

  const text = safeStr(
    body.text ||
      body.message ||
      body.prompt ||
      body.query ||
      ctx.text ||
      ctx.message ||
      payload.text ||
      payload.message ||
      "",
    2000
  ).trim();

  // action: prefer explicit payload.action/body.action/ctx.action, else payload.route
  const action = safeStr(
    body.action ||
      ctx.action ||
      payload.action ||
      payload.route ||
      "",
    80
  ).trim();

  const lane = safeStr(body.lane || ctx.lane || payload.lane || "", 24).trim();

  // year: accept multiple aliases used across the system
  const year =
    normYear(body.year) ??
    normYear(ctx.year) ??
    normYear(payload.year) ??
    // chatEngine passes "year" already normalized on its own norm,
    // but if it ever passes "effectiveYear" through ctx, accept it.
    normYear(ctx.effectiveYear) ??
    extractYearFromText(text) ??
    null;

  const textEmpty = !text;

  const hasPayload = isPlainObject(payload) && Object.keys(payload).length > 0;
  const payloadActionable = hasPayload && hasActionablePayload(payload);

  // chatEngine calls it turnSignals; accept it when present
  const ts = isPlainObject(body.turnSignals) ? body.turnSignals : null;
  const signals = {
    textEmpty: ts && typeof ts.textEmpty === "boolean" ? ts.textEmpty : textEmpty,
    hasPayload: ts && typeof ts.hasPayload === "boolean" ? ts.hasPayload : hasPayload,
    payloadActionable:
      ts && typeof ts.payloadActionable === "boolean"
        ? ts.payloadActionable
        : payloadActionable,
  };

  return {
    text,
    payload,
    ctx,
    lane,
    year,
    action,
    signals,
  };
}

// -------------------------
// deterministic planner (single decider)
// -------------------------
function decideNextMove(state, inbound = {}) {
  const s = coerceState(state);
  const n = normalizeInbound(inbound);

  const text = n.text;
  const hasText = !!text;
  const textEmpty = n.signals.textEmpty;

  const hasAction = !!safeStr(n.action || "", 80).trim();
  const payloadActionable = !!n.signals.payloadActionable;
  const hasPayload = !!n.signals.hasPayload;

  // If we already have a pending ask, try to resolve it based on typed/click evidence.
  if (s.pendingAsk && isPlainObject(s.pendingAsk)) {
    const pa = normalizePendingAsk(s.pendingAsk);
    const kind = safeStr(pa?.kind || "", 80).toLowerCase();
    const id = safeStr(pa?.id || "", 80).toLowerCase();

    const answeredYear =
      (kind === "need_year" || id === "need_year" || isNeedYearAsk(pa)) &&
      (textHasYearToken(text) || (payloadActionable && n.year !== null));

    // “need_pick” can be answered by short lane words OR a lane-bearing chip.
    const answeredPick =
      (kind === "need_pick" || id === "need_pick" || isNeedPickAsk(pa)) &&
      (isLaneToken(text) ||
        (payloadActionable && !!safeStr(n.payload?.lane || "", 24).trim()) ||
        (payloadActionable && !!safeStr(n.lane || "", 24).trim()));

    const answered = answeredYear || answeredPick || (hasText && text.length >= 8);

    if (!answered) {
      return {
        move: MOVE.CLARIFY,
        stage: STAGE.CLARIFY,
        speak: "I’m going to get one quick detail so I can move forward cleanly.",
        ask: pa,
        rationale: "pendingAsk_unresolved",
      };
    }
  }

  // Chip-click / actionable payload beats silence -> ADVANCE
  if ((hasAction && payloadActionable) || (payloadActionable && hasPayload && textEmpty)) {
    return {
      move: MOVE.ADVANCE,
      stage: STAGE.DELIVER,
      speak: "I’m going to execute that selection and keep momentum.",
      ask: null,
      rationale: "actionable_payload",
    };
  }

  // Explicit “next steps / implement” -> ADVANCE
  if (/\b(next steps|what next|implement|wire it|do them all|ship it)\b/i.test(text)) {
    return {
      move: MOVE.ADVANCE,
      stage: STAGE.DELIVER,
      speak: "I’m going to advance: smallest next change first, then we verify.",
      ask: null,
      rationale: "advance_request",
    };
  }

  // Empty text and non-actionable -> NARROW if context exists, else CLARIFY
  if (!hasText && textEmpty) {
    const hasCtx = !!s.activeContext || !!s.topic || !!s.lane;
    return hasCtx
      ? {
          move: MOVE.NARROW,
          stage: STAGE.TRIAGE,
          speak: "I’ll keep us moving by narrowing this to the most likely next step.",
          ask: null,
          rationale: "empty_inbound_narrow",
        }
      : {
          move: MOVE.CLARIFY,
          stage: STAGE.CLARIFY,
          speak: "I need one small input to aim this correctly, then I’ll proceed.",
          ask: buildPendingAsk(
            "need_pick",
            "What are we advancing right now: state spine, guidance layer, goal inference, or response filter?",
            []
          ),
          rationale: "empty_inbound_clarify",
        };
  }

  // Very short typed input -> CLARIFY
  if (hasText && text.length < 10) {
    return {
      move: MOVE.CLARIFY,
      stage: STAGE.CLARIFY,
      speak: "I’m going to ask one clarifying question so we don’t build the wrong thing.",
      ask: buildPendingAsk(
        "need_more_detail",
        "Say what you want next in one phrase (e.g., “wire into chatEngine”, “add tests”, “connect to sessionPatch”).",
        []
      ),
      rationale: "too_short",
    };
  }

  // Default
  return {
    move: MOVE.ADVANCE,
    stage: STAGE.DELIVER,
    speak: "I’m going to move forward using what you gave me, and I’ll flag assumptions clearly.",
    ask: null,
    rationale: "default_advance",
  };
}

// -------------------------
// finalize (structured, rev enforcement)
// -------------------------
function finalizeTurn({
  prevState,
  inbound,
  lane,
  topicOverride,
  actionTaken,
  followUps,
  pendingAsk, // optional; if undefined, keep logic-controlled value
  decision, // {move, rationale, speak, stage}
  assistantSummary, // optional, bounded
  updateReason = "turn",
}) {
  const prev = coerceState(prevState);
  const n = normalizeInbound(inbound);

  const lastUserIntent = inferUserIntent({
    text: n.text,
    action: n.action,
    signals: n.signals,
  });

  const activeContext = buildActiveContext(
    {
      text: n.text,
      payload: n.payload,
      year: n.year,
      lane: n.lane,
      action: n.action,
      signals: n.signals,
    },
    prev
  );

  const topic =
    safeStr(topicOverride || "", 80).trim() ||
    topicFromAction(safeStr(n.action || "", 80).trim()) ||
    prev.topic ||
    "unknown";

  const move = safeStr(decision?.move || "", 20).toLowerCase();
  const nextStage = decision?.stage
    ? normalizeStage(decision.stage)
    : stageProgress(prev.stage, move);

  const turnSig = computeTurnSig({
    lane: normalizeLane(lane || n.lane || prev.lane),
    topic,
    intent: lastUserIntent,
    activeContext,
    text: n.text,
  });

  // PendingAsk hygiene:
  // - clear need_year if user typed a year token, OR
  // - clear need_year if user clicked/selected a payload that resolves year (chip-year via inbound.year).
  const typedYear = !n.signals.textEmpty && textHasYearToken(n.text || "");
  const chipYearResolved =
    n.signals.payloadActionable &&
    n.year !== null &&
    (lastUserIntent === "silent_click" || lastUserIntent === "choose");

  // Also resolve need_pick via lane-bearing evidence
  const typedLaneResolved = !n.signals.textEmpty && isLaneToken(n.text || "");
  const chipLaneResolved =
    n.signals.payloadActionable &&
    (safeStr(n.payload?.lane || "", 24).trim() || safeStr(n.lane || "", 24).trim()) &&
    (lastUserIntent === "silent_click" || lastUserIntent === "choose");

  let nextPendingAsk = prev.pendingAsk;

  if (pendingAsk === null) nextPendingAsk = null;
  else if (pendingAsk && typeof pendingAsk === "object")
    nextPendingAsk = normalizePendingAsk(pendingAsk);
  // else: keep prev.pendingAsk, unless evidence resolves it

  if (nextPendingAsk) {
    if ((typedYear || chipYearResolved) && isNeedYearAsk(nextPendingAsk)) {
      nextPendingAsk = null;
    } else if ((typedLaneResolved || chipLaneResolved) && isNeedPickAsk(nextPendingAsk)) {
      nextPendingAsk = null;
    }
  }

  const patch = {
    lane: normalizeLane(lane || n.lane || prev.lane),
    stage: nextStage,
    topic,
    lastUserIntent,
    activeContext,
    pendingAsk: nextPendingAsk,

    lastActionTaken: safeStr(actionTaken || "", 40).trim() || null,

    lastMove: decision?.move ? safeStr(decision.move, 20) : null,
    lastDecision:
      decision?.move
        ? { move: safeStr(decision.move, 20), rationale: safeStr(decision.rationale || "", 60) }
        : null,

    lastTurnSig: turnSig,

    ...(assistantSummary != null
      ? { lastAssistantSummary: safeStr(assistantSummary, 320) }
      : {}),

    ...(Array.isArray(followUps) && followUps.length
      ? { lastChipsOffered: buildChipsOffered(followUps) }
      : {}),

    // Chip click memory: only when it truly was a silent click context
    ...(activeContext &&
    activeContext.kind === "chip" &&
    lastUserIntent === "silent_click"
      ? {
          lastChipClicked: {
            id: safeStr(activeContext.id, 80),
            label: safeStr(activeContext.label || "", 140),
            route: safeStr(activeContext.route || "", 80),
            lane: safeStr(activeContext.lane || "", 24),
            payload: activeContext.payload,
            clickedAt: activeContext.clickedAt || nowMs(),
          },
        }
      : {}),
  };

  const next = updateState(prev, patch, updateReason);

  // ENFORCEMENT++++: must increment exactly once per turn
  const prevRev = Number.isFinite(prev.rev) ? prev.rev : 0;
  if (!(Number.isFinite(next.rev) && next.rev === prevRev + 1)) {
    next.rev = prevRev + 1; // fail-open correction
  }

  return next;
}

/**
 * Enforce update-on-every-turn:
 * caller should pass prevRev and nextRev to assert increment.
 */
function assertTurnUpdated(prevState, nextState) {
  const a = prevState && typeof prevState.rev === "number" ? prevState.rev : -1;
  const b = nextState && typeof nextState.rev === "number" ? nextState.rev : -1;
  if (!(b === a + 1)) {
    const err = new Error(`STATE_SPINE_NOT_UPDATED: expected rev ${a + 1} but got ${b}`);
    err.code = "STATE_SPINE_NOT_UPDATED";
    throw err;
  }
}

module.exports = {
  SPINE_VERSION,
  LANE,
  STAGE,
  MOVE,

  // state
  createState,
  coerceState,
  updateState,
  finalizeTurn,

  // planner
  decideNextMove,

  // helpers (useful for chatEngine integration / diagnostics)
  computeTurnSig,
  topicFromAction,
  buildPendingAsk,
  buildChipsOffered,
  assertTurnUpdated,
};
