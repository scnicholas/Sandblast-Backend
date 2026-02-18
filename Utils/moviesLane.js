"use strict";

/**
 * Utils/moviesLane.js
 *
 * Thin adapter over Utils/moviesKnowledge.js (or whatever your movie brain module is).
 * Goals:
 *  - Deterministic
 *  - Never throws
 *  - Output normalized to:
 *      { reply, followUps:[{label,send,payload?}], sessionPatch, meta? }
 *
 * IMPORTANT:
 *  - Underlying module may return followUps as string[] or chips as objects.
 *  - chatEngine wants followUps as chip objects.
 *
 * v1.1b (CHIP PAYLOAD++++ + ROUTE ALIAS++++ + LANE PIN++++ + FALLBACK HARDEN++++)
 * ✅ Always pins lane in sessionPatch
 * ✅ Normalizes followUps from string[] OR object[] (label/send/text/value/query/payload/route/action)
 * ✅ Emits followUps as chip objects with {id,label,payload:{route,action,lane,year,vibe}}
 * ✅ Never throws; always returns a safe fallback prompt
 * ✅ Optional deterministic hint inference (harmless if chatEngine ignores it)
 *
 * NOTE:
 *  - This adapter does NOT implement movie logic. It only normalizes and hardens.
 */

let moviesKnowledge = null;
try {
  // If your module name differs, update this require:
  // e.g. "./moviesLaneCore" or "./moviesKnowledge"
  // NOTE: keep local require to avoid bundler surprises.
  // eslint-disable-next-line global-require
  moviesKnowledge = require("./moviesKnowledge");
  if (!moviesKnowledge || typeof moviesKnowledge.handleChat !== "function") moviesKnowledge = null;
} catch (_) {
  moviesKnowledge = null;
}

// -------------------------
// helpers (pure)
// -------------------------
function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function safeStr(x, max = 240) {
  if (max <= 0) return "";
  const s = String(x ?? "");
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) : t;
}

function normYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < 1900 || t > 2100) return null;
  return t;
}

function makeId(label, idx) {
  const base = norm(label).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const mini = base ? base.slice(0, 28) : "chip";
  return `${mini}-${idx + 1}`;
}

function safeSessionPatch(patch) {
  return patch && typeof patch === "object" ? { ...patch } : null;
}

function inferMovieHint(userText, reply) {
  const t = norm(userText);
  const r = norm(reply);

  // Minimal, deterministic hints (optional)
  if (/\brecommend\b|\bsuggest\b|\bwhat should i watch\b|\bgive me\b/.test(t)) return "recommend";
  if (/\btitle\b|\bmovie\b|\bshow\b|\bseries\b/.test(t) && /\bwhat\b|\bwhich\b|\bfind\b/.test(t))
    return "search";
  if (r.includes("give me a title") || r.includes("tell me a title")) return "ask_title";
  if (r.includes("give me a genre") || r.includes("pick a genre")) return "ask_genre";
  return null;
}

/**
 * Normalize followUps/chips/suggestions into chip objects:
 * { id, label, payload: { route?, action?, lane:"movies", year?, vibe? } }
 *
 * Accepts:
 * - string[]
 * - [{label,send}] (legacy)
 * - [{text,value,query,title,route,action,payload,year,vibe,lane}]
 */
