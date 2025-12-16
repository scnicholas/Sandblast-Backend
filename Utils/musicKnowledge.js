// Utils/musicKnowledge.js — v2 loader (exports fixed)
// Loads Data/music_moments_v1.json + Data/music_moments_v2.json and merges them.

const fs = require("fs");
const path = require("path");

let CACHE = null;

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { moments: [] };
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.moments) ? parsed : { moments: [] };
  } catch {
    return { moments: [] };
  }
}

function loadDb() {
  if (CACHE) return CACHE;

  const p1 = path.join(__dirname, "..", "Data", "music_moments_v1.json");
  const p2 = path.join(__dirname, "..", "Data", "music_moments_v2.json");

  const db1 = loadJsonIfExists(p1);
  const db2 = loadJsonIfExists(p2);

  const all = [...(db1.moments || []), ...(db2.moments || [])];

  const seen = new Set();
  const merged = [];

  for (const m of all) {
    const key =
      `${normalize(m.artist)}|${normalize(m.title)}|${m.year || ""}|${String(m.chart || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(m);
  }

  CACHE = { moments: merged };
  return CACHE;
}

// Small helper used by index.js style flows (optional, but handy)
function looksLikeMusicHistory(text) {
  const t = normalize(text);
  return (
    t.includes("billboard") ||
    t.includes("hot 100") ||
    t.includes("top 40") ||
    t.includes("charts") ||
    t.includes("chart") ||
    t.includes("#1") ||
    t.includes("# 1") ||
    t.includes("no 1") ||
    t.includes("no. 1") ||
    t.includes("number 1") ||
    t.includes("number one") ||
    t.includes("weeks at") ||
    t.includes("peak")
  );
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function pickBestMoment(db, { artist, title, year }) {
  const moments = (db && db.moments) || [];
  let candidates = moments;

  if (artist) candidates = candidates.filter(m => normalize(m.artist) === normalize(artist));
  if (title) candidates = candidates.filter(m => normalize(m.title) === normalize(title));
  if (year) candidates = candidates.filter(m => Number(m.year) === Number(year));

  if (!candidates.length && title) candidates = moments.filter(m => normalize(m.title) === normalize(title));
  if (!candidates.length && artist) candidates = moments.filter(m => normalize(m.artist) === normalize(artist));

  return candidates[0] || null;
}

module.exports = {
  loadDb,
  normalize,
  looksLikeMusicHistory,
  extractYear,
  pickBestMoment
};
