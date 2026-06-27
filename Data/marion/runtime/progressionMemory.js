"use strict";

const VERSION = "progressionMemory v1.1.3 PRIORITY-9E-LAST-VALID-TASK-CARRY + KNOWLEDGE-QUESTION-BYPASS + RESPONSE-EXPANSION-CARRY-HARDLOCK + PARALLEL-LANE-STALE-CARRY";
const PROGRESSION_MEMORY_VERSION = "nyx.marion.progressionMemory/1.1";
const PARALLEL_LANE_RECENCY_VERSION = "nyx.marion.parallelLaneRecency/0.1";
const shape = require("./progressionShape.js");

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function firstText() { for (let i = 0; i < arguments.length; i += 1) { const v = safeStr(arguments[i]); if (v) return v; } return ""; }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback; }
function hashText(value) { const s = safeStr(value).toLowerCase(); let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }


function normalizeParallelLaneRecencyMemory(value = {}) {
  const v = safeObj(value);
  const stale = safeArray(v.staleTracks || v.staleLanes).map(safeStr).filter(Boolean).slice(0, 8);
  const current = safeArray(v.currentTracks || v.activeTracks).map(safeStr).filter(Boolean).slice(0, 8);
  return {
    version: firstText(v.version, PARALLEL_LANE_RECENCY_VERSION),
    active: !!(v.active || stale.length || current.length),
    currentTracks: current,
    previousTracks: safeArray(v.previousTracks).map(safeStr).filter(Boolean).slice(0, 8),
    staleTracks: stale,
    staleLanes: stale,
    staleCarrySuppressed: !!(v.staleCarrySuppressed || v.staleLaneCarrySuppressed || stale.length),
    noUserFacingDiagnostics: true,
    updatedAt: Number.isFinite(Number(v.updatedAt)) ? Number(v.updatedAt) : Date.now()
  };
}

function normalizeProgressionMemory(value = {}) {
  const v = safeObj(value);
  const active = !!v.active;
  const currentStep = firstText(v.currentStep, v.phaseKey, "phase3");
  const lastIntent = firstText(v.lastUserIntent, v.signal, v.lastSignal, "");
  return {
    version: firstText(v.version, PROGRESSION_MEMORY_VERSION),
    active,
    lane: active ? "progression_shaping_refinement" : firstText(v.lane, ""),
    activePhase: active ? "progression_shaping_refinement" : firstText(v.activePhase, ""),
    currentStep,
    phaseKey: currentStep,
    phaseId: firstText(v.phaseId, ""),
    phaseLabel: firstText(v.phaseLabel, ""),
    lastUserIntent: lastIntent,
    signal: lastIntent,
    lastSystemAction: firstText(v.lastSystemAction, ""),
    pendingAction: firstText(v.pendingAction, ""),
    responseShape: firstText(v.responseShape, "build_mode"),
    confidence: clamp01(v.confidence, active ? 0.72 : 0),
    userHash: firstText(v.userHash, ""),
    replyHash: firstText(v.replyHash, ""),
    passFailState: firstText(v.passFailState, ""),
    shallowReplyBlocked: !!v.shallowReplyBlocked,
    noUserFacingDiagnostics: v.noUserFacingDiagnostics !== false,
    lastValidTask: firstText(v.lastValidTask, v.lastTask, v.activeTask, ""),
    lastCompletedTask: firstText(v.lastCompletedTask, v.completedTask, ""),
    lastPendingTask: firstText(v.lastPendingTask, v.pendingTask, v.pendingAction, ""),
    lastContinuationIntent: firstText(v.lastContinuationIntent, ""),
    parallelLaneRecency: normalizeParallelLaneRecencyMemory(v.parallelLaneRecency || v.parallelLaneCarryMaintenance),
    updatedAt: Number.isFinite(Number(v.updatedAt)) ? Number(v.updatedAt) : Date.now()
  };
}

