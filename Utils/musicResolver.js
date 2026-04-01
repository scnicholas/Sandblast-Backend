"use strict";

/**
 * Utils/musicResolver.js
 * Policy-first music intent resolver.
 *
 * Purpose:
 *  - Normalize inbound music text/payload into a canonical lane action.
 *  - Preserve year lock / carry-forward from session.
 *  - Produce widget-safe follow-ups and a small continuity patch.
 *  - Never fabricate chart/story content; execution belongs to musicKnowledge/musicMoments.
 */

const RESOLVER_VERSION = "musicResolver v1.2.1";
const YEAR_MIN = 1950;
const YEAR_MAX = 2025;
const LANE = "music";
const CHART_DEFAULT = "Billboard Hot 100";

function safeStr(v) { return v == null ? "" : String(v); }
function lower(v) { return safeStr(v).trim().toLowerCase(); }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v) { return Array.isArray(v) ? v : []; }
function normYear(v) {
  const m = typeof v === "number"
    ? String(v)
    : safeStr(v).match(/\b(19[5-9]\d|20[0-2]\d|2025)\b/);
  const y = typeof v === "number" ? v : (m ? Number(m[1]) : NaN);
  return Number.isFinite(y) && y >= YEAR_MIN && y <= YEAR_MAX ? Math.trunc(y) : null;
}
function uniqFollowUps(items) {
  const seen = new Set();
  const out = [];
  for (const item of arr(items)) {
    const label = safeStr(item?.label || item?.text).trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: safeStr(item?.id || key.replace(/\s+/g, "_")),
      type: safeStr(item?.type || "action") || "action",
      label,
      payload: isObj(item?.payload)
        ? item.payload
        : { lane: LANE, action: safeStr(item?.action || label) || "top10" },
    });
    if (out.length >= 10) break;
  }
  return out;
}

function normalizeActionName(x) {
  const t = lower(x);
  if (!t) return null;
  if (["music_top10_by_year", "top10", "top_10", "top ten"].includes(t)) return "top10";
  if (["music_number_one_by_year", "number1", "number_1", "#1", "number one", "no 1", "no. 1", "number_one"].includes(t)) return "number1";
  if (["music_story_moment_by_year", "story", "story_moment", "moment"].includes(t)) return "story_moment";
  if (["music_micro_moment_by_year", "micro", "micro_moment"].includes(t)) return "micro_moment";
  if (["music_yearend_hot100_by_year", "yearend_hot100", "top100", "hot100", "hot 100"].includes(t)) return "yearend_hot100";
  if (t === "year_pick") return "year_pick";
  return null;
}

