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
 *  - chatEngine expects followUps as string[] (and will objectify if needed)
 *
 * v1.3 (BULLETPROOF+++):
 *  ✅ Mode taxonomy aligned to chatEngine: story_moment / micro_moment / number1 / top10 / top100
 *  ✅ No session mutation (pure: continuity is via sessionPatch only)
 *  ✅ Strong continuity: sets activeMusicMode + lastMusicYear + pendingMode/pendingYear + pendingLane
 *  ✅ Safer reply-driven mode inference (less false pinning)
 *  ✅ Stable, capped followUpsStrings (dedupe + length + count)
 *  ✅ Exports handleChat AND function export for simple require("./musicLane")
 */

let musicKnowledge = null;
try {
  musicKnowledge = require("./musicKnowledge");
  if (!musicKnowledge || typeof musicKnowledge.handleChat !== "function") musicKnowledge = null;
} catch (_) {
  musicKnowledge = null;
}

// ----------------------------
// Utilities
// ----------------------------
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
  // Only match plausible years; clampYear final-checks
  const m = String(text || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
  if (!m) return null;
  return clampYear(m[1]);
}

function normalizeModeFromText(text) {
  const t = norm(text);

  // explicit asks (canonical internal mode names)
  if (/\b(top\s*10|top10|top\s*ten)\b/.test(t)) return "top10";
  if (/\b(top\s*100|top100|hot\s*100|year[-\s]*end\s*hot\s*100)\b/.test(t)) return "top100";

  // IMPORTANT: use story_moment/micro_moment (matches chatEngine)
  if (/\bstory\s*moment\b/.test(t) || (/\bstory\b/.test(t) && /\bmoment\b/.test(t))) return "story_moment";
  if (/\bmicro\s*moment\b/.test(t) || (/\bmicro\b/.test(t) && /\bmoment\b/.test(t))) return "micro_moment";

  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return "number1";

  return null;
}

function inferModeFromReply(reply) {
  // Defensive inference only; keep conservative to avoid pinning wrong mode.
  const r = norm(reply);
  if (!r) return null;

  // Strong phrases only
  if (/\bstory moment\b/.test(r)) return "story_moment";
  if (/\bmicro moment\b/.test(r)) return "micro_moment";

  // Only infer top10/top100 when reply *looks like* a chart payload.
  // (Avoid false positives when copy casually mentions Hot 100.)
  if (/^\s*top\s*10\b/.test(r) || (r.includes("top 10") && r.includes("1.") && r.includes("2."))) return "top10";
  if (r.includes("year-end") && r.includes("hot 100")) return "top100";
  if (/^\s*top\s*100\b/.test(r)) return "top100";

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

    // cap chip text length
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

/**
 * Continuity rules:
 * - Never mutate `session`
 * - Always set canonical continuity keys via patch:
 *     activeMusicMode, lastMusicYear
 * - Also set pending* hints for downstream routing:
 *     pendingLane, pendingMode, pendingYear
 */
function ensureContinuity({ patch, userMode, replyMode, userYear, replyYear, priorSession }) {
  const s = priorSession && typeof priorSession === "object" ? priorSession : null;
  const base = patch && typeof patch === "object" ? { ...patch } : {};

  const mode = userMode || replyMode || base.mode || base.activeMusicMode || (s && s.activeMusicMode) || null;

  const y = clampYear(
    base.year ||
      base.lastMusicYear ||
      userYear ||
      replyYear ||
      (s && s.lastMusicYear) ||
      null
  );

  if (mode) {
    base.mode = base.mode || mode;
    base.activeMusicMode = base.activeMusicMode || mode;
    base.pendingMode = base.pendingMode || mode;
  }

  if (y) {
    base.year = base.year || y;
    base.lastMusicYear = base.lastMusicYear || y;
    base.pendingYear = base.pendingYear || y;
  }

  base.pendingLane = base.pendingLane || "music";
  return base;
}

async function handleChat({ text, session, visitorId, debug }) {
  try {
    const cleanText = String(text || "");
    const s = session && typeof session === "object" ? session : {};

    const userMode = normalizeModeFromText(cleanText);
    const userYear = extractYearFromText(cleanText);

    if (!musicKnowledge) {
      const fallback = "Music is warming up. Give me a year (1950–2024).";
      const followUpsStrings = safeStrings(["1956", "1988", "Top 10 1988"], 10);

      return {
        reply: fallback,
        followUpsStrings,
        followUps: chipsFromStrings(followUpsStrings),
        sessionPatch: ensureContinuity({
          patch: null,
          userMode,
          replyMode: null,
          userYear,
          replyYear: null,
          priorSession: s
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

    // Copy + normalize patch
    let sessionPatch = safeSessionPatch(raw && raw.sessionPatch);

    // Conservative inference
    const replyMode = inferModeFromReply(reply);
    const replyYear = null; // intentionally conservative

    sessionPatch = ensureContinuity({
      patch: sessionPatch,
      userMode,
      replyMode,
      userYear,
      replyYear,
      priorSession: s
    });

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
              appliedMode: sessionPatch && (sessionPatch.activeMusicMode || sessionPatch.mode)
                ? (sessionPatch.activeMusicMode || sessionPatch.mode)
                : null,
              appliedYear: sessionPatch && (sessionPatch.lastMusicYear || sessionPatch.year)
                ? (sessionPatch.lastMusicYear || sessionPatch.year)
                : null
            }
          }
        : null
    };
  } catch (e) {
    const fallback = "Music lane hit a snag. Give me a year (1950–2024) and try again.";
    const followUpsStrings = safeStrings(["1956", "1988", "Top 10 1988"], 10);

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
    followUps: res.followUpsStrings, // string[]
    sessionPatch: res.sessionPatch,
    meta: res.meta
  };
}

module.exports = musicLaneFn;
module.exports.musicLane = musicLaneFn;
module.exports.handleChat = handleChat;
