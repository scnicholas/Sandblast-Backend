"use strict";

/**
 * Scripts/build_top10_by_year_v1.js — v1.1 (Drop-in: debug + coverage + strict/lenient modes)
 *
 * Input:
 *  - Data/top10_input_rows.json (array of {year,pos,artist,title})
 *
 * Output:
 *  - Data/top10_by_year_v1.json
 *
 * CLI:
 *  - node Scripts/build_top10_by_year_v1.js
 *  - node Scripts/build_top10_by_year_v1.js --debug
 *  - node Scripts/build_top10_by_year_v1.js --lenient
 *
 * Guarantees:
 *  - Deterministic output (stable sort, stable formatting)
 *  - Validates rows (basic strict checks)
 *  - For each year: enforces positions 1..10 (drops extras; warns on missing)
 *  - Normalizes whitespace, strips outer quotes
 *  - Coverage report (years present, missing pos)
 *
 * Notes:
 *  - Strict mode (default): invalid rows fail the build.
 *  - Lenient mode: invalid rows are skipped with WARNs (build continues).
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const IN_FILE = path.join(ROOT, "Data", "top10_input_rows.json");
const OUT_FILE = path.join(ROOT, "Data", "top10_by_year_v1.json");

const CHART = "Billboard Year-End Hot 100";
const SOURCE = "top10_input_rows.json (curated)";

// ---- CLI flags ----
const ARGS = new Set(process.argv.slice(2));
const DEBUG = ARGS.has("--debug");
const LENIENT = ARGS.has("--lenient");

function dbg(...args) {
  if (DEBUG) console.log("[build_top10_by_year_v1][debug]", ...args);
}

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function cleanField(s) {
  let t = cleanText(s);
  t = t.replace(/^"\s*/g, "").replace(/\s*"$/g, "");
  return cleanText(t);
}

