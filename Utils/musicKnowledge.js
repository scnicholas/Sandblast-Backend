"use strict";

/**
 * Utils/musicKnowledge.js — v2.64
 *
 * FIXES IN v2.64:
 *  0) Add explicit startup log for 1950–1959 singles cache (counts by year), plus missing-file diagnostics.
 *  1) Auto hot-reload for Wikipedia 1950–1959 Year-End Singles cache.
 *     - Track file mtime; if the cache file changed, reload it on demand.
 *     - Fixes "still missing 1951" after rebuild without requiring server restart.
 *  2) If a 1950s year is requested and appears missing, attempt one forced reload,
 *     then re-check year availability before returning "missing slice" messaging.
 */

const fs = require("fs");
const path = require("path");

// =========================
// Version
// =========================
const MK_VERSION =
  "musicKnowledge v2.64 (50s cache hot-reload + forced reload + explicit cache-load logging)";

// =========================
// Constants / Paths
// =========================
const PUBLIC_MIN_YEAR = 1950;
const PUBLIC_MAX_YEAR = 2024;

const WIKI_YEAREND_HOT100_1970_2010 = "Data/wikipedia/billboard_yearend_hot100_1970_2010.json";
const WIKI_YEAREND_SINGLES_1950_1959 = "Data/wikipedia/billboard_yearend_singles_1950_1959.json";

// =========================
// Internal State
// =========================
let DB = null;
let DB_PATH = null;

let STATS = {
  loaded: false,
  moments: 0,
  charts: [],
  yearsMin: null,
  yearsMax: null,
};

let WIKI_YEAREND_HOT100 = null;

// 1950–1959 Year-End Singles cache
let WIKI_SINGLES_50S_LOADED = false;
const WIKI_SINGLES_50S_BY_YEAR = new Map();

// v2.64: track mtime so we can hot-reload when rebuild scripts rewrite the file
let WIKI_SINGLES_50S_LAST_MTIME_MS = 0;

// =========================
// Helpers
// =========================
function resolveRepoPath(rel) {
  // In Render, process.cwd() is repo root for Node service
  return path.resolve(process.cwd(), rel);
}

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

function isNonEmpty(s) {
  return !!normText(s);
}

function chartLabel(c) {
  return normText(c);
}

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

  // Load 50s year-end singles cache (and log counts)
  loadWikiSingles50sOnce({ force: false });

  return true;
}

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
};
