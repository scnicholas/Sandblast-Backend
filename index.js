/**
 * index.js — Nyx Broadcast Backend (Bulletproof)
 * Build: nyx-bulletproof-v1.53-2025-12-18
 *
 * Fixes in v1.53:
 * - Loop-killer: prevents "artist repeated" from being inferred as a title
 *   (stops music_not_found loop and "try Artist - Title" repeating)
 * - Keeps lane lock: never bounces out of music_history once locked
 * - Preserves v1.52 improvements (artist+year fallback lists, keep-year, numeric pick)
 */

"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

// ------------------------------
// CORS (Webflow embeds)
// ------------------------------
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
  })
);
app.options("*", cors({ origin: true }));

// ------------------------------
// Optional modules (safe load)
// ------------------------------
let classifyIntent = null;
try {
  ({ classifyIntent } = require("./Utils/intentClassifier"));
} catch (_) {}

let musicKB = null;
try {
  musicKB = require("./Utils/musicKnowledge");
} catch (_) {
  musicKB = null;
}

// ------------------------------
// Config
// ------------------------------
const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-bulletproof-v1.53-2025-12-18";
const DEFAULT_CHART = "Billboard Hot 100";
const DEBUG_ENABLED = String(process.env.DEBUG || "").toLowerCase() === "true";

const MAX_MSG_CHARS = Number(process.env.MAX_MESSAGE_CHARS || 2500);
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 120);

// ------------------------------
// Helpers
// ------------------------------
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

function safeMessage(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.length > MAX_MSG_CHARS ? s.slice(0, MAX_MSG_CHARS) : s;
}

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function promptSig(stepName, reply) {
  const s = `${stepName || ""}::${String(reply || "").slice(0, 160)}`;
  return norm(s).slice(0, 220);
}

function stripLeadingLabel(text, label) {
  const s = String(text || "").trim();
  if (!s) return "";
  const r = new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:?\\s*", "i");
  return s.replace(r, "").trim();
}

function sanitizeFact(f) {
  let s = String(f || "").trim();
  s = stripLeadingLabel(s, "chart fact");
  s = stripLeadingLabel(s, "chart anchor");
  s = stripLeadingLabel(s, "fact");
  return s.trim();
}

function sanitizeCulture(c) {
  let s = String(c || "").trim();
  s = stripLeadingLabel(s, "cultural thread");
  s = stripLeadingLabel(s, "culture");
  return s.trim();
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

function resolveChartFromText(text) {
  const t = norm(text);
  if (t.includes("uk") || t.includes("uk singles") || t.includes("official charts")) return "UK Singles Chart";
  if (t.includes("canada") || t.includes("rpm")) return "Canada RPM";
  if (t.includes("top40weekly") || t.includes("top 40")) return "Top40Weekly";
  if (t.includes("billboard") || t.includes("hot 100")) return "Billboard Hot 100";
  return null;
}

function hasNumberOneIntent(text) {
  return /#1|# 1|number one|no\.?\s?1|no 1/.test(norm(text));
}

// ------------------------------
// Minimal rate limit
// ------------------------------
const RL = new Map(); // ip -> {count, resetAt}
const RL_WINDOW_MS = 60_000;

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

  if (cur.count > RATE_LIMIT_PER_MIN) {
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
  for (const [k, v] of RL.entries()) {
    if (!v || v.resetAt <= now) RL.delete(k);
  }
}, 30_000).unref?.();

// ------------------------------
// Sessions (self-healing)
// ------------------------------
const SESS = new Map(); // sid -> session
const FP = new Map(); // fingerprint -> { sid, expiresAt }
const SESS_TTL_MS = 6 * 60 * 60 * 1000;
const FP_TTL_MS = 45 * 60 * 1000;

const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 5000);
const MAX_FINGERPRINTS = Number(process.env.MAX_FINGERPRINTS || 8000);

