"use strict";

/**
 * Utils/scheduleLane.js
 *
 * Schedule Lane v1.2c (SCHEDULE_V1.JSON + Now/Next/Today-FIRST + Deterministic + Never-Throw + Chip-Safe)
 *
 * Purpose:
 *  - Timezone-aware programming schedule for Roku/Sandblast.
 *  - Converts ET-authored schedule windows to user local time (DST-safe enough via Intl).
 *  - Uses schedule_v1.json weekly grid (Sun→Sat, 30-min blocks).
 *
 * Supports:
 *  - "Now next later" (primary)
 *  - "Today" (primary)
 *  - "What's playing now?"
 *  - "Convert 8pm ET to London"
 *  - Show details via: "details:<showId>" or clicking via "nyx:<payload>"
 *
 * Output normalized to:
 *  { reply, followUps:[{label,send}], sessionPatch }
 */

const fs = require("fs");
const path = require("path");
const { resolveTimezone } = require("./timezoneResolver");

// ----------------------------
// Text utils
// ----------------------------
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

// ----------------------------
// Data loading (schedule_v1.json)
// ----------------------------
const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "Data", "schedule_v1.json");

let CACHE = null;

function loadScheduleSafe() {
  if (CACHE) return CACHE;
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const json = JSON.parse(raw);

    // Minimal schema hardening
    const authorTz = cleanText(json.timezoneCanonical || json.authoringTimezone || "America/Toronto");
    const blockSizeMinutes = Number(json.blockSizeMinutes || 30) || 30;
    const week = (json.week && typeof json.week === "object") ? json.week : {};

    CACHE = {
      version: cleanText(json.version || "schedule_v1"),
      authorTz,
      blockSizeMinutes,
      week
    };

    return CACHE;
  } catch (_) {
    CACHE = {
      version: "schedule_v1",
      authorTz: "America/Toronto",
      blockSizeMinutes: 30,
      week: {}
    };
    return CACHE;
  }
}

// ----------------------------
// TZ formatting helpers
// ----------------------------
const DOW_KEYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DOW3 = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function nowUtcMs() {
  return Date.now();
}

function fmtTime(msUtc, tz) {
  const d = new Date(msUtc);
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
  return f.format(d);
}

function fmtWeekday3(msUtc, tz) {
  const d = new Date(msUtc);
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short" });
  return f.format(d).toUpperCase().slice(0, 3);
}

function partsInTz(dateObj, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
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
    weekday3: weekday,
    weekdayIndex: Math.max(0, DOW3.indexOf(weekday))
  };
}

function partsHMInTz(dateObj, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const map = {};
  for (const p of fmt.formatToParts(dateObj)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return { hour: Number(map.hour), minute: Number(map.minute) };
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
 *  3) Compute offset and correct (DST-safe enough for schedule use).
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
function getUtcForAuthoringLocal(authorTz, targetDow3, hhmm, refUtcMs) {
  const ref = new Date(refUtcMs);
  const parts = partsInTz(ref, authorTz);

  const sunday = addDaysYMD(parts.year, parts.month, parts.day, -parts.weekdayIndex);

  const dayIndex = DOW3.indexOf(targetDow3);
  const target = addDaysYMD(sunday.year, sunday.month, sunday.day, dayIndex);

  const [hh, mm] = String(hhmm || "00:00")
    .split(":")
    .map((x) => Number(x));

  return zonedTimeToUtcMs(
    {
      year: target.year,
      month: target.month,
      day: target.day,
      hour: Number(hh) || 0,
      minute: Number(mm) || 0
    },
    authorTz
  );
}

// ----------------------------
// Slot helpers (schedule_v1 grid)
// ----------------------------
function parseHHMM(startET) {
  const s = String(startET || "");
  const m = s.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm, hhmm: `${String(m[1])}:${String(m[2])}` };
}

function slotTitle(slot) {
  // slot.show can be null or object
  if (!slot || typeof slot !== "object") return "(Unscheduled)";
  const show = slot.show;
  if (!show) return "(Unscheduled)";
  if (typeof show === "string") return cleanText(show) || "(Unscheduled)";
  if (show && typeof show === "object") {
    return cleanText(show.title || show.name || show.id || "") || "(Unscheduled)";
  }
  return "(Unscheduled)";
}

function slotShowId(slot) {
  if (!slot || typeof slot !== "object") return null;
  const show = slot.show;
  if (!show || typeof show !== "object") return null;
  const id = cleanText(show.id || show.showId || "");
  return id || null;
}

