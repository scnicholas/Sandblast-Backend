"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v1.5.17zk
 * (CORS HARD-LOCK + TURN-CACHE DEDUPE + POSTURE CONTROL PLANE + CANONICAL ROKU BRIDGE INJECTION +
 *  ✅ SESSIONPATCH EXPANDED (CONTINUITY PERSIST FIX) + ✅ CONVERSATIONAL CONTRACT ENFORCER (HARD) +
 *  ✅ ROUTE HINT AWARE COG NORMALIZATION + ✅ ENV KNOBS HARDENED +
 *  ✅ TRUST PROXY (SAFE, OPTIONAL) + ✅ ROOT/API DISCOVERY ROUTES +
 *  ✅ ROKU BRIDGE DIRECTIVE (STRUCTURED CTA) + ✅ CTA COOLDOWN + SESSION TELEMETRY +
 *  ✅ CORS PREFLIGHT FIX (TTS) + ✅ SANDBLAST ORIGIN FORCE-ALLOW +
 *  ✅ COS PERSISTENCE WIRING (session.cog allowlist + sanitize + normalizeCog reads session.cog) +
 *  ✅ DIRECTIVES HARDENING (sanitize objects + clamp) + ✅ NO DUPLICATE bridge_roku +
 *  ✅ TTS JSON-PARSE RECOVERY (NO_TEXT / raw string payloads) +
 *  ✅ INTRO FALLBACK GUARD (only when chatEngine missing/fails + greeting) +
 *  ✅ FALLBACK INTRO RANDOMIZER (per session; non-rigid; brand-aligned) +
 *  ✅ LOOP FUSE v2.1 (input-signature dedupe tuned: ignore first dup; clamp repeats; quiet payload on runaway) +
 *  ✅ FIX: SESSION_TTL_MS clamp (was forcing 10h min unintentionally) +
 *  ✅ NEW: CHATENGINE VISIBILITY HEADERS (X-Nyx-ChatEngine / X-Nyx-Engine-Meta / X-Nyx-Intro) +
 *  ✅ NEW: INTRO RESET GAP (treat long pause as fresh entry when sessionId is auto-derived) +
 *  ✅ NEW: SERVER TURN COUNTER (session.turns / lastTurnAt) to stabilize “first turn” semantics +
 *  ✅ CRITICAL: CORE ENGINE WIRING (soft-load Nyx core brain + pass as input.engine so conversational layers fire) +
 *  ✅ CRITICAL: BOOT-INTRO BRIDGE (empty “panel open” pings can trigger intro ONCE without consuming loop fuse) +
 *  ✅ CRITICAL: AVOID DOUBLE TURN-COUNT (do not pre-increment turns before chatEngine; let chatEngine own it) +
 *  ✅ CRITICAL: CONTRACT COMPLETENESS (return lane/ctx/ui + BOTH followUps objects AND followUpsStrings)
 *
 * Patch vs v1.5.17zj:
 *  ✅ CONTRACT: include out.lane/out.ctx/out.ui/out.mode/out.year, plus followUps (objects) + followUpsStrings (strings)
 *  ✅ FOLLOWUPS: sanitize + dedupe; never collapse objects into strings-only (prevents “lists/chips not firing”)
 *  ✅ LOOP FUSE: first duplicate within window is ignored (prevents accidental double-send looking like a “loop”)
 * )
 */

const express = require("express");
const crypto = require("crypto");
// const cors = require("cors"); // kept optional; we now do explicit CORS to avoid preflight edge cases

/* ======================================================
   Hard crash visibility (Render 502 killer)
====================================================== */

process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException:", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (err) => {
  console.error("[FATAL] unhandledRejection:", err && err.stack ? err.stack : err);
});

/* ======================================================
   Optional modules (soft-load)
====================================================== */

let shadowBrain = null;
let chatEngine = null;
let ttsModule = null;

// ✅ soft-load a “core engine” so chatEngine wrapper can actually fire conversational layers
let nyxCore = null;

try {
  shadowBrain = require("./Utils/shadowBrain");
} catch (_) {
  shadowBrain = null;
}
try {
  chatEngine = require("./Utils/chatEngine");
} catch (_) {
  chatEngine = null;
}

// Attempt common “core brain” module names.
// If any exists, we pass it as `input.engine` into chatEngine.handleChat().
function safeRequire(path) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path);
  } catch (_) {
    return null;
  }
}

nyxCore =
  safeRequire("./Utils/nyxCore") ||
  safeRequire("./Utils/nyxBrain") ||
  safeRequire("./Utils/nyxRouter") ||
  safeRequire("./Utils/nyxEngine") ||
  safeRequire("./Utils/coreEngine") ||
  safeRequire("./Utils/brain") ||
  null;

function pickCoreEngine(mod) {
  if (!mod) return null;

  // Prefer explicit function exports
  if (typeof mod === "function") return mod;

  // Common shapes
  if (typeof mod.engine === "function") return mod.engine;
  if (typeof mod.core === "function") return mod.core;
  if (typeof mod.run === "function") return mod.run;
  if (typeof mod.handle === "function") return mod.handle;

  // Default export
  if (mod.default && typeof mod.default === "function") return mod.default;

  return null;
}

const NYX_CORE_ENGINE = pickCoreEngine(nyxCore);

if (NYX_CORE_ENGINE) {
  console.log("[nyxCore] loaded (soft). engine=function");
} else if (nyxCore) {
  console.log(
    "[nyxCore] loaded (soft). but no callable engine export found. keys=",
    Object.keys(nyxCore || {})
  );
} else {
  console.log("[nyxCore] not found (soft). chatEngine may fall back unless it has internal packs.");
}

const app = express();
app.disable("x-powered-by");

/* ======================================================
   Trust proxy (optional; recommended behind Render/CF)
====================================================== */

const TRUST_PROXY = String(process.env.TRUST_PROXY || "true") === "true";
if (TRUST_PROXY) {
  // 1 = trust first proxy hop (typical for Render)
  app.set("trust proxy", 1);
}

/* ======================================================
   Version + Contract
====================================================== */

const NYX_CONTRACT_VERSION = "1";
const INDEX_VERSION =
  "index.js v1.5.17zk (CORS HARD-LOCK + TURN-CACHE DEDUPE + POSTURE CONTROL PLANE + CANONICAL ROKU BRIDGE INJECTION + SESSIONPATCH EXPANDED + CONTRACT ENFORCER + ROUTE HINT COG + ENV HARDENED + TRUST PROXY + DISCOVERY ROUTES + ROKU DIRECTIVE + CORS PREFLIGHT FIX + COS PERSISTENCE + DIRECTIVES HARDENING + NO DUPLICATE bridge_roku + TTS JSON-PARSE RECOVERY + INTRO FALLBACK GUARD + FALLBACK INTRO RANDOMIZER + LOOP FUSE v2.1 + TTL CLAMP FIX + CHATENGINE VISIBILITY HEADERS + INTRO RESET GAP + SERVER TURN COUNTER + CORE ENGINE WIRING + BOOT-INTRO BRIDGE + AVOID DOUBLE TURN-COUNT + CONTRACT COMPLETENESS: lane/ctx/ui + followUps objects+strings)";

const GIT_COMMIT =
  String(process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "").trim() || null;

/* ======================================================
   Helpers
====================================================== */

function rid() {
  return crypto.randomBytes(8).toString("hex");
}
function nowIso() {
  return new Date().toISOString();
}
function normalizeStr(x) {
  return String(x == null ? "" : x).trim();
}
function safeSet(res, k, v) {
  try {
    res.set(k, v);
  } catch (_) {}
}
function safeAppendHeader(res, name, value) {
  try {
    const prev = res.getHeader(name);
    if (!prev) {
      res.setHeader(name, value);
      return;
    }
    const prevStr = Array.isArray(prev) ? prev.join(",") : String(prev);
    const parts = prevStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const want = String(value).trim();
    if (!want) return;
    if (!parts.includes(want)) parts.push(want);
    res.setHeader(name, parts.join(", "));
  } catch (_) {}
}
function setContractHeaders(res, requestId) {
  safeSet(res, "X-Request-Id", requestId);
  safeSet(res, "X-Contract-Version", NYX_CONTRACT_VERSION);
  safeSet(res, "Cache-Control", "no-store");
}
function safeJson(res, status, obj) {
  try {
    return res.status(status).json(obj);
  } catch (e) {
    try {
      return res
        .status(status)
        .type("text/plain")
        .send(typeof obj === "string" ? obj : JSON.stringify(obj));
    } catch (_) {}
  }
}
function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}
function normCmd(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}
function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}
function ua(req) {
  return normalizeStr(req.get("user-agent") || "");
}

/* ======================================================
   ChatEngine visibility headers (prove which file is live)
====================================================== */

function getChatEngineVersion(mod) {
  try {
    if (!mod) return null;
    if (typeof mod.CE_VERSION === "string" && mod.CE_VERSION.trim()) return mod.CE_VERSION.trim();
    if (mod.default && typeof mod.default.CE_VERSION === "string" && mod.default.CE_VERSION.trim())
      return mod.default.CE_VERSION.trim();
    // Some builds export { chatEngine: fn, CE_VERSION } or { handleChat, CE_VERSION }
    if (mod.chatEngine && typeof mod.chatEngine === "function" && typeof mod.CE_VERSION === "string")
      return mod.CE_VERSION.trim();
    return null;
  } catch (_) {
    return null;
  }
}

function applyChatEngineHeaders(res, out) {
  try {
    const ce = getChatEngineVersion(chatEngine);
    safeSet(res, "X-Nyx-ChatEngine", ce ? String(ce).slice(0, 180) : "missing_CE_VERSION");

    if (out && out.meta && out.meta.engine) {
      safeSet(res, "X-Nyx-Engine-Meta", String(out.meta.engine).slice(0, 180));
    }
    if (out && out.meta && out.meta.intro) {
      safeSet(res, "X-Nyx-Intro", "1");
    }
  } catch (_) {}
}

/* ======================================================
   Intro Fallback Guard (additive; only used when chatEngine is missing/fails)
====================================================== */

function isGreetingText(text) {
  const t = normCmd(text || "");
  if (!t) return true;
  return /^(hi|hey|hello|yo|hiya|good morning|good afternoon|good evening|sup|what's up|whats up)\b/.test(
    t
  );
}

/**
 * FALLBACK INTRO RANDOMIZER (per session):
 * - Only used when chatEngine missing/fails AND greeting AND intro not done.
 * - Stable per session (no re-random every message).
 * - Keeps the brand: continuity, calm intelligence, Roku bridge as optional posture shift.
 */