function genSessionId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `sid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

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

function getSession(sid) {
  return SESS.get(sid) || null;
}

function saveSession(sid, sess) {
  sess.updatedAt = nowMs();
  SESS.set(sid, sess);
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
  for (const [fp, v] of FP.entries()) {
    if (!v || !v.expiresAt || v.expiresAt <= now) FP.delete(fp);
  }

  while (SESS.size > MAX_SESSIONS) capMapSize(SESS, MAX_SESSIONS);
  while (FP.size > MAX_FINGERPRINTS) capMapSize(FP, MAX_FINGERPRINTS);
}

setInterval(cleanupSessions, 15 * 60 * 1000).unref?.();

// ------------------------------
// Music DB load + indexes
// ------------------------------
let MUSIC_DB = { moments: [] };
try {
  if (musicKB && typeof musicKB.loadDb === "function") MUSIC_DB = musicKB.loadDb();
} catch (_) {
  MUSIC_DB = { moments: [] };
}

const MUSIC_INDEX = {
  byArtist: new Map(), // norm(artist) -> [moment]
  byTitle: new Map(), // norm(title)  -> [moment]
  byArtistYear: new Map(), // norm(artist)+"|"+year -> [moment]
  byYear: new Map() // year -> [moment]
};

function idxPush(map, key, val) {
  if (!key) return;
  const arr = map.get(key);
  if (arr) arr.push(val);
  else map.set(key, [val]);
}

function buildMusicIndexes() {
  MUSIC_INDEX.byArtist.clear();
  MUSIC_INDEX.byTitle.clear();
  MUSIC_INDEX.byArtistYear.clear();
  MUSIC_INDEX.byYear.clear();

  const moments = (MUSIC_DB && MUSIC_DB.moments) || [];
  for (const m of moments) {
    const a = norm(m.artist || "");
    const t = norm(m.title || "");
    const y = Number(m.year || 0) || null;

    if (a) idxPush(MUSIC_INDEX.byArtist, a, m);
    if (t) idxPush(MUSIC_INDEX.byTitle, t, m);
    if (a && y) idxPush(MUSIC_INDEX.byArtistYear, `${a}|${y}`, m);
    if (y) idxPush(MUSIC_INDEX.byYear, String(y), m);
  }
}

buildMusicIndexes();

function yearsForArtist(artistName) {
  const aKey = norm(artistName);
  const arr = MUSIC_INDEX.byArtist.get(aKey) || [];
  const ys = new Set();
  for (const m of arr) {
    const y = Number(m.year || 0) || null;
    if (y) ys.add(y);
  }
  return Array.from(ys).sort((a, b) => a - b);
}

// ------------------------------
// Slot inference
// ------------------------------
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

function inferTitleFallback(text) {
  const raw = String(text || "").trim();
  const t = norm(raw);
  if (!raw) return null;

  if (t === "music history" || t === "music" || t === "tv" || t === "news" || t === "sponsors") return null;
  if (t.startsWith("switch lane") || t.startsWith("set lane")) return null;
  if (t.startsWith("switch year") || t.startsWith("set year") || t.startsWith("use year")) return null;
  if (t === "clear title" || t === "reset title") return null;

  if (/\b(19\d{2}|20\d{2})\b/.test(raw)) return null;

  const m = raw.match(/^(.{2,40})\s*[-:]\s*(.{2,80})$/);
  if (m) return String(m[2]).trim();

  if (raw.length >= 2 && raw.length <= 60) return raw;
  return null;
}

function inferArtistFallback(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  if (/\b(19\d{2}|20\d{2})\b/.test(raw)) return null;

  const m = raw.match(/^(.{2,40})\s*[-:]\s*(.{2,80})$/);
  if (m) return String(m[1]).trim();

  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length >= 1 && words.length <= 4 && !/[#@/\\]/.test(raw)) return raw;

  return null;
}

// ------------------------------
// Commands
// ------------------------------
function parseCommand(text) {
  const t = norm(text);
  if (t === "clear title" || t === "reset title") return { cmd: "clear_title" };
  if (t === "clear year" || t === "reset year") return { cmd: "clear_year" };
  if (t === "clear artist" || t === "reset artist") return { cmd: "clear_artist" };
  if (t === "keep year" || t === "keep the year") return { cmd: "keep_year" };

  const setYear = t.match(/^(switch year to|set year to|use year)\s+(19\d{2}|20\d{2})$/);
  if (setYear) return { cmd: "set_year", year: Number(setYear[2]) };

  const setLane = t.match(/^(switch lane to|set lane to|use lane)\s+(music|music history|tv|news|news canada|sponsors)$/);
  if (setLane) {
    const laneRaw = setLane[2];
    const lane =
      laneRaw.includes("music") ? "music_history" :
      laneRaw.includes("tv") ? "tv" :
      laneRaw.includes("news") ? "news_canada" :
      laneRaw.includes("sponsor") ? "sponsors" : "general";
    return { cmd: "set_lane", lane };
  }

  return { cmd: null };
}

// ------------------------------
// Music search
// ------------------------------
function pickBestMoment(fields) {
  try {
    if (musicKB && typeof musicKB.pickBestMoment === "function") {
      return musicKB.pickBestMoment(MUSIC_DB, fields);
    }
  } catch {}

  const a = fields.artist ? norm(fields.artist) : null;
  const t = fields.title ? norm(fields.title) : null;
  const y = fields.year ? Number(fields.year) : null;

  if (a && y) {
    const arr = MUSIC_INDEX.byArtistYear.get(`${a}|${y}`);
    if (arr && arr.length) {
      if (t) {
        const hit = arr.find((m) => norm(m.title) === t);
        if (hit) return hit;
      }
      return arr[0];
    }
  }

  if (t) {
    const arr = MUSIC_INDEX.byTitle.get(t);
    if (arr && arr.length) {
      if (a) {
        const hit = arr.find((m) => norm(m.artist) === a);
        if (hit) return hit;
      }
      if (y) {
        const hit = arr.find((m) => Number(m.year) === y);
        if (hit) return hit;
      }
      return arr[0];
    }
  }

  if (a) {
    const arr = MUSIC_INDEX.byArtist.get(a);
    if (arr && arr.length) {
      if (y) {
        const hit = arr.find((m) => Number(m.year) === y);
        if (hit) return hit;
      }
      return arr[0];
    }
  }

  if (y) {
    const arr = MUSIC_INDEX.byYear.get(String(y));
    if (arr && arr.length) return arr[0];
  }

  return null;
}

function formatMusicReply(m, fields) {
  const artist = m.artist || fields.artist || "Unknown artist";
  const title = m.title || fields.title || "Unknown title";
  const year = m.year || fields.year || "Unknown year";
  const chart = fields.chart || DEFAULT_CHART;

  const fact = sanitizeFact(m.fact || m.chartFact || m.anchorFact || "");
  const culture = sanitizeCulture(m.culture || m.culturalThread || "");

  const lines = [];
  lines.push(`${artist} — "${title}" (${year})`);
  lines.push(`Chart: ${chart}`);

  if (fact) lines.push(`Proof point: ${fact}`);
  if (culture) lines.push(`Cultural thread: ${culture}`);

  if (hasNumberOneIntent(fields.rawUserText || "")) {
    lines.push(`Next action: Want #1 weeks and peak date, or should I pull 3 neighboring hits from ${year}?`);
  } else {
    lines.push(`Next action: If you want #1s, say “Was this #1?” or give me another artist/title.`);
  }

  return lines.join("\n");
}

