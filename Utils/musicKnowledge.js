"use strict";

/**
 * Utils/musicKnowledge.js — v2.56
 *
 * FIXES IN v2.56:
 *  - Authoritative 1950–1959 Year-End Singles are served DIRECTLY from the Wikipedia file at query time.
 *    This bypasses DB placeholders and merge/index contamination entirely for that slice.
 *  - Builds an in-memory WIKI_SINGLES_50S_BY_YEAR cache (ranked, clean).
 *  - If the Wikipedia file is missing a year slice, we fall back gracefully (but will NOT prefer placeholders).
 *
 * RETAINS v2.55 BEHAVIOR:
 *  - Dedupe + priority merge
 *  - Year-end rankless passthrough drop
 *  - Buckets cache
 *  - Chart normalization hardening
 *  - 1988 George Harrison fix
 *  - Year-end routing logic (50s: Hot 100 -> Year-End Singles)
 */

const fs = require("fs");
const path = require("path");

const MK_VERSION =
  "musicKnowledge v2.56 (authoritative 50s singles served from Wikipedia; retains v2.55 behavior)";

const DEFAULT_CHART = "Billboard Hot 100";
const TOP40_CHART = "Top40Weekly Top 100";
const YEAR_END_CHART = "Billboard Year-End Hot 100";
const YEAR_END_SINGLES_CHART = "Billboard Year-End Singles";

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

const WIKI_YEAREND_SINGLES_1950_1959 =
  "Data/wikipedia/billboard_yearend_singles_1950_1959.json";

const BUCKETS_BASE_DIR = "Data/_buckets/music";

/* =========================
   INTERNAL STATE
========================= */

let DB = null;
let INDEX_BUILT = false;
let LOADED_FROM = null;

const BY_YEAR = new Map();
const BY_YEAR_CHART = new Map();

const STATS = { moments: 0, yearMin: null, yearMax: null, charts: [] };
const BUCKET_CACHE = new Map();

// v2.56: Authoritative cache for 1950–1959 Year-End Singles
// Map<number year, Array<moment>>
const WIKI_SINGLES_50S_BY_YEAR = new Map();
let WIKI_SINGLES_50S_LOADED = false;

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

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function coerceRank(m) {
  const raw =
    m.rank ?? m.position ?? m.no ?? m.pos ?? m.number ?? m["no."] ?? m["#"];
  const n = toInt(raw);
  return n && n >= 1 && n <= 100 ? n : null;
}

function normKey(s) {
  return cleanText(String(s || "")).toLowerCase();
}

function resolveRepoPath(rel) {
  if (path.isAbsolute(rel)) return rel;
  if (DATA_DIR_ENV) return path.resolve(DATA_DIR_ENV, rel);
  return path.resolve(__dirname, "..", rel);
}

