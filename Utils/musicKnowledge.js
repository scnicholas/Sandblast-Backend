"use strict";

/**
 * musicKnowledge.js — Bulletproof V2.26 (Music Flow V1 Ready)
 *
 * V2.26 micro-patches (data correctness + fluidity):
 * - Adds robust Top40Weekly "artist/title tail drift" repair:
 *   Fixes cases like:
 *     artist="Turner", title="What’s Love Got to Do with It Tina"
 *     artist="Halen",  title="Jump Van"
 *     artist="Jr.",    title="Ghostbusters Ray Parker,"
 *     artist="Club",   title="Karma Chameleon Culture"
 *   => artist="Tina Turner", "Van Halen", "Ray Parker, Jr.", "Culture Club"
 *      and title trimmed back to real song title.
 *
 * Keeps:
 * - V2.25 schema-proof year detection for Top40Weekly merge
 * - Deterministic drift repair normalizeMomentFields()
 * - Rank-aware Top 10 (rank 1–10)
 * - #1 only (rank === 1)
 * - Chart routing resolveChart()
 */

const fs = require("fs");
const path = require("path");

// =============================
// CONFIG
// =============================
const DEFAULT_CHART = "Billboard Hot 100";
const TOP40_CHART = "Top40Weekly Top 100";

const MERGE_TOP40WEEKLY = String(process.env.MERGE_TOP40WEEKLY ?? "true").toLowerCase() === "true";

const DB_CANDIDATES_DEFAULT = [
  "Data/music_moments_v2_layer2_plus500.json",
  "Data/music_moments_v2_layer2_filled.json",
  "Data/music_moments_v2_layer2.json",
  "Data/music_moments.json"
];

const DB_CANDIDATES_ENV = process.env.DB_CANDIDATES;
const DB_PATH_ENV = process.env.MUSIC_DB_PATH;
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
  return c;
}

function _asText(x) { return (x == null ? "" : String(x)).trim(); }
function _tokens(s) { return _asText(s).split(/\s+/).filter(Boolean); }

