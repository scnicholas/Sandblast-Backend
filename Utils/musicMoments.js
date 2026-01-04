"use strict";

/**
 * Utils/musicMoments.js — v1.4
 *
 * Canonical behavior:
 *  - Chart truth (Top 10, rank picks) is delegated to Utils/musicKnowledge.
 *  - Curated story paragraphs are loaded from Data/music_moments_v1.json:
 *      - entries where type === "story_moment"
 *      - uses moment_text
 *  - Supports:
 *      - "top 10 1988"
 *      - "story moment 1957" / "moment 1957" / "story 1957"
 *      - "#2 moment" (uses session context if available)
 *      - "#2 moment 1957"
 *      - "micro 1957" / "micro moment 1957"
 *      - "yes" (if session.pendingMicroYear is set by index.js)
 */

const fs = require("fs");
const path = require("path");

const musicKnowledge = require("./musicKnowledge");

// ---------------------------------------------------------
// Version
// ---------------------------------------------------------
const VERSION =
  "musicMoments v1.4 (curated story moments from music_moments_v1.json + micro; top10/rank sourced from musicKnowledge)";

// ---------------------------------------------------------
// Curated Story Moments file (canonical for story_moment text)
// ---------------------------------------------------------
const MOMENTS_FILE = "Data/music_moments_v1.json";

// ---------------------------------------------------------
// Cache
// ---------------------------------------------------------
// { ok, file, rows, indexByKey, indexByYearRank, indexByYear, mtimeMs }
let STORY_CACHE = null;

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function normKey(s) {
  return cleanText(s).toLowerCase();
}

