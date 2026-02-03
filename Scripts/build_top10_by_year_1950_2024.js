"use strict";

/**
 * Scripts/build_top10_by_year_1950_2024.js
 *
 * Builds a single canonical Top 10 by year file for Nyx.
 * - Tolerates Wikipedia column variations: "№", "No.", "Pos", "Artist(s)", etc.
 * - Accepts input JSON shapes:
 *    A) { rows: [ {year, rank, title, artist}, ... ] }
 *    B) [ {year, rank, title, artist}, ... ]
 *    C) { years: { "1986": { headers: [...], rows: [[...], ...] }, ... } }  (or similar)
 *    D) { items: [...] } / { data: {...} } wrappers
 *
 * Output:
 *   Data/top10_by_year_v1.json (1950–2024 guaranteed keys)
 *
 * Usage:
 *   node Scripts/build_top10_by_year_1950_2024.js
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "..", "Data");
const WIKI_DIR = path.join(DATA_DIR, "wikipedia");

const OUT_FILE = path.join(DATA_DIR, "top10_by_year_v1.json");

const YEAR_START = 1950;
const YEAR_END = 2024;

const CHART_NAME = "Billboard Year-End Hot 100";

function isPlainObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function safeReadJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function safeWriteJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function clampYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  const k = Math.trunc(n);
  if (k < 1900 || k > 2100) return null;
  return k;
}

function normHeader(h) {
  // Normalize headers like "№", "Artist(s)" etc.
  const s = String(h || "").trim().toLowerCase();
  if (!s) return "";
  // Map the unicode numero sign to "no"
  const replaced = s.replace(/№/g, "no");
  // remove punctuation-ish
  const cleaned = replaced
    .replace(/\(s\)/g, "s")
    .replace(/[^\p{L}\p{N}]+/gu, " ") // unicode safe
    .trim()
    .replace(/\s+/g, " ");
  return cleaned;
}

function pickIndex(headers, wantSet) {
  // wantSet: array of acceptable normalized header names
  const map = new Map();
  headers.forEach((h, i) => map.set(normHeader(h), i));

  for (const want of wantSet) {
    if (map.has(want)) return map.get(want);
  }

  // Partial match fallback
  const keys = Array.from(map.keys());
  for (const want of wantSet) {
    const hit = keys.find((k) => k.includes(want));
    if (hit) return map.get(hit);
  }

  return -1;
}

function unwrap(val) {
  // unwrap common wrappers
  let v = val;
  for (let i = 0; i < 5; i++) {
    if (!isPlainObject(v)) return v;
    if (Array.isArray(v)) return v;

    // If it already has rows, keep it (common "wrapper with meta")
    if (Array.isArray(v.rows)) return v;

    const keys = ["data", "json", "value", "content", "payload", "parsed", "pack", "items"];
    const nextKey = keys.find((k) => v && Object.prototype.hasOwnProperty.call(v, k));
    if (!nextKey) return v;
    v = v[nextKey];
  }
  return v;
}

function normalizeArtist(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function normalizeTitle(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function parseRank(x) {
  if (typeof x === "number" && Number.isFinite(x)) return Math.trunc(x);
  const s = String(x || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,3})$/);
  return m ? parseInt(m[1], 10) : null;
}

function upsertTop10(yearMap, year, rank, title, artist, src) {
  const y = clampYear(year);
  if (!y) return;
  if (y < YEAR_START || y > YEAR_END) return;

  const r = parseRank(rank);
  if (!r || r < 1 || r > 10) return;

  const t = normalizeTitle(title);
  const a = normalizeArtist(artist);

  if (!t) return;

  if (!yearMap[y]) yearMap[y] = Object.create(null);
  if (!yearMap[y][r]) {
    yearMap[y][r] = { pos: r, title: t, artist: a || "Unknown", _src: src };
  }
}

function consumeRowsShape(rows, src, yearMap) {
  // rows: array of objects with some likely keys
  if (!Array.isArray(rows)) return;

  for (const row of rows) {
    if (!isPlainObject(row)) continue;

    const year =
      row.year ?? row.Year ?? row.y ?? row.yr ?? row.Y ?? row["year "] ?? null;

    const rank =
      row.rank ?? row.Rank ?? row.pos ?? row.Pos ?? row.position ?? row["#"] ?? row.no ?? row["№"] ?? null;

    const title =
      row.title ?? row.Title ?? row.song ?? row.Song ?? row.single ?? row.name ?? row.track ?? null;

    const artist =
      row.artist ?? row.Artist ?? row["artist(s)"] ?? row["Artist(s)"] ?? row.performer ?? row.by ?? null;

    upsertTop10(yearMap, year, rank, title, artist, src);
  }
}

function consumeYearTablesShape(obj, src, yearMap) {
  // Tries to detect shapes like:
  // { years: { "1986": { headers:[...], rows:[[...], ...] }, ... } }
  // or { "1986": { headers, rows } } etc.
  const o = unwrap(obj);
  if (!isPlainObject(o)) return;

  const yearContainers = [];
  if (isPlainObject(o.years)) yearContainers.push(o.years);
  if (isPlainObject(o.byYear)) yearContainers.push(o.byYear);
  if (isPlainObject(o.by_year)) yearContainers.push(o.by_year);

  // also maybe the object itself is year-keyed
  yearContainers.push(o);

  for (const container of yearContainers) {
    if (!isPlainObject(container)) continue;

    for (const k of Object.keys(container)) {
      const y = clampYear(k);
      if (!y) continue;
      if (y < YEAR_START || y > YEAR_END) continue;

      const node = container[k];
      const n = unwrap(node);
      if (!isPlainObject(n)) continue;

      const headers = Array.isArray(n.headers) ? n.headers : Array.isArray(n.header) ? n.header : null;
      const rows = Array.isArray(n.rows) ? n.rows : null;

      // If it's already an object-rows list, consume that path instead.
      if (rows && rows.length && isPlainObject(rows[0])) {
        consumeRowsShape(rows, `${src}::${y}`, yearMap);
        continue;
      }

      // If rows are arrays, we need header indices.
      if (headers && rows && rows.length && Array.isArray(rows[0])) {
        const idxRank = pickIndex(headers, ["no", "number", "rank", "pos", "position"]);
        const idxTitle = pickIndex(headers, ["title", "song", "single", "track", "name"]);
        const idxArtist = pickIndex(headers, ["artist", "artists", "artist s", "performer", "by"]);

        if (idxRank < 0 || idxTitle < 0 || idxArtist < 0) {
          // leave; caller will log missing
          continue;
        }

        for (const r of rows) {
          if (!Array.isArray(r)) continue;
          upsertTop10(
            yearMap,
            y,
            r[idxRank],
            r[idxTitle],
            r[idxArtist],
            `${src}::${y}`
          );
        }
      }
    }
  }
}

function consumeWrapperRows(obj, src, yearMap) {
  const o = unwrap(obj);
  if (Array.isArray(o)) {
    // Could already be rows with year fields
    if (o.length && isPlainObject(o[0])) consumeRowsShape(o, src, yearMap);
    return;
  }
  if (!isPlainObject(o)) return;

  if (Array.isArray(o.rows)) {
    const rows = o.rows;

    // Case 1: rows are objects (best)
    if (rows.length && isPlainObject(rows[0])) {
      consumeRowsShape(rows, src, yearMap);
      return;
    }

    // Case 2: rows are arrays with headers alongside
    const headers = Array.isArray(o.headers) ? o.headers : null;
    if (headers && rows.length && Array.isArray(rows[0])) {
      // If there is a YEAR column, we can extract all years from one file.
      const idxYear = pickIndex(headers, ["year"]);
      const idxRank = pickIndex(headers, ["no", "number", "rank", "pos", "position"]);
      const idxTitle = pickIndex(headers, ["title", "song", "single", "track", "name"]);
      const idxArtist = pickIndex(headers, ["artist", "artists", "artist s", "performer", "by"]);

      if (idxYear >= 0 && idxRank >= 0 && idxTitle >= 0 && idxArtist >= 0) {
        for (const r of rows) {
          if (!Array.isArray(r)) continue;
          upsertTop10(
            yearMap,
            r[idxYear],
            r[idxRank],
            r[idxTitle],
            r[idxArtist],
            src
          );
        }
      }
    }
  }
}

function buildCanonical(yearMap) {
  const years = Object.create(null);

  for (let y = YEAR_START; y <= YEAR_END; y++) {
    const ranks = yearMap[y] || null;
    const items = [];

    if (ranks) {
      for (let pos = 1; pos <= 10; pos++) {
        const it = ranks[pos];
        if (it) items.push({ pos: it.pos, title: it.title, artist: it.artist });
      }
    }

    years[String(y)] = { year: y, chart: CHART_NAME, items };
  }

  return {
    version: "top10_by_year_v1",
    chart: CHART_NAME,
    generatedAt: new Date().toISOString(),
    meta: {
      yearStart: YEAR_START,
      yearEnd: YEAR_END,
      notes: "Built from wikipedia packs with tolerant header mapping (№, Artist(s), etc.)",
    },
    years,
  };
}

function summarize(out) {
  const missing = [];
  const partial = [];
  let ok = 0;

  for (let y = YEAR_START; y <= YEAR_END; y++) {
    const it = out.years[String(y)]?.items || [];
    if (it.length === 10) ok++;
    else if (it.length === 0) missing.push(y);
    else partial.push({ year: y, count: it.length });
  }

  return { okYears: ok, missingYears: missing, partialYears: partial };
}

function main() {
  if (!fs.existsSync(WIKI_DIR)) {
    console.error(`Missing folder: ${WIKI_DIR}`);
    process.exit(1);
  }

  const wikiFiles = fs
    .readdirSync(WIKI_DIR)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .filter((f) => f.toLowerCase().includes("billboard"))
    .map((f) => path.join(WIKI_DIR, f));

  if (!wikiFiles.length) {
    console.error(`No wikipedia billboard JSON files found in: ${WIKI_DIR}`);
    process.exit(1);
  }

  const yearMap = Object.create(null);

  for (const fp of wikiFiles) {
    const base = path.basename(fp);
    let json;
    try {
      json = safeReadJson(fp);
    } catch (e) {
      console.warn(`[skip] parse_fail ${base}: ${e.message}`);
      continue;
    }

    const src = `wikipedia/${base}`;

    // Try multiple consumers — whichever shape matches will add entries.
    consumeWrapperRows(json, src, yearMap);
    consumeYearTablesShape(json, src, yearMap);

    // Also handle if the whole file is {rows:[{...}]} nested in data/payload/etc
    const u = unwrap(json);
    if (isPlainObject(u) && Array.isArray(u.rows)) {
      consumeWrapperRows(u, src, yearMap);
    }
  }

  const out = buildCanonical(yearMap);
  const stats = summarize(out);

  safeWriteJson(OUT_FILE, out);

  console.log(`✅ Wrote: ${OUT_FILE}`);
  console.log(
    `Years complete (10 items): ${stats.okYears}/${YEAR_END - YEAR_START + 1}`
  );
  if (stats.partialYears.length) {
    console.log(
      `Partial years (${stats.partialYears.length}):`,
      stats.partialYears.slice(0, 20),
      stats.partialYears.length > 20 ? "..." : ""
    );
  }
  if (stats.missingYears.length) {
    console.log(
      `Missing years (${stats.missingYears.length}):`,
      stats.missingYears.join(", ")
    );
  }
}

main();
