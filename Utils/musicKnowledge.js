"use strict";

/**
 * Utils/musicKnowledge.js — v2.65
 *
 * Consolidated fixes:
 *  - Rebase conflict resolved; removed duplicate blocks + conflict markers.
 *  - 1950–1959 Billboard Year-End Singles:
 *      - Serve from Wikipedia cache when present (authoritative for 50s singles)
 *      - Renumber ranks sequentially (1..N) to avoid gaps
 *      - Light cleanup for wrapping quotes + whitespace on title/artist
 *      - If a 50s year slice is missing, do NOT fall back to DB placeholders
 *  - v2.64 retained:
 *      - Explicit startup log for 50s singles cache counts by year
 *      - Hot-reload by mtime; forced reload once if a requested 50s year appears missing
 */

const fs = require("fs");
const path = require("path");

// =========================
// Version
// =========================
const MK_VERSION =
  "musicKnowledge v2.65 (rebase-resolved; 50s singles hot-reload + forced reload + sequential ranks + clean fields)";

// =========================
// Charts / Public Range
// =========================
const DEFAULT_CHART = "Billboard Hot 100";
const TOP40_CHART = "Top40Weekly Top 100";
const YEAR_END_CHART = "Billboard Year-End Hot 100";
const YEAR_END_SINGLES_CHART = "Billboard Year-End Singles";

const PUBLIC_MIN_YEAR = 1950;
const PUBLIC_MAX_YEAR = 2024;

// =========================
// Paths
// =========================
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

const WIKI_YEAREND_COMBINED = "Data/wikipedia/billboard_yearend_hot100_1970_2010.json";
const WIKI_YEAREND_SINGLES_1950_1959 = "Data/wikipedia/billboard_yearend_singles_1950_1959.json";

const BUCKETS_BASE_DIR = "Data/_buckets/music";

// =========================
// Internal State
// =========================
let DB = null;
let LOADED_FROM = null;
let INDEX_BUILT = false;

const BY_YEAR = new Map();
const BY_YEAR_CHART = new Map();

const STATS = { moments: 0, yearMin: null, yearMax: null, charts: [] };
const BUCKET_CACHE = new Map();

// Authoritative cache for 1950–1959 Year-End Singles
const WIKI_SINGLES_50S_BY_YEAR = new Map();
let WIKI_SINGLES_50S_LOADED = false;
let WIKI_SINGLES_50S_LAST_MTIME_MS = 0;

// =========================
// Helpers
// =========================
const _t = (x) => (x == null ? "" : String(x));

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function cleanField(s) {
  let t = cleanText(s);
  t = t.replace(/^"\s*/g, "").replace(/\s*"$/g, "");
  return cleanText(t);
}

