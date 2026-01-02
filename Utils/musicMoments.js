/**
 * musicMoments v1 runtime
 * - Loads Data/music_moments_v1.json once
 * - Answers: "Give me a music moment for YEAR", "top 10 YEAR", "story moment YEAR"
 */

const fs = require("fs");
const path = require("path");

let CACHE = null;

function load() {
  if (CACHE) return CACHE;

  const file = path.resolve(process.cwd(), "Data/music_moments_v1.json");
  if (!fs.existsSync(file)) {
    CACHE = { ok: false, file, rows: 0, moments: [] };
    return CACHE;
  }
  const raw = fs.readFileSync(file, "utf8");
  const moments = JSON.parse(raw);
  CACHE = { ok: true, file, rows: moments.length, moments };
  return CACHE;
}

function byYear(year) {
  const db = load();
  if (!db.ok) return [];
  return db.moments.filter(m => Number(m.year) === Number(year));
}

function formatTop10(year, chartName = null) {
  const items = byYear(year);
  const filtered = chartName
    ? items.filter(m => String(m.chart).toLowerCase().includes(String(chartName).toLowerCase()))
    : items;

  const top = filtered
    .slice()
    .sort((a, b) => a.position - b.position)
    .slice(0, 10);

  if (!top.length) return null;

  const chart = top[0].chart;
  const lines = top.map(m => `${m.position}. ${m.artist} — ${m.title}`);
  return `Top 10 — ${chart} (${year}):\n${lines.join("\n")}`;
}

function pickStoryMoment(year, chartName = null) {
  const items = byYear(year);
  const filtered = chartName
    ? items.filter(m => String(m.chart).toLowerCase().includes(String(chartName).toLowerCase()))
    : items;

  if (!filtered.length) return null;

  // Prefer top 3 for “story moment”
  const sorted = filtered.slice().sort((a, b) => a.position - b.position);
  const pool = sorted.slice(0, Math.min(3, sorted.length));

  // deterministic pick
  const idx = (Number(year) * 17) % pool.length;
  return pool[idx];
}

function handle(text, session = {}) {
  const t = String(text || "").trim();
  const yearMatch = t.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  if (!year) {
    return {
      ok: true,
      reply: `Give me a year (e.g., 1957 or 1988) and I’ll pull a music moment — or say “top 10 1988”.`,
      followUp: { kind: "ask_year" }
    };
  }

  const wantsTop10 = /top\s*10/i.test(t);
  const wantsStory = /story|moment/i.test(t) && !wantsTop10;

  if (wantsTop10) {
    const out = formatTop10(year, session.activeMusicChart || null) || `No chart moments found for ${year}.`;
    return { ok: true, reply: out, followUp: { kind: "offer_next", year } };
  }

  if (wantsStory) {
    const m = pickStoryMoment(year, session.activeMusicChart || null);
    if (!m) return { ok: true, reply: `I don’t have a moment loaded for ${year} yet. Try another year.`, followUp: { kind: "ask_year" } };

    return {
      ok: true,
      reply: `Music moment — ${m.chart} (${year}):\n#${m.position}: ${m.artist} — ${m.title}\n\n${m.moment_text}\n\nWant another moment, the Top 10, or a different year?`,
      followUp: { kind: "offer_next", year }
    };
  }

  // Default: one moment
  const m = pickStoryMoment(year, session.activeMusicChart || null);
  if (!m) return { ok: true, reply: `I don’t have a moment loaded for ${year} yet. Try another year.`, followUp: { kind: "ask_year" } };

  return {
    ok: true,
    reply: `Quick hit — ${m.chart} (${year}): #${m.position} ${m.artist} — ${m.title}\n${m.moment_text}\n\nWant a story moment, the Top 10, or another year?`,
    followUp: { kind: "offer_next", year }
  };
}

module.exports = { load, byYear, formatTop10, pickStoryMoment, handle };
