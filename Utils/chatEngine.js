"use strict";

/**
 * Utils/chatEngine.js
 * Pure chat engine:
 *  - NO express
 *  - NO server start
 *  - NO index.js imports
 *
 * Returns (NyxReplyContract v1 + backwards compatibility):
 *  {
 *    ok, reply, lane, ctx, ui,
 *    directives: [{type, ...}],             // contract-lock (optional)
 *    followUps: [{id,type,label,payload}],  // preferred
 *    followUpsStrings: ["..."],             // legacy
 *    sessionPatch, cog, requestId, meta
 *  }
 *
 * v0.7aC (ENTERPRISE HARDENED+++ + OPTION A RANDOM GREETING PREFIX ONLY + NYX STATE SPINE v1 (COLD/WARM/ENGAGED))
 *  ✅ NEW (CRITICAL UX): Canonical welcome line enforced for FIRST boot intro + reset:
 *      "Hello, I’m Nyx. Welcome to Sandblast Channel. How can I help you today?"
 *      - Prevents “reset complete…” / “all reset…” becoming the first impression
 *  ✅ NEW (CRITICAL UX): Reset now ADVANCES (no dead-end):
 *      - Commits lane/mode anchors after hard reset
 *      - Emits high-signal follow-ups (General/Music/Roku/Schedule/Radio + year paths)
 *      - Adds reset sequence to replay keys to prevent replay/dedupe “stickiness”
 *  ✅ Keeps: Empty-text chip intent hydration, replay safety, intro shuffle-bag, packets gating, loopkiller, state spine
 */

const crypto = require("crypto");

// =========================
// Version
// =========================
const CE_VERSION =
  "chatEngine v0.7aC (enterprise hardened+++ + canonical welcome on first boot + canonical welcome on reset + reset advances (anchors + strong followUps) + replayKey includes resetSeq (prevents sticky replays) + OPTION A random greeting prefix per real interaction + replay-safe dynamic prefix + reset-guard for boot-intro + preserves intro/login shuffle-bag + velvet gate + replay payload capture + inbound clamp + burst dedupe + lane drift guard + payload-year hydration + payload/ctx intent hydration (CRITICAL) + replayKey fix + packets gating at engine-resolve + authoritative year commit + mode-only attach + loopkiller+++++ + post-intro grace + idempotency + timeout + contract normalize + session safety + NYX STATE SPINE v1 (cold/warm/engaged forward-only, inactivity reset, merge-protected))";

// =========================
// Enterprise knobs
// =========================
const ENGINE_TIMEOUT_MS = 9000;
const REPLAY_WINDOW_MS = 4000;
const BURST_DEDUPE_MS = 250; // prevents double-fire click events (chips, fast taps)
const MAX_FOLLOWUPS = 8;
const MAX_FOLLOWUP_LABEL = 48;
const MAX_REPLY_CHARS = 4000;
const MAX_META_STR = 220;
const MAX_INBOUND_CHARS = 900; // safety: clamp inboundText to a sane size

// =========================
// Canonical Welcome (FIRST IMPRESSION LOCK)
// =========================
const CANON_WELCOME = "Hello, I’m Nyx. Welcome to Sandblast Channel. How can I help you today?";

// =========================
// Intro
// =========================
const INTRO_REARM_MS = 12 * 60 * 1000;
const POST_INTRO_GRACE_MS = 650;

const INTRO_VARIANTS_BY_BUCKET = {
  general: [
    CANON_WELCOME,
    "Hey — Nyx here. Glad you’re in.\n\nGive me a year (1950–2024) and I’ll take it from there. Try: “top 10 1988” or “story moment 1977”.",
    "Hi. Come on in.\n\nPick a year (1950–2024) and tell me the vibe: Top 10, #1, story moment, or micro moment.",
    "Hey you. Nyx on.\n\nDrop a year (1950–2024). I’ll do charts, stories, and the little details that make it real.",
    "Welcome back — Nyx online.\n\nYear first (1950–2024). Then we can go Top 10, #1, story moment, or micro moment.",
    "Alright. I’m here.\n\nSay a year (1950–2024) and what you want: “top 10 1988”, “#1 1964”, “micro moment 1999”.",
    "Hey. Let’s time-travel.\n\nGive me a year (1950–2024) and I’ll handle the rest.",
  ],
  // Earned intimacy: ONLY after engagement (see __nyxVelvet gate below)
  velvet: [
    "Alright… we’re settled now.\n\nGive me the year, and I’ll slow it down just enough to make it matter.",
    "Good. You’re here with me.\n\nPick a year, and we’ll take it properly.",
    "Now we can do this the right way.\n\nTell me the year—Top 10, #1, or a story moment?",
    "Let’s stay right here for a second.\n\nWhat year do you want to step into?",
    "Okay. I’ve got you.\n\nGive me a year, and I’ll bring the texture, not just the facts.",
  ],
  music: [
    "Hey — music mode.\n\nGive me a year (1950–2024) and choose: Top 10, #1, story moment, or micro moment.",
    "Hi. Let’s do the soundtrack version.\n\nDrop a year (1950–2024). Want Top 10, #1, story moment, or micro moment?",
    "Alright — music first.\n\nYear (1950–2024), then we pick the lens: Top 10, #1, story moment, micro moment.",
    "Hey you. Give me the year… I’ll give you the feeling.\n\nTry: “top 10 1988” or “story moment 1977”.",
  ],
  schedule: [
    "Hey — schedule mode.\n\nTell me your city/timezone and I’ll translate Sandblast time into yours. Or ask “Now / Next / Later.”",
    "Hi. Want the lineup?\n\nSay “Now / Next / Later”, or tell me your city so I can convert times cleanly.",
    "Alright — programming grid time.\n\nTell me where you are (city/timezone) or ask: “What’s on now?”",
  ],
  roku: [
    "Hey — Roku mode.\n\nWant live linear, on-demand, or today’s schedule?",
    "Hi. Let’s get you watching.\n\nSay “live”, “on-demand”, or “schedule”.",
    "Alright — Roku.\n\nTell me what you want: what’s on now, the schedule, or a quick channel guide.",
  ],
  radio: [
    "Hey — radio mode.\n\nWant the stream link, or do you want to pick an era first?",
    "Hi. Sandblast Radio is ready.\n\nPick a decade or year… or say “stream”.",
    "Alright — set the vibe.\n\nGive me an era, or ask me to open the stream.",
  ],
  sponsors: [
    "Hey — sponsors & advertising.\n\nDo you want the rate card, packages, or a recommendation based on your goal?",
    "Hi. Advertising mode.\n\nTell me: brand, budget range, and desired outcome — I’ll map you to a package.",
    "Alright — let’s talk sponsors.\n\nPricing, placements, or a pitch-ready package recommendation?",
  ],
  movies: [
    "Hey — movies & catalog.\n\nAre you looking for licensing, what’s available now, or what we should add next?",
    "Hi. Film lane.\n\nTell me: genre, decade, and PD vs licensed — I’ll point you cleanly.",
    "Alright — movies.\n\nTell me what you’re hunting for, and I’ll chart the best path.",
  ],
};

const CANON_INTRO_CHIPS = [
  { label: "Pick a year", send: "1988" },
  { label: "Story moment", send: "story moment 1988" },
  { label: "Schedule", send: "schedule" },
  { label: "Sponsors", send: "sponsors" },
];

// =========================
// Optional CS-1 module (soft-load)
// =========================
let cs1 = null;
try {
  cs1 = require("./cs1");
} catch (_) {
  cs1 = null;
}

// =========================
// Optional Packs (soft-load; never brick)
// =========================
function safeRequire(p) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(p);
  } catch (_) {
    return null;
  }
}

const NYX_CONV_PACK =
  safeRequire("./nyxConversationalPack") ||
  safeRequire("./nyxConvPack") ||
  safeRequire("./nyx_conv_pack") ||
  null;

const NYX_PHRASEPACK =
  safeRequire("./nyxPhrasePack") ||
  safeRequire("./phrasePack") ||
  safeRequire("./nyx_phrase_pack") ||
  null;

// NOTE: this resolves to your packets.js when required via "./packets"
const NYX_PACKETS =
  safeRequire("./nyxPackets") ||
  safeRequire("./packets") ||
  safeRequire("./nyx_packets") ||
  null;

