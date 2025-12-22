/**
 * Scripts/import_top40weekly_1990s.js (V5 — heading slicer)
 *
 * Fixes empty 1990–1998 by slicing the HTML by <h2>YEAR</h2> sections
 * instead of the TOC anchor IDs, which appear before the list content.
 *
 * Emits:
 *   Data/top40weekly/top100_1990.json ... top100_1999.json
 *
 * Row:
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
    .replace(/&#8217;|&#39;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTagsOneLine(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function findYearHeadingIndex(html, year) {
  // Match: <h2 ...>1990</h2> (allow whitespace and attributes)
  const re = new RegExp(`<h2\\b[^>]*>\\s*${year}\\s*<\\/h2>`, "i");
  const m = re.exec(html);
  return m ? m.index : -1;
}

function sliceYearByHeading(html, year) {
  const start = findYearHeadingIndex(html, year);
  if (start < 0) return null;

  let end = html.length;
  for (let y = year + 1; y <= 1999; y++) {
    const next = findYearHeadingIndex(html, y);
    if (next > start) {
      end = next;
      break;
    }
  }
  return html.slice(start, end);
}

function extractFirstListHtml(sectionHtml) {
  const ol = sectionHtml.match(/<ol\b[\s\S]*?<\/ol>/i);
  if (ol) return ol[0];
  const ul = sectionHtml.match(/<ul\b[\s\S]*?<\/ul>/i);
  if (ul) return ul[0];
  return null;
}

function extractLiItems(listHtml) {
  const items = [];
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(listHtml)) !== null) {
    const text = stripTagsOneLine(m[1]);
    if (text) items.push(text);
  }
  return items;
}

function splitTitleArtist(rest) {
  // expected: "HOLD ON by Wilson Phillips"
  // sometimes: "BLAZE OF GLORY by Jon Bon Jovi" (artist may include extra words)
  const m = String(rest || "").match(/^(.+?)\s+by\s+(.+?)$/i);
  if (!m) return null;
  return { title: m[1].trim(), artist: m[2].trim() };
}

function buildRows(year, items) {
  const rows = [];
  let rank = 1;

  for (const it of items) {
    const ta = splitTitleArtist(it);
    if (!ta) continue;

    rows.push({
      year,
      rank,
      title: ta.title,
      artist: ta.artist,
      source: "top40weekly-1990s",
      url: `${SOURCE_URL}#${year}-topsongslist`
    });

    rank++;
    if (rank > 100) break;
  }

  return rows;
}

async function main() {
  console.log("[import] Fetching:", SOURCE_URL);
  const html = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "NyxImporter/5.0" }
  }).then((r) => r.text());

  ensureDir(OUT_DIR);

  let total = 0;

  for (let year = 1990; year <= 1999; year++) {
    const section = sliceYearByHeading(html, year);
    if (!section) {
      console.warn(`[import] ${year}: missing <h2>${year}</h2> heading. Writing empty.`);
      fs.writeFileSync(path.join(OUT_DIR, `top100_${year}.json`), "[]", "utf8");
      continue;
    }

    const listHtml = extractFirstListHtml(section);
    if (!listHtml) {
      console.warn(`[import] ${year}: no <ol>/<ul> found after heading. Writing empty.`);
      fs.writeFileSync(path.join(OUT_DIR, `top100_${year}.json`), "[]", "utf8");
      continue;
    }

    const items = extractLiItems(listHtml);
    const rows = buildRows(year, items);

    if (rows.length < 80) {
      console.warn(`[import] ${year}: parsed only ${rows.length} rows (expected ~100).`);
    }

    fs.writeFileSync(
      path.join(OUT_DIR, `top100_${year}.json`),
      JSON.stringify(rows, null, 2),
      "utf8"
    );

    console.log(`[import] ${year}: ${rows.length} rows`);
    total += rows.length;
  }

  console.log("[import] Done. Total rows:", total);
}

main().catch((err) => {
  console.error("[import] FAILED:", err && err.message ? err.message : err);
  process.exit(1);
});
