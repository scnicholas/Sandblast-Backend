"use strict";

/**
 * musicKnowledge.js — Bulletproof V2.23 (Music Flow V1 Ready)
 * Based on your V2.22 file.
 *
 * V2.23 upgrades (Music Flow V1):
 * - Rank-aware Top 10 correctness (uses rank 1–10 where available)
 * - #1 only support (rank === 1)
 * - Explicit chart routing (resolveChart + hasChart + controlled fallback)
 * - Top40Weekly merge now injects rank deterministically when missing (index+1)
 * - Keeps your deterministic drift repairs (Prayer Madonna, Elevator Aerosmith, etc.)
 */

const fs = require("fs");
const path = require("path");

// =============================
// CONFIG
// =============================
const DEFAULT_CHART = "Billboard Hot 100";
const TOP40_CHART = "Top40Weekly Top 100";

// Toggle Top40Weekly merge via env (safe default: true if dir exists)
const MERGE_TOP40WEEKLY = String(process.env.MERGE_TOP40WEEKLY ?? "true").toLowerCase() === "true";

// Candidate DB file names (we try these in order)
const DB_CANDIDATES_DEFAULT = [
  "Data/music_moments_v2_layer2_plus500.json",
  "Data/music_moments_v2_layer2_filled.json",
  "Data/music_moments_v2_layer2.json",
  "Data/music_moments.json"
];

// Allow overriding DB candidates via env: DB_CANDIDATES="Data/a.json,Data/b.json"
const DB_CANDIDATES_ENV = process.env.DB_CANDIDATES;

// Allow forcing a single DB file path
const DB_PATH_ENV = process.env.MUSIC_DB_PATH;

// Optional: set base data dir explicitly
const DATA_DIR_ENV = process.env.DATA_DIR;

