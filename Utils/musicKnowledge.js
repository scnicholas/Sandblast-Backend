"use strict";

/**
 * musicKnowledge.js — Bulletproof V2.32
 *
 * Key improvements vs v2.31:
 * 1) Output-guaranteed normalization:
 *    - Any function that returns moments (poolForYear / pickers / getTopByYear)
 *      returns normalized copies so Nyx never prints raw/dirty Top40Weekly fields.
 *
 * 2) Stronger Top40Weekly repairs:
 *    - Move title-word(s) embedded ANYWHERE in artist (not only front)
 *    - Expand “title short + artist long” extraction robustness (keeps 2-token names)
 *    - Canonicalize Hall & Oates / Kool & The Gang ordering after cleanup
 */

const fs = require("fs");
const path = require("path");

const MK_VERSION =
  "musicKnowledge v2.32 (output-guaranteed normalization + embedded-title extraction anywhere + ampersand act canonicalization)";

// =============================
// CONFIG
// =============================
const DEFAULT_CHART = "Billboard Hot 100";
const TOP40_CHART = "Top40Weekly Top 100";
const TOP40_DIR_DEFAULT = "Data/top40weekly";

const MERGE_TOP40WEEKLY =
  String(process.env.MERGE_TOP40WEEKLY ?? "true").toLowerCase() === "true";

const ENABLE_CHART_FALLBACK =
  String(process.env.MUSIC_ENABLE_CHART_FALLBACK ?? "1") !== "0";

const FALLBACK_CHART =
  String(process.env.MUSIC_FALLBACK_CHART || "Billboard Hot 100").trim() ||
  "Billboard Hot 100";

const DB_PATH_ENV = String(process.env.MUSIC_DB_PATH || "").trim();
const DB_CANDIDATES_ENV = String(process.env.DB_CANDIDATES || "").trim();
const DATA_DIR_ENV = String(process.env.DATA_DIR || "").trim();

const DB_CANDIDATES_DEFAULT = [
  "Data/music_moments_v2_layer2_plus500.json",
  "Data/music_moments_v2_layer2_filled.json",
  "Data/music_moments_v2_layer2.json",
  "Data/music_moments.json",
];

// =============================
// INTERNAL STATE
// =============================
let DB = null; // { moments: [] }
let INDEX_BUILT = false;

const BY_YEAR = new Map(); // year -> moments[]
const BY_YEAR_CHART = new Map(); // `${year}|${chart}` -> moments[]
const STATS = { moments: 0, yearMin: null, yearMax: null, charts: [] };

let TOP40_MERGE_META = {
  didMerge: false,
  dir: null,
  rows: 0,
  files: 0,
  years: null,
};

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

