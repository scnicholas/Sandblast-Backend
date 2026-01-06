"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v1.4.2 (CORS origin normalization + loop-closure + top10-no-year + #1 routing + another-year token)
 *
 * Hardening pass:
 *  - CORS: preflight uses SAME corsOptions, supports www/non-www symmetry, runs on /api/* consistently.
 *  - Parser: rawBody capture + JSON error responses + safe fallback parse for text/plain.
 *  - Contract: optional strict enforcement (409) + always returns X-Contract-Version.
 *  - Sessions: TTL cleanup hardened + optional MAX_SESSIONS cap.
 *  - Chat loop closure:
 *      - year-only with active/pending mode always executes (never re-asks mode)
 *      - “Another year” token supported
 *      - “Top 10” (no year) uses session.lastYear (sticky year)
 *      - “#1” uses engine (#1) if available; otherwise derives from last Top 10 list
 *      - next/prev year supports mode continuity
 *  - Headers: Cache-Control no-store for dynamic endpoints.
 */

const express = require("express");
const crypto = require("crypto");
const cors = require("cors");

const app = express();

/* ======================================================
   Version + Contract
====================================================== */

const NYX_CONTRACT_VERSION = "1";
const INDEX_VERSION =
  "index.js v1.4.2 (CORS origin normalization + loop-closure + top10-no-year + #1 routing + another-year token)";

/* ======================================================
   Basic middleware
====================================================== */

// ---- Raw body capture (for debugging parser failures) ----
function rawBodySaver(req, res, buf, encoding) {
  try {
    if (buf && buf.length) req.rawBody = buf.toString(encoding || "utf8");
  } catch (_) {
    // ignore
  }
}

// Parse JSON defensively.
app.use(
  express.json({
    limit: "1mb",
    verify: rawBodySaver,
  })
);

// Also accept text payloads (some proxies/clients accidentally send text/plain)
app.use(
  express.text({
    type: ["text/*"],
    limit: "1mb",
    verify: rawBodySaver,
  })
);

/* ======================================================
   CORS
====================================================== */

// CORS: allowlist from env (comma-separated), plus localhost by default
function parseAllowedOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || "").trim();
  const defaults = ["http://localhost:3000", "http://127.0.0.1:3000"];
  const list = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  return Array.from(new Set([...defaults, ...list]));
}
const ALLOWED_ORIGINS = parseAllowedOrigins();

// If you truly want wildcard, set CORS_ALLOW_ALL=true on Render.
const CORS_ALLOW_ALL = String(process.env.CORS_ALLOW_ALL || "false") === "true";

// Optional contract strictness (useful when you introduce v2 later)
const CONTRACT_STRICT = String(process.env.CONTRACT_STRICT || "false") === "true";

// Optional: cap sessions to avoid memory spikes on public launches (0 = disabled)
const MAX_SESSIONS = Math.max(0, Number(process.env.MAX_SESSIONS || 0));

function normalizeOrigin(origin) {
  const o = String(origin || "").trim();
  if (!o) return "";
  return o.replace(/\/$/, "");
}

function originMatchesAllowlist(origin) {
  const o = normalizeOrigin(origin);
  if (!o) return false;

  if (ALLOWED_ORIGINS.includes(o)) return true;

  // handle www/non-www symmetry
  try {
    const u = new URL(o);
    const host = String(u.hostname || "");
    if (!host) return false;

    const altHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    const alt = `${u.protocol}//${altHost}${u.port ? `:${u.port}` : ""}`;
    return ALLOWED_ORIGINS.includes(alt);
  } catch (_) {
    return false;
  }
}

