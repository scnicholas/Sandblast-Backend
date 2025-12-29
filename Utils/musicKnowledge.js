"use strict";

/**
 * Utils/musicKnowledge.js — v2.46
 *
 * CRITICAL FIXES (v2.46):
 *  - Conservative two-token artist spill repair (prevents breaking "Elton John")
 *  - Year-End empty-result fallback (Year-End → Hot 100 → Top40Weekly)
 *  - Retains v2.44/v2.45 corruption repairs and guards
 */

const fs = require("fs");
const path = require("path");

const MK_VERSION =
  "musicKnowledge v2.46 (spill-fix whitelist + hang gating + year-end empty fallback)";

const DEFAULT_CHART = "Billboard Hot 100";
const TOP40_CHART = "Top40Weekly Top 100";

/* =========================
   ENV + PATHS
========================= */

const MERGE_TOP40WEEKLY =
  String(process.env.MERGE_TOP40WEEKLY ?? "1") !== "0";

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

const BY_YEAR = new Map();
const BY_YEAR_CHART = new Map();

const STATS = { moments: 0, yearMin: null, yearMax: null, charts: [] };

/* =========================
   HELPERS
========================= */

const toInt = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

const toRank = (x) => {
  const n = Number(x);
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : null;
};

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const _t = (x) => (x == null ? "" : String(x)).trim();

/* =========================
   CHART NORMALIZATION
========================= */

function normalizeChart(chart) {
  const c = String(chart || DEFAULT_CHART).trim().toLowerCase();
  if (c.includes("year") && c.includes("end")) return "Billboard Year-End Hot 100";
  if (c.includes("top40")) return TOP40_CHART;
  if (c.includes("billboard") || c.includes("hot 100")) return DEFAULT_CHART;
  return chart || DEFAULT_CHART;
}

function isYearEndChart(chart) {
  const c = String(chart || "").toLowerCase();
  return c.includes("year") && c.includes("end");
}

/* =========================
   SPILL REPAIR (v2.46)
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

const HANG_WORDS = new Set([
  "my","your","me","you","its","our","their","her","his"
]);

function repairTwoTokenArtistFrontSpill(m) {
  const artist = _t(m.artist);
  const title = _t(m.title);

  const a = artist.split(/\s+/);
  const t = title.split(/\s+/);

  if (a.length !== 2) return m;

  const [spill, core] = a;
  const spillLc = spill.toLowerCase();

  const titleEndsHang = HANG_WORDS.has(t[t.length - 1]?.toLowerCase());

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
  m.artist = _t(m.artist);
  m.title = _t(m.title);

  repairTwoTokenArtistFrontSpill(m);

  if (!m.artist) m.artist = "Unknown Artist";
  if (!m.title) m.title = "Unknown Title";

  return m;
}

/* =========================
   DB LOAD + INDEX
========================= */

function loadDb() {
  if (DB && INDEX_BUILT) return DB;

  let moments = [];

  for (const rel of DB_CANDIDATES) {
    const abs = path.resolve(__dirname, "..", rel);
    if (fs.existsSync(abs)) {
      const json = JSON.parse(fs.readFileSync(abs, "utf8"));
      moments = Array.isArray(json.moments) ? json.moments : json;
      if (moments.length) break;
    }
  }

  DB = { moments };

  BY_YEAR.clear();
  BY_YEAR_CHART.clear();

  let minY = null, maxY = null;
  const charts = new Set();

  for (const raw of moments) {
    const m = normalizeMoment(raw);
    const y = toInt(m.year);
    if (!y) continue;

    const c = normalizeChart(m.chart);
    m.chart = c;

    minY = minY == null ? y : Math.min(minY, y);
    maxY = maxY == null ? y : Math.max(maxY, y);
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
  STATS.charts = Array.from(charts);

  INDEX_BUILT = true;

  console.log(`[musicKnowledge] Loaded ${moments.length} moments (${minY}–${maxY})`);
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

  if (!out.length && isYearEndChart(c)) {
    out = BY_YEAR_CHART.get(`${y}|${DEFAULT_CHART}`) || [];
    if (!out.length) {
      out = BY_YEAR_CHART.get(`${y}|${TOP40_CHART}`) || [];
    }
  }

  return out
    .filter((m) => toRank(m.rank) != null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
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
  STATS: () => {
    loadDb();
    return { ...STATS };
  },
};
