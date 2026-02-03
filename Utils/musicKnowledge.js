"use strict";

/**
 * Utils/musicKnowledge.js — v2.78 (TOP40 ALIAS FIX + CANONICAL CHART COERCE)
 *
 * v2.78 changes:
 *  ✅ Fixes legacy "Top40"/"Top 40" alias leak:
 *     - normalizeChart() now maps Top40/Top 40 to DEFAULT_CHART ("Billboard Hot 100")
 *  ✅ canonicalPatch() now normalizes session.activeMusicChart/lastMusicChart
 *     so stale values cannot persist across turns
 *
 * Keeps v2.77:
 *  ✅ PUBLIC_MAX_YEAR = 2025
 *  ✅ Prompts updated to 1950–2025
 *  ✅ Optional wikipedia 2025 file in merge list
 *
 * NOTE:
 *  - Your Top 10s for 2011–2025 should come from TOP10_STORE_FILE (top10_by_year_v1.json).
 *  - The wiki year-end hot100 files are still merged as YEAR_END_CHART rows (backup / non-top10 usage).
 *  - chatEngine must allow __musicLastSig, activeMusicChart, lastMusicChart
 *    so loop dampener persists across turns.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// =========================
// Version
// =========================
const MK_VERSION =
  "musicKnowledge v2.78 (top40 alias->hot100 + canonical chart coerce; range 1950–2025)";

// =========================
// Public Range / Charts
// =========================
const PUBLIC_MIN_YEAR = 1950;
const PUBLIC_MAX_YEAR = 2025;

const DEFAULT_CHART = "Billboard Hot 100";
const YEAR_END_CHART = "Billboard Year-End Hot 100";
const YEAR_END_SINGLES_CHART = "Billboard Year-End Singles";

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

const TOP10_STORE_FILE = "Data/top10_by_year_v1.json";

const WIKI_YEAREND_SINGLES_1950_1959 =
  "Data/wikipedia/billboard_yearend_singles_1950_1959.json";

const WIKI_YEAREND_HOT100_FILES = [
  "Data/wikipedia/billboard_yearend_hot100_1960_1969.json",
  "Data/wikipedia/billboard_yearend_hot100_1970_2010.json",
  "Data/wikipedia/billboard_yearend_hot100_1976_1979.json",
  "Data/wikipedia/billboard_yearend_hot100_2011_2024.json",
  // ✅ optional: if you generate this file, it will be auto-merged
  "Data/wikipedia/billboard_yearend_hot100_2025.json",
];

// =========================
// Optional dependency: Music Moments layer (safe require)
// =========================
let musicMoments = null;
try {
  musicMoments = require("./musicMoments");
} catch (_) {
  musicMoments = null;
}

// =========================
// Internal State
// =========================
let DB = null;
let LOADED_FROM = null;
let INDEX_BUILT = false;

const BY_YEAR_CHART = new Map(); // `${year}|${chart}` => moments[]
const STATS = {
  moments: 0,
  yearMin: null,
  yearMax: null,
  charts: [],
  sources: {},
};

// 50s Singles cache
const WIKI_SINGLES_50S_BY_YEAR = new Map();
let WIKI_SINGLES_50S_LOADED = false;
let WIKI_SINGLES_50S_LAST_MTIME_MS = 0;

// Top 10 store cache
let TOP10_STORE = null;
let TOP10_STORE_LOADED = false;
let TOP10_STORE_LAST_MTIME_MS = 0;

// =========================
// Helpers
// =========================
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
function isYearInRange(y) {
  return Number.isFinite(y) && y >= PUBLIC_MIN_YEAR && y <= PUBLIC_MAX_YEAR;
}
function normalizeChart(raw) {
  const s = cleanText(raw);
  if (!s) return DEFAULT_CHART;

  const c = s.toLowerCase();

  // ✅ Legacy alias normalization (prevents "Top40" sticking in session)
  // Treat "Top40"/"Top 40" as Billboard Hot 100.
  if (c === "top40" || c === "top 40" || (c.includes("top") && c.includes("40"))) {
    return DEFAULT_CHART;
  }

  if (c === "rpm" || c === "canada rpm" || (c.includes("canada") && c.includes("rpm"))) {
    return "Canada RPM";
  }

  if (
    c.includes("year") &&
    c.includes("end") &&
    (c.includes("single") || c.includes("singles") || c.includes("top 30") || c.includes("top 50"))
  ) {
    return YEAR_END_SINGLES_CHART;
  }

  if (c.includes("year") && c.includes("end")) return YEAR_END_CHART;

  if (c.includes("billboard") || c.includes("hot 100") || c.includes("hot100")) return DEFAULT_CHART;

  return s;
}
function resolveRepoPath(rel) {
  if (path.isAbsolute(rel)) return rel;
  if (DATA_DIR_ENV) return path.resolve(DATA_DIR_ENV, rel);
  return path.resolve(__dirname, "..", rel);
}
function safeJsonRead(absPath) {
  try {
    const raw = fs.readFileSync(absPath, "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}
function safeStatMtimeMs(absPath) {
  try {
    const st = fs.statSync(absPath);
    return st && st.mtimeMs ? st.mtimeMs : 0;
  } catch (_) {
    return 0;
  }
}
function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}
function coerceRank(m) {
  const raw = m.rank ?? m.position ?? m.no ?? m.pos ?? m.number ?? m["no."] ?? m["#"];
  const n = toInt(raw);
  return n && n >= 1 && n <= 100 ? n : null;
}
function normalizeMoment(m) {
  if (!m || typeof m !== "object") return m;

  let artist = cleanField(m.artist);
  let title = cleanField(m.title);

  const year = toInt(m.year);
  const rank = coerceRank(m);

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

function cloneMoment(m) {
  if (!m || typeof m !== "object") return m;
  return {
    year: m.year,
    rank: m.rank,
    title: m.title,
    artist: m.artist,
    chart: m.chart,
    source: m.source,
  };
}

function renumberSequentialByRank(rows, limit) {
  const ranked = (rows || [])
    .filter((m) => m && m.rank != null)
    .map(cloneMoment);

  ranked.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  const out = ranked.slice(0, Math.max(1, limit || ranked.length));
  for (let i = 0; i < out.length; i++) out[i].rank = i + 1;
  return out;
}

function canonicalPatch(session, extra = {}) {
  // ✅ Coerce any legacy/stale chart tokens in session immediately.
  const sessActive = session && session.activeMusicChart ? normalizeChart(session.activeMusicChart) : null;
  const sessLast = session && session.lastMusicChart ? normalizeChart(session.lastMusicChart) : null;

  const active = sessActive || sessLast || DEFAULT_CHART;

  const patch = {
    activeMusicChart: active,
    lastMusicYear: session && session.lastMusicYear != null ? session.lastMusicYear : null,
    lastMusicChart:
      session && (session.lastMusicChart || session.activeMusicChart)
        ? normalizeChart(session.lastMusicChart || session.activeMusicChart)
        : active,
    ...extra,
  };

  // ✅ If extra provides charts, normalize those too (prevents re-introducing Top40 via callers).
  if (patch.activeMusicChart) patch.activeMusicChart = normalizeChart(patch.activeMusicChart);
  if (patch.lastMusicChart) patch.lastMusicChart = normalizeChart(patch.lastMusicChart);

  if (!patch.lastMusicYear) delete patch.lastMusicYear;
  if (!patch.lastMusicChart) delete patch.lastMusicChart;
  return patch;
}

function bumpSourceStat(key, delta) {
  STATS.sources = STATS.sources || {};
  STATS.sources[key] = (STATS.sources[key] || 0) + (delta || 0);
}

// =========================
// Output contract (ALWAYS)
// =========================
function outShape({ reply, followUps, sessionPatch, domain = "music" }) {
  const arr = Array.isArray(followUps) ? followUps : [];
  const cleaned = [];
  const seen = new Set();
  for (const x of arr) {
    const s = cleanText(x);
    const k = s.toLowerCase();
    if (!s || seen.has(k)) continue;
    seen.add(k);
    cleaned.push(s);
  }

  let r = cleanText(reply);
  if (!r) {
    r = `Tell me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}), or say “top 10 1988”, “#1”, “story moment 1988”, or “micro moment 1988”.`;
  }

  return {
    reply: r,
    followUps: cleaned,
    domain,
    sessionPatch: sessionPatch && typeof sessionPatch === "object" ? sessionPatch : null,
  };
}

// =========================
// Command Parsing (hardened)
// =========================
function parseCommand(msg) {
  const t = cleanText(msg).toLowerCase();
  if (!t) return null;

  let m = t.match(/\b(?:billboard\s+)?top\s*(?:10|ten)\s*(\d{4})\b/);
  if (m) return { kind: "top10", year: Number(m[1]) };

  m = t.match(/\btop10\s*(\d{4})\b/);
  if (m) return { kind: "top10", year: Number(m[1]) };

  if (/\b(?:billboard\s+)?top\s*(?:10|ten)\b/.test(t) && !/\d{4}/.test(t)) return { kind: "top10" };

  m = t.match(/\b(year\s*end|year-end|yearend)\s*(\d{4})\b/);
  if (m) return { kind: "yearend", year: Number(m[2]) };

  m = t.match(/\b(micro\s+moment|micro)\s*(\d{4})\b/);
  if (m) return { kind: "micro", year: Number(m[2]) };

  m = t.match(/\b(story\s+moment|story|music\s+moment|moment|moments)\s*(\d{4})\b/);
  if (m) return { kind: "story", year: Number(m[2]) };

  m = t.match(/\b#\s*1\s*(\d{4})\b/);
  if (m) return { kind: "number1", year: Number(m[1]) };

  if (t === "#1" || t === "1" || t === "number 1") return { kind: "number1" };

  return null;
}

// =========================
// Top 10 Store Cache
// =========================
function loadTop10StoreOnce({ force = false } = {}) {
  const abs = resolveRepoPath(TOP10_STORE_FILE);
  const mtimeMs = safeStatMtimeMs(abs);

  const changedOnDisk = mtimeMs && TOP10_STORE_LAST_MTIME_MS && mtimeMs !== TOP10_STORE_LAST_MTIME_MS;
  if (force || changedOnDisk) {
    TOP10_STORE = null;
    TOP10_STORE_LOADED = false;
    TOP10_STORE_LAST_MTIME_MS = 0;
  }
  if (TOP10_STORE_LOADED) return;

  TOP10_STORE_LOADED = true;

  if (!fs.existsSync(abs)) {
    bumpSourceStat("top10_store_missing", 1);
    return;
  }

  TOP10_STORE_LAST_MTIME_MS = mtimeMs || safeStatMtimeMs(abs);

  const doc = safeJsonRead(abs);
  if (!doc || typeof doc !== "object") {
    bumpSourceStat("top10_store_badjson", 1);
    return;
  }

  let yearsNode = null;
  if (cleanText(doc.version) === "top10_by_year_v1" && doc.years) yearsNode = doc.years;
  else yearsNode = doc;

  if (!yearsNode || typeof yearsNode !== "object") {
    bumpSourceStat("top10_store_badshape", 1);
    return;
  }

  TOP10_STORE = { version: "top10_by_year_v1", years: yearsNode };
  bumpSourceStat("top10_store_loaded", 1);
}
function hasTop10StoreYear(year) {
  loadTop10StoreOnce({ force: false });
  if (!TOP10_STORE || !TOP10_STORE.years) return false;

  const node = TOP10_STORE.years[String(year)];
  if (!node) return false;

  if (Array.isArray(node.items) && node.items.length) return true;
  if (Array.isArray(node) && node.length) return true;
  if (Array.isArray(node.rows) && node.rows.length) return true;
  return false;
}
function getTop10StoreList(year, limit = 10) {
  loadTop10StoreOnce({ force: false });
  if (!TOP10_STORE || !TOP10_STORE.years) return [];

  const ykey = String(year);
  const node = TOP10_STORE.years[ykey];
  if (!node) return [];

  const chart = cleanText(node.chart) || YEAR_END_CHART;
  const yearVal = toInt(node.year) || toInt(year);

  let items = [];
  if (Array.isArray(node.items)) items = node.items;
  else if (Array.isArray(node.rows)) items = node.rows;
  else if (Array.isArray(node)) items = node;

  if (!Array.isArray(items) || !items.length) return [];

  const capped = items.slice(0, Math.max(1, Math.min(limit, 10)));

  return capped.map((it) =>
    normalizeMoment({
      year: yearVal,
      rank: toInt(it.pos ?? it.rank ?? it.position ?? it.no ?? it["#"]),
      title: it.title,
      artist: it.artist,
      chart,
      source: TOP10_STORE_FILE,
    })
  );
}

// =========================
// 50s Singles Cache
// =========================
function loadWikiSingles50sOnce({ force = false } = {}) {
  const abs = resolveRepoPath(WIKI_YEAREND_SINGLES_1950_1959);
  const mtimeMs = safeStatMtimeMs(abs);

  const changedOnDisk =
    mtimeMs && WIKI_SINGLES_50S_LAST_MTIME_MS && mtimeMs !== WIKI_SINGLES_50S_LAST_MTIME_MS;
  if (force || changedOnDisk) {
    WIKI_SINGLES_50S_BY_YEAR.clear();
    WIKI_SINGLES_50S_LOADED = false;
    WIKI_SINGLES_50S_LAST_MTIME_MS = 0;
  }
  if (WIKI_SINGLES_50S_LOADED) return;

  WIKI_SINGLES_50S_LOADED = true;
  for (let y = 1950; y <= 1959; y++) WIKI_SINGLES_50S_BY_YEAR.set(y, []);

  if (!fs.existsSync(abs)) {
    bumpSourceStat("wiki_50s_singles_missing", 1);
    return;
  }

  WIKI_SINGLES_50S_LAST_MTIME_MS = mtimeMs || safeStatMtimeMs(abs);

  const doc = safeJsonRead(abs);
  const rows = Array.isArray(doc?.rows)
    ? doc.rows
    : Array.isArray(doc?.moments)
      ? doc.moments
      : Array.isArray(doc)
        ? doc
        : [];

  let count = 0;
  for (const r of rows) {
    const y = toInt(r.year);
    const rk = toInt(r.rank);
    if (!Number.isFinite(y) || y < 1950 || y > 1959) continue;
    if (!Number.isFinite(rk) || rk <= 0) continue;

    const entry = normalizeMoment({
      year: y,
      rank: rk,
      title: r.title,
      artist: r.artist,
      source: "wikipedia",
      chart: YEAR_END_SINGLES_CHART,
    });

    const arr = WIKI_SINGLES_50S_BY_YEAR.get(y) || [];
    arr.push(entry);
    WIKI_SINGLES_50S_BY_YEAR.set(y, arr);
    count++;
  }

  for (let y = 1950; y <= 1959; y++) {
    const arr = WIKI_SINGLES_50S_BY_YEAR.get(y) || [];
    arr.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    WIKI_SINGLES_50S_BY_YEAR.set(y, arr);
  }

  bumpSourceStat("wiki_50s_singles_rows", count);
}
function hasWikiSingles50sYear(year) {
  loadWikiSingles50sOnce({ force: false });
  const arr = WIKI_SINGLES_50S_BY_YEAR.get(year);
  return Array.isArray(arr) && arr.length > 0;
}
function ensureWikiSingles50sYear(year) {
  if (hasWikiSingles50sYear(year)) return true;
  loadWikiSingles50sOnce({ force: true });
  return hasWikiSingles50sYear(year);
}
function clearWikiSingles50sCache() {
  WIKI_SINGLES_50S_BY_YEAR.clear();
  WIKI_SINGLES_50S_LOADED = false;
  WIKI_SINGLES_50S_LAST_MTIME_MS = 0;
}

// =========================
// DB Load + Index (Plus Wikipedia merges)
// =========================
function extractRowsFromDoc(doc) {
  if (!doc) return [];
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc.rows)) return doc.rows;
  if (Array.isArray(doc.moments)) return doc.moments;
  if (Array.isArray(doc.data)) return doc.data;
  return [];
}

function mergeWikipediaYearEndHot100Files(moments, relFiles) {
  const merged = [];
  let mergedTotal = 0;

  for (const rel of relFiles || []) {
    const abs = resolveRepoPath(rel);
    if (!fs.existsSync(abs)) continue;

    const doc = safeJsonRead(abs);
    const rows = extractRowsFromDoc(doc);
    if (!Array.isArray(rows) || !rows.length) continue;

    let count = 0;
    for (const r of rows) {
      const y = toInt(r.year);
      const rk = toInt(r.rank ?? r.pos ?? r.position ?? r.no ?? r["#"]);
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
      count++;
    }

    mergedTotal += count;
    bumpSourceStat("wiki_yearend_hot100_rows", count);
  }

  if (!mergedTotal) return moments;
  return moments.concat(merged);
}

function loadDb() {
  if (DB && INDEX_BUILT) return DB;

  loadTop10StoreOnce({ force: false });
  loadWikiSingles50sOnce({ force: false });

  let moments = [];
  LOADED_FROM = null;

  for (const rel of DB_CANDIDATES) {
    const abs = resolveRepoPath(rel);
    if (!fs.existsSync(abs)) continue;

    const json = safeJsonRead(abs);
    const rows = extractRowsFromDoc(json);
    if (!Array.isArray(rows) || !rows.length) continue;

    moments = rows;
    LOADED_FROM = abs;
    bumpSourceStat("db_loaded_from", 1);
    break;
  }

  moments = mergeWikipediaYearEndHot100Files(moments, WIKI_YEAREND_HOT100_FILES);

  DB = { moments };
  BY_YEAR_CHART.clear();

  let minY = null;
  let maxY = null;
  const charts = new Set();

  for (const raw of moments) {
    const m = normalizeMoment(raw);
    const y = toInt(m.year);
    const rk = toInt(m.rank);
    const c = normalizeChart(m.chart);

    if (!y || !rk || !c) continue;

    minY = minY == null ? y : Math.min(minY, y);
    maxY = maxY == null ? y : Math.max(maxY, y);
    charts.add(c);

    const key = `${y}|${c}`;
    BY_YEAR_CHART.set(key, [...(BY_YEAR_CHART.get(key) || []), m]);
  }

  for (const [k, arr] of BY_YEAR_CHART.entries()) {
    arr.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    BY_YEAR_CHART.set(k, arr);
  }

  if (hasWikiSingles50sYear(1950)) charts.add(YEAR_END_SINGLES_CHART);
  if (TOP10_STORE) charts.add(YEAR_END_CHART);

  STATS.moments = moments.length;
  STATS.yearMin = minY;
  STATS.yearMax = maxY;
  STATS.charts = Array.from(charts);

  if (TOP10_STORE) bumpSourceStat("top10_store_years", Object.keys(TOP10_STORE.years || {}).length);
  if (LOADED_FROM) bumpSourceStat("db_file", 1);

  INDEX_BUILT = true;
  return DB;
}

function chartIsAvailable(chart) {
  loadDb();
  const c = normalizeChart(chart);
  if (c === YEAR_END_CHART && TOP10_STORE) return true;
  if (c === YEAR_END_SINGLES_CHART && hasWikiSingles50sYear(1950)) return true;
  return STATS.charts.includes(c);
}

function pickBestAvailableChart(preferredList) {
  loadDb();
  for (const raw of preferredList) {
    const c = normalizeChart(raw);
    if (chartIsAvailable(c)) return c;
  }
  return STATS.charts[0] || (TOP10_STORE ? YEAR_END_CHART : DEFAULT_CHART);
}

// =========================
// Chart Resolver (store-aware; no sticky dead-ends)
// =========================
function resolveChartForYear(year, requestedChart) {
  const y = toInt(year);
  const req = normalizeChart(requestedChart || DEFAULT_CHART);

  if (!y) {
    const c = chartIsAvailable(req) ? req : pickBestAvailableChart([YEAR_END_CHART, DEFAULT_CHART]);
    return { ok: true, chart: c, fellBackFrom: c !== req ? req : undefined };
  }

  if (y >= 1950 && y <= 1959) {
    if (chartIsAvailable(YEAR_END_SINGLES_CHART)) {
      return {
        ok: true,
        chart: YEAR_END_SINGLES_CHART,
        fellBackFrom: req !== YEAR_END_SINGLES_CHART ? req : undefined,
      };
    }
    const c = pickBestAvailableChart([YEAR_END_CHART, DEFAULT_CHART, req]);
    return { ok: true, chart: c, fellBackFrom: c !== req ? req : undefined };
  }

  if (hasTop10StoreYear(y)) {
    if (req !== YEAR_END_CHART) return { ok: true, chart: YEAR_END_CHART, fellBackFrom: req };
    return { ok: true, chart: YEAR_END_CHART };
  }

  if (req === YEAR_END_SINGLES_CHART) {
    const c = pickBestAvailableChart([YEAR_END_CHART, DEFAULT_CHART]);
    return { ok: true, chart: c, fellBackFrom: YEAR_END_SINGLES_CHART };
  }

  if (!chartIsAvailable(req)) {
    const c = pickBestAvailableChart([YEAR_END_CHART, DEFAULT_CHART]);
    return { ok: true, chart: c, fellBackFrom: req };
  }

  return { ok: true, chart: req };
}

// =========================
// Queries
// =========================
function getTopByYear(year, chart, limit = 10) {
  const y = toInt(year);
  const c = normalizeChart(chart || DEFAULT_CHART);

  if (c === YEAR_END_CHART) {
    const storeList = getTop10StoreList(y, limit);
    if (storeList.length) return renumberSequentialByRank(storeList, limit);
  }

  if (c === YEAR_END_SINGLES_CHART && y >= 1950 && y <= 1959) {
    if (!ensureWikiSingles50sYear(y)) return [];
    const arr = WIKI_SINGLES_50S_BY_YEAR.get(y) || [];
    if (!arr.length) return [];
    return renumberSequentialByRank(arr, Math.min(limit, arr.length));
  }

  loadDb();
  const arr = BY_YEAR_CHART.get(`${y}|${c}`) || [];
  if (!arr.length) return [];
  return arr.slice(0, Math.min(limit, arr.length));
}

function formatTopList(year, chart, limit = 10) {
  const c = normalizeChart(chart);
  const list = getTopByYear(year, c, limit);
  if (!list.length) return null;

  const lines = list.map((m, i) => {
    const rk = m.rank != null ? String(m.rank) : String(i + 1);
    const a = cleanText(m.artist) || "Unknown Artist";
    const t = cleanText(m.title) || "Unknown Title";
    return `${rk}. ${a} — ${t}`;
  });

  return `Top ${Math.min(limit, lines.length)} — ${c} (${year}):\n${lines.join("\n")}`;
}

function formatTopListWithFallbacks(year, requestedChart, limit = 10) {
  loadDb();
  const y = toInt(year);
  if (!y) return null;

  if (y >= 1960 && hasTop10StoreYear(y)) {
    const formattedStore = formatTopList(y, YEAR_END_CHART, limit);
    if (formattedStore) return { formatted: formattedStore, chartUsed: YEAR_END_CHART };
  }

  if (y >= 1950 && y <= 1959) {
    const formatted50s = formatTopList(y, YEAR_END_SINGLES_CHART, limit);
    if (formatted50s) return { formatted: formatted50s, chartUsed: YEAR_END_SINGLES_CHART };
  }

  const first = normalizeChart(requestedChart);
  const preferred = [first, YEAR_END_CHART, DEFAULT_CHART];

  const tryCharts = [];
  for (const c0 of preferred) {
    const c = normalizeChart(c0);
    if (!tryCharts.includes(c) && chartIsAvailable(c)) tryCharts.push(c);
  }

  if (!tryCharts.length && STATS.charts.length) tryCharts.push(STATS.charts[0]);
  if (!tryCharts.length && TOP10_STORE) tryCharts.push(YEAR_END_CHART);

  for (const c of tryCharts) {
    const formatted = formatTopList(y, c, limit);
    if (formatted) return { formatted, chartUsed: c };
  }

  return null;
}

function getNumberOneLine(year, chart) {
  const y = toInt(year);
  const c = normalizeChart(chart || DEFAULT_CHART);

  if (c === YEAR_END_CHART && hasTop10StoreYear(y)) {
    const list = getTop10StoreList(y, 1);
    if (list.length) {
      const m = list[0];
      const a = cleanText(m.artist) || "Unknown Artist";
      const t = cleanText(m.title) || "Unknown Title";
      return `#1 — ${a} — ${t}`;
    }
  }

  const list = getTopByYear(y, c, 1);
  if (!list.length) return null;

  const m = list[0];
  const a = cleanText(m.artist) || "Unknown Artist";
  const t = cleanText(m.title) || "Unknown Title";
  return `#1 — ${a} — ${t}`;
}

// =========================
// Moments (story/micro)
// =========================
function getMomentFromLayer({ year, chart, kind }) {
  if (!musicMoments) return null;

  try {
    if (typeof musicMoments.getMoment === "function") {
      const res =
        musicMoments.getMoment.length >= 2
          ? musicMoments.getMoment(year, chart, kind)
          : musicMoments.getMoment({ year, chart, kind });

      if (typeof res === "string" && res.trim()) return res.trim();
      if (res && typeof res.text === "string" && res.text.trim()) return res.text.trim();
    }

    if (typeof musicMoments.handle === "function") {
      const prompt = kind === "micro" ? `micro moment ${year}` : `story moment ${year}`;
      const out = musicMoments.handle(prompt, { activeMusicChart: chart });
      if (out && typeof out.reply === "string" && out.reply.trim()) return out.reply.trim();
    }

    return null;
  } catch (_) {
    return null;
  }
}

function buildDeterministicMoment({ year, chart, kind }) {
  const y = toInt(year);
  const c = normalizeChart(chart || DEFAULT_CHART);

  const top3 = getTopByYear(y, c, 3);
  const top1 = top3[0] || null;
  if (!top1) return null;

  const a1 = cleanText(top1.artist) || "Unknown Artist";
  const t1 = cleanText(top1.title) || "Unknown Title";

  const a2 = top3[1] ? cleanText(top3[1].artist) || "Unknown Artist" : null;
  const t2 = top3[1] ? cleanText(top3[1].title) || "Unknown Title" : null;

  const a3 = top3[2] ? cleanText(top3[2].artist) || "Unknown Artist" : null;
  const t3 = top3[2] ? cleanText(top3[2].title) || "Unknown Title" : null;

  if (kind === "micro") {
    const extra = a2 && t2 ? ` Behind it: ${a2} (“${t2}”).` : a3 && t3 ? ` Close contenders included ${a3} (“${t3}”).` : "";
    return `Micro moment — ${y}: On ${c}, #1 was ${a1} with “${t1}.”${extra} Want the full Top 10, a story moment, or the next year?`;
  }

  const spine =
    a2 && t2 && a3 && t3
      ? `The top three shaped the year: ${a1} (“${t1}”), ${a2} (“${t2}”), and ${a3} (“${t3}”).`
      : a2 && t2
        ? `The top held steady: ${a1} (“${t1}”) with ${a2} (“${t2}”) close behind.`
        : `The year’s defining #1 was ${a1} with “${t1}.”`;

  return `Story moment — ${y}: ${spine} Want Top 10, a micro moment, or another year?`;
}

function getMomentOrFallback({ year, chart, kind }) {
  const y = toInt(year);
  if (!isYearInRange(y)) return null;

  const c = normalizeChart(chart || DEFAULT_CHART);

  const fromLayer = getMomentFromLayer({ year: y, chart: c, kind });
  if (fromLayer) return fromLayer;

  return buildDeterministicMoment({ year: y, chart: c, kind });
}

// =========================
// Lane-level loop dampener
// =========================
function sigFor({ kind, year, chart }) {
  return sha1(`${String(kind)}|${String(year || "")}|${normalizeChart(chart || "")}`);
}

// =========================
// Conversational Entry
// =========================
function handleChat({ text, session }) {
  const msg = cleanText(text);
  session = session || {};

  // ✅ Always normalize incoming session chart so stale "Top40" cannot persist.
  const activeChart = normalizeChart(session.activeMusicChart || DEFAULT_CHART);

  loadTop10StoreOnce({ force: false });
  loadWikiSingles50sOnce({ force: false });

  const cmd = parseCommand(msg);
  const yearOnly = cmd ? null : toInt(msg);

  if (cmd && cmd.kind === "top10") {
    const y = toInt(cmd.year ?? session.lastMusicYear);

    if (!isYearInRange(y)) {
      return outShape({
        reply: `Give me a year between ${PUBLIC_MIN_YEAR} and ${PUBLIC_MAX_YEAR} (example: “top 10 1988”).`,
        followUps: ["1956", "1984", "top 10 1988"],
        sessionPatch: canonicalPatch(session, { activeMusicChart: activeChart }),
      });
    }

    const choice = resolveChartForYear(y, activeChart);
    const chart = choice.chart;

    const out = formatTopListWithFallbacks(y, chart, 10);
    if (out && out.formatted) {
      const used = normalizeChart(out.chartUsed || chart);

      const sig = sigFor({ kind: "top10", year: y, chart: used });
      if (session.__musicLastSig === sig) {
        return outShape({
          reply: `Already did ${y}. Want “#1”, a story moment, a micro moment, or another year?`,
          followUps: ["#1", `story moment ${y}`, `micro moment ${y}`, "Another year"],
          sessionPatch: canonicalPatch(session, { lastMusicYear: y, lastMusicChart: used, activeMusicChart: used }),
        });
      }

      return outShape({
        reply: `${out.formatted}\n\nWant “#1”, a story moment, a micro moment, or another year?`,
        followUps: ["#1", `story moment ${y}`, `micro moment ${y}`, "Another year"],
        sessionPatch: canonicalPatch(session, {
          activeMusicChart: used,
          lastMusicYear: y,
          lastMusicChart: used,
          __musicLastSig: sig,
        }),
      });
    }

    return outShape({
      reply:
        `I can’t pull a clean Top 10 list for ${y} from the loaded sources on this build. ` +
        `Try “story moment ${y}” or “micro moment ${y}”, or give me another year.`,
      followUps: [`story moment ${y}`, `micro moment ${y}`, "Another year"],
      sessionPatch: canonicalPatch(session, { lastMusicYear: y, activeMusicChart: activeChart }),
    });
  }

  if (cmd && cmd.kind === "yearend") {
    const y = toInt(cmd.year);
    if (!isYearInRange(y)) {
      return outShape({
        reply: `Give me a year between ${PUBLIC_MIN_YEAR} and ${PUBLIC_MAX_YEAR} (example: “year-end 1988”).`,
        followUps: ["year-end 1956", "year-end 1984", "top 10 1988"],
        sessionPatch: canonicalPatch(session, { activeMusicChart: activeChart }),
      });
    }

    const out = formatTopListWithFallbacks(y, YEAR_END_CHART, 10);
    if (out && out.formatted) {
      const sig = sigFor({ kind: "yearend", year: y, chart: YEAR_END_CHART });
      return outShape({
        reply: `${out.formatted}\n\nWant “#1”, a story moment, or another year?`,
        followUps: ["#1", `story moment ${y}`, "Another year"],
        sessionPatch: canonicalPatch(session, {
          activeMusicChart: YEAR_END_CHART,
          lastMusicYear: y,
          lastMusicChart: YEAR_END_CHART,
          __musicLastSig: sig,
        }),
      });
    }

    return outShape({
      reply: `I don’t have year-end rows available for ${y} in this build. Try “top 10 ${y}” instead.`,
      followUps: [`top 10 ${y}`, `story moment ${y}`, `micro moment ${y}`],
      sessionPatch: canonicalPatch(session, { lastMusicYear: y, activeMusicChart: activeChart }),
    });
  }

  if (cmd && cmd.kind === "number1") {
    const y = toInt(cmd.year ?? session.lastMusicYear);
    if (!isYearInRange(y)) {
      return outShape({
        reply: `Tell me a year first (example: “top 10 1988”), then ask for “#1”.`,
        followUps: ["top 10 1988", "1988", "1956"],
        sessionPatch: canonicalPatch(session, { activeMusicChart: activeChart }),
      });
    }

    const resolved = resolveChartForYear(y, session.lastMusicChart || activeChart);
    const chartUsed = normalizeChart(resolved.chart);

    const line = getNumberOneLine(y, chartUsed);
    if (!line) {
      return outShape({
        reply: `I can’t pull a clean #1 for ${y} on ${chartUsed} in this build. Try “top 10 ${y}” or a story/micro moment.`,
        followUps: [`top 10 ${y}`, `story moment ${y}`, `micro moment ${y}`],
        sessionPatch: canonicalPatch(session, { lastMusicYear: y, lastMusicChart: chartUsed, activeMusicChart: chartUsed }),
      });
    }

    const sig = sigFor({ kind: "number1", year: y, chart: chartUsed });
    if (session.__musicLastSig === sig) {
      return outShape({
        reply: `Same #1 for ${y} — want a story moment, a micro moment, or another year?`,
        followUps: [`story moment ${y}`, `micro moment ${y}`, "Another year"],
        sessionPatch: canonicalPatch(session, { lastMusicYear: y, lastMusicChart: chartUsed, activeMusicChart: chartUsed }),
      });
    }

    return outShape({
      reply: `${line}\n\nWant a story moment, a micro moment, or another year?`,
      followUps: [`story moment ${y}`, `micro moment ${y}`, "Another year"],
      sessionPatch: canonicalPatch(session, {
        activeMusicChart: chartUsed,
        lastMusicYear: y,
        lastMusicChart: chartUsed,
        __musicLastSig: sig,
      }),
    });
  }

  if (cmd && (cmd.kind === "story" || cmd.kind === "micro")) {
    const y = toInt(cmd.year);
    if (!isYearInRange(y)) {
      return outShape({
        reply: `Give me a year between ${PUBLIC_MIN_YEAR} and ${PUBLIC_MAX_YEAR} for a ${cmd.kind} moment.`,
        followUps: ["1957", "1988", "1999"],
        sessionPatch: canonicalPatch(session, { activeMusicChart: activeChart }),
      });
    }

    const choice = resolveChartForYear(y, activeChart);
    const chart = normalizeChart(choice.chart);

    const moment = getMomentOrFallback({ year: y, chart, kind: cmd.kind === "micro" ? "micro" : "story" });
    if (!moment) {
      return outShape({
        reply: `I can’t pull a clean ${cmd.kind} moment for ${y} on ${chart} in this build. Try “top 10 ${y}” or another year.`,
        followUps: [`top 10 ${y}`, "#1", "Another year"],
        sessionPatch: canonicalPatch(session, { lastMusicYear: y, lastMusicChart: chart, activeMusicChart: chart }),
      });
    }

    const sig = sigFor({ kind: cmd.kind, year: y, chart });
    if (session.__musicLastSig === sig) {
      return outShape({
        reply: `We already hit that ${cmd.kind} moment for ${y}. Want Top 10, “#1”, or another year?`,
        followUps: [`top 10 ${y}`, "#1", "Another year"],
        sessionPatch: canonicalPatch(session, { lastMusicYear: y, lastMusicChart: chart, activeMusicChart: chart }),
      });
    }

    return outShape({
      reply: moment,
      followUps: [`top 10 ${y}`, "#1", y + 1 <= PUBLIC_MAX_YEAR ? String(y + 1) : "Another year"],
      sessionPatch: canonicalPatch(session, {
        activeMusicChart: chart,
        lastMusicYear: y,
        lastMusicChart: chart,
        __musicLastSig: sig,
      }),
    });
  }

  if (yearOnly && isYearInRange(yearOnly)) {
    const y = yearOnly;
    const choice = resolveChartForYear(y, activeChart);
    const chart = normalizeChart(choice.chart);

    const out = formatTopListWithFallbacks(y, chart, 10);
    if (out && out.formatted) {
      const used = normalizeChart(out.chartUsed || chart);

      const sig = sigFor({ kind: "top10", year: y, chart: used });
      if (session.__musicLastSig === sig) {
        return outShape({
          reply: `Already did ${y}. Want “#1”, a story moment, a micro moment, or another year?`,
          followUps: ["#1", `story moment ${y}`, `micro moment ${y}`, "Another year"],
          sessionPatch: canonicalPatch(session, { lastMusicYear: y, lastMusicChart: used, activeMusicChart: used }),
        });
      }

      return outShape({
        reply: `${out.formatted}\n\nWant “#1”, a story moment, a micro moment, or another year?`,
        followUps: ["#1", `story moment ${y}`, `micro moment ${y}`, "Another year"],
        sessionPatch: canonicalPatch(session, {
          activeMusicChart: used,
          lastMusicYear: y,
          lastMusicChart: used,
          __musicLastSig: sig,
        }),
      });
    }

    const story = getMomentOrFallback({ year: y, chart, kind: "story" });
    const micro = getMomentOrFallback({ year: y, chart, kind: "micro" });

    if (micro || story) {
      const sig = sigFor({ kind: micro ? "micro" : "story", year: y, chart });
      return outShape({
        reply: micro || story,
        followUps: [`top 10 ${y}`, "#1", "Another year"],
        sessionPatch: canonicalPatch(session, {
          activeMusicChart: chart,
          lastMusicYear: y,
          lastMusicChart: chart,
          __musicLastSig: sig,
        }),
      });
    }

    return outShape({
      reply: `I don’t have chart rows loaded for ${y} in this build yet. Try another year, or ask for “story moment ${y}”.`,
      followUps: ["1956", `story moment ${y}`, `micro moment ${y}`],
      sessionPatch: canonicalPatch(session, { lastMusicYear: y, activeMusicChart: activeChart }),
    });
  }

  if (/^music$/i.test(msg)) {
    return outShape({
      reply: `Alright—music. Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}), or say “top 10 1988”, “story moment 1988”, or “micro moment 1988”.`,
      followUps: ["1956", "top 10 1988", "micro moment 1955"],
      sessionPatch: canonicalPatch(session, { activeMusicChart: activeChart }),
    });
  }

  return outShape({
    reply: `Tell me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}), or say “top 10 1988”, “#1”, “story moment 1988”, or “micro moment 1988”.`,
    followUps: ["1956", "top 10 1988", "story moment 1955"],
    sessionPatch: canonicalPatch(session, { activeMusicChart: activeChart }),
  });
}

// =========================
// Public API
// =========================
module.exports = {
  MK_VERSION: () => MK_VERSION,
  handleChat,
  getStats: () => ({ ...STATS }),
  PUBLIC_RANGE: () => ({ min: PUBLIC_MIN_YEAR, max: PUBLIC_MAX_YEAR }),

  reloadWikiSingles50s: () => loadWikiSingles50sOnce({ force: true }),
  clearWikiSingles50sCache,

  reloadTop10Store: () => loadTop10StoreOnce({ force: true }),

  _chartIsAvailable: chartIsAvailable,
  _resolveChartForYear: resolveChartForYear,

  _getTopByYear: getTopByYear,
  _getNumberOneLine: getNumberOneLine,
};
