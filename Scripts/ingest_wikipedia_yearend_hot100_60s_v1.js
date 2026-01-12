"use strict";

/**
 * Scripts/ingest_wikipedia_yearend_hot100_60s_v1.js
 *
 * Uses MediaWiki API (NOT HTML scraping) to fetch wikitext for:
 *   Billboard_Year-End_Hot_100_singles_of_YYYY
 *
 * Parses the year-end wikitable into rows: {year, rank, title, artist, source, chart, url}
 *
 * Outputs:
 *  1) Data/top100_billboard_yearend_1960s_v1.json (flat array)
 *  2) Data/top10_by_year_v1.json (years map + meta; Top 10 only)
 *
 * Default: 1960 only (validate-first)
 *   node Scripts/ingest_wikipedia_yearend_hot100_60s_v1.js --years=1960
 * Full decade:
 *   node Scripts/ingest_wikipedia_yearend_hot100_60s_v1.js --years=1960-1969
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_TOP100 = path.join(ROOT, "Data", "top100_billboard_yearend_1960s_v1.json");
const OUT_TOP10 = path.join(ROOT, "Data", "top10_by_year_v1.json");

const SOURCE = "Wikipedia (MediaWiki API) — Billboard Year-End Hot 100 singles";
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

function parseArgsYears() {
  const arg = process.argv.find((a) => a.startsWith("--years="));
  if (!arg) return [1960]; // validate-first default

  const raw = arg.split("=", 2)[1] || "";
  const t = raw.trim();
  if (!t) return [1960];

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

  const parts = t
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n));
  return parts.length ? parts : [1960];
}

function pageTitle(year) {
  return `Billboard_Year-End_Hot_100_singles_of_${year}`;
}

function pageUrl(year) {
  return `https://en.wikipedia.org/wiki/${pageTitle(year)}`;
}

async function fetchWikiText(year) {
  // MediaWiki API: parse page and return wikitext
  const title = pageTitle(year);
  const api =
    "https://en.wikipedia.org/w/api.php" +
    `?action=parse&format=json&prop=wikitext&origin=*` +
    `&page=${encodeURIComponent(title)}`;

  const r = await fetch(api, {
    headers: {
      "User-Agent": "SandblastBot/1.0 (year-end parser; contact: none)",
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  const j = await r.json().catch(() => null);
  if (!r.ok || !j) return { ok: false, status: r.status, error: "BAD_RESPONSE" };

  if (j.error) {
    return {
      ok: false,
      status: 400,
      error: cleanText(j.error.info || j.error.code || "API_ERROR"),
    };
  }

  const wt = j?.parse?.wikitext?.["*"];
  if (!wt) return { ok: false, status: 200, error: "NO_WIKITEXT" };

  return { ok: true, status: 200, wikitext: String(wt) };
}

function extractWikitableBlocks(wikitext) {
  // capture blocks starting with "{| class="wikitable"..."
  const text = String(wikitext || "");
  const blocks = [];
  const rx = /\{\|\s*class="wikitable[\s\S]*?\n\|\}/g;
  let m;
  while ((m = rx.exec(text))) blocks.push(m[0]);
  return blocks;
}

function scoreWikitableBlock(block) {
  const t = String(block || "").toLowerCase();
  let s = 0;
  if (t.includes("rank")) s += 2;
  if (t.includes("title")) s += 2;
  if (t.includes("artist")) s += 2;
  if (t.includes("no.") || t.includes("no")) s += 1;

  // more rows → likely the main table
  const rowCount = (block.match(/\n\|-\s*\n/g) || []).length;
  if (rowCount >= 80) s += 3;
  if (rowCount >= 100) s += 2;
  return s;
}

function pickBestWikitable(wikitext) {
  const blocks = extractWikitableBlocks(wikitext);
  if (!blocks.length) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const b of blocks) {
    const s = scoreWikitableBlock(b);
    if (s > bestScore) {
      best = b;
      bestScore = s;
    }
  }
  return best;
}

function stripWikiMarkup(s) {
  let t = String(s || "");

  // remove references
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, " ");
  t = t.replace(/<ref[^\/]*\/>/g, " ");

  // convert [[Link|Text]] -> Text ; [[Text]] -> Text
  t = t.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2");
  t = t.replace(/\[\[([^\]]+)\]\]/g, "$1");

  // remove templates {{...}} (best effort)
  for (let i = 0; i < 4; i++) {
    t = t.replace(/\{\{[^{}]*\}\}/g, " ");
  }

  // remove italics/bold markup
  t = t.replace(/''+/g, "");

  // remove HTML tags
  t = t.replace(/<[^>]+>/g, " ");

  // cleanup
  t = t.replace(/&nbsp;/g, " ");
  t = t.replace(/\s+/g, " ");

  return cleanText(t);
}

/**
 * FIXED: Wikipedia wikitables often use MULTI-LINE rows:
 *   |-
 *   | 1
 *   | ''Song''
 *   | [[Artist]]
 *
 * So we must parse rows as blocks between "|-" markers.
 */
