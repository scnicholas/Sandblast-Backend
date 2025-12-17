// ----------------------------------------------------------
// Sandblast Nyx Backend — Broadcast-Ready v1.21 (2025-12-16)
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
const BUILD_TAG = "nyx-broadcast-ready-v1.21-2025-12-16";
const MUSIC_DEFAULT_CHART = "Billboard Hot 100";

// -------------------------
// Music DB
// -------------------------
let MUSIC_DB = { moments: [] };
let MUSIC_ARTISTS = [];
let MUSIC_TITLES = [];

(function loadMusicDbOnce() {
  try {
    MUSIC_DB = musicKB.loadDb();
    const m = MUSIC_DB.moments || [];
    MUSIC_ARTISTS = [...new Set(m.map(x => x.artist).filter(Boolean))];
    MUSIC_TITLES = [...new Set(m.map(x => x.title).filter(Boolean))];
  } catch {
    MUSIC_DB = { moments: [] };
  }
})();

// -------------------------
// Helpers
// -------------------------
const norm = s =>
  String(s || "").toLowerCase().replace(/[^\w\s#]/g, " ").replace(/\s+/g, " ").trim();

const extractYear = text => {
  const m = String(text).match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
};

const isGreeting = t => ["hi", "hello", "hey", "hi nyx", "hello nyx"].includes(norm(t));

const isSmallTalk = t => /^how (are|r) you|what'?s up/.test(norm(t));

const resolveLaneSelect = text => {
  const t = norm(text);
  if (["music", "music history", "music_history"].includes(t)) return "music_history";
  if (["tv", "sandblast tv"].includes(t)) return "tv";
  if (["news", "news canada"].includes(t)) return "news_canada";
  if (["sponsors", "sponsorship"].includes(t)) return "sponsors";
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

const detectArtist = text =>
  MUSIC_ARTISTS.find(a => norm(text).includes(norm(a)));

const detectTitle = text =>
  MUSIC_TITLES.find(s => norm(text).includes(norm(s)));

const hasNumberOneIntent = t =>
  /#1|number one|no\.?\s?1/.test(norm(t));

const containsEraCue = t =>
  ["motown", "disco", "grunge", "new wave", "hip hop", "soul"].some(e => norm(t).includes(e));

// -------------------------
// Main endpoint
// -------------------------
app.post("/api/sandblast-gpt", (req, res) => {
  const { message, meta = {} } = req.body;
  const clean = String(message || "").trim();
  const stepIndex = Number(meta.stepIndex || 0);
  let laneDetail = { ...(meta.laneDetail || {}) };

  // Greetings
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
    if (lane === "music_history" && !laneDetail.chart)
      laneDetail.chart = MUSIC_DEFAULT_CHART;

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
        laneDetail
      }
    });
  }

  // 🔒 Lane lock precedence (CRITICAL FIX)
  let domain = meta.currentLane || meta.lastDomain || "general";
  if (domain === "general") {
    const raw = classifyIntent(clean);
    domain = raw?.domain || "general";
  }

  // -------------------------
  // Music lane
  // -------------------------
  if (domain === "music_history") {
    const year = extractYear(clean);
    const artist =
      laneDetail.artist ||
      resolveArtistAlias(clean) ||
      detectArtist(clean);

    if (containsEraCue(clean) && year && !artist) {
      return res.json({
        ok: true,
        reply:
          `${year} Motown is a defining era. Pick an artist (The Supremes, Marvin Gaye, The Temptations) and I’ll anchor the chart moment.`,
        meta: {
          ...meta,
          stepIndex: stepIndex + 1,
          currentLane: "music_history",
          lastDomain: "music_history",
          laneDetail: { chart: MUSIC_DEFAULT_CHART, year }
        }
      });
    }

    if (artist && hasNumberOneIntent(clean) && !laneDetail.year) {
      return res.json({
        ok: true,
        reply:
          `Got it — ${artist.toUpperCase()} #1. Give me a year (e.g., 1992) or a song title and I’ll anchor the chart moment.`,
        meta: {
          ...meta,
          stepIndex: stepIndex + 1,
          currentLane: "music_history",
          lastDomain: "music_history",
          laneDetail: { ...laneDetail, artist }
        }
      });
    }

    const best = musicKB.pickBestMoment(MUSIC_DB, {
      artist,
      title: detectTitle(clean),
      year: year || laneDetail.year
    });

    if (best) {
      return res.json({
        ok: true,
        reply:
          `Chart fact: ${best.fact}\n` +
          `Cultural thread: ${best.culture}\n` +
          `Next step: ${best.next || "Want the exact chart week/date?"}`,
        meta: {
          ...meta,
          stepIndex: stepIndex + 1,
          currentLane: "music_history",
          lastDomain: "music_history",
          laneDetail: {
            artist: best.artist,
            title: best.title,
            year: best.year,
            chart: best.chart || MUSIC_DEFAULT_CHART
          }
        }
      });
    }

    return res.json({
      ok: true,
      reply:
        "To anchor the moment, give me an artist + year (or a song title).",
      meta: {
        ...meta,
        stepIndex: stepIndex + 1,
        currentLane: "music_history",
        lastDomain: "music_history",
        laneDetail
      }
    });
  }

  // General fallback
  return res.json({
    ok: true,
    reply: "Understood. What would you like to do next?",
    meta: { ...meta, stepIndex: stepIndex + 1 }
  });
});

// Health
app.get("/health", (_, res) =>
  res.json({ status: "ok", build: BUILD_TAG })
);

app.listen(PORT, () => {
  console.log(`[Nyx] ${BUILD_TAG} running on port ${PORT}`);
});