function safeFollowUps(list) {
  if (!Array.isArray(list)) return [];

  const out = [];
  const seen = new Set();

  for (let i = 0; i < list.length; i++) {
    const it = list[i];

    let label = "";
    let send = "";
    let route = "";
    let action = "";
    let lane = "movies";
    let year = null;
    let vibe = "";

    if (typeof it === "string") {
      const s = safeStr(it, 120);
      if (!s) continue;
      label = s.length > 48 ? s.slice(0, 48) : s;
      send = s.slice(0, 80);
      // If it looks like a command, treat as route.
      if (/^[a-z_]{3,40}$/i.test(send)) route = send;
    } else if (it && typeof it === "object") {
      const l =
        (typeof it.label === "string" && it.label) ||
        (typeof it.text === "string" && it.text) ||
        (typeof it.title === "string" && it.title) ||
        "";

      // "send" aliases: send/value/query/text/label
      const s =
        (typeof it.send === "string" && it.send) ||
        (typeof it.value === "string" && it.value) ||
        (typeof it.query === "string" && it.query) ||
        (typeof it.text === "string" && it.text) ||
        l;

      label = safeStr(l, 120);
      send = safeStr(s, 120);

      // route/action can live at top-level OR inside payload
      route = safeStr(it.route || it.action || "", 80);
      action = safeStr(it.action || "", 80);

      // payload may contain richer info
      const p = it.payload && typeof it.payload === "object" ? it.payload : null;
      if (p) {
        if (!route) route = safeStr(p.route || p.action || "", 80);
        if (!action) action = safeStr(p.action || "", 80);
        const pLane = safeStr(p.lane || "", 24);
        if (pLane) lane = pLane;
        const yr = normYear(p.year);
        if (yr !== null) year = yr;
        const vb = safeStr(p.vibe || "", 40);
        if (vb) vibe = vb;
      }

      // direct year/vibe/lane aliases
      const itLane = safeStr(it.lane || "", 24);
      if (itLane) lane = itLane;
      const itYear = normYear(it.year);
      if (itYear !== null) year = itYear;
      const itVibe = safeStr(it.vibe || "", 40);
      if (itVibe) vibe = itVibe;

      if (!label && send) label = send;
      if (!send && label) send = label;

      if (label.length > 48) label = label.slice(0, 48);
      if (send.length > 80) send = send.slice(0, 80);
    } else {
      continue;
    }

    if (!label || !send) continue;

    // Dedupe by canonical send+route+year
    const k = `${norm(send)}|${norm(route || action)}|${year ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);

    // Build payload (chatEngine-friendly)
    const payload = { lane: "movies" };

    // Prefer route; keep action for compat.
    const ra = safeStr(route || "", 80);
    const aa = safeStr(action || "", 80);
    if (ra) payload.route = ra;
    if (aa && !payload.route) payload.action = aa;

    // If a chip explicitly declared another lane, normalize it but default to movies.
    const ln = safeStr(lane || "", 24);
    if (ln) payload.lane = ln;

    if (year !== null) payload.year = year;
    if (vibe) payload.vibe = vibe;

    out.push({
      id: makeId(label, out.length),
      label,
      payload,
      // keep legacy "send" for older renderers; chatEngine can ignore
      send,
    });

    if (out.length >= 10) break;
  }

  return out;
}

function defaultFallback() {
  return {
    reply: 'Movies/TV lane is warming up. Give me a title, a genre, or say "recommend something".',
    followUps: safeFollowUps(["recommend something", "classic tv", "westerns", "detective"]),
    sessionPatch: { lane: "movies" },
    meta: null,
  };
}

// -------------------------
// main adapter
// -------------------------
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
        debug: !!debug,
      })
    );

    const reply = safeStr(
      raw && (raw.reply || raw.message || raw.text) ? raw.reply || raw.message || raw.text : "",
      4000
    ).trim();

    // Accept multiple followUp shapes
    const fuRaw =
      (raw && raw.followUps) || (raw && raw.chips) || (raw && raw.suggestions) || [];
    const followUps = safeFollowUps(fuRaw);

    let sessionPatch = safeSessionPatch(raw && raw.sessionPatch);
    sessionPatch = sessionPatch || {};

    // Always pin lane (prevents accidental lane drift after movies replies)
    if (!Object.prototype.hasOwnProperty.call(sessionPatch, "lane")) sessionPatch.lane = "movies";
    else sessionPatch.lane = "movies"; // hard pin

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
      followUps: followUps.length
        ? followUps
        : safeFollowUps(["recommend something", "classic tv", "westerns", "detective"]),
      sessionPatch,
      meta: debug
        ? {
            ok: true,
            source: "moviesKnowledge",
            followUps: followUps.length,
            hasPatch: true,
            inferredHint: hint || null,
          }
        : null,
    };
  } catch (e) {
    const fb = defaultFallback();
    fb.meta = debug
      ? { ok: false, reason: "exception", error: String(e && e.message ? e.message : e) }
      : null;
    return fb;
  }
}

module.exports = { handleChat };
