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

function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|tr|td)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function cleanText(s) {
  return decodeHtmlEntities(s)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function findSection(html, year) {
  const id = `${year}-topsongslist`;
  const idx = html.indexOf(`id="${id}"`);
  if (idx < 0) return null;

  const nextYear = YEARS.find((y) => y > year);
  if (!nextYear) return html.slice(idx);

  const nextId = `id="${nextYear}-topsongslist"`;
  const nextIdx = html.indexOf(nextId, idx + 1);
  return nextIdx > idx ? html.slice(idx, nextIdx) : html.slice(idx);
}

function parseRankLines(sectionText) {
  const lines = sectionText.split("\n").map((l) => l.trim()).filter(Boolean);
  const out = [];

  for (const line of lines) {
    // match: "1. TITLE by ARTIST"
    const m = line.match(/^(\d{1,3})\.\s+(.+?)\s+by\s+(.+)$/i);
    if (!m) continue;

    const rank = Number(m[1]);
    const title = String(m[2] || "").trim();
    const artist = String(m[3] || "").trim();

    if (!Number.isFinite(rank) || rank < 1 || rank > 100) continue;
    if (!title || !artist) continue;

    out.push({ rank, title, artist });
  }

  // de-dupe by rank
  const byRank = new Map();
  for (const r of out) if (!byRank.has(r.rank)) byRank.set(r.rank, r);
  return Array.from(byRank.values()).sort((a, b) => a.rank - b.rank);
}

(async function main() {
  if (typeof fetch !== "function") {
    console.error("This script requires Node 18+ (fetch).");
    process.exit(1);
  }

  console.log(`[build_top40weekly_1990s] Fetching: ${SOURCE_URL}`);
  const resp = await fetch(SOURCE_URL, { redirect: "follow" });

  if (!resp.ok) {
    console.error(`[build_top40weekly_1990s] HTTP ${resp.status} ${resp.statusText}`);
    process.exit(1);
  }

  const html = await resp.text();
  ensureDir(OUT_DIR);

  let total = 0;

  for (const year of YEARS) {
    const sectionHtml = findSection(html, year);
    if (!sectionHtml) {
      console.warn(`[build_top40weekly_1990s] WARNING: section not found for ${year}`);
      continue;
    }

    const text = cleanText(stripTags(sectionHtml));
    const rows = parseRankLines(text);

    console.log(`[build_top40weekly_1990s] ${year}: parsed ${rows.length} rows`);

    const payload = rows.map((r) => ({
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
  console.log(`[build_top40weekly_1990s] Output: ${OUT_DIR}`);
})().catch((e) => {
  console.error(`[build_top40weekly_1990s] ERROR: ${String(e?.message || e)}`);
  process.exit(1);
});