// “Name-like” tokens: Tina, Kenny, Van, Lionel, Culture, Ray, Parker, McCartney, etc.
function _isNamey(tok) {
  if (!tok) return false;
  const t = String(tok).trim().replace(/[^\w'.-]/g, "");
  if (!t) return false;
  if (/^\d+$/.test(t)) return false;
  return /^[A-Z]/.test(t) || /^Mc[A-Z]/.test(t) || /^O'?[A-Z]/.test(t);
}

function _cleanJoinTokens(arr) {
  return arr
    .join(" ")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function _cleanTitleTokens(arr) {
  return arr
    .join(" ")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

// =============================
// DRIFT REPAIR (deterministic + heuristics)
// =============================
const KNOWN_ARTISTS_SECOND_TOKEN = new Set([
  "Madonna",
  "Aerosmith",
  "Whitesnake",
]);

const _TITLE_TAIL_JOINERS = new Set(["and", "&", "feat.", "ft.", "with"]);
const _ARTIST_SUFFIXES = new Set(["jr.", "sr.", "ii", "iii", "iv"]);

function repairArtistTitleTailDrift(m) {
  // Only apply to Top40Weekly rows (where we observed the issue)
  if (!m || m.chart !== TOP40_CHART) return m;

  let artist = _asText(m.artist);
  let title  = _asText(m.title);

  const aParts = _tokens(artist);
  const tParts = _tokens(title);

  // Primary pattern: artist is 1 token and title has enough tokens to steal from tail
  if (aParts.length !== 1 || tParts.length < 3) return m;

  // Try moving 1..6 tokens from title tail -> artist head
  // Choose smallest move that looks like "names/joiners/suffix"
  for (let k = 1; k <= 6 && k < tParts.length - 1; k++) {
    const tail = tParts.slice(-k);
    const head = tParts.slice(0, -k);

    if (head.length < 2) continue;

    // tail must be mostly name-ish (allow joiners and suffixes)
    let ok = true;
    for (const tok of tail) {
      const lower = String(tok).toLowerCase().replace(/[^\w'.-]/g, "");
      if (_TITLE_TAIL_JOINERS.has(lower) || _ARTIST_SUFFIXES.has(lower)) continue;
      if (!_isNamey(tok)) { ok = false; break; }
    }
    if (!ok) continue;

    // Special case: artist is "Jr." (needs at least 2 tokens of tail, e.g., "Ray Parker,")
    if (/^(jr\.?|sr\.?)$/i.test(artist) && k < 2) continue;

    const newArtist = _cleanJoinTokens([...tail, artist]);
    const newTitle  = _cleanTitleTokens(head);

    // Sanity: avoid making artist absurdly long
    if (_tokens(newArtist).length > 8) continue;

    m.artist = newArtist;
    m.title  = newTitle;
    return m;
  }

  return m;
}

function normalizeMomentFields(m) {
  if (!m || typeof m !== "object") return m;

  let artist = _asText(m.artist);
  let title  = _asText(m.title);
  const year = Number(m.year);

  // 1) Hard deterministic fixes
  if (year === 1989 && /^Prayer Madonna$/i.test(artist) && /^Like a$/i.test(title)) {
    artist = "Madonna";
    title  = "Like a Prayer";
  }
  if (year === 1989 && /^Elevator Aerosmith$/i.test(artist) && /^Love in an$/i.test(title)) {
    artist = "Aerosmith";
    title  = "Love in an Elevator";
  }
  if (year === 1989 && /^Healey Band$/i.test(artist) && /^Angel Eyes The Jeff$/i.test(title)) {
    artist = "The Jeff Healey Band";
    title  = "Angel Eyes";
  }
  if (year === 1988 && /^Love Whitesnake$/i.test(artist) && /^Is This$/i.test(title)) {
    artist = "Whitesnake";
    title  = "Is This Love";
  }

  // 2) Generic “two-token artist drift” repair:
  // Example: "Prayer Madonna" + "Like a" -> "Madonna" + "Like a Prayer"
  // Safe rule: ONLY if artist is exactly 2 tokens and token2 is a known artist.
  const parts = artist.split(/\s+/).filter(Boolean);
  if (parts.length === 2 && KNOWN_ARTISTS_SECOND_TOKEN.has(parts[1])) {
    const spill = parts[0];
    const candidateArtist = parts[1];

    const titleWords = title.split(/\s+/).filter(Boolean);
    const titleLooksTruncated =
      titleWords.length <= 4 ||
      /\b(a|an|the|this|that|to|in|on|of|for|with)\b$/i.test(title);

    if (titleLooksTruncated) {
      artist = candidateArtist;
      title = `${title} ${spill}`.trim();
    }
  }

  // Write back before tail-drift repair
  m.artist = artist;
  m.title  = title;

  // 3) NEW: Title tail drift repair (Top40Weekly)
  repairArtistTitleTailDrift(m);

  // Final trim
  m.artist = _asText(m.artist);
  m.title  = _asText(m.title);

  return m;
}

// =============================
// TOP40WEEKLY MERGE
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

  return null;
}

function listTop40Files(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    const name = String(e.name);
    if (!/\.json$/i.test(name)) continue;
    if (!/top100_/i.test(name) && !/top100-/i.test(name)) continue;
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

function yearFromFilename(file) {
  const base = path.basename(String(file || ""));

  let m = base.match(/top100[_-](19\d{2}|20\d{2})/i);
  if (m) return toInt(m[1]);

  m = base.match(/\b(19\d{2}|20\d{2})\b/);
  if (m) return toInt(m[1]);

  m = base.match(/top100[_-](\d{2})\b/i);
  if (m) {
    const yy = toInt(m[1]);
    if (yy != null && yy >= 80 && yy <= 99) return 1900 + yy;
  }

  return null;
}

function yearFromObject(data) {
  if (!data || typeof data !== "object") return null;

  const direct =
    toInt(data.year) ?? toInt(data.Year) ?? toInt(data.Y) ?? toInt(data.chartYear) ?? toInt(data.chart_year);
  if (direct) return direct;

  const nested =
    toInt(data.meta?.year) ??
    toInt(data.metadata?.year) ??
    toInt(data.header?.year) ??
    toInt(data.info?.year) ??
    toInt(data.context?.year) ??
    toInt(data.payload?.year);
  if (nested) return nested;

  const dateLike = String(data.date ?? data.week ?? data.weekOf ?? data.chartDate ?? data.chart_date ?? "");
  const m = dateLike.match(/\b(19\d{2}|20\d{2})\b/);
  if (m) return toInt(m[1]);

  return null;
}

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

function normalizeMoment(raw, forcedYear = null, forcedChart = null, forcedRank = null) {
  if (!raw || typeof raw !== "object") return null;

  const artist = String(raw.artist ?? raw.artist_name ?? raw.performer ?? raw.band ?? raw.act ?? "").trim();
  const title  = String(raw.title ?? raw.song_title ?? raw.song ?? raw.track ?? raw.track_title ?? raw.name ?? "").trim();

  const year  = toInt(raw.year) ?? (forcedYear != null ? toInt(forcedYear) : null);
  const chart = normalizeChart(forcedChart ?? raw.chart ?? DEFAULT_CHART);

  let _artist = artist;
  let _title  = title;

  if (chart === TOP40_CHART) {
    const fixed = fixTop40ArtistTitle(_artist, _title);
    _artist = fixed.artist;
    _title  = fixed.title;
  }

  if (!_artist || !_title || !year) return null;

  const rank =
    toRank(raw.rank ?? raw.position ?? raw.pos ?? raw.place) ??
    (forcedRank != null ? toRank(forcedRank) : null);

  const m = {
    artist: _artist,
    title: _title,
    year,
    chart,
    rank,
    peak: toInt(raw.peak) ?? null,
    weeks_on_chart: toInt(raw.weeks_on_chart) ?? toInt(raw.weeks) ?? null,
    _na: norm(_artist),
    _nt: norm(_title),
  };

  normalizeMomentFields(m);

  // Refresh normalized keys after any repairs
  m._na = norm(m.artist);
  m._nt = norm(m.title);

  return m;
}

function mergeTop40Weekly(existingMoments, seenKeys) {
  const dir = resolveTop40WeeklyDir();
  if (!dir) {
    console.log("[musicKnowledge] Top40Weekly merge: dir not found, skipping merge.");
    return { dir: null, files: 0, added: 0, skippedFiles: 0, emptyFiles: 0, rowsSkipped: 0, yearMin: null, yearMax: null };
  }

  const files = listTop40Files(dir);

  let added = 0;
  let skippedFiles = 0;
  let emptyFiles = 0;
  let rowsSkipped = 0;

  let yearMin = null;
  let yearMax = null;

  for (const f of files) {
    let raw;
    try {
      raw = fs.readFileSync(f, "utf8");
    } catch (err) {
      console.log(`[musicKnowledge] WARN: cannot read ${f}: ${err?.message || err}`);
      skippedFiles++;
      continue;
    }

    const data = safeJsonParseTop40(raw, f);
    if (!data) {
      skippedFiles++;
      continue;
    }

    const year =
      yearFromObject(data) ??
      yearFromFilename(f);

    if (!year) {
      const base = path.basename(f);
      const keys = (data && typeof data === "object" && !Array.isArray(data))
        ? Object.keys(data).slice(0, 20)
        : ["<array>"];
      console.log(`[musicKnowledge] WARN: Top40 file has no year: ${base} keys=${keys.join(",")}`);
      skippedFiles++;
      continue;
    }

    if (yearMin == null || year < yearMin) yearMin = year;
    if (yearMax == null || year > yearMax) yearMax = year;

    const rows =
      Array.isArray(data.rows) ? data.rows :
      Array.isArray(data) ? data :
      Array.isArray(data.data) ? data.data :
      [];

    if (!rows.length) {
      emptyFiles++;
      continue;
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const forcedRank = toRank(r.rank ?? r.position ?? r.pos ?? r.place) ?? (i + 1);

      const m = normalizeMoment(r, year, TOP40_CHART, forcedRank);
      if (!m) { rowsSkipped++; continue; }

      const key = `${m._na}|${m._nt}|${m.year}|${m.chart}`;
      if (seenKeys.has(key)) continue;

      seenKeys.add(key);
      existingMoments.push(m);
      added++;
    }
  }

  console.log(
    `[musicKnowledge] Top40Weekly Top 100 merge: dir=${dir} files=${files.length} added=${added} (skippedFiles=${skippedFiles}, emptyFiles=${emptyFiles}, rowsSkipped=${rowsSkipped}) years=${yearMin ?? "?"}–${yearMax ?? "?"}`
  );

  return { dir, files: files.length, added, skippedFiles, emptyFiles, rowsSkipped, yearMin, yearMax };
}

// =============================
// INDEXES
// =============================
const BY_YEAR_CHART = new Map();
let MOMENTS = [];
let STATS = { moments: 0, yearMin: null, yearMax: null, charts: [] };

// =============================
// DB PATH RESOLUTION
// =============================
function parseCandidatesEnv(s) {
  const raw = String(s || "").trim();
  if (!raw) return [];
  return raw.split(",").map(x => x.trim()).filter(Boolean);
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
  return null;
}

// =============================
// DB LOAD
// =============================
let LOADED = false;
let DB = null;
let DB_PATH_RESOLVED = null;

function rebuildIndexes() {
  BY_YEAR_CHART.clear();
  const chartSet = new Set();
  let minYear = null;
  let maxYear = null;

  for (const m of MOMENTS) {
    const y = Number(m.year);
    const c = String(m.chart || DEFAULT_CHART);
    chartSet.add(c);

    if (minYear == null || y < minYear) minYear = y;
    if (maxYear == null || y > maxYear) maxYear = y;

    const key = `${y}|${c}`;
    if (!BY_YEAR_CHART.has(key)) BY_YEAR_CHART.set(key, []);
    BY_YEAR_CHART.get(key).push(m);
  }

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

  // Build heuristic sets before merge
  TOP40_ARTIST_SET = buildArtistSet(normalized);
  TOP40_ONEWORD_SET = buildOneWordActSet(normalized);

  const mergeInfo = MERGE_TOP40WEEKLY ? mergeTop40Weekly(normalized, seen) : null;

  // Rebuild sets after merge (now includes merged acts/tokens)
  TOP40_ARTIST_SET = buildArtistSet(normalized);
  TOP40_ONEWORD_SET = buildOneWordActSet(normalized);

  MOMENTS = normalized;
  rebuildIndexes();

  console.log(`[musicKnowledge] DB validation: 0 possible duplicates (artist/year/chart/title).`);
  console.log(`[musicKnowledge] Using DB: ${DB_PATH_RESOLVED}`);
  console.log(`[musicKnowledge] Loaded ${MOMENTS.length} moments (years ${STATS.yearMin}–${STATS.yearMax}) charts=${STATS.charts.length}`);

  if (MERGE_TOP40WEEKLY) {
    const top40Count = MOMENTS.filter(m => m.chart === TOP40_CHART).length;
    console.log(`[musicKnowledge] Top40Weekly Top 100 present: ${top40Count} rows (dir=${mergeInfo?.dir || "?"})`);
  }

  DB = { moments: MOMENTS };
  LOADED = true;
  return DB;
}

function STATS_FN() {
  getDb();
  return { ...STATS, dbPath: DB_PATH_RESOLVED, mergeTop40Weekly: MERGE_TOP40WEEKLY };
}

// =============================
// POOLS
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
  const m = pickRandomFrom(bucket);
  if (m) normalizeMomentFields(m);
  return m;
}

function pickRandomByYearWithMeta(year, preferredChart = DEFAULT_CHART) {
  const y = Number(year);
  const requestedChart = normalizeChart(preferredChart);

  const primary = pickRandomByYear(y, requestedChart);
  if (primary) {
    return { moment: primary, usedChart: requestedChart, usedFallback: false, poolSize: poolForYear(y, requestedChart).length, strategy: "primary", year: y, requestedChart };
  }

  const fallback = pickRandomByYear(y, TOP40_CHART);
  if (fallback) {
    return { moment: fallback, usedChart: TOP40_CHART, usedFallback: true, poolSize: poolForYear(y, TOP40_CHART).length, strategy: "top40Backup", year: y, requestedChart };
  }

  return null;
}

// =============================
// MUSIC FLOW V1 — TOP / #1 / ROUTING
// =============================
function sortByRank(a, b) {
  const ar = toRank(a.rank);
  const br = toRank(b.rank);
  if (ar != null && br != null) return ar - br;
  if (ar != null) return -1;
  if (br != null) return 1;
  return 0;
}

function getTopByYear(year, chart = DEFAULT_CHART, limit = 10) {
  const bucket = poolForYear(year, chart);
  if (!bucket.length) return [];
  const ranked = bucket.filter(m => toRank(m.rank) != null).slice();
  if (!ranked.length) return [];
  ranked.sort(sortByRank);
  const out = ranked.slice(0, Math.max(1, limit));
  // Ensure repaired fields on output
  for (const m of out) normalizeMomentFields(m);
  return out;
}

function getNumberOneByYear(year, chart = DEFAULT_CHART) {
  const bucket = poolForYear(year, chart);
  if (!bucket.length) return null;
  const m = bucket.find(m => toRank(m.rank) === 1) || null;
  if (m) normalizeMomentFields(m);
  return m;
}

function hasChart(chart) {
  getDb();
  const c = normalizeChart(chart || DEFAULT_CHART);
  if (Array.isArray(STATS.charts) && STATS.charts.includes(c)) return true;
  return MOMENTS.some(m => String(m.chart) === c);
}

function resolveChart(requestedChart, opts = {}) {
  getDb();
  const requested = normalizeChart(requestedChart || DEFAULT_CHART);
  const allowFallback = opts.allowFallback !== false;

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

  pickRandomByYear,
  pickRandomByYearWithMeta,

  // Music Flow V1
  getTopByYear,
  getNumberOneByYear,
  hasChart,
  resolveChart,

  // Debug / repair
  normalizeMomentFields
};
