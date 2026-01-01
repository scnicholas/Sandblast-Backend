"use strict";

/**
 * Utils/musicKnowledge.js — v2.62
 *
 * FIXES IN v2.62:
 *  1) Never output "Unknown Title" / "Unknown Artist" in Top lists.
 *     - getTopByYear prefers clean moments; if none are clean, returns [] (forces a proper fallback message).
 *  2) Pre-Hot 100 sanity:
 *     - For years < 1958, DEFAULT_CHART ("Billboard Hot 100") is not valid.
 *       We route to 1950–1959 Year-End Singles ONLY if that year exists in cache;
 *       otherwise we return a clean "missing cache" message (no fake Hot 100 rows).
 *
 * Keeps v2.61:
 *  - 50s singles existence gating
 *  - safer chart fallback + improved missing-year messaging
 *  - render-time rank repair
 *  - Wikipedia merges + priority dedupe
 */

const fs = require("fs");
const path = require("path");

const MK_VERSION =
  "musicKnowledge v2.62 (no-UnknownTitle leakage + pre-1958 chart sanity + clean fallback)";

const DEFAULT_CHART = "Billboard Hot 100";
const TOP40_CHART = "Top40Weekly Top 100";
const YEAR_END_CHART = "Billboard Year-End Hot 100";
const YEAR_END_SINGLES_CHART = "Billboard Year-End Singles";

const PUBLIC_MIN_YEAR = 1950;
const PUBLIC_MAX_YEAR = 2024;

const DATA_DIR_ENV = String(process.env.DATA_DIR || "").trim();
const NYX_DEBUG = String(process.env.NYX_DEBUG || "false").toLowerCase() === "true";

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

