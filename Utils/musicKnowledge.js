"use strict";

/**
 * musicKnowledge.js — Bulletproof V2.18
 *
 * Based on V2.17 (your current file).
 *
 * V2.18 upgrades (Nyx Intelligence Layer integration):
 * - Adds handleMessage(message, ctx) entry point for index.js routing.
 * - Adds #1 queries (e.g., "When was Madonna #1?") with chart-aware search.
 * - Adds slot-filling (artist+year or song title) and enforces "always advance."
 * - Adds light artist resolution from free text ("madonna", "janet jackson", etc.).
 * - Adds deterministic response schema { ok, mode, reply, followUp, meta }.
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

  if (
    c === TOP40_CHART ||
    c === "Top40Weekly" ||
    c === "Billboard Hot 100" ||
    c === "UK Singles Chart" ||
    c === "Canada RPM"
  ) {
    return c;
  }

  return c;
}

// =============================
// TOP40WEEKLY ROW FIXUP (your v2.17 logic preserved)
// =============================
function _isNameyToken(w) {
  const s = String(w || "").trim();
  if (!s) return false;
  const lc = s.toLowerCase().replace(/[,]+$/g, "");

  if (["and", "&", "of", "the", "mc", "jr", "jr."].includes(lc)) return true;
  if (/^[A-Z][a-z]+[,]?$/.test(s)) return true;
  if (/^[A-Z]\.?$/.test(s)) return true;
  if (/^Mc[A-Z][a-z]+[,]?$/.test(s)) return true;
  return false;
}

function _looksNameChunk(tokens) {
  if (!Array.isArray(tokens) || !tokens.length) return false;
  return tokens.every(_isNameyToken);
}

function normalizeArtistPunctuation(a) {
  let s = String(a || "").trim();
  if (!s) return s;
  s = s.replace(/\s*,\s*,+/g, ", ").replace(/,{2,}/g, ",").replace(/\s{2,}/g, " ").trim();
  s = s.replace(/\bJr\b(?!\.)/g, "Jr.").replace(/\bJR\b\.?/g, "Jr.");
  s = s.replace(/\s*,\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
  s = s.replace(/,\s*,/g, ", ");
  return s;
}

// Build sets from base DB (initialized after base load)
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
    if (parts.length === 1) set.add(norm(a));
  }
  return set;
}

function fixTop40ArtistTitle(artist, title) {
  let a = normalizeArtistPunctuation(String(artist || "").trim());
  let t = String(title || "").trim();
  if (!a || !t) return { artist: a, title: t };

  t = t.replace(/\s+[,]+$/g, "").trim();

  const artistSet = TOP40_ARTIST_SET instanceof Set ? TOP40_ARTIST_SET : new Set();
  const oneWordSet = TOP40_ONEWORD_SET instanceof Set ? TOP40_ONEWORD_SET : new Set();

  const STATIC_ONEWORD = new Set(["prince", "yes", "heart"]);
  for (const s of STATIC_ONEWORD) oneWordSet.add(s);

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

  // SPECIAL CASE 1: artist begins with "and ..."
  if (/^and\s+/i.test(a)) {
    const words0 = joinMcTokens(t.split(/\s+/).filter(Boolean));
    const pulled = extractTailName(words0, 8);
    if (pulled) {
      const candidateArtist = normalizeArtistPunctuation(
        (pulled.tail.join(" ") + " " + a).replace(/\s+/g, " ").trim()
      );
      const candidateTitle = pulled.candidateTitle;
      const candNorm = norm(candidateArtist);
      const candIsMulti = /\sand\s/i.test(candidateArtist);
      const candIsJr = /\bjr\.?\b/i.test(candidateArtist);
      const candKnown = artistSet.has(candNorm);
      if ((candIsMulti && candidateTitle.length >= 3) || candIsJr || candKnown) {
        return { artist: candidateArtist, title: candidateTitle };
      }
    }
  }

  // SPECIAL CASE 1B: McCartney duet missing "Paul"
  if (/\bMcCartney\b/i.test(a) && /\sand\s/i.test(a)) {
    const words0 = joinMcTokens(t.split(/\s+/).filter(Boolean));
    const last = words0[words0.length - 1] || "";
    if (/^Paul[,]?$/i.test(String(last || ""))) {
      const head = words0.slice(0, -1).join(" ").trim();
      if (head.length >= 3) {
        const candArtist = normalizeArtistPunctuation((last + " " + a).trim());
        if (/^Paul\s+/i.test(candArtist) && /\sand\s/i.test(candArtist)) {
          return { artist: candArtist, title: head };
        }
      }
    }
  }

  // SPECIAL CASE 2: ", Jr." and title ends with first name
  if (/\bjr\.?\b/i.test(a)) {
    const words0 = t.split(/\s+/).filter(Boolean);
    const last = words0[words0.length - 1] || "";
    if (looksNameyToken(last)) {
      const head = words0.slice(0, -1).join(" ").trim();
      if (head.length >= 3) {
        const candArtist = normalizeArtistPunctuation((last + " " + a).trim());
        return { artist: candArtist, title: head };
      }
    }
  }

  const aParts = a.split(/\s+/).filter(Boolean);
  const aSingle = aParts.length === 1;

  const artistIsJrOnly = /^jr\.?$/i.test(a);

  // Eligible if:
  const eligible =
    artistIsJrOnly ||
    /^and\s+/i.test(a) ||
    /,\s*,?\s*Jr\./i.test(a) ||
    aSingle;

  // SPECIAL CASE 3: artist has stray title words prepended
  {
    const TITLEISH_PREFIX = new Set(["away","up","much","hearted","wings","true","got","its","thorn"]);
    const aWords = a.split(/\s+/).filter(Boolean);
    if (aWords.length >= 2) {
      for (let k = 1; k <= 3 && k < aWords.length; k++) {
        const prefix = aWords.slice(0, k);
        const rest = aWords.slice(k).join(" ").trim();
        if (!rest || rest.length < 2) continue;

        const allTitleish = prefix.every(w => TITLEISH_PREFIX.has(norm(w)));
        if (!allTitleish) continue;

        const restNorm = norm(rest);
        const STATIC_ONEWORD = new Set(["prince","yes","heart"]);
        if (!artistSet.has(restNorm) && !STATIC_ONEWORD.has(restNorm)) continue;

        const newTitle = (t + " " + prefix.join(" ")).replace(/\s+/g, " ").trim();
        if (newTitle.length < 3) continue;

        a = rest;
        t = newTitle;
        break;
      }
    }
  }

  // SPECIAL CASE 4: Will to Power
  if (/^Power$/i.test(a) && /\bWill\s+to\b\s*$/i.test(t)) {
    a = "Will to Power";
    t = t.replace(/\s*\bWill\s+to\b\s*$/i, "").trim();
  }

  if (!eligible) return { artist: a, title: t };

  const words = (function joinMcTokensLocal() {
    const out = [];
    const src = t.split(/\s+/).filter(Boolean);
    for (let i = 0; i < src.length; i++) {
      const w = String(src[i] || "").trim();
      const wl = w.toLowerCase();
      const nxt = i + 1 < src.length ? String(src[i + 1] || "").trim() : "";
      if (wl === "mc" && nxt && /^[A-Z][a-z]+/.test(nxt)) {
        out.push("Mc" + nxt);
        i++;
        continue;
      }
      out.push(w);
    }
    return out.filter(Boolean);
  })();

  if (words.length < 2) return { artist: a, title: t };

  for (let k = 1; k <= 10 && k < words.length; k++) {
    const tail = words.slice(words.length - k);
    const head = words.slice(0, words.length - k);

    const candidateTitle = head.join(" ").trim();
    if (candidateTitle.length < 3) continue;

    const lastWord = (head[head.length - 1] || "").toLowerCase();
    if (badTitleEnd.has(lastWord)) continue;

    if (!looksNameChunk(tail)) continue;

    // Avoid moving 1 word unless truncated
    if (k === 1 && !artistIsJrOnly && !aSingle) continue;

    if (artistIsJrOnly) {
      const fixedArtist = normalizeArtistPunctuation(`${tail.join(" ").replace(/\s+[,]+$/g, "")}, Jr.`);
      return { artist: fixedArtist, title: candidateTitle };
    }

    const candidateArtist = normalizeArtistPunctuation(`${tail.join(" ")} ${a}`.replace(/\s+/g, " ").trim());

    const candNorm = norm(candidateArtist);
    const looksLikeMultiArtist =
      /\sand\s/i.test(candidateArtist) &&
      candidateArtist.split(/\sand\s/i).every((p) => String(p || "").trim().length >= 2);

    const hasJr = /,\s*Jr\./i.test(candidateArtist);

    // Strict gating: accept only if known OR multi OR Jr
    if (!artistSet.has(candNorm) && !looksLikeMultiArtist && !hasJr) continue;

    return { artist: candidateArtist, title: candidateTitle };
  }

  // LAST-RESORT SAFETY for one-word acts
  {
    const STATIC_ONEWORD = new Set(["prince","yes","heart"]);
    const aParts2 = a.split(/\s+/).filter(Boolean);
    if (aParts2.length === 2) {
      const maybeAct = norm(aParts2[1]);
      const maybePrefix = aParts2[0];
      if (STATIC_ONEWORD.has(maybeAct) && !artistSet.has(norm(a))) {
        const tParts = t.split(/\s+/).filter(Boolean);
        if (tParts.length >= 2) {
          const restoredTitle = (t + " " + maybePrefix).replace(/\s+/g, " ").trim();
          const restoredArtist = aParts2[1];
          if (!badTitleEnd.has(norm(maybePrefix))) {
            return { artist: restoredArtist, title: restoredTitle };
          }
        }
      }
    }
  }

  // Targeted finalizers
  if (/\bMcCartney\s+and\s+Michael\s+Jackson\b/i.test(a) && /\bPaul\b\s*$/i.test(t)) {
    a = ("Paul " + a).replace(/\s+/g, " ").trim();
    t = t.replace(/\s*\bPaul\b\s*$/i, "").trim();
  }

  if (/\bParker\s*,\s*Jr\.?\b/i.test(a) && /\bRay\b\s*$/i.test(t)) {
    a = ("Ray " + a).replace(/\s+/g, " ").trim();
    t = t.replace(/\s*\bRay\b\s*$/i, "").trim();
  }

  // SPECIAL CASE 5: surname-only artist, first name at end of title
  {
    const TITLEISH_TAIL = new Set(["away","up","much","hearted","wings","true","got","its","thorn"]);
    const aWords = a.split(/\s+/).filter(Boolean);
    const tWords = t.split(/\s+/).filter(Boolean);
    if (aWords.length === 1 && !oneWordSet.has(norm(a)) && tWords.length >= 2) {
      const tail = tWords[tWords.length - 1];
      const tailNorm = norm(tail);
      if (_isNameyToken(tail) && !TITLEISH_TAIL.has(tailNorm)) {
        const newTitle = tWords.slice(0, -1).join(" ").trim();
        if (newTitle.length >= 3) {
          a = (tail + " " + a).replace(/\s+/g, " ").trim();
          t = newTitle;
        }
      }
    }
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
// INTERNAL STATE + INDEXES
// =============================
let DB = null;
let DB_PATH_RESOLVED = null;
let DB_MTIME_MS = 0;
let LOADED = false;

let MOMENTS = [];

let BY_YEAR = new Map();       // year -> moments[]
let BY_YEAR_CHART = new Map(); // `${year}|${chart}` -> moments[]
let BY_ARTIST_TITLE = new Map(); // `${_na}|${_nt}` -> years Set

let ARTIST_LIST = [];          // [{na, artist}] sorted longest-first for substring resolution
let ARTIST_SET = new Set();    // norm artist set for quick membership

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
  const canonical = resolveRepoPath(TOP40_DIR);
  if (dirExists(canonical)) return canonical;

  const dataDir = resolveRepoPath("Data");
  if (!dirExists(dataDir)) return null;

  try {
    const entries = fs.readdirSync(dataDir, { withFileTypes: true });
    const match = entries.find((e) => e.isDirectory() && String(e.name).toLowerCase() === "top40weekly");
    if (match) return path.join(dataDir, match.name);
  } catch {
    // ignore
  }

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
    console.log(
      `[musicKnowledge] Top40Weekly merge: directory not found (checked casing variants). Expected: ${resolveRepoPath(TOP40_DIR)}`
    );
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
    `[musicKnowledge] Top40Weekly Top 100 merge: dir=${dirAbs} files=${files.length} added=${added} (skipped=${skipped}, emptySkipped=${emptySkipped}) years=${
      yearsList.length ? `${yearsList[0]}–${yearsList[yearsList.length - 1]}` : "none"
    }`
  );

  const missing90s = [];
  for (let y = 1990; y <= 1999; y++) if (!yearsFound.has(y)) missing90s.push(y);
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
  ARTIST_SET = new Set();
  const artistCanon = new Map(); // norm -> canonical artist string

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

    ARTIST_SET.add(m._na);
    if (!artistCanon.has(m._na)) artistCanon.set(m._na, m.artist);
  }

  // Build artist list sorted longest-first to reduce false matches
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

  console.log(`[musicKnowledge] DB validation: 0 possible duplicates (artist/year/chart/title).`);

  DB = { moments: MOMENTS };
  LOADED = true;

  console.log(`[musicKnowledge] Using DB: ${DB_PATH_RESOLVED}`);
  console.log(`[musicKnowledge] Loaded ${MOMENTS.length} moments (years ${STATS.yearMin}–${STATS.yearMax}) charts=${STATS.charts.length}`);

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

// Resolve an artist name from free text using the ARTIST_LIST
function resolveArtistFromText(message) {
  getDb();
  const t = norm(message);
  if (!t) return null;

  // quick cut: if message is short, treat it as an artist attempt
  if (t.length <= 40 && ARTIST_SET.has(t)) {
    const found = ARTIST_LIST.find((x) => x.na === t);
    return found ? found.artist : message.trim();
  }

  for (const a of ARTIST_LIST) {
    if (!a.na || a.na.length < 3) continue;
    // word boundary-ish guard: ensure substring match on token boundaries
    if (t.includes(a.na)) {
      return a.artist;
    }
  }

  return null;
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
// CHART FALLBACK
// =============================
function getFallbackChartForRequest(requestedChart) {
  if (!ENABLE_CHART_FALLBACK) return null;
  const req = normalizeChart(requestedChart || "");
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

  const out = sorted.slice(0, Math.max(1, Math.min(100, Number(n) || 10)));

  // Defensive repair for Top40Weekly Top 100
  return out.map((m) => {
    try {
      if (String(m?.chart || "") === TOP40_CHART) {
        const fx = fixTop40ArtistTitle(m.artist, m.title);
        if (fx && (fx.artist !== m.artist || fx.title !== m.title)) {
          return { ...m, artist: fx.artist, title: fx.title };
        }
      }
    } catch (e) {}
    return m;
  });
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
// #1 QUERIES (NEW)
// =============================
function findNumberOneYearsForArtist(artist, chart = null) {
  getDb();
  const a = norm(artist);
  if (!a) return [];

  const c = chart ? normalizeChart(chart) : null;

  const years = new Set();
  for (const m of MOMENTS) {
    if (m._na !== a) continue;
    if (c && m.chart !== c) continue;
    if (m.is_number_one === true || Number(m.peak) === 1 || Number(m.rank) === 1) {
      years.add(m.year);
    }
  }

  return Array.from(years).sort((x, y) => x - y);
}

function pickNumberOneExample(artist, year, chart = null) {
  const a = norm(artist);
  const c = chart ? normalizeChart(chart) : null;
  const pool = c ? poolForYear(year, c) : poolForYear(year, null);
  const candidates = pool.filter((m) => m._na === a && (m.is_number_one === true || Number(m.peak) === 1 || Number(m.rank) === 1));
  return candidates.length ? pickRandom(candidates) : null;
}

// =============================
// NYX INTEGRATION ENTRY POINT (NEW)
// =============================

function parseChartFromText(message) {
  const t = norm(message);
  if (!t) return null;
  if (t.includes("uk") && t.includes("single")) return "UK Singles Chart";
  if (t.includes("canada") || t.includes("rpm")) return "Canada RPM";
  if (t.includes("top40weekly")) {
    if (t.includes("top 100") || t.includes("top100") || t.includes("year")) return TOP40_CHART;
    return "Top40Weekly";
  }
  if (t.includes("billboard") || t.includes("hot 100") || t.includes("hot100")) return "Billboard Hot 100";
  return null;
}

function isNumberOneQuestion(message) {
  const t = norm(message);
  return /\b(#\s*1|#1|number\s*one|number\s*1|no\s*1|no1|no\.\s*1)\b/.test(t) && /\b(when|what year|which year|years)\b/.test(t);
}

function isTopListRequest(message) {
  const t = norm(message);
  return /\b(top\s*(10|20|50|100)|show\s+me\s+the\s+top|give\s+me\s+the\s+top)\b/.test(t);
}

function parseTopN(message) {
  const m = norm(message).match(/\btop\s*(10|20|50|100)\b/);
  return m ? Number(m[1]) : 10;
}

function enforceAdvanceResponse(out) {
  const reply = String(out?.reply || "").trim();
  if (reply && out.followUp) return out;

  return {
    ...out,
    ok: true,
    reply: reply || "I can do that—give me one anchor so I don’t guess.",
    followUp: out.followUp || {
      kind: "slotfill",
      required: ["artist+year OR song title"],
      prompt: "Give me an artist + year (or a song title)."
    }
  };
}

async function handleMessage(message, ctx = {}) {
  getDb();
  const text = String(message || "").trim();
  const tnorm = norm(text);

  const requestedChart = normalizeChart(ctx?.context?.chart || parseChartFromText(text) || DEFAULT_CHART);

  // 1) #1 questions: "When was Madonna #1?"
  if (isNumberOneQuestion(text)) {
    const artist = resolveArtistFromText(text);
    if (!artist) {
      return enforceAdvanceResponse({
        ok: true,
        mode: "music",
        reply: "Which artist are we talking about for #1?",
        followUp: { kind: "slotfill", required: ["artist"], prompt: "Tell me the artist name (e.g., Madonna)." },
        meta: { requestedChart }
      });
    }

    let years = findNumberOneYearsForArtist(artist, requestedChart);

    // fallback if chart bucket empty
    if (!years.length) {
      const fb = getFallbackChartForRequest(requestedChart);
      if (fb) years = findNumberOneYearsForArtist(artist, fb);
    }

    if (!years.length) {
      return enforceAdvanceResponse({
        ok: true,
        mode: "music",
        reply: `I don’t have a #1 hit indexed for ${artist} on ${requestedChart}. Want me to check another chart (Billboard Hot 100 / UK Singles / Canada RPM / Top40Weekly)?`,
        followUp: {
          kind: "choice",
          options: ["Billboard Hot 100", "UK Singles Chart", "Canada RPM", TOP40_CHART],
          prompt: "Pick a chart to check."
        },
        meta: { artist, requestedChart }
      });
    }

    // Provide a short, decisive answer + one example
    const yearsStr = years.length <= 12 ? years.join(", ") : `${years.slice(0, 12).join(", ")} … (+${years.length - 12} more)`;
    const exampleYear = years[0];
    const ex = pickNumberOneExample(artist, exampleYear, requestedChart) || pickNumberOneExample(artist, exampleYear, null);

    const exampleLine = ex ? `Example: ${ex.title} (${exampleYear})` : `Example year: ${exampleYear}`;

    return enforceAdvanceResponse({
      ok: true,
      mode: "music",
      reply: `${artist} hit #1 in: ${yearsStr}.\n${exampleLine}\n\nWant a specific year, or should I pull a random #1 moment?`,
      followUp: {
        kind: "choice",
        options: ["Pick a year", "Random #1 moment", "Switch chart"],
        prompt: "Pick one: Pick a year, Random #1 moment, or Switch chart."
      },
      meta: { artist, yearsCount: years.length, requestedChart }
    });
  }

  // 2) “Top N of year” requests
  if (isTopListRequest(text)) {
    const year = extractYear(text);
    if (!year) {
      return enforceAdvanceResponse({
        ok: true,
        mode: "music",
        reply: "Which year should I pull the Top list for?",
        followUp: { kind: "slotfill", required: ["year"], prompt: "Give me a year (e.g., 1994)." },
        meta: { requestedChart }
      });
    }

    const n = parseTopN(text);
    const top = getTopByYear(year, n, requestedChart);

    if (!top.length) {
      return enforceAdvanceResponse({
        ok: true,
        mode: "music",
        reply: `I don’t have entries for ${year} on ${requestedChart}. Want me to fallback to ${FALLBACK_CHART} or switch charts?`,
        followUp: {
          kind: "choice",
          options: [FALLBACK_CHART, "Switch chart"],
          prompt: "Pick one: fallback chart or switch chart."
        },
        meta: { year, requestedChart }
      });
    }

    const lines = top.slice(0, Math.min(n, 20)).map((m, i) => `${String(i + 1).padStart(2, " ")}. ${m.artist} — ${m.title}`);
    return enforceAdvanceResponse({
      ok: true,
      mode: "music",
      reply: `Top ${Math.min(n, 20)} for ${year} (${requestedChart}):\n${lines.join("\n")}\n\nWant #1 only, a random “moment”, or another year?`,
      followUp: {
        kind: "choice",
        options: ["#1 only", "Random moment", "Another year"],
        prompt: "Pick one: #1 only, Random moment, or Another year."
      },
      meta: { year, requestedChart, n }
    });
  }

  // 3) Slot-fill: artist+year OR song title
  const year = extractYear(text);
  const dashArtist = detectArtist(text);
  const dashTitle = detectTitle(text);

  // If "Artist - Title" format
  if (dashArtist && dashTitle) {
    const years = findYearsForArtistTitle(dashArtist, dashTitle, requestedChart);
    const y = years.length ? years[0] : year;
    const m = pickBestMoment(null, { artist: dashArtist, title: dashTitle, year: y, chart: requestedChart });

    if (!m) {
      return enforceAdvanceResponse({
        ok: true,
        mode: "music",
        reply: `I can’t find that exact track in the current index: "${dashArtist} — ${dashTitle}". Want to try another spelling, or give me just the year and I’ll pull a strong moment?`,
        followUp: {
          kind: "slotfill",
          required: ["corrected title OR year"],
          prompt: "Give me a corrected title (or just a year)."
        },
        meta: { requestedChart, artist: dashArtist, title: dashTitle }
      });
    }

    return enforceAdvanceResponse({
      ok: true,
      mode: "music",
      reply: `Moment locked: ${m.artist} — ${m.title} (${m.year}, ${m.chart}).\n\nWant another moment from ${m.year}, or switch charts?`,
      followUp: {
        kind: "choice",
        options: [`Another from ${m.year}`, "Switch chart", "Different year"],
        prompt: "Pick one: Another from the same year, Switch chart, or Different year."
      },
      meta: { usedChart: m.chart, requestedChart, year: m.year }
    });
  }

  // If user provides a year alone (or with light music phrasing)
  if (year && !dashTitle) {
    const picked = pickRandomByYearWithMeta(year, requestedChart);
    if (!picked.moment) {
      return enforceAdvanceResponse({
        ok: true,
        mode: "music",
        reply: `I don’t have a hit indexed for ${year} on ${requestedChart}. Want me to fallback to ${FALLBACK_CHART} or choose any chart?`,
        followUp: {
          kind: "choice",
          options: [FALLBACK_CHART, "Any chart"],
          prompt: "Pick one: fallback chart or any chart."
        },
        meta: { year, requestedChart, ...picked.meta }
      });
    }

    const m = picked.moment;
    return enforceAdvanceResponse({
      ok: true,
      mode: "music",
      reply: `Moment: ${m.artist} — ${m.title} (${m.year}, ${m.chart}).\n\nWant the Top 10 for ${m.year}, another random moment, or #1 only?`,
      followUp: {
        kind: "choice",
        options: [`Top 10 (${m.year})`, "Another moment", "#1 only"],
        prompt: "Pick one: Top 10, Another moment, or #1 only."
      },
      meta: picked.meta
    });
  }

  // 4) If we detect an artist in free text (no year), ask for year (always-advance)
  const artistGuess = resolveArtistFromText(text);
  if (artistGuess && !year) {
    return enforceAdvanceResponse({
      ok: true,
      mode: "music",
      reply: `Got ${artistGuess}. What year should I anchor to (or do you want “#1 years”)?`,
      followUp: {
        kind: "choice",
        options: ["Give a year", "#1 years", "Random moment"],
        prompt: "Pick one: Give a year, #1 years, or Random moment."
      },
      meta: { artist: artistGuess, requestedChart }
    });
  }

  // 5) Default: ask for the anchor
  return enforceAdvanceResponse({
    ok: true,
    mode: "music",
    reply: "To anchor the moment, give me an artist + year (or a song title). If you want a different chart, say Billboard Hot 100, UK Singles, Canada RPM, or Top40Weekly.",
    followUp: {
      kind: "slotfill",
      required: ["artist+year OR song title"],
      prompt: "Give me an artist + year (or a song title)."
    },
    meta: { requestedChart }
  });
}

// =============================
// EXPORTS
// =============================
module.exports = {
  __top40FixVersion: "top40-fix-v11-firstname-tailfix",
  __musicKnowledgeVersion: "v2.18-nyx-handleMessage-numberOne",

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

  // Nyx integration
  handleMessage,

  // Extraction
  detectArtist,
  detectTitle,
  extractYear,
  normalizeChart,

  // Query helpers
  findYearsForArtistTitle,
  findNumberOneYearsForArtist,
  getAllMoments,
  getYearChartCount,
  hasYearChart,
  top40Coverage,

  // Pickers
  pickRandomByYear,
  pickRandomByYearFallback,
  pickRandomByYearWithMeta,
  pickRandomByDecade,
  getTopByYear
};
