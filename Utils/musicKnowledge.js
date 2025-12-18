/**
 * musicKnowledge.js — Bulletproof V2.1 Loader (Layer2-ready)
 * Sandblast / Nyx
 *
 * Updates in v2.1:
 * - Backwards-compatible exports: loadDb, loadDB, getDb, db
 * - Accepts DB as { moments: [...] } OR raw array [...]
 * - BOM-safe JSON parsing
 * - Safe "load once" getter (getDb)
 * - More robust path resolution across Windows/Render
 * - Hot reload only if enabled (MUSIC_DB_HOT_RELOAD=1)
 */

"use strict";

const fs = require("fs");
const path = require("path");

// =============================
// CONFIG
// =============================

// Preferred: set in Render env vars (no more edits)
// e.g. MUSIC_DB_PATH=Data/music_moments_v2_layer2.json
const ENV_DB_PATH = process.env.MUSIC_DB_PATH;

// Fallback candidates (first existing one is used)
const DB_CANDIDATES = [
  "Data/music_moments_v2_layer2.json",
  "Data/music_moments_v2.json",
  "Data/music_moments.json",
  "Data/music_moments_layer1.json"
];

// Charts
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

// Hot reload: set MUSIC_DB_HOT_RELOAD=1 in Render if desired
const HOT_RELOAD = String(process.env.MUSIC_DB_HOT_RELOAD || "") === "1";

// =============================
// INTERNAL STATE
// =============================
let DB = null; // will become { moments: [...] }
let DB_PATH_RESOLVED = null;
let DB_MTIME_MS = 0;
let LOADED = false;

let MOMENT_INDEX = []; // normalized moments
let ARTIST_EXACT = new Map(); // normArtist -> canonical artist
let TITLE_EXACT = new Map();  // normTitle  -> canonical title

// Fast contains match: use token maps
let ARTIST_TOKEN_MAP = new Map(); // token -> Set(normArtist)
let TITLE_TOKEN_MAP = new Map();  // token -> Set(normTitle)

// Alias maps (expand anytime without breaking callers)
let ARTIST_ALIASES = new Map(); // normAlias -> canonical artist
let TITLE_ALIASES = new Map();  // normAlias -> canonical title

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
  try { return fs.existsSync(p); } catch (_) { return false; }
}

function resolveDbPath() {
  // If ENV is set, honor it (absolute or relative to project root)
  if (ENV_DB_PATH) {
    const abs = path.isAbsolute(ENV_DB_PATH)
      ? ENV_DB_PATH
      : path.join(process.cwd(), ENV_DB_PATH);
    if (fileExists(abs)) return abs;
    warn(`MUSIC_DB_PATH is set but file not found: ${abs}`);
  }

  // Try candidates relative to project root
  for (const rel of DB_CANDIDATES) {
    const abs = path.join(process.cwd(), rel);
    if (fileExists(abs)) return abs;
  }

  // Try candidates relative to this module (in case cwd differs)
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

  // If already canonical, keep it
  if (c === "Billboard Hot 100" || c === "UK Singles Chart" || c === "Canada RPM" || c === "Top40Weekly") {
    return c;
  }
  // Otherwise keep as-is (future charts without edits)
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
  if (!set) { set = new Set(); map.set(token, set); }
  set.add(value);
}

function stripBom(s) {
  // handles UTF-8 BOM
  if (!s) return s;
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
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
    ["peobo bryson", "Peabo Bryson"], // common typo
    ["bryson", "Peabo Bryson"]
  ];

  for (const [a, canon] of artistPairs) {
    ARTIST_ALIASES.set(norm(a), canon);
  }

  // Title aliases can be populated later.
}

