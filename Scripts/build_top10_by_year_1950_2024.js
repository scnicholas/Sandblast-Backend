"use strict";

/**
 * Scripts/build_top10_by_year_1950_2024.js  (v2)
 *
 * Fixes:
 *  ✅ Deep recursive scan to find year tables inside ANY JSON shape (covers your 1970–2010 pack)
 *  ✅ Header tolerance: "№", "Artist(s)", etc.
 *  ✅ Rankless fallback: if rank parsing fails but we have 10+ rows, assign 1–10 in order
 *  ✅ Guarantees every year 1950–2024 exists as a key in output
 *
 * Usage:
 *   node Scripts/build_top10_by_year_1950_2024.js
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "..", "Data");
const OUT_FILE = path.join(DATA_DIR, "top10_by_year_v1.json");

const YEAR_START = 1950;
const YEAR_END = 2024;

const CHART_NAME = "Billboard Year-End Hot 100";

function isPlainObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function clampYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  const k = Math.trunc(n);
  if (k < 1900 || k > 2100) return null;
  return k;
}

function normText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function normHeader(h) {
  const s = String(h || "").trim().toLowerCase();
  if (!s) return "";
  // map unicode numero sign to "no"
  const replaced = s.replace(/№/g, "no");
  const cleaned = replaced
    .replace(/\(s\)/g, "s")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return cleaned;
}

function parseRank(x) {
  if (typeof x === "number" && Number.isFinite(x)) return Math.trunc(x);
  const s = normText(x);
  if (!s) return null;

  // Common rank shapes: "1", "1.", "1)", "#1"
  const m = s.match(/^\s*#?\s*(\d{1,3})\s*[\.\)]?\s*$/);
  if (m) return parseInt(m[1], 10);

  // "1 (tie)" / "1 tie" → 1
  const t = s.match(/^\s*#?\s*(\d{1,3})\b/);
  if (t) return parseInt(t[1], 10);

  return null;
}

function pickIndex(headers, wantSet) {
  const map = new Map();
  headers.forEach((h, i) => map.set(normHeader(h), i));

  for (const want of wantSet) {
    if (map.has(want)) return map.get(want);
  }

  const keys = Array.from(map.keys());
  for (const want of wantSet) {
    const hit = keys.find((k) => k.includes(want));
    if (hit) return map.get(hit);
  }
  return -1;
}

function safeReadJson(fp) {
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}

function safeWriteJson(fp, obj) {
  fs.writeFileSync(fp, JSON.stringify(obj, null, 2), "utf8");
}

function upsert(yearMap, year, pos, title, artist, src) {
  const y = clampYear(year);
  if (!y || y < YEAR_START || y > YEAR_END) return;

  const p = Number(pos);
  if (!Number.isFinite(p) || p < 1 || p > 10) return;

  const t = normText(title);
  if (!t) return;

  const a = normText(artist) || "Unknown";

  if (!yearMap[y]) yearMap[y] = Object.create(null);
  if (!yearMap[y][p]) yearMap[y][p] = { pos: p, title: t, artist: a, _src: src };
}

/**
 * Normalize a list of "row objects" into top10 slots.
 * If rank is missing but we have >=10 valid rows, fallback to order.
 */
function consumeObjectRows(rows, year, src, yearMap) {
  if (!Array.isArray(rows) || !rows.length) return;

  const candidates = [];
  for (const r of rows) {
    if (!isPlainObject(r)) continue;

    const title =
      r.title ?? r.Title ?? r.song ?? r.Song ?? r.track ?? r.name ?? r.single ?? r.entry ?? r.text ?? null;
    const artist =
      r.artist ?? r.Artist ?? r["artist(s)"] ?? r["Artist(s)"] ?? r.performer ?? r.by ?? null;
    const rank =
      r.rank ?? r.Rank ?? r.pos ?? r.Pos ?? r.position ?? r["#"] ?? r.no ?? r["№"] ?? null;

    const t = normText(title);
    const a = normText(artist);

    if (!t) continue;

    candidates.push({ rank: parseRank(rank), title: t, artist: a, rawRank: rank });
  }

  // Place ranked ones
  const used = new Set();
  for (const c of candidates) {
    if (!c.rank) continue;
    if (c.rank < 1 || c.rank > 10) continue;
    upsert(yearMap, year, c.rank, c.title, c.artist, src);
    used.add(c.title + "::" + c.artist);
  }

  // Rankless fallback: fill remaining slots in order
  const need = [];
  for (let i = 1; i <= 10; i++) {
    const y = clampYear(year);
    if (!y) break;
    if (!yearMap[y] || !yearMap[y][i]) need.push(i);
  }

  if (need.length) {
    const leftovers = candidates.filter((c) => !used.has(c.title + "::" + c.artist));
    for (let i = 0; i < need.length && i < leftovers.length; i++) {
      const slot = need[i];
      const c = leftovers[i];
      upsert(yearMap, year, slot, c.title, c.artist, src + "::rankless");
    }
  }
}

