"use strict";

/**
 * build_top40weekly_top100.js — Year-End Top 100 Builder (from weekly Top 40 pages)
 *
 * Why this exists:
 * - Year pages like https://top40weekly.com/1994-all-charts/ are NOT a ranked 1–100 list.
 * - They are link hubs to weekly Top 40 pages.
 * - We compute a year-end Top 100 via points from weekly ranks.
 *
 * Points model (simple + stable):
 * - Rank 1 => 40 pts, Rank 2 => 39 pts, ... Rank 40 => 1 pt
 * - Sum points across all weekly charts in that year
 *
 * Output:
 * - JSON array of 100 rows:
 *   { year, rank, title, artist, points, weeks, chart:"Top40Weekly Top 100", source:"Top40Weekly weekly charts" }
 *
 * Usage:
 *   node Scripts/build_top40weekly_top100.js 1994 Data/top40weekly/top100_1994.json
 *
 * Optional env:
 *   T40W_DELAY_MS=250          // politeness delay between requests
 *   T40W_MAX_WEEKS=0           // 0 = no cap, else limit number of weekly pages fetched
 */

const fs = require("fs");
const path = require("path");

const BASE = "https://top40weekly.com/";
const DELAY_MS = Math.max(0, Number(process.env.T40W_DELAY_MS || "250") || 250);
const MAX_WEEKS = Math.max(0, Number(process.env.T40W_MAX_WEEKS || "0") || 0);

async function sleep(ms) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url, tries = 3) {
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
    .replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&#038;/g, "&");
}

