"use strict";

/**
 * Sandblast
 * Sandblast Backend — index.js
 *
 * Goals:
 *  - Bulletproof /api/chat contract v1.
 *  - Strong conversational flow: greeting → year/mode routing → guided follow-ups.
 *  - Defensive session handling (in-memory) with optional durable sessions (future).
 *  - Works with musicKnowledge + optional s2s (server-to-server) modules.
 *
 * Notes:
 *  - This file is intentionally defensive: safe parsing, safe fallbacks.
 *  - Keep “chips” support via followUps array (legacy).
 */

const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

/* ======================================================
   Version + Contract
====================================================== */

const NYX_CONTRACT_VERSION = "1";
const INDEX_VERSION =
  "index.js v1.1.1 (P3 stable + year-spine chart forced + Story/Micro mode-fidelity fallback when engine returns Top10 or missing data)";

/* ======================================================
   Basic middleware
====================================================== */

app.use(express.json({ limit: "1mb" }));

// CORS: allowlist from env (comma-separated), plus localhost by default
function parseAllowedOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || "").trim();
  const defaults = ["http://localhost:3000", "http://127.0.0.1:3000"];
  const list = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  return Array.from(new Set([...defaults, ...list]));
}
const ALLOWED_ORIGINS = parseAllowedOrigins();

