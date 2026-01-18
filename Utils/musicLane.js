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
  return patch && typeof patch === "object" ? patch : null;
}

async function handleChat({ text, session, visitorId, debug }) {
  try {
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
        text: String(text || ""),
        session: session || {},
        visitorId,
        debug: !!debug,
      })
    );

    const reply = String(raw && raw.reply ? raw.reply : "").trim();

    // musicKnowledge v2.75 returns followUps: string[]
    const fuStrings = Array.isArray(raw && raw.followUps) ? raw.followUps : [];
    const followUps = safeChipsFromStrings(fuStrings);

    const sessionPatch = safeSessionPatch(raw && raw.sessionPatch);

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
