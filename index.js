"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

let classifyIntent = null;
try {
  ({ classifyIntent } = require("./Utils/intentClassifier"));
} catch (_) {}

let musicKB = null;
try {
  musicKB = require("./Utils/musicKnowledge");
} catch (_) {}

const app = express();
app.set("trust proxy", true);

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "2mb" }));
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
  })
);
app.options("*", cors({ origin: true }));

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-bulletproof-v1.44-2025-12-18";

const DEFAULT_CHART = "Billboard Hot 100";
const MAX_MSG_CHARS = Number(process.env.MAX_MESSAGE_CHARS || 2500);

// In-memory caps
const SESS_TTL_MS = 6 * 60 * 60 * 1000;
const FP_TTL_MS = 45 * 60 * 1000;
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 5000);
const MAX_FINGERPRINTS = Number(process.env.MAX_FINGERPRINTS || 8000);

// Music DB capacity (target 1500+ cards safely)
const MAX_MUSIC_MOMENTS = Number(process.env.MAX_MUSIC_MOMENTS || 2500);

const DEBUG_ENABLED = String(process.env.DEBUG || "").toLowerCase() === "true";
let LAST_DEBUG = null;

// ------------------------------
// Helpers
// ------------------------------
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function safeMessage(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.length > MAX_MSG_CHARS ? s.slice(0, MAX_MSG_CHARS) : s;
}
function nowMs() {
  return Date.now();
}
function tryUUID() {
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}
function genSessionId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `sid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function normalizeDomain(d) {
  const t = norm(d);
  if (!t) return "general";
  if (t === "music" || t === "music history" || t === "musichistory" || t === "music-history" || t === "music_history")
    return "music_history";
  if (t === "tv" || t === "sandblast tv" || t === "sandblasttv") return "tv";
  if (t === "news" || t === "news canada" || t === "newscanada" || t === "news_canada") return "news_canada";
  if (t === "sponsor" || t === "sponsors" || t === "sponsorship") return "sponsors";
  return "general";
}

function extractYear(text) {
  if (musicKB && typeof musicKB.extractYear === "function") {
    try {
      return musicKB.extractYear(text);
    } catch {}
  }
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function looksMusicHistory(text) {
  const t = norm(text);
  return (
    t.includes("music") ||
    t.includes("chart") ||
    t.includes("billboard") ||
    t.includes("hot 100") ||
    t.includes("#1") ||
    t.includes("number one") ||
    t.includes("top40weekly") ||
    t.includes("uk singles") ||
    t.includes("rpm")
  );
}

function resolveChartFromText(text) {
  const t = norm(text);
  if (t.includes("uk") || t.includes("uk singles") || t.includes("official charts")) return "UK Singles Chart";
  if (t.includes("canada") || t.includes("rpm")) return "Canada RPM";
  if (t.includes("top40weekly") || t.includes("top 40")) return "Top40Weekly";
  if (t.includes("billboard") || t.includes("hot 100")) return "Billboard Hot 100";
  return null;
}

function sanitizeFact(f) {
  let s = String(f || "").trim();
  s = s.replace(/^chart fact\s*:\s*/i, "").replace(/^fact\s*:\s*/i, "").trim();
  return s;
}
function sanitizeCulture(c) {
  let s = String(c || "").trim();
  s = s.replace(/^cultural thread\s*:\s*/i, "").replace(/^culture\s*:\s*/i, "").trim();
  return s;
}

function detectArtist(text) {
  if (musicKB && typeof musicKB.detectArtist === "function") {
    try {
      return musicKB.detectArtist(text);
    } catch {}
  }
  return null;
}
function detectTitle(text) {
  if (musicKB && typeof musicKB.detectTitle === "function") {
    try {
      return musicKB.detectTitle(text);
    } catch {}
  }
  return null;
}

// Fallback: treat short phrase as title (prevents “title never captured” loop)
function inferTitleFallback(text) {
  const raw = String(text || "").trim();
  const t = norm(raw);
  if (!raw) return null;
  if (t === "music" || t === "music history" || t === "tv" || t === "news" || t === "sponsors") return null;
  if (t.startsWith("switch year") || t.startsWith("set year") || t.startsWith("use year")) return null;
  if (t === "clear title" || t === "reset title") return null;
  if (t === "clear year" || t === "reset year") return null;
  if (t === "clear artist" || t === "reset artist") return null;
  if (/\b(19\d{2}|20\d{2})\b/.test(raw)) return null;

  const m = raw.match(/^(.{2,60})\s*[-:]\s*(.{2,80})$/);
  if (m) return String(m[2]).trim();

  if (raw.length >= 2 && raw.length <= 60) return raw;
  return null;
}

// Fallback: treat short phrase as artist
function inferArtistFallback(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  if (/\b(19\d{2}|20\d{2})\b/.test(raw)) return null;

  const m = raw.match(/^(.{2,60})\s*[-:]\s*(.{2,80})$/);
  if (m) return String(m[1]).trim();

  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length >= 1 && words.length <= 5 && raw.length <= 40) return raw;
  return null;
}

function hasNumberOneIntent(text) {
  return /#1|# 1|number one|no\.?\s?1|no 1/.test(norm(text));
}

function promptSig(stepName, reply) {
  return norm(`${stepName || ""}::${String(reply || "").slice(0, 180)}`).slice(0, 240);
}

function parseCommand(text) {
  const t = norm(text);
  if (t === "clear title" || t === "reset title") return { cmd: "clear_title" };
  if (t === "clear year" || t === "reset year") return { cmd: "clear_year" };
  if (t === "clear artist" || t === "reset artist") return { cmd: "clear_artist" };
  if (t === "keep year" || t === "keep the year") return { cmd: "keep_year" };

  const setYear = t.match(/^(switch year to|set year to|use year)\s+(19\d{2}|20\d{2})$/);
  if (setYear) return { cmd: "set_year", year: Number(setYear[2]) };

  return { cmd: null };
}

// ------------------------------
// Rate limit (simple)
// ------------------------------
const RL = new Map();
const RL_WINDOW_MS = 60_000;
const RL_MAX = Number(process.env.RATE_LIMIT_PER_MIN || 120);

function rateKey(req) {
  const xff = String(req.headers["x-forwarded-for"] || "");
  const ip = (xff.split(",")[0].trim() || req.ip || "unknown").toString();
  return ip;
}
function rateLimit(req, res) {
  const key = rateKey(req);
  const now = nowMs();
  const cur = RL.get(key);

  if (!cur || cur.resetAt <= now) {
    RL.set(key, { count: 1, resetAt: now + RL_WINDOW_MS });
    return false;
  }

  cur.count++;
  RL.set(key, cur);

  if (cur.count > RL_MAX) {
    res.status(429).json({
      ok: false,
      error: "RATE_LIMITED",
      retry_after_ms: Math.max(0, cur.resetAt - now),
      build: BUILD_TAG
    });
    return true;
  }
  return false;
}
setInterval(() => {
  const now = nowMs();
  for (const [k, v] of RL.entries()) if (!v || v.resetAt <= now) RL.delete(k);
}, 30_000).unref?.();

// ------------------------------
// Sessions (self-healing)
// ------------------------------
const SESS = new Map(); // sid -> session
const FP = new Map(); // fingerprint -> { sid, expiresAt }

function fingerprint(req) {
  const xff = String(req.headers["x-forwarded-for"] || "");
  const ip = (xff.split(",")[0].trim() || req.ip || "unknown").toString();
  const ua = String(req.headers["user-agent"] || "").slice(0, 180);
  const lang = String(req.headers["accept-language"] || "").slice(0, 40);
  return `${ip}|${ua}|${lang}`.slice(0, 300);
}

function resolveSessionId(req, incomingMeta) {
  const sid = String(incomingMeta?.sessionId || "").trim();
  if (sid) return sid;

  const fp = fingerprint(req);
  const mapped = FP.get(fp);
  const now = nowMs();
  if (mapped && mapped.sid && mapped.expiresAt > now) return mapped.sid;

  const newSid = genSessionId();
  FP.set(fp, { sid: newSid, expiresAt: now + FP_TTL_MS });
  return newSid;
}

function capMapSize(map, max) {
  if (map.size <= max) return;
  let oldestKey = null;
  let oldestTs = Infinity;
  for (const [k, v] of map.entries()) {
    const ts = v?.updatedAt || v?.expiresAt || Infinity;
    if (ts < oldestTs) {
      oldestTs = ts;
      oldestKey = k;
    }
  }
  if (oldestKey !== null) map.delete(oldestKey);
}

function cleanupSessions() {
  const cutoff = nowMs() - SESS_TTL_MS;
  for (const [sid, sess] of SESS.entries()) {
    if (!sess || !sess.updatedAt || sess.updatedAt < cutoff) SESS.delete(sid);
  }
  const now = nowMs();
  for (const [fp, v] of FP.entries()) if (!v || !v.expiresAt || v.expiresAt <= now) FP.delete(fp);

  while (SESS.size > MAX_SESSIONS) capMapSize(SESS, MAX_SESSIONS);
  while (FP.size > MAX_FINGERPRINTS) capMapSize(FP, MAX_FINGERPRINTS);
}
setInterval(cleanupSessions, 15 * 60 * 1000).unref?.();

// ------------------------------
// Music DB
// ------------------------------
let MUSIC_DB = { moments: [] };

function loadMusicDbSafe() {
  let db = { moments: [] };
  try {
    if (musicKB && typeof musicKB.loadDb === "function") db = musicKB.loadDb();
  } catch (_) {
    db = { moments: [] };
  }
  if (!db || typeof db !== "object") db = { moments: [] };
  if (!Array.isArray(db.moments)) db.moments = [];
  if (db.moments.length > MAX_MUSIC_MOMENTS) db.moments = db.moments.slice(0, MAX_MUSIC_MOMENTS);
  return db;
}

MUSIC_DB = loadMusicDbSafe();

function findMoments({ artist, year, title }) {
  const moments = (MUSIC_DB && MUSIC_DB.moments) || [];
  const a = artist ? norm(artist) : null;
  const t = title ? norm(title) : null;
  const y = year ? Number(year) : null;

  // Full match
  if (a && t && y) {
    return moments.filter((m) => norm(m.artist) === a && norm(m.title) === t && Number(m.year) === y);
  }
  // Artist + year (returns list)
  if (a && y && !t) {
    return moments.filter((m) => norm(m.artist) === a && Number(m.year) === y);
  }
  // Title only
  if (t && !a && !y) {
    return moments.filter((m) => norm(m.title) === t);
  }
  // Artist only (list across years)
  if (a && !y && !t) {
    return moments.filter((m) => norm(m.artist) === a);
  }
  // Year only
  if (y && !a && !t) {
    return moments.filter((m) => Number(m.year) === y);
  }
  // Artist + title (any year)
  if (a && t && !y) {
    return moments.filter((m) => norm(m.artist) === a && norm(m.title) === t);
  }
  return [];
}

function uniqueYears(moments) {
  const s = new Set();
  for (const m of moments) if (m && m.year) s.add(Number(m.year));
  return Array.from(s).filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
}

function pickBestMoment(moments) {
  // Prefer one with fact/culture/next filled, otherwise first
  let best = null;
  let bestScore = -1;
  for (const m of moments) {
    const score =
      (m?.fact || m?.chart_fact ? 2 : 0) +
      (m?.culture || m?.cultural_moment ? 2 : 0) +
      (m?.next || m?.next_step ? 1 : 0);
    if (score > bestScore) {
      best = m;
      bestScore = score;
    }
  }
  return best || (moments[0] || null);
}

// ------------------------------
// Responses
// ------------------------------
function send(res, sid, sess, stepName, reply, advance, requestId) {
  const outMeta = {
    sessionId: sid,
    requestId,
    currentLane: sess.currentLane || "general",
    lastDomain: sess.lastDomain || "general",
    laneDetail: sess.laneDetail || {},
    mem: sess.mem || {},
    _lastStepName: stepName,
    _lastPromptSig: sess._lastPromptSig || "",
    build: BUILD_TAG,
    serverTime: new Date().toISOString()
  };

  res.setHeader("X-Nyx-Session-Id", sid);
  res.setHeader("X-Nyx-Request-Id", requestId);

  return res.json({
    ok: true,
    reply,
    state: {
      mode: outMeta.currentLane,
      step: stepName,
      advance: !!advance,
      slots: {
        artist: outMeta.laneDetail.artist || null,
        year: outMeta.laneDetail.year || null,
        title: outMeta.laneDetail.title || null,
        chart: outMeta.laneDetail.chart || null
      }
    },
    meta: outMeta
  });
}

// ------------------------------
// Ops
// ------------------------------
app.get("/health", (_, res) => res.json({ ok: true, build: BUILD_TAG }));
app.get("/api/health", (_, res) => res.json({ ok: true, build: BUILD_TAG }));

app.get("/api/debug/last", (_, res) => {
  if (!DEBUG_ENABLED) return res.status(403).json({ ok: false, error: "DEBUG_DISABLED", build: BUILD_TAG });
  res.json({ ok: true, build: BUILD_TAG, last: LAST_DEBUG });
});

app.get("/api/music/stats", (_, res) => {
  res.json({
    ok: true,
    build: BUILD_TAG,
    moments: Array.isArray(MUSIC_DB.moments) ? MUSIC_DB.moments.length : 0,
    max: MAX_MUSIC_MOMENTS
  });
});

// ------------------------------
// Main
// ------------------------------
app.post("/api/sandblast-gpt", (req, res) => {
  const requestId = tryUUID();

  try {
    if (rateLimit(req, res)) return;

    const body = req.body || {};
    const userMessage = safeMessage(body.message);
    const incomingMeta = body.meta || {};
    const msgN = norm(userMessage);

    const sid = resolveSessionId(req, incomingMeta);
    const prev = SESS.get(sid) || null;

    const sess =
      prev || {
        currentLane: "general",
        lastDomain: "general",
        laneDetail: { chart: DEFAULT_CHART, artist: null, year: null, title: null },
        mem: {},
        stepIndex: 0,
        _lastStepName: "",
        _lastPromptSig: "",
        _repeatCount: 0,
        _mismatchCount: 0,
        updatedAt: nowMs()
      };

    // Adopt lane from client meta if new session or server still general
    const inCL = normalizeDomain(incomingMeta?.currentLane || "");
    const inLD = normalizeDomain(incomingMeta?.lastDomain || "");
    if (!prev) {
      if (inCL !== "general") sess.currentLane = inCL;
      if (inLD !== "general") sess.lastDomain = inLD;
    }
    if ((sess.currentLane === "general" || !sess.currentLane) && inCL !== "general") sess.currentLane = inCL;
    if ((sess.lastDomain === "general" || !sess.lastDomain) && inLD !== "general") sess.lastDomain = inLD;

    // Non-destructive merge of laneDetail + mem
    sess.laneDetail ||= {};
    sess.mem ||= {};
    const inLane = incomingMeta.laneDetail || {};
    const inMem = incomingMeta.mem || {};
    for (const k of ["artist", "title", "chart"]) {
      if (!sess.laneDetail[k] && inLane[k]) sess.laneDetail[k] = inLane[k];
    }
    if (!sess.laneDetail.year && inLane.year) sess.laneDetail.year = Number(inLane.year) || sess.laneDetail.year;
    if (!sess.mem.musicYear && inMem.musicYear) sess.mem.musicYear = Number(inMem.musicYear) || sess.mem.musicYear;

    // Greetings (always advances to lane choice)
    const isGreeting =
      ["hi", "hello", "hey", "yo", "hi nyx", "hello nyx", "hey nyx", "nyx"].includes(msgN) ||
      msgN.startsWith("good morning") ||
      msgN.startsWith("good afternoon") ||
      msgN.startsWith("good evening");

    if (isGreeting) {
      sess.stepIndex++;
      const stepName = "choose_lane";
      const reply = "Good to have you. Choose a lane: Music history, Sandblast TV, News Canada, or Sponsors.";
      sess._lastStepName = stepName;
      sess._lastPromptSig = promptSig(stepName, reply);
      sess._repeatCount = 0;
      sess.updatedAt = nowMs();
      SESS.set(sid, sess);
      return send(res, sid, sess, stepName, reply, true, requestId);
    }

    // Explicit lane selection
    if (["music", "music history", "music_history"].includes(msgN)) {
      sess.currentLane = "music_history";
      sess.lastDomain = "music_history";
      sess.laneDetail.chart ||= DEFAULT_CHART;
      sess.stepIndex++;
      const stepName = "lane_locked";
      const reply = "Music history locked. Give me an artist + year (or a song title).";
      sess._lastStepName = stepName;
      sess._lastPromptSig = promptSig(stepName, reply);
      sess._repeatCount = 0;
      sess.updatedAt = nowMs();
      SESS.set(sid, sess);
      return send(res, sid, sess, stepName, reply, true, requestId);
    }

    // Domain routing (normalized + hard force lane lock)
    let domain = normalizeDomain(sess.currentLane || sess.lastDomain || "general");

    if (domain === "general") {
      if (looksMusicHistory(userMessage)) domain = "music_history";
      else if (classifyIntent) {
        try {
          const raw = classifyIntent(userMessage);
          domain = normalizeDomain(raw?.domain || "general");
        } catch {
          domain = "general";
        }
      }
    }

    // HARD FORCE: if lane is locked to music anywhere, stay in music
    if (
      normalizeDomain(sess.currentLane) === "music_history" ||
      normalizeDomain(sess.lastDomain) === "music_history" ||
      inCL === "music_history" ||
      inLD === "music_history"
    ) {
      domain = "music_history";
    }

    // --------------------------
    // MUSIC LANE
    // --------------------------
    if (domain === "music_history") {
      sess.currentLane = "music_history";
      sess.lastDomain = "music_history";
      sess.stepIndex++;

      // Chart switching
      const chart = resolveChartFromText(userMessage);
      if (chart) sess.laneDetail.chart = chart;
      sess.laneDetail.chart ||= DEFAULT_CHART;

      // Commands
      const cmd = parseCommand(userMessage);
      if (cmd.cmd === "clear_title") {
        sess.laneDetail.title = null;
        sess._mismatchCount = 0;
      } else if (cmd.cmd === "clear_year") {
        sess.laneDetail.year = null;
        sess.mem.musicYear = null;
        sess._mismatchCount = 0;
      } else if (cmd.cmd === "clear_artist") {
        sess.laneDetail.artist = null;
        sess._mismatchCount = 0;
      } else if (cmd.cmd === "keep_year") {
        sess.laneDetail.title = null;
        sess._mismatchCount = 0;
      } else if (cmd.cmd === "set_year" && cmd.year) {
        sess.laneDetail.year = cmd.year;
        sess.mem.musicYear = cmd.year;
        sess._mismatchCount = 0;
      }

      // Slot extraction
      const y = extractYear(userMessage);
      if (y) {
        sess.laneDetail.year = y;
        sess.mem.musicYear = y;
      } else if (!sess.laneDetail.year && sess.mem.musicYear) {
        sess.laneDetail.year = Number(sess.mem.musicYear) || sess.laneDetail.year;
      }

      const inferredArtist = detectArtist(userMessage) || inferArtistFallback(userMessage);
      const inferredTitle = detectTitle(userMessage) || inferTitleFallback(userMessage);

      // ARTIST CHANGE DETECTION (fixes “stuck on Madonna”)
      // If the user appears to provide a new artist name, overwrite the old one and clear conflicting slots.
      if (inferredArtist) {
        const oldA = sess.laneDetail.artist ? norm(sess.laneDetail.artist) : "";
        const newA = norm(inferredArtist);
        const isArtistLikeInput = !y && !inferredTitle && userMessage.length <= 40; // strong signal it's an artist entry
        const different = newA && newA !== oldA;

        if (!sess.laneDetail.artist || (different && isArtistLikeInput)) {
          sess.laneDetail.artist = inferredArtist;
          // Clear title when artist changes to avoid mismatch loops
          if (different) sess.laneDetail.title = null;
          sess._mismatchCount = 0;
        }
      }

      // Title (only set if empty OR user input is clearly a title)
      if (inferredTitle) {
        const oldT = sess.laneDetail.title ? norm(sess.laneDetail.title) : "";
        const newT = norm(inferredTitle);
        const titleLikeInput = !y && userMessage.length <= 60 && !/^\w+\s+\w+\s+\w+\s+\w+\s+\w+\s+\w+/.test(userMessage); // avoid long sentences
        if (!sess.laneDetail.title || (titleLikeInput && newT && newT !== oldT)) {
          sess.laneDetail.title = inferredTitle;
          sess._mismatchCount = 0;
        }
      }

      const slots = sess.laneDetail;
      const lastStep = String(sess._lastStepName || "");
      const lastSig = String(sess._lastPromptSig || "");

      // Lookup strategy:
      // 1) If artist+year -> list matches, ask to pick title (unless title provided)
      // 2) If artist only -> show years available
      // 3) If title only -> show best match + confirm
      // 4) If artist+title -> best match (possibly ask year)

      // Full match if we have all 3
      let matches = [];
      if (slots.artist || slots.year || slots.title) {
        matches = findMoments({ artist: slots.artist, year: slots.year, title: slots.title });
      }

      // If no matches on full triple, fall back to artist+year list (if available)
      if (matches.length === 0 && slots.artist && slots.year) {
        matches = findMoments({ artist: slots.artist, year: slots.year, title: null });
      }

      // If we have a usable match
      if (matches.length === 1 && slots.title) {
        const m = matches[0];
        const fact = sanitizeFact(m.fact || m.chart_fact || "Anchor found.");
        const culture = sanitizeCulture(m.culture || m.cultural_moment || "This was a defining radio-era moment.");
        const next = String(m.next || m.next_step || "Next step: want the #1 run, peak position, or the exact chart week?").trim();

        const stepName = "moment_anchored";
        const reply = `Chart fact: ${fact} (${slots.chart})\nCultural thread: ${culture}\nNext step: ${next}`;

        const sig = promptSig(stepName, reply);
        sess._repeatCount = sig === lastSig && stepName === lastStep ? sess._repeatCount + 1 : 0;

        sess._lastStepName = stepName;
        sess._lastPromptSig = sig;
        sess._mismatchCount = 0;

        sess.updatedAt = nowMs();
        SESS.set(sid, sess);

        if (DEBUG_ENABLED) {
          LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, domain, slots, matchCount: matches.length };
        }

        return send(res, sid, sess, stepName, reply, true, requestId);
      }

      // Artist+year with multiple songs -> present choices
      if (slots.artist && slots.year && matches.length >= 2 && !slots.title) {
        const top = matches.slice(0, 5);
        const titles = top.map((m, i) => `${i + 1}) ${m.title}`).join("\n");

        const stepName = "choose_title_from_artist_year";
        const reply =
          `I found multiple matches for ${String(slots.artist).toUpperCase()} in ${slots.year} (${slots.chart}).\n` +
          `Pick one by number or type the title:\n${titles}\n\n` +
          `Next step: reply “1”, “2”, etc., or type the exact song title.`;

        const sig = promptSig(stepName, reply);
        sess._repeatCount = sig === lastSig && stepName === lastStep ? sess._repeatCount + 1 : 0;
        sess._lastStepName = stepName;
        sess._lastPromptSig = sig;

        sess.updatedAt = nowMs();
        SESS.set(sid, sess);

        if (DEBUG_ENABLED) {
          LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, domain, slots, matchCount: matches.length, sample: top.map((m) => m.title) };
        }

        return send(res, sid, sess, stepName, reply, true, requestId);
      }

      // User replies with a number after choice list
      const choice = msgN.match(/^\s*([1-5])\s*$/);
      if (choice && slots.artist && slots.year) {
        const list = findMoments({ artist: slots.artist, year: slots.year, title: null });
        const idx = Number(choice[1]) - 1;
        if (list[idx]) {
          slots.title = list[idx].title;
          // Re-run anchor on next request naturally; but we can anchor immediately:
          const m = list[idx];
          const fact = sanitizeFact(m.fact || m.chart_fact || "Anchor found.");
          const culture = sanitizeCulture(m.culture || m.cultural_moment || "This was a defining radio-era moment.");
          const next = String(m.next || m.next_step || "Next step: want the #1 run, peak position, or the exact chart week?").trim();

          const stepName = "moment_anchored";
          const reply = `Chart fact: ${fact} (${slots.chart})\nCultural thread: ${culture}\nNext step: ${next}`;

          sess._lastStepName = stepName;
          sess._lastPromptSig = promptSig(stepName, reply);
          sess._mismatchCount = 0;

          sess.updatedAt = nowMs();
          SESS.set(sid, sess);

          if (DEBUG_ENABLED) {
            LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, domain, slots, picked: m.title };
          }

          return send(res, sid, sess, stepName, reply, true, requestId);
        }
      }

      // Title provided but multiple title matches across years -> ask year
      if (slots.title && matches.length >= 2 && !slots.year) {
        const years = uniqueYears(matches);
        const sampleYears = years.slice(0, 8).join(", ");
        const stepName = "need_year_for_title";
        const reply =
          `I found multiple chart moments for “${slots.title}”.\n` +
          `Available years include: ${sampleYears}${years.length > 8 ? ", …" : ""}\n\n` +
          `Next step: give me the year (example: 1984).`;

        sess._lastStepName = stepName;
        sess._lastPromptSig = promptSig(stepName, reply);

        sess.updatedAt = nowMs();
        SESS.set(sid, sess);

        return send(res, sid, sess, stepName, reply, true, requestId);
      }

      // Artist only -> show years available and ask for year
      if (slots.artist && !slots.year && !slots.title) {
        const list = findMoments({ artist: slots.artist, year: null, title: null });
        const years = uniqueYears(list);
        const sampleYears = years.slice(0, 10).join(", ");
        const stepName = "need_year_for_artist";
        const reply =
          `Locked: ${String(slots.artist).toUpperCase()}.\n` +
          (years.length
            ? `I have chart moments in years like: ${sampleYears}${years.length > 10 ? ", …" : ""}\n\n`
            : `I don’t see that artist in the current dump.\n\n`) +
          `Next step: give me a year (example: 1984) or a song title to pinpoint it.`;

        sess._lastStepName = stepName;
        sess._lastPromptSig = promptSig(stepName, reply);
        sess.updatedAt = nowMs();
        SESS.set(sid, sess);

        return send(res, sid, sess, stepName, reply, true, requestId);
      }

      // Year only -> ask for artist or title (escalating, loop-proof)
      if (slots.year && !slots.artist && !slots.title) {
        const stepName = "need_artist_or_title";
        const reply = `Year locked: ${slots.year}. Next step: give the artist name or the song title.`;
        const sig = promptSig(stepName, reply);
        sess._repeatCount = sig === lastSig && stepName === lastStep ? sess._repeatCount + 1 : 0;

        const finalReply =
          sess._repeatCount >= 1
            ? `We already have the year. Give me ONE thing only: the artist OR the title.`
            : reply;

        sess._lastStepName = stepName;
        sess._lastPromptSig = promptSig(stepName, finalReply);

        sess.updatedAt = nowMs();
        SESS.set(sid, sess);
        return send(res, sid, sess, stepName, finalReply, true, requestId);
      }

      // Artist+year but no matches -> don’t loop; ask to correct title or year
      if (slots.artist && slots.year && matches.length === 0) {
        const stepName = "no_match_artist_year";
        const reply =
          `I don’t see a chart moment for ${String(slots.artist).toUpperCase()} in ${slots.year} in this dump.\n` +
          `Next step: try a different year (say: “switch year to 1983”) or give me the song title.`;

        sess._lastStepName = stepName;
        sess._lastPromptSig = promptSig(stepName, reply);

        sess.updatedAt = nowMs();
        SESS.set(sid, sess);
        return send(res, sid, sess, stepName, reply, true, requestId);
      }

      // Default music prompt
      {
        const stepName = "awaiting_anchor";
        const reply =
          `To anchor the moment, give me an artist + year (or a song title).\n` +
          `Charts supported: Billboard Hot 100, UK Singles, Canada RPM, Top40Weekly. (Current: ${slots.chart || DEFAULT_CHART}).`;

        const sig = promptSig(stepName, reply);
        sess._repeatCount = sig === lastSig && stepName === lastStep ? sess._repeatCount + 1 : 0;
        const finalReply = sess._repeatCount >= 1 ? `Give me either: artist + year, or a song title.` : reply;

        sess._lastStepName = stepName;
        sess._lastPromptSig = promptSig(stepName, finalReply);

        sess.updatedAt = nowMs();
        SESS.set(sid, sess);

        if (DEBUG_ENABLED) {
          LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, domain, slots };
        }

        return send(res, sid, sess, stepName, finalReply, true, requestId);
      }
    }

    // --------------------------
    // Non-music lanes (placeholder)
    // --------------------------
    sess.lastDomain = normalizeDomain(domain || "general");
    sess.currentLane = normalizeDomain(sess.currentLane || "general");
    sess.stepIndex++;

    const stepName = "general_fallback";
    const reply = "Understood. Choose a lane: Music history, Sandblast TV, News Canada, or Sponsors.";
    sess._lastStepName = stepName;
    sess._lastPromptSig = promptSig(stepName, reply);
    sess.updatedAt = nowMs();
    SESS.set(sid, sess);

    if (DEBUG_ENABLED) {
      LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, domain, stepName, lane: sess.currentLane, message: userMessage };
    }

    return send(res, sid, sess, stepName, reply, true, requestId);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: "Nyx hit a backend error. Enable DEBUG=true and check /api/debug/last if it repeats.",
      build: BUILD_TAG
    });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "NOT_FOUND", path: req.path, build: BUILD_TAG });
});

app.listen(PORT, () => {
  console.log(`[Nyx] ${BUILD_TAG} running on port ${PORT}`);
});
