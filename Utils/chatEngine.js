"use strict";

/**
 * Utils/chatEngine.js
 *
 * chatEngine v0.11.1 OPINTEL LOOP-HARDEN
 * ------------------------------------------------------------
 * PURPOSE
 * - Keep Chat Engine as the single semantic turn authority
 * - Preserve structural integrity and fail-open behavior
 * - Remove lane/memory/telemetry/persona bulk from the hot path
 * - Centralize turn lifecycle, duplicate suppression, and clean contract return
 *
 * 15 PHASE COVERAGE
 * ------------------------------------------------------------
 * Phase 01: Inbound normalization
 * Phase 02: Session / request identity
 * Phase 03: Emotional route-guard intake
 * Phase 04: Support packet routing
 * Phase 05: Distress / recovery / positive handling
 * Phase 06: Public-mode sanitization
 * Phase 07: Greeting handling
 * Phase 08: Inbound duplicate breaker
 * Phase 09: Turn lifecycle lock
 * Phase 10: Lane routing delegation
 * Phase 11: Spine finalization
 * Phase 12: Memory write-through
 * Phase 13: Telemetry shaping
 * Phase 14: Stable contract assembly
 * Phase 15: Fail-open terminal safety
 */

let Spine = null;
let MarionSO = null;
let EmotionRouteGuard = null;
let Support = null;

try { Spine = require("./stateSpine"); } catch (_e) { Spine = null; }
try { MarionSO = require("./marionSO"); } catch (_e) { MarionSO = null; }
try { EmotionRouteGuard = require("./emotionRouteGuard"); } catch (_e) { EmotionRouteGuard = null; }
try { Support = require("./supportResponse"); } catch (_e) { Support = null; }

let laneRouter = null;
let memoryAdapter = null;
let telemetryAdapter = null;

try { laneRouter = require("./laneRouter"); } catch (_e) { laneRouter = null; }
try { memoryAdapter = require("./chatMemoryAdapter"); } catch (_e) { memoryAdapter = null; }
try { telemetryAdapter = require("./chatTelemetryAdapter"); } catch (_e) { telemetryAdapter = null; }

if (!Spine) {
  Spine = {
    SPINE_VERSION: "missing",
    createState: (seed) => ({
      rev: 0,
      lane: (seed && seed.lane) || "general",
      stage: (seed && seed.stage) || "open"
    }),
    coerceState: (s) => (s && typeof s === "object" ? s : { rev: 0, lane: "general", stage: "open" }),
    decideNextMove: () => ({ move: "CLARIFY", stage: "open", rationale: "spine_missing", speak: "" }),
    finalizeTurn: ({ prevState }) => {
      const prev = prevState && typeof prevState === "object"
        ? prevState
        : { rev: 0, lane: "general", stage: "open" };
      return { ...prev, rev: (Number.isFinite(prev.rev) ? prev.rev : 0) + 1 };
    },
    assertTurnUpdated: () => true
  };
}

const routeLane = typeof laneRouter?.routeLane === "function"
  ? laneRouter.routeLane
  : null;

const buildUiForLane = typeof laneRouter?.buildUiForLane === "function"
  ? laneRouter.buildUiForLane
  : function fallbackBuildUiForLane() {
      return {
        chips: [
          { id: "music", type: "lane", label: "Music", payload: { lane: "music" } },
          { id: "movies", type: "lane", label: "Movies", payload: { lane: "movies" } },
          { id: "news", type: "lane", label: "News Canada", payload: { lane: "news" } },
          { id: "reset", type: "action", label: "Reset", payload: { action: "reset" } }
        ],
        allowMic: true
      };
    };

const buildFollowUpsForLane = typeof laneRouter?.buildFollowUpsForLane === "function"
  ? laneRouter.buildFollowUpsForLane
  : function fallbackBuildFollowUpsForLane(lane) {
      const l = safeStr(lane || "general");
      if (l === "music") {
        return [
          { id: "fu_top10", type: "action", label: "Give me a Top 10", payload: { lane: "music", action: "top10" } },
          { id: "fu_year", type: "action", label: "Pick a year", payload: { lane: "music", action: "year_pick" } }
        ];
      }
      return [
        { id: "fu_music", type: "lane", label: "Go to Music", payload: { lane: "music" } },
        { id: "fu_movies", type: "lane", label: "Go to Movies", payload: { lane: "movies" } }
      ];
    };

const buildMemoryContext = typeof memoryAdapter?.buildMemoryContext === "function"
  ? memoryAdapter.buildMemoryContext
  : function fallbackBuildMemoryContext() { return null; };

const storeMemoryTurn = typeof memoryAdapter?.storeMemoryTurn === "function"
  ? memoryAdapter.storeMemoryTurn
  : function fallbackStoreMemoryTurn() { return false; };

const buildTelemetry = typeof telemetryAdapter?.buildTelemetry === "function"
  ? telemetryAdapter.buildTelemetry
  : function fallbackBuildTelemetry(params) {
      const src = isPlainObject(params) ? params : {};
      return {
        phase: safeStr(src.phase || "turn"),
        requestId: safeStr(src.requestId || ""),
        lane: safeStr(src.lane || src?.norm?.lane || "general"),
        publicMode: !!src.publicMode,
        emotion: null,
        dataset: null
      };
    };

const CE_VERSION = "chatEngine v0.11.0 OPINTEL";

function nowMs() {
  return Date.now();
}
function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function isPlainObject(x) {
  return !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}
