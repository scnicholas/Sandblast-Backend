"use strict";

/**
 * Scripts/build_top10_by_year_from_wiki_cache_1950_2025.js
 *
 * Build Top10 store from Wikipedia per-year cache:
 *   Data/wikipedia/charts/year_end_hot100_<YEAR>.json
 *
 * Output:
 *   Data/top10_by_year_v1.json
 *
 * NEW:
 *   Data/top10_wiki_anomalies.json      (per-year anomaly/diff logger)
 *   Data/top10_wiki_top10_preview.json  (pre-overlay preview, useful for audits)
 *
 * Baseline: Top 10 = first 10 VALID song rows from each year cache.
 * Canonical rule: pos is ALWAYS 1–10 by order (index-based) AFTER cleaning/filtering.
 * Optional overlay: if Data/top10_input_rows.json contains rows for a year,
 * it can overwrite those entries (higher authority).
 *
 * Usage:
 *   node Scripts/build_top10_by_year_from_wiki_cache_1950_2025.js
 */

const fs = require("fs");
const path = require("path");

const YEAR_START = 1950;
const YEAR_END = 2025;

const DATA_DIR = path.resolve(__dirname, "..", "Data");
const WIKI_DIR = path.join(DATA_DIR, "wikipedia", "charts");
const OUT_FILE = path.join(DATA_DIR, "top10_by_year_v1.json");

const TOP10_INPUT_ROWS = path.join(DATA_DIR, "top10_input_rows.json"); // optional overlay

const ANOMALY_LOG_FILE = path.join(DATA_DIR, "top10_wiki_anomalies.json");
const PREVIEW_FILE = path.join(DATA_DIR, "top10_wiki_top10_preview.json");

const CHART_NAME = "Billboard Year-End Hot 100 (Wikipedia cache)";

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}
function writeJson(fp, obj) {
  fs.writeFileSync(fp, JSON.stringify(obj, null, 2), "utf8");
}
function ensureDir(fp) {
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}

