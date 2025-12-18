// ----------------------------------------------------------
// Sandblast Nyx Backend — Broadcast-Ready v1.29 (2025-12-17)
// Option B + Loop-Stop Hardening
//
// Additions vs v1.28:
// - HARD LOOP-BREAKER: if artist+year locked and title requested once already,
//   Nyx advances with "forced_anchor_without_title" instead of repeating.
// - MUSIC_DB_PATH env var support (switch DB without code edits).
// - CORS hardening (common headers, methods).
// ----------------------------------------------------------

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { classifyIntent } = require("./Utils/intentClassifier");
const musicKB = require("./Utils/musicKnowledge");

const app = express();
app.use(express.json({ limit: "1mb" }));

// CORS: permissive but stable
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
  })
);

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-broadcast-ready-v1.29-2025-12-17";
const MUSIC_DEFAULT_CHART = "Billboard Hot 100";

// -------------------------
// Debug (temporary, safe)
// -------------------------
let LAST_DEBUG = null;

app.post("/api/debug/echo", (req, res) => {
  const body = req.body || {};
  LAST_DEBUG = {
    at: new Date().toISOString(),
    headers: {
      "x-forwarded-for": req.headers["x-forwarded-for"],
      "user-agent": req.headers["user-agent"]
    },
    received: {
      message: body.message,
      meta: body.meta
    }
  };
  return res.json({ ok: true, build: BUILD_TAG, received: LAST_DEBUG.received });
});

app.get("/api/debug/last", (req, res) => {
  return res.json({ ok: true, build: BUILD_TAG, last: LAST_DEBUG });
});

// Health (support both to avoid "Cannot GET /api/health")
app.get("/health", (_, res) => res.json({ status: "ok", build: BUILD_TAG }));
app.get("/api/health", (_, res) => res.json({ status: "ok", build: BUILD_TAG }));

// -------------------------
// SERVER SESSION MEMORY
// -------------------------
/**
 * Session shape (stored server-side):
 * {
 *   laneDetail, mem, currentLane, lastDomain,
 *   stepIndex, lastReply, updatedAt,
 *   lastStepName, lastPromptSig
 * }
 */
