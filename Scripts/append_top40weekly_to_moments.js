/**
 * Append Top40Weekly Top 100 (year-end) rows from CSV into your music moments JSON.
 *
 * CSV format (header required):
 *   year,artist,title
 *
 * Input JSON supported formats:
 *  A) { "moments": [ ... ] }
 *  B) [ ... ]
 *
 * Output keeps your schema:
 *   {
 *     "artist": "Peter Cetera",
 *     "title": "Glory of Love",
 *     "year": 1986,
 *     "chart": "Top40Weekly Top 100",
 *     "aka": [],
 *     "tags": ["year-end", "top40weekly"]
 *   }
 *
 * Usage (from backend root):
 *   node scripts/append_top40weekly_to_moments.js ^
 *     Data/top40weekly_top100_1960_2019.csv ^
 *     Data/music_moments_v2_layer2.json ^
 *     Data/music_moments_v2_layer2_plus500.json ^
 *     500
 *
 * Optional filters:
 *   --fromYear=1970 --toYear=1998
 */

"use strict";

const fs = require("fs");
const path = require("path");

function die(msg) {
  console.error("[ERR]", msg);
  process.exit(1);
}

function norm(s) {
  return String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normKey(s) {
  return norm(s).toLowerCase();
}

function parseArgs(argv) {
  const args = {
    csvPath: argv[2],
    inJsonPath: argv[3],
    outJsonPath: argv[4],
    addCount: argv[5] ? parseInt(argv[5], 10) : 500,
    fromYear: null,
    toYear: null,
  };

  for (const a of argv.slice(6)) {
    const m1 = a.match(/^--fromYear=(\d{4})$/);
    if (m1) args.fromYear = parseInt(m1[1], 10);
    const m2 = a.match(/^--toYear=(\d{4})$/);
    if (m2) args.toYear = parseInt(m2[1], 10);
  }

  if (!args.csvPath || !args.inJsonPath || !args.outJsonPath) {
    die("Usage: node scripts/append_top40weekly_to_moments.js <csv> <in.json> <out.json> [addCount] [--fromYear=YYYY --toYear=YYYY]");
  }
  if (!args.addCount || args.addCount < 1) {
    die("addCount must be a positive integer (e.g., 500).");
  }

  return args;
}

function readJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function parseCsv(csvText) {
  // Simple CSV parser for this controlled format:
  // year,"Artist","Title"
  // Handles quoted values with commas and escaped quotes.
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (!lines.length) die("CSV is empty.");
  const header = lines[0].trim();
  if (header !== "year,artist,title") {
    die(`CSV header must be exactly: year,artist,title (got: ${header})`);
  }

  function parseLine(line) {
    // year,<artist>,<title>
    // artist/title might be quoted.
    let i = 0;
    const out = [];

    while (i < line.length) {
      if (line[i] === ",") { i++; continue; }

      if (line[i] === '"') {
        i++;
        let buf = "";
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            buf += '"';
            i += 2;
            continue;
          }
          if (line[i] === '"') { i++; break; }
          buf += line[i];
          i++;
        }
        out.push(buf);
        if (line[i] === ",") i++;
      } else {
        let buf = "";
        while (i < line.length && line[i] !== ",") {
          buf += line[i];
          i++;
        }
        out.push(buf.trim());
        if (line[i] === ",") i++;
      }
    }
    return out;
  }

  const rows = [];
  for (let idx = 1; idx < lines.length; idx++) {
    const cols = parseLine(lines[idx]);
    if (cols.length < 3) continue;

    const year = parseInt(cols[0], 10);
    const artist = norm(cols[1]);
    const title = norm(cols[2]);

    if (!year || !artist || !title) continue;

    rows.push({ year, artist, title });
  }
  return rows;
}

function getMomentsContainer(json) {
  if (Array.isArray(json)) {
    return { container: json, wrapper: null }; // output as array
  }
  if (json && Array.isArray(json.moments)) {
    return { container: json.moments, wrapper: json }; // output as {moments:[]}
  }
  // If your structure is different, fail loudly
  die("Input JSON must be either an array [] or an object with a moments: [] array.");
}

function makeDedupKey(m) {
  const artist = normKey(m.artist);
  const title = normKey(m.title);
  const year = String(m.year || "");
  const chart = normKey(m.chart || "");
  return `${artist}||${title}||${year}||${chart}`;
}

(function main() {
  const args = parseArgs(process.argv);

  const csvPath = path.resolve(process.cwd(), args.csvPath);
  const inJsonPath = path.resolve(process.cwd(), args.inJsonPath);
  const outJsonPath = path.resolve(process.cwd(), args.outJsonPath);

  if (!fs.existsSync(csvPath)) die(`CSV not found: ${csvPath}`);
  if (!fs.existsSync(inJsonPath)) die(`Input JSON not found: ${inJsonPath}`);

  const csvText = fs.readFileSync(csvPath, "utf8");
  const csvRows = parseCsv(csvText);

  const json = readJson(inJsonPath);
  const { container: moments, wrapper } = getMomentsContainer(json);

  // Build dedupe set from existing moments
  const existing = new Set();
  for (const m of moments) {
    if (!m || !m.artist || !m.title || !m.year) continue;
    existing.add(makeDedupKey(m));
  }

  // Filter CSV by optional year range
  let candidates = csvRows;
  if (args.fromYear) candidates = candidates.filter(r => r.year >= args.fromYear);
  if (args.toYear) candidates = candidates.filter(r => r.year <= args.toYear);

  // Prefer adding older years first (stable), but you can change ordering
  candidates.sort((a, b) => a.year - b.year);

  let added = 0;
  let dupesSkipped = 0;

  for (const r of candidates) {
    if (added >= args.addCount) break;

    const newMoment = {
      artist: r.artist,
      title: r.title,
      year: r.year,
      chart: "Top40Weekly Top 100",
      aka: [],
      tags: ["year-end", "top40weekly"],
    };

    const key = makeDedupKey(newMoment);
    if (existing.has(key)) {
      dupesSkipped++;
      continue;
    }

    moments.push(newMoment);
    existing.add(key);
    added++;
  }

  if (wrapper) {
    // Keep original object structure
    writeJson(outJsonPath, wrapper);
  } else {
    // Keep original array structure
    writeJson(outJsonPath, moments);
  }

  console.error(`[DONE] appended=${added}, dupesSkipped=${dupesSkipped}, totalNow=${moments.length}`);
  console.error(`[OUT] ${outJsonPath}`);
})();
