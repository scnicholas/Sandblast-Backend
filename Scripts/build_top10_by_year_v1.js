"use strict";

/**
 * Scripts/build_top10_by_year_v1.js
 *
 * Input:
 *  - Data/top10_input_rows.json (array of {year,pos,artist,title})
 *
 * Output:
 *  - Data/top10_by_year_v1.json
 *
 * Guarantees:
 *  - Deterministic output (stable sort, stable formatting)
 *  - Validates rows (basic strict checks)
 *  - For each year: enforces positions 1..10 (drops extras; warns on missing)
 *  - Normalizes whitespace, strips outer quotes
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const IN_FILE = path.join(ROOT, "Data", "top10_input_rows.json");
const OUT_FILE = path.join(ROOT, "Data", "top10_by_year_v1.json");

const CHART = "Billboard Year-End Hot 100";
const SOURCE = "top10_input_rows.json (curated)";

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
  if (!r || typeof r !== "object") fail(`Row ${i} is not an object.`);

  const year = toInt(r.year);
  const pos = toInt(r.pos);
  const artist = cleanField(r.artist);
  const title = cleanField(r.title);

  if (!year || year < 1950 || year > 2024) fail(`Row ${i} invalid year: ${r.year}`);
  if (!pos || pos < 1 || pos > 10) fail(`Row ${i} invalid pos (1..10): ${r.pos}`);
  if (!artist) fail(`Row ${i} missing artist`);
  if (!title) fail(`Row ${i} missing title`);

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

function build() {
  if (!fs.existsSync(IN_FILE)) fail(`Missing input file: ${IN_FILE}`);

  const raw = readJson(IN_FILE);
  if (!Array.isArray(raw)) fail("Input must be an array.");

  const rows = raw.map(validateRow).sort(stableSortRows);

  // Group by year
  const byYear = new Map();
  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year).push(r);
  }

  const yearsOut = {};
  const yearList = Array.from(byYear.keys()).sort((a, b) => a - b);

  for (const y of yearList) {
    const items = byYear
      .get(y)
      .slice()
      .sort((a, b) => a.pos - b.pos);

    // Deduplicate by (pos) keeping first deterministic row
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

    // Warn on missing positions
    for (let p = 1; p <= Math.min(10, final.length ? 10 : 10); p++) {
      if (!seenPos.has(p)) warn(`Year ${y}: missing pos ${p}`);
    }

    yearsOut[String(y)] = {
      year: y,
      chart: CHART,
      items: final
    };
  }

  const out = {
    version: "top10_by_year_v1",
    chart: CHART,
    source: SOURCE,
    generatedAt: new Date().toISOString(),
    years: yearsOut
  };

  writeJson(OUT_FILE, out);
  console.log(`[build_top10_by_year_v1] OK: wrote ${OUT_FILE} (years=${yearList.length})`);
}

build();