// IMPORTANT: If you use Authorization in future, keep it here; browsers preflight on it.
const corsOptions = {
  origin: function (origin, cb) {
    if (!origin) return cb(null, true); // non-browser clients
    if (CORS_ALLOW_ALL) return cb(null, true);

    if (originMatchesAllowlist(origin)) return cb(null, true);

    // Return false (not error) so cors middleware simply omits headers.
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

// CRITICAL: preflight must use the SAME cors rules (avoid accidental wildcard).
// Using app.options("*") can be flaky under some proxy/router stacks.
// This handles OPTIONS cleanly for /api/* and still keeps a global fallback.
app.options("/api/*", cors(corsOptions));
app.options("*", cors(corsOptions));

/* ======================================================
   JSON parse error handler (pre-route)
   Prevent Express from returning HTML 400 pages.
====================================================== */
app.use((err, req, res, next) => {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);
  res.set("X-Contract-Version", NYX_CONTRACT_VERSION);
  res.set("Cache-Control", "no-store");

  const isJsonParseError =
    err &&
    (err.type === "entity.parse.failed" ||
      err instanceof SyntaxError ||
      String(err.message || "").toLowerCase().includes("json"));

  if (isJsonParseError) {
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "INVALID_JSON",
      message: String(err.message || "JSON parse error"),
      contentType: req.headers["content-type"] || null,
      rawPreview: String(req.rawBody || "").slice(0, 700),
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }

  return next(err);
});

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

function safeJsonParse(body, rawFallback) {
  try {
    if (body && typeof body === "object") return body;

    // If body is string and looks like JSON, parse it.
    if (typeof body === "string" && body.trim()) {
      const t = body.trim();
      if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
        return JSON.parse(t);
      }
      // Some clients send raw text; fall through.
    }

    if (rawFallback && String(rawFallback).trim()) {
      const rt = String(rawFallback).trim();
      if ((rt.startsWith("{") && rt.endsWith("}")) || (rt.startsWith("[") && rt.endsWith("]"))) {
        return JSON.parse(rt);
      }
    }

    return null;
  } catch {
    return null;
  }
}

function clampYear(y) {
  if (!Number.isFinite(y)) return null;
  if (y < 1950 || y > 2024) return null;
  return y;
}

function pickRotate(session, key, options) {
  if (!session || !Array.isArray(options) || options.length === 0)
    return options?.[0] || "";
  const k = String(key || "rot");
  const idxKey = `_rot_${k}`;
  const last = Number(session[idxKey] || 0);
  const next = (last + 1) % options.length;
  session[idxKey] = next;
  return options[next];
}

function safeIncYear(y, delta) {
  const yy = clampYear(Number(y));
  if (!yy) return null;
  return clampYear(yy + delta);
}

function makeUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ======================================================
   Session store (in-memory) + TTL cleanup
====================================================== */

const SESSIONS = new Map();

function issueSessionId() {
  return `s_${rid()}_${Date.now().toString(36)}`;
}

function getSession(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;

  if (!SESSIONS.has(sid)) {
    if (MAX_SESSIONS > 0 && SESSIONS.size >= MAX_SESSIONS) {
      let oldestKey = null;
      let oldestUpdated = Infinity;
      for (const [k, v] of SESSIONS.entries()) {
        const u = Number(v && v.updatedAt ? v.updatedAt : 0);
        if (u < oldestUpdated) {
          oldestUpdated = u;
          oldestKey = k;
        }
      }
      if (oldestKey) SESSIONS.delete(oldestKey);
    }

    SESSIONS.set(sid, {
      id: sid,
      createdAt: Date.now(),
      updatedAt: Date.now(),

      // identity/analytics
      visitorId: null,

      // conversation state
      lastYear: null,
      activeMusicMode: null, // "top10" | "story" | "micro"
      pendingMode: null, // mode waiting for year

      // chart:
      activeMusicChart: "Billboard Hot 100",

      // momentum
      lastReply: null,
      lastReplyAt: null,
      lastTop10One: null, // {year, artist, title}
      lastIntent: null,

      // voice continuity
      voiceMode: "standard", // "calm" | "standard" | "high"
    });
  }

  const s = SESSIONS.get(sid);
  s.updatedAt = Date.now();
  return s;
}

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 6 * 60 * 60 * 1000);
const CLEAN_INTERVAL_MS = Math.max(
  60 * 1000,
  Math.min(15 * 60 * 1000, Math.floor(SESSION_TTL_MS / 4))
);

const cleaner = setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [sid, s] of SESSIONS.entries()) {
    if (!s || (s.updatedAt || 0) < cutoff) SESSIONS.delete(sid);
  }
}, CLEAN_INTERVAL_MS);

try {
  if (typeof cleaner.unref === "function") cleaner.unref();
} catch (_) {
  // ignore
}

/* ======================================================
   Optional modules
====================================================== */

