"use strict";

/**
 * Scripts/verify_top10_store_1950_2025.js
 *
 * Verifies Data/top10_by_year_v1.json contains a clean Top 10 for every year.
 *
 * Checks:
 *  - year key exists
 *  - items length >= 10
 *  - positions are 1..10 (or at least have pos)
 *  - title + artist present for each item
 *
 * Usage:
 *  node Scripts/verify_top10_store_1950_2025.js
 */

const fs = require("fs");
const path = require("path");

const YEAR_START = 1950;
const YEAR_END = 2025;

const FILE = path.resolve(__dirname, "..", "Data", "top10_by_year_v1.json");

function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}

function toInt(x) {
  const n = parseInt(String(x || "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function loadJson(fp) {
  const raw = fs.readFileSync(fp, "utf8");
  return JSON.parse(raw);
}

function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`❌ Missing: ${FILE}`);
    process.exitCode = 1;
    return;
  }

  const db = loadJson(FILE);
  const years = db.years || {};

  const missingYears = [];
  const weakYears = []; // exists but not clean
  const okYears = [];

  for (let y = YEAR_START; y <= YEAR_END; y++) {
    const key = String(y);
    const entry = years[key];

    if (!entry) {
      missingYears.push(y);
      continue;
    }

    const items = entry.items || entry.top10 || entry.rows || [];
    if (!Array.isArray(items) || items.length < 10) {
      weakYears.push({ year: y, reason: `items<10 (${Array.isArray(items) ? items.length : "not_array"})` });
      continue;
    }

    const top10 = items.slice(0, 10);
    const problems = [];

    // Check each row
    for (let i = 0; i < 10; i++) {
      const it = top10[i] || {};
      const pos = it.pos ?? it.position ?? it.rank ?? (i + 1);
      const posInt = toInt(pos);
      const title = it.title ?? it.song ?? it.single ?? it.track;
      const artist = it.artist ?? it.artists ?? it.performer;

      if (!posInt) problems.push(`row${i + 1}:missing_pos`);
      if (!isNonEmptyString(title)) problems.push(`row${i + 1}:missing_title`);
      if (!isNonEmptyString(artist)) problems.push(`row${i + 1}:missing_artist`);
    }

    // Optional: check if we have 1..10 positions
    const posSet = new Set(top10.map((it, i) => toInt(it.pos ?? it.position ?? it.rank ?? (i + 1))).filter(Boolean));
    if (posSet.size < 10) problems.push(`positions_not_unique(size=${posSet.size})`);

    if (problems.length) {
      weakYears.push({ year: y, reason: problems.slice(0, 6).join(", ") + (problems.length > 6 ? "..." : "") });
    } else {
      okYears.push(y);
    }
  }

  // Print report
  console.log("======================================");
  console.log("Top10 Store Verification (1950–2025)");
  console.log("File:", FILE);
  console.log("======================================");
  console.log(`OK years: ${okYears.length}`);
  console.log(`Weak years: ${weakYears.length}`);
  console.log(`Missing years: ${missingYears.length}`);
  console.log("");

  if (missingYears.length) {
    console.log("❌ Missing years:");
    console.log(missingYears.join(", "));
    console.log("");
  }

  if (weakYears.length) {
    console.log("⚠️ Weak years (exists but not clean Top10):");
    for (const w of weakYears) {
      console.log(`- ${w.year}: ${w.reason}`);
    }
    console.log("");
  }

  // Exit code
  if (missingYears.length || weakYears.length) {
    process.exitCode = 1;
  } else {
    console.log("✅ All years 1950–2025 are present and clean.");
  }
}

main();
