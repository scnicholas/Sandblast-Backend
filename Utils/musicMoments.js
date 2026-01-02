"use strict";

/**
 * Utils/musicMoments.js — v1.3 (delegates chart truth to musicKnowledge)
 *
 * What this module does now (correctly):
 *  - Uses Utils/musicKnowledge as the canonical chart source for:
 *      - "top 10 YEAR"
 *      - selecting #rank entries for story moments
 *  - Uses Data/music_story_moments_v1.json as curated story paragraphs (optional).
 *  - If curated paragraph missing, generates a controlled fallback story paragraph.
 *
 * Why:
 *  - Your real datasets are already wired into musicKnowledge (Wikipedia year-end + v2 moments DB).
 *  - Data/music_moments_v1.json is not present / not canonical, so relying on it causes “No moments loaded”.
 *
 * Supported queries:
 *  - "top 10 1988"
 *  - "story moment 1988"
 *  - "#2 moment" (uses session lastTop10/lastMusicYear if present, else asks for top10)
 *  - "#2 moment 1988"
 *  - "moment 1988" / "story 1988"
 */

const fs = require("fs");
const path = require("path");

const musicKnowledge = require("./musicKnowledge");

// ---------------------------------------------------------
// Version
// ---------------------------------------------------------
const VERSION =
  "musicMoments v1.3 (curated story moments + fallback; top10/rank sourced from musicKnowledge)";

// ---------------------------------------------------------
// Curated Story Moments file (optional)
// ---------------------------------------------------------
const STORY_FILE = "Data/music_story_moments_v1.json";

// ---------------------------------------------------------
// Cache
// ---------------------------------------------------------
let STORY_CACHE = null; // { ok, file, rows, indexByKey, indexByYearRank, mtimeMs }

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

function safeJsonRead(absPath) {
  try {
    const raw = fs.readFileSync(absPath, "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function getMtimeMs(absPath) {
  try {
    const st = fs.statSync(absPath);
    return st && st.mtimeMs ? st.mtimeMs : 0;
  } catch (_) {
    return 0;
  }
}

function normalizeArtistTitle(artist, title) {
  return { artist: cleanText(artist), title: cleanText(title) };
}

function makeStoryKey(year, artist, title) {
  return `${year}|${normKey(artist)}|${normKey(title)}`;
}

// ---------------------------------------------------------
// Curated Story Moments loader (hot reload)
// ---------------------------------------------------------
function loadStory({ force = false } = {}) {
  const file = resolveRepoPath(STORY_FILE);
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
      mtimeMs: 0,
    };
    return STORY_CACHE;
  }

  const doc = safeJsonRead(file);
  const rows = Array.isArray(doc?.moments) ? doc.moments : [];

  const indexByKey = new Map();
  const indexByYearRank = new Map();

  for (const r of rows) {
    const year = toInt(r.year);
    const rank = toInt(r.rank);
    const { artist, title } = normalizeArtistTitle(r.artist, r.title);
    const moment = cleanText(r.moment);

    if (!year || !artist || !title || !moment) continue;

    const k = makeStoryKey(year, artist, title);
    indexByKey.set(k, { year, rank: rank || null, artist, title, moment });

    if (rank && rank >= 1 && rank <= 100) {
      indexByYearRank.set(`${year}|${rank}`, { year, rank, artist, title, moment });
    }
  }

  STORY_CACHE = {
    ok: true,
    file,
    rows: rows.length,
    indexByKey,
    indexByYearRank,
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

  return null;
}

// ---------------------------------------------------------
// Controlled fallback story paragraph
// ---------------------------------------------------------
function buildFallbackStory({ year, artist, title }) {
  const y = year || "that year";
  const a = artist || "the artist";
  const t = title || "that song";

  return `In ${y}, “${t}” didn’t just get played—it got absorbed into the mood of the moment. ${a} landed a track that felt personal even in a crowded room, the one people remembered after the radio went quiet. The year moved at its own pace, and this song matched it—steady, vivid, and hard to shake. That’s why it stuck, because it sounded like what life felt like back then.`;
}

// ---------------------------------------------------------
// Intent parsing
// ---------------------------------------------------------
function parse(text) {
  const t = cleanText(text).toLowerCase();

  const yearMatch = t.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  const year = yearMatch ? toInt(yearMatch[1]) : null;

  const wantsTop10 = /top\s*10/.test(t);

  // story/moment request (top10 wins if both)
  const wantsStory = !wantsTop10 && (/\bstory\b/.test(t) || /\bmoment\b/.test(t));

  const rankMatch =
    t.match(/(?:^|\s)#\s*(\d{1,2})(?:\s|$)/) ||
    t.match(/\b(?:no\.?|number|rank)\s*(\d{1,2})\b/);

  const rank = rankMatch ? toInt(rankMatch[1]) : null;

  return { year, wantsTop10, wantsStory, rank };
}

// ---------------------------------------------------------
// Canonical Top 10 via musicKnowledge
// ---------------------------------------------------------
function mkTop10(year, session) {
  const chart = session?.activeMusicChart || "Billboard Hot 100";
  try {
    // Prefer the safe helper if present (we added it in your musicKnowledge update)
    if (typeof musicKnowledge._getTopByYear === "function") {
      const rows = musicKnowledge._getTopByYear(year, chart, 10) || [];
      return { chartUsed: chart, rows };
    }
  } catch (_) {}

  // Fallback: use handleChat(year) and parse out the list is messier; avoid.
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
  const lastTop1 = session.lastTop1 && typeof session.lastTop1 === "object" ? session.lastTop1 : null;

  if (y && lastTop10 && lastTop10.length) {
    const scoped = lastTop10.filter((x) => !x?.year || toInt(x.year) === y);

    if (rank && rank >= 1 && rank <= 10) {
      const hit = scoped.find((x) => toInt(x.rank) === rank);
      if (hit?.artist && hit?.title) {
        const at = normalizeArtistTitle(hit.artist, hit.title);
        return { year: y, rank: toInt(hit.rank) || rank, artist: at.artist, title: at.title };
      }
      // rank asked but not found
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

  // No session context; pull from musicKnowledge directly
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
  const { year, wantsTop10, wantsStory, rank } = parse(input);

  // Keep story file hot-reloaded
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
      // fall back by relaxing chart filter: try DEFAULT chart by temporarily overriding
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

  // Story / moment
  if (wantsStory) {
    // If no year given, rely on session context (or prompt for top10)
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

    const curated = lookupCuratedStory(picked);
    const storyText = curated ? curated.moment : buildFallbackStory(picked);

    return {
      ok: true,
      reply:
        `Story moment — ${picked.year}: ${picked.artist} — ${picked.title}\n\n` +
        `${storyText}\n\n` +
        `Want another one (say “#2 moment”), the Top 10, or a different year?`,
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

  return {
    ok: true,
    reply:
      `Story moment — ${picked.year}: ${picked.artist} — ${picked.title}\n\n` +
      `${storyText}\n\n` +
      `Want #2, the Top 10, or another year?`,
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
