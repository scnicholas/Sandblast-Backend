// ----------------------------------------------------------
// Sandblast Nyx Backend — Broadcast-Ready v1.19
// Fixes:
// - Artist shorthand aliasing (Whitney → Whitney Houston)
// - Slot-fill logic (artist + #1 → ask only missing info)
// - ERA / GENRE RESET GUARD (e.g., “1964 Motown”)
// ----------------------------------------------------------

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const { classifyIntent } = require("./Utils/intentClassifier");
const musicKB = require("./Utils/musicKnowledge");

let MUSIC_DB = null;
let MUSIC_ARTISTS = [];
let MUSIC_TITLES = [];

function loadMusicDbOnce() {
  try {
    MUSIC_DB = musicKB.loadDb();
    const moments = MUSIC_DB?.moments || [];
    MUSIC_ARTISTS = [...new Set(moments.map(m => m.artist).filter(Boolean))];
    MUSIC_TITLES = [...new Set(moments.map(m => m.title).filter(Boolean))];
  } catch {
    MUSIC_DB = { moments: [] };
    MUSIC_ARTISTS = [];
    MUSIC_TITLES = [];
  }
}
loadMusicDbOnce();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-broadcast-ready-v1.19-2025-12-16";

function norm(s) {
  return String(s || "").toLowerCase().replace(/[^\w\s#]/g, " ").replace(/\s+/g, " ").trim();
}

function extractYear(text) {
  const m = text.match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function hasNumberOneIntent(text) {
  const t = norm(text);
  return t.includes("#1") || t.includes("number one") || t.includes("no 1");
}

function resolveArtistAlias(text) {
  const t = norm(text);
  if (/\bwhitney\b/.test(t)) return "Whitney Houston";
  if (/\bmadonna\b/.test(t)) return "Madonna";
  if (/\bprince\b/.test(t)) return "Prince";
  if (/\bmj\b/.test(t)) return "Michael Jackson";
  return null;
}

function containsEraOrGenreCue(text) {
  const t = norm(text);
  const cues = [
    "motown", "british invasion", "disco", "new wave",
    "grunge", "hip hop", "hip-hop", "r&b", "soul",
    "punk", "metal", "country", "soundtrack"
  ];
  return cues.some(c => t.includes(c));
}

const MUSIC_DEFAULT_CHART = "Billboard Hot 100";

app.post("/api/sandblast-gpt", async (req, res) => {
  try {
    const { message, meta } = req.body;
    const clean = String(message || "").trim();
    let laneDetail = { ...(meta?.laneDetail || {}) };

    // ERA / GENRE RESET GUARD
    if (containsEraOrGenreCue(clean)) {
      laneDetail = { chart: MUSIC_DEFAULT_CHART };
    }

    const aliasArtist = resolveArtistAlias(clean);
    if (aliasArtist && !laneDetail.artist) laneDetail.artist = aliasArtist;

    const year = extractYear(clean);
    if (year) laneDetail.year = year;

    if (laneDetail.artist && hasNumberOneIntent(clean) && !laneDetail.year && !laneDetail.title) {
      return res.json({
        ok: true,
        reply: `Got it — ${laneDetail.artist.toUpperCase()} #1. Give me a year (e.g., 1992) or a song title and I’ll anchor the chart moment.`,
        meta: { ...meta, laneDetail }
      });
    }

    if (year && !laneDetail.artist) {
      return res.json({
        ok: true,
        reply: `1964 Motown is a defining era. Pick an artist (The Supremes, Marvin Gaye, The Temptations) and I’ll anchor the chart moment.`,
        meta: { ...meta, laneDetail }
      });
    }

    return res.json({
      ok: true,
      reply: "To anchor the moment, give me an artist + year (or a song title).",
      meta: { ...meta, laneDetail }
    });

  } catch (err) {
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok", build: BUILD_TAG }));

app.listen(PORT, () => {
  console.log(`[Nyx] ${BUILD_TAG} running on port ${PORT}`);
});
