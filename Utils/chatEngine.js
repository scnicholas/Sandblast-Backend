"use strict";

/**
 * Utils/chatEngine.js
 * Pure chat engine:
 *  - NO express
 *  - NO server start
 *  - NO index.js imports
 *  - returns { ok, reply, followUps, sessionPatch, cog, requestId }
 *
 * v0.6k (INTRO + ELASTICITY + BULLETPROOF HARDENING)
 * Adds:
 *  ✅ Nyx Intro Script V1 (first-contact, welcoming, waits)
 *  ✅ Conversational Elasticity Engine (reflection + pivot forks; dampened)
 *
 * Preserves:
 *  ✅ Music lane bridge via Utils/musicLane.js (real content)
 *  ✅ Input loop guard (identical inbound in window -> cached output)
 *  ✅ Content signature dampener (reply+chips hash)
 *  ✅ SessionPatch allowlist (no poison keys)
 *  ✅ Phase3 continuity overlay (consult-only, sprinkle-safe)
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
} catch (_) { /* optional */ }

// ----------------------------
// Utilities
// ----------------------------
function nowMs() { return Date.now(); }

function rid() {
  // short request id
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
  "recentIntent", "recentTopic"
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
  const withinMs = 6_000; // 6s window catches tight auto-send loops

  if (lastT && t === lastT && (nowMs() - lastAt) <= withinMs) {
    // only if we have a cached output
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
      lastInAt: nowMs(), // update timestamp but keep stable
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

  // If identical payload repeats in a short window, add a micro-variation line
  if (sig && lastSig && sig === lastSig && (nowMs() - lastSigAt) < 12_000) {
    const tweak = "\n\n(If you want, tell me what you want next — I’m listening.)";
    return { reply: `${reply}${tweak}`, sig: buildOutSig(`${reply}${tweak}`, followUps) };
  }
  return { reply, sig };
}

// ----------------------------
// Nyx Intro V1
// ----------------------------
function isDirectIntent(userText) {
  const t = normalizeText(userText);
  return /\b(top\s*10|top\s*100|#1|story\s*moment|micro\s*moment|schedule|what'?s\s*playing|playing\s*now|vod|roku|radio|tv|open|watch|play)\b/.test(t);
}

function shouldRunIntro(session, userText) {
  // never block direct asks
  if (isDirectIntent(userText)) return false;
  if (session && session.introDone) return false;

  // run on first meaningful message, including "hi"
  return true;
}

function nyxIntroReply() {
  const reply =
`Hi, I’m Nyx. I’m here with you.

I’m your guide through music, film, and culture — live radio, television, and story moments that still matter.

You can explore for a moment… or stay with me and go deeper.

Where do you want to begin?`;

  const followUps = [
    "Start with music",
    "What’s playing now",
    "Show me the Roku path",
    "Just talk"
  ];

  return { reply, followUps };
}

// ----------------------------
// Elasticity Engine (reflection + pivot forks)
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

  // dampener: fire every other checkpoint
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
  // very light, only when depthLevel grows
  const depth = Number(session && session.depthLevel) || 0;
  if (depth < 3) return null;

  // consult-only, non-factual, safe
  const lines = [
    "If you want, we can tighten this into a clean path: ask → answer → deepen → pivot.",
    "I can also keep a running thread so we don’t lose the plot as we explore.",
    "We can make this feel like a guided journey instead of a Q&A."
  ];

  const idx = clampInt(depth, 0, lines.length - 1);
  return lines[idx] || null;
}

// ----------------------------
// Core routing (minimal, safe defaults)
// ----------------------------
function detectLane(text) {
  const t = normalizeText(text);

  if (/\b(schedule|what'?s\s*playing|playing\s*now)\b/.test(t)) return "schedule";
  if (/\b(vod|roku|tv)\b/.test(t)) return "tv";
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
  return null;
}

// ----------------------------
// Public API
// ----------------------------
async function chatEngine(inputText, session) {
  const requestId = rid();
  const text = String(inputText || "");
  const sess = session && typeof session === "object" ? session : {};

  // Input loop guard
  if (shouldReturnCachedForRepeat(sess, text)) {
    return cachedResponse(sess, "repeat_input");
  }

  // Track inbound (for loop guard)
  const inPatch = filterSessionPatch({
    lastInText: text,
    lastInAt: nowMs()
  });

  // Intro V1 (first contact)
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
      cog: { phase: "engaged", state: "welcome", reason: "intro_v1", lane: "general", ts: nowMs() },
      requestId
    };
  }

  // Lane / mode / year
  const lane = detectLane(text);
  const year = extractYear(text);
  const mode = detectMode(text);

  let reply = "";
  let followUps = [];

  // Minimal lane behaviors (you can expand)
  if (lane === "music" && musicLane) {
    try {
      const res = await musicLane(text, sess);
      reply = (res && res.reply) || "Tell me a year (1950–2024), or say “top 10 1988”.";
      followUps = safeArray(res && res.followUps);
    } catch (e) {
      reply = "Music lane hiccup. Give me a year (1950–2024) and I’ll pull it up.";
      followUps = ["Top 10 1988", "Pick a year", "Story moment 1955", "Micro moment 1979"];
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
    // general
    reply = "I’m with you. Tell me what you want: music, TV/Roku, schedule, or just a conversation.";
    followUps = ["Start with music", "Show me the Roku path", "What’s playing now", "Just talk"];
  }

  // Update telemetry (turns, visited lanes/years/modes)
  const tele = bumpTelemetry(sess, lane, year, mode);

  // DepthLevel (simple, deterministic)
  const depthLevel = clampInt((Number(sess.depthLevel) || 0) + 1, 0, 20);

  // Elasticity overlay (sprinkle)
  const canElastic = shouldElasticOverlay({ ...sess, ...tele, introDone: true, depthLevel }, text);
  if (canElastic) {
    const elastic = elasticityOverlay({ ...sess, ...tele, depthLevel });
    const merged = [...safeArray(followUps), ...safeArray(elastic.followUps)];
    const seen = new Set();
    followUps = merged.filter((x) => {
      const k = normalizeText(x);
      if (!k) return false;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 4);

    reply = `${reply}\n\n—\n\n${elastic.reply}`;
  }

  // Phase3 continuity sprinkle (consult-only)
  const p3 = phase3Sprinkle({ ...sess, depthLevel });
  if (p3) reply = `${reply}\n\n${p3}`;

  // Content signature dampener
  const damp = dampenIfDuplicateOutput(sess, reply, followUps);
  reply = damp.reply;
  const outSig = damp.sig;

  // Cache last output (for loop guard)
  const outCache = { reply, followUps: safeArray(followUps).slice(0, 4) };

  // Compose sessionPatch (allowlisted)
  const sessionPatch = filterSessionPatch({
    ...inPatch,
    ...tele,
    depthLevel,
    elasticToggle: Number(sess.elasticToggle || 0) + 1,
    lastElasticAt: canElastic ? nowMs() : Number(sess.lastElasticAt || 0),
    recentIntent: lane,
    recentTopic: year ? `year:${year}` : (mode ? `mode:${mode}` : lane),

    lastOut: outCache,
    lastOutAt: nowMs(),
    lastOutSig: outSig,
    lastOutSigAt: nowMs()
  });

  // cog object (minimal, stable)
  const cog = {
    phase: "engaged",
    state: canElastic ? "reflect" : "respond",
    reason: canElastic ? "elastic_overlay" : "reply",
    lane,
    year: year || undefined,
    mode: mode || undefined,
    ts: nowMs()
  };

  return { ok: true, reply, followUps: outCache.followUps, sessionPatch, cog, requestId };
}

module.exports = chatEngine;
module.exports.chatEngine = chatEngine;
