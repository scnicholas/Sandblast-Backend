"use strict";

const VERSION = "progressionMemory v1.0.0 FOUR-PHASE-CONTINUITY-CARRY";
const PROGRESSION_MEMORY_VERSION = "nyx.marion.progressionMemory/1.0";
const shape = require("./progressionShape.js");

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function firstText() { for (let i = 0; i < arguments.length; i += 1) { const v = safeStr(arguments[i]); if (v) return v; } return ""; }
function hashText(value) { const s = safeStr(value).toLowerCase(); let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }

function normalizeProgressionMemory(value = {}) {
  const v = safeObj(value);
  return {
    version: firstText(v.version, PROGRESSION_MEMORY_VERSION),
    active: !!v.active,
    activePhase: firstText(v.activePhase, v.lane, "progression_shaping_refinement"),
    currentStep: firstText(v.currentStep, v.phaseKey, "phase1"),
    phaseId: firstText(v.phaseId, ""),
    phaseLabel: firstText(v.phaseLabel, ""),
    lastUserIntent: firstText(v.lastUserIntent, v.signal, ""),
    lastSystemAction: firstText(v.lastSystemAction, ""),
    pendingAction: firstText(v.pendingAction, ""),
    responseShape: firstText(v.responseShape, "build_mode"),
    confidence: Number.isFinite(Number(v.confidence)) ? Math.max(0, Math.min(1, Number(v.confidence))) : 0,
    userHash: firstText(v.userHash, ""),
    replyHash: firstText(v.replyHash, ""),
    passFailState: firstText(v.passFailState, ""),
    noUserFacingDiagnostics: v.noUserFacingDiagnostics !== false,
    updatedAt: Number.isFinite(Number(v.updatedAt)) ? Number(v.updatedAt) : Date.now()
  };
}

function pendingActionFor(profile = {}, previous = {}) {
  const p = safeObj(profile), prev = safeObj(previous);
  if (!p.active) return "";
  if (p.signal === "pass") {
    if (p.phaseKey === "phase1") return "move_to_phase_2_continuity_memory";
    if (p.phaseKey === "phase2") return "move_to_phase_3_response_shaping";
    if (p.phaseKey === "phase3") return "move_to_phase_4_regression_telemetry";
    return "lock_progression_refinement_and_prepare_domain_confidence_scoring";
  }
  if (p.signal === "fail") return "patch_current_phase_and_rerun_validation";
  if (p.signal === "testing") return "run_progression_regression_validation";
  if (p.signal === "execution") return "apply_progression_patch_package";
  return firstText(prev.pendingAction, "give_one_concrete_next_action");
}

function updateProgressionMemory({ text = "", reply = "", previous = {}, context = {} } = {}) {
  const prev = normalizeProgressionMemory(previous);
  const profile = shape.buildProgressionProfile(text, { ...safeObj(context), progressionRefinement: prev });
  const active = !!(profile.active || prev.active);
  const next = normalizeProgressionMemory({
    active,
    activePhase: active ? "progression_shaping_refinement" : prev.activePhase,
    currentStep: profile.phaseKey || prev.currentStep,
    phaseId: profile.phaseId || prev.phaseId,
    phaseLabel: profile.phaseLabel || prev.phaseLabel,
    lastUserIntent: profile.signal || prev.lastUserIntent,
    lastSystemAction: profile.responseShape || prev.lastSystemAction,
    pendingAction: pendingActionFor(profile, prev),
    responseShape: profile.responseShape || prev.responseShape,
    confidence: profile.confidence || prev.confidence,
    userHash: text ? hashText(text) : prev.userHash,
    replyHash: reply ? hashText(reply) : prev.replyHash,
    passFailState: profile.signal === "pass" ? "passed" : (profile.signal === "fail" ? "failed" : prev.passFailState),
    noUserFacingDiagnostics: true,
    updatedAt: Date.now()
  });
  return { ...next, profile };
}

module.exports = { VERSION, PROGRESSION_MEMORY_VERSION, normalizeProgressionMemory, updateProgressionMemory, default: updateProgressionMemory };