function toInt(x) {
  const s = String(x ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normKey(s) {
  return cleanText(String(s || "")).toLowerCase();
}

function resolveRepoPath(rel) {
  if (path.isAbsolute(rel)) return rel;
  if (DATA_DIR_ENV) return path.resolve(DATA_DIR_ENV, rel);
  // Utils/.. => repo root in typical Render layout (/opt/render/project/src)
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
    (c.includes("single") || c.includes("singles") || c.includes("top 30") || c.includes("top 50"))
  ) {
    return YEAR_END_SINGLES_CHART;
  }

  if (c.includes("year") && c.includes("end")) return YEAR_END_CHART;
  if (c.includes("top40")) return TOP40_CHART;
  if (c.includes("billboard") || c.includes("hot 100") || c.includes("hot100")) return DEFAULT_CHART;

  return raw;
}

function isYearEndChart(chart) {
  const c = normKey(chart);
  if (c.includes("year") && c.includes("end")) return true;
  return normalizeChart(chart) === YEAR_END_SINGLES_CHART;
}

function coerceRank(m) {
  const raw =
    m.rank ?? m.position ?? m.no ?? m.pos ?? m.number ?? m["no."] ?? m["#"];
  const n = toInt(raw);
  return n && n >= 1 && n <= 100 ? n : null;
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

// v2.58: renumber a list sequentially by existing rank order
function renumberSequentialByRank(rows, limit) {
  const ranked = (rows || []).filter((m) => m && m.rank != null);
  ranked.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const out = ranked.slice(0, Math.max(1, limit || ranked.length));
  for (let i = 0; i < out.length; i++) out[i].rank = i + 1;
  return out;
}

// =========================
// 50s Singles Cache (v2.64 hot reload + forced reload)
// =========================
function getWikiSingles50sFileMtimeMs() {
  const abs = resolveRepoPath(WIKI_YEAREND_SINGLES_1950_1959);
  try {
    const st = fs.statSync(abs);
    return st && st.mtimeMs ? st.mtimeMs : 0;
  } catch (_) {
    return 0;
  }
}

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

  if (!fs.existsSync(abs)) {
    console.warn(`[musicKnowledge] 50s Singles cache file not found: ${abs}`);
    return;
  }

  WIKI_SINGLES_50S_LAST_MTIME_MS = mtimeMs || getWikiSingles50sFileMtimeMs();

  let doc = null;
  try {
    doc = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    console.warn(`[musicKnowledge] 50s Singles cache parse failed: ${e.message}`);
    return;
  }

  const rows = Array.isArray(doc?.rows)
    ? doc.rows
    : Array.isArray(doc?.moments)
      ? doc.moments
      : Array.isArray(doc)
        ? doc
        : [];

  // pre-seed
  for (let y = 1950; y <= 1959; y++) WIKI_SINGLES_50S_BY_YEAR.set(y, []);

  for (const r of rows) {
    const y = toInt(r.year);
    const rk = toInt(r.rank);
    if (y == null || rk == null) continue;
    if (y < 1950 || y > 1959) continue;
    if (rk <= 0) continue;

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

  // sort and warn
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

  // explicit confirmation log (what you wanted to see)
  try {
    const counts = {};
    for (let y = 1950; y <= 1959; y++) counts[y] = (WIKI_SINGLES_50S_BY_YEAR.get(y) || []).length;
    console.log(
      `[musicKnowledge] 50s Singles cache loaded: counts=${JSON.stringify(counts)}`
    );
  } catch (_) {}
}

function hasWikiSingles50sYear(year) {
  loadWikiSingles50sOnce({ force: false });
  const arr = WIKI_SINGLES_50S_BY_YEAR.get(year);
  return Array.isArray(arr) && arr.length > 0;
}

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
// Priority + Dedupe
// =========================
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

// =========================
// Wikipedia merges (for non-50s or for general indexing)
// =========================
function mergeWikipediaYearEnd(moments) {
  const abs = resolveRepoPath(WIKI_YEAREND_COMBINED);
  if (!fs.existsSync(abs)) return moments;

  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return moments;
  }

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

  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return moments;
  }

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
        chart: YEAR_END_SINGLES_CHART, // CRITICAL: this must remain Singles
        source: abs,
      })
    );
  }

  console.log(
    `[musicKnowledge] Wikipedia Year-End Singles merge: source=${abs} rows=${merged.length}`
  );
  return moments.concat(merged);
}

// =========================
// Buckets
// =========================
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

