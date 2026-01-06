"use strict";

/**
 * Utils/musicKnowledge.js — v2.71
 *
 * Retains v2.70 stability guarantees:
 *  - Validate session.activeMusicChart against loaded chart set; auto-fallback if unsupported.
 *  - Year-only requests never dead-end due to unknown chart context (e.g., "Canada RPM").
 *  - If the requested chart has no rows for a year, retry canonical fallbacks before returning “clean list”.
 *  - Normalize common chart aliases consistently (RPM, Canada RPM, Year-End variants).
 *  - Always return a canonical sessionPatch (stop relying on session mutation for correctness).
 *
 * New in v2.71 (to make Music Moments feel “across the board” even before full moments coverage):
 *  - Adds parsing for: "micro moment ####" and "micro ####".
 *  - Adds "top 10" (no year) => uses session.lastMusicYear if present; otherwise asks for a year.
 *  - Story/Micro attempts to use Music Moments layer if available; otherwise uses deterministic chart-based fallback.
 *  - Deterministic fallback is tight (50–60-ish words), non-fluffy, and never loops.
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
  "musicKnowledge v2.71 (micro parsing + story/micro moments wiring + deterministic fallback)";

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

// Wikipedia datasets (existing + planned drop-ins)
const WIKI_YEAREND_SINGLES_1950_1959 =
  "Data/wikipedia/billboard_yearend_singles_1950_1959.json";

// Year-End Hot 100 ranges (merge any that exist)
const WIKI_YEAREND_HOT100_FILES = [
  // 1960–1969
  "Data/wikipedia/billboard_yearend_hot100_1960_1969.json",

  // 1970–2010 (existing)
  "Data/wikipedia/billboard_yearend_hot100_1970_2010.json",

  // 1976–1979 (optional)
  "Data/wikipedia/billboard_yearend_hot100_1976_1979.json",

  // 2011–2024
  "Data/wikipedia/billboard_yearend_hot100_2011_2024.json",
];

// =========================
// Optional dependency: Music Moments layer
// (Safe require: do not crash if absent)
// =========================
let musicMoments = null;
try {
  // If you have Utils/musicMoments.js exporting getMoment(...) or handleChat(...),
  // this will auto-wire. If not present, we fall back deterministically.
  // eslint-disable-next-line global-require
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

  if (
    c === "rpm" ||
    c === "canada rpm" ||
    (c.includes("canada") && c.includes("rpm"))
  ) {
    return "Canada RPM";
  }

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

  if (c.includes("billboard") || c.includes("hot 100") || c.includes("hot100"))
    return DEFAULT_CHART;

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

  // Known fix: 1988 #3 George Harrison row normalization
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

function renumberSequentialByRank(rows, limit) {
  const ranked = (rows || []).filter((m) => m && m.rank != null);
  ranked.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const out = ranked.slice(0, Math.max(1, limit || ranked.length));
  for (let i = 0; i < out.length; i++) out[i].rank = i + 1;
  return out;
}

function canonicalPatch(session, extra = {}) {
  const patch = {
    activeMusicChart: session.activeMusicChart || DEFAULT_CHART,
    lastMusicYear: session.lastMusicYear ?? null,
    lastMusicChart:
      session.lastMusicChart || session.activeMusicChart || DEFAULT_CHART,
    ...extra,
  };

  // Strip null-ish fields where it helps (keeps sessionPatch clean)
  if (!patch.lastMusicYear) delete patch.lastMusicYear;
  if (!patch.lastMusicChart) delete patch.lastMusicChart;

  return patch;
}

function followupsForYear(year) {
  const y = toInt(year);
  if (!y) return ["1956", "1984", "1999"];
  return [
    `#1`,
    `story moment ${y}`,
    `micro moment ${y}`,
    `top 10 ${y + 1 <= PUBLIC_MAX_YEAR ? y + 1 : y}`,
  ];
}

// =========================
// Command Parsing (v2.71)
// =========================
function parseCommand(msg) {
  const t = cleanText(msg).toLowerCase();
  if (!t) return null;

  // "top 10 1988" / "top ten 1988"
  let m = t.match(/\btop\s*(10|ten)\s*(\d{4})\b/);
  if (m) return { kind: "top10", year: Number(m[2]) };

  // "top 10" (no year) => use lastMusicYear
  if (/\btop\s*(10|ten)\b/.test(t) && !/\d{4}/.test(t)) return { kind: "top10" };

  // "micro moment 1988" / "micro 1988"
  m = t.match(/\b(micro\s+moment|micro)\s*(\d{4})\b/);
  if (m) return { kind: "micro", year: Number(m[2]) };

  // "story moment 1988" / "story 1988" / "moment 1988"
  m = t.match(
    /\b(story\s+moment|story|music\s+moment|moment|moments)\s*(\d{4})\b/
  );
  if (m) return { kind: "story", year: Number(m[2]) };

  if (t === "#1" || t === "1" || t === "number 1") return { kind: "number1" };

  // Year-only is handled elsewhere; do not treat it as a special "command" here.
  return null;
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

  try {
    const counts = {};
    for (let y = 1950; y <= 1959; y++) {
      counts[y] = (WIKI_SINGLES_50S_BY_YEAR.get(y) || []).length;
    }
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
function mergeWikipediaYearEndHot100Files(moments, relFiles) {
  const merged = [];
  const failures = [];
  let mergedTotal = 0;

  for (const rel of relFiles || []) {
    const abs = resolveRepoPath(rel);
    if (!fs.existsSync(abs)) continue;

    try {
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
      console.log(
        `[musicKnowledge] Wikipedia Year-End merge: source=${abs} rows=${count}`
      );
    } catch (e) {
      failures.push({ file: abs, error: e?.message || String(e) });
    }
  }

  if (failures.length) {
    console.warn(
      `[musicKnowledge] Wikipedia Year-End merge failures: ${JSON.stringify(
        failures
      )}`
    );
  }

  if (!mergedTotal) return moments;
  return moments.concat(merged);
}

function loadDb() {
  if (DB && INDEX_BUILT) return DB;

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
    } catch (_) {}
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

  // Ensure 50s Year-End Singles is treated as an "available chart" even if the main DB doesn't include it.
  if (hasWikiSingles50sYear(1950)) charts.add(YEAR_END_SINGLES_CHART);

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
  return STATS.charts[0] || DEFAULT_CHART;
}

// =========================
// Chart Choice Logic
// =========================
function chooseChartForYear(year, requestedChart) {
  const y = toInt(year);
  const req = normalizeChart(requestedChart || DEFAULT_CHART);

  if (req === YEAR_END_SINGLES_CHART) {
    if (y >= 1950 && y <= 1959)
      return { ok: true, chart: YEAR_END_SINGLES_CHART };
    return { ok: false, reason: "OUT_OF_RANGE_FOR_SINGLES" };
  }

  // Default 1950–1959 to Year-End Singles (canonical for early years)
  if (y >= 1950 && y <= 1959) {
    return { ok: true, chart: YEAR_END_SINGLES_CHART };
  }

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

  return `Top ${Math.min(limit, lines.length)} — ${c} (${year}):\n${lines.join(
    "\n"
  )}`;
}

function formatTopListWithFallbacks(year, requestedChart, limit = 10) {
  loadDb();
  const y = toInt(year);
  if (!y) return null;

  // 1950–1959: try Singles first (authoritative)
  if (y >= 1950 && y <= 1959) {
    const formatted50s = formatTopList(y, YEAR_END_SINGLES_CHART, limit);
    if (formatted50s) return { formatted: formatted50s, chartUsed: YEAR_END_SINGLES_CHART };
    // If missing, fall through to DB fallbacks
  }

  const first = normalizeChart(requestedChart);
  const preferred = [first, YEAR_END_CHART, DEFAULT_CHART];

  const tryCharts = [];
  for (const c0 of preferred) {
    const c = normalizeChart(c0);
    if (!tryCharts.includes(c) && STATS.charts.includes(c)) tryCharts.push(c);
  }

  if (!tryCharts.length && STATS.charts.length) tryCharts.push(STATS.charts[0]);

  for (const c of tryCharts) {
    const formatted = formatTopList(y, c, limit);
    if (formatted) return { formatted, chartUsed: c };
  }

  return null;
}

function getNumberOneLine(year, chart) {
  const list = getTopByYear(year, chart, 1);
  if (!list.length) return null;
  const m = list[0];
  const a = cleanText(m.artist) || "Unknown Artist";
  const t = cleanText(m.title) || "Unknown Title";
  return `#1 — ${a} — ${t}`;
}

// =========================
// Moments (story/micro): try musicMoments, else deterministic fallback
// =========================
function getMomentFromLayer({ year, chart, kind }) {
  if (!musicMoments) return null;

  try {
    // Support a few plausible APIs without forcing your implementation:
    // - getMoment({year, chart, kind})
    // - getMoment(year, chart, kind)
    // - handleChat({text, session}) (not used here)
    if (typeof musicMoments.getMoment === "function") {
      const res =
        musicMoments.getMoment.length >= 2
          ? musicMoments.getMoment(year, chart, kind)
          : musicMoments.getMoment({ year, chart, kind });

      if (typeof res === "string" && res.trim()) return res.trim();
      if (res && typeof res.text === "string" && res.text.trim())
        return res.text.trim();
      return null;
    }

    return null;
  } catch (_) {
    return null;
  }
}

function buildDeterministicMoment({ year, chart, kind }) {
  const y = toInt(year);
  const c = normalizeChart(chart || DEFAULT_CHART);

  // Use top 3 if possible for richer fallback; still deterministic and factual.
  const top3 = getTopByYear(y, c, 3);
  const top1 = top3[0] || null;
  if (!top1) return null;

  const a1 = cleanText(top1.artist) || "Unknown Artist";
  const t1 = cleanText(top1.title) || "Unknown Title";

  const a2 = top3[1] ? cleanText(top3[1].artist) || "Unknown Artist" : null;
  const t2 = top3[1] ? cleanText(top3[1].title) || "Unknown Title" : null;

  const a3 = top3[2] ? cleanText(top3[2].artist) || "Unknown Artist" : null;
  const t3 = top3[2] ? cleanText(top3[2].title) || "Unknown Title" : null;

  // Tight, broadcast-friendly, low-fluff, ~50–60 words.
  if (kind === "micro") {
    const extra =
      a2 && t2
        ? ` Behind it: ${a2} (“${t2}”).`
        : a3 && t3
          ? ` Close contenders included ${a3} (“${t3}”).`
          : "";

    return (
      `Micro moment — ${y}: On ${c}, #1 was ${a1} with “${t1}.”` +
      extra +
      ` Want the full Top 10, a story moment, or the next year?`
    );
  }

  // story
  const spine =
    a2 && t2 && a3 && t3
      ? ` The top three shaped the year: ${a1} (“${t1}”), ${a2} (“${t2}”), and ${a3} (“${t3}”).`
      : a2 && t2
        ? ` The top of the chart held steady: ${a1} (“${t1}”) with ${a2} (“${t2}”) close behind.`
        : ` The year’s defining #1 was ${a1} with “${t1}.”`;

  return (
    `Story moment — ${y}: ${spine} ` +
    `That’s the chart spine; the deeper broadcast story expands as we fill Music Moments. ` +
    `Want Top 10, a micro moment, or another year?`
  );
}

function getMomentOrFallback({ year, chart, kind }) {
  const y = toInt(year);
  if (!isYearInRange(y)) return null;

  const c = normalizeChart(chart || DEFAULT_CHART);

  // 1) Try authored layer
  const fromLayer = getMomentFromLayer({ year: y, chart: c, kind });
  if (fromLayer) return fromLayer;

  // 2) Deterministic fallback from chart rows
  return buildDeterministicMoment({ year: y, chart: c, kind });
}

// =========================
// Conversational Entry
// =========================
function handleChat({ text, session }) {
  const msg = cleanText(text);
  session = session || {};

  // Ensure session chart defaults exist
  if (!session.activeMusicChart) session.activeMusicChart = DEFAULT_CHART;

  // v2.71 command parsing (top10 / #1 / story moment #### / micro moment ####)
  const cmd = parseCommand(msg);
  if (cmd) {
    if (cmd.kind === "top10") {
      // If year omitted, use lastMusicYear
      const impliedYear = toInt(cmd.year ?? session.lastMusicYear);

      if (!isYearInRange(impliedYear)) {
        return {
          reply: `Give me a year between ${PUBLIC_MIN_YEAR} and ${PUBLIC_MAX_YEAR} (example: “top 10 1988”).`,
          followUp: ["1956", "1984", "top 10 1988"],
          domain: "music",
          sessionPatch: canonicalPatch(session),
        };
      }

      const y = impliedYear;

      const choice = chooseChartForYear(y, session.activeMusicChart);
      if (!choice.ok) {
        if (choice.reason === "OUT_OF_RANGE_FOR_SINGLES") {
          return {
            reply: `Year-End Singles is only available for 1950–1959 in my current build. Try a year in that range.`,
            followUp: ["1950", "1956", "1959"],
            domain: "music",
            sessionPatch: canonicalPatch(session),
          };
        }
        return {
          reply: `That year’s chart isn’t available yet.`,
          followUp: ["1970", "1984", "1999"],
          domain: "music",
          sessionPatch: canonicalPatch(session),
        };
      }

      const chart = choice.chart;

      // 50s: authoritative singles list
      if (chart === YEAR_END_SINGLES_CHART && y >= 1950 && y <= 1959) {
        const formatted = formatTopList(y, chart, 10);
        if (!formatted) {
          return {
            reply: `I’m missing the ${y} Year-End Singles list in the current Wikipedia cache — so I won’t fake it. Try another 1950s year.`,
            followUp: ["1950", "1956", "1959"],
            domain: "music",
            sessionPatch: canonicalPatch(session, {
              activeMusicChart: chart,
              lastMusicYear: y,
              lastMusicChart: chart,
            }),
          };
        }

        return {
          reply: `${formatted}\n\nWant #1, a story moment, a micro moment, or another year?`,
          followUp: ["#1", `story moment ${y}`, `micro moment ${y}`, "Another year"],
          domain: "music",
          sessionPatch: canonicalPatch(session, {
            activeMusicChart: chart,
            lastMusicYear: y,
            lastMusicChart: chart,
          }),
        };
      }

      // Non-50s: use fallbacks
      const out = formatTopListWithFallbacks(y, chart, 10);
      if (out && out.formatted) {
        const used = out.chartUsed || chart;

        return {
          reply: `${out.formatted}\n\nWant #1, a story moment, a micro moment, or another year?`,
          followUp: ["#1", `story moment ${y}`, `micro moment ${y}`, "Another year"],
          domain: "music",
          sessionPatch: canonicalPatch(session, {
            activeMusicChart: used,
            lastMusicYear: y,
            lastMusicChart: used,
          }),
        };
      }

      // No data available
      const missingHint =
        STATS.moments > 0
          ? ""
          : " (No chart datasets are currently loaded on the server.)";

      return {
        reply: `I don’t have a clean list for ${y} on the available chart sources in this build yet${missingHint}. Try another year.`,
        followUp: ["1970", "1984", "1999"],
        domain: "music",
        sessionPatch: canonicalPatch(session, {
          activeMusicChart: normalizeChart(session.activeMusicChart),
          lastMusicYear: y,
          lastMusicChart: normalizeChart(session.activeMusicChart),
        }),
      };
    }

    if (cmd.kind === "number1") {
      const y = toInt(session.lastMusicYear);
      const chart = normalizeChart(session.lastMusicChart || session.activeMusicChart);

      if (!isYearInRange(y)) {
        return {
          reply: `Tell me a year first (example: “1988” or “top 10 1988”), then I can give you #1.`,
          followUp: ["1988", "top 10 1988", "1956"],
          domain: "music",
          sessionPatch: canonicalPatch(session),
        };
      }

      const line = getNumberOneLine(y, chart);
      if (!line) {
        return {
          reply: `I can’t pull a clean #1 for ${y} on ${chart} in this build yet. Try “top 10 ${y}” or pick another year.`,
          followUp: [`top 10 ${y}`, "1984", "1999"],
          domain: "music",
          sessionPatch: canonicalPatch(session, {
            activeMusicChart: chart,
            lastMusicYear: y,
            lastMusicChart: chart,
          }),
        };
      }

      return {
        reply: `${line}\n\nWant a story moment, a micro moment, or another year?`,
        followUp: [`story moment ${y}`, `micro moment ${y}`, "Another year"],
        domain: "music",
        sessionPatch: canonicalPatch(session, {
          activeMusicChart: chart,
          lastMusicYear: y,
          lastMusicChart: chart,
        }),
      };
    }

    if (cmd.kind === "story" || cmd.kind === "micro") {
      const y = toInt(cmd.year);
      if (!isYearInRange(y)) {
        return {
          reply: `Give me a year between ${PUBLIC_MIN_YEAR} and ${PUBLIC_MAX_YEAR} for a ${
            cmd.kind === "micro" ? "micro moment" : "story moment"
          }.`,
          followUp: ["1957", "1988", "1999"],
          domain: "music",
          sessionPatch: canonicalPatch(session),
        };
      }

      const choice = chooseChartForYear(y, session.activeMusicChart);
      if (!choice.ok) {
        if (choice.reason === "OUT_OF_RANGE_FOR_SINGLES") {
          return {
            reply: `Year-End Singles is only available for 1950–1959 in my current build. Try a year in that range.`,
            followUp: ["1950", "1956", "1959"],
            domain: "music",
            sessionPatch: canonicalPatch(session),
          };
        }
        return {
          reply: `That year’s chart isn’t available yet.`,
          followUp: ["1970", "1984", "1999"],
          domain: "music",
          sessionPatch: canonicalPatch(session),
        };
      }

      const chart = choice.chart;

      const moment = getMomentOrFallback({
        year: y,
        chart,
        kind: cmd.kind === "micro" ? "micro" : "story",
      });

      if (!moment) {
        // Absolute worst case: no rows at all
        return {
          reply: `I can’t pull a clean ${
            cmd.kind === "micro" ? "micro" : "story"
          } moment for ${y} on ${chart} in this build yet. Try “top 10 ${y}”.`,
          followUp: [`top 10 ${y}`, "#1", "Another year"],
          domain: "music",
          sessionPatch: canonicalPatch(session, {
            activeMusicChart: chart,
            lastMusicYear: y,
            lastMusicChart: chart,
          }),
        };
      }

      return {
        reply: moment,
        followUp: [`top 10 ${y}`, "#1", y + 1 <= PUBLIC_MAX_YEAR ? String(y + 1) : "Another year"],
        domain: "music",
        sessionPatch: canonicalPatch(session, {
          activeMusicChart: chart,
          lastMusicYear: y,
          lastMusicChart: chart,
        }),
      };
    }
  }

  // Year-only input?
  const y = toInt(msg);
  if (isYearInRange(y)) {
    const choice = chooseChartForYear(y, session.activeMusicChart);
    if (!choice.ok) {
      if (choice.reason === "OUT_OF_RANGE_FOR_SINGLES") {
        return {
          reply: `Year-End Singles is only available for 1950–1959 in my current build. Try a year in that range.`,
          followUp: ["1950", "1956", "1959"],
          domain: "music",
          sessionPatch: canonicalPatch(session),
        };
      }
      return {
        reply: `That year’s chart isn’t available yet.`,
        followUp: ["1970", "1984", "1999"],
        domain: "music",
        sessionPatch: canonicalPatch(session),
      };
    }

    const chart = choice.chart;

    // 1950s Year-End Singles
    if (chart === YEAR_END_SINGLES_CHART && y >= 1950 && y <= 1959) {
      const rows = getTopByYear(y, chart, 10);

      if (!rows.length) {
        return {
          reply: `I’m missing the ${y} Year-End Singles list in the current Wikipedia cache — so I won’t fake it. Try another 1950s year.`,
          followUp: ["1950", "1956", "1959"],
          domain: "music",
          sessionPatch: canonicalPatch(session, {
            activeMusicChart: chart,
            lastMusicYear: y,
            lastMusicChart: chart,
          }),
        };
      }

      const formatted = formatTopList(y, chart, 10);
      return {
        reply: `${formatted}\n\nWant #1, a story moment, a micro moment, or another year?`,
        followUp: ["#1", `story moment ${y}`, `micro moment ${y}`, "Another year"],
        domain: "music",
        sessionPatch: canonicalPatch(session, {
          activeMusicChart: chart,
          lastMusicYear: y,
          lastMusicChart: chart,
        }),
      };
    }

    // Non-50s: format using fallbacks
    const out = formatTopListWithFallbacks(y, chart, 10);

    if (out && out.formatted) {
      const used = out.chartUsed || chart;
      return {
        reply: `${out.formatted}\n\nWant #1, a story moment, a micro moment, or another year?`,
        followUp: ["#1", `story moment ${y}`, `micro moment ${y}`, "Another year"],
        domain: "music",
        sessionPatch: canonicalPatch(session, {
          activeMusicChart: used,
          lastMusicYear: y,
          lastMusicChart: used,
        }),
      };
    }

    const missingHint =
      STATS.moments > 0
        ? ""
        : " (No chart datasets are currently loaded on the server.)";

    return {
      reply: `I don’t have a clean list for ${y} on the available chart sources in this build yet${missingHint}. Try another year.`,
      followUp: ["1970", "1984", "1999"],
      domain: "music",
      sessionPatch: canonicalPatch(session, {
        activeMusicChart: normalizeChart(session.activeMusicChart),
        lastMusicYear: y,
        lastMusicChart: normalizeChart(session.activeMusicChart),
      }),
    };
  }

  // Lane prompt handling
  if (/^music$/i.test(msg)) {
    return {
      reply: `Alright—music. Give me a year (1950–2024), or say “top 10 1988”, “story moment 1988”, or “micro moment 1988”.`,
      followUp: ["1956", "top 10 1988", "micro moment 1955"],
      domain: "music",
      sessionPatch: canonicalPatch(session, { activeMusicChart: DEFAULT_CHART }),
    };
  }

  // Default prompt
  return {
    reply: `Tell me a year (1950–2024), or say “top 10 1988”, “#1”, “story moment 1988”, or “micro moment 1988”.`,
    followUp: ["1956", "top 10 1988", "story moment 1955"],
    domain: "music",
    sessionPatch: canonicalPatch(session),
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
