"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v1.5.6 (TIGHT + Forward-Motion Patch: loop-proof asks; fixes returning visit inflation)
 *
 * Adds (from v1.5.5 draft you pasted):
 *  1) Phase A Forward-Motion Patch (FMP):
 *     - Prevents “ask year” if session already has a valid year.
 *     - Prevents “ask mode” if session already has a valid mode.
 *     - Loop breaker: detects repeated askYear/askMode and forces a forward action.
 *     - No-question-end: if reply ends as open prompt, Nyx proceeds with safest next step (only when year+mode exist).
 *  2) Critical fix: Returning visitor “visits” increments ONCE per new session (session._countedVisit).
 *  3) Chart Contamination Guard:
 *     - If session.activeMusicChart is Year-End Singles and user requests >=1960,
 *       auto-switch to a supported 1960+ default (Year-End Hot 100 -> Hot 100 via musicKnowledge resolver).
 *  4) Navigation completion:
 *     - Implements nextYear / prevYear / anotherYear handling (was parsed but not routed in older builds).
 *  5) Session field bridge for musicKnowledge v2.72+:
 *     - Mirrors session.lastYear <-> session.lastMusicYear
 *     - Keeps activeMusicChart/lastMusicChart sane across calls
 *
 * Preserves:
 *  - Returning visitors ALWAYS get exactly 4 follow-up chips:
 *      1) "Continue" (if resumable) OR "Start fresh"
 *      2) "Top 10"
 *      3) "Story moment"
 *      4) "Micro moment"
 *  - One-tap resume logic (Continue / Start fresh)
 *  - Optional name cue if user volunteered a name
 *  - Profiles TTL + sessions TTL
 *  - Mic feedback guard
 *  - TTS endpoints
 *  - Contract/version headers
 *
 * v1.5.6 small hardening:
 *  - Removes the duplicate/unreachable “bare-year guard” branch (prevents double-askMode paths).
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
  "index.js v1.5.6 (TIGHT + Forward-Motion Patch: loop-proof asks; fixes returning visit inflation + chart contamination guard + nav completion + music field bridge)";

/* ======================================================
   Basic middleware
====================================================== */

function rawBodySaver(req, res, buf, encoding) {
  try {
    if (buf && buf.length) req.rawBody = buf.toString(encoding || "utf8");
  } catch (_) {}
}

app.use(
  express.json({
    limit: "1mb",
    verify: rawBodySaver,
  })
);

app.use(
  express.text({
    type: ["text/*"],
    limit: "1mb",
    verify: rawBodySaver,
  })
);

/* ======================================================
   Timeout middleware
====================================================== */

const REQUEST_TIMEOUT_MS = Math.max(
  10000,
  Math.min(60000, Number(process.env.REQUEST_TIMEOUT_MS || 30000))
);

app.use((req, res, next) => {
  try {
    res.setTimeout(REQUEST_TIMEOUT_MS);
  } catch (_) {}
  next();
});

/* ======================================================
   CORS
====================================================== */

function parseAllowedOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || "").trim();
  const defaults = ["http://localhost:3000", "http://127.0.0.1:3000"];
  const list = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  return Array.from(new Set([...defaults, ...list]));
}
const ALLOWED_ORIGINS = parseAllowedOrigins();

const CORS_ALLOW_ALL = String(process.env.CORS_ALLOW_ALL || "false") === "true";
const CONTRACT_STRICT = String(process.env.CONTRACT_STRICT || "false") === "true";
const MAX_SESSIONS = Math.max(0, Number(process.env.MAX_SESSIONS || 0));
const CHAT_DEBUG = String(process.env.CHAT_DEBUG || "false") === "true";

function normalizeOrigin(origin) {
  const o = String(origin || "").trim();
  if (!o) return "";
  return o.replace(/\/$/, "");
}