/**
 * Normalize a "table rows as arrays" (headers + rows[][]) into top10 slots.
 * If rank fails, fallback to order.
 */
function consumeHeaderTable(headers, rows, year, src, yearMap) {
  if (!Array.isArray(headers) || !Array.isArray(rows) || !rows.length) return;

  const idxRank = pickIndex(headers, ["no", "number", "rank", "pos", "position"]);
  const idxTitle = pickIndex(headers, ["title", "song", "single", "track", "name"]);
  const idxArtist = pickIndex(headers, ["artist", "artists", "artist s", "performer", "by"]);

  // If we can’t find title/artist, bail.
  if (idxTitle < 0 || idxArtist < 0) return;

  const candidates = [];
  for (const r of rows) {
    if (!Array.isArray(r)) continue;

    const title = normText(r[idxTitle]);
    const artist = normText(r[idxArtist]);

    if (!title) continue;

    const rank = idxRank >= 0 ? parseRank(r[idxRank]) : null;

    candidates.push({ rank, title, artist });
  }

  // Ranked placements
  const used = new Set();
  for (const c of candidates) {
    if (!c.rank) continue;
    if (c.rank < 1 || c.rank > 10) continue;
    upsert(yearMap, year, c.rank, c.title, c.artist, src);
    used.add(c.title + "::" + c.artist);
  }

  // Rankless fallback to fill remaining slots
  const need = [];
  for (let i = 1; i <= 10; i++) {
    const y = clampYear(year);
    if (!y) break;
    if (!yearMap[y] || !yearMap[y][i]) need.push(i);
  }

  if (need.length) {
    const leftovers = candidates.filter((c) => !used.has(c.title + "::" + c.artist));
    for (let i = 0; i < need.length && i < leftovers.length; i++) {
      const slot = need[i];
      const c = leftovers[i];
      upsert(yearMap, year, slot, c.title, c.artist, src + "::rankless");
    }
  }
}

/**
 * Deep scanner:
 * Walk any JSON; whenever we find:
 *   - a year-keyed object containing {headers, rows}
 *   - an object containing {year, headers, rows}
 *   - an object containing {headers, rows} nested under a year key
 *   - an object containing {rows:[{year,...}]}
 * we consume it.
 */
