"use strict";

/**
 * Sandblast Backend — app.js
 *
 * app.js v1.5.21
 * Canonical backend entrypoint.
 * Contains Express server, Cognitive OS, routing, lanes, TTS, sessions, profiles.
 */

const express = require("express");
const crypto = require("crypto");
const cors = require("cors");

/* ======================================================
   App bootstrap
====================================================== */

const app = express();

/* ======================================================
   Version + Contract
====================================================== */

const NYX_CONTRACT_VERSION = "1";
const INDEX_VERSION =
  "app.js v1.5.21 (COG CANONICAL + FINAL SYNC: canonical phases/states + final-reply cog sync)";

/* ======================================================
   Raw body capture
====================================================== */

function rawBodySaver(req, res, buf, encoding) {
  try {
    if (buf && buf.length) req.rawBody = buf.toString(encoding || "utf8");
  } catch (_) {}
}

app.use(
  express.json({
    limit: "1mb",
    verify: rawBodySaver,
  })
);

app.use(
  express.text({
    type: ["text/*"],
    limit: "1mb",
    verify: rawBodySaver,
  })
);

/* ======================================================
   Timeout middleware
====================================================== */

const REQUEST_TIMEOUT_MS = Math.max(
  10000,
  Math.min(60000, Number(process.env.REQUEST_TIMEOUT_MS || 30000))
);

app.use((req, res, next) => {
  try {
    res.setTimeout(REQUEST_TIMEOUT_MS);
  } catch (_) {}
  next();
});

/* ======================================================
   CORS
====================================================== */

function parseAllowedOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || "").trim();
  const defaults = ["http://localhost:3000", "http://127.0.0.1:3000"];
  const list = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  return Array.from(new Set([...defaults, ...list]));
}

const ALLOWED_ORIGINS = parseAllowedOrigins();
const CORS_ALLOW_ALL = String(process.env.CORS_ALLOW_ALL || "false") === "true";
const CONTRACT_STRICT =
  String(process.env.CONTRACT_STRICT || "false") === "true";

function normalizeOrigin(origin) {
  const o = String(origin || "").trim();
  return o.replace(/\/$/, "");
}

