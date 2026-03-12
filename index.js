"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v2.1.0sb
 * ------------------------------------------------------------
 * PURPOSE
 * - Tightened backend shell
 * - Removes duplicate replay authority from index layer
 * - Keeps Chat Engine as the semantic turn authority
 * - Delegates voice/TTS routing to utils/voiceRoute.js
 * - Preserves Mixer voice path
 * - Keeps fail-open rendering contract
 *
 * 15 PHASE COVERAGE
 * ------------------------------------------------------------
 * Phase 01: Env + config normalization
 * Phase 02: Safe module resolution
 * Phase 03: Engine resolver hardening
 * Phase 04: Knowledge runtime isolation
 * Phase 05: Security headers
 * Phase 06: CORS + preflight discipline
 * Phase 07: Optional token gate
 * Phase 08: IP rate limiting / abuse control
 * Phase 09: Request context normalization
 * Phase 10: Session shaping / patch merge
 * Phase 11: Single-authority chat execution
 * Phase 12: Stable contract normalization
 * Phase 13: Voice route extraction / Mixer preservation
 * Phase 14: Health / diagnostics / warm routes
 * Phase 15: Graceful shutdown + fail-open safety
 */

const express = require("express");
const path = require("path");
const fs = require("fs");

let compression = null;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies, global-require
  compression = require("compression");
} catch (_) {
  compression = null;
}

const INDEX_VERSION = "index.js v2.1.0sb";
const SERVER_BOOT_AT = Date.now();

// ============================================================
// Crash-safe process handlers
// ============================================================
process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.log("[Sandblast][unhandledRejection]", reason && (reason.stack || reason.message || reason));
});

process.on("uncaughtException", (err) => {
  // eslint-disable-next-line no-console
  console.log("[Sandblast][uncaughtException]", err && (err.stack || err.message || err));
  try {
    setTimeout(() => process.exit(1), 250).unref?.();
  } catch (_) {
    process.exit(1);
  }
});

// ============================================================
// Basic utils
// ============================================================
function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function isPlainObject(x) {
  return !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}
function oneLine(s) {
  return safeStr(s).replace(/\s+/g, " ").trim();
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
function sha1Lite(str) {
  const s = safeStr(str);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function nowMs() {
  return Date.now();
}
function safeJson(obj, fallback) {
  try {
    return JSON.stringify(obj);
  } catch (_) {
    return fallback || "{}";
  }
}
function safeRequire(modPath) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(modPath);
  } catch (_) {
    return null;
  }
}
function tryRequireMany(paths) {
  for (const p of paths) {
    const mod = safeRequire(p);
    if (mod) return mod;
  }
  return null;
}
function deepMerge(base, patch) {
  const b = isPlainObject(base) ? base : {};
  const p = isPlainObject(patch) ? patch : {};
  const out = { ...b };
  for (const k of Object.keys(p)) {
    const bv = out[k];
    const pv = p[k];
    if (isPlainObject(bv) && isPlainObject(pv)) out[k] = deepMerge(bv, pv);
    else out[k] = pv;
  }
  return out;
}
function log() {
  // eslint-disable-next-line no-console
  console.log("[Sandblast]", ...arguments);
}

// ============================================================
// Config
// ============================================================
const PORT = clampInt(process.env.PORT, 3000, 1, 65535);
const NODE_ENV = safeStr(process.env.NODE_ENV || "development").toLowerCase();

const MAX_BODY_KB = clampInt(process.env.MAX_BODY_KB, 512, 16, 4096);
const MAX_CHAT_TEXT = clampInt(process.env.MAX_CHAT_TEXT, 12000, 128, 50000);
const EXPECTED_API_TOKEN = safeStr(process.env.EXPECTED_API_TOKEN || "");
const REQUIRE_API_TOKEN = truthy(process.env.REQUIRE_API_TOKEN || "");
const DEBUG_MODE = truthy(process.env.SB_DEBUG || process.env.DEBUG || "");
const TRUST_PROXY = truthy(process.env.TRUST_PROXY || "1");