function originMatchesAllowlist(origin) {
  const o = normalizeOrigin(origin);
  if (!o) return false;

  if (ALLOWED_ORIGINS.includes(o)) return true;

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

const corsOptions = {
  origin: function (origin, cb) {
    if (!origin) return cb(null, true);
    if (CORS_ALLOW_ALL) return cb(null, true);
    if (originMatchesAllowlist(origin)) return cb(null, true);
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
app.options("/api/*", cors(corsOptions));
app.options("*", cors(corsOptions));

/* ======================================================
   JSON parse error handler
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

    if (typeof body === "string" && body.trim()) {
      const t = body.trim();
      if (
        (t.startsWith("{") && t.endsWith("}")) ||
        (t.startsWith("[") && t.endsWith("]"))
      ) {
        return JSON.parse(t);
      }
    }

    if (rawFallback && String(rawFallback).trim()) {
      const rt = String(rawFallback).trim();
      if (
        (rt.startsWith("{") && rt.endsWith("}")) ||
        (rt.startsWith("[") && rt.endsWith("]"))
      ) {
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

function safeIncYear(y, delta) {
  const yy = clampYear(Number(y));
  if (!yy) return null;
  return clampYear(yy + delta);
}

function parseDebugFlag(req) {
  if (!req) return false;
  const q = String(req.query && req.query.debug ? req.query.debug : "").trim();
  if (q === "1" || q.toLowerCase() === "true") return true;
  return false;
}

function makeUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ======================================================
   Music constants + chart contamination guard
====================================================== */

const DEFAULT_CHART = "Billboard Hot 100";
const YEAR_END_CHART = "Billboard Year-End Hot 100";
const YEAR_END_SINGLES_CHART = "Billboard Year-End Singles";

function normalizeChartToken(s) {
  const t = cleanText(s).toLowerCase();
  if (!t) return DEFAULT_CHART;
  if (t.includes("year") && t.includes("end") && t.includes("single"))
    return YEAR_END_SINGLES_CHART;
  if (t.includes("year") && t.includes("end")) return YEAR_END_CHART;
  if (t.includes("hot 100") || t.includes("hot100") || t.includes("billboard"))
    return DEFAULT_CHART;
  return cleanText(s) || DEFAULT_CHART;
}

/**
 * Critical: if a stale session carries Singles into 1960+ requests, auto-switch.
 * Prefer Year-End Hot 100; musicKnowledge v2.72 will resolve further if needed.
 */
function guardChartForYear(session, year) {
  if (!session) return;
  const y = clampYear(Number(year));
  if (!y) return;

  const current = normalizeChartToken(session.activeMusicChart || DEFAULT_CHART);

  if (!session.activeMusicChart) session.activeMusicChart = DEFAULT_CHART;

  if (current === YEAR_END_SINGLES_CHART && y >= 1960) {
    session.activeMusicChart = YEAR_END_CHART;
  }

  session.activeMusicChart = normalizeChartToken(
    session.activeMusicChart || DEFAULT_CHART
  );
  if (!session.activeMusicChart) session.activeMusicChart = DEFAULT_CHART;
}

/**
 * Bridge: musicKnowledge v2.72 uses lastMusicYear/lastMusicChart; index.js uses lastYear.
 * Keep them coherent before and after engine calls.
 */
function preEngineBridge(session) {
  if (!session) return;

  if (!session.activeMusicChart) session.activeMusicChart = DEFAULT_CHART;
  session.activeMusicChart = normalizeChartToken(session.activeMusicChart);

  if (!clampYear(session.lastYear) && clampYear(session.lastMusicYear)) {
    session.lastYear = session.lastMusicYear;
  }
  if (!session.lastMusicChart && session.activeMusicChart) {
    session.lastMusicChart = session.activeMusicChart;
  }
}

function postEngineBridge(session) {
  if (!session) return;

  if (clampYear(session.lastMusicYear) && !clampYear(session.lastYear)) {
    session.lastYear = session.lastMusicYear;
  }
  if (
    clampYear(session.lastYear) &&
    (!clampYear(session.lastMusicYear) ||
      session.lastMusicYear !== session.lastYear)
  ) {
    session.lastMusicYear = session.lastYear;
  }

  if (session.lastMusicChart && !session.activeMusicChart) {
    session.activeMusicChart = session.lastMusicChart;
  }
  if (session.activeMusicChart && !session.lastMusicChart) {
    session.lastMusicChart = session.activeMusicChart;
  }

  session.activeMusicChart = normalizeChartToken(
    session.activeMusicChart || DEFAULT_CHART
  );
  session.lastMusicChart = normalizeChartToken(
    session.lastMusicChart || session.activeMusicChart || DEFAULT_CHART
  );
}

/* ======================================================
   Phase A — Forward Motion Patch (FMP)
====================================================== */

const FMP = {
  ASK_YEAR_RE:
    /\b(what year|give me a year|pick a year|choose a year|year\s*\(1950|1950–2024)\b/i,
  ASK_MODE_CHOICE_RE: /\b(choose|pick|what do you want|which do you want|select)\b/i,
  MODE_WORDS_RE: /\b(top\s*10|story\s*moment|micro\s*moment)\b/i,
  SOFT_OPEN_RE: /\b(what would you like|what do you want|tell me what you|choose|pick)\b/i,

  isAskingYear(reply) {
    const r = cleanText(reply).toLowerCase();
    return this.ASK_YEAR_RE.test(r);
  },

  isAskingMode(reply) {
    const r = cleanText(reply).toLowerCase();
    return (
      this.MODE_WORDS_RE.test(r) &&
      (this.ASK_MODE_CHOICE_RE.test(r) || this.SOFT_OPEN_RE.test(r))
    );
  },

  endsOpenQuestion(reply) {
    const r = cleanText(reply);
    if (!r) return false;
    if (/[?]$/.test(r)) return true;
    const low = r.toLowerCase();
    if (/\bwhat would you like\b/.test(low)) return true;
    if (/\bwhat do you want\b/.test(low)) return true;
    if (/\btell me what you\b/.test(low)) return true;
    return false;
  },

  detectAskLoop(session, reply) {
    if (!session) return null;

    const askType = this.isAskingYear(reply)
      ? "askYear"
      : this.isAskingMode(reply)
      ? "askMode"
      : null;

    if (!askType) return null;

    const now = Date.now();
    const last = session._fmp_lastAsk || null;

    session._fmp_lastAsk = { type: askType, at: now };

    if (last && last.type === askType && now - last.at < 45000) return askType;
    return null;
  },

  forceProceed(session, reason) {
    const y = clampYear(session && session.lastYear) ? session.lastYear : null;
    const m = session && session.activeMusicMode ? session.activeMusicMode : null;

    const year = y || 1988;
    const mode = m || "story";

    if (session) {
      session.lastYear = year;
      session.lastMusicYear = year;
      session.activeMusicMode = mode;
      session.pendingMode = null;

      guardChartForYear(session, year);
    }

    const modeLabel =
      mode === "top10"
        ? "the Top 10"
        : mode === "micro"
        ? "a micro moment"
        : "a story moment";

    const reply =
      reason === "askYear"
        ? `Locked in ${year}. I’m going to run ${modeLabel} now. Say “switch” if you want a different mode.`
        : reason === "askMode"
        ? `Got it — ${year}. I’m going to run ${modeLabel} now. Say “switch” if you want a different mode.`
        : `I’ll proceed with ${modeLabel} for ${year}. Say “switch” if you want a different mode.`;

    const sendRun =
      mode === "top10"
        ? `top 10 ${year}`
        : mode === "micro"
        ? `micro moment ${year}`
        : `story moment ${year}`;

    const sendSwitch =
      mode === "top10" ? `story moment ${year}` : `top 10 ${year}`;

    const followUps = [
      { label: "Run now", send: sendRun },
      { label: "Switch mode", send: sendSwitch },
      { label: "Another year", send: "Another year" },
    ];

    return { reply, followUps };
  },

  apply(out, session) {
    if (!out || typeof out !== "object") return out;
    if (!session) return out;

    const reply = cleanText(out.reply || "");
    if (!reply) return out;

    const hasYear = !!clampYear(session.lastYear);
    const hasMode = !!(session.activeMusicMode || session.pendingMode);

    if (hasYear && this.isAskingYear(reply)) {
      const forced = this.forceProceed(session, "askYear");
      return Object.assign({}, out, forced);
    }

    if (hasMode && this.isAskingMode(reply)) {
      const forced = this.forceProceed(session, "askMode");
      return Object.assign({}, out, forced);
    }

    const loopType = this.detectAskLoop(session, reply);
    if (loopType) {
      const forced = this.forceProceed(session, loopType);
      return Object.assign({}, out, forced);
    }

    if (this.endsOpenQuestion(reply)) {
      const y = clampYear(session.lastYear) ? session.lastYear : null;
      const mode = session.activeMusicMode || session.pendingMode || null;
      if (y && mode) {
        const modeLabel =
          mode === "top10"
            ? "the Top 10"
            : mode === "micro"
            ? "a micro moment"
            : "a story moment";
        const amended =
          `${reply.replace(/[?]+$/g, ".")} ` +
          `I’ll proceed with ${modeLabel} for ${y} unless you say “switch”.`;
        return Object.assign({}, out, { reply: amended });
      }
    }

    return out;
  },
};

/* ======================================================
   Visitor Profiles (tight)
====================================================== */

const PROFILES = new Map();
const PROFILE_TTL_MS = Number(process.env.PROFILE_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const PROFILE_CLEAN_INTERVAL_MS = Math.max(
  10 * 60 * 1000,
  Math.min(60 * 60 * 1000, Math.floor(PROFILE_TTL_MS / 12))
);

function getProfile(visitorId) {
  const vid = cleanText(visitorId || "");
  if (!vid) return null;

  if (!PROFILES.has(vid)) {
    PROFILES.set(vid, {
      id: vid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastSeenAt: Date.now(),
      visits: 0,

      name: "",

      lastLane: "general",
      lastMusicYear: null,
      lastMusicMode: null,
      lastHadReply: false,
    });
  }

  const p = PROFILES.get(vid);
  p.updatedAt = Date.now();
  p.lastSeenAt = Date.now();
  return p;
}

function profileIsReturning(profile) {
  return !!profile && Number(profile.visits || 0) >= 2;
}

function detectNameFromText(text) {
  const t = cleanText(text);
  if (!t) return null;
  const m = t.match(/\b(?:i[' ]?m|i am|im|my name is)\s+([A-Za-z][A-Za-z\-']{1,30})\b/i);
  if (!m) return null;
  const raw = cleanText(m[1] || "");
  if (!raw) return null;
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  if (name.length < 2) return null;
  return name;
}

function updateProfileFromSession(profile, session) {
  if (!profile || !session) return;

  profile.lastLane = session.lane || profile.lastLane || "general";
  profile.lastHadReply = !!session.lastReply;

  if (clampYear(session.lastYear)) profile.lastMusicYear = session.lastYear;
  if (session.activeMusicMode) profile.lastMusicMode = session.activeMusicMode;

  profile.updatedAt = Date.now();
}

const profileCleaner = setInterval(() => {
  const cutoff = Date.now() - PROFILE_TTL_MS;
  for (const [vid, p] of PROFILES.entries()) {
    const u = Number(p && p.updatedAt ? p.updatedAt : 0);
    if (!p || u < cutoff) PROFILES.delete(vid);
  }
}, PROFILE_CLEAN_INTERVAL_MS);
try {
  if (typeof profileCleaner.unref === "function") profileCleaner.unref();
} catch (_) {}

/* ======================================================
   Sessions
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

      visitorId: null,

      lastYear: null,
      activeMusicMode: null,
      pendingMode: null,

      // musicKnowledge-compatible fields (bridge)
      lastMusicYear: null,
      lastMusicChart: DEFAULT_CHART,
      activeMusicChart: DEFAULT_CHART,

      lane: "general",

      lastReply: null,
      lastReplyAt: null,

      lastFollowUp: null,
      lastFollowUps: null,

      lastTop10One: null,
      lastIntent: null,
      lastEngine: null,

      voiceMode: "standard",

      _countedVisit: false,
      _fmp_lastAsk: null,
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
} catch (_) {}

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
   TTS (kept as-is)
====================================================== */

const TTS_ENABLED = String(process.env.TTS_ENABLED || "true") === "true";
const TTS_PROVIDER = String(process.env.TTS_PROVIDER || "elevenlabs");
const ELEVEN_KEY = String(process.env.ELEVENLABS_API_KEY || "");
const ELEVEN_VOICE_ID = String(process.env.ELEVENLABS_VOICE_ID || "");
const ELEVEN_MODEL_ID = String(process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2");

const ELEVEN_TTS_TIMEOUT_MS = Math.max(
  8000,
  Math.min(60000, Number(process.env.ELEVEN_TTS_TIMEOUT_MS || 25000))
);

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
    speakerBoost: String(process.env.NYX_VOICE_SPEAKER_BOOST ?? "false") === "true",
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

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVEN_VOICE_ID)}`;

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

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ELEVEN_TTS_TIMEOUT_MS);

  try {
    const r = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "xi-api-key": ELEVEN_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        Connection: "keep-alive",
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return { ok: false, status: r.status, detail: errText.slice(0, 1200) };
    }

    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: true, buf };
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    const isAbort =
      msg.toLowerCase().includes("aborted") ||
      msg.toLowerCase().includes("abort") ||
      msg.toLowerCase().includes("timeout");
    return {
      ok: false,
      status: isAbort ? 504 : 502,
      detail: isAbort ? `Upstream timeout after ${ELEVEN_TTS_TIMEOUT_MS}ms` : msg,
    };
  } finally {
    clearTimeout(t);
  }
}

/* ======================================================
   Mic Feedback Guard (kept)
====================================================== */

const MIC_GUARD_ENABLED = String(process.env.MIC_GUARD_ENABLED || "true") === "true";
const MIC_GUARD_WINDOW_MS = Math.max(
  2000,
  Math.min(20000, Number(process.env.MIC_GUARD_WINDOW_MS || 9000))
);
const MIC_GUARD_MIN_CHARS = Math.max(
  24,
  Math.min(240, Number(process.env.MIC_GUARD_MIN_CHARS || 60))
);

function normalizeForEchoCompare(s) {
  return cleanText(String(s || ""))
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}\s#]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyMicEcho(incomingText, session) {
  if (!MIC_GUARD_ENABLED) return false;
  if (!session || !session.lastReply || !session.lastReplyAt) return false;

  const dt = Date.now() - Number(session.lastReplyAt || 0);
  if (!Number.isFinite(dt) || dt < 0 || dt > MIC_GUARD_WINDOW_MS) return false;

  const inc = normalizeForEchoCompare(incomingText);
  const last = normalizeForEchoCompare(session.lastReply);

  if (!inc || !last) return false;
  if (inc.length < MIC_GUARD_MIN_CHARS) return false;

  if (inc === last) return true;
  if (inc.includes(last) && last.length >= MIC_GUARD_MIN_CHARS) return true;
  if (last.includes(inc) && inc.length >= MIC_GUARD_MIN_CHARS) return true;

  const incW = inc.split(" ").filter(Boolean);
  const lastW = last.split(" ").filter(Boolean);
  if (incW.length >= 12 && lastW.length >= 12) {
    const a = incW.slice(0, 12).join(" ");
    const b = lastW.slice(0, 12).join(" ");
    if (a === b) return true;
  }

  return false;
}

function micEchoBreakerReply() {
  return "I’m picking up my own audio (mic feedback). Tap a follow-up chip, or type a year (1950–2024) plus: Top 10 / Story moment / Micro moment.";
}

/* ======================================================
   Music helpers
====================================================== */

function extractYearFromText(s) {
  const m = String(s || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
  return m ? Number(m[1]) : null;
}

function isBareYearMessage(text) {
  const t = cleanText(text);
  return /^\s*(19[5-9]\d|20[0-1]\d|202[0-4])\s*$/.test(t);
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
  if (/^(continue|resume|pick up|carry on|go on)\b/.test(t)) return "continue";
  if (/^(start fresh|restart|new start|reset)\b/.test(t)) return "fresh";

  if (/^(next|next year|forward|year\+1)\b/.test(t)) return "nextYear";
  if (/^(prev|previous|previous year|back|year-1)\b/.test(t)) return "prevYear";
  if (/^(another year|new year|different year)\b/.test(t)) return "anotherYear";

  return null;
}

function isGreeting(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;
  return (
    /^(hi|hey|hello|yo|sup|greetings)\b/.test(t) ||
    /^(hi\s+nyx|hey\s+nyx|hello\s+nyx)\b/.test(t)
  );
}

function greetingReply(profile, canContinue) {
  const returning = profileIsReturning(profile);
  const name = profile && cleanText(profile.name) ? cleanText(profile.name) : "";

  if (!returning) {
    return "Hi — welcome to Sandblast. I’m Nyx. Give me a year (1950–2024) and choose: Top 10, Story moment, or Micro moment.";
  }

  const who = name ? `Welcome back, ${name}.` : "Welcome back.";
  if (canContinue) return `${who} Want to continue where we left off?`;
  return `${who} Want to start fresh?`;
}

function replyMissingYearForMode(mode) {
  if (mode === "top10") return "What year (1950–2024) for your Top 10?";
  if (mode === "story") return "What year (1950–2024) for the story moment?";
  if (mode === "micro") return "What year (1950–2024) for the micro-moment?";
  return "What year (1950–2024)?";
}

function addMomentumTail(session, reply) {
  const r = cleanText(reply);
  if (!r) return r;
  if (session && session.lane !== "general" && session.lane !== "music") return r;
  const y = session && clampYear(session.lastYear) ? session.lastYear : null;
  const mode = session && session.activeMusicMode ? session.activeMusicMode : null;
  const endsWithQ = /[?]$/.test(r);
  if (endsWithQ) return r;

  if (y && mode) return `${r} Next: “next year”, “another year”, or “replay”.`;
  return r;
}

/* ======================================================
   Music engine wrapper (bridged)
====================================================== */

async function runMusicEngine(text, session) {
  if (!musicKnowledge || typeof musicKnowledge.handleChat !== "function") {
    return {
      reply: "Tell me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.",
    };
  }

  try {
    preEngineBridge(session);

    const y = clampYear(extractYearFromText(text));
    if (y) guardChartForYear(session, y);

    const out = musicKnowledge.handleChat({ text, session }) || {};

    if (out.sessionPatch && typeof out.sessionPatch === "object") {
      Object.assign(session, out.sessionPatch);
    }

    postEngineBridge(session);
    return out;
  } catch (e) {
    return {
      reply: "I hit a snag in the music engine. Try again with a year (1950–2024).",
      error: String(e && e.message ? e.message : e),
    };
  }
}

/* ======================================================
   Followups
====================================================== */

function hasMeaningfulResumeState(profile, session) {
  const profOk =
    !!profile && !!clampYear(profile.lastMusicYear) && !!profile.lastMusicMode;

  const sesYear = !!(session && clampYear(session.lastYear));
  const sesMode = !!(session && session.activeMusicMode);
  const sesPairOk = sesYear && sesMode;

  const contentfulIntents = new Set(["top10", "story", "micro", "continue", "passthrough"]);

  const sesIntentOk =
    !!session &&
    !!session.lastIntent &&
    contentfulIntents.has(String(session.lastIntent)) &&
    sesYear;

  const sesTopOneOk = !!(session && session.lastTop10One && sesYear);

  return profOk || sesPairOk || sesIntentOk || sesTopOneOk;
}

function canResume(profile, session) {
  return hasMeaningfulResumeState(profile, session);
}

function makeFollowUpsTight(session, profile) {
  const returning = profileIsReturning(profile);
  const resumable = canResume(profile, session);

  if (returning) {
    const personal = resumable ? "Continue" : "Start fresh";
    const four = [
      { label: personal, send: personal },
      { label: "Top 10", send: "Top 10" },
      { label: "Story moment", send: "Story moment" },
      { label: "Micro moment", send: "Micro moment" },
    ];
    return {
      followUp: four.map((x) => x.label),
      followUps: four,
      resumable,
      returning: true,
    };
  }

  const base = [];
  const hasYear = !!(session && clampYear(session.lastYear));
  base.push(hasYear ? String(session.lastYear) : "1950", "Top 10", "Story moment", "Micro moment");

  if (hasYear) {
    const py = safeIncYear(session.lastYear, -1);
    const ny = safeIncYear(session.lastYear, +1);
    if (py) base.push("Prev year");
    if (ny) base.push("Next year");
    base.push("Another year");
  }

  const intent = session ? String(session.lastIntent || "") : "";
  const isFirstGreeting = intent === "greeting" && !hasMeaningfulResumeState(profile, session);

  if (session && session.lastReply && !isFirstGreeting) base.push("Replay last");

  const out = [];
  for (const x of base) if (x && !out.includes(x)) out.push(x);

  const primary = out.slice(0, 8);
  return {
    followUp: primary,
    followUps: primary.map((x) => ({ label: x, send: x })),
    resumable,
    returning: false,
  };
}

function normalizeEngineFollowups(out) {
  const push = (acc, v) => {
    if (!v) return;
    if (typeof v === "string") {
      const s = cleanText(v);
      if (s) acc.push({ label: s, send: s });
      return;
    }
    if (typeof v === "object") {
      const label = cleanText(v.label || v.text || v.title || v.send || v.value || "");
      const send = cleanText(v.send || v.value || v.payload || v.label || v.text || "");
      if (label && send) acc.push({ label, send });
    }
  };

  const acc = [];
  if (!out || typeof out !== "object") return acc;

  const cands = [out.followUps, out.followups, out.followUp, out.followup].filter(Boolean);
  for (const c of cands) {
    if (Array.isArray(c)) c.forEach((x) => push(acc, x));
    else push(acc, c);
  }

  const seen = new Set();
  const out2 = [];
  for (const it of acc) {
    const k = cleanText(it.send).toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out2.push(it);
  }
  return out2.slice(0, 12);
}

function respondJson(req, res, base, session, engineOut, profile) {
  const tight = makeFollowUpsTight(session, profile);

  if (tight.returning) {
    const payload = Object.assign({}, base, {
      followUps: tight.followUps,
      followUp: tight.followUp,
    });

    const wantsDebug = CHAT_DEBUG || parseDebugFlag(req);
    if (wantsDebug) {
      payload.debug = {
        index: INDEX_VERSION,
        profile: profile
          ? {
              id: profile.id,
              name: profile.name || "",
              returning: profileIsReturning(profile),
              lastLane: profile.lastLane,
              lastMusicYear: profile.lastMusicYear || null,
              lastMusicMode: profile.lastMusicMode || null,
              visits: profile.visits || 0,
            }
          : null,
        state: {
          lastYear: session ? session.lastYear : null,
          activeMusicMode: session ? session.activeMusicMode : null,
          pendingMode: session ? session.pendingMode : null,
          activeMusicChart: session ? session.activeMusicChart : null,
          lane: session ? session.lane : null,
          voiceMode: session ? session.voiceMode : null,
          lastIntent: session ? session.lastIntent : null,
        },
        resume: { resumable: tight.resumable, forcedFourChips: true },
      };
    }

    if (session) {
      try {
        session.lastFollowUp = Array.isArray(payload.followUp) ? payload.followUp.slice(0, 12) : null;
        session.lastFollowUps = Array.isArray(payload.followUps) ? payload.followUps.slice(0, 12) : null;
      } catch (_) {}
    }

    return res.json(payload);
  }

  const engineNorm = normalizeEngineFollowups(engineOut);
  const useEngine = engineNorm.length > 0;

  const fill = useEngine ? engineNorm : tight.followUps;

  const final = [];
  for (const it of fill) {
    if (!it || !it.label) continue;
    if (final.length >= 8) break;
    if (final.some((x) => x.send === it.send)) continue;
    final.push({ label: it.label, send: it.send });
  }

  const payload = Object.assign({}, base, {
    followUps: final.slice(0, 8),
    followUp: final.slice(0, 8).map((x) => x.label),
  });

  const wantsDebug = CHAT_DEBUG || parseDebugFlag(req);
  if (wantsDebug) {
    payload.debug = {
      index: INDEX_VERSION,
      profile: profile
        ? {
            id: profile.id,
            name: profile.name || "",
            returning: profileIsReturning(profile),
            lastLane: profile.lastLane,
            lastMusicYear: profile.lastMusicYear || null,
            lastMusicMode: profile.lastMusicMode || null,
            visits: profile.visits || 0,
          }
        : null,
      state: {
        lastYear: session ? session.lastYear : null,
        activeMusicMode: session ? session.activeMusicMode : null,
        pendingMode: session ? session.pendingMode : null,
        activeMusicChart: session ? session.activeMusicChart : null,
        lane: session ? session.lane : null,
        voiceMode: session ? session.voiceMode : null,
        lastIntent: session ? session.lastIntent : null,
      },
      resume: { resumable: tight.resumable, forcedFourChips: false },
    };
  }

  if (session) {
    try {
      session.lastFollowUp = Array.isArray(payload.followUp) ? payload.followUp.slice(0, 12) : null;
      session.lastFollowUps = Array.isArray(payload.followUps) ? payload.followUps.slice(0, 12) : null;
    } catch (_) {}
  }

  return res.json(payload);
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
  const originAllowed = CORS_ALLOW_ALL ? true : origin ? originMatchesAllowlist(origin) : null;

  res.json({
    ok: true,
    service: "sandblast-backend",
    env: process.env.NODE_ENV || "production",
    time: nowIso(),
    build: process.env.RENDER_GIT_COMMIT || null,
    version: INDEX_VERSION,
    sessions: SESSIONS.size,
    profiles: PROFILES.size,
    cors: {
      allowAll: CORS_ALLOW_ALL,
      allowedOrigins: CORS_ALLOW_ALL ? "ALL" : ALLOWED_ORIGINS.length,
      originEcho: origin,
      originAllowed,
    },
    contract: { version: NYX_CONTRACT_VERSION, strict: CONTRACT_STRICT },
    timeouts: {
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      elevenTtsTimeoutMs: ELEVEN_TTS_TIMEOUT_MS,
    },
    tts: {
      enabled: TTS_ENABLED,
      provider: TTS_PROVIDER,
      hasKey: !!ELEVEN_KEY,
      hasVoiceId: !!ELEVEN_VOICE_ID,
      model: ELEVEN_MODEL_ID || null,
      hasFetch: typeof fetch === "function",
    },
    micGuard: {
      enabled: MIC_GUARD_ENABLED,
      windowMs: MIC_GUARD_WINDOW_MS,
      minChars: MIC_GUARD_MIN_CHARS,
    },
    music: {
      defaultChart: DEFAULT_CHART,
      yearEndChart: YEAR_END_CHART,
      yearEndSinglesChart: YEAR_END_SINGLES_CHART,
    },
    requestId,
  });
});

/* ======================================================
   API: tts (unchanged)
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
    return res.status(503).json({
      ok: false,
      error: "TTS_DISABLED",
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  if (TTS_PROVIDER !== "elevenlabs")
    return res.status(500).json({
      ok: false,
      error: "TTS_PROVIDER_UNSUPPORTED",
      provider: TTS_PROVIDER,
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  if (typeof fetch !== "function")
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
   Engine runner
====================================================== */

async function runEngine(text, session) {
  return runMusicEngine(text, session);
}

/* ======================================================
   Continue / Start fresh handlers (tight)
====================================================== */

async function handleContinue(session, profile) {
  const yFromSession = clampYear(session && session.lastYear ? Number(session.lastYear) : NaN);
  const yFromProfile = clampYear(profile && profile.lastMusicYear ? Number(profile.lastMusicYear) : NaN);
  const y = yFromSession || yFromProfile || null;

  const m = (session && session.activeMusicMode) || (profile && profile.lastMusicMode) || null;

  if (y && m) {
    session.lastYear = y;
    session.lastMusicYear = y;
    session.activeMusicMode = m;
    session.pendingMode = null;

    guardChartForYear(session, y);

    const out0 = await runEngine(`${modeToCommand(m)} ${y}`, session);
    return FMP.apply(out0, session);
  }

  if (session.lastReply) {
    return {
      reply: "Continue with what—Top 10, Story moment, or Micro moment? (You can also drop a year.)",
    };
  }

  return {
    reply: "What are we doing: Top 10, Story moment, or Micro moment? Start with a year (1950–2024).",
  };
}

function handleFresh(session) {
  session.lastYear = null;
  session.lastMusicYear = null;
  session.activeMusicMode = null;
  session.pendingMode = null;
  session.lastTop10One = null;

  session.activeMusicChart = DEFAULT_CHART;
  session.lastMusicChart = DEFAULT_CHART;

  return {
    reply: "Clean slate. Give me a year (1950–2024) and choose: Top 10, Story moment, or Micro moment.",
  };
}

/* ======================================================
   Nav handlers: nextYear / prevYear / anotherYear
====================================================== */

async function handleYearNav(session, direction) {
  const y0 = clampYear(Number(session.lastYear));
  const mode = session.activeMusicMode || session.pendingMode || null;

  if (!y0) {
    return {
      reply: "Tell me a year first (1950–2024), then I can go next/previous year.",
    };
  }

  const y1 = safeIncYear(y0, direction);
  if (!y1) {
    return { reply: "You’re at the edge of the range. Pick a year between 1950 and 2024." };
  }

  session.lastYear = y1;
  session.lastMusicYear = y1;

  guardChartForYear(session, y1);

  if (!mode) {
    session.pendingMode = null;
    return {
      reply: `Got it — ${y1}. What do you want: Top 10, Story moment, or Micro moment?`,
    };
  }

  session.activeMusicMode = mode;
  session.pendingMode = null;

  const out0 = await runEngine(`${modeToCommand(mode)} ${y1}`, session);
  return FMP.apply(out0, session);
}

function handleAnotherYear(session) {
  const mode = session.pendingMode || session.activeMusicMode || null;

  session.lastYear = null;
  session.lastMusicYear = null;

  if (mode) {
    session.pendingMode = mode;
    return { reply: replyMissingYearForMode(mode) };
  }

  return {
    reply: "Alright — new year. Give me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.",
  };
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

  if (CONTRACT_STRICT && incomingContract && incomingContract !== NYX_CONTRACT_VERSION) {
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

  const visitorId = session.visitorId;
  const profile = getProfile(visitorId);

  // Increment visits ONCE per session
  if (profile && !session._countedVisit) {
    profile.visits = Number(profile.visits || 0) + 1;
    session._countedVisit = true;
  }

  const foundName = detectNameFromText(message);
  if (profile && foundName) profile.name = foundName;

  const incomingVoiceMode = normalizeVoiceMode(body.voiceMode || session.voiceMode || "standard");
  session.voiceMode = incomingVoiceMode;
  res.set("X-Voice-Mode", session.voiceMode);

  // Ensure chart defaults are always sane + bridge any prior musicKnowledge state
  preEngineBridge(session);
  postEngineBridge(session);

  // Mic echo guard
  if (message && isLikelyMicEcho(message, session)) {
    const reply = micEchoBreakerReply();
    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "micEchoGuard";
    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, null, profile);
  }

  const nav = normalizeNavToken(message);

  // Replay (global)
  if (nav === "replay" && session.lastReply) {
    const base = {
      ok: true,
      reply: session.lastReply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    session.lastIntent = "replay";
    updateProfileFromSession(profile, session);
    return respondJson(req, res, base, session, null, profile);
  }

  // Next/Prev/Another year (complete routing)
  if (nav === "nextYear") {
    session.lane = "music";
    const out = await handleYearNav(session, +1);
    const reply = addMomentumTail(session, cleanText(out.reply || "Next year."));

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "nextYear";

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile);
  }

  if (nav === "prevYear") {
    session.lane = "music";
    const out = await handleYearNav(session, -1);
    const reply = addMomentumTail(session, cleanText(out.reply || "Previous year."));

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "prevYear";

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile);
  }

  if (nav === "anotherYear") {
    session.lane = "music";
    const out0 = handleAnotherYear(session);
    const out = FMP.apply(out0, session);
    const reply = cleanText(out.reply || "");

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "anotherYear";

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile);
  }

  // Continue
  if (nav === "continue") {
    session.lane = "music";
    const out0 = await handleContinue(session, profile);
    const out = FMP.apply(out0, session);
    const reply = addMomentumTail(session, cleanText(out.reply || "Continuing."));

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "continue";

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile);
  }

  // Start fresh
  if (nav === "fresh") {
    session.lane = "music";
    const out = handleFresh(session);
    const reply = cleanText(out.reply);

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "fresh";

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile);
  }

  // Greeting
  if (!message || isGreeting(message)) {
    session.lastIntent = "greeting";

    const tight = makeFollowUpsTight(session, profile);
    const reply = greetingReply(profile, tight.resumable);

    session.lastReply = reply;
    session.lastReplyAt = Date.now();

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, null, profile);
  }

  // Standard mode/year parsing
  const parsedYear = clampYear(extractYearFromText(message));
  const parsedMode = normalizeModeToken(message);
  const bareYear = parsedYear ? isBareYearMessage(message) : false;

  if (parsedYear) {
    session.lastYear = parsedYear;
    session.lastMusicYear = parsedYear;
    guardChartForYear(session, parsedYear);
  }

  if (parsedYear && parsedMode) {
    session.lane = "music";
    session.activeMusicMode = parsedMode;
    session.pendingMode = null;

    const out0 = await runEngine(`${modeToCommand(parsedMode)} ${parsedYear}`, session);
    const out = FMP.apply(out0, session);
    const reply = addMomentumTail(session, cleanText(out.reply || ""));

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = parsedMode;

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out, profile);
  }

  if (parsedMode && !parsedYear) {
    session.lane = "music";
    session.activeMusicMode = parsedMode;
    session.pendingMode = parsedMode;

    if (clampYear(session.lastYear)) {
      session.pendingMode = null;

      const out0 = await runEngine(`${modeToCommand(parsedMode)} ${session.lastYear}`, session);
      const out = FMP.apply(out0, session);
      const reply = addMomentumTail(session, cleanText(out.reply || ""));

      session.lastReply = reply;
      session.lastReplyAt = Date.now();
      session.lastIntent = parsedMode;

      updateProfileFromSession(profile, session);

      const base = {
        ok: true,
        reply,
        sessionId,
        requestId,
        visitorId,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
      };
      return respondJson(req, res, base, session, out, profile);
    }

    const ask = replyMissingYearForMode(parsedMode);
    session.lastReply = ask;
    session.lastReplyAt = Date.now();
    session.lastIntent = "askYear";

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply: ask,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, null, profile);
  }

  if (parsedYear && !parsedMode) {
    session.lane = "music";

    const mode = session.pendingMode || session.activeMusicMode || null;
    if (mode) {
      session.activeMusicMode = mode;
      session.pendingMode = null;

      const out0 = await runEngine(`${modeToCommand(mode)} ${parsedYear}`, session);
      const out = FMP.apply(out0, session);
      const reply = addMomentumTail(session, cleanText(out.reply || ""));

      session.lastReply = reply;
      session.lastReplyAt = Date.now();
      session.lastIntent = mode;

      updateProfileFromSession(profile, session);

      const base = {
        ok: true,
        reply,
        sessionId,
        requestId,
        visitorId,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
      };
      return respondJson(req, res, base, session, out, profile);
    }

    const askMode = `Got it — ${parsedYear}. What do you want: Top 10, Story moment, or Micro moment?`;
    session.lastReply = askMode;
    session.lastReplyAt = Date.now();
    session.lastIntent = "askMode";

    updateProfileFromSession(profile, session);

    const base = {
      ok: true,
      reply: askMode,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, null, profile);
  }

  // NOTE: bareYear guard removed (duplicate/unreachable under the branches above)
  void bareYear; // keep variable referenced for lint/clarity; no runtime effect

  // Fallback passthrough
  session.lane = "music";
  const out0 = await runEngine(message, session);
  const out = FMP.apply(out0, session);

  const reply = addMomentumTail(session, cleanText(out.reply || ""));

  session.lastReply = reply;
  session.lastReplyAt = Date.now();
  session.lastIntent = "passthrough";

  updateProfileFromSession(profile, session);

  const base = {
    ok: true,
    reply,
    sessionId,
    requestId,
    visitorId,
    contractVersion: NYX_CONTRACT_VERSION,
    voiceMode: session.voiceMode,
  };
  return respondJson(req, res, base, session, out, profile);
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

try {
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = Math.max(REQUEST_TIMEOUT_MS + 5000, 35000);
  server.keepAliveTimeout = Math.max(65000, server.keepAliveTimeout || 0);
} catch (_) {}

function shutdown(sig) {
  try {
    clearInterval(cleaner);
  } catch (_) {}
  try {
    clearInterval(profileCleaner);
  } catch (_) {}
  try {
    server.close(() => {
      console.log(`[sandblast-backend] shutdown ${sig}`);
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref?.();
  } catch (_) {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (e) =>
  console.error("[sandblast-backend] unhandledRejection", e)
);
process.on("uncaughtException", (e) =>
  console.error("[sandblast-backend] uncaughtException", e)
);
