"use strict";

/**
 * Scripts/ingest_wikipedia_yearend_hot100_60s_v1.js
 *
 * Fetches Wikipedia "Billboard Year-End Hot 100 singles of YYYY" pages,
 * parses the main Year-End table into structured rows, validates ranks,
 * and outputs:
 *  1) Data/top100_billboard_yearend_1960s_v1.json   (flat array)
 *  2) Data/top10_by_year_v1.json                   (years map + meta; Top 10 only)
 *
 * Default: runs 1960 ONLY (for validation-first workflow).
 * To run all years: node Scripts/ingest_wikipedia_yearend_hot100_60s_v1.js --years=1960-1969
 * Or specific set: node ... --years=1960,1961,1962
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_TOP100 = path.join(ROOT, "Data", "top100_billboard_yearend_1960s_v1.json");
const OUT_TOP10 = path.join(ROOT, "Data", "top10_by_year_v1.json");

const SOURCE = "Wikipedia — Billboard Year-End Hot 100 singles";
const CHART = "Billboard Year-End Hot 100";

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function cleanText(s) {
  return String(s || "")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s) {
  // Minimal HTML entity decode for Wikipedia tables
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "—")
    .replace(/&#8216;|&#8217;|&lsquo;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"');
}

function stripTags(html) {
  return cleanText(
    decodeEntities(String(html || "").replace(/<[^>]+>/g, " "))
  );
}

function looksLikeBotOrBlocked(html) {
  const t = String(html || "").toLowerCase();
  return (
    t.includes("captcha") ||
    t.includes("access denied") ||
    t.includes("cloudflare") ||
    t.includes("just a moment") ||
    t.includes("verify you are human")
  );
}

function parseArgsYears() {
  const arg = process.argv.find((a) => a.startsWith("--years="));
  if (!arg) return [1960]; // default: validate 1960 first

  const raw = arg.split("=", 2)[1] || "";
  const t = raw.trim();
  if (!t) return [1960];

  // formats supported:
  //  - 1960-1969
  //  - 1960,1961,1962
  if (t.includes("-")) {
    const [a, b] = t.split("-", 2).map((x) => Number(x.trim()));
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const out = [];
      for (let y = lo; y <= hi; y++) out.push(y);
      return out;
    }
  }

  const parts = t.split(",").map((x) => Number(x.trim())).filter(Number.isFinite);
  return parts.length ? parts : [1960];
}

function buildUrl(year) {
  // Wikipedia canonical page
  return `https://en.wikipedia.org/wiki/Billboard_Year-End_Hot_100_singles_of_${year}`;
}

function findCandidateTables(html) {
  // Pull all wikitable blocks (common for Wikipedia lists)
  const tables = [];
  const rx = /<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>[\s\S]*?<\/table>/gi;
  let m;
  while ((m = rx.exec(html))) {
    tables.push(m[0]);
  }
  return tables;
}

function scoreTable(tableHtml) {
  // We want the table that looks like a ranked list with Title + Artist
  const t = tableHtml.toLowerCase();
  let score = 0;

  if (t.includes("rank") || t.includes(">no.<") || t.includes(">no</")) score += 2;
  if (t.includes("title")) score += 2;
  if (t.includes("artist")) score += 2;
  if (t.includes("hot 100")) score += 1;
  if (t.includes("single")) score += 1;

  // many rows suggests it is the main chart table
  const rows = (tableHtml.match(/<tr/gi) || []).length;
  if (rows >= 50) score += 2;
  if (rows >= 100) score += 1;

  return score;
}

function pickBestTable(html) {
  const tables = findCandidateTables(html);
  if (!tables.length) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const tbl of tables) {
    const s = scoreTable(tbl);
    if (s > bestScore) {
      best = tbl;
      bestScore = s;
    }
  }
  return best;
}

function parseRowsFromTable(tableHtml) {
  // Parse each <tr> ... </tr>
  const rows = [];
  const rxTr = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  let m;
  while ((m = rxTr.exec(tableHtml))) {
    rows.push(m[0]);
  }
  return rows;
}

function parseCellsFromRow(trHtml) {
  // Wikipedia rows often: <th scope="row">1</th><td>Title</td><td>Artist</td>
  // We'll collect both th and td in order.
  const cells = [];
  const rxCell = /<(th|td)[^>]*>[\s\S]*?<\/\1>/gi;
  let m;
  while ((m = rxCell.exec(trHtml))) {
    cells.push(m[0]);
  }
  return cells;
}

function parseYearEndTable(year, html) {
  const table = pickBestTable(html);
  if (!table) return { rows: [], error: "NO_WIKITABLE_FOUND" };

  const trs = parseRowsFromTable(table);

  const out = [];
  for (const tr of trs) {
    const cells = parseCellsFromRow(tr);
    if (!cells || cells.length < 3) continue;

    const c0 = stripTags(cells[0]);
    const c1 = stripTags(cells[1]);
    const c2 = stripTags(cells[2]);

    // rank must be numeric
    const rank = Number(String(c0).replace(/[^\d]/g, ""));
    if (!Number.isFinite(rank) || rank < 1 || rank > 100) continue;

    // title/artist should be non-empty
    const title = cleanText(c1);
    const artist = cleanText(c2);
    if (!title || !artist) continue;

    out.push({
      year,
      rank,
      title,
      artist,
      source: SOURCE,
      chart: CHART,
      url: buildUrl(year),
    });
  }

  // Dedup by rank (some pages can include footnote artifacts)
  const seen = new Set();
  const dedup = [];
  for (const r of out) {
    const k = `${r.year}:${r.rank}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(r);
  }

  dedup.sort((a, b) => a.rank - b.rank);
  return { rows: dedup, error: null };
}

function validateYearRows(year, rows) {
  const ranks = rows.map((r) => r.rank).filter(Number.isFinite);
  const set = new Set(ranks);

  const missing = [];
  for (let i = 1; i <= 100; i++) {
    if (!set.has(i)) missing.push(i);
  }

  const dupes = ranks.length - set.size;

  const okTop10 = missing.filter((x) => x <= 10).length === 0 && rows.length >= 10;

  return {
    year,
    count: rows.length,
    dupes,
    missingCount: missing.length,
    missingTop10: missing.filter((x) => x <= 10),
    okTop10,
    missingSample: missing.slice(0, 15),
  };
}

function buildTop10ByYear(allRows) {
  const years = {};
  for (const r of allRows) {
    const y = String(r.year);
    if (!years[y]) {
      years[y] = { year: r.year, chart: CHART, items: [] };
    }
    if (r.rank >= 1 && r.rank <= 10) {
      years[y].items.push({ pos: r.rank, artist: r.artist, title: r.title });
    }
  }

  // sort each year items
  for (const y of Object.keys(years)) {
    years[y].items.sort((a, b) => a.pos - b.pos);
  }

  // meta counts
  const builtYears = Object.keys(years).length;
  let yearsWithComplete10 = 0;
  for (const y of Object.keys(years)) {
    if (years[y].items.length === 10) yearsWithComplete10++;
  }

  return {
    version: "top10_by_year_v1",
    chart: CHART,
    source: "wikipedia year-end hot 100 (parsed)",
    generatedAt: new Date().toISOString(),
    meta: {
      outputFile: "Data/top10_by_year_v1.json",
      strict: true,
      yearsBuilt: builtYears,
      yearsWithComplete10,
    },
    years,
  };
}

async function fetchHtml(url) {
  const r = await fetch(url, {
    headers: {
      // Friendly UA reduces weird blocks
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SandblastBot/1.0 (YearEndParser)",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

async function main() {
  ensureDir(path.join(ROOT, "Data"));

  const years = parseArgsYears();

  console.log("Years:", years.join(", "));
  console.log("Chart:", CHART);
  console.log("Source:", SOURCE);

  const all = [];

  for (const year of years) {
    const url = buildUrl(year);
    console.log(`\n[${year}] Fetching: ${url}`);

    const resp = await fetchHtml(url);
    if (!resp.ok) {
      console.log(`[${year}] ERROR: fetch failed status=${resp.status}`);
      continue;
    }

    const html = resp.text || "";
    if (looksLikeBotOrBlocked(html)) {
      console.log(`[${year}] ERROR: looks blocked (captcha/bot page). Try again later or from a different network.`);
      continue;
    }

    const parsed = parseYearEndTable(year, html);
    if (parsed.error) {
      console.log(`[${year}] ERROR: ${parsed.error}`);
      continue;
    }

    const v = validateYearRows(year, parsed.rows);
    console.log(
      `[${year}] rows=${v.count} dupes=${v.dupes} missing=${v.missingCount} missingTop10=${v.missingTop10.join(",") || "none"}`
    );

    // STRICT VALIDATION: for validation-first workflow
    // - If you're running 1960 only, we enforce Top10 completeness
    if (years.length === 1 && year === 1960) {
      if (!v.okTop10) {
        console.log(`[${year}] FAIL: Top 10 is incomplete. Missing ranks: ${v.missingTop10.join(",") || "?"}`);
        process.exit(2);
      }
      console.log(`[${year}] PASS: Top 10 is complete. Proceeding to write outputs.`);
    }

    all.push(...parsed.rows);
  }

  // Write Top100 flat output
  fs.writeFileSync(OUT_TOP100, JSON.stringify(all, null, 2), "utf8");
  console.log("\nWrote:", OUT_TOP100);
  console.log("Total rows:", all.length);

  // Build & write Top10_by_year_v1.json (your schema)
  const top10 = buildTop10ByYear(all);
  fs.writeFileSync(OUT_TOP10, JSON.stringify(top10, null, 2), "utf8");
  console.log("Wrote:", OUT_TOP10);

  // Summary validation for included years
  const builtYears = Object.keys(top10.years || {}).map(Number).sort((a, b) => a - b);
  if (builtYears.length) {
    console.log("\nTop10 years built:", builtYears.join(", "));
    const incomplete = builtYears.filter((y) => (top10.years[String(y)].items || []).length !== 10);
    if (incomplete.length) {
      console.log("WARNING: years with incomplete Top10:", incomplete.join(", "));
    } else {
      console.log("All built years have complete Top10.");
    }
  } else {
    console.log("\nWARNING: No Top10 years built (no parsed data).");
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
