"use strict";

/**
 * Utils/scheduleLane.js (v1.1)
 *
 * Adds:
 *  - Device timezone aware (session._lastDeviceTz)
 *  - "for me" (local time) support via timezoneResolver explicitTz
 *  - "Now / Next / Later" summary
 *  - Explicit ET time conversion: "Convert 8pm ET to London"
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

function fmtTime(msUtc, tz) {
  const d = new Date(msUtc);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function fmtWeekday(msUtc, tz) {
  const d = new Date(msUtc);
  const w = new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short" }).format(d);
  return w.toUpperCase().slice(0, 3);
}

function partsInTz(dateObj, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

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

function addDaysYMD(year, month, day, deltaDays) {
  const ms = Date.UTC(year, month - 1, day) + deltaDays * 86400000;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function partsHMInTz(dateObj, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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

function bestShowMatch(shows, q) {
  if (!q) return null;
  const qq = cleanText(q).toLowerCase();

  let best = null;
  let bestScore = 0;

  for (const s of shows) {
    const title = cleanText(s.title).toLowerCase();
    const id = cleanText(s.id).toLowerCase();

    let score = 0;
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

    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
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
  const end = next + Number(show.durationMin || 0) * 60000;

  return {
    startUtc: next,
    endUtc: end,
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
        });
      }
    }
  }

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
}

function handleChat({ text, session }) {
  const schedule = loadSchedule();
  const authorTz = cleanText(schedule.authoringTimezone || "America/Toronto");
  const shows = Array.isArray(schedule.shows) ? schedule.shows : [];

  const deviceTz = session && session._lastDeviceTz ? cleanText(session._lastDeviceTz) : "";
  const resolved = resolveTimezone(text, session, deviceTz);
  const userTz = resolved.tz || "America/Toronto";
  const userCity = resolved.city || (session && session.userCity) || null;
  const tzLabel = userCity ? `${capitalize(userCity)} (${userTz})` : userTz;

  if (session) {
    session.userTz = userTz;
    if (userCity) session.userCity = userCity;
  }

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

    if (hits.length === 0) {
      return {
        reply:
          `Nothing is airing at this exact moment (converted to ${tzLabel}). ` +
          `Say a show name or “Show me the schedule”.`,
        followUps: [
          { label: "Now / Next / Later", send: "Now next later" },
          { label: "Show me the schedule", send: "Show me the schedule" },
          { label: "Back to music", send: "Back to music" },
        ],
        sessionPatch: { lane: "schedule" },
      };
    }

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
      followUps: [
        { label: "Now / Next / Later", send: "Now next later" },
        { label: "Playing now", send: "What's playing now?" },
        { label: "Back to music", send: "Back to music" },
      ],
      sessionPatch: { lane: "schedule" },
    };
  }

  // 5) Show query
  const q = extractShowQuery(text);
  if (q) {
    const show = bestShowMatch(shows, q);
    if (!show) {
      return {
        reply:
          `I didn’t find “${cleanText(q)}” in the current schedule (converted to ${tzLabel}). ` +
          `Say “Show me the schedule” to see what’s available.`,
        followUps: [
          { label: "Show me the schedule", send: "Show me the schedule" },
          { label: "Now / Next / Later", send: "Now next later" },
          { label: "Back to music", send: "Back to music" },
        ],
        sessionPatch: { lane: "schedule" },
      };
    }

    const occ = nextOccurrence(authorTz, userTz, show, now);
    return {
      reply:
        `${show.title} plays next at ${occ.userDow} ${occ.userStart}–${occ.userEnd} ` +
        `(converted to ${tzLabel}).`,
      followUps: [
        { label: "Now / Next / Later", send: "Now next later" },
        { label: "Show me the schedule", send: "Show me the schedule" },
        { label: "Back to music", send: "Back to music" },
      ],
      sessionPatch: { lane: "schedule" },
    };
  }

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
      { label: "Back to music", send: "Back to music" },
    ],
    sessionPatch: { lane: "schedule" },
  };
}

function capitalize(s) {
  const t = cleanText(s);
  if (!t) return t;
  return t.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

module.exports = {
  isScheduleQuestion,
  handleChat,
};
