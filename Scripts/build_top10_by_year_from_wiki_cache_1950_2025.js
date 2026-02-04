"use strict";

/**
 * Build Top10 store from Wikipedia per-year cache:
 *   Data/wikipedia/charts/year_end_hot100_<YEAR>.json
 *
 * Output:
 *   Data/top10_by_year_v1.json
 *
 * Baseline: Top 10 = first 10 rows from each year cache.
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

const CHART_NAME = "Billboard Year-End Hot 100 (Wikipedia cache)";

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}
function writeJson(fp, obj) {
  fs.writeFileSync(fp, JSON.stringify(obj, null, 2), "utf8");
}
function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}
function normStr(x) {
  return String(x || "").replace(/\s+/g, " ").trim();
}
function toInt(x) {
  const n = parseInt(String(x || "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function loadWikiYear(year) {
  const fp = path.join(WIKI_DIR, `year_end_hot100_${year}.json`);
  if (!fs.existsSync(fp)) return null;
  const j = readJson(fp);
  const rows = Array.isArray(j.rows) ? j.rows : [];
  return rows;
}

function buildTop10FromRows(rows) {
  // Rows already normalized by your pull script: {pos,title,artist}
  const top10 = rows.slice(0, 10).map((r, idx) => {
    const pos = toInt(r.pos) ?? (idx + 1);
    const title = normStr(r.title);
    const artist = normStr(r.artist);
    return { pos, title, artist };
  });

  // Basic validation
  for (let i = 0; i < top10.length; i++) {
    const it = top10[i];
    if (!toInt(it.pos)) return null;
    if (!isNonEmptyString(it.title)) return null;
    if (!isNonEmptyString(it.artist)) return null;
  }
  return top10.length === 10 ? top10 : null;
}

function buildOverlayMapFromInputRows() {
  // If you keep a curated input file, we can use it to overwrite wiki-derived Top10s.
  // Expected shapes:
  //  - {rows:[{year,pos,title,artist}, ...]}
  //  - or raw array [{year,pos,title,artist}, ...]
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
    const title = normStr(r.title ?? r.song ?? r.single ?? r.track);
    const artist = normStr(r.artist ?? r.artists ?? r.performer);

    if (!y || !pos || !isNonEmptyString(title) || !isNonEmptyString(artist)) continue;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push({ pos, title, artist });
  }

  // Keep only years with 10+ rows; normalize ordering by pos
  const out = new Map();
  for (const [y, items] of byYear.entries()) {
    const sorted = items
      .filter((it) => it.pos >= 1 && it.pos <= 10)
      .sort((a, b) => a.pos - b.pos);

    if (sorted.length >= 10) out.set(y, sorted.slice(0, 10));
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
  const missing = [];
  const weak = [];

  for (let y = YEAR_START; y <= YEAR_END; y++) {
    // overlay wins if present
    if (overlay.has(y)) {
      years[String(y)] = { year: y, chart: CHART_NAME, items: overlay.get(y) };
      continue;
    }

    const rows = loadWikiYear(y);
    if (!rows) {
      missing.push(y);
      continue;
    }

    const top10 = buildTop10FromRows(rows);
    if (!top10) {
      weak.push(y);
      years[String(y)] = { year: y, chart: CHART_NAME, items: [] };
      continue;
    }

    years[String(y)] = { year: y, chart: CHART_NAME, items: top10 };
  }

  const payload = {
    version: "top10_by_year_v1",
    chart: "Billboard Year-End Hot 100",
    source: "wikipedia per-year cache (Data/wikipedia/charts) + optional overlay (top10_input_rows.json)",
    generatedAt: new Date().toISOString(),
    meta: {
      yearStart: YEAR_START,
      yearEnd: YEAR_END,
      wikiDir: path.relative(process.cwd(), WIKI_DIR),
      overlayUsedYears: Array.from(overlay.keys()).sort((a, b) => a - b),
      missingYears: missing,
      weakYears: weak,
    },
    years,
  };

  writeJson(OUT_FILE, payload);

  console.log("✅ Wrote:", path.relative(process.cwd(), OUT_FILE));
  console.log("Years:", Object.keys(years).length, "Missing:", missing.length, "Weak:", weak.length);
  if (missing.length) console.log("Missing:", missing.join(", "));
  if (weak.length) console.log("Weak:", weak.join(", "));
}

main();