const INTRO_FALLBACK_BANK = [
  "Hi — I’m Nyx.\n\nPick a year from 1950–2024 and I’ll give you something worth remembering.\nTry: “top 10 1988”, “#1 1964”, “story moment 1977”, “micro moment 1999”.\n\nOr tell me what kind of mood you’re in, and I’ll steer.",
  "Welcome back to Sandblast.\n\nGive me a year (1950–2024) and choose a lane: “top 10”, “#1”, “story moment”, or “micro moment”.\nExample: “story moment 1969”.\n\nIf you want the big-screen posture, say “Roku”.",
  "Hey — Nyx here.\n\nYou can drive this two ways:\n1) Year-first: “top 10 1988”\n2) Feeling-first: “something calm and nostalgic”\n\nI’ll translate either into a good next step.",
  "Hi. We do nostalgia with precision here.\n\nDrop a year (1950–2024), then pick: Top 10, #1, Story moment, Micro moment.\nExample: “micro moment 1983”.\n\nIf you’d rather watch than chat, just say “Roku”.",
  "Welcome.\n\nTell me a year (1950–2024) and I’ll make it feel alive again.\nExamples: “top 10 1975”, “#1 1992”, “story moment 1957”.\n\nYour pace. I’ll keep it coherent.",
];

function pickFallbackIntroForSession(session) {
  // stable per session; no churn; no repeated “rigid intro”
  const n = INTRO_FALLBACK_BANK.length || 1;
  const existing = Number(session && session.introId);
  if (Number.isFinite(existing) && existing >= 0 && existing < n) {
    return { id: existing, text: INTRO_FALLBACK_BANK[existing] };
  }
  // derive from sessionId if present; otherwise randomBytes as last resort
  const sid = normalizeStr(session && session.sessionId ? session.sessionId : "");
  const seed = sid ? sha256(sid).slice(0, 8) : crypto.randomBytes(4).toString("hex");
  const idx = parseInt(seed, 16) % n;
  if (session) session.introId = idx;
  return { id: idx, text: INTRO_FALLBACK_BANK[idx] };
}

/* ======================================================
   COS (Cognitive OS) sanitizer (session.cog persistence)
====================================================== */

const COG_ALLOW_KEYS = new Set([
  "phase",
  "state",
  "reason",
  "intent",
  "depth",
  "nextStep",
  "lastShiftAt",
  "version",
  "lane",
  "mode",
  "year",
  "ts",
]);

function sanitizeCogObject(obj) {
  if (!obj || typeof obj !== "object") return null;

  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (!COG_ALLOW_KEYS.has(k)) continue;
    if (typeof v === "undefined") continue;

    if (k === "nextStep") {
      const s = normalizeStr(v).slice(0, 600);
      if (s) out[k] = s;
      continue;
    }

    if (
      k === "phase" ||
      k === "state" ||
      k === "reason" ||
      k === "intent" ||
      k === "depth" ||
      k === "version" ||
      k === "lane" ||
      k === "mode" ||
      k === "year"
    ) {
      const s = normalizeStr(v).slice(0, 96);
      if (s) out[k] = s;
      continue;
    }

    if (k === "lastShiftAt" || k === "ts") {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
      continue;
    }

    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }

  return Object.keys(out).length ? out : null;
}

/* ======================================================
   Conversational Contract Enforcer (HARD)
====================================================== */

const LANES = new Set(["general", "music", "roku", "schedule", "radio", "sponsors", "movies"]);

function normalizeRouteHint(h) {
  const t = normCmd(h || "");
  if (!t) return null;

  if (t === "years" || t === "year_pick" || t === "pick a year") return "music";
  if (t === "tv") return "roku";
  return t;
}

function normalizeLane(lane, fallback) {
  const l = normCmd(lane || "") || normCmd(fallback || "") || "general";
  if (LANES.has(l)) return l;
  return "general";
}

function nonEmptyReply(s, fallback) {
  const r = normalizeStr(s);
  if (r) return r;
  const fb = normalizeStr(fallback);
  return fb || "Okay — I’m here. Tell me what you want next.";
}

/* ======================================================
   Directive hardening + de-dupe
====================================================== */

const DIRECTIVE_MAX = clamp(process.env.DIRECTIVE_MAX || 6, 1, 12);
const DIRECTIVE_KEY_MAX = clamp(process.env.DIRECTIVE_KEY_MAX || 24, 8, 64);
const DIRECTIVE_STR_MAX = clamp(process.env.DIRECTIVE_STR_MAX || 800, 80, 2000);
const DIRECTIVE_TYPE_MAX = clamp(process.env.DIRECTIVE_TYPE_MAX || 48, 16, 96);

function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)
  );
}

function shallowSanitizeDirectiveObj(obj) {
  if (!isPlainObject(obj)) return null;
  const out = {};
  let keys = 0;

  for (const [k, v] of Object.entries(obj)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    keys++;
    if (keys > DIRECTIVE_KEY_MAX) break;

    if (typeof v === "undefined") continue;

    if (typeof v === "string") {
      const s = normalizeStr(v).slice(0, DIRECTIVE_STR_MAX);
      if (s) out[k] = s;
      continue;
    }

    if (typeof v === "number") {
      if (Number.isFinite(v)) out[k] = v;
      continue;
    }

    if (typeof v === "boolean" || v === null) {
      out[k] = v;
      continue;
    }
  }

  if (!out.type) return null;
  out.type = normalizeStr(out.type).slice(0, DIRECTIVE_TYPE_MAX);
  if (!out.type) return null;

  if (out.label) out.label = normalizeStr(out.label).slice(0, 160);
  if (out.url) out.url = normalizeStr(out.url).slice(0, 900);
  if (out.fallbackUrl) out.fallbackUrl = normalizeStr(out.fallbackUrl).slice(0, 900);
  if (out.deeplink) out.deeplink = normalizeStr(out.deeplink).slice(0, 900);
  if (out.reason) out.reason = normalizeStr(out.reason).slice(0, 160);

  return out;
}

function normalizeDirectives(d) {
  if (!Array.isArray(d)) return [];
  const out = [];
  for (const it of d) {
    if (!it) continue;

    if (typeof it === "string") {
      const t = normalizeStr(it).slice(0, DIRECTIVE_TYPE_MAX);
      if (t) out.push({ type: t });
    } else if (isPlainObject(it) && typeof it.type === "string" && it.type.trim()) {
      const san = shallowSanitizeDirectiveObj(it);
      if (san) out.push(san);
    }

    if (out.length >= DIRECTIVE_MAX) break;
  }
  return out;
}

function dedupeDirectives(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const out = [];
  const seen = new Set();
  for (const d of list) {
    if (!d || typeof d !== "object") continue;
    const t = normalizeStr(d.type || "");
    if (!t) continue;
    const u = normalizeStr(d.url || d.deeplink || d.fallbackUrl || "");
    const key = (t + "::" + u).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
    if (out.length >= DIRECTIVE_MAX) break;
  }
  return out;
}

/* ======================================================
   FollowUps normalization (CRITICAL: keep objects + keep strings)
====================================================== */

const FOLLOWUPS_MAX = clamp(process.env.FOLLOWUPS_MAX || 12, 3, 24);
const FOLLOWUP_LABEL_MAX = clamp(process.env.FOLLOWUP_LABEL_MAX || 64, 16, 120);
const FOLLOWUP_TEXT_MAX = clamp(process.env.FOLLOWUP_TEXT_MAX || 140, 32, 240);
const FOLLOWUP_ID_MAX = clamp(process.env.FOLLOWUP_ID_MAX || 40, 16, 80);
const FOLLOWUP_TYPE_MAX = clamp(process.env.FOLLOWUP_TYPE_MAX || 32, 12, 60);

function sanitizeFollowUpObj(item) {
  if (!item || typeof item !== "object") return null;

  const id = normalizeStr(item.id || "").slice(0, FOLLOWUP_ID_MAX);
  const type = normalizeStr(item.type || "").slice(0, FOLLOWUP_TYPE_MAX) || "chip";
  const label = normalizeStr(item.label || "").slice(0, FOLLOWUP_LABEL_MAX);

  let sendText = "";
  if (item.payload && typeof item.payload === "object") {
    sendText = normalizeStr(item.payload.text || "");
  }
  if (!sendText) sendText = normalizeStr(item.send || "");
  if (!sendText && label) sendText = label;

  sendText = normalizeStr(sendText).slice(0, FOLLOWUP_TEXT_MAX);
  if (!sendText) return null;

  const out = {
    id: id || sha256(type + ":" + sendText).slice(0, 10),
    type,
    label: label || sendText,
    payload: { text: sendText },
  };

  return out;
}

function normalizeFollowUpsObjects(followUps) {
  if (!Array.isArray(followUps) || followUps.length === 0) return undefined;
  const out = [];
  const seen = new Set();

  for (const item of followUps) {
    let obj = null;

    if (typeof item === "string") {
      const s = normalizeStr(item).slice(0, FOLLOWUP_TEXT_MAX);
      if (!s) continue;
      obj = {
        id: sha256("s:" + s).slice(0, 10),
        type: "chip",
        label: s.slice(0, FOLLOWUP_LABEL_MAX),
        payload: { text: s },
      };
    } else {
      obj = sanitizeFollowUpObj(item);
    }

    if (!obj) continue;
    const k = normCmd(obj.payload && obj.payload.text ? obj.payload.text : obj.label || "");
    if (!k || seen.has(k)) continue;
    seen.add(k);

    out.push(obj);
    if (out.length >= FOLLOWUPS_MAX) break;
  }

  return out.length ? out : undefined;
}

function normalizeFollowUpsStrings(followUps) {
  if (!Array.isArray(followUps) || followUps.length === 0) return undefined;
  const seen = new Set();
  const out = [];

  for (const item of followUps) {
    let send = "";

    if (typeof item === "string") {
      send = item;
    } else if (item && typeof item === "object") {
      const pt =
        item.payload && typeof item.payload === "object" ? normalizeStr(item.payload.text || "") : "";
      send = pt || normalizeStr(item.send || "");
      if (!send) send = normalizeStr(item.label || "");
    }

    send = normalizeStr(send).slice(0, FOLLOWUP_TEXT_MAX);
    const k = normCmd(send);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(send);

    if (out.length >= FOLLOWUPS_MAX) break;
  }

  return out.length ? out : undefined;
}

/* ======================================================
   Session patch allowlist
====================================================== */

const SERVER_OWNED_KEYS = new Set([
  "__lastBridgeAt",
  "__bridgeIdx",
  "__lastPosture",
  "__lastRokuCtaAt",
  "__rokuCtaCount",
  "__loopSigAt",
  "__loopSig",
  "__loopCount",
]);

const SESSION_PATCH_ALLOW = new Set([
  // intro / continuity
  "introDone",
  "introAt",
  "introId",
  "introServed",
  "introVariant",

  "lastInText",
  "lastInAt",
  "lastOut",
  "lastOutAt",
  "lastOutSig",
  "lastOutSigAt",
  "turns",
  "turnCount",
  "startedAt",
  "lastTurnAt",
  "lanesVisited",
  "yearsVisited",
  "modesVisited",
  "lastLane",
  "lastYear",
  "lastMode",
  "lastFork",
  "depthLevel",
  "elasticToggle",
  "lastElasticAt",
  "lane",
  "pendingLane",
  "pendingMode",
  "pendingYear",
  "recentIntent",
  "recentTopic",
  "activeMusicMode",
  "activeMusicChart",
  "lastMusicChart",
  "__musicLastSig",
  "__musicLastAt",
  "lastMusicYear",
  "year",
  "mode",
  "depthPreference",
  "userName",
  "nameAskedAt",
  "lastOpenQuestion",
  "userGoal",
  "lastNameUseTurn",
  "visitorId",
  "voiceMode",

  "__lastIntentSig",
  "__lastIntentAt",
  "__lastReply",
  "__lastBodyHash",
  "__lastBodyAt",
  "__lastReplyHash",
  "__lastReplyAt",
  "__repAt",
  "__repCount",
  "__srAt",
  "__srCount",
  "__lastBridgeAt",
  "__bridgeIdx",
  "__lastPosture",

  "__cs1",

  "cog",

  // ✅ allow chatEngine “hasRealUserTurn” + intro marker if present
  "__introDone",
  "__hasRealUserTurn",
]);