// ------------------------------
// Anti-loop escalation
// ------------------------------
function shouldEscalate(sess, stepName, reply) {
  const sig = promptSig(stepName, reply);
  if (sess._lastPromptSig && sess._lastPromptSig === sig) {
    sess._repeatCount = (sess._repeatCount || 0) + 1;
  } else {
    sess._repeatCount = 0;
  }
  sess._lastPromptSig = sig;
  return sess._repeatCount >= 1;
}

// ------------------------------
// Reply sender
// ------------------------------
let LAST_DEBUG = null;

function send(res, sid, sess, stepName, reply, requestId) {
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
      advance: true,
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
// Health / Debug
// ------------------------------
app.get("/health", (_, res) => res.json({ ok: true, build: BUILD_TAG }));
app.get("/api/health", (_, res) => res.json({ ok: true, build: BUILD_TAG }));

app.get("/api/debug/last", (_, res) => {
  if (!DEBUG_ENABLED) {
    return res.status(403).json({ ok: false, error: "DEBUG_DISABLED", build: BUILD_TAG });
  }
  res.json({ ok: true, build: BUILD_TAG, last: LAST_DEBUG });
});

// ------------------------------
// Main endpoint
// ------------------------------
app.post("/api/sandblast-gpt", (req, res) => {
  const requestId = tryUUID();

  if (rateLimit(req, res)) return;

  const userText = safeMessage(req.body?.message || req.body?.text || "");
  const incomingMeta = req.body?.meta || {};
  const sid = resolveSessionId(req, incomingMeta);

  let sess = getSession(sid);
  if (!sess) {
    sess = {
      createdAt: nowMs(),
      updatedAt: nowMs(),
      currentLane: String(incomingMeta.currentLane || "general"),
      lastDomain: String(incomingMeta.lastDomain || "general"),
      laneDetail: incomingMeta.laneDetail || { chart: DEFAULT_CHART },
      mem: incomingMeta.mem || {},
      _lastPromptSig: "",
      _repeatCount: 0
    };
  }

  sess.laneDetail = sess.laneDetail || {};
  sess.laneDetail.chart = sess.laneDetail.chart || DEFAULT_CHART;

  if (DEBUG_ENABLED) {
    LAST_DEBUG = {
      requestId,
      sid,
      userText,
      lane: sess.currentLane,
      laneDetail: sess.laneDetail,
      time: new Date().toISOString()
    };
  }

  // Commands
  const cmd = parseCommand(userText);

  if (cmd.cmd === "set_lane") {
    sess.currentLane = cmd.lane;
    sess.lastDomain = cmd.lane;
    if (cmd.lane === "music_history") {
      sess.laneDetail = { chart: sess.laneDetail.chart || DEFAULT_CHART };
    }
    saveSession(sid, sess);
    return send(res, sid, sess, "lane_set", `Locked. Lane is now: ${sess.currentLane}. What do you want to do next?`, requestId);
  }

  if (cmd.cmd === "clear_title") sess.laneDetail.title = null;
  if (cmd.cmd === "clear_year") sess.laneDetail.year = null;
  if (cmd.cmd === "clear_artist") sess.laneDetail.artist = null;
  if (cmd.cmd === "set_year") sess.laneDetail.year = cmd.year;

  // “keep year” means: stop demanding a year; don’t clear it if present, just proceed.
  const userChoseKeepYear = cmd.cmd === "keep_year";

  // HARD RULE: if music_history is active, DO NOT bounce to general routing
  const laneAlreadyLocked = sess.currentLane === "music_history";

  if (!laneAlreadyLocked) {
    const chartFromText = resolveChartFromText(userText);
    if (chartFromText) sess.laneDetail.chart = chartFromText;

    let decidedLane = null;

    if (classifyIntent) {
      try {
        const c = classifyIntent(userText);
        if (c && typeof c === "string") decidedLane = c;
      } catch {}
    }

    const t = norm(userText);
    if (!decidedLane) {
      if (t.includes("music") || t.includes("chart") || t.includes("#1") || t.includes("hot 100") || t.includes("billboard")) decidedLane = "music_history";
      else if (t.includes("tv")) decidedLane = "tv";
      else if (t.includes("news")) decidedLane = "news_canada";
      else if (t.includes("sponsor")) decidedLane = "sponsors";
    }

    if (decidedLane) {
      sess.currentLane = decidedLane;
      sess.lastDomain = decidedLane;
      if (decidedLane === "music_history") {
        sess.laneDetail = sess.laneDetail || {};
        sess.laneDetail.chart = sess.laneDetail.chart || DEFAULT_CHART;
      }
    }
  }

  // ------------------------------
  // Music lane flow
  // ------------------------------
  if (sess.currentLane === "music_history") {
    sess.lastDomain = "music_history";
    sess.laneDetail = sess.laneDetail || {};
    sess.laneDetail.chart = sess.laneDetail.chart || DEFAULT_CHART;
    sess.laneDetail.rawUserText = userText;

    // Numeric choice support (1–5) for prior lists
    const numericPick = norm(userText).match(/^([1-5])$/);
    if (numericPick && sess.laneDetail._lastList && Array.isArray(sess.laneDetail._lastList)) {
      const idx = Number(numericPick[1]) - 1;
      const arr = sess.laneDetail._lastList;
      if (arr[idx]) {
        const chosen = arr[idx];
        sess.laneDetail.artist = sess.laneDetail.artist || chosen.artist || null;
        sess.laneDetail.year = sess.laneDetail.year || chosen.year || null;
        sess.laneDetail.title = chosen.title || sess.laneDetail.title || null;

        const reply = formatMusicReply(chosen, {
          artist: sess.laneDetail.artist,
          title: sess.laneDetail.title,
          year: sess.laneDetail.year,
          chart: sess.laneDetail.chart,
          rawUserText: userText
        });
        saveSession(sid, sess);
        return send(res, sid, sess, "music_answer", reply, requestId);
      }
    }

    // slot fill
    const year = extractYear(userText);
    if (year) sess.laneDetail.year = year;

    const chartFromText = resolveChartFromText(userText);
    if (chartFromText) sess.laneDetail.chart = chartFromText;

    // ---- LOOP KILLER PATCH (backend-side) ----
    // If artist is already locked and user repeats the artist name
    // (no dash/title and no year), do NOT infer title from that input.
    const lockedArtistNorm = sess.laneDetail.artist ? norm(sess.laneDetail.artist) : "";
    const incomingNorm = norm(userText);
    const hasDash = /[-:]/.test(String(userText || ""));
    const hasYearInText = /\b(19\d{2}|20\d{2})\b/.test(String(userText || ""));

    const repeatingLockedArtistOnly =
      !!lockedArtistNorm &&
      incomingNorm &&
      incomingNorm === lockedArtistNorm &&
      !hasDash &&
      !hasYearInText;

    let a = null;
    let ti = null;

    if (!repeatingLockedArtistOnly) {
      a = detectArtist(userText) || inferArtistFallback(userText);
      ti = detectTitle(userText) || inferTitleFallback(userText);
    } else {
      // reaffirm artist; avoid polluting title
      a = null;
      ti = null;
    }

    // If user typed "Artist - Title", capture both
    const dash = String(userText || "").match(/^(.{2,40})\s*[-:]\s*(.{2,80})$/);
    if (dash) {
      a = a || String(dash[1]).trim();
      ti = ti || String(dash[2]).trim();
    }

    // Prevent artist being mis-stored as title
    if (a && ti && norm(a) === norm(ti)) {
      ti = null;
    }

    // Apply slots
    if (a && !sess.laneDetail.artist) sess.laneDetail.artist = a;
    if (ti && !sess.laneDetail.title) sess.laneDetail.title = ti;

    const haveArtist = !!sess.laneDetail.artist;
    const haveYear = !!sess.laneDetail.year;
    const haveTitle = !!sess.laneDetail.title;

    // Anchor gating: allow title-only OR artist+year
    const canAnchor = haveTitle || (haveArtist && haveYear);

    // If user is repeating locked artist-only, respond with a clean next step (no loop)
    if (repeatingLockedArtistOnly) {
      let reply = `Artist confirmed: ${sess.laneDetail.artist}. Next action: give me the year (example: 1986) or the song title.`;
      if (userChoseKeepYear) reply = `Artist confirmed: ${sess.laneDetail.artist}. Next action: give me the song title.`;
      const esc = shouldEscalate(sess, "music_need_slot", reply);
      if (esc) reply += `\nFastest format: ${sess.laneDetail.artist} - Song Title 1986`;
      saveSession(sid, sess);
      return send(res, sid, sess, "music_need_slot", reply, requestId);
    }

    // Artist + year discovery mode
    if (haveArtist && haveYear && !haveTitle) {
      const aKey = norm(sess.laneDetail.artist);
      const yVal = Number(sess.laneDetail.year);
      const arr = MUSIC_INDEX.byArtistYear.get(`${aKey}|${yVal}`) || [];

      if (arr.length) {
        const top = arr.slice(0, 5);
        sess.laneDetail._lastList = top; // numeric picks
        const titles = top.map((m, i) => `${i + 1}) ${m.title}`).join("\n");
        const reply =
          `I found ${arr.length} matches for ${sess.laneDetail.artist} in ${yVal}.\n` +
          `Pick one by number or type the title:\n${titles}\n\n` +
          `Next action: reply “1–5” or type the exact title.`;

        saveSession(sid, sess);
        return send(res, sid, sess, "choose_title_from_artist_year", reply, requestId);
      }

      // If artist exists but that year doesn’t, fall back to artist-only list + available years
      const allForArtist = MUSIC_INDEX.byArtist.get(aKey) || [];
      if (allForArtist.length) {
        const yrs = yearsForArtist(sess.laneDetail.artist).slice(0, 20);
        const yrsLine = yrs.length ? `Years I have for ${sess.laneDetail.artist}: ${yrs.join(", ")}` : "";
        const top = allForArtist
          .slice()
          .sort((x, y) => (Number(x.year || 0) - Number(y.year || 0)) || norm(x.title).localeCompare(norm(y.title)))
          .slice(0, 5);

        sess.laneDetail._lastList = top; // numeric picks
        const list = top.map((m, i) => `${i + 1}) ${m.title} (${m.year || "year unknown"})`).join("\n");

        const reply =
          `I don’t have a match for ${sess.laneDetail.artist} in ${yVal}, but I *do* have these for that artist:\n` +
          `${list}\n` +
          (yrsLine ? `\n${yrsLine}\n` : "\n") +
          `Next action: reply “1–5”, or give me a different year.`;

        saveSession(sid, sess);
        return send(res, sid, sess, "choose_title_artist_fallback", reply, requestId);
      }
      // If artist truly not in dump, fall through to not_found below
    }

    if (canAnchor) {
      const best = pickBestMoment({
        artist: sess.laneDetail.artist || null,
        title: sess.laneDetail.title || null,
        year: sess.laneDetail.year || null,
        chart: sess.laneDetail.chart || DEFAULT_CHART,
        rawUserText: userText
      });

      if (best) {
        const reply = formatMusicReply(best, {
          artist: sess.laneDetail.artist,
          title: sess.laneDetail.title,
          year: sess.laneDetail.year,
          chart: sess.laneDetail.chart,
          rawUserText: userText
        });
        saveSession(sid, sess);
        return send(res, sid, sess, "music_answer", reply, requestId);
      }

      // Not found: stronger next step to avoid “loop feel”
      let reply = `I didn’t find that exact match in the current card dump yet.`;
      const escalate = shouldEscalate(sess, "music_not_found", reply);

      if (!sess.laneDetail.year && !userChoseKeepYear) {
        reply += ` Give me the year (or say “keep year” if you don’t care).`;
      } else if (!sess.laneDetail.title && sess.laneDetail.artist) {
        reply += ` Give me the song title for ${sess.laneDetail.artist}.`;
      } else if (!sess.laneDetail.artist && sess.laneDetail.title) {
        reply += ` Give me the artist for "${sess.laneDetail.title}".`;
      } else {
        reply += ` Try: Artist - Title (and optional year).`;
      }

      if (escalate) {
        reply += `\nFastest format: Artist - Title 1986 (example: Peter Cetera - Glory of Love 1986).`;
      }

      saveSession(sid, sess);
      return send(res, sid, sess, "music_not_found", reply, requestId);
    }

    // If we cannot anchor yet, ask for missing slots (non-loop)
    let reply = "";

    if (!haveArtist && !haveTitle) {
      reply = `Give me either the artist name or the song title.`;
    } else if (haveArtist && !haveYear && !haveTitle) {
      reply = `Locked: ${sess.laneDetail.artist}. Next action: give me the year (example: 1986) or the song title.`;
      if (userChoseKeepYear) reply = `Locked: ${sess.laneDetail.artist}. Next action: give me the song title.`;
    } else if (!haveArtist && haveTitle) {
      reply = `Locked: "${sess.laneDetail.title}". Next action: give me the artist (or the year).`;
    } else if (!haveTitle && haveYear && !haveArtist) {
      reply = `Year locked: ${sess.laneDetail.year}. Next action: give me the artist or the song title.`;
    } else {
      reply = `To anchor the moment, give me an artist + year (or a song title).`;
    }

    const escalate = shouldEscalate(sess, "music_need_slot", reply);
    if (escalate) {
      reply += `\nExample: Madonna - Like a Virgin 1984`;
    }

    saveSession(sid, sess);
    return send(res, sid, sess, "music_need_slot", reply, requestId);
  }

  // ------------------------------
  // Non-music lanes (basic)
  // ------------------------------
  if (sess.currentLane === "tv") {
    sess.lastDomain = "tv";
    saveSession(sid, sess);
    return send(res, sid, sess, "tv_stub", `TV lane is live. Tell me the show name (or “schedule” / “recommend”).`, requestId);
  }

  if (sess.currentLane === "news_canada") {
    sess.lastDomain = "news_canada";
    saveSession(sid, sess);
    return send(res, sid, sess, "news_stub", `News lane is live. Tell me a topic or headline to track.`, requestId);
  }

  if (sess.currentLane === "sponsors") {
    sess.lastDomain = "sponsors";
    saveSession(sid, sess);
    return send(res, sid, sess, "sponsors_stub", `Sponsors lane is live. Tell me the business type and goal (awareness/leads/foot traffic).`, requestId);
  }

  sess.currentLane = sess.currentLane || "general";
  sess.lastDomain = "general";
  saveSession(sid, sess);
  return send(res, sid, sess, "general_fallback", `Pick a lane: Music, TV, News Canada, or Sponsors.`, requestId);
});

// ------------------------------
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Nyx] Backend up on :${PORT} build=${BUILD_TAG} debug=${DEBUG_ENABLED ? "true" : "false"}`);
});
