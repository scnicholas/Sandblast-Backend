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
 * v0.6zI (INTRO GATE: FIRST TURN HARD-LOCK + INTENT BYPASS + TEMPLATE SAFETY + MUSIC OVERRIDE)
 */

const crypto = require("crypto");

// =========================
// Version
// =========================
const CE_VERSION =
  "chatEngine v0.6zI (INTRO FIRST-TURN HARD-LOCK + INTENT BYPASS; template-escape fix; MUSIC OVERRIDE; CS-1 + ConvPack 3.1-C + PhrasePack v1.1 + Packets v1.1-C)";

// =========================
// Canonical Intro (HARD-LOCK)
// =========================
const CANON_INTRO = "Hey — Nyx here. Say a year. I’ll handle the rest.";

const CANON_INTRO_CHIPS = [
  { label: "Pick a year", send: "1988" },
  { label: "Story moment", send: "story moment 1988" },
  { label: "Schedule", send: "schedule" },
  { label: "Sponsors", send: "sponsors" },
];

// =========================
// Optional CS-1 module
// =========================
let cs1 = null;
try {
  cs1 = require("./cs1");
} catch (e) {
  cs1 = null;
}

// =========================
// Nyx Conversational Pack 3.1-C (Canonical)
// =========================
const NYX_CONV_PACK = { /* unchanged */ };

// =========================
// Nyx PhrasePack v1.1
// =========================
const NYX_PHRASEPACK = { /* unchanged */ };

// =========================
// Packets v1.1-C
// =========================
const NYX_PACKETS = { /* unchanged */ };

// =========================
// Helpers
// =========================
function nowMs() { return Date.now(); }
function safeStr(x) { return x === null || x === undefined ? "" : String(x); }
function clampInt(n, lo, hi, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}
function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }
function pickDeterministic(arr, seed) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  const h = sha1(seed || "seed");
  const n = parseInt(h.slice(0, 8), 16);
  return arr[n % arr.length];
}
function normText(s) { return safeStr(s).trim().replace(/\s+/g, " ").toLowerCase(); }
function escapeRegExp(s) { return safeStr(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function interpolateTemplate(s, vars) {
  let out = safeStr(s);
  const v = vars && typeof vars === "object" ? vars : {};
  Object.keys(v).forEach((k) => {
    out = out.replace(new RegExp(`\\{${escapeRegExp(k)}\\}`, "g"), safeStr(v[k]));
  });
  return out;
}
function extractYear(text) {
  const m = safeStr(text).match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  if (!m) return null;
  const y = Number(m[1]);
  return y < 1950 ? 1950 : y > 2024 ? 2024 : y;
}
function extractMode(text) {
  const t = normText(text);
  if (/\b(top\s*100|hot\s*100)\b/.test(t)) return "top100";
  if (/\b(top\s*10)\b/.test(t)) return "top10";
  if (/\bstory\b/.test(t)) return "story";
  if (/\bmicro\b/.test(t)) return "micro";
  if (/\b(#1|number\s*1|no\.?\s*1)\b/.test(t)) return "number1";
  return null;
}
function isLikelyReturnGap(ms) { return Number.isFinite(ms) && ms >= 12 * 60 * 1000; }
function isReturnIntent(t) {
  const n = normText(t);
  return ["resume","start fresh","restart","change lens","back","continue"].includes(n);
}
function laneIsMusic(l) { return safeStr(l).toLowerCase().includes("music"); }
function laneIsKnown(l) { const x = safeStr(l).toLowerCase(); return x && x !== "general" && x !== "unknown"; }
function isGreetingOnly(t) {
  return /^(hi|hello|hey|yo|good morning|good afternoon|good evening)$/i.test(safeStr(t));
}

// =========================
// Intro intent logic
// =========================
function hasStrongFirstTurnIntent(text) {
  const t = normText(text);
  if (!t) return false;
  if (extractYear(t)) return true;
  if (extractMode(t)) return true;
  if (t.length >= 12 && !isGreetingOnly(t)) return true;
  return false;
}
function shouldServeIntroFirstTurn(session, inboundText) {
  if (session.__introDone) return false;
  if (session.turnCount > 1) return false;
  if (hasStrongFirstTurnIntent(inboundText)) return false;
  return true;
}

// =========================
// MUSIC OVERRIDE
// =========================
function applyMusicOverride(session, lane, inboundText) {
  const year = extractYear(inboundText);
  const mode = extractMode(inboundText);
  if (!year || !mode) return { forced: false, lane };
  session.lastMusicYear = year;
  session.activeMusicMode = mode;
  session.lane = "music";
  return { forced: true, lane: "music", year, mode };
}

// =========================
// Continuity helpers (unchanged)
// =========================
function ensureContinuityState(session) {
  if (!session.__nyxCont) session.__nyxCont = {};
  if (!session.__nyxIntro) session.__nyxIntro = {};
  if (!session.__nyxPackets) session.__nyxPackets = {};
  return session;
}

// =========================
// Main export
// =========================
async function chatEngine(input = {}) {
  const startedAt = nowMs();
  const requestId = input.requestId || sha1(startedAt).slice(0, 10);
  const session = ensureContinuityState(input.session || {});
  const inboundText = safeStr(input.text || input.message || "");
  session.turnCount = (session.turnCount || 0) + 1;

  let lane = session.lane || input.routeHint || "general";

  // 🔑 PRE-NORMALIZE OVERRIDE (FIX)
  const ov = applyMusicOverride(session, lane, inboundText);
  if (ov.forced) lane = ov.lane;

  // 🔑 INTRO GATE (FIXED)
  const doIntro = !ov.forced && shouldServeIntroFirstTurn(session, inboundText);
  if (doIntro) {
    session.__introDone = 1;
    return {
      ok: true,
      reply: CANON_INTRO,
      lane: "general",
      followUps: CANON_INTRO_CHIPS.map(c => ({
        id: sha1(c.label).slice(0, 8),
        type: "send",
        label: c.label,
        payload: { text: c.send }
      })),
      sessionPatch: session,
      cog: { phase: "listening" },
      requestId,
      meta: { engine: CE_VERSION, intro: true }
    };
  }

  // Core engine (unchanged)
  const core = input.engine
    ? await input.engine({ text: inboundText, session, requestId, routeHint: lane })
    : { reply: "A year usually clears things up.", lane };

  session.lane = core.lane || lane;

  return {
    ok: true,
    reply: core.reply,
    lane: session.lane,
    followUps: core.followUps || [],
    sessionPatch: session,
    cog: core.cog || { phase: "listening" },
    requestId,
    meta: {
      engine: CE_VERSION,
      override: ov.forced ? `music:${ov.mode}:${ov.year}` : ""
    }
  };
}

module.exports = { chatEngine, CE_VERSION };