function parseWikitableToRows(year, wikitableBlock) {
  const lines = String(wikitableBlock || "").split("\n");

  // Identify header row
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("!")) {
      headerIdx = i;
      break;
    }
  }

  const headerLine = headerIdx >= 0 ? lines[headerIdx] : "";
  const headers = headerLine
    .split("!!")
    .map((h) => stripWikiMarkup(h.replace(/^!+/, "")))
    .map((h) => h.toLowerCase());

  const idxRank = headers.findIndex((h) => h.includes("rank") || h.includes("no"));
  const idxTitle = headers.findIndex((h) => h.includes("title") || h.includes("single"));
  const idxArtist = headers.findIndex((h) => h.includes("artist"));

  // fallback: common 3-col layout
  const colRank = idxRank >= 0 ? idxRank : 0;
  const colTitle = idxTitle >= 0 ? idxTitle : 1;
  const colArtist = idxArtist >= 0 ? idxArtist : 2;

  // Collect row blocks
  const rowBlocks = [];
  let current = [];

  for (const line of lines) {
    const t = line.trim();

    if (t.startsWith("|-")) {
      if (current.length) rowBlocks.push(current);
      current = [];
      continue;
    }

    if (t.startsWith("|}")) {
      if (current.length) rowBlocks.push(current);
      break;
    }

    if (t.startsWith("|")) {
      // strip leading pipe so content is clean
      current.push(t.replace(/^\|\s*/, ""));
    }
  }

  const rows = [];

  for (const block of rowBlocks) {
    if (!block || block.length < 3) continue;

    // Most multi-line rows: each entry is a cell (Rank, Title, Artist)
    // Sometimes single-line rows use "||" separators; handle both.
    let cells = [];
    if (block.length === 1 && block[0].includes("||")) {
      cells = block[0].split("||").map((c) => stripWikiMarkup(c));
    } else {
      cells = block.map((c) => stripWikiMarkup(c));
    }

    const rankRaw = String(cells[colRank] || "");
    const rank = Number(rankRaw.replace(/[^\d]/g, ""));
    if (!Number.isFinite(rank) || rank < 1 || rank > 100) continue;

    const title = cleanText(cells[colTitle] || "");
    const artist = cleanText(cells[colArtist] || "");
    if (!title || !artist) continue;

    rows.push({
      year,
      rank,
      title,
      artist,
      source: SOURCE,
      chart: CHART,
      url: pageUrl(year),
    });
  }

  // Deduplicate by (year, rank)
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = `${r.year}:${r.rank}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }

  out.sort((a, b) => a.rank - b.rank);
  return out;
}

/**
 * Build Top 10 map from flat rows.
 * Output shape:
 * {
 *   version, chart, source, generatedAt,
 *   meta: { inputFile, outputFile, strict, validatedRows, yearsBuilt, yearsWithComplete10 },
 *   years: { "1960": { year, chart, items:[{pos,artist,title}...] } }
 * }
 */
function buildTop10ByYear(allRows) {
  const byYear = new Map();
  for (const r of allRows) {
    const y = Number(r.year);
    if (!Number.isFinite(y)) continue;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(r);
  }

  const yearsOut = {};
  let yearsBuilt = 0;
  let yearsWithComplete10 = 0;

  const years = [...byYear.keys()].sort((a, b) => a - b);
  for (const y of years) {
    const rows = byYear.get(y).slice().sort((a, b) => a.rank - b.rank);
    const top10 = rows.filter((x) => x.rank >= 1 && x.rank <= 10).slice(0, 10);

    yearsOut[String(y)] = {
      year: y,
      chart: CHART,
      items: top10.map((x) => ({
        pos: x.rank,
        artist: x.artist,
        title: x.title,
      })),
    };

    yearsBuilt += 1;
    if (top10.length === 10) yearsWithComplete10 += 1;
  }

  return { yearsOut, yearsBuilt, yearsWithComplete10 };
}

async function main() {
  if (typeof fetch !== "function") {
    console.error("ERROR: fetch() not available in this Node runtime.");
    process.exit(1);
  }

  ensureDir(path.join(ROOT, "Data"));

  const years = parseArgsYears();
  console.log("Years:", years.join(", "));
  console.log("Chart:", CHART);
  console.log("Source:", SOURCE);
  console.log("");

  const all = [];

  for (const year of years) {
    const y = Number(year);
    if (!Number.isFinite(y)) continue;

    console.log(`[${y}] Fetching: ${pageUrl(y)}`);
    const got = await fetchWikiText(y);

    if (!got.ok) {
      console.log(`[${y}] ERROR: ${got.error || "FETCH_FAILED"} (status=${got.status})`);
      continue;
    }

    const table = pickBestWikitable(got.wikitext);
    if (!table) {
      console.log(`[${y}] ERROR: no wikitable found in wikitext.`);
      continue;
    }

    const rows = parseWikitableToRows(y, table);
    const top10Count = rows.filter((r) => r.rank >= 1 && r.rank <= 10).length;

    console.log(`[${y}] Parsed rows: ${rows.length} | Top10 rows: ${top10Count}`);

    if (rows.length < 50) {
      console.log(
        `[${y}] WARNING: low row count (${rows.length}). The table selection/parsing may be off.`
      );
    }

    if (top10Count !== 10) {
      console.log(
        `[${y}] WARNING: Top10 incomplete (${top10Count}/10). Validate before expanding years.`
      );
    } else {
      console.log(`[${y}] PASS: Top10 complete (10/10).`);
    }

    rows.forEach((r) => all.push(r));
    console.log("");
  }

  // Write Top100 flat output
  fs.writeFileSync(OUT_TOP100, JSON.stringify(all, null, 2), "utf8");
  console.log("Wrote:", OUT_TOP100);
  console.log("Total rows:", all.length);

  // Build + write Top10 map output
  const built = buildTop10ByYear(all);
  const payload = {
    version: "top10_by_year_v1",
    chart: CHART,
    source: "top100_billboard_yearend_1960s_v1.json (generated from MediaWiki API)",
    generatedAt: new Date().toISOString(),
    meta: {
      inputFile: path.relative(ROOT, OUT_TOP100).replace(/\\/g, "/"),
      outputFile: path.relative(ROOT, OUT_TOP10).replace(/\\/g, "/"),
      strict: true,
      validatedRows: all.length,
      yearsBuilt: built.yearsBuilt,
      yearsWithComplete10: built.yearsWithComplete10,
    },
    years: built.yearsOut,
  };

  fs.writeFileSync(OUT_TOP10, JSON.stringify(payload, null, 2), "utf8");
  console.log("Wrote:", OUT_TOP10);

  if (built.yearsBuilt === 0) {
    console.log("\nWARNING: No Top10 years built (no parsed data).");
  } else {
    const incomplete = Object.keys(payload.years).filter(
      (k) => (payload.years[k]?.items || []).length !== 10
    );
    if (incomplete.length) {
      console.log(
        `\nWARNING: Incomplete Top10 years: ${incomplete.join(", ")} (fix before adding more).`
      );
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
