"use strict";

const fs = require("fs");
const path = require("path");

const OUT_DIR = path.resolve(__dirname, "..", "Data", "top40weekly");

const YEARS = [1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999];
const CHART_NAME = "Top40Weekly Top 100";

// Source strategy:
// - 1990–1998: each year is on its own page
// - 1999: list is embedded on the decade page (as you confirmed)
function getSourceUrl(year) {
  if (year === 1999) return "https://top40weekly.com/top-100-songs-of-the-1990s/";
  return `https://top40weekly.com/top-100-songs-of-${year}/`;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function decode(html) {
  return String(html || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Parse list items from a full page HTML
// Handles common patterns on Top40Weekly year pages:
// - <li>...</li>
// - <p>...</p>
// Looks for " by " delimiter.
// Rank is assigned sequentially as encountered.
function parseTop100FromHtml(pageHtml) {
  const blocks = [];
  let m;

  const liRegex = /<li[^>]*>(.*?)<\/li>/gis;
  while ((m = liRegex.exec(pageHtml)) !== null) blocks.push(m[1]);

  const pRegex = /<p[^>]*>(.*?)<\/p>/gis;
  while ((m = pRegex.exec(pageHtml)) !== null) blocks.push(m[1]);

  const items = [];
  let rank = 1;

  for (const block of blocks) {
    if (rank > 100) break;

    const text = decode(block.replace(/<[^>]+>/g, " "));
    if (!text || !text.toLowerCase().includes(" by ")) continue;

    const parts = text.split(/\s+by\s+/i);
    if (parts.length < 2) continue;

    const title = parts[0].trim();
    const artist = parts.slice(1).join(" by ").trim();

    if (!title || !artist) continue;

    items.push({ rank, title, artist });
    rank++;
  }

  return items;
}

async function fetchHtml(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return await res.text();
}

(async function main() {
  if (typeof fetch !== "function") {
    console.error("Node 18+ required (fetch missing)");
    process.exit(1);
  }

  ensureDir(OUT_DIR);

  let total = 0;

  for (const year of YEARS) {
    const url = getSourceUrl(year);
    console.log(`[build_top40weekly_1990s] Fetching ${url}`);

    let html;
    try {
      html = await fetchHtml(url);
    } catch (e) {
      console.log(`[build_top40weekly_1990s] ${year}: fetch failed: ${String(e?.message || e)}`);
      // Write empty file so you see the gap immediately
      const outPath = path.join(OUT_DIR, `top100_${year}.json`);
      fs.writeFileSync(outPath, JSON.stringify([], null, 2), "utf8");
      continue;
    }

    const rows = parseTop100FromHtml(html);
    console.log(`[build_top40weekly_1990s] ${year}: parsed ${rows.length} rows`);

    const payload = rows.map((r) => ({
      year,
      chart: CHART_NAME,
      rank: r.rank,
      title: r.title,
      artist: r.artist
    }));

    const outPath = path.join(OUT_DIR, `top100_${year}.json`);
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");

    total += payload.length;
  }

  console.log(`[build_top40weekly_1990s] Done. Total rows written: ${total}`);
})().catch((e) => {
  console.error(`[build_top40weekly_1990s] ERROR: ${String(e?.message || e)}`);
  process.exit(1);
});
