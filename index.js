/**
 * index.js — Nyx Broadcast Backend (Bulletproof)
 * Build: nyx-bulletproof-v1.54-2025-12-18
 *
 * Goals:
 * - Stop lane/session drops from causing “choose a lane” loops
 * - Deterministic music lane: never re-asks the same thing forever
 * - Artist/year/title search across the full card dump (not Madonna-specific)
 *
 * Fixes in v1.53:
 * - Loop-killer: prevents "artist repeated" from being inferred as a title
 *
 * Patches in v1.54:
 * - Lane repair: if incoming meta has music_history but server session is general, lock lane immediately
 * - Music candidate routing: treat plain artist/title inputs as music_history using loaded card indexes
 */

"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

// ------------------------------
// Optional modules (safe load)
// ------------------------------
let classifyIntent = null;
try {
  ({ classifyIntent } = require("./Utils/intentClassifier"));
} catch (_) {
  // Safe fallback: heuristics only
}

let musicKB = null;
try {
  musicKB = require("./Utils/musicKnowledge");
} catch (_) {
  musicKB = null;
}

const app = express();

// Render/Proxy correctness
app.set("trust proxy", true);

// Body parsing
app.use(express.json({ limit: "1mb" }));

// CORS
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
const BUILD_TAG = "nyx-bulletproof-v1.54-2025-12-18";
const DEFAULT_CHART = "Billboard Hot 100";

const ALLOWED_LANES = new Set(["general", "music_history", "tv", "news_canada", "sponsors"]);

function cleanLane(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const n = s.toLowerCase();
  if (ALLOWED_LANES.has(n)) return n;
  if (n === "music" || n === "music history") return "music_history";
  if (n === "news" || n === "news canada") return "news_canada";
  return null;
}

// ------------------------------
// Request safety / normalization
// ------------------------------
const MAX_MSG_CHARS = Number(process.env.MAX_MESSAGE_CHARS || 2500);

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

// ------------------------------
// Minimal rate limiting (no deps)
// ------------------------------
const RL = new Map(); // key -> {count, resetAt}
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
  for (const [k, v] of RL.entries()) {
    if (!v || v.resetAt <= now) RL.delete(k);
  }
}, 30_000).unref?.();

// ------------------------------
// Sessions: Self-healing continuity
// ------------------------------
const SESS = new Map(); // sid -> session
const FP = new Map(); // fingerprint -> { sid, expiresAt }
const SESS_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const FP_TTL_MS = 45 * 60 * 1000; // 45m

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

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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

function isMusicCandidate(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const t = norm(raw);
  if (!t) return false;

  if (t === "music" || t === "music history" || t === "tv" || t === "news" || t === "news canada" || t === "sponsors") return false;

  if (MUSIC_INDEX.byArtist.has(t)) return true;
  if (MUSIC_INDEX.byTitle.has(t)) return true;

  const dash = raw.match(/^(.{2,60})\s*[-:—]\s*(.{2,90})$/);
  if (dash) return true;

  return false;
}

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

// ------------------------------
// Slot inference (prevents loops)
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

  const m = raw.match(/^(.{2,60})\s*[-:—]\s*(.{2,90})$/);
  if (m) return String(m[2]).trim();

  if (raw.length >= 2 && raw.length <= 60) return raw;
  return null;
}

function inferArtistFallback(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  if (/\b(19\d{2}|20\d{2})\b/.test(raw)) return null;

  const m = raw.match(/^(.{2,60})\s*[-:—]\s*(.{2,90})$/);
  if (m) return String(m[1]).trim();

  if (raw.length >= 2 && raw.length <= 60) return raw;
  return null;
}

// ------------------------------
// Commands
// ------------------------------
function parseCommand(text) {
  const t = norm(text);

  const m1 = t.match(/^set lane\s+(music|music history|music_history|tv|news|news canada|news_canada|sponsors)$/);
  if (m1) {
    const lane = cleanLane(m1[1]);
    return { cmd: "set_lane", lane: lane || "general" };
  }

  const m2 = t.match(/^reset lane$/);
  if (m2) return { cmd: "reset_lane" };

  const m3 = t.match(/^clear music$/);
  if (m3) return { cmd: "clear_music" };

  return { cmd: null };
}

// ------------------------------
// Reply formatting
// ------------------------------
function formatMusicReply(best, slots) {
  const artist = best.artist || slots.artist || "Unknown artist";
  const title = best.title || slots.title || "Unknown title";
  const year = best.year || slots.year || "Unknown year";
  const chart = best.chart || slots.chart || DEFAULT_CHART;

  const aka = Array.isArray(best.aka) && best.aka.length ? `\nAKA: ${best.aka.join(", ")}` : "";
  const tags = Array.isArray(best.tags) && best.tags.length ? `\nTags: ${best.tags.join(", ")}` : "";

  const fact = best.fact ? `\n\nChart fact: ${best.fact}` : "";
  const culture = best.culture ? `\nCultural thread: ${best.culture}` : "";

  return (
    `${artist} — "${title}" (${year})\n` +
    `Chart: ${chart}` +
    aka +
    tags +
    fact +
    culture +
    `\n\nNext action: give me another artist+year, or ask “When was this #1?”`
  );
}

