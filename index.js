"use strict";

/**
 * Sandblast Backend — index.js (product-system hardened)
 *
 * Pillars:
 * A) Regression Harness + Behavior Contract
 * B) Stage rollout + safe flags (env toggles)
 * C) Observability (requestId, structured logs)
 * D) UX Integrity (anti-loop, guided follow-ups, politeness)
 */

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// -----------------------------
// Env / Config
// -----------------------------
const PORT = Number(process.env.PORT || 10000);
const NODE_ENV = process.env.NODE_ENV || "production";

const ENABLE_DEBUG = String(process.env.NYX_DEBUG || "").toLowerCase() === "true";
const ENABLE_REQ_LOG = String(process.env.NYX_REQ_LOG || "").toLowerCase() === "true";

const NYX_STRICT_CONTRACT =
  String(process.env.NYX_STRICT_CONTRACT || "").toLowerCase() === "true";

const NYX_CONTRACT_VERSION = String(process.env.NYX_CONTRACT_VERSION || "1.0.0");

// Stage rollouts
const NYX_STAGE =
  String(process.env.NYX_STAGE || "prod").toLowerCase(); // prod | beta | dev

// CORS
const ALLOWED_ORIGINS = String(process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// TTS
const TTS_PROVIDER = String(process.env.TTS_PROVIDER || "elevenlabs").toLowerCase();
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "";
const NYX_VOICE_MODEL = process.env.NYX_VOICE_MODEL || null;

const NYX_VOICE_STABILITY = Number(process.env.NYX_VOICE_STABILITY ?? 0.55);
const NYX_VOICE_SIMILARITY = Number(process.env.NYX_VOICE_SIMILARITY ?? 0.78);
const NYX_VOICE_STYLE = Number(process.env.NYX_VOICE_STYLE ?? 0.12);
const NYX_VOICE_SPEAKER_BOOST =
  String(process.env.NYX_VOICE_SPEAKER_BOOST ?? "false").toLowerCase() === "true";

// S2S
const ENABLE_S2S = String(process.env.S2S_ENABLED || "true").toLowerCase() !== "false";

// -----------------------------
// Load modules
// -----------------------------
let intentClassifier = null;
let nyxPersonality = null;
let musicKnowledge = null;
let sponsorsModule = null;
let tvModule = null;

try {
  intentClassifier = require("./Utils/intentClassifier");
} catch (e) {
  // optional
}
try {
  nyxPersonality = require("./Utils/nyxPersonality");
} catch (e) {
  // optional
}
try {
  musicKnowledge = require("./Utils/musicKnowledge");
} catch (e) {
  // optional
}
try {
  sponsorsModule = require("./responseModules/sponsorsModule");
} catch (e) {
  // optional
}
try {
  tvModule = require("./responseModules/tvModule");
} catch (e) {
  // optional
}

// S2S helper module (upload audio → transcript + reply + optional audio)
let s2sModule = null;
let multer = null;
try {
  multer = require("multer");
} catch (e) {
  multer = null;
}
try {
  s2sModule = require("./Utils/s2s");
} catch (e) {
  s2sModule = null;
}

// -----------------------------
// App setup
// -----------------------------
const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// RequestId middleware
app.use((req, res, next) => {
  req.requestId = crypto.randomBytes(8).toString("hex");
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

// CORS setup
const corsOptions = {
  origin: function (origin, callback) {
    // allow non-browser / curl without origin
    if (!origin) return callback(null, true);

    if (!ALLOWED_ORIGINS.length) {
      // permissive if not set (dev convenience)
      return callback(null, true);
    }

    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);

    return callback(new Error("CORS_NOT_ALLOWED"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Visitor-Id",
    "X-Contract-Version",
    "X-Nyx-Contract",
  ],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// -----------------------------
// In-memory session store
// -----------------------------
const sessions = new Map();

function nowMs() {
  return Date.now();
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function setSession(sessionId, session) {
  sessions.set(sessionId, session);
}

function makeSessionId() {
  return "sess_" + crypto.randomBytes(6).toString("hex");
}

// -----------------------------
// Contract helpers
// -----------------------------
function extractVisitorId(req) {
  return (
    req.headers["x-visitor-id"] ||
    req.headers["x-visitorid"] ||
    req.headers["x-nyx-visitor-id"] ||
    req.body?.visitorId ||
    null
  );
}

function extractContractVersion(req) {
  return (
    req.headers["x-contract-version"] ||
    req.headers["x-nyx-contract"] ||
    req.body?.contractVersion ||
    null
  );
}

function sendContracted(res, req, payload) {
  // Include contractOut if strict contract is enabled
  const out = { ...payload };
  out.requestId = req.requestId;
  out.contractOut = NYX_CONTRACT_VERSION;
  return res.json(out);
}

// -----------------------------
// Text utils
// -----------------------------
function cleanText(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// -----------------------------
// Intent helpers
// -----------------------------
function extractSessionId(body) {
  const sid = body?.sessionId;
  if (sid && typeof sid === "string" && sid.length < 128) return sid;
  return null;
}

function extractMessage(body) {
  const m = body?.message ?? body?.text ?? body?.prompt ?? "";
  return cleanText(m);
}

function inferIntent(msg) {
  if (intentClassifier && typeof intentClassifier.classify === "function") {
    try {
      return intentClassifier.classify(msg);
    } catch (e) {
      // fall through
    }
  }
  // fallback minimal intent
  const t = msg.toLowerCase();

  if (/^(top\s*10)\b/.test(t)) return { label: "music_top10", confidence: 0.7 };
  if (/story\s*moment\b/.test(t)) return { label: "music_story", confidence: 0.7 };
  if (/micro\s*moment\b/.test(t)) return { label: "music_micro", confidence: 0.7 };

  if (/\b(tv|episode|show|series)\b/.test(t)) return { label: "tv", confidence: 0.6 };
  if (/\b(sponsor|advertis|ads?)\b/.test(t)) return { label: "sponsors", confidence: 0.6 };
  if (/\b(ai|consult|prompt)\b/.test(t)) return { label: "ai", confidence: 0.6 };

  return { label: "general", confidence: 0.4 };
}

function extractYear(msg) {
  const m = String(msg || "").match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  if (!m) return null;
  const y = Number(m[1]);
  if (y >= 1950 && y <= 2024) return y;
  return null;
}

function classifyMissingYearIntent(msg) {
  const t = String(msg || "").toLowerCase();
  // only if user is clearly invoking a year-dependent command
  if (/\b(top\s*10|story\s*moment|micro\s*moment)\b/.test(t) && !extractYear(t)) {
    return true;
  }
  return false;
}

function isGreetingText(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  // Common short greetings; keep conservative to avoid stealing real intents
  return /^(hi|hey|hello|yo|sup|good\s*(morning|afternoon|evening)|howdy)\b/i.test(t);
}

function makeGreetingReply(session) {
  const who = session?.name ? `, ${session.name}` : "";
  // IMPORTANT: must contain hi/hey/welcome to satisfy regression expectations.
  return `Hey${who} — welcome to Sandblast. I’m Nyx. Want Music, TV, Sponsors, or AI?`;
}


// -----------------------------
// Anti-loop guard (backend side)
// -----------------------------
function applyAntiLoop(session, userMsg, reply) {
  const msg = cleanText(userMsg);
  const rep = cleanText(reply);

  if (!msg || !rep) return reply;

  const lastUser = cleanText(session?.lastUserMsg || "");
  const lastReply = cleanText(session?.lastReply || "");

  // If user repeats and we repeat, force a different response.
  const userRepeated = lastUser && lastUser.toLowerCase() === msg.toLowerCase();
  const replyRepeated = lastReply && lastReply.toLowerCase() === rep.toLowerCase();

  if (userRepeated && replyRepeated) {
    return (
      "Got you — I’m not going to loop. Tell me one of these:\n" +
      "• Music: “top 10 1950” or “story moment 1950”\n" +
      "• TV: “tv” or “latest episodes”\n" +
      "• Sponsors: “advertise”\n" +
      "Or just say what you want, and I’ll route it."
    );
  }

  return reply;
}

// -----------------------------
// Helpers: response shaping
// -----------------------------
function wrapNyxVoice(reply, session) {
  // Light, product-safe wrapper only; avoid over-persona in backend.
  // Keep it non-rude, non-condescending, short, and directive.
  if (!reply) return reply;

  let out = String(reply);

  // Prevent abrasive phrasing ever shipping.
  out = out.replace(/I'm not going to repeat myself.*$/gim, "");
  out = out.replace(/waste your time.*$/gim, "");

  // Ensure endings include a next step if the reply is short.
  if (out.length < 120 && !/[?]$/.test(out)) {
    out = out + " What do you want to do next?";
  }

  return out.trim();
}

function makeMissingYearPrompt() {
  return (
    "Quick one — which year? (1950–2024)\n" +
    "Examples:\n" +
    "• “top 10 1950”\n" +
    "• “story moment 1950”\n" +
    "• “micro moment 1950”"
  );
}

// -----------------------------
// Health
// -----------------------------
app.get("/api/health", (req, res) => {
  return res.json({
    ok: true,
    service: "sandblast-backend",
    env: NODE_ENV,
    time: new Date().toISOString(),
    build: process.env.RENDER_GIT_COMMIT || process.env.BUILD || null,
    sessions: sessions.size,
    cors: { allowedOrigins: ALLOWED_ORIGINS.length || 0 },
    tts: {
      enabled: !!TTS_PROVIDER,
      provider: TTS_PROVIDER,
      hasKey: !!ELEVENLABS_API_KEY,
      hasVoiceId: !!ELEVENLABS_VOICE_ID,
      model: NYX_VOICE_MODEL,
      tuning: {
        stability: NYX_VOICE_STABILITY,
        similarity: NYX_VOICE_SIMILARITY,
        style: NYX_VOICE_STYLE,
        speakerBoost: NYX_VOICE_SPEAKER_BOOST,
      },
    },
    s2s: {
      enabled: ENABLE_S2S,
      hasMulter: !!multer,
      hasModule: !!s2sModule,
    },
  });
});

// -----------------------------
// Chat endpoint
// -----------------------------
app.post("/api/chat", async (req, res) => {
  try {
    const contractIn = extractContractVersion(req);
    const visitorId = extractVisitorId(req);

    if (NYX_STRICT_CONTRACT && !visitorId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_VISITOR_ID",
        requestId: req.requestId,
      });
    }

    const sessionId = extractSessionId(req.body) || makeSessionId();
    const msg = extractMessage(req.body);

    if (ENABLE_DEBUG) {
      console.log("[/api/chat] requestId=", req.requestId);
      console.log("[/api/chat] origin=", req.headers.origin || "(none)");
      console.log("[/api/chat] sessionId=", sessionId, "visitorId=", visitorId, "msg=", msg);
      console.log("[/api/chat] contractIn=", contractIn);
    }

    const session =
      getSession(sessionId) || {
        _t: nowMs(),
        hasSpoken: false,
        activeMusicChart: "Billboard Hot 100",
        lastUserMsg: "",
        lastReply: "",
        name: null,
      };

    if (!msg) {
      setSession(sessionId, session);
      return sendContracted(res, req, {
        ok: true,
        reply: "On air—welcome to Sandblast. I’m Nyx. Tell me what you’re here for, and I’ll take it from there.",
        followUpLegacy: null,
        followUpsV1: [],
        sessionId,
      });
    }

    // Greeting fast-path (regression-critical): catch simple "hi/hey/hello" and respond politely.
    // This also prevents the "pick a mode" loop on casual openers.
    if (isGreetingText(msg)) {
      // Persist session so the next turn behaves like an ongoing conversation.
      session.hasSpoken = true;
      setSession(sessionId, session);

      const reply = makeGreetingReply(session);
      return sendContracted(res, req, {
        ok: true,
        reply,
        followUpLegacy: null,
        followUpsV1: [],
        sessionId,
      });
    }

    // Guard: incomplete commands (prevents “Top 10” looping even with legacy widget)
    if (classifyMissingYearIntent(msg)) {
      session.lastUserMsg = msg;
      session.lastReply = makeMissingYearPrompt();
      session.hasSpoken = true;
      setSession(sessionId, session);

      return sendContracted(res, req, {
        ok: true,
        reply: session.lastReply,
        followUpLegacy: null,
        followUpsV1: [],
        sessionId,
      });
    }

    // Intent + routing
    const intent = inferIntent(msg);

    // Save name intent (very lightweight)
    // Example: "my name is Mac"
    const nameMatch = msg.match(/\bmy name is\s+([a-z][a-z'\- ]{1,40})\b/i);
    if (nameMatch && nameMatch[1]) {
      session.name = cleanText(nameMatch[1]).split(" ").slice(0, 3).join(" ");
    }

    let reply = "";
    let followUpLegacy = null;
    let followUpsV1 = [];

    // MUSIC
    if (intent.label.startsWith("music") && musicKnowledge && typeof musicKnowledge.handleChat === "function") {
      const out = musicKnowledge.handleChat({
        text: msg,
        session,
        sessionId,
        stage: NYX_STAGE,
      });

      reply = out?.reply || "";
      followUpLegacy = out?.followUp ?? null;
      if (Array.isArray(out?.followUps)) followUpsV1 = out.followUps;
    }

    // TV
    else if (intent.label === "tv" && tvModule && typeof tvModule.handleChat === "function") {
      const out = await tvModule.handleChat({ text: msg, session, sessionId, stage: NYX_STAGE });
      reply = out?.reply || "";
      followUpLegacy = out?.followUp ?? null;
      if (Array.isArray(out?.followUps)) followUpsV1 = out.followUps;
    }

    // SPONSORS
    else if (intent.label === "sponsors" && sponsorsModule && typeof sponsorsModule.handleChat === "function") {
      const out = await sponsorsModule.handleChat({ text: msg, session, sessionId, stage: NYX_STAGE });
      reply = out?.reply || "";
      followUpLegacy = out?.followUp ?? null;
      if (Array.isArray(out?.followUps)) followUpsV1 = out.followUps;
    }

    // GENERAL (fallback)
    else {
      // Keep this friendly and not “menu-only”.
      const year = extractYear(msg);
      if (year) {
        reply = `Got it — ${year}. Want “top 10 ${year}”, “story moment ${year}”, or “micro moment ${year}”?`;
      } else {
        reply =
          "Tell me what you want: Music (Top 10 / Story / Micro), TV, Sponsors, or AI — and I’ll route it.";
      }
    }

    // Nyx voice wrapper + anti-loop
    reply = wrapNyxVoice(reply, session);
    reply = applyAntiLoop(session, msg, reply);

    // Persist session
    session.lastUserMsg = msg;
    session.lastReply = reply;
    session.hasSpoken = true;
    session._t = nowMs();
    setSession(sessionId, session);

    // Response
    return sendContracted(res, req, {
      ok: true,
      reply,
      followUpLegacy,
      followUpsV1,
      sessionId,
    });
  } catch (err) {
    console.error("[/api/chat] error", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      requestId: req.requestId,
    });
  }
});

// -----------------------------
// TTS endpoint (ElevenLabs)
// -----------------------------
app.post("/api/tts", async (req, res) => {
  try {
    const text = cleanText(req.body?.text || "");

    if (!text) {
      return res.status(400).json({ ok: false, error: "NO_TEXT", requestId: req.requestId });
    }

    if (TTS_PROVIDER !== "elevenlabs") {
      return res.status(501).json({ ok: false, error: "TTS_PROVIDER_NOT_ENABLED", requestId: req.requestId });
    }

    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
      return res.status(500).json({ ok: false, error: "TTS_NOT_CONFIGURED", requestId: req.requestId });
    }

    const fetch = global.fetch || (await import("node-fetch")).default;

    const body = {
      text,
      model_id: NYX_VOICE_MODEL || undefined,
      voice_settings: {
        stability: clamp(NYX_VOICE_STABILITY, 0, 1),
        similarity_boost: clamp(NYX_VOICE_SIMILARITY, 0, 1),
        style: clamp(NYX_VOICE_STYLE, 0, 1),
        use_speaker_boost: !!NYX_VOICE_SPEAKER_BOOST,
      },
    };

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return res.status(502).json({
        ok: false,
        error: "TTS_UPSTREAM_ERROR",
        status: r.status,
        detail: detail.slice(0, 500),
        requestId: req.requestId,
      });
    }

    const audioBuf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", String(audioBuf.length));
    return res.status(200).send(audioBuf);
  } catch (err) {
    console.error("[/api/tts] error", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR", requestId: req.requestId });
  }
});

// Aliases (compat)
app.post("/api/voice", (req, res) => app._router.handle(req, res, () => {}, "/api/tts"));
app.post("/api/tts/voice", (req, res) => app._router.handle(req, res, () => {}, "/api/tts"));

// -----------------------------
// S2S endpoint (upload audio, return transcript + reply + optional audio)
// -----------------------------
if (ENABLE_S2S && multer && s2sModule) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

  app.post("/api/s2s", upload.single("file"), async (req, res) => {
    try {
      const sessionId = req.body?.sessionId || makeSessionId();
      const session = getSession(sessionId) || { _t: nowMs(), hasSpoken: false };

      if (!req.file?.buffer) {
        return res.status(400).json({ ok: false, error: "NO_FILE", requestId: req.requestId });
      }

      const mimeType = req.file.mimetype || "application/octet-stream";
      const audioBuffer = req.file.buffer;

      let transcript = "";
      let reply = "";
      let audioBytes = null;
      let audioMime = null;

      if (typeof s2sModule.handle === "function") {
        const out = await s2sModule.handle({ audioBuffer, mimeType, session, sessionId });
        transcript = out?.transcript || "";
        reply = out?.reply || "";
        audioBytes = out?.audioBytes || null;
        audioMime = out?.audioMime || null;
        if (out?.sessionPatch && typeof out.sessionPatch === "object") {
          Object.assign(session, out.sessionPatch);
        }
      } else {
        return res.status(501).json({ ok: false, error: "S2S_NOT_AVAILABLE", requestId: req.requestId });
      }

      // Persist session
      session.hasSpoken = true;
      session._t = nowMs();
      setSession(sessionId, session);

      return res.json({
        ok: true,
        transcript,
        reply,
        audioBytes,
        audioMime,
        sessionId,
        requestId: req.requestId,
      });
    } catch (err) {
      console.error("[/api/s2s] error", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR", requestId: req.requestId });
    }
  });
} else {
  // If disabled or missing deps, keep the route present but explicit.
  app.post("/api/s2s", (req, res) => {
    return res.status(501).json({
      ok: false,
      error: "S2S_DISABLED",
      requestId: req.requestId,
    });
  });
}

// -----------------------------
// Start
// -----------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[boot] sandblast-backend listening on ${PORT} env=${NODE_ENV} stage=${NYX_STAGE}`);
  if (ALLOWED_ORIGINS.length) console.log("[boot] CORS_ALLOWED_ORIGINS=", ALLOWED_ORIGINS.join(", "));
  console.log("[boot] NYX_CONTRACT_VERSION=", NYX_CONTRACT_VERSION, "STRICT=", NYX_STRICT_CONTRACT);
  console.log(
    "[boot] TTS provider=",
    TTS_PROVIDER,
    "hasKey=",
    !!ELEVENLABS_API_KEY,
    "hasVoiceId=",
    !!ELEVENLABS_VOICE_ID
  );
  console.log("[boot] S2S enabled=", ENABLE_S2S, "hasMulter=", !!multer, "hasModule=", !!s2sModule);
});