function allowlistSessionPatchObj(patch) {
  if (!patch || typeof patch !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (!SESSION_PATCH_ALLOW.has(k)) continue;
    if (SERVER_OWNED_KEYS.has(k)) continue;
    if (typeof v === "undefined") continue;
    out[k] = v;
  }
  return out;
}

function applySessionPatch(session, patch) {
  if (!session || !patch || typeof patch !== "object") return;

  for (const [k, v] of Object.entries(patch)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (SERVER_OWNED_KEYS.has(k)) continue;
    if (!SESSION_PATCH_ALLOW.has(k)) continue;
    if (typeof v === "undefined") continue;

    if (k === "cog") {
      if (v === null) {
        session.cog = null;
        continue;
      }
      const sanitized = sanitizeCogObject(v);
      if (sanitized) session.cog = sanitized;
      continue;
    }

    session[k] = v;
  }
}

/* ======================================================
   Cog normalization
====================================================== */

function normalizeCog(out, session, routeHint) {
  const oc = out && typeof out === "object" && out.cog && typeof out.cog === "object" ? out.cog : {};
  const scRaw = session && session.cog && typeof session.cog === "object" ? session.cog : null;
  const sc = scRaw ? sanitizeCogObject(scRaw) || {} : {};

  const laneFromOut =
    (out && typeof out.lane === "string" ? out.lane : "") || (oc && oc.lane) || "";
  const laneFromSession =
    session && session.lane ? session.lane : session && session.lastLane ? session.lastLane : "";
  const laneFromHint = normalizeRouteHint(routeHint) || "";
  const laneFromCog = (oc && oc.lane) || (sc && sc.lane) || "";

  const lane = normalizeLane(laneFromOut, laneFromHint || laneFromCog || laneFromSession || "general");

  const mode =
    (out && typeof out.mode === "string" && out.mode.trim() ? out.mode : null) ||
    (oc && typeof oc.mode === "string" && oc.mode.trim() ? oc.mode : null) ||
    (sc && typeof sc.mode === "string" && sc.mode.trim() ? sc.mode : null) ||
    (session && typeof session.activeMusicMode === "string" && session.activeMusicMode.trim()
      ? session.activeMusicMode
      : null) ||
    (session && typeof session.lastMode === "string" && session.lastMode.trim() ? session.lastMode : null) ||
    null;

  const year =
    (out && out.year != null ? String(out.year) : null) ||
    (oc && oc.year != null ? String(oc.year) : null) ||
    (sc && sc.year != null ? String(sc.year) : null) ||
    (session && session.lastMusicYear != null ? String(session.lastMusicYear) : null) ||
    (session && session.lastYear != null ? String(session.lastYear) : null) ||
    null;

  const phase =
    (oc && typeof oc.phase === "string" && oc.phase.trim() ? oc.phase : null) ||
    (sc && typeof sc.phase === "string" && sc.phase.trim() ? sc.phase : null) ||
    "engaged";

  // ✅ state fallback must read sc.state (not sc.phase)
  const state =
    (oc && typeof oc.state === "string" && oc.state.trim() ? oc.state : null) ||
    (sc && typeof sc.state === "string" && sc.state.trim() ? sc.state : null) ||
    "confident";

  const reason =
    (oc && typeof oc.reason === "string" && oc.reason.trim() ? oc.reason : null) ||
    (sc && typeof sc.reason === "string" && sc.reason.trim() ? sc.reason : null) ||
    "ok";

  const version =
    (oc && typeof oc.version === "string" && oc.version.trim() ? oc.version : null) ||
    (sc && typeof sc.version === "string" && sc.version.trim() ? sc.version : null) ||
    "cos_v0";

  const nextStep =
    (oc && typeof oc.nextStep === "string" && oc.nextStep.trim() ? oc.nextStep : null) ||
    (sc && typeof sc.nextStep === "string" && sc.nextStep.trim() ? sc.nextStep : null) ||
    null;

  const depth =
    (oc && typeof oc.depth === "string" && oc.depth.trim() ? oc.depth : null) ||
    (sc && typeof sc.depth === "string" && sc.depth.trim() ? sc.depth : null) ||
    null;

  const intent =
    (oc && typeof oc.intent === "string" && oc.intent.trim() ? oc.intent : null) ||
    (sc && typeof sc.intent === "string" && sc.intent.trim() ? sc.intent : null) ||
    null;

  const lastShiftAt =
    (oc && Number.isFinite(Number(oc.lastShiftAt)) ? Number(oc.lastShiftAt) : null) ||
    (sc && Number.isFinite(Number(sc.lastShiftAt)) ? Number(sc.lastShiftAt) : null) ||
    null;

  return {
    lane,
    mode,
    year,
    phase,
    state,
    reason,
    version,
    depth,
    intent,
    nextStep,
    lastShiftAt,
    ts: Date.now(),
  };
}

function capsPayload() {
  return { music: true, movies: true, sponsors: true, schedule: true, tts: true, cos: true };
}

function enforceChatContract({
  out,
  session,
  routeHint,
  baseReply,
  requestId,
  sessionId,
  visitorId,
  posture,
  shadow,
  followUpsObjects,
  followUpsStrings,
  bridgeInjected,
  directivesOverride,
}) {
  const reply = nonEmptyReply(baseReply, "Alright — tell me what you want next.");

  const directivesRaw = directivesOverride
    ? normalizeDirectives(directivesOverride)
    : normalizeDirectives(out && out.directives);
  const directives = dedupeDirectives(directivesRaw);

  const sessionPatch = allowlistSessionPatchObj(out && out.sessionPatch) || {};
  const cog = normalizeCog(out, session, routeHint);

  const lane =
    out && typeof out === "object" && typeof out.lane === "string" && out.lane.trim()
      ? normCmd(out.lane)
      : cog && cog.lane
      ? cog.lane
      : "general";

  const payload = {
    ok: true,
    reply,
    lane,
    // ✅ carry through the full conversational envelope (some UI needs this)
    ctx: out && typeof out === "object" && out.ctx && typeof out.ctx === "object" ? out.ctx : undefined,
    ui: out && typeof out === "object" && out.ui && typeof out.ui === "object" ? out.ui : undefined,
    mode:
      out && typeof out === "object" && typeof out.mode === "string" && out.mode.trim()
        ? out.mode
        : cog && cog.mode
        ? cog.mode
        : undefined,
    year:
      out && typeof out === "object" && out.year != null
        ? out.year
        : cog && cog.year
        ? cog.year
        : undefined,

    sessionId,
    requestId,
    visitorId,
    contractVersion: NYX_CONTRACT_VERSION,
    serverBuild: INDEX_VERSION,
    caps: capsPayload(),
    posture,
    cog,
    sessionPatch,
    directives,
  };

  if (shadow) payload.shadow = shadow;

  // ✅ CRITICAL: keep followUps as objects AND provide strings legacy (chips/lists)
  if (followUpsObjects && Array.isArray(followUpsObjects) && followUpsObjects.length) {
    payload.followUps = followUpsObjects;
  }
  if (followUpsStrings && Array.isArray(followUpsStrings) && followUpsStrings.length) {
    payload.followUpsStrings = followUpsStrings;
  }

  if (bridgeInjected) payload._bridgeInjected = bridgeInjected;

  return payload;
}

/* ======================================================
   CORS (MUST RUN FIRST — preflight killer for TTS)
====================================================== */

const CORS_ALLOW_ALL = String(process.env.CORS_ALLOW_ALL || "false") === "true";

const FORCE_ORIGINS = [
  "https://sandblast.channel",
  "https://www.sandblast.channel",
  "https://sandblastchannel.com",
  "https://www.sandblastchannel.com",
];

const DEFAULT_ORIGINS = FORCE_ORIGINS.slice();

const ALLOWED_ORIGINS = normalizeStr(process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

const CORS_ENV_EXCLUSIVE = String(process.env.CORS_ENV_EXCLUSIVE || "false") === "true";

const EFFECTIVE_ORIGINS = (() => {
  if (ALLOWED_ORIGINS.length === 0) return DEFAULT_ORIGINS.slice();

  if (CORS_ENV_EXCLUSIVE) {
    const set = new Set(FORCE_ORIGINS);
    for (const o of ALLOWED_ORIGINS) set.add(o);
    return Array.from(set);
  }

  const set = new Set(DEFAULT_ORIGINS);
  for (const o of ALLOWED_ORIGINS) set.add(o);
  return Array.from(set);
})();

function originAllowed(origin) {
  if (!origin) return true;
  if (CORS_ALLOW_ALL) return true;

  const o = String(origin).trim().replace(/\/$/, "");

  if (EFFECTIVE_ORIGINS.includes(o)) return true;

  try {
    const u = new URL(o);
    const host = String(u.hostname || "");
    const altHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    const alt = `${u.protocol}//${altHost}${u.port ? `:${u.port}` : ""}`;
    if (EFFECTIVE_ORIGINS.includes(alt)) return true;

    const h = host.toLowerCase();
    if (h === "sandblast.channel" || h === "www.sandblast.channel") return true;
    if (h === "sandblastchannel.com" || h === "www.sandblastchannel.com") return true;
  } catch (_) {}

  return false;
}

const CORS_ALLOWED_HEADERS = [
  "Content-Type",
  "Accept",
  "Authorization",
  "X-Requested-With",
  "X-Visitor-Id",
  "X-Contract-Version",
  "X-Request-Id",
  "X-Voice-Mode",
  "X-Session-Id",
  "X-SBNYX-Client-Build",
  // ✅ audio/range friendliness
  "Range",
];

const CORS_EXPOSED_HEADERS = [
  "X-Request-Id",
  "X-Contract-Version",
  "X-Voice-Mode",
  "X-Nyx-Deduped",
  "X-Nyx-Upstream",
  "X-CORS-Origin-Seen",
  "X-Nyx-Posture",
  "X-Nyx-Bridge",
  "X-Nyx-Loop",
  // ✅ visibility headers
  "X-Nyx-ChatEngine",
  "X-Nyx-Engine-Meta",
  "X-Nyx-Intro",
  // ✅ audio/range friendliness
  "Accept-Ranges",
  "Content-Range",
  "Content-Length",
  "Content-Type",
];

const CORS_MAX_AGE = 86400;

function applyCors(req, res) {
  const origin = req.headers.origin ? String(req.headers.origin).trim() : "";

  safeAppendHeader(res, "Vary", "Origin");
  safeSet(res, "X-CORS-Origin-Seen", origin || "");

  if (origin && originAllowed(origin)) {
    safeSet(res, "Access-Control-Allow-Origin", origin);
    safeSet(res, "Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    safeSet(res, "Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS.join(","));
    safeSet(res, "Access-Control-Expose-Headers", CORS_EXPOSED_HEADERS.join(","));
    safeSet(res, "Access-Control-Max-Age", String(CORS_MAX_AGE));
  }
}

app.use((req, res, next) => {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    const requestId = req.get("X-Request-Id") || rid();
    setContractHeaders(res, requestId);
    // Visibility header still useful on preflight (helps confirm deploy)
    applyChatEngineHeaders(res, null);
    return res.sendStatus(204);
  }

  return next();
});

