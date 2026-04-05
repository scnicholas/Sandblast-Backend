"use strict";

const RESOLVER_VERSION = "musicResolver v2.0.0";
const YEAR_MIN = 1950;
const YEAR_MAX = 2025;
const LANE = "music";
const CHART_DEFAULT = "Billboard Hot 100";

let _musicKnowledge;

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

function safeStr(v) {
  return v == null ? "" : String(v);
}

function lower(v) {
  return safeStr(v).trim().toLowerCase();
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function normYear(v) {
  const m = typeof v === "number" ? String(v) : safeStr(v).match(/\b(19[5-9]\d|20[0-2]\d|2025)\b/);
  const y = typeof v === "number" ? v : m ? Number(m[1]) : NaN;
  return Number.isFinite(y) && y >= YEAR_MIN && y <= YEAR_MAX ? Math.trunc(y) : null;
}

function normalizeActionName(v) {
  const t = lower(v);
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
  if (/\bmicro\s*moment\b|\bmicro\b/.test(textLower)) return "micro_moment";
  if (/\bstory\s*moment\b|\bstory\b|\bmoment\b/.test(textLower)) return "story_moment";
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
    out.push({
      id: safeStr(item.id || key.replace(/\s+/g, "_")),
      type: safeStr(item.type || "action") || "action",
      label,
      payload: isObj(item.payload) ? item.payload : { lane: LANE, route: LANE, action: safeStr(item.action || label) || "top10" },
    });
    if (out.length >= 10) break;
  }
  return out;
}

function readCapabilities(input) {
  if (isObj(input.capabilities)) return input.capabilities;
  const knowledge = getMusicKnowledge();
  if (knowledge && typeof knowledge.getCapabilities === "function") {
    try {
      return knowledge.getCapabilities();
    } catch (_) {}
  }
  return {
    ok: false,
    lane: LANE,
    routes: {
      top10: { executable: false, mode: "none" },
      number1: { executable: false, mode: "none" },
      story_moment: { executable: false, mode: "none" },
      micro_moment: { executable: false, mode: "none" },
      yearend_hot100: { executable: false, mode: "none" },
    },
    provenance: {
      sourceOfMusicTruth: "unknown",
      storyMomentSource: "unknown",
      microMomentSource: "unknown",
    },
  };
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
  const year =
    normYear(inferred.year) ||
    normYear(policy && policy.inferredSlots && policy.inferredSlots.year) ||
    normYear(input.year) ||
    normYear(payload.year) ||
    normYear(text) ||
    normYear(session.lastMusicYear) ||
    normYear(session.lockedYear) ||
    normYear(session.year);
  const activeLane = safeStr(input.activeLane || session.activeLane || session.lane || "general") || "general";
  return {
    text,
    textLower,
    payload,
    session,
    policy,
    inferred,
    year,
    activeLane,
    action: explicitAction || policyAction || inferActionFromText(textLower),
  };
}

function routeCapability(action, capabilities) {
  const routes = isObj(capabilities && capabilities.routes) ? capabilities.routes : {};
  const route = isObj(routes[action]) ? routes[action] : { executable: false, mode: "none" };
  const prov = isObj(capabilities && capabilities.provenance) ? capabilities.provenance : {};
  let sourceTruth = prov.sourceOfMusicTruth || "unknown";
  let routeSource = sourceTruth;
  if (action === "story_moment") routeSource = prov.storyMomentSource || routeSource;
  if (action === "micro_moment") routeSource = prov.microMomentSource || routeSource;
  if (action === "number1") routeSource = "derived_from_top10";
  if (action === "yearend_hot100") {
    routeSource = prov.sourceOfMusicTruth && String(prov.sourceOfMusicTruth).includes("wikipedia/charts")
      ? "Data/wikipedia/charts/year_end_hot100_YYYY.json"
      : "top10_excerpt_from_top10_by_year_v1.json";
  }
  return {
    executable: !!route.executable,
    mode: safeStr(route.mode || (route.delegated ? "delegated" : route.executable ? "full" : "none")) || "none",
    sourceTruth,
    routeSource,
  };
}

