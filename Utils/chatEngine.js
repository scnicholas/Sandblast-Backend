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
 *    followUps: [{id,type,label,payload}],   // preferred
 *    followUpsStrings: ["..."],             // legacy
 *    sessionPatch, cog, requestId, meta
 *  }
 *
 * v0.6t (RESET CHIP + RESET COMMAND)
 *  ✅ Adds “Reset” chip (backend-owned)
 *  ✅ Handles reset command from chip or typed text
 *  ✅ Soft-resets conversation via sessionPatch overwrite (no widget changes)
 *
 * Preserves:
 *  ✅ v1 chips + year picker UI
 *  ✅ loop guards + output dampener
 *  ✅ call signature hardening
 *  ✅ NEXT continuity from v0.6s
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
  "depthPreference", "userName", "nameAskedAt", "lastOpenQuestion", "userGoal",
  "lastNameUseTurn"
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
    followUpsStrings: out,
    followUps: chipsFromStrings(out, 4),
    sessionPatch: filterSessionPatch({
      lastInAt: nowMs(),
      recentIntent: "loop_guard",
      recentTopic: reason || "repeat_input"
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
// Micro-Bridge Layering
// ----------------------------
function needsBridge(sess, lane) {
  if (!sess) return false;
  const lastLane = sess.lastLane || null;
  if (!lastLane) return false;
  if (lastLane === lane) return false;

  const big = new Set(["music", "tv", "roku", "schedule", "radio", "general"]);
  return big.has(lastLane) && big.has(lane);
}

function bridgeLine(sess) {
  const pref = (sess && sess.depthPreference) || "fast";
  if (pref === "deep") return "Do you want the short version… or the full story?";
  return "Do you want the headline… or the whole thread?";
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

function shouldUseName(sess, turnsNow) {
  const name = sess && sess.userName ? String(sess.userName).trim() : "";
  if (!name) return false;

  const lastUse = Number(sess.lastNameUseTurn || 0);
  const gap = 12;
  return (turnsNow - lastUse) >= gap;
}

function maybePrependName(sess, turnsNow, reply) {
  const name = sess && sess.userName ? String(sess.userName).trim() : "";
  if (!name) return { reply, used: false };

  if (!shouldUseName(sess, turnsNow)) return { reply, used: false };

  const prefix = `Okay, ${name}. `;
  return { reply: `${prefix}${reply}`, used: true };
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

function isAmbiguousNav(text) {
  const t = normalizeText(text);
  return isNextIntent(t) || isDeeperIntent(t);
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

function getContinuity(sess, safeText) {
  const s = sess || {};
  const nav = isAmbiguousNav(safeText);

  const inferredLane = nav ? null : detectLane(safeText);
  const yearFromText = extractYear(safeText);
  const modeFromText = detectMode(safeText);

  const lane =
    inferredLane ||
    s.lane ||
    s.lastLane ||
    (s.lastMusicYear || s.year ? "music" : "general");

  const activeYear =
    yearFromText ||
    s.pendingYear ||
    s.lastMusicYear ||
    s.year ||
    s.lastYear ||
    null;

  const activeMode =
    modeFromText ||
    s.pendingMode ||
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

function computeNextYear(year) {
  const y = parseInt(String(year || ""), 10);
  if (!Number.isFinite(y)) return null;
  return clampInt(y + 1, 1950, 2024);
}

function nextDirective(cont) {
  const lane = cont && cont.lane ? cont.lane : "general";
  const mode = cont && cont.mode ? cont.mode : null;
  const year = cont && cont.year ? cont.year : null;

  if (lane !== "music") return null;
  if (!year || !/^\d{4}$/.test(String(year))) return { kind: "need_year" };

  const ny = computeNextYear(year);
  if (!ny) return { kind: "need_year" };

  const prompt = modeToPrompt(mode || "top10", String(ny));
  return { kind: "advance", year: String(ny), prompt, mode: mode || "top10" };
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
`Done. Clean slate.

Where do you want to go next — music (pick a year), Sandblast TV/Roku, or just talk?`;

  const followUpsStrings = [
    "Pick a year",
    "What’s playing now",
    "Show me the Roku path",
    "Just talk"
  ];

  return { reply, followUpsStrings };
}

function resetSessionPatch(prevSess) {
  const keepDepthPref = (prevSess && prevSess.depthPreference) ? String(prevSess.depthPreference) : "fast";

  // We overwrite allowlisted keys so the next turn behaves like a fresh session.
  return filterSessionPatch({
    introDone: false,
    introAt: 0,

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

    // keep userName (optional). if you want to wipe the name too, set userName:null here.
    userGoal: "explore",
    depthPreference: keepDepthPref,
    lastOpenQuestion: null,
    nameAskedAt: 0,
    lastNameUseTurn: 0
  });
}

// ----------------------------
// CALL SIGNATURE NORMALIZER (CRITICAL)
// ----------------------------
function normalizeInputArgs(arg1, arg2) {
  if (arg1 && typeof arg1 === "object" && !Array.isArray(arg1)) {
    const obj = arg1;
    const text = typeof obj.text === "string" ? obj.text : (typeof obj.message === "string" ? obj.message : "");
    const session = (obj.session && typeof obj.session === "object") ? obj.session : (arg2 && typeof arg2 === "object" ? arg2 : {});
    const requestId = (typeof obj.requestId === "string" && obj.requestId.trim()) ? obj.requestId.trim() : null;
    const debug = !!obj.debug;
    return { text, session, requestId, debug };
  }

  return {
    text: typeof arg1 === "string" ? arg1 : String(arg1 || ""),
    session: (arg2 && typeof arg2 === "object") ? arg2 : {},
    requestId: null,
    debug: false
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
    followUpsStrings,
    followUps: chipsFromStrings(followUpsStrings, 4)
  };
}

// ----------------------------
// Public API
// ----------------------------
async function chatEngine(arg1, arg2) {
  const norm = normalizeInputArgs(arg1, arg2);

  const text = String(norm.text || "").trim();
  const sess = norm.session && typeof norm.session === "object" ? norm.session : {};
  const requestId = norm.requestId || rid();

  const safeTextRaw = text === "[object Object]" ? "" : text;
  const safeText = safeTextRaw;

  // ----------------------------
  // RESET intercept (must be FIRST)
  // ----------------------------
  if (isResetIntent(safeText)) {
    const r = resetReply();
    const followUpsStrings = maybeInjectResetChip(r.followUpsStrings, { turns: 1, introDone: true });

    const sessionPatch = resetSessionPatch(sess);

    const outSig = buildOutSig(r.reply, followUpsStrings);

    return {
      ok: true,
      reply: r.reply,
      lane: "general",
      ctx: { year: null, mode: "discover" },
      ui: { mode: "chat" },
      followUpsStrings,
      followUps: chipsFromStrings(followUpsStrings, 4),
      sessionPatch: filterSessionPatch({
        ...sessionPatch,
        // cache the reset reply so loop guards don’t misbehave
        lastOut: { reply: r.reply, followUps: followUpsStrings },
        lastOutAt: nowMs(),
        lastOutSig: outSig,
        lastOutSigAt: nowMs()
      }),
      cog: { phase: "engaged", state: "reset", reason: "user_reset", lane: "general", ts: nowMs() },
      requestId,
      meta: { ts: nowMs(), contract: "v1" }
    };
  }

  // Continuity snapshot (used for next/deeper)
  const cont = getContinuity(sess, safeText);

  // ----------------------------
  // NEXT intent intercept
  // ----------------------------
  if (isNextIntent(safeText)) {
    const nx = nextDirective(cont);

    if (nx && nx.kind === "need_year") {
      const yp = yearPickerReply(sess);
      const sessionPatch = filterSessionPatch({
        lastInText: safeText,
        lastInAt: nowMs(),
        recentIntent: "next_need_year",
        recentTopic: "next:need_year",
        lane: "music",
        pendingLane: "music",
        pendingMode: cont.mode || sess.activeMusicMode || "top10"
      });

      const chips = maybeInjectResetChip(yp.followUpsStrings, sess);

      return {
        ...yp,
        followUpsStrings: chips,
        followUps: chipsFromStrings(chips, 4),
        sessionPatch,
        cog: { phase: "engaged", state: "guide", reason: "next_needs_year", lane: "music", ts: nowMs() },
        requestId,
        meta: { ts: nowMs(), contract: "v1" }
      };
    }

    if (nx && nx.kind === "advance" && nx.prompt) {
      var routingText = String(nx.prompt);
      var nextContext = nx;
    } else {
      var routingText = safeText;
      var nextContext = null;
    }
  } else {
    var routingText = safeText;
    var nextContext = null;
  }

  // Name capture intercept
  const maybeName = extractNameFromText(routingText);
  if (maybeName) {
    const reply = `Nice to meet you, ${maybeName}. What do you feel like right now: a specific year, a surprise, or just talking?`;
    const base = ["Pick a year", "Surprise me", "Story moment", "Just talk"];
    const followUpsStrings = maybeInjectResetChip(base, sess);

    const sessionPatch = filterSessionPatch({
      lastInText: routingText,
      lastInAt: nowMs(),
      userName: maybeName,
      lastNameUseTurn: Number(sess.turns || 0),
      recentTopic: "name:capture",
      lane: "general"
    });

    return {
      ok: true,
      reply,
      lane: "general",
      ctx: { year: null, mode: "discover" },
      ui: { mode: "chat" },
      followUpsStrings,
      followUps: chipsFromStrings(followUpsStrings, 4),
      sessionPatch,
      cog: { phase: "engaged", state: "welcome", reason: "name_captured", lane: "general", ts: nowMs() },
      requestId,
      meta: { ts: nowMs(), contract: "v1" }
    };
  }

  // Depth dial intercept
  if (isDepthDial(routingText)) {
    const pref = normalizeText(routingText);
    const reply = depthDialReply(pref);
    const base = ["Pick a year", "What’s playing now", "Show me the Roku path", "Just talk"];
    const followUpsStrings = maybeInjectResetChip(base, sess);

    const sessionPatch = filterSessionPatch({
      lastInText: routingText,
      lastInAt: nowMs(),
      depthPreference: pref,
      recentTopic: `depth:${pref}`,
      lane: "general"
    });

    return {
      ok: true,
      reply,
      lane: "general",
      ctx: { year: null, mode: "discover" },
      ui: { mode: "chat" },
      followUpsStrings,
      followUps: chipsFromStrings(followUpsStrings, 4),
      sessionPatch,
      cog: { phase: "engaged", state: "calibrate", reason: "depth_dial", lane: "general", ts: nowMs() },
      requestId,
      meta: { ts: nowMs(), contract: "v1" }
    };
  }

  // Year picker trigger (UI mode)
  if (wantsYearPicker(routingText)) {
    const yp = yearPickerReply(sess);
    const sessionPatch = filterSessionPatch({
      lastInText: routingText,
      lastInAt: nowMs(),
      recentIntent: "year_picker",
      recentTopic: "ui:year_picker",
      lane: "music"
    });

    const chips = maybeInjectResetChip(yp.followUpsStrings, sess);

    return {
      ...yp,
      followUpsStrings: chips,
      followUps: chipsFromStrings(chips, 4),
      sessionPatch,
      cog: { phase: "engaged", state: "guide", reason: "ui_year_picker", lane: "music", ts: nowMs() },
      requestId,
      meta: { ts: nowMs(), contract: "v1" }
    };
  }

  // Repeat-input loop guard
  if (shouldReturnCachedForRepeat(sess, routingText)) {
    return cachedResponse(sess, "repeat_input", requestId);
  }

  const inPatch = filterSessionPatch({
    lastInText: routingText,
    lastInAt: nowMs()
  });

  // Intro V2
  if (shouldRunIntro(sess, routingText)) {
    const intro = nyxIntroReply();
    const base = maybeInjectResetChip(intro.followUpsStrings, { turns: 1, introDone: true });
    const outSig = buildOutSig(intro.reply, base);

    const sessionPatch = filterSessionPatch({
      ...inPatch,
      introDone: true,
      introAt: nowMs(),
      startedAt: Number(sess.startedAt) || nowMs(),
      turns: Number(sess.turns) || 0,
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
      lastOutSigAt: nowMs()
    });

    return {
      ok: true,
      reply: intro.reply,
      lane: "general",
      ctx: { year: null, mode: "discover" },
      ui: { mode: "chat" },
      followUpsStrings: base,
      followUps: chipsFromStrings(base, 4),
      sessionPatch,
      cog: { phase: "engaged", state: "welcome", reason: "intro_v2", lane: "general", ts: nowMs() },
      requestId,
      meta: { ts: nowMs(), contract: "v1" }
    };
  }

  // Normal routing
  const lane = detectLane(routingText);
  const year = extractYear(routingText);
  const mode = detectMode(routingText);

  let reply = "";
  let followUpsStrings = [];
  let lanePatch = null;

  if (lane === "music" && musicLane) {
    try {
      const res = await musicLane(routingText, sess);
      reply = (res && res.reply) ? String(res.reply).trim() : "";
      if (!reply) reply = "Tell me a year (1950–2024), or say “top 10 1988”.";
      followUpsStrings = normalizeFollowUpsFromLane(res);
      lanePatch = filterSessionPatch(res && res.sessionPatch ? res.sessionPatch : null);
    } catch (_) {
      reply = "Music lane hiccup. Give me a year (1950–2024) and I’ll pull it up.";
      followUpsStrings = ["Top 10 1988", "Pick a year", "Story moment 1955", "Micro moment 1979"];
      lanePatch = null;
    }
  } else if (lane === "roku" && rokuLane) {
    try {
      const r = await rokuLane({ text: routingText, session: sess });
      reply = (r && r.reply) ? String(r.reply).trim() : "Roku mode — live linear or VOD?";
      followUpsStrings = normalizeFollowUpsFromLane(r);
      lanePatch = filterSessionPatch(r && r.sessionPatch ? r.sessionPatch : null);
    } catch (_) {
      reply = "Roku routing is warming up.";
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

  // Ensure we ALWAYS have followups (+Reset injection)
  followUpsStrings = ensureFollowUpsNonEmpty(lane, year, followUpsStrings, sess).slice(0, 4);

  // Dampener/cache signature
  const damp = dampenIfDuplicateOutput(sess, reply, followUpsStrings);
  reply = damp.reply;
  const outSig = damp.sig;

  // continuity pins for NEXT (unchanged from v0.6s behavior)
  const pinnedLane = (nextContext && nextContext.kind === "advance") ? "music" : lane;
  const pinnedYear = (nextContext && nextContext.kind === "advance") ? String(nextContext.year) : (year || null);
  const pinnedMode =
    (nextContext && nextContext.kind === "advance") ? String(nextContext.mode || "top10") :
    (mode || null);

  const activeMusicMode =
    pinnedLane === "music"
      ? (pinnedMode || sess.activeMusicMode || sess.mode || "top10")
      : (sess.activeMusicMode || null);

  const lastMusicYear =
    pinnedLane === "music"
      ? (pinnedYear || sess.lastMusicYear || sess.year || sess.lastYear || null)
      : (sess.lastMusicYear || null);

  const outCache = { reply, followUps: safeArray(followUpsStrings).slice(0, 4) };

  const sessionPatch = filterSessionPatch({
    ...inPatch,
    ...lanePatch,

    lane: pinnedLane,

    lastMusicYear: lastMusicYear || undefined,
    activeMusicMode: activeMusicMode || undefined,

    lastYear: pinnedYear || undefined,
    lastMode: pinnedMode || undefined,

    recentIntent: pinnedLane,
    recentTopic: pinnedYear ? `year:${pinnedYear}` : (pinnedMode ? `mode:${pinnedMode}` : pinnedLane),

    lastOut: outCache,
    lastOutAt: nowMs(),
    lastOutSig: outSig,
    lastOutSigAt: nowMs()
  });

  const ctx = {
    year: pinnedYear ? parseInt(pinnedYear, 10) : (sess.lastYear ? parseInt(sess.lastYear, 10) : null),
    mode: pinnedMode || (sess.lastMode || null)
  };

  return {
    ok: true,
    reply,
    lane: pinnedLane,
    ctx,
    ui: { mode: "chat" },

    followUps: chipsFromStrings(followUpsStrings, 4),
    followUpsStrings,

    sessionPatch,
    cog: {
      phase: "engaged",
      state: "respond",
      reason: nextContext ? "next_advance" : "reply",
      lane: pinnedLane,
      year: pinnedYear || undefined,
      mode: pinnedMode || undefined,
      ts: nowMs()
    },
    requestId,
    meta: { ts: nowMs(), contract: "v1" }
  };
}

module.exports = chatEngine;
module.exports.chatEngine = chatEngine;
