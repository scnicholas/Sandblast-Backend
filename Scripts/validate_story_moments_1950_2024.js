"use strict";

/**
 * Validate story moments coverage (1950–2024) in Data/music_moments_v1.json.
 */

const fs = require("fs");
const path = require("path");

const FILE = path.resolve(process.cwd(), "Data/music_moments_v1.json");
const OUT_DIR = path.resolve(process.cwd(), "Data/_reports");
const OUT_FILE = path.resolve(OUT_DIR, "story_validate_1950_2024.json");

const MIN_YEAR = 1950;
const MAX_YEAR = 2024;
const WORD_MIN = 35;
const WORD_MAX = 85;

function stripJsonComments(s) {
  return String(s || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function wc(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function main() {
  if (!fs.existsSync(FILE)) {
    console.error("Missing:", FILE);
    process.exit(2);
  }

  let json;
  try {
    json = JSON.parse(stripJsonComments(fs.readFileSync(FILE, "utf8")));
  } catch (e) {
    console.error("JSON parse failed:", e.message);
    process.exit(1);
  }

  const moments = Array.isArray(json.moments) ? json.moments : [];
  const stories = moments.filter(m => m.type === "story_moment");

  const byYear = {};
  for (const s of stories) {
    if (!byYear[s.year]) byYear[s.year] = [];
    byYear[s.year].push(s);
  }

  const missingYears = [];
  const issues = [];

  for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
    if (!byYear[y] || byYear[y].length === 0) {
      missingYears.push(y);
      continue;
    }

    for (const s of byYear[y]) {
      if (!s.id || !s.title || !s.artist || !s.moment_text) {
        issues.push({ year: y, id: s.id || null, issue: "missing_required_field" });
      }

      const count = wc(s.moment_text);
      if (count < WORD_MIN || count > WORD_MAX) {
        issues.push({ year: y, id: s.id, issue: `word_count_${count}` });
      }

      if (/unknown/i.test(s.title) || /unknown/i.test(s.artist)) {
        issues.push({ year: y, id: s.id, issue: "unknown_title_or_artist" });
      }
    }
  }

  const report = {
    ok: missingYears.length === 0 && issues.length === 0,
    range: { MIN_YEAR, MAX_YEAR },
    counts: {
      storyMoments: stories.length
    },
    missingYears,
    issues
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log("VALIDATION COMPLETE");
  console.log("Stories:", stories.length);
  console.log("Missing years:", missingYears.length);
  console.log("Issues:", issues.length);
  console.log("Report:", OUT_FILE);

  process.exit(report.ok ? 0 : 1);
}

main();