/* ======================================================
   Parsers (after CORS)
====================================================== */

function rawBodySaver(req, res, buf, encoding) {
  try {
    if (buf && buf.length) req.rawBody = buf.toString(encoding || "utf8");
  } catch (_) {}
}

app.use(express.json({ limit: "1mb", verify: rawBodySaver }));
app.use(express.text({ type: ["text/*"], limit: "1mb", verify: rawBodySaver }));

/* ======================================================
   JSON parse error handler
   ✅ PATCH: TTS/VOICE recovery for non-JSON bodies (NO_TEXT / raw string)
====================================================== */

function isJsonParseErr(err) {
  try {
    if (!err) return false;
    const t = String(err.type || "");
    if (t === "entity.parse.failed") return true;
    const msg = String(err.message || "");
    return /unexpected token|json|parse/i.test(msg);
  } catch (_) {
    return false;
  }
}

function isTtsOrVoicePath(req) {
  try {
    const p = String(req.path || req.url || "");
    return p === "/api/tts" || p === "/api/voice";
  } catch (_) {
    return false;
  }
}

app.use((err, req, res, next) => {
  if (!err) return next();

  if (isTtsOrVoicePath(req) && isJsonParseErr(err)) {
    const raw = normalizeStr(req.rawBody || "");
    const up = raw.toUpperCase();

    if (!raw || up === "NO_TEXT") {
      req.body = { NO_TEXT: true };
      return next();
    }

    try {
      const parsed = JSON.parse(raw);
      req.body = parsed;
      return next();
    } catch (_) {
      req.body = { text: raw };
      return next();
    }
  }

  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  applyChatEngineHeaders(res, null);

  return safeJson(res, 400, {
    ok: false,
    error: "BAD_REQUEST",
    detail: "INVALID_JSON",
    message: String(err.message || "JSON parse error"),
    requestId,
    contractVersion: NYX_CONTRACT_VERSION,
  });
});

/* ======================================================
   Timeout middleware
====================================================== */

const REQUEST_TIMEOUT_MS = clamp(process.env.REQUEST_TIMEOUT_MS || 30000, 10000, 60000);
app.use((req, res, next) => {
  try {
    res.setTimeout(REQUEST_TIMEOUT_MS);
  } catch (_) {}
  next();
});

/* ======================================================
   In-memory session store
====================================================== */

const MAX_SESSIONS = Math.max(0, Number(process.env.MAX_SESSIONS || 0));

/**
 * min 10 minutes, max 24 hours.
 */
const SESSION_TTL_MS = clamp(
  process.env.SESSION_TTL_MS || 6 * 60 * 60 * 1000,
  10 * 60 * 1000,
  24 * 60 * 60 * 1000
);

const SESSIONS = new Map();

function getClientIp(req) {
  const xr = normalizeStr(req.get("x-real-ip") || "");
  if (xr) return xr;

  const xf = normalizeStr(req.get("x-forwarded-for") || "");
  if (xf) return xf.split(",")[0].trim();

  const rip = normalizeStr(req.ip || "");
  if (rip) return rip;

  return normalizeStr(req.socket?.remoteAddress || "");
}

function fingerprint(req, visitorId) {
  const vid = normalizeStr(visitorId || "");
  if (vid) return `vid:${vid}`;
  const ip = getClientIp(req);
  return ip ? `ip:${ip}` : "anon";
}

const SESSION_ID_MAXLEN = clamp(process.env.SESSION_ID_MAXLEN || 96, 32, 256);
function cleanSessionId(sid) {
  const s = normalizeStr(sid || "");
  if (!s) return null;
  if (s.length <= SESSION_ID_MAXLEN) return s;
  return "sx_" + sha256(s).slice(0, 24);
}

function deriveStableSessionId(req, visitorId) {
  const fp = fingerprint(req, visitorId);
  const uastr = ua(req);
  return "auto_" + sha256(fp + "|" + uastr).slice(0, 24);
}

function getSessionId(req, body, visitorId) {
  const fromHeader = cleanSessionId(req.get("X-Session-Id"));
  const fromBody = body && typeof body === "object" ? cleanSessionId(body.sessionId) : null;
  return fromBody || fromHeader || deriveStableSessionId(req, visitorId);
}

function getVoiceMode(req, body) {
  const fromBody = body && typeof body === "object" ? normalizeStr(body.voiceMode || "") : "";
  const fromHeader = normalizeStr(req.get("X-Voice-Mode") || "");
  return fromBody || fromHeader || "";
}

function initSessionDefaults(s, now) {
  if (!s) return;
  if (!Number.isFinite(Number(s.startedAt || 0))) s.startedAt = now;
  if (!Number.isFinite(Number(s.turns))) s.turns = 0;
  if (!Number.isFinite(Number(s.turnCount))) s.turnCount = Number(s.turns) || 0;

  if (!Array.isArray(s.lanesVisited)) s.lanesVisited = [];
  if (!Array.isArray(s.yearsVisited)) s.yearsVisited = [];
  if (!Array.isArray(s.modesVisited)) s.modesVisited = [];

  if (!Number.isFinite(Number(s.lastTurnAt || 0))) s.lastTurnAt = 0;
}

function touchSession(sessionId, patch) {
  if (!sessionId) return null;

  const now = Date.now();
  let s = SESSIONS.get(sessionId);

  if (!s) {
    if (MAX_SESSIONS > 0 && SESSIONS.size >= MAX_SESSIONS) {
      let oldestKey = null;
      let oldestAt = Infinity;
      for (const [k, v] of SESSIONS.entries()) {
        if (v && v._touchedAt < oldestAt) {
          oldestAt = v._touchedAt;
          oldestKey = k;
        }
      }
      if (oldestKey) SESSIONS.delete(oldestKey);
    }
    s = { sessionId, _createdAt: now, _touchedAt: now };
    initSessionDefaults(s, now);
    SESSIONS.set(sessionId, s);
  }

  s._touchedAt = now;
  initSessionDefaults(s, now);
  if (patch && typeof patch === "object") applySessionPatch(s, patch);
  return s;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of SESSIONS.entries()) {
    const touched = Number(v?._touchedAt || v?._createdAt || 0);
    if (!touched || now - touched > SESSION_TTL_MS) SESSIONS.delete(k);
  }
}, 60_000).unref?.();

/* ======================================================
   Diagnostics + Discovery
====================================================== */

function healthPayload(requestId) {
  return {
    ok: true,
    service: "sandblast-backend",
    status: "healthy",
    ts: nowIso(),
    requestId,
    contractVersion: NYX_CONTRACT_VERSION,
  };
}

app.get("/", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  applyChatEngineHeaders(res, null);
  return safeJson(res, 200, {
    ok: true,
    service: "sandblast-backend",
    ts: nowIso(),
    requestId,
    contractVersion: NYX_CONTRACT_VERSION,
    routes: ["/health", "/api/health", "/api/version", "/api/chat", "/api/tts", "/api/voice"],
  });
});

app.get("/api", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  applyChatEngineHeaders(res, null);
  return safeJson(res, 200, {
    ok: true,
    requestId,
    contractVersion: NYX_CONTRACT_VERSION,
    routes: ["/api/health", "/api/version", "/api/chat", "/api/tts", "/api/voice", "/api/tts/diag"],
  });
});

app.get("/health", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  applyChatEngineHeaders(res, null);
  return safeJson(res, 200, healthPayload(requestId));
});
app.get("/Health", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  applyChatEngineHeaders(res, null);
  return safeJson(res, 200, healthPayload(requestId));
});
app.get("/api/health", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  applyChatEngineHeaders(res, null);
  return safeJson(res, 200, healthPayload(requestId));
});
app.get("/api/Health", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  applyChatEngineHeaders(res, null);
  return safeJson(res, 200, healthPayload(requestId));
});

app.get("/api/version", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  applyChatEngineHeaders(res, null);

  const bridgeEnabled = String(process.env.BRIDGE_ENABLED || "true") === "true";
  const bridgeMusicOnly = String(process.env.BRIDGE_MUSIC_ONLY || "true") === "true";
  const bridgeCooldownMs = clamp(process.env.BRIDGE_COOLDOWN_MS || 45000, 10000, 300000);
  const bridgeStyleDefault = normalizeStr(process.env.BRIDGE_STYLE_DEFAULT || "soft").toLowerCase();
  const bridgeExplicitAlways = String(process.env.BRIDGE_EXPLICIT_ALWAYS || "true") === "true";
  const bridgeDebugHeaders = String(process.env.BRIDGE_DEBUG_HEADERS || "true") === "true";

  const rokuChannelUrl = normalizeStr(process.env.ROKU_CHANNEL_URL || "");
  const rokuFallbackUrl = normalizeStr(process.env.ROKU_FALLBACK_URL || "https://sandblast.channel/roku");
  const rokuCtaCooldownMs = clamp(process.env.ROKU_CTA_COOLDOWN_MS || 600_000, 60_000, 3_600_000);

  const loopSigWindowMs = clamp(process.env.LOOP_SIG_WINDOW_MS || 1600, 400, 8000);
  const loopSigMax = clamp(process.env.LOOP_SIG_MAX || 3, 1, 12);

  const introResetGapMs = clamp(
    process.env.INTRO_RESET_GAP_MS || 12 * 60 * 1000,
    2 * 60 * 1000,
    2 * 60 * 60 * 1000
  );

  return safeJson(res, 200, {
    ok: true,
    requestId,
    contractVersion: NYX_CONTRACT_VERSION,
    indexVersion: INDEX_VERSION,
    commit: GIT_COMMIT,
    node: process.version,
    uptimeSec: Math.round(process.uptime()),
    chatEngine: getChatEngineVersion(chatEngine),
    nyxCoreLoaded: !!NYX_CORE_ENGINE,
    env: {
      trustProxy: TRUST_PROXY,
      corsAllowAll: String(process.env.CORS_ALLOW_ALL || "false") === "true",
      corsEnvExclusive: String(process.env.CORS_ENV_EXCLUSIVE || "false") === "true",
      allowlistCount: EFFECTIVE_ORIGINS.length,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      maxSessions: MAX_SESSIONS,
      bodyHashIncludeSession: String(process.env.BODY_HASH_INCLUDE_SESSION || "false") === "true",
      sessionIdMaxLen: SESSION_ID_MAXLEN,
      turnDedupeMs: clamp(process.env.TURN_DEDUPE_MS || 4000, 800, 15000),
      bridgeEnabled,
      bridgeMusicOnly,
      bridgeCooldownMs,
      bridgeStyleDefault,
      bridgeExplicitAlways,
      bridgeDebugHeaders,
      rokuCtaCooldownMs,
      hasRokuChannelUrl: !!rokuChannelUrl,
      rokuFallbackUrl,
      cosPersistence: true,
      directiveMax: DIRECTIVE_MAX,
      directiveKeyMax: DIRECTIVE_KEY_MAX,
      directiveStrMax: DIRECTIVE_STR_MAX,
      loopSigWindowMs,
      loopSigMax,
      introResetGapMs,
      corsRangeHeaders: true,
      followUpsMax: FOLLOWUPS_MAX,
    },
    allowlistSample: EFFECTIVE_ORIGINS.slice(0, 10),
  });
});

