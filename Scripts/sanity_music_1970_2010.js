"use strict";

/**
 * Scripts/sanity_music_1970_2010.js
 *
 * Run:
 *   node Scripts/sanity_music_1970_2010.js
 *
 * Output:
 *   - Console summary (PASS/FAIL counts)
 *   - Data/_sanity_music_report_1970_2010.json (detailed findings)
 *
 * What it checks (per year, per chart):
 *   - Can fetch Top 10 without crashing
 *   - Ranks are 1..10 and non-decreasing
 *   - No undefined/empty artist/title
 *   - Unknown Title/Artist thresholds (especially Year-End)
 *   - Detects "rotated spill" signature (STRICT, whitelist-based)
 *
 * Notes:
 *   - This is a regression tool. Keep it strict, but not stupid.
 *   - We do systemic repairs in Utils/musicKnowledge.js; this script tells us where to focus next.
 */

const fs = require("fs");
const path = require("path");

const kb = require("../Utils/musicKnowledge");

const OUT_PATH = path.resolve(
  __dirname,
  "..",
  "Data",
  "_sanity_music_report_1970_2010.json"
);

// Primary sweep range
const START_YEAR = 1970;
const END_YEAR = 2010;

/**
 * IMPORTANT:
 * Do NOT include "Billboard Hot 100" here unless you have a ranked Hot 100 dataset.
 * Your base DB is "moments" and won't reliably support "Top 10 by year" semantics for Hot 100.
 */
const CHARTS = [
  { name: "Billboard Year-End Hot 100", start: START_YEAR, end: END_YEAR },
];

// Optional chart (only if present)
const TOP40 = { name: "Top40Weekly Top 100", start: 1980, end: 1999 };

function asText(x) {
  return x == null ? "" : String(x).trim();
}

function norm(x) {
  return asText(x).toLowerCase().replace(/\s+/g, " ").trim();
}

function isUnknownTitle(s) {
  const t = norm(s);
  return !t || t === "unknown title";
}

function isUnknownArtist(s) {
  const t = norm(s);
  return !t || t === "unknown artist";
}

function isHangWord(w) {
  const t = norm(w);
  return [
    "a", "an", "the", "this", "that",
    "to", "in", "on", "of", "for", "with", "at", "from", "by",
    "and", "or",
    "its", "my", "your", "me", "you", "her", "his", "our", "their",
  ].includes(t);
}

/**
 * STRICT rotated-spill detector (whitelist-based):
 *
 * We ONLY flag the corruption signature actually seen in your dataset:
 *   artist="Away Chicago", title="Look"  -> should be "Chicago — Look Away"
 *   artist="Thorn Poison", title="Every Rose Has Its" -> should be "Poison — Every Rose Has Its Thorn"
 *
 * To avoid false positives (e.g., "Elton John — Crocodile Rock"):
 *  - artist MUST be exactly 2 tokens
 *  - title must be short (<=2 words) OR end with a hang word
 *  - moved token (artist[0]) must be in KNOWN_SPILLS
 *  - moved token must NOT already exist in title
 */
function looksLikeRotatedSpill(item) {
  const artist = asText(item?.artist);
  const title = asText(item?.title);
  if (!artist || !title) return false;

  const aTokens = artist.split(/\s+/).filter(Boolean);
  const tTokens = title.split(/\s+/).filter(Boolean);

  if (aTokens.length !== 2) return false;
  if (tTokens.length < 1) return false;

  const moved = aTokens[0];
  const candidateArtist = aTokens[1];

  const movedLc = norm(moved);
  const titleLc = norm(title);

  if (!movedLc) return false;

  // If moved token already exists in title, not a spill
  if (titleLc.includes(movedLc)) return false;

  // Only flag if the title is clearly incomplete/short in a way consistent with the corruption
  const endsHang = isHangWord(tTokens[tTokens.length - 1]);
  const titleShort = tTokens.length <= 2;
  if (!(endsHang || titleShort)) return false;

  // Exclude obvious junk / connectors
  if (["the", "and", "feat", "ft"].includes(movedLc)) return false;
  if (moved.length < 3) return false;
  if (!candidateArtist || candidateArtist.length < 2) return false;
  if (["the", "and", "feat", "ft"].includes(norm(candidateArtist))) return false;

  // STRICT whitelist of known spill tokens observed in your corruption families
  const KNOWN_SPILLS = new Set([
    "away",
    "thorn",
    "time",
    "words",
    "believe",
    "scrubs",
    "vogue",
    "unbelievable",
    "chameleon",
    "tonight",
    "richer",
    "heart",
    "owner", // (Owner of a Lonely...)
    "karma", // (Karma Chameleon)
  ]);

  if (!KNOWN_SPILLS.has(movedLc)) return false;

  return true;
}

function rankOk(r) {
  const n = Number(r);
  return Number.isFinite(n) && n >= 1 && n <= 100;
}

