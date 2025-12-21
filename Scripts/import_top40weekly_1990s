/**
 * scripts/import_top40weekly_1990s.js
 *
 * Downloads Top40Weekly "Top 100 Songs of the 1990s" page and emits:
 *   Data/top40weekly/top100_1990.json ... top100_1999.json
 *
 * Output rows per file:
 *   { year, rank, artist, title, source, url }
 *
 * Designed to plug into your existing musicKnowledge Top40Weekly merge loader.
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

function stripTags(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitleArtist(line) {
  // Expected: "1. HOLD ON by Wilson Phillips"
  // Titles may contain punctuation; artists may contain "featuring", "&", etc.
  const m = line.match(/^\s*(\d{1,3})\.\s*(.+?)\s+by\s+(.+?)\s*$/i);
  if (!m) return null;

  const rank = Number(m[1]);
  const title = String(m[2]).trim();
  const artist = String(m[3]).trim();

  if (!Number.isFinite(rank) || rank < 1 || rank > 200) return null;
  if (!title || !artist) return null;

  return { rank, title, artist };
}

function extractYearBlocks(plainText) {
  // We rely on the rendered headings "## 1990" ... "## 1999"
  // In plain text, these show up as "1990" on its own line in many cases.
  // We’ll locate "1990".."1999" sections and capture lines that look like "1. ... by ..."

  const years = [];
  for (let y = 1990; y <= 1999; y++) years.push(y);

  // Create an index of where each year header appears
  const idx = {};
  for (const y of years) {
    const re = new RegExp(`\\b${y}\\b`, "g");
    const m = re.exec(plainText);
    if (m) idx[y] = m.index;
  }

  // Only keep years we found
  const foundYears = years.filter((y) => typeof idx[y] === "number");
  if (!foundYears.length) {
    throw new Error("Could not find year headers (1990..1999) in page text.");
  }

  // Slice each year block up to next year
  const blocks = [];
  for (let i = 0; i < foundYears.length; i++) {
    const y = foundYears[i];
    const start = idx[y];
    const end = (i < foundYears.length - 1) ? idx[foundYears[i + 1]] : plainText.length;
    blocks.push({ year: y, text: plainText.slice(start, end) });
  }

  return blocks;
}

function parseTop100FromBlock(year, blockText) {
  const lines = blockText
    .split(/\s(?=\d{1,3}\.\s)/g) // split before "1. "
    .map((s) => s.trim())
    .filter(Boolean);

  const rows = [];
  for (const chunk of lines) {
    const maybe = normalizeTitleArtist(chunk);
    if (!maybe) continue;

    rows.push({
      year,
      rank: maybe.rank,
      title: maybe.title,
      artist: maybe.artist,
      source: "top40weekly-1990s",
      url: SOURCE_URL + `#${year}-topsongslist`
    });
  }

  // Keep only 1..100, unique by rank (first occurrence wins)
  const byRank = new Map();
  for (const r of rows) {
    if (r.rank >= 1 && r.rank <= 100 && !byRank.has(r.rank)) byRank.set(r.rank, r);
  }

  const out = Array.from(byRank.values()).sort((a, b) => a.rank - b.rank);

  if (out.length < 80) {
    // Don’t fail hard; warn so you can check parsing changes.
    console.warn(`[import] Warning: ${year} parsed only ${out.length} rows (expected ~100).`);
  }

  return out;
}

async function main() {
  console.log(`[import] Fetching: ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": "NyxImporter/1.0" } });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  const html = await res.text();

  // Convert to plain text so we can parse robustly without extra libs
  const plain = stripTags(html);

  const blocks = extractYearBlocks(plain);

  ensureDir(OUT_DIR);

  let total = 0;
  for (const b of blocks) {
    const rows = parseTop100FromBlock(b.year, b.text);

    // Emit as the filename pattern your musicKnowledge merge already loads
    const fp = path.join(OUT_DIR, `top100_${b.year}.json`);
    fs.writeFileSync(fp, JSON.stringify(rows, null, 2), "utf8");
    console.log(`[import] Wrote ${rows.length} rows -> ${path.relative(process.cwd(), fp)}`);
    total += rows.length;
  }

  console.log(`[import] Done. Total rows written: ${total}`);
  console.log(`[import] Next: run your existing verify: node -e "const kb=require('./Utils/musicKnowledge'); console.log(kb.getDb().moments.length)"`);
}

main().catch((e) => {
  console.error("[import] FAILED:", e && e.message ? e.message : e);
  process.exitCode = 1;
});
