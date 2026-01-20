"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v1.5.17s (CORS HARD-LOCK + TURN-CACHE DEDUPE: stops browser/proxy retry double-POST)
 *
 * Adds (vs v1.5.17r):
 *  ✅ TURN-CACHE DEDUPE (origin+visitor+turnId+text) with TTL (default 4000ms)
 *     - Catches real-world duplicate POSTs caused by browser/proxy retry (even if sessionId changes)
 *     - Runs BEFORE burst/body-hash guards so it won’t trip rate-limiters
 *     - Returns cached 200 JSON + sets X-Nyx-Deduped: turn-cache
 *
 * Keeps:
 *  ✅ HARD CORS ECHO middleware: if origin is allowed, ALWAYS sets Allow-Origin + Vary on all responses
 *  ✅ Guaranteed OPTIONS responder for ALL paths (204)
 *  ✅ Expanded default origins for sandblast.channel + sandblastchannel.com
 *  ✅ ANTI-502 crash visibility
 *  ✅ /health + /api/health + /api/version
 *  ✅ /api/chat loop guards + dedupe payload floors
 *  ✅ /api/tts + /api/voice soft-loaded + /api/tts/diag
 */

const express = require("express");
const crypto = require("crypto");
const cors = require("cors");

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

const app = express();
app.disable("x-powered-by");

/* ======================================================
   Version + Contract
====================================================== */

const NYX_CONTRACT_VERSION = "1";
const INDEX_VERSION =
  "index.js v1.5.17s (CORS HARD-LOCK + TURN-CACHE DEDUPE: stops browser/proxy retry double-POST)";

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
   CORS (MUST RUN BEFORE parsers + error handlers)
====================================================== */

const CORS_ALLOW_ALL = String(process.env.CORS_ALLOW_ALL || "false") === "true";

// Expanded defaults (covers both domains you’re using)
const DEFAULT_ORIGINS = [
  "https://sandblast.channel",
  "https://www.sandblast.channel",
  "https://sandblastchannel.com",
  "https://www.sandblastchannel.com",
];

