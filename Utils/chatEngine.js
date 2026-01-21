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
 *    directives: [{type, ...}],             // NEW (contract-lock)
 *    followUps: [{id,type,label,payload}],  // preferred
 *    followUpsStrings: ["..."],             // legacy
 *    sessionPatch, cog, requestId, meta
 *  }
 *
 * v0.6z (CS-1 WIRING++: continuity enforcement + CS-1 session state allowlisted + deterministic turns for ALL early returns)
 *
 * Adds:
 *  ✅ CS-1 selector/enforcement wiring (optional module Utils/cs1.js)
 *     - Tracks session continuity state under session.__cs1
 *     - Marks speak events on key early-return replies (intro/reset/reentry/clarify/nav/deeper)
 *     - Enforces allowlist pass-through for __cs1 (prevents continuity spam resets)
 *
 * Fixes:
 *  ✅ Deterministic turns increment for ALL early returns (reset/intro/year-picker/name/depth/nav/deeper)
 *
 * Preserves:
 *  ✅ Contract-lock guarantees + loop guards + continuity spine + next/prev reliability
 */

const crypto = require("crypto");

// Optional LLM hook (if you use it elsewhere)
let generateNyxReply = null;
try {
  const mod = require("./nyxOpenAI");
  if (mod && typeof mod.generateNyxReply === "function") generateNyxReply = mod.generateNyxReply;
} catch (_) { /* optional */ }

// Optional music bridge
let musicLane = null;
try {
  const mod = require("./musicLane");
  if (typeof mod === "function") musicLane = mod;
  else if (mod && typeof mod.musicLane === "function") musicLane = mod.musicLane;
  else if (mod && typeof mod.handleChat === "function") {
    musicLane = async (text, session) => mod.handleChat({ text, session });
  }
} catch (_) { /* optional */ }

// Optional Roku bridge
let rokuLane = null;
try {
  const mod = require("./rokuLane");
  if (typeof mod === "function") rokuLane = mod;
  else if (mod && typeof mod.rokuLane === "function") rokuLane = mod.rokuLane;
} catch (_) { /* optional */ }

// ----------------------------
// CS-1 (optional selector/enforcement layer)
// ----------------------------
let CS1 = null;
try {
  const mod = require("./cs1");
  if (mod && typeof mod.decideCS1 === "function") CS1 = mod;
} catch (_) { /* optional */ }

// ----------------------------
// Utilities
// ----------------------------
function nowMs() { return Date.now(); }

function rid() {
  return crypto.randomBytes(6).toString("hex");
}

