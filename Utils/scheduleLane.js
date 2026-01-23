"use strict";

/**
 * Utils/scheduleLane.js
 *
 * Schedule Lane v1.3a (GRID SCHEDULE v1 + Deterministic + Never-Throw + Chip-Safe)
 *
 * Supports schedule_v1.json schema:
 * {
 *   version,
 *   timezoneCanonical: "America/Toronto",
 *   blockSizeMinutes: 30,
 *   shows: [{id,title,description,href,nyxPayload}],
 *   week: {
 *     Sunday: [{startET:"00:00", show:{id,title,nyxPayload,href?}}, ...],
 *     ...
 *   }
 * }
 *
 * Features:
 *  - Timezone-aware schedule (ET-authored) -> user local time
 *  - NOW / NEXT / TODAY first
 *  - Today grid (all blocks for today)
 *  - Full-week view (compact)
 *  - Show lookup: "What time does Detective Hour play?" (next occurrence + next few)
 *  - ET conversion: "Convert 8pm ET to London"
 */

const fs = require("fs");
const path = require("path");
const { resolveTimezone } = require("./timezoneResolver");

// =========================
// Helpers
// =========================
function cleanText(s) {
  return String(s || "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
}

function capitalize(s) {
  const t = cleanText(s);
  if (!t) return t;
  return t
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Chip-safe normalizer (hard boundary)
 */
function safeFollowUps(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();

  for (const it of list) {
    let label = "";
    let send = "";

    if (typeof it === "string") {
      const s = cleanText(it);
      if (!s) continue;
      label = s.length > 48 ? s.slice(0, 48) : s;
      send = s.slice(0, 80);
    } else if (it && typeof it === "object") {
      label = cleanText(it.label || it.text || it.title || "");
      send = cleanText(it.send || it.value || it.query || it.text || label || "");
      if (!label || !send) continue;
      if (label.length > 48) label = label.slice(0, 48);
      if (send.length > 80) send = send.slice(0, 80);
    }

    if (!label || !send) continue;
    const k = send.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);

    out.push({ label, send });
    if (out.length >= 10) break;
  }

  return out;
}

const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "Data", "roku_programming_v1.json"); // keep your existing filename

let CACHE = null;
function loadScheduleSafe() {
  if (CACHE) return CACHE;
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const obj = JSON.parse(raw);
    CACHE = obj || null;
    return CACHE;
  } catch (_) {
    CACHE = {
      version: "schedule_v1.0.0",
      timezoneCanonical: "America/Toronto",
      blockSizeMinutes: 30,
      shows: [],
      week: {},
    };
    return CACHE;
  }
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_NAME_TO_DOW = {
  SUNDAY: "SUN",
  MONDAY: "MON",
  TUESDAY: "TUE",
  WEDNESDAY: "WED",
  THURSDAY: "THU",
  FRIDAY: "FRI",
  SATURDAY: "SAT",
};

// =========================
// Time utils (Intl-based)
// =========================
function nowUtcMs() {
  return Date.now();
}

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

function partsInTz(dateObj, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const map = {};
  for (const p of fmt.formatToParts(dateObj)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  const weekday = String(map.weekday || "").toUpperCase().slice(0, 3);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekdayIndex: Math.max(0, DOW.indexOf(weekday)),
    weekday, // e.g., "FRI"
  };
}

// Add days to a Y-M-D (UTC-safe arithmetic by using Date.UTC)
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
  for (const p of fmt.formatToParts(dateObj)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return { hour: Number(map.hour), minute: Number(map.minute) };
}

/**
 * Convert "zoned local time" -> UTC ms using Intl.
 *  1) Create UTC guess from components.
 *  2) Determine what time that guess represents in target tz.
 *  3) Compute offset and correct (DST-safe enough for our schedule use).
 */
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

/**
 * Create a UTC timestamp for "this week's <DAY> at <HH:MM> in authoring TZ"
 * Strategy:
 *  - Find today's date parts in authorTz, backtrack to Sunday, then add day offset + local time.
 */
function getUtcForAuthoringLocal(authorTz, targetDow, hhmm, refUtcMs) {
  const ref = new Date(refUtcMs);
  const parts = partsInTz(ref, authorTz);

  const sunday = addDaysYMD(parts.year, parts.month, parts.day, -parts.weekdayIndex);
  const dayIndex = DOW.indexOf(targetDow);
  const target = addDaysYMD(sunday.year, sunday.month, sunday.day, dayIndex);

  const [hh, mm] = String(hhmm || "00:00")
    .split(":")
    .map((x) => Number(x));

  return zonedTimeToUtcMs(
    { year: target.year, month: target.month, day: target.day, hour: Number(hh) || 0, minute: Number(mm) || 0 },
    authorTz
  );
}

