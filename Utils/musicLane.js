"use strict";

/**
 * Utils/musicLane.js
 *
 * Thin adapter over Utils/musicKnowledge.js.
 * Goals:
 *  - Deterministic
 *  - Never throws
 *  - Output normalized to:
 *      { reply, followUpsStrings: string[], followUps: [{label,send}], sessionPatch, meta? }
 *
 * IMPORTANT:
 *  - musicKnowledge returns followUps as string[]
 *  - chatEngine (v0.6k) expects followUps as string[] (and will objectify if needed)
 *
 * FIX (v1.2):
 *  ✅ Dual followUps output: strings + chip objects (compat with both engines/UIs)
 *  ✅ Always non-empty reply (defensive)
 *  ✅ Strong continuity: pins mode/year when implied or explicitly requested
 *  ✅ Exports handleChat AND function export for simple require("./musicLane")
 */

let musicKnowledge = null;
try {
  musicKnowledge = require("./musicKnowledge");
  if (!musicKnowledge || typeof musicKnowledge.handleChat !== "function") musicKnowledge = null;
} catch (_) {
  musicKnowledge = null;
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function clampYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n < 1950 || n > 2024) return null;
  return n;
}

function extractYearFromText(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  if (!m) return null;
  return clampYear(m[1]);
}

function normalizeModeFromText(text) {
  const t = norm(text);

  // explicit asks
  if (/\b(top\s*10|top10|top\s*ten)\b/.test(t)) return "top10";
  if (/\b(top\s*100|top100|hot\s*100|year[-\s]*end\s*hot\s*100)\b/.test(t)) return "top100";
  if (/\bstory\s*moment\b|\bstory\b/.test(t)) return "story";
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return "micro";
  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return "number1";

  return null;
}

function inferModeFromReply(reply) {
  const r = norm(reply);

  // reply-driven inference (defensive)
  if (!r) return null;

  if (r.startsWith("top 10") || /\btop\s*10\b/.test(r)) return "top10";
  if (r.includes("year-end hot 100") || r.includes("year end hot 100") || /\btop\s*100\b/.test(r) || r.includes("hot 100"))
    return "top100";
  if (r.includes("story moment")) return "story";
  if (r.includes("micro moment")) return "micro";

  // #1 detection in copy (rare)
  if (/\b#\s*1\b/.test(r) || r.includes("number 1") || r.includes("no. 1") || r.includes("no 1")) return "number1";

  return null;
}

function safeStrings(list, max = 10) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const x of list) {
    const s = String(x || "").replace(/\s+/g, " ").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s.slice(0, 80));
    if (out.length >= max) break;
  }
  return out;
}

function chipsFromStrings(list) {
  const strings = safeStrings(list, 10);
  const out = [];
  for (const s of strings) {
    out.push({
      label: s.length > 48 ? s.slice(0, 48) : s,
      send: s
    });
  }
  return out;
}

function safeSessionPatch(patch) {
  return patch && typeof patch === "object" ? { ...patch } : null;
}

function ensureContinuity({ session, patch, userMode, replyMode, userYear, replyYear }) {
  const s = session && typeof session === "object" ? session : null;
  let p = patch && typeof patch === "object" ? patch : null;

  const mode = userMode || replyMode || null;

  // Prefer explicit year in patch; otherwise infer from user text
  const y = clampYear(
    (p && (p.year || p.lastMusicYear)) ||
      userYear ||
      replyYear ||
      (s && s.lastMusicYear) ||
      null
  );

  if (mode) {
    if (s) s.activeMusicMode = mode;
    p = p || {};
    p.mode = p.mode || mode;
    p.activeMusicMode = p.activeMusicMode || mode;
    p.pendingMode = p.pendingMode || mode; // helps some engines route follow-ups
  }

  if (y) {
    if (s) s.lastMusicYear = y;
    p = p || {};
    p.year = p.year || y;
    p.lastMusicYear = p.lastMusicYear || y;
    p.pendingYear = p.pendingYear || y;
  }

  // Mark lane (safe hint)
  p = p || {};
  p.pendingLane = p.pendingLane || "music";

  return p;
}