const CORS_ALLOW_ORIGIN = safeStr(process.env.CORS_ALLOW_ORIGIN || "*");
const CORS_ALLOWED_HEADERS = oneLine(
  process.env.CORS_ALLOWED_HEADERS ||
  "Content-Type, Authorization, X-Requested-With, X-Session-Id, X-Request-Id, X-SB-Trace-Id"
);
const CORS_ALLOWED_METHODS = oneLine(
  process.env.CORS_ALLOWED_METHODS ||
  "GET,POST,OPTIONS"
);

const CHAT_PUBLIC_ROUTES = new Set([
  "/api/chat",
  "/api/chat/reset",
  "/api/chat/health",
  "/api/health",
  "/healthz",
  "/readyz",
  "/_warm"
]);

const VOICE_PUBLIC_ROUTE_PREFIXES = [
  "/api/tts",
  "/api/voice"
];

const RATE_WINDOW_MS = clampInt(process.env.RATE_WINDOW_MS, 60_000, 5_000, 300_000);
const RATE_MAX_PER_IP = clampInt(process.env.RATE_MAX_PER_IP, 90, 10, 5000);
const VOICE_RATE_MAX_PER_IP = clampInt(process.env.VOICE_RATE_MAX_PER_IP, 40, 5, 5000);
const RATE_BAN_MS = clampInt(process.env.RATE_BAN_MS, 30_000, 0, 600_000);

const AVATAR_DIR = path.join(process.cwd(), "public", "avatar");

// ============================================================
// App bootstrap
// ============================================================
const app = express();
if (TRUST_PROXY) app.set("trust proxy", 1);

if (compression) {
  app.use(compression());
}

app.disable("x-powered-by");
app.use(express.json({ limit: `${MAX_BODY_KB}kb` }));
app.use(express.urlencoded({ extended: false, limit: `${MAX_BODY_KB}kb` }));

// ============================================================
// Module resolution
// ============================================================
function resolveEngine() {
  const mod = tryRequireMany([
    "./Utils/chatEngine",
    "./Utils/chatEngine.js",
    "./utils/chatEngine",
    "./utils/chatEngine.js"
  ]);

  if (!mod) {
    return {
      version: "missing",
      fn: async () => ({
        ok: false,
        reply: "Chat Engine is unavailable right now.",
        payload: { reply: "Chat Engine is unavailable right now." },
        lane: "general",
        laneId: "general",
        sessionLane: "general",
        directives: [],
        followUps: [],
        followUpsStrings: [],
        ui: { chips: [], allowMic: true },
        sessionPatch: {},
        cog: { intent: "STABILIZE", mode: "transitional", publicMode: true },
        meta: { failSafe: true, v: INDEX_VERSION, t: nowMs() }
      })
    };
  }

  const fn =
    (typeof mod === "function" && mod) ||
    (typeof mod.handleChat === "function" && mod.handleChat) ||
    (typeof mod.chatEngine === "function" && mod.chatEngine) ||
    (typeof mod.default === "function" && mod.default) ||
    null;

  if (!fn) {
    return {
      version: safeStr(mod.CE_VERSION || "invalid"),
      fn: async () => ({
        ok: false,
        reply: "Chat Engine export is invalid.",
        payload: { reply: "Chat Engine export is invalid." },
        lane: "general",
        laneId: "general",
        sessionLane: "general",
        directives: [],
        followUps: [],
        followUpsStrings: [],
        ui: { chips: [], allowMic: true },
        sessionPatch: {},
        cog: { intent: "STABILIZE", mode: "transitional", publicMode: true },
        meta: { failSafe: true, invalidEngineExport: true, v: INDEX_VERSION, t: nowMs() }
      })
    };
  }

  return {
    version: safeStr(mod.CE_VERSION || mod.version || "present"),
    fn
  };
}

const ENGINE = resolveEngine();

