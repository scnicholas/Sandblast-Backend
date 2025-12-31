"use strict";

/**
 * Utils/musicKnowledge.js — v2.50
 *
 * GOAL (per Mac):
 *  - Public range is 1950–2024 (Nyx should say/accept this now).
 *
 * WHAT THIS DOES:
 *  - Maintains chart-aware indexing and chart-specific availability.
 *  - Sets a PUBLIC range (1950–2024) used in prompts + validation.
 *  - If user requests a year outside a chart’s real coverage (ex: Year-End 1955),
 *    the module automatically routes to the broad/default chart source.
 *  - Provides handleChat() for index.js integration.
 *
 * RETAINS:
 *  - 1988 #3 George Harrison hard-fix
 *  - rank-safe lists + rank aliases
 *  - Wikipedia Year-End merge (1970–2010 file)
 */

const fs = require("fs");
const path = require("path");

const MK_VERSION =
  "musicKnowledge v2.50 (PUBLIC 1950–2024 + chart-aware ranges + handleChat; retains v2.49/v2.48/v2.47/v2.46)";

const DEFAULT_CHART = "Billboard Hot 100";
const TOP40_CHART = "Top40Weekly Top 100";
const YEAR_END_CHART = "Billboard Year-End Hot 100";

// PUBLIC (what Nyx says/accepts)
const PUBLIC_MIN_YEAR = 1950;
const PUBLIC_MAX_YEAR = 2024;

/* =========================
   ENV + PATHS
========================= */

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

const _t = (x) => (x == null ? "" : String(x)).trim();

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function coerceRank(m) {
  const raw =
    m.rank ?? m.position ?? m.no ?? m.pos ?? m.number ?? m["no."] ?? m["#"];
  const n = toInt(raw);
  return n && n >= 1 && n <= 100 ? n : null;
}

/* =========================
   CHART NORMALIZATION
========================= */

function normalizeChart(chart) {
  const c = String(chart || DEFAULT_CHART).toLowerCase();
  if (c.includes("year") && c.includes("end")) return YEAR_END_CHART;
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
   NORMALIZATION + HARD FIX
========================= */

function normalizeMoment(m) {
  if (!m || typeof m !== "object") return m;

  let artist = _t(m.artist);
  let title = _t(m.title);
  const year = toInt(m.year);
  const rank = coerceRank(m);

  // 🔒 HARD FIX — 1988 #3 George Harrison
  if (
    year === 1988 &&
    rank === 3 &&
    /^harrison$/i.test(artist) &&
    /\bgot\s+my\s+mind\s+set\s+on\s+you\b/i.test(title)
  ) {
    artist = "George Harrison";
    title = "Got My Mind Set on You";
  }

  m.artist = artist || "Unknown Artist";
  m.title = title || "Unknown Title";
  m.chart = normalizeChart(m.chart);
  if (rank != null) m.rank = rank;

  return m;
}

/* =========================
   WIKIPEDIA YEAR-END MERGE
========================= */

function mergeWikipediaYearEnd(moments) {
  const abs = path.resolve(__dirname, "..", WIKI_YEAREND_COMBINED);
  if (!fs.existsSync(abs)) return moments;

  const doc = JSON.parse(fs.readFileSync(abs, "utf8"));
  const rows = Array.isArray(doc?.moments) ? doc.moments : doc;

  const merged = [];
  for (const r of rows) {
    const y = toInt(r.year);
    const rk = toInt(r.rank);
    if (!y || !rk) continue;

    merged.push(
      normalizeMoment({
        year: y,
        rank: rk,
        artist: r.artist,
        title: r.title,
        chart: YEAR_END_CHART,
      })
    );
  }

  console.log(
    `[musicKnowledge] Wikipedia Year-End merge: source=${abs} rows=${merged.length}`
  );
  return moments.concat(merged);
}

/* =========================
   DB LOAD + INDEX
========================= */

function resolveRepoPath(rel) {
  if (path.isAbsolute(rel)) return rel;
  if (DATA_DIR_ENV) return path.resolve(DATA_DIR_ENV, rel);
  return path.resolve(__dirname, "..", rel);
}

function loadDb() {
  if (DB && INDEX_BUILT) return DB;

  let moments = [];
  for (const rel of DB_CANDIDATES) {
    const abs = resolveRepoPath(rel);
    if (!fs.existsSync(abs)) continue;

    const json = JSON.parse(fs.readFileSync(abs, "utf8"));
    const arr = Array.isArray(json?.moments) ? json.moments : json;
    if (!arr.length) continue;

    moments = arr;
    LOADED_FROM = abs;
    break;
  }

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
    charts.add(m.chart);

    BY_YEAR.set(y, [...(BY_YEAR.get(y) || []), m]);
    BY_YEAR_CHART.set(`${y}|${m.chart}`, [
      ...(BY_YEAR_CHART.get(`${y}|${m.chart}`) || []),
      m,
    ]);
  }

  STATS.moments = moments.length;
  STATS.yearMin = minY;
  STATS.yearMax = maxY;
  STATS.charts = [...charts].sort();

  INDEX_BUILT = true;

  console.log(
    `[musicKnowledge] Loaded ${moments.length} moments (${minY}–${maxY})`
  );
  console.log(`[musicKnowledge] DB source: ${LOADED_FROM}`);
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

  // For Year-End: if no entries, fall back to broad sources
  if (!out.length && isYearEndChart(c)) {
    out = BY_YEAR_CHART.get(`${y}|${DEFAULT_CHART}`) || [];
    if (!out.length) out = BY_YEAR_CHART.get(`${y}|${TOP40_CHART}`) || [];
  }

  if (!out.length) return [];

  const ranked = out.filter((m) => m.rank != null);
  const base = ranked.length ? ranked.sort((a, b) => a.rank - b.rank) : out;

  return base.slice(0, Math.max(1, limit));
}