// =========================
// Helpers
// =========================
function nowMs() {
  return Date.now();
}
function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function safeInt(n, def = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  if (v > 2147483000) return 2147483000;
  if (v < -2147483000) return -2147483000;
  return Math.trunc(v);
}
function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}
function normText(s) {
  return safeStr(s).trim().replace(/\s+/g, " ").toLowerCase();
}
function clampStr(s, max) {
  const t = safeStr(s);
  if (t.length <= max) return t;
  return t.slice(0, max);
}
function nonEmptyReply(s, fallback) {
  const a = safeStr(s).trim();
  if (a) return a;
  const b = safeStr(fallback).trim();
  return b || "Okay — tell me what you want next.";
}
function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)
  );
}
function safeMetaStr(s) {
  return clampStr(safeStr(s).replace(/[\r\n\t]/g, " ").trim(), MAX_META_STR);
}
async function withTimeout(promise, ms, tag) {
  let to = null;
  const timeout = new Promise((_, rej) => {
    to = setTimeout(() => rej(new Error(`timeout:${tag || "engine"}:${ms}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (to) clearTimeout(to);
  }
}
function pickRandomIndex(max) {
  try {
    return crypto.randomInt(0, max);
  } catch (_) {
    return Math.floor(Math.random() * max);
  }
}
function clampInboundText(raw) {
  // hard clamp + sanitize weird whitespace; don't lower-case here
  const t = safeStr(raw).replace(/\u0000/g, "").trim();
  if (!t) return "";
  // Safety for accidental HTML/proxy errors getting piped into chat
  const compact = t.replace(/\s+/g, " ");
  return clampStr(compact, MAX_INBOUND_CHARS);
}
function shuffleInPlace(arr) {
  // Fisher-Yates, crypto-backed
  for (let i = arr.length - 1; i > 0; i--) {
    let j = 0;
    try {
      j = crypto.randomInt(0, i + 1);
    } catch (_) {
      j = Math.floor(Math.random() * (i + 1));
    }
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// ============================
// NYX STATE SPINE v1 (COLD/WARM/ENGAGED) — PURE + FORWARD-ONLY
// Bound to session.cog.state
// ============================
const NYX_STATE = Object.freeze({ COLD: "cold", WARM: "warm", ENGAGED: "engaged" });
const NYX_STATE_ORDER = Object.freeze([NYX_STATE.COLD, NYX_STATE.WARM, NYX_STATE.ENGAGED]);

function sanitizeNyxState(s) {
  const v = String(s || "").toLowerCase();
  return v === NYX_STATE.COLD || v === NYX_STATE.WARM || v === NYX_STATE.ENGAGED ? v : null;
}
function nyxStateIndex(s) {
  const v = sanitizeNyxState(s) || NYX_STATE.COLD;
  const i = NYX_STATE_ORDER.indexOf(v);
  return i >= 0 ? i : 0;
}
function nyxAdvanceState(current, next) {
  const c = sanitizeNyxState(current) || NYX_STATE.COLD;
  const n = sanitizeNyxState(next) || c;
  const ci = nyxStateIndex(c);
  const ni = nyxStateIndex(n);
  return NYX_STATE_ORDER[Math.max(ci, ni)];
}
function nyxShouldIgnoreTurn(input) {
  // Treat boot-intro / panel-open pings as non-turns
  const t = String((input && (input.turnType || input.type || input.event)) || "").toLowerCase();
  const rh = String((input && (input.routeHint || input.hint)) || "").toLowerCase();
  if (t.includes("boot") || t.includes("intro") || t.includes("panel_open")) return true;
  if (rh.includes("boot") || rh.includes("intro") || rh.includes("panel_open")) return true;
  // Also treat explicit boot intro sources as non-turns (even if other fields are missing)
  try {
    if (isBootIntroSource(input)) return true;
  } catch (_) {
    // ignore
  }
  return false;
}
function nyxIsMeaningfulTurn(inboundText, input) {
  if (nyxShouldIgnoreTurn(input)) return false;

  const text = String(inboundText || "").trim();
  if (text) return true;

  // If user clicked a chip / sent payload/ctx with intent, treat as meaningful.
  const payload = input && input.payload;
  const ctx = input && input.ctx;
  const body = input && input.body;

  // Conservative signals that a user action occurred even if text is empty
  if (payload && typeof payload === "object") {
    if (payload.year || payload.mode || payload.action || payload.intent || payload.label) return true;
    if (payload.text || payload.message) return true;
  }
  if (ctx && typeof ctx === "object") {
    if (ctx.year || ctx.mode || ctx.action || ctx.intent || ctx.route) return true;
  }
  if (body && typeof body === "object") {
    if (body.year || body.mode || body.action || body.intent) return true;
    if (body.text || body.message) return true;
  }

  return false;
}
function nyxResolveState(session, inboundText, input, now) {
  const cog = isPlainObject(session && session.cog) ? session.cog : {};
  const prev = sanitizeNyxState(cog.state) || NYX_STATE.COLD;

  const ts = Number.isFinite(now) ? now : Date.now();
  const lastSeen = safeInt(cog.__nyxLastSeenAt || 0, 0);

  const INACTIVITY_RESET_MS = 1000 * 60 * 45; // 45 minutes
  const meaningful = nyxIsMeaningfulTurn(inboundText, input);

  // Always bump lastSeen (even for ignored turns) so the session doesn't "time travel"
  if (nyxShouldIgnoreTurn(input)) {
    return { state: prev, lastSeenAt: ts, progressed: false, reset: false, meaningful: false };
  }

  const inactiveTooLong = lastSeen > 0 && ts - lastSeen > INACTIVITY_RESET_MS;

  // If inactivity reset triggers and this is meaningful, restart at cold (new arrival)
  if (inactiveTooLong && meaningful) {
    return { state: NYX_STATE.COLD, lastSeenAt: ts, progressed: true, reset: true, meaningful: true };
  }

  // Normal progression (forward-only):
  // - first meaningful: cold -> warm
  // - subsequent meaningful: warm -> engaged
  // - engaged sticky
  let next = prev;
  if (meaningful) {
    if (nyxStateIndex(prev) <= nyxStateIndex(NYX_STATE.COLD)) next = NYX_STATE.WARM;
    else if (nyxStateIndex(prev) === nyxStateIndex(NYX_STATE.WARM)) next = NYX_STATE.ENGAGED;
    else next = NYX_STATE.ENGAGED;
  }

  const finalState = nyxAdvanceState(prev, next);
  return {
    state: finalState,
    lastSeenAt: ts,
    progressed: finalState !== prev,
    reset: false,
    meaningful,
  };
}
function nyxStampState(session, st) {
  try {
    session.cog = isPlainObject(session.cog) ? session.cog : {};
    const prev = sanitizeNyxState(session.cog.state) || NYX_STATE.COLD;
    const next = sanitizeNyxState(st && st.state) || prev;
    session.cog.state = nyxAdvanceState(prev, next);
    session.cog.__nyxLastSeenAt = safeInt((st && st.lastSeenAt) || Date.now(), Date.now());
  } catch (_) {
    // no-op
  }
}
// ============================
// END NYX STATE SPINE
// ============================

// =========================
// OPTION A: RANDOM GREETING PREFIX (ISOLATED + REVERSIBLE)
// =========================
const NYX_GREET_PREFIXES = [
  "Hey — Nyx here.",
  "Alright. I’m with you.",
  "Mm. I’m listening.",
  "Okay — talk to me.",
  "Good. Let’s move.",
  "I’ve got you. Go on.",
  "Yeah — I’m here. What’s the play?",
];

function isBootLikeTurn(inboundIsEmpty, bootIntroEmpty) {
  if (bootIntroEmpty) return true;
  if (inboundIsEmpty) return true;
  return false;
}

function pickNyxGreetPrefix(session) {
  try {
    session.cog = isPlainObject(session.cog) ? session.cog : {};
    const last = safeStr(session.cog.__nyxGreetLast || "");
    const max = NYX_GREET_PREFIXES.length;
    if (!max) return "";

    let chosen = "";
    for (let i = 0; i < 4; i++) {
      const idx = pickRandomIndex(max);
      const cand = safeStr(NYX_GREET_PREFIXES[idx]).trim();
      if (!cand) continue;
      if (cand === last && max > 1) continue;
      chosen = cand;
      break;
    }
    if (!chosen) chosen = safeStr(NYX_GREET_PREFIXES[0]).trim();

    session.cog.__nyxGreetLast = chosen;
    return chosen;
  } catch (_) {
    return "";
  }
}

function maybeApplyNyxGreetPrefix(session, inboundIsEmpty, bootIntroEmpty, reply) {
  try {
    if (isBootLikeTurn(inboundIsEmpty, bootIntroEmpty)) return reply;

    const core = safeStr(reply).trim();
    if (!core) return reply;

    const prefix = pickNyxGreetPrefix(session);
    if (!prefix) return reply;

    const low = core.toLowerCase();
    const plow = prefix.toLowerCase();
    if (low.startsWith(plow)) return reply;

    return `${prefix}\n\n${core}`;
  } catch (_) {
    return reply;
  }
}
// =========================
// END OPTION A BLOCK
// =========================

// =========================
// Intro state sanitization (bounded; enterprise-safe)
// =========================
function sanitizeNyxIntroState(st) {
  if (!isPlainObject(st)) return {};
  const out = {};
  const bagsIn = isPlainObject(st.bags) ? st.bags : {};
  const lastIn = isPlainObject(st.lastIdByBucket) ? st.lastIdByBucket : {};

  const bagsOut = {};
  const lastOut = {};

  const bucketKeys = Object.keys(INTRO_VARIANTS_BY_BUCKET);
  for (const k of bucketKeys) {
    const arr = INTRO_VARIANTS_BY_BUCKET[k] || [];
    const len = Array.isArray(arr) ? arr.length : 0;

    const bag = Array.isArray(bagsIn[k])
      ? bagsIn[k].filter((n) => Number.isInteger(n) && n >= 0 && n < len).slice(0, 64)
      : [];

    if (bag.length) bagsOut[k] = bag;

    const lastId = safeInt(lastIn[k], -1);
    if (Number.isInteger(lastId) && lastId >= 0 && lastId < len) lastOut[k] = lastId;
  }

  if (Object.keys(bagsOut).length) out.bags = bagsOut;
  if (Object.keys(lastOut).length) out.lastIdByBucket = lastOut;

  return out;
}

// =========================
// Extractors
// =========================
function extractYear(text) {
  const m = safeStr(text).match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
  if (!m) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y) || y < 1950 || y > 2024) return null;
  return y;
}
function extractYearAuthoritative(text) {
  return extractYear(text);
}

function coerceYearAny(v) {
  const n = Number(v);
  if (Number.isFinite(n) && n >= 1950 && n <= 2024) return Math.trunc(n);
  const y = extractYear(safeStr(v));
  return y || null;
}
function resolveInboundYear(input, inboundText, session) {
  const y1 = coerceYearAny(input && input.year);
  const y2 = coerceYearAny(input && input.payload && input.payload.year);
  const y3 = coerceYearAny(input && input.ctx && input.ctx.year);
  const y4 = coerceYearAny(input && input.body && input.body.year);
  const y5 = extractYearAuthoritative(inboundText);

  const yS1 = coerceYearAny(session && session.lastMusicYear);
  const yS2 = coerceYearAny(session && session.lastYear);
  const yC1 = coerceYearAny(session && session.cog && session.cog.lastMusicYear);
  const yC2 = coerceYearAny(session && session.cog && session.cog.year);

  return y1 || y2 || y3 || y4 || y5 || yS1 || yC1 || yC2 || yS2 || null;
}
function commitYear(session, year, source) {
  if (!year) return;
  session.lastMusicYear = year;
  session.lastYear = year;

  session.cog = isPlainObject(session.cog) ? session.cog : {};
  session.cog.year = year;
  session.cog.lastMusicYear = year;
  session.cog.yearSource = source || session.cog.yearSource || "unknown";
}

function isTop10IntentText(text) {
  const t = normText(text);
  return /\btop\s*10\b/.test(t) || /\btop10\b/.test(t) || /\btop\s*ten\b/.test(t);
}

function extractMode(text) {
  const t = normText(text);
  if (/\b(top\s*100|top100|hot\s*100|year[-\s]*end\s*hot\s*100)\b/.test(t)) return "top100";
  if (/\b(top\s*10|top10|top\s*ten)\b/.test(t)) return "top10";
  if (/\bstory\s*moment\b|\bstory\b/.test(t)) return "story";
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return "micro";
  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return "number1";
  return null;
}
function isModeOnly(text) {
  const y = extractYear(text);
  const m = extractMode(text);
  return !!m && !y;
}
function isGreetingOnly(t) {
  return /^(hi|hello|hey|yo|hiya|good morning|good afternoon|good evening|sup|what's up|whats up)$/i.test(
    safeStr(t).trim()
  );
}
function isEmptyOrNoText(t) {
  return !safeStr(t).trim();
}

// =========================
// Inbound extraction
// =========================
function extractInboundTextFromInput(input) {
  const direct =
    safeStr(input && (input.text || input.message || input.prompt || input.query || "")).trim() ||
    safeStr(input && input.body && (input.body.text || input.body.message || "")).trim() ||
    safeStr(input && input.payload && (input.payload.text || input.payload.message || "")).trim() ||
    safeStr(input && input.data && (input.data.text || input.data.message || "")).trim();

  if (direct) return clampInboundText(direct);

  const evt =
    safeStr(input && input.event && (input.event.text || input.event.message || "")).trim() ||
    safeStr(input && input.followUp && input.followUp.payload && input.followUp.payload.text).trim();

  return clampInboundText(evt || "");
}

// =========================
// Boot intro pings
// =========================
function isBootIntroSource(input) {
  try {
    const src =
      safeStr(input && input.client && (input.client.source || input.client.src || "")).trim() ||
      safeStr(input && input.source).trim();
    const tt = normText(src);
    return (
      tt.includes("panel_open_intro") ||
      tt.includes("panel-open-intro") ||
      tt.includes("boot_intro") ||
      tt.includes("boot-intro")
    );
  } catch (_) {
    return false;
  }
}

// =========================
// INBOUND NORMALIZATION (loop killer)
// =========================
function normalizeInboundText(text, session, routeHint) {
  const raw = clampInboundText(text);
  if (!raw) return raw;

  const y = extractYear(raw);
  const m = extractMode(raw);

  if (!y && m) {
    const yy1 = Number(session && session.lastMusicYear);
    if (Number.isFinite(yy1) && yy1 >= 1950 && yy1 <= 2024) return `${raw} ${yy1}`.trim();

    const yy2 = Number(session && session.cog && session.cog.year);
    if (Number.isFinite(yy2) && yy2 >= 1950 && yy2 <= 2024) return `${raw} ${yy2}`.trim();

    const yy3 = Number(session && session.cog && session.cog.lastMusicYear);
    if (Number.isFinite(yy3) && yy3 >= 1950 && yy3 <= 2024) return `${raw} ${yy3}`.trim();
  }

  if (y && !m && session && session.activeMusicMode && !isGreetingOnly(raw)) {
    const mm = safeStr(session && session.activeMusicMode).trim();
    if (mm === "top10") return `top 10 ${y}`;
    if (mm === "top100") return `top 100 ${y}`;
    if (mm === "number1") return `#1 ${y}`;
    if (mm === "story") return `story moment ${y}`;
    if (mm === "micro") return `micro moment ${y}`;
  }

  if (y && !m && !isGreetingOnly(raw)) {
    const rh = normText(routeHint || "");
    const lane = normText(session && session.lane);
    const inMusic = rh.includes("music") || lane === "music";
    if (inMusic) return `top 10 ${y}`;
  }

  return raw;
}

// =========================
// CRITICAL: Payload/Ctx intent hydration when inboundText empty
// =========================
function mapModeTokenToText(modeToken) {
  const m = normText(modeToken || "");
  if (!m) return null;
  if (m === "top10" || m === "top 10" || m === "top-ten" || m === "top_ten") return "top 10";
  if (m === "top100" || m === "top 100" || m === "hot100" || m === "hot 100") return "top 100";
  if (m === "number1" || m === "#1" || m === "no1" || m === "no 1" || m === "number 1") return "#1";
  if (m === "story" || m === "storymoment" || m === "story moment") return "story moment";
  if (m === "micro" || m === "micromoment" || m === "micro moment") return "micro moment";
  if (m === "schedule") return "schedule";
  if (m === "sponsors" || m === "sponsor") return "sponsors";
  if (m === "roku") return "roku";
  if (m === "radio") return "radio";
  if (m === "movies" || m === "movie") return "movies";
  return null;
}

function hydrateEmptyInboundFromIntent(input, session, resolvedYearMaybe, source) {
  try {
    if (isBootIntroSource({ ...input, source })) return "";

    const payload = isPlainObject(input && input.payload) ? input.payload : null;
    const ctx = isPlainObject(input && input.ctx) ? input.ctx : null;
    const body = isPlainObject(input && input.body) ? input.body : null;

    const pText = safeStr(payload && (payload.text || payload.message)).trim();
    const bText = safeStr(body && (body.text || body.message)).trim();
    if (pText) return clampInboundText(pText);
    if (bText) return clampInboundText(bText);

    const tok =
      safeStr((payload && (payload.mode || payload.action || payload.intent || payload.label)) || "").trim() ||
      safeStr((ctx && (ctx.mode || ctx.action || ctx.intent || ctx.route)) || "").trim() ||
      safeStr((body && (body.mode || body.action || body.intent)) || "").trim();

    const mapped = mapModeTokenToText(tok) || clampInboundText(tok);
    if (!mapped) return "";

    const needsYear = /^(top 10|top 100|#1|story moment|micro moment)$/i.test(mapped);
    if (needsYear) {
      const y =
        coerceYearAny(resolvedYearMaybe) ||
        coerceYearAny(session && session.lastMusicYear) ||
        coerceYearAny(session && session.cog && session.cog.year) ||
        coerceYearAny(session && session.cog && session.cog.lastMusicYear) ||
        null;
      if (y) return `${mapped} ${y}`.trim();
      return mapped;
    }

    return mapped;
  } catch (_) {
    return "";
  }
}

// =========================
// Intro logic
// =========================
function isLoginMoment(session, startedAt) {
  const last = safeInt(session.lastTurnAt || session.lastInAt || 0, 0);
  const gap = last ? startedAt - last : Infinity;
  if (gap >= INTRO_REARM_MS) return true;
  if (!session.__hasRealUserTurn) return true;
  return false;
}
function hasStrongFirstTurnIntent(text) {
  const t = normText(text);
  if (!t) return false;
  if (extractYear(t)) return true;
  if (extractMode(t)) return true;
  if (/\b(schedule|programming|what(?:'s|\s+is)\s+on|guide|grid)\b/.test(t)) return true;
  if (/\b(sponsor|advertis|rate\s*card|pricing|packages)\b/.test(t)) return true;
  if (/\b(movie|film|licens|catalog)\b/.test(t)) return true;
  if (/\b(roku|tv|channel|install|launch|open\s+on\s+roku)\b/.test(t)) return true;
  if (/\b(radio|listen|stream)\b/.test(t)) return true;
  if (t.length >= 12 && !isGreetingOnly(t)) return true;
  return false;
}
function shouldServeIntroLoginMoment(session, inboundText, startedAt, input) {
  if (!session) return false;

  const empty = isEmptyOrNoText(inboundText);
  if (empty) {
    if (!isBootIntroSource(input)) return false;
    if (!isLoginMoment(session, startedAt)) return false;
    const introAt = safeInt(session.introAt || 0, 0);
    if (introAt && startedAt - introAt < INTRO_REARM_MS) return false;
    return true;
  }

  const strong = hasStrongFirstTurnIntent(inboundText);
  if (strong && !isGreetingOnly(inboundText)) return false;

  if (!isLoginMoment(session, startedAt)) return false;

  const introAt = safeInt(session.introAt || 0, 0);
  if (introAt && startedAt - introAt < INTRO_REARM_MS) return false;

  return true;
}
function pickIntroBucket(session, inboundText, routeHint, input) {
  const t = normText(inboundText);
  const rh = normText(routeHint);
  const src = normText(
    safeStr(input && input.client && (input.client.source || input.client.src || "")).trim() ||
      safeStr(input && input.source).trim()
  );

  const lane = normText(session && session.lane);
  if (lane && INTRO_VARIANTS_BY_BUCKET[lane]) return lane;

  if (rh.includes("schedule") || /\b(schedule|programming|what's on|whats on|grid|now|next|later)\b/.test(t))
    return "schedule";
  if (rh.includes("roku") || /\b(roku|channel|tv|install|open on roku)\b/.test(t)) return "roku";
  if (rh.includes("radio") || /\b(radio|listen|stream)\b/.test(t)) return "radio";
  if (rh.includes("sponsor") || /\b(sponsor|advertis|rate card|pricing|packages)\b/.test(t)) return "sponsors";
  if (rh.includes("movie") || /\b(movie|film|licens|catalog)\b/.test(t)) return "movies";

  if (src.includes("panel_open_intro") || src.includes("boot_intro")) {
    if (rh.includes("music") || rh.includes("years")) return "music";
    if (session && session.__nyxVelvet) return "velvet";
    return "general";
  }

  if (
    isGreetingOnly(inboundText) &&
    (session.lastMusicYear ||
      (session.cog && (session.cog.year || session.cog.lastMusicYear)) ||
      session.activeMusicMode)
  )
    return "music";

  if (session && session.__nyxVelvet) return "velvet";

  return "general";
}

function getIntroBag(session, bucketKey, arrLen) {
  session.__nyxIntro = isPlainObject(session.__nyxIntro) ? session.__nyxIntro : {};
  session.__nyxIntro.bags = isPlainObject(session.__nyxIntro.bags) ? session.__nyxIntro.bags : {};
  session.__nyxIntro.lastIdByBucket = isPlainObject(session.__nyxIntro.lastIdByBucket)
    ? session.__nyxIntro.lastIdByBucket
    : {};

  const key = safeStr(bucketKey || "general") || "general";
  let bag = session.__nyxIntro.bags[key];

  if (!Array.isArray(bag)) bag = [];
  bag = bag.filter((n) => Number.isInteger(n) && n >= 0 && n < arrLen).slice(0, 64);

  if (!bag.length) {
    const fresh = [];
    for (let i = 0; i < arrLen; i++) fresh.push(i);
    shuffleInPlace(fresh);

    const lastId = safeInt(session.__nyxIntro.lastIdByBucket[key], -1);
    if (arrLen > 1 && lastId >= 0 && lastId < arrLen && fresh[fresh.length - 1] === lastId) {
      const swapWith = pickRandomIndex(fresh.length - 1);
      const tmp = fresh[fresh.length - 1];
      fresh[fresh.length - 1] = fresh[swapWith];
      fresh[swapWith] = tmp;
    }

    bag = fresh;
  }

  session.__nyxIntro.bags[key] = bag;
  return bag;
}

function pickIntroForLogin(session, startedAt, bucketKey) {
  const bkey = safeStr(bucketKey || "general") || "general";
  const arr = INTRO_VARIANTS_BY_BUCKET[bkey] || INTRO_VARIANTS_BY_BUCKET.general;

  session.__nyxIntro = isPlainObject(session.__nyxIntro) ? session.__nyxIntro : {};
  session.__nyxIntro.lastIdByBucket = isPlainObject(session.__nyxIntro.lastIdByBucket)
    ? session.__nyxIntro.lastIdByBucket
    : {};

  const bag = getIntroBag(session, bkey, arr.length);

  let id = Number.isInteger(bag[bag.length - 1]) ? bag.pop() : pickRandomIndex(arr.length);

  const lastId = safeInt(session.__nyxIntro.lastIdByBucket[bkey], -1);
  if (arr.length > 1 && id === lastId) {
    if (bag.length) {
      id = bag.pop();
    } else {
      let tries = 0;
      let cand = id;
      while (tries < 6 && cand === lastId) {
        cand = pickRandomIndex(arr.length);
        tries++;
      }
      id = cand;
    }
  }

  session.__nyxIntro.lastIdByBucket[bkey] = id;

  session.introVariantId = id;
  session.introBucket = safeStr(bkey);

  return { text: arr[id] || arr[0], id, bucket: bkey, at: startedAt };
}

// =========================
// PACKETS GATING (prevents packets.js hijacking music flows)
// =========================
function shouldAllowPackets(inboundText, routeHint, session, resolvedYear) {
  if (resolvedYear) return false;

  const t = normText(inboundText);
  if (!t) return true;

  if (isGreetingOnly(t)) return true;
  if (/\b(help|support|how do i|what can you do)\b/.test(t)) return true;
  if (/\b(bye|goodbye|see you|later|exit)\b/.test(t)) return true;

  return false;
}

// =========================
// MUSIC OVERRIDE (year + mode forces lane=music)
// =========================
function applyMusicOverride(session, inboundText) {
  const year = extractYear(inboundText);
  const mode = extractMode(inboundText);
  if (!year || !mode) return { forced: false };

  commitYear(session, year, "user_text");

  session.lane = "music";
  session.lastMode = mode;
  session.activeMusicMode = mode;

  session.cog.lane = "music";
  session.cog.mode = mode;

  return { forced: true, lane: "music", year, mode };
}

// =========================
// Continuity scaffolding (safe)
// =========================
function ensureContinuityState(session) {
  const s = session && typeof session === "object" ? session : {};
  if (!s.__nyxCont) s.__nyxCont = {};
  if (!s.__nyxIntro) s.__nyxIntro = {};
  if (!s.__nyxPackets) s.__nyxPackets = {};
  return s;
}

// =========================
// SessionPatch allowlist
// =========================
const PATCH_KEYS = new Set([
  "introDone",
  "introAt",
  "introVariantId",
  "introBucket",
  "lastInText",
  "lastInAt",
  "lastOut",
  "lastOutAt",
  "turns",
  "startedAt",
  "lastTurnAt",
  "lane",
  "lastLane",
  "lastYear",
  "lastMode",
  "activeMusicMode",
  "lastMusicYear",
  "pendingYear",
  "pendingMode",
  "pendingLane",
  "turnCount",
  "__hasRealUserTurn",
  "__introDone",
  "__cs1",
  "cog",
  "__ce_lastReqId",
  "__ce_lastReqAt",
  "__ce_lastOutHash",
  "__ce_lastOut",
  "__ce_lastOutRaw",
  "__ce_lastOutLane",
  "__ce_lastInHash",
  "__ce_lastInAt",
  "__ce_lastOutFollowUps",
  "__ce_lastOutFollowUpsStrings",
  "__ce_lastOutDirectives",
  "allowPackets",
  "__nyxIntro",
  "__nyxVelvet",
]);

function buildSessionPatch(session) {
  const s = session && typeof session === "object" ? session : {};
  const out = {};
  for (const k of Object.keys(s)) {
    if (!PATCH_KEYS.has(k)) continue;
    if (k === "cog") {
      if (isPlainObject(s.cog)) out.cog = s.cog;
      continue;
    }
    if (k === "__nyxIntro") {
      out.__nyxIntro = sanitizeNyxIntroState(s.__nyxIntro);
      continue;
    }
    if (k === "__ce_lastOutFollowUps") {
      if (Array.isArray(s.__ce_lastOutFollowUps))
        out.__ce_lastOutFollowUps = s.__ce_lastOutFollowUps.slice(0, MAX_FOLLOWUPS);
      continue;
    }
    if (k === "__ce_lastOutFollowUpsStrings") {
      if (Array.isArray(s.__ce_lastOutFollowUpsStrings))
        out.__ce_lastOutFollowUpsStrings = s.__ce_lastOutFollowUpsStrings.slice(0, MAX_FOLLOWUPS);
      continue;
    }
    if (k === "__ce_lastOutDirectives") {
      if (Array.isArray(s.__ce_lastOutDirectives)) out.__ce_lastOutDirectives = s.__ce_lastOutDirectives.slice(0, 8);
      continue;
    }
    out[k] = s[k];
  }
  if (out.__introDone && !out.introDone) out.introDone = true;
  return out;
}

// =========================
// FollowUps / directives normalization
// =========================
function normFollowUpChip(label, send) {
  const l = clampStr(safeStr(label).trim() || "Send", MAX_FOLLOWUP_LABEL);
  const s = safeStr(send).trim();
  const id = sha1(l + "::" + s).slice(0, 8);
  return { id, type: "send", label: l, payload: { text: s } };
}
function toFollowUps(chips) {
  const arr = Array.isArray(chips) ? chips : [];
  const out = [];
  const seen = new Set();
  for (const c of arr) {
    const label = safeStr(c && c.label).trim() || "Send";
    const send = safeStr(c && c.send).trim();
    const key = normText(label + "::" + send);
    if (!send) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normFollowUpChip(label, send));
    if (out.length >= MAX_FOLLOWUPS) break;
  }
  return out;
}
function toFollowUpsStrings(chips) {
  const arr = Array.isArray(chips) ? chips : [];
  const out = [];
  const seen = new Set();
  for (const c of arr) {
    const send = safeStr(c && c.send).trim();
    const k = normText(send);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(send);
    if (out.length >= MAX_FOLLOWUPS) break;
  }
  return out.length ? out : undefined;
}
function normalizeFollowUps(followUps) {
  const arr = Array.isArray(followUps) ? followUps : [];
  const out = [];
  const seen = new Set();
  for (const f of arr) {
    if (!f) continue;
    const type = safeStr(f.type || "send").trim() || "send";
    if (type !== "send") continue;
    const label = clampStr(safeStr(f.label).trim() || "Send", MAX_FOLLOWUP_LABEL);
    const payload = isPlainObject(f.payload) ? f.payload : { text: safeStr(f.payload && f.payload.text) };
    const text = safeStr(payload.text).trim();
    if (!text) continue;
    const id = safeStr(f.id).trim() || sha1(label + "::" + text).slice(0, 8);
    const key = normText(id + "::" + label + "::" + text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id, type: "send", label, payload: { text } });
    if (out.length >= MAX_FOLLOWUPS) break;
  }
  return out;
}
function normalizeDirectives(directives) {
  const arr = Array.isArray(directives) ? directives : [];
  const out = [];
  for (const d of arr) {
    if (!isPlainObject(d)) continue;
    const type = safeStr(d.type).trim();
    if (!type) continue;
    const obj = { type };
    for (const [k, v] of Object.entries(d)) {
      if (k === "type") continue;
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      if (typeof v === "string") obj[k] = clampStr(v, 500);
      else if (typeof v === "number" || typeof v === "boolean") obj[k] = v;
      else if (v === null) obj[k] = null;
    }
    out.push(obj);
    if (out.length >= 8) break;
  }
  return out.length ? out : undefined;
}

// =========================
// Replay cache (session-scoped) — replay-safe for Option A
// =========================
function replayKey(session, clientRequestId, inboundText, source) {
  const rid = safeStr(clientRequestId).trim();
  const resetSeq = safeInt(session && session.cog && session.cog.__nyxResetSeq, 0);

  const sig = sha1(
    `${safeStr(session.sessionId || session.visitorId || "")}|${safeStr(source)}|${safeStr(inboundText)}|rseq:${resetSeq}`
  ).slice(0, 12);

  // IMPORTANT: include resetSeq even when client provides rid, to avoid “sticky replay” across resets
  return rid ? `rid:${rid}:r${resetSeq}` : `sig:${sig}`;
}
function readReplay(session, key, now) {
  const lastKey = safeStr(session.__ce_lastReqId || "");
  const lastAt = safeInt(session.__ce_lastReqAt || 0, 0);
  if (!lastKey || lastKey !== key) return null;
  if (!lastAt || now - lastAt > REPLAY_WINDOW_MS) return null;

  const out = safeStr(session.__ce_lastOutRaw || session.__ce_lastOut || "");
  const outLane = safeStr(session.__ce_lastOutLane || "general") || "general";
  const outHash = safeStr(session.__ce_lastOutHash || "");
  if (!out || !outHash) return null;

  const followUps = Array.isArray(session.__ce_lastOutFollowUps) ? session.__ce_lastOutFollowUps : undefined;
  const followUpsStrings = Array.isArray(session.__ce_lastOutFollowUpsStrings)
    ? session.__ce_lastOutFollowUpsStrings
    : undefined;
  const directives = Array.isArray(session.__ce_lastOutDirectives) ? session.__ce_lastOutDirectives : undefined;

  return { reply: out, lane: outLane, followUps, followUpsStrings, directives };
}
function writeReplay(session, key, now, reply, lane, extras) {
  session.__ce_lastReqId = key;
  session.__ce_lastReqAt = now;

  const raw = safeStr(
    (extras && typeof extras === "object" && typeof extras.rawReply === "string" && extras.rawReply) || reply
  );
  session.__ce_lastOutRaw = raw;
  session.__ce_lastOut = raw;

  session.__ce_lastOutLane = lane;
  session.__ce_lastOutHash = sha1(`${lane}::${raw}`).slice(0, 16);

  if (extras && typeof extras === "object") {
    if (Array.isArray(extras.followUps)) session.__ce_lastOutFollowUps = extras.followUps.slice(0, MAX_FOLLOWUPS);
    if (Array.isArray(extras.followUpsStrings))
      session.__ce_lastOutFollowUpsStrings = extras.followUpsStrings.slice(0, MAX_FOLLOWUPS);
    if (Array.isArray(extras.directives)) session.__ce_lastOutDirectives = extras.directives.slice(0, 8);
  }
}

// =========================
// Hard reset
// =========================
function hardResetSession(session, startedAt) {
  // Preserve stable identity + reset sequencing across hard resets
  const keep = {
    visitorId: safeStr(session.visitorId || ""),
    sessionId: safeStr(session.sessionId || ""),
    __nyxResetSeq: safeInt(session && session.cog && session.cog.__nyxResetSeq, 0),
  };

  for (const k of Object.keys(session)) delete session[k];

  if (keep.visitorId) session.visitorId = keep.visitorId;
  if (keep.sessionId) session.sessionId = keep.sessionId;

  session.lane = "general";
  session.lastLane = "";
  session.turnCount = 0;
  session.turns = 0;
  session.startedAt = startedAt;
  session.lastTurnAt = startedAt;
  session.__hasRealUserTurn = 0;

  session.__introDone = 0;
  session.introDone = false;
  session.introAt = 0;
  session.introVariantId = 0;
  session.introBucket = "";

  session.lastInText = "";
  session.lastInAt = 0;
  session.lastOut = "";
  session.lastOutAt = 0;

  session.__ce_lastReqId = "";
  session.__ce_lastReqAt = 0;
  session.__ce_lastOutHash = "";
  session.__ce_lastOut = "";
  session.__ce_lastOutRaw = "";
  session.__ce_lastOutLane = "";
  session.__ce_lastOutFollowUps = undefined;
  session.__ce_lastOutFollowUpsStrings = undefined;
  session.__ce_lastOutDirectives = undefined;
  session.__ce_lastInHash = "";
  session.__ce_lastInAt = 0;

  session.allowPackets = false;

  session.cog = {};
  session.cog.state = NYX_STATE.COLD;
  session.cog.__nyxLastSeenAt = startedAt;

  // Restore reset sequence so each reset produces a new replayKey domain
  session.cog.__nyxResetSeq = keep.__nyxResetSeq;

  session.__nyxVelvet = false;

  ensureContinuityState(session);
  return session;
}

// =========================
// ENGINE AUTOWIRE (WITH PACKETS GATING)
// =========================
function resolveEngine(input, allowPackets) {
  if (typeof input.engine === "function") return { fn: input.engine, from: "input.engine" };

  if (allowPackets) {
    const p = NYX_PACKETS;
    if (p && typeof p.handleChat === "function") return { fn: p.handleChat.bind(p), from: "nyxPackets.handleChat" };
    if (p && typeof p.chat === "function") return { fn: p.chat.bind(p), from: "nyxPackets.chat" };
    if (p && typeof p.respond === "function") return { fn: p.respond.bind(p), from: "nyxPackets.respond" };
    if (p && typeof p.run === "function") return { fn: p.run.bind(p), from: "nyxPackets.run" };
    if (p && typeof p.route === "function") return { fn: p.route.bind(p), from: "nyxPackets.route" };
  }

  const c = NYX_CONV_PACK;
  if (c && typeof c.handleChat === "function") return { fn: c.handleChat.bind(c), from: "nyxConvPack.handleChat" };
  if (c && typeof c.respond === "function") return { fn: c.respond.bind(c), from: "nyxConvPack.respond" };
  if (c && typeof c.run === "function") return { fn: c.run.bind(c), from: "nyxConvPack.run" };

  return { fn: null, from: "none" };
}

// =========================
// Fallback (only used when no engine is available)
// =========================
function fallbackCore({ text, session, resolvedYear }) {
  const t = normText(text);
  const y = resolvedYear || extractYear(t);
  const m = extractMode(t);

  if (y && m) {
    return { reply: `Got it — ${y}. Want Top 10, #1, a story moment, or a micro moment?`, lane: "music" };
  }

  if (y) {
    commitYear(session, y, "fallback");
    return {
      reply: `Got it — ${y}. Want Top 10, #1, a story moment, or a micro moment?`,
      lane: "music",
      followUps: toFollowUps([
        { label: "Top 10", send: `top 10 ${y}` },
        { label: "#1", send: `#1 ${y}` },
        { label: "Story moment", send: `story moment ${y}` },
        { label: "Micro moment", send: `micro moment ${y}` },
      ]),
    };
  }

  if (!t || isGreetingOnly(text)) {
    return { reply: CANON_WELCOME, lane: "general", followUps: toFollowUps(CANON_INTRO_CHIPS) };
  }

  return {
    reply:
      "Give me a year (1950–2024), or say “top 10 1988”, “#1 1988”, “story moment 1988”, or “micro moment 1988”.",
    lane: session.lane || "general",
  };
}

// =========================
// Engine-aware fallback follow-ups
// =========================
function maybeAttachMusicFollowUps(core, resolvedYear, inboundText, session) {
  const year = resolvedYear || extractYear(inboundText);
  if (!year) return core;

  const hasFU = Array.isArray(core && core.followUps) && core.followUps.length;
  if (hasFU) return core;

  core.followUps = toFollowUps([
    { label: "Top 10", send: `top 10 ${year}` },
    { label: "#1", send: `#1 ${year}` },
    { label: "Story moment", send: `story moment ${year}` },
    { label: "Micro moment", send: `micro moment ${year}` },
  ]);
  core.followUpsStrings = toFollowUpsStrings([
    { label: "Top 10", send: `top 10 ${year}` },
    { label: "#1", send: `#1 ${year}` },
    { label: "Story moment", send: `story moment ${year}` },
    { label: "Micro moment", send: `micro moment ${year}` },
  ]);

  session.lane = "music";
  commitYear(session, year, (session.cog && session.cog.yearSource) || "engine_followups_fallback");
  session.cog.lane = "music";

  return core;
}

// =========================
// Main handler
// =========================
async function handleChat(input = {}) {
  const startedAt = nowMs();

  const clientRequestId = safeStr(input.requestId).trim();
  const requestId = clientRequestId || sha1(`${startedAt}|${Math.random()}`).slice(0, 10);

  const session = ensureContinuityState(input.session || {});
  session.cog = isPlainObject(session.cog) ? session.cog : {};

  if (!sanitizeNyxState(session.cog.state)) session.cog.state = NYX_STATE.COLD;
  if (!Number.isFinite(Number(session.cog.__nyxLastSeenAt))) session.cog.__nyxLastSeenAt = startedAt;
  if (!Number.isFinite(Number(session.cog.__nyxResetSeq))) session.cog.__nyxResetSeq = 0;

  let inboundText = extractInboundTextFromInput(input);

  const source =
    safeStr(input && input.client && (input.client.source || input.client.src || "")).trim() ||
    safeStr(input && input.source).trim() ||
    "unknown";

  const routeHint =
    safeStr((input && input.client && input.client.routeHint) || input.routeHint || session.lane || "general").trim() ||
    "general";

  // RESET (GUARDED + ADVANCING)
  if (inboundText === "__cmd:reset__") {
    const bootish = isBootIntroSource({ ...input, source });
    if (bootish) {
      inboundText = "";
    } else {
      // preserve prior seq then hard reset
      const prevSeq = safeInt(session && session.cog && session.cog.__nyxResetSeq, 0);
      hardResetSession(session, startedAt);

      // ✅ Advance: commit a deterministic landing mode/lane + post-reset anchors
      session.cog = isPlainObject(session.cog) ? session.cog : {};
      session.cog.__nyxResetSeq = safeInt(prevSeq, 0) + 1;
      session.cog.__nyxPostReset = true;
      session.cog.__nyxJustResetAt = startedAt;

      session.lane = "general";
      session.cog.lane = "general";
      session.cog.mode = "general";
      session.cog.lastLane = "general";
      session.cog.lastMode = "general";

      const RESET_FOLLOWUPS = [
        { label: "General", send: "general" },
        { label: "Music", send: "music" },
        { label: "Roku", send: "roku" },
        { label: "Schedule", send: "schedule" },
        { label: "Radio", send: "radio" },
        { label: "Pick a year", send: "1988" },
        { label: "Story moment", send: "story moment 1988" },
        { label: "Just talk", send: "just talk" },
      ];

      // ✅ Canonical welcome replaces any reset copy (first-impression lock)
      const reply = CANON_WELCOME;

      session.lastOut = reply;
      session.lastOutAt = startedAt;

      // IMPORTANT: replay key now includes resetSeq, so reset can't “stick” to subsequent turns
      const rk = replayKey(session, clientRequestId, inboundText, source);

      writeReplay(session, rk, startedAt, reply, "general", {
        rawReply: reply,
        followUps: toFollowUps(RESET_FOLLOWUPS),
        followUpsStrings: toFollowUpsStrings(RESET_FOLLOWUPS),
      });

      return {
        ok: true,
        reply,
        lane: "general",
        followUps: toFollowUps(RESET_FOLLOWUPS),
        followUpsStrings: toFollowUpsStrings(RESET_FOLLOWUPS),
        sessionPatch: buildSessionPatch(session),
        cog: { phase: "listening", state: "fresh", reason: "hard_reset", lane: "general" },
        requestId,
        meta: {
          engine: CE_VERSION,
          reset: true,
          resetAdvanced: true,
          resetSeq: session.cog.__nyxResetSeq,
          source: safeMetaStr(source),
          nyxState: safeMetaStr(session.cog.state),
          elapsedMs: nowMs() - startedAt,
        },
      };
    }
  }

  // Normalize inbound (text-only normalization)
  const preNorm = inboundText;
  inboundText = normalizeInboundText(inboundText, session, routeHint);
  const inboundNormalized = inboundText !== preNorm;

  // NYX STATE SPINE: stamp state BEFORE replay/burst returns
  const st0 = nyxResolveState(session, inboundText, { ...input, source, routeHint }, startedAt);
  nyxStampState(session, st0);

  // Burst dedupe
  const inHash = sha1(inboundText).slice(0, 12);
  const lastInHash = safeStr(session.__ce_lastInHash || "");
  const lastInAt = safeInt(session.__ce_lastInAt || 0, 0);
  if (inHash && lastInHash && inHash === lastInHash && lastInAt && startedAt - lastInAt < BURST_DEDUPE_MS) {
    const rkey0 = replayKey(session, clientRequestId, inboundText, source);
    const cached0 = readReplay(session, rkey0, startedAt);
    if (cached0) {
      const inboundIsEmptyB = isEmptyOrNoText(inboundText);
      const bootIntroEmptyB = inboundIsEmptyB && isBootIntroSource({ ...input, source });

      const replyB = maybeApplyNyxGreetPrefix(session, inboundIsEmptyB, bootIntroEmptyB, cached0.reply);

      return {
        ok: true,
        reply: replyB,
        lane: cached0.lane,
        directives: cached0.directives,
        followUps: cached0.followUps || toFollowUps(CANON_INTRO_CHIPS),
        followUpsStrings: cached0.followUpsStrings || toFollowUpsStrings(CANON_INTRO_CHIPS),
        sessionPatch: buildSessionPatch(session),
        cog: { phase: "listening", state: "confident", reason: "burst_replay", lane: cached0.lane },
        requestId,
        meta: {
          engine: CE_VERSION,
          replay: true,
          burst: true,
          source: safeMetaStr(source),
          nyxState: safeMetaStr(session.cog.state),
          elapsedMs: nowMs() - startedAt,
        },
      };
    }
  }
  session.__ce_lastInHash = inHash;
  session.__ce_lastInAt = startedAt;

  // Resolve year from all inbound shapes
  const resolvedYear0 = resolveInboundYear(input, inboundText, session);

  // HYDRATE: empty inbound + year exists via payload/ctx
  if (isEmptyOrNoText(inboundText) && resolvedYear0) {
    inboundText = String(resolvedYear0);
    const stH = nyxResolveState(session, inboundText, { ...input, source, routeHint }, startedAt);
    nyxStampState(session, stH);
  }

  // CRITICAL HYDRATE: empty inbound + intent exists via payload/ctx
  if (isEmptyOrNoText(inboundText) && !isBootIntroSource({ ...input, source })) {
    const hydrated = hydrateEmptyInboundFromIntent(input, session, resolvedYear0, source);
    if (hydrated) {
      inboundText = normalizeInboundText(hydrated, session, routeHint);
      const stI = nyxResolveState(session, inboundText, { ...input, source, routeHint }, startedAt);
      nyxStampState(session, stI);
    }
  }

  // Commit year if present
  if (resolvedYear0) commitYear(session, resolvedYear0, "resolved_inbound");

  const inboundIsEmpty = isEmptyOrNoText(inboundText);
  const bootIntroEmpty = inboundIsEmpty && isBootIntroSource({ ...input, source });

  // Replay safety
  const rkey = replayKey(session, clientRequestId, inboundText, source);
  const cached = readReplay(session, rkey, startedAt);
  if (cached) {
    const replyR = maybeApplyNyxGreetPrefix(session, inboundIsEmpty, bootIntroEmpty, cached.reply);

    return {
      ok: true,
      reply: replyR,
      lane: cached.lane,
      directives: cached.directives,
      followUps: cached.followUps || toFollowUps(CANON_INTRO_CHIPS),
      followUpsStrings: cached.followUpsStrings || toFollowUpsStrings(CANON_INTRO_CHIPS),
      sessionPatch: buildSessionPatch(session),
      cog: { phase: "listening", state: "confident", reason: "replay_cache", lane: cached.lane },
      requestId,
      meta: {
        engine: CE_VERSION,
        replay: true,
        source: safeMetaStr(source),
        nyxState: safeMetaStr(session.cog.state),
        elapsedMs: nowMs() - startedAt,
      },
    };
  }

  // POST-INTRO GRACE suppression
  const introAt = safeInt(session.introAt || 0, 0);
  const justIntroed = !!introAt && startedAt - introAt < POST_INTRO_GRACE_MS;
  if (justIntroed && (inboundIsEmpty || isModeOnly(inboundText))) {
    const reply0 = nonEmptyReply(session.lastOut, CANON_WELCOME);
    session.lastOut = reply0;
    session.lastOutAt = startedAt;
    writeReplay(session, rkey, startedAt, reply0, "general", {
      rawReply: reply0,
      followUps: toFollowUps(CANON_INTRO_CHIPS),
      followUpsStrings: toFollowUpsStrings(CANON_INTRO_CHIPS),
    });
    return {
      ok: true,
      reply: reply0,
      lane: "general",
      followUps: toFollowUps(CANON_INTRO_CHIPS),
      followUpsStrings: toFollowUpsStrings(CANON_INTRO_CHIPS),
      sessionPatch: buildSessionPatch(session),
      cog: { phase: "listening", state: "confident", reason: "post_intro_grace", lane: "general" },
      requestId,
      meta: {
        engine: CE_VERSION,
        suppressed: "post_intro_grace",
        source: safeMetaStr(source),
        nyxState: safeMetaStr(session.cog.state),
        elapsedMs: nowMs() - startedAt,
      },
    };
  }

  // Boot intro suppression
  if (bootIntroEmpty) {
    const introAt2 = safeInt(session.introAt || 0, 0);
    if (introAt2 && startedAt - introAt2 < INTRO_REARM_MS) {
      const lastOut = safeStr(session.lastOut || "").trim();
      const lane0 = safeStr(session.lane || "general") || "general";
      const reply0 = lastOut || "Ready when you are.";
      writeReplay(session, replayKey(session, clientRequestId, inboundText, source), startedAt, reply0, lane0, {
        rawReply: reply0,
        followUps: toFollowUps(CANON_INTRO_CHIPS),
        followUpsStrings: toFollowUpsStrings(CANON_INTRO_CHIPS),
      });
      return {
        ok: true,
        reply: reply0,
        lane: lane0,
        followUps: toFollowUps(CANON_INTRO_CHIPS),
        followUpsStrings: toFollowUpsStrings(CANON_INTRO_CHIPS),
        sessionPatch: buildSessionPatch(session),
        cog: { phase: "listening", state: "confident", reason: "boot_intro_suppressed", lane: lane0 },
        requestId,
        meta: {
          engine: CE_VERSION,
          bootIntroSuppressed: true,
          source: safeMetaStr(source),
          nyxState: safeMetaStr(session.cog.state),
          elapsedMs: nowMs() - startedAt,
        },
      };
    }
  }

  // Ignore empty non-boot ONLY if still empty after hydration attempts
  if (inboundIsEmpty && !bootIntroEmpty) {
    const reply0 = "Ready when you are. Tell me a year (1950–2024), or what you want to do next.";
    const laneX = safeStr(session.lane || "general") || "general";
    return {
      ok: true,
      reply: reply0,
      lane: laneX,
      followUps: toFollowUps(CANON_INTRO_CHIPS),
      followUpsStrings: toFollowUpsStrings(CANON_INTRO_CHIPS),
      sessionPatch: buildSessionPatch(session),
      cog: { phase: "listening", state: "confident", reason: "ignored_empty_nonboot", lane: laneX },
      requestId,
      meta: {
        engine: CE_VERSION,
        ignoredEmpty: true,
        source: safeMetaStr(source),
        nyxState: safeMetaStr(session.cog.state),
        elapsedMs: nowMs() - startedAt,
      },
    };
  }

  // Turn counters
  if (!bootIntroEmpty) {
    session.turnCount = safeInt(session.turnCount || 0, 0) + 1;
    session.turns = safeInt(session.turns || 0, 0) + 1;
  }
  if (!session.startedAt) session.startedAt = startedAt;
  if (!inboundIsEmpty) session.__hasRealUserTurn = 1;

  // Velvet Mode: earned intimacy (NEVER first contact)
  if (
    !session.__nyxVelvet &&
    safeInt(session.turnCount || 0, 0) >= 2 &&
    (!!session.lastMusicYear ||
      !!session.lastMode ||
      !!(session.cog && (session.cog.year || session.cog.mode || session.cog.lastMusicYear)))
  ) {
    session.__nyxVelvet = true;
  }

  session.lastTurnAt = startedAt;
  if (!bootIntroEmpty) {
    session.lastInText = inboundText;
    session.lastInAt = startedAt;
  }

  // Lane seed
  let lane = safeStr(session.lane || routeHint || "general").trim() || "general";

  // AUTHORITATIVE YEAR COMMIT (pre-engine)
  const modeNow = extractMode(inboundText);
  const top10Asked = isTop10IntentText(inboundText) || modeNow === "top10";

  const laneHint = normText(session.lane || routeHint || "");
  const forceMusicYear = !!resolvedYear0 && (laneHint === "music" || top10Asked);

  if (forceMusicYear) {
    session.lane = "music";
    session.cog.lane = "music";
    if (modeNow) session.cog.mode = modeNow;

    if (top10Asked) {
      session.activeMusicMode = "top10";
      session.lastMode = "top10";
      session.cog.mode = "top10";
      if (!modeNow) inboundText = `top 10 ${resolvedYear0}`;
    }
  }

  // Music override (text-based mode+year)
  const ov = applyMusicOverride(session, inboundText);
  if (ov.forced) lane = "music";
  if (forceMusicYear) lane = "music";

  // Intro
  const doIntro =
    !ov.forced &&
    !forceMusicYear &&
    shouldServeIntroLoginMoment(session, inboundText, startedAt, { ...input, source });

  if (doIntro) {
    session.__introDone = 1;
    session.introDone = true;
    session.introAt = startedAt;

    const isFirstEver =
      !session.__hasRealUserTurn &&
      !safeInt(session.introVariantId || 0, 0) &&
      !safeInt(session.introAt || 0, 0);
    const fromBootPing = isBootIntroSource({ ...input, source });

    // ✅ FIRST BOOT INTRO = canonical welcome (no shuffle-bag randomness for first impression)
    if (fromBootPing && (!session.__hasRealUserTurn || isFirstEver)) {
      session.lastLane = safeStr(session.lane || "");
      session.lane = "general";

      session.introBucket = "general";
      session.introVariantId = 0;

      const introLine = CANON_WELCOME;
      session.lastOut = introLine;
      session.lastOutAt = startedAt;

      session.allowPackets = false;

      const fu = toFollowUps(CANON_INTRO_CHIPS);
      const fus = toFollowUpsStrings(CANON_INTRO_CHIPS);

      writeReplay(session, rkey, startedAt, introLine, "general", {
        rawReply: introLine,
        followUps: fu,
        followUpsStrings: fus,
      });

      return {
        ok: true,
        reply: introLine,
        lane: "general",
        followUps: fu,
        followUpsStrings: fus,
        sessionPatch: buildSessionPatch(session),
        cog: { phase: "listening", state: "confident", reason: "intro_login_moment_canon", lane: "general" },
        requestId,
        meta: {
          engine: CE_VERSION,
          intro: true,
          introBucket: "general",
          introCanon: true,
          source: safeMetaStr(source),
          nyxState: safeMetaStr(session.cog.state),
        },
      };
    }

    const bucketKey = pickIntroBucket(session, inboundText, routeHint, { ...input, source });

    session.lastLane = safeStr(session.lane || "");
    session.lane = "general";

    const pick = pickIntroForLogin(session, startedAt, bucketKey);

    const introLine = nonEmptyReply(pick.text, CANON_WELCOME);

    session.lastOut = introLine;
    session.lastOutAt = startedAt;

    session.allowPackets = false;

    const fu = toFollowUps(CANON_INTRO_CHIPS);
    const fus = toFollowUpsStrings(CANON_INTRO_CHIPS);

    writeReplay(session, rkey, startedAt, introLine, "general", {
      rawReply: introLine,
      followUps: fu,
      followUpsStrings: fus,
    });

    return {
      ok: true,
      reply: introLine,
      lane: "general",
      followUps: fu,
      followUpsStrings: fus,
      sessionPatch: buildSessionPatch(session),
      cog: { phase: "listening", state: "confident", reason: "intro_login_moment", lane: "general" },
      requestId,
      meta: {
        engine: CE_VERSION,
        intro: true,
        introBucket: safeMetaStr(bucketKey),
        source: safeMetaStr(source),
        nyxState: safeMetaStr(session.cog.state),
      },
    };
  }

  // PACKETS gating decision
  const allowPackets = shouldAllowPackets(inboundText, routeHint, session, resolvedYear0);
  session.allowPackets = !!allowPackets;

  const resolved = resolveEngine(input, allowPackets);

  let core = null;
  let engineTimedOut = false;
  let engineEmptyReply = false;
  let engineOk = false;

  try {
    if (resolved.fn) {
      core = await withTimeout(
        Promise.resolve(
          resolved.fn({
            text: inboundText,
            session,
            requestId,
            routeHint: lane,
            allowPackets,
            packs: {
              conv: NYX_CONV_PACK,
              phrase: NYX_PHRASEPACK,
              packets: NYX_PACKETS,
            },
            ctx: { year: resolvedYear0 || undefined, lane },
          })
        ),
        ENGINE_TIMEOUT_MS,
        "engine"
      );
      engineOk = true;
      if (core && typeof core === "object") {
        const rr = safeStr(core.reply || "").trim();
        engineEmptyReply = !rr;
      }
    } else {
      core = fallbackCore({ text: inboundText, session, resolvedYear: resolvedYear0 });
    }
  } catch (e) {
    const msg = safeStr(e && e.message ? e.message : e).trim();
    engineTimedOut = msg.startsWith("timeout:engine:");
    core = {
      reply: engineTimedOut
        ? "Still with you. Give me a year (1950–2024) or say “top 10 1988” and I’ll jump right in."
        : "I hit a snag, but I’m still here. Tell me a year (1950–2024), or say “top 10 1988”.",
      lane: session.lane || lane || "general",
      cog: {
        phase: "engaged",
        state: "error",
        reason: engineTimedOut ? "engine_timeout" : "engine_error",
        detail: safeMetaStr(msg),
      },
    };
  } finally {
    session.allowPackets = false;
  }

  if (core && typeof core === "object") core = maybeAttachMusicFollowUps(core, resolvedYear0, inboundText, session);

  const outLane = safeStr((core && core.lane) || session.lane || lane || "general").trim() || "general";
  session.lane = ov.forced || forceMusicYear ? "music" : outLane;

  const resolvedYearFinal = resolveInboundYear(input, inboundText, session);

  let rawReply = nonEmptyReply(
    core && core.reply,
    resolvedYearFinal
      ? `Got it — ${resolvedYearFinal}. What do you want: Top 10, #1, story moment, or micro moment?`
      : "A year usually clears things up."
  );
  rawReply = clampStr(rawReply, MAX_REPLY_CHARS);

  const preservedNyxState = sanitizeNyxState(session.cog && session.cog.state) || NYX_STATE.COLD;
  const preservedNyxSeen = safeInt(session.cog && session.cog.__nyxLastSeenAt, 0);

  if (core && isPlainObject(core.sessionPatch)) {
    for (const [k, v] of Object.entries(core.sessionPatch)) {
      if (!PATCH_KEYS.has(k)) continue;
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      if (k === "cog") {
        if (isPlainObject(v)) {
          const incomingState = sanitizeNyxState(v.state);
          const incomingSeen = safeInt(v.__nyxLastSeenAt, 0);

          session.cog = v;

          session.cog.state = nyxAdvanceState(preservedNyxState, incomingState || preservedNyxState);
          session.cog.__nyxLastSeenAt = Math.max(preservedNyxSeen, incomingSeen || 0) || Date.now();
        }
        continue;
      }
      if (k === "__nyxIntro") {
        session.__nyxIntro = sanitizeNyxIntroState(v);
        continue;
      }
      if (k === "__ce_lastOutFollowUps") {
        if (Array.isArray(v)) session.__ce_lastOutFollowUps = v.slice(0, MAX_FOLLOWUPS);
        continue;
      }
      if (k === "__ce_lastOutFollowUpsStrings") {
        if (Array.isArray(v)) session.__ce_lastOutFollowUpsStrings = v.slice(0, MAX_FOLLOWUPS);
        continue;
      }
      if (k === "__ce_lastOutDirectives") {
        if (Array.isArray(v)) session.__ce_lastOutDirectives = v.slice(0, 8);
        continue;
      }
      session[k] = v;
    }
  }

  if (!sanitizeNyxState(session.cog && session.cog.state)) session.cog.state = preservedNyxState;
  session.cog.state = nyxAdvanceState(preservedNyxState, session.cog.state);

  const yPost = resolveInboundYear(input, inboundText, session);
  if (yPost) commitYear(session, yPost, (session.cog && session.cog.yearSource) || "post_engine");

  const reply = maybeApplyNyxGreetPrefix(session, isEmptyOrNoText(inboundText), bootIntroEmpty, rawReply);

  session.lastOut = reply;
  session.lastOutAt = startedAt;

  const directives = normalizeDirectives(core && core.directives);
  const followUps = normalizeFollowUps(core && core.followUps);
  const followUpsStrings =
    Array.isArray(core && core.followUpsStrings) && core.followUpsStrings.length
      ? core.followUpsStrings.slice(0, MAX_FOLLOWUPS)
      : undefined;

  writeReplay(session, rkey, startedAt, rawReply, session.lane, { rawReply, directives, followUps, followUpsStrings });

  return {
    ok: true,
    reply,
    lane: session.lane,
    directives,
    followUps,
    followUpsStrings,
    sessionPatch: buildSessionPatch(session),
    cog:
      (core && core.cog && typeof core.cog === "object" && core.cog) || {
        phase: "listening",
        state: "confident",
        reason: ov.forced || forceMusicYear ? "music_override" : "ok",
        lane: session.lane,
      },
    requestId,
    meta: {
      engine: CE_VERSION,
      source: safeMetaStr(source),
      routeHint: safeMetaStr(routeHint),
      inboundNormalized,
      allowPackets,
      resolvedYear: resolvedYearFinal || null,
      override:
        (ov.forced ? `music:${safeMetaStr(ov.mode)}:${safeMetaStr(ov.year)}` : "") ||
        (forceMusicYear ? `music:top10:${safeMetaStr(resolvedYear0)}` : ""),
      elapsedMs: nowMs() - startedAt,
      engineResolvedFrom: resolved.from,
      engineOk,
      engineTimeout: !!engineTimedOut,
      engineEmptyReply,
      packsLoaded: { conv: !!NYX_CONV_PACK, phrase: !!NYX_PHRASEPACK, packets: !!NYX_PACKETS, cs1: !!cs1 },
      velvet: !!session.__nyxVelvet,
      nyxState: safeMetaStr(session.cog && session.cog.state),
    },
  };
}

// Back-compat exports
module.exports = {
  handleChat,
  reply: handleChat,
  chatEngine: handleChat,
  CE_VERSION,
};