function deepScan(node, ctx, yearMap, seen) {
  if (node == null) return;

  // Avoid cycles (rare but safe)
  if (typeof node === "object") {
    if (seen.has(node)) return;
    seen.add(node);
  }

  if (Array.isArray(node)) {
    for (const v of node) deepScan(v, ctx, yearMap, seen);
    return;
  }

  if (!isPlainObject(node)) return;

  // Case A: { rows:[{year,...}] } (multi-year object rows)
  if (Array.isArray(node.rows) && node.rows.length && isPlainObject(node.rows[0])) {
    for (const r of node.rows) {
      if (!isPlainObject(r)) continue;
      const y = clampYear(r.year ?? r.Year ?? r.y ?? r.yr ?? r.Y);
      if (!y) continue;
      consumeObjectRows(node.rows.filter(x => isPlainObject(x) && clampYear(x.year ?? x.Year ?? x.y ?? x.yr ?? x.Y) === y), y, ctx.src, yearMap);
    }
  }

  // Case B: { year, headers, rows }
  const nodeYear = clampYear(node.year ?? node.Year ?? node.y ?? node.yr ?? node.Y);
  if (nodeYear && Array.isArray(node.headers) && Array.isArray(node.rows)) {
    if (node.rows.length && Array.isArray(node.rows[0])) {
      consumeHeaderTable(node.headers, node.rows, nodeYear, ctx.src, yearMap);
    } else if (node.rows.length && isPlainObject(node.rows[0])) {
      consumeObjectRows(node.rows, nodeYear, ctx.src, yearMap);
    }
  }

  // Case C: year-keyed children: { "1986": { headers, rows } }
  for (const k of Object.keys(node)) {
    const y = clampYear(k);
    if (y && y >= YEAR_START && y <= YEAR_END) {
      const child = node[k];
      if (isPlainObject(child)) {
        const headers = Array.isArray(child.headers) ? child.headers : Array.isArray(child.header) ? child.header : null;
        const rows = Array.isArray(child.rows) ? child.rows : null;
        if (headers && rows) {
          if (rows.length && Array.isArray(rows[0])) {
            consumeHeaderTable(headers, rows, y, ctx.src + "::" + y, yearMap);
          } else if (rows.length && isPlainObject(rows[0])) {
            consumeObjectRows(rows, y, ctx.src + "::" + y, yearMap);
          }
        }
      }
    }
  }

  // Recurse into all properties
  for (const k of Object.keys(node)) {
    deepScan(node[k], ctx, yearMap, seen);
  }
}

function buildCanonical(yearMap) {
  const years = Object.create(null);

  for (let y = YEAR_START; y <= YEAR_END; y++) {
    const slots = yearMap[y] || null;
    const items = [];

    if (slots) {
      for (let pos = 1; pos <= 10; pos++) {
        const it = slots[pos];
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
      notes: "Deep-scanned wikipedia packs; tolerant headers (№, Artist(s)); rankless fallback enabled",
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

function listCandidateInputs() {
  // We scan Data/wikipedia/*.json plus any obvious top10 sources you already have.
  const inputs = [];

  const wikiDir = path.join(DATA_DIR, "wikipedia");
  if (fs.existsSync(wikiDir)) {
    for (const f of fs.readdirSync(wikiDir)) {
      if (f.toLowerCase().endsWith(".json") && f.toLowerCase().includes("billboard")) {
        inputs.push(path.join(wikiDir, f));
      }
    }
  }

  // Also scan Data root for known helper sources (optional but harmless).
  const rootCandidates = [
    "top100_billboard_yearend_1960s_v1.json",
    "top10_by_year_source_v1.json",
    "top10_input_rows.json",
  ];
  for (const f of rootCandidates) {
    const fp = path.join(DATA_DIR, f);
    if (fs.existsSync(fp)) inputs.push(fp);
  }

  return inputs;
}

function main() {
  const inputs = listCandidateInputs();
  if (!inputs.length) {
    console.error("No input JSON files found. Expected Data/wikipedia/*.json (billboard*) at minimum.");
    process.exit(1);
  }

  const yearMap = Object.create(null);

  for (const fp of inputs) {
    const base = path.basename(fp);
    let json;
    try {
      json = safeReadJson(fp);
    } catch (e) {
      console.warn(`[skip] parse_fail ${base}: ${e.message}`);
      continue;
    }

    const ctx = { src: (fp.includes(path.sep + "wikipedia" + path.sep) ? "wikipedia/" : "Data/") + base };
    deepScan(json, ctx, yearMap, new Set());
  }

  const out = buildCanonical(yearMap);
  const stats = summarize(out);

  safeWriteJson(OUT_FILE, out);

  console.log(`✅ Wrote: ${OUT_FILE}`);
  console.log(`Years complete (10 items): ${stats.okYears}/${YEAR_END - YEAR_START + 1}`);

  if (stats.partialYears.length) {
    console.log(`Partial years (${stats.partialYears.length}):`, stats.partialYears.slice(0, 30), stats.partialYears.length > 30 ? "..." : "");
  }
  if (stats.missingYears.length) {
    console.log(`Missing years (${stats.missingYears.length}):`, stats.missingYears.join(", "));
  }
}

main();
