"use strict";

/**
 * Utils/musicResolver.js
 * v1.3.0
 * CAPABILITY-AWARE + SOURCE-AWARE + CONTINUITY-SAFE
 */

const RESOLVER_VERSION = "musicResolver v1.3.0";
const YEAR_MIN = 1950;
const YEAR_MAX = 2025;
const LANE = "music";
const CHART_DEFAULT = "Billboard Hot 100";

let _musicKnowledge = undefined;
function getMusicKnowledge() {
  if (_musicKnowledge !== undefined) return _musicKnowledge;
  try {
    const mod = require("./musicKnowledge");
    _musicKnowledge = mod && typeof mod.getCapabilities === "function" ? mod : null;
  } catch (_) {
    _musicKnowledge = null;
  }
  return _musicKnowledge;
}

function safeStr(v) { return v == null ? "" : String(v); }
function lower(v) { return safeStr(v).trim().toLowerCase(); }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v) { return Array.isArray(v) ? v : []; }
function normYear(v) {
  const m = typeof v === "number" ? String(v) : safeStr(v).match(/\b(19[5-9]\d|20[0-2]\d|2025)\b/);
  const y = typeof v === "number" ? v : (m ? Number(m[1]) : NaN);
  return Number.isFinite(y) && y >= YEAR_MIN && y <= YEAR_MAX ? Math.trunc(y) : null;
}
function normalizeActionName(x) {
  const t = lower(x);
  if (!t) return null;
  if (["pick a year", "choose a year", "another year", "year", "select year", "year_pick"].includes(t)) return "year_pick";
  if (["music_top10_by_year", "top10", "top_10", "top ten", "top 10"].includes(t)) return "top10";
  if (["music_number_one_by_year", "number1", "number_1", "#1", "number one", "no 1", "no. 1", "number_one"].includes(t)) return "number1";
  if (["music_story_moment_by_year", "story", "story_moment", "moment", "story moment"].includes(t)) return "story_moment";
  if (["music_micro_moment_by_year", "micro", "micro_moment", "micro moment"].includes(t)) return "micro_moment";
  if (["music_yearend_hot100_by_year", "yearend_hot100", "top100", "hot100", "hot 100", "year-end hot 100", "year end hot 100"].includes(t)) return "yearend_hot100";
  return null;
}
function inferActionFromText(textLower) {
  if (!textLower) return null;
  if (/\b(pick|choose|select)\s+a?\s*year\b|\banother\s+year\b/.test(textLower)) return "year_pick";
  if (/\btop\s*10\b|\btop\s*ten\b/.test(textLower)) return "top10";
  if (/\byear[-\s]*end\s*hot\s*100\b|\btop\s*100\b|\bhot\s*100\b/.test(textLower)) return "yearend_hot100";
  if (/\b#\s*1\b|\bnumber\s*one\b|\bnumber\s*1\b|\bno\.?\s*1\b/.test(textLower)) return "number1";
  if (/\bstory\s*moment\b|\bstory\b|\bmoment\b/.test(textLower)) return "story_moment";
  if (/\bmicro\s*moment\b|\bmicro\b/.test(textLower)) return "micro_moment";
  return null;
}
function uniqFollowUps(items) {
  const seen = new Set();
  const out = [];
  for (const item of arr(items)) {
    if (!item) continue;
    const label = safeStr(item.label || item.text).trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: safeStr(item.id || key.replace(/\s+/g, "_")), type: safeStr(item.type || "action") || "action", label, payload: isObj(item.payload) ? item.payload : { lane: LANE, route: LANE, action: safeStr(item.action || label) || "top10" } });
    if (out.length >= 10) break;
  }
  return out;
}
function readCapabilities(input) {
  if (isObj(input.capabilities)) return input.capabilities;
  const knowledge = getMusicKnowledge();
  if (knowledge && typeof knowledge.getCapabilities === "function") {
    try { return knowledge.getCapabilities(); } catch (_) {}
  }
  return { ok: false, lane: LANE, routes: { top10: { executable: false }, number1: { executable: false }, story_moment: { executable: false }, micro_moment: { executable: false }, yearend_hot100: { executable: false, mode: "unknown" } }, provenance: { sourceOfMusicTruth: "unknown", storyMomentSource: "unknown", microMomentSource: "unknown" } };
}
function makeContext(input = {}) {
  const text = safeStr(input.text || input.message || "");
  const payload = isObj(input.payload) ? input.payload : {};
  const session = isObj(input.session) ? input.session : {};
  const policy = isObj(input.policy) ? input.policy : {};
  const inferred = isObj(input.inferredSlots) ? input.inferredSlots : {};
  const explicitAction = normalizeActionName(input.action || payload.action || payload.mode);
  const policyAction = normalizeActionName(policy.action);
  const textLower = lower(text);
  const year = normYear(inferred.year) || normYear(policy && policy.inferredSlots && policy.inferredSlots.year) || normYear(input.year) || normYear(payload.year) || normYear(text) || normYear(session.lastMusicYear) || normYear(session.lockedYear) || normYear(session.year);
  const activeLane = safeStr(input.activeLane || session.activeLane || session.lane || "general") || "general";
  return { text, textLower, payload, session, policy, inferred, year, activeLane, action: explicitAction || policyAction || inferActionFromText(textLower) };
}
function buildFollowUps(year, capabilities) {
  const routes = isObj(capabilities && capabilities.routes) ? capabilities.routes : {};
  const prev = year && year - 1 >= YEAR_MIN ? { id: `year_${year - 1}`, type: "action", label: String(year - 1), payload: { lane: LANE, route: LANE, action: "top10", year: year - 1 } } : null;
  const next = year && year + 1 <= YEAR_MAX ? { id: `year_${year + 1}`, type: "action", label: String(year + 1), payload: { lane: LANE, route: LANE, action: "top10", year: year + 1 } } : null;
  return uniqFollowUps([
    routes.top10 && routes.top10.executable ? { id: "top10", type: "action", label: "Top 10", payload: { lane: LANE, route: LANE, action: "top10", year: year || undefined } } : null,
    routes.number1 && routes.number1.executable ? { id: "number1", type: "action", label: "#1 Song", payload: { lane: LANE, route: LANE, action: "number1", year: year || undefined } } : null,
    routes.story_moment && routes.story_moment.executable ? { id: "story", type: "action", label: "Story moment", payload: { lane: LANE, route: LANE, action: "story_moment", year: year || undefined } } : null,
    routes.micro_moment && routes.micro_moment.executable ? { id: "micro", type: "action", label: "Micro moment", payload: { lane: LANE, route: LANE, action: "micro_moment", year: year || undefined } } : null,
    routes.yearend_hot100 && routes.yearend_hot100.executable ? { id: "yearend", type: "action", label: "Year-End Hot 100", payload: { lane: LANE, route: LANE, action: "yearend_hot100", year: year || undefined } } : null,
    prev, next,
    { id: "another_year", type: "action", label: "Another year", payload: { lane: LANE, route: LANE, action: "year_pick" } },
  ]);
}
function routeCapability(action, capabilities) {
  const routes = isObj(capabilities && capabilities.routes) ? capabilities.routes : {};
  return isObj(routes[action]) ? routes[action] : { executable: false };
}
function sessionPatchFor(ctx, action) {
  return { activeLane: LANE, lane: LANE, activeMusicMode: action === "year_pick" ? (ctx.session.activeMusicMode || "top10") : action, lastMusicYear: ctx.year || null, year: ctx.year || null, lockedYear: ctx.year || null, activeMusicChart: CHART_DEFAULT, lastMusicChart: CHART_DEFAULT, resolverVersion: RESOLVER_VERSION };
}
function finalize(payload) {
  return { ok: payload.ok !== false, source: "musicResolver", version: RESOLVER_VERSION, lane: LANE, action: payload.action || null, year: payload.year || null, needsYear: !!payload.needsYear, requiresExecution: payload.requiresExecution !== false, followUps: uniqFollowUps(payload.followUps), sessionPatch: isObj(payload.sessionPatch) ? payload.sessionPatch : {}, meta: isObj(payload.meta) ? payload.meta : {}, reply: safeStr(payload.reply || "").trim() };
}
async function resolveMusicIntent(input = {}) {
  const ctx = makeContext(input);
  const capabilities = readCapabilities(input);
  let action = ctx.action;
  if (!action && ctx.year) action = "top10";
  if (!action) {
    return finalize({ action: null, year: ctx.year, needsYear: false, followUps: buildFollowUps(ctx.year, capabilities), sessionPatch: { activeLane: LANE, lane: LANE, activeMusicChart: CHART_DEFAULT, lastMusicChart: CHART_DEFAULT }, meta: { resolverMode: "clarify", capabilities }, reply: "Give me the music target and year and I will run it." });
  }
  const capability = routeCapability(action, capabilities);
  if (action !== "year_pick" && !ctx.year) {
    return finalize({ action, year: null, needsYear: true, followUps: buildFollowUps(null, capabilities), sessionPatch: sessionPatchFor(ctx, action), meta: { resolverMode: "clarify_missing_year", capabilities }, reply: "Give me the year and I will run it." });
  }
  if (action !== "year_pick" && !capability.executable) {
    return finalize({ ok: false, action, year: ctx.year, needsYear: false, requiresExecution: false, followUps: buildFollowUps(ctx.year, capabilities), sessionPatch: sessionPatchFor(ctx, action), meta: { resolverMode: "capability_block", capabilities, requestedAction: action }, reply: "That music path is not currently executable from the loaded sources." });
  }
  let reply = "Music target locked. Running the lane now.";
  if (action === "year_pick") reply = "Choose a year and I will run the lane.";
  if (action === "yearend_hot100" && capability.mode === "excerpt") reply = "Year-End Hot 100 is available in excerpt mode from the Top 10 source.";
  return finalize({ action, year: ctx.year, needsYear: action === "year_pick", followUps: buildFollowUps(ctx.year, capabilities), sessionPatch: sessionPatchFor(ctx, action), meta: { resolverMode: "execute", capabilities, requestedAction: action, routeCapability: capability, provenance: capabilities.provenance || {} }, reply });
}
module.exports = { resolveMusicIntent };
