"use strict";

/**
 * Validate story moments coverage (1950–2024) in Data/music_moments_v1.json.
 * - Strips JSON comments
 * - Parses JSON
 * - Checks per-year presence and required fields
 * - Checks word count guardrails
 * - Writes a report to Data/_reports/story_validate_1950_2024.json
 *
 * Usage:
 *   node Scripts/validate_story_moments_1950_2024.js
 */

const fs = require("fs");
const path = require("path");

const FILE = path.resolve(process.cwd(), "Data/music_moments_v1.json");
const OUT_DIR = path.resolve(process.cwd(), "Data/_reports");
const OUT_FILE = path.resolve(OUT_DIR, "story_validate_1950_2024.json");

const MIN_YEAR = 1950;
const MAX_YEAR = 2024;

// Guardrails: keep generous to avoid false fails.
// Tighten later (e.g., 45–70) once you're happy.
const WORD_MIN = 35;
const WORD_MAX = 85;

function stripJsonComments(s) {
  s = String(s || "");
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");
  s = s.replace(/^\s*\/\/.*$/gm, "");
  return s;
}

function wc(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function main() {
  if (!fs.existsSync(FILE)) {
    console.error("Missing:", FILE);
    process.exit(2);
  }

  const raw = fs.readFileSync(FILE, "utf8");
  const stripped = stripJsonComments(raw);

  let j;
  try {
    j = JSON.parse(stripped);
  } catch (e) {
    console.error("PARSE FAIL after comment stripping:", e.message);
    process.exit(1);
  }

  const moments = Array.isArray(j.moments) ? j.moments : [];
  const stories = moments.filter((m) => String(m?.type || "").toLowerCase() === "story_moment");

  // Index by year
  const byYear = new Map();
  for (const s of stories) {
    const y = Number(s?.year);
    if (!Number.isFinite(y)) continue;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(s);
  }

  const missingYears = [];
  const issues = [];

  for (let year = MIN_YEAR; year <= MAX_YEAR; year++) {
    const arr = byYear.get(year) || [];
    if (!arr.length) {
      missingYears.push(year);
      continue;
    }

    for (const obj of arr) {
      const id = isNonEmptyString(obj.id) ? obj.id : null;

      // Required fields
      const required = ["id", "type", "year", "title", "artist", "moment_text"];
      for (const k of required) {
        const v = obj[k];
        const ok =
          (k === "year" && Number.isFinite(Number(v))) ||
          (k !== "year" && isNonEmptyString(v));
        if (!ok) {
          issues.push({ year, id, issue: `missing_or_invalid_field:${k}` });
        }
      }

      // Word count guardrail
      const count = wc(obj.moment_text);
      if (count < WORD_MIN || count > WORD_MAX) {
        issues.push({ year, id, issue: `word_count:${count}` });
      }

      // Soft checks (don’t fail, but flag)
      // 1) Unknown fallbacks
      if (String(obj.title || "").toLowerCase().includes("unknown") ||
          String(obj.artist || "").toLowerCase().includes("unknown")) {
        issues.push({ year, id, issue: "contains_unknown_title_or_artist" });
      }

      // 2) CTA consistency (optional: you can remove this if you vary endings later)
      const mt = String(obj.moment_text || "");
      if (!/Want the top 10, a micro-moment, or the next year\?\s*$/i.test(mt.trim())) {
        issues.push({ year, id, issue: "cta_missing_or_nonstandard" });
      }
    }
  }

  const report = {
    ok: missingYears.length === 0 && issues.length === 0,
    file: FILE,
    range: { minYear: MIN_YEAR, maxYear: MAX_YEAR },
    guardrails: { wordMin: WORD_MIN, wordMax: WORD_MAX },
    counts: {
      totalMoments: moments.length,
      storyMoments: stories.length,
    },
    missingYears,
    issues,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log("VALIDATION DONE");
  console.log("Story count:", stories.length);
  console.log("Missing years:", missingYears.length);
  console.log("Issues:", issues.length);
  console.log("Report:", OUT_FILE);

  process.exit(report.ok ? 0 : 1);
}

main();
