"use strict";

/**
 * Utils/musicMoments.js — v1.7
 *
 * Canonical behavior (retained):
 *  - Chart truth (Top 10, rank picks) is delegated to Utils/musicKnowledge.
 *  - Curated story + micro moments are loaded from Data/music_moments_v1.json:
 *      - story: type === "story_moment" -> moment_text
 *      - micro: type === "micro_moment" -> moment_text
 *  - Year context bullets (1950–1989) loaded from Data/music_year_context_1950_1989.json
 *    and appended to story/micro/top10 replies.
 *
 * Fixes / upgrades in v1.7:
 *  - Hard-wires to musicKnowledge.handleChat() (v2.7x) for Top 10 + #1 to avoid stale/private APIs.
 *  - Adds deterministic, non-looping state patches (sessionPatch) for index.js to apply.
 *  - Adds parsing for: "#1", "top 10" (no year), "story moment" (no year), "micro moment" (no year).
 *  - Implements getMoment({year, chart, kind}) API for musicKnowledge to call directly (v2.71).
 *  - Fixes the "null-header" / missing artist-title situation by always anchoring to #1 from chart truth.
 *  - “yes” continues to work (pendingMicroYear), but now also clears it correctly.
 *
 * Supports:
 *  - "top 10 1988" / "top 10" (uses lastMusicYear)
 *  - "story moment 1957" / "moment 1957" / "story" (uses lastMusicYear)
 *  - "#2 moment" (requires session context or top 10 run first)
 *  - "#2 moment 1957"
 *  - "micro 1957" / "micro moment 1957" / "micro" (uses lastMusicYear)
 *  - "#1" (uses lastMusicYear)
 *  - "yes" (if session.pendingMicroYear is set by index.js)
 */

const fs = require("fs");
const path = require("path");

const musicKnowledge = require("./musicKnowledge");

// ---------------------------------------------------------
// Version
// ---------------------------------------------------------
const VERSION =
  "musicMoments v1.7 (sessionPatch + musicKnowledge.handleChat integration + getMoment API + no-loop fallbacks)";

// ---------------------------------------------------------
// Canonical moments + year context files
// ---------------------------------------------------------
const MOMENTS_FILE = "Data/music_moments_v1.json";
const YEAR_CONTEXT_FILE = "Data/music_year_context_1950_1989.json";

// ---------------------------------------------------------
// Cache
// ---------------------------------------------------------
let STORY_CACHE = null; // story_moment index
let MICRO_CACHE = null; // micro_moment index
let YEAR_CONTEXT_CACHE = null; // year->bullets map

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
  // Match your musicKnowledge behavior (process.cwd()) so Render + local are aligned.
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
    t.includes("micro-moment") ||
    t.includes("next year") ||
    t.includes("another year")
  );
}

function ensureForwardBeat(text) {
  const t = cleanText(text);
  if (!t) return t;
  if (endsWithForwardBeat(t)) return t;
  return `${t} Want the top 10, a micro-moment, or the next year?`;
}

function followupsForYear(year) {
  const y = toInt(year);
  if (!y) return ["1956", "1984", "1999"];
  return [`top 10 ${y}`, "#1", `story moment ${y}`, `micro moment ${y}`];
}

// ---------------------------------------------------------
// Year context loader (1950–1989)
// ---------------------------------------------------------
function loadYearContext({ force = false } = {}) {
  const file = resolveRepoPath(YEAR_CONTEXT_FILE);
  const mtimeMs = getMtimeMs(file);

  if (
    !force &&
    YEAR_CONTEXT_CACHE &&
    mtimeMs &&
    mtimeMs === YEAR_CONTEXT_CACHE.mtimeMs
  ) {
    return YEAR_CONTEXT_CACHE;
  }

  if (!fs.existsSync(file)) {
    YEAR_CONTEXT_CACHE = { ok: false, file, mtimeMs: 0, years: {} };
    return YEAR_CONTEXT_CACHE;
  }

  try {
    const raw = fs.readFileSync(file, "utf8");
    const doc = JSON.parse(raw);
    const years = doc?.years && typeof doc.years === "object" ? doc.years : {};
    YEAR_CONTEXT_CACHE = { ok: true, file, mtimeMs, years };
    return YEAR_CONTEXT_CACHE;
  } catch (_) {
    YEAR_CONTEXT_CACHE = { ok: false, file, mtimeMs: 0, years: {} };
    return YEAR_CONTEXT_CACHE;
  }
}

