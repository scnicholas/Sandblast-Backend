"use strict";

/**
 * utils/laneRouter.js
 *
 * laneRouter v1.0.0
 * ------------------------------------------------------------
 * PURPOSE
 * - Extract lane/domain routing out of chatEngine.js
 * - Keep lane ownership deterministic
 * - Preserve current music + movies lane hooks
 * - Keep fail-open behavior
 * - Do NOT own loop control here
 *
 * 15 PHASE COVERAGE
 * ------------------------------------------------------------
 * Phase 01: Safe dependency loading
 * Phase 02: Inbound lane normalization
 * Phase 03: Lane hint extraction
 * Phase 04: Music lane delegation
 * Phase 05: Movies lane delegation
 * Phase 06: General fallback routing
 * Phase 07: UI chip generation
 * Phase 08: Follow-up generation
 * Phase 09: Route output normalization
 * Phase 10: Fail-open lane fallback
 * Phase 11: Public-safe string shaping
 * Phase 12: Minimal greeting-aware generality
 * Phase 13: Optional lane metadata
 * Phase 14: Stable export surface
 * Phase 15: Structural hardening
 */

let Music = null;
try { Music = require("./musicKnowledge"); } catch (_e) { Music = null; }

let MoviesLane = null;
try {
  MoviesLane = require("./moviesLane");
  if (!MoviesLane || typeof MoviesLane.handleChat !== "function") MoviesLane = null;
} catch (_e) {
  MoviesLane = null;
}

const LR_VERSION = "laneRouter v1.0.0";

function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}

function isPlainObject(x) {
  return !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}

function oneLine(s) {
  return safeStr(s).replace(/\s+/g, " ").trim();
}

function normalizeLaneValue(v) {
  const raw = oneLine(v || "").toLowerCase();
  if (!raw) return "general";

  if (raw === "movie" || raw === "film" || raw === "films") return "movies";
  if (raw === "song" || raw === "songs" || raw === "radio") return "music";
  if (raw === "default" || raw === "chat" || raw === "general") return "general";

  return raw;
}

function normalizeNorm(norm) {
  const src = isPlainObject(norm) ? norm : {};
  return {
    text: safeStr(src.text || ""),
    lane: normalizeLaneValue(src.lane || src?.payload?.lane || src?.body?.lane || ""),
    action: safeStr(src.action || src?.payload?.action || src?.body?.action || ""),
    year: src.year || src?.payload?.year || src?.body?.year || null,
    vibe: safeStr(src.vibe || src?.payload?.vibe || src?.body?.vibe || ""),
    payload: isPlainObject(src.payload) ? src.payload : {},
    body: isPlainObject(src.body) ? src.body : {},
    ctx: isPlainObject(src.ctx) ? src.ctx : {}
  };
}

function buildUiForLane(lane) {
  const l = normalizeLaneValue(lane);

  if (l === "music") {
    return {
      chips: [
        { id: "top10", type: "action", label: "Top 10", payload: { lane: "music", action: "top10" } },
        { id: "cinematic", type: "action", label: "Cinematic", payload: { lane: "music", action: "cinematic" } },
        { id: "yearend", type: "action", label: "Year-End", payload: { lane: "music", action: "yearend" } }
      ],
      allowMic: true
    };
  }

  return {
    chips: [
      { id: "music", type: "lane", label: "Music", payload: { lane: "music" } },
      { id: "movies", type: "lane", label: "Movies", payload: { lane: "movies" } },
      { id: "news", type: "lane", label: "News Canada", payload: { lane: "news" } },
      { id: "reset", type: "action", label: "Reset", payload: { action: "reset" } }
    ],
    allowMic: true
  };
}

function buildFollowUpsForLane(lane) {
  const l = normalizeLaneValue(lane);

  if (l === "music") {
    return [
      { id: "fu_top10", type: "action", label: "Give me a Top 10", payload: { lane: "music", action: "top10" } },
      { id: "fu_year", type: "action", label: "Pick a year", payload: { lane: "music", action: "year_pick" } }
    ];
  }

  return [
    { id: "fu_music", type: "lane", label: "Go to Music", payload: { lane: "music" } },
    { id: "fu_movies", type: "lane", label: "Go to Movies", payload: { lane: "movies" } }
  ];
}


function buildSupportUi() {
  return {
    chips: [
      { id: "support_talk", type: "action", label: "Talk to me", payload: { action: "support_talk", mode: "supportive" } },
      { id: "support_stay", type: "action", label: "Stay with me", payload: { action: "support_stay", mode: "supportive" } }
    ],
    allowMic: true,
    mode: "supportive"
  };
}

function buildSupportFollowUps() {
  return [
    { id: "fu_support_talk", type: "action", label: "Talk to me", payload: { action: "support_talk", mode: "supportive" } },
    { id: "fu_support_stay", type: "action", label: "Stay with me", payload: { action: "support_stay", mode: "supportive" } }
  ];
}