function normStr(x) {
  return String(x || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWrappingQuotes(s) {
  let x = normStr(s);
  for (let i = 0; i < 3; i++) {
    const m = x.match(/^["'“”‘’](.*)["'“”‘’]$/);
    if (!m) break;
    x = normStr(m[1]);
  }
  return x;
}

function stripCitations(s) {
  return normStr(String(s || "").replace(/\[[^\]]*?\]/g, ""));
}

function toInt(x) {
  const n = parseInt(String(x || "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function getField(row, keys) {
  if (!row || typeof row !== "object") return "";
  for (const k of keys) {
    if (row[k] != null) return row[k];
  }
  return "";
}

function normalizeTitleArtist(rawTitle, rawArtist) {
  let title = stripWrappingQuotes(stripCitations(rawTitle));
  let artist = stripWrappingQuotes(stripCitations(rawArtist));
  title = normStr(title);
  artist = normStr(artist);
  return { title, artist };
}

function isHeaderLikeToken(x) {
  const t = normStr(x).toLowerCase();
  return (
    t === "title" ||
    t === "song" ||
    t === "single" ||
    t === "track" ||
    t === "artist" ||
    t === "artist(s)" ||
    t === "artists" ||
    t === "performer" ||
    t === "№" ||
    t === "no" ||
    t === "no." ||
    t === "rank" ||
    t === "pos" ||
    t === "position"
  );
}

function isHeaderRow(title, artist) {
  const t = normStr(title).toLowerCase();
  const a = normStr(artist).toLowerCase();
  if (!t && !a) return true;
  if (isHeaderLikeToken(t) && isHeaderLikeToken(a)) return true;

  const tIsTitle = t === "title" || t === "song" || t === "single" || t === "track";
  const aIsArtist = a === "artist" || a === "artist(s)" || a === "artists" || a === "performer";
  if (tIsTitle && (aIsArtist || !a)) return true;
  if (aIsArtist && (!t || tIsTitle)) return true;

  return false;
}

function isJunkRow(title, artist) {
  const t = normStr(title);
  const a = normStr(artist);
  if (!t && !a) return true;
  if (isHeaderRow(t, a)) return true;
  if (t && a && t.toLowerCase() === a.toLowerCase()) return true;
  if (t.length < 2 || a.length < 2) return true;
  return false;
}

function loadWikiYear(year) {
  const fp = path.join(WIKI_DIR, `year_end_hot100_${year}.json`);
  if (!fs.existsSync(fp)) return null;

  try {
    const j = readJson(fp);
    return Array.isArray(j.rows) ? j.rows : [];
  } catch {
    return []; // parse failed or invalid JSON
  }
}

function sniffRowShape(rows) {
  // Give a quick “shape fingerprint” so anomalies jump out
  const sample = Array.isArray(rows) ? rows.slice(0, 6) : [];
  const keys = new Set();
  for (const r of sample) {
    if (r && typeof r === "object") Object.keys(r).forEach((k) => keys.add(k));
  }
  return { sampleKeys: Array.from(keys).sort(), sampleCount: sample.length };
}

function buildTop10FromRows(rows, year) {
  const diag = {
    year,
    rowCount: Array.isArray(rows) ? rows.length : 0,
    ok: false,
    picked: 0,
    dropped: {
      empty: 0,
      header: 0,
      titleEqArtist: 0,
      tooShort: 0,
      dup: 0
    },
    firstProblems: [],
    shape: sniffRowShape(rows)
  };

  if (!Array.isArray(rows) || rows.length < 10) {
    diag.firstProblems.push("rows<10_or_not_array");
    return { top10: null, diag };
  }

  const picked = [];
  const seen = new Set();

  for (const r of rows) {
    const rawTitle = getField(r, ["title", "Title", "song", "Song", "single", "Single", "track", "Track"]);
    const rawArtist = getField(r, [
      "artist",
      "Artist",
      "artist(s)",
      "Artist(s)",
      "artists",
      "Artists",
      "performer",
      "Performer"
    ]);

    const { title, artist } = normalizeTitleArtist(rawTitle, rawArtist);

    if (!isNonEmptyString(title) || !isNonEmptyString(artist)) {
      diag.dropped.empty++;
      if (diag.firstProblems.length < 6) diag.firstProblems.push("empty_title_or_artist");
      continue;
    }

    // header check
    if (isHeaderRow(title, artist)) {
      diag.dropped.header++;
      if (diag.firstProblems.length < 6) diag.firstProblems.push("header_row");
      continue;
    }

    // title==artist corruption
    if (title.toLowerCase() === artist.toLowerCase()) {
      diag.dropped.titleEqArtist++;
      if (diag.firstProblems.length < 6) diag.firstProblems.push("title_eq_artist");
      continue;
    }

    // too-short
    if (title.length < 2 || artist.length < 2) {
      diag.dropped.tooShort++;
      if (diag.firstProblems.length < 6) diag.firstProblems.push("too_short");
      continue;
    }

    const key = `${title.toLowerCase()}@@${artist.toLowerCase()}`;
    if (seen.has(key)) {
      diag.dropped.dup++;
      if (diag.firstProblems.length < 6) diag.firstProblems.push("duplicate");
      continue;
    }
    seen.add(key);

    const sourcePos = toInt(getField(r, ["pos", "Pos", "position", "Position", "rank", "Rank", "№", "No.", "no"]));

    picked.push({
      title,
      artist,
      ...(sourcePos ? { sourcePos } : {})
    });

    if (picked.length >= 10) break;
  }

  diag.picked = picked.length;

  if (picked.length < 10) {
    diag.firstProblems.push("picked<10_after_filter");
    return { top10: null, diag };
  }

  const top10 = picked.slice(0, 10).map((r, idx) => ({
    pos: idx + 1,
    title: r.title,
    artist: r.artist,
    ...(r.sourcePos ? { sourcePos: r.sourcePos } : {})
  }));

  // hard validate
  for (let i = 0; i < 10; i++) {
    const it = top10[i];
    if (it.pos !== i + 1) {
      diag.firstProblems.push("pos_not_canonical");
      return { top10: null, diag };
    }
    if (!isNonEmptyString(it.title) || !isNonEmptyString(it.artist)) {
      diag.firstProblems.push("empty_in_top10");
      return { top10: null, diag };
    }
    if (isHeaderRow(it.title, it.artist)) {
      diag.firstProblems.push("header_in_top10");
      return { top10: null, diag };
    }
    if (it.title.toLowerCase() === it.artist.toLowerCase()) {
      diag.firstProblems.push("title_eq_artist_in_top10");
      return { top10: null, diag };
    }
  }

  diag.ok = true;
  return { top10, diag };
}

function buildOverlayMapFromInputRows() {
  if (!fs.existsSync(TOP10_INPUT_ROWS)) return new Map();

  let j;
  try {
    j = readJson(TOP10_INPUT_ROWS);
  } catch {
    return new Map();
  }

  const rows = Array.isArray(j) ? j : Array.isArray(j.rows) ? j.rows : [];
  const byYear = new Map();

  for (const r of rows) {
    const y = toInt(r.year);
    const pos = toInt(r.pos ?? r.position ?? r.rank);
    const rawTitle = r.title ?? r.song ?? r.single ?? r.track ?? r.Title ?? r.Song;
    const rawArtist = r.artist ?? r["artist(s)"] ?? r["Artist(s)"] ?? r.artists ?? r.performer ?? r.Artist;

    const { title, artist } = normalizeTitleArtist(rawTitle, rawArtist);

    if (!y || !pos || !isNonEmptyString(title) || !isNonEmptyString(artist)) continue;
    if (isHeaderRow(title, artist)) continue;
    if (title.toLowerCase() === artist.toLowerCase()) continue;

    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push({ pos, title, artist });
  }

  const out = new Map();
  for (const [y, items] of byYear.entries()) {
    const sorted = items
      .filter((it) => it.pos >= 1 && it.pos <= 10)
      .sort((a, b) => a.pos - b.pos);

    if (sorted.length >= 10) {
      out.set(
        y,
        sorted.slice(0, 10).map((it, idx) => ({
          pos: idx + 1,
          title: it.title,
          artist: it.artist,
          sourcePos: it.pos
        }))
      );
    }
  }
  return out;
}

function main() {
  if (!fs.existsSync(WIKI_DIR)) {
    console.error(`❌ Missing wiki cache dir: ${WIKI_DIR}`);
    process.exitCode = 1;
    return;
  }

  const overlay = buildOverlayMapFromInputRows();

  const years = {};
  const preview = {}; // pre-overlay preview of what the wiki build produced
  const anomalies = [];

  const missing = [];
  const weak = [];
  const overlayUsed = [];

  for (let y = YEAR_START; y <= YEAR_END; y++) {
    const yKey = String(y);

    // overlay wins
    if (overlay.has(y)) {
      overlayUsed.push(y);
      years[yKey] = { year: y, chart: CHART_NAME, items: overlay.get(y) };
      preview[yKey] = { year: y, chart: CHART_NAME, items: overlay.get(y), note: "overlay_used" };
      anomalies.push({
        year: y,
        ok: true,
        source: "overlay",
        note: "overlay_override_used",
        picked: 10
      });
      continue;
    }

    const rows = loadWikiYear(y);
    if (rows === null) {
      missing.push(y);
      years[yKey] = { year: y, chart: CHART_NAME, items: [] };
      preview[yKey] = { year: y, chart: CHART_NAME, items: [], note: "missing_file" };
      anomalies.push({
        year: y,
        ok: false,
        source: "wiki",
        note: "missing_file",
        rowCount: 0,
        picked: 0
      });
      continue;
    }

    const { top10, diag } = buildTop10FromRows(rows, y);

    if (!top10) {
      weak.push(y);
      years[yKey] = { year: y, chart: CHART_NAME, items: [] };
      preview[yKey] = { year: y, chart: CHART_NAME, items: [], note: "weak_or_unbuildable" };
      anomalies.push({
        year: y,
        ok: false,
        source: "wiki",
        note: "weak_or_unbuildable",
        ...diag
      });
      continue;
    }

    years[yKey] = { year: y, chart: CHART_NAME, items: top10 };
    preview[yKey] = { year: y, chart: CHART_NAME, items: top10, note: "wiki_built_ok" };

    // keep a light diag even on ok years (helps spot drift)
    anomalies.push({
      year: y,
      ok: true,
      source: "wiki",
      picked: 10,
      rowCount: diag.rowCount,
      dropped: diag.dropped,
      shape: diag.shape
    });
  }

  const payload = {
    version: "top10_by_year_v1",
    chart: "Billboard Year-End Hot 100",
    source: "Wikipedia per-year cache (Data/wikipedia/charts) + optional overlay",
    generatedAt: new Date().toISOString(),
    meta: {
      yearStart: YEAR_START,
      yearEnd: YEAR_END,
      wikiDir: path.relative(process.cwd(), WIKI_DIR),
      overlayFile: fs.existsSync(TOP10_INPUT_ROWS) ? path.relative(process.cwd(), TOP10_INPUT_ROWS) : null,
      overlayUsedYears: overlayUsed.sort((a, b) => a - b),
      missingYears: missing,
      weakYears: weak
    },
    years
  };

  const anomalyPayload = {
    version: "top10_wiki_anomalies_v1",
    generatedAt: new Date().toISOString(),
    range: { start: YEAR_START, end: YEAR_END },
    wikiDir: path.relative(process.cwd(), WIKI_DIR),
    overlayFile: fs.existsSync(TOP10_INPUT_ROWS) ? path.relative(process.cwd(), TOP10_INPUT_ROWS) : null,
    summary: {
      totalYears: YEAR_END - YEAR_START + 1,
      okYears: anomalies.filter((a) => a.ok).length,
      weakYears: weak.length,
      missingYears: missing.length,
      overlayYears: overlayUsed.length
    },
    anomalies
  };

  ensureDir(OUT_FILE);
  writeJson(OUT_FILE, payload);

  ensureDir(ANOMALY_LOG_FILE);
  writeJson(ANOMALY_LOG_FILE, anomalyPayload);

  ensureDir(PREVIEW_FILE);
  writeJson(PREVIEW_FILE, {
    version: "top10_wiki_top10_preview_v1",
    generatedAt: new Date().toISOString(),
    years: preview
  });

  console.log("✅ Wrote:", path.relative(process.cwd(), OUT_FILE));
  console.log("✅ Wrote:", path.relative(process.cwd(), ANOMALY_LOG_FILE));
  console.log("✅ Wrote:", path.relative(process.cwd(), PREVIEW_FILE));
  console.log(
    "Years:",
    Object.keys(years).length,
    "Missing:",
    missing.length,
    "Weak:",
    weak.length,
    "Overlay:",
    overlayUsed.length
  );
  if (missing.length) console.log("Missing:", missing.join(", "));
  if (weak.length) console.log("Weak:", weak.join(", "));
  if (overlayUsed.length) console.log("Overlay years:", overlayUsed.join(", "));
}

main();
