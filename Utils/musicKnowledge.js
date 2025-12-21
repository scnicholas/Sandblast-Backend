/**
 * musicKnowledge.js — Bulletproof V2.6 (Year-only support + stronger fallback)
 *
 * FIX:
 * - pickBestMoment() now supports year-only queries:
 *   fields={year, chart} with no artist/title will return a random moment for that year.
 *   It prefers the requested chart, but falls back to ANY chart in that year if needed.
 */

"use strict";

const fs = require("fs");
const path = require("path");

// =============================
// CONFIG
// =============================
const ENV_DB_PATH = process.env.MUSIC_DB_PATH;
const ENV_DB_CANDIDATES = process.env.MUSIC_DB_CANDIDATES;
const MERGE_TOP40WEEKLY = String(process.env.MERGE_TOP40WEEKLY || "1") !== "0";

const DEFAULT_DB_CANDIDATES = [
  "Data/music_moments_v2_layer2_plus500.json",
  "Data/music_moments_v2_layer2.json",
  "Data/music_moments_v2.json",
  "Data/music_moments.json",
  "Data/music_moments_layer1.json"
];

function getCandidateList() {
  if (!ENV_DB_CANDIDATES) return DEFAULT_DB_CANDIDATES;
  return String(ENV_DB_CANDIDATES)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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
  ["top 40", "Top40Weekly"]
]);

const HOT_RELOAD = String(process.env.MUSIC_DB_HOT_RELOAD || "") === "1";

// =============================
// INTERNAL STATE
// =============================
let DB = null; // { moments: [...] }
let DB_PATH_RESOLVED = null;
let DB_MTIME_MS = 0;
let LOADED = false;

let MOMENT_INDEX = [];
let ARTIST_EXACT = new Map();
let TITLE_EXACT = new Map();

let ARTIST_TOKEN_MAP = new Map();
let TITLE_TOKEN_MAP = new Map();

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

function failHard(msg) {
  console.error("[musicKnowledge]", msg);
  throw new Error(msg);
}

