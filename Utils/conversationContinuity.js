"use strict";

/**
 * Utils/conversationContinuity.js
 *
 * Phase 3 (Continuity & Return) — consult-only overlay.
 * - DOES NOT generate core replies.
 * - Returns continuity signals + optional continuity lines (opener/microRecap/continuityLanguage) + chip set key.
 * - Deterministic selection (no Math.random) based on stable seed inputs.
 *
 * Expected use:
 *   const { consultContinuity } = require("./conversationContinuity");
 *   const cc = consultContinuity({ session, lane, userText, now, year, mode, debug });
 *   // Use cc.openerLine / cc.microRecapLine / cc.continuityLine when appropriate
 *
 * Safe:
 * - Never claims long-term memory
 * - Uses only session fields you already store (lane/year/mode/turnCount/timestamps)
 */

const crypto = require("crypto");

/* =========================
   Load Pack (optional)
========================= */

let PACK = null;
try {
  // Prefer storing JSON at: Data/nyx_conversational_pack_v3_1.json
  // NOTE: adjust path if you keep Data elsewhere.
  // From Utils/ -> ../Data/
  // eslint-disable-next-line import/no-dynamic-require, global-require
  PACK = require("../Data/nyx_conversational_pack_v3_1.json");
} catch (_) {
  PACK = null;
}

/* =========================
   Fallback minimal pack (if JSON missing)
========================= */

const FALLBACK = {
  continuity_language: {
    light: [
      "We can keep going from right here, no extra setup.",
      "We’re already oriented — we don’t need to restart."
    ],
    warm: [
      "We’ve already found a rhythm — we can keep it.",
      "We don’t need to reset — we can just continue."
    ],
    deep: [
      "This has turned into shared space — not a sequence of prompts.",
      "We can let the conversation breathe. Silence is part of the structure."
    ]
  },
  reentry_prompts: {
    generic_resume: [
      "Want to pick up where we were, or start fresh?",
      "Same thread… or a clean slate?"
    ],
    soft_resume_music: [
      "Want to stay with {year}, or shift the lens — #1, story, or micro?",
      "Same year, different doorway?"
    ],
    restart_graceful: [
      "No problem — fresh start. Give me a year (1950–2024) or a mode like “top 10” or “story moment.”"
    ]
  },
  return_session_openers: {
    light: ["Welcome back. Want familiar… or different?"],
    warm: ["We can pick up quickly — no recap needed."],
    deep: ["Welcome back. We can continue like no time passed."]
  },
  micro_recaps: {
    music: ["We’ve got a thread: {year}, {mode}. Want the next step?"],
    general: ["We’ve found a pace that works. Want to stay with it?"]
  },
  continuity_chips: {
    resume_set: [
      { label: "Resume", send: "resume" },
      { label: "Start fresh", send: "start fresh" }
    ],
    music_resume_set: [
      { label: "Top 10", send: "top 10" },
      { label: "Story", send: "story moment" }
    ],
    return_set: [
      { label: "Pick a year", send: "1988" },
      { label: "Another year", send: "another year" }
    ]
  }
};

function getPack() {
  // Support either:
  // - pack root contains keys directly (v3.x JSON)
  // - or nested under `phase3` (if you later refactor)
  const p = PACK && typeof PACK === "object" ? PACK : null;
  if (p && (p.continuity_language || (p.phase3 && p.phase3.continuity_language))) return p.phase3 || p;
  return FALLBACK;
}

/* =========================
   Helpers
========================= */

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function clampYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n < 1950 || n > 2024) return null;
  return n;
}

function normalizeMode(mode) {
  const m = norm(mode);
  if (!m) return null;
  if (m === "top10" || m === "top 10" || m === "top ten" || m === "top") return "top10";
  if (m === "top100" || m === "top 100" || m === "hot 100" || m === "year-end hot 100" || m === "year end hot 100") return "top100";
  if (m === "story" || m === "story moment" || m === "story_moment") return "story";
  if (m === "micro" || m === "micro moment" || m === "micro_moment") return "micro";
  if (m === "#1" || m === "number1" || m === "number 1" || m === "no.1" || m === "no 1") return "number1";
  return null;
}