let musicKnowledge = null;
try {
  musicKnowledge = require("./Utils/musicKnowledge");
} catch {
  musicKnowledge = null;
}

/* ======================================================
   TTS (ElevenLabs)
====================================================== */

const TTS_ENABLED = String(process.env.TTS_ENABLED || "true") === "true";
const TTS_PROVIDER = String(process.env.TTS_PROVIDER || "elevenlabs");
const ELEVEN_KEY = String(process.env.ELEVENLABS_API_KEY || "");
const ELEVEN_VOICE_ID = String(process.env.ELEVENLABS_VOICE_ID || "");
const ELEVEN_MODEL_ID = String(
  process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2"
);

const hasFetch = typeof fetch === "function";

function normalizeVoiceMode(m) {
  const t = String(m || "").toLowerCase().trim();
  if (t === "calm") return "calm";
  if (t === "high" || t === "highenergy" || t === "high-energy") return "high";
  return "standard";
}

function getTtsTuningForMode(voiceMode) {
  const base = {
    stability: Number(process.env.NYX_VOICE_STABILITY ?? 0.55),
    similarity: Number(process.env.NYX_VOICE_SIMILARITY ?? 0.78),
    style: Number(process.env.NYX_VOICE_STYLE ?? 0.12),
    speakerBoost:
      String(process.env.NYX_VOICE_SPEAKER_BOOST ?? "false") === "true",
  };

  const m = normalizeVoiceMode(voiceMode);

  if (m === "calm") {
    return {
      ...base,
      stability: Math.min(1, base.stability + 0.15),
      style: Math.max(0, base.style - 0.08),
      speakerBoost: false,
    };
  }

  if (m === "high") {
    return {
      ...base,
      stability: Math.max(0, base.stability - 0.12),
      style: Math.min(1, base.style + 0.18),
      speakerBoost: true,
    };
  }

  return base;
}

async function elevenTtsMp3Buffer(text, voiceMode) {
  const tuning = getTtsTuningForMode(voiceMode);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
    ELEVEN_VOICE_ID
  )}`;

  const body = {
    text,
    model_id: ELEVEN_MODEL_ID,
    voice_settings: {
      stability: tuning.stability,
      similarity_boost: tuning.similarity,
      style: tuning.style,
      use_speaker_boost: tuning.speakerBoost,
    },
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVEN_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    return { ok: false, status: r.status, detail: errText.slice(0, 1200) };
  }

  const buf = Buffer.from(await r.arrayBuffer());
  return { ok: true, buf };
}

/* ======================================================
   Intent helpers
====================================================== */

function extractYearFromText(s) {
  const m = String(s || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
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

function normalizeNavToken(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

  if (/^(replay|repeat|again|say that again|one more time|replay last)\b/.test(t))
    return "replay";

  if (/^(next|next year|forward|year\+1)\b/.test(t)) return "nextYear";
  if (/^(prev|previous|previous year|back|year-1)\b/.test(t)) return "prevYear";

  if (/^(another year|new year|different year)\b/.test(t)) return "anotherYear";

  if (/^(#?1\s*story|story\s*#?1|number\s*1\s*story)\b/.test(t)) return "oneStory";
  if (/^(#?1\s*micro|micro\s*#?1|number\s*1\s*micro)\b/.test(t)) return "oneMicro";

  if (/^#?1\b/.test(t) || /^number\s*1\b/.test(t)) return "one";

  return null;
}

function forceYearSpineChart(session) {
  if (!session || typeof session !== "object") return;
  session.activeMusicChart = "Billboard Year-End Hot 100";
}

function replyLooksLikeTop10List(reply) {
  const t = cleanText(reply);
  return /^Top\s+10\s+—/i.test(t);
}

function stripTrailingWantPrompt(s) {
  return cleanText(String(s || ""))
    .replace(/\s+Want\s+#1.*$/i, "")
    .replace(/\s+Want\s+a\s+story\s+moment.*$/i, "")
    .replace(/\s+Want\s+a\s+micro\s+moment.*$/i, "")
    .trim();
}

function extractTop10NumberOne(reply) {
  const t = cleanText(reply);

  const ym = t.match(/\((19[5-9]\d|20[0-1]\d|202[0-4])\)\s*:/);
  const year = ym ? clampYear(Number(ym[1])) : null;
  if (!year) return null;

  const m = t.match(/:\s*1\.\s*([^—]+?)\s*—\s*(.+?)(?=\s+2\.|$)/i);
  if (!m) return { year, artist: null, title: null };

  const artist = cleanText(m[1]);
  const title = stripTrailingWantPrompt(m[2]);

  if (!artist || !title)
    return { year, artist: artist || null, title: title || null };
  return { year, artist, title };
}

function makeMicroMomentFromNumberOne({ year, artist, title }) {
  const a = artist || "the year’s biggest artist";
  const s = title ? `“${title}”` : "a massive #1";
  return `Micro moment — ${year}: ${a} hit #1 with ${s}. One hook, one heartbeat—pure year-end momentum that made radios feel like a victory lap. Want a story moment, or another year?`;
}