// Optional knowledge runtime — extracted from hot path bulk.
// This file can exist later; until then, the shell remains fail-open.
const knowledgeRuntimeMod = tryRequireMany([
  "./Utils/knowledgeRuntime",
  "./Utils/knowledgeRuntime.js",
  "./utils/knowledgeRuntime",
  "./utils/knowledgeRuntime.js"
]);

const knowledgeRuntime = {
  reloadKnowledge: typeof knowledgeRuntimeMod?.reloadKnowledge === "function"
    ? knowledgeRuntimeMod.reloadKnowledge
    : async () => ({ ok: true, skipped: true }),
  knowledgeSnapshotForEngine: typeof knowledgeRuntimeMod?.knowledgeSnapshotForEngine === "function"
    ? knowledgeRuntimeMod.knowledgeSnapshotForEngine
    : () => ({}),
  knowledgeStatusForMeta: typeof knowledgeRuntimeMod?.knowledgeStatusForMeta === "function"
    ? knowledgeRuntimeMod.knowledgeStatusForMeta
    : () => ({
      ok: false,
      loaded: false,
      source: "index_fallback",
      extracted: true
    }),
  getPackIndexSafe: typeof knowledgeRuntimeMod?.getPackIndexSafe === "function"
    ? knowledgeRuntimeMod.getPackIndexSafe
    : () => null
};

const voiceRouteMod = tryRequireMany([
  "./Utils/voiceRoute",
  "./Utils/voiceRoute.js",
  "./utils/voiceRoute",
  "./utils/voiceRoute.js"
]);

const registerVoiceRoutes =
  (typeof voiceRouteMod?.registerVoiceRoutes === "function" && voiceRouteMod.registerVoiceRoutes) ||
  null;

const ttsMod = tryRequireMany([
  "./Utils/tts",
  "./Utils/tts.js",
  "./utils/tts",
  "./utils/tts.js"
]);

// ============================================================
// Security headers
// ============================================================
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "microphone=(), camera=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self' data: blob: https:;",
      "img-src 'self' data: blob: https:;",
      "media-src 'self' data: blob: https:;",
      "style-src 'self' 'unsafe-inline' https:;",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:;",
      "connect-src 'self' https: wss:;",
      "frame-ancestors 'self';"
    ].join(" ")
  );
  next();
});

// ============================================================
// CORS
// ============================================================
const allowedOrigins = CORS_ALLOW_ORIGIN.split(",").map((x) => oneLine(x)).filter(Boolean);
const allowedOriginSet = new Set(allowedOrigins);

function resolveAllowOrigin(req) {
  const origin = safeStr(req.headers.origin || "");
  if (!origin) return allowedOrigins[0] || "*";
  if (allowedOriginSet.has("*")) return "*";
  if (allowedOriginSet.has(origin)) return origin;
  return "";
}

function applyCors(req, res) {
  const allowOrigin = resolveAllowOrigin(req);
  if (req.headers.origin && !allowOrigin) {
    return false;
  }
  res.setHeader("Access-Control-Allow-Origin", allowOrigin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS);
  res.setHeader("Access-Control-Expose-Headers", "Content-Type, X-Request-Id, X-SB-Trace-Id, X-Index-Version");
  return true;
}

