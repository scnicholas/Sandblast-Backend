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
 * v1.1.9 (MARION COG INGEST++++ + COG SANITIZE++++ + PLANNER USES COG++++ + TESTS++++)
 * ✅ Add++++: normalizeInbound reads inbound.cog / inbound.marion (MarionSO output) and sanitizes it
 * ✅ Add++++: state.marion stores bounded cognition summary (mode/intent/stage/layers/budget/dominance/traceBits)
 * ✅ Add++++: finalizeTurn can persist marionCog (from chatEngine) OR inbound.cog (if provided)
 * ✅ Harden++++: planner uses cog hints to prefer CLARIFY when Marion says clarify-needed
 * ✅ Add++++: self-tests cover cog ingestion + sanitization bounds
 *
 * Keeps: v1.1.8 (TURN-SIGNALS SHAPE FIX++++ + ACTIVECTX TYPE SAFETY++++ + ASK RESOLUTION HARDEN++++ + TESTS++++)
 * Keeps: v1.1.7 PATCH POISON SHIELD++++ + VERSION LOCK++++ + PENDINGASK KIND FIX++++ + SELF-TESTS EXPAND++++
 * Keeps: v1.1.6 COERCE UPDATEDAT FIX++++ + PATCH GUARD++++ + SELF-TESTS++++ + MICRO HARDEN++++
 * Keeps: v1.1.5 YEAR TOKEN FIX++++ + EMPTY-INBOUND NARROW FIX++++ + SAFESTR(0) FIX++++ + CHATENGINE COMPAT++++
 */

