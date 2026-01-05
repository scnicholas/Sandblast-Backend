"use strict";

const fs = require("fs");
const path = require("path");

const FILE = path.resolve(process.cwd(), "Data/music_moments_v1.json");

function stripJsonComments(s) {
  s = String(s || "");
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");
  s = s.replace(/^\s*\/\/.*$/gm, "");
  return s;
}

function patchMomentText(block, id, newText) {
  const idx = block.indexOf(`"id": "${id}"`);
  if (idx < 0) return { out: block, ok: false };

  const slice = block.slice(idx, idx + 2500);
  const re = /"moment_text"\s*:\s*"[\s\S]*?"\s*,/;
  const m = slice.match(re);
  if (!m) return { out: block, ok: false };

  const escaped = newText.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const replaced = slice.replace(re, `"moment_text": "${escaped}",`);
  return { out: block.slice(0, idx) + replaced + block.slice(idx + 2500), ok: true };
}

function ensureCommaAfterStory1951(s) {
  // If 1951 story object ends with } and immediately next non-space is { (our insert),
  // we must make it }, to keep JSON array valid.
  // We target the end of the 1951 story object by locating its id, then scanning forward to the first closing brace of that object.
  const id = `"id": "MM-1950s-story-1951-v1"`;
  const i = s.indexOf(id);
  if (i < 0) return { out: s, changed: false };

  // Find the closing brace of that object (naive but effective: find the next "\n    }" after the id block)
  const tail = s.slice(i);
  const closeIdx = tail.indexOf("\n    }");
  if (closeIdx < 0) return { out: s, changed: false };

  const absClose = i + closeIdx + "\n    }".length;

  // Look ahead to next non-space char
  const after = s.slice(absClose);
  const m = after.match(/^\s*(,?)/); // might already have comma
  // If already comma, no need
  const afterTrim = after.trimStart();
  if (afterTrim.startsWith(",")) return { out: s, changed: false };

  // If next content begins with { or /* then we need a comma after the object
  if (afterTrim.startsWith("{") || afterTrim.startsWith("/*")) {
    const out = s.slice(0, absClose) + "," + s.slice(absClose);
    return { out, changed: true };
  }
  return { out: s, changed: false };
}