const ALLOWED_ORIGINS = normalizeStr(process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

// If env empty, use defaults. If env provided, MERGE defaults (safety net).
// If you want env to be exclusive, set CORS_ENV_EXCLUSIVE=true.
const CORS_ENV_EXCLUSIVE = String(process.env.CORS_ENV_EXCLUSIVE || "false") === "true";

const EFFECTIVE_ORIGINS = (() => {
  if (ALLOWED_ORIGINS.length === 0) return DEFAULT_ORIGINS.slice();
  if (CORS_ENV_EXCLUSIVE) return ALLOWED_ORIGINS.slice();
  const set = new Set(DEFAULT_ORIGINS);
  for (const o of ALLOWED_ORIGINS) set.add(o);
  return Array.from(set);
})();

function originAllowed(origin) {
  if (!origin) return true; // curl/server-to-server
  if (CORS_ALLOW_ALL) return true;

  const o = String(origin).trim().replace(/\/$/, "");
  if (EFFECTIVE_ORIGINS.includes(o)) return true;

  // www <-> non-www toggle helper
  try {
    const u = new URL(o);
    const host = String(u.hostname || "");
    const altHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    const alt = `${u.protocol}//${altHost}${u.port ? `:${u.port}` : ""}`;
    return EFFECTIVE_ORIGINS.includes(alt);
  } catch (_) {
    return false;
  }
}

// NOTE: cors() will set headers for normal success responses,
// but we will ALSO hard-echo below to ensure early returns/errors are covered.
const corsOptions = {
  origin: function (origin, cb) {
    if (!origin) return cb(null, true);
    return cb(null, originAllowed(origin) ? origin : false);
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
    "X-Voice-Mode",
    "X-Session-Id",
    "X-SBNYX-Client-Build",
  ],
  exposedHeaders: [
    "X-Request-Id",
    "X-Contract-Version",
    "X-Voice-Mode",
    "X-Nyx-Deduped",
    "X-Nyx-Upstream",
    "X-CORS-Origin-Seen",
  ],
  maxAge: 86400,
  optionsSuccessStatus: 204,
};

// ✅ Always add Vary: Origin for proper caching behavior
app.use((req, res, next) => {
  safeSet(res, "Vary", "Origin");
  next();
});

// ✅ Standard CORS middleware
app.use(cors(corsOptions));

/**
 * ✅ HARD CORS ECHO (belt + suspenders)
 * If origin is allowed, force-set the response headers for ALL downstream paths
 * (including error handlers, floors, early returns).
 */
app.use((req, res, next) => {
  try {
    const origin = req.headers.origin ? String(req.headers.origin).trim() : "";
    safeSet(res, "X-CORS-Origin-Seen", origin || "");
    if (origin && originAllowed(origin)) {
      safeSet(res, "Access-Control-Allow-Origin", origin);
      safeSet(res, "Vary", "Origin");
      // (No credentials)
    }
  } catch (_) {}
  next();
});

/**
 * ✅ Guaranteed OPTIONS for ALL paths
 * (some browsers are picky; this keeps it deterministic)
 */
app.options("*", (req, res) => {
  const origin = req.headers.origin ? String(req.headers.origin).trim() : "";
  if (origin && originAllowed(origin)) {
    safeSet(res, "Access-Control-Allow-Origin", origin);
    safeSet(res, "Vary", "Origin");
  }
  safeSet(res, "Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  safeSet(res, "Access-Control-Allow-Headers", corsOptions.allowedHeaders.join(","));
  safeSet(res, "Access-Control-Max-Age", String(corsOptions.maxAge || 86400));
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  return res.sendStatus(204);
});

/* ======================================================
   Parsers (after CORS so even parse errors carry CORS)
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
====================================================== */

app.use((err, req, res, next) => {
  if (!err) return next();
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);

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
   Timeout middleware (socket timeout only)
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
const SESSION_TTL_MS = clamp(
  process.env.SESSION_TTL_MS || 6 * 60 * 60 * 1000,
  10 * 60 * 1000,
  24 * 60 * 60 * 1000
);
const SESSIONS = new Map();

function getClientIp(req) {
  const xf = normalizeStr(req.get("x-forwarded-for") || "");
  if (xf) return xf.split(",")[0].trim();
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

/** Strict patch apply: allowlist only + proto-safe */
const SESSION_PATCH_ALLOW = new Set([
  "lane",
  "visitorId",
  "lastMusicYear",
  "activeMusicMode",
  "voiceMode",
  "__lastIntentSig",
  "__lastIntentAt",
  "pendingLane",
  "pendingMode",
  "pendingYear",
  "recentTopic",
  "__lastReply",
  "__lastBodyHash",
  "__lastBodyAt",
  "__lastReplyHash",
  "__lastReplyAt",
  "__repAt",
  "__repCount",
  "__srAt",
  "__srCount",
]);

function applySessionPatch(session, patch) {
  if (!session || !patch || typeof patch !== "object") return;
  for (const [k, v] of Object.entries(patch)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (!SESSION_PATCH_ALLOW.has(k)) continue;
    session[k] = v;
  }
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
    SESSIONS.set(sessionId, s);
  }

  s._touchedAt = now;
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
   Diagnostics
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

app.get("/health", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  return safeJson(res, 200, healthPayload(requestId));
});
app.get("/Health", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  return safeJson(res, 200, healthPayload(requestId));
});
app.get("/api/health", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  return safeJson(res, 200, healthPayload(requestId));
});
app.get("/api/Health", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  return safeJson(res, 200, healthPayload(requestId));
});

app.get("/api/version", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  return safeJson(res, 200, {
    ok: true,
    requestId,
    contractVersion: NYX_CONTRACT_VERSION,
    indexVersion: INDEX_VERSION,
    commit: GIT_COMMIT,
    node: process.version,
    uptimeSec: Math.round(process.uptime()),
    env: {
      corsAllowAll: CORS_ALLOW_ALL,
      corsEnvExclusive: CORS_ENV_EXCLUSIVE,
      allowlistCount: EFFECTIVE_ORIGINS.length,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      maxSessions: MAX_SESSIONS,
      bodyHashIncludeSession: String(process.env.BODY_HASH_INCLUDE_SESSION || "false") === "true",
      sessionIdMaxLen: SESSION_ID_MAXLEN,
      turnDedupeMs: clamp(process.env.TURN_DEDUPE_MS || 4000, 800, 15000),
    },
    allowlistSample: EFFECTIVE_ORIGINS.slice(0, 10),
  });
});

