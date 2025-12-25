"use strict";

/**
 * musicKnowledge.js — Bulletproof V2.26 (Music Flow V1: Top 10 correctness + #1 only + chart routing)
 *
 * Primary goals:
 * - Load base music moments DB reliably (Render/Windows safe)
 * - Optional merge of Top40Weekly Top 100 (1980–1999) from Data/top40weekly
 * - Deterministic drift repair for Top40Weekly ingest issues (front-spill + tail-spill)
 * - Provide stable helpers for index.js orchestration:
 *    - pickRandomByYearWithMeta()
 *    - getTopByYear()
 *    - getNumberOneByYear()
 *    - detection helpers (year/chart/artist/title)
 *
 * Env:
 * - MUSIC_DB_PATH=/abs/or/relative/path.json  (force one DB)
 * - DB_CANDIDATES=Data/a.json,Data/b.json    (candidate list)
 * - DATA_DIR=/abs/path/to/Data              (optional)
 * - MERGE_TOP40WEEKLY=true|false            (default true if dir exists)
 * - MUSIC_ENABLE_CHART_FALLBACK=1|0         (default 1)
 * - MUSIC_FALLBACK_CHART="Billboard Hot 100" (default Billboard Hot 100)
 */

const fs = require("fs");
const path = require("path");

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