function toInt(x) {
  const s = String(x ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function readJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function writeJson(p, obj) {
  const json = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(p, json, "utf8");
}

function fail(msg) {
  console.error(`[build_top10_by_year_v1] ERROR: ${msg}`);
  process.exit(1);
}

function warn(msg) {
  console.warn(`[build_top10_by_year_v1] WARN: ${msg}`);
}

function validateRow(r, i) {
  if (!r || typeof r !== "object") {
    const msg = `Row ${i} is not an object.`;
    if (LENIENT) {
      warn(`${msg} (skipped)`);
      return null;
    }
    fail(msg);
  }

  const year = toInt(r.year);
  const pos = toInt(r.pos);
  const artist = cleanField(r.artist);
  const title = cleanField(r.title);

  if (!year || year < 1950 || year > 2024) {
    const msg = `Row ${i} invalid year: ${r.year}`;
    if (LENIENT) {
      warn(`${msg} (skipped)`);
      return null;
    }
    fail(msg);
  }
  if (!pos || pos < 1 || pos > 10) {
    const msg = `Row ${i} invalid pos (1..10): ${r.pos}`;
    if (LENIENT) {
      warn(`${msg} (skipped)`);
      return null;
    }
    fail(msg);
  }
  if (!artist) {
    const msg = `Row ${i} missing artist`;
    if (LENIENT) {
      warn(`${msg} (skipped)`);
      return null;
    }
    fail(msg);
  }
  if (!title) {
    const msg = `Row ${i} missing title`;
    if (LENIENT) {
      warn(`${msg} (skipped)`);
      return null;
    }
    fail(msg);
  }

  return { year, pos, artist, title };
}

function stableSortRows(a, b) {
  // Deterministic: year asc, pos asc, artist asc, title asc
  if (a.year !== b.year) return a.year - b.year;
  if (a.pos !== b.pos) return a.pos - b.pos;
  const aa = a.artist.localeCompare(b.artist);
  if (aa !== 0) return aa;
  return a.title.localeCompare(b.title);
}

function buildCoverageReport(byYear, expectedYears) {
  const presentYears = Array.from(byYear.keys()).sort((a, b) => a - b);
  const presentSet = new Set(presentYears);

  const missingYears = [];
  for (const y of expectedYears) {
    if (!presentSet.has(y)) missingYears.push(y);
  }

  return { presentYears, missingYears };
}

function build() {
  if (!fs.existsSync(IN_FILE)) fail(`Missing input file: ${IN_FILE}`);

  const raw = readJson(IN_FILE);
  if (!Array.isArray(raw)) fail("Input must be an array.");

  dbg("Input file:", IN_FILE);
  dbg("Raw rows:", raw.length);
  dbg("Mode:", LENIENT ? "lenient" : "strict");

  const rows = raw
    .map((r, i) => validateRow(r, i))
    .filter(Boolean)
    .sort(stableSortRows);

  dbg("Validated rows:", rows.length);

  // Group by year
  const byYear = new Map();
  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year).push(r);
  }

  if (DEBUG) {
    const years = Array.from(byYear.keys()).sort((a, b) => a - b);
    dbg("Years present:", years.join(", "));
    const counts = {};
    for (const y of years) counts[y] = (byYear.get(y) || []).length;
    dbg("Row counts by year:", counts);
  }

  const yearsOut = {};
  const yearList = Array.from(byYear.keys()).sort((a, b) => a - b);

  // Optional: expected span based on what’s in input (keeps it drop-in and non-assumptive)
  const expectedYears = yearList.length
    ? Array.from({ length: yearList[yearList.length - 1] - yearList[0] + 1 }, (_, k) => yearList[0] + k)
    : [];

  // Build per-year Top 10
  let yearsWithComplete10 = 0;

  for (const y of yearList) {
    const items = (byYear.get(y) || []).slice().sort((a, b) => a.pos - b.pos);

    // Deduplicate by pos keeping first deterministic row
    const seenPos = new Set();
    const final = [];
    for (const it of items) {
      if (seenPos.has(it.pos)) {
        warn(`Year ${y}: duplicate pos ${it.pos} (“${it.artist} — ${it.title}”) dropped`);
        continue;
      }
      seenPos.add(it.pos);
      final.push({ pos: it.pos, artist: it.artist, title: it.title });
      if (final.length >= 10) break;
    }

    // Warn on missing positions (always check 1..10)
    let missingCount = 0;
    for (let p = 1; p <= 10; p++) {
      if (!seenPos.has(p)) {
        warn(`Year ${y}: missing pos ${p}`);
        missingCount++;
      }
    }
    if (missingCount === 0) yearsWithComplete10++;

    yearsOut[String(y)] = {
      year: y,
      chart: CHART,
      items: final,
    };
  }

  // Coverage report (informational)
  if (expectedYears.length) {
    const cov = buildCoverageReport(byYear, expectedYears);
    console.log(`[build_top10_by_year_v1] Coverage: ${cov.presentYears.length}/${expectedYears.length} years`);
    if (cov.missingYears.length) {
      console.log(
        `[build_top10_by_year_v1] Missing years (count=${cov.missingYears.length}).`
      );
      if (DEBUG) console.log("[build_top10_by_year_v1][debug] Missing years:", cov.missingYears.join(", "));
    }
  } else {
    console.log("[build_top10_by_year_v1] Coverage: 0/0 years (no valid rows).");
  }

  dbg("Years with complete 1..10:", yearsWithComplete10);

  const out = {
    version: "top10_by_year_v1",
    chart: CHART,
    source: SOURCE,
    generatedAt: new Date().toISOString(),
    meta: {
      inputFile: path.relative(ROOT, IN_FILE).replace(/\\/g, "/"),
      outputFile: path.relative(ROOT, OUT_FILE).replace(/\\/g, "/"),
      strict: !LENIENT,
      validatedRows: rows.length,
      yearsBuilt: yearList.length,
      yearsWithComplete10,
    },
    years: yearsOut,
  };

  writeJson(OUT_FILE, out);
  console.log(`[build_top10_by_year_v1] OK -> ${OUT_FILE}`);
  console.log(`[build_top10_by_year_v1] OK: wrote ${OUT_FILE} (years=${yearList.length})`);
}

build();