function getYearContextBullets(year, max = 3) {
  const y = toInt(year);
  if (!y) return [];
  const db = loadYearContext({ force: false });
  if (!db.ok) return [];
  const items = db.years[String(y)];
  if (!Array.isArray(items) || items.length === 0) return [];
  const n = Math.max(0, Math.min(toInt(max) || 3, 6));
  return items.slice(0, n).map((x) => cleanText(x)).filter(Boolean);
}

function formatYearContext(year) {
  const bullets = getYearContextBullets(year, 3);
  if (!bullets.length) return "";
  return `\n\nContext — ${year}:\n- ${bullets.join("\n- ")}`;
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
    if (!existing) indexByYear.set(yk, rec);
    else if (toInt(rec.rank) === 1 && toInt(existing.rank) !== 1)
      indexByYear.set(yk, rec);
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
// Curated Micro Moments loader (hot reload)
// ---------------------------------------------------------
function loadMicro({ force = false } = {}) {
  const file = resolveRepoPath(MOMENTS_FILE);
  const mtimeMs = getMtimeMs(file);

  if (!force && MICRO_CACHE && mtimeMs && mtimeMs === MICRO_CACHE.mtimeMs) {
    return MICRO_CACHE;
  }

  if (!fs.existsSync(file)) {
    MICRO_CACHE = { ok: false, file, rows: 0, byYear: new Map(), mtimeMs: 0 };
    return MICRO_CACHE;
  }

  const doc = safeLenientJsonRead(file);
  const rows = Array.isArray(doc?.moments) ? doc.moments : [];

  const byYear = new Map();
  let kept = 0;

  for (const r of rows) {
    if (!r) continue;
    if (String(r.type || "").toLowerCase() !== "micro_moment") continue;

    const year = toInt(r.year);
    const text = fixEncoding(cleanText(r.moment_text));
    if (!year || !text) continue;

    kept += 1;

    byYear.set(String(year), {
      year,
      moment: text, // micro should NOT get a forward-beat suffix
      id: cleanText(r.id) || null,
      decade: cleanText(r.decade) || null,
      tags: Array.isArray(r.tags) ? r.tags : [],
    });
  }

  MICRO_CACHE = { ok: true, file, rows: kept, byYear, mtimeMs };
  return MICRO_CACHE;
}

function lookupCuratedMicro(year) {
  const db = loadMicro({ force: false });
  if (!db.ok) return null;
  return db.byYear.get(String(year)) || null;
}

// ---------------------------------------------------------
// Controlled fallback story paragraph (only if curated missing)
// ---------------------------------------------------------
function buildFallbackStory({ year, artist, title }) {
  const y = year || "that year";
  const a = artist || "the artist";
  const t = title || "that song";

  return ensureForwardBeat(
    `In ${y}, “${t}” didn’t just get played—it became part of the year’s texture. ${a} landed a track that felt personal even in a crowded room, the one people remembered after the radio went quiet. The song matched the pace of life back then: clear, direct, and hard to shake.`
  );
}

// ---------------------------------------------------------
// Micro moment generator (only if curated micro missing)
// ---------------------------------------------------------
function buildMicroMomentFallback({ year, artist, title }) {
  const y = year || "that year";
  const a = artist || "the artist";
  const t = title || "that song";

  // 18–25 words, tight.
  return `Micro — ${y}: ${a}’s “${t}” set the tone—fast hook, clear emotion, and a chorus that stayed in your pocket all day.`;
}

// ---------------------------------------------------------
// Intent parsing
// ---------------------------------------------------------
function parse(text, session) {
  const raw = cleanText(text);
  const t = raw.toLowerCase();

  const isYes = /^(yes|yep|yeah|yup|sure|ok|okay)$/i.test(raw);

  const yearMatch = t.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  const year = yearMatch ? toInt(yearMatch[1]) : null;

  const wantsTop10 = /top\s*(10|ten)/.test(t);

  const wantsMicro =
    !wantsTop10 &&
    (/\bmicro\b/.test(t) ||
      /\bmicro\s*moment\b/.test(t) ||
      (isYes && toInt(session?.pendingMicroYear)));

  const wantsStory =
    !wantsTop10 && !wantsMicro && (/\bstory\b/.test(t) || /\bmoment\b/.test(t));

  const wantsNumber1 = !wantsTop10 && !wantsMicro && !wantsStory && /^(#1|1|number 1)$/i.test(raw);

  const rankMatch =
    t.match(/(?:^|\s)#\s*(\d{1,2})(?:\s|$)/) ||
    t.match(/\b(?:no\.?|number|rank)\s*(\d{1,2})\b/);

  const rank = rankMatch ? toInt(rankMatch[1]) : null;

  const microYear =
    isYes && toInt(session?.pendingMicroYear) ? toInt(session.pendingMicroYear) : null;

  return { year, wantsTop10, wantsStory, wantsMicro, wantsNumber1, microYear, rank, raw };
}

// ---------------------------------------------------------
// Canonical Top 10/#1 via musicKnowledge.handleChat()
// ---------------------------------------------------------
function mkAsk(message, session) {
  const res = musicKnowledge.handleChat({ text: message, session: session || {} });
  return res && typeof res === "object" ? res : null;
}

function mkTop10(year, session) {
  const res = mkAsk(`top 10 ${year}`, session);
  return res;
}

function mkNumber1(session) {
  const res = mkAsk(`#1`, session);
  return res;
}

// ---------------------------------------------------------
// Pick a song for a story moment (always anchor to chart truth)
// ---------------------------------------------------------
function pickSong(session, year, rank) {
  session = session || {};
  const y = year || toInt(session.lastMusicYear) || null;

  // If user asked for a rank, ensure we have Top 10 (for accuracy)
  if (y && rank && rank >= 1 && rank <= 10) {
    const topRes = mkTop10(y, session);
    const reply = cleanText(topRes?.reply || "");
    // We don't parse the text list here; we rely on curated story lookup by year+rank if present,
    // otherwise we fall back to #1 (deterministic) rather than fabricate headers.
    return { year: y, rank, artist: null, title: null, chart: topRes?.sessionPatch?.activeMusicChart || session.activeMusicChart };
  }

  // Default: #1 anchor
  const patchBase = { ...session, lastMusicYear: y || session.lastMusicYear };
  const n1 = mkNumber1(patchBase);
  const line = cleanText(n1?.reply || "");
  // line format in musicKnowledge v2.7x: "#1 — Artist — Title"
  const m = line.match(/^#1\s+—\s+(.+?)\s+—\s+(.+?)\s*$/);
  if (m) {
    const at = normalizeArtistTitle(m[1], m[2]);
    return {
      year: y || toInt(n1?.sessionPatch?.lastMusicYear),
      rank: 1,
      artist: at.artist,
      title: at.title,
      chart: normalizeArtistTitle ? (n1?.sessionPatch?.activeMusicChart || session.activeMusicChart) : session.activeMusicChart,
    };
  }

  return { year: y, rank: rank || 1, artist: null, title: null, chart: session.activeMusicChart };
}

// ---------------------------------------------------------
// Session patching (canonical; index.js should apply this)
// ---------------------------------------------------------
function sessionPatchBase(session, extra = {}) {
  const s = session || {};
  const patch = {
    activeMusicChart: s.activeMusicChart || "Billboard Hot 100",
    lastMusicYear: s.lastMusicYear ?? null,
    lastMusicChart: s.lastMusicChart || s.activeMusicChart || "Billboard Hot 100",
    pendingMicroYear: s.pendingMicroYear ?? null,
    ...extra,
  };
  if (!patch.lastMusicYear) delete patch.lastMusicYear;
  if (!patch.pendingMicroYear) delete patch.pendingMicroYear;
  if (!patch.lastMusicChart) delete patch.lastMusicChart;
  return patch;
}

// ---------------------------------------------------------
// getMoment API (for musicKnowledge v2.71)
// ---------------------------------------------------------
function getMoment({ year, chart, kind }) {
  const y = toInt(year);
  const k = String(kind || "").toLowerCase();
  if (!y) return null;

  // Hot reload caches
  loadStory({ force: false });
  loadMicro({ force: false });
  loadYearContext({ force: false });

  if (k === "micro") {
    const curatedMicro = lookupCuratedMicro(y);
    if (curatedMicro?.moment) {
      return `Micro — ${y}:\n${curatedMicro.moment}${formatYearContext(y)}`;
    }

    // Fallback: just use chart truth #1 if available through musicKnowledge; otherwise neutral.
    const picked = pickSong({ lastMusicYear: y, activeMusicChart: chart }, y, 1);
    if (!picked.artist || !picked.title) return null;

    return `${buildMicroMomentFallback(picked)}${formatYearContext(y)}`;
  }

  // story
  const curated = lookupCuratedStory({ year: y });
  if (curated?.moment) {
    return `Story moment — ${y}: ${curated.artist} — ${curated.title}\n\n${curated.moment}${formatYearContext(y)}`;
  }

  const picked = pickSong({ lastMusicYear: y, activeMusicChart: chart }, y, 1);
  if (!picked.artist || !picked.title) return null;

  return `Story moment — ${y}: ${picked.artist} — ${picked.title}\n\n${buildFallbackStory(picked)}${formatYearContext(y)}`;
}

// ---------------------------------------------------------
// Main handler
// ---------------------------------------------------------
function handle(text, session = {}) {
  const input = String(text || "");
  const { year, wantsTop10, wantsStory, wantsMicro, wantsNumber1, microYear, rank, raw } = parse(
    input,
    session
  );

  // Hot reload caches
  loadStory({ force: false });
  loadMicro({ force: false });
  loadYearContext({ force: false });

  // Top 10
  if (wantsTop10) {
    const y = year || toInt(session.lastMusicYear) || null;
    if (!y) {
      return {
        ok: true,
        reply: `Say “top 10 1988” (pick a year 1950–2024) and I’ll pull the list instantly.`,
        followUp: { kind: "ask_year" },
        sessionPatch: sessionPatchBase(session),
      };
    }

    const res = mkTop10(y, session);
    const reply = cleanText(res?.reply || "");

    const patch = sessionPatchBase(session, {
      ...(res?.sessionPatch || {}),
      lastMusicYear: y,
      pendingMicroYear: null,
    });

    if (!reply) {
      return {
        ok: true,
        reply: `No chart rows found for ${y} on the available sources in this build yet.${formatYearContext(
          y
        )}`,
        followUp: { kind: "offer_next", year: y },
        sessionPatch: patch,
      };
    }

    return {
      ok: true,
      reply: reply + formatYearContext(y),
      followUp: { kind: "offer_next", year: y },
      sessionPatch: patch,
    };
  }

  // #1
  if (wantsNumber1) {
    const y = toInt(session.lastMusicYear);
    if (!y) {
      return {
        ok: true,
        reply: `Tell me a year first (example: “top 10 1988” or just “1988”), then I’ll give you #1.`,
        followUp: { kind: "ask_year" },
        sessionPatch: sessionPatchBase(session),
      };
    }

    const res = mkNumber1(session);
    const reply = cleanText(res?.reply || "");
    const patch = sessionPatchBase(session, {
      ...(res?.sessionPatch || {}),
      pendingMicroYear: null,
    });

    return {
      ok: true,
      reply: reply ? `${reply}${formatYearContext(y)}` : `I can’t pull #1 for ${y} in this build yet.`,
      followUp: { kind: "offer_next", year: y },
      sessionPatch: patch,
    };
  }

  // Micro moment
  if (wantsMicro) {
    const y = microYear || year || toInt(session.lastMusicYear) || null;
    if (!y) {
      return {
        ok: true,
        reply: `Tell me a year (1950–2024) for a micro-moment — for example: “micro 1957”.`,
        followUp: { kind: "ask_year" },
        sessionPatch: sessionPatchBase(session),
      };
    }

    // Prefer curated micro
    const curatedMicro = lookupCuratedMicro(y);
    if (curatedMicro?.moment) {
      const patch = sessionPatchBase(session, {
        lastMusicYear: y,
        pendingMicroYear: null,
      });
      return {
        ok: true,
        reply: `Micro — ${y}:\n${curatedMicro.moment}` + formatYearContext(y),
        followUp: { kind: "offer_next", year: y },
        sessionPatch: patch,
      };
    }

    // Fallback: anchor to #1 via musicKnowledge
    const picked = pickSong(session, y, 1);
    if (!picked.artist || !picked.title) {
      return {
        ok: true,
        reply: `Quick setup: say “top 10 ${y}” first, then I’ll deliver a clean micro-moment instantly.`,
        followUp: { kind: "need_top10", year: y },
        sessionPatch: sessionPatchBase(session, { pendingMicroYear: y }),
      };
    }

    return {
      ok: true,
      reply: buildMicroMomentFallback(picked) + formatYearContext(y),
      followUp: { kind: "offer_next", year: y },
      sessionPatch: sessionPatchBase(session, {
        lastMusicYear: y,
        pendingMicroYear: null,
      }),
    };
  }

  // Story / moment
  if (wantsStory) {
    const y = year || toInt(session.lastMusicYear) || null;
    if (!y) {
      return {
        ok: true,
        reply: `Give me a year (1950–2024) or say “top 10 1988,” then tell me “story moment” or “#2 moment.”`,
        followUp: { kind: "ask_year_or_top10" },
        sessionPatch: sessionPatchBase(session),
      };
    }

    // If user requested a rank-specific moment, try curated year+rank first.
    if (rank && rank >= 1 && rank <= 10) {
      const curatedRank = lookupCuratedStory({ year: y, rank });
      if (curatedRank?.moment) {
        return {
          ok: true,
          reply:
            `Story moment — ${y}: ${curatedRank.artist} — ${curatedRank.title}\n\n` +
            `${curatedRank.moment}` +
            formatYearContext(y),
          followUp: { kind: "offer_next", year: y },
          sessionPatch: sessionPatchBase(session, { lastMusicYear: y, pendingMicroYear: null }),
        };
      }

      // If not curated, demand Top 10 first so we don't invent headers
      return {
        ok: true,
        reply:
          `I can do that story moment—quick setup first.\n\n` +
          `Say “top 10 ${y}” so I can lock the list, then say “#${rank} moment”.`,
        followUp: { kind: "need_top10", year: y, rank },
        sessionPatch: sessionPatchBase(session, { lastMusicYear: y, pendingMicroYear: null }),
      };
    }

    // Curated by year default (prefers #1)
    const curated = lookupCuratedStory({ year: y });
    if (curated?.moment) {
      return {
        ok: true,
        reply:
          `Story moment — ${y}: ${curated.artist} — ${curated.title}\n\n` +
          `${curated.moment}` +
          formatYearContext(y),
        followUp: { kind: "offer_next", year: y },
        sessionPatch: sessionPatchBase(session, { lastMusicYear: y, pendingMicroYear: null }),
      };
    }

    // Fallback: anchor to #1 for clean header
    const picked = pickSong(session, y, 1);
    if (!picked.artist || !picked.title) {
      return {
        ok: true,
        reply: `Try “top 10 ${y}” first—then I’ll give you a story moment that actually lands.`,
        followUp: { kind: "need_top10", year: y },
        sessionPatch: sessionPatchBase(session, { lastMusicYear: y, pendingMicroYear: null }),
      };
    }

    const storyText = buildFallbackStory(picked);
    const addTail = endsWithForwardBeat(storyText)
      ? ""
      : `\n\nWant #2, the Top 10, or another year?`;

    return {
      ok: true,
      reply:
        `Story moment — ${picked.year}: ${picked.artist} — ${picked.title}\n\n` +
        `${storyText}${addTail}` +
        formatYearContext(picked.year),
      followUp: { kind: "offer_next", year: picked.year },
      sessionPatch: sessionPatchBase(session, { lastMusicYear: picked.year, pendingMicroYear: null }),
    };
  }

  // Default: year present, treat as story moment for the year
  if (year) {
    const curated = lookupCuratedStory({ year });
    if (curated?.moment) {
      return {
        ok: true,
        reply:
          `Story moment — ${year}: ${curated.artist} — ${curated.title}\n\n` +
          `${curated.moment}` +
          formatYearContext(year),
        followUp: { kind: "offer_next", year },
        sessionPatch: sessionPatchBase(session, { lastMusicYear: year, pendingMicroYear: null }),
      };
    }

    const picked = pickSong(session, year, 1);
    if (!picked.artist || !picked.title) {
      return {
        ok: true,
        reply: `Try “top 10 ${year}” first—then I’ll give you a story moment that actually lands.`,
        followUp: { kind: "need_top10", year },
        sessionPatch: sessionPatchBase(session, { lastMusicYear: year, pendingMicroYear: null }),
      };
    }

    return {
      ok: true,
      reply:
        `Story moment — ${picked.year}: ${picked.artist} — ${picked.title}\n\n` +
        `${buildFallbackStory(picked)}` +
        formatYearContext(picked.year),
      followUp: { kind: "offer_next", year: picked.year },
      sessionPatch: sessionPatchBase(session, { lastMusicYear: picked.year, pendingMicroYear: null }),
    };
  }

  // Absolute default: nudge
  return {
    ok: true,
    reply: `Give me a year (1950–2024) and I’ll deliver a story moment — or say “top 10 1988”.`,
    followUp: { kind: "ask_year" },
    sessionPatch: sessionPatchBase(session),
  };
}

// ---------------------------------------------------------
// Exports
// ---------------------------------------------------------
module.exports = {
  VERSION: () => VERSION,

  // loaders
  loadStory: (force = false) => loadStory({ force }),
  loadMicro: (force = false) => loadMicro({ force }),
  loadYearContext: (force = false) => loadYearContext({ force }),

  // direct API for musicKnowledge to call
  getMoment,

  // handler
  handle,
};
