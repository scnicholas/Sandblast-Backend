/**
 * Fill missing titles in Data/music_moments_v2_layer2.json
 * using a Top40Weekly CSV dump.
 *
 * Usage:
 *   node scripts/fill_titles_from_top40weekly.js \
 *     Data/music_moments_v2_layer2.json \
 *     Data/top40weekly_1960_2025.csv \
 *     Data/music_moments_v2_layer2_filled.json
 */

"use strict";

const fs = require("fs");

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const inJson = process.argv[2];
const inCsv = process.argv[3];
const outJson = process.argv[4];

if (!inJson || !inCsv || !outJson) {
  console.error("Usage: node scripts/fill_titles_from_top40weekly.js <in.json> <in.csv> <out.json>");
  process.exit(1);
}

// ---- read JSON ----
const db = JSON.parse(fs.readFileSync(inJson, "utf8"));
if (!db || !Array.isArray(db.moments)) {
  throw new Error("Input JSON missing moments[]");
}

// ---- read CSV (UTF-8 or UTF-16LE safe) ----
const buf = fs.readFileSync(inCsv);

// Detect UTF-16LE by presence of many null bytes
let csvText;
const sample = buf.slice(0, Math.min(buf.length, 2000));
let nulls = 0;
for (let i = 0; i < sample.length; i++) if (sample[i] === 0x00) nulls++;
const looksUtf16 = nulls > sample.length * 0.2;

csvText = buf.toString(looksUtf16 ? "utf16le" : "utf8");

// Strip BOM + normalize newlines
csvText = csvText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const lines = csvText.split("\n").map(l => l.trim()).filter(Boolean);
const header = (lines.shift() || "").replace(/^\uFEFF/, "").trim().toLowerCase();

if (header !== "year,artist,title") {
  throw new Error(`CSV header mismatch. Got: "${header}" (expected "year,artist,title")`);
}

// ---- build map: norm(artist)|year -> title ----
// CSV format expected: year,"artist","title"
const map = new Map();

for (const line of lines) {
  const m = line.match(/^(\d{4}),"([^"]*(?:""[^"]*)*)","([^"]*(?:""[^"]*)*)"$/);
  if (!m) continue;

  const year = parseInt(m[1], 10);
  const artist = m[2].replace(/""/g, '"').trim();
  const title = m[3].replace(/""/g, '"').trim();

  if (!artist || !title || !year) continue;

  const key = `${norm(artist)}|${year}`;
  if (!map.has(key)) map.set(key, title);
}

// ---- fill blanks ----
let filled = 0;
let stillBlank = 0;

for (const moment of db.moments) {
  const artist = String(moment.artist || "").trim();
  const year = Number(moment.year || 0) || null;
  const title = String(moment.title || "").trim();

  if (!artist || !year) continue;

  if (!title) {
    const key = `${norm(artist)}|${year}`;
    const t = map.get(key);
    if (t) {
      moment.title = t;
      filled++;
    } else {
      stillBlank++;
    }
  }
}

// ---- metadata ----
db.version = (db.version || "music_moments") + "_titles_filled";
db.source = (db.source || "") + " + titles filled from Top40Weekly CSV";
db.generatedAt = new Date().toISOString();

fs.writeFileSync(outJson, JSON.stringify(db, null, 2), "utf8");

console.log(`DONE. filled=${filled}, stillBlank=${stillBlank}, total=${db.moments.length}`);
