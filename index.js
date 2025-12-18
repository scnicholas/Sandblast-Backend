// ----------------------------------------------------------
// Sandblast Nyx Backend — Broadcast-Ready v1.31 (2025-12-17)
// Option B: State + Slot-Locking + Loop Guard
// NEW in v1.31:
// - Server self-heals sessionId: generates + returns one if missing
// - Session key ALWAYS prefers meta.sessionId (stable continuity)
// - Music lane has "anti-loop escalation": if we already have artist+year,
//   we stop re-asking and return an anchor even without title.
// ----------------------------------------------------------

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const { classifyIntent } = require("./Utils/intentClassifier");
const musicKB = require("./Utils/musicKnowledge");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-broadcast-ready-v1.31-2025-12-17";
const MUSIC_DEFAULT_CHART = "Billboard Hot 100";

// -------------------------
// Debug (safe)
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

// Health (support both)
app.get("/health", (_, res) => res.json({ status: "ok", build: BUILD_TAG }));
app.get("/api/health", (_, res) => res.json({ status: "ok", build: BUILD_TAG }));

// -------------------------
// SERVER SESSION MEMORY
// -------------------------
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
  const s = `${stepName || ""}::${String(reply || "").slice(0, 140)}`;
  return norm(s).slice(0, 200);
}

// Reply helper (adds state + stamps lastReply always + always returns sessionId)
function send(res, meta, laneDetail, stepName, reply, extraMeta = {}, advance = false) {
  const state = makeState(meta, laneDetail, stepName, advance);
  const outMeta = { ...(meta || {}), ...(extraMeta || {}), lastReply: reply };
  if (!outMeta.sessionId) outMeta.sessionId = meta.sessionId; // guarantee present
  return res.json({
    ok: true,
    reply,
    state,
    meta: outMeta
  });
}