const SESS = new Map();
const SESS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function nowMs() {
  return Date.now();
}
function cleanupSessions() {
  const cutoff = nowMs() - SESS_TTL_MS;
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
    // Allow DB path override without code changes
    // e.g. MUSIC_DB_PATH=Data/music_moments_v2_layer2.json
    if (process.env.MUSIC_DB_PATH && musicKB && typeof musicKB.setDbPath === "function") {
      musicKB.setDbPath(process.env.MUSIC_DB_PATH);
    }

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

// -------------------------
// Conversation "state" helpers
// -------------------------
function makeState(meta, laneDetail, stepName, advance) {
  const slots = {
    artist: laneDetail?.artist || null,
    year: laneDetail?.year || null,
    title: laneDetail?.title || null,
    chart: laneDetail?.chart || null
  };
  return {
    mode: meta?.currentLane || meta?.lastDomain || "general",
    step: stepName || "general",
    slots,
    advance: !!advance
  };
}

function promptSig(stepName, reply) {
  const s = `${stepName || ""}::${String(reply || "").slice(0, 120)}`;
  return norm(s).slice(0, 180);
}

function send(res, meta, laneDetail, stepName, reply, extraMeta = {}, advance = false) {
  const state = makeState(meta, laneDetail, stepName, advance);
  return res.json({
    ok: true,
    reply,
    state,
    meta: { ...(meta || {}), ...(extraMeta || {}), lastReply: reply }
  });
}

// -------------------------
// Session key logic
// -------------------------
function sessionKey(req, meta) {
  const sid = meta && meta.sessionId ? String(meta.sessionId).trim() : "";
  if (sid) return sid;

  const ua = String(req.headers["user-agent"] || "");
  const ip = String(req.headers["x-forwarded-for"] || req.ip || "");
  return `fallback:${ip}|${ua}`.slice(0, 220);
}

function mergeFromSession(reqMeta, sess) {
  const meta = { ...(reqMeta || {}) };
  meta.laneDetail = { ...(sess?.laneDetail || {}), ...(meta.laneDetail || {}) };
  meta.mem = { ...(sess?.mem || {}), ...(meta.mem || {}) };

  meta.currentLane = meta.currentLane || sess?.currentLane || "general";
  meta.lastDomain = meta.lastDomain || sess?.lastDomain || "general";
  meta.stepIndex = Number(meta.stepIndex || sess?.stepIndex || 0);
  meta.lastReply = meta.lastReply || sess?.lastReply || "";

  meta._lastStepName = meta._lastStepName || sess?.lastStepName || "";
  meta._lastPromptSig = meta._lastPromptSig || sess?.lastPromptSig || "";

  return meta;
}

function writeSession(k, meta, lastStepName, lastPromptSig) {
  SESS.set(k, {
    laneDetail: { ...(meta.laneDetail || {}) },
    mem: { ...(meta.mem || {}) },
    currentLane: meta.currentLane || meta.lastDomain || "general",
    lastDomain: meta.lastDomain || meta.currentLane || "general",
    stepIndex: Number(meta.stepIndex || 0),
    lastReply: meta.lastReply || "",
    lastStepName: String(lastStepName || ""),
    lastPromptSig: String(lastPromptSig || ""),
    updatedAt: nowMs()
  });
}

function applyLoopGuard(meta, intendedStep, intendedReply) {
  const lastStep = String(meta._lastStepName || "");
  const lastSig = String(meta._lastPromptSig || "");
  const sig = promptSig(intendedStep, intendedReply);

  if (intendedStep && lastStep && intendedStep === lastStep && sig && lastSig && sig === lastSig) {
    return { looped: true, sig };
  }
  return { looped: false, sig };
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
    const stepName = "choose_lane";
    const reply =
      "I’m doing well — thanks for asking. What would you like to explore today? (Music history, Sandblast TV, News Canada, or Sponsors)";

    const guard = applyLoopGuard(meta, stepName, reply);
    const finalReply = guard.looped
      ? "Quick reset: pick a lane — Music history, Sandblast TV, News Canada, or Sponsors."
      : reply;

    meta.stepIndex = stepIndex + 1;
    meta.mem = mem;
    meta.laneDetail = laneDetail;
    meta.lastDomain = meta.lastDomain || "general";

    meta._lastStepName = stepName;
    meta._lastPromptSig = guard.sig;
    writeSession(skey, meta, stepName, guard.sig);

    return send(res, meta, laneDetail, stepName, finalReply, {}, true);
  }

  // Explicit lane select
  const lane = resolveLaneSelect(clean);
  if (lane) {
    if (lane === "music_history" && !laneDetail.chart) laneDetail.chart = MUSIC_DEFAULT_CHART;

    let stepName = "lane_locked";
    let reply =
      lane === "music_history"
        ? "Music history locked. Give me an artist + year (or a song title)."
        : `Locked. What would you like to do in ${lane.replace("_", " ")}?`;

    const guard = applyLoopGuard(meta, stepName, reply);
    if (guard.looped && lane === "music_history") {
      stepName = "awaiting_anchor";
      reply = "Music history is on. Give me an artist + year, or just the song title.";
    }

    meta.stepIndex = stepIndex + 1;
    meta.currentLane = lane;
    meta.lastDomain = lane;
    meta.laneDetail = laneDetail;
    meta.mem = mem;

    meta._lastStepName = stepName;
    meta._lastPromptSig = promptSig(stepName, reply);
    writeSession(skey, meta, stepName, meta._lastPromptSig);

    return send(res, meta, laneDetail, stepName, reply, {}, true);
  }

  // Lane lock precedence: meta wins; classifier only if general
  let domain = meta.currentLane || meta.lastDomain || "general";
  if (domain === "general") {
    const raw = classifyIntent(clean);
    domain = raw?.domain || "general";
    if (domain === "general" && looksMusicHistory(clean)) domain = "music_history";
  }

  // -------------------------
  // Music lane (stateful, no loops)
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

    // Artist/title detection (slot lock: only fill if empty)
    const detectedArtist = resolveArtistAlias(clean) || detectArtist(clean);
    const detectedTitle = detectTitle(clean);

    if (detectedArtist && !laneDetail.artist) laneDetail.artist = detectedArtist;
    if (detectedTitle && !laneDetail.title) laneDetail.title = detectedTitle;

    // Era cue: if year locked and artist missing, ask for artist (and never re-ask year)
    if (containsEraCue(clean) && (yearInMsg || laneDetail.year) && !laneDetail.artist) {
      const y = yearInMsg || laneDetail.year;
      laneDetail.year = y;
      mem.musicYear = y;

      const stepName = "awaiting_artist";
      let reply = `${y} is a defining era cue. Pick an artist (The Supremes, Marvin Gaye, The Temptations) and I’ll anchor the chart moment.`;

      const guard = applyLoopGuard(meta, stepName, reply);
      if (guard.looped) reply = `Year ${y} is locked. Now give me the artist name so I can anchor the chart moment.`;

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      meta._lastStepName = stepName;
      meta._lastPromptSig = promptSig(stepName, reply);
      writeSession(skey, meta, stepName, meta._lastPromptSig);

      return send(res, meta, laneDetail, stepName, reply, {}, true);
    }

    // ✅ HARD LOOP-BREAKER:
    // If artist + year known and title missing AND we already asked for title once,
    // do NOT repeat. Advance with a forced anchor path.
    if (laneDetail.artist && laneDetail.year && !laneDetail.title) {
      const askedTitleBefore = String(meta._lastStepName || "") === "awaiting_title_or_intent";

      if (askedTitleBefore) {
        const stepName = "forced_anchor_without_title";

        const bestByArtistYear = safePickBestMoment(MUSIC_DB, {
          artist: laneDetail.artist,
          year: laneDetail.year
        });

        const fact =
          (bestByArtistYear && (bestByArtistYear.fact || bestByArtistYear.chart_fact)) ||
          `Locked: ${laneDetail.artist} (${laneDetail.year}). I can still anchor the era even without the exact title.`;

        const culture =
          (bestByArtistYear && (bestByArtistYear.culture || bestByArtistYear.cultural_moment)) ||
          `Cultural thread: this was a defining radio-era pocket for ${laneDetail.artist}.`;

        const next =
          `Next step: choose one — (1) give me the song title, (2) ask “biggest hit that year?”, or (3) switch chart (Billboard / UK / RPM / Top40Weekly).`;

        const reply =
          `Chart fact: ${fact} (${laneDetail.chart})\n` +
          `Cultural thread: ${culture}\n` +
          `Next step: ${next}`;

        meta.stepIndex = stepIndex + 1;
        meta.laneDetail = laneDetail;
        meta.mem = mem;

        meta._lastStepName = stepName;
        meta._lastPromptSig = promptSig(stepName, reply);
        writeSession(skey, meta, stepName, meta._lastPromptSig);

        return send(res, meta, laneDetail, stepName, reply, { loopGuard: true }, true);
      }

      // First time asking for title is acceptable
      const stepName = "awaiting_title_or_intent";
      let reply =
        `Locked: ${String(laneDetail.artist).toUpperCase()} in ${laneDetail.year}. ` +
        `Give me a song title, or ask “Was it #1?” and I’ll anchor the chart moment. ` +
        `(Current chart: ${laneDetail.chart})`;

      const guard = applyLoopGuard(meta, stepName, reply);
      if (guard.looped) {
        reply =
          `We already have ${String(laneDetail.artist).toUpperCase()} + ${laneDetail.year}. ` +
          `Next step is the song title (or ask “Was it #1?”).`;
      }

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      meta._lastStepName = stepName;
      meta._lastPromptSig = promptSig(stepName, reply);
      writeSession(skey, meta, stepName, meta._lastPromptSig);

      return send(res, meta, laneDetail, stepName, reply, {}, true);
    }

    // HARD GUARD B: #1 intent + artist known but missing year/title => ask only missing fields
    if (laneDetail.artist && hasNumberOneIntent(clean) && !laneDetail.year && !laneDetail.title) {
      const stepName = "awaiting_year_or_title";
      let reply =
        `Got it — ${String(laneDetail.artist).toUpperCase()} and “#1”. ` +
        `Give me a year (e.g., 1992) or a song title and I’ll anchor the chart moment. ` +
        `(Current chart: ${laneDetail.chart})`;

      const guard = applyLoopGuard(meta, stepName, reply);
      if (guard.looped) reply = `Next step: year or song title. (We’re already on ${String(laneDetail.chart)}.)`;

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      meta._lastStepName = stepName;
      meta._lastPromptSig = promptSig(stepName, reply);
      writeSession(skey, meta, stepName, meta._lastPromptSig);

      return send(res, meta, laneDetail, stepName, reply, {}, true);
    }

    // Attempt to pick best moment if we have enough info
    const best = safePickBestMoment(MUSIC_DB, {
      artist: laneDetail.artist,
      title: laneDetail.title,
      year: laneDetail.year
    });

    if (best) {
      const stepName = "moment_anchored";
      const fact = best.fact || best.chart_fact || "Anchor found.";
      const culture = best.culture || best.cultural_moment || "This was a defining radio-era moment for its sound and reach.";
      const next = best.next || best.next_step || "Want the exact chart week/date, or the full #1 timeline?";

      laneDetail.artist = best.artist || laneDetail.artist;
      laneDetail.title = best.title || laneDetail.title;
      laneDetail.year = best.year || laneDetail.year;
      laneDetail.chart = best.chart || laneDetail.chart;

      if (laneDetail.year) mem.musicYear = laneDetail.year;

      let reply =
        `Chart fact: ${fact} (${laneDetail.chart})\n` +
        `Cultural thread: ${culture}\n` +
        `Next step: ${next}`;

      const guard = applyLoopGuard(meta, stepName, reply);
      if (guard.looped) reply = `Anchor confirmed. Next step: do you want the exact chart week/date, or the full #1 timeline?`;

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      meta._lastStepName = stepName;
      meta._lastPromptSig = promptSig(stepName, reply);
      writeSession(skey, meta, stepName, meta._lastPromptSig);

      return send(res, meta, laneDetail, stepName, reply, {}, true);
    }

    // If we have artist only, ask year or title (never re-ask artist)
    if (laneDetail.artist && !laneDetail.year && !laneDetail.title) {
      const stepName = "awaiting_year_or_title";
      let reply =
        `Locked: ${String(laneDetail.artist).toUpperCase()}. ` +
        `Pick a year (e.g., 1992) or give me a song title and I’ll anchor the chart moment. ` +
        `(Current chart: ${laneDetail.chart})`;

      const guard = applyLoopGuard(meta, stepName, reply);
      if (guard.looped) reply = `Next step: year or song title. That’s all I need.`;

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      meta._lastStepName = stepName;
      meta._lastPromptSig = promptSig(stepName, reply);
      writeSession(skey, meta, stepName, meta._lastPromptSig);

      return send(res, meta, laneDetail, stepName, reply, {}, true);
    }

    // If we have year only, ask artist or title (never re-ask year)
    if (laneDetail.year && !laneDetail.artist && !laneDetail.title) {
      const stepName = "awaiting_artist_or_title";
      let reply =
        `Year locked: ${laneDetail.year}. Now give me the artist name or the song title to anchor the chart moment. ` +
        `(Current chart: ${laneDetail.chart})`;

      const guard = applyLoopGuard(meta, stepName, reply);
      if (guard.looped) reply = `Next step: artist or song title. We already have the year.`;

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      meta._lastStepName = stepName;
      meta._lastPromptSig = promptSig(stepName, reply);
      writeSession(skey, meta, stepName, meta._lastPromptSig);

      return send(res, meta, laneDetail, stepName, reply, {}, true);
    }

    // Default music prompt (only when nothing is known yet)
    {
      const stepName = "awaiting_anchor";
      let reply =
        `To anchor the moment, give me an artist + year (or a song title).\n\n` +
        `If you want a different chart, say: Billboard Hot 100, UK Singles, Canada RPM, or Top40Weekly. ` +
        `(Current: ${laneDetail.chart}).`;

      const guard = applyLoopGuard(meta, stepName, reply);
      if (guard.looped) reply = `Give me either: (1) Artist + year, or (2) Song title. That’s it.`;

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      meta._lastStepName = stepName;
      meta._lastPromptSig = promptSig(stepName, reply);
      writeSession(skey, meta, stepName, meta._lastPromptSig);

      return send(res, meta, laneDetail, stepName, reply, {}, false);
    }
  }

  // -------------------------
  // Other lanes (calm v1 prompts)
  // -------------------------
  if (domain === "tv") {
    const stepName = "tv_prompt";
    const reply = "Sandblast TV locked. What are we tuning: the grid, a specific show, or a programming block?";

    meta.stepIndex = stepIndex + 1;
    meta.currentLane = "tv";
    meta.lastDomain = "tv";
    meta.laneDetail = laneDetail;
    meta.mem = mem;

    meta._lastStepName = stepName;
    meta._lastPromptSig = promptSig(stepName, reply);
    writeSession(skey, meta, stepName, meta._lastPromptSig);

    return send(res, meta, laneDetail, stepName, reply, {}, true);
  }

  if (domain === "news_canada") {
    const stepName = "news_prompt";
    const reply = "News Canada locked. What’s the story topic and who is the target audience?";

    meta.stepIndex = stepIndex + 1;
    meta.currentLane = "news_canada";
    meta.lastDomain = "news_canada";
    meta.laneDetail = laneDetail;
    meta.mem = mem;

    meta._lastStepName = stepName;
    meta._lastPromptSig = promptSig(stepName, reply);
    writeSession(skey, meta, stepName, meta._lastPromptSig);

    return send(res, meta, laneDetail, stepName, reply, {}, true);
  }

  if (domain === "sponsors") {
    const stepName = "sponsors_prompt";
    const reply = "Sponsors locked. Say “sponsor package” or tell me the brand + tier (Starter/Growth/Premium) and I’ll generate deliverables.";

    meta.stepIndex = stepIndex + 1;
    meta.currentLane = "sponsors";
    meta.lastDomain = "sponsors";
    meta.laneDetail = laneDetail;
    meta.mem = mem;

    meta._lastStepName = stepName;
    meta._lastPromptSig = promptSig(stepName, reply);
    writeSession(skey, meta, stepName, meta._lastPromptSig);

    return send(res, meta, laneDetail, stepName, reply, {}, true);
  }

  // General fallback
  {
    const stepName = "general_fallback";
    const reply = "Understood. What would you like to do next?";

    meta.stepIndex = stepIndex + 1;
    meta.lastDomain = meta.lastDomain || "general";
    meta.laneDetail = laneDetail;
    meta.mem = mem;

    meta._lastStepName = stepName;
    meta._lastPromptSig = promptSig(stepName, reply);
    writeSession(skey, meta, stepName, meta._lastPromptSig);

    return send(res, meta, laneDetail, stepName, reply, {}, false);
  }
});

app.listen(PORT, () => {
  console.log(`[Nyx] ${BUILD_TAG} running on port ${PORT}`);
});
