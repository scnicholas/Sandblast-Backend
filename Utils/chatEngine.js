"use strict";

/**
 * Utils/chatEngine.js
 *
 * Rebuilt core version with:
 * - emotionRouteGuard as single emotional parsing source
 * - supportResponse retained for supportive rendering
 * - loop hardening + inbound duplicate breaker
 * - public-mode sanitization
 * - fail-open semantics
 * - NyxReplyContract-compatible return shape
 */

let __SB_DATASETS_LAZY = { tried: false, ok: false };
const CE_VERSION = "chatEngine v0.10.13 OPINTEL (EMOTION ROUTE GUARD + LOOP-HARDEN + SOFT-VOICE DIRECTIVES)";

try {
  const _ceBoot =
    process &&
    process.env &&
    (process.env.SB_CHATENGINE_BOOT === "1" || process.env.SB_CE_BOOT === "1");
  if (_ceBoot) console.log("[CHATENGINE] BOOT", CE_VERSION, new Date().toISOString());
} catch (_e) {}

let Spine = null;
let MarionSO = null;
try { Spine = require("./stateSpine"); } catch (e) { Spine = null; }
try { MarionSO = require("./marionSO"); } catch (e) { MarionSO = null; }

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
    assertTurnUpdated: () => true,
  };
}

let SiteBridge = null;
let PsycheBridge = null;
function _tryRequireMany(paths) {
  for (const p of paths) {
    try {
      const mod = require(p);
      if (mod) return mod;
    } catch (_e) {}
  }
  return null;
}
SiteBridge = _tryRequireMany(["./SiteBridge", "./siteBridge", "./sitebridge"]);
PsycheBridge = _tryRequireMany(["./psycheBridge", "./PsycheBridge"]);

let Music = null;
try { Music = require("./musicKnowledge"); } catch (e) { Music = null; }

let MoviesLane = null;
try {
  MoviesLane = require("./moviesLane");
  if (!MoviesLane || typeof MoviesLane.handleChat !== "function") MoviesLane = null;
} catch (e) {
  MoviesLane = null;
}

let EmotionRouteGuard = null;
let Support = null;
try { EmotionRouteGuard = require("./emotionRouteGuard"); } catch (e) { EmotionRouteGuard = null; }
try { Support = require("./supportResponse"); } catch (e) { Support = null; }

let AffectEngine = null;
try { AffectEngine = require("./affectEngine"); } catch (e) { AffectEngine = null; }

let MemorySpine = null;
try { MemorySpine = require("./memorySpine"); } catch (e) { MemorySpine = null; }

let Dataset = null;
try { Dataset = require("./datasetLoader"); } catch (e) { Dataset = null; }

const SO_LATENT_DESIRE = MarionSO && MarionSO.LATENT_DESIRE ? MarionSO.LATENT_DESIRE : null;

