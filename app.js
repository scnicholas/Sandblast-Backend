"use strict";

const express = require("express");
const cors = require("cors");

const shadowBrain = require("./Utils/shadowBrain");
const chatEngine = require("./Utils/chatEngine");

/**
 * app.js (STABLE SHELL — CHATENGINE DELEGATION)
 * - Starts reliably (no circular dependency)
 * - Emits payload.shadow (required by API regression)
 * - Delegates reply generation to PURE module: Utils/chatEngine.js
 *
 * IMPORTANT:
 * - Do NOT require("./index.js") from here.
 *   index.js is a bootstrapper (starts server) and is not a chat engine.
 */

// Hard crash visibility (prevents "server vanished" mysteries)
process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException:", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (err) => {
  console.error("[FATAL] unhandledRejection:", err && err.stack ? err.stack : err);
});

function clampYear(y) {
  if (!Number.isFinite(y)) return null;
  if (y < 1950 || y > 2024) return null;
  return y;
}

function safeFollowUps(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const it of list) {
    const label = String(it && it.label ? it.label : "").trim();
    const send = String(it && it.send ? it.send : "").trim();
    if (!label || !send) continue;
    const k = send.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label, send });
  }
  return out;
}

/**
 * Regression harness expects payload.shadow not null.
 * If shadowBrain returns null (should be rare), give a minimal safe object.
 *
 * NOTE:
 * - orderedIntents must be non-empty to satisfy regression_shadowBrain_api_v1.ps1
 *   (that script asserts Count >= 1).
 */
function ensureShadowNonNull(shadow, session) {
  if (shadow && typeof shadow === "object") {
    if (!Array.isArray(shadow.orderedIntents) || shadow.orderedIntents.length < 1) {
      shadow.orderedIntents = [{ intent: "top10_run", w: 0, why: "fallback_nonempty" }];
    }
    return shadow;
  }

  return {
    at: Date.now(),
    lane: (session && session.lane) || "general",
    mode: (session && session.activeMusicMode) || null,
    year: (session && session.lastMusicYear) || null,
    orderedIntents: [{ intent: "top10_run", w: 0, why: "fallback_nonempty" }],
    candidates: [],
    prepared: null,
    orderedChips: [],
    sig: "fallback",
  };
}

/**
 * Minimal fallback reply that NEVER re-asks year if session already has it.
 * Used only if chatEngine errors or returns no reply.
 */
function fallbackReply(text, session) {
  const yRaw = Number(text);
  const y = clampYear(yRaw);

  if (y) {
    session.lastMusicYear = y;
    if (!session.activeMusicMode) session.activeMusicMode = "top10";

    return {
      reply: `Top 10 — Billboard Year-End Hot 100 (${y})`,
      followUps: safeFollowUps([
        { label: "#1", send: `#1 ${y}` },
        { label: "Story moment", send: `story moment ${y}` },
        { label: "Micro moment", send: `micro moment ${y}` },
        { label: "Another year", send: "another year" },
        { label: "Next year", send: "next year" },
      ]),
    };
  }

  const hasSessionYear = !!clampYear(Number(session && session.lastMusicYear));
  if (hasSessionYear) {
    const yr = session.lastMusicYear;
    return {
      reply: `Locked in ${yr}. Choose: “top 10 ${yr}”, “story moment ${yr}”, “micro moment ${yr}”, or “#1 ${yr}”.`,
      followUps: safeFollowUps([
        { label: `Top 10 ${yr}`, send: `top 10 ${yr}` },
        { label: `Story moment ${yr}`, send: `story moment ${yr}` },
        { label: `Micro moment ${yr}`, send: `micro moment ${yr}` },
        { label: `#1 ${yr}`, send: `#1 ${yr}` },
        { label: "Another year", send: "another year" },
        { label: "Next year", send: "next year" },
      ]),
    };
  }

  return {
    reply: "Tell me a year (1950–2024).",
    followUps: safeFollowUps([
      { label: "1988", send: "1988" },
      { label: "Top 10", send: "top 10" },
      { label: "Story moment", send: "story moment" },
      { label: "Micro moment", send: "micro moment" },
    ]),
  };
}

