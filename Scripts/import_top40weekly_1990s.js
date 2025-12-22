/**
 * Scripts/import_top40weekly_1990s.js (V3 — OL/LI parser)
 *
 * Fixes the "[] / 2 bytes" issue by parsing the HTML list (<ol>/<ul><li>)
 * instead of flattening to plain text.
 *
 * Emits:
 *   Data/top40weekly/top100_1990.json ... top100_1999.json
 *
 * Each row:
 *   { year, rank, artist, title, source, url }
 */

"use strict";

const fs = require("fs");
const path = require("path");

const SOURCE_URL = "https://top40weekly.com/top-100-songs-of-the-1990s/";
const OUT_DIR = path.join(process.cwd(), "Data", "top40weekly");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;|&#39;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
}

function stripTags(html) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|h6)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function findAnchorIndex(html, year) {
  const id = `${year}-topsongslist`;
  const re = new RegExp(`id\\s*=\\s*["']${id}["']`, "i");
  const m = re.exec(html);
  return m ? m.index : -1;
}

function sliceFromAnchorToNext(html, year) {
  const start = findAnchorIndex(html, year);
  if (start < 0) return null;

  let end = html.length;
  for (let y = year + 1; y <= 1999; y++) {
    const next = findAnchorIndex(html, y);
    if (next > start) {
      end = next;
      break;
    }
  }
  return html.slice(start, end);
}

function extractFirstListHtml(sectionHtml) {
  // Find first <ol>...</ol> or <ul>...</ul> after the anchor
  const ol = sectionHtml.match(/<ol\b[\s\S]*?<\/ol>/i);
  if (ol) return ol[0];

  const ul = sectionHtml.match(/<ul\b[\s\S]*?<\/ul>/i);
  if (ul) return ul[0];

  return null;
}

function extractLiItems(listHtml) {
  // Extract li bodies
  const items = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(listHtml)) !== null) {
    const inner = m[1];
    const text = stripTags(inner);
    if (text) items.push(text);
  }
  return items;
}

function parseItemToRow(text) {
  // Common patterns:
  // "1. Title by Artist"
  // "1. Title – Artist"
  // "Title by Artist" (rank implied by list ordering)
  // We'll try to pull rank if present.
  const t = String(text || "").trim();
  if (!t) return null;

  let rank = null;
  let rest = t;

  const rm = t.match(/^(\d{1,3})\.\s*(.+)$/);
  if (rm) {
    rank = Number(rm[1]);
    rest = String(rm[2]).trim();
  }

  // "Title by Artist"
  let m = rest.match(/^(.+?)\s+by\s+(.+?)$/i);
  if (m) {
    const title = String(m[1]).trim().replace(/^["“]|["”]$/g, "").trim();
    const artist = String(m[2]).trim();
    if (!title || !artist) return null;
    return { rank, title, artist };
  }

  // "Title – Artist" or hyphen
  m = rest.match(/^(.+?)\s*(?:–|-|—)\s*(.+?)$/);
  if (m) {
    const title = String(m[1]).trim().replace(/^["“]|["”]$/g, "").trim();
    const artist = String(m[2]).trim();
    if (!title || !artist) return null;
    return { rank, title, artist };
  }

  return null;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "NyxImporter/3.0" }
    });
    if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function writeYearFile(year, rows) {
  const fp = path.join(OUT_DIR, `top100_${year}.json`);
  fs.writeFileSync(fp, JSON.stringify(rows, null, 2), "utf8");
  console.log(`[import] Wrote ${rows.length} rows -> ${path.relative(process.cwd(), fp)}`);
}

async function main() {
  console.log(`[import] Fetching: ${SOURCE_URL}`);
  const html = await fetchHtml(SOURCE_URL);

  ensureDir(OUT_DIR);

  let total = 0;

  for (let year = 1990; year <= 1999; year++) {
    const section = sliceFromAnchorToNext(html, year);
    if (!section) {
      console.warn(`[import] Missing anchor for ${year}. Writing empty file.`);
      writeYearFile(year, []);
      continue;
    }

    const listHtml = extractFirstListHtml(section);
    if (!listHtml) {
      console.warn(`[import] No <ol>/<ul> found for ${year}. Writing empty file.`);
      writeYearFile(year, []);
      continue;
    }

    const items = extractLiItems(listHtml);
    const out = [];

    // If ranks are not embedded, infer by position
    let inferredRank = 1;

    for (const item of items) {
      const parsed = parseItemToRow(item);
      if (!parsed) continue;

      const rank = parsed.rank != null ? parsed.rank : inferredRank;
      inferredRank++;

      if (rank < 1 || rank > 100) continue;

      out.push({
        year,
        rank,
        title: parsed.title,
        artist: parsed.artist,
        source: "top40weekly-1990s",
        url: SOURCE_URL + `#${year}-topsongslist`
      });
    }

    // Deduplicate by rank, keep first
    const byRank = new Map();
    for (const r of out) {
      if (!byRank.has(r.rank)) byRank.set(r.rank, r);
    }

    const rows = Array.from(byRank.values()).sort((a, b) => a.rank - b.rank);

    if (rows.length < 95) {
      console.warn(`[import] Warning: ${year} parsed ${rows.length} rows (expected ~100).`);
    }

    writeYearFile(year, rows);
    total += rows.length;
  }

  console.log(`[import] Done. Total rows written: ${total}`);
}

main().catch((e) => {
  console.error("[import] FAILED:", e && e.message ? e.message : e);
  process.exitCode = 1;
});
