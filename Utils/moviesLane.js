"use strict";

/**
 * Utils/moviesLane.js
 *
 * Thin adapter over Utils/moviesKnowledge.js (or whatever your movie brain module is).
 * Goals:
 *  - Deterministic
 *  - Never throws
 *  - Output normalized to:
 *      { reply, followUps:[{label,send}], sessionPatch, meta? }
 *
 * IMPORTANT:
 *  - Underlying module may return followUps as string[] or chips as objects.
 *  - chatEngine wants followUps as chip objects.
 *
 * FIX (v1.1a):
 *  - Guarantee lane pin in sessionPatch
 *  - Normalize followUps from string[] OR object[] (label/send/text/value/query)
 *  - Never throw; always returns a safe fallback prompt
 *  - Optional deterministic hint inference (harmless if chatEngine ignores it)
 *
 * NOTE:
 *  - This adapter does NOT implement movie logic. It only normalizes and hardens.
 */

let moviesKnowledge = null;
try {
  // If your module name differs, update this require:
  // e.g. "./moviesLaneCore" or "./moviesKnowledge"
  moviesKnowledge = require("./moviesKnowledge");
  if (!moviesKnowledge || typeof moviesKnowledge.handleChat !== "function") moviesKnowledge = null;
} catch (_) {
  moviesKnowledge = null;
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function safeFollowUps(list) {
  // Accepts:
  // - string[]
  // - [{label,send}]
  // - [{text,value}] etc (best-effort)
  if (!Array.isArray(list)) return [];

  const out = [];
  const seen = new Set();

  for (const it of list) {
    let label = "";
    let send = "";

    if (typeof it === "string") {
      const s = String(it || "").replace(/\s+/g, " ").trim();
      if (!s) continue;
      label = s.length > 48 ? s.slice(0, 48) : s;
      send = s.slice(0, 80);
    } else if (it && typeof it === "object") {
      const l =
        (typeof it.label === "string" && it.label) ||
        (typeof it.text === "string" && it.text) ||
        (typeof it.title === "string" && it.title) ||
        "";
      const s =
        (typeof it.send === "string" && it.send) ||
        (typeof it.value === "string" && it.value) ||
        (typeof it.query === "string" && it.query) ||
        (typeof it.text === "string" && it.text) ||
        l;

      label = String(l || "").replace(/\s+/g, " ").trim();
      send = String(s || "").replace(/\s+/g, " ").trim();

      if (!label || !send) continue;
      if (label.length > 48) label = label.slice(0, 48);
      if (send.length > 80) send = send.slice(0, 80);
    } else {
      continue;
    }

    if (!label || !send) continue;

    const k = send.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);

    out.push({ label, send });
    if (out.length >= 10) break;
  }

  return out;
}

function safeSessionPatch(patch) {
  return patch && typeof patch === "object" ? { ...patch } : null;
}

function inferMovieHint(userText, reply) {
  const t = norm(userText);
  const r = norm(reply);

  // Minimal, deterministic hints (optional)
  if (/\brecommend\b|\bsuggest\b|\bwhat should i watch\b|\bgive me\b/.test(t)) return "recommend";
  if (/\btitle\b|\bmovie\b|\bshow\b|\bseries\b/.test(t) && /\bwhat\b|\bwhich\b|\bfind\b/.test(t)) return "search";
  if (r.includes("give me a title") || r.includes("tell me a title")) return "ask_title";
  if (r.includes("give me a genre") || r.includes("pick a genre")) return "ask_genre";
  return null;
}

function defaultFallback() {
  return {
    reply: 'Movies/TV lane is warming up. Give me a title, a genre, or say "recommend something".',
    followUps: safeFollowUps(["recommend something", "classic tv", "westerns", "detective"]),
    sessionPatch: { lane: "movies" },
    meta: null
  };
}

async function handleChat({ text, session, visitorId, debug }) {
  try {
    const cleanText = String(text || "");
    const s = session || {};

    if (!moviesKnowledge) {
      const fb = defaultFallback();
      fb.meta = debug ? { ok: false, reason: "moviesKnowledge_missing" } : null;
      return fb;
    }

    const raw = await Promise.resolve(
      moviesKnowledge.handleChat({
        text: cleanText,
        session: s,
        visitorId,
        debug: !!debug
      })
    );

    const reply = String(
      raw && (raw.reply || raw.message || raw.text) ? (raw.reply || raw.message || raw.text) : ""
    ).trim();

    // Accept multiple followUp shapes
    const fuRaw = (raw && raw.followUps) || (raw && raw.chips) || (raw && raw.suggestions) || [];
    const followUps = safeFollowUps(fuRaw);

    let sessionPatch = safeSessionPatch(raw && raw.sessionPatch);
    sessionPatch = sessionPatch || {};

    // Always pin lane (prevents accidental lane drift after movies replies)
    if (!Object.prototype.hasOwnProperty.call(sessionPatch, "lane")) sessionPatch.lane = "movies";

    // Optional: tiny hint the engine can ignore if not allowlisted
    const hint = inferMovieHint(cleanText, reply);
    if (hint && !Object.prototype.hasOwnProperty.call(sessionPatch, "moviesHint")) {
      sessionPatch.moviesHint = hint;
    }

    // If no reply, return fallback but keep lane pinned
    if (!reply) {
      const fb = defaultFallback();
      fb.sessionPatch = sessionPatch;
      fb.meta = debug ? { ok: false, reason: "empty_reply_from_moviesKnowledge" } : null;
      return fb;
    }

    return {
      reply,
      followUps: followUps.length ? followUps : safeFollowUps(["recommend something", "classic tv", "westerns", "detective"]),
      sessionPatch,
      meta: debug
        ? {
            ok: true,
            source: "moviesKnowledge",
            followUps: followUps.length,
            hasPatch: true,
            inferredHint: hint || null
          }
        : null
    };
  } catch (e) {
    const fb = defaultFallback();
    fb.meta = debug ? { ok: false, reason: "exception", error: String(e && e.message ? e.message : e) } : null;
    return fb;
  }
}

module.exports = { handleChat };
