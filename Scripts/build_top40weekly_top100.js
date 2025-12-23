"use strict";

/**
 * build_top40weekly_top100.js — v1.6
 * Builds Top40Weekly year-end Top 100 by computing points from weekly Top 40 posts.
 *
 * Key upgrade:
 * - If the year hub page contains zero weekly links, use WordPress REST API fallback:
 *   https://top40weekly.com/wp-json/wp/v2/posts?per_page=100&page=1&after=YYYY-01-01T00:00:00&before=YYYY-12-31T23:59:59&search=week%20ending
 *
 * Usage:
 *   node Scripts/build_top40weekly_top100.js 1994 Data/top40weekly/top100_1994.json
 *
 * Env:
 *   T40W_DELAY_MS=250
 *   T40W_MAX_WEEKS=0
 */

const fs = require("fs");
const path = require("path");

const BASE = "https://top40weekly.com/";
const WP_API = `${BASE}wp-json/wp/v2/posts`;
const DELAY_MS = Math.max(0, Number(process.env.T40W_DELAY_MS || "250") || 250);
const MAX_WEEKS = Math.max(0, Number(process.env.T40W_MAX_WEEKS || "0") || 0);

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
      return { status: res.status, text, url, headers: res.headers };
    } catch (e) {
      lastErr = e;
      await sleep(900 + i * 700);
    }
  }
  throw lastErr;
}

async function fetchJson(url) {
  const r = await fetchText(url);
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`HTTP ${r.status} for ${url}`);
  }
  return JSON.parse(r.text);
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

function extractWeeklyLinksFromYearHub(html) {
  const urls = [];
  const re = /href="([^"]+)"/gi;
  let m;

  while ((m = re.exec(html))) {
    let href = m[1];
    if (!href) continue;

    if (href.startsWith("/")) href = BASE.replace(/\/$/, "") + href;
    if (!href.startsWith("http")) continue;
    if (!href.includes("top40weekly.com/")) continue;

    // broad weekly patterns
    const isWeekly =
      href.includes("week-ending") ||
      href.includes("week ending") ||
      href.includes("us-top-40-singles");

    if (!isWeekly) continue;
    urls.push(href);
  }

  return Array.from(new Set(urls));
}

function yearFromWeeklyUrl(url) {
  const m = String(url).match(/(\d{4})\/?$/);
  return m ? Number(m[1]) : null;
}

function parseWeeklyTop40(html) {
  const text = stripTags(html)
    .replace(/[–—]/g, "-")
    .replace(/-•-/g, "-")
    .replace(/\s+/g, " ");

  const out = [];
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

async function getWeeklyLinksViaWpJson(year) {
  const after = `${year}-01-01T00:00:00`;
  const before = `${year}-12-31T23:59:59`;

  const links = [];
  const seen = new Set();

  // Two searches: "week ending" and "week-ending" (slugged)
  const searches = ["week%20ending", "week-ending", "us%20top%2040%20singles"];

  for (const q of searches) {
    for (let page = 1; page <= 30; page++) {
      const url =
        `${WP_API}?per_page=100&page=${page}` +
        `&after=${encodeURIComponent(after)}` +
        `&before=${encodeURIComponent(before)}` +
        `&search=${q}`;

      let arr = [];
      try {
        arr = await fetchJson(url);
      } catch (e) {
        // Most common: page overflow => stop
        break;
      }

      if (!Array.isArray(arr) || arr.length === 0) break;

      for (const post of arr) {
        const link = post && post.link ? String(post.link) : "";
        if (!link || !link.includes("top40weekly.com/")) continue;
        // keep only likely weekly chart posts
        if (!(link.includes("week-ending") || link.includes("us-top-40-singles"))) continue;

        const y = yearFromWeeklyUrl(link);
        if (y && y !== year) continue;

        if (!seen.has(link)) {
          seen.add(link);
          links.push(link);
        }
      }

      await sleep(DELAY_MS);
    }
  }

  return links;
}

async function main() {
  const yearArg = process.argv[2];
  const outPath = process.argv[3];

  if (!yearArg || !outPath) {
    console.error("Usage: node Scripts/build_top40weekly_top100.js <year> <out.json>");
    process.exitCode = 1;
    return;
  }

  const year = Number(yearArg);
  if (!Number.isFinite(year) || year < 1950 || year > 2100) {
    console.error("Invalid year:", yearArg);
    process.exitCode = 1;
    return;
  }

  const absOut = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });

  // 1) Hub attempt
  const hubUrl = `${BASE}${year}-all-charts/`;
  console.error("[HUB]", hubUrl);

  const hub = await fetchText(hubUrl);
  fs.writeFileSync(`./Data/_debug_t40w_${year}_hub.html`, hub.text, "utf8");

  if (isWp404(hub.status, hub.text)) {
    console.error("[WARN] hub looks like 404 template, switching to WP JSON fallback");
  }

  let weeklyLinks = extractWeeklyLinksFromYearHub(hub.text);
  console.error("[WEEKS] hub extracted", weeklyLinks.length);

  // 2) WP JSON fallback if hub has nothing
  if (!weeklyLinks.length) {
    console.error("[FALLBACK] Using WP REST API to locate weekly posts for", year);
    weeklyLinks = await getWeeklyLinksViaWpJson(year);
    console.error("[WEEKS] wp-json found", weeklyLinks.length);
  }

  if (!weeklyLinks.length) {
    console.error("[FAIL] No weekly links found by hub or wp-json. Check debug hub HTML.");
    process.exitCode = 3;
    return;
  }

  const cap = MAX_WEEKS > 0 ? Math.min(MAX_WEEKS, weeklyLinks.length) : weeklyLinks.length;
  const linksToFetch = weeklyLinks.slice(0, cap);

  const agg = new Map();
  let parsedWeeks = 0;

  for (let i = 0; i < linksToFetch.length; i++) {
    const url = linksToFetch[i];
    const r = await fetchText(url);
    await sleep(DELAY_MS);

    if (isWp404(r.status, r.text)) {
      console.error("[SKIP] 404 weekly:", url);
      continue;
    }

    const weekRows = parseWeeklyTop40(r.text);
    if (weekRows.length < 20) {
      if (parsedWeeks < 2) {
        fs.writeFileSync(`./Data/_debug_t40w_${year}_week_bad_${parsedWeeks + 1}.html`, r.text, "utf8");
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

  if (parsedWeeks === 0) {
    console.error("[FAIL] Parsed 0 weeks. Weekly pages exist but parsing pattern needs adjustment.");
    process.exitCode = 5;
    return;
  }

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

  const ok = safeWriteJson(absOut, top);
  if (!ok) {
    process.exitCode = 6;
    return;
  }

  console.error("[WRITE]", absOut, "rows=", top.length);
  process.exitCode = 0;
}

main().catch((e) => {
  console.error("[ERR]", e && e.stack ? e.stack : e);
  process.exitCode = 99;
});
