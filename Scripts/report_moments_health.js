"use strict";

const fs = require("fs");
const path = require("path");

function die(msg) { console.error("[ERR]", msg); process.exit(1); }

function readJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function getMoments(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.moments)) return json.moments;
  die("Input JSON must be an array [] or an object with moments:[]");
}

function norm(s) {
  return String(s || "").toLowerCase().trim();
}

(function main() {
  const inPath = process.argv[2];
  if (!inPath) die("Usage: node scripts/report_moments_health.js <Data/moments.json>");

  const abs = path.resolve(process.cwd(), inPath);
  if (!fs.existsSync(abs)) die("File not found: " + abs);

  const json = readJson(abs);
  const moments = getMoments(json);

  let missingCore = 0;
  let hasCulture = 0;
  let hasFact = 0;
  let hasNext = 0;
  let hasTags = 0;

  const byArtist = new Map();
  const byYear = new Map();
  const byChart = new Map();

  for (const m of moments) {
    const ok = m && m.artist && m.year;
    if (!ok) missingCore++;

    if (m && String(m.cultural_moment || m.culture || "").trim()) hasCulture++;
    if (m && String(m.chart_fact || m.fact || "").trim()) hasFact++;
    if (m && String(m.next_step || m.next || "").trim()) hasNext++;
    if (m && Array.isArray(m.tags) && m.tags.length) hasTags++;

    const a = norm(m.artist);
    if (a) byArtist.set(a, (byArtist.get(a) || 0) + 1);

    const y = String(m.year || "");
    if (y) byYear.set(y, (byYear.get(y) || 0) + 1);

    const c = norm(m.chart || "Billboard Hot 100");
    byChart.set(c, (byChart.get(c) || 0) + 1);
  }

  const total = moments.length;

  function topN(map, n = 10) {
    return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n);
  }

  console.log("=== MUSIC MOMENTS HEALTH ===");
  console.log("File:", abs);
  console.log("Total moments:", total);
  console.log("Missing core (artist/year):", missingCore);
  console.log("Has culture:", `${hasCulture} (${Math.round(hasCulture/total*100)}%)`);
  console.log("Has fact:", `${hasFact} (${Math.round(hasFact/total*100)}%)`);
  console.log("Has next:", `${hasNext} (${Math.round(hasNext/total*100)}%)`);
  console.log("Has tags:", `${hasTags} (${Math.round(hasTags/total*100)}%)`);

  console.log("\nTop Artists:");
  for (const [a, c] of topN(byArtist, 12)) console.log(" -", a, c);

  console.log("\nCharts:");
  for (const [c, n] of topN(byChart, 12)) console.log(" -", c, n);

  console.log("\nTop Years:");
  for (const [y, n] of topN(byYear, 12)) console.log(" -", y, n);
})();