// =========================
// DB Load + Index
// =========================
function loadDb() {
  if (DB && INDEX_BUILT) return DB;

  // Load 50s singles cache early (and log counts if present)
  loadWikiSingles50sOnce({ force: false });

  let moments = [];
  LOADED_FROM = null;

  for (const rel of DB_CANDIDATES) {
    const abs = resolveRepoPath(rel);
    if (!fs.existsSync(abs)) continue;

    try {
      const json = JSON.parse(fs.readFileSync(abs, "utf8"));
      const arr = Array.isArray(json?.moments) ? json.moments : json;
      if (!Array.isArray(arr) || !arr.length) continue;

      moments = arr;
      LOADED_FROM = abs;
      break;
    } catch (_) {
      // keep trying candidates
    }
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

  let minY = null;
  let maxY = null;
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
  STATS.charts = Array.from(charts);

  INDEX_BUILT = true;

  console.log(`[musicKnowledge] Loaded ${moments.length} moments (${minY}–${maxY})`);
  if (LOADED_FROM) console.log(`[musicKnowledge] DB source: ${LOADED_FROM}`);
  console.log(`[musicKnowledge] Charts: ${STATS.charts.join(" | ")}`);
  console.log(`[musicKnowledge] ${MK_VERSION}`);

  return DB;
}

// =========================
// Queries
// =========================
function getTopByYear(year, chart = DEFAULT_CHART, limit = 10) {
  loadDb();
  const y = toInt(year);
  if (!y) return [];

  const c = normalizeChart(chart);

  // 50s Year-End Singles: authoritative cache + sequential ranks.
  // If the requested year slice is missing, return [] (no placeholders).
  if (c === YEAR_END_SINGLES_CHART && y >= 1950 && y <= 1959) {
    if (!ensureWikiSingles50sYear(y)) return [];
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

// =========================
// Conversational routing
// =========================
function chooseChartForYear(requestedChart, year) {
  const y = toInt(year);
  const c = normalizeChart(requestedChart || DEFAULT_CHART);

  // Pre-Hot100 era: default to Year-End Singles
  if (y != null && y >= 1950 && y <= 1959) {
    if (c === YEAR_END_CHART || c === DEFAULT_CHART) return YEAR_END_SINGLES_CHART;
    if (c === YEAR_END_SINGLES_CHART) return YEAR_END_SINGLES_CHART;
  }

  // If someone requests Singles outside 50s, route to Year-End Hot 100 when applicable
  if (c === YEAR_END_SINGLES_CHART && y != null && (y < 1950 || y > 1959)) {
    if (y >= 1970 && y <= 2010) return YEAR_END_CHART;
    return DEFAULT_CHART;
  }

  // If Year-End Hot 100 requested outside its range, fall back
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

  const publicRange = `${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}`;

  if (!userText) {
    const yrs = pickFollowUpYears();
    return {
      reply: `Music—nice. Give me a year (${publicRange}) or an artist + year, and I’ll pull something memorable.`,
      followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, "Try: Prince 1984"],
      domain: "music",
      sessionPatch: { activeMusicChart: requestedChart || DEFAULT_CHART },
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
        sessionPatch: { activeMusicChart: requestedChart || DEFAULT_CHART },
      };
    }

    const finalChart = chooseChartForYear(requestedChart, year);

    // Persist chart selection in session (index.js merges sessionPatch)
    const sessionPatch = { activeMusicChart: finalChart, lastMusicYear: year, lastMusicChart: finalChart };

    const formatted = formatTopList(year, finalChart, 10);
    if (formatted) {
      return {
        reply: `${formatted}\n\nWant #1, a story moment, or another year?`,
        followUp: ["#1", "Story moment", "Another year"],
        domain: "music",
        sessionPatch,
      };
    }

    // v2.57 behavior retained: if 50s singles year is missing, say it plainly.
    if (finalChart === YEAR_END_SINGLES_CHART && year >= 1950 && year <= 1959) {
      const yrs = [1956, 1957, 1958].filter((x) => x !== year);
      return {
        reply: `I don’t have a clean Year-End Singles list for ${year} loaded yet. Once we rebuild the ${year} Wikipedia slice, I’ll serve it cleanly.`,
        followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, "Try: 1956"],
        domain: "music",
        sessionPatch,
      };
    }

    const yrs = pickFollowUpYears();
    return {
      reply: `I don’t have a clean chart list for ${year} on this source yet. Try another year in ${publicRange}.`,
      followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, `Try: ${yrs[2]}`],
      domain: "music",
      sessionPatch,
    };
  }

  const yrs = pickFollowUpYears();
  return {
    reply: `Give me a year (${publicRange}) or an artist + year (example: “Prince 1984”).`,
    followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, "Try: Prince 1984"],
    domain: "music",
    sessionPatch: { activeMusicChart: requestedChart || DEFAULT_CHART },
  };
}

// =========================
// Public API
// =========================
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

  // Debug/ops helpers
  reloadWikiSingles50s: () => loadWikiSingles50sOnce({ force: true }),
  clearWikiSingles50sCache,
};
