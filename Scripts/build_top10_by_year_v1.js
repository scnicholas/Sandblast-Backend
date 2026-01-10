"use strict";

/**
 * build_top10_by_year_v1.js
 *
 * Input:  Data/top10_by_year_source_v1.json  (human-editable)
 * Output: Data/top10_by_year_v1.json         (normalized, runtime-ready)
 *
 * Guarantees:
 * - Valid years within range
 * - Each included year has exactly positions 1..10 (unless you choose lenient mode)
 * - No duplicate positions, normalized strings, stable item keys
 * - Coverage report (missing years list)
 *
 * Usage:
 *   node Scripts/build_top10_by_year_v1.js
 *   node Scripts/build_top10_by_year_v1.js --lenient
 *
 * Lenient mode:
 * - Allows missing positions (still normalizes what exists)
 * - Still reports coverage and missing positions
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();
const INFILE = path.join(ROOT, "Data", "top10_by_year_source_v1.json");
const OUTFILE = path.join(ROOT, "Data", "top10_by_year_v1.json");

const args = new Set(process.argv.slice(2));
const LENIENT = args.has("--lenient");

function die(msg) {
  console.error(`[build_top10_by_year_v1] ERROR: ${msg}`);
  process.exit(1);
}

function readJson(fp) {
  if (!fs.existsSync(fp)) die(`Missing file: ${fp}`);
  const raw = fs.readFileSync(fp, "utf8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    die(`Invalid JSON in ${fp}: ${String(e && e.message ? e.message : e)}`);
  }
}

function writeJson(fp, obj) {
  const out = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(fp, out, "utf8");
}

function cleanText(s) {
  return String(s || "")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const i = Math.floor(x);
  if (i < min || i > max) return null;
  return i;
}

function stableKey(year, pos, title, artist) {
  const base = `${year}|${pos}|${cleanText(title).toLowerCase()}|${cleanText(artist).toLowerCase()}`;
  return crypto.createHash("sha1").update(base).digest("hex").slice(0, 16);
}

function normalizeItem(year, item) {
  if (!item || typeof item !== "object") return null;

  const pos = clampInt(item.pos, 1, 10);
  const title = cleanText(item.title);
  const artist = cleanText(item.artist);

  if (!pos) return null;
  if (!title) return null;
  if (!artist) return null;

  return {
    pos,
    title,
    artist,
    key: stableKey(year, pos, title, artist),
  };
}

function validateYearBlock(year, items) {
  const positions = new Set(items.map((x) => x.pos));
  const missing = [];
  for (let p = 1; p <= 10; p++) if (!positions.has(p)) missing.push(p);

  // duplicates
  if (positions.size !== items.length) {
    // find duplicates
    const seen = new Set();
    const dup = [];
    for (const it of items) {
      if (seen.has(it.pos)) dup.push(it.pos);
      seen.add(it.pos);
    }
    die(`Year ${year}: duplicate positions found: ${Array.from(new Set(dup)).join(", ")}`);
  }

  if (!LENIENT && missing.length) {
    die(`Year ${year}: missing positions ${missing.join(", ")} (run with --lenient to allow partial years)`);
  }

  // sorted
  items.sort((a, b) => a.pos - b.pos);

  return { missingPositions: missing };
}

function main() {
  const src = readJson(INFILE);

  const srcVersion = cleanText(src.version);
  if (srcVersion !== "top10_by_year_source_v1") {
    die(`Unexpected source version. Expected "top10_by_year_source_v1", got "${srcVersion || "EMPTY"}"`);
  }

  const chart = cleanText(src.chart) || "Billboard Year-End Hot 100";
  const minYear = clampInt(src?.range?.minYear, 1800, 3000) ?? 1950;
  const maxYear = clampInt(src?.range?.maxYear, 1800, 3000) ?? 2024;
  if (minYear > maxYear) die(`range invalid: minYear ${minYear} > maxYear ${maxYear}`);

  const yearsObj = src.years && typeof src.years === "object" ? src.years : {};
  const normalizedYears = {};
  const present = [];
  const missing = [];
  const perYearWarnings = {};

  for (let y = minYear; y <= maxYear; y++) {
    const key = String(y);
    const rawList = yearsObj[key];

    if (!Array.isArray(rawList) || rawList.length === 0) {
      missing.push(y);
      continue;
    }

    // normalize items
    const items = [];
    for (const raw of rawList) {
      const it = normalizeItem(y, raw);
      if (!it) {
        if (!perYearWarnings[key]) perYearWarnings[key] = [];
        perYearWarnings[key].push(`Dropped invalid item: ${JSON.stringify(raw).slice(0, 180)}`);
        continue;
      }
      items.push(it);
    }

    if (!items.length) {
      missing.push(y);
      continue;
    }

    const { missingPositions } = validateYearBlock(y, items);
    if (missingPositions.length) {
      if (!perYearWarnings[key]) perYearWarnings[key] = [];
      perYearWarnings[key].push(`Missing positions: ${missingPositions.join(", ")}`);
    }

    normalizedYears[key] = {
      year: y,
      chart,
      items,
    };
    present.push(y);
  }

  const out = {
    version: "top10_by_year_v1",
    chart,
    generatedAt: new Date().toISOString(),
    range: { minYear, maxYear },
    coverage: {
      yearsPresent: present.length,
      yearsMissing: missing.length,
      present,
      missing,
    },
    years: normalizedYears,
  };

  // attach warnings only if any exist (keeps runtime clean)
  const warnKeys = Object.keys(perYearWarnings);
  if (warnKeys.length) out.warnings = perYearWarnings;

  writeJson(OUTFILE, out);

  console.log(`[build_top10_by_year_v1] OK -> ${path.relative(ROOT, OUTFILE)}`);
  console.log(`[build_top10_by_year_v1] Coverage: ${present.length}/${(maxYear - minYear + 1)} years`);
  if (missing.length) console.log(`[build_top10_by_year_v1] Missing years (count=${missing.length}).`);
  if (warnKeys.length) console.log(`[build_top10_by_year_v1] Warnings in output (count=${warnKeys.length}).`);
}

main();
