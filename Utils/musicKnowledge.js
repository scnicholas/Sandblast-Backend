"use strict";

/**
 * Utils/musicKnowledge.js — v2.47 (patched)
 *
 * FIXES (v2.47):
 *  - getTopByYear(): DO NOT return [] just because rank is missing; prefer ranked if present, else fallback to unranked.
 *  - rank aliasing: rank can come from rank/position/no/pos/number
 *  - Wikipedia Year-End merge if present (Data/wikipedia/billboard_yearend_hot100_1970_2010.json)
 *  - Clear logging: which DB file loaded + charts present + year range
 *
 * Retains v2.46:
 *  - Conservative two-token artist spill repair (prevents breaking "Elton John")
 *  - Year-End empty-result fallback (Year-End → Hot 100 → Top40Weekly)
 */

const fs = require("fs");
const path = require("path");

const MK_VERSION =
  "musicKnowledge v2.47 (rank-safe top lists + rank aliases + wiki year-end merge + v2.46 spill+fallback retained)";

const DEFAULT_CHART = "Billboard Hot 100";
const TOP40_CHART = "Top40Weekly Top 100";

/* =========================
   ENV + PATHS
========================= */

const MERGE_TOP40WEEKLY = String(process.env.MERGE_TOP40WEEKLY ?? "1") !== "0";

const ENABLE_CHART_FALLBACK =
  String(process.env.MUSIC_ENABLE_CHART_FALLBACK ?? "1") !== "0";

const FALLBACK_CHART =
  String(process.env.MUSIC_FALLBACK_CHART || DEFAULT_CHART).trim();

const DATA_DIR_ENV = String(process.env.DATA_DIR || "").trim();

const DB_CANDIDATES = [
  "Data/music_moments_v2_layer2_plus500.json",
  "Data/music_moments_v2_layer2_plus1000.json",
  "Data/music_moments_v2_layer2_plus2000.json",
  "Data/music_moments_v2_layer2_enriched.json",
  "Data/music_moments_v2_layer2_filled.json",
  "Data/music_moments_v2_layer2.json",
  "Data/music_moments_v2.json",
  "Data/music_moments.json",
];

const TOP40_DIR_CANON = "Data/top40weekly";
const WIKI_YEAREND_COMBINED =
  "Data/wikipedia/billboard_yearend_hot100_1970_2010.json";

/* =========================
   INTERNAL STATE
========================= */

let DB = null;
let INDEX_BUILT = false;
let LOADED_FROM = null;

const BY_YEAR = new Map();
const BY_YEAR_CHART = new Map();

const STATS = { moments: 0, yearMin: null, yearMax: null, charts: [] };

/* =========================
   HELPERS
========================= */