/* ======================================================
   Hashing + intent helpers (unchanged)
====================================================== */

const MAX_HASH_TEXT_LEN = clamp(process.env.MAX_HASH_TEXT_LEN || 800, 200, 4000);

const BODY_HASH_INCLUDE_SESSION =
  String(process.env.BODY_HASH_INCLUDE_SESSION || "false") === "true";

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
   TURN-CACHE DEDUPE (stops browser/proxy retry double-POST)
====================================================== */

const TURN_DEDUPE_MS = clamp(process.env.TURN_DEDUPE_MS || 4000, 800, 15000);
const TURN_CACHE_MAX = clamp(process.env.TURN_CACHE_MAX || 800, 100, 5000);
const TURN_CACHE = new Map();

/**
 * Build a retry-proof key:
 * - Uses origin + visitor fingerprint + client.turnId + normalized text
 * - If turnId is missing, falls back to body-hash-only key
 * - Does NOT depend on sessionId (important!)
 */
function getTurnKey(req, body, text, visitorId) {
  const origin = normalizeStr(req.headers.origin || "");
  const fp = fingerprint(req, visitorId);
  const t = normalizeStr(text || "").slice(0, MAX_HASH_TEXT_LEN);

  let turnId = "";
  try {
    if (body && typeof body === "object" && body.client && typeof body.client === "object") {
      turnId = normalizeStr(body.client.turnId || "");
    }
  } catch (_) {
    turnId = "";
  }

  if (turnId) {
    return sha256(JSON.stringify({ o: origin, fp, turnId, t }));
  }

  // fallback: body hash (still helps for clients with no turn id)
  const bh = sha256(stableBodyForHash(body, req));
  return sha256(JSON.stringify({ o: origin, fp, bh }));
}

