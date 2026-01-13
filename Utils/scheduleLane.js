"use strict";

/**
<<<<<<< HEAD
<<<<<<< HEAD
 * Utils/scheduleLane.js (v1.1)
 *
 * Adds:
 *  - Device timezone aware (session._lastDeviceTz)
 *  - "for me" (local time) support via timezoneResolver explicitTz
 *  - "Now / Next / Later" summary
 *  - Explicit ET time conversion: "Convert 8pm ET to London"
=======
 * Utils/scheduleLane.js
 *
 * Purpose:
 *  - Timezone-aware programming schedule for Roku/Sandblast.
 *  - Converts ET-authored schedule windows to user local time (DST-safe).
 *
 * Inputs:
 *  - Data/roku_programming_v1.json
 *  - Utils/timezoneResolver.js
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
 * Utils/scheduleLane.js (v1.1)
 *
 * Adds:
 *  - Device timezone aware (session._lastDeviceTz)
 *  - "for me" (local time) support via timezoneResolver explicitTz
 *  - "Now / Next / Later" summary
 *  - Explicit ET time conversion: "Convert 8pm ET to London"
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
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

<<<<<<< HEAD
<<<<<<< HEAD
function fmtTime(msUtc, tz) {
  const d = new Date(msUtc);
  return new Intl.DateTimeFormat("en-CA", {
=======
function nowUtcMs() {
  return Date.now();
}

// Format time in a timezone
function fmtTime(msUtc, tz) {
  const d = new Date(msUtc);
  const f = new Intl.DateTimeFormat("en-CA", {
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
function fmtTime(msUtc, tz) {
  const d = new Date(msUtc);
  return new Intl.DateTimeFormat("en-CA", {
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
<<<<<<< HEAD
<<<<<<< HEAD
  }).format(d);
=======
  });
  return f.format(d);
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
  }).format(d);
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
}

function fmtWeekday(msUtc, tz) {
  const d = new Date(msUtc);
<<<<<<< HEAD
<<<<<<< HEAD
  const w = new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short" }).format(d);
  return w.toUpperCase().slice(0, 3);
=======
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
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
  const w = new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short" }).format(d);
  return w.toUpperCase().slice(0, 3);
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
}

function partsInTz(dateObj, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

<<<<<<< HEAD
<<<<<<< HEAD
  const map = {};
  for (const p of fmt.formatToParts(dateObj)) if (p.type !== "literal") map[p.type] = p.value;
  const weekday = String(map.weekday || "").toUpperCase().slice(0, 3);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekdayIndex: Math.max(0, DOW.indexOf(weekday)),
  };
}

=======
  const partMap = {};
  for (const p of fmt.formatToParts(dateObj)) {
    if (p.type !== "literal") partMap[p.type] = p.value;
  }

  const weekday = String(partMap.weekday || "").toUpperCase().slice(0, 3);
  const weekdayIndex = Math.max(0, DOW.indexOf(weekday));

=======
  const map = {};
  for (const p of fmt.formatToParts(dateObj)) if (p.type !== "literal") map[p.type] = p.value;
  const weekday = String(map.weekday || "").toUpperCase().slice(0, 3);
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekdayIndex: Math.max(0, DOW.indexOf(weekday)),
  };
}

<<<<<<< HEAD
// Add days to a Y-M-D (UTC-safe arithmetic by using Date.UTC)
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
function addDaysYMD(year, month, day, deltaDays) {
  const ms = Date.UTC(year, month - 1, day) + deltaDays * 86400000;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

<<<<<<< HEAD
<<<<<<< HEAD
=======
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

>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
function partsHMInTz(dateObj, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
<<<<<<< HEAD
<<<<<<< HEAD
  const map = {};
  for (const p of fmt.formatToParts(dateObj)) if (p.type !== "literal") map[p.type] = p.value;
  return { hour: Number(map.hour), minute: Number(map.minute) };
}

function zonedTimeToUtcMs(parts, tz) {
  const guessUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  const got = partsHMInTz(new Date(guessUtc), tz);
  const desiredMin = parts.hour * 60 + parts.minute;
  const gotMin = got.hour * 60 + got.minute;

  let diff = desiredMin - gotMin;
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;

  return guessUtc + diff * 60000;
}

function getUtcForAuthoringLocal(authorTz, targetDow, hhmm, refUtcMs) {
  const ref = new Date(refUtcMs);
  const parts = partsInTz(ref, authorTz);

  const sunday = addDaysYMD(parts.year, parts.month, parts.day, -parts.weekdayIndex);
  const dayIndex = DOW.indexOf(targetDow);
  const target = addDaysYMD(sunday.year, sunday.month, sunday.day, dayIndex);

  const [hh, mm] = hhmm.split(":").map((x) => Number(x));
  return zonedTimeToUtcMs(
    { year: target.year, month: target.month, day: target.day, hour: hh, minute: mm },
    authorTz
  );
}

=======

  const partMap = {};
  for (const p of fmt.formatToParts(dateObj)) {
    if (p.type !== "literal") partMap[p.type] = p.value;
  }

  return { hour: Number(partMap.hour), minute: Number(partMap.minute) };
=======
  const map = {};
  for (const p of fmt.formatToParts(dateObj)) if (p.type !== "literal") map[p.type] = p.value;
  return { hour: Number(map.hour), minute: Number(map.minute) };
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
}

function zonedTimeToUtcMs(parts, tz) {
  const guessUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  const got = partsHMInTz(new Date(guessUtc), tz);
  const desiredMin = parts.hour * 60 + parts.minute;
  const gotMin = got.hour * 60 + got.minute;

  let diff = desiredMin - gotMin;
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;

  return guessUtc + diff * 60000;
}

function getUtcForAuthoringLocal(authorTz, targetDow, hhmm, refUtcMs) {
  const ref = new Date(refUtcMs);
  const parts = partsInTz(ref, authorTz);

  const sunday = addDaysYMD(parts.year, parts.month, parts.day, -parts.weekdayIndex);
  const dayIndex = DOW.indexOf(targetDow);
  const target = addDaysYMD(sunday.year, sunday.month, sunday.day, dayIndex);

  const [hh, mm] = hhmm.split(":").map((x) => Number(x));
  return zonedTimeToUtcMs(
    { year: target.year, month: target.month, day: target.day, hour: hh, minute: mm },
    authorTz
  );
}

<<<<<<< HEAD
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

>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
function bestShowMatch(shows, q) {
  if (!q) return null;
  const qq = cleanText(q).toLowerCase();

<<<<<<< HEAD
<<<<<<< HEAD
=======
  // exact id/title contains
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
  let best = null;
  let bestScore = 0;

  for (const s of shows) {
    const title = cleanText(s.title).toLowerCase();
    const id = cleanText(s.id).toLowerCase();

    let score = 0;
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
    if (id === qq) score += 20;
    if (title === qq) score += 20;
    if (title.includes(qq)) score += 10;
    if (qq.includes(title)) score += 6;

    // token overlap
    const a = new Set(title.split(" ").filter(Boolean));
    const b = new Set(qq.split(" ").filter(Boolean));
    let ov = 0;
    for (const w of b) if (a.has(w)) ov++;
    score += Math.min(8, ov);
<<<<<<< HEAD
=======
    if (id === qq) score += 10;
    if (title === qq) score += 10;
    if (title.includes(qq)) score += 6;
    if (qq.includes(title)) score += 4;
    if (id.includes(qq)) score += 3;
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)

    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
<<<<<<< HEAD
<<<<<<< HEAD
  return bestScore >= 6 ? best : null;
}

function nextOccurrence(authorTz, userTz, show, nowUtc) {
  const starts = [];
  for (const dow of show.days || []) {
    const s = getUtcForAuthoringLocal(authorTz, dow, show.start, nowUtc);
    starts.push(s);
  }
  const now = nowUtc;
  const next = starts.map((x) => (x >= now ? x : x + 7 * 86400000)).sort((a, b) => a - b)[0];
=======
  return bestScore > 0 ? best : null;
=======
  return bestScore >= 6 ? best : null;
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
}

function nextOccurrence(authorTz, userTz, show, nowUtc) {
  const starts = [];
  for (const dow of show.days || []) {
    const s = getUtcForAuthoringLocal(authorTz, dow, show.start, nowUtc);
    starts.push(s);
  }
<<<<<<< HEAD

  // choose next start >= now; else choose earliest next week (add 7 days)
  const now = refUtcMs;
  let next = starts
    .map((x) => (x >= now ? x : x + 7 * 86400000))
    .sort((a, b) => a - b)[0];

>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
  const now = nowUtc;
  const next = starts.map((x) => (x >= now ? x : x + 7 * 86400000)).sort((a, b) => a - b)[0];
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
  const end = next + Number(show.durationMin || 0) * 60000;

  return {
    startUtc: next,
    endUtc: end,
<<<<<<< HEAD
<<<<<<< HEAD
    userDow: fmtWeekday(next, userTz),
    userStart: fmtTime(next, userTz),
    userEnd: fmtTime(end, userTz),
  };
}

function nowPlaying(authorTz, userTz, shows, nowUtc) {
  const now = nowUtc;
  const airing = [];

  for (const show of shows) {
    for (const dow of show.days || []) {
      const sUtc = getUtcForAuthoringLocal(authorTz, dow, show.start, nowUtc);
      const eUtc = sUtc + Number(show.durationMin || 0) * 60000;
      if (now >= sUtc && now < eUtc) {
        airing.push({
          show,
          startUtc: sUtc,
          endUtc: eUtc,
          userDow: fmtWeekday(sUtc, userTz),
          userStart: fmtTime(sUtc, userTz),
          userEnd: fmtTime(eUtc, userTz),
=======
=======
    userDow: fmtWeekday(next, userTz),
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
    userStart: fmtTime(next, userTz),
    userEnd: fmtTime(end, userTz),
  };
}

function nowPlaying(authorTz, userTz, shows, nowUtc) {
  const now = nowUtc;
  const airing = [];

  for (const show of shows) {
    for (const dow of show.days || []) {
      const sUtc = getUtcForAuthoringLocal(authorTz, dow, show.start, nowUtc);
      const eUtc = sUtc + Number(show.durationMin || 0) * 60000;
      if (now >= sUtc && now < eUtc) {
        airing.push({
          show,
          startUtc: sUtc,
          endUtc: eUtc,
          userDow: fmtWeekday(sUtc, userTz),
          userStart: fmtTime(sUtc, userTz),
          userEnd: fmtTime(eUtc, userTz),
<<<<<<< HEAD
          userDow: fmtWeekday(sUtc, userTz),
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
        });
      }
    }
  }

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
  airing.sort((a, b) => a.startUtc - b.startUtc);
  return airing.slice(0, 2);
}

function upcomingSorted(authorTz, userTz, shows, nowUtc) {
  const list = [];
  for (const show of shows) {
    const occ = nextOccurrence(authorTz, userTz, show, nowUtc);
    list.push({ show, occ });
  }
  list.sort((a, b) => a.occ.startUtc - b.occ.startUtc);
  return list;
}

// Parse "convert 8pm et to london"
function parseConvertEt(text) {
  const t = cleanText(text).toLowerCase();
  const m = t.match(/\b(convert|what is)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(et|est|edt)\s+(to|in)\s+(.+)\b/);
  if (!m) return null;

  const hourRaw = Number(m[2]);
  const minRaw = m[3] ? Number(m[3]) : 0;
  const ampm = m[4] ? String(m[4]).toLowerCase() : null;
  const place = cleanText(m[7] || "");

  let hour = hourRaw;
  if (ampm) {
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
  }

  if (hour < 0 || hour > 23 || minRaw < 0 || minRaw > 59) return null;

  return { hour, minute: minRaw, place };
}

function buildEtConversion(authorTz, userTz, hour, minute) {
  // Use "today" in authorTz, at the requested time, then format in userTz.
  const now = Date.now();
  const parts = partsInTz(new Date(now), authorTz);
  const utc = zonedTimeToUtcMs(
    { year: parts.year, month: parts.month, day: parts.day, hour, minute },
    authorTz
  );
  return {
    authorLabel: fmtTime(utc, authorTz),
    userLabel: fmtTime(utc, userTz),
    userDow: fmtWeekday(utc, userTz),
  };
}

function isScheduleQuestion(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;

  return (
    /\b(schedule|programming|what's playing|whats playing|playing now|on now|airing|what time|when does)\b/.test(t) ||
    /\b(convert)\b/.test(t) ||
    /\b(roku)\b/.test(t)
  );
}

function extractShowQuery(text) {
  const t = cleanText(text);
  const low = t.toLowerCase();

  const m =
    low.match(/\bwhat time does ([a-z0-9' -]{3,60}) (play|air|start)\b/i) ||
    low.match(/\bwhen does ([a-z0-9' -]{3,60}) (play|air|start)\b/i);

  if (m && m[1]) return cleanText(m[1]);

  // If user says just a show name in schedule lane, treat it as query.
  if (/^[a-z0-9' -]{3,60}$/i.test(t) && !/\b(schedule|programming|playing|convert)\b/i.test(low)) {
    return t;
  }

  return null;
<<<<<<< HEAD
=======
  // Sort by start
  hits.sort((a, b) => a.startUtc - b.startUtc);
  return hits.slice(0, 2);
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
}

function handleChat({ text, session }) {
  const schedule = loadSchedule();
  const authorTz = cleanText(schedule.authoringTimezone || "America/Toronto");
<<<<<<< HEAD
<<<<<<< HEAD
  const shows = Array.isArray(schedule.shows) ? schedule.shows : [];

  const deviceTz = session && session._lastDeviceTz ? cleanText(session._lastDeviceTz) : "";
  const resolved = resolveTimezone(text, session, deviceTz);
  const userTz = resolved.tz || "America/Toronto";
  const userCity = resolved.city || (session && session.userCity) || null;
  const tzLabel = userCity ? `${capitalize(userCity)} (${userTz})` : userTz;
=======
=======
  const shows = Array.isArray(schedule.shows) ? schedule.shows : [];
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)

  const deviceTz = session && session._lastDeviceTz ? cleanText(session._lastDeviceTz) : "";
  const resolved = resolveTimezone(text, session, deviceTz);
  const userTz = resolved.tz || "America/Toronto";
  const userCity = resolved.city || (session && session.userCity) || null;
<<<<<<< HEAD
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
  const tzLabel = userCity ? `${capitalize(userCity)} (${userTz})` : userTz;
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)

  if (session) {
    session.userTz = userTz;
    if (userCity) session.userCity = userCity;
  }

<<<<<<< HEAD
<<<<<<< HEAD
  const low = cleanText(text).toLowerCase();
  const now = Date.now();

  // 1) Explicit ET conversion
  const conv = parseConvertEt(text);
  if (conv) {
    const placeResolved = resolveTimezone(conv.place, session, deviceTz);
    const targetTz = placeResolved.tz || userTz;

    const out = buildEtConversion(authorTz, targetTz, conv.hour, conv.minute);
    const targetLabel = placeResolved.city ? capitalize(placeResolved.city) : targetTz;

    return {
      reply:
        `Converted time (today):\n` +
        `• ${out.authorLabel} ET → ${out.userDow} ${out.userLabel} (${targetLabel})`,
      followUps: [
        { label: "Show me the schedule", send: "Show me the schedule" },
        { label: "Playing now", send: "What's playing now?" },
        { label: "Back to music", send: "Back to music" },
      ],
      sessionPatch: { lane: "schedule" },
    };
  }

  // 2) Now / Next / Later
  if (/\b(now next later|now\/next\/later|now next|what's on|whats on)\b/.test(low)) {
    const nowHits = nowPlaying(authorTz, userTz, shows, now);
    const upcoming = upcomingSorted(authorTz, userTz, shows, now);

    const nowLine =
      nowHits.length > 0
        ? `Now: ${nowHits[0].show.title} — ${nowHits[0].userStart}–${nowHits[0].userEnd}`
        : `Now: Nothing airing at this moment`;

    const nextLine =
      upcoming.length > 0
        ? `Next: ${upcoming[0].show.title} — ${upcoming[0].occ.userDow} ${upcoming[0].occ.userStart}`
        : `Next: (no schedule loaded)`;

    const laterLine =
      upcoming.length > 1
        ? `Later: ${upcoming[1].show.title} — ${upcoming[1].occ.userDow} ${upcoming[1].occ.userStart}`
        : `Later: —`;

    return {
      reply:
        `Now / Next / Later (converted to ${tzLabel}):\n` +
        `• ${nowLine}\n` +
        `• ${nextLine}\n` +
        `• ${laterLine}\n\n` +
        `Ask: “What time does <show> play for me?”`,
      followUps: [
        { label: "Show me the schedule", send: "Show me the schedule" },
        { label: "Playing now", send: "What's playing now?" },
        { label: "Back to music", send: "Back to music" },
      ],
      sessionPatch: { lane: "schedule" },
    };
  }

  // 3) Playing now
  if (/\b(playing now|on now|what's playing|whats playing)\b/.test(low)) {
    const hits = nowPlaying(authorTz, userTz, shows, now);
=======
  const shows = Array.isArray(schedule.shows) ? schedule.shows : [];
  const now = nowUtcMs();
=======
  const low = cleanText(text).toLowerCase();
  const now = Date.now();
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)

  // 1) Explicit ET conversion
  const conv = parseConvertEt(text);
  if (conv) {
    const placeResolved = resolveTimezone(conv.place, session, deviceTz);
    const targetTz = placeResolved.tz || userTz;

<<<<<<< HEAD
  // "what's playing now"
  if (/\b(playing now|on now|what's playing|whats playing)\b/.test(t)) {
    const hits = buildNowPlaying(authorTz, userTz, shows, now);
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
    const out = buildEtConversion(authorTz, targetTz, conv.hour, conv.minute);
    const targetLabel = placeResolved.city ? capitalize(placeResolved.city) : targetTz;

    return {
      reply:
        `Converted time (today):\n` +
        `• ${out.authorLabel} ET → ${out.userDow} ${out.userLabel} (${targetLabel})`,
      followUps: [
        { label: "Show me the schedule", send: "Show me the schedule" },
        { label: "Playing now", send: "What's playing now?" },
        { label: "Back to music", send: "Back to music" },
      ],
      sessionPatch: { lane: "schedule" },
    };
  }

  // 2) Now / Next / Later
  if (/\b(now next later|now\/next\/later|now next|what's on|whats on)\b/.test(low)) {
    const nowHits = nowPlaying(authorTz, userTz, shows, now);
    const upcoming = upcomingSorted(authorTz, userTz, shows, now);

    const nowLine =
      nowHits.length > 0
        ? `Now: ${nowHits[0].show.title} — ${nowHits[0].userStart}–${nowHits[0].userEnd}`
        : `Now: Nothing airing at this moment`;

    const nextLine =
      upcoming.length > 0
        ? `Next: ${upcoming[0].show.title} — ${upcoming[0].occ.userDow} ${upcoming[0].occ.userStart}`
        : `Next: (no schedule loaded)`;

    const laterLine =
      upcoming.length > 1
        ? `Later: ${upcoming[1].show.title} — ${upcoming[1].occ.userDow} ${upcoming[1].occ.userStart}`
        : `Later: —`;

    return {
      reply:
        `Now / Next / Later (converted to ${tzLabel}):\n` +
        `• ${nowLine}\n` +
        `• ${nextLine}\n` +
        `• ${laterLine}\n\n` +
        `Ask: “What time does <show> play for me?”`,
      followUps: [
        { label: "Show me the schedule", send: "Show me the schedule" },
        { label: "Playing now", send: "What's playing now?" },
        { label: "Back to music", send: "Back to music" },
      ],
      sessionPatch: { lane: "schedule" },
    };
  }

  // 3) Playing now
  if (/\b(playing now|on now|what's playing|whats playing)\b/.test(low)) {
    const hits = nowPlaying(authorTz, userTz, shows, now);
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)

    if (hits.length === 0) {
      return {
        reply:
<<<<<<< HEAD
<<<<<<< HEAD
          `Nothing is airing at this exact moment (converted to ${tzLabel}). ` +
          `Say a show name or “Show me the schedule”.`,
        followUps: [
          { label: "Now / Next / Later", send: "Now next later" },
          { label: "Show me the schedule", send: "Show me the schedule" },
=======
          `Nothing is airing at this exact moment in ${userCity || userTz}. ` +
          `Say a show name (e.g., “Gospel Sunday”) or “Show me the schedule”.`,
=======
          `Nothing is airing at this exact moment (converted to ${tzLabel}). ` +
          `Say a show name or “Show me the schedule”.`,
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
        followUps: [
          { label: "Now / Next / Later", send: "Now next later" },
          { label: "Show me the schedule", send: "Show me the schedule" },
<<<<<<< HEAD
          { label: "Gospel Sunday", send: "What time does Gospel Sunday play in London?" },
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
          { label: "Back to music", send: "Back to music" },
        ],
        sessionPatch: { lane: "schedule" },
      };
    }

<<<<<<< HEAD
<<<<<<< HEAD
    const lines = hits.map(
      (h) => `• ${h.show.title} — ${h.userDow} ${h.userStart}–${h.userEnd} (${tzLabel})`
    );

    return {
      reply: `Airing now (converted to ${tzLabel}):\n${lines.join("\n")}`,
      followUps: [
        { label: "Now / Next / Later", send: "Now next later" },
        { label: "Show me the schedule", send: "Show me the schedule" },
        { label: "Back to music", send: "Back to music" },
      ],
      sessionPatch: { lane: "schedule" },
    };
  }

  // 4) Schedule list
  if (/\b(show me the schedule|full schedule|the schedule|programming)\b/.test(low)) {
    const items = upcomingSorted(authorTz, userTz, shows, now).slice(0, 8).map(({ show, occ }) => {
      return `• ${show.title} — next: ${occ.userDow} ${occ.userStart}–${occ.userEnd}`;
=======
    const lines = hits.map((h) => {
      return `• ${h.show.title} — ${h.userDow} ${h.userStart}–${h.userEnd} (${userCity || userTz})`;
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
    });

    return {
      reply:
<<<<<<< HEAD
        `Schedule (next occurrences; converted to ${tzLabel}):\n` +
        (items.length ? items.join("\n") : "• (no schedule loaded)") +
        `\n\nAsk about a show by name, or say “Now next later”.`,
      followUps: [
        { label: "Now / Next / Later", send: "Now next later" },
        { label: "Playing now", send: "What's playing now?" },
=======
        `Here’s what’s airing now (converted to ${userCity || userTz}):\n` +
        lines.join("\n") +
        `\n\nAsk: “What time does <show> play in <city>?”`,
      followUps: [
        { label: "Show me the schedule", send: "Show me the schedule" },
        { label: "What time in London?", send: "What time does Gospel Sunday play in London?" },
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
        { label: "Back to music", send: "Back to music" },
      ],
      sessionPatch: { lane: "schedule" },
    };
  }

<<<<<<< HEAD
  // 5) Show query
  const q = extractShowQuery(text);
=======
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
=======
    const lines = hits.map(
      (h) => `• ${h.show.title} — ${h.userDow} ${h.userStart}–${h.userEnd} (${tzLabel})`
    );

    return {
      reply: `Airing now (converted to ${tzLabel}):\n${lines.join("\n")}`,
      followUps: [
        { label: "Now / Next / Later", send: "Now next later" },
        { label: "Show me the schedule", send: "Show me the schedule" },
        { label: "Back to music", send: "Back to music" },
      ],
      sessionPatch: { lane: "schedule" },
    };
  }

  // 4) Schedule list
  if (/\b(show me the schedule|full schedule|the schedule|programming)\b/.test(low)) {
    const items = upcomingSorted(authorTz, userTz, shows, now).slice(0, 8).map(({ show, occ }) => {
      return `• ${show.title} — next: ${occ.userDow} ${occ.userStart}–${occ.userEnd}`;
    });

    return {
      reply:
        `Schedule (next occurrences; converted to ${tzLabel}):\n` +
        (items.length ? items.join("\n") : "• (no schedule loaded)") +
        `\n\nAsk about a show by name, or say “Now next later”.`,
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
      followUps: [
        { label: "Now / Next / Later", send: "Now next later" },
        { label: "Playing now", send: "What's playing now?" },
        { label: "Back to music", send: "Back to music" },
      ],
      sessionPatch: { lane: "schedule" },
    };
  }

<<<<<<< HEAD
  // Query a show
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
  // 5) Show query
  const q = extractShowQuery(text);
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
  if (q) {
    const show = bestShowMatch(shows, q);
    if (!show) {
      return {
        reply:
<<<<<<< HEAD
<<<<<<< HEAD
          `I didn’t find “${cleanText(q)}” in the current schedule (converted to ${tzLabel}). ` +
          `Say “Show me the schedule” to see what’s available.`,
        followUps: [
          { label: "Show me the schedule", send: "Show me the schedule" },
          { label: "Now / Next / Later", send: "Now next later" },
=======
          `I didn’t find that show in the current schedule. Say “Show me the schedule” or try another name.`,
        followUps: [
          { label: "Show me the schedule", send: "Show me the schedule" },
          { label: "Playing now", send: "What's playing now?" },
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
          `I didn’t find “${cleanText(q)}” in the current schedule (converted to ${tzLabel}). ` +
          `Say “Show me the schedule” to see what’s available.`,
        followUps: [
          { label: "Show me the schedule", send: "Show me the schedule" },
          { label: "Now / Next / Later", send: "Now next later" },
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
          { label: "Back to music", send: "Back to music" },
        ],
        sessionPatch: { lane: "schedule" },
      };
    }

<<<<<<< HEAD
<<<<<<< HEAD
    const occ = nextOccurrence(authorTz, userTz, show, now);
    return {
      reply:
        `${show.title} plays next at ${occ.userDow} ${occ.userStart}–${occ.userEnd} ` +
        `(converted to ${tzLabel}).`,
      followUps: [
        { label: "Now / Next / Later", send: "Now next later" },
=======
    const occ = buildNextOccurrence(authorTz, userTz, show, now);

=======
    const occ = nextOccurrence(authorTz, userTz, show, now);
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
    return {
      reply:
        `${show.title} plays next at ${occ.userDow} ${occ.userStart}–${occ.userEnd} ` +
        `(converted to ${tzLabel}).`,
      followUps: [
<<<<<<< HEAD
        { label: "Playing now", send: "What's playing now?" },
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
        { label: "Now / Next / Later", send: "Now next later" },
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
        { label: "Show me the schedule", send: "Show me the schedule" },
        { label: "Back to music", send: "Back to music" },
      ],
      sessionPatch: { lane: "schedule" },
    };
  }

<<<<<<< HEAD
<<<<<<< HEAD
  // Default help
  return {
    reply:
      `Schedule Lane (timezone-aware). Try:\n` +
      `• “Now next later”\n` +
      `• “What time does Gospel Sunday play for me?”\n` +
      `• “Convert 8pm ET to London”\n` +
      `• “Show me the schedule”`,
    followUps: [
      { label: "Now / Next / Later", send: "Now next later" },
      { label: "Show me the schedule", send: "Show me the schedule" },
=======
  // Default schedule lane help
=======
  // Default help
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
  return {
    reply:
      `Schedule Lane (timezone-aware). Try:\n` +
      `• “Now next later”\n` +
      `• “What time does Gospel Sunday play for me?”\n` +
      `• “Convert 8pm ET to London”\n` +
      `• “Show me the schedule”`,
    followUps: [
      { label: "Now / Next / Later", send: "Now next later" },
      { label: "Show me the schedule", send: "Show me the schedule" },
<<<<<<< HEAD
      { label: "Playing now", send: "What's playing now?" },
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
      { label: "Back to music", send: "Back to music" },
    ],
    sessionPatch: { lane: "schedule" },
  };
}

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
function capitalize(s) {
  const t = cleanText(s);
  if (!t) return t;
  return t.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

<<<<<<< HEAD
=======
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
module.exports = {
  isScheduleQuestion,
  handleChat,
};
