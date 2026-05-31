"use strict";
const assert = require("assert");
const memory = require("../Data/marion/runtime/progressionMemory.js");
const stateSpine = require("../Utils/stateSpine.js");

const first = memory.updateProgressionMemory({ text: "Next steps", previous: { active: true, currentStep: "phase1" } });
assert.strictEqual(first.active, true);
assert.strictEqual(first.activePhase, "progression_shaping_refinement");
assert.strictEqual(first.currentStep, "phase1");
assert.strictEqual(first.lastUserIntent, "next_steps");
assert(first.pendingAction);

const normalized = stateSpine.normalizeProgressionRefinementCarry(first);
assert.strictEqual(normalized.active, true);
assert.strictEqual(normalized.currentStep, "phase1");
assert.strictEqual(normalized.noUserFacingDiagnostics, true);

console.log("progression-continuity-smoke.test.js passed");