function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}
function truthy(v) {
  if (v === true) return true;
  const s = safeStr(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}
function falsy(v) {
  if (v === false) return true;
  const s = safeStr(v).trim().toLowerCase();
  return s === "0" || s === "false" || s === "no" || s === "n" || s === "off";
}
function oneLine(s) {
  return safeStr(s).replace(/\s+/g, " ").trim();
}
function splitLines(s) {
  return safeStr(s).split("\n");
}
function takeLines(s, maxLines) {
  return splitLines(s).slice(0, Math.max(1, maxLines)).join("\n").trim();
}
function safeJsonStringify(x) {
  try {
    return JSON.stringify(x);
  } catch (_e) {
    return "{\"_fail\":true}";
  }
}
function sha1Lite(str) {
  const s = safeStr(str);
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
function mergeSessionPatches() {
  const merged = {};
  for (let i = 0; i < arguments.length; i++) {
    const part = arguments[i];
    if (isPlainObject(part)) Object.assign(merged, part);
  }
  return merged;
}
function hasActionablePayload(payload) {
  if (!isPlainObject(payload)) return false;
  const keys = Object.keys(payload);
  if (!keys.length) return false;
  const actionable = new Set([
    "action", "route", "year", "id", "_id", "label", "lane", "vibe",
    "macMode", "mode", "allowDerivedTop10", "allowYearendFallback", "focus", "publicMode"
  ]);
  return keys.some((k) => actionable.has(k));
}
function buildInboundKey(norm) {
  const p = isPlainObject(norm?.payload) ? norm.payload : {};
  const keyObj = {
    t: safeStr(norm?.text || ""),
    a: safeStr(norm?.action || ""),
    y: normYear(norm?.year),
    l: safeStr(norm?.lane || ""),
    v: safeStr(norm?.vibe || ""),
    pa: safeStr(p.action || ""),
    py: normYear(p.year),
    pl: safeStr(p.lane || ""),
    pr: safeStr(p.route || ""),
    pv: safeStr(p.vibe || "")
  };
  return sha1Lite(safeJsonStringify(keyObj)).slice(0, 18);
}
function resolveRequestId(input, norm, inboundKey) {
  const src = isPlainObject(input) ? input : {};
  const candidates = [
    src.requestId,
    norm?.ctx?.requestId,
    norm?.body?.requestId,
    norm?.payload?.requestId
  ];
  for (const c of candidates) {
    const s = safeStr(c).trim();
    if (s) return s.slice(0, 80);
  }
  return `req_${safeStr(inboundKey || sha1Lite(nowMs())).slice(0, 18)}`;
}
function buildTurnId(input, norm, inboundKey, requestId) {
  const src = isPlainObject(input) ? input : {};
  const candidates = [
    src.turnId,
    src.messageId,
    src.id,
    norm?.ctx?.turnId,
    norm?.ctx?.messageId,
    norm?.body?.turnId,
    norm?.body?.messageId,
    norm?.payload?.turnId,
    norm?.payload?.messageId,
    requestId
  ];
  for (const c of candidates) {
    const s = safeStr(c).trim();
    if (s) return `turn_${sha1Lite(s).slice(0, 20)}`;
  }
  return `turn_${sha1Lite(`${safeStr(inboundKey)}|${safeStr(requestId)}`).slice(0, 20)}`;
}
function resolveSessionId(norm, session, inboundKey) {
  const nctx = isPlainObject(norm?.ctx) ? norm.ctx : {};
  const nb = isPlainObject(norm?.body) ? norm.body : {};
  const s = isPlainObject(session) ? session : {};
  const candidates = [
    nctx.sessionId, nctx.sid, nb.sessionId, nb.sid,
    s.sessionId, s.sid, s.id, s.sessionKey, s.key
  ];
  for (const v of candidates) {
    const t = safeStr(v).trim();
    if (t && t.length <= 180) return t;
  }
  return safeStr(inboundKey || `sess_${nowMs()}`).slice(0, 36);
}
function applyBudgetText(s, budget) {
  const txt = safeStr(s).trim();
  if (!txt) return "";
  if (budget === "short") return takeLines(txt, 6);
  return takeLines(txt, 14);
}
function softSpeak(text) {
  let t = safeStr(text || "");
  t = t.replace(/\bI'm\b/g, "I am")
    .replace(/\bcan't\b/gi, "cannot")
    .replace(/\bwon't\b/gi, "will not")
    .replace(/\bit's\b/gi, "it is")
    .replace(/\bthat's\b/gi, "that is")
    .replace(/\bthere's\b/gi, "there is")
    .replace(/\bwhat's\b/gi, "what is");
  t = t.replace(/!{2,}/g, "!")
    .replace(/\?{2,}/g, "?")
    .replace(/\.{4,}/g, "...");
  t = t.replace(/[\u{1F300}-\u{1FAFF}]/gu, "");
  t = t.replace(/\s*—\s*/g, ". ");
  t = t.replace(/\s*;\s*/g, ". ");
  return t.trim();
}
function scrubExecutionStyleArtifacts(reply) {
  const raw = safeStr(reply);
  if (!raw) return "";
  const killLine = (ln) => {
    const s = safeStr(ln).trim();
    if (!s) return false;
    if (/^one quick detail[, ]+then i['’]?ll execute cleanly\.?$/i.test(s)) return true;
    if (/^then i['’]?ll execute cleanly\.?$/i.test(s)) return true;
    if (/^i['’]?ll execute cleanly\.?$/i.test(s)) return true;
    if (/^alright\.?$/i.test(s)) return true;
    return false;
  };
  const kept = raw.split("\n").filter((ln) => !killLine(ln));
  let out = kept.join("\n");
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out || safeStr(reply).trim() || "Okay.";
}

const LOOP_WINDOW_MS = 9000;
const LOOP_HARD_LIMIT = 2;
const INBOUND_WINDOW_MS = 12000;
const INBOUND_DUPLICATE_FAST_MS = 5000;
const INBOUND_HARD_LIMIT = 2;
const TURN_INFLIGHT_STALE_MS = 20000;
const TURN_TERMINAL_WINDOW_MS = 30000;
const TURN_LEDGER_LIMIT = 24;

function replyLoopSig(lane, replyText) {
  const l = safeStr(lane || "").trim().toLowerCase();
  const r = oneLine(replyText || "").slice(0, 260);
  return sha1Lite(`${l}|${r}`).slice(0, 18);
}
function detectAndPatchLoop(session, lane, replyText) {
  const s = isPlainObject(session) ? session : {};
  const sig = replyLoopSig(lane, replyText);
  const now = nowMs();
  const lastSig = safeStr(s.__loopSig || "");
  const lastAt = Number(s.__loopAt || 0) || 0;
  const lastN = clampInt(s.__loopN || 0, 0, 0, 99);
  const same = !!(sig && lastSig && sig === lastSig);
  const inWindow = !!(lastAt && now - lastAt <= LOOP_WINDOW_MS);
  let n = lastN;
  if (same && inWindow) n += 1;
  else n = 0;
  const tripped = same && inWindow && n >= LOOP_HARD_LIMIT;
  return {
    tripped,
    patch: { __loopSig: sig, __loopAt: now, __loopN: n },
    sig,
    n
  };
}
function inboundLoopSig(norm, session) {
  const n = norm && typeof norm === "object" ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const text = oneLine((n.text || "")).slice(0, 360).toLowerCase();
  const action = safeStr(n.action || "").toLowerCase();
  const lane = safeStr(n.lane || n?.payload?.lane || s.lane || s.lastLane || "").toLowerCase();
  const route = safeStr(n?.payload?.route || n?.payload?.action || "").toLowerCase();
  const intent = safeStr(n?.turnIntent || n?.turnSignals?.turnIntent || "").toLowerCase();
  let pmini = "";
  try {
    const p = isPlainObject(n.payload) ? n.payload : {};
    const keep = {};
    ["lane", "route", "action", "year", "chip", "choice", "id", "tag"].forEach((k) => {
      if (k in p) keep[k] = p[k];
    });
    pmini = safeJsonStringify(keep).slice(0, 220);
  } catch (_e) {
    pmini = "";
  }
  return sha1Lite(`${lane}|${action}|${route}|${intent}|${text}|${pmini}`).slice(0, 18);
}
function detectInboundRepeat(session, inSig) {
  const s = isPlainObject(session) ? session : {};
  const now = nowMs();
  const lastSig = safeStr(s.__inSig || "");
  const lastAt = Number(s.__inAt || 0) || 0;
  const lastN = clampInt(s.__inN || 0, 0, 0, 99);
  const same = !!(inSig && lastSig && inSig === lastSig);
  const inWindow = !!(lastAt && now - lastAt <= INBOUND_WINDOW_MS);
  let n = lastN;
  if (same && inWindow) n += 1;
  else n = 0;
  const tripped = same && inWindow && n >= INBOUND_HARD_LIMIT;
  return {
    tripped,
    patch: { __inSig: inSig, __inAt: now, __inN: n },
    inSig,
    n,
    canFastReturn: same && lastAt && now - lastAt <= INBOUND_DUPLICATE_FAST_MS
  };
}
function getCachedReply(session, inSig) {
  const s = isPlainObject(session) ? session : {};
  const sig = safeStr(s.__cacheInSig || "");
  const at = Number(s.__cacheAt || 0) || 0;
  if (!sig || !inSig || sig !== inSig) return null;
  if (!at || nowMs() - at > INBOUND_WINDOW_MS) return null;
  const reply = safeStr(s.__cacheReply || "");
  if (!reply) return null;
  return {
    reply,
    lane: safeStr(s.__cacheLane || "general") || "general",
    followUps: Array.isArray(s.__cacheFollowUps) ? s.__cacheFollowUps : [],
    directives: Array.isArray(s.__cacheDirectives) ? s.__cacheDirectives : []
  };
}
function normalizeTurnLedger(session) {
  const s = isPlainObject(session) ? session : {};
  const raw = Array.isArray(s.__turnLedger) ? s.__turnLedger : [];
  return raw
    .filter((x) => isPlainObject(x))
    .map((x) => ({
      turnId: safeStr(x.turnId || "").slice(0, 64),
      requestId: safeStr(x.requestId || "").slice(0, 80),
      inboundSig: safeStr(x.inboundSig || "").slice(0, 24),
      inboundKey: safeStr(x.inboundKey || "").slice(0, 24),
      phase: safeStr(x.phase || "unknown").slice(0, 24),
      lane: safeStr(x.lane || "general").slice(0, 24),
      replySig: safeStr(x.replySig || "").slice(0, 24),
      at: Number(x.at || 0) || 0,
      status: safeStr(x.status || "unknown").slice(0, 24),
      completed: !!x.completed,
      failed: !!x.failed
    }))
    .sort((a, b) => (a.at || 0) - (b.at || 0))
    .slice(-TURN_LEDGER_LIMIT);
}
function upsertTurnLedger(ledger, entry) {
  const list = Array.isArray(ledger) ? ledger.slice() : [];
  const e = isPlainObject(entry) ? entry : {};
  const turnId = safeStr(e.turnId || "");
  if (!turnId) return list.slice(-TURN_LEDGER_LIMIT);
  const idx = list.findIndex((x) => safeStr(x.turnId || "") === turnId);
  if (idx >= 0) list[idx] = { ...list[idx], ...e, turnId };
  else list.push({ ...e, turnId });
  return list
    .filter((x) => isPlainObject(x))
    .sort((a, b) => (a.at || 0) - (b.at || 0))
    .slice(-TURN_LEDGER_LIMIT);
}
function findTurnEntry(ledger, turnId) {
  const list = Array.isArray(ledger) ? ledger : [];
  const id = safeStr(turnId || "");
  if (!id) return null;
  for (let i = list.length - 1; i >= 0; i--) {
    if (safeStr(list[i]?.turnId || "") === id) return list[i];
  }
  return null;
}
function findReusableCompletedEntry(ledger, inSig) {
  const list = Array.isArray(ledger) ? ledger : [];
  const sig = safeStr(inSig || "");
  const now = nowMs();
  for (let i = list.length - 1; i >= 0; i--) {
    const x = list[i];
    if (!x || !x.completed) continue;
    if (safeStr(x.inboundSig || "") !== sig) continue;
    if (!x.at || now - x.at > TURN_TERMINAL_WINDOW_MS) continue;
    return x;
  }
  return null;
}
function buildTerminalContractSnapshot(contract) {
  const c = isPlainObject(contract) ? contract : {};
  return {
    ok: !!c.ok,
    reply: safeStr(c.reply || ""),
    payload: isPlainObject(c.payload) ? { ...c.payload } : { reply: safeStr(c.reply || "") },
    lane: safeStr(c.lane || "general") || "general",
    laneId: safeStr(c.laneId || c.lane || "general") || "general",
    sessionLane: safeStr(c.sessionLane || c.lane || "general") || "general",
    bridge: c.bridge || null,
    ctx: isPlainObject(c.ctx) ? { ...c.ctx } : {},
    ui: isPlainObject(c.ui) ? { ...c.ui } : { chips: [], allowMic: true },
    directives: Array.isArray(c.directives) ? c.directives.slice(0, 12) : [],
    followUps: Array.isArray(c.followUps) ? c.followUps.slice(0, 12) : [],
    followUpsStrings: Array.isArray(c.followUpsStrings) ? c.followUpsStrings.slice(0, 12) : [],
    cog: isPlainObject(c.cog) ? { ...c.cog } : {},
    requestId: safeStr(c.requestId || "").slice(0, 80),
    meta: isPlainObject(c.meta) ? { ...c.meta } : {}
  };
}
function getLastTerminalContractForInbound(session, inSig) {
  const s = isPlainObject(session) ? session : {};
  const sig = safeStr(inSig || "");
  const snap = isPlainObject(s.__lastTerminalContract) ? s.__lastTerminalContract : null;
  if (!snap) return null;
  if (safeStr(s.__lastTerminalInboundSig || "") !== sig) return null;
  const at = Number(s.__lastTerminalAt || 0) || 0;
  if (!at || nowMs() - at > TURN_TERMINAL_WINDOW_MS) return null;
  return buildTerminalContractSnapshot(snap);
}
function beginTurnLifecycle(session, args) {
  const s = isPlainObject(session) ? session : {};
  const turnId = safeStr(args?.turnId || "");
  const requestId = safeStr(args?.requestId || "");
  const inboundSig = safeStr(args?.inSig || "");
  const inboundKey = safeStr(args?.inboundKey || "");
  const laneHint = safeStr(args?.laneHint || "general") || "general";
  const ledger = normalizeTurnLedger(s);
  const now = nowMs();

  const existing = findTurnEntry(ledger, turnId);
  if (existing) {
    if (existing.completed && now - (existing.at || 0) <= TURN_TERMINAL_WINDOW_MS) {
      const snap = getLastTerminalContractForInbound(s, inboundSig);
      if (snap) {
        snap.meta = { ...(snap.meta || {}), replay: true, replaySource: "turn_completed", phase: 15, v: CE_VERSION, t: now };
        snap.sessionPatch = {
          __turnLedger: ledger,
          __turnLastSeenAt: now,
          __turnLastReplayId: turnId
        };
        return { blocked: true, reason: "completed_turn_replay", patch: snap.sessionPatch, replay: snap };
      }
    }
    if (existing.phase === "in_flight" && now - (existing.at || 0) <= TURN_INFLIGHT_STALE_MS) {
      const snap = getLastTerminalContractForInbound(s, inboundSig);
      if (snap) {
        snap.meta = { ...(snap.meta || {}), replay: true, replaySource: "inflight_terminal_cache", phase: 15, v: CE_VERSION, t: now };
        snap.sessionPatch = {
          __turnLedger: ledger,
          __turnLastSeenAt: now,
          __turnLastReplayId: turnId
        };
        return { blocked: true, reason: "turn_already_inflight", patch: snap.sessionPatch, replay: snap };
      }
      return {
        blocked: true,
        reason: "turn_already_inflight",
        patch: {
          __turnLedger: ledger,
          __turnLastSeenAt: now,
          __turnLastBlockedId: turnId
        },
        replay: null
      };
    }
  }

  const reusable = findReusableCompletedEntry(ledger, inboundSig);
  if (reusable) {
    const snap = getLastTerminalContractForInbound(s, inboundSig);
    if (snap) {
      snap.meta = { ...(snap.meta || {}), replay: true, replaySource: "inbound_sig_completed", phase: 15, v: CE_VERSION, t: now };
      snap.sessionPatch = {
        __turnLedger: ledger,
        __turnLastSeenAt: now,
        __turnLastReplayId: safeStr(reusable.turnId || turnId)
      };
      return { blocked: true, reason: "inbound_sig_completed", patch: snap.sessionPatch, replay: snap };
    }
  }

  const nextLedger = upsertTurnLedger(ledger, {
    turnId,
    requestId,
    inboundSig,
    inboundKey,
    phase: "in_flight",
    lane: laneHint,
    at: now,
    status: "active",
    completed: false,
    failed: false
  });

  return {
    blocked: false,
    reason: "",
    patch: {
      __turnLedger: nextLedger,
      __turnLastSeenAt: now,
      __turnActiveId: turnId,
      __turnActiveRequestId: requestId,
      __turnActiveInboundSig: inboundSig,
      __turnActiveInboundKey: inboundKey
    }
  };
}
function completeTurnLifecycle(session, args) {
  const s = isPlainObject(session) ? session : {};
  const turnId = safeStr(args?.turnId || "");
  const requestId = safeStr(args?.requestId || "");
  const inboundSig = safeStr(args?.inSig || "");
  const inboundKey = safeStr(args?.inboundKey || "");
  const lane = safeStr(args?.lane || "general") || "general";
  const reply = safeStr(args?.reply || "");
  const contract = isPlainObject(args?.contract) ? args.contract : null;
  const now = nowMs();

  const ledger = normalizeTurnLedger(s);
  const nextLedger = upsertTurnLedger(ledger, {
    turnId,
    requestId,
    inboundSig,
    inboundKey,
    phase: "complete",
    lane,
    replySig: replyLoopSig(lane, reply),
    at: now,
    status: "complete",
    completed: true,
    failed: false
  });

  return {
    __turnLedger: nextLedger,
    __turnActiveId: "",
    __turnActiveRequestId: "",
    __turnActiveInboundSig: "",
    __turnActiveInboundKey: "",
    __turnLastCompleteId: turnId,
    __turnLastCompleteAt: now,
    __lastTerminalInboundSig: inboundSig,
    __lastTerminalAt: now,
    __lastTerminalContract: contract ? buildTerminalContractSnapshot(contract) : null
  };
}
function failTurnLifecycle(session, args) {
  const s = isPlainObject(session) ? session : {};
  const turnId = safeStr(args?.turnId || "");
  const requestId = safeStr(args?.requestId || "");
  const inboundSig = safeStr(args?.inSig || "");
  const inboundKey = safeStr(args?.inboundKey || "");
  const lane = safeStr(args?.lane || "general") || "general";
  const reply = safeStr(args?.reply || "");
  const contract = isPlainObject(args?.contract) ? args.contract : null;
  const now = nowMs();

  const ledger = normalizeTurnLedger(s);
  const nextLedger = upsertTurnLedger(ledger, {
    turnId,
    requestId,
    inboundSig,
    inboundKey,
    phase: "failed_terminal",
    lane,
    replySig: replyLoopSig(lane, reply),
    at: now,
    status: "failed_terminal",
    completed: true,
    failed: true
  });

  return {
    __turnLedger: nextLedger,
    __turnActiveId: "",
    __turnActiveRequestId: "",
    __turnActiveInboundSig: "",
    __turnActiveInboundKey: "",
    __turnLastFailedId: turnId,
    __turnLastFailedAt: now,
    __lastTerminalInboundSig: inboundSig,
    __lastTerminalAt: now,
    __lastTerminalContract: contract ? buildTerminalContractSnapshot(contract) : null
  };
}
function computePublicMode(norm, session) {
  const p = norm && isPlainObject(norm.payload) ? norm.payload : {};
  const c = norm && isPlainObject(norm.ctx) ? norm.ctx : {};
  const b = norm && isPlainObject(norm.body) ? norm.body : {};
  const s = isPlainObject(session) ? session : {};
  const candidates = [p.publicMode, c.publicMode, b.publicMode, s.publicMode, p.public, c.public, b.public, s.public];
  for (const v of candidates) {
    if (v === undefined || v === null || v === "") continue;
    if (falsy(v)) return false;
    if (truthy(v)) return true;
  }
  return true;
}
function collectForbiddenNames(norm, session) {
  const out = new Set(["Mac"]);
  const s = isPlainObject(session) ? session : {};
  const c = isPlainObject(norm?.ctx) ? norm.ctx : {};
  const b = isPlainObject(norm?.body) ? norm.body : {};
  const p = isPlainObject(norm?.payload) ? norm.payload : {};
  const candidates = [
    s.ownerName, s.userName, s.displayName, s.name, s.macName,
    c.ownerName, c.userName, c.displayName, c.name,
    b.ownerName, b.userName, b.displayName, b.name,
    p.ownerName, p.userName, p.displayName, p.name
  ];
  for (const v of candidates) {
    const name = oneLine(safeStr(v)).trim();
    if (name && name.length >= 2 && name.length <= 36) out.add(name);
  }
  return Array.from(out).filter(Boolean);
}
function escapeRegExp(s) {
  return safeStr(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function sanitizePublicReply(text, forbiddenNames) {
  let out = safeStr(text || "");
  if (!out) return "";
  const names = Array.isArray(forbiddenNames) ? forbiddenNames : [];
  for (const nm of names) {
    const n = escapeRegExp(nm);
    out = out.replace(new RegExp(`(^|\\n)\\s*(Alright|Okay|Hey|Hi|Hello)\\s*,?\\s*${n}\\s*([.!?]|,)?\\s*`, "gi"), "$1$2. ");
    out = out.replace(new RegExp(`,\\s*${n}\\b\\s*([.!?])`, "gi"), "$1");
    out = out.replace(new RegExp(`(^|\\n)\\s*${n}\\s*([.!?])?\\s*(?=\\n|$)`, "gi"), "$1");
    out = out.replace(new RegExp(`\\b${n}\\b`, "gi"), "there");
  }
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\.\s*\./g, ".")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function applyPublicSanitization(reply, norm, session, publicMode) {
  if (!publicMode) return safeStr(reply || "").trim();
  return sanitizePublicReply(reply, collectForbiddenNames(norm, session));
}
function detectGreetingQuick(text) {
  const raw0 = safeStr(text || "");
  const t0 = raw0.trim();
  if (!t0) return null;
  const canon = t0.toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/g, "").trim();
  const how = /(how are you|how\'s it going|hows it going|how are you doing|how\'re you|whats up|what\'s up)(\s+today)?$/i;
  const greetHead = /^(hi|hello|hey|yo|sup|good (morning|afternoon|evening))(\s+nyx)?(\s*[,:-])?\s*/i;
  if (/^(how are you|how are you doing|how\'s it going|hows it going|what\'s up|whats up)(\s+today)?$/i.test(canon)) {
    return { kind: "GREETING_HOW" };
  }
  if (greetHead.test(canon)) {
    const tail = canon.replace(greetHead, "").trim();
    if (!tail) return { kind: "GREETING_ONLY" };
    if (how.test(tail)) return { kind: "GREETING_HOW" };
    if (/^(there|nyx)$/i.test(tail)) return { kind: "GREETING_ONLY" };
  }
  return null;
}
function pickBySeed(arr, seed) {
  const a = Array.isArray(arr) ? arr : [];
  if (!a.length) return "";
  const h = sha1Lite(safeStr(seed || ""));
  const n = parseInt(h.slice(0, 8), 16);
  const idx = Number.isFinite(n) ? (n % a.length) : 0;
  return safeStr(a[idx] || "");
}
function buildGreetingReply(kind, seed) {
  const k = safeStr(kind || "").toUpperCase();
  const poolOnly = [
    "Hi — I am Nyx. How can I help you today?",
    "Hey — I am Nyx. What can I do for you?",
    "Hello — I am Nyx. How can I help?",
    "Hi there. I am Nyx — what would you like to talk about?"
  ];
  const poolHow = [
    "I am doing well, thank you. How can I help you today?",
    "Doing good — thanks for asking. What can I help you with?",
    "I am well. What is on your mind today?",
    "I am doing great — thank you. How can I help?"
  ];
  return pickBySeed(k === "GREETING_HOW" ? poolHow : poolOnly, seed);
}

function normalizeEmotionGuardResult(raw) {
  const r = isPlainObject(raw) ? raw : {};
  const state = isPlainObject(r.state) ? r.state : {};
  const supportFlags = isPlainObject(r.supportFlags) ? r.supportFlags : {};
  const reinforcements = isPlainObject(r.reinforcements) ? r.reinforcements : {};
  const routeHints = Array.isArray(r.routeHints) ? r.routeHints.slice(0, 12) : [];
  const responseHints = Array.isArray(r.responseHints) ? r.responseHints.slice(0, 20) : [];
  const mode =
    supportFlags.crisis ? "DISTRESS" :
    (supportFlags.highDistress || state.valence === "negative" || state.valence === "critical_negative") ? "VULNERABLE" :
    state.valence === "positive" ? "POSITIVE" :
    "NORMAL";
  const tags = [];
  if (safeStr(state.dominantEmotion)) tags.push(safeStr(state.dominantEmotion));
  if (safeStr(state.valence)) tags.push(safeStr(state.valence));
  if (safeStr(state.momentum) && safeStr(state.momentum) !== "flat") tags.push(`momentum_${safeStr(state.momentum)}`);
  for (const h of routeHints) tags.push(safeStr(h));

  return {
    ok: !!r.ok,
    source: "emotionRouteGuard",
    mode,
    valence: safeStr(state.valence || "neutral"),
    intensityLabel: safeStr(state.intensity || "flat"),
    intensity: clampInt(
      state.intensity === "very_high" ? 95 :
      state.intensity === "high" ? 78 :
      state.intensity === "moderate" ? 55 :
      state.intensity === "low" ? 28 : 0,
      0, 0, 100
    ),
    dominantEmotion: safeStr(state.dominantEmotion || "neutral"),
    dominantSource: safeStr(state.dominantSource || "none"),
    tone: safeStr(state.tone || "steady_neutral"),
    bypassClarify: !!(supportFlags.crisis || supportFlags.highDistress),
    supportFlags: {
      crisis: !!supportFlags.crisis,
      highDistress: !!supportFlags.highDistress,
      needsGentlePacing: !!supportFlags.needsGentlePacing,
      avoidCelebratoryTone: !!supportFlags.avoidCelebratoryTone,
      recoveryPresent: !!supportFlags.recoveryPresent,
      positivePresent: !!supportFlags.positivePresent
    },
    routeHints,
    responseHints,
    distressReinforcements: Array.isArray(reinforcements.distress) ? reinforcements.distress.slice(0, 12) : [],
    positiveReinforcements: Array.isArray(reinforcements.positive) ? reinforcements.positive.slice(0, 12) : [],
    recoverySignals: Array.isArray(r.recoverySignals) ? r.recoverySignals.slice(0, 12) : [],
    contradictions: isPlainObject(r.contradictions) ? r.contradictions : { count: 0, contradictions: [] },
    summary: isPlainObject(r.summary) ? r.summary : { concise: "", narrative: "" },
    tags: [...new Set(tags.filter(Boolean))].slice(0, 16),
    cached: !!r.cached
  };
}
function runEmotionGuard(text) {
  const t = safeStr(text || "").trim();
  if (!t) return null;
  try {
    if (!EmotionRouteGuard) return null;

    if (typeof EmotionRouteGuard.analyzeEmotion === "function") {
      return normalizeEmotionGuardResult(
        EmotionRouteGuard.analyzeEmotion(t, {
          enableCache: true,
          enableMomentum: true,
          enableContradictions: true,
          enableRiskSignals: true,
          enablePositiveReinforcement: true,
          enableRecoverySignals: true
        })
      );
    }

    if (EmotionRouteGuard.emotionRootGod && typeof EmotionRouteGuard.emotionRootGod.analyze === "function") {
      return normalizeEmotionGuardResult(
        EmotionRouteGuard.emotionRootGod.analyze(t, {
          enableCache: true,
          enableMomentum: true,
          enableContradictions: true,
          enableRiskSignals: true,
          enablePositiveReinforcement: true,
          enableRecoverySignals: true
        })
      );
    }
  } catch (_e) {
    return null;
  }
  return null;
}
function applyEmotionSignalsToNorm(norm, emo) {
  if (!emo || !isPlainObject(norm.turnSignals)) return;
  norm.turnSignals.emotionMode = safeStr(emo.mode || "NORMAL");
  norm.turnSignals.emotionTags = Array.isArray(emo.tags) ? emo.tags.slice(0, 12) : [];
  norm.turnSignals.emotionIntensity = clampInt(emo.intensity || 0, 0, 0, 100);
  norm.turnSignals.emotionBypassClarify = !!emo.bypassClarify;
  norm.turnSignals.emotionNeedSoft = !!emo.supportFlags?.needsGentlePacing;
  norm.turnSignals.emotionNeedCrisis = !!emo.supportFlags?.crisis;
  norm.turnSignals.emotionValence = safeStr(emo.valence || "neutral");
  norm.turnSignals.emotionDominant = safeStr(emo.dominantEmotion || "neutral");
  norm.turnSignals.emotionTone = safeStr(emo.tone || "steady_neutral");
  norm.turnSignals.emotionCached = !!emo.cached;
  norm.turnSignals.emotionRecoveryPresent = !!emo.supportFlags?.recoveryPresent;
  norm.turnSignals.emotionPositivePresent = !!emo.supportFlags?.positivePresent;
  norm.turnSignals.emotionContradictions = clampInt(emo.contradictions?.count || 0, 0, 0, 99);
}
function isTechnicalExecutionInbound(norm) {
  const text = safeStr(norm?.text || "", 400).toLowerCase();
  const action = safeStr(norm?.action || norm?.payload?.action || norm?.payload?.route || "", 80).toLowerCase();
  if (!text && !action) return false;
  return /(chat engine|state spine|support response|loop|looping|debug|debugging|patch|update|rebuild|restructure|integrate|implementation|code|script|file|tts|api|route|backend|fix)/.test(text) ||
    /(diagnosis|restructure|patch|implement|debug|fix|repair|analysis)/.test(action);
}

function shouldAllowEmotionFirst(norm, emo, spineState, plannerDecision) {
  if (!emo) return false;
  if (emo.supportFlags?.crisis) return true;
  const technical = isTechnicalExecutionInbound(norm);
  const phase = typeof Spine?.inferConversationPhase === "function"
    ? Spine.inferConversationPhase(spineState, {
        text: norm?.text,
        payload: norm?.payload,
        action: norm?.action,
        lane: norm?.lane,
        turnSignals: norm?.turnSignals
      }, plannerDecision || null)
    : "active";
  if (technical && phase !== "recovery") return false;
  if (phase === "execution" && !emo.supportFlags?.highDistress && !emo.bypassClarify) return false;
  if (phase === "active" && technical) return false;
  return !!(emo.bypassClarify || emo.mode === "VULNERABLE" || emo.valence === "negative" || emo.supportFlags?.needsGentlePacing || emo.valence === "mixed");
}

function shouldSuppressGreeting(norm, spineState) {
  const technical = isTechnicalExecutionInbound(norm);
  const turns = Number(spineState?.turns?.user || 0);
  return technical || turns > 0;
}

function dedupeFollowUpsForExecution(followUps, norm, emo) {
  const list = Array.isArray(followUps) ? followUps : [];
  if (emo?.supportFlags?.crisis) return list.slice(0, 2);
  if (isTechnicalExecutionInbound(norm)) return [];
  return list;
}

function buildSupportPacketSafe(norm, emo) {
  if (!emo || !Support) return null;
  try {
    if (typeof Support.buildSupportPacket === "function") {
      return Support.buildSupportPacket({
        userText: safeStr(norm?.text || ""),
        emo,
        seed: safeStr(norm?.ctx?.sessionId || norm?.ctx?.sid || "")
      }, { suppressQuestionOnTechnical: isTechnicalExecutionInbound(norm), suppressQuestionOnRecovery: true });
    }
    if (typeof Support.buildSupportiveResponse === "function") {
      return {
        ok: true,
        mode: emo.supportFlags?.crisis ? "crisis" : "supportive",
        reply: Support.buildSupportiveResponse({
          userText: safeStr(norm?.text || ""),
          emo,
          seed: safeStr(norm?.ctx?.sessionId || norm?.ctx?.sid || "")
        }, { suppressQuestionOnTechnical: isTechnicalExecutionInbound(norm), suppressQuestionOnRecovery: true }),
        meta: {
          crisis: !!emo.supportFlags?.crisis,
          dominantEmotion: safeStr(emo.dominantEmotion || "neutral"),
          valence: safeStr(emo.valence || "neutral"),
          tone: safeStr(emo.tone || "steady_neutral")
        }
      };
    }
  } catch (_e) {
    return null;
  }
  return null;
}
function buildEmotionDirectives(emo, packet) {
  const out = [];
  if (!emo) return out;

  if (emo.supportFlags?.crisis) {
    out.push({ type: "safety", level: "critical", route: "human_support" });
  } else if (emo.supportFlags?.highDistress) {
    out.push({ type: "pacing", level: "soft", reason: "high_distress" });
  } else if (emo.valence === "positive") {
    out.push({ type: "reinforcement", level: "positive", dominantEmotion: safeStr(emo.dominantEmotion || "positive") });
  } else if (emo.mode === "VULNERABLE" || emo.valence === "negative") {
    out.push({ type: "pacing", level: "soft", reason: "vulnerable_support" });
  }

  if (emo.supportFlags?.needsGentlePacing) out.push({ type: "tone", level: "gentle", reason: "needs_gentle_pacing" });
  if (emo.supportFlags?.recoveryPresent) out.push({ type: "recovery", level: "detected" });
  if ((emo.contradictions?.count || 0) > 0) out.push({ type: "mixed_state", count: clampInt(emo.contradictions.count, 0, 0, 99) });
  if (packet && isPlainObject(packet.meta) && packet.meta.crisis) out.push({ type: "support_packet", mode: safeStr(packet.mode || "supportive") });

  return out.slice(0, 8);
}
function buildSupportiveEmotionFollowUps(emo) {
  const dom = safeStr(emo?.dominantEmotion || "").trim().toLowerCase();

  if (emo?.supportFlags?.crisis || emo?.supportFlags?.highDistress) {
    return [
      { id: "fu_ground", type: "action", label: "Stay with me", payload: { action: "support_ground", mode: "supportive" } },
      { id: "fu_breathe", type: "action", label: "One breath", payload: { action: "support_breathe", mode: "supportive" } }
    ];
  }

  if (dom === "loneliness" || dom === "lonely" || dom === "isolation") {
    return [
      { id: "fu_talk_lonely", type: "action", label: "Talk about it", payload: { action: "support_talk", mode: "supportive", emotion: "loneliness" } },
      { id: "fu_stay_lonely", type: "action", label: "Stay with me", payload: { action: "support_stay", mode: "supportive", emotion: "loneliness" } }
    ];
  }

  return [
    { id: "fu_talk_support", type: "action", label: "Talk to me", payload: { action: "support_talk", mode: "supportive" } },
    { id: "fu_slow_support", type: "action", label: "Slow it down", payload: { action: "support_slow", mode: "supportive" } }
  ];
}
function buildSupportiveEmotionUi(emo) {
  return {
    chips: buildSupportiveEmotionFollowUps(emo),
    allowMic: true,
    mode: "supportive"
  };
}
function maybeBuildEmotionFirstReply(norm, emo) {
  if (!emo) return null;
  const text = safeStr(norm?.text || "").trim();
  if (!text) return null;

  const packet = buildSupportPacketSafe(norm, emo);

  if (emo.bypassClarify && packet && safeStr(packet.reply)) {
    return {
      reply: safeStr(packet.reply),
      mode: safeStr(packet.mode || "supportive"),
      directives: buildEmotionDirectives(emo, packet)
    };
  }

  const vulnerableSupport =
    emo.mode === "VULNERABLE" ||
    emo.valence === "negative" ||
    !!emo.supportFlags?.needsGentlePacing;

  if (vulnerableSupport) {
    let reply = "";
    const dom = safeStr(emo.dominantEmotion || "").trim().toLowerCase();

    if (packet && safeStr(packet.reply)) {
      reply = safeStr(packet.reply);
    } else if (dom === "loneliness" || dom === "lonely" || dom === "isolation") {
      reply = "I am here with you. You do not have to sit in that feeling alone. Do you want to tell me what is making today feel heavy?";
    } else if (dom === "sadness" || dom === "grief" || dom === "hurt") {
      reply = "I am here, and I am listening. Tell me what is weighing on you most right now.";
    } else {
      reply = "I am here with you. Talk to me. What feels hardest right now?";
    }

    return {
      reply,
      mode: "supportive",
      directives: buildEmotionDirectives(emo, packet)
    };
  }

  if (emo.valence === "positive" && Array.isArray(emo.positiveReinforcements) && emo.positiveReinforcements.length) {
    const dom = safeStr(emo.dominantEmotion || "positive");
    let reply = "That is a good signal. What do you want to do with that energy next?";

    if (packet && safeStr(packet.reply)) {
      reply = safeStr(packet.reply);
    } else if (dom === "confidence" || dom === "pride" || dom === "momentum") {
      reply = "That has strong forward motion in it. What do you want to build on next?";
    } else if (dom === "gratitude" || dom === "connection" || dom === "calm") {
      reply = "That sounds steady in a good way. Do you want to stay with it for a second or turn it into a next step?";
    }

    return {
      reply,
      mode: "positive",
      directives: buildEmotionDirectives(emo, packet)
    };
  }

  if (emo.valence === "mixed" && packet && safeStr(packet.reply) && (emo.contradictions?.count || 0) > 0) {
    return {
      reply: safeStr(packet.reply),
      mode: "mixed",
      directives: buildEmotionDirectives(emo, packet)
    };
  }

  return null;
}
function makeBreakerReply(norm, emo) {
  const packet = buildSupportPacketSafe(norm, emo);
  if (packet && packet.reply && (packet.mode === "supportive" || packet.mode === "crisis")) {
    return safeStr(packet.reply);
  }
  return "Loop detected — I am seeing the same request repeating. To break it, send one fresh input only or pick a single lane. Options: just talk, ideas, step-by-step plan, or switch lane.";
}
function makeInFlightReply(norm, emo) {
  const packet = buildSupportPacketSafe(norm, emo);
  if (packet && packet.reply && safeStr(packet.reply)) return safeStr(packet.reply);
  return "I am already processing that exact turn. Do not resend it. Send one fresh input when this pass completes.";
}
function normalizeInbound(input) {
  const src = isPlainObject(input) ? input : {};
  const body = isPlainObject(src.body) ? src.body : {};
  const payload = isPlainObject(src.payload) ? src.payload : {};
  const ctx = isPlainObject(src.ctx) ? src.ctx : {};
  const session = isPlainObject(src.session) ? src.session : {};

  let text =
    safeStr(src.text || "") ||
    safeStr(body.text || "") ||
    safeStr(payload.text || "") ||
    safeStr(body.message || "") ||
    safeStr(payload.message || "");

  if (text.length > 6500) text = text.slice(0, 6500);

  const lane =
    safeStr(src.lane || "") ||
    safeStr(payload.lane || "") ||
    safeStr(body.lane || "") ||
    safeStr(session.lane || "") ||
    "general";

  const action =
    safeStr(src.action || "") ||
    safeStr(payload.action || "") ||
    safeStr(body.action || "");

  const year =
    normYear(src.year) ||
    normYear(payload.year) ||
    normYear(body.year);

  return {
    text,
    lane,
    action,
    year,
    vibe: safeStr(src.vibe || payload.vibe || body.vibe || ""),
    body,
    payload,
    ctx,
    turnSignals: {
      textEmpty: !safeStr(text).trim(),
      hasPayload: !!Object.keys(payload).length,
      payloadActionable: hasActionablePayload(payload)
    }
  };
}
function computeLaneState(session, corePrev, lane, norm) {
  const s = isPlainObject(session) ? session : {};
  const prev = safeStr(s.lane || "").trim() || safeStr(corePrev?.lane || "").trim() || "general";
  const cur = safeStr(lane || "").trim() || "general";
  const payloadLane = safeStr(norm?.payload?.lane || "").trim();
  const bodyLane = safeStr(norm?.body?.lane || "").trim();
  const ctxLane = safeStr(norm?.ctx?.lane || "").trim();
  const route = safeStr(norm?.payload?.route || norm?.payload?.action || "").trim();
  const changed = !!(prev && cur && prev !== cur);
  let reason = "carry";
  if (changed) reason = "lane_change";
  if (payloadLane && payloadLane === cur) reason = "payload_lane";
  else if (bodyLane && bodyLane === cur) reason = "body_lane";
  else if (ctxLane && ctxLane === cur) reason = "ctx_lane";
  else if (route) reason = "route_or_action";
  else if (safeStr(norm?.action || "").trim()) reason = "typed_action";
  return { current: cur, previous: prev, changed, reason };
}
function computeBridge(sessionLaneState, requestId) {
  const st = isPlainObject(sessionLaneState) ? sessionLaneState : null;
  if (!st || !st.changed) return null;
  return {
    v: "bridge.v1",
    requestId: safeStr(requestId || ""),
    fromLane: safeStr(st.previous || ""),
    toLane: safeStr(st.current || ""),
    reason: safeStr(st.reason || "lane_change"),
    at: nowMs()
  };
}
function failSafeContract(err, input, extra) {
  const src = isPlainObject(input) ? input : {};
  const requestId = safeStr(src.requestId || "").slice(0, 80) || `req_${nowMs()}`;
  const msg = "Backend is stabilizing. Try again in a moment — or tap Reset.";
  return {
    ok: false,
    reply: msg,
    payload: { reply: msg },
    lane: "general",
    laneId: "general",
    sessionLane: "general",
    bridge: null,
    ctx: {},
    ui: { chips: [], allowMic: true },
    directives: [],
    followUps: [],
    followUpsStrings: [],
    sessionPatch: isPlainObject(extra?.sessionPatch) ? extra.sessionPatch : {},
    cog: {
      intent: "STABILIZE",
      mode: "transitional",
      publicMode: true,
      diag: { failSafe: true, err: safeStr(err && err.message ? err.message : err).slice(0, 180) }
    },
    requestId,
    meta: { v: CE_VERSION, failSafe: true, t: nowMs(), phase: 15 }
  };
}

async function handleChat(input) {
  const started = nowMs();
  const rawInput = isPlainObject(input) ? input : {};
  const session = isPlainObject(rawInput.session) ? rawInput.session : {};

  let inboundKey = "";
  let requestId = "";
  let turnId = "";
  let inSig = "";
  let publicMode = true;
  let norm = null;
  let lifecycle = { blocked: false, reason: "", patch: {} };

  try {
    norm = normalizeInbound(rawInput);
    norm._t0 = started;

    inboundKey = buildInboundKey(norm);
    requestId = resolveRequestId(rawInput, norm, inboundKey);
    turnId = buildTurnId(rawInput, norm, inboundKey, requestId);
    publicMode = computePublicMode(norm, session);

    inSig = inboundLoopSig(norm, session);
    lifecycle = beginTurnLifecycle(session, {
      turnId,
      requestId,
      inSig,
      inboundKey,
      publicMode,
      laneHint: safeStr(norm.lane || "general") || "general"
    });

    if (lifecycle.blocked && lifecycle.replay) {
      return {
        ...lifecycle.replay,
        requestId,
        sessionPatch: mergeSessionPatches(lifecycle.replay.sessionPatch, lifecycle.patch, {
          __turnLifecycleReason: lifecycle.reason
        })
      };
    }

    if (lifecycle.blocked) {
      const emoBlocked = runEmotionGuard(norm.text || "");
      const blockedReply = applyPublicSanitization(
        scrubExecutionStyleArtifacts(softSpeak(makeInFlightReply(norm, emoBlocked))),
        norm,
        session,
        publicMode
      );
      return {
        ok: true,
        reply: blockedReply,
        payload: { reply: blockedReply },
        lane: safeStr(norm.lane || "general") || "general",
        laneId: safeStr(norm.lane || "general") || "general",
        sessionLane: safeStr(norm.lane || "general") || "general",
        bridge: null,
        ctx: {},
        ui: buildUiForLane(safeStr(norm.lane || "general") || "general"),
        directives: [],
        followUps: [],
        followUpsStrings: [],
        sessionPatch: mergeSessionPatches(lifecycle.patch, {
          __turnLifecycleReason: lifecycle.reason
        }),
        cog: { publicMode, mode: "transitional", intent: "STABILIZE" },
        requestId,
        meta: { v: CE_VERSION, blocked: true, reason: lifecycle.reason, t: nowMs(), phase: 15 }
      };
    }

    const inboundRepeat = detectInboundRepeat(session, inSig);

    const emo = runEmotionGuard(norm.text || "");
    applyEmotionSignalsToNorm(norm, emo);

    const bypassFastReplay = !!(
      emo && (
        emo.bypassClarify ||
        emo.mode === "VULNERABLE" ||
        emo.valence === "negative" ||
        !!emo.supportFlags?.needsGentlePacing
      )
    );

    if (inboundRepeat.canFastReturn && !bypassFastReplay) {
      const cached = getCachedReply(session, inSig);
      if (cached) {
        const replayContract = {
          ok: true,
          reply: cached.reply,
          payload: { reply: cached.reply },
          lane: cached.lane,
          laneId: cached.lane,
          sessionLane: cached.lane,
          bridge: null,
          ctx: {},
          ui: buildUiForLane(cached.lane),
          directives: cached.directives || [],
          followUps: cached.followUps || [],
          followUpsStrings: (cached.followUps || []).map((x) => x.label),
          sessionPatch: {},
          cog: { publicMode, mode: "transitional", intent: "REPLAY" },
          requestId,
          meta: { v: CE_VERSION, replay: true, t: nowMs(), phase: 8 }
        };

        replayContract.sessionPatch = mergeSessionPatches(
          lifecycle.patch,
          inboundRepeat.patch,
          completeTurnLifecycle(session, {
            turnId,
            requestId,
            inSig,
            inboundKey,
            lane: cached.lane,
            reply: cached.reply,
            contract: replayContract
          }),
          {
            __lastInboundKey: inboundKey,
            __cacheAt: nowMs(),
            __turnLifecycleReason: "cached_fast_return"
          }
        );
        return replayContract;
      }
    }

    const corePrev = isPlainObject(session.__spineState)
      ? session.__spineState
      : Spine.createState({ lane: safeStr(session.lane || "general") || "general", stage: "open" });

    const plannerDecision = typeof Spine?.decideNextMove === "function"
      ? Spine.decideNextMove(corePrev, {
          text: norm.text,
          payload: norm.payload,
          ctx: norm.ctx,
          lane: norm.lane,
          year: norm.year,
          action: norm.action,
          turnSignals: norm.turnSignals,
          cog: {
            intent: emo?.bypassClarify ? "STABILIZE" : "ADVANCE",
            mode: isTechnicalExecutionInbound(norm) ? "execution" : "transitional",
            publicMode
          }
        })
      : { move: "ADVANCE", stage: "deliver", rationale: "planner_missing" };

    const emotionFirst = shouldAllowEmotionFirst(norm, emo, corePrev, plannerDecision)
      ? maybeBuildEmotionFirstReply(norm, emo)
      : null;
    if (emotionFirst && safeStr(emotionFirst.reply)) {
      const lane = safeStr(norm.lane || "general") || "general";
      const safeReply = applyPublicSanitization(
        scrubExecutionStyleArtifacts(softSpeak(emotionFirst.reply)),
        norm,
        session,
        publicMode
      );
      const isSupportiveEmotion = safeStr(emotionFirst.mode || "").toLowerCase() === "supportive";
      const followUps = isSupportiveEmotion ? buildSupportiveEmotionFollowUps(emo) : buildFollowUpsForLane(lane);
      const directives = Array.isArray(emotionFirst.directives) ? emotionFirst.directives : [];
      const ui = isSupportiveEmotion ? buildSupportiveEmotionUi(emo) : buildUiForLane(lane);

      const emotionContract = {
        ok: true,
        reply: safeReply,
        payload: { reply: safeReply },
        lane,
        laneId: lane,
        sessionLane: lane,
        bridge: null,
        ctx: {},
        ui,
        directives,
        followUps,
        followUpsStrings: followUps.map((x) => x.label),
        sessionPatch: {},
        cog: {
          route: "emotion_route_guard",
          publicMode,
          mode: "transitional",
          intent: emo?.bypassClarify ? "STABILIZE" : "ENGAGE",
          emotion: emo ? {
            mode: emo.mode,
            valence: emo.valence,
            dominantEmotion: emo.dominantEmotion,
            tone: emo.tone,
            bypassClarify: !!emo.bypassClarify,
            recoveryPresent: !!emo.supportFlags?.recoveryPresent,
            contradictions: clampInt(emo.contradictions?.count || 0, 0, 0, 99)
          } : null
        },
        requestId,
        meta: {
          v: CE_VERSION,
          earlyReturn: "emotion_first",
          emotionCached: !!emo?.cached,
          telemetry: buildTelemetry({ norm, lane, emo, requestId, publicMode, phase: "emotion_first" }),
          t: nowMs(),
          phase: 7
        }
      };

      emotionContract.sessionPatch = mergeSessionPatches(
        lifecycle.patch,
        inboundRepeat.patch,
        {
          lane,
          publicMode,
          __lastInboundKey: inboundKey,
          __emotionMode: safeStr(emo?.mode || "NORMAL"),
          __emotionValence: safeStr(emo?.valence || "neutral"),
          __emotionDominant: safeStr(emo?.dominantEmotion || "neutral"),
          __emotionAt: nowMs(),
          __cacheInSig: inSig,
          __cacheReply: safeReply,
          __cacheLane: lane,
          __cacheFollowUps: followUps,
          __cacheDirectives: directives,
          __cacheAt: nowMs()
        },
        completeTurnLifecycle(session, {
          turnId,
          requestId,
          inSig,
          inboundKey,
          lane,
          reply: safeReply,
          contract: emotionContract
        })
      );

      return emotionContract;
    }

    if (inboundRepeat.tripped) {
      const breaker = makeBreakerReply(norm, emo);
      const safeReply = applyPublicSanitization(
        scrubExecutionStyleArtifacts(softSpeak(breaker)),
        norm,
        session,
        publicMode
      );

      const breakerContract = {
        ok: true,
        reply: safeReply,
        payload: { reply: safeReply },
        lane: "general",
        laneId: "general",
        sessionLane: "general",
        bridge: null,
        ctx: {},
        ui: buildUiForLane("general"),
        directives: [],
        followUps: [],
        followUpsStrings: [],
        sessionPatch: {},
        cog: {
          publicMode,
          mode: "transitional",
          intent: "STABILIZE",
          emotion: emo ? {
            mode: emo.mode,
            valence: emo.valence,
            dominantEmotion: emo.dominantEmotion
          } : null
        },
        requestId,
        meta: { v: CE_VERSION, breaker: true, t: nowMs(), phase: 8 }
      };

      breakerContract.sessionPatch = mergeSessionPatches(
        lifecycle.patch,
        inboundRepeat.patch,
        {
          __lastInboundKey: inboundKey,
          __cacheInSig: inSig,
          __cacheReply: safeReply,
          __cacheLane: "general",
          __cacheFollowUps: [],
          __cacheDirectives: [],
          __cacheAt: nowMs()
        },
        completeTurnLifecycle(session, {
          turnId,
          requestId,
          inSig,
          inboundKey,
          lane: "general",
          reply: safeReply,
          contract: breakerContract
        })
      );

      return breakerContract;
    }

    const greeting = detectGreetingQuick(norm.text || "");
    if (greeting && !shouldSuppressGreeting(norm, corePrev)) {
      const reply = applyPublicSanitization(
        scrubExecutionStyleArtifacts(softSpeak(buildGreetingReply(greeting.kind, inboundKey))),
        norm,
        session,
        publicMode
      );
      const lane = safeStr(norm.lane || "general") || "general";
      const followUps = buildFollowUpsForLane(lane);

      const greetingContract = {
        ok: true,
        reply,
        payload: { reply },
        lane,
        laneId: lane,
        sessionLane: lane,
        bridge: null,
        ctx: {},
        ui: buildUiForLane(lane),
        directives: [],
        followUps,
        followUpsStrings: followUps.map((x) => x.label),
        sessionPatch: {},
        cog: { publicMode, mode: "transitional", intent: "GREETING" },
        requestId,
        meta: { v: CE_VERSION, greeting: true, t: nowMs(), phase: 7 }
      };

      greetingContract.sessionPatch = mergeSessionPatches(
        lifecycle.patch,
        inboundRepeat.patch,
        {
          lane,
          publicMode,
          __greeted: true,
          __lastInboundKey: inboundKey,
          __cacheInSig: inSig,
          __cacheReply: reply,
          __cacheLane: lane,
          __cacheFollowUps: followUps,
          __cacheDirectives: [],
          __cacheAt: nowMs()
        },
        completeTurnLifecycle(session, {
          turnId,
          requestId,
          inSig,
          inboundKey,
          lane,
          reply,
          contract: greetingContract
        })
      );

      return greetingContract;
    }

    const routeOut = routeLane
      ? routeLane(norm, session, emo)
      : {
          reply: "I am here. Tell me what you need, and I will stay with that exact target.",
          lane: safeStr(norm.lane || "general") || "general",
          directives: [],
          followUps: buildFollowUpsForLane(safeStr(norm.lane || "general") || "general"),
          ui: buildUiForLane(safeStr(norm.lane || "general") || "general"),
          meta: { failOpen: true, routeLaneMissing: true }
        };

    let reply = safeStr(routeOut?.reply || "").trim();
    let lane = safeStr(routeOut?.lane || norm.lane || session.lane || "general") || "general";

    if (!reply) reply = "I am here. Give me the exact target and I will keep this steady.";

    const loopPatch = detectAndPatchLoop(session, lane, reply);
    if (loopPatch.tripped) {
      reply = makeBreakerReply(norm, emo);
      lane = "general";
    }

    const safeReply = applyPublicSanitization(
      scrubExecutionStyleArtifacts(softSpeak(applyBudgetText(reply, "medium"))),
      norm,
      session,
      publicMode
    );

    const sessionLaneState = computeLaneState(session, corePrev, lane, norm);
    const bridge = computeBridge(sessionLaneState, requestId);
    const followUpsRaw = Array.isArray(routeOut?.followUps) ? routeOut.followUps : buildFollowUpsForLane(lane);
    const followUps = dedupeFollowUpsForExecution(followUpsRaw, norm, emo);
    const directives = Array.isArray(routeOut?.directives) ? routeOut.directives : [];
    const ui = isPlainObject(routeOut?.ui) ? routeOut.ui : buildUiForLane(lane);

    let nextSpine = null;
    try {
      nextSpine = Spine.finalizeTurn({
        prevState: corePrev,
        inbound: {
          text: norm.text,
          payload: norm.payload,
          ctx: norm.ctx,
          lane: norm.lane,
          year: norm.year,
          action: norm.action,
          turnSignals: norm.turnSignals,
          latencyMs: Math.max(0, nowMs() - started),
          cog: {
            intent: emo?.bypassClarify ? "STABILIZE" : "CLARIFY",
            mode: "transitional",
            publicMode
          }
        },
        lane,
        topicOverride: "",
        actionTaken: safeStr(norm.action || ""),
        followUps,
        pendingAsk: null,
        decision: {
          move: safeStr(plannerDecision?.move || (emo?.bypassClarify ? "ADVANCE" : "ADVANCE"), 20).toUpperCase(),
          rationale: safeStr(plannerDecision?.rationale || (emo?.bypassClarify ? "emotion_bypass" : "normal_turn"), 80),
          speak: safeReply,
          stage: safeStr(plannerDecision?.stage || "deliver", 20).toLowerCase(),
          _plannerMode: safeStr(plannerDecision?._plannerMode || (isTechnicalExecutionInbound(norm) ? "execution" : "advance"), 48)
        },
        marionCog: {
          route: emo ? "emotion_route_guard" : "general",
          publicMode
        },
        assistantSummary: safeReply,
        updateReason: "turn"
      });
    } catch (_e) {
      nextSpine = { ...corePrev, rev: (Number.isFinite(corePrev.rev) ? corePrev.rev : 0) + 1, lane };
    }

    storeMemoryTurn(resolveSessionId(norm, session, inboundKey), {
      at: nowMs(),
      lane,
      user: safeStr(norm.text || "").slice(0, 400),
      assistant: safeReply.slice(0, 400),
      emotion: emo ? {
        mode: emo.mode,
        valence: emo.valence,
        dominantEmotion: emo.dominantEmotion,
        tone: emo.tone,
        recoveryPresent: !!emo.supportFlags?.recoveryPresent,
        positivePresent: !!emo.supportFlags?.positivePresent,
        contradictions: clampInt(emo.contradictions?.count || 0, 0, 0, 99)
      } : null,
      requestId
    });

    const finalContract = {
      ok: true,
      reply: safeReply,
      payload: { reply: safeReply },
      lane,
      laneId: lane,
      sessionLane: lane,
      bridge,
      ctx: {},
      ui,
      directives,
      followUps,
      followUpsStrings: followUps.map((x) => x.label),
      sessionPatch: {},
      cog: {
        marionVersion: safeStr(MarionSO?.MARION_VERSION || MarionSO?.SO_VERSION || MarionSO?.version || ""),
        route: emo ? "emotion_route_guard" : "general",
        intent: emo?.bypassClarify ? "STABILIZE" : safeStr(plannerDecision?.move || "ADVANCE", 20).toUpperCase(),
        mode: isTechnicalExecutionInbound(norm) ? "execution" : "transitional",
        publicMode,
        emotion: emo ? {
          mode: emo.mode,
          valence: emo.valence,
          dominantEmotion: emo.dominantEmotion,
          tone: emo.tone,
          bypassClarify: !!emo.bypassClarify,
          recoveryPresent: !!emo.supportFlags?.recoveryPresent,
          positivePresent: !!emo.supportFlags?.positivePresent,
          contradictions: clampInt(emo.contradictions?.count || 0, 0, 0, 99)
        } : null
      },
      requestId,
      meta: {
        v: CE_VERSION,
        t: nowMs(),
        phase: 14,
        emotionCached: !!emo?.cached,
        telemetry: buildTelemetry({ norm, lane, emo, requestId, publicMode, phase: "final" })
      }
    };

    finalContract.sessionPatch = mergeSessionPatches(
      lifecycle.patch,
      inboundRepeat.patch,
      loopPatch.patch,
      {
        lane,
        publicMode,
        __lastInboundKey: inboundKey,
        __memoryWindow: buildMemoryContext(resolveSessionId(norm, session, inboundKey)) || {},
        __spineState: nextSpine,
        __conversationPhase: safeStr(nextSpine?.phase || "active"),
        __cacheInSig: inSig,
        __cacheReply: safeReply,
        __cacheLane: lane,
        __cacheFollowUps: followUps,
        __cacheDirectives: directives,
        __cacheAt: nowMs(),
        __emotionMode: safeStr(emo?.mode || "NORMAL"),
        __emotionValence: safeStr(emo?.valence || "neutral"),
        __emotionDominant: safeStr(emo?.dominantEmotion || "neutral"),
        __emotionAt: nowMs()
      },
      completeTurnLifecycle(session, {
        turnId,
        requestId,
        inSig,
        inboundKey,
        lane,
        reply: safeReply,
        contract: finalContract
      })
    );

    return finalContract;
  } catch (err) {
    const failContract = failSafeContract(err, rawInput, {
      sessionPatch: mergeSessionPatches(
        lifecycle.patch,
        failTurnLifecycle(session, {
          turnId,
          requestId,
          inSig,
          inboundKey,
          lane: safeStr(norm?.lane || "general") || "general",
          reply: "Backend is stabilizing. Try again in a moment — or tap Reset."
        })
      )
    });

    failContract.sessionPatch = mergeSessionPatches(
      lifecycle.patch,
      failTurnLifecycle(session, {
        turnId,
        requestId,
        inSig,
        inboundKey,
        lane: safeStr(norm?.lane || "general") || "general",
        reply: failContract.reply,
        contract: failContract
      })
    );
    return failContract;
  }
}

module.exports = handleChat;
module.exports.CE_VERSION = CE_VERSION;
module.exports.handleChat = handleChat;
module.exports.chatEngine = handleChat;
module.exports.default = handleChat;
module.exports.computePublicMode = computePublicMode;
module.exports.sanitizePublicReply = sanitizePublicReply;
module.exports.STATE_SPINE_VERSION = Spine.SPINE_VERSION;
module.exports.STATE_SPINE = Spine;
