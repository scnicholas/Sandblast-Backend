"use strict";

const fs = require("fs");
const path = require("path");

const kb = require("../Utils/musicKnowledge");

const OUT_PATH = path.resolve(
  __dirname,
  "..",
  "Data",
  "_sanity_music_report_1970_2010.json"
);

const START_YEAR = 1970;
const END_YEAR = 2010;

const CHARTS = [
  { name: "Billboard Year-End Hot 100", start: START_YEAR, end: END_YEAR },
];

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
  if (titleLc.includes(movedLc)) return false;

  const endsHang = isHangWord(tTokens[tTokens.length - 1]);
  const titleShort = tTokens.length <= 2;
  if (!(endsHang || titleShort)) return false;

  if (["the", "and", "feat", "ft"].includes(movedLc)) return false;
  if (moved.length < 3) return false;
  if (!candidateArtist || candidateArtist.length < 2) return false;
  if (["the", "and", "feat", "ft"].includes(norm(candidateArtist))) return false;

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
    "owner",
    "karma",
  ]);

  return KNOWN_SPILLS.has(movedLc);
}

function rankOk(r) {
  const n = Number(r);
  return Number.isFinite(n) && n >= 1 && n <= 100;
}

function safeGetTop10(year, chart) {
  try {
    const list = kb.getTopByYear(year, chart, 10);
    return { ok: true, list };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Ground-truth Top40 checks:
 * - present: chart is named in STATS (optional)
 * - usable: DB actually contains rows for that chart
 */
function detectTop40Present() {
  try {
    const stats = kb.STATS ? kb.STATS() : null;
    const charts = stats?.charts || [];
    return charts.some((c) => norm(c) === norm(TOP40.name));
  } catch {
    return false;
  }
}

function detectTop40Usable(db) {
  try {
    const rows = (db?.moments || []).filter((m) => norm(m.chart) === norm(TOP40.name)).length;
    return rows > 0;
  } catch {
    return false;
  }
}

function ensureOutDir() {
  const dir = path.dirname(OUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Year-End: if Unknown Titles are clustered (>=3 in top 10),
 * record ONE cluster issue and stop spamming UNKNOWN_TITLE entries.
 */
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
      issues.push({ type: "BAD_RANK", msg: `Bad rank: ${r}`, chart: chartName, year, sample: it });
    } else {
      const rn = Number(r);
      if (rn < prev) issues.push({ type: "RANK_ORDER", msg: `Rank decreased @${i}`, chart: chartName, year });
      prev = rn;
    }
  });

  const isYearEnd = chartName.toLowerCase().includes("year-end");
  if (isYearEnd) {
    const unknownTitles = top.filter((x) => isUnknownTitle(x?.title)).length;
    if (unknownTitles >= 3) {
      issues.push({
        type: "YEAREND_UNKNOWN_TITLE_CLUSTER",
        msg: `Year-End Top10 has ${unknownTitles} Unknown Titles (clustered).`,
        chart: chartName,
        year,
        sample: top.slice(0, 5),
      });

      // Still record rotated spill if it exists (different root cause)
      top.forEach((it, i) => {
        if (looksLikeRotatedSpill(it)) {
          issues.push({ type: "ROTATED_SPILL", msg: `Rotated spill @${i}`, chart: chartName, year, sample: it });
        }
      });

      return issues;
    }
  }

  // Normal checks (non-clustered)
  top.forEach((it, i) => {
    const artist = asText(it?.artist);
    const title = asText(it?.title);

    if (!artist) issues.push({ type: "EMPTY_ARTIST", msg: `Empty artist @${i}`, chart: chartName, year, sample: it });
    if (!title) issues.push({ type: "EMPTY_TITLE", msg: `Empty title @${i}`, chart: chartName, year, sample: it });

    if (isUnknownArtist(artist)) issues.push({ type: "UNKNOWN_ARTIST", msg: `Unknown artist @${i}`, chart: chartName, year, sample: it });
    if (isUnknownTitle(title)) issues.push({ type: "UNKNOWN_TITLE", msg: `Unknown title @${i}`, chart: chartName, year, sample: it });

    if (looksLikeRotatedSpill(it)) issues.push({ type: "ROTATED_SPILL", msg: `Rotated spill @${i}`, chart: chartName, year, sample: it });
  });

  return issues;
}

function main() {
  const db = kb.getDb();

  const top40Present = detectTop40Present();
  const top40Usable = detectTop40Usable(db);

  const chartsToRun = CHARTS.slice();
  if (top40Present && top40Usable) chartsToRun.push(TOP40);

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
      top40Present,
      top40Usable,
      top40Rows: (db?.moments || []).filter((m) => norm(m.chart) === norm(TOP40.name)).length,
    },
    failures: [],
  };

  for (const c of chartsToRun) report.summary.byChart[c.name] = { runs: 0, passes: 0, fails: 0 };

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
        bumpIssueType("EXCEPTION");
        report.failures.push({ year: y, chart: c.name, issues: [], error: res.error });
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
  console.log(`Top40 present: ${report.summary.top40Present}`);
  console.log(`Top40 usable: ${report.summary.top40Usable}`);
  console.log(`Top40 rows (DB): ${report.summary.top40Rows}`);
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
      console.log(`  ${f.chart} ${f.year}: ${types.join(", ") || "EXCEPTION"}${f.error ? " | " + f.error : ""}`);
    });
  }

  console.log("\nDone.");
}

main();