function normalizeText(s) {
  return String(s || "").trim().toLowerCase();
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function safeArray(a) {
  return Array.isArray(a) ? a : [];
}

function hashSig(s) {
  return crypto.createHash("sha256").update(String(s || "")).digest("hex").slice(0, 16);
}

function dedupeStrings(list, max = 10) {
  const out = [];
  const seen = new Set();
  for (const x of safeArray(list)) {
    const s = String(x || "").replace(/\s+/g, " ").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function chipsToStrings(chips) {
  const out = [];
  for (const c of safeArray(chips)) {
    if (!c) continue;
    const send = (c && typeof c === "object" && (c.send || c.label)) ? (c.send || c.label) : null;
    if (send) out.push(String(send));
  }
  return dedupeStrings(out, 10);
}

function normalizeFollowUpsFromLane(res) {
  if (!res || typeof res !== "object") return [];
  if (Array.isArray(res.followUpsStrings)) return dedupeStrings(res.followUpsStrings, 10);

  if (Array.isArray(res.followUps) && (res.followUps.length === 0 || typeof res.followUps[0] === "string")) {
    return dedupeStrings(res.followUps, 10);
  }

  if (Array.isArray(res.followUps) && res.followUps.length > 0 && typeof res.followUps[0] === "object") {
    return chipsToStrings(res.followUps);
  }

  return [];
}

function safeStr(x) { return String(x == null ? "" : x); }
function hasQuestionMark(s) { return /\?/.test(String(s || "")); }

// ----------------------------
// CONTRACT v1 helpers
// ----------------------------
const UI_PAYLOAD = {
  YEAR_PICKER: "__ui:year_picker__"
};

const CMD_PAYLOAD = {
  RESET: "__cmd:reset__"
};

function extractYearFromLabel(label) {
  const m = String(label || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? m[1] : null;
}

function payloadForLabel(label) {
  const s = String(label || "").replace(/\s+/g, " ").trim();
  const t = s.toLowerCase();

  // Command triggers
  if (t === "reset" || t === "reset chat" || t === "start over") return CMD_PAYLOAD.RESET;

  // UI triggers
  if (t === "pick a year" || t === "pick another year" || t === "years") return UI_PAYLOAD.YEAR_PICKER;

  // Years
  if (/^(19\d{2}|20\d{2})$/.test(s)) return `year:${s}`;

  // Music intents
  const y = extractYearFromLabel(s);
  if (y) {
    if (/^top\s*10\b/.test(t)) return `top 10 ${y}`;
    if (/^top\s*100\b/.test(t)) return `top 100 ${y}`;
    if (/^story\s*moment\b/.test(t)) return `story moment ${y}`;
    if (/^micro\s*moment\b/.test(t)) return `micro moment ${y}`;
    if (/^\#1\b/.test(t) || /^number\s*1\b/.test(t)) return `#1 ${y}`;
    if (/^next\s*year\b/.test(t)) {
      const n = clampInt(parseInt(y, 10) + 1, 1950, 2024);
      return `year:${n}`;
    }
    if (/^previous\s*year\b/.test(t) || /^prev\s*year\b/.test(t)) {
      const n = clampInt(parseInt(y, 10) - 1, 1950, 2024);
      return `year:${n}`;
    }
  }

  // Roku / schedule common
  if (t === "open roku") return "open roku";
  if (t === "schedule") return "schedule";
  if (t === "what’s playing now" || t === "what's playing now" || t === "playing now") return "what's playing now";

  // Default: send label as text
  return s;
}

function chipsFromStrings(strings, max = 4) {
  const list = dedupeStrings(strings, 10).slice(0, max);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const label = list[i];
    out.push({
      id: `c${i + 1}`,
      type: "chip",
      label,
      payload: payloadForLabel(label)
    });
  }
  return out;
}

function maybeInjectResetChip(strings, sess) {
  const s = safeArray(strings).slice(0);
  const turns = Number(sess && sess.turns) || 0;

  // Only show Reset once we’re “in” the conversation (prevents clutter on first touch)
  if (turns < 1 && !(sess && sess.introDone)) return s;

  const hasReset = s.some(x => normalizeText(x) === "reset");
  if (hasReset) return s;

  // Keep chips max=4: replace least valuable fallback if needed
  if (s.length < 4) return [...s, "Reset"];

  // prefer replacing “Just talk” first, then “Surprise me”
  const replOrder = ["just talk", "surprise me"];
  for (const k of replOrder) {
    const idx = s.findIndex(x => normalizeText(x) === k);
    if (idx >= 0) {
      s[idx] = "Reset";
      return s;
    }
  }

  // Otherwise replace last chip
  s[s.length - 1] = "Reset";
  return s;
}

/**
 * Music continuity UX:
 * If lane=music and we have a year, ALWAYS offer Next/Previous.
 */
function withMusicNavChips(followUpsStrings, cont, sess) {
  const base = safeArray(followUpsStrings);
  const lane = cont && cont.lane ? String(cont.lane) : "";
  const year = cont && cont.year ? String(cont.year) : "";

  if (lane !== "music" || !/^\d{4}$/.test(year)) {
    return maybeInjectResetChip(base, sess).slice(0, 4);
  }

  const wanted = ["Next", "Previous"];
  const out = [];
  const seen = new Set();

  // prepend Next/Previous
  for (const w of wanted) {
    const k = normalizeText(w);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(w);
    }
  }

  // then keep any existing chips (minus duplicates)
  for (const x of base) {
    const s = String(x || "").trim();
    if (!s) continue;
    const k = normalizeText(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= 4) break;
  }

  // ensure we still have Reset
  return maybeInjectResetChip(out.slice(0, 4), sess).slice(0, 4);
}

function ensureFollowUpsNonEmpty(lane, year, followUpsStrings, sess) {
  const base = safeArray(followUpsStrings);
  if (base.length > 0) return maybeInjectResetChip(base, sess);

  if (lane === "music") {
    if (year && /^\d{4}$/.test(String(year))) {
      return maybeInjectResetChip([`Top 10 ${year}`, `Story moment ${year}`, `Micro moment ${year}`, "Pick a year"], sess);
    }
    return maybeInjectResetChip(["Pick a year", "Surprise me", "Story moment", "Just talk"], sess);
  }

  if (lane === "roku") return maybeInjectResetChip(["Live linear", "VOD", "Schedule", "Open Roku"], sess);
  if (lane === "schedule") return maybeInjectResetChip(["Toronto", "London", "New York", "What’s playing now"], sess);
  if (lane === "tv") return maybeInjectResetChip(["Live linear", "VOD", "Show me the Roku path", "What’s playing now"], sess);
  if (lane === "radio") return maybeInjectResetChip(["Open radio", "Pick a year", "What’s playing now", "Just talk"], sess);

  return maybeInjectResetChip(["Pick a year", "Surprise me", "Story moment", "Just talk"], sess);
}

// ----------------------------
// HARDENING: SessionPatch Allowlist
// ----------------------------
const SESSION_ALLOW = new Set([
  "introDone", "introAt",
  "lastInText", "lastInAt", "lastOut", "lastOutAt",
  "lastOutSig", "lastOutSigAt",
  "turns", "startedAt", "lastTurnAt",
  "lanesVisited", "yearsVisited", "modesVisited",
  "lastLane", "lastYear", "lastMode",
  "lastFork", "depthLevel",
  "elasticToggle", "lastElasticAt",
  "lane",
  "pendingLane", "pendingMode", "pendingYear",
  "recentIntent", "recentTopic",
  "activeMusicMode", "lastMusicYear", "year", "mode",
  "musicContext",
  "depthPreference", "userName", "nameAskedAt", "lastOpenQuestion", "userGoal",
  "lastNameUseTurn",
  // ✅ CS-1 state (must be allowlisted or CS-1 will reset every turn)
  "__cs1"
]);

function filterSessionPatch(patch) {
  const out = {};
  if (!patch || typeof patch !== "object") return out;
  for (const k of Object.keys(patch)) {
    if (SESSION_ALLOW.has(k)) out[k] = patch[k];
  }
  return out;
}

// ----------------------------
// CS-1 helpers (no hard dependency)
// ----------------------------
function cs1FlagsFromText(text) {
  const t = normalizeText(text);

  const isGreeting =
    /^(hi|hello|hey|yo|good morning|good afternoon|good evening)\b/.test(t) ||
    /\b(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(t);

  const isReturn =
    /\b(i'?m back|im back|back again|we'?re back|were back|welcome back)\b/.test(t);

  const isHelp =
    /\b(help|options|menu|capabilities|what can you do|what do you do|how does this work)\b/.test(t);

  // chatEngine does not have a formal intent classifier in this file; treat these as best-effort flags
  return { isGreeting, isReturn, isHelp, isError: false, isFallback: false };
}

function cs1Decide(session, turnCount, text) {
  if (!CS1) return null;
  const now = nowMs();
  const f = cs1FlagsFromText(text);
  try {
    return CS1.decideCS1({
      session,
      turnCount,
      intent: "general",
      nowMs: now,
      isReturn: !!f.isReturn,
      isGreeting: !!f.isGreeting,
      isHelp: !!f.isHelp,
      isError: !!f.isError,
      isFallback: !!f.isFallback
    });
  } catch (_) {
    return null;
  }
}

function cs1MarkSpoke(session, turnCount, lineType) {
  if (!CS1) return;
  try {
    CS1.markSpoke(session, turnCount, nowMs(), lineType);
  } catch (_) { /* ignore */ }
}

// ----------------------------
// HARDENING: Input loop guard
// ----------------------------
function shouldReturnCachedForRepeat(session, userText) {
  const t = normalizeText(userText);
  if (!t) return false;

  const lastT = normalizeText(session && session.lastInText);
  const lastAt = Number(session && session.lastInAt) || 0;
  const withinMs = 6_000;

  if (lastT && t === lastT && (nowMs() - lastAt) <= withinMs) {
    const lastOut = session && session.lastOut;
    if (lastOut && typeof lastOut.reply === "string" && lastOut.reply.trim()) return true;
  }
  return false;
}

function cachedResponse(session, reason, requestIdIn) {
  const lastOut = (session && session.lastOut) || {};
  const reply = lastOut.reply || "One sec — try again.";
  const followUpsStrings = safeArray(lastOut.followUps).slice(0, 4);

  const out = maybeInjectResetChip(followUpsStrings, session);

  return {
    ok: true,
    reply,
    lane: (session && session.lane) || "general",
    ctx: {
      year: session && (session.lastYear || session.lastMusicYear || session.year) || null,
      mode: session && (session.lastMode || session.mode) || null
    },
    ui: { mode: "chat" },
    directives: [],
    followUpsStrings: out,
    followUps: chipsFromStrings(out, 4),
    sessionPatch: filterSessionPatch({
      lastInAt: nowMs(),
      recentIntent: "loop_guard",
      recentTopic: reason || "repeat_input",
      __cs1: session.__cs1
    }),
    cog: { phase: "engaged", state: "steady", reason: "input_loop_guard", lane: "general", ts: nowMs() },
    requestId: requestIdIn || rid(),
    meta: { ts: nowMs(), contract: "v1" }
  };
}

// ----------------------------
// Content signature dampener
// ----------------------------
function buildOutSig(reply, followUpsStrings) {
  const chips = safeArray(followUpsStrings).slice(0, 4).join(" | ");
  return hashSig(`${String(reply || "")}__${chips}`);
}

function dampenIfDuplicateOutput(session, reply, followUpsStrings) {
  const sig = buildOutSig(reply, followUpsStrings);
  const lastSig = (session && session.lastOutSig) || "";
  const lastSigAt = Number(session && session.lastOutSigAt) || 0;

  if (sig && lastSig && sig === lastSig && (nowMs() - lastSigAt) < 12_000) {
    const tweak = "\n\n(If you want, tell me what you want next — I’m listening.)";
    return { reply: `${reply}${tweak}`, sig: buildOutSig(`${reply}${tweak}`, followUpsStrings) };
  }
  return { reply, sig };
}

// ----------------------------
// Nyx Intro V2
// ----------------------------
function isDirectIntent(userText) {
  const t = normalizeText(userText);
  return /\b(top\s*10|top\s*100|#1|story\s*moment|micro\s*moment|schedule|what'?s\s*playing|playing\s*now|vod|roku|radio|tv|live|linear|live\s*linear|open|watch|play)\b/.test(t);
}

function shouldRunIntro(session, userText) {
  if (isDirectIntent(userText)) return false;
  if (session && session.introDone) return false;
  return true;
}

function nyxIntroReply() {
  const reply =
`Hey — I’m Nyx. I’ve got you.

I can pull up a year and take you straight into the music, give you a quick story moment, or guide you through Sandblast TV and what’s playing.

If you tell me your name, I’ll remember it for this session — or we can skip that.

What do you feel like right now: a specific year, a surprise, or just talking?`;

  const followUpsStrings = [
    "Pick a year",
    "Surprise me",
    "Story moment",
    "Just talk"
  ];

  return { reply, followUpsStrings };
}

// ----------------------------
// Depth Dial (Fast / Deep)
// ----------------------------
function isDepthDial(text) {
  const t = normalizeText(text);
  return t === "fast" || t === "deep";
}

function depthDialReply(pref) {
  if (pref === "deep") {
    return "Perfect. I’ll slow it down and add context as we go. What are we doing first—music, TV, or just talking?";
  }
  return "Got it. Fast and clean. Point me at a year, a show, or your goal.";
}

// ----------------------------
// Name Capture (session-safe)
// ----------------------------
function extractNameFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const m =
    raw.match(/^\s*(?:i'?m|i\s+am|my\s+name\s+is|call\s+me)\s+(.+?)\s*$/i);

  if (!m || !m[1]) return null;

  let name = m[1].trim();
  name = name.replace(/[.!?,;:]+$/g, "").trim();

  if (!/^[A-Za-z][A-Za-z' -]{0,19}$/.test(name)) return null;

  name = name.replace(/\s+/g, " ").trim();

  const parts = name.split(" ").filter(Boolean);
  if (parts.length > 2) return null;

  name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
  if (name.length < 2) return null;

  return name;
}

// ----------------------------
// NEXT / DEEPER INTENTS + CONTINUITY RESOLVER
// ----------------------------
function isNextIntent(text) {
  const t = normalizeText(text);
  return (
    t === "next" ||
    t === "next one" ||
    t === "next year" ||
    t === "continue" ||
    t === "keep going" ||
    t === "go on" ||
    t === "another" ||
    t === "more"
  );
}

function isPrevIntent(text) {
  const t = normalizeText(text);
  return (
    t === "previous" ||
    t === "previous year" ||
    t === "prev" ||
    t === "back" ||
    t === "go back"
  );
}

function isDeeperIntent(text) {
  const t = normalizeText(text);
  return (
    t === "deeper" ||
    t === "go deeper" ||
    t === "tell me more" ||
    t === "expand" ||
    t === "unpack that" ||
    t === "why" ||
    t === "how so"
  );
}

function detectLane(text) {
  const t = normalizeText(text);

  if (/\b(schedule|what'?s\s*playing|playing\s*now)\b/.test(t)) return "schedule";
  if (/\b(roku|vod|on\s*demand)\b/.test(t)) return "roku";
  if (/\b(tv|television)\b/.test(t)) return "tv";
  if (/\b(radio)\b/.test(t)) return "radio";
  if (/\b(top\s*10|top\s*100|#1|story\s*moment|micro\s*moment|\byear:\s*(19\d{2}|20\d{2})\b|\b19\d{2}\b|\b20\d{2}\b)\b/.test(t)) return "music";
  return "general";
}

/**
 * For continuity: treat "general" as unknown, not as a real override.
 * This prevents “next / previous / deeper” from erasing musicContext lane.
 */
function detectLaneForContinuity(text) {
  const l = detectLane(text);
  return l === "general" ? null : l;
}

function extractYear(text) {
  const s = String(text || "");
  const m1 = s.match(/\byear:\s*(19\d{2}|20\d{2})\b/i);
  if (m1) return m1[1];
  const m2 = s.match(/\b(19\d{2}|20\d{2})\b/);
  return m2 ? m2[1] : null;
}

function detectMode(text) {
  const t = normalizeText(text);
  if (/\bmicro\s*moment\b/.test(t)) return "micro_moment";
  if (/\bstory\s*moment\b/.test(t)) return "story_moment";
  if (/\btop\s*100\b/.test(t)) return "top100";
  if (/\btop\s*10\b/.test(t)) return "top10";
  if (/\b#1\b/.test(t)) return "number1";
  if (/\b(vod|on\s*demand)\b/.test(t)) return "vod";
  if (/\b(live|linear|live\s*linear)\b/.test(t)) return "live";
  if (/\b(surprise\s*me)\b/.test(t)) return "surprise";
  return null;
}

/**
 * ✅ Continuity spine read
 * Prefer session.musicContext first, then legacy fields.
 * IMPORTANT FIX: “general” does NOT override saved lane.
 */
function getContinuity(sess, safeText) {
  const s = sess || {};
  const inferredLane = detectLaneForContinuity(safeText);
  const yearFromText = extractYear(safeText);
  const modeFromText = detectMode(safeText);

  const mc = (s.musicContext && typeof s.musicContext === "object") ? s.musicContext : null;
  const mcLane = mc && mc.lane ? String(mc.lane).toLowerCase() : null;
  const mcYear = mc && mc.year ? String(mc.year) : null;
  const mcMode = mc && mc.mode ? String(mc.mode) : null;

  const lane =
    inferredLane ||
    mcLane ||
    s.lane ||
    s.lastLane ||
    (s.lastMusicYear || s.year ? "music" : "general");

  const activeYear =
    yearFromText ||
    s.pendingYear ||
    mcYear ||
    s.lastMusicYear ||
    s.year ||
    s.lastYear ||
    null;

  const activeMode =
    modeFromText ||
    s.pendingMode ||
    mcMode ||
    s.activeMusicMode ||
    s.mode ||
    s.lastMode ||
    null;

  return {
    lane: String(lane || "general").toLowerCase(),
    year: (activeYear && /^\d{4}$/.test(String(activeYear))) ? String(activeYear) : null,
    mode: activeMode ? String(activeMode) : null
  };
}

function modeToPrompt(mode, year) {
  const y = String(year || "").trim();
  const m = String(mode || "").toLowerCase();

  if (!y || !/^\d{4}$/.test(y)) return null;

  if (m === "top10") return `top 10 ${y}`;
  if (m === "top100") return `top 100 ${y}`;
  if (m === "story_moment") return `story moment ${y}`;
  if (m === "micro_moment") return `micro moment ${y}`;
  if (m === "number1") return `#1 ${y}`;

  return `top 10 ${y}`;
}

function computeYearDelta(year, delta) {
  const y = parseInt(String(year || ""), 10);
  if (!Number.isFinite(y)) return null;
  return clampInt(y + delta, 1950, 2024);
}

function nextDirective(cont) {
  const lane = cont && cont.lane ? cont.lane : "general";
  const mode = cont && cont.mode ? cont.mode : null;
  const year = cont && cont.year ? cont.year : null;

  if (lane !== "music") return null;
  if (!year || !/^\d{4}$/.test(String(year))) return { kind: "need_year" };

  const ny = computeYearDelta(year, +1);
  if (!ny) return { kind: "need_year" };

  const prompt = modeToPrompt(mode || "top10", String(ny));
  return { kind: "advance", year: String(ny), prompt, mode: mode || "top10" };
}

function prevDirective(cont) {
  const lane = cont && cont.lane ? cont.lane : "general";
  const mode = cont && cont.mode ? cont.mode : null;
  const year = cont && cont.year ? cont.year : null;

  if (lane !== "music") return null;
  if (!year || !/^\d{4}$/.test(String(year))) return { kind: "need_year" };

  const py = computeYearDelta(year, -1);
  if (!py) return { kind: "need_year" };

  const prompt = modeToPrompt(mode || "top10", String(py));
  return { kind: "advance", year: String(py), prompt, mode: mode || "top10" };
}

/**
 * CONTINUITY NORMALIZER (CRITICAL):
 * - Converts bare-year messages into mode-aware prompts.
 * - Converts year:YYYY into mode-aware prompts when we already have a music mode.
 * - Converts mode-only commands into mode+year when year is known.
 */
function isBareYearOnly(text) {
  const t = String(text || "").trim();
  return /^(19\d{2}|20\d{2})$/.test(t);
}

function isYearColon(text) {
  const t = String(text || "").trim();
  return /^year:\s*(19\d{2}|20\d{2})$/i.test(t);
}

function parseYearColon(text) {
  const m = String(text || "").trim().match(/^year:\s*(19\d{2}|20\d{2})$/i);
  return m ? m[1] : null;
}

function isModeOnlyWithoutYear(text) {
  const t = normalizeText(text);
  const hasYear = /\b(19\d{2}|20\d{2})\b/.test(t);
  if (hasYear) return false;
  return (
    t === "top 10" || t === "top10" || t === "top ten" ||
    t === "top 100" || t === "top100" ||
    t === "story moment" || t === "story" ||
    t === "micro moment" || t === "micro" ||
    t === "#1" || t === "number 1" || t === "no 1" || t === "no. 1"
  );
}

function normalizeModeOnlyToPrompt(text, cont, sess) {
  const t = normalizeText(text);
  const year =
    (cont && cont.year) ||
    (sess && sess.musicContext && sess.musicContext.year ? String(sess.musicContext.year) : null) ||
    (sess && (sess.lastMusicYear || sess.lastYear || sess.year) ? String(sess.lastMusicYear || sess.lastYear || sess.year) : null);

  if (!year || !/^\d{4}$/.test(String(year))) return null;

  if (/\btop\s*10\b|top10|top ten/.test(t)) return `top 10 ${year}`;
  if (/\btop\s*100\b|top100/.test(t)) return `top 100 ${year}`;
  if (/\bstory\s*moment\b|\bstory\b/.test(t)) return `story moment ${year}`;
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return `micro moment ${year}`;
  if (t === "#1" || /\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return `#1 ${year}`;

  return null;
}

// ----------------------------
// RESET intent + reset reply
// ----------------------------
function isResetIntent(text) {
  const t = normalizeText(text);
  return (
    t === "reset" ||
    t === "reset chat" ||
    t === "start over" ||
    t === "restart" ||
    t === CMD_PAYLOAD.RESET
  );
}

function resetReply() {
  const reply =
`Hey — I’m Nyx. I’ve got you.

Pick a year (1950–2024) and I’ll take you straight into the music — Top 10, a story moment, a micro moment, or the #1.
Or I can guide you through Sandblast TV/Roku.

Where do you want to start?`;

  const followUpsStrings = [
    "Pick a year",
    "Story moment",
    "Just talk",
    "What’s playing now"
  ];

  return { reply, followUpsStrings };
}

function resetSessionPatch(prevSess) {
  const keepDepthPref = (prevSess && prevSess.depthPreference) ? String(prevSess.depthPreference) : "fast";

  return filterSessionPatch({
    introDone: true,
    introAt: nowMs(),

    lastInText: "",
    lastInAt: nowMs(),
    lastOut: null,
    lastOutAt: 0,
    lastOutSig: "",
    lastOutSigAt: 0,

    turns: 0,
    startedAt: nowMs(),
    lastTurnAt: nowMs(),

    lanesVisited: [],
    yearsVisited: [],
    modesVisited: [],

    lastLane: null,
    lastYear: null,
    lastMode: null,

    lastFork: "reset",
    depthLevel: 0,

    elasticToggle: 0,
    lastElasticAt: 0,

    lane: "general",
    pendingLane: null,
    pendingMode: null,
    pendingYear: null,

    recentIntent: "reset",
    recentTopic: "reset",

    activeMusicMode: null,
    lastMusicYear: null,
    year: null,
    mode: null,

    musicContext: null,

    userGoal: "explore",
    depthPreference: keepDepthPref,
    lastOpenQuestion: null,
    nameAskedAt: 0,
    lastNameUseTurn: 0,

    // keep __cs1 if it exists; if not, omit (CS-1 module will re-init safely)
    __cs1: (prevSess && prevSess.__cs1) ? prevSess.__cs1 : undefined
  });
}

// ----------------------------
// CALL SIGNATURE NORMALIZER (CRITICAL)
// ----------------------------
function normalizeInputArgs(arg1, arg2) {
  // Unified call shape: chatEngine({text,session,requestId,debug,client:{routeHint,turnId}}, session?)
  if (arg1 && typeof arg1 === "object" && !Array.isArray(arg1)) {
    const obj = arg1;
    const text = typeof obj.text === "string" ? obj.text : (typeof obj.message === "string" ? obj.message : "");
    const session = (obj.session && typeof obj.session === "object") ? obj.session : (arg2 && typeof arg2 === "object" ? arg2 : {});
    const requestId = (typeof obj.requestId === "string" && obj.requestId.trim()) ? obj.requestId.trim() : null;
    const debug = !!obj.debug;

    const client = (obj.client && typeof obj.client === "object") ? obj.client : {};
    const routeHint = (typeof obj.routeHint === "string" ? obj.routeHint : (typeof client.routeHint === "string" ? client.routeHint : ""));
    const turnId = (typeof obj.turnId === "string" ? obj.turnId : (typeof client.turnId === "string" ? client.turnId : ""));

    return { text, session, requestId, debug, routeHint: String(routeHint || ""), turnId: String(turnId || "") };
  }

  return {
    text: typeof arg1 === "string" ? arg1 : String(arg1 || ""),
    session: (arg2 && typeof arg2 === "object") ? arg2 : {},
    requestId: null,
    debug: false,
    routeHint: "",
    turnId: ""
  };
}

// ----------------------------
// Year picker intent (backend-owned trigger)
// ----------------------------
function wantsYearPicker(text) {
  const t = normalizeText(text);
  return (
    t === UI_PAYLOAD.YEAR_PICKER ||
    t === "pick a year" ||
    t === "years" ||
    t === "pick another year"
  );
}

function yearPickerReply(sess) {
  const reply = "Pick a year (1950–2024). Want Top 10, a story moment, or a micro moment after you choose?";
  const followUpsStrings = [
    "Surprise me",
    "Top 10 1988",
    "Story moment 1955",
    "Just talk"
  ];
  return {
    ok: true,
    reply,
    lane: "music",
    ctx: {
      year: sess && (sess.lastYear || sess.lastMusicYear || sess.year) || null,
      mode: "discover"
    },
    ui: {
      mode: "year_picker",
      yearMin: 1950,
      yearMax: 2024,
      decadeJump: true
    },
    directives: [{ type: "open_year_picker" }],
    followUpsStrings,
    followUps: chipsFromStrings(followUpsStrings, 4)
  };
}

// ----------------------------
// DEEPER (mode-aware, deterministic)
// ----------------------------
function modeForDeeper(cont, sess) {
  const m =
    (cont && cont.mode ? String(cont.mode) : "") ||
    (sess && sess.musicContext && sess.musicContext.mode ? String(sess.musicContext.mode) : "") ||
    (sess && sess.activeMusicMode ? String(sess.activeMusicMode) : "") ||
    (sess && sess.lastMode ? String(sess.lastMode) : "") ||
    "";
  const mm = m.toLowerCase();

  if (mm === "story_moment" || mm === "micro_moment" || mm === "top10" || mm === "top100" || mm === "number1") return mm;

  const lane = (cont && cont.lane) || (sess && sess.lane) || "general";
  if (String(lane).toLowerCase() === "music") return "top10";

  return "general";
}

function deeperReply({ baseReply, cont, sess }) {
  const lane = (cont && cont.lane) ? String(cont.lane) : (sess && sess.lane ? String(sess.lane) : "general");
  const year =
    (cont && cont.year) ? String(cont.year)
      : (sess && sess.musicContext && sess.musicContext.year ? String(sess.musicContext.year)
        : (sess && (sess.lastMusicYear || sess.lastYear || sess.year) ? String(sess.lastMusicYear || sess.lastYear || sess.year) : ""));
  const mode = modeForDeeper(cont, sess);

  const cleanBase = String(baseReply || "").trim();
  if (!cleanBase) {
    return {
      reply: "Tell me what you want to go deeper on — a year, a story moment, a micro moment, or a #1.",
      lane,
      year: /^\d{4}$/.test(year) ? year : null,
      mode
    };
  }

  if (String(lane).toLowerCase() !== "music") {
    const reply = cleanBase + "\n\nTell me which lane you want to deepen: Music, TV/Roku, or Schedule.";
    return { reply, lane, year: null, mode: "general" };
  }

  const y = /^\d{4}$/.test(year) ? year : null;

  if (mode === "top10" || mode === "top100") {
    const reply =
      cleanBase +
      "\n\nDeeper cut: this year’s #1 isn’t just a song — it’s a timestamp. If you tell me where you were in life back then (school, first job, relationship), I’ll pin the vibe to that and keep the run going.\n\nWant the next year, or the previous?";
    return { reply, lane: "music", year: y, mode };
  }

  if (mode === "story_moment") {
    const reply =
      cleanBase +
      "\n\nDeeper cut: zoom in on the *emotion* of that year — what people were trying to escape, and what they were reaching for. That’s why the #1 felt inevitable.\n\nNext year, or stay here and go micro?";
    return { reply, lane: "music", year: y, mode };
  }

  if (mode === "micro_moment") {
    const reply =
      cleanBase +
      "\n\nDeeper cut: picture the scene — radio on, fluorescent lights somewhere, and that little half-second where you recognize the song before the lyric hits. That’s the “micro” that locks memory.\n\nNext year, or want another micro in this same year?";
    return { reply, lane: "music", year: y, mode };
  }

  if (mode === "number1") {
    const reply =
      cleanBase +
      "\n\nDeeper cut: #1 years tend to define the *texture* of the era — the production choices, the slang, the emotional posture. This one wasn’t just popular; it set the tone.\n\nNext year, or previous?";
    return { reply, lane: "music", year: y, mode };
  }

  const reply = cleanBase + "\n\nWant to go deeper on Top 10, #1, story moment, or micro moment?";
  return { reply, lane: "music", year: y, mode: "top10" };
}

// ----------------------------
// ROUTE HINT (deterministic lane routing)
// ----------------------------
function laneFromRouteHint(routeHint) {
  const t = normalizeText(routeHint || "");
  if (!t) return null;

  // canonical-ish route hints (be forgiving)
  if (t.includes("music")) return "music";
  if (t.includes("roku")) return "roku";
  if (t.includes("schedule")) return "schedule";
  if (t.includes("tv")) return "tv";
  if (t.includes("radio")) return "radio";
  if (t.includes("sponsor")) return "sponsors";

  // if they pass the lane name directly
  if (t === "general") return "general";
  return null;
}

function forcedModeFromRouteHint(routeHint) {
  const t = normalizeText(routeHint || "");
  if (!t) return null;
  if (t.includes("top10") || t.includes("top 10")) return "top10";
  if (t.includes("top100") || t.includes("top 100")) return "top100";
  if (t.includes("story")) return "story_moment";
  if (t.includes("micro")) return "micro_moment";
  if (t.includes("#1") || t.includes("number1") || t.includes("number 1")) return "number1";
  return null;
}

// ----------------------------
// CONTRACT ENFORCERS (NEW)
// ----------------------------
function isMusicMode(mode) {
  const m = String(mode || "").toLowerCase();
  return m === "top10" || m === "top100" || m === "story_moment" || m === "micro_moment" || m === "number1";
}

function musicModeNeedsYear(mode) {
  // For music modes, yes: year required for a meaningful response in this build.
  return isMusicMode(mode);
}

function looksLikeLabelOnlyMusicReply(reply, mode, year) {
  const r = String(reply || "").trim();
  if (!r) return true;

  // obvious label-only patterns
  if (/^top\s*10\s*\(?\s*\d{4}\s*\)?\s*$/i.test(r)) return true;
  if (/^top\s*100\s*\(?\s*\d{4}\s*\)?\s*$/i.test(r)) return true;
  if (/^story\s*moment\s*\(?\s*\d{4}\s*\)?\s*$/i.test(r)) return true;
  if (/^micro\s*moment\s*\(?\s*\d{4}\s*\)?\s*$/i.test(r)) return true;
  if (/^(#1|number\s*1)\s*\(?\s*\d{4}\s*\)?\s*$/i.test(r)) return true;

  // too short is suspicious for list modes
  const m = String(mode || "").toLowerCase();
  const y = String(year || "");
  if ((m === "top10" || m === "top100") && y && r.length < 80) return true;

  return false;
}

function buildClarifyYearReply({ lane, mode, knownYear }) {
  const m = String(mode || "").toLowerCase();
  const baseLane = String(lane || "music").toLowerCase();

  if (baseLane !== "music") {
    return {
      reply: "Tell me what you want next.",
      followUpsStrings: ["Pick a year", "Just talk", "Surprise me", "Reset"]
    };
  }

  if (knownYear && /^\d{4}$/.test(String(knownYear))) {
    // year known but we still clarified? keep it simple + mode options
    const y = String(knownYear);
    return {
      reply: `Got it — ${y}. Want Top 10, #1, a story moment, or a micro moment?`,
      followUpsStrings: [`Top 10 ${y}`, `#1 ${y}`, `Story moment ${y}`, `Micro moment ${y}`]
    };
  }

  if (m === "top10") {
    return { reply: "Which year do you want for Top 10? (1950–2024)", followUpsStrings: ["Pick a year", "Top 10 1988", "Top 10 1955", "Reset"] };
  }
  if (m === "top100") {
    return { reply: "Which year do you want for Top 100? (1950–2024)", followUpsStrings: ["Pick a year", "Top 100 1988", "Top 100 1979", "Reset"] };
  }
  if (m === "story_moment") {
    return { reply: "Which year do you want a story moment for? (1950–2024)", followUpsStrings: ["Pick a year", "Story moment 1955", "Story moment 1988", "Reset"] };
  }
  if (m === "micro_moment") {
    return { reply: "Which year do you want a micro moment for? (1950–2024)", followUpsStrings: ["Pick a year", "Micro moment 1979", "Micro moment 1994", "Reset"] };
  }
  if (m === "number1") {
    return { reply: "Which year do you want the #1 song for? (1950–2024)", followUpsStrings: ["Pick a year", "#1 1988", "#1 1967", "Reset"] };
  }

  return { reply: "Tell me a year (1950–2024).", followUpsStrings: ["Pick a year", "Top 10 1988", "Story moment 1955", "Reset"] };
}

function enforceOneIntent(out) {
  // “One intent per turn”: If we’re clarifying, reply must contain only a single question.
  // If it contains multiple question marks, reduce to first sentence ending with '?'.
  const reply = String(out.reply || "").trim();
  if (!reply) return out;

  const qCount = (reply.match(/\?/g) || []).length;
  if (qCount <= 1) return out;

  // keep only up to first '?'
  const idx = reply.indexOf("?");
  const clipped = idx >= 0 ? reply.slice(0, idx + 1) : reply;
  out.reply = clipped.trim();
  return out;
}

function enforceNonEmptyReply(out, fallbackText) {
  const r = String(out.reply || "").trim();
  if (r) return out;
  out.reply = String(fallbackText || "Tell me a year (1950–2024), or say “top 10 1988”.").trim();
  return out;
}

function ensureCog(out, lane, mode, year, state, reason) {
  const ts = nowMs();
  const baseLane = String(lane || "general");
  const cog = (out.cog && typeof out.cog === "object") ? out.cog : {};
  out.cog = {
    phase: cog.phase || "engaged",
    state: state || cog.state || "respond",
    reason: reason || cog.reason || "reply",
    lane: cog.lane || baseLane,
    year: year || cog.year,
    mode: mode || cog.mode,
    ts: cog.ts || ts
  };
  return out;
}

function ensureSessionPatchBasics(out, sess, routingText, lane, mode, year, followUpsStrings, outSig) {
  const patch = (out.sessionPatch && typeof out.sessionPatch === "object") ? out.sessionPatch : {};
  const turns = Number(sess.turns || 0);

  // always persist these
  patch.lastInText = routingText;
  patch.lastInAt = nowMs();
  patch.lastOut = { reply: out.reply, followUps: safeArray(followUpsStrings).slice(0, 4) };
  patch.lastOutAt = nowMs();
  patch.lastOutSig = outSig;
  patch.lastOutSigAt = nowMs();

  patch.lane = lane || patch.lane || sess.lane || "general";
  if (year) patch.lastYear = year;
  if (mode) patch.lastMode = mode;

  // ✅ deterministic turn increment
  patch.turns = turns + 1;
  patch.lastTurnAt = nowMs();
  if (!patch.startedAt) patch.startedAt = Number(sess.startedAt) || nowMs();

  // mirror music continuity
  if (String(lane).toLowerCase() === "music") {
    if (year) patch.lastMusicYear = year;
    if (mode) patch.activeMusicMode = mode;
    if (year) {
      patch.musicContext = {
        lane: "music",
        year: String(year),
        mode: String(mode || "top10"),
        lastAction: patch.recentIntent || "reply"
      };
    }
  }

  // ✅ preserve CS-1 state if present (and allowlisted)
  if (sess && sess.__cs1) patch.__cs1 = sess.__cs1;

  out.sessionPatch = filterSessionPatch(patch);
  return out;
}

function enforceContractFinal({
  out,
  sess,
  routingText,
  lane,
  mode,
  year,
  cont,
  routeHintLane,
  routeHintMode
}) {
  const baseLane = String(routeHintLane || lane || "general").toLowerCase();
  const baseMode = routeHintMode || mode || cont.mode || null;
  const baseYear = year || cont.year || null;

  // ensure followUps exist
  let fus = ensureFollowUpsNonEmpty(baseLane, baseYear, out.followUpsStrings || out.followUps || [], sess).slice(0, 4);

  // if music+year known, enforce Next/Previous chips
  fus = withMusicNavChips(fus, { lane: baseLane, year: baseYear, mode: baseMode }, sess);

  // content completeness gate for music modes
  if (baseLane === "music" && isMusicMode(baseMode)) {
    const needsYear = musicModeNeedsYear(baseMode);
    if (needsYear && !baseYear) {
      const clarify = buildClarifyYearReply({ lane: "music", mode: baseMode, knownYear: null });
      out.reply = clarify.reply;
      out.directives = [{ type: "open_year_picker" }];
      fus = maybeInjectResetChip(clarify.followUpsStrings, sess).slice(0, 4);
      out.followUpsStrings = fus;
      out.followUps = chipsFromStrings(fus, 4);
      out.ui = { mode: "chat" };
      out.lane = "music";
      out.ctx = { year: null, mode: baseMode };
      out = enforceOneIntent(out);
      out = enforceNonEmptyReply(out, clarify.reply);
      out = ensureCog(out, "music", baseMode, undefined, "clarify", "need_year");
      const sig = buildOutSig(out.reply, fus);
      out = ensureSessionPatchBasics(out, sess, routingText, "music", baseMode, null, fus, sig);
      // mark pending intent (helps continuity)
      out.sessionPatch = filterSessionPatch({
        ...out.sessionPatch,
        pendingLane: "music",
        pendingMode: baseMode,
        pendingYear: null,
        recentIntent: "clarify_year",
        recentTopic: `need_year:${String(baseMode)}`,
        __cs1: sess.__cs1
      });
      return out;
    }

    // year present but reply looks label-only → clarify (do not ship partial)
    if (baseYear && looksLikeLabelOnlyMusicReply(out.reply, baseMode, baseYear)) {
      const clarify = buildClarifyYearReply({ lane: "music", mode: baseMode, knownYear: baseYear });
      out.reply = clarify.reply;
      out.directives = [];
      fus = maybeInjectResetChip(clarify.followUpsStrings, sess).slice(0, 4);
      out.followUpsStrings = fus;
      out.followUps = chipsFromStrings(fus, 4);
      out.ui = { mode: "chat" };
      out.lane = "music";
      out.ctx = { year: parseInt(String(baseYear), 10), mode: baseMode };
      out = enforceOneIntent(out);
      out = enforceNonEmptyReply(out, clarify.reply);
      out = ensureCog(out, "music", baseMode, String(baseYear), "clarify", "incomplete_content");
      const sig = buildOutSig(out.reply, fus);
      out = ensureSessionPatchBasics(out, sess, routingText, "music", baseMode, String(baseYear), fus, sig);
      out.sessionPatch = filterSessionPatch({
        ...out.sessionPatch,
        recentIntent: "clarify_content",
        recentTopic: `incomplete:${String(baseMode)}:${String(baseYear)}`,
        __cs1: sess.__cs1
      });
      return out;
    }
  }

  // defaults if nothing special triggered
  out.followUpsStrings = fus;
  out.followUps = chipsFromStrings(fus, 4);
  if (!out.directives) out.directives = [];

  out = enforceOneIntent(out);
  out = enforceNonEmptyReply(out);

  const sig = buildOutSig(out.reply, fus);
  out = ensureCog(out, baseLane, baseMode || undefined, baseYear || undefined, out.cog && out.cog.state, out.cog && out.cog.reason);
  out = ensureSessionPatchBasics(out, sess, routingText, baseLane, baseMode, baseYear, fus, sig);

  // strict: keep ctx consistent
  out.lane = baseLane;
  out.ctx = out.ctx && typeof out.ctx === "object" ? out.ctx : {};
  out.ctx.year = baseYear ? parseInt(String(baseYear), 10) : null;
  out.ctx.mode = baseMode || null;

  // UI default
  out.ui = out.ui && typeof out.ui === "object" ? out.ui : { mode: "chat" };

  return out;
}

// ----------------------------
// Public API
// ----------------------------
async function chatEngine(arg1, arg2) {
  const norm = normalizeInputArgs(arg1, arg2);

  const text = String(norm.text || "").trim();
  const sess = norm.session && typeof norm.session === "object" ? norm.session : {};
  const requestId = norm.requestId || rid();
  const routeHintRaw = String(norm.routeHint || "").trim();

  const safeTextRaw = text === "[object Object]" ? "" : text;
  const safeText = safeTextRaw;

  // Deterministic routeHint
  const routeHintLane = laneFromRouteHint(routeHintRaw);
  const routeHintMode = forcedModeFromRouteHint(routeHintRaw);

  // ----------------------------
  // CS-1 decision snapshot (optional)
  // - We don’t *inject* language here (phrase packs do that),
  //   but we DO ensure CS-1 state exists and survives allowlisting.
  // ----------------------------
  const turnCountForCS1 = Number(sess.turns || 0) + 1;
  const cs1Decision = cs1Decide(sess, turnCountForCS1, safeText);
  if (cs1Decision && cs1Decision.sessionPatch && cs1Decision.sessionPatch.__cs1) {
    // store directly on session object so subsequent code sees it
    sess.__cs1 = cs1Decision.sessionPatch.__cs1;
  }

  // ----------------------------
  // RESET intercept (must be FIRST)
  // ----------------------------
  if (isResetIntent(safeText)) {
    const r = resetReply();
    const followUpsStrings = maybeInjectResetChip(r.followUpsStrings, { turns: 1, introDone: true });

    // CS-1: this is a "restart" style speak event
    cs1MarkSpoke(sess, turnCountForCS1, "reentry");

    const sessionPatchBase = resetSessionPatch(sess);
    const outSig = buildOutSig(r.reply, followUpsStrings);

    // ensure deterministic turns even on reset reply
    const patch = filterSessionPatch({
      ...sessionPatchBase,
      lastOut: { reply: r.reply, followUps: followUpsStrings },
      lastOutAt: nowMs(),
      lastOutSig: outSig,
      lastOutSigAt: nowMs(),
      turns: 0, // reset keeps turns 0 by design; next user input becomes turn 1
      __cs1: sess.__cs1
    });

    return {
      ok: true,
      reply: r.reply,
      lane: "general",
      ctx: { year: null, mode: "discover" },
      ui: { mode: "chat" },
      directives: [],
      followUpsStrings,
      followUps: chipsFromStrings(followUpsStrings, 4),
      sessionPatch: patch,
      cog: { phase: "engaged", state: "reset", reason: "user_reset", lane: "general", ts: nowMs() },
      requestId,
      meta: { ts: nowMs(), contract: "v1" }
    };
  }

  // ----------------------------
  // CONTINUITY SNAPSHOT (for mode-only rewrite + deeper/next/prev)
  // ----------------------------
  const cont0 = getContinuity(sess, safeText);

  // MODE-only command -> mode+year (if year known)
  const modeOnlyRewrite = (isModeOnlyWithoutYear(safeText) ? normalizeModeOnlyToPrompt(safeText, cont0, sess) : null);
  const safeTextForNorm = modeOnlyRewrite ? modeOnlyRewrite : safeText;

  // ----------------------------
  // CONTINUITY NORMALIZER
  // ----------------------------
  function normalizeContinuityInput(rawText, sessIn) {
    const t = String(rawText || "").trim();
    if (!t) return { text: t, normalized: false, reason: null };

    if (isResetIntent(t)) return { text: t, normalized: false, reason: null };

    // IMPORTANT: do not rewrite explicit mode+year strings; but allow our mode-only rewrite (already includes year)
    const tnorm = normalizeText(t);
    const alreadyExplicit =
      /\btop\s*10\b|\btop\s*100\b|\bstory\s*moment\b|\bmicro\s*moment\b|\b#1\b/.test(tnorm) &&
      /\b(19\d{2}|20\d{2})\b/.test(tnorm);

    if (alreadyExplicit) return { text: t, normalized: false, reason: null };

    const cont = getContinuity(sessIn, t);

    // Bare year "1989" -> mode-aware prompt (if music context exists)
    if (isBareYearOnly(t)) {
      const y = t;
      const mode = cont.mode || (cont.lane === "music" ? "top10" : null);
      if (cont.lane === "music" || sessIn.lastMusicYear || sessIn.activeMusicMode || sessIn.lastMode || (sessIn.musicContext && sessIn.musicContext.mode)) {
        return { text: modeToPrompt(mode || "top10", y), normalized: true, reason: "bare_year_mode_aware" };
      }
      return { text: `year:${y}`, normalized: true, reason: "bare_year_to_yearcolon" };
    }

    // year:YYYY -> if we have a mode, convert into that mode prompt
    if (isYearColon(t)) {
      const y = parseYearColon(t);
      const mode = cont.mode || (cont.lane === "music" ? "top10" : null);
      if (y && (cont.lane === "music" || sessIn.activeMusicMode || sessIn.lastMode || (sessIn.musicContext && sessIn.musicContext.mode))) {
        return { text: modeToPrompt(mode || "top10", y), normalized: true, reason: "yearcolon_to_mode_prompt" };
      }
      return { text: `year:${y}`, normalized: true, reason: "yearcolon_passthru" };
    }

    return { text: t, normalized: false, reason: null };
  }

  const normIn = normalizeContinuityInput(safeTextForNorm, sess);
  let routingText0 = normIn && typeof normIn.text === "string" ? normIn.text : safeTextForNorm;

  // If routeHint forces a mode and the text doesn’t specify one, inject it (deterministic)
  if (routeHintLane === "music" && routeHintMode && !detectMode(routingText0)) {
    const y = extractYear(routingText0) || cont0.year || (sess.musicContext && sess.musicContext.year) || sess.lastMusicYear || null;
    if (y && /^\d{4}$/.test(String(y))) {
      routingText0 = modeToPrompt(routeHintMode, String(y)) || routingText0;
    }
  }

  // Continuity snapshot (used for deeper/next/prev)
  const cont = getContinuity(sess, routingText0);

  // ----------------------------
  // DEEPER intercept (mode-aware, stays in-place)
  // ----------------------------
  if (isDeeperIntent(routingText0)) {
    cs1MarkSpoke(sess, turnCountForCS1, "continuity");

    const lastOut = sess && sess.lastOut && typeof sess.lastOut === "object" ? sess.lastOut : null;
    const baseReply = lastOut && typeof lastOut.reply === "string" ? lastOut.reply : "";
    const dr = deeperReply({ baseReply, cont, sess });

    const baseChips = ensureFollowUpsNonEmpty(
      String(dr.lane || cont.lane || "general"),
      dr.year || cont.year || null,
      safeArray(lastOut && lastOut.followUps ? lastOut.followUps : []),
      sess
    );

    const finalChips = withMusicNavChips(
      baseChips,
      { lane: String(dr.lane || cont.lane || "general"), year: dr.year || cont.year || null, mode: dr.mode || cont.mode || null },
      sess
    );

    const outSig = buildOutSig(dr.reply, finalChips);

    const laneOut = String(dr.lane || cont.lane || "general").toLowerCase();
    const yearOut = dr.year || cont.year || null;
    const modeOut = dr.mode || cont.mode || null;

    const sessionPatch = filterSessionPatch({
      lastInText: routingText0,
      lastInAt: nowMs(),

      lane: laneOut,
      lastYear: yearOut || undefined,
      lastMode: modeOut || undefined,

      activeMusicMode: (laneOut === "music") ? (modeOut || sess.activeMusicMode || (sess.musicContext && sess.musicContext.mode) || "top10") : (sess.activeMusicMode || undefined),
      lastMusicYear: (laneOut === "music") ? (yearOut || sess.lastMusicYear || (sess.musicContext && sess.musicContext.year) || undefined) : (sess.lastMusicYear || undefined),

      musicContext: (laneOut === "music" && yearOut)
        ? { lane: "music", year: String(yearOut), mode: String(modeOut || "top10"), lastAction: "deeper" }
        : (sess.musicContext || undefined),

      recentIntent: "deeper",
      recentTopic: `deeper:${String(modeOut || "general")}`,

      lastOut: { reply: dr.reply, followUps: finalChips },
      lastOutAt: nowMs(),
      lastOutSig: outSig,
      lastOutSigAt: nowMs(),

      turns: Number(sess.turns || 0) + 1,
      lastTurnAt: nowMs(),
      startedAt: Number(sess.startedAt) || nowMs(),

      __cs1: sess.__cs1
    });

    const out = {
      ok: true,
      reply: dr.reply,
      lane: laneOut,
      ctx: { year: yearOut ? parseInt(yearOut, 10) : null, mode: modeOut || null },
      ui: { mode: "chat" },
      directives: [],
      followUpsStrings: finalChips,
      followUps: chipsFromStrings(finalChips, 4),
      sessionPatch,
      cog: { phase: "engaged", state: "expand", reason: "deeper_mode_aware", lane: laneOut, year: yearOut || undefined, mode: modeOut || undefined, ts: nowMs() },
      requestId,
      meta: { ts: nowMs(), contract: "v1" }
    };

    return enforceContractFinal({
      out,
      sess,
      routingText: routingText0,
      lane: laneOut,
      mode: modeOut,
      year: yearOut,
      cont,
      routeHintLane,
      routeHintMode
    });
  }

  // ----------------------------
  // NEXT / PREVIOUS intercept
  // ----------------------------
  let routingText = routingText0;
  let navContext = null;

  if (isNextIntent(routingText0)) {
    cs1MarkSpoke(sess, turnCountForCS1, "continuity");

    const nx = nextDirective(cont);

    if (nx && nx.kind === "need_year") {
      const yp = yearPickerReply(sess);
      const sessionPatch = filterSessionPatch({
        lastInText: routingText0,
        lastInAt: nowMs(),
        recentIntent: "next_need_year",
        recentTopic: "next:need_year",
        lane: "music",
        pendingLane: "music",
        pendingMode: routeHintMode || cont.mode || (sess.musicContext && sess.musicContext.mode) || sess.activeMusicMode || "top10",
        turns: Number(sess.turns || 0) + 1,
        lastTurnAt: nowMs(),
        startedAt: Number(sess.startedAt) || nowMs(),
        __cs1: sess.__cs1
      });

      const chips = maybeInjectResetChip(yp.followUpsStrings, sess);

      const out = {
        ...yp,
        followUpsStrings: chips,
        followUps: chipsFromStrings(chips, 4),
        sessionPatch,
        cog: { phase: "engaged", state: "clarify", reason: "next_needs_year", lane: "music", ts: nowMs() },
        requestId,
        meta: { ts: nowMs(), contract: "v1" }
      };

      return enforceContractFinal({
        out,
        sess,
        routingText: routingText0,
        lane: "music",
        mode: routeHintMode || cont.mode || null,
        year: null,
        cont,
        routeHintLane,
        routeHintMode
      });
    }

    if (nx && nx.kind === "advance" && nx.prompt) {
      routingText = String(nx.prompt);
      navContext = { kind: "advance", dir: "next", year: String(nx.year), mode: String(nx.mode || "top10") };
    }
  } else if (isPrevIntent(routingText0)) {
    cs1MarkSpoke(sess, turnCountForCS1, "continuity");

    const pv = prevDirective(cont);

    if (pv && pv.kind === "need_year") {
      const yp = yearPickerReply(sess);
      const sessionPatch = filterSessionPatch({
        lastInText: routingText0,
        lastInAt: nowMs(),
        recentIntent: "prev_need_year",
        recentTopic: "prev:need_year",
        lane: "music",
        pendingLane: "music",
        pendingMode: routeHintMode || cont.mode || (sess.musicContext && sess.musicContext.mode) || sess.activeMusicMode || "top10",
        turns: Number(sess.turns || 0) + 1,
        lastTurnAt: nowMs(),
        startedAt: Number(sess.startedAt) || nowMs(),
        __cs1: sess.__cs1
      });

      const chips = maybeInjectResetChip(yp.followUpsStrings, sess);

      const out = {
        ...yp,
        followUpsStrings: chips,
        followUps: chipsFromStrings(chips, 4),
        sessionPatch,
        cog: { phase: "engaged", state: "clarify", reason: "prev_needs_year", lane: "music", ts: nowMs() },
        requestId,
        meta: { ts: nowMs(), contract: "v1" }
      };

      return enforceContractFinal({
        out,
        sess,
        routingText: routingText0,
        lane: "music",
        mode: routeHintMode || cont.mode || null,
        year: null,
        cont,
        routeHintLane,
        routeHintMode
      });
    }

    if (pv && pv.kind === "advance" && pv.prompt) {
      routingText = String(pv.prompt);
      navContext = { kind: "advance", dir: "prev", year: String(pv.year), mode: String(pv.mode || "top10") };
    }
  }

  // Name capture intercept
  const maybeName = extractNameFromText(routingText);
  if (maybeName) {
    cs1MarkSpoke(sess, turnCountForCS1, "reentry");

    const reply = `Nice to meet you, ${maybeName}. What do you feel like right now: a specific year, a surprise, or just talking?`;
    const base = ["Pick a year", "Surprise me", "Story moment", "Just talk"];
    const followUpsStrings = maybeInjectResetChip(base, sess);

    const outSig = buildOutSig(reply, followUpsStrings);

    const out = {
      ok: true,
      reply,
      lane: "general",
      ctx: { year: null, mode: "discover" },
      ui: { mode: "chat" },
      directives: [],
      followUpsStrings,
      followUps: chipsFromStrings(followUpsStrings, 4),
      sessionPatch: filterSessionPatch({
        lastInText: routingText,
        lastInAt: nowMs(),
        userName: maybeName,
        lastNameUseTurn: Number(sess.turns || 0),
        recentIntent: "name_capture",
        recentTopic: "name:capture",
        lane: "general",
        lastOut: { reply, followUps: followUpsStrings },
        lastOutAt: nowMs(),
        lastOutSig: outSig,
        lastOutSigAt: nowMs(),
        turns: Number(sess.turns || 0) + 1,
        lastTurnAt: nowMs(),
        startedAt: Number(sess.startedAt) || nowMs(),
        __cs1: sess.__cs1
      }),
      cog: { phase: "engaged", state: "welcome", reason: "name_captured", lane: "general", ts: nowMs() },
      requestId,
      meta: { ts: nowMs(), contract: "v1" }
    };

    return enforceContractFinal({
      out,
      sess,
      routingText,
      lane: "general",
      mode: null,
      year: null,
      cont,
      routeHintLane,
      routeHintMode
    });
  }

  // Depth dial intercept
  if (isDepthDial(routingText)) {
    cs1MarkSpoke(sess, turnCountForCS1, "continuity");

    const pref = normalizeText(routingText);
    const reply = depthDialReply(pref);
    const base = ["Pick a year", "What’s playing now", "Show me the Roku path", "Just talk"];
    const followUpsStrings = maybeInjectResetChip(base, sess);

    const outSig = buildOutSig(reply, followUpsStrings);

    const out = {
      ok: true,
      reply,
      lane: "general",
      ctx: { year: null, mode: "discover" },
      ui: { mode: "chat" },
      directives: [],
      followUpsStrings,
      followUps: chipsFromStrings(followUpsStrings, 4),
      sessionPatch: filterSessionPatch({
        lastInText: routingText,
        lastInAt: nowMs(),
        depthPreference: pref,
        recentIntent: "depth_dial",
        recentTopic: `depth:${pref}`,
        lane: "general",
        lastOut: { reply, followUps: followUpsStrings },
        lastOutAt: nowMs(),
        lastOutSig: outSig,
        lastOutSigAt: nowMs(),
        turns: Number(sess.turns || 0) + 1,
        lastTurnAt: nowMs(),
        startedAt: Number(sess.startedAt) || nowMs(),
        __cs1: sess.__cs1
      }),
      cog: { phase: "engaged", state: "calibrate", reason: "depth_dial", lane: "general", ts: nowMs() },
      requestId,
      meta: { ts: nowMs(), contract: "v1" }
    };

    return enforceContractFinal({
      out,
      sess,
      routingText,
      lane: "general",
      mode: null,
      year: null,
      cont,
      routeHintLane,
      routeHintMode
    });
  }

  // Year picker trigger (UI mode)
  if (wantsYearPicker(routingText)) {
    cs1MarkSpoke(sess, turnCountForCS1, "router");

    const yp = yearPickerReply(sess);
    const chips = maybeInjectResetChip(yp.followUpsStrings, sess);

    const out = {
      ...yp,
      followUpsStrings: chips,
      followUps: chipsFromStrings(chips, 4),
      sessionPatch: filterSessionPatch({
        lastInText: routingText,
        lastInAt: nowMs(),
        recentIntent: "year_picker",
        recentTopic: "ui:year_picker",
        lane: "music",
        turns: Number(sess.turns || 0) + 1,
        lastTurnAt: nowMs(),
        startedAt: Number(sess.startedAt) || nowMs(),
        __cs1: sess.__cs1
      }),
      cog: { phase: "engaged", state: "clarify", reason: "ui_year_picker", lane: "music", ts: nowMs() },
      requestId,
      meta: { ts: nowMs(), contract: "v1" }
    };

    return enforceContractFinal({
      out,
      sess,
      routingText,
      lane: "music",
      mode: routeHintMode || cont.mode || null,
      year: cont.year || null,
      cont,
      routeHintLane,
      routeHintMode
    });
  }

  // Repeat-input loop guard
  if (shouldReturnCachedForRepeat(sess, routingText)) {
    return cachedResponse(sess, "repeat_input", requestId);
  }

  const inPatch = filterSessionPatch({
    lastInText: routingText,
    lastInAt: nowMs(),
    __cs1: sess.__cs1
  });

  // Intro V2
  if (shouldRunIntro(sess, routingText)) {
    cs1MarkSpoke(sess, turnCountForCS1, "greeting");

    const intro = nyxIntroReply();
    const base = maybeInjectResetChip(intro.followUpsStrings, { turns: 1, introDone: true });
    const outSig = buildOutSig(intro.reply, base);

    const out = {
      ok: true,
      reply: intro.reply,
      lane: "general",
      ctx: { year: null, mode: "discover" },
      ui: { mode: "chat" },
      directives: [],
      followUpsStrings: base,
      followUps: chipsFromStrings(base, 4),
      sessionPatch: filterSessionPatch({
        ...inPatch,
        introDone: true,
        introAt: nowMs(),
        startedAt: Number(sess.startedAt) || nowMs(),

        // ✅ deterministic increment here (was previously static)
        turns: Number(sess.turns || 0) + 1,
        lastTurnAt: nowMs(),

        lastFork: "intro",
        depthLevel: Number(sess.depthLevel || 0),

        userGoal: "explore",
        depthPreference: sess.depthPreference || "fast",
        lastOpenQuestion: "What do you feel like right now: a specific year, a surprise, or just talking?",
        nameAskedAt: nowMs(),

        lane: "general",

        lastOut: { reply: intro.reply, followUps: base },
        lastOutAt: nowMs(),
        lastOutSig: outSig,
        lastOutSigAt: nowMs(),

        __cs1: sess.__cs1
      }),
      cog: { phase: "engaged", state: "welcome", reason: "intro_v2", lane: "general", ts: nowMs() },
      requestId,
      meta: { ts: nowMs(), contract: "v1" }
    };

    return enforceContractFinal({
      out,
      sess,
      routingText,
      lane: "general",
      mode: null,
      year: null,
      cont,
      routeHintLane,
      routeHintMode
    });
  }

  // ----------------------------
  // Normal routing (with routeHint precedence)
  // ----------------------------
  const detectedLane = detectLane(routingText);
  const detectedYear = extractYear(routingText);
  const detectedMode = detectMode(routingText);

  const lane = routeHintLane || detectedLane;
  const year = detectedYear || cont.year || null;
  const mode = routeHintMode || detectedMode || cont.mode || null;

  let reply = "";
  let followUpsStrings = [];
  let lanePatch = null;

  // Deterministic clarify if routeHint forces music+mode but we lack year
  if (lane === "music" && isMusicMode(mode) && !year) {
    cs1MarkSpoke(sess, turnCountForCS1, "router");

    const clarify = buildClarifyYearReply({ lane: "music", mode, knownYear: null });
    const chips = maybeInjectResetChip(clarify.followUpsStrings, sess).slice(0, 4);

    const out = {
      ok: true,
      reply: clarify.reply,
      lane: "music",
      ctx: { year: null, mode },
      ui: { mode: "chat" },
      directives: [{ type: "open_year_picker" }],
      followUpsStrings: chips,
      followUps: chipsFromStrings(chips, 4),
      sessionPatch: filterSessionPatch({
        ...inPatch,
        lane: "music",
        pendingLane: "music",
        pendingMode: mode,
        pendingYear: null,
        recentIntent: "clarify_year",
        recentTopic: `need_year:${String(mode)}`,
        turns: Number(sess.turns || 0) + 1,
        lastTurnAt: nowMs(),
        startedAt: Number(sess.startedAt) || nowMs(),
        __cs1: sess.__cs1
      }),
      cog: { phase: "engaged", state: "clarify", reason: "need_year", lane: "music", mode, ts: nowMs() },
      requestId,
      meta: { ts: nowMs(), contract: "v1" }
    };

    return enforceContractFinal({
      out,
      sess,
      routingText,
      lane: "music",
      mode,
      year: null,
      cont,
      routeHintLane,
      routeHintMode
    });
  }

  // Music lane call
  if (lane === "music" && musicLane) {
    try {
      const res = await musicLane(routingText, sess);
      reply = (res && res.reply) ? String(res.reply).trim() : "";
      followUpsStrings = normalizeFollowUpsFromLane(res);
      lanePatch = filterSessionPatch(res && res.sessionPatch ? res.sessionPatch : null);
    } catch (_) {
      reply = "";
      followUpsStrings = ["Top 10 1988", "Pick a year", "Story moment 1955", "Micro moment 1979"];
      lanePatch = null;
    }
  } else if (lane === "roku" && rokuLane) {
    try {
      const r = await rokuLane({ text: routingText, session: sess });
      reply = (r && r.reply) ? String(r.reply).trim() : "";
      followUpsStrings = normalizeFollowUpsFromLane(r);
      lanePatch = filterSessionPatch(r && r.sessionPatch ? r.sessionPatch : null);
    } catch (_) {
      reply = "";
      followUpsStrings = ["Live linear", "VOD", "Schedule", "Open Roku"];
      lanePatch = null;
    }
  } else if (lane === "radio") {
    reply = "Want to jump into the radio stream now, or should I guide you to a specific era first?";
    followUpsStrings = ["Open radio", "Pick a year", "What’s playing now", "Just talk"];
  } else if (lane === "tv") {
    reply = "Sandblast TV is coming in two flavors: **Live linear** and **VOD**.";
    followUpsStrings = ["Live linear", "VOD", "Show me the Roku path", "What’s playing now"];
  } else if (lane === "schedule") {
    reply = "Schedule mode — I can translate programming to your local time.";
    followUpsStrings = ["Toronto", "London", "New York", "What’s playing now"];
  } else {
    reply = "I’m with you.";
    followUpsStrings = ["Pick a year", "Surprise me", "Story moment", "Just talk"];
  }

  // If music+mode+year known but routingText didn’t include mode/year, stabilize continuity by prompt rewrite (no second call)
  let pinnedLane = (navContext && navContext.kind === "advance") ? "music" : lane;
  let pinnedYear = (navContext && navContext.kind === "advance") ? String(navContext.year) : (year || null);
  let pinnedMode =
    (navContext && navContext.kind === "advance") ? String(navContext.mode || "top10") :
    (mode || null);

  // Ensure we ALWAYS have followups (+Reset injection)
  followUpsStrings = ensureFollowUpsNonEmpty(pinnedLane, pinnedYear, followUpsStrings, sess).slice(0, 4);

  // Dampener/cache signature
  const damp = dampenIfDuplicateOutput(sess, reply, followUpsStrings);
  reply = damp.reply;
  const outSig = damp.sig;

  // continuity mirrors
  const activeMusicMode =
    pinnedLane === "music"
      ? (pinnedMode || (sess.musicContext && sess.musicContext.mode) || sess.activeMusicMode || sess.mode || "top10")
      : (sess.activeMusicMode || null);

  const lastMusicYear =
    pinnedLane === "music"
      ? (pinnedYear || (sess.musicContext && sess.musicContext.year) || sess.lastMusicYear || sess.year || sess.lastYear || null)
      : (sess.lastMusicYear || null);

  // enforce Next/Previous chips when music+year known
  const chipCont = { lane: pinnedLane, year: pinnedYear || lastMusicYear || null, mode: pinnedMode || activeMusicMode || null };
  followUpsStrings = withMusicNavChips(followUpsStrings, chipCont, sess);

  const outCache = { reply, followUps: safeArray(followUpsStrings).slice(0, 4) };

  const nextMusicContext =
    (String(pinnedLane).toLowerCase() === "music" && (pinnedYear || lastMusicYear))
      ? {
          lane: "music",
          year: String(pinnedYear || lastMusicYear),
          mode: String(pinnedMode || activeMusicMode || "top10"),
          lastAction: navContext ? String(navContext.dir || "nav") : (normIn.normalized ? "normalized" : (routeHintLane ? "routeHint" : "explicit"))
        }
      : (sess.musicContext || null);

  const sessionPatch = filterSessionPatch({
    ...inPatch,
    ...lanePatch,

    lane: pinnedLane,

    lastMusicYear: lastMusicYear || undefined,
    activeMusicMode: activeMusicMode || undefined,

    lastYear: pinnedYear || undefined,
    lastMode: pinnedMode || undefined,

    musicContext: nextMusicContext || undefined,

    recentIntent: normIn.normalized ? "continuity_normalized" : (routeHintLane ? "routeHint" : pinnedLane),
    recentTopic: normIn.normalized
      ? (normIn.reason || "continuity")
      : (routeHintRaw ? `routeHint:${routeHintRaw}` : (pinnedYear ? `year:${pinnedYear}` : (pinnedMode ? `mode:${pinnedMode}` : pinnedLane))),

    lastOut: outCache,
    lastOutAt: nowMs(),
    lastOutSig: outSig,
    lastOutSigAt: nowMs(),

    // ✅ deterministic increment for normal routing too
    turns: Number(sess.turns || 0) + 1,
    lastTurnAt: nowMs(),
    startedAt: Number(sess.startedAt) || nowMs(),

    __cs1: sess.__cs1
  });

  const ctx = {
    year: pinnedYear ? parseInt(pinnedYear, 10) : (sess.lastYear ? parseInt(sess.lastYear, 10) : null),
    mode: pinnedMode || (sess.lastMode || null)
  };

  let out = {
    ok: true,
    reply,
    lane: pinnedLane,
    ctx,
    ui: { mode: "chat" },

    directives: [],

    followUps: chipsFromStrings(followUpsStrings, 4),
    followUpsStrings,

    sessionPatch,
    cog: {
      phase: "engaged",
      state: "respond",
      reason: navContext ? "nav_advance" : (normIn.normalized ? "continuity_normalized" : (routeHintLane ? "routeHint" : "reply")),
      lane: pinnedLane,
      year: pinnedYear || undefined,
      mode: pinnedMode || undefined,
      ts: nowMs()
    },
    requestId,
    meta: { ts: nowMs(), contract: "v1" }
  };

  // FINAL CONTRACT-LOCK PASS (hard guarantees)
  out = enforceContractFinal({
    out,
    sess,
    routingText,
    lane: pinnedLane,
    mode: pinnedMode,
    year: pinnedYear,
    cont,
    routeHintLane,
    routeHintMode
  });

  // last polish: if clarify, keep exactly one question (no double prompts)
  if (out && out.cog && out.cog.state === "clarify") {
    out = enforceOneIntent(out);
    const r = String(out.reply || "").trim();
    if (!r.endsWith("?") && !hasQuestionMark(r)) {
      out.reply = r + "?";
    }
  }

  return out;
}

module.exports = chatEngine;
module.exports.chatEngine = chatEngine;
