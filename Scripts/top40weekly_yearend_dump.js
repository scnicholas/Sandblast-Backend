/**
 * Top40Weekly Year-End chart dumper (high coverage).
 * Writes CSV: year,artist,title
 *
 * Usage:
 *   npm i cheerio
 *   node scripts/top40weekly_yearend_dump.js 1960 2019 | Out-File -Encoding utf8 Data\top40weekly_yearend_1960_2019.csv
 */

"use strict";

const cheerio = require("cheerio");

const startYear = parseInt(process.argv[2], 10);
const endYear = parseInt(process.argv[3], 10);

if (!startYear || !endYear || endYear < startYear) {
  console.error("Usage: node scripts/top40weekly_yearend_dump.js <startYear> <endYear>");
  process.exit(1);
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function extractRows($) {
  const out = [];

  // Common pattern 1: table rows with rank/artist/title
  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length >= 3) {
      const a = $(tds[1]).text().trim();
      const t = $(tds[2]).text().trim();
      if (a && t) out.push({ artist: a, title: t });
    }
    // Some pages may be rank + title + artist
    if (tds.length >= 3 && out.length === 0) {
      const t1 = $(tds[1]).text().trim();
      const t2 = $(tds[2]).text().trim();
      // guess which is artist/title by wordiness
      if (t1 && t2) {
        const guessArtist = t1.split(" ").length <= 5 ? t1 : t2;
        const guessTitle = guessArtist === t1 ? t2 : t1;
        out.push({ artist: guessArtist.trim(), title: guessTitle.trim() });
      }
    }
  });

  // Common pattern 2: list items "Artist - Title"
  if (out.length < 20) {
    $("li").each((_, li) => {
      const text = $(li).text().trim();
      const m = text.match(/^(.{2,120})\s*[-–—]\s*(.{2,180})$/);
      if (m) out.push({ artist: m[1].trim(), title: m[2].trim() });
    });
  }

  // De-dupe
  const seen = new Set();
  const clean = [];
  for (const r of out) {
    const key = `${norm(r.artist)}|${norm(r.title)}`;
    if (!r.artist || !r.title) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(r);
  }
  return clean;
}

async function tryYearUrls(year) {
  // Top40Weekly has multiple slug patterns over the years.
  // We try several known patterns; first successful wins.
  const candidates = [
    `https://top40weekly.com/${year}-year-end-charts/`,
    `https://top40weekly.com/${year}-year-end-hot-100/`,
    `https://top40weekly.com/${year}-year-end/`,
    `https://top40weekly.com/${year}-year-end-top-100/`,
    `https://top40weekly.com/top-100-songs-of-${year}/`
  ];

  for (const url of candidates) {
    try {
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);
      const rows = extractRows($);
      if (rows.length >= 50) return { url, rows };
    } catch (_) {}
  }
  return null;
}

(async () => {
  console.log("year,artist,title");

  for (let y = startYear; y <= endYear; y++) {
    const hit = await tryYearUrls(y);
    if (!hit) {
      console.error(`[WARN] ${y}: no year-end page parsed`);
      continue;
    }
    const { url, rows } = hit;
    console.error(`[OK] ${y}: ${rows.length} rows (${url})`);

    for (const r of rows) {
      const a = `"${String(r.artist).replace(/"/g, '""')}"`;
      const t = `"${String(r.title).replace(/"/g, '""')}"`;
      console.log(`${y},${a},${t}`);
    }
  }
})();