function pendingActionFor(profile = {}, previous = {}) {
  const p = safeObj(profile), prev = safeObj(previous);
  if (!p.active) return firstText(prev.pendingAction, "");
  if (p.signal === "pass") {
    if (p.phaseKey === "phase1") return "advance_to_phase_2_continuity_memory";
    if (p.phaseKey === "phase2") return "advance_to_phase_3_response_shaping";
    if (p.phaseKey === "phase3") return "advance_to_phase_4_regression_telemetry";
    return "lock_progression_refinement_and_prepare_domain_confidence_scoring";
  }
  if (p.signal === "fail") return "patch_response_shaping_expansion_and_rerun_next_steps_prompt";
  if (p.signal === "continue" || p.signal === "next_steps") return "return_expanded_next_action_plan";
  if (p.signal === "testing") return "run_progression_regression_validation";
  if (p.signal === "execution") return "apply_progression_patch_package";
  return firstText(prev.pendingAction, "give_one_concrete_next_action");
}

function updateProgressionMemory({ text = "", reply = "", previous = {}, context = {} } = {}) {
  const prev = normalizeProgressionMemory(previous);
  const profile = shape.buildProgressionProfile(text, { ...safeObj(context), progressionRefinement: prev });
  const knowledgeBypass = shape && typeof shape.isKnowledgeQuestionText === "function" ? shape.isKnowledgeQuestionText(text) : false;
  const active = knowledgeBypass ? false : !!(profile.active || prev.active);
  const shallow = active && /^\s*(continue|next|ok|done|run that again|do it again|same thing|repeat that)\.?\s*$/i.test(safeStr(reply));
  const next = normalizeProgressionMemory({
    active,
    lane: active ? "progression_shaping_refinement" : "",
    activePhase: active ? "progression_shaping_refinement" : "",
    currentStep: profile.phaseKey || prev.currentStep,
    phaseId: profile.phaseId || prev.phaseId,
    phaseLabel: profile.phaseLabel || prev.phaseLabel,
    lastUserIntent: active ? (profile.signal || prev.lastUserIntent) : "",
    lastSystemAction: profile.responseShape || prev.lastSystemAction,
    pendingAction: active ? pendingActionFor(profile, prev) : "",
    responseShape: profile.responseShape || prev.responseShape,
    confidence: profile.confidence || prev.confidence,
    userHash: text ? hashText(text) : prev.userHash,
    replyHash: reply ? hashText(reply) : prev.replyHash,
    passFailState: profile.signal === "pass" ? "passed" : (profile.signal === "fail" ? "failed" : prev.passFailState),
    shallowReplyBlocked: shallow || prev.shallowReplyBlocked,
    lastValidTask: active ? firstText(safeObj(context).lastValidTask, prev.lastValidTask, profile.phaseLabel, profile.phaseKey, "") : firstText(prev.lastValidTask, ""),
    lastCompletedTask: firstText(safeObj(context).lastCompletedTask, prev.lastCompletedTask, ""),
    lastPendingTask: active ? firstText(pendingActionFor(profile, prev), prev.lastPendingTask, prev.pendingAction, "") : firstText(prev.lastPendingTask, ""),
    lastContinuationIntent: shape && typeof shape.isPriority9EContinuationCommand === "function" && shape.isPriority9EContinuationCommand(text) ? safeStr(text) : firstText(prev.lastContinuationIntent, ""),
    noUserFacingDiagnostics: true,
    parallelLaneRecency: normalizeParallelLaneRecencyMemory(safeObj(context).parallelLaneRecency || safeObj(context).parallelLaneCarryMaintenance || safeObj(prev).parallelLaneRecency),
    updatedAt: Date.now()
  });
  return { ...next, profile };
}

const PRIORITY_9E_LAST_VALID_TASK_CARRY_VERSION = "nyx.marion.priority9e.lastValidTaskCarry/1.0";
function extractLastValidTaskCarry(value = {}) {
  const v = normalizeProgressionMemory(value);
  return {
    version: PRIORITY_9E_LAST_VALID_TASK_CARRY_VERSION,
    active: !!v.active,
    lane: v.lane,
    lastValidTask: firstText(v.lastValidTask, v.phaseLabel, v.phaseKey),
    lastCompletedTask: v.lastCompletedTask,
    lastPendingTask: firstText(v.lastPendingTask, v.pendingAction),
    lastContinuationIntent: v.lastContinuationIntent,
    noUserFacingDiagnostics: true
  };
}
module.exports = { VERSION, PROGRESSION_MEMORY_VERSION, PARALLEL_LANE_RECENCY_VERSION, PRIORITY_9E_LAST_VALID_TASK_CARRY_VERSION, normalizeParallelLaneRecencyMemory, normalizeProgressionMemory, pendingActionFor, updateProgressionMemory, extractLastValidTaskCarry, default: updateProgressionMemory };
