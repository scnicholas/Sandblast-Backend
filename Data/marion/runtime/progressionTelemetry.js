"use strict";

const VERSION = "progressionTelemetry v1.1.0 RESPONSE-EXPANSION-AUDIT";
const PROGRESSION_TELEMETRY_VERSION = "nyx.marion.progressionTelemetry/1.1";

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function hashText(value) { const s = safeStr(value).toLowerCase(); let h = 0; for (let i = 0; i < s.length; i += 1) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return String(h >>> 0); }
function isThinReply(value = "") { return /^\s*(continue|next|ok|done|proceed)\.?\s*$/i.test(safeStr(value)); }

function buildProgressionTelemetry({ profile = {}, memory = {}, text = "", reply = "", source = "progressionTelemetry" } = {}) {
  const p = safeObj(profile), m = safeObj(memory);
  const active = !!(p.active || m.active);
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
    noUserFacingDiagnostics: true,
    userHash: text ? hashText(text) : safeStr(m.userHash || ""),
    replyHash: reply ? hashText(reply) : safeStr(m.replyHash || ""),
    updatedAt: Date.now()
  };
}

module.exports = { VERSION, PROGRESSION_TELEMETRY_VERSION, buildProgressionTelemetry, default: buildProgressionTelemetry };
