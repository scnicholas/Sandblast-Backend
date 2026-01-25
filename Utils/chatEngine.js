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
 * v0.6zK
 * (INTRO REARM (login-moment) + IGNORE EMPTY TURN (prevents phantom first-turn) +
 *  INTENT BYPASS +
 *  TEMPLATE SAFETY (regex-escape) +
 *  MUSIC OVERRIDE (year+mode forces music) +
 *  CS-1 SOFT WIRING (if present) +
 *  SAFE PACK LOADING (won’t brick if optional packs missing) +
 *  SESSIONPATCH MINIMIZER (avoid bloating sessions) +
 *  NONEMPTY REPLY GUARANTEE)
 */

const crypto = require("crypto");

// =========================
// Version
// =========================
const CE_VERSION =
  "chatEngine v0.6zK (INTRO REARM + IGNORE EMPTY TURN; intent bypass; template-safety; MUSIC OVERRIDE; CS-1 soft; safe pack loading; sessionPatch minimized)";

// =========================
// Intro (varied per login-moment)
// =========================
const INTRO_REARM_MS = 12 * 60 * 1000; // treat idle gap >= 12m as "new login"
const INTRO_VARIANTS = [
  "Hey — Nyx here.\n\nGive me a year (1950–2024) and I’ll handle the rest.\nExamples: “top 10 1988”, “#1 1964”, “story moment 1977”, “micro moment 1999”.",
  "Nyx, at your service.\n\nDrop a year (1950–2024) and I’ll pull the memory thread.\nTry: “top 10 1988” or “story moment 1977”.",
  "Welcome in.\n\nYear first (1950–2024), then we go deep.\nExamples: “#1 1964”, “micro moment 1999”, “top 10 1988”.",
  "Nyx here.\n\nSay a year (1950–2024) and I’ll turn it into a moment.\nTry: “story moment 1977” or “top 10 1988”.",
  "Alright — Nyx online.\n\nGive me a year (1950–2024). If you want structure: “top 10 1988”, “#1 1964”, “micro moment 1999”.",
];

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
// IMPORTANT: If your existing file has inline packs, you can replace these
// requires with your inline objects—this wrapper will still work.
// =========================
let NYX_CONV_PACK = null;
let NYX_PHRASEPACK = null;
let NYX_PACKETS = null;

function safeRequire(path) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path);
  } catch (_) {
    return null;
  }
}

NYX_CONV_PACK =
  safeRequire("./nyxConversationalPack") ||
  safeRequire("./nyxConvPack") ||
  safeRequire("./nyx_conv_pack") ||
  null;

NYX_PHRASEPACK =
  safeRequire("./nyxPhrasePack") ||
  safeRequire("./phrasePack") ||
  safeRequire("./nyx_phrase_pack") ||
  null;