function stripTags(s) {
  return htmlDecode(String(s || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isWp404(status, html) {
  if (status === 404) return true;
  const bodyClass = (String(html).match(/<body[^>]*class="([^"]*)"/i) || [])[1] || "";
  if (bodyClass.toLowerCase().includes("error404")) return true;

  const t = stripTags(html).toLowerCase();
  if (t.includes("page not found")) return true;
  if (t.includes("oops! that page can’t be found") || t.includes("oops! that page can't be found")) return true;
  return false;
}

/**
 * Year hub: extract weekly page links.
 * Example weekly pages:
 *  https://top40weekly.com/us-top-40-singles-for-the-week-ending-september-10-1994/
 */
function extractWeeklyLinksFromYearHub(html, year) {
  const links = [];
  const re = /href="(https?:\/\/top40weekly\.com\/[^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const url = m[1];
    if (!url.includes("us-top-40-singles-for-the-week-ending")) continue;
    if (!url.includes(String(year))) continue;
    links.push(url);
  }

  // de-dupe, stable
  return Array.from(new Set(links));
}

/**
 * Weekly page parsing:
 * We parse lines like:
 * "1 1 I’LL MAKE LOVE TO YOU –•– Boyz II Men – 5 (1)"
 * from the content. :contentReference[oaicite:3]{index=3}
 */
function parseWeeklyTop40(html) {
  const text = stripTags(html)
    // normalize separators to make regex easier
    .replace(/[–—]/g, "-")
    .replace(/-•-/g, "-")
    .replace(/\s+/g, " ");

  const out = [];
  // Pattern: TW LW TITLE - Artist - Weeks (Peak)
  // We only need TW (this week rank), title, artist
  const re = /\b(\d{1,2})\s+(\d{1,2})\s+(.+?)\s+-\s+(.+?)\s+-\s+(\d+)\s*\((\d+)\)/g;

  let m;
  while ((m = re.exec(text))) {
    const tw = Number(m[1]);
    const title = String(m[3] || "").trim();
    const artist = String(m[4] || "").trim();
    if (!(tw >= 1 && tw <= 40)) continue;
    if (!title || !artist) continue;

    out.push({ tw, title, artist });
  }

  // De-dupe per week by TW rank
  const byRank = new Map();
  for (const r of out) if (!byRank.has(r.tw)) byRank.set(r.tw, r);

  return Array.from(byRank.values()).sort((a, b) => a.tw - b.tw);
}

function keySong(title, artist) {
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return `${norm(title)}|${norm(artist)}`;
}

function safeWriteJson(absOut, rows) {
  if (!rows || rows.length === 0) {
    console.error("[ABORT] Refusing to write empty output:", absOut);
    return false;
  }
  fs.writeFileSync(absOut, JSON.stringify(rows, null, 2) + "\n", "utf8");
  return true;
}

async function main() {
  const yearArg = process.argv[2];
  const outPath = process.argv[3];

  if (!yearArg || !outPath) {
    console.error("Usage: node Scripts/build_top40weekly_top100.js <year> <out.json>");
    process.exit(1);
  }

  const year = Number(yearArg);
  if (!Number.isFinite(year) || year < 1950 || year > 2100) {
    console.error("Invalid year:", yearArg);
    process.exit(1);
  }

  const absOut = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });

  const hubUrl = `${BASE}${year}-all-charts/`;
  console.error("[HUB]", hubUrl);

  const hub = await fetchHtml(hubUrl);
  fs.writeFileSync(`./Data/_debug_t40w_${year}_hub.html`, hub.text, "utf8");

  if (isWp404(hub.status, hub.text)) {
    console.error("[FAIL] Year hub 404:", hubUrl, "status=", hub.status);
    process.exit(2);
  }

  const weeklyLinks = extractWeeklyLinksFromYearHub(hub.text, year);
  console.error("[WEEKS] found", weeklyLinks.length, "weekly pages");

  if (!weeklyLinks.length) {
    console.error("[FAIL] No weekly links found on hub. Check hub HTML debug.");
    process.exit(3);
  }

  const cap = MAX_WEEKS > 0 ? Math.min(MAX_WEEKS, weeklyLinks.length) : weeklyLinks.length;
  const linksToFetch = weeklyLinks.slice(0, cap);

  // Aggregate
  const agg = new Map(); // key -> { title, artist, points, weeks }
  let parsedWeeks = 0;

  for (let i = 0; i < linksToFetch.length; i++) {
    const url = linksToFetch[i];
    const r = await fetchHtml(url);
    await sleep(DELAY_MS);

    if (isWp404(r.status, r.text)) {
      console.error("[SKIP] 404 weekly:", url);
      continue;
    }

    const weekRows = parseWeeklyTop40(r.text);
    if (weekRows.length < 20) {
      // write a debug snapshot for the first few bad weeks
      if (parsedWeeks < 2) {
        fs.writeFileSync(`./Data/_debug_t40w_${year}_week_${parsedWeeks + 1}.html`, r.text, "utf8");
      }
      console.error("[WARN] low parse rows", weekRows.length, "url=", url);
      continue;
    }

    parsedWeeks++;

    for (const row of weekRows) {
      const pts = 41 - row.tw; // 40..1
      const k = keySong(row.title, row.artist);
      const cur = agg.get(k) || { title: row.title, artist: row.artist, points: 0, weeks: 0 };
      cur.points += pts;
      cur.weeks += 1;
      agg.set(k, cur);
    }

    if (parsedWeeks % 10 === 0) {
      console.error("[PROGRESS] weeks parsed:", parsedWeeks, "/", cap, "songs tracked:", agg.size);
    }
  }

  console.error("[DONE] weeks parsed:", parsedWeeks, "songs tracked:", agg.size);

  // Build Top 100
  const top = Array.from(agg.values())
    .sort((a, b) => b.points - a.points || b.weeks - a.weeks || a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title))
    .slice(0, 100)
    .map((s, idx) => ({
      year,
      rank: idx + 1,
      title: s.title,
      artist: s.artist,
      points: s.points,
      weeks: s.weeks,
      chart: "Top40Weekly Top 100",
      source: "Top40Weekly weekly charts (computed)",
    }));

  // Safety: refuse to overwrite with empty
  const ok = safeWriteJson(absOut, top);
  if (!ok) process.exit(4);

  console.error("[WRITE]", absOut, "rows=", top.length);
}

main().catch((e) => {
  console.error("[ERR]", e && e.stack ? e.stack : e);
  process.exit(1);
});