function toInt(x) {
  const s = String(x ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function resolveRepoPath(rel) {
  return path.resolve(process.cwd(), rel);
}

function getMtimeMs(absPath) {
  try {
    const st = fs.statSync(absPath);
    return st && st.mtimeMs ? st.mtimeMs : 0;
  } catch (_) {
    return 0;
  }
}

function stripJsonComments(input) {
  // Handles /* ... */ and whole-line // comments
  let s = String(input || "");
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");
  s = s.replace(/^\s*\/\/.*$/gm, "");
  return s;
}

function safeLenientJsonRead(absPath) {
  try {
    const raw = fs.readFileSync(absPath, "utf8");
    const cleaned = stripJsonComments(raw);
    return JSON.parse(cleaned);
  } catch (_) {
    return null;
  }
}

function normalizeArtistTitle(artist, title) {
  return { artist: cleanText(artist), title: cleanText(title) };
}

function makeStoryKey(year, artist, title) {
  return `${year}|${normKey(artist)}|${normKey(title)}`;
}

function fixEncoding(s) {
  // Common mojibake from smart punctuation
  return String(s || "")
    .replace(/â€”/g, "—")
    .replace(/â€“/g, "–")
    .replace(/â€œ/g, "“")
    .replace(/â€/g, "”")
    .replace(/â€™/g, "’")
    .replace(/Â/g, "")
    .trim();
}

function endsWithForwardBeat(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;
  return (
    t.endsWith("?") ||
    t.includes("want the top 10") ||
    t.includes("want the top ten") ||
    t.includes("want a micro") ||
    t.includes("next year") ||
    t.includes("another year")
  );
}

function ensureForwardBeat(text) {
  const t = cleanText(text);
  if (!t) return t;
  if (endsWithForwardBeat(t)) return t;
  return `${t} Want the top 10, a story moment, or the next year?`;
}

// ---------------------------------------------------------
// Curated Story Moments loader (hot reload)
// ---------------------------------------------------------
function loadStory({ force = false } = {}) {
  const file = resolveRepoPath(MOMENTS_FILE);
  const mtimeMs = getMtimeMs(file);

  if (!force && STORY_CACHE && mtimeMs && mtimeMs === STORY_CACHE.mtimeMs) {
    return STORY_CACHE;
  }

  if (!fs.existsSync(file)) {
    STORY_CACHE = {
      ok: false,
      file,
      rows: 0,
      indexByKey: new Map(),
      indexByYearRank: new Map(),
      indexByYear: new Map(),
      mtimeMs: 0,
    };
    return STORY_CACHE;
  }

  const doc = safeLenientJsonRead(file);
  const rows = Array.isArray(doc?.moments) ? doc.moments : [];

  const indexByKey = new Map();
  const indexByYearRank = new Map(); // `${year}|${rank}`
  const indexByYear = new Map(); // `${year}` -> best story (rank 1 preferred)

  let kept = 0;

  for (const r of rows) {
    if (!r) continue;
    if (String(r.type || "").toLowerCase() !== "story_moment") continue;

    const year = toInt(r.year);
    const rank = toInt(r.position) || toInt(r.rank) || null;

    const { artist, title } = normalizeArtistTitle(r.artist, r.title);
    const chart = cleanText(r.chart);
    const momentText = fixEncoding(cleanText(r.moment_text));

    if (!year || !artist || !title || !momentText) continue;

    kept += 1;

    const rec = {
      year,
      rank,
      artist,
      title,
      chart,
      moment: ensureForwardBeat(momentText),
      id: cleanText(r.id) || null,
      decade: cleanText(r.decade) || null,
      tags: Array.isArray(r.tags) ? r.tags : [],
    };

    // by key (artist/title)
    const k = makeStoryKey(year, artist, title);
    indexByKey.set(k, rec);

    // by year+rank
    if (rank && rank >= 1 && rank <= 100) {
      indexByYearRank.set(`${year}|${rank}`, rec);
    }

    // by year default (prefer #1 if present, else first)
    const yk = String(year);
    const existing = indexByYear.get(yk);
    if (!existing) {
      indexByYear.set(yk, rec);
    } else if (toInt(rec.rank) === 1 && toInt(existing.rank) !== 1) {
      indexByYear.set(yk, rec);
    }
  }

  STORY_CACHE = {
    ok: true,
    file,
    rows: kept,
    indexByKey,
    indexByYearRank,
    indexByYear,
    mtimeMs,
  };

  return STORY_CACHE;
}

function lookupCuratedStory({ year, artist, title, rank }) {
  const db = loadStory({ force: false });
  if (!db.ok) return null;

  if (year && artist && title) {
    const k = makeStoryKey(year, artist, title);
    const hit = db.indexByKey.get(k);
    if (hit) return hit;
  }

  if (year && rank) {
    const hit = db.indexByYearRank.get(`${year}|${rank}`);
    if (hit) return hit;
  }

  if (year) {
    const hit = db.indexByYear.get(String(year));
    if (hit) return hit;
  }

  return null;
}

// ---------------------------------------------------------
// Controlled fallback story paragraph (only if curated missing)
// ---------------------------------------------------------
function buildFallbackStory({ year, artist, title }) {
  const y = year || "that year";
  const a = artist || "the artist";
  const t = title || "that song";

  // Keep this short-ish and broadcast-safe. Forward beat appended separately.
  return ensureForwardBeat(
    `In ${y}, “${t}” didn’t just get played—it became part of the year’s texture. ${a} landed a track that felt personal even in a crowded room, the one people remembered after the radio went quiet. The song matched the pace of life back then: clear, direct, and hard to shake.`
  );
}

// ---------------------------------------------------------
// Micro moment generator (10-second cue)
// ---------------------------------------------------------
function buildMicroMoment({ year, artist, title }) {
  const y = year || "that year";
  const a = artist || "the artist";
  const t = title || "that song";

  // 18–25 words, tight, no filler.
  return `Micro — ${y}: ${a}’s “${t}” set the tone—fast hook, clear emotion, and a chorus that stayed in your pocket all day.`;
}

// ---------------------------------------------------------
// Intent parsing
// ---------------------------------------------------------
function parse(text, session) {
  const raw = cleanText(text);
  const t = raw.toLowerCase();

  // Special: “yes” triggers micro moment if index.js armed it
  const isYes = /^(yes|yep|yeah|yup|sure|ok|okay)$/i.test(raw);

  const yearMatch = t.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  const year = yearMatch ? toInt(yearMatch[1]) : null;

  const wantsTop10 = /top\s*(10|ten)/.test(t);

  const wantsMicro =
    !wantsTop10 &&
    (/\bmicro\b/.test(t) || /\bmicro\s*moment\b/.test(t) || (isYes && toInt(session?.pendingMicroYear)));

  // story/moment request (top10 wins if both)
  const wantsStory = !wantsTop10 && !wantsMicro && (/\bstory\b/.test(t) || /\bmoment\b/.test(t));

  const rankMatch =
    t.match(/(?:^|\s)#\s*(\d{1,2})(?:\s|$)/) ||
    t.match(/\b(?:no\.?|number|rank)\s*(\d{1,2})\b/);

  const rank = rankMatch ? toInt(rankMatch[1]) : null;

  // If user said "yes" and we have pendingMicroYear, use that year
  const microYear = isYes && toInt(session?.pendingMicroYear) ? toInt(session.pendingMicroYear) : null;

  return { year, wantsTop10, wantsStory, wantsMicro, microYear, rank };
}

// ---------------------------------------------------------
// Canonical Top 10 via musicKnowledge
// ---------------------------------------------------------
function mkTop10(year, session) {
  const chart = session?.activeMusicChart || "Billboard Hot 100";
  try {
    if (typeof musicKnowledge._getTopByYear === "function") {
      const rows = musicKnowledge._getTopByYear(year, chart, 10) || [];
      return { chartUsed: chart, rows };
    }
  } catch (_) {}

  return { chartUsed: chart, rows: [] };
}

function formatTop10FromRows(year, chartUsed, rows) {
  if (!rows || !rows.length) return null;

  const lines = rows.slice(0, 10).map((m) => {
    const rk = toInt(m.rank) ?? "?";
    const artist = cleanText(m.artist) || "Unknown Artist";
    const title = cleanText(m.title) || "Unknown Title";
    return `${rk}. ${artist} — ${title}`;
  });

  return `Top 10 — ${chartUsed} (${year}):\n${lines.join("\n")}`;
}

// ---------------------------------------------------------
// Pick a song for a story moment
// Priority:
//  1) Session lastTop10 / lastTop1 (if present)
//  2) Pull Top10 via musicKnowledge for year + rank (or #1 default)
// ---------------------------------------------------------
function pickSong(session, year, rank) {
  session = session || {};
  const y = year || toInt(session.lastMusicYear) || null;

  const lastTop10 = Array.isArray(session.lastTop10) ? session.lastTop10 : null;
  const lastTop1 =
    session.lastTop1 && typeof session.lastTop1 === "object" ? session.lastTop1 : null;

  if (y && lastTop10 && lastTop10.length) {
    const scoped = lastTop10.filter((x) => !x?.year || toInt(x.year) === y);

    if (rank && rank >= 1 && rank <= 10) {
      const hit = scoped.find((x) => toInt(x.rank) === rank);
      if (hit?.artist && hit?.title) {
        const at = normalizeArtistTitle(hit.artist, hit.title);
        return { year: y, rank: toInt(hit.rank) || rank, artist: at.artist, title: at.title };
      }
      return { year: y, rank, artist: null, title: null };
    }

    const first = scoped.find((x) => toInt(x.rank) === 1) || scoped[0];
    if (first?.artist && first?.title) {
      const at = normalizeArtistTitle(first.artist, first.title);
      return { year: y, rank: toInt(first.rank) || 1, artist: at.artist, title: at.title };
    }
  }

  if (y && lastTop1?.artist && lastTop1?.title) {
    const at = normalizeArtistTitle(lastTop1.artist, lastTop1.title);
    return { year: y, rank: toInt(lastTop1.rank) || 1, artist: at.artist, title: at.title };
  }

  if (y) {
    const { rows } = mkTop10(y, session);
    if (rows && rows.length) {
      if (rank && rank >= 1) {
        const hit = rows.find((m) => toInt(m.rank) === rank);
        if (hit?.artist && hit?.title) {
          return {
            year: y,
            rank: toInt(hit.rank) || rank,
            artist: cleanText(hit.artist),
            title: cleanText(hit.title),
          };
        }
      }
      const first = rows.find((m) => toInt(m.rank) === 1) || rows[0];
      if (first?.artist && first?.title) {
        return {
          year: y,
          rank: toInt(first.rank) || 1,
          artist: cleanText(first.artist),
          title: cleanText(first.title),
        };
      }
    }
  }

  return { year: y, rank: rank || null, artist: null, title: null };
}

// ---------------------------------------------------------
// Main handler
// ---------------------------------------------------------
function handle(text, session = {}) {
  const input = String(text || "");
  const { year, wantsTop10, wantsStory, wantsMicro, microYear, rank } = parse(
    input,
    session
  );

  // Hot reload story cache
  loadStory({ force: false });

  // Top 10
  if (wantsTop10) {
    if (!year) {
      return {
        ok: true,
        reply: `Say “top 10 1988” (pick a year 1950–2024) and I’ll pull the list instantly.`,
        followUp: { kind: "ask_year" },
      };
    }

    const { chartUsed, rows } = mkTop10(year, session);
    const out = formatTop10FromRows(year, chartUsed, rows);

    if (!out) {
      // Relax chart filter: try common fallback
      const relaxed = { ...session, activeMusicChart: "Billboard Year-End Hot 100" };
      const alt = mkTop10(year, relaxed);
      const out2 = formatTop10FromRows(year, alt.chartUsed, alt.rows);

      return {
        ok: true,
        reply: out2 || `No chart rows found for ${year} on the available sources in this build yet.`,
        followUp: { kind: "offer_next", year },
      };
    }

    return { ok: true, reply: out, followUp: { kind: "offer_next", year } };
  }

  // Micro moment
  if (wantsMicro) {
    const y = microYear || year || toInt(session.lastMusicYear) || null;
    if (!y) {
      return {
        ok: true,
        reply: `Tell me a year (1950–2024) for a micro-moment — for example: “micro 1957”.`,
        followUp: { kind: "ask_year" },
      };
    }

    // If we can pick the #1 song, micro will be anchored properly
    const picked = pickSong(session, y, 1);

    if (!picked.artist || !picked.title) {
      return {
        ok: true,
        reply: `Quick setup: say “top 10 ${y}” first, then I’ll deliver a clean micro-moment instantly.`,
        followUp: { kind: "need_top10", year: y },
      };
    }

    // Clear pending micro once used
    session.pendingMicroYear = null;

    return {
      ok: true,
      reply: buildMicroMoment(picked),
      followUp: { kind: "offer_next", year: y },
    };
  }

  // Story / moment
  if (wantsStory) {
    const picked = pickSong(session, year, rank);

    if (!picked.year) {
      return {
        ok: true,
        reply: `Give me a year (1950–2024) or say “top 10 1988,” then tell me “story moment” or “#2 moment.”`,
        followUp: { kind: "ask_year_or_top10" },
      };
    }

    // If rank asked but we still lack title/artist, we need top10 context
    if (picked.rank && (!picked.artist || !picked.title)) {
      return {
        ok: true,
        reply:
          `I can do that story moment—quick setup first.\n\n` +
          `Say “top 10 ${picked.year}” so I can lock the list, then say “#${picked.rank} moment”.`,
        followUp: { kind: "need_top10", year: picked.year, rank: picked.rank },
      };
    }

    // Try curated story from Data/music_moments_v1.json first
    const curated = lookupCuratedStory(picked);
    const storyText = curated ? curated.moment : buildFallbackStory(picked);

    // If your curated moment_text already ends with a forward beat, do not add another.
    const addTail = endsWithForwardBeat(storyText)
      ? ""
      : `\n\nWant another one (say “#2 moment”), the Top 10, or a different year?`;

    return {
      ok: true,
      reply:
        `Story moment — ${picked.year}: ${picked.artist} — ${picked.title}\n\n` +
        `${storyText}${addTail}`,
      followUp: { kind: "offer_next", year: picked.year },
    };
  }

  // Default: nudge
  if (!year) {
    return {
      ok: true,
      reply: `Give me a year (1950–2024) and I’ll pull a story moment — or say “top 10 1988”.`,
      followUp: { kind: "ask_year" },
    };
  }

  // Default: treat as story moment for the year (quick, confident)
  const picked = pickSong(session, year, null);
  if (!picked.artist || !picked.title) {
    return {
      ok: true,
      reply: `Try “top 10 ${year}” first—then I’ll give you a story moment that actually lands.`,
      followUp: { kind: "need_top10", year },
    };
  }

  const curated = lookupCuratedStory(picked);
  const storyText = curated ? curated.moment : buildFallbackStory(picked);

  const addTail = endsWithForwardBeat(storyText)
    ? ""
    : `\n\nWant #2, the Top 10, or another year?`;

  return {
    ok: true,
    reply:
      `Story moment — ${picked.year}: ${picked.artist} — ${picked.title}\n\n` +
      `${storyText}${addTail}`,
    followUp: { kind: "offer_next", year: picked.year },
  };
}

// ---------------------------------------------------------
// Exports
// ---------------------------------------------------------
module.exports = {
  VERSION: () => VERSION,

  // curated story loader
  loadStory: (force = false) => loadStory({ force }),

  // main handler
  handle,
};
