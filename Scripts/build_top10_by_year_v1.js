"use strict";

/**
 * build_top10_by_year_full.js
 *
 * Canonical Top 10 builder for Nyx
 * Years: 1950–2024 (ALL PRESENT)
 * Sources: Wikipedia year-end packs (range-mapped, deterministic)
 */

const fs = require("fs");
const path = require("path");

const YEAR_MIN = 1950;
const YEAR_MAX = 2024;

const DATA_ROOT = path.join(process.cwd(), "Data", "wikipedia");
const OUT_FILE = path.join(process.cwd(), "Data", "top10_by_year_v1.json");

const RANGE_SOURCES = [
  { from: 1950, to: 1959, file: "billboard_yearend_singles_1950_1959.json" },
  { from: 1960, to: 1969, file: "billboard_yearend_hot100_1960_1969.json" },
  { from: 1976, to: 1979, file: "billboard_yearend_hot100_1976_1979.json" }, // override window
  { from: 1970, to: 2010, file: "billboard_yearend_hot100_1970_2010.json" },
  { from: 2011, to: 2024, file: "billboard_yearend_hot100_2011_2024.json" },
];

// ---------- helpers ----------

function readJSON(fp) {
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}

function clampYear(y) {
  const n = Number(y);
  return Number.isFinite(n) && n >= YEAR_MIN && n <= YEAR_MAX ? n : null;
}

function norm(v) {
  return String(v || "").trim();
}

function normalizeItem(row, fallbackRank) {
  if (!row) return null;

  const pos =
    Number(row.rank ?? row.pos ?? row.position ?? fallbackRank) || null;

  let title = norm(row.title ?? row.song ?? row.name ?? row.track);
  let artist = norm(row.artist ?? row.by ?? row.performer);

  if (!title && typeof row === "string") {
    const s = row.replace(/^\s*\d+[\.\)]\s*/, "");
    const split = s.split("—");
    title = norm(split[0]);
    artist = norm(split[1]);
  }

  if (!title) return null;

  return { pos, title, artist };
}

function extractTop10(pack, year) {
  const y = String(year);

  // Common shapes
  const containers = [
    pack[y],
    pack[year],
    pack.years && pack.years[y],
    pack.byYear && pack.byYear[y],
  ];

  for (const c of containers) {
    if (!c) continue;

    const rows =
      Array.isArray(c) ? c :
      Array.isArray(c.items) ? c.items :
      Array.isArray(c.top10) ? c.top10 :
      null;

    if (!Array.isArray(rows)) continue;

    const items = [];
    for (let i = 0; i < rows.length; i++) {
      const it = normalizeItem(rows[i], i + 1);
      if (it) items.push(it);
    }

    const ranked = items
      .filter(i => i.pos >= 1 && i.pos <= 10)
      .sort((a, b) => a.pos - b.pos);

    if (ranked.length === 10) return ranked;
  }

  // Row-based fallback
  if (Array.isArray(pack.rows)) {
    const rows = pack.rows.filter(r => clampYear(r.year) === year);
    if (rows.length) {
      const items = rows.map((r, i) => normalizeItem(r, i + 1)).filter(Boolean);
      if (items.length === 10) return items;
    }
  }

  return null;
}

// ---------- build ----------

function build() {
  const years = {};
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
    years[y] = {
      year: y,
      chart: "Billboard Year-End Hot 100",
      items: [],
      available: false,
    };
  }

  for (const src of RANGE_SOURCES) {
    const fp = path.join(DATA_ROOT, src.file);
    if (!fs.existsSync(fp)) continue;

    const pack = readJSON(fp);

    for (let y = src.from; y <= src.to; y++) {
      if (years[y].available) continue;

      const top10 = extractTop10(pack, y);
      if (!top10) continue;

      years[y].items = top10.map(i => ({
        pos: i.pos,
        title: i.title,
        artist: i.artist,
      }));
      years[y].available = true;
      years[y].source = src.file;
    }
  }

  const output = {
    version: "top10_by_year_v1",
    chart: "Billboard Year-End Hot 100",
    generatedAt: new Date().toISOString(),
    years,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), "utf8");

  console.log("✅ Top 10 build complete:", OUT_FILE);
}

build();
