<<<<<<< Updated upstream
"use strict";

/**
 * Utils/musicKnowledge.js — v2.33
 *
 * Goals:
 * - Load your master DB (layer2_plus500 etc.)
 * - Merge Top40Weekly Top 100 yearly dumps (Data/top40weekly/*.json)
 * - Provide deterministic helpers for Nyx: getTopByYear, getNumberOneByYear, pickRandomByYearWithMeta
 * - Normalize Top40Weekly drift globally (ALL years), not year-by-year:
 *   - Protect real "&" collabs (Diana Ross & Lionel Richie)
 *   - Fix short-title/artist-long flips (Kim Carnes, REO Speedwagon)
 *   - Fix embedded title-words stuck in artist (Kiss on My List → Hall & Oates)
 *   - Canonicalize key ampersand acts (Kool & The Gang, Hall & Oates), strip stray "List "
 */

const fs = require("fs");
const path = require("path");

// =============================
// VERSION
// =============================
const MK_VERSION =
  "musicKnowledge v2.33 (Top40Weekly global drift repairs: ampersand-act protection + stronger short-title extraction + Hall&Oates/Kool fixes)";

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
 * CRITICAL: blank -> null (prevents Number(undefined) => NaN, but also prevents "0" mistakes)
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
  if (!/^[A-Za-z][A-Za-z'.-]*,?$/.test(t)) return false;
  const low = t.toLowerCase().replace(/,$/, "");
  if (["and", "of", "the", "a", "an", "to", "in", "on", "with"].includes(low))
    return false;
  return t[0] === t[0].toUpperCase();
}

function looksLikeTwoTokenPersonName(a, b) {
  if (!a || !b) return false;
  return isNameyToken(a) && isNameyToken(b);
}

function looksLikeAmpersandAct(tokens) {
  // e.g. ["Diana","Ross","&","Lionel","Richie"] or ["Hall","&","Oates"]
  if (!Array.isArray(tokens) || tokens.length < 3) return false;
  const idx = tokens.indexOf("&");
  if (idx <= 0 || idx >= tokens.length - 1) return false;
  const left = tokens.slice(0, idx).filter(isNameyToken);
  const right = tokens.slice(idx + 1).filter(isNameyToken);
  return left.length >= 1 && right.length >= 1;
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
  "Over",
  "Like",
  "Just",
]);

