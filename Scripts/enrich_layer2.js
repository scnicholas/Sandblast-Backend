/**
 * enrich_layer2.js
 * Merge facts-only chart_dump.txt into music_moments_v2.json
 * Output: Data/music_moments_v2_layer2.json
 */

const fs = require("fs");
const path = require("path");

const L1_PATH = path.join(process.cwd(), "Data", "music_moments_v2.json");
const DUMP_PATH = path.join(process.cwd(), "Data", "chart_dump.txt");
const OUT_PATH = path.join(process.cwd(), "Data", "music_moments_v2_layer2.json");

const DEFAULT_CHART = "Billboard Hot 100";

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function parsePipeDump(text) {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trimEnd())
    .filter(l => l && !l.startsWith("#"));

  if (lines.length < 3) return [];

  const header = lines[0].split("|").map(h => norm(h));
  const rows = [];

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("|")) continue;

    const parts = line.split("|").map(p => p.trim());
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = parts[c] ?? "";
    }
    rows.push(obj);
  }
  return rows;
}

function toInt(v) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (["true","yes","y","1"].includes(s)) return true;
  if (["false","no","n","0"].includes(s)) return false;
  return null;
}

function makeKey(artist, title, year, chart) {
  return [
    norm(artist),
    norm(title),
    String(year || "").trim(),
    norm(chart || DEFAULT_CHART),
  ].join("|");
}

(function main() {
  if (!fs.existsSync(L1_PATH)) {
    console.error("❌ Missing Layer1 DB:", L1_PATH);
    process.exit(1);
  }
  if (!fs.existsSync(DUMP_PATH)) {
    console.error("❌ Missing chart dump:", DUMP_PATH);
    process.exit(1);
  }

  const l1 = JSON.parse(fs.readFileSync(L1_PATH, "utf8"));
  if (!l1 || !Array.isArray(l1.moments)) {
    console.error("❌ Layer1 DB missing moments[]:", L1_PATH);
    process.exit(1);
  }

  const dumpRows = parsePipeDump(fs.readFileSync(DUMP_PATH, "utf8"));

  const dumpMap = new Map();
  let dumpCount = 0;

  for (const r of dumpRows) {
    const artist = r["artist"] || "";
    const title = r["title"] || "";
    const year = r["year"] || "";
    const chart = r["chart"] || DEFAULT_CHART;

    if (!artist || (!title && !year)) continue;

    const key = makeKey(artist, title, year, chart);
    dumpMap.set(key, {
      peak: toInt(r["peak"]),
      weeks_on_chart: toInt(r["weeks_on_chart"]),
      is_number_one: toBool(r["is_number_one"]),
      number_one_weeks: toInt(r["number_one_weeks"]),
      anchor_week: r["anchor_week"] || null,
      source: r["source"] || null,
    });
    dumpCount++;
  }

  let enriched = 0;
  let missing = 0;

  const out = { ...l1 };
  out.moments = l1.moments.map(m => {
    const key = makeKey(
      m.artist,
      m.title || "",
      m.year,
      m.chart || DEFAULT_CHART
    );

    const hit = dumpMap.get(key);

    if (hit) {
      enriched++;
      return { ...m, ...hit };
    } else {
      missing++;
      return m;
    }
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");

  console.log("✅ Layer 2 enrichment complete");
  console.log("   Dump rows:", dumpCount);
  console.log("   Moments:", l1.moments.length);
  console.log("   Enriched:", enriched);
  console.log("   Missing:", missing);
  console.log("   Output:", OUT_PATH);
})();