function getNumberOneByYear(year, chart = DEFAULT_CHART) {
  const top = getTopByYear(year, chart, 1);
  return top[0] || null;
}

/* =========================
   CHART RANGES (internal truth)
========================= */

const CHART_RANGES = new Map(); // chart -> { min, max, countYears }

function buildChartRanges() {
  loadDb();
  if (CHART_RANGES.size) return;

  const perChart = new Map(); // chart -> {min,max,years:Set}
  for (const k of BY_YEAR_CHART.keys()) {
    const pipe = k.indexOf("|");
    if (pipe < 0) continue;

    const y = toInt(k.slice(0, pipe));
    const chart = k.slice(pipe + 1);
    if (!y || !chart) continue;

    const c = normalizeChart(chart);
    const cur = perChart.get(c) || { min: null, max: null, years: new Set() };
    cur.min = cur.min == null ? y : Math.min(cur.min, y);
    cur.max = cur.max == null ? y : Math.max(cur.max, y);
    cur.years.add(y);
    perChart.set(c, cur);
  }

  for (const [chart, v] of perChart.entries()) {
    CHART_RANGES.set(chart, {
      min: v.min,
      max: v.max,
      countYears: v.years.size,
    });
  }
}

function getChartYearRange(chart) {
  buildChartRanges();
  const c = normalizeChart(chart || DEFAULT_CHART);
  const r = CHART_RANGES.get(c);

  if (r && r.min != null && r.max != null) return { chart: c, ...r };

  // fallback to global
  loadDb();
  return {
    chart: c,
    min: STATS.yearMin,
    max: STATS.yearMax,
    countYears: null,
  };
}

function getAvailableCharts() {
  loadDb();
  return [...(STATS.charts || [])];
}

// Internal chart-aware range text (truth per chart)
function getMusicRangeText(chart) {
  const r = getChartYearRange(chart);
  const min = r?.min ?? STATS.yearMin ?? 1951;
  const max = r?.max ?? STATS.yearMax ?? 2024;
  return `${min}–${max}`;
}

// Public range text (what Nyx advertises)
function getPublicRangeText() {
  return `${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}`;
}

/* =========================
   CONVERSATIONAL ROUTING
========================= */

/**
 * If a chart is requested that can't serve the requested year,
 * route to a chart that might (DEFAULT_CHART).
 */
function chooseChartForYear(requestedChart, year) {
  const y = toInt(year);
  const c = normalizeChart(requestedChart || DEFAULT_CHART);

  if (c === YEAR_END_CHART && y != null && (y < 1970 || y > 2010)) {
    return DEFAULT_CHART;
  }

  return c;
}

function parseYearFromText(text) {
  const t = String(text || "");
  const m = t.match(/\b(19\d{2}|20\d{2})\b/);
  return m ? toInt(m[1]) : null;
}

function parseArtistYear(text) {
  const t = cleanText(text);
  const y = parseYearFromText(t);
  if (!y) return { artist: null, year: null };
  const artist = cleanText(t.replace(String(y), "")).trim();
  return { artist: artist || null, year: y };
}

function formatTopList(year, chart, limit = 10) {
  const list = getTopByYear(year, chart, limit);
  if (!list.length) return null;

  const chartName = normalizeChart(chart);
  const lines = list.map((m, i) => {
    const rk = m.rank != null ? String(m.rank) : String(i + 1);
    const a = _t(m.artist) || "Unknown Artist";
    const t = _t(m.title) || "Unknown Title";
    return `${rk}. ${a} — ${t}`;
  });

  return `Top ${Math.min(limit, lines.length)} — ${chartName} (${year}):\n${lines.join(
    "\n"
  )}`;
}