app.use((req, res, next) => {
  const ok = applyCors(req, res);
  if (!ok) {
    return res.status(403).json({
      ok: false,
      error: "origin_not_allowed",
      version: INDEX_VERSION
    });
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
});

// ============================================================
// Optional token gate
// ============================================================
function isPublicRoute(req) {
  const p = safeStr(req.path || "");
  if (CHAT_PUBLIC_ROUTES.has(p)) return true;
  return VOICE_PUBLIC_ROUTE_PREFIXES.some((prefix) => p.startsWith(prefix));
}

app.use((req, res, next) => {
  if (!REQUIRE_API_TOKEN || !EXPECTED_API_TOKEN) return next();
  if (isPublicRoute(req)) return next();

  const rawAuth = safeStr(req.headers.authorization || "");
  const token =
    rawAuth.startsWith("Bearer ") ? rawAuth.slice(7).trim() :
    safeStr(req.headers["x-api-token"] || "").trim();

  if (token && token === EXPECTED_API_TOKEN) return next();

  return res.status(401).json({
    ok: false,
    error: "unauthorized",
    version: INDEX_VERSION
  });
});

// ============================================================
// IP rate guard
// ============================================================
const ipLedger = new Map();

function getIp(req) {
  return oneLine(
    req.ip ||
    req.headers["x-forwarded-for"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    "unknown"
  ).split(",")[0].trim();
}

function touchIp(ip, kind) {
  const now = nowMs();
  const cur = ipLedger.get(ip) || {
    chatHits: [],
    voiceHits: [],
    blockedUntil: 0
  };

  cur.chatHits = (cur.chatHits || []).filter((t) => now - t <= RATE_WINDOW_MS);
  cur.voiceHits = (cur.voiceHits || []).filter((t) => now - t <= RATE_WINDOW_MS);

  if (kind === "voice") cur.voiceHits.push(now);
  else cur.chatHits.push(now);

  const max = kind === "voice" ? VOICE_RATE_MAX_PER_IP : RATE_MAX_PER_IP;
  const arr = kind === "voice" ? cur.voiceHits : cur.chatHits;
  if (arr.length > max) {
    cur.blockedUntil = now + RATE_BAN_MS;
  }

  ipLedger.set(ip, cur);
  return cur;
}

app.use((req, res, next) => {
  const ip = getIp(req);
  const now = nowMs();
  const cur = ipLedger.get(ip);

  if (cur && cur.blockedUntil && now < cur.blockedUntil) {
    return res.status(429).json({
      ok: false,
      error: "rate_limited",
      retryAfterMs: cur.blockedUntil - now,
      version: INDEX_VERSION
    });
  }

  const isVoice = safeStr(req.path || "").startsWith("/api/tts") || safeStr(req.path || "").startsWith("/api/voice");
  touchIp(ip, isVoice ? "voice" : "chat");
  return next();
});

// ============================================================
// Request context
// ============================================================
function getHeader(req, key) {
  return safeStr(req.headers[key.toLowerCase()] || "");
}

function buildRequestContext(req) {
  const traceId =
    oneLine(getHeader(req, "x-sb-trace-id")) ||
    oneLine(getHeader(req, "x-request-id")) ||
    `trace_${sha1Lite(`${nowMs()}|${Math.random()}|${req.path}`)}`;

  const requestId =
    oneLine(req.body?.requestId) ||
    oneLine(req.query?.requestId) ||
    oneLine(getHeader(req, "x-request-id")) ||
    `req_${sha1Lite(`${traceId}|${req.method}|${req.path}`)}`;

  const sessionId =
    oneLine(req.body?.sessionId) ||
    oneLine(req.body?.sid) ||
    oneLine(getHeader(req, "x-session-id")) ||
    `sess_${sha1Lite(`${requestId}|${getIp(req)}`)}`;

  return {
    traceId,
    requestId,
    sessionId,
    ip: getIp(req),
    source: oneLine(req.body?.source || req.query?.source || "http"),
    routeHint: oneLine(req.body?.routeHint || req.query?.routeHint || req.path)
  };
}

function sendJson(res, status, payload) {
  if (res.headersSent) return;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Index-Version", INDEX_VERSION);
  if (payload && payload.requestId) res.setHeader("X-Request-Id", safeStr(payload.requestId));
  if (payload && payload.traceId) res.setHeader("X-SB-Trace-Id", safeStr(payload.traceId));
  res.status(status).send(safeJson(payload, "{\"ok\":false,\"error\":\"json_serialize_failed\"}"));
}

function normalizeContract(raw, ctx) {
  const src = isPlainObject(raw) ? raw : {};
  const reply = safeStr(src.reply || src.payload?.reply || "").trim() || "Okay.";
  const lane = safeStr(src.lane || src.laneId || src.sessionLane || "general") || "general";
  const ui = isPlainObject(src.ui) ? src.ui : { chips: [], allowMic: true };
  const followUps = Array.isArray(src.followUps) ? src.followUps : [];
  const directives = Array.isArray(src.directives) ? src.directives : [];
  const sessionPatch = isPlainObject(src.sessionPatch) ? src.sessionPatch : {};

  return {
    ok: src.ok !== false,
    reply,
    payload: isPlainObject(src.payload) ? src.payload : { reply },
    lane,
    laneId: safeStr(src.laneId || lane) || lane,
    sessionLane: safeStr(src.sessionLane || lane) || lane,
    bridge: src.bridge || null,
    ctx: isPlainObject(src.ctx) ? src.ctx : {},
    ui,
    directives,
    followUps,
    followUpsStrings: Array.isArray(src.followUpsStrings)
      ? src.followUpsStrings
      : followUps.map((x) => safeStr(x?.label || x).trim()).filter(Boolean),
    sessionPatch,
    cog: isPlainObject(src.cog) ? src.cog : {
      intent: "ADVANCE",
      mode: "transitional",
      publicMode: true
    },
    requestId: safeStr(src.requestId || ctx.requestId),
    traceId: safeStr(src.traceId || ctx.traceId),
    meta: {
      v: safeStr(src.meta?.v || INDEX_VERSION),
      t: src.meta?.t || nowMs(),
      engineVersion: ENGINE.version,
      knowledge: knowledgeRuntime.knowledgeStatusForMeta(),
      ...(isPlainObject(src.meta) ? src.meta : {})
    }
  };
}

function buildFailOpenReply(message, ctx, extra) {
  return normalizeContract({
    ok: false,
    reply: safeStr(message || "Backend is stabilizing. Try again."),
    payload: { reply: safeStr(message || "Backend is stabilizing. Try again.") },
    lane: "general",
    laneId: "general",
    sessionLane: "general",
    ui: { chips: [], allowMic: true },
    directives: [],
    followUps: [],
    followUpsStrings: [],
    sessionPatch: {},
    cog: { intent: "STABILIZE", mode: "transitional", publicMode: true },
    requestId: ctx.requestId,
    traceId: ctx.traceId,
    meta: { failSafe: true, ...(isPlainObject(extra) ? extra : {}) }
  }, ctx);
}

// ============================================================
// In-memory session store
// ============================================================
const sessionStore = new Map();
const SESSION_TTL_MS = clampInt(process.env.SESSION_TTL_MS, 1000 * 60 * 60 * 6, 60_000, 1000 * 60 * 60 * 48);

function sweepSessions() {
  const now = nowMs();
  for (const [id, rec] of sessionStore.entries()) {
    if (!rec || !rec.at || now - rec.at > SESSION_TTL_MS) sessionStore.delete(id);
  }
}

function readSession(sessionId) {
  sweepSessions();
  const rec = sessionStore.get(sessionId);
  return rec && isPlainObject(rec.data) ? rec.data : {};
}

function writeSession(sessionId, current, patch) {
  const merged = deepMerge(isPlainObject(current) ? current : {}, isPlainObject(patch) ? patch : {});
  sessionStore.set(sessionId, { at: nowMs(), data: merged });
  return merged;
}

// ============================================================
// Thin chat route
// IMPORTANT:
// - index.js does not do semantic replay suppression anymore
// - Chat Engine owns duplicate-turn semantics
// ============================================================
app.post("/api/chat", async (req, res) => {
  const ctx = buildRequestContext(req);

  try {
    const text = safeStr(req.body?.text || req.body?.message || "").slice(0, MAX_CHAT_TEXT);
    const sessionRecord = readSession(ctx.sessionId);

    const engineInput = {
      ...req.body,
      text,
      requestId: ctx.requestId,
      traceId: ctx.traceId,
      source: ctx.source,
      routeHint: ctx.routeHint,
      session: sessionRecord,
      knowledge: knowledgeRuntime.knowledgeSnapshotForEngine(),
      __knowledgeStatus: knowledgeRuntime.knowledgeStatusForMeta(),
      packIndex: knowledgeRuntime.getPackIndexSafe(false)
    };

    const engineOut = await ENGINE.fn(engineInput);
    const out = normalizeContract(engineOut, ctx);

    writeSession(ctx.sessionId, sessionRecord, out.sessionPatch);

    return sendJson(res, 200, out);
  } catch (err) {
    const fail = buildFailOpenReply(
      "Backend is stabilizing. Try again in a moment.",
      ctx,
      { error: safeStr(err && err.message ? err.message : err).slice(0, 220) }
    );
    return sendJson(res, 200, fail);
  }
});

app.post("/api/chat/reset", (req, res) => {
  const ctx = buildRequestContext(req);
  sessionStore.delete(ctx.sessionId);

  return sendJson(res, 200, normalizeContract({
    ok: true,
    reply: "Session reset complete.",
    payload: { reply: "Session reset complete." },
    lane: "general",
    laneId: "general",
    sessionLane: "general",
    ui: { chips: [], allowMic: true },
    directives: [],
    followUps: [],
    followUpsStrings: [],
    sessionPatch: {},
    cog: { intent: "RESET", mode: "transitional", publicMode: true },
    requestId: ctx.requestId,
    traceId: ctx.traceId,
    meta: { reset: true, v: INDEX_VERSION, t: nowMs() }
  }, ctx));
});

app.get("/api/chat/health", (_req, res) => {
  return sendJson(res, 200, {
    ok: true,
    version: INDEX_VERSION,
    engineVersion: ENGINE.version,
    upMs: nowMs() - SERVER_BOOT_AT,
    sessions: sessionStore.size,
    knowledge: knowledgeRuntime.knowledgeStatusForMeta()
  });
});

// ============================================================
// Voice routes (extracted)
// Keeps Mixer voice path functioning and isolated.
// ============================================================
if (registerVoiceRoutes) {
  registerVoiceRoutes(app, {
    ttsHandler:
      (typeof ttsMod?.delegateTts === "function" && ttsMod.delegateTts) ||
      (typeof ttsMod?.ttsHandler === "function" && ttsMod.ttsHandler) ||
      null,

    mixerVoiceId:
      safeStr(process.env.MIXER_VOICE_ID || "") ||
      safeStr(process.env.RESEMBLE_VOICE_ID || "") ||
      safeStr(process.env.RESEMBLE_VOICE_UUID || "") ||
      safeStr(process.env.NYX_VOICE_ID || ""),

    mixerVoiceName:
      safeStr(process.env.MIXER_VOICE_NAME || "") ||
      safeStr(process.env.NYX_VOICE_NAME || "") ||
      "Nyx",

    ttsRoutePath: "/api/tts",
    introRoutePath: "/api/tts/intro",
    voiceRoutePath: "/api/voice-route",
    allowedOrigins,
    debug: DEBUG_MODE
  });
} else {
  app.post("/api/tts", (_req, res) => {
    return sendJson(res, 503, {
      ok: false,
      error: "voice_route_missing",
      version: INDEX_VERSION
    });
  });

  app.post("/api/tts/intro", (_req, res) => {
    return sendJson(res, 503, {
      ok: false,
      error: "voice_route_missing",
      version: INDEX_VERSION
    });
  });

  app.get("/api/voice-route", (_req, res) => {
    return sendJson(res, 503, {
      ok: false,
      error: "voice_route_missing",
      version: INDEX_VERSION
    });
  });
}

// ============================================================
// Warm / health / diagnostics
// ============================================================
app.get("/_warm", async (_req, res) => {
  try {
    const out = await knowledgeRuntime.reloadKnowledge();
    return sendJson(res, 200, {
      ok: true,
      warmed: true,
      version: INDEX_VERSION,
      engineVersion: ENGINE.version,
      knowledgeReload: out || { ok: true, skipped: true },
      upMs: nowMs() - SERVER_BOOT_AT
    });
  } catch (err) {
    return sendJson(res, 200, {
      ok: false,
      warmed: false,
      version: INDEX_VERSION,
      error: safeStr(err && err.message ? err.message : err).slice(0, 220)
    });
  }
});

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/readyz", (_req, res) => {
  return sendJson(res, 200, {
    ok: true,
    ready: true,
    version: INDEX_VERSION,
    engineVersion: ENGINE.version
  });
});

