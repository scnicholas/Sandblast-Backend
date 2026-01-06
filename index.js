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
 * Critical updates in this revision:
 *  - Always issue/return a real sessionId (even if client sends none).
 *  - Apply musicKnowledge sessionPatch (v2.70+) to session store for correctness.
 *  - Prefer engine followups when provided; otherwise use makeFollowUps().
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
  "index.js v1.3.2 (sessionId issuance + musicKnowledge sessionPatch apply + engine followUps preference)";

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

function makeSessionId() {
  // 16-byte hex is fine; keep it short and URL-safe.
  return crypto.randomBytes(16).toString("hex");
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

/* ======================================================
   Session store (in-memory)
====================================================== */

const SESSIONS = new Map();

function initSession(sid) {
  return {
    id: sid,
    createdAt: Date.now(),
    updatedAt: Date.now(),

    // conversation state
    lastYear: null,
    activeMusicMode: null, // "top10" | "story" | "micro"
    pendingMode: null, // mode waiting for year

    // chart:
    activeMusicChart: "Billboard Hot 100",

    // momentum state
    lastReply: null,
    lastReplyAt: null,
    lastTop10One: null, // {year, artist, title}
    lastIntent: null, // "top10"|"story"|"micro"|...

    // voice continuity
    voiceMode: "standard", // "calm" | "standard" | "high"
  };
}

function getOrCreateSession(sessionIdRaw) {
  let sid = String(sessionIdRaw || "").trim();
  if (!sid) sid = makeSessionId();

  if (!SESSIONS.has(sid)) {
    SESSIONS.set(sid, initSession(sid));
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
} catch {
  musicKnowledge = null;
}

let s2sEnabled = false;
let s2sModule = null;
try {
  s2sModule = require("./Utils/s2s");
  s2sEnabled = !!s2sModule;
} catch {
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
const ELEVEN_MODEL_ID = String(
  process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2"
);

// Node 18+ has global fetch. If not, this will throw and we return a JSON error.
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

  if (/^(#?1\s*story|story\s*#?1|number\s*1\s*story)\b/.test(t)) return "oneStory";
  if (/^(#?1\s*micro|micro\s*#?1|number\s*1\s*micro)\b/.test(t)) return "oneMicro";

  return null;
}

/**
 * Force a single "year spine" chart for any year-based mode (Top10/Story/Micro)
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
   Followups helpers (engine + contract v1)
====================================================== */

function normalizeEngineFollowUps(engineFollowUp) {
  const out = [];
  const push = (x) => {
    const s = cleanText(x);
    if (s) out.push(s);
  };

  if (!engineFollowUp) return out;
  if (Array.isArray(engineFollowUp)) {
    engineFollowUp.forEach(push);
    return out;
  }
  if (typeof engineFollowUp === "string") {
    // If someone returned "A, B, C" style
    engineFollowUp
      .split(",")
      .map((s) => cleanText(s))
      .filter(Boolean)
      .forEach(push);
    return out;
  }
  return out;
}

function makeFollowUps(session) {
  const baseModes = ["Top 10", "Story moment", "Micro moment"];

  const hasYear = !!(session && clampYear(session.lastYear));
  const yearChip = hasYear ? String(session.lastYear) : "1950";

  const hasReplay = !!(session && session.lastReply);
  const hasOne = !!(session && session.lastTop10One && session.lastTop10One.year);

  const items = [yearChip, ...baseModes];

  if (hasYear && hasOne) items.push("#1 story", "#1 micro");

  if (hasYear) {
    const py = safeIncYear(session.lastYear, -1);
    const ny = safeIncYear(session.lastYear, +1);
    if (py) items.push("Prev year");
    if (ny) items.push("Next year");
  }

  if (hasYear && hasReplay) items.push("Replay last");

  const deduped = [];
  for (const x of items) {
    if (!deduped.includes(x)) deduped.push(x);
  }

  let capped = deduped.slice(0, 8);

  const hasStoryChip = capped.includes("#1 story");
  const hasMicroChip = capped.includes("#1 micro");
  if (hasOne && (hasStoryChip ^ hasMicroChip)) {
    capped[capped.length - 1] = hasStoryChip ? "#1 micro" : "#1 story";
    const tmp = [];
    for (const x of capped) if (!tmp.includes(x)) tmp.push(x);
    capped = tmp.slice(0, 8);
  }

  return {
    followUp: capped,
    followUps: capped.map((x) => ({ label: x, send: x })),
  };
}

/* ======================================================
   Momentum tail
====================================================== */

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
    return `${r} Next: say “#1 story”, “#1 micro”, or “next year”.`;
  if (y && (mode === "story" || mode === "micro"))
    return `${r} Next: “top 10”, “next year”, or “replay”.`;
  return r;
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
      model: ELEVEN_MODEL_ID || null,
      tuning: getTtsTuningForMode("standard"),
      modes: {
        calm: "stability↑ style↓",
        standard: "env defaults",
        high: "stability↓ style↑ boost on",
      },
      hasFetch,
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
   API: tts
====================================================== */

async function ttsHandler(req, res) {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);

  const body = safeJsonParse(req.body);
  if (!body) {
    return res
      .status(400)
      .json({ ok: false, error: "BAD_REQUEST", detail: "INVALID_JSON", requestId });
  }

  const text = cleanText(body.text || body.message || "");
  const sid = cleanText(body.sessionId || "");
  const s = sid ? getOrCreateSession(sid) : null;

  const hasExplicitVoiceMode =
    Object.prototype.hasOwnProperty.call(body, "voiceMode") &&
    String(body.voiceMode || "").trim() !== "";

  const voiceMode = normalizeVoiceMode(
    hasExplicitVoiceMode ? body.voiceMode : (s && s.voiceMode) || "standard"
  );

  if (!TTS_ENABLED) {
    return res.status(503).json({ ok: false, error: "TTS_DISABLED", requestId });
  }
  if (TTS_PROVIDER !== "elevenlabs") {
    return res
      .status(500)
      .json({ ok: false, error: "TTS_PROVIDER_UNSUPPORTED", provider: TTS_PROVIDER, requestId });
  }
  if (!hasFetch) {
    return res.status(500).json({
      ok: false,
      error: "TTS_RUNTIME",
      detail: "fetch() not available in this runtime",
      requestId,
    });
  }
  if (!ELEVEN_KEY || !ELEVEN_VOICE_ID) {
    return res.status(500).json({
      ok: false,
      error: "TTS_MISCONFIG",
      detail: "Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID",
      requestId,
    });
  }
  if (!text) {
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "Missing text",
      requestId,
    });
  }

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
      });
    }

    const buf = out.buf || Buffer.alloc(0);
    if (!Buffer.isBuffer(buf) || buf.length < 1024) {
      return res.status(502).json({
        ok: false,
        error: "TTS_BAD_AUDIO",
        detail: `Audio payload too small (${buf.length} bytes)`,
        requestId,
      });
    }

    res.status(200);
    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", String(buf.length));
    res.set("Cache-Control", "no-store");
    res.set("X-Voice-Mode", voiceMode);
    res.set("X-Contract-Version", NYX_CONTRACT_VERSION);

    return res.end(buf);
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "TTS_ERROR",
      detail: String(e && e.message ? e.message : e),
      requestId,
    });
  }
}

