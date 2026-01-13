"use strict";

/**
<<<<<<< HEAD
<<<<<<< HEAD
 * Utils/timezoneResolver.js (v1.1)
 *
 * Adds:
 *  - explicitTz parameter (from request payload / device)
 *  - "for me / my time / local time" preference to session or explicit
 *  - IANA validation via Intl.DateTimeFormat (no external libs)
=======
 * Utils/timezoneResolver.js
 *
 * Goal:
 *  - Resolve user's timezone from text:
 *      - Explicit IANA ("Europe/London")
 *      - Common forms ("London", "Toronto", "New York")
 *      - Light abbreviation mapping ("EST", "EDT", "GMT", "BST")
 *
 * Notes:
 *  - This is intentionally small and deterministic.
 *  - Expand CITY_TO_TZ over time as needed.
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
 * Utils/timezoneResolver.js (v1.1)
 *
 * Adds:
 *  - explicitTz parameter (from request payload / device)
 *  - "for me / my time / local time" preference to session or explicit
 *  - IANA validation via Intl.DateTimeFormat (no external libs)
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
 */

function cleanText(s) {
  return String(s || "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
}

const IANA_RE = /\b([A-Za-z]+\/[A-Za-z0-9_\-+]+)\b/;

const ABBR_TO_IANA = {
<<<<<<< HEAD
<<<<<<< HEAD
  utc: "Etc/UTC",
  gmt: "Etc/GMT",
  bst: "Europe/London",
  et: "America/Toronto",
  est: "America/Toronto",
  edt: "America/Toronto",
=======
  // Keep these conservative; abbreviations are ambiguous globally.
  // We use them only when user is clearly talking about a locale.
  gmt: "Etc/GMT",
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
  utc: "Etc/UTC",
  gmt: "Etc/GMT",
  bst: "Europe/London",
  et: "America/Toronto",
<<<<<<< HEAD
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
  est: "America/Toronto",
  edt: "America/Toronto",
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
  pt: "America/Los_Angeles",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
};

const CITY_TO_TZ = {
<<<<<<< HEAD
<<<<<<< HEAD
=======
  // Start with your highest-value cities; expand safely over time.
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
  london: "Europe/London",
  toronto: "America/Toronto",
  "new york": "America/New_York",
  nyc: "America/New_York",
  "los angeles": "America/Los_Angeles",
<<<<<<< HEAD
<<<<<<< HEAD
  "san francisco": "America/Los_Angeles",
  chicago: "America/Chicago",
  vancouver: "America/Vancouver",
  dublin: "Europe/Dublin",
=======
  la: "America/Los_Angeles",
  chicago: "America/Chicago",
  miami: "America/New_York",
  vancouver: "America/Vancouver",
  "san francisco": "America/Los_Angeles",
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
  "san francisco": "America/Los_Angeles",
  chicago: "America/Chicago",
  vancouver: "America/Vancouver",
  dublin: "Europe/Dublin",
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
  paris: "Europe/Paris",
  berlin: "Europe/Berlin",
  madrid: "Europe/Madrid",
  rome: "Europe/Rome",
<<<<<<< HEAD
<<<<<<< HEAD
=======
  dublin: "Europe/Dublin",
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
  singapore: "Asia/Singapore",
  tokyo: "Asia/Tokyo",
  sydney: "Australia/Sydney",
};

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
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
<<<<<<< HEAD
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

=======
function findCity(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

  // Check longer keys first to avoid "la" matching inside words.
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
  const keys = Object.keys(CITY_TO_TZ).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp(`\\b${escapeRegExp(k)}\\b`, "i");
    if (re.test(t)) return k;
  }
  return null;
}

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
function wantsLocalTime(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;
  return /\b(for me|my time|local time|in my timezone|in my time zone)\b/.test(t);
<<<<<<< HEAD
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
=======
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
=======
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
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

<<<<<<< HEAD
  // 5) Default to ET (your platform authoring time)
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
  // 6) default ET
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
  return { ok: true, tz: "America/Toronto", city: null, source: "default" };
}

module.exports = {
  resolveTimezone,
<<<<<<< HEAD
<<<<<<< HEAD
  isValidIanaTz,
=======
>>>>>>> c7b56a1 (Add Schedule Lane v1 (timezone-aware Roku programming) + tz resolver + dataset + regression script)
=======
  isValidIanaTz,
>>>>>>> c3fc3f2 (Schedule Lane v1.1: device timezone, Now/Next/Later, ET conversions, local-time queries)
};