app.get("/api/health", (_req, res) => {
  return sendJson(res, 200, {
    ok: true,
    version: INDEX_VERSION,
    engineVersion: ENGINE.version,
    nodeEnv: NODE_ENV,
    upMs: nowMs() - SERVER_BOOT_AT,
    sessions: sessionStore.size,
    knowledge: knowledgeRuntime.knowledgeStatusForMeta(),
    voiceRouteLoaded: !!registerVoiceRoutes,
    ttsLoaded: !!ttsMod
  });
});

app.get("/api/diag", (_req, res) => {
  return sendJson(res, 200, {
    ok: true,
    version: INDEX_VERSION,
    engineVersion: ENGINE.version,
    nodeEnv: NODE_ENV,
    debug: DEBUG_MODE,
    trustProxy: TRUST_PROXY,
    port: PORT,
    sessions: sessionStore.size,
    rate: {
      windowMs: RATE_WINDOW_MS,
      chatMaxPerIp: RATE_MAX_PER_IP,
      voiceMaxPerIp: VOICE_RATE_MAX_PER_IP,
      banMs: RATE_BAN_MS
    },
    knowledge: knowledgeRuntime.knowledgeStatusForMeta(),
    voiceRouteLoaded: !!registerVoiceRoutes,
    ttsLoaded: !!ttsMod,
    ttsDelegateLoaded: !!(ttsMod && typeof ttsMod.delegateTts === "function"),
    ttsHandlerLoaded: !!(ttsMod && typeof ttsMod.ttsHandler === "function")
  });
});