function slotNyxPayload(slot) {
  // If you want click -> Nyx presentation, store:
  // slot.show.nyxPayload e.g. "show:mannix" or "show Mannix"
  if (!slot || typeof slot !== "object") return null;
  const show = slot.show;
  if (!show || typeof show !== "object") return null;
  const p = cleanText(show.nyxPayload || show.payload || "");
  return p || null;
}

function slotHref(slot) {
  if (!slot || typeof slot !== "object") return null;
  const show = slot.show;
  if (!show || typeof show !== "object") return null;
  const href = cleanText(show.href || show.url || "");
  return href || null;
}

function dayKeyFromAuthorNow(authorTz, nowUtc) {
  const idx = partsInTz(new Date(nowUtc), authorTz).weekdayIndex;
  return DOW_KEYS[idx] || "Sunday";
}

function dayDow3FromKey(dayKey) {
  const idx = Math.max(0, DOW_KEYS.indexOf(dayKey));
  return DOW3[idx] || "SUN";
}

function slotIndexForAuthorNow(authorTz, blockSizeMinutes, nowUtc) {
  const hm = partsHMInTz(new Date(nowUtc), authorTz);
  const totalMin = hm.hour * 60 + hm.minute;
  return Math.floor(totalMin / Math.max(1, blockSizeMinutes));
}

function getDaySlots(schedule, dayKey) {
  const week = schedule && schedule.week ? schedule.week : {};
  const arr = week && Array.isArray(week[dayKey]) ? week[dayKey] : [];
  return arr;
}

function getSlotByIndex(daySlots, idx) {
  if (!Array.isArray(daySlots) || daySlots.length === 0) return null;
  if (idx < 0) return null;
  if (idx >= daySlots.length) return null;
  return daySlots[idx];
}

function slotStartUtc(schedule, dayKey, slot, refUtc) {
  const authorTz = schedule.authorTz;
  const dow3 = dayDow3FromKey(dayKey);
  const p = parseHHMM(slot && slot.startET);
  if (!p) return null;
  return getUtcForAuthoringLocal(authorTz, dow3, p.hhmm, refUtc);
}

function slotEndUtc(schedule, slotStartUtcMs) {
  const durMin = Number(schedule.blockSizeMinutes || 30) || 30;
  return slotStartUtcMs + durMin * 60000;
}

function sameShow(a, b) {
  const ta = slotTitle(a);
  const tb = slotTitle(b);
  return cleanText(ta).toLowerCase() === cleanText(tb).toLowerCase();
}

/**
 * Summarize "Today" as show-runs (collapse consecutive slots with same show)
 * Limits output length deterministically.
 */
function summarizeToday(schedule, dayKey, daySlots, startIdx, userTz, refUtc) {
  const runs = [];
  const maxRuns = 10; // keep reply tight

  let i = Math.max(0, startIdx);
  while (i < daySlots.length && runs.length < maxRuns) {
    const cur = daySlots[i];
    const title = slotTitle(cur);

    const startUtc = slotStartUtc(schedule, dayKey, cur, refUtc);
    if (!startUtc) break;

    let j = i + 1;
    while (j < daySlots.length && sameShow(cur, daySlots[j])) j++;

    const endSlot = daySlots[j - 1];
    const endStartUtc = slotStartUtc(schedule, dayKey, endSlot, refUtc);
    const endUtc = endStartUtc ? slotEndUtc(schedule, endStartUtc) : (startUtc + (schedule.blockSizeMinutes || 30) * 60000);

    runs.push({
      title,
      startUtc,
      endUtc,
      // carry a representative slot for links/payload
      slot: cur
    });

    i = j;
  }

  const lines = runs.map((r) => {
    const t1 = fmtTime(r.startUtc, userTz);
    const t2 = fmtTime(r.endUtc, userTz);
    return `• ${t1}–${t2}: ${r.title}`;
  });

  return { runs, lines };
}

// ----------------------------
// Parse "convert 8pm et to london"
// ----------------------------
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
  if (!place) return null;

  return { hour, minute: minRaw, place };
}

function buildEtConversion(authorTz, userTz, hour, minute) {
  // Use "today" in authorTz, at requested time, then format in userTz.
  const now = nowUtcMs();
  const parts = partsInTz(new Date(now), authorTz);
  const utc = zonedTimeToUtcMs(
    { year: parts.year, month: parts.month, day: parts.day, hour, minute },
    authorTz
  );

  return {
    authorLabel: fmtTime(utc, authorTz),
    userLabel: fmtTime(utc, userTz),
    userDow: fmtWeekday3(utc, userTz)
  };
}

