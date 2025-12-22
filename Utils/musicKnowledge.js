"use strict";

/**
 * musicKnowledge.js — Bulletproof V2.11 (Title + Artist Hardened)
 */

const fs = require("fs");
const path = require("path");

// =============================
// CONFIG
// =============================
const ENV_DB_PATH = process.env.MUSIC_DB_PATH;
const ENV_DB_CANDIDATES = process.env.MUSIC_DB_CANDIDATES;
const MERGE_TOP40WEEKLY = String(process.env.MERGE_TOP40WEEKLY || "1") !== "0";
const HOT_RELOAD = String(process.env.MUSIC_DB_HOT_RELOAD || "") === "1";

const DEFAULT_DB_CANDIDATES = [
  "Data/music_moments_v2_layer2_plus500.json",
  "Data/music_moments_v2_layer2_plus1000.json",
  "Data/music_moments_v2_layer2_plus2000.json",
  "Data/music_moments_v2_layer2_enriched.json",
  "Data/music_moments_v2_layer2_filled.json",
  "Data/music_moments_v2_layer2.json",
  "Data/music_moments_v2.json",
  "Data/music_moments.json",
  "Data/music_moments_layer1.json"
];

const PREFERRED_DEFAULT_DB = "Data/music_moments_v2_layer2_plus500.json";
const DEFAULT_CHART = "Billboard Hot 100";

// =============================
// INTERNAL STATE
// =============================
let DB = null;
let DB_PATH_RESOLVED = null;
let DB_MTIME_MS = 0;
let LOADED = false;

let MOMENT_INDEX = [];

// =============================
// HELPERS
// =============================
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function stripBom(s) {
  return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function toInt(x) {
  const n = Number(String(x ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeChart(chart) {
  return chart || DEFAULT_CHART;
}

// =============================
// NORMALIZATION (CRITICAL FIX)
// =============================
function normalizeMoment(raw) {
  const artist = String(
    raw.artist ??
    raw.artist_name ??
    raw.performer ??
    raw.band ??
    ""
  ).trim();

  const title = String(
    raw.title ??
    raw.song_title ??
    raw.song ??
    raw.track ??
    raw.track_title ??
    raw.name ??
    ""
  ).trim();

  const year = toInt(raw.year);
  const chart = normalizeChart(raw.chart);

  if (!artist || !title || !year) return null;

  return {
    artist,
    title,
    year,
    chart,

    peak: toInt(raw.peak),
    weeks_on_chart: toInt(raw.weeks_on_chart),
    is_number_one: raw.is_number_one === true || raw.peak === 1,

    fact: String(raw.fact || "").trim(),
    culture: String(raw.culture || "").trim(),
    next: String(raw.next || "").trim(),

    _na: norm(artist),
    _nt: norm(title)
  };
}

// =============================
// LOAD DB
// =============================
function resolveDbPath() {
  if (ENV_DB_PATH) return path.resolve(ENV_DB_PATH);

  for (const rel of DEFAULT_DB_CANDIDATES) {
    const abs = path.join(process.cwd(), rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function loadDb() {
  const resolved = resolveDbPath();
  if (!resolved) throw new Error("Music DB not found");

  DB_PATH_RESOLVED = resolved;
  DB_MTIME_MS = fs.statSync(resolved).mtimeMs;

  const raw = stripBom(fs.readFileSync(resolved, "utf8"));
  const json = JSON.parse(raw);

  const momentsRaw = Array.isArray(json) ? json : json.moments;
  const normalized = [];

  const seen = new Set();

  for (const r of momentsRaw) {
    const m = normalizeMoment(r);
    if (!m) continue;

    const key = `${m._na}|${m._nt}|${m.year}|${m.chart}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push(m);
  }

  MOMENT_INDEX = normalized;
  DB = { moments: MOMENT_INDEX };
  LOADED = true;

  console.log(`[musicKnowledge] Loaded ${MOMENT_INDEX.length} moments`);
  return DB;
}

function getDb() {
  if (!LOADED) return loadDb();
  return DB;
}

// =============================
// PICKERS
// =============================
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomByYear(year) {
  getDb();
  const pool = MOMENT_INDEX.filter((m) => m.year === year);
  return pool.length ? pickRandom(pool) : null;
}

function pickRandomByYearFallback(year) {
  return pickRandomByYear(year);
}

// =============================
// EXPORTS
// =============================
module.exports = {
  loadDb,
  getDb,
  loadDB: loadDb,
  db: () => getDb(),

  pickRandomByYear,
  pickRandomByYearFallback
};