function pruneTurnCache() {
  const now = Date.now();
  for (const [k, v] of TURN_CACHE.entries()) {
    if (!v || now - Number(v.at || 0) > TURN_DEDUPE_MS) TURN_CACHE.delete(k);
  }
  // simple size cap
  if (TURN_CACHE.size > TURN_CACHE_MAX) {
    // delete oldest ~10%
    const entries = Array.from(TURN_CACHE.entries()).sort((a, b) => Number(a[1].at || 0) - Number(b[1].at || 0));
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

// Burst guard
const BURST_WINDOW_MS = clamp(process.env.BURST_WINDOW_MS || 1500, 600, 5000);
const BURST_SOFT_MAX = clamp(process.env.BURST_SOFT_MAX || 3, 1, 12);
const BURST_HARD_MAX = clamp(process.env.BURST_HARD_MAX || 14, 6, 60);
const BURSTS = new Map();

// Body hash dedupe
const BODY_DEDUPE_MS = clamp(process.env.BODY_DEDUPE_MS || 1600, 400, 5000);

// Intent clamp (separate knob)
const INTENT_DEDUPE_MS = clamp(process.env.INTENT_DEDUPE_MS || 2500, 600, 8000);

// Reply-loop kill (server-level)
const REPLY_DEDUPE_MS = clamp(process.env.REPLY_DEDUPE_MS || 1400, 300, 8000);
const REPLY_REPEAT_WINDOW_MS = clamp(process.env.REPLY_REPEAT_WINDOW_MS || 5000, 1000, 20000);
const REPLY_REPEAT_MAX = clamp(process.env.REPLY_REPEAT_MAX || 3, 1, 10);

// Sustained-rate guard (slow loop protection)
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

// ALWAYS return followUps as string[]
function normalizeFollowUpsToStrings(followUps) {
  if (!Array.isArray(followUps) || followUps.length === 0) return undefined;
  const seen = new Set();
  const out = [];
  for (const item of followUps) {
    let send = "";
    if (typeof item === "string") send = item;
    else if (item && typeof item === "object") send = normalizeStr(item.send || item.label || "");
    send = normalizeStr(send);
    const k = normCmd(send);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(send);
  }
  return out.length ? out : undefined;
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

function capsPayload() {
  return {
    music: true,
    movies: true,
    sponsors: true,
    schedule: true,
    tts: true,
  };
}

function dedupeOkPayload({ reply, sessionId, requestId, visitorId }) {
  return {
    ok: true,
    reply: String(reply || "OK.").trim(),
    sessionId,
    requestId,
    visitorId,
    contractVersion: NYX_CONTRACT_VERSION,
    caps: capsPayload(),
    deduped: true,
  };
}

app.post("/api/chat", async (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);

  const isDebug = String(req.query.debug || "") === "1";

  const once = respondOnce(res);
  const watchdog = setTimeout(() => {
    try {
      safeSet(res, "X-Nyx-Deduped", "timeout-floor");
      const vid = normalizeStr(req.get("X-Visitor-Id") || "") || null;
      return once.json(
        200,
        dedupeOkPayload({
          reply: "I’m here. Give me a year (1950–2024), or say “top 10 1988”.",
          sessionId: null,
          requestId,
          visitorId: vid,
        })
      );
    } catch (_) {}
  }, CHAT_HANDLER_TIMEOUT_MS);

  try {
    const body = req.body;
    const text = extractTextFromBody(body);

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

    // ===== TURN-CACHE (EARLY) =====
    pruneTurnCache();
    const turnKey = getTurnKey(req, body, text, visitorId);
    const cached = TURN_CACHE.get(turnKey);
    if (cached && Date.now() - Number(cached.at || 0) <= TURN_DEDUPE_MS) {
      clearTimeout(watchdog);
      safeSet(res, "X-Nyx-Deduped", "turn-cache");
      return once.json(200, cached.payload);
    }

    const sessionId = getSessionId(req, body, visitorId);
    const session = touchSession(sessionId, { visitorId }) || { sessionId };

    // Persist voiceMode from body/header into session
    const vmode = getVoiceMode(req, body);
    if (vmode) session.voiceMode = vmode;

    const now = Date.now();

    // Sustained-rate guard (slow loop protection)
    const srAt = Number(session.__srAt || 0);
    const srCount = Number(session.__srCount || 0);
    const srWithin = srAt && now - srAt < SR_WINDOW_MS;
    if (srWithin) {
      const next = srCount + 1;
      session.__srCount = next;
      if (next > SR_MAX) {
        clearTimeout(watchdog);
        safeSet(res, "X-Nyx-Deduped", "sustained");
        const payload = dedupeOkPayload({
          reply: session.__lastReply || "OK.",
          sessionId,
          requestId,
          visitorId,
        });
        TURN_CACHE.set(turnKey, { at: Date.now(), payload });
        return once.json(200, payload);
      }
    } else {
      session.__srAt = now;
      session.__srCount = 0;
    }

    // Burst guard (short window)
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
        const payload = dedupeOkPayload({
          reply: session.__lastReply || "OK.",
          sessionId,
          requestId,
          visitorId,
        });
        TURN_CACHE.set(turnKey, { at: Date.now(), payload });
        return once.json(200, payload);
      }
    }

    // Body-hash dedupe
    const bodyHash = sha256(stableBodyForHash(body, req));
    const lastHash = normalizeStr(session.__lastBodyHash || "");
    const lastAt = Number(session.__lastBodyAt || 0);
    if (lastHash && bodyHash === lastHash && lastAt && now - lastAt < BODY_DEDUPE_MS) {
      clearTimeout(watchdog);
      safeSet(res, "X-Nyx-Deduped", "body-hash");
      const payload = dedupeOkPayload({
        reply: session.__lastReply || "OK.",
        sessionId,
        requestId,
        visitorId,
      });
      TURN_CACHE.set(turnKey, { at: Date.now(), payload });
      return once.json(200, payload);
    }

    // Shadow (soft)
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

    // Chat handler
    const handler = pickChatHandler(chatEngine);
    let out = null;

    if (handler) {
      try {
        out = await Promise.resolve(handler({ text, session, requestId, debug: isDebug }));
      } catch (e) {
        if (isUpstreamQuotaError(e)) {
          safeSet(res, "X-Nyx-Upstream", "openai_insufficient_quota");
          safeSet(res, "X-Nyx-Deduped", "upstream-quota");
          const last = String(session.__lastReply || "").trim();
          out = {
            reply:
              last ||
              "Nyx is online, but the AI brain is temporarily out of fuel (OpenAI quota). Add billing/credits, then try again.",
            followUps: ["Try again", "Open radio", "Open TV"],
          };
        } else {
          console.error("[chatEngine] error (soft):", e && e.stack ? e.stack : e);
          out = null;
        }
      }
    }

    const reply =
      out && typeof out === "object" && typeof out.reply === "string" ? out.reply : fallbackReply(text);

    // Reply-loop kill
    const replyHash = sha256(String(reply || ""));
    const lastReplyHash = normalizeStr(session.__lastReplyHash || "");
    const lastReplyAt = Number(session.__lastReplyAt || 0);

    if (lastReplyHash && replyHash === lastReplyHash && lastReplyAt && now - lastReplyAt < REPLY_DEDUPE_MS) {
      clearTimeout(watchdog);
      safeSet(res, "X-Nyx-Deduped", "reply-hash");
      const payload = dedupeOkPayload({
        reply: session.__lastReply || reply || "OK.",
        sessionId,
        requestId,
        visitorId,
      });
      TURN_CACHE.set(turnKey, { at: Date.now(), payload });
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
        });
        TURN_CACHE.set(turnKey, { at: Date.now(), payload });
        return once.json(200, payload);
      }
    } else {
      session.__repAt = now;
      session.__repCount = 0;
    }

    const followUps =
      out && typeof out === "object" && Array.isArray(out.followUps)
        ? normalizeFollowUpsToStrings(out.followUps)
        : undefined;

    if (out && typeof out === "object" && out.sessionPatch && typeof out.sessionPatch === "object") {
      applySessionPatch(session, out.sessionPatch);
    }

    // Persist last seen
    session.__lastReply = reply;
    session.__lastBodyHash = bodyHash;
    session.__lastBodyAt = now;
    session.__lastReplyHash = replyHash;
    session.__lastReplyAt = now;

    // Intent signature clamp
    const sig = intentSigFrom(text, session);
    const lastSig = normalizeStr(session.__lastIntentSig || "");
    const lastSigAt = Number(session.__lastIntentAt || 0);
    if (lastSig && sig === lastSig && lastSigAt && now - lastSigAt < INTENT_DEDUPE_MS) {
      clearTimeout(watchdog);
      safeSet(res, "X-Nyx-Deduped", "intent-sig");
      const payload = dedupeOkPayload({
        reply: session.__lastReply || reply || "OK.",
        sessionId,
        requestId,
        visitorId,
      });
      TURN_CACHE.set(turnKey, { at: Date.now(), payload });
      return once.json(200, payload);
    }
    session.__lastIntentSig = sig;
    session.__lastIntentAt = now;

    const payload = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      caps: capsPayload(),
    };

    if (out && typeof out === "object") {
      if (typeof out.lane === "string") payload.lane = out.lane;
      if (out.year != null) payload.year = out.year;
      if (typeof out.mode === "string") payload.mode = out.mode;
      if (out.cog && typeof out.cog === "object") payload.cog = out.cog;
      if (out.caps && typeof out.caps === "object") {
        payload.caps = Object.assign({}, payload.caps, out.caps);
      }
    }

    if (shadow) payload.shadow = shadow;
    if (followUps) payload.followUps = followUps;

    if (isDebug && out && typeof out === "object") {
      if (out.baseMessage) payload.baseMessage = String(out.baseMessage);
      if (out._engine && typeof out._engine === "object") payload._engine = out._engine;
    }

    // Store turn-cache (final payload)
    TURN_CACHE.set(turnKey, { at: Date.now(), payload });

    clearTimeout(watchdog);
    return once.json(200, payload);
  } catch (e) {
    console.error("[/api/chat] handler-floor error:", e && e.stack ? e.stack : e);
    clearTimeout(watchdog);
    setContractHeaders(res, requestId);
    safeSet(res, "X-Nyx-Deduped", "floor");
    const vid = normalizeStr(req.get("X-Visitor-Id") || "") || null;
    const payload = dedupeOkPayload({
      reply: "I’m here. Give me a year (1950–2024), or say “top 10 1988”.",
      sessionId: null,
      requestId,
      visitorId: vid,
    });

    try {
      const turnKey = getTurnKey(req, req.body, extractTextFromBody(req.body), vid);
      TURN_CACHE.set(turnKey, { at: Date.now(), payload });
    } catch (_) {}

    return once.json(200, payload);
  }
});

/* ======================================================
   404 for /api/*
====================================================== */

app.use("/api", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
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
