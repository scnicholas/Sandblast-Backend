"use strict";

const fs = require("fs");
const path = require("path");

const SOURCE_URL = "https://top40weekly.com/top-100-songs-of-the-1990s/";
const OUT_DIR = path.resolve(__dirname, "..", "Data", "top40weekly");

const YEARS = [1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999];
const CHART_NAME = "Top40Weekly Top 100";

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

// ✅ Correctly isolate each year by its H2 heading: <h2>1990</h2>, <h2>1991</h2>, etc.
// The decade page uses "## 1990" style headings (rendered as <h2>1990</h2>). :contentReference[oaicite:2]{index=2}
function extractYearSectionByHeading(html, year) {
  const startRe = new RegExp(`<h2[^>]*>\\s*${year}\\s*<\\/h2>`, "i");
  const startMatch = startRe.exec(html);
  if (!startMatch) return null;

  const start = startMatch.index;

  const nextYear = YEARS.find((y) => y > year);
  if (!nextYear) return html.slice(start);

  const endRe = new RegExp(`<h2[^>]*>\\s*${nextYear}\\s*<\\/h2>`, "i");
  const endMatch = endRe.exec(html.slice(start + 1));
  if (!endMatch) return html.slice(start);

  const end = start + 1 + endMatch.index;
  return html.slice(start, end);
}

function parseListItems(sectionHtml) {
  const items = [];
  let rank = 1;

  // Prefer <li> blocks if present
  const blocks = [];
  let m;

  const liRegex = /<li[^>]*>(.*?)<\/li>/gis;
  while ((m = liRegex.exec(sectionHtml)) !== null) blocks.push(m[1]);

  // Fallback: sometimes entries are in <p> blocks
  const pRegex = /<p[^>]*>(.*?)<\/p>/gis;
  while ((m = pRegex.exec(sectionHtml)) !== null) blocks.push(m[1]);

  for (const block of blocks) {
    if (rank > 100) break;

    const text = decode(block.replace(/<[^>]+>/g, " "));
    if (!text) continue;

    // Must contain " by "
    if (!text.toLowerCase().includes(" by ")) continue;

    // Split on " by "
    const parts = text.split(/\s+by\s+/i);
    if (parts.length < 2) continue;

    // Strip leading numbering if the text includes "1." etc.
    const rawTitle = parts[0].trim().replace(/^\d+\.\s*/, "");
    const artist = parts.slice(1).join(" by ").trim();

    if (!rawTitle || !artist) continue;

    items.push({ rank, title: rawTitle, artist });
    rank++;
  }

  return items;
}

async function fetchHtml(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

(async function main() {
  if (typeof fetch !== "function") {
    console.error("Node 18+ required (fetch missing)");
    process.exit(1);
  }

  console.log(`[build_top40weekly_1990s] Fetching ${SOURCE_URL}`);
  const html = await fetchHtml(SOURCE_URL);

  ensureDir(OUT_DIR);

  let total = 0;

  for (const year of YEARS) {
    const section = extractYearSectionByHeading(html, year);
    if (!section) {
      console.warn(`[build_top40weekly_1990s] ${year}: heading section not found`);
      fs.writeFileSync(path.join(OUT_DIR, `top100_${year}.json`), "[]", "utf8");
      continue;
    }

    const rows = parseListItems(section);
    console.log(`[build_top40weekly_1990s] ${year}: parsed ${rows.length} rows`);

    const payload = rows.map((r) => ({
      year,
      chart: CHART_NAME,
      rank: r.rank,
      title: r.title,
      artist: r.artist,
    }));

    fs.writeFileSync(
      path.join(OUT_DIR, `top100_${year}.json`),
      JSON.stringify(payload, null, 2),
      "utf8"
    );

    total += payload.length;
  }

  console.log(`[build_top40weekly_1990s] Done. Total rows written: ${total}`);
})().catch((e) => {
  console.error(`[build_top40weekly_1990s] ERROR: ${String(e?.message || e)}`);
  process.exit(1);
});
