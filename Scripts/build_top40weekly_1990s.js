"use strict";

const fs = require("fs");
const path = require("path");

const SOURCE_URL = "https://top40weekly.com/top-100-songs-of-the-1990s/";
const OUT_DIR = path.resolve(__dirname, "..", "Data", "top40weekly");

const YEARS = [1990,1991,1992,1993,1994,1995,1996,1997,1998,1999];
const CHART_NAME = "Top40Weekly Top 100";

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function decode(html) {
  return html
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYearSection(html, year) {
  const start = html.indexOf(`id="${year}-topsongslist"`);
  if (start === -1) return null;

  const nextYear = YEARS.find(y => y > year);
  if (!nextYear) return html.slice(start);

  const end = html.indexOf(`id="${nextYear}-topsongslist"`, start + 1);
  return end === -1 ? html.slice(start) : html.slice(start, end);
}

function parseListItems(sectionHtml) {
  const items = [];
  let rank = 1;
  const blocks = [];

  // 1999 uses <li>
  const liRegex = /<li[^>]*>(.*?)<\/li>/gis;
  let m;
  while ((m = liRegex.exec(sectionHtml)) !== null) {
    blocks.push(m[1]);
  }

  // 1990–1998 mostly use <p>
  const pRegex = /<p[^>]*>(.*?)<\/p>/gis;
  while ((m = pRegex.exec(sectionHtml)) !== null) {
    blocks.push(m[1]);
  }

  for (const block of blocks) {
    if (rank > 100) break;

    let text = decode(block.replace(/<[^>]+>/g, " "));
    if (!text.toLowerCase().includes(" by ")) continue;

    const parts = text.split(/\s+by\s+/i);
    if (parts.length < 2) continue;

    const title = parts[0].trim();
    const artist = parts.slice(1).join(" by ").trim();

    if (!title || !artist) continue;

    items.push({
      rank,
      title,
      artist
    });

    rank++;
  }

  return items;
}

(async function main() {
  if (typeof fetch !== "function") {
    console.error("Node 18+ required (fetch missing)");
    process.exit(1);
  }

  console.log(`[build_top40weekly_1990s] Fetching ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  const html = await res.text();

  ensureDir(OUT_DIR);

  let total = 0;

  for (const year of YEARS) {
    const section = extractYearSection(html, year);
    if (!section) {
      console.warn(`[build_top40weekly_1990s] ${year}: section not found`);
      continue;
    }

    const rows = parseListItems(section);
    console.log(`[build_top40weekly_1990s] ${year}: parsed ${rows.length} rows`);

    const payload = rows.map(r => ({
      year,
      chart: CHART_NAME,
      rank: r.rank,
      title: r.title,
      artist: r.artist
    }));

    fs.writeFileSync(
      path.join(OUT_DIR, `top100_${year}.json`),
      JSON.stringify(payload, null, 2),
      "utf8"
    );

    total += payload.length;
  }

  console.log(`[build_top40weekly_1990s] Done. Total rows written: ${total}`);
})();