function makeStoryMomentFromNumberOne({ year, artist, title }) {
  const a = artist || "the year’s biggest artist";
  const s = title ? `“${title}”` : "a massive #1";
  return `Story moment — ${year}: ${a} owned the year-end conversation with ${s} at #1. It’s a snapshot of the era—tight chorus, big polish, and that “turn it up again” energy that glued people to their car radios. Want the Top 10, a micro moment, or another year?`;
}

/* ======================================================
   Followups
====================================================== */

function makeFollowUps(session) {
  const baseModes = ["Top 10", "Story moment", "Micro moment"];

  const hasYear = !!(session && clampYear(session.lastYear));
  const yearChip = hasYear ? String(session.lastYear) : "1950";

  const hasReplay = !!(session && session.lastReply);
  const hasOne = !!(session && session.lastTop10One && session.lastTop10One.year);

  const items = [yearChip, ...baseModes];

  if (hasYear && hasOne) items.push("#1", "#1 story", "#1 micro");

  if (hasYear) {
    const py = safeIncYear(session.lastYear, -1);
    const ny = safeIncYear(session.lastYear, +1);
    if (py) items.push("Prev year");
    if (ny) items.push("Next year");
    items.push("Another year");
  }

  if (hasYear && hasReplay) items.push("Replay last");

  const deduped = [];
  for (const x of items) if (!deduped.includes(x)) deduped.push(x);

  return {
    followUp: deduped.slice(0, 8),
    followUps: deduped.slice(0, 8).map((x) => ({ label: x, send: x })),
  };
}

function replyMissingYearForMode(session, mode) {
  const poolTop10 = [
    "Perfect. What year (1950–2024) for your Top 10?",
    "Got you. Which year (1950–2024) should I use for Top 10?",
    "Alright—name the year (1950–2024) and I’ll pull the Top 10.",
  ];
  const poolStory = [
    "Love it. What year (1950–2024) for the story moment?",
    "Alright—what year (1950–2024) are we doing for the story moment?",
    "Great. Give me the year (1950–2024) and I’ll set the scene.",
  ];
  const poolMicro = [
    "Sure. What year (1950–2024) for the micro-moment?",
    "Quick one—what year (1950–2024) for the micro-moment?",
    "Got it. Drop the year (1950–2024) and I’ll keep it tight.",
  ];

  if (mode === "top10") return pickRotate(session, "askYear_top10", poolTop10);
  if (mode === "story") return pickRotate(session, "askYear_story", poolStory);
  if (mode === "micro") return pickRotate(session, "askYear_micro", poolMicro);
  return pickRotate(session, "askYear_generic", [
    "What year (1950–2024) should I use?",
    "Which year (1950–2024)?",
  ]);
}

function addMomentumTail(session, reply) {
  const r = cleanText(reply);
  if (!r) return r;

  const y = session && clampYear(session.lastYear) ? session.lastYear : null;
  const mode = session && session.activeMusicMode ? session.activeMusicMode : null;

  const endsWithQ =
    /[?]$/.test(r) || /\bwant\b/i.test(r) || /\bchoose\b/i.test(r);
  if (endsWithQ) return r;

  if (y && mode === "top10")
    return `${r} Next: say “#1”, “#1 story”, “#1 micro”, or “next year”.`;
  if (y && (mode === "story" || mode === "micro"))
    return `${r} Next: “top 10”, “next year”, “another year”, or “replay”.`;
  return r;
}