app.use(
  cors({
    origin: function (origin, cb) {
      // allow non-browser clients
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
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
    maxAge: 86400,
  })
);

app.options("*", cors());

/* ======================================================
   Helpers
====================================================== */

function nowIso() {
  return new Date().toISOString();
}

function rid() {
  return crypto.randomBytes(8).toString("hex");
}

function cleanText(s) {
  return String(s || "")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeJsonParse(body) {
  // express.json already parses; this exists for defensive paths
  try {
    if (typeof body === "object") return body;
    return JSON.parse(String(body || "{}"));
  } catch {
    return null;
  }
}

function clampYear(y) {
  if (!Number.isFinite(y)) return null;
  if (y < 1950 || y > 2024) return null;
  return y;
}

/* ======================================================
   Session store (in-memory)
====================================================== */

const SESSIONS = new Map();

function getSession(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  if (!SESSIONS.has(sid)) {
    SESSIONS.set(sid, {
      id: sid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // conversation state
      lastYear: null,
      activeMusicMode: null, // "top10" | "story" | "micro"
      pendingMode: null, // mode waiting for year
      // future:
      activeMusicChart: "Billboard Hot 100",
    });
  }
  const s = SESSIONS.get(sid);
  s.updatedAt = Date.now();
  return s;
}

/* ======================================================
   Optional modules
====================================================== */

let musicKnowledge = null;
try {
  musicKnowledge = require("./Utils/musicKnowledge");
} catch (e) {
  musicKnowledge = null;
}

let s2sEnabled = false;
let s2sModule = null;
try {
  s2sModule = require("./Utils/s2s");
  s2sEnabled = !!s2sModule;
} catch (e) {
  s2sEnabled = false;
  s2sModule = null;
}

/* ======================================================
   TTS (ElevenLabs)
====================================================== */

const TTS_ENABLED = String(process.env.TTS_ENABLED || "true") === "true";
const TTS_PROVIDER = String(process.env.TTS_PROVIDER || "elevenlabs");
const ELEVEN_KEY = String(process.env.ELEVENLABS_API_KEY || "");
const ELEVEN_VOICE_ID = String(process.env.ELEVENLABS_VOICE_ID || "");

function getTtsTuningForMode(voiceMode) {
  const base = {
    stability: Number(process.env.NYX_VOICE_STABILITY ?? 0.55),
    similarity: Number(process.env.NYX_VOICE_SIMILARITY ?? 0.78),
    style: Number(process.env.NYX_VOICE_STYLE ?? 0.12),
    speakerBoost:
      String(process.env.NYX_VOICE_SPEAKER_BOOST ?? "false") === "true",
  };

  const m = String(voiceMode || "").toLowerCase();
  if (m === "calm") {
    return {
      ...base,
      stability: Math.min(1, base.stability + 0.15),
      style: Math.max(0, base.style - 0.08),
      speakerBoost: false,
    };
  }
  if (m === "high" || m === "highenergy" || m === "high-energy") {
    return {
      ...base,
      stability: Math.max(0, base.stability - 0.12),
      style: Math.min(1, base.style + 0.18),
      speakerBoost: true,
    };
  }
  return base;
}

/* ======================================================
   Intent helpers (greetings + mode/year resolver)
====================================================== */

function extractYearFromText(s) {
  const m = String(s || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/); // 1950–2024
  return m ? Number(m[1]) : null;
}

function isBareYearMessage(text) {
  const t = cleanText(text);
  return /^\s*(19[5-9]\d|20[0-1]\d|202[0-4])\s*$/.test(t);
}

function isGreeting(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;
  if (/^(hi|hey|hello|yo|sup|greetings)\b/.test(t)) return true;
  if (/^(hi\s+nyx|hey\s+nyx|hello\s+nyx)\b/.test(t)) return true;
  return false;
}

function greetingReply() {
  return "Hi — welcome to Sandblast. I’m Nyx. Give me a year (1950–2024) and choose: Top 10, Story moment, or Micro moment.";
}

function makeFollowUps() {
  const items = ["1950", "Top 10", "Story moment", "Micro moment"];
  return {
    followUp: items,
    followUps: items.map((x) => ({ label: x, send: x })),
  };
}

function replyMissingYearForMode(mode) {
  if (mode === "top10")
    return "Hi — I can do that. What year (1950–2024) for your Top 10?";
  if (mode === "story")
    return "Hi — love it. What year (1950–2024) for the story moment?";
  if (mode === "micro")
    return "Sure. What year (1950–2024) for the micro-moment?";
  return "What year (1950–2024) should I use?";
}

function normalizeModeToken(text) {
  const t = cleanText(text).toLowerCase();
  if (/\b(top\s*10|top10|top ten)\b/.test(t)) return "top10";
  if (/\b(story\s*moment|story)\b/.test(t)) return "story";
  if (/\b(micro\s*moment|micro)\b/.test(t)) return "micro";
  return null;
}

function modeToCommand(mode) {
  if (mode === "top10") return "top 10";
  if (mode === "story") return "story moment";
  if (mode === "micro") return "micro moment";
  return "top 10";
}

/**
 * v1.1.x: Force a single "year spine" chart for any year-based mode (Top10/Story/Micro)
 * so story/micro do not drift to a chart source that lacks a year.
 */
function forceYearSpineChart(session) {
  if (!session || typeof session !== "object") return;
  session.activeMusicChart = "Billboard Year-End Hot 100";
}

function replyIndicatesNoCleanListForYear(reply) {
  const t = cleanText(reply).toLowerCase();
  return (
    t.includes("don’t have a clean list") || t.includes("don't have a clean list")
  );
}

// suppress “Try story moment YEAR first” style loop prompts
function replyIndicatesTryStoryMomentFirst(reply) {
  const t = cleanText(reply).toLowerCase();
  return t.includes("try “story moment") || t.includes('try "story moment');
}

function replyIndicatesYearPrompt(reply) {
  const t = cleanText(reply).toLowerCase();
  return (
    t.startsWith("tell me a year") ||
    t.includes("tell me a year (1950") ||
    t.includes("or an artist + year")
  );
}

/* ======================================================
   Mode-fidelity helpers (Story/Micro fallback)
====================================================== */

function replyLooksLikeTop10List(reply) {
  const t = cleanText(reply);
  return /^Top 10\s+—/i.test(t);
}

function stripTrailingWantPrompt(s) {
  return cleanText(String(s || ""))
    .replace(/\s+Want\s+#1.*$/i, "")
    .replace(/\s+Want\s+a\s+story\s+moment.*$/i, "")
    .replace(/\s+Want\s+a\s+micro\s+moment.*$/i, "")
    .trim();
}

// Extract year + #1 artist/title from Top10 reply:
// "Top 10 — Billboard Year-End Hot 100 (1988): 1. George Michael — Faith 2. ..."
function extractTop10NumberOne(reply) {
  const t = cleanText(reply);

  const ym = t.match(/\((19[5-9]\d|20[0-1]\d|202[0-4])\)\s*:/);
  const year = ym ? clampYear(Number(ym[1])) : null;
  if (!year) return null;

  // Capture item 1 until " 2." or end
  const m = t.match(/:\s*1\.\s*([^—]+?)\s*—\s*(.+?)(?=\s+2\.|$)/i);
  if (!m) return { year, artist: null, title: null };

  const artist = cleanText(m[1]);
  const title = stripTrailingWantPrompt(m[2]);

  if (!artist || !title) return { year, artist: artist || null, title: title || null };
  return { year, artist, title };
}

function makeMicroMomentFromNumberOne({ year, artist, title }) {
  // ~35–45 words, broadcast-tight
  const a = artist || "the year’s biggest artist";
  const s = title ? `“${title}”` : "a massive #1";
  return `Micro moment — ${year}: ${a} hit #1 with ${s}. One hook, one heartbeat—pure year-end momentum that made radios feel like a victory lap. Want a story moment, or another year?`;
}

function makeStoryMomentFromNumberOne({ year, artist, title }) {
  // ~50–60 words, broadcast-tight
  const a = artist || "the year’s biggest artist";
  const s = title ? `“${title}”` : "a massive #1";
  return `Story moment — ${year}: ${a} owned the year-end conversation with ${s} at #1. It’s a snapshot of the era—tight chorus, big polish, and that “turn it up again” energy that glued people to their car radios. Want the Top 10, a micro moment, or another year?`;
}

/* ======================================================
   API: health
====================================================== */

app.get("/api/health", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);

  res.json({
    ok: true,
    service: "sandblast-backend",
    env: process.env.NODE_ENV || "production",
    time: nowIso(),
    build: process.env.RENDER_GIT_COMMIT || null,
    version: INDEX_VERSION,
    sessions: SESSIONS.size,
    cors: { allowedOrigins: ALLOWED_ORIGINS.length },
    contract: {
      version: NYX_CONTRACT_VERSION,
      strict: String(process.env.CONTRACT_STRICT || "false") === "true",
      rolloutPct: Number(process.env.CONTRACT_ROLLOUT_PCT || 100),
    },
    tts: {
      enabled: TTS_ENABLED,
      provider: TTS_PROVIDER,
      hasKey: !!ELEVEN_KEY,
      hasVoiceId: !!ELEVEN_VOICE_ID,
      model: null,
      tuning: getTtsTuningForMode("standard"),
      modes: {
        calm: "stability↑ style↓",
        standard: "env defaults",
        high: "stability↓ style↑ boost on",
      },
    },
    s2s: { enabled: true, hasMulter: true, hasModule: !!s2sEnabled },
    durableSessions: {
      enabled: false,
      provider: "none",
      ttlSec: 7200,
    },
    requestId,
  });
});

/* ======================================================
   API: chat
====================================================== */

app.post("/api/chat", async (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);

  // Defensive parse
  const body = safeJsonParse(req.body);
  if (!body) {
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "INVALID_JSON",
      requestId,
    });
  }

  const message = cleanText(body.message || body.text || "");
  const sessionId = cleanText(body.sessionId || "");
  const visitorId = cleanText(body.visitorId || "");
  const contractVersion = cleanText(body.contractVersion || body.contract || "");
  const voiceMode = cleanText(body.voiceMode || "standard"); // widget can tag this

  // Contract check (soft)
  if (contractVersion && contractVersion !== NYX_CONTRACT_VERSION) {
    // allow for now; future: strict mode
  }

  const session =
    getSession(sessionId) || ({
      id: null,
      lastYear: null,
      activeMusicMode: null,
      pendingMode: null,
      activeMusicChart: "Billboard Hot 100",
    });

  // Greeting handling
  if (!message || isGreeting(message)) {
    const out = {
      ok: true,
      reply: greetingReply(),
      sessionId: sessionId || session.id || null,
      requestId,
      visitorId: visitorId || null,
      contractVersion: NYX_CONTRACT_VERSION,
      ...makeFollowUps(),
    };
    return res.json(out);
  }

  // -------------------------------
  // Pillar 3 Resolver (mode/year)
  // -------------------------------

  const parsedYear = clampYear(extractYearFromText(message));
  const parsedMode = normalizeModeToken(message);
  const bareYear = parsedYear ? isBareYearMessage(message) : false;

  // A/B/C) One-shot mode + year
  if (parsedYear && parsedMode) {
    session.lastYear = parsedYear;
    session.activeMusicMode = parsedMode;
    session.pendingMode = null;

    // Force year-spine chart for any year-based mode
    forceYearSpineChart(session);

    const canonical = `${modeToCommand(parsedMode)} ${parsedYear}`;
    const reply = await runMusicEngine(canonical, session, {
      hintedMode: parsedMode,
      hintedYear: parsedYear,
    });

    return res.json({
      ok: true,
      reply,
      sessionId: sessionId || session.id || null,
      requestId,
      visitorId: visitorId || null,
      contractVersion: NYX_CONTRACT_VERSION,
      ...makeFollowUps(),
    });
  }

  // D) Mode-only (handshake mode -> year) OR use sticky year if present
  if (parsedMode && !parsedYear) {
    session.activeMusicMode = parsedMode; // sticky mode
    session.pendingMode = parsedMode;

    // If lastYear exists, run immediately
    if (session.lastYear) {
      session.pendingMode = null;

      // Force year-spine chart for any year-based mode
      forceYearSpineChart(session);

      const canonical = `${modeToCommand(parsedMode)} ${session.lastYear}`;
      const reply = await runMusicEngine(canonical, session, {
        hintedMode: parsedMode,
        hintedYear: session.lastYear,
      });

      return res.json({
        ok: true,
        reply,
        sessionId: sessionId || session.id || null,
        requestId,
        visitorId: visitorId || null,
        contractVersion: NYX_CONTRACT_VERSION,
        ...makeFollowUps(),
      });
    }

    // Else ask for year once
    return res.json({
      ok: true,
      reply: replyMissingYearForMode(parsedMode),
      sessionId: sessionId || session.id || null,
      requestId,
      visitorId: visitorId || null,
      contractVersion: NYX_CONTRACT_VERSION,
      ...makeFollowUps(),
    });
  }

  // E/F) Year-only steps
  if (bareYear) {
    // pending mode exists: bind + execute
    if (session.pendingMode) {
      const mode = session.pendingMode;
      session.lastYear = parsedYear;
      session.activeMusicMode = mode;
      session.pendingMode = null;

      // Force year-spine chart for any year-based mode
      forceYearSpineChart(session);

      const canonical = `${modeToCommand(mode)} ${parsedYear}`;
      const reply = await runMusicEngine(canonical, session, {
        hintedMode: mode,
        hintedYear: parsedYear,
      });

      return res.json({
        ok: true,
        reply,
        sessionId: sessionId || session.id || null,
        requestId,
        visitorId: visitorId || null,
        contractVersion: NYX_CONTRACT_VERSION,
        ...makeFollowUps(),
      });
    }

    // active mode exists: sticky mode across years
    if (session.activeMusicMode) {
      const mode = session.activeMusicMode;
      session.lastYear = parsedYear;

      // Force year-spine chart for any year-based mode
      forceYearSpineChart(session);

      const canonical = `${modeToCommand(mode)} ${parsedYear}`;
      const reply = await runMusicEngine(canonical, session, {
        hintedMode: mode,
        hintedYear: parsedYear,
      });

      return res.json({
        ok: true,
        reply,
        sessionId: sessionId || session.id || null,
        requestId,
        visitorId: visitorId || null,
        contractVersion: NYX_CONTRACT_VERSION,
        ...makeFollowUps(),
      });
    }

    // bare year, no mode: store and ask for mode
    session.lastYear = parsedYear;

    return res.json({
      ok: true,
      reply: `Got it — ${parsedYear}. What do you want: Top 10, Story moment, or Micro moment?`,
      sessionId: sessionId || session.id || null,
      requestId,
      visitorId: visitorId || null,
      contractVersion: NYX_CONTRACT_VERSION,
      ...makeFollowUps(),
    });
  }

  // Default: pass through (supports “Prince 1984”, etc.)
  const reply = await runMusicEngine(message, session, null);

  return res.json({
    ok: true,
    reply,
    sessionId: sessionId || session.id || null,
    requestId,
    visitorId: visitorId || null,
    contractVersion: NYX_CONTRACT_VERSION,
    ...makeFollowUps(),
  });
});