function slugifyChart(name) {
  return String(name || "unknown")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/* =========================
   CHART NORMALIZATION
========================= */

function normalizeChart(chart) {
  const raw = chart || DEFAULT_CHART;
  const rawKey = normKey(raw);

  if (
    rawKey === "billboard year-end singles" ||
    rawKey === "billboard year end singles" ||
    rawKey === "year-end singles" ||
    rawKey === "year end singles" ||
    rawKey === "billboard year-end single" ||
    rawKey === "billboard year end single"
  ) {
    return YEAR_END_SINGLES_CHART;
  }

  const c = rawKey;

  if (
    c.includes("year") &&
    c.includes("end") &&
    (c.includes("single") ||
      c.includes("singles") ||
      c.includes("top 30") ||
      c.includes("top 50"))
  ) {
    return YEAR_END_SINGLES_CHART;
  }

  if (c.includes("year") && c.includes("end")) return YEAR_END_CHART;
  if (c.includes("top40")) return TOP40_CHART;
  if (c.includes("billboard") || c.includes("hot 100") || c.includes("hot100"))
    return DEFAULT_CHART;

  return raw;
}

function isYearEndChart(chart) {
  const c = normKey(chart);
  if (c.includes("year") && c.includes("end")) return true;
  return normalizeChart(chart) === YEAR_END_SINGLES_CHART;
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

  if (year != null) m.year = year;
  if (rank != null) m.rank = rank;

  return m;
}

/* =========================
   WIKI 50s SINGLES LOADER (v2.56)
========================= */

function loadWikiSingles50sOnce() {
  if (WIKI_SINGLES_50S_LOADED) return;
  WIKI_SINGLES_50S_LOADED = true;

  const abs = resolveRepoPath(WIKI_YEAREND_SINGLES_1950_1959);
  if (!fs.existsSync(abs)) return;

  const doc = JSON.parse(fs.readFileSync(abs, "utf8"));
  const rows = Array.isArray(doc?.rows)
    ? doc.rows
    : Array.isArray(doc?.moments)
      ? doc.moments
      : Array.isArray(doc)
        ? doc
        : [];

  for (const r of rows) {
    const y = toInt(r.year);
    const rk = toInt(r.rank);
    if (!y || !rk) continue;

    const m = normalizeMoment({
      chart: YEAR_END_SINGLES_CHART,
      year: y,
      rank: rk,
      title: r.title,
      artist: r.artist,
      source: abs,
    });

    // Only store clean authoritative rows
    if (
      m.rank == null ||
      !_t(m.title) ||
      m.title === "Unknown Title" ||
      !_t(m.artist) ||
      m.artist === "Unknown Artist"
    ) {
      continue;
    }

    const arr = WIKI_SINGLES_50S_BY_YEAR.get(y) || [];
    arr.push(m);
    WIKI_SINGLES_50S_BY_YEAR.set(y, arr);
  }

  // Sort each year by rank
  for (const [y, arr] of WIKI_SINGLES_50S_BY_YEAR.entries()) {
    arr.sort((a, b) => a.rank - b.rank);
    WIKI_SINGLES_50S_BY_YEAR.set(y, arr);
  }
}

/* =========================
   PRIORITY + DEDUPE
========================= */

function srcPriority(row) {
  const chart = normalizeChart(row.chart);
  const y = toInt(row.year);
  const src = String(row.source || row.dbSource || row.origin || "").toLowerCase();

  if (chart === YEAR_END_SINGLES_CHART && y != null && y >= 1950 && y <= 1959) {
    if (src.includes("wikipedia.org") || src.includes("wikipedia")) return 1000;
    return 100;
  }

  if (src.includes("wikipedia.org") || src.includes("wikipedia")) return 500;

  const title = _t(row.title);
  const artist = _t(row.artist);
  const nonPlaceholder =
    title && title !== "Unknown Title" && artist && artist !== "Unknown Artist";
  if (nonPlaceholder) return 200;

  return 50;
}

function shouldDropNoKeyRow(m) {
  const y = toInt(m.year);
  const chart = normalizeChart(m.chart);
  if (isYearEndChart(chart) && y != null) return true;
  return false;
}

function dedupeMomentsByPriority(moments) {
  const out = new Map();
  const passthrough = [];

  for (const raw of moments) {
    const m = normalizeMoment(raw);

    const chart = normalizeChart(m.chart);
    const y = toInt(m.year);
    const rk = toInt(m.rank);

    const key = chart && y != null && rk != null ? `${chart}|${y}|${rk}` : null;

    if (!key) {
      if (!shouldDropNoKeyRow(m)) passthrough.push(m);
      continue;
    }

    const prev = out.get(key);
    if (!prev) {
      out.set(key, m);
      continue;
    }

    if (srcPriority(m) > srcPriority(prev)) {
      out.set(key, m);
    }
  }

  return [...out.values(), ...passthrough];
}

/* =========================
   WIKIPEDIA MERGES (logs retained)
========================= */

function mergeWikipediaYearEnd(moments) {
  const abs = resolveRepoPath(WIKI_YEAREND_COMBINED);
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
        source: abs,
      })
    );
  }

  console.log(`[musicKnowledge] Wikipedia Year-End merge: source=${abs} rows=${merged.length}`);
  return moments.concat(merged);
}

function mergeWikipediaYearEndSingles50s(moments) {
  const abs = resolveRepoPath(WIKI_YEAREND_SINGLES_1950_1959);
  if (!fs.existsSync(abs)) return moments;

  const doc = JSON.parse(fs.readFileSync(abs, "utf8"));
  const rows = Array.isArray(doc?.rows)
    ? doc.rows
    : Array.isArray(doc?.moments)
      ? doc.moments
      : Array.isArray(doc)
        ? doc
        : [];

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
        chart: YEAR_END_SINGLES_CHART,
        source: abs,
      })
    );
  }

  console.log(`[musicKnowledge] Wikipedia Year-End Singles merge: source=${abs} rows=${merged.length}`);
  return moments.concat(merged);
}

/* =========================
   DB LOAD + INDEX
========================= */

