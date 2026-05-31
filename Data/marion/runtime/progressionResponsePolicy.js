"use strict";

const VERSION = "progressionResponsePolicy v1.0.0 FOUR-PHASE-RESPONSE-SHAPING";
const RESPONSE_POLICY_VERSION = "nyx.marion.progressionResponsePolicy/1.0";
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
  if (phaseKey === "phase1") return "Confirm 'Next steps', 'continue', 'passed', and 'failed' are classified without broad clarification.";
  if (phaseKey === "phase2") return "Confirm activePhase, currentStep, lastUserIntent, lastSystemAction, and pendingAction carry into State Spine.";
  if (phaseKey === "phase3") return "Confirm public replies switch between build, test, recovery, strategy, and summary mode.";
  return "Run the progression-shaping, continuity-smoke, and mic/text parity progression tests.";
}

function shapeProgressionReply({ reply = "", text = "", profile = {}, memory = {} } = {}) {
  const p = safeObj(profile).active ? safeObj(profile) : shape.buildProgressionProfile(text, { progressionRefinement: memory });
  if (!p.active) return safeStr(reply);
  const phase = p.phaseLabel || "Progression shaping refinement";
  if (p.signal === "pass") return `${phase} passed. Lock the result, preserve the progression memory carry, then move to ${nextPhaseLabel(p.phaseKey)}.`;
  if (p.signal === "fail") return `${phase} needs repair. Patch the current phase first, rerun the matching smoke test, and do not advance until the same prompt returns the correct response shape.`;
  if (p.signal === "next_steps" || p.signal === "continue" || p.signal === "unknown") return `${phase}: next action is ${validationForPhase(p.phaseKey)} After that, mark the result as Passed or Failed so Marion can advance without resetting the lane.`;
  if (p.signal === "testing") return `${phase}: run the validation now. Expected result: the active lane remains progression_shaping_refinement, the reply gives one concrete next action, and no diagnostic or broad clarification language reaches the public surface.`;
  if (p.signal === "execution") return `${phase}: apply the patch as a runtime-adjacent module, carry the progressionRefinement object through memoryPatch/sessionPatch, then run node --check on the touched files.`;
  if (p.signal === "clarification") return `${phase} means Marion detects the user’s current build moment, remembers the active phase, shapes the reply for that state, and validates it with regression telemetry.`;
  return safeStr(reply) || `${phase}: continue with one concrete validation step.`;
}

module.exports = { VERSION, RESPONSE_POLICY_VERSION, shapeProgressionReply, validationForPhase, nextPhaseLabel, default: shapeProgressionReply };