const SPINE_VERSION = "stateSpine v1.1.9";

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
  // HARDEN++++: max<=0 must yield empty string (prevents "…" leak at max=0)
  if (max <= 0) return "";
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

  // Accept any 4-digit year and let normYear clamp to 1900..2100.
  const m = s.match(/\b(19\d{2}|20\d{2}|2100)\b/);
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

  // HARDEN++++: cap key scan to avoid pathological objects
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
    "publicMode", // align with chatEngine
  ]);

  // scan at most first 120 keys deterministically
  const lim = Math.min(keys.length, 120);
  for (let i = 0; i < lim; i++) {
    if (actionable.has(keys[i])) return true;
  }
  return false;
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
// MARION COG (sanitized, bounded)
// -------------------------
function normalizeCogStage(x) {
  const v = safeStr(x, 40).toLowerCase().trim();
  // Keep aligned with STAGE but tolerate Marion-specific synonyms.
  if (Object.values(STAGE).includes(v)) return v;
  if (v === "plan") return STAGE.TRIAGE;
  if (v === "execute") return STAGE.DELIVER;
  return STAGE.OPEN;
}
function normalizeCogMode(x) {
  const v = safeStr(x, 40).toLowerCase().trim();
  // keep permissive but bounded
  if (!v) return "unknown";
  // avoid weird injection
  return v.replace(/[^a-z0-9_\-]/g, "").slice(0, 40) || "unknown";
}
function normalizeCogIntent(x) {
  const v = safeStr(x, 48).toLowerCase().trim();
  if (!v) return "unknown";
  return v.replace(/[^a-z0-9_\-]/g, "").slice(0, 48) || "unknown";
}
function normalizeCogLayers(layers) {
  const arr = Array.isArray(layers) ? layers : [];
  const out = [];
  for (let i = 0; i < arr.length && out.length < 8; i++) {
    const v = safeStr(arr[i], 32).toLowerCase().trim();
    if (!v) continue;
    const clean = v.replace(/[^a-z0-9_\-]/g, "").slice(0, 32);
    if (!clean) continue;
    if (!out.includes(clean)) out.push(clean);
  }
  return out;
}
function normalizeTraceBits(x) {
  // trace bits are tiny flags like { ak:true, psy:true } etc.
  const src = isPlainObject(x) ? x : {};
  const keys = Object.keys(src);
  const out = {};
  for (let i = 0; i < keys.length && i < 24; i++) {
    const k = safeStr(keys[i], 12).toLowerCase().trim();
    if (!k) continue;
    // only allow compact keys
    if (!/^[a-z0-9_]{1,12}$/.test(k)) continue;
    out[k] = !!src[keys[i]];
  }
  return Object.keys(out).length ? out : undefined;
}
function sanitizeMarionCog(cog) {
  if (!isPlainObject(cog)) return null;

  const mode = normalizeCogMode(cog.mode || cog.macMode || cog.persona || "");
  const intent = normalizeCogIntent(cog.intent || cog.userIntent || "");
  const stage = normalizeCogStage(cog.stage || cog.step || "");

  // budget/dominance: numeric but bounded
  const budgetRaw = Number(cog.budget);
  const budget =
    Number.isFinite(budgetRaw) ? Math.max(0, Math.min(100, Math.trunc(budgetRaw))) : undefined;

  const domRaw = Number(cog.dominance);
  const dominance =
    Number.isFinite(domRaw) ? Math.max(0, Math.min(100, Math.trunc(domRaw))) : undefined;

  const layers = normalizeCogLayers(
    cog.layers || cog.layerTags || cog.layer || cog.tags || []
  );

  const rationale = safeStr(cog.rationale || cog.why || "", 160).trim() || undefined;
  const askKind = safeStr(cog.askKind || "", 40).trim() || undefined;

  // “needsClarify” is the useful planner hint.
  const needsClarify =
    typeof cog.needsClarify === "boolean"
      ? cog.needsClarify
      : typeof cog.clarifyNeeded === "boolean"
      ? cog.clarifyNeeded
      : undefined;

  const traceBits = normalizeTraceBits(cog.trace || cog.traceBits || cog.bits || undefined);

  const out = {
    mode,
    intent,
    stage,
    layers,
    ...(budget !== undefined ? { budget } : {}),
    ...(dominance !== undefined ? { dominance } : {}),
    ...(needsClarify !== undefined ? { needsClarify: !!needsClarify } : {}),
    ...(askKind ? { askKind } : {}),
    ...(rationale ? { rationale } : {}),
    ...(traceBits ? { traceBits } : {}),
    at: nowMs(),
  };

  // if it’s basically empty, drop it
  const meaningful =
    out.mode !== "unknown" ||
    out.intent !== "unknown" ||
    (Array.isArray(out.layers) && out.layers.length) ||
    out.needsClarify === true;

  return meaningful ? out : null;
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

  // kind stays semantic; do NOT map id/type into kind.
  const kind = kindRaw || "need_more_detail";

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
    required,

    // compat fields retained
    id: idRaw || undefined,
    type: typeRaw || undefined,
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

function miniPayload(payload) {
  const p = isPlainObject(payload) ? payload : {};
  const out = {};
  if (safeStr(p.action)) out.action = safeStr(p.action, 60);
  if (safeStr(p.route)) out.route = safeStr(p.route, 60);
  if (safeStr(p.lane)) out.lane = safeStr(p.lane, 24);
  const yr = normYear(p.year);
  if (yr !== null) out.year = yr;
  if (safeStr(p.vibe)) out.vibe = safeStr(p.vibe, 40);
  if (Object.prototype.hasOwnProperty.call(p, "publicMode"))
    out.publicMode = !!p.publicMode;
  return Object.keys(out).length ? out : undefined;
}

function sanitizeActiveContext(ctx) {
  if (!ctx || typeof ctx !== "object") return null;

  const kind = safeStr(ctx.kind || "", 24).trim() || "unknown";
  const id = safeStr(ctx.id || "", 80).trim();
  const route = safeStr(ctx.route || "", 80).trim();
  const lane = normalizeLane(ctx.lane || "");
  const label = safeStr(ctx.label || "", 140).trim();
  const year = normYear(ctx.year);
  const clickedAt = Number(ctx.clickedAt || 0) || 0;

  // payload may be large; keep it tiny
  const payload = miniPayload(ctx.payload);

  const out = {
    kind,
    id,
    route,
    lane,
    label,
    clickedAt: clickedAt || nowMs(),
  };
  if (year !== null) out.year = year;
  if (payload) out.payload = payload;

  // If basically empty, drop
  if (!out.id && !out.route && !out.label) return null;
  return out;
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

      return {
        id,
        label,
        route,
        lane,
        payload: miniPayload(payload),
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
  const lane = normalizeLane(p.lane || norm?.lane || spinePrev?.lane || "");
  const year = normYear(p.year) ?? normYear(norm?.year) ?? null;

  // Silent click with actionable payload -> chip context
  if (hasPayload && norm?.signals?.payloadActionable && textEmpty) {
    const id =
      safeStr(p.id || p._id || "", 80).trim() ||
      safeStr(norm?.action || "", 60).trim() ||
      route ||
      "";
    const label = safeStr(p.label || "", 140).trim();

    const ctx = {
      kind: "chip",
      id,
      route: route || safeStr(norm?.action || "", 60).trim(),
      lane,
      label,
      year: year !== null ? year : undefined,
      payload: p,
      clickedAt: nowMs(),
    };
    return sanitizeActiveContext(ctx);
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
      typedCtx.lane = normalizeLane(norm.lane);

    return sanitizeActiveContext({
      kind: "typed",
      id: "typed",
      route: typedCtx.route || "",
      lane: typedCtx.lane || normalizeLane(spinePrev?.lane || LANE.GENERAL),
      year: typedCtx.year,
      clickedAt: nowMs(),
    });
  }

  return sanitizeActiveContext(spinePrev?.activeContext) || null;
}

// -------------------------
// state (canonical)
// -------------------------
function createState(seed = {}) {
  const createdAtIso = nowIso();
  const pendingAsk = normalizePendingAsk(seed.pendingAsk);
  const marion = sanitizeMarionCog(seed.marion);

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

    // Marion cognition (sanitized; no raw text)
    marion: marion || null,

    // Context memory
    activeContext: sanitizeActiveContext(seed.activeContext),
    lastChipsOffered: Array.isArray(seed.lastChipsOffered)
      ? seed.lastChipsOffered.slice(0, 12)
      : [],
    lastChipClicked: sanitizeActiveContext(seed.lastChipClicked),

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
    lastUserText: safeStr(seed.lastUserText || "", 0), // stays "" by default
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

  // IMPORTANT: coerce must NOT mutate timestamps (only updateState/finalizeTurn do).
  const out = { ...d, ...prev };

  // Always lock version marker (prevents patch poisoning)
  out.__spineVersion = SPINE_VERSION;

  out.rev = Number.isFinite(out.rev) ? Math.trunc(out.rev) : 0;
  if (out.rev < 0) out.rev = 0;

  // Preserve timestamps if present; else default
  out.createdAt = safeStr(out.createdAt || d.createdAt, 64) || d.createdAt;
  out.updatedAt = safeStr(out.updatedAt || d.updatedAt, 64) || d.updatedAt;

  out.lane = normalizeLane(out.lane);
  out.stage = normalizeStage(out.stage);
  out.topic = safeStr(out.topic || "", 80) || "unknown";
  out.lastUserIntent = safeStr(out.lastUserIntent || "", 40) || "unknown";

  out.pendingAsk = normalizePendingAsk(out.pendingAsk);

  // Marion (sanitized)
  out.marion = sanitizeMarionCog(out.marion);

  if (!out.goal || typeof out.goal !== "object")
    out.goal = { primary: null, secondary: [], updatedAt: 0 };
  if (!Array.isArray(out.goal.secondary)) out.goal.secondary = [];

  if (!Array.isArray(out.lastChipsOffered)) out.lastChipsOffered = [];
  if (out.lastChipsOffered.length > 12)
    out.lastChipsOffered = out.lastChipsOffered.slice(0, 12);

  out.activeContext = sanitizeActiveContext(out.activeContext);
  out.lastChipClicked = sanitizeActiveContext(out.lastChipClicked);

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

  // Privacy default
  out.lastUserText = safeStr(out.lastUserText || "", 0);

  return out;
}

function stripPoisonKeys(patchObj) {
  // PATCH POISON SHIELD++++: do not allow callers to overwrite these
  const out = { ...patchObj };
  delete out.__spineVersion;
  delete out.rev;
  delete out.createdAt;
  delete out.updatedAt;
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
  const patchObjRaw = isPlainObject(patch) ? patch : {};
  const patchObj = stripPoisonKeys(patchObjRaw);
  const updatedAt = nowIso();

  // Normalize pendingAsk in patch (supports chatEngine schema)
  const patchPendingAsk =
    Object.prototype.hasOwnProperty.call(patchObj, "pendingAsk") &&
    patchObj.pendingAsk === null
      ? null
      : patchObj.pendingAsk
      ? normalizePendingAsk(patchObj.pendingAsk)
      : undefined;

  const patchDiag = isPlainObject(patchObj.diag) ? patchObj.diag : null;
  const patchGoal = isPlainObject(patchObj.goal) ? patchObj.goal : null;

  const patchMarion =
    Object.prototype.hasOwnProperty.call(patchObj, "marion") &&
    patchObj.marion === null
      ? null
      : patchObj.marion
      ? sanitizeMarionCog(patchObj.marion)
      : undefined;

  const next = {
    ...p,
    ...patchObj,

    __spineVersion: SPINE_VERSION,

    // core normalized
    lane: patchObj.lane ? normalizeLane(patchObj.lane) : p.lane,
    stage: patchObj.stage ? normalizeStage(patchObj.stage) : p.stage,
    topic: patchObj.topic != null ? safeStr(patchObj.topic, 80) : p.topic,
    lastUserIntent:
      patchObj.lastUserIntent != null
        ? safeStr(patchObj.lastUserIntent, 40)
        : p.lastUserIntent,

    // Marion cognition
    marion:
      patchMarion === null
        ? null
        : patchMarion
        ? patchMarion
        : p.marion,

    // Evidence trail (bounded, caller-controlled)
    lastUserText:
      patchObj.lastUserText != null
        ? safeStr(patchObj.lastUserText, 0)
        : p.lastUserText,
    lastAssistantSummary:
      patchObj.lastAssistantSummary != null
        ? safeStr(patchObj.lastAssistantSummary, 320)
        : p.lastAssistantSummary,

    goal: patchGoal
      ? {
          ...p.goal,
          ...patchGoal,
          primary:
            patchGoal.primary != null
              ? safeStr(patchGoal.primary, 120)
              : p.goal.primary,
          secondary: Array.isArray(patchGoal.secondary)
            ? patchGoal.secondary.slice(0, 8)
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
            id: safeStr(patchPendingAsk.id || "", 80) || undefined,
            type: safeStr(patchPendingAsk.type || "", 40) || undefined,
          }
        : p.pendingAsk,

    activeContext:
      patchObj.activeContext === null
        ? null
        : sanitizeActiveContext(patchObj.activeContext) ||
          sanitizeActiveContext(p.activeContext) ||
          null,

    lastChipsOffered: Array.isArray(patchObj.lastChipsOffered)
      ? patchObj.lastChipsOffered.slice(0, 12)
      : p.lastChipsOffered,

    lastChipClicked:
      patchObj.lastChipClicked === null
        ? null
        : sanitizeActiveContext(patchObj.lastChipClicked) ||
          sanitizeActiveContext(p.lastChipClicked) ||
          null,

    lastMove:
      patchObj.lastMove != null ? safeStr(patchObj.lastMove, 20) : p.lastMove,
    lastDecision:
      patchObj.lastDecision && typeof patchObj.lastDecision === "object"
        ? {
            move: safeStr(patchObj.lastDecision.move || "", 20),
            rationale: safeStr(patchObj.lastDecision.rationale || "", 60),
          }
        : p.lastDecision,

    lastActionTaken:
      patchObj.lastActionTaken != null
        ? safeStr(patchObj.lastActionTaken, 40)
        : p.lastActionTaken,
    lastTurnSig:
      patchObj.lastTurnSig != null ? safeStr(patchObj.lastTurnSig, 240) : p.lastTurnSig,

    turns:
      patchObj.turns && typeof patchObj.turns === "object"
        ? {
            user: Number.isFinite(patchObj.turns.user)
              ? Math.max(0, Math.trunc(patchObj.turns.user))
              : p.turns.user,
            assistant: Number.isFinite(patchObj.turns.assistant)
              ? Math.max(0, Math.trunc(patchObj.turns.assistant))
              : p.turns.assistant,
            sinceReset: Number.isFinite(patchObj.turns.sinceReset)
              ? Math.max(0, Math.trunc(patchObj.turns.sinceReset))
              : p.turns.sinceReset,
          }
        : p.turns,

    // only updateState mutates updatedAt + rev
    updatedAt,
    rev: (Number.isFinite(p.rev) ? p.rev : 0) + 1,

    diag: {
      ...p.diag,
      ...(patchDiag ? patchDiag : {}),
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
  next.activeContext = sanitizeActiveContext(next.activeContext);
  next.lastChipClicked = sanitizeActiveContext(next.lastChipClicked);
  next.marion = sanitizeMarionCog(next.marion);

  return next;
}

// -------------------------
// inbound normalization (tiny, for planner/spine only)
// -------------------------
// NOTE: This must accept chatEngine's inbound shapes:
// - inbound.ctx and/or inbound.payload
// - chatEngine uses turnSignals; some older callers use signals
// - marion may be provided as inbound.cog or inbound.marion
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
    body.action || ctx.action || payload.action || payload.route || "",
    80
  ).trim();

  const lane = safeStr(body.lane || ctx.lane || payload.lane || "", 24).trim();

  // year: accept multiple aliases used across the system
  const year =
    normYear(body.year) ??
    normYear(ctx.year) ??
    normYear(payload.year) ??
    normYear(ctx.effectiveYear) ??
    extractYearFromText(text) ??
    null;

  const textEmpty = !text;

  const hasPayload = isPlainObject(payload) && Object.keys(payload).length > 0;
  const payloadActionable = hasPayload && hasActionablePayload(payload);

  // Compatibility: accept {turnSignals} OR {signals}
  const ts = isPlainObject(body.turnSignals)
    ? body.turnSignals
    : isPlainObject(body.signals)
    ? body.signals
    : null;

  // Some callers only pass partial signals; fill from computed defaults.
  const signals = {
    textEmpty: ts && typeof ts.textEmpty === "boolean" ? ts.textEmpty : textEmpty,
    hasPayload: ts && typeof ts.hasPayload === "boolean" ? ts.hasPayload : hasPayload,
    payloadActionable:
      ts && typeof ts.payloadActionable === "boolean"
        ? ts.payloadActionable
        : payloadActionable,
  };

  // Marion cog: accept either body.cog OR body.marion
  const cog = sanitizeMarionCog(body.cog || body.marion || null);

  return {
    text,
    payload,
    ctx,
    lane,
    year,
    action,
    signals,
    cog,
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

  // If Marion explicitly thinks we need clarify, respect it.
  const marionHint = n.cog || s.marion;
  if (marionHint && marionHint.needsClarify === true) {
    return {
      move: MOVE.CLARIFY,
      stage: STAGE.CLARIFY,
      speak: "One quick detail, then I’ll execute cleanly.",
      ask: buildPendingAsk(
        marionHint.askKind || "need_more_detail",
        "Give me the missing detail in one line so I can proceed.",
        []
      ),
      rationale: "marion_needs_clarify",
    };
  }

  // If we already have a pending ask, try to resolve it based on typed/click evidence.
  if (s.pendingAsk && isPlainObject(s.pendingAsk)) {
    const pa = normalizePendingAsk(s.pendingAsk);
    const kind = safeStr(pa?.kind || "", 80).toLowerCase();
    const id = safeStr(pa?.id || "", 80).toLowerCase();

    const answeredYear =
      (kind === "need_year" || id === "need_year" || isNeedYearAsk(pa)) &&
      (textHasYearToken(text) || (payloadActionable && n.year !== null));

    // “need_pick” can be answered by short lane words OR a lane-bearing chip.
    // Harden++++: treat payload.route as a lane answer when it is a lane token.
    const routeAsPick = payloadActionable && isLaneToken(safeStr(n.payload?.route || "", 24));
    const answeredPick =
      (kind === "need_pick" || id === "need_pick" || isNeedPickAsk(pa)) &&
      (isLaneToken(text) ||
        routeAsPick ||
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

  // Empty text and non-actionable -> NARROW if meaningful context exists, else CLARIFY
  if (!hasText && textEmpty) {
    // topic defaults to "unknown" and should NOT count as real context.
    const hasCtx =
      !!s.activeContext ||
      (safeStr(s.topic || "", 80).trim() && safeStr(s.topic || "", 80).trim() !== "unknown") ||
      (safeStr(s.lane || "", 24).trim() && safeStr(s.lane || "", 24).trim() !== LANE.GENERAL) ||
      !!s.pendingAsk ||
      !!s.marion;

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
  marionCog, // optional: sanitized MarionSO output (preferred from chatEngine)
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

  // Choose marion: explicit arg beats inbound.cog beats prev.marion
  const nextMarion =
    marionCog === null
      ? null
      : marionCog
      ? sanitizeMarionCog(marionCog)
      : n.cog
      ? sanitizeMarionCog(n.cog)
      : prev.marion;

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
  const routeAsLane =
    n.signals.payloadActionable && isLaneToken(safeStr(n.payload?.route || "", 24));
  const chipLaneResolved =
    n.signals.payloadActionable &&
    (routeAsLane ||
      safeStr(n.payload?.lane || "", 24).trim() ||
      safeStr(n.lane || "", 24).trim()) &&
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

    // Marion cognition (sanitized)
    marion: nextMarion,

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
          lastChipClicked: sanitizeActiveContext({
            id: safeStr(activeContext.id, 80),
            label: safeStr(activeContext.label || "", 140),
            route: safeStr(activeContext.route || "", 80),
            lane: safeStr(activeContext.lane || "", 24),
            payload: activeContext.payload,
            clickedAt: activeContext.clickedAt || nowMs(),
            kind: "chip",
          }),
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

// -------------------------
// self-tests (no deps, no side effects)
// -------------------------
function runSpineSelfTests() {
  const failures = [];
  function assert(name, cond, detail) {
    if (!cond) failures.push({ name, detail: safeStr(detail || "", 400) });
  }

  // 1) coerceState must not mutate updatedAt
  const st0 = createState({ lane: "music" });
  const before = st0.updatedAt;
  const st1 = coerceState(st0);
  assert(
    "coerce_does_not_touch_updatedAt",
    st1.updatedAt === before,
    `${before} -> ${st1.updatedAt}`
  );

  // 2) updateState increments rev exactly once
  const u1 = updateState(st0, { topic: "help" }, "turn");
  assert("update_rev_inc", u1.rev === st0.rev + 1, `${st0.rev} -> ${u1.rev}`);

  // 3) assertTurnUpdated passes on normal update
  try {
    assertTurnUpdated(st0, u1);
    assert("assertTurnUpdated_ok", true, "");
  } catch (e) {
    assert("assertTurnUpdated_ok", false, e && e.message ? e.message : String(e));
  }

  // 4) pendingAsk normalize supports chatEngine schema
  const pa = normalizePendingAsk({
    id: "need_year",
    type: "clarify",
    prompt: "Give year",
    required: true,
  });
  assert("pendingAsk_kind_default", safeStr(pa.kind) === "need_more_detail", safeStr(pa.kind));
  assert("pendingAsk_prompt_has_year", safeStr(pa.prompt).toLowerCase().includes("year"), pa.prompt);
  assert("pendingAsk_id_preserved", safeStr(pa.id) === "need_year", safeStr(pa.id));

  // 5) decideNextMove honors actionable payload silent click
  const dm = decideNextMove(createState(), {
    payload: { action: "top10", year: 1988, lane: "music" },
    turnSignals: { hasPayload: true, payloadActionable: true, textEmpty: true },
    text: "",
  });
  assert("decide_actionable_payload_advance", dm.move === MOVE.ADVANCE, safeStr(dm.move));

  // 6) Patch poison shield: cannot override rev/createdAt/updatedAt/__spineVersion
  const poison = updateState(
    st0,
    { rev: 999, createdAt: "X", updatedAt: "Y", __spineVersion: "BAD" },
    "poison"
  );
  assert("poison_rev_ignored", poison.rev === st0.rev + 1, `${poison.rev}`);
  assert("poison_createdAt_ignored", poison.createdAt === st0.createdAt, `${poison.createdAt}`);
  assert("poison_updatedAt_overwritten", poison.updatedAt !== "Y", `${poison.updatedAt}`);
  assert("poison_version_locked", poison.__spineVersion === SPINE_VERSION, `${poison.__spineVersion}`);

  // 7) signals compatibility: accept {signals} alias
  const dm2 = decideNextMove(createState(), {
    payload: { action: "top10", year: 1992, lane: "music" },
    signals: { hasPayload: true, payloadActionable: true, textEmpty: true },
    text: "",
  });
  assert("signals_alias_advances", dm2.move === MOVE.ADVANCE, safeStr(dm2.move));

  // 8) activeContext sanitation: lane normalized + payload mini only
  const ac = buildActiveContext(
    {
      text: "",
      payload: { action: "top10", year: 1988, lane: "MUSIC", vibe: "x", extra: "NOPE" },
      year: 1988,
      lane: "",
      action: "",
      signals: { hasPayload: true, payloadActionable: true, textEmpty: true },
    },
    createState()
  );
  assert("activeContext_lane_normalized", ac && ac.lane === "music", safeStr(ac && ac.lane));
  assert(
    "activeContext_payload_mini",
    ac && ac.payload && !ac.payload.extra,
    safeStr(ac && JSON.stringify(ac.payload))
  );

  // 9) need_pick resolves via payload.route lane token
  const stPick = createState({ pendingAsk: { kind: "need_pick", prompt: "Pick a lane" } });
  const planPick = decideNextMove(stPick, {
    payload: { route: "movies" },
    turnSignals: { hasPayload: true, payloadActionable: true, textEmpty: true },
    text: "",
  });
  assert("need_pick_resolves_via_route", planPick.move === MOVE.ADVANCE, safeStr(planPick.move));

  // 10) marion cog ingestion (normalizeInbound + sanitize)
  const nb = normalizeInbound({
    text: "hello",
    cog: { mode: "Strategic", intent: "clarify", stage: "clarify", layers: ["AI", "Finance"], needsClarify: true, trace: { ak: true } },
  });
  assert("cog_ingested", !!nb.cog, JSON.stringify(nb.cog || {}));
  assert("cog_layers_norm", nb.cog && nb.cog.layers.includes("ai"), JSON.stringify(nb.cog || {}));
  assert("cog_needsClarify", nb.cog && nb.cog.needsClarify === true, JSON.stringify(nb.cog || {}));

  return { ok: failures.length === 0, failures, ran: 10, v: SPINE_VERSION };
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

  // tests
  runSpineSelfTests,
};