function fileExists(p) {
  try {
    return !!p && fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p) {
  try {
    return !!p && fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * CRITICAL: blank -> null (prevents toInt(undefined) => 0)
 */
function toInt(x) {
  const s = String(x ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toRank(x) {
  const s = String(x ?? "").trim();
  if (!s) return null;
  const n = Number(s);
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

function _asText(x) {
  return (x == null ? "" : String(x)).trim();
}

function isTitleHangWord(w) {
  const t = norm(w);
  return [
    "a",
    "an",
    "the",
    "this",
    "that",
    "to",
    "in",
    "on",
    "of",
    "for",
    "with",
    "at",
    "from",
    "by",
    "and",
    "or",
  ].includes(t);
}

function isNameyToken(tok) {
  const t = _asText(tok);
  if (!t) return false;
  // allow commas (e.g., "Parker,")
  if (!/^[A-Za-z][A-Za-z'.-]*,?$/.test(t)) return false;
  const low = t.toLowerCase().replace(/,$/, "");
  if (
    ["and", "of", "the", "a", "an", "to", "in", "on", "with"].includes(low)
  )
    return false;
  return t[0] === t[0].toUpperCase();
}

function looksLikeTwoTokenPersonName(a, b) {
  if (!a || !b) return false;
  return isNameyToken(a) && isNameyToken(b);
}

function normalizeChart(chart) {
  const c = String(chart || DEFAULT_CHART).trim();
  if (c === "Top40Weekly") return TOP40_CHART;
  return c || DEFAULT_CHART;
}

function decodeHtmlEntities(s) {
  const t = String(s || "");
  return t
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function shallowCloneMoment(m) {
  // Ensure we never leak mutated originals
  return m && typeof m === "object" ? { ...m } : m;
}

// =============================
// DRIFT REPAIR (Top40Weekly ingest & output)
// =============================
const BAND_SUFFIXES = new Set([
  "Club",
  "Band",
  "Orchestra",
  "Experience",
  "Project",
  "Crew",
  "Group",
  "Trio",
  "Quartet",
  "Quintet",
  "Gang",
]);

/**
 * Words that frequently belong to song titles and commonly drift into artist fields
 * in older Top40Weekly dumps.
 *
 * Note: We only move them when doing so improves plausibility.
 */
const TITLE_PREFIX_CANDIDATES = new Set([
  "You",
  "I",
  "Me",
  "My",
  "Mine",
  "Your",
  "Yours",
  "Us",
  "We",
  "Love",
  "Loving",
  "Heart",
  "Eyes",
  "Girl",
  "Night",
  "List",
  "Endless",
  "Starting",
  "Keep",
  "Kiss",
  "Rainy",
  "Davis",
]);

// Back-compat name
const TITLE_LEADING_WORDS = TITLE_PREFIX_CANDIDATES;

function hardFixKnownCorruptions(m) {
  const year = Number(m.year);
  const rank = toRank(m.rank);

  let artist = _asText(m.artist);
  let title = _asText(m.title);

  // 1984 Top40Weekly failsafes
  if (year === 1984 && rank === 1 && /^Doves Cry Prince$/i.test(artist) && /^When$/i.test(title)) {
    artist = "Prince";
    title = "When Doves Cry";
  }
  if (
    year === 1984 &&
    rank === 3 &&
    /^Say Paul Mc Cartney and Michael Jackson$/i.test(artist) &&
    /^Say Say$/i.test(title)
  ) {
    artist = "Paul Mc Cartney and Michael Jackson";
    title = "Say Say Say";
  }
  if (year === 1984 && rank === 8 && /^Heart Yes$/i.test(artist) && /^Owner of a Lonely$/i.test(title)) {
    artist = "Yes";
    title = "Owner of a Lonely Heart";
  }
  if (year === 1984 && rank === 10 && /^Chameleon Culture Club$/i.test(artist) && /^Karma$/i.test(title)) {
    artist = "Culture Club";
    title = "Karma Chameleon";
  }

  m.artist = artist;
  m.title = title;
  return m;
}

/**
 * Repair: title very short (<=2 tokens) and artist long (>=3 tokens)
 * Extract artist core from end of artist tokens, append spill to title.
 */
function repairTitleShortArtistLong(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const tParts = title.split(/\s+/).filter(Boolean);
  const aParts = artist.split(/\s+/).filter(Boolean);

  if (tParts.length > 2) return m;
  if (aParts.length < 3) return m;

  const last = aParts[aParts.length - 1];
  const prev = aParts[aParts.length - 2];

  let coreLen = 1;

  if (BAND_SUFFIXES.has(last)) coreLen = 2;
  else if (looksLikeTwoTokenPersonName(prev, last)) coreLen = 2;

  const coreTokens = aParts.slice(-coreLen);
  const spillTokens = aParts.slice(0, -coreLen);

  if (!coreTokens.length || !spillTokens.length) return m;

  m.artist = coreTokens.join(" ").trim();
  m.title = `${title} ${spillTokens.join(" ")}`.replace(/\s+/g, " ").trim();
  return m;
}

/**
 * Repair: leading title-word stuck in artist
 * Example:
 * - "You REO Speedwagon" + "Keep on Loving" => "REO Speedwagon" — "Keep on Loving You"
 */
function repairLeadingTitleWordInArtist(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const aParts = artist.split(/\s+/).filter(Boolean);
  if (aParts.length < 2) return m;

  const first = aParts[0];
  if (!TITLE_PREFIX_CANDIDATES.has(first)) return m;

  const rest = aParts.slice(1);
  if (!rest.length) return m;
  if (rest[0][0] !== rest[0][0].toUpperCase()) return m;

  if (norm(title).includes(norm(first))) return m;

  m.artist = rest.join(" ").trim();
  m.title = `${title} ${first}`.replace(/\s+/g, " ").trim();
  return m;
}

/**
 * Repair: two-token artist spill
 * "Heart Yes" — "Owner of a Lonely" => "Yes" — "Owner of a Lonely Heart"
 */
function repairTwoTokenArtistFrontSpill(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const aParts = artist.split(/\s+/).filter(Boolean);
  if (aParts.length !== 2) return m;

  const spill = aParts[0];
  const candidateArtist = aParts[1];

  if (!spill || spill.length < 2) return m;
  if (!candidateArtist) return m;

  const titleNorm = norm(title);
  if (titleNorm.includes(norm(spill))) return m;

  if (spill[0] !== spill[0].toUpperCase()) return m;
  if (candidateArtist[0] !== candidateArtist[0].toUpperCase()) return m;

  m.artist = candidateArtist;
  m.title = `${title} ${spill}`.replace(/\s+/g, " ").trim();
  return m;
}

/**
 * Repair: move tail tokens from title into artist (supports bands/duos/collabs)
 */
function repairTitleTailIntoArtist(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const tParts = title.split(/\s+/).filter(Boolean);
  if (tParts.length < 2) return m;

  const isTailOk = (tok) => {
    const low = String(tok).toLowerCase().replace(/,$/, "");
    if (low === "and" || low === "&") return true;
    if (low === "the") return true;
    return isNameyToken(tok);
  };

  for (let k = 6; k >= 1; k--) {
    if (tParts.length < k + 1) continue;

    const tail = tParts.slice(-k);
    const head = tParts.slice(0, -k);

    if (!tail.every(isTailOk)) continue;
    if (!head.length) continue;
    if (isTitleHangWord(head[head.length - 1])) continue;

    const tailLast = String(tail[tail.length - 1]).toLowerCase();

    if (tailLast === "&" || tailLast === "and") {
      const conn = tail[tail.length - 1];
      const who = tail.slice(0, -1).join(" ").trim();
      if (who) {
        m.artist = `${artist} ${conn} ${who}`.replace(/\s+/g, " ").trim();
        m.title = head.join(" ").trim();
        return m;
      }
    }

    m.artist = `${tail.join(" ")} ${artist}`.replace(/\s+/g, " ").trim();
    m.title = head.join(" ").trim();
    return m;
  }

  return m;
}

/**
 * NEW: Move title-like tokens embedded ANYWHERE in artist into title,
 * if title is short and artist remains plausible after removal.
 *
 * This fixes:
 * - "Love Diana Ross & Lionel Richie" + title "Endless"
 * - "Oates & List Hall" + title "Kiss on My"
 */
function repairEmbeddedTitleWordsInArtistAnywhere(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const aParts = artist.split(/\s+/).filter(Boolean);
  const tParts = title.split(/\s+/).filter(Boolean);

  if (aParts.length < 2) return m;
  if (tParts.length > 5) return m;

  const moved = [];
  const kept = [];

  for (const tok of aParts) {
    const low = tok.toLowerCase().replace(/,$/, "");
    // Never move connectors/articles
    if (low === "&" || low === "and" || low === "the") {
      kept.push(tok);
      continue;
    }

    if (TITLE_PREFIX_CANDIDATES.has(tok)) {
      moved.push(tok);
      continue;
    }

    kept.push(tok);
  }

  // Only apply if:
  // - we moved something
  // - artist still has >= 2 meaningful tokens (or has '&' structure)
  if (!moved.length) return m;

  const keptMeaningful = kept.filter((x) => {
    const low = x.toLowerCase().replace(/,$/, "");
    return low !== "&" && low !== "and" && low !== "the";
  });

  if (keptMeaningful.length < 2 && !kept.includes("&")) return m;

  // Move moved tokens to the END of title (keeps title word order stable for cases like "Endless" + "Love")
  m.artist = kept.join(" ").replace(/\s+/g, " ").trim();
  m.title = `${title} ${moved.join(" ")}`.replace(/\s+/g, " ").trim();

  return m;
}

/**
 * Canonicalize a few high-frequency band/duo patterns after repairs.
 */
function canonicalizeAmpersandActs(m) {
  let artist = _asText(m.artist);
  if (!artist) return m;

  const a = artist
    .replace(/\s+/g, " ")
    .replace(/\s*&\s*/g, " & ")
    .trim();

  // Kool & The Gang variants
  if (/^the gang & kool$/i.test(a) || /^the gang & kool,?$/i.test(a)) {
    m.artist = "Kool & The Gang";
    return m;
  }
  if (/^kool & the gang$/i.test(a) || /^kool & the gang,?$/i.test(a)) {
    m.artist = "Kool & The Gang";
    return m;
  }

  // Hall & Oates variants
  if (/^oates & hall$/i.test(a) || /^oates & hall,?$/i.test(a)) {
    m.artist = "Hall & Oates";
    return m;
  }
  if (/^hall & oates$/i.test(a) || /^hall & oates,?$/i.test(a)) {
    m.artist = "Hall & Oates";
    return m;
  }

  m.artist = a;
  return m;
}

/**
 * Normalize artist/title fields for Top40Weekly and any downstream use.
 */
function normalizeMomentFields(m) {
  if (!m || typeof m !== "object") return m;

  // Decode HTML entities and trim
  m.artist = decodeHtmlEntities(_asText(m.artist));
  m.title = decodeHtmlEntities(_asText(m.title));

  // Global repairs (order matters)
  repairTitleShortArtistLong(m);
  repairLeadingTitleWordInArtist(m);
  repairEmbeddedTitleWordsInArtistAnywhere(m);
  repairTwoTokenArtistFrontSpill(m);
  repairTitleTailIntoArtist(m);
  canonicalizeAmpersandActs(m);
  hardFixKnownCorruptions(m);

  m.artist = _asText(m.artist);
  m.title = _asText(m.title);
  return m;
}

/**
 * Output-guaranteed normalization:
 * Always return a normalized COPY of a moment.
 */
function normalizedCopy(m) {
  const c = shallowCloneMoment(m);
  return normalizeMomentFields(c);
}

// =============================
// DB LOADING
// =============================
function resolveDataDir() {
  if (DATA_DIR_ENV)
    return path.isAbsolute(DATA_DIR_ENV)
      ? DATA_DIR_ENV
      : path.resolve(process.cwd(), DATA_DIR_ENV);
  return path.resolve(__dirname, "..");
}

function resolveRepoPath(p) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  return path.resolve(resolveDataDir(), p);
}

function getDbCandidates() {
  if (DB_PATH_ENV) return [DB_PATH_ENV];
  if (DB_CANDIDATES_ENV) {
    return DB_CANDIDATES_ENV
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return DB_CANDIDATES_DEFAULT.slice();
}

function loadBaseDb() {
  const candidates = getDbCandidates();

  for (const rel of candidates) {
    const abs = resolveRepoPath(rel);
    if (!fileExists(abs)) continue;

    const data = readJsonFile(abs);
    const moments = Array.isArray(data?.moments)
      ? data.moments
      : Array.isArray(data)
      ? data
      : [];
    if (!moments.length) continue;

    return { absPath: abs, moments };
  }

  return { absPath: null, moments: [] };
}

// =============================
// Top40Weekly merge
// =============================
function extractYearFromFilename(filename) {
  const base = path.basename(filename);
  let m = base.match(/(19[0-9]{2}|20[0-9]{2})/);
  if (m) return toInt(m[1]);

  m = base.match(/(?:^|[^0-9])([0-9]{2})(?:[^0-9]|$)/);
  if (m) {
    const yy = toInt(m[1]);
    if (yy != null && yy >= 80 && yy <= 99) return 1900 + yy;
  }

  return null;
}

function extractYearFromObject(obj) {
  if (!obj || typeof obj !== "object") return null;

  const direct = toInt(obj.year ?? obj.Year ?? obj.Y);
  if (direct) return direct;

  const nests = [obj.meta, obj.header, obj.info, obj.data, obj.context, obj.payload];
  for (const n of nests) {
    const y = toInt(n?.year ?? n?.Year ?? n?.Y);
    if (y) return y;
  }
  return null;
}

function extractRankFromRow(row) {
  if (!row || typeof row !== "object") return null;
  return toRank(row.rank ?? row.Rank ?? row.position ?? row.pos ?? row.number ?? row.no);
}

function extractArtistTitleFromRow(row) {
  if (!row || typeof row !== "object") return { artist: "", title: "" };

  let artist = _asText(row.artist ?? row.Artist ?? row.performer ?? row.Performer ?? row.act ?? row.Act);
  let title = _asText(row.title ?? row.Title ?? row.song ?? row.Song ?? row.track ?? row.Track);

  if (!artist && row.name && row.by) {
    title = _asText(row.name);
    artist = _asText(row.by);
  }

  return { artist, title };
}

function readTop40WeeklyDir(top40DirAbs) {
  if (!dirExists(top40DirAbs)) {
    return { ok: false, added: 0, skippedFiles: 0, emptyFiles: 0, rowsSkipped: 0, years: null };
  }

  const files = fs
    .readdirSync(top40DirAbs)
    .filter((f) => /\.json$/i.test(f))
    .sort();

  let added = 0;
  let skippedFiles = 0;
  let emptyFiles = 0;
  let rowsSkipped = 0;

  let yearMin = null;
  let yearMax = null;

  const merged = [];

  for (const f of files) {
    const abs = path.join(top40DirAbs, f);
    let parsed;
    try {
      parsed = readJsonFile(abs);
    } catch {
      skippedFiles++;
      continue;
    }

    let rows = null;
    if (Array.isArray(parsed)) rows = parsed;
    else if (Array.isArray(parsed?.rows)) rows = parsed.rows;
    else if (Array.isArray(parsed?.data)) rows = parsed.data;
    else if (Array.isArray(parsed?.chart)) rows = parsed.chart;

    if (!Array.isArray(rows) || rows.length === 0) {
      emptyFiles++;
      continue;
    }

    const yFromFile = extractYearFromFilename(f);
    const yFromObj = extractYearFromObject(parsed);
    const year = yFromObj || yFromFile;

    if (!year) {
      skippedFiles++;
      continue;
    }

    yearMin = yearMin == null ? year : Math.min(yearMin, year);
    yearMax = yearMax == null ? year : Math.max(yearMax, year);

    for (const row of rows) {
      const r = extractRankFromRow(row);
      const { artist, title } = extractArtistTitleFromRow(row);

      if (!artist || !title) {
        rowsSkipped++;
        continue;
      }
      if (r == null) {
        rowsSkipped++;
        continue;
      }

      const m = normalizeMomentFields({
        year,
        chart: TOP40_CHART,
        rank: r,
        artist,
        title,
      });

      if (!_asText(m.artist) || !_asText(m.title)) {
        rowsSkipped++;
        continue;
      }

      merged.push(m);
      added++;
    }
  }

  return {
    ok: true,
    merged,
    added,
    skippedFiles,
    emptyFiles,
    rowsSkipped,
    years: yearMin != null && yearMax != null ? `${yearMin}–${yearMax}` : null,
    filesCount: files.length,
  };
}

// =============================
// INDEX BUILD
// =============================
function buildIndexes() {
  if (!DB || !Array.isArray(DB.moments)) {
    INDEX_BUILT = false;
    return;
  }

  BY_YEAR.clear();
  BY_YEAR_CHART.clear();

  const chartsSet = new Set();
  let minY = null;
  let maxY = null;

  for (const raw of DB.moments) {
    const m = normalizeMomentFields(raw); // mutate base DB objects (ok)

    const y = toInt(m.year);
    if (!y) continue;

    const c = normalizeChart(m.chart || DEFAULT_CHART);
    m.chart = c;

    chartsSet.add(c);

    minY = minY == null ? y : Math.min(minY, y);
    maxY = maxY == null ? y : Math.max(maxY, y);

    if (!BY_YEAR.has(y)) BY_YEAR.set(y, []);
    BY_YEAR.get(y).push(m);

    const key = `${y}|${c}`;
    if (!BY_YEAR_CHART.has(key)) BY_YEAR_CHART.set(key, []);
    BY_YEAR_CHART.get(key).push(m);
  }

  for (const [, arr] of BY_YEAR_CHART.entries()) {
    arr.sort((a, b) => {
      const ar = toInt(a.rank);
      const br = toInt(b.rank);
      if (ar != null && br != null && ar !== br) return ar - br;
      return 0;
    });
  }

  STATS.moments = DB.moments.length;
  STATS.yearMin = minY;
  STATS.yearMax = maxY;
  STATS.charts = Array.from(chartsSet).sort();

  INDEX_BUILT = true;
}

// =============================
// PUBLIC: DB ACCESS
// =============================
function getDb() {
  if (DB && INDEX_BUILT) return DB;

  const base = loadBaseDb();
  DB = { moments: base.moments || [] };

  const top40DirAbs = resolveRepoPath(TOP40_DIR_DEFAULT);
  const shouldMerge = MERGE_TOP40WEEKLY && dirExists(top40DirAbs);

  TOP40_MERGE_META = {
    didMerge: false,
    dir: top40DirAbs,
    rows: 0,
    files: 0,
    years: null,
  };

  if (shouldMerge) {
    const res = readTop40WeeklyDir(top40DirAbs);
    TOP40_MERGE_META.didMerge = true;
    TOP40_MERGE_META.rows = Array.isArray(res.merged) ? res.merged.length : 0;
    TOP40_MERGE_META.files = res.filesCount || 0;
    TOP40_MERGE_META.years = res.years || null;

    if (res.ok && Array.isArray(res.merged) && res.merged.length) {
      DB.moments = DB.moments.concat(res.merged);

      console.log(
        `[musicKnowledge] Top40Weekly Top 100 merge: dir=${top40DirAbs} files=${TOP40_MERGE_META.files} added=${res.added} (skippedFiles=${res.skippedFiles}, emptyFiles=${res.emptyFiles}, rowsSkipped=${res.rowsSkipped}) years=${res.years || "?–?"}`
      );
    } else {
      console.log(
        `[musicKnowledge] Top40Weekly Top 100 merge: dir=${top40DirAbs} added=0 (skippedFiles=${res.skippedFiles}, emptyFiles=${res.emptyFiles}, rowsSkipped=${res.rowsSkipped}) years=${res.years || "?–?"}`
      );
    }
  }

  buildIndexes();

  console.log(
    `[musicKnowledge] Loaded ${STATS.moments} moments (years ${STATS.yearMin ?? "?"}–${STATS.yearMax ?? "?"}) charts=${STATS.charts.length}`
  );

  if (STATS.charts.includes(TOP40_CHART)) {
    console.log(
      `[musicKnowledge] Top40Weekly Top 100 present: ${TOP40_MERGE_META.rows} rows (dir=${TOP40_MERGE_META.dir})`
    );
  }

  console.log(`[musicKnowledge] ${MK_VERSION}`);

  return DB;
}

function STATS_FN() {
  getDb();
  return { ...STATS };
}

// =============================
// POOLS (OUTPUT-GUARANTEED NORMALIZATION)
// =============================
function poolForYear(year, chart = null) {
  getDb();
  const y = Number(year);
  if (!Number.isFinite(y)) return [];
  const c = chart ? normalizeChart(chart) : null;

  const base = !c ? (BY_YEAR.get(y) || []) : (BY_YEAR_CHART.get(`${y}|${c}`) || []);

  // Always return normalized copies
  return base.map(normalizedCopy);
}

function getYearChartCount(year, chart) {
  getDb();
  const y = Number(year);
  if (!Number.isFinite(y)) return 0;
  const c = chart ? normalizeChart(chart) : null;
  if (!c) return (BY_YEAR.get(y) || []).length;
  return (BY_YEAR_CHART.get(`${y}|${c}`) || []).length;
}

function hasYearChart(year, chart) {
  return getYearChartCount(year, chart) > 0;
}

function getFallbackChartForRequest(requestedChart) {
  if (!ENABLE_CHART_FALLBACK) return null;
  const req = normalizeChart(requestedChart || "");
  if (!req) return null;

  if (req === TOP40_CHART) return normalizeChart(FALLBACK_CHART);
  return null;
}

function pickRandom(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)] || null;
}

// =============================
// PICKERS
// =============================
function pickRandomByYear(year, chart = null) {
  const pool = poolForYear(year, chart);
  return pool.length ? pickRandom(pool) : null;
}

function pickRandomByYearWithMeta(year, chart = null) {
  getDb();

  const requestedChart = chart ? normalizeChart(chart) : null;

  const requestedPool = poolForYear(year, requestedChart);
  if (requestedChart && requestedPool.length) {
    return {
      moment: pickRandom(requestedPool),
      meta: {
        year: Number(year),
        requestedChart,
        usedChart: requestedChart,
        usedFallback: false,
        strategy: "requested",
        poolSize: requestedPool.length,
      },
    };
  }

  const fb = getFallbackChartForRequest(requestedChart);
  if (fb) {
    const fbPool = poolForYear(year, fb);
    if (fbPool.length) {
      return {
        moment: pickRandom(fbPool),
        meta: {
          year: Number(year),
          requestedChart,
          usedChart: fb,
          usedFallback: true,
          strategy: "fallbackChart",
          poolSize: fbPool.length,
        },
      };
    }
  }

  const top40Pool = poolForYear(year, TOP40_CHART);
  if (top40Pool.length) {
    return {
      moment: pickRandom(top40Pool),
      meta: {
        year: Number(year),
        requestedChart,
        usedChart: TOP40_CHART,
        usedFallback: requestedChart !== TOP40_CHART,
        strategy: "top40Backup",
        poolSize: top40Pool.length,
      },
    };
  }

  const anyPool = poolForYear(year, null);
  if (anyPool.length) {
    const usedChart = anyPool[0]?.chart || null;
    return {
      moment: pickRandom(anyPool),
      meta: {
        year: Number(year),
        requestedChart,
        usedChart,
        usedFallback: true,
        strategy: "anyChart",
        poolSize: anyPool.length,
      },
    };
  }

  return {
    moment: null,
    meta: {
      year: Number(year),
      requestedChart,
      usedChart: null,
      usedFallback: false,
      strategy: "none",
      poolSize: 0,
    },
  };
}

// =============================
// TOP BY YEAR
// =============================
function getTopByYear(year, chart = DEFAULT_CHART, limit = 10) {
  const bucket = poolForYear(year, chart); // already normalized copies
  if (!bucket.length) return [];

  const ranked = bucket.filter((m) => toInt(m.rank) != null);
  if (ranked.length) {
    ranked.sort((a, b) => {
      const ar = toInt(a.rank);
      const br = toInt(b.rank);
      if (ar != null && br != null && ar !== br) return ar - br;
      return 0;
    });

    return ranked.slice(0, Math.max(1, Number(limit) || 10));
  }

  const copy = bucket.slice();
  copy.sort((a, b) => norm(a.artist).localeCompare(norm(b.artist)));
  return copy.slice(0, Math.max(1, Number(limit) || 10));
}

function getNumberOneByYear(year, chart = DEFAULT_CHART) {
  const top = getTopByYear(year, chart, 1);
  if (top && top.length) return top[0];
  return null;
}

// =============================
// DETECTION HELPERS (minimal)
// =============================
function detectYearFromText(text) {
  const t = String(text || "");
  const m = t.match(/\b(19[0-9]{2}|20[0-9]{2})\b/);
  if (m) return toInt(m[1]);
  return null;
}

function detectChartFromText(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("top40weekly")) return TOP40_CHART;
  if (t.includes("billboard")) return "Billboard Hot 100";
  if (t.includes("uk")) return "UK Singles Chart";
  if (t.includes("rpm") || t.includes("canada")) return "Canada RPM";
  return null;
}

function detectArtistFromText(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  const m = t.match(/when was\s+(.+?)\s+#?1\b/i);
  if (m) return m[1].trim();
  return null;
}

function detectSongTitleFromText(text) {
  const t = String(text || "").trim();
  if (!t) return null;

  const q = t.match(/["“”']([^"“”']{2,})["“”']/);
  if (q) return q[1].trim();

  const m = t.match(/song\s*:\s*(.+)$/i);
  if (m) return m[1].trim();

  return null;
}

// =============================
// DEBUG
// =============================
function top40Coverage(fromYear = 1980, toYear = 1999) {
  getDb();
  const out = {};
  const missing = [];

  const a = Number(fromYear);
  const b = Number(toYear);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { ok: false, error: "Invalid year range", counts: {}, missing: [] };
  }

  const start = Math.min(a, b);
  const end = Math.max(a, b);

  for (let y = start; y <= end; y++) {
    const n = getYearChartCount(y, TOP40_CHART);
    out[y] = n;
    if (!n) missing.push(y);
  }

  return { ok: true, chart: TOP40_CHART, counts: out, missing };
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

  poolForYear,
  getYearChartCount,
  hasYearChart,

  pickRandomByYear,
  pickRandomByYearWithMeta,

  getTopByYear,
  getNumberOneByYear,

  top40Coverage,
};