// ----------------------------
// Intents
// ----------------------------
function isScheduleQuestion(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;

  return (
    /\b(schedule|programming|what's playing|whats playing|playing now|on now|airing|what time|when does|today|now next|now\/next)\b/.test(t) ||
    /\b(convert)\b/.test(t) ||
    /\b(roku)\b/.test(t)
  );
}

function wantsNowNext(text) {
  const t = cleanText(text).toLowerCase();
  return /\b(now next later|now\/next\/later|now next|now\/next|what's on|whats on)\b/.test(t);
}

function wantsToday(text) {
  const t = cleanText(text).toLowerCase();
  return t === "today" || /\b(show me today|today schedule|today programming)\b/.test(t);
}

function wantsPlayingNow(text) {
  const t = cleanText(text).toLowerCase();
  return /\b(playing now|on now|what's playing|whats playing)\b/.test(t);
}

// details:showId or details showId
function parseDetails(text) {
  const t = cleanText(text);
  const m = t.match(/^(details:|details\s+)([a-z0-9_-]{2,64})$/i);
  if (!m) return null;
  return cleanText(m[2]);
}

// If a UI click sends a Nyx payload: nyx:<payload>
function parseNyxPayload(text) {
  const t = cleanText(text);
  const m = t.match(/^nyx:(.+)$/i);
  if (!m) return null;
  return cleanText(m[1]);
}

// ----------------------------
// Default help
// ----------------------------
function defaultHelpReply() {
  return {
    reply:
      "Schedule is timezone-aware (ET-authored). Try:\n" +
      '• "Now next later"\n' +
      '• "Today"\n' +
      '• "What’s playing now?"\n' +
      '• "Convert 8pm ET to London"',
    followUps: safeFollowUps([
      { label: "Now / Next / Later", send: "Now next later" },
      { label: "Today", send: "Today" },
      { label: "Playing now", send: "What's playing now?" },
      { label: "Convert 8pm ET to London", send: "Convert 8pm ET to London" }
    ]),
    sessionPatch: { lane: "schedule" }
  };
}

// ----------------------------
// Main handler (never-throw)
// ----------------------------
function handleChat({ text, session } = {}) {
  try {
    const schedule = loadScheduleSafe();
    const authorTz = cleanText(schedule.authorTz || "America/Toronto");
    const blockSizeMinutes = Number(schedule.blockSizeMinutes || 30) || 30;

    const message = cleanText(text);
    const low = message.toLowerCase();
    const now = nowUtcMs();

    // Resolve user timezone (device tz + "for me" support via resolver)
    const deviceTz = session && session._lastDeviceTz ? cleanText(session._lastDeviceTz) : "";
    const resolved = resolveTimezone(message, session, deviceTz);
    const userTz = resolved.tz || (session && session.userTz) || "America/Toronto";
    const userCity = resolved.city || (session && session.userCity) || null;
    const tzLabel = userCity ? `${capitalize(userCity)} (${userTz})` : userTz;

    // Persist minimal hints for later turns
    if (session && typeof session === "object") {
      session.userTz = userTz;
      if (userCity) session.userCity = userCity;
      session.lane = "schedule";
    }

    // 0) Explicit Nyx payload relay (slot hyperlinks can send nyx:<payload>)
    const nyxPayload = parseNyxPayload(message);
    if (nyxPayload) {
      return {
        reply: "Passing that to Nyx.",
        followUps: safeFollowUps([
          { label: "Now / Next / Later", send: "Now next later" },
          { label: "Today", send: "Today" }
        ]),
        sessionPatch: { lane: "schedule", pendingNyxPayload: nyxPayload }
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
        reply: `Converted time (today):\n• ${out.authorLabel} ET → ${out.userDow} ${out.userLabel} (${targetLabel})`,
        followUps: safeFollowUps([
          { label: "Now / Next / Later", send: "Now next later" },
          { label: "Today", send: "Today" },
          { label: "Playing now", send: "What's playing now?" }
        ]),
        sessionPatch: { lane: "schedule" }
      };
    }

    // Resolve current author-day + slot index
    const dayKey = dayKeyFromAuthorNow(authorTz, now);
    const daySlots = getDaySlots(schedule, dayKey);
    const idx = slotIndexForAuthorNow(authorTz, blockSizeMinutes, now);

    // If schedule is empty for the day, degrade gracefully
    const hasDay = Array.isArray(daySlots) && daySlots.length > 0;

    // 2) NOW / NEXT / LATER (primary)
    if (wantsNowNext(low) || /\bnow\b/.test(low)) {
      if (!hasDay) {
        return {
          reply:
            `Now / Next / Today (converted to ${tzLabel}):\n` +
            "• Schedule is not loaded for this day yet.\n\n" +
            'If you want, say: "Convert 8pm ET to London".',
          followUps: safeFollowUps([
            { label: "Today", send: "Today" },
            { label: "Convert 8pm ET to London", send: "Convert 8pm ET to London" }
          ]),
          sessionPatch: { lane: "schedule" }
        };
      }

      const nowSlot = getSlotByIndex(daySlots, idx) || getSlotByIndex(daySlots, Math.max(0, daySlots.length - 1));
      const nextSlot = getSlotByIndex(daySlots, idx + 1) || null;
      const laterSlot = getSlotByIndex(daySlots, idx + 2) || null;

      const nowStartUtc = nowSlot ? slotStartUtc(schedule, dayKey, nowSlot, now) : null;
      const nowEndUtc = nowStartUtc != null ? slotEndUtc(schedule, nowStartUtc) : null;

      const nextStartUtc = nextSlot ? slotStartUtc(schedule, dayKey, nextSlot, now) : null;
      const nextEndUtc = nextStartUtc != null ? slotEndUtc(schedule, nextStartUtc) : null;

      const laterStartUtc = laterSlot ? slotStartUtc(schedule, dayKey, laterSlot, now) : null;

      const nowLine = nowStartUtc != null
        ? `Now: ${slotTitle(nowSlot)} — ${fmtTime(nowStartUtc, userTz)}–${fmtTime(nowEndUtc, userTz)}`
        : `Now: ${slotTitle(nowSlot)}`;

      const nextLine = (nextStartUtc != null && nextEndUtc != null)
        ? `Next: ${slotTitle(nextSlot)} — ${fmtTime(nextStartUtc, userTz)}–${fmtTime(nextEndUtc, userTz)}`
        : "Next: (end of day)";

      const laterLine = (laterStartUtc != null)
        ? `Later: ${slotTitle(laterSlot)} — starts ${fmtTime(laterStartUtc, userTz)}`
        : "Later: -";

      // If current slot has a Nyx payload, offer it
      const nowNyx = slotNyxPayload(nowSlot);
      const nowId = slotShowId(nowSlot);
      const nowHref = slotHref(nowSlot);

      const chips = [];
      chips.push({ label: "Today", send: "Today" });
      chips.push({ label: "Now / Next / Later", send: "Now next later" });
      chips.push({ label: "Convert time", send: "Convert 8pm ET to London" });

      if (nowId) chips.unshift({ label: "Details", send: `details:${nowId}` });
      if (nowNyx) chips.unshift({ label: "Open in Nyx", send: `nyx:${nowNyx}` });
      if (nowHref) chips.push({ label: "Show link", send: nowHref });

      return {
        reply:
          `Now / Next / Today (converted to ${tzLabel}):\n` +
          `• ${nowLine}\n` +
          `• ${nextLine}\n` +
          `• ${laterLine}`,
        followUps: safeFollowUps(chips),
        sessionPatch: {
          lane: "schedule",
          _scheduleDayKey: dayKey,
          _scheduleSlotIndex: idx,
          userTz,
          userCity: userCity || undefined
        }
      };
    }

    // 3) TODAY (primary)
    if (wantsToday(low)) {
      if (!hasDay) {
        return {
          reply: `Today (converted to ${tzLabel}):\n• Schedule is not loaded for ${dayKey} yet.`,
          followUps: safeFollowUps([
            { label: "Now / Next / Later", send: "Now next later" },
            { label: "Convert 8pm ET to London", send: "Convert 8pm ET to London" }
          ]),
          sessionPatch: { lane: "schedule" }
        };
      }

      const { runs, lines } = summarizeToday(schedule, dayKey, daySlots, idx, userTz, now);

      // Offer details/nyx for the first run (the “now-ish” run)
      const lead = runs[0] ? runs[0].slot : null;
      const leadId = slotShowId(lead);
      const leadNyx = slotNyxPayload(lead);

      const chips = [];
      chips.push({ label: "Now / Next / Later", send: "Now next later" });
      chips.push({ label: "Playing now", send: "What's playing now?" });
      chips.push({ label: "Convert time", send: "Convert 8pm ET to London" });

      if (leadId) chips.unshift({ label: "Details", send: `details:${leadId}` });
      if (leadNyx) chips.unshift({ label: "Open in Nyx", send: `nyx:${leadNyx}` });

      return {
        reply:
          `Today (${dayKey}) — upcoming blocks (converted to ${tzLabel}):\n` +
          (lines.length ? lines.join("\n") : "• (nothing scheduled)") +
          `\n\nAsk: "details:<showId>" if you want the show card.`,
        followUps: safeFollowUps(chips),
        sessionPatch: {
          lane: "schedule",
          _scheduleDayKey: dayKey,
          _scheduleSlotIndex: idx,
          userTz,
          userCity: userCity || undefined
        }
      };
    }

    // 4) PLAYING NOW
    if (wantsPlayingNow(low)) {
      // In schedule_v1 grid, "playing now" is effectively the current slot.
      if (!hasDay) {
        return {
          reply: `Nothing is scheduled right now (converted to ${tzLabel}) — the day grid isn't loaded.`,
          followUps: safeFollowUps([
            { label: "Now / Next / Later", send: "Now next later" },
            { label: "Today", send: "Today" }
          ]),
          sessionPatch: { lane: "schedule" }
        };
      }

      const nowSlot = getSlotByIndex(daySlots, idx) || getSlotByIndex(daySlots, Math.max(0, daySlots.length - 1));
      const startUtc = nowSlot ? slotStartUtc(schedule, dayKey, nowSlot, now) : null;
      const endUtc = startUtc != null ? slotEndUtc(schedule, startUtc) : null;

      const title = slotTitle(nowSlot);
      const line = startUtc != null
        ? `${title} — ${fmtTime(startUtc, userTz)}–${fmtTime(endUtc, userTz)} (${tzLabel})`
        : `${title} (${tzLabel})`;

      const id = slotShowId(nowSlot);
      const nyx = slotNyxPayload(nowSlot);

      return {
        reply: `Playing now:\n• ${line}`,
        followUps: safeFollowUps([
          id ? { label: "Details", send: `details:${id}` } : null,
          nyx ? { label: "Open in Nyx", send: `nyx:${nyx}` } : null,
          { label: "Now / Next / Later", send: "Now next later" },
          { label: "Today", send: "Today" }
        ].filter(Boolean)),
        sessionPatch: { lane: "schedule" }
      };
    }

    // 5) DETAILS lookup (best-effort; searches week for showId)
    const detailsId = parseDetails(message);
    if (detailsId) {
      // Scan week to find the first slot with matching showId
      let found = null;
      let foundDay = null;

      for (const dk of DOW_KEYS) {
        const slots = getDaySlots(schedule, dk);
        for (const sl of slots) {
          if (slotShowId(sl) === detailsId) {
            found = sl;
            foundDay = dk;
            break;
          }
        }
        if (found) break;
      }

      if (!found) {
        return {
          reply: `I couldn’t find showId "${detailsId}" in the current weekly grid.`,
          followUps: safeFollowUps([
            { label: "Now / Next / Later", send: "Now next later" },
            { label: "Today", send: "Today" }
          ]),
          sessionPatch: { lane: "schedule" }
        };
      }

      const show = (found && typeof found.show === "object") ? found.show : null;
      const title = slotTitle(found);
      const desc = show ? cleanText(show.description || show.desc || "") : "";
      const href = slotHref(found);
      const nyx = slotNyxPayload(found);

      const startUtc = slotStartUtc(schedule, foundDay, found, now);
      const endUtc = startUtc != null ? slotEndUtc(schedule, startUtc) : null;

      const when = (startUtc != null && endUtc != null)
        ? `${foundDay} ${fmtTime(startUtc, userTz)}–${fmtTime(endUtc, userTz)} (${tzLabel})`
        : `${foundDay} (${tzLabel})`;

      return {
        reply:
          `Show details:\n` +
          `• ${title}\n` +
          `• When: ${when}\n` +
          (desc ? `• ${desc}\n` : "") +
          (href ? `• Link: ${href}\n` : "") +
          (nyx ? `• Nyx: nyx:${nyx}\n` : ""),
        followUps: safeFollowUps([
          nyx ? { label: "Open in Nyx", send: `nyx:${nyx}` } : null,
          { label: "Now / Next / Later", send: "Now next later" },
          { label: "Today", send: "Today" }
        ].filter(Boolean)),
        sessionPatch: { lane: "schedule" }
      };
    }

    // If the user is in schedule lane but asked something else, keep them oriented.
    if (isScheduleQuestion(message)) {
      return defaultHelpReply();
    }

    // Default help
    return defaultHelpReply();
  } catch (_) {
    // Never throw from lane
    return {
      reply: 'Schedule Lane hit a snag. Try: "Now next later", "Today", or "Convert 8pm ET to London".',
      followUps: safeFollowUps([
        { label: "Now / Next / Later", send: "Now next later" },
        { label: "Today", send: "Today" },
        { label: "Convert 8pm ET to London", send: "Convert 8pm ET to London" }
      ]),
      sessionPatch: { lane: "schedule" }
    };
  }
}

module.exports = {
  isScheduleQuestion,
  handleChat
};
