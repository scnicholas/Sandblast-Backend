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

  const parts = t.split(",").map((x) => Number(x.trim())).filter(Number.isFinite);
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
    return { ok: false, status: 400, error: cleanText(j.error.info || j.error.code || "API_ERROR") };
  }

  const wt = j?.parse?.wikitext?.["*"];
  if (!wt) return { ok: false, status: 200, error: "NO_WIKITEXT" };

  return { ok: true, status: 200, wikitext: String(wt) };
}

function extractWikitableBlocks(wikitext) {
  // crude but effective: capture blocks starting with "{| class="wikitable"..."
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
  // do a few passes to reduce nested templates
  for (let i = 0; i < 4; i++) {
    t = t.replace(/\{\{[^{}]*\}\}/g, " ");
  }

  // remove italics/bold markup
  t = t.replace(/''+/g, "");

  // remove HTML tags
  t = t.replace(/<[^>]+>/g, " ");

  // cleanup separators
  t = t.replace(/&nbsp;/g, " ");
  t = t.replace(/\s+/g, " ");

  return cleanText(t);
}

function parseWikitableToRows(year, wikitableBlock) {
  // Wikipedia table syntax:
  // {| class="wikitable"
  // ! Rank !! Title !! Artist(s)
  // |-
  // | 1 || "Song" || Artist
  // |-
  // ...
  const lines = String(wikitableBlock || "").split("\n");

  // identify header to map columns
  let headerLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("!")) {
      headerLineIdx = i;
      break;
    }
  }

  const headerLine = headerLineIdx >= 0 ? lines[headerLineIdx] : "";
  const headers = headerLine
    .split("!!")
    .map((h) => stripWikiMarkup(h.replace(/^!+/, "")))
    .map((h) => h.toLowerCase());

  const idxRank = headers.findIndex((h) => h.includes("rank") || h.includes("no"));
  const idxTitle = headers.findIndex((h) => h.includes("title") || h.includes("single"));
  const idxArtist = headers.findIndex((h) => h.includes("artist"));

  // fallback: common 3-col layout
  const fallback = {
    idxRank: idxRank >= 0 ? idxRank : 0,
    idxTitle: idxTitle >= 0 ? idxTitle : 1,
    idxArtist: idxArtist >= 0 ? idxArtist : 2,
  };

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln.startsWith("|") || ln.startsWith("|-") || ln.startsWith("|}
