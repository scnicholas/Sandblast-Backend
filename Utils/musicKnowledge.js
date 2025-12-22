"use strict";

/**
 * musicKnowledge.js — Bulletproof V2.10 (Export-Fixed)
 *
 * Guarantees:
 * - Exports: getDb(), loadDb() (plus aliases)
 * - Deterministic DB selection for Render/Windows
 * - Optional Top40Weekly Top 100 merge from Data/top40weekly/top100_YYYY.json
 * - Skips empty/placeholder JSON files ("[]")
 * - De-dupes moments and keeps DB.moments consistent with indexed moments
 * - Provides helpers for follow-up intelligence:
 *    - getTopByYear(year, n)
 *    - pickRandomByYearFallback(year, chart)
 *    - findYearsForArtistTitle(artist, title, chart?)
 */

const fs = require("fs");
const path = require("path");

// =============================
// CONFIG
// =============================
const ENV_DB_PATH = process.env.MUSIC_DB_PATH;
const ENV_DB_CANDIDATES = process.env.MUSIC_DB_CANDIDATES;
const MERGE_TOP40WEEKLY = String(process.env.MERGE_TOP40WEEKLY || "1") !== "0";
const HOT_RELOAD = String(process.env.MUSIC_DB_HOT_RELOAD || "") === "1";

const DEFAULT_DB_CANDIDATES = [
  "Data/music_moments_v2_layer2_plus500.json",
  "Data/music_moments_v2_layer2_plus1000.json",
  "Data/music_moments_v2_layer2_plus2000.json",
  "Data/music_moments_v2_layer2_enriched.json",
  "Data/music_moments_v2_layer2_filled.json",
  "Data/music_moments_v2_layer2.json",
  "Data/music_moments_v2.json",
  "Data/music_moments.json",
  "Data/music_moments_layer1.json"
];

const PREFERRED_DEFAULT_DB = "Data/music_moments_v2_layer2_plus500.json";

const DEFAULT_CHART = "Billboard Hot 100";

const CHART_ALIASES = new Map([
  ["billboard", "Billboard Hot 100"],
  ["hot 100", "Billboard Hot 100"],
  ["billboard hot 100", "Billboard Hot 100"],

  ["uk", "UK Singles Chart"],
  ["uk singles", "UK Singles Chart"],
  ["uk singles chart", "UK Singles Chart"],

  ["canada", "Canada RPM"],
  ["rpm", "Canada RPM"],
  ["canada rpm", "Canada RPM"],

  ["top40weekly", "Top40Weekly"],
  ["top 40 weekly", "Top40Weekly"],
  ["top 40", "Top40Weekly"],

  // Year-end Top 100 aliases
  ["top40weekly top 100", "Top40Weekly Top 100"],
  ["top40weekly top100", "Top40Weekly Top 100"],
  ["top40weekly year end", "Top40Weekly Top 100"],
  ["top40weekly year-end", "Top40Weekly Top 100"],
  ["top 100", "Top40Weekly Top 100"],
  ["top100", "Top40Weekly Top 100"],
  ["year end top 100", "Top40Weekly Top 100"],
  ["year-end top 100", "Top40Weekly Top 100"]
]);

// =============================
// INTERNAL STATE
// =============================
let DB = null; // { moments: [...] }
let DB_PATH_RESOLVED = null;
let DB_MTIME_MS = 0;
let LOADED = false;

// Indexed moments (de-duped + normalized)
let MOMENT_INDEX = [];

// Lookup maps
let ARTIST_EXACT = new Map(); // normalized artist -> canonical artist
let TITLE_EXACT = new Map();  // normalized title  -> canonical title
let ARTIST_TOKEN_MAP = new Map(); // token -> Set(normalized artist)
let TITLE_TOKEN_MAP = new Map();  // token -> Set(normalized title)
let ARTIST_ALIASES = new Map();
let TITLE_ALIASES = new Map();

