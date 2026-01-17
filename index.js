"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v1.5.17k (ANTI-502 + PREFLIGHT HARDENED + REAL ROUTE TIMEOUT + UPSTREAM QUOTA FLOOR + DEBUG PASSTHRU + TTS DIAG)
 *
 * - Hard crash visibility (uncaughtException/unhandledRejection)
 * - Parsers first + JSON parse guard
 * - CORS safe preflight for all /api/* (guaranteed)
 * - /health + /api/health + /api/version
 * - /api/chat:
 *     * NEVER throws past route boundary (full try/catch)
 *     * Handles ALL chatEngine export shapes (function, handleChat, reply)
 *     * REAL timeout watchdog (respond-once floor) -> prevents hung handlers -> returns fallback 200
 *     * Burst guard (per-client) soft dedupe 200 + hard 429 (extreme only)
 *     * Request-body hash dedupe returns last reply 200 (stable; ignores sessionId by default)
 *     * Upstream OpenAI quota 429 -> stable 200 + headers (prevents client retry loops)
 *     * Debug passthru: baseMessage/_engine/cog (debug=1 only)
 * - /api/tts + /api/voice:
 *     * Soft-loaded and cannot brick boot
 *     * NEW: /api/tts/diag endpoint + 501 diag payload (export keys + load error)
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

/* ======================================================
   Version + Contract
====================================================== */

const NYX_CONTRACT_VERSION = "1";
const INDEX_VERSION =
  "index.js v1.5.17k (ANTI-502 chat route: export-shape safe + REAL timeout + burst + hash dedupe + preflight hardened + quota floor + debug passthru + tts diag)";

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

/** Stable body hashing.
 * IMPORTANT: ignores sessionId by default (session can churn on buggy clients).
 * If you truly want sessionId included, set BODY_HASH_INCLUDE_SESSION=true.
 */
const BODY_HASH_INCLUDE_SESSION = String(process.env.BODY_HASH_INCLUDE_SESSION || "false") === "true";
function stableBodyForHash(body) {
  const b = body && typeof body === "object" ? body : {};
  return JSON.stringify({
    text: normalizeStr(b.text || b.message || ""),
    visitorId: normalizeStr(b.visitorId || ""),
    contractVersion: normalizeStr(b.contractVersion || ""),
    voiceMode: normalizeStr(b.voiceMode || ""),
    mode: normalizeStr(b.mode || ""),
    year: b.year ?? null,
    sessionId: BODY_HASH_INCLUDE_SESSION ? normalizeStr(b.sessionId || "") : "",
  });
}

/* ======================================================
   Parsers FIRST
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
   CORS (bulletproof + GUARANTEED preflight for /api/*)
====================================================== */

const CORS_ALLOW_ALL = String(process.env.CORS_ALLOW_ALL || "false") === "true";
const ALLOWED_ORIGINS = normalizeStr(process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

function originAllowed(origin) {
  if (!origin) return true;
  if (CORS_ALLOW_ALL) return true;
  const o = String(origin).trim().replace(/\/$/, "");
  if (ALLOWED_ORIGINS.includes(o)) return true;

  // tolerate www flip
  try {
    const u = new URL(o);
    const host = String(u.hostname || "");
    const altHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    const alt = `${u.protocol}//${altHost}${u.port ? `:${u.port}` : ""}`;
    return ALLOWED_ORIGINS.includes(alt);
  } catch (_) {
    return false;
  }
}

const corsOptions = {
  origin: function (origin, cb) {
    return cb(null, originAllowed(origin));
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
  ],
  exposedHeaders: ["X-Request-Id", "X-Contract-Version", "X-Voice-Mode", "X-Nyx-Deduped", "X-Nyx-Upstream"],
  maxAge: 86400,
};

app.use(cors(corsOptions));

/** GUARANTEED preflight handler.
 * Express's "/api/*" matching can be surprising; this route always fires for /api/...
 */
app.use("/api", (req, res, next) => {
  if (req.method !== "OPTIONS") return next();
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);
  // cors() will attach allow headers appropriately
  return cors(corsOptions)(req, res, () => res.sendStatus(204));
});

/** Safety net: global OPTIONS (rarely needed but harmless) */
app.options("*", cors(corsOptions));

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

function getSessionId(req, body) {
  const b = body || {};
  const fromBody = normalizeStr(b.sessionId || "");
  const fromHeader = normalizeStr(req.get("X-Session-Id") || "");
  return fromBody || fromHeader || null;
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

  if (patch && typeof patch === "object") {
    for (const [k, v] of Object.entries(patch)) {
      if (k === "__proto__" || k === "constructor") continue;
      s[k] = v;
    }
  }

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
      allowlistCount: ALLOWED_ORIGINS.length,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      maxSessions: MAX_SESSIONS,
      bodyHashIncludeSession: BODY_HASH_INCLUDE_SESSION,
    },
  });
});

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

// initial soft-load
ttsModule = safeRequireTts();

// boot log
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

  // default export style
  if (mod.default && typeof mod.default === "function") return mod.default;

  // express router style
  if (mod.router && typeof mod.router === "function") return mod.router;

  // direct function
  if (typeof mod === "function") return mod;

  // known handler names
  if (typeof mod.handleTts === "function") return mod.handleTts;
  if (typeof mod.handle === "function") return mod.handle;
  if (typeof mod.tts === "function") return mod.tts;

  return null;
}