function top10Checks(list, chartName, year) {
  const issues = [];

  if (!Array.isArray(list) || list.length === 0) {
    issues.push({ type: "NO_DATA", msg: "No results returned", chart: chartName, year });
    return issues;
  }

  const top = list.slice(0, 10);

  // Rank checks
  let prev = 0;
  top.forEach((it, i) => {
    const r = it?.rank ?? i + 1;
    if (!rankOk(r)) {
      issues.push({
        type: "BAD_RANK",
        msg: `Bad rank: ${r}`,
        chart: chartName,
        year,
        sample: it,
      });
    } else {
      const rn = Number(r);
      if (rn < prev) {
        issues.push({
          type: "RANK_ORDER",
          msg: `Rank decreased at index ${i}: ${prev} -> ${rn}`,
          chart: chartName,
          year,
        });
      }
      prev = rn;
    }
  });

  // Field presence + corruption signatures
  top.forEach((it, i) => {
    const artist = asText(it?.artist);
    const title = asText(it?.title);

    if (!artist) {
      issues.push({
        type: "EMPTY_ARTIST",
        msg: `Empty artist @${i}`,
        chart: chartName,
        year,
        sample: it,
      });
    }
    if (!title) {
      issues.push({
        type: "EMPTY_TITLE",
        msg: `Empty title @${i}`,
        chart: chartName,
        year,
        sample: it,
      });
    }

    if (isUnknownArtist(artist)) {
      issues.push({
        type: "UNKNOWN_ARTIST",
        msg: `Unknown artist @${i}`,
        chart: chartName,
        year,
        sample: it,
      });
    }
    if (isUnknownTitle(title)) {
      issues.push({
        type: "UNKNOWN_TITLE",
        msg: `Unknown title @${i}`,
        chart: chartName,
        year,
        sample: it,
      });
    }

    if (looksLikeRotatedSpill(it)) {
      issues.push({
        type: "ROTATED_SPILL",
        msg: `Rotated spill signature @${i}`,
        chart: chartName,
        year,
        sample: it,
      });
    }
  });

  // Year-End threshold checks
  if (chartName.toLowerCase().includes("year-end")) {
    const unknownTitles = top.filter((x) => isUnknownTitle(x?.title)).length;
    if (unknownTitles >= 3) {
      issues.push({
        type: "YEAREND_UNKNOWN_TITLE_CLUSTER",
        msg: `Too many Unknown Titles in Top 10: ${unknownTitles}`,
        chart: chartName,
        year,
      });
    }
  }

  return issues;
}

function safeGetTop10(year, chart) {
  try {
    const list = kb.getTopByYear(year, chart, 10);
    return { ok: true, list };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function detectTop40Presence() {
  try {
    const stats = kb.STATS ? kb.STATS() : null;
    const charts = stats?.charts || [];
    return charts.some((c) => norm(c) === norm(TOP40.name));
  } catch {
    return false;
  }
}

function ensureOutDir() {
  const dir = path.dirname(OUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function main() {
  kb.getDb();

  const hasTop40 = detectTop40Presence();
  const chartsToRun = CHARTS.slice();
  if (hasTop40) chartsToRun.push(TOP40);

  const report = {
    ok: true,
    ranAt: new Date().toISOString(),
    range: { start: START_YEAR, end: END_YEAR },
    charts: chartsToRun.map((c) => ({ name: c.name, start: c.start, end: c.end })),
    summary: {
      totalRuns: 0,
      passes: 0,
      fails: 0,
      byChart: {},
      byIssueType: {},
    },
    failures: [],
  };

  for (const c of chartsToRun) {
    report.summary.byChart[c.name] = { runs: 0, passes: 0, fails: 0 };
  }

  const bumpIssueType = (type) => {
    report.summary.byIssueType[type] = (report.summary.byIssueType[type] || 0) + 1;
  };

  for (const c of chartsToRun) {
    for (let y = c.start; y <= c.end; y++) {
      report.summary.totalRuns++;
      report.summary.byChart[c.name].runs++;

      const res = safeGetTop10(y, c.name);

      if (!res.ok) {
        report.summary.fails++;
        report.summary.byChart[c.name].fails++;
        const entry = { year: y, chart: c.name, issues: [], error: res.error };
        bumpIssueType("EXCEPTION");
        report.failures.push(entry);
        continue;
      }

      const issues = top10Checks(res.list, c.name, y);

      if (!issues.length) {
        report.summary.passes++;
        report.summary.byChart[c.name].passes++;
      } else {
        report.summary.fails++;
        report.summary.byChart[c.name].fails++;
        issues.forEach((i) => bumpIssueType(i.type));
        report.failures.push({ year: y, chart: c.name, issues });
      }
    }
  }

  ensureOutDir();
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("=== MUSIC SANITY REPORT ===");
  console.log(`Range: ${START_YEAR}–${END_YEAR}`);
  console.log(`Output: ${OUT_PATH}`);
  console.log(`Total runs: ${report.summary.totalRuns}`);
  console.log(`Passes: ${report.summary.passes}`);
  console.log(`Fails: ${report.summary.fails}`);
  console.log("");

  for (const [chart, stats] of Object.entries(report.summary.byChart)) {
    console.log(`Chart: ${chart}`);
    console.log(`  runs: ${stats.runs}  passes: ${stats.passes}  fails: ${stats.fails}`);
  }

  console.log("");
  console.log("Top issue types:");
  const sortedTypes = Object.entries(report.summary.byIssueType).sort((a, b) => b[1] - a[1]);
  sortedTypes.slice(0, 12).forEach(([t, n]) => console.log(`  ${t}: ${n}`));

  if (report.failures.length) {
    console.log("\nSample failures (first 10):");
    report.failures.slice(0, 10).forEach((f) => {
      const types = (f.issues || []).map((i) => i.type);
      console.log(
        `  ${f.chart} ${f.year}: ${types.join(", ") || "EXCEPTION"}${f.error ? " | " + f.error : ""}`
      );
    });
  }

  console.log("");
  console.log("Done.");
}

main();
