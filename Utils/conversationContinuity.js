"use strict";

/**
 * Utils/conversationContinuity.js
 *
 * Phase 3 (Continuity & Return) — consult-only overlay.
 * - DOES NOT generate core replies.
 * - Returns continuity signals + optional continuity lines (opener/microRecap/continuityLanguage) + chip set key.
 * - Deterministic selection (no Math.random) based on stable seed inputs.
 *
 * v3.1a (HARDENED):
 * ✅ Defensive pack loading: supports root keys OR {phase3:{...}} OR {packs:{phase3:{...}}}
 * ✅ Safer fallbacks: never returns undefined strings; trims; handles missing arrays cleanly
 * ✅ Deterministic pick uses hash→uint32 with explicit handling
 * ✅ Continuity thresholds tunable via env (optional)
 * ✅ Adds `continuityUsable` + `shouldOfferReentry` helpers to simplify chatEngine integration
 * ✅ Adds `shouldInjectContinuityLine` heuristic (sprinkle, not pour)
 *
 * Expected use:
 *   const { consultContinuity } = require("./conversationContinuity");
 *   const cc = consultContinuity({ session, lane, userText, now, year, mode, debug });
 *   // Use cc.openerLine / cc.microRecapLine / cc.continuityLine / cc.reentryPrompt when appropriate
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
let _packLoadErr = null;

try {
  // Preferred: Data/nyx_conversational_pack_v3_1.json
  // From Utils/ -> ../Data/
  // eslint-disable-next-line import/no-dynamic-require, global-require
  PACK = require("../Data/nyx_conversational_pack_v3_1.json");
} catch (e) {
  PACK = null;
  _packLoadErr = e ? String(e && e.message ? e.message : e) : "pack_load_error";
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

/* =========================
   Pack normalization
========================= */

function resolvePhase3Pack(p) {
  if (!p || typeof p !== "object") return null;

  // v3.x root keys
  if (p.continuity_language || p.reentry_prompts || p.return_session_openers) return p;

  // nested: { phase3: {...} }
  if (p.phase3 && typeof p.phase3 === "object") return p.phase3;

  // nested: { packs: { phase3: {...} } }
  if (p.packs && typeof p.packs === "object" && p.packs.phase3 && typeof p.packs.phase3 === "object") return p.packs.phase3;

  return null;
}