/* ======================================================
   API: health
====================================================== */

app.get("/api/health", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);
  res.set("X-Contract-Version", NYX_CONTRACT_VERSION);
  res.set("Cache-Control", "no-store");

  const origin = req.headers.origin || null;
  const originAllowed =
    CORS_ALLOW_ALL ? true : origin ? originMatchesAllowlist(origin) : null;

  res.json({
    ok: true,
    service: "sandblast-backend",
    env: process.env.NODE_ENV || "production",
    time: nowIso(),
    build: process.env.RENDER_GIT_COMMIT || null,
    version: INDEX_VERSION,
    sessions: SESSIONS.size,
    cors: {
      allowAll: CORS_ALLOW_ALL,
      allowedOrigins: CORS_ALLOW_ALL ? "ALL" : ALLOWED_ORIGINS.length,
      originEcho: origin,
      originAllowed,
    },
    contract: {
      version: NYX_CONTRACT_VERSION,
      strict: CONTRACT_STRICT,
    },
    tts: {
      enabled: TTS_ENABLED,
      provider: TTS_PROVIDER,
      hasKey: !!ELEVEN_KEY,
      hasVoiceId: !!ELEVEN_VOICE_ID,
      model: ELEVEN_MODEL_ID || null,
      tuning: getTtsTuningForMode("standard"),
      hasFetch,
    },
    requestId,
  });
});

/* ======================================================
   API: tts
====================================================== */

