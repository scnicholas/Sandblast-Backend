"use strict";

/**
 * Sandblast Backend — index.js (canonical)
 * Fixes:
 *  - Browser reachability (CORS allowlist + explicit OPTIONS preflight with Allow-Origin)
 *  - Widget compatibility (payload tolerance + stable JSON replies)
 *  - TTS compatibility (/api/tts + /api/voice alias returning audioBytes/audioMime)
 *  - Music routing (musicMoments first, then musicKnowledge fallback)
 */

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

/* ======================================================
   Config
====================================================== */

const PORT = Number(process.env.PORT || 10000);
const NODE_ENV = process.env.NODE_ENV || "production";
const ENABLE_DEBUG = (process.env.NYX_DEBUG || "false") === "true";

// Build stamp (Render commonly provides RENDER_GIT_COMMIT)
const BUILD_SHA =
  process.env.RENDER_GIT_COMMIT ||
  process.env.GIT_SHA ||
  process.env.COMMIT_SHA ||
  null;

// CORS allowlist (override in Render with CORS_ORIGINS="a,b,c")
const ALLOWED_ORIGINS = String(
  process.env.CORS_ORIGINS ||
    [
      "https://sandblast.channel",
      "https://www.sandblast.channel",
      "https://sandblastchannel.com",
      "https://www.sandblastchannel.com",
      // Webflow staging (add your exact project domain(s) here)
      "https://sandblast-channel.webflow.io",
      "https://www.sandblast-channel.webflow.io",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ].join(",")
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

/* ======================================================
   CRITICAL: Preflight + CORS headers (browser unblock)
   - Must set Access-Control-Allow-Origin on OPTIONS and POST
====================================================== */

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  // Explicitly answer preflight cleanly
  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  next();
});

// Keep cors() for normal requests too (matches allowlist)
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl/server-to-server
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
    credentials: false,
  })
);

/* ======================================================
   Body parsing
====================================================== */

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* ======================================================
   Safe requires (don’t crash deploy if a module moves)
====================================================== */

function safeRequire(p) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(p);
  } catch (e) {
    if (ENABLE_DEBUG) console.warn(`[safeRequire] ${p} failed: ${e.message}`);
    return null;
  }
}

const musicMoments = safeRequire("./Utils/musicMoments");
const musicKnowledge = safeRequire("./Utils/musicKnowledge");

// Nyx voice naturalizer (optional but recommended)
const nyxVoiceNaturalize = safeRequire("./Utils/nyxVoiceNaturalize");

/* ======================================================
   Sessions (simple in-memory)
====================================================== */

const SESSIONS = new Map();
const SESSION_TTL_MIN = Number(process.env.SESSION_TTL_MINUTES || 120);

function nowMs() {
  return Date.now();
}

function makeSessionId() {
  return crypto.randomBytes(9).toString("hex");
}

function getSession(sessionId) {
  if (!sessionId) return null;
  const s = SESSIONS.get(sessionId);
  if (!s) return null;

  const ageMin = (nowMs() - (s._t || 0)) / 60000;
  if (ageMin > SESSION_TTL_MIN) {
    SESSIONS.delete(sessionId);
    return null;
  }

  s._t = nowMs();
  return s;
}

function setSession(sessionId, session) {
  if (!sessionId) return;
  session._t = nowMs();
  SESSIONS.set(sessionId, session);
}

/* ======================================================
   Payload tolerance (prevents “empty message” loops)
====================================================== */

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function extractMessage(body) {
  if (!body || typeof body !== "object") return "";
  const candidates = [
    body.message,
    body.text,
    body.input,
    body.value,
    body.label,
    body.query,
  ];
  for (const c of candidates) {
    const t = cleanText(c);
    if (t) return t;
  }
  return "";
}

function extractSessionId(body) {
  if (!body || typeof body !== "object") return null;
  return body.sessionId || body.sid || body.session || null;
}

/* ======================================================
   TTS (ElevenLabs) — returns audioBytes/audioMime
====================================================== */

const ENABLE_TTS = (process.env.ENABLE_TTS || "true") === "true";
const TTS_PROVIDER = (process.env.TTS_PROVIDER || "elevenlabs").toLowerCase();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "";
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || ""; // optional
const ELEVENLABS_BASE_URL =
  process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";

const NYX_VOICE_STABILITY = Number(process.env.NYX_VOICE_STABILITY || "0.35");
const NYX_VOICE_SIMILARITY = Number(process.env.NYX_VOICE_SIMILARITY || "0.80");
const NYX_VOICE_STYLE = Number(process.env.NYX_VOICE_STYLE || "0.25");
const NYX_VOICE_SPEAKER_BOOST =
  (process.env.NYX_VOICE_SPEAKER_BOOST || "true") === "true";

function normalizeTtsText(s) {
  const raw = cleanText(s);
  if (!raw) return "";
  if (nyxVoiceNaturalize && typeof nyxVoiceNaturalize === "function") {
    try {
      return nyxVoiceNaturalize(raw);
    } catch (_) {
      return raw;
    }
  }
  return raw;
}