function pickFollowUpYears() {
  const cands = [1951, 1960, 1970, 1984, 1999, 2010, 2020];
  const out = [];
  for (const y of cands) {
    if (y >= PUBLIC_MIN_YEAR && y <= PUBLIC_MAX_YEAR && !out.includes(y)) out.push(y);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * handleChat({ text, session })
 * - Public promise: 1950–2024
 * - Truthful behavior: if a year has no rows, it says so and moves forward.
 */
function handleChat({ text, session } = {}) {
  loadDb();

  const userText = cleanText(text);
  const st = session && typeof session === "object" ? session : {};

  const requestedChart =
    st.activeMusicChart || st.musicChart || st.activeChart || st.chart || null;

  const publicRange = getPublicRangeText();

  // Lane entry (chip click / empty)
  if (!userText) {
    const yrs = pickFollowUpYears();
    return {
      reply: `Music—nice. Give me a year (${publicRange}) or an artist + year, and I’ll pull something memorable.`,
      followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, "Try: Prince 1984"],
      domain: "music",
    };
  }

  // Year flow
  const year = parseYearFromText(userText);
  if (year != null) {
    if (year < PUBLIC_MIN_YEAR || year > PUBLIC_MAX_YEAR) {
      const yrs = pickFollowUpYears();
      return {
        reply: `Keep it in ${publicRange}. Give me one year and I’ll go to work.`,
        followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, `Try: ${yrs[2]}`],
        domain: "music",
      };
    }

    const chart = chooseChartForYear(requestedChart, year);

    const formatted = formatTopList(year, chart, 10);
    if (formatted) {
      return {
        reply: `${formatted}\n\nWant #1, a story moment, or another year?`,
        followUp: ["#1", "Story moment", "Another year"],
        domain: "music",
      };
    }

    // If we don't have rows, be honest + guide
    if (year === 1950) {
      return {
        reply:
          `I can go full-range ${publicRange}, but my earliest clean rows in the current dataset start at 1951 right now. Try 1951 (or any year after) and I’ll pull the list instantly.`,
        followUp: ["Try: 1951", "Try: 1960", "Try: 1970"],
        domain: "music",
      };
    }

    const yrs = pickFollowUpYears();
    return {
      reply: `I don’t have a clean chart list for ${year} on this source yet. Try another year in ${publicRange}.`,
      followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, `Try: ${yrs[2]}`],
      domain: "music",
    };
  }

  // Artist + year flow (lightweight; we still steer to year lists)
  const ay = parseArtistYear(userText);
  if (ay.year != null) {
    if (ay.year < PUBLIC_MIN_YEAR || ay.year > PUBLIC_MAX_YEAR) {
      const yrs = pickFollowUpYears();
      return {
        reply: `Keep it in ${publicRange}. Give me an artist + year and I’ll pull something strong.`,
        followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, "Try: Prince 1984"],
        domain: "music",
      };
    }

    const chart = chooseChartForYear(requestedChart, ay.year);
    const formatted = formatTopList(ay.year, chart, 10);
    if (formatted) {
      return {
        reply: `${formatted}\n\nIf you tell me the exact song title by ${ay.artist || "that artist"}, I’ll give you a quick story moment.`,
        followUp: ["Story moment", "Another year", "#1"],
        domain: "music",
      };
    }
  }

  // Default fallback: keep it simple, public range
  const yrs = pickFollowUpYears();
  return {
    reply: `Give me a year (${publicRange}) or an artist + year (example: “Prince 1984”).`,
    followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, "Try: Prince 1984"],
    domain: "music",
  };
}

/* =========================
   EXPORTS
========================= */

module.exports = {
  getTopByYear,
  getNumberOneByYear,

  // diagnostics / metadata
  STATS: () => {
    loadDb();
    return { ...STATS };
  },
  MK_VERSION: () => MK_VERSION,

  // ranges + charts
  getChartYearRange,
  getMusicRangeText, // chart-truth
  getPublicRangeText, // Nyx public promise
  getAvailableCharts,
  CHART_RANGES: () => {
    buildChartRanges();
    const out = {};
    for (const [k, v] of CHART_RANGES.entries()) out[k] = { ...v };
    return out;
  },

  // chat integration
  handleChat,

  // public range
  PUBLIC_RANGE: () => ({ min: PUBLIC_MIN_YEAR, max: PUBLIC_MAX_YEAR }),
};