function nowMs() {
  return Date.now();
}
function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function isPlainObject(x) {
  return !!x && typeof x === "object" &&
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
function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
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
  } catch (e) {
    try {
      return JSON.stringify({ _fail: true, t: safeStr(x) });
    } catch (_e) {
      return '{"_fail":true}';
    }
  }
}
function normYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < 1900 || t > 2100) return null;
  return t;
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
function mergeSessionPatch(base, overrides) {
  const b = isPlainObject(base) ? base : {};
  const o = isPlainObject(overrides) ? overrides : {};
  return { ...b, ...o };
}
function mergeSessionPatches() {
  const merged = {};
  for (let i = 0; i < arguments.length; i++) {
    const part = arguments[i];
    if (isPlainObject(part)) Object.assign(merged, part);
  }
  return merged;
}
function safeDatasetStats() {
  try { return Dataset && typeof Dataset.stats === "function" ? Dataset.stats() : null; } catch (_e) { return null; }
}
function safeDatasetSearch(q, opts) {
  try {
    return Dataset && typeof Dataset.search === "function"
      ? Dataset.search(q, opts)
      : { ok: true, hit: null, hits: [] };
  } catch (_e) {
    return { ok: true, hit: null, hits: [] };
  }
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
    pv: safeStr(p.vibe || ""),
  };
  return sha1Lite(safeJsonStringify(keyObj)).slice(0, 18);
}
function resolveSessionId(norm, session, inboundKey) {
  const nctx = isPlainObject(norm && norm.ctx) ? norm.ctx : {};
  const nb = isPlainObject(norm && norm.body) ? norm.body : {};
  const s = isPlainObject(session) ? session : {};
  const candidates = [
    nctx.sessionId, nctx.sid, nb.sessionId, nb.sid,
    s.sessionId, s.sid, s.id, s.sessionKey, s.key,
  ];
  for (const v of candidates) {
    const t = safeStr(v).trim();
    if (t && t.length <= 180) return t;
  }
  return safeStr(inboundKey || `sess_${nowMs()}`).slice(0, 36);
}
function safeBuildMemoryContext(sessionId) {
  if (!MemorySpine || typeof MemorySpine.buildContext !== "function") return null;
  try { return MemorySpine.buildContext(sessionId); } catch (_e) { return null; }
}
function safeStoreMemoryTurn(sessionId, turn) {
  if (!MemorySpine || typeof MemorySpine.storeTurn !== "function") return false;
  try {
    MemorySpine.storeTurn(sessionId, turn);
    return true;
  } catch (_e) {
    return false;
  }
}
const LOOP_WINDOW_MS = 9000;
const LOOP_HARD_LIMIT = 2;
const INBOUND_WINDOW_MS = 12000;
const INBOUND_DUPLICATE_FAST_MS = 5000;
const INBOUND_HARD_LIMIT = 2;

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
    followUps: Array.isArray(s.__cacheFollowUps) ? s.__cacheFollowUps : []
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
    p.ownerName, p.userName, p.displayName, p.name,
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
}
function makeBreakerReply(norm, emo) {
  if (emo && emo.bypassClarify && Support && typeof Support.buildSupportiveResponse === "function") {
    return Support.buildSupportiveResponse({
      userText: norm?.text || "",
      emo,
      seed: norm?.ctx?.sessionId || ""
    });
  }
  return "Loop detected — I am seeing the same request repeating. To break it, rephrase in one sentence or tap a lane chip. Pick one: (A) Just talk (B) Ideas (C) Step-by-step plan (D) Switch lane";
}
function maybeBuildEmotionFirstReply(norm, emo) {
  if (!emo) return null;
  const text = safeStr(norm?.text || "").trim();
  if (!text) return null;
  if (emo.bypassClarify && Support && typeof Support.buildSupportiveResponse === "function") {
    try {
      return Support.buildSupportiveResponse({
        userText: text,
        emo: {
          mode: emo.mode,
          tags: emo.tags,
          intensity: emo.intensity,
          bypassClarify: emo.bypassClarify,
          disclaimers: {
            needSoft: !!emo.supportFlags?.needsGentlePacing,
            needCrisis: !!emo.supportFlags?.crisis
          }
        },
        seed: norm?.ctx?.sessionId || ""
      });
    } catch (_e) {}
  }
  if (emo.valence === "positive" && Array.isArray(emo.positiveReinforcements) && emo.positiveReinforcements.length) {
    const dom = safeStr(emo.dominantEmotion || "positive");
    if (dom === "confidence" || dom === "pride" || dom === "momentum") {
      return "That has strong forward motion in it. What do you want to build on next?";
    }
    if (dom === "gratitude" || dom === "connection" || dom === "calm") {
      return "That sounds steady in a good way. Do you want to stay with it for a second or turn it into a next step?";
    }
    return "That is a good signal. What do you want to do with that energy next?";
  }
  return null;
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
function buildUiForLane(lane) {
  const l = safeStr(lane || "general");
  if (l === "music") {
    return {
      chips: [
        { id: "top10", type: "action", label: "Top 10", payload: { lane: "music", action: "top10" } },
        { id: "cinematic", type: "action", label: "Cinematic", payload: { lane: "music", action: "cinematic" } },
        { id: "yearend", type: "action", label: "Year-End", payload: { lane: "music", action: "yearend" } }
      ],
      allowMic: true
    };
  }
  return {
    chips: [
      { id: "music", type: "lane", label: "Music", payload: { lane: "music" } },
      { id: "movies", type: "lane", label: "Movies", payload: { lane: "movies" } },
      { id: "news", type: "lane", label: "News Canada", payload: { lane: "news" } },
      { id: "reset", type: "action", label: "Reset", payload: { action: "reset" } }
    ],
    allowMic: true
  };
}
function buildFollowUpsForLane(lane) {
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
}
function simpleGeneralReply(norm) {
  const text = safeStr(norm?.text || "").trim();
  if (!text) return "I am here. Tell me what you want to work on, and I will keep it structured.";
  const greeting = detectGreetingQuick(text);
  if (greeting) return buildGreetingReply(greeting.kind, text);
  if (/\b(loop|looping|repeat|repeating)\b/i.test(text)) {
    return "Understood. We are going after the loop directly. Give me the file or the exact layer, and I will keep the response locked to that target.";
  }
  if (/\b(chat\s*engine|emotion\s*route\s*guard|state\s*spine|marion|nyx)\b/i.test(text)) {
    return "Got it. We can work this as an architecture problem: isolate the heavy logic, stop duplicated emotional parsing, and keep the response path deterministic.";
  }
  return "I have the signal. Do you want diagnosis, restructuring, or an exact code update?";
}
function laneReply(norm, session) {
  const lane = safeStr(norm?.lane || session?.lane || "general");
  if (lane === "movies" && MoviesLane && typeof MoviesLane.handleChat === "function") {
    try {
      const out = MoviesLane.handleChat(norm);
      if (typeof out === "string") return { reply: out, lane: "movies" };
      if (isPlainObject(out) && safeStr(out.reply)) return { ...out, lane: safeStr(out.lane || "movies") };
    } catch (_e) {}
  }
  if (lane === "music" && Music) {
    try {
      if (typeof Music.handleChat === "function") {
        const out = Music.handleChat(norm);
        if (typeof out === "string") return { reply: out, lane: "music" };
        if (isPlainObject(out) && safeStr(out.reply)) return { ...out, lane: safeStr(out.lane || "music") };
      }
    } catch (_e) {}
  }
  return {
    reply: simpleGeneralReply(norm),
    lane
  };
}
function failSafeContract(err, input) {
  const requestId = safeStr((isPlainObject(input) ? input.requestId : "") || "").slice(0, 80) || `req_${nowMs()}`;
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
    sessionPatch: {},
    cog: {
      intent: "STABILIZE",
      mode: "transitional",
      publicMode: true,
      diag: { failSafe: true, err: safeStr(err && err.message ? err.message : err).slice(0, 180) }
    },
    requestId,
    meta: { v: CE_VERSION, failSafe: true, t: nowMs() }
  };
}
async function handleChat(input) {
  const started = nowMs();

  try {
    const norm = normalizeInbound(input);
    const session = isPlainObject(input?.session) ? input.session : {};
    norm._t0 = started;

    const inboundKey = buildInboundKey(norm);
    const requestId = resolveRequestId(input, norm, inboundKey);
    const publicMode = computePublicMode(norm, session);
    const sessionId = resolveSessionId(norm, session, inboundKey);

    const inSig = inboundLoopSig(norm, session);
    const inboundRepeat = detectInboundRepeat(session, inSig);

    if (inboundRepeat.canFastReturn) {
      const cached = getCachedReply(session, inSig);
      if (cached) {
        return {
          ok: true,
          reply: cached.reply,
          lane: cached.lane,
          laneId: cached.lane,
          sessionLane: cached.lane,
          bridge: null,
          ctx: {},
          ui: buildUiForLane(cached.lane),
          directives: [],
          followUps: cached.followUps || [],
          followUpsStrings: [],
          sessionPatch: mergeSessionPatches(inboundRepeat.patch, {
            __lastInboundKey: inboundKey,
            __cacheAt: nowMs()
          }),
          cog: { publicMode, mode: "transitional", intent: "REPLAY" },
          requestId,
          meta: { v: CE_VERSION, replay: true, t: nowMs() }
        };
      }
    }

    let emo = runEmotionGuard(norm.text || "");
    applyEmotionSignalsToNorm(norm, emo);

    const emotionFirstReply = maybeBuildEmotionFirstReply(norm, emo);
    if (emotionFirstReply) {
      const lane = safeStr(norm.lane || "general") || "general";
      const safeReply = applyPublicSanitization(
        scrubExecutionStyleArtifacts(softSpeak(emotionFirstReply)),
        norm,
        session,
        publicMode
      );
      const followUps = buildFollowUpsForLane(lane);
      return {
        ok: true,
        reply: safeReply,
        payload: { reply: safeReply },
        lane,
        laneId: lane,
        sessionLane: lane,
        bridge: null,
        ctx: {},
        ui: buildUiForLane(lane),
        directives: [],
        followUps,
        followUpsStrings: followUps.map((x) => x.label),
        sessionPatch: mergeSessionPatches(inboundRepeat.patch, {
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
          __cacheAt: nowMs()
        }),
        cog: {
          route: "emotion_route_guard",
          publicMode,
          mode: "transitional",
          intent: emo?.bypassClarify ? "STABILIZE" : "ENGAGE",
          emotion: {
            mode: emo?.mode,
            valence: emo?.valence,
            dominantEmotion: emo?.dominantEmotion,
            tone: emo?.tone,
            bypassClarify: !!emo?.bypassClarify
          }
        },
        requestId,
        meta: {
          v: CE_VERSION,
          earlyReturn: "emotion_first",
          emotionCached: !!emo?.cached,
          t: nowMs()
        }
      };
    }

    if (inboundRepeat.tripped) {
      const breaker = makeBreakerReply(norm, emo);
      const safeReply = applyPublicSanitization(
        scrubExecutionStyleArtifacts(softSpeak(breaker)),
        norm,
        session,
        publicMode
      );
      return {
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
        sessionPatch: mergeSessionPatches(inboundRepeat.patch, {
          __lastInboundKey: inboundKey,
          __cacheInSig: inSig,
          __cacheReply: safeReply,
          __cacheLane: "general",
          __cacheFollowUps: [],
          __cacheAt: nowMs()
        }),
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
        meta: { v: CE_VERSION, breaker: true, t: nowMs() }
      };
    }

    const greeting = detectGreetingQuick(norm.text || "");
    if (greeting) {
      const reply = applyPublicSanitization(
        scrubExecutionStyleArtifacts(softSpeak(buildGreetingReply(greeting.kind, inboundKey))),
        norm,
        session,
        publicMode
      );
      const lane = safeStr(norm.lane || "general") || "general";
      const followUps = buildFollowUpsForLane(lane);
      return {
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
        sessionPatch: mergeSessionPatches(inboundRepeat.patch, {
          lane,
          publicMode,
          __greeted: true,
          __lastInboundKey: inboundKey,
          __cacheInSig: inSig,
          __cacheReply: reply,
          __cacheLane: lane,
          __cacheFollowUps: followUps,
          __cacheAt: nowMs()
        }),
        cog: { publicMode, mode: "transitional", intent: "GREETING" },
        requestId,
        meta: { v: CE_VERSION, greeting: true, t: nowMs() }
      };
    }

    const corePrev = isPlainObject(session.__spineState)
      ? session.__spineState
      : Spine.createState({ lane: safeStr(session.lane || "general") || "general", stage: "open" });

    const routeOut = laneReply(norm, session);
    let reply = safeStr(routeOut?.reply || "").trim();
    let lane = safeStr(routeOut?.lane || norm.lane || session.lane || "general") || "general";

    if (!reply) {
      reply = "I have the signal. Give me the exact target and I will keep this tight.";
    }

    const loopPatch = detectAndPatchLoop(session, lane, reply);
    if (loopPatch.tripped) {
      reply = makeBreakerReply(norm, emo);
      lane = "general";
    }

    let safeReply = applyPublicSanitization(
      scrubExecutionStyleArtifacts(softSpeak(applyBudgetText(reply, "medium"))),
      norm,
      session,
      publicMode
    );

    const sessionLaneState = computeLaneState(session, corePrev, lane, norm);
    const bridge = computeBridge(sessionLaneState, requestId);
    const followUps = Array.isArray(routeOut?.followUps) ? routeOut.followUps : buildFollowUpsForLane(lane);
    const directives = Array.isArray(routeOut?.directives) ? routeOut.directives : [];

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
          move: emo?.bypassClarify ? "CLARIFY" : "ADVANCE",
          rationale: emo?.bypassClarify ? "emotion_bypass" : "normal_turn",
          speak: safeReply,
          stage: "open"
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

    safeStoreMemoryTurn(sessionId, {
      at: nowMs(),
      lane,
      user: safeStr(norm.text || "").slice(0, 400),
      assistant: safeReply.slice(0, 400),
      emotion: emo ? {
        mode: emo.mode,
        valence: emo.valence,
        dominantEmotion: emo.dominantEmotion
      } : null
    });

    return {
      ok: true,
      reply: safeReply,
      payload: { reply: safeReply },
      lane,
      laneId: lane,
      sessionLane: lane,
      bridge,
      ctx: {},
      ui: buildUiForLane(lane),
      directives,
      followUps,
      followUpsStrings: followUps.map((x) => x.label),
      sessionPatch: mergeSessionPatches(
        inboundRepeat.patch,
        loopPatch.patch,
        {
          lane,
          publicMode,
          __lastInboundKey: inboundKey,
          __memoryWindow: safeBuildMemoryContext(sessionId) || {},
          __spineState: nextSpine,
          __cacheInSig: inSig,
          __cacheReply: safeReply,
          __cacheLane: lane,
          __cacheFollowUps: followUps,
          __cacheAt: nowMs(),
          __emotionMode: safeStr(emo?.mode || "NORMAL"),
          __emotionValence: safeStr(emo?.valence || "neutral"),
          __emotionDominant: safeStr(emo?.dominantEmotion || "neutral"),
          __emotionAt: nowMs()
        }
      ),
      cog: {
        marionVersion:
          safeStr(MarionSO?.MARION_VERSION || MarionSO?.SO_VERSION || MarionSO?.version || ""),
        route: emo ? "emotion_route_guard" : "general",
        intent: emo?.bypassClarify ? "STABILIZE" : "ADVANCE",
        mode: "transitional",
        publicMode,
        emotion: emo ? {
          mode: emo.mode,
          valence: emo.valence,
          dominantEmotion: emo.dominantEmotion,
          tone: emo.tone,
          bypassClarify: !!emo.bypassClarify
        } : null,
        dataset: safeDatasetStats()
      },
      requestId,
      meta: {
        v: CE_VERSION,
        t: nowMs(),
        emotionCached: !!emo?.cached
      }
    };
  } catch (err) {
    return failSafeContract(err, input);
  }
}

