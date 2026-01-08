"use strict";

/**
 * Universal Story Moment Builder from Wikipedia Year-End Hot 100 pages.
 * Fetches:
 *   https://en.wikipedia.org/api/rest_v1/page/html/Billboard_Year-End_Hot_100_singles_of_<YEAR>
 *
 * Extracts the #1 row, generates Nyx 50–60 word story, upserts into:
 *   Data/music_moments_v1.json
 *
 * Usage:
 *   node Scripts/build_story_moments_yearend_hot100.js 1960 2024
 *   node Scripts/build_story_moments_yearend_hot100.js 1990 2024
 */

const fs = require("fs");
const path = require("path");

const FILE = path.resolve(process.cwd(), "Data/music_moments_v1.json");

function stripJsonComments(s) {
  s = String(s || "");
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");
  s = s.replace(/^\s*\/\/.*$/gm, "");
  return s;
}

function parseWithComments(text) {
  return JSON.parse(stripJsonComments(text));
}

async function fetchYearHtml(year) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/html/Billboard_Year-End_Hot_100_singles_of_${year}`;
  const res = await fetch(url, {
    headers: {
      "user-agent": "sandblast-backend-story-builder/1.0",
      accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${year}`);
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

function extractNumberOne(html) {
  const h = String(html || "");
  const tableMatch = h.match(/<table[^>]*class="[^"]*wikitable[^"]*"[\s\S]*?<\/table>/i);
  if (!tableMatch) throw new Error("No wikitable found");

  const table = tableMatch[0];
  const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  if (rows.length < 2) throw new Error("No rows found");

  let firstDataRow = null;
  for (let i = 1; i < rows.length; i++) {
    if (/<td[\s\S]*?>/i.test(rows[i])) {
      firstDataRow = rows[i];
      break;
    }
  }
  if (!firstDataRow) throw new Error("No data row found");

  const cells = firstDataRow.match(/<td[\s\S]*?<\/td>/gi) || [];
  if (cells.length < 2) throw new Error(`Unexpected cell count: ${cells.length}`);

  const txt = cells.map((c) =>
    decodeHtml(
      c
        .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/?[^>]+>/g, " ")
    )
  );

  // Common schema: [No., Title, Artist] OR [Title, Artist]
  let title = "";
  let artist = "";

  if (/^[0-9]+$/.test(txt[0].trim()) && txt.length >= 3) {
    title = txt[1].trim();
    artist = txt[2].trim();
  } else {
    title = txt[0].trim();
    artist = txt[1].trim();
  }

  title = title.replace(/^["“]+|["”]+$/g, "").trim();
  artist = artist.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();

  if (!title || !artist) throw new Error("Missing title/artist after parsing");
  return { title, artist };
}

function wordCount(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}

function generateStoryMoment(year, title, artist) {
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

  let out = `${frames[year % frames.length]} ${beats[year % beats.length]} ${close}`
    .replace(/\s+/g, " ")
    .trim();

  // Guardrail trim if needed
  if (wordCount(out) > 70) out = `${frames[year % frames.length]} ${close}`.replace(/\s+/g, " ").trim();
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

function findMarkers(fileText) {
  const storyMarker = "APPENDED CONTENT — 1950s STORY MOMENTS v1";
  const microMarker = "APPENDED CONTENT — 1950s MICRO-MOMENTS v1";
  const sIdx = fileText.indexOf(storyMarker);
  const eIdx = fileText.indexOf(microMarker);
  if (sIdx < 0 || eIdx < 0 || eIdx <= sIdx) {
    throw new Error("Could not find STORY/MICRO section markers in music_moments_v1.json");
  }
  const insertBefore = fileText.lastIndexOf("\n", eIdx);
  if (insertBefore < 0) throw new Error("Could not determine insert position");
  return { insertBefore };
}

function removeExistingYears(fileText, yearsSet) {
  // Remove any existing MM-<year>-story-v1 object blocks (best-effort).
  let out = fileText;
  const idRe = /"id"\s*:\s*"MM-(\d{4})-story-v1"/g;

  const hits = [];
  let m;
  while ((m = idRe.exec(out)) !== null) {
    const y = parseInt(m[1], 10);
    if (yearsSet.has(y)) hits.push({ idx: m.index });
  }
  hits.sort((a, b) => b.idx - a.idx);

  for (const h of hits) {
    const start = out.lastIndexOf("{", h.idx);
    if (start < 0) continue;
    const endBrace = out.indexOf("}", h.idx);
    if (endBrace < 0) continue;

    let end = endBrace + 1;
    // remove trailing comma if present
    const comma = out.slice(end).match(/^\s*,/);
    if (comma) end += comma[0].length;

    out = out.slice(0, start) + out.slice(end);
  }
  return out;
}

function insertBlock(fileText, storyObjects, insertBefore) {
  const block = storyObjects
    .map((o) => "    " + JSON.stringify(o, null, 2).split("\n").join("\n    ") + ",")
    .join("\n\n");

  const head = fileText.slice(0, insertBefore);
  const tail = fileText.slice(insertBefore);
  return head + "\n\n" + block + "\n\n" + tail;
}

async function main() {
  const start = parseInt(process.argv[2], 10);
  const end = parseInt(process.argv[3], 10);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    console.error("Usage: node Scripts/build_story_moments_yearend_hot100.js <startYear> <endYear>");
    process.exit(2);
  }

  if (!fs.existsSync(FILE)) {
    console.error("Missing:", FILE);
    process.exit(2);
  }

  const original = fs.readFileSync(FILE, "utf8");

  // Baseline parse check
  try {
    parseWithComments(original);
  } catch (e) {
    console.error("Base file not parseable after comment stripping:", e.message);
    process.exit(1);
  }

  const { insertBefore } = findMarkers(original);

  const storyObjects = [];
  for (let year = start; year <= end; year++) {
    const html = await fetchYearHtml(year);
    const { title, artist } = extractNumberOne(html);
    storyObjects.push(buildStoryObject(year, title, artist));
    console.log(`OK ${year}: #1 ${artist} — ${title}`);
  }

  const yearsSet = new Set(storyObjects.map((o) => o.year));
  let updated = removeExistingYears(original, yearsSet);
  updated = insertBlock(updated, storyObjects, insertBefore);

  // Final parse check
  try {
    parseWithComments(updated);
  } catch (e) {
    console.error("Updated file failed parse after comment stripping:", e.message);
    process.exit(1);
  }

  fs.writeFileSync(FILE, updated, "utf8");
  console.log(`DONE: inserted/updated ${storyObjects.length} story moments (${start}–${end})`);
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