function loadDb() {
  if (DB && INDEX_BUILT) return DB;

  // v2.56: preload authoritative 50s singles cache
  loadWikiSingles50sOnce();

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

  // Stamp DB source for priority decisions
  if (Array.isArray(moments) && LOADED_FROM) {
    for (const m of moments) {
      if (m && typeof m === "object" && !m.source) m.source = LOADED_FROM;
    }
  }

  moments = mergeWikipediaYearEnd(moments);
  moments = mergeWikipediaYearEndSingles50s(moments);

  moments = dedupeMomentsByPriority(moments);

  DB = { moments };
  BY_YEAR.clear();
  BY_YEAR_CHART.clear();

  let minY = null, maxY = null;
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

  console.log(`[musicKnowledge] Loaded ${moments.length} moments (${minY}–${maxY})`);
  console.log(`[musicKnowledge] DB source: ${LOADED_FROM}`);
  console.log(`[musicKnowledge] Charts: ${STATS.charts.join(" | ")}`);
  console.log(`[musicKnowledge] ${MK_VERSION}`);

  return DB;
}

/* =========================
   BUCKET LOADER
========================= */

function bucketPathFor(chart, year) {
  const c = normalizeChart(chart);
  const slug = slugifyChart(c);
  const y = toInt(year);
  if (!y) return null;

  const base = resolveRepoPath(BUCKETS_BASE_DIR);
  return path.join(base, slug, `${y}.json`);
}

function readBucket(chart, year) {
  const c = normalizeChart(chart);
  const y = toInt(year);
  if (!y) return null;

  const key = `${c}|${y}`;
  if (BUCKET_CACHE.has(key)) return BUCKET_CACHE.get(key);

  const p = bucketPathFor(c, y);
  if (!p || !fs.existsSync(p)) return null;

  try {
    const arr = JSON.parse(fs.readFileSync(p, "utf8"));
    const out = Array.isArray(arr) ? arr.map(normalizeMoment) : [];
    BUCKET_CACHE.set(key, out);
    return out;
  } catch {
    return null;
  }
}

/* =========================
   QUERIES
========================= */

