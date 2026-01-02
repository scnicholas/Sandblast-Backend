"use strict";

/**
 * Utils/musicKnowledge.js — v2.67
 *
 * Critical fixes (v2.67):
 *  - Validate session.activeMusicChart against loaded chart set; auto-fallback if unsupported.
 *  - Year-only requests never dead-end due to unknown chart context (e.g., "Canada RPM").
 *  - If the requested chart has no rows for a year, retry canonical fallbacks before returning “clean list”.
 *  - Normalize common chart aliases consistently (RPM, Canada RPM, Year-End variants).
 *
 * Retains critical behavior:
 *  - 1950–1959 Billboard Year-End Singles are served ONLY from Wikipedia cache when requested / when 50s year is requested.
 *  - No fake placeholders for missing 50s slices: if missing, say so plainly.
 *  - Hot-reload cache when the JSON file mtime changes; forced reload once if a requested 50s year appears missing.
 *  - Normalize title/artist (trim/quotes/whitespace), normalize ranks, and renumber sequentially (1..N) to avoid gaps.
 *
 * Integration:
 *  - Designed to be called as: handleChat({ text, session })
 *  - Returns: { reply, followUp, domain:"music", sessionPatch }
 */

const fs = require("fs");
const path = require("path");

// =========================
// Version
// =========================
const MK_VERSION =
  "musicKnowledge v2.67 (chart validation + canonical fallbacks; prevents year dead-ends from unsupported chart contexts)";

// =========================
// Public Range / Charts
// =========================
const PUBLIC_MIN_YEAR = 1950;
const PUBLIC_MAX_YEAR = 2024;

const DEFAULT_CHART = "Billboard Hot 100";
const YEAR_END_CHART = "Billboard Year-End Hot 100";
const YEAR_END_SINGLES_CHART = "Billboard Year-End Singles";

// =========================
// Paths
// =========================
const DATA_DIR_ENV = String(process.env.DATA_DIR || "").trim();

// Main DB candidates (optional; not required for 50s singles)
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

// Wikipedia datasets
const WIKI_YEAREND_HOT100_1970_2010 =
  "Data/wikipedia/billboard_yearend_hot100_1970_2010.json";
const WIKI_YEAREND_SINGLES_1950_1959 =
  "Data/wikipedia/billboard_yearend_singles_1950_1959.json";

// =========================
// Internal State
// =========================
let DB = null;
let LOADED_FROM = null;
let INDEX_BUILT = false;

const BY_YEAR_CHART = new Map(); // key: `${year}|${chart}` => moments[]
const STATS = { moments: 0, yearMin: null, yearMax: null, charts: [] };

// Authoritative cache for 1950–1959 Year-End Singles
const WIKI_SINGLES_50S_BY_YEAR = new Map();
let WIKI_SINGLES_50S_LOADED = false;
let WIKI_SINGLES_50S_LAST_MTIME_MS = 0;

// =========================
// Helpers
// =========================
function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function cleanField(s) {
  let t = cleanText(s);
  // strip wrapping quotes (some wiki rows have them)
  t = t.replace(/^"\s*/g, "").replace(/\s*"$/g, "");
  return cleanText(t);
}

