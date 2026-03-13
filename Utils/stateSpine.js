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
 * v1.4.0 (LOOP-COLLAPSE++++ + MENU-INTENT RESOLUTION++++ + DIAG/RESTRUCTURE ADVANCE++++)
 * ✅ Add++++: recognizes diagnosis / restructure / code-update / patch intents as actionable progress
 * ✅ Add++++: generic-menu bounce fuse collapses repeated clarify/menu cycles into ADVANCE
 * ✅ Add++++: stronger need_pick / need_more_detail resolution for chip-like text and route/action payloads
 * ✅ Add++++: normalizeInbound accepts richer turnSignals and emotion flags
 * ✅ Harden++++: finalizeTurn records clarify/menu loops into op + audit layers
 * ✅ Harden++++: planner prefers advancing when user intent is clearly technical / implementation-oriented
 * ✅ Keeps: marion cog ingest + sanitize + audit + enterprise-heavy additive fields
 */

const SPINE_VERSION =
  "stateSpine v1.4.0 (LOOP-COLLAPSE++++ + MENU-INTENT RESOLUTION++++ + DIAG/RESTRUCTURE ADVANCE++++)";

const LANE = Object.freeze({
  MUSIC: "music",
  ROKU: "roku",
  RADIO: "radio",
  SCHEDULE: "schedule",
  NEWS_CANADA: "news-canada",

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
  const m = s.match(/\b(19\d{2}|20\d{2}|2100)\b/);
  if (!m) return null;
  return normYear(Number(m[1]));
}
function textHasYearToken(t) {
  return extractYearFromText(t) !== null;
}
function sha1Lite(str) {
  const s = safeStr(str, 2000);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function uniqueStrings(arr, max = 24, itemMax = 80) {
  const out = [];
  const seen = new Set();
  const src = Array.isArray(arr) ? arr : [];
  for (let i = 0; i < src.length && out.length < max; i++) {
    const v = safeStr(src[i], itemMax).trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}
function truthy(v) {
  if (v === true) return true;
  const s = safeStr(v, 24).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}
function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function hasActionablePayload(payload) {
  if (!isPlainObject(payload)) return false;
  const keys = Object.keys(payload);
  if (!keys.length) return false;

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
    "publicMode",
    "chip",
    "choice",
  ]);

  const lim = Math.min(keys.length, 120);
  for (let i = 0; i < lim; i++) {
    if (actionable.has(keys[i])) return true;
  }
  return false;
}

function isLaneToken(t) {
  const s = safeStr(t, 64).trim().toLowerCase();
  return Object.values(LANE).includes(s);
}

function isMenuIntentToken(t) {
  const s = safeStr(t, 80).trim().toLowerCase();
  return /^(diagnosis|diagnose|restructure|restructuring|code update|update|patch|implement|implementation|debug|debugging|fix|repair|analysis)$/.test(s);
}

function isProgressIntentText(t) {
  const s = safeStr(t, 400).toLowerCase();
  if (!s) return false;
  return (
    /\b(diagnosis|diagnose|critical analysis|analyze this|break this down)\b/.test(s) ||
    /\b(restructure|restructuring|refactor|rebuild|rewrite)\b/.test(s) ||
    /\b(code update|update the code|update the file|patch it|apply the patch)\b/.test(s) ||
    /\b(implement|wire it|wire this|integrate|hook it up)\b/.test(s) ||
    /\b(debug|debugging|fix this|repair this|stop the loop|solve the looping)\b/.test(s)
  );
}

function isGenericMenuBounceReply(summary) {
  const s = safeStr(summary, 360).toLowerCase();
  if (!s) return false;
  return (
    /do you want diagnosis, restructuring, or an exact code update/.test(s) ||
    /tell me what you want next/.test(s) ||
    /pick what you want next/.test(s) ||
    /music, movies, or sponsors/.test(s) ||
    /give me the exact target and i will keep this tight/.test(s) ||
    /give me the exact target and i will stay with that path/.test(s)
  );
}

function isDistressText(t) {
  const s = safeStr(t, 240).toLowerCase();
  if (!s) return false;
  return (
    /\b(hurt|hurting|pain|in pain|suffering|heartbroken|overwhelmed|hopeless)\b/.test(s) ||
    /\b(anxious|anxiety|panic|panicking|scared|terrified)\b/.test(s) ||
    /\b(depressed|depression|sad|crying|lonely)\b/.test(s) ||
    /\b(self[- ]?harm|suicid(al|e)|kill myself|end it|don['’]t want to live)\b/.test(s)
  );
}

// -------------------------
// MARION COG (sanitized, bounded)
// -------------------------
function normalizeCogStage(x) {
  const v = safeStr(x, 40).toLowerCase().trim();
  if (Object.values(STAGE).includes(v)) return v;
  if (v === "plan") return STAGE.TRIAGE;
  if (v === "execute") return STAGE.DELIVER;
  return STAGE.OPEN;
}
function normalizeCogMode(x) {
  const v = safeStr(x, 40).toLowerCase().trim();
  if (!v) return "unknown";
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
  const src = isPlainObject(x) ? x : {};
  const keys = Object.keys(src);
  const out = {};
  for (let i = 0; i < keys.length && i < 24; i++) {
    const k = safeStr(keys[i], 12).toLowerCase().trim();
    if (!k) continue;
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
    ...(safeStr(cog.askId || "", 24).trim() ? { askId: safeStr(cog.askId || "", 24).trim() } : {}),
    ...(safeStr(cog.clarifyPrompt || "", 260).trim()
      ? { clarifyPrompt: safeStr(cog.clarifyPrompt || "", 260).trim() }
      : {}),
    ...(rationale ? { rationale } : {}),
    ...(traceBits ? { traceBits } : {}),
    at: nowMs(),
  };

  const meaningful =
    out.mode !== "unknown" ||
    out.intent !== "unknown" ||
    (Array.isArray(out.layers) && out.layers.length) ||
    out.needsClarify === true;

  return meaningful ? out : null;
}

// -------------------------
// pendingAsk compatibility
// -------------------------
function normalizePendingAsk(p) {
  if (!p || typeof p !== "object") return null;

  const kindRaw = safeStr(p.kind || "", 40).trim();
  const idRaw = safeStr(p.id || "", 80).trim();
  const typeRaw = safeStr(p.type || "", 40).trim();

  const kind = kindRaw || "need_more_detail";
  const prompt = safeStr(p.prompt || "", 220).trim();
  const options = Array.isArray(p.options) ? p.options.slice(0, 8) : [];

  const required =
    typeof p.required === "boolean"
      ? p.required
      : safeStr(p.required || "").trim()
      ? !/^(0|false|no|n|off)$/i.test(safeStr(p.required).trim())
      : true;

  const createdAt = Number(p.createdAt || 0) || nowMs();

  return {
    kind,
    prompt,
    options,
    createdAt,
    required,
    id: idRaw || undefined,
    type: typeRaw || undefined,
  };
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

function isNeedDetailAsk(pendingAsk) {
  const pa = normalizePendingAsk(pendingAsk);
  if (!pa) return false;
  const k = safeStr(pa.kind || "", 80).toLowerCase();
  const id = safeStr(pa.id || "", 80).toLowerCase();
  return k === "need_more_detail" || id === "need_more_detail";
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
  if (safeStr(p.label)) out.label = safeStr(p.label, 80);
  if (safeStr(p.choice)) out.choice = safeStr(p.choice, 80);
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
  const route = safeStr(norm?.payload?.route || "", 80).trim();
  const label = safeStr(norm?.payload?.label || "", 120).trim();

  if (hasPayload && textEmpty) {
    if (isMenuIntentToken(route) || isMenuIntentToken(label) || isMenuIntentToken(norm?.action || "")) {
      return "choose_progress";
    }
    return "silent_click";
  }
  if (hasAction && hasPayload) return "choose";
  if (hasAction && !txt) return "choose";
  if (txt && isProgressIntentText(txt)) return "advance_request";
  if (txt) return "ask";
  return "unknown";
}

function computeTurnSig({ lane, topic, intent, activeContext, text }) {
  const y =
    activeContext && typeof activeContext.year === "number"
      ? String(activeContext.year)
      : "";
  const rid = activeContext && activeContext.route ? activeContext.route : "";
  const raw = safeStr(text || "", 2000);
  const hasAnyText = raw ? "1" : "0";
  const hasYear = textHasYearToken(raw) ? "1" : "0";
  const progress = isProgressIntentText(raw) ? "1" : "0";
  const distress = isDistressText(raw) ? "1" : "0";
  const th = raw ? sha1Lite(raw).slice(0, 10) : "";

  return [
    lane || "",
    topic || "",
    intent || "",
    rid || "",
    y || "",
    hasAnyText,
    hasYear,
    progress,
    distress,
    th,
  ].join("|");
}

function topicFromAction(action) {
  const a = safeStr(action || "", 80).trim().toLowerCase();
  if (!a) return "unknown";
  if (a === "top10") return "top10_by_year";
  if (a === "story_moment" || a === "custom_story" || a === "micro_moment") return "story_moment";
  if (a === "yearend_hot100") return "year_end";
  if (a === "ask_year") return "help";
  if (a === "switch_lane") return "help";
  if (a === "counsel_intro") return "support";
  if (a === "reset") return "help";
  if (/^(diagnosis|diagnose)$/.test(a)) return "diagnosis";
  if (/^(restructure|restructuring|refactor|rebuild)$/.test(a)) return "restructure";
  if (/^(patch|update|code_update|implement|debug|fix)$/.test(a)) return "implementation";
  return "unknown";
}

function topicFromText(text) {
  const s = safeStr(text || "", 400).toLowerCase();
  if (!s) return "unknown";
  if (/\b(loop|looping|repeat|repeating)\b/.test(s)) return "loop_debug";
  if (/\b(diagnosis|diagnose|critical analysis)\b/.test(s)) return "diagnosis";
  if (/\b(restructure|restructuring|refactor|rebuild|rewrite)\b/.test(s)) return "restructure";
  if (/\b(code update|patch|implement|wire it|integrate|fix this|debug)\b/.test(s)) return "implementation";
  if (/\b(hurt|hurting|pain|anxious|panic|overwhelmed|sad|lonely|hopeless)\b/.test(s)) return "support";
  return "unknown";
}

function stageProgress(prevStage, move) {
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
  const hasPayload = !!norm?.signals?.hasPayload;
  const textEmpty = !!norm?.signals?.textEmpty;

  const p = isPlainObject(norm?.payload) ? norm.payload : {};
  const route = safeStr(p.route || p.action || "", 80).trim();
  const lane = normalizeLane(p.lane || norm?.lane || spinePrev?.lane || "");
  const year = normYear(p.year) ?? normYear(norm?.year) ?? null;

  if (hasPayload && norm?.signals?.payloadActionable && textEmpty) {
    const id =
      safeStr(p.id || p._id || "", 80).trim() ||
      safeStr(norm?.action || "", 60).trim() ||
      route ||
      "";
    const label = safeStr(p.label || p.choice || "", 140).trim();

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

  const typedText = safeStr(norm?.text || "", 2000).trim();
  const typed = !!typedText && !textEmpty;
  const hasExplicitAction = !!safeStr(norm?.action || "", 80).trim();
  const hasYear = normYear(norm?.year) !== null;

  if (typed && (hasExplicitAction || hasYear || isProgressIntentText(typedText) || isMenuIntentToken(typedText))) {
    return sanitizeActiveContext({
      kind: "typed",
      id: "typed",
      route: hasExplicitAction ? safeStr(norm?.action || "", 60).trim() : topicFromText(typedText),
      lane: normalizeLane(norm?.lane || spinePrev?.lane || LANE.GENERAL),
      year: hasYear ? normYear(norm?.year) : undefined,
      label: typedText,
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
    rev: 0,
    createdAt: createdAtIso,
    updatedAt: createdAtIso,

    lane: normalizeLane(seed.lane),
    stage: normalizeStage(seed.stage),
    topic: safeStr(seed.topic || "", 80) || "unknown",

    lastUserIntent: safeStr(seed.lastUserIntent || "", 40) || "unknown",
    pendingAsk: pendingAsk || null,

    memoryWindows: {
      recentIntents: Array.isArray(seed?.memoryWindows?.recentIntents)
        ? seed.memoryWindows.recentIntents.slice(-8).map((x) => ({
            intent: safeStr(x && x.intent || "", 48) || "unknown",
            ts: Number(x && x.ts || 0) || 0,
          }))
        : [],
      unresolvedAsks: Array.isArray(seed?.memoryWindows?.unresolvedAsks)
        ? seed.memoryWindows.unresolvedAsks.slice(-8).map((x) => safeStr(x, 160)).filter(Boolean)
        : [],
      lastResolvedIntent: safeStr(seed?.memoryWindows?.lastResolvedIntent || "", 64) || "",
      lastUserPreference: isPlainObject(seed?.memoryWindows?.lastUserPreference)
        ? {
            lane: safeStr(seed.memoryWindows.lastUserPreference.lane || "", 24) || "",
            year: normYear(seed.memoryWindows.lastUserPreference.year),
            mode: safeStr(seed.memoryWindows.lastUserPreference.mode || "", 40) || "",
            updatedAt: Number(seed.memoryWindows.lastUserPreference.updatedAt || 0) || 0,
          }
        : { lane: "", year: null, mode: "", updatedAt: 0 },
    },

    marion: marion || null,

    activeContext: sanitizeActiveContext(seed.activeContext),
    lastChipsOffered: Array.isArray(seed.lastChipsOffered)
      ? seed.lastChipsOffered.slice(0, 12)
      : [],
    lastChipClicked: sanitizeActiveContext(seed.lastChipClicked),

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

    lastUserText: safeStr(seed.lastUserText || "", 0),
    lastAssistantSummary: safeStr(seed.lastAssistantSummary || "", 320),

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

    diag: {
      lastUpdateReason: safeStr(seed?.diag?.lastUpdateReason || "", 120),
      clarifyKey: safeStr(seed?.diag?.clarifyKey || "", 80),
      clarifyRepeats: Number.isFinite(seed?.diag?.clarifyRepeats)
        ? Math.max(0, Math.trunc(seed.diag.clarifyRepeats))
        : 0,
      menuBounceRepeats: Number.isFinite(seed?.diag?.menuBounceRepeats)
        ? Math.max(0, Math.trunc(seed.diag.menuBounceRepeats))
        : 0,
      lastMenuBounceKey: safeStr(seed?.diag?.lastMenuBounceKey || "", 120),
    },

    op: {
      objective: safeStr(seed?.op?.objective || "", 240) || null,
      depthLevel: Number.isFinite(seed?.op?.depthLevel) ? Math.max(0, Math.trunc(seed.op.depthLevel)) : 0,
      confidenceScore: Number.isFinite(seed?.op?.confidenceScore) ? Math.max(0, Math.min(1, Number(seed.op.confidenceScore))) : 0,
      operationalWeight: Number.isFinite(seed?.op?.operationalWeight) ? Math.max(0, Math.min(1, Number(seed.op.operationalWeight))) : 0,
      riskFlags: Array.isArray(seed?.op?.riskFlags) ? seed.op.riskFlags.slice(0, 12).map((x) => safeStr(x, 48)).filter(Boolean) : [],
      escalationFlag: !!seed?.op?.escalationFlag,
      unresolvedThreads: Array.isArray(seed?.op?.unresolvedThreads)
        ? seed.op.unresolvedThreads.slice(0, 12).map((x) => safeStr(x, 140)).filter(Boolean)
        : [],
      lastGoodRev: Number.isFinite(seed?.op?.lastGoodRev) ? Math.max(0, Math.trunc(seed.op.lastGoodRev)) : 0,
      lastGoodTurnSig: safeStr(seed?.op?.lastGoodTurnSig || "", 240) || null,
      loopRisk: Number.isFinite(seed?.op?.loopRisk) ? Math.max(0, Math.min(1, Number(seed.op.loopRisk))) : 0,
      lastPlannerMode: safeStr(seed?.op?.lastPlannerMode || "", 48) || "",
    },

    governance: {
      safetyMode: safeStr(seed?.governance?.safetyMode || "", 24) || "standard",
      requireHumanConfirmation: !!seed?.governance?.requireHumanConfirmation,
      escalationRules: isPlainObject(seed?.governance?.escalationRules)
        ? seed.governance.escalationRules
        : {
            onLowConfidence: 0.45,
            onHighRisk: true,
            onRepeatErrors: 2,
          },
      blockedTopics: Array.isArray(seed?.governance?.blockedTopics)
        ? seed.governance.blockedTopics.slice(0, 24).map((x) => safeStr(x, 40)).filter(Boolean)
        : [],
    },

    audit: {
      enabled: seed?.audit?.enabled === false ? false : true,
      maxTurns: Number.isFinite(seed?.audit?.maxTurns) ? Math.max(25, Math.min(500, Math.trunc(seed.audit.maxTurns))) : 200,
      turnLogs: Array.isArray(seed?.audit?.turnLogs) ? seed.audit.turnLogs.slice(-200) : [],
      errors: Array.isArray(seed?.audit?.errors) ? seed.audit.errors.slice(-200) : [],
      metrics: isPlainObject(seed?.audit?.metrics) ? seed.audit.metrics : {
        avgLatencyMs: 0,
        lastLatencyMs: 0,
        fallbackRate: 0,
        clarifyRate: 0,
        menuBounceRate: 0,
      },
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

  out.createdAt = safeStr(out.createdAt || d.createdAt, 64) || d.createdAt;
  out.updatedAt = safeStr(out.updatedAt || d.updatedAt, 64) || d.updatedAt;

  out.lane = normalizeLane(out.lane);
  out.stage = normalizeStage(out.stage);
  out.topic = safeStr(out.topic || "", 80) || "unknown";
  out.lastUserIntent = safeStr(out.lastUserIntent || "", 40) || "unknown";
  out.pendingAsk = normalizePendingAsk(out.pendingAsk);

  if (!out.memoryWindows || typeof out.memoryWindows !== "object") {
    out.memoryWindows = {
      recentIntents: [],
      unresolvedAsks: [],
      lastResolvedIntent: "",
      lastUserPreference: { lane: "", year: null, mode: "", updatedAt: 0 }
    };
  } else {
    out.memoryWindows.recentIntents = Array.isArray(out.memoryWindows.recentIntents)
      ? out.memoryWindows.recentIntents.slice(-8).map((x) => ({
          intent: safeStr(x && x.intent || "", 48) || "unknown",
          ts: Number(x && x.ts || 0) || 0
        }))
      : [];
    out.memoryWindows.unresolvedAsks = Array.isArray(out.memoryWindows.unresolvedAsks)
      ? out.memoryWindows.unresolvedAsks.slice(-8).map((x) => safeStr(x, 160)).filter(Boolean)
      : [];
    out.memoryWindows.lastResolvedIntent = safeStr(out.memoryWindows.lastResolvedIntent || "", 64) || "";
    if (!out.memoryWindows.lastUserPreference || typeof out.memoryWindows.lastUserPreference !== "object") {
      out.memoryWindows.lastUserPreference = { lane: "", year: null, mode: "", updatedAt: 0 };
    } else {
      out.memoryWindows.lastUserPreference = {
        lane: safeStr(out.memoryWindows.lastUserPreference.lane || "", 24) || "",
        year: normYear(out.memoryWindows.lastUserPreference.year),
        mode: safeStr(out.memoryWindows.lastUserPreference.mode || "", 40) || "",
        updatedAt: Number(out.memoryWindows.lastUserPreference.updatedAt || 0) || 0,
      };
    }
  }

  out.marion = sanitizeMarionCog(out.marion);

  if (!out.goal || typeof out.goal !== "object") out.goal = { primary: null, secondary: [], updatedAt: 0 };
  if (!Array.isArray(out.goal.secondary)) out.goal.secondary = [];

  if (!Array.isArray(out.lastChipsOffered)) out.lastChipsOffered = [];
  if (out.lastChipsOffered.length > 12) out.lastChipsOffered = out.lastChipsOffered.slice(0, 12);

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
    out.turns.user = Number.isFinite(out.turns.user) ? Math.max(0, Math.trunc(out.turns.user)) : 0;
    out.turns.assistant = Number.isFinite(out.turns.assistant) ? Math.max(0, Math.trunc(out.turns.assistant)) : 0;
    out.turns.sinceReset = Number.isFinite(out.turns.sinceReset) ? Math.max(0, Math.trunc(out.turns.sinceReset)) : 0;
  }

  out.lastUserText = safeStr(out.lastUserText || "", 0);

  if (!out.diag || typeof out.diag !== "object") out.diag = {};
  out.diag.lastUpdateReason = safeStr(out.diag.lastUpdateReason || "", 120);
  out.diag.clarifyKey = safeStr(out.diag.clarifyKey || "", 80);
  out.diag.clarifyRepeats = Number.isFinite(out.diag.clarifyRepeats) ? Math.max(0, Math.trunc(out.diag.clarifyRepeats)) : 0;
  out.diag.menuBounceRepeats = Number.isFinite(out.diag.menuBounceRepeats) ? Math.max(0, Math.trunc(out.diag.menuBounceRepeats)) : 0;
  out.diag.lastMenuBounceKey = safeStr(out.diag.lastMenuBounceKey || "", 120);

  if (!out.op || typeof out.op !== "object") out.op = {};
  out.op.objective = safeStr(out.op.objective || "", 240) || null;
  out.op.depthLevel = Number.isFinite(out.op.depthLevel) ? Math.max(0, Math.trunc(out.op.depthLevel)) : 0;
  out.op.confidenceScore = Number.isFinite(out.op.confidenceScore) ? Math.max(0, Math.min(1, Number(out.op.confidenceScore))) : 0;
  out.op.operationalWeight = Number.isFinite(out.op.operationalWeight) ? Math.max(0, Math.min(1, Number(out.op.operationalWeight))) : 0;
  out.op.riskFlags = Array.isArray(out.op.riskFlags)
    ? out.op.riskFlags.slice(0, 12).map((x) => safeStr(x, 48)).filter(Boolean)
    : [];
  out.op.escalationFlag = !!out.op.escalationFlag;
  out.op.unresolvedThreads = Array.isArray(out.op.unresolvedThreads)
    ? out.op.unresolvedThreads.slice(0, 12).map((x) => safeStr(x, 140)).filter(Boolean)
    : [];
  out.op.lastGoodRev = Number.isFinite(out.op.lastGoodRev) ? Math.max(0, Math.trunc(out.op.lastGoodRev)) : 0;
  out.op.lastGoodTurnSig = safeStr(out.op.lastGoodTurnSig || "", 240) || null;
  out.op.loopRisk = Number.isFinite(out.op.loopRisk) ? Math.max(0, Math.min(1, Number(out.op.loopRisk))) : 0;
  out.op.lastPlannerMode = safeStr(out.op.lastPlannerMode || "", 48) || "";

  if (!out.governance || typeof out.governance !== "object") out.governance = {};
  out.governance.safetyMode = safeStr(out.governance.safetyMode || "", 24) || "standard";
  out.governance.requireHumanConfirmation = !!out.governance.requireHumanConfirmation;
  out.governance.escalationRules = isPlainObject(out.governance.escalationRules)
    ? out.governance.escalationRules
    : { onLowConfidence: 0.45, onHighRisk: true, onRepeatErrors: 2 };
  out.governance.blockedTopics = Array.isArray(out.governance.blockedTopics)
    ? out.governance.blockedTopics.slice(0, 24).map((x) => safeStr(x, 40)).filter(Boolean)
    : [];

  if (!out.audit || typeof out.audit !== "object") out.audit = {};
  out.audit.enabled = out.audit.enabled === false ? false : true;
  out.audit.maxTurns = Number.isFinite(out.audit.maxTurns) ? Math.max(25, Math.min(500, Math.trunc(out.audit.maxTurns))) : 200;
  out.audit.turnLogs = Array.isArray(out.audit.turnLogs) ? out.audit.turnLogs.slice(-out.audit.maxTurns) : [];
  out.audit.errors = Array.isArray(out.audit.errors) ? out.audit.errors.slice(-out.audit.maxTurns) : [];
  out.audit.metrics = isPlainObject(out.audit.metrics)
    ? out.audit.metrics
    : { avgLatencyMs: 0, lastLatencyMs: 0, fallbackRate: 0, clarifyRate: 0, menuBounceRate: 0 };

  return out;
}

function stripPoisonKeys(patchObj) {
  const out = { ...patchObj };
  delete out.__spineVersion;
  delete out.rev;
  delete out.createdAt;
  delete out.updatedAt;
  return out;
}

// -------------------------
// AUDIT
// -------------------------
function capArray(arr, max) {
  const a = Array.isArray(arr) ? arr : [];
  const m = Number.isFinite(max) ? Math.max(1, Math.trunc(max)) : 200;
  return a.length > m ? a.slice(a.length - m) : a;
}

function safeHashText(t) {
  const raw = safeStr(t || "", 2000);
  return raw ? sha1Lite(raw) : "";
}

function buildTurnAuditLog({ prev, next, inbound, decision, activeContext }) {
  const n = normalizeInbound(inbound);
  const d = decision && typeof decision === "object" ? decision : {};
  const lane = normalizeLane(next?.lane || n.lane || prev?.lane || LANE.GENERAL);
  const intent = safeStr(next?.lastUserIntent || "", 40) || inferUserIntent(n);

  return {
    turnId: `${safeStr(next?.createdAt || "", 32) || "t"}:${Number(next?.rev || 0)}`,
    ts: nowIso(),
    rev: Number(next?.rev || 0),
    lane,
    stage: normalizeStage(next?.stage || STAGE.OPEN),
    topic: safeStr(next?.topic || "", 80) || "unknown",

    rawInputHash: safeHashText(n.text),
    normalizedInput: {
      hasText: !!n.text,
      textLen: safeStr(n.text || "", 2000).length,
      action: safeStr(n.action || "", 80) || null,
      year: n.year !== null ? n.year : null,
      hasPayload: !!n.signals?.hasPayload,
      payloadActionable: !!n.signals?.payloadActionable,
      progressIntent: isProgressIntentText(n.text || "") || isMenuIntentToken(n.action || ""),
      distressText: isDistressText(n.text || ""),
    },

    decision: {
      move: safeStr(d.move || "", 20) || null,
      rationale: safeStr(d.rationale || "", 120) || null,
    },

    op: {
      objective: safeStr(next?.op?.objective || "", 240) || null,
      depthLevel: Number.isFinite(next?.op?.depthLevel) ? next.op.depthLevel : 0,
      confidenceScore: Number.isFinite(next?.op?.confidenceScore) ? next.op.confidenceScore : 0,
      operationalWeight: Number.isFinite(next?.op?.operationalWeight) ? next.op.operationalWeight : 0,
      escalationFlag: !!next?.op?.escalationFlag,
      riskFlags: Array.isArray(next?.op?.riskFlags) ? next.op.riskFlags.slice(0, 12) : [],
      unresolvedThreads: Array.isArray(next?.op?.unresolvedThreads) ? next.op.unresolvedThreads.slice(0, 12) : [],
      loopRisk: Number.isFinite(next?.op?.loopRisk) ? next.op.loopRisk : 0,
    },

    context: activeContext
      ? {
          kind: safeStr(activeContext.kind || "", 24) || null,
          route: safeStr(activeContext.route || "", 80) || null,
          id: safeStr(activeContext.id || "", 80) || null,
          year: typeof activeContext.year === "number" ? activeContext.year : null,
          lane: safeStr(activeContext.lane || "", 24) || null,
        }
      : null,

    marion: next?.marion || null,

    metrics: {
      latencyMs:
        Number.isFinite(inbound?.latencyMs) ? Math.max(0, Math.trunc(inbound.latencyMs)) :
        Number.isFinite(d.latencyMs) ? Math.max(0, Math.trunc(d.latencyMs)) :
        0,
      hadError: false,
      menuBounce: isGenericMenuBounceReply(next?.lastAssistantSummary || ""),
    },
  };
}

function appendAuditTurn(state, log) {
  const s = coerceState(state);
  if (!s.audit || typeof s.audit !== "object") s.audit = {};
  if (s.audit.enabled === false) return s;

  const max = Number.isFinite(s.audit.maxTurns) ? s.audit.maxTurns : 200;
  const nextLogs = capArray([...(Array.isArray(s.audit.turnLogs) ? s.audit.turnLogs : []), log], max);

  return {
    ...s,
    audit: {
      ...s.audit,
      turnLogs: nextLogs,
    },
  };
}

function appendAuditError(state, errObj) {
  const s = coerceState(state);
  if (!s.audit || typeof s.audit !== "object") s.audit = {};
  if (s.audit.enabled === false) return s;

  const max = Number.isFinite(s.audit.maxTurns) ? s.audit.maxTurns : 200;
  const e = isPlainObject(errObj) ? errObj : { message: safeStr(String(errObj || ""), 240) };
  const rec = {
    ts: nowIso(),
    message: safeStr(e.message || "", 240) || "error",
    code: safeStr(e.code || "", 40) || undefined,
    where: safeStr(e.where || "", 80) || undefined,
    rev: Number.isFinite(s.rev) ? s.rev : undefined,
  };

  const nextErrs = capArray([...(Array.isArray(s.audit.errors) ? s.audit.errors : []), rec], max);

  return {
    ...s,
    audit: {
      ...s.audit,
      errors: nextErrs,
    },
  };
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

  const patchPendingAsk =
    Object.prototype.hasOwnProperty.call(patchObj, "pendingAsk") &&
    patchObj.pendingAsk === null
      ? null
      : patchObj.pendingAsk
      ? normalizePendingAsk(patchObj.pendingAsk)
      : undefined;

  const patchDiag = isPlainObject(patchObj.diag) ? patchObj.diag : null;
  const patchGoal = isPlainObject(patchObj.goal) ? patchObj.goal : null;
  const patchMemoryWindows = isPlainObject(patchObj.memoryWindows) ? patchObj.memoryWindows : null;
  const patchOp = isPlainObject(patchObj.op) ? patchObj.op : null;
  const patchAudit = isPlainObject(patchObj.audit) ? patchObj.audit : null;

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

    lane: patchObj.lane ? normalizeLane(patchObj.lane) : p.lane,
    stage: patchObj.stage ? normalizeStage(patchObj.stage) : p.stage,
    topic: patchObj.topic != null ? safeStr(patchObj.topic, 80) : p.topic,
    lastUserIntent:
      patchObj.lastUserIntent != null
        ? safeStr(patchObj.lastUserIntent, 40)
        : p.lastUserIntent,

    marion:
      patchMarion === null
        ? null
        : patchMarion
        ? patchMarion
        : p.marion,

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
            user: Number.isFinite(patchObj.turns.user) ? Math.max(0, Math.trunc(patchObj.turns.user)) : p.turns.user,
            assistant: Number.isFinite(patchObj.turns.assistant) ? Math.max(0, Math.trunc(patchObj.turns.assistant)) : p.turns.assistant,
            sinceReset: Number.isFinite(patchObj.turns.sinceReset) ? Math.max(0, Math.trunc(patchObj.turns.sinceReset)) : p.turns.sinceReset,
          }
        : p.turns,

    memoryWindows: patchMemoryWindows
      ? {
          ...p.memoryWindows,
          ...patchMemoryWindows,
          recentIntents: Array.isArray(patchMemoryWindows.recentIntents)
            ? patchMemoryWindows.recentIntents.slice(-8).map((x) => ({
                intent: safeStr(x && x.intent || "", 48) || "unknown",
                ts: Number(x && x.ts || 0) || 0,
              }))
            : p.memoryWindows.recentIntents,
          unresolvedAsks: Array.isArray(patchMemoryWindows.unresolvedAsks)
            ? patchMemoryWindows.unresolvedAsks.slice(-8).map((x) => safeStr(x, 160)).filter(Boolean)
            : p.memoryWindows.unresolvedAsks,
          lastResolvedIntent: patchMemoryWindows.lastResolvedIntent != null
            ? safeStr(patchMemoryWindows.lastResolvedIntent, 64)
            : p.memoryWindows.lastResolvedIntent,
          lastUserPreference: isPlainObject(patchMemoryWindows.lastUserPreference)
            ? {
                lane: safeStr(patchMemoryWindows.lastUserPreference.lane || "", 24) || "",
                year: normYear(patchMemoryWindows.lastUserPreference.year),
                mode: safeStr(patchMemoryWindows.lastUserPreference.mode || "", 40) || "",
                updatedAt: Number(patchMemoryWindows.lastUserPreference.updatedAt || 0) || nowMs(),
              }
            : p.memoryWindows.lastUserPreference,
        }
      : p.memoryWindows,

    op: patchOp
      ? {
          ...p.op,
          ...patchOp,
          objective: patchOp.objective != null ? safeStr(patchOp.objective, 240) : p.op.objective,
          depthLevel: Number.isFinite(patchOp.depthLevel) ? Math.max(0, Math.trunc(patchOp.depthLevel)) : p.op.depthLevel,
          confidenceScore: Number.isFinite(patchOp.confidenceScore) ? Math.max(0, Math.min(1, Number(patchOp.confidenceScore))) : p.op.confidenceScore,
          operationalWeight: Number.isFinite(patchOp.operationalWeight) ? Math.max(0, Math.min(1, Number(patchOp.operationalWeight))) : p.op.operationalWeight,
          riskFlags: Array.isArray(patchOp.riskFlags) ? patchOp.riskFlags.slice(0, 12).map((x) => safeStr(x, 48)).filter(Boolean) : p.op.riskFlags,
          escalationFlag: patchOp.escalationFlag != null ? !!patchOp.escalationFlag : p.op.escalationFlag,
          unresolvedThreads: Array.isArray(patchOp.unresolvedThreads) ? patchOp.unresolvedThreads.slice(0, 12).map((x) => safeStr(x, 140)).filter(Boolean) : p.op.unresolvedThreads,
          lastGoodRev: Number.isFinite(patchOp.lastGoodRev) ? Math.max(0, Math.trunc(patchOp.lastGoodRev)) : p.op.lastGoodRev,
          lastGoodTurnSig: patchOp.lastGoodTurnSig != null ? safeStr(patchOp.lastGoodTurnSig, 240) : p.op.lastGoodTurnSig,
          loopRisk: Number.isFinite(patchOp.loopRisk) ? Math.max(0, Math.min(1, Number(patchOp.loopRisk))) : p.op.loopRisk,
          lastPlannerMode: patchOp.lastPlannerMode != null ? safeStr(patchOp.lastPlannerMode, 48) : p.op.lastPlannerMode,
        }
      : p.op,

    audit: patchAudit
      ? {
          ...p.audit,
          ...patchAudit,
          turnLogs: Array.isArray(patchAudit.turnLogs) ? patchAudit.turnLogs.slice(-p.audit.maxTurns) : p.audit.turnLogs,
          errors: Array.isArray(patchAudit.errors) ? patchAudit.errors.slice(-p.audit.maxTurns) : p.audit.errors,
          metrics: isPlainObject(patchAudit.metrics) ? { ...p.audit.metrics, ...patchAudit.metrics } : p.audit.metrics,
        }
      : p.audit,

    updatedAt,
    rev: (Number.isFinite(p.rev) ? p.rev : 0) + 1,

    diag: {
      ...p.diag,
      ...(patchDiag ? patchDiag : {}),
      lastUpdateReason: safeStr(reason, 120),
    },
  };

  if (Array.isArray(next.lastChipsOffered) && next.lastChipsOffered.length > 12) next.lastChipsOffered = next.lastChipsOffered.slice(0, 12);

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
// inbound normalization
// -------------------------
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

  const action = safeStr(
    body.action || ctx.action || payload.action || payload.route || payload.choice || "",
    80
  ).trim();

  const lane = safeStr(body.lane || ctx.lane || payload.lane || "", 24).trim();

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

  const ts = isPlainObject(body.turnSignals)
    ? body.turnSignals
    : isPlainObject(body.signals)
    ? body.signals
    : null;

  const signals = {
    textEmpty: ts && typeof ts.textEmpty === "boolean" ? ts.textEmpty : textEmpty,
    hasPayload: ts && typeof ts.hasPayload === "boolean" ? ts.hasPayload : hasPayload,
    payloadActionable:
      ts && typeof ts.payloadActionable === "boolean"
        ? ts.payloadActionable
        : payloadActionable,
    emotionBypassClarify: !!(ts && ts.emotionBypassClarify),
    emotionNeedSoft: !!(ts && ts.emotionNeedSoft),
    emotionNeedCrisis: !!(ts && ts.emotionNeedCrisis),
    emotionValence: safeStr(ts && ts.emotionValence || "", 24).toLowerCase(),
    emotionDominant: safeStr(ts && ts.emotionDominant || "", 40).toLowerCase(),
    emotionContradictions: Number.isFinite(ts && ts.emotionContradictions)
      ? Math.max(0, Math.trunc(ts.emotionContradictions))
      : 0,
  };

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
// deterministic planner
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

  const marionHint = n.cog || s.marion;

  // Emotion short-circuit from chatEngine signals
  if (n.signals.emotionNeedCrisis) {
    return {
      move: MOVE.CLARIFY,
      stage: STAGE.CLARIFY,
      speak: "I hear you. Before anything else, I want to check safety.",
      ask: buildPendingAsk(
        "need_stabilize",
        "Are you safe right now, and do you need immediate human support?",
        []
      ),
      rationale: "emotion_crisis_short_circuit",
    };
  }

  if (n.signals.emotionBypassClarify || isDistressText(text)) {
    return {
      move: MOVE.ADVANCE,
      stage: STAGE.DELIVER,
      speak: "I hear you. I am going to stay with the feeling first and keep the response grounded.",
      ask: null,
      rationale: "emotion_or_distress_support_advance",
      _plannerMode: "support_advance",
    };
  }

  // Marion stabilize intent
  if (marionHint) {
    const mhIntent = safeStr(marionHint.intent || "", 40).toLowerCase().trim();
    if (mhIntent === "stabilize") {
      return {
        move: MOVE.ADVANCE,
        stage: STAGE.DELIVER,
        speak: "I hear you. I am going to stay grounded and respond with support first.",
        ask: null,
        rationale: "marion_intent_stabilize_support_advance",
        _plannerMode: "support_advance",
      };
    }
  }

  // Marion clarify hint with loop fuse
  if (marionHint && marionHint.needsClarify === true) {
    const askKind = safeStr(marionHint.askKind || "need_more_detail", 40).trim() || "need_more_detail";
    const askId = safeStr(marionHint.askId || "", 24).trim();
    const mhIntent = safeStr(marionHint.intent || "", 40).toLowerCase().trim();
    const mhStage = safeStr(marionHint.stage || "", 24).toLowerCase().trim();

    const key = [askId || "noid", askKind, mhIntent || "unknown", mhStage || "unknown"].join("|");
    const prevKey = safeStr(s?.diag?.clarifyKey || "", 80);
    const prevRepeats = Number.isFinite(s?.diag?.clarifyRepeats) ? s.diag.clarifyRepeats : 0;
    const repeating =
      prevKey === key &&
      safeStr(s?.lastDecision?.move || "", 20).toLowerCase() === MOVE.CLARIFY;
    const repeats = repeating ? prevRepeats + 1 : 0;

    if (repeats >= 2) {
      return {
        move: MOVE.ADVANCE,
        stage: STAGE.DELIVER,
        speak: "Loop detected. I will proceed with a safe default and keep it tight.",
        ask: null,
        rationale: "clarify_loop_fuse",
        _diagClarify: { key, repeats },
        _plannerMode: "fused_advance",
      };
    }

    const isStabilize = mhIntent === "stabilize";
    const prompt =
      safeStr(marionHint.clarifyPrompt || "", 260).trim() ||
      (isStabilize
        ? "Are you safe right now, and do you want emotional support or practical steps?"
        : "What is the one missing detail I need to proceed?");

    return {
      move: MOVE.CLARIFY,
      stage: STAGE.CLARIFY,
      speak: isStabilize
        ? "I hear you. Before we go further, I want to check in."
        : "One quick detail, then I will proceed cleanly.",
      ask: buildPendingAsk(askKind, prompt, []),
      rationale: isStabilize ? "marion_stabilize_clarify" : "marion_needs_clarify",
      _diagClarify: { key, repeats },
      _plannerMode: "clarify",
    };
  }

  // Pending ask resolution
  if (s.pendingAsk && isPlainObject(s.pendingAsk)) {
    const pa = normalizePendingAsk(s.pendingAsk);
    const kind = safeStr(pa?.kind || "", 80).toLowerCase();
    const id = safeStr(pa?.id || "", 80).toLowerCase();

    const answeredYear =
      (kind === "need_year" || id === "need_year" || isNeedYearAsk(pa)) &&
      (textHasYearToken(text) || (payloadActionable && n.year !== null));

    const routeAsPick = payloadActionable && (
      isLaneToken(safeStr(n.payload?.route || "", 24)) ||
      isMenuIntentToken(safeStr(n.payload?.route || "", 40)) ||
      isMenuIntentToken(safeStr(n.payload?.action || "", 40)) ||
      isMenuIntentToken(safeStr(n.payload?.label || "", 80))
    );

    const typedMenuIntent = isMenuIntentToken(text);
    const answeredPick =
      (kind === "need_pick" || id === "need_pick" || isNeedPickAsk(pa)) &&
      (
        isLaneToken(text) ||
        typedMenuIntent ||
        routeAsPick ||
        (payloadActionable && !!safeStr(n.payload?.lane || "", 24).trim()) ||
        (payloadActionable && !!safeStr(n.lane || "", 24).trim())
      );

    const answeredDetail =
      (kind === "need_more_detail" || id === "need_more_detail" || isNeedDetailAsk(pa)) &&
      (
        isProgressIntentText(text) ||
        typedMenuIntent ||
        (hasText && text.length >= 8) ||
        (payloadActionable && routeAsPick)
      );

    const answered = answeredYear || answeredPick || answeredDetail;

    if (!answered) {
      return {
        move: MOVE.CLARIFY,
        stage: STAGE.CLARIFY,
        speak: "I am going to get one quick detail so I can move forward cleanly.",
        ask: pa,
        rationale: "pendingAsk_unresolved",
        _plannerMode: "clarify",
      };
    }
  }

  // Actionable payload / silent chip clicks
  if ((hasAction && payloadActionable) || (payloadActionable && hasPayload && textEmpty)) {
    return {
      move: MOVE.ADVANCE,
      stage: STAGE.DELIVER,
      speak: "I am going to execute that selection and keep momentum.",
      ask: null,
      rationale: "actionable_payload",
      _plannerMode: "advance",
    };
  }

  // Explicit technical / progress requests
  if (isProgressIntentText(text) || isMenuIntentToken(text) || isMenuIntentToken(n.action || "")) {
    return {
      move: MOVE.ADVANCE,
      stage: STAGE.DELIVER,
      speak: "I am going to advance on that directly and keep the response targeted.",
      ask: null,
      rationale: "progress_intent_request",
      _plannerMode: "advance",
    };
  }

  // Empty text
  if (!hasText && textEmpty) {
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
          speak: "I will keep us moving by narrowing this to the most likely next step.",
          ask: null,
          rationale: "empty_inbound_narrow",
          _plannerMode: "narrow",
        }
      : {
          move: MOVE.CLARIFY,
          stage: STAGE.CLARIFY,
          speak: "I need one small input to aim this correctly, then I will proceed.",
          ask: buildPendingAsk(
            "need_pick",
            "What are we advancing right now: diagnosis, restructure, implementation, or response filter?",
            []
          ),
          rationale: "empty_inbound_clarify",
          _plannerMode: "clarify",
        };
  }

  // Very short typed input
  if (hasText && text.length < 10) {
    if (isMenuIntentToken(text)) {
      return {
        move: MOVE.ADVANCE,
        stage: STAGE.DELIVER,
        speak: "I am taking that as a direct next-step selection.",
        ask: null,
        rationale: "short_menu_intent",
        _plannerMode: "advance",
      };
    }

    if (isDistressText(text)) {
      return {
        move: MOVE.ADVANCE,
        stage: STAGE.DELIVER,
        speak: "I hear you. I am going to respond with support first and keep it simple.",
        ask: null,
        rationale: "distress_too_short_support_advance",
        _plannerMode: "support_advance",
      };
    }

    return {
      move: MOVE.CLARIFY,
      stage: STAGE.CLARIFY,
      speak: "I am going to ask one clarifying question so we do not build the wrong thing.",
      ask: buildPendingAsk(
        "need_more_detail",
        "Say what you want next in one phrase: diagnosis, restructure, implementation, or response filter.",
        []
      ),
      rationale: "too_short",
      _plannerMode: "clarify",
    };
  }

  // Generic-menu bounce fuse
  const lastSummary = safeStr(s.lastAssistantSummary || "", 320);
  const menuBounceKey = [
    safeStr(s.topic || "", 40),
    safeStr(s.lastUserIntent || "", 40),
    safeStr(topicFromText(text), 40),
    safeStr(text, 80).toLowerCase()
  ].join("|");
  const prevMenuKey = safeStr(s.diag?.lastMenuBounceKey || "", 120);
  const prevMenuRepeats = Number.isFinite(s.diag?.menuBounceRepeats) ? s.diag.menuBounceRepeats : 0;
  const menuRepeats =
    isGenericMenuBounceReply(lastSummary) && prevMenuKey === menuBounceKey
      ? prevMenuRepeats + 1
      : isGenericMenuBounceReply(lastSummary)
      ? 0
      : 0;

  if (isGenericMenuBounceReply(lastSummary) && (isProgressIntentText(text) || isMenuIntentToken(text) || menuRepeats >= 1)) {
    return {
      move: MOVE.ADVANCE,
      stage: STAGE.DELIVER,
      speak: "I am not going to bounce this back into a menu. I will advance on the selected path.",
      ask: null,
      rationale: "menu_bounce_fuse",
      _diagMenuBounce: { key: menuBounceKey, repeats: menuRepeats + 1 },
      _plannerMode: "fused_advance",
    };
  }

  return {
    move: MOVE.ADVANCE,
    stage: STAGE.DELIVER,
    speak: "I am going to move forward using what you gave me, and I will flag assumptions clearly.",
    ask: null,
    rationale: "default_advance",
    _plannerMode: "advance",
  };
}

// -------------------------
// finalize
// -------------------------
function finalizeTurn({
  prevState,
  inbound,
  lane,
  topicOverride,
  actionTaken,
  followUps,
  pendingAsk,
  decision,
  assistantSummary,
  marionCog,
  updateReason = "turn",
}) {
  const prev = coerceState(prevState);
  const n = normalizeInbound(inbound);

  const lastUserIntent = inferUserIntent({
    text: n.text,
    action: n.action,
    payload: n.payload,
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
    topicFromText(n.text || "") ||
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

  const nextMarion =
    marionCog === null
      ? null
      : marionCog
      ? sanitizeMarionCog(marionCog)
      : n.cog
      ? sanitizeMarionCog(n.cog)
      : prev.marion;

  const typedYear = !n.signals.textEmpty && textHasYearToken(n.text || "");
  const chipYearResolved =
    n.signals.payloadActionable &&
    n.year !== null &&
    (lastUserIntent === "silent_click" || lastUserIntent === "choose" || lastUserIntent === "choose_progress");

  const typedLaneResolved = !n.signals.textEmpty && (isLaneToken(n.text || "") || isMenuIntentToken(n.text || ""));
  const routeAsLane =
    n.signals.payloadActionable &&
    (
      isLaneToken(safeStr(n.payload?.route || "", 24)) ||
      isMenuIntentToken(safeStr(n.payload?.route || "", 40)) ||
      isMenuIntentToken(safeStr(n.payload?.action || "", 40)) ||
      isMenuIntentToken(safeStr(n.payload?.label || "", 80))
    );

  const chipLaneResolved =
    n.signals.payloadActionable &&
    (
      routeAsLane ||
      safeStr(n.payload?.lane || "", 24).trim() ||
      safeStr(n.lane || "", 24).trim()
    ) &&
    (lastUserIntent === "silent_click" || lastUserIntent === "choose" || lastUserIntent === "choose_progress");

  const typedDetailResolved =
    !n.signals.textEmpty &&
    (
      isProgressIntentText(n.text || "") ||
      isMenuIntentToken(n.text || "") ||
      safeStr(n.text || "", 200).trim().length >= 8
    );

  let nextPendingAsk = prev.pendingAsk;

  if (pendingAsk === null) nextPendingAsk = null;
  else if (pendingAsk && typeof pendingAsk === "object") nextPendingAsk = normalizePendingAsk(pendingAsk);

  if (nextPendingAsk) {
    if ((typedYear || chipYearResolved) && isNeedYearAsk(nextPendingAsk)) {
      nextPendingAsk = null;
    } else if ((typedLaneResolved || chipLaneResolved) && isNeedPickAsk(nextPendingAsk)) {
      nextPendingAsk = null;
    } else if ((typedDetailResolved || chipLaneResolved) && isNeedDetailAsk(nextPendingAsk)) {
      nextPendingAsk = null;
    }
  }

  const prevMw = isPlainObject(prev.memoryWindows) ? prev.memoryWindows : {};
  const nextRecentIntents = Array.isArray(prevMw.recentIntents) ? prevMw.recentIntents.slice(-7) : [];
  nextRecentIntents.push({ intent: safeStr(lastUserIntent || "", 48) || "unknown", ts: nowMs() });

  let nextUnresolvedAsks = Array.isArray(prevMw.unresolvedAsks) ? prevMw.unresolvedAsks.slice(-8) : [];
  const pendingPrompt = safeStr(nextPendingAsk && nextPendingAsk.prompt || "", 160).trim();
  if (pendingPrompt) {
    nextUnresolvedAsks = nextUnresolvedAsks.filter((x) => safeStr(x, 160) !== pendingPrompt);
    nextUnresolvedAsks.push(pendingPrompt);
  } else if (nextUnresolvedAsks.length) {
    nextUnresolvedAsks = nextUnresolvedAsks.slice(-4);
  }

  const nextPreference = {
    lane: normalizeLane(lane || n.lane || prev.lane || ""),
    year: n.year !== null ? n.year : (prevMw.lastUserPreference && prevMw.lastUserPreference.year !== undefined ? prevMw.lastUserPreference.year : null),
    mode: safeStr(n.payload && n.payload.mode || n.payload && n.payload.macMode || prevMw.lastUserPreference && prevMw.lastUserPreference.mode || "", 40),
    updatedAt: nowMs(),
  };

  const lastResolvedIntent =
    nextPendingAsk === null && safeStr(lastUserIntent || "", 48) && safeStr(lastUserIntent || "", 48) !== "unknown"
      ? safeStr(lastUserIntent || "", 64)
      : safeStr(prevMw.lastResolvedIntent || "", 64);

  const menuBounceKey = decision && isPlainObject(decision._diagMenuBounce)
    ? safeStr(decision._diagMenuBounce.key || "", 120)
    : "";
  const menuBounceRepeats = decision && isPlainObject(decision._diagMenuBounce)
    ? Number(decision._diagMenuBounce.repeats || 0) || 0
    : 0;

  const lastSummary = safeStr(assistantSummary || "", 320);
  const isMenuBounce = isGenericMenuBounceReply(lastSummary);
  const clarifyMove = safeStr(decision?.move || "", 20).toLowerCase() === MOVE.CLARIFY;

  const loopRisk =
    Math.max(
      clarifyMove ? 0.35 : 0,
      menuBounceRepeats >= 1 ? 0.55 : 0,
      menuBounceRepeats >= 2 ? 0.75 : 0,
      isMenuBounce ? 0.45 : 0,
      nextPendingAsk ? 0.20 : 0
    );

  const unresolvedThreads = uniqueStrings([
    ...(Array.isArray(prev?.op?.unresolvedThreads) ? prev.op.unresolvedThreads : []),
    ...(nextPendingAsk && nextPendingAsk.prompt ? [safeStr(nextPendingAsk.prompt, 140)] : []),
  ], 12, 140);

  const patch = {
    lane: normalizeLane(lane || n.lane || prev.lane),
    stage: nextStage,
    topic,
    lastUserIntent,
    activeContext,
    pendingAsk: nextPendingAsk,
    memoryWindows: {
      recentIntents: nextRecentIntents,
      unresolvedAsks: nextUnresolvedAsks,
      lastResolvedIntent,
      lastUserPreference: nextPreference,
    },

    marion: nextMarion,

    lastActionTaken: safeStr(actionTaken || "", 40).trim() || null,
    lastMove: decision?.move ? safeStr(decision.move, 20) : null,
    lastDecision:
      decision?.move
        ? { move: safeStr(decision.move, 20), rationale: safeStr(decision.rationale || "", 60) }
        : null,
    lastTurnSig: turnSig,

    diag: {
      clarifyKey: decision && isPlainObject(decision._diagClarify)
        ? safeStr(decision._diagClarify.key || "", 80)
        : "",
      clarifyRepeats: decision && isPlainObject(decision._diagClarify)
        ? Number(decision._diagClarify.repeats || 0) || 0
        : 0,
      lastMenuBounceKey: menuBounceKey,
      menuBounceRepeats: menuBounceRepeats,
    },

    op: {
      ...prev.op,
      depthLevel: Number.isFinite(prev?.op?.depthLevel)
        ? Math.min(50, Math.max(0, Math.trunc(prev.op.depthLevel)) + 1)
        : 1,
      lastGoodRev:
        safeStr(decision?.move || "", 20).toLowerCase() === MOVE.CLARIFY
          ? (Number.isFinite(prev?.op?.lastGoodRev) ? prev.op.lastGoodRev : 0)
          : (Number.isFinite(prev.rev) ? prev.rev + 1 : 1),
      lastGoodTurnSig:
        safeStr(decision?.move || "", 20).toLowerCase() === MOVE.CLARIFY
          ? (safeStr(prev?.op?.lastGoodTurnSig || "", 240) || null)
          : turnSig,
      loopRisk,
      lastPlannerMode: safeStr(decision?._plannerMode || "", 48) || "",
      unresolvedThreads,
      objective:
        safeStr(prev?.op?.objective || "", 240) ||
        (topic !== "unknown" ? `advance:${topic}` : null),
    },

    ...(assistantSummary != null
      ? { lastAssistantSummary: safeStr(assistantSummary, 320) }
      : {}),

    ...(Array.isArray(followUps) && followUps.length
      ? { lastChipsOffered: buildChipsOffered(followUps) }
      : {}),

    ...(activeContext &&
    activeContext.kind === "chip" &&
    (lastUserIntent === "silent_click" || lastUserIntent === "choose_progress")
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

  let next = updateState(prev, patch, updateReason);

  // metrics harden
  try {
    const mPrev = isPlainObject(prev.audit?.metrics) ? prev.audit.metrics : {};
    const lastLatencyMs = Number.isFinite(inbound?.latencyMs) ? Math.max(0, Math.trunc(inbound.latencyMs)) : 0;
    const prevTurns = Array.isArray(prev.audit?.turnLogs) ? prev.audit.turnLogs.length : 0;
    const denom = Math.max(1, prevTurns + 1);

    const prevClarifyRate = clamp01(mPrev.clarifyRate);
    const prevMenuBounceRate = clamp01(mPrev.menuBounceRate);
    const prevFallbackRate = clamp01(mPrev.fallbackRate);
    const prevAvgLatency = Number.isFinite(mPrev.avgLatencyMs) ? Math.max(0, Number(mPrev.avgLatencyMs)) : 0;

    const clarifyDelta = clarifyMove ? 1 : 0;
    const menuDelta = isMenuBounce ? 1 : 0;

    next = updateState(next, {
      audit: {
        metrics: {
          lastLatencyMs,
          avgLatencyMs: ((prevAvgLatency * prevTurns) + lastLatencyMs) / denom,
          clarifyRate: ((prevClarifyRate * prevTurns) + clarifyDelta) / denom,
          menuBounceRate: ((prevMenuBounceRate * prevTurns) + menuDelta) / denom,
          fallbackRate: prevFallbackRate,
        },
      },
    }, "audit_metrics");
  } catch (_e) {
    // fail-open
  }

  try {
    const log = buildTurnAuditLog({ prev, next, inbound, decision, activeContext });
    next = appendAuditTurn(next, log);
  } catch (e) {
    next = appendAuditError(next, {
      message: e && e.message ? e.message : String(e),
      code: "AUDIT_APPEND_FAIL",
      where: "finalizeTurn",
    });
  }

  const prevRev = Number.isFinite(prev.rev) ? prev.rev : 0;
  if (!(Number.isFinite(next.rev) && next.rev >= prevRev + 1)) {
    next.rev = prevRev + 1;
  }

  return next;
}

function assertTurnUpdated(prevState, nextState) {
  const a = prevState && typeof prevState.rev === "number" ? prevState.rev : -1;
  const b = nextState && typeof nextState.rev === "number" ? nextState.rev : -1;
  if (!(b >= a + 1)) {
    const err = new Error(`STATE_SPINE_NOT_UPDATED: expected rev at least ${a + 1} but got ${b}`);
    err.code = "STATE_SPINE_NOT_UPDATED";
    throw err;
  }
}

// -------------------------
// self-tests
// -------------------------
function runSpineSelfTests() {
  const failures = [];
  function assert(name, cond, detail) {
    if (!cond) failures.push({ name, detail: safeStr(detail || "", 400) });
  }

  const st0 = createState({ lane: "music" });
  const before = st0.updatedAt;
  const st1 = coerceState(st0);
  assert("coerce_does_not_touch_updatedAt", st1.updatedAt === before, `${before} -> ${st1.updatedAt}`);

  const u1 = updateState(st0, { topic: "help" }, "turn");
  assert("update_rev_inc", u1.rev === st0.rev + 1, `${st0.rev} -> ${u1.rev}`);

  try {
    assertTurnUpdated(st0, u1);
    assert("assertTurnUpdated_ok", true, "");
  } catch (e) {
    assert("assertTurnUpdated_ok", false, e && e.message ? e.message : String(e));
  }

  const pa = normalizePendingAsk({
    id: "need_year",
    type: "clarify",
    prompt: "Give year",
    required: true,
  });
  assert("pendingAsk_kind_default", safeStr(pa.kind) === "need_more_detail", safeStr(pa.kind));
  assert("pendingAsk_prompt_has_year", safeStr(pa.prompt).toLowerCase().includes("year"), pa.prompt);
  assert("pendingAsk_id_preserved", safeStr(pa.id) === "need_year", safeStr(pa.id));

  const dm = decideNextMove(createState(), {
    payload: { action: "top10", year: 1988, lane: "music" },
    turnSignals: { hasPayload: true, payloadActionable: true, textEmpty: true },
    text: "",
  });
  assert("decide_actionable_payload_advance", dm.move === MOVE.ADVANCE, safeStr(dm.move));

  const poison = updateState(
    st0,
    { rev: 999, createdAt: "X", updatedAt: "Y", __spineVersion: "BAD" },
    "poison"
  );
  assert("poison_rev_ignored", poison.rev === st0.rev + 1, `${poison.rev}`);
  assert("poison_createdAt_ignored", poison.createdAt === st0.createdAt, `${poison.createdAt}`);
  assert("poison_version_locked", poison.__spineVersion === SPINE_VERSION, `${poison.__spineVersion}`);

  const dm2 = decideNextMove(createState(), {
    payload: { action: "top10", year: 1992, lane: "music" },
    signals: { hasPayload: true, payloadActionable: true, textEmpty: true },
    text: "",
  });
  assert("signals_alias_advances", dm2.move === MOVE.ADVANCE, safeStr(dm2.move));

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
  assert("activeContext_payload_mini", ac && ac.payload && !ac.payload.extra, safeStr(ac && JSON.stringify(ac.payload)));

  const stPick = createState({ pendingAsk: { kind: "need_pick", prompt: "Pick a lane" } });
  const planPick = decideNextMove(stPick, {
    payload: { route: "movies" },
    turnSignals: { hasPayload: true, payloadActionable: true, textEmpty: true },
    text: "",
  });
  assert("need_pick_resolves_via_route", planPick.move === MOVE.ADVANCE, safeStr(planPick.move));

  const nb = normalizeInbound({
    text: "hello",
    cog: { mode: "Strategic", intent: "clarify", stage: "clarify", layers: ["AI", "Finance"], needsClarify: true, trace: { ak: true } },
  });
  assert("cog_ingested", !!nb.cog, JSON.stringify(nb.cog || {}));
  assert("cog_layers_norm", nb.cog && nb.cog.layers.includes("ai"), JSON.stringify(nb.cog || {}));
  assert("cog_needsClarify", nb.cog && nb.cog.needsClarify === true, JSON.stringify(nb.cog || {}));

  const dm3 = decideNextMove(createState(), {
    text: "Diagnosis",
    turnSignals: { hasPayload: false, payloadActionable: false, textEmpty: false },
  });
  assert("diagnosis_short_advances", dm3.move === MOVE.ADVANCE, safeStr(dm3.move));

  const dm4 = decideNextMove(createState({
    lastAssistantSummary: "I have the signal. Do you want diagnosis, restructuring, or an exact code update?",
    diag: { lastMenuBounceKey: "unknown|unknown|diagnosis|diagnosis", menuBounceRepeats: 1 }
  }), {
    text: "diagnosis"
  });
  assert("menu_bounce_fuse_advances", dm4.move === MOVE.ADVANCE, safeStr(dm4.move));

  const fin = finalizeTurn({
    prevState: createState(),
    inbound: { text: "diagnosis" },
    lane: "general",
    topicOverride: "diagnosis",
    actionTaken: "diagnosis",
    followUps: [],
    pendingAsk: null,
    decision: { move: MOVE.ADVANCE, rationale: "test", _plannerMode: "advance" },
    assistantSummary: "Proceeding with diagnosis.",
    updateReason: "test_finalize",
  });
  assert("finalize_updates_loopRisk", Number.isFinite(fin.op.loopRisk), safeStr(fin.op.loopRisk));
  assert("finalize_turnlogs_present", Array.isArray(fin.audit.turnLogs) && fin.audit.turnLogs.length >= 1, safeStr(fin.audit.turnLogs && fin.audit.turnLogs.length));

  return { ok: failures.length === 0, failures, ran: 13, v: SPINE_VERSION };
}

module.exports = {
  SPINE_VERSION,
  LANE,
  STAGE,
  MOVE,

  createState,
  coerceState,
  updateState,
  finalizeTurn,

  decideNextMove,

  computeTurnSig,
  topicFromAction,
  buildPendingAsk,
  buildChipsOffered,
  assertTurnUpdated,

  buildTurnAuditLog,
  appendAuditTurn,
  appendAuditError,

  runSpineSelfTests,
};
