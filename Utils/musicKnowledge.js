"use strict";

/**
 * Utils/musicKnowledge.js — v2.54
 *
 * FIXES IN v2.54:
 *  - Deterministic dedupe + precedence merge (chart|year|rank), Wikipedia wins over DB placeholders.
 *  - Wikipedia merges now stamp `source` so precedence is reliable.
 *  - Hard validation for Billboard Year-End Singles (1950–1959) to prevent Unknown/undefined shipping.
 *
 * RETAINS v2.53 BEHAVIOR:
 *  - Public range 1950–2024
 *  - Canonical chart mapping hardening for "Billboard Year-End Singles"
 *  - Treat Year-End Singles as year-end for fallback logic
 *  - formatTopList labels with final chosen chart
 *  - 1988 #3 George Harrison hard-fix
 *  - rank-safe lists + rank aliases
 *  - Wikipedia Year-End merge (1970–2010 file)
 *  - Buckets fallback + cache
 *  - 1950s Year-End Singles merge (1950–1959)
 */

const fs = require("fs");
const path = require("path");

const MK_VERSION =
  "musicKnowledge v2.54 (dedupe+priority merge + 50s singles validation; retains v2.53 behavior)";

const DEFAULT_CHART = "Billboard Hot 100";
const TOP40_CHART = "Top40Weekly Top 100";
const YEAR_END_CHART = "Billboard Year-End Hot 100";

// 1950s Wikipedia Year-End Singles chart (Top 30/50/100 by year)
const YEAR_END_SINGLES_CHART = "Billboard Year-End Singles";

// PUBLIC (what Nyx says/accepts)
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

// Buckets cache: key = `${chart}|${year}` => array
const BUCKET_CACHE = new Map();

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

/* =========================
   CHART NORMALIZATION (HARDENED)
========================= */

function normalizeChart(chart) {
  const raw = chart || DEFAULT_CHART;
  const rawKey = normKey(raw);

  // HARD guarantee + tolerant match for the Singles chart label.
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

  // Explicitly distinguish 1950s "year-end singles" pages
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
  // Singles is also Year-End
  return normalizeChart(chart) === YEAR_END_SINGLES_CHART;
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

  // Normalize core fields
  m.artist = artist || "Unknown Artist";
  m.title = title || "Unknown Title";
  m.chart = normalizeChart(m.chart);

  // Keep year numeric if possible (prevents subtle key mismatches)
  if (year != null) m.year = year;

  // Keep rank numeric if possible
  if (rank != null) m.rank = rank;

  return m;
}

/* =========================
   PRIORITY + DEDUPE (v2.54)
========================= */

function srcPriority(row) {
  const chart = normalizeChart(row.chart);
  const y = toInt(row.year);
  const src = String(row.source || row.dbSource || row.origin || "").toLowerCase();

  // 50s singles: Wikipedia should always win (when same chart/year/rank exists)
  if (
    chart === YEAR_END_SINGLES_CHART &&
    y != null &&
    y >= 1950 &&
    y <= 1959
  ) {
    if (src.includes("wikipedia.org")) return 1000;
    // Non-wiki: still allow, but lower
    return 100;
  }

  // General preference
  if (src.includes("wikipedia.org")) return 500;

  // Prefer rows that are not placeholder-y
  const title = _t(row.title);
  const artist = _t(row.artist);
  const nonPlaceholder = title && title !== "Unknown Title" && artist && artist !== "Unknown Artist";
  if (nonPlaceholder) return 200;

  // DB / unknown origins
  return 50;
}