function hardFixKnownCorruptions(m) {
  const year = Number(m.year);
  const rank = toRank(m.rank);

  let artist = _asText(m.artist);
  let title = _asText(m.title);

  // 1984 Top40Weekly failsafes
  if (
    year === 1984 &&
    rank === 1 &&
    /^Doves Cry Prince$/i.test(artist) &&
    /^When$/i.test(title)
  ) {
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
  if (
    year === 1984 &&
    rank === 8 &&
    /^Heart Yes$/i.test(artist) &&
    /^Owner of a Lonely$/i.test(title)
  ) {
    artist = "Yes";
    title = "Owner of a Lonely Heart";
  }
  if (
    year === 1984 &&
    rank === 10 &&
    /^Chameleon Culture Club$/i.test(artist) &&
    /^Karma$/i.test(title)
  ) {
    artist = "Culture Club";
    title = "Karma Chameleon";
  }

  m.artist = artist;
  m.title = title;
  return m;
}

/**
 * Global repair: title short (<=3 tokens) and artist long (>=3 tokens)
 * - Protect real ampersand acts (Diana Ross & Lionel Richie)
 * - Otherwise assume act core is at end (Kim Carnes, REO Speedwagon)
 */
function repairTitleShortArtistLong(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const tParts = title.split(/\s+/).filter(Boolean);
  const aParts = artist.split(/\s+/).filter(Boolean);

  if (tParts.length > 3) return m;
  if (aParts.length < 3) return m;

  // Ampersand-act protection: move title-ish tokens out but keep act intact
  if (aParts.includes("&") && looksLikeAmpersandAct(aParts)) {
    const kept = [];
    const moved = [];

    for (const tok of aParts) {
      const low = tok.toLowerCase().replace(/,$/, "");
      if (low === "&" || low === "and" || low === "the") {
        kept.push(tok);
        continue;
      }
      if (TITLE_PREFIX_CANDIDATES.has(tok) && tParts.length <= 3) moved.push(tok);
      else kept.push(tok);
    }

    if (moved.length && looksLikeAmpersandAct(kept)) {
      m.artist = kept.join(" ").replace(/\s+/g, " ").trim();
      m.title = `${title} ${moved.join(" ")}`.replace(/\s+/g, " ").trim();
    }
    return m;
  }

  // Core-from-end extraction
  let coreLen = 1;
  const last = aParts[aParts.length - 1];
  const prev = aParts[aParts.length - 2];

  if (BAND_SUFFIXES.has(last)) coreLen = 2;
  else if (looksLikeTwoTokenPersonName(prev, last)) coreLen = 2;
  else if (isNameyToken(prev) && isNameyToken(last)) coreLen = 2;

  const coreTokens = aParts.slice(-coreLen);
  const spillTokens = aParts.slice(0, -coreLen);

  if (!coreTokens.length || !spillTokens.length) return m;

  m.artist = coreTokens.join(" ").trim();
  m.title = `${title} ${spillTokens.join(" ")}`.replace(/\s+/g, " ").trim();
  return m;
}

/**
 * Repair: leading title-word stuck in artist
 * Example: "You REO Speedwagon" + "Keep on Loving" => "REO Speedwagon" — "Keep on Loving You"
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
 * Repair: two-token artist spill (rare but seen)
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

  if (norm(title).includes(norm(spill))) return m;

  if (spill[0] !== spill[0].toUpperCase()) return m;
  if (candidateArtist[0] !== candidateArtist[0].toUpperCase()) return m;

  m.artist = candidateArtist;
  m.title = `${title} ${spill}`.replace(/\s+/g, " ").trim();
  return m;
}

/**
 * Repair: move tail tokens from title into artist (handles "Say Paul Mc Cartney and Michael" variants)
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
 * Repair: move title-like tokens embedded ANYWHERE in artist into title (only when title is short)
 */
function repairEmbeddedTitleWordsInArtistAnywhere(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const aParts = artist.split(/\s+/).filter(Boolean);
  const tParts = title.split(/\s+/).filter(Boolean);

  if (aParts.length < 2) return m;
  if (tParts.length > 3) return m;

  const moved = [];
  const kept = [];

  for (const tok of aParts) {
    const low = tok.toLowerCase().replace(/,$/, "");

    // Never move connectors/articles
    if (low === "&" || low === "and" || low === "the") {
      kept.push(tok);
      continue;
    }

    if (TITLE_PREFIX_CANDIDATES.has(tok) && tParts.length <= 3) {
      moved.push(tok);
      continue;
    }

    kept.push(tok);
  }

  if (!moved.length) return m;

  const keptMeaningful = kept.filter((x) => {
    const low = x.toLowerCase().replace(/,$/, "");
    return low !== "&" && low !== "and" && low !== "the";
  });

  if (keptMeaningful.length < 2 && !kept.includes("&")) return m;

  m.artist = kept.join(" ").replace(/\s+/g, " ").trim();
  m.title = `${title} ${moved.join(" ")}`.replace(/\s+/g, " ").trim();
  return m;
}

/**
 * Canonicalize high-frequency ampersand acts; strip leading "List " before matching
 */
function canonicalizeAmpersandActs(m) {
  let artist = _asText(m.artist);
  if (!artist) return m;

  const a = artist
    .replace(/\s+/g, " ")
    .replace(/\s*&\s*/g, " & ")
    .trim();

  const cleaned = a.replace(/^\bList\b\s+/i, "").trim();

  // Kool & The Gang variants
  if (
    /^the gang & kool$/i.test(cleaned) ||
    /^the gang & kool,?$/i.test(cleaned) ||
    /^kool & the gang$/i.test(cleaned) ||
    /^kool & the gang,?$/i.test(cleaned)
  ) {
    m.artist = "Kool & The Gang";
    return m;
  }

  // Hall & Oates variants
  if (/^oates & hall$/i.test(cleaned) || /^oates & hall,?$/i.test(cleaned)) {
    m.artist = "Hall & Oates";
    return m;
  }
  if (/^hall & oates$/i.test(cleaned) || /^hall & oates,?$/i.test(cleaned)) {
    m.artist = "Hall & Oates";
    return m;
  }

  m.artist = cleaned;
  return m;
}

/**
 * Normalize artist/title fields for Top40Weekly and any downstream use.
 */
function normalizeMomentFields(m) {
  if (!m || typeof m !== "object") return m;

  m.artist = decodeHtmlEntities(_asText(m.artist));
  m.title = decodeHtmlEntities(_asText(m.title));

  // Order matters
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
 * Output-guaranteed normalization: always return a normalized COPY
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
  return toRank(
    row.rank ?? row.Rank ?? row.position ?? row.pos ?? row.number ?? row.no
  );
}

function extractArtistTitleFromRow(row) {
  if (!row || typeof row !== "object") return { artist: "", title: "" };

  let artist = _asText(
    row.artist ?? row.Artist ?? row.performer ?? row.Performer ?? row.act ?? row.Act
  );
  let title = _asText(row.title ?? row.Title ?? row.song ?? row.Song ?? row.track ?? row.Track);

  if (!artist && row.name && row.by) {
    title = _asText(row.name);
    artist = _asText(row.by);
  }

  return { artist, title };
}

function readTop40WeeklyDir(top40DirAbs) {
  if (!dirExists(top40DirAbs)) {
    return {
      ok: false,
      merged: [],
      added: 0,
      skippedFiles: 0,
      emptyFiles: 0,
      rowsSkipped: 0,
      years: null,
      filesCount: 0,
    };
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
    const m = normalizeMomentFields(raw);

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

  const base = !c
    ? BY_YEAR.get(y) || []
    : BY_YEAR_CHART.get(`${y}|${c}`) || [];

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
  const bucket = poolForYear(year, chart);
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
=======
"use strict";

/**
 * musicKnowledge.js — Bulletproof V2.15
 *
 * Based on V2.14. :contentReference[oaicite:1]{index=1}
 *
 * V2.15 upgrades (content/merge hardening):
 * - Case-sensitive-safe Top40Weekly folder discovery (Render/Linux).
 * - Stronger Top40Weekly merge diagnostics: folder used, years found, missing years warnings.
 * - Adds top40Coverage(fromYear,toYear) for quick verification.
 *
 * Env:
 * - MUSIC_ENABLE_CHART_FALLBACK=1 (default)  -> enable smart fallback
 * - MUSIC_FALLBACK_CHART=Billboard Hot 100   -> fallback chart (default Billboard Hot 100)
 * - MERGE_TOP40WEEKLY=1 (default)            -> merge Top40Weekly Top 100 data files
 * - MUSIC_DB_HOT_RELOAD=1                    -> reload db when file changes (dev)
 * - MUSIC_DB_PATH=/abs/or/relative/path.json -> explicit DB path
 * - MUSIC_DB_CANDIDATES=path1,path2,...      -> candidate list
 */

const fs = require("fs");
const path = require("path");

// =============================
// CONFIG (env)
// =============================
const ENV_DB_PATH = String(process.env.MUSIC_DB_PATH || "").trim();
const ENV_DB_CANDIDATES = String(process.env.MUSIC_DB_CANDIDATES || "").trim();

const MERGE_TOP40WEEKLY = String(process.env.MERGE_TOP40WEEKLY || "1") !== "0";
const HOT_RELOAD = String(process.env.MUSIC_DB_HOT_RELOAD || "") === "1";

const ENABLE_CHART_FALLBACK = String(process.env.MUSIC_ENABLE_CHART_FALLBACK || "1") !== "0";
const FALLBACK_CHART =
  String(process.env.MUSIC_FALLBACK_CHART || "Billboard Hot 100").trim() || "Billboard Hot 100";

// Repo defaults
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

// Top40Weekly merge folder (canonical)
const TOP40_DIR = "Data/top40weekly";
const TOP40_CHART = "Top40Weekly Top 100";

// =============================
// PATHING (Render-safe)
// =============================
const REPO_ROOT = path.resolve(__dirname, ".."); // repo root (where Data/ lives)

function resolveRepoPath(p) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  return path.resolve(REPO_ROOT, p);
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

function stripBom(s) {
  return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function readJsonFile(absPath) {
  const raw = stripBom(fs.readFileSync(absPath, "utf8"));
  return JSON.parse(raw);
}

function toInt(x) {
  const n = Number(String(x ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// =============================
// CHART NORMALIZATION
// =============================
function normalizeChart(chart) {
  const c = String(chart || "").trim();
  if (!c) return DEFAULT_CHART;

  const lc = c.toLowerCase();

  if (lc.includes("top40weekly") && (lc.includes("top 100") || lc.includes("top100") || lc.includes("year"))) {
    return TOP40_CHART;
  }

  if (lc.includes("billboard") || lc.includes("hot 100") || lc.includes("hot100")) return "Billboard Hot 100";
  if (lc.includes("uk") && lc.includes("single")) return "UK Singles Chart";
  if (lc.includes("canada") || lc.includes("rpm")) return "Canada RPM";
  if (lc.includes("top40weekly")) return "Top40Weekly";

  if (c === TOP40_CHART || c === "Top40Weekly" || c === "Billboard Hot 100" || c === "UK Singles Chart" || c === "Canada RPM") {
    return c;
  }

  return c;
}

// =============================
// NORMALIZATION (moment)
// =============================
function normalizeMoment(raw, forcedYear = null, forcedChart = null) {
  if (!raw || typeof raw !== "object") return null;

  const artist = String(raw.artist ?? raw.artist_name ?? raw.performer ?? raw.band ?? raw.act ?? "").trim();
  const title = String(raw.title ?? raw.song_title ?? raw.song ?? raw.track ?? raw.track_title ?? raw.name ?? "").trim();

  const year = toInt(raw.year) ?? (forcedYear != null ? toInt(forcedYear) : null);
  const chart = normalizeChart(forcedChart ?? raw.chart ?? DEFAULT_CHART);

  if (!artist || !title || !year) return null;

  const peak = toInt(raw.peak) ?? toInt(raw.rank) ?? null;
  const weeks = toInt(raw.weeks_on_chart) ?? toInt(raw.weeks) ?? null;

  return {
    artist,
    title,
    year,
    chart,

    rank: toInt(raw.rank),
    peak: peak,
    weeks_on_chart: weeks,
    is_number_one: raw.is_number_one === true || peak === 1 || raw.rank === 1,

    fact: String(raw.fact || "").trim(),
    culture: String(raw.culture || "").trim(),
    next: String(raw.next || "").trim(),

    _na: norm(artist),
    _nt: norm(title)
  };
}

// =============================
// INTERNAL STATE + INDEXES
// =============================
let DB = null;
let DB_PATH_RESOLVED = null;
let DB_MTIME_MS = 0;
let LOADED = false;

let MOMENTS = [];

let BY_YEAR = new Map(); // year -> moments[]
let BY_YEAR_CHART = new Map(); // `${year}|${chart}` -> moments[]
let BY_ARTIST_TITLE = new Map(); // `${_na}|${_nt}` -> years Set

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

function resolveDbPath() {
  if (ENV_DB_PATH) {
    const abs = resolveRepoPath(ENV_DB_PATH);
    if (fileExists(abs)) return abs;
  }

  const envCands = parseCandidatesEnv(ENV_DB_CANDIDATES).map(resolveRepoPath);
  for (const abs of envCands) {
    if (fileExists(abs)) return abs;
  }

  const preferred = resolveRepoPath(PREFERRED_DEFAULT_DB);
  if (fileExists(preferred)) return preferred;

  for (const rel of DEFAULT_DB_CANDIDATES) {
    const abs = resolveRepoPath(rel);
    if (fileExists(abs)) return abs;
  }

  return null;
}

// =============================
// TOP40WEEKLY DIR DISCOVERY (case-safe)
// =============================
function resolveTop40DirAbs() {
  // 1) canonical expected folder
  const canonical = resolveRepoPath(TOP40_DIR);
  if (dirExists(canonical)) return canonical;

  // 2) scan Data/ for a folder named "top40weekly" in any casing
  const dataDir = resolveRepoPath("Data");
  if (!dirExists(dataDir)) return null;

  try {
    const entries = fs.readdirSync(dataDir, { withFileTypes: true });
    const match = entries.find((e) => e.isDirectory() && String(e.name).toLowerCase() === "top40weekly");
    if (match) return path.join(dataDir, match.name);
  } catch {
    // ignore
  }

  // 3) last resort: common casing variants
  const variants = ["Data/Top40Weekly", "Data/TOP40WEEKLY", "Data/Top40weekly", "Data/top40Weekly"];
  for (const v of variants) {
    const abs = resolveRepoPath(v);
    if (dirExists(abs)) return abs;
  }

  return null;
}

// =============================
// TOP40WEEKLY MERGE
// =============================
function mergeTop40Weekly(moments, seenKeys) {
  if (!MERGE_TOP40WEEKLY) return { added: 0, files: 0, skipped: 0, emptySkipped: 0, dir: null, years: [] };

  const dirAbs = resolveTop40DirAbs();
  if (!dirAbs) {
    console.log(`[musicKnowledge] Top40Weekly merge: directory not found (checked casing variants). Expected: ${resolveRepoPath(TOP40_DIR)}`);
    return { added: 0, files: 0, skipped: 0, emptySkipped: 0, dir: null, years: [] };
  }

  const files = fs
    .readdirSync(dirAbs)
    .filter((f) => /^top100_\d{4}\.json$/i.test(f))
    .sort();

  let added = 0;
  let skipped = 0;
  let emptySkipped = 0;

  const yearsFound = new Set();

  for (const file of files) {
    const yearMatch = file.match(/top100_(\d{4})\.json/i);
    const year = yearMatch ? Number(yearMatch[1]) : null;

    const abs = path.join(dirAbs, file);
    let json;
    try {
      json = readJsonFile(abs);
    } catch (e) {
      console.log(`[musicKnowledge] Top40Weekly merge: failed to parse ${file}: ${String(e?.message || e)}`);
      continue;
    }

    const rows = Array.isArray(json) ? json : Array.isArray(json?.moments) ? json.moments : [];
    if (!rows.length) {
      emptySkipped++;
      continue;
    }

    if (Number.isFinite(year)) yearsFound.add(year);

    for (const r of rows) {
      const m = normalizeMoment(r, year, TOP40_CHART);
      if (!m) {
        skipped++;
        continue;
      }
      const key = `${m._na}|${m._nt}|${m.year}|${m.chart}`;
      if (seenKeys.has(key)) {
        skipped++;
        continue;
      }
      seenKeys.add(key);
      moments.push(m);
      added++;
    }
  }

  const yearsList = Array.from(yearsFound).sort((a, b) => a - b);

  console.log(
    `[musicKnowledge] Top40Weekly Top 100 merge: dir=${dirAbs} files=${files.length} added=${added} (skipped=${skipped}, emptySkipped=${emptySkipped}) years=${yearsList.length ? `${yearsList[0]}–${yearsList[yearsList.length - 1]}` : "none"}`
  );

  // decade sanity warnings (your current pain point)
  const missing90s = [];
  for (let y = 1990; y <= 1999; y++) {
    if (!yearsFound.has(y)) missing90s.push(y);
  }
  if (missing90s.length) {
    console.log(`[musicKnowledge] WARNING: Top40Weekly decade gap: missing year files for 1990s => ${missing90s.join(", ")}`);
  }

  return { added, files: files.length, skipped, emptySkipped, dir: dirAbs, years: yearsList };
}

// =============================
// INDEX BUILD
// =============================
function rebuildIndexes() {
  BY_YEAR = new Map();
  BY_YEAR_CHART = new Map();
  BY_ARTIST_TITLE = new Map();

  let minYear = null;
  let maxYear = null;
  const chartSet = new Set();

  for (const m of MOMENTS) {
    const y = Number(m.year);
    if (Number.isFinite(y)) {
      if (minYear == null || y < minYear) minYear = y;
      if (maxYear == null || y > maxYear) maxYear = y;
    }
    chartSet.add(m.chart);

    if (!BY_YEAR.has(m.year)) BY_YEAR.set(m.year, []);
    BY_YEAR.get(m.year).push(m);

    const ycKey = `${m.year}|${m.chart}`;
    if (!BY_YEAR_CHART.has(ycKey)) BY_YEAR_CHART.set(ycKey, []);
    BY_YEAR_CHART.get(ycKey).push(m);

    const atKey = `${m._na}|${m._nt}`;
    if (!BY_ARTIST_TITLE.has(atKey)) BY_ARTIST_TITLE.set(atKey, new Set());
    BY_ARTIST_TITLE.get(atKey).add(m.year);
  }

  STATS = {
    moments: MOMENTS.length,
    yearMin: minYear,
    yearMax: maxYear,
    charts: Array.from(chartSet).sort()
  };
}

// =============================
// LOAD DB
// =============================
function loadDb() {
  const resolved = resolveDbPath();
  if (!resolved) {
    throw new Error(`Music DB not found. Checked MUSIC_DB_PATH, MUSIC_DB_CANDIDATES, and defaults under ${REPO_ROOT}`);
  }

  DB_PATH_RESOLVED = resolved;
  DB_MTIME_MS = fs.statSync(resolved).mtimeMs;

  const json = readJsonFile(resolved);
  const momentsRaw = Array.isArray(json) ? json : Array.isArray(json?.moments) ? json.moments : [];

  const normalized = [];
  const seen = new Set();

  for (const r of momentsRaw) {
    const m = normalizeMoment(r, null, null);
    if (!m) continue;

    const key = `${m._na}|${m._nt}|${m.year}|${m.chart}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push(m);
  }

  const mergeInfo = MERGE_TOP40WEEKLY ? mergeTop40Weekly(normalized, seen) : null;

  MOMENTS = normalized;
  rebuildIndexes();

  const possibleDupes = 0;
  console.log(`[musicKnowledge] DB validation: ${possibleDupes} possible duplicates (artist/year/chart/title).`);

  DB = { moments: MOMENTS };
  LOADED = true;

  console.log(`[musicKnowledge] Using DB: ${DB_PATH_RESOLVED}`);
  console.log(
    `[musicKnowledge] Loaded ${MOMENTS.length} moments (years ${STATS.yearMin}–${STATS.yearMax}) charts=${STATS.charts.length}`
  );

  // Extra visibility: confirm Top40 merge status at load time
  if (MERGE_TOP40WEEKLY) {
    const top40Count = MOMENTS.filter((m) => m.chart === TOP40_CHART).length;
    if (!top40Count) {
      console.log("[musicKnowledge] WARNING: Top40Weekly Top 100 count is 0 after load. This will cause 'no hit indexed' for those years.");
    } else if (mergeInfo && mergeInfo.dir) {
      console.log(`[musicKnowledge] Top40Weekly Top 100 present: ${top40Count} rows (dir=${mergeInfo.dir})`);
    } else {
      console.log(`[musicKnowledge] Top40Weekly Top 100 present: ${top40Count} rows`);
    }
  }

  return DB;
}

function maybeHotReload() {
  if (!HOT_RELOAD) return;
  if (!DB_PATH_RESOLVED) return;

  try {
    const mtime = fs.statSync(DB_PATH_RESOLVED).mtimeMs;
    if (mtime && mtime !== DB_MTIME_MS) {
      console.log("[musicKnowledge] Hot reload triggered (mtime changed). Reloading DB…");
      LOADED = false;
      loadDb();
    }
  } catch {
    // ignore
  }
}

function getDb() {
  if (!LOADED) return loadDb();
  maybeHotReload();
  return DB;
}

// =============================
// EXTRACTION HELPERS
// =============================
function extractYear(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function detectArtist(text) {
  const t = String(text || "").trim();
  if (!t) return null;

  const normalized = t.replace(/[–—]/g, "-");
  const m = normalized.match(/^(.{2,}?)\s*-\s*(.{2,}?)$/);
  if (!m) return null;

  const artist = String(m[1] || "").trim();
  if (!artist || /^\d{4}$/.test(artist)) return null;
  return artist;
}

function detectTitle(text) {
  const t = String(text || "").trim();
  if (!t) return null;

  const normalized = t.replace(/[–—]/g, "-");
  const m = normalized.match(/^(.{2,}?)\s*-\s*(.{2,}?)$/);
  if (!m) return null;

  const title = String(m[2] || "").trim();
  if (!title || /^\d{4}$/.test(title)) return null;
  return title;
}

// =============================
// QUERY HELPERS
// =============================
function getAllMoments() {
  getDb();
  return MOMENTS.slice();
}

function findYearsForArtistTitle(artist, title, chart = null) {
  getDb();
  const a = norm(artist);
  const t = norm(title);
  if (!a || !t) return [];

  const key = `${a}|${t}`;
  const set = BY_ARTIST_TITLE.get(key);
  if (!set) return [];

  let years = Array.from(set);

  if (chart) {
    const c = normalizeChart(chart);
    years = years.filter((y) => {
      const bucket = BY_YEAR_CHART.get(`${y}|${c}`);
      if (!bucket) return false;
      return bucket.some((m) => m._na === a && m._nt === t);
    });
  }

  years.sort((x, y) => x - y);
  return years;
}

function poolForYear(year, chart = null) {
  getDb();
  const y = Number(year);
  if (!Number.isFinite(y)) return [];

  if (chart) {
    const c = normalizeChart(chart);
    const bucket = BY_YEAR_CHART.get(`${y}|${c}`);
    return Array.isArray(bucket) ? bucket : [];
  }

  const bucket = BY_YEAR.get(y);
  return Array.isArray(bucket) ? bucket : [];
}

function getYearChartCount(year, chart) {
  const y = Number(year);
  if (!Number.isFinite(y)) return 0;
  const c = chart ? normalizeChart(chart) : null;
  if (!c) return poolForYear(y, null).length;

  const bucket = BY_YEAR_CHART.get(`${y}|${c}`);
  return Array.isArray(bucket) ? bucket.length : 0;
}

function hasYearChart(year, chart) {
  return getYearChartCount(year, chart) > 0;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Quick verification helper for Top40Weekly coverage (admin/debug)
function top40Coverage(fromYear = 1990, toYear = 1999) {
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
// CHART FALLBACK (V2.13+)
// =============================
function getFallbackChartForRequest(requestedChart) {
  if (!ENABLE_CHART_FALLBACK) return null;

  const req = normalizeChart(requestedChart || "");
  // Only auto-fallback when the request was explicitly Top40Weekly year-end Top 100
  if (req === TOP40_CHART) return normalizeChart(FALLBACK_CHART);
  return null;
}

// =============================
// PICKERS
// =============================
function pickRandomByYear(year, chart = null) {
  const pool = poolForYear(year, chart);
  return pool.length ? pickRandom(pool) : null;
}

function pickRandomByYearFallback(year, chart = null) {
  let best = pickRandomByYear(year, chart);
  if (best) return best;

  const fb = getFallbackChartForRequest(chart);
  if (fb) {
    best = pickRandomByYear(year, fb);
    if (best) return best;
  }

  best = pickRandomByYear(year, TOP40_CHART);
  if (best) return best;

  best = pickRandomByYear(year, null);
  return best || null;
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
        poolSize: requestedPool.length
      }
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
          poolSize: fbPool.length
        }
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
        poolSize: top40Pool.length
      }
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
        poolSize: anyPool.length
      }
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
      poolSize: 0
    }
  };
}

function pickRandomByDecade(decade, chart = null) {
  getDb();
  const d = Number(decade);
  if (!Number.isFinite(d)) return null;

  const start = d;
  const end = d + 9;
  const pool = [];

  for (let y = start; y <= end; y++) {
    const bucket = poolForYear(y, chart);
    if (bucket.length) pool.push(...bucket);
  }

  if (!pool.length) {
    const fb = getFallbackChartForRequest(chart);
    if (fb) {
      for (let y = start; y <= end; y++) {
        const bucket = poolForYear(y, fb);
        if (bucket.length) pool.push(...bucket);
      }
    }
  }

  return pool.length ? pickRandom(pool) : null;
}

function getTopByYear(year, n = 10, chart = null) {
  let pool = poolForYear(year, chart);

  if (!pool.length) {
    const fb = getFallbackChartForRequest(chart);
    if (fb) pool = poolForYear(year, fb);
  }

  if (!pool.length) return [];

  const sorted = pool
    .slice()
    .sort((a, b) => {
      const ap = Number.isFinite(a.peak) ? a.peak : 9999;
      const bp = Number.isFinite(b.peak) ? b.peak : 9999;
      if (ap !== bp) return ap - bp;

      const ar = Number.isFinite(a.rank) ? a.rank : 9999;
      const br = Number.isFinite(b.rank) ? b.rank : 9999;
      if (ar !== br) return ar - br;

      const aw = Number.isFinite(a.weeks_on_chart) ? a.weeks_on_chart : -1;
      const bw = Number.isFinite(b.weeks_on_chart) ? b.weeks_on_chart : -1;
      if (aw !== bw) return bw - aw;

      const at = a._nt.localeCompare(b._nt);
      if (at !== 0) return at;
      return a._na.localeCompare(b._na);
    });

  return sorted.slice(0, Math.max(1, Math.min(100, Number(n) || 10)));
}

// =============================
// "BEST MOMENT" (slot-based)
// =============================
function pickBestMoment(_unused, slots = {}) {
  getDb();

  const s = slots && typeof slots === "object" ? slots : {};
  const year = Number.isFinite(Number(s.year)) ? Number(s.year) : null;
  const chart = s.chart ? normalizeChart(s.chart) : null;

  const artist = s.artist ? String(s.artist).trim() : null;
  const title = s.title ? String(s.title).trim() : null;

  if (artist && title) {
    const a = norm(artist);
    const t = norm(title);

    if (year != null) {
      const bucket = poolForYear(year, chart);
      const exact = bucket.find((m) => m._na === a && m._nt === t);
      if (exact) return exact;

      const fb = getFallbackChartForRequest(chart);
      if (fb) {
        const fbBucket = poolForYear(year, fb);
        const fbExact = fbBucket.find((m) => m._na === a && m._nt === t);
        if (fbExact) return fbExact;
      }
    }

    if (chart) {
      const years = findYearsForArtistTitle(artist, title, chart);
      if (years.length) {
        const y = year != null ? year : years[0];
        const bucket = poolForYear(y, chart);
        const exact = bucket.find((m) => m._na === a && m._nt === t);
        if (exact) return exact;
      }

      const fb = getFallbackChartForRequest(chart);
      if (fb) {
        const yearsFb = findYearsForArtistTitle(artist, title, fb);
        if (yearsFb.length) {
          const y = year != null ? year : yearsFb[0];
          const bucket = poolForYear(y, fb);
          const exact = bucket.find((m) => m._na === a && m._nt === t);
          if (exact) return exact;
        }
      }
    }

    const yearsAny = findYearsForArtistTitle(artist, title, null);
    if (yearsAny.length) {
      const y = year != null ? year : yearsAny[0];
      const bucket = poolForYear(y, null);
      const exact = bucket.find((m) => m._na === a && m._nt === t);
      if (exact) return exact;
    }

    return null;
  }

  if (year != null) {
    const top = getTopByYear(year, 10, chart);
    if (top.length) {
      const num1 = top.find((m) => Number(m.peak) === 1 || Number(m.rank) === 1 || m.is_number_one === true);
      return num1 || top[0];
    }
    return pickRandomByYearFallback(year, chart);
  }

  if (MOMENTS.length) return pickRandom(MOMENTS);
  return null;
}

// =============================
// EXPORTS
// =============================
module.exports = {
  // Loader
  loadDb,
  getDb,
  loadDB: loadDb,
  db: () => getDb(),

  // Proof for /api/health or logs
  DB_PATH: () => DB_PATH_RESOLVED,
  STATS: () => ({ ...STATS }),

  // Core
  pickBestMoment,

  // Extraction
  detectArtist,
  detectTitle,
  extractYear,
  normalizeChart,

  // Query helpers
  findYearsForArtistTitle,
  getAllMoments,
  getYearChartCount,
  hasYearChart,
  top40Coverage, // NEW

  // Pickers
  pickRandomByYear,
  pickRandomByYearFallback,
  pickRandomByYearWithMeta,
  pickRandomByDecade,
  getTopByYear
};
>>>>>>> Stashed changes