function getTopByYear(year, chart = DEFAULT_CHART, limit = 10) {
  loadDb();
  const y = toInt(year);
  if (!y) return [];

  const c = normalizeChart(chart);

  // v2.56: authoritative 50s singles come straight from Wikipedia cache
  if (c === YEAR_END_SINGLES_CHART && y >= 1950 && y <= 1959) {
    const arr = WIKI_SINGLES_50S_BY_YEAR.get(y) || [];
    if (arr.length) return arr.slice(0, Math.max(1, limit));
    // If missing for some reason, do NOT default to placeholders; fall through to index
  }

  let out = BY_YEAR_CHART.get(`${y}|${c}`) || [];

  if (!out.length) {
    const b = readBucket(c, y);
    if (Array.isArray(b) && b.length) out = b;
  }

  if (!out.length && isYearEndChart(c)) {
    out = BY_YEAR_CHART.get(`${y}|${DEFAULT_CHART}`) || [];
    if (!out.length) {
      const b1 = readBucket(DEFAULT_CHART, y);
      if (Array.isArray(b1) && b1.length) out = b1;
    }
    if (!out.length) {
      out = BY_YEAR_CHART.get(`${y}|${TOP40_CHART}`) || [];
      if (!out.length) {
        const b2 = readBucket(TOP40_CHART, y);
        if (Array.isArray(b2) && b2.length) out = b2;
      }
    }
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
   CHART RANGES
========================= */

const CHART_RANGES = new Map();

function buildChartRanges() {
  loadDb();
  if (CHART_RANGES.size) return;

  const perChart = new Map();
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

  // v2.56: ensure 50s singles range exists even if BY_YEAR_CHART is polluted
  for (const y of WIKI_SINGLES_50S_BY_YEAR.keys()) {
    const cur = perChart.get(YEAR_END_SINGLES_CHART) || { min: null, max: null, years: new Set() };
    cur.min = cur.min == null ? y : Math.min(cur.min, y);
    cur.max = cur.max == null ? y : Math.max(cur.max, y);
    cur.years.add(y);
    perChart.set(YEAR_END_SINGLES_CHART, cur);
  }

  for (const [chart, v] of perChart.entries()) {
    CHART_RANGES.set(chart, { min: v.min, max: v.max, countYears: v.years.size });
  }
}

function getChartYearRange(chart) {
  buildChartRanges();
  const c = normalizeChart(chart || DEFAULT_CHART);
  const r = CHART_RANGES.get(c);

  if (r && r.min != null && r.max != null) return { chart: c, ...r };

  loadDb();
  return { chart: c, min: STATS.yearMin, max: STATS.yearMax, countYears: null };
}

function getAvailableCharts() {
  loadDb();
  return [...(STATS.charts || [])];
}

function getMusicRangeText(chart) {
  const r = getChartYearRange(chart);
  const min = r?.min ?? STATS.yearMin ?? 1950;
  const max = r?.max ?? STATS.yearMax ?? 2024;
  return `${min}–${max}`;
}

function getPublicRangeText() {
  return `${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}`;
}

/* =========================
   CONVERSATIONAL ROUTING
========================= */

function chooseChartForYear(requestedChart, year) {
  const y = toInt(year);
  const c = normalizeChart(requestedChart || DEFAULT_CHART);

  if (y != null && y >= 1950 && y <= 1959) {
    if (c === YEAR_END_CHART || c === DEFAULT_CHART) return YEAR_END_SINGLES_CHART;
    if (c === YEAR_END_SINGLES_CHART) return YEAR_END_SINGLES_CHART;
  }

  if (c === YEAR_END_SINGLES_CHART && y != null && (y < 1950 || y > 1959)) {
    if (y >= 1970 && y <= 2010) return YEAR_END_CHART;
    return DEFAULT_CHART;
  }

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
  const finalChart = normalizeChart(chart);
  const list = getTopByYear(year, finalChart, limit);
  if (!list.length) return null;

  const lines = list.map((m, i) => {
    const rk = m.rank != null ? String(m.rank) : String(i + 1);
    const a = _t(m.artist) || "Unknown Artist";
    const t = _t(m.title) || "Unknown Title";
    return `${rk}. ${a} — ${t}`;
  });

  return `Top ${Math.min(limit, lines.length)} — ${finalChart} (${year}):\n${lines.join("\n")}`;
}

function pickFollowUpYears() {
  const cands = [1950, 1951, 1955, 1960, 1970, 1984, 1999, 2010, 2020, 2024];
  const out = [];
  for (const y of cands) {
    if (y >= PUBLIC_MIN_YEAR && y <= PUBLIC_MAX_YEAR && !out.includes(y)) out.push(y);
    if (out.length >= 3) break;
  }
  return out;
}

function handleChat({ text, session } = {}) {
  loadDb();

  const userText = cleanText(text);
  const st = session && typeof session === "object" ? session : {};

  const requestedChart =
    st.activeMusicChart || st.musicChart || st.activeChart || st.chart || null;

  const publicRange = getPublicRangeText();

  if (!userText) {
    const yrs = pickFollowUpYears();
    return {
      reply: `Music—nice. Give me a year (${publicRange}) or an artist + year, and I’ll pull something memorable.`,
      followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, "Try: Prince 1984"],
      domain: "music",
    };
  }

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

    const finalChart = chooseChartForYear(requestedChart, year);
    const formatted = formatTopList(year, finalChart, 10);

    if (formatted) {
      return {
        reply: `${formatted}\n\nWant #1, a story moment, or another year?`,
        followUp: ["#1", "Story moment", "Another year"],
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

    const finalChart = chooseChartForYear(requestedChart, ay.year);
    const formatted = formatTopList(ay.year, finalChart, 10);
    if (formatted) {
      return {
        reply: `${formatted}\n\nIf you tell me the exact song title by ${ay.artist || "that artist"}, I’ll give you a quick story moment.`,
        followUp: ["Story moment", "Another year", "#1"],
        domain: "music",
      };
    }
  }

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

  STATS: () => {
    loadDb();
    return { ...STATS };
  },
  MK_VERSION: () => MK_VERSION,

  getChartYearRange,
  getMusicRangeText,
  getPublicRangeText,
  getAvailableCharts,

  CHART_RANGES: () => {
    buildChartRanges();
    const out = {};
    for (const [k, v] of CHART_RANGES.entries()) out[k] = { ...v };
    return out;
  },

  BUCKETS: () => ({
    baseDir: BUCKETS_BASE_DIR,
    hasAnyCache: BUCKET_CACHE.size > 0,
  }),

  handleChat,

  PUBLIC_RANGE: () => ({ min: PUBLIC_MIN_YEAR, max: PUBLIC_MAX_YEAR }),
};