async function handleChat({ text, session, visitorId, debug }) {
  try {
    const cleanText = String(text || "");
    const s = session || {};

    if (!musicKnowledge) {
      const fallback = "Music is warming up. Give me a year (1950–2024).";
      const followUpsStrings = safeStrings(["1956", "1988", "top 10 1988"]);
      return {
        reply: fallback,
        followUpsStrings,
        followUps: chipsFromStrings(followUpsStrings),
        sessionPatch: ensureContinuity({
          session: s,
          patch: null,
          userMode: normalizeModeFromText(cleanText),
          replyMode: null,
          userYear: extractYearFromText(cleanText),
          replyYear: null
        }),
        meta: debug ? { ok: false, reason: "musicKnowledge_missing" } : null
      };
    }

    const raw = await Promise.resolve(
      musicKnowledge.handleChat({
        text: cleanText,
        session: s,
        visitorId,
        debug: !!debug
      })
    );

    let reply = String(raw && raw.reply ? raw.reply : "").trim();
    if (!reply) reply = "Tell me a year (1950–2024), or say “top 10 1988”.";

    // musicKnowledge returns followUps: string[]
    const fuRaw = Array.isArray(raw && raw.followUps) ? raw.followUps : [];
    const followUpsStrings = safeStrings(fuRaw, 10);
    const followUps = chipsFromStrings(followUpsStrings);

    // Copy + normalize sessionPatch
    let sessionPatch = safeSessionPatch(raw && raw.sessionPatch);

    // Determine mode deterministically
    const userMode = normalizeModeFromText(cleanText);
    const replyMode = inferModeFromReply(reply);

    // Determine year deterministically
    const userYear = extractYearFromText(cleanText);
    const replyYear = null; // keep conservative; avoid parsing reply for year unless you want

    // Guarantee mode/year continuity so cog doesn't say "need:mode" after rendering Top 10
    sessionPatch = ensureContinuity({ session: s, patch: sessionPatch, userMode, replyMode, userYear, replyYear });

    return {
      reply,
      followUpsStrings,
      followUps,
      sessionPatch,
      meta: debug
        ? {
            ok: !!reply,
            source: "musicKnowledge",
            mkVersion:
              (musicKnowledge.MK_VERSION && typeof musicKnowledge.MK_VERSION === "function"
                ? musicKnowledge.MK_VERSION()
                : null),
            followUps: followUpsStrings.length,
            hasPatch: !!sessionPatch,
            inferred: {
              userMode: userMode || null,
              replyMode: replyMode || null,
              appliedMode: sessionPatch && (sessionPatch.mode || sessionPatch.activeMusicMode)
                ? (sessionPatch.mode || sessionPatch.activeMusicMode)
                : null,
              appliedYear: sessionPatch && (sessionPatch.year || sessionPatch.lastMusicYear)
                ? (sessionPatch.year || sessionPatch.lastMusicYear)
                : null
            }
          }
        : null
    };
  } catch (e) {
    const fallback = "Music lane hit a snag. Give me a year (1950–2024) and try again.";
    const followUpsStrings = safeStrings(["1956", "1988", "top 10 1988"]);
    return {
      reply: fallback,
      followUpsStrings,
      followUps: chipsFromStrings(followUpsStrings),
      sessionPatch: null,
      meta: debug ? { ok: false, reason: "exception", error: String(e && e.message ? e.message : e) } : null
    };
  }
}

/**
 * Function-style export for engines that do:
 *   const musicLane = require("./musicLane")
 * and call it like:
 *   await musicLane(text, session)
 */
async function musicLaneFn(text, session, opts) {
  const res = await handleChat({
    text,
    session,
    visitorId: opts && opts.visitorId ? opts.visitorId : undefined,
    debug: !!(opts && opts.debug)
  });

  // Primary compatibility: return string[] followUps for chatEngine
  return {
    reply: res.reply,
    followUps: res.followUpsStrings, // <-- string[]
    sessionPatch: res.sessionPatch,
    meta: res.meta
  };
}

module.exports = musicLaneFn;
module.exports.musicLane = musicLaneFn;
module.exports.handleChat = handleChat;
