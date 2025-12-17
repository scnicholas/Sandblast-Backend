// ----------------------------------------------------------
// Sandblast Nyx Backend — Broadcast-Ready v1.24 (2025-12-16)
// Updates:
// - Lane lock precedence: meta.currentLane/meta.lastDomain overrides classifier
// - FIX (critical): artist-only follow-up inherits locked year reliably
// - NEW (hard guard): if artist detected + year known (laneDetail OR mem) + no title => ALWAYS advance
// - NEW (sticky year): persist year in meta.mem.musicYear; restore if laneDetail.year is missing
// - Chart switching: Billboard / UK Singles / Canada RPM / Top40Weekly
// - /api/health alias added (supports both /health and /api/health)
// - #1 slot-fill asks only missing year/title
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
const BUILD_TAG = "nyx-broadcast-ready-v1.24-2025-12-16";
const MUSIC_DEFAULT_CHART = "Billboard Hot 100";

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
  const m = String(text).match(/\b(19\d{2}|20\d{2})\b/);
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
// Main endpoint
// -------------------------
app.post("/api/sandblast-gpt", (req, res) => {
  const { message, meta = {} } = req.body || {};
  const clean = String(message || "").trim();

  const stepIndex = Number(meta.stepIndex || 0);
  let laneDetail = { ...(meta.laneDetail || {}) };

  // Sticky memory bucket (survives even if laneDetail drops fields)
  let mem = { ...(meta.mem || {}) };

  // Greetings / small talk
  if (isGreeting(clean) || isSmallTalk(clean)) {
    return res.json({
      ok: true,
      reply:
        "I’m doing well — thanks for asking. What would you like to explore today? (Music history, Sandblast TV, News Canada, or Sponsors)",
      meta: { ...meta, stepIndex: stepIndex + 1 }
    });
  }

  // Explicit lane select
  const lane = resolveLaneSelect(clean);
  if (lane) {
    if (lane === "music_history") {
      if (!laneDetail.chart) laneDetail.chart = MUSIC_DEFAULT_CHART;
    }
    return res.json({
      ok: true,
      reply:
        lane === "music_history"
          ? "Music history locked. Give me an artist + year (or a song title)."
          : `Locked. What would you like to do in ${lane.replace("_", " ")}?`,
      meta: {
        ...meta,
        stepIndex: stepIndex + 1,
        currentLane: lane,
        lastDomain: lane,
        laneDetail,
        mem
      }
    });
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
    // Chart switching
    const chart = resolveChartFromText(clean);
    if (chart) laneDetail.chart = chart;
    if (!laneDetail.chart) laneDetail.chart = MUSIC_DEFAULT_CHART;

    // Restore sticky year if laneDetail lost it
    if (!laneDetail.year && mem.musicYear) {
      laneDetail.year = Number(mem.musicYear) || laneDetail.year;
    }

    const yearInMsg = extractYear(clean);
    if (yearInMsg) {
      laneDetail.year = yearInMsg;
      mem.musicYear = yearInMsg; // persist
    } else if (laneDetail.year) {
      mem.musicYear = laneDetail.year; // keep fresh
    }

    // Era cue: lock year + reset context cleanly (keep chart)
    if (containsEraCue(clean) && yearInMsg && !laneDetail.artist) {
      return res.json({
        ok: true,
        reply:
          `${yearInMsg} Motown is a defining era. Pick an artist (The Supremes, Marvin Gaye, The Temptations) and I’ll anchor the chart moment.`,
        meta: {
          ...meta,
          stepIndex: stepIndex + 1,
          currentLane: "music_history",
          lastDomain: "music_history",
          laneDetail: { chart: laneDetail.chart, year: yearInMsg },
          mem: { ...mem, musicYear: yearInMsg }
        }
      });
    }

    // Detect artist/title from message
    const detectedArtist = resolveArtistAlias(clean) || detectArtist(clean);
    const detectedTitle = detectTitle(clean);

    // Assign slots immediately
    if (detectedArtist && !laneDetail.artist) laneDetail.artist = detectedArtist;
    if (detectedTitle && !laneDetail.title) laneDetail.title = detectedTitle;

    // ✅ HARD GUARD (final): if artist detected AND year known (laneDetail OR mem) AND no title => ALWAYS advance
    // This blocks the generic fallback from ever firing in the "1964 Motown → Marvin Gaye" scenario.
    if (detectedArtist && laneDetail.year && !laneDetail.title) {
      return res.json({
        ok: true,
        reply:
          `Got it — ${String(laneDetail.artist).toUpperCase()} in ${laneDetail.year}. ` +
          `Give me a song title, or ask “Was it #1?” and I’ll anchor the chart moment.`,
        meta: {
          ...meta,
          stepIndex: stepIndex + 1,
          currentLane: "music_history",
          lastDomain: "music_history",
          laneDetail,
          mem
        }
      });
    }

    // #1 slot-fill: ask only what's missing
    if (laneDetail.artist && hasNumberOneIntent(clean) && !laneDetail.year && !laneDetail.title) {
      return res.json({
        ok: true,
        reply:
          `Got it — ${String(laneDetail.artist).toUpperCase()} #1. Give me a year (e.g., 1992) or a song title and I’ll anchor the chart moment.`,
        meta: {
          ...meta,
          stepIndex: stepIndex + 1,
          currentLane: "music_history",
          lastDomain: "music_history",
          laneDetail,
          mem
        }
      });
    }

    // If user gives ONLY a year after artist already known
    if (yearInMsg && laneDetail.artist && !laneDetail.title) {
      return res.json({
        ok: true,
        reply:
          `Locked: ${String(laneDetail.artist).toUpperCase()} in ${yearInMsg}. Give me a song title, or ask “Was it #1?” and I’ll anchor the chart moment.`,
        meta: {
          ...meta,
          stepIndex: stepIndex + 1,
          currentLane: "music_history",
          lastDomain: "music_history",
          laneDetail,
          mem
        }
      });
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

      return res.json({
        ok: true,
        reply:
          `Chart fact: ${fact} (${best.chart || laneDetail.chart})\n` +
          `Cultural thread: ${culture}\n` +
          `Next step: ${next}`,
        meta: {
          ...meta,
          stepIndex: stepIndex + 1,
          currentLane: "music_history",
          lastDomain: "music_history",
          laneDetail: {
            artist: best.artist || laneDetail.artist,
            title: best.title || laneDetail.title,
            year: best.year || laneDetail.year,
            chart: best.chart || laneDetail.chart
          },
          mem
        }
      });
    }

    // If we have artist but missing year/title, advance the conversation cleanly
    if (laneDetail.artist && !laneDetail.year && !laneDetail.title) {
      return res.json({
        ok: true,
        reply:
          `Got it — ${String(laneDetail.artist).toUpperCase()}. Pick a year (e.g., 1992) or give me a song title and I’ll anchor the chart moment.\n\n` +
          `Next step: give me a year (e.g., 1992) or a song title. (Current: ${laneDetail.chart}).`,
        meta: {
          ...meta,
          stepIndex: stepIndex + 1,
          currentLane: "music_history",
          lastDomain: "music_history",
          laneDetail,
          mem
        }
      });
    }

    // Default music prompt
    return res.json({
      ok: true,
      reply:
        `To anchor the moment, give me an artist + year (or a song title).\n\n` +
        `Next step: give me an artist + year (or a song title). If you want a different chart, say: Billboard Hot 100, UK Singles, Canada RPM, or Top40Weekly. (Current: ${laneDetail.chart}).`,
      meta: {
        ...meta,
        stepIndex: stepIndex + 1,
        currentLane: "music_history",
        lastDomain: "music_history",
        laneDetail,
        mem
      }
    });
  }

  // -------------------------
  // Other lanes (minimal calm prompts for v1)
  // -------------------------
  if (domain === "tv") {
    return res.json({
      ok: true,
      reply: "Sandblast TV locked. What are we tuning: the grid, a specific show, or a programming block?",
      meta: { ...meta, stepIndex: stepIndex + 1, currentLane: "tv", lastDomain: "tv", laneDetail, mem }
    });
  }

  if (domain === "news_canada") {
    return res.json({
      ok: true,
      reply: "News Canada locked. What’s the story topic and who is the target audience?",
      meta: { ...meta, stepIndex: stepIndex + 1, currentLane: "news_canada", lastDomain: "news_canada", laneDetail, mem }
    });
  }

  if (domain === "sponsors") {
    return res.json({
      ok: true,
      reply: "Sponsors locked. Say “sponsor package” or tell me the brand + tier (Starter/Growth/Premium) and I’ll generate deliverables.",
      meta: { ...meta, stepIndex: stepIndex + 1, currentLane: "sponsors", lastDomain: "sponsors", laneDetail, mem }
    });
  }

  // General fallback
  return res.json({
    ok: true,
    reply: "Understood. What would you like to do next?",
    meta: { ...meta, stepIndex: stepIndex + 1, lastDomain: "general", mem }
  });
});

// Health (both endpoints)
app.get("/health", (_, res) => res.json({ status: "ok", build: BUILD_TAG }));
app.get("/api/health", (_, res) => res.json({ status: "ok", build: BUILD_TAG }));

app.listen(PORT, () => {
  console.log(`[Nyx] ${BUILD_TAG} running on port ${PORT}`);
});