// =========================
// Parsing / intent checks
// =========================
function isScheduleQuestion(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;

  return (
    /\b(schedule|programming|what's playing|whats playing|playing now|on now|airing|today|tonight|this week|full week|week schedule|grid)\b/.test(
      t
    ) ||
    /\b(now next later|now\/next\/later)\b/.test(t) ||
    /\b(convert|what time is)\b/.test(t) ||
    /\b(roku)\b/.test(t)
  );
}

// Parse "convert 8pm et to london"
function parseConvertEt(text) {
  const t = cleanText(text).toLowerCase();
  const m = t.match(
    /\b(convert|what is|what time is)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(et|est|edt)\s+(to|in)\s+(.+)\b/
  );
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
  if (!place) return null;

  return { hour, minute: minRaw, place };
}

function buildEtConversion(authorTz, userTz, hour, minute) {
  const now = nowUtcMs();
  const parts = partsInTz(new Date(now), authorTz);
  const utc = zonedTimeToUtcMs({ year: parts.year, month: parts.month, day: parts.day, hour, minute }, authorTz);

  return {
    authorLabel: fmtTime(utc, authorTz),
    userLabel: fmtTime(utc, userTz),
    userDow: fmtWeekday(utc, userTz),
  };
}

function extractShowQuery(text) {
  const t = cleanText(text);
  const low = t.toLowerCase();
  if (!t) return null;

  const m =
    low.match(/\bwhat time does ([a-z0-9' -]{3,60}) (play|air|start)\b/i) ||
    low.match(/\bwhen does ([a-z0-9' -]{3,60}) (play|air|start)\b/i);

  if (m && m[1]) return cleanText(m[1]);

  // If user says just a show name in schedule lane, treat it as query.
  if (/^[a-z0-9' -]{3,60}$/i.test(t) && !/\b(schedule|programming|playing|convert|roku|today|week)\b/i.test(low)) {
    return t;
  }

  return null;
}

// =========================
// Grid flattening
// =========================
function normalizeWeekGrid(schedule) {
  const authorTz = cleanText(schedule.timezoneCanonical || schedule.authoringTimezone || "America/Toronto");
  const blockMin = Number(schedule.blockSizeMinutes || 30) || 30;
  const week = schedule.week && typeof schedule.week === "object" ? schedule.week : {};
  const catalog = Array.isArray(schedule.shows) ? schedule.shows : [];

  // Build a catalog map for richer details by id
  const byId = new Map();
  for (const s of catalog) {
    const id = cleanText(s && s.id);
    if (id) byId.set(id, s);
  }

  const out = []; // blocks: { dow, startET, startUtc, endUtc, show }
  const now = nowUtcMs();

  for (const [dayNameRaw, blocks] of Object.entries(week)) {
    const dayName = cleanText(dayNameRaw).toUpperCase();
    const dow = DAY_NAME_TO_DOW[dayName] || null;
    if (!dow || !Array.isArray(blocks)) continue;

    for (const b of blocks) {
      const startET = cleanText(b && b.startET);
      if (!/^\d{2}:\d{2}$/.test(startET)) continue;

      const showIn = b && b.show ? b.show : {};
      const showId = cleanText(showIn.id);
      const fromCatalog = showId ? byId.get(showId) : null;

      const show = {
        id: showId || cleanText(showIn.title) || "unknown",
        title: cleanText(showIn.title || (fromCatalog && fromCatalog.title) || "Untitled"),
        description: cleanText(showIn.description || (fromCatalog && fromCatalog.description) || ""),
        href: cleanText(showIn.href || (fromCatalog && fromCatalog.href) || ""),
        nyxPayload: cleanText(showIn.nyxPayload || (fromCatalog && fromCatalog.nyxPayload) || (showId ? `show:${showId}` : "")),
      };

      const startUtc = getUtcForAuthoringLocal(authorTz, dow, startET, now);
      const endUtc = startUtc + blockMin * 60000;

      out.push({ dow, dayName, startET, startUtc, endUtc, show });
    }
  }

  // Normalize ordering within same week anchor
  out.sort((a, b) => a.startUtc - b.startUtc);
  return { authorTz, blockMin, blocks: out, catalog };
}

function bestShowMatch(catalog, blocks, q) {
  if (!q) return null;
  const qq = cleanText(q).toLowerCase();
  if (!qq) return null;

  // 1) Prefer catalog match
  let best = null;
  let bestScore = 0;

  const scoreShow = (s) => {
    const title = cleanText(s && s.title).toLowerCase();
    const id = cleanText(s && s.id).toLowerCase();
    if (!title && !id) return 0;

    let score = 0;
    if (id === qq) score += 24;
    if (title === qq) score += 24;
    if (title.includes(qq)) score += 14;
    if (qq.includes(title) && title) score += 8;

    const a = new Set(title.split(" ").filter(Boolean));
    const b = new Set(qq.split(" ").filter(Boolean));
    let ov = 0;
    for (const w of b) if (a.has(w)) ov++;
    score += Math.min(10, ov);

    return score;
  };

  for (const s of catalog || []) {
    const score = scoreShow(s);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  if (bestScore >= 8 && best) return { id: best.id, title: best.title };

  // 2) Fall back to blocks match
  best = null;
  bestScore = 0;
  for (const b of blocks || []) {
    const s = b.show;
    const score = scoreShow(s);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  return bestScore >= 8 && best ? { id: best.id, title: best.title } : null;
}

function blocksForToday(blocks, authorTz, nowUtc) {
  const authorParts = partsInTz(new Date(nowUtc), authorTz);
  const todayDow = authorParts.weekday; // "FRI" in author tz
  return blocks.filter((b) => b.dow === todayDow);
}

function findNowNext(blocks, nowUtc) {
  const now = blocks.find((b) => nowUtc >= b.startUtc && nowUtc < b.endUtc) || null;
  const next = blocks.find((b) => b.startUtc >= nowUtc) || null;
  return { now, next };
}

function compactLineForBlock(b, userTz, tzLabel) {
  const st = fmtTime(b.startUtc, userTz);
  const et = fmtTime(b.endUtc, userTz);
  const d = fmtWeekday(b.startUtc, userTz);
  const show = b.show || {};
  const link = show.href ? ` ${show.href}` : show.nyxPayload ? ` nyx:show:${cleanText(show.id)}` : "";
  return `${d} ${st}-${et} — ${show.title}${link ? ` (${link})` : ""}${tzLabel ? ` [${tzLabel}]` : ""}`;
}

// =========================
// Replies
// =========================
function defaultHelpReply() {
  return {
    reply:
      "Schedule Lane (timezone-aware). Try:\n" +
      '• "Now / Next / Today"\n' +
      '• "Today schedule"\n' +
      '• "Full week schedule"\n' +
      '• "What time does Detective Hour play?"\n' +
      '• "Convert 8pm ET to London"',
    followUps: safeFollowUps([
      { label: "Now / Next / Today", send: "Now next today" },
      { label: "Today schedule", send: "Today schedule" },
      { label: "Full week", send: "Full week schedule" },
      { label: "Convert 8pm ET to London", send: "Convert 8pm ET to London" },
    ]),
    sessionPatch: { lane: "schedule" },
  };
}

function handleChat({ text, session } = {}) {
  try {
    const schedule = loadScheduleSafe();
    const { authorTz, blockMin, blocks, catalog } = normalizeWeekGrid(schedule);

    const message = cleanText(text);
    const low = message.toLowerCase();
    const now = nowUtcMs();

    // Resolve user timezone (device tz + "for me" support via resolver)
    const deviceTz = session && session._lastDeviceTz ? cleanText(session._lastDeviceTz) : "";
    const resolved = resolveTimezone(message, session, deviceTz);
    const userTz = resolved.tz || "America/Toronto";
    const userCity = resolved.city || (session && session.userCity) || null;
    const tzLabel = userCity ? `${capitalize(userCity)} (${userTz})` : userTz;

    // Persist minimal hint
    if (session && typeof session === "object") {
      session.userTz = userTz;
      if (userCity) session.userCity = userCity;
      session.lane = "schedule";
    }

    if (!blocks.length) {
      return {
        reply: "Schedule data is loaded, but there are no blocks in the week grid yet.",
        followUps: safeFollowUps([
          { label: "Back to music", send: "Back to music" },
          { label: "Convert 8pm ET to London", send: "Convert 8pm ET to London" },
        ]),
        sessionPatch: { lane: "schedule" },
      };
    }

    // 1) Explicit ET conversion
    const conv = parseConvertEt(message);
    if (conv) {
      const placeResolved = resolveTimezone(conv.place, session, deviceTz);
      const targetTz = placeResolved.tz || userTz;
      const out = buildEtConversion(authorTz, targetTz, conv.hour, conv.minute);
      const targetLabel = placeResolved.city ? capitalize(placeResolved.city) : targetTz;

      return {
        reply: `Converted time (today):\n• ${out.authorLabel} ET -> ${out.userDow} ${out.userLabel} (${targetLabel})`,
        followUps: safeFollowUps([
          { label: "Now / Next / Today", send: "Now next today" },
          { label: "Today schedule", send: "Today schedule" },
          { label: "Full week", send: "Full week schedule" },
          { label: "Back to music", send: "Back to music" },
        ]),
        sessionPatch: { lane: "schedule" },
      };
    }

    // 2) Now / Next / Today (priority)
    if (/\b(now next today|now\/next|now next|what's on|whats on)\b/.test(low)) {
      const { now: nowBlock, next: nextBlock } = findNowNext(blocks, now);
      const today = blocksForToday(blocks, authorTz, now);

      const nowLine = nowBlock ? compactLineForBlock(nowBlock, userTz, tzLabel) : `Now: (no block at this moment) [${tzLabel}]`;
      const nextLine = nextBlock ? compactLineForBlock(nextBlock, userTz, tzLabel) : `Next: (none) [${tzLabel}]`;

      // Today: show next 10 blocks remaining today (author-day anchored)
      const todayRemaining = today
        .filter((b) => b.endUtc > now)
        .slice(0, 10)
        .map((b) => `• ${fmtTime(b.startUtc, userTz)}-${fmtTime(b.endUtc, userTz)} — ${b.show.title}${b.show.href ? ` (${b.show.href})` : ""}`);

      const todayHeader = today.length ? `Today (${tzLabel}) — ${blockMin}-minute blocks:` : `Today (${tzLabel}): (no blocks)`;
      const todayBody = todayRemaining.length ? todayRemaining.join("\n") : "• (no remaining blocks today)";

      return {
        reply: `Now / Next (converted to ${tzLabel}):\n• ${nowLine}\n• ${nextLine}\n\n${todayHeader}\n${todayBody}`,
        followUps: safeFollowUps([
          { label: "Today schedule", send: "Today schedule" },
          { label: "Full week", send: "Full week schedule" },
          { label: "What's playing now?", send: "What's playing now?" },
          { label: "Back to music", send: "Back to music" },
        ]),
        sessionPatch: { lane: "schedule" },
      };
    }

    // 3) Playing now
    if (/\b(playing now|on now|what's playing|whats playing)\b/.test(low)) {
      const hit = blocks.find((b) => now >= b.startUtc && now < b.endUtc) || null;
      if (!hit) {
        return {
          reply: `Nothing is airing in this exact 30-minute block (converted to ${tzLabel}). Say "Now next today" or "Today schedule".`,
          followUps: safeFollowUps([
            { label: "Now / Next / Today", send: "Now next today" },
            { label: "Today schedule", send: "Today schedule" },
            { label: "Full week", send: "Full week schedule" },
            { label: "Back to music", send: "Back to music" },
          ]),
          sessionPatch: { lane: "schedule" },
        };
      }

      return {
        reply: `Airing now (converted to ${tzLabel}):\n• ${compactLineForBlock(hit, userTz, tzLabel)}`,
        followUps: safeFollowUps([
          { label: "Now / Next / Today", send: "Now next today" },
          { label: "Today schedule", send: "Today schedule" },
          { label: "Full week", send: "Full week schedule" },
          { label: "Back to music", send: "Back to music" },
        ]),
        sessionPatch: { lane: "schedule" },
      };
    }

    // 4) Today schedule
    if (/\b(today schedule|today's schedule|todays schedule|today)\b/.test(low) && !/\b(convert)\b/.test(low)) {
      const today = blocksForToday(blocks, authorTz, now);
      const lines = today.map(
        (b) =>
          `• ${fmtTime(b.startUtc, userTz)}-${fmtTime(b.endUtc, userTz)} — ${b.show.title}${b.show.href ? ` (${b.show.href})` : ""}`
      );

      return {
        reply: `Today (converted to ${tzLabel}):\n${lines.join("\n") || "• (no blocks today)"}`,
        followUps: safeFollowUps([
          { label: "Now / Next / Today", send: "Now next today" },
          { label: "Full week", send: "Full week schedule" },
          { label: "Back to music", send: "Back to music" },
        ]),
        sessionPatch: { lane: "schedule" },
      };
    }

    // 5) Full schedule (compact week)
    if (/\b(full week|week schedule|full schedule|show me the schedule|the schedule|programming)\b/.test(low)) {
      // Show next 24 blocks (12 hours) to keep reply manageable, grouped by user weekday
      const upcoming = blocks.filter((b) => b.endUtc > now).slice(0, 24);
      const grouped = {};
      for (const b of upcoming) {
        const wd = fmtWeekday(b.startUtc, userTz);
        if (!grouped[wd]) grouped[wd] = [];
        grouped[wd].push(b);
      }

      const days = Object.keys(grouped);
      const out = [];
      for (const wd of days) {
        out.push(`${wd}:`);
        for (const b of grouped[wd]) {
          out.push(
            `  • ${fmtTime(b.startUtc, userTz)}-${fmtTime(b.endUtc, userTz)} — ${b.show.title}${b.show.href ? ` (${b.show.href})` : ""}`
          );
        }
      }

      return {
        reply:
          `Schedule (next ${upcoming.length} blocks; converted to ${tzLabel}):\n` +
          (out.length ? out.join("\n") : "• (no upcoming blocks)") +
          `\n\nAsk: "What time does <show> play?" or say "Now next today".`,
        followUps: safeFollowUps([
          { label: "Now / Next / Today", send: "Now next today" },
          { label: "Today schedule", send: "Today schedule" },
          { label: "Back to music", send: "Back to music" },
        ]),
        sessionPatch: { lane: "schedule" },
      };
    }

    // 6) Show query (next occurrences)
    const q = extractShowQuery(message);
    if (q) {
      const match = bestShowMatch(catalog, blocks, q);
      if (!match) {
        return {
          reply: `I didn't find "${cleanText(q)}" in the schedule catalog or week grid (converted to ${tzLabel}). Say "Today schedule" or "Full week schedule".`,
          followUps: safeFollowUps([
            { label: "Now / Next / Today", send: "Now next today" },
            { label: "Today schedule", send: "Today schedule" },
            { label: "Full week", send: "Full week schedule" },
          ]),
          sessionPatch: { lane: "schedule" },
        };
      }

      const hits = blocks
        .filter((b) => {
          const sid = cleanText(b.show && b.show.id).toLowerCase();
          const st = cleanText(b.show && b.show.title).toLowerCase();
          return sid === cleanText(match.id).toLowerCase() || st === cleanText(match.title).toLowerCase();
        })
        .map((b) => ({ b, start: b.startUtc }))
        .sort((a, c) => a.start - c.start);

      const future = hits.filter((h) => h.b.endUtc > now);
      const next = future.length ? future[0].b : null;

      const nextLine = next ? `Next: ${compactLineForBlock(next, userTz, tzLabel)}` : "Next: (no upcoming blocks found)";
      const more = future
        .slice(1, 5)
        .map((h) => `• ${compactLineForBlock(h.b, userTz, tzLabel)}`)
        .join("\n");

      return {
        reply:
          `${match.title} — schedule lookup (converted to ${tzLabel}):\n` +
          `• ${nextLine}\n` +
          (more ? `\nMore:\n${more}` : "") +
          `\n\nTip: if you want Nyx to present the show, tap the link in parentheses (nyx:show:...).`,
        followUps: safeFollowUps([
          { label: "Now / Next / Today", send: "Now next today" },
          { label: "Today schedule", send: "Today schedule" },
          { label: "Full week", send: "Full week schedule" },
          { label: "Back to music", send: "Back to music" },
        ]),
        sessionPatch: { lane: "schedule" },
      };
    }

    // Default help
    return defaultHelpReply();
  } catch (_) {
    return {
      reply: 'Schedule Lane hit a snag. Try: "Now next today", "Today schedule", or "Full week schedule".',
      followUps: safeFollowUps([
        { label: "Now / Next / Today", send: "Now next today" },
        { label: "Today schedule", send: "Today schedule" },
        { label: "Full week", send: "Full week schedule" },
        { label: "Back to music", send: "Back to music" },
      ]),
      sessionPatch: { lane: "schedule" },
    };
  }
}

module.exports = {
  isScheduleQuestion,
  handleChat,
};
