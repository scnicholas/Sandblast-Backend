// build_music_moments_from_top100.js
// Converts Data/top100_songs.csv into Data/music_moments_v2.json

const fs = require("fs");
const path = require("path");

const INPUT = path.join(__dirname, "Data", "top100_songs.csv");
const OUTPUT = path.join(__dirname, "Data", "music_moments_v2.json");

function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function parseLine(line) {
  const raw = clean(line);
  if (!raw) return null;

  const noNum = raw.replace(/^\d+\s*[\.\)]\s*/, "").trim();
  if (!noNum) return null;

  const idx = noNum.lastIndexOf(" - ");
  if (idx === -1) return null;

  const title = clean(noNum.slice(0, idx));
  const artist = clean(noNum.slice(idx + 3));

  if (!title || !artist) return null;
  return { title, artist };
}

function buildMoment({ title, artist }) {
  return {
    artist,
    title,
    year: null,
    chart: "Billboard Hot 100",
    fact: `Listener favorite: “${title}” — ${artist}.`,
    culture: "A timeless love-song staple that still lands emotionally across generations.",
    next: "Want to anchor this by year, or ask “Was it #1?” (and tell me which chart: Billboard Hot 100, UK Singles, Canada RPM, or Top40Weekly)."
  };
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error("Missing input file:", INPUT);
    process.exit(1);
  }

  const lines = fs.readFileSync(INPUT, "utf8").split(/\r?\n/);
  const seen = new Set();
  const moments = [];

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;

    const key = `${parsed.title.toLowerCase()}|${parsed.artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    moments.push(buildMoment(parsed));
  }

  const payload = {
    version: "music_moments_v2",
    source: "top100_songs.csv",
    generatedAt: new Date().toISOString(),
    moments
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${moments.length} moments to ${OUTPUT}`);
}

main();
