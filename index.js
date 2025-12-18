/**
 * index.js — Nyx Broadcast Backend (Bulletproof)
 * Build: nyx-bulletproof-v1.50-2025-12-18
 *
 * Key guarantees:
 * - Lane lock: never bounces back to general when music_history is active
 * - Slot-filling precedence: artist/title/year captured even without keywords
 * - Anti-repeat escalation: won’t ask the same question endlessly
 * - Scales to ~1500+ music moments with indexes
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
const BUILD_TAG = "nyx-bulletproof-v1.50-2025-12-18";
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
  byArtist: new Map(),      // norm(artist) -> [moment]
  byTitle: new Map(),       // norm(title)  -> [moment]
  byArtistYear: new Map(),  // norm(artist)+"|"+year -> [moment]
  byYear: new Map()         // year -> [moment]
};

function idxPush(map, key, val) {
  if (!key) return;
  const arr = map.get(key);
  if (arr) arr.push(val);
  else map.set(key, [val]);
}

function buildMusicIndexes() {
  // idempotent rebuild
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
  // Prefer KB picker if available
  try {
    if (musicKB && typeof musicKB.pickBestMoment === "function") {
      return musicKB.pickBestMoment(MUSIC_DB, fields);
    }
  } catch {}

  const a = fields.artist ? norm(fields.artist) : null;
  const t = fields.title ? norm(fields.title) : null;
  const y = fields.year ? Number(fields.year) : null;

  // fastest: artist+year
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

  // title only
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

  // artist only
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

  // year only
  if (y) {
    const arr = MUSIC_INDEX.byYear.get(String(y));
    if (arr && arr.length) return arr[0];
  }

  return null;
}

function formatMusicReply(m, fields) {
  // Keep it short, forward-moving, and “broadcast-ready”
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

  // next action always
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
  return sess._repeatCount >= 1; // escalate on 2nd time
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

  // Keep chart stable
  sess.laneDetail = sess.laneDetail || {};
  sess.laneDetail.chart = sess.laneDetail.chart || DEFAULT_CHART;

  // Basic debug snapshot
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

  // Commands (lane/year resets, etc.)
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

  // ---------
  // HARD RULE: if music_history is active, DO NOT bounce to general routing
  // ---------
  const laneAlreadyLocked = sess.currentLane === "music_history";

  // If lane not locked, attempt routing
  if (!laneAlreadyLocked) {
    const chartFromText = resolveChartFromText(userText);
    if (chartFromText) sess.laneDetail.chart = chartFromText;

    let decidedLane = null;

    // classifier first (if present)
    if (classifyIntent) {
      try {
        const c = classifyIntent(userText);
        // accept only explicit lanes; otherwise ignore
        if (c && typeof c === "string") decidedLane = c;
      } catch {}
    }

    // heuristic lane decisions
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

    // slot fill
    const year = extractYear(userText);
    if (year) sess.laneDetail.year = year;

    const chartFromText = resolveChartFromText(userText);
    if (chartFromText) sess.laneDetail.chart = chartFromText;

    let a = detectArtist(userText) || inferArtistFallback(userText);
    let ti = detectTitle(userText) || inferTitleFallback(userText);

    // If user typed "Artist - Title", we capture both
    const dash = String(userText || "").match(/^(.{2,40})\s*[-:]\s*(.{2,80})$/);
    if (dash) {
      a = a || String(dash[1]).trim();
      ti = ti || String(dash[2]).trim();
    }

    if (a && !sess.laneDetail.artist) sess.laneDetail.artist = a;
    if (ti && !sess.laneDetail.title) sess.laneDetail.title = ti;

    // Decide next ask
    const needArtist = !sess.laneDetail.artist;
    const needTitle = !sess.laneDetail.title;

    // If we have enough, answer
    if (!needArtist || !needTitle) {
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

      // Not found: ask for one more constraint, but DON’T reset the lane
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
        reply += `\nExample: Peter Cetera - Glory of Love 1986`;
      }

      saveSession(sid, sess);
      return send(res, sid, sess, "music_not_found", reply, requestId);
    }

    // Ask for missing slots (anti-loop phrasing)
    let reply = "";
    if (needArtist && needTitle) reply = `Give me either the artist name or the song title.`;
    else if (needArtist) reply = `Give me the artist name.`;
    else reply = `Give me the song title.`;

    const escalate = shouldEscalate(sess, "music_need_slot", reply);
    if (escalate) {
      reply += `\nFastest format: Artist - Title (optional year). Example: Madonna - Like a Virgin 1984`;
    }

    saveSession(sid, sess);
    return send(res, sid, sess, "music_need_slot", reply, requestId);
  }

  // ------------------------------
  // Non-music lanes (basic for now)
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

  // General fallback (only when lane truly isn’t set)
  sess.currentLane = sess.currentLane || "general";
  sess.lastDomain = "general";
  saveSession(sid, sess);
  return send(
    res,
    sid,
    sess,
    "general_fallback",
    `Pick a lane: Music, TV, News Canada, or Sponsors.`,
    requestId
  );
});

// ------------------------------
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Nyx] Backend up on :${PORT} build=${BUILD_TAG} debug=${DEBUG_ENABLED ? "true" : "false"}`);
});