app.post("/api/tts", ttsHandler);
app.post("/api/voice", ttsHandler);

/* ======================================================
   Music engine wrapper (applies sessionPatch)
====================================================== */

function applySessionPatch(session, patch) {
  if (!session || typeof session !== "object") return;
  if (!patch || typeof patch !== "object") return;

  // Only apply known-safe fields (prevents accidental poisoning).
  const allowed = new Set([
    "activeMusicChart",
    "lastMusicYear",
    "lastMusicChart",
  ]);

  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.has(k)) continue;
    session[k] = v;
  }

  // Bridge musicKnowledge -> index.js state when available
  if (session.lastMusicYear && !session.lastYear) {
    const y = clampYear(Number(session.lastMusicYear));
    if (y) session.lastYear = y;
  }
  if (session.activeMusicChart) {
    session.activeMusicChart = String(session.activeMusicChart);
  }
}

async function runMusicEngine(text, session, hint) {
  if (!musicKnowledge || typeof musicKnowledge.handleChat !== "function") {
    return { reply: "Tell me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.", followUp: null };
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

  let out = safeCall(text) || {};
  let reply = cleanText(out.reply);

  // Apply canonical sessionPatch (v2.70+)
  if (out.sessionPatch) {
    applySessionPatch(session, out.sessionPatch);
  }

  const parsedYear = clampYear(extractYearFromText(text));

  // Retry logic stays (defensive), but now we preserve patch correctness.
  if (parsedYear && replyIndicatesNoCleanListForYear(reply)) {
    forceYearSpineChart(session);
    const retry = safeCall(text) || {};
    const retryReply = cleanText(retry.reply);
    if (retry.sessionPatch) applySessionPatch(session, retry.sessionPatch);
    if (retryReply) reply = retryReply;
    out = retryReply ? retry : out;
  }

  // Mode-fidelity: if story/micro request got a Top 10 list, synthesize from #1
  if (
    (wantedMode === "story" || wantedMode === "micro") &&
    replyLooksLikeTop10List(reply)
  ) {
    const one = extractTop10NumberOne(reply);
    if (one && one.year) {
      return {
        reply: wantedMode === "story"
          ? makeStoryMomentFromNumberOne(one)
          : makeMicroMomentFromNumberOne(one),
        followUp: out.followUp || null,
      };
    }
  }

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
      const second = safeCall(String(fallbackYear)) || {};
      if (second.sessionPatch) applySessionPatch(session, second.sessionPatch);

      const secondReply = cleanText(second.reply);
      if (secondReply && !replyIndicatesYearPrompt(secondReply)) {
        if (
          (wantedMode === "story" || wantedMode === "micro") &&
          replyLooksLikeTop10List(secondReply)
        ) {
          const one = extractTop10NumberOne(secondReply);
          if (one && one.year) {
            return {
              reply: wantedMode === "story"
                ? makeStoryMomentFromNumberOne(one)
                : makeMicroMomentFromNumberOne(one),
              followUp: second.followUp || null,
            };
          }
        }
        return { reply: secondReply, followUp: second.followUp || null };
      }
    }
  }

  const yr = clampYear(extractYearFromText(text)) || session.lastYear;
  if (replyIndicatesTryStoryMomentFirst(reply) && yr) {
    return {
      reply: `Got it — ${yr}. What do you want: Top 10, Story moment, or Micro moment?`,
      followUp: out.followUp || null,
    };
  }

  if (!reply) {
    reply = "Tell me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.";
  }

  return { reply, followUp: out.followUp || null };
}

