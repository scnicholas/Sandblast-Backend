"use strict";

/**
 * Utils/timezoneResolver.js
 *
 * Purpose:
 *  - Resolve user's timezone from text or session
 *  - Map common cities -> IANA time zones
 *  - Provide safe fallbacks + a confidence score
 *
 * Notes:
 *  - Deterministic and conservative: if uncertain, it returns null tz and suggests chips.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CITY_MAP_FILE = path.join(ROOT, "Data", "timezone_city_map_v1.json");

// Minimal built-in seed to prevent empty map on first run
const SEED_MAP = {
  "london": "Europe/London",
  "toronto": "America/Toronto",
  "new york": "America/New_York",
  "nyc": "America/New_York",
  "los angeles": "America/Los_Angeles",
  "la": "America/Los_Angeles",
  "vancouver": "America/Vancouver",
  "chicago": "America/Chicago",
  "miami": "America/New_York"
};

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

function loadCityMap() {
  const j = safeReadJson(CITY_MAP_FILE);
  if (!j || typeof j !== "object") return { ...SEED_MAP };

  // Allow both {"London":"Europe/London"} and {"london":"Europe/London"}
  const out = { ...SEED_MAP };
  for (const [k, v] of Object.entries(j)) {
    if (!v) continue;
    out[normalize(k)] = String(v).trim();
  }
  return out;
}

const CITY_MAP = loadCityMap();

function extractCityCandidate(text) {
  const t = normalize(text);

  // Quick wins: "in london", "from london", "i'm in london"
  const m = t.match(/\b(in|from|at)\s+([a-zA-Z][a-zA-Z\s.'-]{1,32})\b/);
  if (m && m[2]) return normalize(m[2]);

  // If user only typed a city name
  if (t.length > 1 && t.length <= 40 && !/\d/.test(t)) {
    return t;
  }

  return null;
}

function resolveTimezone({ text, session }) {
  const out = {
    tz: null,
    city: null,
    confidence: 0.0,
    source: "none",
    followUps: []
  };

  // 1) Session stickiness
  if (session && session.userTz && typeof session.userTz === "string") {
    out.tz = session.userTz;
    out.city = session.userCity || null;
    out.confidence = 0.95;
    out.source = "session";
    return out;
  }

  // 2) Parse from text
  const cityCandidate = extractCityCandidate(text);
  if (cityCandidate && CITY_MAP[cityCandidate]) {
    out.tz = CITY_MAP[cityCandidate];
    out.city = cityCandidate;
    out.confidence = 0.85;
    out.source = "city_map";
    return out;
  }

  // 3) Weak heuristics for GMT/UK wording
  const t = normalize(text);
  if (/\b(uk|britain|england|london|gmt)\b/.test(t)) {
    out.tz = "Europe/London";
    out.city = "london";
    out.confidence = 0.65;
    out.source = "heuristic";
    return out;
  }

  // 4) Unknown — propose chips
  out.followUps = [
    { label: "Toronto (ET)", send: "I'm in Toronto" },
    { label: "London (UK)", send: "I'm in London" },
    { label: "New York (ET)", send: "I'm in New York" },
    { label: "Los Angeles (PT)", send: "I'm in Los Angeles" }
  ];

  return out;
}

module.exports = {
  resolveTimezone,
  loadCityMap
};
