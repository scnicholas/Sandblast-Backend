// ----------------------------------------------------------
// Sandblast Nyx Backend — Broadcast-Ready v1.26 (2025-12-16)
// Fixes / Upgrades:
// - SERVER-SIDE SESSION MEMORY (in-memory Map keyed by meta.sessionId)
//   => Eliminates loops even if widget meta doesn't round-trip correctly.
// - Lane lock precedence: meta.currentLane/meta.lastDomain overrides classifier
// - Chart switching: Billboard / UK Singles / Canada RPM / Top40Weekly
// - Slot-fill: ask only missing year/title (esp. #1 queries)
// - HARD GUARD: artist detected + year known => ALWAYS advance
// - Sticky memory: year stored in BOTH laneDetail.year and mem.musicYear
// - meta.lastReply stamped on EVERY response
// - /health and /api/health both supported
// ----------------------------------------------------------

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { classifyIntent } = require("./Utils/intentClassifier");
const musicKB = require("./Utils/musicKnowledge");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-broadcast-ready-v1.26-2025-12-16";
const MUSIC_DEFAULT_CHART = "Billboard Hot 100";

// -------------------------
// SERVER SESSION MEMORY
// -------------------------
const SESS = new Map(); // key -> { laneDetail, mem, currentLane, lastDomain, stepIndex, lastReply, updatedAt }
const SESS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function now() { return Date.now(); }

function cleanupSessions() {
  const cutoff = now() - SESS_TTL_MS;
  for (const [k, v] of SESS.entries()) {
    if (!v || !v.updatedAt || v.updatedAt < cutoff) SESS.delete(k);
  }
}
setInterval(cleanupSessions, 15 * 60 * 1000).unref?.();

// -------------------------
// Music DB
// -------------------------
let MUSIC_DB = { moments: [] };
let MUSIC_ARTISTS = [];
let MUSIC_TITLES = [];

(function loadMusicDbOnce() {
  try {
    MUSIC_DB =
      (musicKB && typeof musicKB.loadDb === "function")
        ? musicKB.loadDb()
        : { moments: [] };

    const m = (MUSIC_DB && MUSIC_DB.moments) || [];
    MUSIC_ARTISTS = [...new Set(m.map(x => x.artist).filter(Boolean))];
    MUSIC_TITLES = [...new Set(m.map(x => x.title).filter(Boolean))];
  } catch {
    MUSIC_DB = { moments: [] };
    MUSIC_ARTISTS = [];
    MUSIC_TITLES = [];
  }
})();

// -------------------------
// Helpers
// -------------------------
const norm = s =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractYear = text => {
  try {
    if (musicKB && typeof musicKB.extractYear === "function") return musicKB.extractYear(text);
  } catch {}
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
};

const isGreeting = t => {
  const x = norm(t);
  return (
    ["hi", "hello", "hey", "yo", "hi nyx", "hello nyx", "hey nyx", "nyx"].includes(x) ||
    x.startsWith("good morning") ||
    x.startsWith("good afternoon") ||
    x.startsWith("good evening")
  );
};