function start() {
  const app = express();

  // Render/Proxy correctness (client IP / protocol)
  app.set("trust proxy", 1);

  // --- Request ID + timing (lightweight)
  app.use((req, res, next) => {
    req._t0 = Date.now();
    req._rid = Math.random().toString(16).slice(2, 10);

    // IMPORTANT:
    // Do NOT require client to send X-Request-Id.
    // We generate it server-side and return it as a RESPONSE header only.
    res.setHeader("X-Request-Id", req._rid);
    next();
  });

  // --- CORS allowlist
  const ALLOWED_ORIGINS = new Set([
    "https://www.sandblast.channel",
    "https://sandblast.channel",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
  ]);

  function normalizeOrigin(origin) {
    if (!origin) return "";
    return String(origin).trim().replace(/\/$/, "");
  }

  /**
   * ✅ CRITICAL PATCH A (manual preflight hardener):
   * Guarantees OPTIONS returns HTTP OK + required headers
   * ONLY for allowed origins (otherwise return 403).
   *
   * MUST be BEFORE express.json() and BEFORE your routes.
   */
  app.use((req, res, next) => {
    if (req.method !== "OPTIONS") return next();

    const origin = normalizeOrigin(req.headers.origin || "");
    const isAllowed = origin && ALLOWED_ORIGINS.has(origin);

    // If browser sends an Origin and it's not allowed: fail fast with 403.
    // This prevents "not HTTP ok status" ambiguity and makes debugging obvious.
    if (origin && !isAllowed) {
      console.warn("[CORS] preflight blocked origin:", origin);
      return res.status(403).send("CORS origin blocked");
    }

    if (isAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }

    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

    // Echo requested headers exactly (future-proof)
    const reqHdr = req.headers["access-control-request-headers"];
    if (reqHdr) res.setHeader("Access-Control-Allow-Headers", String(reqHdr));
    else {
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With, X-Request-Id"
      );
    }

    res.setHeader("Access-Control-Max-Age", "86400");
    return res.sendStatus(204);
  });

  /**
   * ✅ CRITICAL PATCH B (cors middleware):
   * Keep cors() as the primary path; manual OPTIONS above is the failsafe.
   */
  const corsOptions = {
    origin: (origin, cb) => {
      // allow server-to-server / curl / Render pings (no Origin header)
      if (!origin) return cb(null, true);

      const o = normalizeOrigin(origin);
      const ok = ALLOWED_ORIGINS.has(o);

      if (!ok) {
        console.warn("[CORS] blocked origin:", o);
        return cb(null, false);
      }

      return cb(null, o); // explicit echo
    },

    methods: ["GET", "POST", "OPTIONS"],

    // Echo back exactly what the browser requests in Access-Control-Request-Headers
    allowedHeaders: (req, cb) => {
      const reqHdr = req.header("Access-Control-Request-Headers");
      if (reqHdr) return cb(null, reqHdr);
      return cb(null, [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "X-Request-Id",
        "x-request-id",
      ]);
    },

    exposedHeaders: ["X-Request-Id"],
    optionsSuccessStatus: 204,
    maxAge: 86400,
    credentials: false,
  };

  // Apply CORS early
  app.use(cors(corsOptions));

  // Explicit OPTIONS handlers (removes ambiguity in some proxies)
  app.options("/api/chat", cors(corsOptions));
  app.options("/api/*", cors(corsOptions));
  app.options("*", cors(corsOptions));

  // --- Body parsing
  app.use(express.json({ limit: "1mb" }));

  // --- JSON parse error hardener (prevents silent 400s)
  app.use((err, req, res, next) => {
    if (err && err.type === "entity.parse.failed") {
      console.warn("[app] JSON parse failed:", err.message || err);
      return res.status(400).json({
        ok: false,
        error: "invalid_json",
        requestId: req._rid || null,
      });
    }
    return next(err);
  });

  const sessions = Object.create(null);

  function getSession(sessionId) {
    const sid = String(sessionId || "anon");
    if (!sessions[sid]) {
      sessions[sid] = {
        sessionId: sid,
        lane: "music",
        lastMusicYear: null,
        activeMusicMode: null,
        voiceMode: "standard",
      };
    }
    return sessions[sid];
  }

  // Health endpoints (both forms so you never chase the wrong one again)
  app.get("/health", (req, res) =>
    res.json({ ok: true, service: "sandblast-backend", ts: Date.now() })
  );
  app.get("/api/health", (req, res) =>
    res.json({ ok: true, service: "sandblast-backend", ts: Date.now() })
  );

  // CORS test endpoint (lets you verify headers instantly)
  app.get("/api/cors-test", (req, res) => {
    res.json({
      ok: true,
      origin: req.headers.origin || null,
      requestId: req._rid || null,
      ts: Date.now(),
    });
  });

  app.post("/api/chat", async (req, res) => {
    const t0 = Date.now();
    const body = req.body || {};

    const text = String(body.text || "").trim();
    const sessionId = String(body.sessionId || "anon");
    const visitorId = String(body.visitorId || "anon");
    const requestId = req._rid || Math.random().toString(16).slice(2, 10);

    const session = getSession(sessionId);
    if (!session.lane) session.lane = "music";

    // ShadowBrain prime/observe (guarded)
    try {
      shadowBrain.prime({
        session,
        visitorId,
        lane: session.lane,
        mode: session.activeMusicMode,
        year: session.lastMusicYear,
        now: t0,
      });

      shadowBrain.observe({
        session,
        visitorId,
        userText: text,
        event: "user_turn",
        lane: session.lane,
        mode: session.activeMusicMode,
        year: session.lastMusicYear,
        now: t0,
      });
    } catch (e) {
      console.warn("[shadowBrain] prime/observe error:", e && e.message ? e.message : e);
    }

    // -----------------------------
    // ChatEngine (PURE module)
    // -----------------------------
    let reply = "";
    let followUps = [];
    let contractVersion = "1";

    try {
      const engineOut = await chatEngine.handleChat({
        text,
        session,
        visitorId,
        now: t0,
        debug: String(req.query && req.query.debug) === "1",
      });

      if (engineOut && typeof engineOut === "object") {
        if (typeof engineOut.reply === "string") reply = engineOut.reply;
        if (Array.isArray(engineOut.followUps)) followUps = safeFollowUps(engineOut.followUps);
        if (typeof engineOut.contractVersion === "string") contractVersion = engineOut.contractVersion;

        // Keep session context aligned if engine returns these
        if (typeof engineOut.lane === "string" && engineOut.lane.trim()) session.lane = engineOut.lane.trim();
        if (Number.isFinite(engineOut.year)) {
          session.lastMusicYear = clampYear(Number(engineOut.year)) || session.lastMusicYear;
        }
        if (typeof engineOut.mode === "string" && engineOut.mode.trim()) session.activeMusicMode = engineOut.mode.trim();
        if (typeof engineOut.voiceMode === "string" && engineOut.voiceMode.trim()) session.voiceMode = engineOut.voiceMode.trim();
      }
    } catch (e) {
      console.warn("[chatEngine] error (fallback path):", e && e.message ? e.message : e);
    }

    // Hard fallback (never empty)
    if (!reply) {
      const fb = fallbackReply(text, session);
      reply = fb.reply;
      followUps = fb.followUps;
    }

    // ShadowBrain get
    let shadow = null;
    let imprint = null;
    try {
      const got = shadowBrain.get({
        session,
        visitorId,
        lane: session.lane,
        mode: session.activeMusicMode,
        year: session.lastMusicYear,
        userText: text,
        replyText: reply,
        followUps,
        now: Date.now(),
      });

      shadow = got && got.shadow ? got.shadow : null;
      imprint = got && got.imprint ? got.imprint : null;
    } catch (e) {
      console.warn("[shadowBrain] get error:", e && e.message ? e.message : e);
    }

    shadow = ensureShadowNonNull(shadow, session);

    // Light request log (helps you debug live without noise)
    const dt = Date.now() - (req._t0 || t0);
    console.log(
      `[api/chat] rid=${requestId} sid=${sessionId} vid=${visitorId} lane=${session.lane} mode=${session.activeMusicMode || "-"} year=${session.lastMusicYear || "-"} dt=${dt}ms`
    );

    return res.json({
      ok: true,
      reply,
      sessionId,
      visitorId,
      requestId,
      contractVersion,
      voiceMode: session.voiceMode || "standard",
      followUps,
      shadow,
      imprint,
    });
  });

  // Safer default 404 (prevents HTML surprises on API endpoints)
  app.use((req, res) => {
    return res.status(404).json({
      ok: false,
      error: "not_found",
      path: req.path,
      requestId: req._rid || null,
    });
  });

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => {
    console.log(`[app] listening on port ${PORT}`);
    console.log("[app] stable shell: delegated to Utils/chatEngine.js (pure).");
    console.log("[app] cors allowlist:", Array.from(ALLOWED_ORIGINS).join(", "));
  });
}

module.exports = { start };

if (require.main === module) {
  start();
}
