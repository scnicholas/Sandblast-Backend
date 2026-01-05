"use strict";

/**
 * Utils/musicKnowledge.js — v2.70
 *
 * Critical fixes retained (v2.69):
 *  - Validate session.activeMusicChart against loaded chart set; auto-fallback if unsupported.
 *  - Year-only requests never dead-end due to unknown chart context (e.g., "Canada RPM").
 *  - If the requested chart has no rows for a year, retry canonical fallbacks before returning “clean list”.
 *  - Normalize common chart aliases consistently (RPM, Canada RPM, Year-End variants).
 *
 * Improvements in v2.70 (critical for your current Nyx flow):
 *  - Always return a canonical sessionPatch (stop relying on session mutation for correctness).
 *  - Parse and respond to: "top 10 ####", "top ten ####", "#1", and "story moment ####".
 *  - "#1" uses session.lastMusicYear if present; otherwise asks for a year.
 *  - If story moments layer isn't deployed, respond truthfully and give a next best action.
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
  "musicKnowledge v2.70 (command parsing + canonical sessionPatch + stronger degrade messaging)";

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

// =========================
// Command Parsing (v2.70)
// =========================
function parseCommand(msg) {
  const t = cleanText(msg).toLowerCase();
  if (!t) return null;

  let m = t.match(/\btop\s*(10|ten)\s*(\d{4})\b/);
  if (m) return { kind: "top10", year: Number(m[2]) };

  m = t.match(/\b(story\s+moment|music\s+moment|moment|moments)\s*(\d{4})\b/);
  if (m) return { kind: "story", year: Number(m[2]) };

  if (t === "#1" || t === "1" || t === "number 1") return { kind: "number1" };

  // Year-only is handled elsewhere; do not treat it as a special "command" here.
  return null;
}

function canonicalPatch(session, extra = {}) {
  const patch = {
    activeMusicChart: session.activeMusicChart || DEFAULT_CHART,
    lastMusicYear: session.lastMusicYear ?? null,
    lastMusicChart: session.lastMusicChart || session.activeMusicChart || DEFAULT_CHART,
    ...extra,
  };

  // Strip null-ish fields where it helps (keeps sessionPatch clean)
  if (!patch.lastMusicYear) delete patch.lastMusicYear;
  if (!patch.lastMusicChart) delete patch.lastMusicChart;

  return patch;
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
    if (y >= 1950 && y <= 1959) return { ok: true, chart: YEAR_END_SINGLES_CHART };
    return { ok: false, reason: "OUT_OF_RANGE_FOR_SINGLES" };
  }

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

  return `Top ${Math.min(limit, lines.length)} — ${c} (${year}):\n${lines.join("\n")}`;
}

function formatTopListWithFallbacks(year, requestedChart, limit = 10) {
  loadDb();
  const y = toInt(year);
  if (!y) return null;

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
// Conversational Entry
// =========================
function handleChat({ text, session }) {
  const msg = cleanText(text);
  session = session || {};

  // Ensure session chart defaults exist
  if (!session.activeMusicChart) session.activeMusicChart = DEFAULT_CHART;

  // v2.70 command parsing (top10 / #1 / story moment ####)
  const cmd = parseCommand(msg);
  if (cmd) {
    if (cmd.kind === "top10") {
      const y = toInt(cmd.year);
      if (!y || y < PUBLIC_MIN_YEAR || y > PUBLIC_MAX_YEAR) {
        return {
          reply: `Give me a year between ${PUBLIC_MIN_YEAR} and ${PUBLIC_MAX_YEAR}.`,
          followUp: ["1956", "1984", "1999"],
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
      session.activeMusicChart = chart;

      // 50s: authoritative singles list
      if (chart === YEAR_END_SINGLES_CHART && y >= 1950 && y <= 1959) {
        const formatted = formatTopList(y, chart, 10);
        if (!formatted) {
          session.lastMusicYear = y;
          session.lastMusicChart = chart;
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

        session.lastMusicYear = y;
        session.lastMusicChart = chart;
        return {
          reply: `${formatted}\n\nWant #1, a story moment, or another year?`,
          followUp: ["#1", "Story moment", "Another year"],
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
        session.activeMusicChart = out.chartUsed || chart;
        session.lastMusicYear = y;
        session.lastMusicChart = session.activeMusicChart;

        return {
          reply: `${out.formatted}\n\nWant #1, a story moment, or another year?`,
          followUp: ["#1", "Story moment", "Another year"],
          domain: "music",
          sessionPatch: canonicalPatch(session, {
            activeMusicChart: session.activeMusicChart,
            lastMusicYear: y,
            lastMusicChart: session.activeMusicChart,
          }),
        };
      }

      // No data available
      session.lastMusicYear = y;
      session.lastMusicChart = session.activeMusicChart;

      const missingHint =
        STATS.moments > 0
          ? ""
          : " (No chart datasets are currently loaded on the server.)";

      return {
        reply: `I don’t have a clean list for ${y} on the available chart sources in this build yet${missingHint}. Try another year.`,
        followUp: ["1970", "1984", "1999"],
        domain: "music",
        sessionPatch: canonicalPatch(session, {
          activeMusicChart: session.activeMusicChart,
          lastMusicYear: y,
          lastMusicChart: session.activeMusicChart,
        }),
      };
    }

    if (cmd.kind === "number1") {
      const y = toInt(session.lastMusicYear);
      const chart = normalizeChart(session.lastMusicChart || session.activeMusicChart);

      if (!y || y < PUBLIC_MIN_YEAR || y > PUBLIC_MAX_YEAR) {
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
        reply: `${line}\n\nWant a story moment for ${y}, or another year?`,
        followUp: [`story moment ${y}`, "Another year", "top 10 " + y],
        domain: "music",
        sessionPatch: canonicalPatch(session, {
          activeMusicChart: chart,
          lastMusicYear: y,
          lastMusicChart: chart,
        }),
      };
    }

    if (cmd.kind === "story") {
      const y = toInt(cmd.year);
      if (!y || y < PUBLIC_MIN_YEAR || y > PUBLIC_MAX_YEAR) {
        return {
          reply: `Give me a year between ${PUBLIC_MIN_YEAR} and ${PUBLIC_MAX_YEAR} for a story moment.`,
          followUp: ["1957", "1988", "1999"],
          domain: "music",
          sessionPatch: canonicalPatch(session),
        };
      }

      // Truthful: this module doesn't generate story moments; that's musicMoments layer.
      session.lastMusicYear = y;
      session.lastMusicChart = normalizeChart(session.activeMusicChart);

      return {
        reply:
          `I can anchor ${y} with the chart facts, but the broadcast “story moment” is handled by the Music Moments layer.\n\n` +
          `If you want the raw spine right now, say “top 10 ${y}” and then “#1”.`,
        followUp: [`top 10 ${y}`, "#1", "another year"],
        domain: "music",
        sessionPatch: canonicalPatch(session, {
          lastMusicYear: y,
          lastMusicChart: session.lastMusicChart,
        }),
      };
    }
  }

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
    session.activeMusicChart = chart;

    // 1950s Year-End Singles
    if (chart === YEAR_END_SINGLES_CHART && y >= 1950 && y <= 1959) {
      const rows = getTopByYear(y, chart, 10);
      session.lastMusicYear = y;
      session.lastMusicChart = chart;

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
        reply: `${formatted}\n\nWant #1, a story moment, or another year?`,
        followUp: ["#1", "Story moment", "Another year"],
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
    session.lastMusicYear = y;
    session.lastMusicChart = session.activeMusicChart;

    if (out && out.formatted) {
      session.activeMusicChart = out.chartUsed || chart;
      session.lastMusicChart = session.activeMusicChart;

      return {
        reply: `${out.formatted}\n\nWant #1, a story moment, or another year?`,
        followUp: ["#1", "Story moment", "Another year"],
        domain: "music",
        sessionPatch: canonicalPatch(session, {
          activeMusicChart: session.activeMusicChart,
          lastMusicYear: y,
          lastMusicChart: session.activeMusicChart,
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
        activeMusicChart: session.activeMusicChart,
        lastMusicYear: y,
        lastMusicChart: session.activeMusicChart,
      }),
    };
  }

  // Lane prompt handling
  if (/^music$/i.test(msg)) {
    session.activeMusicChart = DEFAULT_CHART;
    return {
      reply: `Alright—music. Give me a year (1950–2024) or an artist + year, and I’ll pull something memorable.`,
      followUp: ["1956", "1984", "1999"],
      domain: "music",
      sessionPatch: canonicalPatch(session, { activeMusicChart: DEFAULT_CHART }),
    };
  }

  // Default prompt
  return {
    reply: `Tell me a year (1950–2024), or an artist + year (example: “Prince 1984”). You can also say “top 10 1988” or “#1”.`,
    followUp: ["1956", "Prince 1984", "top 10 1988"],
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