async function elevenLabsTts(text) {
  const payloadText = normalizeTtsText(text);
  if (!payloadText) return null;

  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    return { ok: false, error: "TTS_NOT_CONFIGURED" };
  }

  const url = `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

  const body = {
    text: payloadText,
    model_id: ELEVENLABS_MODEL_ID || undefined,
    voice_settings: {
      stability: NYX_VOICE_STABILITY,
      similarity_boost: NYX_VOICE_SIMILARITY,
      style: NYX_VOICE_STYLE,
      use_speaker_boost: NYX_VOICE_SPEAKER_BOOST,
    },
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return { ok: false, error: `ELEVENLABS_${r.status}`, detail: t.slice(0, 400) };
  }

  const buf = Buffer.from(await r.arrayBuffer());
  return { ok: true, audioBytes: buf.toString("base64"), audioMime: "audio/mpeg" };
}

/* ======================================================
   Routes
====================================================== */

app.get("/", (req, res) => res.json({ ok: true, service: "sandblast-backend" }));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "sandblast-backend",
    env: NODE_ENV,
    time: new Date().toISOString(),
    build: BUILD_SHA,
    sessions: SESSIONS.size,
    cors: { allowedOrigins: ALLOWED_ORIGINS.length },
    tts: {
      enabled: ENABLE_TTS,
      provider: TTS_PROVIDER,
      hasKey: Boolean(ELEVENLABS_API_KEY),
      hasVoiceId: Boolean(ELEVENLABS_VOICE_ID),
      model: ELEVENLABS_MODEL_ID || null,
      tuning: {
        stability: NYX_VOICE_STABILITY,
        similarity: NYX_VOICE_SIMILARITY,
        style: NYX_VOICE_STYLE,
        speakerBoost: NYX_VOICE_SPEAKER_BOOST,
      },
    },
  });
});

// Chat (MusicMoments first, then MusicKnowledge)
app.post("/api/chat", async (req, res) => {
  try {
    const sessionId = extractSessionId(req.body) || makeSessionId();
    const msg = extractMessage(req.body);

    if (ENABLE_DEBUG) {
      console.log("[/api/chat] origin=", req.headers.origin || "(none)");
      console.log("[/api/chat] keys=", Object.keys(req.body || {}));
      console.log("[/api/chat] sessionId=", sessionId, "msg=", msg);
    }

    const session =
      getSession(sessionId) || {
        _t: nowMs(),
        hasSpoken: false,
        activeMusicChart: "Billboard Hot 100",
      };

    if (!msg) {
      setSession(sessionId, session);
      return res.json({
        ok: true,
        reply:
          "On air—welcome to Sandblast. I’m Nyx. Tell me what you’re here for, and I’ll take it from there.",
        followUp: null,
        sessionId,
      });
    }

    // Route: curated moments first
    if (musicMoments && typeof musicMoments.handle === "function") {
      try {
        const out = musicMoments.handle(msg, session);
        if (out && out.reply) {
          if (out.sessionPatch && typeof out.sessionPatch === "object") {
            Object.assign(session, out.sessionPatch);
          }
          setSession(sessionId, session);
          return res.json({
            ok: true,
            reply: String(out.reply).trim(),
            followUp: out.followUp || null,
            sessionId,
          });
        }
      } catch (e) {
        if (ENABLE_DEBUG) console.warn("[musicMoments] fail:", e.message);
      }
    }

    // Fallback: musicKnowledge
    if (musicKnowledge && typeof musicKnowledge.handleChat === "function") {
      try {
        const out = musicKnowledge.handleChat({ text: msg, session });
        if (out && out.reply) {
          if (out.sessionPatch && typeof out.sessionPatch === "object") {
            Object.assign(session, out.sessionPatch);
          }
          setSession(sessionId, session);
          return res.json({
            ok: true,
            reply: String(out.reply).trim(),
            followUp: out.followUp || null,
            sessionId,
          });
        }
      } catch (e) {
        if (ENABLE_DEBUG) console.warn("[musicKnowledge] fail:", e.message);
      }
    }

    // Final fallback
    setSession(sessionId, session);
    return res.json({
      ok: true,
      reply: "Tell me a year (1950–2024) and I’ll pull the top 10, #1, or a story moment.",
      followUp: null,
      sessionId,
    });
  } catch (err) {
    console.error("[/api/chat] ERROR:", err);
    return res.status(500).json({
      ok: false,
      reply: "I’m having trouble reaching my brain right now. Try again in a moment.",
    });
  }
});

// TTS
app.post("/api/tts", async (req, res) => {
  try {
    if (!ENABLE_TTS) return res.status(503).json({ ok: false, error: "TTS_DISABLED" });

    const text = cleanText(req.body?.text || req.body?.message || req.body?.input || "");
    if (!text) return res.status(400).json({ ok: false, error: "NO_TEXT" });

    if (TTS_PROVIDER === "elevenlabs") {
      const out = await elevenLabsTts(text);
      if (!out || out.ok === false) {
        return res.status(500).json(out || { ok: false, error: "TTS_FAILED" });
      }
      return res.json({ ok: true, audioBytes: out.audioBytes, audioMime: out.audioMime });
    }

    return res.status(400).json({ ok: false, error: `UNKNOWN_TTS_PROVIDER:${TTS_PROVIDER}` });
  } catch (err) {
    console.error("[/api/tts] ERROR:", err);
    return res.status(500).json({ ok: false, error: "TTS_ERROR" });
  }
});

// /api/voice alias (widget compatibility)
app.post("/api/voice", (req, res, next) => {
  req.url = "/api/tts";
  next();
});
app.post("/api/voice", (req, res) => app._router.handle(req, res, () => {}));

/* ======================================================
   Start
====================================================== */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[sandblast-backend] up :${PORT} env=${NODE_ENV} build=${BUILD_SHA || "n/a"}`);
});
