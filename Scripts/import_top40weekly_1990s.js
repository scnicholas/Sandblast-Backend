/**
 * Scripts/import_top40weekly_1990s.js (V4 — hybrid parser, FIXED & CLEAN)
 *
 * Handles inconsistent markup across years on Top40Weekly 1990s page.
 * Strategy per year section:
 *  1) Parse <ol>/<ul><li>
 *  2) Parse <table>
 *  3) Fallback: parse ranked text lines inside the year section
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
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function htmlToText(html) {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim()
  );
}

function findAnchor(html, year) {
  const re = new RegExp(`id=["']${year}-topsongslist["']`, "i");
  const m = re.exec(html);
  return m ? m.index : -1;
}

function sliceYear(html, year) {
  const start = findAnchor(html, year);
  if (start < 0) return null;

  let end = html.length;
  for (let y = year + 1; y <= 1999; y++) {
    const next = findAnchor(html, y);
    if (next > start) {
      end = next;
      break;
    }
  }
  return html.slice(start, end);
}

function extractList(section) {
  const m = section.match(/<(ol|ul)[\s\S]*?<\/\1>/i);
  if (!m) return null;

  const items = [];
  const li = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let x;
  while ((x = li.exec(m[0]))) {
    items.push(stripTagsOneLine(x[1]));
  }
  return items;
}

function extractTableRows(tableHtml) {
  const rows = [];
  const tr = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = tr.exec(tableHtml))) {
    const cells = [];
    const td = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
    let c;
    while ((c = td.exec(m[1]))) {
      cells.push(stripTagsOneLine(c[2]));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function extractTable(section) {
  const m = section.match(/<table[\s\S]*?<\/table>/i);
  return m ? extractTableRows(m[0]) : null;
}

function parseRankLines(section) {
  const lines = htmlToText(section).split("\n");
  return lines
    .map(l => l.match(/^(\d{1,3})\.\s*(.+)$/))
    .filter(Boolean)
    .map(m => ({ rank: Number(m[1]), rest: m[2] }));
}

function splitTitleArtist(rest) {
  let m = rest.match(/^(.+?)\s+by\s+(.+)$/i);
  if (m) return { title: m[1], artist: m[2] };

  m = rest.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (m) return { title: m[1], artist: m[2] };

  return null;
}

function buildRows(year, parsed) {
  const out = new Map();

  for (const p of parsed) {
    if (!p.rank || p.rank < 1 || p.rank > 100) continue;
    const ta = splitTitleArtist(p.rest);
    if (!ta) continue;

    out.set(p.rank, {
      year,
      rank: p.rank,
      title: ta.title.trim(),
      artist: ta.artist.trim(),
      source: "top40weekly-1990s",
      url: `${SOURCE_URL}#${year}-topsongslist`
    });
  }
  return [...out.values()].sort((a, b) => a.rank - b.rank);
}

async function main() {
  console.log("[import] Fetching:", SOURCE_URL);
  const html = await fetch(SOURCE_URL).then(r => r.text());

  ensureDir(OUT_DIR);
  let total = 0;

  for (let year = 1990; year <= 1999; year++) {
    const section = sliceYear(html, year);
    if (!section) {
      fs.writeFileSync(`${OUT_DIR}/top100_${year}.json`, "[]");
      continue;
    }

    let rows = [];

    const list = extractList(section);
    if (list?.length) {
      rows = buildRows(
        year,
        list.map((t, i) => ({ rank: i + 1, rest: t }))
      );
    }

    if (rows.length < 80) {
      const table = extractTable(section);
      if (table) {
        rows = buildRows(
          year,
          table.map(r => ({
            rank: Number(r[0]),
            rest: r.slice(1).join(" - ")
          }))
        );
      }
    }

    if (rows.length < 80) {
      rows = buildRows(year, parseRankLines(section));
    }

    fs.writeFileSync(
      `${OUT_DIR}/top100_${year}.json`,
      JSON.stringify(rows, null, 2)
    );
    console.log(`[import] ${year}: ${rows.length} rows`);
    total += rows.length;
  }

  console.log("[import] Done. Total rows:", total);
}

main().catch(err => {
  console.error("[import] FAILED:", err.message);
  process.exit(1);
});