// -------------------------
// Session key logic
// -------------------------
function genSessionId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `sid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function sessionKey(req, meta) {
  const sid = meta && meta.sessionId ? String(meta.sessionId).trim() : "";
  if (sid) return sid;

  // fallback (should be rare now, because we self-generate sessionId)
  const ua = String(req.headers["user-agent"] || "");
  const ip = String(req.headers["x-forwarded-for"] || req.ip || "");
  return `fallback:${ip}|${ua}`.slice(0, 220);
}

function mergeFromSession(reqMeta, sess) {
  const meta = { ...(reqMeta || {}) };

  // Self-heal sessionId if missing
  if (!meta.sessionId) meta.sessionId = genSessionId();

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

// Loop guard: if we are about to repeat same step+prompt, force a safer alternative step
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

  // Merge session (and self-generate sessionId if missing)
  const preKey = sessionKey(req, reqMeta);
  const sess = SESS.get(preKey);
  let meta = mergeFromSession(reqMeta, sess);

  // After merge, sessionId may have been generated. Use that as the key.
  const skey = sessionKey(req, meta);

  // (Optional) Keep debug trace lightweight
  LAST_DEBUG = {
    at: new Date().toISOString(),
    received: { message: clean, meta: { sessionId: meta.sessionId, currentLane: meta.currentLane, lastDomain: meta.lastDomain } }
  };

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
    return send(res, meta, laneDetail, stepName, finalReply, { build: BUILD_TAG }, true);
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
    return send(res, meta, laneDetail, stepName, reply, { build: BUILD_TAG }, true);
  }

  // Lane lock precedence: meta wins; classifier only if general
  let domain = meta.currentLane || meta.lastDomain || "general";
  if (domain === "general") {
    const raw = classifyIntent(clean);
    domain = raw?.domain || "general";
    if (domain === "general" && looksMusicHistory(clean)) domain = "music_history";
  }

  // -------------------------
  // Music lane (stateful, loop-proof)
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
    const detectedArtist = resolveArtistAlias(clean) || detectArtist(clean) || (musicKB.detectArtist?.(clean) || null);
    const detectedTitle = detectTitle(clean) || (musicKB.detectTitle?.(clean) || null);

    if (detectedArtist && !laneDetail.artist) laneDetail.artist = detectedArtist;
    if (detectedTitle && !laneDetail.title) laneDetail.title = detectedTitle;

    // Era cue: if year locked and artist missing, ask for artist (never re-ask year)
    if (containsEraCue(clean) && (yearInMsg || laneDetail.year) && !laneDetail.artist) {
      const y = yearInMsg || laneDetail.year;
      laneDetail.year = y;
      mem.musicYear = y;

      const stepName = "awaiting_artist";
      let reply = `${y} is a defining era cue. Pick an artist and I’ll anchor the chart moment.`;

      const guard = applyLoopGuard(meta, stepName, reply);
      if (guard.looped) reply = `Year ${y} is locked. Now give me the artist name so I can anchor the chart moment.`;

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      meta._lastStepName = stepName;
      meta._lastPromptSig = promptSig(stepName, reply);

      writeSession(skey, meta, stepName, meta._lastPromptSig);
      return send(res, meta, laneDetail, stepName, reply, { build: BUILD_TAG }, true);
    }

    // If we have artist+year but no title: do NOT loop. Escalate to anchor.
    if (laneDetail.artist && laneDetail.year && !laneDetail.title) {
      const stepName = "awaiting_title_or_intent";
      let reply =
        `Locked: ${String(laneDetail.artist).toUpperCase()} (${laneDetail.year}). ` +
        `Give me the song title, or ask “Was it #1?” ` +
        `(Current chart: ${laneDetail.chart})`;

      const guard = applyLoopGuard(meta, stepName, reply);

      // If we detect we're repeating ourselves OR user asked #1 intent, we return an anchor immediately.
      if (guard.looped || hasNumberOneIntent(clean)) {
        const best = safePickBestMoment(MUSIC_DB, {
          artist: laneDetail.artist,
          year: laneDetail.year
        });

        const fact =
          best?.fact ||
          best?.chart_fact ||
          `${laneDetail.artist} — ${laneDetail.year} (anchor ready; exact #1 verification can be added in Layer 2).`;

        const culture =
          best?.culture ||
          best?.cultural_moment ||
          "Cultural thread: this was a defining radio-era pocket for the artist.";

        const next =
          best?.next ||
          best?.next_step ||
          "Next step: give the song title (for precision) or ask for the #1 run / weeks-on-chart.";

        const forcedStep = "forced_anchor_without_title";
        const forcedReply =
          `Chart fact: ${fact} (${laneDetail.chart})\n` +
          `${culture}\n` +
          `${next}`;

        meta.stepIndex = stepIndex + 1;
        meta.laneDetail = laneDetail;
        meta.mem = mem;

        meta._lastStepName = forcedStep;
        meta._lastPromptSig = promptSig(forcedStep, forcedReply);

        writeSession(skey, meta, forcedStep, meta._lastPromptSig);
        return send(res, meta, laneDetail, forcedStep, forcedReply, { build: BUILD_TAG }, true);
      }

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      meta._lastStepName = stepName;
      meta._lastPromptSig = promptSig(stepName, reply);

      writeSession(skey, meta, stepName, meta._lastPromptSig);
      return send(res, meta, laneDetail, stepName, reply, { build: BUILD_TAG }, true);
    }

    // If we have enough info, anchor
    const best = safePickBestMoment(MUSIC_DB, {
      artist: laneDetail.artist,
      title: laneDetail.title,
      year: laneDetail.year
    });

    if (best) {
      const stepName = "moment_anchored";
      const fact = best.fact || best.chart_fact || "Anchor found.";
      const culture = best.culture || best.cultural_moment || "Cultural moment: defining era resonance.";
      const next = best.next || best.next_step || "Next step: want the chart week/date or the broader timeline?";

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
      if (guard.looped) reply = `Anchor confirmed. Next step: exact chart week/date, or the full timeline?`;

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      meta._lastStepName = stepName;
      meta._lastPromptSig = promptSig(stepName, reply);

      writeSession(skey, meta, stepName, meta._lastPromptSig);
      return send(res, meta, laneDetail, stepName, reply, { build: BUILD_TAG }, true);
    }

    // Artist only
    if (laneDetail.artist && !laneDetail.year && !laneDetail.title) {
      const stepName = "awaiting_year_or_title";
      let reply =
        `Locked: ${String(laneDetail.artist).toUpperCase()}. ` +
        `Pick a year (e.g., 1992) or give me a song title. ` +
        `(Current chart: ${laneDetail.chart})`;

      const guard = applyLoopGuard(meta, stepName, reply);
      if (guard.looped) reply = `Next step: year or song title. That’s all I need.`;

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      meta._lastStepName = stepName;
      meta._lastPromptSig = promptSig(stepName, reply);

      writeSession(skey, meta, stepName, meta._lastPromptSig);
      return send(res, meta, laneDetail, stepName, reply, { build: BUILD_TAG }, true);
    }

    // Year only
    if (laneDetail.year && !laneDetail.artist && !laneDetail.title) {
      const stepName = "awaiting_artist_or_title";
      let reply =
        `Year locked: ${laneDetail.year}. Now give me the artist name or the song title. ` +
        `(Current chart: ${laneDetail.chart})`;

      const guard = applyLoopGuard(meta, stepName, reply);
      if (guard.looped) reply = `Next step: artist or song title. We already have the year.`;

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      meta._lastStepName = stepName;
      meta._lastPromptSig = promptSig(stepName, reply);

      writeSession(skey, meta, stepName, meta._lastPromptSig);
      return send(res, meta, laneDetail, stepName, reply, { build: BUILD_TAG }, true);
    }

    // Default music prompt
    {
      const stepName = "awaiting_anchor";
      let reply =
        `To anchor the moment, give me an artist + year (or a song title).\n\n` +
        `If you want a different chart, say: Billboard Hot 100, UK Singles, Canada RPM, or Top40Weekly. ` +
        `(Current: ${laneDetail.chart}).`;

      const guard = applyLoopGuard(meta, stepName, reply);
      if (guard.looped) reply = `Give me either: (1) Artist + year, or (2) Song title.`;

      meta.stepIndex = stepIndex + 1;
      meta.laneDetail = laneDetail;
      meta.mem = mem;

      meta._lastStepName = stepName;
      meta._lastPromptSig = promptSig(stepName, reply);

      writeSession(skey, meta, stepName, meta._lastPromptSig);
      return send(res, meta, laneDetail, stepName, reply, { build: BUILD_TAG }, false);
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
    return send(res, meta, laneDetail, stepName, reply, { build: BUILD_TAG }, true);
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
    return send(res, meta, laneDetail, stepName, reply, { build: BUILD_TAG }, true);
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
    return send(res, meta, laneDetail, stepName, reply, { build: BUILD_TAG }, true);
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
    return send(res, meta, laneDetail, stepName, reply, { build: BUILD_TAG }, false);
  }
});

app.listen(PORT, () => {
  console.log(`[Nyx] ${BUILD_TAG} running on port ${PORT}`);
});