function sessionPatchFor(ctx, action) {
  return {
    activeLane: LANE,
    lane: LANE,
    activeMusicMode: action === "year_pick" ? ctx.session.activeMusicMode || "top10" : action,
    lastMusicYear: ctx.year || null,
    year: ctx.year || null,
    lockedYear: ctx.year || null,
    activeMusicChart: CHART_DEFAULT,
    lastMusicChart: CHART_DEFAULT,
    resolverVersion: RESOLVER_VERSION,
  };
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
    prev,
    next,
    { id: "another_year", type: "action", label: "Another year", payload: { lane: LANE, route: LANE, action: "year_pick" } },
  ]);
}

function bridgeBlock(status, action, ctx, capability, reason) {
  return {
    ready: status === "execute",
    valid: status === "execute" || status === "clarify",
    lane: LANE,
    mode: action || null,
    year: ctx.year || null,
    sourceTruth: capability.sourceTruth || "unknown",
    routeSource: capability.routeSource || "unknown",
    capabilityMode: capability.mode || "none",
    executable: !!capability.executable,
    reason: safeStr(reason || ""),
  };
}

function normalizeExecutionPlan(action, ctx, capability) {
  const y = ctx.year || null;
  const plan = {
    action,
    year: y,
    mode: action,
    lane: LANE,
    chart: CHART_DEFAULT,
    executable: !!capability.executable,
    capabilityMode: capability.mode || "none",
    routeSource: capability.routeSource || "unknown",
    sourceTruth: capability.sourceTruth || "unknown",
    dataMethod: null,
    handlerMethod: "handleMusicTurn",
  };
  if (action === "top10") plan.dataMethod = "getTop10ByYear";
  else if (action === "number1") plan.dataMethod = "getNumberOneByYear";
  else if (action === "story_moment") plan.dataMethod = "handleStoryMoment";
  else if (action === "micro_moment") plan.dataMethod = "handleMicroMoment";
  else if (action === "yearend_hot100") plan.dataMethod = "getYearEndHot100ByYear";
  return plan;
}

function executeKnowledge(action, year, meta) {
  const knowledge = getMusicKnowledge();
  if (!knowledge) return null;
  try {
    const wantMeta = { meta: !!meta };
    if (action === "top10" && typeof knowledge.getTop10ByYear === "function") return knowledge.getTop10ByYear(year, wantMeta);
    if (action === "number1" && typeof knowledge.getNumberOneByYear === "function") return knowledge.getNumberOneByYear(year, wantMeta);
    if (action === "yearend_hot100" && typeof knowledge.getYearEndHot100ByYear === "function") return knowledge.getYearEndHot100ByYear(year, wantMeta);
    if (action === "story_moment" && typeof knowledge.handleStoryMoment === "function") return knowledge.handleStoryMoment(year, wantMeta);
    if (action === "micro_moment" && typeof knowledge.handleMicroMoment === "function") return knowledge.handleMicroMoment(year, wantMeta);
  } catch (error) {
    return { __resolverExecutionError: safeStr(error && error.message ? error.message : error) };
  }
  return null;
}

function finalize(payload) {
  return {
    ok: payload.ok !== false,
    source: "musicResolver",
    version: RESOLVER_VERSION,
    lane: LANE,
    action: payload.action || null,
    year: payload.year || null,
    status: safeStr(payload.status || "clarify") || "clarify",
    executable: !!payload.executable,
    needsYear: !!payload.needsYear,
    requiresExecution: payload.requiresExecution !== false,
    followUps: uniqFollowUps(payload.followUps),
    sessionPatch: isObj(payload.sessionPatch) ? payload.sessionPatch : {},
    bridge: isObj(payload.bridge)
      ? payload.bridge
      : bridgeBlock("blocked", payload.action || null, { year: payload.year || null }, { executable: false, mode: "none", sourceTruth: "unknown", routeSource: "unknown" }, "missing_bridge"),
    executionPlan: isObj(payload.executionPlan) ? payload.executionPlan : null,
    dataPreview: payload.dataPreview == null ? null : payload.dataPreview,
    meta: isObj(payload.meta) ? payload.meta : {},
    reply: safeStr(payload.reply || "").trim(),
  };
}