// ============================================================
// Static avatar hosting
// ============================================================
if (fs.existsSync(AVATAR_DIR)) {
  app.use("/avatar", express.static(AVATAR_DIR, {
    index: false,
    immutable: true,
    maxAge: "7d",
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    }
  }));
}

// ============================================================
// Root route
// ============================================================
app.get("/", (_req, res) => {
  return sendJson(res, 200, {
    ok: true,
    service: "Sandblast Backend",
    version: INDEX_VERSION,
    engineVersion: ENGINE.version,
    upMs: nowMs() - SERVER_BOOT_AT
  });
});

// ============================================================
// 404 / method safety
// ============================================================
app.use((req, res) => {
  return sendJson(res, 404, {
    ok: false,
    error: "not_found",
    path: safeStr(req.path || ""),
    method: safeStr(req.method || ""),
    version: INDEX_VERSION
  });
});

// ============================================================
// Server boot
// ============================================================
const server = app.listen(PORT, () => {
  log("BOOT", {
    version: INDEX_VERSION,
    engineVersion: ENGINE.version,
    port: PORT,
    voiceRouteLoaded: !!registerVoiceRoutes,
    ttsLoaded: !!ttsMod,
    ttsDelegateLoaded: !!(ttsMod && typeof ttsMod.delegateTts === "function"),
    knowledgeLoaded: knowledgeRuntime.knowledgeStatusForMeta()
  });
});

// ============================================================
// Graceful shutdown
// ============================================================
function shutdown(sig) {
  log("SHUTDOWN", sig);
  try {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref?.();
  } catch (_) {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = {
  app,
  server,
  INDEX_VERSION
};
