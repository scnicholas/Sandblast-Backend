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
 * v0.6s (CONTINUITY+NEXT: “next” advances year based on current mode; deeper dialog hooks)
 *
 * Adds:
 *  ✅ Ambiguous-nav continuity resolver (prevents “next” → lane=general override)
 *  ✅ Next intent: advances year + preserves mode (top10/story/micro/#1)
 *  ✅ Stores activeMusicMode + lastMusicYear deterministically
 *  ✅ Optional deeper dialog sprinkle (non-LLM) + safe hooks for LLM later
 *
 * Preserves:
 *  ✅ CONTRACT v1 chips + year picker UI
 *  ✅ Loop guards + output dampener
 *  ✅ Call signature hardening
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
    // handleChat style: ({text, session}) -> {reply, followUpsStrings, followUps, sessionPatch}
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

/**
 * Normalize followups coming back from lane modules into a simple string list.
 * (We then convert to contract chips below.)
 */
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

function extractYearFromLabel(label) {
  const m = String(label || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? m[1] : null;
}

function payloadForLabel(label) {
  const s = String(label || "").replace(/\s+/g, " ").trim();
  const t = s.toLowerCase();

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

function ensureFollowUpsNonEmpty(lane, year, followUpsStrings) {
  const base = safeArray(followUpsStrings);
  if (base.length > 0) return base;

  if (lane === "music") {
    if (year && /^\d{4}$/.test(String(year))) {
      return [`Top 10 ${year}`, `Story moment ${year}`, `Micro moment ${year}`, "Pick a year"];
    }
    return ["Pick a year", "Surprise me", "Story moment", "Just talk"];
  }

  if (lane === "roku") return ["Live linear", "VOD", "Schedule", "Open Roku"];
  if (lane === "schedule") return ["Toronto", "London", "New York", "What’s playing now"];
  if (lane === "tv") return ["Live linear", "VOD", "Show me the Roku path", "What’s playing now"];
  if (lane === "radio") return ["Open radio", "Pick a year", "What’s playing now", "Just talk"];

  return ["Pick a year", "Surprise me", "Story moment", "Just talk"];
}

// ----------------------------
// HARDENING: SessionPatch Allowlist
// ----------------------------
const SESSION_ALLOW = new Set([
  // intro
  "introDone", "introAt",

  // loop guards
  "lastInText", "lastInAt", "lastOut", "lastOutAt",
  "lastOutSig", "lastOutSigAt",

  // continuity telemetry
  "turns", "startedAt", "lastTurnAt",
  "lanesVisited", "yearsVisited", "modesVisited",
  "lastLane", "lastYear", "lastMode",
  "lastFork", "depthLevel",

  // elasticity
  "elasticToggle", "lastElasticAt",

  // lane continuity (safe)
  "lane",
  "pendingLane", "pendingMode", "pendingYear",
  "recentIntent", "recentTopic",

  // music continuity (safe)
  "activeMusicMode", "lastMusicYear", "year", "mode",

  // conversational layering (safe)
  "depthPreference", "userName", "nameAskedAt", "lastOpenQuestion", "userGoal",

  // name sparsity gate
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

  return {
    ok: true,
    reply,
    lane: (session && session.lane) || "general",
    ctx: {
      year: session && (session.lastYear || session.lastMusicYear || session.year) || null,
      mode: session && (session.lastMode || session.mode) || null
    },
    ui: { mode: "chat" },
    followUpsStrings,
    followUps: chipsFromStrings(followUpsStrings, 4),
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
  const gap = 12; // once every 12 turns max
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
// ADVANCEMENT ENGINE V1
// ----------------------------
function replyHasQuestion(reply) {
  const r = String(reply || "").trim();
  if (!r) return false;
  const tail = r.slice(-220);
  return tail.includes("?");
}

function advancePack(lane, sess) {
  const s = sess || {};
  const y = s.lastMusicYear || s.year || s.lastYear || null;

  if (lane === "music") {
    if (y && /^\d{4}$/.test(String(y))) {
      const yy = parseInt(String(y), 10);
      return {
        line: `Want the **Top 10**, a **story moment**, or a **micro moment** for ${yy}?`,
        chips: [`Top 10 ${yy}`, `Story moment ${yy}`, `Micro moment ${yy}`, "Pick a year"]
      };
    }
    return {
      line: "Give me a year (1950–2024) and I’ll take you straight in.",
      chips: ["1988", "1956", "Top 10 1988", "Pick a year"]
    };
  }

  if (lane === "roku") {
    return {
      line: "Do you want **Live linear** (lean back) or **VOD** (pick a show)?",
      chips: ["Live linear", "VOD", "Schedule", "Open Roku"]
    };
  }

  if (lane === "schedule") {
    return {
      line: "Tell me your city (or timezone) and I’ll translate everything to your local time.",
      chips: ["Toronto", "London", "New York", "What’s playing now"]
    };
  }

  if (lane === "radio") {
    return {
      line: "Want me to open the stream, or guide you to an era first?",
      chips: ["Open radio", "Pick a year", "What’s playing now", "Just talk"]
    };
  }

  if (lane === "tv") {
    return {
      line: "Do you want **Live linear** or **VOD**?",
      chips: ["Live linear", "VOD", "Show me the Roku path", "What’s playing now"]
    };
  }

  return {
    line: "Point me at music, Roku/TV, schedule—or tell me what you’re trying to do today.",
    chips: ["Pick a year", "Show me the Roku path", "What’s playing now", "Just talk"]
  };
}

function applyAdvancement({ inputText, reply, followUpsStrings, lane, sess }) {
  const t = normalizeText(inputText);

  if (isDirectIntent(t)) return { reply, followUpsStrings };
  if (replyHasQuestion(reply)) return { reply, followUpsStrings };

  const pack = advancePack(lane, sess);

  const outReply = `${String(reply || "").trim()}\n\n${pack.line}`.trim();

  const merged = [...safeArray(followUpsStrings), ...safeArray(pack.chips)];
  const outChips = dedupeStrings(merged, 10).slice(0, 4);

  return { reply: outReply, followUpsStrings: outChips };
}

// ----------------------------
// Elasticity Engine
// ----------------------------
function bumpTelemetry(session, lane, year, mode) {
  const s = session || {};
  const turns = (Number(s.turns) || 0) + 1;

  const lanes = safeArray(s.lanesVisited).slice(0);
  if (lane && !lanes.includes(lane)) lanes.push(lane);

  const years = safeArray(s.yearsVisited).slice(0);
  if (year && !years.includes(year)) years.push(year);

  const modes = safeArray(s.modesVisited).slice(0);
  if (mode && !modes.includes(mode)) modes.push(mode);

  return {
    turns,
    lanesVisited: lanes.slice(-8),
    yearsVisited: years.slice(-12),
    modesVisited: modes.slice(-8),
    lastLane: lane || s.lastLane || "general",
    lastYear: year || s.lastYear || null,
    lastMode: mode || s.lastMode || null,
    startedAt: Number(s.startedAt) || Number(s.introAt) || nowMs(),
    lastTurnAt: nowMs()
  };
}

function shouldElasticOverlay(session, userText) {
  if (!session || !session.introDone) return false;
  if (!userText || !normalizeText(userText)) return false;
  if (isDirectIntent(userText)) return false;

  const turns = Number(session.turns || 0);
  const startedAt = Number(session.startedAt || session.introAt || nowMs());
  const elapsedMs = nowMs() - startedAt;

  const checkpointByTurns = (turns > 0 && turns % 6 === 0);
  const lastElasticAt = Number(session.lastElasticAt || 0);
  const checkpointByTime = (elapsedMs >= 8 * 60 * 1000) && (nowMs() - lastElasticAt >= 8 * 60 * 1000);

  if (!(checkpointByTurns || checkpointByTime)) return false;

  const toggle = Number(session.elasticToggle || 0);
  return (toggle % 2 === 0);
}

function elasticityOverlay(session) {
  const lanes = safeArray(session.lanesVisited);
  const years = safeArray(session.yearsVisited);
  const modes = safeArray(session.modesVisited);

  const lastLane = lanes[lanes.length - 1] || session.lastLane || "general";
  const lastYear = years[years.length - 1] || session.lastYear || null;
  const lastMode = modes[modes.length - 1] || session.lastMode || null;

  let reflect = "We’ve been exploring together for a bit.";
  if (lastYear && lastMode) reflect = `We’ve been in ${String(lastYear)} (${String(lastMode)}) for a moment.`;
  else if (lastYear) reflect = `We’ve been circling around ${String(lastYear)} for a moment.`;
  else if (lastLane && lastLane !== "general") reflect = `We’ve been in the ${String(lastLane)} lane for a moment.`;

  const chips = [];
  if (lastYear && /^\d{4}$/.test(String(lastYear))) {
    const y = parseInt(lastYear, 10);
    chips.push(`Top 10 ${y}`);
    chips.push(`Story moment ${y}`);
    chips.push(`Micro moment ${y}`);
    if (Number.isFinite(y)) {
      chips.push(`Next year (${y + 1})`);
      chips.push(`Previous year (${y - 1})`);
    }
  } else {
    chips.push("Pick a year");
    chips.push("What’s playing now");
    chips.push("Show me the Roku path");
    chips.push("Surprise me");
  }

  const reply =
`${reflect}

Do you want to keep going in the same direction — or pivot a little?`;

  return { reply, followUpsStrings: chips.filter(Boolean).slice(0, 4) };
}

// ----------------------------
// Phase3 Continuity Overlay (consult-only sprinkle)
// ----------------------------
function phase3Sprinkle(session) {
  const depth = Number(session && session.depthLevel) || 0;
  if (depth < 3) return null;

  const lines = [
    "If you want, we can tighten this into a clean path: ask → answer → deepen → pivot.",
    "I can also keep a running thread so we don’t lose the plot as we explore.",
    "We can make this feel like a guided journey instead of a Q&A."
  ];

  const idx = clampInt(depth, 0, lines.length - 1);
  return lines[idx] || null;
}

// ----------------------------
// Core routing
// ----------------------------
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
  // support "year:1990" format
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

function getContinuity(sess, safeText) {
  const s = sess || {};
  const nav = isAmbiguousNav(safeText);

  // CRITICAL: do not override lane with detectLane() on ambiguous nav inputs (“next”)
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

  // default music progression when unknown but in music lane
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

  // preserve current mode (top10/story/micro/#1). if none, default top10.
  const prompt = modeToPrompt(mode || "top10", String(ny));
  return { kind: "advance", year: String(ny), prompt, mode: mode || "top10" };
}

// ----------------------------
// CALL SIGNATURE NORMALIZER (CRITICAL)
// ----------------------------
function normalizeInputArgs(arg1, arg2) {
  // Style B: chatEngine({ text, session, requestId, debug })
  if (arg1 && typeof arg1 === "object" && !Array.isArray(arg1)) {
    const obj = arg1;
    const text = typeof obj.text === "string" ? obj.text : (typeof obj.message === "string" ? obj.message : "");
    const session = (obj.session && typeof obj.session === "object") ? obj.session : (arg2 && typeof arg2 === "object" ? arg2 : {});
    const requestId = (typeof obj.requestId === "string" && obj.requestId.trim()) ? obj.requestId.trim() : null;
    const debug = !!obj.debug;
    return { text, session, requestId, debug };
  }

  // Style A: chatEngine("hi", session)
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

  // Avoid poisoning on bad inputs
  const safeText = text === "[object Object]" ? "" : text;

  // Continuity snapshot (used for next/deeper)
  const cont = getContinuity(sess, safeText);

  // ----------------------------
  // NEXT intent intercept (before lane detection)
  // ----------------------------
  if (isNextIntent(safeText)) {
    const nx = nextDirective(cont);

    // If we’re in music lane but have no year, push year picker UI.
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

      return {
        ...yp,
        sessionPatch,
        cog: { phase: "engaged", state: "guide", reason: "next_needs_year", lane: "music", ts: nowMs() },
        requestId,
        meta: { ts: nowMs(), contract: "v1" }
      };
    }

    // If we can advance: rewrite into explicit prompt and continue down normal routing using that prompt.
    if (nx && nx.kind === "advance" && nx.prompt) {
      // rewrite text and also stamp continuity
      // eslint-disable-next-line no-unused-vars
      const rewritten = String(nx.prompt);

      // we DO NOT return early — we route through the music lane module to get real content
      // but we pin sessionPatch fields later so the mode/year stay consistent
      // Override safeText via shadow variables
      // (We keep original safeText in lastInText for telemetry; rewritten becomes routingText)
      var routingText = rewritten; // function-scoped var (works in older Node)
      var nextContext = nx;
    } else {
      // Not actionable; fallthrough
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
    const followUpsStrings = ["Pick a year", "Surprise me", "Story moment", "Just talk"];

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
    const followUpsStrings = ["Pick a year", "What’s playing now", "Show me the Roku path", "Just talk"];

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

    return {
      ...yp,
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
    const outSig = buildOutSig(intro.reply, intro.followUpsStrings);

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

      lastOut: { reply: intro.reply, followUps: intro.followUpsStrings },
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
      followUpsStrings: intro.followUpsStrings,
      followUps: chipsFromStrings(intro.followUpsStrings, 4),
      sessionPatch,
      cog: { phase: "engaged", state: "welcome", reason: "intro_v2", lane: "general", ts: nowMs() },
      requestId,
      meta: { ts: nowMs(), contract: "v1" }
    };
  }

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

  // Bridge layering (only when lane changes)
  if (needsBridge(sess, lane)) {
    reply = `${reply}\n\n${bridgeLine(sess)}`;
    followUpsStrings = dedupeStrings([...followUpsStrings, "Fast", "Deep"], 10).slice(0, 4);
  }

  // Advancement Engine v1 (before elasticity)
  {
    const adv = applyAdvancement({ inputText: routingText, reply, followUpsStrings, lane, sess });
    reply = adv.reply;
    followUpsStrings = adv.followUpsStrings;
  }

  // Ensure we ALWAYS have followups
  followUpsStrings = ensureFollowUpsNonEmpty(lane, year, followUpsStrings).slice(0, 4);

  // Telemetry
  const tele = bumpTelemetry(sess, lane, year, mode);
  const depthLevel = clampInt((Number(sess.depthLevel) || 0) + 1, 0, 20);

  // Name usage (sparse) — only after we know turns
  const namePre = maybePrependName(sess, tele.turns, reply);
  reply = namePre.reply;

  // Elasticity overlay
  const canElastic = shouldElasticOverlay({ ...sess, ...tele, introDone: true, depthLevel }, routingText);
  if (canElastic) {
    const elastic = elasticityOverlay({ ...sess, ...tele, depthLevel });
    const merged = [...safeArray(followUpsStrings), ...safeArray(elastic.followUpsStrings)];
    followUpsStrings = dedupeStrings(merged, 10).slice(0, 4);
    reply = `${reply}\n\n—\n\n${elastic.reply}`;
  } else {
    followUpsStrings = dedupeStrings(followUpsStrings, 10).slice(0, 4);
  }

  // Phase3 sprinkle
  const p3 = phase3Sprinkle({ ...sess, depthLevel });
  if (p3) reply = `${reply}\n\n${p3}`;

  // Dampener
  const damp = dampenIfDuplicateOutput(sess, reply, followUpsStrings);
  reply = damp.reply;
  const outSig = damp.sig;

  const outCache = { reply, followUps: safeArray(followUpsStrings).slice(0, 4) };

  // IMPORTANT: pin continuity for “next” behavior
  // - If we rewrote via nextContext, persist its year + mode + lane
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

  // Compose patch (merge lanePatch + name usage marker if used)
  const sessionPatch = filterSessionPatch({
    ...inPatch,
    ...tele,
    ...lanePatch,

    // pin current lane explicitly for server allowlist retention
    lane: pinnedLane,

    // continuity pins for NEXT
    lastMusicYear: lastMusicYear || undefined,
    activeMusicMode: activeMusicMode || undefined,

    // also keep generic lastYear/lastMode for non-music continuity
    lastYear: pinnedYear || tele.lastYear || undefined,
    lastMode: pinnedMode || tele.lastMode || undefined,

    depthLevel,
    elasticToggle: Number(sess.elasticToggle || 0) + 1,
    lastElasticAt: canElastic ? nowMs() : Number(sess.lastElasticAt || 0),
    recentIntent: pinnedLane,
    recentTopic: pinnedYear ? `year:${pinnedYear}` : (pinnedMode ? `mode:${pinnedMode}` : pinnedLane),

    depthPreference: sess.depthPreference || "fast",
    userGoal: sess.userGoal || "explore",

    lastNameUseTurn: namePre.used ? tele.turns : Number(sess.lastNameUseTurn || 0),

    lastOut: outCache,
    lastOutAt: nowMs(),
    lastOutSig: outSig,
    lastOutSigAt: nowMs()
  });

  const cog = {
    phase: "engaged",
    state: canElastic ? "reflect" : "respond",
    reason: nextContext ? "next_advance" : (canElastic ? "elastic_overlay" : "reply"),
    lane: pinnedLane,
    year: pinnedYear || undefined,
    mode: pinnedMode || undefined,
    ts: nowMs()
  };

  // Contract ctx/ui
  const ctx = {
    year: pinnedYear ? parseInt(pinnedYear, 10) : (sess.lastYear ? parseInt(sess.lastYear, 10) : null),
    mode: pinnedMode || (sess.lastMode || null)
  };

  const ui = { mode: "chat" };

  // If our followups include year picker, we can hint UI mode (widget can ignore)
  if (followUpsStrings.some(s => normalizeText(s) === "pick a year")) {
    // keep chat mode by default; widget switches ONLY on chip click (gesture)
    ui.mode = "chat";
  }

  return {
    ok: true,
    reply,
    lane: pinnedLane,
    ctx,
    ui,

    // preferred v1 chips
    followUps: chipsFromStrings(followUpsStrings, 4),

    // legacy
    followUpsStrings: followUpsStrings,

    sessionPatch,
    cog,
    requestId,
    meta: { ts: nowMs(), contract: "v1" }
  };
}

module.exports = chatEngine;
module.exports.chatEngine = chatEngine;
