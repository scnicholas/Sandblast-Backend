"use strict";

/**
 * scrape_top40weekly_year_pages.js — URL-Resilient v1.3
 *
 * Fixes your current failure mode:
 * - Top40Weekly returns 404 pages with full HTML => your scraper downloads "something" but it's a WP 404 template.
 * - This script detects 404 templates AND tests alternative slugs automatically.
 * - It will NOT overwrite an existing year JSON with [] if it fails.
 *
 * Usage:
 *   node Scripts/scrape_top40weekly_year_pages.js Data/top40weekly/top100_1994.json 1994
 *   node Scripts/scrape_top40weekly_year_pages.js Data/top40weekly/top100_1990.json 1990
 *
 * Optional:
 *   SCRAPE_DELAY_MS=900
 */

const fs = require("fs");
const path = require("path");

const BASE = "https://top40weekly.com/";

async function fetchText(url, tries = 3) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Referer: BASE,
        },
      });
      const text = await res.text();
      return { status: res.status, text, url };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 900 + i * 700));
    }
  }
  throw lastErr;
}

function htmlDecode(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8220;|&ldquo;/g, "“")
    .replace(/&#8221;|&rdquo;/g, "”");
}

function stripTags(s) {
  return htmlDecode(String(s || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEntryContent(html) {
  const m =
    html.match(/<div[^>]+class="[^"]*\bentry-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  return m ? m[1] : html;
}

function toLines(html) {
  const h = String(html || "")
    .replace(/\r/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h\d>/gi, "\n");

  const text = htmlDecode(h.replace(/<[^>]*>/g, " "));
  return text
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function is404Template(status, html) {
  if (status === 404) return true;

  const t = stripTags(html).toLowerCase();
  // Common WP 404 markers
  if (t.includes("page not found")) return true;
  if (t.includes("oops! that page can’t be found")) return true;
  if (t.includes("nothing was found at this location")) return true;
  if (t.includes("404")) {
    // weak signal; only treat as 404 if also no rank tokens
    const ranks = (t.match(/\b\d{1,3}[\.\)]\s+/g) || []).length;
    if (ranks < 10) return true;
  }
  return false;
}

function rankTokenCount(html) {
  const t = stripTags(html);
  const ranks = (t.match(/\b\d{1,3}[\.\)]\s+/g) || []).length;
  return ranks;
}

function looksLikeTitle(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  if (t.length < 2 || t.length > 200) return false;
  if (/^https?:\/\//i.test(t)) return false;
  return true;
}

function looksLikeArtist(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  if (t.length < 2 || t.length > 200) return false;
  return true;
}

function stripLeadingRankLoose(s) {
  return String(s || "")
    .replace(/^\s*\(?\s*\d{1,3}\s*[\.\)\-–:]\s*/g, "")
    .replace(/^\s*\d{1,3}\s+/, "")
    .trim();
}

function normalizeDash(s) {
  return String(s || "")
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .trim();
}

function parseRankedPairsFromLines(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = String(lines[i] || "").trim();
    if (!raw) continue;

    const mInline = raw.match(/^(\d{1,3})\s*[\.\)\-–:]\s*(.+)$/);
    if (!mInline) continue;

    const rank = Number(mInline[1]);
    if (!(rank >= 1 && rank <= 100)) continue;

    const rest0 = String(mInline[2] || "").trim();
    const rest = normalizeDash(stripLeadingRankLoose(rest0));

    let mm =
      rest.match(/^(.+?)\s+(?:by)\s+(.+)$/i) ||
      rest.match(/^(.+?)\s*-\s*(.+)$/);

    if (mm) {
      const title = String(mm[1] || "").trim();
      const artist = String(mm[2] || "").trim();
      if (looksLikeTitle(title) && looksLikeArtist(artist)) {
        out.push({ rank, title, artist });
        continue;
      }
    }

    // Two-line: "rank. title" then next line artist
    const title = rest0.trim();
    if (!looksLikeTitle(title)) continue;

    let artist = "";
    for (let j = i + 1; j <= i + 4 && j < lines.length; j++) {
      const cand = String(lines[j] || "").trim();
      if (!cand) continue;
      if (/^\(?\s*\d{1,3}\s*[\.\)\-–:]/.test(cand)) break;
      artist = stripLeadingRankLoose(cand);
      if (looksLikeArtist(artist)) {
        i = j;
        break;
      } else {
        artist = "";
      }
    }
    if (artist) out.push({ rank, title, artist });
  }

  const byRank = new Map();
  for (const x of out) if (!byRank.has(x.rank)) byRank.set(x.rank, x);
  return [...byRank.values()].sort((a, b) => a.rank - b.rank);
}

function buildRows(year, rankedPairs) {
  const rows = rankedPairs
    .filter((p) => p.rank >= 1 && p.rank <= 100 && looksLikeTitle(p.title) && looksLikeArtist(p.artist))
    .slice(0, 100)
    .map((p) => ({
      year,
      rank: p.rank,
      artist: String(p.artist).trim(),
      title: String(p.title).trim(),
      chart: "Top40Weekly Top 100",
    }));

  return rows;
}

function candidateUrlsForYear(year) {
  // Try common slug patterns — Top40Weekly has changed these over time.
  const y = String(year);

  const slugs = [
    `top-100-songs-of-${y}/`,
    `top-100-songs-${y}/`,
    `top-100-songs-in-${y}/`,
    `top-100-songs-from-${y}/`,
    `top-100-songs-${y}-2/`,
    `top100-songs-of-${y}/`,
    `top100-songs-${y}/`,
  ];

  return slugs.map((s) => BASE + s);
}

async function findWorkingYearPage(year) {
  const urls = candidateUrlsForYear(year);

  let best = null;

  for (const u of urls) {
    const r = await fetchText(u);
    const is404 = is404Template(r.status, r.text);
    const rankTokens = rankTokenCount(r.text);

    console.error("[TRY]", year, r.status, "rankTokens=", rankTokens, u);

    if (!is404 && rankTokens >= 40) {
      // likely a real Top100 page
      best = { ...r, rankTokens };
      break;
    }

    // keep the "least-bad" candidate for debug
    if (!best || rankTokens > (best.rankTokens || 0)) best = { ...r, rankTokens };
    await new Promise((x) => setTimeout(x, 250));
  }

  return best;
}

function safeWriteJson(absOut, rows) {
  // Do NOT overwrite with empty
  if (!rows || rows.length === 0) {
    console.error("[ABORT] Refusing to overwrite output with empty array:", absOut);
    return false;
  }
  fs.writeFileSync(absOut, JSON.stringify(rows, null, 2) + "\n", "utf8");
  return true;
}

(async function main() {
  const outPath = process.argv[2];
  const yearArg = process.argv[3];

  if (!outPath || !yearArg) {
    console.error("Usage: node Scripts/scrape_top40weekly_year_pages.js <out.json> <year>");
    process.exit(1);
  }

  const year = Number(yearArg);
  if (!Number.isFinite(year) || year < 1900 || year > 2100) {
    console.error("Invalid year:", yearArg);
    process.exit(1);
  }

  const absOut = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });

  console.error("[YEAR]", year);
  const r = await findWorkingYearPage(year);

  // Debug write of the best HTML we found (even if 404)
  const dbgHtml = `./Data/_debug_top40weekly_${year}_best.html`;
  fs.writeFileSync(dbgHtml, r.text, "utf8");
  console.error("[DBG] wrote", dbgHtml);

  if (is404Template(r.status, r.text) || r.rankTokens < 40) {
    console.error("[FAIL]", year, "No valid Top100 page found. Best status=", r.status, "rankTokens=", r.rankTokens);
    process.exit(2);
  }

  const entry = extractEntryContent(r.text);
  const lines = toLines(entry);
  const ranked = parseRankedPairsFromLines(lines);
  const rows = buildRows(year, ranked);

  console.error("[PARSE]", year, "ranked=", ranked.length, "rows=", rows.length, "url=", r.url);

  if (rows.length < 80) {
    const dbgLines = `./Data/_debug_top40weekly_${year}_lines.txt`;
    fs.writeFileSync(dbgLines, lines.slice(0, 2000).join("\n") + "\n", "utf8");
    console.error("[WARN]", year, "low rows; wrote lines debug:", dbgLines);
  }

  const ok = safeWriteJson(absOut, rows);
  if (!ok) process.exit(3);

  console.error("[DONE] wrote", rows.length, "to", absOut);
})().catch((e) => {
  console.error("[ERR]", e && e.stack ? e.stack : e);
  process.exit(1);
});
