/**
 * Build Music Moments v1
 * - Inputs: your existing chart JSON(s)
 * - Output: Data/music_moments_v1.json
 *
 * Assumptions:
 * - You have Billboard year-end or Hot 100 datasets already in Data/wikipedia/
 * - For v1, we generate "chart moments" (top songs per year, top 10 per year, etc.)
 *
 * No web calls. No lyrics. Clean editorial text.
 */

const fs = require("fs");
const path = require("path");

function safeReadJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

// A simple, consistent editorial voice generator (no lyrics, no copied prose)
function buildMomentText({ year, artist, title, chart, position }) {
  const hooks = [
    `In ${year}, ${artist} landed at #${position} on ${chart} with "${title}" — a strong signal of what listeners were craving that year.`,
    `${year} was a big year for ${artist}. "${title}" hit #${position} on ${chart} and helped define the sound of the moment.`,
    `Chart snapshot: ${year}, ${chart}. ${artist} reached #${position} with "${title}" — one of the tracks people kept coming back to.`,
    `If you want a quick time machine: ${year}. ${artist} at #${position} on ${chart} with "${title}" — pure era-defining energy.`
  ];

  // Deterministic pick based on year+position to avoid “random” changes across runs
  const idx = (Number(year) * 7 + Number(position) * 13) % hooks.length;
  return hooks[idx];
}

function normalizeRow(row) {
  // Handle common shapes: {year, rank, artist, title} etc.
  // Adjust if your schemas differ.
  const year = Number(row.year || row.Year || row.y);
  const position = Number(row.rank || row.Rank || row.position || row.pos || row.no || row["No."] || row["No"]);
  const artist = String(row.artist || row.Artist || row.performer || row.singer || "").trim();
  const title = String(row.title || row.Title || row.song || row.track || "").trim();
  const chart = String(row.chart || row.Chart || "").trim();

  if (!year || !position || !artist || !title) return null;

  return { year, position, artist, title, chart };
}

function dedupeByKey(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = `${it.year}|${it.chart}|${it.position}|${it.artist}|${it.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function build() {
  const root = process.cwd();

  // Plug in your chart sources here.
  // Use the same sources you already have in musicKnowledge.
  const sources = [
    {
      chart: "Billboard Year-End Hot 100",
      file: path.resolve(root, "Data/wikipedia/billboard_yearend_hot100_1970_2010.json")
    },
    {
      chart: "Billboard Year-End Singles",
      file: path.resolve(root, "Data/wikipedia/billboard_yearend_singles_1950_1959.json")
    }
  ];

  const rawRows = [];
  for (const src of sources) {
    if (!fs.existsSync(src.file)) {
      console.warn(`[build_music_moments_v1] Missing source: ${src.file}`);
      continue;
    }
    const data = safeReadJson(src.file);
    const rows = Array.isArray(data) ? data : data.rows || data.data || [];
    for (const r of rows) {
      const n = normalizeRow({ ...r, chart: src.chart });
      if (n) rawRows.push(n);
    }
  }

  // Focus v1: top 10 per year from each chart
  const byYearChart = new Map(); // key: year|chart -> rows
  for (const r of rawRows) {
    const key = `${r.year}|${r.chart}`;
    if (!byYearChart.has(key)) byYearChart.set(key, []);
    byYearChart.get(key).push(r);
  }

  const moments = [];
  for (const [key, rows] of byYearChart.entries()) {
    rows.sort((a, b) => a.position - b.position);
    const top10 = rows.slice(0, 10);

    for (const r of top10) {
      const id = `MM-${r.year}-${slug(r.artist)}-${slug(r.title)}-${slug(r.chart)}-P${r.position}`;
      const date = `${r.year}-01-01`; // chart-year moment anchor; not claiming exact day
      const moment_text = buildMomentText({
        year: r.year,
        artist: r.artist,
        title: r.title,
        chart: r.chart,
        position: r.position
      });

      moments.push({
        id,
        type: "music_moment",
        date,
        year: r.year,
        artist: r.artist,
        title: r.title,
        chart: r.chart,
        position: r.position,
        event_type: "year_snapshot",
        moment_text,
        source: "Charts dataset (internal)",
        confidence: "high",
        tags: [String(r.year), "charts", "year-end"],
        media_type: "audio",
        rights: "licensed-music"
      });
    }
  }

  const finalMoments = dedupeByKey(moments).sort((a, b) => (a.year - b.year) || (a.position - b.position));

  const outFile = path.resolve(root, "Data/music_moments_v1.json");
  ensureDir(path.dirname(outFile));
  fs.writeFileSync(outFile, JSON.stringify(finalMoments, null, 2), "utf8");

  console.log(`[build_music_moments_v1] rows=${rawRows.length} moments=${finalMoments.length}`);
  console.log(`[build_music_moments_v1] output=${outFile}`);
}

build();
