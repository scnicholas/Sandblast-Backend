"use strict";

/**
 * Utils/musicLane.js
 *
 * Thin adapter over Utils/musicKnowledge.js.
 * Goals:
 *  - Deterministic
 *  - Never throws
 *  - Output normalized to:
 *      { reply, followUps:[{label,send}], sessionPatch, meta? }
 *
 * IMPORTANT:
 *  - musicKnowledge returns followUps as string[]
 *  - chatEngine wants followUps as chip objects
 *
 * FIX (v1.1):
 *  ✅ Guarantee session.activeMusicMode is set when output implies a mode
 *     (prevents "need:mode" cog bug when Top 10 already rendered)
 *  ✅ If user explicitly asked a mode, pin it in sessionPatch
 *  ✅ If reply clearly indicates Top 10 / Top 100 / Story / Micro / #1, infer mode defensively
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
  if (r.startsWith("top 10") || /\btop\s*10\b/.test(r)) return "top10";
  if (r.includes("year-end hot 100") || r.includes("year end hot 100") || /\btop\s*100\b/.test(r) || r.includes("hot 100"))
    return "top100";
  if (r.includes("story moment")) return "story";
  if (r.includes("micro moment")) return "micro";

  // #1 detection in copy (rare; usually explicit)
  if (/\b#\s*1\b/.test(r) || r.includes("number 1") || r.includes("no. 1") || r.includes("no 1")) return "number1";

  return null;
}

function safeChipsFromStrings(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const x of list) {
    const s = String(x || "").replace(/\s+/g, " ").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);

    // Keep it short and stable for UI
    const send = s.slice(0, 80);
    const label = s.length > 48 ? s.slice(0, 48) : s;

    out.push({ label, send });
    if (out.length >= 10) break;
  }
  return out;
}

function safeSessionPatch(patch) {
  return patch && typeof patch === "object" ? { ...patch } : null;
}

function ensureContinuity({ session, patch, userMode, replyMode }) {
  const s = session && typeof session === "object" ? session : null;
  let p = patch && typeof patch === "object" ? patch : null;

  const mode = userMode || replyMode || null;

  // Year continuity (best-effort)
  const y = clampYear(
    (p && (p.year || p.lastMusicYear)) ||
      (s && s.lastMusicYear) ||
      null
  );

  if (mode) {
    if (s) s.activeMusicMode = mode;
    p = p || {};
    // chatEngine's applySessionPatch supports both "mode" and "activeMusicMode"
    p.mode = p.mode || mode;
    p.activeMusicMode = p.activeMusicMode || mode;
  }

  if (y) {
    if (s) s.lastMusicYear = y;
    p = p || {};
    p.year = p.year || y;
    p.lastMusicYear = p.lastMusicYear || y;
  }

  return p;
}

async function handleChat({ text, session, visitorId, debug }) {
  try {
    const cleanText = String(text || "");
    const s = session || {};

    if (!musicKnowledge) {
      return {
        reply: "Music is warming up. Give me a year (1950–2024).",
        followUps: safeChipsFromStrings(["1956", "1988", "top 10 1988"]),
        sessionPatch: null,
        meta: debug ? { ok: false, reason: "musicKnowledge_missing" } : null,
      };
    }

    const raw = await Promise.resolve(
      musicKnowledge.handleChat({
        text: cleanText,
        session: s,
        visitorId,
        debug: !!debug,
      })
    );

    const reply = String(raw && raw.reply ? raw.reply : "").trim();

    // musicKnowledge v2.75 returns followUps: string[]
    const fuStrings = Array.isArray(raw && raw.followUps) ? raw.followUps : [];
    const followUps = safeChipsFromStrings(fuStrings);

    // Copy + normalize sessionPatch
    let sessionPatch = safeSessionPatch(raw && raw.sessionPatch);

    // ✅ Determine mode deterministically
    const userMode = normalizeModeFromText(cleanText);
    const replyMode = inferModeFromReply(reply);

    // ✅ Guarantee mode/year continuity so cog doesn't say "need:mode" after rendering Top 10
    sessionPatch = ensureContinuity({ session: s, patch: sessionPatch, userMode, replyMode });

    return {
      reply,
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
            followUps: followUps.length,
            hasPatch: !!sessionPatch,
            inferred: {
              userMode: userMode || null,
              replyMode: replyMode || null,
              appliedMode: sessionPatch && (sessionPatch.mode || sessionPatch.activeMusicMode) ? (sessionPatch.mode || sessionPatch.activeMusicMode) : null,
              appliedYear: sessionPatch && (sessionPatch.year || sessionPatch.lastMusicYear) ? (sessionPatch.year || sessionPatch.lastMusicYear) : null,
            },
          }
        : null,
    };
  } catch (e) {
    return {
      reply: "Music lane hit a snag. Give me a year (1950–2024) and try again.",
      followUps: safeChipsFromStrings(["1956", "1988", "top 10 1988"]),
      sessionPatch: null,
      meta: debug ? { ok: false, reason: "exception", error: String(e && e.message ? e.message : e) } : null,
    };
  }
}

module.exports = { handleChat };