async function ttsHandler(req, res) {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);
  res.set("X-Contract-Version", NYX_CONTRACT_VERSION);
  res.set("Cache-Control", "no-store");

  const body = safeJsonParse(req.body, req.rawBody);
  if (!body) {
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "INVALID_JSON",
      contentType: req.headers["content-type"] || null,
      rawPreview: String(req.rawBody || "").slice(0, 700),
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }

  const text = cleanText(body.text || body.message || "");
  const sid = cleanText(body.sessionId || "");
  const s = sid ? getSession(sid) : null;

  const hasExplicitVoiceMode =
    Object.prototype.hasOwnProperty.call(body, "voiceMode") &&
    String(body.voiceMode || "").trim() !== "";

  const voiceMode = normalizeVoiceMode(
    hasExplicitVoiceMode ? body.voiceMode : (s && s.voiceMode) || "standard"
  );

  if (!TTS_ENABLED)
    return res.status(503).json({ ok: false, error: "TTS_DISABLED", requestId, contractVersion: NYX_CONTRACT_VERSION });
  if (TTS_PROVIDER !== "elevenlabs")
    return res.status(500).json({
      ok: false,
      error: "TTS_PROVIDER_UNSUPPORTED",
      provider: TTS_PROVIDER,
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  if (!hasFetch)
    return res.status(500).json({
      ok: false,
      error: "TTS_RUNTIME",
      detail: "fetch() not available",
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  if (!ELEVEN_KEY || !ELEVEN_VOICE_ID)
    return res.status(500).json({
      ok: false,
      error: "TTS_MISCONFIG",
      detail: "Missing ELEVENLABS env",
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  if (!text)
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "Missing text",
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });

  if (s && hasExplicitVoiceMode) s.voiceMode = voiceMode;

  try {
    const out = await elevenTtsMp3Buffer(text, voiceMode);
    if (!out.ok) {
      return res.status(502).json({
        ok: false,
        error: "TTS_UPSTREAM",
        upstreamStatus: out.status,
        upstreamBody: out.detail,
        requestId,
        contractVersion: NYX_CONTRACT_VERSION,
      });
    }

    const buf = out.buf || Buffer.alloc(0);
    if (!Buffer.isBuffer(buf) || buf.length < 1024) {
      return res.status(502).json({
        ok: false,
        error: "TTS_BAD_AUDIO",
        detail: `Audio payload too small (${buf.length} bytes)`,
        requestId,
        contractVersion: NYX_CONTRACT_VERSION,
      });
    }

    res.status(200);
    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", String(buf.length));
    res.set("Cache-Control", "no-store");
    res.set("X-Voice-Mode", voiceMode);
    return res.end(buf);
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "TTS_ERROR",
      detail: String(e && e.message ? e.message : e),
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }
}

app.post("/api/tts", ttsHandler);
app.post("/api/voice", ttsHandler);

/* ======================================================
   Music engine wrapper (applies sessionPatch)
====================================================== */

async function runMusicEngine(text, session) {
  if (!musicKnowledge || typeof musicKnowledge.handleChat !== "function") {
    return {
      reply:
        "Tell me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.",
    };
  }

  try {
    const out = musicKnowledge.handleChat({ text, session }) || {};
    if (out.sessionPatch && typeof out.sessionPatch === "object") {
      Object.assign(session, out.sessionPatch);
    }
    return out;
  } catch (e) {
    return {
      reply:
        "I hit a snag in the music engine. Try again with a year (1950–2024).",
      error: String(e && e.message ? e.message : e),
    };
  }
}

/* ======================================================
   API: chat
====================================================== */

app.post("/api/chat", async (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);
  res.set("X-Contract-Version", NYX_CONTRACT_VERSION);
  res.set("Cache-Control", "no-store");

  const body = safeJsonParse(req.body, req.rawBody);
  if (!body) {
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "INVALID_JSON",
      contentType: req.headers["content-type"] || null,
      rawPreview: String(req.rawBody || "").slice(0, 700),
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }

  const message = cleanText(body.message || body.text || "");
  let sessionId = cleanText(body.sessionId || "");
  const incomingVisitorId = cleanText(body.visitorId || "") || makeUuid();
  const incomingContract = cleanText(body.contractVersion || body.contract || "");

  if (
    CONTRACT_STRICT &&
    incomingContract &&
    incomingContract !== NYX_CONTRACT_VERSION
  ) {
    return res.status(409).json({
      ok: false,
      error: "CONTRACT_MISMATCH",
      expected: NYX_CONTRACT_VERSION,
      got: incomingContract,
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }

  if (!sessionId) sessionId = issueSessionId();

  const session = getSession(sessionId);
  if (!session.visitorId) session.visitorId = incomingVisitorId;

  // Voice continuity
  const incomingVoiceMode = normalizeVoiceMode(
    body.voiceMode || session.voiceMode || "standard"
  );
  session.voiceMode = incomingVoiceMode;
  res.set("X-Voice-Mode", session.voiceMode);

  const visitorId = session.visitorId;

  const nav = normalizeNavToken(message);

  // replay
  if (nav === "replay" && session.lastReply) {
    return res.json({
      ok: true,
      reply: session.lastReply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
      ...makeFollowUps(session),
    });
  }

  // another year: ask year, keep mode sticky
  if (nav === "anotherYear") {
    session.pendingMode = session.activeMusicMode || session.pendingMode || null;
    const ask = session.pendingMode
      ? replyMissingYearForMode(session, session.pendingMode)
      : "Alright. What year (1950–2024)?";
    session.lastReply = ask;
    session.lastReplyAt = Date.now();
    session.lastIntent = "askYear";
    return res.json({
      ok: true,
      reply: ask,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
      ...makeFollowUps(session),
    });
  }

  // next/prev year
  if ((nav === "nextYear" || nav === "prevYear") && clampYear(session.lastYear)) {
    const nextY = safeIncYear(session.lastYear, nav === "nextYear" ? +1 : -1);
    if (nextY) {
      session.lastYear = nextY;

      if (session.activeMusicMode) {
        const mode = session.activeMusicMode;

        forceYearSpineChart(session);

        const canonical = `${modeToCommand(mode)} ${nextY}`;
        const out = await runMusicEngine(canonical, session);
        const reply0 = cleanText(out.reply || "");
        const reply = addMomentumTail(session, reply0);

        session.lastReply = reply;
        session.lastReplyAt = Date.now();
        session.lastIntent = mode;

        if (replyLooksLikeTop10List(reply0)) {
          session.lastTop10One = extractTop10NumberOne(reply0);
        }

        const engineFollow = Array.isArray(out.followUp) ? out.followUp : null;

        return res.json({
          ok: true,
          reply,
          sessionId,
          requestId,
          visitorId,
          contractVersion: NYX_CONTRACT_VERSION,
          voiceMode: session.voiceMode,
          ...(engineFollow
            ? {
                followUp: engineFollow,
                followUps: engineFollow.map((x) => ({ label: x, send: x })),
              }
            : makeFollowUps(session)),
        });
      }

      return res.json({
        ok: true,
        reply: `Got it — ${nextY}. What do you want: Top 10, Story moment, or Micro moment?`,
        sessionId,
        requestId,
        visitorId,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
        ...makeFollowUps(session),
      });
    }
  }

  // #1 story/micro from lastTop10One
  if (
    (nav === "oneStory" || nav === "oneMicro") &&
    session.lastTop10One &&
    session.lastTop10One.year
  ) {
    const rep =
      nav === "oneStory"
        ? makeStoryMomentFromNumberOne(session.lastTop10One)
        : makeMicroMomentFromNumberOne(session.lastTop10One);

    session.activeMusicMode = nav === "oneStory" ? "story" : "micro";
    session.pendingMode = null;
    session.lastYear = session.lastTop10One.year;

    session.lastReply = rep;
    session.lastReplyAt = Date.now();
    session.lastIntent = session.activeMusicMode;

    return res.json({
      ok: true,
      reply: rep,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
      ...makeFollowUps(session),
    });
  }

  // #1 (engine first, fallback to derived)
  if (nav === "one") {
    if (!clampYear(session.lastYear)) {
      const ask = "Tell me a year first (1950–2024), then I’ll give you #1.";
      session.lastReply = ask;
      session.lastReplyAt = Date.now();
      session.lastIntent = "askYear";
      return res.json({
        ok: true,
        reply: ask,
        sessionId,
        requestId,
        visitorId,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
        ...makeFollowUps(session),
      });
    }

    const out = await runMusicEngine("#1", session);
    const reply0 = cleanText(out.reply || "");

    let reply = reply0;
    if (!reply || /^tell me a year/i.test(reply)) {
      if (session.lastTop10One && session.lastTop10One.year === session.lastYear) {
        reply = `#1 — ${session.lastTop10One.artist || "Unknown Artist"} — ${
          session.lastTop10One.title || "Unknown Title"
        }`;
      } else {
        reply = "Run “top 10” first so I can lock the year’s #1 cleanly.";
      }
    }

    reply = addMomentumTail(session, reply);

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "number1";

    const engineFollow = Array.isArray(out.followUp) ? out.followUp : null;

    return res.json({
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
      ...(engineFollow
        ? {
            followUp: engineFollow,
            followUps: engineFollow.map((x) => ({ label: x, send: x })),
          }
        : makeFollowUps(session)),
    });
  }

  // Greeting / empty
  if (!message || isGreeting(message)) {
    const out = {
      ok: true,
      reply: greetingReply(),
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
      ...makeFollowUps(session),
    };
    session.lastReply = out.reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "greeting";
    return res.json(out);
  }

  const parsedYear = clampYear(extractYearFromText(message));
  const parsedMode = normalizeModeToken(message);
  const bareYear = parsedYear ? isBareYearMessage(message) : false;
  void bareYear;

  // MODE + YEAR in one shot
  if (parsedYear && parsedMode) {
    session.lastYear = parsedYear;
    session.activeMusicMode = parsedMode;
    session.pendingMode = null;

    forceYearSpineChart(session);

    const canonical = `${modeToCommand(parsedMode)} ${parsedYear}`;
    const out = await runMusicEngine(canonical, session);
    const reply0 = cleanText(out.reply || "");
    const reply = addMomentumTail(session, reply0);

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = parsedMode;

    if (replyLooksLikeTop10List(reply0)) {
      session.lastTop10One = extractTop10NumberOne(reply0);
    }

    const engineFollow = Array.isArray(out.followUp) ? out.followUp : null;

    return res.json({
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
      ...(engineFollow
        ? {
            followUp: engineFollow,
            followUps: engineFollow.map((x) => ({ label: x, send: x })),
          }
        : makeFollowUps(session)),
    });
  }

  // MODE only
  if (parsedMode && !parsedYear) {
    session.activeMusicMode = parsedMode;
    session.pendingMode = parsedMode;

    // Sticky year: run immediately if we have lastYear
    if (clampYear(session.lastYear)) {
      session.pendingMode = null;

      forceYearSpineChart(session);

      const canonical = `${modeToCommand(parsedMode)} ${session.lastYear}`;
      const out = await runMusicEngine(canonical, session);
      const reply0 = cleanText(out.reply || "");
      const reply = addMomentumTail(session, reply0);

      session.lastReply = reply;
      session.lastReplyAt = Date.now();
      session.lastIntent = parsedMode;

      if (replyLooksLikeTop10List(reply0)) {
        session.lastTop10One = extractTop10NumberOne(reply0);
      }

      const engineFollow = Array.isArray(out.followUp) ? out.followUp : null;

      return res.json({
        ok: true,
        reply,
        sessionId,
        requestId,
        visitorId,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
        ...(engineFollow
          ? {
              followUp: engineFollow,
              followUps: engineFollow.map((x) => ({ label: x, send: x })),
            }
          : makeFollowUps(session)),
      });
    }

    const ask = replyMissingYearForMode(session, parsedMode);
    session.lastReply = ask;
    session.lastReplyAt = Date.now();
    session.lastIntent = "askYear";

    return res.json({
      ok: true,
      reply: ask,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
      ...makeFollowUps(session),
    });
  }

  // YEAR present: treat as year selection (prefers pending/active mode)
  if (parsedYear && !parsedMode) {
    session.lastYear = parsedYear;

    const mode = session.pendingMode || session.activeMusicMode || null;

    if (mode) {
      session.activeMusicMode = mode;
      session.pendingMode = null;

      forceYearSpineChart(session);

      const canonical = `${modeToCommand(mode)} ${parsedYear}`;
      const out = await runMusicEngine(canonical, session);
      const reply0 = cleanText(out.reply || "");
      const reply = addMomentumTail(session, reply0);

      session.lastReply = reply;
      session.lastReplyAt = Date.now();
      session.lastIntent = mode;

      if (replyLooksLikeTop10List(reply0)) {
        session.lastTop10One = extractTop10NumberOne(reply0);
      }

      const engineFollow = Array.isArray(out.followUp) ? out.followUp : null;

      return res.json({
        ok: true,
        reply,
        sessionId,
        requestId,
        visitorId,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
        ...(engineFollow
          ? {
              followUp: engineFollow,
              followUps: engineFollow.map((x) => ({ label: x, send: x })),
            }
          : makeFollowUps(session)),
      });
    }

    const askMode = `Got it — ${parsedYear}. What do you want: Top 10, Story moment, or Micro moment?`;
    session.lastReply = askMode;
    session.lastReplyAt = Date.now();
    session.lastIntent = "askMode";

    return res.json({
      ok: true,
      reply: askMode,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
      ...makeFollowUps(session),
    });
  }

  // passthrough to engine
  const out = await runMusicEngine(message, session);
  const reply0 = cleanText(out.reply || "");
  const reply = addMomentumTail(session, reply0);

  session.lastReply = reply;
  session.lastReplyAt = Date.now();
  session.lastIntent = "passthrough";

  if (replyLooksLikeTop10List(reply0)) {
    session.lastTop10One = extractTop10NumberOne(reply0);
    if (session.lastTop10One && session.lastTop10One.year) {
      session.lastYear = session.lastTop10One.year;
    }
  }

  const engineFollow = Array.isArray(out.followUp) ? out.followUp : null;

  return res.json({
    ok: true,
    reply,
    sessionId,
    requestId,
    visitorId,
    contractVersion: NYX_CONTRACT_VERSION,
    voiceMode: session.voiceMode,
    ...(engineFollow
      ? {
          followUp: engineFollow,
          followUps: engineFollow.map((x) => ({ label: x, send: x })),
        }
      : makeFollowUps(session)),
  });
});

/* ======================================================
   Start server
====================================================== */

const PORT = Number(process.env.PORT || 10000);
const HOST = "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(
    `[sandblast-backend] up :${PORT} env=${process.env.NODE_ENV || "production"} build=${
      process.env.RENDER_GIT_COMMIT || "n/a"
    } contract=${NYX_CONTRACT_VERSION} version=${INDEX_VERSION}`
  );
});

server.on("error", (err) => {
  console.error("[sandblast-backend] fatal listen error", err);
  process.exit(1);
});