function pickBestMoment(fields) {
  if (musicKB && typeof musicKB.pickBestMoment === "function") {
    try {
      return musicKB.pickBestMoment(MUSIC_DB, fields);
    } catch {}
  }

  const moments = (MUSIC_DB && MUSIC_DB.moments) || [];
  const na = fields.artist ? norm(fields.artist) : null;
  const nt = fields.title ? norm(fields.title) : null;
  const y = fields.year ? Number(fields.year) : null;

  if (na && nt && y) return moments.find((m) => norm(m.artist) === na && norm(m.title) === nt && Number(m.year) === y) || null;
  if (na && nt) return moments.find((m) => norm(m.artist) === na && norm(m.title) === nt) || null;
  if (na && y) return moments.find((m) => norm(m.artist) === na && Number(m.year) === y) || null;
  if (nt) return moments.find((m) => norm(m.title) === nt) || null;
  if (na) return moments.find((m) => norm(m.artist) === na) || null;
  return null;
}

function shouldEscalate(sess, stepName, reply) {
  const sig = `${stepName}:${norm(reply).slice(0, 220)}`;
  if (sess._lastPromptSig === sig) {
    sess._repeatCount = (sess._repeatCount || 0) + 1;
  } else {
    sess._repeatCount = 0;
  }
  sess._lastPromptSig = sig;
  return sess._repeatCount >= 1;
}

