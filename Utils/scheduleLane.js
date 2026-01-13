"use strict";

/**
 * Utils/scheduleLane.js
 *
 * Purpose:
 *  - Timezone-aware programming schedule for Roku/Sandblast.
 *  - Converts ET-authored schedule windows to user local time (DST-safe).
 *
 * Inputs:
 *  - Data/roku_programming_v1.json
 *  - Utils/timezoneResolver.js
 */

const fs = require("fs");
const path = require("path");
const { resolveTimezone } = require("./timezoneResolver");

function cleanText(s) {
  return String(s || "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
}

const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "Data", "roku_programming_v1.json");

let CACHE = null;
function loadSchedule() {
  if (CACHE) return CACHE;
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  CACHE = JSON.parse(raw);
  return CACHE;
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function nowUtcMs() {
  return Date.now();
}

// Format time in a timezone
function fmtTime(msUtc, tz) {
  const d = new Date(msUtc);
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return f.format(d);
}

function fmtWeekday(msUtc, tz) {
  const d = new Date(msUtc);
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short" });
  return f.format(d).toUpperCase().slice(0, 3); // MON/TUE...
}

/**
 * Create a UTC timestamp for "this week's <DAY> at <HH:MM> in authoring TZ"
 * without needing external libraries.
 *
 * Strategy:
 *  - We find the current date in authoring TZ, then backtrack to Sunday,
 *    then add day offset and local time.
 *  - We then compute the equivalent UTC ms by constructing a Date from parts
 *    using Intl offsets (DST-safe).
 */
function getUtcForAuthoringLocal(authorTz, targetDow, hhmm, refUtcMs) {
  // Get "today" parts in authorTz
  const ref = new Date(refUtcMs);
  const parts = partsInTz(ref, authorTz);

  // parts: { year, month, day, weekdayIndex }
  const sunday = addDaysYMD(parts.year, parts.month, parts.day, -parts.weekdayIndex);

  const dayIndex = DOW.indexOf(targetDow);
  const target = addDaysYMD(sunday.year, sunday.month, sunday.day, dayIndex);

  const [hh, mm] = hhmm.split(":").map((x) => Number(x));
  const y = target.year, m = target.month, d = target.day;

  return zonedTimeToUtcMs({ year: y, month: m, day: d, hour: hh, minute: mm }, authorTz);
}

function partsInTz(dateObj, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const partMap = {};
  for (const p of fmt.formatToParts(dateObj)) {
    if (p.type !== "literal") partMap[p.type] = p.value;
  }

  const weekday = String(partMap.weekday || "").toUpperCase().slice(0, 3);
  const weekdayIndex = Math.max(0, DOW.indexOf(weekday));

  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day),
    weekdayIndex,
  };
}

// Add days to a Y-M-D (UTC-safe arithmetic by using Date.UTC)
function addDaysYMD(year, month, day, deltaDays) {
  const ms = Date.UTC(year, month - 1, day) + deltaDays * 86400000;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Convert "zoned local time" -> UTC ms using Intl.
 * We:
 *  1) Create a UTC guess Date from components.
 *  2) Determine what time that guess represents in the target tz.
 *  3) Compute offset and correct.
 */
function zonedTimeToUtcMs(parts, tz) {
  const guessUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  const guessDate = new Date(guessUtc);

  // What are the parts in the timezone at this UTC instant?
  const got = partsHMInTz(guessDate, tz);

  // Compute minute difference between desired local and got local, then correct.
  const desiredMin = parts.hour * 60 + parts.minute;
  const gotMin = got.hour * 60 + got.minute;
  let diff = desiredMin - gotMin;

  // Normalize across day boundaries
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;

  return guessUtc + diff * 60000;
}

function partsHMInTz(dateObj, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const partMap = {};
  for (const p of fmt.formatToParts(dateObj)) {
    if (p.type !== "literal") partMap[p.type] = p.value;
  }

  return { hour: Number(partMap.hour), minute: Number(partMap.minute) };
}

