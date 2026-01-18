"use strict";

/**
 * Utils/chatEngine.js
 * Pure chat engine:
 *  - NO express
 *  - NO server start
 *  - NO index.js imports
 *  - returns { ok, reply, followUps, sessionPatch, cog, requestId }
 *
 * v0.6o (ADVANCEMENT ENGINE v1)
 * Adds:
 *  ✅ Advancement Engine v1:
 *      - Detects low-signal replies (“ok”, “continue”, “next”, etc.)
 *      - Ensures Nyx always advances the thread with ONE clean question + chips
 *      - Session-safe: writes lastOpenQuestion + lastFork
 *
 * Preserves:
 *  ✅ Intro V2
 *  ✅ Depth Dial ("Fast"/"Deep")
 *  ✅ Micro-bridge layering (Option D wording)
 *  ✅ Roku lane wiring (optional)
 *  ✅ Music lane shape compatibility + patch merge
 *  ✅ Input loop guard
 *  ✅ Content signature dampener
 *  ✅ SessionPatch allowlist
 *  ✅ Elasticity Engine
 *  ✅ Phase3 continuity overlay (consult-only)
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
  // chips: [{label,send}] -> use send if present else label
  const out = [];
  for (const c of safeArray(chips)) {
    if (!c) continue;
    const send = (c && typeof c === "object" && (c.send || c.label)) ? (c.send || c.label) : null;
    if (send) out.push(String(send));
  }
  return dedupeStrings(out, 10);
}

function normalizeFollowUpsFromLane(res) {
  // Goal: return followUps as string[]
  if (!res || typeof res !== "object") return [];

  // Most preferred: followUpsStrings (explicit)
  if (Array.isArray(res.followUpsStrings)) return dedupeStrings(res.followUpsStrings, 10);

  // Common: followUps: string[]
  if (Array.isArray(res.followUps) && (res.followUps.length === 0 || typeof res.followUps[0] === "string")) {
    return dedupeStrings(res.followUps, 10);
  }

  // Chip objects
  if (Array.isArray(res.followUps) && res.followUps.length > 0 && typeof res.followUps[0] === "object") {
    return chipsToStrings(res.followUps);
  }

  return [];
}

function endsWithQuestion(reply) {
  const r = String(reply || "").trim();
  if (!r) return false;
  if (/\?\s*$/.test(r)) return true;
  // common “soft question” patterns (no ? in copy sometimes)
  return /\b(do you|would you|should we|want to|which one|what do you|where do we|tell me)\b/i.test(r);
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

  // lane intent continuity (safe)
  "pendingLane", "pendingMode", "pendingYear",
  "recentIntent", "recentTopic",

  // music continuity (safe)
  "activeMusicMode", "lastMusicYear", "year", "mode",

  // conversational layering (safe)
  "depthPreference", "userName", "nameAskedAt", "lastOpenQuestion", "userGoal"
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
    if (lastOut && typeof lastOut.reply === "string") return true;
  }
  return false;
}

function cachedResponse(session, reason) {
  const lastOut = (session && session.lastOut) || {};
  return {
    ok: true,
    reply: lastOut.reply || "One sec — try again.",
    followUps: safeArray(lastOut.followUps).slice(0, 4),
    sessionPatch: filterSessionPatch({
      lastInAt: nowMs(),
      recentIntent: "loop_guard",
      recentTopic: reason || "repeat_input"
    }),
    cog: { phase: "engaged", state: "steady", reason: "input_loop_guard", lane: "general", ts: nowMs() },
    requestId: rid()
  };
}

// ----------------------------
// Content signature dampener
// ----------------------------
function buildOutSig(reply, followUps) {
  const chips = safeArray(followUps).slice(0, 4).join(" | ");
  return hashSig(`${String(reply || "")}__${chips}`);
}

function dampenIfDuplicateOutput(session, reply, followUps) {
  const sig = buildOutSig(reply, followUps);
  const lastSig = (session && session.lastOutSig) || "";
  const lastSigAt = Number(session && session.lastOutSigAt) || 0;

  if (sig && lastSig && sig === lastSig && (nowMs() - lastSigAt) < 12_000) {
    const tweak = "\n\n(If you want, tell me what you want next — I’m listening.)";
    return { reply: `${reply}${tweak}`, sig: buildOutSig(`${reply}${tweak}`, followUps) };
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

  const followUps = [
    "Pick a year",
    "Surprise me",
    "Story moment",
    "Just talk"
  ];

  return { reply, followUps };
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
    return "Perfect. I’ll give you the full story and keep the thread clean. Where do we start—music, TV, or just talking?";
  }
  return "Got it. I’ll keep it crisp. Point me at a year, a show, or your goal.";
}

// ----------------------------
// Micro-Bridge Layering (Option D wording)
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
// Advancement Engine v1
// ----------------------------
function isLowSignal(text) {
  const t = normalizeText(text);
  if (!t) return true;
  // very short acknowledgements / continuations
  return /^(ok|okay|k|kk|sure|yes|yep|yeah|fine|cool|nice|good|great|go on|continue|next|more|again|keep going|alright|all right|sounds good|do it)$/i.test(t);
}

function shouldAdvance({ sess, userText, reply, lane }) {
  // Don’t pile on if the assistant already asked something
  if (endsWithQuestion(reply)) return false;

  // Advance aggressively on low-signal user input
  if (isLowSignal(userText)) return true;

  // Otherwise: light advancement only in general lane to keep it moving
  if (lane === "general") return true;

  return false;
}

function advancePack({ sess, lane, year, mode }) {
  const pref = (sess && sess.depthPreference) || "fast";

  // Depth question (Option D language)
  const depthQ = (pref === "deep")
    ? "Do you want the short version… or the full story?"
    : "Do you want the headline… or the whole thread?";

  // Lane-specific single next question
  let q = "What do you want next?";
  let chips = ["Pick a year", "What’s playing now", "Show me the Roku path", "Just talk"];

  if (lane === "music") {
    const y = year && /^\d{4}$/.test(String(year)) ? String(year) : null;
    q = y
      ? `Want Top 10, a story moment, or a micro moment for ${y}?`
      : "Give me a year (1950–2024) — or tell me Top 10, story moment, or micro moment.";
    chips = y
      ? [`Top 10 ${y}`, `Story moment ${y}`, `Micro moment ${y}`, "Pick a different year"]
      : ["1956", "1988", "Top 10 1988", "Story moment 1955"];
  } else if (lane === "roku" || lane === "tv") {
    q = "Do you want Live Linear… or the VOD library?";
    chips = ["Live linear", "VOD", "What’s playing now", "Schedule"];
  } else if (lane === "schedule") {
    q = "What city should I translate the schedule for?";
    chips = ["Toronto", "London", "New York", "Use my timezone"];
  } else if (lane === "radio") {
    q = "Do you want to open the radio stream, or pick an era first?";
    chips = ["Open radio", "Pick a year", "What’s playing now", "Surprise me"];
  } else {
    // general
    q = "What do you feel like: a specific year, a surprise, or just talking?";
    chips = ["Pick a year", "Surprise me", "Story moment", "Just talk"];
  }

  const line = `${q}\n\n${depthQ}`;
  const lastOpenQuestion = q;

  return {
    line,
    chips: dedupeStrings([...chips, "Fast", "Deep"], 10).slice(0, 4),
    patch: {
      lastFork: "advance",
      lastOpenQuestion,
      recentTopic: `advance:${lane || "general"}`
    }
  };
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

  return { reply, followUps: chips.filter(Boolean).slice(0, 4) };
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
  if (/\b(top\s*10|top\s*100|#1|story\s*moment|micro\s*moment|\b19\d{2}\b|\b20\d{2}\b)\b/.test(t)) return "music";
  return "general";
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? m[1] : null;
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
  return null;
}

// ----------------------------
// Public API
// ----------------------------
async function chatEngine(inputText, session) {
  const requestId = rid();
  const text = String(inputText || "");
  const sess = session && typeof session === "object" ? session : {};

  // Depth dial intercept (deterministic, no lane needed)
  if (isDepthDial(text)) {
    const pref = normalizeText(text);
    const reply = depthDialReply(pref);
    const followUps = ["Pick a year", "What’s playing now", "Show me the Roku path", "Just talk"];

    const sessionPatch = filterSessionPatch({
      lastInText: text,
      lastInAt: nowMs(),
      depthPreference: pref,
      recentTopic: `depth:${pref}`
    });

    return {
      ok: true,
      reply,
      followUps,
      sessionPatch,
      cog: { phase: "engaged", state: "calibrate", reason: "depth_dial", lane: "general", ts: nowMs() },
      requestId
    };
  }

  if (shouldReturnCachedForRepeat(sess, text)) {
    return cachedResponse(sess, "repeat_input");
  }

  const inPatch = filterSessionPatch({
    lastInText: text,
    lastInAt: nowMs()
  });

  // Intro V2
  if (shouldRunIntro(sess, text)) {
    const intro = nyxIntroReply();
    const outSig = buildOutSig(intro.reply, intro.followUps);

    const sessionPatch = filterSessionPatch({
      ...inPatch,
      introDone: true,
      introAt: nowMs(),
      startedAt: Number(sess.startedAt) || nowMs(),
      turns: Number(sess.turns) || 0,
      lastFork: "intro",
      depthLevel: Number(sess.depthLevel || 0),

      // layering seeds
      userGoal: "explore",
      depthPreference: sess.depthPreference || "fast",
      lastOpenQuestion: "What do you feel like right now: a specific year, a surprise, or just talking?",
      nameAskedAt: nowMs(),

      lastOut: { reply: intro.reply, followUps: intro.followUps },
      lastOutAt: nowMs(),
      lastOutSig: outSig,
      lastOutSigAt: nowMs()
    });

    return {
      ok: true,
      reply: intro.reply,
      followUps: intro.followUps,
      sessionPatch,
      cog: { phase: "engaged", state: "welcome", reason: "intro_v2", lane: "general", ts: nowMs() },
      requestId
    };
  }

  const lane = detectLane(text);
  const year = extractYear(text);
  const mode = detectMode(text);

  let reply = "";
  let followUps = [];
  let lanePatch = null;
  let advPatch = null;

  if (lane === "music" && musicLane) {
    try {
      const res = await musicLane(text, sess);

      reply = (res && res.reply) ? String(res.reply).trim() : "";
      if (!reply) reply = "Tell me a year (1950–2024), or say “top 10 1988”.";

      followUps = normalizeFollowUpsFromLane(res);
      lanePatch = filterSessionPatch(res && res.sessionPatch ? res.sessionPatch : null);
    } catch (_) {
      reply = "Music lane hiccup. Give me a year (1950–2024) and I’ll pull it up.";
      followUps = ["Top 10 1988", "Pick a year", "Story moment 1955", "Micro moment 1979"];
      lanePatch = null;
    }
  } else if (lane === "roku" && rokuLane) {
    try {
      const r = await rokuLane({ text, session: sess });
      reply = (r && r.reply) ? String(r.reply).trim() : "Roku mode — live linear or VOD?";
      followUps = normalizeFollowUpsFromLane(r);
      lanePatch = filterSessionPatch(r && r.sessionPatch ? r.sessionPatch : null);
    } catch (_) {
      reply = "Roku routing is warming up. Do you want **Live linear** or **VOD**?";
      followUps = ["Live linear", "VOD", "Open TV hub", "What’s playing now"];
      lanePatch = null;
    }
  } else if (lane === "radio") {
    reply = "Want to jump into the radio stream now, or should I guide you to a specific era first?";
    followUps = ["Open radio", "Pick a year", "What’s playing now", "Just talk"];
  } else if (lane === "tv") {
    reply = "Sandblast TV is coming in two flavors: **Live linear** and **VOD**. Which experience do you want?";
    followUps = ["Live linear", "VOD", "Show me the Roku path", "What’s playing now"];
  } else if (lane === "schedule") {
    reply = "Schedule mode — tell me your city (or timezone) and I’ll translate the programming to your local time.";
    followUps = ["Toronto", "London", "What’s playing now", "Show me the Roku path"];
  } else {
    reply = "I’m with you. Tell me what you want: music, Roku/TV, schedule, or just a conversation.";
    followUps = ["Pick a year", "Show me the Roku path", "What’s playing now", "Just talk"];
  }

  // Micro-bridge layering (only when lane changes)
  if (needsBridge(sess, lane)) {
    reply = `${reply}\n\n${bridgeLine(sess)}`;
    followUps = dedupeStrings([...followUps, "Fast", "Deep"], 10).slice(0, 4);
  }

  // Advancement Engine v1 (keeps sessions alive; one clean nudge)
  // NOTE: We run this BEFORE elasticity overlay to avoid stacking multiple “meta” prompts.
  if (shouldAdvance({ sess, userText: text, reply, lane })) {
    const pack = advancePack({ sess, lane, year, mode });
    reply = `${reply}\n\n${pack.line}`;
    followUps = dedupeStrings([...followUps, ...pack.chips], 10).slice(0, 4);
    advPatch = filterSessionPatch(pack.patch);
  }

  // Telemetry
  const tele = bumpTelemetry(sess, lane, year, mode);

  // DepthLevel
  const depthLevel = clampInt((Number(sess.depthLevel) || 0) + 1, 0, 20);

  // Elasticity overlay (sprinkle-safe)
  const canElastic = shouldElasticOverlay({ ...sess, ...tele, introDone: true, depthLevel }, text);
  if (canElastic) {
    const elastic = elasticityOverlay({ ...sess, ...tele, depthLevel });
    const merged = [...safeArray(followUps), ...safeArray(elastic.followUps)];
    followUps = dedupeStrings(merged, 10).slice(0, 4);
    reply = `${reply}\n\n—\n\n${elastic.reply}`;
  } else {
    followUps = dedupeStrings(followUps, 10).slice(0, 4);
  }

  // Phase3 sprinkle
  const p3 = phase3Sprinkle({ ...sess, depthLevel });
  if (p3) reply = `${reply}\n\n${p3}`;

  // Dampener
  const damp = dampenIfDuplicateOutput(sess, reply, followUps);
  reply = damp.reply;
  const outSig = damp.sig;

  const outCache = { reply, followUps: safeArray(followUps).slice(0, 4) };

  // Compose patch (merge lanePatch + advPatch)
  const sessionPatch = filterSessionPatch({
    ...inPatch,
    ...tele,
    ...lanePatch,
    ...advPatch,
    depthLevel,
    elasticToggle: Number(sess.elasticToggle || 0) + 1,
    lastElasticAt: canElastic ? nowMs() : Number(sess.lastElasticAt || 0),
    recentIntent: lane,
    recentTopic: year ? `year:${year}` : (mode ? `mode:${mode}` : lane),

    // keep thread alive
    depthPreference: sess.depthPreference || "fast",
    userGoal: sess.userGoal || "explore",

    lastOut: outCache,
    lastOutAt: nowMs(),
    lastOutSig: outSig,
    lastOutSigAt: nowMs()
  });

  const cog = {
    phase: "engaged",
    state: canElastic ? "reflect" : (advPatch ? "advance" : "respond"),
    reason: canElastic ? "elastic_overlay" : (advPatch ? "advance_v1" : "reply"),
    lane,
    year: year || undefined,
    mode: mode || undefined,
    ts: nowMs()
  };

  return { ok: true, reply, followUps: outCache.followUps, sessionPatch, cog, requestId };
}

module.exports = chatEngine;
module.exports.chatEngine = chatEngine;