// ------------------------------
// Debug (optional)
// ------------------------------
const DEBUG_ENABLED = String(process.env.DEBUG || "").toLowerCase() === "true";
let LAST_DEBUG = null;

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
// Response helper
// ------------------------------
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

  // PATCH v1.54: repair lane from meta if session is general/empty
  {
    const inLane = cleanLane(incomingMeta.currentLane);
    const inLast = cleanLane(incomingMeta.lastDomain);

    if (!cleanLane(sess.currentLane)) sess.currentLane = "general";
    if (!cleanLane(sess.lastDomain)) sess.lastDomain = "general";

    if ((sess.currentLane === "general" || sess.currentLane === "") && inLane && inLane !== "general") {
      sess.currentLane = inLane;
    }
    if ((sess.lastDomain === "general" || sess.lastDomain === "") && inLast && inLast !== "general") {
      sess.lastDomain = inLast;
    }
  }

  // Keep chart stable
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
  if (cmd.cmd === "reset_lane") {
    sess.currentLane = "general";
    sess.lastDomain = "general";
    saveSession(sid, sess);
    return send(res, sid, sess, "lane_reset", `Reset. Pick a lane: Music, TV, News Canada, or Sponsors.`, requestId);
  }
  if (cmd.cmd === "clear_music") {
    sess.laneDetail = { chart: sess.laneDetail.chart || DEFAULT_CHART };
    saveSession(sid, sess);
    return send(res, sid, sess, "music_cleared", `Cleared music slots. Give me an artist + year (or a song title).`, requestId);
  }

  // Lane decision (only if lane not already locked)
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
      // PATCH v1.54: plain artist/title should still land in music
      if (isMusicCandidate(userText)) decidedLane = "music_history";
      else if (t.includes("music") || t.includes("chart") || t.includes("hot 100") || t.includes("billboard")) decidedLane = "music_history";
      else if (t.includes("tv")) decidedLane = "tv";
      else if (t.includes("news")) decidedLane = "news_canada";
      else if (t.includes("sponsor")) decidedLane = "sponsors";
    }

    if (decidedLane && cleanLane(decidedLane)) {
      sess.currentLane = cleanLane(decidedLane) || "general";
    }
  }

  // ------------------------------
  // MUSIC LANE
  // ------------------------------
  if (sess.currentLane === "music_history") {
    sess.lastDomain = "music_history";

    // slot fill
    const year = extractYear(userText);
    if (year) sess.laneDetail.year = year;

    const chartFromText = resolveChartFromText(userText);
    if (chartFromText) sess.laneDetail.chart = chartFromText;
    sess.laneDetail.chart ||= DEFAULT_CHART;

    let a = detectArtist(userText) || inferArtistFallback(userText);
    let ti = detectTitle(userText) || inferTitleFallback(userText);

    // If user typed "Artist - Title", capture both
    const dash = String(userText || "").match(/^(.{2,60})\s*[-:—]\s*(.{2,90})$/);
    if (dash) {
      a = a || String(dash[1]).trim();
      ti = ti || String(dash[2]).trim();
    }

    // Prevent artist being mis-stored as title
    if (a && ti && norm(a) === norm(ti)) {
      ti = null;
    }

    // Apply slots (non-destructive)
    if (a && !sess.laneDetail.artist) sess.laneDetail.artist = a;
    if (ti && !sess.laneDetail.title) sess.laneDetail.title = ti;

    const haveArtist = !!sess.laneDetail.artist;
    const haveYear = !!sess.laneDetail.year;
    const haveTitle = !!sess.laneDetail.title;

    // numeric pick resolution
    const msgN = norm(userText);
    const pick = msgN.match(/^\b([1-5])\b$/);
    if (pick && Array.isArray(sess.laneDetail._lastList) && sess.laneDetail._lastList.length) {
      const idx = Number(pick[1]) - 1;
      const chosen = sess.laneDetail._lastList[idx];
      if (chosen) {
        sess.laneDetail.artist = chosen.artist || sess.laneDetail.artist;
        sess.laneDetail.title = chosen.title || sess.laneDetail.title;
        sess.laneDetail.year = chosen.year || sess.laneDetail.year;

        const best = pickBestMoment({
          artist: sess.laneDetail.artist,
          title: sess.laneDetail.title,
          year: sess.laneDetail.year,
          chart: sess.laneDetail.chart,
          rawUserText: userText
        });

        const reply = best
          ? formatMusicReply(best, sess.laneDetail)
          : `Locked: ${sess.laneDetail.artist} — "${sess.laneDetail.title}" (${sess.laneDetail.year || "year unknown"}). Next action: ask for #1 date or try another song.`;

        saveSession(sid, sess);
        return send(res, sid, sess, "music_answer", reply, requestId);
      }
    }

    // Anchor gating: allow title-only OR artist+year
    const canAnchor = haveTitle || (haveArtist && haveYear);

    // Artist + year discovery mode
    if (haveArtist && haveYear && !haveTitle) {
      const aKey = norm(sess.laneDetail.artist);
      const yVal = Number(sess.laneDetail.year);
      const arr = MUSIC_INDEX.byArtistYear.get(`${aKey}|${yVal}`) || [];

      if (arr.length) {
        const top = arr.slice(0, 5);
        sess.laneDetail._lastList = top;
        const titles = top.map((m, i) => `${i + 1}) ${m.title}`).join("\n");
        const reply =
          `I found ${arr.length} matches for ${sess.laneDetail.artist} in ${yVal}.\n` +
          `Pick one by number or type the title:\n${titles}\n\n` +
          `Next action: reply “1–5” or type the exact title.`;

        saveSession(sid, sess);
        return send(res, sid, sess, "choose_title_from_artist_year", reply, requestId);
      }

      // if artist exists but year doesn't
      const allForArtist = MUSIC_INDEX.byArtist.get(aKey) || [];
      if (allForArtist.length) {
        const yrs = yearsForArtist(sess.laneDetail.artist).slice(0, 20);
        const yrsLine = yrs.length ? `Years I have for ${sess.laneDetail.artist}: ${yrs.join(", ")}` : "";
        const top = allForArtist
          .slice()
          .sort((x, y) => (Number(x.year || 0) - Number(y.year || 0)) || norm(x.title).localeCompare(norm(y.title)))
          .slice(0, 5);

        sess.laneDetail._lastList = top;
        const list = top.map((m, i) => `${i + 1}) ${m.title} (${m.year || "year unknown"})`).join("\n");

        const reply =
          `I don’t have a match for ${sess.laneDetail.artist} in ${yVal}, but I *do* have these for that artist:\n` +
          `${list}\n` +
          (yrsLine ? `\n${yrsLine}\n` : "\n") +
          `Next action: reply “1–5”, or give me a different year.`;

        saveSession(sid, sess);
        return send(res, sid, sess, "choose_title_artist_fallback", reply, requestId);
      }
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
        const reply = formatMusicReply(best, sess.laneDetail);
        saveSession(sid, sess);
        return send(res, sid, sess, "music_answer", reply, requestId);
      }

      let reply = `I didn’t find that exact match in the current card dump yet.`;
      const escalate = shouldEscalate(sess, "music_not_found", reply);

      if (!sess.laneDetail.year) {
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
    let reply = `To anchor the moment, give me an artist + year (or a song title).\nCurrent chart: ${sess.laneDetail.chart || DEFAULT_CHART}.`;
    const esc = shouldEscalate(sess, "awaiting_anchor", reply);
    if (esc) reply = `Give me either: artist + year, or a song title.`;

    saveSession(sid, sess);
    return send(res, sid, sess, "awaiting_anchor", reply, requestId);
  }

  // ------------------------------
  // Other lanes (stubs)
  // ------------------------------
  if (sess.currentLane === "tv") {
    sess.lastDomain = "tv";
    saveSession(sid, sess);
    return send(res, sid, sess, "tv_stub", `TV lane is live. Tell me the show and what you need (schedule, synopsis, sponsors, or a pitch).`, requestId);
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