// conservative “namey” heuristic (helps move Kenny/Van/Lionel etc.)
function isNameyToken(tok) {
  const t = _asText(tok);
  if (!t) return false;
  if (!/^[A-Za-z][A-Za-z'.-]*,?$/.test(t)) return false;
  const low = t.toLowerCase().replace(/,$/, "");
  if (["and", "of", "the", "a", "an", "to", "in", "on", "with"].includes(low)) return false;
  return t[0] === t[0].toUpperCase();
}

function normalizeChart(chart) {
  const c = String(chart || DEFAULT_CHART).trim();
  if (c === "Top40Weekly") return TOP40_CHART;
  return c || DEFAULT_CHART;
}

// =============================
// DRIFT REPAIR (Top40Weekly ingest)
// =============================

// Known deterministic repairs (zero-risk)
function hardFixKnownCorruptions(m) {
  const year = Number(m.year);
  const rank = toRank(m.rank);

  let artist = _asText(m.artist);
  let title = _asText(m.title);

  // 1989 corruptions you saw
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

  // Whitesnake example (1988)
  if (year === 1988 && /^Love Whitesnake$/i.test(artist) && /^Is This$/i.test(title)) {
    artist = "Whitesnake";
    title = "Is This Love";
  }

  // 1984 common corruptions (Top40Weekly)
  // 1. Cry Prince — When Doves  => Prince — When Doves Cry
  if (year === 1984 && rank === 1 && /^Cry Prince$/i.test(artist) && /^When Doves$/i.test(title)) {
    artist = "Prince";
    title = "When Doves Cry";
  }

  // 8. Heart Yes — Owner of a Lonely  => Yes — Owner of a Lonely Heart
  if (year === 1984 && rank === 8 && /^Heart Yes$/i.test(artist) && /^Owner of a Lonely$/i.test(title)) {
    artist = "Yes";
    title = "Owner of a Lonely Heart";
  }

  // 4. Loggins — Footloose Kenny => Kenny Loggins — Footloose
  if (year === 1984 && rank === 4 && /^Loggins$/i.test(artist) && /^Footloose Kenny$/i.test(title)) {
    artist = "Kenny Loggins";
    title = "Footloose";
  }

  // 6. Halen — Jump Van => Van Halen — Jump
  if (year === 1984 && rank === 6 && /^Halen$/i.test(artist) && /^Jump Van$/i.test(title)) {
    artist = "Van Halen";
    title = "Jump";
  }

  // 7. Richie — Hello Lionel => Lionel Richie — Hello
  if (year === 1984 && rank === 7 && /^Richie$/i.test(artist) && /^Hello Lionel$/i.test(title)) {
    artist = "Lionel Richie";
    title = "Hello";
  }

  // 9. Jr. — Ghostbusters Ray Parker, => Ray Parker, Jr. — Ghostbusters
  if (year === 1984 && rank === 9 && /^Jr\.$/i.test(artist) && /^Ghostbusters Ray Parker,/i.test(title)) {
    artist = "Ray Parker, Jr.";
    title = "Ghostbusters";
  }

  // 3. Michael Jackson — Say Say Say Paul Mc Cartney and => Paul McCartney and Michael Jackson — Say Say Say
  if (
    year === 1984 &&
    rank === 3 &&
    /^Michael Jackson$/i.test(artist) &&
    /^Say Say Say Paul Mc Cartney and$/i.test(title)
  ) {
    artist = "Paul McCartney and Michael Jackson";
    title = "Say Say Say";
  }

  m.artist = artist;
  m.title = title;
  return m;
}

// Generic front-spill repair:
// artist is 2 tokens like "Cry Prince" / "Heart Yes" where token[0] belongs to title end.
function repairTwoTokenArtistFrontSpill(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const aParts = artist.split(/\s+/).filter(Boolean);
  if (aParts.length !== 2) return m;

  const spill = aParts[0];
  const candidateArtist = aParts[1];

  const titleTokens = title.split(/\s+/).filter(Boolean);
  const titleLooksTruncated =
    titleTokens.length <= 3 ||
    (titleTokens.length <= 4 && isTitleHangWord(titleTokens[titleTokens.length - 1]));

  // conservative gate: spill must look like a plausible “last word of title”
  // and candidateArtist must look like a plausible one-word artist (capitalized)
  const spillLooksPlausible = spill.length >= 2 && spill[0] === spill[0].toUpperCase();
  const artistLooksPlausible = candidateArtist[0] === candidateArtist[0].toUpperCase();

  if (titleLooksTruncated && spillLooksPlausible && artistLooksPlausible) {
    m.artist = candidateArtist;
    m.title = `${title} ${spill}`.trim();
  }

  return m;
}

// Generic tail-spill repair:
// title ends with a name token(s) that should be attached to artist.
// Examples:
//  - "Loggins" + "Footloose Kenny" -> "Kenny Loggins" + "Footloose"
//  - "Richie" + "Hello Lionel" -> "Lionel Richie" + "Hello"
//  - "Halen" + "Jump Van" -> "Van Halen" + "Jump"
//  - "Jr." + "Ghostbusters Ray Parker," -> "Ray Parker, Jr." + "Ghostbusters"
function repairTitleTailIntoArtist(m) {
  let artist = _asText(m.artist);
  let title = _asText(m.title);

  const tParts = title.split(/\s+/).filter(Boolean);
  if (tParts.length < 2) return m;

  // try moving last 1..3 tokens
  for (let k = 3; k >= 1; k--) {
    if (tParts.length < k + 1) continue; // keep at least 1 token for title head

    const tail = tParts.slice(-k);
    const head = tParts.slice(0, -k);

    // gates: tail tokens should look name-like; head should not end in a hang-word
    if (!tail.every(isNameyToken)) continue;
    if (!head.length) continue;
    if (isTitleHangWord(head[head.length - 1])) continue;

    // special case: if artist is "Jr." and tail looks like "Ray Parker," -> build "Ray Parker, Jr."
    if (/^Jr\.?$/i.test(artist) && k >= 2) {
      const newArtist = `${tail.join(" ")} ${artist}`.replace(/\s+/g, " ").trim();
      m.artist = newArtist;
      m.title = head.join(" ").trim();
      return m;
    }

    // general: prepend tail to artist (first-name handling)
    // If tail already contains "and" or punctuation weirdness, skip (too risky)
    if (tail.some((x) => /^and$/i.test(x))) continue;

    const newArtist = `${tail.join(" ")} ${artist}`.replace(/\s+/g, " ").trim();
    m.artist = newArtist;
    m.title = head.join(" ").trim();
    return m;
  }

  return m;
}

function normalizeMomentFields(m) {
  if (!m || typeof m !== "object") return m;

  // basic trim
  m.artist = _asText(m.artist);
  m.title = _asText(m.title);

  // deterministic first
  hardFixKnownCorruptions(m);

  // generic repairs (order matters)
  repairTwoTokenArtistFrontSpill(m);
  repairTitleTailIntoArtist(m);

  // final trim
  m.artist = _asText(m.artist);
  m.title = _asText(m.title);
  return m;
}

// =============================
// DB LOADING
// =============================
function resolveDataDir() {
  if (DATA_DIR_ENV) return path.isAbsolute(DATA_DIR_ENV) ? DATA_DIR_ENV : path.resolve(process.cwd(), DATA_DIR_ENV);
  // repo root is one level above Utils/
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
    const moments = Array.isArray(data?.moments) ? data.moments : Array.isArray(data) ? data : [];
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
  // 4-digit year
  let m = base.match(/(19[0-9]{2}|20[0-9]{2})/);
  if (m) return toInt(m[1]);

  // 2-digit year (80-99 => 1980-1999)
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

  // common nesting
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

  // sometimes swapped keys
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
    } catch (e) {
      skippedFiles++;
      continue;
    }

    // locate rows array
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

      const m = normalizeMomentFields({
        year,
        chart: TOP40_CHART,
        rank: r,
        artist,
        title,
      });

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

  // sort chart buckets by rank when available (helps Top 10 / #1)
  for (const [k, arr] of BY_YEAR_CHART.entries()) {
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

  // Merge Top40Weekly
  const top40DirAbs = resolveRepoPath(TOP40_DIR_DEFAULT);
  const shouldMerge = MERGE_TOP40WEEKLY && dirExists(top40DirAbs);

  if (shouldMerge) {
    const res = readTop40WeeklyDir(top40DirAbs);
    if (res.ok && Array.isArray(res.merged) && res.merged.length) {
      // append merged moments
      DB.moments = DB.moments.concat(res.merged);

      console.log(
        `[musicKnowledge] Top40Weekly Top 100 merge: dir=${top40DirAbs} files=${fs
          .readdirSync(top40DirAbs)
          .filter((x) => /\.json$/i.test(x)).length} added=${res.added} (skippedFiles=${res.skippedFiles}, emptyFiles=${res.emptyFiles}, rowsSkipped=${res.rowsSkipped}) years=${res.years || "?–?"}`
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
      `[musicKnowledge] Top40Weekly Top 100 present: ${getYearChartCount(STATS.yearMin || 0, TOP40_CHART) !== null ? BY_YEAR_CHART.size : 0} rows (dir=${top40DirAbs})`
    );
  }

  return DB;
}

function STATS_FN() {
  getDb();
  return { ...STATS };
}

// =============================
// POOLS
// =============================
function poolForYear(year, chart = null) {
  getDb();
  const y = Number(year);
  if (!Number.isFinite(y)) return [];
  const c = chart ? normalizeChart(chart) : null;

  if (!c) return BY_YEAR.get(y) || [];
  return BY_YEAR_CHART.get(`${y}|${c}`) || [];
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

  // If user asks Top40Weekly and it’s missing, fall back to configured chart.
  if (req === TOP40_CHART) return normalizeChart(FALLBACK_CHART);
  return null;
}

function pickRandom(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)] || null;
}

// =============================
// PICKERS (Moments)
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
// TOP BY YEAR (Top 10 / #1)
// =============================
function getTopByYear(year, chart = DEFAULT_CHART, limit = 10) {
  const bucket = poolForYear(year, chart);
  if (!bucket.length) return [];

  // Prefer rank 1..limit (Top40Weekly should carry rank)
  const ranked = bucket.filter((m) => toInt(m.rank) != null);
  if (ranked.length) {
    ranked.sort((a, b) => {
      const ar = toInt(a.rank);
      const br = toInt(b.rank);
      if (ar != null && br != null && ar !== br) return ar - br;
      return 0;
    });

    // If ranks are fully present (1..100), slice the first N
    return ranked.slice(0, Math.max(1, Number(limit) || 10));
  }

  // fallback: deterministic-ish subset (not ideal, but stable)
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
// DETECTION HELPERS (lightweight)
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

// These are intentionally minimal. Your orchestrator can do heavier intent parsing.
function detectArtistFromText(text) {
  const t = String(text || "").trim();
  if (!t) return null;

  // e.g. "When was Madonna #1?" -> Madonna
  const m = t.match(/when was\s+(.+?)\s+#?1\b/i);
  if (m) return m[1].trim();

  return null;
}

function detectSongTitleFromText(text) {
  const t = String(text || "").trim();
  if (!t) return null;

  // e.g. "song: Like a Prayer" or quotes
  const q = t.match(/["“”']([^"“”']{2,})["“”']/);
  if (q) return q[1].trim();

  const m = t.match(/song\s*:\s*(.+)$/i);
  if (m) return m[1].trim();

  return null;
}

// =============================
// DEBUG HELPERS
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

  // detection
  detectYearFromText,
  detectChartFromText,
  detectArtistFromText,
  detectSongTitleFromText,

  // pools + pickers
  poolForYear,
  getYearChartCount,
  hasYearChart,

  pickRandomByYear,
  pickRandomByYearWithMeta,

  // Top 10 / #1
  getTopByYear,
  getNumberOneByYear,

  // debug
  top40Coverage,
};
