"use strict";

/**
 * Utils/timezoneResolver.js (v1.1)
 *
 * Adds:
 *  - explicitTz parameter (from request payload / device)
 *  - "for me / my time / local time" preference to session or explicit
 *  - IANA validation via Intl.DateTimeFormat (no external libs)
 */

function cleanText(s) {
  return String(s || "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
}

const IANA_RE = /\b([A-Za-z]+\/[A-Za-z0-9_\-+]+)\b/;

const ABBR_TO_IANA = {
  utc: "Etc/UTC",
  gmt: "Etc/GMT",
  bst: "Europe/London",
  et: "America/Toronto",
  est: "America/Toronto",
  edt: "America/Toronto",
  pt: "America/Los_Angeles",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
};

const CITY_TO_TZ = {
  london: "Europe/London",
  toronto: "America/Toronto",
  "new york": "America/New_York",
  nyc: "America/New_York",
  "los angeles": "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  chicago: "America/Chicago",
  vancouver: "America/Vancouver",
  dublin: "Europe/Dublin",
  paris: "Europe/Paris",
  berlin: "Europe/Berlin",
  madrid: "Europe/Madrid",
  rome: "Europe/Rome",
  singapore: "Asia/Singapore",
  tokyo: "Asia/Tokyo",
  sydney: "Australia/Sydney",
};

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidIanaTz(tz) {
  const z = cleanText(tz);
  if (!z) return false;
  try {
    // throws RangeError on invalid tz
    new Intl.DateTimeFormat("en-CA", { timeZone: z }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
}

function findCityKey(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

  const keys = Object.keys(CITY_TO_TZ).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp(`\\b${escapeRegExp(k)}\\b`, "i");
    if (re.test(t)) return k;
  }
  return null;
}

function wantsLocalTime(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;
  return /\b(for me|my time|local time|in my timezone|in my time zone)\b/.test(t);
}

/**
 * resolveTimezone(text, session, explicitTz)
 *
 * explicitTz:
 *  - preferred when user says "for me" or when no other tz mentioned
 *  - should be an IANA string from widget: Intl.DateTimeFormat().resolvedOptions().timeZone
 */
function resolveTimezone(text, session, explicitTz) {
  const raw = cleanText(text);
  const low = raw.toLowerCase();

  const explicit = cleanText(explicitTz || "");
  const explicitOk = explicit && isValidIanaTz(explicit);

  // If user requests "for me", prefer explicit or stored session tz.
  if (wantsLocalTime(raw)) {
    if (explicitOk) return { ok: true, tz: explicit, city: null, source: "explicit" };
    if (session && session.userTz && isValidIanaTz(session.userTz)) {
      return { ok: true, tz: session.userTz, city: session.userCity || null, source: "session" };
    }
    return { ok: true, tz: "America/Toronto", city: null, source: "default" };
  }

  // 1) Explicit IANA in text
  const m = raw.match(IANA_RE);
  if (m && m[1] && isValidIanaTz(m[1])) {
    return { ok: true, tz: cleanText(m[1]), city: null, source: "iana" };
  }

  // 2) Abbreviation
  const abbrMatch = low.match(/\b(utc|gmt|bst|est|edt|et|pt|pst|pdt)\b/i);
  if (abbrMatch && abbrMatch[1]) {
    const abbr = cleanText(abbrMatch[1]).toLowerCase();
    const tz = ABBR_TO_IANA[abbr] || null;
    if (tz && isValidIanaTz(tz)) return { ok: true, tz, city: null, source: "abbr" };
  }

  // 3) City
  const cityKey = findCityKey(raw);
  if (cityKey) {
    const tz = CITY_TO_TZ[cityKey] || null;
    if (tz && isValidIanaTz(tz)) return { ok: true, tz, city: cityKey, source: "city" };
  }

  // 4) explicitTz from device if provided
  if (explicitOk) return { ok: true, tz: explicit, city: null, source: "explicit" };

  // 5) session tz
  if (session && session.userTz && isValidIanaTz(session.userTz)) {
    return { ok: true, tz: session.userTz, city: session.userCity || null, source: "session" };
  }

  // 6) default ET
  return { ok: true, tz: "America/Toronto", city: null, source: "default" };
}

module.exports = {
  resolveTimezone,
  isValidIanaTz,
};