function nowMs(now) {
  return Number.isFinite(now) ? Number(now) : Date.now();
}

function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}

function pickDeterministic(list, seed) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const h = sha1(seed || "seed");
  // Take first 8 hex chars -> 32-bit int
  const n = parseInt(h.slice(0, 8), 16);
  const idx = Number.isFinite(n) ? (n % list.length) : 0;
  return list[idx] || list[0] || null;
}

function replaceVars(str, vars) {
  let out = String(str || "");
  if (!vars || typeof vars !== "object") return out;
  for (const k of Object.keys(vars)) out = out.split(`{${k}}`).join(String(vars[k]));
  return out;
}

function safeChipKey(key) {
  const k = String(key || "");
  if (k === "resume_set" || k === "music_resume_set" || k === "return_set") return k;
  return "resume_set";
}

function withinMs(nowT, thenT, windowMs) {
  const n = Number(nowT);
  const t = Number(thenT);
  const w = Number(windowMs);
  if (!Number.isFinite(n) || !Number.isFinite(t) || !Number.isFinite(w)) return false;
  const d = n - t;
  return d >= 0 && d <= w;
}

/* =========================
   Continuity inference
========================= */

function depthBand(turnCount) {
  const t = Number(turnCount || 0);
  if (t <= 0) return "early";     // 0–5
  if (t <= 5) return "early";
  if (t <= 15) return "mid";
  if (t <= 30) return "late";
  return "deep";
}

function continuityLevelFrom({ depth, lastOutAt, nowT }) {
  // Continuity is stronger if conversation is active/recent.
  // IMPORTANT: this is session-time continuity, not long-term memory.
  if (!lastOutAt) {
    // No known output timestamp; continuity purely from depth.
    if (depth === "deep") return "deep";
    if (depth === "late") return "warm";
    if (depth === "mid") return "light";
    return "none";
  }

  // windows tuned for conversational return experience
  const RECENT_MS = 2 * 60 * 1000;     // 2 minutes
  const WARM_MS = 20 * 60 * 1000;      // 20 minutes
  const SAME_SESSION_MS = 90 * 60 * 1000; // 90 minutes

  if (withinMs(nowT, lastOutAt, RECENT_MS)) {
    // active session → continuity based on depth
    if (depth === "deep") return "deep";
    if (depth === "late") return "deep";
    if (depth === "mid") return "warm";
    return "light";
  }

  if (withinMs(nowT, lastOutAt, WARM_MS)) {
    // short break → warm continuity
    if (depth === "deep") return "deep";
    if (depth === "late") return "warm";
    return "light";
  }

  if (withinMs(nowT, lastOutAt, SAME_SESSION_MS)) {
    // longer pause in same “visit”
    if (depth === "deep" || depth === "late") return "warm";
    return "light";
  }

  // very old → treat as none (avoid implying memory)
  return "none";
}

function reentryStyleFrom({ continuityLevel, lane }) {
  const l = String(lane || "general").toLowerCase();
  if (continuityLevel === "none") return "restart";
  if (continuityLevel === "light") return l === "music" ? "soft_resume" : "resume";
  if (continuityLevel === "warm") return l === "music" ? "soft_resume" : "resume";
  return l === "music" ? "soft_resume" : "resume";
}

function chooseChipsKey({ lane, continuityLevel }) {
  const l = String(lane || "general").toLowerCase();
  if (continuityLevel === "none") return "return_set";
  if (l === "music") return "music_resume_set";
  return "resume_set";
}

/* =========================
   Public API
========================= */

