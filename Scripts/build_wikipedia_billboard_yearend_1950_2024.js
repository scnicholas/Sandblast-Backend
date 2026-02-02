/**
 * Build Billboard Year-End Hot 100 dataset from Wikipedia (1950–2024).
 *
 * Output:
 *   Data/wikipedia/billboard_yearend_hot100_1950_2024.json
 *   (optionally per-year files if you enable WRITE_PER_YEAR)
 *
 * Key hardening:
 * - Picks best wikitable via header scoring + sanity-check parse
 * - Handles header variants: No./#/Rank/Position, Title/Song, Artist/Artist(s)
 * - Propagates rowspan blanks by carrying forward last non-empty title/artist
 * - Normalizes quotes/whitespace, strips footnotes
 * - URL fallback attempts for missing/redirected pages
 * - Rank coverage validation (prefer 1..100) instead of naive row-count checks
 *
 * Node: 18+ (global fetch)
 */

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const START_YEAR = 1950;
const END_YEAR = 2024;

const OUT_DIR = path.join(process.cwd(), "Data", "wikipedia");
const OUT_FILE = path.join(OUT_DIR, "billboard_yearend_hot100_1950_2024.json");

// Set true if you want a file per year in addition to the combined file
const WRITE_PER_YEAR = false;

// Throttle between requests (ms). Wikipedia-friendly.
const THROTTLE_MS = 250;