function dedupeMomentsByPriority(moments) {
  const out = new Map();
  const passthrough = [];

  for (const raw of moments) {
    const m = normalizeMoment(raw);

    const chart = normalizeChart(m.chart);
    const y = toInt(m.year);
    const rk = toInt(m.rank);

    // Primary dedupe key for charts that have ranks (year-end lists)
    const key = chart && y != null && rk != null ? `${chart}|${y}|${rk}` : null;

    if (!key) {
      // no safe dedupe identity: keep as-is
      passthrough.push(m);
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

function validateSingles50sOrThrow(moments) {
  // Ensure 1950–1959 Year-End Singles is clean (no Unknowns, ranks present)
  const slice = moments.filter((m) => {
    const c = normalizeChart(m.chart);
    const y = toInt(m.year);
    return c === YEAR_END_SINGLES_CHART && y != null && y >= 1950 && y <= 1959;
  });

  if (!slice.length) return;

  const bad = slice.filter((m) => {
    const y = toInt(m.year);
    const rk = toInt(m.rank);
    const t = _t(m.title);
    const a = _t(m.artist);
    return (
      y == null ||
      rk == null ||
      !t ||
      t === "Unknown Title" ||
      !a ||
      a === "Unknown Artist"
    );
  });

  if (bad.length) {
    console.warn("[musicKnowledge] CORRUPT 50s Singles sample:", bad.slice(0, 10));
    throw new Error(
      `[musicKnowledge] Corrupt Billboard Year-End Singles (1950–1959): bad=${bad.length} total=${slice.length}`
    );
  }
}

/* =========================
   WIKIPEDIA YEAR-END MERGE
========================= */

function mergeWikipediaYearEnd(moments) {
  const abs = path.resolve(__dirname, "..", WIKI_YEAREND_COMBINED);
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
        source: abs, // stamp source for priority decisions
      })
    );
  }

  console.log(
    `[musicKnowledge] Wikipedia Year-End merge: source=${abs} rows=${merged.length}`
  );
  return moments.concat(merged);
}

// 1950s Year-End Singles merge (Top 30/50/100 by year)
function mergeWikipediaYearEndSingles50s(moments) {
  const abs = path.resolve(__dirname, "..", WIKI_YEAREND_SINGLES_1950_1959);
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
        source: abs, // stamp source for priority decisions
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

function resolveRepoPath(rel) {
  if (path.isAbsolute(rel)) return rel;
  if (DATA_DIR_ENV) return path.resolve(DATA_DIR_ENV, rel);
  return path.resolve(__dirname, "..", rel);
}

function loadDb() {
  if (DB && INDEX_BUILT) return DB;

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

  // Stamp DB source on rows that do not have a source (helps priority merge)
  if (Array.isArray(moments) && LOADED_FROM) {
    for (const m of moments) {
      if (m && typeof m === "object" && !m.source) m.source = LOADED_FROM;
    }
  }

  // merges (append)
  moments = mergeWikipediaYearEnd(moments);
  moments = mergeWikipediaYearEndSingles50s(moments);

  // v2.54: dedupe + priority merge to prevent placeholders from winning
  moments = dedupeMomentsByPriority(moments);

  // v2.54: hard validation for 50s singles
  validateSingles50sOrThrow(moments);

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

  console.log(
    `[musicKnowledge] Loaded ${moments.length} moments (${minY}–${maxY})`
  );
  console.log(`[musicKnowledge] DB source: ${LOADED_FROM}`);
  console.log(`[musicKnowledge] Charts: ${STATS.charts.join(" | ")}`);
  console.log(`[musicKnowledge] ${MK_VERSION}`);

  return DB;
}

/* =========================
   BUCKET LOADER (optional)
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
  } catch (e) {
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

  let out = BY_YEAR_CHART.get(`${y}|${c}`) || [];

  // If missing in-memory, try deterministic bucket
  if (!out.length) {
    const b = readBucket(c, y);
    if (Array.isArray(b) && b.length) out = b;
  }

  // For Year-End: if no entries, fall back to broad sources
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
   CHART RANGES (internal truth)
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

  for (const [chart, v] of perChart.entries()) {
    CHART_RANGES.set(chart, {
      min: v.min,
      max: v.max,
      countYears: v.years.size,
    });
  }
}

function getChartYearRange(chart) {
  buildChartRanges();
  const c = normalizeChart(chart || DEFAULT_CHART);
  const r = CHART_RANGES.get(c);

  if (r && r.min != null && r.max != null) return { chart: c, ...r };

  loadDb();
  return {
    chart: c,
    min: STATS.yearMin,
    max: STATS.yearMax,
    countYears: null,
  };
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

  // 1950–1959: prefer Year-End Singles when user asks for Hot 100 or Year-End Hot 100
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
  // IMPORTANT: label must reflect the final chosen chart
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

    const bucketArr = readBucket(finalChart, year);
    if (Array.isArray(bucketArr) && bucketArr.length === 0) {
      const yrs = pickFollowUpYears();
      return {
        reply: `I’m set up for ${publicRange}, but I don’t have chart rows for ${year} on this source yet. Try another year and I’ll pull it instantly.`,
        followUp: [`Try: ${yrs[0]}`, `Try: ${yrs[1]}`, `Try: ${yrs[2]}`],
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
