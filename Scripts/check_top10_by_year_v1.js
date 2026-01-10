"use strict";

/**
 * Scripts/check_top10_by_year_v1.js
 *
 * Validates:
 *  - Data/top10_by_year_v1.json structure
 *  - For each year: items contain pos 1..10 (or at least pos 1..N), no duplicates
 *  - Artist/title non-empty
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FILE = path.join(ROOT, "Data", "top10_by_year_v1.json");

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function toInt(x) {
  const s = String(x ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fail(msg) {
  console.error(`[check_top10_by_year_v1] ERROR: ${msg}`);
  process.exit(1);
}

function warn(msg) {
  console.warn(`[check_top10_by_year_v1] WARN: ${msg}`);
}

function readJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function check() {
  if (!fs.existsSync(FILE)) fail(`Missing file: ${FILE}`);

  const doc = readJson(FILE);
  if (!doc || typeof doc !== "object") fail("File is not an object.");
  if (doc.version !== "top10_by_year_v1") fail(`Bad version: ${doc.version}`);
  if (!cleanText(doc.chart)) fail("Missing chart");
  if (!cleanText(doc.source)) fail("Missing source");
  if (!cleanText(doc.generatedAt)) fail("Missing generatedAt");
  if (!doc.years || typeof doc.years !== "object") fail("Missing years object");

  const keys = Object.keys(doc.years);
  if (!keys.length) fail("years is empty");

  for (const k of keys) {
    const node = doc.years[k];
    const y = toInt(node?.year);
    if (!y || y < 1950 || y > 2024) fail(`Bad year node: key=${k}`);
    if (!Array.isArray(node.items) || !node.items.length) fail(`Year ${y}: empty items`);

    const seen = new Set();
    for (const it of node.items) {
      const pos = toInt(it.pos);
      const artist = cleanText(it.artist);
      const title = cleanText(it.title);

      if (!pos || pos < 1 || pos > 10) fail(`Year ${y}: invalid pos ${it.pos}`);
      if (seen.has(pos)) fail(`Year ${y}: duplicate pos ${pos}`);
      seen.add(pos);

      if (!artist) fail(`Year ${y} pos ${pos}: missing artist`);
      if (!title) fail(`Year ${y} pos ${pos}: missing title`);
    }

    // Encourage completeness but do not fail for partial years (early build)
    for (let p = 1; p <= 10; p++) {
      if (!seen.has(p)) warn(`Year ${y}: missing pos ${p}`);
    }
  }

  console.log(`[check_top10_by_year_v1] OK: ${FILE} years=${keys.length}`);
}

check();
