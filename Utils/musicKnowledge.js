"use strict";

/**
 * Utils/musicKnowledge.js — v2.60
 *
 * NEW IN v2.60:
 *  - Moment Intelligence schema (MomentCard) + safe template enrichment
 *  - "Story moment" routing: supports "#1", "number one", "story", "story moment"
 *    even when user does NOT repeat the year (uses lastMusicYear/lastMusicChart if present)
 *  - Nyx-aligned Music voice: broadcast-warm, decisive, no robotic "tap a chip" language
 *  - Optional sessionPatch returned to support continuity (index.js can merge into session)
 *
 * Retains v2.59:
 *  - Render-time global rank-gap repair (formatTopList)
 *  - 1950–1959 Year-End Singles served from Wikipedia cache when present; no DB placeholders fallback
 *  - Sequential ranks enforced for 50s singles
 *  - Title/artist cleanField normalization
 *  - Priority + dedupe logic and Wikipedia merges
 */

const fs = require("fs");
const path = require("path");

const MK_VERSION =
  "musicKnowledge v2.60 (Moment Intelligence schema + Nyx voice alignment + story moment routing; retains v2.59 fixes)";

const DEFAULT_CHART = "Billboard Hot 100";
const TOP40_CHART = "Top40Weekly Top 100";
const YEAR_END_CHART = "Billboard Year-End Hot 100";
const YEAR_END_SINGLES_CHART = "Billboard Year-End Singles";

const PUBLIC_MIN_YEAR = 1950;
const PUBLIC_MAX_YEAR = 2024;

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

let DB = null;
let INDEX_BUILT = false;
let LOADED_FROM = null;

const BY_YEAR = new Map();
const BY_YEAR_CHART = new Map();

const STATS = { moments: 0, yearMin: null, yearMax: null, charts: [] };
const BUCKET_CACHE = new Map();

// Authoritative cache for 1950–1959 Year-End Singles
const WIKI_SINGLES_50S_BY_YEAR = new Map();
let WIKI_SINGLES_50S_LOADED = false;

/* =========================
   BASIC UTILS
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

// strip wrapping quotes and normalize whitespace for display safety
function cleanField(s) {
  let t = cleanText(s);
  t = t.replace(/^"\s*/g, "").replace(/\s*"$/g, "");
  return cleanText(t);
}

// renumber a list sequentially by existing rank order
function renumberSequentialByRank(rows, limit) {
  const ranked = (rows || []).filter((m) => m && m.rank != null);
  ranked.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const out = ranked.slice(0, Math.max(1, limit || ranked.length));
  for (let i = 0; i < out.length; i++) out[i].rank = i + 1;
  return out;
}

// render-time rank repair helper (preserve existing order; overwrite ranks 1..N)
function renumberSequentialPreserveOrder(rows) {
  const out = (rows || []).slice();
  for (let i = 0; i < out.length; i++) out[i].rank = i + 1;
  return out;
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

function normalizeMoment(m) {
  if (!m || typeof m !== "object") return m;

  let artist = cleanField(_t(m.artist));
  let title = cleanField(_t(m.title));
  const year = toInt(m.year);
  const rank = coerceRank(m);

  // Hard fix — 1988 #3 George Harrison
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

function isCleanMoment(m) {
  return (
    m &&
    Number.isFinite(toInt(m.rank)) &&
    _t(m.title) &&
    m.title !== "Unknown Title" &&
    _t(m.artist) &&
    m.artist !== "Unknown Artist"
  );
}

/* =========================
   WIKI 50s SINGLES CACHE
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

    if (!isCleanMoment(m)) continue;

    const arr = WIKI_SINGLES_50S_BY_YEAR.get(y) || [];
    arr.push(m);
    WIKI_SINGLES_50S_BY_YEAR.set(y, arr);
  }

  for (let y = 1950; y <= 1959; y++) {
    const arr = WIKI_SINGLES_50S_BY_YEAR.get(y) || [];
    arr.sort((a, b) => a.rank - b.rank);
    if (!arr.length) {
      console.warn(
        `[musicKnowledge] WARNING: Wikipedia 50s singles missing year ${y} in rows payload.`
      );
    }
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
  if (isCleanMoment(row)) return 200;
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

    if (srcPriority(m) > srcPriority(prev)) out.set(key, m);
  }

  return [...out.values(), ...passthrough];
}

/* =========================
   WIKIPEDIA MERGES
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

  console.log(
    `[musicKnowledge] Wikipedia Year-End merge: source=${abs} rows=${merged.length}`
  );
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

  console.log(
    `[musicKnowledge] Wikipedia Year-End Singles merge: source=${abs} rows=${merged.length}`
  );
  return moments.concat(merged);
}

/* =========================
   DB LOAD + INDEX
========================= */

function loadDb() {
  if (DB && INDEX_BUILT) return DB;

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

  // 50s singles: serve from Wikipedia cache + normalize ranks sequentially.
  // If cache missing/empty for requested year, return empty (no DB placeholders).
  if (c === YEAR_END_SINGLES_CHART && y >= 1950 && y <= 1959) {
    const arr = WIKI_SINGLES_50S_BY_YEAR.get(y) || [];
    if (arr.length) return renumberSequentialByRank(arr, limit);
    return [];
  }

  let out = BY_YEAR_CHART.get(`${y}|${c}`) || [];

  if (!out.length) {
    const b = readBucket(c, y);
    if (Array.isArray(b) && b.length) out =