// Validation tuning
const EXPECT_TOP_RANK = 1;
const EXPECT_BOTTOM_RANK = 100;
// Some early pages can be odd—require at least this many unique ranks to accept.
const MIN_UNIQUE_RANKS_ACCEPT = 75;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// ---------- Text normalization utilities ----------
function stripFootnotes(s) {
  // Remove bracketed refs like [1], [a], [note 2]
  return String(s || "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\u00A0/g, " ")
    .trim();
}

function normalizeQuotes(s) {
  return String(s || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function cleanCellText(s) {
  let t = String(s || "");
  t = t.replace(/\s+/g, " ").trim();
  t = stripFootnotes(t);
  t = normalizeQuotes(t);
  // Remove outer quotes if the whole title is quoted
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("“") && t.endsWith("”"))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function normHeader(s) {
  return cleanCellText(s).toLowerCase();
}

function isRankHeader(h) {
  const x = normHeader(h);
  return (
    x === "no" ||
    x === "no." ||
    x === "#" ||
    x.includes("no.") ||
    x.includes("rank") ||
    x.includes("position") ||
    x === "pos" ||
    x === "no#" ||
    x === "number"
  );
}

function isTitleHeader(h) {
  const x = normHeader(h);
  return x.includes("title") || x.includes("song") || x.includes("single");
}

function isArtistHeader(h) {
  const x = normHeader(h);
  return x.includes("artist"); // catches "Artist(s)" etc.
}

function parseIntLoose(s) {
  const m = String(s || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : NaN;
}

// ---------- Wikipedia fetching ----------
function wikiUrlCandidates(year) {
  // Primary canonical pattern (most years)
  // Some pages can redirect, but fetch handles redirects automatically.
  // If a year truly 404s, we try alternates.
  return [
    `https://en.wikipedia.org/wiki/Billboard_Year-End_Hot_100_singles_of_${year}`,
    // Fallback variants (rare, but worth having):
    `https://en.wikipedia.org/wiki/Billboard_Year-End_Hot_100_singles_of_${year}_year`,
    `https://en.wikipedia.org/wiki/Billboard_Year-End_Hot_100_singles_of_${year}_%28United_States%29`
  ];
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Sandblast-Nyx/1.0 (data build; contact: sandblastchannel@gmail.com)"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function fetchYearHtmlWithFallback(year) {
  const candidates = wikiUrlCandidates(year);
  let lastErr = null;

  for (const url of candidates) {
    try {
      const html = await fetchHtml(url);
      return { url, html };
    } catch (e) {
      lastErr = e;
      // Try next candidate on 404/other failures
    }
  }

  throw new Error(lastErr ? lastErr.message : `Failed to fetch year ${year}`);
}

// ---------- Table selection heuristic ----------
function scoreTable($tbl, $) {
  const headerCells = $tbl.find("tr").first().find("th,td");
  const headers = headerCells
    .map((_, el) => cleanCellText($(el).text()))
    .get();

  let score = 0;
  const hasRank = headers.some(isRankHeader);
  const hasTitle = headers.some(isTitleHeader);
  const hasArtist = headers.some(isArtistHeader);

  if (hasRank) score += 10;
  if (hasTitle) score += 10;
  if (hasArtist) score += 10;

  const trCount = $tbl.find("tr").length;
  const dataRows = Math.max(0, trCount - 1);

  // Prefer ~100 rows tables
  if (dataRows >= 90) score += 10;
  else if (dataRows >= 50) score += 6;
  else if (dataRows >= 20) score += 2;

  if (dataRows < 10) score -= 6;

  if (headers.length >= 3 && headers.length <= 6) score += 2;

  return { score, headers, dataRows };
}

function detectColumnMap(headers) {
  const map = { rank: -1, title: -1, artist: -1 };
  headers.forEach((h, idx) => {
    if (map.rank === -1 && isRankHeader(h)) map.rank = idx;
    if (map.title === -1 && isTitleHeader(h)) map.title = idx;
    if (map.artist === -1 && isArtistHeader(h)) map.artist = idx;
  });
  return map;
}

function extractRowCells($row, $) {
  const cells = $row
    .find("td,th")
    .map((_, el) => cleanCellText($(el).text()))
    .get();
  return cells;
}

function parseYearTable($tbl, year, $) {
  const headerRow = $tbl.find("tr").first();
  const headers = headerRow
    .find("th,td")
    .map((_, el) => cleanCellText($(el).text()))
    .get();

  const colMap = detectColumnMap(headers);

  if (colMap.rank === -1 || colMap.title === -1 || colMap.artist === -1) {
    throw new Error(
      `Could not detect columns for year ${year}. headers=${JSON.stringify(headers)}`
    );
  }

  const rows = [];
  let lastTitle = "";
  let lastArtist = "";

  const trList = $tbl.find("tr").toArray().slice(1);

  for (const tr of trList) {
    const $row = $(tr);
    const cells = extractRowCells($row, $);
    if (!cells || cells.length < 2) continue;

    const rankRaw = cells[colMap.rank] ?? "";
    const rank = parseIntLoose(rankRaw);
    if (!Number.isFinite(rank)) continue;

    let title = cells[colMap.title] ?? "";
    let artist = cells[colMap.artist] ?? "";

    // Handle rowspan blanks / empty cells
    if (!title) title = lastTitle;
    if (!artist) artist = lastArtist;

    title = cleanCellText(title);
    artist = cleanCellText(artist);

    if (title) lastTitle = title;
    if (artist) lastArtist = artist;

    if (!title || !artist) continue;

    rows.push({
      year,
      rank,
      title,
      artist,
      chart: "Billboard Year-End Hot 100"
    });
  }

  rows.sort((a, b) => a.rank - b.rank);

  return rows;
}

// ---------- Validation ----------
function analyzeRankCoverage(rows) {
  const rankSet = new Set(rows.map((r) => r.rank).filter((n) => Number.isFinite(n)));
  const uniqueRanks = rankSet.size;

  const hasTop = rankSet.has(EXPECT_TOP_RANK);
  const hasBottom = rankSet.has(EXPECT_BOTTOM_RANK);

  // Detect gaps (only meaningful if ranks are mostly present)
  const gaps = [];
  if (uniqueRanks > 0) {
    const minR = Math.min(...rankSet);
    const maxR = Math.max(...rankSet);
    for (let r = minR; r <= maxR; r++) {
      if (!rankSet.has(r)) gaps.push(r);
      if (gaps.length > 30) break; // don't spam
    }
  }

  return { uniqueRanks, hasTop, hasBottom, gapsPreview: gaps };
}

function isAcceptableParse(rows) {
  const cov = analyzeRankCoverage(rows);

  // Core rule: enough unique ranks, plus at least rank 1.
  if (!cov.hasTop) return { ok: false, reason: "missing_rank_1", cov };

  if (cov.uniqueRanks < MIN_UNIQUE_RANKS_ACCEPT) {
    return { ok: false, reason: `low_unique_ranks_${cov.uniqueRanks}`, cov };
  }

  // Bonus/expectation: rank 100 is usually present; if missing, still accept
  // but mark as "thin" so you can review.
  const thin = !cov.hasBottom;

  return { ok: true, thin, cov };
}

// ---------- Better table picking: score + parse sanity ----------
function pickBestWikitableByParse($, year) {
  const tables = $("table.wikitable").toArray();
  if (!tables.length) return null;

  let best = null;

  for (const tbl of tables) {
    const $tbl = $(tbl);
    const info = scoreTable($tbl, $);

    // If headers don't even roughly match, skip early.
    if (!(info.headers.some(isRankHeader) && info.headers.some(isTitleHeader) && info.headers.some(isArtistHeader))) {
      continue;
    }

    // Try parsing the table; if it throws, skip
    let rows = null;
    try {
      rows = parseYearTable($tbl, year, $);
    } catch (_e) {
      continue;
    }

    const verdict = isAcceptableParse(rows);

    // Base combined score
    let combined = info.score;

    // Reward good parses
    if (verdict.ok) combined += 12;
    if (verdict.ok && !verdict.thin) combined += 4;

    // Penalize bad parses
    if (!verdict.ok) combined -= 20;

    if (!best || combined > best.combinedScore) {
      best = { $tbl, info, combinedScore: combined, rows, verdict };
    }
  }

  return best;
}

// ---------- Main build ----------
async function build() {
  ensureDir(OUT_DIR);

  const all = [];
  const failures = [];
  const thinYears = [];
  const okYears = [];

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    try {
      const { url, html } = await fetchYearHtmlWithFallback(year);
      const $ = cheerio.load(html);

      const best = pickBestWikitableByParse($, year);
      if (!best || !best.rows) throw new Error(`No suitable wikitable parse found`);

      const verdict = best.verdict || isAcceptableParse(best.rows);
      if (!verdict.ok) {
        throw new Error(`Parse rejected (${verdict.reason})`);
      }

      const rows = best.rows;

      all.push(...rows);
      okYears.push({ year, url, rows: rows.length, score: best.info.score, combined: best.combinedScore });

      if (verdict.thin) {
        thinYears.push({
          year,
          url,
          rows: rows.length,
          uniqueRanks: verdict.cov.uniqueRanks,
          has100: verdict.cov.hasBottom,
          gapsPreview: verdict.cov.gapsPreview
        });
      }

      if (WRITE_PER_YEAR) {
        const perYearPath = path.join(OUT_DIR, `billboard_yearend_hot100_${year}.json`);
        fs.writeFileSync(perYearPath, JSON.stringify(rows, null, 2), "utf8");
      }

      console.log(
        `[OK] ${year}: ${rows.length} rows (tableScore=${best.info.score}, combined=${best.combinedScore}, uniqueRanks=${verdict.cov.uniqueRanks}${verdict.thin ? ", THIN" : ""
        })`
      );
    } catch (e) {
      const yearUrls = wikiUrlCandidates(year);
      console.error(`[FAIL] ${year}: ${e.message}`);
      failures.push({
        year,
        urlCandidates: yearUrls,
        error: e.message
      });
    }

    await sleep(THROTTLE_MS);
  }

  // Duplicate detection (same year+rank)
  const dupes = [];
  const seen = new Set();
  for (const r of all) {
    const k = `${r.year}:${r.rank}`;
    if (seen.has(k)) dupes.push(k);
    else seen.add(k);
  }

  const out = {
    ok: failures.length === 0,
    chart: "Billboard Year-End Hot 100",
    range: { start: START_YEAR, end: END_YEAR },
    totalRows: all.length,
    yearCount: END_YEAR - START_YEAR + 1,
    okYearCount: okYears.length,
    thinYearCount: thinYears.length,
    duplicateYearRankCount: dupes.length,
    duplicatesPreview: dupes.slice(0, 25),
    failures,
    thinYears,
    // Keep same field name you used ("moments") for compatibility with your other ingestion.
    moments: all
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  console.log(`\nWrote: ${OUT_FILE}`);
  console.log(`Total rows: ${all.length}`);
  console.log(`Years OK: ${okYears.length}/${END_YEAR - START_YEAR + 1}`);
  if (thinYears.length) console.log(`Thin years (missing rank 100 or gaps): ${thinYears.length}`);
  if (dupes.length) console.log(`Duplicate year-rank keys: ${dupes.length}`);
  if (failures.length) {
    console.log(`Failures: ${failures.length}`);
    console.log(JSON.stringify(failures.slice(0, 10), null, 2));
    process.exitCode = 2;
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