function getPack() {
  const phase3 = resolvePhase3Pack(PACK);
  return phase3 || FALLBACK;
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

function hashToUint32(hex40) {
  try {
    const h = String(hex40 || "");
    const x = parseInt(h.slice(0, 8), 16);
    return Number.isFinite(x) ? (x >>> 0) : 0;
  } catch (_) {
    return 0;
  }
}

function pickDeterministic(list, seed) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const h = sha1(seed || "seed");
  const n = hashToUint32(h);
  const idx = list.length ? (n % list.length) : 0;
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

function safeStr(s) {
  const out = String(s || "").trim();
  return out ? out : null;
}

/* =========================
   Tunables (optional env)
========================= */

const CC_RECENT_MS = Number(process.env.NYX_CC_RECENT_MS || 2 * 60 * 1000);      // 2 minutes
const CC_WARM_MS = Number(process.env.NYX_CC_WARM_MS || 20 * 60 * 1000);         // 20 minutes
const CC_SESSION_MS = Number(process.env.NYX_CC_SESSION_MS || 90 * 60 * 1000);   // 90 minutes

// "Sprinkle" control: only inject continuity lines occasionally after certain turn thresholds
const CC_MIN_TURNS_WARM = Number(process.env.NYX_CC_MIN_TURNS_WARM || 6);
const CC_MIN_TURNS_DEEP = Number(process.env.NYX_CC_MIN_TURNS_DEEP || 16);
const CC_MIN_TURNS_VERY_DEEP = Number(process.env.NYX_CC_MIN_TURNS_VERY_DEEP || 30);

/* =========================
   Continuity inference
========================= */

function depthBand(turnCount) {
  const t = Number(turnCount || 0);
  if (t <= 5) return "early";     // 0–5
  if (t <= 15) return "mid";      // 6–15
  if (t <= 30) return "late";     // 16–30
  return "deep";                  // 31+
}

function continuityLevelFrom({ depth, lastOutAt, nowT }) {
  // Continuity is stronger if conversation is active/recent.
  // IMPORTANT: this is session-time continuity, not long-term memory.
  if (!lastOutAt) {
    if (depth === "deep") return "deep";
    if (depth === "late") return "warm";
    if (depth === "mid") return "light";
    return "none";
  }

  if (withinMs(nowT, lastOutAt, CC_RECENT_MS)) {
    if (depth === "deep" || depth === "late") return "deep";
    if (depth === "mid") return "warm";
    return "light";
  }

  if (withinMs(nowT, lastOutAt, CC_WARM_MS)) {
    if (depth === "deep") return "deep";
    if (depth === "late") return "warm";
    return "light";
  }

  if (withinMs(nowT, lastOutAt, CC_SESSION_MS)) {
    if (depth === "deep" || depth === "late") return "warm";
    return "light";
  }

  // very old → treat as none (avoid implying memory)
  return "none";
}

function reentryStyleFrom({ continuityLevel, lane }) {
  const l = String(lane || "general").toLowerCase();
  if (continuityLevel === "none") return "restart";
  if (l === "music") return "soft_resume";
  return "resume";
}

function chooseChipsKey({ lane, continuityLevel }) {
  const l = String(lane || "general").toLowerCase();
  if (continuityLevel === "none") return "return_set";
  if (l === "music") return "music_resume_set";
  return "resume_set";
}

/* =========================
   Heuristics: usable + inject control
========================= */

function continuityUsable({ session, now }) {
  const s = session && typeof session === "object" ? session : {};
  const nowT = nowMs(now);
  const lastOutAt = Number(s.__lastOutAt || s.__musicLastContentAt || 0) || 0;
  if (!lastOutAt) return false;
  // usable if within "session" window
  return withinMs(nowT, lastOutAt, CC_SESSION_MS);
}

function shouldOfferReentry({ session, lane, now }) {
  // Offer reentry when:
  // - continuity is usable AND
  // - last output isn't super recent (avoid spamming "resume" within active flow)
  const s = session && typeof session === "object" ? session : {};
  const nowT = nowMs(now);
  const lastOutAt = Number(s.__lastOutAt || s.__musicLastContentAt || 0) || 0;
  if (!lastOutAt) return false;
  if (!withinMs(nowT, lastOutAt, CC_SESSION_MS)) return false;

  // if super recent (<15s), don't prompt "resume"
  if (withinMs(nowT, lastOutAt, 15_000)) return false;

  const l = String(lane || s.lane || "general").toLowerCase();
  return l === "music" || l === "general" || l === "schedule" || l === "movies" || l === "sponsors";
}

function shouldInjectContinuityLine({ session, continuityLevel }) {
  // Sprinkle rule: deeper levels can appear after enough turns.
  const s = session && typeof session === "object" ? session : {};
  const tCount = Number(s.turnCount || s.turns || 0);

  if (continuityLevel === "deep") return tCount >= CC_MIN_TURNS_VERY_DEEP;
  if (continuityLevel === "warm") return tCount >= CC_MIN_TURNS_DEEP;
  if (continuityLevel === "light") return tCount >= CC_MIN_TURNS_WARM;
  return false;
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
  const seedBase = [
    "cc",
    continuityLevel,
    depth,
    sessionLane,
    norm(userText || ""),
    String(y || ""),
    String(m || ""),
    String(s.__lastOutSig || s.__musicLastContentSig || "")
  ].join("|");

  const vars = { year: y || "", mode: m || "" };

  // continuity line
  const contPool =
    (pack.continuity_language && pack.continuity_language[continuityLevel]) ||
    (pack.continuity_language && pack.continuity_language.warm) ||
    (FALLBACK.continuity_language && FALLBACK.continuity_language.warm) ||
    [];

  const continuityLine = safeStr(replaceVars(pickDeterministic(contPool, seedBase + "|cont"), vars));

  // opener
  const openPool =
    (pack.return_session_openers && pack.return_session_openers[continuityLevel]) ||
    (pack.return_session_openers && pack.return_session_openers.warm) ||
    [];

  const openerLine = safeStr(replaceVars(pickDeterministic(openPool, seedBase + "|open"), vars));

  // micro recap
  const recapGroup = sessionLane === "music" ? "music" : "general";
  const recapPool =
    (pack.micro_recaps && pack.micro_recaps[recapGroup]) ||
    (FALLBACK.micro_recaps && FALLBACK.micro_recaps[recapGroup]) ||
    [];

  const microRecapLine = safeStr(replaceVars(pickDeterministic(recapPool, seedBase + "|recap"), vars));

  // re-entry prompt
  let reentryPrompt = null;
  if (pack.reentry_prompts) {
    if (reentryStyle === "restart") {
      reentryPrompt = safeStr(replaceVars(
        pickDeterministic(pack.reentry_prompts.restart_graceful || [], seedBase + "|restart"),
        vars
      ));
    } else if (reentryStyle === "soft_resume" && sessionLane === "music") {
      reentryPrompt = safeStr(replaceVars(
        pickDeterministic(pack.reentry_prompts.soft_resume_music || [], seedBase + "|softmusic"),
        vars
      ));
    } else {
      reentryPrompt = safeStr(replaceVars(
        pickDeterministic(pack.reentry_prompts.generic_resume || [], seedBase + "|resume"),
        vars
      ));
    }
  }

  const chips =
    (pack.continuity_chips && pack.continuity_chips[chipsSetKey]) ||
    (FALLBACK.continuity_chips && FALLBACK.continuity_chips[chipsSetKey]) ||
    [];

  const out = {
    continuityLevel,          // none|light|warm|deep
    depth,                    // early|mid|late|deep
    reentryStyle,             // restart|resume|soft_resume
    allowReturnLanguage,
    suggestResumeOptions,
    chipsSetKey,

    continuityLine,
    openerLine,
    microRecapLine,
    reentryPrompt,

    vars: { year: y, mode: m },
    chips: Array.isArray(chips) ? chips : [],

    // helpers (caller can use)
    usable: continuityUsable({ session: s, now: nowT }),
    shouldOfferReentry: shouldOfferReentry({ session: s, lane: sessionLane, now: nowT }),
    shouldInjectContinuityLine: shouldInjectContinuityLine({ session: s, continuityLevel })
  };

  if (debug) {
    out._debug = {
      nowT,
      lastOutAt,
      seedBase,
      sessionLane,
      turnCount: tCount,
      packLoaded: !!PACK,
      packLoadErr: _packLoadErr || null
    };
  }

  return out;
}

module.exports = {
  consultContinuity,
  continuityUsable,
  shouldOfferReentry,
  shouldInjectContinuityLine,
  replaceVars,
  clampYear,
  normalizeMode
};