function warn(msg) {
  console.warn("[musicKnowledge]", msg);
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

function resolveDbPath() {
  if (ENV_DB_PATH) {
    const abs = path.isAbsolute(ENV_DB_PATH)
      ? ENV_DB_PATH
      : path.join(process.cwd(), ENV_DB_PATH);
    if (fileExists(abs)) return abs;
    warn(`MUSIC_DB_PATH is set but file not found: ${abs}`);
  }

  const DB_CANDIDATES = getCandidateList();

  for (const rel of DB_CANDIDATES) {
    const abs = path.join(process.cwd(), rel);
    if (fileExists(abs)) return abs;
  }

  for (const rel of DB_CANDIDATES) {
    const abs = path.resolve(__dirname, "..", rel);
    if (fileExists(abs)) return abs;
  }

  return null;
}

function toInt(x) {
  const n = Number(String(x ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeChart(chart) {
  const c = String(chart || "").trim();
  if (!c) return DEFAULT_CHART;

  const n = norm(c);
  if (CHART_ALIASES.has(n)) return CHART_ALIASES.get(n);

  // pass-through known canon
  if (
    c === "Billboard Hot 100" ||
    c === "UK Singles Chart" ||
    c === "Canada RPM" ||
    c === "Top40Weekly"
  ) {
    return c;
  }
  return c;
}

function isTruthy(x) {
  const n = norm(x);
  return n === "true" || n === "1" || n === "yes" || n === "y";
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

function stripBom(s) {
  if (!s) return s;
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

// =============================
// TOP40WEEKLY MERGE
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
    } catch (_) {}
  }
  return [];
}

function loadTop40WeeklyMoments() {
  if (!MERGE_TOP40WEEKLY) return [];

  const files = findTop40WeeklyFiles();
  if (!files.length) {
    warn(
      "Top40Weekly merge enabled but no top100_YYYY.json files found in data/top40weekly"
    );
    return [];
  }

  const out = [];
  let skipped = 0;

  for (const fp of files) {
    try {
      const raw = stripBom(fs.readFileSync(fp, "utf8"));
      const json = JSON.parse(raw);
      if (!Array.isArray(json)) continue;

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
          chart: "Top40Weekly",
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
      warn(
        "Failed reading Top40Weekly file: " +
          fp +
          " :: " +
          (e.message || e)
      );
    }
  }

  console.log(
    `[musicKnowledge] Top40Weekly merge: loaded ${out.length} rows from ${files.length} files (skipped=${skipped})`
  );
  return out;
}

// =============================
// INDEX MAPS
// =============================
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

function buildDefaultAliases() {
  ARTIST_ALIASES.clear();
  TITLE_ALIASES.clear();

  const artistPairs = [
    ["mj", "Michael Jackson"],
    ["peter cetera", "Peter Cetera"],
    ["cetera", "Peter Cetera"],
    ["roberta flack", "Roberta Flack"],
    ["flack", "Roberta Flack"],
    ["peabo bryson", "Peabo Bryson"],
    ["peobo bryson", "Peabo Bryson"],
    ["bryson", "Peabo Bryson"]
  ];

  for (const [a, canon] of artistPairs) ARTIST_ALIASES.set(norm(a), canon);
}

// =============================
// VALIDATE + NORMALIZE
// =============================
function validateDb(moments) {
  let missing = 0;
  let dupes = 0;
  const seen = new Set();

  for (const raw of moments) {
    const artist = String(raw.artist || "").trim();
    const year = toInt(raw.year);
    const chart = normalizeChart(raw.chart);

    if (!artist || !year) missing++;

    const key = `${norm(artist)}|${year}|${norm(chart)}|${norm(
      raw.title || ""
    )}`;
    if (seen.has(key)) dupes++;
    seen.add(key);
  }

  if (missing) warn(`DB validation: ${missing} records missing required (artist/year).`);
  if (dupes) warn(`DB validation: ${dupes} possible duplicates (artist/year/chart/title).`);
}

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

function buildIndexes(moments) {
  ARTIST_EXACT.clear();
  TITLE_EXACT.clear();
  MOMENT_INDEX = [];

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
// LOAD DB
// =============================
function loadDb() {
  const resolved = resolveDbPath();
  if (!resolved) failHard("Music DB not found. Set MUSIC_DB_PATH or place a DB in Data/.");

  DB_PATH_RESOLVED = resolved;

  const stat = fs.statSync(DB_PATH_RESOLVED);
  DB_MTIME_MS = stat.mtimeMs;

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
    const stat = fs.statSync(DB_PATH_RESOLVED);
    if (stat.mtimeMs > DB_MTIME_MS) {
      console.log("[musicKnowledge] Hot reload triggered (DB changed)");
      loadDb();
    }
  } catch (e) {
    warn("Hot reload failed: " + String(e && e.message ? e.message : e));
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
  if (!arr || !arr.length) return null;
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

// Prefer chart, but if that chart is sparse, fall back to any chart for that year
function pickRandomByYearFallback(year, chart = null) {
  const first = pickRandomByYear(year, chart);
  if (first) return first;
  return pickRandomByYear(year, null);
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

  const top40 = MOMENT_INDEX
    .filter((m) => m.year === y && norm(m.chart) === norm("Top40Weekly") && m.peak != null)
    .sort((a, b) => (a.peak || 999) - (b.peak || 999))
    .slice(0, limit);

  if (top40.length) return top40;

  const any = MOMENT_INDEX
    .filter((m) => m.year === y && m.peak != null)
    .sort((a, b) => (a.peak || 999) - (b.peak || 999))
    .slice(0, limit);

  return any;
}

// =============================
// CORE MATCHER
// =============================
function pickBestMoment(_db, fields = {}) {
  maybeReload();

  const db = getDb();
  const moments = (db && db.moments) || [];
  if (!moments.length) return null;

  const na = fields.artist ? norm(fields.artist) : null;
  const nt = fields.title ? norm(fields.title) : null;
  const y = fields.year ? Number(fields.year) : null;

  const chart = fields.chart ? normalizeChart(fields.chart) : null;
  const chartNorm = chart ? norm(chart) : null;

  const match = (fn) => {
    for (const m of MOMENT_INDEX) if (fn(m)) return m;
    return null;
  };

  // -------------------------------------------------
  // NEW: YEAR-ONLY SUPPORT (this fixes "1984" requests)
  // -------------------------------------------------
  if (y && !na && !nt) {
    // Prefer the requested chart, but fall back to any chart in that year.
    const hit = pickRandomByYearFallback(y, chartNorm ? chart : null);
    if (hit) return hit;

    // Absolute last resort: return any moment that has that year (even if chart label mismatch)
    const fallbackPool = MOMENT_INDEX.filter((m) => m.year === y);
    return pickRandom(fallbackPool);
  }

  // Exact artist+title (optional year/chart)
  if (na && nt) {
    const hit = match((m) =>
      m._na === na &&
      m._nt === nt &&
      (!chartNorm || norm(m.chart) === chartNorm) &&
      (!y || m.year === y)
    );
    if (hit) return hit;
  }

  // Artist + year (optional chart)
  if (na && y) {
    const hit = match((m) =>
      m._na === na &&
      m.year === y &&
      (!chartNorm || norm(m.chart) === chartNorm)
    );
    if (hit) return hit;
  }

  // Title (optional year/chart)
  if (nt) {
    const hit = match((m) =>
      m._nt === nt &&
      (!chartNorm || norm(m.chart) === chartNorm) &&
      (!y || m.year === y)
    );
    if (hit) return hit;
  }

  // Artist only: nearest year if provided, else first match
  if (na) {
    if (y) {
      let best = null;
      let bestDist = Infinity;
      for (const m of MOMENT_INDEX) {
        if (m._na !== na) continue;
        if (chartNorm && norm(m.chart) !== chartNorm) continue;
        if (!m.year) continue;
        const d = Math.abs(m.year - y);
        if (d < bestDist) {
          best = m;
          bestDist = d;
        }
      }
      if (best) return best;
    } else {
      const hit = match((m) =>
        m._na === na &&
        (!chartNorm || norm(m.chart) === chartNorm)
      );
      if (hit) return hit;
    }
  }

  return null;
}

// =============================
// PUBLIC HELPERS
// =============================
function getAllMoments() {
  getDb();
  return MOMENT_INDEX.slice();
}

// =============================
// EXPORTS
// =============================
module.exports = {
  loadDb,
  getDb,
  loadDB: loadDb,
  db: () => getDb(),

  pickBestMoment,
  detectArtist,
  detectTitle,
  extractYear,
  normalizeChart,

  // Expansion helpers
  getAllMoments,
  pickRandomByYear,
  pickRandomByYearFallback,
  pickRandomByDecade,
  getTopByYear
};
