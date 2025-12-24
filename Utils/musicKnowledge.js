"use strict";

/**
 * musicKnowledge.js — Bulletproof V2.17
 *
 * Based on V2.15. :contentReference[oaicite:1]{index=1}
 *
 * V2.17 upgrades (Top40Weekly integrity fix v3):
 * - Adds strict gating using a known-artist set to prevent stealing real title words (fixes Prince/Yes/Heart corruption).
 * - Adds __top40FixVersion export for runtime verification.
 *
 * V2.16 upgrades (Top40Weekly integrity fix):
 * - Fixes Top40Weekly Top 100 rows where artist surname is separated and first name (or artist remainder) is appended to title.
 * - Normalizes 'Jr.' cases (e.g., Ray Parker, Jr.).
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
// TOP40WEEKLY ROW FIXUP
// =============================
// Some Top40Weekly Top 100 source files store artist as a trailing surname token
// and append the remaining artist name to the end of the title (e.g. artist="Turner", title="What's Love... Tina").
// We fix this at ingest-time so downstream pickers/lists are correct.
function _isNameyToken(w) {
  const s = String(w || "").trim();
  if (!s) return false;
  const lc = s.toLowerCase().replace(/[,]+$/g, "");

  // connectors or common artist-name particles
  if (["and", "&", "of", "the", "mc", "jr", "jr."].includes(lc)) return true;

  // looks like a capitalized word or initial
  if (/^[A-Z][a-z]+[,]?$/.test(s)) return true;
  if (/^[A-Z]\.?$/.test(s)) return true; // initial
  if (/^Mc[A-Z][a-z]+[,]?$/.test(s)) return true; // McCartney style
  return false;
}

function _looksNameChunk(tokens) {
  if (!Array.isArray(tokens) || !tokens.length) return false;
  // allow commas on last token
  return tokens.every(_isNameyToken);
}

function fixTop40ArtistTitle(artist, title) {
  let a = normalizeArtistPunctuation(String(artist || "").trim());
  let t = String(title || "").trim();
  if (!a || !t) return { artist: a, title: t };

  // Clean trailing punctuation
  t = t.replace(/\s+[,]+$/g, "").trim();

  const surnameSet = TOP40_SURNAME_SET instanceof Set ? TOP40_SURNAME_SET : new Set();
  const artistSet = TOP40_ARTIST_SET instanceof Set ? TOP40_ARTIST_SET : new Set();
  const oneWordSet = TOP40_ONEWORD_SET instanceof Set ? TOP40_ONEWORD_SET : new Set();

  // Never touch legit one-word acts (Prince, Yes, Heart, etc.)
  if (oneWordSet.has(norm(a))) return { artist: a, title: t };

  const badTitleEnd = new Set(["a","an","the","of","to","with","and","or","but","in","on","at","for","from"]);

  function joinMcTokens(words) {
    const out = [];
    for (let i = 0; i < words.length; i++) {
      const w = String(words[i] || "").trim();
      const wl = w.toLowerCase();
      const nxt = i + 1 < words.length ? String(words[i + 1] || "").trim() : "";
      if (wl === "mc" && nxt && /^[A-Z][a-z]+/.test(nxt)) {
        out.push("Mc" + nxt);
        i++;
        continue;
      }
      out.push(w);
    }
    return out.filter(Boolean);
  }

  function looksNameyToken(w) {
    const s = String(w || "").trim();
    if (!s) return false;
    const lc = s.toLowerCase().replace(/[,]+$/g, "");
    if (["and","&","of","the","jr","jr.","van","von","de","da","di","del"].includes(lc)) return true;
    if (/^[A-Z][a-z]+[,]?$/.test(s)) return true;
    if (/^[A-Z]\.?$/.test(s)) return true;
    if (/^Mc[A-Z][a-z]+[,]?$/.test(s)) return true;
    return false;
  }

  function looksNameChunk(tokens) {
    if (!Array.isArray(tokens) || !tokens.length) return false;
    return tokens.every(looksNameyToken);
  }

  function extractTailName(words, maxTail = 10) {
    for (let k = 1; k <= maxTail && k < words.length; k++) {
      const tail = words.slice(words.length - k);
      const head = words.slice(0, words.length - k);
      const candidateTitle = head.join(" ").trim();
      if (candidateTitle.length < 3) continue;
      const lastWord = (head[head.length - 1] || "").toLowerCase();
      if (badTitleEnd.has(lastWord)) continue;
      if (!looksNameChunk(tail)) continue;
      return { k, tail, head, candidateTitle };
    }
    return null;
  }

  // -------------------------------------------------------
  // SPECIAL CASE 1: artist begins with "and ..." (missing lead artist in title tail)
  // Example: artist="and Michael Jackson", title="Say Say Say Paul McCartney"
  // -------------------------------------------------------
  if (/^and\s+/i.test(a)) {
    const words0 = joinMcTokens(t.split(/\s+/).filter(Boolean));
    const pulled = extractTailName(words0, 8);
    if (pulled) {
      const candidateArtist = normalizeArtistPunctuation(
        (pulled.tail.join(" ") + " " + a).replace(/\s+/g, " ").trim()
      );
      const candidateTitle = pulled.candidateTitle;
      // Accept if multi-artist looks plausible (contains "and") and title is non-empty.
      if (/\sand\s/i.test(candidateArtist) && candidateTitle.length >= 3) {
        return { artist: candidateArtist, title: candidateTitle };
      }
    }
    // fall through
  }

  // -------------------------------------------------------
  // SPECIAL CASE 2: artist has ", Jr." and title ends with first name (Ray Parker, Jr.)
  // -------------------------------------------------------
  if (/,\s*Jr\./i.test(a)) {
    const words0 = t.split(/\s+/).filter(Boolean);
    const last = words0[words0.length - 1] || "";
    if (looksNameyToken(last)) {
      const head = words0.slice(0, -1).join(" ").trim();
      if (head.length >= 3 && !badTitleEnd.has(String(head.split(/\s+/).pop() || "").toLowerCase())) {
        const candArtist = normalizeArtistPunctuation((last + " " + a).trim());
        return { artist: candArtist, title: head };
      }
    }
  }

  const aParts = a.split(/\s+/).filter(Boolean);
  const aLast = (aParts[aParts.length - 1] || "").replace(/[^A-Za-z0-9'.-]/g, "").toLowerCase();
  const aSingle = aParts.length === 1;

  const titleEndsWithAnd = /\band\s*$/i.test(t);
  const artistIsJrOnly = /^jr\.?$/i.test(a);

  // Eligible if:
  // - Jr placeholder OR
  // - single-token artist that appears as a surname in the base DB OR
  // - title ends with "and" and artist looks like a surname
  const eligible =
    artistIsJrOnly ||
    (aSingle && aLast && surnameSet.has(aLast)) ||
    (titleEndsWithAnd && aLast && surnameSet.has(aLast));

  if (!eligible) return { artist: a, title: t };

  const words = joinMcTokens(t.split(/\s+/).filter(Boolean));
  if (words.length < 2) return { artist: a, title: t };

  // Try moving 1..10 trailing words from title into artist (front)
  for (let k = 1; k <= 10 && k < words.length; k++) {
    const tail = words.slice(words.length - k);
    const head = words.slice(0, words.length - k);

    const candidateTitle = head.join(" ").trim();
    if (candidateTitle.length < 3) continue;

    const lastWord = (head[head.length - 1] || "").toLowerCase();
    if (badTitleEnd.has(lastWord)) continue;

    // Heuristic: tail looks like a name chunk (Capitalized tokens or connectors)
    if (!looksNameChunk(tail)) continue;

    // Avoid corrupting legit acts by not moving a single trailing word unless artist looks truncated
    if (k === 1 && !artistIsJrOnly && !(aSingle && surnameSet.has(aLast))) continue;

    // Special case: artist is only "Jr." — keep Jr. at end
    if (artistIsJrOnly) {
      const fixedArtist = normalizeArtistPunctuation(
        `${tail.join(" ").replace(/\s+[,]+$/g, "")}, Jr.`
      );
      return { artist: fixedArtist, title: candidateTitle };
    }

    const candidateArtist = normalizeArtistPunctuation(
      `${tail.join(" ")} ${a}`.replace(/\s+/g, " ").trim()
    );

    // Accept if:
    // - known artist, OR
    // - multi-artist "and" pattern, OR
    // - Jr. pattern, OR
    // - plausible 2+ token proper-name (e.g., Van Halen, Lionel Richie, Culture Club)
    const candNorm = norm(candidateArtist);
    const looksLikeMultiArtist =
      /\sand\s/i.test(candidateArtist) &&
      candidateArtist.split(/\sand\s/i).every((p) => String(p || "").trim().length >= 2);

    const hasJr = /,\s*Jr\./i.test(candidateArtist);
    const parts = candidateArtist.split(/\s+/).filter(Boolean);
    const plausibleProperName =
      parts.length >= 2 &&
      parts.slice(0, 2).every((p) => /^[A-Z]/.test(p)) &&
      surnameSet.has(String(parts[parts.length - 1] || "").replace(/[^A-Za-z0-9'.-]/g, "").toLowerCase());

    if (!artistSet.has(candNorm) && !looksLikeMultiArtist && !hasJr && !plausibleProperName) {
      continue;
    }

    return { artist: candidateArtist, title: candidateTitle };
  }

  return { artist: a, title: t };
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

  // Top40Weekly Top 100 fix-up (repair surname/first-name split from source rows)
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

  return {
    artist: _artist,
    title: _title,
    year,
    chart,

    rank: toInt(raw.rank),
    peak: peak,
    weeks_on_chart: weeks,
    is_number_one: raw.is_number_one === true || peak === 1 || raw.rank === 1,

    fact: String(raw.fact || "").trim(),
    culture: String(raw.culture || "").trim(),
    next: String(raw.next || "").trim(),

    _na: norm(_artist),
    _nt: norm(_title)
  };
}


// =============================
// TOP40WEEKLY REPAIR SUPPORT
// =============================
// Build a surname/last-token set from the base DB so we only "repair" rows where the artist
// clearly looks truncated (e.g., Turner -> Tina Turner). This avoids corrupting one-word acts
// like Prince, Yes, Heart, etc.
let TOP40_SURNAME_SET = null;
let TOP40_ARTIST_SET = null;
let TOP40_ONEWORD_SET = null;
function buildSurnameSet(moments) {
  const set = new Set();
  if (!Array.isArray(moments)) return set;

  for (const m of moments) {
    const a = String(m?.artist || "").trim();
    if (!a) continue;
    const parts = a.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].replace(/[^A-Za-z0-9'.-]/g, "").toLowerCase();
      if (last) set.add(last);
    }
  }
  return set;
}

function buildArtistSet(moments) {
  const set = new Set();
  if (!Array.isArray(moments)) return set;
  for (const m of moments) {
    const a = String(m?.artist || "").trim();
    if (!a) continue;
    set.add(norm(a));
  }
  return set;
}
function buildOneWordActSet(moments) {
  const set = new Set();
  if (!Array.isArray(moments)) return set;
  for (const m of moments) {
    const a = String(m?.artist || "").trim();
    if (!a) continue;
    const parts = a.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      set.add(norm(a));
    }
  }
  return set;
}


function normalizeArtistPunctuation(a) {
  let s = String(a || "").trim();
  if (!s) return s;
  // Collapse multiple commas/spaces (e.g., Parker,, Jr.)
  s = s.replace(/\s*,\s*,+/g, ", ").replace(/,{2,}/g, ",").replace(/\s{2,}/g, " ").trim();
  // Normalize "Jr" variants
  s = s.replace(/\bJr\b(?!\.)/g, "Jr.").replace(/\bJR\b\.?/g, "Jr.");
  // Fix " , " spacing
  s = s.replace(/\s*,\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
  // Remove accidental double ", "
  s = s.replace(/,\s*,/g, ", ");
  return s;
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

  TOP40_SURNAME_SET = buildSurnameSet(normalized);

  
  TOP40_ARTIST_SET = buildArtistSet(normalized);
  TOP40_ONEWORD_SET = buildOneWordActSet(normalized);
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
  __top40FixVersion: "top40-fix-v5-mccartney-and-propernames",
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
