"use strict";
const assert = require("assert");
const shape = require("../Data/marion/runtime/progressionShape.js");
const policy = require("../Data/marion/runtime/progressionResponsePolicy.js");

const next = shape.buildProgressionProfile("Next steps", { progressionRefinement: { active: true, currentStep: "phase1" } });
assert.strictEqual(next.active, true);
assert.strictEqual(next.lane, "progression_shaping_refinement");
assert.strictEqual(next.signal, "next_steps");
assert.strictEqual(next.phaseKey, "phase1");

const pass = shape.buildProgressionProfile("Passed", { progressionRefinement: { active: true, currentStep: "phase2" } });
assert.strictEqual(pass.signal, "pass");
assert.strictEqual(pass.responseShape, "test_mode");

const failReply = policy.shapeProgressionReply({ text: "Failed", profile: shape.buildProgressionProfile("Failed", { progressionRefinement: { active: true, currentStep: "phase3" } }) });
assert(/needs repair/i.test(failReply));
assert(!/routeKind=|finalEnvelope|sessionPatch|diagnostic packet/i.test(failReply));

console.log("progression-shaping-refinement.test.js passed");
