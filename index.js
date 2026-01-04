/**
 * Sandblast Backend — index.js
 * Canonical, CORS-safe, widget-compatible
 * Updated: 2026-01-04
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

/* ======================================================
   HARDENED CORS (FIXES WIDGET BACKEND BLOCK)
====================================================== */

const ALLOWED_ORIGINS = new Set([
  "https://sandblast.channel",
  "https://sandblastchannel.com",
  "https://www.sandblastchannel.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

app.use(cors({
  origin: (origin, cb) => {
    // Allow curl, server-to-server, health checks
    if (!origin) return cb(null, true);
    return cb(null, ALLOWED_ORIGINS.has(origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  maxAge: 86400
}));

// Explicit OPTIONS handler (critical for browsers)
app.options("*", cors());

/* ======================================================
   BODY PARSING
====================================================== */

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

/* ======================================================
   HEALTH CHECK (RENDER / CLOUDFLARE SAFE)
====================================================== */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "sandblast-backend",
    env: process.env.NODE_ENV || "production",
    time: new Date().toISOString()
  });
});

/* ======================================================
   CHAT ENDPOINT
====================================================== */

const musicMoments = require("./Utils/musicMoments");
const musicKnowledge = require("./Utils/musicKnowledge");

app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId, visitorId, context } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ ok: false, reply: "" });
    }

    // Unified handler (prevents loops)
    let result =
      musicMoments.handle(message, { sessionId, visitorId, context }) ||
      musicKnowledge.handleChat?.({
        text: message,
        session: { id: sessionId },
        context
      });

    if (!result || !result.reply) {
      return res.json({
        ok: true,
        reply: "I’m here — tell me what year or topic you want to explore.",
        sessionId: sessionId || "web"
      });
    }

    return res.json({
      ok: true,
      reply: String(result.reply).trim(),
      followUp: result.followUp || null,
      sessionId: result.sessionId || sessionId || "web"
    });

  } catch (err) {
    console.error("[/api/chat] ERROR:", err);
    return res.status(500).json({
      ok: false,
      reply: "I’m having trouble responding right now."
    });
  }
});

/* ======================================================
   TTS ENDPOINT (WIDGET-COMPATIBLE)
====================================================== */

app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ ok: false });
    }

    // If using ElevenLabs or OpenAI TTS, call here.
    // Placeholder safe fallback:
    return res.status(501).json({
      ok: false,
      message: "TTS provider not configured"
    });

  } catch (err) {
    console.error("[/api/tts] ERROR:", err);
    return res.status(500).json({ ok: false });
  }
});

/* ======================================================
   FAILSAFE ROOT
====================================================== */

app.get("/", (req, res) => {
  res.send("Sandblast backend online.");
});

/* ======================================================
   START SERVER
====================================================== */

const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[sandblast-backend] listening on ${PORT}`);
});
