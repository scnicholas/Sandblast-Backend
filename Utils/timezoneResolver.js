"use strict";

/**
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
 */

function cleanText(s) {
  return String(s || "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
}

const IANA_RE = /\b([A-Za-z]+\/[A-Za-z0-9_\-+]+)\b/;

const ABBR_TO_IANA = {
  // Keep these conservative; abbreviations are ambiguous globally.
  // We use them only when user is clearly talking about a locale.
  gmt: "Etc/GMT",
  utc: "Etc/UTC",
  bst: "Europe/London", // British Summer Time (contextual)
  est: "America/Toronto", // treat as ET for your platform default
  edt: "America/Toronto",
  et: "America/Toronto",
  pt: "America/Los_Angeles",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
};

const CITY_TO_TZ = {
  // Start with your highest-value cities; expand safely over time.
  london: "Europe/London",
  toronto: "America/Toronto",
  "new york": "America/New_York",
  nyc: "America/New_York",
  "los angeles": "America/Los_Angeles",
  la: "America/Los_Angeles",
  chicago: "America/Chicago",
  miami: "America/New_York",
  vancouver: "America/Vancouver",
  "san francisco": "America/Los_Angeles",
  paris: "Europe/Paris",
  berlin: "Europe/Berlin",
  madrid: "Europe/Madrid",
  rome: "Europe/Rome",
  dublin: "Europe/Dublin",
  singapore: "Asia/Singapore",
  tokyo: "Asia/Tokyo",
  sydney: "Australia/Sydney",
};

function findCity(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

  // Check longer keys first to avoid "la" matching inside words.
  const keys = Object.keys(CITY_TO_TZ).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp(`\\b${escapeRegExp(k)}\\b`, "i");
    if (re.test(t)) return k;
  }
  return null;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveTimezone(text, session) {
  const raw = cleanText(text);
  const t = raw.toLowerCase();

  // 1) Explicit IANA
  const m = raw.match(IANA_RE);
  if (m && m[1]) {
    const tz = cleanText(m[1]);
    return { ok: true, tz, city: null, source: "iana" };
  }

  // 2) Abbreviation
  const abbrMatch = t.match(/\b(utc|gmt|bst|est|edt|et|pt|pst|pdt)\b/i);
  if (abbrMatch && abbrMatch[1]) {
    const abbr = cleanText(abbrMatch[1]).toLowerCase();
    const tz = ABBR_TO_IANA[abbr] || null;
    if (tz) return { ok: true, tz, city: null, source: "abbr" };
  }

  // 3) City match
  const cityKey = findCity(raw);
  if (cityKey) {
    const tz = CITY_TO_TZ[cityKey] || null;
    if (tz) return { ok: true, tz, city: cityKey, source: "city" };
  }

  // 4) If session already has a tz, keep it
  if (session && session.userTz) {
    return { ok: true, tz: session.userTz, city: session.userCity || null, source: "session" };
  }

  // 5) Default to ET (your platform authoring time)
  return { ok: true, tz: "America/Toronto", city: null, source: "default" };
}

module.exports = {
  resolveTimezone,
};