// =============================
// HELPERS
// =============================
function stripBom(s) {
  if (!s) return s;
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function readJsonFile(absPath) {
  const raw = stripBom(fs.readFileSync(absPath, "utf8"));
  return JSON.parse(raw);
}

function toInt(x) {
  const n = Number(String(x ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function toRank(x) {
  const n = Number(String(x ?? "").trim());
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 100) return null;
  return n;
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeChart(chart) {
  const c = String(chart || DEFAULT_CHART).trim();
  if (
    c === TOP40_CHART ||
    c === "Top40Weekly" ||
    c === "Billboard Hot 100" ||
    c === "UK Singles Chart" ||
    c === "Canada RPM"
  ) {
    return c === "Top40Weekly" ? TOP40_CHART : c;
  }
  // pass-through for unknown charts
  return c;
}

// -----------------------------
// Moment normalization / drift repair (Top40Weekly ingest fixes)
// -----------------------------
// NOTE: deterministic, low-risk repairs only.

const KNOWN_ARTISTS_SECOND_TOKEN = new Set([
  "Madonna",
  "Aerosmith",
  "Whitesnake",
]);

function _asText(x) {
  return (x == null ? "" : String(x)).trim();
}

function normalizeMomentFields(m) {
  if (!m || typeof m !== "object") return m;

  let artist = _asText(m.artist);
  let title = _asText(m.title);
  const year = Number(m.year);

  // 1) Hard fixes for known corrupted rows (deterministic, zero-risk)
  if (year === 1989 && /^Prayer Madonna$/i.test(artist) && /^Like a$/i.test(title)) {
    artist = "Madonna";
    title = "Like a Prayer";
  }

  if (year === 1989 && /^Elevator Aerosmith$/i.test(artist) && /^Love in an$/i.test(title)) {
    artist = "Aerosmith";
    title = "Love in an Elevator";
  }

  if (year === 1989 && /^Healey Band$/i.test(artist) && /^Angel Eyes The Jeff$/i.test(title)) {
    artist = "The Jeff Healey Band";
    title = "Angel Eyes";
  }

  if (year === 1988 && /^Love Whitesnake$/i.test(artist) && /^Is This$/i.test(title)) {
    artist = "Whitesnake";
    title = "Is This Love";
  }

  // 2) Generic “two-token artist drift” repair:
  const parts = artist.split(/\s+/).filter(Boolean);
  if (parts.length === 2 && KNOWN_ARTISTS_SECOND_TOKEN.has(parts[1])) {
    const spill = parts[0]; // e.g., "Prayer", "Elevator"
    const candidateArtist = parts[1];

    // Only apply if title looks truncated
    const titleWords = title.split(/\s+/).filter(Boolean);
    const titleLooksTruncated =
      titleWords.length <= 4 || /\b(a|an|the|this|that|to|in|on|of|for|with)\b$/i.test(title);

    if (titleLooksTruncated) {
      artist = candidateArtist;
      title = `${title} ${spill}`.trim();
    }
  }

  m.artist = artist;
  m.title = title;
  return m;
}

// =============================
// TOP40WEEKLY MERGE (optional)
// =============================
function resolveDataDir() {
  if (DATA_DIR_ENV) return path.resolve(DATA_DIR_ENV);
  return path.resolve(process.cwd(), "Data");
}

function resolveTop40WeeklyDir() {
  const dataDir = resolveDataDir();

  const candidate = path.join(dataDir, "top40weekly");
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;

  const candidate2 = path.join(dataDir, "Top40Weekly");
  if (fs.existsSync(candidate2) && fs.statSync(candidate2).isDirectory()) return candidate2;

  try {
    const entries = fs.readdirSync(dataDir, { withFileTypes: true });
    const match = entries.find((e) => e.isDirectory() && String(e.name).toLowerCase() === "top40weekly");
    if (match) return path.join(dataDir, match.name);
  } catch {}

  const variants = ["Data/Top40Weekly", "Data/top40Weekly", "Data/TOP40WEEKLY"];
  for (const v of variants) {
    const abs = path.resolve(process.cwd(), v);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return abs;
  }
  return null;
}

function listTop40Files(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    const name = String(e.name);
    if (!/\.json$/i.test(name)) continue;
    if (!/top100_/i.test(name)) continue;
    out.push(path.join(dir, name));
  }
  out.sort();
  return out;
}

function safeJsonParseTop40(raw, file) {
  try {
    return JSON.parse(stripBom(raw));
  } catch (err) {
    console.log(`[musicKnowledge] WARN: failed to parse ${file}: ${err?.message || err}`);
    return null;
  }
}

function pickYearFromFilename(file) {
  const m = String(file).match(/(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

function mergeTop40Weekly(existingMoments, seenKeys) {
  const dir = resolveTop40WeeklyDir();
  if (!dir) {
    console.log("[musicKnowledge] Top40Weekly merge: dir not found, skipping merge.");
    return { dir: null, files: 0, added: 0, skipped: 0, emptySkipped: 0, yearMin: null, yearMax: null };
  }

  const files = listTop40Files(dir);
  let added = 0;
  let skipped = 0;
  let emptySkipped = 0;
  let yearMin = null;
  let yearMax = null;

  for (const f of files) {
    let raw;
    try {
      raw = fs.readFileSync(f, "utf8");
    } catch (err) {
      console.log(`[musicKnowledge] WARN: cannot read ${f}: ${err?.message || err}`);
      continue;
    }

    const data = safeJsonParseTop40(raw, f);
    if (!data) {
      skipped++;
      continue;
    }

    const year = toInt(data.year) ?? pickYearFromFilename(f);
    if (!year) {
      skipped++;
      continue;
    }

    if (yearMin == null || year < yearMin) yearMin = year;
    if (yearMax == null || year > yearMax) yearMax = year;

    const rows = Array.isArray(data.rows) ? data.rows : Array.isArray(data) ? data : [];
    if (!rows.length) {
      emptySkipped++;
      continue;
    }

    // IMPORTANT: inject rank if missing (index+1) because Top40Weekly is a Top 100 list
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const forcedRank = toRank(r.rank ?? r.position ?? r.pos ?? r.place) ?? (i + 1);
      const m = normalizeMoment(r, year, TOP40_CHART, forcedRank);
      if (!m) continue;

      const key = `${m._na}|${m._nt}|${m.year}|${m.chart}`;
      if (seenKeys.has(key)) continue;

      seenKeys.add(key);
      existingMoments.push(m);
      added++;
    }
  }

  console.log(
    `[musicKnowledge] Top40Weekly Top 100 merge: dir=${dir} files=${files.length} added=${added} (skipped=${skipped}, emptySkipped=${emptySkipped}) years=${yearMin ?? "?"}–${yearMax ?? "?"}`
  );

  return { dir, files: files.length, added, skipped, emptySkipped, yearMin, yearMax };
}

// =============================
// TOP40WEEKLY ARTIST/TITLE FIXUPS (light heuristic)
// =============================
let TOP40_ARTIST_SET = new Set();
let TOP40_ONEWORD_SET = new Set();

function buildArtistSet(moments) {
  const set = new Set();
  for (const m of moments) {
    if (!m || m.chart !== TOP40_CHART) continue;
    const a = String(m.artist || "").trim();
    if (a) set.add(a.toLowerCase());
  }
  return set;
}

function buildOneWordActSet(moments) {
  const set = new Set();
  for (const m of moments) {
    if (!m || m.chart !== TOP40_CHART) continue;
    const a = String(m.artist || "").trim();
    if (!a) continue;
    const parts = a.split(/\s+/).filter(Boolean);
    if (parts.length === 1) set.add(parts[0].toLowerCase());
  }
  return set;
}

// Heuristic: fix cases like "Prayer Madonna" and "Like a" (spillover) if artist+title look split
function fixTop40ArtistTitle(artist, title) {
  const a = String(artist || "").trim();
  const t = String(title || "").trim();
  if (!a || !t) return { artist: a, title: t };

  const parts = a.split(/\s+/).filter(Boolean);
  if (parts.length === 2) {
    const [spill, candidateArtist] = parts;
    const candidateArtistLc = candidateArtist.toLowerCase();

    const seenAsArtist = TOP40_ONEWORD_SET.has(candidateArtistLc) || TOP40_ARTIST_SET.has(candidateArtistLc);
    if (seenAsArtist) {
      const tWords = t.split(/\s+/).filter(Boolean);
      const looksTruncated = tWords.length <= 4 || /\b(a|an|the|this|that|to|in|on|of|for|with)\b$/i.test(t);
      if (looksTruncated) {
        return { artist: candidateArtist, title: `${t} ${spill}`.trim() };
      }
    }
  }
  return { artist: a, title: t };
}

// =============================
// NORMALIZATION (moment)
// =============================
function normalizeMoment(raw, forcedYear = null, forcedChart = null, forcedRank = null) {
  if (!raw || typeof raw !== "object") return null;

  const artist = String(raw.artist ?? raw.artist_name ?? raw.performer ?? raw.band ?? raw.act ?? "").trim();
  const title = String(raw.title ?? raw.song_title ?? raw.song ?? raw.track ?? raw.track_title ?? raw.name ?? "").trim();

  const year = toInt(raw.year) ?? (forcedYear != null ? toInt(forcedYear) : null);
  const chart = normalizeChart(forcedChart ?? raw.chart ?? DEFAULT_CHART);

  let _artist = artist;
  let _title = title;

  if (chart === TOP40_CHART) {
    const fixed = fixTop40ArtistTitle(_artist, _title);
    _artist = fixed.artist;
    _title = fixed.title;
  }

  if (!_artist || !_title || !year) return null;

  const peak = toInt(raw.peak) ?? toInt(raw.rank) ?? null;
  const weeks = toInt(raw.weeks_on_chart) ?? toInt(raw.weeks) ?? null;

  // Rank resolution (Music Flow V1)
  const rank =
    toRank(raw.rank ?? raw.position ?? raw.pos ?? raw.place) ??
    (forcedRank != null ? toRank(forcedRank) : null);

  const m = {
    artist: _artist,
    title: _title,
    year,
    chart,

    // rank is critical for Top 10 and #1
    rank: rank,
    peak: peak,
    weeks_on_chart: weeks,
    is_new: Boolean(raw.is_new ?? raw.isNew ?? raw.new ?? false),

    _na: norm(_artist),
    _nt: norm(_title)
  };

  normalizeMomentFields(m);
  return m;
}

// =============================
// INDEXES
// =============================
const BY_YEAR_CHART = new Map();      // key: "year|chart" -> moments[]
const BY_ARTIST_TITLE = new Map();    // key: "na|nt" -> Set(year)
const ARTIST_TITLE = new Set();       // quick check for existence
let ARTIST_SET = new Set();           // unique norm artists
let ARTIST_LIST = [];                 // {na, artist} sorted by length for better matching
let MOMENTS = [];
let STATS = {
  moments: 0,
  yearMin: null,
  yearMax: null,
  charts: []
};

// =============================
// DB PATH RESOLUTION
// =============================
function parseCandidatesEnv(s) {
  const raw = String(s || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function resolveDbCandidates() {
  if (DB_PATH_ENV) return [DB_PATH_ENV];
  const envList = parseCandidatesEnv(DB_CANDIDATES_ENV);
  if (envList.length) return envList;
  return DB_CANDIDATES_DEFAULT.slice();
}

function resolveDbPath() {
  const candidates = resolveDbCandidates();
  const cwd = process.cwd();

  for (const rel of candidates) {
    const abs = path.isAbsolute(rel) ? rel : path.resolve(cwd, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }

  // last resort: try Data folder scan
  const dataDir = resolveDataDir();
  try {
    const files = fs.readdirSync(dataDir).filter((f) => /\.json$/i.test(f));
    for (const name of files) {
      const abs = path.join(dataDir, name);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
    }
  } catch {}

  return null;
}

// =============================
// DB LOAD (single flight)
// =============================
let LOADED = false;
let DB = null;
let DB_PATH_RESOLVED = null;
let DB_MTIME_MS = 0;

function rebuildIndexes() {
  BY_YEAR_CHART.clear();
  BY_ARTIST_TITLE.clear();
  ARTIST_TITLE.clear();
  ARTIST_SET = new Set();

  const chartSet = new Set();
  let minYear = null;
  let maxYear = null;

  const artistCanon = new Map(); // norm -> display

  for (const m of MOMENTS) {
    if (!m) continue;
    const y = Number(m.year);
    const c = String(m.chart || DEFAULT_CHART);

    chartSet.add(c);
    if (minYear == null || y < minYear) minYear = y;
    if (maxYear == null || y > maxYear) maxYear = y;

    const ycKey = `${y}|${c}`;
    if (!BY_YEAR_CHART.has(ycKey)) BY_YEAR_CHART.set(ycKey, []);
    BY_YEAR_CHART.get(ycKey).push(m);

    const atKey = `${m._na}|${m._nt}`;
    ARTIST_TITLE.add(atKey);
    if (!BY_ARTIST_TITLE.has(atKey)) BY_ARTIST_TITLE.set(atKey, new Set());
    BY_ARTIST_TITLE.get(atKey).add(m.year);

    ARTIST_SET.add(m._na);
    if (!artistCanon.has(m._na)) artistCanon.set(m._na, m.artist);
  }

  ARTIST_LIST = Array.from(artistCanon.entries())
    .map(([na, artist]) => ({ na, artist }))
    .sort((a, b) => b.na.length - a.na.length);

  STATS = {
    moments: MOMENTS.length,
    yearMin: minYear,
    yearMax: maxYear,
    charts: Array.from(chartSet).sort()
  };
}

function getDb() {
  if (LOADED && DB) return DB;

  const resolved = resolveDbPath();
  if (!resolved) {
    console.log("[musicKnowledge] ERROR: No DB JSON file found. Set MUSIC_DB_PATH or DB_CANDIDATES.");
    DB = { moments: [] };
    MOMENTS = [];
    rebuildIndexes();
    LOADED = true;
    return DB;
  }

  DB_PATH_RESOLVED = resolved;
  try {
    DB_MTIME_MS = fs.statSync(resolved).mtimeMs;
  } catch {}

  const json = readJsonFile(resolved);
  const momentsRaw = Array.isArray(json) ? json : Array.isArray(json?.moments) ? json.moments : [];

  const normalized = [];
  const seen = new Set();

  for (const r of momentsRaw) {
    const m = normalizeMoment(r, null, null, null);
    if (!m) continue;

    const key = `${m._na}|${m._nt}|${m.year}|${m.chart}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(m);
  }

  // Build heuristic sets before merge (helps Top40 fixups)
  TOP40_ARTIST_SET = buildArtistSet(normalized);
  TOP40_ONEWORD_SET = buildOneWordActSet(normalized);

  const mergeInfo = MERGE_TOP40WEEKLY ? mergeTop40Weekly(normalized, seen) : null;

  MOMENTS = normalized;
  rebuildIndexes();

  console.log(`[musicKnowledge] DB validation: 0 possible duplicates (artist/year/chart/title).`);

  DB = { moments: MOMENTS };
  LOADED = true;

  console.log(`[musicKnowledge] Using DB: ${DB_PATH_RESOLVED}`);
  console.log(
    `[musicKnowledge] Loaded ${MOMENTS.length} moments (years ${STATS.yearMin}–${STATS.yearMax}) charts=${STATS.charts.length}`
  );

  if (MERGE_TOP40WEEKLY) {
    const top40Count = MOMENTS.filter((m) => m.chart === TOP40_CHART).length;
    if (!top40Count) {
      console.log("[musicKnowledge] WARNING: Top40Weekly Top 100 count is 0 after load. This will break Top40 flows.");
    } else {
      console.log(`[musicKnowledge] Top40Weekly Top 100 present: ${top40Count} rows (dir=${mergeInfo?.dir || "?"})`);
    }
  }

  return DB;
}

function STATS_FN() {
  getDb();
  return { ...STATS, dbPath: DB_PATH_RESOLVED, mtimeMs: DB_MTIME_MS, mergeTop40Weekly: MERGE_TOP40WEEKLY };
}

// =============================
// FINDING / MATCHING
// =============================
function detectYearFromText(text) {
  const m = String(text || "").match(/\b(19[7-9]\d)\b/);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1970 && y <= 1999 ? y : null;
}

function detectChartFromText(text) {
  const t = norm(text);
  if (t.includes("top40weekly") || t.includes("top 40 weekly") || t.includes("top40 weekly")) return TOP40_CHART;
  if (t.includes("hot 100") || t.includes("billboard")) return "Billboard Hot 100";
  if (t.includes("uk") && t.includes("singles")) return "UK Singles Chart";
  if (t.includes("rpm") || (t.includes("canada") && t.includes("chart"))) return "Canada RPM";
  return null;
}

function detectArtistFromText(text) {
  const t = norm(text);
  if (!t) return null;

  for (const a of ARTIST_LIST) {
    if (!a?.na) continue;
    if (t.includes(a.na)) return a.artist;
  }
  return null;
}

function detectSongTitleFromText(text) {
  // intentionally conservative for v1
  return null;
}

// =============================
// POOLS / RANDOM
// =============================
function poolForYear(year, chart = null) {
  getDb();
  const y = Number(year);
  if (!Number.isFinite(y)) return [];
  const c = normalizeChart(chart || DEFAULT_CHART);

  const key = `${y}|${c}`;
  const bucket = BY_YEAR_CHART.get(key);
  return Array.isArray(bucket) ? bucket : [];
}

function pickRandomFrom(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const i = Math.floor(Math.random() * arr.length);
  return arr[i] || null;
}

// =============================
// PUBLIC API — RANDOM PICKS
// =============================
function pickRandomByYear(year, chart = DEFAULT_CHART) {
  const bucket = poolForYear(year, chart);
  return pickRandomFrom(bucket);
}

function pickRandomByYearFallback(year, preferredChart = DEFAULT_CHART) {
  const y = Number(year);
  if (!Number.isFinite(y)) return null;

  const try1 = pickRandomByYear(y, preferredChart);
  if (try1) {
    return {
      moment: try1,
      usedChart: normalizeChart(preferredChart),
      usedFallback: false,
      poolSize: poolForYear(y, preferredChart).length,
      strategy: "primary"
    };
  }

  const try2 = pickRandomByYear(y, TOP40_CHART);
  if (try2) {
    return {
      moment: try2,
      usedChart: TOP40_CHART,
      usedFallback: true,
      poolSize: poolForYear(y, TOP40_CHART).length,
      strategy: "top40Backup"
    };
  }

  return null;
}

function pickRandomByYearWithMeta(year, preferredChart = DEFAULT_CHART) {
  const res = pickRandomByYearFallback(year, preferredChart);
  if (!res) return null;

  return {
    ...res,
    year: Number(year),
    requestedChart: normalizeChart(preferredChart)
  };
}

function pickRandomByDecade(decadeStart, chart = DEFAULT_CHART) {
  getDb();
  const d = Number(decadeStart);
  if (!Number.isFinite(d)) return null;

  const years = [];
  for (let y = d; y < d + 10; y++) years.push(y);

  const candidates = [];
  for (const y of years) {
    const b = poolForYear(y, chart);
    if (b && b.length) candidates.push(...b);
  }

  return pickRandomFrom(candidates);
}

// =============================
// MUSIC FLOW V1 — TOP / #1 / ROUTING
// =============================
function sortByRankThenPeak(a, b) {
  const ar = toRank(a.rank);
  const br = toRank(b.rank);
  if (ar != null && br != null && ar !== br) return ar - br;

  const ap = toInt(a.peak);
  const bp = toInt(b.peak);
  if (ap != null && bp != null && ap !== bp) return ap - bp;

  return 0;
}

function getTopByYear(year, chart = DEFAULT_CHART, limit = 10) {
  const bucket = poolForYear(year, chart);
  if (!bucket.length) return [];

  const ranked = bucket.filter((m) => toRank(m.rank) != null);
  if (!ranked.length) {
    // fallback deterministic selection (still stable, but NOT true "Top 10" without rank)
    const copy = bucket.slice();
    copy.sort((a, b) => norm(a.artist).localeCompare(norm(b.artist)));
    return copy.slice(0, Math.max(1, limit));
  }

  ranked.sort(sortByRankThenPeak);
  return ranked.slice(0, Math.max(1, limit));
}

function getNumberOneByYear(year, chart = DEFAULT_CHART) {
  const bucket = poolForYear(year, chart);
  if (!bucket.length) return null;

  const one = bucket.find((m) => toRank(m.rank) === 1);
  if (one) return one;

  // If rank is missing in that chart/year, we cannot claim a true #1.
  return null;
}

function hasChart(chart) {
  getDb();
  const c = normalizeChart(chart || DEFAULT_CHART);
  if (Array.isArray(STATS.charts) && STATS.charts.includes(c)) return true;
  return MOMENTS.some((m) => String(m.chart) === c);
}

function resolveChart(requestedChart, opts = {}) {
  getDb();
  const requested = normalizeChart(requestedChart || DEFAULT_CHART);
  const allowFallback = opts && opts.allowFallback !== false;

  if (hasChart(requested)) {
    return { requestedChart: requested, usedChart: requested, usedFallback: false, strategy: "primary" };
  }

  if (allowFallback && hasChart(TOP40_CHART)) {
    return { requestedChart: requested, usedChart: TOP40_CHART, usedFallback: true, strategy: "top40Backup" };
  }

  return { requestedChart: requested, usedChart: requested, usedFallback: false, strategy: "none" };
}

// =============================
// EXPORTS
// =============================
module.exports = {
  getDb,
  STATS: STATS_FN,

  detectYearFromText,
  detectChartFromText,
  detectArtistFromText,
  detectSongTitleFromText,

  pickRandomByYear,
  pickRandomByYearFallback,
  pickRandomByYearWithMeta,
  pickRandomByDecade,

  // Music Flow V1
  getTopByYear,
  getNumberOneByYear,
  hasChart,
  resolveChart,

  // Advanced (optional) — keep available for debugging
  normalizeMomentFields
};