const isSmallTalk = t => {
  const x = norm(t);
  return (
    /^how (are|r) you\b/.test(x) ||
    /^how('?s|s) it going\b/.test(x) ||
    /^what('?s|s) up\b/.test(x) ||
    /^how('?s|s) your day\b/.test(x)
  );
};

const resolveLaneSelect = text => {
  const t = norm(text);
  if (["music", "music history", "music_history"].includes(t)) return "music_history";
  if (["tv", "sandblast tv", "sandblasttv"].includes(t)) return "tv";
  if (["news", "news canada", "news_canada"].includes(t)) return "news_canada";
  if (["sponsors", "sponsor", "sponsorship"].includes(t)) return "sponsors";
  return null;
};

const resolveArtistAlias = t => {
  const n = norm(t);
  if (/\bwhitney\b/.test(n)) return "Whitney Houston";
  if (/\bmadonna\b/.test(n)) return "Madonna";
  if (/\bprince\b/.test(n)) return "Prince";
  if (/\bmj\b/.test(n)) return "Michael Jackson";
  return null;
};

const detectArtist = text => {
  const t = norm(text);
  if (!t) return null;
  for (const a of MUSIC_ARTISTS) {
    const na = norm(a);
    if (na && (t === na || t.includes(na))) return a;
  }
  return null;
};

const detectTitle = text => {
  const t = norm(text);
  if (!t) return null;
  for (const s of MUSIC_TITLES) {
    const ns = norm(s);
    if (ns && (t === ns || t.includes(ns))) return s;
  }
  return null;
};

const hasNumberOneIntent = t => /#1|# 1|number one|no\.?\s?1|no 1/.test(norm(t));

const containsEraCue = t =>
  ["motown", "disco", "grunge", "new wave", "hip hop", "hip-hop", "soul", "r&b", "rb", "british invasion"]
    .some(e => norm(t).includes(norm(e)));

const looksMusicHistory = text => {
  const t = norm(text);
  try {
    if (musicKB && typeof musicKB.looksLikeMusicHistory === "function") {
      if (musicKB.looksLikeMusicHistory(t)) return true;
    }
  } catch {}
  return (
    t.includes("billboard") ||
    t.includes("hot 100") ||
    t.includes("chart") ||
    t.includes("charts") ||
    t.includes("#1") ||
    t.includes("number one") ||
    t.includes("no. 1") ||
    t.includes("peak") ||
    t.includes("weeks at") ||
    t.includes("top40weekly") ||
    t.includes("top 40") ||
    t.includes("uk singles") ||
    t.includes("rpm")
  );
};

const resolveChartFromText = (text) => {
  const t = norm(text);
  if (t.includes("uk") || t.includes("uk singles") || t.includes("official charts")) return "UK Singles Chart";
  if (t.includes("canada") || t.includes("rpm")) return "Canada RPM";
  if (t.includes("top40weekly") || t.includes("top 40 weekly") || t.includes("top 40")) return "Top40Weekly";
  if (t.includes("billboard") || t.includes("hot 100")) return "Billboard Hot 100";
  return null;
};

function safePickBestMoment(db, fields) {
  try {
    if (musicKB && typeof musicKB.pickBestMoment === "function") {
      return musicKB.pickBestMoment(db, fields);
    }
  } catch {}

  const moments = (db && db.moments) || [];
  const na = fields.artist ? norm(fields.artist) : null;
  const nt = fields.title ? norm(fields.title) : null;
  const y = fields.year ? Number(fields.year) : null;

  let c = moments;
  if (na) c = c.filter(m => norm(m.artist) === na);
  if (nt) c = c.filter(m => norm(m.title) === nt);
  if (y) c = c.filter(m => Number(m.year) === y);

  if (!c.length && nt) c = moments.filter(m => norm(m.title) === nt);
  if (!c.length && na) c = moments.filter(m => norm(m.artist) === na);
  return c[0] || null;
}

// Reply helper (stamps lastReply always)
function send(res, meta, reply, extra = {}) {
  return res.json({
    ok: true,
    reply,
    meta: { ...(meta || {}), ...(extra || {}), lastReply: reply }
  });
}

// Session key fallback (if widget fails to send sessionId)
function sessionKey(req, meta) {
  const sid = meta && meta.sessionId ? String(meta.sessionId) : "";
  if (sid) return sid;
  const ua = String(req.headers["user-agent"] || "");
  const ip = String(req.headers["x-forwarded-for"] || req.ip || "");
  return `fallback:${ip}|${ua}`.slice(0, 220);
}

function mergeFromSession(reqMeta, sess) {
  // Server-side truth fills gaps; client meta can override "access/mode/sessionId" only.
  const meta = { ...(reqMeta || {}) };
  meta.laneDetail = { ...(sess?.laneDetail || {}), ...(meta.laneDetail || {}) };
  meta.mem = { ...(sess?.mem || {}), ...(meta.mem || {}) };

  meta.currentLane = meta.currentLane || sess?.currentLane || "general";
  meta.lastDomain = meta.lastDomain || sess?.lastDomain || "general";
  meta.stepIndex = Number(meta.stepIndex || sess?.stepIndex || 0);
  meta.lastReply = meta.lastReply || sess?.lastReply || "";

  return meta;
}

function writeSession(k, meta) {
  SESS.set(k, {
    laneDetail: { ...(meta.laneDetail || {}) },
    mem: { ...(meta.mem || {}) },
    currentLane: meta.currentLane || meta.lastDomain || "general",
    lastDomain: meta.lastDomain || meta.currentLane || "general",
    stepIndex: Number(meta.stepIndex || 0),
    lastReply: meta.lastReply || "",
    updatedAt: now()
  });
}

// -------------------------
// Main endpoint
// -------------------------
app.post("/api/sandblast-gpt", (req, res) => {
  const { message, meta: reqMeta = {} } = req.body || {};
  const clean = String(message || "").trim();

  const skey = sessionKey(req, reqMeta);
  const sess = SESS.get(skey);
  let meta = mergeFromSession(reqMeta, sess);

  let laneDetail = { ...(meta.laneDetail || {}) };
  let mem = { ...(meta.mem || {}) };
  const stepIndex = Number(meta.stepIndex || 0);

  // Greetings / small talk
  if (isGreeting(clean) || isSmallTalk(clean)) {
    meta.stepIndex = stepIndex + 1;
    meta.mem = mem;
    meta.laneDetail = laneDetail;
    meta.lastDomain = meta.lastDomain || "general";
    writeSession(skey, meta);

    return send(
      res,
      meta,
      "I’m doing well — thanks for asking. What would you like to explore today? (Music history, Sandblast TV, News Canada, or Sponsors)"
    );
  }

  // Explicit lane select
  const lane = resolveLaneSelect(clean);
  if (lane) {
    if (lane === "music_history" && !laneDetail.chart) laneDetail.chart = MUSIC_DEFAULT_CHART;

    const reply =
      lane === "music_history"
        ? "Music history locked. Give me an artist + year (or a song title)."
        : `Locked. What would you like to do in ${lane.replace("_", " ")}?`;

    meta.stepIndex = stepIndex + 1;
    meta.currentLane = lane;
    meta.lastDomain = lane;
    meta.laneDetail = laneDetail;
    meta.mem = mem;

    writeSession(skey, meta);
    return send(res, meta, reply);
  }

  // Lane lock precedence: meta wins; classifier only used if general
  let domain = meta.currentLane || meta.lastDomain || "general";
  if (domain === "general") {
    const raw = classifyIntent(clean);
    domain = raw?.domain || "general";
    if (domain === "general" && looksMusicHistory(clean)) domain = "music_history";
  }

  // -------------------------
  // Music lane
  // -------------------------
  if (domain === "music_history") {
    meta.currentLane = "music_history";
    meta.lastDomain = "music_history";

    // Chart switching
    const chart = resolveChartFromText(clean);
    if (chart) laneDetail.chart = chart;
    if (!laneDetail.chart) laneDetail.chart = MUSIC_DEFAULT_CHART;

    // Restore sticky year if laneDetail lost it
    if (!laneDetail.year && mem.musicYear) laneDetail.year = Number(mem.musicYear) || laneDetail.year;

    // YEAR LOCK (always)
    const yearInMsg = extractYear(clean);
    if (yearInMsg) {
      laneDetail.year = yearInMsg;
      mem.musicYear = yearInMsg;
    } else if (laneDetail.year) {
      mem.musicYear = laneDetail.year;
    }

    // Era cue: lock year immediately and ask for artist
    if (containsEraCue(clean) && (yearInMsg || laneDetail.year) && !laneDetail.artist) {
      const y = yearInMsg || laneDetail.year;
      laneDetail.year = y;
      mem.musicYear = y;

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      writeSession(skey, meta);
      return send(
        res,
        meta,
        `${y} Motown is a defining era. Pick an artist (The Supremes, Marvin Gaye, The Temptations) and I’ll anchor the chart moment.`
      );
    }

    // Detect artist/title
    const detectedArtist = resolveArtistAlias(clean) || detectArtist(clean);
    const detectedTitle = detectTitle(clean);

    if (detectedArtist && !laneDetail.artist) laneDetail.artist = detectedArtist;
    if (detectedTitle && !laneDetail.title) laneDetail.title = detectedTitle;

    // HARD GUARD: if artist is known + year is known, ALWAYS advance
    if (laneDetail.artist && laneDetail.year && !laneDetail.title) {
      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      writeSession(skey, meta);
      return send(
        res,
        meta,
        `Got it — ${String(laneDetail.artist).toUpperCase()} in ${laneDetail.year}. Give me a song title, or ask “Was it #1?” and I’ll anchor the chart moment.`
      );
    }

    // #1 slot-fill: ask only what's missing
    if (laneDetail.artist && hasNumberOneIntent(clean) && !laneDetail.year && !laneDetail.title) {
      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      writeSession(skey, meta);
      return send(
        res,
        meta,
        `Got it — ${String(laneDetail.artist).toUpperCase()} #1. Give me a year (e.g., 1992) or a song title and I’ll anchor the chart moment.`
      );
    }

    // Attempt to pick best moment
    const best = safePickBestMoment(MUSIC_DB, {
      artist: laneDetail.artist,
      title: laneDetail.title,
      year: laneDetail.year
    });

    if (best) {
      const fact = best.fact || best.chart_fact || "Anchor found.";
      const culture = best.culture || best.cultural_moment || "This was a defining radio-era moment for its sound and reach.";
      const next = best.next || best.next_step || "Want the exact chart week/date, or the full #1 timeline?";

      laneDetail.artist = best.artist || laneDetail.artist;
      laneDetail.title = best.title || laneDetail.title;
      laneDetail.year = best.year || laneDetail.year;
      laneDetail.chart = best.chart || laneDetail.chart;
      if (laneDetail.year) mem.musicYear = laneDetail.year;

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      writeSession(skey, meta);
      return send(
        res,
        meta,
        `Chart fact: ${fact} (${laneDetail.chart})\nCultural thread: ${culture}\nNext step: ${next}`
      );
    }

    // If we have artist but missing year/title, advance cleanly
    if (laneDetail.artist && !laneDetail.year && !laneDetail.title) {
      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      writeSession(skey, meta);
      return send(
        res,
        meta,
        `Got it — ${String(laneDetail.artist).toUpperCase()}. Pick a year (e.g., 1992) or give me a song title and I’ll anchor the chart moment.\n\nNext step: give me a year (e.g., 1992) or a song title. (Current: ${laneDetail.chart}).`
      );
    }

    // Default music prompt
    meta.stepIndex = stepIndex + 1;
    meta.laneDetail = laneDetail;
    meta.mem = mem;

    writeSession(skey, meta);
    return send(
      res,
      meta,
      `To anchor the moment, give me an artist + year (or a song title).\n\nNext step: give me an artist + year (or a song title). If you want a different chart, say: Billboard Hot 100, UK Singles, Canada RPM, or Top40Weekly. (Current: ${laneDetail.chart}).`
    );
  }

  // -------------------------
  // Other lanes (calm v1 prompts)
  // -------------------------
  if (domain === "tv") {
    meta.stepIndex = stepIndex + 1;
    meta.currentLane = "tv";
    meta.lastDomain = "tv";
    meta.laneDetail = laneDetail;
    meta.mem = mem;

    writeSession(skey, meta);
    return send(res, meta, "Sandblast TV locked. What are we tuning: the grid, a specific show, or a programming block?");
  }

  if (domain === "news_canada") {
    meta.stepIndex = stepIndex + 1;
    meta.currentLane = "news_canada";
    meta.lastDomain = "news_canada";
    meta.laneDetail = laneDetail;
    meta.mem = mem;

    writeSession(skey, meta);
    return send(res, meta, "News Canada locked. What’s the story topic and who is the target audience?");
  }

  if (domain === "sponsors") {
    meta.stepIndex = stepIndex + 1;
    meta.currentLane = "sponsors";
    meta.lastDomain = "sponsors";
    meta.laneDetail = laneDetail;
    meta.mem = mem;

    writeSession(skey, meta);
    return send(res, meta, "Sponsors locked. Say “sponsor package” or tell me the brand + tier (Starter/Growth/Premium) and I’ll generate deliverables.");
  }

  // General fallback
  meta.stepIndex = stepIndex + 1;
  meta.lastDomain = meta.lastDomain || "general";
  meta.laneDetail = laneDetail;
  meta.mem = mem;

  writeSession(skey, meta);
  return send(res, meta, "Understood. What would you like to do next?");
});

// Health (both endpoints)
app.get("/health", (_, res) => res.json({ status: "ok", build: BUILD_TAG }));
app.get("/api/health", (_, res) => res.json({ status: "ok", build: BUILD_TAG }));

app.listen(PORT, () => {
  console.log(`[Nyx] ${BUILD_TAG} running on port ${PORT}`);
});
