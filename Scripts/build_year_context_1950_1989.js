"use strict";

/**
 * Build year context (1950–1989) from Wikipedia timeline pages.
 * Output: Data/music_year_context_1950_1989.json
 *
 * Source pages:
 *  - 1950–1969: Timeline_of_music_in_the_United_States_(1950–1969)
 *  - 1970–2000: Timeline_of_music_in_the_United_States_(1970–2000)
 *
 * Uses REST HTML endpoint:
 *  https://en.wikipedia.org/api/rest_v1/page/html/<TITLE>
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_FILE = path.resolve(process.cwd(), "Data/music_year_context_1950_1989.json");

// Wikipedia REST HTML titles (URL-encoded)
const PAGE_50S_60S =
  "Timeline_of_music_in_the_United_States_(1950%E2%80%931969)";
const PAGE_70S_80S =
  "Timeline_of_music_in_the_United_States_(1970%E2%80%932000)";

const REST_BASE = "https://en.wikipedia.org/api/rest_v1/page/html/";

const START_YEAR = 1950;
const END_YEAR = 1989;

// Safety limits (avoid megabytes of text per year)
const MAX_ITEMS_PER_YEAR = 60;
const MAX_CHARS_PER_ITEM = 240;

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            // Some environments behave better with a UA
            "User-Agent": "Sandblast-YearContextBuilder/1.0",
            "Accept": "text/html",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
          });
        }
      )
      .on("error", reject);
  });
}

function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<sup[^>]*>.*?<\/sup>/gis, "") // citations
      .replace(/<style[^>]*>.*?<\/style>/gis, "")
      .replace(/<script[^>]*>.*?<\/script>/gis, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>\s*<p>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Extract <li> items from the section that follows the headline id="YEAR"
 * until the next headline id="NEXT_YEAR" (or end).
 *
 * Wikipedia REST HTML typically includes:
 *  <span class="mw-headline" id="1950">1950</span>
 */
function extractYearItemsFromHtml(html, year) {
  const y = String(year);
  const next = String(year + 1);

  // Find the year headline span
  const startRe = new RegExp(
    `<span[^>]*class="mw-headline"[^>]*id="${y}"[^>]*>\\s*${y}\\s*<\\/span>`,
    "i"
  );
  const startMatch = html.match(startRe);
  if (!startMatch) return [];

  const startIdx = html.indexOf(startMatch[0]);
  if (startIdx < 0) return [];

  // Find the next year headline after start
  const nextRe = new RegExp(
    `<span[^>]*class="mw-headline"[^>]*id="${next}"[^>]*>\\s*${next}\\s*<\\/span>`,
    "i"
  );

  const tail = html.slice(startIdx);
  const nextMatch = tail.match(nextRe);
  const sectionHtml = nextMatch
    ? tail.slice(0, tail.indexOf(nextMatch[0]))
    : tail;

  // Now capture list items in that section
  const items = [];
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;

  let m;
  while ((m = liRe.exec(sectionHtml))) {
    const txt = stripTags(m[1]);
    if (!txt) continue;

    // Keep items tight and readable
    const clipped =
      txt.length > MAX_CHARS_PER_ITEM ? txt.slice(0, MAX_CHARS_PER_ITEM - 1) + "…" : txt;

    // Ignore obvious nav/junk
    if (/^\^/.test(clipped)) continue;

    items.push(clipped);
    if (items.length >= MAX_ITEMS_PER_YEAR) break;
  }

  // Remove duplicates while keeping order
  const seen = new Set();
  const uniq = [];
  for (const it of items) {
    const k = it.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(it);
  }

  return uniq;
}

async function main() {
  const url50s60s = REST_BASE + PAGE_50S_60S;
  const url70s80s = REST_BASE + PAGE_70S_80S;

  console.log("[yearContext] Fetching:", url50s60s);
  const htmlA = await fetchHtml(url50s60s);

  console.log("[yearContext] Fetching:", url70s80s);
  const htmlB = await fetchHtml(url70s80s);

  const years = {};
  for (let y = START_YEAR; y <= END_YEAR; y++) {
    const src = y <= 1969 ? htmlA : htmlB;
    const items = extractYearItemsFromHtml(src, y);
    years[String(y)] = items;
    console.log(
      `[yearContext] ${y}: items=${items.length}${items.length === 0 ? " (no match)" : ""}`
    );
  }

  const out = {
    version: "music_year_context_1950_1989_v1",
    source: "wikipedia-timeline",
    range: { start: START_YEAR, end: END_YEAR },
    pages: {
      "1950-1969": "Timeline of music in the United States (1950–1969)",
      "1970-1989": "Timeline of music in the United States (1970–2000)",
    },
    years,
    builtAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  console.log("[yearContext] Wrote:", OUT_FILE);
}

main().catch((err) => {
  console.error("[yearContext] FAIL:", err.message || err);
  process.exit(1);
});