function validateDb(moments) {
  let missing = 0;
  let dupes = 0;

  const seen = new Set();

  for (const raw of moments) {
    const artist = String(raw.artist || "").trim();
    const year = toInt(raw.year);
    const chart = normalizeChart(raw.chart);

    if (!artist || !year) missing++;

    const key = `${norm(artist)}|${year}|${norm(chart)}|${norm(raw.title || "")}`;
    if (seen.has(key)) dupes++;
    seen.add(key);
  }

  if (missing) warn(`DB validation: ${missing} records missing required (artist/year). They will be indexed but may reduce matching quality.`);
  if (dupes) warn(`DB validation: ${dupes} possible duplicates (artist/year/chart/title). Consider de-duping for cleaner results.`);
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
    typeof raw.is_number_one === "boolean" ? raw.is_number_one :
    raw.is_number_one != null ? isTruthy(raw.is_number_one) : false;

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

  for (const raw of moments) {
    const m = normalizeMoment(raw);

    if (m.artist) ARTIST_EXACT.set(m._na, m.artist);
    if (m.title) TITLE_EXACT.set(m._nt, m.title);

    MOMENT_INDEX.push(m);
  }

  buildDefaultAliases();
  buildTokenMaps();

  console.log(`[musicKnowledge] Loaded ${MOMENT_INDEX.length} moments from ${DB_PATH_RESOLVED}`);
}

// =============================
// LOAD + VALIDATE DB
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
  } catch (e) {
    failHard(`Music DB JSON is invalid at ${DB_PATH_RESOLVED}`);
  }

  // Accept either { moments: [...] } OR raw array
  let moments = null;
  if (Array.isArray(json)) moments = json;
  else if (json && Array.isArray(json.moments)) moments = json.moments;

  if (!moments) {
    failHard(`Music DB must be { moments: [...] } or a raw array at ${DB_PATH_RESOLVED}`);
  }

  validateDb(moments);

  DB = { moments };
  buildIndexes(moments);

  LOADED = true;
  return DB;
}

// Public getter: ensures DB is loaded once
function getDb() {
  if (!LOADED || !DB) return loadDb();
  return DB;
}

// Hot reload (safe): reload if file changed
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
// DETECTION HELPERS (FAST)
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
      best = na; bestLen = na.length;
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
      best = nt; bestLen = nt.length;
    }
  }

  return best ? TITLE_EXACT.get(best) : null;
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

// =============================
// CORE MATCHER (DETERMINISTIC)
// =============================
function pickBestMoment(_db, fields = {}) {
  maybeReload();

  const db = getDb();
  const moments = (db && db.moments) || [];

  const na = fields.artist ? norm(fields.artist) : null;
  const nt = fields.title ? norm(fields.title) : null;
  const y = fields.year ? Number(fields.year) : null;
  const chart = fields.chart ? normalizeChart(fields.chart) : null;

  if (!moments.length) return null;

  const chartNorm = chart ? norm(chart) : null;

  const match = (fn) => {
    for (const m of MOMENT_INDEX) {
      if (fn(m)) return m;
    }
    return null;
  };

  // 1) artist + title (+ chart) (+ year)
  if (na && nt) {
    const hit = match(m =>
      m._na === na &&
      m._nt === nt &&
      (!chartNorm || norm(m.chart) === chartNorm) &&
      (!y || m.year === y)
    );
    if (hit) return hit;
  }

  // 2) artist + year (+ chart)
  if (na && y) {
    const hit = match(m =>
      m._na === na &&
      m.year === y &&
      (!chartNorm || norm(m.chart) === chartNorm)
    );
    if (hit) return hit;
  }

  // 3) title only (+ chart) (+ year)
  if (nt) {
    const hit = match(m =>
      m._nt === nt &&
      (!chartNorm || norm(m.chart) === chartNorm) &&
      (!y || m.year === y)
    );
    if (hit) return hit;
  }

  // 4) artist only (+ chart) — choose closest year if year is provided
  if (na) {
    if (y) {
      let best = null;
      let bestDist = Infinity;
      for (const m of MOMENT_INDEX) {
        if (m._na !== na) continue;
        if (chartNorm && norm(m.chart) !== chartNorm) continue;
        if (!m.year) continue;
        const d = Math.abs(m.year - y);
        if (d < bestDist) { best = m; bestDist = d; }
      }
      if (best) return best;
    } else {
      const hit = match(m =>
        m._na === na &&
        (!chartNorm || norm(m.chart) === chartNorm)
      );
      if (hit) return hit;
    }
  }

  return null;
}

// =============================
// EXPORTS (Backwards compatible)
// =============================
module.exports = {
  // Preferred
  loadDb,
  getDb,

  // Backwards-compatible aliases
  loadDB: loadDb,

  // Allow one-liners: kb.db().moments.length
  db: () => getDb(),

  // Core capabilities
  pickBestMoment,
  detectArtist,
  detectTitle,
  extractYear,
  normalizeChart
};