/* ======================================================
   Hashing + intent helpers
====================================================== */

const MAX_HASH_TEXT_LEN = clamp(process.env.MAX_HASH_TEXT_LEN || 800, 200, 4000);
const BODY_HASH_INCLUDE_SESSION = String(process.env.BODY_HASH_INCLUDE_SESSION || "false") === "true";

function stableBodyForHash(body, req) {
  const headerVisitor = normalizeStr(req?.get?.("X-Visitor-Id") || "");
  const headerSession = normalizeStr(req?.get?.("X-Session-Id") || "");
  const headerVoice = normalizeStr(req?.get?.("X-Voice-Mode") || "");
  const headerContract = normalizeStr(req?.get?.("X-Contract-Version") || "");

  if (typeof body === "string") {
    const text = normalizeStr(body).slice(0, MAX_HASH_TEXT_LEN);
    return JSON.stringify({
      text,
      visitorId: headerVisitor || "",
      contractVersion: headerContract || "",
      voiceMode: headerVoice || "",
      mode: "",
      year: null,
      sessionId: BODY_HASH_INCLUDE_SESSION ? headerSession : "",
    });
  }

  const b = body && typeof body === "object" ? body : {};
  const text = normalizeStr(b.text || b.message || "").slice(0, MAX_HASH_TEXT_LEN);

  return JSON.stringify({
    text,
    visitorId: normalizeStr(b.visitorId || headerVisitor || ""),
    contractVersion: normalizeStr(b.contractVersion || headerContract || ""),
    voiceMode: normalizeStr(b.voiceMode || headerVoice || ""),
    mode: normalizeStr(b.mode || ""),
    year: b.year ?? null,
    sessionId: BODY_HASH_INCLUDE_SESSION ? normalizeStr(b.sessionId || headerSession || "") : "",
  });
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
  if (!m) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y) || y < 1950 || y > 2024) return null;
  return y;
}
function extractMode(text) {
  const t = normCmd(text);
  if (/\b(top\s*100|top100|hot\s*100|year[-\s]*end\s*hot\s*100)\b/.test(t)) return "top100";
  if (/\b(top\s*10|top10|top\s*ten)\b/.test(t)) return "top10";
  if (/\bstory\s*moment\b|\bstory\b/.test(t)) return "story";
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return "micro";
  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return "number1";
  return null;
}
function intentSigFrom(text, session) {
  const t = normCmd(text);
  const y = extractYear(t) || (session && Number(session.lastMusicYear)) || null;
  const m = extractMode(t) || (session && String(session.activeMusicMode || "")) || "";
  const lane = session && session.lane ? String(session.lane) : "";
  return `${lane || ""}::${m || ""}::${y || ""}::${sha256(t).slice(0, 10)}`;
}

/* ======================================================
   LOOP FUSE v2.1 (server-side protection)
====================================================== */

const LOOP_SIG_WINDOW_MS = clamp(process.env.LOOP_SIG_WINDOW_MS || 1600, 400, 8000);
const LOOP_SIG_MAX = clamp(process.env.LOOP_SIG_MAX || 3, 1, 12);

function loopSig({ text, routeHint, voiceMode, session }) {
  const t = normCmd(text || "");
  const rh = normCmd(routeHint || "");
  const vm = normCmd(voiceMode || "");
  const lane = normCmd(session && session.lane ? session.lane : "");
  const mode = normCmd(session && session.activeMusicMode ? session.activeMusicMode : "");
  const year =
    session && (session.lastMusicYear || session.lastYear)
      ? String(session.lastMusicYear || session.lastYear)
      : "";
  const core = `${t}||${rh}||${vm}||${lane}||${mode}||${year}`;
  return sha256(core);
}

function shouldLoopFuse(session, sig, now) {
  const lastSig = normalizeStr(session.__loopSig || "");
  const lastAt = Number(session.__loopSigAt || 0);
  const within = lastSig && lastAt && now - lastAt < LOOP_SIG_WINDOW_MS;

  if (!within || sig !== lastSig) {
    session.__loopSig = sig;
    session.__loopSigAt = now;
    session.__loopCount = 0;
    return { fuse: false, count: 0 };
  }

  const next = Number(session.__loopCount || 0) + 1;
  session.__loopCount = next;

  // ✅ v2.1: ignore the first duplicate (common double-send); start fusing at 2+
  if (next < 2) return { fuse: false, count: next };

  return { fuse: true, count: next };
}

function quietLoopReply(session) {
  const last = normalizeStr(session.__lastReply || "");
  if (last) return last;
  return "Okay — I’ve got you. Send ONE message: a year (1950–2024) or “top 10 1988”.";
}

/* ======================================================
   Posture + Bridge Control Plane (v1) + ENV KNOBS
====================================================== */

const BRIDGE_ENABLED = String(process.env.BRIDGE_ENABLED || "true") === "true";
const BRIDGE_MUSIC_ONLY = String(process.env.BRIDGE_MUSIC_ONLY || "true") === "true";
const BRIDGE_COOLDOWN_MS = clamp(process.env.BRIDGE_COOLDOWN_MS || 45_000, 10_000, 300_000);
const BRIDGE_STYLE_DEFAULT = normCmd(process.env.BRIDGE_STYLE_DEFAULT || "soft") || "soft";
const BRIDGE_EXPLICIT_ALWAYS = String(process.env.BRIDGE_EXPLICIT_ALWAYS || "true") === "true";
const BRIDGE_DEBUG_HEADERS = String(process.env.BRIDGE_DEBUG_HEADERS || "true") === "true";

/* ✅ Structured Roku CTA (directives) */
const ROKU_CHANNEL_URL = normalizeStr(process.env.ROKU_CHANNEL_URL || "");
const ROKU_DEEPLINK = normalizeStr(process.env.ROKU_DEEPLINK || "");
const ROKU_FALLBACK_URL = normalizeStr(process.env.ROKU_FALLBACK_URL || "https://sandblast.channel/roku");
const BRIDGE_CTA_LABEL = normalizeStr(process.env.BRIDGE_CTA_LABEL || "Open Sandblast on Roku");
const ROKU_CTA_COOLDOWN_MS = clamp(process.env.ROKU_CTA_COOLDOWN_MS || 600_000, 60_000, 3_600_000);

const CANON = {
  rokuBridge: {
    soft: [
      "This one’s better experienced leaned back.",
      "Same world—just on your biggest screen.",
      "Sandblast is where we explore. Roku is where you relax.",
      "Same intelligence. Different posture.",
    ],
    quiet: [
      "If you want to stay in this moment, Roku is the quiet way to do it.",
      "This is one of those memories that deserves the big screen.",
      "Same world—just on your biggest screen.",
    ],
    companion: ["I’ll meet you there.", "Same world—just on your biggest screen."],
  },
};

function detectPosture(text) {
  const t = normCmd(text);
  if (/\b(bye|goodbye|later|done|stop|cancel|nevermind|never mind)\b/.test(t)) return "exit";
  if (/\b(install|open|launch|start|take me|go to|send me|link)\b/.test(t)) return "commit";
  if (/\b(relax|watch|tv|roku|big screen|lean back|couch|living room)\b/.test(t)) return "relax";
  return "explore";
}

function chooseBridgeStyle(posture) {
  const p = String(posture || "");
  if (p === "relax") return "quiet";
  if (p === "commit") return "companion";
  if (CANON.rokuBridge && CANON.rokuBridge[BRIDGE_STYLE_DEFAULT]) return BRIDGE_STYLE_DEFAULT;
  return "soft";
}

function pickBridgeLine(style, session) {
  const bucket = (CANON.rokuBridge && CANON.rokuBridge[style]) || CANON.rokuBridge.soft;
  const idx = Number(session.__bridgeIdx || 0) % bucket.length;
  session.__bridgeIdx = idx + 1;
  return bucket[idx];
}

function isExplicitRokuMention(text) {
  const t = normCmd(text);
  return /\broku\b/.test(t);
}

function bridgeEligible({ text, session, out, now }) {
  if (!BRIDGE_ENABLED) return false;

  const last = Number(session.__lastBridgeAt || 0);
  if (last && now - last < BRIDGE_COOLDOWN_MS) return false;

  const explicit = isExplicitRokuMention(text);
  if (explicit && BRIDGE_EXPLICIT_ALWAYS) return true;

  const lane =
    (out && typeof out.lane === "string" ? out.lane : "") || (session && session.lane ? String(session.lane) : "");

  if (BRIDGE_MUSIC_ONLY && lane && lane !== "music") return false;
  if (explicit) return true;

  const mode =
    (out && typeof out.mode === "string" ? out.mode : "") ||
    extractMode(text) ||
    (session && session.activeMusicMode ? String(session.activeMusicMode) : "");

  if (mode === "top10" || mode === "story" || mode === "micro") return true;

  const t = normCmd(text);
  if (/\b(remember|takes me back|my childhood|when i was|brings back|nostalgia)\b/.test(t)) return true;

  return false;
}

function injectBridgeLine(reply, line) {
  const base = String(reply || "").trim();
  const add = String(line || "").trim();
  if (!add) return base;
  if (!base) return add;
  if (base.includes(add)) return base;
  return base + "\n\n" + add;
}

function canEmitRokuCta(session, now, posture) {
  if (!session) return false;
  if (posture === "exit") return false;

  const last = Number(session.__lastRokuCtaAt || 0);
  if (last && now - last < ROKU_CTA_COOLDOWN_MS) return false;

  if (!ROKU_CHANNEL_URL && !ROKU_FALLBACK_URL) return false;

  return true;
}

function buildRokuBridgeDirective({ session, now, posture, reason }) {
  const url = ROKU_CHANNEL_URL || ROKU_FALLBACK_URL;
  const dir = {
    type: "bridge_roku",
    label: BRIDGE_CTA_LABEL,
    url,
    deeplink: ROKU_DEEPLINK || null,
    fallbackUrl: ROKU_FALLBACK_URL || null,
    reason: reason || `posture_${posture || "explore"}`,
    ttlMs: 600_000,
  };

  session.__lastRokuCtaAt = now;
  session.__rokuCtaCount = Number(session.__rokuCtaCount || 0) + 1;

  return dir;
}

function hasDirectiveType(list, type) {
  if (!Array.isArray(list) || !type) return false;
  const t = String(type);
  for (const d of list) {
    if (d && typeof d === "object" && String(d.type || "") === t) return true;
  }
  return false;
}

/* ======================================================
   TURN-CACHE DEDUPE
====================================================== */