function inferActionFromText(textLower) {
  if (!textLower) return null;
  if (/\btop\s*10\b|\btop\s*ten\b/.test(textLower)) return "top10";
  if (/\byear[-\s]*end\s*hot\s*100\b|\btop\s*100\b|\bhot\s*100\b/.test(textLower)) return "yearend_hot100";
  if (/\b#\s*1\b|\bnumber\s*one\b|\bnumber\s*1\b|\bno\.?\s*1\b/.test(textLower)) return "number1";
  if (/\bstory\s*moment\b|\bstory\b|\bmoment\b/.test(textLower)) return "story_moment";
  if (/\bmicro\s*moment\b|\bmicro\b/.test(textLower)) return "micro_moment";
  return null;
}

function makeContext(input = {}) {
  const text = safeStr(input.text || input.message || "");
  const session = isObj(input.session) ? input.session : {};
  const policy = isObj(input.policy) ? input.policy : {};
  const inferred = isObj(input.inferredSlots) ? input.inferredSlots : {};
  const policyAction = normalizeActionName(policy.action);
  const explicitAction = normalizeActionName(input.action);
  const textLower = lower(text);
  const year = normYear(inferred.year)
    || normYear(policy?.inferredSlots?.year)
    || normYear(input.year)
    || normYear(session.lastMusicYear)
    || normYear(session.lockedYear)
    || normYear(session.year)
    || normYear(text);
  const activeLane = safeStr(input.activeLane || session.activeLane || session.lane || "general") || "general";
  return {
    text,
    textLower,
    session,
    policy,
    inferred,
    year,
    activeLane,
    action: explicitAction || policyAction || inferActionFromText(textLower),
  };
}

function buildFollowUps(year) {
  const prev = year && year - 1 >= YEAR_MIN
    ? { id: `year_${year - 1}`, type: "action", label: String(year - 1), payload: { lane: LANE, action: "top10", year: year - 1 } }
    : null;
  const next = year && year + 1 <= YEAR_MAX
    ? { id: `year_${year + 1}`, type: "action", label: String(year + 1), payload: { lane: LANE, action: "top10", year: year + 1 } }
    : null;
  return uniqFollowUps([
    { id: "top10", type: "action", label: "Top 10", payload: { lane: LANE, action: "top10", year: year || undefined } },
    { id: "number1", type: "action", label: "#1 Song", payload: { lane: LANE, action: "number1", year: year || undefined } },
    { id: "story", type: "action", label: "Story moment", payload: { lane: LANE, action: "story_moment", year: year || undefined } },
    { id: "micro", type: "action", label: "Micro moment", payload: { lane: LANE, action: "micro_moment", year: year || undefined } },
    prev,
    next,
    { id: "another_year", type: "action", label: "Another year", payload: { lane: LANE, action: "year_pick" } },
  ]);
}

function finalize(payload) {
  return {
    ok: payload.ok !== false,
    source: "musicResolver",
    version: RESOLVER_VERSION,
    lane: LANE,
    action: payload.action || null,
    year: payload.year || null,
    needsYear: !!payload.needsYear,
    requiresExecution: payload.requiresExecution !== false,
    followUps: uniqFollowUps(payload.followUps),
    sessionPatch: isObj(payload.sessionPatch) ? payload.sessionPatch : {},
    meta: isObj(payload.meta) ? payload.meta : {},
    reply: safeStr(payload.reply || "").trim(),
  };
}

async function resolveMusicIntent(input = {}) {
  const ctx = makeContext(input);
  let action = ctx.action;

  if (!action && ctx.activeLane === LANE && ctx.year) action = "top10";

  if (!action) {
    return finalize({
      action: null,
      year: ctx.year,
      needsYear: false,
      followUps: buildFollowUps(ctx.year),
      sessionPatch: { activeLane: LANE, lane: LANE, activeMusicChart: CHART_DEFAULT, lastMusicChart: CHART_DEFAULT },
      meta: { resolverMode: "clarify" },
      reply: "Give me the music target and year and I will run it.",
    });
  }

  if (action !== "year_pick" && !ctx.year) {
    return finalize({
      action,
      year: null,
      needsYear: true,
      followUps: buildFollowUps(null),
      sessionPatch: { activeLane: LANE, lane: LANE, activeMusicMode: action, activeMusicChart: CHART_DEFAULT, lastMusicChart: CHART_DEFAULT },
      meta: { resolverMode: "clarify_missing_year" },
      reply: "Give me the year and I will run it.",
    });
  }

  return finalize({
    action,
    year: ctx.year,
    needsYear: action === "year_pick",
    followUps: buildFollowUps(ctx.year),
    sessionPatch: {
      activeLane: LANE,
      lane: LANE,
      activeMusicMode: action === "year_pick" ? (ctx.session.activeMusicMode || "top10") : action,
      lastMusicYear: ctx.year || null,
      year: ctx.year || null,
      lockedYear: ctx.year || null,
      activeMusicChart: CHART_DEFAULT,
      lastMusicChart: CHART_DEFAULT,
    },
    meta: { resolverMode: action },
    reply: action === "year_pick" ? "Pick a year and I will run it." : "",
  });
}

module.exports = { RESOLVER_VERSION, resolveMusicIntent, normalizeActionName };