async function resolveMusicIntent(input = {}) {
  const ctx = makeContext(input);
  const capabilities = readCapabilities(input);
  let action = ctx.action;
  if (!action && ctx.year) action = "top10";
  const capability = routeCapability(action, capabilities);

  if (!action) {
    return finalize({
      action: null,
      year: ctx.year,
      status: "clarify",
      executable: false,
      needsYear: false,
      followUps: buildFollowUps(ctx.year, capabilities),
      sessionPatch: { activeLane: LANE, lane: LANE, activeMusicChart: CHART_DEFAULT, lastMusicChart: CHART_DEFAULT },
      bridge: bridgeBlock("clarify", null, ctx, capability, "missing_action"),
      meta: { resolverMode: "clarify", capabilities },
      reply: "Give me the music target and year and I will run it.",
    });
  }

  if (action !== "year_pick" && !ctx.year) {
    return finalize({
      action,
      year: null,
      status: "clarify",
      executable: false,
      needsYear: true,
      followUps: buildFollowUps(null, capabilities),
      sessionPatch: sessionPatchFor(ctx, action),
      bridge: bridgeBlock("clarify", action, ctx, capability, "missing_year"),
      meta: { resolverMode: "clarify_missing_year", capabilities },
      reply: "Give me the year and I will run it.",
    });
  }

  if (action === "year_pick") {
    return finalize({
      action,
      year: ctx.year,
      status: "clarify",
      executable: false,
      needsYear: true,
      followUps: buildFollowUps(ctx.year, capabilities),
      sessionPatch: sessionPatchFor(ctx, action),
      bridge: bridgeBlock("clarify", action, ctx, capability, "year_picker"),
      meta: { resolverMode: "year_picker", capabilities },
      reply: "Choose a year and I will run the lane.",
    });
  }

  if (!capability.executable) {
    return finalize({
      ok: false,
      action,
      year: ctx.year,
      status: "blocked",
      executable: false,
      needsYear: false,
      requiresExecution: false,
      followUps: buildFollowUps(ctx.year, capabilities),
      sessionPatch: sessionPatchFor(ctx, action),
      bridge: bridgeBlock("blocked", action, ctx, capability, "route_not_executable"),
      meta: { resolverMode: "capability_block", capabilities, requestedAction: action },
      reply: "That music path is not currently executable from the loaded sources.",
    });
  }

  const executionPlan = normalizeExecutionPlan(action, ctx, capability);
  const preview = executeKnowledge(action, ctx.year, true);
  const previewMeta = isObj(preview) && !preview.__resolverExecutionError
    ? {
        hasData: true,
        previewType: Array.isArray(preview.items) ? "items" : isObj(preview) ? "object" : typeof preview,
        itemCount: Array.isArray(preview.items) ? preview.items.length : null,
      }
    : {
        hasData: false,
        executionError: preview && preview.__resolverExecutionError ? preview.__resolverExecutionError : "preview_unavailable",
      };

  let reply = "Music target locked. Running the lane now.";
  if (action === "yearend_hot100" && capability.mode === "excerpt") {
    reply = "Year-End Hot 100 is available in excerpt mode from the Top 10 source.";
  }

  return finalize({
    action,
    year: ctx.year,
    status: "execute",
    executable: true,
    needsYear: false,
    followUps: buildFollowUps(ctx.year, capabilities),
    sessionPatch: sessionPatchFor(ctx, action),
    bridge: bridgeBlock("execute", action, ctx, capability, ""),
    executionPlan,
    dataPreview: preview && !preview.__resolverExecutionError ? preview : null,
    meta: {
      resolverMode: "execute",
      capabilities,
      requestedAction: action,
      routeCapability: capability,
      provenance: capabilities.provenance || {},
      executionPlan,
      preview: previewMeta,
    },
    reply,
  });
}

module.exports = {
  RESOLVER_VERSION,
  resolveMusicIntent,
};