// =============================
// UTILITIES
// =============================
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function stripBom(s) {
  if (!s) return s;
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function warn(msg) {
  console.warn("[musicKnowledge]", msg);
}

function failHard(msg) {
  console.error("[musicKnowledge]", msg);
  throw new Error(msg);
}

function fileExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function fileSize(p) {
  try {
    if (!fileExists(p)) return 0;
    const st = fs.statSync(p);
    return st && Number.isFinite(st.size) ? st.size : 0;
  } catch {
    return 0;
  }
}

function resolveAbs(relOrAbs) {
  if (!relOrAbs) return "";
  const s = String(relOrAbs).trim();
  if (!s) return "";
  return path.isAbsolute(s) ? s : path.join(process.cwd(), s);
}

function toInt(x) {
  const n = Number(String(x ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function tokenize(s) {
  const t = norm(s);
  if (!t) return [];
  return t.split(" ").filter(Boolean);
}

function addToken(map, token, value) {
  if (!token) return;
  let set = map.get(token);
  if (!set) {
    set = new Set();
    map.set(token, set);
  }
  set.add(value);
}

function normalizeChart(chart) {
  const c = String(chart || "").trim();
  if (!c) return DEFAULT_CHART;

  const n = norm(c);
  if (CHART_ALIASES.has(n)) return CHART_ALIASES.get(n);

  // let canonical pass through
  if (
    c === "Billboard Hot 100" ||
    c === "UK Singles Chart" ||
    c === "Canada RPM" ||
    c === "Top40Weekly" ||
    c === "Top40Weekly Top 100"
  ) return c;

  return c;
}

function isTruthy(x) {
  const n = norm(x);
  return n === "true" || n === "1" || n === "yes" || n === "y";
}

function copyWithFlags(m, flags) {
  if (!m) return null;
  return Object.assign({}, m, flags || {});
}

// =============================
// DB RESOLUTION
// =============================
function getCandidateList() {
  if (!ENV_DB_CANDIDATES) return DEFAULT_DB_CANDIDATES;
  return String(ENV_DB_CANDIDATES)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveDbByCandidates(candidates) {
  // Try from CWD
  for (const rel of candidates) {
    const abs = path.join(process.cwd(), rel);
    if (fileExists(abs) && fileSize(abs) > 2) return abs;
  }
  // Try relative to repo root
  for (const rel of candidates) {
    const abs = path.resolve(__dirname, "..", rel);
    if (fileExists(abs) && fileSize(abs) > 2) return abs;
  }
  return null;
}

function resolveDbByScan() {
  const dirs = [
    path.join(process.cwd(), "Data"),
    path.resolve(__dirname, "..", "Data")
  ];

  for (const dir of dirs) {
    try {
      if (!fileExists(dir)) continue;
      const st = fs.statSync(dir);
      if (!st.isDirectory()) continue;

      const files = fs
        .readdirSync(dir)
        .filter((f) => /^music_moments.*\.json$/i.test(f))
        .map((f) => {
          const full = path.join(dir, f);
          return { full, size: fileSize(full) };
        })
        .filter((x) => x.size > 2)
        .sort((a, b) => b.size - a.size);

      if (files.length) return files[0].full;
    } catch {}
  }
  return null;
}

function resolveDbPath() {
  // 1) explicit env
  if (ENV_DB_PATH) {
    const abs = resolveAbs(ENV_DB_PATH);
    if (fileExists(abs) && fileSize(abs) > 2) return abs;
    warn(`MUSIC_DB_PATH set but missing/empty: ${abs}`);
  }

  // 2) preferred default
  const preferredAbs = resolveAbs(PREFERRED_DEFAULT_DB);
  if (fileExists(preferredAbs) && fileSize(preferredAbs) > 2) return preferredAbs;

  // 3) candidates
  const candidates = getCandidateList();
  const byCandidates = resolveDbByCandidates(candidates);
  if (byCandidates) return byCandidates;

  // 4) scan
  const byScan = resolveDbByScan();
  if (byScan) return byScan;

  return null;
}

// =============================
// TOP40WEEKLY YEAR-END TOP 100 MERGE
// =============================
function findTop40WeeklyFiles() {
  const candidates = [
    path.join(process.cwd(), "data", "top40weekly"),
    path.join(process.cwd(), "Data", "top40weekly"),
    path.resolve(__dirname, "..", "data", "top40weekly"),
    path.resolve(__dirname, "..", "Data", "top40weekly")
  ];

  for (const dir of candidates) {
    try {
      if (fileExists(dir) && fs.statSync(dir).isDirectory()) {
        const files = fs
          .readdirSync(dir)
          .filter((f) => /^top100_\d{4}\.json$/i.test(f))
          .map((f) => path.join(dir, f));
        if (files.length) return files;
      }
    } catch {}
  }
  return [];
}

function isPlaceholderTop40WeeklyFile(fp) {
  // Tiny file usually means "[]\n"
  const sz = fileSize(fp);
  return sz > 0 && sz <= 4;
}

function loadTop40WeeklyMoments() {
  if (!MERGE_TOP40WEEKLY) return [];

  const files = findTop40WeeklyFiles();
  if (!files.length) {
    warn("Top40Weekly merge enabled but no top100_YYYY.json files found in Data/top40weekly");
    return [];
  }

  const out = [];
  let skipped = 0;
  let emptySkipped = 0;

  for (const fp of files) {
    try {
      if (isPlaceholderTop40WeeklyFile(fp)) {
        emptySkipped++;
        continue;
      }

      const raw = stripBom(fs.readFileSync(fp, "utf8"));
      const json = JSON.parse(raw);

      if (!Array.isArray(json)) continue;
      if (json.length === 0) {
        emptySkipped++;
        continue;
      }

      for (const row of json) {
        const year = toInt(row.year);
        const rank = toInt(row.rank);
        const artist = String(row.artist || "").trim();
        const title = String(row.title || "").trim();

        if (!year || !artist || !title) {
          skipped++;
          continue;
        }

        out.push({
          artist,
          title,
          year,

          // IMPORTANT: year-end Top 100 is distinct chart
          chart: "Top40Weekly Top 100",

          // rank maps to peak for list ordering
          peak: rank || null,
          weeks_on_chart: null,
          is_number_one: rank === 1,
          number_one_weeks: null,
          anchor_week: null,
          top10: null,

          fact: "",
          culture: "",
          next: "",

          source: row.source || "top40weekly",
          url: row.url || ""
        });
      }
    } catch (e) {
      warn(`Failed reading Top40Weekly file: ${fp} :: ${String(e?.message || e)}`);
    }
  }

  console.log(
    `[musicKnowledge] Top40Weekly Top 100 merge: loaded ${out.length} rows from ${files.length} files (skipped=${skipped}, emptySkipped=${emptySkipped})`
  );

  return out;
}

// =============================
// NORMALIZE + INDEX
// =============================
function normalizeMoment(raw) {
  const artist = String(raw.artist || "").trim();
  const title = String(raw.title || "").trim();
  const year = toInt(raw.year);
  const chart = normalizeChart(raw.chart);

  const peak = toInt(raw.peak);
  const weeks_on_chart = toInt(raw.weeks_on_chart);

  const is_number_one =
    typeof raw.is_number_one === "boolean"
      ? raw.is_number_one
      : raw.is_number_one != null
      ? isTruthy(raw.is_number_one)
      : false;

  const number_one_weeks = toInt(raw.number_one_weeks);
  const anchor_week = raw.anchor_week ? String(raw.anchor_week).trim() : null;
  const top10 = Array.isArray(raw.top10) ? raw.top10 : null;

  const fact = String(raw.chart_fact || raw.fact || "").trim();
  const culture = String(raw.cultural_moment || raw.culture || "").trim();
  const next = String(raw.next_step || raw.next || "").trim();

  return {
    artist,
    title,
    year,
    chart,

    peak,
    weeks_on_chart,
    is_number_one: !!is_number_one,
    number_one_weeks,
    anchor_week,
    top10,

    fact,
    culture,
    next,

    _na: norm(artist),
    _nt: norm(title)
  };
}

function buildDefaultAliases() {
  ARTIST_ALIASES.clear();
  TITLE_ALIASES.clear();

  const artistPairs = [
    ["mj", "Michael Jackson"],
    ["cetera", "Peter Cetera"],
    ["peter cetera", "Peter Cetera"]
  ];

  for (const [a, canon] of artistPairs) ARTIST_ALIASES.set(norm(a), canon);
}

function buildTokenMaps() {
  ARTIST_TOKEN_MAP.clear();
  TITLE_TOKEN_MAP.clear();

  for (const m of MOMENT_INDEX) {
    const at = tokenize(m.artist);
    const tt = tokenize(m.title);

    for (const tok of at) addToken(ARTIST_TOKEN_MAP, tok, m._na);
    for (const tok of tt) addToken(TITLE_TOKEN_MAP, tok, m._nt);
  }
}

function validateDb(moments) {
  let missing = 0;
  let dupes = 0;
  const seen = new Set();

  for (const raw of moments) {
    const artist = String(raw.artist || "").trim();
    const year = toInt(raw.year);
    const chart = normalizeChart(raw.chart);
    const title = String(raw.title || "").trim();

    if (!artist || !year) missing++;

    const key = `${norm(artist)}|${year}|${norm(chart)}|${norm(title)}`;
    if (seen.has(key)) dupes++;
    seen.add(key);
  }

  if (missing) warn(`DB validation: ${missing} records missing required (artist/year).`);
  if (dupes) warn(`DB validation: ${dupes} possible duplicates (artist/year/chart/title).`);
}

function buildIndexes(moments) {
  MOMENT_INDEX = [];
  ARTIST_EXACT.clear();
  TITLE_EXACT.clear();

  const seen = new Set();

  for (const raw of moments) {
    const m = normalizeMoment(raw);
    if (!m.artist || !m.year) continue;

    const key = `${m._na}|${m.year}|${norm(m.chart)}|${m._nt}`;
    if (seen.has(key)) continue;
    seen.add(key);

    ARTIST_EXACT.set(m._na, m.artist);
    TITLE_EXACT.set(m._nt, m.title);
    MOMENT_INDEX.push(m);
  }

  buildDefaultAliases();
  buildTokenMaps();

  console.log(
    `[musicKnowledge] Loaded ${MOMENT_INDEX.length} moments from ${DB_PATH_RESOLVED} (+Top40Weekly merge=${MERGE_TOP40WEEKLY})`
  );
}

// =============================
// LOAD DB + ACCESS
// =============================
function loadDb() {
  const resolved = resolveDbPath();
  if (!resolved) failHard("Music DB not found. Set MUSIC_DB_PATH or place a DB in Data/.");

  DB_PATH_RESOLVED = resolved;

  const st = fs.statSync(DB_PATH_RESOLVED);
  DB_MTIME_MS = st.mtimeMs;

  if (st.size <= 2) failHard(`Music DB file is empty/invalid: ${DB_PATH_RESOLVED}`);

  console.log("[musicKnowledge] Using DB:", DB_PATH_RESOLVED);

  const raw = stripBom(fs.readFileSync(DB_PATH_RESOLVED, "utf8"));

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    failHard(`Music DB JSON is invalid at ${DB_PATH_RESOLVED}`);
  }

  let moments = null;
  if (Array.isArray(json)) moments = json;
  else if (json && Array.isArray(json.moments)) moments = json.moments;

  if (!moments) failHard(`Music DB must be { moments: [...] } or a raw array at ${DB_PATH_RESOLVED}`);

  const top40 = loadTop40WeeklyMoments();
  const merged = moments.concat(top40);

  validateDb(merged);

  DB = { moments: merged };
  buildIndexes(merged);

  // Keep DB.moments consistent with de-duped index
  DB.moments = MOMENT_INDEX.slice();

  LOADED = true;
  return DB;
}

function getDb() {
  if (!LOADED || !DB) return loadDb();
  return DB;
}

function maybeReload() {
  if (!HOT_RELOAD || !DB_PATH_RESOLVED) return;
  try {
    const st = fs.statSync(DB_PATH_RESOLVED);
    if (st.mtimeMs > DB_MTIME_MS) {
      console.log("[musicKnowledge] Hot reload triggered (DB changed)");
      loadDb();
    }
  } catch (e) {
    warn(`Hot reload failed: ${String(e?.message || e)}`);
  }
}

// =============================
// DETECTION HELPERS
// =============================
function detectArtist(text) {
  maybeReload();
  const t = norm(text);
  if (!t) return null;

  const alias = ARTIST_ALIASES.get(t);
  if (alias) return alias;

  const exact = ARTIST_EXACT.get(t);
  if (exact) return exact;

  const toks = tokenize(t);
  const candidateNorms = new Set();
  for (const tok of toks) {
    const set = ARTIST_TOKEN_MAP.get(tok);
    if (set) for (const na of set) candidateNorms.add(na);
  }

  let best = null;
  let bestLen = 0;
  for (const na of candidateNorms) {
    if (t.includes(na) && na.length > bestLen) {
      best = na;
      bestLen = na.length;
    }
  }

  return best ? ARTIST_EXACT.get(best) : null;
}

function detectTitle(text) {
  maybeReload();
  const t = norm(text);
  if (!t) return null;

  const alias = TITLE_ALIASES.get(t);
  if (alias) return alias;

  const exact = TITLE_EXACT.get(t);
  if (exact) return exact;

  const toks = tokenize(t);
  const candidateNorms = new Set();
  for (const tok of toks) {
    const set = TITLE_TOKEN_MAP.get(tok);
    if (set) for (const nt of set) candidateNorms.add(nt);
  }

  let best = null;
  let bestLen = 0;
  for (const nt of candidateNorms) {
    if (nt && t.includes(nt) && nt.length > bestLen) {
      best = nt;
      bestLen = nt.length;
    }
  }

  return best ? TITLE_EXACT.get(best) : null;
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

// =============================
// EXPANSION HELPERS
// =============================
function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomByYear(year, chart = null) {
  getDb();
  const y = Number(year);
  if (!Number.isFinite(y)) return null;

  const c = chart ? norm(normalizeChart(chart)) : null;

  const pool = MOMENT_INDEX.filter((m) => {
    if (m.year !== y) return false;
    if (c && norm(m.chart) !== c) return false;
    return true;
  });

  return pickRandom(pool);
}

function pickRandomByYearFallback(year, chart = null) {
  return pickRandomByYear(year, chart) || pickRandomByYear(year, null);
}

function pickRandomByDecade(decade, chart = null) {
  getDb();
  const d = Number(decade);
  if (!Number.isFinite(d)) return null;

  const start = d;
  const end = d + 9;
  const c = chart ? norm(normalizeChart(chart)) : null;

  const pool = MOMENT_INDEX.filter((m) => {
    if (!m.year) return false;
    if (m.year < start || m.year > end) return false;
    if (c && norm(m.chart) !== c) return false;
    return true;
  });

  return pickRandom(pool);
}

function getTopByYear(year, n = 10) {
  getDb();
  const y = Number(year);
  const limit = Math.max(1, Math.min(100, Number(n) || 10));

  // Prefer Top40Weekly year-end Top 100
  const yearEnd = MOMENT_INDEX
    .filter((m) => m.year === y && norm(m.chart) === norm("Top40Weekly Top 100") && m.peak != null)
    .sort((a, b) => (a.peak || 999) - (b.peak || 999))
    .slice(0, limit);

  if (yearEnd.length) return yearEnd;

  // Fall back to Top40Weekly (if weekly ever added)
  const top40 = MOMENT_INDEX
    .filter((m) => m.year === y && norm(m.chart) === norm("Top40Weekly") && m.peak != null)
    .sort((a, b) => (a.peak || 999) - (b.peak || 999))
    .slice(0, limit);

  if (top40.length) return top40;

  // Fall back to any chart with peak
  const any = MOMENT_INDEX
    .filter((m) => m.year === y && m.peak != null)
    .sort((a, b) => (a.peak || 999) - (b.peak || 999))
    .slice(0, limit);

  return any;
}

// =============================
// SMART HELPER: years for artist + title
// =============================
function findYearsForArtistTitle(artist, title, chart = null) {
  getDb();
  const na = norm(artist);
  const nt = norm(title);
  const chartNorm = chart ? norm(normalizeChart(chart)) : null;

  const years = new Set();
  for (const m of MOMENT_INDEX) {
    if (m._na !== na) continue;
    if (m._nt !== nt) continue;
    if (chartNorm && norm(m.chart) !== chartNorm) continue;
    if (m.year) years.add(m.year);
  }

  return Array.from(years).sort((a, b) => a - b);
}

// =============================
// MATCHER (minimal but stable)
// =============================
function pickBestMoment(_db, fields = {}) {
  maybeReload();
  getDb();

  const na = fields.artist ? norm(fields.artist) : null;
  const nt = fields.title ? norm(fields.title) : null;
  const y = fields.year ? Number(fields.year) : null;
  const chart = fields.chart ? normalizeChart(fields.chart) : null;
  const chartNorm = chart ? norm(chart) : null;

  // Year-only
  if (y && !na && !nt) {
    return pickRandomByYearFallback(y, chart || null);
  }

  // Exact artist + title (+ optional year/chart)
  if (na && nt) {
    const hit = MOMENT_INDEX.find((m) => {
      if (m._na !== na) return false;
      if (m._nt !== nt) return false;
      if (chartNorm && norm(m.chart) !== chartNorm) return false;
      if (y && m.year !== y) return false;
      return true;
    });
    if (hit) return hit;

    // Relax year
    if (y) {
      const relaxed = MOMENT_INDEX.find((m) => {
        if (m._na !== na) return false;
        if (m._nt !== nt) return false;
        if (chartNorm && norm(m.chart) !== chartNorm) return false;
        return true;
      });
      if (relaxed) {
        return copyWithFlags(relaxed, { _correctedYear: true, _originalYear: y });
      }
    }

    // Relax chart
    const relaxed2 = MOMENT_INDEX.find((m) => m._na === na && m._nt === nt);
    if (relaxed2) return relaxed2;
  }

  // Artist + year
  if (na && y) {
    const hit = MOMENT_INDEX.find((m) => {
      if (m._na !== na) return false;
      if (m.year !== y) return false;
      if (chartNorm && norm(m.chart) !== chartNorm) return false;
      return true;
    });
    if (hit) return hit;
  }

  // Title (+ optional year/chart)
  if (nt) {
    const hit = MOMENT_INDEX.find((m) => {
      if (m._nt !== nt) return false;
      if (chartNorm && norm(m.chart) !== chartNorm) return false;
      if (y && m.year !== y) return false;
      return true;
    });
    if (hit) return hit;
  }

  // Artist only
  if (na) {
    const hit = MOMENT_INDEX.find((m) => {
      if (m._na !== na) return false;
      if (chartNorm && norm(m.chart) !== chartNorm) return false;
      if (y && m.year !== y) return false;
      return true;
    });
    if (hit) return hit;
  }

  return null;
}

function getAllMoments() {
  getDb();
  return MOMENT_INDEX.slice();
}

// =============================
// EXPORTS (THIS IS THE CRITICAL FIX)
// =============================
module.exports = {
  // Core access (guaranteed)
  loadDb,
  getDb,

  // Backward-compat aliases
  loadDB: loadDb,
  db: () => getDb(),

  // Core features
  pickBestMoment,
  detectArtist,
  detectTitle,
  extractYear,
  normalizeChart,

  // Follow-up intelligence helpers
  findYearsForArtistTitle,
  getAllMoments,
  pickRandomByYear,
  pickRandomByYearFallback,
  pickRandomByDecade,
  getTopByYear
};
