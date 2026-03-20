"use strict";

/**
 * utils/laneRouter.js
 *
 * laneRouter v1.2.0 UNIFIED-EMOTION-ACTIONS
 * ------------------------------------------------------------
 * PURPOSE
 * - Keep lane ownership deterministic
 * - Generate lane-aware UI without breaking support-lock behavior
 * - Convert generic follow-ups into action-role clusters the UI can attach to the active assistant turn
 * - Stay fail-open safe when lane modules are missing
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

const LR_VERSION = "laneRouter v1.2.0 UNIFIED-EMOTION-ACTIONS";

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

function action(id, label, payload, role, tone) {
  return {
    id: safeStr(id || label || "action").trim() || "action",
    type: "action",
    label: safeStr(label || "Continue").trim() || "Continue",
    payload: isPlainObject(payload) ? payload : {},
    role: safeStr(role || "advance").toLowerCase() || "advance",
    tone: safeStr(tone || "steady").toLowerCase() || "steady"
  };
}

function dedupeByLabel(items, maxItems) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    const label = safeStr(item.label || item.title || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, label });
    if (out.length >= (Number(maxItems) > 0 ? Number(maxItems) : 4)) break;
  }
  return out;
}

function isSupportiveEmotion(emo) {
  return !!(
    emo && (
      emo.bypassClarify ||
      safeStr(emo.mode || "").toLowerCase() === "vulnerable" ||
      safeStr(emo.valence || "").toLowerCase() === "negative" ||
      !!emo?.supportFlags?.needsGentlePacing ||
      !!emo?.supportFlags?.needsStabilization
    )
  );
}

function mapEmotionalState(emo) {
  const mode = safeStr(emo?.mode || "").toLowerCase();
  const valence = safeStr(emo?.valence || "").toLowerCase();
  const supportMode = safeStr(emo?.supportModeCandidate || "").toLowerCase();
  if (emo?.supportFlags?.crisis) return "reassuring";
  if (isSupportiveEmotion(emo) || /soothe|stabilize|ground/.test(supportMode) || mode === "distress") return "supportive";
  if (valence === "positive") return "celebratory";
  if (/clarify|sequence|regulate/.test(supportMode)) return "clarifying";
  if (/channel|coach|forward/.test(supportMode)) return "decisive";
  return "focused";
}

function buildLaneSelectorChips(activeLane) {
  const lane = normalizeLaneValue(activeLane);
  return [
    { id: "music", type: "lane", label: "Music", payload: { lane: "music" }, role: lane === "music" ? "current" : "pivot" },
    { id: "movies", type: "lane", label: "Movies", payload: { lane: "movies" }, role: lane === "movies" ? "current" : "pivot" },
    { id: "news", type: "lane", label: "News Canada", payload: { lane: "news" }, role: lane === "news" ? "current" : "pivot" },
    { id: "reset", type: "action", label: "Reset", payload: { action: "reset" }, role: "recover" }
  ];
}

function buildUiForLane(lane, emo) {
  const l = normalizeLaneValue(lane);
  const state = mapEmotionalState(emo);
  const base = {
    chips: buildLaneSelectorChips(l),
    allowMic: true,
    mode: state,
    promptPlacement: "attached",
    replace: false,
    clearStale: false,
    placeholder: l === "music"
      ? "Tell Nyx a year, artist, or chart move…"
      : l === "movies"
      ? "Tell Nyx a title, actor, or year…"
      : state === "supportive"
      ? "Tell Nyx what feels heavy…"
      : state === "decisive"
      ? "Tell Nyx what you want done…"
      : "Ask Nyx anything about Sandblast…"
  };

  if (l === "music") {
    base.chips = [
      { id: "top10", type: "action", label: "Top 10", payload: { lane: "music", action: "top10" }, role: "advance" },
      { id: "cinematic", type: "action", label: "Cinematic", payload: { lane: "music", action: "cinematic" }, role: "explore" },
      { id: "yearend", type: "action", label: "Year-End", payload: { lane: "music", action: "yearend" }, role: "explore" }
    ];
  }

  return base;
}

function buildSupportUi() {
  return {
    chips: [],
    allowMic: true,
    mode: "supportive",
    promptPlacement: "attached",
    replace: true,
    clearStale: true,
    placeholder: "Tell Nyx what feels hardest…"
  };
}

function buildEmotionalActionsForLane(lane, emo, norm) {
  const l = normalizeLaneValue(lane);
  const text = safeStr(norm?.text || "").trim();
  const state = mapEmotionalState(emo);

  if (state === "supportive") {
    return dedupeByLabel([
      action("break_down", "Break it down for me", { action: "support_break_down", lane: l }, "stabilize", "gentle"),
      action("easy_next", "Show the easiest next step", { action: "support_easy_next", lane: l }, "advance", "gentle"),
      action("stay_guided", "Stay with this and guide me", { action: "guided_mode_on", lane: l, mode: "supportive" }, "confirm", "gentle")
    ], 3);
  }

  if (l === "music") {
    return dedupeByLabel([
      action("top10", "Give me a Top 10", { lane: "music", action: "top10" }, "advance", "focused"),
      action("pick_year", "Pick a year", { lane: "music", action: "year_pick" }, "narrow", "focused"),
      action("story", "Tell me the story", { lane: "music", action: "story_moment" }, "explore", "curious")
    ], 3);
  }

  if (l === "movies") {
    return dedupeByLabel([
      action("pick_title", "Give me a title", { lane: "movies", action: "title_pick" }, "advance", "focused"),
      action("pick_year", "Pick a year", { lane: "movies", action: "year_pick" }, "narrow", "focused"),
      action("actor_route", "Search by actor", { lane: "movies", action: "actor_pick" }, "explore", "curious")
    ], 3);
  }

  if (/widget|chat engine|state spine|emotion|backend|render|file|code|patch|fix/i.test(text)) {
    return dedupeByLabel([
      action("exact_fix", "Show the exact fix", { action: "exact_fix", lane: l }, "advance", "decisive"),
      action("production_build", "Generate the production-ready build", { action: "production_build", lane: l }, "advance", "decisive"),
      action("critical_path", "Stay on the critical path", { action: "critical_path", lane: l }, "confirm", "focused")
    ], 3);
  }

  if (state === "celebratory") {
    return dedupeByLabel([
      action("build_on_it", "Build on this", { action: "build_on_it", lane: l }, "advance", "bright"),
      action("next_move", "Turn this into a next step", { action: "next_step", lane: l }, "advance", "focused"),
      action("stay_here", "Stay with this for a second", { action: "linger_here", lane: l }, "confirm", "warm")
    ], 3);
  }

  return dedupeByLabel([
    action("show_fix", "Show the exact fix", { action: "exact_fix", lane: l }, "advance", "focused"),
    action("next_step", "Pick the next move", { action: "next_step", lane: l }, "advance", "focused"),
    action("explore", "Explore options", { action: "explore_options", lane: l }, "explore", "curious")
  ], state === "curious" ? 4 : 3);
}

function buildFollowUpsForLane(lane, emo, norm) {
  return buildEmotionalActionsForLane(lane, emo, norm);
}

function simpleGeneralReply(norm, emo) {
  const text = safeStr(norm?.text || "").trim();
  if (!text) return "I am here. Tell me what you want to work on, and I will keep it structured.";

  if (isSupportiveEmotion(emo) || /(lonely|alone|isolated|abandoned|unseen|hurt|hurting|sad|hopeless|overwhelmed|anxious|panic)/i.test(text)) {
    return "I am here with you. We do not have to force speed. Tell me what feels hardest right now, and I will keep the next step clean.";
  }

  if (/(loop|looping|repeat|repeating)/i.test(text)) {
    return "Understood. We are going after the loop directly. Give me the exact layer, and I will keep the path locked to that target.";
  }

  if (emo && safeStr(emo.valence || "") === "mixed" && Number(emo?.contradictions?.count || 0) > 0) {
    return "I am seeing mixed signals in this. We can slow it down, isolate the main pressure point, and move from there.";
  }

  if (/(chat\s*engine|emotion\s*route\s*guard|state\s*spine|marion|nyx)/i.test(text)) {
    return "Got it. We can work this as an architecture problem: lock the emotional engine, stop duplicated branching, and keep the response path deterministic.";
  }

  return "Give me the exact target and I will stay with that path without bouncing you into a menu.";
}

function normalizeLaneOutput(out, fallbackLane, emo, norm) {
  const lane = normalizeLaneValue(safeStr(out?.lane || fallbackLane || "general") || "general");
  const reply = safeStr(out?.reply || "").trim();
  const directives = Array.isArray(out?.directives) ? out.directives : [];
  const followUps = Array.isArray(out?.followUps) && out.followUps.length
    ? dedupeByLabel(out.followUps, 4)
    : buildFollowUpsForLane(lane, emo, norm);
  const ui = isPlainObject(out?.ui)
    ? { ...buildUiForLane(lane, emo), ...out.ui }
    : buildUiForLane(lane, emo);
  return {
    reply,
    lane,
    directives,
    followUps,
    ui,
    meta: isPlainObject(out?.meta) ? out.meta : {}
  };
}

function tryMusicLane(norm, emo) {
  if (!Music) return null;
  try {
    if (typeof Music.handleChat === "function") {
      const out = Music.handleChat(norm);
      if (typeof out === "string") return normalizeLaneOutput({ reply: out, lane: "music" }, "music", emo, norm);
      if (isPlainObject(out) && safeStr(out.reply)) return normalizeLaneOutput(out, "music", emo, norm);
    }
  } catch (_e) {
    return normalizeLaneOutput({
      reply: "Music lane hit a snag. Give me a title, artist, or year and I will take another pass.",
      lane: "music",
      directives: [],
      meta: { failOpen: true, laneModule: "musicKnowledge" }
    }, "music", emo, norm);
  }
  return null;
}

function tryMoviesLane(norm, emo) {
  if (!MoviesLane || typeof MoviesLane.handleChat !== "function") return null;
  try {
    const out = MoviesLane.handleChat(norm);
    if (typeof out === "string") return normalizeLaneOutput({ reply: out, lane: "movies" }, "movies", emo, norm);
    if (isPlainObject(out) && safeStr(out.reply)) return normalizeLaneOutput(out, "movies", emo, norm);
  } catch (_e) {
    return normalizeLaneOutput({
      reply: "Movies lane hit a snag. Give me a title, actor, or year and I will take another pass.",
      lane: "movies",
      directives: [],
      meta: { failOpen: true, laneModule: "moviesLane" }
    }, "movies", emo, norm);
  }
  return null;
}

function resolveLane(norm, session) {
  const n = normalizeNorm(norm);
  const s = isPlainObject(session) ? session : {};
  return normalizeLaneValue(n.lane || n?.payload?.lane || n?.body?.lane || s.lane || s.lastLane || "general");
}

function routeLane(norm, session, emo) {
  const n = normalizeNorm(norm);
  const lane = resolveLane(n, session);

  if (isSupportiveEmotion(emo)) {
    return normalizeLaneOutput({
      reply: simpleGeneralReply(n, emo),
      lane: "general",
      followUps: buildEmotionalActionsForLane("general", emo, n),
      ui: buildSupportUi(),
      meta: { supportiveRoute: true, emotionalState: mapEmotionalState(emo) }
    }, "general", emo, n);
  }

  if (lane === "music") {
    const musicOut = tryMusicLane(n, emo);
    if (musicOut) return musicOut;
  }

  if (lane === "movies") {
    const moviesOut = tryMoviesLane(n, emo);
    if (moviesOut) return moviesOut;
  }

  return normalizeLaneOutput({
    reply: simpleGeneralReply(n, emo),
    lane: lane || "general",
    meta: { emotionalState: mapEmotionalState(emo) }
  }, lane || "general", emo, n);
}

module.exports = {
  LR_VERSION,
  routeLane,
  buildUiForLane,
  buildFollowUpsForLane,
  buildEmotionalActionsForLane,
  resolveLane,
  normalizeLaneValue,
  mapEmotionalState
};
