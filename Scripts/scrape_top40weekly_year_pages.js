"use strict";

/**
 * scrape_top40weekly_year_pages.js — URL-Resilient v1.4
 *
 * Fixes your current failure mode:
 * - Top40Weekly can return WP 404 templates with full HTML (even when fetch returns content).
 * - This script detects 404 templates AND tests alternative slugs automatically.
 * - It will NOT overwrite an existing year JSON with [] if it fails.
 *
 * Usage:
 *   node Scripts/scrape_top40weekly_year_pages.js Data/top40weekly/top100_1994.json 1994
 *
 * Optional env:
 *   SCRAPE_DELAY_MS=900
 */

const fs = require("fs");
const path = require("path");

const BASE = "https://top40weekly.com/";
const SCRAPE_DELAY_MS = Math.max(0, Number(process.env.SCRAPE_DELAY_MS || "250") || 250);

async function sleep(ms) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

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
      await sleep(900 + i * 700);
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
    html.match(/<div[^>]+class="[^"]*\bthe_content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
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

function hasWp404BodyClass(html) {
  const m = String(html || "").match(/<body[^>]*class="([^"]*)"/i);
  if (!m) return false;
  const cls = String(m[1] || "").toLowerCase();
  return cls.includes("error404") || cls.includes("404");
}

function is404Template(status, html) {
  if (status === 404) return true;

  if (hasWp404BodyClass(html)) return true;

  const t = stripTags(html).toLowerCase();

  // Common WP 404 markers
  if (t.includes("page not found")) return true;
  if (t.includes("oops! that page can’t be found")) return true;
  if (t.includes("oops! that page can't be found")) return true;
  if (t.includes("nothing was found at this location")) return true;

  // Sometimes WP serves a “soft 404” with status 200
  // We treat “404” as a weak signal unless list tokens are absent.
  if (t.includes("404")) {
    const ranks = (t.match(/\b\d{1,3}[\.\)]\s+/g) || []).length;
    if (ranks < 10) return true;
  }

  return false;
}

function rankTokenCount(html) {
  const t = stripTags(html);
  // Token patterns we’ll accept as “this page is a ranked list”
  const a = (t.match(/\b\d{1,3}[\.\)]\s+/g) || []).length; // "12. "
  const b = (t.match(/\b\d{1,3}\s*-\s+/g) || []).length;   // "12 - "
  const c = (t.match(/\bno\.\s*\d{1,3}\b/gi) || []).length; // "No. 12"
  return a + b + c;
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
  return rankedPairs
    .filter(
      (p) =>
        p.rank >= 1 &&
        p.rank <= 100 &&
        looksLikeTitle(p.title) &&
        looksLikeArtist(p.artist)
    )
    .slice(0, 100)
    .map((p) => ({
      year,
      rank: p.rank,
      artist: String(p.artist).trim(),
      title: String(p.title).trim(),
      chart: "Top40Weekly Top 100",
    }));
}

function candidateUrlsForYear(year) {
  const y = String(year);

  // Top40Weekly has changed slug formats over time.
  // Add broader coverage (including all-charts style pages).
  const slugs = [
    // Common historical patterns
    `top-100-songs-of-${y}/`,
    `top-100-songs-${y}/`,
    `top-100-songs-in-${y}/`,
    `top-100-songs-from-${y}/`,
    `top-100-songs-${y}-2/`,
    `top100-songs-of-${y}/`,
    `top100-songs-${y}/`,

    // Variants seen on some WP sites / older posts
    `top-songs-of-${y}/`,
    `top-songs-${y}/`,
    `top-songs-${y}-2/`,
    `top-songs-in-${y}/`,
    `top-songs-from-${y}/`,

    // “All charts” patterns (your 1994 result strongly suggests a slug shift here)
    `${y}-all-charts-top-100-songs/`,
    `${y}-all-charts-top-100-songs-of-the-year/`,
    `${y}-all-charts-top-100-songs-of-${y}/`,
    `top-100-songs-of-${y}-all-charts/`,
    `top-100-songs-${y}-all-charts/`,
  ];

  // Return absolute URLs
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

    // Accept if: not a 404 template AND has enough list structure
    if (!is404 && rankTokens >= 40) {
      best = { ...r, rankTokens };
      break;
    }

    // keep the least-bad candidate for debug
    if (!best || rankTokens > (best.rankTokens || 0)) best = { ...r, rankTokens };

    await sleep(SCRAPE_DELAY_MS);
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
    console.error(
      "[FAIL]",
      year,
      "No valid Top100 page found. Best status=",
      r.status,
      "rankTokens=",
      r.rankTokens,
      "url=",
      r.url
    );
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
