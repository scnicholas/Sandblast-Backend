/**
 * Scripts/import_top40weekly_1990s.js (V4 — hybrid parser)
 *
 * Handles inconsistent markup across years on Top40Weekly 1990s page.
 * Strategy per year section:
 *  1) Parse <ol>/<ul><li> if present
 *  2) Parse <table> if present
 *  3) Fallback: parse ranked lines from TEXT extracted from the year section
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
    .replace(/&#8217;|&rsquo;|&#39;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
}

function stripTagsToOneLine(html) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function htmlToTextWithNewlines(html) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");

  // preserve line breaks for common block tags
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|h6)>/gi, "\n");
  s = s.replace(/<(p|div|li|tr|h1|h2|h3|h4|h5|h6)\b[^>]*>/gi, "\n");

  // remove remaining tags
  s = s.replace(/<[^>]+>/g, " ");

  s = decodeEntities(s);
  s = s.replace(/\u00a0/g, " ");
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\s*\n\s*/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
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
  const ol = sectionHtml.match(/<ol\b[\s\S]*?<\/ol>/i);
  if (ol) return ol[0];
  const ul = sectionHtml.match(/<ul\b[\s\S]*?<\/ul>/i);
  if (ul) return ul[0];
  return null;
}

function extractLiItems(listHtml) {
  const items = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(listHtml)) !== null) {
    const text = stripTagsToOneLine(m[1]);
    if (text) items.push(text);
  }
  return items;
}

function extractFirstTableHtml(sectionHtml) {
  const t = sectionHtml.match(/<table\b[\s\S]*?<\/table>/i);
  return t ? t[0] : null;
}

function extractTableRows(table triggeringRandomIssue ) {
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(tableHtml)) !== null) {
    const trInner = m[1];
    // pull cells
    const cells = [];
    const tdRe = /<(td|th)\b[^>]*>([\s\S]*?)<\/(td|th)>/gi;
    let c;
    while ((c = tdRe.exec(trInner)) !== null) {
      cells.push(stripTagsToOneLine(c[2]));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function parseRankedTextLines(sectionHtml) {
  // Extract text with newlines, then parse lines containing "1." etc.
  const text = htmlToTextWithNewlines(sectionHtml);
  const lines = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const candidates = [];
  for (const line of lines) {
    // Look for rank prefix anywhere in the line
    const m = line.match(/^\s*(\d{1,3})\.\s*(.+)$/);
    if (!m) continue;
    candidates.push({ rank: Number(m[1]), rest: String(m[2]).trim() });
  }
  return candidates;
}

function parseRestToTitleArtist(rest) {
  // Accept:
  // Title by Artist
  // Title – Artist
  // Title - Artist
  let m = rest.match(/^(.+?)\s+by\s+(.+?)$/i);
  if (m) return { title: m[1].trim(), artist: m[2].trim() };

  m = rest.match(/^(.+?)\s*(?:–|-|—)\s*(.+?)$/);
  if (m) return { title: m[1].trim(), artist: m[2].trim() };

  return null;
}

function buildRows(year, parsedPairs) {
  const byRank = new Map();
  for (const p of parsedPairs) {
    const rank = Number(p.rank);
    if (!Number.isFinite(rank) || rank < 1 || rank > 100) continue;

    const ta = parseRestToTitleArtist(p.rest);
    if (!ta || !ta.title || !ta.artist) continue;

    if (!byRank.has(rank)) {
      byRank.set(rank, {
        year,
        rank,
        title: ta.title.replace(/^["“]|["”]$/g, "").trim(),
        artist: ta.artist,
        source: "top40weekly-1990s",
        url: SOURCE_URL + `#${year}-topsongslist`
      });
    }
  }

  return Array.from(byRank.values()).sort((a, b) => a.rank - b.rank);
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "NyxImporter/4.0" }
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

    // 1) OL/UL
    const listHtml = extractFirstListHtml(section);
    if (listHtml) {
      const items = extractLiItems(listHtml);
      const parsed = [];

      // In case rank isn't embedded in item text, infer from order.
      let inferred = 1;
      for (const it of items) {
        const m = it.match(/^(\d{1,3})\.\s*(.+)$/);
        if (m) {
          parsed.push({ rank: Number(m[1]), rest: String(m[2]).trim() });
        } else {
          parsed.push({ rank: inferred, rest: it });
        }
        inferred++;
      }

      const rows = buildRows(year, parsed);
      if (rows.length >= 90) {
        writeYearFile(year, rows);
        total += rows.length;
        continue;
      }
      console.warn(`[import] ${year}: OL/UL found but only ${rows.length} rows parsed. Falling back...`);
    }

    // 2) TABLE
    const tableHtml = extractFirstTableHtml(section);
    if (tableHtml) {
      const tableRows = extractTableRows(tableHtml);

      // heuristic mapping:
      // Common layouts:
      // [Rank, Song, Artist] or [Rank, Song - Artist] or [Rank, Title, Artist]
      const parsed = [];
      for (const r of tableRows) {
        if (!r || r.length < 2) continue;
        const rank = Number(String(r[0]).replace(/[^\d]/g, ""));
        if (!Number.isFinite(rank) || rank < 1 || rank > 100) continue;

        if (r.length >= 3) {
          // assume [rank, title, artist]
          parsed.push({ rank, rest: `${r[1]} - ${r[2]}` });
        } else {
          // [rank, combined]
          parsed.push({ rank, rest: r[1] });
        }
      }

      const rows = buildRows(year, parsed);
      if (rows.length >= 90) {
        writeYearFile(year, rows);
        total += rows.length;
        continue;
      }
      console.warn(`[import] ${year}: TABLE found but only ${rows.length} rows parsed. Falling back...`);
    }

    // 3) TEXT-LINE FALLBACK (within section)
    const ranked = parseRankedTextLines(section);
    const rows = buildRows(year, ranked);

    if (rows.length < 80) {
      console.warn(`[import] ${year}: fallback text parse produced ${rows.length} rows (expected ~100).`);
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
