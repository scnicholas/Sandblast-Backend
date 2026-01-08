"use strict";

/**
 * Build + insert Story Moments (1960–1989) from Wikipedia Year-End Hot 100 pages.
 * - Fetches https://en.wikipedia.org/api/rest_v1/page/html/Billboard_Year-End_Hot_100_singles_of_<YEAR>
 * - Extracts #1 row from the main table
 * - Generates Nyx 50–60 word story moment
 * - Inserts/updates objects in Data/music_moments_v1.json between:
 *     "APPENDED CONTENT — 1950s STORY MOMENTS v1"
 *   and
 *     "APPENDED CONTENT — 1950s MICRO-MOMENTS v1"
 *
 * Usage:
 *   node Scripts/build_story_moments_1960_1989.js
 *   node Scripts/build_story_moments_1960_1989.js 1960 1989
 */

const fs = require("fs");
const path = require("path");

const FILE = path.resolve(process.cwd(), "Data/music_moments_v1.json");

const START_DEFAULT = 1960;
const END_DEFAULT = 1989;

function stripJsonComments(s) {
  s = String(s || "");
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");
  s = s.replace(/^\s*\/\/.*$/gm, "");
  return s;
}

function jsonSafeParseWithComments(fileText) {
  const stripped = stripJsonComments(fileText);
  return JSON.parse(stripped);
}

function escapeJsonString(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\u0000/g, "");
}

async function fetchWikipediaYearHtml(year) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/html/Billboard_Year-End_Hot_100_singles_of_${year}`;
  const res = await fetch(url, {
    headers: {
      "user-agent": "sandblast-backend-story-builder/1.0",
      accept: "text/html",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status}) for ${year}: ${url}`);
  }
  return await res.text();
}

function decodeHtml(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Extract the first data row from the first wikitable that has "No."/"No" and "Title" and "Artist(s)"
function extractNumberOneFromHtml(html) {
  const h = String(html || "");

  // Find the first table with "wikitable" class
  const tableMatch = h.match(/<table[^>]*class="[^"]*wikitable[^"]*"[\s\S]*?<\/table>/i);
  if (!tableMatch) throw new Error("No wikitable found");

  const table = tableMatch[0];

  // Pull rows
  const rowMatches = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  if (rowMatches.length < 2) throw new Error("No rows found");

  // Identify header, then first body row
  // Header row often contains th cells.
  let firstDataRow = null;
  for (let i = 1; i < rowMatches.length; i++) {
    const row = rowMatches[i];
    const hasTd = /<td[\s\S]*?>/i.test(row);
    if (hasTd) {
      firstDataRow = row;
      break;
    }
  }
  if (!firstDataRow) throw new Error("No data row found");

  // Extract cells (td)
  const cellMatches = firstDataRow.match(/<td[\s\S]*?<\/td>/gi) || [];
  if (cellMatches.length < 3) {
    // Some tables omit rank column; try more permissive extraction
    throw new Error(`Unexpected cell count: ${cellMatches.length}`);
  }

  // Common schema: [No., Title, Artist(s)]
  // Title and Artist might be wrapped in <i>, <a>, etc.
  const cellText = cellMatches.map((c) =>
    decodeHtml(
      c
        .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/?[^>]+>/g, " ")
    )
  );

  // Determine if first cell is numeric rank
  let rank = 1;
  let title = "";
  let artist = "";

  const maybeRank = cellText[0].trim();
  const isRank = /^[0-9]+$/.test(maybeRank);
  if (isRank) {
    rank = parseInt(maybeRank, 10);
    title = cellText[1].trim();
    artist = cellText[2].trim();
  } else {
    // No rank column; assume [Title, Artist, (maybe extra)]
    title = cellText[0].trim();
    artist = cellText[1].trim();
  }

  // Cleanup title quotes
  title = title.replace(/^["“]+|["”]+$/g, "").trim();
  artist = artist.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();

  if (!title || !artist) throw new Error("Missing title/artist after parsing");

  return { rank: rank || 1, title, artist };
}