function isScheduleQuestion(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;

  return (
    /\b(schedule|programming|what's playing|whats playing|playing now|on now|airing|what time)\b/.test(t) ||
    /\b(roku)\b/.test(t)
  );
}

function extractShowQuery(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

  // “what time does gospel sunday play…”
  const m =
    t.match(/\bwhat time does ([a-z0-9' -]{3,60}) (play|air|start)\b/i) ||
    t.match(/\bwhen does ([a-z0-9' -]{3,60}) (play|air|start)\b/i);

  if (m && m[1]) return cleanText(m[1]);

  // “gospel sunday london”
  if (/\bgospel sunday\b/.test(t)) return "gospel sunday";

  return null;
}

function bestShowMatch(shows, q) {
  if (!q) return null;
  const qq = cleanText(q).toLowerCase();

  // exact id/title contains
  let best = null;
  let bestScore = 0;

  for (const s of shows) {
    const title = cleanText(s.title).toLowerCase();
    const id = cleanText(s.id).toLowerCase();

    let score = 0;
    if (id === qq) score += 10;
    if (title === qq) score += 10;
    if (title.includes(qq)) score += 6;
    if (qq.includes(title)) score += 4;
    if (id.includes(qq)) score += 3;

    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore > 0 ? best : null;
}

function buildNextOccurrence(authorTz, userTz, show, refUtcMs) {
  // find the soonest start among the show.days this week or next week
  const starts = [];
  for (const dow of show.days || []) {
    const startUtc = getUtcForAuthoringLocal(authorTz, dow, show.start, refUtcMs);
    starts.push(startUtc);
  }

  // choose next start >= now; else choose earliest next week (add 7 days)
  const now = refUtcMs;
  let next = starts
    .map((x) => (x >= now ? x : x + 7 * 86400000))
    .sort((a, b) => a - b)[0];

  const end = next + Number(show.durationMin || 0) * 60000;

  return {
    startUtc: next,
    endUtc: end,
    userStart: fmtTime(next, userTz),
    userEnd: fmtTime(end, userTz),
    userDow: fmtWeekday(next, userTz),
  };
}

function buildNowPlaying(authorTz, userTz, shows, refUtcMs) {
  const now = refUtcMs;
  const hits = [];

  for (const show of shows) {
    const occ = buildNextOccurrence(authorTz, userTz, show, now - 3 * 86400000); // search window
    // We need to check current-week occurrences too; easiest: test both this-week and next-week starts
    // by building occurrences around "now" using each day candidate.
    for (const dow of show.days || []) {
      const sUtc = getUtcForAuthoringLocal(authorTz, dow, show.start, now);
      const eUtc = sUtc + Number(show.durationMin || 0) * 60000;

      const inWindow = now >= sUtc && now < eUtc;
      if (inWindow) {
        hits.push({
          show,
          startUtc: sUtc,
          endUtc: eUtc,
          userStart: fmtTime(sUtc, userTz),
          userEnd: fmtTime(eUtc, userTz),
          userDow: fmtWeekday(sUtc, userTz),
        });
      }
    }
  }

  // Sort by start
  hits.sort((a, b) => a.startUtc - b.startUtc);
  return hits.slice(0, 2);
}

function handleChat({ text, session }) {
  const schedule = loadSchedule();
  const authorTz = cleanText(schedule.authoringTimezone || "America/Toronto");

  const resolved = resolveTimezone(text, session);
  const userTz = resolved.tz || "America/Toronto";
  const userCity = resolved.city || (session && session.userCity) || null;

  if (session) {
    session.userTz = userTz;
    if (userCity) session.userCity = userCity;
  }

  const shows = Array.isArray(schedule.shows) ? schedule.shows : [];
  const now = nowUtcMs();

  const q = extractShowQuery(text);
  const t = cleanText(text).toLowerCase();

  // "what's playing now"
  if (/\b(playing now|on now|what's playing|whats playing)\b/.test(t)) {
    const hits = buildNowPlaying(authorTz, userTz, shows, now);

    if (hits.length === 0) {
      return {
        reply:
          `Nothing is airing at this exact moment in ${userCity || userTz}. ` +
          `Say a show name (e.g., “Gospel Sunday”) or “Show me the schedule”.`,
        followUps: [
          { label: "Show me the schedule", send: "Show me the schedule" },
          { label: "Gospel Sunday", send: "What time does Gospel Sunday play in London?" },
          { label: "Back to music", send: "Back to music" },
        ],
        sessionPatch: { lane: "schedule" },
      };
    }

    const lines = hits.map((h) => {
      return `• ${h.show.title} — ${h.userDow} ${h.userStart}–${h.userEnd} (${userCity || userTz})`;
    });

    return {
      reply:
        `Here’s what’s airing now (converted to ${userCity || userTz}):\n` +
        lines.join("\n") +
        `\n\nAsk: “What time does <show> play in <city>?”`,
      followUps: [
        { label: "Show me the schedule", send: "Show me the schedule" },
        { label: "What time in London?", send: "What time does Gospel Sunday play in London?" },
        { label: "Back to music", send: "Back to music" },
      ],
      sessionPatch: { lane: "schedule" },
    };
  }

  // "show me the schedule"
  if (/\b(show me the schedule|full schedule|the schedule|programming)\b/.test(t)) {
    const items = [];
    for (const s of shows) {
      const occ = buildNextOccurrence(authorTz, userTz, s, now);
      items.push(`• ${s.title} — next: ${occ.userDow} ${occ.userStart}–${occ.userEnd} (${userCity || userTz})`);
    }

    return {
      reply:
        `Schedule (next occurrences; converted to ${userCity || userTz}):\n` +
        items.join("\n") +
        `\n\nAsk about a show by name, or say “playing now”.`,
      followUps: [
        { label: "Playing now", send: "What's playing now?" },
        { label: "Gospel Sunday (London)", send: "What time does Gospel Sunday play in London?" },
        { label: "Back to music", send: "Back to music" },
      ],
      sessionPatch: { lane: "schedule" },
    };
  }

  // Query a show
  if (q) {
    const show = bestShowMatch(shows, q);
    if (!show) {
      return {
        reply:
          `I didn’t find that show in the current schedule. Say “Show me the schedule” or try another name.`,
        followUps: [
          { label: "Show me the schedule", send: "Show me the schedule" },
          { label: "Playing now", send: "What's playing now?" },
          { label: "Back to music", send: "Back to music" },
        ],
        sessionPatch: { lane: "schedule" },
      };
    }

    const occ = buildNextOccurrence(authorTz, userTz, show, now);

    return {
      reply:
        `${show.title} plays next at ${occ.userDow} ${occ.userStart}–${occ.userEnd} ` +
        `(${userCity || userTz}).`,
      followUps: [
        { label: "Playing now", send: "What's playing now?" },
        { label: "Show me the schedule", send: "Show me the schedule" },
        { label: "Back to music", send: "Back to music" },
      ],
      sessionPatch: { lane: "schedule" },
    };
  }

  // Default schedule lane help
  return {
    reply:
      `Schedule Lane. Ask:\n` +
      `• “What time does Gospel Sunday play in London?”\n` +
      `• “What’s playing now?”\n` +
      `• “Show me the schedule”`,
    followUps: [
      { label: "Show me the schedule", send: "Show me the schedule" },
      { label: "Playing now", send: "What's playing now?" },
      { label: "Back to music", send: "Back to music" },
    ],
    sessionPatch: { lane: "schedule" },
  };
}

module.exports = {
  isScheduleQuestion,
  handleChat,
};
