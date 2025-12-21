/**
 * Scrape Top40Weekly "Top 100 Songs of YEAR" pages
 * Output: data/top40weekly/top100_YEAR.json
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const YEARS = [1980,1981,1982,1983,1984,1985,1986,1987,1988,1989];

const OUT_DIR = path.join(__dirname, "..", "data", "top40weekly");
fs.mkdirSync(OUT_DIR, { recursive: true });

function clean(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

// Attempts to split "Title – Artist" or "Title - Artist"
function splitTitleArtist(line) {
  const norm = line.replace(/[–—]/g, "-");
  const parts = norm.split(" - ").map(clean).filter(Boolean);
  if (parts.length >= 2) {
    const title = parts[0];
    const artist = parts.slice(1).join(" - ");
    return { title, artist };
  }
  return { title: clean(line), artist: "" };
}

async function scrapeYear(year) {
  const url = `https://top40weekly.com/top-100-songs-of-${year}/`;
  console.log("Scraping:", url);

  const { data: html } = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (SandblastNyxScraper/1.0)"
    },
    timeout: 20000
  });

  const $ = cheerio.load(html);

  // Top40Weekly pages typically contain an ordered list or table of entries.
  // We’ll parse common structures: <ol><li>...</li></ol> and tables.
  let rows = [];

  // 1) Ordered list
  $("ol li").each((_, el) => {
    const text = clean($(el).text());
    if (!text) return;

    // often formatted like: "1. Title – Artist"
    // remove leading rank markers
    const m = text.match(/^(\d{1,3})[.)]\s*(.+)$/);
    if (m) {
      const rank = parseInt(m[1], 10);
      const line = m[2];
      const { title, artist } = splitTitleArtist(line);
      if (rank && title) rows.push({ year, rank, title, artist, source: "top40weekly", url });
    }
  });

  // 2) Table fallback
  if (rows.length < 50) {
    $("table tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 2) return;

      const a = clean($(tds[0]).text());
      const b = clean($(tds[1]).text());
      const rank = parseInt(a, 10);
      if (!rank || rank > 100) return;

      const { title, artist } = splitTitleArtist(b);
      if (title) rows.push({ year, rank, title, artist, source: "top40weekly", url });
    });
  }

  // Deduplicate by rank
  const map = new Map();
  for (const r of rows) {
    if (!r.rank || r.rank < 1 || r.rank > 100) continue;
    if (!map.has(r.rank)) map.set(r.rank, r);
  }

  const out = Array.from(map.values()).sort((a, b) => a.rank - b.rank);

  if (out.length < 90) {
    console.warn(`WARNING: Only parsed ${out.length} rows for ${year}. The page structure may differ.`);
  }

  const outFile = path.join(OUT_DIR, `top100_${year}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`Saved ${out.length} rows -> ${outFile}`);
}

(async function run() {
  for (const y of YEARS) {
    try {
      await scrapeYear(y);
    } catch (e) {
      console.error("Failed year", y, e.message || e);
    }
  }
})();