function toInt(x) {
  const s = String(x ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeChart(raw) {
  const s = cleanText(raw);
  if (!s) return DEFAULT_CHART;

  const c = s.toLowerCase();

  // --- Common aliases / normalization
  // RPM variants (keep the canonical label if you ever load it; otherwise it's just a requested chart)
  if (c === "rpm" || c === "canada rpm" || c.includes("canada") && c.includes("rpm")) {
    return "Canada RPM";
  }

  // Singles year-end
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

  // Year-end hot 100
  if (c.includes("year") && c.includes("end")) return YEAR_END_CHART;

  // default hot100
  if (c.includes("billboard") || c.includes("hot 100") || c.includes("hot100")) return DEFAULT_CHART;

  return s;
}

function resolveRepoPath(rel) {
  if (path.isAbsolute(rel)) return rel;
  if (DATA_DIR_ENV) return path.resolve(DATA_DIR_ENV, rel);
  // Utils/.. => repo root in typical Render layout (/opt/render/project/src)
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

function coerceRank(m) {
  const raw =
    m.rank ?? m.position ?? m.no ?? m.pos ?? m.number ?? m["no."] ?? m["#"];
  const n = toInt(raw);
  return n && n >= 1 && n <= 100 ? n : null;
}

function normalizeMoment(m) {
  if (!m || typeof m !== "object") return m;

  let artist = cleanField(m.artist);
  let title = cleanField(m.title);

  const year = toInt(m.year);
  const rank = coerceRank(m);

  // Hard fix — known bad row in some sources: 1988 #3 George Harrison
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

// Renumber a list sequentially by existing rank order (1..N)
function renumberSequentialByRank(rows, limit) {
  const ranked = (rows || []).filter((m) => m && m.rank != null);
  ranked.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const out = ranked.slice(0, Math.max(1, limit || ranked.length));
  for (let i = 0; i < out.length; i++) out[i].rank = i + 1;
  return out;
}

// =========================
// 50s Singles Cache (hot-reload + forced reload)
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
    mtimeMs &&
    WIKI_SINGLES_50S_LAST_MTIME_MS &&
    mtimeMs !== WIKI_SINGLES_50S_LAST_MTIME_MS;

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

  const doc = safeJsonRead(abs);
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
  }

  for (let y = 1950; y <= 1959; y++) {
    const arr = WIKI_SINGLES_50S_BY_YEAR.get(y) || [];
    arr.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    if (!arr.length) {
      console.warn(
        `[musicKnowledge] WARNING: Wikipedia 50s singles missing year ${y} in rows payload.`
      );
    }
    WIKI_SINGLES_50S_BY_YEAR.set(y, arr);
  }

  // Explicit confirmation log (the line you wanted)
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

// Attempt a forced reload once if a year is requested and appears missing
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
// DB Load + Index (non-50s support)
// =========================
function mergeWikipediaYearEndHot100(moments) {
  const abs = resolveRepoPath(WIKI_YEAREND_HOT100_1970_2010);
  if (!fs.existsSync(abs)) return moments;

  const doc = safeJsonRead(abs);
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
      const json = safeJsonRead(abs);
      const arr = Array.isArray(json?.moments) ? json.moments : json;
      if (!Array.isArray(arr) || !arr.length) continue;

      moments = arr;
      LOADED_FROM = abs;
      break;
    } catch (_) {
      // keep trying candidates
    }
  }

  // Merge year-end 1970–2010 (if present)
  moments = mergeWikipediaYearEndHot100(moments);

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

  // Sort each bucket by rank
  for (const [k, arr] of BY_YEAR_CHART.entries()) {
    arr.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    BY_YEAR_CHART.set(k, arr);
  }

  STATS.moments = moments.length;
  STATS.yearMin = minY;
  STATS.yearMax = maxY;
  STATS.charts = Array.from(charts);

  INDEX_BUILT = true;

  console.log(
    `[musicKnowledge] Loaded ${moments.length} moments (${minY ?? "?"}–${maxY ?? "?"})`
  );
  if (LOADED_FROM) console.log(`[musicKnowledge] DB source: ${LOADED_FROM}`);
  console.log(`[musicKnowledge] Charts: ${STATS.charts.join(" | ")}`);
  console.log(`[musicKnowledge] ${MK_VERSION}`);

  return DB;
}

function chartIsAvailable(chart) {
  loadDb();
  const c = normalizeChart(chart);
  return STATS.charts.includes(c);
}

function pickBestAvailableChart(preferredList) {
  loadDb();
  for (const raw of preferredList) {
    const c = normalizeChart(raw);
    if (STATS.charts.includes(c)) return c;
  }
  // fallback: any loaded chart, else DEFAULT_CHART
  return STATS.charts[0] || DEFAULT_CHART;
}

// =========================
// Chart Choice Logic (critical for 50s + chart validation)
// =========================
function chooseChartForYear(year, requestedChart) {
  const y = toInt(year);
  const req = normalizeChart(requestedChart || DEFAULT_CHART);

  // Explicit Year-End Singles request: only valid for 1950–1959 here
  if (req === YEAR_END_SINGLES_CHART) {
    if (y >= 1950 && y <= 1959) return { ok: true, chart: YEAR_END_SINGLES_CHART };
    return { ok: false, reason: "OUT_OF_RANGE_FOR_SINGLES" };
  }

  // Pre-Hot100 era: route to Year-End Singles if possible
  if (y >= 1950 && y <= 1959) {
    return { ok: true, chart: YEAR_END_SINGLES_CHART };
  }

  // For non-50s: validate requested chart; if unsupported, fall back deterministically
  loadDb();

  if (STATS.charts && STATS.charts.length) {
    if (!STATS.charts.includes(req)) {
      const fallback = pickBestAvailableChart([YEAR_END_CHART, DEFAULT_CHART]);
      return { ok: true, chart: fallback, fellBackFrom: req };
    }
  }

  return { ok: true, chart: req || DEFAULT_CHART };
}

// =========================
// Queries
// =========================
function getTopByYear(year, chart, limit = 10) {
  const y = toInt(year);
  const c = normalizeChart(chart || DEFAULT_CHART);

  // 50s Year-End Singles: authoritative cache + sequential ranks; no placeholders.
  if (c === YEAR_END_SINGLES_CHART && y >= 1950 && y <= 1959) {
    if (!ensureWikiSingles50sYear(y)) return [];
    const arr = WIKI_SINGLES_50S_BY_YEAR.get(y) || [];
    if (!arr.length) return [];
    return renumberSequentialByRank(arr, Math.min(limit, arr.length));
  }

  // Non-50s: use indexed DB (if present)
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

/**
 * Non-50s “never dead-end” selector:
 * - Try the chosen chart first
 * - Then retry canonical fallbacks that are actually loaded in this build
 */
function formatTopListWithFallbacks(year, requestedChart, limit = 10) {
  loadDb();
  const y = toInt(year);
  if (!y) return null;

  const first = normalizeChart(requestedChart);
  const preferred = [
    first,
    YEAR_END_CHART,
    DEFAULT_CHART,
  ];

  // Only try charts that exist in this build (prevents wasting cycles)
  const tryCharts = [];
  for (const c0 of preferred) {
    const c = normalizeChart(c0);
    if (!tryCharts.includes(c) && STATS.charts.includes(c)) tryCharts.push(c);
  }
  // If build has some other chart(s), add one as last resort
  if (!tryCharts.length && STATS.charts.length) tryCharts.push(STATS.charts[0]);

  for (const c of tryCharts) {
    const formatted = formatTopList(y, c, limit);
    if (formatted) return { formatted, chartUsed: c };
  }

  return null;
}

// =========================
// Conversational Entry
// =========================
function handleChat({ text, session }) {
  const msg = cleanText(text);
  session = session || {};

  // Default chart preference for the session
  if (!session.activeMusicChart) session.activeMusicChart = DEFAULT_CHART;

  // Year-only input?
  const y = toInt(msg);
  if (Number.isFinite(y) && y >= PUBLIC_MIN_YEAR && y <= PUBLIC_MAX_YEAR) {
    const choice = chooseChartForYear(y, session.activeMusicChart);
    if (!choice.ok) {
      if (choice.reason === "OUT_OF_RANGE_FOR_SINGLES") {
        return {
          reply: `Year-End Singles is only available for 1950–1959 in my current build. Try a year in that range.`,
          followUp: ["1950", "1956", "1959"],
          domain: "music",
          sessionPatch: {},
        };
      }
      return {
        reply: `That year’s chart isn’t available yet.`,
        followUp: ["1970", "1984", "1999"],
        domain: "music",
        sessionPatch: {},
      };
    }

    const chart = choice.chart;
    session.activeMusicChart = chart;

    // 1950s Year-End Singles
    if (chart === YEAR_END_SINGLES_CHART && y >= 1950 && y <= 1959) {
      const rows = getTopByYear(y, chart, 10);
      if (!rows.length) {
        return {
          reply: `I’m missing the ${y} Year-End Singles list in the current Wikipedia cache — so I won’t fake it. Try another 1950s year.`,
          followUp: ["1950", "1956", "1959"],
          domain: "music",
          sessionPatch: { activeMusicChart: chart, lastMusicYear: y, lastMusicChart: chart },
        };
      }

      const formatted = formatTopList(y, chart, 10);
      return {
        reply: `${formatted}\n\nWant #1, a story moment, or another year?`,
        followUp: ["#1", "Story moment", "Another year"],
        domain: "music",
        sessionPatch: { activeMusicChart: chart, lastMusicYear: y, lastMusicChart: chart },
      };
    }

    // Non-50s: format using fallbacks (prevents dead-ends from unsupported chart contexts)
    const out = formatTopListWithFallbacks(y, chart, 10);
    if (out && out.formatted) {
      session.activeMusicChart = out.chartUsed || chart;
      return {
        reply: `${out.formatted}\n\nWant #1, a story moment, or another year?`,
        followUp: ["#1", "Story moment", "Another year"],
        domain: "music",
        sessionPatch: {
          activeMusicChart: session.activeMusicChart,
          lastMusicYear: y,
          lastMusicChart: session.activeMusicChart,
        },
      };
    }

    // If we still can't produce a list, be honest (rare if your datasets are present)
    return {
      reply: `I don’t have a clean list for ${y} on the available chart sources in this build yet. Try another year.`,
      followUp: ["1970", "1984", "1999"],
      domain: "music",
      sessionPatch: { activeMusicChart: session.activeMusicChart, lastMusicYear: y, lastMusicChart: session.activeMusicChart },
    };
  }

  // Lane prompt handling (lightweight)
  if (/^music$/i.test(msg)) {
    session.activeMusicChart = DEFAULT_CHART;
    return {
      reply: `Alright—music. Give me a year (1950–2024) or an artist + year, and I’ll pull something memorable.`,
      followUp: ["1956", "1984", "1999"],
      domain: "music",
      sessionPatch: { activeMusicChart: DEFAULT_CHART },
    };
  }

  // Default prompt
  return {
    reply: `Tell me a year (1950–2024), or an artist + year (example: “Prince 1984”).`,
    followUp: ["1956", "Prince 1984", "1999"],
    domain: "music",
    sessionPatch: { activeMusicChart: session.activeMusicChart || DEFAULT_CHART },
  };
}

// =========================
// Public API
// =========================
module.exports = {
  MK_VERSION: () => MK_VERSION,
  handleChat,
  getStats: () => ({ ...STATS }),
  PUBLIC_RANGE: () => ({ min: PUBLIC_MIN_YEAR, max: PUBLIC_MAX_YEAR }),

  // Ops / debug helpers
  reloadWikiSingles50s: () => loadWikiSingles50sOnce({ force: true }),
  clearWikiSingles50sCache,

  // For diagnostics
  _chartIsAvailable: chartIsAvailable,
};
