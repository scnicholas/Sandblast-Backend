"use strict";

/**
<<<<<<< HEAD
 * Utils/musicKnowledge.js — v2.64
 *
 * FIXES IN v2.64:
 *  0) Add explicit startup log for 1950–1959 singles cache (counts by year), plus missing-file diagnostics.
 *  1) Auto hot-reload for Wikipedia 1950–1959 Year-End Singles cache.
 *     - Track file mtime; if the cache file changed, reload it on demand.
 *     - Fixes "still missing 1951" after rebuild without requiring server restart.
 *  2) If a 1950s year is requested and appears missing, attempt one forced reload,
 *     then re-check year availability before returning "missing slice" messaging.
=======
 * Utils/musicKnowledge.js — v2.58
 *
 * FIXES IN v2.58:
 *  - 1950–1959 Billboard Year-End Singles: always serve from Wikipedia cache when present.
 *  - For 1950–1959 Year-End Singles, enforce sequential ranks (1..N) so UI never shows gaps (e.g., 1,2,3,5...).
 *  - Light cleanup for wrapping quotes + extra whitespace on title/artist during normalization.
 *
 * Keeps v2.57 behavior elsewhere:
 *  - If Wikipedia does NOT contain the requested 50s year, DO NOT fall back to DB placeholders.
 *    Instead return empty so UX can say "not available yet" rather than "Unknown Title".
 *  - Adds warning if a 50s year is missing from the Wikipedia rows.
>>>>>>> 22d52c0 (musicKnowledge v2.58: normalize 50s Year-End Singles ranks + clean fields)
 */

const fs = require("fs");
const path = require("path");

// =========================
// Version
// =========================
const MK_VERSION =
<<<<<<< HEAD
  "musicKnowledge v2.64 (50s cache hot-reload + forced reload + explicit cache-load logging)";

// =========================
// Constants / Paths
// =========================
const PUBLIC_MIN_YEAR = 1950;
const PUBLIC_MAX_YEAR = 2024;

const WIKI_YEAREND_HOT100_1970_2010 = "Data/wikipedia/billboard_yearend_hot100_1970_2010.json";
const WIKI_YEAREND_SINGLES_1950_1959 = "Data/wikipedia/billboard_yearend_singles_1950_1959.json";
=======
  "musicKnowledge v2.58 (50s year-end singles ranks normalized + light quote cleanup; retains v2.57 behavior)";

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
>>>>>>> 22d52c0 (musicKnowledge v2.58: normalize 50s Year-End Singles ranks + clean fields)

// =========================
// Internal State
// =========================
let DB = null;
let DB_PATH = null;