NYX_PACKETS =
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
function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}
function normText(s) {
  return safeStr(s).trim().replace(/\s+/g, " ").toLowerCase();
}
function escapeRegExp(s) {
  return safeStr(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function interpolateTemplate(s, vars) {
  let out = safeStr(s);
  const v = vars && typeof vars === "object" ? vars : {};
  for (const k of Object.keys(v)) {
    const key = escapeRegExp(k);
    out = out.replace(new RegExp(`\\{${key}\\}`, "g"), safeStr(v[k]));
  }
  return out;
}
function nonEmptyReply(s, fallback) {
  const a = safeStr(s).trim();
  if (a) return a;
  const b = safeStr(fallback).trim();
  return b || "Okay — tell me what you want next.";
}
function pickDeterministic(arr, seed) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  const h = sha1(seed || "seed");
  const n = parseInt(h.slice(0, 8), 16);
  return arr[n % arr.length];
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
function extractMode(text) {
  const t = normText(text);
  if (/\b(top\s*100|top100|hot\s*100|year[-\s]*end\s*hot\s*100)\b/.test(t)) return "top100";
  if (/\b(top\s*10|top10|top\s*ten)\b/.test(t)) return "top10";
  if (/\bstory\s*moment\b|\bstory\b/.test(t)) return "story";
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return "micro";
  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return "number1";
  return null;
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
// Intent bypass (avoid intro stealing real tasks)
// =========================
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

// =========================
// Login-moment intro rearm
// Purpose:
//  - Show intro again after an idle gap (>= INTRO_REARM_MS)
//  - Prevent empty/phantom client boot messages from consuming "turn 1"
// =========================
function isLoginMoment(session, startedAt) {
  const last = Number(session.lastTurnAt || session.lastInAt || 0);
  const gap = last ? startedAt - last : Infinity;
  if (gap >= INTRO_REARM_MS) return true;
  if (!session.__hasRealUserTurn) return true;
  return false;
}

function shouldServeIntroLoginMoment(session, inboundText, startedAt) {
  if (!session) return false;
  if (isEmptyOrNoText(inboundText)) return false;

  // If user came in with a strong intent (year/mode/lane keywords), do not intro.
  // Exception: pure greeting -> yes, intro (that’s a login vibe).
  const strong = hasStrongFirstTurnIntent(inboundText);
  if (strong && !isGreetingOnly(inboundText)) return false;

  // Only on login moments (fresh session or idle gap)
  if (!isLoginMoment(session, startedAt)) return false;

  // Prevent repeated intro spam inside same login window
  const introAt = Number(session.introAt || 0);
  if (introAt && startedAt - introAt < INTRO_REARM_MS / 2) return false;

  return true;
}

// =========================
// MUSIC OVERRIDE (year + mode forces lane=music)
// =========================
function applyMusicOverride(session, inboundText) {
  const year = extractYear(inboundText);
  const mode = extractMode(inboundText);
  if (!year || !mode) return { forced: false };

  session.lastMusicYear = year;
  session.lastYear = year;
  session.lastMode = mode;
  session.activeMusicMode = mode;
  session.lane = "music";

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
// SessionPatch minimizer
// Keep only keys index.js allowlists + continuity keys.
// =========================
const PATCH_KEYS = new Set([
  "introDone",
  "introAt",
  "lastInText",
  "lastInAt",
  "lastOut",
  "lastOutAt",
  "turns",
  "startedAt",
  "lastTurnAt",
  "lanesVisited",
  "yearsVisited",
  "modesVisited",
  "lastLane",
  "lastYear",
  "lastMode",
  "lastFork",
  "depthLevel",
  "elasticToggle",
  "lastElasticAt",
  "lane",
  "pendingLane",
  "pendingMode",
  "pendingYear",
  "recentIntent",
  "recentTopic",
  "activeMusicMode",
  "lastMusicYear",
  "year",
  "mode",
  "depthPreference",
  "userName",
  "nameAskedAt",
  "lastOpenQuestion",
  "userGoal",
  "lastNameUseTurn",
  "visitorId",
  "voiceMode",
  "__cs1",
  "cog",
  "__introDone",
  "turnCount",
  "__hasRealUserTurn",
]);

function buildSessionPatch(session) {
  const s = session && typeof session === "object" ? session : {};
  const out = {};
  for (const k of Object.keys(s)) {
    if (!PATCH_KEYS.has(k)) continue;
    out[k] = s[k];
  }
  if (out.__introDone && !out.introDone) out.introDone = true;
  return out;
}

// =========================
// FollowUp helpers
// =========================
function toFollowUps(chips) {
  const arr = Array.isArray(chips) ? chips : [];
  return arr.map((c) => {
    const label = safeStr(c && c.label).trim() || "Send";
    const send = safeStr(c && c.send).trim();
    return {
      id: sha1(label + "::" + send).slice(0, 8),
      type: "send",
      label,
      payload: { text: send },
    };
  });
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
  }
  return out.length ? out : undefined;
}

// =========================
// CS-1 hooks (soft)
// =========================
function cs1Init(session) {
  try {
    if (!cs1) return;
    if (typeof cs1.ensure === "function") cs1.ensure(session);
    if (typeof cs1.init === "function") cs1.init(session);
  } catch (_) {}
}
function cs1MarkSpeak(session, tag) {
  try {
    if (!cs1) return;
    if (typeof cs1.markSpeak === "function") cs1.markSpeak(session, tag);
    else if (typeof cs1.mark === "function") cs1.mark(session, { type: "speak", tag });
  } catch (_) {}
}
function cs1SelectContinuity(session, inboundText) {
  try {
    if (!cs1) return null;
    if (typeof cs1.select === "function") return cs1.select({ session, text: inboundText });
    if (typeof cs1.pick === "function") return cs1.pick({ session, text: inboundText });
    return null;
  } catch (_) {
    return null;
  }
}

// =========================
// Default core fallback
// =========================
function fallbackCore({ text, session }) {
  const t = normText(text);
  const y = extractYear(t);
  const m = extractMode(t);

  if (y && m) {
    return {
      reply: `Got it — ${y}. Want Top 10, #1, a story moment, or a micro moment?`,
      lane: "music",
      cog: {
        phase: "engaged",
        state: "confident",
        reason: "music_override",
        lane: "music",
        year: String(y),
        mode: m,
      },
    };
  }

  if (y) {
    session.lastMusicYear = y;
    session.lastYear = y;
    session.lane = "music";
    return {
      reply: `Got it — ${y}. Want Top 10, #1, a story moment, or a micro moment?`,
      lane: "music",
      cog: { phase: "listening", state: "confident", reason: "year_only", lane: "music", year: String(y) },
      followUps: toFollowUps([
        { label: "Top 10", send: `top 10 ${y}` },
        { label: "#1", send: `#1 ${y}` },
        { label: "Story moment", send: `story moment ${y}` },
        { label: "Micro moment", send: `micro moment ${y}` },
      ]),
    };
  }

  if (!t || isGreetingOnly(text)) {
    return { reply: INTRO_VARIANTS[0], lane: "general", followUps: toFollowUps(CANON_INTRO_CHIPS) };
  }

  return {
    reply:
      "Tell me a year (1950–2024), or say “top 10 1988”, “#1 1988”, “story moment 1988”, or “micro moment 1988”.",
    lane: session.lane || "general",
  };
}

// =========================
// Main handler
// =========================
async function handleChat(input = {}) {
  const startedAt = nowMs();
  const requestId = safeStr(input.requestId).trim() || sha1(startedAt).slice(0, 10);

  const session = ensureContinuityState(input.session || {});
  cs1Init(session);

  const inboundText = safeStr(input.text || input.message || "").trim();
  const inboundIsEmpty = isEmptyOrNoText(inboundText);

  // Telemetry counters always increment (fine), but we track "real user turns" separately
  session.turnCount = Number(session.turnCount || 0) + 1;
  session.turns = Number(session.turns || 0) + 1;
  if (!session.startedAt) session.startedAt = startedAt;

  // IMPORTANT: do NOT let empty/phantom boot payloads consume the "login moment"
  if (!inboundIsEmpty) session.__hasRealUserTurn = 1;

  session.lastTurnAt = startedAt;
  session.lastInText = inboundText;
  session.lastInAt = startedAt;

  // Lane seed (routeHint can be used as a hint; do NOT force unless override triggers)
  let lane = safeStr(session.lane || input.routeHint || "general").trim() || "general";

  // MUSIC OVERRIDE (pre-normalize)
  const ov = applyMusicOverride(session, inboundText);
  if (ov.forced) lane = ov.lane;

  // INTRO (login-moment rearm; bypass for strong intent except pure greeting)
  const doIntro = !ov.forced && shouldServeIntroLoginMoment(session, inboundText, startedAt);
  if (doIntro) {
    session.__introDone = 1;
    session.introDone = true;
    session.introAt = startedAt;
    session.lane = "general";

    cs1MarkSpeak(session, "intro");

    // Stable-per-login variant selection (no jitter)
    const bucket = Math.floor(startedAt / INTRO_REARM_MS);
    const seed = `${safeStr(session.sessionId || "")}|${bucket}|intro`;
    const introLine = pickDeterministic(INTRO_VARIANTS, seed) || INTRO_VARIANTS[0];

    const followUps = toFollowUps(CANON_INTRO_CHIPS);

    return {
      ok: true,
      reply: introLine,
      lane: "general",
      followUps,
      followUpsStrings: toFollowUpsStrings(CANON_INTRO_CHIPS),
      sessionPatch: buildSessionPatch(session),
      cog: { phase: "listening", state: "confident", reason: "intro_login_moment", lane: "general", ts: Date.now() },
      requestId,
      meta: { engine: CE_VERSION, intro: true, loginMoment: true },
    };
  }

  // Optional continuity selector (soft)
  const continuity = cs1SelectContinuity(session, inboundText);
  if (continuity && typeof continuity === "object") {
    session.__cs1 = continuity.__cs1 || continuity.state || session.__cs1;
  }

  // Core engine: if caller supplies engine, use it; else fallbackCore
  let core = null;
  try {
    if (typeof input.engine === "function") {
      core = await Promise.resolve(
        input.engine({
          text: inboundText,
          session,
          requestId,
          routeHint: lane,
          packs: { conv: NYX_CONV_PACK, phrase: NYX_PHRASEPACK, packets: NYX_PACKETS },
          interpolateTemplate,
          pickDeterministic,
        })
      );
    } else {
      core = fallbackCore({ text: inboundText, session });
    }
  } catch (e) {
    const msg = e && e.message ? e.message : String(e || "");
    core = {
      reply: "I hit a snag, but I’m still here. Tell me a year (1950–2024), or say “top 10 1988”.",
      lane: session.lane || lane || "general",
      cog: { phase: "engaged", state: "error", reason: "engine_error", detail: msg.slice(0, 140) },
    };
  }

  // Normalize lane
  const outLane = safeStr((core && core.lane) || session.lane || lane || "general").trim() || "general";
  session.lane = outLane;

  if (ov.forced) session.lane = "music";

  // Guarantee reply
  const reply = nonEmptyReply(core && core.reply, "A year usually clears things up.");

  // followUps
  const followUps = Array.isArray(core && core.followUps) ? core.followUps : [];
  const followUpsStrings =
    Array.isArray(core && core.followUpsStrings) && core.followUpsStrings.length ? core.followUpsStrings : undefined;

  // sessionPatch merge (minimized)
  if (core && core.sessionPatch && typeof core.sessionPatch === "object") {
    for (const [k, v] of Object.entries(core.sessionPatch)) {
      if (!PATCH_KEYS.has(k)) continue;
      session[k] = v;
    }
  }

  session.lastOut = reply;
  session.lastOutAt = startedAt;

  const cog =
    (core && core.cog && typeof core.cog === "object" ? core.cog : null) || {
      phase: "listening",
      state: "confident",
      reason: ov.forced ? "music_override" : "ok",
      lane: session.lane,
    };

  if (ov.forced) cs1MarkSpeak(session, "music_override");

  return {
    ok: true,
    reply,
    lane: session.lane,
    directives: Array.isArray(core && core.directives) ? core.directives : undefined,
    followUps,
    followUpsStrings,
    sessionPatch: buildSessionPatch(session),
    cog,
    requestId,
    meta: {
      engine: CE_VERSION,
      override: ov.forced ? `music:${ov.mode}:${ov.year}` : "",
      packsLoaded: {
        conv: !!NYX_CONV_PACK,
        phrase: !!NYX_PHRASEPACK,
        packets: !!NYX_PACKETS,
        cs1: !!cs1,
      },
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