function normalizeUserText(raw) {
  return String(raw || "")
    .replace(/\u00A0/g, " ")
    .replace(/^\s*try\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanField(s) {
  let t = cleanText(s);
  t = t.replace(/^"\s*/g, "").replace(/\s*"$/g, "");
  return cleanText(t);
}

function renumberSequentialByRank(rows, limit) {
  const ranked = (rows || []).filter((m) => m && m.rank != null);
  ranked.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const out = ranked.slice(0, Math.max(1, limit || ranked.length));
  for (let i = 0; i < out.length; i++) out[i].rank = i + 1;
  return out;
}

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

function hasWikiSingles50sYear(y) {
  const arr = WIKI_SINGLES_50S_BY_YEAR.get(y);
  return Array.isArray(arr) && arr.length > 0;
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

  // 1950–1959 authoritative cache
  if (c === YEAR_END_SINGLES_CHART && y >= 1950 && y <= 1959) {
    const arr = WIKI_SINGLES_50S_BY_YEAR.get(y) || [];
    if (!arr.length) return [];
    return renumberSequentialByRank(arr, limit);
  }

  let out = BY_YEAR_CHART.get(`${y}|${c}`) || [];

  if (!out.length) {
    const b = readBucket(c, y);
    if (Array.isArray(b) && b.length) out = b;
  }

  // If a year-end chart is empty, try common fallbacks (kept from prior versions)
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

  // v2.62: Prefer clean moments; never output Unknown Title/Artist
  const clean = out.filter(isCleanMoment);
  if (!clean.length) return [];

  const ranked = clean.filter((m) => m.rank != null);
  const base = ranked.length ? ranked.sort((a, b) => a.rank - b.rank) : clean;

  return base.slice(0, Math.max(1, limit));
}

function getNumberOneByYear(year, chart = DEFAULT_CHART) {
  const top = getTopByYear(year, chart, 1);
  return top[0] || null;
}

/* =========================
   CONVERSATIONAL ROUTING
========================= */

// Hot 100 begins 1958; pre-1958 must not claim Hot 100
function isHot100ValidForYear(year) {
  const y = toInt(year);
  return y != null && y >= 1958;
}

function chooseChartForYear(requestedChart, year) {
  const y = toInt(year);
  const requested = normalizeChart(requestedChart || DEFAULT_CHART);

  // 1950–1959: use Year-End Singles ONLY if that year exists in cache.
  if (y != null && y >= 1950 && y <= 1959) {
    if (hasWikiSingles50sYear(y)) return YEAR_END_SINGLES_CHART;
    // Do NOT fall back to Hot 100 for pre-1958
    return "MISSING_50S_SINGLE_YEAR";
  }

  // If someone asks for Hot 100 pre-1958, don't pretend.
  if (requested === DEFAULT_CHART && y != null && !isHot100ValidForYear(y)) {
    return "PRE_HOT100_UNSUPPORTED";
  }

  if (requested === YEAR_END_SINGLES_CHART && y != null && (y < 1950 || y > 1959)) {
    if (y >= 1970 && y <= 2010) return YEAR_END_CHART;
    return DEFAULT_CHART;
  }

  if (requested === YEAR_END_CHART && y != null && (y < 1970 || y > 2010)) {
    return DEFAULT_CHART;
  }

  return requested;
}

function parseYearFromText(text) {
  const t = normalizeUserText(text);
  const m = t.match(/\b(19\d{2}|20\d{2})\b/);
  return m ? toInt(m[1]) : null;
}

function formatTopList(year, chart, limit = 10) {
  const finalChart = normalizeChart(chart);
  let list = getTopByYear(year, finalChart, limit);
  if (!list.length) return null;

  const ranks = list.map((m) => toInt(m.rank)).filter((n) => n != null);
  const uniq = new Set(ranks);

  const hasDuplicate = uniq.size !== ranks.length;

  let hasGap = false;
  for (let i = 1; i <= Math.min(list.length, limit); i++) {
    if (!uniq.has(i)) {
      hasGap = true;
      break;
    }
  }

  if (hasGap || hasDuplicate) {
    list = renumberSequentialPreserveOrder(list);
  }

  const lines = list.map((m, i) => {
    const rk = m.rank != null ? String(m.rank) : String(i + 1);
    const a = _t(m.artist) || "Unknown Artist";
    const tt = _t(m.title) || "Unknown Title";
    return `${rk}. ${a} — ${tt}`;
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

  const rawText = String(text ?? "");
  const userText = normalizeUserText(rawText);

  const st = session && typeof session === "object" ? session : {};
  const requestedChart =
    st.activeMusicChart || st.musicChart || st.activeChart || st.chart || null;

  const publicRange = `${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}`;

  const year = parseYearFromText(userText);

  if (NYX_DEBUG) {
    console.log("[musicKnowledge] IN", {
      textRaw: rawText,
      textNorm: userText,
      year,
      activeMusicChart: st.activeMusicChart,
      musicChart: st.musicChart,
      activeDomain: st.activeDomain,
    });
  }

  if (!userText) {
    const yrs = pickFollowUpYears();
    return {
      reply: `Alright—music. Give me a year (${publicRange}) or an artist + year, and I’ll pull something memorable.`,
      followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, "Try: Prince 1984"],
      domain: "music",
    };
  }

  if (year != null) {
    if (year < PUBLIC_MIN_YEAR || year > PUBLIC_MAX_YEAR) {
      const yrs = pickFollowUpYears();
      return {
        reply: `Keep it in ${publicRange}. Give me one year and I’ll go to work.`,
        followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, `Try: ${yrs[2]}`],
        domain: "music",
      };
    }

    const chartChoice = chooseChartForYear(requestedChart, year);

    // v2.62: explicit, honest pre-1958 behavior (no fake Hot 100 rows)
    if (chartChoice === "PRE_HOT100_UNSUPPORTED") {
      return {
        reply: `For ${year}, Billboard Hot 100 wasn’t running yet. I can use 1950s Year-End Singles when that year is in the Wikipedia cache — otherwise, pick another year.`,
        followUp: ["Try: 1950", "Try: 1956", "Try: 1959"],
        domain: "music",
      };
    }

    if (chartChoice === "MISSING_50S_SINGLE_YEAR") {
      const yrs = [1950, 1952, 1956, 1959].filter((x) => x !== year).slice(0, 3);
      return {
        reply: `I’m missing the ${year} Year-End Singles list in the current Wikipedia cache — so I won’t fake it. Try another 1950s year while we rebuild that slice.`,
        followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, `Try: ${yrs[2]}`],
        domain: "music",
      };
    }

    const formatted = formatTopList(year, chartChoice, 10);
    if (formatted) {
      return {
        reply: `${formatted}\n\nWant #1, a story moment, or another year?`,
        followUp: ["#1", "Story moment", "Another year"],
        domain: "music",
      };
    }

    // If we couldn't produce a clean list, be explicit (no "Unknown Title" leakage)
    const yrs = pickFollowUpYears();
    return {
      reply: `I don’t have a clean chart list for ${year} in the current sources yet. Try another year in ${publicRange}.`,
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
};
