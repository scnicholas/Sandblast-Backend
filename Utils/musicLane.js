"use strict";

/**
 * Utils/musicLane.js
 *
 * Authoritative music responder for Nyx.
 * - Deterministic
 * - Dependency-light
 * - Never throws (returns safe fallback)
 *
 * Inputs: { text, session, visitorId, debug }
 * Output: { reply, followUps, sessionPatch, _engine? }
 *
 * Data deps (expected):
 *  - Data/top10_by_year_v1.json
 *  - Data/music_moments_v1.json (optional; story/micro)
 *
 * Contract:
 *  - top10: returns ranked 1..10 list
 *  - number1: returns #1 song
 *  - story/micro: returns story/micro moment if present else fallback
 *  - top100: returns a safe “not yet wired” response unless you add a dataset
 */

const fs = require("fs");
const path = require("path");

const TOP10_PATH = path.join(process.cwd(), "Data", "top10_by_year_v1.json");
const MOMENTS_PATH = path.join(process.cwd(), "Data", "music_moments_v1.json"); // optional

let _TOP10 = null;
let _TOP10_ERR = null;

let _MOMENTS = null;
let _MOMENTS_ERR = null;

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function clampYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n < 1950 || n > 2024) return null;
  return n;
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
  return m ? clampYear(m[1]) : null;
}