function isSupportiveEmotion(emo) {
  return !!(
    emo &&
    (
      emo.bypassClarify ||
      safeStr(emo.mode || "").toLowerCase() === "vulnerable" ||
      safeStr(emo.valence || "").toLowerCase() === "negative" ||
      !!emo?.supportFlags?.needsGentlePacing
    )
  );
}

function simpleGeneralReply(norm, emo) {
  const text = safeStr(norm?.text || "").trim();
  if (!text) return "I am here. Tell me what you want to work on, and I will keep it structured.";

  if (isSupportiveEmotion(emo) || /\b(lonely|alone|isolated|abandoned|unseen|hurt|hurting|sad|hopeless|overwhelmed|anxious|panic)\b/i.test(text)) {
    return "I am here with you. You do not have to sit in that feeling alone. Tell me what feels hardest right now.";
  }

  if (/\b(loop|looping|repeat|repeating)\b/i.test(text)) {
    return "Understood. We are going after the loop directly. Give me the file or the exact layer, and I will keep the response locked to that target.";
  }

  if (emo && safeStr(emo.valence || "") === "mixed" && Number(emo?.contradictions?.count || 0) > 0) {
    return "I am seeing mixed signals in this. We can slow it down and isolate the main pressure point first.";
  }

  if (/\b(chat\s*engine|emotion\s*route\s*guard|state\s*spine|marion|nyx)\b/i.test(text)) {
    return "Got it. We can work this as an architecture problem: isolate the heavy logic, stop duplicated emotional parsing, and keep the response path deterministic.";
  }

  return "Give me the exact target and I will stay with that path without bouncing you into a menu.";
}

function normalizeLaneOutput(out, fallbackLane) {
  const lane = normalizeLaneValue(
    safeStr(out?.lane || fallbackLane || "general") || "general"
  );

  const reply = safeStr(out?.reply || "").trim();
  const directives = Array.isArray(out?.directives) ? out.directives : [];
  const followUps = Array.isArray(out?.followUps) ? out.followUps : buildFollowUpsForLane(lane);
  const ui = isPlainObject(out?.ui) ? out.ui : buildUiForLane(lane);

  return {
    reply,
    lane,
    directives,
    followUps,
    ui,
    meta: isPlainObject(out?.meta) ? out.meta : {}
  };
}

function tryMusicLane(norm) {
  if (!Music) return null;

  try {
    if (typeof Music.handleChat === "function") {
      const out = Music.handleChat(norm);
      if (typeof out === "string") return normalizeLaneOutput({ reply: out, lane: "music" }, "music");
      if (isPlainObject(out) && safeStr(out.reply)) return normalizeLaneOutput(out, "music");
    }
  } catch (_e) {
    return {
      reply: "Music lane hit a snag. Give me a title, artist, or year and I will take another pass.",
      lane: "music",
      directives: [],
      followUps: buildFollowUpsForLane("music"),
      ui: buildUiForLane("music"),
      meta: { failOpen: true, laneModule: "musicKnowledge" }
    };
  }

  return null;
}

function tryMoviesLane(norm) {
  if (!MoviesLane || typeof MoviesLane.handleChat !== "function") return null;

  try {
    const out = MoviesLane.handleChat(norm);
    if (typeof out === "string") return normalizeLaneOutput({ reply: out, lane: "movies" }, "movies");
    if (isPlainObject(out) && safeStr(out.reply)) return normalizeLaneOutput(out, "movies");
  } catch (_e) {
    return {
      reply: "Movies lane hit a snag. Give me a title, actor, or year and I will take another pass.",
      lane: "movies",
      directives: [],
      followUps: buildFollowUpsForLane("movies"),
      ui: buildUiForLane("movies"),
      meta: { failOpen: true, laneModule: "moviesLane" }
    };
  }

  return null;
}

function resolveLane(norm, session) {
  const n = normalizeNorm(norm);
  const s = isPlainObject(session) ? session : {};

  return normalizeLaneValue(
    n.lane ||
    n?.payload?.lane ||
    n?.body?.lane ||
    s.lane ||
    s.lastLane ||
    "general"
  );
}

function routeLane(norm, session, emo) {
  const n = normalizeNorm(norm);
  const lane = resolveLane(n, session);

  if (isSupportiveEmotion(emo)) {
    return normalizeLaneOutput({
      reply: simpleGeneralReply(n, emo),
      lane: "general",
      followUps: buildSupportFollowUps(),
      ui: buildSupportUi(),
      meta: { supportiveRoute: true }
    }, "general");
  }

  if (lane === "music") {
    const musicOut = tryMusicLane(n);
    if (musicOut) return musicOut;
  }

  if (lane === "movies") {
    const moviesOut = tryMoviesLane(n);
    if (moviesOut) return moviesOut;
  }

  return normalizeLaneOutput({
    reply: simpleGeneralReply(n, emo),
    lane: lane || "general"
  }, lane || "general");
}

module.exports = {
  LR_VERSION,
  routeLane,
  buildUiForLane,
  buildFollowUpsForLane,
  resolveLane,
  normalizeLaneValue
};
