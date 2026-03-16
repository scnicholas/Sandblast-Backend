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

const INDEX_VERSION = "index.js v2.4.0sb";
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
  } catch (err) {
    log("MODULE_REQUIRE_FAIL", {
      module: modPath,
      detail: safeStr(err && (err.message || err)).slice(0, 220)
    });
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

const DEDUPE_WINDOW_MS = clampInt(process.env.DEDUPE_WINDOW_MS, 8000, 500, 60000);
const RESPONSE_CACHE_TTL_MS = clampInt(process.env.RESPONSE_CACHE_TTL_MS, 12000, 1000, 120000);
const MAX_REPLY_CHARS = clampInt(process.env.MAX_REPLY_CHARS, 2400, 64, 12000);
const MAX_FOLLOWUPS = clampInt(process.env.MAX_FOLLOWUPS, 4, 0, 10);
const MAX_DIRECTIVES = clampInt(process.env.MAX_DIRECTIVES, 8, 0, 24);
const MAX_CHIPS = clampInt(process.env.MAX_CHIPS, 4, 0, 8);

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
app.use((err, _req, res, next) => {
  if (!err) return next();
  const msg = safeStr(err && err.message ? err.message : err);
  const code = safeStr(err && err.type ? err.type : "");
  if (code === "entity.too.large") {
    return sendJson(res, 413, {
      ok: false,
      error: "payload_too_large",
      version: INDEX_VERSION,
      maxBodyKb: MAX_BODY_KB
    });
  }
  if (msg) {
    return sendJson(res, 400, {
      ok: false,
      error: "invalid_json",
      version: INDEX_VERSION
    });
  }
  return next(err);
});

// ============================================================
// Module resolution
// ============================================================
function resolveEngine() {
  const mod = tryRequireMany([
    "./Utils/chatEngine",
    "./Utils/chatEngine.js",
    "./utils/chatEngine",
    "./utils/chatEngine.js",
    "./chatEngine",
    "./chatEngine.js"
  ]);

  if (!mod) {
    return {
      version: "missing",
      fn: async () => ({
        ok: false,
        reply: "I am here, and I can keep this steady while the engine reconnects.",
        payload: { reply: "I am here, and I can keep this steady while the engine reconnects." },
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
        reply: "I am keeping this stable while the response engine resets its contract.",
        payload: { reply: "I am keeping this stable while the response engine resets its contract." },
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

function resolveTtsRuntime(mod) {
  const src = mod && typeof mod === "object" ? mod : {};
  return {
    mod: src,
    version: safeStr(src.TTS_VERSION || src.version || "missing"),
    handleHttp:
      (typeof src.handleTts === "function" && src.handleTts) ||
      (typeof src.ttsHandler === "function" && src.ttsHandler) ||
      (typeof src.handler === "function" && src.handler) ||
      null,
    delegate:
      (typeof src.delegateTts === "function" && src.delegateTts) ||
      null,
    generate:
      (typeof src.generate === "function" && src.generate) ||
      null,
    health:
      (typeof src.health === "function" && src.health) ||
      null
  };
}

const TTS = resolveTtsRuntime(ttsMod);

function getTtsHealthSafe() {
  try {
    const raw = TTS.health ? TTS.health() : null;
    const src = isPlainObject(raw) ? raw : {};
    const env = isPlainObject(src.env) ? src.env : {};
    return {
      ok: !!src.ok,
      provider: safeStr(src.provider || "resemble") || "resemble",
      version: safeStr(src.version || TTS.version || "missing"),
      activeRequests: clampInt(src.activeRequests, 0, 0, 999999),
      failCount: clampInt(src.failCount, 0, 0, 999999),
      circuitOpen: !!src.circuitOpen,
      circuitResetAt: clampInt(src.circuitResetAt, 0, 0, Number.MAX_SAFE_INTEGER),
      lastError: safeStr(src.lastError || "").slice(0, 220),
      lastOkAt: clampInt(src.lastOkAt, 0, 0, Number.MAX_SAFE_INTEGER),
      lastFailAt: clampInt(src.lastFailAt, 0, 0, Number.MAX_SAFE_INTEGER),
      lastProviderStatus: clampInt(src.lastProviderStatus, 0, 0, 999999),
      lastElapsedMs: clampInt(src.lastElapsedMs, 0, 0, 600000),
      env: {
        hasToken: !!env.hasToken,
        hasProject: !!env.hasProject,
        hasVoice: !!env.hasVoice,
        useProjectUuidByDefault: !!env.useProjectUuidByDefault,
        voiceUuidPreview: safeStr(env.voiceUuidPreview || ""),
        voiceName: safeStr(env.voiceName || ""),
        projectUuidPreview: safeStr(env.projectUuidPreview || ""),
        providerTimeoutMs: clampInt(env.providerTimeoutMs, 0, 0, 600000)
      }
    };
  } catch (err) {
    return {
      ok: false,
      provider: "resemble",
      version: TTS.version || "missing",
      lastError: safeStr(err && (err.message || err)).slice(0, 220),
      env: { hasToken: false, hasProject: false, hasVoice: false }
    };
  }
}

function buildTtsRuntimeSnapshot() {
  const health = getTtsHealthSafe();
  return {
    loaded: !!ttsMod,
    version: TTS.version,
    handlerLoaded: !!TTS.handleHttp,
    delegateLoaded: !!TTS.delegate,
    generateLoaded: !!TTS.generate,
    healthLoaded: !!TTS.health,
    health
  };
}

function getReqText(req) {
  return safeStr(req?.body?.text || req?.body?.message || req?.query?.text || req?.query?.message || "").trim();
}

function cloneReqWithPatch(req, patch) {
  const bodyPatch = isPlainObject(patch?.body) ? patch.body : {};
  const queryPatch = isPlainObject(patch?.query) ? patch.query : {};
  return {
    ...req,
    body: { ...(isPlainObject(req?.body) ? req.body : {}), ...bodyPatch },
    query: { ...(isPlainObject(req?.query) ? req.query : {}), ...queryPatch }
  };
}

function buildIntroText(req) {
  return oneLine(
    req?.body?.introText ||
    req?.body?.text ||
    req?.query?.introText ||
    req?.query?.text ||
    "Hi — how can I help you today?"
  ) || "Hi — how can I help you today?";
}

async function sendDelegateResult(res, result, ctx) {
  const src = isPlainObject(result) ? result : {};
  if (src.ok && src.buffer) {
    res.setHeader("Content-Type", safeStr(src.mimeType || src.mime || "audio/mpeg") || "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Index-Version", INDEX_VERSION);
    res.setHeader("X-Request-Id", safeStr(src.requestId || ctx.requestId));
    res.setHeader("X-SB-Trace-Id", safeStr(src.traceId || ctx.traceId));
    return res.status(200).send(src.buffer);
  }

  const providerStatus = clampInt(
    src.status || src.providerStatus || (src.retryable ? 503 : 500),
    src.retryable ? 503 : 500,
    200,
    599
  );

  return sendJson(res, providerStatus, {
    ok: false,
    spokenUnavailable: true,
    provider: safeStr(src.provider || "resemble") || "resemble",
    error: safeStr(src.reason || src.error || "tts_unavailable") || "tts_unavailable",
    detail: safeStr(src.message || src.detail || "TTS unavailable.").slice(0, 220),
    retryable: !!src.retryable,
    requestId: safeStr(src.requestId || ctx.requestId),
    traceId: safeStr(src.traceId || ctx.traceId),
    turnId: safeStr(src.turnId || ""),
    sessionId: safeStr(src.sessionId || ctx.sessionId),
    ttsFailure: isPlainObject(src.ttsFailure) ? src.ttsFailure : undefined,
    audioFailure: isPlainObject(src.audioFailure) ? src.audioFailure : undefined,
    health: getTtsHealthSafe(),
    payload: { spokenUnavailable: true },
    version: INDEX_VERSION
  });
}

async function handleTtsWithFallback(req, res, mode) {
  const ctx = buildRequestContext(req);
  const health = getTtsHealthSafe();

  try {
    if (mode === "health") {
      return sendJson(res, 200, {
        ok: true,
        route: "/api/tts/health",
        requestId: ctx.requestId,
        traceId: ctx.traceId,
        version: INDEX_VERSION,
        tts: buildTtsRuntimeSnapshot()
      });
    }

    if (mode === "voice-route") {
      return sendJson(res, 200, {
        ok: true,
        provider: health.provider || "resemble",
        voiceReady: !!health.ok,
        spokenAvailable: !!health.ok,
        route: "/api/tts",
        introRoute: "/api/tts/intro",
        requestId: ctx.requestId,
        traceId: ctx.traceId,
        version: INDEX_VERSION,
        tts: buildTtsRuntimeSnapshot()
      });
    }

    let ttsReq = req;
    if (mode === "intro" && !getReqText(req)) {
      ttsReq = cloneReqWithPatch(req, {
        body: { text: buildIntroText(req), source: safeStr(req?.body?.source || "intro") || "intro" },
        query: { text: buildIntroText(req) }
      });
    }

    if (TTS.handleHttp) {
      return await TTS.handleHttp(ttsReq, res);
    }

    if (TTS.delegate) {
      const payload = {
        ...(isPlainObject(ttsReq?.body) ? ttsReq.body : {}),
        text: getReqText(ttsReq),
        requestId: ctx.requestId,
        traceId: ctx.traceId,
        sessionId: ctx.sessionId
      };
      const result = await TTS.delegate(payload, ttsReq);
      return sendDelegateResult(res, result, ctx);
    }

    if (TTS.generate) {
      const text = getReqText(ttsReq);
      if (!text) {
        return sendJson(res, 400, {
          ok: false,
          spokenUnavailable: true,
          error: "missing_text",
          detail: "No TTS text was provided.",
          requestId: ctx.requestId,
          traceId: ctx.traceId,
          version: INDEX_VERSION
        });
      }
      const result = await TTS.generate(text, {
        ...(isPlainObject(ttsReq?.body) ? ttsReq.body : {}),
        ...(isPlainObject(ttsReq?.query) ? ttsReq.query : {}),
        requestId: ctx.requestId,
        traceId: ctx.traceId,
        sessionId: ctx.sessionId
      });
      return sendDelegateResult(res, result, ctx);
    }

    return sendJson(res, 503, {
      ok: false,
      spokenUnavailable: true,
      error: "tts_runtime_missing",
      detail: "No TTS runtime exports were available.",
      requestId: ctx.requestId,
      traceId: ctx.traceId,
      version: INDEX_VERSION,
      tts: buildTtsRuntimeSnapshot()
    });
  } catch (err) {
    return sendJson(res, 503, {
      ok: false,
      spokenUnavailable: true,
      error: "tts_route_failure",
      detail: safeStr(err && (err.message || err)).slice(0, 220),
      requestId: ctx.requestId,
      traceId: ctx.traceId,
      version: INDEX_VERSION,
      tts: buildTtsRuntimeSnapshot()
    });
  }
}

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
  const reqPath = safeStr(req.path || "");
  const isApiLike =
    reqPath.startsWith("/api/chat") ||
    reqPath.startsWith("/api/tts") ||
    reqPath.startsWith("/api/voice") ||
    reqPath === "/api/health" ||
    reqPath === "/api/diag";
  if (!isApiLike) return next();

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

  const isVoice = reqPath.startsWith("/api/tts") || reqPath.startsWith("/api/voice");
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

function inferFailOpenMessage(req) {
  const body = isPlainObject(req?.body) ? req.body : {};
  const rawText = oneLine(body.text || body.message || body.userText || "").toLowerCase();
  const distress = /(depress|sad|lonely|alone|hurt|grief|anxious|panic|afraid|overwhelm|hopeless|helpless)/.test(rawText);
  const positive = /(happy|great|beautiful day|amazing|good mood|outstanding|did great|things are going right|relieved)/.test(rawText);
  const technical = /(debug|backend|chat engine|state spine|support response|marion|loop|fallback|api|route|tts|voice|fix)/.test(rawText);
  if (technical) return "I am keeping this stable while the backend reconnects, and I can stay with the request without dropping into a menu.";
  if (distress) return "I am here with you. The backend hit a rough patch, but I can keep this steady without dropping you into a menu.";
  if (positive) return "I caught the positive signal, and I can keep the tone steady while the backend reconnects.";
  return "I am here with you. The backend hit a rough patch, but I can keep this steady without bouncing you into a menu.";
}

function sendJson(res, status, payload) {
  if (res.headersSent) return;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-Index-Version", INDEX_VERSION);
  if (payload && payload.requestId) res.setHeader("X-Request-Id", safeStr(payload.requestId));
  if (payload && payload.traceId) res.setHeader("X-SB-Trace-Id", safeStr(payload.traceId));
  res.status(status).send(safeJson(payload, "{\"ok\":false,\"error\":\"json_serialize_failed\"}"));
}

function normalizeContract(raw, ctx) {
  const src = isPlainObject(raw) ? raw : {};
  const rawReply = safeStr(src.reply || src.payload?.reply || "").trim() || "Okay.";
  const reply = rawReply.slice(0, MAX_REPLY_CHARS);
  const lane = safeStr(src.lane || src.laneId || src.sessionLane || "general") || "general";
  const srcUi = isPlainObject(src.ui) ? src.ui : {};
  const srcMeta = isPlainObject(src.meta) ? src.meta : {};
  const shouldClearUi = !!(srcMeta.suppressMenus || srcMeta.clearStaleUi || srcMeta.degradedSupport || srcMeta.failSafe || safeStr(src.cog?.intent || "").toUpperCase() === "STABILIZE");
  const srcChips = shouldClearUi ? [] : (Array.isArray(srcUi.chips) ? srcUi.chips : []);
  const chips = srcChips
    .map((x) => {
      if (isPlainObject(x)) {
        const label = safeStr(x.label || x.text || "").trim();
        if (!label) return null;
        return { ...x, label: label.slice(0, 80) };
      }
      const label = safeStr(x).trim();
      if (!label) return null;
      return { label: label.slice(0, 80) };
    })
    .filter(Boolean)
    .slice(0, MAX_CHIPS);

  const followUps = ((shouldClearUi ? [] : (Array.isArray(src.followUps) ? src.followUps : [])))
    .map((x) => {
      if (isPlainObject(x)) {
        const label = safeStr(x.label || x.text || "").trim();
        if (!label) return null;
        return { ...x, label: label.slice(0, 120) };
      }
      const label = safeStr(x).trim();
      if (!label) return null;
      return { label: label.slice(0, 120) };
    })
    .filter(Boolean)
    .slice(0, MAX_FOLLOWUPS);

  const directives = (Array.isArray(src.directives) ? src.directives : [])
    .filter((x) => isPlainObject(x) || typeof x === "string")
    .slice(0, MAX_DIRECTIVES);

  const sessionPatch = isPlainObject(src.sessionPatch) ? src.sessionPatch : {};

  return {
    ok: src.ok !== false,
    reply,
    payload: isPlainObject(src.payload) ? { ...src.payload, reply } : { reply },
    lane,
    laneId: safeStr(src.laneId || lane) || lane,
    sessionLane: safeStr(src.sessionLane || lane) || lane,
    bridge: src.bridge || null,
    ctx: isPlainObject(src.ctx) ? src.ctx : {},
    ui: {
      ...(shouldClearUi ? { mode: safeStr(srcUi.mode || "quiet") || "quiet" } : srcUi),
      chips,
      allowMic: srcUi.allowMic !== false,
      replace: shouldClearUi,
      clearStale: shouldClearUi,
      revision: nowMs()
    },
    directives,
    followUps,
    followUpsStrings: shouldClearUi
      ? []
      : (Array.isArray(src.followUpsStrings)
        ? src.followUpsStrings.map((x) => safeStr(x).trim()).filter(Boolean).slice(0, MAX_FOLLOWUPS)
        : followUps.map((x) => safeStr(x?.label || x).trim()).filter(Boolean)),
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
      clearStaleUi: shouldClearUi,
      suppressMenus: shouldClearUi,
      ...(isPlainObject(src.meta) ? src.meta : {})
    }
  };
}

function buildFailOpenReply(message, ctx, extra) {
  const fallback = oneLine(message || "I am here with you. The backend hit a rough patch, but I can keep this steady while it recovers.") ||
    "I am here with you. The backend hit a rough patch, but I can keep this steady while it recovers.";
  return normalizeContract({
    ok: false,
    reply: fallback,
    payload: { reply: fallback },
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

const chatInflight = new Map();
const recentResponses = new Map();

function sweepTransientMaps() {
  const now = nowMs();
  for (const [key, rec] of recentResponses.entries()) {
    if (!rec || !rec.at || now - rec.at > RESPONSE_CACHE_TTL_MS) recentResponses.delete(key);
  }
  for (const [key, rec] of chatInflight.entries()) {
    if (!rec || !rec.at || now - rec.at > Math.max(DEDUPE_WINDOW_MS, 30000)) chatInflight.delete(key);
  }
}

function buildTransportKey(ctx, text, req) {
  const msg = safeStr(text).trim().toLowerCase();
  const keySeed = [
    ctx.sessionId,
    ctx.ip,
    msg,
    oneLine(req.body?.routeHint || ""),
    oneLine(req.body?.source || ""),
    oneLine(req.body?.clientTurnId || ""),
    oneLine(req.body?.turnId || "")
  ].join("|");
  return `chat_${sha1Lite(keySeed)}`;
}

function clonePayload(x) {
  try {
    return JSON.parse(JSON.stringify(x));
  } catch (_) {
    return x;
  }
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
    sweepTransientMaps();

    const text = safeStr(req.body?.text || req.body?.message || "").slice(0, MAX_CHAT_TEXT);
    const transportKey = buildTransportKey(ctx, text, req);
    const now = nowMs();

    const cached = recentResponses.get(transportKey);
    if (cached && cached.payload && now - cached.at <= DEDUPE_WINDOW_MS) {
      const replay = clonePayload(cached.payload);
      if (replay && isPlainObject(replay.meta)) replay.meta.transportReplay = true;
      return sendJson(res, 200, replay);
    }

    const inflight = chatInflight.get(transportKey);
    if (inflight && inflight.promise && now - inflight.at <= DEDUPE_WINDOW_MS) {
      const joined = await inflight.promise;
      const replay = clonePayload(joined);
      if (replay && isPlainObject(replay.meta)) replay.meta.transportJoin = true;
      return sendJson(res, 200, replay);
    }

    const sessionRecord = readSession(ctx.sessionId);

    const enginePromise = (async () => {
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
      recentResponses.set(transportKey, { at: nowMs(), payload: clonePayload(out) });
      return out;
    })();

    chatInflight.set(transportKey, { at: now, promise: enginePromise });

    const out = await enginePromise;
    return sendJson(res, 200, out);
  } catch (err) {
    const fail = buildFailOpenReply(
      inferFailOpenMessage(req),
      ctx,
      { error: safeStr(err && err.message ? err.message : err).slice(0, 220), clearStaleUi: true, suppressMenus: true }
    );
    return sendJson(res, 200, fail);
  } finally {
    const text = safeStr(req.body?.text || req.body?.message || "").slice(0, MAX_CHAT_TEXT);
    const transportKey = buildTransportKey(ctx, text, req);
    const cur = chatInflight.get(transportKey);
    if (cur) chatInflight.delete(transportKey);
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
    inflight: chatInflight.size,
    dedupeCache: recentResponses.size,
    knowledge: knowledgeRuntime.knowledgeStatusForMeta()
  });
});

// ============================================================
// Voice routes
// Keeps extracted voice path available when present,
// but index.js now owns a stable fail-open/fail-closed wrapper
// so /api/tts, /api/tts/intro, /api/voice-route and health
// never disappear when the external router is absent.
// ============================================================
let voiceRouteRegistrationMode = "index_wrapped";
if (registerVoiceRoutes && truthy(process.env.SB_USE_EXTRACTED_VOICE_ROUTES || "")) {
  try {
    registerVoiceRoutes(app, {
      ttsHandler:
        (typeof ttsMod?.delegateTts === "function" && ttsMod.delegateTts) ||
        (typeof ttsMod?.ttsHandler === "function" && ttsMod.ttsHandler) ||
        (typeof ttsMod?.handleTts === "function" && ttsMod.handleTts) ||
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

      ttsRoutePath: "/api/_legacy_tts",
      introRoutePath: "/api/_legacy_tts/intro",
      voiceRoutePath: "/api/_legacy_voice-route",
      allowedOrigins,
      debug: DEBUG_MODE
    });
    voiceRouteRegistrationMode = "external_legacy_registered";
  } catch (err) {
    voiceRouteRegistrationMode = "external_registration_failed";
    log("VOICE_ROUTE_REGISTER_FAIL", safeStr(err && (err.message || err)).slice(0, 220));
  }
}

app.get("/tts/health", (req, res) => handleTtsWithFallback(req, res, "health"));
app.get("/api/tts/health", (req, res) => handleTtsWithFallback(req, res, "health"));
app.post("/api/tts/health", (req, res) => handleTtsWithFallback(req, res, "health"));

app.get("/api/voice-route", (req, res) => handleTtsWithFallback(req, res, "voice-route"));
app.post("/api/voice-route", (req, res) => handleTtsWithFallback(req, res, "voice-route"));

app.get("/api/tts", (req, res) => handleTtsWithFallback(req, res, "tts"));
app.post("/api/tts", (req, res) => handleTtsWithFallback(req, res, "tts"));

app.get("/api/tts/intro", (req, res) => handleTtsWithFallback(req, res, "intro"));
app.post("/api/tts/intro", (req, res) => handleTtsWithFallback(req, res, "intro"));

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
    inflight: chatInflight.size,
    dedupeCache: recentResponses.size,
    dedupe: {
      windowMs: DEDUPE_WINDOW_MS,
      responseCacheTtlMs: RESPONSE_CACHE_TTL_MS
    },
    knowledge: knowledgeRuntime.knowledgeStatusForMeta(),
    voiceRouteLoaded: !!registerVoiceRoutes,
    voiceRouteRegistrationMode,
    tts: buildTtsRuntimeSnapshot()
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
    voiceRouteRegistrationMode,
    tts: buildTtsRuntimeSnapshot(),
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
    voiceRouteRegistrationMode,
    tts: buildTtsRuntimeSnapshot(),
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
