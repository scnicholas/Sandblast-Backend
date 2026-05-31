"use strict";

const VERSION = "progressionResponsePolicy v1.1.0 THIN-REPLY-BLOCKING-HARDLOCK";
const RESPONSE_POLICY_VERSION = "nyx.marion.progressionResponsePolicy/1.1";
const shape = require("./progressionShape.js");

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

function nextPhaseLabel(phaseKey = "") {
  if (phaseKey === "phase1") return "Phase 2: Progression memory and continuity";
  if (phaseKey === "phase2") return "Phase 3: Response shaping rules";
  if (phaseKey === "phase3") return "Phase 4: Regression tests and telemetry";
  return "Domain confidence scoring prelock";
}

function validationForPhase(phaseKey = "") {
  if (phaseKey === "phase1") return "run the signal prompts: next steps, continue, passed, failed, and what now. Each must classify without broad clarification.";
  if (phaseKey === "phase2") return "confirm activePhase, currentStep, lastUserIntent, lastSystemAction, pendingAction, and pass/fail state carry into State Spine.";
  if (phaseKey === "phase3") return "verify response expansion: next steps must return an action plan, passed must advance, failed must diagnose, and continue must preserve the current lane.";
  return "run the progression-shaping, continuity-smoke, and mic/text parity progression tests.";
}

function isThinProgressionReply(value = "") {
  return /^\s*(continue|next|ok|done|proceed)\.?\s*$/i.test(safeStr(value));
}

function expandedNextAction(phaseKey = "") {
  return `${validationForPhase(phaseKey)} If that passes, mark it Passed; if it fails, send the first bad reply so the response-shaping layer can be patched without resetting the lane.`;
}

function shapeProgressionReply({ reply = "", text = "", profile = {}, memory = {} } = {}) {
  const p = safeObj(profile).active ? safeObj(profile) : shape.buildProgressionProfile(text, { progressionRefinement: memory });
  if (!p.active) return safeStr(reply);
  const phase = p.phaseLabel || "Progression shaping refinement";
  const phaseKey = p.phaseKey || p.currentStep || "phase3";
  const signal = p.signal || p.lastUserIntent || "unknown";
  if (signal === "pass") return `${phase} passed. Lock the result, preserve progressionRefinement in memoryPatch/stateBridge, then move to ${nextPhaseLabel(phaseKey)}.`;
  if (signal === "fail") return `${phase} needs repair. The critical issue is response shaping did not expand the public answer. Patch the current phase, rerun the same prompt, and do not advance until “next steps” returns a concrete action plan.`;
  if (signal === "next_steps" || signal === "continue" || signal === "unknown") return `${phase}: ${expandedNextAction(phaseKey)}`;
  if (signal === "testing") return `${phase}: run the validation now. Expected result: active lane stays progression_shaping_refinement, the public reply gives one concrete next action, and no diagnostic or broad clarification language reaches the user surface.`;
  if (signal === "execution") return `${phase}: apply the patch beside the active Marion runtime files, carry progressionRefinement through memoryPatch and stateBridge, then run node --check on composeMarionResponse.js, marionBridge.js, stateSpine.js, and the progression modules.`;
  if (signal === "clarification") return `${phase} means Marion detects the current build moment, remembers the active phase, shapes the reply for that state, and validates the behavior with regression telemetry.`;
  if (isThinProgressionReply(reply)) return `${phase}: ${expandedNextAction(phaseKey)}`;
  return safeStr(reply) || `${phase}: ${expandedNextAction(phaseKey)}`;
}

module.exports = { VERSION, RESPONSE_POLICY_VERSION, shapeProgressionReply, validationForPhase, nextPhaseLabel, isThinProgressionReply, default: shapeProgressionReply };