const TURN_DEDUPE_MS = clamp(process.env.TURN_DEDUPE_MS || 4000, 800, 15000);
const TURN_CACHE_MAX = clamp(process.env.TURN_CACHE_MAX || 800, 100, 5000);
const TURN_CACHE = new Map();

function getTurnKey(req, body, text, visitorId) {
  const origin = normalizeStr(req.headers.origin || "");
  const fp = fingerprint(req, visitorId);

  let turnId = "";
  try {
    if (body && typeof body === "object" && body.client && typeof body.client === "object") {
      turnId = normalizeStr(body.client.turnId || "");
    }
  } catch (_) {
    turnId = "";
  }

  if (turnId) {
    return sha256(JSON.stringify({ o: origin, fp, turnId }));
  }

  const bh = sha256(stableBodyForHash(body, req));
  return sha256(JSON.stringify({ o: origin, fp, bh }));
}

function pruneTurnCache() {
  const now = Date.now();
  for (const [k, v] of TURN_CACHE.entries()) {
    if (!v || now - Number(v.at || 0) > TURN_DEDUPE_MS) TURN_CACHE.delete(k);
  }
  if (TURN_CACHE.size > TURN_CACHE_MAX) {
    const entries = Array.from(TURN_CACHE.entries()).sort(
      (a, b) => Number(a[1].at || 0) - Number(b[1].at || 0)
    );
    const n = Math.max(1, Math.floor(TURN_CACHE_MAX * 0.1));
    for (let i = 0; i < n && i < entries.length; i++) TURN_CACHE.delete(entries[i][0]);
  }
}

setInterval(() => pruneTurnCache(), 5000).unref?.();

/* ======================================================
   TTS / Voice routes (never brick) + diagnostics
====================================================== */

let TTS_LOAD_ERROR = null;

function safeRequireTts() {
  try {
    const mod = require("./Utils/tts");
    TTS_LOAD_ERROR = null;
    return mod;
  } catch (e) {
    TTS_LOAD_ERROR = e;
    return null;
  }
}

ttsModule = safeRequireTts();

if (!ttsModule) {
  console.warn(
    "[tts] Utils/tts failed to load (soft).",
    TTS_LOAD_ERROR && TTS_LOAD_ERROR.message ? TTS_LOAD_ERROR.message : TTS_LOAD_ERROR
  );
} else {
  const keys = Object.keys(ttsModule || {});
  console.log("[tts] loaded (soft). export keys:", keys.length ? keys.join(",") : "(none)");
}

function pickTtsHandler(mod) {
  if (!mod) return null;

  if (mod.default && typeof mod.default === "function") return mod.default;
  if (mod.router && typeof mod.router === "function") return mod.router;
  if (typeof mod === "function") return mod;

  if (typeof mod.handleTts === "function") return mod.handleTts;
  if (typeof mod.handle === "function") return mod.handle;
  if (typeof mod.tts === "function") return mod.tts;

  return null;
}

async function runTts(req, res) {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  applyChatEngineHeaders(res, null);

  if (!ttsModule) ttsModule = safeRequireTts();

  const fn = pickTtsHandler(ttsModule);
  if (!fn) {
    const exportKeys = ttsModule ? Object.keys(ttsModule) : [];
    return safeJson(res, 501, {
      ok: false,
      error: "TTS_NOT_CONFIGURED",
      message: "Utils/tts missing or invalid export shape.",
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
      diag: {
        loaded: !!ttsModule,
        exportKeys,
        loadError: TTS_LOAD_ERROR ? String(TTS_LOAD_ERROR.message || TTS_LOAD_ERROR) : null,
      },
    });
  }

  try {
    return await fn(req, res);
  } catch (e) {
    console.error("[/api/tts] error:", e && e.stack ? e.stack : e);
    return safeJson(res, 500, {
      ok: false,
      error: "TTS_ERROR",
      message: String(e && e.message ? e.message : e),
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }
}

app.get("/api/tts/diag", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  applyChatEngineHeaders(res, null);
  const exportKeys = ttsModule ? Object.keys(ttsModule) : [];
  return safeJson(res, 200, {
    ok: true,
    requestId,
    contractVersion: NYX_CONTRACT_VERSION,
    loaded: !!ttsModule,
    exportKeys,
    loadError: TTS_LOAD_ERROR ? String(TTS_LOAD_ERROR.message || TTS_LOAD_ERROR) : null,
  });
});

app.post("/api/tts", runTts);
app.post("/api/voice", runTts);

/* ======================================================
   /api/chat (ANTI-502 + LOOP KILL)
====================================================== */

const CHAT_HANDLER_TIMEOUT_MS = clamp(process.env.CHAT_HANDLER_TIMEOUT_MS || 9000, 2000, 20000);

const INTRO_RESET_GAP_MS = clamp(
  process.env.INTRO_RESET_GAP_MS || 12 * 60 * 1000,
  2 * 60 * 1000,
  2 * 60 * 60 * 1000
);

const BURST_WINDOW_MS = clamp(process.env.BURST_WINDOW_MS || 1500, 600, 5000);
const BURST_SOFT_MAX = clamp(process.env.BURST_SOFT_MAX || 3, 1, 12);
const BURST_HARD_MAX = clamp(process.env.BURST_HARD_MAX || 14, 6, 60);
const BURSTS = new Map();

const BODY_DEDUPE_MS = clamp(process.env.BODY_DEDUPE_MS || 1600, 400, 5000);
const INTENT_DEDUPE_MS = clamp(process.env.INTENT_DEDUPE_MS || 2500, 600, 8000);

const REPLY_DEDUPE_MS = clamp(process.env.REPLY_DEDUPE_MS || 1400, 300, 8000);
const REPLY_REPEAT_WINDOW_MS = clamp(process.env.REPLY_REPEAT_WINDOW_MS || 5000, 1000, 20000);
const REPLY_REPEAT_MAX = clamp(process.env.REPLY_REPEAT_MAX || 3, 1, 10);

const SR_WINDOW_MS = clamp(process.env.SR_WINDOW_MS || 20000, 5000, 120000);
const SR_MAX = clamp(process.env.SR_MAX || 10, 3, 60);

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of BURSTS.entries()) {
    if (!v || now - Number(v.at || 0) > BURST_WINDOW_MS * 6) BURSTS.delete(k);
  }
}, 5000).unref?.();

function extractTextFromBody(body) {
  if (typeof body === "string") return body.trim();
  if (!body || typeof body !== "object") return "";
  return normalizeStr(body.text || body.message || "");
}

function extractRouteHintFromBody(body) {
  try {
    if (!body || typeof body !== "object") return null;
    const c = body.client && typeof body.client === "object" ? body.client : null;
    if (!c) return null;
    return normalizeRouteHint(c.routeHint || "");
  } catch (_) {
    return null;
  }
}

function extractClientSource(body) {
  try {
    if (!body || typeof body !== "object") return "";
    const c = body.client && typeof body.client === "object" ? body.client : null;
    if (!c) return "";
    return normalizeStr(c.source || c.event || c.reason || "");
  } catch (_) {
    return "";
  }
}

function isBootSource(source) {
  const s = normCmd(source || "");
  if (!s) return false;
  return /\b(panel|open|boot|init|mount|load|launcher)\b/.test(s);
}

function validateContract(req, body) {
  const headerV = normalizeStr(req.get("X-Contract-Version") || "");
  const bodyV = body && typeof body === "object" ? normalizeStr(body.contractVersion || "") : "";
  const v = bodyV || headerV || "";
  const strict = String(process.env.CONTRACT_STRICT || "false") === "true";
  if (!strict) return { ok: true, got: v || null };
  return { ok: v === NYX_CONTRACT_VERSION, got: v || null };
}

function fallbackReply(text) {
  const t = normalizeStr(text).toLowerCase();
  if (!t) {
    return "Tell me a year (1950–2024), or say “top 10 1988”, “#1 1988”, “story moment 1988”, or “micro moment 1988”.";
  }
  if (/^\d{4}$/.test(t)) {
    return `Got it — ${t}. Want Top 10, #1, a story moment, or a micro moment?`;
  }
  return "Got it. Tell me a year (1950–2024), or pick a mode: “top 10”, “#1”, “story moment”, “micro moment”.";
}

function pickChatHandler(mod) {
  if (!mod) return null;
  if (typeof mod.handleChat === "function") return mod.handleChat.bind(mod);
  if (typeof mod.reply === "function") return mod.reply.bind(mod);
  if (typeof mod === "function") return mod;
  return null;
}

function isUpstreamQuotaError(e) {
  try {
    if (!e) return false;
    const msg = String(e.message || "");
    const stack = String(e.stack || "");
    const raw = msg + "\n" + stack;

    const code = String(e.code || (e.error && e.error.code) || "");
    const type = String(e.type || (e.error && e.error.type) || "");
    const status = Number(e.status || e.statusCode || (e.response && e.response.status) || NaN);

    if (code === "insufficient_quota") return true;
    if (type === "insufficient_quota") return true;
    if (Number.isFinite(status) && status === 429 && raw.includes("insufficient_quota")) return true;

    return (
      raw.includes("insufficient_quota") ||
      raw.includes("You exceeded your current quota") ||
      raw.includes("check your plan and billing details")
    );
  } catch (_) {
    return false;
  }
}

function respondOnce(res) {
  let sent = false;
  return {
    sent: () => sent || res.headersSent,
    json: (status, payload) => {
      if (sent || res.headersSent) return;
      sent = true;
      return safeJson(res, status, payload);
    },
  };
}

function dedupeOkPayload({ reply, sessionId, requestId, visitorId, posture, routeHint, session }) {
  const baseReply = String(reply || "OK.").trim() || "OK.";
  return enforceChatContract({
    out: null,
    session: session || null,
    routeHint: routeHint || null,
    baseReply,
    requestId,
    sessionId,
    visitorId,
    posture: posture || "explore",
    shadow: null,
    followUpsObjects: undefined,
    followUpsStrings: undefined,
    bridgeInjected: null,
    directivesOverride: [],
  });
}

function getTurnCounter(session) {
  const a = Number(session && session.turns);
  const b = Number(session && session.turnCount);
  const aa = Number.isFinite(a) ? a : 0;
  const bb = Number.isFinite(b) ? b : 0;
  return Math.max(aa, bb);
}

function setTurnCounter(session, n) {
  if (!session) return;
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return;
  session.turns = x;
  session.turnCount = x;
}

/* ======================================================
   /api/chat
====================================================== */

