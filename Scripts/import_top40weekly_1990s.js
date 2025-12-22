/**
 * Scripts/import_top40weekly_1990s.js
 *
 * Robust importer for Top40Weekly "Top 100 Songs of the 1990s" page.
 * Emits:
 *   Data/top40weekly/top100_1990.json ... top100_1999.json
 *
 * Output rows:
 *   { year, rank, artist, title, source, url }
 *
 * Why this version works:
 * - Parses by HTML anchors (#1990-topsongslist ... #1999-topsongslist),
 *   instead of trying to locate years in flattened text.
 * - Preserves line breaks from common HTML tags to stabilize row extraction.
 * - Supports multiple row formats:
 *   "1. Title by Artist"
 *   "1. Title – Artist"  (en dash)
 *   "1. Title - Artist"  (hyphen)
 */

"use strict";

const fs = require("fs");
const path = require("path");

// Node 18+ has global fetch
const SOURCE_URL = "https://top40weekly.com/top-100-songs-of-the-1990s/";
const OUT_DIR = path.join(process.cwd(), "Data", "top40weekly");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeWhitespace(s) {
  return String(s || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;|&#39;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&nbsp;/g, " ");
}

function htmlToTextWithNewlines(html) {
  // Preserve structure: convert common separators to \n before stripping tags
  let s = String(html || "");

  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");

  // Newlines for block-like tags and <br>
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|h6)>/gi, "\n");
  s = s.replace(/<(p|div|li|tr|h1|h2|h3|h4|h5|h6)\b[^>]*>/gi, "\n");

  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, " ");

  s = decodeEntities(s);
  s = normalizeWhitespace(s);

  // Ensure reasonable line splitting
  s = s.replace(/\s*\n\s*/g, "\n");
  return s;
}

function findAnchorIndex(html, year) {
  // Handles a variety of anchor patterns WordPress might generate:
  // id="1990-topsongslist" or id='1990-topsongslist'
  const id = `${year}-topsongslist`;
  const re = new RegExp(`id\\s*=\\s*["']${id}["']`, "i");
  const m = re.exec(html);
  return m ? m.index : -1;
}

function sliceYearSection(html, year) {
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

function parseLineToRow(line) {
  // Accept:
  // 1. Title by Artist
  // 1. Title – Artist
  // 1. Title - Artist
  const cleaned = String(line || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  // Strict rank prefix
  const rm = cleaned.match(/^(\d{1,3})\.\s*(.+)$/);
  if (!rm) return null;

  const rank = Number(rm[1]);
  if (!Number.isFinite(rank) || rank < 1 || rank > 200) return null;

  const rest = String(rm[2]).trim();

  // Format A: "Title by Artist"
  let m = rest.match(/^(.+?)\s+by\s+(.+?)$/i);
  if (m) {
    const title = String(m[1]).trim().replace(/^["“]|["”]$/g, "").trim();
    const artist = String(m[2]).trim();
    if (!title || !artist) return null;
    return { rank, title, artist };
  }

  // Format B: "Title – Artist" or "Title - Artist"
  m = rest.match(/^(.+?)\s*(?:–|-|—)\s*(.+?)$/);
  if (m) {
    const title = String(m[1]).trim().replace(/^["“]|["”]$/g, "").trim();
    const artist = String(m[2]).trim();
    if (!title || !artist) return null;
    return { rank, title, artist };
  }

  return null;
}

function parseTop100FromSection(year, sectionHtml) {
  const text = htmlToTextWithNewlines(sectionHtml);

  const lines = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const byRank = new Map();

  for (const line of lines) {
    const row = parseLineToRow(line);
    if (!row) continue;

    if (row.rank >= 1 && row.rank <= 100 && !byRank.has(row.rank)) {
      byRank.set(row.rank, row);
    }
  }

  const out = Array.from(byRank.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rank, r]) => ({
      year,
      rank,
      title: r.title,
      artist: r.artist,
      source: "top40weekly-1990s",
      url: SOURCE_URL + `#${year}-topsongslist`
    }));

  if (out.length < 95) {
    console.warn(
      `[import] Warning: ${year} parsed only ${out.length} rows (expected ~100). The page format may have changed.`
    );
  }

  return out;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "NyxImporter/2.0" }
    });

    if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log(`[import] Fetching: ${SOURCE_URL}`);
  const html = await fetchHtml(SOURCE_URL);

  ensureDir(OUT_DIR);

  let total = 0;
  for (let year = 1990; year <= 1999; year++) {
    const section = sliceYearSection(html, year);
    if (!section) {
      console.warn(`[import] Warning: could not locate anchor for ${year} (#${year}-topsongslist). Writing empty file.`);
      const fp = path.join(OUT_DIR, `top100_${year}.json`);
      fs.writeFileSync(fp, "[]\n", "utf8");
      continue;
    }

    const rows = parseTop100FromSection(year, section);
    const fp = path.join(OUT_DIR, `top100_${year}.json`);
    fs.writeFileSync(fp, JSON.stringify(rows, null, 2), "utf8");

    console.log(`[import] Wrote ${rows.length} rows -> ${path.relative(process.cwd(), fp)}`);
    total += rows.length;
  }

  console.log(`[import] Done. Total rows written: ${total}`);
  console.log(`[import] Quick check: dir Data\\top40weekly\\top100_1990.json`);
}

main().catch((e) => {
  console.error("[import] FAILED:", e && e.message ? e.message : e);
  process.exitCode = 1;
});
