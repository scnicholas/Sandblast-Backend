/* Scripts/build_billboard_yearend_hot100_1960_1969.js
   Builds:
     Data/wikipedia/billboard_yearend_hot100_1960_1969.json

   Wikipedia pages follow:
     https://en.wikipedia.org/wiki/Billboard_Year-End_Hot_100_singles_of_YYYY

   Requirements:
     - Node.js 18+ (for global fetch)
*/

"use strict";

const fs = require("fs");
const path = require("path");

const OUT_FILE = path.resolve(
  process.cwd(),
  "Data/wikipedia/billboard_yearend_hot100_1960_1969.json"
);

const BASE_PAGE =
  "https://en.wikipedia.org/wiki/Billboard_Year-End_Hot_100_singles_of_";

function decodeHtml(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html) {
  return decodeHtml(
    String(html || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<sup[^>]*>.*?<\/sup>/gis, "") // footnotes
      .replace(/<style[^>]*>.*?<\/style>/gis, "")
      .replace(/<script[^>]*>.*?<\/script>/gis, "")
      .replace(/<\/?[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function toIntLoose(x) {
  const s = String(x ?? "").trim();
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : null;
}

// Extract all wikitable HTML blocks
function extractWikitables(html) {
  const out = [];
  const re =
    /<table[^>]*class="[^"]*\bwikitable\b[^"]*"[^>]*>[\s\S]*?<\/table>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[0]);
  return out;
}

function extractRowsFromTable(tableHtml) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(tableHtml))) {
    const tr = m[1];
    const cellRe = /<(td|th)[^>]*>([\s\S]*?)<\/(td|th)>/gi;
    const cells = [];
    let c;
    while ((c = cellRe.exec(tr))) {
      cells.push(stripTags(c[2]));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function normHeader(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findHeaderIndex(headers, candidates) {
  const H = headers.map(normHeader);
  for (const cand of candidates) {
    const c = normHeader(cand);
    const idx = H.findIndex((h) => h === c || h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

function pickBestTable(allTables) {
  // Choose a wikitable whose header has rank/no + title + artist
  for (const tbl of allTables) {
    const rows = extractRowsFromTable(tbl);
    if (!rows.length) continue;

    const header = rows[0];

    const rankIdx = findHeaderIndex(header, [
      "no.",
      "no",
      "#",
      "rank",
      "position",
      "pos",
    ]);
    const titleIdx = findHeaderIndex(header, ["title"]);
    const artistIdx = findHeaderIndex(header, ["artist"]);

    if (rankIdx >= 0 && titleIdx >= 0 && artistIdx >= 0) {
      return { tbl, rankIdx, titleIdx, artistIdx };
    }
  }

  // Fallback heuristic: sometimes header labels differ; pick the table with 3+ cols and most rows
  let best = null;
  for (const tbl of allTables) {
    const rows = extractRowsFromTable(tbl);
    if (rows.length < 10) continue;
    const cols = rows[0]?.length || 0;
    if (cols < 3) continue;
    if (!best || rows.length > best.rows.length) best = { tbl, rows };
  }
  if (best) {
    // attempt to infer indices in fallback
    const header = best.rows[0];
    const rankIdx = findHeaderIndex(header, ["no.", "no", "#", "rank", "position", "pos"]);
    const titleIdx = findHeaderIndex(header, ["title"]);
    const artistIdx = findHeaderIndex(header, ["artist"]);
    return {
      tbl: best.tbl,
      rankIdx: rankIdx >= 0 ? rankIdx : 0,
      titleIdx: titleIdx >= 0 ? titleIdx : 1,
      artistIdx: artistIdx >= 0 ? artistIdx : 2,
    };
  }

  return null;
}

async function fetchHtml(url) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Sandblast/1.0 (Nyx data builder)",
      "Accept": "text/html",
    },
  });
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
  return resp.text();
}

async function buildYear(year) {
  const url = `${BASE_PAGE}${year}`;
  const html = await fetchHtml(url);

  const tables = extractWikitables(html);
  if (!tables.length) return { year, ok: false, error: "NO_WIKITABLES", url };

  const best = pickBestTable(tables);
  if (!best) return { year, ok: false, error: "NO_MATCHING_TABLE", url };

  const rows = extractRowsFromTable(best.tbl);
  if (rows.length < 2) return { year, ok: false, error: "NO_ROWS", url };

  const dataRows = rows.slice(1);
  const out = [];

  for (const r of dataRows) {
    const rank = toIntLoose(r[best.rankIdx]);
    const title = String(r[best.titleIdx] || "").trim();
    const artist = String(r[best.artistIdx] || "").trim();
    if (!rank || !title || !artist) continue;

    out.push({
      year,
      rank,
      title,
      artist,
      chart: "Billboard Year-End Hot 100",
      source: url,
    });
  }

  out.sort((a, b) => a.rank - b.rank);

  // Sanity threshold (most years should be ~100)
  if (out.length < 80) {
    return {
      year,
      ok: false,
      error: `TOO_FEW_ROWS(${out.length})`,
      url,
      rows: out.length,
    };
  }

  return { year, ok: true, url, rows: out };
}

async function main() {
  const allRows = [];
  const failures = [];

  for (let y = 1960; y <= 1969; y++) {
    process.stdout.write(`Fetching ${y}... `);
    try {
      const res = await buildYear(y);
      if (!res.ok) {
        console.log(`FAIL: ${res.error}`);
        failures.push(res);
        continue;
      }
      console.log(`OK (${res.rows.length})`);
      allRows.push(...res.rows);
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
      failures.push({ year: y, ok: false, error: e.message });
    }
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  const payload = {
    ok: failures.length === 0,
    chart: "Billboard Year-End Hot 100",
    range: { start: 1960, end: 1969 },
    rows: allRows,
    failures,
    builtAt: new Date().toISOString(),
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), "utf8");

  console.log("\n=== BUILD COMPLETE ===");
  console.log("Output:", OUT_FILE);
  console.log("Total rows:", allRows.length);
  console.log("Failures:", failures.length);
  if (failures.length) {
    console.log("Failure details:");
    for (const f of failures) console.log(JSON.stringify(f));
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