app.post("/api/chat", async (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  applyChatEngineHeaders(res, null);

  const isDebug = String(req.query.debug || "") === "1";
  const once = respondOnce(res);

  const headerVisitorId = normalizeStr(req.get("X-Visitor-Id") || "") || null;
  const derivedSessionId = deriveStableSessionId(req, headerVisitorId);
  const derivedSession = touchSession(derivedSessionId, { visitorId: headerVisitorId }) || {
    sessionId: derivedSessionId,
  };

  const watchdog = setTimeout(() => {
    try {
      safeSet(res, "X-Nyx-Deduped", "timeout-floor");
      const payload = dedupeOkPayload({
        reply: "I’m here. Give me a year (1950–2024), or say “top 10 1988”.",
        sessionId: derivedSessionId,
        requestId,
        visitorId: headerVisitorId,
        posture: derivedSession.__lastPosture || "explore",
        routeHint: null,
        session: derivedSession,
      });
      if (BRIDGE_DEBUG_HEADERS) safeSet(res, "X-Nyx-Posture", String(payload.posture || "explore"));
      applyChatEngineHeaders(res, null);
      return once.json(200, payload);
    } catch (_) {}
  }, CHAT_HANDLER_TIMEOUT_MS);

  try {
    const body = req.body;
    const text = extractTextFromBody(body);
    const routeHint = extractRouteHintFromBody(body);
    const source = extractClientSource(body);

    const contract = validateContract(req, body);
    if (!contract.ok) {
      clearTimeout(watchdog);
      return once.json(400, {
        ok: false,
        error: "BAD_REQUEST",
        detail: "CONTRACT_VERSION_MISMATCH",
        expected: NYX_CONTRACT_VERSION,
        got: contract.got,
        requestId,
        contractVersion: NYX_CONTRACT_VERSION,
      });
    }

    const visitorId =
      (body && typeof body === "object" ? normalizeStr(body.visitorId || "") : "") ||
      normalizeStr(req.get("X-Visitor-Id") || "") ||
      null;

    const sessionId = getSessionId(req, body, visitorId);
    const session = touchSession(sessionId, { visitorId }) || { sessionId };

    const vmode = getVoiceMode(req, body);
    if (vmode) session.voiceMode = vmode;

    const now = Date.now();

    // ✅ Keep server-side lastTurnAt for reset-gap logic, but DO NOT pre-increment turns here.
    const prevTurnAt = Number(session.lastTurnAt || 0);
    session.lastTurnAt = now;

    // baseline session defaults (belt)
    initSessionDefaults(session, now);

    // ✅ intro reset gap (only meaningful for auto_ sessions)
    const headerSid = cleanSessionId(req.get("X-Session-Id"));
    const bodySid = body && typeof body === "object" ? cleanSessionId(body.sessionId) : null;
    const isAutoSession = !bodySid && !headerSid && String(sessionId || "").startsWith("auto_");

    if (isAutoSession && prevTurnAt && now - prevTurnAt > INTRO_RESET_GAP_MS) {
      session.introDone = false;
      session.introServed = false;
      if (isDebug) safeSet(res, "X-Nyx-Intro", "reset_gap");
    }

    const handler = pickChatHandler(chatEngine);

    // ✅ BOOT-INTRO BRIDGE
    const canBootIntro =
      !normalizeStr(text) &&
      isBootSource(source) &&
      handler &&
      !session.introDone &&
      !session.__hasRealUserTurn;

    if (canBootIntro) {
      let out = null;
      try {
        // call chatEngine with EMPTY text + panel_open_intro source
        out = await Promise.resolve(
          handler({
            text: "",
            message: "",
            session,
            requestId,
            debug: isDebug,
            routeHint: routeHint || "general",
            engine: NYX_CORE_ENGINE || undefined,
            client: Object.assign({}, (body && body.client) || {}, {
              source: source || "panel_open_intro",
              synthetic: true,
            }),
            source: source || "panel_open_intro",
          })
        );
      } catch (e) {
        console.error("[boot-intro] chatEngine error (soft):", e && e.stack ? e.stack : e);
        out = null;
      }

      applyChatEngineHeaders(res, out);

      if (out && typeof out === "object" && out.sessionPatch && typeof out.sessionPatch === "object") {
        applySessionPatch(session, out.sessionPatch);
      }

      const baseReply =
        out && typeof out === "object" && typeof out.reply === "string" ? out.reply : fallbackReply("");

      // Mark intro served (server-side belt + suspenders)
      session.introDone = true;
      session.introAt = now;
      session.introServed = true;

      safeSet(res, "X-Nyx-Intro", "boot_intro");
      safeSet(res, "X-Nyx-Deduped", "boot-intro");

      const posture = "explore";
      session.__lastPosture = posture;
      if (BRIDGE_DEBUG_HEADERS) safeSet(res, "X-Nyx-Posture", String(posture));

      const followUpsObjects = normalizeFollowUpsObjects(out && out.followUps);
      const followUpsStrings = normalizeFollowUpsStrings(out && out.followUps);

      const payload = enforceChatContract({
        out,
        session,
        routeHint,
        baseReply,
        requestId,
        sessionId,
        visitorId,
        posture,
        shadow: null,
        followUpsObjects,
        followUpsStrings,
        bridgeInjected: null,
        directivesOverride: dedupeDirectives(normalizeDirectives(out && out.directives)),
      });

      clearTimeout(watchdog);
      return once.json(200, payload);
    }

    // Normal flow from here down
    pruneTurnCache();
    const turnKey = getTurnKey(req, body, text, visitorId);
    const cached = TURN_CACHE.get(turnKey);
    if (cached && Date.now() - Number(cached.at || 0) <= TURN_DEDUPE_MS) {
      clearTimeout(watchdog);
      safeSet(res, "X-Nyx-Deduped", "turn-cache");
      if (BRIDGE_DEBUG_HEADERS && cached.payload && cached.payload.posture) {
        safeSet(res, "X-Nyx-Posture", String(cached.payload.posture));
      }
      if (BRIDGE_DEBUG_HEADERS && cached.payload && cached.payload._bridgeInjected) {
        safeSet(res, "X-Nyx-Bridge", String(cached.payload._bridgeInjected));
      }
      applyChatEngineHeaders(res, null);
      return once.json(200, cached.payload);
    }

    // =========================
    // LOOP FUSE v2.1 — input signature
    // =========================
    const sig = loopSig({ text, routeHint, voiceMode: vmode, session });
    const lf = shouldLoopFuse(session, sig, now);
    if (lf.fuse) {
      safeSet(res, "X-Nyx-Loop", `sig:${lf.count}`);
      safeSet(res, "X-Nyx-Deduped", lf.count >= LOOP_SIG_MAX ? "loop-hard" : "loop-soft");

      const reply =
        lf.count >= LOOP_SIG_MAX
          ? "Okay — we’re looping. Stop sending for a beat, then send ONE message: a year (1950–2024) or “top 10 1988”."
          : quietLoopReply(session);

      const posture = session.__lastPosture || detectPosture(text);
      if (BRIDGE_DEBUG_HEADERS) safeSet(res, "X-Nyx-Posture", String(posture));

      const payload = dedupeOkPayload({
        reply,
        sessionId,
        requestId,
        visitorId,
        posture,
        routeHint,
        session,
      });

      TURN_CACHE.set(turnKey, { at: Date.now(), payload });

      clearTimeout(watchdog);
      applyChatEngineHeaders(res, null);
      return once.json(200, payload);
    }

    // =========================
    // Sustained request guard
    // =========================
    const srAt = Number(session.__srAt || 0);
    const srCount = Number(session.__srCount || 0);
    const srWithin = srAt && now - srAt < SR_WINDOW_MS;
    if (srWithin) {
      const next = srCount + 1;
      session.__srCount = next;
      if (next > SR_MAX) {
        clearTimeout(watchdog);
        safeSet(res, "X-Nyx-Deduped", "sustained");
        const posture = session.__lastPosture || "explore";
        if (BRIDGE_DEBUG_HEADERS) safeSet(res, "X-Nyx-Posture", String(posture));
        const payload = dedupeOkPayload({
          reply: session.__lastReply || "OK.",
          sessionId,
          requestId,
          visitorId,
          posture,
          routeHint,
          session,
        });
        TURN_CACHE.set(turnKey, { at: Date.now(), payload });
        applyChatEngineHeaders(res, null);
        return once.json(200, payload);
      }
    } else {
      session.__srAt = now;
      session.__srCount = 0;
    }

    // =========================
    // Burst guard
    // =========================
    const fp = fingerprint(req, visitorId);
    const prev = BURSTS.get(fp);

    if (!prev || now - Number(prev.at || 0) > BURST_WINDOW_MS) {
      BURSTS.set(fp, { at: now, count: 1 });
    } else {
      const count = Number(prev.count || 0) + 1;
      BURSTS.set(fp, { at: prev.at, count });

      if (count >= BURST_HARD_MAX) {
        clearTimeout(watchdog);
        safeSet(res, "X-Nyx-Deduped", "burst-hard");
        applyChatEngineHeaders(res, null);
        return once.json(429, {
          ok: false,
          error: "REQUEST_BURST",
          message: "Too many chat requests in a short window (burst guard).",
          requestId,
          sessionId,
          visitorId,
          contractVersion: NYX_CONTRACT_VERSION,
        });
      }

      if (count > BURST_SOFT_MAX) {
        clearTimeout(watchdog);
        safeSet(res, "X-Nyx-Deduped", "burst-soft");
        const posture = session.__lastPosture || "explore";
        if (BRIDGE_DEBUG_HEADERS) safeSet(res, "X-Nyx-Posture", String(posture));
        const payload = dedupeOkPayload({
          reply: session.__lastReply || "OK.",
          sessionId,
          requestId,
          visitorId,
          posture,
          routeHint,
          session,
        });
        TURN_CACHE.set(turnKey, { at: Date.now(), payload });
        applyChatEngineHeaders(res, null);
        return once.json(200, payload);
      }
    }

    // =========================
    // Body hash dedupe
    // =========================
    const bodyHash = sha256(stableBodyForHash(body, req));
    const lastHash = normalizeStr(session.__lastBodyHash || "");
    const lastAt = Number(session.__lastBodyAt || 0);
    if (lastHash && bodyHash === lastHash && lastAt && now - lastAt < BODY_DEDUPE_MS) {
      clearTimeout(watchdog);
      safeSet(res, "X-Nyx-Deduped", "body-hash");
      const posture = session.__lastPosture || "explore";
      if (BRIDGE_DEBUG_HEADERS) safeSet(res, "X-Nyx-Posture", String(posture));
      const payload = dedupeOkPayload({
        reply: session.__lastReply || "OK.",
        sessionId,
        requestId,
        visitorId,
        posture,
        routeHint,
        session,
      });
      TURN_CACHE.set(turnKey, { at: Date.now(), payload });
      applyChatEngineHeaders(res, null);
      return once.json(200, payload);
    }

    // =========================
    // Shadow (soft)
    // =========================
    let shadow = null;
    try {
      if (shadowBrain) {
        if (typeof shadowBrain.freshShadow === "function") shadow = shadowBrain.freshShadow({ session, text });
        else if (typeof shadowBrain.prime === "function") shadow = shadowBrain.prime({ session, text });
        else if (typeof shadowBrain === "function") shadow = shadowBrain({ session, text });
      }
    } catch (e) {
      shadow = null;
      console.warn("[shadow] error (soft):", e && e.message ? e.message : e);
    }

    // ✅ capture turns before engine; do NOT pre-increment
    const turnsBefore = getTurnCounter(session);

    let out = null;

    if (handler) {
      try {
        out = await Promise.resolve(
          handler({
            text,
            message: text,
            session,
            requestId,
            debug: isDebug,
            routeHint,
            // ✅ pass core engine so chatEngine wrapper can fire packs/layers
            engine: NYX_CORE_ENGINE || undefined,
            client: (body && body.client) || undefined,
          })
        );
      } catch (e) {
        if (isUpstreamQuotaError(e)) {
          safeSet(res, "X-Nyx-Upstream", "openai_insufficient_quota");
          safeSet(res, "X-Nyx-Deduped", "upstream-quota");
          const last = String(session.__lastReply || "").trim();
          out = {
            reply:
              last ||
              "Nyx is online, but the AI brain is temporarily out of fuel (OpenAI quota). Add billing/credits, then try again.",
            followUps: [
              { id: "try_again", type: "chip", label: "Try again", payload: { text: "Try again" } },
              { id: "open_radio", type: "chip", label: "Open radio", payload: { text: "Open radio" } },
              { id: "open_tv", type: "chip", label: "Open TV", payload: { text: "Open TV" } },
            ],
            cog: { state: "error", reason: "upstream_quota" },
            directives: [],
            meta: { engine: getChatEngineVersion(chatEngine) || "unknown", intro: false },
          };
        } else {
          console.error("[chatEngine] error (soft):", e && e.stack ? e.stack : e);
          out = null;
        }
      }
    }

    // ✅ Visibility headers AFTER engine returns (meta / intro signals)
    applyChatEngineHeaders(res, out);

    if (out && typeof out === "object" && out.sessionPatch && typeof out.sessionPatch === "object") {
      applySessionPatch(session, out.sessionPatch);
    }

    // ✅ mark real user turn (server belt); boot-intro is handled above
    if (normalizeStr(text)) session.__hasRealUserTurn = true;

    // ✅ post-engine safe increment: ONLY if engine did not increment
    const turnsAfterEngine = getTurnCounter(session);
    if (normalizeStr(text) && turnsAfterEngine === turnsBefore) {
      setTurnCounter(session, turnsBefore + 1);
    }

    const baseReply =
      out && typeof out === "object" && typeof out.reply === "string" ? out.reply : fallbackReply(text);

    const posture = detectPosture(text);
    session.__lastPosture = posture;

    if (BRIDGE_DEBUG_HEADERS) safeSet(res, "X-Nyx-Posture", String(posture));

    let finalReply = String(baseReply || "").trim();
    if (!finalReply) finalReply = fallbackReply(text);

    // ✅ INTRO FALLBACK GUARD + RANDOMIZER (ONLY when chatEngine missing/fails)
    if (!out && !session.introDone && isGreetingText(text)) {
      const picked = pickFallbackIntroForSession(session);
      finalReply = picked.text;
      session.introDone = true;
      session.introAt = now;
      session.introServed = true;
      session.introVariant = "fallback_random_v1";
      safeSet(res, "X-Nyx-Intro", "fallback_random_v1");
    }

    const eligible = bridgeEligible({ text, session, out, now });
    let bridgeInjected = null;

    if (eligible) {
      const style = chooseBridgeStyle(posture);
      const line = pickBridgeLine(style, session);
      const next = injectBridgeLine(finalReply, line);
      if (next !== finalReply) {
        finalReply = next;
        session.__lastBridgeAt = now;
        bridgeInjected = line;
        if (BRIDGE_DEBUG_HEADERS) safeSet(res, "X-Nyx-Bridge", line);
      }
    }

    let directives = dedupeDirectives(normalizeDirectives(out && out.directives));
    if (eligible && canEmitRokuCta(session, now, posture) && !hasDirectiveType(directives, "bridge_roku")) {
      const reason = isExplicitRokuMention(text) ? "explicit_roku" : "implicit_bridge";
      const rokuDir = buildRokuBridgeDirective({ session, now, posture, reason });
      directives = directives || [];
      directives.unshift(rokuDir);
      directives = dedupeDirectives(directives);
    }

    const replyHash = sha256(String(finalReply || ""));
    const lastReplyHash = normalizeStr(session.__lastReplyHash || "");
    const lastReplyAt = Number(session.__lastReplyAt || 0);

    if (lastReplyHash && replyHash === lastReplyHash && lastReplyAt && now - lastReplyAt < REPLY_DEDUPE_MS) {
      clearTimeout(watchdog);
      safeSet(res, "X-Nyx-Deduped", "reply-hash");
      const payload = dedupeOkPayload({
        reply: session.__lastReply || finalReply || "OK.",
        sessionId,
        requestId,
        visitorId,
        posture,
        routeHint,
        session,
      });
      TURN_CACHE.set(turnKey, { at: Date.now(), payload });
      applyChatEngineHeaders(res, out);
      return once.json(200, payload);
    }

    const repAt = Number(session.__repAt || 0);
    const repCount = Number(session.__repCount || 0);
    const withinRep = repAt && now - repAt < REPLY_REPEAT_WINDOW_MS;

    if (withinRep && lastReplyHash && replyHash === lastReplyHash) {
      const nextCount = repCount + 1;
      session.__repCount = nextCount;

      if (nextCount >= REPLY_REPEAT_MAX) {
        clearTimeout(watchdog);
        safeSet(res, "X-Nyx-Deduped", "reply-runaway");

        const soft = "Okay — pause. Tell me ONE thing: a year (1950–2024) or a command like “top 10 1988”.";
        session.__lastReply = soft;
        session.__lastReplyHash = sha256(soft);
        session.__lastReplyAt = now;

        const payload = dedupeOkPayload({
          reply: soft,
          sessionId,
          requestId,
          visitorId,
          posture,
          routeHint,
          session,
        });
        TURN_CACHE.set(turnKey, { at: Date.now(), payload });
        applyChatEngineHeaders(res, out);
        return once.json(200, payload);
      }
    } else {
      session.__repAt = now;
      session.__repCount = 0;
    }

    const followUpsObjects = normalizeFollowUpsObjects(out && out.followUps);
    const followUpsStrings = normalizeFollowUpsStrings(out && out.followUps);

    session.__lastReply = finalReply;
    session.__lastBodyHash = bodyHash;
    session.__lastBodyAt = now;
    session.__lastReplyHash = replyHash;
    session.__lastReplyAt = now;

    const sig2 = intentSigFrom(text, session);
    const lastSig = normalizeStr(session.__lastIntentSig || "");
    const lastSigAt = Number(session.__lastIntentAt || 0);
    if (lastSig && sig2 === lastSig && lastSigAt && now - lastSigAt < INTENT_DEDUPE_MS) {
      clearTimeout(watchdog);
      safeSet(res, "X-Nyx-Deduped", "intent-sig");
      const payload = dedupeOkPayload({
        reply: session.__lastReply || finalReply || "OK.",
        sessionId,
        requestId,
        visitorId,
        posture,
        routeHint,
        session,
      });
      TURN_CACHE.set(turnKey, { at: Date.now(), payload });
      applyChatEngineHeaders(res, out);
      return once.json(200, payload);
    }
    session.__lastIntentSig = sig2;
    session.__lastIntentAt = now;

    const payload = enforceChatContract({
      out,
      session,
      routeHint,
      baseReply: finalReply,
      requestId,
      sessionId,
      visitorId,
      posture,
      shadow,
      followUpsObjects,
      followUpsStrings,
      bridgeInjected,
      directivesOverride: directives,
    });

    if (isDebug && out && typeof out === "object") {
      if (out.baseMessage) payload.baseMessage = String(out.baseMessage);
      if (out._engine && typeof out._engine === "object") payload._engine = out._engine;
      payload._bridge = {
        enabled: BRIDGE_ENABLED,
        musicOnly: BRIDGE_MUSIC_ONLY,
        eligible,
        cooldownMs: BRIDGE_COOLDOWN_MS,
        styleDefault: BRIDGE_STYLE_DEFAULT,
        explicitAlways: BRIDGE_EXPLICIT_ALWAYS,
        lastBridgeAt: Number(session.__lastBridgeAt || 0) || null,
        rokuCtaCooldownMs: ROKU_CTA_COOLDOWN_MS,
        lastRokuCtaAt: Number(session.__lastRokuCtaAt || 0) || null,
        rokuCtaCount: Number(session.__rokuCtaCount || 0) || 0,
        hasRokuUrl: !!(ROKU_CHANNEL_URL || ROKU_FALLBACK_URL),
      };
      payload._contract = {
        routeHint: routeHint || null,
        laneNormalized: payload.cog && payload.cog.lane ? payload.cog.lane : null,
      };
      payload._loop = {
        sigWindowMs: LOOP_SIG_WINDOW_MS,
        sigMax: LOOP_SIG_MAX,
        loopCount: Number(session.__loopCount || 0),
      };
      payload._intro = {
        autoSession: isAutoSession,
        introResetGapMs: INTRO_RESET_GAP_MS,
        prevTurnAt: prevTurnAt || null,
        clientSource: source || null,
        bootIntroEligible: canBootIntro,
      };
      payload._core = {
        nyxCoreLoaded: !!NYX_CORE_ENGINE,
      };
      payload._turns = {
        before: turnsBefore,
        after: getTurnCounter(session),
      };
    }

    TURN_CACHE.set(turnKey, { at: Date.now(), payload });

    clearTimeout(watchdog);
    applyChatEngineHeaders(res, out);
    return once.json(200, payload);
  } catch (e) {
    console.error("[/api/chat] handler-floor error:", e && e.stack ? e.stack : e);
    clearTimeout(watchdog);
    setContractHeaders(res, requestId);
    safeSet(res, "X-Nyx-Deduped", "floor");
    applyChatEngineHeaders(res, null);

    const vid = normalizeStr(req.get("X-Visitor-Id") || "") || null;
    const sid = deriveStableSessionId(req, vid);
    const sess = touchSession(sid, { visitorId: vid }) || { sessionId: sid };

    const payload = dedupeOkPayload({
      reply: "I’m here. Give me a year (1950–2024), or say “top 10 1988”.",
      sessionId: sid,
      requestId,
      visitorId: vid,
      posture: sess.__lastPosture || "explore",
      routeHint: null,
      session: sess,
    });

    try {
      const turnKey = getTurnKey(req, req.body, extractTextFromBody(req.body), vid);
      TURN_CACHE.set(turnKey, { at: Date.now(), payload });
    } catch (_) {}

    return safeJson(res, 200, payload);
  }
});

/* ======================================================
   404 for /api/*
====================================================== */

app.use("/api", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  applyChatEngineHeaders(res, null);
  return safeJson(res, 404, {
    ok: false,
    error: "NOT_FOUND",
    message: "Unknown API route.",
    path: req.originalUrl || req.url,
    requestId,
    contractVersion: NYX_CONTRACT_VERSION,
  });
});

/* ======================================================
   Global error handler
====================================================== */

app.use((err, req, res, next) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  applyChatEngineHeaders(res, null);
  console.error("[GLOBAL] error:", err && err.stack ? err.stack : err);
  return safeJson(res, 500, {
    ok: false,
    error: "INTERNAL_ERROR",
    message: "Unhandled server error.",
    detail: String(err && err.message ? err.message : err),
    requestId,
    contractVersion: NYX_CONTRACT_VERSION,
  });
});

/* ======================================================
   Listen
====================================================== */

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`[sandblast] up on :${PORT} | ${INDEX_VERSION} | commit=${GIT_COMMIT || "n/a"}`);
});