const toInt = (x) => {
  const s = String(x ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function readJson(abs) {
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function fileExists(abs) {
  try {
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

function dirExists(abs) {
  try {
    return fs.existsSync(abs) && fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const _t = (x) => (x == null ? "" : String(x)).trim();

// rank aliasing
function coerceRank(m) {
  const raw =
    m.rank ?? m.position ?? m.no ?? m.pos ?? m.number ?? m["no."] ?? m["#"];
  const n = toInt(raw);
  if (!n || n < 1 || n > 100) return null;
  return n;
}

/* =========================
   CHART NORMALIZATION
========================= */

function normalizeChart(chart) {
  const c = String(chart || DEFAULT_CHART).trim().toLowerCase();
  if (!c) return DEFAULT_CHART;

  if (c.includes("year") && c.includes("end")) return "Billboard Year-End Hot 100";
  if (c.includes("top40")) return TOP40_CHART;
  if (c.includes("billboard") || c.includes("hot 100") || c.includes("hot100"))
    return DEFAULT_CHART;

  return chart || DEFAULT_CHART;
}

function isYearEndChart(chart) {
  const c = String(chart || "").toLowerCase();
  return c.includes("year") && c.includes("end");
}

/* =========================
   SPILL REPAIR (v2.46 retained)
========================= */

const KNOWN_SPILLS = new Set([
  "away",
  "thorn",
  "time",
  "words",
  "believe",
  "scrubs",
  "vogue",
  "unbelievable",
  "chameleon",
  "tonight",
  "richer",
  "heart",
  "owner",
  "karma",
]);

const HANG_WORDS = new Set(["my", "your", "me", "you", "its", "our", "their", "her", "his"]);

function repairTwoTokenArtistFrontSpill(m) {
  const artist = _t(m.artist);
  const title = _t(m.title);

  const a = artist.split(/\s+/).filter(Boolean);
  const t = title.split(/\s+/).filter(Boolean);

  if (a.length !== 2) return m;

  const [spill, core] = a;
  const spillLc = spill.toLowerCase();
  const titleEndsHang = HANG_WORDS.has((t[t.length - 1] || "").toLowerCase());

  if (!KNOWN_SPILLS.has(spillLc) && !titleEndsHang) return m;
  if (norm(title).includes(norm(spill))) return m;

  m.artist = core;
  m.title = `${title} ${spill}`.trim();
  return m;
}

/* =========================
   NORMALIZATION PIPELINE
========================= */

function normalizeMoment(m) {
  if (!m || typeof m !== "object") return m;

  m.artist = _t(m.artist);
  m.title = _t(m.title);
  m.chart = normalizeChart(m.chart);

  // unify rank field
  const r = coerceRank(m);
  if (r != null) m.rank = r;

  repairTwoTokenArtistFrontSpill(m);

  if (!m.artist) m.artist = "Unknown Artist";
  if (!m.title) m.title = "Unknown Title";

  return m;
}

/* =========================
   WIKIPEDIA YEAR-END MERGE
========================= */

function mergeWikipediaYearEnd(moments) {
  const abs = path.resolve(__dirname, "..", WIKI_YEAREND_COMBINED);
  if (!fileExists(abs)) return moments;

  try {
    const doc = readJson(abs);
    const rows = Array.isArray(doc?.moments) ? doc.moments : Array.isArray(doc) ? doc : [];
    if (!rows.length) return moments;

    const merged = [];
    for (const row of rows) {
      const y = toInt(row.year);
      const r = toInt(row.rank);
      const artist = _t(row.artist);
      const title = _t(row.title);
      if (!y || !r || !artist || !title) continue;

      merged.push(
        normalizeMoment({
          year: y,
          rank: r,
          artist,
          title,
          chart: "Billboard Year-End Hot 100",
        })
      );
    }

    if (merged.length) {
      console.log(
        `[musicKnowledge] Wikipedia Year-End merge: source=${abs} rows=${merged.length}`
      );
      return moments.concat(merged);
    }
  } catch (e) {
    console.log(`[musicKnowledge] Wikipedia Year-End merge failed: ${e.message}`);
  }

  return moments;
}

/* =========================
   DB LOAD + INDEX
========================= */

function resolveRepoRoot() {
  if (DATA_DIR_ENV) {
    return path.isAbsolute(DATA_DIR_ENV)
      ? DATA_DIR_ENV
      : path.resolve(process.cwd(), DATA_DIR_ENV);
  }
  return path.resolve(__dirname, "..");
}

function resolveRepoPath(rel) {
  if (path.isAbsolute(rel)) return rel;
  return path.resolve(resolveRepoRoot(), rel);
}

function loadDb() {
  if (DB && INDEX_BUILT) return DB;

  let moments = [];
  LOADED_FROM = null;

  for (const rel of DB_CANDIDATES) {
    const abs = resolveRepoPath(rel);
    if (!fileExists(abs)) continue;

    const json = readJson(abs);
    const arr = Array.isArray(json?.moments) ? json.moments : Array.isArray(json) ? json : [];
    if (!arr.length) continue;

    moments = arr;
    LOADED_FROM = abs;
    break;
  }

  // merge Wikipedia Year-End if present
  moments = mergeWikipediaYearEnd(moments);

  DB = { moments };

  BY_YEAR.clear();
  BY_YEAR_CHART.clear();

  let minY = null,
    maxY = null;
  const charts = new Set();

  for (const raw of moments) {
    const m = normalizeMoment(raw);
    const y = toInt(m.year);
    if (!y) continue;

    minY = minY == null ? y : Math.min(minY, y);
    maxY = maxY == null ? y : Math.max(maxY, y);

    const c = normalizeChart(m.chart);
    m.chart = c;
    charts.add(c);

    if (!BY_YEAR.has(y)) BY_YEAR.set(y, []);
    BY_YEAR.get(y).push(m);

    const key = `${y}|${c}`;
    if (!BY_YEAR_CHART.has(key)) BY_YEAR_CHART.set(key, []);
    BY_YEAR_CHART.get(key).push(m);
  }

  STATS.moments = moments.length;
  STATS.yearMin = minY;
  STATS.yearMax = maxY;
  STATS.charts = Array.from(charts).sort();

  INDEX_BUILT = true;

  console.log(
    `[musicKnowledge] Loaded ${moments.length} moments (${minY ?? "?"}–${maxY ?? "?"})`
  );
  console.log(`[musicKnowledge] DB source: ${LOADED_FROM || "NONE (no DB found)"}`);
  console.log(`[musicKnowledge] Charts: ${STATS.charts.join(" | ")}`);
  console.log(`[musicKnowledge] ${MK_VERSION}`);

  return DB;
}

/* =========================
   QUERIES
========================= */

function getTopByYear(year, chart = DEFAULT_CHART, limit = 10) {
  loadDb();
  const y = toInt(year);
  if (!y) return [];

  const c = normalizeChart(chart);
  let out = BY_YEAR_CHART.get(`${y}|${c}`) || [];

  // v2.46 retained: Year-End empty fallback
  if (!out.length && isYearEndChart(c)) {
    out = BY_YEAR_CHART.get(`${y}|${DEFAULT_CHART}`) || [];
    if (!out.length) out = BY_YEAR_CHART.get(`${y}|${TOP40_CHART}`) || [];
  }

  if (!out.length) return [];

  const lim = Math.max(1, Number(limit) || 10);

  // Prefer ranked if present; DO NOT discard unranked datasets.
  const ranked = out
    .map((m) => {
      if (m.rank == null) m.rank = coerceRank(m);
      return m;
    })
    .filter((m) => m.rank != null);

  const base = ranked.length
    ? ranked.slice().sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    : out.slice();

  return base.slice(0, lim);
}

function getNumberOneByYear(year, chart = DEFAULT_CHART) {
  const top = getTopByYear(year, chart, 1);
  return top.length ? top[0] : null;
}

/* =========================
   EXPORTS
========================= */

module.exports = {
  getTopByYear,
  getNumberOneByYear,
  normalizeChart,
  STATS: () => {
    loadDb();
    return { ...STATS };
  },
};