/* ======================================================
   API: chat
====================================================== */

app.post("/api/chat", async (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);

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
  const visitorId = cleanText(body.visitorId || "");
  const contractVersion = cleanText(body.contractVersion || body.contract || "");

  // Always create/return a session (critical)
  const session = getOrCreateSession(body.sessionId);

  // Voice continuity
  const incomingVoiceMode = normalizeVoiceMode(body.voiceMode || session.voiceMode || "standard");
  session.voiceMode = incomingVoiceMode;

  if (contractVersion && contractVersion !== NYX_CONTRACT_VERSION) {
    // soft-accept for now
  }

  const nav = normalizeNavToken(message);

  // Replay
  if (nav === "replay" && session.lastReply) {
    const fallbackFups = makeFollowUps(session);
    return res.json({
      ok: true,
      reply: session.lastReply,
      sessionId: session.id,
      requestId,
      visitorId: visitorId || null,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
      ...fallbackFups,
    });
  }

  // Next/Prev year
  if ((nav === "nextYear" || nav === "prevYear") && clampYear(session.lastYear)) {
    const nextY = safeIncYear(session.lastYear, nav === "nextYear" ? +1 : -1);
    if (nextY) {
      session.lastYear = nextY;

      if (session.activeMusicMode) {
        const mode = session.activeMusicMode;
        forceYearSpineChart(session);

        const canonical = `${modeToCommand(mode)} ${nextY}`;
        const engine = await runMusicEngine(canonical, session, {
          hintedMode: mode,
          hintedYear: nextY,
        });
        const reply0 = engine.reply;
        const reply = addMomentumTail(session, reply0);

        session.lastReply = reply;
        session.lastReplyAt = Date.now();
        session.lastIntent = mode;

        if (replyLooksLikeTop10List(reply0)) {
          session.lastTop10One = extractTop10NumberOne(reply0);
        }

        const engineF = normalizeEngineFollowUps(engine.followUp);
        const f = engineF.length
          ? { followUp: engineF.slice(0, 8), followUps: engineF.slice(0, 8).map(x => ({ label: x, send: x })) }
          : makeFollowUps(session);

        return res.json({
          ok: true,
          reply,
          sessionId: session.id,
          requestId,
          visitorId: visitorId || null,
          contractVersion: NYX_CONTRACT_VERSION,
          voiceMode: session.voiceMode,
          ...f,
        });
      }

      const f = makeFollowUps(session);
      return res.json({
        ok: true,
        reply: `Got it — ${nextY}. What do you want: Top 10, Story moment, or Micro moment?`,
        sessionId: session.id,
        requestId,
        visitorId: visitorId || null,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
        ...f,
      });
    }
  }

  // #1 Story / #1 Micro from last Top 10 #1
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

    const f = makeFollowUps(session);
    return res.json({
      ok: true,
      reply: rep,
      sessionId: session.id,
      requestId,
      visitorId: visitorId || null,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
      ...f,
    });
  }

  // Greeting
  if (!message || isGreeting(message)) {
    const out = {
      ok: true,
      reply: greetingReply(),
      sessionId: session.id,
      requestId,
      visitorId: visitorId || null,
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

  // Mode + Year in same utterance
  if (parsedYear && parsedMode) {
    session.lastYear = parsedYear;
    session.activeMusicMode = parsedMode;
    session.pendingMode = null;

    forceYearSpineChart(session);

    const canonical = `${modeToCommand(parsedMode)} ${parsedYear}`;
    const engine = await runMusicEngine(canonical, session, {
      hintedMode: parsedMode,
      hintedYear: parsedYear,
    });
    const reply0 = engine.reply;
    const reply = addMomentumTail(session, reply0);

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = parsedMode;

    if (replyLooksLikeTop10List(reply0)) {
      session.lastTop10One = extractTop10NumberOne(reply0);
    }

    const engineF = normalizeEngineFollowUps(engine.followUp);
    const f = engineF.length
      ? { followUp: engineF.slice(0, 8), followUps: engineF.slice(0, 8).map(x => ({ label: x, send: x })) }
      : makeFollowUps(session);

    return res.json({
      ok: true,
      reply,
      sessionId: session.id,
      requestId,
      visitorId: visitorId || null,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
      ...f,
    });
  }

  // Mode only
  if (parsedMode && !parsedYear) {
    session.activeMusicMode = parsedMode;
    session.pendingMode = parsedMode;

    if (session.lastYear) {
      session.pendingMode = null;

      forceYearSpineChart(session);

      const canonical = `${modeToCommand(parsedMode)} ${session.lastYear}`;
      const engine = await runMusicEngine(canonical, session, {
        hintedMode: parsedMode,
        hintedYear: session.lastYear,
      });
      const reply0 = engine.reply;
      const reply = addMomentumTail(session, reply0);

      session.lastReply = reply;
      session.lastReplyAt = Date.now();
      session.lastIntent = parsedMode;

      if (replyLooksLikeTop10List(reply0)) {
        session.lastTop10One = extractTop10NumberOne(reply0);
      }

      const engineF = normalizeEngineFollowUps(engine.followUp);
      const f = engineF.length
        ? { followUp: engineF.slice(0, 8), followUps: engineF.slice(0, 8).map(x => ({ label: x, send: x })) }
        : makeFollowUps(session);

      return res.json({
        ok: true,
        reply,
        sessionId: session.id,
        requestId,
        visitorId: visitorId || null,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
        ...f,
      });
    }

    const ask = replyMissingYearForMode(session, parsedMode);
    session.lastReply = ask;
    session.lastReplyAt = Date.now();
    session.lastIntent = "askYear";

    const f = makeFollowUps(session);
    return res.json({
      ok: true,
      reply: ask,
      sessionId: session.id,
      requestId,
      visitorId: visitorId || null,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
      ...f,
    });
  }

  // Bare year
  if (bareYear) {
    if (session.pendingMode) {
      const mode = session.pendingMode;
      session.lastYear = parsedYear;
      session.activeMusicMode = mode;
      session.pendingMode = null;

      forceYearSpineChart(session);

      const canonical = `${modeToCommand(mode)} ${parsedYear}`;
      const engine = await runMusicEngine(canonical, session, {
        hintedMode: mode,
        hintedYear: parsedYear,
      });
      const reply0 = engine.reply;
      const reply = addMomentumTail(session, reply0);

      session.lastReply = reply;
      session.lastReplyAt = Date.now();
      session.lastIntent = mode;

      if (replyLooksLikeTop10List(reply0)) {
        session.lastTop10One = extractTop10NumberOne(reply0);
      }

      const engineF = normalizeEngineFollowUps(engine.followUp);
      const f = engineF.length
        ? { followUp: engineF.slice(0, 8), followUps: engineF.slice(0, 8).map(x => ({ label: x, send: x })) }
        : makeFollowUps(session);

      return res.json({
        ok: true,
        reply,
        sessionId: session.id,
        requestId,
        visitorId: visitorId || null,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
        ...f,
      });
    }

    if (session.activeMusicMode) {
      const mode = session.activeMusicMode;
      session.lastYear = parsedYear;

      forceYearSpineChart(session);

      const canonical = `${modeToCommand(mode)} ${parsedYear}`;
      const engine = await runMusicEngine(canonical, session, {
        hintedMode: mode,
        hintedYear: parsedYear,
      });
      const reply0 = engine.reply;
      const reply = addMomentumTail(session, reply0);

      session.lastReply = reply;
      session.lastReplyAt = Date.now();
      session.lastIntent = mode;

      if (replyLooksLikeTop10List(reply0)) {
        session.lastTop10One = extractTop10NumberOne(reply0);
      }

      const engineF = normalizeEngineFollowUps(engine.followUp);
      const f = engineF.length
        ? { followUp: engineF.slice(0, 8), followUps: engineF.slice(0, 8).map(x => ({ label: x, send: x })) }
        : makeFollowUps(session);

      return res.json({
        ok: true,
        reply,
        sessionId: session.id,
        requestId,
        visitorId: visitorId || null,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
        ...f,
      });
    }

    session.lastYear = parsedYear;

    const askMode = `Got it — ${parsedYear}. What do you want: Top 10, Story moment, or Micro moment?`;
    session.lastReply = askMode;
    session.lastReplyAt = Date.now();
    session.lastIntent = "askMode";

    const f = makeFollowUps(session);
    return res.json({
      ok: true,
      reply: askMode,
      sessionId: session.id,
      requestId,
      visitorId: visitorId || null,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
      ...f,
    });
  }

  // Passthrough to music engine
  const engine = await runMusicEngine(message, session, null);
  const reply0 = engine.reply;
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

  const engineF = normalizeEngineFollowUps(engine.followUp);
  const f = engineF.length
    ? { followUp: engineF.slice(0, 8), followUps: engineF.slice(0, 8).map(x => ({ label: x, send: x })) }
    : makeFollowUps(session);

  return res.json({
    ok: true,
    reply,
    sessionId: session.id,
    requestId,
    visitorId: visitorId || null,
    contractVersion: NYX_CONTRACT_VERSION,
    voiceMode: session.voiceMode,
    ...f,
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
    } contract=${NYX_CONTRACT_VERSION} version=${INDEX_VERSION} corsAllowed=${ALLOWED_ORIGINS.length}`
  );
});

server.on("error", (err) => {
  console.error("[sandblast-backend] fatal listen error", err);
  process.exit(1);
});
