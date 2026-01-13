"use strict";

/**
 * Utils/scheduleLane.js
 *
 * Purpose:
 *  - Timezone-aware programming responses for Roku / schedule queries
 *  - Schedule is authored in scheduleTz (default America/Toronto)
 *  - Convert show windows into user's timezone (Europe/London, etc.)
 *
 * Requires:
 *  - npm i luxon
 *
 * Data:
 *  - Data/programming_schedule_v1.json
 *  - Optional: Data/timezone_city_map_v1.json used by timezoneResolver
 */

const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");
const tzResolver = require("./timezoneResolver");

const ROOT = path.resolve(__dirname, "..");
const SCHEDULE_FILE = path.join(ROOT, "Data", "programming_schedule_v1.json");

const WORLD_CLOCK_URL = "https://www.timeanddate.com/worldclock/";

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function normalize(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function loadSchedule() {
  const j = safeReadJson(SCHEDULE_FILE);
  if (!j || !Array.isArray(j.shows)) {
    // Safe starter schedule if file missing
    return {
      version: "1.0",
      scheduleTz: "America/Toronto",
      shows: [
        {
          id: "sb-radio-gospel-sunday",
          title: "Gospel Sunday",
          channel: "Sandblast Radio",
          days: ["SUN"],
          start: "18:00",
          end: "22:00"
        }
      ]
    };
  }
  return j;
}

const SCHED = loadSchedule();

const WEEKDAY = {
  MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 7
};

function parseHHMM(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function formatWindow(dtStart, dtEnd) {
  // Example: Sun 6:00–10:00 PM
  const day = dtStart.toFormat("ccc");
  const s = dtStart.toFormat("h:mm a");
  const e = dtEnd.toFormat("h:mm a");
  return `${day} ${s}–${e}`;
}

function formatStartsIn(now, start) {
  const diff = start.diff(now, ["days", "hours", "minutes"]).toObject();
  const totalMinutes = Math.max(0, Math.round(start.diff(now, "minutes").minutes));
  if (totalMinutes <= 1) return "now";

  const d = Math.floor(totalMinutes / (60 * 24));
  const h = Math.floor((totalMinutes - d * 1440) / 60);
  const m = totalMinutes - d * 1440 - h * 60;

  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return parts.join(" ");
}

function isScheduleQuestion(text) {
  const t = normalize(text);
  return (
    /\b(what'?s playing|what is playing|playing now|on now|schedule|programming)\b/.test(t) ||
    /\b(what time|when does|air in|in london|in toronto|in new york)\b/.test(t)
  );
}

function findShowByText(text) {
  const t = normalize(text);

  // Try exact containment on title tokens
  const hits = [];
  for (const show of SCHED.shows) {
    const title = normalize(show.title);
    if (!title) continue;
    if (t.includes(title)) hits.push(show);
  }
  if (hits.length === 1) return hits[0];

  // Loose match: any significant word
  const words = t.split(" ").filter(w => w.length >= 4);
  for (const show of SCHED.shows) {
    const title = normalize(show.title);
    if (words.some(w => title.includes(w))) return show;
  }

  return null;
}

function nextAiringWindow(show, scheduleTz) {
  const now = DateTime.now().setZone(scheduleTz);

  const startParts = parseHHMM(show.start);
  const endParts = parseHHMM(show.end);
  if (!startParts || !endParts) return null;

  // Find the next day in show.days
  const days = (show.days || []).map(d => String(d).toUpperCase()).filter(Boolean);
  const targets = days.map(d => WEEKDAY[d]).filter(Boolean);
  if (!targets.length) return null;

  // Search next 14 days max to be safe
  for (let offset = 0; offset <= 14; offset++) {
    const candidateDate = now.plus({ days: offset });
    if (!targets.includes(candidateDate.weekday)) continue;

    let start = candidateDate.set({
      hour: startParts.hh,
      minute: startParts.mm,
      second: 0,
      millisecond: 0
    });

    let end = candidateDate.set({
      hour: endParts.hh,
      minute: endParts.mm,
      second: 0,
      millisecond: 0
    });

    // Handle overnight windows (e.g., 23:00–02:00)
    if (end <= start) end = end.plus({ days: 1 });

    // Must be in the future (or now)
    if (start >= now.minus({ minutes: 1 })) {
      return { start, end };
    }
  }

  return null;
}

function convertWindowToUserTz(win, userTz) {
  return {
    start: win.start.setZone(userTz),
    end: win.end.setZone(userTz)
  };
}

function buildAnswer({ show, scheduleTz, userTz, userCity, includeReference }) {
  const winET = nextAiringWindow(show, scheduleTz);
  if (!winET) {
    return {
      reply: `I couldn’t compute the next airing for “${show.title}” yet. The schedule entry may be missing days/start/end.`,
      followUps: [
        { label: "Show list", send: "Show me the schedule" },
        { label: "Set my city", send: "I'm in London" }
      ],
      sessionPatch: {}
    };
  }

  const nowET = DateTime.now().setZone(scheduleTz);
  const winUser = convertWindowToUserTz(winET, userTz);

  const etLabel = `${formatWindow(winET.start, winET.end)} (${scheduleTz})`;
  const userLabel = `${formatWindow(winUser.start, winUser.end)} (${userCity || userTz})`;
  const startsIn = formatStartsIn(nowET, winET.start);

  const lines = [];
  lines.push(`**${show.title}** — ${show.channel || "Sandblast"}`);
  lines.push(`• Airs (ET): ${formatWindow(winET.start, winET.end)} (Toronto / ET)`);
  lines.push(`• Your time: ${formatWindow(winUser.start, winUser.end)} (${userCity || userTz})`);
  lines.push(`• Starts in: ${startsIn}`);

  if (includeReference) {
    lines.push(`• Reference: ${WORLD_CLOCK_URL}`);
  }

  return {
    reply: lines.join("\n"),
    followUps: [
      { label: "What’s playing now?", send: "What's playing now" },
      { label: "Another show", send: "Show me the schedule" },
      { label: "Switch city", send: "I'm in London" }
    ],
    sessionPatch: {
      userTz,
      userCity: userCity || null
    }
  };
}

function listScheduleQuick() {
  const lines = [];
  lines.push("Here’s the current schedule (ET):");
  for (const s of SCHED.shows) {
    const days = (s.days || []).join(",");
    lines.push(`• ${s.title} — ${days} ${s.start}–${s.end} — ${s.channel || "Sandblast"}`);
  }
  return lines.join("\n");
}

function handleChat({ text, session }) {
  const scheduleTz = (SCHED && SCHED.scheduleTz) ? SCHED.scheduleTz : "America/Toronto";
  const t = normalize(text);

  // Show schedule list
  if (/\b(show me the schedule|schedule list|list schedule|programming list)\b/.test(t)) {
    return {
      reply: listScheduleQuick(),
      followUps: [
        { label: "Convert for London", send: "Convert schedule for London" },
        { label: "What’s playing now?", send: "What's playing now" }
      ],
      sessionPatch: {}
    };
  }

  // Resolve timezone
  const tzRes = tzResolver.resolveTimezone({ text, session });
  if (!tzRes.tz) {
    // We can still answer in ET, but best is to ask once
    return {
      reply:
        "I can convert Sandblast programming into your local time. What city are you in?\n" +
        "Pick one below or type your city (example: “I’m in London”).",
      followUps: tzRes.followUps || [],
      sessionPatch: {}
    };
  }

  // Find show
  const show = findShowByText(text);
  if (!show) {
    // If user asked "what time does X play", but we didn't match, offer list
    return {
      reply:
        "Which show do you mean? Tell me the title (or tap “Show list”).\n" +
        `If you want a quick reference, the world clock is here: ${WORLD_CLOCK_URL}`,
      followUps: [
        { label: "Show list", send: "Show me the schedule" },
        { label: "Gospel Sunday", send: "What time is Gospel Sunday" }
      ],
      sessionPatch: { userTz: tzRes.tz, userCity: tzRes.city || null }
    };
  }

  return buildAnswer({
    show,
    scheduleTz,
    userTz: tzRes.tz,
    userCity: tzRes.city,
    includeReference: true
  });
}

module.exports = {
  isScheduleQuestion,
  handleChat,
  loadSchedule
};
