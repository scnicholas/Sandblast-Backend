"use strict";

/**
 * Utils/timezoneResolver.js (v1.2)
 *
 * Resolves a timezone from an explicit IANA value, a conservative abbreviation,
 * a supported city name, the device timezone, the session timezone, or the
 * Sandblast authoring default (America/Toronto).
 */

const DEFAULT_TIMEZONE = "America/Toronto";

function cleanText(value) {
  return String(value || "")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const IANA_RE = /\b([A-Za-z]+\/[A-Za-z0-9_\-+]+)\b/;

const ABBR_TO_IANA = Object.freeze({
  utc: "Etc/UTC",
  gmt: "Etc/GMT",
  bst: "Europe/London",
  et: "America/Toronto",
  est: "America/Toronto",
  edt: "America/Toronto",
  pt: "America/Los_Angeles",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles"
});

const CITY_TO_TZ = Object.freeze({
  london: "Europe/London",
  toronto: "America/Toronto",
  "new york": "America/New_York",
  nyc: "America/New_York",
  "los angeles": "America/Los_Angeles",
  la: "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  chicago: "America/Chicago",
  miami: "America/New_York",
  vancouver: "America/Vancouver",
  dublin: "Europe/Dublin",
  paris: "Europe/Paris",
  berlin: "Europe/Berlin",
  madrid: "Europe/Madrid",
  rome: "Europe/Rome",
  singapore: "Asia/Singapore",
  tokyo: "Asia/Tokyo",
  sydney: "Australia/Sydney"
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidIanaTz(timezone) {
  const normalized = cleanText(timezone);
  if (!normalized) return false;

  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: normalized }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
}

function findCityKey(text) {
  const normalized = cleanText(text).toLowerCase();
  if (!normalized) return null;

  const keys = Object.keys(CITY_TO_TZ).sort((left, right) => right.length - left.length);
  for (const key of keys) {
    const expression = new RegExp(`\\b${escapeRegExp(key)}\\b`, "i");
    if (expression.test(normalized)) return key;
  }

  return null;
}

function wantsLocalTime(text) {
  const normalized = cleanText(text).toLowerCase();
  if (!normalized) return false;
  return /\b(for me|my time|local time|in my timezone|in my time zone)\b/.test(normalized);
}

function sessionTimezone(session) {
  const source = session && typeof session === "object" ? session : {};
  const timezone = cleanText(source.userTz || source.timezone || source.timeZone || "");
  return isValidIanaTz(timezone) ? timezone : "";
}

function resolveTimezone(text, session, explicitTz) {
  const raw = cleanText(text);
  const lower = raw.toLowerCase();
  const explicit = cleanText(explicitTz);
  const explicitValid = isValidIanaTz(explicit);
  const stored = sessionTimezone(session);

  if (wantsLocalTime(raw)) {
    if (explicitValid) return { ok: true, tz: explicit, city: null, source: "explicit" };
    if (stored) {
      return {
        ok: true,
        tz: stored,
        city: cleanText(session && session.userCity) || null,
        source: "session"
      };
    }
    return { ok: true, tz: DEFAULT_TIMEZONE, city: null, source: "default" };
  }

  const ianaMatch = raw.match(IANA_RE);
  if (ianaMatch && ianaMatch[1] && isValidIanaTz(ianaMatch[1])) {
    return { ok: true, tz: cleanText(ianaMatch[1]), city: null, source: "iana" };
  }

  const abbreviationMatch = lower.match(/\b(utc|gmt|bst|est|edt|et|pt|pst|pdt)\b/i);
  if (abbreviationMatch && abbreviationMatch[1]) {
    const abbreviation = cleanText(abbreviationMatch[1]).toLowerCase();
    const timezone = ABBR_TO_IANA[abbreviation] || "";
    if (isValidIanaTz(timezone)) {
      return { ok: true, tz: timezone, city: null, source: "abbr" };
    }
  }

  const cityKey = findCityKey(raw);
  if (cityKey) {
    const timezone = CITY_TO_TZ[cityKey] || "";
    if (isValidIanaTz(timezone)) {
      return { ok: true, tz: timezone, city: cityKey, source: "city" };
    }
  }

  if (explicitValid) return { ok: true, tz: explicit, city: null, source: "explicit" };

  if (stored) {
    return {
      ok: true,
      tz: stored,
      city: cleanText(session && session.userCity) || null,
      source: "session"
    };
  }

  return { ok: true, tz: DEFAULT_TIMEZONE, city: null, source: "default" };
}

module.exports = {
  DEFAULT_TIMEZONE,
  ABBR_TO_IANA,
  CITY_TO_TZ,
  resolveTimezone,
  isValidIanaTz,
  findCityKey,
  wantsLocalTime
};
