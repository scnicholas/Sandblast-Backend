// Utils/musicKnowledge.js — v2 loader (hardened, exports fixed)
// Loads Data/music_moments_v1.json + Data/music_moments_v2.json and merges them.
// Notes:
// - Uses in-memory CACHE for performance
// - Adds resetCache() for dev/test hot reload
// - Dedupes by artist|title|year|chart (normalized)

const fs = require("fs");
const path = require("path");

let CACHE = null;

// -----------------------------
// Normalization helpers
// -----------------------------
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalize common chart names to reduce dupes and improve matching
function safeChart(chart) {
  const t = normalize(chart);
  if (!t) return "";
  if (t.includes("billboard") && t.includes("hot") && t.includes("100")) return "billboard hot 100";
  if (t.includes("uk") && t.includes("single")) return "uk singles chart";
  if (t.includes("canada") && t.includes("rpm")) return "canada rpm";
  if (t.includes("top40weekly") || (t.includes("top") && t.includes("40") && t.includes("weekly")))
    return "top40weekly";
  return t;
}

// -----------------------------
// File loading
// -----------------------------
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

function resetCache() {
  CACHE = null;
}

// -----------------------------
// DB loader (v1 + v2 merge)
// -----------------------------
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
    if (!m || typeof m !== "object") continue;

    const artist = normalize(m.artist);
    const title = normalize(m.title);
    const year = m.year || "";
    const chart = safeChart(m.chart);

    // Skip malformed entries
    if (!artist || !title || !year || !chart) continue;

    const key = `${artist}|${title}|${year}|${chart}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Keep original fields as-is, but store a few normalized helpers for faster matching
    merged.push({
      ...m,
      _n_artist: artist,
      _n_title: title,
      _n_chart: chart
    });
  }

  CACHE = { moments: merged };
  return CACHE;
}

// -----------------------------
// Music query helpers
// -----------------------------
function looksLikeMusicHistory(text) {
  const t = normalize(text);
  return (
    t.includes("billboard") ||
    t.includes("hot 100") ||
    t.includes("top 40") ||
    t.includes("top40weekly") ||
    t.includes("charts") ||
    t.includes("chart") ||
    t.includes("#1") ||
    t.includes("# 1") ||
    t.includes("no 1") ||
    t.includes("no. 1") ||
    t.includes("number 1") ||
    t.includes("number one") ||
    t.includes("weeks at") ||
    t.includes("weeks on") ||
    t.includes("peak") ||
    t.includes("peaked") ||
    t.includes("debuted") ||
    t.includes("chart run")
  );
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

// Optional: return a short candidate list (useful for admin/debug)
function findCandidates(db, { artist, title, year, chart, limit = 10 }) {
  const moments = (db && db.moments) || [];
  const a = artist ? normalize(artist) : "";
  const ti = title ? normalize(title) : "";
  const ch = chart ? safeChart(chart) : "";
  const y = year ? Number(year) : null;

  let candidates = moments;

  if (a) candidates = candidates.filter(m => (m._n_artist || normalize(m.artist)) === a);
  if (ti) candidates = candidates.filter(m => (m._n_title || normalize(m.title)) === ti);
  if (ch) candidates = candidates.filter(m => (m._n_chart || safeChart(m.chart)) === ch);
  if (y) candidates = candidates.filter(m => Number(m.year) === y);

  return candidates.slice(0, Math.max(1, Number(limit) || 10));
}

// Better best-pick strategy:
// 1) Exact (artist + title + year + chart)
// 2) Exact (artist + title + year)
// 3) Exact (title + year)
// 4) Exact (artist + title)
// 5) Best fuzzy (title contains / artist contains), then closest year
function pickBestMoment(db, { artist, title, year, chart }) {
  const moments = (db && db.moments) || [];
  if (!moments.length) return null;

  const a = artist ? normalize(artist) : "";
  const ti = title ? normalize(title) : "";
  const ch = chart ? safeChart(chart) : "";
  const y = year ? Number(year) : null;

  // Helper to read normalized fields if present
  const nArtist = (m) => m._n_artist || normalize(m.artist);
  const nTitle = (m) => m._n_title || normalize(m.title);
  const nChart = (m) => m._n_chart || safeChart(m.chart);

  // 1) Exact all
  if (a && ti && y && ch) {
    const hit = moments.find(m => nArtist(m) === a && nTitle(m) === ti && Number(m.year) === y && nChart(m) === ch);
    if (hit) return hit;
  }

  // 2) Exact artist+title+year
  if (a && ti && y) {
    const hit = moments.find(m => nArtist(m) === a && nTitle(m) === ti && Number(m.year) === y);
    if (hit) return hit;
  }

  // 3) Exact title+year
  if (ti && y) {
    const hit = moments.find(m => nTitle(m) === ti && Number(m.year) === y);
    if (hit) return hit;
  }

  // 4) Exact artist+title
  if (a && ti) {
    const hit = moments.find(m => nArtist(m) === a && nTitle(m) === ti);
    if (hit) return hit;
  }

  // 5) Relaxed: match by title first, then artist, then closest year
  let candidates = moments;

  if (ti) {
    const titleMatches = candidates.filter(m => nTitle(m) === ti || nTitle(m).includes(ti) || ti.includes(nTitle(m)));
    if (titleMatches.length) candidates = titleMatches;
  } else if (a) {
    const artistMatches = candidates.filter(m => nArtist(m) === a || nArtist(m).includes(a) || a.includes(nArtist(m)));
    if (artistMatches.length) candidates = artistMatches;
  }

  if (a && candidates.length > 1) {
    const artistMatches = candidates.filter(m => nArtist(m) === a || nArtist(m).includes(a) || a.includes(nArtist(m)));
    if (artistMatches.length) candidates = artistMatches;
  }

  if (ch && candidates.length > 1) {
    const chartMatches = candidates.filter(m => nChart(m) === ch);
    if (chartMatches.length) candidates = chartMatches;
  }

  if (y && candidates.length > 1) {
    candidates = candidates
      .slice()
      .sort((m1, m2) => Math.abs(Number(m1.year) - y) - Math.abs(Number(m2.year) - y));
  }

  return candidates[0] || null;
}

module.exports = {
  loadDb,
  resetCache,
  normalize,
  safeChart,
  looksLikeMusicHistory,
  extractYear,
  findCandidates,
  pickBestMoment
};