async function runTts(req, res) {
  const requestId = req.get("X-Request-Id") || rid();
  setContractHeaders(res, requestId);

  // lazy reload if boot failed
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
   /api/chat (ANTI-502)
====================================================== */

const CHAT_HANDLER_TIMEOUT_MS = clamp(process.env.CHAT_HANDLER_TIMEOUT_MS || 9000, 2000, 20000);

// Burst guard (soft-first)
const BURST_WINDOW_MS = clamp(process.env.BURST_WINDOW_MS || 1500, 600, 5000);
const BURST_SOFT_MAX = clamp(process.env.BURST_SOFT_MAX || 3, 1, 12);
const BURST_HARD_MAX = clamp(process.env.BURST_HARD_MAX || 14, 6, 60);
const BURSTS = new Map();

// Body hash dedupe
const BODY_DEDUPE_MS = clamp(process.env.BODY_DEDUPE_MS || 1600, 400, 5000);

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
  const bodyV = normalizeStr((body && body.contractVersion) || "");
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
    return `Locked in ${t}. Say “top 10”, “#1”, “story moment”, or “micro moment”.`;
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

/** Detect OpenAI insufficient_quota / quota exceeded errors from many shapes */
function isUpstreamQuotaError(e) {
  try {
    if (!e) return false;
    const msg = String(e.message || "");
    const stack = String(e.stack || "");
    const raw = msg + "\n" + stack;

    // common SDK shapes
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

/** Respond-once guard + route watchdog timer (REAL anti-hang).
 * If handler stalls past CHAT_HANDLER_TIMEOUT_MS, we return fallback 200.
 */
function respondOnce(res) {
  let sent = false;
  return {
    sent: () => sent || res.headersSent,
    json: (status, payload) => {
      if (sent || res.headersSent) return;
      sent = true;
      return safeJson(res, status, payload);
    },
    end: (status, text) => {
      if (sent || res.headersSent) return;
      sent = true;
      try {
        return res.status(status).type("text/plain").send(String(text || ""));
      } catch (_) {}
    },
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
      return once.json(200, {
        ok: true,
        reply: "I’m here. Give me a year (1950–2024), or say “top 10 1988”.",
        requestId,
        contractVersion: NYX_CONTRACT_VERSION,
        deduped: true,
      });
    } catch (_) {}
  }, CHAT_HANDLER_TIMEOUT_MS);

  try {
    const body = req.body || {};
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

    const sessionId = getSessionId(req, body) || rid();
    const visitorId =
      normalizeStr(body.visitorId || "") || normalizeStr(req.get("X-Visitor-Id") || "") || null;

    const session = touchSession(sessionId, { visitorId }) || { sessionId };

    // --- Burst guard (per client) ---
    const now = Date.now();
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
        return once.json(200, {
          ok: true,
          reply: String(session.__lastReply || "OK.").trim(),
          sessionId,
          requestId,
          visitorId,
          contractVersion: NYX_CONTRACT_VERSION,
          deduped: true,
        });
      }
    }

    // --- Body-hash dedupe (instant loop dampener) ---
    const bodyHash = sha256(stableBodyForHash(body));
    const lastHash = normalizeStr(session.__lastBodyHash || "");
    const lastAt = Number(session.__lastBodyAt || 0);
    if (lastHash && bodyHash === lastHash && lastAt && now - lastAt < BODY_DEDUPE_MS) {
      clearTimeout(watchdog);
      safeSet(res, "X-Nyx-Deduped", "body-hash");
      return once.json(200, {
        ok: true,
        reply: String(session.__lastReply || "OK.").trim(),
        sessionId,
        requestId,
        visitorId,
        contractVersion: NYX_CONTRACT_VERSION,
        deduped: true,
      });
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

    // Chat handler (shape-safe)
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

    const reply = out && typeof out === "object" && typeof out.reply === "string" ? out.reply : fallbackReply(text);

    const followUps =
      out && typeof out === "object" && Array.isArray(out.followUps) ? normalizeFollowUpsToStrings(out.followUps) : undefined;

    // Persist last seen
    session.__lastReply = reply;
    session.__lastBodyHash = bodyHash;
    session.__lastBodyAt = now;

    const payload = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
    };

    if (shadow) payload.shadow = shadow;
    if (followUps) payload.followUps = followUps;

    // DEBUG passthru (only debug=1)
    if (isDebug && out && typeof out === "object") {
      if (out.baseMessage) payload.baseMessage = String(out.baseMessage);
      if (out._engine && typeof out._engine === "object") payload._engine = out._engine;
      if (out.cog && typeof out.cog === "object") payload.cog = out.cog;
    }

    clearTimeout(watchdog);
    return once.json(200, payload);
  } catch (e) {
    console.error("[/api/chat] handler-floor error:", e && e.stack ? e.stack : e);
    clearTimeout(watchdog);
    setContractHeaders(res, requestId);
    safeSet(res, "X-Nyx-Deduped", "floor");
    return once.json(200, {
      ok: true,
      reply: "I’m here. Give me a year (1950–2024), or say “top 10 1988”.",
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
      deduped: true,
    });
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
