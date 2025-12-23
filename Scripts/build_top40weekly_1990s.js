"use strict";

/**
 * Build Top40Weekly Year-End Top 100 files (1990–1999) from:
 * https://top40weekly.com/top-100-songs-of-the-1990s/
 *
 * Output:
 * Data/top40weekly/top100_1990.json ... top100_1999.json
 *
 * Notes:
 * - Parses each year's anchored section (#1990-topsongslist ... #1999-topsongslist)
 * - Extracts "rank. TITLE by ARTIST" lines
 * - Normalizes quotes/apostrophes lightly
 */

const fs = require("fs");
const path = require("path");

// Node 18+ has global fetch; Node 24 definitely does
if (typeof fetch !== "function") {
  console.error("This script requires Node 18+ (fetch).");
  process.exit(1);
}

const SOURCE_URL = "https://top40weekly.com/top-100-songs-of-the-1990s/";
const OUT_DIR = path.resolve(__dirname, "..", "Data", "top40weekly");

const YEARS = [1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999];
const CHART_NAME = "Top40Weekly Top 100";

// ---------- helpers ----------
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function decodeHtmlEntities(s) {
  // Minimal decode for common entities in these lists
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html) {
  // Replace <br> and </p>/<li> etc with newlines, then remove remaining tags
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|tr|td)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function cleanText(s) {
  return decodeHtmlEntities(s)
    .replace(/\s+/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function findSection(html, year) {
  const id = `${year}-topsongslist`;
  const idx = html.indexOf(`id="${id}"`);
  if (idx < 0) return null;

  // slice from this id to the next year's id (or end)
  const nextYear = YEARS.find((y) => y > year);
  if (!nextYear) return html.slice(idx);

  const nextId = `id="${nextYear}-topsongslist"`;
  const nextIdx = html.indexOf(nextId, idx + 1);
  return nextIdx > idx ? html.slice(idx, nextIdx) : html.slice(idx);
}

function parseRankLines(sectionText) {
  // The page lists lines like: "1. HOLD ON by Wilson Phillips"
  // We'll match: rank "." then title then " by " then artist
  const lines = sectionText.split("\n").map((l) => l.trim()).filter(Boolean);

  const out = [];
  for (const line of lines) {
    const m = line.match(/^(\d{1,3})\.\s+(.+?)\s+by\s+(.+)$/i);
    if (!m) continue;

    const rank = Number(m[1]);
    const title = m[2].trim();
    const artist = m[3].trim();

    if (!Number.isFinite(rank) || rank < 1 || rank > 100) continue;
    if (!title || !artist) continue;

    out.push({ rank, title, artist });
  }

  // de-dupe by rank in case of weird formatting
  const byRank = new Map();
  for (const r of out) if (!byRank.has(r.rank)) byRank.set(r.rank, r);
  return Array.from(byRank.values()).sort((a, b) => a.rank - b.rank);
}

// ---------- main ----------
(async function main() {
  console.log(`[build_top40weekly_1990s] Fetching: ${SOURCE_URL}`);
  const resp = await fetch(SOURCE_URL, { redirect: "follow" });

  if (!resp.ok) {
    console.error(`[build_top40weekly_1990s] HTTP ${resp.status} ${resp.statusText}`);
    process.exit(1);
  }

  const htmlRaw = await resp.text();
  const html = String(htmlRaw || "");

  ensureDir(OUT_DIR);

  let totalWritten = 0;

  for (const year of YEARS) {
    const sectionHtml = findSection(html, year);
    if (!sectionHtml) {
      console.warn(`[build_top40weekly_1990s] WARNING: section not found for ${year} (id="${year}-topsongslist")`);
      continue;
    }

    const text = cleanText(stripTags(sectionHtml));
    const rows = parseRankLines(text);

    if (rows.length < 80) {
      console.warn(`[build_top40weekly_1990s] WARNING: parsed only ${rows.length} rows for ${year} (expected ~100).`);
    } else {
      console.log(`[build_top40weekly_1990s] ${year}: parsed ${rows.length} rows`);
    }

    const payload = rows.map((r) => ({
      year,
      chart: CHART_NAME,
      rank: r.rank,
      title: r.title,
      artist: r.artist
    }));

    const outPath = path.join(OUT_DIR, `top100_${year}.json`);
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
    totalWritten += payload.length;
  }

  console.log(`[build_top40weekly_1990s] Done. Total rows written: ${totalWritten}`);
  console.log(`[build_top40weekly_1990s] Output folder: ${OUT_DIR}`);
})().catch((e) => {
  console.error(`[build_top40weekly_1990s] ERROR: ${String(e?.message || e)}`);
  process.exit(1);
});