/* ======================================================
   Music engine wrapper
====================================================== */

async function runMusicEngine(text, session, hint) {
  // If engine missing, provide safe fallback
  if (!musicKnowledge || typeof musicKnowledge.handleChat !== "function") {
    return "Tell me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.";
  }

  const safeCall = (t) => {
    try {
      return musicKnowledge.handleChat({ text: t, session });
    } catch {
      return null;
    }
  };

  const hintedMode = (hint && hint.hintedMode) || null;
  const wantedMode = hintedMode || session.activeMusicMode || null;

  // Primary call
  let out = safeCall(text);
  let reply = cleanText(out && out.reply);

  const parsedYear = clampYear(extractYearFromText(text));

  // If engine says "no clean list", force year-spine chart and retry once.
  if (parsedYear && replyIndicatesNoCleanListForYear(reply)) {
    forceYearSpineChart(session);
    const retry = safeCall(text);
    const retryReply = cleanText(retry && retry.reply);
    if (retryReply) reply = retryReply;
  }

  // Mode-fidelity fallback:
  // If Story/Micro was requested but engine returns Top 10, convert to requested mode.
  if ((wantedMode === "story" || wantedMode === "micro") && replyLooksLikeTop10List(reply)) {
    const one = extractTop10NumberOne(reply);
    if (one && one.year) {
      return wantedMode === "story"
        ? makeStoryMomentFromNumberOne(one)
        : makeMicroMomentFromNumberOne(one);
    }
  }

  // If Story/Micro requested and engine can't resolve a "clean list",
  // fetch Top 10 once and synthesize Story/Micro from #1.
  if (
    (wantedMode === "story" || wantedMode === "micro") &&
    parsedYear &&
    replyIndicatesNoCleanListForYear(reply)
  ) {
    forceYearSpineChart(session);

    const topOut = safeCall(`top 10 ${parsedYear}`);
    const topReply = cleanText(topOut && topOut.reply);

    if (replyLooksLikeTop10List(topReply)) {
      const one = extractTop10NumberOne(topReply);
      if (one && one.year) {
        return wantedMode === "story"
          ? makeStoryMomentFromNumberOne(one)
          : makeMicroMomentFromNumberOne(one);
      }
    }
    // If even Top10 fails, keep original reply (truthful failure).
  }

  // If musicKnowledge prompts for year even though we have year/mode context,
  // force session state and retry with bare year.
  if (replyIndicatesYearPrompt(reply)) {
    const fallbackYear =
      (hint && hint.hintedYear) ||
      clampYear(extractYearFromText(text)) ||
      session.lastYear;

    if (fallbackYear) session.lastYear = fallbackYear;
    if (wantedMode) session.activeMusicMode = wantedMode;

    if (
      session.activeMusicMode === "top10" ||
      session.activeMusicMode === "story" ||
      session.activeMusicMode === "micro"
    ) {
      forceYearSpineChart(session);
    }

    if (fallbackYear) {
      const second = safeCall(String(fallbackYear));
      const secondReply = cleanText(second && second.reply);

      if (secondReply && !replyIndicatesYearPrompt(secondReply)) {
        // If Story/Micro requested but second reply is Top10, convert.
        if ((wantedMode === "story" || wantedMode === "micro") && replyLooksLikeTop10List(secondReply)) {
          const one = extractTop10NumberOne(secondReply);
          if (one && one.year) {
            return wantedMode === "story"
              ? makeStoryMomentFromNumberOne(one)
              : makeMicroMomentFromNumberOne(one);
          }
        }
        return secondReply;
      }
    }
  }

  // Suppress loop-y prompts like “Try story moment YEAR first”
  const yr = clampYear(extractYearFromText(text)) || session.lastYear;
  if (replyIndicatesTryStoryMomentFirst(reply) && yr) {
    return `Got it — ${yr}. What do you want: Top 10, Story moment, or Micro moment?`;
  }

  // Final fallback safety
  if (!reply) {
    reply =
      "Tell me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.";
  }

  return reply;
}

/* ======================================================
   Start server
====================================================== */

const PORT = Number(process.env.PORT || 10000);
const HOST = "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(
    `[sandblast-backend] up :${PORT} env=${process.env.NODE_ENV || "production"} build=${
      process.env.RENDER_GIT_COMMIT || "n/a"
    } contract=${NYX_CONTRACT_VERSION} rollout=${
      process.env.CONTRACT_ROLLOUT_PCT || "100%"
    }`
  );
});

server.on("error", (err) => {
  console.error("[sandblast-backend] fatal listen error", err);
  process.exit(1);
});