function normalizeMode(text) {
  const t = norm(text);

  if (/\b(story\s*moment|story)\b/.test(t)) return "story";
  if (/\b(micro\s*moment|micro)\b/.test(t)) return "micro";
  if (/\b(#\s*1|number\s*1|no\.?\s*1|no\s*1)\b/.test(t)) return "number1";

  // explicit year-end/top100 only
  if (/\b(top\s*100|top100|hot\s*100|year[-\s]*end\s*hot\s*100)\b/.test(t)) return "top100";

  // default music mode
  if (/\b(top\s*10|top10|top\s*ten|top)\b/.test(t)) return "top10";

  return null;
}

function safeFollowUpsForYear(year) {
  if (!year) {
    return [
      "1988",
      "top 10 1988",
      "story moment 1988",
      "micro moment 1988",
      "#1 1988",
    ];
  }
  return [
    `top 10 ${year}`,
    `#1 ${year}`,
    `story moment ${year}`,
    `micro moment ${year}`,
    `top 100 ${year}`,
    "another year",
    "next year",
  ];
}

function loadTop10() {
  if (_TOP10) return _TOP10;
  if (_TOP10_ERR) return null;
  try {
    const raw = fs.readFileSync(TOP10_PATH, "utf8");
    const json = JSON.parse(raw);

    // Accept either:
    // A) { years: { "1980": [ {pos,title,artist}, ... ] } }
    // B) { "1980": [ ... ] }
    const years = (json && json.years && typeof json.years === "object") ? json.years : json;

    if (!years || typeof years !== "object") {
      _TOP10_ERR = "bad_shape";
      return null;
    }
    _TOP10 = years;
    return _TOP10;
  } catch (e) {
    _TOP10_ERR = String(e && e.message ? e.message : e);
    return null;
  }
}

function loadMoments() {
  if (_MOMENTS) return _MOMENTS;
  if (_MOMENTS_ERR) return null;
  try {
    if (!fs.existsSync(MOMENTS_PATH)) {
      _MOMENTS_ERR = "missing";
      return null;
    }
    const raw = fs.readFileSync(MOMENTS_PATH, "utf8");
    const json = JSON.parse(raw);

    // Accept either:
    // A) { moments: { "1980": { story:"", micro:"" } } }
    // B) { "1980": { story:"", micro:"" } }
    const moments = (json && json.moments && typeof json.moments === "object") ? json.moments : json;

    if (!moments || typeof moments !== "object") {
      _MOMENTS_ERR = "bad_shape";
      return null;
    }
    _MOMENTS = moments;
    return _MOMENTS;
  } catch (e) {
    _MOMENTS_ERR = String(e && e.message ? e.message : e);
    return null;
  }
}

function formatTop10(year, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return `I don’t have a Top 10 list loaded for ${year} yet.`;

  // Ensure deterministic order
  const sorted = list
    .map((r) => ({
      pos: Number(r.pos || r.rank || r.position || 0),
      title: String(r.title || r.song || r.track || "").trim(),
      artist: String(r.artist || r.performer || "").trim(),
    }))
    .filter((r) => r.title && r.artist)
    .sort((a, b) => (a.pos || 999) - (b.pos || 999))
    .slice(0, 10);

  if (!sorted.length) return `I found data for ${year}, but it’s not in the expected Top 10 shape.`;

  const lines = sorted.map((r, i) => {
    const n = r.pos && r.pos > 0 ? r.pos : (i + 1);
    return `${n}. ${r.title} — ${r.artist}`;
  });

  return `Top 10 (${year})\n` + lines.join("\n");
}

function pickNumber1(year, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const best =
    list.find((r) => Number(r.pos || r.rank || r.position) === 1) ||
    list.find((r) => String(r.pos || r.rank || r.position) === "1") ||
    list[0] ||
    null;

  if (!best) return `I don’t have the #1 song loaded for ${year} yet.`;

  const title = String(best.title || best.song || best.track || "").trim();
  const artist = String(best.artist || best.performer || "").trim();
  if (!title || !artist) return `I found data for ${year}, but the #1 row is missing title/artist.`;

  return `#1 song (${year})\n${title} — ${artist}`;
}

function getMoment(year, type) {
  const moments = loadMoments();
  if (!moments) return null;

  const m = moments[String(year)] || null;
  if (!m || typeof m !== "object") return null;

  const key = type === "micro" ? "micro" : "story";
  const txt = String(m[key] || "").trim();
  return txt || null;
}

async function handleChat({ text, session, visitorId, debug }) {
  try {
    const t = String(text || "").trim();
    const s = session || {};

    const yearFromText = extractYear(t);
    const year = yearFromText || clampYear(s.lastMusicYear) || null;

    const modeFromText = normalizeMode(t);
    let mode = modeFromText || norm(s.activeMusicMode) || null;
    if (mode && mode === "top 10") mode = "top10";

    // Default mode if we have a year and user is “music-ish”
    if (!mode && year) mode = "top10";

    // HARD GUARD: never enter top100 unless explicitly requested now
    const wantsTop100Now = /\b(top\s*100|top100|hot\s*100|year[-\s]*end\s*hot\s*100)\b/.test(norm(t));
    if (mode === "top100" && !wantsTop100Now) mode = "top10";

    // No year → ask gently
    if (!year) {
      return {
        reply: "Tell me a year (1950–2024) and I’ll pull music from that era. For example: “top 10 1980” or “#1 1980”.",
        followUps: safeFollowUpsForYear(null),
        sessionPatch: { lane: "music", activeMusicMode: mode || "top10" },
        ...(debug ? { _engine: { ok: true, lane: "music", reason: "need_year" } } : {}),
      };
    }

    // Load Top10 data once we actually need it
    const years = loadTop10();

    const rows = years ? (years[String(year)] || years[Number(year)] || null) : null;

    let reply = "";
    if (mode === "story" || mode === "micro") {
      const moment = getMoment(year, mode);
      if (moment) {
        reply = `${mode === "micro" ? "Micro moment" : "Story moment"} (${year})\n${moment}`;
      } else {
        // graceful fallback to top10 if moments missing
        reply = years ? formatTop10(year, rows) : `I don’t have story moments wired yet for ${year}.`;
        mode = years ? "top10" : mode;
      }
    } else if (mode === "number1") {
      if (years) reply = pickNumber1(year, rows);
      else reply = `I can’t access the Top 10 dataset right now (missing ${path.basename(TOP10_PATH)}).`;
    } else if (mode === "top100") {
      // Only if you later add a dataset; for now: explicit message
      reply = `Billboard Year-End Hot 100 (${year}) isn’t wired yet. If you want it, I’ll add a dataset + renderer.\nFor now I can do: Top 10 (${year}), #1 (${year}), story, micro.`;
      mode = "top100";
    } else {
      // top10 default
      if (years) reply = formatTop10(year, rows);
      else reply = `I can’t access the Top 10 dataset right now (missing ${path.basename(TOP10_PATH)}).`;
      mode = "top10";
    }

    const sessionPatch = {
      lane: "music",
      lastMusicYear: year,
      activeMusicMode: mode,
    };

    return {
      reply,
      followUps: safeFollowUpsForYear(year),
      sessionPatch,
      ...(debug ? {
        _engine: {
          ok: true,
          lane: "music",
          year,
          mode,
          hasTop10: !!years,
          top10Err: _TOP10_ERR,
          hasMoments: !!_MOMENTS,
          momentsErr: _MOMENTS_ERR,
        }
      } : {}),
    };
  } catch (e) {
    return {
      reply: "I hit a snag reading the music data. Try again with: “top 10 1980”.",
      followUps: safeFollowUpsForYear(null),
      sessionPatch: { lane: "music", activeMusicMode: "top10" },
      ...(debug ? { _engine: { ok: false, error: String(e && e.message ? e.message : e) } } : {}),
    };
  }
}

module.exports = { handleChat };
