"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v1.5.17zd
 * (AUDITED FIX: intro loop + turn aging + routeHint carry + dedupe replay patch)
 */

const express = require("express");
const crypto = require("crypto");

/* ======================================================
   Hard crash visibility
====================================================== */

process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException:", err?.stack || err);
});
process.on("unhandledRejection", (err) => {
  console.error("[FATAL] unhandledRejection:", err?.stack || err);
});

/* ======================================================
   Optional modules (soft-load)
====================================================== */

let shadowBrain = null;
let chatEngine = null;
let ttsModule = null;

try {
  shadowBrain = require("./Utils/shadowBrain");
} catch (_) {}

try {
  chatEngine = require("./Utils/chatEngine");
} catch (_) {}

const app = express();
app.disable("x-powered-by");

/* ======================================================
   Trust proxy
====================================================== */

const TRUST_PROXY = String(process.env.TRUST_PROXY || "true") === "true";
if (TRUST_PROXY) app.set("trust proxy", 1);

/* ======================================================
   Version
====================================================== */

const NYX_CONTRACT_VERSION = "1";
const INDEX_VERSION =
  "index.js v1.5.17zd (INTRO PERSIST + TURNCOUNT PERSIST + ROUTEHINT CARRY + DEDUPE PATCH)";

const GIT_COMMIT =
  String(process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "").trim() || null;

/* ======================================================
   Helpers
====================================================== */

function rid() {
  return crypto.randomBytes(8).toString("hex");
}
function normalizeStr(x) {
  return String(x == null ? "" : x).trim();
}
function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}
function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

/* ======================================================
   SESSION PATCH — ALLOWLIST (FIXED)
====================================================== */

const SERVER_OWNED_KEYS = new Set([
  "__lastBridgeAt",
  "__bridgeIdx",
  "__lastPosture",
  "__lastRokuCtaAt",
  "__rokuCtaCount",
]);

const SESSION_PATCH_ALLOW = new Set([
  // 🔴 FIX #1 + #2
  "__introDone",
  "turnCount",

  "introDone",
  "introAt",
  "lane",
  "pendingLane",
  "pendingMode",
  "pendingYear",
  "lastLane",
  "lastYear",
  "lastMode",
  "activeMusicMode",
  "lastMusicYear",
  "year",
  "mode",

  "__cs1",
  "cog",

  "__lastIntentSig",
  "__lastIntentAt",
  "__lastReply",
  "__lastReplyHash",
  "__lastReplyAt",
  "__lastBodyHash",
  "__lastBodyAt",
]);

function sanitizeCogObject(obj) {
  if (!obj || typeof obj !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "__proto__" || k === "constructor") continue;
    if (typeof v === "string") out[k] = v.slice(0, 256);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

function applySessionPatch(session, patch) {
  if (!session || !patch) return;
  for (const [k, v] of Object.entries(patch)) {
    if (SERVER_OWNED_KEYS.has(k)) continue;
    if (!SESSION_PATCH_ALLOW.has(k)) continue;

    if (k === "cog") {
      const s = sanitizeCogObject(v);
      if (s) session.cog = s;
      continue;
    }

    session[k] = v;
  }
}

/* ======================================================
   In-memory sessions
====================================================== */

const SESSIONS = new Map();
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

function touchSession(id, patch) {
  const now = Date.now();
  let s = SESSIONS.get(id);
  if (!s) {
    s = { sessionId: id, _createdAt: now };
    SESSIONS.set(id, s);
  }
  s._touchedAt = now;
  if (patch) applySessionPatch(s, patch);
  return s;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of SESSIONS.entries()) {
    if (now - (v._touchedAt || v._createdAt) > SESSION_TTL_MS) {
      SESSIONS.delete(k);
    }
  }
}, 60000).unref();

/* ======================================================
   CORS (unchanged)
====================================================== */

app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.set("Access-Control-Allow-Headers", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ======================================================
   Parsers
====================================================== */

app.use(express.json({ limit: "1mb" }));
app.use(express.text({ type: ["text/*"], limit: "1mb" }));

/* ======================================================
   /api/version
====================================================== */

app.get("/api/version", (req, res) => {
  res.json({
    ok: true,
    indexVersion: INDEX_VERSION,
    commit: GIT_COMMIT,
    node: process.version,
  });
});

/* ======================================================
   /api/chat
====================================================== */

const TURN_CACHE = new Map();
const TURN_DEDUPE_MS = 4000;

function getTurnKey(req, body) {
  return sha256(JSON.stringify({ t: body?.text || "", o: req.headers.origin || "" }));
}

app.post("/api/chat", async (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);

  const body = req.body || {};
  const text = normalizeStr(body.text || body.message || "");

  const sessionId =
    normalizeStr(body.sessionId) ||
    normalizeStr(req.get("X-Session-Id")) ||
    sha256(req.ip + req.get("user-agent")).slice(0, 24);

  const session = touchSession(sessionId, {});

  // 🔴 FIX #3 — carry lane forward if routeHint missing
  let routeHint =
    body?.client?.routeHint ||
    body?.routeHint ||
    session.lane ||
    null;

  const turnKey = getTurnKey(req, body);
  const cached = TURN_CACHE.get(turnKey);

  if (cached && Date.now() - cached.at < TURN_DEDUPE_MS) {
    // 🔴 FIX #4 — apply cached sessionPatch BEFORE replay
    if (cached.payload?.sessionPatch) {
      applySessionPatch(session, cached.payload.sessionPatch);
    }
    return res.json(cached.payload);
  }

  let out = null;
  if (chatEngine && typeof chatEngine.chatEngine === "function") {
    out = await chatEngine.chatEngine({
      text,
      session,
      requestId,
      routeHint,
    });
  }

  if (out?.sessionPatch) {
    applySessionPatch(session, out.sessionPatch);
  }

  const payload = {
    ok: true,
    reply: out?.reply || "Tell me a year.",
    lane: out?.lane || session.lane || "general",
    followUps: out?.followUps,
    sessionPatch: out?.sessionPatch,
    cog: out?.cog,
    requestId,
    serverBuild: INDEX_VERSION,
  };

  TURN_CACHE.set(turnKey, { at: Date.now(), payload });
  return res.json(payload);
});

/* ======================================================
   Listen
====================================================== */

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`[sandblast] up on :${PORT} | ${INDEX_VERSION}`);
});