function originMatchesAllowlist(origin) {
  const o = normalizeOrigin(origin);
  if (!o) return false;
  if (ALLOWED_ORIGINS.includes(o)) return true;

  try {
    const u = new URL(o);
    const host = u.hostname;
    const alt = `${u.protocol}//${host.startsWith("www.") ? host.slice(4) : "www." + host}`;
    return ALLOWED_ORIGINS.includes(alt);
  } catch {
    return false;
  }
}

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (CORS_ALLOW_ALL) return cb(null, true);
    if (originMatchesAllowlist(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Accept",
    "Authorization",
    "X-Requested-With",
    "X-Visitor-Id",
    "X-Contract-Version",
    "X-Request-Id",
  ],
  exposedHeaders: ["X-Request-Id", "X-Contract-Version", "X-Voice-Mode"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* ======================================================
   Helpers
====================================================== */

function rid() {
  return crypto.randomBytes(8).toString("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(s) {
  return String(s || "")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clampYear(y) {
  if (!Number.isFinite(y)) return null;
  if (y < 1950 || y > 2024) return null;
  return y;
}

/* ======================================================
   Cognitive OS — Canonical
====================================================== */

const COG_PHASE = Object.freeze({
  IDLE: "idle",
  ENGAGED: "engaged",
  GUIDING: "guiding",
  EXPLAINING: "explaining",
  DECIDING: "deciding",
  HANDOFF: "handoff",
});

const COG_STATE = Object.freeze({
  IDLE: "idle",
  READY: "ready",
  COLLECT: "collect",
  CONFIDENT: "confident",
  CAUTIOUS: "cautious",
  ACTIVE: "active",
});

function initCog(session) {
  if (!session) return;
  session.cogPhase ||= COG_PHASE.IDLE;
  session.cogState ||= COG_STATE.READY;
  session.cogReason ||= "";
  session.cogTs ||= 0;
}

function setCog(session, phase, state, reason) {
  if (!session) return;
  initCog(session);
  session.cogPhase = phase;
  session.cogState = state;
  session.cogReason = cleanText(reason || "");
  session.cogTs = Date.now();
}

function deriveCogFromFinalReply(session, reply) {
  const r = cleanText(reply).toLowerCase();
  if (/next:|running|locked in|i’m going to run|i'm going to run/.test(r)) {
    return { phase: COG_PHASE.GUIDING, state: COG_STATE.CONFIDENT, reason: "final:guiding" };
  }
  if (/choose|pick one|options:/.test(r)) {
    return { phase: COG_PHASE.DECIDING, state: COG_STATE.CONFIDENT, reason: "final:deciding" };
  }
  if (/because|context|history|here’s/.test(r)) {
    return { phase: COG_PHASE.EXPLAINING, state: COG_STATE.CONFIDENT, reason: "final:explaining" };
  }
  return {
    phase: session?.cogPhase || COG_PHASE.ENGAGED,
    state: session?.cogState || COG_STATE.READY,
    reason: session?.cogReason || "",
  };
}

/* ======================================================
   Sessions
====================================================== */

const SESSIONS = new Map();

function issueSessionId() {
  return `s_${rid()}_${Date.now().toString(36)}`;
}

function getSession(sessionId) {
  if (!SESSIONS.has(sessionId)) {
    SESSIONS.set(sessionId, {
      id: sessionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastYear: null,
      activeMusicMode: null,
      lane: "music",
      cogPhase: COG_PHASE.IDLE,
      cogState: COG_STATE.READY,
      cogReason: "",
      cogTs: 0,
      lastReply: null,
    });
  }
  const s = SESSIONS.get(sessionId);
  s.updatedAt = Date.now();
  initCog(s);
  return s;
}

/* ======================================================
   Optional Lanes
====================================================== */

let musicKnowledge = null;
try { musicKnowledge = require("./Utils/musicKnowledge"); } catch {}
let sponsorsLane = null;
try { sponsorsLane = require("./Utils/sponsorsLane"); } catch {}
let moviesLane = null;
try { moviesLane = require("./Utils/moviesLane"); } catch {}
let scheduleLane = null;
try { scheduleLane = require("./Utils/scheduleLane"); } catch {}

/* ======================================================
   Core Engine
====================================================== */

async function runEngine(text, session) {
  if (musicKnowledge?.handleChat) {
    return musicKnowledge.handleChat({ text, session }) || {};
  }
  return {
    reply: "Drop a year (1950–2024). Then choose: Top 10, Story moment, or Micro moment.",
  };
}

/* ======================================================
   API: chat
====================================================== */

app.post("/api/chat", async (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);
  res.set("X-Contract-Version", NYX_CONTRACT_VERSION);
  res.set("Cache-Control", "no-store");

  const message = cleanText(req.body?.text || req.body?.message || "");
  let sessionId = cleanText(req.body?.sessionId || "");
  if (!sessionId) sessionId = issueSessionId();

  const session = getSession(sessionId);

  const out = await runEngine(message, session);
  const reply = cleanText(out.reply || "");

  session.lastReply = reply;

  const cog = deriveCogFromFinalReply(session, reply);
  setCog(session, cog.phase, cog.state, cog.reason);

  return res.json({
    ok: true,
    reply,
    sessionId,
    requestId,
    contractVersion: NYX_CONTRACT_VERSION,
    cog: {
      phase: session.cogPhase,
      state: session.cogState,
      reason: session.cogReason,
      ts: session.cogTs,
    },
  });
});

/* ======================================================
   API: health
====================================================== */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "sandblast-backend",
    time: nowIso(),
    version: INDEX_VERSION,
    sessions: SESSIONS.size,
  });
});

/* ======================================================
   Start server
====================================================== */

function start() {
  const PORT = Number(process.env.PORT || 10000);
  const HOST = "0.0.0.0";

  const server = app.listen(PORT, HOST, () => {
    console.log(`[sandblast-backend] up :${PORT}`);
  });

  try {
    server.requestTimeout = REQUEST_TIMEOUT_MS;
    server.headersTimeout = REQUEST_TIMEOUT_MS + 5000;
  } catch {}
}

module.exports = { start };

if (require.main === module) {
  start();
}