function main() {
  if (!fs.existsSync(FILE)) {
    console.error("FAIL: missing", FILE);
    process.exit(2);
  }

  let s = fs.readFileSync(FILE, "utf8");

  // 1) Patch 1950 / 1951 moment_text
  const t1950 =
    'With “Goodnight Irene” leading the year-end list, America still sounded warm and familiar. But jukeboxes were multiplying, R&B was turning up the voltage, and the studio guitar was starting to bite. The country was ready for louder, younger voices. Want the top 10, a micro-moment, or the next year?';
  const t1951 =
    '“Too Young” sat at #1 on Billboard’s year-end singles list, all velvet and restraint. Yet the market was tilting: teen buyers had cash, radio was chasing freshness, and the edges of R&B and country were bleeding into pop. The polite era was cracking. Want the top 10, a micro-moment, or the next year?';

  let r = patchMomentText(s, "MM-1950s-story-1950-v1", t1950);
  s = r.out;
  const ok1950 = r.ok;

  r = patchMomentText(s, "MM-1950s-story-1951-v1", t1951);
  s = r.out;
  const ok1951 = r.ok;

  // 2) Replace placeholder block with 1952–1959 objects
  const placeholder = /\/\*\s*\.\.\.\s*1952–1959 story moments\s*\.\.\.\s*\*\//;
  const insert = `
    {
      "id": "MM-1950s-story-1952-v1",
      "type": "story_moment",
      "year": 1952,
      "decade": "1950s",
      "title": "Blue Tango",
      "artist": "Leroy Anderson",
      "chart": "Billboard Year-End Singles",
      "position": 1,
      "moment_text": "“Blue Tango” took the year-end crown, proving an instrumental could still own the room. But underneath the orchestras, postwar pop was speeding up—bigger drum accents, sharper riffs, and more dance-floor momentum. The sound was getting more physical, less parlor. Want the top 10, a micro-moment, or the next year?",
      "voice": "nyx",
      "media_type": "narrative",
      "rights": "editorial-original",
      "canonical": true,
      "tags": ["1952", "story", "instrumental"]
    },

    {
      "id": "MM-1950s-story-1953-v1",
      "type": "story_moment",
      "year": 1953,
      "decade": "1950s",
      "title": "The Song from Moulin Rouge",
      "artist": "Percy Faith featuring Felicia Sanders",
      "chart": "Billboard Year-End Singles",
      "position": 1,
      "moment_text": "Percy Faith’s “The Song from Moulin Rouge” topped the year, Hollywood romance in widescreen sound. At the same time, doo-wop corners and R&B clubs were building a different future—tighter harmonies, rawer vocals, and beats you could feel. Two Americas, one dial. Want the top 10, a micro-moment, or the next year?",
      "voice": "nyx",
      "media_type": "narrative",
      "rights": "editorial-original",
      "canonical": true,
      "tags": ["1953", "story", "pop-vs-rnb"]
    },

    {
      "id": "MM-1950s-story-1954-v1",
      "type": "story_moment",
      "year": 1954,
      "decade": "1950s",
      "title": "Little Things Mean a Lot",
      "artist": "Kitty Kallen",
      "chart": "Billboard Year-End Singles",
      "position": 1,
      "moment_text": "Kitty Kallen’s “Little Things Mean a Lot” ruled the year-end list—sweet, precise, and radio-perfect. But 1954 carried a warning: “Sh-Boom” and “Shake, Rattle and Roll” were already in the bloodstream, pushing rhythm forward. Pop didn’t know it yet, but it was losing control. Want the top 10, a micro-moment, or the next year?",
      "voice": "nyx",
      "media_type": "narrative",
      "rights": "editorial-original",
      "canonical": true,
      "tags": ["1954", "story", "early-rock"]
    },

    {
      "id": "MM-1950s-story-1955-v1",
      "type": "story_moment",
      "year": 1955,
      "decade": "1950s",
      "title": "Cherry Pink and Apple Blossom White",
      "artist": "Perez Prado",
      "chart": "Billboard Year-End Singles",
      "position": 1,
      "moment_text": "Perez Prado’s “Cherry Pink and Apple Blossom White” hit #1 for the year, a bright Latin swirl in every living room. Then the other shoe dropped: “Rock Around the Clock” exploded right behind it, signaling youth culture as a market force, not a phase. The tempo of America changed. Want the top 10, a micro-moment, or the next year?",
      "voice": "nyx",
      "media_type": "narrative",
      "rights": "editorial-original",
      "canonical": true,
      "tags": ["1955", "story", "youth-market"]
    },

    {
      "id": "MM-1950s-story-1956-v1",
      "type": "story_moment",
      "year": 1956,
      "decade": "1950s",
      "title": "Heartbreak Hotel",
      "artist": "Elvis Presley",
      "chart": "Billboard Year-End Singles",
      "position": 1,
      "moment_text": "Elvis Presley’s “Heartbreak Hotel” finished #1 for the year—and the old rules didn’t survive it. The vocal sounded lonely, the guitar felt dangerous, and the crowd finally had a face. Rock ’n’ roll wasn’t a side show anymore; it was the main event. Want the top 10, a micro-moment, or the next year?",
      "voice": "nyx",
      "media_type": "narrative",
      "rights": "editorial-original",
      "canonical": true,
      "tags": ["1956", "story", "rock-breakthrough"]
    },

    {
      "id": "MM-1950s-story-1957-v1",
      "type": "story_moment",
      "year": 1957,
      "decade": "1950s",
      "title": "All Shook Up",
      "artist": "Elvis Presley",
      "chart": "Billboard Year-End Singles",
      "position": 1,
      "moment_text": "“All Shook Up” put Elvis back at the top of the year-end list, and the energy was unmistakable. Rock was getting cleaner, faster, and more unavoidable—teen radio, teen movies, teen everything. The industry started chasing youth on purpose, not by accident. Want the top 10, a micro-moment, or the next year?",
      "voice": "nyx",
      "media_type": "narrative",
      "rights": "editorial-original",
      "canonical": true,
      "tags": ["1957", "story", "teen-culture"]
    },

    {
      "id": "MM-1950s-story-1958-v1",
      "type": "story_moment",
      "year": 1958,
      "decade": "1950s",
      "title": "Volare (Nel blu dipinto di blu)",
      "artist": "Domenico Modugno",
      "chart": "Billboard Year-End Hot 100",
      "position": 1,
      "moment_text": "Domenico Modugno’s “Volare (Nel blu dipinto di blu)” led the year, and it felt like pop suddenly had passports. The Hot 100 era was beginning, and the palette widened—rock, crooners, novelty hits, and international melodies all competing on one scoreboard. America’s charts became a battleground. Want the top 10, a micro-moment, or the next year?",
      "voice": "nyx",
      "media_type": "narrative",
      "rights": "editorial-original",
      "canonical": true,
      "tags": ["1958", "story", "hot-100-era"]
    },

    {
      "id": "MM-1950s-story-1959-v1",
      "type": "story_moment",
      "year": 1959,
      "decade": "1950s",
      "title": "The Battle of New Orleans",
      "artist": "Johnny Horton",
      "chart": "Billboard Year-End Hot 100",
      "position": 1,
      "moment_text": "Johnny Horton’s “The Battle of New Orleans” topped the 1959 year-end Hot 100, proof that novelty and storytelling could beat pure teen angst. Yet the scene was sharpening: doo-wop, early soul, and swaggering rock were taking over the air. The sixties were already knocking. Want the top 10, a micro-moment, or the next year?",
      "voice": "nyx",
      "media_type": "narrative",
      "rights": "editorial-original",
      "canonical": true,
      "tags": ["1959", "story", "sixties-ahead"]
    }
`.trim();

  const hadPlaceholder = placeholder.test(s);
  if (hadPlaceholder) s = s.replace(placeholder, insert);

  // 3) Ensure we have a comma after 1951 object if needed (most common parse failure)
  const commaFix = ensureCommaAfterStory1951(s);
  s = commaFix.out;

  // 4) Parse-check (comment-stripped)
  const stripped = stripJsonComments(s);
  try {
    const j = JSON.parse(stripped);
    const count = Array.isArray(j.moments)
      ? j.moments.filter((x) => String(x?.type || "").toLowerCase() === "story_moment").length
      : 0;

    fs.writeFileSync(FILE, s, "utf8");
    console.log("PATCH OK");
    console.log("1950 replaced:", ok1950, "1951 replaced:", ok1951, "placeholder replaced:", hadPlaceholder);
    console.log("comma after 1951 added:", commaFix.changed);
    console.log("story_moment count now:", count);
  } catch (e) {
    console.error("PATCH FAILED: still not valid JSON after stripping comments.");
    console.error(e.message);
    process.exit(1);
  }
}

main();
