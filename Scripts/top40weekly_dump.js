/**
 * Dump Top40Weekly year pages into a normalized CSV.
 * You run it locally where you have internet access.
 *
 * Usage:
 *   node scripts/top40weekly_dump.js 1980 1999 > Data/top40weekly_1980_1999.csv
 *
 * Requirements:
 *   npm i cheerio
 */

const cheerio = require("cheerio");

const startYear = parseInt(process.argv[2], 10);
const endYear = parseInt(process.argv[3], 10);

if (!startYear || !endYear || endYear < startYear) {
  console.error("Usage: node scripts/top40weekly_dump.js <startYear> <endYear>");
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

// Best-effort: Top40Weekly has multiple layouts; we try common tables/lists.
// If a year fails, we print a warning and continue.
async function fetchYear(year) {
  const url = `https://top40weekly.com/${year}-all-charts/`; // common pattern
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Try to find rows with Artist + Title in a table
  const rows = [];
  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length >= 2) {
      const a = $(tds[0]).text().trim();
      const t = $(tds[1]).text().trim();
      if (a && t && a.length < 120 && t.length < 180) rows.push({ artist: a, title: t });
    }
  });

  // Fallback: lists
  if (rows.length < 10) {
    $("li").each((_, li) => {
      const text = $(li).text().trim();
      // pattern: Artist - Title
      const m = text.match(/^(.{2,120})\s*[-–—]\s*(.{2,180})$/);
      if (m) rows.push({ artist: m[1].trim(), title: m[2].trim() });
    });
  }

  // De-dupe by normalized key
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = `${norm(r.artist)}|${norm(r.title)}|${year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ year, artist: r.artist, title: r.title });
  }
  return out;
}

(async () => {
  console.log("year,artist,title"); // CSV header
  for (let y = startYear; y <= endYear; y++) {
    try {
      const items = await fetchYear(y);
      if (!items.length) {
        console.error(`[WARN] No rows parsed for ${y}. You may need to adjust URL/layout.`);
        continue;
      }
      for (const it of items) {
        // simple CSV escaping
        const a = `"${String(it.artist).replace(/"/g, '""')}"`;
        const t = `"${String(it.title).replace(/"/g, '""')}"`;
        console.log(`${it.year},${a},${t}`);
      }
      console.error(`[OK] ${y}: ${items.length} rows`);
    } catch (e) {
      console.error(`[WARN] ${y}: ${e.message}`);
    }
  }
})();
