"use strict";

const VERSION = "progressionTelemetry v1.1.1 RESPONSE-EXPANSION-AUDIT + FINAL-RENDER-TELEMETRY-HARDLOCK + PARALLEL-LANE-RECENCY";
const PROGRESSION_TELEMETRY_VERSION = "nyx.marion.progressionTelemetry/1.1";
const FINAL_RENDER_TELEMETRY_VERSION = "nyx.marion.finalRenderTelemetry/1.0";
const PARALLEL_LANE_RECENCY_VERSION = "nyx.marion.parallelLaneRecency/0.1";
const finalRenderTelemetryMod = (() => { try { return require("./finalRenderTelemetry.js"); } catch (_) { return null; } })();

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function hashText(value) { const s = safeStr(value).toLowerCase(); let h = 0; for (let i = 0; i < s.length; i += 1) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return String(h >>> 0); }
function isThinReply(value = "") { return /^\s*(continue|next|ok|done|proceed)\.?\s*$/i.test(safeStr(value)); }


function normalizeLaneRecencyTelemetry(value = {}) {
  const v = safeObj(value);
  const stale = safeArray(v.staleTracks || v.staleLanes).map(safeStr).filter(Boolean).slice(0, 8);
  const current = safeArray(v.currentTracks || v.activeTracks).map(safeStr).filter(Boolean).slice(0, 8);
  return {
    version: safeStr(v.version || PARALLEL_LANE_RECENCY_VERSION),
    active: !!(v.active || stale.length || current.length),
    currentTracks: current,
    previousTracks: safeArray(v.previousTracks).map(safeStr).filter(Boolean).slice(0, 8),
    staleTracks: stale,
    staleLanes: stale,
    staleCarrySuppressed: !!(v.staleCarrySuppressed || v.staleLaneCarrySuppressed || stale.length),
    noUserFacingDiagnostics: true
  };
}

function buildProgressionTelemetry({ profile = {}, memory = {}, text = "", reply = "", source = "progressionTelemetry", parallelLaneRecency = {} } = {}) {
  const p = safeObj(profile), m = safeObj(memory);
  const active = !!(p.active || m.active);
  const laneRecency = normalizeLaneRecencyTelemetry(parallelLaneRecency || m.parallelLaneRecency || p.parallelLaneRecency);
  const finalRenderTelemetry = finalRenderTelemetryMod && typeof finalRenderTelemetryMod.buildFinalRenderTelemetry === "function" ? safeObj(finalRenderTelemetryMod.buildFinalRenderTelemetry({source,reply,canEmit:!!reply,finalEnvelopeTrusted:false,progressionTelemetry:p,parallelLaneRecency:laneRecency})) : {};
  return {
    version: PROGRESSION_TELEMETRY_VERSION,
    source: safeStr(source),
    active,
    lane: safeStr(p.lane || m.lane || m.activePhase || "progression_shaping_refinement"),
    phaseKey: safeStr(p.phaseKey || m.phaseKey || m.currentStep || ""),
    phaseId: safeStr(p.phaseId || m.phaseId || ""),
    signal: safeStr(p.signal || m.lastUserIntent || ""),
    responseShape: safeStr(p.responseShape || m.responseShape || ""),
    pendingAction: safeStr(m.pendingAction || ""),
    thinReplyBlocked: active && isThinReply(reply),
    expectedPublicShape: active ? "expanded_concrete_action_plan" : "",
    parallelLaneRecency: laneRecency,
    staleLaneCarrySuppressed: laneRecency.staleCarrySuppressed === true,
    staleLanes: laneRecency.staleTracks,
    finalRenderTelemetry,
    finalRenderTelemetryActive: !!Object.keys(finalRenderTelemetry).length,
    publicSurfaceClean: safeObj(finalRenderTelemetry).publicSurfaceClean !== false,
    noUserFacingDiagnostics: true,
    userHash: text ? hashText(text) : safeStr(m.userHash || ""),
    replyHash: reply ? hashText(reply) : safeStr(m.replyHash || ""),
    updatedAt: Date.now()
  };
}

module.exports = { VERSION, PROGRESSION_TELEMETRY_VERSION, FINAL_RENDER_TELEMETRY_VERSION, PARALLEL_LANE_RECENCY_VERSION, normalizeLaneRecencyTelemetry, buildProgressionTelemetry, default: buildProgressionTelemetry };