function consultContinuity({ session, lane, userText, now, year, mode, debug }) {
  const s = session && typeof session === "object" ? session : {};
  const pack = getPack();

  const nowT = nowMs(now);

  const sessionLane = String(lane || s.lane || "general").toLowerCase();
  const tCount = Number(s.turnCount || s.turns || 0);

  const y = clampYear(year) || clampYear(s.lastMusicYear) || null;
  const m = normalizeMode(mode) || normalizeMode(s.activeMusicMode) || null;

  const depth = depthBand(tCount);
  const lastOutAt = Number(s.__lastOutAt || s.__musicLastContentAt || 0) || 0;

  const continuityLevel = continuityLevelFrom({ depth, lastOutAt, nowT });
  const reentryStyle = reentryStyleFrom({ continuityLevel, lane: sessionLane });

  const allowReturnLanguage = continuityLevel !== "none";
  const suggestResumeOptions = continuityLevel !== "none";

  const chipsSetKey = safeChipKey(chooseChipsKey({ lane: sessionLane, continuityLevel }));

  // Seed selection: stable across repeated calls within a session turn
  const seedBase =
    [
      "cc",
      continuityLevel,
      depth,
      sessionLane,
      norm(userText || ""),
      String(y || ""),
      String(m || ""),
      String(s.__lastOutSig || s.__musicLastContentSig || "")
    ].join("|");

  const vars = {
    year: y || "",
    mode: m || ""
  };

  // Select continuity line (optional)
  const contPool =
    (pack.continuity_language && pack.continuity_language[continuityLevel]) ||
    (pack.continuity_language && pack.continuity_language.warm) ||
    (FALLBACK.continuity_language && FALLBACK.continuity_language.warm) ||
    [];

  const continuityLine = replaceVars(pickDeterministic(contPool, seedBase + "|cont"), vars);

  // Select re-entry opener (optional)
  const openPool =
    (pack.return_session_openers && pack.return_session_openers[continuityLevel]) ||
    (pack.return_session_openers && pack.return_session_openers.warm) ||
    [];

  const openerLine = replaceVars(pickDeterministic(openPool, seedBase + "|open"), vars);

  // Select micro recap (optional)
  const recapGroup = sessionLane === "music" ? "music" : "general";
  const recapPool =
    (pack.micro_recaps && pack.micro_recaps[recapGroup]) ||
    (FALLBACK.micro_recaps && FALLBACK.micro_recaps[recapGroup]) ||
    [];

  const microRecapLine = replaceVars(pickDeterministic(recapPool, seedBase + "|recap"), vars);

  // Select re-entry prompt (optional)
  let reentryPrompt = null;
  if (pack.reentry_prompts) {
    if (reentryStyle === "restart") {
      reentryPrompt = replaceVars(
        pickDeterministic(pack.reentry_prompts.restart_graceful || [], seedBase + "|restart"),
        vars
      );
    } else if (reentryStyle === "soft_resume" && sessionLane === "music") {
      reentryPrompt = replaceVars(
        pickDeterministic(pack.reentry_prompts.soft_resume_music || [], seedBase + "|softmusic"),
        vars
      );
    } else {
      reentryPrompt = replaceVars(
        pickDeterministic(pack.reentry_prompts.generic_resume || [], seedBase + "|resume"),
        vars
      );
    }
  }

  const out = {
    continuityLevel,          // none|light|warm|deep
    depth,                    // early|mid|late|deep
    reentryStyle,             // restart|resume|soft_resume
    allowReturnLanguage,      // boolean
    suggestResumeOptions,     // boolean
    chipsSetKey,              // resume_set|music_resume_set|return_set

    // Optional strings (caller decides to use)
    openerLine: openerLine || null,
    microRecapLine: microRecapLine || null,
    continuityLine: continuityLine || null,
    reentryPrompt: reentryPrompt || null,

    // Vars caller can reuse
    vars: { year: y, mode: m },

    // Chips payload from pack (caller can still normalize)
    chips:
      (pack.continuity_chips && pack.continuity_chips[chipsSetKey]) ||
      (FALLBACK.continuity_chips && FALLBACK.continuity_chips[chipsSetKey]) ||
      []
  };

  if (debug) {
    out._debug = {
      nowT,
      lastOutAt,
      seedBase,
      sessionLane,
      turnCount: tCount,
      packLoaded: !!PACK
    };
  }

  return out;
}

module.exports = {
  consultContinuity,
  replaceVars,
  clampYear,
  normalizeMode
};