<<<<<<< HEAD
let STATS = {
  loaded: false,
  moments: 0,
  charts: [],
  yearsMin: null,
  yearsMax: null,
=======
const BY_YEAR = new Map();
const BY_YEAR_CHART = new Map();

const STATS = { moments: 0, yearMin: null, yearMax: null, charts: [] };
const BUCKET_CACHE = new Map();

// Authoritative cache for 1950–1959 Year-End Singles
const WIKI_SINGLES_50S_BY_YEAR = new Map();
let WIKI_SINGLES_50S_LOADED = false;

const toInt = (x) => {
  const s = String(x ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
>>>>>>> 22d52c0 (musicKnowledge v2.58: normalize 50s Year-End Singles ranks + clean fields)
};

let WIKI_YEAREND_HOT100 = null;

<<<<<<< HEAD
// 1950–1959 Year-End Singles cache
let WIKI_SINGLES_50S_LOADED = false;
const WIKI_SINGLES_50S_BY_YEAR = new Map();
=======
function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

// v2.58: strip wrapping quotes and normalize whitespace for display safety
function cleanField(s) {
  let t = cleanText(s);
  // remove wrapping quotes like: " Title "
  t = t.replace(/^"\s*/g, "").replace(/\s*"$/g, "");
  return cleanText(t);
}

// v2.58: renumber a list sequentially by existing rank order
function renumberSequentialByRank(rows, limit) {
  const ranked = (rows || []).filter((m) => m && m.rank != null);
  ranked.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const out = ranked.slice(0, Math.max(1, limit || ranked.length));
  for (let i = 0; i < out.length; i++) out[i].rank = i + 1;
  return out;
}
>>>>>>> 22d52c0 (musicKnowledge v2.58: normalize 50s Year-End Singles ranks + clean fields)

// v2.64: track mtime so we can hot-reload when rebuild scripts rewrite the file
let WIKI_SINGLES_50S_LAST_MTIME_MS = 0;

// =========================
// Helpers
// =========================
function resolveRepoPath(rel) {
  // In Render, process.cwd() is repo root for Node service
  return path.resolve(process.cwd(), rel);
}

<<<<<<< HEAD
function safeJsonParseFile(absPath) {
  try {
    const raw = fs.readFileSync(absPath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function toInt(x) {
  const n = parseInt(String(x || "").trim(), 10);
  return Number.isFinite(n) ? n : NaN;
}

function normText(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}
=======
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

  // Sort and warn for missing years
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
   WIKIPEDIA MERGES (logs retained)
========================= */

function mergeWikipediaYearEnd(moments) {
  const abs = resolveRepoPath(WIKI_YEAREND_COMBINED);
  if (!fs.existsSync(abs)) return moments;
>>>>>>> 22d52c0 (musicKnowledge v2.58: normalize 50s Year-End Singles ranks + clean fields)

function isNonEmpty(s) {
  return !!normText(s);
}

function chartLabel(c) {
  return normText(c);
}

<<<<<<< HEAD
function uniq(arr) {
  return Array.from(new Set(arr));
}

function getWikiSingles50sFileMtimeMs() {
  const abs = resolveRepoPath(WIKI_YEAREND_SINGLES_1950_1959);
  try {
    const st = fs.statSync(abs);
    return st && st.mtimeMs ? st.mtimeMs : 0;
  } catch (_) {
    return 0;
  }
}

// v2.64: load with optional force + mtime change detection
function loadWikiSingles50sOnce({ force = false } = {}) {
  const abs = resolveRepoPath(WIKI_YEAREND_SINGLES_1950_1959);

  const mtimeMs = getWikiSingles50sFileMtimeMs();
  const changedOnDisk =
    mtimeMs && WIKI_SINGLES_50S_LAST_MTIME_MS && mtimeMs !== WIKI_SINGLES_50S_LAST_MTIME_MS;

  if (changedOnDisk) {
    console.log(
      `[musicKnowledge] 50s Singles cache changed on disk (mtimeMs=${mtimeMs}); reloading.`
    );
  }

  if (force || changedOnDisk) {
    WIKI_SINGLES_50S_BY_YEAR.clear();
    WIKI_SINGLES_50S_LOADED = false;
  }

  if (WIKI_SINGLES_50S_LOADED) return;
  WIKI_SINGLES_50S_LOADED = true;
=======
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
>>>>>>> 22d52c0 (musicKnowledge v2.58: normalize 50s Year-End Singles ranks + clean fields)

  if (!fs.existsSync(abs)) {
    console.warn(`[musicKnowledge] 50s Singles cache file not found: ${abs}`);
    return;
  }

  WIKI_SINGLES_50S_LAST_MTIME_MS = mtimeMs || getWikiSingles50sFileMtimeMs();

  const j = safeJsonParseFile(abs);
  const rows = j && Array.isArray(j.rows) ? j.rows : [];

  // Pre-seed map with empty arrays
  for (let y = 1950; y <= 1959; y++) WIKI_SINGLES_50S_BY_YEAR.set(y, []);

  for (const r of rows) {
    const y = toInt(r.year);
    const rk = toInt(r.rank);
    const title = normText(r.title);
    const artist = normText(r.artist);

    if (!Number.isFinite(y) || y < 1950 || y > 1959) continue;
    if (!Number.isFinite(rk) || rk <= 0) continue;

    // Title can be empty in some wiki rows—keep it but we’ll diagnose it later in moment rendering
    const entry = {
      year: y,
      rank: rk,
      title: title,
      artist: artist,
      source: "wikipedia",
      chart: "Billboard Year-End Singles",
    };

    const arr = WIKI_SINGLES_50S_BY_YEAR.get(y) || [];
    arr.push(entry);
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

  // v2.64: Explicit load confirmation log (this is what you asked to see)
  try {
    const counts = {};
    for (let y = 1950; y <= 1959; y++) counts[y] = (WIKI_SINGLES_50S_BY_YEAR.get(y) || []).length;
    console.log(`[musicKnowledge] 50s Singles cache loaded: counts=${JSON.stringify(counts)}`);
  } catch (_) {}
}

function hasWikiSingles50sYear(year) {
  loadWikiSingles50sOnce({ force: false });
  const arr = WIKI_SINGLES_50S_BY_YEAR.get(year);
  return Array.isArray(arr) && arr.length > 0;
}

// v2.64: attempt a forced reload once if a year is requested and appears missing
function ensureWikiSingles50sYear(year) {
  if (hasWikiSingles50sYear(year)) return true;

  // one forced reload attempt
  loadWikiSingles50sOnce({ force: true });
  return hasWikiSingles50sYear(year);
}

function clearWikiSingles50sCache() {
  WIKI_SINGLES_50S_BY_YEAR.clear();
  WIKI_SINGLES_50S_LOADED = false;
  WIKI_SINGLES_50S_LAST_MTIME_MS = 0;
}

// =========================
// Main DB Loader
// =========================
function loadDb(dbPath) {
  const abs = resolveRepoPath(dbPath);
  DB_PATH = abs;

  const j = safeJsonParseFile(abs);
  if (!j) {
    STATS.loaded = false;
    DB = null;
    return false;
  }

  DB = j;

  const moments = Array.isArray(DB.moments) ? DB.moments : [];
  const charts = moments.map((m) => chartLabel(m.chart)).filter(Boolean);

  let yMin = null;
  let yMax = null;
  for (const m of moments) {
    const y = toInt(m.year);
    if (!Number.isFinite(y)) continue;
    if (yMin === null || y < yMin) yMin = y;
    if (yMax === null || y > yMax) yMax = y;
  }

  STATS = {
    loaded: true,
    moments: moments.length,
    charts: uniq(charts),
    yearsMin: yMin,
    yearsMax: yMax,
  };

  // Load wiki year-end Hot100 1970–2010
  const wAbs = resolveRepoPath(WIKI_YEAREND_HOT100_1970_2010);
  WIKI_YEAREND_HOT100 = safeJsonParseFile(wAbs);

<<<<<<< HEAD
  // Load 50s year-end singles cache (and log counts)
  loadWikiSingles50sOnce({ force: false });
=======
  console.log(`[musicKnowledge] Loaded ${moments.length} moments (${minY}–${maxY})`);
  console.log(`[musicKnowledge] DB source: ${LOADED_FROM}`);
  console.log(`[musicKnowledge] Charts: ${STATS.charts.join(" | ")}`);
  console.log(`[musicKnowledge] ${MK_VERSION}`);
>>>>>>> 22d52c0 (musicKnowledge v2.58: normalize 50s Year-End Singles ranks + clean fields)

  return true;
}

<<<<<<< HEAD
// =========================
// Chart Selection Logic
// =========================
const CHARTS = {
  BILLBOARD_HOT100: "Billboard Hot 100",
  BILLBOARD_YEAREND_HOT100: "Billboard Year-End Hot 100",
  BILLBOARD_YEAREND_SINGLES: "Billboard Year-End Singles",
  CANADA_RPM: "Canada RPM",
  TOP40WEEKLY: "Top40Weekly Top 100",
  UK: "UK Singles Chart",
};

function chooseChartForYear(year, requestedChart) {
  const y = toInt(year);
  const req = chartLabel(requestedChart);

  // If user explicitly requests Year-End Singles, honor it first (1950–1959 only)
  if (req === CHARTS.BILLBOARD_YEAREND_SINGLES) {
    if (y >= 1950 && y <= 1959) {
      if (ensureWikiSingles50sYear(y)) return { ok: true, chart: CHARTS.BILLBOARD_YEAREND_SINGLES };
      return { ok: false, reason: "MISSING_50S_SINGLE_YEAR" };
    }
    return { ok: false, reason: "OUT_OF_RANGE_FOR_SINGLES" };
  }

  // Pre-Hot100 era: if someone asks for Hot100 for a 1950s year, route to Year-End Singles if available
  if (y >= 1950 && y <= 1959) {
    if (!req || req === CHARTS.BILLBOARD_HOT100 || req === CHARTS.BILLBOARD_YEAREND_HOT100) {
      if (ensureWikiSingles50sYear(y)) return { ok: true, chart: CHARTS.BILLBOARD_YEAREND_SINGLES };
      return { ok: false, reason: "MISSING_50S_SINGLE_YEAR" };
    }
  }

  // Default behavior: keep existing requested chart (or fallback)
  if (req) return { ok: true, chart: req };
  return { ok: true, chart: CHARTS.BILLBOARD_HOT100 };
}

// =========================
// Render Helpers
// =========================
function formatTopN(rows, n, label) {
  const out = [];
  const top = rows.slice(0, n);

  out.push(`Top ${n} — ${label}:`);
  for (let i = 0; i < top.length; i++) {
    const r = top[i];
    const rank = r.rank || i + 1;
    const artist = isNonEmpty(r.artist) ? r.artist : "Unknown Artist";
    const title = isNonEmpty(r.title) ? r.title : "Unknown Title";
    out.push(`${rank}. ${artist} — ${title}`);
  }
  return out.join("\n");
}

function getYearEndSinglesRows(year) {
  const y = toInt(year);
  if (!(y >= 1950 && y <= 1959)) return [];
  if (!ensureWikiSingles50sYear(y)) return [];
  return WIKI_SINGLES_50S_BY_YEAR.get(y) || [];
}

// =========================
// Conversational Entry
// =========================
function handleChat({ text, session }) {
  const msg = normText(text);

  session = session || {};
  session.activeMusicChart = session.activeMusicChart || CHARTS.BILLBOARD_HOT100;

  // Year-only input?
  const y = toInt(msg);
  if (Number.isFinite(y) && y >= PUBLIC_MIN_YEAR && y <= PUBLIC_MAX_YEAR) {
    const choice = chooseChartForYear(y, session.activeMusicChart);
    if (!choice.ok) {
      if (choice.reason === "MISSING_50S_SINGLE_YEAR") {
        return {
          reply: `I’m missing the ${y} Year-End Singles list in the current Wikipedia cache — so I won’t fake it. Try another 1950s year.`,
          followUp: null,
          session,
        };
      }
      if (choice.reason === "OUT_OF_RANGE_FOR_SINGLES") {
        return {
          reply: `Year-End Singles is only available for 1950–1959 in my current build. Try a year in that range.`,
          followUp: null,
          session,
        };
      }
      return { reply: `That year’s chart isn’t available yet.`, followUp: null, session };
    }

    const chart = choice.chart;
    session.activeMusicChart = chart;

    // 1950s Year-End Singles
    if (chart === CHARTS.BILLBOARD_YEAREND_SINGLES) {
      const rows = getYearEndSinglesRows(y);
      if (!rows.length) {
        return {
          reply: `I’m missing the ${y} Year-End Singles list in the current Wikipedia cache — so I won’t fake it. Try another 1950s year.`,
          followUp: null,
          session,
        };
      }

      // Render top 10 (or fewer if list smaller)
      const n = Math.min(10, rows.length);
      const label = `${CHARTS.BILLBOARD_YEAREND_SINGLES} (${y})`;
      const reply = formatTopN(rows, n, label) + `\n\nWant #1, a story moment, or another year?`;

      return {
        reply,
        followUp: null,
        session,
        chips: ["#1", "Story moment", "Another year"],
      };
    }

    // Fallback: if not singles, keep existing logic minimal (your main flows are elsewhere)
    return {
      reply: `Got it — ${y}. Which chart should I use? (Hot 100 / Year-End Hot 100 / Year-End Singles)`,
      followUp: null,
      session,
    };
  }

  // Lane prompt handling (very lightweight)
  if (/^music$/i.test(msg)) {
    session.activeMusicChart = CHARTS.BILLBOARD_HOT100;
    return {
      reply: `Alright—music. Give me a year (1950–2024) or an artist + year, and I’ll pull something memorable.`,
      followUp: null,
      session,
    };
  }

  // Default
  return {
    reply: `Tell me a year (1950–2024), or an artist + year.`,
    followUp: null,
    session,
  };
}

// =========================
// Public API
// =========================
module.exports = {
  init: ({ dbPath }) => loadDb(dbPath),
  getStats: () => ({ ...STATS }),
  MK_VERSION: () => MK_VERSION,
  handleChat,
  PUBLIC_RANGE: () => ({ min: PUBLIC_MIN_YEAR, max: PUBLIC_MAX_YEAR }),

  // v2.64: export reload helper (useful for index.js debug routes if you want)
  reloadWikiSingles50s: () => loadWikiSingles50sOnce({ force: true }),
  clearWikiSingles50sCache,
=======
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

  // v2.58: 50s singles: serve from Wikipedia cache + normalize ranks sequentially.
  // v2.57 behavior preserved: if cache missing/empty for requested year, return empty (no DB placeholders).
  if (c === YEAR_END_SINGLES_CHART && y >= 1950 && y <= 1959) {
    const arr = WIKI_SINGLES_50S_BY_YEAR.get(y) || [];
    if (arr.length) return renumberSequentialByRank(arr, limit);
    return [];
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

  return `Top ${Math.min(limit, lines.length)} — ${finalChart} (${year}):\n${lines.join(
    "\n"
  )}`;
}

function pickFollowUpYears() {
  const cands = [1950, 1951, 1955, 1960, 1970, 1984, 1999, 2010, 2020, 2024];
  const out = [];
  for (const y of cands) {
    if (y >= PUBLIC_MIN_YEAR && y <= PUBLIC_MAX_YEAR && !out.includes(y))
      out.push(y);
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

  const publicRange = `${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}`;

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

    // v2.57 behavior retained: if 50s singles year is missing, say it plainly.
    if (finalChart === YEAR_END_SINGLES_CHART && year >= 1950 && year <= 1959) {
      const yrs = [1956, 1957, 1958].filter((x) => x !== year);
      return {
        reply: `I don’t have a clean Year-End Singles list for ${year} loaded yet. Once we rebuild the ${year} Wikipedia slice, I’ll serve it perfectly.`,
        followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, "Try: 1956"],
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

  const yrs = pickFollowUpYears();
  return {
    reply: `Give me a year (${publicRange}) or an artist + year (example: “Prince 1984”).`,
    followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, "Try: Prince 1984"],
    domain: "music",
  };
}

module.exports = {
  getTopByYear,
  getNumberOneByYear,
  STATS: () => {
    loadDb();
    return { ...STATS };
  },
  MK_VERSION: () => MK_VERSION,
  handleChat,
  PUBLIC_RANGE: () => ({ min: PUBLIC_MIN_YEAR, max: PUBLIC_MAX_YEAR }),
>>>>>>> 22d52c0 (musicKnowledge v2.58: normalize 50s Year-End Singles ranks + clean fields)
};