function wordCount(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

// Tight Nyx style: 50–60 words (soft guard), ends with CTA.
function generateStoryMoment(year, title, artist) {
  // Rotating frames to avoid robotic sameness
  const frames = [
    `In ${year}, “${title}” sat at the top of Billboard’s year-end Hot 100, and the air felt charged.`,
    `Billboard’s year-end Hot 100 for ${year} crowned “${title},” with ${artist} owning the moment.`,
    `“${title}” by ${artist} led the ${year} year-end Hot 100—one of those songs that instantly sets the scene.`,
  ];

  const beats = [
    "Radio was getting bigger, studios were getting sharper, and pop was learning to hit harder.",
    "The business was speeding up: tighter singles, louder hooks, and a faster chase for next week’s sound.",
    "Under the hit, the scene was shifting—new textures, new attitudes, and a market that wanted momentum.",
  ];

  const close = "Want the top 10, a micro-moment, or the next year?";

  // Compose, then trim to ~50–60 words by selecting one frame + one beat.
  const base = `${frames[year % frames.length]} ${beats[year % beats.length]} ${close}`;

  // If somehow long, we shave by removing extra clauses.
  let out = base.replace(/\s+/g, " ").trim();
  let wc = wordCount(out);

  if (wc > 65) {
    out = out
      .replace("—one of those songs that instantly sets the scene.", ".")
      .replace("and the air felt charged.", ".")
      .replace(/\s+/g, " ")
      .trim();
    wc = wordCount(out);
  }

  // Hard guard: if still too long, drop the middle beat to keep CTA + anchor
  if (wc > 70) {
    out = `${frames[year % frames.length]} ${close}`.replace(/\s+/g, " ").trim();
  }

  return out;
}

function buildStoryObject(year, title, artist) {
  return {
    id: `MM-${year}-story-v1`,
    type: "story_moment",
    year,
    decade: `${Math.floor(year / 10) * 10}s`,
    title,
    artist,
    chart: "Billboard Year-End Hot 100",
    position: 1,
    moment_text: generateStoryMoment(year, title, artist),
    voice: "nyx",
    media_type: "narrative",
    rights: "editorial-original",
    canonical: true,
    tags: [`${year}`, "story", "year-end"],
  };
}

function findSectionBounds(fileText) {
  const startMarker = "APPENDED CONTENT — 1950s STORY MOMENTS v1";
  const endMarker = "APPENDED CONTENT — 1950s MICRO-MOMENTS v1";

  const sIdx = fileText.indexOf(startMarker);
  const eIdx = fileText.indexOf(endMarker);

  if (sIdx < 0 || eIdx < 0 || eIdx <= sIdx) {
    throw new Error("Could not find STORY/MICRO section markers in music_moments_v1.json");
  }

  // Find the first '{' after the STORY marker
  const storyBlockStart = fileText.indexOf("{", sIdx);
  if (storyBlockStart < 0 || storyBlockStart >= eIdx) {
    throw new Error("Could not locate start of story objects block");
  }

  // Find the position right before the MICRO marker (we insert story objects before it)
  const insertBefore = fileText.lastIndexOf("\n", eIdx);
  return { storyBlockStart, insertBefore, sIdx, eIdx };
}

// Replace existing story objects in range OR insert if missing.
function upsertStoryObjectsIntoFile(fileText, storyObjects, insertBefore) {
  // We’ll remove any existing objects whose id matches MM-<year>-story-v1 within the story section,
  // then insert updated ones in a single contiguous block right before the MICRO marker.

  const years = new Set(storyObjects.map((o) => o.year));
  const idRegex = /"id"\s*:\s*"MM-(\d{4})-story-v1"/g;

  // Find all occurrences and remove the enclosing object (best-effort brace match)
  let out = fileText;

  // Work from the end to keep indices stable
  const hits = [];
  let m;
  while ((m = idRegex.exec(out)) !== null) {
    const y = parseInt(m[1], 10);
    if (years.has(y)) hits.push({ index: m.index, year: y });
  }
  hits.sort((a, b) => b.index - a.index);

  for (const h of hits) {
    // Find object start '{' before id
    const start = out.lastIndexOf("{", h.index);
    if (start < 0) continue;

    // Find object end '}' after id (naive but works because these objects are flat)
    const after = out.indexOf("}", h.index);
    if (after < 0) continue;

    // Also remove trailing comma if present
    let end = after + 1;
    const tail = out.slice(end).match(/^\s*,/);
    if (tail) end += tail[0].length;

    out = out.slice(0, start) + out.slice(end);
  }

  // Build insertion block (proper indentation and commas between objects)
  const blockLines = [];
  for (let i = 0; i < storyObjects.length; i++) {
    const o = storyObjects[i];
    const json = JSON.stringify(o, null, 2)
      .split("\n")
      .map((ln) => "    " + ln) // indent to match file
      .join("\n");
    blockLines.push(json + ",");
  }
  const block = "\n\n" + blockLines.join("\n\n") + "\n\n";

  // Insert before MICRO marker
  const head = out.slice(0, insertBefore);
  const tail = out.slice(insertBefore);

  return head + block + tail;
}

async function main() {
  const start = parseInt(process.argv[2] || `${START_DEFAULT}`, 10);
  const end = parseInt(process.argv[3] || `${END_DEFAULT}`, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    console.error("Usage: node Scripts/build_story_moments_1960_1989.js [startYear] [endYear]");
    process.exit(2);
  }

  if (!fs.existsSync(FILE)) {
    console.error("Missing:", FILE);
    process.exit(2);
  }

  const original = fs.readFileSync(FILE, "utf8");
  // Parse check early (comment-stripped) to ensure baseline is valid
  try {
    jsonSafeParseWithComments(original);
  } catch (e) {
    console.error("Base file is not parseable after comment stripping. Fix that first.");
    console.error(e.message);
    process.exit(1);
  }

  const { insertBefore } = findSectionBounds(original);

  const storyObjects = [];
  for (let year = start; year <= end; year++) {
    const html = await fetchWikipediaYearHtml(year);
    const { title, artist } = extractNumberOneFromHtml(html);
    storyObjects.push(buildStoryObject(year, title, artist));
    console.log(`OK ${year}: #1 ${artist} — ${title}`);
  }

  const updated = upsertStoryObjectsIntoFile(original, storyObjects, insertBefore);

  // Parse check final (comment stripped)
  try {
    jsonSafeParseWithComments(updated);
  } catch (e) {
    console.error("Updated file failed parse after comment stripping.");
    console.error(e.message);
    process.exit(1);
  }

  fs.writeFileSync(FILE, updated, "utf8");
  console.log(`DONE: inserted/updated ${storyObjects.length} story moments (${start}–${end}) into Data/music_moments_v1.json`);
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