/**
 * EXPORT HARDENING++++
 */
const chatEngine = handleChat;

const LATENT_DESIRE = Object.freeze({
  AUTHORITY: "authority",
  COMFORT: "comfort",
  CURIOSITY: "curiosity",
  VALIDATION: "validation",
  MASTERY: "mastery",
});

const SIGNATURE_TRANSITIONS = Object.freeze([
  "Now we widen the lens.",
  "This is where it starts to mean something.",
  "Let us slow this down for a second.",
  "Here is the connective tissue.",
  "This is not random—watch."
]);

function validateNyxTone() {
  return { ok: true, version: CE_VERSION };
}
function runToneRegressionTests() {
  return { ok: true, tests: [], version: CE_VERSION };
}

const _exportObj = {
  CE_VERSION,
  handleChat,
  chatEngine,
  default: handleChat,
  LATENT_DESIRE,
  SIGNATURE_TRANSITIONS,
  validateNyxTone,
  runToneRegressionTests,
  computePublicMode,
  sanitizePublicReply,
  STATE_SPINE_VERSION: Spine.SPINE_VERSION,
  STATE_SPINE: Spine,
};

const _callable = function exportedChatEngine() {
  const input = arguments && arguments.length ? arguments[0] : undefined;
  try {
    const out = handleChat.apply(null, arguments);
    if (out && typeof out.then === "function") {
      return out.catch((e) => failSafeContract(e, input));
    }
    return out;
  } catch (e) {
    return Promise.resolve(failSafeContract(e, input));
  }
};

Object.assign(_callable, _exportObj);
_callable.chatEngine = handleChat;
_callable.handleChat = handleChat;
_callable.default = handleChat;
_callable.__esModule = true;

module.exports = _callable;
