"use strict";

const assert = require("assert");
const shape = require("../Data/marion/runtime/progressionShape.js");
const memory = require("../Data/marion/runtime/progressionMemory.js");
const policy = require("../Data/marion/runtime/progressionResponsePolicy.js");
const telemetry = require("../Data/marion/runtime/progressionTelemetry.js");

const prior = memory.normalizeProgressionMemory({
  active: true,
  activePhase: "progression_shaping_refinement",
  currentStep: "phase3",
  phaseId: "PHASE_3_RESPONSE_SHAPING",
  phaseLabel: "Phase 3: Response shaping rules",
  lastUserIntent: "next_steps",
  pendingAction: "return_expanded_next_action_plan"
});

const profile = shape.buildProgressionProfile("next steps", { progressionRefinement: prior });
assert.strictEqual(profile.active, true);
assert.strictEqual(profile.signal, "next_steps");
assert.strictEqual(profile.phaseKey, "phase3");

const shaped = policy.shapeProgressionReply({ reply: "Continue.", text: "next steps", profile, memory: prior });
assert(!/^\s*Continue\.?\s*$/i.test(shaped), "policy must not return one-word Continue");
assert(/response-expansion|concrete action plan|next steps/i.test(shaped), "policy must return an expanded next-action plan");

const nextMemory = memory.updateProgressionMemory({ text: "next steps", reply: shaped, previous: prior });
assert.strictEqual(nextMemory.active, true);
assert.strictEqual(nextMemory.pendingAction, "return_expanded_next_action_plan");

const audit = telemetry.buildProgressionTelemetry({ profile, memory: nextMemory, text: "next steps", reply: "Continue.", source: "test" });
assert.strictEqual(audit.thinReplyBlocked, true);
console.log("progression response expansion hardlock passed");
