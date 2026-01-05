// Scripts/validate_music_moments_1950_1990.js
"use strict";

const fs = require("fs");
const path = require("path");

const FILE = process.argv[2] || path.resolve(process.cwd(), "Data/music_moments_v1.json");

const START = 1950;
const END = 1990;

const FORBIDDEN = [
  "interestingly",
  "notably",
  "remarkably",
  "it’s worth",
  "it's worth",
  "in fact",
  "actually",
  "basically",
  "kind of",
  "sort of",
];

function words(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function hasYear(s, y) {
  return new RegExp(`\\b${y}\\b`).test(s);
}

function includesInsensitive(s, needle) {
  return String(s || "").toLowerCase().includes(String(needle).toLowerCase());
}

function loadJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

// Expected shapes:
// 1) Array of entries: [{year, chart, kind, text, ...}]
// 2) Object map: {"1950": {...}} or {"1950_story": "..."} etc.
// We'll support arrays first; map support is best-effort.
function normalize(db) {
  if (Array.isArray(db)) return db;
  if (db && typeof db === "object") {
    // convert map to array if possible
    const out = [];
    for (const [k, v] of Object.entries(db)) {
      if (v && typeof v === "object") {
        out.push({ key: k, ...v });
      } else {
        out.push({ key: k, text: v });
      }
    }
    return out;
  }
  return [];
}

function isStoryMoment(entry) {
  const kind = String(entry.kind || entry.type || entry.layer || entry.tag || "").toLowerCase();
  const key = String(entry.key || "").toLowerCase();
  const text = String(entry.text || entry.reply || entry.moment || entry.story || "");

  // Heuristics:
  // - kind includes "story"
  // - key contains "story"
  // - or text begins with "Story moment"
  if (kind.includes("story")) return true;
  if (key.includes("story")) return true;
  if (/^\s*story moment/i.test(text)) return true;

  return false;
}

function getYear(entry) {
  const y =
    Number(entry.year) ||
    Number(entry.y) ||
    Number(String(entry.key || "").match(/\b(19|20)\d{2}\b/)?.[0]);
  return Number.isFinite(y) ? y : null;
}

function getText(entry) {
  return String(entry.text || entry.reply || entry.moment || entry.story || "").trim();
}

function checkRequiredAnchors(text, year) {
  // Minimal enforcement:
  // - must mention year
  // - must contain an em dash anchor "Artist — Title" at least once
  const hasDashAnchor = /—/.test(text); // we keep it simple and consistent with your UI
  return {
    hasYear: hasYear(text, year),
    hasDashAnchor,
  };
}

function main() {
  const db = loadJson(FILE);
  const rows = normalize(db).filter(isStoryMoment);

  const byYear = new Map();
  for (const r of rows) {
    const y = getYear(r);
    if (!y) continue;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(r);
  }

  const missingYears = [];
  for (let y = START; y <= END; y++) {
    if (!byYear.has(y)) missingYears.push(y);
  }

  const issues = [];
  const warns = [];
  const seenTexts = new Map();

  for (let y = START; y <= END; y++) {
    const entries = byYear.get(y) || [];
    for (const e of entries) {
      const text = getText(e);
      if (!text) {
        issues.push({ year: y, type: "EMPTY_TEXT" });
        continue;
      }

      // sanity junk
      if (/\bundefined\b|\bnull\b/i.test(text)) {
        issues.push({ year: y, type: "JUNK_TOKEN", sample: text.slice(0, 80) });
      }

      const w = words(text).length;
      if (w < 45 || w > 65) {
        issues.push({ year: y, type: "WORDCOUNT_FAIL", words: w });
      } else if (w < 50 || w > 60) {
        warns.push({ year: y, type: "WORDCOUNT_WARN", words: w });
      }

      const req = checkRequiredAnchors(text, y);
      if (!req.hasYear) issues.push({ year: y, type: "MISSING_YEAR_IN_TEXT" });
      if (!req.hasDashAnchor) issues.push({ year: y, type: "MISSING_DASH_ANCHOR" });

      for (const bad of FORBIDDEN) {
        if (includesInsensitive(text, bad)) {
          warns.push({ year: y, type: "FORBIDDEN_FILLER", term: bad });
        }
      }

      // duplicates
      const key = text.replace(/\s+/g, " ").trim().toLowerCase();
      if (seenTexts.has(key)) {
        issues.push({ year: y, type: "DUPLICATE_TEXT", dupOf: seenTexts.get(key) });
      } else {
        seenTexts.set(key, y);
      }
    }
  }

  console.log("=== STORY MOMENTS VALIDATION (1950–1990) ===");
  console.log("File:", FILE);
  console.log("Story entries:", rows.length);
  console.log("Missing years:", missingYears.length ? missingYears.join(", ") : "none");
  console.log("Hard issues:", issues.length);
  console.log("Warnings:", warns.length);

  if (missingYears.length) console.log("\n[MISSING YEARS]\n", missingYears);

  if (issues.length) {
    console.log("\n[HARD ISSUES]");
    for (const i of issues.slice(0, 200)) console.log(i);
    if (issues.length > 200) console.log("...truncated");
  }

  if (warns.length) {
    console.log("\n[WARNINGS]");
    for (const w of warns.slice(0, 200)) console.log(w);
    if (warns.length > 200) console.log("...truncated");
  }

  process.exit(issues.length || missingYears.length ? 1 : 0);
}

main();
